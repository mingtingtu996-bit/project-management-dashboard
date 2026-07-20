import { promises as fs } from 'node:fs'
import { lookup } from 'node:dns/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

import pg from 'pg'

import {
  readCommercialTriggerRpcAclState,
  verifyCommercialTriggerRpcAclState,
} from './commercialTriggerRpcAclRemediationService.js'
import {
  isSupabasePoolerHost,
  parseStrictPostgresConnectionTarget,
} from '../utils/postgresConnectionTargetIdentity.js'

const { Client } = pg

const MIGRATION_FILE_PATTERN = /^(?<version>\d{3}[a-z]?)_(?<name>[a-z0-9_]+)\.sql$/i
const NON_CANONICAL_MIGRATION_FILENAMES = new Set([
  '037_create_task_conditions_and_obstacles_final.sql',
  '037_create_task_conditions_and_obstacles_fixed.sql',
  '038_verify_tables.sql',
  '115_rollback_project_daily_snapshot.sql',
])
const MIGRATION_ADVISORY_LOCK_KEY = 1_424_231
const MIGRATION_LOCK_TIMEOUT_MS = 10_000
const MIGRATION_STATEMENT_TIMEOUT_MS = 15 * 60 * 1_000
const COMMERCIAL_TRIGGER_RPC_ACL_CLOSEOUT_FILENAME = '308_commercial_trigger_rpc_acl_closeout.sql'
export const APPLY_MIGRATION_CHECKSUM_CONTRACT_VERSION = 1 as const
export const BASELINE_SENTINEL_TABLES = ['projects', 'tasks', 'users', 'notifications'] as const

export type MigrationFile = {
  filename: string
  version: string
  name: string
  fullPath: string
}

export type AppliedMigration = {
  filename: string
  version: string
  checksum: string
  applied_at: string
}

export type ApplyMigrationOptions = {
  expectedChecksum?: string
}

type DnsLookupResult = {
  address: string
  family: number
}

type DnsLookupFn = (hostname: string, options: { family: 4 }) => Promise<DnsLookupResult>
type RuntimeHostResolution = {
  host: string
  family?: 4
}

export type MigrationConnectionTargetSelection =
  | {
      mode: 'connection_string'
      source: 'SUPABASE_MIGRATION_URL' | 'DIRECT_DATABASE_URL' | 'DATABASE_URL' | 'DB_CONNECTION_STRING'
      connectionString: string
    }
  | {
      mode: 'host'
      host: string | undefined
      user: string
    }

function isCanonicalMigrationFile(filename: string) {
  if (!MIGRATION_FILE_PATTERN.test(filename)) {
    return false
  }

  return !NON_CANONICAL_MIGRATION_FILENAMES.has(filename.toLowerCase())
}

export function compareMigrationVersions(leftVersion: string, rightVersion: string) {
  const leftNumeric = Number.parseInt(leftVersion.slice(0, 3), 10)
  const rightNumeric = Number.parseInt(rightVersion.slice(0, 3), 10)

  if (leftNumeric !== rightNumeric) {
    return leftNumeric - rightNumeric
  }

  const leftSuffix = leftVersion.slice(3)
  const rightSuffix = rightVersion.slice(3)

  if (leftSuffix !== rightSuffix) {
    return leftSuffix.localeCompare(rightSuffix)
  }

  return leftVersion.localeCompare(rightVersion)
}

function compareMigrationFiles(left: MigrationFile, right: MigrationFile) {
  const versionCompare = compareMigrationVersions(left.version, right.version)
  if (versionCompare !== 0) {
    return versionCompare
  }

  return left.filename.localeCompare(right.filename)
}

export async function discoverMigrationFiles(migrationsDir: string) {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true })

  const migrations = entries
    .filter((entry) => entry.isFile() && isCanonicalMigrationFile(entry.name))
    .map((entry) => {
      const match = entry.name.match(MIGRATION_FILE_PATTERN)
      if (!match?.groups) {
        throw new Error(`无法解析 migration 文件名: ${entry.name}`)
      }

      return {
        filename: entry.name,
        version: match.groups.version.toLowerCase(),
        name: match.groups.name,
        fullPath: resolve(migrationsDir, entry.name),
      } satisfies MigrationFile
    })
    .sort(compareMigrationFiles)

  const seenVersions = new Map<string, string>()
  for (const migration of migrations) {
    const duplicatedFilename = seenVersions.get(migration.version)
    if (duplicatedFilename) {
      throw new Error(`migration 版本重复: ${migration.version} -> ${duplicatedFilename}, ${migration.filename}`)
    }
    seenVersions.set(migration.version, migration.filename)
  }

  return migrations
}

