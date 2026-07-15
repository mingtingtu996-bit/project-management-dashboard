import { getClient } from '../database.js'
import { supabase } from './dbService.js'

// DB-backed status dictionary service with builtin fallback.
const STATUS_NORMALIZATION_CACHE_TTL_MS = 5 * 60 * 1000
const STATUS_NORMALIZATION_CACHE_MAX = 500

type StatusNormalizationCacheEntry = {
  expiresAt: number
  value: Promise<string>
}

const statusNormalizationCache = new Map<string, StatusNormalizationCacheEntry>()

const BUILTIN_ALIASES: Record<string, Record<string, string>> = {
  'task.lifecycle': {
    'not_started': 'todo', '未开始': 'todo', '': 'pending',
    '进行中': 'in_progress', '已完成': 'completed', 'done': 'completed',
    'delayed': 'blocked', 'on_hold': 'blocked',
    '已取消': 'cancelled', 'voided': 'cancelled', 'archived': 'cancelled', 'deleted': 'cancelled',
  },
  'project.lifecycle': {
    '未开始': 'not_started', '进行中': 'in_progress', '已完成': 'completed', '已暂停': 'paused',
  },
}

const BUILTIN_LABELS: Record<string, Record<string, { label: string; tone: string }>> = {
  'task.lifecycle': {
    'todo': { label: '待办', tone: 'slate' },
    'pending': { label: '待定', tone: 'slate' },
    'in_progress': { label: '进行中', tone: 'blue' },
    'blocked': { label: '受阻', tone: 'amber' },
    'completed': { label: '已完成', tone: 'green' },
    'cancelled': { label: '已取消', tone: 'slate' },
  },
  'task.business_status': {
    'pending': { label: '未开始', tone: 'slate' },
    'pending_conditions': { label: '待开工', tone: 'amber' },
    'ready': { label: '可开工', tone: 'green' },
    'in_progress': { label: '进行中', tone: 'blue' },
    'progress_warning': { label: '执行预警', tone: 'amber' },
    'partial_blocked': { label: '部分受影响', tone: 'amber' },
    'blocked_by_obstacle': { label: '受阻', tone: 'red' },
    'completed': { label: '已完成', tone: 'green' },
    'cancelled': { label: '已取消', tone: 'slate' },
  },
  'task.lag_status': {
    'none': { label: '正常', tone: 'green' },
    'mild': { label: '轻度滞后', tone: 'amber' },
    'moderate': { label: '中度滞后', tone: 'amber' },
    'severe': { label: '严重滞后', tone: 'red' },
  },
  'task.due_status': {
    'normal': { label: '正常', tone: 'slate' },
    'approaching': { label: '临期', tone: 'blue' },
    'urgent': { label: '紧急', tone: 'amber' },
    'overdue': { label: '逾期', tone: 'red' },
  },
  'risk.lifecycle': {
    'identified': { label: '已识别', tone: 'amber' },
    'mitigating': { label: '缓解中', tone: 'blue' },
    'closed': { label: '已关闭', tone: 'green' },
  },
  'issue.lifecycle': {
    'open': { label: '未解决', tone: 'red' },
    'investigating': { label: '调查中', tone: 'amber' },
    'resolved': { label: '已解决', tone: 'blue' },
    'closed': { label: '已关闭', tone: 'green' },
  },
  'condition.lifecycle': {
    'open': { label: '待满足', tone: 'slate' },
    'met': { label: '已满足', tone: 'blue' },
    'confirmed': { label: '已确认', tone: 'green' },
    'blocked': { label: '受阻', tone: 'amber' },
    'closed': { label: '已关闭', tone: 'green' },
  },
  'obstacle.lifecycle': {
    'open': { label: '待处理', tone: 'amber' },
    'resolving': { label: '处理中', tone: 'blue' },
    'resolved': { label: '已解决', tone: 'green' },
    'closed': { label: '已关闭', tone: 'green' },
    'unresolvable': { label: '无法解决', tone: 'red' },
  },
  'acceptance.lifecycle': {
    'draft': { label: '草稿', tone: 'slate' },
    'preparing': { label: '准备中', tone: 'blue' },
    'ready_to_submit': { label: '待报验', tone: 'amber' },
    'submitted': { label: '已报验', tone: 'amber' },
    'inspecting': { label: '验收中', tone: 'blue' },
    'rectifying': { label: '整改中', tone: 'red' },
    'passed': { label: '已通过', tone: 'green' },
    'archived': { label: '已归档', tone: 'green' },
  },
  'project.lifecycle': {
    'not_started': { label: '未开始', tone: 'slate' },
    'in_progress': { label: '进行中', tone: 'blue' },
    'completed': { label: '已完成', tone: 'green' },
    'paused': { label: '已暂停', tone: 'amber' },
  },
  'project.health': {
    'healthy': { label: '健康', tone: 'green' },
    'warning': { label: '亚健康', tone: 'amber' },
    'critical': { label: '预警', tone: 'red' },
    'danger': { label: '危险', tone: 'red' },
  },
  'baseline.lifecycle': {
    'draft': { label: '草稿', tone: 'slate' },
    'confirmed': { label: '已确认', tone: 'green' },
    'closed': { label: '已关闭', tone: 'slate' },
    'revising': { label: '修订中', tone: 'amber' },
    'pending_realign': { label: '待重整', tone: 'amber' },
    'archived': { label: '已归档', tone: 'slate' },
  },
  'monthly_plan.lifecycle': {
    'draft': { label: '草稿', tone: 'slate' },
    'confirmed': { label: '已确认', tone: 'green' },
    'closed': { label: '已关闭', tone: 'slate' },
    'revising': { label: '修订中', tone: 'amber' },
    'pending_realign': { label: '待重整', tone: 'amber' },
  },
  'milestone.lifecycle': {
    'pending': { label: '待完成', tone: 'slate' },
    'in_progress': { label: '进行中', tone: 'blue' },
    'completed': { label: '已完成', tone: 'green' },
    'overdue': { label: '已逾期', tone: 'red' },
  },
  'warning.lifecycle': {
    'unread': { label: '未读', tone: 'amber' },
    'acknowledged': { label: '已确认', tone: 'blue' },
    'muted': { label: '已静默', tone: 'slate' },
    'escalated': { label: '已升级', tone: 'red' },
    'resolved': { label: '已解决', tone: 'green' },
    'archived': { label: '已归档', tone: 'slate' },
    'closed': { label: '已关闭', tone: 'green' },
  },
  'notification.lifecycle': {
    'unread': { label: '未读', tone: 'slate' },
    'read': { label: '已读', tone: 'slate' },
    'archived': { label: '已归档', tone: 'slate' },
  },
  'material.lifecycle': {
    'active': { label: '待使用', tone: 'slate' },
    'used': { label: '已投入', tone: 'blue' },
    'consumed': { label: '已消耗', tone: 'green' },
    'archived': { label: '已归档', tone: 'slate' },
    'voided': { label: '已作废', tone: 'slate' },
  },
  'certificate.lifecycle': {
    'pending': { label: '待办理', tone: 'slate' },
    'preparing_documents': { label: '资料准备中', tone: 'blue' },
    'internal_review': { label: '内部报审', tone: 'amber' },
    'external_submission': { label: '外部报批', tone: 'amber' },
    'supplement_required': { label: '需补正', tone: 'red' },
    'approved': { label: '已批复', tone: 'blue' },
    'issued': { label: '已取得', tone: 'green' },
    'expired': { label: '已过期', tone: 'red' },
    'voided': { label: '已作废', tone: 'slate' },
  },
  'drawing.lifecycle': {
    'preparing': { label: '编制中', tone: 'slate' },
    'reviewing': { label: '审图中', tone: 'blue' },
    'revising': { label: '修改中', tone: 'amber' },
    'issued': { label: '已出图', tone: 'blue' },
    'completed': { label: '已完成', tone: 'green' },
    'voided': { label: '已作废', tone: 'slate' },
  },
  'drawing.review_status': {
    'not_submitted': { label: '未提交', tone: 'slate' },
    'reviewing': { label: '审查中', tone: 'blue' },
    'approved': { label: '已通过', tone: 'green' },
    'rejected': { label: '已驳回', tone: 'red' },
    'revision_required': { label: '需修改', tone: 'amber' },
  },
  'wbs_template.lifecycle': {
    'draft': { label: '草稿', tone: 'slate' },
    'published': { label: '已发布', tone: 'green' },
    'disabled': { label: '已禁用', tone: 'slate' },
  },
  'engineering_object.activation': {
    'active': { label: '启用', tone: 'green' },
    'inactive': { label: '停用', tone: 'slate' },
  },
  'engineering_category.activation': {
    'enabled': { label: '启用', tone: 'green' },
    'disabled': { label: '禁用', tone: 'slate' },
  },
  'invitation.lifecycle': {
    'active': { label: '有效', tone: 'green' },
    'used': { label: '已使用', tone: 'blue' },
    'revoked': { label: '已撤销', tone: 'red' },
    'expired': { label: '已过期', tone: 'slate' },
  },
  'data_quality.finding_status': {
    'active': { label: '活跃', tone: 'amber' },
    'resolved': { label: '已解决', tone: 'green' },
    'ignored': { label: '已忽略', tone: 'slate' },
  },
}

