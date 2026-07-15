import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildGenerationDepthReviewDraft,
  parseArgs,
} from './build-default-master-plan-generation-depth-review-draft.mjs'

function buildBusinessType(overrides = {}) {
  return {
    businessType: 'school',
    scheduleRowCount: 18,
    profileRowCount: 6,
    profilePhaseAnchorRowCount: 3,
    profileDurationEvidenceReady: true,
    profileDependencyEvidenceReady: true,
    profileDependencyDateViolationCount: 0,
    reviewStatus: 'candidate_master_plan_reviewable',
    productionReadinessBlockers: [
      'runtime_seed_evidence_missing',
      'runtime_reference_days_evidence_missing',
      'active_standard_duration_seed_evidence_missing',
      'active_t2_rhythm_template_evidence_missing',
    ],
    gaps: [],
    window: {
      start: '2026-07-01',
      end: '2027-08-10',
    },
    ...overrides,
  }
}

function buildReport(overrides = {}) {
  return {
    source: 'generate-default-master-plan-profile-report',
    failedBusinessTypes: [],
    productionReadinessBlockers: [
      'runtime_seed_evidence_missing',
      'runtime_reference_days_evidence_missing',
      'active_standard_duration_seed_evidence_missing',
      'active_t2_rhythm_template_evidence_missing',
    ],
    businessTypes: [buildBusinessType()],
    ...overrides,
  }
}

test('builds an offline model quality-review draft from a clean profile report', () => {
  const draft = buildGenerationDepthReviewDraft({
    report: buildReport(),
    profileReportPath: '/repo/project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.json',
    profileReportSha256: 'hash-test',
  })

  assert.equal(draft.status, 'ready_for_offline_model_review')
  assert.equal(draft.requiredForRuntime, false)
  assert.equal(draft.productionReadinessImpact, 'none')
  assert.equal('productionReady' in draft, false)
  assert.deepEqual(draft.qualityBlockers, [])
  assert.equal(draft.reviews.length, 1)
  assert.equal(draft.reviews[0].status, 'pending_model_review')
  assert.equal(draft.reviews[0].reviewerRole, 'construction_project_manager_simulation')
  assert.equal(draft.reviews[0].mutationBoundary, 'offline_development_quality_review_only_no_runtime_write')
  assert.equal(draft.mutationBoundary.writesProductionTables, false)
  assert.equal(draft.mutationBoundary.writesTaskDependencies, false)
  assert.equal(draft.mutationBoundary.writesRuntimePublication, false)
  assert.equal(draft.mutationBoundary.writesSeeds, false)
})

test('blocks generation-depth review draft when profile report still has review gaps', () => {
  const draft = buildGenerationDepthReviewDraft({
    report: buildReport({
      failedBusinessTypes: [{ businessType: 'school', gaps: ['profile_dependency_date_violation'] }],
      productionReadinessBlockers: [
        'candidate_profile_review_gaps_present',
        'runtime_seed_evidence_missing',
        'runtime_reference_days_evidence_missing',
        'active_standard_duration_seed_evidence_missing',
        'active_t2_rhythm_template_evidence_missing',
      ],
      businessTypes: [
        buildBusinessType({
          gaps: ['profile_dependency_date_violation'],
          profileDependencyDateViolationCount: 1,
          productionReadinessBlockers: [
            'candidate_profile_review_gaps_present',
            'runtime_seed_evidence_missing',
            'runtime_reference_days_evidence_missing',
            'active_standard_duration_seed_evidence_missing',
            'active_t2_rhythm_template_evidence_missing',
          ],
        }),
      ],
    }),
    profileReportPath: '/repo/report.json',
    profileReportSha256: 'hash-test',
  })

  assert.equal(draft.status, 'blocked')
  assert.equal(draft.reviews.length, 0)
  assert.equal(draft.qualityBlockers.includes('failed_business_types_must_be_empty'), true)
  assert.equal(draft.qualityBlockers.includes('unexpected_production_readiness_blocker_present'), true)
  assert.equal(draft.qualityBlockers.includes('school:profile_gaps_present'), true)
  assert.equal(draft.qualityBlockers.includes('school:dependency_date_violation'), true)
})

test('parses profile report and output args for generation-depth review draft builder', () => {
  const args = parseArgs([
    '--profile-report',
    'tmp/profile.json',
    '--output',
    'tmp/review-draft.json',
  ])

  assert.equal(args.profileReport.endsWith('tmp\\profile.json') || args.profileReport.endsWith('tmp/profile.json'), true)
  assert.equal(args.output.endsWith('tmp\\review-draft.json') || args.output.endsWith('tmp/review-draft.json'), true)
})
