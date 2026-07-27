// planningTableCommitService — shared response builders for v1.4.7.1 planning table commits
import type { ApiResponse } from '../types/index.js'
import type { PlanningTableOperation } from '../types/planningTable.js'
import {
  ExecutionFactIntent,
  applyExecutionFactGovernance,
} from './planningScheduleGovernanceService.js'
import { PLANNING_FIELD_REGISTRY_VERSION } from './planningFieldRegistryService.js'

export type { PlanningSurface, PlanningTableCommitRequest, PlanningTableOperation } from '../types/planningTable.js'

// ============================================================
// Field registry version check
// ============================================================
export function isPlanningFieldRegistryVersionCurrent(version: unknown) {
  return String(version ?? '').trim() === PLANNING_FIELD_REGISTRY_VERSION
}

export function buildFieldRegistryStaleResponse(receivedVersion: unknown): ApiResponse {
  return {
    success: false,
    error: {
      code: 'FIELD_REGISTRY_STALE',
      message: `字段注册表版本已更新，请刷新后继续。当前版本: ${PLANNING_FIELD_REGISTRY_VERSION}`,
      details: { expectedVersion: PLANNING_FIELD_REGISTRY_VERSION, receivedVersion: String(receivedVersion ?? '') },
    },
    timestamp: new Date().toISOString(),
  }
}

// ============================================================
// Commit response builder
// ============================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildPlanningTableCommitResponse(params: Record<string, any>): any {
  const rows = (params.rows ?? params.items ?? []) as any[]
  const tempIdMap = params.tempIdMap instanceof Map
    ? Object.fromEntries(params.tempIdMap.entries())
    : params.tempIdMap ?? {}
  const operationGovernance = summarizePlanningTableGovernanceCounts(params.operations ?? [])
  const operationMutationCounts = summarizePlanningTableMutationCounts(params.operations ?? [])
  const governanceSummary = {
    changedRowCount: params.changedRowCount ?? operationMutationCounts.updatedCount ?? 0,
    createdRowCount: params.createdRowCount ?? operationMutationCounts.createdCount ?? 0,
    updatedRowCount: params.updatedRowCount ?? operationMutationCounts.updatedCount ?? 0,
    deletedRowCount: params.deletedRowCount ?? operationMutationCounts.deletedCount ?? 0,
    ...operationGovernance,
    ...(params.governanceSummary ?? {}),
  }
  const payload = {
    items: rows,
    rows,
    fieldRegistryVersion: PLANNING_FIELD_REGISTRY_VERSION,
    governanceSummary,
    surface: params.surface,
    resourceId: params.resourceId ?? null,
    revision: params.revision,
    deletionResults: params.deletionResults ?? [],
    tempIdMap,
    validationIssues: Array.isArray(params.validationIssues) ? params.validationIssues : [],
    criticalPathChangeSummary: params.criticalPathChangeSummary ?? { changed: false, enteredTaskIds: [], leftTaskIds: [] },
    realtimeEvents: params.realtimeEvents ?? [],
  }
  return {
    success: true,
    ...payload,
    data: payload,
    timestamp: new Date().toISOString(),
  }
}

// ============================================================
// Operation summary helpers
// ============================================================
function readRealtimeOperationType(op: PlanningTableOperation): string {
  return String((op as any).type ?? (op as any).op ?? '').trim()
}

function normalizePlanningFieldName(value: unknown): string {
  const text = String(value ?? '').trim()
  if (text === 'start') return 'planned_start_date'
  if (text === 'end') return 'planned_end_date'
  if (text === 'milestone') return 'is_milestone'
  return text
}

function readPlanningOperationFields(operation: PlanningTableOperation): string[] {
  const operationType = readRealtimeOperationType(operation)
  if (operationType === 'update_cell') {
    return [normalizePlanningFieldName(operation.field)].filter(Boolean)
  }
  if (operationType === 'update_row' || operationType === 'create_row' || operationType === 'template_generate') {
    const values = operation.values && typeof operation.values === 'object' && !Array.isArray(operation.values)
      ? operation.values
      : {}
    return Object.keys(values).map(normalizePlanningFieldName).filter(Boolean)
  }
  if (operationType === 'move_row' || operationType === 'indent_row' || operationType === 'outdent_row') {
    return operation.sortOrder !== undefined ? ['sort_order'] : []
  }
  if (operationType === 'mark_milestone') return ['is_milestone']
  if (operationType === 'set_predecessors') return ['predecessor_task_ids']
  return []
}

function isScheduleField(field: string) {
  return ['planned_start_date', 'planned_end_date', 'start_date', 'end_date'].includes(field)
}

function isProgressField(field: string) {
  return ['progress', 'target_progress'].includes(field)
}

function isMilestoneField(field: string) {
  return ['is_milestone', 'milestone_level', 'milestone_order'].includes(field)
}

function isDependencyField(field: string) {
  return ['predecessor_task_ids', 'dependencies'].includes(field)
}