function resolveBuiltinStatus(domainKey: string, raw: string): string | null {
  const domainAliases = BUILTIN_ALIASES[domainKey]
  if (domainAliases && domainAliases[raw] !== undefined) return domainAliases[raw]
  if (domainAliases && domainAliases[raw.toLowerCase()] !== undefined) return domainAliases[raw.toLowerCase()]

  const domainLabels = BUILTIN_LABELS[domainKey]
  if (domainLabels && domainLabels[raw]) return raw

  return null
}

const BOOTSTRAP_DOMAINS: Array<{
  domain_key: string
  domain_name: string
  domain_group: string
  status_kind: 'lifecycle' | 'derived' | 'stage' | 'activation' | 'adjacent' | 'technical'
}> = [
  { domain_key: 'task.lifecycle', domain_name: '任务生命周期', domain_group: 'task', status_kind: 'lifecycle' },
  { domain_key: 'task.business_status', domain_name: '任务业务状态', domain_group: 'task', status_kind: 'derived' },
  { domain_key: 'task.lag_status', domain_name: '任务滞后状态', domain_group: 'task', status_kind: 'derived' },
  { domain_key: 'task.due_status', domain_name: '任务到期状态', domain_group: 'task', status_kind: 'derived' },
  { domain_key: 'baseline.lifecycle', domain_name: '项目基线生命周期', domain_group: 'planning', status_kind: 'lifecycle' },
  { domain_key: 'monthly_plan.lifecycle', domain_name: '月度计划生命周期', domain_group: 'planning', status_kind: 'lifecycle' },
  { domain_key: 'milestone.lifecycle', domain_name: '里程碑生命周期', domain_group: 'milestone', status_kind: 'lifecycle' },
  { domain_key: 'condition.lifecycle', domain_name: '条件生命周期', domain_group: 'condition', status_kind: 'lifecycle' },
  { domain_key: 'obstacle.lifecycle', domain_name: '阻碍生命周期', domain_group: 'obstacle', status_kind: 'lifecycle' },
  { domain_key: 'risk.lifecycle', domain_name: '风险生命周期', domain_group: 'risk', status_kind: 'lifecycle' },
  { domain_key: 'issue.lifecycle', domain_name: '问题生命周期', domain_group: 'issue', status_kind: 'lifecycle' },
  { domain_key: 'warning.lifecycle', domain_name: '预警生命周期', domain_group: 'warning', status_kind: 'lifecycle' },
  { domain_key: 'notification.lifecycle', domain_name: '通知生命周期', domain_group: 'notification', status_kind: 'lifecycle' },
  { domain_key: 'acceptance.lifecycle', domain_name: '验收生命周期', domain_group: 'acceptance', status_kind: 'lifecycle' },
  { domain_key: 'certificate.lifecycle', domain_name: '证照生命周期', domain_group: 'certificate', status_kind: 'lifecycle' },
  { domain_key: 'certificate.stage', domain_name: '证照阶段', domain_group: 'certificate', status_kind: 'stage' },
  { domain_key: 'drawing.lifecycle', domain_name: '图纸生命周期', domain_group: 'drawing', status_kind: 'lifecycle' },
  { domain_key: 'drawing.review_status', domain_name: '图纸审查状态', domain_group: 'drawing', status_kind: 'derived' },
  { domain_key: 'project.lifecycle', domain_name: '项目生命周期', domain_group: 'project', status_kind: 'lifecycle' },
  { domain_key: 'project.phase', domain_name: '项目阶段', domain_group: 'project', status_kind: 'stage' },
  { domain_key: 'project.health', domain_name: '项目健康状态', domain_group: 'project', status_kind: 'derived' },
  { domain_key: 'material.lifecycle', domain_name: '材料生命周期', domain_group: 'material', status_kind: 'lifecycle' },
  { domain_key: 'material.derived_status', domain_name: '材料派生状态', domain_group: 'material', status_kind: 'derived' },
  { domain_key: 'wbs_template.lifecycle', domain_name: 'WBS模板生命周期', domain_group: 'template', status_kind: 'lifecycle' },
  { domain_key: 'engineering_object.activation', domain_name: '工程对象启停', domain_group: 'master_data', status_kind: 'activation' },
  { domain_key: 'engineering_category.activation', domain_name: '工程分类启停', domain_group: 'master_data', status_kind: 'activation' },
  { domain_key: 'invitation.lifecycle', domain_name: '邀请生命周期', domain_group: 'collaboration', status_kind: 'lifecycle' },
  { domain_key: 'data_quality.finding_status', domain_name: '数据质量发现状态', domain_group: 'governance', status_kind: 'lifecycle' },
  { domain_key: 'data_quality.confidence_flag', domain_name: '数据可靠性', domain_group: 'governance', status_kind: 'adjacent' },
  { domain_key: 'task_completion.efficiency_status', domain_name: '任务完成效率', domain_group: 'task', status_kind: 'derived' },
  { domain_key: 'progress_deviation.row_status', domain_name: '进度偏差行状态', domain_group: 'report', status_kind: 'derived' },
  { domain_key: 'delay_signal.derived_status', domain_name: '延期信号派生', domain_group: 'task', status_kind: 'derived' },
]

