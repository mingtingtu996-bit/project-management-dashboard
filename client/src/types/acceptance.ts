/**
 * 验收计划类型定义 - V4.3 重构版
 * 
 * 核心变更：
 * 1. 支持自定义验收类型（不再固定8类）
 * 2. 支持非线性依赖关系（并行+串行混合）
 * 3. 支持阶段分组展示
 * 
 * 设计参考：验收时间轴展板组件设计方案.md
 */

/**
 * 验收类型定义（可自定义）
 * 系统提供默认类型，但用户可添加自定义类型
 */
export interface AcceptanceType {
  id: string;                    // 类型ID
  name: string;                  // 类型名称
  shortName: string;             // 简称（用于标签）
  color: string;                 // 主题色（Tailwind类名）
  icon?: string;                 // 图标名称
  isSystem: boolean;             // 是否系统内置（不可删除）
  description?: string;          // 类型说明
  defaultDependsOn?: string[];   // 默认前置依赖
  sortOrder: number;             // 排序顺序
}

/**
 * 系统默认验收类型（8类标准验收）
 * 用户可在此基础上添加自定义类型
 */
export const DEFAULT_ACCEPTANCE_TYPES: AcceptanceType[] = [
  {
    id: 'pre_acceptance',
    name: '工程竣工预验收',
    shortName: '预验收',
    color: 'bg-purple-500',
    icon: 'ClipboardCheck',
    isSystem: true,
    description: '监理单位牵头，对工程进行预验收',
    sortOrder: 0
  },
  {
    id: 'four_party',
    name: '单位工程质量竣工验收',
    shortName: '四方验收',
    color: 'bg-blue-500',
    icon: 'Users',
    isSystem: true,
    description: '建设单位组织的四方验收',
    defaultDependsOn: ['pre_acceptance'],
    sortOrder: 1
  },
  {
    id: 'fire',
    name: '消防验收',
    shortName: '消防',
    color: 'bg-red-500',
    icon: 'Flame',
    isSystem: true,
    description: '消防部门验收',
    defaultDependsOn: ['four_party'],
    sortOrder: 2
  },
  {
    id: 'planning',
    name: '规划验收',
    shortName: '规划',
    color: 'bg-emerald-500',
    icon: 'Map',
    isSystem: true,
    description: '规划部门验收',
    defaultDependsOn: ['four_party'],
    sortOrder: 3
  },
  {
    id: 'civil_defense',
    name: '人防验收',
    shortName: '人防',
    color: 'bg-orange-500',
    icon: 'Shield',
    isSystem: true,
    description: '人防部门验收',
    defaultDependsOn: ['four_party'],
    sortOrder: 4
  },
  {
    id: 'elevator',
    name: '电梯验收',
    shortName: '电梯',
    color: 'bg-cyan-500',
    icon: 'ArrowUpDown',
    isSystem: true,
    description: '特种设备检验机构验收',
    defaultDependsOn: ['four_party'],
    sortOrder: 5
  },
  {
    id: 'lightning',
    name: '防雷验收',
    shortName: '防雷',
    color: 'bg-yellow-500',
    icon: 'CloudLightning',
    isSystem: true,
    description: '气象部门验收',
    defaultDependsOn: ['four_party'],
    sortOrder: 6
  },
  {
    id: 'completion_record',
    name: '竣工验收备案',
    shortName: '竣工备案',
    color: 'bg-emerald-500',
    icon: 'FileCheck',
    isSystem: true,
    description: '住建部门备案',
    defaultDependsOn: ['fire', 'planning', 'civil_defense', 'elevator', 'lightning'],
    sortOrder: 7
  }
];

/**
 * 验收状态枚举
 */
export const ACCEPTANCE_STATUSES = [
  'pending',        // 待验收
  'in_progress',    // 验收中
  'passed',         // 已通过
  'failed',         // 未通过
  'needs_revision'  // 需补充
] as const;

export type AcceptanceStatus = typeof ACCEPTANCE_STATUSES[number];

/**
 * 验收状态中文映射
 */
export const ACCEPTANCE_STATUS_NAMES: Record<AcceptanceStatus, string> = {
  pending: '待验收',
  in_progress: '验收中',
  passed: '已通过',
  failed: '未通过',
  needs_revision: '需补充'
};

/**
 * 验收状态配置（用于UI渲染）
 */
