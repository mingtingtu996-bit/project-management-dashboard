export interface AcceptanceType {
  id: string
  name: string
  shortName: string
  color: string
  icon?: string
  isSystem: boolean
  description?: string
  defaultDependsOn?: string[]
  sortOrder: number
}

export const DEFAULT_ACCEPTANCE_TYPES: AcceptanceType[] = [
  {
    id: 'pre_acceptance',
    name: '工程竣工预验收',
    shortName: '预验收',
    color: 'bg-purple-500',
    icon: 'ClipboardCheck',
    isSystem: true,
    description: '监理单位牵头的预验收事项',
    sortOrder: 0,
  },
  {
    id: 'four_party',
    name: '单位工程竣工验收',
    shortName: '四方验收',
    color: 'bg-blue-500',
    icon: 'Users',
    isSystem: true,
    description: '建设单位组织的四方验收',
    defaultDependsOn: ['pre_acceptance'],
    sortOrder: 1,
  },
  {
    id: 'fire',
    name: '消防验收',
    shortName: '消防',
    color: 'bg-red-500',
    icon: 'Flame',
    isSystem: true,
    description: '消防专项验收',
    defaultDependsOn: ['four_party'],
    sortOrder: 2,
  },
  {
    id: 'planning',
    name: '规划验收',
    shortName: '规划',
    color: 'bg-emerald-500',
    icon: 'Map',
    isSystem: true,
    description: '规划专项验收',
    defaultDependsOn: ['four_party'],
    sortOrder: 3,
  },
  {
    id: 'civil_defense',
    name: '人防验收',
    shortName: '人防',
    color: 'bg-orange-500',
    icon: 'Shield',
    isSystem: true,
    description: '人防专项验收',
    defaultDependsOn: ['four_party'],
    sortOrder: 4,
  },
  {
    id: 'elevator',
    name: '电梯验收',
    shortName: '电梯',
    color: 'bg-cyan-500',
    icon: 'ArrowUpDown',
    isSystem: true,
    description: '特种设备验收',
    defaultDependsOn: ['four_party'],
    sortOrder: 5,
  },
  {
    id: 'lightning',
    name: '防雷验收',
    shortName: '防雷',
    color: 'bg-yellow-500',
    icon: 'CloudLightning',
    isSystem: true,
    description: '防雷专项验收',
    defaultDependsOn: ['four_party'],
    sortOrder: 6,
  },
  {
    id: 'completion_record',
    name: '竣工验收备案',
    shortName: '竣工备案',
    color: 'bg-emerald-500',
    icon: 'FileCheck',
    isSystem: true,
    description: '竣工验收备案事项',
    defaultDependsOn: ['fire', 'planning', 'civil_defense', 'elevator', 'lightning'],
    sortOrder: 7,
  },
]

export const ACCEPTANCE_STATUSES = [
  'draft',
  'preparing',
  'ready_to_submit',
  'submitted',
  'inspecting',
  'rectifying',
  'passed',
  'archived',
] as const

export type AcceptanceStatus = (typeof ACCEPTANCE_STATUSES)[number]

export const ACCEPTANCE_STATUS_NAMES: Record<AcceptanceStatus, string> = {
  draft: '草稿',
  preparing: '准备中',
  ready_to_submit: '待申报',
  submitted: '已申报',
  inspecting: '验收中',
  rectifying: '整改中',
  passed: '已通过',
  archived: '已归档',
}

export const ACCEPTANCE_STATUS_CONFIG: Record<
  AcceptanceStatus,
  {
    icon: string
    color: string
    bg: string
    borderColor: string
    textColor: string
  }
> = {
  draft: {
    icon: 'Circle',
    color: 'text-gray-500',
    bg: 'bg-gray-100',
    borderColor: 'border-gray-300',
    textColor: 'text-gray-600',
  },
  preparing: {
    icon: 'Loader2',
    color: 'text-amber-500',
    bg: 'bg-amber-100',
    borderColor: 'border-amber-300',
    textColor: 'text-amber-700',
  },
  ready_to_submit: {
    icon: 'Users',
    color: 'text-cyan-500',
    bg: 'bg-cyan-100',
    borderColor: 'border-cyan-300',
    textColor: 'text-cyan-700',
  },
  submitted: {
    icon: 'Users',
    color: 'text-sky-500',
    bg: 'bg-sky-100',
    borderColor: 'border-sky-300',
    textColor: 'text-sky-700',
  },
  inspecting: {
    icon: 'Loader2',
    color: 'text-blue-500',
    bg: 'bg-blue-100',
    borderColor: 'border-blue-300',
    textColor: 'text-blue-700',
  },
  rectifying: {
    icon: 'AlertCircle',
    color: 'text-orange-500',
    bg: 'bg-orange-100',
    borderColor: 'border-orange-300',
    textColor: 'text-orange-700',
  },
  passed: {
    icon: 'CheckCircle2',
    color: 'text-green-500',
    bg: 'bg-green-100',
    borderColor: 'border-green-300',
    textColor: 'text-green-700',
  },
  archived: {
    icon: 'CheckCircle2',
    color: 'text-emerald-500',
    bg: 'bg-emerald-100',
    borderColor: 'border-emerald-300',
    textColor: 'text-emerald-700',
  },
}

