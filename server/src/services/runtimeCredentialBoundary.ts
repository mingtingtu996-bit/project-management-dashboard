type RuntimeCredentialEnv = Record<string, string | undefined>

function hasValue(value: string | undefined) {
  return Boolean(value?.trim())
}

export function resolveSupabaseRuntimeKey(env: RuntimeCredentialEnv = process.env) {
  return env.SUPABASE_RUNTIME_KEY?.trim()
    || env.SUPABASE_ANON_KEY?.trim()
    || env.VITE_SUPABASE_ANON_KEY?.trim()
    || ''
}

export function assertProductionApiCredentialBoundary(env: RuntimeCredentialEnv = process.env) {
  if (env.NODE_ENV !== 'production') return
  if (hasValue(env.SUPABASE_SERVICE_KEY)) {
    throw new Error('SUPABASE_SERVICE_KEY is forbidden in the production API runtime; reserve it for isolated migration/admin workers')
  }
  if (!hasValue(env.SUPABASE_RUNTIME_KEY)) {
    throw new Error('SUPABASE_RUNTIME_KEY is required in production and must represent a non-BYPASSRLS application role')
  }
}