const TERMINAL_STATUS_KEYS = new Set([
  'completed',
  'cancelled',
  'closed',
  'archived',
  'passed',
  'issued',
  'expired',
  'voided',
  'disabled',
  'inactive',
  'used',
  'revoked',
  'ignored',
])

const BOOTSTRAP_TRANSITIONS: Array<{ domain_key: string; from_status: string; to_status: string }> = [
  { domain_key: 'task.lifecycle', from_status: 'pending', to_status: 'todo' },
  { domain_key: 'task.lifecycle', from_status: 'todo', to_status: 'in_progress' },
  { domain_key: 'task.lifecycle', from_status: 'pending', to_status: 'in_progress' },
  { domain_key: 'task.lifecycle', from_status: 'in_progress', to_status: 'blocked' },
  { domain_key: 'task.lifecycle', from_status: 'in_progress', to_status: 'completed' },
  { domain_key: 'task.lifecycle', from_status: 'blocked', to_status: 'in_progress' },
  { domain_key: 'task.lifecycle', from_status: 'todo', to_status: 'cancelled' },
  { domain_key: 'task.lifecycle', from_status: 'pending', to_status: 'cancelled' },
  { domain_key: 'task.lifecycle', from_status: 'in_progress', to_status: 'cancelled' },
  { domain_key: 'task.lifecycle', from_status: 'blocked', to_status: 'cancelled' },
  { domain_key: 'risk.lifecycle', from_status: 'identified', to_status: 'mitigating' },
  { domain_key: 'risk.lifecycle', from_status: 'identified', to_status: 'closed' },
  { domain_key: 'risk.lifecycle', from_status: 'mitigating', to_status: 'closed' },
  { domain_key: 'risk.lifecycle', from_status: 'closed', to_status: 'identified' },
  { domain_key: 'issue.lifecycle', from_status: 'open', to_status: 'investigating' },
  { domain_key: 'issue.lifecycle', from_status: 'open', to_status: 'closed' },
  { domain_key: 'issue.lifecycle', from_status: 'investigating', to_status: 'resolved' },
  { domain_key: 'issue.lifecycle', from_status: 'investigating', to_status: 'closed' },
  { domain_key: 'issue.lifecycle', from_status: 'resolved', to_status: 'closed' },
  { domain_key: 'issue.lifecycle', from_status: 'resolved', to_status: 'investigating' },
  { domain_key: 'baseline.lifecycle', from_status: 'draft', to_status: 'confirmed' },
  { domain_key: 'baseline.lifecycle', from_status: 'confirmed', to_status: 'closed' },
  { domain_key: 'baseline.lifecycle', from_status: 'confirmed', to_status: 'revising' },
  { domain_key: 'baseline.lifecycle', from_status: 'revising', to_status: 'confirmed' },
  { domain_key: 'baseline.lifecycle', from_status: 'closed', to_status: 'archived' },
  { domain_key: 'baseline.lifecycle', from_status: 'draft', to_status: 'archived' },
  { domain_key: 'baseline.lifecycle', from_status: 'revising', to_status: 'archived' },
  { domain_key: 'baseline.lifecycle', from_status: 'confirmed', to_status: 'archived' },
  { domain_key: 'baseline.lifecycle', from_status: 'confirmed', to_status: 'pending_realign' },
  { domain_key: 'baseline.lifecycle', from_status: 'pending_realign', to_status: 'revising' },
  { domain_key: 'baseline.lifecycle', from_status: 'pending_realign', to_status: 'confirmed' },
  { domain_key: 'monthly_plan.lifecycle', from_status: 'draft', to_status: 'confirmed' },
  { domain_key: 'monthly_plan.lifecycle', from_status: 'confirmed', to_status: 'closed' },
  { domain_key: 'monthly_plan.lifecycle', from_status: 'confirmed', to_status: 'revising' },
  { domain_key: 'monthly_plan.lifecycle', from_status: 'revising', to_status: 'confirmed' },
  { domain_key: 'monthly_plan.lifecycle', from_status: 'draft', to_status: 'closed' },
  { domain_key: 'monthly_plan.lifecycle', from_status: 'revising', to_status: 'closed' },
  { domain_key: 'monthly_plan.lifecycle', from_status: 'confirmed', to_status: 'pending_realign' },
  { domain_key: 'monthly_plan.lifecycle', from_status: 'pending_realign', to_status: 'revising' },
  { domain_key: 'monthly_plan.lifecycle', from_status: 'pending_realign', to_status: 'confirmed' },
  { domain_key: 'condition.lifecycle', from_status: 'open', to_status: 'met' },
  { domain_key: 'condition.lifecycle', from_status: 'met', to_status: 'confirmed' },
  { domain_key: 'condition.lifecycle', from_status: 'open', to_status: 'blocked' },
  { domain_key: 'condition.lifecycle', from_status: 'blocked', to_status: 'open' },
  { domain_key: 'condition.lifecycle', from_status: 'met', to_status: 'closed' },
  { domain_key: 'condition.lifecycle', from_status: 'confirmed', to_status: 'closed' },
  { domain_key: 'condition.lifecycle', from_status: 'blocked', to_status: 'closed' },
  { domain_key: 'obstacle.lifecycle', from_status: 'open', to_status: 'resolving' },
  { domain_key: 'obstacle.lifecycle', from_status: 'resolving', to_status: 'resolved' },
  { domain_key: 'obstacle.lifecycle', from_status: 'resolved', to_status: 'closed' },
  { domain_key: 'obstacle.lifecycle', from_status: 'open', to_status: 'unresolvable' },
  { domain_key: 'obstacle.lifecycle', from_status: 'unresolvable', to_status: 'open' },
  { domain_key: 'obstacle.lifecycle', from_status: 'closed', to_status: 'open' },
  { domain_key: 'acceptance.lifecycle', from_status: 'draft', to_status: 'preparing' },
  { domain_key: 'acceptance.lifecycle', from_status: 'preparing', to_status: 'ready_to_submit' },
  { domain_key: 'acceptance.lifecycle', from_status: 'ready_to_submit', to_status: 'submitted' },
  { domain_key: 'acceptance.lifecycle', from_status: 'submitted', to_status: 'inspecting' },
  { domain_key: 'acceptance.lifecycle', from_status: 'inspecting', to_status: 'passed' },
  { domain_key: 'acceptance.lifecycle', from_status: 'inspecting', to_status: 'rectifying' },
  { domain_key: 'acceptance.lifecycle', from_status: 'rectifying', to_status: 'ready_to_submit' },
  { domain_key: 'acceptance.lifecycle', from_status: 'passed', to_status: 'archived' },
  { domain_key: 'acceptance.lifecycle', from_status: 'passed', to_status: 'rectifying' },
  { domain_key: 'material.lifecycle', from_status: 'active', to_status: 'used' },
  { domain_key: 'material.lifecycle', from_status: 'used', to_status: 'consumed' },
  { domain_key: 'material.lifecycle', from_status: 'consumed', to_status: 'used' },
  { domain_key: 'material.lifecycle', from_status: 'active', to_status: 'archived' },
  { domain_key: 'material.lifecycle', from_status: 'used', to_status: 'archived' },
  { domain_key: 'material.lifecycle', from_status: 'consumed', to_status: 'archived' },
  { domain_key: 'material.lifecycle', from_status: 'active', to_status: 'voided' },
  { domain_key: 'certificate.lifecycle', from_status: 'pending', to_status: 'preparing_documents' },
  { domain_key: 'certificate.lifecycle', from_status: 'preparing_documents', to_status: 'internal_review' },
  { domain_key: 'certificate.lifecycle', from_status: 'internal_review', to_status: 'external_submission' },
  { domain_key: 'certificate.lifecycle', from_status: 'external_submission', to_status: 'approved' },
  { domain_key: 'certificate.lifecycle', from_status: 'external_submission', to_status: 'supplement_required' },
  { domain_key: 'certificate.lifecycle', from_status: 'supplement_required', to_status: 'preparing_documents' },
  { domain_key: 'certificate.lifecycle', from_status: 'approved', to_status: 'issued' },
  { domain_key: 'certificate.lifecycle', from_status: 'issued', to_status: 'expired' },
  { domain_key: 'certificate.lifecycle', from_status: 'pending', to_status: 'voided' },
  { domain_key: 'certificate.lifecycle', from_status: 'preparing_documents', to_status: 'voided' },
  { domain_key: 'drawing.lifecycle', from_status: 'preparing', to_status: 'reviewing' },
  { domain_key: 'drawing.lifecycle', from_status: 'reviewing', to_status: 'revising' },
  { domain_key: 'drawing.lifecycle', from_status: 'revising', to_status: 'reviewing' },
  { domain_key: 'drawing.lifecycle', from_status: 'reviewing', to_status: 'issued' },
  { domain_key: 'drawing.lifecycle', from_status: 'issued', to_status: 'completed' },
  { domain_key: 'drawing.lifecycle', from_status: 'preparing', to_status: 'voided' },
  { domain_key: 'warning.lifecycle', from_status: 'unread', to_status: 'acknowledged' },
  { domain_key: 'warning.lifecycle', from_status: 'unread', to_status: 'muted' },
  { domain_key: 'warning.lifecycle', from_status: 'acknowledged', to_status: 'resolved' },
  { domain_key: 'warning.lifecycle', from_status: 'muted', to_status: 'resolved' },
  { domain_key: 'warning.lifecycle', from_status: 'unread', to_status: 'escalated' },
  { domain_key: 'warning.lifecycle', from_status: 'escalated', to_status: 'resolved' },
  { domain_key: 'warning.lifecycle', from_status: 'resolved', to_status: 'archived' },
  { domain_key: 'warning.lifecycle', from_status: 'archived', to_status: 'closed' },
  { domain_key: 'notification.lifecycle', from_status: 'unread', to_status: 'read' },
  { domain_key: 'notification.lifecycle', from_status: 'unread', to_status: 'archived' },
  { domain_key: 'notification.lifecycle', from_status: 'read', to_status: 'archived' },
  { domain_key: 'invitation.lifecycle', from_status: 'active', to_status: 'used' },
  { domain_key: 'invitation.lifecycle', from_status: 'active', to_status: 'revoked' },
  { domain_key: 'invitation.lifecycle', from_status: 'active', to_status: 'expired' },
  { domain_key: 'data_quality.finding_status', from_status: 'active', to_status: 'resolved' },
  { domain_key: 'data_quality.finding_status', from_status: 'active', to_status: 'ignored' },
]

