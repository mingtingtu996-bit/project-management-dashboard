export const PLANNING_STATUSES = ['draft', 'confirmed', 'closed', 'revising', 'pending_realign', 'archived'] as const
export type PlanningStatus = (typeof PLANNING_STATUSES)[number]

export const PLANNING_EVENTS = [
  'CONFIRM',
  'CLOSE_MONTH',
  'START_REVISION',
  'SUBMIT_REVISION',
  'QUEUE_REALIGNMENT',
  'RESOLVE_REALIGNMENT',
] as const
export type PlanningEvent = (typeof PLANNING_EVENTS)[number]

export const PLANNING_ERROR_CODES = [
  'VERSION_CONFLICT',
  'BLOCKING_ISSUES_EXIST',
  'INVALID_STATE',
  'LOCK_HELD',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'REQUIRES_REALIGNMENT',
  'OBSERVATION_POOL_EMPTY',
  'DEVIATION_ANALYSIS_UNAVAILABLE',
] as const
export type PlanningErrorCode = (typeof PLANNING_ERROR_CODES)[number]

export interface PlanningTransitionContext {
  version?: number
  expected_version?: number
  blocking_issue_count?: number
  has_blocking_issues?: boolean
  realignment_required?: boolean
  realignment_resolved?: boolean
  revision_ready?: boolean
}

export interface PlanningVersionBase {
  id: string
  project_id: string
  version: number
  status: PlanningStatus
  title: string
  description?: string | null
  confirmed_at?: string | null
  confirmed_by?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface BaselineVersion extends PlanningVersionBase {
  source_type: 'manual' | 'current_schedule' | 'imported_file' | 'carryover'
  source_version_id?: string | null
  source_version_label?: string | null
  effective_from?: string | null
  effective_to?: string | null
  revision_pool_count?: number
  observation_pool_count?: number
}

export interface BaselineItem {
  id: string
  project_id: string
  baseline_version_id: string
  parent_item_id?: string | null
  source_task_id?: string | null
  source_milestone_id?: string | null
  title: string
  planned_start_date?: string | null
  planned_end_date?: string | null
  target_progress?: number | null
  sort_order: number
  is_milestone?: boolean
  is_critical?: boolean
  is_baseline_critical?: boolean
  mapping_status?: 'mapped' | 'pending' | 'missing' | 'merged'
  notes?: string | null
}

export interface MonthlyPlanVersion extends PlanningVersionBase {
  month: string
  baseline_version_id?: string | null
  source_version_id?: string | null
  source_version_label?: string | null
  auto_switched?: boolean | null
  closeout_at?: string | null
  carryover_item_count?: number
  data_confidence_score?: number | null
  data_confidence_flag?: 'high' | 'medium' | 'low' | null
  data_confidence_note?: string | null
}

export interface MonthlyPlanItem {
  id: string
  project_id: string
  monthly_plan_version_id: string
  baseline_item_id?: string | null
  carryover_from_item_id?: string | null
  source_task_id?: string | null
  title: string
  planned_start_date?: string | null
  planned_end_date?: string | null
  target_progress?: number | null
  current_progress?: number | null
  sort_order: number
  is_milestone?: boolean
  is_critical?: boolean
  commitment_status?: 'planned' | 'carried_over' | 'completed' | 'cancelled'
  notes?: string | null
}

export interface CarryoverItem {
  id: string
  project_id: string
  source_monthly_plan_version_id: string
  target_monthly_plan_version_id: string
  source_item_id: string
  target_item_id?: string | null
  carryover_reason: string
  carryover_days?: number | null
  disposition: 'carryover' | 'revise' | 'cancel' | 'split'
  status: 'pending' | 'accepted' | 'rejected'
  created_at?: string | null
  updated_at?: string | null
}

export interface RevisionPoolCandidate {
  id: string
  project_id: string
  baseline_version_id?: string | null
  monthly_plan_version_id?: string | null
  source_type: 'observation' | 'deviation' | 'manual'
  source_id?: string | null
  title: string
  reason: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'submitted' | 'accepted' | 'rejected'
  submitted_at?: string | null
  reviewed_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface BaselineConfirmRequest {
  version: number
}

export interface BaselineConfirmResponse {
  id: string
  status: 'confirmed'
  version: number
  confirmed_at: string
}

export interface PlanningDraftLockRecord {
  id: string
  project_id: string
  draft_type: 'baseline' | 'monthly_plan'
  resource_id: string
  locked_by?: string | null
  locked_at: string
  lock_expires_at: string
  reminder_sent_at?: string | null
  released_at?: string | null
  released_by?: string | null
  release_reason?: 'timeout' | 'force_unlock' | 'manual_release' | null
  is_locked: boolean
  version?: number
  created_at?: string | null
  updated_at?: string | null
}

export interface MonthlyPlanConfirmRequest {
  version: number
  month: string
}

export interface MonthlyPlanConfirmResponse {
  id: string
  status: 'confirmed'
  version: number
  month: string
  confirmed_at: string
}

export interface MonthCloseRequest {
  month: string
  version: number
}

export interface MonthCloseResponse {
  month: string
  status: 'closed'
  closed_at: string
  carryover_item_count: number
}

export interface RevisionSubmitRequest {
  baseline_version_id: string
  reason: string
  source_candidate_ids?: string[]
}

export interface RevisionSubmitResponse {
  revision_id: string
  status: 'revising'
  source_version_id: string
  created_at: string
}

export interface ObservationPoolReadRequest {
  project_id: string
  baseline_version_id?: string | null
}

export interface ObservationPoolReadResponse {
  items: RevisionPoolCandidate[]
  total: number
}

export interface ObservationPoolSubmitRequest {
  project_id: string
  baseline_version_id?: string | null
  items: Array<{
    title: string
    reason: string
    source_type: RevisionPoolCandidate['source_type']
    source_id?: string | null
    severity?: RevisionPoolCandidate['severity']
  }>
}

export interface ObservationPoolSubmitResponse {
  submitted_count: number
  candidate_ids: string[]
}

export interface DeviationAnalysisReadRequest {
  project_id: string
  baseline_version_id: string
  monthly_plan_version_id?: string | null
}

export interface DeviationAnalysisReadResponse {
  project_id: string
  baseline_version_id: string
  monthly_plan_version_id?: string | null
  summary: {
    total_items: number
    deviated_items: number
    carryover_items: number
    unresolved_items: number
  }
  rows: Array<{
    item_id: string
    title: string
    deviation_days: number
    deviation_reason?: string | null
    status: 'on_track' | 'delayed' | 'carried_over' | 'revised'
  }>
}

export interface PlanningEndpointContract {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  path: string
  requestShape: string
  responseShape: string
  errorCodes: PlanningErrorCode[]
}

export interface PlanningContractsSnapshot {
  types: string[]
  endpoints: PlanningEndpointContract[]
  stateMachine: {
    states: PlanningStatus[]
    events: PlanningEvent[]
    transitions: string[]
  }
}
