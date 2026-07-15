import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  buildDefaultMasterPlanReviewPackage,
  parseArgs,
} from './build-default-master-plan-review-package.mjs'
test('parseArgs accepts concrete PM reviewer and review notes', () => {
  const options = parseArgs([
    '--reviewed-by',
    '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
    '--review-notes',
    'PM reviewed current school candidate baseline only.',
  ])

  assert.equal(options.reviewedBy, '9e4a5570-0032-43bd-8f17-0bc415a1eb70')
  assert.equal(
    options.reviewNotes,
    'PM reviewed current school candidate baseline only.',
  )
})


test('parseArgs accepts candidate refresh package path', () => {
  const refreshPackage = path.join('tmp', 'candidate-refresh-package.json')

  const options = parseArgs([
    '--candidate-refresh-package',
    refreshPackage,
  ])

  assert.equal(options.candidateRefreshPackage, path.resolve(refreshPackage))
})

test('builds a no-write PM review package from a candidate baseline export', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-package-'))
  const candidateBaseline = path.join(root, 'candidate-baseline.json')
  const output = path.join(root, 'pm-review-package.json')

  await writeJson(candidateBaseline, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    rowCount: 2,
    rows: [
      {
        index: 1,
        id: 'item-1',
        title: '施工准备与现场临设完成',
        standardWorkCode: 'BTMP-BASE-01',
        plannedStart: '2026-07-01',
        plannedEnd: '2026-07-30',
        smartReferenceDays: 30,
        candidateOnly: true,
      },
      {
        index: 2,
        id: 'item-2',
        title: '基坑支护降水与土方开挖',
        standardWorkCode: 'BTMP-BASE-02',
        plannedStart: '2026-08-01',
        plannedEnd: '2026-09-24',
        smartReferenceDays: 55,
        candidateOnly: true,
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanReviewPackage({
      candidateBaseline,
      output,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      reviewedByPlaceholder: '<human-project-manager-user-id>',
      now: new Date('2026-07-02T05:00:00.000Z'),
    })

    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-review-package/v1')
    assert.equal(report.status, 'ready_for_human_pm_review')
    assert.equal(report.productionReady, false)
    assert.equal(report.baselineId, 'baseline-1')
    assert.equal(report.projectId, 'project-1')
    assert.equal(report.reviewedItemCount, 2)
    assert.deepEqual(report.reviewedItemIds, ['item-1', 'item-2'])
    assert.equal(report.requiredAcknowledgedBlockers.length, 5)
    assert.match(report.recordReviewCommand, /evidence:default-master-plan:record-review/)
    assert.match(report.recordReviewCommand, /--baseline-id baseline-1/)
    assert.match(report.recordReviewCommand, /--reviewed-by <human-project-manager-user-id>/)
    assert.match(report.recordReviewCommand, /--review-notes <real-review-notes>/)
    assert.match(report.recordReviewCommand, /--review-package /)
    assert.equal(report.recordReviewCommand.includes(output), true)
    assert.equal(report.reviewNotesTemplate.includes('Human PM reviewed 2 candidate default master-plan rows'), true)
    assert.equal(report.mutationBoundary.writesChangeLogs, false)
    assert.equal(report.mutationBoundary.writesTasks, false)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.rows[0].title, '施工准备与现场临设完成')
    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /PM Review Package/)
    assert.match(markdown, /BTMP-BASE-02/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds record-review command with concrete PM reviewer and review notes when provided', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-package-real-reviewer-'))
  const candidateBaseline = path.join(root, 'candidate-baseline.json')
  const output = path.join(root, 'pm-review-package.json')

  await writeJson(candidateBaseline, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    status: 'draft',
    productionCandidateEligible: true,
    blockers: [],
    rowCount: 1,
    rows: [
      {
        index: 1,
        id: 'item-1',
        title: 'School teaching building structure handoff',
        standardWorkCode: 'BTMP-SCH-01',
        plannedStart: '2026-09-29',
        plannedEnd: '2027-04-06',
        smartReferenceDays: 190,
        candidateOnly: true,
        source: 'managed_frontier_default_master_plan',
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanReviewPackage({
      candidateBaseline,
      output,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      reviewedBy: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      reviewNotes: 'PM reviewed current school candidate baseline only; this is not production-ready.',
      now: new Date('2026-07-05T11:00:00.000Z'),
    })

    assert.equal(report.status, 'ready_for_human_pm_review')
    assert.match(report.recordReviewCommand, /--reviewed-by 9e4a5570-0032-43bd-8f17-0bc415a1eb70/)
    assert.match(report.recordReviewCommand, /--review-notes "/)
    assert.match(report.recordReviewCommand, /PM reviewed current school candidate baseline/)
    assert.equal(report.recordReviewCommand.includes('<human-project-manager-user-id>'), false)
    assert.equal(report.recordReviewCommand.includes('<real-review-notes>'), false)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.recordReviewCommand, report.recordReviewCommand)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks concrete PM review notes when the stated row count does not match the current candidate package', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-package-row-count-mismatch-'))
  const candidateBaseline = path.join(root, 'candidate-baseline.json')
  const output = path.join(root, 'pm-review-package.json')

  await writeJson(candidateBaseline, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    status: 'draft',
    productionCandidateEligible: true,
    blockers: [],
    rowCount: 2,
    rows: [
      {
        index: 1,
        id: 'item-1',
        title: 'School teaching building structure handoff',
        standardWorkCode: 'BTMP-SCH-01',
        plannedStart: '2026-09-29',
        plannedEnd: '2027-04-06',
        smartReferenceDays: 190,
        candidateOnly: true,
        source: 'managed_frontier_default_master_plan',
      },
      {
        index: 2,
        id: 'item-2',
        title: 'School commissioning handover',
        standardWorkCode: 'BTMP-SCH-06',
        plannedStart: '2027-09-19',
        plannedEnd: '2027-11-05',
        smartReferenceDays: 48,
        candidateOnly: true,
        source: 'managed_frontier_default_master_plan',
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanReviewPackage({
      candidateBaseline,
      output,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      reviewedBy: '郑俊红',
      reviewNotes: '已复核学校项目默认主计划候选基线。候选 16 行 WBS 基本符合当前学校项目主计划候选使用要求。',
      now: new Date('2026-07-05T11:30:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.reviewedItemCount, 0)
    assert.equal(report.recordReviewCommand, null)
    assert.match(report.blockers.join('\n'), /review_notes_reviewed_item_count_mismatch/)
    assert.deepEqual(report.reviewNotesQuality, {
      status: 'blocked_item_count_mismatch',
      statedItemCount: 16,
      actualReviewedItemCount: 2,
      suggestedReviewNotes: '已复核学校项目默认主计划候选基线。候选 2 行 WBS 基本符合当前学校项目主计划候选使用要求。',
    })

    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Review Notes Quality/)
    assert.match(markdown, /blocked_item_count_mismatch/)
    assert.match(markdown, /候选 2 行 WBS/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('discovers current candidate baseline and refresh package from the output directory when paths are omitted', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-package-discovery-'))
  const output = path.join(root, 'pm-review-package.json')
  const baselineId = 'baseline-discovered'
  const candidateBaseline = path.join(root, `candidate-baseline-${baselineId}-school-items.json`)
  const candidateRefreshPackage = path.join(root, 'candidate-refresh-package.json')
  const discovery = path.join(root, 'candidate-discovery.json')

  await mkdir(root, { recursive: true })
  await writeJson(discovery, {
    recommendedCandidate: {
      baselineId,
      projectId: 'project-1',
    },
  })
  await writeJson(candidateBaseline, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId,
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    status: 'draft',
    productionCandidateEligible: true,
    blockers: [],
    rowCount: 1,
    rows: [
      {
        index: 1,
        id: 'item-1',
        title: '施工准备与现场临设完成',
        standardWorkCode: 'BTMP-BASE-01',
        plannedStart: '2026-07-01',
        plannedEnd: '2026-07-30',
        smartReferenceDays: 30,
        candidateOnly: true,
        source: 'managed_frontier_default_master_plan',
      },
    ],
  })
  await writeJson(candidateRefreshPackage, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'refresh_required',
    refreshRequired: true,
    productionReady: false,
    baselineId,
    projectId: 'project-1',
    targetReplacementRows: [
      {
        index: 1,
        id: 'target-row-1',
        code: 'BTMP-BASE-01',
        title: '施工准备与现场临设完成',
        startDate: '2026-07-01',
        endDate: '2026-08-25',
        selectedDurationDays: 56,
        source: 'candidate_refresh_package_from_profile_report',
        profileSourceType: 'business_type_base_master_plan_profile_v1',
        candidateOnly: true,
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanReviewPackage({
      output,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      now: new Date('2026-07-04T20:00:00.000Z'),
    })

    assert.equal(report.baselineId, baselineId)
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
    assert.equal(report.candidateBaselineRef, `candidate_baseline_export:${path.relative(repoRoot, candidateBaseline).replace(/\\/g, '/')}`)
    assert.equal(report.candidateRefreshPackageRef, `candidate_refresh_package:${path.relative(repoRoot, candidateRefreshPackage).replace(/\\/g, '/')}`)
    assert.equal(report.reviewSource, 'candidate_refresh_package_target_replacement_rows')
    assert.equal(report.reviewedItemIds[0], 'target-row-1')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks PM review package for retired or low-information candidate exports', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-package-'))
  const candidateBaseline = path.join(root, 'candidate-baseline.json')
  const output = path.join(root, 'pm-review-package.json')

  await writeJson(candidateBaseline, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-legacy',
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    status: 'blocked',
    productionCandidateEligible: false,
    blockers: ['candidate_baseline_contains_retired_or_low_information_sources'],
    quality: {
      retiredOrLowInformationSourceRowCount: 1,
      blockedSourceLabels: ['manual_comparison_scenario'],
    },
    rowCount: 1,
    rows: [
      {
        index: 1,
        id: 'item-1',
        title: '人工对照场景',
        standardWorkCode: 'BTMP-MAN-01',
        plannedStart: '2026-07-01',
        plannedEnd: '2026-07-30',
        smartReferenceDays: 30,
        candidateOnly: true,
        source: 'manual_comparison_scenario',
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanReviewPackage({
      candidateBaseline,
      output,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      now: new Date('2026-07-02T05:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.reviewedItemCount, 0)
    assert.deepEqual(report.reviewedItemIds, [])
    assert.match(report.blockers.join('\n'), /candidate_baseline_not_eligible_for_pm_review/)
    assert.match(report.blockers.join('\n'), /candidate_baseline_contains_retired_or_low_information_sources/)
    assert.equal(report.recordReviewCommand, null)

    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /status: blocked/)
    assert.doesNotMatch(markdown, /--mode execute/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('normalizes allowed profile labels from candidate row source into lineage before review', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-package-'))
  const candidateBaseline = path.join(root, 'candidate-baseline.json')
  const output = path.join(root, 'pm-review-package.json')

  await writeJson(candidateBaseline, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-profile-source',
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    status: 'draft',
    productionCandidateEligible: true,
    blockers: [],
    rowCount: 2,
    rows: [
      {
        index: 1,
        id: 'item-base-profile-source',
        title: '施工准备与现场临设完成',
        standardWorkCode: 'BTMP-BASE-01',
        plannedStart: '2026-07-01',
        plannedEnd: '2026-07-30',
        smartReferenceDays: 30,
        candidateOnly: true,
        source: 'business_type_base_master_plan_profile_v1',
      },
      {
        index: 2,
        id: 'item-profile-source',
        title: '教学楼主体结构与功能区移交',
        standardWorkCode: 'BTMP-SCH-01',
        plannedStart: '2026-08-01',
        plannedEnd: '2026-09-29',
        smartReferenceDays: 60,
        candidateOnly: true,
        source: 'business_type_master_plan_profile_v1',
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanReviewPackage({
      candidateBaseline,
      output,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      now: new Date('2026-07-02T05:00:00.000Z'),
    })

    assert.equal(report.status, 'ready_for_human_pm_review')
    assert.equal(report.reviewedItemCount, 2)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.rows[0].source, 'managed_frontier_default_master_plan')
    assert.equal(report.rows[0].profileSourceType, 'business_type_base_master_plan_profile_v1')
    assert.equal(report.rows[0].originalSource, 'business_type_base_master_plan_profile_v1')
    assert.match(report.recordReviewCommand, /--review-package /)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds PM review package from candidate refresh target replacement rows when provided', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-package-refresh-'))
  const candidateBaseline = path.join(root, 'candidate-baseline.json')
  const candidateRefreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'pm-review-package.json')

  await writeJson(candidateBaseline, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    rowCount: 2,
    rows: [
      {
        index: 1,
        id: 'old-item-1',
        title: '旧施工准备',
        standardWorkCode: 'BTMP-BASE-01',
        smartReferenceDays: 30,
        candidateOnly: true,
      },
      {
        index: 2,
        id: 'old-item-2',
        title: '旧主体结构',
        standardWorkCode: 'BTMP-SCH-01',
        smartReferenceDays: 100,
        candidateOnly: true,
      },
    ],
  })
  await writeJson(candidateRefreshPackage, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'refresh_required',
    refreshRequired: true,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    currentCandidate: {
      rowCount: 2,
    },
    targetProfile: {
      targetRowCount: 3,
    },
    targetReplacementRows: [
      {
        index: 1,
        id: 'target-row-1',
        code: 'BTMP-BASE-01',
        title: '施工准备与现场临设完成',
        startDate: '2026-07-01',
        endDate: '2026-08-25',
        selectedDurationDays: 56,
        source: 'candidate_refresh_package_from_profile_report',
        profileSourceType: 'business_type_base_master_plan_profile_v1',
        candidateOnly: true,
      },
      {
        index: 2,
        id: 'target-row-2',
        code: 'BTMP-SCH-01',
        title: '教学楼主体结构与功能区移交',
        startDate: '2026-09-01',
        endDate: '2027-03-09',
        selectedDurationDays: 190,
        source: 'candidate_refresh_package_from_profile_report',
        profileSourceType: 'business_type_master_plan_profile_v1',
        candidateOnly: true,
      },
      {
        index: 3,
        id: 'target-row-3',
        code: 'BTMP-SCH-02',
        title: '教学楼二次结构与普通教室粗装修',
        startDate: '2027-01-01',
        endDate: '2027-04-05',
        selectedDurationDays: 95,
        source: 'candidate_refresh_package_from_profile_report',
        profileSourceType: 'business_type_master_plan_profile_v1',
        candidateOnly: true,
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanReviewPackage({
      candidateBaseline,
      candidateRefreshPackage,
      output,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      now: new Date('2026-07-04T18:00:00.000Z'),
    })

    assert.equal(report.status, 'ready_for_human_pm_review')
    assert.equal(report.reviewedItemCount, 3)
    assert.deepEqual(report.reviewedItemIds, ['target-row-1', 'target-row-2', 'target-row-3'])
    assert.equal(report.reviewSource, 'candidate_refresh_package_target_replacement_rows')
    assert.match(report.candidateRefreshPackageRef, /candidate_refresh_package:.*candidate-refresh-package\.json/)
    assert.equal(report.candidateBaselineRef.endsWith('candidate-baseline.json'), true)
    assert.equal(report.rows[0].title, '施工准备与现场临设完成')
    assert.equal(report.rows[0].standardWorkCode, 'BTMP-BASE-01')
    assert.equal(report.rows[0].plannedStart, '2026-07-01')
    assert.equal(report.rows[0].referenceDays, 56)
    assert.equal(report.rows[0].source, 'managed_frontier_default_master_plan')
    assert.equal(report.rows[0].originalSource, 'candidate_refresh_package_from_profile_report')
    assert.equal(report.rows[0].profileSourceType, 'business_type_base_master_plan_profile_v1')
    assert.equal(report.mutationBoundary.readsCandidateRefreshPackage, true)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.rows.length, 3)
    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /reviewedItemCount: 3/)
    assert.match(markdown, /BTMP-SCH-02/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('carries duration asset evidence from candidate refresh rows into the PM review package', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-package-duration-assets-'))
  const candidateBaseline = path.join(root, 'candidate-baseline.json')
  const candidateRefreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'pm-review-package.json')

  await writeJson(candidateBaseline, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    rowCount: 1,
    rows: [
      {
        index: 1,
        id: 'old-item-1',
        title: '旧施工准备',
        standardWorkCode: 'BTMP-BASE-01',
        smartReferenceDays: 30,
        candidateOnly: true,
      },
    ],
  })
  await writeJson(candidateRefreshPackage, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'refresh_required',
    refreshRequired: true,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    targetReplacementRows: [
      {
        index: 1,
        id: 'target-row-1',
        code: 'BTMP-BASE-01',
        title: '施工准备与现场临设完成',
        startDate: '2026-07-01',
        endDate: '2026-08-25',
        selectedDurationDays: 56,
        source: 'candidate_refresh_package_from_profile_report',
        profileSourceType: 'business_type_base_master_plan_profile_v1',
        candidateOnly: true,
        durationAssetStableCode: 'site_setup_temp_works',
        standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
        standardWorkDurationSeedP50Days: 8,
        standardWorkDurationSeedProductivityP50PerDay: 1.1,
        t2RhythmTemplateId: 't2-school-site-setup-rhythm-v1',
        t2RhythmTemplateP50Days: 56,
        runtimeReferenceDaysConsumed: false,
        quantityProxySource: 'project_scale_facts',
        quantityProxyValue: 5,
        quantityProxyUnit: 'startup_workface',
        quantityProxyBasis: 'project_scale_facts building_count + basement_level_count',
        productivityDerivedDurationDays: 16,
        selectionRule: 'project_scale_productivity_or_formula_asset_backed_candidate_l1',
        durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
        durationMaturity: 'L1',
        durationReviewGate: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        durationTruthSource: 'asset_backed_candidate_master_plan',
        dependencyRuleSource: 'construction_task_dependency_constraint_rule_system',
        dependencyRuleLayerStack: 'cross_item_workflow + process_constraint',
        phaseAnchorDependencyCount: 0,
      },
      {
        index: 2,
        id: 'target-row-2',
        code: 'BTMP-SCH-01',
        title: '教学楼主体结构与功能区移交',
        startDate: '2026-09-01',
        endDate: '2027-03-09',
        selectedDurationDays: 190,
        source: 'candidate_refresh_package_from_profile_report',
        profileSourceType: 'business_type_master_plan_profile_v1',
        candidateOnly: true,
        durationAssetStableCode: 'cast_in_place_formwork',
        standardWorkDurationSeedResolverSource: 'runtime_seed',
        standardWorkDurationSeedP50Days: 5,
        t2RhythmTemplateId: 't2-school-teaching-building-structure-rhythm-v1',
        t2RhythmTemplateP50Days: 8,
        runtimeReferenceDaysConsumed: true,
        runtimeReferenceDaysEvidenceLevel: 'runtime_calibrated_l2',
        runtimeReferenceDaysP50Days: 190,
        runtimeReferenceDaysP80Days: 210,
        runtimeReferenceDaysSampleCount: 4,
        runtimeReferenceDaysSource: 'accepted_real_project_outcome',
        quantityProxySource: 'project_scale_facts',
        quantityProxyValue: 72,
        quantityProxyUnit: 'floor_workface',
        productivityDerivedDurationDays: 219,
        selectionRule: 'runtime_calibrated_reference_days_p50_candidate_l2',
        durationCalibrationSource: 'runtime_reference_days+standard_work_duration_seed+t2_rhythm_template',
        durationMaturity: 'L2',
        durationReviewGate: 'PM_REVIEW_REQUIRED',
        durationTruthSource: 'runtime_calibrated_candidate_master_plan',
        dependencyRuleSource: 'construction_task_dependency_constraint_rule_system',
        dependencyRuleLayerStack: 'cross_item_workflow + process_constraint',
        phaseAnchorDependencyCount: 1,
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanReviewPackage({
      candidateBaseline,
      candidateRefreshPackage,
      output,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      now: new Date('2026-07-04T20:00:00.000Z'),
    })

    assert.equal(report.durationAssetSummary.rowCount, 2)
    assert.equal(report.durationAssetSummary.rowsWithStandardWorkSeedCount, 2)
    assert.equal(report.durationAssetSummary.rowsWithT2RhythmTemplateCount, 2)
    assert.equal(report.durationAssetSummary.rowsWithRuntimeReferenceDaysCount, 1)
    assert.equal(report.durationAssetSummary.rowsMissingRuntimeReferenceDaysCount, 1)
    assert.equal(report.durationAssetSummary.rowsWithDependencyEvidenceCount, 2)
    assert.equal(report.durationAssetSummary.rowsMissingDependencyEvidenceCount, 0)
    assert.deepEqual(report.durationAssetSummary.durationMaturityCounts, { L1: 1, L2: 1 })
    assert.equal(report.durationAssetSummary.reviewGateCounts.GENERATION_DEPTH_TRUST_REVIEW_REQUIRED, 1)
    assert.equal(report.durationAssetSummary.assetGapCounts.runtime_reference_days_missing, 1)
    assert.equal(report.rows[0].durationAssetEvidence.durationAssetStableCode, 'site_setup_temp_works')
    assert.equal(report.rows[0].durationAssetEvidence.t2RhythmTemplateId, 't2-school-site-setup-rhythm-v1')
    assert.equal(report.rows[0].durationAssetEvidence.runtimeReferenceDays.consumed, false)
    assert.equal(report.rows[0].durationAssetEvidence.dependencyEvidence.startAnchor, true)
    assert.equal(report.rows[0].durationAssetEvidence.dependencyEvidence.anchorType, 'project_start_anchor')
    assert.deepEqual(report.rows[0].durationAssetEvidence.assetGaps, ['runtime_reference_days_missing'])
    assert.equal(report.rows[1].durationAssetEvidence.runtimeReferenceDays.consumed, true)
    assert.equal(report.rows[1].durationAssetEvidence.runtimeReferenceDays.sampleCount, 4)
    assert.equal(report.rows[1].durationAssetEvidence.runtimeReferenceDays.source, 'accepted_real_project_outcome')

    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Duration Asset Summary/)
    assert.match(markdown, /rowsMissingRuntimeReferenceDays: 1/)
    assert.match(markdown, /site_setup_temp_works/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not count incomplete runtime reference-day flags as reviewed duration evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-package-incomplete-runtime-ref-'))
  const candidateBaseline = path.join(root, 'candidate-baseline.json')
  const candidateRefreshPackage = path.join(root, 'candidate-refresh-package.json')
  const output = path.join(root, 'pm-review-package.json')

  await writeJson(candidateBaseline, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    status: 'draft',
    productionCandidateEligible: true,
    blockers: [],
    rowCount: 1,
    rows: [],
  })
  await writeJson(candidateRefreshPackage, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'refresh_required',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    targetReplacementRows: [
      {
        index: 1,
        id: 'target-row-1',
        code: 'BTMP-BASE-01',
        title: '施工准备与现场临设完成',
        startDate: '2026-07-01',
        endDate: '2026-08-25',
        selectedDurationDays: 56,
        source: 'candidate_refresh_package_from_profile_report',
        profileSourceType: 'business_type_base_master_plan_profile_v1',
        candidateOnly: true,
        durationAssetStableCode: 'site_setup_temp_works',
        standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
        standardWorkDurationSeedP50Days: 8,
        standardWorkDurationSeedProductivityP50PerDay: 1.1,
        t2RhythmTemplateId: 't2-school-site-setup-rhythm-v1',
        t2RhythmTemplateP50Days: 56,
        runtimeReferenceDaysConsumed: true,
        runtimeReferenceDaysEvidenceLevel: '',
        runtimeReferenceDaysP50Days: null,
        runtimeReferenceDaysSampleCount: 0,
        runtimeReferenceDaysSource: 'staging_runtime_writer',
        quantityProxySource: 'project_scale_facts',
        quantityProxyValue: 5,
        quantityProxyUnit: 'startup_workface',
        productivityDerivedDurationDays: 16,
        selectionRule: 'runtime_calibrated_reference_days_p50_candidate_l2',
        durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
        durationMaturity: 'L1',
        durationReviewGate: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        durationTruthSource: 'asset_backed_candidate_master_plan',
        dependencyRuleSource: 'construction_task_dependency_constraint_rule_system',
        dependencyRuleLayerStack: 'cross_item_workflow + process_constraint',
        phaseAnchorDependencyCount: 1,
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanReviewPackage({
      candidateBaseline,
      candidateRefreshPackage,
      output,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      now: new Date('2026-07-04T20:00:00.000Z'),
    })

    assert.equal(report.durationAssetSummary.rowsWithRuntimeReferenceDaysCount, 0)
    assert.equal(report.durationAssetSummary.rowsMissingRuntimeReferenceDaysCount, 1)
    assert.equal(report.durationAssetSummary.assetGapCounts.runtime_reference_days_incomplete, 1)
    assert.equal(report.rows[0].durationAssetEvidence.runtimeReferenceDays.consumed, false)
    assert.equal(report.rows[0].durationAssetEvidence.runtimeReferenceDays.flaggedConsumed, true)
    assert.equal(report.rows[0].durationAssetEvidence.runtimeReferenceDays.source, 'staging_runtime_writer')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks PM review package when a candidate export hides manual-comparison markers in rows', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-package-'))
  const candidateBaseline = path.join(root, 'candidate-baseline.json')
  const output = path.join(root, 'pm-review-package.json')

  await writeJson(candidateBaseline, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-hidden-manual',
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    status: 'draft',
    productionCandidateEligible: true,
    blockers: [],
    rowCount: 1,
    rows: [
      {
        index: 1,
        id: 'item-hidden-manual',
        title: '表面合格但隐藏人工对照的行',
        standardWorkCode: 'BTMP-HIDDEN-01',
        plannedStart: '2026-07-01',
        plannedEnd: '2026-07-30',
        smartReferenceDays: 30,
        candidateOnly: true,
        source: 'managed_frontier_default_master_plan',
        fallbackApplied: 'manual_comparison_scenario',
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanReviewPackage({
      candidateBaseline,
      output,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      now: new Date('2026-07-02T05:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.reviewedItemCount, 0)
    assert.deepEqual(report.reviewedItemIds, [])
    assert.equal(report.recordReviewCommand, null)
    assert.equal(report.blockers.includes('candidate_baseline_contains_retired_or_low_information_sources'), true)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.rows[0].fallbackApplied, 'manual_comparison_scenario')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks PM review package when a candidate export root hides retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-package-'))
  const candidateBaseline = path.join(root, 'candidate-baseline.json')
  const output = path.join(root, 'pm-review-package.json')

  await writeJson(candidateBaseline, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-root-hidden-legacy',
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    status: 'draft',
    productionCandidateEligible: true,
    blockers: [],
    comparisonBasis: ['manual_comparison_scenario'],
    boundaryPolicy: 'controlled_degradation',
    reviewProof: {
      sourceLineage: ['legacy_template_reverse_inference'],
    },
    rowCount: 1,
    rows: [
      {
        index: 1,
        id: 'item-root-hidden-legacy',
        title: '表面合格但根对象隐藏旧模板来源的行',
        standardWorkCode: 'BTMP-HIDDEN-ROOT-01',
        plannedStart: '2026-07-01',
        plannedEnd: '2026-07-30',
        smartReferenceDays: 30,
        candidateOnly: true,
        source: 'managed_frontier_default_master_plan',
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanReviewPackage({
      candidateBaseline,
      output,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      now: new Date('2026-07-02T05:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.reviewedItemCount, 0)
    assert.deepEqual(report.reviewedItemIds, [])
    assert.equal(report.recordReviewCommand, null)
    assert.equal(report.blockers.includes('candidate_baseline_contains_retired_or_low_information_sources'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
