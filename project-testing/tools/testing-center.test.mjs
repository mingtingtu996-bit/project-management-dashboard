import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(repoRoot, relativePath), 'utf8'))
}

function parseNpmScript(command) {
  const match = command.match(/^npm run ([^ ]+)(?: --workspace[= ]([^ ]+))?/)
  if (!match) return null
  return { scriptName: match[1], workspace: match[2] ?? null }
}

function runNode(args) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  })
}

test('project-testing center has release dashboard entrypoints and governance files', () => {
  const expectedPaths = [
    'project-testing/README.md',
    'project-testing/skills/workbuddy-release-testing/SKILL.md',
    'project-testing/matrix/release-test-matrix.json',
    'project-testing/index/moved-files.json',
    'project-testing/artifacts/README.md',
    'project-testing/plugins/testing-tool-inventory.json',
    'project-testing/runbooks/release-readiness.md',
    'project-testing/tools/check-testing-center.mjs',
    'project-testing/tools/run-release-dashboard.mjs',
    'project-testing/tools/check-testing-tools.mjs',
    'project-testing/tools/check-local-deterministic-readiness.mjs',
    'project-testing/tools/check-solo-live-readiness.mjs',
    'project-testing/artifacts',
    'project-testing/artifacts/browser-checks',
    'project-testing/reports',
    'project-testing/runbooks/local-deterministic-testing.md',
    'project-testing/runbooks/solo-live-handoff-template.json',
    'project-testing/plugins/github-actions-postgres-service-container.example.yml',
  ]

  for (const relativePath of expectedPaths) {
    assert.equal(existsSync(join(repoRoot, relativePath)), true, `${relativePath} should exist`)
  }
})

test('browser artifact roots now point at the testing center', async () => {
  const matrix = await readJson('project-testing/matrix/release-test-matrix.json')
  const browserGroups = matrix.gateGroups.filter((group) => group.id.startsWith('browser-suite-'))

  assert.equal(browserGroups.length, 3)
  for (const group of browserGroups) {
    assert.equal(group.artifactRoot, 'project-testing/artifacts/browser-checks')
  }
})

test('browser WBS template verification fixture does not expose retired bootstrap actions', async () => {
  const source = await readFile(join(repoRoot, 'scripts/verify-wbs-templates-browser.mjs'), 'utf8')

  for (const retiredMarker of [
    'completed_project_to_template',
    'ongoing_project_to_baseline',
    '/bootstrap/from-completed-project',
    '/bootstrap/from-ongoing-project',
    '/api/task-baselines/bootstrap/from-schedule',
  ]) {
    assert.equal(
      source.includes(retiredMarker),
      false,
      `verify-wbs-templates-browser fixture should not contain retired bootstrap marker ${retiredMarker}`,
    )
  }
})

test('release matrix gate ids are unique and command scripts are registered', async () => {
  const matrix = await readJson('project-testing/matrix/release-test-matrix.json')
  const packageJson = await readJson('package.json')
  const workspacePackages = new Map()
  const seenGateIds = new Set()

  for (const group of matrix.gateGroups) {
    assert.ok(group.id, 'gate group id should be present')
    assert.equal(seenGateIds.has(group.id), false, `duplicate gate group id: ${group.id}`)
    seenGateIds.add(group.id)

    for (const command of group.commands || []) {
      const parsed = parseNpmScript(command)
      if (!parsed) continue
      if (parsed.workspace) {
        if (!workspacePackages.has(parsed.workspace)) {
          workspacePackages.set(parsed.workspace, await readJson(`${parsed.workspace}/package.json`))
        }
        const workspacePackage = workspacePackages.get(parsed.workspace)
        assert.ok(
          workspacePackage.scripts?.[parsed.scriptName],
          `${parsed.scriptName} should be registered in ${parsed.workspace}/package.json for ${group.id}`,
        )
      } else {
        assert.ok(packageJson.scripts[parsed.scriptName], `${parsed.scriptName} should be registered for ${group.id}`)
      }
    }
  }
})

