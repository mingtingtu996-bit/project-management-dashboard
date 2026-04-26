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
  'LOCK_EXPIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'REQUIRES_REALIGNMENT',
  'OBSERVATION_POOL_EMPTY',
  'DEVIATION_ANALYSIS_UNAVAILABLE',
  'MANUAL_REORDER_ALREADY_ACTIVE',
  'MANUAL_REORDER_NOT_ACTIVE',
] as const
export type PlanningErrorCode = (typeof PLANNING_ERROR_CODES)[number]

export const PLANNING_DRAFT_LOCK_TIMEOUT_MINUTES = 30
export const PLANNING_DRAFT_LOCK_REMINDER_MINUTES = 5

export type PlanningDraftLockKind = 'baseline' | 'monthly_plan'
export type PlanningDraftLockConflictCode = 'AVAILABLE' | 'LOCK_HELD' | 'LOCK_EXPIRED'

export interface PlanningDraftLock {
  id: string
  project_id: string
  draft_type: PlanningDraftLockKind
  resource_id: string
  locked_by?: string | null
  locked_at: string
  lock_expires_at: string
  reminder_sent_at?: string | null
  released_at?: string | null
  released_by?: string | null
  release_reason?: 'timeout' | 'force_unlock' | 'manual_release' | null
  is_locked: boolean
  created_at?: string | null
  updated_at?: string | null
}

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
  modified_item_count?: number
  milestone_change_count?: number
  critical_path_change_count?: number
  mapping_affected_count?: number
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
  mapping_status?: 'mapped' | 'pending' | 'missing' | 'merged'
  notes?: string | null
  template_id?: string | null
  template_node_id?: string | null
}

export interface MonthlyPlanVersion extends PlanningVersionBase {
  month: string
  baseline_version_id?: string | null
  source_version_id?: string | null
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
  priority?: 'low' | 'medium' | 'high' | 'critical' | string | null
  observation_window_start?: string | null
  observation_window_end?: string | null
  affects_critical_milestone?: boolean | null
  consecutive_cross_month_count?: number | null
  deferred_reason?: string | null
  review_due_at?: string | null
  reviewed_by?: string | null
  status: 'open' | 'submitted' | 'accepted' | 'rejected' | 'deferred'
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
  summary?: {
    high_priority_count: number
    consecutive_cross_month_count: number
    critical_milestone_count: number
    last_reviewed_at?: string | null
  }
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
    priority?: RevisionPoolCandidate['priority']
    observation_window_start?: string | null
    observation_window_end?: string | null
    affects_critical_milestone?: boolean | null
    consecutive_cross_month_count?: number | null
    deferred_reason?: string | null
    review_due_at?: string | null
    reviewed_by?: string | null
  }>
}

export interface ObservationPoolSubmitResponse {
  submitted_count: number
  candidate_ids: string[]
}

export type ProgressDeviationMainlineKey = 'baseline' | 'monthly_plan' | 'execution'
export type ProgressDeviationRowStatus = 'on_track' | 'delayed' | 'carried_over' | 'revised' | 'unresolved'
export type ProgressDeviationMappingStatus = 'mapped' | 'mapping_pending' | 'merged_into'

export type MilestoneIntegrityState = 'aligned' | 'needs_attention' | 'missing_data' | 'blocked'

export interface MilestoneIntegrityRow {
  milestone_id: string
  milestone_key: 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7' | 'M8' | 'M9'
  title: string
  planned_date: string | null
  current_planned_date: string | null
  actual_date: string | null
  state: MilestoneIntegrityState
  issues: string[]
}

export interface MilestoneIntegritySummary {
  total: number
  aligned: number
  needs_attention: number
  missing_data: number
  blocked: number
}

export interface MilestoneIntegrityReport {
  project_id: string
  summary: MilestoneIntegritySummary
  items: MilestoneIntegrityRow[]
}

export interface PassiveReorderWindowResult {
  window_days: 3 | 5 | 7
  event_count: number
  affected_task_count: number
  cumulative_event_count: number
  triggered: boolean
  average_offset_days?: number
  key_task_count?: number
}

export interface PassiveReorderDetectionReport {
  project_id: string
  detected_at: string
  total_events: number
  windows: PassiveReorderWindowResult[]
}

export interface PlanningGovernanceAlert {
  kind:
    | 'health'
    | 'integrity'
    | 'anomaly'
    | 'mapping_orphan_pointer'
    | 'milestone_blocked'
    | 'milestone_missing_data'
    | 'milestone_needs_attention'
    | 'closeout_reminder'
    | 'closeout_escalation'
    | 'closeout_unlock'
    | 'reorder_reminder'
    | 'reorder_escalation'
    | 'reorder_summary'
    | 'ad_hoc_cross_month_reminder'
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail: string
  source_id: string
  task_id?: string | null
  delay_request_id?: string | null
}

