import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { query as rawQuery } from '../database.js'
import { logger } from '../middleware/logger.js'
import { executeSQL } from './dbService.js'
import { listNotifications, updateNotificationById } from './notificationStore.js'
import { notificationTouchpointService } from './notificationTouchpointService.js'
import { inclusiveDurationDays } from '../utils/durationDays.js'
import type { CriticalPathOverride, CriticalPathOverrideInput, Notification } from '../types/db.js'
import {
  backtestEarliestPendingDurationAccuracyPrediction,
  recordDurationAccuracyPrediction,
} from './durationAlgorithmAccuracyService.js'
import {
  listCurrentTaskDurationForecasts,
  type TaskDurationForecast,
} from './taskDurationForecastService.js'
import {
  productionDaysBetweenInclusive,
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'

const criticalPathSnapshotCache = new Map<string, CriticalPathSnapshot>()

export type CriticalSource = 'auto' | 'manual_attention' | 'manual_insert' | 'hybrid'
type CriticalDependencyType = 'FS' | 'SS' | 'FF' | 'SF'

export interface CriticalPathEdge {
  id: string
  fromTaskId: string
  toTaskId: string
  source: 'dependency' | 'manual_link' | 'resource_constraint'
  isPrimary: boolean
  dependencyType?: CriticalDependencyType
  lagDays?: number
}

export interface CriticalTaskSnapshot {
  taskId: string
  title: string
  floatDays: number
  durationDays: number
  p50DurationDays?: number
  p80DurationDays?: number
  standardDeviationDays?: number
  confidenceBandWidthDays?: number
  isHighVarianceNearCritical?: boolean
  isAutoCritical: boolean
  isManualAttention: boolean
  isManualInserted: boolean
  chainIndex?: number
}

export interface CriticalChainSnapshot {
  id: string
  source: CriticalSource
  taskIds: string[]
  totalDurationDays: number
  p80DurationDays?: number
  standardDeviationDays?: number
  confidenceBandWidthDays?: number
  isHighVarianceNearCritical?: boolean
  displayLabel: string
}

export interface CriticalPathNetworkLineage {
  criticalPathAlgorithmVersion: 'critical_path_cpm_v1'
  taskNetworkInputHash: string
  dependencyInputHash: string
  criticalPathInputHash: string
  criticalSetHash: string
  dependencyRuleVersion: string
  baselineVersionIds: string[]
  baselineItemIds: string[]
  baselineVersionSource: 'task_rows' | 'task_baseline_items_unresolved' | 'not_linked'
}

export interface CriticalPathSnapshot {
  projectId: string
  autoTaskIds: string[]
  manualAttentionTaskIds: string[]
  manualInsertedTaskIds: string[]
  primaryChain: CriticalChainSnapshot | null
  alternateChains: CriticalChainSnapshot[]
  displayTaskIds: string[]
  watchedTaskIds: string[]  // CP14: manual_attention 任务独立存储，不混入 displayTaskIds
  edges: CriticalPathEdge[]
  tasks: CriticalTaskSnapshot[]
  projectDurationDays: number
  calculatedAt?: string
  lastSuccessfulCalculatedAt?: string | null
  calculationStatus?: 'fresh' | 'cached_after_failure' | 'empty_after_failure'
  calculationFailureMessage?: string | null
  calculationFailedAt?: string | null
  hasCycleDetected?: boolean
  cycleTaskIds?: string[]
  networkLineage?: CriticalPathNetworkLineage
}

export type CriticalPathOverrideRow = CriticalPathOverride

export interface ProjectCriticalPathResult {
  projectId: string
  taskCount: number
  eligibleTaskCount: number
  criticalTaskIds: string[]
  projectDuration: number
  snapshot: CriticalPathSnapshot
}

export type CriticalPathRuleLearningScopeEvidence =
  | 'global'
  | 'industry'
  | 'company'
  | 'project'
  | 'system'
  | 'industry_baseline'
  | 'segment_baseline'
  | string

export interface CriticalPathRuleCandidateLiveLearningEvidenceInput {
  criticalPathSnapshot: CriticalPathSnapshot
  criticalPathOutcomeEventRecorded: boolean
  approvedCriticalPathRuleCandidateRecorded: boolean
  enabledLearningScopes: readonly CriticalPathRuleLearningScopeEvidence[]
  runtimeConsumerUsesPublishedArtifact: boolean
  criticalPathRulePublicationWriterReady: boolean
  criticalPathRuleLineageRecorded: boolean
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  rollbackTargetReady: boolean
  accuracyMetricsAvailable: boolean
}

export interface CriticalPathRuleCandidateLiveLearningEvidence {
  assetClassificationRegistered: true
  predictionEventRecorded: boolean
  actualOutcomeEventRecorded: boolean
  tieredLearningPolicyRegistered: boolean
  enabledLearningScopes: Array<'global' | 'industry' | 'company' | 'project'>
  runtimeConsumerUsesPublishedArtifact: boolean
  criticalPathProjectionEvidencePresent: boolean
  approvedCriticalPathRuleCandidateRecorded: boolean
  criticalPathRulePublicationWriterReady: boolean
  criticalPathRuleLineageRecorded: boolean
  criticalPathFactsRemainLocked: true
  releaseExitApproved: boolean
  impactMonitoringReady: boolean
  rollbackTargetReady: boolean
  accuracyMetricsAvailable: boolean
  criticalTaskCount: number
  projectedFloatTaskCount: number
}

export interface CriticalPathRuleCandidateLiveLearningEvidenceDecision {
  status: 'critical_path_rule_candidate_live_learning_ready' | 'critical_path_rule_candidate_live_learning_not_ready'
  liveLearningEvidence: CriticalPathRuleCandidateLiveLearningEvidence
  missingReasons: string[]
}

const CRITICAL_PATH_RULE_LEARNING_SCOPE_ORDER = ['global', 'industry', 'company', 'project'] as const
const CRITICAL_PATH_RULE_CANDIDATE_ASSET_KEY = 'critical_path_rule_candidate'

type CriticalPathPlanNetworkOutcomeStatus = 'accepted' | 'weak'

function normalizeCriticalPathRuleLearningScopes(
  scopes: readonly CriticalPathRuleLearningScopeEvidence[] | undefined,
): Array<typeof CRITICAL_PATH_RULE_LEARNING_SCOPE_ORDER[number]> {
  const normalized = new Set<typeof CRITICAL_PATH_RULE_LEARNING_SCOPE_ORDER[number]>()
  for (const scope of scopes ?? []) {
    const value = String(scope ?? '').trim().toLowerCase()
    if (value === 'system' || value === 'global') normalized.add('global')
    if (value === 'industry' || value === 'industry_baseline' || value === 'segment_baseline') normalized.add('industry')
    if (value === 'company') normalized.add('company')
    if (value === 'project') normalized.add('project')
  }
  return CRITICAL_PATH_RULE_LEARNING_SCOPE_ORDER.filter((scope) => normalized.has(scope))
}

export function evaluateCriticalPathRuleCandidateLiveLearningEvidence(
  input: CriticalPathRuleCandidateLiveLearningEvidenceInput,
): CriticalPathRuleCandidateLiveLearningEvidenceDecision {
  const snapshot = input.criticalPathSnapshot
  const enabledLearningScopes = normalizeCriticalPathRuleLearningScopes(input.enabledLearningScopes)
  const predictionEventRecorded = Boolean(
    snapshot.networkLineage?.criticalPathInputHash
      && snapshot.networkLineage?.criticalSetHash
      && (
        snapshot.autoTaskIds.length > 0
        || snapshot.displayTaskIds.length > 0
        || snapshot.tasks.length > 0
      ),
  )
  const criticalTaskCount = new Set([
    ...snapshot.autoTaskIds,
    ...snapshot.displayTaskIds,
  ]).size
  const projectedFloatTaskCount = snapshot.tasks.filter((task) => Number.isFinite(task.floatDays)).length
  const criticalPathProjectionEvidencePresent = criticalTaskCount > 0 && projectedFloatTaskCount > 0
  const actualOutcomeEventRecorded = input.criticalPathOutcomeEventRecorded && snapshot.projectDurationDays > 0
  const hasAllLearningScopes = CRITICAL_PATH_RULE_LEARNING_SCOPE_ORDER.every((scope) => enabledLearningScopes.includes(scope))

  const liveLearningEvidence: CriticalPathRuleCandidateLiveLearningEvidence = {
    assetClassificationRegistered: true,
    predictionEventRecorded,
    actualOutcomeEventRecorded,
    tieredLearningPolicyRegistered: true,
    enabledLearningScopes,
    runtimeConsumerUsesPublishedArtifact: input.runtimeConsumerUsesPublishedArtifact,
    criticalPathProjectionEvidencePresent,
    approvedCriticalPathRuleCandidateRecorded: input.approvedCriticalPathRuleCandidateRecorded,
    criticalPathRulePublicationWriterReady: input.criticalPathRulePublicationWriterReady,
    criticalPathRuleLineageRecorded: input.criticalPathRuleLineageRecorded,
    criticalPathFactsRemainLocked: true,
    releaseExitApproved: input.releaseExitApproved,
    impactMonitoringReady: input.impactMonitoringReady,
    rollbackTargetReady: input.rollbackTargetReady,
    accuracyMetricsAvailable: input.accuracyMetricsAvailable,
    criticalTaskCount,
    projectedFloatTaskCount,
  }

  const missingReasons: string[] = []
  if (!predictionEventRecorded || !criticalPathProjectionEvidencePresent) {
    missingReasons.push('critical_path_prediction_snapshot_required')
  }
  if (!actualOutcomeEventRecorded) {
    missingReasons.push('critical_path_actual_outcome_required')
  }
  if (!input.approvedCriticalPathRuleCandidateRecorded) {
    missingReasons.push('approved_critical_path_rule_candidate_required')
  }
  if (!input.criticalPathRulePublicationWriterReady) {
    missingReasons.push('critical_path_rule_publication_writer_required')
  }
  if (!input.criticalPathRuleLineageRecorded) {
    missingReasons.push('critical_path_rule_lineage_required')
  }
  if (!input.runtimeConsumerUsesPublishedArtifact) {
    missingReasons.push('runtime_consumer_publication_required')
  }
  if (!hasAllLearningScopes) {
    missingReasons.push('global_industry_company_project_learning_scopes_required')
  }
  if (!input.releaseExitApproved) {
    missingReasons.push('release_exit_required')
  }
  if (!input.impactMonitoringReady) {
    missingReasons.push('impact_monitoring_required')
  }
  if (!input.rollbackTargetReady) {
    missingReasons.push('rollback_target_required')
  }
  if (!input.accuracyMetricsAvailable) {
    missingReasons.push('accuracy_metrics_required')
  }

  return {
    status: missingReasons.length === 0
      ? 'critical_path_rule_candidate_live_learning_ready'
      : 'critical_path_rule_candidate_live_learning_not_ready',
    liveLearningEvidence,
    missingReasons,
  }
}

function cloneCriticalPathSnapshot(snapshot: CriticalPathSnapshot): CriticalPathSnapshot {
  return {
    ...snapshot,
    primaryChain: snapshot.primaryChain
      ? {
        ...snapshot.primaryChain,
        taskIds: [...snapshot.primaryChain.taskIds],
      }
      : null,
    alternateChains: snapshot.alternateChains.map((chain) => ({
      ...chain,
      taskIds: [...chain.taskIds],
    })),
    displayTaskIds: [...snapshot.displayTaskIds],
    watchedTaskIds: [...snapshot.watchedTaskIds],
    edges: snapshot.edges.map((edge) => ({ ...edge })),
    tasks: snapshot.tasks.map((task) => ({ ...task })),
    cycleTaskIds: snapshot.cycleTaskIds ? [...snapshot.cycleTaskIds] : undefined,
    networkLineage: snapshot.networkLineage
      ? {
        ...snapshot.networkLineage,
        baselineVersionIds: [...snapshot.networkLineage.baselineVersionIds],
        baselineItemIds: [...snapshot.networkLineage.baselineItemIds],
      }
      : undefined,
  }
}

function rememberCriticalPathSnapshot(projectId: string, snapshot: CriticalPathSnapshot) {
  criticalPathSnapshotCache.set(projectId, cloneCriticalPathSnapshot(snapshot))
}

function getCachedCriticalPathSnapshot(projectId: string): CriticalPathSnapshot | null {
  const cached = criticalPathSnapshotCache.get(projectId)
  return cached ? cloneCriticalPathSnapshot(cached) : null
}

interface CriticalPathTaskRow {
  id: string
  project_id: string
  title?: string | null
  name?: string | null
  start_date?: string | null
  end_date?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
  status?: string | null
  progress?: number | string | null
  is_milestone?: boolean | null
  milestone_level?: number | null
  wbs_level?: number | null
  standard_work_code?: string | null
  execution_lane?: string | null
  metadata?: Record<string, unknown> | null
  standard_task_metadata?: Record<string, unknown> | null
  baseline_item_id?: string | null
  baseline_version_id?: string | null
  updated_at?: string | null
  created_at?: string | null
}

interface CriticalPathDependencyRow {
  id?: string | null
  task_id: string
  dependency_task_id: string
  dependency_type?: string | null
  lag_days?: number | string | null
  required_for_start?: boolean | null
  status?: string | null
  created_at?: string | null
}

interface TaskNode {
  id: string
  name: string
  duration: number
  p50DurationDays?: number
  p80DurationDays?: number
  standardDeviationDays?: number
  confidenceBandWidthDays?: number
  startDate?: Date
  endDate?: Date
  durationSource?: 'planned_window' | 'e2_remaining_forecast'
  resourceClass?: string | null
  resourceCapacity?: number | null
}

interface CriticalDependencyEdge {
  id: string
  fromTaskId: string
  toTaskId: string
  dependencyType: CriticalDependencyType
  lagDays: number
  weight: number
  source: 'dependency' | 'resource_constraint'
}

interface CPMResult {
  criticalPath: string[]
  criticalEdges: CriticalDependencyEdge[]
  dependencyEdges: CriticalDependencyEdge[]
  projectDuration: number
  earliestStart: Map<string, number>
  earliestFinish: Map<string, number>
  latestStart: Map<string, number>
  latestFinish: Map<string, number>
  float: Map<string, number>
  orderedTaskIds: string[]
  taskMap: Map<string, TaskNode>
}

type ProjectOwnerRow = {
  id: string
  owner_id?: string | null
}

type ProjectMemberRow = {
  project_id: string
  user_id: string
  role?: string | null
  permission_level?: string | null
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`
}

function stableHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableSerialize(value)).digest('hex')}`
}

function toPredictionContextRecord(value: CriticalPathNetworkLineage): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value))
}

