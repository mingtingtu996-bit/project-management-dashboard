// v1.4.7.1 §11.4-11.5: Unified commit model for shared planning tree.
// Three planning pages share this commit structure.

export type PlanningSurface = 'baseline' | 'monthly_plan' | 'task_list'

export type PlanningTableOperationType =
  | 'create_row'
  | 'update_cell'
  | 'update_row'
  | 'delete_row'
  | 'move_row'
  | 'indent_row'
  | 'outdent_row'
  | 'mark_milestone'
  | 'set_predecessors'
  | 'template_generate'

export interface PlanningTableCreateRow {
  type: 'create_row'
  clientRowId: string
  parentId?: string | null
  sortOrder?: number | null
  values: Record<string, unknown>
}

export interface PlanningTableUpdateCell {
  type: 'update_cell'
  rowId: string
  field: string
  value: unknown
}

export interface PlanningTableUpdateRow {
  type: 'update_row'
  rowId: string
  values: Record<string, unknown>
}

export interface PlanningTableDeleteRow {
  type: 'delete_row'
  rowId: string
}

export interface PlanningTableMoveRow {
  type: 'move_row'
  rowId: string
  parentId?: string | null
  sortOrder?: number
}

export interface PlanningTableIndentRow {
  type: 'indent_row'
  rowId: string
}

export interface PlanningTableOutdentRow {
  type: 'outdent_row'
  rowId: string
}

export interface PlanningTableMarkMilestone {
  type: 'mark_milestone'
  rowId: string
  isMilestone: boolean
  milestoneLevel?: number | null
}

export interface PlanningTableSetPredecessors {
  type: 'set_predecessors'
  rowId: string
  predecessorTaskIds: string[]
  predecessorDependencies?: PlanningTableDependencyInput[]
}

export interface PlanningTableDependencyInput {
  clientRowId?: string
  dependencyTaskId?: string
  dependencyType?: 'FS' | 'SS' | 'FF' | 'SF' | string
  lagDays?: number
  intentCode?: string | null
  strength?: string | null
  source?: string | null
}

export interface PlanningTableTemplateGenerate {
  type: 'template_generate'
  generationBatchId: string
  templateId: string
  templateIds?: string[]
  selectedNodeIds: string[]
  selectedNodesByTemplate?: Record<string, string[]>
  scope: {
    buildings?: string[]
    floors?: string[]
    regions?: string[]
    phases?: string[]
    engineering_object_id?: string | null
    phase_object_id?: string | null
    section_object_id?: string | null
    building_object_id?: string | null
    basement_object_id?: string | null
    floor_object_id?: string | null
    physical_zone_object_id?: string | null
    functional_area_object_id?: string | null
    project_type_code?: string | null
    structure_type_code?: string | null
    method_variant_codes?: string[]
    element_variant_codes?: string[]
  }
  attachUnderRowId?: string | null
  drilldownMode?: 'selected_children'
  drilldownGenerationLevel?: 'process_detail' | 'activity_step'
  sourceParentTaskId?: string | null
  generationDepth?: 'item_work' | 'process' | 'activity_step'
  includeActivitySteps?: boolean
  duplicatePolicy: 'skip' | 'overwrite' | 'duplicate'
  previewRows: unknown[]
  rowLimitPolicy?: 'single_batch' | 'split_by_phase'
  generationBatches?: Array<{
    batchId: string
    phaseObjectId: string | null
    scopeIndexes: number[]
    rowCount: number
    templateIds: string[]
    rowLimit: number
    rowLimitExceeded: boolean
  }>
  plannedStartDate?: string | null
  sortOrder?: number
}

export type PlanningTableOperation =
  | PlanningTableCreateRow
  | PlanningTableUpdateCell
  | PlanningTableUpdateRow
  | PlanningTableDeleteRow
  | PlanningTableMoveRow
  | PlanningTableIndentRow
  | PlanningTableOutdentRow
  | PlanningTableMarkMilestone
  | PlanningTableSetPredecessors
  | PlanningTableTemplateGenerate

export interface PlanningTableCommitRequest {
  projectId: string
  surface: PlanningSurface
  surfaceId?: string
  resourceId?: string
  baseVersion?: number | string
  baseRevision?: number | string
  fieldRegistryVersion: string
  operations: PlanningTableOperation[]
  clientContext?: Record<string, unknown> | null
  visibleColumns?: string[]
  clientSummary?: {
    addedRows: number
    updatedRows: number
    deletedRows: number
    movedRows: number
  }
}

export interface PlanningTableCommitResponse<T = unknown> {
  success: boolean
  requestId?: string
  idempotentReplay?: boolean
  surface: PlanningSurface
  resourceId: string | null
  revision: number | string
  fieldRegistryVersion: string
  rows: T[]
  validationIssues: unknown[]
  governanceSummary: {
    changedRowCount: number
    createdRowCount: number
    updatedRowCount: number
    deletedRowCount: number
    dateAdjustmentCount: number
    progressAdjustmentCount: number
    milestoneChangeCount: number
    dependencyChangeCount: number
  }
  deletionResults: Array<Record<string, unknown>>
  criticalPathChangeSummary: {
    changed: boolean
    enteredTaskIds: string[]
    leftTaskIds: string[]
  }
  realtimeEvents: string[]
  tempIdMap: Record<string, string>
}