export interface AcceptanceDocument {
  id: string
  name: string
  url: string
  file_type?: string
  uploaded_at: string
  uploaded_by?: string
}

export interface AcceptanceResult {
  passed: boolean
  issues?: string[]
  comments?: string
  attachments?: AcceptanceDocument[]
}

export type AcceptanceOverlayTag =
  | '受阻'
  | '临期'
  | '逾期'
  | '资料缺失'
  | '前置未满足'
  | '自定义'
  | string

export type AcceptanceDependencyKind = 'hard' | 'soft'

export type AcceptanceRequirementStatus = 'open' | 'met' | 'blocked' | 'closed'

export interface AcceptancePlan {
  id: string
  project_id: string
  milestone_id?: string | null
  catalog_id?: string | null
  type_id: string
  type_name: string
  type_color: string
  acceptance_type?: string | null
  acceptance_name?: string | null
  name: string
  description?: string | null
  planned_date: string | null
  actual_date?: string | null
  building_id?: string | null
  scope_level?: 'project' | 'building' | 'unit' | 'specialty' | string | null
  participant_unit_id?: string | null
  status: AcceptanceStatus
  phase_code?: string | null
  phase_order: number
  sort_order?: number
  parallel_group_id?: string | null
  predecessor_plan_ids: string[]
  successor_plan_ids: string[]
  can_submit?: boolean
  is_overdue?: boolean
  days_to_due?: number | null
  requirement_ready_percent?: number
  upstream_unfinished_count?: number
  downstream_block_count?: number
  display_badges: AcceptanceOverlayTag[]
  overlay_tags?: AcceptanceOverlayTag[]
  is_blocked?: boolean
  block_reason_summary?: string | null
  warning_level?: 'info' | 'warning' | 'critical' | string | null
  is_custom?: boolean
  responsible_user_id?: string | null
  responsible_unit?: string | null
  documents?: AcceptanceDocument[] | null
  nodes?: AcceptanceNode[]
  is_system: boolean
  is_hard_prerequisite?: boolean | null
  category?: string | null
  created_at: string
  updated_at: string
  created_by?: string | null
}

export interface AcceptanceNode {
  id: string
  acceptance_plan_id: string
  name: string
  description?: string | null
  status: AcceptanceStatus
  planned_date?: string | null
  actual_date?: string | null
  result?: AcceptanceResult
  documents?: AcceptanceDocument[] | null
  notes?: string | null
  accepted_by?: string | null
  accepted_at?: string | null
  sort_order: number
  created_at: string
  updated_at: string
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
  typeId: string
}

export interface AcceptanceLink {
  id: string
  source: string | AcceptanceNode
  target: string | AcceptanceNode
  type?: AcceptanceDependencyKind
  created_at?: string
}

export interface AcceptanceRequirementRecord {
  id: string
  plan_id: string
  requirement_type: string
  source_entity_type: string
  source_entity_id: string
  drawing_package_id?: string
  description?: string | null
  status?: AcceptanceRequirementStatus | string | null
  is_required: boolean
  is_satisfied: boolean
  created_at?: string
  updated_at?: string
}

export interface AcceptancePlanDependencyRecord {
  id: string
  project_id: string
  source_plan_id: string
  target_plan_id: string
  dependency_kind: AcceptanceDependencyKind
  status?: 'active' | 'inactive' | 'pending' | string | null
  created_at?: string
  updated_at?: string
}

export interface AcceptanceRecordEntry {
  id: string
  plan_id: string
  record_type: string
  content: string
  operator?: string | null
  record_date?: string | null
  attachments?: unknown[] | null
  created_at?: string
  updated_at?: string
}

export interface AcceptanceLinkedWarning {
  id: string
  task_id?: string
  warning_signature?: string
  warning_type: string
  warning_level: 'info' | 'warning' | 'critical'
  title: string
  description: string
  is_acknowledged?: boolean
  status?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
  created_at?: string
}

export interface AcceptanceLinkedIssue {
  id: string
  task_id?: string | null
  title: string
  description?: string | null
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'open' | 'investigating' | 'resolved' | 'closed'
  source_type: string
  source_id?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
  chain_id?: string | null
  pending_manual_close?: boolean
  closed_reason?: string | null
  closed_at?: string | null
  version?: number
  created_at?: string
  updated_at?: string
}

