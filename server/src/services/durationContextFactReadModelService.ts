import { supabase } from './dbService.js'

export type DurationContextFactTableName =
  | 'tasks'
  | 'task_conditions'
  | 'task_obstacles'
  | 'project_materials'
  | 'task_progress_snapshots'
  | 'data_quality_findings'
  | 'task_dependencies'

export function durationContextFactTable(tableName: DurationContextFactTableName) {
  return (supabase as any).from(tableName)
}

export type DurationContextReadinessRows = {
  conditions: Record<string, unknown>[]
  obstacles: Record<string, unknown>[]
  materials: Record<string, unknown>[]
}

export type DurationContextReadinessSignalRows = Pick<DurationContextReadinessRows, 'conditions' | 'obstacles'>

export type DurationContextSingleRowResult = {
  data: Record<string, unknown> | null
  error: unknown | null
}

const TASK_CONTEXT_SELECT = 'id, project_id, title, planned_start_date, planned_end_date, start_date, end_date, actual_start_date, actual_end_date, progress, planned_quantity, completed_quantity, quantity_unit, template_node_id, engineering_category_id, wbs_node_type, standard_work_code, standard_work_name, building_object_id, basement_object_id, floor_object_id, physical_zone_object_id, functional_area_object_id, participant_unit_id, acceptance_required, material_required, standard_task_metadata'
const RESPONSIBLE_UNIT_HISTORY_TASK_SELECT = 'id, planned_start_date, planned_end_date, start_date, end_date, actual_start_date, actual_end_date'
const RESOURCE_CONFLICT_TASK_SELECT = 'id, building_object_id, floor_object_id, physical_zone_object_id, functional_area_object_id, participant_unit_id, planned_start_date, planned_end_date, start_date, end_date, actual_start_date, actual_end_date, progress, status, title, standard_work_name, standard_work_code, standard_task_metadata'
const TASK_CONDITION_READINESS_SELECT = 'id, task_id, status, is_satisfied, condition_type, blocking_level, required_for_start, source_type, source_ref_id, source_entity_type, source_entity_id, target_date, created_at, name, description, drawing_package_id, drawing_package_code, participant_unit_id'
const TASK_OBSTACLE_READINESS_SELECT = 'id, task_id, status, obstacle_type, blocking_level, impact_level, progress_impact_level, severity, estimated_resolve_date, created_at, description, source_type, source_ref_id'
const PROJECT_MATERIAL_READINESS_SELECT = 'id, expected_arrival_date, actual_arrival_date, record_status, lifecycle_status'

function emptyReadinessRows(): DurationContextReadinessRows {
  return { conditions: [], obstacles: [], materials: [] }
}

