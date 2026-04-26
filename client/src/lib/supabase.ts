import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 类型定义 - 与数据库表结构匹配
export interface User {
  id: string
  username?: string
  email?: string | null
  role?: string
  global_role?: 'company_admin' | 'regular'
  device_id?: string
  display_name?: string
  avatar_url?: string
  joined_at?: string
  last_active?: string
}

export interface Project {
  id?: string
  name?: string
  description?: string
  status?: string
  location?: string
  start_date?: string
  end_date?: string
  owner_id?: string
  created_at?: string
  updated_at?: string
  version?: number
  primary_invitation_code?: string
  created_by?: string
  // 项目信息扩展字段（V4 设计文档，17个字段）
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
  total_investment?: number
  health_score?: number
  health_status?: string
  current_phase?: string
}

export interface Task {
  id?: string
  project_id?: string
  name?: string
  title?: string
  description?: string
  status?: string
  priority?: string
  start_date?: string | null
  end_date?: string | null
  // 日期字段别名（数据库中也存储，Reports.tsx 等使用）
  planned_start_date?: string | null
  planned_end_date?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
  progress?: number
  dependencies?: string[]
  assignee_id?: string
  assignee_user_id?: string | null
  assignee?: string
  assignee_unit?: string
  assignee_name?: string
  responsible_unit?: string
  created_at?: string
  updated_at?: string
  version?: number
  is_milestone?: boolean
  milestone_level?: number
  milestone_order?: number
  is_critical?: boolean
  baseline_start?: string | null
  baseline_end?: string | null
  baseline_is_critical?: boolean | null
  baseline_item_id?: string | null
  monthly_plan_item_id?: string | null
  task_source?: 'ad_hoc' | 'baseline' | 'monthly_plan' | 'execution' | string | null
  parent_id?: string | null
  milestone_id?: string | null
  sort_order?: number
  wbs_code?: string
  wbs_level?: number
  updated_by?: string
  ai_duration?: number | null
  first_progress_at?: string | null
  // 2026-03-29 新增字段（数据库迁移 019）
  specialty_type?: string | null   // 专项工程分类（#12 筛选）
  reference_duration?: number | null  // 参考/计划工期（天）（#7 工期对比）
  delay_reason?: string | null     // 延期原因
  lagLevel?: 'none' | 'mild' | 'moderate' | 'severe'
  lagStatus?: '正常' | '轻度滞后' | '中度滞后' | '严重滞后'
}

export interface Risk {
  id?: string
  project_id?: string
  title?: string
  description?: string
  level?: string
  status?: string
  probability?: number
  impact?: number
  mitigation?: string
  owner_id?: string
  created_at?: string
  updated_at?: string
  version?: number
  task_id?: string
  // 扩展字段
  risk_category?: string
  assignee?: string
  risk_source?: string
  detection_method?: string
  response_plan?: string
  contingency_plan?: string
  // 来源追踪字段（10.1 前置迁移）
  source_type?: 'manual' | 'warning_converted' | 'warning_auto_escalated' | 'source_deleted'
  source_id?: string | null
  chain_id?: string | null
  pending_manual_close?: boolean
  linked_issue_id?: string | null
  closed_reason?: string | null
  closed_at?: string | null
  // mitigation_plan 已废弃（§1.2）
}

/** 独立问题域（§六 issues 表，10.1 建立基础模型） */
export interface Issue {
  id?: string
  project_id?: string
  task_id?: string | null
  title?: string
  description?: string | null
  source_type?: 'manual' | 'risk_converted' | 'risk_auto_escalated' | 'obstacle_escalated' | 'condition_expired' | 'source_deleted'
  source_id?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
  chain_id?: string | null
  severity?: 'critical' | 'high' | 'medium' | 'low'
  priority?: number
  pending_manual_close?: boolean
  status?: 'open' | 'investigating' | 'resolved' | 'closed'
  closed_reason?: string | null
  closed_at?: string | null
  created_at?: string
  updated_at?: string
  version?: number
}

/**
 * @deprecated 旧版独立里程碑表结构。
 * 新方案：里程碑从 tasks 表中通过 is_milestone=true 标记，
 * 使用 milestone_level（1/2/3）和 milestone_order 字段管理层级。
 * 参见 Milestones.tsx 中的 MilestoneTask 接口。
 * 此接口保留用于后端 storageService / localDb 的历史兼容，新代码禁止使用。
 */
export interface Milestone {
  id?: string
  project_id?: string
  name?: string
  title?: string
  description?: string
  target_date?: string
  completed_at?: string
  status?: string
  created_at?: string
  updated_at?: string
  version?: number
  related_task_ids?: string[]
  // Dashboard.tsx 使用的扩展字段
  assignee?: string
  owner?: string
  related_tasks?: number
  task_count?: number
  actual_date?: string
  planned_end_date?: string
}

export interface Invitation {
  id?: string
  project_id?: string
  projectId?: string
  invite_code?: string
  invitation_code?: string
  role?: string
  permission_level?: string
  permissionLevel?: string
  max_uses?: number
  maxUses?: number | null
  used_count?: number
  usedCount?: number
  expires_at?: string
  expiresAt?: string | null
  created_at?: string
  createdAt?: string | null
  created_by?: string
  is_revoked?: boolean
  isRevoked?: boolean
  is_active?: boolean
}