test('root package exposes testing cockpit shortcuts', async () => {
  const packageJson = await readJson('package.json')

  for (const scriptName of [
    'testing:center:check',
    'testing:dashboard',
    'testing:dashboard:smoke',
    'testing:dashboard:release-local',
    'testing:dashboard:uiux',
    'testing:dashboard:solo-live',
    'testing:dashboard:tool-readiness',
    'testing:dashboard:default-master-plan',
    'testing:server-vitest:slices',
    'testing:solo-live-readiness',
  ]) {
    assert.ok(packageJson.scripts[scriptName], `${scriptName} should be registered`)
  }

  assert.equal(
    packageJson.scripts['testing:dashboard:default-master-plan'],
    'node project-testing/tools/run-release-dashboard.mjs --profile release-local --gate default-master-plan-evidence-source-kit --dry-run',
    'default master-plan dashboard shortcut should expose the source-kit action handoff without requiring long manual flags',
  )
})

test('local deterministic profile plans non-live readiness without selecting live or DB gates', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'workbuddy-local-deterministic-dashboard-'))

  try {
    const result = runNode([
      'project-testing/tools/run-release-dashboard.mjs',
      '--profile',
      'local-deterministic',
      '--dry-run',
      '--report-root',
      tempDir,
    ])

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)

    const reportDirs = await readdir(tempDir)
    assert.equal(reportDirs.length, 1, 'dashboard should write exactly one report directory')

    const summary = JSON.parse(await readFile(join(tempDir, reportDirs[0], 'summary.json'), 'utf8'))
    const selectedIds = summary.selectedGroups.map((group) => group.id)

    assert.equal(summary.profile, 'local-deterministic')
    assert.ok(selectedIds.includes('local-deterministic-readiness'))
    assert.ok(selectedIds.includes('msw-deterministic-page-data'))
    assert.ok(selectedIds.includes('unit-and-contract'))
  assert.equal(summary.selectedGroups.some((group) => group.tier === 'live_only'), false)
  assert.equal(summary.selectedGroups.some((group) => group.tier === 'solo_live'), false)
  assert.equal(summary.selectedGroups.some((group) => group.tier === 'db_dependent'), false)
  assert.equal(summary.deferredGroups.some((group) => group.tier === 'live_only'), true)
  assert.equal(summary.deferredGroups.some((group) => group.tier === 'solo_live'), true)
  assert.equal(summary.blockedGroups.some((group) => group.tier === 'db_dependent'), true)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('local deterministic readiness checker proves prerequisites without live or DB access', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'workbuddy-local-deterministic-readiness-'))
  const outputPath = join(tempDir, 'readiness.json')

  try {
    const result = runNode([
      'project-testing/tools/check-local-deterministic-readiness.mjs',
      '--output',
      outputPath,
    ])

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)

    const report = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(report.schemaVersion, 'workbuddy-local-deterministic-readiness/v1')
    assert.equal(report.status, 'ready')
    assert.equal(report.productionMutationPossible, false)
    assert.match(report.mutationBoundary, /no live Supabase/)
    assert.ok(report.checks.some((check) => check.id === 'client-msw-package' && check.status === 'present'))
    assert.ok(report.checks.some((check) => check.id === 'company-cockpit-msw-smoke' && check.status === 'present'))
    assert.ok(report.checks.some((check) => check.id === 'server-runtime-db-override' && check.status === 'present'))
    assert.ok(report.checks.some((check) => check.id === 'github-postgres-service-container-template' && check.status === 'present'))
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('release matrix inventories deterministic MSW, API contract, and container DB gates', async () => {
  const matrix = await readJson('project-testing/matrix/release-test-matrix.json')
  const readiness = matrix.gateGroups.find((group) => group.id === 'local-deterministic-readiness')
  const msw = matrix.gateGroups.find((group) => group.id === 'msw-deterministic-page-data')
  const apiContract = matrix.gateGroups.find((group) => group.id === 'local-api-contract-boundary')
  const containerDb = matrix.gateGroups.find((group) => group.id === 'container-postgres-integration')
  const soloLive = matrix.gateGroups.find((group) => group.id === 'solo-live-personal-real-environment')

  assert.equal(readiness?.tier, 'tooling_readiness')
  assert.equal(readiness?.status, 'ready')
  assert.ok(readiness.commands.includes('node project-testing/tools/check-local-deterministic-readiness.mjs --output project-testing/reports/local-deterministic-readiness.json'))

  assert.equal(msw?.tier, 'local_browser_msw')
  assert.equal(msw?.status, 'ready')
  assert.ok(msw.commands.includes('npm exec --workspace=client -- vitest run src/pages/__tests__/CompanyCockpit.msw.test.tsx'))
  assert.match(msw?.mutationBoundary ?? '', /cannot close live/)

  assert.equal(apiContract?.tier, 'local_api_contract')
  assert.equal(apiContract?.status, 'inventory_only')
  assert.match(apiContract?.mutationBoundary ?? '', /no live service/)

  assert.equal(containerDb?.tier, 'container_db')
  assert.equal(containerDb?.status, 'inventory_only')
  assert.match(containerDb?.mutationBoundary ?? '', /ephemeral container database/)

  assert.equal(soloLive?.tier, 'solo_live')
  assert.equal(soloLive?.status, 'deferred_live')
  assert.ok(soloLive?.commands.includes('npm run testing:solo-live-readiness -- --handoff-file project-testing/runbooks/solo-live-handoff-template.json --output project-testing/reports/solo-live-readiness.json'))
  assert.match(soloLive?.mutationBoundary ?? '', /no production-ready claim/)
})

