import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { query as rawQuery } from '../database.js'
import { logger } from '../middleware/logger.js'
import type { DataQualityFinding } from '../types/db.js'
import { listActiveProjectIds } from './activeProjectService.js'
import { dataQualityService } from './dataQualityService.js'
import { executeSQL } from './dbService.js'
import { summarizeDelayImpactSignals } from './executionImpactSignals.js'
import {
  buildMaterialArrivalReminderRuleMetadata,
  MATERIAL_ARRIVAL_REMINDER_RULE,
} from './materialArrivalReminderRuleRegistry.js'
import {
  listLongOverdueMaterialGovernanceCandidates,
  listMaterialReminderCandidateMaterials,
  type ProjectMaterialRecord,
} from './materialReportsService.js'
import { isOpenMaterialLinkedTaskStatus } from './materialTaskLinkPolicy.js'
import { listNotifications, updateNotificationById } from './notificationStore.js'
import { notificationTouchpointService } from './notificationTouchpointService.js'
import { satisfyCondition } from './taskConstraintGovernanceService.js'
import { resolveLiveTaskCriticalityProjection } from './taskCriticalityProjectionService.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'
import { runScopedBatch } from './scopedBatchRunner.js'

type ProjectRow = {
  id: string
  owner_id?: string | null
}

type ProjectMemberRow = {
  user_id: string
  permission_level?: string | null
}

type ParticipantUnitContactRecipientRow = {
  participant_unit_id?: string | null
  user_id?: string | null
  recipient_source?: string | null
}

type MaterialArrivalStatusRow = {
  id?: string | null
  actual_arrival_date?: string | null
}

type NotificationUserStateRow = {
  notification_id?: string | null
  user_id?: string | null
  is_acknowledged?: boolean | null
  acknowledged_at?: string | null
}

type TaskRow = {
  id: string
  participant_unit_id?: string | null
  planned_start_date?: string | null
  status?: string | null
  assignee_user_id?: string | null
  assignee_id?: string | null
  is_critical?: boolean | number | string | null
  total_float_days?: number | string | null
  free_float_days?: number | string | null
  successor_count?: number | string | null
  milestone_distance_days?: number | string | null
  downstream_milestone_distance_days?: number | string | null
  criticality_weight?: number | string | null
}

type MaterialTaskImpact = {
  id: string
  plannedStart: Date
  assigneeUserId: string | null
  criticality: MaterialTaskCriticality | null
}

type ReminderGroup = {
  participantUnitId: string | null
  participantUnitName: string
  materials: ProjectMaterialRecord[]
}

type MaterialTaskImpactContext = {
  earliestByUnit: Map<string, MaterialTaskImpact>
  byTaskId: Map<string, MaterialTaskImpact>
}

type ProjectRecipients = {
  userIds: string[]
  sources: string[]
}

type ParticipantUnitRecipientContext = {
  byUnitId: Map<string, string[]>
  sourcesByUnitId: Map<string, string[]>
}

type OverdueCadenceContext = {
  notificationsByMaterialId: Map<string, Array<{ id: string; createdAt: Date; acknowledged: boolean }>>
}

type OverdueCadenceResolution = {
  shouldRemind: boolean
  cadencePolicy: string
  suppressedMaterialIds: string[]
  reminderMaterials: ProjectMaterialRecord[]
}

type MaterialTaskCriticality = {
  isCritical: boolean
  totalFloatDays: number | null
  freeFloatDays: number | null
  successorCount: number | null
  milestoneDistanceDays: number | null
  criticalityWeight: number
  basis: string
  basisFactors: string[]
  weightedPriorityScore: number
}

type MaterialDataQualityContext = {
  ruleCodesByMaterialId: Map<string, string[]>
  findingsByMaterialId: Map<string, Array<{ material_id: string; rule_code: string; severity: string }>>
}

export interface MaterialArrivalReminderRunResult {
  projects: number
  notifications: number
  reminderCount: number
  overdueCount: number
}

export interface MaterialConditionUnlockResult {
  conditionUnlockCount: number
  conditionIds: string[]
  taskIds: string[]
  notificationId: string | null
}

const SOURCE_ENTITY_TYPE = 'project_material'
const REMINDER_TYPE = 'material_arrival_reminder'
const OVERDUE_TYPE = 'material_arrival_overdue'
const MATERIAL_CONDITION_TYPES = ['材料', 'material']
const UPCOMING_WINDOW_DAYS = MATERIAL_ARRIVAL_REMINDER_RULE.upcomingWindowDays
const FALLBACK_WINDOW_DAYS = MATERIAL_ARRIVAL_REMINDER_RULE.fallbackWindowDays
const OVERDUE_LOOKBACK_DAYS = MATERIAL_ARRIVAL_REMINDER_RULE.overdueLookbackDays
const OVERDUE_ACKNOWLEDGED_QUIET_DAYS = MATERIAL_ARRIVAL_REMINDER_RULE.overdueAcknowledgedQuietDays
const OVERDUE_LONG_AGING_INTERVAL_DAYS = MATERIAL_ARRIVAL_REMINDER_RULE.overdueLongAgingIntervalDays
const LONG_OVERDUE_GOVERNANCE_CADENCE = MATERIAL_ARRIVAL_REMINDER_RULE.longOverdueGovernanceCadence
const LONG_OVERDUE_TYPE = 'material_arrival_long_overdue_governance'
function nowIso() {
  return new Date().toISOString()
}

function normalizeNullableText(value?: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function toStartOfDay(value = new Date()) {
  const next = new Date(value)
  next.setHours(0, 0, 0, 0)
  return next
}

function formatDateKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addLocalDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function getWeekStartKey(value = new Date()) {
  const date = toStartOfDay(value)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return formatDateKey(date)
}

function getMonthKey(value = new Date()) {
  return formatDateKey(value).slice(0, 7)
}

function parseDate(value?: string | null) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

function diffInDays(from: Date, to: Date) {
  return signedDurationDayDelta(from, to) ?? 0
}

function normalizeNumber(value: unknown, fallback = Number.NaN) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function normalizeBoolean(value: unknown) {
  if (value === true || value === 1) return true
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => normalizeNullableText(value)).filter((value): value is string => Boolean(value)))]
}

function normalizeUnitName(value?: string | null) {
  return normalizeNullableText(value) ?? '未指定责任单位'
}

