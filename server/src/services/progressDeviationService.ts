import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { supabase } from './dbService.js'
import {
  acquireBaselineVersionLock,
  readBaselineVersionLock,
  PlanningDraftLockServiceError,
} from './baselineVersionLock.js'
import { evaluateMilestoneIntegrityRows } from './milestoneIntegrityService.js'
import { insertNotification, listNotifications, updateNotificationById } from './notificationStore.js'
import { isActiveObstacle } from '../utils/obstacleStatus.js'
import type {
  BaselineVersion,
  ProgressDeviationChildGroup,
  ProgressDeviationChildGroupItem,
  ProgressDeviationAnalysisResponse,
  ProgressDeviationChartData,
  ProgressDeviationCauseSummary,
  ProgressDeviationAttribution,
  ProgressDeviationDataCompleteness,
  ProgressDeviationMainline,
  ProgressDeviationReadRequest,
  ProgressDeviationMappingMonitoring,
  ProgressDeviationResponsibilityContribution,
  ProgressDeviationMappingStatus,
  ProgressDeviationMergedInto,
  ProgressDeviationRow,
  ProgressDeviationRowStatus,
  ProgressDeviationTrendEvent,
  ProgressDeviationSummary,
} from '../types/planning.js'
import type {
  DelayRequest,
  Milestone,
  MonthlyPlan,
  MonthlyPlanItem,
  Notification,
  Task,
  TaskBaselineItem,
  TaskCondition,
  TaskObstacle,
  TaskProgressSnapshot,
} from '../types/db.js'

type PlanningTaskRow = Task & {
  baseline_item_id?: string | null
  monthly_plan_item_id?: string | null
}

export class ProgressDeviationServiceError extends Error {
  code: 'NOT_FOUND' | 'DEVIATION_ANALYSIS_UNAVAILABLE' | 'VALIDATION_ERROR'
  statusCode: number

  constructor(code: 'NOT_FOUND' | 'DEVIATION_ANALYSIS_UNAVAILABLE' | 'VALIDATION_ERROR', message: string, statusCode = 400) {
    super(message)
    this.name = 'ProgressDeviationServiceError'
    this.code = code
    this.statusCode = statusCode
  }
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

export const progressDeviationContracts = {
  method: 'GET',
  path: '/api/progress-deviation',
  requestShape: '{ project_id: string, baseline_version_id: string, monthly_plan_version_id?: string, lock?: boolean }',
  responseShape:
    '{ project_id: string, baseline_version_id: string, monthly_plan_version_id?: string | null, version_lock?: BaselineVersionLock | null, summary: {...}, rows: [...], mainlines: [...], mapping_monitoring: {...}, trend_events: [...], chart_data: {...}, responsibility_contribution: [...], top_deviation_causes: [...], m1_m9_consistency: {...}, planned_date, actual_date, attribution, data_completeness, mapping_status, merged_into, child_group }',
  errorCodes: ['NOT_FOUND', 'DEVIATION_ANALYSIS_UNAVAILABLE', 'LOCK_HELD', 'LOCK_EXPIRED', 'VALIDATION_ERROR'],
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toNullableNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
}

function toDate(value?: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function diffDays(planned?: string | null, actual?: string | null): number {
  const plannedDate = toDate(planned)
  const actualDate = toDate(actual)
  if (!plannedDate || !actualDate) return 0
  const delta = actualDate.getTime() - plannedDate.getTime()
  return Math.round(delta / (24 * 60 * 60 * 1000))
}

function buildMainlineSummary(rows: ProgressDeviationRow[]): ProgressDeviationMainline['summary'] {
  const deviatedItems = rows.filter((row) => row.status !== 'on_track').length
  return {
    total_items: rows.length,
    deviated_items: deviatedItems,
    delayed_items: rows.filter((row) => row.status === 'delayed').length,
    unresolved_items: rows.filter((row) => row.status === 'unresolved').length,
  }
}

function classifyProgressRow(params: {
  plannedProgress?: number | null
  actualProgress?: number | null
  plannedEndDate?: string | null
  actualEndDate?: string | null
  allowCarryover?: boolean
}): { status: ProgressDeviationRowStatus; reason?: string | null } {
  const plannedProgress = params.plannedProgress ?? null
  const actualProgress = params.actualProgress ?? null
  const plannedEndDate = normalizeText(params.plannedEndDate)
  const actualEndDate = normalizeText(params.actualEndDate)

  if (actualProgress === null && !actualEndDate) {
    return { status: 'unresolved', reason: 'missing execution record' }
  }

  if (params.allowCarryover) {
    return { status: 'carried_over', reason: 'carried over to current month' }
  }

  if (plannedProgress === null) {
    if (plannedEndDate && actualEndDate && diffDays(plannedEndDate, actualEndDate) > 0) {
      return { status: 'delayed', reason: 'completion date exceeds plan' }
    }
    return { status: 'on_track', reason: null }
  }

  if (actualProgress === null) {
    return { status: 'unresolved', reason: 'missing actual progress' }
  }

  if (actualProgress + 0.001 < plannedProgress) {
    return { status: 'delayed', reason: 'actual progress below planned target' }
  }

  return { status: 'on_track', reason: null }
}

function pickLatestSnapshot(snapshots: TaskProgressSnapshot[]) {
  return snapshots
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.snapshot_date || left.created_at).getTime()
      const rightTime = new Date(right.snapshot_date || right.created_at).getTime()
      return rightTime - leftTime
    })[0] ?? null
}

