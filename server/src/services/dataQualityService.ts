import { v4 as uuidv4 } from 'uuid'
import { isCriticalPathTask, getCriticalPathTaskIds } from './criticalPathHelpers.js'
import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { buildProjectQualitySummary } from './dataQualityGovernanceService.js'
import type {
  DataConfidenceSnapshot,
  DataQualityFinding,
  Notification,
  ProjectDataQualitySettings,
  Task,
  TaskCondition,
  TaskProgressSnapshot,
} from '../types/db.js'
import { logger } from '../middleware/logger.js'
import { listActiveProjectIds } from './activeProjectService.js'
import { executeSQL, listTaskProgressSnapshotsByTaskIds, supabase } from './dbService.js'
import { query as rawQuery, withDatabaseTransaction } from '../database.js'
import { detectProgressQualitySignals, type ProgressQualityCode } from './progressAnomalyService.js'
import { normalizeStatus } from './statusDictionaryService.js'
import {
  getDataQualityRecommendation,
  getDataQualityRuleDimension,
  isDataQualityOwnerDigestEligible,
  listDataQualityRuleCodes,
} from './dataQualityRuleRegistry.js'
import {
  listNotifications,
  updateNotificationById,
} from './notificationStore.js'
import { notificationTouchpointService } from './notificationTouchpointService.js'
import { isCompletedTask, isInProgressTask } from '../utils/taskStatus.js'
import { hasStableResponsibleUnit } from '../utils/responsibilitySubject.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'
import { ScopedBatchOperationError } from './scopedBatchRunner.js'

const DATA_CONFIDENCE_LOW_THRESHOLD = 70
const DATA_CONFIDENCE_MEDIUM_THRESHOLD = 85

const DATA_QUALITY_WEIGHT_KEYS = ['timeliness', 'anomaly', 'consistency', 'jumpiness', 'coverage'] as const
const DATA_QUALITY_SETTINGS_CACHE_TTL_MS = 30_000
const dataQualitySettingsCache = new Map<string, { expiresAt: number; summary: DataQualityProjectSettingsSummary }>()

const DATA_QUALITY_TASK_FIELDS = [
  'id',
  'project_id',
  'title',
  'status',
  'start_date',
  'end_date',
  'planned_start_date',
  'planned_end_date',
  'actual_start_date',
  'actual_end_date',
  'progress',
  'assignee',
  'assignee_name',
  'parent_id',
  'is_milestone',
  'is_wbs_summary',
  'is_executable',
  'is_leaf',
  'wbs_code',
  'wbs_level',
  'wbs_node_type',
  'engineering_object_id',
  'phase_object_id',
  'section_object_id',
  'building_object_id',
  'basement_object_id',
  'floor_object_id',
  'physical_zone_object_id',
  'functional_area_object_id',
  'participant_unit_id',
  'engineering_category_id',
  'baseline_item_id',
  'monthly_plan_item_id',
  'template_id',
  'template_node_id',
  'first_progress_at',
  'created_at',
  'updated_at',
] as const

const DATA_QUALITY_TASK_SELECT = [
  ...DATA_QUALITY_TASK_FIELDS.map((field) => `task.${field}`),
  'participant_unit.unit_name AS participant_unit_name',
].join(', ')

const DATA_QUALITY_TASK_FALLBACK_SELECT = DATA_QUALITY_TASK_FIELDS
  .map((field) => `task.${field}`)
  .join(', ')

export type DataQualityWeightKey = (typeof DATA_QUALITY_WEIGHT_KEYS)[number]

export type DataQualityWeights = Record<DataQualityWeightKey, number>

const DEFAULT_WEIGHTS: DataQualityWeights = {
  timeliness: 0.3,
  anomaly: 0.25,
  consistency: 0.2,
  jumpiness: 0.1,
  coverage: 0.15,
}

const DATA_QUALITY_DIMENSION_LABELS: Record<DataQualityWeightKey, string> = {
  timeliness: '填报及时性',
  anomaly: '异常检测命中率',
  consistency: '交叉一致性',
  jumpiness: '进度跳变率',
  coverage: '更新覆盖率',
}

type FindingSeverity = 'info' | 'warning' | 'critical'
type TaskDependencySignal = {
  dependencyTaskId: string
  sourceType: string | null
}
const STRONG_DEPENDENCY_SOURCES = new Set(['manual', 'current_task_fact', 'explicit', 'user', 'user_manual'])

