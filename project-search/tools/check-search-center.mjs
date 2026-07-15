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

function assertNoSecretPlaceholderLeak(config) {
  const serialized = JSON.stringify(config)
  const forbiddenPatterns = [
    /tvly-[A-Za-z0-9_-]+/,
    /fc-[A-Za-z0-9_-]+/,
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  ]

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(serialized)) {
      fail('MCP example config appears to contain a real API key or token-like value')
    }
  }
}

async function main() {
  const requiredFiles = [
    'project-search/README.md',
    'project-search/skills/workbuddy-project-search/SKILL.md',
    'project-search/plugins/mcp-config/README.md',
    'project-search/plugins/mcp-config/env.example',
    'project-search/plugins/mcp-config/workbuddy-project-search.mcp.example.json',
    'project-search/tools/ensure-search-mcp-plugins.mjs',
    'project-search/tools/check-progress-knowledge-sql-boundary.mjs',
    'project-search/tools/build-progress-knowledge-source-expansion.mjs',
    'project-search/tools/build-progress-knowledge-document-hash-repair.mjs',
    'project-search/tools/build-progress-knowledge-source-verification.mjs',
    'project-search/tools/build-progress-knowledge-extraction-review.mjs',
    'project-search/tools/build-progress-knowledge-clause-sequence-review.mjs',
    'project-search/tools/build-progress-knowledge-clause-sequence-candidate-review.mjs',
    'project-search/tools/build-progress-knowledge-clause-sequence-readiness.mjs',
    'project-search/tools/build-progress-knowledge-candidate-review.mjs',
    'project-search/tools/build-progress-knowledge-candidate-calibration.mjs',
    'project-search/tools/build-progress-knowledge-validation.mjs',
    'project-search/tools/build-progress-knowledge-real-project-sample-discovery.mjs',
    'project-search/tools/build-progress-knowledge-planned-schedule-field-review.mjs',
    'project-search/tools/build-progress-knowledge-real-project-same-project-pairing.mjs',
    'project-search/tools/build-progress-knowledge-completed-project-triad-candidates.mjs',
    'project-search/tools/build-progress-knowledge-p0-triad-human-review-package.mjs',
    'project-search/tools/build-progress-knowledge-p1-clause-sequence-human-review-package.mjs',
    'project-search/tools/build-progress-knowledge-p2-duration-quota-human-review-package.mjs',
    'project-search/tools/build-progress-knowledge-asset-catalog.mjs',
    'project-search/tools/query-progress-knowledge-asset-catalog.mjs',
    'project-search/tools/build-progress-knowledge-review-workbench.mjs',
    'project-search/tools/validate-progress-knowledge-review-decisions.mjs',
    'project-search/tools/build-progress-knowledge-sample-review-decisions.mjs',
    'project-search/tools/build-progress-knowledge-review-outcome-report.mjs',
    'project-search/tools/build-progress-knowledge-machine-precheck.mjs',
    'project-search/tools/build-progress-knowledge-priority-evidence-dossier.mjs',
    'project-search/tools/build-progress-knowledge-topic-index.mjs',
    'project-search/tools/query-progress-knowledge-topic-index.mjs',
    'project-search/tools/build-progress-knowledge-domain-packs.mjs',
    'project-search/tools/build-progress-knowledge-retrieval-pack.mjs',
    'project-search/tools/query-progress-knowledge-retrieval-pack.mjs',
    'project-search/tools/build-progress-knowledge-base-manifest.mjs',
    'project-search/tools/check-progress-knowledge-base-health.mjs',
    'project-search/knowledge-base/README.md',
    'project-search/knowledge-base/progress-knowledge-base-manifest.json',
    'project-search/knowledge-base/progress-knowledge-base-manifest.md',
    'project-search/knowledge-base/progress-knowledge-base-health-report.json',
    'project-search/knowledge-base/progress-knowledge-base-health-report.md',
    'project-search/knowledge-base/progress-knowledge-retrieval-pack.json',
    'project-search/knowledge-base/progress-knowledge-retrieval-pack.ndjson',
    'project-search/knowledge-base/progress-knowledge-retrieval-pack.csv',
    'project-search/knowledge-base/progress-knowledge-retrieval-pack.md',
  ]

  const requiredDirs = [
    'project-search/external-duration-research',
    'project-search/public-project-data',
    'project-search/knowledge-base',
    'project-search/knowledge-base/domain-packs',
    'project-search/knowledge-base/review-workbench',
    'project-search/inbox',
    'project-search/logs',
    'project-search/plugins',
    'project-search/tools',
  ]

  for (const file of requiredFiles) assertExists(file)
  for (const dir of requiredDirs) assertExists(dir, `${dir} directory`)

  const mcpExample = await readJson('project-search/plugins/mcp-config/workbuddy-project-search.mcp.example.json')
  assertNoSecretPlaceholderLeak(mcpExample)

  const expectedServers = new Set(['workbuddy-tavily', 'workbuddy-firecrawl', 'workbuddy-exa'])
  const configuredServers = new Set(Object.keys(mcpExample.mcpServers || {}))
  for (const server of expectedServers) {
    if (!configuredServers.has(server)) fail(`MCP example is missing ${server}`)
  }

  const mcpPackagePath = 'project-search/plugins/mcp-servers/package.json'
  const mcpServerDirReady = existsSync(pathOf(mcpPackagePath))
  const mcpPackages = mcpServerDirReady ? await readJson(mcpPackagePath) : { dependencies: {} }
  const requiredPackages = {
    'tavily-mcp': '0.2.20',
    'firecrawl-mcp': '3.22.1',
    'exa-mcp-server': '3.2.1',
  }

  const pluginStatus = Object.entries(requiredPackages).map(([packageName, version]) => ({
    packageName,
    requiredVersion: version,
    configuredVersion: mcpPackages.dependencies?.[packageName] ?? null,
    installedPackageJson: existsSync(pathOf(`project-search/plugins/mcp-servers/node_modules/${packageName}/package.json`)),
    envKeyPresent: Boolean(process.env[
      packageName === 'tavily-mcp'
        ? 'TAVILY_API_KEY'
        : packageName === 'firecrawl-mcp'
          ? 'FIRECRAWL_API_KEY'
          : 'EXA_API_KEY'
    ]),
  }))

  const packageJson = await readJson('package.json')
  const scripts = packageJson.scripts || {}
  for (const scriptName of ['search:center:check', 'search:mcp:ensure', 'search:knowledge:manifest', 'search:knowledge:health', 'search:knowledge:retrieval']) {
    if (!scripts[scriptName]) fail(`Root npm script is missing: ${scriptName}`)
  }

  console.log(JSON.stringify({
    status: 'passed',
    message: 'Search center check passed',
    mcpServerDirReady,
    pluginStatus,
    mutationBoundary: 'read-only center check; no production data writes',
  }, null, 2))
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
