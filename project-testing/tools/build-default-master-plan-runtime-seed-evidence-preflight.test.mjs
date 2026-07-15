import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRuntimeSeedEvidencePreflight,
  parseArgs,
} from './build-default-master-plan-runtime-seed-evidence-preflight.mjs'

function buildProfileRow(overrides = {}) {
  return {
    code: 'BTMP-SCH-01',
    title: '教学楼主体结构与功能区移交',
    durationAssetStableCode: 'cast_in_place_formwork',
    t2RhythmTemplateId: 't2-school-teaching-building-structure-rhythm-v1',
    t2RhythmTemplateResolverSource: 'ts_seed_fallback',
    t2RhythmTemplateResolverVersionId: 't2-template-seed-v1',
    standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
    standardWorkDurationSeedResolverVersionId: 'standard-work-duration-seed-v1',
    ...overrides,
  }
}

function buildBusinessType(overrides = {}) {
  return {
    businessType: 'school',
    profileRowCount: 2,
    seedResolverSourceCounts: {
      ts_seed_fallback: 2,
    },
    profileRows: [
      buildProfileRow(),
      buildProfileRow({
        code: 'BTMP-SCH-02',
        title: '教学楼二次结构与普通教室粗装修',
        durationAssetStableCode: 'masonry_infill_wall',
      }),
    ],
    ...overrides,
  }
}

function buildReport(overrides = {}) {
  return {
    source: 'generate-default-master-plan-profile-report',
    seedSmokeImport: {
      status: 'not_requested',
      mode: 'not_requested',
      targetClass: 'local_supabase',
      mutationBoundary: {
        writesAlgorithmSeedVersions: false,
        writesAlgorithmSeedRecords: false,
        writesAlgorithmSeedImportLogs: false,
      },
    },
    businessTypes: [buildBusinessType()],
    ...overrides,
  }
}

test('blocks runtime seed evidence when all profile rows use fallback seeds', () => {
  const preflight = buildRuntimeSeedEvidencePreflight({
    report: buildReport(),
    profileReportPath: '/repo/profile.json',
    profileReportSha256: 'hash-test',
  })

  assert.equal(preflight.status, 'blocked')
  assert.deepEqual(preflight.blockers, [
    'runtime_seed_evidence_missing',
    'active_t2_rhythm_template_evidence_missing',
    'runtime_reference_days_evidence_missing',
  ])
  assert.deepEqual(preflight.runtimeSeedEvidence.missingBusinessTypes, ['school'])
  assert.deepEqual(preflight.runtimeSeedEvidence.requiredRuntimeSeedStableCodes, [
    'cast_in_place_formwork',
    'masonry_infill_wall',
  ])
  assert.deepEqual(preflight.runtimeT2Evidence.requiredT2RhythmTemplateIds, [
    't2-school-teaching-building-structure-rhythm-v1',
  ])
  assert.equal(preflight.businessTypes[0].runtimeSeedEvidenceReady, false)
  assert.equal(preflight.businessTypes[0].runtimeT2EvidenceReady, false)
  assert.equal(preflight.mutationBoundary.writesAlgorithmSeedRecords, false)
  assert.equal(preflight.mutationBoundary.writesRuntimePublication, false)
})

