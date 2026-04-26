import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { v4 as uuidv4 } from 'uuid'
import { listActiveProjectIds } from './activeProjectService.js'
import { writeLog } from './changeLogs.js'
import { executeSQL, executeSQLOne } from './dbService.js'
import { insertNotification, listNotifications, updateNotificationById } from './notificationStore.js'
import type { Notification } from '../types/db.js'
import type {
  MilestoneIntegrityReport,
  MilestoneIntegrityRow,
  MilestoneIntegrityState,
} from '../types/planning.js'

export interface MilestoneIntegritySourceRow {
  id: string
  project_id: string
  name?: string | null
  title?: string | null
  target_date?: string | null
  baseline_date?: string | null
  current_plan_date?: string | null
  actual_date?: string | null
  completed_at?: string | null
  status?: string | null
  version?: number | null
  milestone_order?: number | null
}

const MILESTONE_KEYS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'] as const

interface ProjectOwnerRow {
  id: string
  owner_id?: string | null
}

interface ProjectMemberRow {
  project_id: string
  user_id: string
  role?: string | null
  permission_level?: string | null
}

function toTimestamp(value?: string | null): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function normalizeDate(value?: string | null): string | null {
  if (!value) return null
  const timestamp = toTimestamp(value)
  return timestamp === null ? null : new Date(timestamp).toISOString()
}

function selectAnchorDate(milestone: MilestoneIntegritySourceRow): string | null {
  return milestone.current_plan_date || milestone.baseline_date || milestone.target_date || milestone.actual_date || milestone.completed_at || null
}

function deriveMilestoneKey(index: number, milestone: MilestoneIntegritySourceRow): typeof MILESTONE_KEYS[number] {
  const directOrder = Number(milestone.milestone_order ?? NaN)
  if (Number.isFinite(directOrder) && directOrder >= 1 && directOrder <= 9) {
    return MILESTONE_KEYS[directOrder - 1]
  }

  const label = [milestone.name, milestone.title].filter(Boolean).join(' ')
  const match = label.match(/(?:^|\b)M([1-9])(?:\b|$)/i)
  if (match?.[1]) {
    return MILESTONE_KEYS[Number(match[1]) - 1]
  }

  return MILESTONE_KEYS[Math.min(index, MILESTONE_KEYS.length - 1)]
}

function evaluateMilestoneState(milestone: MilestoneIntegritySourceRow): { state: MilestoneIntegrityState; issues: string[] } {
  const issues: string[] = []
  const plannedDate = normalizeDate(milestone.baseline_date || milestone.target_date)
  const currentPlannedDate = normalizeDate(milestone.current_plan_date || milestone.baseline_date || milestone.target_date)
  const actualDate = normalizeDate(milestone.actual_date || milestone.completed_at)
  const status = String(milestone.status || '').trim().toLowerCase()

  if (!plannedDate) issues.push('missing planned date')
  if (!currentPlannedDate) issues.push('missing current planned date')

  if (plannedDate && currentPlannedDate) {
    const plannedTs = toTimestamp(plannedDate)
    const currentTs = toTimestamp(currentPlannedDate)
    if (plannedTs !== null && currentTs !== null && currentTs < plannedTs) {
      issues.push('current planned date earlier than baseline date')
    }
  }

  if (status === 'completed' && !actualDate) {
    issues.push('missing actual date for completed milestone')
  }

  if (actualDate && currentPlannedDate) {
    const actualTs = toTimestamp(actualDate)
    const currentTs = toTimestamp(currentPlannedDate)
    if (actualTs !== null && currentTs !== null && actualTs > currentTs) {
      issues.push('actual date exceeds current plan')
    }
  }

  const state: MilestoneIntegrityState =
    issues.length === 0
      ? 'aligned'
      : issues.some((issue) => issue.includes('actual date exceeds') || issue.includes('missing actual date'))
        ? 'blocked'
        : issues.some((issue) => issue.includes('missing'))
          ? 'missing_data'
          : 'needs_attention'

  return { state, issues }
}

