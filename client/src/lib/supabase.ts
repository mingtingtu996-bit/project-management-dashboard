import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 类型定义 - 与数据库表结构匹配

// v1.4 Engineering objects master data
export const ENGINEERING_OBJECT_TYPES = [
  'phase', 'section', 'building', 'basement', 'floor', 'physical_zone', 'functional_area',
] as const

export type EngineeringObjectType = typeof ENGINEERING_OBJECT_TYPES[number]

export type EngineeringObjectFloorUsage =
  | 'standard'
  | 'ground_pilotis'
  | 'refuge'
  | 'mechanical'
  | 'transfer'
  | 'roof'
  | 'mezzanine'
  | 'podium_roof'
  | 'canopy'

export interface EngineeringObjectMetadata {
  floorUsage?: EngineeringObjectFloorUsage
  [key: string]: unknown
}

export interface EngineeringObject {
  id: string;
  projectId: string;
  objectType: EngineeringObjectType;
  objectCode: string;
  objectName: string;
  parentId: string | null;
  path: string;
  level: number;
  sortOrder: number;
  status: 'active' | 'inactive';
  metadata: EngineeringObjectMetadata;
}

export interface User {
  id: string
  username?: string
  email?: string | null
  global_role?: 'company_admin' | 'regular'
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
  metadata?: Record<string, unknown> | null
}

export type TaskStatusAxisEvidence = {
  ruleVersion?: string | null
  ruleKey?: string | null
  ruleSource?: string | null
  sourceFields?: string[]
  [key: string]: unknown
}

export type TaskDerivedStatusDto = {
  status?: string | null
  label?: string | null
  reason?: string | null
  evidence?: TaskStatusAxisEvidence | null
  sourceFields?: string[]
}

export type TaskDueStatusDto = TaskDerivedStatusDto & {
  status?: 'normal' | 'approaching' | 'urgent' | 'overdue' | string | null
  daysUntilDue?: number | null
}

export type TaskReadinessStatusDto = {
  ready?: boolean | null
  dependencyStatus?: string | null
  conditionStatus?: string | null
  obstacleStatus?: string | null
  progressImpactLevel?: string | null
  blockedForProgress?: boolean | null
  summary?: unknown
  evidence?: TaskStatusAxisEvidence | null
}

export type TaskStatusDerivationDto = {
  lifecycleStatus?: string | null
  businessStatus?: TaskDerivedStatusDto | null
  displayStatus?: string | null
  dueStatus?: TaskDueStatusDto | null
  lagLevel?: 'none' | 'mild' | 'moderate' | 'severe' | string | null
  lagStatus?: string | null
  lagStatusEvidence?: TaskStatusAxisEvidence | null
  readinessStatus?: TaskReadinessStatusDto | null
  ruleVersion?: string | null
}

export interface Task {
  id?: string
  project_id?: string
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
  assignee_name?: string
  participant_unit_id?: string | null
  participant_unit_name?: string | null
  created_at?: string
  updated_at?: string
  version?: number
  is_milestone?: boolean
  milestone_level?: number
  milestone_order?: number
  is_critical?: boolean
  total_float_days?: number | string | null
  free_float_days?: number | string | null
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
  first_progress_at?: string | null
  // 2026-03-29 新增字段（数据库迁移 019）
  specialty_type?: string | null   // 专项工程分类（#12 筛选）
  delay_days?: number | string | null
  delay_reason?: string | null     // 延期原因
  lagLevel?: 'none' | 'mild' | 'moderate' | 'severe'
  lagStatus?: '正常' | '轻度滞后' | '中度滞后' | '严重滞后'
  // v1.4.5 status DTO flat fields (backend-computed)
  statusDomain?: string
  statusKey?: string
  statusLabel?: string
  visualTone?: string
  semanticTone?: string
  dictionaryVersion?: string
  businessStatus?: TaskDerivedStatusDto | null
  displayStatus?: string
  dueStatus?: TaskDueStatusDto | null
  statusDerivation?: TaskStatusDerivationDto | null
  // v1.4.1 engineering object references (7 scope dimensions)
  engineering_object_id?: string | null
  phase_object_id?: string | null
  section_object_id?: string | null
  building_object_id?: string | null
  basement_object_id?: string | null
  floor_object_id?: string | null
  physical_zone_object_id?: string | null
  functional_area_object_id?: string | null
  // v1.4.2 WBS semantic fields
  engineering_category_id?: string | null
  engineering_category_type?: string | null
  engineering_category_name?: string | null
  wbs_node_type?: string | null
  wbs_path?: string | null
  is_leaf?: boolean | null
  is_wbs_summary?: boolean | null
  is_executable?: boolean | null
  template_node_id?: string | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  // v1.4.3 task standard fields
  progress_method?: string
  planned_quantity?: number | null
  completed_quantity?: number | null
  quantity_unit?: string | null
  progress_weight?: number
  completion_rule?: string
  drawing_required?: boolean
  material_required?: boolean
  acceptance_required?: boolean
  quality_required?: boolean
  standard_task_metadata?: Record<string, unknown> | null
  duration_risk_p20_days?: number | null
  duration_risk_p50_days?: number | null
  duration_risk_p80_days?: number | null
  duration_risk_range?: ({
    p20_days?: number | null
    p50_days?: number | null
    p80_days?: number | null
    p20Days?: number | null
    p50Days?: number | null
    p80Days?: number | null
  } & Record<string, unknown>) | null
}

// v1.4.2 Engineering category
export interface EngineeringCategory {
  id: string
  project_id?: string | null
  parent_id?: string | null
  category_name: string
  category_type: 'division' | 'sub_division' | 'item_work' | 'process' | 'activity_step' | 'custom'
  category_level: number
  category_path: string
  sort_order: number
  enabled: boolean
  metadata: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

// v1.4.3 Task dependency
export interface TaskDependency {
  id?: string
  project_id: string
  task_id: string
  dependency_task_id: string
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF'
  lag_days: number
  required_for_start: boolean
  source_type: string
  source_ref_id?: string | null
  created_at?: string
  updated_at?: string
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

export type Milestone = Task

export interface Invitation {
  id?: string
  project_id?: string
  projectId?: string
  invitation_code?: string
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
  building_id?: string | null
  building_object_id?: string | null
  documents?: any[]
  notes?: string
  created_by?: string
  created_at?: string
  updated_at?: string
}

export interface ProjectMaterial {
  id?: string
  project_id?: string
  participant_unit_id?: string | null
  material_name?: string
  specialty_type?: string | null
  requires_sample_confirmation?: boolean
  sample_confirmed?: boolean
  expected_arrival_date?: string
  actual_arrival_date?: string | null
  requires_inspection?: boolean
  inspection_done?: boolean
  version?: number
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
