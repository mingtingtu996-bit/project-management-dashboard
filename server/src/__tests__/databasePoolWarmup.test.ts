import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
  end: vi.fn(),
  poolConstructor: vi.fn(),
}))

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation((config) => {
    mocks.poolConstructor(config)
    return {
      query: mocks.query,
      connect: mocks.connect,
      end: mocks.end,
      on: vi.fn(),
    }
  }),
}))

const originalEnv = { ...process.env }
const sensitiveEnvKeys = [
  'DB_CONNECTION_STRING',
  'SUPABASE_MIGRATION_URL',
  'DB_PASSWORD',
  'SUPABASE_PASSWORD',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_ANON_KEY',
  'JWT_SECRET',
]

function sanitizedOriginalEnv() {
  const next = { ...originalEnv }
  for (const key of sensitiveEnvKeys) {
    delete next[key]
  }
  return next
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  process.env = {
    ...sanitizedOriginalEnv(),
    DB_CONNECTION_STRING: 'postgresql://user:password@127.0.0.1:5432/postgres',
  }
  mocks.query.mockResolvedValue({ rows: [], rowCount: 1 })
  mocks.clientQuery.mockResolvedValue({ rows: [], rowCount: 1 })
  mocks.connect.mockResolvedValue({
    query: mocks.clientQuery,
    release: mocks.release,
  })
  mocks.end.mockResolvedValue(undefined)
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

  it('does not use the migration URL as the runtime pool connection string', async () => {
    process.env.DB_CONNECTION_STRING = ''
    process.env.SUPABASE_MIGRATION_URL = 'postgresql://postgres:migration-secret@127.0.0.1:5432/postgres'
    process.env.DB_HOST = '127.0.0.1'
    process.env.DB_USER = 'workbuddy_runtime'
    process.env.DB_PASSWORD = 'runtime-secret'
    process.env.DB_POOL_WARM_CONNECTIONS = '1'

    const { warmDatabasePool } = await import('../database.js')
    await warmDatabasePool()

    expect(mocks.poolConstructor).toHaveBeenCalledWith(expect.objectContaining({
      host: '127.0.0.1',
      user: 'workbuddy_runtime',
      password: 'runtime-secret',
    }))
    expect(mocks.poolConstructor).not.toHaveBeenCalledWith(expect.objectContaining({
      connectionString: expect.stringContaining('postgres:migration-secret'),
    }))
  })

  it('strips sslmode from runtime connection strings so explicit TLS config is authoritative', async () => {
    process.env.DB_CONNECTION_STRING = 'postgresql://workbuddy_runtime_login:secret@127.0.0.1:5432/postgres?sslmode=require'
    process.env.DB_POOL_WARM_CONNECTIONS = '1'

    const { warmDatabasePool } = await import('../database.js')
    await warmDatabasePool()

    expect(mocks.poolConstructor).toHaveBeenCalledWith(expect.objectContaining({
      connectionString: expect.not.stringContaining('sslmode='),
      ssl: { rejectUnauthorized: false },
    }))
  })

  it('does not pass statement_timeout as a pooler startup parameter', async () => {
    process.env.DB_CONNECTION_STRING = 'postgresql://workbuddy_runtime_login:secret@db.example.supabase.co:6543/postgres?sslmode=require'
    process.env.DB_POOL_WARM_CONNECTIONS = '1'

    const { warmDatabasePool } = await import('../database.js')
    await warmDatabasePool()

    expect(mocks.poolConstructor).toHaveBeenCalledWith(expect.objectContaining({
      connectionString: expect.stringContaining(':6543/'),
      query_timeout: expect.any(Number),
      ssl: { rejectUnauthorized: false },
    }))
    expect(mocks.poolConstructor).toHaveBeenCalledWith(expect.not.objectContaining({
      statement_timeout: expect.any(Number),
    }))
  })

  it('closes the shared pool so one-off diagnostics can exit promptly', async () => {
    process.env.DB_POOL_WARM_CONNECTIONS = '1'

    const { closeDatabasePool, warmDatabasePool } = await import('../database.js')
    await warmDatabasePool()
    await closeDatabasePool()
    await warmDatabasePool()

    expect(mocks.end).toHaveBeenCalledOnce()
    expect(mocks.poolConstructor).toHaveBeenCalledTimes(2)
  })

  it('wraps direct SQL in a transaction carrying the active job lease headers', async () => {
    const { query } = await import('../database.js')
    const { runWithJobLeaseFenceContext } = await import('../services/jobLeaseFenceContext.js')

    await runWithJobLeaseFenceContext({
      jobName: 'conditionAlertJob',
      fenceToken: '11111111-1111-4111-8111-111111111111',
      generation: 7,
    }, async () => {
      await query('DELETE FROM notifications WHERE id = $1', ['notification-1'])
    })

    expect(mocks.query).not.toHaveBeenCalled()
    expect(mocks.clientQuery.mock.calls).toEqual([
      ['BEGIN'],
      ["SELECT set_config('request.headers', $1, TRUE)", [JSON.stringify({
        'x-workbuddy-job-name': 'conditionAlertJob',
        'x-workbuddy-job-fence-token': '11111111-1111-4111-8111-111111111111',
        'x-workbuddy-job-fence-generation': '7',
      })]],
      ['DELETE FROM notifications WHERE id = $1', ['notification-1']],
      ['COMMIT'],
    ])
    expect(mocks.release).toHaveBeenCalledOnce()
  })
})
