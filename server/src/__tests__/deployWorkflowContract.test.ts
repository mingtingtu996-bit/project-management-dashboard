import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

function extractWorkflowEventPaths(workflow: string, eventName: 'push' | 'pull_request') {
  const lines = workflow.split(/\r?\n/)
  const eventStartIndex = lines.findIndex((line) => line === `  ${eventName}:`)
  expect(eventStartIndex).toBeGreaterThanOrEqual(0)

  const pathsStartIndex = lines.findIndex((line, index) => index > eventStartIndex && line === '    paths:')
  expect(pathsStartIndex).toBeGreaterThan(eventStartIndex)

  const eventPathLines: string[] = []
  for (const line of lines.slice(pathsStartIndex + 1)) {
    if (/^  [a-z_]+:/.test(line)) {
      break
    }
    if (line.startsWith('      - ')) {
      eventPathLines.push(line)
    }
  }

  return eventPathLines.map((line) => line.replace(/^      - ['"]?/, '').replace(/['"]?$/, ''))
}

describe('deploy workflow contract', () => {
  it('builds a fail-closed v1.4.23.1 readiness artifact from browser suite results', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'v14231-gate-'))
    const artifactsRoot = join(tempDir, 'browser-artifacts')
    const outputPath = join(tempDir, 'gate.json')
    const generatorPath = resolve(workspaceRoot, 'scripts', 'write-v14231-readiness-gate.mjs')
    const scripts = [
      ['verify:scope-modeling', 'verify:join-project', 'verify:wbs-templates'],
      ['verify:planning-baseline', 'verify:gantt', 'verify:task-summary', 'verify:planning-monthly'],
    ]
    scripts.forEach((suiteScripts, index) => {
      const suiteDir = join(artifactsRoot, `suite-${index + 1}`)
      mkdirSync(suiteDir, { recursive: true })
      writeFileSync(join(suiteDir, 'suite-manifest.json'), JSON.stringify({
        suiteKey: `suite-${index + 1}`,
        runs: suiteScripts.map((script) => ({ script, status: 'passed', exitCode: 0 })),
      }))
    })

    try {
      const result = spawnSync(process.execPath, [
        generatorPath,
        '--artifacts-root', artifactsRoot,
        '--output', outputPath,
        '--release-sha', 'release-123',
        '--target', 'staging',
        '--generated-at', '2026-07-12T00:00:00.000Z',
        '--expected-suite-count', '2',
      ], { encoding: 'utf8' })

      expect(result.status, result.stderr).toBe(0)
      const artifact = JSON.parse(readFileSync(outputPath, 'utf8')) as Record<string, any>
      expect(artifact).toMatchObject({
        schemaVersion: 'workbuddy-v14231-readiness-gate/v1',
        status: 'passed',
        generatedAt: '2026-07-12T00:00:00.000Z',
        releaseDigest: 'git:release-123',
        targetEnvironment: 'staging',
      })
      expect(artifact.artifactDigest).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(artifact.runs).toHaveLength(7)
      expect(artifact.suites).toHaveLength(2)

      const failedManifestPath = join(artifactsRoot, 'suite-2', 'suite-manifest.json')
      const failedManifest = JSON.parse(readFileSync(failedManifestPath, 'utf8')) as Record<string, any>
      failedManifest.runs[0].status = 'failed'
      failedManifest.runs[0].exitCode = 1
      writeFileSync(failedManifestPath, JSON.stringify(failedManifest))
      const failedOutputPath = join(tempDir, 'gate.failed.json')
      const failedResult = spawnSync(process.execPath, [
        generatorPath,
        '--artifacts-root', artifactsRoot,
        '--output', failedOutputPath,
        '--release-sha', 'release-123',
        '--target', 'staging',
        '--generated-at', '2026-07-12T00:00:00.000Z',
        '--expected-suite-count', '2',
      ], { encoding: 'utf8' })
      const failedArtifact = JSON.parse(readFileSync(failedOutputPath, 'utf8')) as Record<string, any>

      expect(failedResult.status).toBe(1)
      expect(failedArtifact.status).toBe('failed')
      expect(failedArtifact.blockers).toContain('browser_verification_not_passed:verify:planning-baseline')
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('keeps release readiness artifacts in CI instead of mounting them into the API runtime', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const compose = readFileSync(resolve(workspaceRoot, 'deploy', 'docker-compose.lighthouse.yml'), 'utf8')
    const deployScript = readFileSync(resolve(workspaceRoot, 'scripts', 'deploy-lighthouse-server.sh'), 'utf8')

    expect(workflow).toContain('write-v14231-readiness-gate.mjs')
    expect(workflow).toContain('name: v14231-readiness-gate')
    expect(workflow).toContain('runtime-evidence/v14231-readiness/gate.json')
    expect(workflow).toContain('DEPLOY_TARGET=\\"$DEPLOY_TARGET\\"')
    expect(compose).not.toContain('V14231_READINESS_GATE_EVIDENCE')
    expect(compose).not.toContain('project-testing/reports')
    expect(deployScript).toContain(': "${DEPLOY_TARGET:?DEPLOY_TARGET is required}"')
    expect(deployScript).toContain('DEPLOY_TARGET="$DEPLOY_TARGET"')
  })

  it('keeps the retired Vercel integration from creating a parallel deployment', () => {
    for (const configPath of [
      resolve(workspaceRoot, 'vercel.json'),
      resolve(workspaceRoot, 'client', 'vercel.json'),
    ]) {
      const config = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>

      expect(config.$schema).toBe('https://openapi.vercel.sh/vercel.json')
      expect(config.ignoreCommand).toContain('process.exit(0)')
      expect(config).not.toHaveProperty('builds')
      expect(config).not.toHaveProperty('routes')
    }

    const workflowGuard = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'workflow-guard.yml'), 'utf8')
    expect(workflowGuard.match(/- 'vercel\.json'/g)).toHaveLength(2)
    expect(workflowGuard.match(/- 'client\/vercel\.json'/g)).toHaveLength(2)
  })

  it('gives the cold-runner workflow contract enough time to finish', () => {
    const workflowGuard = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'workflow-guard.yml'), 'utf8')
    const deployJobStart = workflowGuard.indexOf('  deploy-workflow-contract:')
    const deployJob = workflowGuard.slice(deployJobStart)

    expect(deployJobStart).toBeGreaterThanOrEqual(0)
    expect(deployJob).toContain('timeout-minutes: 30')
    expect(deployJob).toContain('run: npm run verify:workflow-contract')
  })

  it('installs the client toolchain before the combined governance gate in server quality', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const serverQualityStart = workflow.indexOf('  server-quality:')
    const serverQualityEnd = workflow.indexOf('  build-frontend:', serverQualityStart)
    const serverQualityJob = workflow.slice(serverQualityStart, serverQualityEnd)
    const isolatedClientInstall =
      'pnpm --dir client install --frozen-lockfile --ignore-workspace'
    const clientInstallIndex = serverQualityJob.indexOf(isolatedClientInstall)
    const governanceGateIndex = serverQualityJob.indexOf('name: v1.4.22.3 Governance Gate')

    expect(serverQualityStart).toBeGreaterThanOrEqual(0)
    expect(serverQualityEnd).toBeGreaterThan(serverQualityStart)
    expect(serverQualityJob).toContain('corepack prepare pnpm@9 --activate')
    expect(serverQualityJob).toContain(isolatedClientInstall)
    expect(clientInstallIndex).toBeGreaterThanOrEqual(0)
    expect(governanceGateIndex).toBeGreaterThan(clientInstallIndex)
  })

  it('keeps migration governance evidence in deployment preflight and attests runtime from the release migration ledger', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const compose = readFileSync(resolve(workspaceRoot, 'deploy', 'docker-compose.lighthouse.yml'), 'utf8')
    const deployScript = readFileSync(resolve(workspaceRoot, 'scripts', 'deploy-lighthouse-server.sh'), 'utf8')

    expect(workflow).toContain('SUPABASE_ADVISOR_EXPORT_JSON')
    expect(workflow).toContain('Generate current migration governance evidence')
    expect(workflow).toContain('npm run migrate:production-governance:evidence')
    expect(workflow).toContain('--expected-environment "$DEPLOY_TARGET"')
    expect(workflow).toContain('runtime-evidence/production-migration-governance/current-release.json')
    expect(workflow).toContain('name: production-migration-governance-evidence')
    expect(workflow).toContain('Download current migration governance evidence')
    expect(compose).not.toContain('PRODUCTION_MIGRATION_GOVERNANCE_EVIDENCE')
    expect(compose).toContain('EXPECTED_SCHEMA_MIGRATION_FILENAME')
    expect(compose).toContain('EXPECTED_SCHEMA_MIGRATION_CHECKSUM')
    expect(deployScript).toContain('EXPECTED_SCHEMA_MIGRATION_FILENAME')
    expect(deployScript).toContain('EXPECTED_SCHEMA_MIGRATION_CHECKSUM')
    expect(deployScript).toContain('sha256sum')
    expect(workflow).not.toContain('PRODUCTION_MIGRATION_GOVERNANCE_EVIDENCE: ${{ github.event.inputs.production_migration_governance_evidence }}')
  })

  it('keeps database mutation and server deployment behind an explicit manual production confirmation', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const migrationJob = workflow.slice(
      workflow.indexOf('  database-migration:'),
      workflow.indexOf('  workspace-isolation-live:'),
    )
    const isolationJob = workflow.slice(
      workflow.indexOf('  workspace-isolation-live:'),
      workflow.indexOf('  deploy-server:'),
    )
    const deployJob = workflow.slice(workflow.indexOf('  deploy-server:'))

    expect(workflow).toContain('production_confirmation:')
    expect(workflow).toContain('default: preview')
    expect(workflow).toContain('DEPLOY_PRODUCTION')
    expect(workflow).toContain('Confirm production deployment')

    for (const job of [migrationJob, isolationJob, deployJob]) {
      expect(job).toContain("github.event_name == 'workflow_dispatch'")
      expect(job).not.toContain("github.event_name == 'push'")
    }

    expect(migrationJob).toMatch(
      /\n    if: >\r?\n      github\.event_name == 'workflow_dispatch' && github\.event\.inputs\.environment != 'preview'/,
    )
    expect(isolationJob).toMatch(
      /\n    if: >\r?\n      github\.event_name == 'workflow_dispatch' && github\.event\.inputs\.environment != 'preview'/,
    )
    expect(deployJob).toMatch(
      /needs\.workspace-isolation-live\.result == 'success' &&\r?\n      github\.event_name == 'workflow_dispatch' && github\.event\.inputs\.environment != 'preview'/,
    )

    const confirmationIndex = migrationJob.indexOf('Confirm production deployment')
    const applyIndex = migrationJob.indexOf('Apply pending migrations')
    expect(confirmationIndex).toBeGreaterThan(-1)
    expect(applyIndex).toBeGreaterThan(confirmationIndex)
  })

  it('only approves the 311 DROP when that migration is actually pending', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const stepStart = workflow.indexOf('      - name: Preflight pending migration DROP targets')
    const stepEnd = workflow.indexOf('\n      - name:', stepStart + 10)
    const dropStep = workflow.slice(stepStart, stepEnd)

    expect(stepStart).toBeGreaterThan(-1)
    expect(dropStep).toContain('plan_output="$(npm run --silent migrate:plan)"')
    expect(dropStep).toContain('drop_guard_args=()')
    expect(dropStep).toContain('grep -Fqx -- "- $migration"')
    expect(dropStep).toContain(
      'drop_guard_args+=(--approve-existing-drop-targets-for "$migration")',
    )
    expect(dropStep).toContain('npm run guard:pending-migration-drop-targets -- "${drop_guard_args[@]}"')
  })

  it('blocks target database mutation until deployment and runtime secrets pass preflight', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const preflightStart = workflow.indexOf('  deployment-target-preflight:')
    const migrationStart = workflow.indexOf('  database-migration:')

    expect(preflightStart).toBeGreaterThan(-1)
    expect(migrationStart).toBeGreaterThan(preflightStart)

    const preflightJob = workflow.slice(preflightStart, migrationStart)
    expect(preflightJob).toContain("github.event_name == 'workflow_dispatch'")
    expect(preflightJob).toContain("github.event.inputs.environment != 'preview'")
    expect(preflightJob).toContain("secrets[format('{0}_DEPLOY_HOST'")
    expect(preflightJob).toContain("secrets[format('{0}_DEPLOY_USER'")
    expect(preflightJob).toContain("secrets[format('{0}_DEPLOY_PATH'")
    expect(preflightJob).toContain("secrets[format('{0}_DEPLOY_SSH_PRIVATE_KEY'")
    expect(preflightJob).toContain("secrets[format('{0}_DEPLOY_HEALTH_URL'")
    expect(preflightJob).toContain("secrets[format('{0}_SUPABASE_URL'")
    expect(preflightJob).toContain("secrets[format('{0}_SUPABASE_ANON_KEY'")
    expect(preflightJob).toContain("secrets[format('{0}_SUPABASE_MIGRATION_URL'")
    expect(preflightJob).toContain("secrets[format('{0}_RUNTIME_DATABASE_URL'")
    expect(preflightJob).toContain("secrets[format('{0}_SUPABASE_ADVISOR_EXPORT_JSON'")
    expect(preflightJob).toContain('actions/checkout@v6')
    expect(preflightJob).toContain('Verify deployment target database identity')
    expect(preflightJob).toContain('node scripts/check-deployment-target-identity.mjs')
    expect(preflightJob).toContain('Target deployment preflight blocked')
    expect(preflightJob).not.toContain('Public HTTPS health is optional')
    expect(preflightJob).toContain('External HTTPS health URL is required')
    expect(preflightJob).toContain(
      'if [[ "$DEPLOY_HEALTH_URL" != https://* ]]',
    )
    expect(preflightJob).toMatch(
      /DEPLOY_KNOWN_HOSTS \\\r?\n\s+DEPLOY_HEALTH_URL \\/,
    )
    expect(preflightJob).toContain('exit 1')

    const migrationJob = workflow.slice(migrationStart, workflow.indexOf('  workspace-isolation-live:'))
    expect(migrationJob).toContain('needs: [server-quality, deployment-target-preflight]')

    const identityCheckIndex = workflow.indexOf('Verify deployment target database identity')
    const applyIndex = workflow.indexOf('Apply pending migrations')
    expect(identityCheckIndex).toBeGreaterThan(preflightStart)
    expect(identityCheckIndex).toBeLessThan(migrationStart)
    expect(applyIndex).toBeGreaterThan(migrationStart)
  })

  it('fails before applying migrations when current governance inputs are missing', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const preflightIndex = workflow.indexOf('Preflight current migration governance inputs')
    const applyIndex = workflow.indexOf('Apply pending migrations')

    expect(preflightIndex).toBeGreaterThan(-1)
    expect(applyIndex).toBeGreaterThan(preflightIndex)
    expect(workflow.slice(preflightIndex, applyIndex)).toContain('SUPABASE_ADVISOR_EXPORT_JSON')
    expect(workflow.slice(preflightIndex, applyIndex)).toContain('exit 1')
    expect(workflow.slice(preflightIndex, applyIndex)).toContain('--verify-advisor-export-only')
    expect(workflow.slice(preflightIndex, applyIndex)).toContain('--expected-environment "$DEPLOY_TARGET"')
    expect(workflow.slice(preflightIndex, applyIndex)).toContain('--advisor-max-age-hours 24')
  })

  it('scopes privileged database and advisor secrets to the run steps that consume them', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const migrationJob = workflow.slice(
      workflow.indexOf('  database-migration:'),
      workflow.indexOf('  workspace-isolation-live:'),
    )
    const isolationJob = workflow.slice(
      workflow.indexOf('  workspace-isolation-live:'),
      workflow.indexOf('  deploy-server:'),
    )
    const migrationJobEnv = migrationJob.slice(migrationJob.indexOf('    env:'), migrationJob.indexOf('    if: >'))
    const isolationInstallStep = isolationJob.slice(
      isolationJob.indexOf('      - name: Install root dependencies'),
      isolationJob.indexOf('      - name: Run live workspace isolation regression'),
    )

    expect(migrationJobEnv).not.toContain('DATABASE_URL:')
    expect(migrationJobEnv).not.toContain('SUPABASE_ADVISOR_EXPORT_JSON:')
    expect(migrationJob.slice(
      migrationJob.indexOf('      - name: Install server dependencies'),
      migrationJob.indexOf('      - name: Confirm production deployment'),
    )).not.toContain('DATABASE_URL:')
    expect(migrationJob.slice(
      migrationJob.indexOf('      - name: Apply pending migrations'),
      migrationJob.indexOf('      - name: Check migration pending zero after apply'),
    )).toContain('DATABASE_URL: ${{ secrets[')
    expect(isolationJob).not.toMatch(/^    env:\r?\n\s+DATABASE_URL:/m)
    expect(isolationInstallStep).not.toContain('DATABASE_URL:')
    expect(isolationJob.slice(
      isolationJob.indexOf('      - name: Run live workspace isolation regression'),
      isolationJob.indexOf('      - name: Publish live isolation summary'),
    )).toContain('DATABASE_URL: ${{ secrets[')
  })

  it('pins node 22, node24-compatible actions, explicit quality gates, and self-hosted server deployment', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const browserSuiteRunner = readFileSync(
      resolve(workspaceRoot, 'scripts', 'run-browser-suite.mjs'),
      'utf8',
    )

    expect(workflow).toContain('concurrency:')
    expect(workflow).toContain("format('target-{0}', github.event.inputs.environment)")
    expect(workflow).toContain("format('preview-{0}', github.ref)")
    expect(workflow).not.toContain("${{ github.workflow }}-${{ github.ref }}-${{ github.event_name")
    expect(workflow).not.toMatch(/^\s+description:\s+[^'"\n]+:\s+/m)
    expect(workflow).toContain("cancel-in-progress: ${{ github.event_name != 'workflow_dispatch' || github.event.inputs.environment == 'preview' }}")
    expect(workflow).toContain('FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true')
    expect(workflow).toContain('actions/checkout@v6')
    expect(workflow).toContain('actions/setup-node@v6')
    expect(workflow).toContain('actions/upload-artifact@v7')
    expect(workflow).toContain('actions/download-artifact@v7')
    expect(workflow).toContain('actions/cache@v5')
    expect(workflow).toContain("node-version: '22'")
    expect(workflow).not.toContain("node-version: '20'")

    expect(workflow).toContain('Enable pnpm via Corepack')
    expect(workflow).toContain('corepack prepare pnpm@9 --activate')
    expect(workflow).toContain('pnpm --dir client run lint')
    expect(workflow).toContain('pnpm --dir client run test:run')
    expect(workflow).toContain('Browser Checks (${{ matrix.suite.name }})')
    expect(workflow).toContain('fail-fast: false')
    expect(workflow).toContain('verify:browser-suite:shell-and-collab')
    expect(workflow).toContain('verify:browser-suite:project-chains')
    expect(workflow).toContain('verify:browser-suite:planning-and-tooling')
    expect(workflow).toContain('npm run ${{ matrix.suite.script }}')
    expect(workflow).toContain('BROWSER_SUITE_KEY: ${{ matrix.suite.key }}')
    expect(workflow).toContain('npx playwright install --with-deps chromium')
    expect(workflow).toContain('Publish browser suite summary')
    expect(workflow).toContain('write-browser-suite-summary.mjs')
    expect(workflow).toContain('BROWSER_ARTIFACTS_DIR: artifacts/browser-checks')
    expect(workflow).toContain('artifacts/browser-checks/suite-manifest.json')
    expect(workflow).toMatch(/^\s+path: artifacts\/browser-checks\s*$/m)
    expect(workflow).not.toContain('project-testing/')
    expect(browserSuiteRunner).toContain('process.env.BROWSER_ARTIFACTS_DIR?.trim()')
    expect(browserSuiteRunner).toContain('const redirectsArtifacts = outputDir !== scriptOutputDir')
    expect(browserSuiteRunner).toContain('await cleanupRedirectedScriptOutput()')
    expect(workflow).toContain('$GITHUB_STEP_SUMMARY')
    expect(workflow).toContain('browser-checks-summary:')
    expect(workflow).toContain('name: Browser Checks Overview')
    expect(workflow).toContain('pattern: browser-check-*')
    expect(workflow).toContain('merge-multiple: false')
    expect(workflow).toContain('write-browser-overview-summary.mjs')
    expect(workflow).toContain('browser-checks:')
    expect(workflow).toContain('name: Browser Checks (${{ matrix.suite.name }})')
    expect(workflow).toContain('~/.cache/ms-playwright')
    expect(workflow).toContain('if-no-files-found: error')
    expect(workflow).toContain('retention-days: 5')
    expect(workflow).toContain('working-directory: server')
    expect(workflow).toContain('npm ci --workspaces=false')
    expect(workflow).toContain('npm run typecheck')
    expect(workflow).toMatch(/Install server Playwright Chromium[\s\S]+npx playwright install --with-deps chromium[\s\S]+Server tests/)
    expect(workflow).toContain('Check migration connection secret')
    expect(workflow).toContain('SUPABASE_MIGRATION_URL')
    expect(workflow).toContain('allow_skip_migration')
    expect(workflow).toContain('migration_skip_reason')
    expect(workflow).toContain('external_migration_evidence_ref')
    expect(workflow).toContain('production_migration_governance_evidence')
    expect(workflow).toContain("default: ''")
    expect(workflow).toContain('external_pending_zero_confirmed')
    expect(workflow).toContain('external_schema_drift_zero_confirmed')
    expect(workflow).toContain('Database migration blocked')
    expect(workflow).toContain('Break-glass migration skip approved')
    expect(workflow).toContain('Live workspace isolation gate blocked')
    expect(workflow).toContain('Live database isolation must run before promoting a staging or production release.')
    expect(workflow).toContain('deploy-server:')
    expect(workflow).toContain('Deploy To Self-hosted Server')
    expect(workflow).toContain('Check server deployment credentials')
    expect(workflow).toContain('DEPLOY_HOST')
    expect(workflow).toContain('DEPLOY_USER')
    expect(workflow).toContain('DEPLOY_PATH')
    expect(workflow).toContain('DEPLOY_SSH_PRIVATE_KEY')
    expect(workflow).toContain('DEPLOY_KNOWN_HOSTS')
    expect(workflow).toContain('DEPLOY_HEALTH_URL')
    expect(workflow).toContain('Configure SSH')
    expect(workflow).not.toContain('ssh-keyscan')
    expect(workflow).toContain('Deploy to self-hosted server')
    expect(workflow).toContain('scripts/deploy-lighthouse-server.sh')
    expect(workflow).toContain('RELEASE_SHA: ${{ github.sha }}')
    expect(workflow).toContain("github.event.inputs.environment != 'preview'")
    expect(workflow).toContain('can_deploy=true')
    expect(workflow).toContain('exit 1')
    expect(workflow).toContain('steps.deployment-eligibility.outputs.can_deploy == \'true\'')
    expect(workflow).toContain('Verify deployed release through SSH tunnel')
    expect(workflow).toContain('ssh -N -L')
    expect(workflow).toContain('workbuddy-build.json')
    expect(workflow).toContain('releaseSha')
    expect(workflow).toContain('readiness.build?.releaseSha !== process.env.RELEASE_SHA')
    expect(workflow).toContain('readiness.build?.deployTarget !== process.env.DEPLOY_TARGET')
    expect(workflow).toContain('readiness.build?.supabaseProjectRef !== expectedDatabaseProjectRef')
    expect(workflow).toContain('readiness.build?.databaseProjectRef !== expectedDatabaseProjectRef')
    expect(workflow).toContain('Run authenticated staging wizard and baseline smoke through SSH tunnel')
    expect(workflow).toContain('scripts/run-wizard-baseline-revision-staging.mjs')
    expect(workflow).toContain('--deployed-staging-code')
    expect(workflow).toContain('--release-sha "$RELEASE_SHA"')
    expect(workflow).toContain('STAGING_TEST_USER_EMAIL')
    expect(workflow).toContain('STAGING_TEST_USER_PASSWORD')
    expect(workflow).toContain("env.DEPLOY_TARGET == 'staging'")
    expect(workflow).toContain('steps.staging-smoke.outcome')
    expect(workflow).toContain('staging-wizard-baseline-revision-${{ github.run_id }}')
    expect(workflow).not.toContain('Public HTTPS health is optional')
    expect(workflow).toContain(
      'Public HTTPS health, HSTS, HTTP-to-HTTPS redirect, remote internal readiness, and performance checks are mandatory.',
    )
    expect(workflow).not.toContain("needs.database-migration.result == 'skipped'")

    const deployJob = workflow.slice(workflow.indexOf('  deploy-server:'))
    const deployJobEnv = deployJob.slice(deployJob.indexOf('    env:'), deployJob.indexOf('    if: >'))
    const stagingSmokeStep = deployJob.slice(
      deployJob.indexOf('      - name: Run authenticated staging wizard and baseline smoke through SSH tunnel'),
      deployJob.indexOf('      - name: Upload authenticated staging wizard smoke'),
    )
    expect(deployJobEnv).not.toContain('STAGING_TEST_USER_PASSWORD')
    expect(deployJobEnv).not.toContain('STAGING_TEST_USER_EMAIL')
    expect(deployJobEnv).not.toMatch(/\n      DEPLOY_(?:HOST|USER|PORT|PATH|SSH_PRIVATE_KEY|KNOWN_HOSTS|HEALTH_URL):/)
    expect(deployJobEnv).not.toContain('\n      SLACK_WEBHOOK:')
    expect(stagingSmokeStep).toContain('STAGING_SMOKE_TEST_USER_PASSWORD: ${{ secrets.STAGING_TEST_USER_PASSWORD }}')
    expect(stagingSmokeStep).toContain('STAGING_SMOKE_TEST_USER_EMAIL: ${{ secrets.STAGING_TEST_USER_EMAIL }}')
    expect(stagingSmokeStep).toContain('STAGING_SMOKE_SUPABASE_URL: ${{ secrets.STAGING_SUPABASE_URL }}')
    expect(stagingSmokeStep).toContain('DEPLOY_HOST: ${{ secrets.STAGING_DEPLOY_HOST }}')
    expect(stagingSmokeStep).toContain('--cleanup-report "$smoke_report"')
    expect(stagingSmokeStep).toContain('smoke_completed=false')

    const deployScript = readFileSync(resolve(workspaceRoot, 'scripts', 'deploy-lighthouse-server.sh'), 'utf8')
    const compose = readFileSync(resolve(workspaceRoot, 'deploy', 'docker-compose.lighthouse.yml'), 'utf8')

    expect(deployScript).toContain('ALLOW_DIRTY_DEPLOY')
    expect(deployScript).toContain('git status --porcelain --untracked-files=no')
    expect(deployScript).toContain('Refusing to overwrite')
    expect(deployScript).toContain('sudo -n docker info')
    expect(deployScript).toContain('sudo -n env')
    expect(deployScript).toContain('run_docker_compose')
    expect(deployScript).toContain('read_env_value SUPABASE_URL')
    expect(deployScript).toContain('read_env_value SUPABASE_ANON_KEY')
    expect(deployScript).toContain('export VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY')
    expect(deployScript).toContain('INTERNAL_HEALTH_URL="http://127.0.0.1:${WEB_PORT_VALUE}/api/readyz"')
    expect(deployScript).toContain(': "${HEALTH_URL:?External HTTPS HEALTH_URL is required}"')
    expect(deployScript).not.toContain('HEALTH_URL="${HEALTH_URL:-$INTERNAL_HEALTH_URL}"')
    expect(deployScript).toContain('curl --fail --silent --show-error "$INTERNAL_HEALTH_URL"')
    expect(deployScript).toContain('/api/performance-reports/summary')
    expect(deployScript).toContain('External deployment health URL must use https://')
    expect(compose).toContain('container_name: ${COMPOSE_PROJECT_NAME:-project-management}-api')
    expect(compose).toContain('container_name: ${COMPOSE_PROJECT_NAME:-project-management}-worker')
    expect(compose).toContain('container_name: ${COMPOSE_PROJECT_NAME:-project-management}-web')

    expect(workflow).not.toContain('passWithNoTests')
    expect(workflow).toContain('npm run migrate:pending')
    expect(workflow).toContain('npm run migrate:check')
    expect(workflow).toContain('npm run migrate:diagnose')
    expect(workflow).toContain('npm run migrate:drift')
    expect(workflow).toContain('Check v1.4.23.1 production migration governance evidence')
    expect(workflow).toContain(
      "if: steps.migration-config.outputs.can_run == 'true' || steps.migration-config.outputs.break_glass == 'true'",
    )
    expect(workflow).toContain('npm run migrate:production-governance -- --evidence-file')
    expect(workflow).toContain('Generate current migration governance evidence')
    expect(workflow).toContain('SUPABASE_ADVISOR_EXPORT_JSON')
    expect(workflow).toContain('RUNTIME_DATABASE_URL')
    expect(workflow).toContain('BREAK_GLASS_GOVERNANCE_EVIDENCE')
    expect(workflow).toContain('runtime-evidence/production-migration-governance/current-release.json')
    expect(workflow).toContain('Production migration governance blocked')
    expect(workflow).toContain('Missing production_migration_governance_evidence input for break-glass.')
    expect(workflow).not.toContain('artifacts/reports/production-migration-governance-current-live.json')
    expect(workflow).not.toContain('Deployment will continue without applying migrations in CI')
    expect(workflow).not.toContain('Live workspace isolation gate skipped')
    expect(workflow).not.toContain('npm ci --prefix server')
    expect(workflow).not.toContain('npm run typecheck --prefix server')
    expect(workflow).not.toContain('-f 001_initial_schema.sql')
    expect(workflow).not.toContain('deploy-vercel:')
    expect(workflow).not.toContain('vercel-action@')
    expect(workflow).not.toContain('VERCEL_TOKEN')
    expect(workflow).not.toContain('VERCEL_ORG_ID')
    expect(workflow).not.toContain('VERCEL_PROJECT_ID')
    expect(workflow).not.toContain('deploy-cloudbase:')
    expect(workflow).not.toContain('tcb hosting:deploy dist')
    expect(workflow).not.toContain('deploy-cloudbase-backend.mjs')
    expect(workflow).not.toContain('CLOUDBASE_BACKEND_PORT')
    expect(workflow).not.toContain('functions:deploy api')
    expect(workflow).not.toContain('server/functions/api')
    expect(workflow).not.toContain('name: company-cockpit-browser-check')
    expect(workflow).not.toContain('name: responsibility-browser-check')
    expect(workflow).not.toContain('name: project-pages-browser-check')
  })

  it('isolates staging and production targets and promotes the tested frontend artifact', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const compose = readFileSync(resolve(workspaceRoot, 'deploy', 'docker-compose.lighthouse.yml'), 'utf8')
    const clientDockerfile = readFileSync(resolve(workspaceRoot, 'client', 'Dockerfile'), 'utf8')

    expect(workflow).toContain("secrets[format('{0}_SUPABASE_MIGRATION_URL'")
    expect(workflow).toContain("secrets[format('{0}_DEPLOY_HOST'")
    expect(workflow).toContain("'STAGING' || 'PRODUCTION'")
    expect(workflow).not.toContain('DATABASE_URL: ${{ secrets.SUPABASE_MIGRATION_URL }}')
    expect(workflow).toMatch(/database-migration:[\s\S]+environment:\s*\$\{\{[\s\S]+github\.event\.inputs\.environment/)
    expect(workflow).toMatch(/deploy-server:[\s\S]+environment:\s*\$\{\{[\s\S]+github\.event\.inputs\.environment/)

    const deployJob = workflow.slice(workflow.indexOf('  deploy-server:'))
    expect(deployJob).toContain('Download tested frontend build')
    expect(deployJob).toContain('name: frontend-build')
    expect(deployJob).toContain('path: client/dist')
    expect(deployJob).toContain('cp -a client/dist/. "$RELEASE_DIR/client/dist/"')
    expect(workflow).toContain("client/dist/workbuddy-build.json")
    expect(deployJob).not.toContain('git archive --format=tar.gz --output "$RELEASE_ARCHIVE"')

    const deployScript = readFileSync(resolve(workspaceRoot, 'scripts', 'deploy-lighthouse-server.sh'), 'utf8')
    expect(deployScript).toContain('rm -rf client/dist')
    expect(deployScript).toContain('client/dist/workbuddy-build.json')
    expect(deployScript).toContain('Frontend build provenance does not match release SHA')

    expect(compose).toContain('target: prebuilt-runtime')
    expect(compose).not.toContain('VITE_STORAGE_MODE: backend')
    expect(clientDockerfile).toContain('AS prebuilt-runtime')
    expect(clientDockerfile).toContain('COPY dist /usr/share/nginx/html')
  })

  it('keeps migrate:drift coverage complete for every managed PostgreSQL object class', () => {
    const driftScript = readFileSync(resolve(workspaceRoot, 'server', 'src', 'scripts', 'check-schema-drift.ts'), 'utf8')

    expect(driftScript).toContain('blockingDrift covers managed tables, columns, constraints, indexes, RLS state/policies, triggers, functions, views, enums, declared extensions, and explicit/default grants or revocations.')
    expect(driftScript).toContain('coverageBacklog: []')
    expect(driftScript).not.toContain("'primary_key',")
    expect(driftScript).not.toContain("'foreign_key',")
    expect(driftScript).not.toContain("'unique_constraint',")
    expect(driftScript).not.toContain("'check_constraint',")
    expect(driftScript).not.toContain("'index',")
  })

  it('keeps C-05 BI SSOT aggregation and metric guards wired in package scripts and deploy CI', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const workflowGuard = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'workflow-guard.yml'), 'utf8')
    const serverPackageJson = readFileSync(resolve(workspaceRoot, 'server', 'package.json'), 'utf8')
    const clientPackageJson = readFileSync(resolve(workspaceRoot, 'client', 'package.json'), 'utf8')

    expect(serverPackageJson).toContain('"guard:route-aggregation"')
    expect(serverPackageJson).toContain('"guard:summary-service-aggregation"')
    expect(serverPackageJson).toContain('"guard:metric-ssot"')
    expect(serverPackageJson).toContain('"guard:production-ready-claims"')
    expect(clientPackageJson).toContain('"guard:frontend-bi-aggregation"')

    expect(workflow).toContain('Client frontend BI aggregation guard')
    expect(workflow).toContain('pnpm --dir client run guard:frontend-bi-aggregation')
    expect(workflow).toContain('Server route aggregation guard')
    expect(workflow).toContain('npm run guard:route-aggregation')
    expect(workflow).toContain('Server summary service aggregation guard')
    expect(workflow).toContain('npm run guard:summary-service-aggregation')
    expect(workflow).toContain('Server metric SSOT guard')
    expect(workflow).toContain('npm run guard:metric-ssot')
    expect(workflow).toContain('Server production-ready claims guard')
    expect(workflow).toContain('npm run guard:production-ready-claims')
    expect(workflow).toContain('Server runtime consumer lineage guard')
    expect(workflow).toContain('npm run guard:runtime-consumer-lineage')

    const c05WorkflowGuardPaths = [
      'client/package.json',
      'client/scripts/guard-frontend-bi-aggregation.mjs',
      'client/src/__tests__/frontendBiAggregationGuard.test.ts',
      'server/scripts/guard-route-aggregation.mjs',
      'server/scripts/guard-summary-service-aggregation.mjs',
      'server/scripts/guard-metric-ssot.mjs',
      'server/scripts/guard-production-ready-claims.mjs',
      'server/src/__tests__/routeAggregationGuard.test.ts',
      'server/src/__tests__/summaryServiceAggregationGuard.test.ts',
      'server/src/__tests__/metricSsotGuard.test.ts',
      'server/src/__tests__/productionReadyClaimsGuard.test.ts',
    ]
    const workflowGuardPushPaths = extractWorkflowEventPaths(workflowGuard, 'push')
    const workflowGuardPullRequestPaths = extractWorkflowEventPaths(workflowGuard, 'pull_request')

    for (const requiredPath of c05WorkflowGuardPaths) {
      expect(workflowGuardPushPaths).toContain(requiredPath)
      expect(workflowGuardPullRequestPaths).toContain(requiredPath)
    }
  })

  it('runs release gate manifest integrity checks whenever their manifests change', () => {
    const workflowGuard = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'workflow-guard.yml'), 'utf8')
    const requiredPaths = [
      'client/scripts/run-v14231-client-contract-gate.mjs',
      'client/src/__tests__/v14231ClientContractGateManifest.test.ts',
      'server/scripts/run-workflow-contract-gate.mjs',
      'server/scripts/run-c18-live-evidence-contract-gate.mjs',
      'server/src/__tests__/releaseGateManifestIntegrity.test.ts',
    ]

    for (const eventName of ['push', 'pull_request'] as const) {
      const eventPaths = extractWorkflowEventPaths(workflowGuard, eventName)
      for (const requiredPath of requiredPaths) {
        expect(eventPaths).toContain(requiredPath)
      }
      expect(eventPaths).not.toContain('client/src/lib/__tests__/dataExportSpreadsheetSecurity.test.ts')
    }
  })

  it('keeps v1.4.23.1 readiness, action surface, migration governance, and old-object gates wired into CI and workflow drift checks', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const workflowGuard = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'workflow-guard.yml'), 'utf8')
    const rootPackageJson = JSON.parse(readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const serverPackageJson = JSON.parse(readFileSync(resolve(workspaceRoot, 'server', 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const clientPackageJson = JSON.parse(readFileSync(resolve(workspaceRoot, 'client', 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }

    const closeoutTests = [
      'src/__tests__/v14231CapabilityStatusContract.test.ts',
      'src/__tests__/v14231CapabilityReadinessService.test.ts',
      'src/__tests__/v14231ActionableSurfaceRegistryService.test.ts',
      'src/__tests__/v14231EvidenceArtifactIndexService.test.ts',
      'src/__tests__/durationLegacyTaskDurationCleanup.test.ts',
      'src/__tests__/aiNamingGuard.test.ts',
      'src/__tests__/durationArchitectureBoundaryGuard.test.ts',
      'src/__tests__/legacyObjectDispositionLedgerService.test.ts',
      'src/__tests__/v14231NonLiveCloseoutContract.test.ts',
      'src/__tests__/migrationEntryPoints.test.ts',
      'src/__tests__/runtime-schema-reconciliation.test.ts',
      'src/__tests__/v14231CloakBrowserRouteSmokeScript.test.ts',
      'src/__tests__/migrationSafetyGateService.test.ts',
      'src/__tests__/migrationProductionGovernanceService.test.ts',
      'src/__tests__/productionMigrationGovernanceScript.test.ts',
      'src/__tests__/serverBootstrapIsolation.test.ts',
      'src/__tests__/legacyObjectDropGuardService.test.ts',
      'src/__tests__/legacyObjectDropGuardScript.test.ts',
      'src/__tests__/legacyScopeRuntimeSurfaceGuard.test.ts',
      'src/__tests__/spatialFactBoundaryContract.test.ts',
      'src/__tests__/retiredObjectReferenceAudit.test.ts',
      'src/__tests__/deleteMutationClassificationGuard.test.ts',
      'src/__tests__/wizardE2EVerification.test.ts',
      'src/__tests__/wizardGenerationSideEffects.test.ts',
      'src/__tests__/algorithmSeedRoutes.test.ts',
      'src/__tests__/constructionOrganizationCloseoutWorkbenchOperationSuggestionService.test.ts',
      'src/__tests__/constructionOrganizationPlanNetworkDomainWriter.test.ts',
      'src/__tests__/generateT2RhythmReleaseClosure.test.ts',
      'src/__tests__/verifyT2RhythmReleaseClosureArtifact.test.ts',
      'src/__tests__/preflightT2RhythmReleaseReview.test.ts',
      'src/__tests__/runT2RhythmReleaseReviewPackage.test.ts',
      'src/__tests__/durationRuntimeOrphanRetirement.test.ts',
      'src/__tests__/systemSurfaceOwnershipGuard.test.ts',
      'src/__tests__/algorithmRuleAssetRelationshipMatrix.test.ts',
      'src/__tests__/algorithmRuleAssetInventoryService.test.ts',
      'src/__tests__/algorithmCatalogService.test.ts',
      'src/__tests__/v14AssetAdmissionAutomationService.test.ts',
      'src/__tests__/platformFoundationCapabilityRegistry.test.ts',
      'src/__tests__/runtimeConsumerLineageGuard.test.ts',
      'src/__tests__/durationRuntimeConsumerObservationService.test.ts',
      'src/__tests__/durationRuntimeConsumerObservationIntegrationService.test.ts',
      'src/__tests__/durationRuntimeConsumerObservationAdapterService.test.ts',
      'src/__tests__/durationRuntimeConsumerObservationRuntimeCallAuditService.test.ts',
      'src/__tests__/taskDurationForecastService.test.ts',
      'src/__tests__/projectRemainingDurationForecastService.test.ts',
      'src/__tests__/scheduleAccelerationRuntimeService.test.ts',
      'src/__tests__/t2RhythmLiveReplayDiagnostic.test.ts',
      'src/__tests__/diagnoseConstructionOrganizationCloseoutLive.test.ts',
      'src/__tests__/progressDeviation.test.ts',
      'src/__tests__/runtimeExecutionInferenceService.test.ts',
      'src/__tests__/responsibilityInsightService.watchStatus.test.ts',
      'src/__tests__/biStatusUtilities.test.ts',
      'src/__tests__/experienceTierRegistryService.test.ts',
      'src/__tests__/standardWorkDurationSeedReplayCandidateBridgeService.test.ts',
      'src/__tests__/durationContextPolicyStateBucketService.test.ts',
      'src/__tests__/progressVelocityLearningService.test.ts',
      'src/__tests__/durationContextPolicyParameterLearningService.test.ts',
      'src/__tests__/projectProductivityCalibrationService.test.ts',
      'src/__tests__/durationContextPolicyLearningJob.test.ts',
      'src/__tests__/durationLiveLearningProductionClaimAuditJobContract.test.ts',
      'src/__tests__/durationContextPolicyAutoPublishGateService.test.ts',
      'src/__tests__/durationContextPolicyCanaryApprovalService.test.ts',
      'src/__tests__/durationContextPolicyCanaryGateService.test.ts',
      'src/__tests__/businessTypeRegistryGuard.test.ts',
      'src/__tests__/spatialSemanticGuard.test.ts',
      'src/__tests__/projectScenarioTaxonomyService.test.ts',
      'src/__tests__/projectFactsToTemplateScheduleTrust.test.ts',
      'src/__tests__/constructionOrganizationScenarioGovernanceService.test.ts',
      'src/__tests__/t2RhythmTaskWindowAnnotationCandidateEventService.test.ts',
      'src/__tests__/durationContextFactorSynthesisService.test.ts',
      'src/__tests__/durationContextService.test.ts',
      'src/__tests__/durationContextSampleReadModelService.test.ts',
      'src/__tests__/durationSuggestionService.test.ts',
      'src/__tests__/scheduleAccelerationService.test.ts',
      'src/__tests__/durationSuggestionSimulation.test.ts',
      'src/__tests__/contracts/durationConsistency.contract.test.ts',
      'src/__tests__/durationAlgorithmClosureGovernanceService.test.ts',
      'src/__tests__/domainReleaseRuntimeClosureMatrixService.test.ts',
      'src/__tests__/durationAlgorithmAccuracyService.test.ts',
      'src/__tests__/durationAlgorithmAccuracyRoute.test.ts',
      'src/__tests__/projectCriticalPathService.test.ts',
      'src/__tests__/constructionDependencyReplayCalibrationService.test.ts',
      'src/__tests__/constructionOrganizationPlanNetworkRuntimeEvidenceService.test.ts',
      'src/__tests__/wbsTemplateFeedbackGovernance.test.ts',
      'src/__tests__/weatherForecastImpactService.test.ts',
      'src/__tests__/c1915aTemplateAssemblyContract.test.ts',
      'src/__tests__/templateAssemblyCompatibilityCheckService.test.ts',
      'src/__tests__/t2RhythmSchedulePhase1SelectionService.test.ts',
      'src/__tests__/durationInputAssemblerService.test.ts',
      'src/__tests__/durationLearningRuntimeLifecycleService.test.ts',
      'src/__tests__/wbsTemplateCandidateEventService.test.ts',
      'src/__tests__/routeAggregationGuard.test.ts',
      'src/__tests__/summaryServiceAggregationGuard.test.ts',
      'src/__tests__/metricSsotGuard.test.ts',
      'src/__tests__/routeOwnershipGuard.test.ts',
      'src/__tests__/systemRegistryGuard.test.ts',
      'src/__tests__/architectureBoundaryGuard.test.ts',
      'src/__tests__/productionReadyClaimsGuard.test.ts',
      'src/__tests__/publicRlsAuditGuard.test.ts',
      'src/__tests__/executeSqlGuard.test.ts',
    ]
    const c18LiveEvidenceContractTests = [
      'src/__tests__/rlsProaclLiveDiagnostic.test.ts',
      'src/__tests__/executeSqlAnonPocLiveDiagnostic.test.ts',
      'src/__tests__/durationCanaryApprovalLiveDiagnostic.test.ts',
      'src/__tests__/criticalPathConcurrencyLiveDiagnostic.test.ts',
      'src/__tests__/acceptanceStatusConcurrencyLiveDiagnostic.test.ts',
      'src/__tests__/wizardCommitLiveDiagnostic.test.ts',
      'src/__tests__/wbsGenerationPressureHarness.test.ts',
      'src/__tests__/warningNotificationSyncLiveDiagnostic.test.ts',
      'src/__tests__/criticalPathSyntheticPressureHarness.test.ts',
      'src/__tests__/companyHealthTrendLiveDiagnostic.test.ts',
      'src/__tests__/companySummaryPressureHarness.test.ts',
      'src/__tests__/spreadsheetMigrationLiveDiagnostic.test.ts',
    ]
    const expectedC18LiveEvidenceContractCommand = 'node scripts/run-c18-live-evidence-contract-gate.mjs'
    const expectedClientContractCommand = 'node scripts/run-v14231-client-contract-gate.mjs'
    const expectedServerCloseoutCommand = `node scripts/run-vitest-guard.mjs ${closeoutTests.join(' ')}`
    const expectedExtendedSchemaDriftCommand = 'node scripts/run-vitest-guard.mjs src/__tests__/schemaDriftExpectedSchemaParser.test.ts src/__tests__/schemaDriftExtendedObjectService.test.ts src/__tests__/schemaDriftExtendedIntrospectionService.test.ts src/__tests__/schemaDriftExtendedScriptContract.test.ts src/__tests__/extendedSchemaDriftReconciliationMigration.test.ts'
    const expectedServerCombinedCloseoutCommand = 'npm run verify:v14231-closeout && npm run verify:c18-live-evidence-contracts'
    const expectedWorkflowGuardCommand = 'npm run verify:workflow-contract'

    expect(rootPackageJson.scripts?.['verify:v14231-non-live-closeout']).toBe(
      'npm run verify:v14231-non-live-closeout --workspace=server',
    )
    expect(rootPackageJson.scripts?.['verify:v14231-client-contracts']).toBe(
      'npm run verify:v14231-client-contracts --workspace=client',
    )
    expect(rootPackageJson.scripts?.['verify:v14231-closeout']).toBe(
      'npm run verify:v14231-non-live-closeout --workspace=server && npm run verify:v14231-client-contracts',
    )
    expect(rootPackageJson.scripts?.['verify:v14231-closeout-with-c18-live-evidence-contracts']).toBe(
      'npm run verify:v14231-closeout && npm run verify:c18-live-evidence-contracts --workspace=server',
    )
    expect(clientPackageJson.scripts?.['verify:v14231-client-contracts']).toBe(expectedClientContractCommand)
    const clientContractGate = readFileSync(
      resolve(workspaceRoot, 'client', 'scripts', 'run-v14231-client-contract-gate.mjs'),
      'utf8',
    )
    expect(clientContractGate).toContain('startVitest')
    expect(clientContractGate).toContain('configFile: false')
    expect(clientContractGate).toContain('src/__tests__/contracts/durationSurface.contract.test.ts')
    expect(clientContractGate).toContain('src/services/__tests__/v14231ReadinessApi.test.ts')
    expect(clientContractGate).toContain('src/__tests__/frontendBiAggregationGuard.test.ts')
    expect(serverPackageJson.scripts?.['verify:v14231-non-live-closeout']).toBe(expectedServerCloseoutCommand)
    expect(serverPackageJson.scripts?.['verify:schema-drift-extended']).toBe(expectedExtendedSchemaDriftCommand)
    expect(serverPackageJson.scripts?.['verify:v14231-closeout']).toBe('npm run verify:v14231-non-live-closeout')
    expect(serverPackageJson.scripts?.['verify:v14231-closeout-with-c18-live-evidence-contracts']).toBe(expectedServerCombinedCloseoutCommand)
    expect(serverPackageJson.scripts?.['verify:c18-live-evidence-contracts']).toBe(expectedC18LiveEvidenceContractCommand)
    const c18LiveEvidenceContractGate = readFileSync(
      resolve(workspaceRoot, 'server', 'scripts', 'run-c18-live-evidence-contract-gate.mjs'),
      'utf8',
    )
    expect(c18LiveEvidenceContractGate).toContain('startVitest')
    expect(c18LiveEvidenceContractGate).toContain('configFile: false')
    for (const testPath of c18LiveEvidenceContractTests) {
      expect(c18LiveEvidenceContractGate).toContain(testPath)
    }
    expect(serverPackageJson.scripts?.['migrate:production-governance']).toContain('check-production-migration-governance.ts')
    expect(serverPackageJson.scripts?.['guard:legacy-object-drop']).toContain('check-legacy-object-drop-guard.ts')
    expect(serverPackageJson.scripts?.['guard:system-surface-ownership']).toContain('guard-system-surface-ownership.mjs')
    expect(workflow).toContain('v1.4.23.1 Non-live Closeout Gate')
    expect(workflow).toContain('npm run verify:v14231-non-live-closeout')
    expect(workflow).toContain('Extended schema drift contract gate')
    expect(workflow).toContain('npm run verify:schema-drift-extended')
    expect(workflow).toContain('v1.4.23.1 Client Contract Gate')
    expect(workflow).toContain('npm run verify:v14231-client-contracts --workspace=client')
    expect(workflow).toContain('v1.4.23.1 C-18.L Evidence Contract Gate')
    expect(workflow).toContain('npm run verify:c18-live-evidence-contracts')
    expect(workflow).toContain('Check v1.4.23.1 production migration governance evidence')
    expect(workflow).toContain(
      "if: steps.migration-config.outputs.can_run == 'true' || steps.migration-config.outputs.break_glass == 'true'",
    )
    expect(workflow).toContain('npm run migrate:production-governance -- --evidence-file')
    expect(workflow).toContain('SUPABASE_ADVISOR_EXPORT_JSON')
    expect(workflow).toContain('BREAK_GLASS_GOVERNANCE_EVIDENCE')
    expect(workflow).toContain('runtime-evidence/production-migration-governance/current-release.json')
    expect(workflow).toContain('production_migration_governance_evidence')
    expect(workflow).toContain('Production migration governance blocked')
    expect(workflow).not.toContain('artifacts/reports/production-migration-governance-current-live.json')
    expect(workflow).toContain('Server system surface ownership guard')
    expect(workflow).toContain('npm run guard:system-surface-ownership')
    expect(workflow).toContain('Server legacy object drop guard')
    expect(workflow).toContain('npm run guard:legacy-object-drop -- --ci-no-drop-candidates-ok --from-retired-object-audit --scan-migration-drops')
    expect(workflowGuard).toContain('Verify C-18.L evidence artifact contracts')
    expect(workflowGuard).toContain('npm run verify:c18-live-evidence-contracts')
    expect(workflowGuard).toContain('Verify v1.4.23.1 client contracts')
    expect(workflowGuard).toContain('npm run verify:v14231-client-contracts --workspace=client')

    const requiredWorkflowGuardPaths = [
      'server/src/__tests__/v14231CapabilityReadinessService.test.ts',
      'server/src/__tests__/v14231ActionableSurfaceRegistryService.test.ts',
      'server/src/__tests__/v14231EvidenceArtifactIndexService.test.ts',
      'server/src/__tests__/durationLegacyTaskDurationCleanup.test.ts',
      'server/src/__tests__/durationArchitectureBoundaryGuard.test.ts',
      'server/src/__tests__/legacyObjectDispositionLedgerService.test.ts',
      'server/src/__tests__/migrationEntryPoints.test.ts',
      'server/src/__tests__/migrationSafetyGateService.test.ts',
      'server/src/__tests__/schemaDriftExpectedSchemaParser.test.ts',
      'server/src/__tests__/schemaDriftExtendedObjectService.test.ts',
      'server/src/__tests__/schemaDriftExtendedIntrospectionService.test.ts',
      'server/src/__tests__/schemaDriftExtendedScriptContract.test.ts',
      'server/src/__tests__/extendedSchemaDriftReconciliationMigration.test.ts',
      'server/src/__tests__/migrationProductionGovernanceService.test.ts',
      'server/src/__tests__/productionMigrationGovernanceScript.test.ts',
      'server/src/__tests__/serverBootstrapIsolation.test.ts',
      'server/src/__tests__/legacyObjectDropGuardService.test.ts',
      'server/src/__tests__/legacyObjectDropGuardScript.test.ts',
      'server/src/__tests__/legacyScopeRuntimeSurfaceGuard.test.ts',
      'server/src/__tests__/spatialFactBoundaryContract.test.ts',
      'server/src/__tests__/retiredObjectReferenceAudit.test.ts',
      'server/src/__tests__/deleteMutationClassificationGuard.test.ts',
      'server/src/__tests__/wizardE2EVerification.test.ts',
      'server/src/__tests__/wizardGenerationSideEffects.test.ts',
      'server/src/__tests__/algorithmSeedRoutes.test.ts',
      'server/src/__tests__/constructionOrganizationCloseoutWorkbenchOperationSuggestionService.test.ts',
      'server/src/__tests__/constructionOrganizationPlanNetworkDomainWriter.test.ts',
      'server/src/__tests__/routeAggregationGuard.test.ts',
      'server/src/__tests__/summaryServiceAggregationGuard.test.ts',
      'server/src/__tests__/metricSsotGuard.test.ts',
      'server/src/__tests__/routeOwnershipGuard.test.ts',
      'server/src/__tests__/systemRegistryGuard.test.ts',
      'server/src/__tests__/architectureBoundaryGuard.test.ts',
      'server/src/__tests__/productionReadyClaimsGuard.test.ts',
      'server/src/__tests__/publicRlsAuditGuard.test.ts',
      'server/src/__tests__/executeSqlGuard.test.ts',
      'server/src/__tests__/generateT2RhythmReleaseClosure.test.ts',
      'server/src/__tests__/verifyT2RhythmReleaseClosureArtifact.test.ts',
      'server/src/__tests__/preflightT2RhythmReleaseReview.test.ts',
      'server/src/__tests__/runT2RhythmReleaseReviewPackage.test.ts',
      'server/src/__tests__/durationRuntimeOrphanRetirement.test.ts',
      'server/src/__tests__/systemSurfaceOwnershipGuard.test.ts',
      'server/src/__tests__/algorithmRuleAssetRelationshipMatrix.test.ts',
      'server/src/__tests__/algorithmRuleAssetInventoryService.test.ts',
      'server/src/__tests__/algorithmCatalogService.test.ts',
      'server/src/__tests__/v14AssetAdmissionAutomationService.test.ts',
      'server/src/__tests__/platformFoundationCapabilityRegistry.test.ts',
      'server/src/__tests__/durationRuntimeConsumerObservationService.test.ts',
      'server/src/__tests__/durationRuntimeConsumerObservationIntegrationService.test.ts',
      'server/src/__tests__/durationRuntimeConsumerObservationAdapterService.test.ts',
      'server/src/__tests__/durationRuntimeConsumerObservationRuntimeCallAuditService.test.ts',
      'server/src/__tests__/taskDurationForecastService.test.ts',
      'server/src/__tests__/projectRemainingDurationForecastService.test.ts',
      'server/src/__tests__/scheduleAccelerationRuntimeService.test.ts',
      'server/src/__tests__/t2RhythmLiveReplayDiagnostic.test.ts',
      'server/src/__tests__/diagnoseConstructionOrganizationCloseoutLive.test.ts',
      'server/src/__tests__/progressDeviation.test.ts',
      'server/src/__tests__/runtimeExecutionInferenceService.test.ts',
      'server/src/__tests__/responsibilityInsightService.watchStatus.test.ts',
      'server/src/__tests__/biStatusUtilities.test.ts',
      'server/src/__tests__/experienceTierRegistryService.test.ts',
      'server/src/__tests__/standardWorkDurationSeedReplayCandidateBridgeService.test.ts',
      'server/src/__tests__/durationContextPolicyStateBucketService.test.ts',
      'server/src/__tests__/progressVelocityLearningService.test.ts',
      'server/src/__tests__/durationContextPolicyParameterLearningService.test.ts',
      'server/src/__tests__/projectProductivityCalibrationService.test.ts',
      'server/src/__tests__/durationContextPolicyLearningJob.test.ts',
      'server/src/__tests__/durationLiveLearningProductionClaimAuditJobContract.test.ts',
      'server/src/__tests__/durationContextPolicyAutoPublishGateService.test.ts',
      'server/src/__tests__/durationContextPolicyCanaryApprovalService.test.ts',
      'server/src/__tests__/durationContextPolicyCanaryGateService.test.ts',
      'server/src/__tests__/businessTypeRegistryGuard.test.ts',
      'server/src/__tests__/spatialSemanticGuard.test.ts',
      'server/src/__tests__/projectScenarioTaxonomyService.test.ts',
      'server/src/__tests__/projectFactsToTemplateScheduleTrust.test.ts',
      'server/src/__tests__/constructionOrganizationScenarioGovernanceService.test.ts',
      'server/src/__tests__/t2RhythmTaskWindowAnnotationCandidateEventService.test.ts',
      'server/src/__tests__/durationContextFactorSynthesisService.test.ts',
      'server/src/__tests__/durationContextService.test.ts',
      'server/src/__tests__/durationContextSampleReadModelService.test.ts',
      'server/src/__tests__/durationSuggestionService.test.ts',
      'server/src/__tests__/scheduleAccelerationService.test.ts',
      'server/src/__tests__/durationSuggestionSimulation.test.ts',
      'server/src/__tests__/contracts/durationConsistency.contract.test.ts',
      'server/src/__tests__/durationAlgorithmClosureGovernanceService.test.ts',
      'server/src/__tests__/domainReleaseRuntimeClosureMatrixService.test.ts',
      'server/src/__tests__/durationAlgorithmAccuracyService.test.ts',
      'server/src/__tests__/durationAlgorithmAccuracyRoute.test.ts',
      'server/src/__tests__/projectCriticalPathService.test.ts',
      'server/src/__tests__/constructionDependencyReplayCalibrationService.test.ts',
      'server/src/__tests__/constructionOrganizationPlanNetworkRuntimeEvidenceService.test.ts',
      'server/src/__tests__/wbsTemplateFeedbackGovernance.test.ts',
      'server/src/__tests__/weatherForecastImpactService.test.ts',
      'server/src/__tests__/c1915aTemplateAssemblyContract.test.ts',
      'server/src/__tests__/templateAssemblyCompatibilityCheckService.test.ts',
      'server/src/__tests__/t2RhythmSchedulePhase1SelectionService.test.ts',
      'server/src/__tests__/durationInputAssemblerService.test.ts',
      'server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts',
      'server/src/__tests__/wbsTemplateCandidateEventService.test.ts',
      'server/src/__tests__/rlsProaclLiveDiagnostic.test.ts',
      'server/src/__tests__/executeSqlAnonPocLiveDiagnostic.test.ts',
      'server/src/__tests__/durationCanaryApprovalLiveDiagnostic.test.ts',
      'server/src/__tests__/criticalPathConcurrencyLiveDiagnostic.test.ts',
      'server/src/__tests__/acceptanceStatusConcurrencyLiveDiagnostic.test.ts',
      'server/src/__tests__/wizardCommitLiveDiagnostic.test.ts',
      'server/src/__tests__/wbsGenerationPressureHarness.test.ts',
      'server/src/__tests__/warningNotificationSyncLiveDiagnostic.test.ts',
      'server/src/__tests__/criticalPathSyntheticPressureHarness.test.ts',
      'server/src/__tests__/companyHealthTrendLiveDiagnostic.test.ts',
      'server/src/__tests__/companySummaryPressureHarness.test.ts',
      'server/src/__tests__/spreadsheetMigrationLiveDiagnostic.test.ts',
      'server/scripts/guard-route-ownership.mjs',
      'server/scripts/guard-system-registry.mjs',
      'server/scripts/guard-architecture-boundaries.mjs',
      'server/scripts/guard-runtime-consumer-lineage.mjs',
      'server/scripts/run-workflow-contract-gate.mjs',
      'server/scripts/run-vitest-guard.mjs',
      'server/scripts/run-c18-live-evidence-contract-gate.mjs',
      'server/scripts/guard-system-surface-ownership.mjs',
      'server/migrations/*.sql',
      'server/src/scripts/check-legacy-object-drop-guard.ts',
      'server/src/scripts/check-production-migration-governance.ts',
      'server/src/scripts/check-migration-safety.ts',
      'server/src/scripts/check-migration-release-readiness.ts',
      'server/src/scripts/check-schema-drift.ts',
      'server/src/scripts/run-pending-migrations.ts',
      'server/src/scripts/migrationSafetyScriptUtils.ts',
      'server/src/scripts/verify-t2-rhythm-release-closure-artifact.ts',
      'server/src/scripts/preflight-t2-rhythm-release-review.ts',
      'server/src/scripts/run-t2-rhythm-release-review-package.ts',
      'server/src/scripts/generate-t2-rhythm-release-closure.ts',
      'server/src/scripts/diagnose-rls-proacl-live.ts',
      'server/src/scripts/diagnose-execute-sql-anon-poc-live.ts',
      'server/src/scripts/diagnose-duration-canary-approval-live.ts',
      'server/src/scripts/diagnose-critical-path-concurrency-live.ts',
      'server/src/scripts/diagnose-acceptance-status-concurrency-live.ts',
      'server/src/scripts/diagnose-wizard-commit-live.ts',
      'server/src/scripts/profile-wbs-generation.ts',
      'server/src/scripts/diagnose-warning-notification-sync-live.ts',
      'server/src/scripts/profile-critical-path-network.ts',
      'server/src/scripts/diagnose-company-health-trend-live.ts',
      'server/src/scripts/profile-company-summary.ts',
      'server/src/scripts/diagnose-spreadsheet-migration-live.ts',
      'client/src/__tests__/contracts/durationSurface.contract.test.ts',
      'client/scripts/run-v14231-client-contract-gate.mjs',
      'client/src/services/v14231ReadinessApi.ts',
      'client/src/services/__tests__/v14231ReadinessApi.test.ts',
      'server/src/services/v14231CapabilityReadinessService.ts',
      'server/src/services/v14231ActionableSurfaceRegistryService.ts',
      'server/src/services/v14231EvidenceArtifactIndexService.ts',
      'server/src/routes/v14231-readiness.ts',
      'server/src/routes/algorithm-seeds.ts',
      'server/src/services/legacyObjectDropGuardService.ts',
      'server/src/services/legacyObjectDispositionLedgerService.ts',
      'server/src/services/migrationSafetyGateService.ts',
      'server/src/services/schemaDriftExpectedSchemaParser.ts',
      'server/src/services/schemaDriftExtendedObjectService.ts',
      'server/src/services/schemaDriftExtendedIntrospectionService.ts',
      'server/src/services/migrationProductionGovernanceService.ts',
      'server/src/services/constructionOrganizationCloseoutWorkbenchOperationSuggestionService.ts',
      'server/src/services/constructionOrganizationPlanNetworkDomainWriter.ts',
      'server/src/services/durationColdStartTemplateRegistryService.ts',
      'server/src/services/durationInputAssemblerService.ts',
      'server/src/services/durationLearningRuntimeLifecycleService.ts',
      'server/src/services/domainReleaseRuntimeClosureMatrixService.ts',
      'server/src/services/t2RhythmReleaseClosureDiagnosticService.ts',
      'server/src/services/t2RhythmScheduleCandidateNetworkService.ts',
      'server/src/services/t2RhythmSchedulePhase1SelectionService.ts',
      'server/src/services/durationLearningRuntimePublicationService.ts',
      'server/src/services/t2RhythmStandardLibraryL5ReleaseGateService.ts',
      'server/src/services/t2RhythmStandardLibraryTrustGateService.ts',
      'server/src/services/templateAssemblyCompatibilityCheckService.ts',
      'server/src/services/platformFoundationCapabilityRegistryService.ts',
      'docs/reports/v14231_current_live_migration_governance_20260628.md',
      'docs/reports/v14231_current_live_migration_governance_20260628.evidence.json',
      'package-lock.json',
      'client/pnpm-lock.yaml',
    ]
    const workflowGuardPushPaths = extractWorkflowEventPaths(workflowGuard, 'push')
    const workflowGuardPullRequestPaths = extractWorkflowEventPaths(workflowGuard, 'pull_request')

    for (const requiredPath of requiredWorkflowGuardPaths) {
      expect(workflowGuardPushPaths).toContain(requiredPath)
      expect(workflowGuardPullRequestPaths).toContain(requiredPath)
    }
    expect(workflowGuard).toContain(expectedWorkflowGuardCommand)
  })

  it('keeps T2 release-review package scripts as manual review gates rather than automatic writers', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const workflowGuard = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'workflow-guard.yml'), 'utf8')
    const serverPackageJson = JSON.parse(readFileSync(resolve(workspaceRoot, 'server', 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const verifyScript = readFileSync(
      resolve(workspaceRoot, 'server', 'src', 'scripts', 'verify-t2-rhythm-release-closure-artifact.ts'),
      'utf8',
    )
    const preflightScript = readFileSync(
      resolve(workspaceRoot, 'server', 'src', 'scripts', 'preflight-t2-rhythm-release-review.ts'),
      'utf8',
    )
    const packageScript = readFileSync(
      resolve(workspaceRoot, 'server', 'src', 'scripts', 'run-t2-rhythm-release-review-package.ts'),
      'utf8',
    )

    expect(serverPackageJson.scripts?.['verify:t2-rhythm-release-closure']).toBe(
      'tsx -r dotenv/config src/scripts/verify-t2-rhythm-release-closure-artifact.ts',
    )
    expect(serverPackageJson.scripts?.['preflight:t2-rhythm-release-review']).toBe(
      'tsx -r dotenv/config src/scripts/preflight-t2-rhythm-release-review.ts',
    )
    expect(serverPackageJson.scripts?.['package:t2-rhythm-release-review']).toBe(
      'tsx -r dotenv/config src/scripts/run-t2-rhythm-release-review-package.ts',
    )

    expect(verifyScript).toContain('manualApprovalStillRequired')
    expect(verifyScript).toContain('release_closure_manual_approval_boundary_missing')
    expect(preflightScript).toContain('canAutoPublishRuntimeExperience: false')
    expect(preflightScript).toContain('canMaterializeTaskDependencies: false')
    expect(preflightScript).toContain('confirm_domain_writer_runtime_publication_remains_disabled')
    expect(packageScript).toContain('canAutoPublishRuntimeExperience: false')
    expect(packageScript).toContain('canMaterializeTaskDependencies: false')
    expect(packageScript).toContain('runtimeWritersClosed')

    expect(workflow).not.toContain('npm run package:t2-rhythm-release-review')
    expect(workflow).not.toContain('npm run preflight:t2-rhythm-release-review')
    expect(workflow).not.toContain('npm run verify:t2-rhythm-release-closure')

    const t2ReleaseReviewPaths = [
      'server/src/__tests__/generateT2RhythmReleaseClosure.test.ts',
      'server/src/__tests__/verifyT2RhythmReleaseClosureArtifact.test.ts',
      'server/src/__tests__/preflightT2RhythmReleaseReview.test.ts',
      'server/src/__tests__/runT2RhythmReleaseReviewPackage.test.ts',
      'server/src/scripts/verify-t2-rhythm-release-closure-artifact.ts',
      'server/src/scripts/preflight-t2-rhythm-release-review.ts',
      'server/src/scripts/run-t2-rhythm-release-review-package.ts',
      'server/src/scripts/generate-t2-rhythm-release-closure.ts',
      'server/package.json',
    ]
    const workflowGuardPushPaths = extractWorkflowEventPaths(workflowGuard, 'push')
    const workflowGuardPullRequestPaths = extractWorkflowEventPaths(workflowGuard, 'pull_request')

    for (const requiredPath of t2ReleaseReviewPaths) {
      expect(workflowGuardPushPaths).toContain(requiredPath)
      expect(workflowGuardPullRequestPaths).toContain(requiredPath)
    }
    expect(workflowGuard).toContain('src/__tests__/generateT2RhythmReleaseClosure.test.ts')
    expect(workflowGuard).toContain('src/__tests__/verifyT2RhythmReleaseClosureArtifact.test.ts')
    expect(workflowGuard).toContain('src/__tests__/preflightT2RhythmReleaseReview.test.ts')
    expect(workflowGuard).toContain('src/__tests__/runT2RhythmReleaseReviewPackage.test.ts')
  })

  it('keeps break-glass schema drift wording scoped to complete blocking drift only', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const driftScript = readFileSync(resolve(workspaceRoot, 'server', 'src', 'scripts', 'check-schema-drift.ts'), 'utf8')

    expect(driftScript).toContain('coverageBacklog: []')
    expect(driftScript).toContain('triggers, functions, views, enums, declared extensions, and explicit/default grants or revocations')
    expect(driftScript).not.toContain('Backlog objects are not included in drift=0 claims')
    expect(workflow).toContain('Confirm external evidence shows blocking schema drift is zero')
    expect(workflow).toContain('External blocking schema drift confirmed zero')
    expect(workflow).toContain('confirming blocking schema drift is zero')
    expect(workflow).not.toContain('Confirm external evidence shows schema drift is zero')
    expect(workflow).not.toContain('External schema drift confirmed zero')
  })

  it('keeps schema drift introspection sequential on one pg client to avoid runtime query-overlap warnings', () => {
    const driftScript = readFileSync(resolve(workspaceRoot, 'server', 'src', 'scripts', 'check-schema-drift.ts'), 'utf8')

    expect(driftScript).not.toContain('Promise.all([')
  })

  it('uses PostgreSQL catalog formatted column types so arrays and user-defined types do not collapse in drift checks', () => {
    const driftScript = readFileSync(resolve(workspaceRoot, 'server', 'src', 'scripts', 'check-schema-drift.ts'), 'utf8')

    expect(driftScript).toContain('format_type(a.atttypid, a.atttypmod) AS data_type')
    expect(driftScript).toContain('JOIN pg_attribute a')
  })

  it('keeps migration safety ledger and baseline probes sequential on one pg client', () => {
    const checkScript = readFileSync(resolve(workspaceRoot, 'server', 'src', 'scripts', 'check-migration-safety.ts'), 'utf8')

    expect(checkScript).not.toContain('const [ledgerAvailable, existingBaselineTables] = await Promise.all')
    expect(checkScript).toContain('adopted-baseline-ledger-rows.json')
    expect(checkScript).toContain('adoptedBaselineLedgerRows')
  })

  it('does not provide a CLI or workflow checksum mismatch bypass in migration safety gates', () => {
    const checkScript = readFileSync(resolve(workspaceRoot, 'server', 'src', 'scripts', 'check-migration-safety.ts'), 'utf8')
    const pendingScript = readFileSync(resolve(workspaceRoot, 'server', 'src', 'scripts', 'run-pending-migrations.ts'), 'utf8')
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const reconciliationRegistry = readFileSync(resolve(workspaceRoot, 'server', 'migrations', 'checksum-reconciliations.json'), 'utf8')

    expect(checkScript).not.toMatch(/allow[-_]?checksum|ignore[-_]?checksum|accept[-_]?checksum/i)
    expect(pendingScript).not.toMatch(/allow[-_]?checksum|ignore[-_]?checksum|accept[-_]?checksum/i)
    expect(workflow).not.toMatch(/allow[-_]?checksum|ignore[-_]?checksum|accept[-_]?checksum/i)
    expect(reconciliationRegistry).toContain('currentFileChecksum')
    expect(reconciliationRegistry).toContain('appliedLedgerChecksum')
    expect(reconciliationRegistry).toContain('evidence')
  })

  it('forces migrate:pending through the same structural safety gate before applying SQL', () => {
    const pendingScript = readFileSync(resolve(workspaceRoot, 'server', 'src', 'scripts', 'run-pending-migrations.ts'), 'utf8')

    expect(pendingScript).toContain('evaluateMigrationCheck')
    expect(pendingScript).toContain('shouldFailMigrationCheckGate')
    expect(pendingScript).toContain('readAdoptedBaselineLedgerRows')
    expect(pendingScript).toMatch(/allowPendingMigrations:\s*true/)
    expect(pendingScript).toMatch(/throw new Error\([^)]*migration safety gate/i)
  })

  it('exposes a read-only migration release readiness diagnostic', () => {
    const packageJson = readFileSync(resolve(workspaceRoot, 'server', 'package.json'), 'utf8')
    const diagnoseScript = readFileSync(resolve(workspaceRoot, 'server', 'src', 'scripts', 'check-migration-release-readiness.ts'), 'utf8')

    expect(packageJson).toContain('"migrate:diagnose"')
    expect(diagnoseScript).toContain('buildMigrationReleaseReadiness')
    expect(diagnoseScript).toContain("gate: 'migrate:diagnose'")
    expect(diagnoseScript).toContain('safeToApplyPending')
    expect(diagnoseScript).toContain('safeToEvaluateDrift')
    expect(diagnoseScript).not.toContain('applyMigration')
  })

  it('keeps an independent workflow guard for deploy workflow drift', () => {
    const workflowGuard = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'workflow-guard.yml'), 'utf8')

    expect(workflowGuard).toContain('name: Workflow Guard')
    expect(workflowGuard).toContain('pull_request:')
    expect(workflowGuard).toContain('.github/workflows/deploy.yml')
    expect(workflowGuard).toContain('FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true')
    expect(workflowGuard).toContain('actions/checkout@v6')
    expect(workflowGuard).toContain('actions/setup-node@v6')
    expect(workflowGuard).toContain("node-version: '22'")
    expect(workflowGuard).not.toContain("node-version: '20'")
    expect(workflowGuard).toContain('Enable pnpm via Corepack')
    expect(workflowGuard).toContain('corepack prepare pnpm@9 --activate')
    expect(workflowGuard).toContain('Install client dependencies for readiness contract')
    expect(workflowGuard).toContain('pnpm --dir client install --frozen-lockfile')
    expect(workflowGuard).toContain('scripts/deploy-lighthouse-server.sh')
    expect(workflowGuard).toContain('scripts/write-v14231-readiness-gate.mjs')
    expect(workflowGuard).toContain('deploy/docker-compose.lighthouse.yml')
    expect(workflowGuard).toContain('package-lock.json')
    expect(workflowGuard).toContain('client/pnpm-lock.yaml')
    expect(workflowGuard).toContain('server/package.json')
    expect(workflowGuard).toContain('server/scripts/guard-duration-architecture-boundaries.mjs')
    expect(workflowGuard).toContain('server/scripts/guard-production-ready-claims.mjs')
    expect(workflowGuard).toContain('server/scripts/check-business-type-registry-gate.mjs')
    expect(workflowGuard).toContain('server/scripts/check-spatial-semantic-gate.mjs')
    expect(workflowGuard).toContain('server/scripts/guard-legacy-scope-runtime-surface.mjs')
    expect(workflowGuard).toContain('server/scripts/guard-ai-naming.mjs')
    expect(workflowGuard).toContain('server/scripts/audit-retired-object-references.mjs')
    expect(workflowGuard).toContain('server/scripts/audit-delete-mutation-classification.mjs')
    expect(workflowGuard).toContain('server/src/__tests__/aiNamingGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/productionReadyClaimsGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/retiredObjectReferenceAudit.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/deleteMutationClassificationGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/businessTypeRegistryGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/spatialSemanticGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/durationArchitectureBoundaryGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/legacyScopeRuntimeSurfaceGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/v14231CapabilityStatusContract.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/v14231CapabilityReadinessService.test.ts')
    expect(workflowGuard).toContain('server/src/services/v14231ReadinessGateRuntimeService.ts')
    expect(workflowGuard).toContain('server/src/__tests__/v14231ActionableSurfaceRegistryService.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/v14231EvidenceArtifactIndexService.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/legacyObjectDispositionLedgerService.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/v14231NonLiveCloseoutContract.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/migrationProductionGovernanceService.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/productionMigrationGovernanceScript.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/serverBootstrapIsolation.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/legacyObjectDropGuardService.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/legacyObjectDropGuardScript.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/routeAggregationGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/summaryServiceAggregationGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/metricSsotGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/routeOwnershipGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/systemRegistryGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/architectureBoundaryGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/durationRuntimeOrphanRetirement.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/systemSurfaceOwnershipGuard.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/durationRuntimeConsumerObservationService.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/durationInputAssemblerService.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/durationLearningRuntimePublicationService.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/wbsTemplateCandidateEventService.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/rlsProaclLiveDiagnostic.test.ts')
    expect(workflowGuard).toContain('server/src/__tests__/spreadsheetMigrationLiveDiagnostic.test.ts')
    expect(workflowGuard).toContain('server/scripts/guard-route-ownership.mjs')
    expect(workflowGuard).toContain('server/scripts/guard-system-registry.mjs')
    expect(workflowGuard).toContain('server/scripts/guard-architecture-boundaries.mjs')
    expect(workflowGuard).toContain('server/scripts/guard-runtime-consumer-lineage.mjs')
    expect(workflowGuard).toContain('server/scripts/run-vitest-guard.mjs')
    expect(workflowGuard).toContain('server/src/services/durationColdStartTemplateRegistryService.ts')
    expect(workflowGuard).toContain('server/src/services/durationInputAssemblerService.ts')
    expect(workflowGuard).toContain('server/src/services/durationLearningRuntimeLifecycleService.ts')
    expect(workflowGuard).toContain('server/src/services/t2RhythmReleaseClosureDiagnosticService.ts')
    expect(workflowGuard).toContain('server/src/services/t2RhythmScheduleCandidateNetworkService.ts')
    expect(workflowGuard).toContain('server/src/services/t2RhythmSchedulePhase1SelectionService.ts')
    expect(workflowGuard).toContain('server/src/services/durationLearningRuntimePublicationService.ts')
    expect(workflowGuard).toContain('server/src/services/t2RhythmStandardLibraryL5ReleaseGateService.ts')
    expect(workflowGuard).toContain('server/src/services/t2RhythmStandardLibraryTrustGateService.ts')
    expect(workflowGuard).toContain('server/src/services/templateAssemblyCompatibilityCheckService.ts')
    expect(workflowGuard).toContain('server/src/scripts/diagnose-rls-proacl-live.ts')
    expect(workflowGuard).toContain('server/src/scripts/diagnose-spreadsheet-migration-live.ts')
    expect(workflowGuard).toContain('server/scripts/guard-system-surface-ownership.mjs')
    expect(workflowGuard).toContain('server/migrations/*.sql')
    expect(workflowGuard).toContain('npm ci --workspaces=false')
    const serverPackage = JSON.parse(readFileSync(resolve(workspaceRoot, 'server', 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    expect(serverPackage.scripts?.['verify:workflow-contract']).toBe('node scripts/run-workflow-contract-gate.mjs')
    const expectedWorkflowGuardCommand = 'npm run verify:workflow-contract'
    expect(workflowGuard).toContain(expectedWorkflowGuardCommand)
    expect(workflowGuard).toContain('npm run verify:c18-live-evidence-contracts')
    expect(workflowGuard).toContain('Verify v1.4.23.1 client contracts')
    expect(workflowGuard).toContain('npm run verify:v14231-client-contracts --workspace=client')
  })

  it('runs an independent legacy scope runtime surface guard before server tests', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const serverPackageJson = readFileSync(resolve(workspaceRoot, 'server', 'package.json'), 'utf8')

    expect(serverPackageJson).toContain('"guard:legacy-scope-runtime-surface": "node scripts/guard-legacy-scope-runtime-surface.mjs"')
    expect(serverPackageJson).toContain('"audit:retired-object-references": "node scripts/audit-retired-object-references.mjs"')
    expect(serverPackageJson).toContain('"audit:delete-mutation-classification": "node scripts/audit-delete-mutation-classification.mjs"')
    expect(workflow).toContain('Server legacy scope runtime surface guard')
    expect(workflow).toContain('npm run guard:legacy-scope-runtime-surface')
    expect(workflow).toContain('Server retired object reference audit')
    expect(workflow).toContain('npm run audit:retired-object-references')
    expect(workflow).toContain('Server delete mutation classification audit')
    expect(workflow).toContain('npm run audit:delete-mutation-classification')
    expect(workflow).toContain('npm run guard:legacy-object-drop -- --ci-no-drop-candidates-ok --from-retired-object-audit --scan-migration-drops')
    expect(workflow).toContain('--migration-drop-baseline-version 310')
  })

  it('invokes only client package scripts shipped in the release tree', () => {
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const clientPackage = JSON.parse(readFileSync(resolve(workspaceRoot, 'client', 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const referencedScripts = Array.from(
      workflow.matchAll(/pnpm --dir client run ([a-zA-Z0-9:_-]+)/g),
      (match) => match[1],
    )

    expect(referencedScripts.length).toBeGreaterThan(0)
    for (const script of referencedScripts) {
      expect(clientPackage.scripts?.[script], `missing client script: ${script}`).toBeTypeOf('string')
    }
  })
})

describe('mainline production workflow integration', () => {
  it('keeps production server maintenance gated and preserves untracked files', () => {
    const workflow = readFileSync(
      resolve(workspaceRoot, '.github', 'workflows', 'production-server-worktree-maintenance.yml'),
      'utf8',
    )
    const guard = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'workflow-guard.yml'), 'utf8')

    expect(workflow).toContain('name: Production Server Worktree Maintenance')
    expect(workflow).toContain('BACKUP_AND_CLEAN_TRACKED_CHANGES')
    expect(workflow).toContain('git status --porcelain=v1 --untracked-files=no')
    expect(workflow).toContain('untrackedFilesPreserved: true')
    expect(workflow).toContain('diagnosticsOnly: true')
    expect(workflow).toContain('rawReportStoredOnProductionServer: true')
    expect(workflow).toContain('secrets.PRODUCTION_DEPLOY_HOST')
    expect(workflow).not.toContain('secrets.DEPLOY_HOST')
    expect(guard).toContain('.github/workflows/production-server-worktree-maintenance.yml')
  })

  it('keeps production closeout discovery server-side without copying production env files', () => {
    const workflow = readFileSync(
      resolve(workspaceRoot, '.github', 'workflows', 'production-closeout-readiness.yml'),
      'utf8',
    )
    const guard = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'workflow-guard.yml'), 'utf8')

    expect(workflow).toContain('Collect server-side discovery signals')
    expect(workflow).not.toContain('Fetch production env from self-hosted server')
    expect(workflow).toContain('--env-source process')
    expect(workflow).toContain('--discovery-source server-side-ssh-discovery')
    expect(workflow).toContain('--production-env-ref deploy/env/server.production.env')
    expect(workflow).toContain('--server-signals-file "$OUTPUT_ROOT/server-handoff-signals.json"')
    expect(workflow).toContain('production-gate-selection.input.json')
    expect(workflow).toContain('args+=(--gate "$gate_id")')
    expect(workflow).toContain('secrets.PRODUCTION_DEPLOY_HOST')
    expect(workflow).not.toContain('secrets.DEPLOY_HOST')
    expect(guard).toContain('project-testing/tools/collect-release-handoff-signals.test.mjs')
    expect(guard).toContain('project-testing/tools/prepare-production-closeout-readiness.test.mjs')
  })

  it('keeps production livegate execution server-side and evidence-gated', () => {
    const workflow = readFileSync(
      resolve(workspaceRoot, '.github', 'workflows', 'production-livegate-execution.yml'),
      'utf8',
    )
    const guard = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'workflow-guard.yml'), 'utf8')

    expect(workflow).toContain('name: Production Livegate Execution')
    expect(workflow).toContain('Run production livegate inside production container')
    expect(workflow).toContain('--env-source process')
    expect(workflow).toContain('production-livegate-gate-selection.json')
    expect(workflow).toContain('run-production-livegate-evidence.mjs')
    expect(workflow).toContain('node project-testing/tools/evaluate-release-closeout.mjs')
    expect(workflow).not.toContain('Fetch production env from self-hosted server')
    expect(workflow).not.toContain('SUPABASE_MIGRATION_URL=')
    expect(workflow).toContain('secrets.PRODUCTION_DEPLOY_HOST')
    expect(workflow).not.toContain('secrets.DEPLOY_HOST')
    expect(guard).toContain('.github/workflows/production-livegate-execution.yml')
    expect(guard).toContain('project-testing/tools/run-production-livegate-evidence.test.mjs')
  })

  it('uses the Node 22 runtime baseline across release workflows and build images', () => {
    const workflowPaths = [
      '.github/workflows/deploy.yml',
      '.github/workflows/workflow-guard.yml',
      '.github/workflows/production-closeout-readiness.yml',
      '.github/workflows/production-livegate-execution.yml',
    ]

    for (const workflowPath of workflowPaths) {
      const workflow = readFileSync(resolve(workspaceRoot, workflowPath), 'utf8')
      expect(workflow, workflowPath).toContain("node-version: '22'")
      expect(workflow, workflowPath).not.toMatch(/node-version:\s*['\"]?20['\"]?/)
    }

    const serverDockerfile = readFileSync(resolve(workspaceRoot, 'server', 'Dockerfile'), 'utf8')
    const clientDockerfile = readFileSync(resolve(workspaceRoot, 'client', 'Dockerfile'), 'utf8')
    expect(serverDockerfile.match(/FROM node:22-bookworm-slim/g)).toHaveLength(2)
    expect(serverDockerfile).not.toContain('FROM node:20')
    expect(clientDockerfile).toContain('FROM node:22-alpine AS builder')
    expect(clientDockerfile).not.toContain('FROM node:20')
  })

  it('repairs only recognized Docker builder cache corruption before deploy', () => {
    const script = readFileSync(resolve(workspaceRoot, 'scripts', 'deploy-lighthouse-server.sh'), 'utf8')

    expect(script).toContain('run_api_build_with_cache_repair()')
    expect(script).toContain('failed to prepare extraction snapshot|parent snapshot .* does not exist')
    expect(script).toContain('docker builder prune -af')
    expect(script).toContain('run_api_build_with_cache_repair')
  })
})