async function getProjectRecipients(projectId: string) {
  const [project, members] = await Promise.all([
    executeSQL<ProjectOwnerRow>('SELECT id, owner_id FROM projects WHERE id = ?', [projectId]),
    executeSQL<ProjectMemberRow>('SELECT project_id, user_id, role, permission_level FROM project_members WHERE project_id = ?', [projectId]),
  ])

  return uniqueStrings([
    project[0]?.owner_id ?? null,
    ...(members ?? [])
      .filter((member) => normalizeProjectPermissionLevel(member.permission_level ?? member.role) === 'owner')
      .map((member) => member.user_id),
  ])
}

async function syncCriticalPathFailureNotification(projectId: string, failureMessage: string | null) {
  const existingRows = await listNotifications({
    projectId,
    sourceEntityType: 'critical_path_calculation',
  })
  const activeExisting = existingRows.filter((row) => String(row.status ?? '').trim().toLowerCase() !== 'resolved')

  if (!failureMessage) {
    await Promise.all(
      activeExisting.map((row) => updateNotificationById(row.id, {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        is_read: true,
      })),
    )
    return null
  }

  const recipients = await getProjectRecipients(projectId)
  if (recipients.length === 0) return null

  const current = activeExisting[0]
  const payload: Notification = {
    id: current?.id ?? uuidv4(),
    project_id: projectId,
    type: 'critical_path_calculation_failed',
    notification_type: 'system-exception',
    severity: 'warning',
    level: 'warning',
    title: '关键路径计算失败，已回退到兜底排序',
    content: `关键路径计算未能完成，系统已切换到兜底排序。原因：${failureMessage}`,
    is_read: current?.is_read ?? false,
    is_broadcast: false,
    source_entity_type: 'critical_path_calculation',
    source_entity_id: projectId,
    category: 'planning_governance',
    recipients,
    status: current?.status ?? 'unread',
    metadata: {
      reason: failureMessage,
      fallback: 'deterministic_ordering',
    },
    created_at: current?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (current) {
    await updateNotificationById(current.id, {
      title: payload.title,
      content: payload.content,
      severity: payload.severity,
      level: payload.level,
      status: 'unread',
      is_read: false,
      metadata: payload.metadata,
      recipients,
      resolved_at: null,
      updated_at: payload.updated_at,
    })
    return { ...current, ...payload, status: 'unread', is_read: false, resolved_at: null } as Notification
  }

  return await notificationTouchpointService.emit({
    ...payload,
    touchpoint_type: 'dashboard_todo',
    scope_type: 'project',
    dedupe_key: `critical_path_calculation:${projectId}`,
    target_route: `/projects/${projectId}/gantt`,
    target_label: '查看关键路径',
  })
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeDate(value?: string | null) {
  const parsed = parseDate(value)
  return parsed ? parsed.toISOString().slice(0, 10) : null
}

function earliestDate(values: Array<string | null | undefined>) {
  return values
    .map(normalizeDate)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(0) ?? null
}

function latestDate(values: Array<string | null | undefined>) {
  return values
    .map(normalizeDate)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null
}

function isCompletedCriticalPathRow(row: CriticalPathTaskRow) {
  const status = String(row.status ?? '').trim().toLowerCase()
  return status === 'completed' || normalizeDate(row.actual_end_date) !== null || Number(row.progress ?? 0) >= 100
}

function cpmSpanDays(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  calendar?: ConstructionCalendarContext | null,
) {
  const startDate = typeof start === 'string' ? parseDate(start) : start ?? null
  const endDate = typeof end === 'string' ? parseDate(end) : end ?? null
  if (!startDate || !endDate) return null
  if (calendar?.windows?.length) {
    return Math.max(1, productionDaysBetweenInclusive(startDate, endDate, calendar))
  }
  return inclusiveDurationDays(startDate, endDate)
}

async function resolveCriticalPathConstructionCalendar(projectId: string) {
  return resolveConstructionCalendarContext({
    projectId,
    onError: (error) => logger.warn('[projectCriticalPathService] failed to resolve construction calendar', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    }),
  })
}

function buildCompletedProjectActualSpan(rows: CriticalPathTaskRow[], calendar?: ConstructionCalendarContext | null) {
  const durationRows = rows.filter((row) => !row.is_milestone)
  if (durationRows.length === 0) return null
  if (!durationRows.every(isCompletedCriticalPathRow)) return null
  const actualStartDate = earliestDate(durationRows.map((row) => row.actual_start_date))
  const actualFinishDate = latestDate(durationRows.map((row) => row.actual_end_date))
  const actualDurationDays = cpmSpanDays(actualStartDate, actualFinishDate, calendar)
  if (!actualStartDate || !actualFinishDate || !actualDurationDays) return null
  return { actualStartDate, actualFinishDate, actualDurationDays }
}

function criticalPathOutcomeToleranceDays(predictedDurationDays: number) {
  return Math.max(2, Math.round(Math.max(1, predictedDurationDays) * 0.2))
}

function criticalPathPlanNetworkOutcomeStatus(params: {
  snapshot: CriticalPathSnapshot
  actualDurationDays: number
}): CriticalPathPlanNetworkOutcomeStatus {
  const predictedDurationDays = Math.max(0, Math.round(params.snapshot.projectDurationDays))
  const durationErrorDays = Math.abs(params.actualDurationDays - predictedDurationDays)
  const toleranceDays = criticalPathOutcomeToleranceDays(predictedDurationDays)
  return predictedDurationDays > 0
    && params.snapshot.autoTaskIds.length > 0
    && durationErrorDays <= toleranceDays
    ? 'accepted'
    : 'weak'
}

async function recordCriticalPathRulePlanNetworkOutcome(params: {
  projectId: string
  snapshot: CriticalPathSnapshot
  actualSpan: {
    actualStartDate: string
    actualFinishDate: string
    actualDurationDays: number
  }
}) {
  const { projectId, snapshot, actualSpan } = params
  const networkLineage = snapshot.networkLineage
  if (
    snapshot.calculationStatus !== 'fresh'
    || !networkLineage?.criticalPathInputHash
    || !networkLineage.criticalSetHash
    || snapshot.projectDurationDays <= 0
  ) {
    return
  }

  const predictedDurationDays = Math.max(0, Math.round(snapshot.projectDurationDays))
  const durationErrorDays = Math.abs(actualSpan.actualDurationDays - predictedDurationDays)
  const outcomeToleranceDays = criticalPathOutcomeToleranceDays(predictedDurationDays)
  const projectedFloatTaskCount = snapshot.tasks.filter((task) => Number.isFinite(task.floatDays)).length
  const outcomeStatus = criticalPathPlanNetworkOutcomeStatus({
    snapshot,
    actualDurationDays: actualSpan.actualDurationDays,
  })
  const metadata = {
    source: 'project_critical_path_cpm',
    algorithm_version: networkLineage.criticalPathAlgorithmVersion,
    prediction_duration_days: predictedDurationDays,
    actual_duration_days: actualSpan.actualDurationDays,
    duration_error_days: durationErrorDays,
    outcome_tolerance_days: outcomeToleranceDays,
    actual_start_date: actualSpan.actualStartDate,
    actual_finish_date: actualSpan.actualFinishDate,
    calculation_status: snapshot.calculationStatus,
    calculated_at: snapshot.calculatedAt ?? null,
    critical_path_input_hash: networkLineage.criticalPathInputHash,
    critical_set_hash: networkLineage.criticalSetHash,
    task_network_input_hash: networkLineage.taskNetworkInputHash,
    dependency_input_hash: networkLineage.dependencyInputHash,
    dependency_rule_version: networkLineage.dependencyRuleVersion,
    baseline_version_ids: networkLineage.baselineVersionIds,
    baseline_item_ids: networkLineage.baselineItemIds,
    baseline_version_source: networkLineage.baselineVersionSource,
    auto_task_ids: snapshot.autoTaskIds,
    manual_attention_task_ids: snapshot.manualAttentionTaskIds,
    manual_inserted_task_ids: snapshot.manualInsertedTaskIds,
    primary_chain_task_ids: snapshot.primaryChain?.taskIds ?? [],
    alternate_chain_count: snapshot.alternateChains.length,
    edge_count: snapshot.edges.length,
    critical_task_count: snapshot.autoTaskIds.length,
    projected_float_task_count: projectedFloatTaskCount,
    writes_runtime_directly: false,
    writes_fact_directly: false,
  }

  try {
    await rawQuery(
      `INSERT INTO public.duration_plan_network_outcomes (
        id,
        asset_key,
        outcome_status,
        outcome_ref,
        company_id,
        project_id,
        publication_key,
        metadata,
        writes_runtime_directly,
        writes_fact_directly
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        outcome_status = EXCLUDED.outcome_status,
        outcome_ref = EXCLUDED.outcome_ref,
        company_id = EXCLUDED.company_id,
        project_id = EXCLUDED.project_id,
        publication_key = EXCLUDED.publication_key,
        observed_at = now(),
        metadata = EXCLUDED.metadata,
        writes_runtime_directly = false,
        writes_fact_directly = false`,
      [
        `critical-path-cpm:${projectId}:${networkLineage.criticalSetHash}`,
        CRITICAL_PATH_RULE_CANDIDATE_ASSET_KEY,
        outcomeStatus,
        `critical_path_cpm:${projectId}:${networkLineage.criticalPathInputHash}`,
        null,
        projectId,
        null,
        metadata,
        false,
        false,
      ],
    )
  } catch (error) {
    logger.warn('[projectCriticalPathService] failed to record critical path plan-network outcome', {
      projectId,
      criticalSetHash: networkLineage.criticalSetHash,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function normalizeDependencyType(value: unknown): CriticalDependencyType {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'SS' || normalized === 'FF' || normalized === 'SF') return normalized
  return 'FS'
}

function normalizeLagDays(value: unknown): number {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed)) return 0
  return Math.trunc(parsed)
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function isActiveRequiredDependency(row: CriticalPathDependencyRow): boolean {
  const status = String(row.status ?? 'active').trim().toLowerCase()
  if (status && status !== 'active') return false
  return row.required_for_start !== false
}

function getDependencyWeight(
  dependencyType: CriticalDependencyType,
  lagDays: number,
  fromTask: TaskNode,
  toTask: TaskNode,
): number {
  switch (dependencyType) {
    case 'SS':
      return lagDays
    case 'FF':
      return fromTask.duration + lagDays - toTask.duration
    case 'SF':
      return lagDays - toTask.duration
    case 'FS':
    default:
      return fromTask.duration + lagDays
  }
}

function buildDependencyEdges(tasks: TaskNode[], dependencies: CriticalPathDependencyRow[]): CriticalDependencyEdge[] {
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  const seen = new Set<string>()
  const edges: CriticalDependencyEdge[] = []

  dependencies.forEach((dependency, index) => {
    if (!isActiveRequiredDependency(dependency)) return
    const fromTask = taskMap.get(dependency.dependency_task_id)
    const toTask = taskMap.get(dependency.task_id)
    if (!fromTask || !toTask || fromTask.id === toTask.id) return

    const dependencyType = normalizeDependencyType(dependency.dependency_type)
    const lagDays = normalizeLagDays(dependency.lag_days)
    const key = `${fromTask.id}->${toTask.id}:${dependencyType}:${lagDays}`
    if (seen.has(key)) return
    seen.add(key)

    edges.push({
      id: dependency.id || `dependency:${key}:${index}`,
      fromTaskId: fromTask.id,
      toTaskId: toTask.id,
      dependencyType,
      lagDays,
      weight: getDependencyWeight(dependencyType, lagDays, fromTask, toTask),
      source: 'dependency',
    })
  })

  return edges
}

function readTaskResourceClass(row: CriticalPathTaskRow) {
  const metadata = readRecord(row.metadata)
  const standardTaskMetadata = readRecord(row.standard_task_metadata)
  const resourceProfile = readRecord(metadata.resourceProfile ?? metadata.resource_profile ?? standardTaskMetadata.resourceProfile ?? standardTaskMetadata.resource_profile)
  const explicit = normalizeText(
    resourceProfile.resourceClass
      ?? resourceProfile.resource_class
      ?? resourceProfile.primaryResourceClass
      ?? resourceProfile.primary_resource_class,
  ).toLowerCase()
  if (explicit) return explicit
  const standardWorkCode = normalizeText(
    row.standard_work_code
      ?? metadata.standardWorkCode
      ?? metadata.standard_work_code
      ?? standardTaskMetadata.standardWorkCode
      ?? standardTaskMetadata.standard_work_code,
  ).toLowerCase()
  if (standardWorkCode.includes('concrete') || standardWorkCode.includes('cast_in_place')) return 'concrete_pour'
  if (standardWorkCode.includes('rebar')) return 'rebar'
  if (standardWorkCode.includes('formwork')) return 'formwork'
  if (standardWorkCode.includes('waterproof')) return 'waterproof'
  if (standardWorkCode.includes('hvac')) return 'hvac'
  if (standardWorkCode.includes('electrical')) return 'electrical'
  const lane = normalizeText(row.execution_lane ?? metadata.executionLane ?? metadata.execution_lane).toLowerCase()
  return lane || null
}

function readTaskResourceCapacity(row: CriticalPathTaskRow, resourceClass: string | null) {
  const metadata = readRecord(row.metadata)
  const standardTaskMetadata = readRecord(row.standard_task_metadata)
  const resourceProfile = readRecord(metadata.resourceProfile ?? metadata.resource_profile ?? standardTaskMetadata.resourceProfile ?? standardTaskMetadata.resource_profile)
  const raw = resourceProfile.parallelCapacity
    ?? resourceProfile.parallel_capacity
    ?? resourceProfile.capacity
    ?? metadata.parallelCapacity
    ?? metadata.parallel_capacity
  const numeric = Number(raw)
  if (Number.isFinite(numeric) && numeric > 0) return Math.ceil(numeric)
  const normalized = normalizeText(raw).toLowerCase()
  if (normalized === 'low') return 1
  if (normalized === 'medium') return 2
  if (normalized === 'high') return 3
  if (!resourceClass) return null
  if (['concrete_pour', 'tower_crane', 'waterproof'].includes(resourceClass)) return 1
  if (['rebar', 'formwork', 'plaster', 'hvac', 'electrical'].includes(resourceClass)) return 2
  return 3
}

function wouldCreateDependencyCycle(edges: CriticalDependencyEdge[], fromTaskId: string, toTaskId: string) {
  const successors = new Map<string, string[]>()
  for (const edge of edges) {
    successors.set(edge.fromTaskId, [...(successors.get(edge.fromTaskId) ?? []), edge.toTaskId])
  }
  const stack = [toTaskId]
  const visited = new Set<string>()
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === fromTaskId) return true
    if (visited.has(current)) continue
    visited.add(current)
    stack.push(...(successors.get(current) ?? []))
  }
  return false
}

function buildResourceConstraintEdges(tasks: TaskNode[], existingEdges: CriticalDependencyEdge[]): CriticalDependencyEdge[] {
  const byResource = new Map<string, TaskNode[]>()
  for (const task of tasks) {
    if (!task.resourceClass || !task.resourceCapacity || task.resourceCapacity <= 0) continue
    byResource.set(task.resourceClass, [...(byResource.get(task.resourceClass) ?? []), task])
  }

  const edges = [...existingEdges]
  const resourceEdges: CriticalDependencyEdge[] = []
  const seen = new Set(existingEdges.map((edge) => `${edge.fromTaskId}->${edge.toTaskId}`))
  for (const [resourceClass, resourceTasks] of byResource.entries()) {
    const sorted = [...resourceTasks].sort((left, right) => {
      const leftStart = left.startDate?.getTime() ?? 0
      const rightStart = right.startDate?.getTime() ?? 0
      if (leftStart !== rightStart) return leftStart - rightStart
      return left.id.localeCompare(right.id)
    })
    const capacity = Math.max(1, Math.min(...sorted.map((task) => task.resourceCapacity ?? 1)))
    if (sorted.length <= capacity) continue
    for (let index = capacity; index < sorted.length; index += 1) {
      const fromTask = sorted[index - capacity]
      const toTask = sorted[index]
      const key = `${fromTask.id}->${toTask.id}`
      if (seen.has(key) || wouldCreateDependencyCycle(edges, fromTask.id, toTask.id)) continue
      const edge: CriticalDependencyEdge = {
        id: `resource:${resourceClass}:${fromTask.id}:${toTask.id}`,
        fromTaskId: fromTask.id,
        toTaskId: toTask.id,
        dependencyType: 'FS',
        lagDays: 0,
        weight: fromTask.duration,
        source: 'resource_constraint',
      }
      resourceEdges.push(edge)
      edges.push(edge)
      seen.add(key)
    }
  }
  return resourceEdges
}

function topologicalSort(tasks: TaskNode[], dependencyEdges: CriticalDependencyEdge[]): string[] {
  const result: string[] = []
  const visited = new Set<string>()
  const temp = new Set<string>()
  const predecessors = new Map<string, string[]>()

  for (const task of tasks) {
    predecessors.set(task.id, [])
  }
  for (const edge of dependencyEdges) {
    predecessors.set(edge.toTaskId, [...(predecessors.get(edge.toTaskId) ?? []), edge.fromTaskId])
  }

  function visit(taskId: string) {
    if (temp.has(taskId)) {
      throw new Error(`CRITICAL_PATH_CYCLE_DETECTED:${taskId}`)
    }
    if (visited.has(taskId)) {
      return
    }

    temp.add(taskId)
    for (const depId of predecessors.get(taskId) ?? []) {
      visit(depId)
    }
    temp.delete(taskId)
    visited.add(taskId)
    result.push(taskId)
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      visit(task.id)
    }
  }

  return result
}