export function evaluateMilestoneIntegrityRows(
  projectId: string,
  milestones: MilestoneIntegritySourceRow[],
): MilestoneIntegrityReport {
  const ordered = [...milestones].sort((left, right) => {
    const leftAnchor = toTimestamp(selectAnchorDate(left)) ?? 0
    const rightAnchor = toTimestamp(selectAnchorDate(right)) ?? 0
    return leftAnchor - rightAnchor
  })

  const items: MilestoneIntegrityRow[] = ordered.slice(0, 9).map((milestone, index) => {
    const stateResult = evaluateMilestoneState(milestone)
    return {
      milestone_id: milestone.id,
      milestone_key: deriveMilestoneKey(index, milestone),
      title: milestone.title || milestone.name || milestone.id,
      planned_date: normalizeDate(milestone.baseline_date || milestone.target_date),
      current_planned_date: normalizeDate(milestone.current_plan_date || milestone.baseline_date || milestone.target_date),
      actual_date: normalizeDate(milestone.actual_date || milestone.completed_at),
      state: stateResult.state,
      issues: stateResult.issues,
    }
  })

  const summary = {
    total: items.length,
    aligned: items.filter((item) => item.state === 'aligned').length,
    needs_attention: items.filter((item) => item.state === 'needs_attention').length,
    missing_data: items.filter((item) => item.state === 'missing_data').length,
    blocked: items.filter((item) => item.state === 'blocked').length,
  }

  return {
    project_id: projectId,
    summary,
    items,
  }
}

function nowIso() {
  return new Date().toISOString()
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
}

type MilestoneScenarioType =
  | 'milestone_mapping_pending'      // M1
  | 'milestone_pending_takeover'     // M2
  | 'milestone_execution_closed'     // M5
  | 'milestone_baseline_removed'     // M6
  | 'milestone_data_incomplete'      // M7
  | 'milestone_deviation_excessive'  // M8
  | 'milestone_no_baseline'          // M9

const MILESTONE_SCENARIO_LABELS: Record<MilestoneScenarioType, string> = {
  milestone_mapping_pending: 'M1 基线映射待补',
  milestone_pending_takeover: 'M2 待承接',
  milestone_execution_closed: 'M5 执行层已关闭',
  milestone_baseline_removed: 'M6 基线已移除',
  milestone_data_incomplete: 'M7 数据不完整',
  milestone_deviation_excessive: 'M8 偏差过大',
  milestone_no_baseline: 'M9 未关联基线',
}

const MILESTONE_SCENARIO_ACTIONS: Record<MilestoneScenarioType, string> = {
  milestone_mapping_pending: '请补齐基线映射并回到基线页确认。',
  milestone_pending_takeover: '请确认承接关系并补齐执行层节点。',
  milestone_execution_closed: '请改为关闭/取消或重新激活执行层节点。',
  milestone_baseline_removed: '请重新确认基线版本并修复映射。',
  milestone_data_incomplete: '请补全三时间字段后再继续跟踪。',
  milestone_deviation_excessive: '请纳入修订观察池并评估偏差原因。',
  milestone_no_baseline: '请补充基线来源或标记为临时新增。',
}

const MILESTONE_NOTIFICATION_TYPES: MilestoneScenarioType[] = [
  'milestone_mapping_pending',
  'milestone_pending_takeover',
  'milestone_execution_closed',
  'milestone_baseline_removed',
  'milestone_data_incomplete',
  'milestone_deviation_excessive',
  'milestone_no_baseline',
]

const MILESTONE_NOTIFICATION_TYPE_BY_KEY: Record<typeof MILESTONE_KEYS[number], MilestoneScenarioType | null> = {
  M1: 'milestone_mapping_pending',
  M2: 'milestone_pending_takeover',
  M3: null,
  M4: null,
  M5: 'milestone_execution_closed',
  M6: 'milestone_baseline_removed',
  M7: 'milestone_data_incomplete',
  M8: 'milestone_deviation_excessive',
  M9: 'milestone_no_baseline',
}

function resolveMilestoneScenarioType(item: MilestoneIntegrityRow): MilestoneScenarioType | null {
  return MILESTONE_NOTIFICATION_TYPE_BY_KEY[item.milestone_key] ?? null
}

function getMilestoneScenarioLabel(type: MilestoneScenarioType): string {
  return MILESTONE_SCENARIO_LABELS[type]
}

function deriveSuggestedAction(type: MilestoneScenarioType): string {
  return MILESTONE_SCENARIO_ACTIONS[type]
}

function buildMilestoneNotificationType(item: MilestoneIntegrityRow): MilestoneScenarioType | null {
  return resolveMilestoneScenarioType(item)
}

function buildMilestoneNotificationTitle(item: MilestoneIntegrityRow) {
  return `${item.milestone_key} 里程碑完整性异常`
}