function getTaskLookup(tasks: PlanningTaskRow[]) {
  const byId = new Map<string, PlanningTaskRow>()
  const byBaselineItemId = new Map<string, PlanningTaskRow>()
  const byMonthlyPlanItemId = new Map<string, PlanningTaskRow>()

  for (const task of tasks) {
    byId.set(task.id, task)
    if (task.baseline_item_id) byBaselineItemId.set(task.baseline_item_id, task)
    if (task.monthly_plan_item_id) byMonthlyPlanItemId.set(task.monthly_plan_item_id, task)
  }

  return { byId, byBaselineItemId, byMonthlyPlanItemId }
}

async function fetchRows<T>(table: string, filters: Array<[string, unknown]> = []): Promise<T[]> {
  let query: any = supabase.from(table).select('*')
  for (const [column, value] of filters) {
    query = query.eq(column, value)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as T[]
}

async function fetchRowsIn<T>(table: string, column: string, values: unknown[]): Promise<T[]> {
  if (values.length === 0) return []

  const { data, error } = await supabase.from(table).select('*').in(column, values as any[])
  if (error) throw error
  return (data ?? []) as T[]
}

async function fetchSingleRow<T>(table: string, filters: Array<[string, unknown]> = []): Promise<T | null> {
  const rows = await fetchRows<T>(table, filters)
  return rows[0] ?? null
}

async function getProjectRecipients(projectId: string) {
  const [projects, members] = await Promise.all([
    fetchRows<ProjectOwnerRow>('projects', [['id', projectId]]),
    fetchRows<ProjectMemberRow>('project_members', [['project_id', projectId]]),
  ])

  return uniqueStrings([
    projects[0]?.owner_id ?? null,
    ...(members ?? [])
      .filter((member) => normalizeProjectPermissionLevel(member.permission_level ?? member.role) === 'owner')
      .map((member) => member.user_id),
  ])
}

async function resolveMonthlyPlan(projectId: string, monthlyPlanVersionId?: string | null): Promise<MonthlyPlan | null> {
  if (monthlyPlanVersionId) {
    const plan = await fetchSingleRow<MonthlyPlan>('monthly_plans', [
      ['project_id', projectId],
      ['id', monthlyPlanVersionId],
    ])
    if (!plan) {
      throw new ProgressDeviationServiceError('NOT_FOUND', 'monthly plan version not found', 404)
    }
    return plan
  }

  const plans = await fetchRows<MonthlyPlan>('monthly_plans', [['project_id', projectId]])
  return plans
    .slice()
    .sort((left, right) => toNumber(right.version) - toNumber(left.version))[0] ?? null
}

function buildBaselineRows(params: {
  projectId: string
  baselineVersionId: string
  baselineItems: TaskBaselineItem[]
  tasks: PlanningTaskRow[]
  latestSnapshots: Map<string, TaskProgressSnapshot>
}): ProgressDeviationRow[] {
  const { byId, byBaselineItemId } = getTaskLookup(params.tasks)

  return params.baselineItems.map((item) => {
    const task = byBaselineItemId.get(item.id) ?? (item.source_task_id ? byId.get(item.source_task_id) ?? null : null)
    const snapshot = task ? params.latestSnapshots.get(task.id) ?? null : null
    const plannedProgress = item.target_progress ?? null
    const actualProgress = task ? toNullableNumber(task.progress) : snapshot ? toNullableNumber(snapshot.progress) : null
    const actualEndDate = task?.actual_end_date ?? task?.end_date ?? snapshot?.snapshot_date ?? task?.updated_at ?? null
    const classification = classifyProgressRow({
      plannedProgress,
      actualProgress: Number.isFinite(actualProgress as number) ? (actualProgress as number) : null,
      plannedEndDate: item.planned_end_date ?? null,
      actualEndDate,
    })
    const mappingStatus = translateMappingStatus(item.mapping_status ?? null)

    return {
      id: item.id,
      project_id: params.projectId,
      mainline: 'baseline',
      source_version_id: params.baselineVersionId,
      source_item_id: item.id,
      source_task_id: task?.id ?? null,
      title: item.title,
      planned_date: item.planned_end_date ?? null,
      planned_progress: plannedProgress,
      actual_progress: actualProgress === null ? null : round1(actualProgress),
      actual_date: actualEndDate,
      deviation_days: diffDays(item.planned_end_date ?? null, actualEndDate),
      deviation_rate:
        plannedProgress === null || actualProgress === null
          ? 0
          : round1(actualProgress - plannedProgress),
      status: classification.status,
      reason: mappingStatus === 'mapping_pending' ? classification.reason ?? 'mapping pending' : classification.reason ?? null,
      mapping_status: mappingStatus,
      merged_into: null,
      child_group: null,
    }
  })
}

function buildMonthlyPlanRows(params: {
  projectId: string
  monthlyPlanVersionId: string
  monthlyPlanItems: MonthlyPlanItem[]
  tasks: PlanningTaskRow[]
  latestSnapshots: Map<string, TaskProgressSnapshot>
}): ProgressDeviationRow[] {
  const { byId, byMonthlyPlanItemId, byBaselineItemId } = getTaskLookup(params.tasks)

  return params.monthlyPlanItems.map((item) => {
    const task =
      byMonthlyPlanItemId.get(item.id) ??
      (item.source_task_id ? byId.get(item.source_task_id) ?? null : null) ??
      (item.baseline_item_id ? byBaselineItemId.get(item.baseline_item_id) ?? null : null)
    const snapshot = task ? params.latestSnapshots.get(task.id) ?? null : null
    const plannedProgress = item.target_progress ?? null
    const actualProgress = task
      ? toNullableNumber(task.progress)
      : item.current_progress ?? (snapshot ? toNullableNumber(snapshot.progress) : null)
    const actualEndDate = task?.actual_end_date ?? task?.end_date ?? snapshot?.snapshot_date ?? task?.updated_at ?? null
    const classification = classifyProgressRow({
      plannedProgress,
      actualProgress: Number.isFinite(actualProgress as number) ? (actualProgress as number) : null,
      plannedEndDate: item.planned_end_date ?? null,
      actualEndDate,
      allowCarryover: item.commitment_status === 'carried_over',
    })

    return {
      id: item.id,
      project_id: params.projectId,
      mainline: 'monthly_plan',
      source_version_id: params.monthlyPlanVersionId,
      source_item_id: item.id,
      source_task_id: task?.id ?? null,
      title: item.title,
      planned_date: item.planned_end_date ?? null,
      planned_progress: plannedProgress,
      actual_progress: actualProgress === null ? null : round1(actualProgress),
      actual_date: actualEndDate,
      deviation_days: diffDays(item.planned_end_date ?? null, actualEndDate),
      deviation_rate:
        plannedProgress === null || actualProgress === null
          ? 0
          : round1(actualProgress - plannedProgress),
      status: classification.status,
      reason: classification.reason ?? null,
      mapping_status: 'mapped',
      merged_into: null,
      child_group: null,
    }
  })
}

function buildExecutionRows(params: {
  projectId: string
  baselineVersionId: string
  monthlyPlanVersionId: string | null
  tasks: PlanningTaskRow[]
  latestSnapshots: Map<string, TaskProgressSnapshot>
}): ProgressDeviationRow[] {
  return params.tasks.map((task) => {
    const snapshot = params.latestSnapshots.get(task.id) ?? null
    const plannedProgress = snapshot ? toNumber(snapshot.progress, 0) : null
    const actualProgress = toNullableNumber(task.progress)
    const classification = classifyProgressRow({
      plannedProgress,
      actualProgress: Number.isFinite(actualProgress as number) ? (actualProgress as number) : null,
      plannedEndDate: snapshot?.snapshot_date ?? null,
      actualEndDate: task.actual_end_date ?? task.end_date ?? task.updated_at ?? null,
    })

    return {
      id: task.id,
      project_id: params.projectId,
      mainline: 'execution',
      source_version_id: snapshot?.monthly_plan_version_id ?? snapshot?.baseline_version_id ?? params.monthlyPlanVersionId ?? params.baselineVersionId,
      source_item_id: snapshot?.monthly_plan_item_id ?? snapshot?.baseline_item_id ?? null,
      source_task_id: task.id,
      title: task.title,
      planned_date: snapshot?.snapshot_date ?? task.planned_end_date ?? null,
      planned_progress: plannedProgress,
      actual_progress: actualProgress === null ? null : round1(actualProgress),
      actual_date: task.actual_end_date ?? task.end_date ?? task.updated_at ?? null,
      deviation_days: snapshot?.snapshot_date ? diffDays(snapshot.snapshot_date, task.actual_end_date ?? task.end_date ?? task.updated_at ?? null) : 0,
      deviation_rate:
        plannedProgress === null || actualProgress === null
          ? 0
          : round1(actualProgress - plannedProgress),
      status: classification.status,
      reason: classification.reason ?? null,
      mapping_status: 'mapped',
      merged_into: null,
      child_group: null,
    }
  })
}

function buildLatestSnapshotMap(snapshots: TaskProgressSnapshot[]) {
  const latestByTask = new Map<string, TaskProgressSnapshot[]>()

  for (const snapshot of snapshots) {
    const list = latestByTask.get(snapshot.task_id) ?? []
    list.push(snapshot)
    latestByTask.set(snapshot.task_id, list)
  }

  const latest = new Map<string, TaskProgressSnapshot>()
  for (const [taskId, rows] of latestByTask.entries()) {
    latest.set(taskId, pickLatestSnapshot(rows))
  }

  return latest
}

function buildAttributionMap<T extends { task_id?: string | null }>(rows: T[]) {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const taskId = normalizeText(row.task_id)
    if (!taskId) continue
    const bucket = map.get(taskId) ?? []
    bucket.push(row)
    map.set(taskId, bucket)
  }
  return map
}

