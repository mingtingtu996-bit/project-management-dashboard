// 数据库表类型定义

import type {
  TaskDerivedStatus,
  TaskReadinessStatus,
  TaskUnifiedDueStatus,
  TaskUnifiedStatusResult,
} from '../services/taskStatusDerivationService.js'

export type TaskBusinessStatusDto = Pick<TaskDerivedStatus, 'status' | 'label'>
  & Partial<Omit<TaskDerivedStatus, 'status' | 'label'>>

export type TaskDueStatusDto = Pick<TaskUnifiedDueStatus, 'status' | 'label' | 'daysUntilDue'>
  & Partial<Omit<TaskUnifiedDueStatus, 'status' | 'label' | 'daysUntilDue'>>

export type TaskReadinessStatusDto = Pick<TaskReadinessStatus, 'ready'>
  & Partial<Omit<TaskReadinessStatus, 'ready'>>

export type TaskStatusDerivationDto = TaskUnifiedStatusResult

export interface Project {
  id: string
  name: string
  description?: string
  company_id?: string | null
  project_visibility?: 'private' | 'company_visible' | 'invite_only'
  status: '未开始' | '进行中' | '已完成' | '已暂停' | 'wizard_drafting'
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
  health_status?: '健康' | '亚健康' | '预警' | '危险' | '待完善'
  current_phase?: 'pre-construction' | 'construction' | 'completion' | 'delivery'
  construction_unlock_date?: string
  construction_unlock_by?: string
  default_wbs_generated?: boolean
  version?: number
  created_at: string
  updated_at: string
}

export const ENGINEERING_OBJECT_TYPES = [
  'phase', 'section', 'building', 'basement', 'floor', 'physical_zone', 'functional_area',
] as const

export type EngineeringObjectType = typeof ENGINEERING_OBJECT_TYPES[number]
export type EngineeringObjectDecompositionChildMode = 'by_floor' | 'by_physical_zone'
export type EngineeringObjectCoverageRole = 'exclusive_scope' | 'overlay_trigger' | 'reference_marker'
export type EngineeringObjectAreaAccountingMode = 'counted' | 'not_counted' | 'derived_from_children'

export const ENGINEERING_OBJECT_TYPE_PREFIXES = {
  phase: 'PH',
  section: 'SG',
  building: 'BD',
  basement: 'BS',
  floor: 'FL',
  physical_zone: 'PZ',
  functional_area: 'FA',
} as const satisfies Record<EngineeringObjectType, string>

export const ENGINEERING_OBJECT_VALID_CHILDREN = {
  phase: ['section', 'building', 'basement', 'physical_zone'],
  section: ['building', 'basement', 'physical_zone'],
  building: ['floor', 'physical_zone', 'functional_area'],
  basement: ['floor', 'physical_zone', 'functional_area'],
  floor: ['functional_area'],
  physical_zone: ['floor', 'functional_area'],
  functional_area: [],
} as const satisfies Record<EngineeringObjectType, readonly EngineeringObjectType[]>

export const ENGINEERING_OBJECT_DECOMPOSITION_CHILD_MODES: Partial<Record<EngineeringObjectType, EngineeringObjectDecompositionChildMode>> = {
  floor: 'by_floor',
  physical_zone: 'by_physical_zone',
}

export const ENGINEERING_OBJECT_PERSISTED_DECOMPOSITION_PARENT_TYPES = [
  'building',
  'basement',
  'physical_zone',
] as const satisfies readonly EngineeringObjectType[]

export const ENGINEERING_OBJECT_SCOPE_ARRAY_KEYS = {
  phase: 'phases',
  section: 'sections',
  building: 'buildings',
  basement: 'basements',
  floor: 'floors',
  physical_zone: 'physical_zones',
  functional_area: 'functional_areas',
} as const satisfies Record<EngineeringObjectType, string>

export const ENGINEERING_OBJECT_SCOPE_ID_KEYS = {
  phase: 'phase_object_id',
  section: 'section_object_id',
  building: 'building_object_id',
  basement: 'basement_object_id',
  floor: 'floor_object_id',
  physical_zone: 'physical_zone_object_id',
  functional_area: 'functional_area_object_id',
} as const satisfies Record<EngineeringObjectType, string>

