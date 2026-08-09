type RuntimeCredentialEnv = Record<string, string | undefined>

const EXPECTED_SUPABASE_RUNTIME_ROLE = 'workbuddy_runtime'
const COMPACT_JWT_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/

function hasValue(value: string | undefined) {
  return Boolean(value?.trim())
}

export function resolveSupabaseRuntimeKey(env: RuntimeCredentialEnv = process.env) {
  return env.SUPABASE_RUNTIME_KEY?.trim()
    || env.SUPABASE_ANON_KEY?.trim()
    || env.VITE_SUPABASE_ANON_KEY?.trim()
    || ''
}

function decodeCompactJwtSegment(segment: string, label: string) {
  if (!COMPACT_JWT_SEGMENT_PATTERN.test(segment) || segment.length % 4 === 1) {
    throw new Error(`SUPABASE_RUNTIME_KEY ${label} is not valid compact JWT serialization`)
  }

  const decoded = Buffer.from(segment, 'base64url')
  if (decoded.length === 0 || decoded.toString('base64url') !== segment) {
    throw new Error(`SUPABASE_RUNTIME_KEY ${label} is not valid compact JWT serialization`)
  }
  return decoded
}

function decodeRuntimeJwtPayload(token: string) {
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error('SUPABASE_RUNTIME_KEY must use valid compact JWT serialization')
  }

  try {
    const header = JSON.parse(decodeCompactJwtSegment(parts[0], 'header').toString('utf8')) as unknown
    if (!header || typeof header !== 'object' || Array.isArray(header)) {
      throw new Error('invalid header')
    }
    const algorithm = (header as Record<string, unknown>).alg
    if (typeof algorithm !== 'string' || !algorithm.trim() || algorithm.toLowerCase() === 'none') {
      throw new Error('invalid header algorithm')
    }

    const payload = JSON.parse(decodeCompactJwtSegment(parts[1], 'payload').toString('utf8')) as unknown
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('invalid payload')
    }
    decodeCompactJwtSegment(parts[2], 'signature')
    return payload as Record<string, unknown>
  } catch (error) {
    if (error instanceof Error && error.message.includes('compact JWT serialization')) {
      throw error
    }
    throw new Error('SUPABASE_RUNTIME_KEY contains an invalid JWT payload')
  }
}

export function assertSupabaseRuntimeKeyClaims(token: string, nowMs = Date.now()) {
  const payload = decodeRuntimeJwtPayload(token)
  if (payload.role !== EXPECTED_SUPABASE_RUNTIME_ROLE) {
    throw new Error('SUPABASE_RUNTIME_KEY JWT role must be workbuddy_runtime')
  }

  const expiresAt = payload.exp
  if (!Number.isInteger(expiresAt) || Number(expiresAt) <= Math.floor(nowMs / 1000)) {
    throw new Error('SUPABASE_RUNTIME_KEY JWT is expired or has no valid expiry')
  }
}

export function assertProductionApiCredentialBoundary(env: RuntimeCredentialEnv = process.env) {
  if (env.NODE_ENV !== 'production') return
  if (hasValue(env.SUPABASE_SERVICE_KEY)) {
    throw new Error('SUPABASE_SERVICE_KEY is forbidden in the production API runtime; reserve it for isolated migration/admin workers')
  }
  if (!hasValue(env.SUPABASE_RUNTIME_KEY)) {
    throw new Error('SUPABASE_RUNTIME_KEY is required in production and must represent a non-BYPASSRLS application role')
  }
  assertSupabaseRuntimeKeyClaims(env.SUPABASE_RUNTIME_KEY!.trim())
}