test('solo-live dashboard profile requires personal owner unlock and selects only solo-live gates', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'workbuddy-solo-live-dashboard-'))

  try {
    const blocked = runNode([
      'project-testing/tools/run-release-dashboard.mjs',
      '--profile',
      'solo-live',
      '--dry-run',
      '--report-root',
      tempDir,
    ])

    assert.notEqual(blocked.status, 0)
    assert.match(blocked.stderr, /requires --include-solo-live and --confirm-solo-live-owner/)

    const result = runNode([
      'project-testing/tools/run-release-dashboard.mjs',
      '--profile',
      'solo-live',
      '--dry-run',
      '--include-solo-live',
      '--confirm-solo-live-owner',
      '--report-root',
      tempDir,
    ])

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)

    const reportDirs = await readdir(tempDir)
    assert.equal(reportDirs.length, 1, 'successful solo-live dashboard run should write exactly one report directory')

    const summary = JSON.parse(await readFile(join(tempDir, reportDirs[0], 'summary.json'), 'utf8'))
    assert.equal(summary.profile, 'solo-live')
    assert.deepEqual(summary.selectedGroups.map((group) => group.id), ['solo-live-personal-real-environment'])
    assert.equal(summary.selectedGroups[0].tier, 'solo_live')
    assert.equal(summary.selectedGroups[0].commands[0], 'npm run testing:solo-live-readiness -- --handoff-file project-testing/runbooks/solo-live-handoff-template.json --output project-testing/reports/solo-live-readiness.json')
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('testing tool inventory separates active MSW from planned container tools', async () => {
  const inventory = await readJson('project-testing/plugins/testing-tool-inventory.json')
  const toolsById = new Map(inventory.tools.map((tool) => [tool.id, tool]))

  assert.equal(toolsById.get('msw')?.stage, 'active-local')
  assert.equal(toolsById.get('msw')?.releaseEvidencePolicy, 'local-browser-msw-support')
  assert.equal(toolsById.get('github-actions-postgres-service-container')?.stage, 'planned-ci')
  assert.equal(toolsById.get('testcontainers-postgresql')?.stage, 'future')
})

