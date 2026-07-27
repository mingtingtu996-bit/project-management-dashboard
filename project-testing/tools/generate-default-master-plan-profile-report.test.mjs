import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildCandidateCriticalPathEvidence,
  buildReportRunSummary,
  buildAuditableDurationAssetRow,
  buildStandardDurationSeedSmokeImportPlan,
  bindRuntimeSeedImportTarget,
  buildRuntimeReferenceDayGapRows,
  classifyReview,
  collectDependencyClosureRows,
  collectDurationAssetSemanticGaps,
  evaluateProfileDependencyEvidence,
  hasCandidateDependencyRuleEvidence,
  hasProfileDurationEvidence,
  normalizeSeedSmokePreflightError,
  parseArgs,
  readRuntimeCalibrationEvidenceInput,
} from './generate-default-master-plan-profile-report.mjs'
import { classifySupabaseTarget } from './check-default-master-plan-runtime-seed-environment.mjs'

const REPORT_SCRIPT = path.resolve('project-testing/tools/generate-default-master-plan-profile-report.mjs')

test('binds runtime seed import to the approved env hash and target fingerprint', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-runtime-seed-target-'))
  const envFile = path.join(root, 'staging.env')
  const raw = 'SUPABASE_URL=https://staging-test-ref.supabase.co\nSUPABASE_SERVICE_KEY=test-only-key\n'
  fs.writeFileSync(envFile, raw, 'utf8')
  const target = classifySupabaseTarget('https://staging-test-ref.supabase.co')

  try {
    const bound = await bindRuntimeSeedImportTarget({
      envFile,
      expectedEnvFileSha256: createHash('sha256').update(raw).digest('hex'),
      expectedTargetFingerprint: target.targetFingerprint,
    }, {})
    assert.equal(bound.targetFingerprint, target.targetFingerprint)

    await assert.rejects(() => bindRuntimeSeedImportTarget({
      envFile,
      expectedEnvFileSha256: createHash('sha256').update(raw).digest('hex'),
      expectedTargetFingerprint: 'different-target-fingerprint',
    }, {}), { code: 'RUNTIME_SEED_TARGET_FINGERPRINT_MISMATCH' })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('collects the transitive predecessor closure for candidate dependency anchors', () => {
  const rows = [
    { clientRowId: 'row-start', predecessorDependencies: [] },
    {
      clientRowId: 'row-anchor',
      predecessorDependencies: [{ clientRowId: 'row-start' }],
    },
    {
      clientRowId: 'row-review',
      predecessorDependencies: [{ clientRowId: 'row-anchor' }, { clientRowId: 'row-missing' }],
    },
  ]

  const closure = collectDependencyClosureRows(rows, [rows[2]])

  assert.deepEqual(closure.rows.map((row) => row.clientRowId), ['row-start', 'row-anchor'])
  assert.deepEqual(closure.missingPredecessorClientRowIds, ['row-missing'])
})

test('resolves a missing linked-projection predecessor only when its schedule stable code is unique', () => {
  const rows = [
    {
      clientRowId: 'generated:school:template:scope-2:04-03:13',
      values: { standard_work_code: '04-03' },
      predecessorDependencies: [],
    },
    {
      clientRowId: 'generated:school:profile:BTMP-SCH-05',
      predecessorDependencies: [{
        clientRowId: 'generated:school:template:scope-4:04-03:49',
      }],
    },
  ]

  const closure = collectDependencyClosureRows(rows, [rows[1]])

  assert.deepEqual(closure.rows.map((row) => row.clientRowId), [
    'generated:school:template:scope-2:04-03:13',
  ])
  assert.deepEqual(closure.missingPredecessorClientRowIds, [])
  assert.deepEqual(closure.resolvedPredecessorAliases, [{
    requestedClientRowId: 'generated:school:template:scope-4:04-03:49',
    resolvedClientRowId: 'generated:school:template:scope-2:04-03:13',
    standardWorkCode: '04-03',
  }])
})

test('keeps generation-depth policy review informational when no fallback rows exist', () => {
  const summary = {
    scheduleRowCount: 16,
    profileRowCount: 6,
    profileDurationEvidenceReady: true,
    profileRuntimeSeedEvidenceReady: true,
    profilePhaseAnchorsReady: true,
    profileDependencyEvidenceReady: true,
    profileDependencyDatesReady: true,
    dangerChecklistInSchedule: false,
    hasFoundationOrStartupSignal: true,
    hasStructureSignal: true,
    hasMepOrFitoutSignal: true,
    hasAcceptanceSignal: true,
    governanceWarnings: [
      {
        code: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        details: {
          status: 'review_required',
          reviewReasons: ['candidate_generation_depth_policy_review_required'],
          fallbackPolicyRowCount: 0,
        },
      },
    ],
  }

  const review = classifyReview(summary)

  assert.equal(review.reviewStatus, 'candidate_master_plan_reviewable')
  assert.equal(review.productionReadinessStatus, 'production_readiness_ready')
  assert.deepEqual(review.productionReadinessBlockers, [])
  assert.deepEqual(review.gaps, [])
})

test('keeps fallback-only profile samples candidate-reviewable but production-blocked', () => {
  const summary = {
    scheduleRowCount: 16,
    profileRowCount: 6,
    profileDurationEvidenceReady: true,
    profileRuntimeSeedEvidenceReady: false,
    profilePhaseAnchorsReady: true,
    profileDependencyEvidenceReady: true,
    profileDependencyDatesReady: true,
    dangerChecklistInSchedule: false,
    hasFoundationOrStartupSignal: true,
    hasStructureSignal: true,
    hasMepOrFitoutSignal: true,
    hasAcceptanceSignal: true,
    governanceWarnings: [
      {
        code: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        details: {
          status: 'review_required',
          reviewReasons: ['candidate_generation_depth_policy_review_required'],
          fallbackPolicyRowCount: 0,
        },
      },
    ],
  }

  const review = classifyReview(summary)

  assert.equal(review.reviewStatus, 'candidate_master_plan_reviewable')
  assert.deepEqual(review.gaps, [])
  assert.equal(review.productionReadinessStatus, 'production_readiness_blocked')
  assert.equal(review.productionReadinessBlockers.includes('runtime_seed_evidence_missing'), true)
  assert.equal(review.productionReadinessBlockers.includes('candidate_generation_depth_review_required'), false)
})

test('uses the base-plus-profile review row count instead of internal generated rows for candidate review', () => {
  const review = classifyReview({
    businessType: 'school',
    scheduleRowCount: 78,
    reviewScheduleRowCount: 18,
    baseRowCount: 12,
    profileRowCount: 6,
    profileDurationEvidenceReady: true,
    profileRuntimeSeedEvidenceReady: true,
    profileRuntimeReferenceDaysEvidenceReady: true,
    profilePhaseAnchorsReady: true,
    profileDependencyEvidenceReady: true,
    profileDependencyDatesReady: true,
    durationAssetSemanticGaps: [],
    hasFoundationOrStartupSignal: true,
    hasStructureSignal: true,
    hasMepOrFitoutSignal: true,
    hasAcceptanceSignal: true,
  })

  assert.equal(review.gaps.includes('row_count_outside_15_60'), false)
})

test('keeps dedicated-only business type profiles candidate-reviewable without generic base rows', () => {
  const review = classifyReview({
    businessType: 'renovation',
    scheduleRowCount: 6,
    baseRowCount: 0,
    profileRowCount: 6,
    profileDurationEvidenceReady: true,
    profileRuntimeSeedEvidenceReady: false,
    profilePhaseAnchorsReady: true,
    profileDependencyEvidenceReady: true,
    profileDependencyDatesReady: true,
    dangerChecklistInSchedule: false,
    hasFoundationOrStartupSignal: true,
    hasStructureSignal: true,
    hasMepOrFitoutSignal: true,
    hasAcceptanceSignal: true,
    governanceWarnings: [
      {
        code: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        details: {
          status: 'review_required',
          reviewReasons: ['candidate_generation_depth_policy_review_required'],
          fallbackPolicyRowCount: 0,
        },
      },
    ],
  })

  assert.equal(review.reviewStatus, 'candidate_master_plan_reviewable')
  assert.deepEqual(review.gaps, [])
  assert.equal(review.productionReadinessStatus, 'production_readiness_blocked')
  assert.equal(review.productionReadinessBlockers.includes('runtime_seed_evidence_missing'), true)
})

test('records offline model quality review without turning it into a runtime gate', () => {
  const completedReview = {
    status: 'completed',
    reviewerRole: 'construction_project_manager_simulation',
    modelRef: 'offline-model:test',
    reviewedAt: '2026-07-04T10:00:00.000Z',
    verdict: 'accepted',
    businessTypes: ['school'],
    mutationBoundary: 'offline_development_quality_review_only_no_runtime_write',
  }
  const baseSummary = {
    businessType: 'school',
    scheduleRowCount: 16,
    profileRowCount: 6,
    profileDurationEvidenceReady: true,
    profileRuntimeSeedEvidenceReady: true,
    profilePhaseAnchorsReady: true,
    profileDependencyEvidenceReady: true,
    profileDependencyDatesReady: true,
    dangerChecklistInSchedule: false,
    hasFoundationOrStartupSignal: true,
    hasStructureSignal: true,
    hasMepOrFitoutSignal: true,
    hasAcceptanceSignal: true,
    generationDepthReviewEvidence: completedReview,
  }

  const review = classifyReview({
    ...baseSummary,
    governanceWarnings: [
      {
        code: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        details: {
          status: 'review_required',
          reviewReasons: ['candidate_generation_depth_policy_review_required'],
          fallbackPolicyRowCount: 0,
        },
      },
    ],
  })
  const fallbackReview = classifyReview({
    ...baseSummary,
    governanceWarnings: [
      {
        code: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        details: {
          status: 'review_required',
          reviewReasons: ['generation_depth_policy_fallback'],
          fallbackPolicyRowCount: 16,
        },
      },
    ],
  })

  assert.equal(review.productionReadinessBlockers.includes('candidate_generation_depth_review_required'), false)
  assert.equal(review.productionReadinessStatus, 'production_readiness_ready')
  assert.equal(fallbackReview.gaps.includes('generation_depth_policy_fallback'), true)
  assert.equal(fallbackReview.productionReadinessBlockers.includes('candidate_profile_review_gaps_present'), true)
})

test('keeps production blocked when runtime reference-day evidence is not fully covered', () => {
  const review = classifyReview({
    businessType: 'school',
    scheduleRowCount: 16,
    profileRowCount: 6,
    profileDurationEvidenceReady: true,
    profileRuntimeSeedEvidenceReady: true,
    profileRuntimeReferenceDaysEvidenceReady: false,
    profilePhaseAnchorsReady: true,
    profileDependencyEvidenceReady: true,
    profileDependencyDatesReady: true,
    dangerChecklistInSchedule: false,
    hasFoundationOrStartupSignal: true,
    hasStructureSignal: true,
    hasMepOrFitoutSignal: true,
    hasAcceptanceSignal: true,
    generationDepthReviewEvidence: {
      status: 'completed',
      reviewerRole: 'construction_project_manager_simulation',
      modelRef: 'offline-model:test',
      reviewedAt: '2026-07-04T10:00:00.000Z',
      verdict: 'accepted',
      businessTypes: ['school'],
      mutationBoundary: 'offline_development_quality_review_only_no_runtime_write',
    },
    governanceWarnings: [
      {
        code: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        details: {
          status: 'review_required',
          reviewReasons: ['candidate_generation_depth_policy_review_required'],
          fallbackPolicyRowCount: 0,
        },
      },
    ],
  })

  assert.equal(review.productionReadinessStatus, 'production_readiness_blocked')
  assert.equal(review.productionReadinessBlockers.includes('runtime_reference_days_evidence_missing'), true)
})

test('keeps fallback-only duration and rhythm assets candidate-reviewable but production-blocked', () => {
  const review = classifyReview({
    businessType: 'school',
    scheduleRowCount: 18,
    profileRowCount: 6,
    profileDurationEvidenceReady: true,
    profileRuntimeSeedEvidenceReady: false,
    profileRuntimeReferenceDaysEvidenceReady: false,
    profilePhaseAnchorsReady: true,
    profileDependencyEvidenceReady: true,
    profileDependencyDatesReady: true,
    durationAssetRowCount: 18,
    runtimeReferenceDaysConsumedCount: 0,
    businessTypeAssetCoverage: [
      {
        businessType: 'school',
        profileScheduleRowCount: 6,
        activeStandardWorkDurationSeedRowCount: 0,
        fallbackStandardWorkDurationSeedRowCount: 6,
        activeT2RhythmTemplateRowCount: 0,
        fallbackT2RhythmTemplateRowCount: 6,
      },
    ],
    dangerChecklistInSchedule: false,
    hasFoundationOrStartupSignal: true,
    hasStructureSignal: true,
    hasMepOrFitoutSignal: true,
    hasAcceptanceSignal: true,
    generationDepthReviewEvidence: {
      status: 'completed',
      reviewerRole: 'construction_project_manager_simulation',
      modelRef: 'offline-model:test',
      reviewedAt: '2026-07-04T10:00:00.000Z',
      verdict: 'accepted',
      businessTypes: ['school'],
      mutationBoundary: 'offline_development_quality_review_only_no_runtime_write',
    },
    governanceWarnings: [
      {
        code: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        details: {
          status: 'review_required',
          reviewReasons: ['candidate_generation_depth_policy_review_required'],
          fallbackPolicyRowCount: 0,
        },
      },
    ],
  })

  assert.equal(review.reviewStatus, 'candidate_master_plan_reviewable')
  assert.deepEqual(review.gaps, [])
  assert.equal(review.productionReadinessStatus, 'production_readiness_blocked')
  assert.equal(review.productionReadinessBlockers.includes('active_standard_duration_seed_evidence_missing'), true)
  assert.equal(review.productionReadinessBlockers.includes('active_t2_rhythm_template_evidence_missing'), true)
  assert.equal(review.productionReadinessBlockers.includes('runtime_reference_days_evidence_missing'), true)
  assert.equal(review.productionReadinessBlockers.includes('candidate_generation_depth_review_required'), false)
})

test('blocks profile samples that still report generation depth fallback rows', () => {
  const summary = {
    scheduleRowCount: 16,
    profileRowCount: 6,
    profileDurationEvidenceReady: true,
    profileRuntimeSeedEvidenceReady: true,
    profilePhaseAnchorsReady: true,
    profileDependencyEvidenceReady: true,
    profileDependencyDatesReady: true,
    dangerChecklistInSchedule: false,
    hasFoundationOrStartupSignal: true,
    hasStructureSignal: true,
    hasMepOrFitoutSignal: true,
    hasAcceptanceSignal: true,
    governanceWarnings: [
      {
        code: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        details: {
          status: 'review_required',
          reviewReasons: ['generation_depth_policy_fallback'],
          fallbackPolicyRowCount: 16,
        },
      },
    ],
  }

  const review = classifyReview(summary)

  assert.equal(review.reviewStatus, 'needs_profile_review')
  assert.equal(review.gaps.includes('generation_depth_policy_fallback'), true)
})

test('blocks profile samples that lack candidate dependency evidence coverage', () => {
  const review = classifyReview({
    scheduleRowCount: 16,
    profileRowCount: 6,
    profileDurationEvidenceReady: true,
    profileRuntimeSeedEvidenceReady: true,
    profilePhaseAnchorsReady: true,
    profileDependencyEvidenceReady: false,
    profileDependencyDatesReady: true,
    dangerChecklistInSchedule: false,
    hasFoundationOrStartupSignal: true,
    hasStructureSignal: true,
    hasMepOrFitoutSignal: true,
    hasAcceptanceSignal: true,
    governanceWarnings: [],
  })

  assert.equal(review.reviewStatus, 'needs_profile_review')
  assert.equal(review.gaps.includes('profile_dependency_evidence_missing'), true)
  assert.equal(review.productionReadinessBlockers.includes('candidate_profile_review_gaps_present'), true)
})

test('blocks profile samples whose internal dependency dates are inconsistent', () => {
  const review = classifyReview({
    scheduleRowCount: 16,
    profileRowCount: 6,
    profileDurationEvidenceReady: true,
    profileRuntimeSeedEvidenceReady: true,
    profilePhaseAnchorsReady: true,
    profileDependencyEvidenceReady: true,
    profileDependencyDatesReady: false,
    dangerChecklistInSchedule: false,
    hasFoundationOrStartupSignal: true,
    hasStructureSignal: true,
    hasMepOrFitoutSignal: true,
    hasAcceptanceSignal: true,
    governanceWarnings: [],
  })

  assert.equal(review.reviewStatus, 'needs_profile_review')
  assert.equal(review.gaps.includes('profile_dependency_date_violation'), true)
  assert.equal(review.productionReadinessBlockers.includes('candidate_profile_review_gaps_present'), true)
})

test('blocks profile samples when duration assets are present but semantically mismatched', () => {
  const semanticGaps = collectDurationAssetSemanticGaps([
    {
      businessType: 'school',
      code: 'BTMP-SCH-06',
      title: '竣工验收与开学移交准备',
      executionPhase: 'acceptance_handover',
      durationAssetStableCode: 'interior_public_finish',
      t2RhythmTemplateId: 't2-school-campus-functional-phasing-rhythm-v1',
    },
    {
      businessType: 'school',
      code: 'BTMP-SCH-01',
      title: '教学楼主体结构与功能区移交',
      executionPhase: 'superstructure_rhythm',
      durationAssetStableCode: 'cast_in_place_formwork',
      t2RhythmTemplateId: 't2-school-teaching-building-structure-rhythm-v1',
    },
    {
      businessType: 'school',
      code: 'BTMP-SCH-P01',
      title: 'School specialist design and procurement release',
      executionPhase: 'startup_site_setup',
      executionNature: 'technical_preparation',
      durationAssetStableCode: 'specialist_design_procurement_release',
      t2RhythmApplicability: 'not_applicable_one_off_activity',
      t2RhythmTemplateId: '',
    },
  ])
  const review = classifyReview({
    scheduleRowCount: 18,
    profileRowCount: 6,
    profileDurationEvidenceReady: true,
    profilePhaseAnchorsReady: true,
    profileDependencyEvidenceReady: true,
    profileDependencyDatesReady: true,
    dangerChecklistInSchedule: false,
    hasFoundationOrStartupSignal: true,
    hasStructureSignal: true,
    hasMepOrFitoutSignal: true,
    hasAcceptanceSignal: true,
    durationAssetSemanticGaps: semanticGaps,
    governanceWarnings: [],
  })

  assert.equal(semanticGaps.length, 1)
  assert.equal(semanticGaps[0].code, 'BTMP-SCH-06')
  assert.equal(semanticGaps[0].gap, 'duration_asset_phase_mismatch')
  assert.equal(review.reviewStatus, 'needs_profile_review')
  assert.equal(review.gaps.includes('duration_asset_semantic_mismatch'), true)
  assert.equal(review.productionReadinessBlockers.includes('candidate_profile_review_gaps_present'), true)
})

test('accepts data-center shell readiness T2 as superstructure rhythm evidence', () => {
  const semanticGaps = collectDurationAssetSemanticGaps([
    {
      businessType: 'data_center',
      code: 'BTMP-DTC-01',
      title: '机房楼主体结构与设备层移交',
      executionPhase: 'superstructure_rhythm',
      durationAssetStableCode: 'cast_in_place_formwork',
      t2RhythmTemplateId: 't2-data-center-shell-room-readiness-rhythm-v1',
    },
  ])

  assert.deepEqual(semanticGaps, [])
})

test('run summary can require production-ready evidence separately from candidate review', () => {
  const report = {
    businessTypeCount: 1,
    allReviewable: true,
    allProductionReady: false,
    productionReadinessBlockers: ['runtime_seed_evidence_missing'],
    seedSmokeImport: {
      status: 'preflight_failed',
      mode: 'preflight_only',
      targetClass: 'local_supabase',
    },
    businessTypes: [
      {
        businessType: 'school',
        reviewStatus: 'candidate_master_plan_reviewable',
        gaps: [],
        productionReadinessStatus: 'production_readiness_blocked',
        productionReadinessBlockers: ['runtime_seed_evidence_missing'],
      },
    ],
  }

  const candidateSummary = buildReportRunSummary(report, {
    outputRoot: 'project-testing/reports/default-master-plan-profiles',
    jsonPath: 'project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.json',
    markdownPath: 'project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.md',
    requireProductionReady: false,
  })
  const productionSummary = buildReportRunSummary(report, {
    outputRoot: 'project-testing/reports/default-master-plan-profiles',
    jsonPath: 'project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.json',
    markdownPath: 'project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.md',
    requireProductionReady: true,
  })

  assert.equal(candidateSummary.status, 'pass')
  assert.equal(candidateSummary.requireProductionReady, false)
  assert.deepEqual(candidateSummary.seedSmokeImport, {
    status: 'preflight_failed',
    mode: 'preflight_only',
    targetClass: 'local_supabase',
  })
  assert.equal(candidateSummary.productionReadinessStatus, 'production_readiness_blocked')
  assert.deepEqual(candidateSummary.productionBlockedBusinessTypes, [
    { businessType: 'school', blockers: ['runtime_seed_evidence_missing'] },
  ])
  assert.equal(productionSummary.status, 'fail')
  assert.equal(productionSummary.requireProductionReady, true)
  assert.deepEqual(productionSummary.productionReadinessBlockers, ['runtime_seed_evidence_missing'])
})

test('recognizes preview dependency evidence that delegates writes to the transactional wizard commit', () => {
  const validRow = {
    predecessorDependencies: [{
      intentCode: 'business_type_profile_phase_anchor',
      dependencyRuleEvidence: {
        source: 'construction_task_dependency_constraint_rule_system',
        productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
        mutationBoundary: 'preview_no_write_wizard_commit_transactional',
      },
    }],
  }
  const stalePolicyRow = {
    predecessorDependencies: [{
      dependencyRuleEvidence: {
        source: 'construction_task_dependency_constraint_rule_system',
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
        mutationBoundary: 'candidate_only_no_task_dependencies_write',
      },
    }],
  }

  assert.equal(hasCandidateDependencyRuleEvidence(validRow), true)
  assert.equal(hasCandidateDependencyRuleEvidence(stalePolicyRow), false)
})

test('allows exactly one dedicated-only profile start row without a predecessor dependency', () => {
  const dependencyEvidence = {
    source: 'construction_task_dependency_constraint_rule_system',
    productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
    mutationBoundary: 'preview_no_write_wizard_commit_transactional',
  }
  const rows = [
    { predecessorDependencies: [] },
    { predecessorDependencies: [{ dependencyRuleEvidence: dependencyEvidence }] },
    { predecessorDependencies: [{ dependencyRuleEvidence: dependencyEvidence }] },
  ]

  assert.deepEqual(evaluateProfileDependencyEvidence(rows, { allowsUnanchoredStart: true }), {
    evidenceRowCount: 2,
    requiredRowCount: 2,
    unanchoredStartRowCount: 1,
    ready: true,
  })
  assert.equal(evaluateProfileDependencyEvidence(rows, { allowsUnanchoredStart: false }).ready, false)
  assert.equal(evaluateProfileDependencyEvidence([
    { predecessorDependencies: [{ dependencyRuleEvidence: dependencyEvidence }] },
    { predecessorDependencies: [] },
    { predecessorDependencies: [{ dependencyRuleEvidence: dependencyEvidence }] },
  ], { allowsUnanchoredStart: true }).ready, false)
})

test('recognizes current system-standard L1 duration provenance without treating it as runtime calibration', () => {
  const systemStandardRow = {
    values: {
      duration_calibration_source: 'standard_work_duration_seed+t2_rhythm_template+system_schedule_rules',
      duration_evidence_source: 'system_standard_default_master_plan',
      duration_evidence_maturity: 'L1',
      duration_review_required: false,
      duration_review_gate: '',
      duration_truth_source: 'system_standard_executable_master_plan',
    },
    durationSuggestion: {
      dataMaturity: 'L1',
      planDurationTruthSource: 'system_standard_executable_master_plan',
      dataUpgradeBlockedBy: [],
    },
  }
  const runtimeClaimRow = {
    values: {
      ...systemStandardRow.values,
      duration_evidence_maturity: 'L2',
    },
    durationSuggestion: systemStandardRow.durationSuggestion,
  }

  assert.equal(hasProfileDurationEvidence(systemStandardRow), true)
  assert.equal(hasProfileDurationEvidence(runtimeClaimRow), false)
})

test('preserves an explicit system-standard no-review decision in audited profile rows', () => {
  const audited = buildAuditableDurationAssetRow({
    values: {
      standard_task_metadata: {},
      duration_review_required: false,
      duration_review_gate: '',
      duration_truth_source: 'system_standard_executable_master_plan',
    },
    predecessorDependencies: [],
  })

  assert.equal(audited.durationReviewRequired, false)
  assert.equal(audited.durationReviewGate, '')
  assert.equal(audited.durationTruthSource, 'system_standard_executable_master_plan')
})

test('preserves generated-row dependency lineage in audited profile rows', () => {
  const audited = buildAuditableDurationAssetRow({
    clientRowId: 'generated:school:BTMP-SCH-02',
    predecessorDependencies: [{
      clientRowId: 'generated:school:BTMP-SCH-01',
      dependencyType: 'SS',
      lagDays: 3,
      intentCode: 'business_type_master_plan_profile_sequence',
    }],
    values: {
      standard_task_metadata: {},
    },
  })

  assert.equal(audited.clientRowId, 'generated:school:BTMP-SCH-02')
  assert.deepEqual(audited.predecessorDependencies, [{
    clientRowId: 'generated:school:BTMP-SCH-01',
    dependencyType: 'SS',
    lagDays: 3,
    intentCode: 'business_type_master_plan_profile_sequence',
  }])
})

test('keeps an absent duration review decision unknown in audited profile rows', () => {
  const audited = buildAuditableDurationAssetRow({
    values: {
      standard_task_metadata: {},
    },
    predecessorDependencies: [],
  })

  assert.equal(audited.durationReviewRequired, null)
})

test('reports a completed seed import distinctly when candidate profile review still has independent gaps', () => {
  const report = {
    businessTypeCount: 1,
    productionReadinessBlockers: ['candidate_profile_review_gaps_present'],
    seedSmokeImport: {
      status: 'imported',
      mode: 'import_active_seed',
      targetClass: 'remote_supabase',
    },
    businessTypes: [
      {
        businessType: 'school',
        reviewStatus: 'needs_profile_review',
        gaps: ['row_count_outside_15_60'],
        productionReadinessStatus: 'production_readiness_blocked',
        productionReadinessBlockers: ['candidate_profile_review_gaps_present'],
      },
    ],
  }

  const summary = buildReportRunSummary(report, {
    outputRoot: 'project-testing/reports/default-master-plan-profiles',
    jsonPath: 'project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.json',
    markdownPath: 'project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.md',
    requireProductionReady: false,
  })

  assert.equal(summary.status, 'seed_import_completed_with_candidate_review_gaps')
  assert.equal(summary.executionSucceeded, true)
  assert.deepEqual(summary.failedBusinessTypes, [
    { businessType: 'school', gaps: ['row_count_outside_15_60'] },
  ])
})

test('report args accept real project and company context for runtime seed evidence', () => {
  const parsed = parseArgs([
    '--project-id',
    '11111111-1111-4111-8111-111111111111',
    '--company-id',
    '22222222-2222-4222-8222-222222222222',
    '--import-active-standard-duration-seed-smoke',
    '--seed-smoke-user-id',
    'pm-reviewer-1',
    '--duration-calibration-evidence',
    'project-testing/reports/default-master-plan-production-readiness/duration-calibration-evidence.json',
    '--require-production-ready',
  ])

  assert.equal(parsed.projectId, '11111111-1111-4111-8111-111111111111')
  assert.equal(parsed.companyId, '22222222-2222-4222-8222-222222222222')
  assert.equal(parsed.importActiveStandardDurationSeedSmoke, true)
  assert.equal(parsed.preflightStandardDurationSeedSmoke, false)
  assert.equal(parsed.seedSmokeUserId, 'pm-reviewer-1')
  assert.equal(
    parsed.durationCalibrationEvidencePath,
    path.resolve('project-testing/reports/default-master-plan-production-readiness/duration-calibration-evidence.json'),
  )
  assert.equal(parsed.requireProductionReady, true)
})

test('report args can request governed duration asset seed smoke for standard and T2 seeds', () => {
  const parsed = parseArgs([
    '--import-active-duration-asset-seeds-smoke',
    '--seed-smoke-user-id',
    'pm-reviewer-1',
  ])

  assert.equal(parsed.importActiveStandardDurationSeedSmoke, true)
  assert.equal(parsed.importActiveT2RhythmTemplateSeedSmoke, true)
  assert.deepEqual(parsed.durationAssetSeedSmokeSeedTypes, [
    'standard_work_duration',
    't2_division_rhythm_template',
  ])
  assert.equal(parsed.seedSmokeUserId, 'pm-reviewer-1')
})

test('report args can restrict generation to selected business types for focused evidence replay', () => {
  const parsed = parseArgs([
    '--business-type',
    'school',
    '--business-type',
    'hospital,data_center',
  ])

  assert.deepEqual(parsed.businessTypes, ['school', 'hospital', 'data_center'])
})

test('reads runtime-calibrated duration evidence as no-write generation input', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-duration-evidence-'))
  const evidencePath = path.join(tempDir, 'duration-calibration-evidence.json')
  fs.writeFileSync(evidencePath, `${JSON.stringify({
    status: 'runtime_calibrated',
    evidenceLevel: 'runtime_calibrated_l2',
    runtimeReferenceDays: [
      {
        stableCode: 'BTMP-SCH-01',
        p50Days: 160,
        p80Days: 176,
        sampleCount: 3,
        source: 'accepted_real_project_outcome',
        sourceSampleIds: ['sample-1', 'sample-2', 'sample-3'],
      },
    ],
  }, null, 2)}\n`, 'utf8')

  const input = await readRuntimeCalibrationEvidenceInput(evidencePath)

  assert.deepEqual(input, {
    status: 'runtime_calibrated',
    evidenceLevel: 'runtime_calibrated_l2',
    runtimeReferenceDays: [
      {
        stableCode: 'BTMP-SCH-01',
        p50Days: 160,
        p80Days: 176,
        sampleCount: 3,
        source: 'accepted_real_project_outcome',
        sourceSampleIds: ['sample-1', 'sample-2', 'sample-3'],
      },
    ],
    mutationBoundary: {
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesAlgorithmSeedRecords: false,
      writesAlgorithmSeedVersions: false,
    },
  })
})

test('reads runtime calibration evidence when JSON file has UTF-8 BOM', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-duration-evidence-bom-'))
  const evidencePath = path.join(tempDir, 'duration-calibration-evidence.json')
  fs.writeFileSync(evidencePath, `\ufeff${JSON.stringify({
    status: 'runtime_calibrated',
    evidenceLevel: 'runtime_calibrated_l2',
    runtimeReferenceDays: [
      {
        stableCode: 'BTMP-SCH-01',
        p50Days: 160,
      },
    ],
  })}\n`, 'utf8')

  const input = await readRuntimeCalibrationEvidenceInput(evidencePath)

  assert.equal(input.status, 'runtime_calibrated')
  assert.equal(input.runtimeReferenceDays[0].stableCode, 'BTMP-SCH-01')
})

