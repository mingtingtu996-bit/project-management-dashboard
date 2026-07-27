import { supabase } from './dbService.js'
import { createLineageBatchInTransaction, type LineageLinkInput } from './dataLineageService.js'
import { buildPlanSnapshotSeedVersions } from './planSnapshotSeedVersions.js'
import {
  ENGINEERING_OBJECT_SCOPE_ID_KEYS,
  PRIMARY_ENGINEERING_OBJECT_SCOPE_ID_KEY,
  type MonthlyPlanItem,
  type Task,
  type TaskBaselineItem,
} from '../types/db.js'

type JsonRecord = Record<string, unknown>

type SnapshotFields = {
  scope_snapshot?: JsonRecord
  wbs_snapshot?: JsonRecord
  task_fact_snapshot?: JsonRecord
  task_code_snapshot?: string | null
  status_snapshot?: JsonRecord
  seed_versions?: Array<Record<string, unknown>>
  snapshot_source?: string
  snapshot_captured_at?: string | null
  duration_calibration_source?: string | null
  duration_provenance?: string | null
}

type TaskSnapshotInput = Partial<Task> & {
  id?: string | null
  project_id?: string | null
  [key: string]: unknown
}

type EngineeringObjectSnapshotRow = {
  id: string
  object_code?: string | null
  object_name?: string | null
  object_type?: string | null
  path?: string | null
  parent_id?: string | null
  status?: string | null
}

const TASK_SNAPSHOT_SELECT = [
  'id',
  'project_id',
  'parent_id',
  'title',
  'description',
  'status',
  'progress',
  'planned_start_date',
  'planned_end_date',
  'start_date',
  'end_date',
  'sort_order',
  'wbs_code',
  'wbs_level',
  'is_milestone',
  'participant_unit_id',
  'assignee_user_id',
  'assignee_name',
  'engineering_object_id',
  'phase_object_id',
  'section_object_id',
  'building_object_id',
  'basement_object_id',
  'floor_object_id',
  'physical_zone_object_id',
  'functional_area_object_id',
  'engineering_category_id',
  'wbs_node_type',
  'wbs_path',
  'is_wbs_summary',
  'is_executable',
  'standard_work_code',
  'standard_work_name',
  'duration_calibration_source',
  'duration_provenance',
  'task_code',
  'task_code_version',
  'task_code_rule_id',
].join(',')

const SCOPE_OBJECT_FIELDS = [
  ['phase', ENGINEERING_OBJECT_SCOPE_ID_KEYS.phase],
  ['section', ENGINEERING_OBJECT_SCOPE_ID_KEYS.section],
  ['building', ENGINEERING_OBJECT_SCOPE_ID_KEYS.building],
  ['basement', ENGINEERING_OBJECT_SCOPE_ID_KEYS.basement],
  ['floor', ENGINEERING_OBJECT_SCOPE_ID_KEYS.floor],
  ['physical_zone', ENGINEERING_OBJECT_SCOPE_ID_KEYS.physical_zone],
  ['functional_area', ENGINEERING_OBJECT_SCOPE_ID_KEYS.functional_area],
  ['main', PRIMARY_ENGINEERING_OBJECT_SCOPE_ID_KEY],
] as const

function normalizeId(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function compactObject<T extends JsonRecord>(input: T): T {
  const compacted: JsonRecord = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue
    compacted[key] = value
  }
  return compacted as T
}

function collectTaskScopeObjectIds(tasks: TaskSnapshotInput[]): string[] {
  const ids = new Set<string>()
  for (const task of tasks) {
    for (const [, field] of SCOPE_OBJECT_FIELDS) {
      const value = normalizeId(task[field])
      if (value) ids.add(value)
    }
  }
  return [...ids]
}

async function loadEngineeringObjectSnapshots(projectId: string, tasks: TaskSnapshotInput[]) {
  const objectIds = collectTaskScopeObjectIds(tasks)
  if (objectIds.length === 0) return new Map<string, EngineeringObjectSnapshotRow>()

  const { data, error } = await supabase
    .from('engineering_objects')
    .select('id,object_code,object_name,object_type,path,parent_id,status')
    .eq('project_id', projectId)
    .in('id', objectIds)

  if (error) throw error
  return new Map(((data ?? []) as EngineeringObjectSnapshotRow[]).map((row) => [row.id, row]))
}

async function loadTaskSnapshotRows(projectId: string, taskIds: string[]) {
  if (taskIds.length === 0) return []
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SNAPSHOT_SELECT)
    .eq('project_id', projectId)
    .in('id', taskIds)

  if (error) throw error
  return ((data ?? []) as unknown) as TaskSnapshotInput[]
}

