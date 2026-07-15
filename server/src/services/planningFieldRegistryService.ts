// v1.4.7.6: backend-owned field registry for shared planning tree surfaces.
import type { PlanningSurface } from '../types/planningTable.js'

export type { PlanningSurface } from '../types/planningTable.js'

export const PLANNING_FIELD_REGISTRY_VERSION = 'v1.4.7.6'

export type PlanningFieldDataType = 'text' | 'number' | 'date' | 'percent' | 'enum' | 'lookup' | 'boolean'
export type PlanningLookupSource = 'participant_units' | 'engineering_objects' | 'tasks' | 'dictionary'
export type PlanningFieldFormatter = 'tabular_num' | 'date_short' | 'percent_int' | 'wbs_label'
export type PlanningFieldEditableWhen = 'always' | 'unconfirmed' | 'unpublished' | 'never'
export type PlanningFieldDisplayGroup =
  | 'basic_plan' | 'progress_fact' | 'engineering_object' | 'engineering_category'
  | 'responsibility' | 'node_control' | 'dependency' | 'acceptance_impact'
  | 'quality_hint' | 'template_source'
export type PlanningFieldMergeGroup =
  | 'identity' | 'schedule' | 'progress_status' | 'assignee' | 'participant_unit'
  | 'structure' | 'node_control' | 'engineering_object' | 'engineering_category'
  | 'dependency' | 'readonly_derived'

export interface PlanningFieldValidator {
  type: string
  params?: Record<string, unknown>
  severity?: 'block_save' | 'confirm' | 'hint'
}

export interface PlanningFieldDefinition {
  key: string
  group: PlanningFieldDisplayGroup
  displayGroup: PlanningFieldDisplayGroup
  mergeGroup: PlanningFieldMergeGroup
  label: string
  dataType: PlanningFieldDataType
  lookupSource?: PlanningLookupSource
  editableIn: PlanningSurface[]
  editableWhen?: PlanningFieldEditableWhen
  defaultVisibleIn: PlanningSurface[]
  requiredIn?: PlanningSurface[]
  formatter?: PlanningFieldFormatter
  validators?: PlanningFieldValidator[]
  readonlyReasonCode?: string
  surfaceLabel?: Partial<Record<PlanningSurface, string>>
}

export interface PlanningFieldGroupDefinition {
  key: PlanningFieldDisplayGroup
  label: string
  sortOrder: number
}

export const PLANNING_FIELD_GROUPS: PlanningFieldGroupDefinition[] = [
  { key: 'basic_plan', label: '计划基础', sortOrder: 10 },
  { key: 'progress_fact', label: '进度事实', sortOrder: 20 },
  { key: 'engineering_object', label: '工程对象', sortOrder: 30 },
  { key: 'engineering_category', label: '工程分类', sortOrder: 40 },
  { key: 'responsibility', label: '责任主体', sortOrder: 50 },
  { key: 'node_control', label: '节点控制', sortOrder: 60 },
  { key: 'dependency', label: '前置关系', sortOrder: 70 },
  { key: 'acceptance_impact', label: '验收影响', sortOrder: 80 },
  { key: 'quality_hint', label: '校核提示', sortOrder: 90 },
  { key: 'template_source', label: '模板来源', sortOrder: 100 },
]

