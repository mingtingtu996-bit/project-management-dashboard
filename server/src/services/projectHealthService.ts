/**
 * Project health score service.
 *
 * The dashboard now treats health as a business execution signal, not as a
 * planning-data lint score. Keep the legacy detail fields as aliases so older
 * summaries and tests can continue to read a stable shape.
 */

import { logger } from '../middleware/logger.js'
import { getCriticalPathTaskIds } from './criticalPathHelpers.js'
import {
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import { dataQualityService } from './dataQualityService.js'
import { getIssues, getRisks, getTasks, supabase } from './dbService.js'
import { createProjectHealthRefreshQueue } from './projectHealthRefreshQueue.js'
import { isPendingCondition } from '../utils/conditionStatus.js'
import { isActiveIssue } from '../utils/issueStatus.js'
import { isActiveObstacle } from '../utils/obstacleStatus.js'
import { calculateProgressMetrics, getLeafTasks } from '../utils/progressCalculation.js'
import { mapProjectHealthStatus, type ProjectHealthStatus } from '../utils/projectHealthStatus.js'
import { hasStableResponsibilitySubject } from '../utils/responsibilitySubject.js'
import { isActiveRisk } from '../utils/riskStatus.js'
import { isCompletedTask } from '../utils/taskStatus.js'
import { delayDayDelta } from '../utils/durationDays.js'
import {
  FAILED_ACCEPTANCE_STATUSES as FAILED_ACCEPTANCE_STATUS_VALUES,
  PASSED_ACCEPTANCE_STATUSES as PASSED_ACCEPTANCE_STATUS_VALUES,
  normalizeAcceptanceStatus,
} from '../utils/acceptanceStatus.js'
import type { Issue, Risk, Task } from '../types/db.js'

// v1.4.19: added 待完善 for insufficient data
export type HealthStatus = ProjectHealthStatus

export type HealthMetricAvailability = {
  progressDeliveryScore: boolean
  executionStabilityScore: boolean
  criticalTargetScore: boolean
  businessExceptionScore: boolean
  planGovernanceScore: boolean
  healthConfidenceScore: boolean
  taskExecutionScore: boolean
  milestoneDeliveryScore: boolean
  riskControlScore: boolean
  dataTrustScore: boolean
}

type ConditionRow = {
  id: string
  task_id?: string | null
  is_satisfied?: boolean | number | null
  status?: string | null
}

type ObstacleRow = {
  id: string
  task_id?: string | null
  status?: string | null
}

type MaterialRow = {
  id: string
  actual_arrival_date?: string | null
  expected_arrival_date?: string | null
  inspection_done?: boolean | number | null
  lifecycle_status?: string | null
  record_status?: string | null
  requires_inspection?: boolean | number | null
}

type PreMilestoneRow = {
  id: string
  status?: string | null
  planned_end_date?: string | null
  planned_finish_date?: string | null
  next_action_due_date?: string | null
  is_blocked?: boolean | number | null
}

type AcceptancePlanRow = {
  id: string
  status?: string | null
  planned_date?: string | null
  is_blocked?: boolean | number | null
}

type ConstructionDrawingRow = {
  id: string
  status?: string | null
  review_status?: string | null
  planned_pass_date?: string | null
  is_ready_for_construction?: boolean | number | null
}

type AlgorithmSeedCandidateRow = {
  id: string
  seed_type?: string | null
  stable_code?: string | null
  status?: string | null
  action_policy?: string | null
  confidence_level?: string | null
  candidate_payload?: Record<string, unknown> | null
  evidence_summary?: Record<string, unknown> | null
}

const HEALTH_WEIGHTS = {
  progressDeliveryScore: 0.25,
  executionStabilityScore: 0.2,
  criticalTargetScore: 0.25,
  businessExceptionScore: 0.15,
  planGovernanceScore: 0.15,
} as const
const DEFAULT_PROJECT_HEALTH_OPTIONAL_READ_TIMEOUT_MS = 5_000
const DEFAULT_PROJECT_HEALTH_READ_CONCURRENCY = 4
const PROJECT_HEALTH_TASK_COLUMNS = [
  'id',
  'project_id',
  'parent_id',
  'status',
  'progress',
  'planned_start_date',
  'planned_end_date',
  'start_date',
  'end_date',
  'actual_end_date',
  'is_executable',
  'is_wbs_summary',
  'progress_method',
  'is_milestone',
  'participant_unit_id',
  'assignee_user_id',
  'assignee_id',
] as const
const CALENDAR_UNAVAILABLE_CAP_REASON = '\u65bd\u5de5\u65e5\u5386\u6682\u4e0d\u53ef\u7528\uff0c\u5ef6\u8bef\u5224\u65ad\u6309\u81ea\u7136\u65e5\u53c2\u8003'
const TASKS_UNAVAILABLE_CAP_REASON = '\u4efb\u52a1\u4e3b\u5e72\u8bfb\u53d6\u6682\u4e0d\u53ef\u7528\uff0c\u5065\u5eb7\u5206\u6309\u4f4e\u4fe1\u53c2\u8003'
const RISKS_UNAVAILABLE_CAP_REASON = '\u98ce\u9669\u4e3b\u5e72\u8bfb\u53d6\u6682\u4e0d\u53ef\u7528\uff0c\u98ce\u9669\u7ef4\u5ea6\u6309\u964d\u7ea7\u53c2\u8003'
const ISSUES_UNAVAILABLE_CAP_REASON = '\u95ee\u9898\u4e3b\u5e72\u8bfb\u53d6\u6682\u4e0d\u53ef\u7528\uff0c\u5f02\u5e38\u7ef4\u5ea6\u6309\u964d\u7ea7\u53c2\u8003'

const COMPLETED_PRE_MILESTONE_STATUSES = new Set(['已取得', '已完成', '已批复', 'issued', 'voided', 'approved'])
const OVERDUE_PRE_MILESTONE_STATUSES = new Set(['已过期', '需延期', 'expired'])
const PASSED_ACCEPTANCE_STATUSES = new Set(PASSED_ACCEPTANCE_STATUS_VALUES)
const FAILED_ACCEPTANCE_STATUSES = new Set(FAILED_ACCEPTANCE_STATUS_VALUES)
const DRAWING_REWORK_STATUSES = new Set(['已驳回', '需修改', 'rejected', 'revision_required', 'needs_revision'])
const DRAWING_READY_STATUSES = new Set(['已通过', '已出图', 'passed', 'issued'])

class ProjectHealthOptionalReadTimeoutError extends Error {
  constructor(readonly operation: string, readonly timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`)
    this.name = 'ProjectHealthOptionalReadTimeoutError'
  }
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

async function runProjectHealthInputReads(readers: Array<() => Promise<void>>) {
  const configuredConcurrency = readPositiveIntegerEnv(
    'PROJECT_HEALTH_READ_CONCURRENCY',
    DEFAULT_PROJECT_HEALTH_READ_CONCURRENCY,
  )
  const concurrency = Math.max(1, Math.min(configuredConcurrency, readers.length || 1))
  let nextIndex = 0

  async function worker() {
    while (nextIndex < readers.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      await readers[currentIndex]()
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
}

async function withProjectHealthOptionalRead<T>(
  operation: string,
  projectId: string,
  promiseLike: PromiseLike<T>,
  fallback: T,
  onFallback?: (error: unknown) => void,
): Promise<T> {
  const timeoutMs = readPositiveIntegerEnv(
    'PROJECT_HEALTH_OPTIONAL_READ_TIMEOUT_MS',
    DEFAULT_PROJECT_HEALTH_OPTIONAL_READ_TIMEOUT_MS,
  )
  try {
    if (timeoutMs <= 0) return await Promise.resolve(promiseLike)
    let timeout: ReturnType<typeof setTimeout> | null = null
    try {
      return await Promise.race([
        Promise.resolve(promiseLike),
        new Promise<T>((_resolve, reject) => {
          timeout = setTimeout(() => {
            reject(new ProjectHealthOptionalReadTimeoutError(operation, timeoutMs))
          }, timeoutMs)
        }),
      ])
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  } catch (error) {
    logger.warn('[projectHealthService] optional health input unavailable', {
      operation,
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    onFallback?.(error)
    return fallback
  }
}

export type HealthAlgorithmSignal = {
  source: 'algorithm_seed_upgrade_candidates'
  signalType: string
  stableCode: string | null
  status: string
  runtimePolicy: string
  scorePolicy: 'explain_only_no_score_effect'
  scoreImpact: 0
  confidenceLevel: string | null
  confidenceScore: number | null
  evidenceSource: string | null
}

export interface HealthDetails {
  progressDeliveryScore: number
  executionStabilityScore: number
  criticalTargetScore: number
  businessExceptionScore: number
  planGovernanceScore: number
  taskExecutionScore: number
  milestoneDeliveryScore: number
  riskControlScore: number
  dataTrustScore: number
  reliabilityScore: number
  businessHealthScore: number
  healthConfidenceScore: number | null
  healthConfidenceFlag: 'high' | 'medium' | 'low' | 'unavailable'
  scoreBeforeCaps: number
  capReasons: string[]
  totalScore: number
  healthStatus: HealthStatus
  overallProgress: number
  plannedProgress: number | null
  delayedTaskCount: number
  delayedTaskDays: number
  overdueMilestoneCount: number
  criticalPathAffectedTasks: number
  activeRiskCount: number
  activeIssueCount: number
  activeObstacleCount: number
  pendingConditionTaskCount: number
  overdueMaterialCount: number
  blockedPreMilestoneCount: number
  failedAcceptancePlanCount: number
  drawingReworkCount: number
  externalReadinessSignalCount: number
  activeDelaySignalCount: number
  algorithmSignals: HealthAlgorithmSignal[]
  metricAvailability: HealthMetricAvailability
  metricUnavailableReasons: Partial<Record<keyof HealthMetricAvailability, string>>
  unavailableReasons: Partial<Record<keyof HealthMetricAvailability, string>>
  summary: string

  // Legacy aliases retained for consumers that still expect the old shape.
  dataIntegrityScore: number
  mappingIntegrityScore: number
  systemConsistencyScore: number
  milestoneIntegrityScore: number
  passiveReorderPenalty: number
}

export interface HealthScoreResult {
  score: number
  status: HealthStatus
  businessHealthScore: number
  reliabilityScore: number
  details: HealthDetails
}

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

function roundScore(value: number) {
  return Math.round(clamp(value))
}

function mapHealthConfidenceFlag(score: number | null): HealthDetails['healthConfidenceFlag'] {
  if (score === null) return 'unavailable'
  if (score >= 85) return 'high'
  if (score >= 60) return 'medium'
  return 'low'
}

function weightedAvailableHealthScore(
  scores: Record<keyof typeof HEALTH_WEIGHTS, number>,
  availability: Pick<HealthMetricAvailability, keyof typeof HEALTH_WEIGHTS>,
) {
  let weightedScore = 0
  let availableWeight = 0
  for (const key of Object.keys(HEALTH_WEIGHTS) as Array<keyof typeof HEALTH_WEIGHTS>) {
    if (!availability[key]) continue
    const weight = HEALTH_WEIGHTS[key]
    weightedScore += scores[key] * weight
    availableWeight += weight
  }
  return availableWeight > 0 ? roundScore(weightedScore / availableWeight) : 0
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function normalizeNullableText(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function toNullableNumber(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function toBoolean(value: unknown) {
  return value === true || value === 1 || value === '1' || normalizeLower(value) === 'true'
}

function isInSet(value: unknown, candidates: Set<string>) {
  const raw = normalizeText(value)
  return candidates.has(raw) || candidates.has(raw.toLowerCase())
}

function isAcceptanceStatusInSet(value: unknown, candidates: Set<string>) {
  return candidates.has(normalizeAcceptanceStatus(normalizeText(value)).toLowerCase())
}

function toDate(value?: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getPlannedEndDate(task: Partial<Task>) {
  return toDate(task.planned_end_date || task.end_date || null)
}

function getActualEndDate(task: Partial<Task>) {
  return toDate(task.actual_end_date || null)
}

function isTaskDelayed(
  task: Partial<Task>,
  asOf = new Date(),
  calendar?: ConstructionCalendarContext | null,
) {
  return getTaskDelayDays(task, asOf, calendar) > 0
}

function getTaskDelayDays(
  task: Partial<Task>,
  asOf = new Date(),
  calendar?: ConstructionCalendarContext | null,
) {
  const plannedEnd = getPlannedEndDate(task)
  if (!plannedEnd) return 0

  const compareEnd = isCompletedTask(task) ? getActualEndDate(task) : asOf
  if (!compareEnd || compareEnd.getTime() <= plannedEnd.getTime()) return 0
  return Math.max(0, delayDayDelta(plannedEnd, compareEnd, calendar) ?? 0)
}

function isHighSeveritySignal(value: unknown) {
  const text = String(value ?? '').trim().toLowerCase()
  return ['critical', 'high', '严重', '高'].includes(text)
}

function isPastDate(value: string | null | undefined, asOf: Date) {
  const date = toDate(value)
  return Boolean(date && date.getTime() < asOf.getTime())
}

function isMaterialActive(row: MaterialRow) {
  const recordStatus = normalizeLower(row.record_status)
  const lifecycleStatus = normalizeLower(row.lifecycle_status)
  return !['archived', 'deleted', 'inactive', 'voided', 'cancelled', 'closed'].includes(recordStatus)
    && !['archived', 'deleted', 'voided', 'cancelled', 'closed'].includes(lifecycleStatus)
}

function isMaterialPending(row: MaterialRow) {
  if (!isMaterialActive(row)) return false
  if (!row.actual_arrival_date) return true
  return toBoolean(row.requires_inspection) && !toBoolean(row.inspection_done)
}

function isPreMilestoneCompleted(row: PreMilestoneRow) {
  return isInSet(row.status, COMPLETED_PRE_MILESTONE_STATUSES)
}

function isPreMilestoneBlocked(row: PreMilestoneRow, asOf: Date) {
  if (isPreMilestoneCompleted(row)) return false
  return toBoolean(row.is_blocked)
    || isInSet(row.status, OVERDUE_PRE_MILESTONE_STATUSES)
    || isPastDate(row.planned_finish_date ?? row.planned_end_date ?? row.next_action_due_date ?? null, asOf)
}

function isDrawingReady(row: ConstructionDrawingRow) {
  return toBoolean(row.is_ready_for_construction)
    || isInSet(row.status, DRAWING_READY_STATUSES)
    || isInSet(row.review_status, DRAWING_READY_STATUSES)
}

function isDrawingRework(row: ConstructionDrawingRow, asOf: Date) {
  if (isDrawingReady(row)) return false
  return isInSet(row.status, DRAWING_REWORK_STATUSES)
    || isInSet(row.review_status, DRAWING_REWORK_STATUSES)
    || isPastDate(row.planned_pass_date ?? null, asOf)
}

function isAcceptancePassed(row: AcceptancePlanRow) {
  return isAcceptanceStatusInSet(row.status, PASSED_ACCEPTANCE_STATUSES)
}

function isAcceptanceFailed(row: AcceptancePlanRow) {
  return isAcceptanceStatusInSet(row.status, FAILED_ACCEPTANCE_STATUSES) || toBoolean(row.is_blocked)
}

function buildAlgorithmSignals(rows: AlgorithmSeedCandidateRow[]): HealthAlgorithmSignal[] {
  return rows
    .map((row) => {
      const payload = toRecord(row.candidate_payload)
      const evidence = toRecord(row.evidence_summary)
      const effectPolicy = toRecord(payload.effectPolicy ?? payload.effect_policy)
      const runtimePolicy = normalizeLower(row.action_policy ?? payload.actionPolicy ?? payload.action_policy ?? row.status)
      const status = normalizeLower(row.status) || 'pending'
      const scoreEffect = normalizeLower(effectPolicy.scoreEffect ?? effectPolicy.score_effect)
      const effectPolicyText = normalizeLower(payload.effectPolicy ?? payload.effect_policy)
      const explainOnly = runtimePolicy === 'candidate_only'
        || status === 'candidate_only'
        || normalizeLower(payload.runtimeGovernancePolicy).includes('candidate_only')
        || effectPolicyText.includes('none_until_curated')
        || scoreEffect.includes('none_until_curated')
        || scoreEffect.includes('no_score')

      if (!explainOnly) return null

      return {
        source: 'algorithm_seed_upgrade_candidates' as const,
        signalType: normalizeText(row.seed_type) || 'unknown_seed',
        stableCode: normalizeNullableText(row.stable_code),
        status,
        runtimePolicy: runtimePolicy || 'candidate_only',
        scorePolicy: 'explain_only_no_score_effect' as const,
        scoreImpact: 0 as const,
        confidenceLevel: normalizeNullableText(row.confidence_level),
        confidenceScore: toNullableNumber(
          payload.confidenceScore
          ?? payload.confidence_score
          ?? payload.confidence,
        ),
        evidenceSource: normalizeNullableText(evidence.source),
      }
    })
    .filter((signal): signal is HealthAlgorithmSignal => Boolean(signal))
}

async function loadProjectScopedRows<T>(table: string, projectId: string, select = '*'): Promise<T[]> {
  type OptionalRowsResult = { data: T[] | null; error: { message?: string } | null }
  const query = supabase
    .from(table)
    .select(select)
    .eq('project_id', projectId) as unknown as PromiseLike<OptionalRowsResult>
  const { data, error } = await withProjectHealthOptionalRead<OptionalRowsResult>(
    `table:${table}`,
    projectId,
    query,
    { data: [], error: null },
  )

  if (error) {
    logger.warn('[projectHealthService] optional health input unavailable', {
      table,
      projectId,
      error: error.message,
    })
    return []
  }

  return (data ?? []) as T[]
}

export async function calculateProjectHealth(
  projectId: string,
  options: { calendar?: ConstructionCalendarContext | null } = {},
): Promise<HealthScoreResult> {
  const now = new Date()
  const optionalInputCapReasons: string[] = []
  let calendar: ConstructionCalendarContext = { basis: 'calendar_day', windows: [] }
  let tasks: Task[] = []
  let risks: Risk[] = []
  let issues: Issue[] = []
  let conditions: ConditionRow[] = []
  let obstacles: ObstacleRow[] = []
  let materials: MaterialRow[] = []
  let preMilestones: PreMilestoneRow[] = []
  let acceptancePlans: AcceptancePlanRow[] = []
  let constructionDrawings: ConstructionDrawingRow[] = []
  let algorithmSeedCandidates: AlgorithmSeedCandidateRow[] = []
  let criticalTaskIds = new Set<string>()
  let dataQualitySummary: Awaited<ReturnType<typeof dataQualityService.buildProjectSummary>> | null = null

  await runProjectHealthInputReads([
    async () => {
      calendar = options.calendar ?? await withProjectHealthOptionalRead(
        'construction_calendar',
        projectId,
        resolveConstructionCalendarContext({
          projectId,
          onError: (error) => logger.warn('[projectHealthService] construction calendar unavailable for delay metrics', {
            projectId,
            error: error instanceof Error ? error.message : String(error),
          }),
        }),
        { basis: 'calendar_day', windows: [] },
        () => optionalInputCapReasons.push(CALENDAR_UNAVAILABLE_CAP_REASON),
      )
    },
    async () => {
      tasks = await withProjectHealthOptionalRead(
        'tasks',
        projectId,
        getTasks(projectId, { columns: PROJECT_HEALTH_TASK_COLUMNS }),
        [] as Task[],
        () => optionalInputCapReasons.push(TASKS_UNAVAILABLE_CAP_REASON),
      )
    },
    async () => {
      risks = await withProjectHealthOptionalRead('risks', projectId, getRisks(projectId), [] as Risk[], () => {
        optionalInputCapReasons.push(RISKS_UNAVAILABLE_CAP_REASON)
      })
    },
    async () => {
      issues = await withProjectHealthOptionalRead('issues', projectId, getIssues(projectId), [] as Issue[], () => {
        optionalInputCapReasons.push(ISSUES_UNAVAILABLE_CAP_REASON)
      })
    },
    async () => {
      conditions = await loadProjectScopedRows<ConditionRow>(
        'task_conditions',
        projectId,
        'id, task_id, is_satisfied, status',
      )
    },
    async () => {
      obstacles = await loadProjectScopedRows<ObstacleRow>('task_obstacles', projectId, 'id, task_id, status')
    },
    async () => {
      materials = await loadProjectScopedRows<MaterialRow>(
        'project_materials',
        projectId,
        'id, actual_arrival_date, expected_arrival_date, inspection_done, lifecycle_status, record_status, requires_inspection',
      )
    },
    async () => {
      preMilestones = await loadProjectScopedRows<PreMilestoneRow>(
        'pre_milestones',
        projectId,
        'id, status, planned_end_date, planned_finish_date, next_action_due_date, is_blocked',
      )
    },
    async () => {
      acceptancePlans = await loadProjectScopedRows<AcceptancePlanRow>(
        'acceptance_plans',
        projectId,
        'id, status, planned_date, is_blocked',
      )
    },
    async () => {
      constructionDrawings = await loadProjectScopedRows<ConstructionDrawingRow>(
        'construction_drawings',
        projectId,
        'id, status, review_status, planned_pass_date, is_ready_for_construction',
      )
    },
    async () => {
      algorithmSeedCandidates = await loadProjectScopedRows<AlgorithmSeedCandidateRow>(
        'algorithm_seed_upgrade_candidates',
        projectId,
        'id, seed_type, stable_code, status, action_policy, confidence_level, candidate_payload, evidence_summary',
      )
    },
    async () => {
      criticalTaskIds = await withProjectHealthOptionalRead(
        'critical_path',
        projectId,
        getCriticalPathTaskIds(projectId),
        new Set<string>(),
      )
    },
    async () => {
      dataQualitySummary = await withProjectHealthOptionalRead(
        'data_quality',
        projectId,
        dataQualityService.buildProjectSummary(projectId),
        null,
      )
    },
  ])

  const leafTasks = getLeafTasks(tasks)
  const milestones = tasks.filter((task) => task.is_milestone)
  const completedLeafTasks = leafTasks.filter(isCompletedTask)
  const delayedTasks = leafTasks.filter((task) => isTaskDelayed(task, now, calendar))
  const delayedTaskDays = delayedTasks.reduce((sum, task) => sum + getTaskDelayDays(task, now, calendar), 0)
  const activeRisks = risks.filter(isActiveRisk)
  const activeIssues = issues.filter(isActiveIssue)
  const activeObstacles = obstacles.filter(isActiveObstacle)
  const pendingConditions = conditions.filter(isPendingCondition)
  const pendingConditionTaskIds = new Set(pendingConditions.map((condition) => String(condition.task_id ?? '')).filter(Boolean))
  const activeObstacleTaskIds = new Set(activeObstacles.map((obstacle) => String(obstacle.task_id ?? '')).filter(Boolean))
  const pendingMaterials = materials.filter(isMaterialPending)
  const overdueMaterials = pendingMaterials.filter((material) => isPastDate(material.expected_arrival_date ?? null, now))
  const completedPreMilestones = preMilestones.filter(isPreMilestoneCompleted)
  const blockedPreMilestones = preMilestones.filter((item) => isPreMilestoneBlocked(item, now))
  const passedAcceptancePlans = acceptancePlans.filter(isAcceptancePassed)
  const failedAcceptancePlans = acceptancePlans.filter(isAcceptanceFailed)
  const drawingReworkItems = constructionDrawings.filter((item) => isDrawingRework(item, now))
  const algorithmSignals = buildAlgorithmSignals(algorithmSeedCandidates)
  const externalReadinessSignalCount =
    overdueMaterials.length
    + blockedPreMilestones.length
    + failedAcceptancePlans.length
    + drawingReworkItems.length

  const criticalPathAffectedTasks = leafTasks.filter((task) => {
    if (!criticalTaskIds.has(task.id)) return false
    return isTaskDelayed(task, now, calendar) || pendingConditionTaskIds.has(task.id) || activeObstacleTaskIds.has(task.id)
  }).length

  const overdueMilestones = milestones.filter((task) => !isCompletedTask(task) && isTaskDelayed(task, now, calendar))
  const shiftedMilestones = milestones.filter((task) => isTaskDelayed(task, now, calendar))
  const criticalTargetCount = milestones.length + preMilestones.length + acceptancePlans.length
  const completedCriticalTargetCount =
    milestones.filter(isCompletedTask).length
    + completedPreMilestones.length
    + passedAcceptancePlans.length
  const overdueCriticalTargetCount = overdueMilestones.length + blockedPreMilestones.length
  const progressMetrics = calculateProgressMetrics(tasks, now)
  const overallProgress = roundScore(progressMetrics.currentProgress)
  const plannedProgress = progressMetrics.plannedProgress
  const hasLeafTasks = leafTasks.length > 0
  const hasCriticalTargets = criticalTargetCount > 0
  const hasRiskOrExecutionEvidence =
    hasLeafTasks
    || activeRisks.length > 0
    || activeIssues.length > 0
    || activeObstacles.length > 0
    || pendingConditions.length > 0
    || externalReadinessSignalCount > 0

  const hasDataTrustScore = Number.isFinite(Number(dataQualitySummary?.confidence?.score))
  const metricAvailability: HealthMetricAvailability = {
    progressDeliveryScore: hasLeafTasks && plannedProgress !== null,
    executionStabilityScore: hasLeafTasks,
    criticalTargetScore: hasCriticalTargets,
    businessExceptionScore: hasRiskOrExecutionEvidence,
    planGovernanceScore: hasLeafTasks,
    healthConfidenceScore: hasDataTrustScore,
    taskExecutionScore: hasLeafTasks,
    milestoneDeliveryScore: hasCriticalTargets,
    riskControlScore: hasRiskOrExecutionEvidence,
    dataTrustScore: hasDataTrustScore,
  }
  const metricUnavailableReasons: Partial<Record<keyof HealthMetricAvailability, string>> = {}
  if (!metricAvailability.progressDeliveryScore) {
    metricUnavailableReasons.progressDeliveryScore = hasLeafTasks ? '缺少计划进度窗口' : '缺少可评估任务'
  }
  if (!metricAvailability.taskExecutionScore) {
    metricUnavailableReasons.taskExecutionScore = '缺少可评估任务'
  }
  if (!metricAvailability.milestoneDeliveryScore) {
    metricUnavailableReasons.milestoneDeliveryScore = '缺少里程碑或专项目标'
  }
  if (!metricAvailability.riskControlScore) {
    metricUnavailableReasons.riskControlScore = '缺少任务或风险异常信号'
  }
  if (!metricAvailability.dataTrustScore) {
    metricUnavailableReasons.dataTrustScore = '数据质量服务暂不可用'
  }

  if (!metricAvailability.executionStabilityScore) {
    metricUnavailableReasons.executionStabilityScore = metricUnavailableReasons.taskExecutionScore
  }
  if (!metricAvailability.criticalTargetScore) {
    metricUnavailableReasons.criticalTargetScore = metricUnavailableReasons.milestoneDeliveryScore
  }
  if (!metricAvailability.businessExceptionScore) {
    metricUnavailableReasons.businessExceptionScore = metricUnavailableReasons.riskControlScore
  }
  if (!metricAvailability.planGovernanceScore) {
    metricUnavailableReasons.planGovernanceScore = '缺少可治理的任务事实'
  }
  if (!metricAvailability.healthConfidenceScore) {
    metricUnavailableReasons.healthConfidenceScore = metricUnavailableReasons.dataTrustScore
  }

  const progressGap = plannedProgress === null ? 0 : Math.max(0, plannedProgress - overallProgress)
  const progressDeliveryScore = metricAvailability.progressDeliveryScore
    ? roundScore(100 - progressGap * 1.4 - Math.min(25, delayedTaskDays * 1.2))
    : 0

  const delayedTaskRatio = hasLeafTasks ? delayedTasks.length / leafTasks.length : 1
  const blockedTaskRatio = hasLeafTasks
    ? new Set([...pendingConditionTaskIds, ...activeObstacleTaskIds]).size / leafTasks.length
    : 1
  const externalReadinessPenalty = Math.min(35, externalReadinessSignalCount * 7)
  const ownerMissingRatio = hasLeafTasks
    ? leafTasks.filter((task) => !hasStableResponsibilitySubject(task)).length / leafTasks.length
    : 1
  const taskExecutionScore = metricAvailability.taskExecutionScore
    ? roundScore(100 - blockedTaskRatio * 40 - delayedTaskRatio * 20 - ownerMissingRatio * 10 - externalReadinessPenalty)
    : 0

  const milestoneCompletionRate = hasCriticalTargets
    ? (completedCriticalTargetCount / criticalTargetCount) * 100
    : 0
  const overdueMilestoneRatio = hasCriticalTargets ? overdueCriticalTargetCount / criticalTargetCount : 0
  const shiftedMilestoneRatio = hasCriticalTargets ? shiftedMilestones.length / criticalTargetCount : 0
  const failedAcceptanceRatio = hasCriticalTargets ? failedAcceptancePlans.length / criticalTargetCount : 0
  const milestoneDeliveryScore = metricAvailability.milestoneDeliveryScore
    ? roundScore(
      65
      + milestoneCompletionRate * 0.35
      - overdueMilestoneRatio * 55
      - shiftedMilestoneRatio * 15
      - failedAcceptanceRatio * 35
      - Math.min(18, criticalPathAffectedTasks * 6),
    )
    : 0

  const highSeverityRisks = activeRisks.filter((risk) => isHighSeveritySignal((risk as Risk & { severity?: string | null }).severity || risk.level)).length
  const highSeverityIssues = activeIssues.filter((issue) => isHighSeveritySignal((issue as Issue & { severity?: string | null }).severity)).length
  const acceptanceAndReadinessPenalty =
    failedAcceptancePlans.length * 8
    + overdueMaterials.length * 5
    + blockedPreMilestones.length * 6
    + drawingReworkItems.length * 4
  const riskControlScore = metricAvailability.riskControlScore
    ? roundScore(
      100
      - activeRisks.length * 6
      - activeIssues.length * 10
      - activeObstacles.length * 10
      - pendingConditionTaskIds.size * 4
      - criticalPathAffectedTasks * 12
      - (highSeverityRisks + highSeverityIssues) * 8
      - acceptanceAndReadinessPenalty,
    )
    : 0
  const executionStabilityScore = taskExecutionScore
  const criticalTargetScore = milestoneDeliveryScore
  const businessExceptionScore = riskControlScore
  const governanceOperationalScore = metricAvailability.planGovernanceScore
    ? roundScore(
      100
      - blockedTaskRatio * 35
      - ownerMissingRatio * 20
      - Math.min(25, delayedTaskDays * 1.2)
      - criticalPathAffectedTasks * 8
      - Math.min(20, externalReadinessSignalCount * 4),
    )
    : 0
  const planGovernanceScore = metricAvailability.planGovernanceScore
    ? roundScore(hasDataTrustScore ? governanceOperationalScore * 0.7 + roundScore(Number(dataQualitySummary?.confidence?.score)) * 0.3 : governanceOperationalScore)
    : 0

  const dataTrustScore = metricAvailability.dataTrustScore
    ? roundScore(Number(dataQualitySummary?.confidence?.score))
    : 0
  const healthConfidenceScore = metricAvailability.dataTrustScore ? dataTrustScore : null
  const healthConfidenceFlag = mapHealthConfidenceFlag(healthConfidenceScore)

  const scoreBeforeCaps = weightedAvailableHealthScore({
    progressDeliveryScore,
    executionStabilityScore,
    criticalTargetScore,
    businessExceptionScore,
    planGovernanceScore,
  }, metricAvailability)

  let cap = 100
  const capReasons: string[] = []
  const noRecordedExecutionProgress =
    hasLeafTasks
    && overallProgress <= 0
    && (plannedProgress ?? 0) <= 0
    && completedLeafTasks.length === 0
    && completedCriticalTargetCount === 0

  if (leafTasks.length === 0) {
    cap = Math.min(cap, 55)
    capReasons.push('缺少可评估任务')
  }
  if (noRecordedExecutionProgress) {
    cap = Math.min(cap, 60)
    capReasons.push('项目未开始，暂无实际推进证据')
  }
  for (const reason of optionalInputCapReasons) {
    if (reason === TASKS_UNAVAILABLE_CAP_REASON) {
      cap = Math.min(cap, 40)
    } else if (reason === RISKS_UNAVAILABLE_CAP_REASON || reason === ISSUES_UNAVAILABLE_CAP_REASON) {
      cap = Math.min(cap, 70)
    } else {
      cap = Math.min(cap, 85)
    }
    capReasons.push(reason)
  }
  if (!metricAvailability.progressDeliveryScore && hasLeafTasks) {
    cap = Math.min(cap, 65)
    capReasons.push(metricUnavailableReasons.progressDeliveryScore ?? '缺少计划进度窗口')
  }
  if (!metricAvailability.milestoneDeliveryScore) {
    cap = Math.min(cap, 70)
    capReasons.push(metricUnavailableReasons.milestoneDeliveryScore ?? '缺少里程碑或专项目标')
  }
  if (!metricAvailability.riskControlScore) {
    cap = Math.min(cap, 65)
    capReasons.push(metricUnavailableReasons.riskControlScore ?? '缺少风险异常评估输入')
  }
  if (overdueMilestones.length > 0) {
    cap = Math.min(cap, 70)
    capReasons.push(`${overdueMilestones.length} 个里程碑已逾期`)
  }
  if (criticalPathAffectedTasks > 0) {
    cap = Math.min(cap, 65)
    capReasons.push(`${criticalPathAffectedTasks} 个关键路径任务受影响`)
  }
  if (highSeverityRisks + highSeverityIssues > 0) {
    cap = Math.min(cap, 75)
    capReasons.push(`${highSeverityRisks + highSeverityIssues} 个高等级风险/问题`)
  }
  if (activeObstacles.length > 0) {
    cap = Math.min(cap, 80)
    capReasons.push(`${activeObstacles.length} 个未解除阻碍`)
  }
  if (overdueMaterials.length > 0) {
    cap = Math.min(cap, 80)
    capReasons.push(`${overdueMaterials.length} 项材料到货或验收逾期`)
  }
  if (blockedPreMilestones.length > 0) {
    cap = Math.min(cap, 78)
    capReasons.push(`${blockedPreMilestones.length} 项前期证照受阻或逾期`)
  }
  if (failedAcceptancePlans.length > 0) {
    cap = Math.min(cap, 75)
    capReasons.push(`${failedAcceptancePlans.length} 项验收未通过或受阻`)
  }
  if (drawingReworkItems.length > 0) {
    cap = Math.min(cap, 82)
    capReasons.push(`${drawingReworkItems.length} 项图纸需返工或逾期`)
  }
  const totalScore = Math.min(scoreBeforeCaps, cap)
  const healthStatus = mapProjectHealthStatus(totalScore)
  const summary = capReasons.length > 0
    ? `健康分受限：${capReasons.slice(0, 3).join('；')}`
    : '业务健康维度完整，暂无封顶原因'

  return {
    score: totalScore,
    status: healthStatus,
    businessHealthScore: totalScore,
    reliabilityScore: dataTrustScore,
    details: {
      progressDeliveryScore,
      executionStabilityScore,
      criticalTargetScore,
      businessExceptionScore,
      planGovernanceScore,
      taskExecutionScore,
      milestoneDeliveryScore,
      riskControlScore,
      dataTrustScore,
      reliabilityScore: dataTrustScore,
      businessHealthScore: totalScore,
      healthConfidenceScore,
      healthConfidenceFlag,
      scoreBeforeCaps,
      capReasons,
      totalScore,
      healthStatus,
      overallProgress,
      plannedProgress,
      delayedTaskCount: delayedTasks.length,
      delayedTaskDays,
      overdueMilestoneCount: overdueMilestones.length,
      criticalPathAffectedTasks,
      activeRiskCount: activeRisks.length,
      activeIssueCount: activeIssues.length,
      activeObstacleCount: activeObstacles.length,
      pendingConditionTaskCount: pendingConditionTaskIds.size,
      overdueMaterialCount: overdueMaterials.length,
      blockedPreMilestoneCount: blockedPreMilestones.length,
      failedAcceptancePlanCount: failedAcceptancePlans.length,
      drawingReworkCount: drawingReworkItems.length,
      externalReadinessSignalCount,
      activeDelaySignalCount: delayedTasks.length,
      algorithmSignals,
      metricAvailability,
      metricUnavailableReasons,
      unavailableReasons: metricUnavailableReasons,
      summary,
      dataIntegrityScore: dataTrustScore,
      mappingIntegrityScore: milestoneDeliveryScore,
      systemConsistencyScore: taskExecutionScore,
      milestoneIntegrityScore: milestoneDeliveryScore,
      passiveReorderPenalty: 0,
    },
  }
}

async function persistProjectHealth(projectId: string, result: HealthScoreResult) {
  const { error } = await supabase
    .from('projects')
    .update({
      health_score: result.score,
      health_status: result.details.healthStatus,
    })
    .eq('id', projectId)

  if (error) {
    throw new Error(`Failed to update project health: ${error.message}`)
  }

  return result
}

export async function updateProjectHealth(projectId: string): Promise<HealthScoreResult> {
  const result = await calculateProjectHealth(projectId)
  await persistProjectHealth(projectId, result)

  logger.info('[projectHealthService] project health refreshed', {
    projectId,
    score: result.score,
    status: result.details.healthStatus,
  })

  return result
}

// workspace-isolation-capability-write-approved: the route passes its getVisibleProjectIds authorization scope;
// arrays are pushed into the project query and null is reserved for an authorized platform-wide role.
export async function updateAllProjectsHealth(projectIds: string[] | null): Promise<number> {
  const normalizedProjectIds = Array.isArray(projectIds)
    ? [...new Set(projectIds.map((projectId) => String(projectId ?? '').trim()).filter(Boolean))]
    : null
  if (normalizedProjectIds && normalizedProjectIds.length === 0) return 0

  let query = supabase
    .from('projects')
    .select('id')
  if (normalizedProjectIds) {
    query = query.in('id', normalizedProjectIds)
  }
  const { data: projects, error } = await query

  if (error) {
    throw new Error(`Failed to load projects: ${error.message}`)
  }

  if (!projects || projects.length === 0) {
    return 0
  }

  let updatedCount = 0
  for (const project of projects) {
    try {
      await updateProjectHealth(project.id)
      updatedCount += 1
    } catch (error) {
      logger.warn('[projectHealthService] failed to refresh project health', {
        projectId: project.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return updatedCount
}

const projectHealthRefreshQueue = createProjectHealthRefreshQueue({
  refresh: updateProjectHealth,
  maxAttempts: readPositiveIntegerEnv('PROJECT_HEALTH_REFRESH_MAX_ATTEMPTS', 3),
  retryDelayMs: readPositiveIntegerEnv('PROJECT_HEALTH_REFRESH_RETRY_DELAY_MS', 1_000),
  onAttemptFailure: (failure) => {
    logger.warn('[projectHealthService] queued health refresh attempt failed', failure)
  },
})

export function getProjectHealthRefreshQueueStatus() {
  return projectHealthRefreshQueue.getStatus()
}

export async function drainProjectHealthRefreshQueue() {
  await projectHealthRefreshQueue.drain()
}

export function enqueueProjectHealthUpdate(projectId: string, trigger = 'event') {
  projectHealthRefreshQueue.enqueue(projectId, trigger)
}
