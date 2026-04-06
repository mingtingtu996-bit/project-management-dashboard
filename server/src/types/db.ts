// 数据库表类型定义

export interface Project {
  id: string
  name: string
  description?: string
  status: '未开始' | '进行中' | '已完成' | '已暂停'
  primary_invitation_code?: string
  project_type?: string
  building_type?: string
  structure_type?: string
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
  planned_end_date?: string
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
  // 2026-03-29 迁移 019 新增字段
  is_critical?: boolean          // 关键路径标记
  parent_id?: string | null      // WBS 父节点（自引用）
  specialty_type?: string | null // 专项工程分类
  reference_duration?: number | null // 参考工期（天）
  ai_duration?: number | null    // AI 推荐工期（天）
  first_progress_at?: string | null  // 首次填报时间
  delay_reason?: string | null   // 延期原因
  assignee_name?: string
  responsible_unit?: string
  created_at: string
  updated_at: string
  version: number
}

export interface Risk {
  id: string
  project_id: string
  task_id?: string
  title: string
  description?: string
  category: 'schedule' | 'budget' | 'resource' | 'technical' | 'external'
  level?: 'critical' | 'high' | 'medium' | 'low'
  probability: number
  impact: number
  status: 'identified' | 'mitigating' | 'occurred' | 'closed'
  mitigation_plan?: string
  created_at: string
  updated_at: string
  version: number
}

export interface Milestone {
  id: string
  project_id: string
  name: string
  description?: string
  target_date: string
  status: 'pending' | 'in_progress' | 'completed' | 'overdue'
  completion_rate: number
  created_at: string
  updated_at: string
  version: number
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: 'owner' | 'admin' | 'editor' | 'viewer'
  display_name?: string
  joined_at: string
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
  condition_name: string
  condition_type: string
  description?: string
  is_satisfied: boolean
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
  created_at: string
  updated_at: string
}

export interface AcceptancePlan {
  id: string
  task_id: string
  project_id: string
  plan_name: string
  acceptance_name?: string   // alias for plan_name (legacy field)
  acceptance_type: string
  description?: string
  planned_date?: string
  actual_date?: string
  status: 'pending' | 'in_progress' | 'passed' | 'failed'
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
  status: 'pending' | 'in_progress' | 'passed' | 'failed'
  result?: any
  documents?: any
  inspector?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface PreMilestone {
  id: string
  project_id: string
  milestone_name: string
  milestone_type: string
  description?: string
  planned_date?: string
  actual_date?: string
  application_date?: string
  issue_date?: string
  expiry_date?: string
  status: 'pending' | 'in_progress' | 'completed' | 'overdue' | 'expired'
  responsible_person?: string
  responsible_unit?: string
  issuing_authority?: string
  certificate_no?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface PreMilestoneCondition {
  id: string
  pre_milestone_id: string
  condition_name: string
  condition_type: string
  description?: string
  is_satisfied: boolean
  responsible_person?: string
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
  warning_type: string
  warning_level: 'info' | 'warning' | 'critical'
  title: string
  description: string
  is_acknowledged: boolean
  created_at: string
  updated_at?: string
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
  project_id: string
  type: string
  severity?: string
  title: string
  content: string
  is_read: boolean
  is_broadcast?: boolean
  source_entity_type?: string
  source_entity_id?: string
  recipients?: any
  risk_id?: string
  level?: string
  channel?: string
  status?: string
  created_at: string
  updated_at?: string
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

export interface TaskProgressSnapshot {
  id: string
  task_id: string
  progress: number
  snapshot_date: string
  notes?: string
  created_by?: string
  created_at: string
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
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
}
