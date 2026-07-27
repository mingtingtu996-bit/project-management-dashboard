import { pathToFileURL } from 'node:url'

import { deriveRuntimeSupabaseProjectRefFromRawUrl } from '../utils/runtimeDatabaseConnectionTarget.js'

export const DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_CONFIRMATION =
  'DRAIN_DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_NOW'

type RuntimeEnv = Record<string, string | undefined>

type RecoveryExecutionResult =
  | ({ status: 'completed' } & Record<string, unknown>)
  | { status: 'skipped'; reason: string }

type RecoveryJob = {
  executeNow(): Promise<RecoveryExecutionResult>
}

type PostgresTarget = {
  database: string
  host: string
  port: number
  user: string
}

type RecoveryCliDependencies = {
  env?: RuntimeEnv
  loadStrictTargetParser?: () => Promise<(connectionString: string) => PostgresTarget>
  loadJob?: () => Promise<RecoveryJob>
  writeOutput?: (output: string) => void
}

type RecoveryTarget = {
  environment: 'staging' | 'production'
  releaseSha: string
  projectRef: string
  databaseRole: string
  database: string
  connectionString: string
  authority: PostgresTarget
}

const VALUE_ARGUMENTS = new Set([
  '--confirm',
  '--environment',
  '--expected-release-sha',
  '--expected-project-ref',
  '--expected-database-role',
  '--expected-database',
])

function readSingleArgument(argv: string[], name: string) {
  const indexes = argv.flatMap((value, index) => value === name ? [index] : [])
  if (indexes.length !== 1) {
    throw new Error(`DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_ARGUMENT_REQUIRED:${name}`)
  }
  const value = String(argv[indexes[0] + 1] ?? '').trim()
  if (!value || value.startsWith('--')) {
    throw new Error(`DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_ARGUMENT_REQUIRED:${name}`)
  }
  return value
}

function validateArgumentShape(argv: string[]) {
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index]
    if (name === '--allow-write') continue
    if (!VALUE_ARGUMENTS.has(name)) {
      throw new Error(`DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_ARGUMENT_UNKNOWN:${name}`)
    }
    index += 1
  }
}

function assertRecoveryConfirmed(argv: string[]) {
  const allowWriteCount = argv.filter((value) => value === '--allow-write').length
  const confirmationIndexes = argv.flatMap((value, index) => value === '--confirm' ? [index] : [])
  const confirmation = confirmationIndexes.length === 1
    ? String(argv[confirmationIndexes[0] + 1] ?? '').trim()
    : ''
  if (
    allowWriteCount !== 1
    || confirmation !== DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_CONFIRMATION
  ) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_CONFIRMATION_REQUIRED')
  }
}

function requiredEnv(env: RuntimeEnv, name: string) {
  const value = String(env[name] ?? '').trim()
  if (!value) {
    throw new Error(`DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_ENV_REQUIRED:${name}`)
  }
  return value
}

function decodeUrlComponent(value: string, label: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new Error(`DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_${label}_INVALID`)
  }
}

function parseSupabaseProjectRef(value: string) {
  const projectRef = deriveRuntimeSupabaseProjectRefFromRawUrl(value)
  if (!projectRef || !/^[a-z0-9]{20}$/u.test(projectRef)) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_SUPABASE_URL_INVALID')
  }
  return projectRef
}

function isSupabasePoolerHost(value: string) {
  return /(?:^|\.)pooler\.supabase\.(?:com|co)$/u.test(value.toLowerCase().replace(/\.$/u, ''))
}

function validateConnectionSearchParams(url: URL) {
  const entries = [...url.searchParams.entries()]
  if (entries.length === 0) return
  if (entries.length !== 1 || entries[0][0] !== 'sslmode' || entries[0][1] !== 'require') {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_DATABASE_QUERY_INVALID')
  }
}

function parseRuntimeConnectionTarget(connectionString: string, expected: {
  projectRef: string
  databaseRole: string
  database: string
}): PostgresTarget {
  let url: URL
  try {
    url = new URL(connectionString)
  } catch {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_DATABASE_URL_INVALID')
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_DATABASE_URL_INVALID')
  }
  validateConnectionSearchParams(url)

  const host = url.hostname.toLowerCase().replace(/\.$/u, '')
  const user = decodeUrlComponent(url.username, 'DATABASE_USER')
  const password = decodeUrlComponent(url.password, 'DATABASE_PASSWORD')
  const database = decodeUrlComponent(url.pathname.replace(/^\//u, ''), 'DATABASE_NAME')
  const port = Number.parseInt(url.port || '5432', 10)
  if (
    !host
    || !user
    || !password
    || !database
    || database.includes('/')
    || !Number.isInteger(port)
    || port < 1
    || port > 65535
  ) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_DATABASE_AUTHORITY_INVALID')
  }

  const directMatch = /^db\.([a-z0-9]{20})\.supabase\.co$/u.exec(host)
  let projectRef: string | null = directMatch?.[1] ?? null
  let databaseRole = user
  if (!directMatch) {
    if (!isSupabasePoolerHost(host)) {
      throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_DATABASE_HOST_UNTRUSTED')
    }
    const separator = user.lastIndexOf('.')
    projectRef = separator >= 0 ? user.slice(separator + 1).toLowerCase() : null
    databaseRole = separator >= 0 ? user.slice(0, separator) : ''
  }

  if (projectRef !== expected.projectRef) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_DATABASE_PROJECT_MISMATCH')
  }
  if (databaseRole !== expected.databaseRole) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_DATABASE_ROLE_MISMATCH')
  }
  if (database !== expected.database) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_DATABASE_NAME_MISMATCH')
  }

  return { host, port, database, user }
}

