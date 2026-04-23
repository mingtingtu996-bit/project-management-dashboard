import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

import pg from 'pg'

const { Client } = pg

const MIGRATION_FILE_PATTERN = /^(?<version>\d{3}[a-z]?)_(?<name>[a-z0-9_]+)\.sql$/i
const NON_CANONICAL_TOKENS = ['verify', 'fixed', 'final']
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

function isCanonicalMigrationFile(filename: string) {
  if (!MIGRATION_FILE_PATTERN.test(filename)) {
    return false
  }

  const normalized = filename.toLowerCase()
  return NON_CANONICAL_TOKENS.every((token) => !normalized.includes(token))
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

export function resolveMigrationConnectionConfig() {
  const connectionString = process.env.DATABASE_URL
  const host = process.env.PGHOST ?? process.env.SUPABASE_HOST ?? deriveSupabaseHostFromUrl(process.env.SUPABASE_URL)
  const port = Number.parseInt(process.env.PGPORT ?? process.env.SUPABASE_PORT ?? '5432', 10)
  const database = process.env.PGDATABASE ?? process.env.SUPABASE_DATABASE ?? 'postgres'
  const user = process.env.PGUSER ?? process.env.SUPABASE_USER ?? 'postgres'
  const password = process.env.PGPASSWORD ?? process.env.SUPABASE_PASSWORD ?? process.env.DB_PASSWORD

  const ssl = process.env.PGSSLMODE === 'disable'
    ? false
    : { rejectUnauthorized: false as const }

  if (connectionString) {
    return { connectionString, ssl, family: 4 as const }
  }

  if (!host || !password) {
    throw new Error(
      '缺少数据库连接信息，请提供 DATABASE_URL，或提供 PGHOST/PGPASSWORD（也支持 SUPABASE_HOST/SUPABASE_PASSWORD）。',
    )
  }

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

export async function applyMigration(
  client: InstanceType<typeof Client>,
  migration: MigrationFile,
) {
  const sql = await readMigrationSql(migration)
  const checksum = calculateMigrationChecksum(sql)

  await client.query(sql)
  await client.query(
    `
      INSERT INTO public.schema_migrations (filename, version, checksum)
      VALUES ($1, $2, $3)
      ON CONFLICT (filename) DO UPDATE
      SET checksum = EXCLUDED.checksum,
          version = EXCLUDED.version
    `,
    [migration.filename, migration.version, checksum],
  )

  return {
    ...migration,
    checksum,
  }
}
