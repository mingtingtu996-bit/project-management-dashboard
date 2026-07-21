import { describe, expect, it, vi } from 'vitest'

import {
  DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_CONFIRMATION,
  runDurationLearningRuntimeEvidenceOutboxRecoveryCli,
} from '../scripts/recover-duration-learning-runtime-evidence-outbox.js'

const projectRef = 'abcdefghijklmnopqrst'
const releaseSha = 'a'.repeat(40)
const runtimeRole = 'workbuddy_runtime_login'

const directRuntimeUrl =
  `postgresql://${runtimeRole}:secret@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`
const poolerRuntimeUrl =
  `postgresql://${runtimeRole}.${projectRef}:secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require`

function validArgs() {
  return [
    '--allow-write',
    '--confirm',
    DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_CONFIRMATION,
    '--environment',
    'staging',
    '--expected-release-sha',
    releaseSha,
    '--expected-project-ref',
    projectRef,
    '--expected-database-role',
    runtimeRole,
    '--expected-database',
    'postgres',
  ]
}

function validEnv(connectionString = poolerRuntimeUrl) {
  return {
    DEPLOY_TARGET: 'staging',
    RELEASE_SHA: releaseSha,
    SUPABASE_URL: `https://${projectRef}.supabase.co`,
    DB_CONNECTION_STRING: connectionString,
  }
}

function validHostEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    DEPLOY_TARGET: 'staging',
    RELEASE_SHA: releaseSha,
    SUPABASE_URL: `https://${projectRef}.supabase.co`,
    DB_CONNECTION_STRING: '',
    DB_HOST: '',
    SUPABASE_HOST: `db.${projectRef}.supabase.co`,
    DB_USER: '',
    SUPABASE_USER: runtimeRole,
    DB_PASSWORD: '',
    SUPABASE_PASSWORD: 'secret:/?#[]@',
    DB_NAME: '',
    SUPABASE_DATABASE: 'postgres',
    DB_PORT: '',
    SUPABASE_PORT: '5432',
    ...overrides,
  }
}

