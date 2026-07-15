import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const SCRIPT_PATH = path.resolve('project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs')
const REVIEW_BLOCKERS = [
  'PROJECT_MANAGER_REVIEW_REQUIRED',
  'DURATION_EVIDENCE_NOT_RUNTIME_CALIBRATED',
  'PRODUCTION_DEPENDENCY_WRITER_NOT_APPLIED',
  'RUNTIME_PUBLICATION_EVIDENCE_MISSING',
  'POST_PUBLISH_SMOKE_ROLLBACK_EVIDENCE_MISSING',
]

test('writes a blocked pipeline report when source exports are missing and does not execute runtime writers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))
    const gapSummary = JSON.parse(await readFile(path.join(outputRoot, 'real-evidence-gap-summary.json'), 'utf8'))
    const evidenceSources = JSON.parse(await readFile(path.join(outputRoot, 'evidence-sources-report.json'), 'utf8'))
    const gapMarkdown = await readFile(path.join(outputRoot, 'real-evidence-gap-summary.md'), 'utf8')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.builderRuns.length, 0)
    assert.equal(report.bundle.productionReady, false)
    assert.equal(report.missingSourceExports.length, 11)
    assert.equal(report.missingSourceExports.some((item) => item.evidenceType === 'reviewEvidence'), false)
    assert.equal(report.sourceExportManifestBlockers.includes('source_export_manifest_required'), true)
    assert.equal(report.realEvidenceGapSummary.jsonPath.endsWith('real-evidence-gap-summary.json'), true)
    assert.equal(report.realEvidenceGapSummary.markdownPath.endsWith('real-evidence-gap-summary.md'), true)
    assert.equal(report.realEvidenceGapSummary.status, 'blocked')
    assert.equal(evidenceSources.missingEvidenceTypes.includes('runtimePublicationEvidence'), true)
    assert.equal(gapSummary.realEvidenceGaps.runtimeSeedEvidencePipeline.status, 'runtime_seed_import_blocked')
    assert.equal(gapSummary.realEvidenceGaps.durationSampleCollectionPackage.status, 'covered')
    assert.match(gapMarkdown, /Runtime Seed And Reference Days/)
    assert.match(gapMarkdown, /Duration Sample Collection Package/)
    assert.equal(report.mutationBoundary.invokesRuntimeWriters, false)
    assert.equal(report.mutationBoundary.writesProductionTables, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds profile-only duration sample collection package before production readiness evaluation', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-profile-samples-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const profileFixture = profileReportFixture()

  profileFixture.businessTypes = profileFixture.businessTypes.map((item) => (
    item.businessType === 'school'
      ? {
          ...item,
          profileRuntimeReferenceDayGapRows: [{
            rowGroup: 'profile',
            businessType: 'school',
            code: 'BTMP-SCH-06',
            title: '竣工验收与开学移交准备',
            executionLane: 'school_handover',
            executionPhase: 'acceptance_handover',
            requiredRuntimeReferenceStableCode: 'BTMP-SCH-06',
            selectedDurationDays: 48,
          }],
        }
      : item
  ))

  await writeJson(profileReport, profileFixture)
  await writeResidentialReport(residentialReport)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))
    const bundle = JSON.parse(await readFile(path.join(outputRoot, 'evidence-bundle.json'), 'utf8'))
    const readiness = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const samplePackage = JSON.parse(await readFile(path.join(outputRoot, 'duration-sample-collection-package.json'), 'utf8'))
    const sampleMaterialTemplate = JSON.parse(await readFile(path.join(outputRoot, 'real-duration-sample-material.template.json'), 'utf8'))
    const sampleMaterialTemplateReport = JSON.parse(await readFile(path.join(outputRoot, 'real-duration-sample-material.template.report.json'), 'utf8'))
    const sampleGate = readiness.gates.find((gate) => gate.id === 'duration_sample_collection_package')

    assert.equal(samplePackage.status, 'samples_required')
    assert.equal(samplePackage.profileRuntimeReferenceSampleRequestCount, 1)
    assert.deepEqual(samplePackage.sampleRequests.map((row) => row.stableCode), ['BTMP-SCH-06'])
    assert.equal(samplePackage.mutationBoundary.writesDurationSamples, false)
    assert.equal(sampleGate.status, 'blocked')
    assert.deepEqual(sampleGate.blockers, ['accepted_real_duration_samples_required'])
    assert.equal(
      report.supportingEvidenceFiles.durationSampleCollectionPackage.endsWith('duration-sample-collection-package.json'),
      true,
    )
    assert.equal(
      report.supportingEvidenceFiles.realDurationSampleMaterialTemplate.endsWith('real-duration-sample-material.template.json'),
      true,
    )
    assert.equal(report.supportingRuns.some((run) => run.name === 'durationSampleCollectionPackage'), true)
    assert.equal(report.supportingRuns.some((run) => run.name === 'realDurationSampleMaterialTemplate'), true)
    assert.equal(sampleMaterialTemplate.materialTemplate, true)
    assert.equal(sampleMaterialTemplate.templateStatus, 'operator_input_required')
    assert.deepEqual(sampleMaterialTemplate.samples.map((row) => row.stableCode), ['BTMP-SCH-06'])
    assert.equal(sampleMaterialTemplate.mutationBoundary, undefined)
    assert.equal(sampleMaterialTemplateReport.status, 'template_ready')
    assert.equal(sampleMaterialTemplateReport.summary.templateSampleCount, 1)
    assert.equal(sampleMaterialTemplateReport.mutationBoundary.writesDurationSamples, false)
    assert.equal(bundle.checker.command.includes('--duration-sample-collection-package'), true)
    assert.equal(report.mutationBoundary.writesProductionTables, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds a no-write operator handoff from pipeline evidence outputs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-handoff-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))
    const handoff = JSON.parse(await readFile(path.join(outputRoot, 'operator-handoff.json'), 'utf8'))
    const handoffMarkdown = await readFile(path.join(outputRoot, 'operator-handoff.md'), 'utf8')

    assert.equal(handoff.schemaVersion, 'workbuddy-default-master-plan-production-operator-handoff/v1')
    assert.equal(handoff.status, 'blocked')
    assert.equal(handoff.productionReady, false)
    assert.equal(handoff.baselineId, 'baseline-reviewed')
    assert.equal(handoff.projectId, 'project-1')
    assert.equal(handoff.publicationKey, 'default-master-plan-runtime-publication-1')
    assert.equal(handoff.mutationBoundary.writesProductionTables, false)
    assert.equal(handoff.mutationBoundary.invokesRuntimeWriters, false)
    assert.equal(handoff.mutationBoundary.writesTaskDependencies, false)
    assert.equal(report.supportingEvidenceFiles.operatorHandoff.endsWith('operator-handoff.json'), true)
    assert.equal(report.operatorHandoff.jsonPath.endsWith('operator-handoff.json'), true)
    assert.equal(report.operatorHandoff.markdownPath.endsWith('operator-handoff.md'), true)
    assert.equal(report.operatorHandoff.status, 'blocked')
    assert.equal(report.operatorHandoff.productionReady, false)
    assert.equal(report.supportingRuns.some((run) => run.name === 'productionOperatorHandoff'), true)
    assert.match(handoffMarkdown, /Default Master Plan Production Operator Handoff/)
    assert.equal(report.mutationBoundary.writesProductionTables, false)
    assert.equal(report.mutationBoundary.invokesRuntimeWriters, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds local no-write candidate hygiene refresh and duration asset reports before final handoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-local-candidate-reports-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))
    const handoff = JSON.parse(await readFile(path.join(outputRoot, 'operator-handoff.json'), 'utf8'))
    const hygiene = JSON.parse(await readFile(path.join(outputRoot, 'candidate-export-hygiene.json'), 'utf8'))
    const refreshPackage = JSON.parse(await readFile(path.join(outputRoot, 'candidate-refresh-package.json'), 'utf8'))
    const durationAssetUtilization = JSON.parse(await readFile(path.join(outputRoot, 'duration-asset-utilization-report.json'), 'utf8'))

    assert.equal(report.supportingEvidenceFiles.candidateHygiene.endsWith('candidate-export-hygiene.json'), true)
    assert.equal(report.supportingEvidenceFiles.candidateRefreshPackage.endsWith('candidate-refresh-package.json'), true)
    assert.equal(report.supportingEvidenceFiles.durationAssetUtilizationReport.endsWith('duration-asset-utilization-report.json'), true)
    assert.equal(report.supportingRuns.some((run) => run.name === 'candidateExportHygiene'), true)
    assert.equal(report.supportingRuns.some((run) => run.name === 'candidateRefreshPackage'), true)
    assert.equal(report.supportingRuns.some((run) => run.name === 'durationAssetUtilizationReport'), true)
    assert.equal(hygiene.status, 'blocked')
    assert.equal(hygiene.mutationBoundary.writesProductionTables, false)
    assert.equal(refreshPackage.status, 'blocked')
    assert.equal(refreshPackage.mutationBoundary.writesProductionTables, false)
    assert.equal(durationAssetUtilization.status, 'candidate_asset_utilization_review_required')
    assert.equal(durationAssetUtilization.mutationBoundary.writesProductionTables, false)
    assert.equal(handoff.candidateHygiene.status, 'blocked')
    assert.equal(handoff.candidateRefreshPackage.status, 'blocked')
    assert.notEqual(handoff.durationAssetUtilization.status, 'not_generated')
    assert.equal(handoff.mutationBoundary.writesProductionTables, false)
    assert.equal(handoff.mutationBoundary.invokesRuntimeWriters, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds operator handoff preflight before final gap summary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-handoff-preflight-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))
    const preflight = JSON.parse(await readFile(path.join(outputRoot, 'operator-handoff-preflight.json'), 'utf8'))
    const gapSummary = JSON.parse(await readFile(path.join(outputRoot, 'real-evidence-gap-summary.json'), 'utf8'))
    const gapMarkdown = await readFile(path.join(outputRoot, 'real-evidence-gap-summary.md'), 'utf8')

    assert.equal(report.supportingEvidenceFiles.operatorHandoffPreflight.endsWith('operator-handoff-preflight.json'), true)
    assert.equal(report.supportingRuns.some((run) => run.name === 'operatorHandoffPreflight'), true)
    assert.equal(report.realEvidenceGapSummary.operatorHandoffPreflightStatus, 'blocked')
    assert.equal(preflight.status, 'blocked')
    assert.equal(preflight.mutationBoundary.writesProductionTables, false)
    assert.equal(preflight.mutationBoundary.invokesRuntimeWriters, false)
    assert.equal(gapSummary.realEvidenceGaps.operatorHandoff.status, 'blocked')
    assert.equal(gapSummary.realEvidenceGaps.operatorHandoff.preflightStatus, 'blocked')
    assert.equal(gapSummary.realEvidenceGaps.operatorHandoff.mayRunProductionEvidencePipeline, false)
    assert.match(gapMarkdown, /Operator Handoff/)
    assert.match(gapMarkdown, /handoff_preflight_blocker:/)
    assert.equal(report.mutationBoundary.writesProductionTables, false)
    assert.equal(report.mutationBoundary.invokesRuntimeWriters, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds runtime seed import execution dry-run evidence without allowing seed import', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-runtime-seed-import-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))
    const handoff = JSON.parse(await readFile(path.join(outputRoot, 'operator-handoff.json'), 'utf8'))
    const preflight = JSON.parse(await readFile(path.join(outputRoot, 'operator-handoff-preflight.json'), 'utf8'))
    const importExecution = JSON.parse(await readFile(path.join(outputRoot, 'runtime-seed-import-execution.json'), 'utf8'))

    assert.equal(report.supportingEvidenceFiles.runtimeSeedImportExecution.endsWith('runtime-seed-import-execution.json'), true)
    assert.equal(report.supportingRuns.some((run) => run.name === 'runtimeSeedImportExecution'), true)
    assert.equal(importExecution.status, 'runtime_seed_import_execution_blocked')
    assert.equal(importExecution.executionControl.executionAllowed, false)
    assert.equal(importExecution.mutationBoundary.executesRuntimeSeedImport, false)
    assert.equal(importExecution.mutationBoundary.writesTasks, false)
    assert.equal(importExecution.mutationBoundary.writesTaskDependencies, false)
    assert.equal(handoff.runtimeSeedImportExecution.status, 'runtime_seed_import_execution_blocked')
    assert.equal(handoff.currentBlockers.includes('runtime_seed_import_execution_runtime_seed_import_execution_allow_import_required'), true)
    assert.equal(handoff.currentBlockers.includes('runtime_seed_import_execution_runtime_seed_import_seed_smoke_user_id_required'), true)
    assert.equal(preflight.runtimeSeedImportExecutionBlockers.includes('runtime_seed_import_execution_command_required'), false)
    assert.equal(report.mutationBoundary.writesProductionTables, false)
    assert.equal(report.mutationBoundary.invokesRuntimeWriters, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds runtime seed evidence pipeline before production readiness evaluation', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-runtime-seed-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))
    const bundle = JSON.parse(await readFile(path.join(outputRoot, 'evidence-bundle.json'), 'utf8'))
    const readiness = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const runtimeSeedEvidence = JSON.parse(await readFile(path.join(outputRoot, 'runtime-seed-evidence-pipeline.json'), 'utf8'))
    const runtimeSeedGate = readiness.gates.find((gate) => gate.id === 'runtime_seed_and_reference_days_evidence')

    assert.match(runtimeSeedEvidence.schemaVersion, /runtime-seed-evidence-pipeline/)
    assert.equal(report.supportingEvidenceFiles.runtimeSeedEvidencePipeline.endsWith('runtime-seed-evidence-pipeline.json'), true)
    assert.equal(report.supportingRuns.some((run) => run.name === 'runtimeSeedEvidencePipeline'), true)
    assert.equal(bundle.checker.command.includes('--runtime-seed-evidence-pipeline'), true)
    assert.ok(runtimeSeedGate, 'runtime seed readiness gate should be present when pipeline generates supporting evidence')
    assert.equal(report.mutationBoundary.writesProductionTables, false)
    assert.equal(report.mutationBoundary.invokesRuntimeWriters, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks complete-looking source exports that lack auditable export metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewExport = path.join(root, 'review-export.json')
  const durationSamples = path.join(root, 'duration-samples.json')
  const writerResult = path.join(root, 'writer-result.json')
  const taskDependencies = path.join(root, 'task-dependencies.json')
  const runtimePublications = path.join(root, 'runtime-publications.json')
  const apiReadSmoke = path.join(root, 'api-read-smoke.json')
  const uiConsumptionSmoke = path.join(root, 'ui-consumption-smoke.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const rollbackVerification = path.join(root, 'rollback-verification.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(reviewExport, reviewExportFixture())
  await writeJson(durationSamples, durationSamplesFixture())
  await writeJson(writerResult, writerResultFixture())
  await writeJson(taskDependencies, taskDependenciesExportFixture())
  await writeJson(runtimePublications, runtimePublicationsFixture())
  await writeJson(apiReadSmoke, smokeFixture('api-read-smoke'))
  await writeJson(uiConsumptionSmoke, smokeFixture('ui-consumption-smoke'))
  await writeJson(criticalPathReadback, smokeFixture('critical-path-readback', 'readback_passed'))
  await writeJson(rollbackVerification, {
    ...smokeFixture('rollback-verification'),
    rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--review-export',
      reviewExport,
      '--duration-samples',
      durationSamples,
      '--duration-calibrated-by',
      'duration-governance-1',
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--runtime-publications',
      runtimePublications,
      '--published-by',
      'release-user-1',
      '--environment',
      'staging',
      '--api-read-smoke',
      apiReadSmoke,
      '--ui-consumption-smoke',
      uiConsumptionSmoke,
      '--critical-path-readback',
      criticalPathReadback,
      '--rollback-verification',
      rollbackVerification,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.builderRuns.length, 0)
    assert.equal(report.missingSourceExports.some((item) => item.source === 'sourceExportMetadata'), true)
    assert.equal(report.mutationBoundary.invokesRuntimeWriters, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks complete-looking source exports when they are not linked to a source export manifest', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewExport = path.join(root, 'review-export.json')
  const durationSamples = path.join(root, 'duration-samples.json')
  const writerResult = path.join(root, 'writer-result.json')
  const taskDependencies = path.join(root, 'task-dependencies.json')
  const runtimePublications = path.join(root, 'runtime-publications.json')
  const apiReadSmoke = path.join(root, 'api-read-smoke.json')
  const uiConsumptionSmoke = path.join(root, 'ui-consumption-smoke.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const rollbackVerification = path.join(root, 'rollback-verification.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(reviewExport, withExportMetadata(reviewExportFixture(), 'candidate_default_master_plan_review'))
  await writeJson(durationSamples, withExportMetadata(durationSamplesFixture(), 'duration_experience_samples'))
  await writeJson(writerResult, withExportMetadata(writerResultFixture(), 'construction_organization_plan_network_domain_writer'))
  await writeJson(taskDependencies, withExportMetadata(taskDependenciesExportFixture(), 'task_dependencies'))
  await writeJson(runtimePublications, withExportMetadata(runtimePublicationsFixture(), 'wbs_template_runtime_publications'))
  await writeJson(apiReadSmoke, withExportMetadata(smokeFixture('api-read-smoke'), 'api_read_smoke'))
  await writeJson(uiConsumptionSmoke, withExportMetadata(smokeFixture('ui-consumption-smoke'), 'ui_consumption_smoke'))
  await writeJson(criticalPathReadback, withExportMetadata(smokeFixture('critical-path-readback', 'readback_passed'), 'critical_path_readback'))
  await writeJson(rollbackVerification, withExportMetadata({
    ...smokeFixture('rollback-verification'),
    rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
  }, 'rollback_verification'))

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--review-export',
      reviewExport,
      '--duration-samples',
      durationSamples,
      '--duration-calibrated-by',
      'duration-governance-1',
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--runtime-publications',
      runtimePublications,
      '--published-by',
      'release-user-1',
      '--environment',
      'staging',
      '--api-read-smoke',
      apiReadSmoke,
      '--ui-consumption-smoke',
      uiConsumptionSmoke,
      '--critical-path-readback',
      criticalPathReadback,
      '--rollback-verification',
      rollbackVerification,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.builderRuns.length, 0)
    assert.equal(report.missingSourceExports.some((item) => item.source === 'sourceExportManifest'), true)
    assert.equal(report.sourceExportManifestBlockers.includes('source_export_manifest_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ignores a legacy offline review export that has no source-manifest hash binding', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-'))
  const outputRoot = path.join(root, 'out')
  const sourceExportRoot = path.join(root, 'source-exports')
  const sourceManifest = path.join(sourceExportRoot, 'source-exports-manifest.json')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewExport = path.join(sourceExportRoot, 'candidate-default-master-plan-review-export.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(reviewExport, withExportMetadata(reviewExportFixture(), 'candidate_default_master_plan_review'))
  await writeJson(sourceManifest, {
    ...sourceManifestFixture({ reviewExport }),
    sourceExports: {
      reviewExport: {
        path: path.relative(path.resolve('.'), reviewExport).replace(/\\/g, '/'),
        blockers: [],
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
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--review-export',
      reviewExport,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.builderRuns.length, 0)
    assert.equal(report.sourceExportManifestBlockers.includes('source_export_manifest_sha256_required:reviewExport'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ignores a legacy offline review export hash mismatch', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-'))
  const outputRoot = path.join(root, 'out')
  const sourceExportRoot = path.join(root, 'source-exports')
  const sourceManifest = path.join(sourceExportRoot, 'source-exports-manifest.json')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewExport = path.join(sourceExportRoot, 'candidate-default-master-plan-review-export.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(reviewExport, withExportMetadata(reviewExportFixture(), 'candidate_default_master_plan_review'))
  await writeJson(sourceManifest, {
    ...sourceManifestFixture({ reviewExport }),
    sourceExports: {
      reviewExport: {
        path: path.relative(path.resolve('.'), reviewExport).replace(/\\/g, '/'),
        sha256: '0'.repeat(64),
        blockers: [],
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
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--review-export',
      reviewExport,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.builderRuns.length, 0)
    assert.equal(report.sourceExportManifestBlockers.includes('source_export_manifest_sha256_mismatch:reviewExport'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not refresh or bundle a legacy offline review artifact', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-'))
  const outputRoot = path.join(root, 'out')
  const sourceExportRoot = path.join(root, 'source-exports')
  const sourceManifest = path.join(sourceExportRoot, 'source-exports-manifest.json')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewExport = path.join(sourceExportRoot, 'candidate-default-master-plan-review-export.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(reviewExport, withExportMetadata(reviewExportFixture(), 'candidate_default_master_plan_review'))
  await writeJson(path.join(outputRoot, 'pm-review-evidence.json'), {
    schemaVersion: 'stale-evidence/v1',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    status: 'accepted_for_baseline',
    sourceEvidenceRef: `${path.relative(path.resolve('.'), reviewExport).replace(/\\/g, '/')}#sha256=${'f'.repeat(64)}`,
  })
  await writeJson(sourceManifest, {
    ...sourceManifestFixture({ reviewExport }),
    sourceExports: {
      reviewExport: {
        path: path.relative(path.resolve('.'), reviewExport).replace(/\\/g, '/'),
        sha256: '0'.repeat(64),
        blockers: [],
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
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--review-export',
      reviewExport,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))
    const bundle = JSON.parse(await readFile(path.join(outputRoot, 'evidence-bundle.json'), 'utf8'))

    assert.equal(report.status, 'blocked')
    assert.equal(report.builderRuns.length, 0)
    assert.equal(report.sourceExportManifestBlockers.includes('source_export_manifest_sha256_mismatch:reviewExport'), false)
    assert.equal(bundle.missingEvidenceTypes.includes('reviewEvidence'), false)
    assert.equal(bundle.evidenceFiles.some((item) => item.type === 'reviewEvidence'), false)
    const refreshedReview = JSON.parse(await readFile(path.join(outputRoot, 'pm-review-evidence.json'), 'utf8'))
    assert.equal(refreshedReview.schemaVersion, 'stale-evidence/v1')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks source exports when manifest and source export session ids do not match', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-'))
  const outputRoot = path.join(root, 'out')
  const sourceExportRoot = path.join(root, 'source-exports')
  const sourceManifest = path.join(sourceExportRoot, 'source-exports-manifest.json')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const durationSamples = path.join(sourceExportRoot, 'duration-experience-samples-export.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(durationSamples, withExportMetadata(durationSamplesFixture(), 'duration_experience_samples', {
    exportSessionId: 'default-master-plan-source-export:session-from-file',
  }))
  await writeJson(sourceManifest, {
    ...sourceManifestFixture({ durationSamples }),
    exportSessionId: 'default-master-plan-source-export:session-from-manifest',
    sourceExports: {
      durationSamples: sourceExportRecord(durationSamples, {
        source: 'duration_experience_samples',
        kind: 'database_table',
        table: 'public.duration_experience_samples',
      }),
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--duration-samples',
      durationSamples,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.builderRuns.length, 0)
    assert.equal(report.sourceExportManifestBlockers.includes('source_export_session_id_mismatch:durationSamples'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks source exports whose payload still carries a legacy default master-plan source label', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-'))
  const outputRoot = path.join(root, 'out')
  const sourceExportRoot = path.join(root, 'source-exports')
  const sourceManifest = path.join(sourceExportRoot, 'source-exports-manifest.json')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const writerResult = path.join(sourceExportRoot, 'dependency-writer-result-export.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(writerResult, withExportMetadata({
    ...writerResultFixture(),
    candidate_default_master_plan: {
      generation_mode: 'legacy_template_serial_fallback',
      source_version_label: 'legacy_template_serial_fallback',
      candidate_default_master_plan_baseline: true,
    },
  }, 'dependency_writer_result'))
  await writeJson(sourceManifest, {
    ...sourceManifestFixture({ sourceManifest, writerResult }),
    sourceExports: {
      writerResult: sourceExportRecord(writerResult, {
        source: 'dependency_writer_result',
        kind: 'source_file',
      }),
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--writer-result',
      writerResult,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.builderRuns.length, 0)
    assert.equal(
      report.sourceExportManifestBlockers.includes('source_export_legacy_default_master_plan_label:writerResult'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks source exports whose payload hides manual-comparison in fallbackApplied', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-'))
  const outputRoot = path.join(root, 'out')
  const sourceExportRoot = path.join(root, 'source-exports')
  const sourceManifest = path.join(sourceExportRoot, 'source-exports-manifest.json')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const writerResult = path.join(sourceExportRoot, 'dependency-writer-result-export.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(writerResult, withExportMetadata({
    ...writerResultFixture(),
    candidate_default_master_plan: {
      generation_mode: 'managed_frontier_default_master_plan',
      source_version_label: 'managed_frontier_default_master_plan',
      candidate_default_master_plan_baseline: true,
    },
    rows: [
      {
        fallbackApplied: 'manual_comparison_scenario',
      },
    ],
  }, 'dependency_writer_result'))
  await writeJson(sourceManifest, {
    ...sourceManifestFixture({ sourceManifest, writerResult }),
    sourceExports: {
      writerResult: sourceExportRecord(writerResult, {
        source: 'dependency_writer_result',
        kind: 'source_file',
      }),
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--writer-result',
      writerResult,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.builderRuns.length, 0)
    assert.equal(
      report.sourceExportManifestBlockers.includes('source_export_retired_or_low_information_default_master_plan_label:writerResult'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks source exports whose payload hides retired aliases in nested source metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-'))
  const outputRoot = path.join(root, 'out')
  const sourceExportRoot = path.join(root, 'source-exports')
  const sourceManifest = path.join(sourceExportRoot, 'source-exports-manifest.json')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const writerResult = path.join(sourceExportRoot, 'dependency-writer-result-export.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(writerResult, withExportMetadata({
    ...writerResultFixture(),
    candidate_default_master_plan: {
      generation_mode: 'managed_frontier_default_master_plan',
      source_version_label: 'managed_frontier_default_master_plan',
      candidate_default_master_plan_baseline: true,
    },
    rows: [
      {
        source: 'managed_frontier_default_master_plan',
        sourceMetadata: {
          templateSource: 'legacy_template_reverse_inference',
          sourceLineage: [
            { originSource: 'low_information_template_draft' },
          ],
        },
      },
    ],
  }, 'dependency_writer_result'))
  await writeJson(sourceManifest, {
    ...sourceManifestFixture({ sourceManifest, writerResult }),
    sourceExports: {
      writerResult: sourceExportRecord(writerResult, {
        source: 'dependency_writer_result',
        kind: 'source_file',
      }),
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--writer-result',
      writerResult,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.builderRuns.length, 0)
    assert.equal(
      report.sourceExportManifestBlockers.includes('source_export_retired_or_low_information_default_master_plan_label:writerResult'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks source exports whose root payload hides retired sources in governance fields', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-'))
  const outputRoot = path.join(root, 'out')
  const sourceExportRoot = path.join(root, 'source-exports')
  const sourceManifest = path.join(sourceExportRoot, 'source-exports-manifest.json')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const writerResult = path.join(sourceExportRoot, 'dependency-writer-result-export.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(writerResult, withExportMetadata({
    ...writerResultFixture(),
    candidate_default_master_plan: {
      generation_mode: 'managed_frontier_default_master_plan',
      source_version_label: 'managed_frontier_default_master_plan',
      candidate_default_master_plan_baseline: true,
    },
    comparisonBasis: ['manual_comparison_scenario'],
    boundaryPolicy: ['low_information_template_draft'],
    reviewProof: [
      { sourceKind: 'legacy_template_reverse_inference' },
    ],
  }, 'dependency_writer_result'))
  await writeJson(sourceManifest, {
    ...sourceManifestFixture({ sourceManifest, writerResult }),
    sourceExports: {
      writerResult: sourceExportRecord(writerResult, {
        source: 'dependency_writer_result',
        kind: 'source_file',
      }),
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--writer-result',
      writerResult,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.builderRuns.length, 0)
    assert.equal(
      report.sourceExportManifestBlockers.includes('source_export_retired_or_low_information_default_master_plan_label:writerResult'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds complete production evidence without runtime PM review export', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-'))
  const outputRoot = path.join(root, 'out')
  const sourceExportRoot = path.join(root, 'source-exports')
  const sourceManifest = path.join(sourceExportRoot, 'source-exports-manifest.json')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const durationSamples = path.join(sourceExportRoot, 'duration-experience-samples-export.json')
  const durationSampleCoverageEvidence = path.join(root, 'duration-sample-coverage-evidence.json')
  const writerResult = path.join(sourceExportRoot, 'dependency-writer-result-export.json')
  const taskDependencies = path.join(sourceExportRoot, 'task-dependencies-export.json')
  const runtimePublications = path.join(sourceExportRoot, 'wbs-template-runtime-publications-export.json')
  const apiReadSmoke = path.join(sourceExportRoot, 'api-read-smoke-export.json')
  const uiConsumptionSmoke = path.join(sourceExportRoot, 'ui-consumption-smoke-export.json')
  const criticalPathReadback = path.join(sourceExportRoot, 'critical-path-readback-export.json')
  const rollbackVerification = path.join(sourceExportRoot, 'rollback-verification-export.json')
  const realProductionOutcome = path.join(sourceExportRoot, 'real-production-outcome-export.json')
  const runtimeSeedEvidencePipeline = path.join(root, 'runtime-seed-evidence-pipeline.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(runtimeSeedEvidencePipeline, runtimeSeedEvidencePipelineFixture())
  await writeJson(durationSamples, withExportMetadata(durationSamplesFixture(), 'duration_experience_samples', { environment: 'production' }))
  await writeJson(durationSampleCoverageEvidence, durationSampleCoverageEvidenceFixture())
  await writeJson(writerResult, withExportMetadata(writerResultFixture(), 'construction_organization_plan_network_domain_writer', { environment: 'production' }))
  await writeJson(taskDependencies, withExportMetadata(taskDependenciesExportFixture(), 'task_dependencies', { environment: 'production' }))
  await writeJson(runtimePublications, withExportMetadata(runtimePublicationsFixture(), 'wbs_template_runtime_publications', { environment: 'production' }))
  await writeJson(apiReadSmoke, withExportMetadata(smokeFixture('api-read-smoke'), 'api_read_smoke', { environment: 'production' }))
  await writeJson(uiConsumptionSmoke, withExportMetadata(smokeFixture('ui-consumption-smoke'), 'ui_consumption_smoke', { environment: 'production' }))
  await writeJson(criticalPathReadback, withExportMetadata(smokeFixture('critical-path-readback', 'readback_passed'), 'critical_path_readback', { environment: 'production' }))
  await writeJson(rollbackVerification, withExportMetadata({
    ...smokeFixture('rollback-verification'),
    rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
  }, 'rollback_verification', { environment: 'production' }))
  await writeRealProductionOutcomeJson(realProductionOutcome, {
    runtimePublications,
    apiReadSmoke,
    uiConsumptionSmoke,
    criticalPathReadback,
    rollbackVerification,
  })
  await writeJson(sourceManifest, sourceManifestFixture({
    sourceManifest,
    environment: 'production',
    durationSamples,
    writerResult,
    taskDependencies,
    runtimePublications,
    apiReadSmoke,
    uiConsumptionSmoke,
    criticalPathReadback,
    rollbackVerification,
    realProductionOutcome,
  }))

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--runtime-seed-evidence-pipeline',
      runtimeSeedEvidencePipeline,
      '--duration-samples',
      durationSamples,
      '--duration-sample-coverage-evidence',
      durationSampleCoverageEvidence,
      '--duration-calibrated-by',
      'duration-governance-1',
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--runtime-publications',
      runtimePublications,
      '--published-by',
      'release-user-1',
      '--environment',
      'production',
      '--api-read-smoke',
      apiReadSmoke,
      '--ui-consumption-smoke',
      uiConsumptionSmoke,
      '--critical-path-readback',
      criticalPathReadback,
      '--rollback-verification',
      rollbackVerification,
      '--real-production-outcome',
      realProductionOutcome,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))
    const bundle = JSON.parse(await readFile(path.join(outputRoot, 'evidence-bundle.json'), 'utf8'))
    const smokeRollbackEvidence = JSON.parse(await readFile(path.join(outputRoot, 'post-publish-smoke-rollback-evidence.json'), 'utf8'))
    const operatorHandoff = JSON.parse(await readFile(path.join(outputRoot, 'operator-handoff.json'), 'utf8'))

    assert.equal(report.status, 'production_ready_evidence_pipeline_complete')
    assert.equal(report.productionReady, true)
    assert.equal(
      operatorHandoff.currentBlockers.some((blocker) => /pm_review|project_manager_review/i.test(blocker)),
      false,
    )
    assert.equal(report.builderRuns.length, 4)
    assert.equal(report.missingSourceExports.length, 0)
    assert.equal(report.missingSourceExports.some((item) => item.evidenceType === 'reviewEvidence'), false)
    assert.deepEqual(report.sourceExportManifestBlockers, [])
    assert.equal(bundle.status, 'production_ready_evidence_bundle_complete')
    assert.equal(bundle.productionReady, true)
    assert.equal(bundle.missingEvidenceTypes.length, 0)
    assert.equal(bundle.evidenceFiles.some((item) => item.type === 'reviewEvidence'), false)
    assert.equal(report.supportingEvidenceFiles.runtimeSeedEvidencePipeline.endsWith('runtime-seed-evidence-pipeline.json'), true)
    assert.equal(report.supportingRuns.some((run) => run.name === 'runtimeSeedEvidencePipeline' && run.command[0] === 'provided'), true)
    assert.equal(report.evidenceQualification.realOutcomeMarkerCount > 0, true)
    assert.equal(smokeRollbackEvidence.realProductionOutcomeEvidence.environment, 'production')
    assert.equal(report.evidenceFiles.dependencyWriterEvidence.endsWith('dependency-writer-evidence.json'), true)
    assert.equal(report.mutationBoundary.invokesRuntimeWriters, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a production manifest with real outcome record when CLI omits the real outcome source', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-'))
  const outputRoot = path.join(root, 'out')
  const sourceExportRoot = path.join(root, 'source-exports')
  const sourceManifest = path.join(sourceExportRoot, 'source-exports-manifest.json')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewExport = path.join(sourceExportRoot, 'candidate-default-master-plan-review-export.json')
  const durationSamples = path.join(sourceExportRoot, 'duration-experience-samples-export.json')
  const durationSampleCoverageEvidence = path.join(root, 'duration-sample-coverage-evidence.json')
  const writerResult = path.join(sourceExportRoot, 'dependency-writer-result-export.json')
  const taskDependencies = path.join(sourceExportRoot, 'task-dependencies-export.json')
  const runtimePublications = path.join(sourceExportRoot, 'wbs-template-runtime-publications-export.json')
  const apiReadSmoke = path.join(sourceExportRoot, 'api-read-smoke-export.json')
  const uiConsumptionSmoke = path.join(sourceExportRoot, 'ui-consumption-smoke-export.json')
  const criticalPathReadback = path.join(sourceExportRoot, 'critical-path-readback-export.json')
  const rollbackVerification = path.join(sourceExportRoot, 'rollback-verification-export.json')
  const realProductionOutcome = path.join(sourceExportRoot, 'real-production-outcome-export.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(reviewExport, withExportMetadata(reviewExportFixture(), 'candidate_default_master_plan_review', { environment: 'production' }))
  await writeJson(durationSamples, withExportMetadata(durationSamplesFixture(), 'duration_experience_samples', { environment: 'production' }))
  await writeJson(writerResult, withExportMetadata(writerResultFixture(), 'construction_organization_plan_network_domain_writer', { environment: 'production' }))
  await writeJson(taskDependencies, withExportMetadata(taskDependenciesExportFixture(), 'task_dependencies', { environment: 'production' }))
  await writeJson(runtimePublications, withExportMetadata(runtimePublicationsFixture(), 'wbs_template_runtime_publications', { environment: 'production' }))
  await writeJson(apiReadSmoke, withExportMetadata(smokeFixture('api-read-smoke'), 'api_read_smoke', { environment: 'production' }))
  await writeJson(uiConsumptionSmoke, withExportMetadata(smokeFixture('ui-consumption-smoke'), 'ui_consumption_smoke', { environment: 'production' }))
  await writeJson(criticalPathReadback, withExportMetadata(smokeFixture('critical-path-readback', 'readback_passed'), 'critical_path_readback', { environment: 'production' }))
  await writeJson(rollbackVerification, withExportMetadata({
    ...smokeFixture('rollback-verification'),
    rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
  }, 'rollback_verification', { environment: 'production' }))
  await writeRealProductionOutcomeJson(realProductionOutcome, {
    runtimePublications,
    apiReadSmoke,
    uiConsumptionSmoke,
    criticalPathReadback,
    rollbackVerification,
  })
  await writeJson(sourceManifest, sourceManifestFixture({
    sourceManifest,
    environment: 'production',
    reviewExport,
    durationSamples,
    writerResult,
    taskDependencies,
    runtimePublications,
    apiReadSmoke,
    uiConsumptionSmoke,
    criticalPathReadback,
    rollbackVerification,
    realProductionOutcome,
  }))

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--review-export',
      reviewExport,
      '--duration-samples',
      durationSamples,
      '--duration-calibrated-by',
      'duration-governance-1',
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--runtime-publications',
      runtimePublications,
      '--published-by',
      'release-user-1',
      '--environment',
      'production',
      '--api-read-smoke',
      apiReadSmoke,
      '--ui-consumption-smoke',
      uiConsumptionSmoke,
      '--critical-path-readback',
      criticalPathReadback,
      '--rollback-verification',
      rollbackVerification,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))
    const bundle = JSON.parse(await readFile(path.join(outputRoot, 'evidence-bundle.json'), 'utf8'))

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.builderRuns.length, 0)
    assert.equal(report.sourceExportManifestBlockers.includes('source_export_manifest_cli_arg_missing:realProductionOutcome'), true)
    assert.equal(report.sourceExportManifestBlockers.includes('source_export_manifest_pipeline_arg_missing:--real-production-outcome'), false)
    assert.equal(report.missingSourceExports.some((item) => item.source === 'sourceExportManifest'), true)
    assert.equal(bundle.productionReady, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks source exports whose metadata environment differs from the manifest environment', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-'))
  const outputRoot = path.join(root, 'out')
  const sourceExportRoot = path.join(root, 'source-exports')
  const sourceManifest = path.join(sourceExportRoot, 'source-exports-manifest.json')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewExport = path.join(sourceExportRoot, 'candidate-default-master-plan-review-export.json')
  const durationSamples = path.join(sourceExportRoot, 'duration-experience-samples-export.json')
  const durationSampleCoverageEvidence = path.join(root, 'duration-sample-coverage-evidence.json')
  const writerResult = path.join(sourceExportRoot, 'dependency-writer-result-export.json')
  const taskDependencies = path.join(sourceExportRoot, 'task-dependencies-export.json')
  const runtimePublications = path.join(sourceExportRoot, 'wbs-template-runtime-publications-export.json')
  const apiReadSmoke = path.join(sourceExportRoot, 'api-read-smoke-export.json')
  const uiConsumptionSmoke = path.join(sourceExportRoot, 'ui-consumption-smoke-export.json')
  const criticalPathReadback = path.join(sourceExportRoot, 'critical-path-readback-export.json')
  const rollbackVerification = path.join(sourceExportRoot, 'rollback-verification-export.json')
  const realProductionOutcome = path.join(sourceExportRoot, 'real-production-outcome-export.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(reviewExport, withExportMetadata(reviewExportFixture(), 'candidate_default_master_plan_review', { environment: 'production' }))
  await writeJson(durationSamples, withExportMetadata(durationSamplesFixture(), 'duration_experience_samples', { environment: 'production' }))
  await writeJson(writerResult, withExportMetadata(writerResultFixture(), 'construction_organization_plan_network_domain_writer', { environment: 'production' }))
  await writeJson(taskDependencies, withExportMetadata(taskDependenciesExportFixture(), 'task_dependencies', { environment: 'production' }))
  await writeJson(runtimePublications, withExportMetadata(runtimePublicationsFixture(), 'wbs_template_runtime_publications', { environment: 'production' }))
  await writeJson(apiReadSmoke, withExportMetadata(smokeFixture('api-read-smoke'), 'api_read_smoke', { environment: 'production' }))
  await writeJson(uiConsumptionSmoke, withExportMetadata(smokeFixture('ui-consumption-smoke'), 'ui_consumption_smoke', { environment: 'staging' }))
  await writeJson(criticalPathReadback, withExportMetadata(smokeFixture('critical-path-readback', 'readback_passed'), 'critical_path_readback', { environment: 'production' }))
  await writeJson(rollbackVerification, withExportMetadata({
    ...smokeFixture('rollback-verification'),
    rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
  }, 'rollback_verification', { environment: 'production' }))
  await writeRealProductionOutcomeJson(realProductionOutcome, {
    runtimePublications,
    apiReadSmoke,
    uiConsumptionSmoke,
    criticalPathReadback,
    rollbackVerification,
  })
  await writeJson(sourceManifest, sourceManifestFixture({
    sourceManifest,
    environment: 'production',
    reviewExport,
    durationSamples,
    writerResult,
    taskDependencies,
    runtimePublications,
    apiReadSmoke,
    uiConsumptionSmoke,
    criticalPathReadback,
    rollbackVerification,
    realProductionOutcome,
  }))

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--review-export',
      reviewExport,
      '--duration-samples',
      durationSamples,
      '--duration-calibrated-by',
      'duration-governance-1',
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--runtime-publications',
      runtimePublications,
      '--published-by',
      'release-user-1',
      '--environment',
      'production',
      '--api-read-smoke',
      apiReadSmoke,
      '--ui-consumption-smoke',
      uiConsumptionSmoke,
      '--critical-path-readback',
      criticalPathReadback,
      '--rollback-verification',
      rollbackVerification,
      '--real-production-outcome',
      realProductionOutcome,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.builderRuns.length, 0)
    assert.equal(report.sourceExportManifestBlockers.includes('source_export_environment_mismatch:uiConsumptionSmoke'), true)
    assert.equal(report.mutationBoundary.invokesRuntimeWriters, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks source exports whose metadata identity differs from the requested baseline project or publication', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-'))
  const outputRoot = path.join(root, 'out')
  const sourceExportRoot = path.join(root, 'source-exports')
  const sourceManifest = path.join(sourceExportRoot, 'source-exports-manifest.json')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewExport = path.join(sourceExportRoot, 'candidate-default-master-plan-review-export.json')
  const durationSamples = path.join(sourceExportRoot, 'duration-experience-samples-export.json')
  const durationSampleCoverageEvidence = path.join(root, 'duration-sample-coverage-evidence.json')
  const writerResult = path.join(sourceExportRoot, 'dependency-writer-result-export.json')
  const taskDependencies = path.join(sourceExportRoot, 'task-dependencies-export.json')
  const runtimePublications = path.join(sourceExportRoot, 'wbs-template-runtime-publications-export.json')
  const apiReadSmoke = path.join(sourceExportRoot, 'api-read-smoke-export.json')
  const uiConsumptionSmoke = path.join(sourceExportRoot, 'ui-consumption-smoke-export.json')
  const criticalPathReadback = path.join(sourceExportRoot, 'critical-path-readback-export.json')
  const rollbackVerification = path.join(sourceExportRoot, 'rollback-verification-export.json')
  const realProductionOutcome = path.join(sourceExportRoot, 'real-production-outcome-export.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(reviewExport, withExportMetadata(reviewExportFixture(), 'candidate_default_master_plan_review', { environment: 'production' }))
  await writeJson(durationSamples, withExportMetadata(durationSamplesFixture(), 'duration_experience_samples', { environment: 'production' }))
  await writeJson(writerResult, withExportMetadata(writerResultFixture(), 'construction_organization_plan_network_domain_writer', {
    environment: 'production',
    baselineId: 'wrong-baseline',
  }))
  await writeJson(taskDependencies, withExportMetadata(taskDependenciesExportFixture(), 'task_dependencies', { environment: 'production' }))
  await writeJson(runtimePublications, withExportMetadata(runtimePublicationsFixture(), 'wbs_template_runtime_publications', { environment: 'production' }))
  await writeJson(apiReadSmoke, withExportMetadata(smokeFixture('api-read-smoke'), 'api_read_smoke', {
    environment: 'production',
    projectId: 'wrong-project',
  }))
  await writeJson(uiConsumptionSmoke, withExportMetadata(smokeFixture('ui-consumption-smoke'), 'ui_consumption_smoke', {
    environment: 'production',
    publicationKey: 'wrong-publication',
  }))
  await writeJson(criticalPathReadback, withExportMetadata(smokeFixture('critical-path-readback', 'readback_passed'), 'critical_path_readback', { environment: 'production' }))
  await writeJson(rollbackVerification, withExportMetadata({
    ...smokeFixture('rollback-verification'),
    rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
  }, 'rollback_verification', { environment: 'production' }))
  await writeRealProductionOutcomeJson(realProductionOutcome, {
    runtimePublications,
    apiReadSmoke,
    uiConsumptionSmoke,
    criticalPathReadback,
    rollbackVerification,
  })
  await writeJson(sourceManifest, sourceManifestFixture({
    sourceManifest,
    environment: 'production',
    reviewExport,
    durationSamples,
    writerResult,
    taskDependencies,
    runtimePublications,
    apiReadSmoke,
    uiConsumptionSmoke,
    criticalPathReadback,
    rollbackVerification,
    realProductionOutcome,
  }))

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--review-export',
      reviewExport,
      '--duration-samples',
      durationSamples,
      '--duration-calibrated-by',
      'duration-governance-1',
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--runtime-publications',
      runtimePublications,
      '--published-by',
      'release-user-1',
      '--environment',
      'production',
      '--api-read-smoke',
      apiReadSmoke,
      '--ui-consumption-smoke',
      uiConsumptionSmoke,
      '--critical-path-readback',
      criticalPathReadback,
      '--rollback-verification',
      rollbackVerification,
      '--real-production-outcome',
      realProductionOutcome,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.builderRuns.length, 0)
    assert.equal(report.sourceExportManifestBlockers.includes('source_export_baseline_id_mismatch:writerResult'), true)
    assert.equal(report.sourceExportManifestBlockers.includes('source_export_project_id_mismatch:apiReadSmoke'), true)
    assert.equal(report.sourceExportManifestBlockers.includes('source_export_publication_key_mismatch:uiConsumptionSmoke'), true)
    assert.equal(report.mutationBoundary.invokesRuntimeWriters, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a staging controlled replay pipeline when duration calibration uses non-real samples', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-pipeline-'))
  const outputRoot = path.join(root, 'out')
  const sourceExportRoot = path.join(root, 'source-exports')
  const sourceManifest = path.join(sourceExportRoot, 'source-exports-manifest.json')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewExport = path.join(sourceExportRoot, 'candidate-default-master-plan-review-export.json')
  const durationSamples = path.join(sourceExportRoot, 'duration-experience-samples-export.json')
  const durationSampleCoverageEvidence = path.join(root, 'duration-sample-coverage-evidence.json')
  const writerResult = path.join(sourceExportRoot, 'dependency-writer-result-export.json')
  const taskDependencies = path.join(sourceExportRoot, 'task-dependencies-export.json')
  const runtimePublications = path.join(sourceExportRoot, 'wbs-template-runtime-publications-export.json')
  const apiReadSmoke = path.join(sourceExportRoot, 'api-read-smoke-export.json')
  const uiConsumptionSmoke = path.join(sourceExportRoot, 'ui-consumption-smoke-export.json')
  const criticalPathReadback = path.join(sourceExportRoot, 'critical-path-readback-export.json')
  const rollbackVerification = path.join(sourceExportRoot, 'rollback-verification-export.json')

  const controlledWriterResult = writerResultFixture()
  controlledWriterResult.domain_writer_result.boundaryPolicy = [
    'staging_writer_replays_default_master_plan_dependencies',
  ]
  controlledWriterResult.domain_writer_result.draftNetworkKey = 'default-master-plan-staging-network:baseline-reviewed'
  const controlledDurationSamples = durationSamplesFixture()
  controlledDurationSamples.rows = controlledDurationSamples.rows.map((row) => ({
    ...row,
    duration_calibration_source: 'default_master_plan_staging_runtime_writer',
    metadata: {
      source: 'default_master_plan_staging_runtime_writer',
      stagingControlledReplay: true,
    },
  }))
  const controlledTaskDependencies = taskDependenciesExportFixture()
  controlledTaskDependencies.rows = controlledTaskDependencies.rows.map((row) => ({
    ...row,
    metadata: {
      source: 'default_master_plan_staging_runtime_writer',
      stagingControlledReplay: true,
    },
  }))

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(reviewExport, withExportMetadata(reviewExportFixture(), 'candidate_default_master_plan_review'))
  await writeJson(durationSamples, withExportMetadata(controlledDurationSamples, 'duration_experience_samples'))
  await writeJson(durationSampleCoverageEvidence, durationSampleCoverageEvidenceFixture())
  await writeJson(writerResult, withExportMetadata(controlledWriterResult, 'construction_organization_plan_network_domain_writer'))
  await writeJson(taskDependencies, withExportMetadata(controlledTaskDependencies, 'task_dependencies'))
  await writeJson(runtimePublications, withExportMetadata(runtimePublicationsFixture(), 'wbs_template_runtime_publications'))
  await writeJson(apiReadSmoke, withExportMetadata(smokeFixture('api-read-smoke'), 'api_read_smoke'))
  await writeJson(uiConsumptionSmoke, withExportMetadata(smokeFixture('ui-consumption-smoke'), 'ui_consumption_smoke'))
  await writeJson(criticalPathReadback, withExportMetadata(smokeFixture('critical-path-readback', 'readback_passed'), 'critical_path_readback'))
  await writeJson(rollbackVerification, withExportMetadata({
    ...smokeFixture('rollback-verification'),
    rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
  }, 'rollback_verification'))
  await writeJson(sourceManifest, sourceManifestFixture({
    sourceManifest,
    reviewExport,
    durationSamples,
    writerResult,
    taskDependencies,
    runtimePublications,
    apiReadSmoke,
    uiConsumptionSmoke,
    criticalPathReadback,
    rollbackVerification,
  }))

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--review-export',
      reviewExport,
      '--duration-samples',
      durationSamples,
      '--duration-sample-coverage-evidence',
      durationSampleCoverageEvidence,
      '--duration-calibrated-by',
      'duration-governance-1',
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--runtime-publications',
      runtimePublications,
      '--published-by',
      'release-user-1',
      '--environment',
      'staging',
      '--api-read-smoke',
      apiReadSmoke,
      '--ui-consumption-smoke',
      uiConsumptionSmoke,
      '--critical-path-readback',
      criticalPathReadback,
      '--rollback-verification',
      rollbackVerification,
      '--source-manifest',
      sourceManifest,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'pipeline-report.json'), 'utf8'))
    const bundle = JSON.parse(await readFile(path.join(outputRoot, 'evidence-bundle.json'), 'utf8'))
    const readiness = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const durationGate = readiness.gates.find((gate) => gate.id === 'runtime_duration_calibration_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.builderRuns.length, 4)
    assert.equal(
      report.builderRuns.some((run) => /reviewEvidence|project.manager.review/i.test(String(run.command))),
      false,
    )
    assert.equal(report.missingSourceExports.length, 0)
    assert.deepEqual(report.sourceExportManifestBlockers, [])
    assert.deepEqual(report.productionReadinessBlockers, [])
    assert.deepEqual(report.bundle.missingEvidenceTypes, [])
    assert.equal(report.readiness.runtimeEvidenceChainPassed, false)
    assert.equal(
      report.readiness.productionReadinessBlockers.includes('staging_controlled_replay_not_production_ready'),
      false,
    )
    assert.equal(bundle.status, 'blocked')
    assert.equal(bundle.productionReady, false)
    assert.deepEqual(bundle.missingEvidenceTypes, [])
    assert.equal(durationGate.status, 'blocked')
    assert.equal(durationGate.blockers.includes('runtime_duration_calibration_status_required'), true)
    assert.equal(durationGate.blockers.includes('accepted_real_duration_sample_count_required'), true)
    const durationEvidence = JSON.parse(await readFile(path.join(outputRoot, 'duration-calibration-evidence.json'), 'utf8'))
    assert.equal(durationEvidence.status, 'blocked')
    assert.equal(durationEvidence.acceptedRealDurationSampleCount, 0)
    assert.equal(durationEvidence.blockers.includes('real_duration_sample_must_not_be_staging_controlled_replay'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeRealProductionOutcomeJson(filePath, evidenceSourcePaths = {}) {
  const sourcePath = path.relative(path.resolve('.'), filePath.replace(/-export\.json$/, '.json')).replace(/\\/g, '/')
  const sourceSha256 = '6'.repeat(64)
  await writeJson(filePath, withExportMetadata({
    ...realProductionOutcomeFixture(),
    evidenceRef: `real_production_outcome_export:${sourcePath}#sha256=${sourceSha256}`,
    runtimePublicationEvidenceRef: sourceExportRef('wbs_template_runtime_publications_export', evidenceSourcePaths.runtimePublications),
    apiReadSmokeEvidenceRef: sourceExportRef('api_read_smoke_export', evidenceSourcePaths.apiReadSmoke),
    uiConsumptionSmokeEvidenceRef: sourceExportRef('ui_consumption_smoke_export', evidenceSourcePaths.uiConsumptionSmoke),
    criticalPathReadbackEvidenceRef: sourceExportRef('critical_path_readback_export', evidenceSourcePaths.criticalPathReadback),
    rollbackEvidenceRef: sourceExportRef('rollback_verification_export', evidenceSourcePaths.rollbackVerification),
  }, 'real_production_outcome', { environment: 'production' }))
}

function sourceExportRef(prefix, filePath) {
  if (!filePath) return ''
  const sourcePath = path.relative(path.resolve('.'), filePath).replace(/\\/g, '/')
  return `${prefix}:${sourcePath}#sha256=${sha256FileSync(filePath)}`
}

function withExportMetadata(payload, sourceTable, overrides = {}) {
  const databaseTables = new Map([
    ['candidate_default_master_plan_review', 'public.change_logs'],
    ['duration_experience_samples', 'public.duration_experience_samples'],
    ['task_dependencies', 'public.task_dependencies'],
    ['wbs_template_runtime_publications', 'public.wbs_template_runtime_publications'],
  ])
  return {
    export_metadata: {
      source_table: sourceTable,
      source: sourceTable,
      source_kind: databaseTables.has(sourceTable) ? 'database_table' : 'source_file',
      table: databaseTables.get(sourceTable) ?? null,
      exported_at: '2026-07-01T08:30:00.000Z',
      exported_by: 'release-user-1',
      environment: overrides.environment ?? 'staging',
      export_session_id: overrides.exportSessionId ?? 'default-master-plan-source-export:session-1',
      baseline_id: overrides.baselineId ?? 'baseline-reviewed',
      project_id: overrides.projectId ?? 'project-1',
      publication_key: overrides.publicationKey ?? 'default-master-plan-runtime-publication-1',
    },
    ...payload,
  }
}

function sourceManifestFixture(paths) {
  const manifest = {
    schemaVersion: 'workbuddy-default-master-plan-production-source-exports/v1',
    status: 'exported',
    exportSessionId: 'default-master-plan-source-export:session-1',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    phase: 'all',
    environment: paths.environment ?? 'staging',
    exportedBy: 'release-user-1',
    outputRoot: paths.sourceManifest
      ? path.relative(path.resolve('.'), path.dirname(paths.sourceManifest)).replace(/\\/g, '/')
      : 'project-testing/reports/default-master-plan-production-readiness/source-exports',
    sourceExports: Object.fromEntries(Object.entries({
      reviewExport: sourceExportRecord(paths.reviewExport, {
        source: 'candidate_default_master_plan_review',
        kind: 'database_table',
        table: 'public.change_logs',
      }),
      durationSamples: sourceExportRecord(paths.durationSamples, {
        source: 'duration_experience_samples',
        kind: 'database_table',
        table: 'public.duration_experience_samples',
      }),
      writerResult: sourceExportRecord(paths.writerResult, {
        source: 'dependency_writer_result',
        kind: 'source_file',
      }),
      taskDependencies: sourceExportRecord(paths.taskDependencies, {
        source: 'task_dependencies',
        kind: 'database_table',
        table: 'public.task_dependencies',
      }),
      runtimePublications: sourceExportRecord(paths.runtimePublications, {
        source: 'wbs_template_runtime_publications',
        kind: 'database_table',
        table: 'public.wbs_template_runtime_publications',
      }),
      apiReadSmoke: sourceExportRecord(paths.apiReadSmoke, {
        source: 'api_read_smoke',
        kind: 'source_file',
      }),
      uiConsumptionSmoke: sourceExportRecord(paths.uiConsumptionSmoke, {
        source: 'ui_consumption_smoke',
        kind: 'source_file',
      }),
      criticalPathReadback: sourceExportRecord(paths.criticalPathReadback, {
        source: 'critical_path_readback',
        kind: 'source_file',
      }),
      rollbackVerification: sourceExportRecord(paths.rollbackVerification, {
        source: 'rollback_verification',
        kind: 'source_file',
      }),
      realProductionOutcome: sourceExportRecord(paths.realProductionOutcome, {
        source: 'real_production_outcome',
        kind: 'source_file',
        realProductionOutcomeEvidence: readRealProductionOutcomeEvidence(paths.realProductionOutcome),
      }),
    }).filter(([, record]) => record)),
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
  }
  return {
    ...manifest,
    pipelineArgs: sourceManifestPipelineArgs(manifest, paths.sourceManifest),
  }
}

function readRealProductionOutcomeEvidence(filePath) {
  if (!filePath) return null
  const payload = JSON.parse(readFileSync(filePath, 'utf8'))
  const { export_metadata: _exportMetadata, exportMetadata: _exportMetadataCamel, ...evidence } = payload
  return evidence
}

function sourceExportRecord(filePath, { source, kind, table = null, realProductionOutcomeEvidence = null }) {
  if (!filePath) return null
  const archivePath = path.relative(path.resolve('.'), filePath).replace(/\\/g, '/')
  const archiveSha256 = sha256FileSync(filePath)
  const realOutcomeRef = realProductionOutcomeEvidence?.evidenceRef
    ? parsePathShaRef(realProductionOutcomeEvidence.evidenceRef)
    : null
  return {
    source,
    kind,
    ...(table ? { table } : {}),
    ...(realProductionOutcomeEvidence
      ? {
          sourcePath: realOutcomeRef?.path ?? archivePath,
          sourceSha256: realOutcomeRef?.sha256 ?? archiveSha256,
          realProductionOutcomeEvidence: {
            ...realProductionOutcomeEvidence,
          },
        }
      : {}),
    path: archivePath,
    sha256: archiveSha256,
    rowCount: 1,
    blockers: [],
  }
}

function parsePathShaRef(value) {
  const ref = String(value ?? '').trim()
  const sourceExportMatch = ref.match(/^real_production_outcome_export:(.+)#sha256=([a-f0-9]{64})$/i)
  if (sourceExportMatch) {
    return { path: sourceExportMatch[1], sha256: sourceExportMatch[2].toLowerCase() }
  }
  const match = ref.match(/^(.+)#sha256=([a-f0-9]{64})$/i)
  return match ? { path: match[1], sha256: match[2].toLowerCase() } : null
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
    ['--writer-result', manifest.sourceExports.writerResult],
    ['--task-dependencies', manifest.sourceExports.taskDependencies],
    ['--runtime-publications', manifest.sourceExports.runtimePublications],
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

function sha256FileSync(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

async function writeResidentialReport(filePath) {
  await writeFile(filePath, [
    '# Residential default master plan',
    '- schedule rows: 60 schedule_row',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
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

function reviewExportFixture() {
  return {
    change_logs: [{
      project_id: 'project-1',
      entity_type: 'baseline',
      entity_id: 'baseline-reviewed',
      field_name: 'candidate_default_master_plan_review',
      changed_by: 'owner-1',
      changed_at: '2026-07-01T06:30:00.000Z',
      after_snapshot: {
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
      },
    }],
  }
}

function durationSamplesFixture() {
  return {
    rows: [{
      id: 'sample-1',
      project_id: 'project-1',
      task_id: 'task-site',
      standard_work_code: '01-01',
      sample_status: 'accepted',
      included_in_benchmark: true,
      actual_duration_days: 10,
      cold_start_reference_days: 8,
      source_table: 'duration_experience_samples',
      source_type: 'completed_task',
    }, {
      id: 'sample-2',
      project_id: 'project-1',
      task_id: 'task-foundation',
      standard_work_code: '01-01',
      sample_status: 'active',
      included_in_benchmark: true,
      actual_duration_days: 14,
      cold_start_reference_days: 8,
      source_table: 'duration_experience_samples',
      source_type: 'completed_task',
    }],
  }
}

function durationSampleCoverageEvidenceFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-coverage-evidence/v1',
    status: 'covered',
    evidenceLevel: 'sample_collection_coverage_verified_l2',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    collectionPackageRef: 'duration_sample_collection_package:duration-sample-collection-package.json#sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    sourceEvidenceRef: 'duration_experience_samples_export:duration-experience-samples-export.json#sha256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    rows: [{
      stableCode: '01-01',
      coverageStatus: 'covered',
      acceptedSampleIds: ['sample-1', 'sample-2'],
    }],
    blockers: [],
    mutationBoundary: {
      readsDurationSampleCollectionPackage: true,
      readsDurationExperienceSamplesExport: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  }
}

function runtimeSeedEvidencePipelineFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-evidence-pipeline/v1',
    source: 'run-default-master-plan-runtime-seed-evidence-pipeline',
    generatedAt: '2026-07-01T08:00:00.000Z',
    status: 'runtime_seed_import_not_required',
    productionReady: false,
    blockers: [],
    reports: {
      preflight: {
        key: 'preflight',
        path: 'project-testing/reports/default-master-plan-production-readiness/runtime-seed-preflight.json',
        sha256: '1'.repeat(64),
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-preflight/v1',
        status: 'runtime_seed_evidence_ready',
      },
      coverage: {
        key: 'coverage',
        path: 'project-testing/reports/default-master-plan-production-readiness/runtime-seed-coverage-package.json',
        sha256: '2'.repeat(64),
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-coverage-package/v1',
        status: 'runtime_seed_evidence_ready_no_import_required',
      },
      importGate: {
        key: 'importGate',
        path: 'project-testing/reports/default-master-plan-production-readiness/runtime-seed-import-gate.json',
        sha256: '3'.repeat(64),
        schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-gate/v1',
        status: 'runtime_seed_import_not_required',
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
      coverage: {
        status: 'runtime_seed_evidence_ready_no_import_required',
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
      invokesRuntimeWriters: false,
    },
  }
}

function writerResultFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-dependency-writer-evidence/v1',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    execution_mode: 'execute',
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
        taskId: 'task-foundation',
        dependencyTaskId: 'task-site',
        dependencyType: 'FS',
        lagDays: 0,
        sourceType: 'construction_organization_plan_network',
        sourceEventId: 'event-release-1',
      }],
    },
  }
}

function taskDependenciesExportFixture() {
  return {
    rows: [{
      id: 'dependency-1',
      project_id: 'project-1',
      task_id: 'task-foundation',
      dependency_task_id: 'task-site',
      dependency_type: 'FS',
      lag_days: 0,
      source_type: 'construction_organization_plan_network',
      source_event_id: 'event-release-1',
    }],
  }
}

function runtimePublicationsFixture() {
  return {
    rows: [{
      project_id: 'project-1',
      status: 'runtime_published',
      runtime_publication_status: 'runtime_published',
      publication_key: 'default-master-plan-runtime-publication-1',
      asset_kind: 'default_master_plan',
      generation_mode: 'residential_master_plan_v2',
      accepted_baseline_id: 'baseline-reviewed',
      rollback_target: 'rollback:default-master-plan-runtime-publication-1',
      published_by: 'release-user-1',
      published_at: '2026-07-01T08:00:00.000Z',
      runtime_lineage: {
        projectId: 'project-1',
        acceptedBaselineId: 'baseline-reviewed',
        assetKind: 'default_master_plan',
        generationMode: 'residential_master_plan_v2',
        runtimeAssetKey: 'runtime.default_master_plan.project-1',
        dependencyWriterReleaseRecordTarget: 'default-master-plan-runtime-publication-1',
        rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
        projectManagerReviewEvidenceRef: 'pm-review-evidence.json',
        durationCalibrationEvidenceRef: 'duration-calibration-evidence.json',
        dependencyWriterEvidenceRef: 'dependency-writer-evidence.json',
      },
    }],
  }
}

function smokeFixture(kind, status = 'pass') {
  return {
    status,
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    evidenceRef: `project-testing/reports/default-master-plan-production-readiness/${kind}.json`,
  }
}

function realProductionOutcomeFixture() {
  return {
    status: 'verified',
    environment: 'production',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json#sha256=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    acceptedBy: 'production-owner:9e4a5570-0032-43bd-8f17-0bc415a1eb70',
    acceptedAt: '2026-07-01T10:00:00.000Z',
    approvalRef: 'approval:default-master-plan-production-release-1',
    runtimePublicationEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/runtime-publication-evidence.json#sha256=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    apiReadSmokeEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json#sha256=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    uiConsumptionSmokeEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json#sha256=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    criticalPathReadbackEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    rollbackEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/rollback-verification.json#sha256=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    target: {
      envFileRef: 'production-secret:SUPABASE_MIGRATION_URL',
      supabaseProjectRef: 'abcdefghijklmnopqrst',
      databaseHost: 'db.abcdefghijklmnopqrst.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      environment: 'production',
    },
  }
}