function buildRowAttribution(params: {
  taskId?: string | null
  conditionsByTask: Map<string, TaskCondition[]>
  obstaclesByTask: Map<string, TaskObstacle[]>
  delaysByTask: Map<string, DelayRequest[]>
}): ProgressDeviationAttribution | null {
  const taskId = normalizeText(params.taskId)
  if (!taskId) return null

  const blockingConditions = (params.conditionsByTask.get(taskId) ?? [])
    .filter((condition) => !condition.is_satisfied)
    .map((condition) => ({
      id: condition.id,
      title: condition.condition_name,
      due_date: condition.due_date ?? null,
      status: condition.status ?? null,
    }))

  const activeObstacles = (params.obstaclesByTask.get(taskId) ?? [])
    .filter((obstacle) => isActiveObstacle(obstacle))
    .map((obstacle) => ({
      id: obstacle.id,
      description: obstacle.description,
      severity: obstacle.severity ?? null,
      status: obstacle.status ?? null,
      expected_resolution_date: obstacle.expected_resolution_date ?? null,
    }))

  const delayReasons = (params.delaysByTask.get(taskId) ?? [])
    .filter((delay) => String(delay.status ?? '').trim() !== 'withdrawn')
    .map((delay) => ({
      id: delay.id,
      reason: delay.reason,
      delay_reason: delay.delay_reason ?? null,
      status: delay.status ?? null,
      delayed_date: delay.delayed_date ?? null,
    }))

  if (blockingConditions.length === 0 && activeObstacles.length === 0 && delayReasons.length === 0) {
    return null
  }

  return {
    blocking_conditions: blockingConditions,
    active_obstacles: activeObstacles,
    delay_reasons: delayReasons,
  }
}