function selectRuntimeConnectionString(env: RuntimeEnv, supabaseProjectRef: string) {
  if (env.DB_CONNECTION_STRING) {
    const connectionString = env.DB_CONNECTION_STRING.trim()
    if (!connectionString) {
      throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_DATABASE_URL_INVALID')
    }
    return connectionString
  }

  const host = String(env.DB_HOST || env.SUPABASE_HOST || `db.${supabaseProjectRef}.supabase.co`).trim()
  const user = String(env.DB_USER || env.SUPABASE_USER || '').trim()
  const password = String(env.DB_PASSWORD || env.SUPABASE_PASSWORD || '').trim()
  const database = String(env.DB_NAME || env.SUPABASE_DATABASE || 'postgres').trim()
  const port = String(env.DB_PORT || env.SUPABASE_PORT || '5432').trim()
  if (!host || !user || !password || !database || !port) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_DATABASE_CONFIG_REQUIRED')
  }
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}?sslmode=require`
}

function resolveRecoveryTarget(argv: string[], env: RuntimeEnv): RecoveryTarget {
  validateArgumentShape(argv)
  const environment = readSingleArgument(argv, '--environment')
  if (environment !== 'staging' && environment !== 'production') {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_ENVIRONMENT_INVALID')
  }
  if (requiredEnv(env, 'DEPLOY_TARGET') !== environment) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_ENVIRONMENT_MISMATCH')
  }

  const releaseSha = readSingleArgument(argv, '--expected-release-sha').toLowerCase()
  if (!/^[0-9a-f]{40}$/u.test(releaseSha)) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_RELEASE_SHA_INVALID')
  }
  if (requiredEnv(env, 'RELEASE_SHA').toLowerCase() !== releaseSha) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_RELEASE_SHA_MISMATCH')
  }

  const projectRef = readSingleArgument(argv, '--expected-project-ref')
  if (!/^[a-z0-9]{20}$/u.test(projectRef)) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_PROJECT_REF_INVALID')
  }
  const configuredSupabaseUrl = env.SUPABASE_URL
  if (!String(configuredSupabaseUrl ?? '').trim()) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_ENV_REQUIRED:SUPABASE_URL')
  }
  if (parseSupabaseProjectRef(configuredSupabaseUrl) !== projectRef) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_SUPABASE_PROJECT_MISMATCH')
  }

  const databaseRole = readSingleArgument(argv, '--expected-database-role')
  if (!/^[a-z_][a-z0-9_]{0,62}$/u.test(databaseRole)) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_DATABASE_ROLE_INVALID')
  }
  if (['postgres', 'service_role', 'supabase_admin'].includes(databaseRole)) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_DATABASE_ROLE_PRIVILEGED')
  }
  const database = readSingleArgument(argv, '--expected-database')
  if (!/^[a-z_][a-z0-9_]{0,62}$/u.test(database)) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_DATABASE_NAME_INVALID')
  }

  const connectionString = selectRuntimeConnectionString(env, projectRef)
  const authority = parseRuntimeConnectionTarget(connectionString, {
    projectRef,
    databaseRole,
    database,
  })
  return { environment, releaseSha, projectRef, databaseRole, database, connectionString, authority }
}

async function loadDefaultStrictTargetParser() {
  const { parseStrictPostgresConnectionTarget } = await import(
    '../utils/postgresConnectionTargetIdentity.js'
  )
  return parseStrictPostgresConnectionTarget
}

async function loadDefaultRecoveryJob(): Promise<RecoveryJob> {
  const { durationLearningRuntimeEvidenceOutboxDrainJob } = await import(
    '../jobs/durationLearningRuntimeEvidenceOutboxDrainJob.js'
  )
  return durationLearningRuntimeEvidenceOutboxDrainJob
}

function assertStrictTargetMatches(expected: PostgresTarget, actual: PostgresTarget) {
  if (
    actual.database !== expected.database
    || actual.host.toLowerCase() !== expected.host
    || actual.port !== expected.port
    || actual.user !== expected.user
  ) {
    throw new Error('DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_EFFECTIVE_TARGET_MISMATCH')
  }
}

export async function runDurationLearningRuntimeEvidenceOutboxRecoveryCli(
  argv: string[],
  dependencies: RecoveryCliDependencies = {},
) {
  assertRecoveryConfirmed(argv)
  const target = resolveRecoveryTarget(argv, dependencies.env ?? process.env)

  const parseStrictTarget = await (
    dependencies.loadStrictTargetParser ?? loadDefaultStrictTargetParser
  )()
  assertStrictTargetMatches(target.authority, parseStrictTarget(target.connectionString))

  const job = await (dependencies.loadJob ?? loadDefaultRecoveryJob)()
  const result = await job.executeNow()
  if (result.status === 'skipped') {
    throw new Error(`DURATION_LEARNING_RUNTIME_EVIDENCE_OUTBOX_RECOVERY_SKIPPED:${result.reason}`)
  }

  const writeOutput = dependencies.writeOutput ?? console.log
  writeOutput(JSON.stringify({
    recovery: 'duration_learning_runtime_evidence_outbox',
    target: {
      environment: target.environment,
      releaseSha: target.releaseSha,
      projectRef: target.projectRef,
      databaseHost: target.authority.host,
      databasePort: target.authority.port,
      database: target.database,
      databaseRole: target.databaseRole,
    },
    result,
  }, null, 2))
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runDurationLearningRuntimeEvidenceOutboxRecoveryCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
