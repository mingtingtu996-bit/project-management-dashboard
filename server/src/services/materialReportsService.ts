import { query as rawQuery } from '../database.js'
import { getLinkedMaterialIdFromCondition, isOpenMaterialLinkedTaskStatus } from './materialTaskLinkPolicy.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'

type ProjectMaterialRow = {
  id: string
  project_id: string
  participant_unit_id?: string | null
  material_name?: string | null
  specialty_type?: string | null
  requires_sample_confirmation?: boolean | null
  sample_confirmed?: boolean | null
  expected_arrival_date?: string | null
  actual_arrival_date?: string | null
  requires_inspection?: boolean | null
  inspection_done?: boolean | null
  version?: number | null
  created_at?: string | null
  updated_at?: string | null
}

type ParticipantUnitRow = {
  id: string
  unit_name?: string | null
}

type TaskLinkRow = {
  id: string
  project_id?: string | null
  participant_unit_id?: string | null
  title?: string | null
  planned_start_date?: string | null
  start_date?: string | null
  status?: string | null
}

type MaterialTaskLink = {
  id: string
  title: string
  startDate: string
  status: string | null
}

type MaterialConditionLinkRow = {
  task_id?: string | null
  source_ref_id?: string | null
  source_type?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
}

const MATERIAL_REPORT_CACHE_TTL_MS = Number(process.env.MATERIAL_REPORT_CACHE_TTL_MS ?? 5_000)
const materialListCache = new Map<string, { expiresAt: number; promise: Promise<ProjectMaterialRecord[]> }>()
const OPEN_TASK_STATUS_VALUES = ['todo', 'pending', 'in_progress', 'not_started', '进行中', '未开始']

export interface ProjectMaterialRecord {
  id: string
  project_id: string
  participant_unit_id: string | null
  participant_unit_name: string | null
  material_name: string
  specialty_type: string | null
  requires_sample_confirmation: boolean
  sample_confirmed: boolean
  expected_arrival_date: string
  actual_arrival_date: string | null
  requires_inspection: boolean
  inspection_done: boolean
  linked_task_id?: string | null
  linked_task_title?: string | null
  linked_task_start_date?: string | null
  linked_task_status?: string | null
  linked_task_buffer_days?: number | null
  version: number
  created_at: string
  updated_at: string
}

export interface MaterialReminderCandidateOptions {
  fromDate: string
  toDate: string
}

export interface MaterialLongOverdueGovernanceOptions {
  beforeDate: string
}

export interface MaterialRateByUnit {
  participantUnitId: string | null
  participantUnitName: string | null
  specialtyTypes: string[]
  totalExpectedCount: number
  onTimeCount: number
  arrivalRate: number
}

export interface MaterialMonthlyTrendPoint {
  month: string
  totalExpectedCount: number
  onTimeCount: number
  arrivalRate: number
}

export interface MaterialCategorySummary {
  category: string
  count: number
  percentage: number
}

export interface MaterialReportSummary {
  overview: {
    totalExpectedCount: number
    onTimeCount: number
    arrivalRate: number
  }
  byUnit: MaterialRateByUnit[]
  byCategory: MaterialCategorySummary[]
  monthlyTrend: MaterialMonthlyTrendPoint[]
}

function toBoolean(value: unknown) {
  return value === true || value === 1 || value === '1'
}

function normalizeNullableText(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeRequiredText(value: unknown, fallback = '') {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function normalizeTaskTitle(row: TaskLinkRow) {
  return normalizeRequiredText(row.title, '未命名任务')
}

function nowIso() {
  return new Date().toISOString()
}

function toMonthKey(value?: string | null) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  return raw.slice(0, 7)
}

function buildRecentMonthKeys(count = 6) {
  const result: string[] = []
  const cursor = new Date()
  cursor.setDate(1)
  cursor.setHours(0, 0, 0, 0)

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth() - index, 1)
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    result.push(month)
  }

  return result
}

function computeArrivalRate(onTimeCount: number, totalExpectedCount: number) {
  if (totalExpectedCount <= 0) return 0
  return Math.round((onTimeCount / totalExpectedCount) * 100)
}

function computePercentage(count: number, total: number) {
  if (total <= 0) return 0
  return Math.round((count / total) * 100)
}

