import { randomUUID } from 'crypto'
import { orderedInclusiveDurationDays } from '../utils/durationDays.js'

export type IndependentTaskScopeAssignment = {
  engineering_object_id?: string | null
  phase_object_id?: string | null
  section_object_id?: string | null
  building_object_id?: string | null
  basement_object_id?: string | null
  floor_object_id?: string | null
  physical_zone_object_id?: string | null
  functional_area_object_id?: string | null
}

export type IndependentDefaultMasterPlanCandidateItem = {
  id?: string | null
  project_id?: string | null
  title?: string | null
  notes?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  sort_order?: number | null
  is_milestone?: boolean | null
  is_critical?: boolean | null
  wbs_node_type?: string | null
  is_executable?: boolean | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  source_task_id?: string | null
  mapping_status?: string | null
  generation_metadata?: Record<string, unknown> | null
}

export type ApprovedDurationMapping = {
  sampleId: string
  candidateItemId: string
  actualDurationDays: number
  decision: 'direct'
}

export type IndependentDefaultMasterPlanTaskNetworkInput = {
  projectId: string
  baseline: {
    id?: string | null
    project_id?: string | null
    status?: string | null
  }
  candidateItems: IndependentDefaultMasterPlanCandidateItem[]
  scopeAssignment: IndependentTaskScopeAssignment
  scopeAssignmentsByCandidateItemId?: Record<string, IndependentTaskScopeAssignment>
  materializedByUserId: string
  approvedDurationMappings?: ApprovedDurationMapping[]
  generatedAt?: string
  idFactory?: (index: number, item: IndependentDefaultMasterPlanCandidateItem) => string
}

export type IndependentDefaultMasterPlanTaskPlan = {
  id: string
  sourceBaselineId: string
  sourceBaselineItemId: string
  sourceClientRowId: string
  payload: Record<string, unknown>
}

export type IndependentDefaultMasterPlanDependencyPlan = {
  taskId: string
  dependencyTaskId: string
  dependencyType: string
  lagDays: number
  sourceType: 'template_generated'
  sourceBaselineId: string
  sourceSuccessorBaselineItemId: string
  sourcePredecessorBaselineItemId: string
}

export type IndependentDefaultMasterPlanTaskNetworkPlan = {
  status: 'ready' | 'blocked'
  blockers: string[]
  tasks: IndependentDefaultMasterPlanTaskPlan[]
  dependencies: IndependentDefaultMasterPlanDependencyPlan[]
  candidateToTaskMappings: Array<{ candidateItemId: string; taskId: string }>
  durationCalibration: {
    directMappingCount: number
    mappedCandidateItemCount: number
    uncoveredCandidateItemCount: number
    scheduleRealignmentRequired: boolean
    mappings: ApprovedDurationMapping[]
  }
  mutationBoundary: {
    writesTasks: true
    writesExistingTasks: false
    writesTaskDependencies: true
    writesRuntimePublication: false
    writesDurationSamples: false
    appliesDurationScheduleRealignment: false
  }
}

type CandidateRow = IndependentDefaultMasterPlanCandidateItem & {
  id: string
  project_id: string
  title: string
  planned_start_date: string
  planned_end_date: string
  clientRowId: string
  metadata: Record<string, unknown>
}

type CandidateDependencyReference = {
  predecessorClientRowId: string
  dependencyType: string
  lagDays: number
}

const SCOPE_KEYS: Array<keyof IndependentTaskScopeAssignment> = [
  'engineering_object_id',
  'phase_object_id',
  'section_object_id',
  'building_object_id',
  'basement_object_id',
  'floor_object_id',
  'physical_zone_object_id',
  'functional_area_object_id',
]

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(text).filter(Boolean))]
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function durationDays(startDate: string, endDate: string): number | null {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return null
  return orderedInclusiveDurationDays(startDate, endDate)
}

function hasScopeAssignment(scopeAssignment: IndependentTaskScopeAssignment): boolean {
  return SCOPE_KEYS.some((key) => Boolean(text(scopeAssignment[key])))
}

