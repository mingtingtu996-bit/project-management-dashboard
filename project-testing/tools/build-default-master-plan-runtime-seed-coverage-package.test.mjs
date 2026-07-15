import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRuntimeSeedCoveragePackage,
  extractStandardWorkDurationSeedRules,
  extractT2RhythmTemplateSeedRules,
  parseArgs,
  readRequiredRuntimeSeedStableCodes,
  readRequiredT2RhythmTemplateIds,
} from './build-default-master-plan-runtime-seed-coverage-package.mjs'

const SAMPLE_SEED_SOURCE = `
export const STANDARD_WORK_DURATION_SEED_VERSION = 'seed-test-v1'

const NON_RULE = [
  { stableCode: 'cast_in_place_formwork', reason: 'not a duration seed rule' },
]

export const STANDARD_WORK_DURATION_SEED = [
  {
    stableCode: 'cast_in_place_formwork',
    standardWorkCodes: ['cast_in_place_formwork'],
    standardCatalogCodePrefixes: ['05-01'],
    durationCoverageMode: 'direct',
    durationContributionMode: 'duration_bearing',
    baseDaysEligible: true,
    applicableGranularity: 'both',
    defaultDaysP20: 4,
    defaultDaysP50: 5,
    defaultDaysP80: 7,
    fixedDays: 1,
    variableDays: 4,
    scaleBasis: 'floor',
    defaultQuantity: 1,
    defaultQuantityUnit: 'floor',
    baselineProductivity: {
      p50PerDay: 0.2,
      unit: 'floor/day',
      basis: 'standard floor formwork productivity',
      sourceType: 'expert_profile',
      sourceRef: 'expert_profile:cast_in_place_formwork:standard',
      sourceDetail: 'structured source detail',
    },
    conditionedDurationBands: [
      { conditionCode: 'standard', defaultDaysP20: 4, defaultDaysP50: 5, defaultDaysP80: 7, rationale: 'standard' },
    ],
    productivityBands: [
      { conditionCode: 'standard', baselineProductivity: { p50PerDay: 0.2, unit: 'floor/day', basis: 'standard', sourceType: 'expert_profile', sourceRef: 'expert_profile:standard', sourceDetail: 'detail' } },
    ],
    conditionedProcessProfiles: [
      { conditionCode: 'standard', profile: {}, rationale: 'standard' },
    ],
    benchmarkBasis: 'benchmark basis',
    sourceStandard: 'expert_estimate',
    sourceVersion: 'v1',
    sourceClauseRef: 'expert_profile:cast_in_place_formwork',
    evidenceSourceKeys: ['V1472_STANDARD_LIBRARY'],
    confidence: 'medium',
    webVerified: true,
    reviewNeeded: false,
  },
  {
    stableCode: 'masonry_infill_wall',
    standardWorkCodes: ['masonry_infill_wall'],
    applicableGranularity: 'both',
    defaultDaysP20: 6,
    defaultDaysP50: 8,
    defaultDaysP80: 10,
    fixedDays: 1,
    variableDays: 7,
    scaleBasis: 'floor',
    benchmarkBasis: 'benchmark basis',
    sourceStandard: 'expert_estimate',
    sourceVersion: 'v1',
    sourceClauseRef: 'expert_profile:masonry_infill_wall',
    evidenceSourceKeys: ['V1472_STANDARD_LIBRARY'],
    confidence: 'medium',
    webVerified: true,
    reviewNeeded: false,
  },
  family({
    stableCode: 'integrated_commissioning',
    standardCatalogCodePrefixes: ['99'],
    keywords: ['commissioning'],
    defaultDaysP20: 8,
    defaultDaysP50: 12,
    defaultDaysP80: 16,
    fixedDays: 2,
    variableDays: 10,
    scaleBasis: 'system',
    benchmarkBasis: 'commissioning benchmark basis',
    sourceStandard: 'expert_estimate',
    sourceClauseRef: 'expert_profile:integrated_commissioning',
    evidenceSourceKeys: ['V1472_STANDARD_LIBRARY'],
    confidence: 'medium',
    processProfile: profile(4, {}),
  }),
]
`