function isOpenTaskStatus(value?: string | null) {
  return isOpenMaterialLinkedTaskStatus(value)
}

function buildTaskCriticality(task: TaskRow): MaterialTaskCriticality {
  const projection = resolveLiveTaskCriticalityProjection(task)
  const summary = summarizeDelayImpactSignals([], {
    taskCriticality: {
      isCritical: projection.isCritical,
      totalFloatDays: task.total_float_days,
      freeFloatDays: task.free_float_days,
      successorCount: task.successor_count,
      milestoneDistanceDays: task.milestone_distance_days ?? task.downstream_milestone_distance_days,
      criticalityWeight: task.criticality_weight,
      basis: projection.basis,
    },
  })
  const criticality = summary.criticality
  const weightedPriorityScore = round(Math.max(1, Number(criticality.criticalityWeight ?? 1)) * 1.2)
  return {
    isCritical: Boolean(criticality.isCritical),
    totalFloatDays: criticality.totalFloatDays ?? null,
    freeFloatDays: criticality.freeFloatDays ?? null,
    successorCount: criticality.successorCount ?? null,
    milestoneDistanceDays: criticality.milestoneDistanceDays ?? null,
    criticalityWeight: Number(criticality.criticalityWeight ?? 1),
    basis: String(criticality.basis ?? 'not_critical_path'),
    basisFactors: Array.isArray(criticality.basisFactors) ? criticality.basisFactors : [],
    weightedPriorityScore,
  }
}

function buildCriticalityMetadata(impact: MaterialTaskImpact | null) {
  const criticality = impact?.criticality
  if (!criticality) {
    return {
      priority_policy: MATERIAL_ARRIVAL_REMINDER_RULE.priorityPolicy,
      criticality_weight: 1,
      criticality_basis: 'not_linked_task',
      criticality_basis_factors: [],
      weighted_priority_score: 1,
    }
  }

  return {
    priority_policy: MATERIAL_ARRIVAL_REMINDER_RULE.priorityPolicy,
    criticality_weight: criticality.criticalityWeight,
    criticality_basis: criticality.basis,
    criticality_basis_factors: criticality.basisFactors,
    weighted_priority_score: criticality.weightedPriorityScore,
    ...(criticality.totalFloatDays == null ? {} : { total_float_days: criticality.totalFloatDays }),
    ...(criticality.freeFloatDays == null ? {} : { free_float_days: criticality.freeFloatDays }),
    ...(criticality.successorCount == null ? {} : { successor_count: criticality.successorCount }),
    ...(criticality.milestoneDistanceDays == null ? {} : { downstream_milestone_distance_days: criticality.milestoneDistanceDays }),
  }
}

function buildReminderSourceEntityId(projectId: string, participantUnitId: string | null, dayKey: string, type: string) {
  return `${projectId}:${participantUnitId ?? 'unassigned'}:${dayKey}:${type}`
}

function getEarliestLinkedTaskStart(group: ReminderGroup) {
  return group.materials
    .map((material) => parseDate(material.linked_task_start_date))
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null
}

function collectWeeklyRemindedMaterialIds(
  projectNotifications: Array<{ type?: string | null; created_at?: string | null; metadata?: Record<string, unknown> | null }>,
  weekStartKey: string,
) {
  const reminded = new Set<string>()
  for (const notification of projectNotifications) {
    if (String(notification.type ?? '').trim() !== REMINDER_TYPE) continue
    const createdAt = String(notification.created_at ?? '')
    if (!createdAt || createdAt.slice(0, 10) < weekStartKey) continue
    const metadata = notification.metadata ?? {}
    const materialIds = Array.isArray(metadata.material_ids)
      ? metadata.material_ids
      : metadata.material_id
        ? [metadata.material_id]
        : []
    for (const materialId of materialIds) {
      const normalized = normalizeNullableText(materialId)
      if (normalized) reminded.add(normalized)
    }
  }
  return reminded
}

function collectMonthlyGovernanceMaterialIds(
  projectNotifications: Array<{ type?: string | null; created_at?: string | null; metadata?: Record<string, unknown> | null }>,
  governanceMonth: string,
) {
  const reminded = new Set<string>()
  for (const notification of projectNotifications) {
    if (String(notification.type ?? '').trim() !== LONG_OVERDUE_TYPE) continue
    const metadata = notification.metadata ?? {}
    if (normalizeNullableText(metadata.governance_month) !== governanceMonth) continue
    for (const materialId of getMaterialIdsFromMetadata(metadata)) {
      reminded.add(materialId)
    }
  }
  return reminded
}

async function listAcknowledgedNotificationIds(projectNotifications: Array<{ id?: string | null }>) {
  const notificationIds = uniqueStrings(projectNotifications.map((notification) => notification.id))
  if (notificationIds.length === 0) return new Set<string>()

  try {
    const rows = await executeSQL<NotificationUserStateRow>(
      'SELECT notification_id, user_id, is_acknowledged, acknowledged_at FROM notification_user_states WHERE notification_id = ANY(?)',
      [notificationIds],
    )
    return new Set(uniqueStrings(rows
      .filter((row) => row.is_acknowledged === true || Boolean(normalizeNullableText(row.acknowledged_at)))
      .map((row) => row.notification_id)))
  } catch {
    return new Set<string>()
  }
}

function getMaterialIdsFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return []
  const materialIds = Array.isArray(metadata.material_ids)
    ? metadata.material_ids
    : metadata.material_id
      ? [metadata.material_id]
      : []
  return uniqueStrings(materialIds)
}

function buildOverdueCadenceContext(
  projectNotifications: Array<{ id?: string | null; type?: string | null; created_at?: string | null; metadata?: Record<string, unknown> | null }>,
  acknowledgedNotificationIds: Set<string>,
): OverdueCadenceContext {
  const notificationsByMaterialId = new Map<string, Array<{ id: string; createdAt: Date; acknowledged: boolean }>>()
  for (const notification of projectNotifications) {
    if (normalizeNullableText(notification.type) !== OVERDUE_TYPE) continue
    const notificationId = normalizeNullableText(notification.id)
    const createdAt = parseDate(notification.created_at)
    if (!notificationId || !createdAt) continue
    for (const materialId of getMaterialIdsFromMetadata(notification.metadata)) {
      const entries = notificationsByMaterialId.get(materialId) ?? []
      entries.push({
        id: notificationId,
        createdAt,
        acknowledged: acknowledgedNotificationIds.has(notificationId),
      })
      notificationsByMaterialId.set(materialId, entries)
    }
  }
  for (const entries of notificationsByMaterialId.values()) {
    entries.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
  }
  return { notificationsByMaterialId }
}

