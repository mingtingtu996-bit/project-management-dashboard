import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDefaultMasterPlanRealDurationSampleMaterialFromCollectionKitPreflight,
  parseArgs,
} from './build-default-master-plan-real-duration-sample-material-from-collection-kit-preflight.mjs'
import {
  checkDefaultMasterPlanRealDurationSampleMaterialPreflight,
} from './check-default-master-plan-real-duration-sample-material-preflight.mjs'

test('parseArgs accepts collection package, collection-kit preflight, output, and prepared-by flags', () => {
  const options = parseArgs([
    '--collection-package', 'project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json',
    '--collection-kit-preflight', 'project-testing/reports/default-master-plan-production-readiness/real-duration-sample-collection-kit-preflight.json',
    '--output', 'project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material.json',
    '--prepared-by', 'operator-1',
  ])

  assert.equal(options.collectionPackage.endsWith('duration-sample-collection-package.json'), true)
  assert.equal(options.collectionKitPreflight.endsWith('real-duration-sample-collection-kit-preflight.json'), true)
  assert.equal(options.output.endsWith('real-duration-sample-material.json'), true)
  assert.equal(options.preparedBy, 'operator-1')
})

test('builds real duration sample material from a ready collection-kit preflight without production mutation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workbuddy-material-from-collection-kit-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const collectionKitPreflight = path.join(root, 'real-duration-sample-collection-kit-preflight.json')
  const output = path.join(root, 'real-duration-sample-material.json')
  const materialPreflightOutput = path.join(root, 'real-duration-sample-material-preflight.json')

  try {
    await writeJson(collectionPackage, collectionPackageFixture())
    await writeJson(collectionKitPreflight, readyCollectionKitPreflightFixture())

    const report = await buildDefaultMasterPlanRealDurationSampleMaterialFromCollectionKitPreflight({
      collectionPackage,
      collectionKitPreflight,
      output,
      preparedBy: 'release-operator-1',
      now: new Date('2026-07-08T01:00:00Z'),
    })

    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-real-duration-sample-material-from-collection-kit-preflight/v1')
    assert.equal(report.status, 'material_ready')
    assert.equal(report.productionReady, false)
    assert.equal(report.baselineId, 'baseline-1')
    assert.equal(report.projectId, 'project-1')
    assert.equal(report.summary.exportedSampleCount, 2)
    assert.equal(report.summary.sourceCandidateCount, 2)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
    assert.equal(report.mutationBoundary.writesRuntimePublication, false)

    const material = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(material.schemaVersion, 'workbuddy-real-duration-sample-material/v1')
    assert.equal(material.materialTemplate, false)
    assert.equal(material.templateStatus, 'operator_supplied_real_duration_sample_material')
    assert.equal(material.baselineId, 'baseline-1')
    assert.equal(material.projectId, 'project-1')
    assert.equal(material.preparedBy, 'release-operator-1')
    assert.equal(material.samples.length, 2)
    assert.equal(material.samples[0].projectId, 'project-1')
    assert.equal(material.samples[0].sampleStatus, 'accepted')
    assert.equal(material.samples[0].includedInBenchmark, true)
    assert.equal(material.samples[0].metadata.collectionKitPreflight, true)

    const preflight = await checkDefaultMasterPlanRealDurationSampleMaterialPreflight({
      collectionPackage,
      sampleMaterial: output,
      output: materialPreflightOutput,
      checkedBy: 'release-operator-1',
      now: new Date('2026-07-08T01:05:00Z'),
    })
    assert.equal(preflight.status, 'ready_for_source_export')
    assert.equal(preflight.summary.readyStableCodeCount, 2)
    assert.equal(preflight.summary.invalidSampleCount, 0)
    assert.deepEqual(preflight.blockers, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks material build when collection-kit preflight is not ready', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workbuddy-material-from-collection-kit-blocked-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const collectionKitPreflight = path.join(root, 'real-duration-sample-collection-kit-preflight.json')
  const output = path.join(root, 'real-duration-sample-material.json')

  try {
    await writeJson(collectionPackage, collectionPackageFixture())
    await writeJson(collectionKitPreflight, {
      ...readyCollectionKitPreflightFixture(),
      status: 'blocked',
      blockers: ['invalid_collection_kit_rows_present'],
      summary: {
        targetRowCount: 2,
        readyRowCount: 0,
        invalidRowCount: 2,
        businessTypeGroupCount: 1,
      },
      materialSampleCandidates: [],
    })

    const report = await buildDefaultMasterPlanRealDurationSampleMaterialFromCollectionKitPreflight({
      collectionPackage,
      collectionKitPreflight,
      output,
      preparedBy: 'release-operator-1',
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.summary.exportedSampleCount, 0)
    assert.equal(report.blockers.includes('collection_kit_preflight_not_ready'), true)
    assert.equal(report.blockers.includes('invalid_collection_kit_rows_present'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not overwrite existing sample material when collection-kit preflight is blocked', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workbuddy-material-from-collection-kit-preserve-'))
  const collectionPackage = path.join(root, 'duration-sample-collection-package.json')
  const collectionKitPreflight = path.join(root, 'real-duration-sample-collection-kit-preflight.json')
  const output = path.join(root, 'real-duration-sample-material.json')

  const existingMaterial = {
    schemaVersion: 'workbuddy-real-duration-sample-material/v1',
    source: 'existing-valid-material-from-task-export',
    materialTemplate: false,
    templateStatus: 'operator_supplied_real_duration_sample_material',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    samples: [{
      id: 'real-duration-sample:existing-task:RES-STRUCT-STD-FLOOR',
      stableCode: 'RES-STRUCT-STD-FLOOR',
      title: 'Residential standard floor structure',
      projectId: 'project-1',
      taskId: 'existing-task',
      actualDurationDays: 7,
      sampleStatus: 'accepted',
      includedInBenchmark: true,
    }],
  }

  try {
    await writeJson(collectionPackage, collectionPackageFixture())
    await writeJson(collectionKitPreflight, {
      ...readyCollectionKitPreflightFixture(),
      status: 'blocked',
      blockers: ['invalid_collection_kit_rows_present'],
      summary: {
        targetRowCount: 2,
        readyRowCount: 0,
        invalidRowCount: 2,
        businessTypeGroupCount: 1,
      },
      materialSampleCandidates: [],
    })
    await writeJson(output, existingMaterial)

    const report = await buildDefaultMasterPlanRealDurationSampleMaterialFromCollectionKitPreflight({
      collectionPackage,
      collectionKitPreflight,
      output,
      preparedBy: 'release-operator-1',
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.exportedSampleCount, 0)
    assert.equal(report.materialWrite.wroteMaterialFile, false)
    assert.equal(report.materialWrite.preservedExistingMaterialFile, true)
    assert.equal(report.materialWrite.existingMaterialSummary.source, 'existing-valid-material-from-task-export')
    assert.equal(report.materialWrite.existingMaterialSummary.sampleCount, 1)

    const preservedMaterial = JSON.parse(await readFile(output, 'utf8'))
    assert.deepEqual(preservedMaterial, existingMaterial)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
function collectionPackageFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    sampleRequests: [{
      stableCode: 'RES-STRUCT-STD-FLOOR',
      title: 'Residential standard floor structure',
      requiredAcceptedSampleCount: 1,
    }, {
      stableCode: 'RES-MEP-ROUGH-IN',
      title: 'Residential MEP rough-in',
      requiredAcceptedSampleCount: 1,
    }],
  }
}

function readyCollectionKitPreflightFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-real-duration-sample-collection-kit-preflight/v1',
    status: 'ready_for_real_duration_sample_material_build',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    checkedBy: 'release-operator-1',
    collectionKitRef: 'real_duration_sample_collection_kit:project-testing/reports/default-master-plan-production-readiness/real-duration-sample-collection-kit.json#sha256=abc123',
    summary: {
      targetRowCount: 2,
      readyRowCount: 2,
      invalidRowCount: 0,
      businessTypeGroupCount: 1,
    },
    materialSampleCandidates: [{
      id: 'operator-real-duration:RES-STRUCT-STD-FLOOR:task-1001',
      stableCode: 'RES-STRUCT-STD-FLOOR',
      title: 'Residential standard floor structure',
      businessType: 'residential',
      projectId: 'project-1',
      taskId: 'task-1001',
      actualDurationDays: 7,
      startedAt: '2026-03-01',
      completedAt: '2026-03-08',
      sourceType: 'completed_task',
      sampleStatus: 'accepted',
      includedInBenchmark: true,
      evidenceRef: 'project-search/public-project-data/residential-schedule-001.xlsx#row=12',
      operatorReviewRef: 'pm-review:release-operator-1:2026-07-08',
    }, {
      id: 'operator-real-duration:RES-MEP-ROUGH-IN:task-2001',
      stableCode: 'RES-MEP-ROUGH-IN',
      title: 'Residential MEP rough-in',
      businessType: 'residential',
      projectId: 'project-1',
      taskId: 'task-2001',
      actualDurationDays: 12,
      startedAt: '2026-04-01',
      completedAt: '2026-04-12',
      sourceType: 'completed_task',
      sampleStatus: 'accepted',
      includedInBenchmark: true,
      evidenceRef: 'project-search/public-project-data/residential-schedule-001.xlsx#row=44',
      operatorReviewRef: 'pm-review:release-operator-1:2026-07-08',
    }],
    blockers: [],
    mutationBoundary: {
      readsRealDurationSampleCollectionKit: true,
      writesReportFiles: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
      performsRollback: false,
    },
  }
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}