export interface ProjectMember {
  id?: string
  project_id?: string
  projectId?: string
  user_id?: string
  userId?: string
  role?: string
  permission_level?: string
  permissionLevel?: string
  username?: string
  displayName?: string
  email?: string | null
  globalRole?: 'company_admin' | 'regular'
  joined_at?: string
  joinedAt?: string
  invitation_code_id?: string
  last_activity?: string
  lastActivity?: string
  is_active?: boolean
}

// Phase 1 新增类型 - 卡点管理相关
export interface TaskCondition {
  id?: string
  task_id?: string
  condition_type?: '图纸' | '材料' | '人员' | '设备' | '其他'
  condition_name?: string
  name?: string
  description?: string
  status?: '未满足' | '已满足' | '已确认'
  is_satisfied?: boolean
  satisfied_reason?: string | null
  target_date?: string | null
  attachments?: any[]
  confirmed_by?: string
  confirmed_at?: string
  created_by?: string
  created_at?: string
  updated_at?: string
}

export interface TaskObstacle {
  id?: string
  task_id?: string
  obstacle_type?: '人员' | '材料' | '设备' | '环境' | '设计' | '其他'
  title?: string
  description?: string
  severity?: '低' | '中' | '高' | '严重'
  status?: '待处理' | '处理中' | '已解决'
  is_resolved?: boolean
  // '无法解决' 已废弃（§2.2），阻碍上卷改为创建 issue(source_type: obstacle_escalated)
  resolution?: string
  resolution_notes?: string | null
  expected_resolution_date?: string | null
  related_risk_id?: string | null
  resolved_by?: string
  resolved_at?: string
  severity_escalated_at?: string | null
  severity_manually_overridden?: boolean | null
  created_by?: string
  created_at?: string
  updated_at?: string
}

export interface TaskDelayHistory {
  id?: string
  task_id?: string
  project_id?: string
  original_date?: string
  original_end_date?: string
  delayed_date?: string
  new_end_date?: string
  delay_days?: number
  reason?: string
  approved_by?: string
  approved_at?: string
  created_by?: string
  created_at?: string
}

export interface DelayRequest {
  id?: string
  task_id?: string
  project_id?: string | null
  baseline_version_id?: string | null
  original_date?: string | null
  delayed_date?: string | null
  delay_days?: number | null
  reason?: string | null
  delay_reason?: string | null
  status?: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  requested_by?: string | null
  requested_at?: string | null
  reviewed_at?: string | null
  withdrawn_at?: string | null
  chain_id?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface ChangeLogRecord {
  id?: string
  project_id?: string | null
  entity_type?: string
  entity_id?: string
  field_name?: string
  old_value?: string | number | boolean | null
  new_value?: string | number | boolean | null
  change_reason?: string | null
  changed_by?: string | null
  change_source?: string | null
  changed_at?: string | null
}

export interface TaskProgressSnapshot {
  id?: string
  task_id?: string
  project_id?: string
  recorded_at?: string | null
  progress?: number | null
  status?: string | null
  condition_count?: number | null
  satisfied_condition_count?: number | null
  active_obstacle_count?: number | null
  risk_count?: number | null
  issue_count?: number | null
  payload?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
}

export interface AcceptancePlan {
  id?: string
  project_id?: string
  task_id?: string
  acceptance_type?: '分项' | '分部' | '竣工' | '消防' | '环保' | '规划' | '节能' | '智能' | '其他'
  acceptance_name?: string
  planned_date?: string
  actual_date?: string
  status?: 'draft' | 'preparing' | 'ready_to_submit' | 'submitted' | 'inspecting' | 'rectifying' | 'passed' | 'archived'
  parallel_group_id?: string | null
  documents?: any[]
  notes?: string
  created_by?: string
  created_at?: string
  updated_at?: string
}

export interface WbsTemplate {
  id?: string
  template_name?: string
  template_type?: '住宅' | '商业' | '工业' | '公共建筑' | '市政'
  description?: string
  wbs_nodes?: any[]
  is_default?: boolean
  created_by?: string
  created_at?: string
  updated_at?: string
}

export interface PreMilestone {
  id?: string
  project_id?: string
  milestone_type?: string
  milestone_name?: string
  certificate_type?: string
  certificate_name?: string
  application_date?: string
  issue_date?: string
  expiry_date?: string
  status?:
    | 'pending'
    | 'preparing_documents'
    | 'internal_review'
    | 'external_submission'
    | 'supplement_required'
    | 'approved'
    | 'issued'
    | 'expired'
    | 'voided'
  certificate_no?: string
  current_stage?: string
  planned_finish_date?: string
  actual_finish_date?: string
  approving_authority?: string
  next_action?: string
  next_action_due_date?: string
  is_blocked?: boolean
  block_reason?: string
  latest_record_at?: string
  notes?: string
  created_by?: string
  created_at?: string
  updated_at?: string
}