function diffInDays(from?: string | null, to?: string | null) {
  return signedDurationDayDelta(from, to)
}

function isOpenTaskStatus(value?: string | null) {
  return isOpenMaterialLinkedTaskStatus(value)
}

function getTaskStartDate(row: TaskLinkRow) {
  return normalizeNullableText(row.planned_start_date) ?? normalizeNullableText(row.start_date)
}

async function listTaskLinkRows(projectId: string, taskIds?: string[] | null) {
  const scopedTaskIds = Array.isArray(taskIds)
    ? [...new Set(taskIds.map((id) => normalizeRequiredText(id)).filter(Boolean))]
    : null
  if (Array.isArray(taskIds) && scopedTaskIds?.length === 0) return []

  const result = scopedTaskIds && scopedTaskIds.length > 0
    ? await rawQuery(
      `
        SELECT id, project_id, participant_unit_id, title, planned_start_date, start_date, status
        FROM tasks
        WHERE project_id = $1
          AND id::text = ANY($2::text[])
      `,
      [projectId, scopedTaskIds],
    )
    : await rawQuery(
      `
        SELECT id, project_id, participant_unit_id, title, planned_start_date, start_date, status
        FROM tasks
        WHERE project_id = $1
      `,
      [projectId],
    )

  return (result.rows ?? []) as TaskLinkRow[]
}

async function listMaterialConditionLinks(projectId: string, materialIds: string[]) {
  const scopedMaterialIds = [...new Set(materialIds.map((id) => normalizeRequiredText(id)).filter(Boolean))]
  if (scopedMaterialIds.length === 0) return []

  const result = await rawQuery(
    `
      SELECT task_id, source_ref_id, source_type, source_entity_type, source_entity_id
      FROM task_conditions
      WHERE project_id = $1
        AND (
          (source_type = 'material' AND source_ref_id::text = ANY($2::text[]))
          OR (source_entity_type = 'project_material' AND source_entity_id = ANY($2::text[]))
        )
    `,
    [projectId, scopedMaterialIds],
  )
  return (result.rows ?? []) as MaterialConditionLinkRow[]
}

async function listParticipantUnitTaskLinkRows(projectId: string, participantUnitIds: string[]) {
  const scopedUnitIds = [...new Set(participantUnitIds.map((id) => normalizeRequiredText(id)).filter(Boolean))]
  if (scopedUnitIds.length === 0) return []

  const result = await rawQuery(
    `
      SELECT DISTINCT ON (participant_unit_id)
        id, project_id, participant_unit_id, title, planned_start_date, start_date, status
      FROM tasks
      WHERE project_id = $1
        AND participant_unit_id::text = ANY($2::text[])
        AND LOWER(TRIM(COALESCE(status, ''))) = ANY($3::text[])
        AND COALESCE(planned_start_date, start_date) IS NOT NULL
      ORDER BY participant_unit_id, COALESCE(planned_start_date, start_date) ASC, created_at ASC
    `,
    [projectId, scopedUnitIds, OPEN_TASK_STATUS_VALUES],
  )
  return (result.rows ?? []) as TaskLinkRow[]
}

function isOnTime(material: Pick<ProjectMaterialRecord, 'expected_arrival_date' | 'actual_arrival_date'>) {
  if (!material.actual_arrival_date) return false
  return material.actual_arrival_date <= material.expected_arrival_date
}

const MATERIAL_CATEGORY_LABELS = ['钢材', '混凝土', '管材', '电气', '其他'] as const

function classifyMaterialCategory(material: Pick<ProjectMaterialRecord, 'material_name' | 'specialty_type'>) {
  const token = `${material.material_name} ${material.specialty_type ?? ''}`.toLowerCase()

  if (/钢|steel|型材|钢筋|钢板|钢管/.test(token)) return '钢材'
  if (/混凝土|砼|水泥|砂浆|concrete/.test(token)) return '混凝土'
  if (/管|pvc|ppr|管材|管件|风管/.test(token)) return '管材'
  if (/电|线缆|电缆|桥架|配电|开关|灯具|弱电/.test(token)) return '电气'
  return '其他'
}

