import { v4 as uuidv4 } from 'uuid'

import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { executeSQL, executeSQLOne, listTaskProgressSnapshotsByTaskIds } from './dbService.js'
import { listActiveProjectIds } from './activeProjectService.js'
import { findNotification, insertNotification } from './notificationStore.js'
import { writeLog } from './changeLogs.js'
import { PlanningHealthService } from './planningHealthService.js'
import { PlanningIntegrityService } from './planningIntegrityService.js'
import { enqueueProjectHealthUpdate } from './projectHealthService.js'
import { SystemAnomalyService } from './systemAnomalyService.js'
import type { Notification } from '../types/db.js'
import type { MonthlyPlan, Task, TaskProgressSnapshot } from '../types/db.js'
import type {
  PassiveReorderDetectionReport,
  PlanningGovernanceAlert,
  PlanningGovernanceState,
  PlanningGovernanceSnapshot,
  PlanningHealthReport,
  PlanningIntegrityReport,
} from '../types/planning.js'

interface ProjectMemberRow {
  project_id: string
  user_id: string
  role?: string | null
  permission_level?: string | null
}

interface ProjectOwnerRow {
  id: string
  owner_id?: string | null
}

type ManualReorderMode = 'sequence' | 'date_shift' | 'scope_change' | 'mixed'

interface ManualReorderStartSnapshot {
  total_tasks: number
  critical_task_count: number
  milestone_task_count: number
  confirmed_baseline_count: number
  active_monthly_plan_count: number
  pending_realign_count: number
}

interface ManualReorderEndSummary {
  duration_minutes: number
  changed_task_count: number
  changed_baseline_count: number
  changed_monthly_plan_count: number
  changed_field_count: number
  change_log_count: number
}