export const PLANNING_FIELD_REGISTRY: PlanningFieldDefinition[] = [
  {
    key: 'title',
    group: 'basic_plan',
    displayGroup: 'basic_plan',
    mergeGroup: 'identity',
    label: '任务名称',
    dataType: 'text',
    editableIn: ['baseline', 'monthly_plan', 'task_list'],
    editableWhen: 'always',
    defaultVisibleIn: ['baseline', 'monthly_plan', 'task_list'],
    requiredIn: ['baseline', 'monthly_plan', 'task_list'],
    validators: [{ type: 'required', severity: 'block_save' }],
  },
  {
    key: 'planned_start_date',
    group: 'basic_plan',
    displayGroup: 'basic_plan',
    mergeGroup: 'schedule',
    label: '计划开始',
    dataType: 'date',
    editableIn: ['baseline', 'monthly_plan', 'task_list'],
    editableWhen: 'always',
    defaultVisibleIn: ['baseline', 'monthly_plan', 'task_list'],
    requiredIn: ['baseline', 'monthly_plan', 'task_list'],
    formatter: 'date_short',
    validators: [{ type: 'required_for_executable', severity: 'block_save' }],
  },
  {
    key: 'planned_end_date',
    group: 'basic_plan',
    displayGroup: 'basic_plan',
    mergeGroup: 'schedule',
    label: '计划完成',
    dataType: 'date',
    editableIn: ['baseline', 'monthly_plan', 'task_list'],
    editableWhen: 'always',
    defaultVisibleIn: ['baseline', 'monthly_plan', 'task_list'],
    requiredIn: ['baseline', 'monthly_plan', 'task_list'],
    formatter: 'date_short',
    validators: [
      { type: 'required_for_executable', severity: 'block_save' },
      { type: 'date_after', params: { afterField: 'planned_start_date' }, severity: 'block_save' },
    ],
  },
  {
    key: 'duration',
    group: 'basic_plan',
    displayGroup: 'basic_plan',
    mergeGroup: 'schedule',
    label: '工期(天)',
    dataType: 'number',
    editableIn: [],
    defaultVisibleIn: ['baseline'],
    readonlyReasonCode: 'system_derived',
  },
  {
    key: 'progress',
    group: 'progress_fact',
    displayGroup: 'progress_fact',
    mergeGroup: 'progress_status',
    label: '进度',
    dataType: 'percent',
    editableIn: ['task_list'],
    editableWhen: 'always',
    defaultVisibleIn: ['task_list'],
    formatter: 'percent_int',
    validators: [{ type: 'range', params: { min: 0, max: 100 }, severity: 'block_save' }],
    surfaceLabel: { monthly_plan: '目标进度' },
  },
  {
    key: 'status',
    group: 'progress_fact',
    displayGroup: 'progress_fact',
    mergeGroup: 'progress_status',
    label: '状态',
    dataType: 'enum',
    lookupSource: 'dictionary',
    editableIn: ['task_list'],
    editableWhen: 'always',
    defaultVisibleIn: ['task_list'],
  },
  {
    key: 'target_progress',
    group: 'progress_fact',
    displayGroup: 'progress_fact',
    mergeGroup: 'progress_status',
    label: '目标进度',
    dataType: 'percent',
    editableIn: ['baseline', 'monthly_plan'],
    editableWhen: 'always',
    defaultVisibleIn: ['monthly_plan'],
    formatter: 'percent_int',
    validators: [{ type: 'range', params: { min: 0, max: 100 }, severity: 'block_save' }],
  },
  {
    key: 'actual_start_date',
    group: 'progress_fact',
    displayGroup: 'progress_fact',
    mergeGroup: 'progress_status',
    label: '实际开始',
    dataType: 'date',
    editableIn: [],
    defaultVisibleIn: [],
    readonlyReasonCode: 'system_derived',
  },
  {
    key: 'actual_end_date',
    group: 'progress_fact',
    displayGroup: 'progress_fact',
    mergeGroup: 'progress_status',
    label: '实际完成',
    dataType: 'date',
    editableIn: [],
    defaultVisibleIn: [],
    readonlyReasonCode: 'system_derived',
  },
  {
    key: 'engineering_object_id',
    group: 'engineering_object',
    displayGroup: 'engineering_object',
    mergeGroup: 'engineering_object',
    label: '任务主对象',
    dataType: 'lookup',
    lookupSource: 'engineering_objects',
    editableIn: ['task_list'],
    editableWhen: 'always',
    defaultVisibleIn: ['task_list'],
  },
  {
    key: 'building_object_id',
    group: 'engineering_object',
    displayGroup: 'engineering_object',
    mergeGroup: 'engineering_object',
    label: '楼栋',
    dataType: 'lookup',
    lookupSource: 'engineering_objects',
    editableIn: ['task_list'],
    editableWhen: 'always',
    defaultVisibleIn: ['task_list'],
  },
  {
    key: 'floor_object_id',
    group: 'engineering_object',
    displayGroup: 'engineering_object',
    mergeGroup: 'engineering_object',
    label: '楼层',
    dataType: 'lookup',
    lookupSource: 'engineering_objects',
    editableIn: ['task_list'],
    editableWhen: 'always',
    defaultVisibleIn: [],
  },
  {
    key: 'physical_zone_object_id',
    group: 'engineering_object',
    displayGroup: 'engineering_object',
    mergeGroup: 'engineering_object',
    label: '区域',
    dataType: 'lookup',
    lookupSource: 'engineering_objects',
    editableIn: ['task_list'],
    editableWhen: 'always',
    defaultVisibleIn: [],
  },
  {
    key: 'functional_area_object_id',
    group: 'engineering_object',
    displayGroup: 'engineering_object',
    mergeGroup: 'engineering_object',
    label: '功能区域',
    dataType: 'lookup',
    lookupSource: 'engineering_objects',
    editableIn: ['task_list'],
    editableWhen: 'always',
    defaultVisibleIn: [],
  },
  {
    key: 'phase_object_id',
    group: 'engineering_object',
    displayGroup: 'engineering_object',
    mergeGroup: 'engineering_object',
    label: '分期',
    dataType: 'lookup',
    lookupSource: 'engineering_objects',
    editableIn: ['task_list'],
    editableWhen: 'always',
    defaultVisibleIn: [],
  },
  {
    key: 'section_object_id',
    group: 'engineering_object',
    displayGroup: 'engineering_object',
    mergeGroup: 'engineering_object',
    label: '标段',
    dataType: 'lookup',
    lookupSource: 'engineering_objects',
    editableIn: ['task_list'],
    editableWhen: 'always',
    defaultVisibleIn: [],
  },
  {
    key: 'engineering_category_id',
    group: 'engineering_category',
    displayGroup: 'engineering_category',
    mergeGroup: 'engineering_category',
    label: '工程分类',
    dataType: 'lookup',
    lookupSource: 'dictionary',
    editableIn: ['task_list'],
    editableWhen: 'always',
    defaultVisibleIn: [],
  },
  {
    key: 'category_type',
    group: 'engineering_category',
    displayGroup: 'engineering_category',
    mergeGroup: 'engineering_category',
    label: '节点类型',
    dataType: 'enum',
    lookupSource: 'dictionary',
    editableIn: ['task_list'],
    editableWhen: 'always',
    defaultVisibleIn: [],
  },
  {
    key: 'assignee_name',
    group: 'responsibility',
    displayGroup: 'responsibility',
    mergeGroup: 'assignee',
    label: '责任人',
    dataType: 'text',
    editableIn: ['task_list'],
    editableWhen: 'always',
    defaultVisibleIn: ['task_list'],
  },
  {
    key: 'wbs_node_type',
    group: 'engineering_category',
    displayGroup: 'engineering_category',
    mergeGroup: 'engineering_category',
    label: '节点类型',
    dataType: 'enum',
    lookupSource: 'dictionary',
    editableIn: ['task_list', 'baseline', 'monthly_plan'],
    editableWhen: 'always',
    defaultVisibleIn: [],
  },
  {
    key: 'participant_unit_id',
    group: 'responsibility',
    displayGroup: 'responsibility',
    mergeGroup: 'participant_unit',
    label: '责任单位',
    dataType: 'lookup',
    lookupSource: 'participant_units',
    editableIn: ['task_list'],
    editableWhen: 'always',
    defaultVisibleIn: ['task_list'],
  },
  {
    key: 'is_milestone',
    group: 'node_control',
    displayGroup: 'node_control',
    mergeGroup: 'node_control',
    label: '里程碑',
    dataType: 'boolean',
    editableIn: ['task_list', 'baseline', 'monthly_plan'],
    editableWhen: 'always',
    defaultVisibleIn: ['baseline', 'monthly_plan', 'task_list'],
  },
  {
    key: 'milestone_level',
    group: 'node_control',
    displayGroup: 'node_control',
    mergeGroup: 'node_control',
    label: '里程碑等级',
    dataType: 'enum',
    lookupSource: 'dictionary',
    editableIn: ['task_list', 'baseline', 'monthly_plan'],
    editableWhen: 'always',
    defaultVisibleIn: [],
  },
  {
    key: 'is_critical',
    group: 'node_control',
    displayGroup: 'node_control',
    mergeGroup: 'readonly_derived',
    label: '关键路径',
    dataType: 'boolean',
    editableIn: [],
    defaultVisibleIn: ['task_list'],
    readonlyReasonCode: 'system_derived',
  },
  {
    key: 'duration_risk_range',
    group: 'dependency',
    displayGroup: 'dependency',
    mergeGroup: 'readonly_derived',
    label: '工期风险',
    dataType: 'text',
    editableIn: [],
    defaultVisibleIn: ['task_list'],
    readonlyReasonCode: 'system_derived',
  },
  {
    key: 'total_float_days',
    group: 'dependency',
    displayGroup: 'dependency',
    mergeGroup: 'readonly_derived',
    label: '关键路径浮时',
    dataType: 'number',
    editableIn: [],
    defaultVisibleIn: ['task_list'],
    readonlyReasonCode: 'system_derived',
  },
  {
    key: 'duration_asset_evidence',
    group: 'template_source',
    displayGroup: 'template_source',
    mergeGroup: 'readonly_derived',
    label: '工期资产依据',
    dataType: 'text',
    editableIn: [],
    defaultVisibleIn: ['task_list'],
    readonlyReasonCode: 'system_derived',
  },
  {
    key: 'sort_order',
    group: 'node_control',
    displayGroup: 'node_control',
    mergeGroup: 'node_control',
    label: '排序',
    dataType: 'number',
    editableIn: ['task_list', 'baseline', 'monthly_plan'],
    editableWhen: 'always',
    defaultVisibleIn: [],
  },
  {
    key: 'notes',
    group: 'basic_plan',
    displayGroup: 'basic_plan',
    mergeGroup: 'identity',
    label: '备注',
    dataType: 'text',
    editableIn: ['task_list', 'baseline', 'monthly_plan'],
    editableWhen: 'always',
    defaultVisibleIn: [],
  },
  {
    key: 'predecessor_task_ids',
    group: 'dependency',
    displayGroup: 'dependency',
    mergeGroup: 'dependency',
    label: '前置任务',
    dataType: 'lookup',
    lookupSource: 'tasks',
    editableIn: ['task_list'],
    editableWhen: 'always',
    defaultVisibleIn: [],
  },
  {
    key: 'acceptance_impact_summary',
    group: 'acceptance_impact',
    displayGroup: 'acceptance_impact',
    mergeGroup: 'readonly_derived',
    label: '影响验收',
    dataType: 'text',
    editableIn: [],
    defaultVisibleIn: [],
    readonlyReasonCode: 'system_derived',
  },
  {
    key: 'validation_hint',
    group: 'quality_hint',
    displayGroup: 'quality_hint',
    mergeGroup: 'readonly_derived',
    label: '校核提示',
    dataType: 'text',
    editableIn: [],
    defaultVisibleIn: [],
    readonlyReasonCode: 'system_derived',
  },
  {
    key: 'template_node_id',
    group: 'template_source',
    displayGroup: 'template_source',
    mergeGroup: 'readonly_derived',
    label: '模板来源',
    dataType: 'text',
    editableIn: [],
    defaultVisibleIn: [],
    readonlyReasonCode: 'system_derived',
  },
]

