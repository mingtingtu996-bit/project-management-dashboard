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

function parseNpmScript(command) {
  const match = command.match(/^npm run ([^ ]+)(?: --workspace[= ]([^ ]+))?/)
  if (!match) return null
  return { scriptName: match[1], workspace: match[2] ?? null }
}

async function assertRegisteredNpmScript(command, rootPackage) {
  const parsed = parseNpmScript(command)
  if (!parsed) return

  if (parsed.workspace) {
    const workspacePackage = await readJson(`${parsed.workspace}/package.json`)
    if (!workspacePackage.scripts?.[parsed.scriptName]) {
      fail(`Registered workspace npm script is missing: ${parsed.scriptName}`, {
        workspace: parsed.workspace,
        command,
      })
    }
    return
  }

  if (!rootPackage.scripts?.[parsed.scriptName]) {
    fail(`Registered root npm script is missing: ${parsed.scriptName}`, { command })
  }
}

function assertDatabaseMigrationGovernanceAdvisorExport(matrix) {
  const migrationGroup = matrix.gateGroups.find((group) => group.id === 'database-migration-and-recovery')
  if (!migrationGroup) fail('database-migration-and-recovery gate group is missing')

  const commands = migrationGroup.commands || []
  if (!commands.includes('npm run evidence:supabase-advisor:management-api-preflight -- --env-file deploy/env/staging.env --output <artifact-root>/supabase-advisor-management-api-preflight.json --advisor-output <artifact-root>/supabase-advisor-management-api-export.json --operator release-dashboard-db-profile')) {
    fail('database migration governance must preflight the formal Supabase Advisor Management API export prerequisites before MG-07 closeout')
  }

  if (!commands.includes('npm run evidence:supabase-advisor:management-api -- --env-file deploy/env/staging.env --output <artifact-root>/supabase-advisor-management-api-export.json --operator release-dashboard-db-profile')) {
    fail('database migration governance must generate a formal Supabase Advisor Management API export before MG-07 closeout')
  }

  if (!commands.includes('npm run evidence:supabase-advisor:dashboard-ui-template -- --env-file deploy/env/staging.env --output <artifact-root>/supabase-advisor-dashboard-ui-capture.template.json --operator release-dashboard-db-profile')) {
    fail('database migration governance must provide a fill-in Supabase Dashboard UI Advisor capture template before fallback normalization')
  }

  if (!commands.includes('npm run evidence:supabase-advisor:dashboard-ui-normalize -- --input <operator-captured-dashboard-advisor-json> --output <artifact-root>/supabase-advisor-management-api-export.json --project-ref <project-ref> --dashboard-url <supabase-dashboard-project-advisor-url> --operator release-dashboard-db-profile')) {
    fail('database migration governance must document the Supabase Dashboard UI Advisor export normalization fallback before MG-07 closeout')
  }

  if (!commands.some((command) => command.includes('--advisor-export-file <artifact-root-from-server>/supabase-advisor-management-api-export.json'))) {
    fail('database migration governance evidence must receive the formal Advisor export artifact through --advisor-export-file')
  }

  if (!(migrationGroup.blockingPrerequisites || []).some((item) => /Management API token/.test(item))) {
    fail('database migration governance must document the Management API token blocker')
  }

  if (!(migrationGroup.blockingPrerequisites || []).some((item) => /Dashboard UI Advisor JSON capture/.test(item))) {
    fail('database migration governance must document the Dashboard UI Advisor JSON capture fallback')
  }

  if (!(migrationGroup.blockingPrerequisites || []).some((item) => /templateOnly=false/.test(item))) {
    fail('database migration governance must document that Dashboard UI templates are not Advisor evidence')
  }
}

