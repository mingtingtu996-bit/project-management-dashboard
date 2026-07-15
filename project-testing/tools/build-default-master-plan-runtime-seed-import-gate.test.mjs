import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRuntimeSeedImportGate,
  parseArgs,
} from './build-default-master-plan-runtime-seed-import-gate.mjs'

function buildEnvironment(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-environment/v1',
    source: 'check-default-master-plan-runtime-seed-environment',
    status: 'blocked',
    currentRuntimeTarget: {
      source: 'profile_report_default_local_supabase',
      targetClass: 'local_supabase',
      supabaseUrlPresent: true,
      supabaseUrlOrigin: 'http://127.0.0.1:54321',
      host: '127.0.0.1',
      port: 54321,
      targetFingerprint: 'local-target-fingerprint',
    },
    localSupabaseTcp: {
      checked: true,
      reachable: false,
    },
    environmentBlockers: ['local_supabase_endpoint_unreachable'],
    mutationBoundary: {
      writesAlgorithmSeedRecords: false,
    },
    ...overrides,
  }
}

function buildCoverage(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-coverage-package/v1',
    source: 'build-default-master-plan-runtime-seed-coverage-package',
    status: 'ts_seed_coverage_complete_runtime_import_still_required',
    standardWorkDurationSeedSource: {
      seedVersion: 'v1.4.23-standard-work-duration-20260526',
    },
    coverage: {
      requiredStableCodes: ['cast_in_place_formwork', 'masonry_infill_wall'],
      coveredStableCodeCount: 2,
      missingStableCodeCount: 0,
      missingStableCodes: [],
    },
    governancePreflight: {
      status: 'runtime_seed_governance_preflight_ready',
      readyForGovernedImport: true,
      seedTypesReadyForImport: ['standard_work_duration', 't2_division_rhythm_template'],
      blockers: [],
    },
    mutationBoundary: {
      writesAlgorithmSeedRecords: false,
    },
    ...overrides,
  }
}

test('blocks local runtime seed import when local Supabase is unreachable even with full coverage', () => {
  const gate = buildRuntimeSeedImportGate({
    environmentReport: buildEnvironment(),
    coveragePackage: buildCoverage(),
    env: {
      WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT: '1',
    },
    generatedAt: '2026-07-04T00:00:00.000Z',
  })

  assert.equal(gate.status, 'runtime_seed_import_blocked')
  assert.equal(gate.importGate.importAllowed, false)
  assert.deepEqual(gate.blockers, [
    'local_supabase_endpoint_unreachable',
    'local_supabase_must_be_reachable_before_seed_import',
  ])
  assert.equal(gate.coverage.coveredStableCodeCount, 2)
  assert.equal(gate.mutationBoundary.writesAlgorithmSeedRecords, false)
  assert.equal(gate.productionReady, false)
})

test('blocks local runtime seed import when endpoint is ready but unlock flag is absent', () => {
  const gate = buildRuntimeSeedImportGate({
    environmentReport: buildEnvironment({
      status: 'ready_for_runtime_seed_preflight_or_import',
      localSupabaseTcp: {
        checked: true,
        reachable: true,
      },
      environmentBlockers: [],
    }),
    coveragePackage: buildCoverage(),
    env: {},
  })

  assert.equal(gate.status, 'runtime_seed_import_blocked')
  assert.deepEqual(gate.blockers, ['local_standard_duration_seed_import_unlock_required'])
  assert.deepEqual(gate.manualActions, ['WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT=1'])
})

test('allows local runtime seed import only when environment, coverage, and local unlock are ready', () => {
  const gate = buildRuntimeSeedImportGate({
    environmentReport: buildEnvironment({
      status: 'ready_for_runtime_seed_preflight_or_import',
      localSupabaseTcp: {
        checked: true,
        reachable: true,
      },
      environmentBlockers: [],
    }),
    coveragePackage: buildCoverage(),
    env: {
      WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT: '1',
    },
  })

  assert.equal(gate.status, 'runtime_seed_import_allowed')
  assert.equal(gate.importGate.importAllowed, true)
  assert.equal(gate.importGate.allowedCommand, 'npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs --import-active-standard-duration-seed-smoke --expected-target-fingerprint local-target-fingerprint')
  assert.deepEqual(gate.blockers, [])
})