interface ManualReorderSessionPayload extends Record<string, unknown> {
  reorder_mode: ManualReorderMode
  started_by?: string | null
  started_at: string
  note?: string | null
  start_snapshot: ManualReorderStartSnapshot
  ended_by?: string | null
  ended_at?: string | null
  end_summary?: ManualReorderEndSummary | null
  completion_note?: string | null
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

const DAY_MS = 24 * 60 * 60 * 1000
const GOVERNANCE_CLOSEOUT_THRESHOLDS = [3, 5, 7] as const
const GOVERNANCE_REORDER_THRESHOLDS = [3, 5, 7] as const

function isPlanningHealthReport(report: PlanningHealthReport | PlanningIntegrityReport | PassiveReorderDetectionReport): report is PlanningHealthReport {
  if ('score' in report) {
    return true
  }
  return false
}

function isPlanningIntegrityReport(report: PlanningHealthReport | PlanningIntegrityReport | PassiveReorderDetectionReport): report is PlanningIntegrityReport {
  return 'milestone_integrity' in report && 'data_integrity' in report && 'mapping_integrity' in report
}

function isPassiveReorderReport(report: PlanningHealthReport | PlanningIntegrityReport | PassiveReorderDetectionReport): report is PassiveReorderDetectionReport {
  return 'windows' in report
}

function getAlertSeverity(report: PlanningHealthReport | PlanningIntegrityReport | PassiveReorderDetectionReport): 'info' | 'warning' | 'critical' {
  if (isPlanningHealthReport(report)) {
    return report.score < 60 ? 'critical' : report.score < 80 ? 'warning' : 'info'
  }

  if (isPlanningIntegrityReport(report)) {
    const blockedMilestones = report.milestone_integrity.summary.blocked
    const missingData = report.milestone_integrity.summary.missing_data
    const needsAttention = report.milestone_integrity.summary.needs_attention
    if (blockedMilestones > 0 || missingData > 0) return 'critical'
    if (needsAttention > 0) return 'warning'
    return 'info'
  }

  const triggeredWindows = isPassiveReorderReport(report) ? report.windows.filter((window) => window.triggered).length : 0
  if (triggeredWindows >= 2) return 'critical'
  if (triggeredWindows === 1) return 'warning'
  return 'info'
}

function normalizeMonthKey(value?: string | null): string | null {
  if (!value) return null
  const text = String(value).trim()
  const match = /^(\d{4})-(\d{2})$/.exec(text)
  if (match) {
    return `${match[1]}-${match[2]}`
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthSerial(value: string): number | null {
  const normalized = normalizeMonthKey(value)
  if (!normalized) return null
  const [year, monthPart] = normalized.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(monthPart)) return null
  return year * 12 + monthPart
}

function getLongestConsecutiveMonthStreak(months: Iterable<string>): number {
  const serials = [...new Set(Array.from(months).map((month) => monthSerial(month)).filter((value): value is number => value !== null))]
    .sort((left, right) => left - right)

  let longest = 0
  let current = 0
  let previous: number | null = null

  for (const serial of serials) {
    if (previous === null || serial === previous + 1) {
      current += 1
    } else {
      current = 1
    }
    longest = Math.max(longest, current)
    previous = serial
  }

  return longest
}

function monthBoundaryTimestamp(month: string): number | null {
  const normalized = normalizeMonthKey(month)
  if (!normalized) return null

  const [year, monthPart] = normalized.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(monthPart)) return null

  return Date.UTC(year, monthPart, 1, 0, 0, 0, 0)
}

function daysBetween(start: number, end: number): number {
  return Math.floor((end - start) / DAY_MS)
}

function buildCloseoutAlertDetail(plan: MonthlyPlan, overdueDays: number, threshold: number): string {
  const planLabel = `${plan.month}${plan.title ? ` / ${plan.title}` : ''}`
  if (threshold === 3) {
    return `月度计划 ${planLabel} 已超期 ${overdueDays} 天，请 PM 尽快完成关账。`
  }
  if (threshold === 5) {
    return `月度计划 ${planLabel} 已超期 ${overdueDays} 天，请升级到项目负责人处理，并同步 Dashboard 关账超期信号。`
  }
  return `月度计划 ${planLabel} 已超期 ${overdueDays} 天，系统已解锁强制发起关账权限。`
}

function buildReorderAlertDetail(window: NonNullable<PassiveReorderDetectionReport['windows']>[number], threshold: number): string {
  const prefix =
    threshold === 3
      ? '被动重排已触发，请 PM 关注并确认是否继续变更。'
      : threshold === 5
        ? '被动重排已持续，建议升级项目负责人介入。'
        : '被动重排已进入收口阶段，系统将自动结束并生成变更摘要。'

  return `${prefix} ${window.window_days} 日窗口命中：${window.event_count} 条变更、${window.key_task_count ?? 0} 个关键任务、平均偏移 ${window.average_offset_days ?? 0} 天。`
}

function getProjectNotificationScope(kind: PlanningGovernanceAlert['kind']): 'owner' | 'owner_admin' {
  if (
    kind === 'closeout_reminder'
    || kind === 'reorder_reminder'
    || kind === 'ad_hoc_cross_month_reminder'
  ) {
    return 'owner'
  }

  return 'owner_admin'
}

function getPlanningGovernanceNotificationType(kind: PlanningGovernanceAlert['kind']) {
  switch (kind) {
    case 'health':
      return 'planning-governance-health'
    case 'integrity':
      return 'planning-governance-integrity'
    case 'anomaly':
      return 'planning-governance-anomaly'
    case 'mapping_orphan_pointer':
      return 'planning-governance-mapping'
    case 'milestone_blocked':
    case 'milestone_missing_data':
    case 'milestone_needs_attention':
      return 'planning-governance-milestone'
    case 'closeout_reminder':
    case 'closeout_escalation':
    case 'closeout_unlock':
      return 'planning-governance-closeout'
    case 'reorder_reminder':
    case 'reorder_escalation':
    case 'reorder_summary':
      return 'planning-governance-reorder'
    case 'ad_hoc_cross_month_reminder':
      return 'planning-governance-ad-hoc'
    default:
      return 'planning-governance'
  }
}

function getPlanningGovernanceNotificationCategory(kind: PlanningGovernanceAlert['kind']) {
  if (kind === 'mapping_orphan_pointer') {
    return 'planning_mapping_orphan'
  }

  return 'planning_governance'
}

function buildMappingOrphanPointerAlert(snapshot: PlanningGovernanceSnapshot): PlanningGovernanceAlert | null {
  const pendingCount = snapshot.integrity.mapping_integrity.baseline_pending_count
  const mergedCount = snapshot.integrity.mapping_integrity.baseline_merged_count
  const carryoverCount = snapshot.integrity.mapping_integrity.monthly_carryover_count
  const total = pendingCount + mergedCount + carryoverCount

  if (total === 0) return null

  const severity: PlanningGovernanceAlert['severity'] =
    pendingCount > 0 || mergedCount > 0 ? 'critical' : 'warning'

  return {
    kind: 'mapping_orphan_pointer',
    severity,
    title: '规划映射存在孤立指针',
    detail: `映射孤立指针 ${total} 条，其中 baseline pending/missing ${pendingCount} 条、baseline merged ${mergedCount} 条、monthly carryover ${carryoverCount} 条。`,
    source_id: `${snapshot.project_id}:mapping_orphan_pointer`,
  }
}

function buildMilestoneScenarioAlerts(snapshot: PlanningGovernanceSnapshot): PlanningGovernanceAlert[] {
  return snapshot.integrity.milestone_integrity.items
    .filter((item) => item.state !== 'aligned')
    .map((item) => {
      const kind =
        item.state === 'blocked'
          ? 'milestone_blocked'
          : item.state === 'missing_data'
            ? 'milestone_missing_data'
            : 'milestone_needs_attention'

      const severity: PlanningGovernanceAlert['severity'] =
        item.state === 'needs_attention' ? 'warning' : 'critical'

      const title =
        item.state === 'blocked'
          ? `${item.milestone_key} 里程碑受阻`
          : item.state === 'missing_data'
            ? `${item.milestone_key} 里程碑缺少关键数据`
            : `${item.milestone_key} 里程碑需人工关注`

      return {
        kind,
        severity,
        title,
        detail: `里程碑 ${item.milestone_key}「${item.title}」存在 ${item.issues.join('；') || '异常场景'}。`,
        source_id: `${snapshot.project_id}:milestone:${item.milestone_id}:${kind}`,
      } satisfies PlanningGovernanceAlert
    })
}

export function buildCloseoutGovernanceAlerts(params: {
  projectId: string
  plans: MonthlyPlan[]
  now?: Date
}): PlanningGovernanceAlert[] {
  const now = params.now ?? new Date()
  const alerts: PlanningGovernanceAlert[] = []

  for (const plan of params.plans) {
    if (String(plan.status ?? '').trim() !== 'confirmed') continue
    if (plan.closeout_at) continue

    const dueTimestamp = monthBoundaryTimestamp(plan.month)
    if (dueTimestamp === null) continue

    const overdueDays = Math.max(0, daysBetween(dueTimestamp, now.getTime()))
    if (overdueDays < GOVERNANCE_CLOSEOUT_THRESHOLDS[0]) continue

    for (const threshold of GOVERNANCE_CLOSEOUT_THRESHOLDS) {
      if (overdueDays < threshold) continue

      const kind =
        threshold === 3
          ? 'closeout_reminder'
          : threshold === 5
            ? 'closeout_escalation'
            : 'closeout_unlock'

      alerts.push({
        kind,
        severity: threshold === 3 ? 'warning' : 'critical',
        title:
          threshold === 3
            ? '月度计划关账超期提醒'
            : threshold === 5
              ? '月度计划关账超期升级'
              : '月度计划可强制发起关账',
        detail: buildCloseoutAlertDetail(plan, overdueDays, threshold),
        source_id: `${params.projectId}:monthly_plan:${plan.id}:closeout:${threshold}`,
      })
    }
  }

  return alerts
}

export function buildExecutionReorderGovernanceAlerts(params: {
  projectId: string
  anomaly: PassiveReorderDetectionReport
  now?: Date
}): PlanningGovernanceAlert[] {
  const alerts: PlanningGovernanceAlert[] = []
  const windows = new Map(params.anomaly.windows.map((window) => [window.window_days, window]))

  for (const threshold of GOVERNANCE_REORDER_THRESHOLDS) {
    const window = windows.get(threshold)
    if (!window?.triggered) continue

    const kind =
      threshold === 3
        ? 'reorder_reminder'
        : threshold === 5
          ? 'reorder_escalation'
          : 'reorder_summary'

    alerts.push({
      kind,
      severity: threshold === 3 ? 'warning' : 'critical',
      title:
        threshold === 3
          ? '被动重排第3日提醒'
          : threshold === 5
            ? '被动重排第5日升级'
            : '被动重排结束并生成变更摘要',
      detail: buildReorderAlertDetail(window, threshold),
      source_id: `${params.projectId}:passive_reorder:${threshold}`,
    })
  }

  return alerts
}

export function buildAdHocCarryoverGovernanceAlerts(params: {
  projectId: string
  tasks: Task[]
  snapshots: TaskProgressSnapshot[]
  now?: Date
}): PlanningGovernanceAlert[] {
  const alerts: PlanningGovernanceAlert[] = []
  const snapshotsByTask = new Map<string, Set<string>>()

  for (const snapshot of params.snapshots) {
    const taskId = String(snapshot.task_id ?? '').trim()
    if (!taskId) continue

    const planningSourceType = String(snapshot.planning_source_type ?? 'execution').trim()
    if (!['execution', 'current_schedule'].includes(planningSourceType)) continue

    const month = normalizeMonthKey(snapshot.snapshot_date ?? snapshot.created_at)
    if (!month) continue

    if (!snapshotsByTask.has(taskId)) {
      snapshotsByTask.set(taskId, new Set())
    }

    snapshotsByTask.get(taskId)!.add(month)
  }

  for (const task of params.tasks) {
    const sourceType = String(task.task_source ?? '').trim().toLowerCase()
    const isAdHoc =
      sourceType === 'ad_hoc' ||
      (!sourceType && !task.monthly_plan_item_id && !task.baseline_item_id)

    if (!isAdHoc) continue

    const taskMonths = snapshotsByTask.get(task.id)
    const monthCount = taskMonths ? getLongestConsecutiveMonthStreak(taskMonths) : 0
    if (monthCount < 3) continue

    alerts.push({
      kind: 'ad_hoc_cross_month_reminder',
      severity: 'warning',
      title: '临时任务连续跨月未纳入月度计划',
      detail: `任务 "${task.title}" 已连续 ${monthCount} 个月以 ad_hoc 方式执行，且未挂接月度计划，请尽快纳入月度计划。`,
      source_id: `${params.projectId}:task:${task.id}:ad_hoc:month3`,
      task_id: task.id,
    })
  }

  return alerts
}

function buildGovernanceStateKey(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => String(part ?? '').trim())
    .filter((part) => Boolean(part))
    .join(':')
}

