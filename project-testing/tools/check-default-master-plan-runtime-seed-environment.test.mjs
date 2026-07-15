import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildRuntimeSeedEnvironmentReport,
  classifySupabaseTarget,
  loadRuntimeSeedTargetEnv,
  parseArgs,
  parseEnvText,
  summarizeEnvFileContent,
} from './check-default-master-plan-runtime-seed-environment.mjs'

function buildProfileReport(overrides = {}) {
  return {
    source: 'generate-default-master-plan-profile-report',
    productionReady: false,
    failedBusinessTypes: [],
    blockers: ['runtime_seed_evidence_missing'],
    businessTypes: [
      { businessType: 'school' },
    ],
    ...overrides,
  }
}

function buildRuntimeSeedPreflight(overrides = {}) {
  return {
    status: 'blocked',
    blockers: ['runtime_seed_evidence_missing'],
    runtimeSeedEvidence: {
      readyBusinessTypeCount: 0,
      missingBusinessTypeCount: 1,
      requiredRuntimeSeedStableCodes: ['cast_in_place_formwork'],
    },
    seedSmokeImport: {
      status: 'preflight_failed',
      mode: 'preflight_only',
      targetClass: 'local_supabase',
      blockers: ['standard_duration_seed_preflight_failed'],
    },
    ...overrides,
  }
}

test('classifies local and remote Supabase targets without exposing keys', () => {
  assert.deepEqual(classifySupabaseTarget('http://127.0.0.1:54321'), {
    present: true,
    targetClass: 'local_supabase',
    origin: 'http://127.0.0.1:54321',
    host: '127.0.0.1',
    port: 54321,
    protocol: 'http',
    supabaseProjectRef: null,
    targetFingerprint: classifySupabaseTarget('http://127.0.0.1:54321').targetFingerprint,
  })
  assert.equal(classifySupabaseTarget('https://example.supabase.co').targetClass, 'remote_supabase')
  assert.equal(classifySupabaseTarget('').targetClass, 'unknown')
})

test('parses env text and summarizes secret presence without writing secret values', () => {
  const values = parseEnvText(`
SUPABASE_URL="https://example.supabase.co"
SUPABASE_ANON_KEY=anon-secret
SUPABASE_SERVICE_KEY=service-secret
WORKBUDDY_ALLOW_REMOTE_STANDARD_DURATION_SEED_SMOKE_IMPORT=1
`)
  assert.equal(values.SUPABASE_URL, 'https://example.supabase.co')

  const summary = summarizeEnvFileContent('/repo/deploy/env/staging.env', `
SUPABASE_URL=https://example.supabase.co
SUPABASE_ANON_KEY=anon-secret
SUPABASE_SERVICE_KEY=service-secret
WORKBUDDY_ALLOW_REMOTE_STANDARD_DURATION_SEED_SMOKE_IMPORT=1
`)
  assert.equal(summary.hasSupabaseUrl, true)
  assert.equal(summary.supabaseTargetClass, 'remote_supabase')
  assert.equal(summary.supabaseUrlOrigin, null)
  assert.equal(summary.supabaseUrlOriginRedacted, true)
  assert.equal(summary.hasSupabaseAnonKey, true)
  assert.equal(summary.hasSupabaseServiceKey, true)
  assert.equal(summary.hasRemoteSeedSmokeUnlock, true)
  assert.equal(JSON.stringify(summary).includes('anon-secret'), false)
  assert.equal(JSON.stringify(summary).includes('service-secret'), false)
})

