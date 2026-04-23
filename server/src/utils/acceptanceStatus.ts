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

const ACCEPTANCE_STATUS_SET = new Set<string>(ACCEPTANCE_STATUSES)

const ACCEPTANCE_STATUS_ALIASES: Record<string, AcceptanceStatus> = {
  draft: 'draft',
  not_started: 'draft',
  pending: 'draft',
  preparing: 'preparing',
  ready_to_submit: 'ready_to_submit',
  ready: 'ready_to_submit',
  submitted: 'submitted',
  in_acceptance: 'inspecting',
  inspecting: 'inspecting',
  rectification: 'rectifying',
  rectifying: 'rectifying',
  passed: 'passed',
  recorded: 'archived',
  archived: 'archived',
  closed: 'archived',
  '草稿': 'draft',
  '未启动': 'draft',
  '待启动': 'draft',
  '准备中': 'preparing',
  '待申报': 'ready_to_submit',
  '已申报': 'submitted',
  '验收中': 'inspecting',
  '整改中': 'rectifying',
  '补正中': 'rectifying',
  '已通过': 'passed',
  '已备案': 'archived',
  '已归档': 'archived',
  '已关闭': 'archived',
}

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

export const ACCEPTANCE_STATUS_TRANSITIONS: Record<AcceptanceStatus, AcceptanceStatus[]> = {
  draft: ['preparing', 'ready_to_submit', 'submitted'],
  preparing: ['ready_to_submit', 'submitted', 'rectifying'],
  ready_to_submit: ['submitted', 'inspecting', 'rectifying'],
  submitted: ['inspecting', 'rectifying', 'passed'],
  inspecting: ['rectifying', 'passed'],
  rectifying: ['preparing', 'ready_to_submit', 'submitted', 'inspecting', 'passed'],
  passed: ['archived'],
  archived: [],
}

export const ACTIVE_ACCEPTANCE_STATUSES: AcceptanceStatus[] = [
  'draft',
  'preparing',
  'ready_to_submit',
  'submitted',
  'inspecting',
  'rectifying',
]

export const IN_PROGRESS_ACCEPTANCE_STATUSES: AcceptanceStatus[] = [
  'preparing',
  'ready_to_submit',
  'submitted',
  'inspecting',
]

export const FAILED_ACCEPTANCE_STATUSES: AcceptanceStatus[] = ['rectifying']

export const PASSED_ACCEPTANCE_STATUSES: AcceptanceStatus[] = ['passed', 'archived']

export function parseAcceptanceStatus(value?: string | null): AcceptanceStatus | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized) return null
  if (ACCEPTANCE_STATUS_SET.has(normalized)) {
    return normalized as AcceptanceStatus
  }

  const lowerCased = normalized.toLowerCase()
  return ACCEPTANCE_STATUS_ALIASES[normalized] || ACCEPTANCE_STATUS_ALIASES[lowerCased] || null
}

export function normalizeAcceptanceStatus(value?: string | null): AcceptanceStatus {
  return parseAcceptanceStatus(value) ?? 'draft'
}

export function acceptanceStatusLabel(value?: string | null): string {
  const normalized = normalizeAcceptanceStatus(value)
  return ACCEPTANCE_STATUS_NAMES[normalized]
}
