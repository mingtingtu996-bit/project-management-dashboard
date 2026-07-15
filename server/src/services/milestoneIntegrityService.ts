import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { v4 as uuidv4 } from 'uuid'
import { listActiveProjectIds } from './activeProjectService.js'
import { writeLog } from './changeLogs.js'
import { executeSQL, executeSQLOne } from './dbService.js'
import { listNotifications, updateNotificationById } from './notificationStore.js'
import { notificationTouchpointService } from './notificationTouchpointService.js'
import { attachCurrentBaselineProjectionToTasks } from './taskBaselineProjectionService.js'
import { resolveLiveTaskCriticalityProjection } from './taskCriticalityProjectionService.js'
import {
  MILESTONE_INTEGRITY_RULE_SEED,
  type MilestoneCommitmentAnchor,
  type MilestoneKey,
  type MilestoneScenarioType,
} from '../seeds/milestoneIntegrityRuleSeed.js'
import type { Notification } from '../types/db.js'
import type {
  MilestoneIntegrityReport,
  MilestoneIntegrityRow,
  MilestoneIntegrityState,
  PlanningGovernanceGateLevel,
  PlanningGovernanceTargetSurface,
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
  baseline_item_id?: string | null
  monthly_plan_item_id?: string | null
  source_mode?: 'baseline' | 'schedule' | 'mixed' | 'manual' | 'imported' | string | null
  task_source?: 'ad_hoc' | 'baseline' | 'monthly_plan' | 'execution' | string | null
  mapping_status?: string | null
  is_critical_path?: boolean | null
  is_critical?: boolean | null
  criticality_weight?: number | string | null
  milestone_distance_days?: number | string | null
  downstream_milestone_distance_days?: number | string | null
  acceptance_required?: boolean | null
  linked_prerequisite_count?: number | string | null
  bound_prerequisite_count?: number | string | null
}

const MILESTONE_KEYS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'] as const
const MILESTONE_POLICY_BY_KEY = new Map(
  MILESTONE_INTEGRITY_RULE_SEED.scenarioPolicies.map((policy) => [policy.milestoneKey, policy]),
)

interface ProjectOwnerRow {
  id: string
  owner_id?: string | null
}

interface ProjectMemberRow {
  project_id: string
  user_id: string
  permission_level?: string | null
}