test('testing center routes server Vitest through observable slices instead of one silent full run', async () => {
  const matrix = await readJson('project-testing/matrix/release-test-matrix.json')
  const packageJson = await readJson('package.json')

  assert.equal(
    existsSync(join(repoRoot, 'project-testing/tools/run-server-vitest-slices.mjs')),
    true,
    'observable server Vitest slice runner should exist',
  )
  assert.ok(packageJson.scripts['testing:server-vitest:slices'], 'root package should expose the slice runner')

  const unitGroup = matrix.gateGroups.find((group) => group.id === 'unit-and-contract')
  assert.ok(unitGroup, 'unit-and-contract gate should exist')
  assert.equal(
    unitGroup.commands.some((command) => command === 'npx vitest run --config server/vitest.config.ts'),
    false,
    'local release gate should not call the all-project server Vitest config directly',
  )
  assert.ok(
    unitGroup.commands.includes('npm run testing:server-vitest:slices -- --project server-default --output <artifact-root>/server-vitest-default-slices.json'),
    'unit-and-contract should use observable server-default slices',
  )

  const heavyGroup = matrix.gateGroups.find((group) => group.id === 'server-wbs-long-observable')
  assert.ok(heavyGroup, 'heavy WBS/server long-test gate should exist separately from release-local')
  assert.equal(heavyGroup.status, 'inventory_only')
  assert.equal(heavyGroup.tier, 'planned')
  assert.ok(
    heavyGroup.commands.includes('npm run testing:server-vitest:slices -- --project server-wbs-long --timeout-ms 420000 --output <artifact-root>/server-vitest-wbs-long-slices.json'),
    'heavy WBS long tests should have an explicit observable runner command',
  )
})