function resolveCandidateScopeAssignment(
  defaultScopeAssignment: IndependentTaskScopeAssignment,
  overrides: Record<string, IndependentTaskScopeAssignment> | undefined,
  candidateItemId: string,
): IndependentTaskScopeAssignment {
  return {
    ...defaultScopeAssignment,
    ...(overrides?.[candidateItemId] ?? {}),
  }
}

function normalizeCandidateRows(items: IndependentDefaultMasterPlanCandidateItem[]): CandidateRow[] {
  return items.map((item) => {
    const metadata = readRecord(item.generation_metadata)
    return {
      ...item,
      id: text(item.id),
      project_id: text(item.project_id),
      title: text(item.title),
      planned_start_date: text(item.planned_start_date),
      planned_end_date: text(item.planned_end_date),
      clientRowId: text(metadata.clientRowId ?? metadata.client_row_id),
      metadata,
    }
  })
}

function readDependencyReferences(item: CandidateRow): CandidateDependencyReference[] {
  const rawDependencies = readArray(item.metadata.predecessorDependencies ?? item.metadata.predecessor_dependencies)
  const structured = rawDependencies
    .map((value) => readRecord(value))
    .map((dependency) => ({
      predecessorClientRowId: text(dependency.clientRowId ?? dependency.client_row_id),
      dependencyType: text(dependency.dependencyType ?? dependency.dependency_type) || 'FS',
      lagDays: Number(dependency.lagDays ?? dependency.lag_days ?? 0),
    }))
    .filter((dependency) => dependency.predecessorClientRowId)

  if (structured.length > 0) return structured
  return unique(readArray(item.metadata.predecessorClientRowIds ?? item.metadata.predecessor_client_row_ids).map(text))
    .map((predecessorClientRowId) => ({ predecessorClientRowId, dependencyType: 'FS', lagDays: 0 }))
}

function normalizeDurationMappings(
  mappings: ApprovedDurationMapping[],
  candidateItemIds: Set<string>,
): { mappings: ApprovedDurationMapping[]; blockers: string[] } {
  const blockers: string[] = []
  const targetIds = new Set<string>()
  const sampleIds = new Set<string>()
  const normalized: ApprovedDurationMapping[] = []

  for (const mapping of mappings) {
    const sampleId = text(mapping.sampleId)
    const candidateItemId = text(mapping.candidateItemId)
    const actualDurationDays = Number(mapping.actualDurationDays)
    if (!sampleId || !candidateItemId || !Number.isFinite(actualDurationDays) || actualDurationDays <= 0 || mapping.decision !== 'direct') {
      blockers.push('approved_duration_mapping_invalid')
      continue
    }
    if (!candidateItemIds.has(candidateItemId)) {
      blockers.push('approved_duration_mapping_candidate_item_not_found')
      continue
    }
    if (targetIds.has(candidateItemId)) {
      blockers.push('approved_duration_mapping_duplicate_candidate_item')
      continue
    }
    if (sampleIds.has(sampleId)) {
      blockers.push('approved_duration_mapping_duplicate_sample')
      continue
    }
    targetIds.add(candidateItemId)
    sampleIds.add(sampleId)
    normalized.push({ sampleId, candidateItemId, actualDurationDays, decision: 'direct' })
  }

  return { mappings: normalized, blockers: unique(blockers) }
}

function buildTaskMetadata(params: {
  baselineId: string
  candidate: CandidateRow
  generatedAt: string
  durationMapping: ApprovedDurationMapping | null
}) {
  const originalMetadata = params.candidate.metadata
  const plannedDuration = durationDays(params.candidate.planned_start_date, params.candidate.planned_end_date)
  const durationMapping = params.durationMapping
    ? {
        sampleId: params.durationMapping.sampleId,
        actualDurationDays: params.durationMapping.actualDurationDays,
        decision: params.durationMapping.decision,
        pendingScheduleRealignment: plannedDuration !== params.durationMapping.actualDurationDays,
      }
    : null

  return {
    source: 'candidate_default_master_plan_independent_materialization',
    sourceBaselineId: params.baselineId,
    sourceBaselineItemId: params.candidate.id,
    sourceClientRowId: params.candidate.clientRowId,
    sourceGenerationBatchId: text(originalMetadata.generationBatchId ?? originalMetadata.generation_batch_id) || null,
    materializedAt: params.generatedAt,
    independentMasterPlan: true,
    candidateOnly: false,
    writesExistingTasks: false,
    runtimePublicationStatus: 'not_published',
    ...(durationMapping ? { candidateDurationCalibration: durationMapping } : {}),
  }
}