test('blocks a standard-only activation package because strict governance requires T2', () => {
  const gate = buildRuntimeSeedImportGate({
    environmentReport: buildEnvironment({
      status: 'ready_for_runtime_seed_preflight_or_import',
      localSupabaseTcp: {
        checked: true,
        reachable: true,
      },
      environmentBlockers: [],
    }),
    coveragePackage: buildCoverage({
      runtimeActivationCandidatePackage: {
        status: 'partial_seed_activation_ready',
        blockers: [],
        seedTypesReadyForActivation: ['standard_work_duration'],
        activationCandidates: [
          {
            seedType: 'standard_work_duration',
            status: 'ready_for_activation',
            requiredRecordCount: 2,
            missingRequiredStableCodes: [],
          },
        ],
      },
    }),
    env: {
      WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT: '1',
    },
  })

  assert.equal(gate.status, 'runtime_seed_import_blocked')
  assert.equal(gate.importGate.importAllowed, false)
  assert.equal(gate.blockers.includes('runtime_seed_governance_required_seed_types_missing'), true)
})

test('blocks a ready-looking governance summary when T2 is omitted', () => {
  const gate = buildRuntimeSeedImportGate({
    environmentReport: buildEnvironment({
      status: 'ready_for_runtime_seed_preflight_or_import',
      localSupabaseTcp: { checked: true, reachable: true },
      environmentBlockers: [],
    }),
    coveragePackage: buildCoverage({
      governancePreflight: {
        status: 'runtime_seed_governance_preflight_ready',
        readyForGovernedImport: true,
        seedTypesReadyForImport: ['standard_work_duration'],
        blockers: [],
      },
    }),
    env: { WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT: '1' },
  })

  assert.equal(gate.status, 'runtime_seed_import_blocked')
  assert.equal(gate.importGate.importAllowed, false)
  assert.equal(gate.blockers.includes('runtime_seed_governance_required_seed_types_missing'), true)
})

test('allows local duration asset seed import for standard and T2 activation candidates with duration asset unlock', () => {
  const gate = buildRuntimeSeedImportGate({
    environmentReport: buildEnvironment({
      status: 'ready_for_runtime_seed_preflight_or_import',
      localSupabaseTcp: {
        checked: true,
        reachable: true,
      },
      environmentBlockers: [],
    }),
    coveragePackage: buildCoverage({
      governancePreflight: {
        status: 'runtime_seed_governance_preflight_ready',
        readyForGovernedImport: true,
        seedTypesReadyForImport: [
          'standard_work_duration',
          't2_division_rhythm_template',
        ],
        blockers: [],
      },
      runtimeActivationCandidatePackage: {
        status: 'ready_for_governed_seed_activation',
        seedTypesReadyForActivation: [
          'standard_work_duration',
          't2_division_rhythm_template',
        ],
        activationCandidates: [
          {
            seedType: 'standard_work_duration',
            status: 'ready_for_activation',
            requiredRecordCount: 19,
            missingRequiredStableCodes: [],
          },
          {
            seedType: 't2_division_rhythm_template',
            status: 'ready_for_activation',
            requiredRecordCount: 29,
            missingRequiredStableCodes: [],
          },
        ],
      },
    }),
    env: {
      WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT: '1',
    },
  })

  assert.equal(gate.status, 'runtime_seed_import_allowed')
  assert.equal(gate.importGate.importAllowed, true)
  assert.equal(gate.importGate.allowedCommand, 'npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs --import-active-duration-asset-seeds-smoke --expected-target-fingerprint local-target-fingerprint')
  assert.deepEqual(gate.activation.seedTypesReadyForActivation, [
    'standard_work_duration',
    't2_division_rhythm_template',
  ])
  assert.deepEqual(gate.activation.activationCandidates.map((candidate) => ({
    seedType: candidate.seedType,
    requiredRecordCount: candidate.requiredRecordCount,
    missingRequiredStableCodeCount: candidate.missingRequiredStableCodeCount,
  })), [
    {
      seedType: 'standard_work_duration',
      requiredRecordCount: 19,
      missingRequiredStableCodeCount: 0,
    },
    {
      seedType: 't2_division_rhythm_template',
      requiredRecordCount: 29,
      missingRequiredStableCodeCount: 0,
    },
  ])
  assert.deepEqual(gate.blockers, [])
})