async function main() {
  const requiredFiles = [
    'project-testing/README.md',
    'project-testing/skills/workbuddy-release-testing/SKILL.md',
    'project-testing/matrix/release-test-matrix.json',
    'project-testing/index/moved-files.json',
    'project-testing/artifacts/README.md',
    'project-testing/plugins/testing-tool-inventory.json',
    'project-testing/plugins/github-actions-postgres-service-container.example.yml',
    'project-testing/runbooks/release-readiness.md',
    'project-testing/runbooks/local-deterministic-testing.md',
    'project-testing/runbooks/solo-live-handoff-template.json',
    'project-testing/tools/run-release-dashboard.mjs',
    'project-testing/tools/check-testing-tools.mjs',
    'project-testing/tools/check-local-deterministic-readiness.mjs',
    'project-testing/tools/check-solo-live-readiness.mjs',
    'project-testing/tools/run-server-vitest-slices.mjs',
    'project-testing/tools/generate-release-handoff-pack.mjs',
    'project-testing/tools/check-release-handoff-readiness.mjs',
    'project-testing/tools/validate-release-evidence.mjs',
    'project-testing/tools/evaluate-release-closeout.mjs',
    'project-testing/tools/summarize-release-closeout-status.mjs',
    'project-testing/tools/check-default-master-plan-evidence-sources.mjs',
    'project-testing/tools/generate-executable-default-master-plan-simulation.mjs',
    'project-testing/tools/executable-default-master-plan-construction-quality.test.mjs',
    'project-testing/tools/build-default-master-plan-real-production-outcome-package.mjs',
    'project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs',
    'project-testing/tools/build-default-master-plan-production-evidence-pipeline.test.mjs',
    'project-testing/tools/check-default-master-plan-candidate-export-hygiene.mjs',
    'project-testing/tools/check-supabase-advisor-management-api-preflight.mjs',
    'project-testing/tools/check-supabase-advisor-management-api-preflight.test.mjs',
    'project-testing/tools/export-supabase-advisor-management-api.mjs',
    'project-testing/tools/export-supabase-advisor-management-api.test.mjs',
    'project-testing/tools/create-supabase-advisor-dashboard-ui-capture-template.mjs',
    'project-testing/tools/create-supabase-advisor-dashboard-ui-capture-template.test.mjs',
    'project-testing/tools/normalize-supabase-advisor-dashboard-ui-export.mjs',
    'project-testing/tools/normalize-supabase-advisor-dashboard-ui-export.test.mjs',
    'project-testing/tools/summarize-default-master-plan-real-evidence-gaps.mjs',
  ]

  for (const file of requiredFiles) assertExists(file)
  assertExists('project-testing/reports', 'project-testing reports root')
  assertExists('project-testing/artifacts', 'project-testing artifacts root')

  const matrix = await readJson('project-testing/matrix/release-test-matrix.json')
  const moved = await readJson('project-testing/index/moved-files.json')
  const inventory = await readJson('project-testing/plugins/testing-tool-inventory.json')
  const packageJson = await readJson('package.json')

  if (matrix.schemaVersion !== 'workbuddy-release-test-matrix/v1') fail('Unexpected release test matrix schema version')
  if (moved.schemaVersion !== 'workbuddy-testing-moved-files.v1') fail('Unexpected moved-files schema version')
  if (inventory.schemaVersion !== 'workbuddy-testing-tool-inventory/v1') fail('Unexpected testing tool inventory schema version')
  if (!Array.isArray(matrix.gateGroups) || matrix.gateGroups.length === 0) fail('Release matrix has no gate groups')

  const allowedStatuses = new Set(['ready', 'deferred_live', 'blocked_db', 'inventory_only'])
  const allowedTiers = new Set([
    'local_static',
    'local_browser',
    'local_browser_msw',
    'local_api_contract',
    'container_db',
    'solo_live',
    'live_only',
    'db_dependent',
    'tooling_readiness',
    'planned',
  ])

  const seenGateIds = new Set()
  for (const group of matrix.gateGroups) {
    if (!group.id) fail('Release matrix gate group id is missing', { group })
    if (seenGateIds.has(group.id)) fail(`Duplicate release matrix gate group id: ${group.id}`)
    seenGateIds.add(group.id)
    if (!allowedStatuses.has(group.status)) fail(`Unknown gate status: ${group.status}`, { group: group.id })
    if (!allowedTiers.has(group.tier)) fail(`Unknown gate tier: ${group.tier}`, { group: group.id })
    for (const command of group.commands || []) {
      await assertRegisteredNpmScript(command, packageJson)
    }
  }

  assertDatabaseMigrationGovernanceAdvisorExport(matrix)

  for (const entry of moved.entries || []) {
    if (entry.status === 'moved' || entry.status === 'moved-with-junction') {
      assertExists(entry.newPath, `moved target ${entry.id}`)
    }
  }

  for (const scriptName of [
    'testing:center:check',
    'testing:dashboard:smoke',
    'testing:dashboard:release-local',
    'testing:dashboard:uiux',
    'testing:dashboard:solo-live',
    'testing:dashboard:tool-readiness',
    'testing:server-vitest:slices',
    'testing:solo-live-readiness',
    'verify:default-master-plan:executable-simulation',
    'verify:default-master-plan:construction-quality',
    'evidence:default-master-plan:sources',
    'evidence:default-master-plan:real-outcome-package',
    'evidence:default-master-plan:candidate-hygiene',
    'evidence:default-master-plan:real-evidence-gaps',
    'evidence:default-master-plan:test-concurrent',
    'evidence:supabase-advisor:management-api-preflight',
    'evidence:supabase-advisor:management-api',
    'evidence:supabase-advisor:dashboard-ui-template',
    'evidence:supabase-advisor:dashboard-ui-normalize',
    'evidence:supabase-advisor:test',
  ]) {
    if (!packageJson.scripts?.[scriptName]) fail(`Root npm script is missing: ${scriptName}`)
  }

  console.log(JSON.stringify({
    status: 'passed',
    message: 'Testing center check passed',
    gateGroups: matrix.gateGroups.length,
    movedEntries: moved.entries?.length || 0,
    toolInventory: inventory.tools?.length ?? 0,
    activeLiveThread: Boolean(matrix.concurrencyPolicy?.activeLiveThread),
    mutationBoundary: 'read-only center check; no live or DB commands run',
  }, null, 2))
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
