import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import dotenv from 'dotenv'

export const DEFAULT_STAGING_SUPABASE_PROJECT_REF = 'xemqmqpifsstkovbkatp'
export const DEFAULT_DB_CONNECTION_SOURCES = [
  'SUPABASE_MIGRATION_URL',
  'DB_CONNECTION_STRING',
  'DATABASE_URL',
]

function text(value) {
  return String(value ?? '').trim()
}

function repoRelative(filePath, repoRoot) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/')
}

function parseUrl(value) {
  try {
    return new URL(text(value))
  } catch {
    return null
  }
}

function supabaseProjectRefFromHost(hostname) {
  const host = text(hostname).toLowerCase()
  if (!host) return ''
  const dbMatch = host.match(/^db\.([a-z0-9-]+)\.supabase\.co$/)
  if (dbMatch) return dbMatch[1]
  const apiMatch = host.match(/^([a-z0-9-]+)\.supabase\.co$/)
  return apiMatch ? apiMatch[1] : ''
}

function supabaseProjectRefFromUsername(username) {
  const normalized = decodeURIComponent(text(username))
  const match = normalized.match(/^postgres\.([a-z0-9-]+)$/i)
  return match ? match[1] : ''
}

function normalizedPort(url) {
  if (text(url?.port)) return text(url.port)
  return ['postgres:', 'postgresql:'].includes(text(url?.protocol).toLowerCase()) ? '5432' : ''
}

function connectionSourceFromEnv(env) {
  return DEFAULT_DB_CONNECTION_SOURCES.find((key) => text(env?.[key])) || ''
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex')
}

export function buildDefaultMasterPlanDatabaseTargetIdentity(target) {
  const record = target && typeof target === 'object' && !Array.isArray(target) ? target : {}
  return {
    supabaseProjectRef: text(record.supabaseProjectRef).toLowerCase(),
    databaseHost: text(record.databaseHost).toLowerCase(),
    databasePort: text(record.databasePort),
    databaseName: text(record.databaseName),
    databaseUser: text(record.databaseUser),
  }
}

export function buildDefaultMasterPlanDatabaseTargetFingerprint(target) {
  const identity = buildDefaultMasterPlanDatabaseTargetIdentity(target)
  if (Object.values(identity).some((value) => !value)) return ''
  return sha256(JSON.stringify(identity))
}

export const DEFAULT_STAGING_DATABASE_TARGET_FINGERPRINT = buildDefaultMasterPlanDatabaseTargetFingerprint({
  supabaseProjectRef: DEFAULT_STAGING_SUPABASE_PROJECT_REF,
  databaseHost: `db.${DEFAULT_STAGING_SUPABASE_PROJECT_REF}.supabase.co`,
  databasePort: '5432',
  databaseName: 'postgres',
  databaseUser: 'workbuddy_runtime_login',
})

export function sameDefaultMasterPlanDatabaseTarget(left, right) {
  const leftFingerprint = text(left?.targetFingerprint) || buildDefaultMasterPlanDatabaseTargetFingerprint(left)
  const rightFingerprint = text(right?.targetFingerprint) || buildDefaultMasterPlanDatabaseTargetFingerprint(right)
  return Boolean(leftFingerprint && rightFingerprint && leftFingerprint === rightFingerprint)
}

export function isApprovedDefaultMasterPlanNonProductionTarget(target, {
  environment = 'staging',
  expectedStagingProjectRef = DEFAULT_STAGING_SUPABASE_PROJECT_REF,
  expectedStagingTargetFingerprint = expectedStagingProjectRef === DEFAULT_STAGING_SUPABASE_PROJECT_REF
    ? DEFAULT_STAGING_DATABASE_TARGET_FINGERPRINT
    : '',
} = {}) {
  const identity = buildDefaultMasterPlanDatabaseTargetIdentity(target)
  if (!buildDefaultMasterPlanDatabaseTargetFingerprint(identity)) return false
  if (text(environment) === 'local') {
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(identity.databaseHost)
  }
  const projectApproved = text(environment) === 'staging'
    && Boolean(text(expectedStagingProjectRef))
    && identity.supabaseProjectRef === text(expectedStagingProjectRef).toLowerCase()
  return projectApproved && (
    !text(expectedStagingTargetFingerprint)
    || buildDefaultMasterPlanDatabaseTargetFingerprint(identity) === text(expectedStagingTargetFingerprint)
  )
}

export function summarizeDefaultMasterPlanEnvText(raw, { envFileRef = '' } = {}) {
  const env = dotenv.parse(String(raw ?? ''))
  const connectionSource = connectionSourceFromEnv(env)
  const connectionValue = text(env[connectionSource])
  const connectionUrl = parseUrl(connectionValue)
  const supabaseUrl = parseUrl(env.SUPABASE_URL)
  const target = {
    envFileRef: text(envFileRef),
    envFileSha256: sha256(raw),
    connectionCredentialSha256: connectionValue ? sha256(connectionValue) : '',
    supabaseProjectRef: supabaseProjectRefFromHost(supabaseUrl?.hostname)
      || supabaseProjectRefFromHost(connectionUrl?.hostname)
      || supabaseProjectRefFromUsername(connectionUrl?.username),
    databaseHost: text(connectionUrl?.hostname).toLowerCase(),
    databasePort: normalizedPort(connectionUrl),
    databaseName: text(connectionUrl?.pathname).replace(/^\//, ''),
    databaseUser: decodeURIComponent(text(connectionUrl?.username)),
    connectionSource,
    hasPassword: Boolean(connectionUrl?.password),
    sslmode: text(connectionUrl?.searchParams?.get('sslmode')),
    readable: true,
  }
  return {
    ...target,
    targetFingerprint: buildDefaultMasterPlanDatabaseTargetFingerprint(target),
  }
}

export async function readDefaultMasterPlanEnvTarget(envFile, { repoRoot }) {
  const resolvedEnvFile = path.resolve(envFile)
  const envFileRef = repoRelative(resolvedEnvFile, repoRoot)

  try {
    const raw = await readFile(resolvedEnvFile, 'utf8')
    return summarizeDefaultMasterPlanEnvText(raw, { envFileRef })
  } catch (error) {
    return {
      envFileRef,
      envFileSha256: '',
      connectionCredentialSha256: '',
      supabaseProjectRef: '',
      databaseHost: '',
      databasePort: '',
      databaseName: '',
      databaseUser: '',
      connectionSource: '',
      targetFingerprint: '',
      hasPassword: false,
      sslmode: '',
      readable: false,
      readError: error?.code || error?.message || 'env_file_unreadable',
    }
  }
}
