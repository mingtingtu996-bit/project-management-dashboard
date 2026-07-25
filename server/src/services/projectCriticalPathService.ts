import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { getClient, query as rawQuery } from '../database.js'
import { logger } from '../middleware/logger.js'
import { executeSQL } from './dbService.js'
import { listNotifications, updateNotificationById } from './notificationStore.js'
import { notificationTouchpointService } from './notificationTouchpointService.js'
import { inclusiveDurationDays } from '../utils/durationDays.js'
import { isCompletedTask } from '../utils/taskStatus.js'
import type { CriticalPathOverride, CriticalPathOverrideInput, Notification } from '../types/db.js'
import {
  backtestEarliestPendingDurationAccuracyPrediction,
  recordDurationAccuracyPrediction,
} from './durationAlgorithmAccuracyService.js'
import {
  listCurrentTaskDurationForecasts,
  type TaskDurationForecast,
} from './taskDurationForecastService.js'
import { isFormalTaskDependencyEvidence } from './taskDependencyPublicationPolicy.js'
import { assembleDurationInput } from './durationInputAssemblerService.js'
import { buildDownstreamDurationAssetConsumption } from './durationAssetDownstreamConsumptionService.js'
import {
  productionDaysBetweenInclusive,
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import { listActiveProjectIds } from './activeProjectService.js'
import { readLiveProjectGenerationFacts } from './projectGenerationFactsStoreService.js'
import {
  evaluateDurationPlausibility,
  type DurationPlausibilityWarning,
} from './durationEngineeringPlausibilityGuardrailService.js'
import {
  mergeConstructionOrganizationLineageIntoContext,
  readConstructionOrganizationPlanNetworkRuntimeLineage,
  type ConstructionOrganizationPlanNetworkRuntimeLineage,
} from './constructionOrganizationRuntimeLineageService.js'
import type { T2RhythmScheduleCandidateNetworkPhase1Evaluation } from './t2RhythmScheduleCandidateNetworkEvaluationService.js'
import {
  listApplicableDurationLearningRuntimePublications,
  type DurationLearningRuntimePublicationQueryExec,
} from './durationLearningRuntimePublicationService.js'
import { recordProjectCriticalPathConsumedArtifacts } from './durationRuntimeConsumerObservationAdapterService.js'
import {
  buildConstructionProductionDayDurationMetric,
  businessDateKey,
  type DurationMetricDto,
} from './durationMetricService.js'

const criticalPathSnapshotCache = new Map<string, CachedCriticalPathSnapshot>()
const criticalPathRecalculationByProject = new Map<string, Promise<ProjectCriticalPathResult>>()
const MAX_AUTO_CRITICAL_CHAINS = 8
const CRITICAL_PATH_SNAPSHOT_CACHE_TTL_MS = 5 * 60 * 1000
const CRITICAL_PATH_PROJECT_LOCK_NAMESPACE = 'workbuddy_critical_path_project'

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
  standardWorkCodes?: string[]
  /** @deprecated Use float. */
  floatDays: number
  float: DurationMetricDto
  /** @deprecated Use duration. */
  durationDays: number
  duration: DurationMetricDto
  earliestStartOffsetDays?: number
  earliestFinishOffsetDays?: number
  latestStartOffsetDays?: number
  latestFinishOffsetDays?: number
  /** @deprecated Use freeFloat. */
  freeFloatDays?: number
  freeFloat: DurationMetricDto
  p50DurationDays?: number
  p80DurationDays?: number
  standardDeviationDays?: number
  confidenceBandWidthDays?: number
  isHighVarianceNearCritical?: boolean
  isLearnedCriticalPathWatch?: boolean
  durationLearningPublicationKeys?: string[]
  isAutoCritical: boolean
  isManualAttention: boolean
  isManualInserted: boolean
  chainIndex?: number
}

export interface CriticalTaskNetworkSchedule {
  taskId: string
  earliestStartOffsetDays: number
  earliestFinishOffsetDays: number
  latestStartOffsetDays: number
  latestFinishOffsetDays: number
  /** @deprecated Use float. */
  floatDays: number
  float: DurationMetricDto
  /** @deprecated Use freeFloat. */
  freeFloatDays: number
  freeFloat: DurationMetricDto
  /** @deprecated Use duration. */
  durationDays: number
  duration: DurationMetricDto
  isAutoCritical: boolean
}

export interface CriticalChainSnapshot {
  id: string
  source: CriticalSource
  taskIds: string[]
  /** @deprecated Use totalDuration. */
  totalDurationDays: number
  totalDuration: DurationMetricDto
  p80DurationDays?: number
  standardDeviationDays?: number
  confidenceBandWidthDays?: number
  isHighVarianceNearCritical?: boolean
  displayLabel: string
}

type CriticalChainFacts = Omit<CriticalChainSnapshot, 'totalDuration'>

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
  criticalPathLearningPublications?: CriticalPathLearningPublicationApplication[]
  edges: CriticalPathEdge[]
  tasks: CriticalTaskSnapshot[]
  networkSchedule?: CriticalTaskNetworkSchedule[]
  /** @deprecated Use projectDuration. */
  projectDurationDays: number
  projectDuration: DurationMetricDto
  calculatedAt?: string
  lastSuccessfulCalculatedAt?: string | null
  calculationStatus?: 'fresh' | 'cached_after_failure' | 'empty_after_failure'
  calculationFailureMessage?: string | null
  calculationFailedAt?: string | null
  hasCycleDetected?: boolean
  cycleTaskIds?: string[]
  networkLineage?: CriticalPathNetworkLineage
  networkMaturity?: {
    level: 'low' | 'medium' | 'high'
    policy: string
    dependencyEdgeCount: number
    taskCount: number
  }
  durationInputAssembly?: Record<string, unknown>
  t2RhythmScheduleCandidateNetworkEvidence?: CriticalPathT2RhythmNetworkEvidence
  durationPlausibilityWarnings?: DurationPlausibilityWarning[]
}

export interface CriticalPathLearningPublicationApplication {
  publicationKey: string
  publicationStage: string
  selectionBasis: string | null
  artifactKey: string
  criticalStableCodes: string[]
  inputTaskIds: string[]
  appliedTaskIds: string[]
  role: 'watched_task_prior'
}

export interface CriticalPathT2RhythmNetworkEvidence {
  source: 't2_rhythm_schedule_candidate_network_phase1_evaluation'
  candidateId: string
  tier: 'T2'
  status: T2RhythmScheduleCandidateNetworkPhase1Evaluation['status']
  canEnterC1913Phase1Selection: boolean
  networkSpanDays: number
  criticalWindowCodes: string[]
  criticalNodeCount: number
  nodeEvaluationCount: number
  dependencyEdgeCount: number
  hardGateCount: number
  topologyEvaluated: boolean
  floatCalculated: boolean
  conflictSummary: T2RhythmScheduleCandidateNetworkPhase1Evaluation['conflictSummary']
  phase1PublicationGate: T2RhythmScheduleCandidateNetworkPhase1Evaluation['phase1PublicationGate']
  canMaterializeTaskDependencies: false
  mutationBoundary: T2RhythmScheduleCandidateNetworkPhase1Evaluation['mutationBoundary']
}