const SAMPLE_T2_SOURCE = `
export const T2_DIVISION_RHYTHM_TEMPLATE_SEED_VERSION = 't2-seed-test-v1'

export const T2_DIVISION_RHYTHM_TEMPLATE_SEED = [
  template({
    templateId: 't2-school-teaching-building-structure-rhythm-v1',
    templateName: 'School teaching building structure rhythm',
    applicability: {
      businessTypeCodes: ['school'],
      phaseWindows: ['superstructure_rhythm'],
      divisionFamilies: ['superstructure'],
    },
    parentWindowDays: { p20: 6, p50: 8, p80: 10 },
    workfaceUnit: 'floor',
    overlapPolicy: 'sequential_with_controlled_overlap',
    windowRoles: ['structure_cycle', 'handover'],
  }),
  template({
    templateId: 't2-school-classroom-lab-fitout-rhythm-v1',
    templateName: 'School classroom and lab fitout rhythm',
    applicability: {
      businessTypeCodes: ['school'],
      phaseWindows: ['secondary_structure_fitout_roughin'],
      divisionFamilies: ['decoration_fitout'],
    },
    parentWindowDays: { p20: 30, p50: 42, p80: 56 },
    workfaceUnit: 'zone',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['rough_fitout', 'handover'],
  }),
]
`

function buildPreflight(stableCodes = ['cast_in_place_formwork', 'masonry_infill_wall']) {
  return {
    status: 'blocked',
    blockers: ['runtime_seed_evidence_missing'],
    runtimeSeedEvidence: {
      requiredRuntimeSeedStableCodes: stableCodes,
    },
  }
}

function governancePreflightReady() {
  return {
    status: 'runtime_seed_governance_preflight_ready',
    readyForGovernedImport: true,
    seedTypesReadyForImport: [
      'standard_work_duration',
      't2_division_rhythm_template',
    ],
    blockers: [],
    validations: [],
  }
}

test('extracts only standard work duration seed rules from TS seed source', () => {
  const rules = extractStandardWorkDurationSeedRules(SAMPLE_SEED_SOURCE)
  assert.equal(rules.length, 3)
  assert.deepEqual(rules.map((rule) => rule.stableCode), [
    'cast_in_place_formwork',
    'integrated_commissioning',
    'masonry_infill_wall',
  ])
  assert.equal(rules[0].defaultDaysP50, 5)
  assert.equal(rules[0].baselineProductivity.p50PerDay, 0.2)
  assert.equal(rules[0].baselineProductivity.sourceDetailPresent, true)
  assert.deepEqual(rules[0].conditionDepth, {
    conditionedDurationBandCount: 1,
    productivityBandCount: 1,
    conditionedProcessProfileCount: 1,
  })
  assert.equal(rules[1].sourceShape, 'duration_family_definition')
  assert.deepEqual(rules[1].standardWorkCodes, ['integrated_commissioning'])
})

test('extracts T2 rhythm template seed rules from TS seed source', () => {
  const rules = extractT2RhythmTemplateSeedRules(SAMPLE_T2_SOURCE)

  assert.equal(rules.length, 2)
  assert.deepEqual(rules.map((rule) => rule.templateId), [
    't2-school-classroom-lab-fitout-rhythm-v1',
    't2-school-teaching-building-structure-rhythm-v1',
  ])
  assert.equal(rules[1].parentWindowDaysP50, 8)
  assert.deepEqual(rules[1].businessTypeCodes, ['school'])
  assert.deepEqual(rules[1].phaseWindows, ['superstructure_rhythm'])
})

test('builds complete runtime seed coverage package when all required stable codes exist locally', () => {
  const report = buildRuntimeSeedCoveragePackage({
    governancePreflight: governancePreflightReady(),
    preflight: buildPreflight(),
    seedSourceText: SAMPLE_SEED_SOURCE,
    runtimeSeedPreflightPath: '/repo/preflight.json',
    standardSeedSourcePath: '/repo/server/src/seeds/standardWorkDurationSeed.ts',
    runtimeSeedPreflightSha256: 'preflight-hash',
    standardSeedSourceSha256: 'seed-hash',
    generatedAt: '2026-07-04T00:00:00.000Z',
  })

  assert.equal(report.status, 'ts_seed_coverage_complete_runtime_import_still_required')
  assert.equal(report.coverage.requiredStableCodes.length, 2)
  assert.equal(report.coverage.coveredStableCodeCount, 2)
  assert.equal(report.coverage.missingStableCodeCount, 0)
  assert.equal(report.standardWorkDurationSeedSource.seedVersion, 'seed-test-v1')
  assert.equal(report.importReadiness.readyForRuntimeImportAttempt, true)
  assert.equal(report.importReadiness.doesNotCloseRuntimeSeedEvidenceByItself, true)
  assert.equal(report.mutationBoundary.writesAlgorithmSeedRecords, false)
  assert.equal(report.mutationBoundary.writesRuntimePublication, false)
  assert.equal(report.productionReady, false)
})