function buildLinkedTaskMap(taskRows: TaskLinkRow[]) {
  const linkedTaskMap = new Map<string, MaterialTaskLink>()

  for (const row of taskRows) {
    const participantUnitId = normalizeNullableText(row.participant_unit_id)
    const startDate = getTaskStartDate(row)
    if (!participantUnitId || !startDate || !isOpenTaskStatus(row.status)) continue

    const nextTask: MaterialTaskLink = {
      id: normalizeRequiredText(row.id),
      title: normalizeTaskTitle(row),
      startDate,
      status: normalizeNullableText(row.status),
    }

    const current = linkedTaskMap.get(participantUnitId)
    if (!current || nextTask.startDate < current.startDate) {
      linkedTaskMap.set(participantUnitId, nextTask)
    }
  }

  return linkedTaskMap
}

function buildMaterialConditionTaskMap(conditionRows: MaterialConditionLinkRow[], taskRows: TaskLinkRow[]) {
  const taskById = new Map(taskRows.map((row) => [normalizeRequiredText(row.id), row]))
  const linkedTaskMap = new Map<string, MaterialTaskLink>()

  for (const condition of conditionRows) {
    const materialId = getLinkedMaterialIdFromCondition(condition)
    const taskId = normalizeNullableText(condition.task_id)
    if (!materialId || !taskId) continue

    const row = taskById.get(taskId)
    if (!row) continue

    const startDate = getTaskStartDate(row)
    if (!startDate || !isOpenTaskStatus(row.status)) continue

    const nextTask: MaterialTaskLink = {
      id: normalizeRequiredText(row.id),
      title: normalizeTaskTitle(row),
      startDate,
      status: normalizeNullableText(row.status),
    }

    const current = linkedTaskMap.get(materialId)
    if (!current || nextTask.startDate < current.startDate) {
      linkedTaskMap.set(materialId, nextTask)
    }
  }

  return linkedTaskMap
}

function normalizeMaterialRow(
  row: ProjectMaterialRow,
  participantUnitNameMap: Map<string, string>,
  linkedTaskMap: Map<string, MaterialTaskLink>,
  explicitLinkedTaskMap: Map<string, MaterialTaskLink>,
): ProjectMaterialRecord {
  const participantUnitId = normalizeNullableText(row.participant_unit_id)
  const explicitLinkedTask = explicitLinkedTaskMap.get(normalizeRequiredText(row.id)) ?? null
  const linkedTask = explicitLinkedTask ?? (participantUnitId ? linkedTaskMap.get(participantUnitId) ?? null : null)
  return {
    id: normalizeRequiredText(row.id),
    project_id: normalizeRequiredText(row.project_id),
    participant_unit_id: participantUnitId,
    participant_unit_name: participantUnitId ? participantUnitNameMap.get(participantUnitId) ?? null : null,
    material_name: normalizeRequiredText(row.material_name, '未命名材料'),
    specialty_type: normalizeNullableText(row.specialty_type),
    requires_sample_confirmation: toBoolean(row.requires_sample_confirmation),
    sample_confirmed: toBoolean(row.sample_confirmed),
    expected_arrival_date: normalizeRequiredText(row.expected_arrival_date),
    actual_arrival_date: normalizeNullableText(row.actual_arrival_date),
    requires_inspection: toBoolean(row.requires_inspection),
    inspection_done: toBoolean(row.inspection_done),
    linked_task_id: linkedTask?.id ?? null,
    linked_task_title: linkedTask?.title ?? null,
    linked_task_start_date: linkedTask?.startDate ?? null,
    linked_task_status: linkedTask?.status ?? null,
    linked_task_buffer_days: linkedTask ? diffInDays(row.expected_arrival_date, linkedTask.startDate) : null,
    version: Number(row.version ?? 1) || 1,
    created_at: normalizeRequiredText(row.created_at, nowIso()),
    updated_at: normalizeRequiredText(row.updated_at, nowIso()),
  }
}

async function listProjectMaterialRows(projectId: string) {
  const result = await rawQuery(
    `
      SELECT *
      FROM project_materials
      WHERE project_id = $1
        AND COALESCE(record_status, 'active') = 'active'
      ORDER BY expected_arrival_date ASC NULLS LAST, created_at ASC NULLS LAST
    `,
    [projectId],
  )
  return (result.rows ?? []) as ProjectMaterialRow[]
}