function calculateCPM(tasks: TaskNode[], dependencies: CriticalPathDependencyRow[] = []): CPMResult {
  if (tasks.length === 0) {
    return {
      criticalPath: [],
      criticalEdges: [],
      dependencyEdges: [],
      projectDuration: 0,
      earliestStart: new Map(),
      earliestFinish: new Map(),
      latestStart: new Map(),
      latestFinish: new Map(),
      float: new Map(),
      orderedTaskIds: [],
      taskMap: new Map(),
    }
  }

  const taskMap = new Map<string, TaskNode>()
  for (const task of tasks) {
    taskMap.set(task.id, task)
  }

  const explicitDependencyEdges = buildDependencyEdges(tasks, dependencies)
  const dependencyEdges = [
    ...explicitDependencyEdges,
    ...buildResourceConstraintEdges(tasks, explicitDependencyEdges),
  ]
  const successors = new Map<string, CriticalDependencyEdge[]>()
  const predecessors = new Map<string, CriticalDependencyEdge[]>()
  for (const task of tasks) {
    successors.set(task.id, [])
    predecessors.set(task.id, [])
  }
  for (const edge of dependencyEdges) {
    successors.set(edge.fromTaskId, [...(successors.get(edge.fromTaskId) ?? []), edge])
    predecessors.set(edge.toTaskId, [...(predecessors.get(edge.toTaskId) ?? []), edge])
  }

  const sortedTasks = topologicalSort(tasks, dependencyEdges)
  const earliestStart = new Map<string, number>()
  const earliestFinish = new Map<string, number>()

  for (const taskId of sortedTasks) {
    const task = taskMap.get(taskId)!
    let nextEarliestStart = 0
    for (const edge of predecessors.get(taskId) ?? []) {
      nextEarliestStart = Math.max(nextEarliestStart, (earliestStart.get(edge.fromTaskId) ?? 0) + edge.weight)
    }

    earliestStart.set(taskId, nextEarliestStart)
    earliestFinish.set(taskId, nextEarliestStart + task.duration)
  }

  let projectDuration = 0
  for (const finish of earliestFinish.values()) {
    projectDuration = Math.max(projectDuration, finish)
  }

  const latestFinish = new Map<string, number>()
  const latestStart = new Map<string, number>()
  const reverseSorted = [...sortedTasks].reverse()

  for (const taskId of reverseSorted) {
    const task = taskMap.get(taskId)!
    const taskSuccessors = successors.get(taskId) || []

    if (taskSuccessors.length === 0) {
      latestFinish.set(taskId, projectDuration)
      latestStart.set(taskId, projectDuration - task.duration)
    } else {
      let minStart = Number.POSITIVE_INFINITY
      for (const edge of taskSuccessors) {
        const successorStart = latestStart.get(edge.toTaskId)
        if (successorStart !== undefined) {
          minStart = Math.min(minStart, successorStart - edge.weight)
        }
      }
      const nextLatestStart = Number.isFinite(minStart) ? minStart : projectDuration - task.duration
      latestStart.set(taskId, nextLatestStart)
      latestFinish.set(taskId, nextLatestStart + task.duration)
    }
  }

  const float = new Map<string, number>()
  for (const task of tasks) {
    const ls = latestStart.get(task.id) ?? 0
    const es = earliestStart.get(task.id) ?? 0
    float.set(task.id, ls - es)
  }

  const criticalSet = new Set<string>()
  for (const task of tasks) {
    if ((float.get(task.id) ?? 0) <= 0) {
      criticalSet.add(task.id)
    }
  }
  const criticalPath = sortedTasks.filter((taskId) => criticalSet.has(taskId))
  const criticalEdges = dependencyEdges.filter((edge) => {
    if (!criticalSet.has(edge.fromTaskId) || !criticalSet.has(edge.toTaskId)) return false
    const fromStart = earliestStart.get(edge.fromTaskId) ?? 0
    const toStart = earliestStart.get(edge.toTaskId) ?? 0
    return toStart - (fromStart + edge.weight) <= 0
  })

  return {
    criticalPath,
    criticalEdges,
    dependencyEdges,
    projectDuration,
    earliestStart,
    earliestFinish,
    latestStart,
    latestFinish,
    float,
    orderedTaskIds: sortedTasks,
    taskMap,
  }
}

