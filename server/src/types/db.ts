// 数据库表类型定义

export interface Project {
  id: string
  name: string
  description?: string
  status: '未开始' | '进行中' | '已完成' | '已暂停'
  primary_invitation_code?: string
  building_count?: number
  above_ground_floors?: number
  underground_floors?: number
  support_method?: string
  total_area?: number
  planned_start_date?: string
  planned_end_date?: string
  actual_start_date?: string
  actual_end_date?: string
  start_date?: string
  end_date?: string
  total_investment?: number
  budget?: number
  location?: string
  health_score?: number
  health_status?: '健康' | '亚健康' | '预警' | '危险'
  current_phase?: 'pre-construction' | 'construction' | 'completion' | 'delivery'
  construction_unlock_date?: string
  construction_unlock_by?: string
  default_wbs_generated?: boolean
  version?: number
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  project_id: string
  title: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  priority: 'low' | 'medium' | 'high' | 'critical'
  start_date?: string
  end_date?: string
  planned_start_date?: string
  planned_end_date?: string
  actual_start_date?: string
  actual_end_date?: string
  progress: number
  assignee?: string
  assignee_unit?: string
  parent_task_id?: string
  dependencies?: string[]
  milestone_id?: string
  // WBS 扩展字段
  wbs_level?: number
  wbs_code?: string
  sort_order?: number
  is_milestone?: boolean
  milestone_level?: number
  milestone_order?: number
  task_type?: string
  phase_id?: string
  task_source?: 'ad_hoc' | 'baseline' | 'monthly_plan' | 'execution' | string | null
  // 2026-03-29 迁移 019 新增字段
  is_critical?: boolean          // 关键路径标记
  parent_id?: string | null      // WBS 父节点（自引用）
  specialty_type?: string | null // 专项工程分类
  reference_duration?: number | null // 参考工期（天）
  ai_duration?: number | null    // AI 推荐工期（天）
  first_progress_at?: string | null  // 首次填报时间
  delay_reason?: string | null   // 延期原因
  lagLevel?: 'none' | 'mild' | 'moderate' | 'severe'
  lagStatus?: '正常' | '轻度滞后' | '中度滞后' | '严重滞后'
  assignee_user_id?: string | null
  assignee_name?: string
  responsible_unit?: string      // 过渡兼容字段，优先级低于 participant_unit_id
  baseline_item_id?: string | null
  baseline_start?: string | null
  baseline_end?: string | null
  baseline_is_critical?: boolean | null
  monthly_plan_item_id?: string | null
  participant_unit_id?: string | null
  participant_unit_name?: string | null
  template_id?: string | null
  template_node_id?: string | null
  created_at: string
  updated_at: string
  updated_by?: string
  version: number
}

export interface Risk {
  id: string
  project_id: string
  task_id?: string | null
  title: string
  description?: string
  category?: 'schedule' | 'budget' | 'resource' | 'technical' | 'external'
  level?: 'critical' | 'high' | 'medium' | 'low'
  probability: number
  impact: number
  // 状态简化：仅保留 identified / mitigating / closed
  status: 'identified' | 'mitigating' | 'closed'
  // 来源追踪（§1.2）
  source_type?: 'manual' | 'warning_converted' | 'warning_auto_escalated' | 'source_deleted'
  source_id?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
  // 升级链（仅 warning → risk → issue 升级链共享同一 chain_id）
  chain_id?: string | null
  // 待人工确认关闭标识
  pending_manual_close?: boolean
  // 升级/转化到问题后的追踪字段
  linked_issue_id?: string | null
  closed_reason?: string | null
  closed_at?: string | null
  // mitigation_plan 已删除（§1.2）
  created_at: string
  updated_at: string
  version: number
}

/** 独立问题域（§六 issues 表，10.1 建立基础模型，10.2a 实现来源链路） */
export interface Issue {
  id: string
  project_id: string
  task_id?: string | null
  title: string
  description?: string | null
  source_type: 'manual' | 'risk_converted' | 'risk_auto_escalated' | 'obstacle_escalated' | 'condition_expired' | 'source_deleted'
  source_id?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
  chain_id?: string | null
  severity: 'critical' | 'high' | 'medium' | 'low'
  priority: number
  pending_manual_close: boolean
  status: 'open' | 'investigating' | 'resolved' | 'closed'
  closed_reason?: string | null
  closed_at?: string | null
  created_at: string
  updated_at: string
  version: number
}