async function listMaterialReminderCandidateRows(projectId: string, options: MaterialReminderCandidateOptions) {
  const result = await rawQuery(
    `
      SELECT *
      FROM public.project_materials
      WHERE project_id = $1
        AND COALESCE(record_status, 'active') = 'active'
        AND actual_arrival_date IS NULL
        AND expected_arrival_date IS NOT NULL
        AND expected_arrival_date >= $2::date
        AND expected_arrival_date <= $3::date
      ORDER BY expected_arrival_date ASC NULLS LAST, created_at ASC NULLS LAST
    `,
    [projectId, options.fromDate, options.toDate],
  )
  return (result.rows ?? []) as ProjectMaterialRow[]
}

async function listLongOverdueMaterialGovernanceRows(projectId: string, options: MaterialLongOverdueGovernanceOptions) {
  const result = await rawQuery(
    `
      SELECT *
      FROM public.project_materials
      WHERE project_id = $1
        AND COALESCE(record_status, 'active') = 'active'
        AND actual_arrival_date IS NULL
        AND expected_arrival_date IS NOT NULL
        AND expected_arrival_date < $2::date
      ORDER BY expected_arrival_date ASC NULLS LAST, created_at ASC NULLS LAST
    `,
    [projectId, options.beforeDate],
  )
  return (result.rows ?? []) as ProjectMaterialRow[]
}

async function listParticipantUnitRows(projectId: string, participantUnitIds: string[]) {
  if (participantUnitIds.length === 0) return [] as ParticipantUnitRow[]

  const result = await rawQuery(
    `
      SELECT id, unit_name
      FROM participant_units
      WHERE project_id = $1
        AND id::text = ANY($2::text[])
    `,
    [projectId, participantUnitIds],
  )
  return (result.rows ?? []) as ParticipantUnitRow[]
}

// v1.4.21: default filter record_status = active
async function loadProjectMaterials(projectId: string): Promise<ProjectMaterialRecord[]> {
  const materialRows = await listProjectMaterialRows(projectId)
  return hydrateProjectMaterials(projectId, materialRows)
}

async function hydrateProjectMaterials(projectId: string, materialRows: ProjectMaterialRow[]): Promise<ProjectMaterialRecord[]> {
  const participantUnitIds = [...new Set(materialRows
    .map((row) => normalizeNullableText(row.participant_unit_id))
    .filter((value): value is string => Boolean(value)))]

  const participantUnitNameMap = new Map<string, string>()

  if (participantUnitIds.length > 0) {
    for (const row of await listParticipantUnitRows(projectId, participantUnitIds)) {
      participantUnitNameMap.set(String(row.id), normalizeRequiredText(row.unit_name, '未命名单位'))
    }
  }

  const materialIds = materialRows.map((row) => normalizeRequiredText(row.id)).filter(Boolean)
  const materialConditionLinks = await listMaterialConditionLinks(projectId, materialIds)
  const explicitTaskRows = await listTaskLinkRows(
    projectId,
    materialConditionLinks.map((row) => normalizeNullableText(row.task_id)).filter((value): value is string => Boolean(value)),
  )
  const explicitLinkedTaskMap = buildMaterialConditionTaskMap(materialConditionLinks, explicitTaskRows)
  const linkedTaskMap = buildLinkedTaskMap(await listParticipantUnitTaskLinkRows(projectId, participantUnitIds))

  return materialRows.map((row) => normalizeMaterialRow(row, participantUnitNameMap, linkedTaskMap, explicitLinkedTaskMap))
}

export async function listProjectMaterials(projectId: string): Promise<ProjectMaterialRecord[]> {
  const key = normalizeRequiredText(projectId)
  const now = Date.now()
  const cached = materialListCache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.promise
  }

  const promise = loadProjectMaterials(projectId)
  materialListCache.set(key, { expiresAt: now + MATERIAL_REPORT_CACHE_TTL_MS, promise })

  try {
    return await promise
  } catch (error) {
    if (materialListCache.get(key)?.promise === promise) {
      materialListCache.delete(key)
    }
    throw error
  }
}

export function clearMaterialReportCache(projectId: string) {
  materialListCache.delete(normalizeRequiredText(projectId))
}

