import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  buildDefaultMasterPlanProductionOperatorHandoff,
  parseArgs,
} from './build-default-master-plan-production-operator-handoff.mjs'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')

function repoRelativeForTest(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

test('parseArgs accepts explicit duration sample coverage evidence path', () => {
  const coverageEvidencePath = path.join('tmp', 'duration-sample-coverage-evidence.json')

  const options = parseArgs([
    '--duration-sample-coverage-evidence',
    coverageEvidencePath,
  ])

  assert.equal(options.durationSampleCoverageEvidence, path.resolve(coverageEvidencePath))
})

test('parseArgs accepts explicit duration calibration evidence path', () => {
  const calibrationEvidencePath = path.join('tmp', 'duration-calibration-evidence.json')

  const options = parseArgs([
    '--duration-calibration-evidence',
    calibrationEvidencePath,
  ])

  assert.equal(options.durationCalibrationEvidence, path.resolve(calibrationEvidencePath))
})

test('parseArgs accepts explicit runtime seed evidence pipeline path', () => {
  const runtimeSeedEvidencePipelinePath = path.join('tmp', 'runtime-seed-evidence-pipeline.json')

  const options = parseArgs([
    '--runtime-seed-evidence-pipeline',
    runtimeSeedEvidencePipelinePath,
  ])

  assert.equal(options.runtimeSeedEvidencePipeline, path.resolve(runtimeSeedEvidencePipelinePath))
})

test('parseArgs accepts explicit runtime seed import execution path', () => {
  const runtimeSeedImportExecutionPath = path.join('tmp', 'runtime-seed-import-execution.json')

  const options = parseArgs([
    '--runtime-seed-import-execution',
    runtimeSeedImportExecutionPath,
  ])

  assert.equal(options.runtimeSeedImportExecution, path.resolve(runtimeSeedImportExecutionPath))
})

test('parseArgs accepts explicit candidate refresh authorization package path', () => {
  const authorizationPackagePath = path.join('tmp', 'candidate-refresh-authorization-package.json')

  const options = parseArgs([
    '--candidate-refresh-authorization-package',
    authorizationPackagePath,
  ])

  assert.equal(options.candidateRefreshAuthorizationPackage, path.resolve(authorizationPackagePath))
})

test('parseArgs accepts explicit completed task export report path', () => {
  const completedTaskExportReportPath = path.join('tmp', 'completed-task-export.report.json')

  const options = parseArgs([
    '--completed-task-export-report',
    completedTaskExportReportPath,
  ])

  assert.equal(options.completedTaskExportReport, path.resolve(completedTaskExportReportPath))
})

test('parseArgs accepts explicit runtime candidate alignment preflight path', () => {
  const runtimeCandidateAlignmentPath = path.join('tmp', 'runtime-candidate-alignment-preflight.json')

  const options = parseArgs([
    '--runtime-candidate-alignment-preflight',
    runtimeCandidateAlignmentPath,
  ])

  assert.equal(options.runtimeCandidateAlignmentPreflight, path.resolve(runtimeCandidateAlignmentPath))
})

test('parseArgs accepts explicit runtime task alignment refresh package path', () => {
  const runtimeTaskAlignmentRefreshPackagePath = path.join('tmp', 'runtime-task-alignment-refresh-package.json')

  const options = parseArgs([
    '--runtime-task-alignment-refresh-package',
    runtimeTaskAlignmentRefreshPackagePath,
  ])

  assert.equal(options.runtimeTaskAlignmentRefreshPackage, path.resolve(runtimeTaskAlignmentRefreshPackagePath))
})

test('parseArgs accepts explicit runtime task alignment review evidence path', () => {
  const runtimeTaskAlignmentReviewEvidencePath = path.join('tmp', 'runtime-task-alignment-review-evidence.json')

  const options = parseArgs([
    '--runtime-task-alignment-review-evidence',
    runtimeTaskAlignmentReviewEvidencePath,
  ])

  assert.equal(options.runtimeTaskAlignmentReviewEvidence, path.resolve(runtimeTaskAlignmentReviewEvidencePath))
})

test('treats legacy PM-only readiness evidence as optional offline development review', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-pm-correction-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const durationGapPath = path.join(root, 'duration-gap.json')
  const discoveryPath = path.join(root, 'candidate-discovery.json')
  const readinessPath = path.join(root, 'readiness.json')
  const evidenceBundlePath = path.join(root, 'evidence-bundle.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(durationGapPath, {
    ...durationGapFixture(),
    status: 'pass',
    blockers: [],
    summary: {
      candidateRowCount: 2,
      coveredStableCodeCount: 2,
      missingStableCodeCount: 0,
      invalidSampleCount: 0,
    },
  })
  await writeJson(discoveryPath, {
    ...discoveryFixture(),
    recommendedCandidate: {
      ...discoveryFixture().recommendedCandidate,
      evidenceReadiness: {
        blockers: ['candidate_default_master_plan_review_missing'],
      },
    },
  })
  await writeJson(readinessPath, {
    ...readinessFixture(),
    gates: [
      { id: 'legacy_serial_template_path_removed', status: 'pass' },
      { id: 'candidate_master_plan_shape_11_business_types', status: 'pass' },
      { id: 'project_manager_review_evidence', status: 'blocked' },
    ],
    productionReadinessBlockers: ['project_manager_review_evidence'],
  })
  await writeJson(evidenceBundlePath, {
    ...evidenceBundleFixture(),
    status: 'ready',
    productionReady: true,
    missingEvidenceTypes: ['reviewEvidence'],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      durationGapPlan: durationGapPath,
      discovery: discoveryPath,
      readiness: readinessPath,
      evidenceBundle: evidenceBundlePath,
      output: outputPath,
      environment: 'production',
      exportedBy: 'release-operator-1',
      publicationKey: 'default-master-plan-runtime-publication-1',
      now: new Date('2026-07-14T02:00:00.000Z'),
    })

    assert.equal(handoff.productionReady, true)
    assert.deepEqual(handoff.currentBlockers, [])
    assert.equal(handoff.pmReviewGate, undefined)
    assert.equal(handoff.reviewPackage, undefined)
    assert.equal(handoff.reviewRecordPreflight, undefined)
    assert.equal(handoff.offlineDevelopmentQualityReview.requiredForRuntime, false)
    assert.equal(
      handoff.offlineDevelopmentQualityReview.intendedUse,
      'offline_development_quality_review_and_template_calibration',
    )
    assert.equal(
      handoff.actionSequence.some((action) => ['pm_review_package', 'pm_review_record_preflight', 'pm_review_record'].includes(action.id)),
      false,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds a no-write operator handoff from current candidate and readiness artifacts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const durationGapPath = path.join(root, 'duration-gap.json')
  const discoveryPath = path.join(root, 'candidate-discovery.json')
  const readinessPath = path.join(root, 'readiness.json')
  const evidenceBundlePath = path.join(root, 'evidence-bundle.json')
  const reviewPackagePath = path.join(root, 'pm-review-package.json')
  const reviewRecordPreflightPath = path.join(root, 'pm-review-record-preflight.json')
  const durationSampleCollectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const stagingAuthorizationPath = path.join(root, 'staging-runtime', 'staging-authorization.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(durationGapPath, durationGapFixture())
  await writeJson(discoveryPath, discoveryFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(evidenceBundlePath, evidenceBundleFixture())
  await writeJson(stagingAuthorizationPath, {
    schemaVersion: 'workbuddy-default-master-plan-staging-authorization/v1',
    status: 'authorized',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    companyId: 'company-1',
    environment: 'staging',
    authorizedBy: '郑俊红',
    authorizedByUserId: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
    authorizationDecision: 'school_staging_write_publish_rollback_allowed',
    allowedOperations: [
      'staging_dependency_write',
      'staging_runtime_publication',
      'staging_rollback_drill',
    ],
    productionReady: false,
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      durationGapPlan: durationGapPath,
      discovery: discoveryPath,
      readiness: readinessPath,
      evidenceBundle: evidenceBundlePath,
      reviewPackage: reviewPackagePath,
      reviewRecordPreflight: reviewRecordPreflightPath,
      durationSampleCollectionPackage: durationSampleCollectionPackagePath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      output: outputPath,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      publicationKey: 'default-master-plan-runtime-publication-1',
      now: new Date('2026-07-02T04:00:00.000Z'),
    })

    assert.equal(handoff.schemaVersion, 'workbuddy-default-master-plan-production-operator-handoff/v1')
    assert.equal(handoff.status, 'blocked')
    assert.equal(handoff.productionReady, false)
    assert.equal(handoff.baselineId, 'baseline-1')
    assert.equal(handoff.projectId, 'project-1')
    assert.equal(handoff.candidate.rowCount, 2)
    assert.equal(handoff.durationGap.missingStableCodeCount, 1)
    assert.equal(handoff.readiness.blockedGateCount, 5)
    assert.deepEqual(handoff.currentBlockers, [
      'accepted_duration_experience_samples_missing',
      'construction_organization_task_dependencies_missing',
      'runtime_publication_missing',
      'duration_samples_export_required',
      'duration_sample_coverage_incomplete',
      'runtime_duration_calibration_evidence',
      'production_dependency_writer_evidence',
      'runtime_publication_evidence',
      'post_publish_smoke_and_rollback_evidence',
      'runtime_evidence_lineage_consistency',
    ])
    assert.equal(handoff.offlineDevelopmentQualityReview.requiredForRuntime, false)
    assert.equal(handoff.offlineDevelopmentQualityReview.status, 'not_provided')
    assert.equal(handoff.durationSampleCollectionPackage.artifact.endsWith('duration-sample-collection-package.json'), true)
    assert.equal(handoff.durationSampleCollectionPackage.status, 'not_generated')
    assert.equal(handoff.runtimeMaterialPackage.artifact.endsWith('runtime-material-package.json'), true)
    assert.equal(handoff.runtimeMaterialPackage.status, 'not_generated')
    assert.equal(handoff.stagingAuthorization.status, 'authorized')
    assert.equal(handoff.stagingAuthorization.authorizedBy, '郑俊红')
    assert.equal(handoff.stagingAuthorization.authorizationDecision, 'school_staging_write_publish_rollback_allowed')
    assert.equal(handoff.stagingAuthorization.productionReady, false)
    assert.deepEqual(handoff.stagingAuthorization.allowedOperations, [
      'staging_dependency_write',
      'staging_runtime_publication',
      'staging_rollback_drill',
    ])
    const actionById = Object.fromEntries(handoff.actionSequence.map((action) => [action.id, action]))
    assert.equal(actionById.pm_review_package, undefined)
    assert.equal(actionById.pm_review_record_preflight, undefined)
    assert.equal(actionById.pm_review_record, undefined)
    assert.match(actionById.duration_sample_gap_refresh.command, /evidence:default-master-plan:duration-gaps/)
    assert.match(actionById.duration_sample_collection_package.command, /evidence:default-master-plan:duration-sample-package/)
    assert.match(actionById.duration_sample_collection_package.command, /--profile-report project-testing\/reports\/default-master-plan-profiles\/default-master-plan-profile-samples\.json/)
    assert.match(actionById.duration_sample_collection_package.command, /--baseline-id baseline-1/)
    assert.match(actionById.duration_sample_collection_package.command, /--project-id project-1/)
    assert.match(actionById.duration_sample_collection_package.command, /--profile-scope all/)
    assert.match(actionById.duration_sample_collection_package.command, /--profile-only/)
    assert.match(actionById.duration_source_export_collect.command, /--phase duration/)
    assert.match(actionById.real_duration_sample_material_template.command, /evidence:default-master-plan:real-duration-sample-template/)
    assert.match(actionById.real_duration_sample_material_template.command, /--collection-package .*duration-sample-collection-package\.json/)
    assert.match(actionById.real_duration_sample_material_template.command, /--real-evidence-gap-summary project-testing\/reports\/default-master-plan-production-readiness\/real-evidence-gap-summary\.json/)
    assert.match(actionById.real_duration_sample_material_template.command, /--collection-kit-output project-testing\/reports\/default-master-plan-production-readiness\/real-duration-sample-collection-kit\.json/)
    assert.match(actionById.real_duration_sample_material_template.command, /--output project-testing\/reports\/default-master-plan-production-readiness\/real-duration-sample-material\.template\.json/)
    assert.match(actionById.real_duration_sample_material_template.noWriteBoundary, /template only/)
    assert.match(actionById.real_duration_sample_collection_kit_preflight.command, /check-default-master-plan-real-duration-sample-collection-kit-preflight\.mjs/)
    assert.match(actionById.real_duration_sample_collection_kit_preflight.command, /--collection-kit project-testing\/reports\/default-master-plan-production-readiness\/real-duration-sample-collection-kit\.json/)
    assert.match(actionById.real_duration_sample_collection_kit_preflight.command, /--output project-testing\/reports\/default-master-plan-production-readiness\/real-duration-sample-collection-kit-preflight\.json/)
    assert.match(actionById.real_duration_sample_collection_kit_preflight.command, /--checked-by release-operator-1/)
    assert.match(actionById.real_duration_sample_collection_kit_preflight.noWriteBoundary, /does not write duration_experience_samples/)
    assert.match(actionById.real_duration_sample_material_from_collection_kit_preflight.command, /build-default-master-plan-real-duration-sample-material-from-collection-kit-preflight\.mjs/)
    assert.match(actionById.real_duration_sample_material_from_collection_kit_preflight.command, /--collection-kit-preflight project-testing\/reports\/default-master-plan-production-readiness\/real-duration-sample-collection-kit-preflight\.json/)
    assert.match(actionById.real_duration_sample_material_from_collection_kit_preflight.command, /--output project-testing\/reports\/default-master-plan-production-readiness\/real-duration-sample-material\.json/)
    assert.match(actionById.real_duration_sample_material_from_collection_kit_preflight.command, /--prepared-by release-operator-1/)
    assert.match(actionById.real_duration_sample_material_from_collection_kit_preflight.noWriteBoundary, /does not write duration_experience_samples/)
    assert.match(actionById.completed_task_export.command, /evidence:default-master-plan:completed-task-export/)
    assert.match(actionById.completed_task_export.command, /--raw-tasks project-testing\/reports\/default-master-plan-production-readiness\/source-exports\/raw-completed-tasks\.json/)
    assert.match(actionById.completed_task_export.command, /--output project-testing\/reports\/default-master-plan-production-readiness\/source-exports\/completed-task-export\.json/)
    assert.match(actionById.completed_task_export.noWriteBoundary, /does not write tasks/)
    assert.match(actionById.runtime_candidate_alignment_preflight.command, /evidence:default-master-plan:runtime-candidate-alignment/)
    assert.match(actionById.runtime_candidate_alignment_preflight.command, /--candidate-baseline .*candidate-baseline\.json/)
    assert.match(actionById.runtime_candidate_alignment_preflight.command, /--raw-tasks .*raw-completed-tasks\.json/)
    assert.match(actionById.runtime_candidate_alignment_preflight.command, /--output .*runtime-candidate-alignment-preflight\.json/)
    assert.match(actionById.runtime_candidate_alignment_preflight.noWriteBoundary, /does not write tasks/)
    assert.match(actionById.runtime_task_alignment_refresh_package.command, /evidence:default-master-plan:runtime-task-alignment-refresh-package/)
    assert.match(actionById.runtime_task_alignment_refresh_package.command, /--runtime-candidate-alignment-preflight .*runtime-candidate-alignment-preflight\.json/)
    assert.match(actionById.runtime_task_alignment_refresh_package.command, /--output .*runtime-task-alignment-refresh-package\.json/)
    assert.match(actionById.runtime_task_alignment_refresh_package.noWriteBoundary, /does not write tasks/)
    assert.match(actionById.runtime_task_alignment_review_evidence.command, /evidence:default-master-plan:runtime-task-alignment-review-evidence/)
    assert.match(actionById.runtime_task_alignment_review_evidence.command, /--runtime-task-alignment-refresh-package .*runtime-task-alignment-refresh-package\.json/)
    assert.match(actionById.runtime_task_alignment_review_evidence.command, /--review-decisions project-testing\/reports\/default-master-plan-production-readiness\/runtime-task-alignment-review-decisions\.json/)
    assert.match(actionById.runtime_task_alignment_review_evidence.command, /--output .*runtime-task-alignment-review-evidence\.json/)
    assert.match(actionById.runtime_task_alignment_review_evidence.noWriteBoundary, /does not write tasks/)
    assert.match(actionById.real_duration_sample_material_from_task_export.command, /evidence:default-master-plan:real-duration-sample-from-task-export/)
    assert.match(actionById.real_duration_sample_material_from_task_export.command, /--completed-task-export project-testing\/reports\/default-master-plan-production-readiness\/source-exports\/completed-task-export\.json/)
    assert.match(actionById.real_duration_sample_material_from_task_export.command, /--output project-testing\/reports\/default-master-plan-production-readiness\/real-duration-sample-material\.json/)
    assert.match(actionById.real_duration_sample_material_from_task_export.noWriteBoundary, /does not write duration_experience_samples/)
    assert.match(actionById.real_duration_sample_material_preflight.command, /evidence:default-master-plan:real-duration-sample-preflight/)
    assert.match(actionById.real_duration_sample_material_preflight.command, /--collection-package .*duration-sample-collection-package\.json/)
    assert.match(actionById.real_duration_sample_material_preflight.command, /--sample-material project-testing\/reports\/default-master-plan-production-readiness\/real-duration-sample-material\.json/)
    assert.match(actionById.real_duration_sample_material_preflight.command, /--output project-testing\/reports\/default-master-plan-production-readiness\/real-duration-sample-material-preflight\.json/)
    assert.match(actionById.real_duration_sample_material_preflight.noWriteBoundary, /does not write source exports/)
    assert.match(actionById.real_duration_sample_source_export.command, /evidence:default-master-plan:real-duration-sample-export/)
    assert.match(actionById.real_duration_sample_source_export.command, /--collection-package .*duration-sample-collection-package\.json/)
    assert.match(actionById.real_duration_sample_source_export.command, /--sample-material project-testing\/reports\/default-master-plan-production-readiness\/real-duration-sample-material\.json/)
    assert.match(actionById.real_duration_sample_source_export.command, /--material-preflight project-testing\/reports\/default-master-plan-production-readiness\/real-duration-sample-material-preflight\.json/)
    assert.match(actionById.real_duration_sample_source_export.command, /--output project-testing\/reports\/default-master-plan-production-readiness\/source-exports\/duration-experience-samples-export\.json/)
    assert.match(actionById.real_duration_sample_source_export.noWriteBoundary, /does not write duration_experience_samples/)
    assert.match(actionById.duration_sample_coverage.command, /evidence:default-master-plan:duration-sample-coverage/)
    assert.match(actionById.duration_sample_coverage.command, /--collection-package .*duration-sample-collection-package\.json/)
    assert.match(actionById.duration_sample_coverage.command, /--samples project-testing\/reports\/default-master-plan-production-readiness\/source-exports\/duration-experience-samples-export\.json/)
    assert.match(actionById.runtime_material_package.command, /evidence:default-master-plan:runtime-material-package/)
    assert.match(actionById.real_production_outcome_package.command, /evidence:default-master-plan:real-outcome-package/)
    assert.match(actionById.real_production_outcome_package.command, /--target-environment production/)
    assert.match(actionById.real_production_outcome_package.command, /--runtime-material-package .*runtime-material-package\.json/)
    assert.match(actionById.source_export_collect.command, /evidence:default-master-plan:export-sources/)
    assert.match(actionById.production_evidence_pipeline.command, /build-default-master-plan-production-evidence-pipeline/)
    assert.match(
      handoff.actionSequence.find((action) => action.id === 'readiness_check')?.command,
      /check-default-master-plan-production-readiness/,
    )
    assert.equal(handoff.mutationBoundary.writesProductionTables, false)
    assert.equal(handoff.mutationBoundary.invokesRuntimeWriters, false)

    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(written.currentBlockers.includes('duration_samples_export_required'), true)
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /baseline-1/)
    assert.match(markdown, /Offline Development Quality Review/)
    assert.doesNotMatch(markdown, /\| pm_review_(?:package|record)/)
    assert.match(markdown, /duration_sample_coverage_incomplete/)
    assert.match(markdown, /stagingAuthorization/)
    assert.match(markdown, /school_staging_write_publish_rollback_allowed/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('discovers canonical artifacts from the output report directory when paths are omitted', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-defaults-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline-baseline-1-school-items.json')
  const durationGapPath = path.join(root, 'duration-sample-gap-plan-school.json')
  const discoveryPath = path.join(root, 'candidate-discovery.json')
  const readinessPath = path.join(root, 'readiness.json')
  const evidenceBundlePath = path.join(root, 'evidence-bundle.json')
  const sourceManifestPath = path.join(root, 'source-exports', 'source-exports-manifest.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(durationGapPath, durationGapFixture())
  await writeJson(discoveryPath, discoveryFixture())
  await writeJson(readinessPath, readinessFixture())
  const sourceManifest = sourceManifestFixture(sourceManifestPath)
  sourceManifest.sourceExports.rawCompletedTasks = {
    path: path.join(path.dirname(sourceManifestPath), 'raw-completed-tasks.json'),
  }
  await writeJson(sourceManifestPath, sourceManifest)
  await writeJson(evidenceBundlePath, {
    ...evidenceBundleFixture(),
    sourceManifest: {
      path: sourceManifestPath,
      status: 'exported',
      blockers: [],
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      output: outputPath,
      now: new Date('2026-07-02T04:05:00.000Z'),
    })

    assert.equal(handoff.baselineId, 'baseline-1')
    assert.equal(handoff.projectId, 'project-1')
    assert.equal(handoff.publicationKey, 'default-master-plan-runtime-publication-1')
    assert.equal(handoff.exportedBy, 'release-user-1')
    assert.equal(handoff.artifacts.candidateBaseline, repoRelativeForTest(candidateBaselinePath))
    assert.equal(handoff.artifacts.durationGapPlan, repoRelativeForTest(durationGapPath))
    assert.equal(handoff.artifacts.discovery, repoRelativeForTest(discoveryPath))
    assert.equal(handoff.artifacts.readiness, repoRelativeForTest(readinessPath))
    assert.equal(handoff.artifacts.evidenceBundle, repoRelativeForTest(evidenceBundlePath))
    assert.equal(handoff.currentBlockers.includes('candidate_baseline_export_required'), false)
    assert.equal(handoff.currentBlockers.includes('readiness_report_required'), false)
    assert.match(
      handoff.actionSequence.find((action) => action.id === 'duration_sample_gap_refresh')?.command ?? '',
      /candidate-baseline-baseline-1-school-items\.json/,
    )
    const sourceExportCommand = handoff.actionSequence.find((action) => action.id === 'source_export_collect')?.command ?? ''
    assert.match(sourceExportCommand, /--publication-key default-master-plan-runtime-publication-1/)
    assert.match(sourceExportCommand, /--exported-by release-user-1/)
    assert.equal(sourceExportCommand.includes('<publication-key>'), false)
    assert.equal(sourceExportCommand.includes('<operator>'), false)
    assert.equal(sourceExportCommand.includes('<dependency-writer-result.json>'), false)
    assert.equal(sourceExportCommand.includes('<critical-path-readback.json>'), false)
    assert.equal(sourceExportCommand.includes('<api-read-smoke.json>'), false)
    assert.equal(sourceExportCommand.includes('<ui-consumption-smoke.json>'), false)
    assert.equal(sourceExportCommand.includes('<rollback-verification.json>'), false)
    assert.match(sourceExportCommand, /--review-export .*candidate-default-master-plan-review-export\.json/)
    assert.match(sourceExportCommand, /--duration-samples .*duration-experience-samples-export\.json/)
    assert.match(sourceExportCommand, /--raw-completed-tasks .*raw-completed-tasks\.json/)
    assert.match(sourceExportCommand, /--task-dependencies .*task-dependencies-export\.json/)
    assert.match(sourceExportCommand, /--runtime-publications .*wbs-template-runtime-publications-export\.json/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('prefers the current report source manifest over a stale bundle manifest when discovering artifacts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-current-manifest-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline-baseline-1-school-items.json')
  const durationGapPath = path.join(root, 'duration-sample-gap-plan-school.json')
  const readinessPath = path.join(root, 'readiness.json')
  const evidenceBundlePath = path.join(root, 'evidence-bundle.json')
  const currentSourceManifestPath = path.join(root, 'source-exports', 'source-exports-manifest.json')
  const staleSourceManifestPath = path.join(root, 'old-release', 'source-exports', 'source-exports-manifest.json')
  const outputPath = path.join(root, 'operator-handoff.json')
  const currentPublicationKey = 'runtime.default_master_plan.current-project'
  const stalePublicationKey = 'runtime.default_master_plan.stale-project'
  const currentSourceManifest = sourceManifestFixture(currentSourceManifestPath)
  const staleSourceManifest = sourceManifestFixture(staleSourceManifestPath)

  currentSourceManifest.publicationKey = currentPublicationKey
  currentSourceManifest.pipelineArgs[currentSourceManifest.pipelineArgs.indexOf('--publication-key') + 1] = currentPublicationKey
  staleSourceManifest.publicationKey = stalePublicationKey
  staleSourceManifest.pipelineArgs[staleSourceManifest.pipelineArgs.indexOf('--publication-key') + 1] = stalePublicationKey

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(durationGapPath, durationGapFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(currentSourceManifestPath, currentSourceManifest)
  await writeJson(staleSourceManifestPath, staleSourceManifest)
  await writeJson(evidenceBundlePath, {
    ...evidenceBundleFixture(),
    sourceManifest: {
      path: staleSourceManifestPath,
      status: 'exported',
      blockers: [],
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      output: outputPath,
      now: new Date('2026-07-08T02:10:00.000Z'),
    })

    const pipelineCommand = handoff.actionSequence.find((action) => action.id === 'production_evidence_pipeline')?.command ?? ''
    assert.equal(handoff.publicationKey, currentPublicationKey)
    assert.equal(handoff.artifacts.sourceManifest, repoRelativeForTest(currentSourceManifestPath))
    assert.match(pipelineCommand, new RegExp(`--publication-key ${currentPublicationKey}`))
    assert.match(pipelineCommand, /--source-manifest .*source-exports[\\/]+source-exports-manifest\.json/)
    assert.equal(pipelineCommand.includes(stalePublicationKey), false)
    assert.equal(pipelineCommand.includes('old-release'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('skips stale ineligible candidate exports when discovering the current candidate baseline', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-defaults-'))
  const staleCandidatePath = path.join(root, 'candidate-baseline-stale-school-items.json')
  const currentCandidatePath = path.join(root, 'candidate-baseline-baseline-1-school-items.json')
  const durationGapPath = path.join(root, 'duration-sample-gap-plan-school.json')
  const discoveryPath = path.join(root, 'candidate-discovery.json')
  const readinessPath = path.join(root, 'readiness.json')
  const evidenceBundlePath = path.join(root, 'evidence-bundle.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(currentCandidatePath, candidateBaselineFixture())
  await writeJson(staleCandidatePath, {
    ...candidateBaselineFixture(),
    baselineId: 'stale-baseline',
    projectId: 'project-1',
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
  await writeJson(durationGapPath, durationGapFixture())
  await writeJson(discoveryPath, {
    ...discoveryFixture(),
    recommendedCandidate: {
      ...discoveryFixture().recommendedCandidate,
      baselineId: '',
    },
  })
  await writeJson(readinessPath, {
    ...readinessFixture(),
    baselineId: '',
  })
  await writeJson(evidenceBundlePath, evidenceBundleFixture())

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      output: outputPath,
      now: new Date('2026-07-02T04:05:30.000Z'),
    })

    assert.equal(
      handoff.artifacts.candidateBaseline,
      repoRelativeForTest(currentCandidatePath),
    )
    assert.equal(handoff.baselineId, 'baseline-1')
    assert.equal(
      handoff.currentBlockers.includes('candidate_baseline_contains_retired_or_low_information_sources'),
      false,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks handoff creation when candidate identity and readiness identity disagree', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const durationSampleCollectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    baselineId: 'other-baseline',
    projectId: 'project-1',
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      output: outputPath,
      now: new Date('2026-07-02T04:10:00.000Z'),
    })

    assert.equal(handoff.status, 'blocked')
    assert.equal(handoff.currentBlockers.includes('handoff_identity_mismatch'), true)
    assert.equal(handoff.identityConsistency.matches, false)
    assert.equal(handoff.productionReady, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('carries staging production-readiness blockers into operator handoff current blockers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const durationSampleCollectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    status: 'staging_runtime_chain_passed',
    currentEvidenceLevel: 'staging_controlled_replay_runtime_chain',
    productionReadinessBlockers: [
      'staging_controlled_replay_not_production_ready',
      'real_production_or_live_outcome_evidence_required',
    ],
    gates: [
      { id: 'legacy_serial_template_path_removed', status: 'pass' },
      { id: 'candidate_master_plan_shape_11_business_types', status: 'pass' },
      { id: 'runtime_source_export_provenance', status: 'pass' },
      { id: 'project_manager_review_evidence', status: 'pass' },
      { id: 'runtime_duration_calibration_evidence', status: 'pass' },
      { id: 'production_dependency_writer_evidence', status: 'pass' },
      { id: 'runtime_publication_evidence', status: 'pass' },
      { id: 'post_publish_smoke_and_rollback_evidence', status: 'pass' },
      { id: 'runtime_evidence_lineage_consistency', status: 'pass' },
      { id: 'production_readiness', status: 'blocked' },
    ],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      durationSampleCollectionPackage: durationSampleCollectionPackagePath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      output: outputPath,
      now: new Date('2026-07-02T04:15:00.000Z'),
    })

    assert.equal(handoff.status, 'blocked')
    assert.equal(handoff.productionReady, false)
    assert.deepEqual(handoff.currentBlockers, [
      'staging_controlled_replay_not_production_ready',
      'real_production_or_live_outcome_evidence_required',
      'production_readiness',
    ])
    assert.equal(handoff.readiness.blockedGateCount, 1)
    assert.deepEqual(handoff.readiness.blockedGateIds, ['production_readiness'])
    assert.deepEqual(handoff.productionReadinessBlockers, [
      'staging_controlled_replay_not_production_ready',
      'real_production_or_live_outcome_evidence_required',
    ])
    assert.match(
      handoff.actionSequence.find((action) => action.id === 'source_export_collect')?.intent ?? '',
      /supporting non-production source exports only/,
    )
    assert.match(
      handoff.actionSequence.find((action) => action.id === 'production_evidence_pipeline')?.intent ?? '',
      /supporting non-production evidence/,
    )
    assert.match(
      handoff.actionSequence.find((action) => action.id === 'production_evidence_pipeline')?.noWriteBoundary ?? '',
      /must not be treated as production-ready/,
    )
    const readinessCheckAction = handoff.actionSequence.find((action) => action.id === 'readiness_check')
    assert.match(readinessCheckAction?.intent ?? '', /production-readiness total gate/)
    assert.equal(readinessCheckAction?.intent.includes('eight-gate'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('carries candidate export hygiene blockers into operator handoff current blockers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const candidateHygienePath = path.join(root, 'candidate-export-hygiene.json')
  const candidateRefreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const candidateRefreshExecutionPath = path.join(root, 'candidate-refresh-execution.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    status: 'production_readiness_ready',
    productionReady: true,
    gates: [],
    productionReadinessBlockers: [],
  })
  await writeJson(candidateHygienePath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-export-hygiene/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    blockers: ['selected_candidate_export_profile_shape_mismatch'],
    profileComparison: {
      status: 'mismatch',
      businessType: 'school',
      candidateRowCount: 16,
      profileScheduleRowCount: 18,
      missingProfileRowCount: 2,
    },
  })
  await writeJson(candidateRefreshPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'refresh_required',
    productionReady: false,
    refreshRequired: true,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    targetProfile: {
      scheduleRowCount: 18,
      baseRowCount: 12,
      profileRowCount: 6,
      targetRowCount: 18,
    },
    diff: {
      currentRowCount: 16,
      targetRowCount: 18,
      missingTargetRows: [
        {
          code: 'BTMP-SCH-02',
          title: '教学楼二次结构与普通教室粗装修',
          executionPhase: 'secondary_structure_fitout_roughin',
          executionLane: 'teaching_secondary_structure',
        },
      ],
      extraCurrentRows: [],
      codeChangedRows: [
        {
          fromCode: 'BTMP-SCH-02',
          toCode: 'BTMP-SCH-03',
          title: '实验室通风与专业机电安装',
        },
      ],
      dateOrDurationChangedRows: [],
    },
    blockers: [
      'selected_candidate_export_profile_shape_mismatch',
      'candidate_baseline_refresh_required_before_runtime_publication',
    ],
    operationPlan: {
      mode: 'full_replace_candidate_baseline_items_from_profile_report',
      executeAllowed: false,
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
    },
  })
  await writeJson(candidateRefreshExecutionPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution/v1',
    status: 'candidate_refresh_execution_failed',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    executionControl: {
      executionAllowed: true,
      mode: 'execute',
      environment: 'staging',
    },
    target: {
      envFileRef: 'server/.env',
      envFileReadable: true,
      envFileSha256: 'hash-for-test',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      databaseHost: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
      databasePort: '5432',
      databaseName: 'postgres',
      databaseUser: 'postgres',
      supabaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
      hasPassword: true,
      password: 'must-not-leak',
    },
    refreshPlan: {
      targetReplacementRowCount: 18,
      targetRowsSafe: true,
    },
    deletedRowCount: 0,
    insertedRowCount: 0,
    blockers: [
      'candidate_refresh_target_baseline_not_found',
      'candidate_refresh_db_execution_failed',
    ],
    mutationBoundary: {
      writesTaskBaselineItems: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
    nextActions: [
      'Fix or rotate the database credentials in server/.env for SUPABASE_MIGRATION_URL.',
      'Do not switch env files unless discovery proves the same baseline/project exists in the replacement database.',
    ],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      candidateHygiene: candidateHygienePath,
      candidateRefreshPackage: candidateRefreshPackagePath,
      output: outputPath,
      now: new Date('2026-07-02T04:16:00.000Z'),
    })

    assert.equal(handoff.status, 'blocked')
    assert.equal(handoff.productionReady, false)
    assert.equal(
      handoff.currentBlockers.includes('selected_candidate_export_profile_shape_mismatch'),
      true,
    )
    assert.equal(
      handoff.currentBlockers.includes('candidate_baseline_refresh_required_before_runtime_publication'),
      true,
    )
    assert.equal(
      handoff.currentBlockers.includes('candidate_refresh_target_baseline_not_found'),
      true,
    )
    assert.equal(handoff.candidateHygiene.status, 'blocked')
    assert.deepEqual(handoff.candidateHygiene.blockers, ['selected_candidate_export_profile_shape_mismatch'])
    assert.equal(handoff.candidateHygiene.profileComparison.status, 'mismatch')
    assert.equal(handoff.candidateHygiene.artifact.endsWith('candidate-export-hygiene.json'), true)
    assert.equal(handoff.candidateRefreshPackage.status, 'refresh_required')
    assert.equal(handoff.candidateRefreshPackage.refreshRequired, true)
    assert.equal(handoff.candidateRefreshPackage.missingTargetRowCount, 1)
    assert.equal(handoff.candidateRefreshPackage.codeChangedRowCount, 1)
    assert.equal(handoff.candidateRefreshPackage.operationMode, 'full_replace_candidate_baseline_items_from_profile_report')
    assert.equal(handoff.candidateRefreshPackage.executeAllowed, false)
    assert.equal(handoff.candidateRefreshExecution.status, 'candidate_refresh_execution_failed')
    assert.deepEqual(handoff.candidateRefreshExecution.blockers, [
      'candidate_refresh_target_baseline_not_found',
      'candidate_refresh_db_execution_failed',
    ])
    assert.deepEqual(handoff.candidateRefreshExecution.target, {
      envFileRef: 'server/.env',
      envFileReadable: true,
      envFileSha256: 'hash-for-test',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      databaseHost: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
      databasePort: '5432',
      databaseName: 'postgres',
      databaseUser: 'postgres',
      supabaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
      hasPassword: true,
    })
    assert.deepEqual(handoff.candidateRefreshExecution.nextActions, [
      'Fix or rotate the database credentials in server/.env for SUPABASE_MIGRATION_URL.',
      'Do not switch env files unless discovery proves the same baseline/project exists in the replacement database.',
    ])
    assert.equal(JSON.stringify(handoff).includes('must-not-leak'), false)
    assert.equal(handoff.candidateRefreshExecution.deletedRowCount, 0)
    assert.equal(handoff.candidateRefreshExecution.insertedRowCount, 0)
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /executionTargetEnvFile: server\/\.env/)
    assert.match(markdown, /executionTargetSupabaseProjectRef: wwdrkjnbvcbfytwnnyvs/)
    assert.match(markdown, /executionTargetDatabaseHost: db\.wwdrkjnbvcbfytwnnyvs\.supabase\.co/)
    assert.match(markdown, /executionTargetConnectionSource: SUPABASE_MIGRATION_URL/)
    assert.match(markdown, /executionNextActions: Fix or rotate the database credentials/)
    assert.equal(markdown.includes('must-not-leak'), false)
    const refreshAction = handoff.actionSequence.find((action) => action.id === 'candidate_refresh_package')
    assert.match(refreshAction?.command ?? '', /evidence:default-master-plan:candidate-refresh-package/)
    assert.match(refreshAction?.command ?? '', /--hygiene .*candidate-export-hygiene\.json/)
    assert.match(refreshAction?.noWriteBoundary ?? '', /does not write candidate baselines/)
    const refreshPreflightAction = handoff.actionSequence.find((action) => action.id === 'candidate_refresh_execution_preflight')
    assert.match(refreshPreflightAction?.command ?? '', /evidence:default-master-plan:candidate-refresh-preflight/)
    assert.match(refreshPreflightAction?.command ?? '', /--refresh-package .*candidate-refresh-package\.json/)
    assert.equal(/<[^>\r\n]+>/.test(refreshPreflightAction?.command ?? ''), false)
    assert.match(refreshPreflightAction?.noWriteBoundary ?? '', /does not write candidate baselines/)
    const authorizationPackageAction = handoff.actionSequence.find((action) => action.id === 'candidate_refresh_authorization_package')
    assert.match(authorizationPackageAction?.command ?? '', /build-default-master-plan-candidate-refresh-authorization-package\.mjs/)
    assert.match(authorizationPackageAction?.command ?? '', /--handoff .*operator-handoff\.json/)
    assert.match(authorizationPackageAction?.command ?? '', /--preflight .*candidate-refresh-execution-preflight\.json/)
    assert.match(authorizationPackageAction?.command ?? '', /--execution .*candidate-refresh-execution\.json/)
    assert.match(authorizationPackageAction?.command ?? '', /--output .*candidate-refresh-authorization-package\.json/)
    assert.match(authorizationPackageAction?.command ?? '', /--template-output .*candidate-refresh-authorization\.operator-fill-template\.json/)
    assert.equal(/--mode execute/.test(authorizationPackageAction?.command ?? ''), false)
    assert.equal(/--allow-refresh/.test(authorizationPackageAction?.command ?? ''), false)
    assert.match(authorizationPackageAction?.noWriteBoundary ?? '', /does not execute candidate refresh/)
    const readinessSealAction = handoff.actionSequence.find((action) => action.id === 'candidate_refresh_execution_readiness_seal')
    assert.match(readinessSealAction?.command ?? '', /check-default-master-plan-candidate-refresh-execution-readiness\.mjs/)
    assert.match(readinessSealAction?.command ?? '', /--authorization-package .*candidate-refresh-authorization-package\.json/)
    assert.match(readinessSealAction?.command ?? '', /--preflight .*candidate-refresh-execution-preflight\.json/)
    assert.match(readinessSealAction?.command ?? '', /--output .*candidate-refresh-execution-readiness-seal\.json/)
    assert.equal(/--mode execute/.test(readinessSealAction?.command ?? ''), false)
    assert.equal(/--allow-refresh/.test(readinessSealAction?.command ?? ''), false)
    assert.match(readinessSealAction?.noWriteBoundary ?? '', /does not run candidate refresh/)
    const materializationAction = handoff.actionSequence.find((action) => action.id === 'candidate_baseline_materialization')
    assert.match(materializationAction?.command ?? '', /evidence:default-master-plan:candidate-baseline-materialization/)
    assert.match(materializationAction?.command ?? '', /--refresh-package .*candidate-refresh-package\.json/)
    assert.match(materializationAction?.command ?? '', /--output .*candidate-baseline-materialization\.json/)
    assert.equal(/--allow-materialization/.test(materializationAction?.command ?? ''), false)
    assert.equal(/--mode execute/.test(materializationAction?.command ?? ''), false)
    assert.match(materializationAction?.noWriteBoundary ?? '', /Default command is blocked\/dry-run/)
    const materializationReadinessSealAction = handoff.actionSequence.find((action) => action.id === 'candidate_baseline_materialization_readiness_seal')
    assert.match(materializationReadinessSealAction?.command ?? '', /check-default-master-plan-candidate-baseline-materialization-readiness\.mjs/)
    assert.match(materializationReadinessSealAction?.command ?? '', /--refresh-package .*candidate-refresh-package\.json/)
    assert.match(materializationReadinessSealAction?.command ?? '', /--materialization .*candidate-baseline-materialization\.json/)
    assert.match(materializationReadinessSealAction?.command ?? '', /--output .*candidate-baseline-materialization-readiness-seal\.json/)
    assert.equal(/--mode execute/.test(materializationReadinessSealAction?.command ?? ''), false)
    assert.equal(/--allow-materialization/.test(materializationReadinessSealAction?.command ?? ''), false)
    assert.match(materializationReadinessSealAction?.noWriteBoundary ?? '', /does not run candidate baseline materialization/)
    const refreshExecutionAction = handoff.actionSequence.find((action) => action.id === 'candidate_refresh_execution')
    assert.match(refreshExecutionAction?.command ?? '', /evidence:default-master-plan:candidate-refresh-execution/)
    assert.match(refreshExecutionAction?.command ?? '', /--preflight .*candidate-refresh-execution-preflight\.json/)
    assert.match(refreshExecutionAction?.command ?? '', /--authorization-package .*candidate-refresh-authorization-package\.json/)
    assert.match(refreshExecutionAction?.command ?? '', /--output .*candidate-refresh-execution\.json/)
    assert.equal(/<[^>\r\n]+>/.test(refreshExecutionAction?.command ?? ''), false)
    assert.equal(/--allow-refresh/.test(refreshExecutionAction?.command ?? ''), false)
    assert.equal(/--mode execute/.test(refreshExecutionAction?.command ?? ''), false)
    assert.match(refreshExecutionAction?.noWriteBoundary ?? '', /Default command is blocked\/dry-run/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds candidate refresh package command without candidate export placeholder when export is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-no-candidate-export-'))
  const readinessPath = path.join(root, 'readiness.json')
  const candidateHygienePath = path.join(root, 'candidate-export-hygiene.json')
  const candidateRefreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(readinessPath, readinessFixture())
  await writeJson(candidateHygienePath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-export-hygiene/v1',
    status: 'blocked',
    productionReady: false,
    blockers: ['handoff_candidate_artifact_required'],
  })
  await writeJson(candidateRefreshPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'blocked',
    productionReady: false,
    refreshRequired: false,
    blockers: ['candidate_export_required'],
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      readiness: readinessPath,
      candidateHygiene: candidateHygienePath,
      candidateRefreshPackage: candidateRefreshPackagePath,
      output: outputPath,
      now: new Date('2026-07-07T06:10:00.000Z'),
    })

    const refreshAction = handoff.actionSequence.find((action) => action.id === 'candidate_refresh_package')
    assert.match(refreshAction?.command ?? '', /evidence:default-master-plan:candidate-refresh-package/)
    assert.match(refreshAction?.command ?? '', /--profile-report /)
    assert.match(refreshAction?.command ?? '', /--hygiene .*candidate-export-hygiene\.json/)
    assert.match(refreshAction?.command ?? '', /--output .*candidate-refresh-package\.json/)
    assert.equal(refreshAction?.command.includes('--candidate-export'), false)
    assert.equal(/<candidate-baseline\.json>/.test(refreshAction?.command ?? ''), false)
    assert.equal(/<[^>\r\n]+>/.test(refreshAction?.command ?? ''), false)
    assert.equal(handoff.currentBlockers.includes('candidate_export_required'), true)
    assert.equal(handoff.mutationBoundary.writesProductionTables, false)
    assert.equal(handoff.mutationBoundary.invokesRuntimeWriters, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('keeps offline development review findings informational while candidate refresh execution is blocked', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-defer-pm-review-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const candidateRefreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const candidateRefreshPreflightPath = path.join(root, 'candidate-refresh-execution-preflight.json')
  const candidateRefreshExecutionPath = path.join(root, 'candidate-refresh-execution.json')
  const reviewPackagePath = path.join(root, 'pm-review-package.json')
  const reviewRecordPreflightPath = path.join(root, 'pm-review-record-preflight.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    status: 'production_readiness_ready',
    productionReady: true,
    gates: [],
    productionReadinessBlockers: [],
  })
  await writeJson(candidateRefreshPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'refresh_required',
    productionReady: false,
    refreshRequired: true,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    blockers: ['candidate_baseline_refresh_required_before_runtime_publication'],
  })
  await writeJson(candidateRefreshPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution-preflight/v1',
    status: 'ready_for_execute',
    productionReady: false,
    mayExecuteCandidateRefresh: true,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    blockers: [],
  })
  await writeJson(candidateRefreshExecutionPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution/v1',
    status: 'candidate_refresh_execution_failed',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    deletedRowCount: 0,
    insertedRowCount: 0,
    blockers: [
      'candidate_refresh_db_connection_failed',
      'candidate_refresh_db_execution_failed',
    ],
    dbRepairPlan: {
      status: 'blocked',
      failureClass: 'connection_timeout',
      noAutoCredentialRotation: true,
      requiredStepIds: [
        'confirm_candidate_refresh_target_identity',
        'repair_or_rotate_candidate_refresh_db_credentials',
      ],
      blockedStepIds: ['rerun_candidate_refresh_execution'],
      orderedSteps: [
        {
          id: 'confirm_candidate_refresh_target_identity',
          status: 'required',
          blockerCodes: ['candidate_refresh_db_connection_failed'],
          commands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-preflight'],
          verificationCommands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution'],
        },
        {
          id: 'rerun_candidate_refresh_execution',
          status: 'blocked_by_previous_steps',
          blockerCodes: ['candidate_refresh_db_connection_failed', 'candidate_refresh_db_execution_failed'],
          commands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution'],
          verificationCommands: ['npm.cmd run evidence:default-master-plan:real-evidence-gaps'],
        },
      ],
    },
  })
  await writeJson(reviewPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-review-package/v1',
    status: 'blocked',
    productionReady: false,
    blockers: ['review_notes_reviewed_item_count_mismatch'],
  })
  await writeJson(reviewRecordPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-review-record-preflight/v1',
    status: 'blocked',
    productionReady: false,
    mayExecuteReviewRecord: false,
    blockers: [
      'review_package_not_ready',
      'record_review_command_required',
    ],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      candidateRefreshPackage: candidateRefreshPackagePath,
      candidateRefreshExecution: candidateRefreshExecutionPath,
      candidateRefreshExecutionPreflight: candidateRefreshPreflightPath,
      reviewPackage: reviewPackagePath,
      reviewRecordPreflight: reviewRecordPreflightPath,
      output: outputPath,
      now: new Date('2026-07-07T14:20:00.000Z'),
    })

    assert.equal(handoff.status, 'blocked')
    assert.equal(handoff.currentBlockers.includes('candidate_refresh_db_connection_failed'), true)
    assert.equal(handoff.currentBlockers.includes('candidate_refresh_db_execution_failed'), true)
    assert.equal(handoff.candidateRefreshExecution.dbRepairPlan.status, 'blocked')
    assert.equal(handoff.candidateRefreshExecution.dbRepairPlan.failureClass, 'connection_timeout')
    assert.deepEqual(handoff.candidateRefreshExecution.dbRepairPlan.requiredStepIds, [
      'confirm_candidate_refresh_target_identity',
      'repair_or_rotate_candidate_refresh_db_credentials',
    ])
    assert.deepEqual(handoff.candidateRefreshExecution.dbRepairPlan.blockedStepIds, ['rerun_candidate_refresh_execution'])
    assert.deepEqual(handoff.candidateRefreshExecution.dbRepairPlan.orderedSteps[0].commands, [
      'npm.cmd run evidence:default-master-plan:candidate-refresh-db-repair-readiness',
      'npm.cmd run evidence:default-master-plan:candidate-refresh-preflight',
    ])
    assert.equal(handoff.currentBlockers.includes('candidate_baseline_refresh_required_before_runtime_publication'), true)
    assert.equal(handoff.currentBlockers.includes('pm_review_required_after_candidate_refresh'), false)
    assert.equal(handoff.currentBlockers.includes('pm_review_record_preflight_review_package_not_ready'), false)
    assert.equal(handoff.currentBlockers.includes('pm_review_record_preflight_record_review_command_required'), false)
    assert.equal(handoff.currentBlockers.includes('review_notes_reviewed_item_count_mismatch'), false)
    assert.equal(
      handoff.offlineDevelopmentQualityReview.qualityFindings.includes('pm_review_record_preflight_review_package_not_ready'),
      true,
    )
    assert.equal(
      handoff.offlineDevelopmentQualityReview.qualityFindings.includes('review_notes_reviewed_item_count_mismatch'),
      true,
    )
    assert.equal(handoff.offlineDevelopmentQualityReview.requiredForRuntime, false)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Deferred Current Blockers/)
    assert.match(markdown, /dbRepairPlanStatus: blocked/)
    assert.match(markdown, /dbRepairPlanRequiredStepIds: confirm_candidate_refresh_target_identity, repair_or_rotate_candidate_refresh_db_credentials/)
    assert.match(markdown, /candidate-refresh-db-repair-readiness/)
    assert.match(markdown, /Offline Development Quality Review/)
    assert.match(markdown, /qualityFindings: .*pm_review_record_preflight_review_package_not_ready/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('defers candidate-refresh-dependent duration and task blockers while preserving runtime seed blockers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-deferred-candidate-dependent-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const candidateRefreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const candidateRefreshPreflightPath = path.join(root, 'candidate-refresh-execution-preflight.json')
  const candidateRefreshExecutionPath = path.join(root, 'candidate-refresh-execution.json')
  const durationAssetUtilizationPath = path.join(root, 'duration-asset-utilization-report.json')
  const runtimeSeedEvidencePipelinePath = path.join(root, 'runtime-seed-evidence-pipeline.json')
  const completedTaskExportReportPath = path.join(root, 'completed-task-export.report.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(candidateRefreshPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'refresh_required',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    refreshRequired: true,
    blockers: ['candidate_baseline_refresh_required_before_runtime_publication'],
  })
  await writeJson(candidateRefreshPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution-preflight/v1',
    status: 'ready_for_candidate_refresh_execution',
    productionReady: false,
    mayExecuteCandidateRefresh: true,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    blockers: [],
  })
  await writeJson(candidateRefreshExecutionPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution/v1',
    status: 'candidate_refresh_execution_failed',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    blockers: [
      'candidate_refresh_db_connection_failed',
      'candidate_refresh_db_execution_failed',
    ],
  })
  await writeJson(durationAssetUtilizationPath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-asset-utilization-report/v1',
    status: 'candidate_refresh_required_before_asset_utilization_review',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    summary: {
      rowCount: 2,
      rowsWithStandardWorkSeedCount: 2,
      rowsWithActiveStandardWorkSeedCount: 0,
      rowsWithFallbackStandardWorkSeedCount: 2,
      rowsWithT2RhythmTemplateCount: 2,
      rowsWithActiveT2RhythmTemplateCount: 0,
      rowsWithFallbackT2RhythmTemplateCount: 2,
      rowsWithRuntimeReferenceDaysCount: 0,
      rowsMissingRuntimeReferenceDaysCount: 2,
    },
    blockers: [
      'candidate_baseline_refresh_required_before_asset_utilization_review',
      'runtime_reference_days_missing_for_some_rows',
    ],
    mutationBoundary: {
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  })
  await writeJson(runtimeSeedEvidencePipelinePath, runtimeSeedEvidencePipelineFixture({
    status: 'runtime_seed_import_blocked',
    blockers: ['local_supabase_endpoint_unreachable'],
    summary: {
      preflight: {
        readyBusinessTypeCount: 0,
        missingBusinessTypeCount: 1,
        requiredRuntimeSeedStableCodeCount: 2,
      },
      coverage: {
        requiredStableCodeCount: 2,
        coveredStableCodeCount: 2,
        missingStableCodeCount: 0,
        missingStableCodes: [],
      },
      importGate: {
        status: 'runtime_seed_import_blocked',
        importRequired: true,
        runtimeSeedEvidenceAlreadyReady: false,
        importMode: 'local_active_seed_smoke_import',
        blockers: ['local_supabase_endpoint_unreachable'],
      },
    },
  }))
  await writeJson(completedTaskExportReportPath, {
    schemaVersion: 'workbuddy-default-master-plan-completed-task-export/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    summary: {
      requiredStableCodeCount: 2,
      rawTaskCount: 1,
      exportedTaskCount: 0,
      invalidTaskCount: 1,
      missingStableCodeCount: 1,
      missingStableCodes: ['BTMP-SCH-01'],
    },
    blockers: [
      'invalid_completed_task_rows_present',
      'completed_task_export_coverage_incomplete',
    ],
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      candidateRefreshPackage: candidateRefreshPackagePath,
      candidateRefreshExecutionPreflight: candidateRefreshPreflightPath,
      candidateRefreshExecution: candidateRefreshExecutionPath,
      durationAssetUtilization: durationAssetUtilizationPath,
      runtimeSeedEvidencePipeline: runtimeSeedEvidencePipelinePath,
      completedTaskExportReport: completedTaskExportReportPath,
      output: outputPath,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      publicationKey: 'default-master-plan-runtime-publication-1',
      now: new Date('2026-07-07T15:10:00.000Z'),
    })

    assert.equal(handoff.currentBlockers.includes('candidate_refresh_db_connection_failed'), true)
    assert.equal(handoff.currentBlockers.includes('runtime_seed_pipeline_local_supabase_endpoint_unreachable'), true)
    assert.equal(handoff.currentBlockers.includes('duration_asset_utilization_runtime_reference_days_missing_for_some_rows'), false)
    assert.equal(handoff.currentBlockers.includes('completed_task_export_invalid_completed_task_rows_present'), false)
    assert.equal(handoff.currentBlockers.includes('duration_sample_collection_package'), false)
    assert.equal(handoff.currentBlockers.includes('runtime_duration_calibration_evidence'), false)
    assert.deepEqual(handoff.deferredCurrentBlockers.candidateRefreshDependent.deferredBy, [
      'candidate_refresh_db_connection_failed',
      'candidate_refresh_db_execution_failed',
    ])
    assert.equal(
      handoff.deferredCurrentBlockers.candidateRefreshDependent.blockers.includes('duration_asset_utilization_runtime_reference_days_missing_for_some_rows'),
      true,
    )
    assert.equal(
      handoff.deferredCurrentBlockers.candidateRefreshDependent.blockers.includes('completed_task_export_invalid_completed_task_rows_present'),
      true,
    )
    assert.equal(
      handoff.deferredCurrentBlockers.candidateRefreshDependent.blockers.includes('runtime_duration_calibration_evidence'),
      true,
    )
    assert.equal(
      handoff.deferredCurrentBlockers.candidateRefreshDependent.blockers.includes('runtime_seed_pipeline_local_supabase_endpoint_unreachable'),
      false,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not carry stale candidate refresh execution blockers when preflight hash changed', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const candidateRefreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const candidateRefreshPreflightPath = path.join(root, 'candidate-refresh-execution-preflight.json')
  const candidateRefreshExecutionPath = path.join(root, 'candidate-refresh-execution.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    status: 'production_readiness_ready',
    productionReady: true,
    gates: [],
    productionReadinessBlockers: [],
  })
  await writeJson(candidateRefreshPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'refresh_required',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    blockers: ['candidate_baseline_refresh_required_before_runtime_publication'],
  })
  await writeJson(candidateRefreshPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution-preflight/v1',
    status: 'blocked',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    blockers: ['candidate_refresh_unlock_required'],
  })
  await writeJson(candidateRefreshExecutionPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution/v1',
    status: 'candidate_refresh_execution_failed',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    evidence: {
      refreshPackageRef: `candidate_refresh_package:${repoRelativeForTest(candidateRefreshPackagePath)}#sha256=stale-refresh-package-hash`,
      preflightRef: `candidate_refresh_execution_preflight:${repoRelativeForTest(candidateRefreshPreflightPath)}#sha256=stale-preflight-hash`,
    },
    executionControl: {
      executionAllowed: true,
      mode: 'execute',
      environment: 'staging',
    },
    blockers: [
      'candidate_refresh_target_baseline_not_found',
      'candidate_refresh_db_execution_failed',
    ],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      candidateRefreshPackage: candidateRefreshPackagePath,
      candidateRefreshExecution: candidateRefreshExecutionPath,
      candidateRefreshExecutionPreflight: candidateRefreshPreflightPath,
      output: outputPath,
      now: new Date('2026-07-05T03:00:00.000Z'),
    })

    assert.equal(
      handoff.currentBlockers.includes('candidate_refresh_execution_preflight_ref_mismatch'),
      true,
    )
    assert.equal(
      handoff.currentBlockers.includes('candidate_refresh_execution_refresh_package_ref_mismatch'),
      true,
    )
    assert.equal(
      handoff.currentBlockers.includes('candidate_refresh_target_baseline_not_found'),
      false,
    )
    assert.equal(
      handoff.currentBlockers.includes('candidate_refresh_db_execution_failed'),
      false,
    )
    assert.deepEqual(handoff.candidateRefreshExecution.blockers, [
      'candidate_refresh_execution_refresh_package_ref_mismatch',
      'candidate_refresh_execution_preflight_ref_mismatch',
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('keeps dry-run candidate refresh execution blockers instead of stale evidence refs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const candidateRefreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const candidateRefreshPreflightPath = path.join(root, 'candidate-refresh-execution-preflight.json')
  const candidateRefreshExecutionPath = path.join(root, 'candidate-refresh-execution.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    status: 'production_readiness_ready',
    productionReady: true,
    gates: [],
    productionReadinessBlockers: [],
  })
  await writeJson(candidateRefreshPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'refresh_required',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    blockers: ['candidate_baseline_refresh_required_before_runtime_publication'],
  })
  await writeJson(candidateRefreshPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution-preflight/v1',
    status: 'ready_for_execute',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    blockers: [],
  })
  await writeJson(candidateRefreshExecutionPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution/v1',
    status: 'candidate_refresh_execution_blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    evidence: {
      refreshPackageRef: `candidate_refresh_package:${repoRelativeForTest(candidateRefreshPackagePath)}#sha256=stale-refresh-package-hash`,
      preflightRef: `candidate_refresh_execution_preflight:${repoRelativeForTest(candidateRefreshPreflightPath)}#sha256=stale-preflight-hash`,
    },
    executionControl: {
      executionAllowed: false,
      mode: 'dry-run',
      environment: 'staging',
      allowRefresh: false,
      unlockPresent: false,
    },
    blockers: [
      'candidate_refresh_execution_unlock_required',
      'candidate_refresh_execution_allow_refresh_required',
      'candidate_refresh_execute_mode_required',
      'candidate_refresh_operator_approval_required',
      'candidate_refresh_refreshed_by_required',
    ],
    transaction: {
      attempted: false,
      committed: false,
      rolledBack: false,
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      candidateRefreshPackage: candidateRefreshPackagePath,
      candidateRefreshExecution: candidateRefreshExecutionPath,
      candidateRefreshExecutionPreflight: candidateRefreshPreflightPath,
      output: outputPath,
      now: new Date('2026-07-05T03:15:00.000Z'),
    })

    assert.equal(
      handoff.currentBlockers.includes('candidate_refresh_execution_refresh_package_ref_mismatch'),
      false,
    )
    assert.equal(
      handoff.currentBlockers.includes('candidate_refresh_execution_preflight_ref_mismatch'),
      false,
    )
    assert.equal(
      handoff.currentBlockers.includes('candidate_refresh_execution_unlock_required'),
      true,
    )
    assert.equal(
      handoff.currentBlockers.includes('candidate_refresh_execute_mode_required'),
      true,
    )
    assert.deepEqual(handoff.candidateRefreshExecution.blockers, [
      'candidate_refresh_execution_unlock_required',
      'candidate_refresh_execution_allow_refresh_required',
      'candidate_refresh_execute_mode_required',
      'candidate_refresh_operator_approval_required',
      'candidate_refresh_refreshed_by_required',
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not require stale candidate refresh execution refs when package is already current', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const candidateRefreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const candidateRefreshPreflightPath = path.join(root, 'candidate-refresh-execution-preflight.json')
  const candidateRefreshExecutionPath = path.join(root, 'candidate-refresh-execution.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    status: 'production_readiness_ready',
    productionReady: true,
    gates: [],
    productionReadinessBlockers: [],
  })
  await writeJson(candidateRefreshPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'no_refresh_required',
    productionReady: false,
    refreshRequired: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    blockers: [],
  })
  await writeJson(candidateRefreshPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution-preflight/v1',
    status: 'already_current',
    productionReady: false,
    mayExecuteCandidateRefresh: false,
    alreadyCurrent: true,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    blockers: [],
  })
  await writeJson(candidateRefreshExecutionPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution/v1',
    status: 'candidate_refresh_execution_failed',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    evidence: {
      refreshPackageRef: `candidate_refresh_package:${repoRelativeForTest(candidateRefreshPackagePath)}#sha256=stale-refresh-package-hash`,
      preflightRef: `candidate_refresh_execution_preflight:${repoRelativeForTest(candidateRefreshPreflightPath)}#sha256=stale-preflight-hash`,
    },
    executionControl: {
      executionAllowed: true,
      mode: 'execute',
      environment: 'staging',
    },
    blockers: [
      'candidate_refresh_target_baseline_not_found',
      'candidate_refresh_db_execution_failed',
    ],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      candidateRefreshPackage: candidateRefreshPackagePath,
      candidateRefreshExecution: candidateRefreshExecutionPath,
      candidateRefreshExecutionPreflight: candidateRefreshPreflightPath,
      output: outputPath,
      now: new Date('2026-07-05T03:30:00.000Z'),
    })

    assert.equal(
      handoff.currentBlockers.includes('candidate_refresh_execution_refresh_package_ref_mismatch'),
      false,
    )
    assert.equal(
      handoff.currentBlockers.includes('candidate_refresh_execution_preflight_ref_mismatch'),
      false,
    )
    assert.equal(
      handoff.currentBlockers.includes('candidate_refresh_target_baseline_not_found'),
      false,
    )
    assert.equal(
      handoff.currentBlockers.includes('candidate_refresh_db_execution_failed'),
      false,
    )
    assert.equal(handoff.candidateRefreshExecutionPreflight.status, 'already_current')
    assert.equal(handoff.candidateRefreshExecutionPreflight.alreadyCurrent, true)
    assert.deepEqual(handoff.candidateRefreshExecution.blockers, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('summarizes candidate baseline materialization gate in operator handoff markdown', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-materialization-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const materializationPath = path.join(root, 'candidate-baseline-materialization.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(materializationPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-materialization/v1',
    status: 'candidate_baseline_materialization_dry_run',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    executionControl: {
      executionAllowed: false,
      mode: 'dry-run',
      environment: 'staging',
      allowMaterialization: false,
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION',
      unlockPresent: false,
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      materializedBy: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
    },
    materializationPlan: {
      targetReplacementRowCount: 18,
      wouldInsertCandidateBaseline: true,
      wouldInsertCandidateBaselineItems: true,
      diff: {
        currentRowCount: 16,
        targetRowCount: 18,
        missingTargetRowCount: 2,
      },
    },
    insertedBaselineCount: 0,
    insertedItemCount: 0,
    blockers: [
      'candidate_baseline_materialization_execute_mode_required',
      'candidate_baseline_materialization_allow_flag_required',
      'candidate_baseline_materialization_unlock_required',
    ],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      candidateBaselineMaterialization: materializationPath,
      output: outputPath,
      now: new Date('2026-07-05T06:30:00.000Z'),
    })

    assert.equal(handoff.candidateBaselineMaterialization.status, 'candidate_baseline_materialization_dry_run')
    assert.equal(handoff.candidateBaselineMaterialization.executionAllowed, false)
    assert.equal(handoff.candidateBaselineMaterialization.allowMaterialization, false)
    assert.equal(handoff.candidateBaselineMaterialization.unlockPresent, false)
    assert.equal(
      handoff.candidateBaselineMaterialization.requiredUnlock,
      'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION',
    )
    assert.equal(handoff.candidateBaselineMaterialization.targetReplacementRowCount, 18)
    assert.equal(handoff.candidateBaselineMaterialization.missingTargetRowCount, 2)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Candidate Baseline Materialization Gate/)
    assert.match(markdown, /executionAllowed: false/)
    assert.match(markdown, /allowMaterialization: false/)
    assert.match(markdown, /targetReplacementRowCount: 18/)
    assert.match(markdown, /candidate_baseline_materialization_unlock_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
test('does not require stale candidate baseline materialization when candidate refresh package is already current', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-materialization-current-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const candidateRefreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const materializationPath = path.join(root, 'candidate-baseline-materialization.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    status: 'production_readiness_ready',
    productionReady: true,
    gates: [],
    productionReadinessBlockers: [],
  })
  await writeJson(candidateRefreshPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'no_refresh_required',
    productionReady: false,
    refreshRequired: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    blockers: [],
  })
  await writeJson(materializationPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-materialization/v1',
    status: 'candidate_baseline_materialization_dry_run',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    executionControl: {
      executionAllowed: false,
      mode: 'dry-run',
      environment: 'staging',
      allowMaterialization: false,
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION',
      unlockPresent: false,
    },
    materializationPlan: {
      targetReplacementRowCount: 18,
      wouldInsertCandidateBaseline: true,
      wouldInsertCandidateBaselineItems: true,
      diff: {
        currentRowCount: 16,
        targetRowCount: 18,
        missingTargetRowCount: 2,
      },
    },
    blockers: [
      'candidate_baseline_materialization_execute_mode_required',
      'candidate_baseline_materialization_allow_flag_required',
      'candidate_baseline_materialization_unlock_required',
    ],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      candidateRefreshPackage: candidateRefreshPackagePath,
      candidateBaselineMaterialization: materializationPath,
      output: outputPath,
      now: new Date('2026-07-05T04:00:00.000Z'),
    })

    assert.equal(
      handoff.currentBlockers.includes('candidate_baseline_materialization_execute_mode_required'),
      false,
    )
    assert.equal(
      handoff.currentBlockers.includes('candidate_baseline_materialization_allow_flag_required'),
      false,
    )
    assert.equal(
      handoff.currentBlockers.includes('candidate_baseline_materialization_unlock_required'),
      false,
    )
    assert.deepEqual(handoff.candidateBaselineMaterialization.blockers, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('uses sealed candidate baseline materialization arguments in the handoff action command', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-materialization-command-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const candidateRefreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const materializationPath = path.join(root, 'candidate-baseline-materialization.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(candidateRefreshPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'refresh_required',
    productionReady: false,
    refreshRequired: true,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    blockers: ['candidate_baseline_refresh_required_before_runtime_publication'],
  })
  await writeJson(materializationPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-materialization/v1',
    status: 'candidate_baseline_materialization_blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    executionControl: {
      executionAllowed: false,
      mode: 'execute',
      environment: 'staging',
      allowMaterialization: true,
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION',
      unlockPresent: false,
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-08',
      materializedBy: '11111111-1111-4111-8111-111111111111',
    },
    materializationPlan: {
      targetReplacementRowCount: 18,
      wouldInsertCandidateBaseline: true,
      wouldInsertCandidateBaselineItems: true,
      diff: {
        missingTargetRowCount: 2,
      },
    },
    blockers: ['candidate_baseline_materialization_unlock_required'],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      candidateRefreshPackage: candidateRefreshPackagePath,
      candidateBaselineMaterialization: materializationPath,
      output: outputPath,
      now: new Date('2026-07-05T04:30:00.000Z'),
    })

    const materializationAction = handoff.actionSequence.find((action) => action.id === 'candidate_baseline_materialization')
    assert.match(materializationAction?.command ?? '', /--mode execute/)
    assert.match(materializationAction?.command ?? '', /--allow-materialization/)
    assert.match(materializationAction?.command ?? '', /--operator-approval-ref pm-approval:baseline-school:2026-07-08/)
    assert.match(materializationAction?.command ?? '', /--materialized-by 11111111-1111-4111-8111-111111111111/)
    assert.equal(handoff.currentBlockers.includes('candidate_baseline_materialization_unlock_required'), true)
    assert.equal(handoff.currentBlockers.includes('candidate_baseline_materialization_execute_mode_required'), false)
    assert.equal(handoff.currentBlockers.includes('candidate_baseline_materialization_allow_flag_required'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('summarizes candidate refresh execution preflight blockers in operator handoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const candidateRefreshPreflightPath = path.join(root, 'candidate-refresh-execution-preflight.json')
  const candidateRefreshExecutionPath = path.join(root, 'candidate-refresh-execution.json')
  const candidateRefreshAuthorizationPackagePath = path.join(root, 'candidate-refresh-authorization-package.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    status: 'production_readiness_ready',
    productionReady: true,
    gates: [],
    productionReadinessBlockers: [],
  })
  await writeJson(candidateRefreshPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution-preflight/v1',
    status: 'blocked',
    productionReady: false,
    mayExecuteCandidateRefresh: false,
    alreadyCurrent: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    blockers: [
      'candidate_refresh_unlock_required',
      'candidate_refresh_operator_approval_required',
      'candidate_refresh_refreshed_by_required',
      'candidate_refresh_execute_mode_required',
    ],
  })
  await writeJson(candidateRefreshExecutionPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution/v1',
    status: 'candidate_refresh_execution_blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    executionControl: {
      executionAllowed: false,
      mode: '',
      environment: 'staging',
      allowRefresh: false,
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
      unlockPresent: false,
      operatorApprovalRef: '',
      refreshedBy: '',
    },
    blockers: [
      'candidate_refresh_execution_unlock_required',
      'candidate_refresh_execution_allow_refresh_required',
      'candidate_refresh_execute_mode_required',
      'candidate_refresh_operator_approval_required',
      'candidate_refresh_refreshed_by_required',
    ],
    executionGatePlan: {
      status: 'blocked',
      noAutoExecution: true,
      requiredStepIds: [
        'set_candidate_refresh_execution_unlock',
        'run_candidate_refresh_in_execute_mode_with_allow_flag',
        'record_candidate_refresh_operator_approval_and_actor',
      ],
      blockedStepIds: [
        'rerun_candidate_refresh_execution_after_gate',
      ],
      orderedSteps: [
        {
          id: 'set_candidate_refresh_execution_unlock',
          status: 'required',
          blockerCodes: ['candidate_refresh_execution_unlock_required'],
        },
        {
          id: 'rerun_candidate_refresh_execution_after_gate',
          status: 'blocked_by_previous_steps',
          blockerCodes: ['candidate_refresh_execution_unlock_required'],
        },
      ],
    },
  })
  await writeJson(candidateRefreshAuthorizationPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-authorization-package/v1',
    status: 'authorization_package_ready',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    preflightReady: true,
    executionStatus: 'candidate_refresh_execution_blocked',
    executionCompleted: false,
    operatorTemplateRef: 'candidate_refresh_authorization_template:tmp/candidate-refresh-authorization.operator-fill-template.json',
    packageReadinessBlockers: [],
    executionBlockers: [
      'candidate_refresh_execution_unlock_required',
    ],
    nextCommands: {
      executeCandidateRefresh: 'node project-testing/tools/run-default-master-plan-candidate-refresh-execution.mjs --mode execute --allow-refresh',
    },
    mutationBoundary: {
      packageOnly: true,
      doesNotMutateDatabase: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      candidateRefreshExecution: candidateRefreshExecutionPath,
      candidateRefreshExecutionPreflight: candidateRefreshPreflightPath,
      output: outputPath,
      now: new Date('2026-07-05T02:35:00.000Z'),
    })

    assert.equal(handoff.status, 'blocked')
    assert.equal(handoff.candidateRefreshExecutionPreflight.status, 'blocked')
    assert.equal(handoff.candidateRefreshExecutionPreflight.mayExecuteCandidateRefresh, false)
    assert.equal(handoff.candidateRefreshExecutionPreflight.alreadyCurrent, false)
    assert.deepEqual(handoff.candidateRefreshExecutionPreflight.blockers, [
      'candidate_refresh_unlock_required',
      'candidate_refresh_operator_approval_required',
      'candidate_refresh_refreshed_by_required',
      'candidate_refresh_execute_mode_required',
    ])
    assert.equal(
      handoff.candidateRefreshExecutionPreflight.artifact,
      repoRelativeForTest(candidateRefreshPreflightPath),
    )
    assert.equal(handoff.currentBlockers.includes('candidate_refresh_unlock_required'), true)
    assert.equal(handoff.currentBlockers.includes('candidate_refresh_operator_approval_required'), true)
    assert.equal(handoff.currentBlockers.includes('candidate_refresh_execution_unlock_required'), true)
    assert.equal(handoff.candidateRefreshExecution.executionGatePlan.status, 'blocked')
    assert.equal(handoff.candidateRefreshExecution.executionGatePlan.noAutoExecution, true)
    assert.equal(handoff.candidateRefreshAuthorizationPackage.status, 'authorization_package_ready')
    assert.equal(handoff.candidateRefreshAuthorizationPackage.preflightReady, true)
    assert.equal(handoff.candidateRefreshAuthorizationPackage.packageOnly, true)
    assert.equal(handoff.candidateRefreshAuthorizationPackage.doesNotMutateDatabase, true)
    assert.deepEqual(handoff.candidateRefreshAuthorizationPackage.blockers, [])
    assert.equal(
      handoff.candidateRefreshAuthorizationPackage.artifact,
      repoRelativeForTest(candidateRefreshAuthorizationPackagePath),
    )
    assert.deepEqual(handoff.candidateRefreshExecution.executionGatePlan.requiredStepIds, [
      'set_candidate_refresh_execution_unlock',
      'run_candidate_refresh_in_execute_mode_with_allow_flag',
      'record_candidate_refresh_operator_approval_and_actor',
    ])
    assert.deepEqual(handoff.candidateRefreshExecution.executionGatePlan.blockedStepIds, [
      'rerun_candidate_refresh_execution_after_gate',
    ])

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Candidate Refresh Gate/)
    assert.match(markdown, /candidateRefreshExecutionPreflight: blocked/)
    assert.match(markdown, /candidate_refresh_unlock_required/)
    assert.match(markdown, /candidate_refresh_operator_approval_required/)
    assert.match(markdown, /executionGatePlanStatus: blocked/)
    assert.match(markdown, /executionGatePlanRequiredStepIds: set_candidate_refresh_execution_unlock, run_candidate_refresh_in_execute_mode_with_allow_flag, record_candidate_refresh_operator_approval_and_actor/)
    assert.match(markdown, /candidateRefreshAuthorizationPackage: authorization_package_ready/)
    assert.match(markdown, /authorizationPackageOnly: true/)
    assert.match(markdown, /authorizationDoesNotMutateDatabase: true/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks operator handoff when candidate export exposes profile labels as active row sources', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, {
    ...candidateBaselineFixture(),
    quality: {
      rowsMissingReferenceDuration: 0,
      rowsWritingTasks: 0,
      rowsWritingTaskDependencies: 0,
      sourceLabels: [
        'business_type_base_master_plan_profile_v1',
        'business_type_master_plan_profile_v1',
      ],
    },
    rows: [
      {
        index: 1,
        id: 'row-1',
        title: '施工准备与现场临设完成',
        standardWorkCode: 'BTMP-BASE-01',
        source: 'business_type_base_master_plan_profile_v1',
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
        source: 'business_type_master_plan_profile_v1',
        smartReferenceDays: 100,
        candidateOnly: true,
        writesTasks: false,
        writesTaskDependencies: false,
      },
    ],
  })
  await writeJson(readinessPath, {
    ...readinessFixture(),
    status: 'staging_runtime_chain_passed',
    productionReadinessBlockers: [
      'staging_controlled_replay_not_production_ready',
    ],
    gates: [
      { id: 'legacy_serial_template_path_removed', status: 'pass' },
      { id: 'candidate_master_plan_shape_11_business_types', status: 'pass' },
    ],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      output: outputPath,
      now: new Date('2026-07-02T04:17:00.000Z'),
    })

    assert.equal(handoff.status, 'blocked')
    assert.equal(handoff.productionReady, false)
    assert.equal(
      handoff.currentBlockers.includes('candidate_baseline_contains_retired_or_low_information_sources'),
      true,
    )
    assert.deepEqual(handoff.candidate.blockedSourceLabels, [
      'business_type_base_master_plan_profile_v1',
      'business_type_master_plan_profile_v1',
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks operator handoff when candidate baseline root hides retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, {
    ...candidateBaselineFixture(),
    comparisonBasis: ['manual_comparison_scenario'],
    boundaryPolicy: 'controlled_degradation',
    reviewProof: {
      sourceKind: 'legacy_template_reverse_inference',
    },
  })
  await writeJson(readinessPath, readinessFixture())

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      output: outputPath,
      now: new Date('2026-07-02T04:25:00.000Z'),
    })

    assert.equal(handoff.status, 'blocked')
    assert.equal(handoff.productionReady, false)
    assert.equal(
      handoff.currentBlockers.includes('candidate_baseline_contains_retired_or_low_information_sources'),
      true,
    )
    assert.equal(handoff.candidate.blockedSourceLabels.includes('manual_comparison_scenario'), true)
    assert.equal(handoff.candidate.blockedSourceLabels.includes('legacy_template_reverse_inference'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('uses provided source export file paths instead of source export placeholders', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      output: outputPath,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      publicationKey: 'default-master-plan-runtime-publication-1',
      writerResult: 'project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json',
      criticalPathReadback: 'project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json',
      apiReadSmoke: 'project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json',
      uiConsumptionSmoke: 'project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json',
      rollbackVerification: 'project-testing/reports/default-master-plan-production-readiness/rollback-verification.json',
      realProductionOutcome: 'project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json',
      now: new Date('2026-07-02T04:20:00.000Z'),
    })

    const sourceExportAction = handoff.actionSequence.find((action) => action.id === 'source_export_collect')
    assert.ok(sourceExportAction)
    assert.match(sourceExportAction.command, /--publication-key default-master-plan-runtime-publication-1/)
    assert.match(sourceExportAction.command, /--writer-result project-testing\/reports\/default-master-plan-production-readiness\/dependency-writer-result\.json/)
    assert.match(sourceExportAction.command, /--critical-path-readback project-testing\/reports\/default-master-plan-production-readiness\/critical-path-readback\.json/)
    assert.match(sourceExportAction.command, /--real-production-outcome project-testing\/reports\/default-master-plan-production-readiness\/real-production-outcome\.json/)
    assert.equal(sourceExportAction.command.includes('<dependency-writer-result.json>'), false)
    assert.equal(sourceExportAction.command.includes('<critical-path-readback.json>'), false)
    assert.equal(sourceExportAction.command.includes('<api-read-smoke.json>'), false)
    assert.equal(sourceExportAction.command.includes('<ui-consumption-smoke.json>'), false)
    assert.equal(sourceExportAction.command.includes('<rollback-verification.json>'), false)
    assert.equal(sourceExportAction.command.includes('<real-production-outcome.json>'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('omits real production outcome placeholder for staging source export when no outcome path is provided', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      output: outputPath,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      publicationKey: 'default-master-plan-runtime-publication-1',
      now: new Date('2026-07-02T04:20:00.000Z'),
    })

    const sourceExportAction = handoff.actionSequence.find((action) => action.id === 'source_export_collect')
    assert.ok(sourceExportAction)
    assert.equal(sourceExportAction.command.includes('--real-production-outcome'), false)
    assert.equal(sourceExportAction.command.includes('<real-production-outcome.json>'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reports an existing review package as optional offline development quality input', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const reviewPackagePath = path.join(root, 'pm-review-package.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(reviewPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-review-package/v1',
    status: 'ready_for_human_pm_review',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    reviewedItemCount: 2,
    blockers: [],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      reviewPackage: reviewPackagePath,
      output: outputPath,
      now: new Date('2026-07-02T04:25:00.000Z'),
    })

    assert.equal(handoff.offlineDevelopmentQualityReview.status, 'available_for_offline_calibration')
    assert.equal(handoff.offlineDevelopmentQualityReview.requiredForRuntime, false)
    assert.equal(handoff.offlineDevelopmentQualityReview.reviewPackage.status, 'ready_for_human_pm_review')
    assert.equal(handoff.offlineDevelopmentQualityReview.reviewPackage.reviewedItemCount, 2)
    assert.equal(handoff.offlineDevelopmentQualityReview.reviewPackage.artifact.endsWith('pm-review-package.json'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('surfaces offline development review notes quality guidance without creating a runtime gate', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const reviewPackagePath = path.join(root, 'pm-review-package.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(reviewPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-review-package/v1',
    status: 'blocked_item_count_mismatch',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    reviewedItemCount: 18,
    reviewedItemIds: Array.from({ length: 18 }, (_, index) => `item-${index + 1}`),
    blockers: ['review_notes_reviewed_item_count_mismatch'],
    reviewNotesQuality: {
      status: 'blocked_item_count_mismatch',
      statedItemCount: 16,
      actualReviewedItemCount: 18,
      suggestedReviewNotes: '已复核学校项目默认主计划候选基线 baseline-1。候选 18 行 WBS 可进入后续流程。',
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      reviewPackage: reviewPackagePath,
      output: outputPath,
      now: new Date('2026-07-02T04:25:10.000Z'),
    })

    const reviewNotesQuality = handoff.offlineDevelopmentQualityReview.reviewPackage.reviewNotesQuality
    assert.equal(reviewNotesQuality.status, 'blocked_item_count_mismatch')
    assert.equal(reviewNotesQuality.statedItemCount, 16)
    assert.equal(reviewNotesQuality.actualReviewedItemCount, 18)
    assert.match(reviewNotesQuality.suggestedReviewNotes, /候选 18 行 WBS/)
    assert.equal(handoff.currentBlockers.includes('review_notes_reviewed_item_count_mismatch'), false)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Review Notes Quality/)
    assert.match(markdown, /blocked_item_count_mismatch/)
    assert.match(markdown, /候选 18 行 WBS/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('keeps retired lineage in offline review package as a non-runtime quality finding', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const reviewPackagePath = path.join(root, 'pm-review-package.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(reviewPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-review-package/v1',
    status: 'ready_for_human_pm_review',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    reviewedItemCount: 1,
    reviewedItemIds: ['item-1'],
    blockers: [],
    comparisonBasis: {
      selectedSource: 'manual_comparison_scenario',
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      reviewPackage: reviewPackagePath,
      output: outputPath,
      now: new Date('2026-07-02T04:25:30.000Z'),
    })

    assert.equal(
      handoff.offlineDevelopmentQualityReview.qualityFindings.includes('offline_development_quality_review_package_retired_or_low_information_default_master_plan_source'),
      true,
    )
    assert.equal(
      handoff.currentBlockers.includes('offline_development_quality_review_package_retired_or_low_information_default_master_plan_source'),
      false,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reports an existing legacy review record preflight only inside offline quality diagnostics', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const reviewRecordPreflightPath = path.join(root, 'pm-review-record-preflight.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(reviewRecordPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-review-record-preflight/v1',
    status: 'blocked',
    mayExecuteReviewRecord: false,
    blockers: ['review_record_command_contains_placeholders'],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      reviewRecordPreflight: reviewRecordPreflightPath,
      output: outputPath,
      now: new Date('2026-07-02T04:26:00.000Z'),
    })

    const legacyPreflight = handoff.offlineDevelopmentQualityReview.reviewRecordPreflight
    assert.equal(legacyPreflight.status, 'blocked')
    assert.equal(legacyPreflight.mayExecuteReviewRecord, false)
    assert.deepEqual(legacyPreflight.blockers, ['review_record_command_contains_placeholders'])
    assert.equal(legacyPreflight.artifact.endsWith('pm-review-record-preflight.json'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('keeps stale legacy review preflight findings outside operator handoff current blockers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-review-preflight-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const reviewRecordPreflightPath = path.join(root, 'pm-review-record-preflight.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(reviewRecordPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-review-record-preflight/v1',
    status: 'blocked',
    mayExecuteReviewRecord: false,
    blockers: [
      'pm_review_evidence_stale_for_current_review_package',
      'review_evidence_reviewed_item_count_mismatch',
      'review_evidence_reviewed_item_ids_mismatch',
    ],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      reviewRecordPreflight: reviewRecordPreflightPath,
      output: outputPath,
      now: new Date('2026-07-04T19:45:00.000Z'),
    })

    assert.equal(
      handoff.currentBlockers.includes('pm_review_record_preflight_pm_review_evidence_stale_for_current_review_package'),
      false,
    )
    assert.equal(
      handoff.currentBlockers.includes('pm_review_record_preflight_review_evidence_reviewed_item_count_mismatch'),
      false,
    )
    assert.equal(
      handoff.currentBlockers.includes('pm_review_record_preflight_review_evidence_reviewed_item_ids_mismatch'),
      false,
    )
    assert.equal(
      handoff.offlineDevelopmentQualityReview.qualityFindings.includes('pm_review_record_preflight_pm_review_evidence_stale_for_current_review_package'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('keeps stale offline review diagnostics out of current blockers regardless of legacy readiness gate state', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-review-preflight-closed-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const reviewEvidencePath = path.join(root, 'pm-review-evidence.json')
  const reviewRecordPreflightPath = path.join(root, 'pm-review-record-preflight.json')
  const outputPath = path.join(root, 'operator-handoff.json')
  const readiness = readinessFixture()
  readiness.gates = readiness.gates.map((gate) => gate.id === 'project_manager_review_evidence'
    ? { ...gate, status: 'pass' }
    : gate)

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readiness)
  await writeJson(reviewEvidencePath, {
    schemaVersion: 'workbuddy-candidate-default-master-plan-review-evidence/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    candidate_governance_review: {
      decision: 'accepted_for_baseline',
      reviewed_by: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      reviewed_item_ids: ['BTMP-BASE-01', 'BTMP-SCH-01'],
      reviewed_item_count: 2,
      review_notes: '郑俊红已复核当前候选基线，可作为后续生产证据链输入，不代表 production-ready。',
      production_ready: false,
    },
  })
  await writeJson(reviewRecordPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-review-record-preflight/v1',
    status: 'blocked',
    mayExecuteReviewRecord: false,
    blockers: [
      'pm_review_evidence_stale_for_current_review_package',
      'review_evidence_reviewed_item_count_mismatch',
      'review_evidence_reviewed_item_ids_mismatch',
    ],
    reviewEvidence: {
      present: true,
      staleForCurrentPackage: true,
      reviewedItemCount: 1,
      currentPackageReviewedItemCount: 2,
      reviewedItemIds: ['old-row-1'],
      currentPackageReviewedItemIds: ['BTMP-BASE-01', 'BTMP-SCH-01'],
      missingCurrentReviewedItemIds: ['BTMP-BASE-01', 'BTMP-SCH-01'],
      extraEvidenceReviewedItemIds: ['old-row-1'],
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      reviewEvidence: reviewEvidencePath,
      reviewRecordPreflight: reviewRecordPreflightPath,
      output: outputPath,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      now: new Date('2026-07-06T09:20:00.000Z'),
    })

    assert.equal(
      handoff.currentBlockers.includes('pm_review_record_preflight_pm_review_evidence_stale_for_current_review_package'),
      false,
    )
    assert.equal(
      handoff.currentBlockers.includes('pm_review_record_preflight_review_evidence_reviewed_item_count_mismatch'),
      false,
    )
    assert.equal(
      handoff.currentBlockers.includes('pm_review_record_preflight_review_evidence_reviewed_item_ids_mismatch'),
      false,
    )
    assert.equal(
      handoff.offlineDevelopmentQualityReview.qualityFindings.includes('pm_review_record_preflight_pm_review_evidence_stale_for_current_review_package'),
      true,
    )
    assert.equal(handoff.offlineDevelopmentQualityReview.reviewRecordPreflight.status, 'blocked')
    assert.equal(handoff.offlineDevelopmentQualityReview.requiredForRuntime, false)
    assert.equal(handoff.productionReady, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('summarizes stale offline development review evidence delta without a runtime gate', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-review-delta-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const reviewPackagePath = path.join(root, 'pm-review-package.json')
  const reviewRecordPreflightPath = path.join(root, 'pm-review-record-preflight.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(reviewPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-review-package/v1',
    status: 'ready_for_human_pm_review',
    reviewedItemCount: 18,
    reviewedItemIds: ['BTMP-BASE-01', 'BTMP-SCH-01', 'BTMP-SCH-02'],
    blockers: [],
  })
  await writeJson(reviewRecordPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-review-record-preflight/v1',
    status: 'blocked',
    mayExecuteReviewRecord: false,
    blockers: [
      'pm_review_evidence_stale_for_current_review_package',
      'review_evidence_reviewed_item_count_mismatch',
      'review_evidence_reviewed_item_ids_mismatch',
    ],
    reviewEvidence: {
      present: true,
      staleForCurrentPackage: true,
      reviewedItemCount: 16,
      currentPackageReviewedItemCount: 18,
      reviewedItemIds: ['old-row-1', 'old-row-2'],
      currentPackageReviewedItemIds: ['BTMP-BASE-01', 'BTMP-SCH-01', 'BTMP-SCH-02'],
      missingCurrentReviewedItemIds: ['BTMP-BASE-01', 'BTMP-SCH-01', 'BTMP-SCH-02'],
      extraEvidenceReviewedItemIds: ['old-row-1', 'old-row-2'],
      reviewedBy: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      reviewedAt: '2026-07-02T05:56:25.810Z',
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      reviewPackage: reviewPackagePath,
      reviewRecordPreflight: reviewRecordPreflightPath,
      output: outputPath,
      now: new Date('2026-07-04T20:25:00.000Z'),
    })

    const offlineReview = handoff.offlineDevelopmentQualityReview
    assert.equal(offlineReview.status, 'available_for_offline_calibration')
    assert.equal(offlineReview.requiredForRuntime, false)
    assert.equal(offlineReview.reviewPackage.reviewedItemCount, 18)
    assert.equal(offlineReview.reviewEvidence.reviewedItemCount, 16)
    assert.equal(offlineReview.reviewEvidence.staleForCurrentPackage, true)
    assert.equal(offlineReview.reviewEvidence.missingCurrentReviewedItemCount, 3)
    assert.deepEqual(offlineReview.reviewEvidence.missingCurrentReviewedItemIdsSample, [
      'BTMP-BASE-01',
      'BTMP-SCH-01',
      'BTMP-SCH-02',
    ])
    assert.deepEqual(offlineReview.reviewEvidence.extraEvidenceReviewedItemIdsSample, [
      'old-row-1',
      'old-row-2',
    ])

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Offline Development Quality Review/)
    assert.match(markdown, /reviewEvidence: stale/)
    assert.match(markdown, /missingCurrentReviewedItemCount: 3/)
    assert.match(markdown, /BTMP-SCH-02/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('keeps existing PM-shaped evidence as offline calibration input without a review-record action', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const reviewEvidencePath = path.join(root, 'pm-review-evidence.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(reviewEvidencePath, {
    schemaVersion: 'workbuddy-candidate-default-master-plan-review-evidence/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    candidate_governance_review: {
      decision: 'accepted_for_baseline',
      reviewed_by: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      review_notes: '郑俊红已复核学校项目默认主计划候选基线，同意作为 staging 写入/发布/rollback 测试对象，不代表 production-ready。',
      production_ready: false,
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      reviewEvidence: reviewEvidencePath,
      output: outputPath,
      environment: 'staging',
      exportedBy: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      now: new Date('2026-07-02T04:26:30.000Z'),
    })

    assert.equal(handoff.actionSequence.some((action) => action.id === 'pm_review_record'), false)
    assert.equal(handoff.offlineDevelopmentQualityReview.requiredForRuntime, false)
    assert.equal(handoff.offlineDevelopmentQualityReview.reviewEvidence.reviewedBy, '9e4a5570-0032-43bd-8f17-0bc415a1eb70')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reports stale offline review input after candidate replacement without blocking runtime', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-review-refresh-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const reviewEvidencePath = path.join(root, 'pm-review-evidence.json')
  const candidateRefreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(reviewEvidencePath, {
    schemaVersion: 'workbuddy-candidate-default-master-plan-review-evidence/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    candidate_governance_review: {
      decision: 'accepted_for_baseline',
      reviewed_by: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      reviewed_item_ids: ['row-1', 'row-2'],
      reviewed_item_count: 2,
      review_notes: '旧候选 2 行已复核，不代表刷新后的 3 行候选已复核。',
      production_ready: false,
    },
  })
  await writeJson(candidateRefreshPackagePath, {
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
      { id: 'target-row-1', code: 'BTMP-BASE-01', title: '施工准备与现场临设完成' },
      { id: 'target-row-2', code: 'BTMP-SCH-01', title: '教学楼主体结构与功能区移交' },
      { id: 'target-row-3', code: 'BTMP-SCH-02', title: '教学楼二次结构与普通教室粗装修' },
    ],
    blockers: ['candidate_baseline_refresh_required_before_runtime_publication'],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      reviewEvidence: reviewEvidencePath,
      candidateRefreshPackage: candidateRefreshPackagePath,
      output: outputPath,
      environment: 'staging',
      exportedBy: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      now: new Date('2026-07-04T17:30:00.000Z'),
    })

    assert.equal(handoff.currentBlockers.includes('pm_review_required_after_candidate_refresh'), false)
    assert.equal(handoff.actionSequence.some((action) => action.id === 'pm_review_record'), false)
    assert.equal(handoff.offlineDevelopmentQualityReview.qualityFindings.includes('pm_review_required_after_candidate_refresh'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not turn a ready legacy review-record preflight into a runtime action', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-review-preflight-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const reviewEvidencePath = path.join(root, 'pm-review-evidence.json')
  const reviewRecordPreflightPath = path.join(root, 'pm-review-record-preflight.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(reviewEvidencePath, {
    schemaVersion: 'workbuddy-candidate-default-master-plan-review-evidence/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    candidate_governance_review: {
      decision: 'accepted_for_baseline',
      reviewed_by: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      reviewed_item_ids: ['old-row-1'],
      reviewed_item_count: 1,
      review_notes: 'old stale review notes should not source the new command',
      production_ready: false,
    },
  })
  await writeJson(reviewRecordPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-review-record-preflight/v1',
    status: 'ready_for_execute',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    mayExecuteReviewRecord: true,
    alreadyRecorded: false,
    blockers: [],
    reviewEvidence: {
      present: true,
      staleForCurrentPackage: true,
      reviewedItemCount: 1,
      currentPackageReviewedItemCount: 3,
    },
    executionPlan: {
      reviewedBy: '22222222-2222-4222-8222-222222222222',
      reviewNotes: 'Human PM reviewed the current package and accepts it as candidate baseline only.',
      environment: 'staging',
      exportedBy: 'release-operator-1',
      mode: 'execute',
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      reviewEvidence: reviewEvidencePath,
      reviewRecordPreflight: reviewRecordPreflightPath,
      output: outputPath,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      now: new Date('2026-07-05T11:10:00.000Z'),
    })

    assert.equal(handoff.actionSequence.some((action) => action.id === 'pm_review_record'), false)
    assert.equal(handoff.offlineDevelopmentQualityReview.reviewEvidence.status, 'stale')
    assert.equal(handoff.offlineDevelopmentQualityReview.reviewRecordPreflight.status, 'ready_for_execute')
    assert.equal(handoff.offlineDevelopmentQualityReview.requiredForRuntime, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('keeps blocked legacy review-record preflight informational and emits no runtime action', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-review-preflight-blocked-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const reviewEvidencePath = path.join(root, 'pm-review-evidence.json')
  const reviewRecordPreflightPath = path.join(root, 'pm-review-record-preflight.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(reviewEvidencePath, {
    schemaVersion: 'workbuddy-candidate-default-master-plan-review-evidence/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    candidate_governance_review: {
      decision: 'accepted_for_baseline',
      reviewed_by: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      reviewed_item_ids: ['old-row-1'],
      reviewed_item_count: 1,
      review_notes: '旧候选 1 行已复核，不代表当前 2 行候选已复核。',
      production_ready: false,
    },
  })
  await writeJson(reviewRecordPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-review-record-preflight/v1',
    status: 'blocked',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    mayExecuteReviewRecord: false,
    blockers: [
      'pm_review_evidence_stale_for_current_review_package',
      'review_evidence_reviewed_item_count_mismatch',
    ],
    reviewEvidence: {
      present: true,
      staleForCurrentPackage: true,
      reviewedItemCount: 1,
      currentPackageReviewedItemCount: 2,
    },
    executionPlan: {
      reviewedBy: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      reviewNotes: '旧候选 1 行已复核，不代表当前 2 行候选已复核。',
      environment: 'staging',
      exportedBy: 'release-operator-1',
      mode: 'execute',
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      reviewEvidence: reviewEvidencePath,
      reviewRecordPreflight: reviewRecordPreflightPath,
      output: outputPath,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      now: new Date('2026-07-06T04:05:00.000Z'),
    })

    assert.equal(handoff.actionSequence.some((action) => action.id === 'pm_review_record'), false)
    assert.equal(handoff.offlineDevelopmentQualityReview.reviewRecordPreflight.status, 'blocked')
    assert.equal(handoff.offlineDevelopmentQualityReview.requiredForRuntime, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('uses source manifest and evidence bundle to fill runtime pipeline commands', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const durationGapPath = path.join(root, 'duration-gap.json')
  const readinessPath = path.join(root, 'readiness.json')
  const evidenceBundlePath = path.join(root, 'evidence-bundle.json')
  const sourceManifestPath = path.join(root, 'source-exports', 'source-exports-manifest.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  const evidenceFiles = {
    reviewEvidence: path.join(root, 'pm-review-evidence.json'),
    durationCalibrationEvidence: path.join(root, 'duration-calibration-evidence.json'),
    dependencyWriterEvidence: path.join(root, 'dependency-writer-evidence.json'),
    runtimePublicationEvidence: path.join(root, 'runtime-publication-evidence.json'),
    postPublishSmokeRollbackEvidence: path.join(root, 'post-publish-smoke-rollback-evidence.json'),
  }

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(durationGapPath, durationGapFixture())
  await writeJson(readinessPath, readinessFixture())
  const sourceManifest = sourceManifestFixture(sourceManifestPath)
  sourceManifest.sourceExports.rawCompletedTasks = {
    source: 'raw_completed_tasks',
    path: path.join(path.dirname(sourceManifestPath), 'raw-completed-tasks.json'),
    sha256: 'rawcompletedtaskssha256',
    rowCount: 16,
    blockers: [],
  }
  await writeJson(sourceManifestPath, sourceManifest)
  await writeJson(evidenceFiles.reviewEvidence, {
    schemaVersion: 'workbuddy-default-master-plan-review-evidence/v1',
    status: 'accepted',
  })
  await writeJson(evidenceBundlePath, {
    ...evidenceBundleFixture(),
    sourceManifest: {
      path: sourceManifestPath,
      status: 'exported',
      blockers: [],
    },
    evidenceFiles: [
      { type: 'reviewEvidence', path: evidenceFiles.reviewEvidence },
      { type: 'durationCalibrationEvidence', path: evidenceFiles.durationCalibrationEvidence },
      { type: 'dependencyWriterEvidence', path: evidenceFiles.dependencyWriterEvidence },
      { type: 'runtimePublicationEvidence', path: evidenceFiles.runtimePublicationEvidence },
      { type: 'postPublishSmokeRollbackEvidence', path: evidenceFiles.postPublishSmokeRollbackEvidence },
    ],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      durationGapPlan: durationGapPath,
      readiness: readinessPath,
      evidenceBundle: evidenceBundlePath,
      output: outputPath,
      publicationKey: 'default-master-plan-runtime-publication-1',
      environment: 'staging',
      exportedBy: 'release-user-1',
      now: new Date('2026-07-02T04:27:30.000Z'),
    })

    const commandsById = Object.fromEntries(handoff.actionSequence.map((action) => [action.id, action.command]))

    assert.match(commandsById.duration_sample_gap_refresh, /--samples .*duration-experience-samples-export\.json/)
    assert.match(commandsById.production_evidence_pipeline, /build-default-master-plan-production-evidence-pipeline\.mjs/)
    assert.match(commandsById.production_evidence_pipeline, /--source-manifest .*source-exports-manifest\.json/)
    assert.match(commandsById.production_evidence_pipeline, /--duration-samples .*duration-experience-samples-export\.json/)
    assert.match(commandsById.evidence_bundle, /build-default-master-plan-production-evidence-bundle\.mjs/)
    assert.doesNotMatch(commandsById.evidence_bundle, /--review-evidence/)
    assert.match(commandsById.evidence_bundle, /--source-manifest .*source-exports-manifest\.json/)
    assert.match(commandsById.readiness_check, /check-default-master-plan-production-readiness\.mjs/)
    assert.match(commandsById.readiness_check, /--post-publish-smoke-rollback-evidence .*post-publish-smoke-rollback-evidence\.json/)
    assert.match(commandsById.completed_task_export, /--source-name raw_completed_tasks/)
    assert.match(commandsById.completed_task_export, /--evidence-ref "?raw_completed_tasks:.*raw-completed-tasks\.json#sha256=rawcompletedtaskssha256"?/)
    assert.match(commandsById.completed_task_export, /--operator-review-ref "?raw_completed_tasks:.*raw-completed-tasks\.json#sha256=rawcompletedtaskssha256/)
    assert.match(commandsById.real_duration_sample_material_from_task_export, /--source-name completed_task_export/)
    assert.match(commandsById.real_duration_sample_material_from_task_export, /--operator-review-ref "?raw_completed_tasks:.*raw-completed-tasks\.json#sha256=rawcompletedtaskssha256/)
    assert.equal(commandsById.duration_sample_gap_refresh.includes('<duration-experience-samples-export.json>'), false)
    assert.equal(commandsById.completed_task_export.includes('<raw-completed-task-source-name>'), false)
    assert.equal(commandsById.completed_task_export.includes('<operator-reviewed-raw-task-evidence-ref>'), false)
    assert.equal(commandsById.completed_task_export.includes('<duration-sample-source-review-ref>'), false)
    assert.equal(commandsById.production_evidence_pipeline.includes('<source-export-pipeline-args>'), false)
    assert.equal(commandsById.evidence_bundle.includes('<five-evidence-args>'), false)
    assert.equal(commandsById.readiness_check.includes('<five-evidence-args>'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('normalizes source manifest pipeline command identity to the handoff publication key', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const durationGapPath = path.join(root, 'duration-gap.json')
  const readinessPath = path.join(root, 'readiness.json')
  const evidenceBundlePath = path.join(root, 'evidence-bundle.json')
  const sourceManifestPath = path.join(root, 'source-exports', 'source-exports-manifest.json')
  const outputPath = path.join(root, 'operator-handoff.json')
  const stalePublicationKey = 'runtime.default_master_plan.project-1'
  const sourceManifest = sourceManifestFixture(sourceManifestPath)
  sourceManifest.pipelineArgs[sourceManifest.pipelineArgs.indexOf('--publication-key') + 1] = stalePublicationKey

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(durationGapPath, durationGapFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(sourceManifestPath, sourceManifest)
  await writeJson(evidenceBundlePath, {
    ...evidenceBundleFixture(),
    sourceManifest: {
      path: sourceManifestPath,
      status: 'exported',
      blockers: [],
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      durationGapPlan: durationGapPath,
      readiness: readinessPath,
      evidenceBundle: evidenceBundlePath,
      output: outputPath,
      publicationKey: 'default-master-plan-runtime-publication-1',
      environment: 'staging',
      exportedBy: 'release-user-1',
      now: new Date('2026-07-06T03:35:00.000Z'),
    })

    const command = handoff.actionSequence.find((action) => action.id === 'production_evidence_pipeline')?.command ?? ''
    assert.match(command, /--publication-key default-master-plan-runtime-publication-1/)
    assert.equal(command.includes(stalePublicationKey), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reports an existing duration sample collection package status in operator handoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const durationSampleCollectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(durationSampleCollectionPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    status: 'samples_required',
    requiredStableCodeCount: 2,
    totalRequiredAcceptedSampleCount: 2,
    blockers: ['accepted_real_duration_samples_required'],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      durationSampleCollectionPackage: durationSampleCollectionPackagePath,
      output: outputPath,
      now: new Date('2026-07-02T04:27:00.000Z'),
    })

    assert.equal(handoff.durationSampleCollectionPackage.status, 'samples_required')
    assert.equal(handoff.durationSampleCollectionPackage.requiredStableCodeCount, 2)
    assert.equal(handoff.durationSampleCollectionPackage.totalRequiredAcceptedSampleCount, 2)
    assert.deepEqual(handoff.durationSampleCollectionPackage.blockers, ['accepted_real_duration_samples_required'])
    assert.equal(handoff.durationSampleCollectionPackage.artifact.endsWith('duration-sample-collection-package.json'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('preserves scoped duration sample collection command in operator handoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-scoped-duration-samples-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const durationSampleCollectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(durationSampleCollectionPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    status: 'samples_required',
    targetBusinessTypes: ['school'],
    profileScope: 'target',
    profileRuntimeReferenceScopePolicy: 'target_business_type_only',
    requiredStableCodeCount: 16,
    totalRequiredAcceptedSampleCount: 16,
    blockers: ['accepted_real_duration_samples_required'],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      durationSampleCollectionPackage: durationSampleCollectionPackagePath,
      output: outputPath,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      now: new Date('2026-07-06T13:45:00.000Z'),
    })

    const action = handoff.actionSequence.find((entry) => entry.id === 'duration_sample_collection_package')
    assert.ok(action)
    assert.match(action.command, /--business-type school/)
    assert.match(action.command, /--profile-scope target/)
    assert.equal(action.command.includes('--profile-scope all'), false)
    assert.equal(action.command.includes('--profile-only'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('surfaces duration asset utilization evidence and regeneration action in operator handoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-duration-assets-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const durationGapPath = path.join(root, 'duration-gap.json')
  const discoveryPath = path.join(root, 'candidate-discovery.json')
  const readinessPath = path.join(root, 'readiness.json')
  const evidenceBundlePath = path.join(root, 'evidence-bundle.json')
  const candidateRefreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const durationAssetUtilizationPath = path.join(root, 'duration-asset-utilization-report.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(durationGapPath, durationGapFixture())
  await writeJson(discoveryPath, discoveryFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(evidenceBundlePath, evidenceBundleFixture())
  await writeJson(candidateRefreshPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'refresh_required',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    blockers: ['candidate_baseline_refresh_required_before_runtime_publication'],
  })
  await writeJson(durationAssetUtilizationPath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-asset-utilization-report/v1',
    status: 'candidate_asset_utilization_review_required',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    rowCount: 18,
    assetCoverage: {
      rowsWithStandardWorkSeedCount: 18,
      rowsMissingStandardWorkSeedCount: 0,
      rowsWithActiveStandardWorkSeedCount: 0,
      rowsWithFallbackStandardWorkSeedCount: 18,
      rowsWithT2RhythmTemplateCount: 18,
      rowsMissingT2RhythmTemplateCount: 0,
      rowsWithActiveT2RhythmTemplateCount: 0,
      rowsWithFallbackT2RhythmTemplateCount: 18,
      rowsWithRuntimeReferenceDaysCount: 16,
      rowsMissingRuntimeReferenceDaysCount: 2,
      rowsWithQuantityOrProductivityCount: 18,
      rowsMissingQuantityOrProductivityCount: 0,
      rowsWithDependencyEvidenceCount: 17,
      rowsMissingDependencyEvidenceCount: 1,
      rowsWithDependencyAssetCount: 2,
      rowsWithDependencyTimingAssetCount: 17,
      rowsWithProcessSeasonalDurationAssetCount: 0,
      rowsWithConstructionCalendarCount: 18,
      rowsWithMutationBoundaryViolationsCount: 0,
    },
    blockers: ['runtime_reference_days_missing_for_some_rows'],
    mutationBoundary: {
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      durationGapPlan: durationGapPath,
      discovery: discoveryPath,
      readiness: readinessPath,
      evidenceBundle: evidenceBundlePath,
      candidateRefreshPackage: candidateRefreshPackagePath,
      durationAssetUtilization: durationAssetUtilizationPath,
      output: outputPath,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      publicationKey: 'default-master-plan-runtime-publication-1',
      now: new Date('2026-07-04T16:30:00.000Z'),
    })

    assert.equal(handoff.durationAssetUtilization.status, 'candidate_asset_utilization_review_required')
    assert.equal(handoff.durationAssetUtilization.rowCount, 18)
    assert.equal(handoff.durationAssetUtilization.rowsWithStandardWorkSeedCount, 18)
    assert.equal(handoff.durationAssetUtilization.rowsWithActiveStandardWorkSeedCount, 0)
    assert.equal(handoff.durationAssetUtilization.rowsWithFallbackStandardWorkSeedCount, 18)
    assert.equal(handoff.durationAssetUtilization.rowsWithT2RhythmTemplateCount, 18)
    assert.equal(handoff.durationAssetUtilization.rowsWithActiveT2RhythmTemplateCount, 0)
    assert.equal(handoff.durationAssetUtilization.rowsWithFallbackT2RhythmTemplateCount, 18)
    assert.equal(handoff.durationAssetUtilization.rowsWithRuntimeReferenceDaysCount, 16)
    assert.equal(handoff.durationAssetUtilization.rowsMissingRuntimeReferenceDaysCount, 2)
    assert.equal(handoff.durationAssetUtilization.rowsWithDependencyAssetCount, 2)
    assert.equal(handoff.durationAssetUtilization.rowsWithDependencyTimingAssetCount, 17)
    assert.equal(handoff.durationAssetUtilization.rowsWithProcessSeasonalDurationAssetCount, 0)
    assert.equal(handoff.durationAssetUtilization.rowsWithConstructionCalendarCount, 18)
    assert.deepEqual(handoff.durationAssetUtilization.blockers, ['runtime_reference_days_missing_for_some_rows'])
    assert.equal(handoff.currentBlockers.includes('duration_asset_utilization_runtime_reference_days_missing_for_some_rows'), true)
    const action = handoff.actionSequence.find((entry) => entry.id === 'duration_asset_utilization')
    assert.ok(action)
    assert.match(action.command, /evidence:default-master-plan:duration-asset-utilization/)
    assert.match(action.command, /--candidate-refresh-package .*candidate-refresh-package\.json/)
    assert.match(action.command, /--output .*duration-asset-utilization-report\.json/)
    const reviewPackageAction = handoff.actionSequence.find((entry) => entry.id === 'pm_review_package')
    assert.equal(reviewPackageAction, undefined)
    const durationGapAction = handoff.actionSequence.find((entry) => entry.id === 'duration_sample_gap_refresh')
    assert.ok(durationGapAction)
    assert.match(durationGapAction.command, /--candidate-refresh-package .*candidate-refresh-package\.json/)
    const durationSampleCollectionAction = handoff.actionSequence.find((entry) => entry.id === 'duration_sample_collection_package')
    assert.ok(durationSampleCollectionAction)
    assert.match(durationSampleCollectionAction.command, /--duration-asset-utilization-report .*duration-asset-utilization-report\.json/)
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Duration Asset Utilization/)
    assert.match(markdown, /activeStandardWorkDurationSeedRows: 0\/18/)
    assert.match(markdown, /fallbackT2RhythmTemplateRows: 18\/18/)
    assert.match(markdown, /runtimeReferenceDaysRows: 16\/18/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('surfaces completed task export drift evidence in operator handoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-completed-task-drift-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const completedTaskExportReportPath = path.join(root, 'source-exports', 'completed-task-export.report.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(completedTaskExportReportPath, {
    schemaVersion: 'workbuddy-default-master-plan-completed-task-export/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    summary: {
      requiredStableCodeCount: 18,
      rawTaskCount: 16,
      exportedTaskCount: 0,
      candidateTaskCount: 13,
      invalidTaskCount: 3,
      titleMismatchCount: 3,
      titleMatchedDifferentStableCodeCount: 3,
      missingStableCodeCount: 5,
      missingStableCodes: [
        'BTMP-SCH-02',
        'BTMP-SCH-03',
      ],
    },
    invalidTasks: [
      {
        id: 'task-drift-1',
        stableCode: 'BTMP-SCH-04',
        title: '竣工验收与开学移交准备',
        expectedTitle: '食堂宿舍装修与机电收口',
        matchingRequestedStableCodeByTitle: 'BTMP-SCH-06',
        matchingRequestedTitleByTitle: '竣工验收与开学移交准备',
        recommendedAction: 'refresh_runtime_task_stable_code_or_collect_current_completed_task',
        blockers: ['completed_task_title_mismatch'],
      },
    ],
    blockers: [
      'invalid_completed_task_rows_present',
      'completed_task_export_coverage_incomplete',
    ],
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      completedTaskExportReport: completedTaskExportReportPath,
      output: outputPath,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      publicationKey: 'default-master-plan-runtime-publication-1',
      now: new Date('2026-07-06T15:00:00.000Z'),
    })

    assert.equal(handoff.completedTaskExport.status, 'blocked')
    assert.equal(handoff.completedTaskExport.requiredStableCodeCount, 18)
    assert.equal(handoff.completedTaskExport.rawTaskCount, 16)
    assert.equal(handoff.completedTaskExport.exportedTaskCount, 0)
    assert.equal(handoff.completedTaskExport.invalidTaskCount, 3)
    assert.equal(handoff.completedTaskExport.titleMismatchCount, 3)
    assert.equal(handoff.completedTaskExport.titleMatchedDifferentStableCodeCount, 3)
    assert.equal(handoff.completedTaskExport.missingStableCodeCount, 5)
    assert.deepEqual(handoff.completedTaskExport.missingStableCodes, [
      'BTMP-SCH-02',
      'BTMP-SCH-03',
    ])
    assert.deepEqual(handoff.completedTaskExport.invalidTaskExamples, [
      {
        id: 'task-drift-1',
        stableCode: 'BTMP-SCH-04',
        title: '竣工验收与开学移交准备',
        expectedTitle: '食堂宿舍装修与机电收口',
        matchingRequestedStableCodeByTitle: 'BTMP-SCH-06',
        recommendedAction: 'refresh_runtime_task_stable_code_or_collect_current_completed_task',
        blockers: ['completed_task_title_mismatch'],
      },
    ])
    assert.equal(handoff.currentBlockers.includes('completed_task_export_invalid_completed_task_rows_present'), true)
    assert.equal(handoff.currentBlockers.includes('completed_task_export_completed_task_export_coverage_incomplete'), true)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Completed Task Export Alignment/)
    assert.match(markdown, /missingStableCodes: BTMP-SCH-02, BTMP-SCH-03/)
    assert.match(markdown, /task-drift-1/)
    assert.match(markdown, /refresh_runtime_task_stable_code_or_collect_current_completed_task/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('surfaces runtime candidate alignment preflight in operator handoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-runtime-alignment-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const runtimeCandidateAlignmentPath = path.join(root, 'runtime-candidate-alignment-preflight.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(runtimeCandidateAlignmentPath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-candidate-alignment-preflight/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    summary: {
      candidateRowCount: 18,
      runtimeTaskCount: 16,
      matchedStableCodeCount: 16,
      missingRuntimeTaskCount: 2,
      titleMismatchCount: 3,
      titleMatchedDifferentStableCodeCount: 3,
      rowsWithActualDateRangeCount: 16,
      rowsMissingActualDateRangeCount: 2,
      projectMismatchCount: 0,
    },
    rows: [
      {
        stableCode: 'BTMP-SCH-02',
        candidateTitle: '教学楼二次结构与普通教室粗装修',
        runtimeTaskId: 'runtime-task-2',
        runtimeTitle: '实验室通风与专业机电安装',
        alignmentStatus: 'title_mismatch',
        matchingCandidateStableCodeByRuntimeTitle: 'BTMP-SCH-03',
        recommendedAction: 'refresh_runtime_task_stable_code_or_collect_current_completed_task',
        blockers: ['runtime_task_title_mismatch'],
      },
    ],
    blockers: [
      'runtime_candidate_alignment_coverage_incomplete',
      'runtime_candidate_title_mismatch_rows_present',
    ],
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      runtimeCandidateAlignmentPreflight: runtimeCandidateAlignmentPath,
      output: outputPath,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      publicationKey: 'default-master-plan-runtime-publication-1',
      now: new Date('2026-07-06T16:20:00.000Z'),
    })

    assert.equal(handoff.runtimeCandidateAlignmentPreflight.status, 'blocked')
    assert.equal(handoff.runtimeCandidateAlignmentPreflight.candidateRowCount, 18)
    assert.equal(handoff.runtimeCandidateAlignmentPreflight.runtimeTaskCount, 16)
    assert.equal(handoff.runtimeCandidateAlignmentPreflight.titleMismatchCount, 3)
    assert.equal(handoff.runtimeCandidateAlignmentPreflight.missingRuntimeTaskCount, 2)
    assert.deepEqual(handoff.runtimeCandidateAlignmentPreflight.driftExamples, [
      {
        stableCode: 'BTMP-SCH-02',
        candidateTitle: '教学楼二次结构与普通教室粗装修',
        runtimeTaskId: 'runtime-task-2',
        runtimeTitle: '实验室通风与专业机电安装',
        alignmentStatus: 'title_mismatch',
        matchingCandidateStableCodeByRuntimeTitle: 'BTMP-SCH-03',
        recommendedAction: 'refresh_runtime_task_stable_code_or_collect_current_completed_task',
        blockers: ['runtime_task_title_mismatch'],
      },
    ])
    assert.equal(handoff.currentBlockers.includes('runtime_candidate_alignment_runtime_candidate_alignment_coverage_incomplete'), true)
    assert.equal(handoff.currentBlockers.includes('runtime_candidate_alignment_runtime_candidate_title_mismatch_rows_present'), true)
    const action = handoff.actionSequence.find((entry) => entry.id === 'runtime_candidate_alignment_preflight')
    assert.ok(action)
    assert.match(action.command, /evidence:default-master-plan:runtime-candidate-alignment/)
    assert.match(action.command, /--candidate-baseline .*candidate-baseline\.json/)
    assert.match(action.command, /--raw-tasks .*raw-completed-tasks\.json/)
    assert.match(action.command, /--output .*runtime-candidate-alignment-preflight\.json/)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Runtime Candidate Alignment Preflight/)
    assert.match(markdown, /titleMismatchCount: 3/)
    assert.match(markdown, /BTMP-SCH-02/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('surfaces runtime task alignment refresh package blockers in operator handoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-runtime-refresh-package-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const runtimeTaskAlignmentRefreshPackagePath = path.join(root, 'runtime-task-alignment-refresh-package.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(runtimeTaskAlignmentRefreshPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-task-alignment-refresh-package/v1',
    status: 'runtime_task_alignment_refresh_review_required',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    preparedBy: 'release-operator-1',
    summary: {
      inputCandidateRowCount: 18,
      inputRuntimeTaskCount: 16,
      actionCount: 2,
      stableCodeRefreshReviewActionCount: 1,
      missingRuntimeTaskActionCount: 1,
      actualDateRangeCollectionActionCount: 1,
      collisionReviewActionCount: 1,
    },
    actions: [
      {
        stableCode: 'BTMP-SCH-02',
        candidateTitle: '教学楼二次结构与普通教室粗装修',
        runtimeTaskId: 'runtime-task-2',
        runtimeTitle: '实验室通风与专业机电安装',
        actionKind: 'review_runtime_task_stable_code_refresh',
        proposedStableCode: 'BTMP-SCH-03',
        recommendedOperatorAction: 'review_runtime_task_stable_code_refresh_against_source_task_and_pm_review',
        blockers: [
          'human_project_manager_review_required',
          'runtime_stable_code_collision_review_required',
        ],
      },
      {
        stableCode: 'BTMP-SCH-05',
        candidateTitle: '操场道路与校园室外配套',
        runtimeTaskId: '',
        runtimeTitle: '',
        actionKind: 'collect_current_completed_task_or_confirm_scope_gap',
        proposedStableCode: 'BTMP-SCH-05',
        recommendedOperatorAction: 'collect_current_completed_task_with_actual_dates_or_confirm_candidate_row_not_completed',
        blockers: [
          'current_completed_task_evidence_required',
          'human_project_manager_review_required',
        ],
      },
    ],
    blockers: ['runtime_task_alignment_operator_review_required'],
    executionControl: {
      executeAllowed: false,
      recommendedMode: 'operator_review_only',
    },
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      runtimeTaskAlignmentRefreshPackage: runtimeTaskAlignmentRefreshPackagePath,
      output: outputPath,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      publicationKey: 'default-master-plan-runtime-publication-1',
      now: new Date('2026-07-06T17:10:00.000Z'),
    })

    assert.equal(handoff.runtimeTaskAlignmentRefreshPackage.status, 'runtime_task_alignment_refresh_review_required')
    assert.equal(handoff.runtimeTaskAlignmentRefreshPackage.actionCount, 2)
    assert.equal(handoff.runtimeTaskAlignmentRefreshPackage.stableCodeRefreshReviewActionCount, 1)
    assert.equal(handoff.runtimeTaskAlignmentRefreshPackage.missingRuntimeTaskActionCount, 1)
    assert.equal(handoff.runtimeTaskAlignmentRefreshPackage.actualDateRangeCollectionActionCount, 1)
    assert.equal(handoff.runtimeTaskAlignmentRefreshPackage.collisionReviewActionCount, 1)
    assert.equal(handoff.runtimeTaskAlignmentRefreshPackage.executeAllowed, false)
    assert.deepEqual(handoff.runtimeTaskAlignmentRefreshPackage.actionExamples, [
      {
        stableCode: 'BTMP-SCH-02',
        candidateTitle: '教学楼二次结构与普通教室粗装修',
        runtimeTaskId: 'runtime-task-2',
        runtimeTitle: '实验室通风与专业机电安装',
        actionKind: 'review_runtime_task_stable_code_refresh',
        proposedStableCode: 'BTMP-SCH-03',
        recommendedOperatorAction: 'review_runtime_task_stable_code_refresh_against_source_task_and_pm_review',
        blockers: [
          'human_project_manager_review_required',
          'runtime_stable_code_collision_review_required',
        ],
      },
      {
        stableCode: 'BTMP-SCH-05',
        candidateTitle: '操场道路与校园室外配套',
        runtimeTaskId: '',
        runtimeTitle: '',
        actionKind: 'collect_current_completed_task_or_confirm_scope_gap',
        proposedStableCode: 'BTMP-SCH-05',
        recommendedOperatorAction: 'collect_current_completed_task_with_actual_dates_or_confirm_candidate_row_not_completed',
        blockers: [
          'current_completed_task_evidence_required',
          'human_project_manager_review_required',
        ],
      },
    ])
    assert.equal(
      handoff.currentBlockers.includes('runtime_task_alignment_refresh_package_runtime_task_alignment_operator_review_required'),
      true,
    )
    assert.equal(
      handoff.currentBlockers.includes('runtime_task_alignment_refresh_package_execute_not_allowed'),
      true,
    )

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Runtime Task Alignment Refresh Package/)
    assert.match(markdown, /actionCount: 2/)
    assert.match(markdown, /runtime_task_alignment_operator_review_required/)
    assert.match(markdown, /review_runtime_task_stable_code_refresh/)
    assert.match(markdown, /collect_current_completed_task_or_confirm_scope_gap/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('uses accepted runtime task alignment review evidence to close refresh package review blockers in operator handoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-runtime-review-evidence-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const runtimeTaskAlignmentRefreshPackagePath = path.join(root, 'runtime-task-alignment-refresh-package.json')
  const runtimeTaskAlignmentReviewEvidencePath = path.join(root, 'runtime-task-alignment-review-evidence.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(runtimeTaskAlignmentRefreshPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-task-alignment-refresh-package/v1',
    status: 'runtime_task_alignment_refresh_review_required',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    preparedBy: 'release-operator-1',
    summary: {
      inputCandidateRowCount: 18,
      inputRuntimeTaskCount: 16,
      actionCount: 2,
      stableCodeRefreshReviewActionCount: 1,
      missingRuntimeTaskActionCount: 1,
      actualDateRangeCollectionActionCount: 1,
      collisionReviewActionCount: 1,
    },
    actions: [
      {
        stableCode: 'BTMP-SCH-02',
        candidateTitle: '教学楼二次结构与普通教室粗装修',
        runtimeTaskId: 'runtime-task-2',
        runtimeTitle: '实验室通风与专业机电安装',
        actionKind: 'review_runtime_task_stable_code_refresh',
        proposedStableCode: 'BTMP-SCH-03',
        blockers: [
          'human_project_manager_review_required',
          'runtime_stable_code_collision_review_required',
        ],
      },
      {
        stableCode: 'BTMP-SCH-05',
        candidateTitle: '操场道路与校园室外配套',
        runtimeTaskId: '',
        runtimeTitle: '',
        actionKind: 'collect_current_completed_task_or_confirm_scope_gap',
        proposedStableCode: 'BTMP-SCH-05',
        blockers: [
          'current_completed_task_evidence_required',
          'human_project_manager_review_required',
        ],
      },
    ],
    blockers: ['runtime_task_alignment_operator_review_required'],
    executionControl: {
      executeAllowed: false,
      recommendedMode: 'operator_review_only',
    },
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  })
  await writeJson(runtimeTaskAlignmentReviewEvidencePath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-task-alignment-review-evidence/v1',
    status: 'accepted_for_runtime_alignment_review',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    reviewedBy: 'pm-reviewer-1',
    reviewNotes: 'Runtime task alignment actions reviewed for evidence chain only.',
    summary: {
      actionCount: 2,
      reviewedActionCount: 2,
      acceptedStableCodeRefreshCount: 1,
      confirmedScopeGapCount: 1,
      collisionReviewedCount: 1,
      rejectedActionCount: 0,
    },
    blockers: [],
    executionControl: {
      executeAllowed: false,
      reason: 'review_evidence_only_no_automatic_runtime_task_update',
    },
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      runtimeTaskAlignmentRefreshPackage: runtimeTaskAlignmentRefreshPackagePath,
      runtimeTaskAlignmentReviewEvidence: runtimeTaskAlignmentReviewEvidencePath,
      output: outputPath,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      publicationKey: 'default-master-plan-runtime-publication-1',
      now: new Date('2026-07-07T02:20:00.000Z'),
    })

    assert.equal(handoff.runtimeTaskAlignmentReviewEvidence.status, 'accepted_for_runtime_alignment_review')
    assert.equal(handoff.runtimeTaskAlignmentReviewEvidence.reviewedActionCount, 2)
    assert.equal(handoff.runtimeTaskAlignmentReviewEvidence.acceptedStableCodeRefreshCount, 1)
    assert.equal(handoff.runtimeTaskAlignmentReviewEvidence.confirmedScopeGapCount, 1)
    assert.equal(
      handoff.currentBlockers.includes('runtime_task_alignment_refresh_package_runtime_task_alignment_operator_review_required'),
      false,
    )
    assert.equal(
      handoff.currentBlockers.includes('runtime_task_alignment_refresh_package_execute_not_allowed'),
      false,
    )
    assert.equal(
      handoff.currentBlockers.includes('runtime_task_alignment_review_evidence_status_blocked'),
      false,
    )

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Runtime Task Alignment Review Evidence/)
    assert.match(markdown, /accepted_for_runtime_alignment_review/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('surfaces runtime seed evidence pipeline blockers and rerun action in operator handoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-runtime-seed-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const runtimeSeedEvidencePipelinePath = path.join(root, 'runtime-seed-evidence-pipeline.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    gates: [
      ...readinessFixture().gates,
      { id: 'runtime_seed_and_reference_days_evidence', status: 'blocked' },
    ],
  })
  await writeJson(runtimeSeedEvidencePipelinePath, runtimeSeedEvidencePipelineFixture({
    status: 'runtime_seed_import_blocked',
    blockers: [
      'runtime_reference_days_evidence_missing',
      'local_supabase_endpoint_unreachable',
      'local_duration_asset_seed_import_unlock_required',
    ],
    summary: {
      preflight: {
        readyBusinessTypeCount: 0,
        missingBusinessTypeCount: 10,
        requiredRuntimeSeedStableCodeCount: 19,
        runtimeReferenceDays: {
          readyBusinessTypeCount: 0,
          missingBusinessTypeCount: 10,
          missingBusinessTypes: ['school'],
          requiredRuntimeReferenceStableCodes: ['BTMP-SCH-01', 'BTMP-SCH-02'],
          requiredRuntimeReferenceStableCodeCount: 2,
          evidenceLevelRequired: 'runtime_calibrated_l2',
        },
      },
      coverage: {
        requiredStableCodeCount: 19,
        coveredStableCodeCount: 19,
        missingStableCodeCount: 0,
        missingStableCodes: [],
      },
      environment: {
        status: 'blocked',
        targetClass: 'local_supabase',
        localSupabaseReachable: false,
        environmentBlockers: [
          'local_supabase_endpoint_unreachable',
        ],
        repairPlan: {
          status: 'blocked',
          targetClass: 'local_supabase',
          noAutoInstall: true,
          requiredStepIds: ['start_local_supabase'],
          blockedStepIds: ['rerun_runtime_seed_pipeline'],
          orderedStepCount: 2,
          orderedSteps: [
            {
              id: 'start_local_supabase',
              status: 'required',
              blockerCodes: ['local_supabase_endpoint_unreachable'],
              commands: ['supabase start'],
              verificationCommands: ['npm.cmd run evidence:default-master-plan:runtime-seed-env'],
            },
            {
              id: 'rerun_runtime_seed_pipeline',
              status: 'blocked_by_previous_steps',
              blockerCodes: ['local_supabase_endpoint_unreachable'],
              commands: ['npm.cmd run evidence:default-master-plan:runtime-seed-pipeline'],
              verificationCommands: ['npm.cmd run evidence:default-master-plan:runtime-seed-pipeline'],
            },
          ],
        },
      },
      importGate: {
        status: 'runtime_seed_import_blocked',
        importRequired: true,
        runtimeSeedEvidenceAlreadyReady: false,
        importMode: 'local_active_seed_smoke_import',
        blockers: [
          'local_supabase_endpoint_unreachable',
          'local_duration_asset_seed_import_unlock_required',
        ],
      },
    },
  }))

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      runtimeSeedEvidencePipeline: runtimeSeedEvidencePipelinePath,
      output: outputPath,
      now: new Date('2026-07-06T03:00:00.000Z'),
    })

    assert.equal(handoff.runtimeSeedEvidencePipeline.status, 'runtime_seed_import_blocked')
    assert.equal(handoff.runtimeSeedEvidencePipeline.runtimeSeed.missingBusinessTypeCount, 10)
    assert.equal(handoff.runtimeSeedEvidencePipeline.runtimeReferenceDays.missingBusinessTypeCount, 10)
    assert.equal(handoff.runtimeSeedEvidencePipeline.environment.repairPlan.status, 'blocked')
    assert.deepEqual(handoff.runtimeSeedEvidencePipeline.environment.repairPlan.requiredStepIds, ['start_local_supabase'])
    assert.deepEqual(handoff.runtimeSeedEvidencePipeline.environment.repairPlan.orderedSteps.map((step) => step.id), [
      'start_local_supabase',
      'rerun_runtime_seed_pipeline',
    ])
    assert.deepEqual(handoff.runtimeSeedEvidencePipeline.runtimeReferenceDays.requiredRuntimeReferenceStableCodes, [
      'BTMP-SCH-01',
      'BTMP-SCH-02',
    ])
    assert.equal(handoff.currentBlockers.includes('runtime_seed_pipeline_runtime_reference_days_evidence_missing'), false)
    assert.equal(handoff.currentBlockers.includes('runtime_seed_pipeline_local_supabase_endpoint_unreachable'), true)
    assert.equal(handoff.currentBlockers.includes('runtime_seed_and_reference_days_evidence'), true)
    assert.equal(
      handoff.deferredCurrentBlockers.runtimeSeedImportDependent.blockers.includes('runtime_seed_pipeline_runtime_reference_days_evidence_missing'),
      true,
    )
    assert.equal(
      handoff.deferredCurrentBlockers.runtimeSeedImportDependent.blockers.includes('runtime_seed_pipeline_runtime_seed_business_type_evidence_missing'),
      true,
    )
    assert.equal(
      handoff.deferredCurrentBlockers.runtimeSeedImportDependent.blockers.includes('runtime_seed_pipeline_local_supabase_endpoint_unreachable'),
      false,
    )
    const action = handoff.actionSequence.find((entry) => entry.id === 'runtime_seed_evidence_pipeline')
    assert.ok(action)
    assert.match(action.command, /evidence:default-master-plan:runtime-seed-pipeline/)
    assert.match(action.command, /--output .*runtime-seed-evidence-pipeline\.json/)
    assert.equal(action.repairPlan.status, 'blocked')
    assert.deepEqual(action.repairPlan.requiredStepIds, ['start_local_supabase'])
    assert.deepEqual(action.repairPlan.orderedSteps.map((step) => step.id), [
      'start_local_supabase',
      'rerun_runtime_seed_pipeline',
    ])
    assert.match(action.noWriteBoundary, /does not write algorithm seed/)
    assert.match(
      handoff.actionSequence.find((entry) => entry.id === 'readiness_check')?.command ?? '',
      /--runtime-seed-evidence-pipeline .*runtime-seed-evidence-pipeline\.json/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('surfaces runtime seed import execution blockers and dry-run action in operator handoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-runtime-seed-import-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const runtimeSeedImportExecutionPath = path.join(root, 'runtime-seed-import-execution.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    gates: [
      ...readinessFixture().gates,
      { id: 'runtime_seed_and_reference_days_evidence', status: 'blocked' },
    ],
  })
  await writeJson(runtimeSeedImportExecutionPath, runtimeSeedImportExecutionFixture({
    status: 'runtime_seed_import_execution_blocked',
    importGate: {
      status: 'runtime_seed_import_blocked',
      importAllowed: false,
      importMode: 'local_active_seed_smoke_import',
      blockers: [
        'local_supabase_endpoint_unreachable',
        'local_duration_asset_seed_import_unlock_required',
      ],
      manualActions: [
        'start local Supabase and rerun runtime seed environment evidence',
        'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT=1',
      ],
    },
    postImportVerification: {
      provided: true,
      status: 'runtime_seed_post_import_blocked',
      verified: false,
      activeStandardWorkDurationSeedReady: false,
      activeT2RhythmTemplateReady: false,
      blockers: [
        'runtime_seed_post_import_profile_rows_not_all_runtime',
        'runtime_t2_post_import_profile_rows_not_all_runtime',
      ],
      runtimeSeedEvidence: {
        profileRowCount: 60,
        runtimeSeedRowCount: 0,
        fallbackOrMissingSeedRowCount: 60,
        allProfileRowsRuntime: false,
      },
      runtimeT2Evidence: {
        profileRowCount: 60,
        runtimeT2RowCount: 0,
        fallbackOrMissingT2RowCount: 60,
        allProfileT2RowsRuntime: false,
      },
    },
    blockers: [
      'runtime_seed_import_gate_not_allowed',
      'runtime_seed_import_execution_allow_import_required',
      'runtime_seed_import_seed_smoke_user_id_required',
    ],
    nextActions: [
      'rerun runtime seed evidence pipeline until import gate is allowed',
      'rerun with --allow-import only after reviewing runtime-seed-import-gate.json',
    ],
  }))

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      runtimeSeedImportExecution: runtimeSeedImportExecutionPath,
      output: outputPath,
      now: new Date('2026-07-06T08:45:00.000Z'),
    })

    assert.equal(handoff.runtimeSeedImportExecution.status, 'runtime_seed_import_execution_blocked')
    assert.equal(handoff.runtimeSeedImportExecution.importGate.status, 'runtime_seed_import_blocked')
    assert.equal(handoff.runtimeSeedImportExecution.importGate.importAllowed, false)
    assert.equal(handoff.runtimeSeedImportExecution.postImportVerification.status, 'runtime_seed_post_import_blocked')
    assert.equal(handoff.runtimeSeedImportExecution.postImportVerification.activeStandardWorkDurationSeedReady, false)
    assert.equal(handoff.runtimeSeedImportExecution.postImportVerification.activeT2RhythmTemplateReady, false)
    assert.equal(handoff.runtimeSeedImportExecution.postImportVerification.runtimeSeedEvidence.fallbackOrMissingSeedRowCount, 60)
    assert.equal(handoff.runtimeSeedImportExecution.postImportVerification.runtimeT2Evidence.fallbackOrMissingT2RowCount, 60)
    assert.deepEqual(handoff.runtimeSeedImportExecution.nextActions, [
      'rerun runtime seed evidence pipeline until import gate is allowed',
      'rerun with --allow-import only after reviewing runtime-seed-import-gate.json',
    ])
    assert.equal(handoff.currentBlockers.includes('runtime_seed_import_execution_status_runtime_seed_import_execution_blocked'), true)
    assert.equal(handoff.currentBlockers.includes('runtime_seed_import_execution_local_supabase_endpoint_unreachable'), true)
    assert.equal(handoff.currentBlockers.includes('runtime_seed_import_execution_runtime_seed_post_import_profile_rows_not_all_runtime'), false)
    assert.equal(
      handoff.deferredCurrentBlockers.runtimeSeedImportDependent.blockers.includes('runtime_seed_import_execution_runtime_seed_post_import_profile_rows_not_all_runtime'),
      true,
    )
    assert.equal(
      handoff.deferredCurrentBlockers.runtimeSeedImportDependent.blockers.includes('runtime_seed_import_execution_active_standard_work_seed_not_ready'),
      true,
    )
    assert.equal(
      handoff.deferredCurrentBlockers.runtimeSeedImportDependent.blockers.includes('runtime_seed_import_execution_local_supabase_endpoint_unreachable'),
      false,
    )
    const readinessSealAction = handoff.actionSequence.find((entry) => entry.id === 'runtime_seed_import_readiness_seal')
    assert.ok(readinessSealAction)
    assert.match(readinessSealAction.command, /check-default-master-plan-runtime-seed-import-readiness\.mjs/)
    assert.match(readinessSealAction.command, /--import-gate .*runtime-seed-import-gate\.json/)
    assert.match(readinessSealAction.command, /--execution .*runtime-seed-import-execution\.json/)
    assert.match(readinessSealAction.command, /--output .*runtime-seed-import-readiness-seal\.json/)
    assert.doesNotMatch(readinessSealAction.command, /--allow-import/)
    assert.match(readinessSealAction.noWriteBoundary, /does not connect to the database/)
    const action = handoff.actionSequence.find((entry) => entry.id === 'runtime_seed_import_execution')
    assert.ok(action)
    assert.match(action.command, /evidence:default-master-plan:runtime-seed-import-execution/)
    assert.match(action.command, /--output .*runtime-seed-import-execution\.json/)
    assert.doesNotMatch(action.command, /--allow-import/)
    assert.match(action.noWriteBoundary, /Default command writes execution evidence only/)
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /runtimeSeedImportExecution/)
    assert.match(markdown, /runtime_seed_import_execution_blocked/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('carries blocked duration calibration evidence into operator handoff blockers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const durationCalibrationEvidencePath = path.join(root, 'duration-calibration-evidence.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(durationCalibrationEvidencePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-calibration-evidence/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    status: 'blocked',
    evidenceLevel: 'candidate_asset_backed_l1',
    blockers: [
      'accepted_real_duration_samples_required',
      'real_duration_sample_must_not_be_staging_controlled_replay',
    ],
    mutationBoundary: {
      writesProductionTables: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      durationCalibrationEvidence: durationCalibrationEvidencePath,
      output: outputPath,
      now: new Date('2026-07-02T04:31:00.000Z'),
    })

    assert.equal(handoff.durationCalibrationEvidence.status, 'blocked')
    assert.deepEqual(handoff.durationCalibrationEvidence.blockers, [
      'accepted_real_duration_samples_required',
      'real_duration_sample_must_not_be_staging_controlled_replay',
    ])
    assert.equal(handoff.currentBlockers.includes('accepted_real_duration_samples_required'), true)
    assert.equal(handoff.currentBlockers.includes('real_duration_sample_must_not_be_staging_controlled_replay'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not duplicate collection package upstream blockers from duration calibration evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const durationCalibrationEvidencePath = path.join(root, 'duration-calibration-evidence.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(durationCalibrationEvidencePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-calibration-evidence/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    status: 'blocked',
    evidenceLevel: 'candidate_asset_backed_l1',
    blockers: [
      'accepted_real_duration_samples_required',
      'duration_sample_collection_package_duration_asset_utilization_report_active_standard_work_duration_seed_missing_for_some_rows',
      'duration_sample_collection_package_runtime_seed_post_import_verification_not_verified',
    ],
    mutationBoundary: {
      writesProductionTables: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      durationCalibrationEvidence: durationCalibrationEvidencePath,
      output: outputPath,
      now: new Date('2026-07-06T09:12:00.000Z'),
    })

    assert.equal(handoff.durationCalibrationEvidence.status, 'blocked')
    assert.deepEqual(handoff.durationCalibrationEvidence.blockers, [
      'accepted_real_duration_samples_required',
    ])
    assert.equal(handoff.currentBlockers.includes('accepted_real_duration_samples_required'), true)
    assert.equal(
      handoff.currentBlockers.includes('duration_sample_collection_package_duration_asset_utilization_report_active_standard_work_duration_seed_missing_for_some_rows'),
      false,
    )
    assert.equal(
      handoff.currentBlockers.includes('duration_sample_collection_package_runtime_seed_post_import_verification_not_verified'),
      false,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('discovers default duration calibration evidence from the output report directory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const durationCalibrationEvidencePath = path.join(root, 'duration-calibration-evidence.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    gates: [],
    productionReadinessBlockers: ['real_production_or_live_outcome_evidence_required'],
  })
  await writeJson(durationCalibrationEvidencePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-calibration-evidence/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    status: 'blocked',
    evidenceLevel: 'candidate_asset_backed_l1',
    acceptedRealDurationSampleCount: 0,
    calibratedReferenceDayCount: 0,
    calibrationDeltaCount: 0,
    blockers: [
      'accepted_real_duration_samples_required',
      'duration_sample_coverage_verified_l2_required',
    ],
    mutationBoundary: {
      writesProductionTables: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      output: outputPath,
      now: new Date('2026-07-05T02:25:00.000Z'),
    })

    assert.equal(handoff.durationCalibrationEvidence.status, 'blocked')
    assert.equal(
      handoff.durationCalibrationEvidence.artifact,
      repoRelativeForTest(durationCalibrationEvidencePath),
    )
    assert.deepEqual(handoff.durationCalibrationEvidence.blockers, [
      'accepted_real_duration_samples_required',
      'duration_sample_coverage_verified_l2_required',
    ])
    assert.equal(handoff.currentBlockers.includes('duration_sample_coverage_verified_l2_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('closes duration sample collection blockers in operator handoff when coverage evidence is verified', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const durationSampleCollectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const durationSampleCoverageEvidencePath = path.join(root, 'duration-sample-coverage-evidence.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    gates: [],
    productionReadinessBlockers: ['real_production_or_live_outcome_evidence_required'],
  })
  await writeJson(durationSampleCollectionPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    status: 'samples_required',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    requiredStableCodeCount: 2,
    totalRequiredAcceptedSampleCount: 2,
    blockers: ['accepted_real_duration_samples_required'],
  })
  await writeJson(durationSampleCoverageEvidencePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-coverage-evidence/v1',
    status: 'covered',
    evidenceLevel: 'sample_collection_coverage_verified_l2',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    summary: {
      requiredStableCodeCount: 2,
      coveredStableCodeCount: 2,
      missingStableCodeCount: 0,
      acceptedMatchedSampleCount: 2,
    },
    blockers: [],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      durationSampleCollectionPackage: durationSampleCollectionPackagePath,
      output: outputPath,
      now: new Date('2026-07-02T04:27:45.000Z'),
    })

    assert.equal(handoff.durationSampleCollectionPackage.status, 'samples_required')
    assert.deepEqual(handoff.durationSampleCollectionPackage.rawBlockers, ['accepted_real_duration_samples_required'])
    assert.deepEqual(handoff.durationSampleCollectionPackage.blockers, [])
    assert.equal(handoff.durationSampleCoverageEvidence.status, 'covered')
    assert.equal(handoff.durationSampleCoverageEvidence.coveredStableCodeCount, 2)
    assert.equal(handoff.currentBlockers.includes('accepted_real_duration_samples_required'), false)
    assert.equal(handoff.currentBlockers.includes('real_production_or_live_outcome_evidence_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('uses explicit duration sample coverage evidence path when building operator handoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const durationSampleCollectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const explicitCoverageEvidencePath = path.join(root, 'explicit-coverage', 'accepted-duration-coverage.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    gates: [],
    productionReadinessBlockers: ['real_production_or_live_outcome_evidence_required'],
  })
  await writeJson(durationSampleCollectionPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    status: 'samples_required',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    requiredStableCodeCount: 1,
    totalRequiredAcceptedSampleCount: 1,
    sampleRequests: [
      { stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套', requiredAcceptedSampleCount: 1 },
    ],
    blockers: ['accepted_real_duration_samples_required'],
  })
  await writeJson(explicitCoverageEvidencePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-coverage-evidence/v1',
    status: 'covered',
    evidenceLevel: 'sample_collection_coverage_verified_l2',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    summary: {
      requiredStableCodeCount: 1,
      coveredStableCodeCount: 1,
      missingStableCodeCount: 0,
      acceptedMatchedSampleCount: 1,
    },
    rows: [
      { stableCode: 'BTMP-SCH-05', coverageStatus: 'covered', acceptedSampleIds: ['accepted-sample-1'] },
    ],
    blockers: [],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      durationSampleCollectionPackage: durationSampleCollectionPackagePath,
      durationSampleCoverageEvidence: explicitCoverageEvidencePath,
      output: outputPath,
      now: new Date('2026-07-05T02:00:00.000Z'),
    })

    assert.equal(
      handoff.durationSampleCoverageEvidence.artifact,
      repoRelativeForTest(explicitCoverageEvidencePath),
    )
    assert.equal(handoff.durationSampleCoverageEvidence.verified, true)
    assert.equal(handoff.durationSampleCoverageEvidence.coveredStableCodeCount, 1)
    assert.equal(handoff.currentBlockers.includes('accepted_real_duration_samples_required'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not close duration sample collection blockers when coverage evidence belongs to a stale collection package', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const durationSampleCollectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const durationSampleCoverageEvidencePath = path.join(root, 'duration-sample-coverage-evidence.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    gates: [],
    productionReadinessBlockers: ['real_production_or_live_outcome_evidence_required'],
  })
  await writeJson(durationSampleCollectionPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    status: 'samples_required',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    requiredStableCodeCount: 2,
    totalRequiredAcceptedSampleCount: 2,
    sampleRequests: [
      { stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套', requiredAcceptedSampleCount: 1 },
      { stableCode: 'BTMP-SCH-06', title: '竣工验收与开学移交准备', requiredAcceptedSampleCount: 1 },
    ],
    blockers: ['accepted_real_duration_samples_required'],
  })
  await writeJson(durationSampleCoverageEvidencePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-coverage-evidence/v1',
    status: 'covered',
    evidenceLevel: 'sample_collection_coverage_verified_l2',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    collectionPackageRef: 'duration_sample_collection_package:project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json#sha256=stale',
    summary: {
      requiredStableCodeCount: 2,
      coveredStableCodeCount: 2,
      missingStableCodeCount: 0,
      acceptedMatchedSampleCount: 2,
    },
    rows: [
      { stableCode: 'BTMP-SCH-03', coverageStatus: 'covered', acceptedSampleIds: ['old-sample-1'] },
      { stableCode: 'BTMP-SCH-04', coverageStatus: 'covered', acceptedSampleIds: ['old-sample-2'] },
    ],
    blockers: [],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      durationSampleCollectionPackage: durationSampleCollectionPackagePath,
      output: outputPath,
      now: new Date('2026-07-04T20:10:00.000Z'),
    })

    assert.equal(handoff.durationSampleCoverageEvidence.verified, false)
    assert.equal(
      handoff.durationSampleCoverageEvidence.blockers.includes('duration_sample_coverage_collection_package_ref_mismatch'),
      true,
    )
    assert.equal(
      handoff.durationSampleCoverageEvidence.blockers.includes('duration_sample_coverage_requested_stable_codes_mismatch'),
      true,
    )
    assert.equal(handoff.durationSampleCollectionPackage.blockers.includes('accepted_real_duration_samples_required'), true)
    assert.equal(
      handoff.durationSampleCollectionPackage.blockers.includes('duration_sample_coverage_collection_package_ref_mismatch'),
      true,
    )
    assert.equal(
      handoff.durationSampleCollectionPackage.blockers.includes('duration_sample_coverage_requested_stable_codes_mismatch'),
      true,
    )
    assert.equal(handoff.currentBlockers.includes('accepted_real_duration_samples_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not duplicate collection package upstream blockers from duration sample coverage evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const durationSampleCollectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const durationSampleCoverageEvidencePath = path.join(root, 'duration-sample-coverage-evidence.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    gates: [],
    productionReadinessBlockers: ['real_production_or_live_outcome_evidence_required'],
  })
  await writeJson(durationSampleCollectionPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    status: 'blocked',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    requiredStableCodeCount: 2,
    totalRequiredAcceptedSampleCount: 2,
    sampleRequests: [
      { stableCode: 'BTMP-SCH-01', title: '教学楼主体结构与功能区移交', requiredAcceptedSampleCount: 1 },
      { stableCode: 'BTMP-SCH-02', title: '教学楼二次结构与普通教室粗装修', requiredAcceptedSampleCount: 1 },
    ],
    blockers: [
      'duration_asset_utilization_report_active_standard_work_duration_seed_missing_for_some_rows',
      'accepted_real_duration_samples_required',
    ],
  })
  await writeJson(durationSampleCoverageEvidencePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-coverage-evidence/v1',
    status: 'blocked',
    evidenceLevel: 'sample_collection_coverage_blocked_l1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    summary: {
      requiredStableCodeCount: 2,
      coveredStableCodeCount: 0,
      missingStableCodeCount: 2,
      acceptedMatchedSampleCount: 0,
    },
    rows: [
      { stableCode: 'BTMP-SCH-01', coverageStatus: 'missing_samples', acceptedSampleIds: [] },
      { stableCode: 'BTMP-SCH-02', coverageStatus: 'missing_samples', acceptedSampleIds: [] },
    ],
    blockers: [
      'duration_sample_collection_package_duration_asset_utilization_report_active_standard_work_duration_seed_missing_for_some_rows',
      'accepted_real_duration_sample_coverage_incomplete',
    ],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      durationSampleCollectionPackage: durationSampleCollectionPackagePath,
      output: outputPath,
      now: new Date('2026-07-06T09:40:00.000Z'),
    })

    assert.equal(
      handoff.durationSampleCoverageEvidence.blockers.includes('duration_sample_collection_package_duration_asset_utilization_report_active_standard_work_duration_seed_missing_for_some_rows'),
      false,
    )
    assert.equal(
      handoff.durationSampleCoverageEvidence.blockers.includes('accepted_real_duration_sample_coverage_incomplete'),
      true,
    )
    assert.equal(
      handoff.durationSampleCollectionPackage.blockers.includes('duration_asset_utilization_report_active_standard_work_duration_seed_missing_for_some_rows'),
      true,
    )
    assert.equal(
      handoff.currentBlockers.includes('duration_sample_collection_package_duration_asset_utilization_report_active_standard_work_duration_seed_missing_for_some_rows'),
      false,
    )
    assert.equal(
      handoff.currentBlockers.includes('duration_asset_utilization_report_active_standard_work_duration_seed_missing_for_some_rows'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('summarizes invalid duration sample blockers in operator handoff for actionable follow-up', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const durationSampleCollectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const durationSampleCoverageEvidencePath = path.join(root, 'duration-sample-coverage-evidence.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, {
    ...readinessFixture(),
    gates: [],
    productionReadinessBlockers: ['real_production_or_live_outcome_evidence_required'],
  })
  await writeJson(durationSampleCollectionPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    status: 'samples_required',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    requiredStableCodeCount: 2,
    totalRequiredAcceptedSampleCount: 2,
    sampleRequests: [
      { stableCode: 'BTMP-SCH-01', title: '教学楼主体结构与功能区移交', requiredAcceptedSampleCount: 1 },
      { stableCode: 'BTMP-SCH-02', title: '教学楼二次结构与普通教室粗装修', requiredAcceptedSampleCount: 1 },
    ],
    blockers: ['accepted_real_duration_samples_required'],
  })
  await writeJson(durationSampleCoverageEvidencePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-coverage-evidence/v1',
    status: 'blocked',
    evidenceLevel: 'sample_collection_coverage_blocked_l1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    summary: {
      requiredStableCodeCount: 2,
      coveredStableCodeCount: 0,
      missingStableCodeCount: 2,
      acceptedMatchedSampleCount: 0,
      invalidSampleCount: 2,
    },
    rows: [
      { stableCode: 'BTMP-SCH-01', coverageStatus: 'missing_samples', acceptedSampleIds: [] },
      { stableCode: 'BTMP-SCH-02', coverageStatus: 'missing_samples', acceptedSampleIds: [] },
    ],
    invalidSamples: [
      {
        id: 'sample-staging-1',
        stableCode: 'BTMP-SCH-01',
        title: 'staging replay sample',
        blockers: [
          'real_duration_sample_must_not_be_staging_controlled_replay',
          'real_duration_sample_source_must_not_be_staging_runtime_writer',
        ],
      },
      {
        id: 'sample-not-real-1',
        stableCode: 'BTMP-SCH-02',
        title: 'not real production outcome',
        blockers: [
          'real_duration_sample_must_not_be_marked_not_real_production_outcome',
          'real_duration_sample_source_must_not_be_staging_runtime_writer',
        ],
      },
    ],
    blockers: [
      'invalid_duration_samples_present',
      'accepted_real_duration_sample_coverage_incomplete',
    ],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      durationSampleCollectionPackage: durationSampleCollectionPackagePath,
      output: outputPath,
      now: new Date('2026-07-05T02:15:00.000Z'),
    })

    assert.equal(handoff.durationSampleCoverageEvidence.invalidSampleCount, 2)
    assert.deepEqual(handoff.durationSampleCoverageEvidence.invalidSampleBlockerCounts, {
      real_duration_sample_source_must_not_be_staging_runtime_writer: 2,
      real_duration_sample_must_not_be_staging_controlled_replay: 1,
      real_duration_sample_must_not_be_marked_not_real_production_outcome: 1,
    })
    assert.deepEqual(handoff.durationSampleCoverageEvidence.invalidSampleExamples, [
      {
        id: 'sample-staging-1',
        stableCode: 'BTMP-SCH-01',
        title: 'staging replay sample',
        blockers: [
          'real_duration_sample_must_not_be_staging_controlled_replay',
          'real_duration_sample_source_must_not_be_staging_runtime_writer',
        ],
      },
      {
        id: 'sample-not-real-1',
        stableCode: 'BTMP-SCH-02',
        title: 'not real production outcome',
        blockers: [
          'real_duration_sample_must_not_be_marked_not_real_production_outcome',
          'real_duration_sample_source_must_not_be_staging_runtime_writer',
        ],
      },
    ])
    assert.equal(handoff.currentBlockers.includes('invalid_duration_samples_present'), true)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Invalid Duration Samples/)
    assert.match(markdown, /invalidSampleCount: 2/)
    assert.match(markdown, /real_duration_sample_source_must_not_be_staging_runtime_writer: 2/)
    assert.match(markdown, /sample-staging-1/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks operator handoff when existing duration sample collection package hides retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const durationSampleCollectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(durationSampleCollectionPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    status: 'covered',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    requiredStableCodeCount: 0,
    totalRequiredAcceptedSampleCount: 0,
    blockers: [],
    boundaryPolicy: {
      fallbackApplied: 'legacy_template_reverse_inference',
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      durationSampleCollectionPackage: durationSampleCollectionPackagePath,
      output: outputPath,
      now: new Date('2026-07-02T04:28:30.000Z'),
    })

    assert.equal(
      handoff.durationSampleCollectionPackage.blockers.includes('duration_sample_collection_package_retired_or_low_information_default_master_plan_source'),
      true,
    )
    assert.equal(
      handoff.currentBlockers.includes('duration_sample_collection_package_retired_or_low_information_default_master_plan_source'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reports an existing runtime material package status in operator handoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(runtimeMaterialPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-material-package/v1',
    status: 'runtime_materials_required',
    requiredMaterialCount: 6,
    blockers: ['runtime_materials_required'],
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      output: outputPath,
      now: new Date('2026-07-02T04:28:00.000Z'),
    })

    assert.equal(handoff.runtimeMaterialPackage.status, 'runtime_materials_required')
    assert.equal(handoff.runtimeMaterialPackage.requiredMaterialCount, 6)
    assert.deepEqual(handoff.runtimeMaterialPackage.blockers, ['runtime_materials_required'])
    assert.equal(handoff.runtimeMaterialPackage.artifact.endsWith('runtime-material-package.json'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks operator handoff when existing runtime material package hides retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const runtimeMaterialPackagePath = path.join(root, 'runtime-material-package.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(runtimeMaterialPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-material-package/v1',
    status: 'runtime_materials_resolved',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    requiredMaterialCount: 0,
    blockers: [],
    reviewProof: {
      sourceKind: 'manual_comparison_scenario',
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      runtimeMaterialPackage: runtimeMaterialPackagePath,
      output: outputPath,
      now: new Date('2026-07-02T04:29:30.000Z'),
    })

    assert.equal(
      handoff.runtimeMaterialPackage.blockers.includes('runtime_material_package_retired_or_low_information_default_master_plan_source'),
      true,
    )
    assert.equal(
      handoff.currentBlockers.includes('runtime_material_package_retired_or_low_information_default_master_plan_source'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks operator handoff when existing real production outcome package hides retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-handoff-'))
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const readinessPath = path.join(root, 'readiness.json')
  const realProductionOutcomePackagePath = path.join(root, 'real-production-outcome-package.json')
  const outputPath = path.join(root, 'operator-handoff.json')

  await writeJson(candidateBaselinePath, candidateBaselineFixture())
  await writeJson(readinessPath, readinessFixture())
  await writeJson(realProductionOutcomePackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-real-production-outcome-package/v1',
    status: 'real_production_outcome_required',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    targetEnvironment: 'production',
    blockers: [],
    boundaryPolicy: {
      sourceKind: 'legacy_template_reverse_inference',
    },
  })

  try {
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff({
      candidateBaseline: candidateBaselinePath,
      readiness: readinessPath,
      realProductionOutcomePackage: realProductionOutcomePackagePath,
      output: outputPath,
      now: new Date('2026-07-02T04:30:30.000Z'),
    })

    assert.equal(
      handoff.realProductionOutcomePackage.blockers.includes('real_production_outcome_package_retired_or_low_information_default_master_plan_source'),
      true,
    )
    assert.equal(
      handoff.currentBlockers.includes('real_production_outcome_package_retired_or_low_information_default_master_plan_source'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function candidateBaselineFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    rowCount: 2,
    quality: {
      rowsMissingReferenceDuration: 0,
      rowsWritingTasks: 0,
      rowsWritingTaskDependencies: 0,
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
  }
}

function durationGapFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-gap-plan/v1',
    status: 'blocked',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    summary: {
      candidateRowCount: 2,
      coveredStableCodeCount: 1,
      missingStableCodeCount: 1,
      invalidSampleCount: 0,
    },
    blockers: [
      'duration_samples_export_required',
      'duration_sample_coverage_incomplete',
    ],
  }
}

function discoveryFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-production-candidate-discovery/v1',
    status: 'candidates_found',
    recommendedCandidate: {
      baselineId: 'baseline-1',
      projectId: 'project-1',
      evidenceReadiness: {
        blockers: [
          'candidate_default_master_plan_review_missing',
          'accepted_duration_experience_samples_missing',
          'construction_organization_task_dependencies_missing',
          'runtime_publication_missing',
        ],
      },
    },
    nextAction: {
      sourceExportCommand: [
        'node',
        'project-testing/tools/export-default-master-plan-production-sources.mjs',
        '--baseline-id',
        'baseline-1',
        '--project-id',
        'project-1',
        '--publication-key',
        '<publication-key>',
      ],
    },
  }
}

function readinessFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-production-readiness/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    currentEvidenceLevel: 'candidate_cold_start_l1',
    requiredEvidenceLevel: 'runtime_published_project_manager_accepted',
    gates: [
      { id: 'legacy_serial_template_path_removed', status: 'pass' },
      { id: 'candidate_master_plan_shape_11_business_types', status: 'pass' },
      { id: 'project_manager_review_evidence', status: 'blocked' },
      { id: 'runtime_duration_calibration_evidence', status: 'blocked' },
      { id: 'production_dependency_writer_evidence', status: 'blocked' },
      { id: 'runtime_publication_evidence', status: 'blocked' },
      { id: 'post_publish_smoke_and_rollback_evidence', status: 'blocked' },
      { id: 'runtime_evidence_lineage_consistency', status: 'blocked' },
    ],
  }
}

function runtimeSeedEvidencePipelineFixture(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-evidence-pipeline/v1',
    source: 'run-default-master-plan-runtime-seed-evidence-pipeline',
    generatedAt: '2026-07-06T03:00:00.000Z',
    status: 'runtime_seed_import_not_required',
    blockers: [],
    summary: {
      preflight: {
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
      },
      coverage: {
        requiredStableCodeCount: 48,
        coveredStableCodeCount: 48,
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

function runtimeSeedImportExecutionFixture(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-execution/v1',
    source: 'run-default-master-plan-runtime-seed-import-execution',
    generatedAt: '2026-07-06T08:45:00.000Z',
    status: 'runtime_seed_import_execution_completed',
    importGate: {
      status: 'runtime_seed_import_allowed',
      importAllowed: true,
      importMode: 'local_active_seed_smoke_import',
      blockers: [],
      manualActions: [],
    },
    postImportVerification: {
      provided: true,
      status: 'runtime_seed_post_import_verified',
      verified: true,
      activeStandardWorkDurationSeedReady: true,
      activeT2RhythmTemplateReady: true,
      blockers: [],
      runtimeSeedEvidence: {
        profileRowCount: 60,
        runtimeSeedRowCount: 60,
        fallbackOrMissingSeedRowCount: 0,
        allProfileRowsRuntime: true,
      },
      runtimeT2Evidence: {
        profileRowCount: 60,
        runtimeT2RowCount: 60,
        fallbackOrMissingT2RowCount: 0,
        allProfileT2RowsRuntime: true,
      },
    },
    blockers: [],
    nextActions: [],
    productionReady: false,
    mutationBoundary: {
      writesEvidenceReportsOnly: true,
      executesRuntimeSeedImport: false,
      writesProductionTablesOutsideAlgorithmSeedImport: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesBaselines: false,
    },
    ...overrides,
  }
}

function evidenceBundleFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-production-evidence-bundle/v1',
    status: 'blocked',
    productionReady: false,
    missingEvidenceTypes: [
      'reviewEvidence',
      'durationCalibrationEvidence',
      'dependencyWriterEvidence',
      'runtimePublicationEvidence',
      'postPublishSmokeRollbackEvidence',
    ],
    nextEvidenceActions: [],
  }
}

function sourceManifestFixture(sourceManifestPath) {
  const sourceExports = {
    reviewExport: {
      path: path.join(path.dirname(sourceManifestPath), 'candidate-default-master-plan-review-export.json'),
    },
    durationSamples: {
      path: path.join(path.dirname(sourceManifestPath), 'duration-experience-samples-export.json'),
    },
    writerResult: {
      path: path.join(path.dirname(sourceManifestPath), 'dependency-writer-result-export.json'),
      sourcePath: path.join(path.dirname(sourceManifestPath), '..', 'staging-runtime', 'dependency-writer-result.json'),
    },
    taskDependencies: {
      path: path.join(path.dirname(sourceManifestPath), 'task-dependencies-export.json'),
    },
    runtimePublications: {
      path: path.join(path.dirname(sourceManifestPath), 'wbs-template-runtime-publications-export.json'),
    },
    apiReadSmoke: {
      path: path.join(path.dirname(sourceManifestPath), 'api-read-smoke-export.json'),
      sourcePath: path.join(path.dirname(sourceManifestPath), '..', 'staging-runtime', 'api-read-smoke.json'),
    },
    uiConsumptionSmoke: {
      path: path.join(path.dirname(sourceManifestPath), 'ui-consumption-smoke-export.json'),
      sourcePath: path.join(path.dirname(sourceManifestPath), '..', 'staging-runtime', 'ui-consumption-smoke.json'),
    },
    criticalPathReadback: {
      path: path.join(path.dirname(sourceManifestPath), 'critical-path-readback-export.json'),
      sourcePath: path.join(path.dirname(sourceManifestPath), '..', 'staging-runtime', 'critical-path-readback.json'),
    },
    rollbackVerification: {
      path: path.join(path.dirname(sourceManifestPath), 'rollback-verification-export.json'),
      sourcePath: path.join(path.dirname(sourceManifestPath), '..', 'staging-runtime', 'rollback-verification.json'),
    },
  }
  return {
    schemaVersion: 'workbuddy-default-master-plan-production-source-exports/v1',
    status: 'exported',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    environment: 'staging',
    exportedBy: 'release-user-1',
    sourceExports,
    pipelineArgs: [
      'node',
      'project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs',
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--publication-key',
      'default-master-plan-runtime-publication-1',
      '--source-manifest',
      sourceManifestPath,
      '--review-export',
      sourceExports.reviewExport.path,
      '--duration-samples',
      sourceExports.durationSamples.path,
      '--writer-result',
      sourceExports.writerResult.path,
      '--task-dependencies',
      sourceExports.taskDependencies.path,
      '--runtime-publications',
      sourceExports.runtimePublications.path,
      '--api-read-smoke',
      sourceExports.apiReadSmoke.path,
      '--ui-consumption-smoke',
      sourceExports.uiConsumptionSmoke.path,
      '--critical-path-readback',
      sourceExports.criticalPathReadback.path,
      '--rollback-verification',
      sourceExports.rollbackVerification.path,
    ],
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
