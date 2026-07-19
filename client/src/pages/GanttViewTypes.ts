// GanttView 共享类型、接口和常量
// 从 GanttView.tsx 提取以避免 esbuild 解析超大文件的问题
import type { DurationMetricDto } from '@/lib/durationMetric'

// Task类型（本地版本）
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
  duration?: DurationMetricDto | null
  /** @deprecated Use duration. */
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
  id: string
  project_id: string
  title?: string
  description?: string
  status?: string
  statusLabel?: string
  displayStatus?: string
  priority?: string
  start_date?: string | null
  end_date?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  delay_days?: number | string | null
  delay_reason?: string | null
  progress?: number
  assignee?: string
  assignee_user_id?: string | null
  assignee_name?: string
  participant_unit_id?: string | null
  participant_unit_name?: string | null
  dependencies?: string[]
  parent_id?: string | null   // WBS父节点ID
  milestone_id?: string | null
  wbs_code?: string           // WBS编码（如1.2.3）
  wbs_level?: number          // WBS层级
  sort_order?: number         // 同级排序
  is_critical?: boolean
  total_float_days?: number | string | null
  free_float_days?: number | string | null
  baseline_start?: string | null
  baseline_end?: string | null
  baseline_is_critical?: boolean | null
  is_milestone?: boolean  // 是否为里程碑节点
  milestone_level?: number  // 里程碑层级：1=一级(amber)/2=二级(blue)/3=三级(gray)
  milestone_order?: number  // 同级排序
  // #7: 工期对比
  // #11: 首次填报时间
  first_progress_at?: string | null
  // 实际开始/结束日期
  actual_start_date?: string | null
  actual_end_date?: string | null
  lagLevel?: 'none' | 'mild' | 'moderate' | 'severe'
  lagStatus?: '正常' | '轻度滞后' | '中度滞后' | '严重滞后'
  // #12: 专项工程分类
  dueStatus?: TaskDueStatusDto | null
  businessStatus?: TaskDerivedStatusDto | null
  statusDerivation?: TaskStatusDerivationDto | null
  specialty_type?: string | null
  // v1.4.1 engineering object IDs
  engineering_object_id?: string | null
  phase_object_id?: string | null
  section_object_id?: string | null
  building_object_id?: string | null
  basement_object_id?: string | null
  floor_object_id?: string | null
  physical_zone_object_id?: string | null
  functional_area_object_id?: string | null
  // v1.4.2 WBS semantic
  engineering_category_id?: string | null
  engineering_category_type?: string | null
  engineering_category_name?: string | null
  wbs_node_type?: string | null
  category_type?: string | null
  wbs_path?: string | null
  is_leaf?: boolean | null
  is_wbs_summary?: boolean | null
  is_executable?: boolean | null
  template_node_id?: string | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  // v1.4.3 task standard
  progress_method?: string
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
  acceptance_impact_count?: number
  acceptance_impact_summary?: TaskAcceptanceImpactItem[]
  version?: number
  created_at: string
  updated_at: string
}

// WBS 树节点（包含 children）
export interface WBSNode extends Task {
  children: WBSNode[]
  depth: number
}

const TASK_WBS_NODE_TYPES = new Set(['division', 'sub_division', 'item_work', 'process', 'activity_step', 'custom'])

export function normalizeTaskWbsNodeType(value?: string | null): string | null {
  const normalized = String(value ?? '').trim()
  return TASK_WBS_NODE_TYPES.has(normalized) ? normalized : null
}

export function getTaskWbsNodeType(task?: Pick<Task, 'wbs_node_type' | 'engineering_category_type' | 'category_type'> | null): string | null {
  return normalizeTaskWbsNodeType(task?.wbs_node_type)
    ?? normalizeTaskWbsNodeType(task?.engineering_category_type)
    ?? normalizeTaskWbsNodeType(task?.category_type)
}

const TASK_PROGRESS_METHOD_LABELS: Record<string, string> = {
  percent: '百分比',
  quantity: '工程量',
  milestone: '里程碑',
  manual_weighted: '权重规则',
}

export function normalizeTaskProgressMethod(method?: string | null): string {
  const normalized = String(method ?? 'percent').trim()
  return normalized || 'percent'
}

export function getTaskProgressMethodLabel(method?: string | null): string {
  return TASK_PROGRESS_METHOD_LABELS[normalizeTaskProgressMethod(method)] ?? '系统规则'
}

export function getTaskProgressReadOnlyReason(method?: string | null): string | null {
  const normalized = normalizeTaskProgressMethod(method)
  if (normalized === 'percent') return null
  return `该任务进度由${getTaskProgressMethodLabel(normalized)}自动计算`
}

// 开工条件类型枚举
export const CONDITION_TYPES = [
  { value: 'material',    label: '材料',     color: 'bg-blue-100 text-blue-700' },
  { value: 'personnel',  label: '人员',     color: 'bg-teal-100 text-teal-700' },
  { value: 'weather',    label: '天气',     color: 'bg-sky-100 text-sky-700' },
  { value: 'design',     label: '设计变更', color: 'bg-red-50 text-red-700' },
  { value: 'preceding',  label: '前置工序', color: 'bg-amber-100 text-amber-700' },
  { value: 'other',      label: '其他',     color: 'bg-slate-100 text-slate-600' },
] as const

export type ConditionTypeValue = typeof CONDITION_TYPES[number]['value']