test('marks runtime seed evidence ready when a profile row resolves from active seed', () => {
  const preflight = buildRuntimeSeedEvidencePreflight({
    report: buildReport({
      businessTypes: [
        buildBusinessType({
          seedResolverSourceCounts: {
            active_seed: 1,
            ts_seed_fallback: 1,
          },
          profileRows: [
            buildProfileRow({
              standardWorkDurationSeedResolverSource: 'active_seed',
              standardWorkDurationSeedResolverVersionId: 'runtime-seed-v1',
            }),
            buildProfileRow({
              code: 'BTMP-SCH-02',
              title: '教学楼二次结构与普通教室粗装修',
              durationAssetStableCode: 'masonry_infill_wall',
            }),
          ],
        }),
      ],
    }),
    profileReportPath: '/repo/profile.json',
    profileReportSha256: 'hash-test',
  })

  assert.equal(preflight.status, 'blocked')
  assert.equal(preflight.businessTypes[0].runtimeSeedEvidenceReady, false)
  assert.equal(preflight.businessTypes[0].runtimeSeedRowCount, 1)
  assert.equal(preflight.businessTypes[0].fallbackOrMissingSeedRowCount, 1)
  assert.equal(preflight.runtimeSeedEvidence.readyBusinessTypeCount, 0)
  assert.equal(preflight.runtimeSeedEvidence.missingBusinessTypeCount, 1)
  assert.deepEqual(preflight.blockers, [
    'runtime_seed_evidence_missing',
    'active_t2_rhythm_template_evidence_missing',
    'runtime_reference_days_evidence_missing',
  ])
  assert.deepEqual(preflight.runtimeSeedEvidence.requiredRuntimeSeedStableCodes, ['masonry_infill_wall'])
})

test('reports active T2 rhythm coverage separately from standard seed coverage', () => {
  const preflight = buildRuntimeSeedEvidencePreflight({
    report: buildReport({
      businessTypes: [
        buildBusinessType({
          seedResolverSourceCounts: {
            active_seed: 2,
          },
          profileRows: [
            buildProfileRow({
              standardWorkDurationSeedResolverSource: 'active_seed',
              standardWorkDurationSeedResolverVersionId: 'runtime-seed-v1',
              t2RhythmTemplateResolverSource: 'active_seed',
              t2RhythmTemplateResolverVersionId: 'runtime-t2-v1',
              runtimeReferenceDaysConsumed: true,
            }),
            buildProfileRow({
              code: 'BTMP-SCH-02',
              title: '教学楼二次结构与普通教室粗装修',
              durationAssetStableCode: 'masonry_infill_wall',
              t2RhythmTemplateId: 't2-school-classroom-lab-fitout-rhythm-v1',
              standardWorkDurationSeedResolverSource: 'active_seed',
              standardWorkDurationSeedResolverVersionId: 'runtime-seed-v1',
              t2RhythmTemplateResolverSource: 'ts_seed_fallback',
              runtimeReferenceDaysConsumed: true,
            }),
          ],
        }),
      ],
    }),
    profileReportPath: '/repo/profile.json',
    profileReportSha256: 'hash-test',
  })

  assert.equal(preflight.status, 'blocked')
  assert.equal(preflight.businessTypes[0].runtimeSeedEvidenceReady, true)
  assert.equal(preflight.businessTypes[0].runtimeT2EvidenceReady, false)
  assert.equal(preflight.businessTypes[0].runtimeT2RowCount, 1)
  assert.equal(preflight.businessTypes[0].fallbackOrMissingT2RowCount, 1)
  assert.deepEqual(preflight.runtimeT2Evidence.requiredT2RhythmTemplateIds, [
    't2-school-classroom-lab-fitout-rhythm-v1',
  ])
  assert.deepEqual(preflight.blockers, ['active_t2_rhythm_template_evidence_missing'])
})

test('reports runtime reference-day coverage separately from active seed coverage', () => {
  const preflight = buildRuntimeSeedEvidencePreflight({
    report: buildReport({
      businessTypes: [
        buildBusinessType({
          profileRuntimeReferenceDaysConsumedCount: 2,
          profileRuntimeReferenceDaysEvidenceReady: true,
          seedResolverSourceCounts: {
            ts_seed_fallback: 2,
          },
          profileRows: [
            buildProfileRow({ runtimeReferenceDaysConsumed: true }),
            buildProfileRow({
              code: 'BTMP-SCH-02',
              title: '教学楼二次结构与普通教室粗装修',
              durationAssetStableCode: 'masonry_infill_wall',
              runtimeReferenceDaysConsumed: true,
            }),
          ],
        }),
      ],
    }),
    profileReportPath: '/repo/profile.json',
    profileReportSha256: 'hash-test',
  })

  assert.equal(preflight.status, 'blocked')
  assert.equal(preflight.businessTypes[0].runtimeReferenceDaysEvidenceReady, true)
  assert.equal(preflight.businessTypes[0].runtimeReferenceDaysConsumedRowCount, 2)
  assert.equal(preflight.businessTypes[0].runtimeReferenceDaysMissingRowCount, 0)
  assert.deepEqual(preflight.runtimeSeedEvidence.missingBusinessTypes, ['school'])
  assert.equal(preflight.runtimeReferenceDaysEvidence.readyBusinessTypeCount, 1)
  assert.equal(preflight.runtimeReferenceDaysEvidence.missingBusinessTypeCount, 0)
  assert.deepEqual(preflight.blockers, [
    'runtime_seed_evidence_missing',
    'active_t2_rhythm_template_evidence_missing',
  ])
})

