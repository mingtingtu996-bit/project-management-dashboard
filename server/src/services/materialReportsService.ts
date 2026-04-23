import { supabase } from './dbService.js'

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
  participant_unit_id?: string | null
  title?: string | null
  name?: string | null
  planned_start_date?: string | null
  start_date?: string | null
  status?: string | null
}

const TASK_LINK_SELECT_COLUMNS = [
  'id',
  'participant_unit_id',
  'title',
  'name',
  'planned_start_date',
  'start_date',
  'status',
] as const

type MaterialTaskLink = {
  id: string
  title: string
  startDate: string
  status: string | null
}

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

export interface MaterialReportSummary {
  overview: {
    totalExpectedCount: number
    onTimeCount: number
    arrivalRate: number
  }
  byUnit: MaterialRateByUnit[]
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
  return normalizeRequiredText(row.title ?? row.name, '未命名任务')
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

function parseDate(value?: string | null) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

function diffInDays(from?: string | null, to?: string | null) {
  const fromDate = parseDate(from)
  const toDate = parseDate(to)
  if (!fromDate || !toDate) return null
  return Math.round((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000))
}

function isOpenTaskStatus(value?: string | null) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['todo', 'pending', 'in_progress', '进行中', '未开始'].includes(normalized)
}

function getTaskStartDate(row: TaskLinkRow) {
  return normalizeNullableText(row.planned_start_date) ?? normalizeNullableText(row.start_date)
}

function extractMissingTaskColumn(error: unknown) {
  const message = [
    typeof error === 'object' && error !== null && 'message' in error ? String((error as { message?: unknown }).message ?? '') : '',
    typeof error === 'object' && error !== null && 'details' in error ? String((error as { details?: unknown }).details ?? '') : '',
  ]
    .filter(Boolean)
    .join('\n')

  if (!message) return null

  const patterns = [
    /Could not find the '([^']+)' column of 'tasks'/i,
    /column "([^"]+)" of relation "tasks" does not exist/i,
    /column ([a-z0-9_."]+) does not exist/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (!match?.[1]) continue
    return match[1].replace(/^tasks\./i, '').replace(/^"|"$/g, '')
  }

  return null
}

async function listTaskLinkRows(projectId: string) {
  const pendingColumns = [...TASK_LINK_SELECT_COLUMNS]

  while (pendingColumns.length > 0) {
    const { data, error } = await supabase
      .from('tasks')
      .select(pendingColumns.join(', '))
      .eq('project_id', projectId)

    if (!error) {
      const rows = Array.isArray(data) ? data : []
      return rows as unknown as TaskLinkRow[]
    }

    const missingColumn = extractMissingTaskColumn(error)
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : ''

    if ((errorCode === '42703' || missingColumn) && missingColumn && pendingColumns.includes(missingColumn as (typeof TASK_LINK_SELECT_COLUMNS)[number])) {
      const nextColumns = pendingColumns.filter((column) => column !== missingColumn)
      pendingColumns.splice(0, pendingColumns.length, ...nextColumns)
      continue
    }

    throw new Error(
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message ?? '任务关联查询失败')
        : '任务关联查询失败',
    )
  }

  return []
}

function isOnTime(material: Pick<ProjectMaterialRecord, 'expected_arrival_date' | 'actual_arrival_date'>) {
  if (!material.actual_arrival_date) return false
  return material.actual_arrival_date <= material.expected_arrival_date
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

function normalizeMaterialRow(
  row: ProjectMaterialRow,
  participantUnitNameMap: Map<string, string>,
  linkedTaskMap: Map<string, MaterialTaskLink>,
): ProjectMaterialRecord {
  const participantUnitId = normalizeNullableText(row.participant_unit_id)
  const linkedTask = participantUnitId ? linkedTaskMap.get(participantUnitId) ?? null : null
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

export async function listProjectMaterials(projectId: string): Promise<ProjectMaterialRecord[]> {
  const { data, error } = await supabase
    .from('project_materials')
    .select('*')
    .eq('project_id', projectId)
    .order('expected_arrival_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  const materialRows = (data ?? []) as ProjectMaterialRow[]
  const participantUnitIds = [...new Set(materialRows
    .map((row) => normalizeNullableText(row.participant_unit_id))
    .filter((value): value is string => Boolean(value)))]

  const participantUnitNameMap = new Map<string, string>()

  if (participantUnitIds.length > 0) {
    const { data: units, error: unitsError } = await supabase
      .from('participant_units')
      .select('id, unit_name')
      .in('id', participantUnitIds)

    if (unitsError) {
      throw new Error(unitsError.message)
    }

    for (const row of (units ?? []) as ParticipantUnitRow[]) {
      participantUnitNameMap.set(String(row.id), normalizeRequiredText(row.unit_name, '未命名单位'))
    }
  }

  const linkedTaskMap = buildLinkedTaskMap(await listTaskLinkRows(projectId))

  return materialRows.map((row) => normalizeMaterialRow(row, participantUnitNameMap, linkedTaskMap))
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
    monthlyTrend,
  }
}