function strictTarget(connectionString: string) {
  const parsed = new URL(connectionString)
  return {
    host: parsed.hostname.toLowerCase(),
    port: Number(parsed.port || 5432),
    database: decodeURIComponent(parsed.pathname.replace(/^\//u, '')),
    user: decodeURIComponent(parsed.username),
  }
}

function completedResult() {
  return {
    status: 'completed' as const,
    attempts: 1,
    claimed: 2,
    completed: 2,
    failed: 0,
    backlogCount: 0,
    readyBacklogCount: 0,
    failedBacklogCount: 0,
    expiredProcessingCount: 0,
  }
}

describe('duration learning runtime evidence outbox recovery CLI', () => {
  it.each([
    ['missing write authorization', validArgs().filter((arg) => arg !== '--allow-write')],
    ['missing exact confirmation', validArgs().filter((arg) => (
      arg !== '--confirm' && arg !== DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_CONFIRMATION
    ))],
    ['wrong confirmation', validArgs().map((arg) => (
      arg === DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_CONFIRMATION ? 'wrong-target' : arg
    ))],
  ])('rejects %s before loading the target parser, job, or database graph', async (_label, argv) => {
    const loadStrictTargetParser = vi.fn()
    const loadJob = vi.fn()

    await expect(runDurationLearningRuntimeEvidenceOutboxRecoveryCli(argv, {
      env: validEnv(),
      loadStrictTargetParser,
      loadJob,
      writeOutput: vi.fn(),
    } as any)).rejects.toThrow('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_CONFIRMATION_REQUIRED')

    expect(loadStrictTargetParser).not.toHaveBeenCalled()
    expect(loadJob).not.toHaveBeenCalled()
  })

  it.each([
    ['environment mismatch', validEnv(), validArgs().map((arg) => arg === 'staging' ? 'production' : arg)],
    ['release mismatch', { ...validEnv(), RELEASE_SHA: 'b'.repeat(40) }, validArgs()],
    ['malformed Supabase URL', { ...validEnv(), SUPABASE_URL: 'not-a-url' }, validArgs()],
    ['Supabase project mismatch', { ...validEnv(), SUPABASE_URL: 'https://bbbbbbbbbbbbbbbbbbbb.supabase.co' }, validArgs()],
    ['malformed runtime URL', validEnv('not-a-postgres-url'), validArgs()],
    ['blank-looking runtime URL', validHostEnv({ DB_CONNECTION_STRING: '   ' }), validArgs()],
    [
      'external runtime host with matching user suffix',
      validEnv(`postgresql://${runtimeRole}.${projectRef}:secret@evil.example:5432/postgres`),
      validArgs(),
    ],
    [
      'pooler project mismatch',
      validEnv(`postgresql://${runtimeRole}.bbbbbbbbbbbbbbbbbbbb:secret@aws-1.pooler.supabase.com:5432/postgres`),
      validArgs(),
    ],
    ['runtime role mismatch', validEnv(poolerRuntimeUrl.replace(runtimeRole, 'wrong_runtime_role')), validArgs()],
    ['runtime role case mismatch', validEnv(poolerRuntimeUrl.replace(runtimeRole, 'Workbuddy_runtime_login')), validArgs()],
    ['runtime database mismatch', validEnv(poolerRuntimeUrl.replace('/postgres?', '/template1?')), validArgs()],
    ['runtime database case mismatch', validEnv(poolerRuntimeUrl.replace('/postgres?', '/POSTGRES?')), validArgs()],
    ['runtime query override', validEnv(`${poolerRuntimeUrl}&options=unsafe`), validArgs()],
  ])('fails closed for %s before Client/parser/job/query loading', async (_label, env, argv) => {
    const loadStrictTargetParser = vi.fn()
    const loadJob = vi.fn(async () => ({ executeNow: vi.fn(async () => completedResult()) }))

    await expect(runDurationLearningRuntimeEvidenceOutboxRecoveryCli(argv, {
      env,
      loadStrictTargetParser,
      loadJob,
      writeOutput: vi.fn(),
    } as any)).rejects.toThrow()

    expect(loadStrictTargetParser).not.toHaveBeenCalled()
    expect(loadJob).not.toHaveBeenCalled()
  })

  it.each([
    ['direct', directRuntimeUrl],
    ['pooler', poolerRuntimeUrl],
  ])('runs the singleton only after the strict %s target and confirmations pass', async (_label, connectionString) => {
    const executeNow = vi.fn(async () => completedResult())
    const loadJob = vi.fn(async () => ({ executeNow }))
    const parseStrictTarget = vi.fn((value: string) => strictTarget(value))
    const loadStrictTargetParser = vi.fn(async () => parseStrictTarget)
    const writeOutput = vi.fn()

    const result = await runDurationLearningRuntimeEvidenceOutboxRecoveryCli(validArgs(), {
      env: validEnv(connectionString),
      loadStrictTargetParser,
      loadJob,
      writeOutput,
    } as any)

    expect(loadStrictTargetParser).toHaveBeenCalledTimes(1)
    expect(parseStrictTarget).toHaveBeenCalledWith(connectionString)
    expect(loadJob).toHaveBeenCalledTimes(1)
    expect(executeNow).toHaveBeenCalledTimes(1)
    expect(result).toEqual(completedResult())
    expect(writeOutput).toHaveBeenCalledWith(expect.stringContaining('"status": "completed"'))
    expect(writeOutput).not.toHaveBeenCalledWith(expect.stringContaining('secret'))
    expect(writeOutput).not.toHaveBeenCalledWith(expect.stringContaining('postgresql://'))
  })

  it('accepts a valid pooler identity through the production strict target parser', async () => {
    const executeNow = vi.fn(async () => completedResult())
    const loadJob = vi.fn(async () => ({ executeNow }))

    await expect(runDurationLearningRuntimeEvidenceOutboxRecoveryCli(validArgs(), {
      env: validEnv(poolerRuntimeUrl),
      loadJob,
      writeOutput: vi.fn(),
    })).resolves.toEqual(completedResult())

    expect(loadJob).toHaveBeenCalledTimes(1)
    expect(executeNow).toHaveBeenCalledTimes(1)
  })

  it('matches the runtime database host-mode fallback precedence for blank DB values', async () => {
    const executeNow = vi.fn(async () => completedResult())
    const loadJob = vi.fn(async () => ({ executeNow }))
    const parseStrictTarget = vi.fn((value: string) => strictTarget(value))
    const loadStrictTargetParser = vi.fn(async () => parseStrictTarget)
    const env = validHostEnv()

    await expect(runDurationLearningRuntimeEvidenceOutboxRecoveryCli(validArgs(), {
      env,
      loadStrictTargetParser,
      loadJob,
      writeOutput: vi.fn(),
    } as any)).resolves.toEqual(completedResult())

    expect(parseStrictTarget).toHaveBeenCalledWith(
      `postgresql://${runtimeRole}:secret%3A%2F%3F%23%5B%5D%40@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`,
    )
    expect(loadJob).toHaveBeenCalledTimes(1)
  })

  it('does not load the job when strict effective target parsing fails', async () => {
    const loadJob = vi.fn()
    const loadStrictTargetParser = vi.fn(async () => () => {
      throw new Error('strict effective target mismatch')
    })

    await expect(runDurationLearningRuntimeEvidenceOutboxRecoveryCli(validArgs(), {
      env: validEnv(),
      loadStrictTargetParser,
      loadJob,
      writeOutput: vi.fn(),
    } as any)).rejects.toThrow('strict effective target mismatch')

    expect(loadStrictTargetParser).toHaveBeenCalledTimes(1)
    expect(loadJob).not.toHaveBeenCalled()
  })

  it.each(['already_running', 'lease_not_acquired'] as const)(
    'fails recovery when execution is skipped with %s',
    async (reason) => {
      const executeNow = vi.fn(async () => ({ status: 'skipped' as const, reason }))
      const loadJob = vi.fn(async () => ({ executeNow }))
      const loadStrictTargetParser = vi.fn(async () => strictTarget)
      const writeOutput = vi.fn()

      await expect(runDurationLearningRuntimeEvidenceOutboxRecoveryCli(validArgs(), {
        env: validEnv(),
        loadStrictTargetParser,
        loadJob,
        writeOutput,
      } as any)).rejects.toThrow(
        `DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_SKIPPED:${reason}`,
      )

      expect(writeOutput).not.toHaveBeenCalled()
    },
  )
})