test('builds profile runtime reference-day gap rows without production writes', () => {
  const gaps = buildRuntimeReferenceDayGapRows([
    {
      businessType: 'school',
      code: 'BTMP-SCH-01',
      title: '教学楼主体结构与功能区移交',
      executionPhase: 'superstructure_rhythm',
      executionLane: 'teaching_building',
      durationAssetStableCode: 'cast_in_place_formwork',
      selectedDurationDays: 100,
      t2RhythmTemplateId: 't2-school-teaching-building-structure-rhythm-v1',
      selectionRule: 'runtime_calibrated_reference_days_p50_candidate_l2',
      runtimeReferenceDaysConsumed: true,
    },
    {
      businessType: 'hotel',
      code: 'BTMP-HTL-02',
      title: '客房层批量精装与卫浴安装',
      executionPhase: 'interior_fitout_terminal',
      executionLane: 'guestroom_fitout',
      durationAssetStableCode: 'interior_unit_finish',
      selectedDurationDays: 150,
      t2RhythmTemplateId: 't2-commercial-podium-tower-fitout-interface-rhythm-v1',
      selectionRule: 'project_scale_productivity_or_formula_asset_backed_candidate_l1',
      runtimeReferenceDaysConsumed: false,
    },
  ], { rowGroup: 'profile' })

  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].rowGroup, 'profile')
  assert.equal(gaps[0].businessType, 'hotel')
  assert.equal(gaps[0].requiredRuntimeReferenceStableCode, 'BTMP-HTL-02')
  assert.equal(gaps[0].durationAssetStableCode, 'interior_unit_finish')
  assert.match(gaps[0].sampleCollectionRequirement, /BTMP-HTL-02/)
  assert.equal(gaps[0].mutationBoundary, 'candidate_gap_planning_only_no_business_fact_write')
})

