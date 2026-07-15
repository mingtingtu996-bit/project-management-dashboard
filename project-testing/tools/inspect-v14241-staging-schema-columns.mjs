#!/usr/bin/env node

import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import pg from 'pg'

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function parseEnv(text) {
  const env = {}
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const separator = line.indexOf('=')
    env[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return env
}

function requireEnv(env, key) {
  const value = String(env[key] ?? '').trim()
  if (!value) throw new Error(`Missing required env key: ${key}`)
  return value
}

function redactSecretLikeText(value) {
  return String(value ?? '')
    .replace(/postgres(?:ql)?:\/\/[^@]+@/gi, 'postgresql://<redacted>@')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<redacted-jwt>')
    .slice(0, 500)
}

function assertNoSecretLikeText(value) {
  const text = JSON.stringify(value)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/[^<]|password\s*[=:]|service[_-]?role/i.test(text)) {
    throw new Error('refusing_to_write_schema_columns_report_with_secret_like_text')
  }
}

function projectRefFromSupabaseUrl(value) {
  try {
    return new URL(value).hostname.match(/^([^.]+)\.supabase\.co$/)?.[1] ?? null
  } catch {
    return null
  }
}

function normalizePgUrl(value) {
  const url = new URL(value)
  url.searchParams.delete('sslmode')
  return url.toString()
}

async function queryColumns(client, tableNames) {
  const { rows } = await client.query(
    `select table_name, column_name, data_type, is_nullable
       from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])
      order by table_name, ordinal_position`,
    [tableNames],
  )
  const byTable = {}
  for (const table of tableNames) byTable[table] = []
  for (const row of rows) {
    byTable[row.table_name] ??= []
    byTable[row.table_name].push({
      column: row.column_name,
      dataType: row.data_type,
      nullable: row.is_nullable === 'YES',
    })
  }
  return byTable
}

async function main() {
  const envFile = resolve(argValue('--env-file', 'deploy/env/staging.env'))
  const output = resolve(argValue('--output', 'project-testing/reports/release-v1.4.24-20260702-125254/v14241-staging-schema-columns.current.json'))
  const env = parseEnv(await readFile(envFile, 'utf8'))
  const connectionString = normalizePgUrl(requireEnv(env, 'DB_CONNECTION_STRING'))
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    query_timeout: 15000,
    statement_timeout: 15000,
  })

  const expected = {
    tasks: ['id', 'project_id', 'title', 'version', 'updated_by', 'standard_task_metadata'],
    change_logs: [
      'id',
      'project_id',
      'entity_type',
      'entity_id',
      'field_name',
      'old_value',
      'new_value',
      'change_reason',
      'changed_by',
      'changed_at',
      'change_source',
      'action_type',
      'action_group',
      'before_snapshot',
      'after_snapshot',
      'metadata',
      'visibility',
      'retention_policy',
    ],
    task_dependencies: ['id', 'project_id', 'task_id', 'dependency_task_id', 'dependency_type', 'lag_days', 'status', 'source_type'],
  }

  let report
  try {
    await client.connect()
    const tables = Object.keys(expected)
    const columnsByTable = await queryColumns(client, tables)
    const missing = {}
    for (const [table, cols] of Object.entries(expected)) {
      const present = new Set((columnsByTable[table] ?? []).map((item) => item.column))
      missing[table] = cols.filter((column) => !present.has(column))
    }
    report = {
      schemaVersion: 'workbuddy/v14241-staging-schema-columns/v1',
      generatedAt: new Date().toISOString(),
      status: Object.values(missing).every((items) => items.length === 0) ? 'pass' : 'blocked',
      environment: 'controlled-staging-local',
      projectRef: projectRefFromSupabaseUrl(env.SUPABASE_URL),
      tables,
      expected,
      missing,
      columnsByTable,
      mutationBoundary: 'Read-only staging information_schema probe; no application data, schema, publication, rollback, live, or production mutation executed.',
    }
  } catch (error) {
    report = {
      schemaVersion: 'workbuddy/v14241-staging-schema-columns/v1',
      generatedAt: new Date().toISOString(),
      status: 'blocked',
      environment: 'controlled-staging-local',
      projectRef: projectRefFromSupabaseUrl(env.SUPABASE_URL),
      error: redactSecretLikeText(error instanceof Error ? error.message : String(error)),
      mutationBoundary: 'Read-only staging information_schema probe failed before any mutation.',
    }
  } finally {
    await client.end().catch(() => undefined)
  }

  assertNoSecretLikeText(report)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    status: report.status,
    missing: report.missing ?? null,
    output,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