test('server Vitest slice runner can create a plan without collecting Vitest tests', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'workbuddy-server-vitest-slices-'))
  const outputPath = join(tempDir, 'plan.json')

  try {
    const result = runNode([
      'project-testing/tools/run-server-vitest-slices.mjs',
      '--project',
      'server-default',
      '--plan-only',
      '--limit',
      '5',
      '--output',
      outputPath,
    ])

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)

    const report = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(report.schemaVersion, 'workbuddy-server-vitest-slices/v1')
    assert.equal(report.project, 'server-default')
    assert.equal(report.planOnly, true)
    assert.equal(report.summary.status, 'planned')
    assert.equal(report.mutationBoundary, 'local test execution only; no live or DB commands run')
    assert.equal(report.selectedFiles.length, 5)
    assert.ok(
      report.excludedLongRunningFiles.includes('src/__tests__/constructionDependencyRuleSystemTrust.test.ts'),
      'server-default plan should exclude configured long-running WBS tests',
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('server Vitest slice runner avoids shell-args deprecation on Windows child processes', async () => {
  const source = await readFile(join(repoRoot, 'project-testing/tools/run-server-vitest-slices.mjs'), 'utf8')

  assert.match(source, /cmd\.exe/)
  assert.match(source, /\/d/)
  assert.match(source, /\/c/)
  assert.doesNotMatch(
    source,
    /shell:\s*process\.platform\s*===\s*['"]win32['"]/,
    'runner should not pass argument arrays through shell=true on Windows',
  )
})

test('testing center governs canonical default master-plan evidence tools and retires the legacy staging writer', async () => {
  const packageJson = await readJson('package.json')
  const matrix = await readJson('project-testing/matrix/release-test-matrix.json')
  const readinessChecker = await readFile(
    join(repoRoot, 'project-testing/tools/check-default-master-plan-production-readiness.mjs'),
    'utf8',
  )

  for (const relativePath of [
    'project-testing/tools/build-default-master-plan-real-production-outcome-package.mjs',
    'project-testing/tools/build-default-master-plan-completed-task-export.mjs',
    'project-testing/tools/build-default-master-plan-real-duration-sample-material-template.mjs',
    'project-testing/tools/build-default-master-plan-real-duration-sample-material-from-task-export.mjs',
    'project-testing/tools/build-default-master-plan-real-duration-sample-source-export.mjs',
    'project-testing/tools/check-default-master-plan-real-duration-sample-material-preflight.mjs',
    'project-testing/tools/check-default-master-plan-real-duration-sample-collection-kit-preflight.mjs',
    'project-testing/tools/check-default-master-plan-candidate-export-hygiene.mjs',
    'project-testing/tools/build-default-master-plan-real-duration-sample-material-from-collection-kit-preflight.mjs',
    'project-testing/tools/refresh-default-master-plan-readiness-dashboard.mjs',
    'project-testing/tools/export-supabase-advisor-management-api.mjs',
    'project-testing/tools/create-supabase-advisor-dashboard-ui-capture-template.mjs',
    'project-testing/tools/normalize-supabase-advisor-dashboard-ui-export.mjs',
    'project-testing/tools/summarize-default-master-plan-real-evidence-gaps.mjs',
  ]) {
    assert.equal(existsSync(join(repoRoot, relativePath)), true, `${relativePath} should exist`)
  }

  for (const scriptName of [
    'evidence:default-master-plan:real-outcome-package',
    'evidence:default-master-plan:completed-task-export',
    'evidence:default-master-plan:real-duration-sample-template',
    'evidence:default-master-plan:real-duration-sample-from-task-export',
    'evidence:default-master-plan:real-duration-sample-export',
    'evidence:default-master-plan:real-duration-sample-preflight',
    'evidence:default-master-plan:candidate-hygiene',
    'evidence:default-master-plan:real-evidence-gaps',
    'evidence:default-master-plan:readiness-dashboard',
    'evidence:default-master-plan:test-concurrent',
    'evidence:supabase-advisor:management-api',
    'evidence:supabase-advisor:dashboard-ui-template',
    'evidence:supabase-advisor:dashboard-ui-normalize',
    'evidence:supabase-advisor:test',
  ]) {
    assert.ok(packageJson.scripts[scriptName], `${scriptName} should be registered`)
  }

  const migrationGroup = matrix.gateGroups.find((group) => group.id === 'database-migration-and-recovery')
  assert.ok(migrationGroup, 'database migration governance group should exist')
  assert.ok(
    migrationGroup.commands.includes('npm run evidence:supabase-advisor:management-api -- --env-file deploy/env/staging.env --output <artifact-root>/supabase-advisor-management-api-export.json --operator release-dashboard-db-profile'),
    'database migration governance should include the formal Supabase Advisor Management API export command',
  )
  assert.ok(
    migrationGroup.commands.includes('npm run evidence:supabase-advisor:dashboard-ui-template -- --env-file deploy/env/staging.env --output <artifact-root>/supabase-advisor-dashboard-ui-capture.template.json --operator release-dashboard-db-profile'),
    'database migration governance should include the Supabase Advisor Dashboard UI capture template command',
  )
  assert.ok(
    migrationGroup.commands.includes('npm run evidence:supabase-advisor:dashboard-ui-normalize -- --input <operator-captured-dashboard-advisor-json> --output <artifact-root>/supabase-advisor-management-api-export.json --project-ref <project-ref> --dashboard-url <supabase-dashboard-project-advisor-url> --operator release-dashboard-db-profile'),
    'database migration governance should include the formal Supabase Advisor Dashboard UI normalization fallback',
  )
  assert.ok(
    migrationGroup.commands.some((command) => command.includes('--advisor-export-file <artifact-root-from-server>/supabase-advisor-management-api-export.json')),
    'production governance evidence should require the formal Advisor export artifact',
  )
  assert.ok(
    migrationGroup.blockingPrerequisites?.some((item) => /Management API token/.test(item)),
    'database migration governance should document the Management API token blocker',
  )
  assert.ok(
    migrationGroup.blockingPrerequisites?.some((item) => /Dashboard UI Advisor JSON capture/.test(item)),
    'database migration governance should document the Dashboard UI Advisor JSON capture fallback',
  )
  assert.ok(
    migrationGroup.blockingPrerequisites?.some((item) => /templateOnly=false/.test(item)),
    'database migration governance should document that Dashboard UI templates are not Advisor evidence',
  )

  const executableGenerationGroup = matrix.gateGroups.find((group) => (
    group.id === 'default-master-plan-executable-generation-quality'
  ))
  assert.ok(executableGenerationGroup, 'default-master-plan executable generation quality group should exist')
  assert.equal(executableGenerationGroup.tier, 'local_static')
  assert.equal(executableGenerationGroup.status, 'ready')
  assert.ok(
    executableGenerationGroup.commands.includes('npm run verify:default-master-plan:executable-simulation'),
    'executable generation quality group should regenerate all 11 wizard plans',
  )
  assert.ok(
    executableGenerationGroup.commands.includes('npm run verify:default-master-plan:construction-quality'),
    'executable generation quality group should run construction network and semantic gates',
  )
  assert.ok(
    executableGenerationGroup.commands.some((command) => /defaultMasterPlanFinalNetworkEvaluation/.test(command)),
    'executable generation quality group should verify final CPM evaluation',
  )
  assert.ok(
    executableGenerationGroup.commands.some((command) => /wizardGenerationSideEffects/.test(command)),
    'executable generation quality group should verify wizard pre-write rejection',
  )
  assert.match(executableGenerationGroup.mutationBoundary, /no DB/i)
  assert.match(executableGenerationGroup.mutationBoundary, /production writes/i)
  assert.match(
    packageJson.scripts['verify:default-master-plan:executable-simulation'],
    /generate-executable-default-master-plan-simulation\.mjs/,
  )
  assert.match(
    packageJson.scripts['verify:default-master-plan:construction-quality'],
    /executable-default-master-plan-construction-quality\.test\.mjs/,
  )

  const sourceKitGroup = matrix.gateGroups.find((group) => group.id === 'default-master-plan-evidence-source-kit')
  assert.ok(sourceKitGroup, 'default-master-plan evidence source kit group should exist')
  assert.equal(sourceKitGroup.tier, 'tooling_readiness')
  assert.ok(
    sourceKitGroup.commands.includes('npm run evidence:default-master-plan:real-outcome-package'),
    'source kit group should expose the no-write real outcome package builder',
  )
  assert.ok(
    sourceKitGroup.commands.includes('npm run evidence:default-master-plan:completed-task-export'),
    'source kit group should expose the no-write completed task export builder',
  )
  assert.ok(
    sourceKitGroup.commands.includes('npm run evidence:default-master-plan:real-duration-sample-template'),
    'source kit group should expose the no-write real duration sample material template builder',
  )
  assert.ok(
    sourceKitGroup.commands.includes('npm run evidence:default-master-plan:real-duration-sample-from-task-export'),
    'source kit group should expose the no-write completed task export to real duration sample material builder',
  )
  assert.ok(
    sourceKitGroup.commands.includes('npm run evidence:default-master-plan:real-duration-sample-preflight'),
    'source kit group should expose the no-write real duration sample material preflight checker',
  )
  assert.ok(
    sourceKitGroup.commands.includes('npm run evidence:default-master-plan:real-duration-sample-export'),
    'source kit group should expose the no-write real duration sample source export builder',
  )
  assert.ok(
    sourceKitGroup.commands.includes('node project-testing/tools/check-default-master-plan-real-duration-sample-collection-kit-preflight.mjs --collection-kit project-testing/reports/default-master-plan-production-readiness/real-duration-sample-collection-kit.json --output project-testing/reports/default-master-plan-production-readiness/real-duration-sample-collection-kit-preflight.json --checked-by <operator-id>'),
    'source kit group should expose the no-write real duration sample collection kit preflight checker',
  )
  assert.ok(
    sourceKitGroup.commands.includes('node project-testing/tools/build-default-master-plan-real-duration-sample-material-from-collection-kit-preflight.mjs --collection-package project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --collection-kit-preflight project-testing/reports/default-master-plan-production-readiness/real-duration-sample-collection-kit-preflight.json --output project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material.json --prepared-by <operator-id>'),
    'source kit group should expose the no-write collection-kit preflight to real duration sample material builder',
  )
  assert.ok(
    sourceKitGroup.commands.includes('npm run evidence:default-master-plan:candidate-hygiene'),
    'source kit group should expose the candidate export hygiene checker',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/check-default-master-plan-candidate-export-hygiene\.test\.mjs/,
    'concurrent default-master-plan regression should include candidate export hygiene checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/build-default-master-plan-post-publish-smoke-rollback-evidence\.test\.mjs/,
    'concurrent default-master-plan regression should include post-publish smoke/rollback real-outcome target checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/build-default-master-plan-production-evidence-bundle\.test\.mjs/,
    'concurrent default-master-plan regression should include production evidence bundle real-outcome target checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/build-default-master-plan-production-evidence-pipeline\.test\.mjs/,
    'concurrent default-master-plan regression should include production evidence pipeline source-manifest and real-outcome wiring checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/build-default-master-plan-dependency-writer-evidence\.test\.mjs/,
    'concurrent default-master-plan regression should include dependency writer evidence source-lineage checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/plan-default-master-plan-duration-sample-gaps\.test\.mjs/,
    'concurrent default-master-plan regression should include duration sample gap baseline source-lineage checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/build-default-master-plan-duration-sample-collection-package\.test\.mjs/,
    'concurrent default-master-plan regression should include duration sample collection gap-plan source-lineage checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/build-default-master-plan-completed-task-export\.test\.mjs/,
    'concurrent default-master-plan regression should include completed task export checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/build-default-master-plan-real-duration-sample-material-template\.test\.mjs/,
    'concurrent default-master-plan regression should include real duration sample material template checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/build-default-master-plan-real-duration-sample-material-from-task-export\.test\.mjs/,
    'concurrent default-master-plan regression should include completed task export to real duration sample material checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/check-default-master-plan-real-duration-sample-material-preflight\.test\.mjs/,
    'concurrent default-master-plan regression should include real duration sample material preflight checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/build-default-master-plan-real-duration-sample-source-export\.test\.mjs/,
    'concurrent default-master-plan regression should include operator-supplied real duration sample source export checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/build-default-master-plan-runtime-material-package\.test\.mjs/,
    'concurrent default-master-plan regression should include runtime material handoff source-lineage checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/default-master-plan-evidence-boundary\.test\.mjs/,
    'concurrent default-master-plan regression should include production-readiness evidence boundary checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/discover-default-master-plan-production-candidates\.test\.mjs/,
    'concurrent default-master-plan regression should fail closed before recommending retired or low-information production candidates',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/export-default-master-plan-candidate-baseline\.test\.mjs/,
    'concurrent default-master-plan regression should fail candidate exports that contain retired or low-information sources',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/build-default-master-plan-review-package\.test\.mjs/,
    'concurrent default-master-plan regression should keep blocked candidate exports out of PM review packages',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /wbsTemplateLegacySerialPathRemoval\.test\.ts/,
    'concurrent default-master-plan regression should include the server legacy serial path removal guard',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /wbsTemplatesApply\.test\.ts/,
    'concurrent default-master-plan regression should include from-template direct-failure behavior checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /wizardGenerationSideEffects\.test\.ts/,
    'concurrent default-master-plan regression should include wizard PM candidate acceptance record pre-commit gate checks',
  )
  assert.doesNotMatch(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /wbsTemplateRuntimePublicationService\.test\.ts/,
    'concurrent default-master-plan regression must not invoke a retired WBS runtime publication test',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /durationLearningRuntimePublicationService\.test\.ts/,
    'concurrent default-master-plan regression should include the canonical publication lifecycle contract',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /durationLearningRuntimeConsumptionService\.test\.ts/,
    'concurrent default-master-plan regression should include canonical trusted consumption checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/build-default-master-plan-runtime-publication-evidence\.test\.mjs/,
    'concurrent default-master-plan regression should include canonical publication and trusted consumption evidence checks',
  )
  assert.match(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /project-testing\/tools\/default-master-plan-real-outcome-evidence\.test\.mjs/,
    'concurrent default-master-plan regression should include canonical real-outcome publication and consumption reference checks',
  )
  assert.doesNotMatch(
    readinessChecker,
    /wbsTemplateRuntimePublicationService(?:\.test)?\.ts/,
    'production readiness must not read retired WBS publication sources',
  )
  assert.match(
    readinessChecker,
    /durationLearningRuntimePublicationService\.ts/,
    'production readiness should inspect the canonical publication lifecycle',
  )
  assert.match(
    readinessChecker,
    /durationLearningRuntimeConsumptionService\.ts/,
    'production readiness should inspect canonical trusted consumption',
  )
  assert.doesNotMatch(
    packageJson.scripts['evidence:default-master-plan:test-concurrent'],
    /npm\.cmd/,
    'concurrent default-master-plan regression should use cross-platform npm invocation',
  )

  const stagingGroup = matrix.gateGroups.find((group) => group.id === 'default-master-plan-staging-runtime-evidence')
  assert.equal(stagingGroup, undefined, 'retired legacy staging writer must not remain an executable gate group')
  assert.equal(packageJson.scripts['evidence:default-master-plan:staging-runtime'], undefined)
  assert.equal(existsSync(join(repoRoot, 'project-testing/tools/run-default-master-plan-staging-runtime-evidence.mjs')), false)
})

test('authoritative v1.4 plans identify the canonical duration-learning runtime after legacy retirement', async () => {
  const planPaths = [
    'docs/plans/v1.4.22.3规则资产公司隔离与自学习体系执行方案.md',
    'docs/plans/v1.4.22.6可学习工期资产live自升级闭环专项方案.md',
    'docs/plans/v1.4.23.1体系收口台账与验收门禁矩阵.md',
    'docs/plans/v1.4.23.1-A体系收口台账与验收门禁矩阵.md',
    'docs/plans/v1.4.24上线验收测试方案.md',
  ]

  for (const relativePath of planPaths) {
    const source = await readFile(join(repoRoot, relativePath), 'utf8')
    assert.match(
      source,
      /工期学习 runtime 当前权威口径（authoritative）/u,
      `${relativePath} should mark the current runtime authority`,
    )
    assert.match(source, /migration 315/u, `${relativePath} should identify the canonical migration`)
    assert.match(
      source,
      /durationLearningRuntimePublicationService\.ts/u,
      `${relativePath} should name the canonical publication service`,
    )
    assert.match(
      source,
      /durationLearningRuntimeConsumptionService\.ts/u,
      `${relativePath} should name the canonical consumption service`,
    )
    assert.match(
      source,
      /archive \/ mapping/u,
      `${relativePath} should limit legacy default-master-plan rows to archive and mapping`,
    )
    assert.match(source, /migration 322/u, `${relativePath} should identify the explicit retirement boundary`)
    assert.match(
      source,
      /仅为历史实施记录/u,
      `${relativePath} should classify retired service and table references as historical`,
    )
    if (relativePath.endsWith('v1.4.24上线验收测试方案.md')) {
      assert.doesNotMatch(
        source,
        /wbsTemplateRuntimePublicationService\.test\.ts/u,
        `${relativePath} should use canonical publication and consumption tests in its active release matrix`,
      )
    }
  }
})

test('testing center check validates matrix and tool inventory without live or DB execution', () => {
  const result = runNode(['project-testing/tools/check-testing-center.mjs'])

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /Testing center check passed/)
  assert.match(result.stdout, /no live or DB commands run/)
})