test('preserves active T2 and runtime reference gaps from runtime preflight', () => {
  const report = buildRuntimeSeedCoveragePackage({
    governancePreflight: governancePreflightReady(),
    preflight: {
      status: 'blocked',
      blockers: [
        'runtime_seed_evidence_missing',
        'active_t2_rhythm_template_evidence_missing',
        'runtime_reference_days_evidence_missing',
      ],
      runtimeSeedEvidence: {
        readyBusinessTypeCount: 0,
        missingBusinessTypeCount: 1,
        missingBusinessTypes: ['school'],
        requiredRuntimeSeedStableCodes: ['cast_in_place_formwork'],
      },
      runtimeT2Evidence: {
        readyBusinessTypeCount: 0,
        missingBusinessTypeCount: 1,
        missingBusinessTypes: ['school'],
        requiredT2RhythmTemplateIds: ['t2-school-teaching-building-structure-rhythm-v1'],
      },
      runtimeReferenceDaysEvidence: {
        readyBusinessTypeCount: 0,
        missingBusinessTypeCount: 1,
        missingBusinessTypes: ['school'],
        requiredRuntimeReferenceStableCodes: ['BTMP-SCH-01'],
      },
    },
    governancePreflight: governancePreflightReady(),
    seedSourceText: SAMPLE_SEED_SOURCE,
    t2SeedSourceText: SAMPLE_T2_SOURCE,
    generatedAt: '2026-07-04T00:00:00.000Z',
  })

  assert.deepEqual(report.runtimeSeedPreflight.blockers, [
    'active_t2_rhythm_template_evidence_missing',
    'runtime_reference_days_evidence_missing',
    'runtime_seed_evidence_missing',
  ])
  assert.equal(report.runtimeSeedPreflight.runtimeT2EvidenceReadyBusinessTypeCount, 0)
  assert.equal(report.runtimeSeedPreflight.runtimeT2EvidenceMissingBusinessTypeCount, 1)
  assert.deepEqual(report.runtimeSeedPreflight.runtimeT2EvidenceMissingBusinessTypes, ['school'])
  assert.deepEqual(report.runtimeSeedPreflight.requiredT2RhythmTemplateIds, ['t2-school-teaching-building-structure-rhythm-v1'])
  assert.deepEqual(report.runtimeSeedPreflight.requiredRuntimeReferenceStableCodes, ['BTMP-SCH-01'])
  assert.equal(report.t2Coverage.requiredTemplateIds.length, 1)
  assert.equal(report.t2Coverage.coveredTemplateIdCount, 1)
  assert.equal(report.t2Coverage.missingTemplateIdCount, 0)
  assert.equal(report.importReadiness.readyForT2RuntimeImportAttempt, true)
  assert.equal(report.productionReady, false)
})

test('builds a governed runtime activation candidate package when local seed and T2 coverage are complete', () => {
  const report = buildRuntimeSeedCoveragePackage({
    governancePreflight: governancePreflightReady(),
    preflight: {
      status: 'blocked',
      blockers: [
        'runtime_seed_evidence_missing',
        'active_t2_rhythm_template_evidence_missing',
        'runtime_reference_days_evidence_missing',
      ],
      runtimeSeedEvidence: {
        readyBusinessTypeCount: 0,
        missingBusinessTypeCount: 1,
        missingBusinessTypes: ['school'],
        requiredRuntimeSeedStableCodes: ['cast_in_place_formwork'],
      },
      runtimeT2Evidence: {
        readyBusinessTypeCount: 0,
        missingBusinessTypeCount: 1,
        missingBusinessTypes: ['school'],
        requiredT2RhythmTemplateIds: ['t2-school-teaching-building-structure-rhythm-v1'],
      },
      runtimeReferenceDaysEvidence: {
        readyBusinessTypeCount: 0,
        missingBusinessTypeCount: 1,
        missingBusinessTypes: ['school'],
        requiredRuntimeReferenceStableCodes: ['BTMP-SCH-01'],
      },
    },
    governancePreflight: governancePreflightReady(),
    seedSourceText: SAMPLE_SEED_SOURCE,
    t2SeedSourceText: SAMPLE_T2_SOURCE,
    generatedAt: '2026-07-04T00:00:00.000Z',
  })

  assert.equal(report.runtimeActivationCandidatePackage.status, 'ready_for_governed_seed_activation')
  assert.equal(report.runtimeActivationCandidatePackage.productionReadyAfterActivation, false)
  assert.deepEqual(report.runtimeActivationCandidatePackage.remainingProductionBlockersAfterActivation, [
    'runtime_reference_days_evidence_missing',
  ])
  assert.deepEqual(report.runtimeActivationCandidatePackage.seedTypesReadyForActivation, [
    'standard_work_duration',
    't2_division_rhythm_template',
  ])
  assert.deepEqual(report.runtimeActivationCandidatePackage.activationCandidates.map((candidate) => candidate.seedType), [
    'standard_work_duration',
    't2_division_rhythm_template',
  ])
  assert.equal(report.runtimeActivationCandidatePackage.activationCandidates[0].importEntrypoint, 'algorithmSeedImportService.importV1474AlgorithmSeeds')
  assert.equal(report.runtimeActivationCandidatePackage.activationCandidates[0].requiredRecordCount, 1)
  assert.deepEqual(report.runtimeActivationCandidatePackage.activationCandidates[0].requiredStableCodes, ['cast_in_place_formwork'])
  assert.equal(report.runtimeActivationCandidatePackage.activationCandidates[1].requiredRecordCount, 1)
  assert.deepEqual(report.runtimeActivationCandidatePackage.activationCandidates[1].requiredStableCodes, ['t2-school-teaching-building-structure-rhythm-v1'])
  assert.equal(report.runtimeActivationCandidatePackage.mutationBoundary.writesProductionTables, false)
  assert.equal(report.runtimeActivationCandidatePackage.mutationBoundary.writesAlgorithmSeedRecords, false)
  assert.equal(report.runtimeActivationCandidatePackage.requiresExplicitEnvironmentUnlock, true)
})