function buildScopeSnapshot(task: TaskSnapshotInput, objectMap: Map<string, EngineeringObjectSnapshotRow>): JsonRecord {
  const dimensions: JsonRecord = {}

  for (const [role, field] of SCOPE_OBJECT_FIELDS) {
    const id = normalizeId(task[field])
    if (!id) continue
    const object = objectMap.get(id)
    dimensions[role] = compactObject({
      id,
      object_code: object?.object_code ?? null,
      object_name: object?.object_name ?? null,
      object_type: object?.object_type ?? null,
      path: object?.path ?? null,
      parent_id: object?.parent_id ?? null,
    })
  }

  return compactObject({
    source: 'current_execution_fact',
    source_task_id: normalizeId(task.id),
    dimensions,
  })
}

function buildTaskSnapshotFields(
  task: TaskSnapshotInput,
  objectMap: Map<string, EngineeringObjectSnapshotRow>,
  capturedAt: string,
): SnapshotFields {
  const seedVersions = buildPlanSnapshotSeedVersions()
  return {
    scope_snapshot: buildScopeSnapshot(task, objectMap),
    wbs_snapshot: compactObject({
      source: 'current_execution_fact',
      source_task_id: normalizeId(task.id),
      parent_id: normalizeId(task.parent_id),
      wbs_code: task.wbs_code ?? null,
      wbs_level: task.wbs_level ?? null,
      engineering_category_id: task.engineering_category_id ?? null,
      wbs_node_type: task.wbs_node_type ?? null,
      wbs_path: task.wbs_path ?? null,
      is_wbs_summary: task.is_wbs_summary ?? null,
      is_executable: task.is_executable ?? null,
      standard_work_code: task.standard_work_code ?? null,
      standard_work_name: task.standard_work_name ?? null,
      duration_calibration_source: task.duration_calibration_source ?? null,
      duration_provenance: task.duration_provenance ?? null,
    }),
    task_fact_snapshot: compactObject({
      source: 'current_execution_fact',
      source_task_id: normalizeId(task.id),
      title: task.title ?? null,
      description: task.description ?? null,
      planned_start_date: task.planned_start_date ?? null,
      planned_end_date: task.planned_end_date ?? null,
      start_date: task.start_date ?? null,
      end_date: task.end_date ?? null,
      progress: task.progress ?? null,
      sort_order: task.sort_order ?? null,
      is_milestone: task.is_milestone ?? null,
      participant_unit_id: task.participant_unit_id ?? null,
      assignee_user_id: task.assignee_user_id ?? null,
      assignee_name: task.assignee_name ?? null,
      duration_calibration_source: task.duration_calibration_source ?? null,
      duration_provenance: task.duration_provenance ?? null,
    }),
    task_code_snapshot: normalizeId(task.task_code),
    status_snapshot: compactObject({
      source: 'current_execution_fact',
      source_task_id: normalizeId(task.id),
      domainKey: 'task.lifecycle',
      statusKey: task.status ?? null,
      rawStatus: task.status ?? null,
    }),
    seed_versions: seedVersions,
    snapshot_source: 'current_execution_fact',
    snapshot_captured_at: capturedAt,
  }
}

export function inheritSnapshotFieldsFromBaselineItem(item: Partial<TaskBaselineItem>): SnapshotFields {
  return {
    scope_snapshot: (item.scope_snapshot as JsonRecord | undefined) ?? {},
    wbs_snapshot: (item.wbs_snapshot as JsonRecord | undefined) ?? {},
    task_fact_snapshot: (item.task_fact_snapshot as JsonRecord | undefined) ?? {},
    task_code_snapshot: item.task_code_snapshot ?? null,
    status_snapshot: (item.status_snapshot as JsonRecord | undefined) ?? {},
    seed_versions: (item.seed_versions as Array<Record<string, unknown>> | undefined) ?? buildPlanSnapshotSeedVersions(),
    snapshot_source: 'baseline_commitment_snapshot',
    snapshot_captured_at: new Date().toISOString(),
  }
}

export function inheritSnapshotFieldsFromMonthlyPlanItem(item: Partial<MonthlyPlanItem>): SnapshotFields {
  return {
    scope_snapshot: (item.scope_snapshot as JsonRecord | undefined) ?? {},
    wbs_snapshot: (item.wbs_snapshot as JsonRecord | undefined) ?? {},
    task_fact_snapshot: (item.task_fact_snapshot as JsonRecord | undefined) ?? {},
    task_code_snapshot: item.task_code_snapshot ?? null,
    status_snapshot: (item.status_snapshot as JsonRecord | undefined) ?? {},
    seed_versions: (item.seed_versions as Array<Record<string, unknown>> | undefined) ?? buildPlanSnapshotSeedVersions(),
    snapshot_source: 'monthly_commitment_snapshot',
    snapshot_captured_at: new Date().toISOString(),
  }
}

