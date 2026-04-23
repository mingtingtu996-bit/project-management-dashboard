import { v4 as uuidv4 } from 'uuid'
import { normalizeProjectPermissionLevel } from '../auth/access.js'
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
import {
  insertNotification,
  listNotifications,
  updateNotificationById,
} from './notificationStore.js'

const DAY_MS = 24 * 60 * 60 * 1000
const DATA_CONFIDENCE_LOW_THRESHOLD = 70
const DATA_CONFIDENCE_MEDIUM_THRESHOLD = 85

const DATA_QUALITY_WEIGHT_KEYS = ['timeliness', 'anomaly', 'consistency', 'jumpiness', 'coverage'] as const

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
type FindingRuleType = 'trend' | 'anomaly' | 'cross_check'
type ConfidenceFlag = 'high' | 'medium' | 'low'

type FindingRuleCode =
  | 'TREND_DELAY'
  | 'SNAPSHOT_GAP'
  | 'PROGRESS_JUMP'
  | 'PROGRESS_TIME_MISMATCH'
  | 'BATCH_SAME_VALUE'
  | 'PARENT_CHILD_INCONSISTENT'
  | 'DEPENDENCY_INCONSISTENT'
  | 'MILESTONE_PREDECESSOR_INCONSISTENT'
  | 'CONDITION_UNSATISFIED_STARTED'
  | 'ASSIGNEE_WORKLOAD_ABNORMAL'

type DataQualityFindingDraft = Omit<DataQualityFinding, 'id' | 'detected_at' | 'resolved_at' | 'status'> & {
  details_json: Record<string, unknown>
}

type ProjectMemberRow = {
  project_id: string
  user_id: string
  role?: string | null
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
  key: DataQualityWeightKey
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
}

export interface DataQualityLiveCheckSummary {
  count: number
  summary: string
  items: DataQualityPromptItem[]
}