test('standard duration seed smoke preflight is read-only and does not require import unlock', () => {
  const args = parseArgs(['--preflight-standard-duration-seed-smoke'])
  const plan = buildStandardDurationSeedSmokeImportPlan(args, {
    SUPABASE_URL: 'http://127.0.0.1:54321',
  })

  assert.equal(args.preflightStandardDurationSeedSmoke, true)
  assert.equal(plan.enabled, true)
  assert.equal(plan.mode, 'preflight_only')
  assert.equal(plan.allowed, true)
  assert.equal(plan.targetClass, 'local_supabase')
  assert.equal(plan.preflightOperation, 'previewAlgorithmSeedImport:standard_work_duration')
  assert.deepEqual(plan.mutationBoundary, {
    writesAlgorithmSeedVersions: false,
    writesAlgorithmSeedRecords: false,
    writesAlgorithmSeedImportLogs: false,
    writesTasks: false,
    writesTaskDependencies: false,
    writesRuntimePublication: false,
  })
})

test('duration asset seed smoke preflight covers standard and T2 seeds without import unlock', () => {
  const args = parseArgs(['--preflight-duration-asset-seeds-smoke'])
  const plan = buildStandardDurationSeedSmokeImportPlan(args, {
    SUPABASE_URL: 'http://127.0.0.1:54321',
  })

  assert.equal(args.preflightStandardDurationSeedSmoke, true)
  assert.equal(args.preflightT2RhythmTemplateSeedSmoke, true)
  assert.deepEqual(args.durationAssetSeedSmokeSeedTypes, [
    'standard_work_duration',
    't2_division_rhythm_template',
  ])
  assert.equal(plan.enabled, true)
  assert.equal(plan.mode, 'preflight_only')
  assert.equal(plan.allowed, true)
  assert.deepEqual(plan.seedTypes, [
    'standard_work_duration',
    't2_division_rhythm_template',
  ])
  assert.deepEqual(plan.preflightOperations, [
    'previewAlgorithmSeedImport:standard_work_duration',
    'previewAlgorithmSeedImport:t2_division_rhythm_template',
  ])
  assert.deepEqual(plan.mutationBoundary, {
    writesAlgorithmSeedVersions: false,
    writesAlgorithmSeedRecords: false,
    writesAlgorithmSeedImportLogs: false,
    writesTasks: false,
    writesTaskDependencies: false,
    writesRuntimePublication: false,
  })
})