export interface AcceptanceLinkedRisk {
  id: string
  task_id?: string | null
  title: string
  description?: string
  level?: 'critical' | 'high' | 'medium' | 'low' | string
  status?: 'identified' | 'mitigating' | 'closed' | string
  source_type?: string
  source_id?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
  chain_id?: string | null
  linked_issue_id?: string | null
  pending_manual_close?: boolean
  closed_reason?: string | null
  closed_at?: string | null
  version?: number
  created_at?: string
  updated_at?: string
}

export interface AcceptanceLinkedTask {
  task_id: string
  task_name: string
  status: string
  planned_date?: string | null
}

export interface AcceptancePlanRelationBundle {
  requirements: AcceptanceRequirementRecord[]
  dependencies: AcceptancePlanDependencyRecord[]
  records: AcceptanceRecordEntry[]
  linkedWarnings: AcceptanceLinkedWarning[]
  linkedIssues: AcceptanceLinkedIssue[]
  linkedRisks: AcceptanceLinkedRisk[]
  linkedTasks?: AcceptanceLinkedTask[]
}

export interface AcceptanceDependency {
  from: string
  to: string
  status: 'completed' | 'pending'
}

export interface AcceptancePhase {
  id: string
  name: string
  order: number
  plans: AcceptancePlan[]
}

export interface AcceptanceStats {
  total: number
  passed: number
  inProgress: number
  pending: number
  failed: number
  completionRate: number
}

const ACCEPTANCE_STATUS_ALIASES: Record<string, AcceptanceStatus> = {
  draft: 'draft',
  not_started: 'draft',
  pending: 'draft',
  '未启动': 'draft',
  '草稿': 'draft',
  preparing: 'preparing',
  '准备中': 'preparing',
  ready_to_submit: 'ready_to_submit',
  ready: 'ready_to_submit',
  '待申报': 'ready_to_submit',
  submitted: 'submitted',
  '已申报': 'submitted',
  in_acceptance: 'inspecting',
  inspecting: 'inspecting',
  '验收中': 'inspecting',
  rectification: 'rectifying',
  rectifying: 'rectifying',
  '整改中': 'rectifying',
  '补正中': 'rectifying',
  passed: 'passed',
  '已通过': 'passed',
  recorded: 'archived',
  archived: 'archived',
  closed: 'archived',
  '已备案': 'archived',
  '已归档': 'archived',
  '已关闭': 'archived',
}

export function normalizeAcceptanceStatus(status: string): AcceptanceStatus {
  const normalized = String(status ?? '').trim()
  return ACCEPTANCE_STATUS_ALIASES[normalized] || ACCEPTANCE_STATUS_ALIASES[normalized.toLowerCase()] || 'draft'
}

export function normalizeAcceptanceDependencyKind(kind?: string | null): AcceptanceDependencyKind {
  const normalized = String(kind ?? '').trim().toLowerCase()
  return normalized === 'soft' || normalized === 'weak' ? 'soft' : 'hard'
}

export function summarizeAcceptancePlans(plans: AcceptancePlan[]): AcceptanceStats {
  const total = plans.length
  const normalizedStatuses = plans.map((plan) => normalizeAcceptanceStatus(plan.status))
  const passed = normalizedStatuses.filter((status) => status === 'passed' || status === 'archived').length
  const inProgress = normalizedStatuses.filter((status) => ['preparing', 'ready_to_submit', 'submitted', 'inspecting'].includes(status)).length
  const pending = normalizedStatuses.filter((status) => status === 'draft').length
  const failed = normalizedStatuses.filter((status) => status === 'rectifying').length

  return {
    total,
    passed,
    inProgress,
    pending,
    failed,
    completionRate: total > 0 ? Math.round((passed / total) * 100) : 0,
  }
}

export function isValidAcceptanceStatus(status: string): status is AcceptanceStatus {
  return ACCEPTANCE_STATUSES.includes(status as AcceptanceStatus)
}

export function getDefaultAcceptanceType(typeId: string): AcceptanceType | undefined {
  return DEFAULT_ACCEPTANCE_TYPES.find((type) => type.id === typeId)
}

export function getAcceptanceTypeColor(typeId: string, customTypes?: AcceptanceType[]): string {
  const allTypes = [...DEFAULT_ACCEPTANCE_TYPES, ...(customTypes || [])]
  return allTypes.find((type) => type.id === typeId)?.color || 'bg-gray-500'
}

export function getAcceptanceTypeName(typeId: string, customTypes?: AcceptanceType[]): string {
  const allTypes = [...DEFAULT_ACCEPTANCE_TYPES, ...(customTypes || [])]
  return allTypes.find((type) => type.id === typeId)?.name || typeId
}