function buildRowCompleteness(params: {
  row: ProgressDeviationRow
  latestSnapshots: Map<string, TaskProgressSnapshot>
  attribution: ProgressDeviationAttribution | null
}): ProgressDeviationDataCompleteness {
  const taskId = normalizeText(params.row.source_task_id)
  const hasSnapshot = taskId ? params.latestSnapshots.has(taskId) : false
  const hasPlanningLink = Boolean(params.row.source_item_id || params.row.source_task_id)
  const hasAttribution = Boolean(
    params.attribution &&
    (
      params.attribution.blocking_conditions.length > 0 ||
      params.attribution.active_obstacles.length > 0 ||
      params.attribution.delay_reasons.length > 0
    ),
  )

  return {
    has_snapshot: hasSnapshot,
    has_actual_progress: params.row.actual_progress !== null && params.row.actual_progress !== undefined,
    has_planning_link: hasPlanningLink,
    has_attribution: hasAttribution,
  }
}

function getTaskResponsibilityLabel(task?: PlanningTaskRow | null): string {
  if (!task) return '未指定责任主体'

  const raw = task as unknown as Record<string, unknown>
  return normalizeText(
    raw.participant_unit_name ??
    raw.responsible_unit ??
    raw.assignee_name ??
    raw.assignee ??
    raw.owner_name ??
    raw.owner ??
    task.title
  ) || '未指定责任主体'
}

function buildMonthlyDeviationBuckets(rows: ProgressDeviationRow[]): ProgressDeviationChartData['monthly_buckets'] {
  const buckets = new Map<string, ProgressDeviationChartData['monthly_buckets'][number]>()

  for (const row of rows) {
    const sourceDate = normalizeText(row.planned_date ?? row.actual_date)
    const month = sourceDate ? (sourceDate.length >= 7 ? sourceDate.slice(0, 7) : sourceDate) : '未设置'
    const bucket = buckets.get(month) ?? {
      month,
      on_track: 0,
      delayed: 0,
      carried_over: 0,
      revised: 0,
      unresolved: 0,
    }

    switch (row.status) {
      case 'on_track':
        bucket.on_track += 1
        break
      case 'carried_over':
        bucket.carried_over += 1
        break
      case 'revised':
        bucket.revised += 1
        break
      case 'unresolved':
        bucket.unresolved += 1
        break
      default:
        bucket.delayed += 1
        break
    }

    buckets.set(month, bucket)
  }

  return [...buckets.values()].sort((left, right) => left.month.localeCompare(right.month))
}

