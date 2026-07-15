import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function runNode(args) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  })
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(repoRoot, relativePath), 'utf8'))
}

async function listContractFiles(relativeDir) {
  const entries = await readdir(join(repoRoot, relativeDir), { withFileTypes: true })
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.contract.json'))
}

test('data center check validates files, scripts, MCP templates, and plugin inventory', async () => {
  const writerRegistry = await readJson('project-data/lineage/writers.json')
  const result = runNode(['project-data/tools/check-data-center.mjs'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.status, 'passed')
  assert.equal(payload.tables, 16)
  assert.equal(payload.services, 3)
  assert.equal(payload.metricSources, 3)
  assert.equal(payload.writers, writerRegistry.writers.length)
  assert.equal(payload.mutationBoundary, 'read-only center check; no database connection or data mutation')
})

test('data boundaries keep external and candidate material away from business facts', () => {
  const result = runNode(['project-data/tools/check-data-boundaries.mjs'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.status, 'passed')
  assert.equal(payload.forbiddenDirectExternalWrites, 16)
  assert.ok(payload.candidateToRuntimeGates >= 10)
})

test('writer registry validates paths, table references, and candidate-only writer limits', async () => {
  const writerRegistry = await readJson('project-data/lineage/writers.json')
  const result = runNode(['project-data/tools/check-writer-registry.mjs'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.status, 'passed')
  assert.equal(payload.writers, writerRegistry.writers.length)
})

test('writer coverage scan requires write-like files to be registered', () => {
  const result = runNode(['project-data/tools/check-data-writer-coverage.mjs'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.status, 'passed')
  assert.equal(payload.writerLikeFiles, payload.registeredWriterLikeFiles)
  assert.ok(payload.writerLikeFiles > 0)
  assert.equal(payload.mutationBoundary, 'read-only static writer coverage scan; no database connection or data mutation')
})

test('read-only data access preflight validates safety without connecting to DB', () => {
  const result = runNode(['project-data/tools/check-readonly-data-access-preflight.mjs'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.status, 'passed')
  assert.equal(typeof payload.readyForReadonlyDbReview, 'boolean')
  assert.equal(typeof payload.npmReady, 'boolean')
  assert.equal(payload.readOnlySqlStatements, 2)
  assert.equal(payload.mutationBoundary, 'read-only preflight only; no database connection or data mutation')
})

test('read-only DB audit package generator builds SQL without connecting to DB', () => {
  const result = runNode(['project-data/tools/build-readonly-db-audit-package.mjs'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.status, 'passed')
  assert.equal(payload.mutationBoundary, 'readonly_db_audit_package_only_no_db_connection_no_db_mutation')
  assert.ok(payload.qualityChecks > 0)
  assert.equal(payload.package.readonlySql.catalogTablePresence.includes('to_regclass'), true)
  assert.equal(payload.package.readonlySql.schemaInventory.toLowerCase().startsWith('select '), true)
  const baselineVersionCheck = payload.package.readonlySql.qualityChecks.find(
    (check) => check.id === 'task_baselines.baseline_version_required',
  )
  assert.ok(baselineVersionCheck)
  assert.match(baselineVersionCheck.sql, /status IN \('confirmed', 'pending_realign', 'archived', 'closed'\)/)
  assert.doesNotMatch(baselineVersionCheck.sql, /WHERE version IS NULL;$/)
})

test('read-only DB audit runner builds a dry-run report without connecting to DB', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'workbuddy-readonly-db-audit-'))
  try {
    const result = runNode([
      'project-data/tools/run-readonly-db-audit.mjs',
      '--dry-run',
      '--output-dir',
      outputDir,
    ])
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    const payload = JSON.parse(result.stdout)
    assert.equal(payload.status, 'passed')
    assert.equal(payload.executionMode, 'dry-run')
    assert.equal(payload.mutationBoundary, 'readonly_db_audit_execution_only_no_db_mutation')
    assert.ok(payload.plannedQueries > 0)
    assert.equal(payload.plannedQueries, payload.executedQueries)

    const report = JSON.parse(await readFile(join(outputDir, 'readonly-db-audit-run.json'), 'utf8'))
    assert.equal(report.executionMode, 'dry-run')
    assert.equal(report.target.connectionDetailsRedacted, true)
    assert.equal(report.results.every((entry) => entry.status === 'planned'), true)
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
})

test('data contracts validate table contracts and quality templates', async () => {
  const tableCatalog = await readJson('project-data/catalog/tables.json')
  const qualityRules = await readJson('project-data/quality/rules.json')
  const runtimeContracts = [
    ...await listContractFiles('project-data/contracts/runtime-writers'),
    ...await listContractFiles('project-data/contracts/candidate-assets'),
  ]
  const result = runNode(['project-data/tools/check-data-contracts.mjs'])
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.status, 'passed')
  assert.equal(payload.tableContracts, tableCatalog.tables.filter((table) => table.contractPath).length)
  assert.equal(payload.runtimeContracts, runtimeContracts.length)
  assert.equal(payload.qualityRules, qualityRules.rules.length)
})

test('MCP config is read-only scoped and contains no committed secrets', async () => {
  const config = await readJson('project-data/plugins/mcp-config/workbuddy-data.mcp.example.json')
  const text = JSON.stringify(config)
  assert.ok(config.mcpServers['workbuddy-supabase-readonly'])
  assert.ok(config.mcpServers['workbuddy-toolbox-postgres-readonly'])
  assert.ok(config.mcpServers['workbuddy-supabase-readonly'].args.includes('--read-only'))
  assert.ok(config.mcpServers['workbuddy-supabase-readonly'].args.includes('--project-ref'))
  assert.doesNotMatch(text, /sbp_[A-Za-z0-9_=-]+/)
  assert.doesNotMatch(text, /postgres(?:ql)?:\/\/[^"'\s]+/i)
  assert.doesNotMatch(text, /service[_-]?role/i)
})