export const ACCEPTANCE_STATUS_CONFIG: Record<AcceptanceStatus, {
  icon: string;
  color: string;
  bg: string;
  borderColor: string;
  textColor: string;
}> = {
  pending: { 
    icon: 'Circle', 
    color: 'text-gray-500', 
    bg: 'bg-gray-100',
    borderColor: 'border-gray-300',
    textColor: 'text-gray-600'
  },
  in_progress: { 
    icon: 'Loader2', 
    color: 'text-blue-500', 
    bg: 'bg-blue-100',
    borderColor: 'border-blue-300',
    textColor: 'text-blue-700'
  },
  passed: { 
    icon: 'CheckCircle2', 
    color: 'text-green-500', 
    bg: 'bg-green-100',
    borderColor: 'border-green-300',
    textColor: 'text-green-700'
  },
  failed: { 
    icon: 'XCircle', 
    color: 'text-red-500', 
    bg: 'bg-red-100',
    borderColor: 'border-red-300',
    textColor: 'text-red-700'
  },
  needs_revision: { 
    icon: 'AlertCircle', 
    color: 'text-amber-500', 
    bg: 'bg-amber-100',
    borderColor: 'border-amber-300',
    textColor: 'text-amber-700'
  }
};

/**
 * 验收计划接口（重构版）
 * 支持自定义类型和灵活依赖关系
 */
export interface AcceptancePlan {
  id: string;
  project_id: string;
  milestone_id?: string;           // 关联的里程碑ID
  
  // 类型信息（支持自定义）
  type_id: string;                 // 类型ID（引用AcceptanceType）
  type_name: string;               // 类型名称（冗余存储，便于展示）
  type_color: string;              // 类型颜色
  
  // 基本信息
  name: string;                    // 验收名称
  description?: string;            // 验收说明
  
  // 时间信息
  planned_date: string;            // 计划日期
  actual_date?: string;            // 实际日期
  
  // 状态
  status: AcceptanceStatus;
  
  // 依赖关系（非线性）
  depends_on: string[];            // 依赖的验收计划ID列表
  depended_by: string[];           // 被哪些验收依赖（后端计算）
  
  // 阶段分组
  phase?: string;                  // 所属阶段（如：phase1, phase2, phase3, phase4）
  phase_order: number;             // 阶段内排序
  
  // 位置信息（用于可视化布局）
  position?: {
    x: number;
    y: number;
  };
  
  // 关联数据
  responsible_user_id?: string;
  documents?: AcceptanceDocument[];
  nodes?: AcceptanceNode[];        // 验收节点（子任务）
  
  // 元数据
  is_system: boolean;              // 是否系统默认创建的
  created_at: string;
  updated_at: string;
  created_by?: string;
}

/**
 * 验收节点（子任务）
 */
export interface AcceptanceNode {
  id: string;
  acceptance_plan_id: string;
  name: string;
  description?: string;
  status: AcceptanceStatus;
  planned_date?: string;
  actual_date?: string;
  result?: AcceptanceResult;
  documents?: AcceptanceDocument[];
  notes?: string;
  accepted_by?: string;
  accepted_at?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  
  // 力导向图布局属性
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  
  // 类型关联
  typeId: string;
}

/**
 * 验收节点连接（依赖关系）
 */
export interface AcceptanceLink {
  id: string;
  source: string | AcceptanceNode;
  target: string | AcceptanceNode;
  type?: 'strong' | 'weak';
  created_at?: string;
}

/**
 * 验收结果
 */
export interface AcceptanceResult {
  passed: boolean;
  issues?: string[];
  comments?: string;
  attachments?: AcceptanceDocument[];
}

/**
 * 验收文档
 */
export interface AcceptanceDocument {
  id: string;
  name: string;
  url: string;
  file_type?: string;
  uploaded_at: string;
  uploaded_by?: string;
}

/**
 * 依赖关系（用于可视化）
 */
export interface AcceptanceDependency {
  from: string;                    // 源验收ID
  to: string;                      // 目标验收ID
  status: 'completed' | 'pending'; // 依赖状态
}

/**
 * 阶段分组
 */
export interface AcceptancePhase {
  id: string;                      // 阶段ID（phase1, phase2...）
  name: string;                    // 阶段名称
  order: number;                   // 排序
  plans: AcceptancePlan[];         // 该阶段的验收计划
}

/**
 * 验收统计
 */
export interface AcceptanceStats {
  total: number;
  passed: number;
  inProgress: number;
  pending: number;
  failed: number;
  completionRate: number;
}

/**
 * 将原始验收状态统一归一为系统标准状态
 */
export function normalizeAcceptanceStatus(status: string): AcceptanceStatus {
  const normalized = String(status ?? '').trim()
  const aliases: Record<string, AcceptanceStatus> = {
    pending: 'pending',
    in_progress: 'in_progress',
    passed: 'passed',
    failed: 'failed',
    needs_revision: 'needs_revision',
    '待验收': 'pending',
    '验收中': 'in_progress',
    '已通过': 'passed',
    '未通过': 'failed',
    '需补充': 'needs_revision',
  }

  return aliases[normalized] || aliases[normalized.toLowerCase()] || 'pending'
}

/**
 * 统一验收统计口径
 */