test('standard duration seed smoke preflight errors are structured for diagnosis', () => {
  assert.deepEqual(normalizeSeedSmokePreflightError({
    code: '42P01',
    message: 'relation "algorithm_seed_versions" does not exist',
    details: { table: 'algorithm_seed_versions' },
  }), {
    code: '42P01',
    message: 'relation "algorithm_seed_versions" does not exist',
    details: { table: 'algorithm_seed_versions' },
  })

  assert.deepEqual(normalizeSeedSmokePreflightError({ reason: 'connection refused' }), {
    code: null,
    message: '{"reason":"connection refused"}',
    details: { reason: 'connection refused' },
  })
})

test('standard duration seed smoke import is blocked unless explicitly unlocked', () => {
  const args = parseArgs(['--import-active-standard-duration-seed-smoke'])

  const blocked = buildStandardDurationSeedSmokeImportPlan(args, {})
  const allowed = buildStandardDurationSeedSmokeImportPlan(args, {
    WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT: '1',
    SUPABASE_URL: 'http://127.0.0.1:54321',
  })
  const remoteBlocked = buildStandardDurationSeedSmokeImportPlan(args, {
    WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT: '1',
    SUPABASE_URL: 'https://example.supabase.co',
  })
  const remoteAllowed = buildStandardDurationSeedSmokeImportPlan(args, {
    WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT: '1',
    WORKBUDDY_ALLOW_REMOTE_STANDARD_DURATION_SEED_SMOKE_IMPORT: '1',
    SUPABASE_URL: 'https://example.supabase.co',
  })

  assert.equal(blocked.enabled, true)
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.blockedReason, 'standard_duration_seed_smoke_env_unlock_required')
  assert.equal(blocked.requiredEnv, 'WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT=1')
  assert.equal(allowed.enabled, true)
  assert.equal(allowed.allowed, true)
  assert.equal(allowed.targetClass, 'local_supabase')
  assert.equal(allowed.seedType, 'standard_work_duration')
  assert.equal(allowed.preflightOperation, 'previewAlgorithmSeedImport:standard_work_duration')
  assert.deepEqual(allowed.mutationBoundary, {
    writesAlgorithmSeedVersions: true,
    writesAlgorithmSeedRecords: true,
    writesAlgorithmSeedImportLogs: true,
    writesTasks: false,
    writesTaskDependencies: false,
    writesRuntimePublication: false,
  })
  assert.equal(remoteBlocked.allowed, false)
  assert.equal(remoteBlocked.targetClass, 'remote_supabase')
  assert.equal(remoteBlocked.blockedReason, 'remote_standard_duration_seed_smoke_env_unlock_required')
  assert.equal(remoteBlocked.requiredEnv, 'WORKBUDDY_ALLOW_REMOTE_STANDARD_DURATION_SEED_SMOKE_IMPORT=1')
  assert.equal(remoteAllowed.allowed, true)
  assert.equal(remoteAllowed.targetClass, 'remote_supabase')
})