export const PRIMARY_ENGINEERING_OBJECT_SCOPE_ID_KEY = 'engineering_object_id' as const

export const TASK_SCOPE_OBJECT_ID_KEYS = [
  PRIMARY_ENGINEERING_OBJECT_SCOPE_ID_KEY,
  ENGINEERING_OBJECT_SCOPE_ID_KEYS.phase,
  ENGINEERING_OBJECT_SCOPE_ID_KEYS.section,
  ENGINEERING_OBJECT_SCOPE_ID_KEYS.building,
  ENGINEERING_OBJECT_SCOPE_ID_KEYS.basement,
  ENGINEERING_OBJECT_SCOPE_ID_KEYS.floor,
  ENGINEERING_OBJECT_SCOPE_ID_KEYS.physical_zone,
  ENGINEERING_OBJECT_SCOPE_ID_KEYS.functional_area,
] as const

export type TaskScopeObjectIdKey = typeof TASK_SCOPE_OBJECT_ID_KEYS[number]

export const TASK_SCOPE_OBJECT_ID_KEY_BY_OBJECT_TYPE = {
  engineering_object: PRIMARY_ENGINEERING_OBJECT_SCOPE_ID_KEY,
  ...ENGINEERING_OBJECT_SCOPE_ID_KEYS,
} as const satisfies Record<EngineeringObjectType | 'engineering_object', TaskScopeObjectIdKey>

export function getEngineeringObjectDefaultCoverageRole(type: EngineeringObjectType): EngineeringObjectCoverageRole {
  return type === 'functional_area' ? 'overlay_trigger' : 'exclusive_scope'
}

export function getEngineeringObjectDefaultAreaAccountingMode(type: EngineeringObjectType): EngineeringObjectAreaAccountingMode {
  return type === 'functional_area' ? 'not_counted' : 'counted'
}

