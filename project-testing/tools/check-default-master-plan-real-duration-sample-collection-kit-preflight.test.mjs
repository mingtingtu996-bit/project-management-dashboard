import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  checkDefaultMasterPlanRealDurationSampleCollectionKitPreflight,
  parseArgs,
} from './check-default-master-plan-real-duration-sample-collection-kit-preflight.mjs'

test('parseArgs accepts collection kit, output, and checked-by flags', () => {
  const options = parseArgs([
    '--collection-kit', 'project-testing/reports/default-master-plan-production-readiness/real-duration-sample-collection-kit.json',
    '--output', 'project-testing/reports/default-master-plan-production-readiness/real-duration-sample-collection-kit-preflight.json',
    '--checked-by', 'operator-1',
  ])

  assert.equal(options.collectionKit.endsWith('real-duration-sample-collection-kit.json'), true)
  assert.equal(options.output.endsWith('real-duration-sample-collection-kit-preflight.json'), true)
  assert.equal(options.checkedBy, 'operator-1')
})

test('marks a fully filled collection kit ready without production mutation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workbuddy-real-duration-collection-kit-'))
  const collectionKit = path.join(root, 'real-duration-sample-collection-kit.json')
  const output = path.join(root, 'reports', 'real-duration-sample-collection-kit-preflight.json')

  try {
    await writeJson(collectionKit, collectionKitFixture({
      rows: [{
        priority: 1,
        stableCode: 'RES-STRUCT-STD-FLOOR',
        title: '?????????',
        candidateReferenceDays: 7,
        durationAssetStableCode: 'duration:residential:standard-floor-cycle',
        t2RhythmTemplateId: 't2-residential-standard-floor-cycle',
        operatorFields: {
          sourceProjectName: '?????',
          sourceTaskId: 'task-1001',
          sourceTaskName: '1#?5???????',
          actualDurationDays: 7,
          startedAt: '2026-03-01',
          completedAt: '2026-03-08',
          evidenceRef: 'project-search/public-project-data/residential-schedule-001.xlsx#row=12',
          operatorReviewRef: 'pm-review:release-operator-1:2026-07-08',
        },
      }],
    }))

    const report = await checkDefaultMasterPlanRealDurationSampleCollectionKitPreflight({
      collectionKit,
      output,
      checkedBy: 'release-operator-1',
      now: new Date('2026-07-08T00:00:00Z'),
    })

    assert.equal(report.status, 'ready_for_real_duration_sample_material_build')
    assert.equal(report.productionReady, false)
    assert.equal(report.baselineId, 'baseline-1')
    assert.equal(report.projectId, 'project-1')
    assert.equal(report.checkedBy, 'release-operator-1')
    assert.equal(report.summary.targetRowCount, 1)
    assert.equal(report.summary.readyRowCount, 1)
    assert.equal(report.summary.invalidRowCount, 0)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
    assert.equal(report.mutationBoundary.writesRuntimePublication, false)
    assert.equal(report.mutationBoundary.invokesRuntimeWriters, false)
    assert.equal(report.materialSampleCandidates.length, 1)
    assert.equal(report.materialSampleCandidates[0].stableCode, 'RES-STRUCT-STD-FLOOR')
    assert.equal(report.materialSampleCandidates[0].taskId, 'task-1001')
    assert.equal(report.materialSampleCandidates[0].sampleStatus, 'accepted')
    assert.equal(report.materialSampleCandidates[0].projectId, 'project-1')

    const writtenJson = JSON.parse(await readFile(output, 'utf8'))
    const writtenMarkdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.equal(writtenJson.status, report.status)
    assert.match(writtenMarkdown, /readyRowCount: 1/)
    assert.match(writtenMarkdown, /writesDurationSamples=false/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks placeholder rows and unsafe collection-kit mutation boundaries', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workbuddy-real-duration-collection-kit-blocked-'))
  const collectionKit = path.join(root, 'real-duration-sample-collection-kit.json')
  const output = path.join(root, 'reports', 'real-duration-sample-collection-kit-preflight.json')

  try {
    await writeJson(collectionKit, collectionKitFixture({
      noWriteBoundary: 'missing-boundary',
      mutationBoundary: {
        writesProductionTables: false,
        writesTasks: false,
        writesTaskDependencies: false,
        writesDurationSamples: true,
        writesRuntimePublication: false,
        invokesRuntimeWriters: false,
        performsRollback: false,
      },
      rows: [{
        priority: 1,
        stableCode: 'RES-STRUCT-STD-FLOOR',
        title: '?????????',
        operatorFields: {
          sourceTaskId: '<source-task-id>',
          sourceTaskName: 'TODO',
          actualDurationDays: 0,
          startedAt: '2026-04-10',
          completedAt: '2026-04-01',
          evidenceRef: '<evidence-ref>',
          operatorReviewRef: '<operator-review-ref>',
        },
      }],
    }))

    const report = await checkDefaultMasterPlanRealDurationSampleCollectionKitPreflight({
      collectionKit,
      output,
      checkedBy: '',
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.summary.targetRowCount, 1)
    assert.equal(report.summary.readyRowCount, 0)
    assert.equal(report.summary.invalidRowCount, 1)
    assert.equal(report.invalidRows.length, 1)
    assert.deepEqual(report.invalidRows[0].blockers, [
      'source_task_id_required',
      'source_task_name_required',
      'actual_duration_days_required',
      'completed_at_must_not_precede_started_at',
      'evidence_ref_required',
      'operator_review_ref_required',
    ])
    assert.equal(report.blockers.includes('checked_by_required'), true)
    assert.equal(report.blockers.includes('invalid_collection_kit_rows_present'), true)
    assert.equal(report.blockers.includes('collection_kit_no_write_boundary_required'), true)
    assert.equal(report.blockers.includes('collection_kit_duration_sample_write_boundary_missing'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function collectionKitFixture({ rows, noWriteBoundary = 'operator_collection_kit_only_no_db_write', mutationBoundary = noWriteMutationBoundary() }) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-real-duration-sample-collection-kit/v1',
    productionReady: false,
    noWriteBoundary,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessTypeGroups: [{
      businessType: 'residential',
      rows,
    }],
    mutationBoundary,
  }
}

function noWriteMutationBoundary() {
  return {
    writesProductionTables: false,
    writesTasks: false,
    writesTaskDependencies: false,
    writesDurationSamples: false,
    writesRuntimePublication: false,
    invokesRuntimeWriters: false,
    performsRollback: false,
  }
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}