export type StatusDictionaryBootstrapResult = {
  versionKey: string
  domainCount: number
  valueCount: number
  aliasCount: number
  transitionCount: number
}

function getSemanticTone(tone: string): string {
  if (tone === 'green') return 'closed'
  if (tone === 'red') return 'negative'
  if (tone === 'amber') return 'blocked'
  if (tone === 'blue') return 'active'
  return 'open'
}

function buildBootstrapValues() {
  return Object.entries(BUILTIN_LABELS).flatMap(([domainKey, values]) =>
    Object.entries(values).map(([statusKey, info], index) => ({
      domain_key: domainKey,
      status_key: statusKey,
      status_label: info.label,
      sort_order: index + 1,
      is_initial: getInitialStatus(domainKey) === statusKey,
      is_terminal: TERMINAL_STATUS_KEYS.has(statusKey),
      visual_tone: info.tone,
      semantic_tone: getSemanticTone(info.tone),
      dictionary_version: getActiveDictionaryVersion(),
    })),
  )
}

function buildBootstrapAliases() {
  return Object.entries(BUILTIN_ALIASES).flatMap(([domainKey, aliases]) =>
    Object.entries(aliases)
      .filter(([aliasValue]) => aliasValue.length > 0)
      .map(([aliasValue, statusKey]) => ({
        domain_key: domainKey,
        alias_value: aliasValue,
        status_key: statusKey,
        source_type: 'legacy',
        dictionary_version: getActiveDictionaryVersion(),
      })),
  )
}