function buildMilestoneNotificationContent(item: MilestoneIntegrityRow, scenarioType: MilestoneScenarioType) {
  const issueSummary = item.issues.join('；')
  const suggestedAction = deriveSuggestedAction(scenarioType)
  return `里程碑「${item.title}」触发 ${getMilestoneScenarioLabel(scenarioType)}，当前状态：${item.state}；问题：${issueSummary}；建议动作：${suggestedAction}`
}

function readMilestoneStateFromNotification(notification?: Notification | null): MilestoneIntegrityState | null {
  const value =
    notification
    && typeof notification.metadata === 'object'
    && notification.metadata
    && 'milestone_state' in notification.metadata
      ? notification.metadata.milestone_state
      : null

  if (
    value === 'aligned'
    || value === 'needs_attention'
    || value === 'missing_data'
    || value === 'blocked'
  ) {
    return value
  }

  const type = String(notification?.type ?? '').trim()
  if (type === 'milestone_needs_attention') return 'needs_attention'
  if (type === 'milestone_missing_data') return 'missing_data'
  if (type === 'milestone_blocked') return 'blocked'
  if (type === 'milestone_data_incomplete') return 'missing_data'
  if (type === 'milestone_execution_closed') return 'blocked'
  if (type === 'milestone_mapping_pending') return 'needs_attention'
  if (type === 'milestone_pending_takeover') return 'needs_attention'
  if (type === 'milestone_baseline_removed') return 'needs_attention'
  if (type === 'milestone_deviation_excessive') return 'needs_attention'
  if (type === 'milestone_no_baseline') return 'needs_attention'

  return null
}

async function writeMilestoneIntegrityLog(params: {
  projectId: string
  item: Pick<MilestoneIntegrityRow, 'milestone_id' | 'state' | 'issues'>
  previousState?: MilestoneIntegrityState | null
  nextState: MilestoneIntegrityState
  changeReason: string
}) {
  const oldValue = params.previousState ?? null
  if (oldValue === params.nextState) return

  await writeLog({
    project_id: params.projectId,
    entity_type: 'milestone',
    entity_id: params.item.milestone_id,
    field_name: 'integrity_state',
    old_value: oldValue,
    new_value: params.nextState,
    change_reason: params.changeReason,
    change_source: 'system_auto',
  })
}

async function getProjectRecipients(projectId: string) {
  const [project, members] = await Promise.all([
    executeSQLOne<ProjectOwnerRow>('SELECT id, owner_id FROM projects WHERE id = ? LIMIT 1', [projectId]),
    executeSQL<ProjectMemberRow>('SELECT project_id, user_id, role, permission_level FROM project_members WHERE project_id = ?', [projectId]),
  ])

  return uniqueStrings([
    project?.owner_id ?? null,
    ...(members ?? [])
      .filter((member) => {
        const role = normalizeProjectPermissionLevel(member.permission_level ?? member.role)
        return role === 'owner'
      })
      .map((member) => member.user_id),
  ])
}

async function buildMilestoneNotificationRow(projectId: string, item: MilestoneIntegrityRow): Promise<Notification | null> {
  const recipients = await getProjectRecipients(projectId)
  if (recipients.length === 0) return null

  const scenarioType = buildMilestoneNotificationType(item)
  if (!scenarioType) return null

  const severity = scenarioType === 'milestone_execution_closed' || scenarioType === 'milestone_baseline_removed'
    ? 'critical'
    : 'warning'
  const timestamp = nowIso()
  const suggestedAction = deriveSuggestedAction(scenarioType)
  const jumpUrl = `/projects/${projectId}/milestones?highlight=${item.milestone_id}`

  return {
    id: uuidv4(),
    project_id: projectId,
    type: scenarioType,
    notification_type: 'planning-governance-milestone',
    severity,
    level: severity,
    title: buildMilestoneNotificationTitle(item),
    content: buildMilestoneNotificationContent(item, scenarioType),
    is_read: false,
    is_broadcast: severity === 'critical',
    source_entity_type: 'milestone_integrity',
    source_entity_id: item.milestone_id,
    category: 'planning_governance',
    task_id: null,
    recipients,
    status: 'unread',
    metadata: {
      milestone_id: item.milestone_id,
      milestone_key: item.milestone_key,
      milestone_title: item.title,
      milestone_state: item.state,
      scenario_type: scenarioType,
      scenario_label: getMilestoneScenarioLabel(scenarioType),
      issues: item.issues,
      planned_date: item.planned_date,
      current_planned_date: item.current_planned_date,
      actual_date: item.actual_date,
      suggested_action: suggestedAction,
      jump_url: jumpUrl,
    },
    created_at: timestamp,
    updated_at: timestamp,
  }
}