test('duration asset seed smoke import requires duration asset unlock and covers standard plus T2 seeds', () => {
  const args = parseArgs(['--import-active-duration-asset-seeds-smoke'])

  const blocked = buildStandardDurationSeedSmokeImportPlan(args, {})
  const allowed = buildStandardDurationSeedSmokeImportPlan(args, {
    WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT: '1',
    SUPABASE_URL: 'http://127.0.0.1:54321',
  })

  assert.equal(blocked.enabled, true)
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.requiredEnv, 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT=1')
  assert.equal(blocked.blockedReason, 'duration_asset_seed_smoke_env_unlock_required')
  assert.deepEqual(allowed.seedTypes, [
    'standard_work_duration',
    't2_division_rhythm_template',
  ])
  assert.deepEqual(allowed.preflightOperations, [
    'previewAlgorithmSeedImport:standard_work_duration',
    'previewAlgorithmSeedImport:t2_division_rhythm_template',
  ])
  assert.equal(allowed.mode, 'import_active_seed')
  assert.equal(allowed.allowed, true)
  assert.equal(allowed.requiredEnv, null)
  assert.equal(allowed.blockedReason, null)
  assert.deepEqual(allowed.mutationBoundary, {
    writesAlgorithmSeedVersions: true,
    writesAlgorithmSeedRecords: true,
    writesAlgorithmSeedImportLogs: true,
    writesTasks: false,
    writesTaskDependencies: false,
    writesRuntimePublication: false,
  })
})