function getPlanningMergeGroupForField(field: string): string | null {
  if (['title', 'name'].includes(field)) return 'identity'
  if (isScheduleField(field)) return 'schedule'
  if (['progress', 'target_progress', 'status'].includes(field)) return 'progress_status'
  if (isMilestoneField(field)) return 'milestone'
  if (isDependencyField(field)) return 'dependency'
  if (['sort_order', 'parent_id', 'wbs_node_type', 'category_type'].includes(field)) return 'node_control'
  if (['assignee', 'assignee_name', 'assignee_user_id', 'participant_unit_id'].includes(field)) return 'responsibility'
  if (field.endsWith('_object_id') || field === 'scope') return 'scope'
  return null
}

export function summarizePlanningTableGovernanceCounts(operations: PlanningTableOperation[]) {
  let dateAdjustmentCount = 0
  let progressAdjustmentCount = 0
  let milestoneChangeCount = 0
  let dependencyChangeCount = 0

  for (const op of operations) {
    const t = readRealtimeOperationType(op)
    const fields = (t === 'create_row' || t === 'template_generate') ? [] : readPlanningOperationFields(op)

    if (fields.some(isScheduleField)) dateAdjustmentCount++
    if (fields.some(isProgressField)) progressAdjustmentCount++
    if (fields.some(isMilestoneField) || t === 'mark_milestone') milestoneChangeCount++
    if (fields.some(isDependencyField) || t === 'set_predecessors') dependencyChangeCount++
  }
  return {
    dateAdjustmentCount,
    progressAdjustmentCount,
    milestoneChangeCount,
    dependencyChangeCount,
  }
}

function summarizePlanningTableMutationCounts(operations: PlanningTableOperation[]) {
  let createdCount = 0
  let updatedCount = 0
  let deletedCount = 0
  let movedCount = 0
  for (const op of operations) {
    const t = readRealtimeOperationType(op)
    if (t === 'create_row' || t === 'template_generate') createdCount++
    else if (t === 'update_cell' || t === 'update_row') updatedCount++
    else if (t === 'delete_row') deletedCount++
    else if (t === 'move_row' || t === 'indent_row' || t === 'outdent_row') movedCount++
  }
  return { createdCount, updatedCount, deletedCount, movedCount }
}

export function summarizePlanningTableMergeGroups(operations: PlanningTableOperation[]) {
  const groups = new Map<string, { operationCount: number; fields: Set<string> }>()

  for (const operation of operations) {
    const groupFields = new Map<string, Set<string>>()
    for (const field of readPlanningOperationFields(operation)) {
      const group = getPlanningMergeGroupForField(field)
      if (!group) continue
      const fields = groupFields.get(group) ?? new Set<string>()
      fields.add(field)
      groupFields.set(group, fields)
    }

    for (const [group, fields] of groupFields.entries()) {
      const summary = groups.get(group) ?? { operationCount: 0, fields: new Set<string>() }
      summary.operationCount += 1
      fields.forEach((field) => summary.fields.add(field))
      groups.set(group, summary)
    }
  }

  return Object.fromEntries([...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, summary]) => {
      const fields = [...summary.fields].sort()
      return [group, {
        operationCount: summary.operationCount,
        fieldCount: fields.length,
        fields,
      }]
    }))
}

export function summarizePlanningTableRealtimeRows(
  operations: PlanningTableOperation[],
  tempIdMap?: Map<string, string>,
) {
  const changedRowIds = new Set<string>()
  const deletedRowIds = new Set<string>()
  for (const operation of operations) {
    const operationType = readRealtimeOperationType(operation)
    if (!operationType) continue
    const rowId = String(
      operationType === 'create_row'
        ? (operation as any).clientRowId ?? (operation as any).tempId ?? (operation as any).rowId ?? (operation as any).id ?? ''
        : (operation as any).rowId ?? (operation as any).id ?? '',
    ).trim()
    if (!rowId) continue
    const resolvedRowId = tempIdMap?.get(rowId) ?? rowId
    if (operationType === 'delete_row') {
      changedRowIds.delete(resolvedRowId)
      deletedRowIds.add(resolvedRowId)
    } else {
      if (!deletedRowIds.has(resolvedRowId)) changedRowIds.add(resolvedRowId)
    }
  }
  return {
    changedRowIds: [...changedRowIds],
    deletedRowIds: [...deletedRowIds],
  }
}

// ============================================================
// v1.4.7.1 §13.6.4 / v1.4.7.3 §12.1: Auto derive actual dates
// ============================================================
export interface AutoActualDateInput {
  currentProgress?: number | null
  newProgress?: number | null
  currentStatus?: string | null
  newStatus?: string | null
}

export interface AutoActualDateResult {
  actualStartDate?: string | null
  actualEndDate?: string | null
}

export function deriveAutoActualDates(input: AutoActualDateInput): AutoActualDateResult {
  const result = applyExecutionFactGovernance({
    intent: ExecutionFactIntent.TaskCommit,
    previousTask: {
      progress: input.currentProgress ?? 0,
      status: input.currentStatus ?? null,
    },
    patch: {
      progress: input.newProgress ?? input.currentProgress ?? 0,
      status: input.newStatus ?? input.currentStatus ?? null,
    },
  })

  return {
    actualStartDate: result.patch.actual_start_date as string | undefined,
    actualEndDate: result.patch.actual_end_date as string | undefined,
  }
}
