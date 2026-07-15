export const PLANNING_TABLE_OPERATION_TYPES = [
  'create_row',
  'update_cell',
  'update_row',
  'delete_row',
  'move_row',
  'indent_row',
  'outdent_row',
  'mark_milestone',
  'set_predecessors',
  'template_generate',
] as const

export type PlanningSurface = 'baseline' | 'monthly_plan' | 'task_list'
export type PlanningTableOperationType = (typeof PLANNING_TABLE_OPERATION_TYPES)[number]

export type PlanningTableOperation = Record<string, unknown> & {
  type?: string
  op?: string
  rowId?: string
  id?: string
  clientRowId?: string
  tempId?: string
  parentId?: string | null
  sortOrder?: number | string | null
  field?: string
  value?: unknown
  values?: Record<string, unknown>
  predecessorTaskIds?: string[]
  predecessorDependencies?: Array<{
    dependencyTaskId?: string
    dependency_task_id?: string
    taskId?: string
    task_id?: string
    clientRowId?: string
    client_row_id?: string
    dependencyType?: 'FS' | 'SS' | 'FF' | 'SF' | string
    dependency_type?: 'FS' | 'SS' | 'FF' | 'SF' | string
    lagDays?: number
    lag_days?: number
    sourceType?: string
    source_type?: string
  }>
}

export interface PlanningTableCommitRequest {
  projectId: string
  surface: PlanningSurface
  resourceId?: string | null
  surfaceId?: string | null
  baseVersion?: string | number | null
  baseRevision?: string | number | null
  fieldRegistryVersion: string
  operations: PlanningTableOperation[]
  clientContext?: Record<string, unknown> | null
}

export interface PlanningTableValidationIssue {
  code: string
  message: string
  severity: 'block_save' | 'confirm' | 'hint'
  operationIndex?: number
  rowId?: string | null
  field?: string | null
  details?: Record<string, unknown>
}

export interface PlanningTableConflict {
  rowId: string
  label: string
  fields: string[]
  mergeGroups: string[]
}