function isOverdueGroupCritical(group: ReminderGroup, impact: MaterialTaskImpact | null) {
  return Boolean(
    impact?.criticality?.isCritical
    || group.materials.some((material) => normalizeNumber(material.linked_task_buffer_days, Number.NaN) <= 1),
  )
}

function resolveOverdueCadence(group: ReminderGroup, impact: MaterialTaskImpact | null, context: OverdueCadenceContext, today: Date) {
  if (isOverdueGroupCritical(group, impact)) {
    return {
      shouldRemind: true,
      cadencePolicy: 'critical_daily',
      suppressedMaterialIds: [] as string[],
      reminderMaterials: group.materials,
    } satisfies OverdueCadenceResolution
  }

  const suppressedMaterialIds: string[] = []
  for (const material of group.materials) {
    const expectedArrival = parseDate(material.expected_arrival_date)
    if (!expectedArrival) continue
    const overdueDays = Math.max(1, Math.abs(diffInDays(expectedArrival, today)))
    const intervalDays = overdueDays >= OVERDUE_LONG_AGING_INTERVAL_DAYS ? OVERDUE_LONG_AGING_INTERVAL_DAYS : 1
    const latest = context.notificationsByMaterialId.get(material.id)?.[0]
    if (!latest) continue

    const daysSinceLast = Math.max(0, diffInDays(latest.createdAt, today))
    if (latest.acknowledged && daysSinceLast < OVERDUE_ACKNOWLEDGED_QUIET_DAYS) {
      suppressedMaterialIds.push(material.id)
      continue
    }
    if (!latest.acknowledged && daysSinceLast < intervalDays) {
      suppressedMaterialIds.push(material.id)
    }
  }

  return {
    shouldRemind: suppressedMaterialIds.length < group.materials.length,
    cadencePolicy: 'ordinary_aging_acknowledged_quiet',
    suppressedMaterialIds,
    reminderMaterials: group.materials.filter((material) => !suppressedMaterialIds.includes(material.id)),
  } satisfies OverdueCadenceResolution
}

function materialIdFromFinding(finding: DataQualityFinding) {
  const details = finding.details_json ?? {}
  return normalizeNullableText(finding.entity_id)
    ?? normalizeNullableText(details.material_id)
    ?? normalizeNullableText(details.materialId)
}

function buildEmptyDataQualityContext(): MaterialDataQualityContext {
  return {
    ruleCodesByMaterialId: new Map(),
    findingsByMaterialId: new Map(),
  }
}