export interface Milestone {
  id: string
  project_id: string
  name: string
  title?: string
  description?: string
  target_date: string
  baseline_date?: string | null
  current_plan_date?: string | null
  actual_date?: string | null
  completed_at?: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'overdue'
  completion_rate: number
  created_at: string
  updated_at: string
  version: number
}

export interface ParticipantUnit {
  id: string
  project_id?: string | null
  unit_name: string
  unit_type: string
  contact_name?: string | null
  contact_role?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface ProjectMaterial {
  id: string
  project_id: string
  participant_unit_id?: string | null
  material_name: string
  specialty_type?: string | null
  requires_sample_confirmation: boolean
  sample_confirmed: boolean
  expected_arrival_date: string
  actual_arrival_date?: string | null
  requires_inspection: boolean
  inspection_done: boolean
  version: number
  created_at: string
  updated_at: string
}

export type ScopeDimensionKey = 'building' | 'specialty' | 'phase' | 'region'

export interface ScopeDimension {
  id: string
  dimension_key: ScopeDimensionKey
  label: string
  code?: string | null
  is_active: boolean
  sort_order: number
  version: number
  created_at: string
  updated_at: string
}

export interface ProjectScopeDimension {
  id: string
  project_id: string
  dimension_key: ScopeDimensionKey
  scope_dimension_id: string
  scope_dimension_label: string
  sort_order: number
  version: number
  created_at: string
  updated_at: string
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  permission_level?: 'owner' | 'admin' | 'editor' | 'viewer' | null
  display_name?: string
  joined_at: string
  last_activity?: string | null
  is_active?: boolean
}

export interface ResponsibilityWatchlist {
  id: string
  project_id: string
  dimension: 'person' | 'unit'
  subject_key: string
  subject_label: string
  subject_user_id?: string | null
  subject_unit_id?: string | null
  created_by?: string | null
  status: 'active' | 'suggested_to_clear' | 'cleared'
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface ResponsibilityAlertState {
  id: string
  project_id: string
  dimension: 'person' | 'unit'
  subject_key: string
  subject_label: string
  subject_user_id?: string | null
  subject_unit_id?: string | null
  alert_type: string
  current_level: 'healthy' | 'abnormal' | 'recovered'
  consecutive_unhealthy_periods: number
  consecutive_healthy_periods: number
  last_snapshot_week?: string | null
  last_message_id?: string | null
  last_metrics?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface Invitation {
  id: string
  project_id: string
  code: string
  role: 'editor' | 'viewer'
  status: 'active' | 'used' | 'revoked' | 'expired'
  expires_at?: string
  created_by: string
  created_at: string
}

export interface TaskCondition {
  id: string
  task_id: string
  project_id?: string | null
  condition_name: string
  condition_type: string
  description?: string
  drawing_package_id?: string | null
  drawing_package_code?: string | null
  is_satisfied: boolean
  satisfied_reason?: string | null
  satisfied_reason_note?: string | null
  status?: string           // 业务状态：未满足/已满足/已确认
  confirmed_by?: string     // 确认人
  attachments?: any         // 附件列表
  responsible_person?: string
  responsible_unit?: string
  due_date?: string
  met_at?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface TaskObstacle {
  id: string
  task_id: string
  description: string
  obstacle_type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'active' | 'resolving' | 'resolved'
  responsible_person?: string
  responsible_unit?: string
  expected_resolution_date?: string
  resolution_notes?: string
  resolved_at?: string
  severity_escalated_at?: string | null
  severity_manually_overridden?: boolean | null
  created_at: string
  updated_at: string
}

export interface AcceptancePlan {
  id: string
  task_id?: string | null
  project_id: string
  plan_name?: string | null
  acceptance_name?: string   // alias for plan_name (legacy field)
  acceptance_type?: string | null
  building_id?: string | null
  scope_level?: string | null
  participant_unit_id?: string | null
  catalog_id?: string | null
  type_id?: string | null
  type_name?: string | null
  type_color?: string | null
  description?: string
  planned_date?: string
  actual_date?: string
  status:
    | 'draft'
    | 'preparing'
    | 'ready_to_submit'
    | 'submitted'
    | 'inspecting'
    | 'rectifying'
    | 'passed'
    | 'archived'
  phase?: string | null
  phase_code?: string | null
  phase_order?: number | null
  sort_order?: number | null
  parallel_group_id?: string | null
  predecessor_plan_ids?: string[] | null
  successor_plan_ids?: string[] | null
  can_submit?: boolean | null
  is_overdue?: boolean | null
  days_to_due?: number | null
  requirement_ready_percent?: number | null
  upstream_unfinished_count?: number | null
  downstream_block_count?: number | null
  display_badges?: string[] | null
  overlay_tags?: string[] | null
  is_blocked?: boolean | null
  block_reason_summary?: string | null
  warning_level?: string | null
  is_custom?: boolean | null
  responsible_user_id?: string | null
  responsible_person?: string
  responsible_unit?: string
  inspection_authority?: string
  documents?: any            // document list
  notes?: string
  created_at: string
  updated_at: string
}

export interface AcceptanceNode {
  id: string
  acceptance_plan_id: string
  node_name: string
  node_type: string
  description?: string
  planned_date?: string
  actual_date?: string
  status:
    | 'draft'
    | 'preparing'
    | 'ready_to_submit'
    | 'submitted'
    | 'inspecting'
    | 'rectifying'
    | 'passed'
    | 'archived'
  result?: any
  documents?: any
  inspector?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface AcceptanceCatalog {
  id: string
  project_id: string
  catalog_code?: string | null
  catalog_name: string
  phase_code?: string | null
  scope_level?: string | null
  planned_finish_date?: string | null
  description?: string | null
  is_system?: boolean | null
  created_at: string
  updated_at: string
}

export interface AcceptanceDependency {
  id: string
  project_id: string
  source_plan_id: string
  target_plan_id: string
  dependency_kind?: 'hard' | 'soft' | null
  status?: 'active' | 'inactive' | 'pending' | null
  created_at: string
  updated_at: string
}

export type AcceptanceRequirementStatus = 'open' | 'met' | 'blocked' | 'closed'

export interface AcceptanceRequirement {
  id: string
  project_id: string
  plan_id: string
  requirement_type: string
  source_entity_type: string
  source_entity_id: string
  drawing_package_id?: string | null
  description?: string | null
  status?: AcceptanceRequirementStatus | null
  is_required: boolean
  is_satisfied: boolean
  created_at: string
  updated_at: string
}

export interface AcceptanceRecord {
  id: string
  project_id: string
  plan_id: string
  record_type: string
  content: string
  operator?: string | null
  record_date?: string | null
  attachments?: any | null
  created_at: string
  updated_at: string
}

type DbBooleanLike = boolean | number | string | null

export interface DrawingPackage {
  id?: string | null
  project_id?: string | null
  package_code?: string | null
  package_name?: string | null
  drawing_type?: string | null
  discipline_type?: string | null
  document_purpose?: string | null
  status?: string | null
  requires_review?: DbBooleanLike
  review_mode?: string | null
  review_basis?: string | null
  completeness_ratio?: number | string | null
  missing_required_count?: number | string | null
  current_version_drawing_id?: string | null
  has_change?: DbBooleanLike
  schedule_impact_flag?: DbBooleanLike
  is_ready_for_construction?: DbBooleanLike
  is_ready_for_acceptance?: DbBooleanLike
  created_at?: string | null
  updated_at?: string | null
}

export interface DrawingPackageItem {
  id?: string | null
  package_id?: string | null
  item_code?: string | null
  item_name?: string | null
  discipline_type?: string | null
  is_required?: DbBooleanLike
  current_drawing_id?: string | null
  current_version?: string | number | null
  status?: string | null
  notes?: string | null
  sort_order?: number | string | null
}

export interface DrawingVersion {
  id?: string | null
  project_id?: string | null
  drawing_id?: string | null
  package_id?: string | null
  parent_drawing_id?: string | null
  version_no?: string | null
  revision_no?: string | null
  issued_for?: string | null
  effective_date?: string | null
  previous_version_id?: string | null
  is_current_version?: DbBooleanLike
  superseded_at?: string | null
  change_reason?: string | null
  created_at?: string | null
  created_by?: string | null
  updated_at?: string | null
  drawing_name?: string | null
}

export interface PreMilestone {
  id: string
  project_id: string
  certificate_type?: CertificateType
  certificate_name?: string
  milestone_name: string
  milestone_type: string
  description?: string
  planned_date?: string
  actual_date?: string
  application_date?: string
  issue_date?: string
  expiry_date?: string
  current_stage?: CertificateStage
  planned_finish_date?: string | null
  actual_finish_date?: string | null
  approving_authority?: string | null
  next_action?: string | null
  next_action_due_date?: string | null
  is_blocked?: boolean | null
  block_reason?: string | null
  latest_record_at?: string | null
  status: CertificateStatus
  responsible_person?: string
  responsible_unit?: string
  issuing_authority?: string
  certificate_no?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface CertificateTypeRegistryEntry<TType extends string = string> {
  type: TType
  label: string
  aliases?: readonly string[]
}

export const CERTIFICATE_TYPE_REGISTRY = [
  {
    type: 'land_certificate',
    label: '土地证',
    aliases: ['land', 'land_certificate', '土地证', '国有土地使用证', '土地使用权证'],
  },
  {
    type: 'land_use_planning_permit',
    label: '用地规划许可证',
    aliases: ['land_use', 'land_use_planning_permit', '用地规划', '用地规划许可证'],
  },
  {
    type: 'engineering_planning_permit',
    label: '工程规划许可证',
    aliases: ['engineering', 'engineering_planning_permit', '工程规划', '工程规划许可证'],
  },
  {
    type: 'construction_permit',
    label: '施工许可证',
    aliases: ['construction', 'construction_permit', '施工许可', '施工许可证'],
  },
] as const satisfies readonly CertificateTypeRegistryEntry<string>[]

export type KnownCertificateType = (typeof CERTIFICATE_TYPE_REGISTRY)[number]['type']

export const CERTIFICATE_TYPES = CERTIFICATE_TYPE_REGISTRY.map((entry) => entry.type) as KnownCertificateType[]

export type CertificateType = KnownCertificateType | string

export const CERTIFICATE_TYPE_LABELS = Object.fromEntries(
  CERTIFICATE_TYPE_REGISTRY.map((entry) => [entry.type, entry.label]),
) as Record<KnownCertificateType, string>

export const CERTIFICATE_STAGE_VALUES = [
  '资料准备',
  '内部报审',
  '外部报批',
  '批复领证',
] as const

export type CertificateStage = (typeof CERTIFICATE_STAGE_VALUES)[number]

export const CERTIFICATE_STATUS_VALUES = [
  'pending',
  'preparing_documents',
  'internal_review',
  'external_submission',
  'supplement_required',
  'approved',
  'issued',
  'expired',
  'voided',
] as const

export type CertificateStatus = (typeof CERTIFICATE_STATUS_VALUES)[number]

export const CERTIFICATE_STATUS_TRANSITIONS: Record<CertificateStatus, CertificateStatus[]> = {
  pending: ['preparing_documents', 'supplement_required', 'voided'],
  preparing_documents: ['internal_review', 'supplement_required', 'voided'],
  internal_review: ['external_submission', 'supplement_required', 'voided'],
  external_submission: ['approved', 'supplement_required', 'voided'],
  supplement_required: ['external_submission', 'voided'],
  approved: ['issued', 'voided'],
  issued: ['expired', 'voided'],
  expired: ['voided'],
  voided: [],
}

export type CertificateDependencyTargetType = 'certificate' | 'work_item'
export type CertificateDependencyKind = 'hard' | 'soft'

export interface CertificateWorkItem {
  id: string
  project_id: string
  item_code?: string | null
  item_name: string
  item_stage: CertificateStage
  status: CertificateStatus
  planned_finish_date?: string | null
  actual_finish_date?: string | null
  approving_authority?: string | null
  is_shared?: boolean | null
  next_action?: string | null
  next_action_due_date?: string | null
  is_blocked?: boolean | null
  block_reason?: string | null
  sort_order?: number | null
  notes?: string | null
  latest_record_at?: string | null
  certificate_ids?: string[]
  linked_issue_id?: string | null
  linked_risk_id?: string | null
  created_at: string
  updated_at: string
}

export interface CertificateDependency {
  id: string
  project_id: string
  predecessor_type: CertificateDependencyTargetType
  predecessor_id: string
  successor_type: CertificateDependencyTargetType
  successor_id: string
  dependency_kind: CertificateDependencyKind
  notes?: string | null
  created_at: string
}

export interface CertificateBoardItem {
  id: string
  certificate_type: CertificateType
  certificate_name: string
  status: CertificateStatus
  current_stage: CertificateStage
  planned_finish_date?: string | null
  actual_finish_date?: string | null
  approving_authority?: string | null
  next_action?: string | null
  next_action_due_date?: string | null
  is_blocked: boolean
  block_reason?: string | null
  latest_record_at?: string | null
  work_item_ids: string[]
  shared_work_item_ids: string[]
}

export interface CertificateBoardCriticalItem {
  itemType: 'certificate' | 'work_item'
  itemId: string
  title: string
  status: string
  plannedFinishDate?: string | null
  dueDate?: string | null
  blockReason?: string | null
  isOverdue: boolean
}

export interface CertificateSharedRibbonItem {
  work_item_id: string
  item_name: string
  item_stage: CertificateStage
  status: CertificateStatus
  is_shared: boolean
  certificate_types: CertificateType[]
  certificate_names: string[]
  blocking_certificate_types: CertificateType[]
  dependency_count: number
  next_action?: string | null
  next_action_due_date?: string | null
  block_reason?: string | null
  planned_finish_date?: string | null
}

export interface CertificateBoardSummary {
  completedCount: number
  totalCount: number
  blockingCertificateType: CertificateType | null
  expectedReadyDate: string | null
  overdueCount: number
  supplementCount: number
  weeklyActionCount: number
  criticalItems: CertificateBoardCriticalItem[]
}

export interface CertificateBoardResponse {
  summary: CertificateBoardSummary
  certificates: CertificateBoardItem[]
  sharedItems: CertificateSharedRibbonItem[]
}

export interface CertificateLedgerResponse {
  items: CertificateWorkItem[]
  totals: {
    overdueCount: number
    blockedCount: number
    supplementCount: number
  }
}

export interface CertificateStatusRecord {
  id: string
  project_id: string
  target_type: CertificateDependencyTargetType
  target_id: string
  record_type: 'status_change' | 'supplement_required' | 'condition_satisfied' | 'blocked' | 'unblocked' | 'note'
  from_status?: string | null
  to_status?: string | null
  content?: string | null
  recorded_at: string
  recorded_by?: string | null
}

export interface CertificateDependencyMatrixCell {
  work_item_id: string
  work_item_name: string
  status: 'satisfied' | 'pending' | 'blocked' | 'none'
  dependency_kind?: CertificateDependencyKind | null
  is_shared: boolean
}

export interface CertificateDependencyMatrixRow {
  certificate_id: string
  certificate_type: CertificateType
  certificate_name: string
  cells: CertificateDependencyMatrixCell[]
}

export interface CertificateDetailResponse {
  certificate: CertificateBoardItem
  workItems: CertificateWorkItem[]
  dependencies: CertificateDependency[]
  records: CertificateStatusRecord[]
  dependencyMatrix: CertificateDependencyMatrixRow[]
  conditions: PreMilestoneCondition[]
  linkedWarnings: Array<Record<string, any>>
  linkedIssues: Array<Record<string, any>>
  linkedRisks: Array<Record<string, any>>
}

export interface PreMilestoneCondition {
  id: string
  pre_milestone_id: string
  condition_name: string
  condition_type: string
  description?: string
  is_satisfied: boolean
  status: '待处理' | '已满足' | '未满足' | '已确认' | string
  responsible_person?: string
  completed_by?: string | null
  confirmed_by?: string | null
  due_date?: string
  met_at?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface AIDurationEstimate {
  id: string
  task_id: string
  project_id: string
  base_duration: number
  adjusted_duration: number
  estimated_duration?: number
  confidence_level: number
  confidence_score?: number
  adjustment_factors?: any
  factors?: any
  reasoning?: string
  model_version?: string
  created_at: string
  updated_at: string
}

export interface WBSTemplate {
  id: string
  name: string
  description?: string
  project_type?: string
  building_type?: string
  template_data: any
  is_public: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

export interface Warning {
  id: string
  project_id: string
  task_id?: string
  warning_signature?: string
  warning_type: string
  warning_level: 'info' | 'warning' | 'critical'
  title: string
  description: string
  is_acknowledged: boolean
  created_at: string
  updated_at?: string
  first_seen_at?: string | null
  acknowledged_at?: string | null
  muted_until?: string | null
  escalated_to_risk_id?: string | null
  escalated_at?: string | null
  is_escalated?: boolean
  chain_id?: string | null
  status?: string | null
  resolved_source?: string | null
}

export interface Reminder {
  id: string
  project_id: string
  task_id?: string
  reminder_type: string
  reminder_level: string
  title: string
  content: string
  is_dismissed: boolean
  trigger_date: string
  created_at: string
}

export interface Notification {
  id: string
  project_id?: string | null
  type: string
  notification_type?: string | null
  severity?: string
  title: string
  content: string
  is_read: boolean
  is_broadcast?: boolean
  source_entity_type?: string | null
  source_entity_id?: string | null
  category?: string | null
  task_id?: string | null
  delay_request_id?: string | null
  recipients?: any
  risk_id?: string | null
  level?: string
  channel?: string
  status?: string
  metadata?: Record<string, unknown> | null
  chain_id?: string | null
  first_seen_at?: string | null
  acknowledged_at?: string | null
  muted_until?: string | null
  escalated_to_risk_id?: string | null
  escalated_at?: string | null
  is_escalated?: boolean | null
  resolved_at?: string | null
  resolved_source?: string | null
  created_at: string
  updated_at?: string
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

export interface TaskCompletionReport {
  id: string
  task_id: string
  project_id: string
  summary: string
  achievements?: string
  issues_encountered?: string
  lessons_learned?: string
  attachments?: any
  generated_by?: string
  generated_at: string
  created_at: string
  updated_at: string
}

export interface TaskBaseline {
  id: string
  project_id: string
  version: number
  status: 'draft' | 'confirmed' | 'closed' | 'revising' | 'pending_realign' | 'archived'
  title: string
  description?: string | null
  source_type?: 'manual' | 'current_schedule' | 'imported_file' | 'carryover'
  source_version_id?: string | null
  source_version_label?: string | null
  effective_from?: string | null
  effective_to?: string | null
  confirmed_at?: string | null
  confirmed_by?: string | null
  modified_item_count?: number
  milestone_change_count?: number
  critical_path_change_count?: number
  mapping_affected_count?: number
  created_at: string
  updated_at: string
}

export interface TaskBaselineItem {
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
  template_id?: string | null
  template_node_id?: string | null
  created_at: string
  updated_at: string
}

export interface MonthlyPlan {
  id: string
  project_id: string
  version: number
  status: 'draft' | 'confirmed' | 'closed' | 'revising' | 'pending_realign'
  month: string
  title: string
  description?: string | null
  baseline_version_id?: string | null
  source_version_id?: string | null
  source_version_label?: string | null
  closeout_at?: string | null
  carryover_item_count?: number | null
  pending_closeout_count?: number | null
  data_confidence_score?: number | null
  data_confidence_flag?: 'high' | 'medium' | 'low' | null
  data_confidence_note?: string | null
  confirmed_at?: string | null
  confirmed_by?: string | null
  created_at: string
  updated_at: string
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
  created_at: string
  updated_at: string
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
  created_at: string
  updated_at: string
}

export interface TaskProgressSnapshot {
  id: string
  task_id: string
  progress: number
  snapshot_date: string
  event_type?: string | null
  event_source?: string | null
  notes?: string
  created_by?: string
  recorded_by?: string
  status?: string
  conditions_met_count?: number
  conditions_total_count?: number
  obstacles_active_count?: number
  is_auto_generated?: boolean
  baseline_version_id?: string | null
  monthly_plan_version_id?: string | null
  baseline_item_id?: string | null
  monthly_plan_item_id?: string | null
  planning_source_type?: 'baseline' | 'monthly_plan' | 'current_schedule' | 'execution'
  planning_source_version_id?: string | null
  planning_source_item_id?: string | null
  created_at: string
}

export interface DataQualityFinding {
  id: string
  finding_key: string
  project_id: string
  task_id?: string | null
  rule_code: string
  rule_type: 'trend' | 'anomaly' | 'cross_check'
  severity: 'info' | 'warning' | 'critical'
  dimension_key?: string | null
  summary: string
  details_json?: Record<string, unknown> | null
  detected_at: string
  resolved_at?: string | null
  status: 'active' | 'resolved' | 'ignored'
}

export interface DataConfidenceSnapshot {
  id: string
  project_id: string
  period_month: string
  confidence_score: number
  timeliness_score: number
  anomaly_score: number
  consistency_score: number
  coverage_score: number
  jumpiness_score: number
  weights_json?: Record<string, number> | null
  details_json?: Record<string, unknown> | null
  computed_at: string
}

export interface ProjectDataQualitySettings {
  project_id: string
  weights_json?: Record<string, number> | null
  updated_at: string
  updated_by?: string | null
}

export interface CriticalPathOverride {
  id: string
  project_id: string
  task_id: string
  mode: 'manual_attention' | 'manual_insert'
  anchor_type?: 'before' | 'after' | 'between' | null
  left_task_id?: string | null
  right_task_id?: string | null
  reason?: string | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export interface CriticalPathOverrideInput {
  task_id: string
  mode: 'manual_attention' | 'manual_insert'
  anchor_type?: 'before' | 'after' | 'between' | null
  left_task_id?: string | null
  right_task_id?: string | null
  reason?: string | null
  created_by?: string | null
}

export interface DelayRequest {
  id: string
  project_id?: string | null
  task_id: string
  baseline_version_id?: string | null
  original_date: string
  delayed_date: string
  delay_days: number
  delay_type?: string | null
  reason: string
  delay_reason?: string | null
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  requested_by?: string | null
  requested_at?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  withdrawn_at?: string | null
  approved_by?: string | null
  approved_at?: string | null
  chain_id?: string | null
  created_at: string
  updated_at: string
}

export interface ChangeLog {
  id: string
  project_id?: string | null
  entity_type: string
  entity_id: string
  field_name: string
  old_value?: string | null
  new_value?: string | null
  change_reason?: string | null
  changed_by?: string | null
  changed_at: string
  change_source: string
}

export interface ConstructionDrawing {
  id: string
  project_id: string
  drawing_type: string           // 建筑/结构/机电/给排水/暖通/幕墙/景观/其他
  drawing_name: string
  version: string
  description?: string
  status: '编制中' | '审图中' | '已通过' | '已驳回' | '已出图' | '已作废'
  design_unit?: string
  design_person?: string
  drawing_date?: string
  review_unit?: string
  review_status: '未提交' | '审查中' | '已通过' | '已驳回' | '需修改'
  review_date?: string
  review_opinion?: string
  review_report_no?: string
  related_license_id?: string   // 关联施工许可证
  planned_submit_date?: string
  planned_pass_date?: string
  actual_submit_date?: string
  actual_pass_date?: string
  lead_unit?: string
  responsible_user_id?: string
  sort_order: number
  package_id?: string | null
  package_code?: string | null
  package_name?: string | null
  discipline_type?: string | null
  document_purpose?: string | null
  drawing_code?: string | null
  parent_drawing_id?: string | null
  version_no?: string | null
  revision_no?: string | null
  issued_for?: string | null
  effective_date?: string | null
  is_current_version?: DbBooleanLike
  requires_review?: DbBooleanLike
  review_mode?: string | null
  review_basis?: string | null
  has_change?: DbBooleanLike
  change_reason?: string | null
  schedule_impact_flag?: DbBooleanLike
  is_ready_for_construction?: DbBooleanLike
  is_ready_for_acceptance?: DbBooleanLike
  notes?: string
  created_by?: string
  lock_version: number
  created_at: string
  updated_at: string
}

export interface WeeklyDigest {
  id: string
  project_id: string
  week_start: string
  generated_at: string
  overall_progress?: number | null
  health_score?: number | null
  progress_change?: number | null
  completed_tasks_count?: number | null
  completed_milestones_count?: number | null
  critical_tasks_count?: number | null
  critical_blocked_count?: number | null
  critical_nearest_milestone?: string | null
  critical_nearest_delay_days?: number | null
  top_delayed_tasks?: Array<{ task_id: string; title: string; assignee?: string; delay_days: number }> | null
  abnormal_responsibilities?: Array<{ subject_id: string; name: string; type: string }> | null
  new_risks_count?: number | null
  new_obstacles_count?: number | null
  max_risk_level?: string | null
}