const PLANNING_SURFACES = new Set<PlanningSurface>(['baseline', 'monthly_plan', 'task_list'])

export interface PlanningFieldRegistryResponse {
  registryVersion: string
  surface: PlanningSurface
  fields: PlanningFieldDefinition[]
  groups: PlanningFieldGroupDefinition[]
  updatedAt: string
  generatedAt: string
}

export function normalizePlanningSurface(surface: unknown): PlanningSurface {
  const requestedSurface = String(surface ?? 'task_list').trim() as PlanningSurface
  return PLANNING_SURFACES.has(requestedSurface) ? requestedSurface : 'task_list'
}

// v1.4.7.3 §12.2: surface-based field exclusion
const BASELINE_EXCLUDED_GROUPS = new Set(['progress_fact', 'acceptance_impact', 'quality_hint', 'dependency'])
const MONTHLY_EXCLUDED_GROUPS = new Set(['quality_hint', 'acceptance_impact', 'dependency'])

export function getPlanningFieldRegistry(surfaceInput: unknown, timestamp = new Date().toISOString()): PlanningFieldRegistryResponse {
  const surface = normalizePlanningSurface(surfaceInput)
  let publicFields = PLANNING_FIELD_REGISTRY.filter((field) => field.key !== 'template_node_id')

  // Surface-based exclusion
  if (surface === 'baseline') {
    publicFields = publicFields.filter((field) => !BASELINE_EXCLUDED_GROUPS.has(field.displayGroup))
  } else if (surface === 'monthly_plan') {
    publicFields = publicFields.filter((field) => !MONTHLY_EXCLUDED_GROUPS.has(field.displayGroup))
  }

  const publicGroupKeys = new Set(publicFields.map((field) => field.displayGroup))
  return {
    registryVersion: PLANNING_FIELD_REGISTRY_VERSION,
    surface,
    fields: publicFields,
    groups: PLANNING_FIELD_GROUPS.filter((group) => publicGroupKeys.has(group.key)),
    updatedAt: timestamp,
    generatedAt: timestamp,
  }
}