function getPhaseName(phaseId: string): string {
  const names: Record<string, string> = {
    preparation: '准备阶段',
    special_acceptance: '专项验收',
    unit_completion: '单位工程验收',
    filing_archive: '备案归档',
    delivery_closeout: '交付收口',
    phase1: '第一阶段: 预验收',
    phase2: '第二阶段: 四方验收',
    phase3: '第三阶段: 专项验收',
    phase4: '第四阶段: 竣工备案',
    default: '其他',
  }
  return names[phaseId] || phaseId
}

function getPhaseOrder(phaseId: string): number {
  const orders: Record<string, number> = {
    preparation: 1,
    special_acceptance: 2,
    unit_completion: 3,
    filing_archive: 4,
    delivery_closeout: 5,
    phase1: 1,
    phase2: 2,
    phase3: 3,
    phase4: 4,
    default: 99,
  }
  return orders[phaseId] || 99
}

export function groupAcceptanceByPhase(plans: AcceptancePlan[]): AcceptancePhase[] {
  const phaseMap = new Map<string, AcceptancePhase>()

  plans.forEach((plan) => {
    const phaseId = plan.phase_code || 'default'
    if (!phaseMap.has(phaseId)) {
      phaseMap.set(phaseId, {
        id: phaseId,
        name: getPhaseName(phaseId),
        order: getPhaseOrder(phaseId),
        plans: [],
      })
    }
    phaseMap.get(phaseId)!.plans.push(plan)
  })

  return Array.from(phaseMap.values())
    .sort((left, right) => left.order - right.order)
    .map((phase) => ({
      ...phase,
      plans: phase.plans.sort((left, right) => (left.phase_order || 0) - (right.phase_order || 0)),
    }))
}

export function calculateDependencies(plans: AcceptancePlan[]): AcceptanceDependency[] {
  const planMap = new Map(plans.map((plan) => [plan.id, plan]))
  const dependencies: AcceptanceDependency[] = []

  plans.forEach((plan) => {
    getAcceptancePredecessorIds(plan).forEach((dependencyId) => {
      const dependencyPlan = planMap.get(dependencyId)
      if (!dependencyPlan) return
      dependencies.push({
        from: dependencyId,
        to: plan.id,
        status: ['passed', 'archived'].includes(normalizeAcceptanceStatus(dependencyPlan.status)) ? 'completed' : 'pending',
      })
    })
  })

  return dependencies
}

export function isAcceptanceBlocked(plan: AcceptancePlan, allPlans: AcceptancePlan[]): boolean {
  if (typeof plan.is_blocked === 'boolean') return plan.is_blocked

  const predecessorPlanIds = getAcceptancePredecessorIds(plan)
  if (!predecessorPlanIds.length) return false

  const planMap = new Map(allPlans.map((item) => [item.id, item]))
  return predecessorPlanIds.some((dependencyId) => {
    const dependency = planMap.get(dependencyId)
    return !dependency || !['passed', 'archived'].includes(normalizeAcceptanceStatus(dependency.status))
  })
}

export function getAcceptanceBlockReasons(plan: AcceptancePlan, allPlans: AcceptancePlan[]): string[] {
  if (plan.block_reason_summary?.trim()) return [plan.block_reason_summary.trim()]

  const predecessorPlanIds = getAcceptancePredecessorIds(plan)
  if (!predecessorPlanIds.length) return []

  const planMap = new Map(allPlans.map((item) => [item.id, item]))
  const reasons: string[] = []

  predecessorPlanIds.forEach((dependencyId) => {
    const dependency = planMap.get(dependencyId)
    if (!dependency) {
      reasons.push(`前置验收不存在: ${dependencyId}`)
      return
    }

    const status = normalizeAcceptanceStatus(dependency.status)
    if (!['passed', 'archived'].includes(status)) {
      reasons.push(`等待: ${dependency.name} (${ACCEPTANCE_STATUS_NAMES[status]})`)
    }
  })

  return reasons
}

export function getAcceptancePredecessorIds(plan: AcceptancePlan): string[] {
  return Array.isArray(plan.predecessor_plan_ids) ? plan.predecessor_plan_ids : []
}

export function getAcceptanceSuccessorIds(plan: AcceptancePlan): string[] {
  return Array.isArray(plan.successor_plan_ids) ? plan.successor_plan_ids : []
}

export function getAcceptanceDisplayBadges(plan: AcceptancePlan): AcceptanceOverlayTag[] {
  const badges = new Set<AcceptanceOverlayTag>()

  for (const badge of plan.display_badges || []) {
    badges.add(badge)
  }

  for (const badge of plan.overlay_tags || []) {
    badges.add(badge)
  }

  return [...badges]
}
