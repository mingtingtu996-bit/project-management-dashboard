import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRuntimeSeedPostImportVerification,
  parseArgs,
} from './check-default-master-plan-runtime-seed-post-import.mjs'

function profileReport(rows, overrides = {}) {
  return {
    source: 'generate-default-master-plan-profile-report',
    seedSmokeImport: {
      status: 'not_requested',
    },
    businessTypes: [
      {
        businessType: 'school',
        profileRows: rows,
      },
    ],
    ...overrides,
  }
}

function row(overrides = {}) {
  return {
    code: 'BTMP-SCH-01',
    title: '教学楼主体结构与功能区移交',
    businessType: 'school',
    durationAssetStableCode: 'cast_in_place_formwork',
    standardWorkDurationSeedResolverSource: 'active_seed',
    standardWorkDurationSeedResolverVersionId: 'runtime-seed-v1',
    t2RhythmTemplateId: 't2-school-teaching-building-structure-rhythm-v1',
    t2RhythmTemplateResolverSource: 'active_seed',
    t2RhythmTemplateResolverVersionId: 'runtime-t2-v1',
    ...overrides,
  }
}

function preflight(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-evidence-preflight/v1',
    source: 'build-default-master-plan-runtime-seed-evidence-preflight',
    status: 'runtime_seed_evidence_ready',
    runtimeSeedEvidence: {
      missingBusinessTypeCount: 0,
      requiredRuntimeSeedStableCodes: ['cast_in_place_formwork', 'masonry_infill_wall'],
    },
    ...overrides,
  }
}

function coverage(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-coverage-package/v1',
    source: 'build-default-master-plan-runtime-seed-coverage-package',
    status: 'ts_seed_coverage_complete_runtime_import_still_required',
    coverage: {
      requiredStableCodes: ['cast_in_place_formwork', 'masonry_infill_wall'],
      coveredStableCodeCount: 2,
      missingStableCodeCount: 0,
      missingStableCodes: [],
    },
    ...overrides,
  }
}

function importGate(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-gate/v1',
    source: 'build-default-master-plan-runtime-seed-import-gate',
    status: 'runtime_seed_import_allowed',
    importGate: {
      importAllowed: true,
    },
    ...overrides,
  }
}

test('verifies post-import runtime seed evidence only when every profile row uses runtime seed sources', () => {
  const verification = buildRuntimeSeedPostImportVerification({
    profileReport: profileReport([
      row({ durationAssetStableCode: 'cast_in_place_formwork' }),
      row({ code: 'BTMP-SCH-02', durationAssetStableCode: 'masonry_infill_wall' }),
    ]),
    runtimeSeedPreflight: preflight(),
    coveragePackage: coverage(),
    importGate: importGate(),
    generatedAt: '2026-07-04T00:00:00.000Z',
  })

  assert.equal(verification.status, 'runtime_seed_post_import_verified')
  assert.equal(verification.runtimeSeedEvidence.profileRowCount, 2)
  assert.equal(verification.runtimeSeedEvidence.runtimeSeedRowCount, 2)
  assert.equal(verification.runtimeSeedEvidence.fallbackOrMissingSeedRowCount, 0)
  assert.equal(verification.runtimeSeedEvidence.missingRuntimeStableCodeCount, 0)
  assert.equal(verification.runtimeSeedEvidence.importControlEvidenceReady, true)
  assert.deepEqual(verification.blockers, [])
  assert.equal(verification.mutationBoundary.writesAlgorithmSeedRecords, false)
  assert.equal(verification.productionReady, false)
})