export function buildIndependentDefaultMasterPlanTaskNetwork(
  input: IndependentDefaultMasterPlanTaskNetworkInput,
): IndependentDefaultMasterPlanTaskNetworkPlan {
  const projectId = text(input.projectId)
  const baselineId = text(input.baseline?.id)
  const baselineProjectId = text(input.baseline?.project_id)
  const baselineStatus = text(input.baseline?.status).toLowerCase()
  const materializedByUserId = text(input.materializedByUserId)
  const candidateRows = normalizeCandidateRows(input.candidateItems ?? [])
  const candidateItemIds = new Set(candidateRows.map((item) => item.id).filter(Boolean))
  const scopeAssignmentByCandidateItemId = new Map(candidateRows.map((candidate) => [
    candidate.id,
    resolveCandidateScopeAssignment(
      input.scopeAssignment ?? {},
      input.scopeAssignmentsByCandidateItemId,
      candidate.id,
    ),
  ]))
  const durationMappingResult = normalizeDurationMappings(input.approvedDurationMappings ?? [], candidateItemIds)
  const blockers = unique([
    projectId ? null : 'project_id_required',
    baselineId ? null : 'baseline_id_required',
    baselineProjectId === projectId ? null : 'baseline_project_id_mismatch',
    baselineStatus === 'draft' ? null : 'independent_task_materialization_requires_draft_baseline',
    materializedByUserId ? null : 'materialized_by_user_id_required',
    candidateRows.every((candidate) => hasScopeAssignment(scopeAssignmentByCandidateItemId.get(candidate.id) ?? {}))
      ? null
      : 'independent_task_scope_assignment_required',
    candidateRows.length > 0 ? null : 'candidate_baseline_items_required',
    candidateRows.every((item) => item.id && item.project_id === projectId) ? null : 'candidate_item_project_id_mismatch',
    candidateRows.every((item) => item.title && item.planned_start_date && item.planned_end_date) ? null : 'candidate_item_title_and_dates_required',
    candidateRows.every((item) => durationDays(item.planned_start_date, item.planned_end_date) !== null) ? null : 'candidate_item_planned_date_range_invalid',
    candidateRows.every((item) => !text(item.source_task_id)) ? null : 'candidate_item_already_mapped_to_existing_task',
    candidateRows.every((item) => item.metadata.candidateOnly === true) ? null : 'candidate_item_must_be_candidate_only',
    unique(candidateRows.map((item) => item.id)).length === candidateRows.length ? null : 'candidate_item_id_duplicate',
    unique(candidateRows.map((item) => item.clientRowId)).length === candidateRows.length && candidateRows.every((item) => item.clientRowId)
      ? null
      : 'candidate_item_client_row_id_required_and_unique',
    ...durationMappingResult.blockers,
  ])

  const mutationBoundary = {
    writesTasks: true as const,
    writesExistingTasks: false as const,
    writesTaskDependencies: true as const,
    writesRuntimePublication: false as const,
    writesDurationSamples: false as const,
    appliesDurationScheduleRealignment: false as const,
  }
  const durationCalibration = {
    directMappingCount: durationMappingResult.mappings.length,
    mappedCandidateItemCount: new Set(durationMappingResult.mappings.map((mapping) => mapping.candidateItemId)).size,
    uncoveredCandidateItemCount: Math.max(0, candidateRows.length - durationMappingResult.mappings.length),
    scheduleRealignmentRequired: candidateRows.some((candidate) => {
      const mapping = durationMappingResult.mappings.find((value) => value.candidateItemId === candidate.id)
      return Boolean(mapping && durationDays(candidate.planned_start_date, candidate.planned_end_date) !== mapping.actualDurationDays)
    }),
    mappings: durationMappingResult.mappings,
  }

  if (blockers.length > 0) {
    return {
      status: 'blocked',
      blockers,
      tasks: [],
      dependencies: [],
      candidateToTaskMappings: [],
      durationCalibration,
      mutationBoundary,
    }
  }

  const idFactory = input.idFactory ?? (() => randomUUID())
  const generatedAt = text(input.generatedAt) || new Date().toISOString()
  const mappingByClientRowId = new Map<string, { candidate: CandidateRow; taskId: string }>()
  const mappings: Array<{ candidateItemId: string; taskId: string }> = []
  const tasks: IndependentDefaultMasterPlanTaskPlan[] = candidateRows.map((candidate, index) => {
    const taskId = idFactory(index, candidate)
    mappingByClientRowId.set(candidate.clientRowId, { candidate, taskId })
    mappings.push({ candidateItemId: candidate.id, taskId })
    const durationMapping = durationMappingResult.mappings.find((value) => value.candidateItemId === candidate.id) ?? null
    return {
      id: taskId,
      sourceBaselineId: baselineId,
      sourceBaselineItemId: candidate.id,
      sourceClientRowId: candidate.clientRowId,
      payload: {
        id: taskId,
        project_id: projectId,
        title: candidate.title,
        description: text(candidate.notes) || null,
        status: 'todo',
        progress: 0,
        progress_method: 'percent',
        start_date: candidate.planned_start_date,
        end_date: candidate.planned_end_date,
        planned_start_date: candidate.planned_start_date,
        planned_end_date: candidate.planned_end_date,
        sort_order: Number.isFinite(Number(candidate.sort_order)) ? Number(candidate.sort_order) : index + 1,
        is_milestone: candidate.is_milestone === true,
        wbs_node_type: text(candidate.wbs_node_type) || 'item_work',
        is_executable: candidate.is_executable !== false,
        standard_work_code: text(candidate.standard_work_code) || null,
        standard_work_name: text(candidate.standard_work_name) || null,
        ...(scopeAssignmentByCandidateItemId.get(candidate.id) ?? {}),
        standard_task_metadata: buildTaskMetadata({
          baselineId,
          candidate,
          generatedAt,
          durationMapping,
        }),
      },
    }
  })

  const dependencyBlockers: string[] = []
  const dependencies: IndependentDefaultMasterPlanDependencyPlan[] = []
  for (const successor of candidateRows) {
    const successorTask = mappingByClientRowId.get(successor.clientRowId)
    if (!successorTask) continue
    for (const dependency of readDependencyReferences(successor)) {
      const predecessorTask = mappingByClientRowId.get(dependency.predecessorClientRowId)
      if (!predecessorTask) {
        dependencyBlockers.push('candidate_dependency_references_external_or_missing_row')
        continue
      }
      if (predecessorTask.taskId === successorTask.taskId) {
        dependencyBlockers.push('candidate_dependency_self_reference')
        continue
      }
      dependencies.push({
        taskId: successorTask.taskId,
        dependencyTaskId: predecessorTask.taskId,
        dependencyType: dependency.dependencyType,
        lagDays: Number.isFinite(dependency.lagDays) ? dependency.lagDays : 0,
        sourceType: 'template_generated',
        sourceBaselineId: baselineId,
        sourceSuccessorBaselineItemId: successor.id,
        sourcePredecessorBaselineItemId: predecessorTask.candidate.id,
      })
    }
  }

  if (dependencyBlockers.length > 0) {
    return {
      status: 'blocked',
      blockers: unique(dependencyBlockers),
      tasks: [],
      dependencies: [],
      candidateToTaskMappings: [],
      durationCalibration,
      mutationBoundary,
    }
  }

  return {
    status: 'ready',
    blockers: [],
    tasks,
    dependencies,
    candidateToTaskMappings: mappings,
    durationCalibration,
    mutationBoundary,
  }
}