function nowIso() {
  return new Date().toISOString()
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

function diffDays(startAt: number, endAt: number) {
  return Math.max(0, Math.ceil((endAt - startAt) / DAY_MS))
}

function isCompletedTask(task: Partial<Task>) {
  const status = String(task.status ?? '').trim().toLowerCase()
  return status === 'completed' || status === 'done' || status === '已完成' || Number(task.progress ?? 0) >= 100
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

function isInProgressTask(task: Partial<Task>) {
  const status = String(task.status ?? '').trim().toLowerCase()
  return (
    status === 'in_progress' ||
    status === 'active' ||
    status === '进行中' ||
    (Number(task.progress ?? 0) > 0 && Number(task.progress ?? 0) < 100)
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
    return '数据质量存在波动，建议结合现场复核'
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
  }
}

function buildRecommendation(ruleCode: FindingRuleCode) {
  switch (ruleCode) {
    case 'TREND_DELAY':
      return '优先核对计划工期、现场完成量和剩余工期，必要时提前调整资源。'
    case 'SNAPSHOT_GAP':
      return '请尽快补录最近一次进度，避免后续分析失真。'
    case 'PROGRESS_JUMP':
      return '请核对最近两次进度填报依据，确认是否存在突击补填。'
    case 'PROGRESS_TIME_MISMATCH':
      return '请复核计划工期与当前进度是否匹配，避免整体判断失真。'
    case 'BATCH_SAME_VALUE':
      return '请核对同批任务是否被粗填为相同进度，必要时逐条修正。'
    case 'PARENT_CHILD_INCONSISTENT':
      return '请先补齐子项状态，再同步父级完成情况。'
    case 'DEPENDENCY_INCONSISTENT':
      return '请核对前置任务完成情况和当前任务开工时间。'
    case 'MILESTONE_PREDECESSOR_INCONSISTENT':
      return '请确认关键节点是否已满足前置任务条件，再决定是否保留完成状态。'
    case 'CONDITION_UNSATISFIED_STARTED':
      return '请先确认开工条件，再继续更新任务进度。'
    case 'ASSIGNEE_WORKLOAD_ABNORMAL':
      return '请核查责任人同时承担的在途任务量，必要时调整责任分配。'
    default:
      return '请核对当前数据并根据现场情况修正。'
  }
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
      summary: `当前共有 ${activeFindings.length} 条${summaryLabel}，但尚未达到聚合推送阈值。`,
    }
  }

  return {
    shouldNotify: true,
    severity: topCluster.severity,
    scopeLabel: topCluster.label,
    findingCount: topCluster.count,
    summary: `当前“${topCluster.label}”相关任务出现 ${topCluster.count} 条${summaryLabel}，建议优先安排现场核验。`,
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
    assignee_unit: typeof draft?.assignee_unit === 'string'
      ? draft.assignee_unit
      : typeof draft?.responsible_unit === 'string'
        ? draft.responsible_unit
        : baseTask?.assignee_unit,
    parent_task_id: draft?.parent_task_id ?? baseTask?.parent_task_id,
    dependencies: Array.isArray(draft?.dependencies)
      ? draft.dependencies.map((item) => String(item))
      : Array.isArray(baseTask?.dependencies)
        ? baseTask.dependencies
        : [],
    milestone_id: draft?.milestone_id ?? baseTask?.milestone_id,
    wbs_level: draft?.wbs_level ?? baseTask?.wbs_level,
    wbs_code: draft?.wbs_code ?? baseTask?.wbs_code,
    sort_order: draft?.sort_order ?? baseTask?.sort_order,
    is_milestone: typeof draft?.is_milestone === 'boolean' ? draft.is_milestone : baseTask?.is_milestone,
    milestone_level: draft?.milestone_level ?? baseTask?.milestone_level,
    milestone_order: draft?.milestone_order ?? baseTask?.milestone_order,
    task_type: draft?.task_type ?? baseTask?.task_type,
    phase_id: draft?.phase_id ?? baseTask?.phase_id,
    task_source: draft?.task_source ?? baseTask?.task_source,
    is_critical: typeof draft?.is_critical === 'boolean' ? draft.is_critical : baseTask?.is_critical,
    parent_id: draft?.parent_id ?? draft?.parent_task_id ?? baseTask?.parent_id ?? baseTask?.parent_task_id ?? null,
    specialty_type: draft?.specialty_type ?? baseTask?.specialty_type,
    reference_duration: draft?.reference_duration ?? baseTask?.reference_duration,
    ai_duration: draft?.ai_duration ?? baseTask?.ai_duration,
    first_progress_at: draft?.first_progress_at ?? baseTask?.first_progress_at,
    delay_reason: draft?.delay_reason ?? baseTask?.delay_reason,
    assignee_user_id: draft?.assignee_user_id ?? baseTask?.assignee_user_id ?? null,
    assignee_name: typeof draft?.assignee_name === 'string'
      ? draft.assignee_name
      : typeof draft?.assignee === 'string'
        ? draft.assignee
        : baseTask?.assignee_name ?? baseTask?.assignee,
    responsible_unit: typeof draft?.responsible_unit === 'string'
      ? draft.responsible_unit
      : typeof draft?.assignee_unit === 'string'
        ? draft.assignee_unit
        : baseTask?.responsible_unit ?? baseTask?.assignee_unit,
    baseline_item_id: draft?.baseline_item_id ?? baseTask?.baseline_item_id,
    monthly_plan_item_id: draft?.monthly_plan_item_id ?? baseTask?.monthly_plan_item_id,
    participant_unit_id: draft?.participant_unit_id ?? baseTask?.participant_unit_id,
    participant_unit_name: typeof draft?.participant_unit_name === 'string'
      ? draft.participant_unit_name
      : typeof draft?.responsible_unit === 'string'
        ? draft.responsible_unit
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

export class DataQualityService {
  private async loadProjectData(projectId: string) {
    const tasks = await executeSQL<Task>('SELECT * FROM tasks WHERE project_id = ?', [projectId])
    const taskIds = tasks.map((task) => task.id)
    const [conditions, snapshots] = await Promise.all([
      executeSQL<TaskCondition>('SELECT * FROM task_conditions WHERE project_id = ?', [projectId]),
      listTaskProgressSnapshotsByTaskIds(taskIds),
    ])

    return { tasks, conditions, snapshots }
  }

  private detectTrendFindings(projectId: string, tasks: Task[]): DataQualityFindingDraft[] {
    const nowAt = Date.now()
    const findings: DataQualityFindingDraft[] = []

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
      const focusThreshold = task.is_critical ? 0.8 : 0.7

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
        summary: `任务“${task.title}”当前进度 ${Number(task.progress ?? 0)}%，时间已消耗 ${Math.round(timeConsumedRate * 100)}%，存在明显滞后趋势。`,
        details_json: {
          task_id: task.id,
          task_title: task.title,
          deviation_ratio: roundScore(deviationRatio),
          progress_rate: roundScore(progressRate),
          time_consumed_rate: roundScore(timeConsumedRate),
          remaining_days: remainingDays,
          is_critical_task: Boolean(task.is_critical),
          assignee_name: task.assignee_name ?? task.assignee ?? null,
          participant_unit_name: task.participant_unit_name ?? task.assignee_unit ?? null,
        },
      })
    }

    return findings
  }

  private detectSnapshotGapFindings(projectId: string, tasks: Task[], latestSnapshots: Map<string, TaskProgressSnapshot>): DataQualityFindingDraft[] {
    const nowAt = Date.now()
    const findings: DataQualityFindingDraft[] = []

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
      findings.push({
        finding_key: buildFindingKey('SNAPSHOT_GAP', task.id),
        project_id: projectId,
        task_id: task.id,
        rule_code: 'SNAPSHOT_GAP',
        rule_type: 'anomaly',
        severity,
        dimension_key: `task:${task.id}`,
        summary: `任务“${task.title}”最近 ${gapDays} 天没有新的进度快照，请尽快补录。`,
        details_json: {
          task_id: task.id,
          task_title: task.title,
          gap_days: gapDays,
          latest_snapshot_date: latestSnapshot?.snapshot_date ?? latestSnapshot?.created_at ?? null,
          assignee_name: task.assignee_name ?? task.assignee ?? null,
          participant_unit_name: task.participant_unit_name ?? task.assignee_unit ?? null,
          is_critical_task: Boolean(task.is_critical),
        },
      })
    }

    return findings
  }

  private detectProgressJumpFindings(projectId: string, tasks: Task[], snapshotsByTask: Map<string, TaskProgressSnapshot[]>): DataQualityFindingDraft[] {
    const findings: DataQualityFindingDraft[] = []

    for (const task of tasks) {
      const snapshots = snapshotsByTask.get(task.id) ?? []
      if (snapshots.length < 2) continue

      const latest = snapshots[0]
      const previous = snapshots[1]
      const latestAt = toTimestamp(latest.snapshot_date ?? latest.created_at)
      const previousAt = toTimestamp(previous.snapshot_date ?? previous.created_at)
      if (!Number.isFinite(latestAt) || !Number.isFinite(previousAt) || latestAt <= previousAt) continue

      const progressDelta = Number(latest.progress ?? 0) - Number(previous.progress ?? 0)
      const daysBetween = Math.max(1, diffDays(previousAt, latestAt))
      if (progressDelta < 40) continue

      const severity: FindingSeverity = progressDelta >= 60 || daysBetween <= 1 ? 'critical' : 'warning'
      findings.push({
        finding_key: buildFindingKey('PROGRESS_JUMP', task.id),
        project_id: projectId,
        task_id: task.id,
        rule_code: 'PROGRESS_JUMP',
        rule_type: 'anomaly',
        severity,
        dimension_key: `task:${task.id}`,
        summary: `任务“${task.title}”在 ${daysBetween} 天内进度跳变 ${progressDelta}%，请核对填报依据。`,
        details_json: {
          task_id: task.id,
          task_title: task.title,
          progress_delta: progressDelta,
          days_between: daysBetween,
          latest_progress: latest.progress,
          previous_progress: previous.progress,
          assignee_name: task.assignee_name ?? task.assignee ?? null,
          participant_unit_name: task.participant_unit_name ?? task.assignee_unit ?? null,
          is_critical_task: Boolean(task.is_critical),
        },
      })
    }

    return findings
  }

  private detectProgressTimeMismatchFindings(projectId: string, tasks: Task[]): DataQualityFindingDraft[] {
    const nowAt = Date.now()
    const findings: DataQualityFindingDraft[] = []

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

      findings.push({
        finding_key: buildFindingKey('PROGRESS_TIME_MISMATCH', task.id),
        project_id: projectId,
        task_id: task.id,
        rule_code: 'PROGRESS_TIME_MISMATCH',
        rule_type: 'anomaly',
        severity,
        dimension_key: `task:${task.id}`,
        summary: `任务“${task.title}”的工期消耗与当前进度明显不匹配，请复核填报真实性。`,
        details_json: {
          task_id: task.id,
          task_title: task.title,
          elapsed_rate: roundScore(elapsedRate),
          progress_rate: roundScore(progressRate),
          assignee_name: task.assignee_name ?? task.assignee ?? null,
          participant_unit_name: task.participant_unit_name ?? task.assignee_unit ?? null,
          is_critical_task: Boolean(task.is_critical),
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
        summary: `责任人“${assigneeName}”在同一天将 ${groupedTasks.length} 条任务更新为相同进度，存在批量粗填风险。`,
        details_json: {
          assignee_name: assigneeName,
          task_ids: taskIds,
          task_titles: groupedTasks.map((task) => task.title),
          progress_value: Number(groupedTasks[0]?.progress ?? 0),
          participant_unit_name: groupedTasks[0]?.participant_unit_name ?? groupedTasks[0]?.assignee_unit ?? null,
        },
      })
    }

    return findings
  }

  private detectParentChildFindings(projectId: string, tasks: Task[]): DataQualityFindingDraft[] {
    const findings: DataQualityFindingDraft[] = []
    const childrenByParent = new Map<string, Task[]>()

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
        findings.push({
          finding_key: buildFindingKey('PARENT_CHILD_INCONSISTENT', task.id),
          project_id: projectId,
          task_id: task.id,
          rule_code: 'PARENT_CHILD_INCONSISTENT',
          rule_type: 'cross_check',
          severity: 'critical',
          dimension_key: `task:${task.id}`,
          summary: `任务“${task.title}”已标记完成，但仍有 ${unfinishedChildren.length} 个子项未完成。`,
          details_json: {
            task_id: task.id,
            task_title: task.title,
            child_task_ids: unfinishedChildren.map((child) => child.id),
            child_task_titles: unfinishedChildren.map((child) => child.title),
            assignee_name: task.assignee_name ?? task.assignee ?? null,
            participant_unit_name: task.participant_unit_name ?? task.assignee_unit ?? null,
            is_critical_task: Boolean(task.is_critical),
          },
        })
      }
    }

    return findings
  }

  private detectDependencyFindings(projectId: string, tasks: Task[]): DataQualityFindingDraft[] {
    const findings: DataQualityFindingDraft[] = []
    const taskMap = new Map(tasks.map((task) => [task.id, task]))

    for (const task of tasks) {
      const dependencyIds = Array.isArray(task.dependencies) ? task.dependencies : []
      if (dependencyIds.length === 0 || !isStartedTask(task)) continue

      const blockedBy = dependencyIds
        .map((dependencyId) => taskMap.get(dependencyId))
        .filter((dependency): dependency is Task => Boolean(dependency) && !isCompletedTask(dependency))

      if (blockedBy.length === 0) continue

      findings.push({
        finding_key: buildFindingKey('DEPENDENCY_INCONSISTENT', task.id),
        project_id: projectId,
        task_id: task.id,
        rule_code: 'DEPENDENCY_INCONSISTENT',
        rule_type: 'cross_check',
        severity: task.is_critical ? 'critical' : 'warning',
        dimension_key: `task:${task.id}`,
        summary: `任务“${task.title}”已开始，但前置任务仍有 ${blockedBy.length} 项未完成。`,
        details_json: {
          task_id: task.id,
          task_title: task.title,
          dependency_task_ids: blockedBy.map((dependency) => dependency.id),
          dependency_task_titles: blockedBy.map((dependency) => dependency.title),
          assignee_name: task.assignee_name ?? task.assignee ?? null,
          participant_unit_name: task.participant_unit_name ?? task.assignee_unit ?? null,
          is_critical_task: Boolean(task.is_critical),
        },
      })
    }

    return findings
  }

  private detectMilestonePredecessorFindings(projectId: string, tasks: Task[]): DataQualityFindingDraft[] {
    const findings: DataQualityFindingDraft[] = []
    const taskMap = new Map(tasks.map((task) => [task.id, task]))

    for (const task of tasks) {
      if (!task.is_milestone || !isCompletedTask(task)) continue
      const dependencyIds = Array.isArray(task.dependencies) ? task.dependencies : []
      if (dependencyIds.length === 0) continue

      const unfinished = dependencyIds
        .map((dependencyId) => taskMap.get(dependencyId))
        .filter((dependency): dependency is Task => Boolean(dependency) && !isCompletedTask(dependency))

      if (unfinished.length === 0) continue

      findings.push({
        finding_key: buildFindingKey('MILESTONE_PREDECESSOR_INCONSISTENT', task.id),
        project_id: projectId,
        task_id: task.id,
        rule_code: 'MILESTONE_PREDECESSOR_INCONSISTENT',
        rule_type: 'cross_check',
        severity: 'critical',
        dimension_key: `task:${task.id}`,
        summary: `关键节点“${task.title}”已标记完成，但前置任务尚未全部完成。`,
        details_json: {
          task_id: task.id,
          task_title: task.title,
          dependency_task_ids: unfinished.map((dependency) => dependency.id),
          dependency_task_titles: unfinished.map((dependency) => dependency.title),
          assignee_name: task.assignee_name ?? task.assignee ?? null,
          participant_unit_name: task.participant_unit_name ?? task.assignee_unit ?? null,
          is_critical_task: Boolean(task.is_critical),
        },
      })
    }

    return findings
  }

  private detectConditionFindings(projectId: string, tasks: Task[], conditions: TaskCondition[]): DataQualityFindingDraft[] {
    const findings: DataQualityFindingDraft[] = []
    const pendingConditionByTask = new Map<string, TaskCondition[]>()

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

      findings.push({
        finding_key: buildFindingKey('CONDITION_UNSATISFIED_STARTED', task.id),
        project_id: projectId,
        task_id: task.id,
        rule_code: 'CONDITION_UNSATISFIED_STARTED',
        rule_type: 'cross_check',
        severity: task.is_critical ? 'critical' : 'warning',
        dimension_key: `task:${task.id}`,
        summary: `任务“${task.title}”已进入执行，但仍有 ${pendingConditions.length} 项开工条件未满足。`,
        details_json: {
          task_id: task.id,
          task_title: task.title,
          condition_ids: pendingConditions.map((condition) => condition.id),
          condition_names: pendingConditions.map((condition) => condition.condition_name),
          assignee_name: task.assignee_name ?? task.assignee ?? null,
          participant_unit_name: task.participant_unit_name ?? task.assignee_unit ?? null,
          is_critical_task: Boolean(task.is_critical),
        },
      })
    }

    return findings
  }

  private detectAssigneeWorkloadFindings(projectId: string, tasks: Task[]): DataQualityFindingDraft[] {
    const findings: DataQualityFindingDraft[] = []
    const progressWindows = buildProgressWindows(tasks)

    for (const task of tasks) {
      const assigneeName = String(task.assignee_name ?? task.assignee ?? '').trim()
      if (!assigneeName || !isInProgressTask(task)) continue

      const startAt = toTimestamp(resolveTaskStart(task))
      const endAt = toTimestamp(resolveTaskEnd(task))
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt < startAt) continue

      const overlapCount = getOverlapCount({ startAt, endAt }, progressWindows.get(assigneeName) ?? [])
      if (overlapCount < 5) continue

      const severity: FindingSeverity = overlapCount >= 8 ? 'critical' : 'warning'
      findings.push({
        finding_key: buildFindingKey('ASSIGNEE_WORKLOAD_ABNORMAL', task.id),
        project_id: projectId,
        task_id: task.id,
        rule_code: 'ASSIGNEE_WORKLOAD_ABNORMAL',
        rule_type: 'cross_check',
        severity,
        dimension_key: `assignee:${assigneeName}`,
        summary: `责任人“${assigneeName}”当前有 ${overlapCount} 项同时段在途任务，工作量异常。`,
        details_json: {
          task_id: task.id,
          task_title: task.title,
          assignee_name: assigneeName,
          overlap_count: overlapCount,
          participant_unit_name: task.participant_unit_name ?? task.assignee_unit ?? null,
          is_critical_task: Boolean(task.is_critical),
        },
      })
    }

    return findings
  }

  private detectCrossCheckFindings(projectId: string, tasks: Task[], conditions: TaskCondition[]) {
    return [
      ...this.detectParentChildFindings(projectId, tasks),
      ...this.detectDependencyFindings(projectId, tasks),
      ...this.detectMilestonePredecessorFindings(projectId, tasks),
      ...this.detectConditionFindings(projectId, tasks, conditions),
      ...this.detectAssigneeWorkloadFindings(projectId, tasks),
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
        .filter((finding) => finding.status === 'active' && finding.rule_code === 'PROGRESS_JUMP' && finding.task_id)
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
    const { data, error } = await supabase
      .from('project_data_quality_settings')
      .select('project_id, weights_json, updated_at, updated_by')
      .eq('project_id', projectId)
      .limit(1)

    if (error) throw new Error(error.message)

    const row = ((data ?? [])[0] ?? null) as ProjectDataQualitySettings | null
    return toProjectSettingsSummary(projectId, row)
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

    return toProjectSettingsSummary(projectId, data as ProjectDataQualitySettings)
  }

  private async getOwnerRecipients(projectId: string) {
    const [project, members] = await Promise.all([
      executeSQL<ProjectOwnerRow>('SELECT id, owner_id FROM projects WHERE id = ? LIMIT 1', [projectId]),
      executeSQL<ProjectMemberRow>('SELECT project_id, user_id, role, permission_level FROM project_members WHERE project_id = ?', [projectId]),
    ])

    return uniqueStrings([
      project[0]?.owner_id ?? null,
      ...(members ?? [])
        .filter((member) => normalizeProjectPermissionLevel(member.permission_level ?? member.role) === 'owner')
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
        })),
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
      })
    } else {
      await insertNotification(payload)
    }

    await Promise.all(
      activeExisting
        .filter((notification) => notification.source_entity_id !== sourceEntityId)
        .map((notification) => updateNotificationById(notification.id, {
          status: 'resolved',
          resolved_at: nowIso(),
        })),
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
        })
      } else if (recipients.length > 0) {
        await insertNotification(payload)
      }
    }

    await Promise.all(
      activeExisting
        .filter((notification) => !activeIds.has(String(notification.source_entity_id ?? '')))
        .map((notification) => updateNotificationById(notification.id, {
          status: 'resolved',
          resolved_at: nowIso(),
        })),
    )
  }

  private async persistFindings(projectId: string, nextFindings: DataQualityFindingDraft[]) {
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
      .map((finding) => finding.id)

    if (staleIds.length > 0) {
      const { error: resolveError } = await supabase
        .from('data_quality_findings')
        .update({
          status: 'resolved',
          resolved_at: detectedAt,
        })
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

    const { data, error } = await supabase
      .from('data_confidence_snapshots')
      .upsert(payload, { onConflict: 'project_id,period_month' })
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return data as DataConfidenceSnapshot
  }

  private async scanProject(projectId: string, month = normalizeMonth()) {
    const { tasks, conditions, snapshots } = await this.loadProjectData(projectId)
    const latestSnapshots = getLatestSnapshotMap(snapshots)
    const snapshotsByTask = getSnapshotsByTask(snapshots)

    const drafts = this.dedupeFindings([
      ...this.detectTrendFindings(projectId, tasks),
      ...this.detectSnapshotGapFindings(projectId, tasks, latestSnapshots),
      ...this.detectProgressJumpFindings(projectId, tasks, snapshotsByTask),
      ...this.detectProgressTimeMismatchFindings(projectId, tasks),
      ...this.detectBatchSameValueFindings(projectId, tasks, latestSnapshots),
      ...this.detectCrossCheckFindings(projectId, tasks, conditions),
    ])

    const taskTitleById = new Map(tasks.map((task) => [task.id, task.title]))
    return { tasks, snapshots, taskTitleById, findings: drafts, month }
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

    const findings = this.dedupeFindings(this.detectCrossCheckFindings(projectId, previewTasks, conditions))
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
    return {
      projectId,
      month: result.month,
      confidence,
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
    const persistedFindings = await this.persistFindings(projectId, result.findings)
    const confidence = this.computeConfidence(result.month, result.tasks, result.snapshots, persistedFindings, settings.weights)
    await this.persistConfidence(projectId, result.month, confidence)
    const ownerDigest = buildOwnerDigest(persistedFindings)
    await this.syncOwnerDigestNotification(projectId, ownerDigest)
    await this.syncCriticalPathFindingNotifications(projectId, persistedFindings)

    return {
      projectId,
      month: result.month,
      confidence,
      prompt: buildPrompt(persistedFindings, result.taskTitleById),
      ownerDigest,
      findings: persistedFindings,
    }
  }

  async syncAllProjectsDataQuality(month = normalizeMonth()) {
    const projectIds = await listActiveProjectIds()
    const reports: DataQualityProjectSummary[] = []
    for (const projectId of projectIds) {
      try {
        reports.push(await this.syncProjectDataQuality(projectId, month))
      } catch (error) {
        logger.warn('[dataQualityService] failed to sync project data quality', {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return reports
  }
}

export const dataQualityService = new DataQualityService()
