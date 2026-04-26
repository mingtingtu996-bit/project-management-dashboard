import type {
  ConditionFormData,
  CertificateWorkItemFormData,
  PreMilestone,
  PreMilestoneFormData,
} from './types'
import { CERTIFICATE_TYPE_LABELS, CERTIFICATE_TYPE_REGISTRY } from './types'
import { STATUS_THEME } from '@/lib/statusTheme'

export const DB_TO_DISPLAY: Record<string, PreMilestone['status']> = {
  待申请: '未开始',
  办理中: '进行中',
  已取得: '已完成',
  已过期: '已延期',
  需延期: '已延期',
}

export const DISPLAY_TO_DB: Record<string, string> = {
  未开始: '待申请',
  进行中: '办理中',
  已完成: '已取得',
  已延期: '需延期',
  已作废: '需延期',
}

export const PROCESS_STEPS = ['申请', '受理', '审核', '批准', '发证'] as const

export const CERTIFICATE_ORDER = CERTIFICATE_TYPE_REGISTRY.map((entry) => ({
  id: entry.type,
  label: entry.label,
}))

export function getCertificateTypeLabel(type?: string | null) {
  const normalized = String(type ?? '').trim()
  if (!normalized) return '待补全'

  return (
    CERTIFICATE_TYPE_REGISTRY.find(
      (entry) => entry.type === normalized || entry.aliases?.some((alias) => alias === normalized),
    )?.label ||
    CERTIFICATE_TYPE_LABELS[normalized as keyof typeof CERTIFICATE_TYPE_LABELS] ||
    normalized
  )
}

export const CERTIFICATE_STAGE_SEQUENCE = ['资料准备', '内部报审', '外部报批', '批复领证'] as const

export const CERTIFICATE_STAGE_DESCRIPTIONS: Record<(typeof CERTIFICATE_STAGE_SEQUENCE)[number], string> = {
  资料准备: '收集、核验、整理',
  内部报审: '内部审核、流转报审',
  外部报批: '对外报批、等待批复',
  批复领证: '领证收口、落地完成',
}

export const CERTIFICATE_STATUS_LABELS: Record<string, string> = {
  pending: '待启动',
  in_progress: '进行中',
  submitted: '已申报',
  preparing_documents: '资料准备中',
  internal_review: '报审中',
  external_submission: '报批中',
  supplement_required: '待补正',
  completed: '已完成',
  blocked: '已阻塞',
  cancelled: '已取消',
  approved: '已批复',
  issued: '已领证',
  expired: '已失效',
  voided: '已作废',
}

export const CERTIFICATE_STATUS_THEME_KEYS: Record<string, string> = {
  pending: 'pending',
  in_progress: 'investigating',
  submitted: 'warning',
  preparing_documents: 'pending',
  internal_review: 'investigating',
  external_submission: 'warning',
  supplement_required: 'warning',
  completed: 'completed',
  blocked: 'delayed',
  cancelled: 'closed',
  approved: 'completed',
  issued: 'completed',
  expired: 'delayed',
  voided: 'closed',
}

export const CERTIFICATE_STAGE_BADGES: Record<string, string> = {
  资料准备: STATUS_THEME.pending.className,
  内部报审: STATUS_THEME.investigating.className,
  外部报批: STATUS_THEME.warning.className,
  批复领证: STATUS_THEME.completed.className,
}

export function createEmptyWorkItemForm(): CertificateWorkItemFormData {
  return {
    item_code: '',
    item_name: '',
    item_stage: '资料准备',
    status: 'pending',
    planned_finish_date: '',
    actual_finish_date: '',
    approving_authority: '',
    is_shared: false,
    next_action: '',
    next_action_due_date: '',
    is_blocked: false,
    block_reason: '',
    sort_order: 0,
    notes: '',
    certificate_ids: [] as string[],
  }
}

export function mapCertificateStatusLabel(status: string | null | undefined) {
  return CERTIFICATE_STATUS_LABELS[String(status ?? 'pending')] || String(status ?? '待启动')
}