export async function ensureSchemaMigrationsTable(client: InstanceType<typeof Client>) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

export async function schemaMigrationsTableExists(client: InstanceType<typeof Client>) {
  const result = await client.query<{ ledger_exists: boolean }>(`
    SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ledger_exists
  `)
  return result.rows[0]?.ledger_exists === true
}

export async function configureMigrationSession(client: InstanceType<typeof Client>) {
  await client.query(`SELECT set_config('lock_timeout', $1, FALSE)`, [`${MIGRATION_LOCK_TIMEOUT_MS}ms`])
  await client.query(`SELECT set_config('statement_timeout', $1, FALSE)`, [`${MIGRATION_STATEMENT_TIMEOUT_MS}ms`])
}

export async function acquireMigrationAdvisoryLock(client: InstanceType<typeof Client>) {
  const result = await client.query<{ acquired: boolean }>(
    'SELECT pg_try_advisory_lock($1::bigint) AS acquired',
    [MIGRATION_ADVISORY_LOCK_KEY],
  )
  if (result.rows[0]?.acquired !== true) {
    throw Object.assign(
      new Error('Another migration runner already holds the database advisory lock'),
      { code: 'MIGRATION_LOCK_UNAVAILABLE' },
    )
  }
}

export async function releaseMigrationAdvisoryLock(client: InstanceType<typeof Client>) {
  const result = await client.query<{ released: boolean }>(
    'SELECT pg_advisory_unlock($1::bigint) AS released',
    [MIGRATION_ADVISORY_LOCK_KEY],
  )
  if (result.rows[0]?.released !== true) {
    throw new Error('Migration advisory lock was not held by this database session')
  }
}

export async function listAppliedMigrations(client: InstanceType<typeof Client>) {
  const result = await client.query<AppliedMigration>(`
    SELECT filename, version, checksum, applied_at::text
    FROM public.schema_migrations
    ORDER BY applied_at ASC, filename ASC
  `)

  return result.rows
}

export function getPendingMigrations(
  discovered: MigrationFile[],
  applied: Pick<AppliedMigration, 'filename'>[],
) {
  const appliedSet = new Set(applied.map((item) => item.filename))
  return discovered.filter((migration) => !appliedSet.has(migration.filename))
}

export function selectMigrationsThroughVersion(
  discovered: MigrationFile[],
  throughVersion: string,
) {
  return discovered.filter((migration) => compareMigrationVersions(migration.version, throughVersion) <= 0)
}

export function calculateMigrationChecksum(sql: string) {
  return createHash('sha256').update(sql).digest('hex')
}

export async function readMigrationSql(migration: MigrationFile) {
  return await fs.readFile(migration.fullPath, 'utf8')
}

function deriveSupabaseHostFromUrl(value?: string | null) {
  const text = String(value ?? '').trim()
  if (!text) return null

  try {
    const url = new URL(text)
    const hostname = url.hostname.trim()
    if (!hostname) return null
    if (hostname.startsWith('db.')) return hostname

    const [projectRef, ...rest] = hostname.split('.')
    if (!projectRef || rest.length === 0) return null

    return `db.${projectRef}.${rest.join('.')}`
  } catch {
    return null
  }
}

export function selectMigrationConnectionTarget(
  env: Record<string, string | undefined> = process.env,
): MigrationConnectionTargetSelection {
  const connectionInputs = [
    ['SUPABASE_MIGRATION_URL', env.SUPABASE_MIGRATION_URL],
    ['DIRECT_DATABASE_URL', env.DIRECT_DATABASE_URL],
    ['DATABASE_URL', env.DATABASE_URL],
    ['DB_CONNECTION_STRING', env.DB_CONNECTION_STRING],
  ] as const
  for (const [source, value] of connectionInputs) {
    const connectionString = String(value ?? '').trim()
    if (connectionString) {
      return { mode: 'connection_string', source, connectionString }
    }
  }

  return {
    mode: 'host',
    host: env.PGHOST ?? env.SUPABASE_HOST ?? deriveSupabaseHostFromUrl(env.SUPABASE_URL) ?? undefined,
    user: env.PGUSER ?? env.SUPABASE_USER ?? 'postgres',
  }
}