test('marks runtime seed evidence fully ready when no fallback seed rows remain', () => {
  const preflight = buildRuntimeSeedEvidencePreflight({
    report: buildReport({
      businessTypes: [
        buildBusinessType({
          seedResolverSourceCounts: {
            active_seed: 2,
          },
          profileRows: [
            buildProfileRow({
              standardWorkDurationSeedResolverSource: 'active_seed',
              standardWorkDurationSeedResolverVersionId: 'runtime-seed-v1',
              t2RhythmTemplateResolverSource: 'active_seed',
              t2RhythmTemplateResolverVersionId: 'runtime-t2-v1',
              runtimeReferenceDaysConsumed: true,
            }),
            buildProfileRow({
              code: 'BTMP-SCH-02',
              title: '教学楼二次结构与普通教室粗装修',
              durationAssetStableCode: 'masonry_infill_wall',
              standardWorkDurationSeedResolverSource: 'active_seed',
              standardWorkDurationSeedResolverVersionId: 'runtime-seed-v1',
              t2RhythmTemplateResolverSource: 'active_seed',
              t2RhythmTemplateResolverVersionId: 'runtime-t2-v1',
              runtimeReferenceDaysConsumed: true,
            }),
          ],
        }),
      ],
    }),
    profileReportPath: '/repo/profile.json',
    profileReportSha256: 'hash-test',
  })

  assert.equal(preflight.status, 'runtime_seed_evidence_ready')
  assert.deepEqual(preflight.blockers, [])
  assert.equal(preflight.productionReady, false)
})

test('preserves standard duration seed smoke preflight errors without production writes', () => {
  const preflight = buildRuntimeSeedEvidencePreflight({
    report: buildReport({
      seedSmokeImport: {
        status: 'preflight_failed',
        mode: 'preflight_only',
        targetClass: 'local_supabase',
        preflightError: {
          code: '',
          message: 'TypeError: fetch failed',
          details: {
            details: 'connect ECONNREFUSED 127.0.0.1:54321',
          },
        },
        mutationBoundary: {
          writesAlgorithmSeedVersions: false,
          writesAlgorithmSeedRecords: false,
          writesAlgorithmSeedImportLogs: false,
          writesTasks: false,
          writesTaskDependencies: false,
          writesRuntimePublication: false,
        },
      },
    }),
    profileReportPath: '/repo/profile.json',
    profileReportSha256: 'hash-test',
  })

  assert.deepEqual(preflight.seedSmokeImport.blockers, ['standard_duration_seed_preflight_failed'])
  assert.equal(preflight.seedSmokeImport.preflightError.message, 'TypeError: fetch failed')
  assert.equal(preflight.seedSmokeImport.mutationBoundary.writesAlgorithmSeedRecords, false)
})

test('parses profile report and output args for runtime seed preflight', () => {
  const args = parseArgs([
    '--profile-report',
    'tmp/profile.json',
    '--output',
    'tmp/runtime-seed.json',
    '--fail-on-blocker',
  ])

  assert.equal(args.profileReport.endsWith('tmp\\profile.json') || args.profileReport.endsWith('tmp/profile.json'), true)
  assert.equal(args.output.endsWith('tmp\\runtime-seed.json') || args.output.endsWith('tmp/runtime-seed.json'), true)
  assert.equal(args.failOnBlocker, true)
})