test('uses the explicitly selected env file as the runtime target without exposing secrets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-seed-target-env-'))
  const envFile = path.join(root, 'staging.env')
  await writeFile(envFile, [
    'SUPABASE_URL=https://staging.example.supabase.co',
    'SUPABASE_SERVICE_ROLE_KEY=do-not-report-this-secret',
    '',
  ].join('\n'), 'utf8')

  try {
    const selected = await loadRuntimeSeedTargetEnv({
      targetEnvFile: envFile,
      baseEnv: {
        SUPABASE_URL: 'http://127.0.0.1:54321',
      },
    })

    assert.equal(selected.source, 'explicit_env_file')
    assert.equal(selected.env.SUPABASE_URL, 'https://staging.example.supabase.co')
    assert.equal(selected.env.SUPABASE_SERVICE_ROLE_KEY, 'do-not-report-this-secret')
    assert.equal(JSON.stringify(selected.summary).includes('do-not-report-this-secret'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks local runtime seed environment when local Supabase is unreachable and setup tooling is missing', () => {
  const report = buildRuntimeSeedEnvironmentReport({
    profileReport: buildProfileReport(),
    runtimeSeedPreflight: buildRuntimeSeedPreflight(),
    profileReportPath: '/repo/profile.json',
    runtimeSeedPreflightPath: '/repo/preflight.json',
    env: {},
    envFileSummaries: [],
    toolChecks: [
      { name: 'supabase', available: false, paths: [], error: 'not found' },
      { name: 'docker', available: false, paths: [], error: 'not found' },
    ],
    tcpCheck: {
      checked: true,
      reachable: false,
      host: '127.0.0.1',
      port: 54321,
      timeoutMs: 1000,
      errorCode: 'ECONNREFUSED',
      errorMessage: 'connect ECONNREFUSED 127.0.0.1:54321',
    },
    generatedAt: '2026-07-04T00:00:00.000Z',
  })

  assert.equal(report.status, 'blocked')
  assert.deepEqual(report.environmentBlockers, [
    'local_supabase_endpoint_unreachable',
    'supabase_cli_missing_for_local_seed_setup',
    'docker_cli_missing_for_local_supabase',
  ])
  assert.deepEqual(report.upstreamEvidenceBlockers, [
    'runtime_seed_evidence_missing',
    'standard_duration_seed_preflight_failed',
  ])
  assert.equal(report.currentRuntimeTarget.source, 'profile_report_default_local_supabase')
  assert.equal(report.currentRuntimeTarget.targetClass, 'local_supabase')
  assert.equal(report.localSupabaseTcp.reachable, false)
  assert.equal(report.repairPlan.status, 'blocked')
  assert.equal(report.repairPlan.noAutoInstall, true)
  assert.deepEqual(report.repairPlan.requiredStepIds, [
    'install_or_start_docker',
    'install_supabase_cli',
    'start_local_supabase',
  ])
  assert.deepEqual(report.repairPlan.blockedStepIds, [
    'rerun_runtime_seed_pipeline',
  ])
  assert.deepEqual(report.repairPlan.orderedSteps.map((step) => step.id), [
    'install_or_start_docker',
    'install_supabase_cli',
    'start_local_supabase',
    'rerun_runtime_seed_pipeline',
    'unlock_local_seed_import_after_review',
  ])
  assert.equal(JSON.stringify(report.repairPlan).includes('supabase start'), true)
  assert.equal(report.mutationBoundary.writesAlgorithmSeedRecords, false)
  assert.equal(report.productionReady, false)
})

test('marks local environment ready when local Supabase is reachable even if runtime seed evidence still needs import', () => {
  const report = buildRuntimeSeedEnvironmentReport({
    profileReport: buildProfileReport(),
    runtimeSeedPreflight: buildRuntimeSeedPreflight(),
    env: {
      SUPABASE_URL: 'http://localhost:54321',
    },
    toolChecks: [
      { name: 'supabase', available: false, paths: [], error: 'not found' },
      { name: 'docker', available: false, paths: [], error: 'not found' },
    ],
    tcpCheck: {
      checked: true,
      reachable: true,
      host: 'localhost',
      port: 54321,
      timeoutMs: 1000,
    },
  })

  assert.equal(report.status, 'ready_for_runtime_seed_preflight_or_import')
  assert.deepEqual(report.environmentBlockers, [])
  assert.equal(report.repairPlan.status, 'ready_for_runtime_seed_pipeline')
  assert.equal(report.repairPlan.orderedSteps.find((step) => step.id === 'start_local_supabase').status, 'satisfied')
  assert.equal(report.repairPlan.orderedSteps.find((step) => step.id === 'rerun_runtime_seed_pipeline').status, 'ready')
  assert.equal(
    report.repairPlan.orderedSteps.find((step) => step.id === 'unlock_local_seed_import_after_review').status,
    'manual_review_required',
  )
  assert.deepEqual(report.upstreamEvidenceBlockers, [
    'runtime_seed_evidence_missing',
    'standard_duration_seed_preflight_failed',
  ])
})

test('blocks local runtime seed environment until the local Supabase TCP check has actually run', () => {
  const report = buildRuntimeSeedEnvironmentReport({
    profileReport: buildProfileReport(),
    runtimeSeedPreflight: buildRuntimeSeedPreflight(),
    env: {
      SUPABASE_URL: 'http://127.0.0.1:54321',
    },
    toolChecks: [
      { name: 'supabase', available: true, paths: ['C:/tools/supabase.exe'], error: null },
      { name: 'docker', available: true, paths: ['C:/Program Files/Docker/docker.exe'], error: null },
    ],
    tcpCheck: {
      checked: false,
      reachable: false,
      host: '127.0.0.1',
      port: 54321,
      timeoutMs: 1000,
      errorCode: 'TCP_CHECK_SKIPPED',
      errorMessage: 'TCP check skipped by CLI flag',
    },
  })

  assert.equal(report.status, 'blocked')
  assert.deepEqual(report.environmentBlockers, ['local_supabase_tcp_check_required'])
  assert.deepEqual(report.manualActions, ['run_local_supabase_tcp_check'])
  assert.equal(report.repairPlan.status, 'blocked')
  assert.equal(report.repairPlan.blockedStepIds.includes('rerun_runtime_seed_pipeline'), true)
  assert.equal(report.productionReady, false)
})

test('keeps remote Supabase target behind manual authorization instead of treating it as automatic evidence', () => {
  const report = buildRuntimeSeedEnvironmentReport({
    profileReport: buildProfileReport({ blockers: [] }),
    runtimeSeedPreflight: buildRuntimeSeedPreflight({
      blockers: [],
      seedSmokeImport: {
        status: 'not_requested',
        mode: 'not_requested',
        targetClass: 'remote_supabase',
        blockers: [],
      },
    }),
    env: {
      SUPABASE_URL: 'https://example.supabase.co',
    },
    toolChecks: [
      { name: 'supabase', available: true, paths: ['/usr/bin/supabase'], error: null },
      { name: 'docker', available: true, paths: ['/usr/bin/docker'], error: null },
    ],
    tcpCheck: {
      checked: false,
      reachable: false,
    },
  })

  assert.equal(report.status, 'manual_authorization_required')
  assert.equal(report.currentRuntimeTarget.supabaseUrlOrigin, null)
  assert.equal(report.currentRuntimeTarget.supabaseUrlOriginRedacted, true)
  assert.deepEqual(report.environmentBlockers, [])
  assert.deepEqual(report.manualActions, [
    'remote_runtime_seed_target_requires_operator_authorization',
    'remote_standard_duration_seed_smoke_unlock_not_set',
  ])
  assert.equal(report.repairPlan.status, 'manual_authorization_required')
  assert.deepEqual(report.repairPlan.requiredStepIds, ['remote_operator_authorization'])
  assert.equal(report.repairPlan.noAutoInstall, true)
  assert.equal(report.repairPlan.orderedSteps[0].id, 'remote_operator_authorization')
  assert.equal(report.mutationBoundary.writesRuntimePublication, false)
})

test('parses runtime seed environment CLI args', () => {
  const args = parseArgs([
    '--profile-report',
    'tmp/profile.json',
    '--runtime-seed-preflight',
    'tmp/preflight.json',
    '--output',
    'tmp/env.json',
    '--env-file',
    'tmp/.env',
    '--timeout-ms',
    '2500',
    '--skip-tcp',
    '--fail-on-blocker',
  ])

  assert.equal(args.profileReport.endsWith('tmp\\profile.json') || args.profileReport.endsWith('tmp/profile.json'), true)
  assert.equal(args.runtimeSeedPreflight.endsWith('tmp\\preflight.json') || args.runtimeSeedPreflight.endsWith('tmp/preflight.json'), true)
  assert.equal(args.output.endsWith('tmp\\env.json') || args.output.endsWith('tmp/env.json'), true)
  assert.equal(args.envFiles.includes('tmp/.env'), true)
  assert.equal(args.targetEnvFile, 'tmp/.env')
  assert.equal(args.timeoutMs, 2500)
  assert.equal(args.skipTcp, true)
  assert.equal(args.failOnBlocker, true)
})