function buildResponsibilityContribution(
  rows: ProgressDeviationRow[],
  tasks: PlanningTaskRow[],
): ProgressDeviationResponsibilityContribution[] {
  const deviationRows = rows.filter((row) => row.status !== 'on_track')
  if (deviationRows.length === 0) return []

  const total = Math.max(deviationRows.length, 1)
  const { byId } = getTaskLookup(tasks)
  const buckets = new Map<string, { owner: string; count: number; taskIds: string[] }>()

  for (const row of deviationRows) {
    const task = row.source_task_id ? byId.get(row.source_task_id) ?? null : null
    const owner = getTaskResponsibilityLabel(task)
    const bucket = buckets.get(owner) ?? { owner, count: 0, taskIds: [] }
    bucket.count += 1
    if (row.source_task_id && !bucket.taskIds.includes(row.source_task_id)) {
      bucket.taskIds.push(row.source_task_id)
    }
    buckets.set(owner, bucket)
  }

  return [...buckets.values()]
    .map((bucket) => ({
      owner: bucket.owner,
      count: bucket.count,
      percentage: round1((bucket.count / total) * 100),
      task_ids: bucket.taskIds,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 6)
}

function buildTopDeviationCauses(rows: ProgressDeviationRow[]): ProgressDeviationCauseSummary[] {
  const deviationRows = rows.filter((row) => row.status !== 'on_track')
  if (deviationRows.length === 0) return []

  const total = Math.max(deviationRows.length, 1)
  const buckets = new Map<string, number>()

  for (const row of deviationRows) {
    const reason = normalizeText(row.reason) || '未说明原因'
    buckets.set(reason, (buckets.get(reason) || 0) + 1)
  }

  return [...buckets.entries()]
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: round1((count / total) * 100),
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 3)
}

function enrichDeviationRows(params: {
  rows: ProgressDeviationRow[]
  latestSnapshots: Map<string, TaskProgressSnapshot>
  conditionsByTask: Map<string, TaskCondition[]>
  obstaclesByTask: Map<string, TaskObstacle[]>
  delaysByTask: Map<string, DelayRequest[]>
}) {
  return params.rows.map((row) => {
    const attribution = buildRowAttribution({
      taskId: row.source_task_id ?? null,
      conditionsByTask: params.conditionsByTask,
      obstaclesByTask: params.obstaclesByTask,
      delaysByTask: params.delaysByTask,
    })

    return {
      ...row,
      attribution,
      data_completeness: buildRowCompleteness({
        row,
        latestSnapshots: params.latestSnapshots,
        attribution,
      }),
    }
  })
}

async function syncProgressDeviationDataGapNotification(projectId: string, rows: ProgressDeviationRow[]) {
  const recipients = await getProjectRecipients(projectId)
  const existing = await listNotifications({ projectId, sourceEntityType: 'progress_deviation_data_gap' })
  const activeExisting = existing.filter((item) => String(item.status ?? '').trim().toLowerCase() !== 'resolved')

  const gapRows = rows.filter((row) => {
    const completeness = row.data_completeness
    if (!completeness) return false
    return !completeness.has_snapshot || !completeness.has_actual_progress || !completeness.has_planning_link
  })

  if (gapRows.length === 0 || recipients.length === 0) {
    await Promise.all(
      activeExisting.map((item) => updateNotificationById(item.id, {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        is_read: true,
      })),
    )
    return null
  }

  const sampleRows = gapRows.slice(0, 3)
  const gapSummary = sampleRows
    .map((row) => {
      const missing: string[] = []
      if (!row.data_completeness?.has_snapshot) missing.push('快照')
      if (!row.data_completeness?.has_actual_progress) missing.push('实际进度')
      if (!row.data_completeness?.has_planning_link) missing.push('计划映射')
      return `${row.title}缺少${missing.join('/')}`
    })
    .join('；')
  const current = activeExisting[0]
  const payload: Notification = {
    id: current?.id ?? '',
    project_id: projectId,
    type: 'progress_deviation_data_gap',
    notification_type: 'flow-reminder',
    severity: 'warning',
    level: 'warning',
    title: '偏差分析发现数据缺口',
    content: `当前有 ${gapRows.length} 条偏差记录存在数据缺口。${gapSummary}`,
    is_read: current?.is_read ?? false,
    is_broadcast: false,
    source_entity_type: 'progress_deviation_data_gap',
    source_entity_id: projectId,
    category: 'planning_governance',
    recipients,
    status: current?.status ?? 'unread',
    metadata: {
      gap_count: gapRows.length,
      sample_rows: sampleRows.map((row) => ({
        id: row.id,
        title: row.title,
        mainline: row.mainline,
      })),
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
      recipients,
      metadata: payload.metadata,
      resolved_at: null,
      updated_at: payload.updated_at,
    })
    return { ...current, ...payload, status: 'unread', is_read: false, resolved_at: null } as Notification
  }

  return await insertNotification(payload)
}

function toVersionLabel(version?: number | null, fallbackId?: string | null) {
  if (Number.isFinite(version as number)) {
    return `v${version}`
  }
  return normalizeText(fallbackId) || 'unknown'
}

function translateMappingStatus(status?: string | null): ProgressDeviationMappingStatus {
  if (status === 'pending' || status === 'missing') {
    return 'mapping_pending'
  }
  if (status === 'merged') {
    return 'merged_into'
  }
  return 'mapped'
}

function pickLatestDate(values: Array<string | null | undefined>): string | null {
  const ordered = values
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())
  return ordered[0] ?? null
}

function deriveSplitProgress(childRows: ProgressDeviationRow[], lastCompletedDate: string | null) {
  const numericValues = childRows
    .map((row) => {
      if (row.actual_progress !== null && row.actual_progress !== undefined) {
        return row.actual_progress
      }
      if (row.actual_date) {
        return 100
      }
      return null
    })
    .filter((value): value is number => value !== null)

  if (numericValues.length > 0) {
    return round1(numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length)
  }

  if (lastCompletedDate) {
    return 100
  }

  return null
}

function buildChildGroupForParent(params: {
  parent: TaskBaselineItem
  childRows: ProgressDeviationRow[]
}): ProgressDeviationChildGroup {
  const lastCompletedDate = pickLatestDate(params.childRows.map((row) => row.actual_date ?? null))

  return {
    group_id: params.parent.id,
    parent_item_id: params.parent.id,
    parent_title: params.parent.title,
    child_count: params.childRows.length,
    last_completed_date: lastCompletedDate,
    children: params.childRows.map(
      (row): ProgressDeviationChildGroupItem => ({
        id: row.id,
        title: row.title,
        actual_date: row.actual_date ?? null,
        status: row.status,
      })
    ),
  }
}

