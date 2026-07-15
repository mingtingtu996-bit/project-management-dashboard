export type ChangeLogEntityType =
  | 'task'
  | 'risk'
  | 'issue'
  | 'milestone'
  | 'project_material'
  | 'monthly_plan'
  | 'baseline'
  | 'planning_governance'
  | 'task_condition'
  | 'task_obstacle'
  | 'draft_lock'

export type ChangeSource =
  | 'system_auto'
  | 'manual_adjusted'
  | 'manual_close_confirmation'
  | 'manual_keep_processing'
  | 'admin_force'
  | 'approval'
  | 'monthly_plan_correction'
  | 'baseline_revision'

export interface WriteLogParams {
  project_id?: string | null
  entity_type: ChangeLogEntityType
  entity_id: string
  field_name: string
  old_value?: string | number | boolean | null
  new_value?: string | number | boolean | null
  change_reason?: string | null
  changed_by?: string | null
  change_source?: ChangeSource
  action_type?: string
  action_group?: string
  before_snapshot?: Record<string, unknown>
  after_snapshot?: Record<string, unknown>
  metadata?: Record<string, unknown>
  visibility?: 'internal' | 'governance' | 'user'
  retention_policy?: string
}

export interface WriteStatusTransitionLogParams {
  project_id?: string | null
  entity_type: ChangeLogEntityType
  entity_id: string
  old_status?: string | null
  new_status: string
  changed_by?: string | null
  change_reason?: string | null
  change_source?: ChangeSource
}

export interface WriteLifecycleLogParams {
  project_id?: string | null
  entity_type: ChangeLogEntityType
  entity_id: string
  action: string
  changed_by?: string | null
  change_reason?: string | null
  change_source?: ChangeSource
}

export interface HasChangeLogParams {
  entity_type: ChangeLogEntityType
  entity_id: string
  field_name: string
  new_value?: string | number | boolean | null
  change_source?: ChangeSource
  change_reason?: string | null
}
