import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import {
  checkDefaultMasterPlanOperatorHandoffPreflight,
} from './check-default-master-plan-operator-handoff-preflight.mjs'

const execFileAsync = promisify(execFile)

test('blocks operator handoff execution when commands still contain placeholders and gates are blocked', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    publicationKey: '<publication-key>',
    currentBlockers: ['duration_samples_export_required', 'runtime_publication_evidence'],
    actionSequence: [
      {
        id: 'source_export_collect',
        command: 'npm run evidence:default-master-plan:export-sources -- --publication-key <publication-key> --writer-result <dependency-writer-result.json>',
      },
      {
        id: 'readiness_check',
        command: 'node project-testing/tools/check-default-master-plan-production-readiness.mjs <five-evidence-args>',
      },
      {
        id: 'legacy_untracked_operator_note',
        command: 'echo operator-note',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:30:00.000Z'),
    })

    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-operator-handoff-preflight/v1')
    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunSourceExport, false)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
    assert.equal(report.blockers.includes('handoff_contains_placeholders'), true)
    assert.equal(report.blockers.includes('handoff_current_blockers_not_empty'), true)
    assert.equal(report.placeholderFindings.length, 3)
    assert.equal(report.placeholderFindings[0].actionId, 'source_export_collect')
    assert.equal(report.actionCount, report.actionReadiness.actions.length)
    assert.equal(report.actionReadiness.actions.some((action) => action.actionId === 'legacy_untracked_operator_note'), false)
    assert.deepEqual(report.runnableActionIds, report.actionReadiness.runnableActionIds)
    assert.deepEqual(report.blockedActionIds, report.actionReadiness.blockedActionIds)
    assert.deepEqual(report.deferredActionIds, report.actionReadiness.deferredActionIds)
    assert.deepEqual(report.blockedActionDetails, report.actionReadiness.blockedActionDetails)
    assert.equal(report.mutationBoundary.writesProductionTables, false)
    assert.equal(report.mutationBoundary.invokesRuntimeWriters, false)

    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(written.status, 'blocked')
    assert.deepEqual(written.runnableActionIds, report.actionReadiness.runnableActionIds)
    assert.deepEqual(written.blockedActionIds, report.actionReadiness.blockedActionIds)
    assert.deepEqual(written.deferredActionIds, report.actionReadiness.deferredActionIds)
    assert.deepEqual(written.blockedActionDetails, report.actionReadiness.blockedActionDetails)
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /handoff_contains_placeholders/)
    assert.match(markdown, /source_export_collect/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks duration sample collection package command without handoff identity flags', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-duration-identity-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    currentBlockers: [],
    actionSequence: [
      {
        id: 'duration_sample_collection_package',
        gate: 'runtime_duration_calibration_evidence',
        command: 'npm run evidence:default-master-plan:duration-sample-package -- --duration-gap-plan duration-gap.json --profile-report profile.json --duration-asset-utilization-report duration-assets.json --profile-scope all --profile-only --output duration-sample-collection-package.json --environment staging --exported-by release-operator-1',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:31:00.000Z'),
    })

    assert.equal(report.durationSampleCollectionPackageBlockers.includes('duration_sample_collection_package_baseline_id_missing'), true)
    assert.equal(report.durationSampleCollectionPackageBlockers.includes('duration_sample_collection_package_project_id_missing'), true)
    assert.equal(report.mayBuildDurationSampleCollectionPackage, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('passes only when handoff identity is stable, no placeholders remain, and production readiness is complete', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')
  const collectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const sampleMaterialPath = path.join(root, 'real-duration-sample-material.json')
  const materialPreflightPath = path.join(root, 'real-duration-sample-material-preflight.json')
  const collectionKitPath = path.join(root, 'real-duration-sample-collection-kit.json')
  const collectionKitPreflightPath = path.join(root, 'real-duration-sample-collection-kit-preflight.json')
  const rawTasksPath = path.join(root, 'raw-completed-tasks.json')
  const completedTaskExportPath = path.join(root, 'completed-task-export.json')
  const candidateBaselinePath = path.join(root, 'candidate-baseline.json')
  const runtimeCandidateAlignmentPath = path.join(root, 'runtime-candidate-alignment-preflight.json')
  const runtimeTaskAlignmentRefreshPackagePath = path.join(root, 'runtime-task-alignment-refresh-package.json')
  const runtimeTaskAlignmentReviewDecisionsPath = path.join(root, 'runtime-task-alignment-review-decisions.json')
  const runtimeTaskAlignmentReviewEvidencePath = path.join(root, 'runtime-task-alignment-review-evidence.json')

  await writeQualifiedRealProductionOutcome(realProductionOutcome)
  await writeJson(collectionPackagePath, { schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1' })
  await writeReadyRealDurationSampleCollectionKit(collectionKitPath)
  await writeReadyRealDurationSampleCollectionKitPreflight(collectionKitPreflightPath)
  await writeJson(sampleMaterialPath, { schemaVersion: 'workbuddy-real-duration-sample-material/v1', samples: [] })
  await writeJson(rawTasksPath, { schemaVersion: 'workbuddy-default-master-plan-source-export/v1', tasks: [] })
  await writeJson(completedTaskExportPath, { schemaVersion: 'workbuddy-completed-task-export/v1', rows: [] })
  await writeJson(candidateBaselinePath, { schemaVersion: 'workbuddy-candidate-baseline/v1', rows: [] })
  await writeJson(runtimeCandidateAlignmentPath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-candidate-alignment-preflight/v1',
    status: 'pass',
    rows: [],
  })
  await writeJson(runtimeTaskAlignmentRefreshPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-task-alignment-refresh-package/v1',
    status: 'runtime_task_alignment_refresh_not_required',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    summary: { actionCount: 0 },
    actions: [],
    blockers: [],
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  })
  await writeJson(runtimeTaskAlignmentReviewDecisionsPath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-task-alignment-review-decisions/v1',
    decisions: [],
  })
  await writeReadyRealDurationSampleMaterialPreflight(materialPreflightPath, {
    collectionPackagePath,
    sampleMaterialPath,
  })

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'pm_review_package',
        gate: 'project_manager_review_evidence',
        command: 'npm run evidence:default-master-plan:review-package -- --candidate-baseline project-testing/reports/default-master-plan-production-readiness/candidate-baseline.json --output project-testing/reports/default-master-plan-production-readiness/pm-review-package.json --environment production --exported-by release-operator-1',
      },
      {
        id: 'pm_review_record',
        gate: 'project_manager_review_evidence',
        command: 'npm run evidence:default-master-plan:record-review -- --baseline-id baseline-1 --project-id project-1 --reviewed-by human-project-manager-1 --review-notes accepted-for-production-evidence-chain --review-package project-testing/reports/default-master-plan-production-readiness/pm-review-package.json --environment production --exported-by release-operator-1 --mode execute',
      },
      {
        id: 'duration_sample_coverage',
        gate: 'duration_sample_collection_package',
        command: 'npm run evidence:default-master-plan:duration-sample-coverage -- --collection-package project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --samples project-testing/reports/default-master-plan-production-readiness/source-exports/duration-experience-samples-export.json --output project-testing/reports/default-master-plan-production-readiness/duration-sample-coverage-evidence.json',
      },
      {
        id: 'real_duration_sample_material_template',
        gate: 'duration_sample_collection_package',
        command: 'npm run evidence:default-master-plan:real-duration-sample-template -- --collection-package project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --output project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material.template.json --prepared-by release-operator-1',
      },
      {
        id: 'real_duration_sample_collection_kit_preflight',
        gate: 'duration_sample_collection_package',
        command: `node project-testing/tools/check-default-master-plan-real-duration-sample-collection-kit-preflight.mjs --collection-kit ${collectionKitPath} --output ${collectionKitPreflightPath} --checked-by release-operator-1`,
      },
      {
        id: 'real_duration_sample_material_from_collection_kit_preflight',
        gate: 'duration_sample_collection_package',
        command: `node project-testing/tools/build-default-master-plan-real-duration-sample-material-from-collection-kit-preflight.mjs --collection-package ${collectionPackagePath} --collection-kit-preflight ${collectionKitPreflightPath} --output ${sampleMaterialPath} --prepared-by release-operator-1`,
      },
      {
        id: 'completed_task_export',
        gate: 'duration_sample_collection_package',
        command: `npm run evidence:default-master-plan:completed-task-export -- --collection-package ${collectionPackagePath} --raw-tasks ${rawTasksPath} --output ${completedTaskExportPath} --source-name school-production-raw-tasks --evidence-ref raw-task-export:school#sha256=abc123 --operator-review-ref pm-review:completed-tasks-reviewed --exported-by release-operator-1`,
      },
      {
        id: 'runtime_candidate_alignment_preflight',
        gate: 'duration_sample_collection_package',
        command: `npm run evidence:default-master-plan:runtime-candidate-alignment -- --candidate-baseline ${candidateBaselinePath} --raw-tasks ${rawTasksPath} --output ${runtimeCandidateAlignmentPath}`,
      },
      {
        id: 'runtime_task_alignment_refresh_package',
        gate: 'duration_sample_collection_package',
        command: `npm run evidence:default-master-plan:runtime-task-alignment-refresh-package -- --runtime-candidate-alignment-preflight ${runtimeCandidateAlignmentPath} --output ${runtimeTaskAlignmentRefreshPackagePath} --prepared-by release-operator-1`,
      },
      {
        id: 'runtime_task_alignment_review_evidence',
        gate: 'duration_sample_collection_package',
        command: `npm run evidence:default-master-plan:runtime-task-alignment-review-evidence -- --runtime-task-alignment-refresh-package ${runtimeTaskAlignmentRefreshPackagePath} --review-decisions ${runtimeTaskAlignmentReviewDecisionsPath} --output ${runtimeTaskAlignmentReviewEvidencePath} --reviewed-by pm-reviewer-1 --review-notes reviewed-runtime-task-alignment-before-duration-sample-material`,
      },
      {
        id: 'real_duration_sample_material_from_task_export',
        gate: 'duration_sample_collection_package',
        command: `npm run evidence:default-master-plan:real-duration-sample-from-task-export -- --collection-package ${collectionPackagePath} --completed-task-export ${completedTaskExportPath} --output ${sampleMaterialPath} --source-name school-completed-task-export --evidence-ref completed-task-export:school#sha256=abc123 --operator-review-ref pm-review:duration-samples-reviewed --prepared-by release-operator-1`,
      },
      {
        id: 'real_duration_sample_material_preflight',
        gate: 'duration_sample_collection_package',
        command: `npm run evidence:default-master-plan:real-duration-sample-preflight -- --collection-package ${collectionPackagePath} --sample-material ${sampleMaterialPath} --output project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material-preflight.json --checked-by release-operator-1`,
      },
      {
        id: 'real_duration_sample_source_export',
        gate: 'duration_sample_collection_package',
        command: `npm run evidence:default-master-plan:real-duration-sample-export -- --collection-package ${collectionPackagePath} --sample-material ${sampleMaterialPath} --material-preflight ${materialPreflightPath} --output project-testing/reports/default-master-plan-production-readiness/source-exports/duration-experience-samples-export.json --environment production --exported-by release-operator-1`,
      },
      {
        id: 'source_export_collect',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        command: productionPipelineCommand({ realProductionOutcome }),
      },
      {
        id: 'evidence_bundle',
        command: fiveEvidenceCommand('node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs --output-root project-testing/reports/default-master-plan-production-readiness'),
      },
      {
        id: 'readiness_check',
        command: fiveEvidenceCommand('node project-testing/tools/check-default-master-plan-production-readiness.mjs'),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:35:00.000Z'),
    })

    assert.equal(report.status, 'pass')
    assert.equal(report.sourceExportMode, 'production_or_live')
    assert.equal(report.mayCheckRealDurationSampleCollectionKit, true)
    assert.equal(report.mayCheckRealDurationSampleMaterial, true)
    assert.equal(report.mayBuildRealDurationSampleMaterialFromCollectionKitPreflight, true)
    assert.deepEqual(report.realDurationSampleCollectionKitPreflightBlockers, [])
    assert.deepEqual(report.realDurationSampleMaterialPreflightBlockers, [])
    assert.equal(report.mayRunSupportingSourceExport, true)
    assert.equal(report.mayRunProductionSourceExport, true)
    assert.equal(report.mayRunSourceExport, true)
    assert.equal(report.mayBuildRealDurationSampleSourceExport, true)
    assert.equal(report.mayBuildRealDurationSampleMaterialTemplate, true)
    assert.equal(report.mayBuildCompletedTaskExport, true)
    assert.equal(report.mayRunRuntimeCandidateAlignmentPreflight, true)
    assert.equal(report.mayBuildRuntimeTaskAlignmentRefreshPackage, true)
    assert.equal(report.mayBuildRuntimeTaskAlignmentReviewEvidence, true)
    assert.equal(report.mayBuildRealDurationSampleMaterialFromTaskExport, true)
    assert.equal(report.actionReadiness.runnableActionIds.includes('completed_task_export'), true)
    assert.equal(report.actionReadiness.runnableActionIds.includes('runtime_candidate_alignment_preflight'), true)
    assert.equal(report.actionReadiness.runnableActionIds.includes('runtime_task_alignment_refresh_package'), true)
    assert.equal(report.actionReadiness.runnableActionIds.includes('runtime_task_alignment_review_evidence'), true)
    assert.equal(report.actionReadiness.runnableActionIds.includes('real_duration_sample_material_from_task_export'), true)
    assert.equal(report.actionReadiness.runnableActionIds.includes('real_duration_sample_collection_kit_preflight'), true)
    assert.equal(report.actionReadiness.runnableActionIds.includes('real_duration_sample_material_from_collection_kit_preflight'), true)
    assert.deepEqual(report.realDurationSampleSourceExportBlockers, [])
    assert.deepEqual(report.realDurationSampleMaterialTemplateBlockers, [])
    assert.deepEqual(report.completedTaskExportBlockers, [])
    assert.deepEqual(report.runtimeCandidateAlignmentPreflightBlockers, [])
    assert.deepEqual(report.runtimeTaskAlignmentRefreshPackageBlockers, [])
    assert.deepEqual(report.runtimeTaskAlignmentReviewEvidenceBlockers, [])
    assert.deepEqual(report.realDurationSampleMaterialFromTaskExportBlockers, [])
    assert.equal(report.mayAcceptRealProductionOutcomeEvidence, true)
    assert.deepEqual(report.realProductionOutcomeEvidenceBlockers, [])
    assert.equal(report.mayRunProductionEvidencePipeline, true)
    assert.deepEqual(report.blockers, [])
    assert.deepEqual(report.placeholderFindings, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('surfaces completed task export drift diagnostics from operator handoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-completed-task-drift-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    currentBlockers: [
      'completed_task_export_invalid_completed_task_rows_present',
      'completed_task_export_completed_task_export_coverage_incomplete',
    ],
    completedTaskExport: {
      status: 'blocked',
      requiredStableCodeCount: 18,
      rawTaskCount: 16,
      exportedTaskCount: 0,
      invalidTaskCount: 3,
      titleMismatchCount: 3,
      titleMatchedDifferentStableCodeCount: 3,
      missingStableCodeCount: 5,
      missingStableCodes: ['BTMP-SCH-02', 'BTMP-SCH-03'],
      invalidTaskExamples: [
        {
          id: 'task-drift-1',
          stableCode: 'BTMP-SCH-04',
          title: '竣工验收与开学移交准备',
          expectedTitle: '食堂宿舍装修与机电收口',
          matchingRequestedStableCodeByTitle: 'BTMP-SCH-06',
          recommendedAction: 'refresh_runtime_task_stable_code_or_collect_current_completed_task',
          blockers: ['completed_task_title_mismatch'],
        },
      ],
      blockers: [
        'invalid_completed_task_rows_present',
        'completed_task_export_coverage_incomplete',
      ],
    },
    actionSequence: [
      {
        id: 'completed_task_export',
        gate: 'duration_sample_collection_package',
        command: 'npm run evidence:default-master-plan:completed-task-export -- --collection-package project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --raw-tasks project-testing/reports/default-master-plan-production-readiness/source-exports/raw-completed-tasks.json --output project-testing/reports/default-master-plan-production-readiness/source-exports/completed-task-export.json --source-name raw_completed_tasks --evidence-ref raw_completed_tasks:source#sha256=abc123 --operator-review-ref pm_review_evidence:review#sha256=def456 --exported-by release-operator-1',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-06T15:05:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.completedTaskExport.status, 'blocked')
    assert.equal(report.completedTaskExport.invalidTaskCount, 3)
    assert.equal(report.completedTaskExport.titleMismatchCount, 3)
    assert.equal(report.completedTaskExport.missingStableCodeCount, 5)
    assert.deepEqual(report.completedTaskExport.missingStableCodes, ['BTMP-SCH-02', 'BTMP-SCH-03'])
    assert.deepEqual(report.completedTaskExport.invalidTaskExamples, [
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
    assert.equal(report.completedTaskExport.recommendedNextAction, 'refresh_runtime_task_stable_code_or_collect_current_completed_task')

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Completed Task Export Alignment/)
    assert.match(markdown, /task-drift-1/)
    assert.match(markdown, /refresh_runtime_task_stable_code_or_collect_current_completed_task/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reports legacy PM review binding findings without blocking the production pipeline', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeQualifiedRealProductionOutcome(realProductionOutcome)

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'pm_review_package',
        gate: 'project_manager_review_evidence',
        command: 'npm run evidence:default-master-plan:review-package -- --candidate-baseline project-testing/reports/default-master-plan-production-readiness/candidate-baseline.json --output project-testing/reports/default-master-plan-production-readiness/pm-review-package.json --environment production --exported-by release-operator-1',
      },
      {
        id: 'pm_review_record',
        gate: 'project_manager_review_evidence',
        command: 'npm run evidence:default-master-plan:record-review -- --baseline-id baseline-1 --project-id project-1 --reviewed-by human-project-manager-1 --review-notes accepted-for-production-evidence-chain --environment production --exported-by release-operator-1 --mode execute',
      },
      {
        id: 'source_export_collect',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        command: productionPipelineCommand({ realProductionOutcome }),
      },
      {
        id: 'evidence_bundle',
        command: fiveEvidenceCommand('node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs --output-root project-testing/reports/default-master-plan-production-readiness'),
      },
      {
        id: 'readiness_check',
        command: fiveEvidenceCommand('node project-testing/tools/check-default-master-plan-production-readiness.mjs'),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:36:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunProductionEvidencePipeline, false)
    assert.equal(report.pmReviewRecordBlockers.includes('pm_review_record_review_package_missing'), true)
    assert.equal(report.productionEvidencePipelineBlockers.includes('pm_review_record_review_package_missing'), false)
    assert.equal(report.offlineDevelopmentQualityReview.requiredForRuntime, false)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /pm_review_record_review_package_missing/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('keeps legacy PM review command findings outside runtime publication blockers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-preflight-pm-correction-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: true,
    status: 'production_ready_handoff_complete',
    currentBlockers: [],
    environment: 'production',
    actionSequence: [{
      id: 'pm_review_record',
      gate: 'project_manager_review_evidence',
      command: 'npm run evidence:default-master-plan:record-review -- --baseline-id baseline-1 --project-id project-1 --reviewed-by <human-project-manager-user-id> --review-notes <real-review-notes>',
    }],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-14T02:00:00.000Z'),
    })

    assert.equal(report.pmReviewRecordBlockers.includes('pm_review_record_command_contains_placeholders'), true)
    assert.equal(report.blockers.includes('pm_review_record_command_contains_placeholders'), false)
    assert.equal(report.productionEvidencePipelineBlockers.includes('pm_review_record_command_contains_placeholders'), false)
    assert.equal(report.activePlaceholderFindings.some((finding) => finding.actionId === 'pm_review_record'), false)
    assert.equal(report.actionReadiness.blockedActionIds.includes('pm_review_record'), false)
    assert.equal(report.offlineDevelopmentQualityReview.requiredForRuntime, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production evidence pipeline when evidence bundle command omits runtime evidence arguments', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeQualifiedRealProductionOutcome(realProductionOutcome)

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        command: productionPipelineCommand({ realProductionOutcome }),
      },
      {
        id: 'evidence_bundle',
        command: 'node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs --output-root project-testing/reports/default-master-plan-production-readiness --review-evidence project-testing/reports/default-master-plan-production-readiness/pm-review-evidence.json',
      },
      {
        id: 'readiness_check',
        command: fiveEvidenceCommand('node project-testing/tools/check-default-master-plan-production-readiness.mjs'),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:35:30.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunSourceExport, true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
    assert.equal(report.productionEvidencePipelineBlockers.includes('evidence_bundle_dependency_writer_evidence_missing'), true)
    assert.equal(report.productionEvidencePipelineBlockers.includes('evidence_bundle_source_manifest_missing'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production evidence pipeline when readiness check command omits source manifest', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeQualifiedRealProductionOutcome(realProductionOutcome)

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        command: productionPipelineCommand({ realProductionOutcome }),
      },
      {
        id: 'evidence_bundle',
        command: fiveEvidenceCommand('node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs --output-root project-testing/reports/default-master-plan-production-readiness'),
      },
      {
        id: 'readiness_check',
        command: [
          'node project-testing/tools/check-default-master-plan-production-readiness.mjs',
          '--review-evidence project-testing/reports/default-master-plan-production-readiness/pm-review-evidence.json',
          '--duration-calibration-evidence project-testing/reports/default-master-plan-production-readiness/duration-calibration-evidence.json',
          '--dependency-writer-evidence project-testing/reports/default-master-plan-production-readiness/dependency-writer-evidence.json',
          '--runtime-publication-evidence project-testing/reports/default-master-plan-production-readiness/runtime-publication-evidence.json',
          '--post-publish-smoke-rollback-evidence project-testing/reports/default-master-plan-production-readiness/post-publish-smoke-rollback-evidence.json',
        ].join(' '),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:35:45.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunSourceExport, true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
    assert.equal(report.productionEvidencePipelineBlockers.includes('readiness_check_source_manifest_missing'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production evidence pipeline when production pipeline command omits source export inputs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeQualifiedRealProductionOutcome(realProductionOutcome)

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        command: 'node project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --source-manifest project-testing/reports/default-master-plan-production-readiness/source-exports/source-exports-manifest.json',
      },
      {
        id: 'evidence_bundle',
        command: fiveEvidenceCommand('node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs --output-root project-testing/reports/default-master-plan-production-readiness'),
      },
      {
        id: 'readiness_check',
        command: fiveEvidenceCommand('node project-testing/tools/check-default-master-plan-production-readiness.mjs'),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:35:55.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunSourceExport, true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
    assert.equal(report.productionEvidencePipelineBlockers.includes('production_pipeline_command_review_export_missing'), true)
    assert.equal(report.productionEvidencePipelineBlockers.includes('production_pipeline_command_runtime_publications_missing'), true)
    assert.equal(report.productionEvidencePipelineBlockers.includes('production_pipeline_command_runtime_consumptions_missing'), true)
    assert.equal(report.productionEvidencePipelineBlockers.includes('production_pipeline_command_real_production_outcome_missing'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production source export when source export command omits runtime source inputs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeQualifiedRealProductionOutcome(realProductionOutcome)

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        command: productionPipelineCommand({ realProductionOutcome }),
      },
      {
        id: 'evidence_bundle',
        command: fiveEvidenceCommand('node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs --output-root project-testing/reports/default-master-plan-production-readiness'),
      },
      {
        id: 'readiness_check',
        command: fiveEvidenceCommand('node project-testing/tools/check-default-master-plan-production-readiness.mjs'),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:38:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.sourceExportMode, 'production_or_live')
    assert.equal(report.mayRunSupportingSourceExport, false)
    assert.equal(report.mayRunProductionSourceExport, false)
    assert.equal(report.mayRunSourceExport, false)
    assert.equal(report.sourceExportBlockers.includes('source_export_command_api_read_smoke_missing'), true)
    assert.equal(report.sourceExportBlockers.includes('source_export_command_ui_consumption_smoke_missing'), true)
    assert.equal(report.sourceExportBlockers.includes('source_export_command_critical_path_readback_missing'), true)
    assert.equal(report.sourceExportBlockers.includes('source_export_command_rollback_verification_missing'), true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production source export when source export command omits environment or exported-by', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeQualifiedRealProductionOutcome(realProductionOutcome)

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        command: productionPipelineCommand({ realProductionOutcome }),
      },
      {
        id: 'evidence_bundle',
        command: fiveEvidenceCommand('node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs --output-root project-testing/reports/default-master-plan-production-readiness'),
      },
      {
        id: 'readiness_check',
        command: fiveEvidenceCommand('node project-testing/tools/check-default-master-plan-production-readiness.mjs'),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:38:30.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.sourceExportMode, 'production_or_live')
    assert.equal(report.mayRunProductionSourceExport, false)
    assert.equal(report.sourceExportBlockers.includes('source_export_command_environment_missing'), true)
    assert.equal(report.sourceExportBlockers.includes('source_export_command_exported_by_missing'), true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production source export when source export command does not invoke the governed exporter', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeQualifiedRealProductionOutcome(realProductionOutcome)

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        command: `node project-testing/tools/fake-exporter.mjs --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        command: productionPipelineCommand({ realProductionOutcome }),
      },
      {
        id: 'evidence_bundle',
        command: fiveEvidenceCommand('node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs --output-root project-testing/reports/default-master-plan-production-readiness'),
      },
      {
        id: 'readiness_check',
        command: fiveEvidenceCommand('node project-testing/tools/check-default-master-plan-production-readiness.mjs'),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:38:45.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.sourceExportMode, 'production_or_live')
    assert.equal(report.mayRunProductionSourceExport, false)
    assert.equal(report.sourceExportBlockers.includes('source_export_command_script_mismatch'), true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production evidence pipeline when required flag value is another flag', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeQualifiedRealProductionOutcome(realProductionOutcome)

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        command: productionPipelineCommand({ realProductionOutcome: '--source-manifest' }),
      },
      {
        id: 'evidence_bundle',
        command: fiveEvidenceCommand('node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs --output-root project-testing/reports/default-master-plan-production-readiness'),
      },
      {
        id: 'readiness_check',
        command: fiveEvidenceCommand('node project-testing/tools/check-default-master-plan-production-readiness.mjs'),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:36:05.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunSourceExport, true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
    assert.equal(report.productionEvidencePipelineBlockers.includes('production_pipeline_command_real_production_outcome_missing'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production evidence pipeline when pipeline command does not use governed script', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeQualifiedRealProductionOutcome(realProductionOutcome)

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        command: productionPipelineCommand({ realProductionOutcome }).replace(
          'project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs',
          'project-testing/tools/fake-production-evidence-pipeline.mjs',
        ),
      },
      {
        id: 'evidence_bundle',
        command: fiveEvidenceCommand('node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs --output-root project-testing/reports/default-master-plan-production-readiness'),
      },
      {
        id: 'readiness_check',
        command: fiveEvidenceCommand('node project-testing/tools/check-default-master-plan-production-readiness.mjs'),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:36:10.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunSourceExport, true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
    assert.equal(report.productionEvidencePipelineBlockers.includes('production_pipeline_command_script_mismatch'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production evidence pipeline when source export output root and pipeline manifest diverge', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeQualifiedRealProductionOutcome(realProductionOutcome)

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --output-root project-testing/reports/default-master-plan-production-readiness/source-exports-a --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        command: productionPipelineCommand({
          realProductionOutcome,
          sourceManifest: 'project-testing/reports/default-master-plan-production-readiness/source-exports-b/source-exports-manifest.json',
        }),
      },
      {
        id: 'evidence_bundle',
        command: fiveEvidenceCommand('node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs --output-root project-testing/reports/default-master-plan-production-readiness'),
      },
      {
        id: 'readiness_check',
        command: fiveEvidenceCommand('node project-testing/tools/check-default-master-plan-production-readiness.mjs'),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:36:20.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunSourceExport, true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
    assert.equal(report.productionEvidencePipelineBlockers.includes('production_pipeline_command_source_manifest_mismatch'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production evidence pipeline when evidence bundle manifest diverges from pipeline manifest', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeQualifiedRealProductionOutcome(realProductionOutcome)

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        command: productionPipelineCommand({ realProductionOutcome }),
      },
      {
        id: 'evidence_bundle',
        command: fiveEvidenceCommand(
          'node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs --output-root project-testing/reports/default-master-plan-production-readiness',
          { sourceManifest: 'project-testing/reports/default-master-plan-production-readiness/source-exports-b/source-exports-manifest.json' },
        ),
      },
      {
        id: 'readiness_check',
        command: fiveEvidenceCommand('node project-testing/tools/check-default-master-plan-production-readiness.mjs'),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:36:25.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunSourceExport, true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
    assert.equal(report.productionEvidencePipelineBlockers.includes('evidence_bundle_source_manifest_mismatch'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production evidence pipeline when readiness check manifest diverges from pipeline manifest', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeQualifiedRealProductionOutcome(realProductionOutcome)

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        command: productionPipelineCommand({ realProductionOutcome }),
      },
      {
        id: 'evidence_bundle',
        command: fiveEvidenceCommand('node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs --output-root project-testing/reports/default-master-plan-production-readiness'),
      },
      {
        id: 'readiness_check',
        command: fiveEvidenceCommand(
          'node project-testing/tools/check-default-master-plan-production-readiness.mjs',
          { sourceManifest: 'project-testing/reports/default-master-plan-production-readiness/source-exports-c/source-exports-manifest.json' },
        ),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:36:30.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunSourceExport, true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
    assert.equal(report.productionEvidencePipelineBlockers.includes('readiness_check_source_manifest_mismatch'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production evidence pipeline when pipeline command identity differs from handoff identity', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeQualifiedRealProductionOutcome(realProductionOutcome)

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        command: productionPipelineCommand({ projectId: 'wrong-project', realProductionOutcome }),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:36:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunSourceExport, true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
    assert.equal(report.productionEvidencePipelineBlockers.includes('production_pipeline_command_project_id_mismatch'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production evidence pipeline when evidence bundle action is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeQualifiedRealProductionOutcome(realProductionOutcome)

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        command: productionPipelineCommand({ realProductionOutcome }),
      },
      {
        id: 'readiness_check',
        command: 'node project-testing/tools/check-default-master-plan-production-readiness.mjs --review-evidence project-testing/reports/default-master-plan-production-readiness/pm-review-evidence.json',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:37:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunSourceExport, true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
    assert.equal(report.productionEvidencePipelineBlockers.includes('evidence_bundle_command_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production evidence pipeline when readiness check action is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeQualifiedRealProductionOutcome(realProductionOutcome)

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        command: productionPipelineCommand({ realProductionOutcome }),
      },
      {
        id: 'evidence_bundle',
        command: 'node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs --output-root project-testing/reports/default-master-plan-production-readiness --review-evidence project-testing/reports/default-master-plan-production-readiness/pm-review-evidence.json',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:38:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunSourceExport, true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
    assert.equal(report.productionEvidencePipelineBlockers.includes('readiness_check_command_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows source export preparation before production-ready when placeholders are resolved', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const collectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const sampleMaterialPath = path.join(root, 'real-duration-sample-material.json')
  const materialPreflightPath = path.join(root, 'real-duration-sample-material-preflight.json')

  await writeReadyRealDurationSampleMaterialPreflight(materialPreflightPath, {
    collectionPackagePath,
    sampleMaterialPath,
  })

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: ['project_manager_review_evidence', 'runtime_duration_calibration_evidence'],
    actionSequence: [
      {
        id: 'source_export_collect',
        command: 'npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment staging --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:40:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.sourceExportMode, 'supporting_non_production')
    assert.equal(report.mayRunSupportingSourceExport, true)
    assert.equal(report.mayRunProductionSourceExport, false)
    assert.equal(report.mayRunSourceExport, false)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
    assert.equal(report.blockers.includes('handoff_current_blockers_not_empty'), true)
    assert.equal(report.blockers.includes('handoff_not_production_ready'), true)
    assert.equal(report.blockers.includes('handoff_contains_placeholders'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('classifies staging source export as supporting evidence, not production source export permission', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    environment: 'staging',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [
      'staging_controlled_replay_not_production_ready',
      'real_production_or_live_outcome_evidence_required',
    ],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment staging --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/staging-runtime/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/staging-runtime/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/staging-runtime/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/staging-runtime/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/staging-runtime/rollback-verification.json',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:42:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.targetEnvironment, 'staging')
    assert.equal(report.sourceExportMode, 'supporting_non_production')
    assert.equal(report.mayRunSupportingSourceExport, true)
    assert.equal(report.mayRunProductionSourceExport, false)
    assert.equal(report.mayRunSourceExport, false)
    assert.deepEqual(report.sourceExportBlockers, [])
    assert.equal(
      report.productionSourceExportBlockers.includes('production_or_live_source_export_required_for_production_ready'),
      true,
    )
    assert.equal(report.mayRunProductionEvidencePipeline, false)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /mayRunSupportingSourceExport: true/)
    assert.match(markdown, /mayRunProductionSourceExport: false/)
    assert.match(markdown, /production_or_live_source_export_required_for_production_ready/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks source export preparation when command identity differs from handoff identity', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    environment: 'staging',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [
      'staging_controlled_replay_not_production_ready',
      'real_production_or_live_outcome_evidence_required',
    ],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id wrong-project --publication-key default-master-plan-runtime-publication-1 --environment staging --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/staging-runtime/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/staging-runtime/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/staging-runtime/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/staging-runtime/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/staging-runtime/rollback-verification.json',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:43:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunSupportingSourceExport, false)
    assert.equal(report.sourceExportBlockers.includes('source_export_command_project_id_mismatch'), true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not block source export preparation on placeholders outside the source export action', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: ['project_manager_review_evidence', 'runtime_publication_evidence'],
    actionSequence: [
      {
        id: 'pm_review_record',
        gate: 'project_manager_review_evidence',
        command: 'npm run evidence:default-master-plan:record-review -- --reviewed-by <human-project-manager-user-id> --review-notes <real-review-notes>',
      },
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment staging --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json',
      },
      {
        id: 'production_evidence_pipeline',
        gate: 'five_evidence_builders',
        command: 'node project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs <source-export-pipeline-args>',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:45:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.sourceExportMode, 'supporting_non_production')
    assert.equal(report.mayRunSupportingSourceExport, true)
    assert.equal(report.mayRunProductionSourceExport, false)
    assert.equal(report.mayRunSourceExport, false)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
    assert.deepEqual(report.sourceExportBlockers, [])
    assert.equal(
      report.productionSourceExportBlockers.includes('production_or_live_source_export_required_for_production_ready'),
      true,
    )
    assert.equal(report.productionEvidencePipelineBlockers.includes('handoff_contains_placeholders'), true)
    assert.equal(report.placeholderFindings.length, 3)
    assert.equal(report.sourceExportPlaceholderFindings.length, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows review-duration source export while full runtime source export still has placeholders', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    publicationKey: '<publication-key>',
    currentBlockers: ['runtime_publication_evidence'],
    actionSequence: [
      {
        id: 'review_duration_source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --phase review-duration --baseline-id baseline-1 --project-id project-1 --environment staging --exported-by release-operator-1',
      },
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key <publication-key> --writer-result <dependency-writer-result.json>',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:50:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunReviewDurationSourceExport, true)
    assert.equal(report.mayRunSourceExport, false)
    assert.deepEqual(report.reviewDurationSourceExportBlockers, [])
    assert.equal(report.sourceExportBlockers.includes('handoff_contains_source_export_placeholders'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows PM review package build while review record and runtime commands still contain placeholders', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    publicationKey: '<publication-key>',
    currentBlockers: ['project_manager_review_evidence', 'runtime_publication_evidence'],
    actionSequence: [
      {
        id: 'pm_review_package',
        gate: 'project_manager_review_evidence',
        command: 'npm run evidence:default-master-plan:review-package -- --candidate-baseline project-testing/reports/default-master-plan-production-readiness/candidate-baseline.json --output project-testing/reports/default-master-plan-production-readiness/pm-review-package.json --environment staging --exported-by release-operator-1',
      },
      {
        id: 'pm_review_record',
        gate: 'project_manager_review_evidence',
        command: 'npm run evidence:default-master-plan:record-review -- --reviewed-by <human-project-manager-user-id> --review-notes <real-review-notes>',
      },
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --publication-key <publication-key> --writer-result <dependency-writer-result.json>',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:55:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildReviewPackage, true)
    assert.deepEqual(report.reviewPackageBlockers, [])
    assert.equal(report.mayRunSourceExport, false)
    assert.equal(report.reviewPackagePlaceholderFindings.length, 0)
    assert.equal(report.sourceExportBlockers.includes('handoff_contains_source_export_placeholders'), true)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /mayBuildReviewPackage: true/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows candidate refresh package build while runtime commands still contain placeholders', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    publicationKey: '<publication-key>',
    currentBlockers: [
      'selected_candidate_export_profile_shape_mismatch',
      'candidate_baseline_refresh_required_before_runtime_publication',
    ],
    actionSequence: [
      {
        id: 'candidate_refresh_package',
        gate: 'candidate_baseline_refresh_preflight',
        command: 'npm run evidence:default-master-plan:candidate-refresh-package -- --candidate-export project-testing/reports/default-master-plan-production-readiness/candidate-baseline-baseline-1-school-items.json --profile-report project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.json --hygiene project-testing/reports/default-master-plan-production-readiness/candidate-export-hygiene.json --output project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json',
      },
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --publication-key <publication-key> --writer-result <dependency-writer-result.json>',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:55:30.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildCandidateRefreshPackage, true)
    assert.deepEqual(report.candidateRefreshPackageBlockers, [])
    assert.equal(report.mayRunSourceExport, false)
    assert.equal(report.sourceExportBlockers.includes('handoff_contains_source_export_placeholders'), true)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /mayBuildCandidateRefreshPackage: true/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows candidate refresh package diagnostic build without candidate export input', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    publicationKey: '<publication-key>',
    currentBlockers: [
      'handoff_candidate_artifact_required',
      'candidate_export_required',
    ],
    candidateRefreshPackage: {
      status: 'blocked',
      productionReady: false,
      blockers: ['candidate_export_required'],
    },
    actionSequence: [
      {
        id: 'candidate_refresh_package',
        gate: 'candidate_baseline_refresh_preflight',
        command: 'npm run evidence:default-master-plan:candidate-refresh-package -- --profile-report project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.json --hygiene project-testing/reports/default-master-plan-production-readiness/candidate-export-hygiene.json --output project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json',
      },
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --publication-key <publication-key> --writer-result <dependency-writer-result.json>',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-07T06:20:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildCandidateRefreshPackage, true)
    assert.deepEqual(report.candidateRefreshPackageBlockers, [])
    assert.equal(report.actionReadiness.runnableActionIds.includes('candidate_refresh_package'), true)
    assert.equal(report.actionReadiness.blockedActionIds.includes('candidate_refresh_package'), false)
    assert.equal(report.currentBlockers.includes('candidate_export_required'), true)
    assert.equal(report.sourceExportBlockers.includes('handoff_contains_source_export_placeholders'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('classifies candidate refresh execution actions in handoff readiness', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: [
      'candidate_baseline_refresh_required_before_runtime_publication',
      'candidate_refresh_db_connection_failed',
      'candidate_refresh_db_execution_failed',
      'candidate_baseline_materialization_unlock_required',
    ],
    actionSequence: [
      {
        id: 'candidate_refresh_execution_preflight',
        gate: 'candidate_baseline_refresh_execution_gate',
        command: 'npm run evidence:default-master-plan:candidate-refresh-preflight -- --refresh-package project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json --output project-testing/reports/default-master-plan-production-readiness/candidate-refresh-execution-preflight.json --environment staging',
      },
      {
        id: 'candidate_refresh_authorization_package',
        gate: 'candidate_baseline_refresh_execution_gate',
        command: 'node project-testing/tools/build-default-master-plan-candidate-refresh-authorization-package.mjs --handoff project-testing/reports/default-master-plan-production-readiness/operator-handoff.json --preflight project-testing/reports/default-master-plan-production-readiness/candidate-refresh-execution-preflight.json --execution project-testing/reports/default-master-plan-production-readiness/candidate-refresh-execution.json --output project-testing/reports/default-master-plan-production-readiness/candidate-refresh-authorization-package.json --template-output project-testing/reports/default-master-plan-production-readiness/candidate-refresh-authorization.operator-fill-template.json',
      },
      {
        id: 'candidate_refresh_execution_readiness_seal',
        gate: 'candidate_baseline_refresh_execution_gate',
        command: 'node project-testing/tools/check-default-master-plan-candidate-refresh-execution-readiness.mjs --authorization-package project-testing/reports/default-master-plan-production-readiness/candidate-refresh-authorization-package.json --preflight project-testing/reports/default-master-plan-production-readiness/candidate-refresh-execution-preflight.json --output project-testing/reports/default-master-plan-production-readiness/candidate-refresh-execution-readiness-seal.json',
      },
      {
        id: 'candidate_baseline_materialization',
        gate: 'candidate_baseline_materialization_gate',
        command: 'npm run evidence:default-master-plan:candidate-baseline-materialization -- --refresh-package project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json --output project-testing/reports/default-master-plan-production-readiness/candidate-baseline-materialization.json --environment staging',
      },
      {
        id: 'candidate_baseline_materialization_readiness_seal',
        gate: 'candidate_baseline_materialization_gate',
        command: 'node project-testing/tools/check-default-master-plan-candidate-baseline-materialization-readiness.mjs --refresh-package project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json --materialization project-testing/reports/default-master-plan-production-readiness/candidate-baseline-materialization.json --output project-testing/reports/default-master-plan-production-readiness/candidate-baseline-materialization-readiness-seal.json',
      },
      {
        id: 'candidate_refresh_execution',
        gate: 'candidate_baseline_refresh_execution_gate',
        command: 'npm run evidence:default-master-plan:candidate-refresh-execution -- --refresh-package project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json --preflight project-testing/reports/default-master-plan-production-readiness/candidate-refresh-execution-preflight.json --output project-testing/reports/default-master-plan-production-readiness/candidate-refresh-execution.json --environment staging',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-07T08:10:00.000Z'),
    })

    const preflightAction = report.actionReadiness.actions.find((action) => action.actionId === 'candidate_refresh_execution_preflight')
    const authorizationPackageAction = report.actionReadiness.actions.find((action) => action.actionId === 'candidate_refresh_authorization_package')
    const readinessSealAction = report.actionReadiness.actions.find((action) => action.actionId === 'candidate_refresh_execution_readiness_seal')
    const materializationAction = report.actionReadiness.actions.find((action) => action.actionId === 'candidate_baseline_materialization')
    const materializationReadinessSealAction = report.actionReadiness.actions.find((action) => action.actionId === 'candidate_baseline_materialization_readiness_seal')
    const executionAction = report.actionReadiness.actions.find((action) => action.actionId === 'candidate_refresh_execution')

    assert.equal(preflightAction?.status, 'runnable')
    assert.equal(authorizationPackageAction?.status, 'runnable')
    assert.equal(readinessSealAction?.status, 'runnable')
    assert.equal(materializationAction?.status, 'blocked')
    assert.equal(materializationReadinessSealAction?.status, 'runnable')
    assert.equal(materializationAction?.blockers.includes('candidate_baseline_materialization_unlock_required'), true)
    assert.equal(executionAction?.status, 'blocked')
    assert.equal(executionAction?.blockers.includes('candidate_refresh_db_connection_failed'), true)
    assert.equal(executionAction?.blockers.includes('candidate_refresh_db_execution_failed'), true)
    assert.equal(report.actionReadiness.runnableActionIds.includes('candidate_refresh_execution_preflight'), true)
    assert.equal(report.actionReadiness.runnableActionIds.includes('candidate_refresh_authorization_package'), true)
    assert.equal(report.actionReadiness.runnableActionIds.includes('candidate_refresh_execution_readiness_seal'), true)
    assert.equal(report.actionReadiness.runnableActionIds.includes('candidate_baseline_materialization_readiness_seal'), true)
    assert.equal(report.mayBuildCandidateRefreshAuthorizationPackage, true)
    assert.equal(report.mayCheckCandidateRefreshExecutionReadinessSeal, true)
    assert.equal(report.mayCheckCandidateBaselineMaterializationReadinessSeal, true)
    assert.deepEqual(report.candidateRefreshAuthorizationPackageBlockers, [])
    assert.deepEqual(report.candidateRefreshExecutionReadinessSealBlockers, [])
    assert.deepEqual(report.candidateBaselineMaterializationReadinessSealBlockers, [])
    assert.equal(report.actionReadiness.blockedActionIds.includes('candidate_refresh_execution'), true)
    assert.equal(report.actionReadiness.blockedActionIds.includes('candidate_baseline_materialization'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('adds structured next requirements for blocked operator handoff actions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-requirements-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const collectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const sampleMaterialPath = path.join(root, 'real-duration-sample-material.json')
  const materialPreflightPath = path.join(root, 'real-duration-sample-material-preflight.json')

  await writeJson(materialPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-real-duration-sample-material-preflight/v1',
    status: 'blocked',
    collectionPackageRef: `duration_sample_collection_package:${collectionPackagePath}#sha256=aaaaaaaa`,
    sampleMaterialRef: `real_duration_sample_material:${sampleMaterialPath}#sha256=bbbbbbbb`,
    blockers: ['accepted_real_duration_sample_material_coverage_incomplete'],
    mutationBoundary: {
      writesDurationSamples: false,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  })

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    environment: 'staging',
    currentBlockers: [
      'candidate_baseline_materialization_execute_mode_required',
      'candidate_baseline_materialization_allow_flag_required',
      'candidate_baseline_materialization_unlock_required',
      'candidate_refresh_execution_unlock_required',
      'candidate_refresh_execution_allow_refresh_required',
      'candidate_refresh_execute_mode_required',
      'candidate_refresh_operator_approval_required',
      'candidate_refresh_refreshed_by_required',
      'duration_samples_operator_supplied_real_duration_sample_export_required',
    ],
    actionSequence: [
      {
        id: 'candidate_baseline_materialization',
        gate: 'candidate_baseline_materialization_gate',
        command: 'npm run evidence:default-master-plan:candidate-baseline-materialization -- --refresh-package project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json --output project-testing/reports/default-master-plan-production-readiness/candidate-baseline-materialization.json --environment staging',
      },
      {
        id: 'candidate_refresh_execution',
        gate: 'candidate_baseline_refresh_execution_gate',
        command: 'npm run evidence:default-master-plan:candidate-refresh-execution -- --refresh-package project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json --preflight project-testing/reports/default-master-plan-production-readiness/candidate-refresh-execution-preflight.json --authorization-package project-testing/reports/default-master-plan-production-readiness/candidate-refresh-authorization-package.json --output project-testing/reports/default-master-plan-production-readiness/candidate-refresh-execution.json --environment staging',
      },
      {
        id: 'real_duration_sample_source_export',
        gate: 'duration_sample_collection_package',
        command: `node project-testing/tools/build-default-master-plan-real-duration-sample-source-export.mjs --collection-package ${collectionPackagePath} --sample-material ${sampleMaterialPath} --material-preflight ${materialPreflightPath} --output project-testing/reports/default-master-plan-production-readiness/source-exports/duration-experience-samples-export.json --environment staging --exported-by release-operator-1`,
      },
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment staging --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json',
      },
      {
        id: 'production_evidence_pipeline',
        gate: 'five_evidence_builders',
        command: productionPipelineCommand({ environment: 'staging' }),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-07T09:20:00.000Z'),
    })

    assert.equal(Array.isArray(report.actionReadiness.blockedActionDetails), true)
    const detailById = new Map(report.actionReadiness.blockedActionDetails.map((detail) => [detail.actionId, detail]))
    const materializationRequirements = detailById.get('candidate_baseline_materialization')?.nextRequirements
    const refreshRequirements = detailById.get('candidate_refresh_execution')?.nextRequirements
    const sampleExportRequirements = detailById.get('real_duration_sample_source_export')?.nextRequirements
    const pipelineRequirements = detailById.get('production_evidence_pipeline')?.nextRequirements

    assert.equal(materializationRequirements?.envUnlocks[0]?.variable, 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION')
    assert.deepEqual(
      materializationRequirements?.requiredFlags.map((requirement) => `${requirement.flag}${requirement.value ? `=${requirement.value}` : ''}`),
      ['--mode=execute', '--allow-materialization'],
    )
    assert.equal(refreshRequirements?.envUnlocks[0]?.variable, 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH')
    assert.deepEqual(
      refreshRequirements?.requiredFlags.map((requirement) => `${requirement.flag}${requirement.value ? `=${requirement.value}` : ''}`),
      ['--allow-refresh', '--mode=execute'],
    )
    assert.deepEqual(
      refreshRequirements?.operatorFields.map((requirement) => requirement.field),
      ['--operator-approval-ref', '--refreshed-by'],
    )
    assert.equal(
      sampleExportRequirements?.evidenceInputs.some((requirement) => requirement.requiredStatus === 'ready_for_source_export'),
      true,
    )
    assert.equal(
      pipelineRequirements?.requiredEnvironmentTargets.some((requirement) => requirement.target === 'production_or_live'),
      true,
    )
    assert.equal(
      pipelineRequirements?.evidenceInputs.some((requirement) => requirement.artifact === 'real-production-outcome.json'),
      true,
    )

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Blocked Action Next Requirements/)
    assert.match(markdown, /candidate_refresh_execution/)
    assert.match(markdown, /WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows duration sample collection package build while runtime commands still contain placeholders', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    publicationKey: '<publication-key>',
    currentBlockers: ['runtime_duration_calibration_evidence', 'runtime_publication_evidence'],
    actionSequence: [
      {
        id: 'duration_sample_collection_package',
        gate: 'runtime_duration_calibration_evidence',
        command: 'npm run evidence:default-master-plan:duration-sample-package -- --duration-gap-plan project-testing/reports/default-master-plan-production-readiness/duration-sample-gap-plan-school.json --profile-report project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.json --duration-asset-utilization-report project-testing/reports/default-master-plan-production-readiness/duration-asset-utilization-report.json --profile-scope all --profile-only --baseline-id baseline-1 --project-id project-1 --output project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --environment staging --exported-by release-operator-1',
      },
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --publication-key <publication-key> --writer-result <dependency-writer-result.json>',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:56:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildDurationSampleCollectionPackage, true)
    assert.deepEqual(report.durationSampleCollectionPackageBlockers, [])
    assert.equal(report.mayRunSourceExport, false)
    assert.equal(report.sourceExportBlockers.includes('handoff_contains_source_export_placeholders'), true)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /mayBuildDurationSampleCollectionPackage: true/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks completed task export when raw task source export manifest is blocked', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const sourceExportRoot = path.join(root, 'source-exports')
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const collectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const rawTasksPath = path.join(sourceExportRoot, 'raw-completed-tasks.json')
  const completedTaskExportPath = path.join(sourceExportRoot, 'completed-task-export.json')

  await mkdir(sourceExportRoot, { recursive: true })
  await writeJson(collectionPackagePath, { schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1' })
  await writeJson(rawTasksPath, {
    schemaVersion: 'workbuddy-default-master-plan-source-export/v1',
    rows: [],
    tasks: [],
  })
  await writeJson(path.join(sourceExportRoot, 'source-exports-manifest.json'), {
    schemaVersion: 'workbuddy-default-master-plan-production-source-exports/v1',
    status: 'blocked',
    sourceExports: {
      rawCompletedTasks: {
        path: rawTasksPath,
        rowCount: 0,
        blockers: ['db_query_failed:Query read timeout'],
      },
    },
  })
  await writeJson(handoffPath, operatorHandoffFixture({
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    actionSequence: [
      {
        id: 'completed_task_export',
        gate: 'duration_sample_collection_package',
        command: `npm run evidence:default-master-plan:completed-task-export -- --collection-package ${collectionPackagePath} --raw-tasks ${rawTasksPath} --output ${completedTaskExportPath} --source-name school-production-raw-tasks --evidence-ref raw-task-export:school#sha256=abc123 --operator-review-ref pm-review:completed-tasks-reviewed --exported-by release-operator-1`,
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:45:00.000Z'),
    })

    assert.equal(report.mayBuildCompletedTaskExport, false)
    assert.equal(report.completedTaskExportBlockers.includes('completed_task_export_raw_tasks_source_export_blocked'), true)
    assert.equal(report.completedTaskExportBlockers.includes('completed_task_export_raw_tasks_source_export_db_query_failed:Query read timeout'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks duration sample collection package build when all-profile runtime reference scope is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['runtime_duration_calibration_evidence'],
    actionSequence: [
      {
        id: 'duration_sample_collection_package',
        gate: 'runtime_duration_calibration_evidence',
        command: 'npm run evidence:default-master-plan:duration-sample-package -- --duration-gap-plan project-testing/reports/default-master-plan-production-readiness/duration-sample-gap-plan-school.json --profile-report project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.json --duration-asset-utilization-report project-testing/reports/default-master-plan-production-readiness/duration-asset-utilization-report.json --output project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --environment staging --exported-by release-operator-1',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-05T06:50:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildDurationSampleCollectionPackage, false)
    assert.equal(
      report.durationSampleCollectionPackageBlockers.includes('duration_sample_collection_package_profile_scope_all_required'),
      true,
    )
    assert.equal(
      report.durationSampleCollectionPackageBlockers.includes('duration_sample_collection_package_profile_only_required'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows duration asset utilization report build while runtime commands still contain placeholders', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    publicationKey: '<publication-key>',
    currentBlockers: [
      'duration_asset_utilization_runtime_reference_days_missing_for_some_rows',
      'runtime_publication_evidence',
    ],
    actionSequence: [
      {
        id: 'duration_asset_utilization',
        gate: 'duration_reference_days_evidence_review',
        command: 'npm run evidence:default-master-plan:duration-asset-utilization -- --candidate-refresh-package project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json --output project-testing/reports/default-master-plan-production-readiness/duration-asset-utilization-report.json',
      },
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --publication-key <publication-key> --writer-result <dependency-writer-result.json>',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:55:45.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildDurationAssetUtilizationReport, true)
    assert.deepEqual(report.durationAssetUtilizationBlockers, [])
    assert.equal(report.mayRunSourceExport, false)
    assert.equal(report.sourceExportBlockers.includes('handoff_contains_source_export_placeholders'), true)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /mayBuildDurationAssetUtilizationReport: true/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows runtime seed evidence pipeline rerun while runtime commands still contain placeholders', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    publicationKey: '<publication-key>',
    currentBlockers: [
      'runtime_seed_pipeline_runtime_reference_days_evidence_missing',
      'runtime_publication_evidence',
    ],
    runtimeSeedEvidencePipeline: {
      status: 'runtime_seed_import_blocked',
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-seed-evidence-pipeline.json',
      environment: {
        repairPlan: {
          status: 'blocked',
          targetClass: 'local_supabase',
          noAutoInstall: true,
          requiredStepIds: ['start_local_supabase'],
          blockedStepIds: ['rerun_runtime_seed_pipeline'],
          orderedSteps: [
            {
              id: 'start_local_supabase',
              status: 'required',
              blockerCodes: ['local_supabase_endpoint_unreachable'],
              commands: ['supabase start'],
              verificationCommands: ['npm.cmd run evidence:default-master-plan:runtime-seed-env'],
            },
          ],
        },
      },
    },
    actionSequence: [
      {
        id: 'runtime_seed_evidence_pipeline',
        gate: 'runtime_seed_and_reference_days_evidence',
        command: 'npm run evidence:default-master-plan:runtime-seed-pipeline -- --output project-testing/reports/default-master-plan-production-readiness/runtime-seed-evidence-pipeline.json',
      },
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --publication-key <publication-key> --writer-result <dependency-writer-result.json>',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-06T03:15:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunRuntimeSeedEvidencePipeline, true)
    assert.deepEqual(report.runtimeSeedEvidencePipelineBlockers, [])
    assert.equal(report.runtimeSeedRepairPlan.status, 'blocked')
    assert.deepEqual(report.runtimeSeedRepairPlan.requiredStepIds, ['start_local_supabase'])
    assert.deepEqual(report.runtimeSeedRepairPlan.orderedSteps.map((step) => step.id), ['start_local_supabase'])
    assert.equal(report.mayRunSourceExport, false)
    assert.equal(report.sourceExportBlockers.includes('handoff_contains_source_export_placeholders'), true)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /runtimeSeedRepairPlanStatus: blocked/)
    assert.match(markdown, /runtimeSeedRepairPlanRequiredStepIds: start_local_supabase/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows runtime seed import execution dry-run while production evidence remains blocked', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    publicationKey: '<publication-key>',
    currentBlockers: [
      'runtime_seed_import_execution_status_runtime_seed_import_execution_blocked',
      'runtime_publication_evidence',
    ],
    runtimeSeedImportExecution: {
      status: 'runtime_seed_import_execution_blocked',
      artifact: 'project-testing/reports/default-master-plan-profiles/runtime-seed-import-execution.json',
      importGate: {
        status: 'runtime_seed_import_blocked',
        importAllowed: false,
        blockers: ['local_supabase_must_be_reachable_before_seed_import'],
        manualActions: ['WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT=1'],
      },
      postImportVerification: {
        provided: false,
        status: 'not_provided',
        verified: false,
        activeStandardWorkDurationSeedReady: false,
        activeT2RhythmTemplateReady: false,
        blockers: ['runtime_seed_post_import_verification_file_required'],
      },
      executionControl: {
        executionAllowed: false,
        allowImportFlagPresent: false,
        seedSmokeUserId: '',
        governedImportCommand: 'npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs --import-active-standard-duration-seed-smoke',
      },
      blockers: [
        'runtime_seed_import_gate_not_allowed',
        'runtime_seed_import_execution_allow_import_required',
        'runtime_seed_import_seed_smoke_user_id_required',
        'local_duration_asset_seed_import_unlock_required',
      ],
    },
    actionSequence: [
      {
        id: 'runtime_seed_import_readiness_seal',
        gate: 'runtime_seed_and_reference_days_evidence',
        command: 'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs --import-gate project-testing/reports/default-master-plan-profiles/runtime-seed-import-gate.json --execution project-testing/reports/default-master-plan-profiles/runtime-seed-import-execution.json --output project-testing/reports/default-master-plan-profiles/runtime-seed-import-readiness-seal.json',
      },
      {
        id: 'runtime_seed_import_execution',
        gate: 'runtime_seed_and_reference_days_evidence',
        command: 'npm run evidence:default-master-plan:runtime-seed-import-execution -- --output project-testing/reports/default-master-plan-profiles/runtime-seed-import-execution.json',
      },
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --publication-key <publication-key> --writer-result <dependency-writer-result.json>',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-06T08:55:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayCheckRuntimeSeedImportReadinessSeal, true)
    assert.deepEqual(report.runtimeSeedImportReadinessSealBlockers, [])
    assert.equal(report.mayRunRuntimeSeedImportExecution, true)
    assert.deepEqual(report.runtimeSeedImportExecutionBlockers, [])
    assert.equal(report.mayRunSourceExport, false)
    assert.equal(report.sourceExportBlockers.includes('handoff_contains_source_export_placeholders'), true)
    assert.equal(report.actionReadiness.runnableActionIds.includes('runtime_seed_import_readiness_seal'), true)
    assert.equal(report.actionReadiness.runnableActionIds.includes('runtime_seed_import_execution'), true)
    assert.equal(report.mayExecuteRuntimeSeedImportWrite, false)
    assert.equal(report.writeExecutionReadiness.blockedActionIds.includes('runtime_seed_import_execution'), true)
    assert.equal(report.writeExecutionBlockedActionIds.includes('runtime_seed_import_execution'), true)
    assert.equal(
      report.runtimeSeedImportWriteExecutionBlockers.includes('runtime_seed_import_execution_import_gate_not_allowed'),
      true,
    )
    assert.equal(
      report.runtimeSeedImportWriteExecutionBlockers.includes('runtime_seed_import_execution_allow_import_required'),
      true,
    )
    assert.equal(
      report.runtimeSeedImportWriteExecutionBlockers.includes('runtime_seed_import_execution_seed_smoke_user_id_required'),
      true,
    )
    assert.equal(
      report.runtimeSeedImportWriteExecutionBlockers.includes('runtime_seed_import_execution_local_duration_asset_seed_import_unlock_required'),
      true,
    )
    const writeDetail = report.writeExecutionBlockedActionDetails.find((item) => item.actionId === 'runtime_seed_import_execution')
    assert.deepEqual(writeDetail.nextRequirements.requiredFlags, [{
      flag: '--allow-import',
      blockerCodes: ['runtime_seed_import_execution_allow_import_required'],
    }])
    assert.deepEqual(writeDetail.nextRequirements.operatorFields, [{
      field: '--seed-smoke-user-id',
      blockerCodes: ['runtime_seed_import_execution_seed_smoke_user_id_required'],
    }])
    assert.equal(
      writeDetail.nextRequirements.envUnlocks.some((unlock) => unlock.variable === 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT'),
      true,
    )
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /mayRunRuntimeSeedImportExecution: true/)
    assert.match(markdown, /mayExecuteRuntimeSeedImportWrite: false/)
    assert.match(markdown, /writeExecutionBlockedActionIds: runtime_seed_import_execution/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('summarizes runnable and blocked handoff actions for operator sequencing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-actions-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const missingSampleMaterialPath = path.join(root, 'real-duration-sample-material.json')
  const materialPreflightPath = path.join(root, 'real-duration-sample-material-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: [
      'runtime_seed_pipeline_runtime_reference_days_evidence_missing',
      'duration_samples_operator_supplied_real_duration_sample_export_required',
    ],
    runtimeSeedEvidencePipeline: {
      status: 'runtime_seed_import_blocked',
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-seed-evidence-pipeline.json',
    },
    actionSequence: [
      {
        id: 'runtime_seed_evidence_pipeline',
        gate: 'runtime_seed_and_reference_days_evidence',
        command: 'npm run evidence:default-master-plan:runtime-seed-pipeline -- --output project-testing/reports/default-master-plan-production-readiness/runtime-seed-evidence-pipeline.json',
      },
      {
        id: 'real_duration_sample_material_template',
        gate: 'duration_sample_collection_package',
        command: 'npm run evidence:default-master-plan:real-duration-sample-template -- --collection-package project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --output project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material.template.json --prepared-by release-operator-1',
      },
      {
        id: 'real_duration_sample_material_preflight',
        gate: 'duration_sample_collection_package',
        command: `npm run evidence:default-master-plan:real-duration-sample-preflight -- --collection-package project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --sample-material ${missingSampleMaterialPath} --output ${materialPreflightPath} --checked-by release-operator-1`,
      },
      {
        id: 'runtime_material_package',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:runtime-material-package -- --handoff project-testing/reports/default-master-plan-production-readiness/operator-handoff.json --output project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json --environment staging --exported-by release-operator-1',
      },
      {
        id: 'real_production_outcome_package',
        gate: 'real_production_outcome_material',
        command: 'npm run evidence:default-master-plan:real-outcome-package -- --handoff project-testing/reports/default-master-plan-production-readiness/operator-handoff.json --runtime-material-package project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json --output project-testing/reports/default-master-plan-production-readiness/real-production-outcome-package.json --target-environment production --exported-by release-operator-1',
      },
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment staging --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json',
      },
      {
        id: 'pm_review_record',
        gate: 'project_manager_review_evidence',
        command: 'npm run evidence:default-master-plan:record-review -- --baseline-id baseline-1 --project-id project-1 --reviewed-by "<human-project-manager-user-id>" --review-notes "<real-review-notes>" --review-package project-testing/reports/default-master-plan-production-readiness/pm-review-package.json --environment staging --exported-by release-operator-1 --mode execute',
      },
      {
        id: 'production_evidence_pipeline',
        gate: 'five_evidence_builders',
        command: productionPipelineCommand({ environment: 'staging' }),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-06T04:25:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.deepEqual(
      report.actionReadiness.runnableActionIds,
      [
        'runtime_seed_evidence_pipeline',
        'real_duration_sample_material_template',
        'runtime_material_package',
        'real_production_outcome_package',
        'source_export_collect',
      ],
    )
    assert.equal(report.actionReadiness.blockedActionIds.includes('pm_review_record'), false)
    assert.equal(report.actionReadiness.blockedActionIds.includes('real_duration_sample_material_preflight'), true)
    assert.equal(report.actionReadiness.blockedActionIds.includes('production_evidence_pipeline'), true)
    assert.equal(report.actionReadiness.actions.some((action) => action.actionId === 'pm_review_record'), false)
    assert.equal(report.pmReviewRecordBlockers.includes('pm_review_record_command_contains_placeholders'), true)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /runnableActionIds: runtime_seed_evidence_pipeline/)
    assert.match(markdown, /blockedActionIds: /)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ignores legacy PM review record placeholders while candidate refresh execution is the active blocker', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-defer-pm-review-record-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: [
      'candidate_baseline_refresh_required_before_runtime_publication',
      'candidate_refresh_db_connection_failed',
      'candidate_refresh_db_execution_failed',
    ],
    actionSequence: [
      {
        id: 'candidate_refresh_package',
        gate: 'candidate_refresh',
        command: 'npm run evidence:default-master-plan:candidate-refresh-package -- --profile-report project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.json --hygiene project-testing/reports/default-master-plan-production-readiness/candidate-export-hygiene.json --output project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json',
      },
      {
        id: 'pm_review_record',
        gate: 'project_manager_review_evidence',
        command: 'npm run evidence:default-master-plan:record-review -- --baseline-id baseline-1 --project-id project-1 --reviewed-by "<human-project-manager-user-id>" --review-notes "<real-review-notes>" --review-package project-testing/reports/default-master-plan-production-readiness/pm-review-package.json --environment staging --exported-by release-operator-1 --mode execute',
      },
      {
        id: 'production_evidence_pipeline',
        gate: 'five_evidence_builders',
        command: productionPipelineCommand({ environment: 'staging' }),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-07T14:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.blockers.includes('pm_review_record_command_contains_placeholders'), false)
    assert.equal(report.blockers.includes('handoff_contains_placeholders'), false)
    assert.equal(report.pmReviewRecordBlockers.includes('pm_review_record_command_contains_placeholders'), true)
    assert.equal(report.placeholderFindings.length, 2)
    assert.equal(report.deferredPlaceholderFindingCount, 2)
    assert.equal(report.actionReadiness.blockedActionIds.includes('pm_review_record'), false)
    assert.equal(report.actionReadiness.deferredActionIds.includes('pm_review_record'), false)
    assert.equal(report.actionReadiness.actions.some((action) => action.actionId === 'pm_review_record'), false)
    assert.equal(report.productionEvidencePipelineBlockers.includes('pm_review_record_command_contains_placeholders'), false)
    assert.equal(report.productionEvidencePipelineBlockers.includes('handoff_contains_placeholders'), false)
    assert.equal(report.productionEvidencePipelineBlockers.includes('handoff_current_blockers_not_empty'), true)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /deferredActionIds: none/)
    assert.match(markdown, /deferredPlaceholderFindingCount: 2/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks task-export duration sample material until runtime task alignment review is closed', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-runtime-alignment-chain-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const collectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const completedTaskExportPath = path.join(root, 'completed-task-export.json')
  const sampleMaterialPath = path.join(root, 'real-duration-sample-material.json')

  await writeJson(collectionPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
  })
  await writeJson(completedTaskExportPath, {
    schemaVersion: 'workbuddy-completed-task-export/v1',
  })
  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: [
      'completed_task_export_status_blocked',
      'runtime_candidate_alignment_status_blocked',
      'runtime_task_alignment_refresh_package_runtime_task_alignment_operator_review_required',
    ],
    actionSequence: [
      {
        id: 'real_duration_sample_material_from_task_export',
        gate: 'duration_sample_collection_package',
        command: `npm run evidence:default-master-plan:real-duration-sample-from-task-export -- --collection-package ${collectionPackagePath} --completed-task-export ${completedTaskExportPath} --output ${sampleMaterialPath} --source-name school-completed-task-export --evidence-ref completed-task-export:school#sha256=abc123 --operator-review-ref pm-review:duration-samples-reviewed --prepared-by release-operator-1`,
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-06T17:25:00.000Z'),
    })

    assert.equal(report.mayBuildRealDurationSampleMaterialFromTaskExport, false)
    assert.equal(
      report.realDurationSampleMaterialFromTaskExportBlockers.includes('real_duration_sample_material_from_task_export_completed_task_export_not_ready'),
      true,
    )
    assert.equal(
      report.realDurationSampleMaterialFromTaskExportBlockers.includes('real_duration_sample_material_from_task_export_runtime_candidate_alignment_not_ready'),
      true,
    )
    assert.equal(
      report.realDurationSampleMaterialFromTaskExportBlockers.includes('real_duration_sample_material_from_task_export_runtime_task_alignment_refresh_package_not_ready'),
      true,
    )
    assert.equal(report.actionReadiness.blockedActionIds.includes('real_duration_sample_material_from_task_export'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks task-export duration sample material until runtime task alignment review evidence is accepted', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-runtime-review-chain-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const collectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const completedTaskExportPath = path.join(root, 'completed-task-export.json')
  const sampleMaterialPath = path.join(root, 'real-duration-sample-material.json')

  await writeJson(collectionPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
  })
  await writeJson(completedTaskExportPath, {
    schemaVersion: 'workbuddy-completed-task-export/v1',
  })
  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: [
      'runtime_task_alignment_review_evidence_status_blocked',
    ],
    actionSequence: [
      {
        id: 'real_duration_sample_material_from_task_export',
        gate: 'duration_sample_collection_package',
        command: `npm run evidence:default-master-plan:real-duration-sample-from-task-export -- --collection-package ${collectionPackagePath} --completed-task-export ${completedTaskExportPath} --output ${sampleMaterialPath} --source-name school-completed-task-export --evidence-ref completed-task-export:school#sha256=abc123 --operator-review-ref pm-review:duration-samples-reviewed --prepared-by release-operator-1`,
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-07T02:35:00.000Z'),
    })

    assert.equal(report.mayBuildRealDurationSampleMaterialFromTaskExport, false)
    assert.equal(
      report.realDurationSampleMaterialFromTaskExportBlockers.includes('real_duration_sample_material_from_task_export_runtime_task_alignment_review_not_ready'),
      true,
    )
    assert.equal(report.actionReadiness.blockedActionIds.includes('real_duration_sample_material_from_task_export'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks runtime seed evidence pipeline rerun when output binding is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['runtime_seed_pipeline_runtime_reference_days_evidence_missing'],
    actionSequence: [
      {
        id: 'runtime_seed_evidence_pipeline',
        gate: 'runtime_seed_and_reference_days_evidence',
        command: 'npm run evidence:default-master-plan:runtime-seed-pipeline',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-06T03:16:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunRuntimeSeedEvidencePipeline, false)
    assert.equal(
      report.runtimeSeedEvidencePipelineBlockers.includes('runtime_seed_evidence_pipeline_output_missing'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks runtime seed import execution dry-run when output binding is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['runtime_seed_import_execution_status_runtime_seed_import_execution_blocked'],
    actionSequence: [
      {
        id: 'runtime_seed_import_execution',
        gate: 'runtime_seed_and_reference_days_evidence',
        command: 'npm run evidence:default-master-plan:runtime-seed-import-execution',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-06T08:56:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunRuntimeSeedImportExecution, false)
    assert.equal(
      report.runtimeSeedImportExecutionBlockers.includes('runtime_seed_import_execution_output_missing'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production pipeline when readiness check omits runtime seed pipeline binding', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: [],
    runtimeSeedEvidencePipeline: {
      status: 'runtime_seed_import_blocked',
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-seed-evidence-pipeline.json',
    },
    actionSequence: [
      {
        id: 'production_evidence_pipeline',
        command: productionPipelineCommand(),
      },
      {
        id: 'evidence_bundle',
        command: fiveEvidenceCommand('node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs --output-root project-testing/reports/default-master-plan-production-readiness'),
      },
      {
        id: 'readiness_check',
        command: `${fiveEvidenceCommand('node project-testing/tools/check-default-master-plan-production-readiness.mjs')} --runtime-seed-evidence-pipeline project-testing/reports/default-master-plan-production-readiness/runtime-seed-evidence-pipeline.json`
          .replace(/ --runtime-seed-evidence-pipeline \S+/, ''),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-06T03:17:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(
      report.productionEvidencePipelineBlockers.includes('readiness_check_runtime_seed_evidence_pipeline_missing'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks duration sample collection package build when profile report binding is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['runtime_duration_calibration_evidence'],
    actionSequence: [
      {
        id: 'duration_sample_collection_package',
        gate: 'runtime_duration_calibration_evidence',
        command: 'npm run evidence:default-master-plan:duration-sample-package -- --duration-gap-plan project-testing/reports/default-master-plan-production-readiness/duration-sample-gap-plan-school.json --output project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --environment staging --exported-by release-operator-1',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:56:30.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildDurationSampleCollectionPackage, false)
    assert.equal(
      report.durationSampleCollectionPackageBlockers.includes('duration_sample_collection_package_profile_report_missing'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows scoped duration sample collection package build command', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['runtime_duration_calibration_evidence'],
    actionSequence: [
      {
        id: 'duration_sample_collection_package',
        gate: 'runtime_duration_calibration_evidence',
        command: 'npm run evidence:default-master-plan:duration-sample-package -- --duration-gap-plan project-testing/reports/default-master-plan-production-readiness/duration-sample-gap-plan-school.json --profile-report project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.json --duration-asset-utilization-report project-testing/reports/default-master-plan-production-readiness/duration-asset-utilization-report.json --business-type school --profile-scope target --baseline-id baseline-1 --project-id project-1 --output project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --environment staging --exported-by release-operator-1',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-06T14:02:00.000Z'),
    })

    assert.equal(report.mayBuildDurationSampleCollectionPackage, true)
    assert.deepEqual(report.durationSampleCollectionPackageBlockers, [])
    assert.equal(
      report.blockers.includes('duration_sample_collection_package_profile_scope_all_required'),
      false,
    )
    assert.equal(
      report.blockers.includes('duration_sample_collection_package_profile_only_required'),
      false,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks duration sample collection package build when duration asset utilization report binding is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['runtime_duration_calibration_evidence'],
    actionSequence: [
      {
        id: 'duration_sample_collection_package',
        gate: 'runtime_duration_calibration_evidence',
        command: 'npm run evidence:default-master-plan:duration-sample-package -- --duration-gap-plan project-testing/reports/default-master-plan-production-readiness/duration-sample-gap-plan-school.json --profile-report project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.json --output project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --environment staging --exported-by release-operator-1',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-04T19:07:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildDurationSampleCollectionPackage, false)
    assert.equal(
      report.durationSampleCollectionPackageBlockers.includes('duration_sample_collection_package_duration_asset_utilization_report_missing'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows duration sample coverage verification after review-duration source export is resolved', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    publicationKey: '<publication-key>',
    currentBlockers: ['duration_sample_collection_package'],
    actionSequence: [
      {
        id: 'duration_sample_coverage',
        gate: 'duration_sample_collection_package',
        command: 'npm run evidence:default-master-plan:duration-sample-coverage -- --collection-package project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --samples project-testing/reports/default-master-plan-production-readiness/source-exports/duration-experience-samples-export.json --output project-testing/reports/default-master-plan-production-readiness/duration-sample-coverage-evidence.json',
      },
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --publication-key <publication-key> --writer-result <dependency-writer-result.json>',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:57:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayVerifyDurationSampleCoverage, true)
    assert.deepEqual(report.durationSampleCoverageBlockers, [])
    assert.equal(report.mayRunSourceExport, false)
    assert.equal(report.sourceExportBlockers.includes('handoff_contains_source_export_placeholders'), true)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /mayVerifyDurationSampleCoverage: true/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('validates the real duration sample source export action without writing production sample rows', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const collectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const sampleMaterialPath = path.join(root, 'real-duration-sample-material.json')
  const materialPreflightPath = path.join(root, 'real-duration-sample-material-preflight.json')

  await writeReadyRealDurationSampleMaterialPreflight(materialPreflightPath, {
    collectionPackagePath,
    sampleMaterialPath,
  })

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['duration_sample_collection_package'],
    actionSequence: [
      {
        id: 'real_duration_sample_source_export',
        gate: 'duration_sample_collection_package',
        command: [
          'npm run evidence:default-master-plan:real-duration-sample-export --',
          `--collection-package ${collectionPackagePath}`,
          `--sample-material ${sampleMaterialPath}`,
          `--material-preflight ${materialPreflightPath}`,
          '--output project-testing/reports/default-master-plan-production-readiness/source-exports/duration-experience-samples-export.json',
          '--environment staging',
          '--exported-by release-operator-1',
        ].join(' '),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-05T03:10:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildRealDurationSampleSourceExport, true)
    assert.deepEqual(report.realDurationSampleSourceExportBlockers, [])

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /mayBuildRealDurationSampleSourceExport: true/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('validates the real duration sample material template action without writing sample rows', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['duration_sample_collection_package'],
    actionSequence: [
      {
        id: 'real_duration_sample_material_template',
        gate: 'duration_sample_collection_package',
        command: 'npm run evidence:default-master-plan:real-duration-sample-template -- --collection-package project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --output project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material.template.json --prepared-by release-operator-1',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-05T03:09:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildRealDurationSampleMaterialTemplate, true)
    assert.deepEqual(report.realDurationSampleMaterialTemplateBlockers, [])

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /mayBuildRealDurationSampleMaterialTemplate: true/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('summarizes the real duration sample collection kit without treating it as duration sample evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-collection-kit-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const collectionKitPath = path.join(root, 'real-duration-sample-collection-kit.json')

  await writeJson(collectionKitPath, {
    schemaVersion: 'workbuddy-real-duration-sample-collection-kit/v1',
    productionReady: false,
    noWriteBoundary: 'operator_collection_kit_only_no_db_write',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    targetSource: 'real_evidence_gap_summary',
    summary: {
      targetCount: 2,
      businessTypeGroupCount: 1,
      missingSampleCount: 2,
      invalidSampleCount: 0,
    },
    businessTypeGroups: [{
      businessType: 'school',
      targetCount: 2,
      missingSampleCount: 2,
      invalidSampleCount: 0,
      rows: [{
        priority: 1,
        businessType: 'school',
        stableCode: 'BTMP-SCH-01',
        title: '教学楼基础与地下结构',
        candidateReferenceDays: 90,
        nextAction: 'collect_accepted_real_duration_sample',
      }],
    }],
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
      performsRollback: false,
    },
  })

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['duration_sample_collection_package'],
    actionSequence: [
      {
        id: 'real_duration_sample_material_template',
        gate: 'duration_sample_collection_package',
        command: `npm run evidence:default-master-plan:real-duration-sample-template -- --collection-package project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --real-evidence-gap-summary project-testing/reports/default-master-plan-production-readiness/real-evidence-gap-summary.json --collection-kit-output ${collectionKitPath} --output project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material.template.json --prepared-by release-operator-1`,
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-05T03:09:15.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildRealDurationSampleMaterialTemplate, true)
    assert.deepEqual(report.realDurationSampleMaterialTemplateBlockers, [])
    assert.equal(report.realDurationSampleCollectionKit.status, 'operator_collection_required')
    assert.equal(report.realDurationSampleCollectionKit.productionReady, false)
    assert.equal(report.realDurationSampleCollectionKit.noWriteBoundary, 'operator_collection_kit_only_no_db_write')
    assert.equal(report.realDurationSampleCollectionKit.targetCount, 2)
    assert.equal(report.realDurationSampleCollectionKit.businessTypeGroupCount, 1)
    assert.equal(report.realDurationSampleCollectionKit.writesDurationSamples, false)
    assert.equal(report.realDurationSampleCollectionKit.writesRuntimePublication, false)
    assert.deepEqual(report.realDurationSampleCollectionKit.blockers, [])

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /realDurationSampleCollectionKitStatus: operator_collection_required/)
    assert.match(markdown, /realDurationSampleCollectionKitTargetCount: 2/)
    assert.match(markdown, /realDurationSampleCollectionKitNoWriteBoundary: operator_collection_kit_only_no_db_write/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks the real duration sample material template action when output binding is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['duration_sample_collection_package'],
    actionSequence: [
      {
        id: 'real_duration_sample_material_template',
        gate: 'duration_sample_collection_package',
        command: 'node project-testing/tools/build-default-master-plan-real-duration-sample-material-template.mjs --collection-package project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --prepared-by release-operator-1',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-05T03:09:30.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildRealDurationSampleMaterialTemplate, false)
    assert.equal(
      report.realDurationSampleMaterialTemplateBlockers.includes('real_duration_sample_material_template_output_missing'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('validates the real duration sample material preflight action without writing exports or sample rows', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const collectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const sampleMaterialPath = path.join(root, 'real-duration-sample-material.json')

  await writeJson(collectionPackagePath, { schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1' })
  await writeJson(sampleMaterialPath, { schemaVersion: 'workbuddy-real-duration-sample-material/v1', samples: [] })

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['duration_sample_collection_package'],
    actionSequence: [
      {
        id: 'real_duration_sample_material_preflight',
        gate: 'duration_sample_collection_package',
        command: `npm run evidence:default-master-plan:real-duration-sample-preflight -- --collection-package ${collectionPackagePath} --sample-material ${sampleMaterialPath} --output project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material-preflight.json --checked-by release-operator-1`,
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-05T08:21:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayCheckRealDurationSampleMaterial, true)
    assert.deepEqual(report.realDurationSampleMaterialPreflightBlockers, [])

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /mayCheckRealDurationSampleMaterial: true/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks the real duration sample material preflight action when sample material file is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const collectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const sampleMaterialPath = path.join(root, 'missing-real-duration-sample-material.json')

  await writeJson(collectionPackagePath, { schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1' })

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['duration_sample_collection_package'],
    actionSequence: [
      {
        id: 'real_duration_sample_material_preflight',
        gate: 'duration_sample_collection_package',
        command: `node project-testing/tools/check-default-master-plan-real-duration-sample-material-preflight.mjs --collection-package ${collectionPackagePath} --sample-material ${sampleMaterialPath} --output project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material-preflight.json --checked-by release-operator-1`,
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-05T08:21:30.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayCheckRealDurationSampleMaterial, false)
    assert.equal(
      report.realDurationSampleMaterialPreflightBlockers.includes('real_duration_sample_material_preflight_sample_material_missing'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks the real duration sample material preflight action when checked-by is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['duration_sample_collection_package'],
    actionSequence: [
      {
        id: 'real_duration_sample_material_preflight',
        gate: 'duration_sample_collection_package',
        command: 'node project-testing/tools/check-default-master-plan-real-duration-sample-material-preflight.mjs --collection-package project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --sample-material project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material.json --output project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material-preflight.json',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-05T08:22:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayCheckRealDurationSampleMaterial, false)
    assert.equal(
      report.realDurationSampleMaterialPreflightBlockers.includes('real_duration_sample_material_preflight_checked_by_missing'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks the real duration sample source export action when sample material binding is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['duration_sample_collection_package'],
    actionSequence: [
      {
        id: 'real_duration_sample_source_export',
        gate: 'duration_sample_collection_package',
        command: 'node project-testing/tools/build-default-master-plan-real-duration-sample-source-export.mjs --collection-package project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --output project-testing/reports/default-master-plan-production-readiness/source-exports/duration-experience-samples-export.json --environment staging --exported-by release-operator-1',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-05T03:11:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildRealDurationSampleSourceExport, false)
    assert.equal(
      report.realDurationSampleSourceExportBlockers.includes('real_duration_sample_source_export_sample_material_missing'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks the real duration sample source export action when material preflight binding is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['duration_sample_collection_package'],
    actionSequence: [
      {
        id: 'real_duration_sample_source_export',
        gate: 'duration_sample_collection_package',
        command: 'node project-testing/tools/build-default-master-plan-real-duration-sample-source-export.mjs --collection-package project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --sample-material project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material.json --output project-testing/reports/default-master-plan-production-readiness/source-exports/duration-experience-samples-export.json --environment staging --exported-by release-operator-1',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-05T08:23:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildRealDurationSampleSourceExport, false)
    assert.equal(
      report.realDurationSampleSourceExportBlockers.includes('real_duration_sample_source_export_material_preflight_missing'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks the real duration sample source export action when material preflight is not ready', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const collectionPackagePath = path.join(root, 'duration-sample-collection-package.json')
  const sampleMaterialPath = path.join(root, 'real-duration-sample-material.json')
  const materialPreflightPath = path.join(root, 'real-duration-sample-material-preflight.json')

  await writeJson(materialPreflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-real-duration-sample-material-preflight/v1',
    status: 'blocked',
    collectionPackageRef: `duration_sample_collection_package:${collectionPackagePath}#sha256=aaaaaaaa`,
    sampleMaterialRef: `real_duration_sample_material:${sampleMaterialPath}#sha256=bbbbbbbb`,
    blockers: ['checked_by_required', 'accepted_real_duration_sample_material_coverage_incomplete'],
    mutationBoundary: {
      writesDurationSamples: false,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  })

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['duration_sample_collection_package'],
    actionSequence: [
      {
        id: 'real_duration_sample_source_export',
        gate: 'duration_sample_collection_package',
        command: `node project-testing/tools/build-default-master-plan-real-duration-sample-source-export.mjs --collection-package ${collectionPackagePath} --sample-material ${sampleMaterialPath} --material-preflight ${materialPreflightPath} --output project-testing/reports/default-master-plan-production-readiness/source-exports/duration-experience-samples-export.json --environment staging --exported-by release-operator-1`,
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-05T08:24:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildRealDurationSampleSourceExport, false)
    assert.equal(
      report.realDurationSampleSourceExportBlockers.includes('real_duration_sample_material_preflight_not_ready'),
      true,
    )
    assert.equal(
      report.realDurationSampleSourceExportBlockers.includes('real_duration_sample_material_preflight_accepted_real_duration_sample_material_coverage_incomplete'),
      true,
    )
    assert.equal(
      report.realDurationSampleSourceExportBlockers.includes('real_duration_sample_material_preflight_checked_by_required'),
      true,
    )
    const detail = report.blockedActionDetails.find((item) => item.actionId === 'real_duration_sample_source_export')
    assert.deepEqual(detail.nextRequirements.operatorFields, [{
      field: '--checked-by',
      blockerCodes: ['real_duration_sample_material_preflight_checked_by_required'],
    }])
    assert.equal(
      detail.nextRequirements.evidenceInputs.some((input) => input.artifact === 'real-duration-sample-material.json' && input.requiredStatus === 'accepted_real_duration_sample_material_coverage_complete'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks duration sample coverage verification when governed verifier flags are missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    currentBlockers: ['duration_sample_collection_package'],
    actionSequence: [
      {
        id: 'duration_sample_coverage',
        gate: 'duration_sample_collection_package',
        command: 'node project-testing/tools/verify-default-master-plan-duration-sample-coverage.mjs --collection-package project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --output project-testing/reports/default-master-plan-production-readiness/duration-sample-coverage-evidence.json',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:57:30.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayVerifyDurationSampleCoverage, false)
    assert.equal(
      report.durationSampleCoverageBlockers.includes('duration_sample_coverage_samples_missing'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows runtime material package build while source export and pipeline commands still contain placeholders', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    publicationKey: '<publication-key>',
    currentBlockers: ['runtime_publication_evidence'],
    actionSequence: [
      {
        id: 'runtime_material_package',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:runtime-material-package -- --handoff project-testing/reports/default-master-plan-production-readiness/operator-handoff.json --output project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json --environment staging --exported-by release-operator-1',
      },
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --publication-key <publication-key> --writer-result <dependency-writer-result.json>',
      },
      {
        id: 'production_evidence_pipeline',
        gate: 'five_evidence_builders',
        command: 'node project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs <source-export-pipeline-args>',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:57:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildRuntimeMaterialPackage, true)
    assert.deepEqual(report.runtimeMaterialPackageBlockers, [])
    assert.equal(report.mayRunSourceExport, false)
    assert.equal(report.sourceExportBlockers.includes('handoff_contains_source_export_placeholders'), true)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /mayBuildRuntimeMaterialPackage: true/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows real production outcome package build before production outcome material exists', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: ['real_production_or_live_outcome_evidence_required'],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'real_production_outcome_package',
        gate: 'real_production_outcome_material',
        command: 'npm run evidence:default-master-plan:real-outcome-package -- --handoff project-testing/reports/default-master-plan-production-readiness/operator-handoff.json --runtime-material-package project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json --output project-testing/reports/default-master-plan-production-readiness/real-production-outcome-package.json --target-environment production --exported-by release-operator-1',
      },
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome <real-production-outcome.json>',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T04:57:30.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayBuildRealProductionOutcomePackage, true)
    assert.deepEqual(report.realProductionOutcomePackageBlockers, [])
    assert.equal(report.mayAcceptRealProductionOutcomeEvidence, false)
    assert.equal(report.realProductionOutcomeEvidenceBlockers.includes('real_production_outcome_material_required'), true)
    assert.equal(report.mayRunSourceExport, false)
    assert.equal(report.sourceExportBlockers.includes('real_production_outcome_material_required'), true)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /mayBuildRealProductionOutcomePackage: true/)
    assert.match(markdown, /mayAcceptRealProductionOutcomeEvidence: false/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks full source export when runtime material package reports unresolved files or identity blockers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: ['runtime_material_files_missing'],
    runtimeMaterialPackage: {
      status: 'runtime_material_files_missing',
      requiredMaterialCount: 0,
      blockers: ['runtime_material_files_missing'],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment staging --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json',
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T05:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunSourceExport, false)
    assert.equal(report.sourceExportBlockers.includes('runtime_material_package_not_resolved'), true)
    assert.equal(report.sourceExportBlockers.includes('runtime_material_files_missing'), true)
    assert.equal(report.mayBuildRuntimeMaterialPackage, true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /runtime_material_package_not_resolved/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production source export when real production outcome material is not in the handoff command', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json',
      },
      {
        id: 'production_evidence_pipeline',
        gate: 'five_evidence_builders',
        command: productionPipelineCommand(),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T05:05:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunSourceExport, false)
    assert.equal(report.mayAcceptRealProductionOutcomeEvidence, false)
    assert.equal(report.realProductionOutcomeEvidenceBlockers.includes('real_production_outcome_material_required'), true)
    assert.equal(report.mayRunProductionEvidencePipeline, false)
    assert.equal(report.sourceExportBlockers.includes('real_production_outcome_material_required'), true)
    assert.equal(report.productionEvidencePipelineBlockers.includes('real_production_outcome_material_required'), true)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /real_production_outcome_material_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production source export when real production outcome material is not qualified', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeJson(realProductionOutcome, {
    status: 'draft',
    environment: 'staging',
    baselineId: 'wrong-baseline',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
  })
  await writeJson(handoffPath, operatorHandoffFixture({
    status: 'production_ready_handoff_complete',
    productionReady: true,
    publicationKey: 'default-master-plan-runtime-publication-1',
    currentBlockers: [],
    runtimeMaterialPackage: {
      status: 'runtime_materials_resolved',
      requiredMaterialCount: 0,
      blockers: [],
      artifact: 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json',
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --exported-by release-operator-1 --writer-result project-testing/reports/default-master-plan-production-readiness/dependency-writer-result.json --critical-path-readback project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json --api-read-smoke project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json --ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json --rollback-verification project-testing/reports/default-master-plan-production-readiness/rollback-verification.json --real-production-outcome ${realProductionOutcome}`,
      },
      {
        id: 'production_evidence_pipeline',
        gate: 'five_evidence_builders',
        command: productionPipelineCommand({ realProductionOutcome }),
      },
    ],
  }))

  try {
    const report = await checkDefaultMasterPlanOperatorHandoffPreflight({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T05:06:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayRunSourceExport, false)
    assert.equal(report.mayAcceptRealProductionOutcomeEvidence, false)
    assert.equal(report.realProductionOutcomeEvidenceBlockers.includes('real_production_outcome_status_pass_required'), true)
    assert.equal(report.sourceExportBlockers.includes('real_production_outcome_status_pass_required'), true)
    assert.equal(report.sourceExportBlockers.includes('real_production_outcome_environment_mismatch'), true)
    assert.equal(report.sourceExportBlockers.includes('real_production_outcome_baseline_id_mismatch'), true)
    assert.equal(report.sourceExportBlockers.includes('real_production_outcome_evidence_ref_required'), true)
    assert.equal(report.productionEvidencePipelineBlockers.includes('real_production_outcome_status_pass_required'), true)

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /real_production_outcome_status_pass_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('prints PM review package readiness in CLI summary output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-preflight-cli-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'operator-handoff-preflight.json')

  await writeJson(handoffPath, operatorHandoffFixture({
    productionReady: false,
    publicationKey: '<publication-key>',
    currentBlockers: ['project_manager_review_evidence'],
    actionSequence: [
      {
        id: 'pm_review_package',
        gate: 'project_manager_review_evidence',
        command: 'npm run evidence:default-master-plan:review-package -- --candidate-baseline project-testing/reports/default-master-plan-production-readiness/candidate-baseline.json --output project-testing/reports/default-master-plan-production-readiness/pm-review-package.json --environment staging --exported-by release-operator-1',
      },
      {
        id: 'pm_review_record',
        gate: 'project_manager_review_evidence',
        command: 'npm run evidence:default-master-plan:record-review -- --reviewed-by <human-project-manager-user-id>',
      },
    ],
  }))

  try {
    const { stdout } = await execFileAsync(process.execPath, [
      'project-testing/tools/check-default-master-plan-operator-handoff-preflight.mjs',
      '--handoff',
      handoffPath,
      '--output',
      outputPath,
    ], { cwd: process.cwd() })
    const summary = JSON.parse(stdout)

    assert.equal(summary.mayBuildReviewPackage, true)
    assert.equal(summary.mayRunProductionEvidencePipeline, false)
    assert.deepEqual(summary.deferredActionIds, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function operatorHandoffFixture(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-production-operator-handoff/v1',
    status: overrides.status ?? 'blocked',
    productionReady: overrides.productionReady ?? false,
    environment: overrides.environment ?? 'staging',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: overrides.publicationKey ?? 'default-master-plan-runtime-publication-1',
    identityConsistency: {
      matches: true,
      baselineId: 'baseline-1',
      projectId: 'project-1',
      sources: [],
      mismatches: [],
    },
    currentBlockers: overrides.currentBlockers ?? [],
    runtimeSeedEvidencePipeline: overrides.runtimeSeedEvidencePipeline,
    runtimeSeedImportExecution: overrides.runtimeSeedImportExecution,
    completedTaskExport: overrides.completedTaskExport,
    runtimeMaterialPackage: overrides.runtimeMaterialPackage,
    actionSequence: overrides.actionSequence ?? [],
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      invokesRuntimeWriters: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeReadyRealDurationSampleCollectionKit(filePath) {
  await writeJson(filePath, {
    schemaVersion: 'workbuddy-real-duration-sample-collection-kit/v1',
    productionReady: false,
    noWriteBoundary: 'operator_collection_kit_only_no_db_write',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    summary: {
      targetCount: 1,
      businessTypeGroupCount: 1,
      missingSampleCount: 0,
      invalidSampleCount: 0,
    },
    businessTypeGroups: [{
      businessType: 'school',
      targetCount: 1,
      missingSampleCount: 0,
      invalidSampleCount: 0,
      rows: [{
        priority: 1,
        businessType: 'school',
        stableCode: 'BTMP-SCH-01',
        title: '??????????',
        operatorFields: {
          sourceProjectName: 'school-production-project',
          sourceTaskName: '??????????',
          sourceTaskId: 'source-task-1',
          actualDurationDays: 90,
          startedAt: '2026-01-01',
          completedAt: '2026-03-31',
          evidenceRef: 'source-task-export:school#sha256=abc123',
          operatorReviewRef: 'pm-review:duration-samples-reviewed',
        },
      }],
    }],
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
      performsRollback: false,
    },
  })
}

async function writeReadyRealDurationSampleCollectionKitPreflight(filePath) {
  await writeJson(filePath, {
    schemaVersion: 'workbuddy-default-master-plan-real-duration-sample-collection-kit-preflight/v1',
    status: 'ready_for_real_duration_sample_material_build',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    checkedBy: 'release-operator-1',
    collectionKitRef: 'real_duration_sample_collection_kit:real-duration-sample-collection-kit.json#sha256=aaaaaaaa',
    summary: {
      targetRowCount: 1,
      readyRowCount: 1,
      invalidRowCount: 0,
      businessTypeGroupCount: 1,
    },
    materialSampleCandidates: [{
      id: 'operator-real-duration:BTMP-SCH-01:source-task-1',
      stableCode: 'BTMP-SCH-01',
      title: 'school main preparation',
      businessType: 'school',
      projectId: 'project-1',
      taskId: 'source-task-1',
      actualDurationDays: 90,
      startedAt: '2026-01-01',
      completedAt: '2026-03-31',
      sourceType: 'completed_task',
      sampleStatus: 'accepted',
      includedInBenchmark: true,
      evidenceRef: 'source-task-export:school#sha256=abc123',
      operatorReviewRef: 'pm-review:duration-samples-reviewed',
      sourceEvidence: {
        sourceProjectName: 'school-production-project',
        sourceTaskName: 'school main preparation',
        sourceTaskId: 'source-task-1',
      },
      metadata: {
        collectionKitPreflight: true,
        stagingControlledReplay: false,
        notRealProductionOutcome: false,
      },
    }],
    invalidRows: [],
    blockers: [],
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
      performsRollback: false,
    },
  })
}

async function writeReadyRealDurationSampleMaterialPreflight(filePath, {
  collectionPackagePath = 'project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json',
  sampleMaterialPath = 'project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material.json',
} = {}) {
  await writeJson(filePath, {
    schemaVersion: 'workbuddy-default-master-plan-real-duration-sample-material-preflight/v1',
    status: 'ready_for_source_export',
    collectionPackageRef: `duration_sample_collection_package:${collectionPackagePath}#sha256=aaaaaaaa`,
    sampleMaterialRef: `real_duration_sample_material:${sampleMaterialPath}#sha256=bbbbbbbb`,
    blockers: [],
    mutationBoundary: {
      writesDurationSamples: false,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  })
}

function fiveEvidenceCommand(
  prefix,
  { sourceManifest = 'project-testing/reports/default-master-plan-production-readiness/source-exports/source-exports-manifest.json' } = {},
) {
  return [
    prefix,
    '--review-evidence project-testing/reports/default-master-plan-production-readiness/pm-review-evidence.json',
    '--duration-calibration-evidence project-testing/reports/default-master-plan-production-readiness/duration-calibration-evidence.json',
    '--dependency-writer-evidence project-testing/reports/default-master-plan-production-readiness/dependency-writer-evidence.json',
    '--runtime-publication-evidence project-testing/reports/default-master-plan-production-readiness/runtime-publication-evidence.json',
    '--post-publish-smoke-rollback-evidence project-testing/reports/default-master-plan-production-readiness/post-publish-smoke-rollback-evidence.json',
    `--source-manifest ${sourceManifest}`,
  ].join(' ')
}

function productionPipelineCommand({
  baselineId = 'baseline-1',
  projectId = 'project-1',
  publicationKey = 'default-master-plan-runtime-publication-1',
  environment = 'production',
  realProductionOutcome = 'project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json',
  sourceManifest = 'project-testing/reports/default-master-plan-production-readiness/source-exports/source-exports-manifest.json',
} = {}) {
  return [
    'node project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs',
    `--baseline-id ${baselineId}`,
    `--project-id ${projectId}`,
    `--publication-key ${publicationKey}`,
    `--environment ${environment}`,
    '--review-export project-testing/reports/default-master-plan-production-readiness/source-exports/candidate-default-master-plan-review-export.json',
    '--duration-samples project-testing/reports/default-master-plan-production-readiness/source-exports/duration-experience-samples-export.json',
    '--writer-result project-testing/reports/default-master-plan-production-readiness/source-exports/dependency-writer-result-export.json',
    '--task-dependencies project-testing/reports/default-master-plan-production-readiness/source-exports/task-dependencies-export.json',
    '--runtime-publications project-testing/reports/default-master-plan-production-readiness/source-exports/duration-learning-runtime-publications-export.json',
    '--runtime-consumptions project-testing/reports/default-master-plan-production-readiness/source-exports/duration-learning-runtime-consumptions-export.json',
    '--api-read-smoke project-testing/reports/default-master-plan-production-readiness/source-exports/api-read-smoke-export.json',
    '--ui-consumption-smoke project-testing/reports/default-master-plan-production-readiness/source-exports/ui-consumption-smoke-export.json',
    '--critical-path-readback project-testing/reports/default-master-plan-production-readiness/source-exports/critical-path-readback-export.json',
    '--rollback-verification project-testing/reports/default-master-plan-production-readiness/source-exports/rollback-verification-export.json',
    `--real-production-outcome ${realProductionOutcome}`,
    `--source-manifest ${sourceManifest}`,
  ].join(' ')
}

async function writeQualifiedRealProductionOutcome(filePath) {
  await writeJson(filePath, {
    status: 'pass',
    environment: 'production',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json#sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    acceptedBy: 'production-owner:user-1',
    acceptedAt: '2026-07-02T05:00:00.000Z',
    approvalRef: 'approval:default-master-plan-production-release-1',
    target: {
      environment: 'production',
      supabaseProjectRef: 'abcd1234',
      databaseHost: 'db.abcd1234.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
    },
    runtimePublicationEvidenceRef: 'duration_learning_runtime_publications_export:project-testing/reports/default-master-plan-production-readiness/duration-learning-runtime-publications-export.json#sha256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    runtimeConsumptionEvidenceRef: 'duration_learning_runtime_consumptions_export:project-testing/reports/default-master-plan-production-readiness/duration-learning-runtime-consumptions-export.json#sha256=abababababababababababababababababababababababababababababababab',
    apiReadSmokeEvidenceRef: 'api_read_smoke_export:project-testing/reports/default-master-plan-production-readiness/api-read-smoke.json#sha256=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    uiConsumptionSmokeEvidenceRef: 'ui_consumption_smoke_export:project-testing/reports/default-master-plan-production-readiness/ui-consumption-smoke.json#sha256=dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    criticalPathReadbackEvidenceRef: 'critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    rollbackEvidenceRef: 'rollback_verification_export:project-testing/reports/default-master-plan-production-readiness/rollback-verification.json#sha256=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  })
}