function normalizeDependencySourceType(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function isStrongDependencySource(sourceType: unknown) {
  return STRONG_DEPENDENCY_SOURCES.has(normalizeDependencySourceType(sourceType))
}

export async function loadTaskDependencySignals(projectId: string, tasks: Task[]): Promise<Map<string, TaskDependencySignal[]>> {
  const dependencySignalsByTaskId = new Map<string, TaskDependencySignal[]>()
  const allIds = tasks.map((task) => task.id).filter(Boolean)
  if (allIds.length === 0) return dependencySignalsByTaskId

  try {
    const result = await rawQuery(
      `SELECT task_id, dependency_task_id, source_type, required_for_start, status
         FROM public.task_dependencies
        WHERE project_id = $1
          AND task_id = ANY($2::uuid[])
          AND status = 'active'`,
      [projectId, allIds],
    )

    for (const dependency of result.rows as Array<Record<string, unknown>>) {
      const taskId = String(dependency.task_id ?? '').trim()
      const dependencyTaskId = String(dependency.dependency_task_id ?? '').trim()
      if (!taskId || !dependencyTaskId || dependency.required_for_start === false) continue
      const arr = dependencySignalsByTaskId.get(taskId) ?? []
      arr.push({
        dependencyTaskId,
        sourceType: String(dependency.source_type ?? '').trim() || null,
      })
      dependencySignalsByTaskId.set(taskId, arr)
    }
  } catch (error) {
    logger.warn('[dataQualityService] failed to load task dependency signals', { projectId, error })
  }

  return dependencySignalsByTaskId
}

type FindingRuleType =
  | 'trend'
  | 'anomaly'
  | 'cross_check'
  | 'completeness'
  | 'wbs_classification'
  | 'status_normalization'
  | 'lineage'
  | 'cross_consistency'
  | 'staleness'
  | 'retention'
  | 'metric_caliber'
type ConfidenceFlag = 'high' | 'medium' | 'low'

type FindingRuleCode =
  | 'TREND_DELAY'
  | 'SNAPSHOT_GAP'
  | 'PROGRESS_JUMP'
  | 'PROGRESS_MONTH_END_BURST'
  | 'PROGRESS_STUCK_FINISHING'
  | 'PROGRESS_SOURCE_LOW_CONFIDENCE'
  | 'PROGRESS_ROLLBACK'
  | 'PROGRESS_DUPLICATE_FILL'
  | 'PROGRESS_TIME_MISMATCH'
  | 'BATCH_SAME_VALUE'
  | 'PARENT_CHILD_INCONSISTENT'
  | 'DEPENDENCY_INCONSISTENT'
  | 'MILESTONE_PREDECESSOR_INCONSISTENT'
  | 'CONDITION_UNSATISFIED_STARTED'
  | 'ASSIGNEE_WORKLOAD_ABNORMAL'
  | 'ENGINEERING_OBJECT_MISSING'
  | 'PARTICIPANT_UNIT_MISSING'
  | 'WBS_TYPE_UNCALIBRATED'
  | 'STATUS_NORMALIZATION_NEEDED'
  | 'LINEAGE_INCOMPLETE'
  | 'ACCEPTANCE_LINK_ORPHAN'
  | 'RETENTION_DECISION_EXPIRED'
  | 'RETENTION_CONFIRMATION_FAILED'
  | 'RETENTION_CONFIRMING_STALE'
  | 'METRIC_CALIBER_MISSING'
  | 'METRIC_VALUE_UNAVAILABLE'
  | 'MATERIAL_SPECIALTY_MISSING'
  | 'MATERIAL_UNIT_MISSING'
  | 'MATERIAL_ARRIVAL_OVERDUE'
  | 'MATERIAL_SAMPLE_PENDING'

type DataQualitySourceKey =
  | 'tasks'
  | 'conditions'
  | 'snapshots'
  | 'lineageLinks'
  | 'acceptancePlans'
  | 'materials'
  | 'retentionEvents'
  | 'metricSnapshots'

type DataQualitySourceReadStatus = Record<DataQualitySourceKey, 'ok' | 'failed'>

type DataQualityQuerySourceKey = Exclude<DataQualitySourceKey, 'snapshots'>

export type DataQualityFindingDraft = Omit<DataQualityFinding, 'id' | 'detected_at' | 'resolved_at' | 'status'> & {
  details_json: Record<string, unknown>
}

type ProjectMemberRow = {
  project_id: string
  user_id: string
  permission_level?: string | null
}

type ProjectOwnerRow = {
  id: string
  owner_id?: string | null
}

type ProgressWindow = {
  startAt: number
  endAt: number
}

type DataQualityTaskQueryRow = Record<string, unknown> & {
  participant_unit_id?: string | null
  participant_unit_name?: string | null
}

type ParticipantUnitNameRow = {
  id?: string | null
  unit_name?: string | null
}

type AcceptancePlanFallbackRow = AcceptancePlanQualityRow & {
  linked_task_id?: string | null
}

type AcceptancePlanTaskLinkRow = {
  source_entity_id?: string | null
  target_entity_id?: string | null
}

async function readFallbackTaskRows<T>(projectId: string): Promise<T[]> {
  const rows = await executeSQL<DataQualityTaskQueryRow>(
    `SELECT ${DATA_QUALITY_TASK_FALLBACK_SELECT}
       FROM tasks task
      WHERE task.project_id = ?`,
    [projectId],
  )
  const needsParticipantUnitNames = rows.some((row) => (
    Boolean(row.participant_unit_id) && !row.participant_unit_name
  ))
  if (!needsParticipantUnitNames) return rows as T[]

  const units = await executeSQL<ParticipantUnitNameRow>(
    'SELECT id, unit_name FROM participant_units WHERE project_id = ?',
    [projectId],
  )
  const unitNameById = new Map(
    units
      .filter((row): row is ParticipantUnitNameRow & { id: string } => Boolean(row.id))
      .map((row) => [String(row.id), row.unit_name ?? null]),
  )

  return rows.map((row) => ({
    ...row,
    participant_unit_name: row.participant_unit_name
      ?? unitNameById.get(String(row.participant_unit_id ?? ''))
      ?? null,
  })) as T[]
}

async function readFallbackAcceptancePlanRows<T>(projectId: string): Promise<T[]> {
  const plans = await executeSQL<AcceptancePlanFallbackRow>(
    'SELECT id, project_id, plan_name, acceptance_name, status FROM acceptance_plans WHERE project_id = ?',
    [projectId],
  )
  if (plans.length === 0 || plans.every((plan) => Object.prototype.hasOwnProperty.call(plan, 'linked_task_id'))) {
    return plans as T[]
  }

  const links = await executeSQL<AcceptancePlanTaskLinkRow>(
    "SELECT source_entity_id, target_entity_id FROM project_entity_links WHERE project_id = ? AND source_entity_type = 'acceptance_plan' AND target_entity_type = 'task' AND relation_type = 'covers_task' AND status = 'active'",
    [projectId],
  )
  const taskIdsByPlanId = new Map<string, string[]>()
  for (const link of links) {
    const planId = String(link.source_entity_id ?? '').trim()
    const taskId = String(link.target_entity_id ?? '').trim()
    if (!planId || !taskId) continue
    taskIdsByPlanId.set(planId, [...(taskIdsByPlanId.get(planId) ?? []), taskId])
  }

  return plans.flatMap((plan) => {
    const taskIds = taskIdsByPlanId.get(String(plan.id)) ?? []
    if (taskIds.length === 0) return [{ ...plan, linked_task_id: null }]
    return taskIds.map((taskId) => ({ ...plan, linked_task_id: taskId }))
  }) as T[]
}

async function readDataQualityRows<T>(sourceKey: DataQualityQuerySourceKey, projectId: string): Promise<T[]> {
  if (process.env.NODE_ENV === 'test') {
    switch (sourceKey) {
      case 'tasks':
        return readFallbackTaskRows<T>(projectId)
      case 'conditions':
        return executeSQL<T>('SELECT * FROM task_conditions WHERE project_id = ?', [projectId])
      case 'lineageLinks':
        return executeSQL<T>(
          "SELECT source_entity_type, source_entity_id, relation_type, target_entity_type, target_entity_id, mapping_status FROM data_lineage_links WHERE project_id = ? AND target_entity_type = 'task'",
          [projectId],
        )
      case 'acceptancePlans':
        return readFallbackAcceptancePlanRows<T>(projectId)
      case 'materials':
        return executeSQL<T>(
          'SELECT id, project_id, material_name, participant_unit_id, requires_sample_confirmation, sample_confirmed, expected_arrival_date, actual_arrival_date, record_status, lifecycle_status, specialty_type FROM project_materials WHERE project_id = ?',
          [projectId],
        )
      case 'retentionEvents':
        return executeSQL<T>(
          'SELECT id, project_id, entity_type, entity_id, entity_name_snapshot, requested_action, resolved_action, execution_status, requires_user_confirmation, decision_token_hash, expires_at, confirmed_at, confirmation_metadata FROM deletion_retention_events WHERE project_id = ?',
          [projectId],
        )
      case 'metricSnapshots':
        return executeSQL<T>(
          'SELECT id, project_id, snapshot_date, metric_availability, metric_registry_version, metric_snapshot_version FROM project_daily_snapshot WHERE project_id = ? ORDER BY snapshot_date DESC LIMIT 1',
          [projectId],
        )
    }
  }

  let result: Awaited<ReturnType<typeof rawQuery>>
  switch (sourceKey) {
    case 'tasks':
      result = await rawQuery(
        `SELECT ${DATA_QUALITY_TASK_SELECT}
           FROM public.tasks task
           LEFT JOIN public.participant_units participant_unit ON participant_unit.id = task.participant_unit_id
          WHERE task.project_id = $1`,
        [projectId],
      )
      break
    case 'conditions':
      result = await rawQuery('SELECT * FROM public.task_conditions WHERE project_id = $1', [projectId])
      break
    case 'lineageLinks':
      result = await rawQuery(
        "SELECT source_entity_type, source_entity_id, relation_type, target_entity_type, target_entity_id, mapping_status FROM public.data_lineage_links WHERE project_id = $1 AND target_entity_type = 'task'",
        [projectId],
      )
      break
    case 'acceptancePlans':
      result = await rawQuery(
        `SELECT ap.id, ap.project_id, ap.plan_name, ap.acceptance_name, ap.status,
                pel.target_entity_id AS linked_task_id
           FROM public.acceptance_plans ap
           LEFT JOIN public.project_entity_links pel
             ON pel.project_id = ap.project_id
            AND pel.source_entity_type = 'acceptance_plan'
            AND pel.source_entity_id = ap.id::text
            AND pel.target_entity_type = 'task'
            AND pel.relation_type = 'covers_task'
            AND pel.status = 'active'
          WHERE ap.project_id = $1`,
        [projectId],
      )
      break
    case 'materials':
      result = await rawQuery(
        'SELECT id, project_id, material_name, participant_unit_id, requires_sample_confirmation, sample_confirmed, expected_arrival_date, actual_arrival_date, record_status, lifecycle_status, specialty_type FROM public.project_materials WHERE project_id = $1',
        [projectId],
      )
      break
    case 'retentionEvents':
      result = await rawQuery(
        'SELECT id, project_id, entity_type, entity_id, entity_name_snapshot, requested_action, resolved_action, execution_status, requires_user_confirmation, decision_token_hash, expires_at, confirmed_at, confirmation_metadata FROM public.deletion_retention_events WHERE project_id = $1',
        [projectId],
      )
      break
    case 'metricSnapshots':
      result = await rawQuery(
        'SELECT id, project_id, snapshot_date, metric_availability, metric_registry_version, metric_snapshot_version FROM public.project_daily_snapshot WHERE project_id = $1 ORDER BY snapshot_date DESC LIMIT 1',
        [projectId],
      )
      break
  }

  return result.rows as T[]
}

async function listDataQualitySnapshots(taskIds: string[]) {
  const normalizedTaskIds = [...new Set(
    taskIds.map((taskId) => String(taskId ?? '').trim()).filter(Boolean),
  )]
  if (normalizedTaskIds.length === 0) return []
  if (process.env.NODE_ENV === 'test') {
    return listTaskProgressSnapshotsByTaskIds(normalizedTaskIds)
  }

  try {
    const result = await rawQuery(
      'SELECT * FROM public.task_progress_snapshots WHERE task_id = ANY($1::uuid[])',
      [normalizedTaskIds],
    )
    return result.rows as TaskProgressSnapshot[]
  } catch (error) {
    logger.warn('[dataQualityService] direct snapshot read failed, falling back to dbService', {
      taskCount: normalizedTaskIds.length,
      error: error instanceof Error ? error.message : String(error),
    })
    return listTaskProgressSnapshotsByTaskIds(normalizedTaskIds)
  }
}

type DataLineageLinkRow = {
  source_entity_type?: string | null
  source_entity_id?: string | null
  relation_type?: string | null
  target_entity_type?: string | null
  target_entity_id?: string | null
  mapping_status?: string | null
}

type AcceptancePlanQualityRow = {
  id: string
  project_id: string
  linked_task_id?: string | null
  plan_name?: string | null
  acceptance_name?: string | null
  status?: string | null
}

type ProjectMaterialQualityRow = {
  id: string
  project_id: string
  material_name?: string | null
  participant_unit_id?: string | null
  requires_sample_confirmation?: boolean | null
  sample_confirmed?: boolean | null
  expected_arrival_date?: string | null
  actual_arrival_date?: string | null
  record_status?: string | null
  lifecycle_status?: string | null
  specialty_type?: string | null
}

type RetentionDecisionQualityRow = {
  id: string
  project_id?: string | null
  entity_type?: string | null
  entity_id?: string | null
  entity_name_snapshot?: string | null
  requested_action?: string | null
  resolved_action?: string | null
  execution_status?: string | null
  requires_user_confirmation?: boolean | null
  decision_token_hash?: string | null
  expires_at?: string | null
  confirmed_at?: string | null
  confirmation_metadata?: Record<string, unknown> | string | null
}

type ProjectDailySnapshotQualityRow = {
  id?: string | null
  project_id: string
  snapshot_date?: string | null
  metric_availability?: Record<string, unknown> | null
  metric_registry_version?: string | null
  metric_snapshot_version?: number | string | null
}

type DataQualityConfidence = {
  score: number
  flag: ConfidenceFlag
  note: string
  timelinessScore: number
  anomalyScore: number
  consistencyScore: number
  coverageScore: number
  jumpinessScore: number
  activeFindingCount: number
  trendWarningCount: number
  anomalyFindingCount: number
  crossCheckFindingCount: number
  weights: typeof DEFAULT_WEIGHTS
  dimensions: DataQualityConfidenceDimension[]
}

export interface DataQualityConfidenceDimension {
  key: string
  label: string
  score: number
  weight: number
  maxContribution: number
  actualContribution: number
  lossContribution: number
  lossShare: number
}

export interface DataQualityPromptItem {
  id: string
  taskId?: string | null
  taskTitle: string
  ruleCode: FindingRuleCode
  severity: FindingSeverity
  summary: string
  recommendation: string
}

export interface DataQualityOwnerDigest {
  shouldNotify: boolean
  severity: FindingSeverity
  scopeLabel: string | null
  findingCount: number
  summary: string
}

export interface DataQualityProjectSettingsSummary {
  projectId: string
  weights: DataQualityWeights
  updatedAt: string | null
  updatedBy: string | null
  isDefault: boolean
}

export interface DataQualityProjectSummary {
  projectId: string
  month: string
  confidence: DataQualityConfidence
  prompt: {
    count: number
    summary: string
    items: DataQualityPromptItem[]
  }
  ownerDigest: DataQualityOwnerDigest
  findings: DataQualityFinding[]
  // v1.4.16: extended dimensions
  extendedDimensions?: Array<{ dimension: string; score: number; findingCount: number; activeCount: number }>
  extendedConfidenceScore?: number
  extendedRules?: string[]
}

export interface DataQualityLiveCheckSummary {
  count: number
  summary: string
  items: DataQualityPromptItem[]
}

function nowIso() {
  return new Date().toISOString()
}

type DataQualityQueryExec = typeof rawQuery
type DataQualityTransactionRunner = <T>(work: () => Promise<T>) => Promise<T>

export async function persistDataQualityFindingsDirect(options: {
  projectId: string
  nextFindings: DataQualityFindingDraft[]
  unresolvedRuleCodes?: Set<FindingRuleCode>
  queryExec?: DataQualityQueryExec
  transactionRunner?: DataQualityTransactionRunner
}) {
  const queryExec = options.queryExec ?? rawQuery
  const transactionRunner = options.transactionRunner ?? withDatabaseTransaction

  return transactionRunner(async () => {
    const existingResult = await queryExec(
      'SELECT * FROM public.data_quality_findings WHERE project_id = $1',
      [options.projectId],
    )
    const existing = existingResult.rows as DataQualityFinding[]
    const existingByKey = new Map(existing.map((finding) => [finding.finding_key, finding]))
    const detectedAt = nowIso()
    const activeKeys = new Set(options.nextFindings.map((finding) => finding.finding_key))
    const upsertPayload = options.nextFindings.map((finding) => {
      const current = existingByKey.get(finding.finding_key)
      return {
        id: current?.id ?? uuidv4(),
        finding_key: finding.finding_key,
        project_id: finding.project_id,
        task_id: finding.task_id ?? null,
        rule_code: finding.rule_code,
        rule_type: finding.rule_type,
        severity: finding.severity,
        dimension_key: finding.dimension_key ?? null,
        summary: finding.summary,
        details_json: finding.details_json,
        detected_at: current?.detected_at ?? detectedAt,
        entity_type: finding.entity_type ?? 'task',
        entity_id: finding.entity_id ?? (finding.task_id ?? null),
        quality_dimension: finding.quality_dimension ?? getDataQualityRuleDimension(finding.rule_code),
        source_type: finding.source_type ?? null,
      }
    })

    if (upsertPayload.length > 0) {
      await queryExec(
        `INSERT INTO public.data_quality_findings (
           id, finding_key, project_id, task_id, rule_code, rule_type, severity,
           dimension_key, summary, details_json, detected_at, resolved_at, status,
           entity_type, entity_id, quality_dimension, source_type, resolved_type
         )
         SELECT payload.id::uuid,
                payload.finding_key,
                payload.project_id::uuid,
                NULLIF(payload.task_id, '')::uuid,
                payload.rule_code,
                payload.rule_type,
                payload.severity,
                payload.dimension_key,
                payload.summary,
                payload.details_json,
                payload.detected_at::timestamptz,
                NULL,
                'active',
                payload.entity_type,
                payload.entity_id,
                payload.quality_dimension,
                payload.source_type,
                NULL
           FROM jsonb_to_recordset($1::jsonb) AS payload(
             id text,
             finding_key text,
             project_id text,
             task_id text,
             rule_code text,
             rule_type text,
             severity text,
             dimension_key text,
             summary text,
             details_json jsonb,
             detected_at text,
             entity_type text,
             entity_id text,
             quality_dimension text,
             source_type text
           )
         ON CONFLICT (finding_key) DO UPDATE
           SET project_id = EXCLUDED.project_id,
               task_id = EXCLUDED.task_id,
               rule_code = EXCLUDED.rule_code,
               rule_type = EXCLUDED.rule_type,
               severity = EXCLUDED.severity,
               dimension_key = EXCLUDED.dimension_key,
               summary = EXCLUDED.summary,
               details_json = EXCLUDED.details_json,
               resolved_at = NULL,
               status = 'active',
               entity_type = EXCLUDED.entity_type,
               entity_id = EXCLUDED.entity_id,
               quality_dimension = EXCLUDED.quality_dimension,
               source_type = EXCLUDED.source_type,
               resolved_type = NULL`,
        [JSON.stringify(upsertPayload)],
      )
    }

    const staleIds = existing
      .filter((finding) => finding.status === 'active' && !activeKeys.has(finding.finding_key))
      .filter((finding) => !options.unresolvedRuleCodes?.has(finding.rule_code as FindingRuleCode))
      .map((finding) => finding.id)

    if (staleIds.length > 0) {
      await queryExec(
        `UPDATE public.data_quality_findings
            SET status = 'resolved',
                resolved_at = $3::timestamptz
          WHERE project_id = $1
            AND id = ANY($2::uuid[])`,
        [options.projectId, staleIds, detectedAt],
      )
    }

    const persistedResult = await queryExec(
      `SELECT *
         FROM public.data_quality_findings
        WHERE project_id = $1
        ORDER BY detected_at DESC`,
      [options.projectId],
    )
    return persistedResult.rows as DataQualityFinding[]
  })
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100
}

function roundWeight(value: number) {
  return Math.round(value * 10000) / 10000
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function normalizeWeightValue(value: unknown, fallback: number) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return fallback
  return numeric
}

function normalizeWeights(weights?: Partial<Record<DataQualityWeightKey, unknown>> | null): DataQualityWeights {
  const base = DATA_QUALITY_WEIGHT_KEYS.reduce((accumulator, key) => {
    accumulator[key] = normalizeWeightValue(weights?.[key], DEFAULT_WEIGHTS[key])
    return accumulator
  }, {} as DataQualityWeights)

  const total = DATA_QUALITY_WEIGHT_KEYS.reduce((sum, key) => sum + base[key], 0)
  if (total <= 0) {
    return { ...DEFAULT_WEIGHTS }
  }

  const normalized = {} as DataQualityWeights
  let consumed = 0

  DATA_QUALITY_WEIGHT_KEYS.forEach((key, index) => {
    if (index === DATA_QUALITY_WEIGHT_KEYS.length - 1) {
      normalized[key] = roundWeight(Math.max(0, 1 - consumed))
      return
    }

    const value = roundWeight(base[key] / total)
    normalized[key] = value
    consumed += value
  })

  return normalized
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
}

function normalizeMonth(value?: string | Date | null) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date()
    return `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, '0')}`
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthBounds(month: string) {
  const normalized = /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : `${normalizeMonth(month)}-01`
  const start = new Date(`${normalized}T00:00:00.000Z`)
  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + 1)
  return { start, end }
}

function toTimestamp(value?: string | null) {
  if (!value) return Number.NaN
  return new Date(value).getTime()
}

