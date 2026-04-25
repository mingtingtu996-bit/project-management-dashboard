import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  poolConstructor: vi.fn(),
}))

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation((config) => {
    mocks.poolConstructor(config)
    return {
      query: mocks.query,
      connect: vi.fn(),
    }
  }),
}))

const originalEnv = { ...process.env }

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  process.env = {
    ...originalEnv,
    DB_CONNECTION_STRING: 'postgresql://user:password@127.0.0.1:5432/postgres',
  }
  mocks.query.mockResolvedValue({ rows: [], rowCount: 1 })
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('database pool warmup', () => {
  it('opens the configured number of warm connections during startup', async () => {
    process.env.DB_POOL_MAX = '4'
    process.env.DB_POOL_WARM_CONNECTIONS = '3'

    const { warmDatabasePool } = await import('../database.js')
    const result = await warmDatabasePool()

    expect(result.connections).toBe(3)
    expect(mocks.poolConstructor).toHaveBeenCalledOnce()
    expect(mocks.query).toHaveBeenCalledTimes(3)
    expect(mocks.query).toHaveBeenCalledWith('SELECT 1')
  })

  it('caps warm connections at the pool maximum', async () => {
    process.env.DB_POOL_MAX = '1'
    process.env.DB_POOL_WARM_CONNECTIONS = '5'

    const { warmDatabasePool } = await import('../database.js')
    const result = await warmDatabasePool()

    expect(result.connections).toBe(1)
    expect(mocks.query).toHaveBeenCalledTimes(1)
  })

  it('can disable startup warmup without creating the pool', async () => {
    process.env.DB_POOL_WARM_CONNECTIONS = '0'

    const { warmDatabasePool } = await import('../database.js')
    const result = await warmDatabasePool()

    expect(result).toEqual({ connections: 0, duration: 0 })
    expect(mocks.poolConstructor).not.toHaveBeenCalled()
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
