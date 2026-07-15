#!/usr/bin/env node

import pg from 'pg'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const { Client } = pg

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const mutationBoundary = 'readonly_db_audit_execution_only_no_db_mutation'

function pathOf(relativePath) {
  return resolve(repoRoot, relativePath)
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    packagePath: 'project-data/reports/readonly-db-audit-package/readonly-db-audit-package.json',
    outputDir: 'project-data/reports/readonly-db-audit-run',
    dryRun: false,
    pretty: true,
    maxRows: 50,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }

    if (arg === '--package') args.packagePath = nextValue()
    else if (arg === '--output-dir') args.outputDir = nextValue()
    else if (arg === '--max-rows') args.maxRows = Number.parseInt(nextValue(), 10)
    else if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--compact') args.pretty = false
    else throw new Error(`Unknown argument: ${arg}`)
  }

  if (!Number.isInteger(args.maxRows) || args.maxRows < 0) throw new Error('--max-rows must be a non-negative integer')
  return args
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(pathOf(relativePath), 'utf8'))
}

function stripSqlComments(sql) {
  return sql.replace(/--.*$/gm, '').trim()
}

function normalizeReadOnlySql(sql, label) {
  let normalized = stripSqlComments(sql)
  normalized = normalized.replace(/;+\s*$/g, '').trim()
  if (!/^select\b/i.test(normalized)) throw new Error(`${label} must start with SELECT`)
  if (normalized.includes(';')) throw new Error(`${label} must contain exactly one SELECT statement`)
  const forbidden = /\b(insert|update|delete|merge|alter|drop|truncate|create|grant|revoke|call|execute|copy|do|vacuum|analyze)\b/i
  if (forbidden.test(normalized)) throw new Error(`${label} contains a forbidden mutation or side-effect keyword`)
  return normalized
}

function buildAuditQueries(pkg) {
  const sections = [
    {
      id: 'schema_inventory',
      kind: 'schema',
      sql: pkg.readonlySql.schemaInventory,
    },
    {
      id: 'catalog_table_presence',
      kind: 'catalog',
      sql: pkg.readonlySql.catalogTablePresence,
    },
    {
      id: 'contract_column_presence',
      kind: 'contract',
      sql: pkg.readonlySql.contractColumnPresence,
    },
    ...(pkg.readonlySql.qualityChecks || []).map((check) => ({
      id: check.id,
      kind: 'quality',
      ruleId: check.ruleId,
      sql: check.sql,
    })),
  ]

  return sections.map((section) => ({
    ...section,
    sql: normalizeReadOnlySql(section.sql, section.id),
  }))
}