function normalizeTextValue(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLowerValue(value: unknown) {
  return normalizeTextValue(value).toLowerCase()
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function isPastDate(value?: string | null, referenceAt = Date.now()) {
  const timestamp = toTimestamp(value)
  return Number.isFinite(timestamp) && timestamp < referenceAt
}

function diffDays(startAt: number, endAt: number) {
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) return 0
  return Math.max(0, signedDurationDayDelta(new Date(startAt), new Date(endAt)) ?? 0)
}

function isStartedTask(task: Partial<Task>) {
  const status = String(task.status ?? '').trim().toLowerCase()
  return (
    status === 'in_progress' ||
    status === '进行中' ||
    status === 'active' ||
    Number(task.progress ?? 0) > 0 ||
    Boolean(task.actual_start_date)
  )
}

function resolveTaskStart(task: Partial<Task>) {
  return task.planned_start_date ?? task.start_date ?? task.actual_start_date ?? null
}

function resolveTaskEnd(task: Partial<Task>) {
  return task.planned_end_date ?? task.end_date ?? task.actual_end_date ?? null
}

function buildFindingKey(ruleCode: FindingRuleCode, taskId?: string | null, dimensionKey?: string | null) {
  return [ruleCode, taskId ?? 'project', dimensionKey ?? 'none'].join(':')
}

function severityRank(value: FindingSeverity) {
  switch (value) {
    case 'critical':
      return 3
    case 'warning':
      return 2
    default:
      return 1
  }
}

function getConfidenceFlag(score: number): ConfidenceFlag {
  if (score < DATA_CONFIDENCE_LOW_THRESHOLD) return 'low'
  if (score < DATA_CONFIDENCE_MEDIUM_THRESHOLD) return 'medium'
  return 'high'
}

function getConfidenceNote(score: number) {
  if (score < DATA_CONFIDENCE_LOW_THRESHOLD) {
    return '数据置信度低，仅供参考'
  }
  if (score < DATA_CONFIDENCE_MEDIUM_THRESHOLD) {
    return 'ڲֳ'
  }
  return '当前数据质量稳定，可作为分析依据'
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

function getLatestSnapshotMap(snapshots: TaskProgressSnapshot[]) {
  const map = new Map<string, TaskProgressSnapshot>()
  for (const snapshot of snapshots) {
    const taskId = String(snapshot.task_id ?? '').trim()
    if (!taskId) continue
    const candidateAt = toTimestamp(snapshot.snapshot_date ?? snapshot.created_at)
    const existingAt = toTimestamp(map.get(taskId)?.snapshot_date ?? map.get(taskId)?.created_at ?? null)
    if (!map.has(taskId) || candidateAt >= existingAt) {
      map.set(taskId, snapshot)
    }
  }
  return map
}

function getSnapshotsByTask(snapshots: TaskProgressSnapshot[]) {
  const map = new Map<string, TaskProgressSnapshot[]>()
  for (const snapshot of snapshots) {
    const taskId = String(snapshot.task_id ?? '').trim()
    if (!taskId) continue
    const list = map.get(taskId) ?? []
    list.push(snapshot)
    map.set(taskId, list)
  }

  for (const [taskId, list] of map.entries()) {
    list.sort((left, right) => toTimestamp(right.snapshot_date ?? right.created_at) - toTimestamp(left.snapshot_date ?? left.created_at))
    map.set(taskId, list)
  }

  return map
}

function getOverlapCount(target: ProgressWindow, windows: ProgressWindow[]) {
  return windows.filter((window) => target.startAt <= window.endAt && window.startAt <= target.endAt).length
}

function toFindingRow(finding: DataQualityFindingDraft, detectedAt: string, status: DataQualityFinding['status'] = 'active'): DataQualityFinding {
  const ruleCode = String(finding.rule_code ?? '')
  return {
    id: '',
    finding_key: finding.finding_key,
    project_id: finding.project_id,
    task_id: finding.task_id ?? null,
    rule_code: finding.rule_code,
    rule_type: finding.rule_type,
    severity: finding.severity,
    dimension_key: finding.dimension_key ?? null,
    summary: finding.summary,
    details_json: finding.details_json,
    detected_at: detectedAt,
    resolved_at: null,
    status,
    entity_type: finding.entity_type ?? 'task',
    entity_id: finding.entity_id ?? (finding.task_id ?? null),
    quality_dimension: finding.quality_dimension ?? getDataQualityRuleDimension(ruleCode),
    confidence_impact: finding.confidence_impact ?? null,
    source_type: finding.source_type ?? null,
    resolved_type: finding.resolved_type ?? null,
  }
}

function buildRecommendation(ruleCode: FindingRuleCode) {
  return getDataQualityRecommendation(ruleCode)
}

function buildPrompt(findings: DataQualityFinding[], taskTitleById: Map<string, string>): DataQualityProjectSummary['prompt'] {
  const promptItems = findings
    .filter((finding) => finding.status === 'active' && finding.rule_type !== 'trend' && finding.task_id)
    .sort((left, right) => {
      const severityDiff = severityRank(right.severity) - severityRank(left.severity)
      if (severityDiff !== 0) return severityDiff
      return String(right.detected_at).localeCompare(String(left.detected_at))
    })
    .slice(0, 6)
    .map((finding) => ({
      id: finding.id || finding.finding_key,
      taskId: finding.task_id ?? null,
      taskTitle: taskTitleById.get(String(finding.task_id ?? '')) ?? '未命名任务',
      ruleCode: finding.rule_code as FindingRuleCode,
      severity: finding.severity,
      summary: finding.summary,
      recommendation: buildRecommendation(finding.rule_code as FindingRuleCode),
    }))

  const count = findings.filter((finding) => finding.status === 'active' && finding.rule_type !== 'trend' && finding.task_id).length
  return {
    count,
    summary: count > 0 ? `当前有 ${count} 条任务存在数据矛盾需要确认。` : '当前没有需要确认的数据矛盾。',
    items: promptItems,
  }
}

function buildTrendWarningsFromFindings(findings: DataQualityFinding[]): Notification[] {
  return findings
    .filter((finding) => finding.rule_type === 'trend' && finding.status === 'active')
    .map((finding) => ({
      id: '',
      project_id: finding.project_id,
      task_id: finding.task_id ?? null,
      type: 'progress_trend_delay',
      title: '任务出现进度滞后趋势',
      content: finding.summary,
      is_read: false,
      source_entity_type: 'data_quality_trend',
      source_entity_id: finding.task_id ?? finding.finding_key,
      severity: finding.severity,
      level: finding.severity,
      status: 'unread',
      metadata: finding.details_json ?? {},
      created_at: finding.detected_at,
      updated_at: finding.detected_at,
    }))
}

function buildOwnerDigest(findings: DataQualityFinding[]): DataQualityOwnerDigest {
  const activeFindings = findings.filter((finding) => {
    if (finding.status !== 'active') return false
    if (!isDataQualityOwnerDigestEligible(finding.rule_code)) return false
    if (finding.rule_type !== 'trend') return true
    return !Boolean(finding.details_json?.is_critical_task)
  })
  const summaryLabel = activeFindings.some((finding) => finding.rule_type === 'trend')
    ? '数据质量或进度趋势异常'
    : '数据质量异常'
  if (activeFindings.length === 0) {
    return {
      shouldNotify: false,
      severity: 'info',
      scopeLabel: null,
      findingCount: 0,
      summary: '当前没有需要聚合提示的数据质量或进度趋势异常。',
    }
  }

  const clusterMap = new Map<string, { label: string; count: number; severity: FindingSeverity }>()
  for (const finding of activeFindings) {
    const details = finding.details_json ?? {}
    const assigneeName = String(details.assignee_name ?? '').trim()
    const unitName = String(details.participant_unit_name ?? '').trim()
    const scopeKey = assigneeName
      ? `assignee:${assigneeName}`
      : unitName
        ? `unit:${unitName}`
        : String(finding.dimension_key ?? '').trim()

    if (!scopeKey) continue

    const current = clusterMap.get(scopeKey)
    const label = assigneeName || unitName || scopeKey
    if (!current) {
      clusterMap.set(scopeKey, { label, count: 1, severity: finding.severity })
      continue
    }

    current.count += 1
    if (severityRank(finding.severity) > severityRank(current.severity)) {
      current.severity = finding.severity
    }
  }

  const topCluster = [...clusterMap.values()].sort((left, right) => {
    const countDiff = right.count - left.count
    if (countDiff !== 0) return countDiff
    return severityRank(right.severity) - severityRank(left.severity)
  })[0]

  if (!topCluster || topCluster.count < 3) {
    return {
      shouldNotify: false,
      severity: 'info',
      scopeLabel: null,
      findingCount: activeFindings.length,
      summary: `当前 ${activeFindings.length} 项${summaryLabel}需要到业务页面核对。`,
    }
  }

  return {
    shouldNotify: true,
    severity: topCluster.severity,
    scopeLabel: topCluster.label,
    findingCount: topCluster.count,
    summary: `当前${topCluster.label}中有 ${topCluster.count} 项${summaryLabel}，请优先核对该范围。`,
  }
}

function buildConfidenceDimensions(
  scores: Record<DataQualityWeightKey, number>,
  weights: DataQualityWeights,
): DataQualityConfidenceDimension[] {
  const dimensions = DATA_QUALITY_WEIGHT_KEYS.map((key) => {
    const score = roundScore(clamp(scores[key]))
    const weight = roundWeight(weights[key])
    const maxContribution = roundScore(100 * weight)
    const actualContribution = roundScore(score * weight)
    const lossContribution = roundScore(Math.max(0, maxContribution - actualContribution))

    return {
      key,
      label: DATA_QUALITY_DIMENSION_LABELS[key],
      score,
      weight,
      maxContribution,
      actualContribution,
      lossContribution,
      lossShare: 0,
    }
  })

  const totalLoss = dimensions.reduce((sum, dimension) => sum + dimension.lossContribution, 0)
  return dimensions
    .map((dimension) => ({
      ...dimension,
      lossShare: totalLoss > 0 ? roundScore((dimension.lossContribution / totalLoss) * 100) : 0,
    }))
    .sort((left, right) => {
      const lossDiff = right.lossContribution - left.lossContribution
      if (lossDiff !== 0) return lossDiff
      return left.label.localeCompare(right.label, 'zh-CN')
    })
}

function buildTaskPreview(
  projectId: string,
  previewTaskId: string,
  draft: Partial<Task> | null | undefined,
  baseTask?: Task | null,
): Task {
  const nextStatus = String(draft?.status ?? baseTask?.status ?? 'todo').trim() || 'todo'
  const nextProgress = clamp(Number(draft?.progress ?? baseTask?.progress ?? 0))

  return {
    id: previewTaskId,
    project_id: projectId,
    title: String(draft?.title ?? baseTask?.title ?? '当前编辑任务').trim() || '当前编辑任务',
    description: typeof draft?.description === 'string' ? draft.description : baseTask?.description,
    status: nextStatus as Task['status'],
    priority: String(draft?.priority ?? baseTask?.priority ?? 'medium') as Task['priority'],
    start_date: draft?.start_date ?? baseTask?.start_date,
    end_date: draft?.end_date ?? baseTask?.end_date,
    planned_start_date: draft?.planned_start_date ?? draft?.start_date ?? baseTask?.planned_start_date ?? baseTask?.start_date,
    planned_end_date: draft?.planned_end_date ?? draft?.end_date ?? baseTask?.planned_end_date ?? baseTask?.end_date,
    actual_start_date: draft?.actual_start_date ?? baseTask?.actual_start_date,
    actual_end_date: draft?.actual_end_date ?? baseTask?.actual_end_date,
    progress: nextProgress,
    assignee: typeof draft?.assignee === 'string' ? draft.assignee : baseTask?.assignee,
    parent_task_id: draft?.parent_task_id ?? baseTask?.parent_task_id,
    dependencies: [],
    milestone_id: draft?.milestone_id ?? baseTask?.milestone_id,
    wbs_level: draft?.wbs_level ?? baseTask?.wbs_level,
    wbs_code: draft?.wbs_code ?? baseTask?.wbs_code,
    sort_order: draft?.sort_order ?? baseTask?.sort_order,
    is_milestone: typeof draft?.is_milestone === 'boolean' ? draft.is_milestone : baseTask?.is_milestone,
    milestone_level: draft?.milestone_level ?? baseTask?.milestone_level,
    milestone_order: draft?.milestone_order ?? baseTask?.milestone_order,
    task_type: draft?.task_type ?? baseTask?.task_type,
    task_source: draft?.task_source ?? baseTask?.task_source,
    is_critical: false,
    parent_id: draft?.parent_id ?? draft?.parent_task_id ?? baseTask?.parent_id ?? baseTask?.parent_task_id ?? null,
    specialty_type: draft?.specialty_type ?? baseTask?.specialty_type,
    engineering_object_id: draft?.engineering_object_id ?? baseTask?.engineering_object_id ?? null,
    phase_object_id: draft?.phase_object_id ?? baseTask?.phase_object_id ?? null,
    section_object_id: draft?.section_object_id ?? baseTask?.section_object_id ?? null,
    building_object_id: draft?.building_object_id ?? baseTask?.building_object_id ?? null,
    floor_object_id: draft?.floor_object_id ?? baseTask?.floor_object_id ?? null,
    basement_object_id: draft?.basement_object_id ?? baseTask?.basement_object_id ?? null,
    physical_zone_object_id: draft?.physical_zone_object_id ?? baseTask?.physical_zone_object_id ?? null,
    functional_area_object_id: draft?.functional_area_object_id ?? baseTask?.functional_area_object_id ?? null,
    first_progress_at: draft?.first_progress_at ?? baseTask?.first_progress_at,
    delay_reason: draft?.delay_reason ?? baseTask?.delay_reason,
    assignee_user_id: draft?.assignee_user_id ?? baseTask?.assignee_user_id ?? null,
    assignee_name: typeof draft?.assignee_name === 'string'
      ? draft.assignee_name
      : typeof draft?.assignee === 'string'
        ? draft.assignee
        : baseTask?.assignee_name ?? baseTask?.assignee,
    baseline_item_id: draft?.baseline_item_id ?? baseTask?.baseline_item_id,
    monthly_plan_item_id: draft?.monthly_plan_item_id ?? baseTask?.monthly_plan_item_id,
    participant_unit_id: draft?.participant_unit_id ?? baseTask?.participant_unit_id,
    participant_unit_name: typeof draft?.participant_unit_name === 'string'
      ? draft.participant_unit_name
      : baseTask?.participant_unit_name,
    created_at: baseTask?.created_at ?? nowIso(),
    updated_at: nowIso(),
    updated_by: baseTask?.updated_by,
    version: baseTask?.version ?? 1,
  }
}

function findingRelatesToTask(finding: Pick<DataQualityFinding, 'task_id' | 'details_json'>, taskId: string) {
  if (String(finding.task_id ?? '').trim() === taskId) {
    return true
  }

  const details = (finding.details_json ?? {}) as Record<string, unknown>
  const relatedIds = [
    String(details.task_id ?? '').trim(),
    String(details.parent_task_id ?? '').trim(),
    String(details.milestone_id ?? '').trim(),
    ...toStringArray(details.task_ids),
    ...toStringArray(details.child_task_ids),
    ...toStringArray(details.dependency_task_ids),
    ...toStringArray(details.predecessor_task_ids),
  ].filter(Boolean)

  return relatedIds.includes(taskId)
}

function toProjectSettingsSummary(
  projectId: string,
  row?: Pick<ProjectDataQualitySettings, 'project_id' | 'weights_json' | 'updated_at' | 'updated_by'> | null,
): DataQualityProjectSettingsSummary {
  return {
    projectId,
    weights: normalizeWeights(row?.weights_json ?? null),
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
    isDefault: !row,
  }
}

function buildProgressWindows(tasks: Task[]) {
  const windows = new Map<string, ProgressWindow[]>()
  for (const task of tasks) {
    const assigneeName = String(task.assignee_name ?? task.assignee ?? '').trim()
    if (!assigneeName || !isInProgressTask(task)) continue

    const startAt = toTimestamp(resolveTaskStart(task))
    const endAt = toTimestamp(resolveTaskEnd(task))
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt < startAt) continue

    const list = windows.get(assigneeName) ?? []
    list.push({ startAt, endAt })
    windows.set(assigneeName, list)
  }
  return windows
}

const INACTIVE_TASK_STATUSES = new Set([
  'completed',
  'cancelled',
  'closed',
  'archived',
  'voided',
  'deleted',
  '已完成',
  '已取消',
  '已关闭',
  '已归档',
  '已作废',
  '已删除',
])

const INACTIVE_MATERIAL_STATUSES = new Set([
  'inactive',
  'archived',
  'voided',
  'deleted',
  'cancelled',
  'closed',
  '已停用',
  '已归档',
  '已作废',
  '已删除',
  '已取消',
  '已关闭',
])

const UNAVAILABLE_METRIC_STATUSES = new Set([
  'insufficient_data',
  'data_pending',
  'source_unavailable',
  'low_confidence',
])

function isQualityActiveTask(task: Task) {
  const status = String(task.status ?? '').trim().toLowerCase()
  return !INACTIVE_TASK_STATUSES.has(status)
}

function isQualityExecutableTask(task: Task) {
  return isQualityActiveTask(task) && task.is_wbs_summary !== true && task.is_executable !== false
}

function hasAnyEngineeringObjectReference(task: Task) {
  return Boolean(
    task.engineering_object_id ||
    task.phase_object_id ||
    task.section_object_id ||
    task.building_object_id ||
    task.basement_object_id ||
    task.floor_object_id ||
    task.physical_zone_object_id ||
    task.functional_area_object_id,
  )
}

function hasParticipantUnitReference(task: Task) {
  return hasStableResponsibleUnit(task)
}

function shouldHaveExplicitWbsType(task: Task) {
  return Boolean(
    task.wbs_code ||
    task.wbs_level != null ||
    task.parent_id ||
    task.parent_task_id ||
    task.is_wbs_summary ||
    task.is_executable != null,
  )
}

function isGeneratedTaskNeedingLineage(task: Task) {
  const source = String(task.task_source ?? '').trim().toLowerCase()
  if (task.baseline_item_id || task.monthly_plan_item_id || task.template_id || task.template_node_id) return true
  return ['baseline', 'monthly_plan', 'template', 'wbs_template', 'imported', 'generated'].includes(source)
}

function isQualityActiveMaterial(material: ProjectMaterialQualityRow) {
  const recordStatus = normalizeLowerValue(material.record_status || 'active')
  const lifecycleStatus = normalizeLowerValue(material.lifecycle_status || 'active')
  return !INACTIVE_MATERIAL_STATUSES.has(recordStatus) && !INACTIVE_MATERIAL_STATUSES.has(lifecycleStatus)
}

function defaultSourceReadStatus(): DataQualitySourceReadStatus {
  return {
    tasks: 'ok',
    conditions: 'ok',
    snapshots: 'ok',
    lineageLinks: 'ok',
    acceptancePlans: 'ok',
    materials: 'ok',
    retentionEvents: 'ok',
    metricSnapshots: 'ok',
  }
}

async function readOptionalQualityRows<T>(
  projectId: string,
  sourceKey: DataQualitySourceKey,
  status: DataQualitySourceReadStatus,
  loader: () => Promise<T[]>,
): Promise<T[]> {
  try {
    return await loader()
  } catch (error) {
    status[sourceKey] = 'failed'
    logger.warn('[dataQualityService] optional source read failed', {
      projectId,
      sourceKey,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

const SOURCE_RULE_CODES: Record<DataQualitySourceKey, FindingRuleCode[]> = {
  tasks: [
    'TREND_DELAY',
    'SNAPSHOT_GAP',
    'PROGRESS_TIME_MISMATCH',
    'BATCH_SAME_VALUE',
    'PARENT_CHILD_INCONSISTENT',
    'DEPENDENCY_INCONSISTENT',
    'MILESTONE_PREDECESSOR_INCONSISTENT',
    'CONDITION_UNSATISFIED_STARTED',
    'ASSIGNEE_WORKLOAD_ABNORMAL',
    'ENGINEERING_OBJECT_MISSING',
    'PARTICIPANT_UNIT_MISSING',
    'WBS_TYPE_UNCALIBRATED',
    'STATUS_NORMALIZATION_NEEDED',
    'LINEAGE_INCOMPLETE',
  ],
  conditions: [
    'CONDITION_UNSATISFIED_STARTED',
  ],
  snapshots: [
    'SNAPSHOT_GAP',
    'PROGRESS_JUMP',
    'PROGRESS_MONTH_END_BURST',
    'PROGRESS_STUCK_FINISHING',
    'PROGRESS_SOURCE_LOW_CONFIDENCE',
    'PROGRESS_ROLLBACK',
    'PROGRESS_DUPLICATE_FILL',
  ],
  lineageLinks: [
    'LINEAGE_INCOMPLETE',
  ],
  acceptancePlans: [
    'ACCEPTANCE_LINK_ORPHAN',
  ],
  materials: [
    'MATERIAL_SPECIALTY_MISSING',
    'MATERIAL_UNIT_MISSING',
    'MATERIAL_ARRIVAL_OVERDUE',
    'MATERIAL_SAMPLE_PENDING',
  ],
  retentionEvents: [
    'RETENTION_DECISION_EXPIRED',
    'RETENTION_CONFIRMATION_FAILED',
    'RETENTION_CONFIRMING_STALE',
  ],
  metricSnapshots: [
    'METRIC_CALIBER_MISSING',
    'METRIC_VALUE_UNAVAILABLE',
  ],
}

function collectUnresolvedRuleCodesForFailedSources(status: DataQualitySourceReadStatus) {
  const codes = new Set<FindingRuleCode>()
  for (const [sourceKey, readStatus] of Object.entries(status) as Array<[DataQualitySourceKey, 'ok' | 'failed']>) {
    if (readStatus !== 'failed') continue
    for (const ruleCode of SOURCE_RULE_CODES[sourceKey] ?? []) {
      codes.add(ruleCode)
    }
  }
  return codes
}

export class DataQualityService {
  private async loadProjectData(projectId: string) {
    const sourceReadStatus = defaultSourceReadStatus()
    const tasks = await readDataQualityRows<Task>('tasks', projectId)
    const taskIds = tasks.map((task) => task.id)
    const [conditions, snapshots, lineageLinks, acceptancePlans, materials, retentionEvents, metricSnapshots] = await Promise.all([
      readDataQualityRows<TaskCondition>('conditions', projectId),
      listDataQualitySnapshots(taskIds),
      readOptionalQualityRows(projectId, 'lineageLinks', sourceReadStatus, () => readDataQualityRows<DataLineageLinkRow>('lineageLinks', projectId)),
      readOptionalQualityRows(projectId, 'acceptancePlans', sourceReadStatus, () => readDataQualityRows<AcceptancePlanQualityRow>('acceptancePlans', projectId)),
      readOptionalQualityRows(projectId, 'materials', sourceReadStatus, () => readDataQualityRows<ProjectMaterialQualityRow>('materials', projectId)),
      readOptionalQualityRows(projectId, 'retentionEvents', sourceReadStatus, () => readDataQualityRows<RetentionDecisionQualityRow>('retentionEvents', projectId)),
      readOptionalQualityRows(projectId, 'metricSnapshots', sourceReadStatus, () => readDataQualityRows<ProjectDailySnapshotQualityRow>('metricSnapshots', projectId)),
    ])

    return { tasks, conditions, snapshots, lineageLinks, acceptancePlans, materials, retentionEvents, metricSnapshots, sourceReadStatus }
  }

  private async detectTrendFindings(projectId: string, tasks: Task[]): Promise<DataQualityFindingDraft[]> {
    const nowAt = Date.now()
    const findings: DataQualityFindingDraft[] = []
    const criticalTaskIds = await getCriticalPathTaskIds(projectId)

    for (const task of tasks) {
      if (!isInProgressTask(task) || isCompletedTask(task)) continue

      const startAt = toTimestamp(resolveTaskStart(task))
      const endAt = toTimestamp(resolveTaskEnd(task))
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt || endAt <= nowAt) continue

      const totalDurationDays = diffDays(startAt, endAt)
      if (totalDurationDays <= 3 || nowAt <= startAt) continue

      const elapsedDays = diffDays(startAt, nowAt)
      const remainingDays = Math.max(totalDurationDays - elapsedDays, 0)
      const timeConsumedRate = clamp(elapsedDays / totalDurationDays, 0, 1)
      if (timeConsumedRate <= 0) continue

      const progressRate = clamp(Number(task.progress ?? 0) / 100, 0, 1)
      const deviationRatio = progressRate / timeConsumedRate
      const isCritical = criticalTaskIds.has(task.id)
      const focusThreshold = isCritical ? 0.8 : 0.7

      let severity: FindingSeverity | null = null
      if (deviationRatio < 0.5 && remainingDays < 3) {
        severity = 'critical'
      } else if (deviationRatio < 0.5 && remainingDays >= 3) {
        severity = 'warning'
      } else if (deviationRatio < focusThreshold) {
        severity = 'info'
      }

      if (!severity) continue

      findings.push({
        finding_key: buildFindingKey('TREND_DELAY', task.id),
        project_id: projectId,
        task_id: task.id,
        rule_code: 'TREND_DELAY',
        rule_type: 'trend',
        severity,
        dimension_key: `task:${task.id}`,
        summary: `任务「${task.title}」当前进度 ${Number(task.progress ?? 0)}%，时间消耗约 ${Math.round(timeConsumedRate * 100)}%，存在进度滞后趋势。`,
        details_json: {
          task_id: task.id,
          task_title: task.title,
          deviation_ratio: roundScore(deviationRatio),
          progress_rate: roundScore(progressRate),
          time_consumed_rate: roundScore(timeConsumedRate),
          plannedRemainingDays: remainingDays,
          is_critical_task: isCritical,
          assignee_name: task.assignee_name ?? task.assignee ?? null,
          participant_unit_name: task.participant_unit_name ?? null,
        },
      })
    }

    return findings
  }

  private async detectSnapshotGapFindings(projectId: string, tasks: Task[], latestSnapshots: Map<string, TaskProgressSnapshot>): Promise<DataQualityFindingDraft[]> {
    const nowAt = Date.now()
    const findings: DataQualityFindingDraft[] = []
    const criticalTaskIds = await getCriticalPathTaskIds(projectId)

    for (const task of tasks) {
      if (!isInProgressTask(task) || isCompletedTask(task)) continue

      const latestSnapshot = latestSnapshots.get(task.id)
      const referenceAt = toTimestamp(
        latestSnapshot?.snapshot_date
          ?? latestSnapshot?.created_at
          ?? task.first_progress_at
          ?? task.updated_at
          ?? task.created_at,
      )

      if (!Number.isFinite(referenceAt)) continue
      const gapDays = diffDays(referenceAt, nowAt)
      if (gapDays < 3) continue

      const severity: FindingSeverity = gapDays >= 7 ? 'critical' : 'warning'
      const isCritical = criticalTaskIds.has(task.id)
      findings.push({
        finding_key: buildFindingKey('SNAPSHOT_GAP', task.id),
        project_id: projectId,
        task_id: task.id,
        rule_code: 'SNAPSHOT_GAP',
        rule_type: 'anomaly',
        severity,
        dimension_key: `task:${task.id}`,
        summary: `任务「${task.title}」已有 ${gapDays} 天未更新进度，请复核现场最新进展。`,
        details_json: {
          task_id: task.id,
          task_title: task.title,
          gap_days: gapDays,
          latest_snapshot_date: latestSnapshot?.snapshot_date ?? latestSnapshot?.created_at ?? null,
          assignee_name: task.assignee_name ?? task.assignee ?? null,
          participant_unit_name: task.participant_unit_name ?? null,
          is_critical_task: isCritical,
        },
      })
    }

    return findings
  }

  private async detectProgressJumpFindings(projectId: string, tasks: Task[], snapshotsByTask: Map<string, TaskProgressSnapshot[]>): Promise<DataQualityFindingDraft[]> {
    const findings: DataQualityFindingDraft[] = []
    const criticalTaskIds = await getCriticalPathTaskIds(projectId)
    const ruleByCode: Record<ProgressQualityCode, FindingRuleCode> = {
      progress_jump: 'PROGRESS_JUMP',
      month_end_burst: 'PROGRESS_MONTH_END_BURST',
      stuck_finishing: 'PROGRESS_STUCK_FINISHING',
      source_low_confidence: 'PROGRESS_SOURCE_LOW_CONFIDENCE',
      progress_rollback: 'PROGRESS_ROLLBACK',
      duplicate_progress_fill: 'PROGRESS_DUPLICATE_FILL',
    }
    const labelByCode: Record<ProgressQualityCode, string> = {
      progress_jump: '进度跳变填报',
      month_end_burst: '月末集中填报',
      stuck_finishing: '进度卡停未闭合',
      source_low_confidence: '进度来源可信度偏低',
      progress_rollback: '进度回退修正',
      duplicate_progress_fill: '重复进度填报',
    }

    for (const task of tasks) {
      const snapshots = snapshotsByTask.get(task.id) ?? []
      const signals = detectProgressQualitySignals(snapshots)
      if (signals.length === 0) continue

      const isCritical = criticalTaskIds.has(task.id)
      for (const signal of signals) {
        const ruleCode = ruleByCode[signal.code]
        findings.push({
          finding_key: buildFindingKey(ruleCode, task.id, signal.code),
          project_id: projectId,
          task_id: task.id,
          rule_code: ruleCode,
          rule_type: 'anomaly',
          severity: signal.acknowledged ? 'info' : signal.severity,
          dimension_key: `task:${task.id}`,
          summary: `任务「${task.title}」命中${labelByCode[signal.code]}，该样本仅用于数据质量提示，并会按规则影响速度学习样本。`,
          details_json: {
            task_id: task.id,
            task_title: task.title,
            anomaly_code: signal.code,
            confidence_action: signal.confidenceAction,
            excluded_from_velocity_learning: signal.excludedFromVelocityLearning,
            acknowledged: signal.acknowledged,
            source_confidence_related: ['source_low_confidence', 'duplicate_progress_fill'].includes(signal.code),
            assignee_name: task.assignee_name ?? task.assignee ?? null,
            participant_unit_name: task.participant_unit_name ?? null,
            is_critical_task: isCritical,
            ...signal.metadata,
          },
        })
      }
    }

    return findings
  }

  private async detectProgressTimeMismatchFindings(projectId: string, tasks: Task[]): Promise<DataQualityFindingDraft[]> {
    const nowAt = Date.now()
    const findings: DataQualityFindingDraft[] = []
    const criticalTaskIds = await getCriticalPathTaskIds(projectId)

    for (const task of tasks) {
      const startAt = toTimestamp(resolveTaskStart(task))
      const endAt = toTimestamp(resolveTaskEnd(task))
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) continue

      const totalDays = diffDays(startAt, endAt)
      if (totalDays <= 3) continue

      const elapsedDays = clamp(diffDays(startAt, nowAt), 0, totalDays)
      const elapsedRate = elapsedDays / totalDays
      const progressRate = clamp(Number(task.progress ?? 0) / 100, 0, 1)

      let severity: FindingSeverity | null = null
      if (progressRate >= 0.8 && elapsedRate <= 0.2) {
        severity = 'warning'
      } else if (progressRate <= 0.2 && elapsedRate >= 0.8 && !isCompletedTask(task)) {
        severity = 'warning'
      }

      if (!severity) continue

      const isCritical = criticalTaskIds.has(task.id)
      findings.push({
        finding_key: buildFindingKey('PROGRESS_TIME_MISMATCH', task.id),
        project_id: projectId,
        task_id: task.id,
        rule_code: 'PROGRESS_TIME_MISMATCH',
        rule_type: 'anomaly',
        severity,
        dimension_key: `task:${task.id}`,
        summary: `任务「${task.title}」计划时间消耗与当前进度不匹配，请复核计划或填报。`,
        details_json: {
          task_id: task.id,
          task_title: task.title,
          elapsed_rate: roundScore(elapsedRate),
          progress_rate: roundScore(progressRate),
          assignee_name: task.assignee_name ?? task.assignee ?? null,
          participant_unit_name: task.participant_unit_name ?? null,
          is_critical_task: isCritical,
        },
      })
    }

    return findings
  }

  private detectBatchSameValueFindings(projectId: string, tasks: Task[], latestSnapshots: Map<string, TaskProgressSnapshot>): DataQualityFindingDraft[] {
    const grouped = new Map<string, Task[]>()
    for (const task of tasks) {
      if (!isStartedTask(task)) continue
      const latestSnapshot = latestSnapshots.get(task.id)
      const snapshotDay = String(latestSnapshot?.snapshot_date ?? task.updated_at ?? '').slice(0, 10)
      const assigneeName = String(task.assignee_name ?? task.assignee ?? '').trim() || '未指定责任人'
      const key = `${assigneeName}:${snapshotDay}:${Number(task.progress ?? 0)}`
      const list = grouped.get(key) ?? []
      list.push(task)
      grouped.set(key, list)
    }

    const findings: DataQualityFindingDraft[] = []
    for (const [groupKey, groupedTasks] of grouped.entries()) {
      if (groupedTasks.length < 3) continue
      const assigneeName = String(groupedTasks[0]?.assignee_name ?? groupedTasks[0]?.assignee ?? '').trim() || '未指定责任人'
      const taskIds = groupedTasks.map((task) => task.id)
      findings.push({
        finding_key: buildFindingKey('BATCH_SAME_VALUE', null, groupKey),
        project_id: projectId,
        task_id: groupedTasks[0]?.id ?? null,
        rule_code: 'BATCH_SAME_VALUE',
        rule_type: 'anomaly',
        severity: groupedTasks.length >= 5 ? 'critical' : 'warning',
        dimension_key: `assignee:${assigneeName}`,
        summary: `责任人「${assigneeName}」当前有 ${groupedTasks.length} 条任务填报为相同进度，请核对是否批量粗填。`,
        details_json: {
          assignee_name: assigneeName,
          task_ids: taskIds,
          task_titles: groupedTasks.map((task) => task.title),
          progress_value: Number(groupedTasks[0]?.progress ?? 0),
          participant_unit_name: groupedTasks[0]?.participant_unit_name ?? null,
        },
      })
    }

    return findings
  }

  private async detectParentChildFindings(projectId: string, tasks: Task[]): Promise<DataQualityFindingDraft[]> {
    const findings: DataQualityFindingDraft[] = []
    const childrenByParent = new Map<string, Task[]>()
    const criticalTaskIds = await getCriticalPathTaskIds(projectId)

    for (const task of tasks) {
      if (!task.parent_id) continue
      const list = childrenByParent.get(task.parent_id) ?? []
      list.push(task)
      childrenByParent.set(task.parent_id, list)
    }

    for (const task of tasks) {
      const children = childrenByParent.get(task.id)
      if (!children || children.length === 0) continue

      const unfinishedChildren = children.filter((child) => !isCompletedTask(child))
      if (unfinishedChildren.length > 0 && isCompletedTask(task)) {
        const isCritical = criticalTaskIds.has(task.id)
        findings.push({
          finding_key: buildFindingKey('PARENT_CHILD_INCONSISTENT', task.id),
          project_id: projectId,
          task_id: task.id,
          rule_code: 'PARENT_CHILD_INCONSISTENT',
          rule_type: 'cross_check',
          severity: 'critical',
          dimension_key: `task:${task.id}`,
          summary: `任务「${task.title}」已完成，但仍有 ${unfinishedChildren.length} 个子任务未完成。`,
          details_json: {
            task_id: task.id,
            task_title: task.title,
            child_task_ids: unfinishedChildren.map((child) => child.id),
            child_task_titles: unfinishedChildren.map((child) => child.title),
            assignee_name: task.assignee_name ?? task.assignee ?? null,
            participant_unit_name: task.participant_unit_name ?? null,
            is_critical_task: isCritical,
          },
        })
      }
    }

    return findings
  }

  private async detectDependencyFindings(projectId: string, tasks: Task[]): Promise<DataQualityFindingDraft[]> {
    const findings: DataQualityFindingDraft[] = []
    const dependencySignalsByTaskId = await loadTaskDependencySignals(projectId, tasks)

    const taskMap = new Map(tasks.map((task) => [task.id, task]))
    const criticalTaskIds = await getCriticalPathTaskIds(projectId)

    for (const task of tasks) {
      const dependencySignals = [...(dependencySignalsByTaskId.get(task.id) ?? [])]
      if (dependencySignals.length === 0 || !isStartedTask(task)) continue

      const blockedBy = dependencySignals
        .map((signal) => ({ signal, dependency: taskMap.get(signal.dependencyTaskId) }))
        .filter((item): item is { signal: TaskDependencySignal; dependency: Task } => Boolean(item.dependency) && !isCompletedTask(item.dependency))

      if (blockedBy.length === 0) continue

      const isCritical = criticalTaskIds.has(task.id)
      const hasStrongDependency = blockedBy.some((item) => isStrongDependencySource(item.signal.sourceType))
      const dependencyPolicy = hasStrongDependency ? 'manual_strong_dependency' : 'site_overlap_light_signal'
      findings.push({
        finding_key: buildFindingKey('DEPENDENCY_INCONSISTENT', task.id),
        project_id: projectId,
        task_id: task.id,
        rule_code: 'DEPENDENCY_INCONSISTENT',
        rule_type: 'cross_check',
        severity: hasStrongDependency ? (isCritical ? 'critical' : 'warning') : 'info',
        dimension_key: `task:${task.id}`,
        summary: hasStrongDependency
          ? `任务「${task.title}」已开工，但仍有 ${blockedBy.length} 个手动强前置任务未完成。`
          : `任务「${task.title}」已按现场事实先行推进，仍有 ${blockedBy.length} 个计划前置未完成，按穿插施工轻提示处理。`,
        details_json: {
          task_id: task.id,
          task_title: task.title,
          dependency_task_ids: blockedBy.map((item) => item.dependency.id),
          dependency_task_titles: blockedBy.map((item) => item.dependency.title),
          dependency_source_types: blockedBy.map((item) => item.signal.sourceType ?? 'unknown'),
          dependency_policy: dependencyPolicy,
          assignee_name: task.assignee_name ?? task.assignee ?? null,
          participant_unit_name: task.participant_unit_name ?? null,
          is_critical_task: isCritical,
        },
      })
    }

    return findings
  }

  private async detectMilestonePredecessorFindings(projectId: string, tasks: Task[]): Promise<DataQualityFindingDraft[]> {
    const findings: DataQualityFindingDraft[] = []
    const taskMap = new Map(tasks.map((task) => [task.id, task]))
    const dependencySignalsByTaskId = await loadTaskDependencySignals(projectId, tasks)
    const criticalTaskIds = await getCriticalPathTaskIds(projectId)

    for (const task of tasks) {
      if (!task.is_milestone || !isCompletedTask(task)) continue
      const dependencyIds = (dependencySignalsByTaskId.get(task.id) ?? []).map((signal) => signal.dependencyTaskId)
      if (dependencyIds.length === 0) continue

      const unfinished = dependencyIds
        .map((dependencyId) => taskMap.get(dependencyId))
        .filter((dependency): dependency is Task => Boolean(dependency) && !isCompletedTask(dependency))

      if (unfinished.length === 0) continue

      const isCritical = criticalTaskIds.has(task.id)
      findings.push({
        finding_key: buildFindingKey('MILESTONE_PREDECESSOR_INCONSISTENT', task.id),
        project_id: projectId,
        task_id: task.id,
        rule_code: 'MILESTONE_PREDECESSOR_INCONSISTENT',
        rule_type: 'cross_check',
        severity: 'critical',
        dimension_key: `task:${task.id}`,
        summary: `关键节点「${task.title}」已完成，但仍有关联前置任务未完成。`,
        details_json: {
          task_id: task.id,
          task_title: task.title,
          dependency_task_ids: unfinished.map((dependency) => dependency.id),
          dependency_task_titles: unfinished.map((dependency) => dependency.title),
          assignee_name: task.assignee_name ?? task.assignee ?? null,
          participant_unit_name: task.participant_unit_name ?? null,
          is_critical_task: isCritical,
        },
      })
    }

    return findings
  }

  private async detectConditionFindings(projectId: string, tasks: Task[], conditions: TaskCondition[]): Promise<DataQualityFindingDraft[]> {
    const findings: DataQualityFindingDraft[] = []
    const pendingConditionByTask = new Map<string, TaskCondition[]>()
    const criticalTaskIds = await getCriticalPathTaskIds(projectId)

    for (const condition of conditions) {
      const isSatisfied = condition.is_satisfied === true
        || ['已满足', '已确认', 'completed', 'confirmed', 'satisfied'].includes(String(condition.status ?? '').trim())
      if (isSatisfied) continue

      const list = pendingConditionByTask.get(condition.task_id) ?? []
      list.push(condition)
      pendingConditionByTask.set(condition.task_id, list)
    }

    for (const task of tasks) {
      const pendingConditions = pendingConditionByTask.get(task.id) ?? []
      if (pendingConditions.length === 0 || !isStartedTask(task)) continue

      const isCritical = criticalTaskIds.has(task.id)
      findings.push({
        finding_key: buildFindingKey('CONDITION_UNSATISFIED_STARTED', task.id),
        project_id: projectId,
        task_id: task.id,
        rule_code: 'CONDITION_UNSATISFIED_STARTED',
        rule_type: 'cross_check',
        severity: isCritical ? 'critical' : 'warning',
        dimension_key: `task:${task.id}`,
        summary: `任务「${task.title}」已开工，但仍有 ${pendingConditions.length} 个开工条件未满足。`,
        details_json: {
          task_id: task.id,
          task_title: task.title,
          condition_ids: pendingConditions.map((condition) => condition.id),
          condition_names: pendingConditions.map((condition) => condition.condition_name),
          assignee_name: task.assignee_name ?? task.assignee ?? null,
          participant_unit_name: task.participant_unit_name ?? null,
          is_critical_task: isCritical,
        },
      })
    }

    return findings
  }

  private async detectAssigneeWorkloadFindings(projectId: string, tasks: Task[]): Promise<DataQualityFindingDraft[]> {
    const findings: DataQualityFindingDraft[] = []
    const progressWindows = buildProgressWindows(tasks)
    const criticalTaskIds = await getCriticalPathTaskIds(projectId)

    for (const task of tasks) {
      const assigneeName = String(task.assignee_name ?? task.assignee ?? '').trim()
      if (!assigneeName || !isInProgressTask(task)) continue

      const startAt = toTimestamp(resolveTaskStart(task))
      const endAt = toTimestamp(resolveTaskEnd(task))
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt < startAt) continue

      const overlapCount = getOverlapCount({ startAt, endAt }, progressWindows.get(assigneeName) ?? [])
      if (overlapCount < 5) continue

      const severity: FindingSeverity = overlapCount >= 8 ? 'critical' : 'warning'
      const isCritical = criticalTaskIds.has(task.id)
      findings.push({
        finding_key: buildFindingKey('ASSIGNEE_WORKLOAD_ABNORMAL', task.id),
        project_id: projectId,
        task_id: task.id,
        rule_code: 'ASSIGNEE_WORKLOAD_ABNORMAL',
        rule_type: 'cross_check',
        severity,
        dimension_key: `assignee:${assigneeName}`,
        summary: `责任人「${assigneeName}」当前有 ${overlapCount} 条在途任务时间重叠，可能存在责任分配异常。`,
        details_json: {
          task_id: task.id,
          task_title: task.title,
          assignee_name: assigneeName,
          overlap_count: overlapCount,
          participant_unit_name: task.participant_unit_name ?? null,
          is_critical_task: isCritical,
        },
      })
    }

    return findings
  }

  private async detectGovernanceFindings(
    projectId: string,
    tasks: Task[],
    lineageLinks: DataLineageLinkRow[],
    acceptancePlans: AcceptancePlanQualityRow[],
  ): Promise<DataQualityFindingDraft[]> {
    const findings: DataQualityFindingDraft[] = []
    const taskById = new Map(tasks.map((task) => [task.id, task]))
    const lineageTargetIds = new Set(
      lineageLinks
        .filter((link) => String(link.target_entity_type ?? '').trim() === 'task')
        .map((link) => String(link.target_entity_id ?? '').trim())
        .filter(Boolean),
    )

    for (const task of tasks) {
      if (!isQualityExecutableTask(task)) continue

      const taskTitle = task.title || '未命名任务'
      if (!hasAnyEngineeringObjectReference(task)) {
        findings.push({
          finding_key: buildFindingKey('ENGINEERING_OBJECT_MISSING', task.id),
          project_id: projectId,
          task_id: task.id,
          rule_code: 'ENGINEERING_OBJECT_MISSING',
          rule_type: 'completeness',
          severity: 'warning',
          dimension_key: `task:${task.id}`,
          summary: `任务「${taskTitle}」缺少工程对象或施工范围，后续范围统计和偏差归因可能失真。`,
          details_json: {
            task_id: task.id,
            task_title: taskTitle,
            wbs_code: task.wbs_code ?? null,
          },
          entity_type: 'task',
          entity_id: task.id,
          quality_dimension: 'completeness',
          source_type: 'task',
        })
      }

      if (!hasParticipantUnitReference(task)) {
        findings.push({
          finding_key: buildFindingKey('PARTICIPANT_UNIT_MISSING', task.id),
          project_id: projectId,
          task_id: task.id,
          rule_code: 'PARTICIPANT_UNIT_MISSING',
          rule_type: 'completeness',
          severity: 'warning',
          dimension_key: `task:${task.id}`,
          summary: `任务「${taskTitle}」缺少责任单位，责任汇总、通知触达和履约分析可能失真。`,
          details_json: {
            task_id: task.id,
            task_title: taskTitle,
            assignee_name: task.assignee_name ?? task.assignee ?? null,
          },
          entity_type: 'task',
          entity_id: task.id,
          quality_dimension: 'completeness',
          source_type: 'task',
        })
      }

      if (shouldHaveExplicitWbsType(task) && !task.wbs_node_type && !task.engineering_category_id) {
        findings.push({
          finding_key: buildFindingKey('WBS_TYPE_UNCALIBRATED', task.id),
          project_id: projectId,
          task_id: task.id,
          rule_code: 'WBS_TYPE_UNCALIBRATED',
          rule_type: 'wbs_classification',
          severity: 'info',
          dimension_key: `task:${task.id}`,
          summary: `任务「${taskTitle}」缺少 WBS 语义类型或工程分类，需要校准。`,
          details_json: {
            task_id: task.id,
            task_title: taskTitle,
            wbs_code: task.wbs_code ?? null,
            wbs_level: task.wbs_level ?? null,
          },
          entity_type: 'task',
          entity_id: task.id,
          quality_dimension: 'accuracy',
          source_type: 'wbs',
        })
      }

      const rawStatus = String(task.status ?? '').trim()
      const normalizedStatus = await normalizeStatus('task.lifecycle', rawStatus)
      if (rawStatus && normalizedStatus !== rawStatus) {
        findings.push({
          finding_key: buildFindingKey('STATUS_NORMALIZATION_NEEDED', task.id),
          project_id: projectId,
          task_id: task.id,
          rule_code: 'STATUS_NORMALIZATION_NEEDED',
          rule_type: 'status_normalization',
          severity: 'warning',
          dimension_key: `task:${task.id}`,
          summary: `${taskTitle} 状态 ${rawStatus} 未使用标准状态值，请统一为 ${normalizedStatus}`,
          details_json: {
            task_id: task.id,
            task_title: taskTitle,
            raw_status: rawStatus,
            normalized_status: normalizedStatus,
          },
          entity_type: 'task',
          entity_id: task.id,
          quality_dimension: 'governance',
          source_type: 'status_dictionary',
        })
      }

      if (isGeneratedTaskNeedingLineage(task) && !lineageTargetIds.has(task.id)) {
        findings.push({
          finding_key: buildFindingKey('LINEAGE_INCOMPLETE', task.id),
          project_id: projectId,
          task_id: task.id,
          rule_code: 'LINEAGE_INCOMPLETE',
          rule_type: 'lineage',
          severity: 'info',
          dimension_key: `task:${task.id}`,
          summary: `任务「${taskTitle}」缺少来源映射，模板、基线或月度计划生成链路不可追溯。`,
          details_json: {
            task_id: task.id,
            task_title: taskTitle,
            task_source: task.task_source ?? null,
            baseline_item_id: task.baseline_item_id ?? null,
            monthly_plan_item_id: task.monthly_plan_item_id ?? null,
            template_id: task.template_id ?? null,
          },
          entity_type: 'task',
          entity_id: task.id,
          quality_dimension: 'lineage',
          source_type: 'data_lineage',
        })
      }
    }

    for (const plan of acceptancePlans) {
      const taskId = String(plan.linked_task_id ?? '').trim()
      if (!taskId) continue

      const linkedTask = taskById.get(taskId)
      if (linkedTask && isQualityActiveTask(linkedTask)) continue

      const planName = plan.plan_name || plan.acceptance_name || '未命名验收项'
      findings.push({
        finding_key: buildFindingKey('ACCEPTANCE_LINK_ORPHAN', taskId, plan.id),
        project_id: projectId,
        task_id: linkedTask?.id ?? null,
        rule_code: 'ACCEPTANCE_LINK_ORPHAN',
        rule_type: 'cross_consistency',
        severity: 'warning',
        dimension_key: `acceptance:${plan.id}`,
        summary: `验收项「${planName}」关联的任务已不存在或已关闭，请修正验收联动关系。`,
        details_json: {
          acceptance_plan_id: plan.id,
          acceptance_plan_name: planName,
          linked_task_id: taskId,
          linked_task_status: linkedTask?.status ?? null,
        },
        entity_type: 'acceptance_plan',
        entity_id: plan.id,
        quality_dimension: 'consistency',
        source_type: 'acceptance',
      })
    }

    return findings
  }

  private detectMaterialFindings(
    projectId: string,
    materials: ProjectMaterialQualityRow[],
  ): DataQualityFindingDraft[] {
    const findings: DataQualityFindingDraft[] = []
    const nowAt = Date.now()

    for (const material of materials) {
      if (!material.id || !isQualityActiveMaterial(material)) continue

      const materialName = material.material_name || '未命名材料'
      const baseDetails = {
        material_id: material.id,
        material_name: materialName,
        specialty_type: material.specialty_type ?? null,
        expected_arrival_date: material.expected_arrival_date ?? null,
        actual_arrival_date: material.actual_arrival_date ?? null,
      }

      if (!normalizeTextValue(material.specialty_type)) {
        findings.push({
          finding_key: buildFindingKey('MATERIAL_SPECIALTY_MISSING', null, material.id),
          project_id: projectId,
          task_id: null,
          rule_code: 'MATERIAL_SPECIALTY_MISSING',
          rule_type: 'completeness',
          severity: 'warning',
          dimension_key: `material:${material.id}`,
          summary: `材料「${materialName}」缺少材料专业分类，材料到场与任务联动可能失真。`,
          details_json: baseDetails,
          entity_type: 'project_material',
          entity_id: material.id,
          quality_dimension: 'completeness',
          source_type: 'project_materials',
        })
      }

      if (!normalizeTextValue(material.participant_unit_id)) {
        findings.push({
          finding_key: buildFindingKey('MATERIAL_UNIT_MISSING', null, material.id),
          project_id: projectId,
          task_id: null,
          rule_code: 'MATERIAL_UNIT_MISSING',
          rule_type: 'completeness',
          severity: 'warning',
          dimension_key: `material:${material.id}`,
          summary: `材料「${materialName}」缺少责任单位，材料到场、验收和催办链路不可追踪。`,
          details_json: baseDetails,
          entity_type: 'project_material',
          entity_id: material.id,
          quality_dimension: 'completeness',
          source_type: 'project_materials',
        })
      }

      if (!material.actual_arrival_date && isPastDate(material.expected_arrival_date, nowAt)) {
        findings.push({
          finding_key: buildFindingKey('MATERIAL_ARRIVAL_OVERDUE', null, material.id),
          project_id: projectId,
          task_id: null,
          rule_code: 'MATERIAL_ARRIVAL_OVERDUE',
          rule_type: 'staleness',
          severity: 'warning',
          dimension_key: `material:${material.id}`,
          summary: `材料「${materialName}」预计到场日期已过但未记录实际到场，请核对到场状态。`,
          details_json: {
            ...baseDetails,
            overdue_days: diffDays(toTimestamp(material.expected_arrival_date), nowAt),
          },
          entity_type: 'project_material',
          entity_id: material.id,
          quality_dimension: 'timeliness',
          source_type: 'project_materials',
        })
      }

      if (
        material.requires_sample_confirmation === true
        && material.sample_confirmed !== true
        && isPastDate(material.expected_arrival_date, nowAt)
      ) {
        findings.push({
          finding_key: buildFindingKey('MATERIAL_SAMPLE_PENDING', null, material.id),
          project_id: projectId,
          task_id: null,
          rule_code: 'MATERIAL_SAMPLE_PENDING',
          rule_type: 'staleness',
          severity: 'info',
          dimension_key: `material:${material.id}`,
          summary: `材料「${materialName}」需要样品确认，但预计到场日期后仍未确认样品状态。`,
          details_json: {
            ...baseDetails,
            requires_sample_confirmation: material.requires_sample_confirmation,
            sample_confirmed: material.sample_confirmed ?? false,
          },
          entity_type: 'project_material',
          entity_id: material.id,
          quality_dimension: 'timeliness',
          source_type: 'project_materials',
        })
      }
    }

    return findings
  }

  private detectRetentionFindings(
    projectId: string,
    retentionEvents: RetentionDecisionQualityRow[],
  ): DataQualityFindingDraft[] {
    const nowAt = Date.now()
    const findings: DataQualityFindingDraft[] = []

    for (const event of retentionEvents) {
      if (!event.id) continue
      const executionStatus = normalizeLowerValue(event.execution_status)
      const requiresConfirmation = event.requires_user_confirmation === true
      const confirmed = Boolean(event.confirmed_at)
      const entityType = normalizeTextValue(event.entity_type) || 'unknown'
      const entityId = normalizeTextValue(event.entity_id) || event.id
      const entityName = event.entity_name_snapshot || entityId
      const metadata = toRecord(event.confirmation_metadata)
      const baseDetails = {
        event_id: event.id,
        entity_type: entityType,
        entity_id: entityId,
        requested_action: event.requested_action ?? null,
        resolved_action: event.resolved_action ?? null,
        execution_status: event.execution_status ?? null,
        expires_at: event.expires_at ?? null,
        decision_token_hash_present: Boolean(event.decision_token_hash),
      }

      const pushRetentionFinding = (
        ruleCode: Extract<FindingRuleCode, 'RETENTION_DECISION_EXPIRED' | 'RETENTION_CONFIRMATION_FAILED' | 'RETENTION_CONFIRMING_STALE'>,
        severity: DataQualityFindingDraft['severity'],
        summary: string,
        details: Record<string, unknown> = {},
      ) => {
        findings.push({
          finding_key: buildFindingKey(ruleCode, null, event.id),
          project_id: projectId,
          task_id: null,
          rule_code: ruleCode,
          rule_type: 'retention',
          severity,
          dimension_key: `retention:${event.id}`,
          summary,
          details_json: {
            ...baseDetails,
            ...details,
          },
          entity_type: 'deletion_retention_event',
          entity_id: event.id,
          quality_dimension: 'retention',
          source_type: 'deletion_retention_events',
        })
      }

      if (
        requiresConfirmation &&
        !confirmed &&
        ['pending_confirmation', 'expired'].includes(executionStatus) &&
        (executionStatus === 'expired' || isPastDate(event.expires_at, nowAt))
      ) {
        pushRetentionFinding(
          'RETENTION_DECISION_EXPIRED',
          'warning',
          `保留/删除决策「${entityName}」确认令牌已过期，需要重新发起治理决策。`,
        )
      }

      if (requiresConfirmation && !confirmed && executionStatus === 'failed') {
        pushRetentionFinding(
          'RETENTION_CONFIRMATION_FAILED',
          'warning',
          `保留/删除决策「${entityName}」确认执行失败，需要人工处理。`,
          {
            last_error_code: normalizeTextValue(metadata.last_error_code) || null,
            last_error_message: normalizeTextValue(metadata.last_error_message) || null,
            recovery_attempts: Number(metadata.recovery_attempts ?? 0) || 0,
          },
        )
      }

      if (requiresConfirmation && !confirmed && executionStatus === 'confirming') {
        const reservedAt = normalizeTextValue(metadata.reserved_at)
        const reservedAtMs = reservedAt ? new Date(reservedAt).getTime() : NaN
        const stale = Number.isFinite(reservedAtMs) && nowAt - reservedAtMs >= 10 * 60 * 1000
        if (!stale) continue
        pushRetentionFinding(
          'RETENTION_CONFIRMING_STALE',
          'warning',
          `保留/删除决策「${entityName}」确认长时间停留在执行中，需要恢复或人工处理。`,
          {
            reserved_at: reservedAt || null,
            recovery_attempts: Number(metadata.recovery_attempts ?? 0) || 0,
          },
        )
      }
    }

    return findings
  }

  private detectMetricCaliberFindings(
    projectId: string,
    metricSnapshots: ProjectDailySnapshotQualityRow[],
  ): DataQualityFindingDraft[] {
    const latest = metricSnapshots[0]
    if (!latest) return []

    const findings: DataQualityFindingDraft[] = []
    const snapshotKey = latest.id || latest.snapshot_date || projectId
    const registryVersion = normalizeTextValue(latest.metric_registry_version)
    const snapshotVersion = Number(latest.metric_snapshot_version)

    if (!registryVersion || !Number.isFinite(snapshotVersion) || snapshotVersion <= 0) {
      findings.push({
        finding_key: buildFindingKey('METRIC_CALIBER_MISSING', null, String(snapshotKey)),
        project_id: projectId,
        task_id: null,
        rule_code: 'METRIC_CALIBER_MISSING',
        rule_type: 'metric_caliber',
        severity: 'warning',
        dimension_key: `metric_snapshot:${snapshotKey}`,
        summary: `项目最新日报快照缺少指标口径版本或快照结构版本，报表口径需要补齐。`,
        details_json: {
          snapshot_id: latest.id ?? null,
          snapshot_date: latest.snapshot_date ?? null,
          metric_registry_version: latest.metric_registry_version ?? null,
          metric_snapshot_version: latest.metric_snapshot_version ?? null,
        },
        entity_type: 'project_daily_snapshot',
        entity_id: String(snapshotKey),
        quality_dimension: 'metric_caliber',
        source_type: 'project_daily_snapshot',
      })
    }

    const availability = toRecord(latest.metric_availability)
    const unavailableMetrics = Object.entries(availability)
      .filter(([, status]) => UNAVAILABLE_METRIC_STATUSES.has(normalizeLowerValue(status)))
      .map(([metricKey]) => metricKey)
      .sort()

    if (unavailableMetrics.length > 0) {
      findings.push({
        finding_key: buildFindingKey('METRIC_VALUE_UNAVAILABLE', null, `${snapshotKey}:${unavailableMetrics.join(',')}`),
        project_id: projectId,
        task_id: null,
        rule_code: 'METRIC_VALUE_UNAVAILABLE',
        rule_type: 'metric_caliber',
        severity: 'info',
        dimension_key: `metric_snapshot:${snapshotKey}`,
        summary: `项目最新日报快照有 ${unavailableMetrics.length} 个指标当前不可用，请核对摘要服务或快照生成链路。`,
        details_json: {
          snapshot_id: latest.id ?? null,
          snapshot_date: latest.snapshot_date ?? null,
          unavailable_metrics: unavailableMetrics,
          metric_availability: availability,
        },
        entity_type: 'project_daily_snapshot',
        entity_id: String(snapshotKey),
        quality_dimension: 'metric_caliber',
        source_type: 'project_daily_snapshot',
      })
    }

    return findings
  }

  private async detectCrossCheckFindings(projectId: string, tasks: Task[], conditions: TaskCondition[]) {
    return [
      ...await this.detectParentChildFindings(projectId, tasks),
      ...await this.detectDependencyFindings(projectId, tasks),
      ...await this.detectMilestonePredecessorFindings(projectId, tasks),
      ...await this.detectConditionFindings(projectId, tasks, conditions),
      ...await this.detectAssigneeWorkloadFindings(projectId, tasks),
    ]
  }

  private dedupeFindings(findings: DataQualityFindingDraft[]) {
    const findingMap = new Map<string, DataQualityFindingDraft>()
    for (const finding of findings) {
      const existing = findingMap.get(finding.finding_key)
      if (!existing || severityRank(finding.severity) > severityRank(existing.severity)) {
        findingMap.set(finding.finding_key, finding)
      }
    }
    return [...findingMap.values()]
  }

  private computeConfidence(
    month: string,
    tasks: Task[],
    snapshots: TaskProgressSnapshot[],
    findings: DataQualityFinding[],
    weights: DataQualityWeights = DEFAULT_WEIGHTS,
  ): DataQualityConfidence {
    const relevantTasks = tasks.filter((task) => !isCompletedTask(task) || isStartedTask(task))
    const taskIds = relevantTasks.map((task) => task.id)
    const taskIdSet = new Set(taskIds)
    const monthRange = monthBounds(month)
    const latestSnapshots = getLatestSnapshotMap(snapshots)

    if (taskIds.length === 0) {
      const emptyScores = {
        timeliness: 0,
        anomaly: 0,
        consistency: 0,
        coverage: 0,
        jumpiness: 0,
      }
      return {
        score: 0,
        flag: 'low',
        note: '缺少可评估任务数据，仅供参考',
        timelinessScore: 0,
        anomalyScore: 0,
        consistencyScore: 0,
        coverageScore: 0,
        jumpinessScore: 0,
        activeFindingCount: findings.filter((finding) => finding.status === 'active').length,
        trendWarningCount: findings.filter((finding) => finding.status === 'active' && finding.rule_type === 'trend').length,
        anomalyFindingCount: findings.filter((finding) => finding.status === 'active' && finding.rule_type === 'anomaly').length,
        crossCheckFindingCount: findings.filter((finding) => finding.status === 'active' && finding.rule_type === 'cross_check').length,
        weights,
        dimensions: buildConfidenceDimensions(emptyScores, weights),
      }
    }

    const staleTaskCount = relevantTasks.filter((task) => {
      const snapshot = latestSnapshots.get(task.id)
      const referenceAt = toTimestamp(snapshot?.snapshot_date ?? snapshot?.created_at ?? task.updated_at ?? task.created_at)
      if (!Number.isFinite(referenceAt)) return true
      return diffDays(referenceAt, Date.now()) >= 7
    }).length

    const updatedTaskIds = new Set(
      snapshots
        .filter((snapshot) => {
          const snapshotAt = toTimestamp(snapshot.snapshot_date ?? snapshot.created_at)
          return snapshotAt >= monthRange.start.getTime() && snapshotAt < monthRange.end.getTime()
        })
        .map((snapshot) => snapshot.task_id),
    )

    const anomalyTaskIds = new Set(
      findings
        .filter((finding) => finding.status === 'active' && finding.rule_type === 'anomaly' && finding.task_id)
        .map((finding) => String(finding.task_id)),
    )
    const crossCheckTaskIds = new Set(
      findings
        .filter((finding) => finding.status === 'active' && finding.rule_type === 'cross_check' && finding.task_id)
        .map((finding) => String(finding.task_id)),
    )
    const jumpTaskIds = new Set(
      findings
        .filter((finding) => finding.status === 'active' && [
          'PROGRESS_JUMP',
          'PROGRESS_MONTH_END_BURST',
          'PROGRESS_STUCK_FINISHING',
          'PROGRESS_SOURCE_LOW_CONFIDENCE',
          'PROGRESS_ROLLBACK',
          'PROGRESS_DUPLICATE_FILL',
        ].includes(finding.rule_code) && finding.task_id)
        .map((finding) => String(finding.task_id)),
    )

    const denominator = Math.max(taskIds.length, 1)
    const timelinessScore = roundScore(clamp((1 - staleTaskCount / denominator) * 100))
    const anomalyScore = roundScore(clamp((1 - anomalyTaskIds.size / denominator) * 100))
    const consistencyScore = roundScore(clamp((1 - crossCheckTaskIds.size / denominator) * 100))
    const coverageScore = roundScore(clamp((updatedTaskIds.size / denominator) * 100))
    const jumpinessScore = roundScore(clamp((1 - jumpTaskIds.size / denominator) * 100))
    const dimensions = buildConfidenceDimensions(
      {
        timeliness: timelinessScore,
        anomaly: anomalyScore,
        consistency: consistencyScore,
        coverage: coverageScore,
        jumpiness: jumpinessScore,
      },
      weights,
    )

    const score = roundScore(
      timelinessScore * weights.timeliness
      + anomalyScore * weights.anomaly
      + consistencyScore * weights.consistency
      + coverageScore * weights.coverage
      + jumpinessScore * weights.jumpiness,
    )

    return {
      score,
      flag: getConfidenceFlag(score),
      note: getConfidenceNote(score),
      timelinessScore,
      anomalyScore,
      consistencyScore,
      coverageScore,
      jumpinessScore,
      activeFindingCount: findings.filter((finding) => finding.status === 'active').length,
      trendWarningCount: findings.filter((finding) => finding.status === 'active' && finding.rule_type === 'trend').length,
      anomalyFindingCount: findings.filter((finding) => finding.status === 'active' && finding.rule_type === 'anomaly').length,
      crossCheckFindingCount: findings.filter((finding) => finding.status === 'active' && finding.rule_type === 'cross_check').length,
      weights,
      dimensions,
    }
  }

  async getProjectSettings(projectId: string): Promise<DataQualityProjectSettingsSummary> {
    const cached = dataQualitySettingsCache.get(projectId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.summary
    }

    if (process.env.NODE_ENV !== 'test') {
      try {
        const result = await rawQuery(
          'SELECT project_id, weights_json, updated_at, updated_by FROM public.project_data_quality_settings WHERE project_id = $1 LIMIT 1',
          [projectId],
        )
        const summary = toProjectSettingsSummary(projectId, (result.rows[0] as ProjectDataQualitySettings | undefined) ?? null)
        dataQualitySettingsCache.set(projectId, {
          expiresAt: Date.now() + DATA_QUALITY_SETTINGS_CACHE_TTL_MS,
          summary,
        })
        return summary
      } catch (error) {
        logger.warn('[dataQualityService] direct settings read failed, falling back to Supabase REST', {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const { data, error } = await supabase
      .from('project_data_quality_settings')
      .select('project_id, weights_json, updated_at, updated_by')
      .eq('project_id', projectId)
      .limit(1)

    if (error) throw new Error(error.message)

    const row = ((data ?? [])[0] ?? null) as ProjectDataQualitySettings | null
    const summary = toProjectSettingsSummary(projectId, row)
    dataQualitySettingsCache.set(projectId, {
      expiresAt: Date.now() + DATA_QUALITY_SETTINGS_CACHE_TTL_MS,
      summary,
    })
    return summary
  }

  async updateProjectSettings(
    projectId: string,
    weights: Partial<Record<DataQualityWeightKey, unknown>>,
    updatedBy?: string | null,
  ): Promise<DataQualityProjectSettingsSummary> {
    const normalizedWeights = normalizeWeights(weights)
    const payload = {
      project_id: projectId,
      weights_json: normalizedWeights,
      updated_at: nowIso(),
      updated_by: updatedBy ?? null,
    }

    const { data, error } = await supabase
      .from('project_data_quality_settings')
      .upsert(payload, { onConflict: 'project_id' })
      .select('project_id, weights_json, updated_at, updated_by')
      .single()

    if (error) throw new Error(error.message)

    const summary = toProjectSettingsSummary(projectId, data as ProjectDataQualitySettings)
    dataQualitySettingsCache.set(projectId, {
      expiresAt: Date.now() + DATA_QUALITY_SETTINGS_CACHE_TTL_MS,
      summary,
    })
    return summary
  }

  private async getOwnerRecipients(projectId: string) {
    const [project, members] = await Promise.all([
      executeSQL<ProjectOwnerRow>('SELECT id, owner_id FROM projects WHERE id = ? LIMIT 1', [projectId]),
      executeSQL<ProjectMemberRow>('SELECT project_id, user_id, permission_level FROM project_members WHERE project_id = ?', [projectId]),
    ])

    return uniqueStrings([
      project[0]?.owner_id ?? null,
      ...(members ?? [])
        .filter((member) => normalizeProjectPermissionLevel(member.permission_level) === 'owner')
        .map((member) => member.user_id),
    ])
  }

  private async syncOwnerDigestNotification(projectId: string, digest: DataQualityOwnerDigest) {
    const recipients = await this.getOwnerRecipients(projectId)
    const existing = await listNotifications({ projectId, sourceEntityType: 'data_quality_digest' })
    const activeExisting = existing.filter((item) => String(item.status ?? '').trim().toLowerCase() !== 'resolved')

    if (!digest.shouldNotify || recipients.length === 0) {
      await Promise.all(
        activeExisting.map((notification) => updateNotificationById(notification.id, {
          status: 'resolved',
          resolved_at: nowIso(),
        }, notification)),
      )
      return null
    }

    const sourceEntityId = `${projectId}:${digest.scopeLabel ?? 'project'}`
    const current = activeExisting.find((item) => item.source_entity_id === sourceEntityId)
    const payload: Notification = {
      id: current?.id ?? '',
      project_id: projectId,
      type: 'data_quality_digest',
      notification_type: 'data_quality_digest',
      severity: digest.severity,
      level: digest.severity,
      title: '数据质量聚合提醒',
      content: digest.summary,
      is_read: current?.is_read ?? false,
      source_entity_type: 'data_quality_digest',
      source_entity_id: sourceEntityId,
      category: 'data_quality',
      recipients,
      status: current?.status ?? 'unread',
      metadata: {
        scope_label: digest.scopeLabel,
        finding_count: digest.findingCount,
      },
      created_at: current?.created_at ?? nowIso(),
      updated_at: nowIso(),
    }

    if (current) {
      await updateNotificationById(current.id, {
        title: payload.title,
        content: payload.content,
        severity: payload.severity,
        level: payload.level,
        metadata: payload.metadata,
        recipients: payload.recipients,
        status: payload.status,
      }, current)
    } else {
      await notificationTouchpointService.emit({
        ...payload,
        notification_type: 'system-exception',
        touchpoint_type: 'system_record',
        scope_type: 'project',
        dedupe_key: String(payload.source_entity_id ?? ''),
        target_route: `/projects/${projectId}/dashboard`,
        target_label: '查看数据质量',
      })
    }

    await Promise.all(
      activeExisting
        .filter((notification) => notification.source_entity_id !== sourceEntityId)
        .map((notification) => updateNotificationById(notification.id, {
          status: 'resolved',
          resolved_at: nowIso(),
        }, notification)),
    )

    return payload
  }

  private async syncCriticalPathFindingNotifications(projectId: string, findings: DataQualityFinding[]) {
    const recipients = await this.getOwnerRecipients(projectId)
    const existing = await listNotifications({ projectId, sourceEntityType: 'data_quality_critical_path' })
    const activeExisting = existing.filter((item) => String(item.status ?? '').trim().toLowerCase() !== 'resolved')
    const activeFindings = findings.filter((finding) => {
      if (finding.status !== 'active' || !finding.task_id) return false
      const isCriticalTask = Boolean(finding.details_json?.is_critical_task)
      return isCriticalTask && severityRank(finding.severity) >= severityRank('warning')
    })

    const activeIds = new Set<string>()
    for (const finding of activeFindings) {
      const sourceEntityId = `${finding.rule_code}:${finding.task_id}`
      activeIds.add(sourceEntityId)
      const current = activeExisting.find((item) => item.source_entity_id === sourceEntityId)
      const payload: Notification = {
        id: current?.id ?? '',
        project_id: projectId,
        task_id: finding.task_id ?? null,
        type: 'data_quality_critical_path',
        notification_type: 'data_quality_critical_path',
        severity: finding.severity,
        level: finding.severity,
        title: '关键路径任务命中数据异常',
        content: finding.summary,
        is_read: current?.is_read ?? false,
        source_entity_type: 'data_quality_critical_path',
        source_entity_id: sourceEntityId,
        category: 'data_quality',
        recipients,
        status: current?.status ?? 'unread',
        metadata: finding.details_json ?? {},
        created_at: current?.created_at ?? nowIso(),
        updated_at: nowIso(),
      }

      if (current) {
        await updateNotificationById(current.id, {
          title: payload.title,
          content: payload.content,
          severity: payload.severity,
          level: payload.level,
          metadata: payload.metadata,
          task_id: payload.task_id,
          recipients: payload.recipients,
          status: payload.status,
        }, current)
      } else if (recipients.length > 0) {
        await notificationTouchpointService.emit({
          ...payload,
          notification_type: 'system-exception',
          touchpoint_type: 'system_record',
          scope_type: 'project',
          dedupe_key: String(payload.source_entity_id ?? ''),
          target_route: `/projects/${projectId}/dashboard`,
          target_label: '查看数据质量',
        })
      }
    }

    await Promise.all(
      activeExisting
        .filter((notification) => !activeIds.has(String(notification.source_entity_id ?? '')))
        .map((notification) => updateNotificationById(notification.id, {
          status: 'resolved',
          resolved_at: nowIso(),
        }, notification)),
    )
  }

  private async persistFindings(
    projectId: string,
    nextFindings: DataQualityFindingDraft[],
    options?: { unresolvedRuleCodes?: Set<FindingRuleCode> },
  ) {
    if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
      return persistDataQualityFindingsDirect({
        projectId,
        nextFindings,
        unresolvedRuleCodes: options?.unresolvedRuleCodes,
      })
    }

    const { data, error } = await supabase
      .from('data_quality_findings')
      .select('*')
      .eq('project_id', projectId)

    if (error) throw new Error(error.message)

    const existing = (data ?? []) as DataQualityFinding[]
    const existingByKey = new Map(existing.map((finding) => [finding.finding_key, finding]))
    const detectedAt = nowIso()
    const activeKeys = new Set(nextFindings.map((finding) => finding.finding_key))

    const upsertPayload = nextFindings.map((finding) => {
      const current = existingByKey.get(finding.finding_key)
      return {
        id: current?.id ?? uuidv4(),
        finding_key: finding.finding_key,
        project_id: finding.project_id,
        task_id: finding.task_id ?? null,
        rule_code: finding.rule_code,
        rule_type: finding.rule_type,
        severity: finding.severity,
        dimension_key: finding.dimension_key ?? null,
        summary: finding.summary,
        details_json: finding.details_json,
        detected_at: current?.detected_at ?? detectedAt,
        resolved_at: null,
        status: 'active',
        // v1.4.16: new fields
        entity_type: finding.entity_type ?? 'task',
        entity_id: finding.entity_id ?? (finding.task_id ?? null),
        quality_dimension: finding.quality_dimension ?? getDataQualityRuleDimension(finding.rule_code),
        source_type: finding.source_type ?? null,
        resolved_type: null,
      }
    })

    if (upsertPayload.length > 0) {
      const { error: upsertError } = await supabase
        .from('data_quality_findings')
        .upsert(upsertPayload, { onConflict: 'finding_key' })

      if (upsertError) throw new Error(upsertError.message)
    }

    const staleIds = existing
      .filter((finding) => finding.status === 'active' && !activeKeys.has(finding.finding_key))
      .filter((finding) => !options?.unresolvedRuleCodes?.has(finding.rule_code as FindingRuleCode))
      .map((finding) => finding.id)

    if (staleIds.length > 0) {
      const { error: resolveError } = await supabase
        .from('data_quality_findings')
        .update({
          status: 'resolved',
          resolved_at: detectedAt,
        })
        .eq('project_id', projectId)
        .in('id', staleIds)

      if (resolveError) throw new Error(resolveError.message)
    }

    const { data: persistedRows, error: persistedError } = await supabase
      .from('data_quality_findings')
      .select('*')
      .eq('project_id', projectId)
      .order('detected_at', { ascending: false })

    if (persistedError) throw new Error(persistedError.message)
    return (persistedRows ?? []) as DataQualityFinding[]
  }

  private async persistConfidence(projectId: string, month: string, confidence: DataQualityConfidence) {
    const payload = {
      project_id: projectId,
      period_month: month,
      confidence_score: confidence.score,
      timeliness_score: confidence.timelinessScore,
      anomaly_score: confidence.anomalyScore,
      consistency_score: confidence.consistencyScore,
      coverage_score: confidence.coverageScore,
      jumpiness_score: confidence.jumpinessScore,
      weights_json: confidence.weights,
      details_json: {
        note: confidence.note,
        flag: confidence.flag,
        active_finding_count: confidence.activeFindingCount,
        trend_warning_count: confidence.trendWarningCount,
        anomaly_finding_count: confidence.anomalyFindingCount,
        cross_check_finding_count: confidence.crossCheckFindingCount,
        dimension_breakdown: confidence.dimensions,
      },
      computed_at: nowIso(),
    }

    if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
      const result = await rawQuery(
        `INSERT INTO public.data_confidence_snapshots (
           project_id, period_month, confidence_score, timeliness_score,
           anomaly_score, consistency_score, coverage_score, jumpiness_score,
           weights_json, details_json, computed_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::timestamptz
         )
         ON CONFLICT (project_id, period_month) DO UPDATE
           SET confidence_score = EXCLUDED.confidence_score,
               timeliness_score = EXCLUDED.timeliness_score,
               anomaly_score = EXCLUDED.anomaly_score,
               consistency_score = EXCLUDED.consistency_score,
               coverage_score = EXCLUDED.coverage_score,
               jumpiness_score = EXCLUDED.jumpiness_score,
               weights_json = EXCLUDED.weights_json,
               details_json = EXCLUDED.details_json,
               computed_at = EXCLUDED.computed_at
         RETURNING *`,
        [
          payload.project_id,
          payload.period_month,
          payload.confidence_score,
          payload.timeliness_score,
          payload.anomaly_score,
          payload.consistency_score,
          payload.coverage_score,
          payload.jumpiness_score,
          JSON.stringify(payload.weights_json),
          JSON.stringify(payload.details_json),
          payload.computed_at,
        ],
      )
      return result.rows[0] as DataConfidenceSnapshot
    }

    const { data, error } = await supabase
      .from('data_confidence_snapshots')
      .upsert(payload, { onConflict: 'project_id,period_month' })
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return data as DataConfidenceSnapshot
  }

  private async scanProject(projectId: string, month = normalizeMonth()) {
    const {
      tasks,
      conditions,
      snapshots,
      lineageLinks,
      acceptancePlans,
      materials,
      retentionEvents,
      metricSnapshots,
      sourceReadStatus,
    } = await this.loadProjectData(projectId)
    const latestSnapshots = getLatestSnapshotMap(snapshots)
    const snapshotsByTask = getSnapshotsByTask(snapshots)

    const [
      trendFindings,
      snapshotGapFindings,
      progressJumpFindings,
      progressTimeMismatchFindings,
      batchSameValueFindings,
      crossCheckFindings,
      governanceFindings,
      materialFindings,
      retentionFindings,
      metricCaliberFindings,
    ] = await Promise.all([
      this.detectTrendFindings(projectId, tasks),
      this.detectSnapshotGapFindings(projectId, tasks, latestSnapshots),
      this.detectProgressJumpFindings(projectId, tasks, snapshotsByTask),
      this.detectProgressTimeMismatchFindings(projectId, tasks),
      Promise.resolve(this.detectBatchSameValueFindings(projectId, tasks, latestSnapshots)),
      this.detectCrossCheckFindings(projectId, tasks, conditions),
      this.detectGovernanceFindings(projectId, tasks, lineageLinks, acceptancePlans),
      Promise.resolve(this.detectMaterialFindings(projectId, materials)),
      Promise.resolve(this.detectRetentionFindings(projectId, retentionEvents)),
      Promise.resolve(this.detectMetricCaliberFindings(projectId, metricSnapshots)),
    ])

    const drafts = this.dedupeFindings([
      ...trendFindings,
      ...snapshotGapFindings,
      ...progressJumpFindings,
      ...progressTimeMismatchFindings,
      ...batchSameValueFindings,
      ...crossCheckFindings,
      ...governanceFindings,
      ...materialFindings,
      ...retentionFindings,
      ...metricCaliberFindings,
    ])

    const taskTitleById = new Map(tasks.map((task) => [task.id, task.title]))
    return { tasks, snapshots, taskTitleById, findings: drafts, month, sourceReadStatus }
  }

  async scanTrendWarnings(projectId?: string) {
    const projectIds = projectId
      ? [projectId]
      : await listActiveProjectIds()

    const warnings: Array<{
      id: string
      project_id: string
      task_id?: string | null
      warning_type: string
      warning_level: 'info' | 'warning' | 'critical'
      title: string
      description: string
      is_acknowledged: boolean
      created_at: string
    }> = []

    for (const currentProjectId of projectIds) {
      const result = await this.scanProject(currentProjectId)
      const trendNotifications = buildTrendWarningsFromFindings(
        result.findings.map((finding) => toFindingRow(finding, nowIso())),
      ).filter((item) => Boolean((item.metadata as Record<string, unknown> | null | undefined)?.is_critical_task))

      warnings.push(
        ...trendNotifications.map((item) => ({
          id: item.id || item.source_entity_id || `${item.project_id}:${item.task_id}`,
          project_id: item.project_id ?? currentProjectId,
          task_id: item.task_id ?? null,
          warning_type: 'progress_trend_delay',
          warning_level: (item.severity as 'info' | 'warning' | 'critical') ?? 'warning',
          title: item.title,
          description: item.content,
          is_acknowledged: false,
          created_at: item.created_at ?? nowIso(),
        })),
      )
    }

    return warnings
  }

  async previewTaskLiveCheck(
    projectId: string,
    draft: Partial<Task> | null | undefined,
    existingTaskId?: string | null,
  ): Promise<DataQualityLiveCheckSummary> {
    const { tasks, conditions } = await this.loadProjectData(projectId)
    const currentTaskId = String(draft?.id ?? existingTaskId ?? '').trim()
    const baseTask = currentTaskId ? tasks.find((task) => task.id === currentTaskId) ?? null : null
    const previewTaskId = currentTaskId || `preview-task-${projectId}`
    const previewTask = buildTaskPreview(projectId, previewTaskId, draft, baseTask)
    const previewTasks = baseTask
      ? tasks.map((task) => (task.id === previewTaskId ? previewTask : task))
      : [...tasks, previewTask]

    const findings = this.dedupeFindings(await this.detectCrossCheckFindings(projectId, previewTasks, conditions))
      .map((finding) => toFindingRow(finding, nowIso()))
      .filter((finding) => finding.status === 'active' && findingRelatesToTask(finding, previewTaskId))

    const taskTitleById = new Map(previewTasks.map((task) => [task.id, task.title]))
    return buildPrompt(findings, taskTitleById)
  }

  async buildProjectSummary(projectId: string, month = normalizeMonth()): Promise<DataQualityProjectSummary> {
    const [result, settings] = await Promise.all([
      this.scanProject(projectId, month),
      this.getProjectSettings(projectId),
    ])
    const findings = result.findings.map((finding) => toFindingRow(finding, nowIso()))
    const confidence = this.computeConfidence(result.month, result.tasks, result.snapshots, findings, settings.weights)
    // v1.4.16: enrich with extended quality dimensions from governance service
    const extendedSummary = await buildProjectQualitySummary(projectId).catch(() => null)
    return {
      projectId,
      month: result.month,
      confidence,
      extendedDimensions: extendedSummary?.dimensions ?? [],
      extendedConfidenceScore: extendedSummary?.confidenceScore,
      extendedRules: listDataQualityRuleCodes(),
      prompt: buildPrompt(findings, result.taskTitleById),
      ownerDigest: buildOwnerDigest(findings),
      findings,
    }
  }

  async syncProjectDataQuality(projectId: string, month = normalizeMonth()): Promise<DataQualityProjectSummary> {
    const [result, settings] = await Promise.all([
      this.scanProject(projectId, month),
      this.getProjectSettings(projectId),
    ])
    const persistedFindings = await this.persistFindings(projectId, result.findings, {
      unresolvedRuleCodes: collectUnresolvedRuleCodesForFailedSources(result.sourceReadStatus),
    })
    const confidence = this.computeConfidence(result.month, result.tasks, result.snapshots, persistedFindings, settings.weights)
    await this.persistConfidence(projectId, result.month, confidence)
    const ownerDigest = buildOwnerDigest(persistedFindings)
    await this.syncOwnerDigestNotification(projectId, ownerDigest)
    await this.syncCriticalPathFindingNotifications(projectId, persistedFindings)
    const extendedSummary = await buildProjectQualitySummary(projectId).catch(() => null)

    return {
      projectId,
      month: result.month,
      confidence,
      extendedDimensions: extendedSummary?.dimensions ?? [],
      extendedConfidenceScore: extendedSummary?.confidenceScore,
      extendedRules: listDataQualityRuleCodes(),
      prompt: buildPrompt(persistedFindings, result.taskTitleById),
      ownerDigest,
      findings: persistedFindings,
    }
  }

  async syncAllProjectsDataQuality(month = normalizeMonth(), projectIds?: string[] | null) {
    const activeProjectIds = await listActiveProjectIds(projectIds)
    const reports: DataQualityProjectSummary[] = []
    const failures: Array<{ scopeId: string; attempts: number; errorMessage: string }> = []
    for (const projectId of activeProjectIds) {
      try {
        reports.push(await this.syncProjectDataQuality(projectId, month))
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        failures.push({ scopeId: projectId, attempts: 1, errorMessage })
        logger.warn('[dataQualityService] failed to sync project data quality', {
          projectId,
          error: errorMessage,
        })
      }
    }
    if (failures.length > 0) {
      throw new ScopedBatchOperationError(
        'data quality project sync',
        failures,
        reports.map((report) => report.projectId),
      )
    }
    return reports
  }
}

export const dataQualityService = new DataQualityService()