export async function listMaterialReminderCandidateMaterials(
  projectId: string,
  options: MaterialReminderCandidateOptions,
): Promise<ProjectMaterialRecord[]> {
  const rows = await listMaterialReminderCandidateRows(projectId, options)
  return hydrateProjectMaterials(projectId, rows)
}

export async function listLongOverdueMaterialGovernanceCandidates(
  projectId: string,
  options: MaterialLongOverdueGovernanceOptions,
): Promise<ProjectMaterialRecord[]> {
  const rows = await listLongOverdueMaterialGovernanceRows(projectId, options)
  return hydrateProjectMaterials(projectId, rows)
}

export async function buildMaterialReportSummary(projectId: string): Promise<MaterialReportSummary> {
  const materials = await listProjectMaterials(projectId)

  const totalExpectedCount = materials.length
  const onTimeCount = materials.filter(isOnTime).length

  const byUnitMap = new Map<string, {
    participantUnitId: string | null
    participantUnitName: string | null
    specialtyTypes: Set<string>
    totalExpectedCount: number
    onTimeCount: number
  }>()

  for (const material of materials) {
    const key = material.participant_unit_id ?? '__unassigned__'
    const current = byUnitMap.get(key) ?? {
      participantUnitId: material.participant_unit_id,
      participantUnitName: material.participant_unit_name,
      specialtyTypes: new Set<string>(),
      totalExpectedCount: 0,
      onTimeCount: 0,
    }

    current.totalExpectedCount += 1
    if (isOnTime(material)) current.onTimeCount += 1
    if (material.specialty_type) current.specialtyTypes.add(material.specialty_type)

    byUnitMap.set(key, current)
  }

  const byUnit = [...byUnitMap.values()]
    .map((entry) => ({
      participantUnitId: entry.participantUnitId,
      participantUnitName: entry.participantUnitName,
      specialtyTypes: [...entry.specialtyTypes].sort((left, right) => left.localeCompare(right, 'zh-CN')),
      totalExpectedCount: entry.totalExpectedCount,
      onTimeCount: entry.onTimeCount,
      arrivalRate: computeArrivalRate(entry.onTimeCount, entry.totalExpectedCount),
    }))
    .sort((left, right) => {
      if (left.participantUnitId === null && right.participantUnitId !== null) return 1
      if (left.participantUnitId !== null && right.participantUnitId === null) return -1
      if (right.arrivalRate !== left.arrivalRate) return right.arrivalRate - left.arrivalRate
      return (left.participantUnitName || '无归属单位').localeCompare(right.participantUnitName || '无归属单位', 'zh-CN')
    })

  const categoryMap = new Map<string, number>(
    MATERIAL_CATEGORY_LABELS.map((category) => [category, 0]),
  )

  for (const material of materials) {
    const category = classifyMaterialCategory(material)
    categoryMap.set(category, (categoryMap.get(category) ?? 0) + 1)
  }

  const byCategory = MATERIAL_CATEGORY_LABELS.map((category) => {
    const count = categoryMap.get(category) ?? 0
    return {
      category,
      count,
      percentage: computePercentage(count, totalExpectedCount),
    }
  })

  const recentMonths = buildRecentMonthKeys(6)
  const monthlyMap = new Map<string, { totalExpectedCount: number; onTimeCount: number }>(
    recentMonths.map((month) => [month, { totalExpectedCount: 0, onTimeCount: 0 }]),
  )

  for (const material of materials) {
    const month = toMonthKey(material.expected_arrival_date)
    if (!month || !monthlyMap.has(month)) continue

    const bucket = monthlyMap.get(month)!
    bucket.totalExpectedCount += 1
    if (isOnTime(material)) bucket.onTimeCount += 1
  }

  const monthlyTrend = recentMonths.map((month) => {
    const bucket = monthlyMap.get(month)!
    return {
      month,
      totalExpectedCount: bucket.totalExpectedCount,
      onTimeCount: bucket.onTimeCount,
      arrivalRate: computeArrivalRate(bucket.onTimeCount, bucket.totalExpectedCount),
    }
  })

  return {
    overview: {
      totalExpectedCount,
      onTimeCount,
      arrivalRate: computeArrivalRate(onTimeCount, totalExpectedCount),
    },
    byUnit,
    byCategory,
    monthlyTrend,
  }
}
