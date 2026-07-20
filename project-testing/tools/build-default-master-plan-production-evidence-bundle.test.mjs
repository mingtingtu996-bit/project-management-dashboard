import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const SCRIPT_PATH = path.resolve('project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs')
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

test('writes a blocked no-write evidence bundle when runtime evidence files are missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-bundle-'))
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
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const bundle = JSON.parse(await readFile(path.join(outputRoot, 'evidence-bundle.json'), 'utf8'))

    assert.equal(bundle.schemaVersion, 'workbuddy-default-master-plan-production-evidence-bundle/v1')
    assert.equal(bundle.status, 'blocked')
    assert.equal(bundle.productionReady, false)
    assert.equal(bundle.readinessReport.status, 'blocked')
    assert.deepEqual(bundle.missingEvidenceTypes, [
      'durationCalibrationEvidence',
      'dependencyWriterEvidence',
      'runtimePublicationEvidence',
      'postPublishSmokeRollbackEvidence',
    ])
    assert.equal(bundle.evidenceBuilderIndex.some((item) => item.type === 'reviewEvidence'), false)
    assert.equal(
      bundle.evidenceBuilderIndex.find((item) => item.type === 'dependencyWriterEvidence')?.builder,
      'project-testing/tools/build-default-master-plan-dependency-writer-evidence.mjs',
    )
    assert.equal(bundle.nextEvidenceActions.length, 4)
    assert.deepEqual(
      bundle.nextEvidenceActions.map((item) => item.type),
      bundle.missingEvidenceTypes,
    )
    assert.match(
      bundle.nextEvidenceActions.find((item) => item.type === 'dependencyWriterEvidence')?.requiredInputs.join('\n'),
      /task_dependencies export/,
    )
    assert.equal(bundle.mutationBoundary.writesProductionTables, false)
    assert.equal(bundle.mutationBoundary.invokesRuntimeWriters, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('writes a complete hashed evidence bundle when all runtime evidence files pass readiness', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-bundle-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')
  const runtimeSeedEvidencePipeline = path.join(root, 'runtime-seed-evidence-pipeline.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(runtimeSeedEvidencePipeline, runtimeSeedEvidencePipelineFixture())
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
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--runtime-seed-evidence-pipeline',
      runtimeSeedEvidencePipeline,
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

    const bundle = JSON.parse(await readFile(path.join(outputRoot, 'evidence-bundle.json'), 'utf8'))
    const evidenceByType = Object.fromEntries(bundle.evidenceFiles.map((item) => [item.type, item]))

    assert.equal(bundle.status, 'production_ready_evidence_bundle_complete')
    assert.equal(bundle.productionReady, true)
    assert.equal(bundle.readinessReport.status, 'pass')
    assert.equal(bundle.readinessReport.productionReady, true)
    assert.equal(bundle.missingEvidenceTypes.length, 0)
    assert.deepEqual(bundle.sourceManifestBlockers, [])
    assert.match(bundle.sourceManifest.sha256, /^[a-f0-9]{64}$/)
    assert.deepEqual(bundle.nextEvidenceActions, [])
    assert.equal(bundle.evidenceFiles.length, 4)
    for (const type of [
      'durationCalibrationEvidence',
      'dependencyWriterEvidence',
      'runtimePublicationEvidence',
      'postPublishSmokeRollbackEvidence',
    ]) {
      assert.match(evidenceByType[type].sha256, /^[a-f0-9]{64}$/)
      assert.equal(evidenceByType[type].exists, true)
    }
    assert.equal(
      evidenceByType.dependencyWriterEvidence.expectedBuilder,
      'project-testing/tools/build-default-master-plan-dependency-writer-evidence.mjs',
    )
    assert.equal(bundle.readinessReport.jsonPath.endsWith('readiness.json'), true)
    assert.equal(bundle.mutationBoundary.writesProductionTables, false)
    assert.equal(bundle.mutationBoundary.invokesRuntimeWriters, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('passes runtime seed evidence pipeline as supporting evidence into readiness', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-bundle-runtime-seed-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const runtimeSeedEvidencePipeline = path.join(root, 'runtime-seed-evidence-pipeline.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(runtimeSeedEvidencePipeline, runtimeSeedEvidencePipelineFixture())
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
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      reviewEvidence,
      '--runtime-seed-evidence-pipeline',
      runtimeSeedEvidencePipeline,
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

    const bundle = JSON.parse(await readFile(path.join(outputRoot, 'evidence-bundle.json'), 'utf8'))
    const readiness = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const runtimeSeedGate = readiness.gates.find((gate) => gate.id === 'runtime_seed_and_reference_days_evidence')
    const supportingByType = Object.fromEntries(bundle.supportingEvidenceFiles.map((item) => [item.type, item]))

    assert.equal(runtimeSeedGate.status, 'pass')
    assert.equal(bundle.checker.command.includes('--runtime-seed-evidence-pipeline'), true)
    assert.equal(supportingByType.runtimeSeedEvidencePipeline.exists, true)
    assert.match(supportingByType.runtimeSeedEvidencePipeline.sha256, /^[a-f0-9]{64}$/)
    assert.equal(
      bundle.supportingEvidenceBuilderIndex.find((item) => item.type === 'runtimeSeedEvidencePipeline')?.builder,
      'project-testing/tools/run-default-master-plan-runtime-seed-evidence-pipeline.mjs',
    )
    assert.equal(bundle.mutationBoundary.invokesRuntimeWriters, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not build a production-ready bundle when real outcome target fingerprint is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-bundle-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')
  const runtimeSeedEvidencePipeline = path.join(root, 'runtime-seed-evidence-pipeline.json')
  const realOutcome = realProductionOutcomeEvidenceFixture()
  const { target: _target, ...realOutcomeWithoutTarget } = realOutcome

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(runtimeSeedEvidencePipeline, runtimeSeedEvidencePipelineFixture())
  await writeJson(durationEvidence, durationCalibrationEvidenceFixture())
  await writeJson(dependencyWriterEvidence, dependencyWriterEvidenceFixture())
  await writeJson(runtimePublicationEvidence, runtimePublicationEvidenceFixture())
  await writeJson(smokeRollbackEvidence, {
    ...smokeRollbackEvidenceFixture(),
    environment: 'production',
    realProductionOutcomeEvidence: realOutcomeWithoutTarget,
  })
  await writeJson(sourceManifest, sourceManifestFixture({
    environment: 'production',
    realProductionOutcomeEvidence: realOutcomeWithoutTarget,
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
      '--runtime-seed-evidence-pipeline',
      runtimeSeedEvidencePipeline,
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

    const bundle = JSON.parse(await readFile(path.join(outputRoot, 'evidence-bundle.json'), 'utf8'))
    const readiness = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const provenanceGate = readiness.gates.find((gate) => gate.id === 'runtime_source_export_provenance')

    assert.equal(bundle.status, 'blocked')
    assert.equal(bundle.productionReady, false)
    assert.equal(bundle.readinessReport.productionReady, false)
    assert.match(provenanceGate.blockers.join('\n'), /real_production_outcome_target_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('keeps a complete staging controlled replay bundle below production-ready', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-bundle-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')
  const runtimeSeedEvidencePipeline = path.join(root, 'runtime-seed-evidence-pipeline.json')

  const dependencyWriter = dependencyWriterEvidenceFixture()
  dependencyWriter.domain_writer_result.boundaryPolicy = [
    'staging_writer_replays_default_master_plan_dependencies',
  ]

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(runtimeSeedEvidencePipeline, runtimeSeedEvidencePipelineFixture())
  await writeJson(durationEvidence, durationCalibrationEvidenceFixture())
  await writeJson(dependencyWriterEvidence, dependencyWriter)
  await writeJson(runtimePublicationEvidence, runtimePublicationEvidenceFixture())
  await writeJson(smokeRollbackEvidence, smokeRollbackEvidenceFixture())
  await writeJson(sourceManifest, sourceManifestFixture({
    sourceManifestPath: sourceManifest,
    sourceExports: {
      ...sourceManifestFixture().sourceExports,
      rollbackVerification: {
        ...sourceManifestFixture().sourceExports.rollbackVerification,
        sourcePath: 'project-testing/reports/default-master-plan-production-readiness/staging-runtime/rollback-verification.json',
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
      '--runtime-seed-evidence-pipeline',
      runtimeSeedEvidencePipeline,
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

    const bundle = JSON.parse(await readFile(path.join(outputRoot, 'evidence-bundle.json'), 'utf8'))

    assert.equal(bundle.status, 'staging_runtime_chain_passed')
    assert.equal(bundle.productionReady, false)
    assert.equal(bundle.readinessReport.status, 'staging_runtime_chain_passed')
    assert.equal(bundle.readinessReport.runtimeEvidenceChainPassed, true)
    assert.equal(bundle.productionReadinessBlockers.includes('staging_controlled_replay_not_production_ready'), true)
    assert.equal(bundle.missingEvidenceTypes.length, 0)
    assert.deepEqual(bundle.sourceManifestBlockers, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('uses default runtime evidence files under output root when explicit bundle paths are omitted', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-bundle-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(outputRoot, 'pm-review-evidence.json')
  const durationEvidence = path.join(outputRoot, 'duration-calibration-evidence.json')
  const dependencyWriterEvidence = path.join(outputRoot, 'dependency-writer-evidence.json')
  const runtimePublicationEvidence = path.join(outputRoot, 'runtime-publication-evidence.json')
  const smokeRollbackEvidence = path.join(outputRoot, 'post-publish-smoke-rollback-evidence.json')
  const runtimeSeedEvidencePipeline = path.join(outputRoot, 'runtime-seed-evidence-pipeline.json')
  const sourceManifest = path.join(outputRoot, 'source-exports', 'source-exports-manifest.json')

  const dependencyWriter = dependencyWriterEvidenceFixture()
  dependencyWriter.domain_writer_result.boundaryPolicy = [
    'staging_writer_replays_default_master_plan_dependencies',
  ]

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
  await writeJson(reviewEvidence, reviewEvidenceFixture())
  await writeJson(runtimeSeedEvidencePipeline, runtimeSeedEvidencePipelineFixture())
  await writeJson(durationEvidence, durationCalibrationEvidenceFixture())
  await writeJson(dependencyWriterEvidence, dependencyWriter)
  await writeJson(runtimePublicationEvidence, runtimePublicationEvidenceFixture())
  await writeJson(smokeRollbackEvidence, smokeRollbackEvidenceFixture())
  await writeJson(sourceManifest, sourceManifestFixture({
    sourceManifestPath: sourceManifest,
    sourceExports: {
      ...sourceManifestFixture().sourceExports,
      rollbackVerification: {
        ...sourceManifestFixture().sourceExports.rollbackVerification,
        sourcePath: 'project-testing/reports/default-master-plan-production-readiness/staging-runtime/rollback-verification.json',
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

    const bundle = JSON.parse(await readFile(path.join(outputRoot, 'evidence-bundle.json'), 'utf8'))

    assert.equal(bundle.status, 'staging_runtime_chain_passed')
    assert.equal(bundle.productionReady, false)
    assert.equal(bundle.readinessReport.status, 'staging_runtime_chain_passed')
    assert.equal(bundle.readinessReport.runtimeEvidenceChainPassed, true)
    assert.equal(bundle.missingEvidenceTypes.length, 0)
    assert.equal(bundle.evidenceFiles.length, 4)
    assert.deepEqual(bundle.sourceManifestBlockers, [])
    assert.equal(bundle.productionReadinessBlockers.includes('staging_controlled_replay_not_production_ready'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks complete-looking evidence bundle when source manifest provenance is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-bundle-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const reviewEvidence = path.join(root, 'pm-review.json')
  const durationEvidence = path.join(root, 'duration-calibration.json')
  const dependencyWriterEvidence = path.join(root, 'dependency-writer.json')
  const runtimePublicationEvidence = path.join(root, 'runtime-publication.json')
  const smokeRollbackEvidence = path.join(root, 'smoke-rollback.json')

  await writeJson(profileReport, profileReportFixture())
  await writeResidentialReport(residentialReport)
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

    const bundle = JSON.parse(await readFile(path.join(outputRoot, 'evidence-bundle.json'), 'utf8'))

    assert.equal(bundle.readinessReport.productionReady, false)
    assert.equal(bundle.status, 'blocked')
    assert.equal(bundle.productionReady, false)
    assert.equal(bundle.sourceManifestBlockers.includes('source_export_manifest_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function sourceManifestFixture({ sourceManifestPath = null, ...overrides } = {}) {
  const realProductionOutcomeEvidence = overrides.realProductionOutcomeEvidence ?? null
  delete overrides.realProductionOutcomeEvidence
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
    ...overrides,
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
    pipelineArgs: sourceManifestPipelineArgs(manifest, sourceManifestPath),
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
      ? path.resolve(sourceManifestPath)
      : `${manifest.outputRoot}/source-exports-manifest.json`,
    '--review-export',
    manifest.sourceExports.reviewExport.path,
    '--duration-samples',
    manifest.sourceExports.durationSamples.path,
    '--task-dependencies',
    manifest.sourceExports.taskDependencies.path,
    '--runtime-publications',
    manifest.sourceExports.runtimePublications.path,
    '--runtime-consumptions',
    manifest.sourceExports.runtimeConsumptions.path,
    '--api-read-smoke',
    manifest.sourceExports.apiReadSmoke.path,
    '--ui-consumption-smoke',
    manifest.sourceExports.uiConsumptionSmoke.path,
    '--critical-path-readback',
    manifest.sourceExports.criticalPathReadback.path,
    '--rollback-verification',
    manifest.sourceExports.rollbackVerification.path,
  ]
  if (manifest.sourceExports.realProductionOutcome?.path) {
    args.push('--real-production-outcome', manifest.sourceExports.realProductionOutcome.path)
  }
  return args
}

async function writeResidentialReport(filePath) {
  await writeFile(filePath, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
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

function runtimeSeedEvidencePipelineFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-evidence-pipeline/v1',
    source: 'run-default-master-plan-runtime-seed-evidence-pipeline',
    status: 'runtime_seed_import_not_required',
    productionReady: false,
    blockers: [],
    summary: {
      preflight: {
        status: 'runtime_seed_evidence_ready',
        readyBusinessTypeCount: 11,
        missingBusinessTypeCount: 0,
        requiredRuntimeSeedStableCodeCount: 0,
        runtimeReferenceDays: {
          readyBusinessTypeCount: 11,
          missingBusinessTypeCount: 0,
          missingBusinessTypes: [],
          requiredRuntimeReferenceStableCodes: [],
          requiredRuntimeReferenceStableCodeCount: 0,
          evidenceLevelRequired: 'runtime_calibrated_l2',
        },
        blockers: [],
      },
      coverage: {
        status: 'runtime_seed_evidence_ready_no_import_required',
        requiredStableCodeCount: 0,
        coveredStableCodeCount: 0,
        missingStableCodeCount: 0,
        missingStableCodes: [],
      },
      importGate: {
        status: 'runtime_seed_import_not_required',
        importRequired: false,
        runtimeSeedEvidenceAlreadyReady: true,
        importMode: 'not_required_runtime_seed_evidence_ready',
        blockers: [],
      },
    },
    reports: {
      preflight: 'project-testing/reports/default-master-plan-production-readiness/runtime-seed-evidence-preflight.json',
      coverage: 'project-testing/reports/default-master-plan-production-readiness/runtime-seed-coverage-package.json',
      importGate: 'project-testing/reports/default-master-plan-production-readiness/runtime-seed-import-gate.json',
    },
    mutationBoundary: {
      writesEvidenceReportsOnly: true,
      runsReadOnlyEvidenceScripts: true,
      readsRuntimeSeedReports: true,
      writesAlgorithmSeedRecords: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
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
      releaseRecordTarget: CANONICAL_RUNTIME_PUBLICATION_KEY,
      rollbackTarget: `rollback:${CANONICAL_RUNTIME_PUBLICATION_KEY}`,
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
