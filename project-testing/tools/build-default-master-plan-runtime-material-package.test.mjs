import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildDefaultMasterPlanRuntimeMaterialPackage,
} from './build-default-master-plan-runtime-material-package.mjs'

test('builds a no-write runtime material package from operator handoff placeholders', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-material-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'runtime-material-package.json')

  await writeJson(handoffPath, operatorHandoffFixture())

  try {
    const report = await buildDefaultMasterPlanRuntimeMaterialPackage({
      handoff: handoffPath,
      output: outputPath,
      environment: 'staging',
      exportedBy: 'release-operator-1',
      now: new Date('2026-07-02T08:00:00.000Z'),
    })

    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-runtime-material-package/v1')
    assert.equal(report.status, 'runtime_materials_required')
    assert.equal(report.productionReady, false)
    assert.equal(report.baselineId, 'baseline-1')
    assert.equal(report.projectId, 'project-1')
    assert.equal(report.requiredMaterialCount, 6)
    assert.deepEqual(report.requiredMaterials.map((item) => item.key), [
      'publicationKey',
      'dependencyWriterResult',
      'criticalPathReadback',
      'apiReadSmoke',
      'uiConsumptionSmoke',
      'rollbackVerification',
    ])
    assert.match(report.requiredMaterials[1].requiredEvidence, /execute-mode dependency writer result/)
    assert.match(report.requiredMaterials[3].requiredEvidence, /real-environment API read smoke/)
    assert.equal(report.nextCommands.sourceExport.includes('--publication-key <publication-key>'), true)
    assert.equal(report.nextCommands.productionEvidencePipeline.includes('<source-export-pipeline-args>'), true)
    assert.deepEqual(report.realProductionOutcomeTemplate.requiredFields, [
      'schemaVersion',
      'status',
      'environment',
      'target',
      'baselineId',
      'projectId',
      'publicationKey',
      'evidenceRef',
      'acceptedBy',
      'acceptedAt',
      'approvalRef',
      'runtimePublicationEvidenceRef',
      'apiReadSmokeEvidenceRef',
      'uiConsumptionSmokeEvidenceRef',
      'criticalPathReadbackEvidenceRef',
      'rollbackEvidenceRef',
    ])
    assert.equal(report.realProductionOutcomeTemplate.example.target.supabaseProjectRef, '<production-supabase-project-ref>')
    assert.equal(report.realProductionOutcomeTemplate.example.acceptedBy, 'production-owner:<user-id-or-uuid>')
    assert.equal(report.realProductionOutcomeTemplate.example.evidenceRef, '<path-to-real-production-outcome.json>#sha256=<64hex>')
    assert.equal(report.realProductionOutcomeTemplate.example.evidenceRef.includes('real-production-outcome:'), false)
    assert.equal(report.realProductionOutcomeTemplate.evidenceRefPolicy.rawInputAcceptedPrefix, 'file_path_sha256')
    assert.equal(report.realProductionOutcomeTemplate.evidenceRefPolicy.finalSourceExportPrefix, 'real_production_outcome_export')
    assert.equal(report.realProductionOutcomeTemplate.evidenceRefPolicy.finalReadinessRequiresSourceExportRef, true)
    assert.match(report.realProductionOutcomeTemplate.evidenceRefPolicy.sourceExporterRewrite, /real_production_outcome_export:/)
    assert.equal(report.mutationBoundary.writesProductionTables, false)
    assert.equal(report.mutationBoundary.invokesRuntimeWriters, false)
    assert.equal(report.mutationBoundary.writesRuntimePublication, false)

    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(written.requiredMaterialCount, 6)
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /publicationKey/)
    assert.match(markdown, /dependencyWriterResult/)
    assert.match(markdown, /Real Production Outcome Template/)
    assert.match(markdown, /rollbackEvidenceRef/)
    assert.match(markdown, /Final readiness requires `real_production_outcome_export:`/)
    assert.doesNotMatch(markdown, /real-production-outcome:<path>/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('marks the runtime material package ready when all runtime file paths and publication key are resolved', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-material-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'runtime-material-package.json')
  const materialsRoot = path.join(root, 'materials')
  const materialPaths = {
    dependencyWriterResult: path.join(materialsRoot, 'dependency-writer-result.json'),
    criticalPathReadback: path.join(materialsRoot, 'critical-path-readback.json'),
    apiReadSmoke: path.join(materialsRoot, 'api-read-smoke.json'),
    uiConsumptionSmoke: path.join(materialsRoot, 'ui-consumption-smoke.json'),
    rollbackVerification: path.join(materialsRoot, 'rollback-verification.json'),
  }

  await writeJson(materialPaths.dependencyWriterResult, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.criticalPathReadback, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.apiReadSmoke, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.uiConsumptionSmoke, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.rollbackVerification, { baselineId: 'baseline-1', projectId: 'project-1' })

  await writeJson(handoffPath, operatorHandoffFixture({
    publicationKey: 'default-master-plan-runtime-publication-1',
    actionSequence: [
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --writer-result ${materialPaths.dependencyWriterResult} --critical-path-readback ${materialPaths.criticalPathReadback} --api-read-smoke ${materialPaths.apiReadSmoke} --ui-consumption-smoke ${materialPaths.uiConsumptionSmoke} --rollback-verification ${materialPaths.rollbackVerification}`,
      },
      {
        id: 'production_evidence_pipeline',
        gate: 'five_evidence_builders',
        command: 'node project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --review-export project-testing/reports/default-master-plan-production-readiness/source-exports/candidate-default-master-plan-review-export.json',
      },
    ],
  }))

  try {
    const report = await buildDefaultMasterPlanRuntimeMaterialPackage({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T08:05:00.000Z'),
    })

    assert.equal(report.status, 'runtime_materials_resolved')
    assert.equal(report.requiredMaterialCount, 0)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.resolvedMaterials.publicationKey, 'default-master-plan-runtime-publication-1')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks runtime material package when the operator handoff root hides retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-material-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'runtime-material-package.json')
  const materialsRoot = path.join(root, 'materials')
  const materialPaths = {
    dependencyWriterResult: path.join(materialsRoot, 'dependency-writer-result.json'),
    criticalPathReadback: path.join(materialsRoot, 'critical-path-readback.json'),
    apiReadSmoke: path.join(materialsRoot, 'api-read-smoke.json'),
    uiConsumptionSmoke: path.join(materialsRoot, 'ui-consumption-smoke.json'),
    rollbackVerification: path.join(materialsRoot, 'rollback-verification.json'),
  }

  await writeJson(materialPaths.dependencyWriterResult, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.criticalPathReadback, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.apiReadSmoke, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.uiConsumptionSmoke, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.rollbackVerification, { baselineId: 'baseline-1', projectId: 'project-1' })

  await writeJson(handoffPath, operatorHandoffFixture({
    publicationKey: 'default-master-plan-runtime-publication-1',
    comparisonBasis: ['manual_comparison_scenario'],
    boundaryPolicy: 'controlled_degradation',
    reviewProof: {
      sourceLineage: ['legacy_template_reverse_inference'],
    },
    actionSequence: [
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --writer-result ${materialPaths.dependencyWriterResult} --critical-path-readback ${materialPaths.criticalPathReadback} --api-read-smoke ${materialPaths.apiReadSmoke} --ui-consumption-smoke ${materialPaths.uiConsumptionSmoke} --rollback-verification ${materialPaths.rollbackVerification}`,
      },
    ],
  }))

  try {
    const report = await buildDefaultMasterPlanRuntimeMaterialPackage({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T08:06:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.deepEqual(report.blockers, ['operator_handoff_retired_or_low_information_default_master_plan_source'])
    assert.equal(report.requiredMaterialCount, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('requires real production outcome material when production source export command contains a placeholder', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-material-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'runtime-material-package.json')
  const materialsRoot = path.join(root, 'materials')
  const materialPaths = {
    dependencyWriterResult: path.join(materialsRoot, 'dependency-writer-result.json'),
    criticalPathReadback: path.join(materialsRoot, 'critical-path-readback.json'),
    apiReadSmoke: path.join(materialsRoot, 'api-read-smoke.json'),
    uiConsumptionSmoke: path.join(materialsRoot, 'ui-consumption-smoke.json'),
    rollbackVerification: path.join(materialsRoot, 'rollback-verification.json'),
  }

  await writeJson(materialPaths.dependencyWriterResult, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.criticalPathReadback, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.apiReadSmoke, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.uiConsumptionSmoke, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.rollbackVerification, { baselineId: 'baseline-1', projectId: 'project-1' })

  await writeJson(handoffPath, operatorHandoffFixture({
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    actionSequence: [
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --writer-result ${materialPaths.dependencyWriterResult} --critical-path-readback ${materialPaths.criticalPathReadback} --api-read-smoke ${materialPaths.apiReadSmoke} --ui-consumption-smoke ${materialPaths.uiConsumptionSmoke} --rollback-verification ${materialPaths.rollbackVerification} --real-production-outcome <real-production-outcome.json>`,
      },
    ],
  }))

  try {
    const report = await buildDefaultMasterPlanRuntimeMaterialPackage({
      handoff: handoffPath,
      output: outputPath,
      environment: 'production',
      now: new Date('2026-07-02T08:07:00.000Z'),
    })

    assert.equal(report.status, 'runtime_materials_required')
    assert.deepEqual(report.blockers, ['runtime_materials_required'])
    assert.deepEqual(report.requiredMaterials.map((item) => item.key), ['realProductionOutcome'])
    assert.match(report.requiredMaterials[0].requiredEvidence, /production\/live outcome/)
    assert.deepEqual(report.requiredMaterials[0].template.requiredFields, [
      'schemaVersion',
      'status',
      'environment',
      'target',
      'baselineId',
      'projectId',
      'publicationKey',
      'evidenceRef',
      'acceptedBy',
      'acceptedAt',
      'approvalRef',
      'runtimePublicationEvidenceRef',
      'apiReadSmokeEvidenceRef',
      'uiConsumptionSmokeEvidenceRef',
      'criticalPathReadbackEvidenceRef',
      'rollbackEvidenceRef',
    ])
    assert.equal(report.requiredMaterials[0].template.example.status, 'verified')
    assert.equal(report.nextCommands.sourceExport.includes('--real-production-outcome <real-production-outcome.json>'), true)
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /realProductionOutcome Required Fields/)
    assert.match(markdown, /runtimePublicationEvidenceRef/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('adds the real production outcome flag to the next source export command when a production handoff omits it', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-material-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'runtime-material-package.json')
  const materialsRoot = path.join(root, 'materials')
  const materialPaths = {
    dependencyWriterResult: path.join(materialsRoot, 'dependency-writer-result.json'),
    criticalPathReadback: path.join(materialsRoot, 'critical-path-readback.json'),
    apiReadSmoke: path.join(materialsRoot, 'api-read-smoke.json'),
    uiConsumptionSmoke: path.join(materialsRoot, 'ui-consumption-smoke.json'),
    rollbackVerification: path.join(materialsRoot, 'rollback-verification.json'),
  }

  await writeJson(materialPaths.dependencyWriterResult, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.criticalPathReadback, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.apiReadSmoke, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.uiConsumptionSmoke, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.rollbackVerification, { baselineId: 'baseline-1', projectId: 'project-1' })

  await writeJson(handoffPath, operatorHandoffFixture({
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    actionSequence: [
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --writer-result ${materialPaths.dependencyWriterResult} --critical-path-readback ${materialPaths.criticalPathReadback} --api-read-smoke ${materialPaths.apiReadSmoke} --ui-consumption-smoke ${materialPaths.uiConsumptionSmoke} --rollback-verification ${materialPaths.rollbackVerification}`,
      },
    ],
  }))

  try {
    const report = await buildDefaultMasterPlanRuntimeMaterialPackage({
      handoff: handoffPath,
      output: outputPath,
      environment: 'production',
      now: new Date('2026-07-02T08:07:30.000Z'),
    })

    assert.equal(report.status, 'runtime_materials_required')
    assert.deepEqual(report.requiredMaterials.map((item) => item.key), ['realProductionOutcome'])
    assert.match(report.nextCommands.sourceExport, /--real-production-outcome <real-production-outcome\.json>/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a production real outcome path when the material file is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-material-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'runtime-material-package.json')
  const materialsRoot = path.join(root, 'materials')
  const materialPaths = {
    dependencyWriterResult: path.join(materialsRoot, 'dependency-writer-result.json'),
    criticalPathReadback: path.join(materialsRoot, 'critical-path-readback.json'),
    apiReadSmoke: path.join(materialsRoot, 'api-read-smoke.json'),
    uiConsumptionSmoke: path.join(materialsRoot, 'ui-consumption-smoke.json'),
    rollbackVerification: path.join(materialsRoot, 'rollback-verification.json'),
    realProductionOutcome: path.join(materialsRoot, 'real-production-outcome.json'),
  }

  await writeJson(materialPaths.dependencyWriterResult, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.criticalPathReadback, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.apiReadSmoke, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.uiConsumptionSmoke, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.rollbackVerification, { baselineId: 'baseline-1', projectId: 'project-1' })

  await writeJson(handoffPath, operatorHandoffFixture({
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    actionSequence: [
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --writer-result ${materialPaths.dependencyWriterResult} --critical-path-readback ${materialPaths.criticalPathReadback} --api-read-smoke ${materialPaths.apiReadSmoke} --ui-consumption-smoke ${materialPaths.uiConsumptionSmoke} --rollback-verification ${materialPaths.rollbackVerification} --real-production-outcome ${materialPaths.realProductionOutcome}`,
      },
    ],
  }))

  try {
    const report = await buildDefaultMasterPlanRuntimeMaterialPackage({
      handoff: handoffPath,
      output: outputPath,
      environment: 'production',
      now: new Date('2026-07-02T08:08:00.000Z'),
    })

    assert.equal(report.status, 'runtime_material_files_missing')
    assert.deepEqual(report.blockers, ['runtime_material_files_missing'])
    assert.deepEqual(report.missingMaterialFiles.map((item) => item.key), ['realProductionOutcome'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks an existing real outcome material when baseline, project, publication, or environment differs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-material-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'runtime-material-package.json')
  const materialsRoot = path.join(root, 'materials')
  const materialPaths = {
    dependencyWriterResult: path.join(materialsRoot, 'dependency-writer-result.json'),
    criticalPathReadback: path.join(materialsRoot, 'critical-path-readback.json'),
    apiReadSmoke: path.join(materialsRoot, 'api-read-smoke.json'),
    uiConsumptionSmoke: path.join(materialsRoot, 'ui-consumption-smoke.json'),
    rollbackVerification: path.join(materialsRoot, 'rollback-verification.json'),
    realProductionOutcome: path.join(materialsRoot, 'real-production-outcome.json'),
  }

  await writeJson(materialPaths.dependencyWriterResult, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.criticalPathReadback, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.apiReadSmoke, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.uiConsumptionSmoke, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.rollbackVerification, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.realProductionOutcome, {
    status: 'verified',
    environment: 'staging',
    baselineId: 'other-baseline',
    projectId: 'project-1',
    publicationKey: 'other-publication',
    evidenceRef: 'real-production-outcome:evidence#sha256=1234',
  })

  await writeJson(handoffPath, operatorHandoffFixture({
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    actionSequence: [
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --writer-result ${materialPaths.dependencyWriterResult} --critical-path-readback ${materialPaths.criticalPathReadback} --api-read-smoke ${materialPaths.apiReadSmoke} --ui-consumption-smoke ${materialPaths.uiConsumptionSmoke} --rollback-verification ${materialPaths.rollbackVerification} --real-production-outcome ${materialPaths.realProductionOutcome}`,
      },
    ],
  }))

  try {
    const report = await buildDefaultMasterPlanRuntimeMaterialPackage({
      handoff: handoffPath,
      output: outputPath,
      environment: 'production',
      now: new Date('2026-07-02T08:09:00.000Z'),
    })

    assert.equal(report.status, 'runtime_material_identity_mismatch')
    assert.deepEqual(report.blockers, ['runtime_material_identity_mismatch'])
    assert.deepEqual(report.materialIdentityMismatches.map((item) => item.key), ['realProductionOutcome'])
    assert.equal(report.materialIdentityMismatches[0].actualBaselineId, 'other-baseline')
    assert.equal(report.materialIdentityMismatches[0].actualPublicationKey, 'other-publication')
    assert.equal(report.materialIdentityMismatches[0].actualEnvironment, 'staging')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks an existing real outcome material when status or evidence ref is not qualified', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-material-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'runtime-material-package.json')
  const materialsRoot = path.join(root, 'materials')
  const materialPaths = {
    dependencyWriterResult: path.join(materialsRoot, 'dependency-writer-result.json'),
    criticalPathReadback: path.join(materialsRoot, 'critical-path-readback.json'),
    apiReadSmoke: path.join(materialsRoot, 'api-read-smoke.json'),
    uiConsumptionSmoke: path.join(materialsRoot, 'ui-consumption-smoke.json'),
    rollbackVerification: path.join(materialsRoot, 'rollback-verification.json'),
    realProductionOutcome: path.join(materialsRoot, 'real-production-outcome.json'),
  }

  await writeJson(materialPaths.dependencyWriterResult, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.criticalPathReadback, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.apiReadSmoke, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.uiConsumptionSmoke, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.rollbackVerification, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.realProductionOutcome, {
    status: 'draft',
    environment: 'production',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
  })

  await writeJson(handoffPath, operatorHandoffFixture({
    environment: 'production',
    publicationKey: 'default-master-plan-runtime-publication-1',
    actionSequence: [
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --environment production --writer-result ${materialPaths.dependencyWriterResult} --critical-path-readback ${materialPaths.criticalPathReadback} --api-read-smoke ${materialPaths.apiReadSmoke} --ui-consumption-smoke ${materialPaths.uiConsumptionSmoke} --rollback-verification ${materialPaths.rollbackVerification} --real-production-outcome ${materialPaths.realProductionOutcome}`,
      },
    ],
  }))

  try {
    const report = await buildDefaultMasterPlanRuntimeMaterialPackage({
      handoff: handoffPath,
      output: outputPath,
      environment: 'production',
      now: new Date('2026-07-02T08:09:30.000Z'),
    })

    assert.equal(report.status, 'runtime_material_quality_mismatch')
    assert.deepEqual(report.blockers, ['runtime_material_quality_mismatch'])
    assert.deepEqual(report.materialQualityMismatches.map((item) => item.key), ['realProductionOutcome'])
    assert.deepEqual(report.materialQualityMismatches[0].blockers, [
      'real_production_outcome_status_pass_required',
      'real_production_outcome_evidence_ref_required',
      'real_production_outcome_target_required',
      'real_production_outcome_target_supabase_project_ref_required',
      'real_production_outcome_target_database_host_required',
      'real_production_outcome_target_connection_source_required',
      'real_production_outcome_target_environment_required',
      'real_production_outcome_accepted_by_required',
      'real_production_outcome_accepted_at_required',
      'real_production_outcome_approval_ref_required',
      'real_production_outcome_runtime_publication_evidence_ref_required',
      'real_production_outcome_api_read_smoke_evidence_ref_required',
      'real_production_outcome_ui_consumption_smoke_evidence_ref_required',
      'real_production_outcome_critical_path_readback_evidence_ref_required',
      'real_production_outcome_rollback_evidence_ref_required',
    ])

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Material Quality Mismatches/)
    assert.match(markdown, /real_production_outcome_status_pass_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks resolved-looking runtime material paths when the files do not exist', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-material-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'runtime-material-package.json')
  const missingRoot = path.join(root, 'missing-materials')

  await writeJson(handoffPath, operatorHandoffFixture({
    publicationKey: 'default-master-plan-runtime-publication-1',
    actionSequence: [
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --writer-result ${path.join(missingRoot, 'dependency-writer-result.json')} --critical-path-readback ${path.join(missingRoot, 'critical-path-readback.json')} --api-read-smoke ${path.join(missingRoot, 'api-read-smoke.json')} --ui-consumption-smoke ${path.join(missingRoot, 'ui-consumption-smoke.json')} --rollback-verification ${path.join(missingRoot, 'rollback-verification.json')}`,
      },
    ],
  }))

  try {
    const report = await buildDefaultMasterPlanRuntimeMaterialPackage({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T08:10:00.000Z'),
    })

    assert.equal(report.status, 'runtime_material_files_missing')
    assert.equal(report.requiredMaterialCount, 0)
    assert.deepEqual(report.blockers, ['runtime_material_files_missing'])
    assert.deepEqual(report.missingMaterialFiles.map((item) => item.key), [
      'dependencyWriterResult',
      'criticalPathReadback',
      'apiReadSmoke',
      'uiConsumptionSmoke',
      'rollbackVerification',
    ])

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Missing Material Files/)
    assert.match(markdown, /dependencyWriterResult/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks existing runtime material files when their baseline or project identity differs from the handoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-material-package-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const outputPath = path.join(root, 'runtime-material-package.json')
  const materialsRoot = path.join(root, 'materials')
  const materialPaths = {
    dependencyWriterResult: path.join(materialsRoot, 'dependency-writer-result.json'),
    criticalPathReadback: path.join(materialsRoot, 'critical-path-readback.json'),
    apiReadSmoke: path.join(materialsRoot, 'api-read-smoke.json'),
    uiConsumptionSmoke: path.join(materialsRoot, 'ui-consumption-smoke.json'),
    rollbackVerification: path.join(materialsRoot, 'rollback-verification.json'),
  }

  await writeJson(materialPaths.dependencyWriterResult, { baselineId: 'other-baseline', projectId: 'project-1' })
  await writeJson(materialPaths.criticalPathReadback, { baselineId: 'baseline-1', projectId: 'other-project' })
  await writeJson(materialPaths.apiReadSmoke, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.uiConsumptionSmoke, { baselineId: 'baseline-1', projectId: 'project-1' })
  await writeJson(materialPaths.rollbackVerification, { baselineId: 'baseline-1', projectId: 'project-1' })

  await writeJson(handoffPath, operatorHandoffFixture({
    publicationKey: 'default-master-plan-runtime-publication-1',
    actionSequence: [
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: `npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key default-master-plan-runtime-publication-1 --writer-result ${materialPaths.dependencyWriterResult} --critical-path-readback ${materialPaths.criticalPathReadback} --api-read-smoke ${materialPaths.apiReadSmoke} --ui-consumption-smoke ${materialPaths.uiConsumptionSmoke} --rollback-verification ${materialPaths.rollbackVerification}`,
      },
    ],
  }))

  try {
    const report = await buildDefaultMasterPlanRuntimeMaterialPackage({
      handoff: handoffPath,
      output: outputPath,
      now: new Date('2026-07-02T08:15:00.000Z'),
    })

    assert.equal(report.status, 'runtime_material_identity_mismatch')
    assert.deepEqual(report.blockers, ['runtime_material_identity_mismatch'])
    assert.deepEqual(report.materialIdentityMismatches.map((item) => item.key), [
      'dependencyWriterResult',
      'criticalPathReadback',
    ])
    assert.equal(report.materialIdentityMismatches[0].expectedBaselineId, 'baseline-1')
    assert.equal(report.materialIdentityMismatches[0].actualBaselineId, 'other-baseline')
    assert.equal(report.materialIdentityMismatches[1].expectedProjectId, 'project-1')
    assert.equal(report.materialIdentityMismatches[1].actualProjectId, 'other-project')

    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Material Identity Mismatches/)
    assert.match(markdown, /other-baseline/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function operatorHandoffFixture(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-production-operator-handoff/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    environment: overrides.environment ?? 'staging',
    publicationKey: overrides.publicationKey ?? '<publication-key>',
    comparisonBasis: overrides.comparisonBasis,
    boundaryPolicy: overrides.boundaryPolicy,
    reviewProof: overrides.reviewProof,
    currentBlockers: ['runtime_publication_evidence'],
    actionSequence: overrides.actionSequence ?? [
      {
        id: 'source_export_collect',
        gate: 'source_export_collection',
        command: 'npm run evidence:default-master-plan:export-sources -- --baseline-id baseline-1 --project-id project-1 --publication-key <publication-key> --writer-result <dependency-writer-result.json> --critical-path-readback <critical-path-readback.json> --api-read-smoke <api-read-smoke.json> --ui-consumption-smoke <ui-consumption-smoke.json> --rollback-verification <rollback-verification.json>',
      },
      {
        id: 'production_evidence_pipeline',
        gate: 'five_evidence_builders',
        command: 'node project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs --baseline-id baseline-1 --project-id project-1 --publication-key <publication-key> <source-export-pipeline-args>',
      },
    ],
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
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