// #12: 专项工程分类
export const SPECIALTY_TYPES = [
  { value: 'foundation',   label: '地基基础',   color: 'bg-yellow-100 text-yellow-700' },
  { value: 'structure',    label: '主体结构',   color: 'bg-orange-100 text-orange-700' },
  { value: 'mep',          label: '机电安装',   color: 'bg-blue-100 text-blue-700' },
  { value: 'decoration',   label: '装饰装修',   color: 'bg-teal-100 text-teal-700' },
  { value: 'curtain_wall', label: '幕墙工程',   color: 'bg-cyan-100 text-cyan-700' },
  { value: 'landscape',    label: '园林景观',   color: 'bg-green-100 text-green-700' },
  { value: 'steel',        label: '钢结构',     color: 'bg-slate-100 text-slate-700' },
  { value: 'waterproof',   label: '防水工程',   color: 'bg-sky-100 text-sky-700' },
  { value: 'other',        label: '其他专项',   color: 'bg-slate-100 text-slate-600' },
] as const

// 开工条件
export interface TaskCondition {
  id: string
  task_id: string
  name: string
  is_satisfied: boolean
  condition_type?: ConditionTypeValue | string
  target_date?: string | null   // P1: 目标解决日期
  description?: string
  satisfied_reason?: string | null
  satisfied_reason_note?: string | null
  satisfied_at?: string | null
  created_at: string
  updated_at?: string
}

// 阻碍记录
export interface TaskObstacle {
  id: string
  task_id: string
  title: string
  description?: string
  is_resolved: boolean
  severity?: string
  status?: string
  obstacle_type?: string | null
  expected_resolution_date?: string | null
  resolution_notes?: string | null
  severity_escalated_at?: string | null
  severity_manually_overridden?: boolean | null
  created_at: string
}

export interface TaskAcceptanceImpactItem {
  id: string
  name: string
  status?: string | null
  statusLabel?: string | null
}

// 里程碑层级样式配置
export const MILESTONE_LEVEL_CONFIG: Record<number, { label: string; color: string; borderColor: string; bgColor: string }> = {
  1: { label: '一级里程碑', color: 'text-amber-600', borderColor: 'border-amber-500', bgColor: 'bg-amber-50' },
  2: { label: '二级里程碑', color: 'text-blue-600', borderColor: 'border-blue-500', bgColor: 'bg-blue-50' },
  3: { label: '三级里程碑', color: 'text-slate-500', borderColor: 'border-slate-400', bgColor: 'bg-slate-50' },
}

// #5: WBS层级图标配置（根节点=文件夹 / 中间节点=子文件夹 / 叶节点=任务单）
export function getWBSNodeIcon(node: { depth: number; children: { length: number } }): { icon: string; cls: string } {
  if (node.depth === 0 && node.children.length > 0) return { icon: 'folder', cls: 'text-amber-500' }
  if (node.children.length > 0) return { icon: 'folder-open', cls: 'text-blue-400' }
  return { icon: 'file-text', cls: 'text-slate-400' }
}

// WBS 树形结构工具函数

/**
 * 将平铺 tasks 数组按 parent_id 重建为多叉树
 * 没有 parent_id（或 parent_id 找不到对应节点）的任务作为根节点
 */
export function buildWBSTree(tasks: Task[]): WBSNode[] {
  const nodeMap = new Map<string, WBSNode>()
  // 初始化节点
  for (const t of tasks) {
    nodeMap.set(t.id, { ...t, children: [], depth: 0 })
  }
  const roots: WBSNode[] = []
  for (const node of nodeMap.values()) {
    const parentId = node.parent_id
    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  // 设置 depth
  function setDepth(nodes: WBSNode[], d: number) {
    for (const n of nodes) {
      n.depth = d
      setDepth(n.children, d + 1)
    }
  }
  setDepth(roots, 0)
  return roots
}

/**
 * 为 WBS 树节点自动生成 wbs_code（如1、1.1、1.1.2）
 * 若节点已有 wbs_code 则直接使用，否则按位置自动生成
 */
export function assignWBSCode(nodes: WBSNode[], prefix = ''): void {
  nodes.forEach((node, idx) => {
    const code = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`
    if (!node.wbs_code) {
      node.wbs_code = code
    }
    if (node.children.length > 0) {
      assignWBSCode(node.children, node.wbs_code)
    }
  })
}

/**
 * 将 WBS 树打平为有序列表，用于渲染
 * collapsed：存放已折叠节点 id 的 Set，折叠节点的子树跳过
 */
export function flattenTree(nodes: WBSNode[], collapsed: Set<string>): WBSNode[] {
  const result: WBSNode[] = []
  for (const n of nodes) {
    result.push(n)
    if (!collapsed.has(n.id) && n.children.length > 0) {
      result.push(...flattenTree(n.children, collapsed))
    }
  }
  return result
}

/**
 * 递归收集 taskId 的全量前向依赖链（含自身），防环限深
 */
export function getDependencyChain(taskId: string, taskMap: Map<string, Task>, maxDepth = 20): Set<string> {
  const result = new Set<string>()
  const queue = [taskId]
  let depth = 0
  while (queue.length > 0 && depth < maxDepth) {
    const batch = queue.splice(0, queue.length)
    depth++
    for (const id of batch) {
      if (result.has(id)) continue
      result.add(id)
      const task = taskMap.get(id)
      if (task?.dependencies) {
        for (const depId of task.dependencies) {
          if (!result.has(depId)) queue.push(depId)
        }
      }
    }
  }
  return result
}
