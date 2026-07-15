import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildDefaultMasterPlanRealDurationSampleMaterialTemplate,
} from './build-default-master-plan-real-duration-sample-material-template.mjs'
import {
  buildDefaultMasterPlanRealDurationSampleSourceExport,
} from './build-default-master-plan-real-duration-sample-source-export.mjs'

test('builds a no-write real duration sample material template from collection requests', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-template-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const output = path.join(root, 'real-duration-sample-material.template.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套', candidateReferenceDays: 75 }),
    sampleRequest({ stableCode: 'BTMP-SCH-06', title: '竣工验收与开学移交准备', candidateReferenceDays: 48 }),
  ]))

  try {
    const report = await buildDefaultMasterPlanRealDurationSampleMaterialTemplate({
      collectionPackage,
      output,
      preparedBy: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      now: new Date('2026-07-05T03:00:00.000Z'),
    })

    assert.equal(report.status, 'template_ready')
    assert.equal(report.productionReady, false)
    assert.equal(report.summary.templateSampleCount, 2)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
    assert.equal(report.mutationBoundary.writesProductionTables, false)

    const template = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(template.schemaVersion, 'workbuddy-real-duration-sample-material/v1')
    assert.equal(template.materialTemplate, true)
    assert.equal(template.templateStatus, 'operator_input_required')
    assert.equal(template.samples.length, 2)
    assert.equal(template.samples[0].stableCode, 'BTMP-SCH-05')
    assert.equal(template.samples[0].sampleStatus, 'draft')
    assert.equal(template.samples[0].includedInBenchmark, false)
    assert.equal(template.samples[0].metadata.materialTemplate, true)
    assert.equal(template.samples[0].metadata.durationAssetStableCode, 'outdoor_utilities')
    assert.equal(template.samples[0].metadata.t2RhythmTemplateId, 't2-school-campus-functional-phasing-rhythm-v1')
    assert.equal(template.samples[0].metadata.profileRuntimeReferenceStableCode, 'BTMP-SCH-05')
    assert.equal(template.samples[0].metadata.stableCodeResolution, 'duration_asset_utilization_row')
    assert.deepEqual(template.samples[0].metadata.requestSources, ['duration_asset_utilization_runtime_reference_day_gap'])
    assert.equal(template.samples[0].metadata.stagingControlledReplay, false)
    assert.equal(template.samples[0].metadata.notRealProductionOutcome, false)
    assert.match(template.samples[0].evidenceRef, /^<required:/)
    assert.equal(template.operatorInstructions.noWriteBoundary, 'template_only_no_db_write')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds operator-fill template from prioritized real evidence gap sample targets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-template-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const realEvidenceGapSummary = path.join(root, 'real-evidence-gap-summary.json')
  const output = path.join(root, 'real-duration-sample-material.template.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: 'School outdoor works', candidateReferenceDays: 75 }),
    sampleRequest({ stableCode: 'BTMP-SCH-06', title: 'School handover readiness', candidateReferenceDays: 48 }),
    sampleRequest({ stableCode: 'BTMP-SCH-07', title: 'Not prioritized in this round', candidateReferenceDays: 30 }),
  ]))
  await writeJson(realEvidenceGapSummary, realEvidenceGapSummaryFixture([
    sampleTarget({ priority: 2, stableCode: 'BTMP-SCH-06', title: 'School handover readiness', businessType: 'school', missingSampleCount: 2 }),
    sampleTarget({ priority: 1, stableCode: 'BTMP-SCH-05', title: 'School outdoor works', businessType: 'school', invalidSampleCount: 1 }),
  ]))

  try {
    const report = await buildDefaultMasterPlanRealDurationSampleMaterialTemplate({
      collectionPackage,
      realEvidenceGapSummary,
      output,
      preparedBy: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      now: new Date('2026-07-05T03:20:00.000Z'),
    })

    assert.equal(report.status, 'template_ready')
    assert.equal(report.summary.requestCount, 3)
    assert.equal(report.summary.templateSampleCount, 2)
    assert.equal(report.summary.targetSampleCount, 2)
    assert.equal(report.summary.targetSource, 'real_evidence_gap_summary')
    assert.equal(report.summary.targetBusinessTypeCount, 1)
    assert.deepEqual(report.blockers, [])

    const template = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(template.realEvidenceGapSummaryRef.endsWith('real-evidence-gap-summary.json'), true)
    assert.equal(template.targetSource, 'real_evidence_gap_summary')
    assert.deepEqual(template.samples.map((sample) => sample.stableCode), ['BTMP-SCH-05', 'BTMP-SCH-06'])
    assert.equal(template.samples[0].candidateReferenceDays, 75)
    assert.equal(template.samples[0].requiredAcceptedSampleCount, 1)
    assert.equal(template.samples[0].metadata.sampleCollectionTargetPriority, 1)
    assert.equal(template.samples[0].metadata.readySampleCount, 0)
    assert.equal(template.samples[0].metadata.missingSampleCount, 1)
    assert.equal(template.samples[0].metadata.invalidSampleCount, 1)
    assert.equal(template.samples[0].metadata.nextAction, 'collect_accepted_real_duration_sample')
    assert.equal(template.samples[0].metadata.businessType, 'school')
    assert.deepEqual(template.samples[0].metadata.requestSources, ['duration_asset_utilization_runtime_reference_day_gap'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
test('writes a no-write business-type collection kit for prioritized sample targets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-template-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const realEvidenceGapSummary = path.join(root, 'real-evidence-gap-summary.json')
  const output = path.join(root, 'real-duration-sample-material.template.json')
  const collectionKitOutput = path.join(root, 'real-duration-sample-collection-kit.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: 'School outdoor works', candidateReferenceDays: 75 }),
    sampleRequest({ stableCode: 'BTMP-SCH-06', title: 'School handover readiness', candidateReferenceDays: 48 }),
    sampleRequest({ stableCode: 'BTMP-HSP-01', title: 'Hospital medical fitout handover', candidateReferenceDays: 90 }),
  ]))
  await writeJson(realEvidenceGapSummary, realEvidenceGapSummaryFixture([
    sampleTarget({ priority: 2, stableCode: 'BTMP-SCH-06', title: 'School handover readiness', businessType: 'school', missingSampleCount: 2 }),
    sampleTarget({ priority: 1, stableCode: 'BTMP-SCH-05', title: 'School outdoor works', businessType: 'school' }),
    sampleTarget({ priority: 3, stableCode: 'BTMP-HSP-01', title: 'Hospital medical fitout handover', businessType: 'hospital', invalidSampleCount: 1 }),
  ]))

  try {
    const report = await buildDefaultMasterPlanRealDurationSampleMaterialTemplate({
      collectionPackage,
      realEvidenceGapSummary,
      output,
      collectionKitOutput,
      preparedBy: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      now: new Date('2026-07-05T03:30:00.000Z'),
    })

    assert.equal(report.collectionKitRef.endsWith('real-duration-sample-collection-kit.json'), true)
    assert.equal(report.summary.collectionKitBusinessTypeCount, 2)
    assert.equal(report.summary.collectionKitTargetCount, 3)
    assert.equal(report.mutationBoundary.writesDurationSamples, false)

    const collectionKit = JSON.parse(await readFile(collectionKitOutput, 'utf8'))
    assert.equal(collectionKit.schemaVersion, 'workbuddy-real-duration-sample-collection-kit/v1')
    assert.equal(collectionKit.productionReady, false)
    assert.equal(collectionKit.noWriteBoundary, 'operator_collection_kit_only_no_db_write')
    assert.equal(collectionKit.summary.businessTypeGroupCount, 2)
    assert.deepEqual(collectionKit.businessTypeGroups.map((group) => group.businessType), ['school', 'hospital'])
    assert.deepEqual(collectionKit.businessTypeGroups[0].rows.map((row) => row.stableCode), ['BTMP-SCH-05', 'BTMP-SCH-06'])
    assert.equal(collectionKit.businessTypeGroups[0].rows[0].operatorFields.actualDurationDays, '<required:number>')
    assert.equal(collectionKit.businessTypeGroups[0].rows[0].durationAssetStableCode, 'outdoor_utilities')
    assert.equal(collectionKit.businessTypeGroups[1].invalidSampleCount, 1)
    assert.equal(collectionKit.mutationBoundary.writesProductionTables, false)
    assert.equal(collectionKit.mutationBoundary.invokesRuntimeWriters, false)
    assert.equal(collectionKit.mutationBoundary.performsRollback, false)

    const markdown = await readFile(collectionKitOutput.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /BTMP-SCH-05/)
    assert.match(markdown, /hospital/)
    assert.match(markdown, /writesDurationSamples=false/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
test('template material cannot be accidentally exported as accepted duration samples', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-real-duration-template-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const templateOutput = path.join(root, 'real-duration-sample-material.template.json')
  const exportOutput = path.join(root, 'duration-experience-samples-export.json')

  await writeJson(collectionPackage, collectionPackageFixture([
    sampleRequest({ stableCode: 'BTMP-SCH-05', title: '操场道路与校园室外配套', candidateReferenceDays: 75 }),
  ]))

  try {
    await buildDefaultMasterPlanRealDurationSampleMaterialTemplate({
      collectionPackage,
      output: templateOutput,
      preparedBy: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      now: new Date('2026-07-05T03:10:00.000Z'),
    })

    const report = await buildDefaultMasterPlanRealDurationSampleSourceExport({
      collectionPackage,
      sampleMaterial: templateOutput,
      output: exportOutput,
      environment: 'staging',
      exportedBy: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
      now: new Date('2026-07-05T03:11:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.exportedSampleCount, 0)
    assert.equal(report.summary.invalidSampleCount, 1)
    assert.match(report.invalidSamples[0].blockers.join('\n'), /real_duration_sample_template_material_must_be_filled_before_export/)
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function collectionPackageFixture(sampleRequests) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    generatedAt: '2026-07-05T02:00:00.000Z',
    source: 'build-default-master-plan-duration-sample-collection-package',
    status: 'samples_required',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    sampleRequests,
    blockers: ['accepted_real_duration_samples_required'],
    mutationBoundary: {
      writesDurationSamples: false,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  }
}

function sampleRequest({ stableCode, title, candidateReferenceDays }) {
  return {
    source: 'duration_asset_utilization_runtime_reference_day_gap',
    candidateRowId: stableCode,
    stableCode,
    title,
    executionLane: 'school_handover',
    executionPhase: 'acceptance_handover',
    candidateReferenceDays,
    requiredAcceptedSampleCount: 1,
    businessType: 'school',
    businessTypes: ['school'],
    durationAssetStableCode: 'outdoor_utilities',
    t2RhythmTemplateId: 't2-school-campus-functional-phasing-rhythm-v1',
    profileRuntimeReferenceStableCode: stableCode,
    stableCodeResolution: 'duration_asset_utilization_row',
    requestSources: ['duration_asset_utilization_runtime_reference_day_gap'],
  }
}

function realEvidenceGapSummaryFixture(nextSampleCollectionTargets) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-real-evidence-gap-summary/v1',
    generatedAt: '2026-07-05T02:30:00.000Z',
    status: 'blocked',
    productionReady: false,
    realEvidenceGaps: {
      realDurationSampleMaterialPreflight: {
        nextSampleCollectionTargets,
      },
    },
  }
}

function sampleTarget({ priority, stableCode, title, businessType, missingSampleCount = 1, invalidSampleCount = 0 }) {
  return {
    priority,
    businessType,
    stableCode,
    title,
    requiredAcceptedSampleCount: 1,
    readySampleCount: 0,
    missingSampleCount,
    invalidSampleCount,
    nextAction: 'collect_accepted_real_duration_sample',
  }
}
async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