export interface PlanningGovernanceState {
  id: string
  project_id: string
  state_key: string
  category: 'closeout' | 'reorder' | 'ad_hoc'
  kind:
    | 'closeout_reminder'
    | 'closeout_overdue_signal'
    | 'closeout_force_unlock'
    | 'reorder_reminder'
    | 'reorder_escalation'
    | 'reorder_summary'
    | 'manual_reorder_session'
    | 'ad_hoc_cross_month_reminder'
  status: 'active' | 'resolved'
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail: string
  threshold_day?: number | null
  dashboard_signal?: boolean
  payload?: Record<string, unknown> | null
  source_entity_type?: string | null
  source_entity_id?: string | null
  active_from?: string | null
  resolved_at?: string | null
  created_at: string
  updated_at: string
}

export interface PlanningGovernanceSnapshot {
  project_id: string
  health: PlanningHealthReport
  integrity: PlanningIntegrityReport
  anomaly: PassiveReorderDetectionReport
  alerts: PlanningGovernanceAlert[]
  states: PlanningGovernanceState[]
}

export interface WbsTemplateReferenceDayFeedbackNode {
  path: string
  title: string
  is_leaf: boolean
  sample_count: number
  mean_days: number
  median_days: number
  current_reference_days: number | null
  suggested_reference_days: number | null
  sample_values: number[]
}

export interface WbsTemplateFeedbackReport {
  template_id: string
  template_name: string
  completed_project_count: number
  sample_task_count: number
  matched_ad_hoc_task_count: number
  node_count: number
  nodes: WbsTemplateReferenceDayFeedbackNode[]
}

export interface WbsReferenceDaysInferenceNode extends WbsTemplateReferenceDayFeedbackNode {
  applied: boolean
}

export interface WbsReferenceDaysInferenceReport {
  template_id: string
  template_name: string
  updated_count: number
  nodes: WbsReferenceDaysInferenceNode[]
  inferred_template_data: unknown
}

export interface WbsReferenceDaysConfirmRequest {
  apply_all?: boolean
  selected_paths?: string[]
}

export interface WbsReferenceDaysConfirmResponse {
  template_id: string
  template_name: string
  updated_count: number
  reference_days: number | null
  template_data: unknown
}

export interface PlanningIntegrityDataSummary {
  total_tasks: number
  missing_participant_unit_count: number
  missing_scope_dimension_count: number
  missing_progress_snapshot_count: number
}

export interface PlanningIntegrityMappingSummary {
  baseline_pending_count: number
  baseline_merged_count: number
  monthly_carryover_count: number
}

export interface PlanningIntegritySystemSummary {
  inconsistent_milestones: number
  stale_snapshot_count: number
}

export interface PlanningIntegrityInput {
  project_id: string
  key_task_ids?: string[]
  tasks: Array<{
    id: string
    project_id: string
    title: string
    status?: string | null
    participant_unit_id?: string | null
    responsible_unit?: string | null
    assignee_unit?: string | null
    specialty_type?: string | null
    phase_id?: string | null
  }>
  milestones: Array<{
    id: string
    project_id: string
    name?: string | null
    title?: string | null
    target_date?: string | null
    baseline_date?: string | null
    current_plan_date?: string | null
    actual_date?: string | null
    completed_at?: string | null
    status?: string | null
    version?: number | null
  }>
  baseline_items: Array<{
    id: string
    mapping_status?: 'mapped' | 'pending' | 'missing' | 'merged' | string | null
  }>
  monthly_plan_items: Array<{
    id: string
    commitment_status?: 'planned' | 'carried_over' | 'completed' | 'cancelled' | string | null
  }>
  snapshots: Array<{
    id: string
    task_id: string
    progress?: number | null
    snapshot_date?: string | null
    created_at?: string | null
  }>
  change_logs: Array<{
    project_id?: string | null
    entity_type?: string | null
    entity_id?: string | null
    field_name?: string | null
    created_at?: string | null
    old_value?: string | null
    new_value?: string | null
  }>
}

export interface PlanningIntegrityReport {
  project_id: string
  milestone_integrity: MilestoneIntegrityReport
  data_integrity: PlanningIntegrityDataSummary
  mapping_integrity: PlanningIntegrityMappingSummary
  system_consistency: PlanningIntegritySystemSummary
  passive_reorder: PassiveReorderDetectionReport
}

export interface PlanningHealthBreakdown {
  data_integrity_score: number
  mapping_integrity_score: number
  system_consistency_score: number
  m1_m9_score: number
  passive_reorder_penalty: number
  total_score: number
}

export interface PlanningHealthReport {
  project_id: string
  score: number
  status: 'healthy' | 'warning' | 'critical'
  label: '健康' | '亚健康' | '危险'
  breakdown: PlanningHealthBreakdown
  integrity: PlanningIntegrityReport
}