function buildBaselineBoundaryCompensatedRows(params: {
  projectId: string
  baselineVersionId: string
  baselineItems: TaskBaselineItem[]
  tasks: PlanningTaskRow[]
  latestSnapshots: Map<string, TaskProgressSnapshot>
}): {
  rows: ProgressDeviationRow[]
  splitGroups: ProgressDeviationChildGroup[]
  mergeGroups: ProgressDeviationMappingMonitoring['merge_groups']
  mappingPendingCount: number
  mergedCount: number
} {
  const rawRows = buildBaselineRows(params)
  const rawRowsById = new Map(rawRows.map((row) => [row.id, row]))
  const baselineItemById = new Map(params.baselineItems.map((item) => [item.id, item]))
  const childItemsByParent = new Map<string, TaskBaselineItem[]>()
  const rowsToRemove = new Set<string>()
  const splitGroups: ProgressDeviationChildGroup[] = []

  for (const item of params.baselineItems) {
    if (!item.parent_item_id) continue
    const children = childItemsByParent.get(item.parent_item_id) ?? []
    children.push(item)
    childItemsByParent.set(item.parent_item_id, children)
  }

  for (const parent of params.baselineItems) {
    const children = childItemsByParent.get(parent.id) ?? []
    if (children.length === 0) continue

    const parentRow = rawRowsById.get(parent.id)
    if (!parentRow) continue

    const childRows = children
      .map((child) => rawRowsById.get(child.id))
      .filter((row): row is ProgressDeviationRow => Boolean(row))
      .sort((left, right) => toNumber(baselineItemById.get(left.id)?.sort_order, 0) - toNumber(baselineItemById.get(right.id)?.sort_order, 0))

    const childGroup = buildChildGroupForParent({
      parent,
      childRows,
    })
    const splitActualDate = childGroup.last_completed_date
    const splitActualProgress = deriveSplitProgress(childRows, splitActualDate)
    const classification = classifyProgressRow({
      plannedProgress: parentRow.planned_progress ?? null,
      actualProgress: splitActualProgress,
      plannedEndDate: parent.planned_end_date ?? null,
      actualEndDate: splitActualDate,
    })
    const splitDelayDays = diffDays(parent.planned_end_date ?? null, splitActualDate)
    const splitStatus =
      splitDelayDays > 0 && classification.status === 'on_track'
        ? 'delayed'
        : classification.status
    const splitReason =
      splitDelayDays > 0 && classification.status === 'on_track'
        ? '最后完成的子里程碑实际日期晚于原基线日期'
        : classification.reason ?? null

    parentRow.actual_progress = splitActualProgress
    parentRow.actual_date = splitActualDate
    parentRow.deviation_days = splitDelayDays
    parentRow.deviation_rate =
      parentRow.planned_progress === null || splitActualProgress === null
        ? 0
        : round1(splitActualProgress - parentRow.planned_progress)
    parentRow.status = splitStatus
    parentRow.reason = splitReason
    parentRow.mapping_status = translateMappingStatus(parent.mapping_status)
    parentRow.merged_into = null
    parentRow.child_group = childGroup
    splitGroups.push(childGroup)

    for (const childRow of childRows) {
      rowsToRemove.add(childRow.id)
    }
  }

  const mergeGroupsByTask = new Map<string, ProgressDeviationRow[]>()
  for (const row of rawRows.filter((candidate) => !rowsToRemove.has(candidate.id))) {
    if (!row.source_task_id) continue
    const rows = mergeGroupsByTask.get(row.source_task_id) ?? []
    rows.push(row)
    mergeGroupsByTask.set(row.source_task_id, rows)
  }

  const mergeGroups: ProgressDeviationMappingMonitoring['merge_groups'] = []
  let mergedCount = 0

  for (const [sourceTaskId, rows] of mergeGroupsByTask.entries()) {
    if (rows.length < 2) continue

    const orderedRows = rows
      .slice()
      .sort((left, right) => toNumber(baselineItemById.get(left.id)?.sort_order, 0) - toNumber(baselineItemById.get(right.id)?.sort_order, 0))
    const representative = orderedRows[0]
    const mergedInto: ProgressDeviationMergedInto = {
      group_id: sourceTaskId,
      target_item_id: representative.id,
      title: representative.title,
      item_ids: orderedRows.map((row) => row.id),
    }

    representative.mapping_status = 'mapping_pending'
    representative.merged_into = mergedInto
    representative.actual_progress = null
    representative.actual_date = null
    representative.deviation_days = 0
    representative.deviation_rate = 0
    representative.status = 'unresolved'
    representative.reason = 'mapping pending'

    mergeGroups.push({
      group_id: sourceTaskId,
      item_ids: orderedRows.map((row) => row.id),
      item_titles: orderedRows.map((row) => row.title),
      mapping_status: 'mapping_pending',
      explanation: `Same task ${sourceTaskId} maps to ${orderedRows.length} baseline items and awaits manual merge confirmation`,
    })
    mergedCount += orderedRows.length

    for (const row of orderedRows.slice(1)) {
      rowsToRemove.add(row.id)
    }
  }

  const rows = rawRows
    .filter((row) => !rowsToRemove.has(row.id))
    .map((row) => ({
      ...row,
      mapping_status: row.mapping_status ?? 'mapped',
    }))

  const mappingPendingCount = rows.filter((row) => row.mapping_status === 'mapping_pending').length

  return {
    rows,
    splitGroups,
    mergeGroups,
    mappingPendingCount,
    mergedCount,
  }
}

