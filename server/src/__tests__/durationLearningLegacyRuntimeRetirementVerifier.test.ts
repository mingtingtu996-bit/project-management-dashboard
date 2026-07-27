import { beforeEach, describe, expect, it, vi } from 'vitest'

const pgMocks = vi.hoisted(() => ({
  Client: vi.fn((config: { connectionString: string }) => {
    const url = new URL(config.connectionString)
    return {
      connectionParameters: {
        database: decodeURIComponent(url.pathname.replace(/^\//u, '')),
        host: url.hostname.toLowerCase(),
        port: Number.parseInt(url.port || '5432', 10),
        user: decodeURIComponent(url.username),
      },
    }
  }),
}))

vi.mock('pg', () => ({
  default: {
    Client: pgMocks.Client,
  },
}))

import { runDurationLearningLegacyRuntimeRetirementVerification } from '../scripts/verify-duration-learning-legacy-runtime-retirement.js'

const projectRef = 'abcdefghijklmnopqrst'
const otherProjectRef = 'bbbbbbbbbbbbbbbbbbbb'

function targetEnv(connectionString: string, overrides: Record<string, string | undefined> = {}) {
  return {
    SUPABASE_URL: `https://${projectRef}.supabase.co`,
    SUPABASE_MIGRATION_URL: connectionString,
    WORKBUDDY_TARGET_ENVIRONMENT: 'staging',
    ...overrides,
  }
}

function completeReadbackRow() {
  return {
    retirement_ledgered: true,
    retirement_status: 'retired_readback_complete',
    preflight_signal: 'retired_readback_complete',
    source_tables_present: false,
    wbs_publications_present: false,
    wbs_events_present: false,
    dependency_publications_present: false,
    dependency_events_present: false,
    retirement_backup_sha256: 'd'.repeat(64),
    source_data_fingerprint: 'a'.repeat(64),
    retired_source_data_fingerprint: 'a'.repeat(64),
  }
}

function fakeClient(rows: Record<string, unknown>[] = [completeReadbackRow()]) {
  return {
    connect: vi.fn(async () => undefined),
    query: vi.fn(async () => ({ rows })),
    end: vi.fn(async () => undefined),
  }
}

describe('duration learning legacy runtime retirement verifier', () => {
  beforeEach(() => {
    pgMocks.Client.mockClear()
  })

  it.each([
    [
      'malformed Supabase URL',
      targetEnv(`postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/postgres`, {
        SUPABASE_URL: 'not-a-supabase-url',
      }),
      'DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_EXPECTED_PROJECT_UNRESOLVED',
    ],
    [
      'direct project mismatch',
      targetEnv(`postgresql://postgres:secret@db.${otherProjectRef}.supabase.co:5432/postgres`),
      'DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_TARGET_PROJECT_MISMATCH',
    ],
    [
      'pooler project mismatch',
      targetEnv(`postgresql://postgres.${otherProjectRef}:secret@aws-1.pooler.supabase.com:5432/postgres`),
      'DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_TARGET_PROJECT_MISMATCH',
    ],
  ])('fails closed for %s before resolving config or constructing a Client', async (
    _label,
    env,
    errorCode,
  ) => {
    const resolveConnectionConfig = vi.fn()
    const createClient = vi.fn()

    await expect(runDurationLearningLegacyRuntimeRetirementVerification({
      env,
      resolveConnectionConfig,
      createClient,
      writeOutput: vi.fn(),
    } as any)).rejects.toThrow(errorCode)

    expect(resolveConnectionConfig).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
    expect(pgMocks.Client).not.toHaveBeenCalled()
  })

  it.each([
    [
      'direct',
      `postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`,
    ],
    [
      'pooler',
      `postgresql://postgres.${projectRef}:secret@aws-1.pooler.supabase.com:5432/postgres?sslmode=require`,
    ],
  ])('verifies an already committed 322 readback through a valid %s target', async (
    _label,
    connectionString,
  ) => {
    const client = fakeClient()
    const connectionConfig = { connectionString: 'postgresql://redacted' }
    const resolveConnectionConfig = vi.fn(async () => connectionConfig)
    const createClient = vi.fn(() => client)
    const writeOutput = vi.fn()

    const result = await runDurationLearningLegacyRuntimeRetirementVerification({
      env: targetEnv(connectionString),
      resolveConnectionConfig,
      createClient,
      writeOutput,
    } as any)

    expect(resolveConnectionConfig).toHaveBeenCalledTimes(1)
    expect(createClient).toHaveBeenCalledWith(connectionConfig)
    expect(client.connect).toHaveBeenCalledTimes(1)
    expect(client.query).toHaveBeenCalledTimes(1)
    expect(client.end).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      status: 'DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_READBACK_COMPLETE',
      target: {
        supabaseProjectRef: projectRef,
        targetEnvironment: 'staging',
      },
      readback: expect.objectContaining({
        status: 'retired_readback_complete',
        ledgered: true,
      }),
    })
    expect(writeOutput).toHaveBeenCalledWith(expect.stringContaining(
      'DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_READBACK_COMPLETE',
    ))
    expect(writeOutput).not.toHaveBeenCalledWith(expect.stringContaining('postgresql://'))
    expect(writeOutput).not.toHaveBeenCalledWith(expect.stringContaining('secret'))
  })

  it('closes the connection and fails when the committed readback is incomplete', async () => {
    const client = fakeClient([])
    const createClient = vi.fn(() => client)

    await expect(runDurationLearningLegacyRuntimeRetirementVerification({
      env: targetEnv(
        `postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/postgres`,
      ),
      resolveConnectionConfig: vi.fn(async () => ({ host: 'validated-target' })),
      createClient,
      writeOutput: vi.fn(),
    } as any)).rejects.toThrow(
      'DURATION_LEARNING_LEGACY_RUNTIME_RETIREMENT_READBACK_INCOMPLETE',
    )

    expect(client.connect).toHaveBeenCalledTimes(1)
    expect(client.query).toHaveBeenCalledTimes(1)
    expect(client.end).toHaveBeenCalledTimes(1)
  })
})