export interface ProgressDeviationReadRequest {
  project_id: string
  baseline_version_id: string
  monthly_plan_version_id?: string | null
  lock?: boolean
}

export interface BaselineVersionLock {
  id: string
  project_id: string
  baseline_version_id: string
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

export interface ProgressDeviationChildGroupItem {
  id: string
  title: string
  actual_date?: string | null
  status: ProgressDeviationRowStatus
}

export interface ProgressDeviationChildGroup {
  group_id: string
  parent_item_id: string
  parent_title: string
  child_count: number
  last_completed_date: string | null
  children: ProgressDeviationChildGroupItem[]
}

export interface ProgressDeviationMergedInto {
  group_id: string
  target_item_id: string | null
  title: string
  item_ids: string[]
}

export interface ProgressDeviationAttribution {
  blocking_conditions: Array<{
    id: string
    title: string
    due_date?: string | null
    status?: string | null
  }>
  active_obstacles: Array<{
    id: string
    description: string
    severity?: string | null
    status?: string | null
    expected_resolution_date?: string | null
  }>
  delay_reasons: Array<{
    id: string
    reason: string
    delay_reason?: string | null
    status?: string | null
    delayed_date?: string | null
  }>
}

export interface ProgressDeviationMonthlyBucket {
  month: string
  on_track: number
  delayed: number
  carried_over: number
  revised: number
  unresolved: number
}

export interface ProgressDeviationResponsibilityContribution {
  owner: string
  count: number
  percentage: number
  task_ids: string[]
}

export interface ProgressDeviationCauseSummary {
  reason: string
  count: number
  percentage: number
}

export interface ProgressDeviationChartData {
  baselineDeviation: ProgressDeviationRow[]
  monthlyFulfillment: ProgressDeviationMonthlyBucket[]
  executionDeviation: ProgressDeviationRow[]
  monthly_buckets: ProgressDeviationMonthlyBucket[]
}

export interface ProgressDeviationDataCompleteness {
  has_snapshot: boolean
  has_actual_progress: boolean
  has_planning_link: boolean
  has_attribution: boolean
}

export interface ProgressDeviationRow {
  id: string
  project_id: string
  mainline: ProgressDeviationMainlineKey
  source_version_id?: string | null
  source_item_id?: string | null
  source_task_id?: string | null
  title: string
  planned_date?: string | null
  planned_progress?: number | null
  actual_progress?: number | null
  actual_date?: string | null
  deviation_days: number
  deviation_rate: number
  status: ProgressDeviationRowStatus
  reason?: string | null
  mapping_status?: ProgressDeviationMappingStatus | null
  merged_into?: ProgressDeviationMergedInto | null
  child_group?: ProgressDeviationChildGroup | null
  attribution?: ProgressDeviationAttribution | null
  data_completeness?: ProgressDeviationDataCompleteness | null
}

export interface ProgressDeviationMainline {
  key: ProgressDeviationMainlineKey
  label: string
  summary: {
    total_items: number
    deviated_items: number
    delayed_items: number
    unresolved_items: number
  }
  rows: ProgressDeviationRow[]
}

export interface ProgressDeviationSummary {
  total_items: number
  deviated_items: number
  carryover_items: number
  unresolved_items: number
  baseline_items: number
  monthly_plan_items: number
  execution_items: number
}

export interface ProgressDeviationMappingMonitoring {
  split_groups: ProgressDeviationChildGroup[]
  merge_groups: Array<{
    group_id: string
    item_ids: string[]
    item_titles: string[]
    mapping_status: 'mapping_pending'
    explanation: string
  }>
  mapping_pending_count: number
  merged_count: number
}

export interface ProgressDeviationTrendEvent {
  event_type: 'baseline_version_switch'
  marker_type: 'vertical_line'
  switch_date: string
  from_version: string
  to_version: string
  explanation: string
}

export interface ProgressDeviationAnalysisResponse {
  project_id: string
  baseline_version_id: string
  monthly_plan_version_id?: string | null
  version_lock?: BaselineVersionLock | null
  summary: ProgressDeviationSummary
  rows: ProgressDeviationRow[]
  mainlines: ProgressDeviationMainline[]
  mapping_monitoring: ProgressDeviationMappingMonitoring
  trend_events: ProgressDeviationTrendEvent[]
  chart_data?: ProgressDeviationChartData | null
  responsibility_contribution?: ProgressDeviationResponsibilityContribution[]
  top_deviation_causes?: ProgressDeviationCauseSummary[]
  m1_m9_consistency?: MilestoneIntegrityReport
}

export interface DeviationAnalysisReadRequest extends ProgressDeviationReadRequest {}
export interface DeviationAnalysisReadResponse extends ProgressDeviationAnalysisResponse {}

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