function buildFreeFloatDays(taskId: string, analysis: CPMResult): number {
  const taskSuccessors = analysis.dependencyEdges.filter((edge) => edge.fromTaskId === taskId)
  const totalFloat = Math.max(0, Math.round(analysis.float.get(taskId) ?? 0))
  if (taskSuccessors.length === 0) return totalFloat

  const fromStart = analysis.earliestStart.get(taskId) ?? 0
  const freeFloat = Math.min(...taskSuccessors.map((edge) => {
    const successorStart = analysis.earliestStart.get(edge.toTaskId) ?? 0
    return successorStart - (fromStart + edge.weight)
  }))
  return Math.max(0, Math.round(Number.isFinite(freeFloat) ? freeFloat : totalFloat))
}

function criticalityWeightFromFloat(isCritical: boolean, totalFloatDays: number, freeFloatDays: number) {
  if (isCritical) return 1.35
  if (totalFloatDays <= 2 || freeFloatDays <= 0) return 1.2
  if (totalFloatDays <= 5 || freeFloatDays <= 2) return 1.1
  return 1
}

async function persistCriticalPathTaskProjection(projectId: string, analysis: CPMResult, criticalTaskIds: Set<string>) {
  if (analysis.taskMap.size === 0) return
  const updatedAt = new Date().toISOString()
  await Promise.all([...analysis.taskMap.keys()].map(async (taskId) => {
    const totalFloatDays = Math.max(0, Math.round(analysis.float.get(taskId) ?? 0))
    const freeFloatDays = buildFreeFloatDays(taskId, analysis)
    const isCritical = criticalTaskIds.has(taskId)
    await executeSQL(
      `UPDATE tasks
          SET is_critical = ?,
              total_float_days = ?,
              free_float_days = ?,
              criticality_weight = ?,
              updated_at = ?
        WHERE id = ?
          AND project_id = ?`,
      [
        isCritical,
        totalFloatDays,
        freeFloatDays,
        criticalityWeightFromFloat(isCritical, totalFloatDays, freeFloatDays),
        updatedAt,
        taskId,
        projectId,
      ],
    )
  }))
}

function isRuntimeInProgressRow(row: CriticalPathTaskRow) {
  const status = String(row.status ?? '').trim().toLowerCase()
  const progress = Number(row.progress ?? 0)
  return status === 'in_progress'
    || Boolean(row.actual_start_date && !row.actual_end_date)
    || (Number.isFinite(progress) && progress > 0 && progress < 100)
}