function deriveSupabaseProjectRef(value?: string | null) {
  const text = String(value ?? '').trim()
  if (!text) return null
  try {
    const hostname = new URL(text).hostname.toLowerCase()
    const match = /^(?:db\.)?([a-z0-9]{20})\.supabase\.co$/.exec(hostname)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

function assertEffectiveMigrationTargetMatchesSupabaseProject(target: {
  host: string
  user: string
}) {
  const configuredSupabaseUrl = String(process.env.SUPABASE_URL ?? '').trim()
  if (!configuredSupabaseUrl) return

  const expectedRef = deriveSupabaseProjectRef(configuredSupabaseUrl)
  if (!expectedRef) {
    throw new Error('SUPABASE_URL_INVALID: non-empty SUPABASE_URL must be a valid Supabase project URL')
  }

  const directRef = deriveSupabaseProjectRef(`postgresql://${target.host}`)
  if (!directRef && !isSupabasePoolerHost(target.host)) {
    throw new Error(`MIGRATION_TARGET_HOST_UNTRUSTED: ${target.host} is not a Supabase direct or pooler host`)
  }

  const poolerRef = isSupabasePoolerHost(target.host)
    ? /(?:^|\.)([a-z0-9]{20})$/u.exec(target.user.toLowerCase())?.[1] ?? null
    : null
  const actualRef = directRef ?? poolerRef
  if (!actualRef || expectedRef !== actualRef) {
    throw new Error(`MIGRATION_TARGET_MISMATCH: SUPABASE_URL project ${expectedRef} does not match migration connection project ${actualRef}`)
  }
}

function assertMigrationTargetMatchesSupabaseProject(connectionString?: string | null) {
  if (!connectionString) return
  assertEffectiveMigrationTargetMatchesSupabaseProject(
    parseStrictPostgresConnectionTarget(connectionString),
  )
}

function normalizeMigrationConnectionString(
  value: string,
  ssl: false | { rejectUnauthorized: false },
) {
  if (!ssl) {
    return value
  }

  const parsed = new URL(value)
  if (parsed.searchParams.get('sslmode') !== 'no-verify') {
    parsed.searchParams.set('sslmode', 'no-verify')
  }
  return parsed.toString()
}

export function resolveMigrationConnectionConfig() {
  const target = selectMigrationConnectionTarget(process.env)
  const connectionString = target.mode === 'connection_string' ? target.connectionString : undefined
  const host = target.mode === 'host' ? target.host : undefined
  const port = Number.parseInt(process.env.PGPORT ?? process.env.SUPABASE_PORT ?? '5432', 10)
  const database = process.env.PGDATABASE ?? process.env.SUPABASE_DATABASE ?? 'postgres'
  const user = target.mode === 'host' ? target.user : process.env.PGUSER ?? process.env.SUPABASE_USER ?? 'postgres'
  const password = process.env.PGPASSWORD ?? process.env.SUPABASE_PASSWORD ?? process.env.DB_PASSWORD

  const ssl = process.env.PGSSLMODE === 'disable'
    ? false
    : { rejectUnauthorized: false as const }

  if (connectionString) {
    assertMigrationTargetMatchesSupabaseProject(connectionString)
    return {
      connectionString: normalizeMigrationConnectionString(connectionString, ssl),
      ssl,
      family: 4 as const,
    }
  }

  if (!host || !password) {
    throw new Error(
      '缺少迁移数据库连接信息，请提供 SUPABASE_MIGRATION_URL、DIRECT_DATABASE_URL、DATABASE_URL、DB_CONNECTION_STRING，或 PGHOST/PGPASSWORD。',
    )
  }

  assertEffectiveMigrationTargetMatchesSupabaseProject({ host, user })

  return {
    host,
    port,
    database,
    user,
    password,
    ssl,
    family: 4 as const,
  }
}

function stripConnectionStringSslMode(url: URL) {
  url.searchParams.delete('sslmode')
  return url
}

export async function resolveMigrationRuntimeConnectionConfig(
  dnsLookup: DnsLookupFn = lookup,
) {
  const baseConfig = resolveMigrationConnectionConfig()

  if ('connectionString' in baseConfig) {
    const parsed = stripConnectionStringSslMode(new URL(baseConfig.connectionString))
    const resolved = await resolveRuntimeHost(parsed.hostname, dnsLookup)
    parsed.hostname = resolved.host

    if (!resolved.family) {
      const { family: _family, ...configWithoutFamily } = baseConfig
      return {
        ...configWithoutFamily,
        connectionString: parsed.toString(),
      }
    }

    return {
      ...baseConfig,
      connectionString: parsed.toString(),
    }
  }

  const resolved = await resolveRuntimeHost(baseConfig.host, dnsLookup)
  if (!resolved.family) {
    const { family: _family, ...configWithoutFamily } = baseConfig
    return {
      ...configWithoutFamily,
      host: resolved.host,
    }
  }

  return {
    ...baseConfig,
    host: resolved.host,
  }
}

async function resolveRuntimeHost(
  hostname: string,
  dnsLookup: DnsLookupFn,
): Promise<RuntimeHostResolution> {
  try {
    const resolved = await dnsLookup(hostname, { family: 4 })
    return { host: resolved.address, family: 4 }
  } catch (error) {
    if (process.env.MIGRATION_DNS_DEBUG === '1') {
      console.warn('Migration IPv4 host lookup failed, falling back to runtime DNS resolution', {
        host: hostname,
        error,
      })
    }
    return { host: hostname }
  }
}

export async function listExistingBaselineTables(
  client: InstanceType<typeof Client>,
  candidates: readonly string[] = BASELINE_SENTINEL_TABLES,
) {
  if (candidates.length === 0) {
    return [] as string[]
  }

  const result = await client.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name ASC
    `,
    [candidates],
  )

  return result.rows.map((row) => row.table_name)
}

export function shouldBlockUnsafeMigrationReplay(
  appliedMigrations: Pick<AppliedMigration, 'filename'>[],
  existingBaselineTables: readonly string[],
) {
  return appliedMigrations.length === 0 && existingBaselineTables.length > 0
}

function prepareMigrationSqlForManagedTransaction(sql: string) {
  const lines = sql.split(/\r?\n/)
  const beginIndexes: number[] = []
  const commitIndexes: number[] = []
  let insideBlockComment = false

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (insideBlockComment) {
      if (trimmed.includes('*/')) insideBlockComment = false
      return
    }
    if (!trimmed || trimmed.startsWith('--')) return
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) insideBlockComment = true
      return
    }
    if (/^BEGIN(?:\s+TRANSACTION)?\s*;\s*(?:--.*)?$/i.test(trimmed)) beginIndexes.push(index)
    if (/^COMMIT\s*;\s*(?:--.*)?$/i.test(trimmed)) commitIndexes.push(index)
  })

  if (beginIndexes.length === 0 && commitIndexes.length === 0) return sql
  if (
    beginIndexes.length !== 1
    || commitIndexes.length !== 1
    || beginIndexes[0] >= commitIndexes[0]
  ) {
    throw new Error('Migration contains unsupported transaction control; expected one BEGIN/COMMIT envelope')
  }

  lines.splice(commitIndexes[0], 1)
  lines.splice(beginIndexes[0], 1)
  return lines.join('\n')
}

async function assertManagedMigrationPostcondition(
  client: InstanceType<typeof Client>,
  migration: MigrationFile,
): Promise<void> {
  if (migration.filename !== COMMERCIAL_TRIGGER_RPC_ACL_CLOSEOUT_FILENAME) return

  try {
    const readbacks = await readCommercialTriggerRpcAclState(client)
    verifyCommercialTriggerRpcAclState(readbacks, 'hardened')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Commercial trigger RPC ACL postcondition failed: ${message}`, { cause: error })
  }
}