test('blocks duration asset import when strict seed governance preflight failed', () => {
  const gate = buildRuntimeSeedImportGate({
    environmentReport: buildEnvironment({
      status: 'ready_for_runtime_seed_preflight_or_import',
      localSupabaseTcp: {
        checked: true,
        reachable: true,
      },
      environmentBlockers: [],
    }),
    coveragePackage: buildCoverage({
      governancePreflight: {
        status: 'runtime_seed_governance_preflight_blocked',
        readyForGovernedImport: false,
        seedTypesReadyForImport: ['standard_work_duration'],
        blockers: ['runtime_seed_governance_validation_failed:t2_division_rhythm_template'],
      },
      runtimeActivationCandidatePackage: {
        status: 'blocked',
        seedTypesReadyForActivation: [],
        activationCandidates: [
          {
            seedType: 'standard_work_duration',
            status: 'blocked_by_governance_preflight',
            requiredRecordCount: 19,
            missingRequiredStableCodes: [],
          },
          {
            seedType: 't2_division_rhythm_template',
            status: 'blocked_by_governance_preflight',
            requiredRecordCount: 29,
            missingRequiredStableCodes: [],
          },
        ],
      },
    }),
    env: {
      WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT: '1',
    },
  })

  assert.equal(gate.status, 'runtime_seed_import_blocked')
  assert.equal(gate.importGate.importAllowed, false)
  assert.equal(gate.blockers.includes('runtime_seed_governance_validation_failed:t2_division_rhythm_template'), true)
  assert.equal(gate.blockers.includes('runtime_seed_activation_package_not_ready'), true)
})

test('does not require local Supabase import gate when runtime seed evidence is already ready', () => {
  const gate = buildRuntimeSeedImportGate({
    environmentReport: buildEnvironment(),
    coveragePackage: buildCoverage({
      status: 'runtime_seed_evidence_ready_no_import_required',
      runtimeSeedPreflight: {
        status: 'runtime_seed_evidence_ready',
        blockers: [],
        runtimeSeedEvidenceReadyBusinessTypeCount: 1,
        runtimeSeedEvidenceMissingBusinessTypeCount: 0,
        runtimeReferenceDaysReadyBusinessTypeCount: 1,
        runtimeReferenceDaysMissingBusinessTypeCount: 0,
        requiredRuntimeSeedStableCodeCount: 0,
      },
      coverage: {
        requiredStableCodes: [],
        coveredStableCodeCount: 0,
        missingStableCodeCount: 0,
        missingStableCodes: [],
      },
      importReadiness: {
        runtimeSeedImportRequired: false,
        runtimeSeedEvidenceAlreadyReady: true,
        readyForRuntimeImportAttempt: false,
      },
    }),
    env: {},
    generatedAt: '2026-07-04T00:00:00.000Z',
  })

  assert.equal(gate.status, 'runtime_seed_import_not_required')
  assert.equal(gate.importGate.importAllowed, false)
  assert.equal(gate.importGate.importRequired, false)
  assert.equal(gate.importGate.runtimeSeedEvidenceAlreadyReady, true)
  assert.deepEqual(gate.blockers, [])
  assert.deepEqual(gate.manualActions, [])
  assert.equal(gate.target.targetClass, 'local_supabase')
  assert.equal(gate.mutationBoundary.writesAlgorithmSeedRecords, false)
})

test('preserves failed governance when runtime seed import is not required', () => {
  const gate = buildRuntimeSeedImportGate({
    environmentReport: buildEnvironment(),
    coveragePackage: buildCoverage({
      status: 'runtime_seed_evidence_ready_no_import_required',
      governancePreflight: {
        status: 'runtime_seed_governance_preflight_blocked',
        readyForGovernedImport: false,
        seedTypesReadyForImport: ['standard_work_duration'],
        blockers: ['runtime_seed_governance_validation_failed:t2_division_rhythm_template'],
      },
      importReadiness: {
        runtimeSeedImportRequired: false,
        runtimeSeedEvidenceAlreadyReady: true,
      },
    }),
    env: {},
  })

  assert.equal(gate.status, 'runtime_seed_import_blocked')
  assert.equal(gate.importGate.importRequired, false)
  assert.equal(gate.blockers.includes('runtime_seed_governance_validation_failed:t2_division_rhythm_template'), true)
  assert.equal(gate.governancePreflight.readyForGovernedImport, false)
})

