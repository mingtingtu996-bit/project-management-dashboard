#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function pathOf(relativePath) {
  return join(repoRoot, relativePath)
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(pathOf(relativePath), 'utf8'))
}

function fail(message, details = {}) {
  console.error(JSON.stringify({ status: 'failed', message, ...details }, null, 2))
  process.exit(1)
}

function assertExists(relativePath, label = relativePath) {
  if (!existsSync(pathOf(relativePath))) {
    fail(`${label} is missing`, { path: relativePath })
  }
}

function assertNoSecrets(text, label) {
  const forbiddenPatterns = [
    /sbp_[A-Za-z0-9_=-]+/,
    /sb_secret_[A-Za-z0-9_=-]+/,
    /postgres(?:ql)?:\/\/[^"'\s]+/i,
    /service[_-]?role/i,
    /password\s*[:=]\s*(?!set-outside-repo|\$\{)[^"'\s]+/i,
  ]
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) fail(`${label} appears to contain a secret or live database URL`)
  }
}

async function main() {
  const requiredFiles = [
    'project-data/README.md',
    'project-data/skills/workbuddy-data-governance/SKILL.md',
    'project-data/plugins/mcp-config/README.md',
    'project-data/plugins/mcp-config/env.example',
    'project-data/plugins/mcp-config/workbuddy-data.mcp.example.json',
    'project-data/plugins/mcp-config/toolbox-postgres-readonly.tools.example.yaml',
    'project-data/plugins/python-tools/requirements.txt',
    'project-data/catalog/tables.json',
    'project-data/catalog/columns.json',
    'project-data/catalog/services.json',
    'project-data/catalog/metrics.json',
    'project-data/boundaries/forbidden-writes.json',
    'project-data/boundaries/mutation-boundaries.json',
    'project-data/boundaries/environment-boundaries.json',
    'project-data/boundaries/candidate-to-runtime-gates.json',
    'project-data/lineage/writers.json',
    'project-data/lineage/migrations.json',
    'project-data/lineage/runtime-publications.json',
    'project-data/lineage/external-knowledge-flow.json',
    'project-data/quality/rules.json',
    'project-data/tools/ensure-data-governance-plugins.mjs',
    'project-data/tools/check-data-center.mjs',
    'project-data/tools/check-data-boundaries.mjs',
    'project-data/tools/check-writer-registry.mjs',
    'project-data/tools/check-data-writer-coverage.mjs',
    'project-data/tools/check-readonly-data-access-preflight.mjs',
    'project-data/tools/build-readonly-db-audit-package.mjs',
    'project-data/tools/run-readonly-db-audit.mjs',
    'project-data/tools/check-data-contracts.mjs',
    'project-data/tools/data-center.test.mjs',
  ]

  const requiredDirs = [
    'project-data/contracts/tables',
    'project-data/contracts/runtime-writers',
    'project-data/contracts/candidate-assets',
    'project-data/plugins/mcp-servers',
    'project-data/plugins/python-tools',
    'project-data/reports',
  ]

  for (const file of requiredFiles) assertExists(file)
  for (const dir of requiredDirs) assertExists(dir, `${dir} directory`)

  const tables = await readJson('project-data/catalog/tables.json')
  const services = await readJson('project-data/catalog/services.json')
  const metrics = await readJson('project-data/catalog/metrics.json')
  const writers = await readJson('project-data/lineage/writers.json')
  const forbidden = await readJson('project-data/boundaries/forbidden-writes.json')
  const packageJson = await readJson('package.json')
  const mcpConfigText = await readFile(pathOf('project-data/plugins/mcp-config/workbuddy-data.mcp.example.json'), 'utf8')
  const envExampleText = await readFile(pathOf('project-data/plugins/mcp-config/env.example'), 'utf8')
  const toolboxConfigText = await readFile(pathOf('project-data/plugins/mcp-config/toolbox-postgres-readonly.tools.example.yaml'), 'utf8')

  if (tables.schemaVersion !== 'workbuddy-data-table-catalog/v1') fail('Unexpected table catalog schema version')
  if (services.schemaVersion !== 'workbuddy-data-service-catalog/v1') fail('Unexpected service catalog schema version')
  if (metrics.schemaVersion !== 'workbuddy-data-metric-catalog/v1') fail('Unexpected metric catalog schema version')
  if (writers.schemaVersion !== 'workbuddy-data-writer-registry/v1') fail('Unexpected writer registry schema version')
  if (forbidden.schemaVersion !== 'workbuddy-data-forbidden-writes/v1') fail('Unexpected forbidden writes schema version')

  assertNoSecrets(mcpConfigText, 'MCP config template')
  assertNoSecrets(envExampleText, 'env example')
  assertNoSecrets(toolboxConfigText, 'Toolbox config template')

  const mcpConfig = JSON.parse(mcpConfigText)
  const supabase = mcpConfig.mcpServers?.['workbuddy-supabase-readonly']
  if (!supabase) fail('Supabase read-only MCP server config is missing')
  if (!supabase.args?.includes('--read-only')) fail('Supabase MCP config must include --read-only')
  if (!supabase.args?.includes('--project-ref')) fail('Supabase MCP config must include --project-ref')
  if (!mcpConfig.mcpServers?.['workbuddy-toolbox-postgres-readonly']) fail('MCP Toolbox read-only config is missing')

  for (const scriptName of [
    'data:center:check',
    'data:center:test',
    'data:plugins:ensure',
    'data:boundaries:check',
    'data:writers:check',
    'data:writer-coverage:check',
    'data:readonly-preflight',
    'data:readonly-audit-package',
    'data:readonly-audit-run',
    'data:contracts:check',
  ]) {
    if (!packageJson.scripts?.[scriptName]) fail(`Root npm script is missing: ${scriptName}`)
  }

  const mcpPackageJsonPath = 'project-data/plugins/mcp-servers/package.json'
  const mcpServerDirReady = existsSync(pathOf(mcpPackageJsonPath))
  const mcpPackages = mcpServerDirReady ? await readJson(mcpPackageJsonPath) : { dependencies: {} }
  const pluginStatus = [
    {
      packageName: '@supabase/mcp-server-supabase',
      requiredVersion: '0.8.2',
      configuredVersion: mcpPackages.dependencies?.['@supabase/mcp-server-supabase'] ?? null,
      installedPackageJson: existsSync(pathOf('project-data/plugins/mcp-servers/node_modules/@supabase/mcp-server-supabase/package.json')),
    },
    {
      packageName: '@toolbox-sdk/server',
      requiredVersion: '1.6.0',
      configuredVersion: mcpPackages.dependencies?.['@toolbox-sdk/server'] ?? null,
      installedPackageJson: existsSync(pathOf('project-data/plugins/mcp-servers/node_modules/@toolbox-sdk/server/package.json')),
    },
  ]

  console.log(JSON.stringify({
    status: 'passed',
    message: 'Data center check passed',
    tables: tables.tables.length,
    services: services.services.length,
    metricSources: metrics.metricSources.length,
    writers: writers.writers.length,
    mcpServerDirReady,
    pluginStatus,
    mutationBoundary: 'read-only center check; no database connection or data mutation',
  }, null, 2))
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
