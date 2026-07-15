import { logger } from '../middleware/logger.js'
import { listActiveProjectIds } from '../services/activeProjectService.js'
import { executeSQL } from '../services/dbService.js'
import {
  evaluateAndPersistAlgorithmAssetForecastResidualOverlay,
  type AlgorithmAssetForecastResidualSample,
} from '../services/algorithmAssetForecastResidualOverlayService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'

const DAY_IN_MS = 24 * 60 * 60 * 1000
const DEFAULT_MAX_SAMPLES_PER_PROJECT = 200
const DEFAULT_MIN_ACCEPTED_SAMPLES = 5
const DEFAULT_MIN_COMPANY_ACCEPTED_SAMPLES = 10

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function currentRunDate() {
  return new Date().toISOString().slice(0, 10)
}

function dateKey(value: unknown) {
  return normalizeText(value).slice(0, 10)
}

function parseDateKey(value: unknown) {
  const text = dateKey(value)
  if (!text) return null
  const date = new Date(`${text}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function addDaysToDateKey(value: unknown, days: number) {
  const date = parseDateKey(value)
  if (!date) return null
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function diffDays(left: unknown, right: unknown) {
  const leftDate = parseDateKey(left)
  const rightDate = parseDateKey(right)
  if (!leftDate || !rightDate) return null
  return Math.round((leftDate.getTime() - rightDate.getTime()) / DAY_IN_MS)
}

function buildSqlPlaceholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ')
}

type ForecastResidualOverlaySampleRow = {
  sample_id?: string | null
  company_id?: string | null
  project_id?: string | null
  original_forecast_finish_date?: string | null
  overlay_forecast_finish_date?: string | null
  actual_finish_date?: string | null
}

type ProjectCompanyRow = {
  id?: string | null
  company_id?: string | null
}

type CompletedTaskForecastSampleRow = {
  id?: string | null
  project_id?: string | null
  actual_end_date?: string | null
  updated_at?: string | null
}

type TaskDurationForecastSampleRow = {
  task_id?: string | null
  forecast_finish_date?: string | null
  generated_at?: string | null
}

export type ForecastResidualOverlayProductionJobResult = {
  scannedProjects: number
  sampledProjects: number
  sampleCount: number
  persistedOverlayCount: number
  runtimePublishableOverlayCount: number
  skippedForInsufficientSamples: number
  failedProjects: number
}

function emptyResult(): ForecastResidualOverlayProductionJobResult {
  return {
    scannedProjects: 0,
    sampledProjects: 0,
    sampleCount: 0,
    persistedOverlayCount: 0,
    runtimePublishableOverlayCount: 0,
    skippedForInsufficientSamples: 0,
    failedProjects: 0,
  }
}

function sortAtForForecast(forecast: TaskDurationForecastSampleRow, task: CompletedTaskForecastSampleRow) {
  return normalizeText(forecast.generated_at)
    || normalizeText(task.actual_end_date)
    || normalizeText(task.updated_at)
}

function rowToSample(row: ForecastResidualOverlaySampleRow): AlgorithmAssetForecastResidualSample | null {
  const sampleId = normalizeText(row.sample_id)
  const originalForecastFinishDate = normalizeText(row.original_forecast_finish_date)
  const overlayForecastFinishDate = normalizeText(row.overlay_forecast_finish_date)
  const actualFinishDate = normalizeText(row.actual_finish_date)
  if (!sampleId || !originalForecastFinishDate || !overlayForecastFinishDate || !actualFinishDate) return null
  return {
    sampleId,
    companyId: normalizeText(row.company_id) || null,
    projectId: normalizeText(row.project_id) || null,
    originalForecastFinishDate,
    overlayForecastFinishDate,
    actualFinishDate,
  }
}

async function collectForecastResidualOverlaySamples(projectId: string, limit: number) {
  const [project] = await executeSQL<ProjectCompanyRow>(
    'SELECT id, company_id FROM projects WHERE id = ? LIMIT 1',
    [projectId],
  )
  const companyId = normalizeText(project?.company_id) || null
  const completedTasks = await executeSQL<CompletedTaskForecastSampleRow>(
    'SELECT id, project_id, actual_end_date, updated_at FROM tasks WHERE project_id = ? AND actual_end_date IS NOT NULL LIMIT ?',
    [projectId, limit * 4],
  )
  const taskIds = Array.from(new Set(completedTasks.map((task) => normalizeText(task.id)).filter(Boolean)))
  if (taskIds.length === 0) return []

  const forecasts = await executeSQL<TaskDurationForecastSampleRow>(
    `SELECT task_id, forecast_finish_date, generated_at FROM task_duration_forecasts WHERE task_id IN (${buildSqlPlaceholders(taskIds.length)}) AND forecast_finish_date IS NOT NULL LIMIT ?`,
    [...taskIds, Math.max(limit * 4, limit)],
  )
  const tasksById = new Map(completedTasks.map((task) => [normalizeText(task.id), task]))
  const completedForecasts = forecasts
    .map((forecast) => {
      const task = tasksById.get(normalizeText(forecast.task_id))
      if (!task) return null
      const residualDays = diffDays(task.actual_end_date, forecast.forecast_finish_date)
      const originalForecastFinishDate = dateKey(forecast.forecast_finish_date)
      const actualFinishDate = dateKey(task.actual_end_date)
      if (residualDays == null || !originalForecastFinishDate || !actualFinishDate) return null
      return {
        task,
        forecast,
        residualDays,
        originalForecastFinishDate,
        actualFinishDate,
        sortAt: sortAtForForecast(forecast, task),
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
  if (completedForecasts.length === 0) return []

  const meanResidualDays = Math.round(
    completedForecasts.reduce((sum, row) => sum + row.residualDays, 0) / completedForecasts.length,
  )
  const rows = completedForecasts
    .sort((left, right) => normalizeText(right.sortAt).localeCompare(normalizeText(left.sortAt)))
    .map((row): ForecastResidualOverlaySampleRow | null => {
      const taskId = normalizeText(row.forecast.task_id) || normalizeText(row.task.id)
      const sampleAnchor = normalizeText(row.forecast.generated_at)
        || normalizeText(row.task.updated_at)
        || normalizeText(row.task.actual_end_date)
      const overlayForecastFinishDate = addDaysToDateKey(row.originalForecastFinishDate, meanResidualDays)
      if (!taskId || !sampleAnchor || !overlayForecastFinishDate) return null
      return {
        sample_id: `${taskId}:${sampleAnchor}`,
        company_id: companyId,
        project_id: normalizeText(row.task.project_id) || projectId,
        original_forecast_finish_date: row.originalForecastFinishDate,
        overlay_forecast_finish_date: overlayForecastFinishDate,
        actual_finish_date: row.actualFinishDate,
      }
    })
    .filter((row): row is ForecastResidualOverlaySampleRow => row !== null)
    .slice(0, limit)

  return rows.map(rowToSample).filter((sample): sample is AlgorithmAssetForecastResidualSample => sample !== null)
}

export async function runForecastResidualOverlayProductionSweep(params: {
  projectIds?: string[] | null
  minAcceptedSamples?: number
  minCompanyAcceptedSamples?: number
  maxSamplesPerProject?: number
  runDate?: string | null
} = {}): Promise<ForecastResidualOverlayProductionJobResult> {
  const projectIds = await listActiveProjectIds(params.projectIds)
  const result = emptyResult()
  const minAcceptedSamples = params.minAcceptedSamples ?? DEFAULT_MIN_ACCEPTED_SAMPLES
  const minCompanyAcceptedSamples = params.minCompanyAcceptedSamples ?? DEFAULT_MIN_COMPANY_ACCEPTED_SAMPLES
  const maxSamplesPerProject = params.maxSamplesPerProject ?? DEFAULT_MAX_SAMPLES_PER_PROJECT
  const runDate = normalizeText(params.runDate) || currentRunDate()
  const publishableProjectSamples: Array<{ projectId: string; companyId: string | null; samples: AlgorithmAssetForecastResidualSample[] }> = []
  const companySamples = new Map<string, AlgorithmAssetForecastResidualSample[]>()

  for (const projectId of projectIds) {
    result.scannedProjects += 1
    try {
      const samples = await collectForecastResidualOverlaySamples(projectId, maxSamplesPerProject)
      result.sampleCount += samples.length
      const companyId = samples.map((sample) => normalizeText(sample.companyId)).find(Boolean) ?? null
      if (companyId && samples.length > 0) {
        companySamples.set(companyId, [
          ...(companySamples.get(companyId) ?? []),
          ...samples,
        ])
      }
      if (samples.length < minAcceptedSamples) {
        result.skippedForInsufficientSamples += 1
        continue
      }

      publishableProjectSamples.push({ projectId, companyId, samples })
      result.sampledProjects += 1
    } catch (error) {
      result.failedProjects += 1
      logger.warn('[forecastResidualOverlayProductionJob] project residual overlay production failed', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  for (const [companyId, samples] of companySamples.entries()) {
    if (samples.length < minCompanyAcceptedSamples) continue
    try {
      const persistence = await evaluateAndPersistAlgorithmAssetForecastResidualOverlay({
        overlayKey: `forecast-residual-overlay-runtime:company:${companyId}:${runDate}`,
        assetKey: 'task_remaining_forecast',
        companyId,
        projectId: null,
        modelKey: 'taskDurationForecastService',
        modelVersion: 'production_residual_overlay_v1',
        learningMaturity: 'guarded_live_tuning',
        publishAnchor: 'guarded_runtime_auto_publish',
        automationMaturity: 'auto_publish',
        rollbackTarget: `forecast-residual-overlay-runtime:company:${companyId}:previous`,
        conflictFree: true,
        samples,
        minAcceptedSamples: minCompanyAcceptedSamples,
      })

      if (persistence.persistence.persisted) result.persistedOverlayCount += 1
      if (persistence.evaluation.overlayWrite.canWriteRuntimeOverlay) result.runtimePublishableOverlayCount += 1
    } catch (error) {
      result.failedProjects += 1
      logger.warn('[forecastResidualOverlayProductionJob] company residual overlay production failed', {
        companyId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  for (const { projectId, companyId, samples } of publishableProjectSamples) {
    try {
      const persistence = await evaluateAndPersistAlgorithmAssetForecastResidualOverlay({
        overlayKey: `forecast-residual-overlay-runtime:${projectId}:${runDate}`,
        assetKey: 'task_remaining_forecast',
        companyId,
        projectId,
        modelKey: 'taskDurationForecastService',
        modelVersion: 'production_residual_overlay_v1',
        learningMaturity: 'guarded_live_tuning',
        publishAnchor: 'guarded_runtime_auto_publish',
        automationMaturity: 'auto_canary',
        rollbackTarget: `forecast-residual-overlay-runtime:${projectId}:previous`,
        conflictFree: true,
        samples,
        minAcceptedSamples,
      })

      if (persistence.persistence.persisted) result.persistedOverlayCount += 1
      if (persistence.evaluation.overlayWrite.canWriteRuntimeOverlay) result.runtimePublishableOverlayCount += 1
    } catch (error) {
      result.failedProjects += 1
      logger.warn('[forecastResidualOverlayProductionJob] project residual overlay production failed', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}

export class ForecastResidualOverlayProductionJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'forecastResidualOverlayProductionJob',
    schedule: { kind: 'daily', hour: 6, minute: 5 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => {
      this.nextRun = nextRun
      logger.info('forecastResidualOverlayProductionJob scheduled', {
        nextRun: nextRun.toISOString(),
        trigger: 'daily_06_05',
        initialDelay: delayMs,
      })
    },
    onError: (error) => logger.error('forecastResidualOverlayProductionJob scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('forecastResidualOverlayProductionJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('forecastResidualOverlayProductionJob stopped')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.wallClockTimer.getStatus().isScheduled,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
    }
  }

  async executeNow(projectIds?: string[] | null) {
    return this.execute('manual', projectIds)
  }

  private async execute(triggeredBy: 'scheduler' | 'manual', projectIds?: string[] | null) {
    if (this.isRunning) {
      logger.warn('forecastResidualOverlayProductionJob is already running, skip tick', { triggeredBy })
      return null
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'forecastResidualOverlayProductionJob',
          triggeredBy,
          jobId,
        },
        async () => runForecastResidualOverlayProductionSweep({
          projectIds: Array.isArray(projectIds) ? projectIds : null,
        }),
      )
      this.lastRun = new Date()
      logger.info('forecastResidualOverlayProductionJob completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
      return value
    } catch (error) {
      logger.error('forecastResidualOverlayProductionJob failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
      if (triggeredBy === 'scheduler') throw error
      return null
    } finally {
      this.isRunning = false
    }
  }
}

export const forecastResidualOverlayProductionJob = new ForecastResidualOverlayProductionJob()