function buildTrendEvents(params: {
  baselineVersionId: string
  baselineVersion: BaselineVersion
  monthlyPlan: MonthlyPlan | null
  baselineVersions: BaselineVersion[]
  snapshots: TaskProgressSnapshot[]
}): ProgressDeviationTrendEvent[] {
  const versionById = new Map(params.baselineVersions.map((version) => [version.id, version]))
  const versionPoints = new Map<string, { date: string; timestamp: number }>()

  function registerVersionPoint(versionId: string | null | undefined, date: string | null | undefined) {
    const normalizedVersionId = normalizeText(versionId)
    const normalizedDate = normalizeText(date)
    if (!normalizedVersionId || !normalizedDate) return

    const timestamp = new Date(normalizedDate).getTime()
    if (!Number.isFinite(timestamp)) return

    const existing = versionPoints.get(normalizedVersionId)
    if (!existing || timestamp < existing.timestamp) {
      versionPoints.set(normalizedVersionId, { date: normalizedDate.slice(0, 10), timestamp })
    }
  }

  for (const snapshot of params.snapshots) {
    registerVersionPoint(snapshot.baseline_version_id ?? null, snapshot.snapshot_date ?? snapshot.created_at ?? null)
  }

  if (params.monthlyPlan?.baseline_version_id && params.monthlyPlan.baseline_version_id !== params.baselineVersionId) {
    registerVersionPoint(
      params.monthlyPlan.baseline_version_id,
      params.monthlyPlan.confirmed_at ?? params.monthlyPlan.updated_at ?? params.monthlyPlan.created_at
    )
  }

  const orderedPoints = Array.from(versionPoints.entries()).sort((left, right) => left[1].timestamp - right[1].timestamp)
  const events: ProgressDeviationTrendEvent[] = []

  for (let index = 1; index < orderedPoints.length; index += 1) {
    const [fromVersionId, fromPoint] = orderedPoints[index - 1]
    const [toVersionId, toPoint] = orderedPoints[index]
    if (fromVersionId === toVersionId) continue

    const fromVersion = versionById.get(fromVersionId)
    const toVersion = versionById.get(toVersionId)
    const switchDate = toPoint.date || fromPoint.date
    const fromVersionLabel = toVersionLabel(fromVersion?.version, fromVersionId)
    const toVersionLabelValue = toVersionLabel(toVersion?.version, toVersionId)

    events.push({
      event_type: 'baseline_version_switch',
      marker_type: 'vertical_line',
      switch_date: switchDate,
      from_version: fromVersionLabel,
      to_version: toVersionLabelValue,
      explanation: `${switchDate} before ${fromVersionLabel}, ${switchDate} after ${toVersionLabelValue}`,
    })
  }

  return events
}