test('does not mark covered duration assets ready when strict seed governance preflight failed', () => {
  const report = buildRuntimeSeedCoveragePackage({
    governancePreflight: {
      status: 'runtime_seed_governance_preflight_blocked',
      readyForGovernedImport: false,
      seedTypesReadyForImport: ['standard_work_duration'],
      blockers: ['runtime_seed_governance_validation_failed:t2_division_rhythm_template'],
      validations: [
        {
          seedType: 't2_division_rhythm_template',
          ok: false,
          issueCodes: ['INVALID_SEED_VERSION', 'RECORD_EVIDENCE_INCOMPLETE'],
        },
      ],
    },
    preflight: {
      status: 'blocked',
      blockers: [
        'runtime_seed_evidence_missing',
        'active_t2_rhythm_template_evidence_missing',
      ],
      runtimeSeedEvidence: {
        requiredRuntimeSeedStableCodes: ['cast_in_place_formwork'],
      },
      runtimeT2Evidence: {
        requiredT2RhythmTemplateIds: ['t2-school-teaching-building-structure-rhythm-v1'],
      },
    },
    seedSourceText: SAMPLE_SEED_SOURCE,
    t2SeedSourceText: SAMPLE_T2_SOURCE,
  })

  assert.equal(report.governancePreflight.readyForGovernedImport, false)
  assert.equal(report.importReadiness.readyForRuntimeImportAttempt, false)
  assert.equal(report.importReadiness.readyForT2RuntimeImportAttempt, false)
  assert.equal(report.runtimeActivationCandidatePackage.status, 'blocked')
  assert.equal(report.status, 'runtime_seed_governance_blocked')
  assert.deepEqual(report.runtimeActivationCandidatePackage.seedTypesReadyForActivation, [])
  assert.equal(
    report.runtimeActivationCandidatePackage.remainingProductionBlockersAfterActivation.includes(
      'runtime_seed_governance_validation_failed:t2_division_rhythm_template',
    ),
    true,
  )
})

test('blocks active T2 coverage when a required template id is absent from local T2 seed source', () => {
  const report = buildRuntimeSeedCoveragePackage({
    governancePreflight: governancePreflightReady(),
    preflight: {
      status: 'blocked',
      blockers: ['active_t2_rhythm_template_evidence_missing'],
      runtimeSeedEvidence: {
        requiredRuntimeSeedStableCodes: [],
      },
      runtimeT2Evidence: {
        readyBusinessTypeCount: 0,
        missingBusinessTypeCount: 1,
        missingBusinessTypes: ['school'],
        requiredT2RhythmTemplateIds: ['missing-t2-template'],
      },
      runtimeReferenceDaysEvidence: {
        readyBusinessTypeCount: 1,
        missingBusinessTypeCount: 0,
        missingBusinessTypes: [],
        requiredRuntimeReferenceStableCodes: [],
      },
    },
    seedSourceText: SAMPLE_SEED_SOURCE,
    t2SeedSourceText: SAMPLE_T2_SOURCE,
  })

  assert.equal(report.t2Coverage.coveredTemplateIdCount, 0)
  assert.deepEqual(report.t2Coverage.missingTemplateIds, ['missing-t2-template'])
  assert.equal(report.importReadiness.readyForT2RuntimeImportAttempt, false)
  assert.equal(report.runtimeActivationCandidatePackage.status, 'blocked')
  assert.equal(
    report.runtimeActivationCandidatePackage.blockers.includes('runtime_t2_seed_ts_coverage_must_be_complete'),
    true,
  )
})