async function loadMaterialDataQualityContext(projectId: string, materialIds: string[]): Promise<MaterialDataQualityContext> {
  if (materialIds.length === 0) return buildEmptyDataQualityContext()

  try {
    const summary = await dataQualityService.buildProjectSummary(projectId)
    const targetIds = new Set(materialIds)
    const context = buildEmptyDataQualityContext()

    for (const finding of summary.findings ?? []) {
      if (finding.status !== 'active') continue
      const sourceType = normalizeNullableText(finding.source_type)
      const entityType = normalizeNullableText(finding.entity_type)
      if (sourceType !== 'project_materials' && entityType !== SOURCE_ENTITY_TYPE) continue

      const materialId = materialIdFromFinding(finding)
      if (!materialId || !targetIds.has(materialId)) continue

      const ruleCode = normalizeNullableText(finding.rule_code)
      if (!ruleCode) continue

      const currentCodes = context.ruleCodesByMaterialId.get(materialId) ?? []
      context.ruleCodesByMaterialId.set(materialId, uniqueStrings([...currentCodes, ruleCode]))

      const currentFindings = context.findingsByMaterialId.get(materialId) ?? []
      currentFindings.push({
        material_id: materialId,
        rule_code: ruleCode,
        severity: normalizeNullableText(finding.severity) ?? 'info',
      })
      context.findingsByMaterialId.set(materialId, currentFindings)
    }

    return context
  } catch (error) {
    logger.warn('[materialArrivalReminderService] failed to load material data quality context; reminders continue with degraded metadata unavailable', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return buildEmptyDataQualityContext()
  }
}

function buildDataQualityMetadata(group: ReminderGroup, context: MaterialDataQualityContext) {
  const materialIds = group.materials.map((material) => material.id)
  const ruleCodes = uniqueStrings(materialIds.flatMap((materialId) => context.ruleCodesByMaterialId.get(materialId) ?? []))
  const findings = materialIds.flatMap((materialId) => context.findingsByMaterialId.get(materialId) ?? [])

  return {
    data_quality_degraded: ruleCodes.length > 0,
    data_quality_policy: MATERIAL_ARRIVAL_REMINDER_RULE.dataQualityPolicy,
    data_quality_rule_codes: ruleCodes,
    data_quality_findings: findings,
  }
}

async function getProjectOwnerRecipients(projectId: string) {
  const [projects, members] = await Promise.all([
    executeSQL<ProjectRow>('SELECT id, owner_id FROM projects WHERE id = ? LIMIT 1', [projectId]),
    executeSQL<ProjectMemberRow>('SELECT project_id, user_id, permission_level FROM project_members WHERE project_id = ?', [projectId]),
  ])
  const project = projects[0]
  const userIds = uniqueStrings([
    project?.owner_id ?? null,
    ...members
      .filter((member) => {
        const permission = normalizeProjectPermissionLevel(member.permission_level)
        return permission === 'owner' || permission === 'editor'
      })
      .map((member) => member.user_id),
  ])
  return {
    userIds,
    sources: userIds.length > 0 ? ['project_owner_editor'] : [],
  } satisfies ProjectRecipients
}

async function getParticipantUnitContactRecipients(projectId: string, participantUnitIds: string[]) {
  const scopedUnitIds = uniqueStrings(participantUnitIds)
  const context: ParticipantUnitRecipientContext = { byUnitId: new Map(), sourcesByUnitId: new Map() }
  if (scopedUnitIds.length === 0) return context

  try {
    const result = await rawQuery(
      `SELECT pu.id AS participant_unit_id,
              pm_email.user_id AS user_id,
              'participant_unit_contact_email_member' AS recipient_source
         FROM public.participant_units pu
         JOIN public.users u
           ON LOWER(TRIM(u.email)) = LOWER(TRIM(pu.contact_email))
         JOIN public.project_members pm_email
           ON pm_email.project_id = pu.project_id
          AND pm_email.user_id = u.id
        WHERE pu.project_id = $1
          AND pu.id::text = ANY($2::text[])
          AND pm_email.user_id IS NOT NULL`,
      [projectId, scopedUnitIds],
    )
    for (const row of (result.rows ?? []) as ParticipantUnitContactRecipientRow[]) {
      const unitId = normalizeNullableText(row.participant_unit_id)
      const userId = normalizeNullableText(row.user_id)
      if (!unitId || !userId) continue
      context.byUnitId.set(unitId, uniqueStrings([...(context.byUnitId.get(unitId) ?? []), userId]))
      context.sourcesByUnitId.set(unitId, uniqueStrings([
        ...(context.sourcesByUnitId.get(unitId) ?? []),
        normalizeNullableText(row.recipient_source) ?? 'participant_unit_contact_member',
      ]))
    }
  } catch {
    return context
  }

  return context
}

async function getMaterialTaskImpactContext(projectId: string, materials?: ProjectMaterialRecord[]): Promise<MaterialTaskImpactContext> {
  const explicitTaskIds = uniqueStrings((materials ?? []).map((material) => material.linked_task_id))
  const participantUnitIds = uniqueStrings((materials ?? []).map((material) => material.participant_unit_id))
  const scoped = Array.isArray(materials)
  if (scoped && explicitTaskIds.length === 0 && participantUnitIds.length === 0) {
    return { earliestByUnit: new Map(), byTaskId: new Map() }
  }
  const tasks = scoped
    ? [
      ...(
        explicitTaskIds.length > 0
          ? await executeSQL<TaskRow>(
            'SELECT id, project_id, participant_unit_id, planned_start_date, status, assignee_user_id, assignee_id, is_critical, total_float_days, free_float_days, successor_count, milestone_distance_days, downstream_milestone_distance_days, criticality_weight FROM tasks WHERE project_id = ? AND id = ANY(?)',
            [projectId, explicitTaskIds],
          )
          : []
      ),
      ...(
        participantUnitIds.length > 0
          ? await executeSQL<TaskRow>(
            'SELECT id, project_id, participant_unit_id, planned_start_date, status, assignee_user_id, assignee_id, is_critical, total_float_days, free_float_days, successor_count, milestone_distance_days, downstream_milestone_distance_days, criticality_weight FROM tasks WHERE project_id = ? AND participant_unit_id = ANY(?)',
            [projectId, participantUnitIds],
          )
          : []
      ),
    ].filter((task, index, rows) => rows.findIndex((row) => row.id === task.id) === index)
    : await executeSQL<TaskRow>(
      'SELECT id, project_id, participant_unit_id, planned_start_date, status, assignee_user_id, assignee_id, is_critical, total_float_days, free_float_days, successor_count, milestone_distance_days, downstream_milestone_distance_days, criticality_weight FROM tasks WHERE project_id = ?',
      [projectId],
    )
  const earliestByUnit = new Map<string, MaterialTaskImpact>()
  const byTaskId = new Map<string, MaterialTaskImpact>()
  for (const task of tasks) {
    const participantUnitId = normalizeNullableText(task.participant_unit_id)
    const plannedStart = parseDate(task.planned_start_date)
    if (!plannedStart || !isOpenTaskStatus(task.status)) continue
    const impact = {
      id: task.id,
      plannedStart,
      assigneeUserId: normalizeNullableText(task.assignee_user_id) ?? normalizeNullableText(task.assignee_id),
      criticality: buildTaskCriticality(task),
    } satisfies MaterialTaskImpact
    byTaskId.set(task.id, impact)
    if (!participantUnitId) continue
    const current = earliestByUnit.get(participantUnitId)
    if (!current || plannedStart.getTime() < current.plannedStart.getTime()) {
      earliestByUnit.set(participantUnitId, impact)
    }
  }
  return { earliestByUnit, byTaskId }
}

function groupByUnit(materials: ProjectMaterialRecord[]) {
  const groups = new Map<string, ReminderGroup>()
  for (const material of materials) {
    const key = material.participant_unit_id ?? '__unassigned__'
    const current = groups.get(key) ?? {
      participantUnitId: material.participant_unit_id ?? null,
      participantUnitName: normalizeUnitName(material.participant_unit_name),
      materials: [],
    }
    current.materials.push(material)
    groups.set(key, current)
  }
  return [...groups.values()]
}

function getGroupTaskImpact(group: ReminderGroup, taskImpactContext: MaterialTaskImpactContext) {
  const explicitImpacts = group.materials
    .map((material) => {
      const taskId = normalizeNullableText(material.linked_task_id)
      const taskImpact = taskId ? taskImpactContext.byTaskId.get(taskId) ?? null : null
      const plannedStart = parseDate(material.linked_task_start_date) ?? taskImpact?.plannedStart ?? null
      if (!taskId || !plannedStart) return null
      return {
        id: taskId,
        plannedStart,
        assigneeUserId: taskImpact?.assigneeUserId ?? null,
        criticality: taskImpact?.criticality ?? null,
      } satisfies MaterialTaskImpact
    })
    .filter((impact): impact is MaterialTaskImpact => Boolean(impact))
    .sort((left, right) => left.plannedStart.getTime() - right.plannedStart.getTime())

  return explicitImpacts[0]
    ?? (group.participantUnitId ? taskImpactContext.earliestByUnit.get(group.participantUnitId) ?? null : null)
}

function getGroupImpactedTaskIds(group: ReminderGroup, fallbackImpact: MaterialTaskImpact | null) {
  return uniqueStrings([
    ...group.materials.map((material) => material.linked_task_id),
    fallbackImpact?.id ?? null,
  ])
}

function getGroupLinkedTaskIds(group: ReminderGroup, fallbackImpact: MaterialTaskImpact | null) {
  return getGroupImpactedTaskIds(group, fallbackImpact)
}

function getGroupRecipients(
  projectRecipients: ProjectRecipients,
  fallbackImpact: MaterialTaskImpact | null,
  unitContactRecipients: string[] = [],
) {
  return uniqueStrings([
    ...projectRecipients.userIds,
    ...unitContactRecipients,
    fallbackImpact?.assigneeUserId ?? null,
  ])
}

function getGroupRecipientSources(
  projectRecipients: ProjectRecipients,
  group: ReminderGroup,
  fallbackImpact: MaterialTaskImpact | null,
  unitContactRecipients: string[],
  unitContactRecipientSources: string[] = [],
) {
  return uniqueStrings([
    ...projectRecipients.sources,
    fallbackImpact?.assigneeUserId ? 'impacted_task_assignee' : null,
    ...(group.participantUnitId && unitContactRecipients.length > 0
      ? (unitContactRecipientSources.length > 0 ? unitContactRecipientSources : ['participant_unit_contact_member'])
      : []),
  ])
}

function buildReminderContent(group: ReminderGroup, leadDescription: string) {
  const materialSummary = group.materials
    .map((material) => `${material.material_name} (expected ${material.expected_arrival_date})`)
    .join('; ')
  return `${group.participantUnitName} has ${group.materials.length} material item(s) entering the arrival reminder window: ${materialSummary}. ${leadDescription}`
}

function buildOverdueContent(group: ReminderGroup) {
  const materialSummary = group.materials
    .map((material) => `${material.material_name} (due ${material.expected_arrival_date})`)
    .join('; ')
  return `${group.participantUnitName} has ${group.materials.length} overdue material item(s): ${materialSummary}. Please confirm arrival status.`
}

function buildLongOverdueGovernanceContent(group: ReminderGroup) {
  const materialSummary = group.materials
    .map((material) => `${material.material_name} (due ${material.expected_arrival_date})`)
    .join('; ')
  return `${group.participantUnitName} has ${group.materials.length} long-overdue material item(s) beyond the daily reminder lookback: ${materialSummary}. Please review owner follow-up and data quality.`
}

async function findMaterialLinkedConditions(params: {
  projectId: string
  materialId: string
  participantUnitId?: string | null
}) {
  const participantUnitId = normalizeNullableText(params.participantUnitId)
  const values: unknown[] = [params.projectId, MATERIAL_CONDITION_TYPES, params.materialId]
  let participantClause = ''
  if (participantUnitId) {
    values.push(participantUnitId)
    participantClause = `
            OR (
              participant_unit_id = $4::uuid
              AND source_ref_id IS NULL
              AND COALESCE(source_entity_id, '') = ''
            )`
  }

  const result = await rawQuery(
    `SELECT id, task_id, project_id
       FROM public.task_conditions
      WHERE project_id = $1::uuid
        AND is_satisfied = FALSE
        AND condition_type = ANY($2::text[])
        AND (
          source_ref_id = $3::uuid
          OR (source_entity_type = 'project_material' AND source_entity_id = $3)
          ${participantClause}
        )`,
    values,
  )

  const seen = new Set<string>()
  return (result.rows as Array<{ id?: string | null; task_id?: string | null; project_id?: string | null }>).filter((row) => {
    const id = normalizeNullableText(row.id)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

async function writeMaterialConditionUnlockAudit(params: {
  projectId: string
  materialId: string
  conditionId: string
  taskId: string
  unlockedAt?: string | null
  unlockedBy?: string | null
  sourceEventType: string
}) {
  await rawQuery(
    `INSERT INTO public.material_arrival_to_condition
      (project_id, material_id, condition_id, task_id, unlocked_at, unlocked_by, source_event_type)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, COALESCE($5::timestamptz, now()), $6::uuid, $7)
     ON CONFLICT (material_id, condition_id) DO UPDATE SET
       unlocked_at = EXCLUDED.unlocked_at,
       unlocked_by = COALESCE(EXCLUDED.unlocked_by, public.material_arrival_to_condition.unlocked_by),
       source_event_type = EXCLUDED.source_event_type`,
    [
      params.projectId,
      params.materialId,
      params.conditionId,
      params.taskId,
      normalizeNullableText(params.unlockedAt),
      normalizeNullableText(params.unlockedBy),
      params.sourceEventType,
    ],
  )
}

function metadataReferencesMaterialId(metadata: Record<string, unknown> | null | undefined, materialId: string) {
  if (!metadata) return false
  const materialIds = Array.isArray(metadata.material_ids)
    ? metadata.material_ids
    : metadata.material_id
      ? [metadata.material_id]
      : []
  return materialIds.some((value) => normalizeNullableText(value) === materialId)
}

function isActiveMaterialReminder(notification: {
  type?: string | null
  lifecycle_status?: string | null
  status?: string | null
}) {
  const type = normalizeNullableText(notification.type)
  if (type !== REMINDER_TYPE && type !== OVERDUE_TYPE) return false

  const lifecycleStatus = String(notification.lifecycle_status ?? 'active').trim().toLowerCase()
  const status = String(notification.status ?? '').trim().toLowerCase()
  return lifecycleStatus !== 'resolved'
    && lifecycleStatus !== 'archived'
    && status !== 'resolved'
    && status !== 'archived'
}

async function listArrivedMaterialIds(projectId: string, materialIds: string[]) {
  const scopedMaterialIds = uniqueStrings(materialIds)
  if (scopedMaterialIds.length === 0) return new Set<string>()

  try {
    const result = await rawQuery(
      `SELECT id, actual_arrival_date
         FROM public.project_materials
        WHERE project_id = $1
          AND id::text = ANY($2::text[])`,
      [projectId, scopedMaterialIds],
    )
    return new Set(uniqueStrings(
      ((result.rows ?? []) as MaterialArrivalStatusRow[])
        .filter((row) => Boolean(normalizeNullableText(row.actual_arrival_date)))
        .map((row) => row.id),
    ))
  } catch {
    return new Set<string>()
  }
}

async function resolveExistingMaterialArrivalNotifications(params: {
  projectId: string
  materialId: string
  arrivedAt?: string | null
}) {
  const notifications = await listNotifications({
    projectId: params.projectId,
    sourceEntityType: SOURCE_ENTITY_TYPE,
  })
  const resolvedAt = normalizeNullableText(params.arrivedAt) ?? nowIso()
  const referencedNotifications = notifications.filter((notification) =>
    isActiveMaterialReminder(notification)
    && metadataReferencesMaterialId(notification.metadata as Record<string, unknown> | null | undefined, params.materialId))
  const referencedMaterialIds = uniqueStrings([
    params.materialId,
    ...referencedNotifications.flatMap((notification) => getMaterialIdsFromMetadata(notification.metadata as Record<string, unknown> | null | undefined)),
  ])
  const arrivedMaterialIdSet = await listArrivedMaterialIds(params.projectId, referencedMaterialIds)
  arrivedMaterialIdSet.add(params.materialId)

  await Promise.all(
    referencedNotifications
      .map((notification) => {
        const metadata = (notification.metadata ?? {}) as Record<string, unknown>
        const materialIds = Array.isArray(metadata.material_ids)
          ? metadata.material_ids.map((value) => normalizeNullableText(value)).filter((value): value is string => Boolean(value))
          : metadata.material_id
            ? [normalizeNullableText(metadata.material_id)].filter((value): value is string => Boolean(value))
            : []
        const remainingMaterialIds = materialIds.filter((materialId) => !arrivedMaterialIdSet.has(materialId))
        const arrivedMaterialIds = uniqueStrings([
          ...(Array.isArray(metadata.arrived_material_ids)
            ? metadata.arrived_material_ids.map((value) => normalizeNullableText(value))
            : []),
          ...materialIds.filter((materialId) => arrivedMaterialIdSet.has(materialId)),
        ])

        if (remainingMaterialIds.length > 0) {
          return updateNotificationById(notification.id, {
            metadata: {
              ...metadata,
              material_ids: remainingMaterialIds,
              arrived_material_ids: arrivedMaterialIds,
            },
            updated_at: resolvedAt,
          }, notification)
        }

        return updateNotificationById(notification.id, {
          lifecycle_status: 'resolved',
          status: 'read',
          is_read: true,
          resolved_at: resolvedAt,
          resolved_source: 'source_resolved',
          updated_at: resolvedAt,
          metadata: {
            ...metadata,
            material_ids: [],
            arrived_material_ids: arrivedMaterialIds,
          },
        }, notification)
      }),
  )
}

export class MaterialArrivalReminderService {
  async handleMaterialArrived(params: {
    projectId: string
    materialId: string
    participantUnitId?: string | null
    arrivedAt?: string | null
    changedBy?: string | null
  }): Promise<MaterialConditionUnlockResult> {
    const materialId = normalizeNullableText(params.materialId)
    if (!materialId) {
      return { conditionUnlockCount: 0, conditionIds: [], taskIds: [], notificationId: null }
    }

    await resolveExistingMaterialArrivalNotifications({
      projectId: params.projectId,
      materialId,
      arrivedAt: params.arrivedAt,
    })

    let linkedConditions: Awaited<ReturnType<typeof findMaterialLinkedConditions>> = []
    try {
      linkedConditions = await findMaterialLinkedConditions({
        projectId: params.projectId,
        materialId,
        participantUnitId: params.participantUnitId,
      })
    } catch (error) {
      logger.warn('[materialArrivalReminderService] failed to resolve linked start conditions; material arrival remains saved', {
        projectId: params.projectId,
        materialId,
        error,
      })
      return { conditionUnlockCount: 0, conditionIds: [], taskIds: [], notificationId: null }
    }

    const conditionIds: string[] = []
    const taskIds: string[] = []
    for (const condition of linkedConditions) {
      const conditionId = normalizeNullableText(condition.id)
      if (!conditionId) continue
      const result = await satisfyCondition(conditionId, {
        reason: 'linked_material_arrived',
        reasonNote: 'Linked material arrived; system auto-satisfied the start condition.',
        satisfiedAt: params.arrivedAt,
        confirmedBy: params.changedBy,
        sourceEventType: 'material_arrival_to_condition',
      })
      if (!result) continue

      conditionIds.push(conditionId)
      taskIds.push(result.taskId)
      await writeMaterialConditionUnlockAudit({
        projectId: params.projectId,
        materialId,
        conditionId,
        taskId: result.taskId,
        unlockedAt: params.arrivedAt,
        unlockedBy: params.changedBy,
        sourceEventType: 'material_arrival_to_condition',
      })
    }

    const uniqueConditionIds = uniqueStrings(conditionIds)
    const uniqueTaskIds = uniqueStrings(taskIds)
    let notificationId: string | null = null
    if (uniqueConditionIds.length > 0) {
      const recipients = await getProjectOwnerRecipients(params.projectId)
      const notification = await notificationTouchpointService.emit({
        project_id: params.projectId,
        type: 'material_condition_auto_unlocked',
        notification_type: 'flow-reminder',
        severity: 'info',
        title: '材料到场已自动满足开工条件',
        content: `材料到场后已自动满足 ${uniqueConditionIds.length} 项开工条件，相关任务可以继续推进。`,
        is_read: false,
        is_broadcast: recipients.userIds.length === 0,
        source_entity_type: SOURCE_ENTITY_TYPE,
        source_entity_id: materialId,
        touchpoint_type: 'dashboard_todo',
        scope_type: 'project',
        dedupe_key: `material_condition_unlock:${params.projectId}:${materialId}`,
        target_route: `/projects/${params.projectId}/materials`,
        target_label: '查看材料管控',
        category: 'materials',
        recipients: recipients.userIds,
        status: 'unread',
        metadata: {
          material_id: materialId,
          condition_ids: uniqueConditionIds,
          task_ids: uniqueTaskIds,
          unlock_count: uniqueConditionIds.length,
        },
        created_at: nowIso(),
      })
      notificationId = notification.id
    }

    return {
      conditionUnlockCount: uniqueConditionIds.length,
      conditionIds: uniqueConditionIds,
      taskIds: uniqueTaskIds,
      notificationId,
    }
  }

  async persistProjectNotifications(projectId: string, currentDate = new Date()) {
    const today = toStartOfDay(currentDate)
    const todayKey = formatDateKey(today)
    const weekStartKey = getWeekStartKey(today)
    const reminderCandidateWindow = {
      fromDate: formatDateKey(addLocalDays(today, -OVERDUE_LOOKBACK_DAYS)),
      toDate: formatDateKey(addLocalDays(today, UPCOMING_WINDOW_DAYS)),
    }
    const [materials, longOverdueMaterials, recipients, projectNotifications] = await Promise.all([
      listMaterialReminderCandidateMaterials(projectId, reminderCandidateWindow),
      listLongOverdueMaterialGovernanceCandidates(projectId, { beforeDate: reminderCandidateWindow.fromDate }),
      getProjectOwnerRecipients(projectId),
      listNotifications({ projectId, sourceEntityType: SOURCE_ENTITY_TYPE }),
    ])

    if (recipients.userIds.length === 0) return []

    const taskImpactContext = await getMaterialTaskImpactContext(projectId, materials)
    const participantUnitIds = uniqueStrings(materials.map((material) => material.participant_unit_id))
    const participantUnitContactRecipients = await getParticipantUnitContactRecipients(projectId, participantUnitIds)
    const acknowledgedNotificationIds = await listAcknowledgedNotificationIds(projectNotifications)
    const overdueCadenceContext = buildOverdueCadenceContext(projectNotifications, acknowledgedNotificationIds)
    const weeklyRemindedMaterialIds = collectWeeklyRemindedMaterialIds(projectNotifications, weekStartKey)
    const upcomingCandidates: ProjectMaterialRecord[] = []
    const overdueCandidates: ProjectMaterialRecord[] = []

    for (const material of materials) {
      if (material.actual_arrival_date) continue
      const expectedArrival = parseDate(material.expected_arrival_date)
      if (!expectedArrival) continue

      const daysUntilExpected = diffInDays(today, expectedArrival)
      if (daysUntilExpected < 0) {
        overdueCandidates.push(material)
        continue
      }

      const explicitTaskStart = parseDate(material.linked_task_start_date)
      const earliestTaskStart = explicitTaskStart ?? (material.participant_unit_id
        ? taskImpactContext.earliestByUnit.get(material.participant_unit_id)?.plannedStart ?? null
        : null)

      const shouldRemindWithTask = Boolean(
        earliestTaskStart
        && daysUntilExpected <= UPCOMING_WINDOW_DAYS
        && diffInDays(expectedArrival, earliestTaskStart) >= 0
        && diffInDays(expectedArrival, earliestTaskStart) <= UPCOMING_WINDOW_DAYS,
      )
      const shouldRemindWithoutTask = !earliestTaskStart && daysUntilExpected <= FALLBACK_WINDOW_DAYS

      if ((shouldRemindWithTask || shouldRemindWithoutTask) && !weeklyRemindedMaterialIds.has(material.id)) {
        upcomingCandidates.push(material)
      }
    }

    const persisted = []
    const candidateMaterialIds = uniqueStrings([
      ...upcomingCandidates.map((material) => material.id),
      ...overdueCandidates.map((material) => material.id),
    ])
    const dataQualityContext = await loadMaterialDataQualityContext(projectId, candidateMaterialIds)

    for (const group of groupByUnit(upcomingCandidates)) {
      const sourceEntityId = buildReminderSourceEntityId(projectId, group.participantUnitId, todayKey, REMINDER_TYPE)
      const explicitGroupTaskStart = getEarliestLinkedTaskStart(group)
      const groupTaskImpact = getGroupTaskImpact(group, taskImpactContext)
      const groupTaskStart = explicitGroupTaskStart ?? groupTaskImpact?.plannedStart ?? null
      const groupLinkedTaskIds = getGroupLinkedTaskIds(group, groupTaskImpact)
      const groupImpactedTaskIds = getGroupImpactedTaskIds(group, groupTaskImpact)
      const unitContactRecipients = group.participantUnitId
        ? participantUnitContactRecipients.byUnitId.get(group.participantUnitId) ?? []
        : []
      const unitContactRecipientSources = group.participantUnitId
        ? participantUnitContactRecipients.sourcesByUnitId.get(group.participantUnitId) ?? []
        : []
      const groupRecipients = getGroupRecipients(recipients, groupTaskImpact, unitContactRecipients)
      const leadDescription = groupTaskStart
        ? `Earliest linked task starts on ${formatDateKey(groupTaskStart)}.`
        : `No linked task start found; reminder uses the ${FALLBACK_WINDOW_DAYS}-day fallback window.`

      persisted.push(await notificationTouchpointService.emit({
        project_id: projectId,
        type: REMINDER_TYPE,
        notification_type: 'business-warning',
        severity: 'warning',
        title: `${group.participantUnitName}材料到场提醒`,
        content: buildReminderContent(group, leadDescription),
        is_read: false,
        is_broadcast: false,
        source_entity_type: SOURCE_ENTITY_TYPE,
        source_entity_id: sourceEntityId,
        touchpoint_type: 'persistent',
        scope_type: 'project',
        dedupe_key: `material:${sourceEntityId}`,
        target_route: `/projects/${projectId}/materials`,
        target_label: '材料管控',
        category: 'materials',
        recipients: groupRecipients,
        status: 'unread',
        metadata: {
          participant_unit_id: group.participantUnitId,
          participant_unit_name: group.participantUnitName,
          material_ids: group.materials.map((material) => material.id),
          ...buildMaterialArrivalReminderRuleMetadata(),
          ...buildCriticalityMetadata(groupTaskImpact),
          ...buildDataQualityMetadata(group, dataQualityContext),
          linked_task_ids: groupLinkedTaskIds,
          impacted_task_ids: groupImpactedTaskIds,
          recipient_sources: getGroupRecipientSources(recipients, group, groupTaskImpact, unitContactRecipients, unitContactRecipientSources),
          link_source: explicitGroupTaskStart ? 'material_condition' : 'participant_unit_fallback',
          dedupe_week_start: weekStartKey,
          reminder_kind: 'upcoming',
        },
        created_at: nowIso(),
      }))
    }

    for (const group of groupByUnit(overdueCandidates)) {
      const sourceEntityId = buildReminderSourceEntityId(projectId, group.participantUnitId, todayKey, OVERDUE_TYPE)
      const groupTaskImpact = getGroupTaskImpact(group, taskImpactContext)
      const cadence = resolveOverdueCadence(group, groupTaskImpact, overdueCadenceContext, today)
      if (!cadence.shouldRemind) continue
      const reminderGroup = { ...group, materials: cadence.reminderMaterials } satisfies ReminderGroup
      const groupLinkedTaskIds = getGroupLinkedTaskIds(group, groupTaskImpact)
      const groupImpactedTaskIds = getGroupImpactedTaskIds(group, groupTaskImpact)
      const unitContactRecipients = group.participantUnitId
        ? participantUnitContactRecipients.byUnitId.get(group.participantUnitId) ?? []
        : []
      const unitContactRecipientSources = group.participantUnitId
        ? participantUnitContactRecipients.sourcesByUnitId.get(group.participantUnitId) ?? []
        : []
      const groupRecipients = getGroupRecipients(recipients, groupTaskImpact, unitContactRecipients)
      persisted.push(await notificationTouchpointService.emit({
        project_id: projectId,
        type: OVERDUE_TYPE,
        notification_type: 'business-warning',
        severity: 'critical',
        title: `${group.participantUnitName}材料逾期未到`,
        content: buildOverdueContent(reminderGroup),
        is_read: false,
        is_broadcast: true,
        source_entity_type: SOURCE_ENTITY_TYPE,
        source_entity_id: sourceEntityId,
        touchpoint_type: 'persistent',
        scope_type: 'project',
        dedupe_key: `material:${sourceEntityId}`,
        target_route: `/projects/${projectId}/materials`,
        target_label: '材料管控',
        category: 'materials',
        recipients: groupRecipients,
        status: 'unread',
        metadata: {
          participant_unit_id: group.participantUnitId,
          participant_unit_name: group.participantUnitName,
          material_ids: reminderGroup.materials.map((material) => material.id),
          ...buildMaterialArrivalReminderRuleMetadata(),
          ...buildCriticalityMetadata(groupTaskImpact),
          ...buildDataQualityMetadata(reminderGroup, dataQualityContext),
          linked_task_ids: groupLinkedTaskIds,
          impacted_task_ids: groupImpactedTaskIds,
          recipient_sources: getGroupRecipientSources(recipients, group, groupTaskImpact, unitContactRecipients, unitContactRecipientSources),
          link_source: getEarliestLinkedTaskStart(group) ? 'material_condition' : 'participant_unit_fallback',
          reminder_kind: 'overdue',
          reminder_day: todayKey,
          cadence_policy: cadence.cadencePolicy,
          suppressed_material_ids: cadence.suppressedMaterialIds,
        },
        created_at: nowIso(),
      }))
    }

    const governanceMonth = getMonthKey(today)
    const monthlyGovernedMaterialIds = collectMonthlyGovernanceMaterialIds(projectNotifications, governanceMonth)
    const longOverdueCandidates = longOverdueMaterials.filter((material) => !monthlyGovernedMaterialIds.has(material.id))
    const longOverdueDataQualityContext = await loadMaterialDataQualityContext(
      projectId,
      longOverdueCandidates.map((material) => material.id),
    )
    for (const group of groupByUnit(longOverdueCandidates)) {
      const sourceEntityId = `${projectId}:${group.participantUnitId ?? 'unassigned'}:${governanceMonth}:${LONG_OVERDUE_TYPE}`
      const groupTaskImpact = getGroupTaskImpact(group, taskImpactContext)
      const unitContactRecipients = group.participantUnitId
        ? participantUnitContactRecipients.byUnitId.get(group.participantUnitId) ?? []
        : []
      const unitContactRecipientSources = group.participantUnitId
        ? participantUnitContactRecipients.sourcesByUnitId.get(group.participantUnitId) ?? []
        : []
      persisted.push(await notificationTouchpointService.emit({
        project_id: projectId,
        type: LONG_OVERDUE_TYPE,
        notification_type: 'business-warning',
        severity: 'warning',
        title: `${group.participantUnitName}材料超长期逾期治理`,
        content: buildLongOverdueGovernanceContent(group),
        is_read: false,
        is_broadcast: false,
        source_entity_type: SOURCE_ENTITY_TYPE,
        source_entity_id: sourceEntityId,
        touchpoint_type: 'persistent',
        scope_type: 'project',
        dedupe_key: `material:${sourceEntityId}`,
        target_route: `/projects/${projectId}/materials`,
        target_label: '材料管控',
        category: 'materials',
        recipients: getGroupRecipients(recipients, groupTaskImpact, unitContactRecipients),
        status: 'unread',
        metadata: {
          participant_unit_id: group.participantUnitId,
          participant_unit_name: group.participantUnitName,
          material_ids: group.materials.map((material) => material.id),
          ...buildMaterialArrivalReminderRuleMetadata(),
          ...buildCriticalityMetadata(groupTaskImpact),
          ...buildDataQualityMetadata(group, longOverdueDataQualityContext),
          linked_task_ids: getGroupLinkedTaskIds(group, groupTaskImpact),
          impacted_task_ids: getGroupImpactedTaskIds(group, groupTaskImpact),
          recipient_sources: getGroupRecipientSources(recipients, group, groupTaskImpact, unitContactRecipients, unitContactRecipientSources),
          governance_kind: 'long_overdue_summary',
          reminder_kind: 'long_overdue_governance',
          cadence_policy: LONG_OVERDUE_GOVERNANCE_CADENCE,
          long_overdue_threshold_days: OVERDUE_LOOKBACK_DAYS,
          governance_month: governanceMonth,
        },
        created_at: nowIso(),
      }))
    }

    return persisted
  }

  async run(projectId?: string | null, currentDate = new Date(), projectIds?: string[] | null): Promise<MaterialArrivalReminderRunResult> {
    if (projectId) {
      const notifications = await this.persistProjectNotifications(projectId, currentDate)
      return {
        projects: 1,
        notifications: notifications.length,
        reminderCount: notifications.filter((item) => item.type === REMINDER_TYPE).length,
        overdueCount: notifications.filter((item) => item.type === OVERDUE_TYPE).length,
      }
    }

    const activeProjectIds = await listActiveProjectIds(projectIds)
    const scoped = await runScopedBatch({
      operationName: 'material_arrival_reminder_generation',
      scopeIds: activeProjectIds,
      operation: (currentProjectId) => this.persistProjectNotifications(currentProjectId, currentDate),
    })
    const notifications = scoped.values.flat()

    return {
      projects: activeProjectIds.length,
      notifications: notifications.length,
      reminderCount: notifications.filter((item) => item.type === REMINDER_TYPE).length,
      overdueCount: notifications.filter((item) => item.type === OVERDUE_TYPE).length,
    }
  }
}

export const materialArrivalReminderService = new MaterialArrivalReminderService()