export function buildCloseoutGovernanceStates(params: {
  projectId: string
  plans: MonthlyPlan[]
  now?: Date
}): PlanningGovernanceState[] {
  const now = params.now ?? new Date()
  const states: PlanningGovernanceState[] = []

  for (const plan of params.plans) {
    if (String(plan.status ?? '').trim() !== 'confirmed') continue
    if (plan.closeout_at) continue

    const dueTimestamp = monthBoundaryTimestamp(plan.month)
    if (dueTimestamp === null) continue

    const overdueDays = Math.max(0, daysBetween(dueTimestamp, now.getTime()))
    if (overdueDays < GOVERNANCE_CLOSEOUT_THRESHOLDS[0]) continue

    for (const threshold of GOVERNANCE_CLOSEOUT_THRESHOLDS) {
      if (overdueDays < threshold) continue

      const kind =
        threshold === 3
          ? 'closeout_reminder'
          : threshold === 5
            ? 'closeout_overdue_signal'
            : 'closeout_force_unlock'

      states.push({
        id: uuidv4(),
        project_id: params.projectId,
        state_key: buildGovernanceStateKey([params.projectId, 'monthly_plan', plan.id, kind]),
        category: 'closeout',
        kind,
        status: threshold === 7 ? 'active' : 'active',
        severity: threshold === 3 ? 'warning' : 'critical',
        title:
          threshold === 3
            ? '月度计划关账提醒'
            : threshold === 5
              ? '月度计划关账超期信号'
              : '月度计划强制关账权限已解锁',
        detail: buildCloseoutAlertDetail(plan, overdueDays, threshold),
        threshold_day: threshold,
        dashboard_signal: threshold === 5,
        payload: {
          monthly_plan_id: plan.id,
          month: plan.month,
          overdue_days: overdueDays,
          threshold_day: threshold,
          force_unlock_enabled: threshold === 7,
          dashboard_signal: threshold === 5,
        },
        source_entity_type: 'monthly_plan',
        source_entity_id: plan.id,
        active_from: now.toISOString(),
        resolved_at: null,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
    }
  }

  return states
}

export function buildExecutionReorderGovernanceStates(params: {
  projectId: string
  anomaly: PassiveReorderDetectionReport
  now?: Date
}): PlanningGovernanceState[] {
  const now = params.now ?? new Date()
  const states: PlanningGovernanceState[] = []
  const windows = new Map(params.anomaly.windows.map((window) => [window.window_days, window]))

  for (const threshold of GOVERNANCE_REORDER_THRESHOLDS) {
    const window = windows.get(threshold)
    if (!window?.triggered) continue

    const kind =
      threshold === 3
        ? 'reorder_reminder'
        : threshold === 5
          ? 'reorder_escalation'
          : 'reorder_summary'

    states.push({
      id: uuidv4(),
      project_id: params.projectId,
      state_key: buildGovernanceStateKey([params.projectId, 'passive_reorder', threshold, kind]),
      category: 'reorder',
      kind,
      status: threshold === 7 ? 'resolved' : 'active',
      severity: threshold === 3 ? 'warning' : 'critical',
      title:
        threshold === 3
          ? '被动重排提醒'
          : threshold === 5
            ? '被动重排升级'
            : '被动重排已自动结束并生成变更摘要',
      detail: buildReorderAlertDetail(window, threshold),
      threshold_day: threshold,
      dashboard_signal: false,
      payload: {
        window_days: window.window_days,
        event_count: window.event_count,
        affected_task_count: window.affected_task_count,
        average_offset_days: window.average_offset_days ?? 0,
        key_task_count: window.key_task_count ?? 0,
        automatic_closeout: threshold === 7,
        change_summary_generated: threshold === 7,
      },
      source_entity_type: 'change_log',
      source_entity_id: buildGovernanceStateKey([params.projectId, 'passive_reorder', threshold]),
      active_from: now.toISOString(),
      resolved_at: threshold === 7 ? now.toISOString() : null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
  }

  return states
}

export function buildAdHocCarryoverGovernanceStates(params: {
  projectId: string
  tasks: Task[]
  snapshots: TaskProgressSnapshot[]
  now?: Date
}): PlanningGovernanceState[] {
  const now = params.now ?? new Date()
  const states: PlanningGovernanceState[] = []
  const snapshotsByTask = new Map<string, Set<string>>()

  for (const snapshot of params.snapshots) {
    const taskId = String(snapshot.task_id ?? '').trim()
    if (!taskId) continue

    const planningSourceType = String(snapshot.planning_source_type ?? 'execution').trim()
    if (!['execution', 'current_schedule'].includes(planningSourceType)) continue

    const month = normalizeMonthKey(snapshot.snapshot_date ?? snapshot.created_at)
    if (!month) continue

    if (!snapshotsByTask.has(taskId)) {
      snapshotsByTask.set(taskId, new Set())
    }

    snapshotsByTask.get(taskId)!.add(month)
  }

  for (const task of params.tasks) {
    const sourceType = String(task.task_source ?? '').trim().toLowerCase()
    const isAdHoc =
      sourceType === 'ad_hoc' ||
      (!sourceType && !task.monthly_plan_item_id && !task.baseline_item_id)

    if (!isAdHoc) continue

    const taskMonths = snapshotsByTask.get(task.id)
    const monthCount = taskMonths ? getLongestConsecutiveMonthStreak(taskMonths) : 0
    if (monthCount < 3) continue

    states.push({
      id: uuidv4(),
      project_id: params.projectId,
      state_key: buildGovernanceStateKey([params.projectId, 'task', task.id, 'ad_hoc_cross_month']),
      category: 'ad_hoc',
      kind: 'ad_hoc_cross_month_reminder',
      status: 'active',
      severity: 'warning',
      title: '临时任务连续跨月未纳入月度计划',
      detail: `任务 "${task.title}" 已连续 ${monthCount} 个月以 ad_hoc 方式执行，且未挂接月度计划，请尽快纳入月度计划。`,
      threshold_day: monthCount,
      dashboard_signal: false,
      payload: {
        task_id: task.id,
        consecutive_months: monthCount,
        task_source: sourceType || 'ad_hoc',
      },
      source_entity_type: 'task',
      source_entity_id: task.id,
      active_from: now.toISOString(),
      resolved_at: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
  }

  return states
}

function buildManualReorderStateKey(projectId: string) {
  return buildGovernanceStateKey([projectId, 'manual_reorder_session'])
}

function normalizeManualReorderMode(value: unknown): ManualReorderMode {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'sequence') return 'sequence'
  if (normalized === 'date_shift') return 'date_shift'
  if (normalized === 'scope_change') return 'scope_change'
  return 'mixed'
}

function parseManualReorderPayload(value: unknown): ManualReorderSessionPayload | null {
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  return {
    reorder_mode: normalizeManualReorderMode(record.reorder_mode),
    started_by: typeof record.started_by === 'string' ? record.started_by : null,
    started_at: String(record.started_at ?? ''),
    note: typeof record.note === 'string' ? record.note : null,
    start_snapshot: (record.start_snapshot as ManualReorderStartSnapshot) ?? {
      total_tasks: 0,
      critical_task_count: 0,
      milestone_task_count: 0,
      confirmed_baseline_count: 0,
      active_monthly_plan_count: 0,
      pending_realign_count: 0,
    },
    ended_by: typeof record.ended_by === 'string' ? record.ended_by : null,
    ended_at: typeof record.ended_at === 'string' ? record.ended_at : null,
    end_summary: (record.end_summary as ManualReorderEndSummary | null | undefined) ?? null,
    completion_note: typeof record.completion_note === 'string' ? record.completion_note : null,
  }
}

async function collectManualReorderStartSnapshot(projectId: string): Promise<ManualReorderStartSnapshot> {
  const [tasks, baselines, monthlyPlans] = await Promise.all([
    executeSQL<Task>('SELECT * FROM tasks WHERE project_id = ?', [projectId]),
    executeSQL<{ id: string; status?: string | null }>('SELECT id, status FROM task_baselines WHERE project_id = ?', [projectId]),
    executeSQL<{ id: string; status?: string | null }>('SELECT id, status FROM monthly_plans WHERE project_id = ?', [projectId]),
  ])

  return {
    total_tasks: tasks.length,
    critical_task_count: tasks.filter((task) => Boolean(task.is_critical)).length,
    milestone_task_count: tasks.filter((task) => Boolean(task.is_milestone)).length,
    confirmed_baseline_count: baselines.filter((row) => String(row.status ?? '').trim() === 'confirmed').length,
    active_monthly_plan_count: monthlyPlans.filter((row) => ['draft', 'confirmed', 'pending_realign', 'revising'].includes(String(row.status ?? '').trim())).length,
    pending_realign_count: [
      ...baselines.filter((row) => String(row.status ?? '').trim() === 'pending_realign'),
      ...monthlyPlans.filter((row) => String(row.status ?? '').trim() === 'pending_realign'),
    ].length,
  }
}

async function collectManualReorderEndSummary(projectId: string, startedAt: string): Promise<ManualReorderEndSummary> {
  const logs = await executeSQL<{
    entity_type?: string | null
    entity_id?: string | null
    field_name?: string | null
    changed_at?: string | null
  }>(
    'SELECT entity_type, entity_id, field_name, changed_at FROM change_logs WHERE project_id = ? ORDER BY changed_at ASC',
    [projectId],
  )

  const startedAtValue = new Date(startedAt).getTime()
  const scopedLogs = logs.filter((row) => {
    const changedAtValue = new Date(String(row.changed_at ?? '')).getTime()
    return Number.isFinite(changedAtValue) && changedAtValue >= startedAtValue
  })

  const taskIds = new Set(
    scopedLogs
      .filter((row) => String(row.entity_type ?? '').trim() === 'task')
      .map((row) => String(row.entity_id ?? '').trim())
      .filter(Boolean),
  )
  const baselineIds = new Set(
    scopedLogs
      .filter((row) => String(row.entity_type ?? '').trim() === 'baseline')
      .map((row) => String(row.entity_id ?? '').trim())
      .filter(Boolean),
  )
  const monthlyPlanIds = new Set(
    scopedLogs
      .filter((row) => String(row.entity_type ?? '').trim() === 'monthly_plan')
      .map((row) => String(row.entity_id ?? '').trim())
      .filter(Boolean),
  )
  const fieldNames = new Set(
    scopedLogs
      .map((row) => String(row.field_name ?? '').trim())
      .filter(Boolean),
  )

  return {
    duration_minutes: Math.max(0, Math.round((Date.now() - startedAtValue) / 60000)),
    changed_task_count: taskIds.size,
    changed_baseline_count: baselineIds.size,
    changed_monthly_plan_count: monthlyPlanIds.size,
    changed_field_count: fieldNames.size,
    change_log_count: scopedLogs.length,
  }
}

async function listActiveManualReorderStates(projectId: string): Promise<PlanningGovernanceState[]> {
  return await executeSQL<PlanningGovernanceState>(
    'SELECT * FROM planning_governance_states WHERE project_id = ? AND category = ? AND kind = ? AND status = ? ORDER BY created_at DESC',
    [projectId, 'reorder', 'manual_reorder_session', 'active'],
  )
}

async function syncPlanningGovernanceStates(projectId: string, states: PlanningGovernanceState[]): Promise<PlanningGovernanceState[]> {
  const now = new Date().toISOString()
  const existing = await executeSQL<PlanningGovernanceState>('SELECT * FROM planning_governance_states WHERE project_id = ?', [projectId])
  const existingByKey = new Map(existing.map((row) => [row.state_key, row]))
  const currentKeys = new Set(states.map((state) => state.state_key))
  const persisted: PlanningGovernanceState[] = []

  for (const state of states) {
    const prior = existingByKey.get(state.state_key)
    const row: PlanningGovernanceState = {
      ...state,
      id: prior?.id ?? state.id ?? uuidv4(),
      active_from: prior?.active_from ?? state.active_from ?? now,
      resolved_at: state.status === 'resolved' ? (state.resolved_at ?? now) : null,
      created_at: prior?.created_at ?? state.created_at ?? now,
      updated_at: now,
    }

    await executeSQL(
      `INSERT INTO planning_governance_states
        (id, project_id, state_key, category, kind, status, severity, title, detail, threshold_day, dashboard_signal, payload, source_entity_type, source_entity_id, active_from, resolved_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(state_key) DO UPDATE SET
         project_id = excluded.project_id,
         category = excluded.category,
         kind = excluded.kind,
         status = excluded.status,
         severity = excluded.severity,
         title = excluded.title,
         detail = excluded.detail,
         threshold_day = excluded.threshold_day,
         dashboard_signal = excluded.dashboard_signal,
         payload = excluded.payload,
         source_entity_type = excluded.source_entity_type,
         source_entity_id = excluded.source_entity_id,
         active_from = excluded.active_from,
         resolved_at = excluded.resolved_at,
         updated_at = excluded.updated_at`,
      [
        row.id,
        row.project_id,
        row.state_key,
        row.category,
        row.kind,
        row.status,
        row.severity,
        row.title,
        row.detail,
        row.threshold_day ?? null,
        row.dashboard_signal ? 1 : 0,
        row.payload ?? {},
        row.source_entity_type ?? null,
        row.source_entity_id ?? null,
        row.active_from ?? null,
        row.resolved_at ?? null,
        row.created_at,
        row.updated_at,
      ],
    )

    persisted.push(row)
  }

  for (const row of existing) {
    if (currentKeys.has(row.state_key) || row.status !== 'active') continue

    const resolvedAt = now
    await executeSQL(
      'UPDATE planning_governance_states SET status = ?, resolved_at = ?, updated_at = ? WHERE state_key = ?',
      ['resolved', resolvedAt, resolvedAt, row.state_key],
    )
  }

  return persisted
}

async function upsertPlanningGovernanceState(state: PlanningGovernanceState): Promise<PlanningGovernanceState> {
  await executeSQL(
    `INSERT INTO planning_governance_states
      (id, project_id, state_key, category, kind, status, severity, title, detail, threshold_day, dashboard_signal, payload, source_entity_type, source_entity_id, active_from, resolved_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(state_key) DO UPDATE SET
       project_id = excluded.project_id,
       category = excluded.category,
       kind = excluded.kind,
       status = excluded.status,
       severity = excluded.severity,
       title = excluded.title,
       detail = excluded.detail,
       threshold_day = excluded.threshold_day,
       dashboard_signal = excluded.dashboard_signal,
       payload = excluded.payload,
       source_entity_type = excluded.source_entity_type,
       source_entity_id = excluded.source_entity_id,
       active_from = excluded.active_from,
       resolved_at = excluded.resolved_at,
       updated_at = excluded.updated_at`,
    [
      state.id,
      state.project_id,
      state.state_key,
      state.category,
      state.kind,
      state.status,
      state.severity,
      state.title,
      state.detail,
      state.threshold_day ?? null,
      state.dashboard_signal ? 1 : 0,
      state.payload ?? {},
      state.source_entity_type ?? null,
      state.source_entity_id ?? null,
      state.active_from ?? null,
      state.resolved_at ?? null,
      state.created_at,
      state.updated_at,
    ],
  )

  return state
}

export function buildAlerts(snapshot: PlanningGovernanceSnapshot): PlanningGovernanceAlert[] {
  const alerts: PlanningGovernanceAlert[] = []

  if (snapshot.health.score < 80) {
    alerts.push({
      kind: 'health',
      severity: getAlertSeverity(snapshot.health),
      title: 'Planning health needs attention',
      detail: `Health score is ${snapshot.health.score}/100. M1-M9 score ${snapshot.health.breakdown.m1_m9_score}, passive reorder penalty ${snapshot.health.breakdown.passive_reorder_penalty}.`,
      source_id: `${snapshot.project_id}:health`,
    })
  }

  const integritySummary = snapshot.integrity
  const dataIssues =
    integritySummary.data_integrity.missing_participant_unit_count +
    integritySummary.data_integrity.missing_scope_dimension_count +
    integritySummary.data_integrity.missing_progress_snapshot_count
  const mappingIssues =
    integritySummary.mapping_integrity.baseline_pending_count +
    integritySummary.mapping_integrity.baseline_merged_count +
    integritySummary.mapping_integrity.monthly_carryover_count
  const milestoneIssues =
    integritySummary.milestone_integrity.summary.blocked +
    integritySummary.milestone_integrity.summary.missing_data +
    integritySummary.milestone_integrity.summary.needs_attention
  const systemIssues = integritySummary.system_consistency.inconsistent_milestones + integritySummary.system_consistency.stale_snapshot_count

  if (dataIssues > 0 || mappingIssues > 0 || milestoneIssues > 0 || systemIssues > 0) {
    alerts.push({
      kind: 'integrity',
      severity: getAlertSeverity(snapshot.integrity),
      title: 'Planning integrity needs review',
      detail: `Data issues ${dataIssues}, mapping issues ${mappingIssues}, milestone issues ${milestoneIssues}, system issues ${systemIssues}.`,
      source_id: `${snapshot.project_id}:integrity`,
    })
  }

  const mappingOrphanAlert = buildMappingOrphanPointerAlert(snapshot)
  if (mappingOrphanAlert) {
    alerts.push(mappingOrphanAlert)
  }

  alerts.push(...buildMilestoneScenarioAlerts(snapshot))

  const triggeredWindows = snapshot.anomaly.windows.filter((window) => window.triggered)
  if (triggeredWindows.length > 0) {
    alerts.push({
      kind: 'anomaly',
      severity: getAlertSeverity(snapshot.anomaly),
      title: 'Passive reorder detected',
      detail: triggeredWindows
        .map((window) => `${window.window_days}d window: ${window.event_count} events, ${window.key_task_count ?? 0} key tasks, average offset ${window.average_offset_days ?? 0} days`)
        .join(' | '),
      source_id: `${snapshot.project_id}:anomaly`,
    })
  }

  return alerts
}

async function getProjectRecipients(projectId: string, scope: 'owner' | 'owner_admin' = 'owner_admin'): Promise<string[]> {
  const [project, members] = await Promise.all([
    executeSQLOne<ProjectOwnerRow>('SELECT id, owner_id FROM projects WHERE id = ? LIMIT 1', [projectId]),
    executeSQL<ProjectMemberRow>('SELECT project_id, user_id, permission_level FROM project_members WHERE project_id = ?', [projectId]),
  ])

  const ownerRecipients = uniqueStrings([project?.owner_id ?? null])
  if (scope === 'owner') {
    if (ownerRecipients.length > 0) {
      return ownerRecipients
    }
  }

  return uniqueStrings([
    ...ownerRecipients,
    ...((members ?? [])
      .filter((member) => normalizeProjectPermissionLevel(member.permission_level ?? member.role) === 'owner')
      .map((member) => member.user_id)),
  ])
}

async function persistAlertNotification(projectId: string, alert: PlanningGovernanceAlert): Promise<Notification | null> {
  const recipients = await getProjectRecipients(projectId, getProjectNotificationScope(alert.kind))
  if (recipients.length === 0) return null
  const notificationCategory = getPlanningGovernanceNotificationCategory(alert.kind)

  const existing = await findNotification({
    projectId,
    sourceEntityType: 'planning_governance',
    sourceEntityId: alert.source_id,
    type: `planning_gov_${alert.kind}`,
  })

  if (existing) return existing

  const now = new Date().toISOString()
  return await insertNotification({
    id: uuidv4(),
    project_id: projectId,
    type: `planning_gov_${alert.kind}`,
    notification_type: getPlanningGovernanceNotificationType(alert.kind),
    severity: alert.severity,
    title: alert.title,
    content: alert.detail,
    is_read: false,
    is_broadcast: alert.severity === 'critical',
    source_entity_type: 'planning_governance',
    source_entity_id: alert.source_id,
    category: notificationCategory,
    task_id: alert.task_id ?? null,
    delay_request_id: alert.delay_request_id ?? null,
    recipients,
    status: 'unread',
    metadata: {
      category: notificationCategory,
      alert_kind: alert.kind,
    },
    created_at: now,
  })
}

export class PlanningGovernanceService {
  private healthService = new PlanningHealthService()
  private integrityService = new PlanningIntegrityService()
  private anomalyService = new SystemAnomalyService()

  async startProjectReorderSession(params: {
    projectId: string
    actorUserId?: string | null
    reorderMode?: string | null
    note?: string | null
  }): Promise<PlanningGovernanceState> {
    const existing = (await listActiveManualReorderStates(params.projectId))[0] ?? null
    if (existing) {
      throw Object.assign(new Error('当前项目已有进行中的主动重排会话'), {
        code: 'MANUAL_REORDER_ALREADY_ACTIVE',
        statusCode: 409,
      })
    }

    const now = new Date().toISOString()
    const payload: ManualReorderSessionPayload = {
      reorder_mode: normalizeManualReorderMode(params.reorderMode),
      started_by: params.actorUserId ?? null,
      started_at: now,
      note: params.note ?? null,
      start_snapshot: await collectManualReorderStartSnapshot(params.projectId),
      ended_by: null,
      ended_at: null,
      end_summary: null,
      completion_note: null,
    }

    const state: PlanningGovernanceState = {
      id: uuidv4(),
      project_id: params.projectId,
      state_key: buildManualReorderStateKey(params.projectId),
      category: 'reorder',
      kind: 'manual_reorder_session' as PlanningGovernanceState['kind'],
      status: 'active',
      severity: 'info',
      title: '主动重排进行中',
      detail: `已启动 ${payload.reorder_mode} 模式的主动重排。`,
      threshold_day: null,
      dashboard_signal: false,
      payload,
      source_entity_type: 'planning_governance',
      source_entity_id: buildManualReorderStateKey(params.projectId),
      active_from: now,
      resolved_at: null,
      created_at: now,
      updated_at: now,
    }

    const persisted = await upsertPlanningGovernanceState(state)
    await writeLog({
      project_id: params.projectId,
      entity_type: 'planning_governance',
      entity_id: params.projectId,
      field_name: 'manual_reorder_session',
      old_value: null,
      new_value: 'active',
      change_reason: params.note ?? null,
      changed_by: params.actorUserId ?? null,
      change_source: 'manual_adjusted',
    })
    return persisted
  }

  async finishProjectReorderSession(params: {
    projectId: string
    actorUserId?: string | null
    note?: string | null
  }): Promise<PlanningGovernanceState> {
    const current = (await listActiveManualReorderStates(params.projectId))[0] ?? null
    if (!current) {
      throw Object.assign(new Error('当前项目没有进行中的主动重排会话'), {
        code: 'MANUAL_REORDER_NOT_ACTIVE',
        statusCode: 404,
      })
    }

    const now = new Date().toISOString()
    const currentPayload = parseManualReorderPayload(current.payload)
    const startedAt = currentPayload?.started_at || current.active_from || current.created_at
    const nextPayload: ManualReorderSessionPayload = {
      reorder_mode: currentPayload?.reorder_mode ?? 'mixed',
      started_by: currentPayload?.started_by ?? null,
      started_at: startedAt,
      note: currentPayload?.note ?? null,
      start_snapshot: currentPayload?.start_snapshot ?? await collectManualReorderStartSnapshot(params.projectId),
      ended_by: params.actorUserId ?? null,
      ended_at: now,
      end_summary: await collectManualReorderEndSummary(params.projectId, startedAt),
      completion_note: params.note ?? null,
    }

    const resolvedState: PlanningGovernanceState = {
      ...current,
      category: 'reorder',
      kind: 'manual_reorder_session' as PlanningGovernanceState['kind'],
      status: 'resolved',
      severity: 'info',
      detail: `主动重排已结束，涉及 ${nextPayload.end_summary?.changed_task_count ?? 0} 个任务变更。`,
      payload: nextPayload,
      resolved_at: now,
      updated_at: now,
    }

    const persisted = await upsertPlanningGovernanceState(resolvedState)
    await writeLog({
      project_id: params.projectId,
      entity_type: 'planning_governance',
      entity_id: params.projectId,
      field_name: 'manual_reorder_session',
      old_value: 'active',
      new_value: 'resolved',
      change_reason: params.note ?? null,
      changed_by: params.actorUserId ?? null,
      change_source: 'manual_adjusted',
    })
    return persisted
  }

  async scanProjectGovernance(projectId: string): Promise<PlanningGovernanceSnapshot> {
    const [health, integrity, anomaly, monthlyPlans, tasks, manualReorderStates] = await Promise.all([
      this.healthService.evaluateProjectHealth(projectId),
      this.integrityService.scanProjectIntegrity(projectId),
      this.anomalyService.scanProjectPassiveReorder(projectId),
      executeSQL<MonthlyPlan>('SELECT * FROM monthly_plans WHERE project_id = ?', [projectId]),
      executeSQL<Task>('SELECT * FROM tasks WHERE project_id = ?', [projectId]),
      listActiveManualReorderStates(projectId),
    ])

    const taskIds = tasks.map((task) => task.id)
    const snapshots = await listTaskProgressSnapshotsByTaskIds(taskIds)

    const snapshot: PlanningGovernanceSnapshot = {
      project_id: projectId,
      health,
      integrity,
      anomaly,
      alerts: [],
      states: [],
    }

    const states = [
      ...buildCloseoutGovernanceStates({ projectId, plans: monthlyPlans }),
      ...buildExecutionReorderGovernanceStates({ projectId, anomaly }),
      ...buildAdHocCarryoverGovernanceStates({ projectId, tasks, snapshots }),
      ...manualReorderStates,
    ]
    snapshot.alerts = [
      ...buildAlerts(snapshot),
      ...buildCloseoutGovernanceAlerts({ projectId, plans: monthlyPlans }),
      ...buildExecutionReorderGovernanceAlerts({ projectId, anomaly }),
      ...buildAdHocCarryoverGovernanceAlerts({ projectId, tasks, snapshots }),
    ]
    snapshot.states = await syncPlanningGovernanceStates(projectId, states)
    return snapshot
  }

  async scanAllProjectGovernance(): Promise<PlanningGovernanceSnapshot[]> {
    const projectIds = await listActiveProjectIds()
    const reports: PlanningGovernanceSnapshot[] = []

    for (const projectId of projectIds) {
      reports.push(await this.scanProjectGovernance(projectId))
    }

    return reports
  }

  async persistProjectGovernanceNotifications(projectId?: string): Promise<Notification[]> {
    const reports = projectId
      ? [await this.scanProjectGovernance(projectId)]
      : await this.scanAllProjectGovernance()

    const persisted: Notification[] = []
    for (const report of reports) {
      for (const alert of report.alerts) {
        const notification = await persistAlertNotification(report.project_id, alert)
        if (notification) {
          persisted.push(notification)
        }
      }
      enqueueProjectHealthUpdate(report.project_id, 'planning_governance_notification')
    }

    return persisted
  }
}

export const planningGovernanceService = new PlanningGovernanceService()