export function summarizeAcceptancePlans(plans: AcceptancePlan[]): AcceptanceStats {
  const total = plans.length
  const normalizedStatuses = plans.map((plan) => normalizeAcceptanceStatus(plan.status))
  const passed = normalizedStatuses.filter((status) => status === 'passed').length
  const inProgress = normalizedStatuses.filter((status) => status === 'pending' || status === 'in_progress').length
  const pending = normalizedStatuses.filter((status) => status === 'pending').length
  const failed = normalizedStatuses.filter((status) => status === 'failed' || status === 'needs_revision').length

  return {
    total,
    passed,
    inProgress,
    pending,
    failed,
    completionRate: total > 0 ? Math.round((passed / total) * 100) : 0,
  }
}

/**
 * 类型守卫
 */
export function isValidAcceptanceStatus(status: string): status is AcceptanceStatus {
  return ACCEPTANCE_STATUSES.includes(status as AcceptanceStatus);
}

/**
 * 获取验收类型的默认配置
 */
export function getDefaultAcceptanceType(typeId: string): AcceptanceType | undefined {
  return DEFAULT_ACCEPTANCE_TYPES.find(t => t.id === typeId);
}

/**
 * 获取类型颜色（支持自定义类型）
 */
export function getAcceptanceTypeColor(typeId: string, customTypes?: AcceptanceType[]): string {
  const allTypes = [...DEFAULT_ACCEPTANCE_TYPES, ...(customTypes || [])];
  const type = allTypes.find(t => t.id === typeId);
  return type?.color || 'bg-gray-500';
}

/**
 * 获取类型名称
 */
export function getAcceptanceTypeName(typeId: string, customTypes?: AcceptanceType[]): string {
  const allTypes = [...DEFAULT_ACCEPTANCE_TYPES, ...(customTypes || [])];
  const type = allTypes.find(t => t.id === typeId);
  return type?.name || typeId;
}

/**
 * 按阶段分组验收计划
 */
export function groupAcceptanceByPhase(plans: AcceptancePlan[]): AcceptancePhase[] {
  const phaseMap = new Map<string, AcceptancePhase>();
  
  plans.forEach(plan => {
    const phaseId = plan.phase || 'default';
    if (!phaseMap.has(phaseId)) {
      phaseMap.set(phaseId, {
        id: phaseId,
        name: getPhaseName(phaseId),
        order: getPhaseOrder(phaseId),
        plans: []
      });
    }
    phaseMap.get(phaseId)!.plans.push(plan);
  });
  
  // 排序并返回
  return Array.from(phaseMap.values())
    .sort((a, b) => a.order - b.order)
    .map(phase => ({
      ...phase,
      plans: phase.plans.sort((a, b) => a.phase_order - b.phase_order)
    }));
}

/**
 * 获取阶段名称
 */
function getPhaseName(phaseId: string): string {
  const names: Record<string, string> = {
    phase1: '第一阶段：预验收',
    phase2: '第二阶段：四方验收',
    phase3: '第三阶段：专项验收',
    phase4: '第四阶段：竣工备案',
    default: '其他'
  };
  return names[phaseId] || phaseId;
}

/**
 * 获取阶段排序
 */
function getPhaseOrder(phaseId: string): number {
  const orders: Record<string, number> = {
    phase1: 1,
    phase2: 2,
    phase3: 3,
    phase4: 4,
    default: 99
  };
  return orders[phaseId] || 99;
}

/**
 * 计算依赖关系
 * 返回所有依赖边，用于绘制箭头
 */
export function calculateDependencies(plans: AcceptancePlan[]): AcceptanceDependency[] {
  const deps: AcceptanceDependency[] = [];
  const planMap = new Map(plans.map(p => [p.id, p]));
  
  plans.forEach(plan => {
    plan.depends_on.forEach(depId => {
      const depPlan = planMap.get(depId);
      if (depPlan) {
        deps.push({
          from: depId,
          to: plan.id,
          status: depPlan.status === 'passed' ? 'completed' : 'pending'
        });
      }
    });
  });
  
  return deps;
}

/**
 * 检查验收是否被阻塞（前置依赖未完成）
 */
export function isAcceptanceBlocked(plan: AcceptancePlan, allPlans: AcceptancePlan[]): boolean {
  if (!plan.depends_on || plan.depends_on.length === 0) return false;
  
  const planMap = new Map(allPlans.map(p => [p.id, p]));
  
  return plan.depends_on.some(depId => {
    const dep = planMap.get(depId);
    return !dep || dep.status !== 'passed';
  });
}

/**
 * 获取验收的阻塞原因
 */
export function getAcceptanceBlockReasons(plan: AcceptancePlan, allPlans: AcceptancePlan[]): string[] {
  if (!plan.depends_on || plan.depends_on.length === 0) return [];
  
  const planMap = new Map(allPlans.map(p => [p.id, p]));
  const reasons: string[] = [];
  
  plan.depends_on.forEach(depId => {
    const dep = planMap.get(depId);
    if (!dep) {
      reasons.push(`前置验收不存在: ${depId}`);
    } else if (dep.status !== 'passed') {
      reasons.push(`等待: ${dep.name} (${ACCEPTANCE_STATUS_NAMES[dep.status]})`);
    }
  });
  
  return reasons;
}