export async function applyMigration(
  client: InstanceType<typeof Client>,
  migration: MigrationFile,
  options: ApplyMigrationOptions = {},
) {
  const sql = await readMigrationSql(migration)
  const checksum = calculateMigrationChecksum(sql)
  if (options.expectedChecksum !== undefined && checksum !== options.expectedChecksum) {
    throw Object.assign(
      new Error(`Migration checksum changed before apply: ${migration.filename}`),
      {
        code: 'MIGRATION_CHECKSUM_MISMATCH',
        expectedChecksum: options.expectedChecksum,
        actualChecksum: checksum,
      },
    )
  }
  const managedSql = prepareMigrationSqlForManagedTransaction(sql)

  await client.query('BEGIN')
  try {
    await client.query(`SELECT set_config('lock_timeout', $1, TRUE)`, [`${MIGRATION_LOCK_TIMEOUT_MS}ms`])
    await client.query(`SELECT set_config('statement_timeout', $1, TRUE)`, [`${MIGRATION_STATEMENT_TIMEOUT_MS}ms`])
    await client.query(managedSql)
    await assertManagedMigrationPostcondition(client, migration)
    await client.query(
      `
        INSERT INTO public.schema_migrations (filename, version, checksum)
        VALUES ($1, $2, $3)
      `,
      [migration.filename, migration.version, checksum],
    )
    await client.query('COMMIT')
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Preserve the original migration failure; disconnect recovery releases locks.
    }
    throw error
  }

  return {
    ...migration,
    checksum,
  }
}
