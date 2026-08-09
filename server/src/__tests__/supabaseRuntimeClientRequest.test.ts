import { expect, it } from 'vitest'

import { createSupabaseRuntimeClient } from '../services/runtimeCredentialBoundary.js'

it('sends the gateway apikey and runtime bearer token as separate Supabase REST headers', async () => {
  const requests: Headers[] = []
  const runtimeFetch: typeof fetch = async (_input, init) => {
    requests.push(new Headers(init?.headers))
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const client = createSupabaseRuntimeClient(
    'https://staging-project.supabase.co',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: { fetch: runtimeFetch },
    },
    {
      SUPABASE_ANON_KEY: 'registered-anon-gateway-key',
      SUPABASE_RUNTIME_KEY: 'runtime-role-jwt',
    },
  )

  const { error } = await client
    .from('status_dictionary_versions')
    .select('version_key')
    .limit(1)

  expect(error).toBeNull()
  expect(requests).toHaveLength(1)
  expect(requests[0].get('apikey')).toBe('registered-anon-gateway-key')
  expect(requests[0].get('Authorization')).toBe('Bearer runtime-role-jwt')
})