type CachedCriticalPathSnapshot = CriticalPathSnapshot & {
  cachedAt: string
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

export interface CriticalPathRefreshSweepResult {
  scannedProjects: number
  refreshedProjects: number
  failedProjects: number
  skippedProjects: number
  failures: Array<{
    projectId: string
    error: string
  }>
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
    projectDuration: { ...snapshot.projectDuration },
    primaryChain: snapshot.primaryChain
      ? {
        ...snapshot.primaryChain,
        taskIds: [...snapshot.primaryChain.taskIds],
        totalDuration: { ...snapshot.primaryChain.totalDuration },
      }
      : null,
    alternateChains: snapshot.alternateChains.map((chain) => ({
      ...chain,
      taskIds: [...chain.taskIds],
      totalDuration: { ...chain.totalDuration },
    })),
    displayTaskIds: [...snapshot.displayTaskIds],
    watchedTaskIds: [...snapshot.watchedTaskIds],
    criticalPathLearningPublications: snapshot.criticalPathLearningPublications?.map((publication) => ({
      ...publication,
      criticalStableCodes: [...publication.criticalStableCodes],
      inputTaskIds: [...publication.inputTaskIds],
      appliedTaskIds: [...publication.appliedTaskIds],
    })),
    edges: snapshot.edges.map((edge) => ({ ...edge })),
    tasks: snapshot.tasks.map((task) => ({
      ...task,
      ...(task.standardWorkCodes ? { standardWorkCodes: [...task.standardWorkCodes] } : {}),
      ...(task.durationLearningPublicationKeys
        ? { durationLearningPublicationKeys: [...task.durationLearningPublicationKeys] }
        : {}),
      duration: { ...task.duration },
      float: { ...task.float },
      freeFloat: { ...task.freeFloat },
    })),
    networkSchedule: snapshot.networkSchedule?.map((task) => ({
      ...task,
      duration: { ...task.duration },
      float: { ...task.float },
      freeFloat: { ...task.freeFloat },
    })),
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
  criticalPathSnapshotCache.set(projectId, {
    ...cloneCriticalPathSnapshot(snapshot),
    cachedAt: new Date().toISOString(),
  })
}

export function clearProjectCriticalPathSnapshotCache(projectId?: string | null): void {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (normalizedProjectId) {
    criticalPathSnapshotCache.delete(normalizedProjectId)
    return
  }
  criticalPathSnapshotCache.clear()
}

function getCachedCriticalPathSnapshot(projectId: string, currentTaskIds?: Set<string>): CriticalPathSnapshot | null {
  const cached = criticalPathSnapshotCache.get(projectId)
  if (!cached) return null
  const cachedAt = Date.parse(cached.cachedAt)
  if (!Number.isFinite(cachedAt) || Date.now() - cachedAt > CRITICAL_PATH_SNAPSHOT_CACHE_TTL_MS) {
    criticalPathSnapshotCache.delete(projectId)
    return null
  }
  if (currentTaskIds) {
    const referencedTaskIds = new Set<string>([
      ...cached.displayTaskIds,
      ...cached.watchedTaskIds,
      ...cached.tasks.map((task) => task.taskId),
      ...(cached.networkSchedule ?? []).map((task) => task.taskId),
      ...(cached.primaryChain?.taskIds ?? []),
      ...cached.alternateChains.flatMap((chain) => chain.taskIds),
      ...cached.edges.flatMap((edge) => [edge.fromTaskId, edge.toTaskId]),
    ])
    for (const taskId of referencedTaskIds) {
      if (!currentTaskIds.has(taskId)) {
        criticalPathSnapshotCache.delete(projectId)
        return null
      }
    }
  }
  return cloneCriticalPathSnapshot(cached)
}

interface CriticalPathTaskRow {
  id: string
  project_id: string
  title?: string | null
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
  building_object_id?: string | null
  floor_object_id?: string | null
  physical_zone_object_id?: string | null
  functional_area_object_id?: string | null
  participant_unit_id?: string | null
  standard_work_code?: string | null
  execution_lane?: string | null
  duration_contribution_mode?: string | null
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
  source_type?: string | null
  metadata?: Record<string, unknown> | null
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
  resourceLimits?: ResourceConstraintLimits | null
  scopeKeys?: ResourceConstraintScopeKeys
  plausibilityWarnings?: DurationPlausibilityWarning[]
}

interface ResourceConstraintLimits {
  parallelCapacity: number
  sameBuildingDailyLimit: number | null
  sameUnitDailyLimit: number | null
  sameFloorDailyLimit: number | null
  sameZoneDailyLimit: number | null
  sameSystemDailyLimit: number | null
}

interface ResourceConstraintScopeKeys {
  building: string | null
  unit: string | null
  floor: string | null
  zone: string | null
  system: string | null
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

interface CriticalPathProjectResourceFacts {
  towerCraneCount?: number | null
  constructionHoistCount?: number | null
}

type ProjectOwnerRow = {
  id: string
  owner_id?: string | null
}

type ProjectMemberRow = {
  project_id: string
  user_id: string
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
    executeSQL<ProjectMemberRow>('SELECT project_id, user_id, permission_level FROM project_members WHERE project_id = ?', [projectId]),
  ])

  return uniqueStrings([
    project[0]?.owner_id ?? null,
    ...(members ?? [])
      .filter((member) => normalizeProjectPermissionLevel(member.permission_level) === 'owner')
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
      }, row)),
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
    }, current)
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
  return isCompletedTask({
    status: row.status,
    progress: Number(row.progress ?? 0),
    actual_end_date: row.actual_end_date,
  })
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
  constructionCalendar: ConstructionCalendarContext | null
}) {
  const { projectId, snapshot, actualSpan, constructionCalendar } = params
  const networkLineage = snapshot.networkLineage
  const projectDuration = snapshot.projectDuration
  if (
    snapshot.calculationStatus !== 'fresh'
    || !networkLineage?.criticalPathInputHash
    || !networkLineage.criticalSetHash
    || projectDuration.unit !== 'construction_production_day'
    || projectDuration.availability !== 'available'
    || projectDuration.value === null
    || projectDuration.value <= 0
  ) {
    return
  }

  const predictedDurationDays = Math.max(0, Math.round(projectDuration.value))
  const durationErrorDays = Math.abs(actualSpan.actualDurationDays - predictedDurationDays)
  const outcomeToleranceDays = criticalPathOutcomeToleranceDays(predictedDurationDays)
  const projectedFloatTaskCount = snapshot.tasks.filter((task) => Number.isFinite(task.floatDays)).length
  const standardWorkCodesByTaskId = new Map(
    snapshot.tasks.map((task) => [task.taskId, task.standardWorkCodes ?? []]),
  )
  const stableCodesForTaskIds = (taskIds: readonly string[]) => unique(
    taskIds.flatMap((taskId) => standardWorkCodesByTaskId.get(taskId) ?? []),
  )
  const outcomeStatus = criticalPathPlanNetworkOutcomeStatus({
    snapshot,
    actualDurationDays: actualSpan.actualDurationDays,
  })
  const replayTaskIds = unique(snapshot.tasks.map((task) => task.taskId))
  const networkCaseCount = 1
  const qualityConsistencyRate = replayTaskIds.length > 0
    ? Number((projectedFloatTaskCount / replayTaskIds.length).toFixed(6))
    : null
  const replayAccepted = outcomeStatus === 'accepted'
  const metadata: Record<string, unknown> = {
    source: 'project_critical_path_cpm',
    algorithm_version: networkLineage.criticalPathAlgorithmVersion,
    duration_day_unit: projectDuration.unit,
    duration_metric: projectDuration,
    construction_calendar: constructionCalendar,
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
    auto_task_stable_codes: stableCodesForTaskIds(snapshot.autoTaskIds),
    manual_attention_task_ids: snapshot.manualAttentionTaskIds,
    manual_inserted_task_ids: snapshot.manualInsertedTaskIds,
    primary_chain_task_ids: snapshot.primaryChain?.taskIds ?? [],
    primary_chain_stable_codes: stableCodesForTaskIds(snapshot.primaryChain?.taskIds ?? []),
    alternate_chain_count: snapshot.alternateChains.length,
    edge_count: snapshot.edges.length,
    critical_task_count: snapshot.autoTaskIds.length,
    projected_float_task_count: projectedFloatTaskCount,
    sample_count: networkCaseCount,
    source_evidence_refs: unique([
      `critical_path_inputs:${networkLineage.criticalPathInputHash}`,
      ...replayTaskIds.map((taskId) => `tasks:${taskId}:completed_cpm_replay`),
    ]),
    task_ids: replayTaskIds,
    real_outcome_count: networkCaseCount,
    replay_case_count: networkCaseCount,
    observation_started_at: actualSpan.actualStartDate,
    observation_ended_at: actualSpan.actualFinishDate,
    observation_window_days: actualSpan.actualDurationDays,
    quality_model: 'structural_replay',
    replay_pass_rate: replayAccepted ? 1 : 0,
    outcome_acceptance_rate: replayAccepted ? 1 : 0,
    quality_consistency_rate: qualityConsistencyRate,
    conflict_rate: replayAccepted ? 0 : 1,
    rollback_ready: true,
    tenant_scope_valid: true,
    writes_runtime_directly: false,
    writes_fact_directly: false,
  }

  const learningScope = await loadCriticalPathLearningScope(
    projectId,
    {},
    criticalPathDurationLearningQueryExec(),
  )
  if (!learningScope.companyId) {
    logger.warn('[projectCriticalPathService] skipped critical path plan-network outcome without project company authority', {
      projectId,
      criticalSetHash: networkLineage.criticalSetHash,
    })
    return
  }

  const writeOutcome = async (input: {
    id: string
    outcomeStatus: CriticalPathPlanNetworkOutcomeStatus
    outcomeRef: string
    publicationKey: string | null
    metadata: Record<string, unknown>
  }) => rawQuery(
    `INSERT INTO public.duration_plan_network_outcomes (
      id,
      asset_key,
      outcome_status,
      outcome_ref,
      learning_scope,
      learning_scope_source,
      company_id,
      project_id,
      publication_key,
      metadata,
      writes_runtime_directly,
      writes_fact_directly
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (id) DO UPDATE SET
      outcome_status = EXCLUDED.outcome_status,
      outcome_ref = EXCLUDED.outcome_ref,
      learning_scope = EXCLUDED.learning_scope,
      learning_scope_source = EXCLUDED.learning_scope_source,
      company_id = EXCLUDED.company_id,
      project_id = EXCLUDED.project_id,
      publication_key = EXCLUDED.publication_key,
      observed_at = now(),
      metadata = EXCLUDED.metadata,
      writes_runtime_directly = false,
      writes_fact_directly = false`,
    [
      input.id,
      CRITICAL_PATH_RULE_CANDIDATE_ASSET_KEY,
      input.outcomeStatus,
      input.outcomeRef,
      'project',
      'project_business_outcome_writer',
      learningScope.companyId,
      projectId,
      input.publicationKey,
      input.metadata,
      false,
      false,
    ],
  )

  try {
    await writeOutcome({
      id: `critical-path-cpm:${projectId}:${networkLineage.criticalSetHash}`,
      outcomeStatus,
      outcomeRef: `critical_path_cpm:${projectId}:${networkLineage.criticalPathInputHash}`,
      publicationKey: null,
      metadata,
    })

    const actualCriticalTaskIds = new Set(snapshot.autoTaskIds)
    for (const application of snapshot.criticalPathLearningPublications ?? []) {
      const inputTaskIds = unique(application.inputTaskIds)
      if (inputTaskIds.length === 0) continue
      const actualCriticalInputTaskIds = inputTaskIds.filter((taskId) => actualCriticalTaskIds.has(taskId))
      await writeOutcome({
        id: `critical-path-cpm:${projectId}:${networkLineage.criticalSetHash}:publication:${stableHash(application.publicationKey)}`,
        outcomeStatus: actualCriticalInputTaskIds.length > 0 ? 'accepted' : 'weak',
        outcomeRef: `critical_path_cpm:${projectId}:${networkLineage.criticalPathInputHash}:${application.publicationKey}`,
        publicationKey: application.publicationKey,
        metadata: {
          ...metadata,
          source_evidence_refs: unique([
            ...((metadata.source_evidence_refs as string[] | undefined) ?? []),
            `duration_learning_runtime_publications:${application.publicationKey}`,
          ]),
          runtime_publication_key: application.publicationKey,
          runtime_publication_artifact_key: application.artifactKey,
          runtime_publication_input_task_ids: inputTaskIds,
          runtime_publication_applied_task_ids: application.appliedTaskIds,
          runtime_publication_actual_critical_task_ids: actualCriticalInputTaskIds,
          runtime_publication_stage: application.publicationStage,
          runtime_publication_selection_basis: application.selectionBasis,
        },
      })
    }
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
  if (!isFormalTaskDependencyEvidence(row)) return false
  return row.required_for_start !== false
}

function readConstructionOrganizationLineageFromDependencyRows(
  rows: CriticalPathDependencyRow[],
): ConstructionOrganizationPlanNetworkRuntimeLineage | null {
  for (const row of rows) {
    const sourceType = normalizeText(row.source_type)
    const metadata = readRecord(row.metadata)
    const lineage = readConstructionOrganizationPlanNetworkRuntimeLineage(
      {
        sourceType,
        ...metadata,
      },
      'projectCriticalPathService.taskDependencies',
    )
    if (sourceType === 'construction_organization_plan_network' && lineage) return lineage
    if (lineage) return lineage
  }
  return null
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

function readPositiveLimit(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.ceil(parsed)
  }
  return null
}

function readTaskResourceProfile(row: CriticalPathTaskRow) {
  const metadata = readRecord(row.metadata)
  const standardTaskMetadata = readRecord(row.standard_task_metadata)
  return readRecord(metadata.resourceProfile ?? metadata.resource_profile ?? standardTaskMetadata.resourceProfile ?? standardTaskMetadata.resource_profile)
}

function readTaskResourceCapacity(row: CriticalPathTaskRow, resourceClass: string | null, projectResourceFacts: CriticalPathProjectResourceFacts = {}) {
  const metadata = readRecord(row.metadata)
  const resourceProfile = readTaskResourceProfile(row)
  const raw = resourceProfile.parallelCapacity
    ?? resourceProfile.parallel_capacity
    ?? resourceProfile.capacity
    ?? metadata.parallelCapacity
    ?? metadata.parallel_capacity
  const numeric = Number(raw)
  const projectFactCapacity = resourceClass === 'tower_crane'
    ? readPositiveLimit(projectResourceFacts.towerCraneCount)
    : resourceClass === 'construction_hoist'
      ? readPositiveLimit(projectResourceFacts.constructionHoistCount)
      : null
  if (Number.isFinite(numeric) && numeric > 0) return Math.max(Math.ceil(numeric), projectFactCapacity ?? 0)
  const normalized = normalizeText(raw).toLowerCase()
  if (normalized === 'low') return Math.max(1, projectFactCapacity ?? 0)
  if (normalized === 'medium') return Math.max(2, projectFactCapacity ?? 0)
  if (normalized === 'high') return Math.max(3, projectFactCapacity ?? 0)
  if (!resourceClass) return null
  if (['concrete_pour', 'tower_crane', 'waterproof'].includes(resourceClass)) return Math.max(1, projectFactCapacity ?? 0)
  if (['rebar', 'formwork', 'plaster', 'hvac', 'electrical'].includes(resourceClass)) return Math.max(2, projectFactCapacity ?? 0)
  return Math.max(3, projectFactCapacity ?? 0)
}

function readTaskResourceLimits(
  row: CriticalPathTaskRow,
  resourceClass: string | null,
  projectResourceFacts: CriticalPathProjectResourceFacts = {},
): ResourceConstraintLimits | null {
  const parallelCapacity = readTaskResourceCapacity(row, resourceClass, projectResourceFacts)
  if (!parallelCapacity) return null
  const resourceProfile = readTaskResourceProfile(row)
  const sameFloorDailyLimit = readPositiveLimit(resourceProfile.sameFloorDailyLimit, resourceProfile.same_floor_daily_limit)
  return {
    parallelCapacity,
    sameBuildingDailyLimit: readPositiveLimit(resourceProfile.sameBuildingDailyLimit, resourceProfile.same_building_daily_limit),
    sameUnitDailyLimit: readPositiveLimit(resourceProfile.sameUnitDailyLimit, resourceProfile.same_unit_daily_limit),
    sameFloorDailyLimit,
    sameZoneDailyLimit: readPositiveLimit(
      resourceProfile.sameZoneDailyLimit,
      resourceProfile.same_zone_daily_limit,
      resourceProfile.sameFunctionalAreaDailyLimit,
      resourceProfile.same_functional_area_daily_limit,
    ) ?? sameFloorDailyLimit,
    sameSystemDailyLimit: readPositiveLimit(resourceProfile.sameSystemDailyLimit, resourceProfile.same_system_daily_limit),
  }
}

function readScopeKeyFromMetadata(row: CriticalPathTaskRow, ...keys: string[]) {
  const metadata = readRecord(row.metadata)
  const standardTaskMetadata = readRecord(row.standard_task_metadata)
  const rowRecord = row as unknown as Record<string, unknown>
  for (const key of keys) {
    const value = normalizeText(rowRecord[key] ?? metadata[key] ?? standardTaskMetadata[key])
    if (value) return value
  }
  return null
}

function readTaskResourceScopeKeys(row: CriticalPathTaskRow): ResourceConstraintScopeKeys {
  return {
    building: readScopeKeyFromMetadata(row, 'building_object_id', 'buildingObjectId', 'building_object_id'),
    unit: readScopeKeyFromMetadata(row, 'participant_unit_id', 'participantUnitId'),
    floor: readScopeKeyFromMetadata(row, 'floor_object_id', 'floorObjectId', 'floor_object_id'),
    zone: readScopeKeyFromMetadata(
      row,
      'physical_zone_object_id',
      'physicalZoneObjectId',
      'functional_area_object_id',
      'functionalAreaObjectId',
      'zoneObjectId',
    ),
    system: readScopeKeyFromMetadata(row, 'system_object_id', 'systemObjectId', 'mepSystemObjectId', 'mep_system_object_id'),
  }
}

function createDependencyCycleGuard(edges: CriticalDependencyEdge[]) {
  const successors = new Map<string, string[]>()
  for (const edge of edges) {
    successors.set(edge.fromTaskId, [...(successors.get(edge.fromTaskId) ?? []), edge.toTaskId])
  }

  return {
    wouldCreateCycle(fromTaskId: string, toTaskId: string) {
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
    },
    addEdge(edge: Pick<CriticalDependencyEdge, 'fromTaskId' | 'toTaskId'>) {
      successors.set(edge.fromTaskId, [...(successors.get(edge.fromTaskId) ?? []), edge.toTaskId])
    },
  }
}

function taskWindowsOverlap(left: TaskNode, right: TaskNode) {
  if (!left.startDate || !left.endDate || !right.startDate || !right.endDate) return true
  return left.startDate.getTime() <= right.endDate.getTime() && right.startDate.getTime() <= left.endDate.getTime()
}

// Resource-capacity edges are only scheduling conflicts for tasks whose execution windows overlap.
function appendResourceConstraintEdges(
  edges: CriticalDependencyEdge[],
  resourceEdges: CriticalDependencyEdge[],
  seen: Set<string>,
  cycleGuard: ReturnType<typeof createDependencyCycleGuard>,
  bucketKey: string,
  resourceTasks: TaskNode[],
  capacity: number,
) {
  const sorted = [...resourceTasks].sort((left, right) => {
    const leftStart = left.startDate?.getTime() ?? 0
    const rightStart = right.startDate?.getTime() ?? 0
    if (leftStart !== rightStart) return leftStart - rightStart
    return left.id.localeCompare(right.id)
  })
  const normalizedCapacity = Math.max(1, Math.ceil(capacity))
  if (sorted.length <= normalizedCapacity) return
  for (let index = normalizedCapacity; index < sorted.length; index += 1) {
    const fromTask = sorted[index - normalizedCapacity]
    const toTask = sorted[index]
    if (!taskWindowsOverlap(fromTask, toTask)) continue
    const key = `${fromTask.id}->${toTask.id}`
    if (seen.has(key) || cycleGuard.wouldCreateCycle(fromTask.id, toTask.id)) continue
    const edge: CriticalDependencyEdge = {
      id: `resource:${bucketKey}:${fromTask.id}:${toTask.id}`,
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
    cycleGuard.addEdge(edge)
  }
}

function addSpatialResourceBucket(
  buckets: Map<string, { tasks: TaskNode[], capacity: number }>,
  resourceClass: string,
  axis: keyof ResourceConstraintScopeKeys,
  scopeValue: string | null | undefined,
  limit: number | null | undefined,
  task: TaskNode,
) {
  if (!scopeValue || !limit || limit <= 0) return
  const key = `${resourceClass}:${axis}:${scopeValue}`
  const existing = buckets.get(key)
  if (existing) {
    existing.tasks.push(task)
    existing.capacity = Math.min(existing.capacity, limit)
    return
  }
  buckets.set(key, { tasks: [task], capacity: limit })
}

function buildResourceConstraintEdges(tasks: TaskNode[], existingEdges: CriticalDependencyEdge[]): CriticalDependencyEdge[] {
  const overlappingGlobalFallbackBuckets = new Map<string, { tasks: TaskNode[], capacity: number }>()
  const spatialBuckets = new Map<string, { tasks: TaskNode[], capacity: number }>()
  for (const task of tasks) {
    const resourceClass = task.resourceClass
    const resourceLimits = task.resourceLimits
    if (!resourceClass || !resourceLimits?.parallelCapacity || resourceLimits.parallelCapacity <= 0) continue
    const global = overlappingGlobalFallbackBuckets.get(resourceClass)
    if (global) {
      global.tasks.push(task)
      global.capacity = Math.min(global.capacity, resourceLimits.parallelCapacity)
    } else {
      overlappingGlobalFallbackBuckets.set(resourceClass, { tasks: [task], capacity: resourceLimits.parallelCapacity })
    }
    const scopeKeys = task.scopeKeys ?? { building: null, unit: null, floor: null, zone: null, system: null }
    addSpatialResourceBucket(spatialBuckets, resourceClass, 'building', scopeKeys.building, resourceLimits.sameBuildingDailyLimit, task)
    addSpatialResourceBucket(spatialBuckets, resourceClass, 'unit', scopeKeys.unit, resourceLimits.sameUnitDailyLimit, task)
    addSpatialResourceBucket(spatialBuckets, resourceClass, 'floor', scopeKeys.floor, resourceLimits.sameFloorDailyLimit, task)
    addSpatialResourceBucket(spatialBuckets, resourceClass, 'zone', scopeKeys.zone, resourceLimits.sameZoneDailyLimit, task)
    addSpatialResourceBucket(spatialBuckets, resourceClass, 'system', scopeKeys.system, resourceLimits.sameSystemDailyLimit, task)
  }

  const edges = [...existingEdges]
  const resourceEdges: CriticalDependencyEdge[] = []
  const seen = new Set(existingEdges.map((edge) => `${edge.fromTaskId}->${edge.toTaskId}`))
  const cycleGuard = createDependencyCycleGuard(edges)
  for (const [bucketKey, bucket] of overlappingGlobalFallbackBuckets.entries()) {
    appendResourceConstraintEdges(edges, resourceEdges, seen, cycleGuard, bucketKey, bucket.tasks, bucket.capacity)
  }
  for (const [bucketKey, bucket] of spatialBuckets.entries()) {
    appendResourceConstraintEdges(edges, resourceEdges, seen, cycleGuard, bucketKey, bucket.tasks, bucket.capacity)
  }
  return resourceEdges
}

function topologicalSort(tasks: TaskNode[], dependencyEdges: CriticalDependencyEdge[]): string[] {
  const result: string[] = []
  const taskIds = new Set(tasks.map((task) => task.id))
  const successors = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  const orderIndex = new Map(tasks.map((task, index) => [task.id, index]))

  for (const task of tasks) {
    successors.set(task.id, [])
    indegree.set(task.id, 0)
  }
  for (const edge of dependencyEdges) {
    if (!taskIds.has(edge.fromTaskId) || !taskIds.has(edge.toTaskId)) continue
    successors.get(edge.fromTaskId)!.push(edge.toTaskId)
    indegree.set(edge.toTaskId, (indegree.get(edge.toTaskId) ?? 0) + 1)
  }

  for (const list of successors.values()) {
    list.sort((left, right) => (orderIndex.get(left) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(right) ?? Number.MAX_SAFE_INTEGER))
  }

  const queue = tasks
    .filter((task) => (indegree.get(task.id) ?? 0) === 0)
    .map((task) => task.id)
  let cursor = 0
  while (cursor < queue.length) {
    const taskId = queue[cursor++]
    result.push(taskId)
    for (const nextTaskId of successors.get(taskId) ?? []) {
      const nextIndegree = (indegree.get(nextTaskId) ?? 0) - 1
      indegree.set(nextTaskId, nextIndegree)
      if (nextIndegree === 0) queue.push(nextTaskId)
    }
  }

  if (result.length !== tasks.length) {
    const emitted = new Set(result)
    const cycleTaskId = tasks.find((task) => !emitted.has(task.id))?.id ?? tasks[0]?.id ?? 'unknown'
    throw new Error(`CRITICAL_PATH_CYCLE_DETECTED:${cycleTaskId}`)
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

export interface CriticalPathDurationNetworkTask {
  id: string
  durationDays: number
  releaseOffsetDays?: number | null
}

export interface CriticalPathDurationNetworkDependency {
  predecessorTaskId: string
  successorTaskId: string
  dependencyType?: 'FS' | 'SS' | 'FF' | 'SF' | null
  lagDays?: number | null
}

export function calculateCriticalPathDurationNetwork(input: {
  tasks: readonly CriticalPathDurationNetworkTask[]
  dependencies?: readonly CriticalPathDurationNetworkDependency[]
}) {
  const originId = '__duration_network_origin__'
  const normalizedTasks: TaskNode[] = input.tasks.map((task) => ({
    id: task.id,
    name: task.id,
    duration: Math.max(0, Number(task.durationDays) || 0),
  }))
  const hasReleaseOffsets = input.tasks.some((task) => Number(task.releaseOffsetDays ?? 0) > 0)
  if (hasReleaseOffsets) {
    normalizedTasks.unshift({ id: originId, name: originId, duration: 0 })
  }
  const dependencies: CriticalPathDependencyRow[] = (input.dependencies ?? []).map((dependency, index) => ({
    id: `duration-network:${index}`,
    task_id: dependency.successorTaskId,
    dependency_task_id: dependency.predecessorTaskId,
    dependency_type: dependency.dependencyType ?? 'FS',
    lag_days: Number(dependency.lagDays ?? 0) || 0,
    required_for_start: true,
    status: 'active',
    source_type: 'duration_network_simulation',
  }))
  if (hasReleaseOffsets) {
    for (const task of input.tasks) {
      const releaseOffsetDays = Math.max(0, Math.round(Number(task.releaseOffsetDays ?? 0) || 0))
      if (releaseOffsetDays <= 0) continue
      dependencies.push({
        id: `duration-network-release:${task.id}`,
        task_id: task.id,
        dependency_task_id: originId,
        dependency_type: 'SS',
        lag_days: releaseOffsetDays,
        required_for_start: true,
        status: 'active',
        source_type: 'duration_network_release_constraint',
      })
    }
  }

  const analysis = calculateCPM(normalizedTasks, dependencies)
  return {
    projectDurationDays: analysis.projectDuration,
    criticalTaskIds: analysis.criticalPath.filter((taskId) => taskId !== originId),
    dependencyEdgeCount: analysis.dependencyEdges.filter((edge) => (
      edge.fromTaskId !== originId && edge.toTaskId !== originId
    )).length,
  }
}

export interface CriticalPathSyntheticNetworkProfileOptions {
  taskCount?: number
  resourceCapacity?: number
  resourceBucketCount?: number
}

export interface CriticalPathSyntheticNetworkProfileResult {
  taskCount: number
  explicitDependencyCount: number
  totalDependencyEdgeCount: number
  resourceConstraintEdgeCount: number
  criticalPathLength: number
  projectDurationDays: number
}

function normalizeSyntheticProfileCount(value: unknown, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.trunc(parsed))
}

function buildSyntheticCriticalPathProfileTasks(params: {
  taskCount: number
  resourceCapacity: number
  resourceBucketCount: number
}): TaskNode[] {
  return Array.from({ length: params.taskCount }, (_, index) => {
    const bucketIndex = index % params.resourceBucketCount
    return {
      id: `c18-l12-task-${index + 1}`,
      name: `C-18.L12 synthetic task ${index + 1}`,
      duration: 1,
      resourceClass: `c18-l12-resource-${bucketIndex + 1}`,
      resourceLimits: {
        parallelCapacity: params.resourceCapacity,
        sameBuildingDailyLimit: null,
        sameUnitDailyLimit: null,
        sameFloorDailyLimit: null,
        sameZoneDailyLimit: null,
        sameSystemDailyLimit: null,
      },
      scopeKeys: {
        building: null,
        unit: null,
        floor: null,
        zone: null,
        system: null,
      },
    }
  })
}

export function runCriticalPathSyntheticNetworkProfile(
  options: CriticalPathSyntheticNetworkProfileOptions = {},
): CriticalPathSyntheticNetworkProfileResult {
  const taskCount = normalizeSyntheticProfileCount(options.taskCount, 1000)
  const resourceCapacity = normalizeSyntheticProfileCount(options.resourceCapacity, 1)
  const resourceBucketCount = Math.min(
    taskCount,
    normalizeSyntheticProfileCount(options.resourceBucketCount, 1),
  )
  const tasks = buildSyntheticCriticalPathProfileTasks({
    taskCount,
    resourceCapacity,
    resourceBucketCount,
  })
  const dependencies: CriticalPathDependencyRow[] = []
  const analysis = calculateCPM(tasks, dependencies)
  const resourceConstraintEdgeCount = analysis.dependencyEdges
    .filter((edge) => edge.source === 'resource_constraint')
    .length

  return {
    taskCount,
    explicitDependencyCount: dependencies.length,
    totalDependencyEdgeCount: analysis.dependencyEdges.length,
    resourceConstraintEdgeCount,
    criticalPathLength: analysis.criticalPath.length,
    projectDurationDays: analysis.projectDuration,
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
  const projections = [...analysis.taskMap.keys()].map((taskId) => {
    const totalFloatDays = Math.max(0, Math.round(analysis.float.get(taskId) ?? 0))
    const freeFloatDays = buildFreeFloatDays(taskId, analysis)
    const isCritical = criticalTaskIds.has(taskId)
    return {
      taskId,
      isCritical,
      totalFloatDays,
      freeFloatDays,
      criticalityWeight: criticalityWeightFromFloat(isCritical, totalFloatDays, freeFloatDays),
    }
  })
  if (projections.length === 0) return

  await rawQuery(
    `WITH projection AS (
       SELECT *
       FROM jsonb_to_recordset($2::jsonb) AS p(
         task_id text,
         is_critical boolean,
         total_float_days integer,
         free_float_days integer,
         criticality_weight numeric
       )
     )
     UPDATE tasks AS t
        SET is_critical = projection.is_critical,
            total_float_days = projection.total_float_days,
            free_float_days = projection.free_float_days,
            criticality_weight = projection.criticality_weight,
            updated_at = $1
       FROM projection
      WHERE t.project_id = $3
        AND t.id::text = projection.task_id`,
    [
      updatedAt,
      JSON.stringify(projections.map((projection) => ({
        task_id: projection.taskId,
        is_critical: projection.isCritical,
        total_float_days: projection.totalFloatDays,
        free_float_days: projection.freeFloatDays,
        criticality_weight: projection.criticalityWeight,
      }))),
      projectId,
    ],
  )
}

function buildProjectionAnalysisFromSnapshot(
  rows: CriticalPathTaskRow[],
  snapshot: CriticalPathSnapshot,
  constructionCalendar: ConstructionCalendarContext | null,
): CPMResult {
  const rowById = new Map(rows.map((row) => [row.id, row]))
  const taskMap = new Map<string, TaskNode>()
  const earliestStart = new Map<string, number>()
  const earliestFinish = new Map<string, number>()
  const latestStart = new Map<string, number>()
  const latestFinish = new Map<string, number>()
  const float = new Map<string, number>()
  const dependencyEdges: CriticalDependencyEdge[] = (snapshot.edges ?? [])
    .filter((edge) => edge.source === 'dependency' || edge.source === 'resource_constraint')
    .map((edge) => {
      const fromRow = rowById.get(edge.fromTaskId)
      const weight = fromRow ? getTaskDurationDays(fromRow, constructionCalendar) : 1
      return {
        id: edge.id,
        fromTaskId: edge.fromTaskId,
        toTaskId: edge.toTaskId,
        dependencyType: edge.dependencyType ?? 'FS',
        lagDays: edge.lagDays ?? 0,
        weight,
        source: edge.source === 'resource_constraint' ? 'resource_constraint' : 'dependency',
      }
    })

  for (const schedule of snapshot.networkSchedule ?? []) {
    const row = rowById.get(schedule.taskId)
    if (!row) continue
    taskMap.set(schedule.taskId, {
      id: schedule.taskId,
      name: row.title || schedule.taskId,
      startDate: parseDate(row.start_date ?? row.planned_start_date),
      endDate: parseDate(row.end_date ?? row.planned_end_date),
      duration: schedule.durationDays,
    })
    earliestStart.set(schedule.taskId, schedule.earliestStartOffsetDays)
    earliestFinish.set(schedule.taskId, schedule.earliestFinishOffsetDays)
    latestStart.set(schedule.taskId, schedule.latestStartOffsetDays)
    latestFinish.set(schedule.taskId, schedule.latestFinishOffsetDays)
    float.set(schedule.taskId, schedule.floatDays)
  }

  return {
    criticalPath: snapshot.autoTaskIds,
    criticalEdges: [],
    dependencyEdges,
    projectDuration: snapshot.projectDurationDays,
    earliestStart,
    earliestFinish,
    latestStart,
    latestFinish,
    float,
    orderedTaskIds: (snapshot.networkSchedule ?? []).map((task) => task.taskId),
    taskMap,
  }
}

async function persistCriticalPathTaskProjectionFromSnapshot(
  projectId: string,
  rows: CriticalPathTaskRow[],
  snapshot: CriticalPathSnapshot,
  constructionCalendar: ConstructionCalendarContext | null,
) {
  const analysis = buildProjectionAnalysisFromSnapshot(rows, snapshot, constructionCalendar)
  await persistCriticalPathTaskProjection(projectId, analysis, new Set(snapshot.displayTaskIds))
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

function readCriticalPathDurationContributionMode(row: CriticalPathTaskRow) {
  const metadata = readRecord(row.standard_task_metadata)
  const fallbackMetadata = readRecord(row.metadata)
  return String(
    row.duration_contribution_mode
      ?? metadata.durationContributionMode
      ?? metadata.duration_contribution_mode
      ?? fallbackMetadata.durationContributionMode
      ?? fallbackMetadata.duration_contribution_mode
      ?? 'duration_bearing',
  ).trim().toLowerCase()
}

function isCriticalPathDurationBearingRow(row: CriticalPathTaskRow) {
  const mode = readCriticalPathDurationContributionMode(row)
  if (!mode) return true
  return ![
    'record_only',
    'embedded_check',
    'handover_marker',
    'external_wait',
  ].includes(mode)
}

function isCriticalPathExternalWaitRow(row?: CriticalPathTaskRow | null) {
  return row ? readCriticalPathDurationContributionMode(row) === 'external_wait' : false
}

function buildTaskNodes(
  rows: CriticalPathTaskRow[],
  currentForecasts = new Map<string, TaskDurationForecast>(),
  calendar?: ConstructionCalendarContext | null,
  projectResourceFacts: CriticalPathProjectResourceFacts = {},
): TaskNode[] {
  const eligibleTasks = rows.filter((row) => {
    if (!isCriticalPathDurationBearingRow(row)) return false
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
    const rawDuration = forecastRemainingDays ?? cpmSpanDays(startDate, endDate, calendar) ?? 1
    const durationGuard = evaluateDurationPlausibility({
      engineCode: 'critical_path_cpm',
      durationDays: rawDuration,
      title: task.title,
      standardWorkCode: task.standard_work_code,
      taskId: task.id,
      clamp: true,
    })
    const duration = durationGuard.durationDays ?? rawDuration
    const p50DurationDays = readPositiveInt((probabilityDuration as any)?.p50RemainingDays)
    const p80DurationDays = readPositiveInt((probabilityDuration as any)?.p80RemainingDays)
    const standardDeviationDays = readPositiveInt((probabilityDuration as any)?.standardDeviationDays)
    const confidenceBandWidthDays = readPositiveInt((probabilityDuration as any)?.confidenceBandWidthDays)
    const resourceClass = readTaskResourceClass(task)
    const resourceLimits = readTaskResourceLimits(task, resourceClass, projectResourceFacts)
    const resourceCapacity = resourceLimits?.parallelCapacity ?? null

    return {
      id: task.id,
      name: task.title || task.id,
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
      resourceLimits,
      scopeKeys: readTaskResourceScopeKeys(task),
      plausibilityWarnings: durationGuard.warnings,
    }
  })
}

function buildNetworkMaturity(analysis: CPMResult): CriticalPathSnapshot['networkMaturity'] {
  const taskCount = analysis.taskMap.size
  const dependencyEdgeCount = analysis.dependencyEdges.filter((edge) => edge.source === 'dependency').length
  if (taskCount > 1 && dependencyEdgeCount === 0) {
    return {
      level: 'low',
      policy: 'disconnected_cold_start_longest_task_is_not_authoritative_cpm',
      dependencyEdgeCount,
      taskCount,
    }
  }
  return {
    level: dependencyEdgeCount >= Math.max(1, taskCount - 1) ? 'high' : 'medium',
    policy: 'semantic_dependency_network_available',
    dependencyEdgeCount,
    taskCount,
  }
}

function buildCriticalPathPlausibilityWarnings(analysis: CPMResult, networkMaturity: CriticalPathSnapshot['networkMaturity']) {
  const warnings: DurationPlausibilityWarning[] = []
  for (const node of analysis.taskMap.values()) {
    warnings.push(...(node.plausibilityWarnings ?? []))
  }
  if (networkMaturity?.level === 'low' && networkMaturity.policy === 'disconnected_cold_start_longest_task_is_not_authoritative_cpm') {
    warnings.push({
      ruleId: 'cpm.network.disconnected_cold_start',
      severity: 'warning',
      engineCode: 'critical_path_cpm',
      message: 'CPM network has no explicit dependency edges; project duration is a cold-start longest-task fallback, not an authoritative network critical path.',
      metadata: {
        taskCount: networkMaturity.taskCount,
        dependencyEdgeCount: networkMaturity.dependencyEdgeCount,
      },
    })
  }
  for (const taskId of analysis.orderedTaskIds) {
    const rawFloat = analysis.float.get(taskId)
    if (rawFloat != null && rawFloat < 0) {
      warnings.push({
        ruleId: 'cpm.float.negative',
        severity: 'warning',
        engineCode: 'critical_path_cpm',
        message: 'CPM produced negative float; the network is overconstrained and should be reviewed instead of silently treating the task as zero-float.',
        taskId,
        originalDays: rawFloat,
        adjustedDays: 0,
      })
    }
  }
  for (const edge of analysis.dependencyEdges) {
    if (edge.weight < 0) {
      warnings.push({
        ruleId: 'cpm.float.negative',
        severity: 'warning',
        engineCode: 'critical_path_cpm',
        message: 'Dependency lag creates a negative CPM offset; the network may be overconstrained and needs review before float values are trusted.',
        taskId: edge.fromTaskId,
        originalDays: edge.weight,
        adjustedDays: 0,
        metadata: {
          dependencyId: edge.id,
          fromTaskId: edge.fromTaskId,
          toTaskId: edge.toTaskId,
          dependencyType: edge.dependencyType,
          lagDays: edge.lagDays,
        },
      })
    }
  }
  return warnings
}

function buildSemanticDependencyRowsForCriticalPath(
  rows: CriticalPathTaskRow[],
  dependencies: CriticalPathDependencyRow[],
  calendar?: ConstructionCalendarContext | null,
): CriticalPathDependencyRow[] {
  const rowById = new Map(rows.map((row) => [row.id, row]))
  const bearingTaskIds = new Set(rows.filter(isCriticalPathDurationBearingRow).map((row) => row.id))
  const incomingByWaitTask = new Map<string, CriticalPathDependencyRow[]>()
  const outgoingByWaitTask = new Map<string, CriticalPathDependencyRow[]>()

  for (const dependency of dependencies) {
    if (!isActiveRequiredDependency(dependency)) continue
    if (isCriticalPathExternalWaitRow(rowById.get(dependency.task_id))) {
      incomingByWaitTask.set(dependency.task_id, [...(incomingByWaitTask.get(dependency.task_id) ?? []), dependency])
    }
    if (isCriticalPathExternalWaitRow(rowById.get(dependency.dependency_task_id))) {
      outgoingByWaitTask.set(dependency.dependency_task_id, [...(outgoingByWaitTask.get(dependency.dependency_task_id) ?? []), dependency])
    }
  }

  const bridgedRows: CriticalPathDependencyRow[] = []
  for (const waitRow of rows.filter(isCriticalPathExternalWaitRow)) {
    const incoming = incomingByWaitTask.get(waitRow.id) ?? []
    const outgoing = outgoingByWaitTask.get(waitRow.id) ?? []
    if (incoming.length === 0 || outgoing.length === 0) continue
    const waitDurationDays = Math.max(0, getTaskDurationDays(waitRow, calendar))
    for (const left of incoming) {
      const fromTaskId = normalizeText(left.dependency_task_id)
      if (!bearingTaskIds.has(fromTaskId)) continue
      for (const right of outgoing) {
        const toTaskId = normalizeText(right.task_id)
        if (!bearingTaskIds.has(toTaskId) || fromTaskId === toTaskId) continue
        bridgedRows.push({
          id: `semantic-external-wait:${waitRow.id}:${fromTaskId}:${toTaskId}`,
          task_id: toTaskId,
          dependency_task_id: fromTaskId,
          dependency_type: 'FS',
          lag_days: Math.max(0, normalizeLagDays(left.lag_days)) + waitDurationDays + Math.max(0, normalizeLagDays(right.lag_days)),
          required_for_start: true,
          status: 'active',
          created_at: waitRow.created_at ?? right.created_at ?? left.created_at ?? null,
        })
      }
    }
  }

  return [
    ...dependencies,
    ...bridgedRows,
  ]
}

async function loadCurrentForecastMapForCriticalPath(rows: CriticalPathTaskRow[]) {
  const taskIds = rows.map((row) => row.id).filter(Boolean)
  if (taskIds.length === 0) return new Map<string, TaskDurationForecast>()
  const projectId = normalizeText(rows[0]?.project_id)
  if (!projectId) return new Map<string, TaskDurationForecast>()
  try {
    const forecasts = await listCurrentTaskDurationForecasts(taskIds, { projectId, maxAgeMs: null })
    return new Map(forecasts.map((forecast) => [forecast.taskId, forecast]))
  } catch (error) {
    logger.warn('[projectCriticalPathService] failed to load E2 task duration forecasts for CPM', {
      error: error instanceof Error ? error.message : String(error),
    })
    return new Map<string, TaskDurationForecast>()
  }
}

async function loadCriticalPathProjectResourceFacts(projectId: string): Promise<CriticalPathProjectResourceFacts> {
  try {
    const facts = await readLiveProjectGenerationFacts(projectId)
    return buildCriticalPathProjectResourceFacts(facts)
  } catch (error) {
    logger.warn('[projectCriticalPathService] failed to load project resource facts for CPM', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return {}
  }
}

function buildCriticalPathProjectResourceFacts(facts: Record<string, unknown>): CriticalPathProjectResourceFacts {
  return {
    towerCraneCount: readPositiveLimit(facts.towerCraneCount),
    constructionHoistCount: readPositiveLimit(facts.constructionHoistCount),
  }
}

async function loadCriticalPathProjectGenerationFacts(projectId: string): Promise<Record<string, unknown>> {
  try {
    return await readLiveProjectGenerationFacts(projectId)
  } catch (error) {
    logger.warn('[projectCriticalPathService] failed to load project generation facts for CPM', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return {}
  }
}

function hasT2RhythmScheduleCandidateNetworkEvaluation(
  value: unknown,
): value is T2RhythmScheduleCandidateNetworkPhase1Evaluation {
  return readRecord(value).source === 't2_rhythm_schedule_candidate_network_phase1_evaluation'
}

function buildCriticalPathT2RhythmNetworkEvidence(
  facts: Record<string, unknown>,
): CriticalPathT2RhythmNetworkEvidence | undefined {
  const candidate = facts.t2RhythmScheduleCandidateNetworkEvaluation
    ?? facts.t2_rhythm_schedule_candidate_network_evaluation
    ?? facts.t2_rhythm_schedule_candidate_network_phase1_evaluation
  if (!hasT2RhythmScheduleCandidateNetworkEvaluation(candidate)) return undefined
  return {
    source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
    candidateId: candidate.candidateId,
    tier: 'T2',
    status: candidate.status,
    canEnterC1913Phase1Selection: candidate.canEnterC1913Phase1Selection,
    networkSpanDays: candidate.networkSpanDays,
    criticalWindowCodes: candidate.criticalWindowCodes,
    criticalNodeCount: candidate.criticalNodeIds.length,
    nodeEvaluationCount: candidate.nodeEvaluations.length,
    dependencyEdgeCount: candidate.scheduleTrustEvidence.dependencyEdgeCount,
    hardGateCount: candidate.scheduleTrustEvidence.hardGateCount,
    topologyEvaluated: candidate.scheduleTrustEvidence.topologyEvaluated,
    floatCalculated: candidate.scheduleTrustEvidence.floatCalculated,
    conflictSummary: candidate.conflictSummary,
    phase1PublicationGate: candidate.phase1PublicationGate,
    canMaterializeTaskDependencies: false,
    mutationBoundary: candidate.mutationBoundary,
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

const CRITICAL_PATH_TASK_SELECT_COLUMNS = [
  'id',
  'project_id',
  'title',
  'start_date',
  'end_date',
  'planned_start_date',
  'planned_end_date',
  'actual_start_date',
  'actual_end_date',
  'status',
  'progress',
  'is_milestone',
  'milestone_level',
  'wbs_level',
  'building_object_id',
  'floor_object_id',
  'physical_zone_object_id',
  'functional_area_object_id',
  'participant_unit_id',
  'standard_work_code',
  'execution_lane',
  'duration_contribution_mode',
  'created_at',
].join(', ')

async function loadCriticalPathTaskRows(projectId: string): Promise<CriticalPathTaskRow[]> {
  if (process.env.NODE_ENV !== 'test') {
    try {
      const result = await rawQuery(
        `SELECT ${CRITICAL_PATH_TASK_SELECT_COLUMNS}, NULL::text AS name, NULL::jsonb AS metadata, NULL::jsonb AS standard_task_metadata
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
    `SELECT ${CRITICAL_PATH_TASK_SELECT_COLUMNS} FROM tasks WHERE project_id = ? ORDER BY created_at ASC`,
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

function criticalPathDurationLearningQueryExec(): DurationLearningRuntimePublicationQueryExec {
  if (process.env.NODE_ENV === 'test') {
    return async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
      // execute-sql-dynamic-approved: the test adapter executes only fixed duration-publication resolver SQL; critical-path scope values remain separately bound.
      return executeSQL<T>(sql, params)
    }
  }
  return async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
    // database-query-dynamic-approved: the production adapter executes only fixed duration-publication resolver SQL; no request text or identifier is interpolated and all scope values are bound parameters.
    const result = await rawQuery(sql, params)
    return (result.rows ?? []) as T[]
  }
}

function readCriticalPathTaskStableCodes(row: CriticalPathTaskRow) {
  const metadata = readRecord(row.metadata)
  const standardTaskMetadata = readRecord(row.standard_task_metadata)
  return unique([
    normalizeText(row.standard_work_code),
    normalizeText(metadata.stableCode ?? metadata.stable_code),
    normalizeText(metadata.standardWorkCode ?? metadata.standard_work_code),
    normalizeText(standardTaskMetadata.stableCode ?? standardTaskMetadata.stable_code),
    normalizeText(standardTaskMetadata.standardWorkCode ?? standardTaskMetadata.standard_work_code),
  ])
}

async function loadCriticalPathLearningScope(
  projectId: string,
  projectGenerationFacts: Record<string, unknown>,
  queryExec: DurationLearningRuntimePublicationQueryExec,
) {
  let companyId = normalizeText(projectGenerationFacts.companyId ?? projectGenerationFacts.company_id) || null
  let industryKey = normalizeText(
    projectGenerationFacts.industryKey
      ?? projectGenerationFacts.industry_key
      ?? projectGenerationFacts.businessType
      ?? projectGenerationFacts.business_type
      ?? projectGenerationFacts.projectTypeCode
      ?? projectGenerationFacts.project_type_code,
  ) || null
  if (!companyId || !industryKey) {
    try {
      const projects = await queryExec<Record<string, unknown>>(
        `select company_id, business_type, project_type
           from public.projects
          where id = $1::uuid
          limit 1`,
        [projectId],
      )
      if (!companyId) {
        companyId = normalizeText(projects[0]?.company_id ?? projects[0]?.companyId) || null
      }
      if (!industryKey) {
        industryKey = normalizeText(
          projects[0]?.business_type
            ?? projects[0]?.businessType
            ?? projects[0]?.project_type
            ?? projects[0]?.projectType,
        ) || null
      }
    } catch (error) {
      logger.warn('[projectCriticalPathService] project scope unavailable for critical-path learning publication', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { companyId, industryKey }
}

async function resolveCriticalPathLearningPublications(input: {
  projectId: string
  rows: CriticalPathTaskRow[]
  projectGenerationFacts: Record<string, unknown>
  autoTaskIds: readonly string[]
  criticalPathInputHash?: string | null
  taskNetworkInputHash?: string | null
}) {
  const queryExec = criticalPathDurationLearningQueryExec()
  try {
    const scope = await loadCriticalPathLearningScope(input.projectId, input.projectGenerationFacts, queryExec)
    const resolutions = await listApplicableDurationLearningRuntimePublications({
      queryExec,
      assetKey: 'critical_path_rule_candidate',
      companyId: scope.companyId,
      projectId: input.projectId,
      industryKey: scope.industryKey,
    })
    const autoTaskIds = new Set(input.autoTaskIds)
    const applications: CriticalPathLearningPublicationApplication[] = []
    for (const resolution of resolutions) {
      const publication = resolution.publication
      if (!publication || !resolution.publicationKey) continue
      const rawCodes = Array.isArray(publication.runtimePayload.criticalStableCodes)
        ? publication.runtimePayload.criticalStableCodes
        : Array.isArray(publication.runtimePayload.critical_stable_codes)
          ? publication.runtimePayload.critical_stable_codes
          : Array.isArray(publication.runtimePayload.stableCodes)
            ? publication.runtimePayload.stableCodes
            : []
      const criticalStableCodes = unique(rawCodes.map(normalizeText))
      const codeSet = new Set(criticalStableCodes.map((code) => code.toLowerCase()))
      const inputTaskIds = unique(input.rows
        .filter((row) => readCriticalPathTaskStableCodes(row).some((code) => codeSet.has(code.toLowerCase())))
        .map((row) => row.id))
      if (inputTaskIds.length === 0) continue
      const appliedTaskIds = inputTaskIds.filter((taskId) => !autoTaskIds.has(taskId))
      applications.push({
        publicationKey: resolution.publicationKey,
        publicationStage: publication.publicationStage,
        selectionBasis: resolution.selectionBasis,
        artifactKey: publication.artifactKey,
        criticalStableCodes,
        inputTaskIds,
        appliedTaskIds,
        role: 'watched_task_prior',
      })
    }
    const artifacts = applications.map((application) => ({
      assetKey: 'critical_path_rule_candidate' as const,
      publicationKey: application.publicationKey,
      publicationStatus: application.publicationStage === 'canary' ? 'canary' as const : 'published' as const,
      sourceEvidenceRefs: [`duration_learning_runtime_publications:${application.publicationKey}`],
      observationContext: {
        projectId: input.projectId,
        artifactKey: application.artifactKey,
        inputTaskIds: application.inputTaskIds,
        appliedTaskIds: application.appliedTaskIds,
        role: application.role,
        selectionBasis: application.selectionBasis,
        criticalPathInputHash: input.criticalPathInputHash ?? null,
        taskNetworkInputHash: input.taskNetworkInputHash ?? null,
      },
    }))
    const hashEvidenceRefs = [
      input.criticalPathInputHash ? `critical_path_inputs:${input.criticalPathInputHash}` : null,
      input.taskNetworkInputHash ? `critical_path_task_network:${input.taskNetworkInputHash}` : null,
    ].filter((value): value is string => Boolean(value))
    for (const artifact of artifacts) {
      artifact.sourceEvidenceRefs = [
        ...artifact.sourceEvidenceRefs,
        ...hashEvidenceRefs,
      ]
    }
    await recordProjectCriticalPathConsumedArtifacts({
      queryExec,
      artifacts,
      callContext: {
        projectId: input.projectId,
        autoCriticalTaskCount: input.autoTaskIds.length,
        learnedInputTaskCount: unique(applications.flatMap((application) => application.inputTaskIds)).length,
        learnedWatchTaskCount: unique(applications.flatMap((application) => application.appliedTaskIds)).length,
      },
      sourceEvidenceRefs: [`critical_path_cpm:${input.projectId}`],
      writesRuntimeDirectly: false,
      writesFactDirectly: false,
    })
    return applications
  } catch (error) {
    logger.warn('[projectCriticalPathService] critical-path learning publication unavailable; CPM facts remain authoritative', {
      projectId: input.projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
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
    return Math.max(1, latestFinish - earliestStart)
  }

  return taskIds.reduce((sum, taskId) => sum + getTaskDurationDays(taskMap.get(taskId), calendar), 0)
}

function buildAutoCriticalChains(
  projectId: string,
  rows: CriticalPathTaskRow[],
  taskMap: Map<string, CriticalPathTaskRow>,
  analysis: CPMResult,
  calendar?: ConstructionCalendarContext | null,
): CriticalChainFacts[] {
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

  const pushPath = (path: string[]) => {
    const key = path.join('>')
    if (!pathKeys.has(key)) {
      pathKeys.add(key)
      paths.push(path)
    }
  }

  const stack = roots
    .slice()
    .reverse()
    .map((taskId) => ({ taskId, path: [] as string[] }))

  while (stack.length > 0 && paths.length < MAX_AUTO_CRITICAL_CHAINS) {
    const { taskId, path } = stack.pop()!
    const nextPath = [...path, taskId]
    const nextTaskIds = [...(successors.get(taskId) ?? [])].sort(sortByAnalysisOrder)
    if (nextTaskIds.length === 0) {
      pushPath(nextPath)
      continue
    }

    for (const nextTaskId of [...nextTaskIds].reverse()) {
      stack.push({ taskId: nextTaskId, path: nextPath })
    }
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
  chains: CriticalChainFacts[],
  taskMap: Map<string, CriticalPathTaskRow>,
  analysis: CPMResult,
): { primaryChain: CriticalChainFacts | null; alternateChains: CriticalChainFacts[]; orderedTaskIds: string[] } {
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
): CriticalChainFacts[] {
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
      } satisfies CriticalChainFacts
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
): CriticalChainFacts[] {
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
      displayLabel: `Manual insert: ${taskMap.get(override.task_id)?.title || override.task_id}`,
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
  primaryChain: CriticalChainFacts | null
  alternateChains: CriticalChainFacts[]
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

function durationInputAssemblyContextFromAssembler(
  assembled: Awaited<ReturnType<typeof assembleDurationInput>>,
) {
  return {
    source: 'duration_input_assembler',
    inputChannels: assembled.inputChannels,
    sourceLineage: assembled.sourceLineage.map((lineage) => ({
      channel: lineage.channel,
      source: lineage.source,
      status: lineage.status,
      tier: lineage.tier ?? null,
      candidateId: lineage.candidateId ?? null,
      selectedTemplateIds: lineage.selectedTemplateIds ?? [],
      assetSource: lineage.assetSource ?? null,
    })),
    assemblyGate: assembled.assemblyGate,
    upstreamAssetConsumptionReceipts: assembled.assetConsumptionReceipts,
    upstreamAssetConsumptionSummary: assembled.assetConsumptionSummary,
    mutationBoundary: assembled.mutationBoundary,
  }
}

async function buildCriticalPathDurationInputAssembly(input: {
  projectId: string
  projectGenerationFacts: Record<string, unknown>
  networkLineage: CriticalPathNetworkLineage
  primaryChain: CriticalChainFacts | null
  autoTaskIds: string[]
  projectDurationDays: number
  edgeCount: number
}) {
  const assembled = await assembleDurationInput({
    projectId: input.projectId,
    projectGenerationFacts: input.projectGenerationFacts,
    criticalPathEvidence: {
      source: 'critical_path_cpm',
      engineCode: 'E3',
      criticalPathAlgorithmVersion: input.networkLineage.criticalPathAlgorithmVersion,
      criticalPathInputHash: input.networkLineage.criticalPathInputHash,
      criticalSetHash: input.networkLineage.criticalSetHash,
      primaryChainTaskIds: input.primaryChain?.taskIds ?? input.autoTaskIds,
      autoTaskIds: input.autoTaskIds,
      projectDurationDays: input.projectDurationDays,
      edgeCount: input.edgeCount,
    },
  }, {
    purpose: 'runtime_forecast',
  })
  const downstreamConsumption = buildDownstreamDurationAssetConsumption({
    consumer: 'critical_path_cpm',
    upstreamReceipts: assembled.assetConsumptionReceipts,
    before: {
      taskSelection: null,
      durationDays: null,
      dependencies: null,
      confidence: null,
    },
    after: {
      taskSelection: input.autoTaskIds,
      durationDays: input.projectDurationDays,
      dependencies: { edgeCount: input.edgeCount },
      confidence: {
        p80DurationDays: input.primaryChain?.p80DurationDays ?? null,
        confidenceBandWidthDays: input.primaryChain?.confidenceBandWidthDays ?? null,
      },
    },
    targetRowIds: input.autoTaskIds,
  })
  return {
    ...durationInputAssemblyContextFromAssembler(assembled),
    assetConsumptionReceipts: downstreamConsumption.receipts,
    assetConsumptionSummary: downstreamConsumption.summary,
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
  const cached = getCachedCriticalPathSnapshot(projectId)
  if (cached) return cached

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
          `SELECT id, task_id, dependency_task_id, dependency_type, lag_days, required_for_start, status, source_type, metadata, created_at
             FROM public.task_dependencies
            WHERE project_id = $1
              AND task_id = ANY($2::uuid[])
              AND status = 'active'
              AND required_for_start IS DISTINCT FROM false
            ORDER BY created_at ASC, id ASC`,
          [projectId, allIds],
        )).rows as CriticalPathDependencyRow[]
      : await executeSQL<CriticalPathDependencyRow>(
          `SELECT id, task_id, dependency_task_id, dependency_type, lag_days, required_for_start, status, source_type, metadata, created_at
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
  return (await buildProjectCriticalPathSnapshotWithContext(projectId, rows, overrides)).snapshot
}

async function buildProjectCriticalPathSnapshotWithContext(
  projectId: string,
  rows: CriticalPathTaskRow[],
  overrides: CriticalPathOverrideRow[],
): Promise<{
  snapshot: CriticalPathSnapshot
  constructionCalendar: ConstructionCalendarContext | null
  dependencyRows: CriticalPathDependencyRow[]
  constructionOrganizationLineage: ConstructionOrganizationPlanNetworkRuntimeLineage | null
}> {
  const constructionCalendar = await resolveCriticalPathConstructionCalendar(projectId)
  const dependencyRows = await loadCriticalPathDependencyRows(projectId, rows)
  const constructionOrganizationLineage = readConstructionOrganizationLineageFromDependencyRows(dependencyRows)
  const currentForecasts = await loadCurrentForecastMapForCriticalPath(rows)
  const projectGenerationFacts = await loadCriticalPathProjectGenerationFacts(projectId)
  const projectResourceFacts = buildCriticalPathProjectResourceFacts(projectGenerationFacts)
  const t2RhythmScheduleCandidateNetworkEvidence = buildCriticalPathT2RhythmNetworkEvidence(projectGenerationFacts)
  const taskNodes = buildTaskNodes(rows, currentForecasts, constructionCalendar, projectResourceFacts)
  const semanticDependencyRows = buildSemanticDependencyRowsForCriticalPath(rows, dependencyRows, constructionCalendar)
  let analysis: CPMResult
  let hasCycleDetected = false
  let cycleTaskIds: string[] = []
  let calculatedSuccessfully = false
  try {
    analysis = calculateCPM(taskNodes, semanticDependencyRows)
    calculatedSuccessfully = true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const failedAt = new Date().toISOString()
    hasCycleDetected = errorMessage.startsWith('CRITICAL_PATH_CYCLE_DETECTED:')
    if (hasCycleDetected) {
      const cycleTaskId = errorMessage.replace('CRITICAL_PATH_CYCLE_DETECTED:', '').trim()
      if (cycleTaskId) cycleTaskIds = [cycleTaskId]
    }
    logger.warn('[projectCriticalPathService] recalculation CPM failed, snapshot metadata will indicate stale or empty data', {
      projectId,
      hasCycleDetected,
      cycleTaskIds,
      error: errorMessage,
    })
    const cachedSnapshot = getCachedCriticalPathSnapshot(projectId, new Set(rows.map((row) => row.id)))
    if (cachedSnapshot) {
      logger.warn('[projectCriticalPathService] using cached critical path snapshot after CPM failure', {
        projectId,
        hasCycleDetected,
        cycleTaskIds,
      })
      return {
        snapshot: {
          ...cachedSnapshot,
          calculationStatus: 'cached_after_failure',
          calculationFailureMessage: errorMessage,
          calculationFailedAt: failedAt,
          lastSuccessfulCalculatedAt: cachedSnapshot.lastSuccessfulCalculatedAt ?? cachedSnapshot.calculatedAt ?? null,
          hasCycleDetected: cachedSnapshot.hasCycleDetected || hasCycleDetected,
          cycleTaskIds: cycleTaskIds.length > 0 ? cycleTaskIds : cachedSnapshot.cycleTaskIds,
        },
        constructionCalendar,
        dependencyRows,
        constructionOrganizationLineage,
      }
    }
    return {
      snapshot: {
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
        networkSchedule: [],
        projectDurationDays: 0,
        projectDuration: buildConstructionProductionDayDurationMetric(null, {
          asOf: businessDateKey(new Date(failedAt), constructionCalendar?.timezone),
          timezone: constructionCalendar?.timezone,
          calendar: constructionCalendar,
        }),
        calculationStatus: 'empty_after_failure',
        calculationFailureMessage: errorMessage,
        calculationFailedAt: failedAt,
        lastSuccessfulCalculatedAt: null,
        hasCycleDetected,
        cycleTaskIds: cycleTaskIds.length > 0 ? cycleTaskIds : undefined,
      },
      constructionCalendar,
      dependencyRows,
      constructionOrganizationLineage,
    }
  }
  const taskMap = new Map(rows.map((row) => [row.id, row]))
  const networkMaturity = buildNetworkMaturity(analysis)
  const durationPlausibilityWarnings = buildCriticalPathPlausibilityWarnings(analysis, networkMaturity)
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

  // Bind learned-publication observations to the exact CPM network replay.
  const displayTaskIds = unique([
    ...orderDisplayTaskIds(autoTaskIds, new Set(rows.map((row) => row.id)), manualInsertOverrides),
  ])
  const manualInsertChains = buildManualInsertChains(projectId, manualInsertOverrides, taskMap, constructionCalendar)
  const combinedAlternateChains = [...autoAlternateChains, ...highVarianceNearCriticalChains, ...manualInsertChains]
  const edges = buildSnapshotEdges(primaryChain?.taskIds ?? autoTaskIds, analysis.dependencyEdges, manualInsertOverrides)
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

  const criticalPathLearningPublications = await resolveCriticalPathLearningPublications({
    projectId,
    rows,
    projectGenerationFacts,
    autoTaskIds,
    criticalPathInputHash: networkLineage.criticalPathInputHash,
    taskNetworkInputHash: networkLineage.taskNetworkInputHash,
  })
  const learnedCriticalPathWatchTaskIds = unique(
    criticalPathLearningPublications.flatMap((publication) => publication.appliedTaskIds),
  )
  const learningPublicationKeysByTaskId = new Map<string, string[]>()
  for (const publication of criticalPathLearningPublications) {
    for (const taskId of publication.appliedTaskIds) {
      learningPublicationKeysByTaskId.set(
        taskId,
        unique([
          ...(learningPublicationKeysByTaskId.get(taskId) ?? []),
          publication.publicationKey,
        ]),
      )
    }
  }
    // CP14: displayTaskIds 仅包含客观关键路径（CPM 自动计算 + manual_insert），不混入 manual_attention
  const primaryChainIndex = new Map((primaryChain?.taskIds ?? []).map((taskId, index) => [taskId, index]))
  const calculatedAt = new Date().toISOString()
  const durationAsOf = businessDateKey(new Date(calculatedAt), constructionCalendar?.timezone)
  const productionDuration = (value: number | null | undefined) => (
    buildConstructionProductionDayDurationMetric(value, {
      asOf: durationAsOf,
      timezone: constructionCalendar?.timezone,
      calendar: constructionCalendar,
    })
  )
  // Preserve the raw chain objects above for exact lineage hashing; attach display DTOs only afterwards.
  const primaryChainWithDuration = primaryChain
    ? { ...primaryChain, totalDuration: productionDuration(primaryChain.totalDurationDays) }
    : null
  const combinedAlternateChainsWithDuration = combinedAlternateChains.map((chain) => ({
    ...chain,
    totalDuration: productionDuration(chain.totalDurationDays),
  }))

  const taskSnapshotIds = unique([
    ...displayTaskIds,
    ...highVarianceNearCriticalChains.flatMap((chain) => chain.taskIds),
    ...learnedCriticalPathWatchTaskIds,
  ])
  const highVarianceNearCriticalTaskIds = new Set(highVarianceNearCriticalChains.flatMap((chain) => chain.taskIds))
  const autoCriticalTaskIdSet = new Set(autoTaskIds)
  const networkSchedule: CriticalTaskNetworkSchedule[] = analysis.orderedTaskIds
    .map((taskId): CriticalTaskNetworkSchedule | null => {
      const node = analysis.taskMap.get(taskId)
      if (!node) return null
      return {
        taskId,
        earliestStartOffsetDays: Math.max(0, Math.round(analysis.earliestStart.get(taskId) ?? 0)),
        earliestFinishOffsetDays: Math.max(0, Math.round(analysis.earliestFinish.get(taskId) ?? 0)),
        latestStartOffsetDays: Math.max(0, Math.round(analysis.latestStart.get(taskId) ?? 0)),
        latestFinishOffsetDays: Math.max(0, Math.round(analysis.latestFinish.get(taskId) ?? 0)),
        floatDays: Math.max(0, Math.round(analysis.float.get(taskId) ?? 0)),
        float: productionDuration(Math.max(0, Math.round(analysis.float.get(taskId) ?? 0))),
        freeFloatDays: buildFreeFloatDays(taskId, analysis),
        freeFloat: productionDuration(buildFreeFloatDays(taskId, analysis)),
        durationDays: node.duration,
        duration: productionDuration(node.duration),
        isAutoCritical: autoCriticalTaskIdSet.has(taskId),
      }
    })
    .filter((task): task is CriticalTaskNetworkSchedule => task !== null)
  const networkScheduleByTaskId = new Map(networkSchedule.map((task) => [task.taskId, task]))
  const tasks = taskSnapshotIds
    .map((taskId): CriticalTaskSnapshot | null => {
      const row = taskMap.get(taskId)
      const node = analysis.taskMap.get(taskId)
      if (!row) return null
      const chainIndex = primaryChainIndex.get(taskId)
      const schedule = networkScheduleByTaskId.get(taskId)
      const durationLearningPublicationKeys = learningPublicationKeysByTaskId.get(taskId) ?? []
      const standardWorkCodes = readCriticalPathTaskStableCodes(row)
      const floatDays = analysis.float.get(taskId) ?? 0
      const durationDays = node?.duration ?? getTaskDurationDays(row, constructionCalendar)
      const freeFloatDays = schedule?.freeFloatDays
      return {
        taskId,
        title: row.title || taskId,
        ...(standardWorkCodes.length > 0 ? { standardWorkCodes } : {}),
        floatDays,
        float: productionDuration(floatDays),
        durationDays,
        duration: productionDuration(durationDays),
        freeFloat: productionDuration(freeFloatDays),
        ...(schedule ? {
          earliestStartOffsetDays: schedule.earliestStartOffsetDays,
          earliestFinishOffsetDays: schedule.earliestFinishOffsetDays,
          latestStartOffsetDays: schedule.latestStartOffsetDays,
          latestFinishOffsetDays: schedule.latestFinishOffsetDays,
          freeFloatDays: schedule.freeFloatDays,
        } : {}),
        ...(node?.p50DurationDays ? { p50DurationDays: node.p50DurationDays } : {}),
        ...(node?.p80DurationDays ? { p80DurationDays: node.p80DurationDays } : {}),
        ...(node?.standardDeviationDays ? { standardDeviationDays: node.standardDeviationDays } : {}),
        ...(node?.confidenceBandWidthDays ? { confidenceBandWidthDays: node.confidenceBandWidthDays } : {}),
        ...(highVarianceNearCriticalTaskIds.has(taskId) ? { isHighVarianceNearCritical: true } : {}),
        ...(durationLearningPublicationKeys.length > 0 ? {
          isLearnedCriticalPathWatch: true,
          durationLearningPublicationKeys,
        } : {}),
        isAutoCritical: autoTaskIds.includes(taskId),
        isManualAttention: manualAttentionTaskIds.includes(taskId),
        isManualInserted: manualInsertedTaskIds.includes(taskId),
        ...(chainIndex !== undefined ? { chainIndex } : {}),
      } satisfies CriticalTaskSnapshot
    })
    .filter((task): task is CriticalTaskSnapshot => task !== null)

  const projectDurationDays = Math.max(
    analysis.projectDuration,
    primaryChain?.totalDurationDays ?? 0,
    ...combinedAlternateChains.map((chain) => chain.totalDurationDays),
  )
  let durationInputAssembly: Record<string, unknown> | null = null
  try {
    durationInputAssembly = await buildCriticalPathDurationInputAssembly({
      projectId,
      projectGenerationFacts,
      networkLineage,
      primaryChain,
      autoTaskIds,
      projectDurationDays,
      edgeCount: edges.length,
    })
  } catch (error) {
    logger.warn('[projectCriticalPathService] duration input assembly unavailable for E3 CPM snapshot', { projectId, error })
  }
  const snapshot: CriticalPathSnapshot = {
    projectId,
    autoTaskIds,
    manualAttentionTaskIds,
    manualInsertedTaskIds,
    primaryChain: primaryChainWithDuration,
    alternateChains: combinedAlternateChainsWithDuration,
    displayTaskIds,
    watchedTaskIds: unique([...manualAttentionTaskIds, ...learnedCriticalPathWatchTaskIds]),
    ...(criticalPathLearningPublications.length > 0 ? { criticalPathLearningPublications } : {}),
    edges,
    tasks,
    networkSchedule,
    projectDurationDays,
    projectDuration: productionDuration(projectDurationDays),
    calculatedAt,
    lastSuccessfulCalculatedAt: calculatedAt,
    calculationStatus: 'fresh',
    hasCycleDetected,
    cycleTaskIds: cycleTaskIds.length > 0 ? cycleTaskIds : undefined,
    networkLineage,
    networkMaturity,
    ...(durationInputAssembly ? { durationInputAssembly } : {}),
    ...(t2RhythmScheduleCandidateNetworkEvidence ? { t2RhythmScheduleCandidateNetworkEvidence } : {}),
    ...(durationPlausibilityWarnings.length > 0 ? { durationPlausibilityWarnings } : {}),
  }

  if (calculatedSuccessfully) {
    rememberCriticalPathSnapshot(projectId, snapshot)
  }
  return {
    snapshot,
    constructionCalendar,
    dependencyRows,
    constructionOrganizationLineage,
  }
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

async function runWithCriticalPathProjectLease<T>(
  projectId: string,
  runner: () => Promise<T>,
): Promise<T> {
  const client = await getClient()
  let acquired = false

  try {
    await client.query(
      `SELECT pg_advisory_lock(hashtext($1), hashtext($2))`,
      [CRITICAL_PATH_PROJECT_LOCK_NAMESPACE, projectId],
    )
    acquired = true
    return await runner()
  } finally {
    if (acquired) {
      try {
        await client.query(
          `SELECT pg_advisory_unlock(hashtext($1), hashtext($2)) AS released`,
          [CRITICAL_PATH_PROJECT_LOCK_NAMESPACE, projectId],
        )
      } catch (error) {
        logger.error('[projectCriticalPathService] failed to release project CPM advisory lock', {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    client.release()
  }
}

export async function recalculateProjectCriticalPath(projectId: string): Promise<ProjectCriticalPathResult> {
  const existing = criticalPathRecalculationByProject.get(projectId)
  if (existing) return await existing

  const recalculation = runWithCriticalPathProjectLease(projectId, () => recalculateProjectCriticalPathInternal(projectId))
  criticalPathRecalculationByProject.set(projectId, recalculation)

  try {
    return await recalculation
  } finally {
    if (criticalPathRecalculationByProject.get(projectId) === recalculation) {
      criticalPathRecalculationByProject.delete(projectId)
    }
  }
}

async function recalculateProjectCriticalPathInternal(projectId: string): Promise<ProjectCriticalPathResult> {
  const rows = await loadCriticalPathTaskRows(projectId)
  const overrides = await loadCriticalPathOverrideRows(projectId)
  const tasks = rows
  const {
    snapshot,
    constructionCalendar,
    constructionOrganizationLineage,
  } = await buildProjectCriticalPathSnapshotWithContext(projectId, rows, overrides)
  const failureMessage = snapshot.calculationFailureMessage ?? null
  try {
    await syncCriticalPathFailureNotification(projectId, failureMessage)
  } catch (notificationError) {
    logger.warn('[projectCriticalPathService] failed to persist CPM failure notification', {
      projectId,
      error: notificationError instanceof Error ? notificationError.message : String(notificationError),
    })
  }
  await persistCriticalPathTaskProjectionFromSnapshot(projectId, rows, snapshot, constructionCalendar)
  const calculatedDate = normalizeDate(snapshot.calculatedAt) ?? new Date().toISOString().slice(0, 10)
  const cpmDedupeKey = `${projectId}:${calculatedDate}:critical_path_cpm`
  const predictionNetworkLineage: Record<string, unknown> | undefined = snapshot.networkLineage
    ? mergeConstructionOrganizationLineageIntoContext(
        toPredictionContextRecord(snapshot.networkLineage),
        constructionOrganizationLineage,
      )
    : constructionOrganizationLineage
      ? mergeConstructionOrganizationLineageIntoContext({}, constructionOrganizationLineage)
      : undefined
  const productionDurationAvailable = snapshot.projectDuration.availability === 'available'
    && snapshot.projectDuration.unit === 'construction_production_day'
    && snapshot.projectDuration.value !== null
  if (productionDurationAvailable) {
    await recordDurationAccuracyPrediction({
      engineCode: 'critical_path_cpm',
      outputKind: 'critical_path_project_duration',
      projectId,
      dedupeKey: cpmDedupeKey,
      predictionBasis: 'critical_path_runtime_snapshot',
      modelVersion: 'critical_path_cpm_v1',
      predictedStartDate: earliestDate(rows.map((row) => row.start_date ?? row.planned_start_date)),
      predictedFinishDate: latestDate(rows.map((row) => row.end_date ?? row.planned_end_date)),
      predictedDurationDays: snapshot.projectDuration.value,
      predictedAt: snapshot.calculatedAt ?? null,
      predictionContext: mergeConstructionOrganizationLineageIntoContext({
        taskCount: tasks.length,
        eligibleTaskCount: snapshot.networkSchedule?.length ?? 0,
        durationDayUnit: snapshot.projectDuration.unit,
        durationMetric: snapshot.projectDuration,
        constructionCalendar,
        autoTaskIds: snapshot.autoTaskIds,
        manualAttentionTaskIds: snapshot.manualAttentionTaskIds,
        manualInsertedTaskIds: snapshot.manualInsertedTaskIds,
        primaryChain: snapshot.primaryChain,
        alternateChainCount: snapshot.alternateChains.length,
        edgeCount: snapshot.edges.length,
        calculationStatus: snapshot.calculationStatus,
        networkLineage: predictionNetworkLineage ?? null,
        runtimePublicationKeys: unique(
          (snapshot.criticalPathLearningPublications ?? []).map((publication) => publication.publicationKey),
        ),
        criticalPathLearningPublications: snapshot.criticalPathLearningPublications ?? [],
        durationInputAssembly: snapshot.durationInputAssembly ?? null,
        t2RhythmScheduleCandidateNetworkEvidence: snapshot.t2RhythmScheduleCandidateNetworkEvidence ?? null,
      }, constructionOrganizationLineage),
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
        actualContext: mergeConstructionOrganizationLineageIntoContext({
          source: 'completed_project_task_span',
          durationBasis: 'project_actual_span',
          durationMetric: snapshot.projectDuration,
          skippedCurrentDedupeKey: cpmDedupeKey,
          taskCount: tasks.length,
        }, constructionOrganizationLineage),
      })
      await recordCriticalPathRulePlanNetworkOutcome({
        projectId,
        snapshot,
        actualSpan,
        constructionCalendar,
      })
    }
  }

  logger.info('[projectCriticalPathService] recalculated project critical path snapshot', {
    projectId,
    taskCount: tasks.length,
    eligibleTaskCount: snapshot.networkSchedule?.length ?? 0,
    criticalTaskCount: snapshot.autoTaskIds.length,
    projectDuration: snapshot.projectDurationDays,
  })

  return {
    projectId,
    taskCount: tasks.length,
    eligibleTaskCount: snapshot.networkSchedule?.length ?? 0,
    criticalTaskIds: snapshot.autoTaskIds,
    projectDuration: snapshot.projectDurationDays,
    snapshot,
  }
}

export async function refreshActiveProjectCriticalPathSnapshots(projectIds?: string[] | null): Promise<CriticalPathRefreshSweepResult> {
  const activeProjectIds = await listActiveProjectIds(projectIds)
  const result: CriticalPathRefreshSweepResult = {
    scannedProjects: activeProjectIds.length,
    refreshedProjects: 0,
    failedProjects: 0,
    skippedProjects: 0,
    failures: [],
  }

  for (const projectId of activeProjectIds) {
    try {
      const refreshed = await recalculateProjectCriticalPath(projectId)
      if (refreshed.snapshot.calculationStatus === 'fresh') {
        result.refreshedProjects += 1
      } else {
        result.skippedProjects += 1
      }
    } catch (error) {
      result.failedProjects += 1
      result.failures.push({
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}