function normalizeId(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function uniqueIds(values: unknown[]) {
  return [...new Set(values.map(normalizeId).filter(Boolean) as string[])]
}

function dataRows(result: unknown): Record<string, unknown>[] {
  const data = (result as { data?: unknown } | null | undefined)?.data
  return Array.isArray(data) ? data as Record<string, unknown>[] : []
}

function normalizeReferenceType(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function readMaterialConditionReference(row: Record<string, unknown>) {
  const referenceTypes = [
    row.condition_type,
    row.source_type,
    row.source_entity_type,
  ].map(normalizeReferenceType)
  const isMaterial = referenceTypes.some((value) => (
    value === 'material'
    || value === 'project_material'
    || value === 'project_materials'
    || value === '\u6750\u6599'
  ))
  if (!isMaterial) return null
  return normalizeId(row.source_ref_id) ?? normalizeId(row.source_entity_id)
}

function projectMaterialsToTaskReferences(
  conditions: Record<string, unknown>[],
  materials: Record<string, unknown>[],
) {
  const materialById = new Map(materials
    .map((row) => [normalizeId(row.id), row] as const)
    .filter((entry): entry is readonly [string, Record<string, unknown>] => Boolean(entry[0])))
  const seen = new Set<string>()
  const projected: Record<string, unknown>[] = []
  for (const condition of conditions) {
    const taskId = normalizeId(condition.task_id)
    const materialId = readMaterialConditionReference(condition)
    if (!taskId || !materialId) continue
    const material = materialById.get(materialId)
    if (!material) continue
    const key = `${taskId}|${materialId}`
    if (seen.has(key)) continue
    seen.add(key)
    projected.push({ ...material, linked_task_id: taskId })
  }
  return projected
}

async function readOrEmpty(query: PromiseLike<unknown>): Promise<Record<string, unknown>[]> {
  return Promise.resolve(query).then(dataRows, () => [])
}

export async function readDurationContextTaskContextRow(params: {
  taskId: string | null
}): Promise<DurationContextSingleRowResult> {
  const taskId = normalizeId(params.taskId)
  if (!taskId) return { data: null, error: null }

  const { data, error } = await durationContextFactTable('tasks')
    .select(TASK_CONTEXT_SELECT)
    .eq('id', taskId)
    .maybeSingle()

  return {
    data: data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null,
    error: error ?? null,
  }
}

export async function readDurationContextTaskReadinessRows(params: {
  taskId: string
  explicitMaterialIds?: string[]
}): Promise<DurationContextReadinessRows> {
  const taskId = normalizeId(params.taskId)
  if (!taskId) return emptyReadinessRows()

  const [conditions, obstacles] = await Promise.all([
    readOrEmpty(
      durationContextFactTable('task_conditions')
        .select(TASK_CONDITION_READINESS_SELECT)
        .eq('task_id', taskId),
    ),
    readOrEmpty(
      durationContextFactTable('task_obstacles')
        .select(TASK_OBSTACLE_READINESS_SELECT)
        .eq('task_id', taskId),
    ),
  ])
  const materialIds = uniqueIds([
    ...(params.explicitMaterialIds ?? []),
    ...conditions.map(readMaterialConditionReference),
  ])
  const materials = materialIds.length > 0
    ? await readOrEmpty(
        durationContextFactTable('project_materials')
          .select(PROJECT_MATERIAL_READINESS_SELECT)
          .in('id', materialIds),
      )
    : []

  return { conditions, obstacles, materials }
}

export async function readDurationContextTaskReadinessSignalRows(params: {
  taskId: string
}): Promise<DurationContextReadinessSignalRows> {
  const taskId = normalizeId(params.taskId)
  if (!taskId) return { conditions: [], obstacles: [] }

  const [conditions, obstacles] = await Promise.all([
    readOrEmpty(
      durationContextFactTable('task_conditions')
        .select(TASK_CONDITION_READINESS_SELECT)
        .eq('task_id', taskId),
    ),
    readOrEmpty(
      durationContextFactTable('task_obstacles')
        .select(TASK_OBSTACLE_READINESS_SELECT)
        .eq('task_id', taskId),
    ),
  ])

  return { conditions, obstacles }
}

export async function readDurationContextTaskMaterialRows(params: {
  taskId: string
  explicitMaterialIds?: string[]
}): Promise<Record<string, unknown>[]> {
  const taskId = normalizeId(params.taskId)
  if (!taskId) return []

  const materialIds = uniqueIds(params.explicitMaterialIds ?? [])
  if (materialIds.length === 0) return []
  return readOrEmpty(
    durationContextFactTable('project_materials')
      .select(PROJECT_MATERIAL_READINESS_SELECT)
      .in('id', materialIds),
  )
}

export async function readDurationContextResourceReadinessRows(params: {
  projectId: string
  taskIds: string[]
}): Promise<DurationContextReadinessRows> {
  const projectId = normalizeId(params.projectId)
  const taskIds = uniqueIds(params.taskIds)
  if (!projectId || taskIds.length === 0) return emptyReadinessRows()

  const [conditions, obstacles] = await Promise.all([
    readOrEmpty(
      durationContextFactTable('task_conditions')
        .select(TASK_CONDITION_READINESS_SELECT)
        .eq('project_id', projectId)
        .in('task_id', taskIds),
    ),
    readOrEmpty(
      durationContextFactTable('task_obstacles')
        .select(TASK_OBSTACLE_READINESS_SELECT)
        .eq('project_id', projectId)
        .in('task_id', taskIds),
    ),
  ])
  const materialIds = uniqueIds(conditions.map(readMaterialConditionReference))
  const materialRows = materialIds.length > 0
    ? await readOrEmpty(
        durationContextFactTable('project_materials')
          .select(PROJECT_MATERIAL_READINESS_SELECT)
          .eq('project_id', projectId)
          .in('id', materialIds),
      )
    : []
  const materials = projectMaterialsToTaskReferences(conditions, materialRows)

  return { conditions, obstacles, materials }
}

export async function readDurationContextTaskProgressSnapshotRows(params: {
  taskId: string
  select?: string
  limit?: number
}): Promise<Record<string, unknown>[]> {
  const taskId = normalizeId(params.taskId)
  if (!taskId) return []

  let query = durationContextFactTable('task_progress_snapshots')
    .select(params.select ?? 'progress, snapshot_date, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
  if (typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit > 0) {
    query = query.limit(params.limit)
  }
  return readOrEmpty(query)
}

export async function readDurationContextProgressTrendSnapshotRows(params: {
  taskIds: string[]
}): Promise<Record<string, unknown>[]> {
  const taskIds = uniqueIds(params.taskIds)
  if (taskIds.length === 0) return []

  return readOrEmpty(
    durationContextFactTable('task_progress_snapshots')
      .select('task_id, progress, snapshot_date, created_at')
      .in('task_id', taskIds),
  )
}

export async function readDurationContextProgressQualityFindings(params: {
  taskId: string
  ruleCodes: string[]
}): Promise<Record<string, unknown>[]> {
  const taskId = normalizeId(params.taskId)
  const ruleCodes = [...new Set((params.ruleCodes ?? []).map((code) => String(code ?? '').trim()).filter(Boolean))]
  if (!taskId || ruleCodes.length === 0) return []

  return readOrEmpty(
    durationContextFactTable('data_quality_findings')
      .select('id, rule_code, status, severity, resolved_type, resolved_at, details_json')
      .eq('task_id', taskId)
      .in('rule_code', ruleCodes),
  )
}

export async function readDurationContextActiveTaskDependencies(params: {
  taskId: string
}): Promise<Record<string, unknown>[]> {
  const taskId = normalizeId(params.taskId)
  if (!taskId) return []

  return readOrEmpty(
    durationContextFactTable('task_dependencies')
      .select('id, dependency_task_id, dependency_type, lag_days, status')
      .eq('task_id', taskId)
      .eq('status', 'active'),
  )
}

export async function readDurationContextResponsibleUnitHistoryRows(params: {
  projectId: string | null
  responsibleUnitId: string | null
}): Promise<Record<string, unknown>[]> {
  const projectId = normalizeId(params.projectId)
  const responsibleUnitId = normalizeId(params.responsibleUnitId)
  if (!projectId || !responsibleUnitId) return []

  return readOrEmpty(
    durationContextFactTable('tasks')
      .select(RESPONSIBLE_UNIT_HISTORY_TASK_SELECT)
      .eq('project_id', projectId)
      .eq('participant_unit_id', responsibleUnitId)
      .not('actual_end_date', 'is', null)
      .limit(80),
  )
}

export async function readDurationContextResourceConflictTaskRows(params: {
  projectId: string | null
  excludedTaskId?: string | null
}): Promise<Record<string, unknown>[]> {
  const projectId = normalizeId(params.projectId)
  if (!projectId) return []

  return readOrEmpty(
    durationContextFactTable('tasks')
      .select(RESOURCE_CONFLICT_TASK_SELECT)
      .eq('project_id', projectId)
      .not('id', 'eq', normalizeId(params.excludedTaskId) ?? '__none__')
      .not('status', 'in', '(completed,cancelled,closed,deleted)'),
  )
}
