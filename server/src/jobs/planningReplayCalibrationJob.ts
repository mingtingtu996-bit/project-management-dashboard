import { logger } from '../middleware/logger.js'
import { withDatabaseTransaction, type DatabaseTransactionOptions } from '../database.js'
import { listActiveProjectIds } from '../services/activeProjectService.js'
import { executeSQL } from '../services/dbService.js'
import { runJobWithRetry, runWithJobLease } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'
import { requireCompletePlanningReplayCalibration } from '../services/scheduledDurationJobResultPolicyService.js'
import {
  evaluatePlanningReplayCalibration,
  persistPlanningReplayCalibrationReport,
  type PlanningReplayCalibrationSample,
} from '../services/planningReplayCalibrationService.js'
import { inclusiveDurationDays } from '../utils/durationDays.js'

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export type PlanningReplayCalibrationSampleProvider = (projectId: string) => Promise<PlanningReplayCalibrationSample[]>

export type PlanningReplayCalibrationJobResult = {
  scannedProjects: number
  completedReports: number
  failedReports: number
  sampleCount: number
  readyGroupCount: number
  blockedGroupCount: number
  rejectedSampleCount: number
  persistedGroupCount: number
  persistedReplayResultCount: number
  persistenceFailedGroupCount: number
  factWritesBlocked: number
  seedWritesBlocked: number
}

export type PlanningReplayCalibrationSweepInput = {
  projectIds?: string[] | null
  minAcceptedSamplesPerProcess?: number
  maxOvercompensationRate?: number
  minMaeImprovement?: number
  writeReports?: boolean
  sampleProvider?: PlanningReplayCalibrationSampleProvider
  signal?: AbortSignal
}

export type PlanningReplayCalibrationJobOptions = {
  sweep?: (params?: PlanningReplayCalibrationSweepInput) => Promise<PlanningReplayCalibrationJobResult>
  withTransaction?: <T>(work: () => Promise<T>, options?: DatabaseTransactionOptions) => Promise<T>
  leaseRunner?: typeof runWithJobLease
}

