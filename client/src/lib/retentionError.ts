export type RetentionParsedError = {
  code: string
  message: string
  decisionToken: string
  resolvedAction: string
  executionMode: string
  requiresUserConfirmation: boolean
  referenceSummary: Record<string, unknown>
  details: Record<string, unknown>
}

export type RetentionDecisionDialogModel = {
  title: string
  description: string
  confirmLabel: string
  confirmTone: 'default' | 'destructive'
}

const RETENTION_USER_MESSAGES: Record<string, string> = {
  RETENTION_DECISION_CONFIRMING: '保留处置正在确认中，请稍后刷新查看结果。',
  ENTITY_RETENTION_DECISION_EXPIRED: '保留处置凭证已过期或引用关系已变化，请刷新后重新发起操作。',
  RETENTION_DECISION_NOT_CONFIRMABLE: '该保留处置已经被处理或状态已变化，请刷新后查看最新结果。',
  RETENTION_DECISION_NOT_FOUND: '未找到这次保留处置凭证，请刷新后重新发起操作。',
  RETENTION_DECISION_TOKEN_REQUIRED: '缺少保留处置凭证，请刷新后重新发起操作。',
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getRawText(error: unknown) {
  if (!isObjectRecord(error)) return ''
  const rawText = error.rawText
  return typeof rawText === 'string' ? rawText : ''
}

function parseApiPayload(error: unknown): Record<string, unknown> | null {
  const rawText = getRawText(error)
  if (!rawText.trim()) return null
  try {
    const parsed = JSON.parse(rawText) as unknown
    return isObjectRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function getErrorBlock(error: unknown): Record<string, unknown> | null {
  const payload = parseApiPayload(error)
  const errorBlock = payload?.error
  return isObjectRecord(errorBlock) ? errorBlock : null
}

function getDetails(errorBlock: Record<string, unknown>): Record<string, unknown> {
  return isObjectRecord(errorBlock.details) ? errorBlock.details : {}
}

export function getRetentionApiErrorCode(error: unknown): string {
  return String(getErrorBlock(error)?.code ?? '').trim()
}

export function buildRetentionDecisionPayload(detailsInput: unknown): RetentionParsedError | null {
  if (!isObjectRecord(detailsInput)) return null

  const code = String(
    detailsInput.code ??
      (
        detailsInput.requiresUserConfirmation === true ||
        detailsInput.requires_user_confirmation === true
          ? 'RETENTION_CONFIRMATION_REQUIRED'
          : ''
      ),
  ).trim()
  const decisionToken = String(detailsInput.decisionToken ?? detailsInput.decision_token ?? '').trim()
  const resolvedAction = String(detailsInput.resolvedAction ?? detailsInput.resolved_action ?? '').trim()
  const executionMode = String(detailsInput.executionMode ?? detailsInput.execution_mode ?? '').trim()
  const referenceSummary = isObjectRecord(detailsInput.referenceSummary)
    ? detailsInput.referenceSummary
    : isObjectRecord(detailsInput.reference_summary)
      ? detailsInput.reference_summary
      : {}

  return {
    code,
    message: String(detailsInput.message ?? detailsInput.reason ?? '').trim(),
    decisionToken,
    resolvedAction,
    executionMode,
    requiresUserConfirmation: Boolean(detailsInput.requiresUserConfirmation ?? detailsInput.requires_user_confirmation),
    referenceSummary,
    details: detailsInput,
  }
}

export function parseRetentionApiError(error: unknown): RetentionParsedError | null {
  const errorBlock = getErrorBlock(error)
  if (!errorBlock) return null

  const details = getDetails(errorBlock)
  const parsed = buildRetentionDecisionPayload({
    ...details,
    code: String(errorBlock.code ?? '').trim(),
    message: String(errorBlock.message ?? '').trim(),
  })

  return parsed
}

export function isRetentionConfirmationError(error: unknown): boolean {
  const parsed = parseRetentionApiError(error)
  return Boolean(
    parsed?.code === 'RETENTION_CONFIRMATION_REQUIRED' &&
    parsed.decisionToken &&
    parsed.requiresUserConfirmation,
  )
}

export function getRetentionDecisionTokenFromError(error: unknown): string {
  return parseRetentionApiError(error)?.decisionToken ?? ''
}

export function getRetentionApiUserMessage(error: unknown, fallback = '请稍后重试。'): string {
  const errorBlock = getErrorBlock(error)
  const code = String(errorBlock?.code ?? '').trim()
  if (code && RETENTION_USER_MESSAGES[code]) return RETENTION_USER_MESSAGES[code]
  if (errorBlock && typeof errorBlock.message === 'string' && errorBlock.message.trim()) {
    const message = errorBlock.message.trim()
    return RETENTION_USER_MESSAGES[message] ?? message
  }
  if (error instanceof Error && error.message) {
    return RETENTION_USER_MESSAGES[error.message] ?? error.message
  }
  return fallback
}

function actionLabel(action: string) {
  switch (action) {
    case 'archive':
      return '确认归档保留'
    case 'deactivate':
      return '确认停用保留'
    case 'void':
      return '确认作废保留'
    case 'hide':
      return '确认隐藏保留'
    case 'soft_delete':
    case 'close':
      return '确认关闭保留'
    default:
      return '确认保留处置'
  }
}

function formatReferences(referenceSummary: Record<string, unknown>) {
  const entries = Object.entries(referenceSummary)
    .filter(([, value]) => Number(value ?? 0) > 0)
    .map(([key, value]) => `${key}: ${Number(value)}`)
  return entries.join('，')
}

export function buildRetentionDecisionDialogModel(input: {
  title: string
  entityName: string
  fallbackDescription: string
  retention: RetentionParsedError | null
}): RetentionDecisionDialogModel {
  const retention = input.retention
  if (!retention?.decisionToken) {
    return {
      title: input.title,
      description: input.fallbackDescription,
      confirmLabel: '确认删除',
      confirmTone: 'destructive',
    }
  }

  const label = actionLabel(retention.resolvedAction)
  const references = formatReferences(retention.referenceSummary)
  const referenceText = references ? `关联引用：${references}。` : ''
  return {
    title: label,
    description: `该记录已进入历史或联动链路，不能直接物理删除。确认后系统会保留「${input.entityName}」并执行对应生命周期处置。${referenceText}`,
    confirmLabel: label,
    confirmTone: 'default',
  }
}