test('marks runtime seed import unnecessary when profile rows already use runtime seeds', () => {
  const report = buildRuntimeSeedCoveragePackage({
    preflight: {
      status: 'runtime_seed_evidence_ready',
      blockers: [],
      runtimeSeedEvidence: {
        readyBusinessTypeCount: 1,
        missingBusinessTypeCount: 0,
        missingBusinessTypes: [],
        requiredRuntimeSeedStableCodes: [],
      },
      runtimeReferenceDaysEvidence: {
        readyBusinessTypeCount: 1,
        missingBusinessTypeCount: 0,
        missingBusinessTypes: [],
        requiredRuntimeReferenceStableCodes: [],
      },
    },
    governancePreflight: governancePreflightReady(),
    seedSourceText: SAMPLE_SEED_SOURCE,
    generatedAt: '2026-07-04T00:00:00.000Z',
  })

  assert.equal(report.status, 'runtime_seed_evidence_ready_no_import_required')
  assert.equal(report.runtimeSeedPreflight.runtimeSeedEvidenceReadyBusinessTypeCount, 1)
  assert.equal(report.runtimeSeedPreflight.runtimeSeedEvidenceMissingBusinessTypeCount, 0)
  assert.equal(report.runtimeSeedPreflight.runtimeReferenceDaysReadyBusinessTypeCount, 1)
  assert.equal(report.coverage.requiredStableCodes.length, 0)
  assert.equal(report.importReadiness.runtimeSeedImportRequired, false)
  assert.equal(report.importReadiness.readyForRuntimeImportAttempt, false)
  assert.equal(report.importReadiness.runtimeSeedEvidenceAlreadyReady, true)
  assert.equal(report.importReadiness.doesNotCloseRuntimeSeedEvidenceByItself, false)
})

test('blocks runtime seed coverage package when a required stable code is absent from local seed source', () => {
  const report = buildRuntimeSeedCoveragePackage({
    preflight: buildPreflight(['cast_in_place_formwork', 'missing_seed_code']),
    governancePreflight: governancePreflightReady(),
    seedSourceText: SAMPLE_SEED_SOURCE,
  })

  assert.equal(report.status, 'ts_seed_coverage_gap')
  assert.equal(report.coverage.coveredStableCodeCount, 1)
  assert.deepEqual(report.coverage.missingStableCodes, ['missing_seed_code'])
  assert.equal(report.importReadiness.readyForRuntimeImportAttempt, false)
})

test('reads required runtime seed stable codes from runtime preflight report', () => {
  assert.deepEqual(readRequiredRuntimeSeedStableCodes(buildPreflight(['b', 'a', 'a'])), ['a', 'b'])
})

test('reads required T2 rhythm template ids from runtime preflight report', () => {
  assert.deepEqual(readRequiredT2RhythmTemplateIds({
    runtimeT2Evidence: {
      requiredT2RhythmTemplateIds: ['t2-b', 't2-a', 't2-a'],
    },
  }), ['t2-a', 't2-b'])
})

test('parses runtime seed coverage CLI args', () => {
  const args = parseArgs([
    '--runtime-seed-preflight',
    'tmp/preflight.json',
    '--standard-seed-source',
    'tmp/standard.ts',
    '--t2-seed-source',
    'tmp/t2.ts',
    '--output',
    'tmp/package.json',
    '--fail-on-gap',
  ])

  assert.equal(args.runtimeSeedPreflight.endsWith('tmp\\preflight.json') || args.runtimeSeedPreflight.endsWith('tmp/preflight.json'), true)
  assert.equal(args.standardSeedSource.endsWith('tmp\\standard.ts') || args.standardSeedSource.endsWith('tmp/standard.ts'), true)
  assert.equal(args.t2SeedSource.endsWith('tmp\\t2.ts') || args.t2SeedSource.endsWith('tmp/t2.ts'), true)
  assert.equal(args.output.endsWith('tmp\\package.json') || args.output.endsWith('tmp/package.json'), true)
  assert.equal(args.failOnGap, true)
})