function emptyResult(): PlanningReplayCalibrationJobResult {
  return {
    scannedProjects: 0,
    completedReports: 0,
    failedReports: 0,
    sampleCount: 0,
    readyGroupCount: 0,
    blockedGroupCount: 0,
    rejectedSampleCount: 0,
    persistedGroupCount: 0,
    persistedReplayResultCount: 0,
    persistenceFailedGroupCount: 0,
    factWritesBlocked: 0,
    seedWritesBlocked: 0,
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Planning replay calibration aborted')
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return {}
}

function parseDateOnly(value: unknown) {
  const text = normalizeText(value).slice(0, 10)
  if (!text) return null
  const date = new Date(`${text}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function durationBetween(start: unknown, end: unknown) {
  const startDate = parseDateOnly(start)
  const endDate = parseDateOnly(end)
  if (!startDate || !endDate) return null
  return inclusiveDurationDays(startDate, endDate)
}

function readNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readReplayPrediction(metadata: unknown, fallback: number) {
  const record = readRecord(metadata)
  const context = readRecord(record.algorithm_context)
  return readNumber(context.replay_prediction_days)
    ?? readNumber(context.replay_prediction)
    ?? readNumber(context.e3_calendarized_duration_days)
    ?? readNumber(context.target_progress_readiness_target)
    ?? readNumber(context.target_progress_capacity_allocatable_target)
    ?? readNumber(record.replay_prediction_days)
    ?? fallback
}

function buildSqlPlaceholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ')
}

function sortDateKey(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

type BaselineItemReplayRow = {
  id?: string | null
  project_id?: string | null
  baseline_version_id?: string | null
  source_task_id?: string | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  engineering_category_id?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  generation_metadata?: unknown
}

type TaskActualReplayRow = {
  id?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
  updated_at?: string | null
}

type MonthlyPlanReplayRow = {
  id?: string | null
  closeout_at?: string | null
  confirmed_at?: string | null
  updated_at?: string | null
}

type MonthlyPlanItemReplayRow = {
  id?: string | null
  project_id?: string | null
  monthly_plan_version_id?: string | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  engineering_category_id?: string | null
  current_progress?: number | string | null
  target_progress?: number | string | null
  generation_metadata?: unknown
}

async function collectBaselineReplayRows(projectId: string) {
  const baselines = await executeSQL<{ id?: string | null }>(
    `SELECT id FROM task_baselines WHERE project_id = ? AND status IN ('confirmed', 'archived', 'closed') LIMIT 500`,
    [projectId],
  )
  const baselineIds = baselines.map((row) => normalizeText(row.id)).filter(Boolean)
  if (baselineIds.length === 0) return []

  const baselineItems = await executeSQL<BaselineItemReplayRow>(
    `SELECT id, project_id, baseline_version_id, source_task_id, standard_work_code, standard_work_name, engineering_category_id, planned_start_date, planned_end_date, generation_metadata
     FROM task_baseline_items
     WHERE project_id = ? AND baseline_version_id IN (${buildSqlPlaceholders(baselineIds.length)})
     LIMIT 500`,
    [projectId, ...baselineIds],
  )
  const taskIds = Array.from(new Set(baselineItems.map((row) => normalizeText(row.source_task_id)).filter(Boolean)))
  if (taskIds.length === 0) return []

  const tasks = await executeSQL<TaskActualReplayRow>(
    `SELECT id, actual_start_date, actual_end_date, updated_at FROM tasks WHERE id IN (${buildSqlPlaceholders(taskIds.length)}) AND actual_end_date IS NOT NULL LIMIT 500`,
    taskIds,
  )
  const tasksById = new Map(tasks.map((task) => [normalizeText(task.id), task]))

  return baselineItems
    .map((item) => {
      const task = tasksById.get(normalizeText(item.source_task_id))
      if (!task) return null
      return {
        sample_id: `baseline:${normalizeText(item.id)}`,
        project_id: item.project_id,
        standard_work_code: item.standard_work_code,
        standard_work_name: item.standard_work_name,
        engineering_category_id: item.engineering_category_id,
        planned_start_date: item.planned_start_date,
        planned_end_date: item.planned_end_date,
        generation_metadata: item.generation_metadata,
        actual_start_date: task.actual_start_date,
        actual_end_date: task.actual_end_date,
        sort_at: sortDateKey(task.actual_end_date, item.planned_end_date, task.updated_at),
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((left, right) => right.sort_at.localeCompare(left.sort_at))
    .slice(0, 500)
}

async function collectMonthlyReplayRows(projectId: string) {
  const plans = await executeSQL<MonthlyPlanReplayRow>(
    `SELECT id, closeout_at, confirmed_at, updated_at FROM monthly_plans WHERE project_id = ? AND status IN ('confirmed', 'closed', 'archived') LIMIT 500`,
    [projectId],
  )
  const planIds = plans.map((row) => normalizeText(row.id)).filter(Boolean)
  if (planIds.length === 0) return []

  const planSortById = new Map(plans.map((plan) => [
    normalizeText(plan.id),
    sortDateKey(plan.closeout_at, plan.confirmed_at, plan.updated_at),
  ]))
  const rows = await executeSQL<MonthlyPlanItemReplayRow>(
    `SELECT id, project_id, monthly_plan_version_id, standard_work_code, standard_work_name, engineering_category_id, current_progress, target_progress, generation_metadata
     FROM monthly_plan_items
     WHERE project_id = ? AND monthly_plan_version_id IN (${buildSqlPlaceholders(planIds.length)}) AND current_progress IS NOT NULL AND target_progress IS NOT NULL
     LIMIT 500`,
    [projectId, ...planIds],
  )

  return rows
    .map((row) => ({
      sample_id: `monthly:${normalizeText(row.id)}`,
      project_id: row.project_id,
      standard_work_code: row.standard_work_code,
      standard_work_name: row.standard_work_name,
      engineering_category_id: row.engineering_category_id,
      current_progress: row.current_progress,
      target_progress: row.target_progress,
      generation_metadata: row.generation_metadata,
      sort_at: planSortById.get(normalizeText(row.monthly_plan_version_id)) ?? '',
    }))
    .sort((left, right) => right.sort_at.localeCompare(left.sort_at))
    .slice(0, 500)
}

async function defaultPlanningReplayCalibrationSampleProvider(projectId: string): Promise<PlanningReplayCalibrationSample[]> {
  const [baselineRows, monthlyRows] = await Promise.all([
    collectBaselineReplayRows(projectId),
    collectMonthlyReplayRows(projectId),
  ])

  const baselineSamples = baselineRows.flatMap((row): PlanningReplayCalibrationSample[] => {
    const originalPrediction = durationBetween(row.planned_start_date, row.planned_end_date)
    const actual = durationBetween(row.actual_start_date, row.actual_end_date)
    if (originalPrediction == null || actual == null) return []
    return [{
      sampleId: normalizeText(row.sample_id),
      projectId: normalizeText(row.project_id) || projectId,
      surface: 'baseline_generation',
      standardWorkCode: normalizeText(row.standard_work_code) || null,
      standardWorkName: normalizeText(row.standard_work_name) || null,
      engineeringCategoryId: normalizeText(row.engineering_category_id) || null,
      originalPrediction,
      actual,
      replayPrediction: readReplayPrediction(row.generation_metadata, originalPrediction),
    }]
  })

  const monthlySamples = monthlyRows.flatMap((row): PlanningReplayCalibrationSample[] => {
    const originalPrediction = readNumber(row.target_progress)
    const actual = readNumber(row.current_progress)
    if (originalPrediction == null || actual == null) return []
    return [{
      sampleId: normalizeText(row.sample_id),
      projectId: normalizeText(row.project_id) || projectId,
      surface: 'monthly_plan_generation',
      standardWorkCode: normalizeText(row.standard_work_code) || null,
      standardWorkName: normalizeText(row.standard_work_name) || null,
      engineeringCategoryId: normalizeText(row.engineering_category_id) || null,
      originalPrediction,
      actual,
      replayPrediction: readReplayPrediction(row.generation_metadata, originalPrediction),
    }]
  })

  return [...baselineSamples, ...monthlySamples]
}

export async function runPlanningReplayCalibrationSweep(
  params: PlanningReplayCalibrationSweepInput = {},
): Promise<PlanningReplayCalibrationJobResult> {
  throwIfAborted(params.signal)
  const projectIds = await listActiveProjectIds(params.projectIds)
  throwIfAborted(params.signal)
  const sampleProvider = params.sampleProvider ?? defaultPlanningReplayCalibrationSampleProvider
  const result = emptyResult()
  const runKey = `planning-replay-${Date.now()}`

  for (const projectId of projectIds) {
    throwIfAborted(params.signal)
    result.scannedProjects += 1
    try {
      const samples = await sampleProvider(projectId)
      throwIfAborted(params.signal)
      const report = evaluatePlanningReplayCalibration({
        projectId,
        samples,
        minAcceptedSamplesPerProcess: params.minAcceptedSamplesPerProcess ?? 5,
        maxOvercompensationRate: params.maxOvercompensationRate,
        minMaeImprovement: params.minMaeImprovement,
        rollbackTarget: `${runKey}:${projectId}`,
        conflictFree: true,
      })

      result.completedReports += 1
      result.sampleCount += samples.length
      result.readyGroupCount += report.groups.filter((group) => group.sampleGate === 'passed' && group.suggestions.length > 0).length
      result.blockedGroupCount += report.groups.filter((group) => group.sampleGate === 'blocked').length
      result.rejectedSampleCount += report.rejectedSamples.length
      if (!report.mutationPolicy.writesFactsDirectly) result.factWritesBlocked += 1
      if (!report.mutationPolicy.writesSeedsDirectly) result.seedWritesBlocked += 1

      if (params.writeReports !== false) {
        const persistence = await persistPlanningReplayCalibrationReport({
          report,
          runKey: `${runKey}:${projectId}`,
        })
        throwIfAborted(params.signal)
        result.persistedGroupCount += persistence.persistedGroupCount
        result.persistedReplayResultCount += persistence.persistedReplayResultCount
        result.persistenceFailedGroupCount += persistence.failedGroupCount
      }
    } catch (error) {
      throwIfAborted(params.signal)
      result.failedReports += 1
      logger.warn('[planningReplayCalibrationJob] project planning replay calibration failed', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  throwIfAborted(params.signal)
  return result
}

export class PlanningReplayCalibrationJob {
  private isRunning = false
  private activeTransactionCallbackCount = 0
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer: PersistentWallClockJobTimer

  constructor(private readonly options: PlanningReplayCalibrationJobOptions = {}) {
    this.wallClockTimer = new PersistentWallClockJobTimer({
      jobName: 'planningReplayCalibrationJob',
      schedule: { kind: 'daily', hour: 6, minute: 45 },
      execute: () => this.execute('scheduler'),
      onScheduled: ({ nextRun, delayMs }) => {
        this.nextRun = nextRun
        logger.info('planningReplayCalibrationJob scheduled', {
          nextRun: nextRun.toISOString(),
          trigger: 'daily_06_45',
          initialDelay: delayMs,
        })
      },
      onError: (error) => logger.error('planningReplayCalibrationJob scheduler failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    })
  }

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('planningReplayCalibrationJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
  }

  getStatus() {
    return {
      isRunning: this.isRunning || this.activeTransactionCallbackCount > 0,
      isScheduled: this.wallClockTimer.getStatus().isScheduled,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
    }
  }

  async executeNow(projectIds?: string[] | null) {
    return this.execute('manual', projectIds)
  }

  async execute(trigger: 'manual' | 'scheduler' = 'manual', projectIds?: string[] | null) {
    if (this.isRunning || this.activeTransactionCallbackCount > 0) {
      logger.warn('planningReplayCalibrationJob execution skipped because a previous run is still active', { trigger })
      return null
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      const sweep = this.options.sweep ?? runPlanningReplayCalibrationSweep
      const withTransaction = this.options.withTransaction ?? withDatabaseTransaction
      const leaseRunner = this.options.leaseRunner ?? runWithJobLease
      const { attempts, value: leaseRun } = await runJobWithRetry(
        {
          jobName: 'planningReplayCalibrationJob',
          jobId,
          triggeredBy: trigger,
        },
        async (_attempt, attemptContext) => leaseRunner(
          {
            jobName: 'planningReplayCalibrationJob',
            jobId,
          },
          async (lease) => {
            this.activeTransactionCallbackCount += 1
            const signal = AbortSignal.any([attemptContext.signal, lease.signal])
            try {
              lease.assertActive()
              const value = await withTransaction(async () => {
                throwIfAborted(signal)
                const result = await sweep({
                  projectIds: Array.isArray(projectIds) ? projectIds : null,
                  signal,
                })
                throwIfAborted(signal)
                lease.assertActive()
                return requireCompletePlanningReplayCalibration(result)
              }, { signal })
              lease.assertActive()
              return value
            } finally {
              this.activeTransactionCallbackCount = Math.max(0, this.activeTransactionCallbackCount - 1)
            }
          },
        ),
      )
      if (!leaseRun.acquired) {
        logger.warn('planningReplayCalibrationJob skipped because distributed lease was not acquired', {
          trigger,
          jobId,
          reason: 'lease_not_acquired',
        })
        return { skipped: true as const, reason: 'lease_not_acquired' as const }
      }
      const { value } = leaseRun
      this.lastRun = new Date()
      logger.info('planningReplayCalibrationJob completed', { trigger, jobId, attempts, ...value })
      return value
    } finally {
      this.isRunning = false
    }
  }
}

export const planningReplayCalibrationJob = new PlanningReplayCalibrationJob()