test('blocks post-import verification when profile rows still use fallback seed sources', () => {
  const verification = buildRuntimeSeedPostImportVerification({
    profileReport: profileReport([
      row({ durationAssetStableCode: 'cast_in_place_formwork' }),
      row({
        code: 'BTMP-SCH-02',
        durationAssetStableCode: 'masonry_infill_wall',
        standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
        standardWorkDurationSeedResolverVersionId: '',
      }),
    ]),
    runtimeSeedPreflight: preflight({
      status: 'blocked',
      runtimeSeedEvidence: {
        missingBusinessTypeCount: 1,
        requiredRuntimeSeedStableCodes: ['masonry_infill_wall'],
      },
    }),
    coveragePackage: coverage(),
    importGate: importGate(),
  })

  assert.equal(verification.status, 'runtime_seed_post_import_blocked')
  assert.equal(verification.runtimeSeedEvidence.fallbackOrMissingSeedRowCount, 1)
  assert.deepEqual(verification.blockers, [
    'runtime_seed_preflight_or_import_receipt_not_ready',
    'runtime_seed_post_import_profile_rows_not_all_runtime',
    'runtime_seed_required_stable_codes_not_consumed_by_profile',
  ])
  assert.equal(verification.sampleFallbackRows[0].resolverSource, 'ts_seed_fallback')
})

test('blocks post-import verification when profile rows still use fallback T2 rhythm templates', () => {
  const verification = buildRuntimeSeedPostImportVerification({
    profileReport: profileReport([
      row({ durationAssetStableCode: 'cast_in_place_formwork' }),
      row({
        code: 'BTMP-SCH-02',
        durationAssetStableCode: 'masonry_infill_wall',
        t2RhythmTemplateId: 't2-school-classroom-lab-fitout-rhythm-v1',
        t2RhythmTemplateResolverSource: 'ts_seed_fallback',
        t2RhythmTemplateResolverVersionId: '',
      }),
    ]),
    runtimeSeedPreflight: preflight(),
    coveragePackage: coverage(),
    importGate: importGate(),
  })

  assert.equal(verification.status, 'runtime_seed_post_import_blocked')
  assert.equal(verification.runtimeT2Evidence.fallbackOrMissingT2RowCount, 1)
  assert.deepEqual(verification.blockers, [
    'runtime_t2_post_import_profile_rows_not_all_runtime',
  ])
  assert.equal(verification.sampleFallbackT2Rows[0].resolverSource, 'ts_seed_fallback')
})

test('blocks post-import verification when covered stable codes are not consumed by runtime profile rows', () => {
  const verification = buildRuntimeSeedPostImportVerification({
    profileReport: profileReport([
      row({ durationAssetStableCode: 'cast_in_place_formwork' }),
    ]),
    runtimeSeedPreflight: preflight(),
    coveragePackage: coverage(),
    importGate: importGate(),
  })

  assert.equal(verification.status, 'runtime_seed_post_import_blocked')
  assert.deepEqual(verification.runtimeSeedEvidence.missingRuntimeStableCodes, ['masonry_infill_wall'])
  assert.deepEqual(verification.blockers, ['runtime_seed_required_stable_codes_not_consumed_by_profile'])
})

test('accepts imported profile evidence when import gate is no longer allowed at verification time', () => {
  const verification = buildRuntimeSeedPostImportVerification({
    profileReport: profileReport([
      row({ durationAssetStableCode: 'cast_in_place_formwork' }),
      row({ code: 'BTMP-SCH-02', durationAssetStableCode: 'masonry_infill_wall' }),
    ], {
      seedSmokeImport: {
        status: 'imported',
      },
    }),
    runtimeSeedPreflight: preflight(),
    coveragePackage: coverage(),
    importGate: importGate({
      status: 'runtime_seed_import_blocked',
      importGate: {
        importAllowed: false,
      },
    }),
  })

  assert.equal(verification.status, 'runtime_seed_post_import_verified')
  assert.equal(verification.runtimeSeedEvidence.importControlEvidenceReady, true)
})