test('keeps remote runtime seed import behind dual unlock and operator approval', () => {
  const remoteEnvironment = buildEnvironment({
    status: 'manual_authorization_required',
    currentRuntimeTarget: {
      source: 'process_env',
      targetClass: 'remote_supabase',
      supabaseUrlPresent: true,
      supabaseUrlOrigin: null,
      supabaseUrlOriginRedacted: true,
      supabaseProjectRef: 'staging-test-ref',
      targetFingerprint: 'remote-target-fingerprint',
      envFileRef: 'deploy/env/staging.env',
      envFileSha256: 'a'.repeat(64),
    },
    localSupabaseTcp: {
      checked: false,
      reachable: false,
    },
    environmentBlockers: [],
  })
  const blockedGate = buildRuntimeSeedImportGate({
    environmentReport: remoteEnvironment,
    coveragePackage: buildCoverage(),
    expectedStagingProjectRef: 'staging-test-ref',
    env: {
      WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT: '1',
    },
  })
  assert.equal(blockedGate.status, 'runtime_seed_import_blocked')
  assert.deepEqual(blockedGate.blockers, [
    'remote_standard_duration_seed_import_unlock_required',
    'remote_seed_import_operator_approval_required',
  ])
  assert.equal(blockedGate.target.supabaseUrlOrigin, null)
  assert.equal(blockedGate.target.supabaseUrlOriginRedacted, true)

  const allowedGate = buildRuntimeSeedImportGate({
    environmentReport: remoteEnvironment,
    coveragePackage: buildCoverage(),
    expectedStagingProjectRef: 'staging-test-ref',
    env: {
      WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT: '1',
      WORKBUDDY_ALLOW_REMOTE_STANDARD_DURATION_SEED_SMOKE_IMPORT: '1',
    },
    operatorApprovalRef: 'operator-approval:test',
  })
  assert.equal(allowedGate.status, 'runtime_seed_import_allowed')
  assert.deepEqual(allowedGate.blockers, [])
  assert.equal(allowedGate.importGate.operatorApprovalRef, 'operator-approval:test')
})

test('blocks runtime seed import when TS seed coverage is incomplete', () => {
  const gate = buildRuntimeSeedImportGate({
    environmentReport: buildEnvironment({
      status: 'ready_for_runtime_seed_preflight_or_import',
      localSupabaseTcp: {
        checked: true,
        reachable: true,
      },
      environmentBlockers: [],
    }),
    coveragePackage: buildCoverage({
      status: 'ts_seed_coverage_gap',
      coverage: {
        requiredStableCodes: ['cast_in_place_formwork', 'missing_code'],
        coveredStableCodeCount: 1,
        missingStableCodeCount: 1,
        missingStableCodes: ['missing_code'],
      },
    }),
    env: {
      WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT: '1',
    },
  })

  assert.equal(gate.status, 'runtime_seed_import_blocked')
  assert.deepEqual(gate.blockers, [
    'runtime_seed_ts_coverage_must_be_complete',
    'runtime_seed_coverage_package_not_ready',
  ])
  assert.equal(gate.coverage.missingStableCodeCount, 1)
})

test('parses runtime seed import gate CLI args', () => {
  const args = parseArgs([
    '--environment-report',
    'tmp/env.json',
    '--coverage-package',
    'tmp/coverage.json',
    '--output',
    'tmp/import-gate.json',
    '--operator-approval-ref',
    'approval-1',
    '--fail-on-blocked',
  ])

  assert.equal(args.environmentReport.endsWith('tmp\\env.json') || args.environmentReport.endsWith('tmp/env.json'), true)
  assert.equal(args.coveragePackage.endsWith('tmp\\coverage.json') || args.coveragePackage.endsWith('tmp/coverage.json'), true)
  assert.equal(args.output.endsWith('tmp\\import-gate.json') || args.output.endsWith('tmp/import-gate.json'), true)
  assert.equal(args.operatorApprovalRef, 'approval-1')
  assert.equal(args.failOnBlocked, true)
})