function databaseConfigFromEnv(env = process.env) {
  const required = [
    'WORKBUDDY_PG_HOST',
    'WORKBUDDY_PG_PORT',
    'WORKBUDDY_PG_DATABASE',
    'WORKBUDDY_PG_USER',
    'WORKBUDDY_PG_PASSWORD',
  ]
  const missing = required.filter((key) => !env[key] || env[key] === 'set-outside-repo')
  if (missing.length > 0) throw new Error(`Missing required PostgreSQL environment variables: ${missing.join(', ')}`)

  let host = env.WORKBUDDY_PG_HOST
  let port = Number.parseInt(env.WORKBUDDY_PG_PORT, 10)
  let database = env.WORKBUDDY_PG_DATABASE
  let user = env.WORKBUDDY_PG_USER
  let password = env.WORKBUDDY_PG_PASSWORD

  if (/^postgres(?:ql)?:\/\//i.test(host)) {
    const url = new URL(host)
    host = url.hostname
    port = Number.parseInt(url.port || env.WORKBUDDY_PG_PORT, 10)
    database = decodeURIComponent(url.pathname.replace(/^\//, '') || database)
    user = decodeURIComponent(url.username || user)
    password = decodeURIComponent(url.password || password)
  }

  if (!Number.isInteger(port) || port <= 0) throw new Error('WORKBUDDY_PG_PORT must be a valid integer port')

  return {
    host,
    port,
    database,
    user,
    password,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 30000,
    query_timeout: 30000,
    application_name: 'workbuddy-data-readonly-audit',
  }
}

function summarizeQuery(id, rows) {
  if (id === 'catalog_table_presence') {
    const missing = rows.filter((row) => row.table_exists === false).map((row) => row.table_id)
    return {
      missingTableCount: missing.length,
      missingTables: missing,
    }
  }

  if (id === 'contract_column_presence') {
    const missing = rows
      .filter((row) => row.column_exists === false)
      .map((row) => `${row.table_name}.${row.column_name}`)
    return {
      missingColumnCount: missing.length,
      missingColumns: missing,
    }
  }

  if (id === 'schema_inventory') {
    return {
      publicColumnCount: rows.length,
      publicTableCount: new Set(rows.map((row) => row.table_name)).size,
    }
  }

  if (rows.length === 1) {
    const entries = Object.entries(rows[0])
    if (entries.length === 1 && typeof entries[0][1] === 'number') {
      return {
        metric: entries[0][0],
        value: entries[0][1],
        passed: entries[0][1] === 0,
      }
    }
  }

  return {
    rowCount: rows.length,
    passed: rows.length === 0,
  }
}

async function runQueries(queries, args) {
  const client = new Client(databaseConfigFromEnv())
  await client.connect()
  try {
    await client.query('BEGIN READ ONLY')
    await client.query('SET LOCAL statement_timeout = 30000')
    await client.query('SET LOCAL idle_in_transaction_session_timeout = 30000')

    const results = []
    for (const [index, query] of queries.entries()) {
      const savepoint = `workbuddy_audit_q_${index + 1}`
      const startedAt = new Date().toISOString()
      await client.query(`SAVEPOINT ${savepoint}`)
      try {
        const result = await client.query(query.sql)
        const completedAt = new Date().toISOString()
        await client.query(`RELEASE SAVEPOINT ${savepoint}`)
        results.push({
          id: query.id,
          kind: query.kind,
          ruleId: query.ruleId,
          status: 'passed',
          startedAt,
          completedAt,
          rowCount: result.rowCount,
          summary: summarizeQuery(query.id, result.rows),
          rows: result.rows.slice(0, args.maxRows),
          truncated: result.rows.length > args.maxRows,
        })
      } catch (error) {
        const completedAt = new Date().toISOString()
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
        await client.query(`RELEASE SAVEPOINT ${savepoint}`)
        results.push({
          id: query.id,
          kind: query.kind,
          ruleId: query.ruleId,
          status: 'failed',
          startedAt,
          completedAt,
          rowCount: null,
          summary: {
            passed: false,
            error: error instanceof Error ? error.message : String(error),
          },
          rows: [],
          truncated: false,
        })
      }
    }

    await client.query('ROLLBACK')
    return results
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // The audit is already failing; preserve the original error.
    }
    throw error
  } finally {
    await client.end()
  }
}

function buildReport(pkg, queries, results, args) {
  const qualityResults = results.filter((result) => result.kind === 'quality')
  const failedQualityChecks = qualityResults.filter((result) => result.summary?.passed === false)
  const failedQueries = results.filter((result) => result.status === 'failed')
  const catalogPresence = results.find((result) => result.id === 'catalog_table_presence')
  const columnPresence = results.find((result) => result.id === 'contract_column_presence')

  return {
    schemaVersion: 'workbuddy-readonly-db-audit-run/v1',
    generatedAt: new Date().toISOString(),
    sourcePackageSchemaVersion: pkg.schemaVersion,
    sourcePackageGeneratedAt: pkg.generatedAt,
    mutationBoundary,
    executionMode: args.dryRun ? 'dry-run' : 'read-only-db',
    target: {
      environmentBoundary: 'explicitly supplied PostgreSQL target via environment variables',
      connectionDetailsRedacted: true,
    },
    summary: {
      plannedQueries: queries.length,
      executedQueries: results.length,
      failedQueryCount: failedQueries.length,
      tableContracts: pkg.summary.tableContractCount,
      qualityChecks: pkg.readonlySql.qualityChecks.length,
      missingTableCount: catalogPresence?.summary?.missingTableCount ?? null,
      missingColumnCount: columnPresence?.summary?.missingColumnCount ?? null,
      failedQualityCheckCount: failedQualityChecks.length,
    },
    results,
  }
}

function renderMarkdown(report) {
  const tablePresence = report.results.find((result) => result.id === 'catalog_table_presence')
  const columnPresence = report.results.find((result) => result.id === 'contract_column_presence')
  const missingTables = tablePresence?.summary?.missingTables || []
  const missingColumns = columnPresence?.summary?.missingColumns || []
  const failedQueries = report.results.filter((result) => result.status === 'failed')

  return [
    '# WorkBuddy Read-Only DB Audit Run',
    '',
    `- Schema: \`${report.schemaVersion}\``,
    `- Execution mode: \`${report.executionMode}\``,
    `- Mutation boundary: \`${report.mutationBoundary}\``,
    `- Planned queries: ${report.summary.plannedQueries}`,
    `- Executed queries: ${report.summary.executedQueries}`,
    `- Failed queries: ${report.summary.failedQueryCount}`,
    `- Missing tables: ${report.summary.missingTableCount}`,
    `- Missing contract columns: ${report.summary.missingColumnCount}`,
    `- Failed quality checks: ${report.summary.failedQualityCheckCount}`,
    '',
    '## Schema Drift',
    '',
    '### Missing Tables',
    '',
    ...(missingTables.length > 0 ? missingTables.map((table) => `- \`${table}\``) : ['- None']),
    '',
    '### Missing Contract Columns',
    '',
    ...(missingColumns.length > 0 ? missingColumns.map((column) => `- \`${column}\``) : ['- None']),
    '',
    '### Failed Queries',
    '',
    ...(failedQueries.length > 0
      ? failedQueries.map((result) => `- \`${result.id}\`: ${result.summary?.error || 'failed'}`)
      : ['- None']),
    '',
    '## Quality Results',
    '',
    ...report.results
      .filter((result) => result.kind === 'quality')
      .map((result) => `- ${result.id}: ${result.summary?.passed === false ? 'fail' : 'pass'}${typeof result.summary?.value === 'number' ? ` (${result.summary.metric}=${result.summary.value})` : ''}`),
    '',
    'No SQL in this run mutates database state. Connection details are redacted from the report.',
    '',
  ].join('\n')
}

async function writeReport(outputDir, report) {
  const targetDir = pathOf(outputDir)
  await mkdir(targetDir, { recursive: true })
  await writeFile(join(targetDir, 'readonly-db-audit-run.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(join(targetDir, 'readonly-db-audit-run.md'), renderMarkdown(report), 'utf8')
}

async function main() {
  const args = parseArgs()
  const pkg = await readJson(args.packagePath)
  const queries = buildAuditQueries(pkg)
  const dryRunResults = queries.map((query) => ({
    id: query.id,
    kind: query.kind,
    ruleId: query.ruleId,
    status: 'planned',
    rowCount: null,
    summary: null,
    rows: [],
    truncated: false,
  }))
  const results = args.dryRun ? dryRunResults : await runQueries(queries, args)
  const report = buildReport(pkg, queries, results, args)
  await writeReport(args.outputDir, report)

  console.log(JSON.stringify({
    status: 'passed',
    outputDir: args.outputDir,
    executionMode: report.executionMode,
    plannedQueries: report.summary.plannedQueries,
    executedQueries: report.summary.executedQueries,
    failedQueries: report.summary.failedQueryCount,
    missingTables: report.summary.missingTableCount,
    missingColumns: report.summary.missingColumnCount,
    failedQualityChecks: report.summary.failedQualityCheckCount,
    mutationBoundary,
  }, null, args.pretty ? 2 : 0))
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'failed',
    message: error instanceof Error ? error.message : String(error),
    mutationBoundary,
  }, null, 2))
  process.exitCode = 1
})