export async function getProgressDeviationAnalysis(
  params: ProgressDeviationReadRequest & { actorUserId?: string | null }
): Promise<ProgressDeviationAnalysisResponse> {
  const projectId = normalizeText(params.project_id)
  const baselineVersionId = normalizeText(params.baseline_version_id)
  const monthlyPlanVersionId = normalizeText(params.monthly_plan_version_id)
  const lockRequested = Boolean(params.lock)

  if (!projectId || !baselineVersionId) {
    throw new ProgressDeviationServiceError('VALIDATION_ERROR', 'project_id 和 baseline_version_id 不能为空', 400)
  }

  const [baselineVersion, baselineVersions] = await Promise.all([
    fetchSingleRow<BaselineVersion>('task_baselines', [
      ['project_id', projectId],
      ['id', baselineVersionId],
    ]),
    fetchRows<BaselineVersion>('task_baselines', [['project_id', projectId]]),
  ])
  if (!baselineVersion) {
    throw new ProgressDeviationServiceError('NOT_FOUND', '基线版本不存在', 404)
  }

  const versionLock = lockRequested
    ? await acquireBaselineVersionLock({
        projectId,
        baselineVersionId,
        actorUserId: params.actorUserId ?? 'system',
      })
    : null

  const monthlyPlan = await resolveMonthlyPlan(projectId, monthlyPlanVersionId || null)
  const [baselineItems, monthlyPlanItems, tasks, milestones] = await Promise.all([
    fetchRows<TaskBaselineItem>('task_baseline_items', [['baseline_version_id', baselineVersionId]]),
    monthlyPlan ? fetchRows<MonthlyPlanItem>('monthly_plan_items', [['monthly_plan_version_id', monthlyPlan.id]]) : Promise.resolve([] as MonthlyPlanItem[]),
    fetchRows<PlanningTaskRow>('tasks', [['project_id', projectId]]),
    fetchRows<Milestone>('milestones', [['project_id', projectId]]),
  ])
  const snapshots = await fetchRowsIn<TaskProgressSnapshot>(
    'task_progress_snapshots',
    'task_id',
    tasks.map((task) => task.id),
  )
  const [conditions, obstacles, delayRequests] = await Promise.all([
    fetchRowsIn<TaskCondition>('task_conditions', 'task_id', tasks.map((task) => task.id)),
    fetchRowsIn<TaskObstacle>('task_obstacles', 'task_id', tasks.map((task) => task.id)),
    fetchRowsIn<DelayRequest>('delay_requests', 'task_id', tasks.map((task) => task.id)),
  ])

  const latestSnapshots = buildLatestSnapshotMap(snapshots)
  const conditionsByTask = buildAttributionMap(conditions)
  const obstaclesByTask = buildAttributionMap(obstacles)
  const delaysByTask = buildAttributionMap(delayRequests)
  const baselineBoundaryCompensation = buildBaselineBoundaryCompensatedRows({
    projectId,
    baselineVersionId,
    baselineItems,
    tasks,
    latestSnapshots,
  })
  const baselineRows = enrichDeviationRows({
    rows: baselineBoundaryCompensation.rows,
    latestSnapshots,
    conditionsByTask,
    obstaclesByTask,
    delaysByTask,
  })
  const monthlyRows = enrichDeviationRows({
    rows: monthlyPlan
      ? buildMonthlyPlanRows({
        projectId,
        monthlyPlanVersionId: monthlyPlan.id,
        monthlyPlanItems,
        tasks,
        latestSnapshots,
      })
      : [],
    latestSnapshots,
    conditionsByTask,
    obstaclesByTask,
    delaysByTask,
  })
  const executionRows = enrichDeviationRows({
    rows: buildExecutionRows({
      projectId,
      baselineVersionId,
      monthlyPlanVersionId: monthlyPlan?.id ?? null,
      tasks,
      latestSnapshots,
    }),
    latestSnapshots,
    conditionsByTask,
    obstaclesByTask,
    delaysByTask,
  })

  const mainlines: ProgressDeviationMainline[] = [
    {
      key: 'baseline',
      label: '基线偏差主线',
      summary: buildMainlineSummary(baselineRows),
      rows: baselineRows,
    },
    {
      key: 'monthly_plan',
      label: '月度计划偏差主线',
      summary: buildMainlineSummary(monthlyRows),
      rows: monthlyRows,
    },
    {
      key: 'execution',
      label: '执行偏差主线',
      summary: buildMainlineSummary(executionRows),
      rows: executionRows,
    },
  ]

  const rows = mainlines.flatMap((mainline) => mainline.rows)
  const resolvedVersionLock = versionLock ?? await readBaselineVersionLock(projectId, baselineVersionId)
  const mappingMonitoring: ProgressDeviationMappingMonitoring = {
    split_groups: baselineBoundaryCompensation.splitGroups,
    merge_groups: baselineBoundaryCompensation.mergeGroups,
    mapping_pending_count: baselineBoundaryCompensation.mappingPendingCount,
    merged_count: baselineBoundaryCompensation.mergedCount,
  }
  const trendEvents = buildTrendEvents({
    baselineVersionId,
    baselineVersion,
    monthlyPlan,
    baselineVersions,
    snapshots,
  })
  const milestoneConsistency = evaluateMilestoneIntegrityRows(projectId, milestones)

  const summary: ProgressDeviationSummary = {
    total_items: rows.length,
    deviated_items: rows.filter((row) => row.status !== 'on_track').length,
    carryover_items: rows.filter((row) => row.status === 'carried_over').length,
    unresolved_items: rows.filter((row) => row.status === 'unresolved').length,
    baseline_items: baselineRows.length,
    monthly_plan_items: monthlyRows.length,
    execution_items: executionRows.length,
  }
  const monthlyBuckets = buildMonthlyDeviationBuckets(rows)
  const chartData: ProgressDeviationChartData = {
    baselineDeviation: baselineRows,
    monthlyFulfillment: monthlyBuckets,
    executionDeviation: executionRows,
    monthly_buckets: monthlyBuckets,
  }
  const responsibilityContribution = buildResponsibilityContribution(rows, tasks)
  const topDeviationCauses = buildTopDeviationCauses(rows)

  try {
    await syncProgressDeviationDataGapNotification(projectId, rows)
  } catch (notificationError) {
    console.warn('[progressDeviationService] failed to persist data-gap notification', {
      projectId,
      error: notificationError instanceof Error ? notificationError.message : String(notificationError),
    })
  }

  return {
    project_id: projectId,
    baseline_version_id: baselineVersion.id,
    monthly_plan_version_id: monthlyPlan?.id ?? null,
    version_lock: resolvedVersionLock,
    summary,
    rows,
    mainlines,
    mapping_monitoring: mappingMonitoring,
    trend_events: trendEvents,
    chart_data: chartData,
    responsibility_contribution: responsibilityContribution,
    top_deviation_causes: topDeviationCauses,
    m1_m9_consistency: milestoneConsistency,
  }
}

export async function getProgressDeviationAnalysisOrThrow(
  params: ProgressDeviationReadRequest & { actorUserId?: string | null }
) {
  try {
    return await getProgressDeviationAnalysis(params)
  } catch (error) {
    if (error instanceof ProgressDeviationServiceError) {
      throw error
    }
    if (error instanceof PlanningDraftLockServiceError) {
      throw error
    }
    throw new ProgressDeviationServiceError('DEVIATION_ANALYSIS_UNAVAILABLE', '偏差分析暂不可用', 503)
  }
}