export class MilestoneIntegrityService {
  async scanProjectMilestones(projectId: string): Promise<MilestoneIntegrityReport> {
    const milestones = await executeSQL<MilestoneIntegritySourceRow>(
      'SELECT id, project_id, title, planned_end_date as target_date, baseline_end as baseline_date, planned_end_date as current_plan_date, actual_end_date as actual_date, status, version FROM tasks WHERE project_id = ? AND is_milestone = true',
      [projectId]
    )
    return evaluateMilestoneIntegrityRows(projectId, milestones)
  }

  async scanAllProjectMilestones(): Promise<MilestoneIntegrityReport[]> {
    const projectIds = await listActiveProjectIds()
    const reports: MilestoneIntegrityReport[] = []

    for (const projectId of projectIds) {
      reports.push(await this.scanProjectMilestones(projectId))
    }

    return reports
  }

  async syncProjectMilestoneNotifications(
    projectId: string,
    report?: MilestoneIntegrityReport,
  ): Promise<Notification[]> {
    const currentReport = report ?? await this.scanProjectMilestones(projectId)
    const activeItems = currentReport.items.filter((item) => item.state !== 'aligned')
    const existingRows = (await listNotifications({ projectId }))
      .filter((notification) =>
        String(notification.source_entity_type ?? '').trim() === 'milestone_integrity'
        && [
          'milestone_blocked',
          'milestone_data_incomplete',
          'milestone_needs_attention',
          ...MILESTONE_NOTIFICATION_TYPES,
        ].includes(String(notification.type ?? '').trim()),
      )
    const existingByMilestoneId = new Map(
      existingRows.map((row) => [String(row.source_entity_id ?? ''), row]),
    )
    const activeIds = new Set(activeItems.map((item) => item.milestone_id))
    const persisted: Notification[] = []
    const timestamp = nowIso()

    for (const item of activeItems) {
      const next = await buildMilestoneNotificationRow(projectId, item)
      if (!next) continue

      const existing = existingByMilestoneId.get(item.milestone_id)
      if (!existing) {
        persisted.push(await insertNotification(next))
        await writeMilestoneIntegrityLog({
          projectId,
          item,
          previousState: null,
          nextState: item.state,
          changeReason: item.issues.join('；') || '里程碑一致性异常',
        })
        continue
      }

      const previousState = readMilestoneStateFromNotification(existing)
      const normalizedStatus = String(existing.status ?? '').trim().toLowerCase()
      const reopened = ['resolved', 'archived', 'closed'].includes(normalizedStatus)
      const patch = {
        type: next.type,
        notification_type: next.notification_type,
        severity: next.severity,
        level: next.level,
        title: next.title,
        content: next.content,
        is_broadcast: next.is_broadcast,
        category: next.category,
        status: reopened ? 'unread' : existing.status ?? 'unread',
        is_read: reopened ? false : Boolean(existing.is_read),
        resolved_at: reopened ? null : existing.resolved_at ?? null,
        metadata: next.metadata,
        updated_at: timestamp,
      } satisfies Partial<Notification>
      await updateNotificationById(existing.id, patch)
      persisted.push({ ...existing, ...patch } as Notification)
      await writeMilestoneIntegrityLog({
        projectId,
        item,
        previousState,
        nextState: item.state,
        changeReason: item.issues.join('；') || '里程碑一致性异常',
      })
    }

    for (const existing of existingRows) {
      const milestoneId = String(existing.source_entity_id ?? '')
      const normalizedStatus = String(existing.status ?? '').trim().toLowerCase()
      if (activeIds.has(milestoneId) || ['resolved', 'archived', 'closed'].includes(normalizedStatus)) {
        continue
      }

      await updateNotificationById(existing.id, {
        status: 'resolved',
        resolved_at: timestamp,
        is_read: true,
        updated_at: timestamp,
      })
      await writeMilestoneIntegrityLog({
        projectId,
        item: {
          milestone_id: milestoneId,
          state: 'aligned',
          issues: [],
        },
        previousState: readMilestoneStateFromNotification(existing),
        nextState: 'aligned',
        changeReason: '里程碑一致性恢复',
      })
    }

    return persisted
  }

  async syncAllProjectMilestoneNotifications(): Promise<Notification[]> {
    const projectIds = await listActiveProjectIds()
    const persisted: Notification[] = []
    for (const projectId of projectIds) {
      persisted.push(...await this.syncProjectMilestoneNotifications(projectId))
    }
    return persisted
  }
}