export interface EngineeringObject {
  id: string;
  project_id: string;
  object_type: EngineeringObjectType;
  object_code: string;
  object_name: string;
  parent_id: string | null;
  path: string;
  level: number;
  sort_order: number;
  status: 'active' | 'inactive';
  source_type: string;
  source_ref_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type EngineeringObjectDecompositionMode = EngineeringObjectDecompositionChildMode | 'by_functional_area' | 'none'
export type EngineeringObjectStructuralRole = 'tower' | 'podium' | 'standalone'
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
export type FunctionalAreaPartitionMode = 'spatial_partition' | 'trigger_tag'

export interface EngineeringObjectMetadata {
  coverageRole?: 'exclusive_scope' | 'overlay_trigger' | 'reference_marker'
  areaAccountingMode?: 'counted' | 'not_counted' | 'derived_from_children'
  childrenComplete?: boolean
  decompositionMode?: EngineeringObjectDecompositionMode
  structuralRole?: EngineeringObjectStructuralRole
  floorUsage?: EngineeringObjectFloorUsage
  podiumBuildingId?: string
  towerStartFloorOrder?: number
  partitionMode?: FunctionalAreaPartitionMode
  [key: string]: unknown
}

export interface RegionalClimateRule {
  id: string
  province: string
  city?: string | null
  admin_code?: string | null
  climate_region: 'north' | 'east' | 'south' | 'west' | 'default'
  thermal_zone: string
  rainy_season_months: number[]
  high_temp_months: number[]
  cold_weather_months: number[]
  typhoon_risk_level: 'none' | 'low' | 'medium' | 'high'
  flood_season_months: number[]
  winter_shutdown_risk_level: 'none' | 'low' | 'medium' | 'high'
  climate_tags: string[]
  soft_soil_level: number
  mountain_terrain: boolean
  terrain_difficulty_level: number
  seismic_intensity?: number | null
  source_standard: string
  source_version: string
  source_clause_ref: string
  evidence_sources: unknown[]
  confidence: 'high' | 'medium' | 'low'
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export interface ProjectLocationObservation {
  id: string
  project_id: string
  observed_by_user_id?: string | null
  province?: string | null
  city?: string | null
  admin_code?: string | null
  accuracy_level: 'city' | 'province' | 'region' | 'unknown'
  source: 'browser_geolocation' | 'ip_location' | 'project_location' | 'system_inference'
  confidence: 'high' | 'medium' | 'low'
  raw_source_snapshot: Record<string, unknown>
  observed_at: string
  created_at: string
}

export interface ProjectClimateProfile {
  project_id: string
  province?: string | null
  city?: string | null
  admin_code?: string | null
  climate_region: 'north' | 'east' | 'south' | 'west' | 'default'
  thermal_zone?: string | null
  climate_tags: string[]
  rainy_season_months: number[]
  high_temp_months: number[]
  cold_weather_months: number[]
  typhoon_risk_level: 'none' | 'low' | 'medium' | 'high'
  flood_season_months: number[]
  winter_shutdown_risk_level: 'none' | 'low' | 'medium' | 'high'
  soft_soil_level: number
  mountain_terrain: boolean
  terrain_difficulty_level: number
  seismic_intensity?: number | null
  confidence: 'high' | 'medium' | 'low'
  location_consensus_status: 'city_consensus' | 'province_consensus' | 'single_observation' | 'project_location_fallback' | 'default_fallback' | 'conflict'
  observation_count: number
  distinct_user_count: number
  source: 'multi_user_location' | 'single_user_location' | 'project_location' | 'ip_location' | 'default'
  source_rule_id?: string | null
  weather_provider?: string | null
  last_weather_synced_at?: string | null
  metadata: Record<string, unknown>
  resolved_at: string
  created_at: string
  updated_at: string
}

export interface ProjectWeatherForecast {
  id: string
  project_id: string
  forecast_city?: string | null
  forecast_admin_code?: string | null
  forecast_date: string
  min_temp_c?: number | null
  max_temp_c?: number | null
  precipitation_mm?: number | null
  relative_humidity_percent?: number | null
  snow_depth_cm?: number | null
  wind_level?: string | null
  warning_tags: string[]
  provider: string
  provider_record_id?: string | null
  source_url?: string | null
  raw_payload: Record<string, unknown>
  fetched_at: string
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  project_id: string
  title: string
  description?: string
  status: 'todo' | 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'
  // v1.4.5 status DTO flat fields (server-computed, not for client input)
  statusDomain?: string
  statusKey?: string
  statusLabel?: string
  visualTone?: 'green' | 'blue' | 'amber' | 'red' | 'slate'
  semanticTone?: string
  dictionaryVersion?: string
  businessStatus?: TaskBusinessStatusDto
  displayStatus?: string
  statusDerivation?: TaskStatusDerivationDto
  dueStatus?: TaskDueStatusDto
  readiness_status?: TaskReadinessStatusDto
  priority: 'low' | 'medium' | 'high' | 'critical'
  start_date?: string
  end_date?: string
  planned_start_date?: string
  planned_end_date?: string
  actual_start_date?: string
  actual_end_date?: string
  progress: number
  assignee?: string
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
  task_source?: 'ad_hoc' | 'baseline' | 'monthly_plan' | 'execution' | string | null
  // 2026-03-29 迁移 019 新增字段
  is_critical?: boolean          // 关键路径标记
  parent_id?: string | null      // WBS 父节点（自引用）
  specialty_type?: string | null // 专项工程分类
  duration_calibration_source?: string | null
  duration_provenance?: string | null
  first_progress_at?: string | null  // 首次填报时间
  delay_reason?: string | null   // 延期原因
  lagLevel?: 'none' | 'mild' | 'moderate' | 'severe'
  lagStatus?: string | null
  assignee_user_id?: string | null
  assignee_name?: string
  baseline_item_id?: string | null
  baseline_start?: string | null
  baseline_end?: string | null
  baseline_is_critical?: boolean | null
  total_float_days?: number | null
  free_float_days?: number | null
  successor_count?: number | null
  milestone_distance_days?: number | null
  downstream_milestone_distance_days?: number | null
  criticality_weight?: number | null
  monthly_plan_item_id?: string | null
  participant_unit_id?: string | null
  participant_unit_name?: string | null
  template_id?: string | null
  template_node_id?: string | null
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
  is_historical?: boolean | null
  duration_contribution_mode?: string | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  // v1.4.3 task standard fields
  task_code?: string | null
  task_code_version?: string | null
  task_code_rule_id?: string | null
  task_code_generated_at?: string | null
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
  standard_task_metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
  updated_by?: string
  version: number
}

// v1.4.2 Engineering category (WBS work classification)
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
  created_at: string
  updated_at: string
}

// v1.4.3 Task dependency
export interface TaskDependency {
  id: string
  project_id: string
  task_id: string
  dependency_task_id: string
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF'
  lag_days: number
  required_for_start: boolean
  source_type: string
  source_ref_id?: string | null
  created_at: string
  updated_at: string
}

export type RiskIssueClosureResultCode =
  | 'resolved'
  | 'mitigated'
  | 'transferred'
  | 'accepted'
  | 'duplicate'
  | 'invalidated'
  | 'retention_close'
  | 'legacy_close'

export type RiskIssueClosureEffectiveness =
  | 'resolved'
  | 'partially_resolved'
  | 'transferred'
  | 'accepted'
  | 'undetermined'

export interface RiskIssueClosureOutcomeFields {
  closure_result_code?: RiskIssueClosureResultCode | null
  closure_result_summary?: string | null
  closure_effectiveness?: RiskIssueClosureEffectiveness | null
  closure_evidence_refs?: string[]
  closure_cause_attribution_id?: string | null
  closed_by?: string | null
  closure_recorded_at?: string | null
}

export interface Risk extends RiskIssueClosureOutcomeFields {
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
export interface Issue extends RiskIssueClosureOutcomeFields {
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
  title: string
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
  unit_status?: 'active' | 'disabled' | 'archived' | string
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

export type ScopeDimensionKey = EngineeringObjectType

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
  permission_level: 'owner' | 'editor'
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
  invitation_code: string
  permission_level: 'editor'
  is_revoked: boolean
  used_count: number
  max_uses?: number | null
  expires_at?: string | null
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
  expected_resolution_date?: string
  estimated_resolve_date?: string
  resolution_notes?: string
  resolved_at?: string
  severity_escalated_at?: string | null
  severity_manually_overridden?: boolean | null
  created_at: string
  updated_at: string
}

export interface AcceptancePlan {
  id: string
  project_id: string
  covered_task_ids?: string[]
  plan_name?: string | null
  acceptance_name?: string
  acceptance_type?: string | null
  building_id?: string | null
  building_object_id?: string | null
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
  impact_signals?: Array<Record<string, unknown>> | null
  is_custom?: boolean | null
  responsible_user_id?: string | null
  responsible_person?: string
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

export interface WBSTemplate {
  id: string
  company_id?: string | null
  project_id?: string | null
  name: string
  description?: string
  project_type?: string
  building_type?: string
  catalog_scope?: string | null
  standard_catalog_code?: string | null
  template_data: any
  is_public: boolean
  is_builtin?: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

export interface Warning {
  id: string
  project_id: string
  task_id?: string
  source_entity_type?: string | null
  source_entity_id?: string | null
  metadata?: Record<string, unknown> | null
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
  company_id?: string | null
  project_id?: string | null
  user_id?: string | null
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
  warning_lifecycle_status?: string | null
  warning_signature?: string | null
  source_hash?: string | null
  is_system?: boolean | null
  // v1.4.13: notification lifecycle + touchpoint + dedupe fields
  lifecycle_status?: string | null
  touchpoint_type?: string | null
  scope_type?: string | null
  dedupe_key?: string | null
  target_route?: string | null
  target_label?: string | null
  action_due_at?: string | null
  expires_at?: string | null
  reconciled_at?: string | null
  reconciliation_source_status?: string | null
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
    | 'closeout_owner_attention'
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
  version: number | null
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
  governance_metadata?: Record<string, unknown> | null
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
  engineering_category_id?: string | null
  engineering_category_type?: string | null
  engineering_category_name?: string | null
  wbs_node_type?: string | null
  wbs_path?: string | null
  is_wbs_summary?: boolean | null
  is_executable?: boolean | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  scope_snapshot?: Record<string, unknown> | null
  wbs_snapshot?: Record<string, unknown> | null
  task_fact_snapshot?: Record<string, unknown> | null
  task_code_snapshot?: string | null
  status_snapshot?: Record<string, unknown> | null
  seed_versions?: Array<Record<string, unknown>> | null
  snapshot_source?: 'current_execution_fact' | 'baseline_commitment_snapshot' | 'monthly_commitment_snapshot' | string | null
  snapshot_captured_at?: string | null
  source_chip?: 'rolling_in' | 'baseline' | 'site' | 'new' | null
  source_reason?: string | null
  missing_process_in_baseline?: boolean | null
  duration_calibration_source?: string | null
  duration_provenance?: string | null
  manual_override_fields?: Record<string, boolean> | null
  generation_metadata?: any
  last_generated_at?: string | null
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
  source_mode?: 'baseline' | 'schedule' | 'mixed' | 'manual' | 'imported' | null
  temporary_without_baseline?: boolean | null
  generation_cutoff_at?: string | null
  confirmed_snapshot_at?: string | null
  governance_metadata?: Record<string, unknown> | null
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
  engineering_category_id?: string | null
  engineering_category_type?: string | null
  engineering_category_name?: string | null
  wbs_node_type?: string | null
  wbs_path?: string | null
  is_wbs_summary?: boolean | null
  is_executable?: boolean | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  scope_snapshot?: Record<string, unknown> | null
  wbs_snapshot?: Record<string, unknown> | null
  task_fact_snapshot?: Record<string, unknown> | null
  task_code_snapshot?: string | null
  status_snapshot?: Record<string, unknown> | null
  seed_versions?: Array<Record<string, unknown>> | null
  snapshot_source?: 'current_execution_fact' | 'baseline_commitment_snapshot' | 'monthly_commitment_snapshot' | string | null
  snapshot_captured_at?: string | null
  source_chip?: 'rolling_in' | 'baseline' | 'site' | 'new' | null
  source_reason?: string | null
  missing_process_in_baseline?: boolean | null
  duration_calibration_source?: string | null
  duration_provenance?: string | null
  manual_override_fields?: Record<string, boolean> | null
  generation_metadata?: any
  last_generated_at?: string | null
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
  source_confidence?: 'high' | 'medium' | 'low' | 'unknown' | string | null
  confirmation_status?: 'unconfirmed' | 'confirmed' | 'acknowledged' | 'verified' | string | null
  confirmed_at?: string | null
  confirmed_by?: string | null
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
  rule_type: string // v1.4.16: widened to allow new types
  severity: 'info' | 'warning' | 'critical'
  dimension_key?: string | null
  summary: string
  details_json?: Record<string, unknown> | null
  detected_at: string
  resolved_at?: string | null
  status: 'active' | 'resolved' | 'ignored' | 'auto_resolved'
  // v1.4.16: new fields
  entity_type?: string | null
  entity_id?: string | null
  quality_dimension?: string | null
  confidence_impact?: number | null
  source_type?: string | null
  resolved_type?: string | null
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
  // v1.4.16: extended dimensions
  completeness_score?: number | null
  accuracy_score?: number | null
  lineage_score?: number | null
  governance_score?: number | null
  extended_dimensions?: Record<string, number> | null
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
  // v1.4.14: new standardized fields
  action_type?: string | null
  action_group?: string | null
  request_id?: string | null
  before_snapshot?: Record<string, unknown> | null
  after_snapshot?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  visibility?: string
  retention_policy?: string
}

export interface RetentionEvent {
  id: string
  project_id?: string | null
  entity_type: string
  entity_id: string
  requested_action: string
  resolved_action: string
  decision_reason?: string | null
  reference_summary?: Record<string, unknown>
  change_summary?: Record<string, unknown>
  resolved_by?: string | null
  resolved_at: string
  created_at: string
  metadata?: Record<string, unknown>
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