function readPositiveInt(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function buildTaskNodes(
  rows: CriticalPathTaskRow[],
  currentForecasts = new Map<string, TaskDurationForecast>(),
  calendar?: ConstructionCalendarContext | null,
): TaskNode[] {
  const eligibleTasks = rows.filter((row) => {
    const startDate = parseDate(row.start_date ?? row.planned_start_date)
    const endDate = parseDate(row.end_date ?? row.planned_end_date)
    return Boolean(startDate && endDate)
  })

  return eligibleTasks.map((task) => {
    const startDate = parseDate(task.start_date ?? task.planned_start_date)!
    const endDate = parseDate(task.end_date ?? task.planned_end_date)!
    const currentForecast = currentForecasts.get(task.id)
    const probabilityDuration = currentForecast?.probabilityDuration ?? null
    const forecastRemainingDays = isRuntimeInProgressRow(task)
      ? readPositiveInt(currentForecast?.remainingDurationDays)
      : null
    const duration = forecastRemainingDays ?? cpmSpanDays(startDate, endDate, calendar) ?? 1
    const p50DurationDays = readPositiveInt((probabilityDuration as any)?.p50RemainingDays)
    const p80DurationDays = readPositiveInt((probabilityDuration as any)?.p80RemainingDays)
    const standardDeviationDays = readPositiveInt((probabilityDuration as any)?.standardDeviationDays)
    const confidenceBandWidthDays = readPositiveInt((probabilityDuration as any)?.confidenceBandWidthDays)
    const resourceClass = readTaskResourceClass(task)
    const resourceCapacity = readTaskResourceCapacity(task, resourceClass)

    return {
      id: task.id,
      name: task.title || task.name || task.id,
      duration,
      ...(p50DurationDays ? { p50DurationDays } : {}),
      ...(p80DurationDays ? { p80DurationDays } : {}),
      ...(standardDeviationDays ? { standardDeviationDays } : {}),
      ...(confidenceBandWidthDays ? { confidenceBandWidthDays } : {}),
      startDate,
      endDate,
      durationSource: forecastRemainingDays ? 'e2_remaining_forecast' : 'planned_window',
      resourceClass,
      resourceCapacity,
    }
  })
}

async function loadCurrentForecastMapForCriticalPath(rows: CriticalPathTaskRow[]) {
  const taskIds = rows.map((row) => row.id).filter(Boolean)
  if (taskIds.length === 0) return new Map<string, TaskDurationForecast>()
  try {
    const forecasts = await listCurrentTaskDurationForecasts(taskIds, { maxAgeMs: null })
    return new Map(forecasts.map((forecast) => [forecast.taskId, forecast]))
  } catch (error) {
    logger.warn('[projectCriticalPathService] failed to load E2 task duration forecasts for CPM', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Map<string, TaskDurationForecast>()
  }
}

function getTaskDurationDays(row?: CriticalPathTaskRow | null, calendar?: ConstructionCalendarContext | null): number {
  if (!(row?.start_date ?? row?.planned_start_date)) return 0
  const endValue = row.end_date ?? row.planned_end_date
  if (!endValue) return 0

  const startDate = parseDate(row.start_date ?? row.planned_start_date)
  const endDate = parseDate(endValue)
  if (!startDate || !endDate) return 0

  return cpmSpanDays(startDate, endDate, calendar) ?? 0
}

function dateFromCpmOffset(offsetDays: number): Date {
  return new Date(Date.UTC(2000, 0, 1 + offsetDays))
}

function normalizeOverrideRow(row: CriticalPathOverrideRow): CriticalPathOverrideRow {
  return {
    ...row,
    anchor_type: row.anchor_type ?? null,
    left_task_id: row.left_task_id ?? null,
    right_task_id: row.right_task_id ?? null,
    reason: row.reason ?? null,
    created_by: row.created_by ?? null,
  }
}

function makeError(code: string, statusCode: number, message: string, details?: unknown) {
  const error = new Error(message) as Error & { code: string; statusCode: number; details?: unknown }
  error.code = code
  error.statusCode = statusCode
  error.details = details
  return error
}

async function loadCriticalPathTaskRows(projectId: string): Promise<CriticalPathTaskRow[]> {
  if (process.env.NODE_ENV !== 'test') {
    try {
      const result = await rawQuery(
        `SELECT id, project_id, title, NULL::text AS name, start_date, end_date, planned_start_date, planned_end_date,
                actual_start_date, actual_end_date, status, progress,
                is_milestone, milestone_level, wbs_level, standard_work_code, standard_task_metadata, created_at
           FROM public.tasks
          WHERE project_id = $1
          ORDER BY created_at ASC`,
        [projectId],
      )
      return result.rows as CriticalPathTaskRow[]
    } catch (error) {
      logger.warn('[projectCriticalPathService] direct task read failed, falling back to dbService', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const rows = await executeSQL<CriticalPathTaskRow>(
    'SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC',
    [projectId],
  )
  return (rows || []) as CriticalPathTaskRow[]
}

async function loadCriticalPathOverrideRows(projectId: string): Promise<CriticalPathOverrideRow[]> {
  if (process.env.NODE_ENV !== 'test') {
    try {
      const result = await rawQuery(
        `SELECT *
           FROM public.task_critical_overrides
          WHERE project_id = $1
          ORDER BY created_at ASC, id ASC`,
        [projectId],
      )
      return (result.rows as CriticalPathOverrideRow[]).map(normalizeOverrideRow)
    } catch (error) {
      logger.warn('[projectCriticalPathService] direct override read failed, falling back to dbService', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const rows = await executeSQL<CriticalPathOverrideRow>(
    'SELECT * FROM task_critical_overrides WHERE project_id = ? ORDER BY created_at ASC, id ASC',
    [projectId],
  )
  return ((rows || []) as CriticalPathOverrideRow[]).map(normalizeOverrideRow)
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))]
}

function buildFallbackAutoTaskIds(rows: CriticalPathTaskRow[]): string[] {
  const datedRows = rows
    .filter((row) => parseDate(row.start_date ?? row.planned_start_date) && parseDate(row.end_date ?? row.planned_end_date))
    .sort((left, right) => {
      const leftStart = parseDate(left.start_date ?? left.planned_start_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
      const rightStart = parseDate(right.start_date ?? right.planned_start_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
      if (leftStart !== rightStart) return leftStart - rightStart

      const leftEnd = parseDate(left.end_date ?? left.planned_end_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
      const rightEnd = parseDate(right.end_date ?? right.planned_end_date)?.getTime() ?? Number.MAX_SAFE_INTEGER
      if (leftEnd !== rightEnd) return leftEnd - rightEnd

      const leftCreated = parseDate(left.created_at)?.getTime() ?? Number.MAX_SAFE_INTEGER
      const rightCreated = parseDate(right.created_at)?.getTime() ?? Number.MAX_SAFE_INTEGER
      return leftCreated - rightCreated
    })
    .map((row) => row.id)

  if (datedRows.length > 0) {
    return unique(datedRows)
  }

  const firstRow = rows[0]
  return firstRow ? [firstRow.id] : []
}

function sortTaskIdsByAnalysis(taskIds: string[], analysis: CPMResult): string[] {
  const orderIndex = new Map(analysis.orderedTaskIds.map((taskId, index) => [taskId, index]))
  return [...taskIds].sort((left, right) => {
    const leftIndex = orderIndex.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = orderIndex.get(right) ?? Number.MAX_SAFE_INTEGER
    if (leftIndex !== rightIndex) return leftIndex - rightIndex
    return left.localeCompare(right)
  })
}

function isLevelOneMilestone(row?: CriticalPathTaskRow | null): boolean {
  if (!row?.is_milestone) return false
  if (typeof row.milestone_level === 'number') {
    return row.milestone_level === 1
  }
  if (typeof row.wbs_level === 'number') {
    return row.wbs_level === 1
  }
  return true
}

function getTaskEndSortValue(row: CriticalPathTaskRow | undefined, analysis: CPMResult, taskId: string): number {
  const directEndTime = parseDate(row?.end_date ?? row?.planned_end_date)?.getTime()
  if (directEndTime !== undefined) {
    return directEndTime
  }
  const fallbackFinish = analysis.earliestFinish.get(taskId) ?? analysis.latestFinish.get(taskId) ?? 0
  return dateFromCpmOffset(fallbackFinish).getTime()
}

function getAutoChainElapsedDays(
  taskIds: string[],
  analysis: CPMResult,
  taskMap: Map<string, CriticalPathTaskRow>,
  calendar?: ConstructionCalendarContext | null,
): number {
  if (taskIds.length === 0) return 0

  let earliestStart = Number.MAX_SAFE_INTEGER
  let latestFinish = 0

  for (const taskId of taskIds) {
    earliestStart = Math.min(earliestStart, analysis.earliestStart.get(taskId) ?? Number.MAX_SAFE_INTEGER)
    latestFinish = Math.max(latestFinish, analysis.earliestFinish.get(taskId) ?? 0)
  }

  if (earliestStart !== Number.MAX_SAFE_INTEGER && latestFinish > earliestStart) {
    const startDate = dateFromCpmOffset(earliestStart)
    const endDate = dateFromCpmOffset(latestFinish - 1)
    return inclusiveDurationDays(startDate, endDate) ?? Math.max(1, latestFinish - earliestStart)
  }

  return taskIds.reduce((sum, taskId) => sum + getTaskDurationDays(taskMap.get(taskId), calendar), 0)
}

function buildAutoCriticalChains(
  projectId: string,
  rows: CriticalPathTaskRow[],
  taskMap: Map<string, CriticalPathTaskRow>,
  analysis: CPMResult,
  calendar?: ConstructionCalendarContext | null,
): CriticalChainSnapshot[] {
  const criticalTaskIds = analysis.criticalPath.length > 0
    ? unique(analysis.criticalPath)
    : buildFallbackAutoTaskIds(rows)

  if (criticalTaskIds.length === 0) return []

  if (analysis.criticalPath.length === 0) {
    return [{
      id: `${projectId}-auto-1`,
      source: 'auto',
      taskIds: criticalTaskIds,
      totalDurationDays: criticalTaskIds.reduce((sum, taskId) => sum + getTaskDurationDays(taskMap.get(taskId), calendar), 0),
      displayLabel: '自动关键链 1',
    }]
  }

  const criticalSet = new Set(criticalTaskIds)
  const successors = new Map<string, string[]>()
  const predecessors = new Map<string, string[]>()
  const orderIndex = new Map(analysis.orderedTaskIds.map((taskId, index) => [taskId, index]))

  for (const taskId of criticalTaskIds) {
    successors.set(taskId, [])
    predecessors.set(taskId, [])
  }

  for (const edge of analysis.criticalEdges) {
    if (!criticalSet.has(edge.fromTaskId) || !criticalSet.has(edge.toTaskId)) continue
    predecessors.set(edge.toTaskId, [...(predecessors.get(edge.toTaskId) ?? []), edge.fromTaskId])
    successors.set(edge.fromTaskId, [...(successors.get(edge.fromTaskId) ?? []), edge.toTaskId])
  }

  const sortByAnalysisOrder = (left: string, right: string) => {
    const leftIndex = orderIndex.get(left) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = orderIndex.get(right) ?? Number.MAX_SAFE_INTEGER
    if (leftIndex !== rightIndex) return leftIndex - rightIndex
    return left.localeCompare(right)
  }

  const roots = criticalTaskIds
    .filter((taskId) => (predecessors.get(taskId)?.length ?? 0) === 0)
    .sort(sortByAnalysisOrder)

  const paths: string[][] = []
  const pathKeys = new Set<string>()

  const dfs = (taskId: string, path: string[]) => {
    const nextPath = [...path, taskId]
    const nextTaskIds = [...(successors.get(taskId) ?? [])].sort(sortByAnalysisOrder)
    if (nextTaskIds.length === 0) {
      const key = nextPath.join('>')
      if (!pathKeys.has(key)) {
        pathKeys.add(key)
        paths.push(nextPath)
      }
      return
    }

    for (const nextTaskId of nextTaskIds) {
      dfs(nextTaskId, nextPath)
    }
  }

  for (const rootTaskId of roots) {
    dfs(rootTaskId, [])
  }

  const normalizedPaths = paths.length > 0
    ? paths
    : [sortTaskIdsByAnalysis(criticalTaskIds, analysis)]

  return normalizedPaths.map((taskIds, index) => ({
    id: `${projectId}-auto-${index + 1}`,
    source: 'auto',
    taskIds,
    totalDurationDays: getAutoChainElapsedDays(taskIds, analysis, taskMap, calendar),
    displayLabel: `自动关键链 ${index + 1}`,
  }))
}

function sortAutoCriticalChains(
  projectId: string,
  chains: CriticalChainSnapshot[],
  taskMap: Map<string, CriticalPathTaskRow>,
  analysis: CPMResult,
): { primaryChain: CriticalChainSnapshot | null; alternateChains: CriticalChainSnapshot[]; orderedTaskIds: string[] } {
  const orderIndex = new Map(analysis.orderedTaskIds.map((taskId, index) => [taskId, index]))
  const rankedChains = chains
    .map((chain) => ({
      chain,
      levelOneMilestoneCount: chain.taskIds.filter((taskId) => isLevelOneMilestone(taskMap.get(taskId))).length,
      latestEndTime: chain.taskIds.reduce(
        (max, taskId) => Math.max(max, getTaskEndSortValue(taskMap.get(taskId), analysis, taskId)),
        0,
      ),
      firstOrderIndex: chain.taskIds.reduce((min, taskId) => {
        const index = orderIndex.get(taskId)
        return index === undefined ? min : Math.min(min, index)
      }, Number.MAX_SAFE_INTEGER),
    }))
    .sort((left, right) => {
      if (right.chain.totalDurationDays !== left.chain.totalDurationDays) {
        return right.chain.totalDurationDays - left.chain.totalDurationDays
      }
      if (right.levelOneMilestoneCount !== left.levelOneMilestoneCount) {
        return right.levelOneMilestoneCount - left.levelOneMilestoneCount
      }
      if (right.latestEndTime !== left.latestEndTime) {
        return right.latestEndTime - left.latestEndTime
      }
      if (left.firstOrderIndex !== right.firstOrderIndex) {
        return left.firstOrderIndex - right.firstOrderIndex
      }
      return left.chain.id.localeCompare(right.chain.id)
    })
    .map((entry, index) => ({
      ...entry.chain,
      id: index === 0 ? `${projectId}-primary` : `${projectId}-parallel-${index}`,
      displayLabel: index === 0 ? '主关键路径' : `零浮时平行链 ${index}`,
    }))

  return {
    primaryChain: rankedChains[0] ?? null,
    alternateChains: rankedChains.slice(1),
    orderedTaskIds: unique(rankedChains.flatMap((chain) => chain.taskIds)),
  }
}

function isHighVarianceNearCriticalNode(taskId: string, analysis: CPMResult, criticalTaskIds: Set<string>) {
  if (criticalTaskIds.has(taskId)) return false
  const node = analysis.taskMap.get(taskId)
  if (!node?.p80DurationDays) return false
  const floatDays = Math.max(0, analysis.float.get(taskId) ?? 0)
  if (floatDays <= 0) return false
  const p50DurationDays = node.p50DurationDays ?? node.duration
  const spreadDays = Math.max(
    0,
    node.confidenceBandWidthDays ?? node.p80DurationDays - p50DurationDays,
    node.p80DurationDays - p50DurationDays,
    node.standardDeviationDays ?? 0,
  )
  if (spreadDays <= 0) return false
  const earliestStart = analysis.earliestStart.get(taskId) ?? 0
  const p80Finish = earliestStart + node.p80DurationDays
  return floatDays <= Math.max(2, spreadDays) && p80Finish >= analysis.projectDuration
}

function buildHighVarianceNearCriticalChains(
  projectId: string,
  analysis: CPMResult,
  criticalTaskIds: Set<string>,
): CriticalChainSnapshot[] {
  return analysis.orderedTaskIds
    .filter((taskId) => isHighVarianceNearCriticalNode(taskId, analysis, criticalTaskIds))
    .map((taskId, index) => {
      const node = analysis.taskMap.get(taskId)!
      const p50DurationDays = node.p50DurationDays ?? node.duration
      const p80DurationDays = node.p80DurationDays ?? node.duration
      return {
        id: `${projectId}-near-critical-variance-${index + 1}`,
        source: 'auto' as const,
        taskIds: [taskId],
        totalDurationDays: node.duration,
        p80DurationDays,
        standardDeviationDays: node.standardDeviationDays,
        confidenceBandWidthDays: Math.max(
          0,
          node.confidenceBandWidthDays ?? p80DurationDays - p50DurationDays,
          p80DurationDays - p50DurationDays,
        ),
        isHighVarianceNearCritical: true,
        displayLabel: `楂樻柟宸繎鍏抽敭閾?${index + 1}`,
      } satisfies CriticalChainSnapshot
    })
}

function orderDisplayTaskIds(
  autoTaskIds: string[],
  taskIds: Set<string>,
  manualInsertOverrides: CriticalPathOverrideRow[],
): string[] {
  const order = [...autoTaskIds]

  for (const override of manualInsertOverrides) {
    if (!taskIds.has(override.task_id)) continue

    const nextOrder = order.filter((taskId) => taskId !== override.task_id)
    const leftIndex = override.left_task_id ? nextOrder.indexOf(override.left_task_id) : -1
    const rightIndex = override.right_task_id ? nextOrder.indexOf(override.right_task_id) : -1

    if (leftIndex >= 0 && rightIndex >= 0 && leftIndex < rightIndex) {
      nextOrder.splice(rightIndex, 0, override.task_id)
      order.splice(0, order.length, ...nextOrder)
      continue
    }

    if (leftIndex >= 0) {
      nextOrder.splice(leftIndex + 1, 0, override.task_id)
      order.splice(0, order.length, ...nextOrder)
      continue
    }

    if (rightIndex >= 0) {
      nextOrder.splice(rightIndex, 0, override.task_id)
      order.splice(0, order.length, ...nextOrder)
      continue
    }

    nextOrder.push(override.task_id)
    order.splice(0, order.length, ...nextOrder)
  }

  return unique(order)
}

function buildManualInsertChains(
  projectId: string,
  manualInsertOverrides: CriticalPathOverrideRow[],
  taskMap: Map<string, CriticalPathTaskRow>,
  calendar?: ConstructionCalendarContext | null,
): CriticalChainSnapshot[] {
  return manualInsertOverrides.map((override, index) => {
    const chainTaskIds: string[] = []
    if (override.left_task_id && taskMap.has(override.left_task_id)) {
      chainTaskIds.push(override.left_task_id)
    }
    if (taskMap.has(override.task_id) && !chainTaskIds.includes(override.task_id)) {
      chainTaskIds.push(override.task_id)
    }
    if (override.right_task_id && taskMap.has(override.right_task_id) && !chainTaskIds.includes(override.right_task_id)) {
      chainTaskIds.push(override.right_task_id)
    }

    if (chainTaskIds.length === 0 && taskMap.has(override.task_id)) {
      chainTaskIds.push(override.task_id)
    }

    const totalDurationDays = chainTaskIds.reduce((sum, taskId) => sum + getTaskDurationDays(taskMap.get(taskId), calendar), 0)

    return {
      id: `${projectId}-manual-insert-${index + 1}`,
      source: 'manual_insert',
      taskIds: chainTaskIds,
      totalDurationDays,
      displayLabel: `Manual insert: ${taskMap.get(override.task_id)?.title || taskMap.get(override.task_id)?.name || override.task_id}`,
    }
  })
}

function buildSnapshotEdges(
  primaryTaskIds: string[],
  dependencyEdges: CriticalDependencyEdge[],
  manualInsertOverrides: CriticalPathOverrideRow[],
): CriticalPathEdge[] {
  const taskIdSet = new Set<string>()
  for (const edge of dependencyEdges) {
    taskIdSet.add(edge.fromTaskId)
    taskIdSet.add(edge.toTaskId)
  }
  for (const override of manualInsertOverrides) {
    taskIdSet.add(override.task_id)
    if (override.left_task_id) taskIdSet.add(override.left_task_id)
    if (override.right_task_id) taskIdSet.add(override.right_task_id)
  }
  const primaryPairs = new Set<string>()
  for (let index = 0; index < primaryTaskIds.length - 1; index += 1) {
    primaryPairs.add(`${primaryTaskIds[index]}->${primaryTaskIds[index + 1]}`)
  }

  const edges: CriticalPathEdge[] = []
  for (const edge of dependencyEdges) {
    edges.push({
      id: `dependency:${edge.id}`,
      fromTaskId: edge.fromTaskId,
      toTaskId: edge.toTaskId,
      source: edge.source,
      isPrimary: primaryPairs.has(`${edge.fromTaskId}->${edge.toTaskId}`),
      dependencyType: edge.dependencyType,
      lagDays: edge.lagDays,
    })
  }

  for (const override of manualInsertOverrides) {
    if (override.left_task_id && taskIdSet.has(override.left_task_id)) {
      edges.push({
        id: `manual:${override.id}:left`,
        fromTaskId: override.left_task_id,
        toTaskId: override.task_id,
        source: 'manual_link',
        isPrimary: false,
      })
    }
    if (override.right_task_id && taskIdSet.has(override.right_task_id)) {
      edges.push({
        id: `manual:${override.id}:right`,
        fromTaskId: override.task_id,
        toTaskId: override.right_task_id,
        source: 'manual_link',
        isPrimary: false,
      })
    }
  }

  return edges
}

function buildCriticalPathNetworkLineage(params: {
  rows: CriticalPathTaskRow[]
  dependencyRows: CriticalPathDependencyRow[]
  overrides: CriticalPathOverrideRow[]
  autoTaskIds: string[]
  manualAttentionTaskIds: string[]
  manualInsertedTaskIds: string[]
  displayTaskIds: string[]
  edges: CriticalPathEdge[]
  primaryChain: CriticalChainSnapshot | null
  alternateChains: CriticalChainSnapshot[]
}): CriticalPathNetworkLineage {
  const taskInputs = params.rows
    .map((row) => ({
      id: row.id,
      startDate: row.start_date ?? null,
      endDate: row.end_date ?? null,
      plannedStartDate: row.planned_start_date ?? null,
      plannedEndDate: row.planned_end_date ?? null,
      actualStartDate: row.actual_start_date ?? null,
      actualEndDate: row.actual_end_date ?? null,
      status: row.status ?? null,
      progress: row.progress ?? null,
      milestoneLevel: row.milestone_level ?? null,
      wbsLevel: row.wbs_level ?? null,
      baselineItemId: row.baseline_item_id ?? null,
      baselineVersionId: row.baseline_version_id ?? null,
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const dependencyInputs = params.dependencyRows
    .map((row) => ({
      id: row.id ?? null,
      taskId: row.task_id,
      dependencyTaskId: row.dependency_task_id,
      dependencyType: row.dependency_type ?? null,
      lagDays: row.lag_days ?? null,
      requiredForStart: row.required_for_start ?? null,
      status: row.status ?? null,
      createdAt: row.created_at ?? null,
    }))
    .sort((left, right) => [
      left.id ?? '',
      left.taskId,
      left.dependencyTaskId,
      left.dependencyType ?? '',
      String(left.lagDays ?? ''),
    ].join('|').localeCompare([
      right.id ?? '',
      right.taskId,
      right.dependencyTaskId,
      right.dependencyType ?? '',
      String(right.lagDays ?? ''),
    ].join('|')))
  const overrideInputs = params.overrides
    .map((row) => ({
      id: row.id ?? null,
      taskId: row.task_id,
      mode: row.mode,
      anchorType: row.anchor_type ?? null,
      leftTaskId: row.left_task_id ?? null,
      rightTaskId: row.right_task_id ?? null,
      updatedAt: row.updated_at ?? null,
    }))
    .sort((left, right) => [left.id ?? '', left.taskId, left.mode].join('|').localeCompare([right.id ?? '', right.taskId, right.mode].join('|')))
  const taskNetworkInputHash = stableHash(taskInputs)
  const dependencyInputHash = stableHash(dependencyInputs)
  const criticalSetHash = stableHash({
    autoTaskIds: params.autoTaskIds,
    manualAttentionTaskIds: params.manualAttentionTaskIds,
    manualInsertedTaskIds: params.manualInsertedTaskIds,
    displayTaskIds: params.displayTaskIds,
    primaryChain: params.primaryChain,
    alternateChains: params.alternateChains,
    edges: params.edges,
  })
  const baselineVersionIds = uniqueStrings(params.rows.map((row) => row.baseline_version_id ?? null))
  const baselineItemIds = uniqueStrings(params.rows.map((row) => row.baseline_item_id ?? null))

  return {
    criticalPathAlgorithmVersion: 'critical_path_cpm_v1',
    taskNetworkInputHash,
    dependencyInputHash,
    criticalPathInputHash: stableHash({
      criticalPathAlgorithmVersion: 'critical_path_cpm_v1',
      taskNetworkInputHash,
      dependencyInputHash,
      overrideHash: stableHash(overrideInputs),
      criticalSetHash,
    }),
    criticalSetHash,
    dependencyRuleVersion: `task_dependencies:${dependencyInputHash}`,
    baselineVersionIds,
    baselineItemIds,
    baselineVersionSource: baselineVersionIds.length > 0
      ? 'task_rows'
      : baselineItemIds.length > 0
        ? 'task_baseline_items_unresolved'
        : 'not_linked',
  }
}

function validateOverrideInput(projectTasks: CriticalPathTaskRow[], input: CriticalPathOverrideInput) {
  const taskIds = new Set(projectTasks.map((task) => task.id))
  if (!taskIds.has(input.task_id)) {
    throw makeError('CRITICAL_PATH_TASK_NOT_FOUND', 404, '关键路径任务不存在')
  }

  const anchorIds = [input.left_task_id, input.right_task_id].filter((value): value is string => Boolean(value))
  for (const anchorId of anchorIds) {
    if (anchorId === input.task_id) {
      throw makeError('CRITICAL_PATH_SELF_ANCHOR', 422, '关键路径锚点不能指向任务自身')
    }
    if (!taskIds.has(anchorId)) {
      throw makeError('CRITICAL_PATH_ANCHOR_NOT_FOUND', 404, '关键路径锚点任务不存在')
    }
  }

  if (input.mode === 'manual_insert') {
    const hasLeft = Boolean(input.left_task_id)
    const hasRight = Boolean(input.right_task_id)
    if (!hasLeft && !hasRight) {
      throw makeError('MANUAL_INSERT_REQUIRES_ANCHOR', 422, '手动插链必须指定锚点')
    }

    if (!input.anchor_type) {
      throw makeError('MANUAL_INSERT_REQUIRES_ANCHOR_TYPE', 422, '手动插链必须指定 anchor_type')
    }
    const anchorType = input.anchor_type
    if (anchorType === 'before' && !hasRight) {
      throw makeError('MANUAL_INSERT_REQUIRES_RIGHT_ANCHOR', 422, 'before 类型必须提供 right_task_id')
    }
    if (anchorType === 'after' && !hasLeft) {
      throw makeError('MANUAL_INSERT_REQUIRES_LEFT_ANCHOR', 422, 'after 类型必须提供 left_task_id')
    }
    if (anchorType === 'between' && (!hasLeft || !hasRight)) {
      throw makeError('MANUAL_INSERT_REQUIRES_BOTH_ANCHORS', 422, 'between 类型必须同时提供 left_task_id 和 right_task_id')
    }
  }
}

export async function listCriticalPathOverrides(projectId: string): Promise<CriticalPathOverrideRow[]> {
  return await loadCriticalPathOverrideRows(projectId)
}

export async function getProjectCriticalPathSnapshot(projectId: string): Promise<CriticalPathSnapshot> {
  const rows = await loadCriticalPathTaskRows(projectId)
  const overrides = await loadCriticalPathOverrideRows(projectId)
  return await buildProjectCriticalPathSnapshot(projectId, rows, overrides)
}

async function loadCriticalPathDependencyRows(
  projectId: string,
  rows: CriticalPathTaskRow[],
): Promise<CriticalPathDependencyRow[]> {
  const allIds = rows.map((r) => r.id)
  if (allIds.length === 0) return []
  try {
    const data = process.env.NODE_ENV !== 'test'
      ? (await rawQuery(
          `SELECT id, task_id, dependency_task_id, dependency_type, lag_days, required_for_start, status, created_at
             FROM public.task_dependencies
            WHERE project_id = $1
              AND task_id = ANY($2::uuid[])
              AND status = 'active'
              AND required_for_start IS DISTINCT FROM false
            ORDER BY created_at ASC, id ASC`,
          [projectId, allIds],
        )).rows as CriticalPathDependencyRow[]
      : await executeSQL<CriticalPathDependencyRow>(
          `SELECT id, task_id, dependency_task_id, dependency_type, lag_days, required_for_start, status, created_at
             FROM task_dependencies
            WHERE project_id = ?
              AND task_id IN (?)
              AND status = 'active'
              AND required_for_start IS DISTINCT FROM false
            ORDER BY created_at ASC, id ASC`,
          [projectId, allIds],
        )

    return (data ?? []).filter(isActiveRequiredDependency)
  } catch {
    return []
  }
}

export async function buildProjectCriticalPathSnapshot(
  projectId: string,
  rows: CriticalPathTaskRow[],
  overrides: CriticalPathOverrideRow[],
): Promise<CriticalPathSnapshot> {
  const constructionCalendar = await resolveCriticalPathConstructionCalendar(projectId)
  const dependencyRows = await loadCriticalPathDependencyRows(projectId, rows)
  const currentForecasts = await loadCurrentForecastMapForCriticalPath(rows)
  const taskNodes = buildTaskNodes(rows, currentForecasts, constructionCalendar)
  let analysis: CPMResult
  let hasCycleDetected = false
  let cycleTaskIds: string[] = []
  let calculatedSuccessfully = false
  try {
    analysis = calculateCPM(taskNodes, dependencyRows)
    calculatedSuccessfully = true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const failedAt = new Date().toISOString()
    hasCycleDetected = errorMessage.startsWith('CRITICAL_PATH_CYCLE_DETECTED:')
    if (hasCycleDetected) {
      const cycleTaskId = errorMessage.replace('CRITICAL_PATH_CYCLE_DETECTED:', '').trim()
      if (cycleTaskId) cycleTaskIds = [cycleTaskId]
    }
    logger.warn('[projectCriticalPathService] CPM calculation failed, returning cached or empty snapshot', {
      projectId,
      hasCycleDetected,
      cycleTaskIds,
      error: errorMessage,
    })
    const cachedSnapshot = getCachedCriticalPathSnapshot(projectId)
    if (cachedSnapshot) {
      logger.warn('[projectCriticalPathService] using cached critical path snapshot after CPM failure', {
        projectId,
        hasCycleDetected,
        cycleTaskIds,
      })
      return {
        ...cachedSnapshot,
        calculationStatus: 'cached_after_failure',
        calculationFailureMessage: errorMessage,
        calculationFailedAt: failedAt,
        lastSuccessfulCalculatedAt: cachedSnapshot.lastSuccessfulCalculatedAt ?? cachedSnapshot.calculatedAt ?? null,
        hasCycleDetected: cachedSnapshot.hasCycleDetected || hasCycleDetected,
        cycleTaskIds: cycleTaskIds.length > 0 ? cycleTaskIds : cachedSnapshot.cycleTaskIds,
      }
    }
    return {
      projectId,
      autoTaskIds: [],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: null,
      alternateChains: [],
      displayTaskIds: [],
      watchedTaskIds: [],
      edges: [],
      tasks: [],
      projectDurationDays: 0,
      calculationStatus: 'empty_after_failure',
      calculationFailureMessage: errorMessage,
      calculationFailedAt: failedAt,
      lastSuccessfulCalculatedAt: null,
      hasCycleDetected,
      cycleTaskIds: cycleTaskIds.length > 0 ? cycleTaskIds : undefined,
    }
  }
  const taskMap = new Map(rows.map((row) => [row.id, row]))
  const autoChains = buildAutoCriticalChains(projectId, rows, taskMap, analysis, constructionCalendar)
  const {
    primaryChain,
    alternateChains: autoAlternateChains,
    orderedTaskIds: orderedAutoTaskIds,
  } = sortAutoCriticalChains(projectId, autoChains, taskMap, analysis)
  const autoTaskIds = orderedAutoTaskIds.length > 0
    ? orderedAutoTaskIds
    : buildFallbackAutoTaskIds(rows)
  const highVarianceNearCriticalChains = buildHighVarianceNearCriticalChains(
    projectId,
    analysis,
    new Set(autoTaskIds),
  )
  const manualAttentionTaskIds = unique(
    overrides.filter((override) => override.mode === 'manual_attention').map((override) => override.task_id),
  )
  const manualInsertOverrides = overrides.filter((override) => override.mode === 'manual_insert')
  const manualInsertedTaskIds = unique(manualInsertOverrides.map((override) => override.task_id))
    // CP14: displayTaskIds 仅包含客观关键路径（CPM 自动计算 + manual_insert），不混入 manual_attention
  const displayTaskIds = unique([
    ...orderDisplayTaskIds(autoTaskIds, new Set(rows.map((row) => row.id)), manualInsertOverrides),
  ])
  const manualInsertChains = buildManualInsertChains(projectId, manualInsertOverrides, taskMap, constructionCalendar)
  const combinedAlternateChains = [...autoAlternateChains, ...highVarianceNearCriticalChains, ...manualInsertChains]
  const edges = buildSnapshotEdges(primaryChain?.taskIds ?? autoTaskIds, analysis.dependencyEdges, manualInsertOverrides)
  const primaryChainIndex = new Map((primaryChain?.taskIds ?? []).map((taskId, index) => [taskId, index]))
  const networkLineage = buildCriticalPathNetworkLineage({
    rows,
    dependencyRows,
    overrides,
    autoTaskIds,
    manualAttentionTaskIds,
    manualInsertedTaskIds,
    displayTaskIds,
    edges,
    primaryChain,
    alternateChains: combinedAlternateChains,
  })

  const taskSnapshotIds = unique([
    ...displayTaskIds,
    ...highVarianceNearCriticalChains.flatMap((chain) => chain.taskIds),
  ])
  const highVarianceNearCriticalTaskIds = new Set(highVarianceNearCriticalChains.flatMap((chain) => chain.taskIds))
  const tasks = taskSnapshotIds
    .map((taskId): CriticalTaskSnapshot | null => {
      const row = taskMap.get(taskId)
      const node = analysis.taskMap.get(taskId)
      if (!row) return null
      const chainIndex = primaryChainIndex.get(taskId)
      return {
        taskId,
        title: row.title || row.name || taskId,
        floatDays: analysis.float.get(taskId) ?? 0,
        durationDays: node?.duration ?? getTaskDurationDays(row, constructionCalendar),
        ...(node?.p50DurationDays ? { p50DurationDays: node.p50DurationDays } : {}),
        ...(node?.p80DurationDays ? { p80DurationDays: node.p80DurationDays } : {}),
        ...(node?.standardDeviationDays ? { standardDeviationDays: node.standardDeviationDays } : {}),
        ...(node?.confidenceBandWidthDays ? { confidenceBandWidthDays: node.confidenceBandWidthDays } : {}),
        ...(highVarianceNearCriticalTaskIds.has(taskId) ? { isHighVarianceNearCritical: true } : {}),
        isAutoCritical: autoTaskIds.includes(taskId),
        isManualAttention: manualAttentionTaskIds.includes(taskId),
        isManualInserted: manualInsertedTaskIds.includes(taskId),
        ...(chainIndex !== undefined ? { chainIndex } : {}),
      } satisfies CriticalTaskSnapshot
    })
    .filter((task): task is CriticalTaskSnapshot => task !== null)

  const calculatedAt = new Date().toISOString()
  const snapshot: CriticalPathSnapshot = {
    projectId,
    autoTaskIds,
    manualAttentionTaskIds,
    manualInsertedTaskIds,
    primaryChain,
    alternateChains: combinedAlternateChains,
    displayTaskIds,
    watchedTaskIds: manualAttentionTaskIds,  // CP14: manual_attention 任务独立字段
    edges,
    tasks,
    projectDurationDays: Math.max(
      analysis.projectDuration,
      primaryChain?.totalDurationDays ?? 0,
      ...combinedAlternateChains.map((chain) => chain.totalDurationDays),
    ),
    calculatedAt,
    lastSuccessfulCalculatedAt: calculatedAt,
    calculationStatus: 'fresh',
    hasCycleDetected,
    cycleTaskIds: cycleTaskIds.length > 0 ? cycleTaskIds : undefined,
    networkLineage,
  }

  if (calculatedSuccessfully) {
    rememberCriticalPathSnapshot(projectId, snapshot)
  }
  return snapshot
}

async function saveCriticalPathOverride(projectId: string, input: CriticalPathOverrideInput): Promise<CriticalPathOverrideRow> {
  const projectTasks = await loadCriticalPathTaskRows(projectId)
  validateOverrideInput(projectTasks, input)

  const existingOverrides = await loadCriticalPathOverrideRows(projectId)
  const existingSameTaskMode = existingOverrides.find((override) => override.task_id === input.task_id && override.mode === input.mode)
  if (existingSameTaskMode) {
    await executeSQL(
      'DELETE FROM task_critical_overrides WHERE id = ? AND project_id = ?',
      [existingSameTaskMode.id, projectId],
    )
  }

  const id = uuidv4()
  const ts = new Date().toISOString()
  const row: CriticalPathOverrideRow = {
    id,
    project_id: projectId,
    task_id: input.task_id,
    mode: input.mode,
    anchor_type: input.anchor_type ?? null,
    left_task_id: input.left_task_id ?? null,
    right_task_id: input.right_task_id ?? null,
    reason: input.reason ?? null,
    created_by: input.created_by ?? null,
    created_at: ts,
    updated_at: ts,
  }

  await executeSQL(
    `INSERT INTO task_critical_overrides
      (id, project_id, task_id, mode, anchor_type, left_task_id, right_task_id, reason, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.project_id,
      row.task_id,
      row.mode,
      row.anchor_type,
      row.left_task_id,
      row.right_task_id,
      row.reason,
      row.created_by,
      row.created_at,
      row.updated_at,
    ],
  )

  return row
}

export async function createCriticalPathOverride(projectId: string, input: CriticalPathOverrideInput): Promise<CriticalPathOverrideRow> {
  return await saveCriticalPathOverride(projectId, input)
}

export async function updateCriticalPathOverride(
  projectId: string,
  overrideId: string,
  input: CriticalPathOverrideInput,
): Promise<CriticalPathOverrideRow> {
  const existingRows = await loadCriticalPathOverrideRows(projectId)
  const existing = existingRows.find((override) => override.id === overrideId)
  if (!existing) {
    throw makeError('CRITICAL_PATH_OVERRIDE_NOT_FOUND', 404, '关键路径覆盖不存在')
  }

  const projectTasks = await loadCriticalPathTaskRows(projectId)
  validateOverrideInput(projectTasks, input)

  const updatedAt = new Date().toISOString()
  const nextRow: CriticalPathOverrideRow = {
    ...existing,
    task_id: input.task_id,
    mode: input.mode,
    anchor_type: input.anchor_type ?? null,
    left_task_id: input.left_task_id ?? null,
    right_task_id: input.right_task_id ?? null,
    reason: input.reason ?? null,
    created_by: input.created_by ?? existing.created_by ?? null,
    updated_at: updatedAt,
  }

  await executeSQL(
    `UPDATE task_critical_overrides
     SET task_id = ?, mode = ?, anchor_type = ?, left_task_id = ?, right_task_id = ?, reason = ?, created_by = ?, updated_at = ?
     WHERE id = ? AND project_id = ?`,
    [
      nextRow.task_id,
      nextRow.mode,
      nextRow.anchor_type,
      nextRow.left_task_id,
      nextRow.right_task_id,
      nextRow.reason,
      nextRow.created_by,
      nextRow.updated_at,
      nextRow.id,
      nextRow.project_id,
    ],
  )

  return nextRow
}

export async function deleteCriticalPathOverride(projectId: string, overrideId: string): Promise<void> {
  await executeSQL(
    'DELETE FROM task_critical_overrides WHERE id = ? AND project_id = ?',
    [overrideId, projectId],
  )
}

export async function recalculateProjectCriticalPath(projectId: string): Promise<ProjectCriticalPathResult> {
  const rows = await loadCriticalPathTaskRows(projectId)
  const overrides = await loadCriticalPathOverrideRows(projectId)
  const tasks = rows
  const constructionCalendar = await resolveCriticalPathConstructionCalendar(projectId)
  const dependencyRows = await loadCriticalPathDependencyRows(projectId, tasks)
  const currentForecasts = await loadCurrentForecastMapForCriticalPath(tasks)
  const taskNodes = buildTaskNodes(tasks, currentForecasts, constructionCalendar)
  let analysis: CPMResult
  let failureMessage: string | null = null
  try {
    analysis = calculateCPM(taskNodes, dependencyRows)
  } catch (error) {
    failureMessage = error instanceof Error ? error.message : String(error)
    logger.warn('[projectCriticalPathService] recalculation CPM failed, snapshot metadata will indicate stale or empty data', {
      projectId,
      error: failureMessage,
    })
    analysis = {
      criticalPath: buildFallbackAutoTaskIds(rows),
      criticalEdges: [],
      dependencyEdges: [],
      projectDuration: 0,
      earliestStart: new Map(),
      earliestFinish: new Map(),
      latestStart: new Map(),
      latestFinish: new Map(),
      float: new Map(),
      orderedTaskIds: [],
      taskMap: new Map(),
    }
  }
  try {
    await syncCriticalPathFailureNotification(projectId, failureMessage)
  } catch (notificationError) {
    logger.warn('[projectCriticalPathService] failed to persist CPM failure notification', {
      projectId,
      error: notificationError instanceof Error ? notificationError.message : String(notificationError),
    })
  }
  const snapshot = await buildProjectCriticalPathSnapshot(projectId, rows, overrides)
  await persistCriticalPathTaskProjection(projectId, analysis, new Set(snapshot.displayTaskIds))
  const calculatedDate = normalizeDate(snapshot.calculatedAt) ?? new Date().toISOString().slice(0, 10)
  const cpmDedupeKey = `${projectId}:${calculatedDate}:critical_path_cpm`
  const predictionNetworkLineage: Record<string, unknown> | undefined = snapshot.networkLineage
    ? toPredictionContextRecord(snapshot.networkLineage)
    : undefined
  await recordDurationAccuracyPrediction({
    engineCode: 'critical_path_cpm',
    outputKind: 'critical_path_project_duration',
    projectId,
    dedupeKey: cpmDedupeKey,
    predictionBasis: 'critical_path_runtime_snapshot',
    modelVersion: 'critical_path_cpm_v1',
    predictedStartDate: earliestDate(rows.map((row) => row.start_date ?? row.planned_start_date)),
    predictedFinishDate: latestDate(rows.map((row) => row.end_date ?? row.planned_end_date)),
    predictedDurationDays: snapshot.projectDurationDays,
    predictedAt: snapshot.calculatedAt ?? null,
    predictionContext: {
      taskCount: tasks.length,
      eligibleTaskCount: taskNodes.length,
      autoTaskIds: snapshot.autoTaskIds,
      manualAttentionTaskIds: snapshot.manualAttentionTaskIds,
      manualInsertedTaskIds: snapshot.manualInsertedTaskIds,
      primaryChain: snapshot.primaryChain,
      alternateChainCount: snapshot.alternateChains.length,
      edgeCount: snapshot.edges.length,
      calculationStatus: snapshot.calculationStatus,
      networkLineage: predictionNetworkLineage ?? null,
    },
    networkLineage: predictionNetworkLineage,
  })
  const actualSpan = buildCompletedProjectActualSpan(rows, constructionCalendar)
  if (actualSpan) {
    await backtestEarliestPendingDurationAccuracyPrediction({
      projectId,
      engineCode: 'critical_path_cpm',
      actualStartDate: actualSpan.actualStartDate,
      actualFinishDate: actualSpan.actualFinishDate,
      actualDurationDays: actualSpan.actualDurationDays,
      actualContext: {
        source: 'completed_project_task_span',
        durationBasis: 'project_actual_span',
        skippedCurrentDedupeKey: cpmDedupeKey,
        taskCount: tasks.length,
      },
    })
    await recordCriticalPathRulePlanNetworkOutcome({
      projectId,
      snapshot,
      actualSpan,
    })
  }

  logger.info('[projectCriticalPathService] recalculated project critical path snapshot', {
    projectId,
    taskCount: tasks.length,
    eligibleTaskCount: taskNodes.length,
    criticalTaskCount: snapshot.autoTaskIds.length,
    projectDuration: snapshot.projectDurationDays,
  })

  return {
    projectId,
    taskCount: tasks.length,
    eligibleTaskCount: taskNodes.length,
    criticalTaskIds: snapshot.autoTaskIds,
    projectDuration: snapshot.projectDurationDays,
    snapshot,
  }
}
