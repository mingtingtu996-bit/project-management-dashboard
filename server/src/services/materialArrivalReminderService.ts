import { v4 as uuidv4 } from 'uuid'

import { normalizeProjectPermissionLevel } from '../auth/access.js'
import { executeSQL } from './dbService.js'
import { listProjectMaterials, type ProjectMaterialRecord } from './materialReportsService.js'
import { findNotification, insertNotification, listNotifications } from './notificationStore.js'
import { isProjectActiveStatus } from '../utils/projectStatus.js'

type ProjectRow = {
  id: string
  status?: string | null
  owner_id?: string | null
}

type ProjectMemberRow = {
  project_id: string
  user_id: string
  role?: string | null
  permission_level?: string | null
}

type TaskRow = {
  id: string
  project_id: string
  participant_unit_id?: string | null
  planned_start_date?: string | null
  status?: string | null
}

type ReminderGroup = {
  participantUnitId: string | null
  participantUnitName: string
  materials: ProjectMaterialRecord[]
}

export interface MaterialArrivalReminderRunResult {
  projects: number
  notifications: number
  reminderCount: number
  overdueCount: number
}

const SOURCE_ENTITY_TYPE = 'project_material'
const REMINDER_TYPE = 'material_arrival_reminder'
const OVERDUE_TYPE = 'material_arrival_overdue'
const UPCOMING_WINDOW_DAYS = 7
const FALLBACK_WINDOW_DAYS = 5
const DAY_IN_MS = 24 * 60 * 60 * 1000

function nowIso() {
  return new Date().toISOString()
}

function toStartOfDay(value = new Date()) {
  const next = new Date(value)
  next.setHours(0, 0, 0, 0)
  return next
}

function formatDateKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

function getWeekStartKey(value = new Date()) {
  const date = toStartOfDay(value)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return formatDateKey(date)
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
  return Math.round((to.getTime() - from.getTime()) / DAY_IN_MS)
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(String(value ?? '').trim())))]
}

function normalizeUnitName(value?: string | null) {
  return String(value ?? '').trim() || '无归属单位'
}

function isOpenTaskStatus(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['todo', 'pending', 'in_progress', '进行中', '未开始'].includes(normalized)
}

function buildReminderSourceEntityId(projectId: string, participantUnitId: string | null, dayKey: string, type: string) {
  return `${projectId}:${participantUnitId ?? 'unassigned'}:${dayKey}:${type}`
}

function collectWeeklyRemindedMaterialIds(projectNotifications: Array<{ type?: string | null; created_at?: string | null; metadata?: Record<string, unknown> | null }>, weekStartKey: string) {
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
      const normalized = String(materialId ?? '').trim()
      if (normalized) reminded.add(normalized)
    }
  }

  return reminded
}

async function getProjectOwnerRecipients(projectId: string) {
  const [projects, members] = await Promise.all([
    executeSQL<ProjectRow>('SELECT id, owner_id FROM projects WHERE id = ? LIMIT 1', [projectId]),
    executeSQL<ProjectMemberRow>('SELECT project_id, user_id, role, permission_level FROM project_members WHERE project_id = ?', [projectId]),
  ])

  return uniqueStrings([
    projects[0]?.owner_id ?? null,
    ...(members ?? [])
      .filter((member) => normalizeProjectPermissionLevel(member.permission_level ?? member.role) === 'owner')
      .map((member) => member.user_id),
  ])
}

