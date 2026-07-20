import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const SCRIPT_PATH = path.resolve('project-testing/tools/check-default-master-plan-production-readiness.mjs')
const REVIEW_BLOCKERS = [
  'PROJECT_MANAGER_REVIEW_REQUIRED',
  'DURATION_EVIDENCE_NOT_RUNTIME_CALIBRATED',
  'PRODUCTION_DEPENDENCY_WRITER_NOT_APPLIED',
  'RUNTIME_PUBLICATION_EVIDENCE_MISSING',
  'POST_PUBLISH_SMOKE_ROLLBACK_EVIDENCE_MISSING',
]
const CANONICAL_RUNTIME_PUBLICATION_KEY = 'duration-learning-runtime:wbs-reference-days:facade-v3'
const CANONICAL_RUNTIME_PUBLICATION_REF = `duration_learning_runtime_publications_export:project-testing/reports/default-master-plan-production-readiness/runtime-publications.json#sha256=${'a'.repeat(64)}`
const CANONICAL_RUNTIME_CONSUMPTION_REF = `duration_learning_runtime_consumptions_export:project-testing/reports/default-master-plan-production-readiness/runtime-consumptions.json#sha256=${'6'.repeat(64)}`

async function execFileAllowReadinessBlocked(file, args, options) {
  try {
    return await execFileAsync(file, args, options)
  } catch (error) {
    if (error?.code === 1) return error
    throw error
  }
}

