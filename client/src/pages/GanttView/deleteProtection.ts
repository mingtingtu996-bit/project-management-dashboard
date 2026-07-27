export type DeleteProtectionDetails = {
  entity_type?: string
  entity_id?: string
  reason_code?: string | null
  resolved_action?: string | null
  execution_mode?: string | null
  requires_user_confirmation?: boolean
  decision_token?: string | null
  decisionToken?: string | null
  status?: string | null
  progress?: number | null
  child_task_count?: number
  condition_count?: number
  obstacle_count?: number
  acceptance_plan_count?: number
  has_execution_trail?: boolean
  linked_issue_id?: string | null
  linked_issue_status?: string | null
  close_action?: {
    method?: string
    endpoint?: string
    label?: string
  }
}

export type DeleteGuardTarget =
  | {
      kind: 'task'
      id: string
      title: string
      blocked?: boolean
      message?: string
      warning?: string
      details?: DeleteProtectionDetails
    }
  | {
      kind: 'obstacle'
      id: string
      title: string
      blocked?: boolean
      message?: string
      warning?: string
      details?: DeleteProtectionDetails
    }

export function getDeleteProtectionDecisionToken(details?: DeleteProtectionDetails | null): string {
  return String(details?.decision_token ?? details?.decisionToken ?? '').trim()
}

export function isRetentionConfirmationDetails(details?: DeleteProtectionDetails | null): boolean {
  return Boolean(
    details?.requires_user_confirmation === true &&
    getDeleteProtectionDecisionToken(details) &&
    String(details?.execution_mode ?? '').trim() === 'require_user_confirm',
  )
}

export function getRetentionConfirmationActionLabel(details?: DeleteProtectionDetails | null): string {
  const action = String(details?.resolved_action ?? '').trim()
  if (action === 'soft_delete' || action === 'close') return '确认关闭保留'
  if (action === 'archive') return '确认归档保留'
  if (action === 'deactivate') return '确认停用保留'
  if (action === 'void') return '确认作废保留'
  if (action === 'hide') return '确认隐藏保留'
  return '确认保留处置'
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractApiErrorDetails(value: unknown): Record<string, unknown> | null {
  if (!isObjectRecord(value)) return null
  const errorBlock = value.error
  if (!isObjectRecord(errorBlock)) return null
  return isObjectRecord(errorBlock.details) ? errorBlock.details : null
}

export function extractApiErrorMessage(value: unknown, fallback: string): string {
  if (!isObjectRecord(value)) return fallback
  const errorBlock = value.error
  if (!isObjectRecord(errorBlock)) return fallback
  return typeof errorBlock.message === 'string' && errorBlock.message.trim() ? errorBlock.message : fallback
}

function formatTaskDeleteProtectionWarning(details: DeleteProtectionDetails): string {
  const parts: string[] = []
  if ((details.child_task_count ?? 0) > 0) parts.push(`包含 ${details.child_task_count} 个子任务`)
  if ((details.condition_count ?? 0) > 0) parts.push(`包含 ${details.condition_count} 条开工条件`)
  if ((details.obstacle_count ?? 0) > 0) parts.push(`包含 ${details.obstacle_count} 条障碍记录`)
  if ((details.acceptance_plan_count ?? 0) > 0) parts.push(`包含 ${details.acceptance_plan_count} 条验收计划`)
  if (details.has_execution_trail) parts.push('已有执行留痕')
  return parts.length > 0
    ? `该施工任务暂不能删除：${parts.join('；')}。`
    : '该施工任务仍被计划或执行记录引用，暂不能删除。'
}

function formatObstacleDeleteProtectionWarning(details: DeleteProtectionDetails): string {
  const parts: string[] = []
  if (details.status) parts.push(`当前状态：${details.status}`)
  if (details.linked_issue_id) {
    const linkedStatus = details.linked_issue_status ? `（${details.linked_issue_status}）` : ''
    parts.push(`已关联升级问题 ${details.linked_issue_id}${linkedStatus}`)
  }
  return parts.length > 0 ? `删除已被保护：${parts.join('；')}。` : '删除已被保护，请改为关闭此记录。'
}

export function buildDeleteProtectionState(
  kind: 'task' | 'obstacle',
  id: string,
  title: string,
  payload: unknown,
): DeleteGuardTarget | null {
  const details = extractApiErrorDetails(payload) as DeleteProtectionDetails | null
  if (!details) return null

  return {
    kind,
    id,
    title,
    blocked: true,
    message: extractApiErrorMessage(
      payload,
      kind === 'task'
        ? '该施工任务仍被计划或执行记录引用，暂不能删除。'
        : '删除受保护，请改为关闭此记录。',
    ),
    warning: kind === 'task'
      ? formatTaskDeleteProtectionWarning(details)
      : formatObstacleDeleteProtectionWarning(details),
    details,
  }
}

export function buildCommitDeleteProtectionPayload(result: Record<string, unknown>, fallbackMessage: string) {
  const summary = isObjectRecord(result.summary) ? result.summary : result
  return {
    error: {
      message: typeof result.message === 'string' ? result.message : fallbackMessage,
      details: summary,
    },
  }
}