async function getEarliestTaskStartByUnit(projectId: string) {
  const tasks = await executeSQL<TaskRow>(
    'SELECT id, project_id, participant_unit_id, planned_start_date, status FROM tasks WHERE project_id = ?',
    [projectId],
  )

  const earliestByUnit = new Map<string, Date>()

  for (const task of tasks ?? []) {
    const participantUnitId = String(task.participant_unit_id ?? '').trim()
    const plannedStart = parseDate(task.planned_start_date)
    if (!participantUnitId || !plannedStart || !isOpenTaskStatus(task.status)) continue

    const current = earliestByUnit.get(participantUnitId)
    if (!current || plannedStart.getTime() < current.getTime()) {
      earliestByUnit.set(participantUnitId, plannedStart)
    }
  }

  return earliestByUnit
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

function buildReminderContent(group: ReminderGroup, leadDescription: string) {
  const materialSummary = group.materials
    .map((material) => `${material.material_name}（预计 ${material.expected_arrival_date}）`)
    .join('、')

  return `${group.participantUnitName}有 ${group.materials.length} 项材料进入到场提醒窗口：${materialSummary}。${leadDescription}`
}

function buildOverdueContent(group: ReminderGroup) {
  const materialSummary = group.materials
    .map((material) => `${material.material_name}（应到 ${material.expected_arrival_date}）`)
    .join('、')

  return `${group.participantUnitName}仍有 ${group.materials.length} 项材料逾期未到：${materialSummary}。请尽快核实到场时间。`
}

export class MaterialArrivalReminderService {
  async persistProjectNotifications(projectId: string, currentDate = new Date()) {
    const today = toStartOfDay(currentDate)
    const todayKey = formatDateKey(today)
    const weekStartKey = getWeekStartKey(today)
    const [materials, recipients, projectNotifications, earliestTaskStartByUnit] = await Promise.all([
      listProjectMaterials(projectId),
      getProjectOwnerRecipients(projectId),
      listNotifications({ projectId, sourceEntityType: SOURCE_ENTITY_TYPE }),
      getEarliestTaskStartByUnit(projectId),
    ])

    if (recipients.length === 0) {
      return []
    }

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

      const earliestTaskStart = material.participant_unit_id
        ? earliestTaskStartByUnit.get(material.participant_unit_id)
        : null

      const shouldRemindWithTask = Boolean(
        earliestTaskStart &&
        daysUntilExpected <= UPCOMING_WINDOW_DAYS &&
        diffInDays(expectedArrival, earliestTaskStart) >= 0 &&
        diffInDays(expectedArrival, earliestTaskStart) <= UPCOMING_WINDOW_DAYS,
      )
      const shouldRemindWithoutTask = !earliestTaskStart && daysUntilExpected <= FALLBACK_WINDOW_DAYS

      if ((shouldRemindWithTask || shouldRemindWithoutTask) && !weeklyRemindedMaterialIds.has(material.id)) {
        upcomingCandidates.push(material)
      }
    }

    const persisted = []

    for (const group of groupByUnit(upcomingCandidates)) {
      const sourceEntityId = buildReminderSourceEntityId(projectId, group.participantUnitId, todayKey, REMINDER_TYPE)
      const existing = await findNotification({
        projectId,
        sourceEntityType: SOURCE_ENTITY_TYPE,
        sourceEntityId,
        type: REMINDER_TYPE,
      })
      if (existing) continue

      const leadDescription = group.participantUnitId && earliestTaskStartByUnit.has(group.participantUnitId)
        ? `最早关联任务计划开始为 ${formatDateKey(earliestTaskStartByUnit.get(group.participantUnitId) as Date)}。`
        : `当前未匹配到在施任务，已按预计到场日前 5 天发出提醒。`

      persisted.push(await insertNotification({
        id: uuidv4(),
        project_id: projectId,
        type: REMINDER_TYPE,
        notification_type: REMINDER_TYPE,
        severity: 'warning',
        title: `${group.participantUnitName}材料到场提醒`,
        content: buildReminderContent(group, leadDescription),
        is_read: false,
        is_broadcast: false,
        source_entity_type: SOURCE_ENTITY_TYPE,
        source_entity_id: sourceEntityId,
        category: 'materials',
        recipients,
        status: 'unread',
        metadata: {
          participant_unit_id: group.participantUnitId,
          participant_unit_name: group.participantUnitName,
          material_ids: group.materials.map((material) => material.id),
          dedupe_week_start: weekStartKey,
          reminder_kind: 'upcoming',
        },
        created_at: nowIso(),
      }))
    }

    for (const group of groupByUnit(overdueCandidates)) {
      const sourceEntityId = buildReminderSourceEntityId(projectId, group.participantUnitId, todayKey, OVERDUE_TYPE)
      const existing = await findNotification({
        projectId,
        sourceEntityType: SOURCE_ENTITY_TYPE,
        sourceEntityId,
        type: OVERDUE_TYPE,
      })
      if (existing) continue

      persisted.push(await insertNotification({
        id: uuidv4(),
        project_id: projectId,
        type: OVERDUE_TYPE,
        notification_type: OVERDUE_TYPE,
        severity: 'critical',
        title: `${group.participantUnitName}材料逾期未到`,
        content: buildOverdueContent(group),
        is_read: false,
        is_broadcast: true,
        source_entity_type: SOURCE_ENTITY_TYPE,
        source_entity_id: sourceEntityId,
        category: 'materials',
        recipients,
        status: 'unread',
        metadata: {
          participant_unit_id: group.participantUnitId,
          participant_unit_name: group.participantUnitName,
          material_ids: group.materials.map((material) => material.id),
          reminder_kind: 'overdue',
          reminder_day: todayKey,
        },
        created_at: nowIso(),
      }))
    }

    return persisted
  }

  async run(projectId?: string, currentDate = new Date()): Promise<MaterialArrivalReminderRunResult> {
    if (projectId) {
      const notifications = await this.persistProjectNotifications(projectId, currentDate)
      return {
        projects: 1,
        notifications: notifications.length,
        reminderCount: notifications.filter((item) => item.type === REMINDER_TYPE).length,
        overdueCount: notifications.filter((item) => item.type === OVERDUE_TYPE).length,
      }
    }

    const projects = await executeSQL<ProjectRow>('SELECT id, status FROM projects')
    const activeProjects = (projects ?? []).filter((project) => isProjectActiveStatus(project.status))
    const settled = await Promise.allSettled(activeProjects.map((project) => this.persistProjectNotifications(project.id, currentDate)))
    const notifications = settled
      .filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<MaterialArrivalReminderService['persistProjectNotifications']>>> => item.status === 'fulfilled')
      .flatMap((item) => item.value)

    return {
      projects: activeProjects.length,
      notifications: notifications.length,
      reminderCount: notifications.filter((item) => item.type === REMINDER_TYPE).length,
      overdueCount: notifications.filter((item) => item.type === OVERDUE_TYPE).length,
    }
  }
}

export const materialArrivalReminderService = new MaterialArrivalReminderService()
