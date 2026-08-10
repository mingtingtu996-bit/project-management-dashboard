import { expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://staging-project.supabase.co'
process.env.SUPABASE_ANON_KEY = 'registered-anon-gateway-key'
process.env.SUPABASE_RUNTIME_KEY = 'runtime-role-jwt'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(() => ({
    from: vi.fn(),
    rpc: vi.fn(),
  })),
  rawQuery: vi.fn(),
  recordChangedExecutionFacts: vi.fn(async () => []),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
  isDatabaseTransactionActive: vi.fn(() => false),
  withDatabaseTransaction: vi.fn(async (work: () => Promise<unknown>) => work()),
  registerDatabasePostCommitEffect: vi.fn(async (_label: string, effect: () => Promise<void>) => effect()),
}))

vi.mock('../services/executionFactGovernanceService.js', () => ({
  recordChangedExecutionFacts: mocks.recordChangedExecutionFacts,
}))

await import('../services/dbService.js')

it('uses the registered anon key for apikey and the runtime role JWT for authorization', () => {
  expect(mocks.createClient).toHaveBeenCalledWith(
    'https://staging-project.supabase.co',
    'registered-anon-gateway-key',
    expect.objectContaining({
      global: expect.objectContaining({
        fetch: expect.any(Function),
        headers: {
          Authorization: 'Bearer runtime-role-jwt',
        },
      }),
    }),
  )
})