test('accepts a separately recorded seed import receipt when a pre-import snapshot is stale', () => {
  const verification = buildRuntimeSeedPostImportVerification({
    profileReport: profileReport([
      row({ durationAssetStableCode: 'cast_in_place_formwork' }),
      row({ code: 'BTMP-SCH-02', durationAssetStableCode: 'masonry_infill_wall' }),
    ]),
    runtimeSeedPreflight: preflight({
      status: 'blocked',
      runtimeSeedEvidence: {
        missingBusinessTypeCount: 1,
      },
    }),
    coveragePackage: coverage(),
    importGate: importGate(),
    seedSmokeImportEvidence: {
      seedSmokeImport: {
        status: 'imported',
        allowed: true,
        mode: 'import_active_seed',
        seedTypes: ['standard_work_duration', 't2_division_rhythm_template'],
        targetClass: 'remote_supabase',
      },
    },
  })

  assert.equal(verification.status, 'runtime_seed_post_import_verified')
  assert.equal(verification.runtimeSeedEvidence.preflightReady, false)
  assert.equal(verification.runtimeSeedEvidence.importReceiptReady, true)
  assert.equal(verification.runtimeSeedEvidence.importEvidenceReady, true)
  assert.deepEqual(verification.blockers, [])
})

test('blocks post-import verification when import control evidence is missing', () => {
  const verification = buildRuntimeSeedPostImportVerification({
    profileReport: profileReport([
      row({ durationAssetStableCode: 'cast_in_place_formwork' }),
      row({ code: 'BTMP-SCH-02', durationAssetStableCode: 'masonry_infill_wall' }),
    ]),
    runtimeSeedPreflight: preflight(),
    coveragePackage: coverage(),
    importGate: importGate({
      status: 'runtime_seed_import_blocked',
      importGate: {
        importAllowed: false,
      },
    }),
  })

  assert.equal(verification.status, 'runtime_seed_post_import_blocked')
  assert.deepEqual(verification.blockers, ['runtime_seed_import_control_evidence_missing'])
})

test('blocks post-import verification when runtime seed coverage is incomplete', () => {
  const verification = buildRuntimeSeedPostImportVerification({
    profileReport: profileReport([
      row({ durationAssetStableCode: 'cast_in_place_formwork' }),
    ]),
    runtimeSeedPreflight: preflight(),
    coveragePackage: coverage({
      status: 'ts_seed_coverage_gap',
      coverage: {
        requiredStableCodes: ['cast_in_place_formwork', 'missing_code'],
        coveredStableCodeCount: 1,
        missingStableCodeCount: 1,
        missingStableCodes: ['missing_code'],
      },
    }),
    importGate: importGate(),
  })

  assert.equal(verification.status, 'runtime_seed_post_import_blocked')
  assert.ok(verification.blockers.includes('runtime_seed_coverage_package_not_complete'))
  assert.ok(verification.blockers.includes('runtime_seed_required_stable_codes_not_consumed_by_profile'))
})

test('parses runtime seed post-import verification CLI args', () => {
  const args = parseArgs([
    '--profile-report',
    'tmp/profile.json',
    '--runtime-seed-preflight',
    'tmp/preflight.json',
    '--coverage-package',
    'tmp/coverage.json',
    '--import-gate',
    'tmp/import-gate.json',
    '--seed-smoke-import-evidence',
    'tmp/import-receipt.json',
    '--output',
    'tmp/post-import.json',
    '--fail-on-blocker',
  ])

  assert.equal(args.profileReport.endsWith('tmp\\profile.json') || args.profileReport.endsWith('tmp/profile.json'), true)
  assert.equal(args.runtimeSeedPreflight.endsWith('tmp\\preflight.json') || args.runtimeSeedPreflight.endsWith('tmp/preflight.json'), true)
  assert.equal(args.coveragePackage.endsWith('tmp\\coverage.json') || args.coveragePackage.endsWith('tmp/coverage.json'), true)
  assert.equal(args.importGate.endsWith('tmp\\import-gate.json') || args.importGate.endsWith('tmp/import-gate.json'), true)
  assert.equal(args.seedSmokeImportEvidence.endsWith('tmp\\import-receipt.json') || args.seedSmokeImportEvidence.endsWith('tmp/import-receipt.json'), true)
  assert.equal(args.output.endsWith('tmp\\post-import.json') || args.output.endsWith('tmp/post-import.json'), true)
  assert.equal(args.failOnBlocker, true)
})