export function getCertificateStatusThemeKey(status: string | null | undefined) {
  return CERTIFICATE_STATUS_THEME_KEYS[String(status ?? 'pending')] || CERTIFICATE_STATUS_THEME_KEYS.pending
}

export function certificateStageBadge(stage: string | null | undefined) {
  return CERTIFICATE_STAGE_BADGES[String(stage ?? '资料准备')] || CERTIFICATE_STAGE_BADGES['资料准备']
}

export const MILESTONE_NAME_OPTIONS = [
  '国有土地使用证',
  '不动产证',
  '建设工程规划许可证',
  '建筑工程施工许可证',
  '商品房预售许可证',
  '不动产权证',
  '房产证',
  '人防验收',
  '消防验收',
  '环保验收',
  '竣工验收备案',
]

export const QUICK_MILESTONE_TYPES = ['土地证', '规划证', '施工证', '预售证', '产权证']

export const MILESTONE_NAME_TO_TYPE_MAP: Record<string, string> = {
  土地证: '土地证',
  国有土地使用证: '土地证',
  不动产证: '土地证',
  规划证: '规划证',
  建设工程规划许可证: '规划证',
  施工证: '施工证',
  建筑工程施工许可证: '施工证',
  预售证: '预售证',
  商品房预售许可证: '预售证',
  产权证: '产权证',
  不动产权证: '产权证',
  房产证: '产权证',
}

export function createMilestoneFormData(
  projectId: string,
  sortOrder: number,
  milestone?: PreMilestone | null,
): PreMilestoneFormData {
  if (milestone) {
    return {
      project_id: milestone.project_id,
      milestone_type: milestone.milestone_type,
      name: milestone.name,
      description: milestone.description || '',
      lead_unit: milestone.lead_unit || '',
      planned_start_date: milestone.planned_start_date || '',
      planned_end_date: milestone.planned_end_date || '',
      responsible_user_id: milestone.responsible_user_id || '',
      sort_order: milestone.sort_order,
      notes: milestone.notes || '',
      status: milestone.status || '未开始',
      certificate_no: milestone.certificate_no || '',
      issue_date: '',
      expiry_date: '',
      issuing_authority: '',
      phase_id: '',
    }
  }

  return {
    project_id: projectId,
    milestone_type: '',
    name: '',
    description: '',
    lead_unit: '',
    planned_start_date: '',
    planned_end_date: '',
    responsible_user_id: '',
    sort_order: sortOrder,
    notes: '',
    status: '未开始',
    certificate_no: '',
    issue_date: '',
    expiry_date: '',
    issuing_authority: '',
    phase_id: '',
  }
}

export function createEmptyConditionForm(): ConditionFormData {
  return {
    condition_type: '',
    condition_name: '',
    description: '',
    target_date: '',
  }
}

export function getProcessStep(milestone: PreMilestone): number {
  switch (milestone.status) {
    case '未开始':
      return -1
    case '进行中': {
      if (!milestone.planned_start_date || !milestone.planned_end_date) {
        return 1
      }
      const start = new Date(milestone.planned_start_date).getTime()
      const end = new Date(milestone.planned_end_date).getTime()
      const now = Date.now()
      const progress = Math.min(1, Math.max(0, (now - start) / (end - start)))
      return Math.floor(progress * 4)
    }
    case '已完成':
      return 4
    case '已延期':
      return 1
    case '已取消':
      return -1
    default:
      return -1
  }
}

export function getProgressPercent(milestone: PreMilestone): number {
  switch (milestone.status) {
    case '未开始':
      return 0
    case '进行中': {
      if (!milestone.planned_start_date || !milestone.planned_end_date) {
        return 30
      }
      const start = new Date(milestone.planned_start_date).getTime()
      const end = new Date(milestone.planned_end_date).getTime()
      const now = Date.now()
      return Math.min(90, Math.max(10, Math.round(((now - start) / (end - start)) * 100)))
    }
    case '已完成':
      return 100
    case '已延期':
      return 60
    case '已取消':
      return 0
    default:
      return 0
  }
}