export async function ensureStatusDictionaryBootstrapped(): Promise<StatusDictionaryBootstrapResult> {
  const versionKey = getActiveDictionaryVersion()
  const values = buildBootstrapValues()
  const aliases = buildBootstrapAliases()
  const client = await getClient()

  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO status_dictionary_versions (version_key, version_name, change_reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (version_key) DO UPDATE
       SET version_name = EXCLUDED.version_name,
           change_reason = EXCLUDED.change_reason`,
      [versionKey, `${versionKey} Status Dictionary`, 'Application bootstrap'],
    )

    for (const domain of BOOTSTRAP_DOMAINS) {
      await client.query(
        `INSERT INTO status_domains (domain_key, domain_name, domain_group, status_kind)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (domain_key) DO UPDATE
         SET domain_name = EXCLUDED.domain_name,
             domain_group = EXCLUDED.domain_group,
             status_kind = EXCLUDED.status_kind,
             updated_at = NOW()`,
        [domain.domain_key, domain.domain_name, domain.domain_group, domain.status_kind],
      )
    }

    for (const value of values) {
      await client.query(
        `INSERT INTO status_values (
           domain_key, status_key, status_label, sort_order, is_initial, is_terminal,
           visual_tone, semantic_tone, dictionary_version, is_active
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
         ON CONFLICT (domain_key, status_key) DO UPDATE
         SET status_label = EXCLUDED.status_label,
             sort_order = EXCLUDED.sort_order,
             is_initial = EXCLUDED.is_initial,
             is_terminal = EXCLUDED.is_terminal,
             visual_tone = EXCLUDED.visual_tone,
             semantic_tone = EXCLUDED.semantic_tone,
             dictionary_version = EXCLUDED.dictionary_version,
             is_active = true,
             updated_at = NOW()`,
        [
          value.domain_key,
          value.status_key,
          value.status_label,
          value.sort_order,
          value.is_initial,
          value.is_terminal,
          value.visual_tone,
          value.semantic_tone,
          value.dictionary_version,
        ],
      )
    }

    for (const alias of aliases) {
      await client.query(
        `INSERT INTO status_aliases (domain_key, alias_value, status_key, source_type, dictionary_version)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (domain_key, alias_value) DO UPDATE
         SET status_key = EXCLUDED.status_key,
             source_type = EXCLUDED.source_type,
             dictionary_version = EXCLUDED.dictionary_version`,
        [alias.domain_key, alias.alias_value, alias.status_key, alias.source_type, alias.dictionary_version],
      )
    }

    for (const transition of BOOTSTRAP_TRANSITIONS) {
      await client.query(
        `INSERT INTO status_transitions (domain_key, from_status, to_status, dictionary_version, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO UPDATE
         SET dictionary_version = EXCLUDED.dictionary_version,
             is_active = true`,
        [transition.domain_key, transition.from_status, transition.to_status, versionKey],
      )
    }

    await client.query('COMMIT')
    statusNormalizationCache.clear()
    return {
      versionKey,
      domainCount: BOOTSTRAP_DOMAINS.length,
      valueCount: values.length,
      aliasCount: aliases.length,
      transitionCount: BOOTSTRAP_TRANSITIONS.length,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function normalizeStatus(domainKey: string, rawStatus: unknown): Promise<string> {
  const raw = String(rawStatus ?? '').trim()
  const cacheKey = `${domainKey}:${raw}`
  const cached = statusNormalizationCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const value = normalizeStatusUncached(domainKey, raw)
  statusNormalizationCache.set(cacheKey, {
    expiresAt: Date.now() + STATUS_NORMALIZATION_CACHE_TTL_MS,
    value,
  })
  if (statusNormalizationCache.size > STATUS_NORMALIZATION_CACHE_MAX) {
    const firstKey = statusNormalizationCache.keys().next().value
    if (firstKey) statusNormalizationCache.delete(firstKey)
  }
  value.catch(() => {
    if (statusNormalizationCache.get(cacheKey)?.value === value) {
      statusNormalizationCache.delete(cacheKey)
    }
  })
  return value
}

async function normalizeStatusUncached(domainKey: string, raw: string): Promise<string> {
  if (!raw) return getInitialStatus(domainKey)

  const builtinStatus = resolveBuiltinStatus(domainKey, raw)
  if (builtinStatus) return builtinStatus

  // 1. Query DB status_aliases first
  try {
    const { data: alias } = await supabase
      .from('status_aliases')
      .select('status_key')
      .eq('domain_key', domainKey)
      .eq('alias_value', raw)
      .maybeSingle()
    if (alias) return (alias as any).status_key
  } catch { /* fallthrough */ }

  // 2. Check if raw is already a known status_key in DB
  try {
    const { data: val } = await supabase
      .from('status_values')
      .select('status_key')
      .eq('domain_key', domainKey)
      .eq('status_key', raw)
      .eq('is_active', true)
      .maybeSingle()
    if (val) return (val as any).status_key
  } catch { /* fallthrough */ }

  return getInitialStatus(domainKey)
}

export function getStatusLabel(domainKey: string, statusKey: string): string {
  return BUILTIN_LABELS[domainKey]?.[statusKey]?.label ?? statusKey
}

export function getVisualTone(domainKey: string, statusKey: string): string {
  return BUILTIN_LABELS[domainKey]?.[statusKey]?.tone ?? 'slate'
}

export async function mapLegacyStatus(domainKey: string, rawStatus: unknown): Promise<string> {
  return normalizeStatus(domainKey, rawStatus)
}

export async function assertTransition(domainKey: string, fromStatus: string, toStatus: string): Promise<void> {
  const allowed = await canTransition(domainKey, fromStatus, toStatus)
  if (!allowed) {
    throw Object.assign(
      new Error(`状态流转不允许: ${domainKey} ${fromStatus} -> ${toStatus}`),
      { code: 'STATUS_TRANSITION_FORBIDDEN', statusCode: 400 },
    )
  }
}

function getInitialStatus(domainKey: string): string {
  const defaults: Record<string, string> = {
    'task.lifecycle': 'pending',
    'risk.lifecycle': 'identified',
    'issue.lifecycle': 'open',
    'condition.lifecycle': 'open',
    'obstacle.lifecycle': 'open',
    'acceptance.lifecycle': 'draft',
    'project.lifecycle': 'not_started',
    'baseline.lifecycle': 'draft',
    'monthly_plan.lifecycle': 'draft',
    'milestone.lifecycle': 'pending',
    'warning.lifecycle': 'unread',
    'notification.lifecycle': 'unread',
    'material.lifecycle': 'active',
    'certificate.lifecycle': 'pending',
    'drawing.lifecycle': 'preparing',
    'drawing.review_status': 'not_submitted',
    'wbs_template.lifecycle': 'draft',
    'engineering_object.activation': 'active',
    'engineering_category.activation': 'enabled',
    'invitation.lifecycle': 'active',
    'data_quality.finding_status': 'active',
  }
  return defaults[domainKey] ?? 'pending'
}

export function getActiveDictionaryVersion(): string {
  return 'v1.4.5'
}

// DB-backed query functions

export async function getStatusValue(domainKey: string, statusKey: string) {
  const { data } = await supabase
    .from('status_values')
    .select('*')
    .eq('domain_key', domainKey)
    .eq('status_key', statusKey)
    .maybeSingle()
  if (data) return data
  // Fallback to builtin
  const info = BUILTIN_LABELS[domainKey]?.[statusKey]
  if (!info) return null
  return { domain_key: domainKey, status_key: statusKey, status_label: info.label, visual_tone: info.tone, semantic_tone: info.tone, dictionary_version: 'v1.4.5', status_kind: 'lifecycle' }
}

export async function listStatusValues(domainKey: string) {
  const { data } = await supabase
    .from('status_values')
    .select('*')
    .eq('domain_key', domainKey)
    .eq('is_active', true)
    .order('sort_order')
  if (data && data.length > 0) return data
  // Fallback
  return Object.entries(BUILTIN_LABELS[domainKey] ?? {}).map(([k, v]) => ({
    domain_key: domainKey, status_key: k, status_label: v.label, visual_tone: v.tone, semantic_tone: v.tone, is_active: true,
  }))
}

export async function canTransition(domainKey: string, fromStatus: string, toStatus: string): Promise<boolean> {
  const { data } = await supabase
    .from('status_transitions')
    .select('id')
    .eq('domain_key', domainKey)
    .eq('from_status', fromStatus)
    .eq('to_status', toStatus)
    .eq('is_active', true)
    .maybeSingle()
  return !!data
}


/** Build standard status DTO with domainKey, statusKey, label, tone, dictionaryVersion */
export function buildStatusDTO(domainKey: string, statusKey: string) {
  const info = BUILTIN_LABELS[domainKey]?.[statusKey]
  return {
    statusDomain: domainKey,
    statusKey,
    statusLabel: info?.label ?? statusKey,
    visualTone: info?.tone ?? 'slate',
    semanticTone: info?.tone ?? 'slate',
    statusKind: 'lifecycle',
    dictionaryVersion: 'v1.4.5',
  }
}
