import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  createDefaultMasterPlanRuntimeTaskAlignmentReviewDecisionsTemplate,
  parseArgs,
} from './create-default-master-plan-runtime-task-alignment-review-decisions-template.mjs'

test('parseArgs accepts refresh package, output, and preparer identity', () => {
  const refreshPackagePath = path.join('tmp', 'runtime-task-alignment-refresh-package.json')
  const outputPath = path.join('tmp', 'runtime-task-alignment-review-decisions.json')

  const options = parseArgs([
    '--runtime-task-alignment-refresh-package',
    refreshPackagePath,
    '--output',
    outputPath,
    '--prepared-by',
    'release-operator-1',
  ])

  assert.equal(options.runtimeTaskAlignmentRefreshPackage, path.resolve(refreshPackagePath))
  assert.equal(options.output, path.resolve(outputPath))
  assert.equal(options.preparedBy, 'release-operator-1')
})

test('creates a no-write review decisions template without accepting runtime alignment actions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-task-alignment-review-template-'))
  const refreshPackagePath = path.join(root, 'runtime-task-alignment-refresh-package.json')
  const outputPath = path.join(root, 'runtime-task-alignment-review-decisions.json')

  await writeJson(refreshPackagePath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-task-alignment-refresh-package/v1',
    status: 'runtime_task_alignment_refresh_review_required',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    summary: {
      actionCount: 2,
      stableCodeRefreshReviewActionCount: 1,
      missingRuntimeTaskActionCount: 1,
      collisionReviewActionCount: 1,
    },
    actions: [
      {
        index: 1,
        stableCode: 'BTMP-SCH-02',
        candidateTitle: '教学楼二次结构与普通教室粗装修',
        runtimeTaskId: 'runtime-task-2',
        runtimeTitle: '实验室通风与专业机电安装',
        actionKind: 'review_runtime_task_stable_code_refresh',
        proposedStableCode: 'BTMP-SCH-03',
        blockers: ['runtime_stable_code_collision_review_required'],
      },
      {
        index: 2,
        stableCode: 'BTMP-SCH-05',
        candidateTitle: '操场道路与校园室外配套',
        runtimeTaskId: '',
        runtimeTitle: '',
        actionKind: 'collect_current_completed_task_or_confirm_scope_gap',
        proposedStableCode: 'BTMP-SCH-05',
        blockers: ['current_completed_task_evidence_required'],
      },
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
    const template = await createDefaultMasterPlanRuntimeTaskAlignmentReviewDecisionsTemplate({
      runtimeTaskAlignmentRefreshPackage: refreshPackagePath,
      output: outputPath,
      preparedBy: 'release-operator-1',
      now: new Date('2026-07-07T03:00:00.000Z'),
    })

    assert.equal(template.schemaVersion, 'workbuddy-default-master-plan-runtime-task-alignment-review-decisions/v1')
    assert.equal(template.status, 'operator_review_required')
    assert.equal(template.productionReady, false)
    assert.equal(template.baselineId, 'baseline-1')
    assert.equal(template.projectId, 'project-1')
    assert.equal(template.preparedBy, 'release-operator-1')
    assert.equal(template.summary.actionCount, 2)
    assert.equal(template.summary.decisionPlaceholderCount, 2)
    assert.equal(template.decisions.length, 2)
    assert.equal(template.decisions[0].decision, '')
    assert.deepEqual(template.decisions[0].recommendedDecisionOptions, [
      'accepted_for_runtime_stable_code_review',
      'rejected_runtime_stable_code_refresh',
    ])
    assert.equal(template.decisions[0].collisionReviewRequired, true)
    assert.equal(template.decisions[0].collisionReviewDecision, '')
    assert.deepEqual(template.decisions[1].recommendedDecisionOptions, [
      'confirmed_candidate_scope_gap',
      'accepted_current_completed_task_evidence',
      'rejected_missing_runtime_task_action',
    ])
    assert.equal(template.blockers.includes('human_operator_decisions_required'), true)
    assert.equal(template.mutationBoundary.writesTasks, false)
    assert.equal(template.mutationBoundary.writesDurationSamples, false)

    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(written.decisions.length, 2)
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Runtime Task Alignment Review Decisions Template/)
    assert.match(markdown, /operator_review_required/)
    assert.match(markdown, /BTMP-SCH-02/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