export async function attachTaskFactSnapshots<T extends { source_task_id?: string | null } & SnapshotFields>(
  projectId: string,
  items: T[],
  sourceTasks?: TaskSnapshotInput[],
): Promise<T[]> {
  const sourceTaskIds = [...new Set(items.map((item) => normalizeId(item.source_task_id)).filter((id): id is string => Boolean(id)))]
  if (sourceTaskIds.length === 0) return items

  const taskRows = sourceTasks?.length
    ? sourceTasks.filter((task) => {
        const taskId = normalizeId(task.id)
        return taskId ? sourceTaskIds.includes(taskId) : false
      })
    : await loadTaskSnapshotRows(projectId, sourceTaskIds)

  if (taskRows.length === 0) return items

  const taskById = new Map(taskRows.map((task) => [String(task.id), task]))
  const objectMap = await loadEngineeringObjectSnapshots(projectId, taskRows)
  const capturedAt = new Date().toISOString()

  return items.map((item) => {
    const sourceTaskId = normalizeId(item.source_task_id)
    const task = sourceTaskId ? taskById.get(sourceTaskId) : null
    if (!task) return item
    return {
      ...item,
      duration_calibration_source: task.duration_calibration_source ?? item.duration_calibration_source ?? null,
      duration_provenance: task.duration_provenance ?? item.duration_provenance ?? null,
      ...buildTaskSnapshotFields(task, objectMap, capturedAt),
    }
  })
}

export async function recordBaselineSnapshotLineage(
  projectId: string,
  items: Array<Pick<TaskBaselineItem, 'id' | 'source_task_id'> & { snapshot_source?: string | null, seed_versions?: Array<Record<string, unknown>> | null }>,
  actorUserId: string | null | undefined,
  client: any,
) {
  const links: LineageLinkInput[] = items
    .filter((item) => normalizeId(item.source_task_id))
    .map((item) => ({
      projectId,
      sourceEntityType: 'task',
      sourceEntityId: String(item.source_task_id),
      relationType: 'generates',
      targetEntityType: 'task_baseline_item',
      targetEntityId: item.id,
      mappingStatus: 'active',
      metadata: {
        planTruthModel: 'task_current_fact_to_baseline_commitment_snapshot',
        snapshotSource: item.snapshot_source ?? 'current_execution_fact',
        seedVersions: item.seed_versions ?? buildPlanSnapshotSeedVersions(),
      },
    }))

  if (links.length === 0) return { batchId: null, linkCount: 0 }
  return createLineageBatchInTransaction(client, projectId, 'baseline_generate_snapshot', links, actorUserId ?? undefined)
}

export async function recordMonthlySnapshotLineage(
  projectId: string,
  items: Array<Pick<MonthlyPlanItem, 'id' | 'baseline_item_id' | 'carryover_from_item_id' | 'source_task_id'> & { snapshot_source?: string | null, seed_versions?: Array<Record<string, unknown>> | null }>,
  actorUserId: string | null | undefined,
  client: any,
) {
  const links: LineageLinkInput[] = []
  for (const item of items) {
    if (normalizeId(item.carryover_from_item_id)) {
      links.push({
        projectId,
        sourceEntityType: 'monthly_plan_item',
        sourceEntityId: String(item.carryover_from_item_id),
        relationType: 'carries_over_to',
        targetEntityType: 'monthly_plan_item',
        targetEntityId: item.id,
        mappingStatus: 'active',
        metadata: {
          planTruthModel: 'monthly_commitment_snapshot_to_monthly_commitment_snapshot',
          snapshotSource: item.snapshot_source ?? 'monthly_commitment_snapshot',
          seedVersions: item.seed_versions ?? buildPlanSnapshotSeedVersions(),
        },
      })
      continue
    }

    if (normalizeId(item.baseline_item_id)) {
      links.push({
        projectId,
        sourceEntityType: 'task_baseline_item',
        sourceEntityId: String(item.baseline_item_id),
        relationType: 'derives',
        targetEntityType: 'monthly_plan_item',
        targetEntityId: item.id,
        mappingStatus: 'active',
        metadata: {
          planTruthModel: 'baseline_commitment_snapshot_to_monthly_commitment_snapshot',
          snapshotSource: item.snapshot_source ?? 'baseline_commitment_snapshot',
          seedVersions: item.seed_versions ?? buildPlanSnapshotSeedVersions(),
        },
      })
      continue
    }

    if (normalizeId(item.source_task_id)) {
      links.push({
        projectId,
        sourceEntityType: 'task',
        sourceEntityId: String(item.source_task_id),
        relationType: 'carries_over_to',
        targetEntityType: 'monthly_plan_item',
        targetEntityId: item.id,
        mappingStatus: 'active',
        metadata: {
          planTruthModel: 'task_current_fact_to_monthly_commitment_snapshot',
          snapshotSource: item.snapshot_source ?? 'current_execution_fact',
          seedVersions: item.seed_versions ?? buildPlanSnapshotSeedVersions(),
        },
      })
    }
  }

  if (links.length === 0) return { batchId: null, linkCount: 0 }
  return createLineageBatchInTransaction(client, projectId, 'monthly_generate_snapshot', links, actorUserId ?? undefined)
}
