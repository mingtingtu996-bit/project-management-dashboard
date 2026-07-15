type DeliveryGovernanceInput = {
  company_id?: string | null
  project_id?: string | null
  user_id?: string | null
  notification_type?: string | null
  touchpoint_type?: string | null
  type?: string | null
  severity?: string | null
  metadata?: Record<string, unknown> | null
  [key: string]: unknown
}

type DeliveryOptions = {
  now?: Date
}

const DELIVERY_GOVERNANCE_VERSION = 'v1.4.13-delivery-governance'
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 5
const burstBuckets = new Map<string, number[]>()

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeTouchpoint(value: unknown) {
  const normalized = normalizeText(value)
  if (['persistent', 'dashboard_todo', 'popup', 'page_banner', 'system_record'].includes(normalized)) return normalized
  return 'persistent'
}

function getShanghaiHour(now: Date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    hour12: false,
  })
  return Number(formatter.format(now))
}

function isQuietHour(now: Date) {
  const hour = getShanghaiHour(now)
  return hour >= 22 || hour < 7
}

function isCritical(input: DeliveryGovernanceInput) {
  return normalizeText(input.severity).toLowerCase() === 'critical'
}

function rateLimitKey(input: DeliveryGovernanceInput) {
  return [
    normalizeText(input.company_id) || 'no-company',
    normalizeText(input.project_id) || 'no-project',
    normalizeText(input.user_id) || 'broadcast',
    normalizeText(input.type) || normalizeText(input.notification_type) || 'notification',
    normalizeTouchpoint(input.touchpoint_type),
  ].join(':')
}

function withGovernanceMetadata<T extends DeliveryGovernanceInput>(
  input: T,
  patch: Record<string, unknown>,
): T {
  return {
    ...input,
    metadata: {
      ...((input.metadata && typeof input.metadata === 'object') ? input.metadata : {}),
      delivery_governance_version: DELIVERY_GOVERNANCE_VERSION,
      ...patch,
    },
  }
}

function shouldRateLimit(input: DeliveryGovernanceInput, now: Date) {
  const touchpoint = normalizeTouchpoint(input.touchpoint_type)
  if (touchpoint !== 'dashboard_todo' && touchpoint !== 'persistent') return false
  if (isCritical(input)) return false

  const nowMs = now.getTime()
  const key = rateLimitKey(input)
  const recent = (burstBuckets.get(key) ?? []).filter((timestamp) => nowMs - timestamp < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    burstBuckets.set(key, recent)
    return true
  }
  recent.push(nowMs)
  burstBuckets.set(key, recent)
  return false
}

export function applyNotificationDeliveryGovernance<T extends DeliveryGovernanceInput>(
  input: T,
  options: DeliveryOptions = {},
): T {
  const now = options.now ?? new Date()
  const touchpoint = normalizeTouchpoint(input.touchpoint_type)

  if (shouldRateLimit(input, now)) {
    return withGovernanceMetadata({
      ...input,
      notification_type: 'system-exception',
      touchpoint_type: 'system_record',
    }, {
      delivery_governance_decision: 'rate_limited',
      delivery_rate_limited: true,
    })
  }

  if ((touchpoint === 'popup' || touchpoint === 'page_banner') && isQuietHour(now) && !isCritical(input)) {
    return withGovernanceMetadata({
      ...input,
      touchpoint_type: 'persistent',
    }, {
      delivery_governance_decision: 'quiet_hours_deferred',
      delivery_quiet_hours_applied: true,
    })
  }

  return withGovernanceMetadata(input, {
    delivery_governance_decision: 'allowed',
  })
}

export function getNotificationDeliveryGovernanceDiagnostics() {
  return {
    version: DELIVERY_GOVERNANCE_VERSION,
    rateLimit: {
      maxPerWindow: RATE_LIMIT_MAX,
      windowMinutes: RATE_LIMIT_WINDOW_MS / 60000,
      activeBuckets: burstBuckets.size,
    },
    quietHours: {
      timezone: 'Asia/Shanghai',
      startHour: 22,
      endHour: 7,
      deferredTouchpoints: ['popup', 'page_banner'],
    },
  }
}

export function clearNotificationDeliveryGovernanceStateForTests() {
  burstBuckets.clear()
}