interface SelectedMilestoneIntegritySourceRow {
  milestone: MilestoneIntegritySourceRow
  milestoneKey: MilestoneKey
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

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeStatus(value?: string | null): string {
  return String(value ?? '').trim().toLowerCase()
}

function selectAnchorDate(milestone: MilestoneIntegritySourceRow): string | null {
  return milestone.current_plan_date || milestone.baseline_date || milestone.target_date || milestone.actual_date || milestone.completed_at || null
}

function deriveExplicitMilestoneKey(milestone: MilestoneIntegritySourceRow): MilestoneKey | null {
  const directOrder = Number(milestone.milestone_order ?? NaN)
  if (Number.isFinite(directOrder) && directOrder >= 1 && directOrder <= 9) {
    return MILESTONE_KEYS[directOrder - 1]
  }

  const label = [milestone.name, milestone.title].filter(Boolean).join(' ')
  const match = label.match(/(?:^|\b)M([1-9])(?:\b|$)/i)
  if (match?.[1]) {
    return MILESTONE_KEYS[Number(match[1]) - 1]
  }

  return null
}

function deriveMilestoneKey(index: number, milestone: MilestoneIntegritySourceRow): MilestoneKey {
  return deriveExplicitMilestoneKey(milestone) ?? MILESTONE_KEYS[Math.min(index, MILESTONE_KEYS.length - 1)]
}

function sortMilestonesByAnchor(milestones: MilestoneIntegritySourceRow[]) {
  return [...milestones].sort((left, right) => {
    const leftAnchor = toTimestamp(selectAnchorDate(left)) ?? 0
    const rightAnchor = toTimestamp(selectAnchorDate(right)) ?? 0
    if (leftAnchor !== rightAnchor) return leftAnchor - rightAnchor
    return String(left.id).localeCompare(String(right.id))
  })
}

function selectMilestonesForIntegrity(milestones: MilestoneIntegritySourceRow[]): SelectedMilestoneIntegritySourceRow[] {
  const ordered = sortMilestonesByAnchor(milestones)
  const explicitByKey = new Map<MilestoneKey, MilestoneIntegritySourceRow>()
  const selectedIds = new Set<string>()

  for (const milestone of ordered) {
    const key = deriveExplicitMilestoneKey(milestone)
    if (!key || explicitByKey.has(key)) continue
    explicitByKey.set(key, milestone)
    selectedIds.add(milestone.id)
  }

  const selected: SelectedMilestoneIntegritySourceRow[] = []
  const usedKeys = new Set<MilestoneKey>()
  for (const key of MILESTONE_KEYS) {
    const milestone = explicitByKey.get(key)
    if (!milestone) continue
    selected.push({ milestone, milestoneKey: key })
    usedKeys.add(key)
  }

  for (const milestone of ordered) {
    if (selected.length >= MILESTONE_KEYS.length) break
    if (selectedIds.has(milestone.id)) continue
    const fallbackKey = MILESTONE_KEYS.find((key) => !usedKeys.has(key))
    if (!fallbackKey) break
    selected.push({ milestone, milestoneKey: fallbackKey })
    usedKeys.add(fallbackKey)
    selectedIds.add(milestone.id)
  }

  return selected.slice(0, MILESTONE_KEYS.length)
}

function inferCommitmentAnchor(milestone: MilestoneIntegritySourceRow): MilestoneCommitmentAnchor {
  const sourceMode = normalizeStatus(milestone.source_mode)
  const taskSource = normalizeStatus(milestone.task_source)
  if (hasText(milestone.baseline_item_id) || sourceMode === 'baseline' || taskSource === 'baseline') return 'baseline'
  if (hasText(milestone.monthly_plan_item_id) || sourceMode === 'mixed' || taskSource === 'monthly_plan') return 'monthly_plan'
  if (sourceMode === 'manual' || taskSource === 'ad_hoc') return 'manual'
  return 'unanchored'
}

function hasBrokenCommitmentAnchor(milestone: MilestoneIntegritySourceRow, anchor: MilestoneCommitmentAnchor): boolean {
  const mappingStatus = normalizeStatus(milestone.mapping_status)
  if (['missing', 'pending', 'broken', 'orphan', 'unresolved', 'conflict', 'merged'].includes(mappingStatus)) return true
  if (anchor === 'baseline' && !hasText(milestone.baseline_item_id) && normalizeStatus(milestone.source_mode) === 'baseline') return true
  if (anchor === 'monthly_plan' && !hasText(milestone.monthly_plan_item_id) && normalizeStatus(milestone.source_mode) === 'mixed') return true
  return false
}

function hasCriticalContext(milestone: MilestoneIntegritySourceRow): boolean {
  const projection = resolveLiveTaskCriticalityProjection(milestone)
  const criticalityWeight = toNumber(milestone.criticality_weight)
  const milestoneDistance = toNumber(milestone.milestone_distance_days ?? milestone.downstream_milestone_distance_days)
  return Boolean(
    milestone.is_critical_path
      || projection.isCritical
      || milestone.acceptance_required
      || (criticalityWeight !== null && criticalityWeight >= 1)
      || (milestoneDistance !== null && milestoneDistance <= 7)
      || (toNumber(milestone.linked_prerequisite_count) ?? 0) > 0
      || (toNumber(milestone.bound_prerequisite_count) ?? 0) > 0,
  )
}

function resolveMilestonePolicy(key: MilestoneKey) {
  return MILESTONE_POLICY_BY_KEY.get(key) ?? MILESTONE_INTEGRITY_RULE_SEED.scenarioPolicies[0]
}

function resolveGateLevel(
  state: MilestoneIntegrityState,
  policy: ReturnType<typeof resolveMilestonePolicy>,
  anchor: MilestoneCommitmentAnchor,
  criticalContext: boolean,
): PlanningGovernanceGateLevel {
  if (state === 'aligned') return 'hint'
  if (state === 'blocked') return 'block_save'
  if (anchor === 'manual' || anchor === 'unanchored') return 'confirm'
  if (criticalContext && state === 'missing_data') return 'block_save'
  return policy.defaultGateLevel
}

function resolveTargetSurface(gateLevel: PlanningGovernanceGateLevel, policy: ReturnType<typeof resolveMilestonePolicy>): PlanningGovernanceTargetSurface {
  if (gateLevel === 'block_save') return 'baseline'
  return policy.defaultTargetSurface
}

function applyCommitmentAnchorIssues(
  milestone: MilestoneIntegritySourceRow,
  issues: string[],
  anchor: MilestoneCommitmentAnchor,
  criticalContext: boolean,
) {
  const policy = MILESTONE_INTEGRITY_RULE_SEED.commitmentAnchorPolicy
  if (anchor === 'manual' && !hasText(milestone.baseline_item_id) && !hasText(milestone.monthly_plan_item_id)) {
    issues.push(policy.manualWithoutAnchorIssue)
    return
  }

  if (hasBrokenCommitmentAnchor(milestone, anchor)) {
    issues.push(policy.formalAnchorBrokenIssue)
    if (criticalContext) issues.push(policy.criticalAnchorBrokenIssue)
  }
}

function getStateFromIssues(issues: string[]): MilestoneIntegrityState {
  if (issues.length === 0) return 'aligned'
  const blockingIssue = issues.some((issue) =>
    issue.includes('actual date exceeds')
      || issue.includes('missing actual date')
      || issue.includes('commitment anchor missing')
      || issue.includes('requires repair before publishing'),
  )
  if (blockingIssue) return 'blocked'
  if (issues.some((issue) => issue.includes('missing') && !issue.includes('manual milestone'))) return 'missing_data'
  return 'needs_attention'
}

function evaluateMilestoneState(milestone: MilestoneIntegritySourceRow): {
  state: MilestoneIntegrityState
  issues: string[]
  commitmentAnchor: MilestoneCommitmentAnchor
  criticalContext: boolean
} {
  const commitmentAnchor = inferCommitmentAnchor(milestone)
  const criticalContext = hasCriticalContext(milestone)
  const issues: string[] = []
  const plannedDate = normalizeDate(milestone.baseline_date || milestone.target_date)
  const currentPlannedDate = normalizeDate(milestone.current_plan_date || milestone.baseline_date || milestone.target_date)
  const actualDate = normalizeDate(milestone.actual_date || milestone.completed_at)
  const status = normalizeStatus(milestone.status)

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

  applyCommitmentAnchorIssues(milestone, issues, commitmentAnchor, criticalContext)

  return {
    state: getStateFromIssues(issues),
    issues: [...new Set(issues)],
    commitmentAnchor,
    criticalContext,
  }
}

function buildMilestoneIntegrityRow(milestone: MilestoneIntegritySourceRow, milestoneKey: MilestoneKey): MilestoneIntegrityRow {
  const stateResult = evaluateMilestoneState(milestone)
  const policy = resolveMilestonePolicy(milestoneKey)
  const gateLevel = resolveGateLevel(
    stateResult.state,
    policy,
    stateResult.commitmentAnchor,
    stateResult.criticalContext,
  )
  const targetSurface = resolveTargetSurface(gateLevel, policy)

  return {
    milestone_id: milestone.id,
    milestone_key: milestoneKey,
    title: milestone.title || milestone.name || milestone.id,
    planned_date: normalizeDate(milestone.baseline_date || milestone.target_date),
    current_planned_date: normalizeDate(milestone.current_plan_date || milestone.baseline_date || milestone.target_date),
    actual_date: normalizeDate(milestone.actual_date || milestone.completed_at),
    state: stateResult.state,
    issues: stateResult.issues,
    scenario_type: policy.scenarioType,
    scenario_label: policy.label,
    suggested_action: policy.suggestedAction,
    gate_level: gateLevel,
    target_surface: targetSurface,
    commitment_anchor: stateResult.commitmentAnchor,
    critical_context: stateResult.criticalContext,
  }
}

export function evaluateMilestoneIntegrityRows(
  projectId: string,
  milestones: MilestoneIntegritySourceRow[],
): MilestoneIntegrityReport {
  const items: MilestoneIntegrityRow[] = selectMilestonesForIntegrity(milestones)
    .map(({ milestone, milestoneKey }) => buildMilestoneIntegrityRow(milestone, milestoneKey))

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

const MILESTONE_NOTIFICATION_TYPES: MilestoneScenarioType[] = MILESTONE_INTEGRITY_RULE_SEED.scenarioPolicies
  .map((policy) => policy.scenarioType)
  .filter((type): type is MilestoneScenarioType => Boolean(type))

function resolveMilestoneScenarioType(item: MilestoneIntegrityRow): MilestoneScenarioType | null {
  const policy = resolveMilestonePolicy(item.milestone_key)
  return policy.scenarioType
}

function getMilestoneScenarioLabel(type: MilestoneScenarioType): string {
  return MILESTONE_INTEGRITY_RULE_SEED.scenarioPolicies.find((policy) => policy.scenarioType === type)?.label ?? type
}

function deriveSuggestedAction(type: MilestoneScenarioType): string {
  return MILESTONE_INTEGRITY_RULE_SEED.scenarioPolicies.find((policy) => policy.scenarioType === type)?.suggestedAction ?? ''
}

function buildMilestoneNotificationType(item: MilestoneIntegrityRow): MilestoneScenarioType | null {
  return resolveMilestoneScenarioType(item)
}

function buildMilestoneNotificationTitle(item: MilestoneIntegrityRow) {
  return `${item.milestone_key} 里程碑完整性异常`
}

function buildMilestoneNotificationContent(item: MilestoneIntegrityRow, scenarioType: MilestoneScenarioType) {
  const issueSummary = item.issues.join('、')
  const suggestedAction = deriveSuggestedAction(scenarioType)
  return `里程碑「${item.title}」${getMilestoneScenarioLabel(scenarioType)}当前状态为「${item.state}」，存在问题：${issueSummary}。建议：${suggestedAction}`
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
    executeSQL<ProjectMemberRow>('SELECT project_id, user_id, permission_level FROM project_members WHERE project_id = ?', [projectId]),
  ])