test('profile report identifies profile rows from lineage instead of public source_type', () => {
  const source = fs.readFileSync(REPORT_SCRIPT, 'utf8')

  assert.match(source, /function isBusinessTypeProfileRow/)
  assert.match(source, /readProfileSourceType\(row\) === 'business_type_master_plan_profile_v1'/)
  assert.doesNotMatch(source, /profileRowsRaw\s*=\s*scheduleRows\.filter\(\(row\)\s*=>\s*row\.values\.source_type === 'business_type_master_plan_profile_v1'/)
  assert.match(source, /source_type` 统一为 `managed_frontier_default_master_plan`/)
})

test('profile report direct node entrypoint bootstraps through tsx for TypeScript service imports', () => {
  const source = fs.readFileSync(REPORT_SCRIPT, 'utf8')

  assert.match(source, /function isTsxRuntime/)
  assert.match(source, /function runViaTsxAndExit/)
  assert.match(source, /WORKBUDDY_PROFILE_REPORT_TSX_BOOTSTRAPPED/)
  assert.match(source, /WINDOWS_LOCAL_TSX_COMMAND = path\.join\(REPO_ROOT, 'node_modules', '\.bin', 'tsx\.cmd'\)/)
  assert.match(source, /LOCAL_TSX_CLI_MODULE = path\.join\(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli\.mjs'\)/)
  assert.match(source, /spawnSync\(process\.execPath/)
})

test('profile report exposes auditable duration asset calculation fields', () => {
  const source = fs.readFileSync(REPORT_SCRIPT, 'utf8')

  assert.match(source, /function readDurationAssetCalculation/)
  assert.match(source, /seedResolverSourceCounts/)
  assert.match(source, /profileRuntimeSeedEvidenceReady/)
  assert.match(source, /selectedDurationDays/)
  assert.match(source, /standardWorkDurationSeedResolverSource/)
  assert.match(source, /standardWorkDurationSeedResolverVersionId/)
  assert.match(source, /standardWorkDurationSeedP50Days/)
  assert.match(source, /t2RhythmTemplateResolverSource/)
  assert.match(source, /t2RhythmTemplateResolverVersionId/)
  assert.match(source, /t2RhythmTemplateP50Days/)
  assert.match(source, /business_type_base_master_plan_profile_v1/)
  assert.match(source, /baseRuntimeReferenceDaysConsumedCount/)
  assert.match(source, /profileRuntimeReferenceDaysConsumedCount/)
  assert.match(source, /runtimeReferenceDaysConsumedCount/)
  assert.match(source, /runtimeReferenceDaysSource/)
  assert.match(source, /profileRuntimeReferenceDayGapRows/)
  assert.match(source, /profileMissingRuntimeReferenceStableCodes/)
  assert.match(source, /profile reference-day 采样缺口/)
  assert.match(source, /runtime reference days/)
  assert.match(source, /quantityProxySource/)
  assert.match(source, /quantityProxyValue/)
  assert.match(source, /quantityProxyUnit/)
  assert.match(source, /productivityDerivedDurationDays/)
  assert.match(source, /realPlanSkeletonDurationDays/)
  assert.match(source, /realPlanSkeletonFloorApplied/)
  assert.match(source, /maxNonSkeletonAssetDays/)
  assert.match(source, /selectionRule/)
  assert.match(source, /seed 来源分布/)
  assert.match(source, /运行 seed/)
  assert.match(source, /seed 来源/)
  assert.match(source, /seed P50/)
  assert.match(source, /T2 来源/)
  assert.match(source, /T2 P50/)
  assert.match(source, /规模代理/)
  assert.match(source, /生产率推导/)
  assert.match(source, /真实骨架/)
  assert.match(source, /选择规则/)
})

test('profile report preserves generator-level duration asset utilization summary', () => {
  const source = fs.readFileSync(REPORT_SCRIPT, 'utf8')

  assert.match(source, /durationAssetUtilizationSummary/)
  assert.match(source, /generatorDurationAssetUtilizationSummary/)
  assert.match(source, /工期资产利用总账/)
  assert.match(source, /standardWorkDurationSeedRowCount/)
  assert.match(source, /dependencyAssetConsumedRowCount/)
})

test('profile report formats generator-level runtime, calendar, seasonal, and risk summary fields', async () => {
  const module = await import('./generate-default-master-plan-profile-report.mjs')
  assert.equal(typeof module.formatGeneratorDurationAssetUtilizationSummary, 'function')

  const formatted = module.formatGeneratorDurationAssetUtilizationSummary({
    scheduleRowCount: 18,
    runtimeReferenceDaysRowCount: 4,
    runtimeReferenceDaysConsumedRowCount: 4,
    rowsMissingRuntimeReferenceDaysCount: 14,
    dependencyTimingAssetConsumedRowCount: 17,
    processSeasonalDurationAssetRowCount: 2,
    constructionCalendarRowCount: 18,
    durationRiskRangeRowCount: 18,
    durationRiskP20MinDays: 10,
    durationRiskP50MedianDays: 28,
    durationRiskP80MaxDays: 56,
  })

  assert.match(formatted, /runtimeReferenceDaysRowCount=4/)
  assert.match(formatted, /runtimeReferenceDaysConsumedRowCount=4/)
  assert.match(formatted, /rowsMissingRuntimeReferenceDaysCount=14/)
  assert.match(formatted, /dependencyTimingAssetConsumedRowCount=17/)
  assert.match(formatted, /processSeasonalDurationAssetRowCount=2/)
  assert.match(formatted, /constructionCalendarRowCount=18/)
  assert.match(formatted, /durationRiskRangeRowCount=18/)
  assert.match(formatted, /durationRiskP20MinDays=10/)
  assert.match(formatted, /durationRiskP50MedianDays=28/)
  assert.match(formatted, /durationRiskP80MaxDays=56/)
})

test('candidate critical path evidence computes total float without production writes', () => {
  const rows = [
    candidateCpmRow({
      clientRowId: 'row-a',
      code: 'A',
      title: 'Start activity',
      start: '2026-01-01',
      end: '2026-01-05',
    }),
    candidateCpmRow({
      clientRowId: 'row-b',
      code: 'B',
      title: 'Critical successor',
      start: '2026-01-06',
      end: '2026-01-10',
      predecessors: ['row-a'],
    }),
    candidateCpmRow({
      clientRowId: 'row-c',
      code: 'C',
      title: 'Parallel non-critical successor',
      start: '2026-01-06',
      end: '2026-01-07',
      predecessors: ['row-a'],
    }),
  ]

  const evidence = buildCandidateCriticalPathEvidence(rows)

  assert.equal(evidence.status, 'candidate_cpm_evidence_ready')
  assert.equal(evidence.scheduleRowCount, 3)
  assert.equal(evidence.dependencyEdgeCount, 2)
  assert.equal(evidence.projectDurationDays, 10)
  assert.equal(evidence.floatCalculatedRowCount, 3)
  assert.equal(evidence.criticalPathRowCount, 2)
  assert.deepEqual(evidence.mutationBoundary, {
    writesTasks: false,
    writesTaskDependencies: false,
    writesRuntimePublication: false,
    writesProductionTables: false,
  })

  const rowByCode = new Map(evidence.rows.map((row) => [row.code, row]))
  assert.equal(rowByCode.get('A').criticalPathCandidate, true)
  assert.equal(rowByCode.get('A').totalFloatDays, 0)
  assert.equal(rowByCode.get('B').criticalPathCandidate, true)
  assert.equal(rowByCode.get('B').totalFloatDays, 0)
  assert.equal(rowByCode.get('C').criticalPathCandidate, false)
  assert.equal(rowByCode.get('C').totalFloatDays, 3)
})
test('profile report writes auditable row-level duration risk ranges from generated rows', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-profile-risk-ranges-'))

  try {
    const result = spawnSync(process.execPath, [
      REPORT_SCRIPT,
      '--output-root',
      root,
      '--business-type',
      'school',
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
      timeout: 180_000,
      env: {
        ...process.env,
        LOG_LEVEL: 'error',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_ANON_KEY: 'local-default-master-plan-report-key',
        SUPABASE_SERVICE_KEY: 'local-default-master-plan-report-key',
      },
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)

    const report = JSON.parse(fs.readFileSync(path.join(root, 'default-master-plan-profile-samples.json'), 'utf8'))
    const school = report.businessTypes.find((item) => item.businessType === 'school')
    assert.ok(school, 'school profile should be generated')
    assert.deepEqual(school.constructionCalendar, {
      basis: 'calendar_day',
      windows: [],
    })
    const rows = [...school.baseRows, ...school.profileRows]
    assert.ok(rows.length > 0, 'profile rows should exist')
    assert.equal(school.candidateCriticalPathEvidence.status, 'candidate_cpm_evidence_ready')
    assert.equal(school.candidateCriticalPathEvidence.mutationBoundary.writesTasks, false)
    assert.equal(school.candidateCriticalPathEvidence.mutationBoundary.writesTaskDependencies, false)
    assert.equal(school.candidateCriticalPathEvidence.mutationBoundary.writesRuntimePublication, false)
    assert.equal(school.candidateCriticalPathEvidence.floatCalculatedRowCount, school.scheduleRowCount)
    assert.equal(school.candidateCriticalPathEvidence.criticalPathRowCount > 0, true)

    for (const row of rows) {
      assert.equal(Number.isFinite(Number(row.totalFloatDays)), true, `${row.code} should expose CPM total float`)
      assert.equal(typeof row.criticalPathCandidate, 'boolean', `${row.code} should expose CPM critical-path candidacy`)
      assert.equal(Number(row.riskP20DurationDays) > 0, true, `${row.code} should expose risk P20`)
      assert.equal(Number(row.riskP50DurationDays) > 0, true, `${row.code} should expose risk P50`)
      assert.equal(Number(row.riskP80DurationDays) > 0, true, `${row.code} should expose risk P80`)
      assert.equal(Number(row.riskP20DurationDays) <= Number(row.riskP50DurationDays), true, `${row.code} risk P20 must be <= P50`)
      assert.equal(Number(row.riskP50DurationDays) <= Number(row.riskP80DurationDays), true, `${row.code} risk P50 must be <= P80`)
      assert.deepEqual(row.durationRiskRange, {
        p20Days: row.riskP20DurationDays,
        p50Days: row.riskP50DurationDays,
        p80Days: row.riskP80DurationDays,
        uncertaintyBandDays: row.riskP80DurationDays - row.riskP20DurationDays,
      })
    }

    const markdown = fs.readFileSync(path.join(root, 'default-master-plan-profile-samples.md'), 'utf8')
    assert.match(markdown, /P20/)
    assert.match(markdown, /P80/)
    assert.match(markdown, /candidateCriticalPathEvidence/)
    assert.match(markdown, /totalFloat/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('profile report consumes process-seasonal duration assets from generated school probe rows', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-profile-process-seasonal-'))

  try {
    const result = spawnSync(process.execPath, [
      REPORT_SCRIPT,
      '--output-root',
      root,
      '--business-type',
      'school',
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
      env: {
        ...process.env,
        LOG_LEVEL: 'error',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_ANON_KEY: 'local-default-master-plan-report-key',
        SUPABASE_SERVICE_KEY: 'local-default-master-plan-report-key',
      },
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)

    const report = JSON.parse(fs.readFileSync(path.join(root, 'default-master-plan-profile-samples.json'), 'utf8'))
    const school = report.businessTypes.find((item) => item.businessType === 'school')
    assert.ok(school, 'school profile should be generated')
    assert.equal(
      Number(school.generatorDurationAssetUtilizationSummary.processSeasonalDurationAssetRowCount) > 0,
      true,
      'school profile should expose rows adjusted by process-seasonal duration assets',
    )
    const adjustedRows = [...school.baseRows, ...school.profileRows]
      .filter((row) => row.processSeasonalDurationAssetConsumed === true)
    assert.equal(adjustedRows.length > 0, true, 'auditable rows should expose process-seasonal consumption')
    assert.equal(
      adjustedRows.some((row) => String(row.selectionRule).includes('process_seasonal_sensitivity')),
      true,
      'selection rule should identify process-seasonal sensitivity as an input',
    )

    const markdown = fs.readFileSync(path.join(root, 'default-master-plan-profile-samples.md'), 'utf8')
    assert.match(markdown, /processSeasonalDurationAssetRowCount=[1-9]/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('profile report exposes feature-triggered acceptance handover rows as dated schedule evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbuddy-profile-acceptance-'))

  try {
    const result = spawnSync(process.execPath, [
      REPORT_SCRIPT,
      '--output-root',
      root,
      '--business-type',
      'school',
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8',
      env: {
        ...process.env,
        LOG_LEVEL: 'error',
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_ANON_KEY: 'local-default-master-plan-report-key',
        SUPABASE_SERVICE_KEY: 'local-default-master-plan-report-key',
      },
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)

    const report = JSON.parse(fs.readFileSync(path.join(root, 'default-master-plan-profile-samples.json'), 'utf8'))
    const school = report.businessTypes.find((item) => item.businessType === 'school')
    assert.ok(school, 'school profile should be generated')
    assert.equal(Number(school.featureTriggeredAcceptanceScheduleRowCount) > 0, true)
    assert.equal(Number(school.generatorDurationAssetUtilizationSummary.featureTriggeredAcceptanceScheduleRowCount) > 0, true)

    const rows = [...school.baseRows, ...school.profileRows]
    const acceptanceRows = rows.filter((row) => row.featureTriggeredAcceptanceScheduleRow === true)
    assert.equal(acceptanceRows.length > 0, true, 'acceptance handover rows should be explicitly flagged')
    for (const row of acceptanceRows) {
      assert.match(row.startDate, /^\d{4}-\d{2}-\d{2}$/)
      assert.match(row.endDate, /^\d{4}-\d{2}-\d{2}$/)
      assert.equal(Number(row.durationDays) > 0, true)
      assert.equal(['commissioning', 'acceptance_handover'].includes(row.executionPhase), true)
      assert.match(row.acceptanceScheduleEvidence, /feature_triggered_acceptance_schedule_row/)
    }

    const markdown = fs.readFileSync(path.join(root, 'default-master-plan-profile-samples.md'), 'utf8')
    assert.match(markdown, /featureTriggeredAcceptanceScheduleRowCount=[1-9]/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('profile report source backfills runtime reference-day summary counts from audited rows for markdown totals', () => {
  const source = fs.readFileSync(REPORT_SCRIPT, 'utf8')

  assert.match(source, /buildGeneratorDurationAssetUtilizationSummaryForReport/)
  assert.match(source, /runtimeReferenceDaysConsumedRowCount/)
  assert.match(source, /rowsMissingRuntimeReferenceDaysCount/)
  assert.match(source, /baseRuntimeReferenceDayGapRows\.length \+ profileRuntimeReferenceDayGapRows\.length/)
})

test('profile report summarizes business-type specialty duration asset coverage', () => {
  const source = fs.readFileSync(REPORT_SCRIPT, 'utf8')

  assert.match(source, /function summarizeBusinessTypeSpecialtyAssetCoverage/)
  assert.match(source, /businessTypeSpecialtyAssetCoverage/)
  assert.match(source, /businessTypeSpecialtyDurationAssetRowCount/)
  assert.match(source, /businessTypeSpecificT2RhythmTemplateRowCount/)
  assert.match(source, /businessTypeRowsMissingSpecialtyDurationAssetCount/)
  assert.match(source, /businessTypeRowsMissingSpecificT2RhythmTemplateCount/)
  assert.match(source, /业态专属资产覆盖/)
})

test('profile report exposes per-business-type active and fallback duration asset coverage', () => {
  const source = fs.readFileSync(REPORT_SCRIPT, 'utf8')

  assert.match(source, /function summarizeBusinessTypeAssetCoverage/)
  assert.match(source, /function formatBusinessTypeAssetCoverageList/)
  assert.match(source, /businessTypeAssetCoverage/)
  assert.match(source, /activeStandardWorkDurationSeedRowCount/)
  assert.match(source, /fallbackStandardWorkDurationSeedRowCount/)
  assert.match(source, /activeT2RhythmTemplateRowCount/)
  assert.match(source, /fallbackT2RhythmTemplateRowCount/)
  assert.match(source, /业态资产覆盖明细/)
})

test('profile report exposes candidate dependency rule evidence without production writes', () => {
  const source = fs.readFileSync(REPORT_SCRIPT, 'utf8')

  assert.match(source, /function readDependencyRuleEvidence/)
  assert.match(source, /dependencyRuleEvidence/)
  assert.match(source, /dependencyAssetConsumed/)
  assert.match(source, /dependencyTimingAssetConsumed/)
  assert.match(source, /processSeasonalDurationAssetConsumed/)
  assert.match(source, /calendarBasis/)
  assert.match(source, /constructionCalendarWindowCount/)
  assert.match(source, /dependencyRuleLayerStack/)
  assert.match(source, /dependencyProductionWritePolicy/)
  assert.match(source, /五层依赖/)
  assert.match(source, /写入边界/)
  assert.match(source, /preview_no_write_wizard_commit_transactional/)
  assert.match(source, /wizard_commit_transactional_tasks_and_dependencies/)
})

function candidateCpmRow({ clientRowId, code, title, start, end, predecessors = [] }) {
  return {
    clientRowId,
    values: {
      standard_work_code: code,
      template_node_id: code,
      title,
      planned_start_date: start,
      planned_end_date: end,
    },
    predecessorDependencies: predecessors.map((predecessorId) => ({
      clientRowId: predecessorId,
      dependencyType: 'FS',
      lagDays: 0,
      intentCode: 'candidate_test_dependency',
    })),
  }
}
