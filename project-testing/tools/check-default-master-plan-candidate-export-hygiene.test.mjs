import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildDefaultMasterPlanCandidateExportHygieneReport,
} from './check-default-master-plan-candidate-export-hygiene.mjs'

test('reports stale ineligible candidate exports as ignored hygiene evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-candidate-hygiene-'))
  const currentCandidatePath = path.join(root, 'candidate-baseline-baseline-1-school-items.json')
  const staleCandidatePath = path.join(root, 'candidate-baseline-stale-school-items.json')
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'candidate-export-hygiene.json')

  await writeJson(currentCandidatePath, candidateBaselineFixture())
  await writeJson(staleCandidatePath, {
    ...candidateBaselineFixture(),
    baselineId: 'stale-baseline',
    productionCandidateEligible: false,
    quality: {
      rowsMissingReferenceDuration: 0,
      rowsWritingTasks: 0,
      rowsWritingTaskDependencies: 0,
      sourceLabels: ['business_type_master_plan_profile_v1'],
    },
    rows: [
      {
        index: 1,
        id: 'stale-row-1',
        title: '旧 profile source 行',
        standardWorkCode: 'BTMP-OLD-01',
        source: 'business_type_master_plan_profile_v1',
        smartReferenceDays: 30,
        candidateOnly: true,
        writesTasks: false,
        writesTaskDependencies: false,
      },
    ],
  })
  await writeJson(handoffPath, handoffFixture(currentCandidatePath))

  try {
    const report = await buildDefaultMasterPlanCandidateExportHygieneReport({
      reportRoot: root,
      handoff: handoffPath,
      profileReport: '',
      output: outputPath,
      now: new Date('2026-07-03T03:00:00.000Z'),
    })

    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-candidate-export-hygiene/v1')
    assert.equal(report.status, 'pass_with_ignored_exports')
    assert.equal(report.productionReady, false)
    assert.equal(report.totalCandidateExportCount, 2)
    assert.equal(report.currentCandidate.fileName, path.basename(currentCandidatePath))
    assert.equal(report.ignoredCandidateExports.length, 1)
    assert.equal(report.ignoredCandidateExports[0].fileName, path.basename(staleCandidatePath))
    assert.equal(report.ignoredCandidateExports[0].baselineId, 'stale-baseline')
    assert.equal(report.ignoredCandidateExports[0].reasonCodes.includes('ineligible_candidate_export'), true)
    assert.equal(report.ignoredCandidateExports[0].reasonCodes.includes('retired_or_low_information_default_master_plan_source'), true)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.mutationBoundary.writesProductionTables, false)
    assert.equal(report.mutationBoundary.invokesRuntimeWriters, false)

    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(written.status, 'pass_with_ignored_exports')
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /candidate-baseline-stale-school-items\.json/)
    assert.match(markdown, /ignored/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('uses an explicit candidate export instead of a stale operator handoff artifact', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-candidate-hygiene-'))
  const currentCandidatePath = path.join(root, 'candidate-baseline-baseline-1-school-items.json')
  const staleCandidatePath = path.join(root, 'candidate-baseline-stale-school-items.json')
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'candidate-export-hygiene.json')

  await writeJson(currentCandidatePath, candidateBaselineFixture())
  await writeJson(staleCandidatePath, candidateBaselineFixture({
    baselineId: 'baseline-stale',
    projectId: 'project-stale',
    rows: candidateBaselineFixture().rows.map((row, index) => index === 0 ? { ...row, writesTasks: true } : row),
  }))
  await writeJson(handoffPath, handoffFixture(staleCandidatePath))

  try {
    const report = await buildDefaultMasterPlanCandidateExportHygieneReport({
      reportRoot: root,
      candidateExport: currentCandidatePath,
      handoff: handoffPath,
      profileReport: '',
      output: outputPath,
      now: new Date('2026-07-10T04:20:00.000Z'),
    })

    assert.equal(report.status, 'pass_with_ignored_exports')
    assert.equal(report.currentCandidate.artifact.endsWith('candidate-baseline-baseline-1-school-items.json'), true)
    assert.equal(report.selectedCandidateArtifact.endsWith('candidate-baseline-baseline-1-school-items.json'), true)
    assert.equal(report.ignoredCandidateExports.length, 1)
    assert.equal(report.extraEligibleCandidateExports.length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks candidate export hygiene when extra eligible candidate exports remain beside the selected baseline', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-candidate-hygiene-'))
  const currentCandidatePath = path.join(root, 'candidate-baseline-baseline-1-school-items.json')
  const extraCandidatePath = path.join(root, 'candidate-baseline-extra-school-items.json')
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'candidate-export-hygiene.json')

  await writeJson(currentCandidatePath, candidateBaselineFixture())
  await writeJson(extraCandidatePath, {
    ...candidateBaselineFixture(),
    baselineId: 'extra-baseline',
    projectId: 'project-2',
  })
  await writeJson(handoffPath, handoffFixture(currentCandidatePath))

  try {
    const report = await buildDefaultMasterPlanCandidateExportHygieneReport({
      reportRoot: root,
      handoff: handoffPath,
      profileReport: '',
      output: outputPath,
      now: new Date('2026-07-03T03:05:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.blockers.includes('extra_eligible_candidate_exports_present'), true)
    assert.equal(report.extraEligibleCandidateExports.length, 1)
    assert.equal(report.extraEligibleCandidateExports[0].fileName, path.basename(extraCandidatePath))
    assert.equal(report.ignoredCandidateExports.length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks candidate export hygiene when the selected candidate root hides retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-candidate-hygiene-'))
  const currentCandidatePath = path.join(root, 'candidate-baseline-baseline-1-school-items.json')
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'candidate-export-hygiene.json')

  await writeJson(currentCandidatePath, {
    ...candidateBaselineFixture(),
    comparisonBasis: ['manual_comparison_scenario'],
    boundaryPolicy: 'controlled_degradation',
    reviewProof: {
      sourceLineage: ['legacy_template_reverse_inference'],
    },
  })
  await writeJson(handoffPath, handoffFixture(currentCandidatePath))

  try {
    const report = await buildDefaultMasterPlanCandidateExportHygieneReport({
      reportRoot: root,
      handoff: handoffPath,
      profileReport: '',
      output: outputPath,
      now: new Date('2026-07-03T03:10:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.blockers.includes('selected_candidate_export_ineligible'), true)
    assert.equal(report.currentCandidate.productionCandidateEligible, false)
    assert.equal(
      report.currentCandidate.reasonCodes.includes('retired_or_low_information_default_master_plan_source'),
      true,
    )
    assert.equal(report.currentCandidate.blockedSourceLabels.includes('manual_comparison_scenario'), true)
    assert.equal(report.currentCandidate.blockedSourceLabels.includes('legacy_template_reverse_inference'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks selected candidate export when it no longer matches the current business-type profile shape', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-candidate-hygiene-'))
  const currentCandidatePath = path.join(root, 'candidate-baseline-baseline-1-school-items.json')
  const profileReportPath = path.join(root, 'default-master-plan-profile-samples.json')
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'candidate-export-hygiene.json')

  await writeJson(currentCandidatePath, {
    ...candidateBaselineFixture(),
    rowCount: 16,
    rows: staleSchoolCandidateRows(),
  })
  await writeJson(profileReportPath, schoolProfileReportFixture())
  await writeJson(handoffPath, handoffFixture(currentCandidatePath))

  try {
    const report = await buildDefaultMasterPlanCandidateExportHygieneReport({
      reportRoot: root,
      handoff: handoffPath,
      profileReport: profileReportPath,
      output: outputPath,
      now: new Date('2026-07-03T03:15:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.blockers.includes('selected_candidate_export_profile_shape_mismatch'), true)
    assert.equal(report.profileComparison.status, 'mismatch')
    assert.equal(report.profileComparison.businessType, 'school')
    assert.equal(report.profileComparison.candidateRowCount, 16)
    assert.equal(report.profileComparison.profileScheduleRowCount, 18)
    assert.equal(report.profileComparison.profileRowCount, 6)
    assert.equal(report.profileComparison.candidateProfileMatchedRowCount, 4)
    assert.deepEqual(
      report.profileComparison.missingProfileRows.map((row) => row.title),
      [
        '教学楼二次结构与普通教室粗装修',
        '食堂宿舍装修与机电收口',
      ],
    )
    assert.equal(
      report.currentCandidate.reasonCodes.includes('selected_candidate_export_profile_shape_mismatch'),
      true,
    )

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Selected Candidate Profile Comparison/)
    assert.match(markdown, /教学楼二次结构与普通教室粗装修/)
    assert.match(markdown, /食堂宿舍装修与机电收口/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function candidateBaselineFixture(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    productionCandidateEligible: true,
    rowCount: 2,
    quality: {
      rowsMissingReferenceDuration: 0,
      rowsWritingTasks: 0,
      rowsWritingTaskDependencies: 0,
      sourceLabels: ['managed_frontier_default_master_plan'],
    },
    rows: [
      {
        index: 1,
        id: 'row-1',
        title: '施工准备与现场临设完成',
        standardWorkCode: 'BTMP-BASE-01',
        source: 'managed_frontier_default_master_plan',
        smartReferenceDays: 30,
        candidateOnly: true,
        writesTasks: false,
        writesTaskDependencies: false,
      },
      {
        index: 2,
        id: 'row-2',
        title: '教学楼主体结构与功能区移交',
        standardWorkCode: 'BTMP-SCH-01',
        source: 'managed_frontier_default_master_plan',
        smartReferenceDays: 100,
        candidateOnly: true,
        writesTasks: false,
        writesTaskDependencies: false,
      },
    ],
    ...overrides,
  }
}

function staleSchoolCandidateRows() {
  return [
    candidateRow('BTMP-BASE-01', '施工准备与现场临设完成', 'startup_site_setup', 'site_preparation', 'business_type_base_master_plan_profile_v1'),
    candidateRow('BTMP-BASE-02', '基坑支护降水与土方开挖', 'foundation_pit_pile', 'foundation', 'business_type_base_master_plan_profile_v1'),
    candidateRow('BTMP-BASE-03', '桩基基础与检测验收', 'foundation_pit_pile', 'foundation', 'business_type_base_master_plan_profile_v1'),
    candidateRow('BTMP-BASE-04', '地下结构施工与出正负零', 'basement_structure', 'basement', 'business_type_base_master_plan_profile_v1'),
    candidateRow('BTMP-SCH-01', '教学楼主体结构与功能区移交', 'superstructure_rhythm', 'teaching_building', 'business_type_master_plan_profile_v1'),
    candidateRow('BTMP-BASE-05', '主体结构施工与分区验收', 'superstructure_rhythm', 'main_structure', 'business_type_base_master_plan_profile_v1'),
    candidateRow('BTMP-SCH-02', '实验室通风与专业机电安装', 'mep_roughin', 'laboratory_mep', 'business_type_master_plan_profile_v1'),
    candidateRow('BTMP-BASE-06', '二次结构与砌体穿插施工', 'secondary_structure_fitout_roughin', 'secondary_structure', 'business_type_base_master_plan_profile_v1'),
    candidateRow('BTMP-BASE-08', '机电安装与管线综合施工', 'mep_roughin', 'mep_common', 'business_type_base_master_plan_profile_v1'),
    candidateRow('BTMP-BASE-07', '屋面防水与外围护封闭', 'envelope_roof_facade', 'envelope', 'business_type_base_master_plan_profile_v1'),
    candidateRow('BTMP-SCH-03', '操场道路与校园室外配套', 'outdoor_municipal_landscape', 'campus_outdoor', 'business_type_master_plan_profile_v1'),
    candidateRow('BTMP-BASE-09', '装饰装修与功能区样板确认', 'interior_fitout_terminal', 'interior_fitout', 'business_type_base_master_plan_profile_v1'),
    candidateRow('BTMP-BASE-10', '电梯安装与专项检验', 'elevator_installation', 'vertical_transport', 'business_type_base_master_plan_profile_v1'),
    candidateRow('BTMP-BASE-11', '室外管网道路与景观施工', 'outdoor_municipal_landscape', 'outdoor', 'business_type_base_master_plan_profile_v1'),
    candidateRow('BTMP-BASE-12', '系统调试与专项验收准备', 'commissioning', 'commissioning', 'business_type_base_master_plan_profile_v1'),
    candidateRow('BTMP-SCH-04', '竣工验收与开学移交准备', 'acceptance_handover', 'school_handover', 'business_type_master_plan_profile_v1'),
  ].map((row, index) => ({ ...row, index: index + 1, id: `row-${index + 1}` }))
}

function schoolProfileReportFixture() {
  const baseRows = [
    profileRow('BTMP-BASE-01', '施工准备与现场临设完成', 'startup_site_setup', 'site_preparation'),
    profileRow('BTMP-BASE-02', '基坑支护降水与土方开挖', 'foundation_pit_pile', 'foundation'),
    profileRow('BTMP-BASE-03', '桩基基础与检测验收', 'foundation_pit_pile', 'foundation'),
    profileRow('BTMP-BASE-04', '地下结构施工与出正负零', 'basement_structure', 'basement'),
    profileRow('BTMP-BASE-05', '主体结构施工与分区验收', 'superstructure_rhythm', 'main_structure'),
    profileRow('BTMP-BASE-06', '二次结构与砌体穿插施工', 'secondary_structure_fitout_roughin', 'secondary_structure'),
    profileRow('BTMP-BASE-08', '机电安装与管线综合施工', 'mep_roughin', 'mep_common'),
    profileRow('BTMP-BASE-07', '屋面防水与外围护封闭', 'envelope_roof_facade', 'envelope'),
    profileRow('BTMP-BASE-09', '装饰装修与功能区样板确认', 'interior_fitout_terminal', 'interior_fitout'),
    profileRow('BTMP-BASE-10', '电梯安装与专项检验', 'elevator_installation', 'vertical_transport'),
    profileRow('BTMP-BASE-11', '室外管网道路与景观施工', 'outdoor_municipal_landscape', 'outdoor'),
    profileRow('BTMP-BASE-12', '系统调试与专项验收准备', 'commissioning', 'commissioning'),
  ]
  const profileRows = [
    profileRow('BTMP-SCH-01', '教学楼主体结构与功能区移交', 'superstructure_rhythm', 'teaching_building'),
    profileRow('BTMP-SCH-02', '教学楼二次结构与普通教室粗装修', 'secondary_structure_fitout_roughin', 'teaching_secondary_structure'),
    profileRow('BTMP-SCH-03', '实验室通风与专业机电安装', 'mep_roughin', 'laboratory_mep'),
    profileRow('BTMP-SCH-04', '食堂宿舍装修与机电收口', 'interior_fitout_terminal', 'cafeteria_dormitory_fitout'),
    profileRow('BTMP-SCH-05', '操场道路与校园室外配套', 'outdoor_municipal_landscape', 'campus_outdoor'),
    profileRow('BTMP-SCH-06', '竣工验收与开学移交准备', 'acceptance_handover', 'school_handover'),
  ]
  return {
    schemaVersion: 'workbuddy-default-master-plan-profile-samples/v1',
    source: 'generate-default-master-plan-profile-report',
    businessTypes: [
      {
        businessType: 'school',
        scheduleRowCount: baseRows.length + profileRows.length,
        baseRowCount: baseRows.length,
        profileRowCount: profileRows.length,
        baseRows,
        profileRows,
      },
    ],
  }
}

function candidateRow(code, title, executionPhase, executionLane, profileSourceType) {
  return {
    title,
    standardWorkCode: code,
    source: 'managed_frontier_default_master_plan',
    profileSourceType,
    executionPhase,
    executionLane,
    smartReferenceDays: 30,
    candidateOnly: true,
    writesTasks: false,
    writesTaskDependencies: false,
  }
}

function profileRow(code, title, executionPhase, executionLane) {
  return {
    code,
    title,
    executionPhase,
    executionLane,
    businessType: 'school',
  }
}

function handoffFixture(candidatePath) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-production-operator-handoff/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    candidate: {
      artifact: path.relative(path.resolve('.'), candidatePath).replace(/\\/g, '/'),
      productionCandidateEligible: true,
    },
    artifacts: {
      candidateBaseline: path.relative(path.resolve('.'), candidatePath).replace(/\\/g, '/'),
    },
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