  return uniqueStrings([
    project?.owner_id ?? null,
    ...(members ?? [])
      .filter((member) => {
        const role = normalizeProjectPermissionLevel(member.permission_level)
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
    const taskRows = await executeSQL<MilestoneIntegritySourceRow & {
      baseline_start?: string | null
      baseline_end?: string | null
      baseline_is_critical?: boolean | null
    }>(
      `SELECT
        id,
        project_id,
        title,
        planned_end_date as target_date,
        planned_end_date as current_plan_date,
        actual_end_date as actual_date,
        status,
        version,
        milestone_order,
        monthly_plan_item_id,
        task_source,
        is_critical as is_critical_path,
        is_critical,
        criticality_weight,
        milestone_distance_days,
        downstream_milestone_distance_days,
        acceptance_required
      FROM tasks
      WHERE project_id = ? AND is_milestone = true`,
      [projectId]
    )
    const milestones = (await attachCurrentBaselineProjectionToTasks(taskRows)).map((row) => ({
      ...row,
      baseline_date: row.baseline_end ?? row.baseline_start ?? null,
      is_critical_path: row.is_critical_path ?? row.baseline_is_critical ?? null,
    }))
    return evaluateMilestoneIntegrityRows(projectId, milestones)
  }

  async scanAllProjectMilestones(projectIds?: string[] | null): Promise<MilestoneIntegrityReport[]> {
    const activeProjectIds = await listActiveProjectIds(projectIds)
    const reports: MilestoneIntegrityReport[] = []

    for (const projectId of activeProjectIds) {
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
        persisted.push(await notificationTouchpointService.emit({
          ...next,
          touchpoint_type: 'dashboard_todo',
          scope_type: 'project',
          dedupe_key: `milestone_integrity:${projectId}:${item.milestone_id}`,
          target_route: `/projects/${projectId}/milestones`,
          target_label: '查看里程碑',
        }))
        await writeMilestoneIntegrityLog({
          projectId,
          item,
          previousState: null,
          nextState: item.state,
          changeReason: item.issues.join('、') || '里程碑一致性异常',
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
      await updateNotificationById(existing.id, patch, existing)
      persisted.push({ ...existing, ...patch } as Notification)
      await writeMilestoneIntegrityLog({
        projectId,
        item,
        previousState,
        nextState: item.state,
        changeReason: item.issues.join('、') || '里程碑一致性异常',
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
      }, existing)
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

  async syncAllProjectMilestoneNotifications(projectIds?: string[] | null): Promise<Notification[]> {
    const activeProjectIds = await listActiveProjectIds(projectIds)
    const persisted: Notification[] = []
    for (const projectId of activeProjectIds) {
      persisted.push(...await this.syncProjectMilestoneNotifications(projectId))
    }
    return persisted
  }
}
