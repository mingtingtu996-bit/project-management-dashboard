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

  const materialIds = uniqueIds(params.explicitMaterialIds ?? [])
  const [conditions, obstacles, materials] = await Promise.all([
    readOrEmpty(
      durationContextFactTable('task_conditions')
        .select('id, status, is_satisfied, condition_type, blocking_level, required_for_start, source_type, source_ref_id, source_entity_type, source_entity_id, target_date, created_at, title, description')
        .eq('task_id', taskId),
    ),
    readOrEmpty(
      durationContextFactTable('task_obstacles')
        .select('id, status, obstacle_type, blocking_level, impact_level, progress_impact_level, severity, estimated_resolve_date, created_at, title, description')
        .eq('task_id', taskId),
    ),
    readOrEmpty(
      materialIds.length > 0
        ? durationContextFactTable('project_materials')
          .select('id, linked_task_id, expected_arrival_date, actual_arrival_date, record_status, lifecycle_status')
          .in('id', materialIds)
        : durationContextFactTable('project_materials')
          .select('id, linked_task_id, expected_arrival_date, actual_arrival_date, record_status, lifecycle_status')
          .eq('linked_task_id', taskId),
    ),
  ])

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
        .select('id, status, is_satisfied, condition_type, blocking_level, required_for_start, source_type, source_ref_id, source_entity_type, source_entity_id, target_date, created_at, title, description')
        .eq('task_id', taskId),
    ),
    readOrEmpty(
      durationContextFactTable('task_obstacles')
        .select('id, status, obstacle_type, blocking_level, impact_level, progress_impact_level, severity, estimated_resolve_date, created_at, title, description')
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
  return readOrEmpty(
    materialIds.length > 0
      ? durationContextFactTable('project_materials')
        .select('id, linked_task_id, expected_arrival_date, actual_arrival_date, record_status, lifecycle_status')
        .in('id', materialIds)
      : durationContextFactTable('project_materials')
        .select('id, linked_task_id, expected_arrival_date, actual_arrival_date, record_status, lifecycle_status')
        .eq('linked_task_id', taskId),
  )
}

export async function readDurationContextResourceReadinessRows(params: {
  projectId: string
  taskIds: string[]
}): Promise<DurationContextReadinessRows> {
  const projectId = normalizeId(params.projectId)
  const taskIds = uniqueIds(params.taskIds)
  if (!projectId || taskIds.length === 0) return emptyReadinessRows()

  const [conditions, obstacles, materials] = await Promise.all([
    readOrEmpty(
      durationContextFactTable('task_conditions')
        .select('id, task_id, condition_type, status, is_satisfied, target_date, created_at')
        .eq('project_id', projectId)
        .in('task_id', taskIds),
    ),
    readOrEmpty(
      durationContextFactTable('task_obstacles')
        .select('id, task_id, obstacle_type, status, severity, estimated_resolve_date, created_at')
        .eq('project_id', projectId)
        .in('task_id', taskIds),
    ),
    readOrEmpty(
      durationContextFactTable('project_materials')
        .select('id, linked_task_id, expected_arrival_date, actual_arrival_date, record_status, lifecycle_status')
        .eq('project_id', projectId)
        .in('linked_task_id', taskIds),
    ),
  ])

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