test('residential shape evidence reports asset-backed candidate level when duration assets are present', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- entry template: residential_master_plan_v2',
    '- source_type: asset_backed_default_master_plan',
    '- duration evidence: standard_work_duration_seed+t2_rhythm_template+real_plan_evidence / asset_backed_candidate_master_plan / L1',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
  ].join('\n'), 'utf8')

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const residentialShape = report.businessTypes.find((item) => item.businessType === 'general_civil_residential')

    assert.equal(report.currentEvidenceLevel, 'candidate_asset_backed_l1')
    assert.equal(residentialShape.generationMode, 'asset_backed_default_master_plan')
    assert.equal(residentialShape.evidenceLevel, 'candidate_asset_backed_l1')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('dedicated-only non-residential profiles keep candidate shape without generic base rows', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')

  await writeJson(profileReport, {
    businessTypes: [
      {
        businessType: 'renovation',
        scheduleRowCount: 6,
        baseRowCount: 0,
        profileRowCount: 6,
        profilePhaseAnchorRowCount: 1,
        profileDurationEvidenceReady: true,
        gaps: [],
      },
    ],
  })

  try {
    await execFileAllowReadinessBlocked(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const renovationShape = report.businessTypes.find((item) => item.businessType === 'renovation')

    assert.equal(renovationShape.reviewStatus, 'candidate_master_plan_reviewable')
    assert.equal(renovationShape.shapeGaps.includes('row_count_outside_15_60'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocked readiness report exposes gate completion summary for operator status checks', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
  ].join('\n'), 'utf8')

  try {
    const result = await execFileAllowReadinessBlocked(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const cliSummary = JSON.parse(result.stdout)
    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const expectedSummary = {
      total: report.gates.length,
      pass: report.gates.filter((gate) => gate.status === 'pass').length,
      blocked: report.gates.filter((gate) => gate.status === 'blocked').length,
      fail: report.gates.filter((gate) => gate.status === 'fail').length,
    }
    expectedSummary.completionRate = Number(((expectedSummary.pass / expectedSummary.total) * 100).toFixed(1))

    assert.equal(expectedSummary.total > 0, true)
    assert.equal(expectedSummary.blocked > 0, true)
    assert.deepEqual(report.gateSummary, expectedSummary)
    assert.deepEqual(cliSummary.gateSummary, report.gateSummary)
    assert.equal(cliSummary.completionRate, expectedSummary.completionRate)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('offline project-manager quality review is informational and never becomes a runtime gate', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, reviewEvidenceFixture())

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const runtimeGate = report.gates.find((gate) => gate.id === 'runtime_duration_calibration_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.gates.some((gate) => gate.id === 'project_manager_review_evidence'), false)
    assert.equal(report.offlineDevelopmentQualityReview.status, 'available')
    assert.equal(report.offlineDevelopmentQualityReview.requiredForRuntime, false)
    assert.equal(runtimeGate.status, 'blocked')
    assert.equal(report.inputs.offlineDevelopmentQualityReview.endsWith('pm-review.json'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('legacy PM package fields do not reintroduce a runtime approval gate', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, {
    schemaVersion: 'workbuddy-candidate-default-master-plan-review-evidence/v1',
    candidate_governance_review: {
      decision: 'accepted_for_baseline',
      reviewed_by: 'owner-1',
      reviewed_at: '2026-07-01T06:30:00.000Z',
      reviewed_item_ids: ['candidate-item-1'],
      reviewed_item_count: 1,
      acknowledged_blockers: REVIEW_BLOCKERS,
      review_notes: '项目经理已复核候选默认主计划，可作为当前项目基线发布。',
      production_ready: false,
    },
    change_log: {
      entity_type: 'baseline',
      field_name: 'candidate_default_master_plan_review',
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.gates.some((gate) => gate.id === 'project_manager_review_evidence'), false)
    assert.equal(report.offlineDevelopmentQualityReview.status, 'available')
    assert.equal(report.offlineDevelopmentQualityReview.legacyRuntimeApprovalContractIgnored, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('offline review export hash lineage does not participate in production readiness', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, {
    ...reviewEvidenceFixture(),
    sourceEvidenceRef: 'manual-pm-review-note',
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.gates.some((gate) => gate.id === 'project_manager_review_evidence'), false)
    assert.equal(report.offlineDevelopmentQualityReview.requiredForRuntime, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('dependency writer evidence closes only the production dependency writer gate', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
  ].join('\n'), 'utf8')
  await writeJson(dependencyWriterEvidence, dependencyWriterEvidenceFixture())

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const dependencyGate = report.gates.find((gate) => gate.id === 'production_dependency_writer_evidence')
    const publicationGate = report.gates.find((gate) => gate.id === 'runtime_publication_evidence')
    const smokeGate = report.gates.find((gate) => gate.id === 'post_publish_smoke_and_rollback_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(dependencyGate.status, 'pass')
    assert.equal(publicationGate.status, 'blocked')
    assert.equal(smokeGate.status, 'blocked')
    assert.equal(report.inputs.dependencyWriterEvidence.endsWith('dependency-writer.json'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('dependency writer evidence must come from explicit execute mode before it can close the production writer gate', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
  ].join('\n'), 'utf8')
  await writeJson(dependencyWriterEvidence, {
    ...dependencyWriterEvidenceFixture(),
    execution_mode: 'dry_run',
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const dependencyGate = report.gates.find((gate) => gate.id === 'production_dependency_writer_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(dependencyGate.status, 'blocked')
    assert.match(dependencyGate.blockers.join('\n'), /dependency_writer_execute_mode_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('dependency writer evidence with unresolved external anchors cannot close the production writer gate', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 rows',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
  ].join('\n'), 'utf8')
  await writeJson(dependencyWriterEvidence, {
    ...dependencyWriterEvidenceFixture(),
    domain_writer_result: {
      ...dependencyWriterEvidenceFixture().domain_writer_result,
      unresolvedExternalDependencyCount: 1,
      unresolvedExternalDependencies: [{
        fromGeneratedRowId: 'generated:school:template:foundation-anchor',
        toGeneratedRowId: 'generated:school:BTMP-SCH-01',
        reason: 'predecessor_task_outside_selected_candidate_scope',
      }],
    },
  })

  try {
    await execFileAllowReadinessBlocked(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const dependencyGate = report.gates.find((gate) => gate.id === 'production_dependency_writer_evidence')

    assert.equal(dependencyGate.status, 'blocked')
    assert.match(dependencyGate.blockers.join('\n'), /unresolved_external_dependency_anchors_present/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('dependency writer evidence is blocked when a legacy source label only carries a candidate boolean marker', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')

  const legacyEvidence = dependencyWriterEvidenceFixture()
  legacyEvidence.candidate_default_master_plan = {
    generation_mode: '',
    source_version_label: 'legacy_template_serial_fallback',
    candidate_default_master_plan_baseline: true,
  }

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
  ].join('\n'), 'utf8')
  await writeJson(dependencyWriterEvidence, legacyEvidence)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const dependencyGate = report.gates.find((gate) => gate.id === 'production_dependency_writer_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(dependencyGate.status, 'blocked')
    assert.match(dependencyGate.blockers.join('\n'), /candidate_default_master_plan_source_version_label_unsupported/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('dependency writer evidence is blocked when it lacks task_dependencies export hash lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
  ].join('\n'), 'utf8')
  await writeJson(dependencyWriterEvidence, {
    ...dependencyWriterEvidenceFixture(),
    sourceEvidenceRef: 'manual-dependency-writer-note',
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const dependencyGate = report.gates.find((gate) => gate.id === 'production_dependency_writer_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(dependencyGate.status, 'blocked')
    assert.match(dependencyGate.blockers.join('\n'), /task_dependencies_export_hash_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete runtime evidence closes production readiness without runtime PM approval evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(durationEvidence, durationCalibrationEvidenceFixture())
  await writeJson(dependencyWriterEvidence, dependencyWriterEvidenceFixture())
  await writeJson(runtimePublicationEvidence, runtimePublicationEvidenceFixture())
  await writeJson(smokeRollbackEvidence, {
    ...smokeRollbackEvidenceFixture(),
    environment: 'production',
    realProductionOutcomeEvidence: realProductionOutcomeEvidenceFixture(),
  })
  await writeJson(sourceManifest, sourceManifestFixture({
    environment: 'production',
    realProductionOutcomeEvidence: realProductionOutcomeEvidenceFixture(),
    sourceManifestPath: sourceManifest,
  }))

  try {
    await execFileAllowReadinessBlocked(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const gateStatuses = Object.fromEntries(report.gates.map((gate) => [gate.id, gate.status]))

    assert.equal(report.status, 'pass', JSON.stringify(report.gates, null, 2))
    assert.equal(report.productionReady, true)
    assert.equal(report.currentEvidenceLevel, 'runtime_published_and_rollback_verified')
    assert.deepEqual(gateStatuses, {
      legacy_serial_template_path_removed: 'pass',
      candidate_master_plan_shape_11_business_types: 'pass',
      runtime_source_export_provenance: 'pass',
      duration_sample_collection_package: 'pass',
      runtime_duration_calibration_evidence: 'pass',
      production_dependency_writer_evidence: 'pass',
      runtime_publication_evidence: 'pass',
      post_publish_smoke_and_rollback_evidence: 'pass',
      runtime_evidence_lineage_consistency: 'pass',
      production_readiness: 'pass',
    })
    assert.equal(report.mutationBoundary.writesProductionTables, false)
    assert.equal(report.inputs.durationCalibrationEvidence.endsWith('duration-calibration.json'), true)
    assert.equal(report.inputs.runtimePublicationEvidence.endsWith('runtime-publication.json'), true)
    assert.equal(report.inputs.postPublishSmokeRollbackEvidence.endsWith('smoke-rollback.json'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete runtime evidence accepts operator-supplied real duration sample source exports', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')
  const manifest = sourceManifestFixture({
    environment: 'production',
    realProductionOutcomeEvidence: realProductionOutcomeEvidenceFixture(),
    sourceManifestPath: sourceManifest,
  })
  manifest.sourceExports.durationSamples.kind = 'operator_supplied_real_duration_sample_material'

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(durationEvidence, durationCalibrationEvidenceFixture())
  await writeJson(dependencyWriterEvidence, dependencyWriterEvidenceFixture())
  await writeJson(runtimePublicationEvidence, runtimePublicationEvidenceFixture())
  await writeJson(smokeRollbackEvidence, {
    ...smokeRollbackEvidenceFixture(),
    environment: 'production',
    realProductionOutcomeEvidence: realProductionOutcomeEvidenceFixture(),
  })
  await writeJson(sourceManifest, manifest)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
      '--fail-on-not-ready',
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = report.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(report.status, 'pass')
    assert.equal(provenanceGate.status, 'pass')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete-looking production evidence is blocked when real outcome target fingerprint is missing', async () => {
  const realOutcome = realProductionOutcomeEvidenceFixture()
  const { target: _target, ...realOutcomeWithoutTarget } = realOutcome
  const {
    root,
    outputRoot,
    profileReport,
    residentialReport,
    reviewEvidence,
    durationEvidence,
    dependencyWriterEvidence,
    runtimePublicationEvidence,
    smokeRollbackEvidence,
    sourceManifest,
  } = await writeCompleteRuntimeEvidenceFixture({
    sourceManifestOverrides: {
      environment: 'production',
      realProductionOutcomeEvidence: realOutcomeWithoutTarget,
    },
  })
  await writeJson(smokeRollbackEvidence, {
    ...smokeRollbackEvidenceFixture(),
    environment: 'production',
    realProductionOutcomeEvidence: realOutcomeWithoutTarget,
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = report.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(provenanceGate.status, 'blocked')
    assert.match(provenanceGate.blockers.join('\n'), /real_production_outcome_target_required/)
    assert.match(provenanceGate.blockers.join('\n'), /real_production_outcome_target_supabase_project_ref_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('production-looking runtime evidence without real outcome marker cannot claim production-ready', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(durationEvidence, durationCalibrationEvidenceFixture())
  await writeJson(dependencyWriterEvidence, dependencyWriterEvidenceFixture())
  await writeJson(runtimePublicationEvidence, runtimePublicationEvidenceFixture())
  await writeJson(smokeRollbackEvidence, {
    ...smokeRollbackEvidenceFixture(),
    environment: 'production',
  })
  await writeJson(sourceManifest, sourceManifestFixture({
    environment: 'production',
    sourceManifestPath: sourceManifest,
  }))

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))

    assert.equal(report.status, 'staging_runtime_chain_passed')
    assert.equal(report.productionReady, false)
    assert.equal(report.runtimeEvidenceChainPassed, true)
    assert.equal(report.productionReadinessBlockers.includes('real_production_or_live_outcome_evidence_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('duration sample collection package with outstanding profile gaps blocks runtime chain readiness', async () => {
  const {
    root,
    outputRoot,
    profileReport,
    residentialReport,
    reviewEvidence,
    durationEvidence,
    dependencyWriterEvidence,
    runtimePublicationEvidence,
    smokeRollbackEvidence,
    sourceManifest,
  } = await writeCompleteRuntimeEvidenceFixture()
  const durationSampleCollectionPackage = path.join(outputRoot, 'duration-sample-collection-package.json')

  await writeJson(durationSampleCollectionPackage, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    status: 'samples_required',
    productionReady: false,
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    requiredStableCodeCount: 2,
    totalRequiredAcceptedSampleCount: 2,
    profileRuntimeReferenceSampleRequestCount: 2,
    blockers: ['accepted_real_duration_samples_required'],
    mutationBoundary: {
      writesDurationSamples: false,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const sampleGate = report.gates.find((gate) => gate.id === 'duration_sample_collection_package')

    assert.equal(report.status, 'blocked')
    assert.equal(report.runtimeEvidenceChainPassed, false)
    assert.equal(sampleGate.status, 'blocked')
    assert.deepEqual(sampleGate.blockers, ['accepted_real_duration_samples_required'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('duration sample coverage evidence can close an outstanding collection package gate', async () => {
  const {
    root,
    outputRoot,
    profileReport,
    residentialReport,
    reviewEvidence,
    durationEvidence,
    dependencyWriterEvidence,
    runtimePublicationEvidence,
    smokeRollbackEvidence,
    sourceManifest,
  } = await writeCompleteRuntimeEvidenceFixture()
  const durationSampleCollectionPackage = path.join(outputRoot, 'duration-sample-collection-package.json')
  const durationSampleCoverageEvidence = path.join(outputRoot, 'duration-sample-coverage-evidence.json')

  await writeJson(durationSampleCollectionPackage, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    status: 'samples_required',
    productionReady: false,
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    requiredStableCodeCount: 2,
    totalRequiredAcceptedSampleCount: 2,
    profileRuntimeReferenceSampleRequestCount: 2,
    sampleRequests: [
      { stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套', requiredAcceptedSampleCount: 1 },
      { stableCode: 'BTMP-SCH-06', title: '竣工验收与开学移交准备', requiredAcceptedSampleCount: 1 },
    ],
    blockers: ['accepted_real_duration_samples_required'],
    mutationBoundary: {
      writesDurationSamples: false,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  })
  await writeJson(durationSampleCoverageEvidence, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-coverage-evidence/v1',
    status: 'covered',
    evidenceLevel: 'sample_collection_coverage_verified_l2',
    productionReady: false,
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    collectionPackageRef: 'duration_sample_collection_package:project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json#sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    sourceEvidenceRef: 'duration_experience_samples_export:project-testing/reports/default-master-plan-production-readiness/source-exports/duration-experience-samples-export.json#sha256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    summary: {
      requiredStableCodeCount: 2,
      totalRequiredAcceptedSampleCount: 2,
      rawSampleCount: 2,
      acceptedMatchedSampleCount: 2,
      coveredStableCodeCount: 2,
      missingStableCodeCount: 0,
      invalidSampleCount: 0,
    },
    rows: [
      { stableCode: 'BTMP-SCH-05', coverageStatus: 'covered', requiredAcceptedSampleCount: 1, acceptedSampleCount: 1, acceptedSampleIds: ['sample-1'] },
      { stableCode: 'BTMP-SCH-06', coverageStatus: 'covered', requiredAcceptedSampleCount: 1, acceptedSampleCount: 1, acceptedSampleIds: ['sample-2'] },
    ],
    blockers: [],
    mutationBoundary: {
      readsDurationSampleCollectionPackage: true,
      readsDurationExperienceSamplesExport: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-sample-collection-package',
      durationSampleCollectionPackage,
      '--duration-sample-coverage-evidence',
      durationSampleCoverageEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const sampleGate = report.gates.find((gate) => gate.id === 'duration_sample_collection_package')

    assert.equal(sampleGate.status, 'pass')
    assert.equal(sampleGate.evidence.coverageEvidenceStatus, 'covered')
    assert.equal(sampleGate.evidence.coveredStableCodeCount, 2)
    assert.equal(report.runtimeEvidenceChainPassed, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('duration sample coverage cannot close non-sample collection package blockers', async () => {
  const {
    root,
    outputRoot,
    profileReport,
    residentialReport,
    reviewEvidence,
    durationEvidence,
    dependencyWriterEvidence,
    runtimePublicationEvidence,
    smokeRollbackEvidence,
    sourceManifest,
  } = await writeCompleteRuntimeEvidenceFixture()
  const durationSampleCollectionPackage = path.join(outputRoot, 'duration-sample-collection-package.json')
  const durationSampleCoverageEvidence = path.join(outputRoot, 'duration-sample-coverage-evidence.json')

  await writeJson(durationSampleCollectionPackage, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    requiredStableCodeCount: 2,
    totalRequiredAcceptedSampleCount: 2,
    profileRuntimeReferenceSampleRequestCount: 2,
    sampleRequests: [
      { stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套', requiredAcceptedSampleCount: 1 },
      { stableCode: 'BTMP-SCH-06', title: '竣工验收与开学移交准备', requiredAcceptedSampleCount: 1 },
    ],
    blockers: [
      'duration_asset_utilization_report_candidate_baseline_refresh_required_before_asset_utilization_review',
      'duration_asset_utilization_report_active_standard_work_duration_seed_missing_for_some_rows',
      'duration_asset_utilization_report_active_t2_rhythm_template_missing_for_some_rows',
      'accepted_real_duration_samples_required',
    ],
    mutationBoundary: {
      writesDurationSamples: false,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  })
  await writeJson(durationSampleCoverageEvidence, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-coverage-evidence/v1',
    status: 'covered',
    evidenceLevel: 'sample_collection_coverage_verified_l2',
    productionReady: false,
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    collectionPackageRef: 'duration_sample_collection_package:project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json#sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    sourceEvidenceRef: 'duration_experience_samples_export:project-testing/reports/default-master-plan-production-readiness/source-exports/duration-experience-samples-export.json#sha256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    summary: {
      requiredStableCodeCount: 2,
      totalRequiredAcceptedSampleCount: 2,
      rawSampleCount: 2,
      acceptedMatchedSampleCount: 2,
      coveredStableCodeCount: 2,
      missingStableCodeCount: 0,
      invalidSampleCount: 0,
    },
    rows: [
      { stableCode: 'BTMP-SCH-05', coverageStatus: 'covered', requiredAcceptedSampleCount: 1, acceptedSampleCount: 1, acceptedSampleIds: ['sample-1'] },
      { stableCode: 'BTMP-SCH-06', coverageStatus: 'covered', requiredAcceptedSampleCount: 1, acceptedSampleCount: 1, acceptedSampleIds: ['sample-2'] },
    ],
    blockers: [],
    mutationBoundary: {
      readsDurationSampleCollectionPackage: true,
      readsDurationExperienceSamplesExport: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-sample-collection-package',
      durationSampleCollectionPackage,
      '--duration-sample-coverage-evidence',
      durationSampleCoverageEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const sampleGate = report.gates.find((gate) => gate.id === 'duration_sample_collection_package')

    assert.equal(report.status, 'blocked')
    assert.equal(report.runtimeEvidenceChainPassed, false)
    assert.equal(sampleGate.status, 'blocked')
    assert.equal(
      sampleGate.blockers.includes('duration_asset_utilization_report_candidate_baseline_refresh_required_before_asset_utilization_review'),
      true,
    )
    assert.equal(
      sampleGate.blockers.includes('duration_asset_utilization_report_active_standard_work_duration_seed_missing_for_some_rows'),
      true,
    )
    assert.equal(
      sampleGate.blockers.includes('duration_asset_utilization_report_active_t2_rhythm_template_missing_for_some_rows'),
      true,
    )
    assert.equal(sampleGate.blockers.includes('accepted_real_duration_samples_required'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runtime seed evidence pipeline blocks readiness when runtime reference-days are still missing', async () => {
  const {
    root,
    outputRoot,
    profileReport,
    residentialReport,
    reviewEvidence,
    durationEvidence,
    dependencyWriterEvidence,
    runtimePublicationEvidence,
    smokeRollbackEvidence,
    sourceManifest,
  } = await writeCompleteRuntimeEvidenceFixture()
  const runtimeSeedEvidencePipeline = path.join(root, 'runtime-seed-evidence-pipeline.json')

  await writeJson(runtimeSeedEvidencePipeline, runtimeSeedEvidencePipelineFixture({
    status: 'runtime_reference_days_evidence_required',
    blockers: ['runtime_reference_days_evidence_missing'],
    summary: {
      preflight: {
        status: 'runtime_seed_evidence_ready',
        blockers: [],
        readyBusinessTypeCount: 11,
        missingBusinessTypeCount: 0,
        requiredRuntimeSeedStableCodeCount: 48,
        runtimeReferenceDays: {
          readyBusinessTypeCount: 10,
          missingBusinessTypeCount: 1,
          missingBusinessTypes: ['school'],
          requiredRuntimeReferenceStableCodes: ['BTMP-SCH-05', 'BTMP-SCH-06'],
          requiredRuntimeReferenceStableCodeCount: 2,
          evidenceLevelRequired: 'runtime_calibrated_l2',
        },
        seedSmokeImportStatus: 'not_required',
      },
      importGate: {
        status: 'runtime_seed_import_not_required',
        importAllowed: false,
        importRequired: false,
        runtimeSeedEvidenceAlreadyReady: true,
        importMode: 'not_required_runtime_seed_evidence_ready',
        coveredStableCodeCount: 48,
        missingStableCodeCount: 0,
        blockers: [],
        manualActions: [],
      },
    },
  }))

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--runtime-seed-evidence-pipeline',
      runtimeSeedEvidencePipeline,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const runtimeSeedGate = report.gates.find((gate) => gate.id === 'runtime_seed_and_reference_days_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.runtimeEvidenceChainPassed, false)
    assert.equal(runtimeSeedGate.status, 'blocked')
    assert.equal(runtimeSeedGate.blockers.includes('runtime_reference_days_evidence_missing'), true)
    assert.equal(runtimeSeedGate.evidence.runtimeReferenceDays.missingBusinessTypeCount, 1)
    assert.deepEqual(runtimeSeedGate.evidence.runtimeReferenceDays.requiredRuntimeReferenceStableCodes, [
      'BTMP-SCH-05',
      'BTMP-SCH-06',
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete-looking staging runtime evidence cannot claim production-ready even without controlled replay markers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(durationEvidence, durationCalibrationEvidenceFixture())
  await writeJson(dependencyWriterEvidence, dependencyWriterEvidenceFixture())
  await writeJson(runtimePublicationEvidence, runtimePublicationEvidenceFixture())
  await writeJson(smokeRollbackEvidence, smokeRollbackEvidenceFixture())
  await writeJson(sourceManifest, sourceManifestFixture({ sourceManifestPath: sourceManifest }))

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))

    assert.equal(report.status, 'staging_runtime_chain_passed')
    assert.equal(report.productionReady, false)
    assert.equal(report.runtimeEvidenceChainPassed, true)
    assert.equal(report.productionReadinessBlockers.includes('staging_or_non_production_environment_not_production_ready'), true)
    assert.equal(report.productionReadinessBlockers.includes('real_production_or_live_outcome_evidence_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('staging controlled replay passes the runtime chain but cannot claim production-ready', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')

  const dependencyWriter = dependencyWriterEvidenceFixture()
  dependencyWriter.domain_writer_result.boundaryPolicy = [
    'staging_writer_replays_default_master_plan_dependencies',
  ]
  dependencyWriter.domain_writer_result.draftNetworkKey = 'default-master-plan-staging-network:baseline-reviewed'

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(durationEvidence, durationCalibrationEvidenceFixture())
  await writeJson(dependencyWriterEvidence, dependencyWriter)
  await writeJson(runtimePublicationEvidence, runtimePublicationEvidenceFixture())
  await writeJson(smokeRollbackEvidence, smokeRollbackEvidenceFixture())
  await writeJson(sourceManifest, sourceManifestFixture({
    sourceManifestPath: sourceManifest,
    sourceExports: {
      ...sourceManifestFixture().sourceExports,
      apiReadSmoke: {
        ...sourceManifestFixture().sourceExports.apiReadSmoke,
        sourcePath: 'project-testing/reports/default-master-plan-production-readiness/staging-runtime/api-read-smoke.json',
      },
    },
  }))

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const gateStatuses = Object.fromEntries(report.gates.map((gate) => [gate.id, gate.status]))
    const markdown = await readFile(path.join(outputRoot, 'readiness.md'), 'utf8')

    assert.equal(report.status, 'staging_runtime_chain_passed')
    assert.equal(report.productionReady, false)
    assert.equal(report.runtimeEvidenceChainPassed, true)
    assert.equal(report.currentEvidenceLevel, 'staging_controlled_replay_runtime_chain')
    assert.equal(report.productionReadinessBlockers.includes('staging_controlled_replay_not_production_ready'), true)
    assert.equal(report.productionReadinessBlockers.includes('real_production_or_live_outcome_evidence_required'), true)
    assert.equal(report.evidenceQualification.controlledReplayMarkerCount > 0, true)
    assert.equal(Object.values(gateStatuses).filter((status) => status === 'blocked').length, 1)
    assert.equal(gateStatuses.production_readiness, 'blocked')
    assert.deepEqual(
      report.gates.find((gate) => gate.id === 'production_readiness')?.blockers,
      report.productionReadinessBlockers,
    )
    assert.match(markdown, /Production ready: no/)
    assert.match(markdown, /staging_controlled_replay_not_production_ready/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('uses default runtime evidence files under output root when explicit evidence paths are omitted', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(outputRoot, 'pm-review-evidence.json')
  const durationEvidence = path.join(outputRoot, 'duration-calibration-evidence.json')
  const dependencyWriterEvidence = path.join(outputRoot, 'dependency-writer-evidence.json')
  const runtimePublicationEvidence = path.join(outputRoot, 'runtime-publication-evidence.json')
  const smokeRollbackEvidence = path.join(outputRoot, 'post-publish-smoke-rollback-evidence.json')
  const sourceManifest = path.join(outputRoot, 'source-exports', 'source-exports-manifest.json')

  const dependencyWriter = dependencyWriterEvidenceFixture()
  dependencyWriter.domain_writer_result.boundaryPolicy = [
    'staging_writer_replays_default_master_plan_dependencies',
  ]

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(durationEvidence, durationCalibrationEvidenceFixture())
  await writeJson(dependencyWriterEvidence, dependencyWriter)
  await writeJson(runtimePublicationEvidence, runtimePublicationEvidenceFixture())
  await writeJson(smokeRollbackEvidence, smokeRollbackEvidenceFixture())
  await writeJson(sourceManifest, sourceManifestFixture({
    sourceManifestPath: sourceManifest,
    sourceExports: {
      ...sourceManifestFixture().sourceExports,
      apiReadSmoke: {
        ...sourceManifestFixture().sourceExports.apiReadSmoke,
        sourcePath: 'project-testing/reports/default-master-plan-production-readiness/staging-runtime/api-read-smoke.json',
      },
    },
  }))

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))

    assert.equal(report.status, 'staging_runtime_chain_passed')
    assert.equal(report.productionReady, false)
    assert.equal(report.runtimeEvidenceChainPassed, true)
    assert.equal(report.currentEvidenceLevel, 'staging_controlled_replay_runtime_chain')
    assert.equal(report.inputs.offlineDevelopmentQualityReview.endsWith('pm-review-evidence.json'), true)
    assert.equal(report.inputs.sourceManifest.endsWith('source-exports/source-exports-manifest.json'), true)
    assert.equal(report.productionReadinessBlockers.includes('staging_controlled_replay_not_production_ready'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete-looking runtime evidence is blocked when source manifest provenance is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(durationEvidence, durationCalibrationEvidenceFixture())
  await writeJson(dependencyWriterEvidence, dependencyWriterEvidenceFixture())
  await writeJson(runtimePublicationEvidence, runtimePublicationEvidenceFixture())
  await writeJson(smokeRollbackEvidence, smokeRollbackEvidenceFixture())

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = report.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(provenanceGate.status, 'blocked')
    assert.equal(provenanceGate.blockers.includes('source_export_manifest_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete-looking runtime evidence is blocked when source manifest omits evidence source records', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(durationEvidence, durationCalibrationEvidenceFixture())
  await writeJson(dependencyWriterEvidence, dependencyWriterEvidenceFixture())
  await writeJson(runtimePublicationEvidence, runtimePublicationEvidenceFixture())
  await writeJson(smokeRollbackEvidence, smokeRollbackEvidenceFixture())
  await writeJson(sourceManifest, sourceManifestFixture({ sourceExports: {}, sourceManifestPath: sourceManifest }))

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = report.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(provenanceGate.status, 'blocked')
    assert.doesNotMatch(provenanceGate.blockers.join('\n'), /reviewExport/)
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_missing_record_for_evidence_ref:durationSamples/)
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_missing_record_for_evidence_ref:taskDependencies/)
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_missing_record_for_evidence_ref:runtimePublications/)
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_missing_record_for_evidence_ref:apiReadSmoke/)
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_missing_record_for_evidence_ref:uiConsumptionSmoke/)
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_missing_record_for_evidence_ref:criticalPathReadback/)
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_missing_record_for_evidence_ref:rollbackVerification/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete-looking runtime evidence is blocked when source manifest identity does not match runtime lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(durationEvidence, durationCalibrationEvidenceFixture())
  await writeJson(dependencyWriterEvidence, dependencyWriterEvidenceFixture())
  await writeJson(runtimePublicationEvidence, runtimePublicationEvidenceFixture())
  await writeJson(smokeRollbackEvidence, smokeRollbackEvidenceFixture())
  await writeJson(sourceManifest, sourceManifestFixture({
    baselineId: 'baseline-from-different-export',
    projectId: 'project-from-different-export',
    publicationKey: 'publication-from-different-export',
    sourceManifestPath: sourceManifest,
  }))

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = report.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(provenanceGate.status, 'blocked')
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_baseline_id_mismatch/)
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_project_id_mismatch/)
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_publication_key_mismatch/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete-looking runtime evidence is blocked when source manifest environment differs from smoke evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(durationEvidence, durationCalibrationEvidenceFixture())
  await writeJson(dependencyWriterEvidence, dependencyWriterEvidenceFixture())
  await writeJson(runtimePublicationEvidence, runtimePublicationEvidenceFixture())
  await writeJson(smokeRollbackEvidence, smokeRollbackEvidenceFixture())
  await writeJson(sourceManifest, sourceManifestFixture({ environment: 'production', sourceManifestPath: sourceManifest }))

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = report.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(provenanceGate.status, 'blocked')
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_environment_mismatch/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete-looking runtime evidence is blocked when source manifest lacks schema or no-write boundary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(durationEvidence, durationCalibrationEvidenceFixture())
  await writeJson(dependencyWriterEvidence, dependencyWriterEvidenceFixture())
  await writeJson(runtimePublicationEvidence, runtimePublicationEvidenceFixture())
  await writeJson(smokeRollbackEvidence, smokeRollbackEvidenceFixture())
  await writeJson(sourceManifest, sourceManifestFixture({
    schemaVersion: 'hand-written-source-manifest/v0',
    mutationBoundary: {
      readsDatabase: true,
      readsSourceFiles: true,
      writesProductionTables: true,
      writesTasks: false,
      writesTaskDependencies: false,
      invokesRuntimeWriters: true,
      writesRuntimePublication: false,
      performsRollback: false,
    },
    sourceManifestPath: sourceManifest,
  }))

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = report.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(provenanceGate.status, 'blocked')
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_schema_version_invalid/)
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_writesProductionTables_must_be_false/)
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_invokesRuntimeWriters_must_be_false/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete-looking runtime evidence is blocked when source manifest still has root blockers', async () => {
  const {
    root,
    outputRoot,
    profileReport,
    residentialReport,
    reviewEvidence,
    durationEvidence,
    dependencyWriterEvidence,
    runtimePublicationEvidence,
    smokeRollbackEvidence,
    sourceManifest,
  } = await writeCompleteRuntimeEvidenceFixture({
    sourceManifestOverrides: {
      blockers: ['durationSamples:row_count_zero'],
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = report.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(provenanceGate.status, 'blocked')
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_blockers_not_empty/)
    assert.equal(provenanceGate.blockers.includes('source_export_manifest_not_exported'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocked source manifest with explicit blockers avoids generic not-exported provenance noise', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')
  const manifest = sourceManifestFixture({
    environment: 'production',
    realProductionOutcomeEvidence: realProductionOutcomeEvidenceFixture(),
    sourceManifestPath: sourceManifest,
  })
  manifest.status = 'blocked'
  manifest.blockers = ['durationSamples:blocked_real_duration_sample_material']
  manifest.sourceExports.durationSamples.kind = 'blocked_real_duration_sample_material'
  manifest.sourceExports.durationSamples.rowCount = 0
  manifest.sourceExports.durationSamples.blockers = ['blocked_real_duration_sample_material']

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(durationEvidence, durationCalibrationEvidenceFixture())
  await writeJson(dependencyWriterEvidence, dependencyWriterEvidenceFixture())
  await writeJson(runtimePublicationEvidence, runtimePublicationEvidenceFixture())
  await writeJson(smokeRollbackEvidence, {
    ...smokeRollbackEvidenceFixture(),
    environment: 'production',
    realProductionOutcomeEvidence: realProductionOutcomeEvidenceFixture(),
  })
  await writeJson(sourceManifest, manifest)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = report.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(provenanceGate.status, 'blocked')
    assert.equal(provenanceGate.blockers.includes('source_export_manifest_blockers_not_empty'), true)
    assert.equal(provenanceGate.blockers.includes('source_export_manifest_record_blocked:durationSamples'), true)
    assert.equal(provenanceGate.blockers.includes('source_export_manifest_not_exported'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runtime source records remain strict while an optional offline review export is ignored', async () => {
  const badExports = {
    reviewExport: {
      ...sourceExportRecord('api_read_smoke', 'project-testing/reports/default-master-plan-production-readiness/pm-review.json', 'd'.repeat(64)),
      kind: 'source_file',
    },
    taskDependencies: {
      ...sourceExportRecord('task_dependencies', 'project-testing/reports/default-master-plan-production-readiness/task-dependencies.json', 'c'.repeat(64)),
      kind: 'database_table',
      table: 'public.duration_experience_samples',
    },
  }
  const {
    root,
    outputRoot,
    profileReport,
    residentialReport,
    reviewEvidence,
    durationEvidence,
    dependencyWriterEvidence,
    runtimePublicationEvidence,
    smokeRollbackEvidence,
    sourceManifest,
  } = await writeCompleteRuntimeEvidenceFixture({
    sourceManifestOverrides: {
      sourceExports: {
        ...sourceManifestFixture().sourceExports,
        ...badExports,
      },
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = report.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(provenanceGate.status, 'blocked')
    assert.doesNotMatch(provenanceGate.blockers.join('\n'), /reviewExport/)
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_table_mismatch_for_evidence_ref:taskDependencies/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete-looking runtime evidence is blocked when source manifest records have zero rows', async () => {
  const {
    root,
    outputRoot,
    profileReport,
    residentialReport,
    reviewEvidence,
    durationEvidence,
    dependencyWriterEvidence,
    runtimePublicationEvidence,
    smokeRollbackEvidence,
    sourceManifest,
  } = await writeCompleteRuntimeEvidenceFixture({
    sourceManifestOverrides: {
      sourceExports: {
        ...sourceManifestFixture().sourceExports,
        durationSamples: {
          ...sourceManifestFixture().sourceExports.durationSamples,
          rowCount: 0,
        },
      },
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = report.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(provenanceGate.status, 'blocked')
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_row_count_required_for_evidence_ref:durationSamples/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete-looking runtime evidence is blocked when source manifest pipeline args omit source manifest or exports', async () => {
  const {
    root,
    outputRoot,
    profileReport,
    residentialReport,
    reviewEvidence,
    durationEvidence,
    dependencyWriterEvidence,
    runtimePublicationEvidence,
    smokeRollbackEvidence,
    sourceManifest,
  } = await writeCompleteRuntimeEvidenceFixture({
    sourceManifestOverrides: {
      outputRoot: 'project-testing/reports/default-master-plan-production-readiness/source-exports',
      pipelineArgs: [
        'node',
        'project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs',
        '--review-export',
        'project-testing/reports/default-master-plan-production-readiness/pm-review.json',
      ],
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = report.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(provenanceGate.status, 'blocked')
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_pipeline_arg_missing:--source-manifest/)
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_pipeline_arg_missing:--duration-samples/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete-looking runtime evidence is blocked when smoke embeds real outcome but source manifest omits its source record', async () => {
  const realOutcome = realProductionOutcomeEvidenceFixture()
  const {
    root,
    outputRoot,
    profileReport,
    residentialReport,
    reviewEvidence,
    durationEvidence,
    dependencyWriterEvidence,
    runtimePublicationEvidence,
    smokeRollbackEvidence,
    sourceManifest,
  } = await writeCompleteRuntimeEvidenceFixture({
    sourceManifestOverrides: {
      environment: 'production',
    },
  })
  await writeJson(smokeRollbackEvidence, {
    ...smokeRollbackEvidenceFixture(),
    environment: 'production',
    realProductionOutcomeEvidence: realOutcome,
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = report.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(provenanceGate.status, 'blocked')
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_real_production_outcome_record_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete-looking runtime evidence is blocked when real outcome source record is omitted from pipeline args', async () => {
  const realOutcome = realProductionOutcomeEvidenceFixture()
  const {
    root,
    outputRoot,
    profileReport,
    residentialReport,
    reviewEvidence,
    durationEvidence,
    dependencyWriterEvidence,
    runtimePublicationEvidence,
    smokeRollbackEvidence,
    sourceManifest,
  } = await writeCompleteRuntimeEvidenceFixture({
    sourceManifestOverrides: {
      environment: 'production',
      realProductionOutcomeEvidence: realOutcome,
    },
  })
  const baseManifest = sourceManifestFixture({
    environment: 'production',
    realProductionOutcomeEvidence: realOutcome,
    sourceManifestPath: sourceManifest,
  })
  const sourceExports = {
    ...baseManifest.sourceExports,
    realProductionOutcome: {
      ...sourceExportRecord(
        'real_production_outcome',
        'project-testing/reports/default-master-plan-production-readiness/real-production-outcome-export.json',
        '7'.repeat(64),
        {
          sourcePath: 'project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json',
          sourceSha256: '7'.repeat(64),
        },
      ),
      realProductionOutcomeEvidence: sourceExportedRealProductionOutcomeEvidenceFixture(realOutcome),
    },
  }
  await writeJson(smokeRollbackEvidence, {
    ...smokeRollbackEvidenceFixture(),
    environment: 'production',
    realProductionOutcomeEvidence: realOutcome,
  })
  const pipelineArgsWithoutRealOutcome = removeFlagAndValue(baseManifest.pipelineArgs, '--real-production-outcome')
  await writeJson(sourceManifest, {
    ...baseManifest,
    sourceExports,
    pipelineArgs: pipelineArgsWithoutRealOutcome,
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = report.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(provenanceGate.status, 'blocked')
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_pipeline_arg_missing:--real-production-outcome/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete-looking runtime evidence is blocked when real outcome evidence ref does not match the manifest source record', async () => {
  const realOutcome = {
    ...realProductionOutcomeEvidenceFixture(),
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/other-real-production-outcome.json#sha256=6666666666666666666666666666666666666666666666666666666666666666',
  }
  const {
    root,
    outputRoot,
    profileReport,
    residentialReport,
    reviewEvidence,
    durationEvidence,
    dependencyWriterEvidence,
    runtimePublicationEvidence,
    smokeRollbackEvidence,
    sourceManifest,
  } = await writeCompleteRuntimeEvidenceFixture({
    sourceManifestOverrides: {
      environment: 'production',
      realProductionOutcomeEvidence: realOutcome,
    },
  })
  await writeJson(smokeRollbackEvidence, {
    ...smokeRollbackEvidenceFixture(),
    environment: 'production',
    realProductionOutcomeEvidence: realOutcome,
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = report.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(provenanceGate.status, 'blocked')
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_real_production_outcome_evidence_ref_source_path_mismatch/)
    assert.match(provenanceGate.blockers.join('\n'), /source_export_manifest_real_production_outcome_evidence_ref_source_sha256_mismatch/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete-looking runtime evidence is blocked when real outcome downstream refs do not match runtime evidence records', async () => {
  const realOutcome = {
    ...realProductionOutcomeEvidenceFixture(),
    runtimePublicationEvidenceRef: 'duration_learning_runtime_publications_export:project-testing/reports/default-master-plan-production-readiness/other-runtime-publications.json#sha256=1111111111111111111111111111111111111111111111111111111111111111',
    runtimeConsumptionEvidenceRef: 'duration_learning_runtime_consumptions_export:project-testing/reports/default-master-plan-production-readiness/other-runtime-consumptions.json#sha256=6666666666666666666666666666666666666666666666666666666666666666',
    apiReadSmokeEvidenceRef: 'api_read_smoke_export:project-testing/reports/default-master-plan-production-readiness/other-api-read-smoke.json#sha256=2222222222222222222222222222222222222222222222222222222222222222',
    uiConsumptionSmokeEvidenceRef: 'ui_consumption_smoke_export:project-testing/reports/default-master-plan-production-readiness/other-ui-smoke.json#sha256=3333333333333333333333333333333333333333333333333333333333333333',
    criticalPathReadbackEvidenceRef: 'critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/other-critical-path-readback.json#sha256=4444444444444444444444444444444444444444444444444444444444444444',
    rollbackEvidenceRef: 'rollback_verification_export:project-testing/reports/default-master-plan-production-readiness/other-rollback-smoke.json#sha256=5555555555555555555555555555555555555555555555555555555555555555',
  }
  const {
    root,
    outputRoot,
    profileReport,
    residentialReport,
    reviewEvidence,
    durationEvidence,
    dependencyWriterEvidence,
    runtimePublicationEvidence,
    smokeRollbackEvidence,
    sourceManifest,
  } = await writeCompleteRuntimeEvidenceFixture({
    sourceManifestOverrides: {
      environment: 'production',
      realProductionOutcomeEvidence: realOutcome,
    },
  })
  await writeJson(smokeRollbackEvidence, {
    ...smokeRollbackEvidenceFixture(),
    environment: 'production',
    realProductionOutcomeEvidence: realOutcome,
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = report.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(provenanceGate.status, 'blocked')
    assert.match(provenanceGate.blockers.join('\n'), /real_production_outcome_runtime_publication_evidence_ref_mismatch/)
    assert.match(provenanceGate.blockers.join('\n'), /real_production_outcome_runtime_consumption_evidence_ref_mismatch/)
    assert.match(provenanceGate.blockers.join('\n'), /real_production_outcome_api_read_smoke_evidence_ref_mismatch/)
    assert.match(provenanceGate.blockers.join('\n'), /real_production_outcome_ui_consumption_smoke_evidence_ref_mismatch/)
    assert.match(provenanceGate.blockers.join('\n'), /real_production_outcome_critical_path_readback_evidence_ref_mismatch/)
    assert.match(provenanceGate.blockers.join('\n'), /real_production_outcome_rollback_evidence_ref_mismatch/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete-looking evidence is blocked when baseline, project, or publication lineage does not match', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(durationEvidence, {
    ...durationCalibrationEvidenceFixture(),
    projectId: 'project-duration-only',
  })
  await writeJson(dependencyWriterEvidence, {
    ...dependencyWriterEvidenceFixture(),
    baselineId: 'baseline-dependency-only',
  })
  await writeJson(runtimePublicationEvidence, {
    ...runtimePublicationEvidenceFixture(),
    publication: {
      ...runtimePublicationEvidenceFixture().publication,
      dependencyWriterReleaseRecordTarget: 'different-release-target',
      rollbackTarget: 'rollback:different-runtime-publication',
    },
  })
  await writeJson(smokeRollbackEvidence, {
    ...smokeRollbackEvidenceFixture(),
    publicationKey: 'different-publication-key',
    apiReadSmoke: {
      ...smokeRollbackEvidenceFixture().apiReadSmoke,
      publicationKey: 'different-publication-key',
    },
    uiConsumptionSmoke: {
      ...smokeRollbackEvidenceFixture().uiConsumptionSmoke,
      publicationKey: 'different-publication-key',
    },
    criticalPathReadback: {
      ...smokeRollbackEvidenceFixture().criticalPathReadback,
      publicationKey: 'different-publication-key',
    },
    rollbackVerification: {
      ...smokeRollbackEvidenceFixture().rollbackVerification,
      publicationKey: 'different-publication-key',
      rollbackTarget: 'rollback:different-publication-key',
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const lineageGate = report.gates.find((gate) => gate.id === 'runtime_evidence_lineage_consistency')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(lineageGate.status, 'blocked')
    assert.match(lineageGate.blockers.join('\n'), /project_id_mismatch/)
    assert.match(lineageGate.blockers.join('\n'), /baseline_id_mismatch/)
    assert.match(lineageGate.blockers.join('\n'), /publication_key_mismatch/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('complete-looking evidence is blocked when it lacks evidence-builder no-write mutation boundaries', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, withoutMutationBoundary(reviewEvidenceFixture()))
  await writeJson(durationEvidence, withoutMutationBoundary(durationCalibrationEvidenceFixture()))
  await writeJson(dependencyWriterEvidence, withoutMutationBoundary(dependencyWriterEvidenceFixture()))
  await writeJson(runtimePublicationEvidence, withoutMutationBoundary(runtimePublicationEvidenceFixture()))
  await writeJson(smokeRollbackEvidence, withoutMutationBoundary(smokeRollbackEvidenceFixture()))

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--duration-calibration-evidence',
      durationEvidence,
      '--dependency-writer-evidence',
      dependencyWriterEvidence,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const blockedGateText = report.gates.flatMap((gate) => gate.blockers ?? []).join('\n')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.doesNotMatch(blockedGateText, /project_manager_review_evidence_mutation_boundary_required/)
    assert.match(blockedGateText, /runtime_duration_calibration_evidence_mutation_boundary_required/)
    assert.match(blockedGateText, /production_dependency_writer_evidence_mutation_boundary_required/)
    assert.match(blockedGateText, /runtime_publication_evidence_mutation_boundary_required/)
    assert.match(blockedGateText, /post_publish_smoke_and_rollback_evidence_mutation_boundary_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runtime publication evidence is blocked when export hashes or trusted consumption baseline identity do not match', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  const evidence = runtimePublicationEvidenceFixture()
  evidence.publicationEvidenceRef = 'manual-runtime-publication-note'
  evidence.consumptionEvidenceRef = 'manual-runtime-consumption-note'
  evidence.consumptions[0].baselineId = 'baseline-from-other-chain'
  await writeJson(runtimePublicationEvidence, evidence)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const publicationGate = report.gates.find((gate) => gate.id === 'runtime_publication_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(publicationGate.status, 'blocked')
    assert.match(publicationGate.blockers.join('\n'), /runtime_publication_export_hash_required/)
    assert.match(publicationGate.blockers.join('\n'), /runtime_consumption_export_hash_required/)
    assert.match(publicationGate.blockers.join('\n'), /runtime_consumption_baseline_id_mismatch/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runtime publication evidence rejects cross-scope consumption and user metadata authority', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  const evidence = runtimePublicationEvidenceFixture()
  evidence.publication.companyId = 'company-from-other-scope'
  evidence.publication.projectId = 'project-from-other-scope'
  evidence.consumptions[0].sourceEvidenceRefs = ['task_metadata:forged-publication-lineage']
  evidence.consumptions[0].consumptionContext = { authoritySource: 'task_metadata' }
  await writeJson(runtimePublicationEvidence, evidence)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--runtime-publication-evidence',
      runtimePublicationEvidence,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const publicationGate = report.gates.find((gate) => gate.id === 'runtime_publication_evidence')

    assert.equal(publicationGate.status, 'blocked')
    assert.match(publicationGate.blockers.join('\n'), /runtime_publication_project_scope_mismatch/)
    assert.match(publicationGate.blockers.join('\n'), /runtime_consumption_company_scope_mismatch/)
    assert.match(publicationGate.blockers.join('\n'), /runtime_consumption_resolver_authority_required/)
    assert.match(publicationGate.blockers.join('\n'), /runtime_consumption_publication_source_ref_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('duration calibration evidence is blocked when it lacks duration sample export hash or sample ids', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const durationEvidence = path.join(root, 'duration-calibration.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(durationEvidence, {
    ...durationCalibrationEvidenceFixture(),
    sourceEvidenceRef: 'manual-duration-calibration-note',
    runtimeReferenceDays: [{
      stableCode: '01-01',
      p50Days: 10,
      p80Days: 14,
      sampleCount: 2,
      source: 'accepted_real_project_outcome',
      sourceSampleIds: [],
    }],
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--duration-calibration-evidence',
      durationEvidence,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const durationGate = report.gates.find((gate) => gate.id === 'runtime_duration_calibration_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(durationGate.status, 'blocked')
    assert.match(durationGate.blockers.join('\n'), /duration_experience_samples_export_hash_required/)
    assert.match(durationGate.blockers.join('\n'), /runtime_reference_days_must_include_source_sample_ids/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('duration calibration evidence is blocked when it lacks verified coverage evidence hash lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const durationEvidence = path.join(root, 'duration-calibration.json')

  const evidenceWithoutCoverageRef = durationCalibrationEvidenceFixture()
  delete evidenceWithoutCoverageRef.coverageEvidenceRef

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(durationEvidence, evidenceWithoutCoverageRef)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--duration-calibration-evidence',
      durationEvidence,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const durationGate = report.gates.find((gate) => gate.id === 'runtime_duration_calibration_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(durationGate.status, 'blocked')
    assert.match(durationGate.blockers.join('\n'), /duration_sample_coverage_evidence_hash_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('post-publish smoke evidence is blocked when nested smoke records do not identify the same runtime lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(smokeRollbackEvidence, {
    schemaVersion: 'workbuddy-default-master-plan-post-publish-smoke-rollback-evidence/v1',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    environment: 'staging',
    testedAt: '2026-07-01T08:30:00.000Z',
    apiReadSmoke: {
      status: 'pass',
      evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json',
    },
    uiConsumptionSmoke: {
      status: 'pass',
      evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/ui-smoke.json',
    },
    criticalPathReadback: {
      status: 'pass',
      evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json',
    },
    rollbackVerification: {
      status: 'pass',
      rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
      evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/rollback-smoke.json',
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--post-publish-smoke-rollback-evidence',
      smokeRollbackEvidence,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const smokeGate = report.gates.find((gate) => gate.id === 'post_publish_smoke_and_rollback_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(smokeGate.status, 'blocked')
    assert.match(smokeGate.blockers.join('\n'), /api_read_smoke_baseline_id_required/)
    assert.match(smokeGate.blockers.join('\n'), /ui_consumption_smoke_project_id_required/)
    assert.match(smokeGate.blockers.join('\n'), /critical_path_readback_publication_key_required/)
    assert.match(smokeGate.blockers.join('\n'), /rollback_verification_baseline_id_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('legacy serial removal gate covers active server materializer paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
  ].join('\n'), 'utf8')
  const checkerSource = await readFile(SCRIPT_PATH, 'utf8')
  assert.match(checkerSource, /planningBootstrap_old_serial_materializer_name_still_present/)
  assert.match(checkerSource, /wbs_route_old_serial_materializer_name_still_present/)
  assert.match(checkerSource, /default_master_plan_profile_still_uses_name_heuristic/)
  assert.match(checkerSource, /default_master_plan_profile_missing_explicit_entry_gate/)
  assert.match(checkerSource, /default_master_plan_entry_gate_missing_system_scope_check/)
  assert.match(checkerSource, /default_master_plan_entry_gate_missing_standard_code_check/)
  assert.match(checkerSource, /default_master_plan_entry_gate_missing_explicit_entry_code_whitelist/)
  assert.match(checkerSource, /default_master_plan_entry_gate_missing_published_row_check/)
  assert.match(checkerSource, /default_master_plan_entry_installer_marks_entries_as_draft/)
  assert.match(checkerSource, /default_master_plan_entry_gate_still_allows_generic_code_contains_match/)
  assert.match(checkerSource, /from_template_missing_direct_failure_marker/)
  assert.match(checkerSource, /from_template_missing_legacy_fallback_removal_marker/)
  assert.match(checkerSource, /from_template_still_returns_legacy_fallback/)
  assert.match(checkerSource, /from_template_still_returns_controlled_degradation/)
  assert.match(checkerSource, /from_template_still_returns_fallback_applied/)
  assert.match(checkerSource, /from_template_still_returns_handoff_generation_mode/)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const legacyGate = report.gates.find((gate) => gate.id === 'legacy_serial_template_path_removed')

    assert.equal(legacyGate.status, 'pass')
    assert.deepEqual(legacyGate.evidence.gaps, [])
    assert.equal(
      legacyGate.evidence.guardTestEvidence.sourcePath,
      'server/src/__tests__/wbsTemplateLegacySerialPathRemoval.test.ts',
    )
    assert.deepEqual(legacyGate.evidence.guardTestEvidence.coverage, {
      planningBootstrapSerialMaterializerRemoved: true,
      wbsRouteSerialMaterializerRemoved: true,
      fromTemplateDirectFailureMarkers: true,
      reverseBootstrapRoutesRemoved: true,
      embeddedTemplateSurfaceRetained: true,
      embeddedTemplateCanonicalEndpointOnly: true,
      legacyImportSanitizerRetiredEndpointCoverageRemoved: true,
      explicitEntryPublishedRowGate: true,
    })
    assert.equal(
      legacyGate.evidence.behaviorGuardTestEvidence.sourcePath,
      'server/src/__tests__/wbsTemplatesApply.test.ts',
    )
    assert.deepEqual(legacyGate.evidence.behaviorGuardTestEvidence.coverage, {
      lowInformationLegacyTemplateDirectFailure: true,
      conflictingLegacyTemplateDirectFailure: true,
      draftExplicitEntryDirectFailure: true,
      statusDraftExplicitEntryDirectFailure: true,
      noControlledDegradationMarkers: true,
      noGenerationOrBaselineWritesOnDirectFailure: true,
    })
    assert.deepEqual(legacyGate.evidence.manualComparisonGuardEvidence.coverage, {
      scenarioOptionComparisonPackageReadOnly: true,
      networkOptionComparisonPackageReadOnly: true,
      scenarioOptionComparisonGuardTestCoverage: true,
      networkOptionComparisonGuardTestCoverage: true,
      networkDomainWriterComparisonSourceBoundary: true,
      networkDomainWriterComparisonGuardTestCoverage: true,
      frontendDoesNotSynthesizeMissingOptionComparisonPackage: true,
      frontendMissingOptionComparisonPackageGuardTestCoverage: true,
      evidenceSourceGuardBlocksOptionComparisonSources: true,
      evidenceSourceGuardOptionComparisonTestCoverage: true,
      evidenceSourceGuardNestedLineageCoverage: true,
      evidenceSourceGuardGovernanceFieldCoverage: true,
      evidenceSourceManifestGovernanceFieldCoverage: true,
      candidateExportHygieneRootSourceGuardCoverage: true,
      serverDependencyWriterEvidenceFlowGovernanceFieldCoverage: true,
      dependencyWriterEvidenceRootPayloadGovernanceFieldCoverage: true,
      sourceExportMetadataScansPayloadRowsForNestedSourceLineage: true,
      sourceExportMetadataGovernanceFieldCoverage: true,
      sourceExportMetadataRetiredRuntimeWriterBoundary: true,
      productionPipelineRootPayloadGovernanceFieldCoverage: true,
      productionSourceExporterRootPayloadGovernanceFieldCoverage: true,
      canonicalDurationLearningPublicationConsumptionBoundaryCoverage: true,
      sourceExportMetadataSeparatesCanonicalAndLegacyRuntimeAliases: true,
      sourceExportMetadataCanonicalSourceIdentityCoverage: true,
      runtimePublicationEvidenceCanonicalPairGuardCoverage: true,
      durationSampleGapPlannerCandidateBaselineSourceGuardCoverage: true,
      durationSampleCollectionGapPlanSourceGuardCoverage: true,
      durationSampleCollectionProfileReportSourceGuardCoverage: true,
      runtimeMaterialPackageHandoffSourceGuardCoverage: true,
      realProductionOutcomePackageRootSourceGuardCoverage: true,
      operatorHandoffCandidateBaselineRootSourceGuardCoverage: true,
      operatorHandoffSupportingPackageSourceGuardCoverage: true,
      operatorHandoffPreflightDurationSampleProfileReportContractCoverage: true,
      candidateDiscoveryScansBaselineItemSourceMetadata: true,
      candidateDiscoveryProfileLineageNormalizationCoverage: true,
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeCompleteRuntimeEvidenceFixture({ sourceManifestOverrides = {} } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-readiness-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')

  await writeJson(profileReport, profileReportFixture())
  await writeFile(residentialReport, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(durationEvidence, durationCalibrationEvidenceFixture())
  await writeJson(dependencyWriterEvidence, dependencyWriterEvidenceFixture())
  await writeJson(runtimePublicationEvidence, runtimePublicationEvidenceFixture())
  await writeJson(smokeRollbackEvidence, smokeRollbackEvidenceFixture())
  await writeJson(sourceManifest, sourceManifestFixture({
    ...sourceManifestOverrides,
    sourceManifestPath: sourceManifest,
  }))

  return {
    root,
    outputRoot,
    profileReport,
    residentialReport,
    reviewEvidence,
    durationEvidence,
    dependencyWriterEvidence,
    runtimePublicationEvidence,
    smokeRollbackEvidence,
    sourceManifest,
  }
}

function withoutMutationBoundary(value) {
  const copy = structuredClone(value)
  delete copy.mutationBoundary
  delete copy.mutation_boundary
  return copy
}

function reviewEvidenceFixture() {
  return {
    schemaVersion: 'workbuddy-candidate-default-master-plan-review-evidence/v1',
    baselineId: 'baseline-reviewed',
    sourceEvidenceRef: 'candidate_default_master_plan_review_export:project-testing/reports/default-master-plan-production-readiness/pm-review.json#sha256=dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    candidate_governance_review: {
      decision: 'accepted_for_baseline',
      reviewed_by: 'owner-1',
      reviewed_at: '2026-07-01T06:30:00.000Z',
      reviewed_item_ids: ['candidate-item-1'],
      reviewed_item_count: 1,
      acknowledged_blockers: REVIEW_BLOCKERS,
      review_notes: '项目经理已复核候选默认主计划，可作为当前项目基线发布。',
      production_ready: false,
    },
    change_log: {
      entity_type: 'baseline',
      entity_id: 'baseline-reviewed',
      field_name: 'candidate_default_master_plan_review',
    },
    mutationBoundary: {
      readsCandidateReviewExport: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesSeeds: false,
      writesBaselines: false,
    },
  }
}

function durationCalibrationEvidenceFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-duration-calibration-evidence/v1',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    status: 'runtime_calibrated',
    evidenceLevel: 'runtime_calibrated_l2',
    source: 'runtime_duration_calibration',
    acceptedRealDurationSampleCount: 4,
    calibratedReferenceDayCount: 60,
    calibrationDeltaCount: 12,
    calibratedBy: 'duration-governance-1',
    calibratedAt: '2026-07-01T07:30:00.000Z',
    sourceEvidenceRef: 'duration_experience_samples_export:project-testing/reports/default-master-plan-production-readiness/duration-experience-samples.json#sha256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    coverageEvidenceRef: 'duration_sample_coverage_evidence:project-testing/reports/default-master-plan-production-readiness/duration-sample-coverage-evidence.json#sha256=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    runtimeReferenceDays: [{
      stableCode: '01-01',
      p50Days: 10,
      p80Days: 14,
      sampleCount: 2,
      source: 'accepted_real_project_outcome',
      sourceSampleIds: ['sample-1', 'sample-2'],
    }],
    calibrationDeltas: [{
      stableCode: '01-01',
      coldStartDays: 8,
      calibratedDays: 10,
    }],
    mutationBoundary: {
      readsDurationExperienceSamplesExport: true,
      readsDurationSampleCoverageEvidence: true,
      writesProductionTables: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      writesSeeds: false,
    },
  }
}

function dependencyWriterEvidenceFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-dependency-writer-evidence/v1',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    execution_mode: 'execute',
    sourceEvidenceRef: 'task_dependencies_export:project-testing/reports/default-master-plan-production-readiness/task-dependencies.json#sha256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    candidate_default_master_plan: {
      generation_mode: 'residential_master_plan_v2',
      source_version_label: 'residential_master_plan_v2',
      candidate_default_master_plan_baseline: true,
    },
    task_mapping: {
      status: 'runtime_task_mapping_verified',
      mapped_generated_row_count: 2,
      mapped_task_count: 2,
      unresolved_generated_row_ids: [],
    },
    domain_writer_result: {
      source: 'construction_organization_plan_network_domain_writer',
      status: 'runtime_apply_ready',
      writesTaskDependencies: true,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      insertedDependencyCount: 1,
      skippedDependencyCount: 0,
      releaseRecordPersisted: true,
      draftNetworkKey: 'default-master-plan-network-1',
      releaseHandoffCandidateEventId: 'event-release-1',
      releaseRecordTarget: 'default-master-plan-runtime-publication-1',
      rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
      appliedDependencies: [{
        edgeId: 'edge-1',
        taskId: 'task-2',
        dependencyTaskId: 'task-1',
        dependencyType: 'FS',
        lagDays: 0,
        sourceType: 'construction_organization_plan_network',
        sourceRefId: null,
        sourceEventId: 'event-release-1',
        intent: 'residential_master_plan_v2_sequence',
      }],
      reasons: [],
    },
    critical_path_recalculation: {
      status: 'readback_passed',
      evidence_ref: 'project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json',
    },
    mutationBoundary: {
      readsWriterResult: true,
      readsTaskDependenciesExport: true,
      readsCriticalPathReadback: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesSeeds: false,
      writesBaselines: false,
    },
  }
}

function runtimePublicationEvidenceFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-publication-evidence/v2',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    publicationKey: CANONICAL_RUNTIME_PUBLICATION_KEY,
    status: 'runtime_consumed',
    source: 'canonical_duration_learning_runtime_evidence_builder',
    sourceEvidenceRef: CANONICAL_RUNTIME_PUBLICATION_REF,
    sourceEvidenceRefs: [CANONICAL_RUNTIME_PUBLICATION_REF, CANONICAL_RUNTIME_CONSUMPTION_REF],
    publicationEvidenceRef: CANONICAL_RUNTIME_PUBLICATION_REF,
    consumptionEvidenceRef: CANONICAL_RUNTIME_CONSUMPTION_REF,
    publication: {
      source: 'duration_learning_runtime_publications',
      publicationKey: CANONICAL_RUNTIME_PUBLICATION_KEY,
      assetKey: 'wbs_reference_days',
      artifactKey: 'facade-v3',
      scopeLevel: 'project',
      companyId: 'company-1',
      projectId: 'project-1',
      publicationStage: 'stable',
      monitoringStatus: 'passed',
      publishedAt: '2026-07-01T08:00:00.000Z',
    },
    consumptions: [{
      source: 'duration_learning_runtime_consumptions',
      consumptionKey: 'duration-learning-consumption:task-1',
      companyId: 'company-1',
      projectId: 'project-1',
      publicationKey: CANONICAL_RUNTIME_PUBLICATION_KEY,
      assetKey: 'wbs_reference_days',
      artifactKey: 'facade-v3',
      consumerKey: 'wbsTemplateGenerationService',
      consumerSurface: 'project_wizard_commit',
      taskId: 'task-1',
      baselineItemId: null,
      baselineId: 'baseline-reviewed',
      baselineProjectId: 'project-1',
      baselineCompanyId: 'company-1',
      baselineAuthority: 'task_baseline_items_physical_join',
      durationDayBasis: 'construction_production_day',
      sourceEvidenceRefs: [`duration_learning_runtime_publications:${CANONICAL_RUNTIME_PUBLICATION_KEY}`],
      consumptionContext: { authoritySource: 'runtime_resolver_publication_set' },
      consumedAt: '2026-07-01T08:05:00.000Z',
    }],
    trustedConsumptionCount: 1,
    releaseLineage: {
      projectManagerReviewEvidenceRef: 'pm-review.json',
      durationCalibrationEvidenceRef: 'duration-calibration.json',
      dependencyWriterEvidenceRef: 'dependency-writer.json',
    },
    mutationBoundary: {
      readsRuntimePublicationExport: true,
      readsRuntimeConsumptionExport: true,
      writesProductionTables: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesSeeds: false,
      writesBaselines: false,
    },
  }
}

function smokeRollbackEvidenceFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-post-publish-smoke-rollback-evidence/v1',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    publicationKey: CANONICAL_RUNTIME_PUBLICATION_KEY,
    environment: 'staging',
    testedAt: '2026-07-01T08:30:00.000Z',
    apiReadSmoke: {
      status: 'pass',
      baselineId: 'baseline-reviewed',
      projectId: 'project-1',
      publicationKey: CANONICAL_RUNTIME_PUBLICATION_KEY,
      evidenceRef: 'api_read_smoke_export:project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json#sha256=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    },
    uiConsumptionSmoke: {
      status: 'pass',
      baselineId: 'baseline-reviewed',
      projectId: 'project-1',
      publicationKey: CANONICAL_RUNTIME_PUBLICATION_KEY,
      evidenceRef: 'ui_consumption_smoke_export:project-testing/reports/default-master-plan-production-readiness/ui-smoke.json#sha256=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    },
    criticalPathReadback: {
      status: 'pass',
      baselineId: 'baseline-reviewed',
      projectId: 'project-1',
      publicationKey: CANONICAL_RUNTIME_PUBLICATION_KEY,
      evidenceRef: 'critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=9999999999999999999999999999999999999999999999999999999999999999',
    },
    rollbackVerification: {
      status: 'pass',
      baselineId: 'baseline-reviewed',
      projectId: 'project-1',
      publicationKey: CANONICAL_RUNTIME_PUBLICATION_KEY,
      rollbackTarget: `rollback:${CANONICAL_RUNTIME_PUBLICATION_KEY}`,
      evidenceRef: 'rollback_verification_export:project-testing/reports/default-master-plan-production-readiness/rollback-smoke.json#sha256=8888888888888888888888888888888888888888888888888888888888888888',
    },
    mutationBoundary: {
      readsSmokeEvidenceFiles: true,
      writesProductionTables: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesSeeds: false,
      writesBaselines: false,
      performsRollback: false,
    },
  }
}

function runtimeSeedEvidencePipelineFixture(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-evidence-pipeline/v1',
    source: 'run-default-master-plan-runtime-seed-evidence-pipeline',
    generatedAt: '2026-07-01T08:00:00.000Z',
    status: 'runtime_seed_import_not_required',
    blockers: [],
    reports: {
      preflight: {
        key: 'preflight',
        path: 'project-testing/reports/default-master-plan-production-readiness/runtime-seed-preflight.json',
        sha256: '1'.repeat(64),
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-preflight/v1',
        status: 'runtime_seed_evidence_ready',
      },
    },
    summary: {
      preflight: {
        status: 'runtime_seed_evidence_ready',
        blockers: [],
        readyBusinessTypeCount: 11,
        missingBusinessTypeCount: 0,
        requiredRuntimeSeedStableCodeCount: 48,
        runtimeReferenceDays: {
          readyBusinessTypeCount: 11,
          missingBusinessTypeCount: 0,
          missingBusinessTypes: [],
          requiredRuntimeReferenceStableCodes: [],
          requiredRuntimeReferenceStableCodeCount: 0,
          evidenceLevelRequired: 'runtime_calibrated_l2',
        },
        seedSmokeImportStatus: 'not_required',
      },
      environment: {
        status: 'ready',
        targetClass: 'local',
        localSupabaseReachable: true,
        environmentBlockers: [],
        upstreamEvidenceBlockers: [],
      },
      coverage: {
        status: 'covered',
        requiredStableCodeCount: 48,
        coveredStableCodeCount: 48,
        missingStableCodeCount: 0,
        missingStableCodes: [],
        runtimeSeedImportRequired: false,
        runtimeSeedEvidenceAlreadyReady: true,
      },
      importGate: {
        status: 'runtime_seed_import_not_required',
        importAllowed: false,
        importRequired: false,
        runtimeSeedEvidenceAlreadyReady: true,
        importMode: 'not_required_runtime_seed_evidence_ready',
        blockers: [],
        manualActions: [],
      },
    },
    productionReady: false,
    mutationBoundary: {
      runsReadOnlyEvidenceScripts: true,
      readsRuntimeSeedReports: true,
      writesEvidenceReportsOnly: true,
      writesProductionTables: false,
      writesAlgorithmSeedVersions: false,
      writesAlgorithmSeedRecords: false,
      writesAlgorithmSeedImportLogs: false,
      writesDurationSamples: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesBaselines: false,
    },
    ...overrides,
  }
}

function realProductionOutcomeEvidenceFixture() {
  return {
    status: 'verified',
    environment: 'production',
    target: {
      envFileRef: 'deploy/env/production.env',
      supabaseProjectRef: 'production-ref-1',
      databaseHost: 'db.production-ref-1.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      environment: 'production',
    },
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json#sha256=7777777777777777777777777777777777777777777777777777777777777777',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    publicationKey: CANONICAL_RUNTIME_PUBLICATION_KEY,
    acceptedBy: 'production-owner:9e4a5570-0032-43bd-8f17-0bc415a1eb70',
    acceptedAt: '2026-07-01T09:00:00.000Z',
    approvalRef: 'approval:production-release-window-1',
    runtimePublicationEvidenceRef: CANONICAL_RUNTIME_PUBLICATION_REF,
    runtimeConsumptionEvidenceRef: CANONICAL_RUNTIME_CONSUMPTION_REF,
    apiReadSmokeEvidenceRef: 'api_read_smoke_export:project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json#sha256=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    uiConsumptionSmokeEvidenceRef: 'ui_consumption_smoke_export:project-testing/reports/default-master-plan-production-readiness/ui-smoke.json#sha256=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    criticalPathReadbackEvidenceRef: 'critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=9999999999999999999999999999999999999999999999999999999999999999',
    rollbackEvidenceRef: 'rollback_verification_export:project-testing/reports/default-master-plan-production-readiness/rollback-smoke.json#sha256=8888888888888888888888888888888888888888888888888888888888888888',
  }
}

const DEFAULT_REAL_PRODUCTION_OUTCOME_SOURCE_PATH = 'project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json'
const DEFAULT_REAL_PRODUCTION_OUTCOME_SOURCE_SHA = '7777777777777777777777777777777777777777777777777777777777777777'
const DEFAULT_REAL_PRODUCTION_OUTCOME_RAW_REF = `${DEFAULT_REAL_PRODUCTION_OUTCOME_SOURCE_PATH}#sha256=${DEFAULT_REAL_PRODUCTION_OUTCOME_SOURCE_SHA}`
const DEFAULT_REAL_PRODUCTION_OUTCOME_SOURCE_EXPORT_REF = `real_production_outcome_export:${DEFAULT_REAL_PRODUCTION_OUTCOME_RAW_REF}`

function sourceExportedRealProductionOutcomeEvidenceFixture(overrides = {}) {
  const evidenceRef = overrides.evidenceRef
  const shouldUseDefaultSourceExportRef = !evidenceRef || evidenceRef === DEFAULT_REAL_PRODUCTION_OUTCOME_RAW_REF
  return {
    ...overrides,
    evidenceRef: shouldUseDefaultSourceExportRef ? DEFAULT_REAL_PRODUCTION_OUTCOME_SOURCE_EXPORT_REF : evidenceRef,
  }
}

function sourceManifestFixture(overrides = {}) {
  const { sourceManifestPath = null, realProductionOutcomeEvidence = null, ...manifestOverrides } = overrides
  const manifest = {
    schemaVersion: 'workbuddy-default-master-plan-production-source-exports/v1',
    status: 'exported',
    exportSessionId: 'default-master-plan-source-export:2026-07-01T08:00:00.000Z:session',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    publicationKey: CANONICAL_RUNTIME_PUBLICATION_KEY,
    phase: 'all',
    environment: 'staging',
    exportedBy: 'release-user-1',
    outputRoot: 'project-testing/reports/default-master-plan-production-readiness/source-exports',
    sourceExports: {
      reviewExport: dbSourceExportRecord('candidate_default_master_plan_review', 'public.change_logs', 'project-testing/reports/default-master-plan-production-readiness/pm-review.json', 'd'.repeat(64)),
      durationSamples: dbSourceExportRecord('duration_experience_samples', 'public.duration_experience_samples', 'project-testing/reports/default-master-plan-production-readiness/duration-experience-samples.json', 'b'.repeat(64)),
      taskDependencies: dbSourceExportRecord('task_dependencies', 'public.task_dependencies', 'project-testing/reports/default-master-plan-production-readiness/task-dependencies.json', 'c'.repeat(64)),
      runtimePublications: dbSourceExportRecord('duration_learning_runtime_publications', 'public.duration_learning_runtime_publications', 'project-testing/reports/default-master-plan-production-readiness/runtime-publications.json', 'a'.repeat(64)),
      runtimeConsumptions: dbSourceExportRecord('duration_learning_runtime_consumptions', 'public.duration_learning_runtime_consumptions', 'project-testing/reports/default-master-plan-production-readiness/runtime-consumptions.json', '6'.repeat(64)),
      apiReadSmoke: sourceExportRecord('api_read_smoke', 'project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json', 'e'.repeat(64)),
      uiConsumptionSmoke: sourceExportRecord('ui_consumption_smoke', 'project-testing/reports/default-master-plan-production-readiness/ui-smoke.json', 'f'.repeat(64)),
      criticalPathReadback: sourceExportRecord('critical_path_readback', 'project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json', '9'.repeat(64)),
      rollbackVerification: sourceExportRecord('rollback_verification', 'project-testing/reports/default-master-plan-production-readiness/rollback-smoke.json', '8'.repeat(64)),
    },
    blockers: [],
    mutationBoundary: {
      readsDatabase: true,
      readsSourceFiles: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      invokesRuntimeWriters: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
    ...manifestOverrides,
  }
  if (realProductionOutcomeEvidence) {
    manifest.sourceExports = {
      ...manifest.sourceExports,
      realProductionOutcome: {
        ...sourceExportRecord(
          'real_production_outcome',
          'project-testing/reports/default-master-plan-production-readiness/real-production-outcome-export.json',
          '7'.repeat(64),
          {
            sourcePath: 'project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json',
            sourceSha256: '7'.repeat(64),
          },
        ),
        realProductionOutcomeEvidence: sourceExportedRealProductionOutcomeEvidenceFixture(realProductionOutcomeEvidence),
      },
    }
  }
  return {
    ...manifest,
    pipelineArgs: manifest.pipelineArgs ?? sourceManifestPipelineArgs(manifest, sourceManifestPath),
  }
}

function sourceExportRecord(source, sourcePath, sha256, extra = {}) {
  return {
    source,
    kind: 'source_file',
    sourcePath,
    ...extra,
    path: sourcePath,
    sha256,
    rowCount: 1,
    blockers: [],
  }
}

function removeFlagAndValue(args, flag) {
  const index = args.indexOf(flag)
  if (index === -1) return args
  return args.filter((_, itemIndex) => itemIndex !== index && itemIndex !== index + 1)
}

function dbSourceExportRecord(source, table, sourcePath, sha256) {
  return {
    source,
    kind: 'database_table',
    table,
    path: sourcePath,
    sha256,
    rowCount: 1,
    blockers: [],
  }
}

function sourceManifestPipelineArgs(manifest, sourceManifestPath = null) {
  const args = [
    'node',
    'project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs',
    '--baseline-id',
    manifest.baselineId,
    '--project-id',
    manifest.projectId,
    '--publication-key',
    manifest.publicationKey,
    '--environment',
    manifest.environment,
    '--duration-calibrated-by',
    manifest.exportedBy,
    '--published-by',
    manifest.exportedBy,
    '--source-manifest',
    sourceManifestPath
      ? path.relative(path.resolve('.'), sourceManifestPath).replace(/\\/g, '/')
      : `${manifest.outputRoot}/source-exports-manifest.json`,
  ]
  const mappings = [
    ['--review-export', manifest.sourceExports.reviewExport],
    ['--duration-samples', manifest.sourceExports.durationSamples],
    ['--task-dependencies', manifest.sourceExports.taskDependencies],
    ['--runtime-publications', manifest.sourceExports.runtimePublications],
    ['--runtime-consumptions', manifest.sourceExports.runtimeConsumptions],
    ['--api-read-smoke', manifest.sourceExports.apiReadSmoke],
    ['--ui-consumption-smoke', manifest.sourceExports.uiConsumptionSmoke],
    ['--critical-path-readback', manifest.sourceExports.criticalPathReadback],
    ['--rollback-verification', manifest.sourceExports.rollbackVerification],
    ['--real-production-outcome', manifest.sourceExports.realProductionOutcome],
  ]
  for (const [flag, record] of mappings) {
    if (record?.path) args.push(flag, record.path)
  }
  return args
}

function profileReportFixture() {
  return {
    businessTypes: [
      'hotel',
      'hospital',
      'school',
      'industrial',
      'data_center',
      'transportation_hub',
      'sports_culture',
      'tod_upper_cover',
      'renovation',
      'modular_building',
    ].map((businessType, index) => ({
      businessType,
      scheduleRowCount: 32 + index,
      profileRowCount: 4,
      profilePhaseAnchorRowCount: 1,
      reviewStatus: 'candidate_master_plan_reviewable',
      profileDurationEvidenceReady: true,
      gaps: [],
    })),
  }
}
