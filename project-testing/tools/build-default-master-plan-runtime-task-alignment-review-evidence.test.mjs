import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildDefaultMasterPlanRuntimeTaskAlignmentReviewEvidence,
  parseArgs,
} from './build-default-master-plan-runtime-task-alignment-review-evidence.mjs'

test('parseArgs accepts refresh package, review decisions, output, reviewer, and notes', () => {
  const refreshPackagePath = path.join('tmp', 'runtime-task-alignment-refresh-package.json')
  const reviewDecisionsPath = path.join('tmp', 'runtime-task-alignment-review-decisions.json')
  const outputPath = path.join('tmp', 'runtime-task-alignment-review-evidence.json')

  const options = parseArgs([
    '--runtime-task-alignment-refresh-package',
    refreshPackagePath,
    '--review-decisions',
    reviewDecisionsPath,
    '--output',
    outputPath,
    '--reviewed-by',
    'pm-reviewer-1',
    '--review-notes',
    'accepted reviewed runtime alignment actions for evidence chain',
  ])

  assert.equal(options.runtimeTaskAlignmentRefreshPackage, path.resolve(refreshPackagePath))
  assert.equal(options.reviewDecisions, path.resolve(reviewDecisionsPath))
  assert.equal(options.output, path.resolve(outputPath))
  assert.equal(options.reviewedBy, 'pm-reviewer-1')
  assert.equal(options.reviewNotes, 'accepted reviewed runtime alignment actions for evidence chain')
})

test('blocks review evidence when reviewer, notes, or action decisions are missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-task-alignment-review-'))
  const refreshPackagePath = path.join(root, 'runtime-task-alignment-refresh-package.json')
  const reviewDecisionsPath = path.join(root, 'runtime-task-alignment-review-decisions.json')
  const outputPath = path.join(root, 'runtime-task-alignment-review-evidence.json')

  await writeJson(refreshPackagePath, runtimeTaskAlignmentRefreshPackageFixture())
  await writeJson(reviewDecisionsPath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-task-alignment-review-decisions/v1',
    decisions: [
      {
        actionIndex: 1,
        stableCode: 'BTMP-SCH-02',
        decision: 'accepted_for_runtime_stable_code_review',
        decisionNotes: 'runtime title belongs to proposed stableCode; manual runtime update remains separately governed',
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanRuntimeTaskAlignmentReviewEvidence({
      runtimeTaskAlignmentRefreshPackage: refreshPackagePath,
      reviewDecisions: reviewDecisionsPath,
      output: outputPath,
      reviewedBy: '',
      reviewNotes: '',
      now: new Date('2026-07-07T02:00:00.000Z'),
    })

    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-runtime-task-alignment-review-evidence/v1')
    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.summary.actionCount, 5)
    assert.equal(report.summary.reviewedActionCount, 1)
    assert.equal(report.summary.unreviewedActionCount, 4)
    assert.equal(report.blockers.includes('reviewed_by_required'), true)
    assert.equal(report.blockers.includes('review_notes_required'), true)
    assert.equal(report.blockers.includes('all_refresh_actions_must_be_reviewed'), true)
    assert.equal(report.blockers.includes('missing_runtime_task_action_decision_required'), true)
    assert.equal(report.blockers.includes('actual_date_range_action_decision_required'), true)
    assert.equal(report.mutationBoundary.writesTasks, false)
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('accepts complete no-write runtime task alignment review evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-task-alignment-review-'))
  const refreshPackagePath = path.join(root, 'runtime-task-alignment-refresh-package.json')
  const reviewDecisionsPath = path.join(root, 'runtime-task-alignment-review-decisions.json')
  const outputPath = path.join(root, 'runtime-task-alignment-review-evidence.json')

  await writeJson(refreshPackagePath, runtimeTaskAlignmentRefreshPackageFixture())
  await writeJson(reviewDecisionsPath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-task-alignment-review-decisions/v1',
    decisions: [
      {
        actionIndex: 1,
        stableCode: 'BTMP-SCH-02',
        decision: 'accepted_for_runtime_stable_code_review',
        collisionReviewDecision: 'collision_requires_manual_runtime_update_plan',
        decisionNotes: 'runtime title maps to BTMP-SCH-03; collision must be handled by governed writer later',
      },
      {
        actionIndex: 2,
        stableCode: 'BTMP-SCH-03',
        decision: 'accepted_for_runtime_stable_code_review',
        decisionNotes: 'runtime title maps to BTMP-SCH-05',
      },
      {
        actionIndex: 3,
        stableCode: 'BTMP-SCH-04',
        decision: 'accepted_for_runtime_stable_code_review',
        decisionNotes: 'runtime title maps to BTMP-SCH-06',
      },
      {
        actionIndex: 4,
        stableCode: 'BTMP-SCH-05',
        decision: 'confirmed_candidate_scope_gap',
        decisionNotes: 'current runtime source has no completed task for this candidate row',
      },
      {
        actionIndex: 5,
        stableCode: 'BTMP-SCH-06',
        decision: 'confirmed_candidate_scope_gap',
        decisionNotes: 'current runtime source has no completed task for this candidate row',
      },
    ],
  })

  try {
    const report = await buildDefaultMasterPlanRuntimeTaskAlignmentReviewEvidence({
      runtimeTaskAlignmentRefreshPackage: refreshPackagePath,
      reviewDecisions: reviewDecisionsPath,
      output: outputPath,
      reviewedBy: 'pm-reviewer-1',
      reviewNotes: 'All five runtime task alignment refresh actions were reviewed for evidence-chain gating only.',
      now: new Date('2026-07-07T02:05:00.000Z'),
    })

    assert.equal(report.status, 'accepted_for_runtime_alignment_review')
    assert.equal(report.productionReady, false)
    assert.equal(report.baselineId, 'baseline-1')
    assert.equal(report.projectId, 'project-1')
    assert.equal(report.reviewedBy, 'pm-reviewer-1')
    assert.equal(report.summary.actionCount, 5)
    assert.equal(report.summary.reviewedActionCount, 5)
    assert.equal(report.summary.acceptedStableCodeRefreshCount, 3)
    assert.equal(report.summary.confirmedScopeGapCount, 2)
    assert.equal(report.summary.acceptedActualDateRangeEvidenceCount, 0)
    assert.equal(report.summary.collisionReviewedCount, 1)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.executionControl.executeAllowed, false)
    assert.equal(report.executionControl.reason, 'review_evidence_only_no_automatic_runtime_task_update')
    assert.equal(report.mutationBoundary.writesProductionTables, false)
    assert.equal(report.mutationBoundary.writesTasks, false)
    assert.equal(report.mutationBoundary.writesTaskDependencies, false)
    assert.equal(report.mutationBoundary.writesDurationSamples, false)
    assert.equal(report.mutationBoundary.writesRuntimePublication, false)

    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(written.summary.reviewedActionCount, 5)
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Runtime Task Alignment Review Evidence/)
    assert.match(markdown, /accepted_for_runtime_alignment_review/)
    assert.match(markdown, /BTMP-SCH-02/)
    assert.match(markdown, /confirmed_candidate_scope_gap/)
    assert.match(markdown, /no automatic runtime task update/i)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function runtimeTaskAlignmentRefreshPackageFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-task-alignment-refresh-package/v1',
    status: 'runtime_task_alignment_refresh_review_required',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    preparedBy: 'operator-1',
    summary: {
      inputCandidateRowCount: 18,
      inputRuntimeTaskCount: 16,
      actionCount: 5,
      stableCodeRefreshReviewActionCount: 3,
      missingRuntimeTaskActionCount: 2,
      actualDateRangeCollectionActionCount: 2,
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
        currentStableCode: 'BTMP-SCH-02',
        proposedStableCode: 'BTMP-SCH-03',
        blockers: ['human_operator_review_required', 'runtime_stable_code_collision_review_required'],
      },
      {
        index: 2,
        stableCode: 'BTMP-SCH-03',
        candidateTitle: '实验室通风与专业机电安装',
        runtimeTaskId: 'runtime-task-3',
        runtimeTitle: '操场道路与校园室外配套',
        actionKind: 'review_runtime_task_stable_code_refresh',
        currentStableCode: 'BTMP-SCH-03',
        proposedStableCode: 'BTMP-SCH-05',
        blockers: ['human_operator_review_required'],
      },
      {
        index: 3,
        stableCode: 'BTMP-SCH-04',
        candidateTitle: '食堂宿舍装修与机电收口',
        runtimeTaskId: 'runtime-task-4',
        runtimeTitle: '竣工验收与开学移交准备',
        actionKind: 'review_runtime_task_stable_code_refresh',
        currentStableCode: 'BTMP-SCH-04',
        proposedStableCode: 'BTMP-SCH-06',
        blockers: ['human_operator_review_required'],
      },
      {
        index: 4,
        stableCode: 'BTMP-SCH-05',
        candidateTitle: '操场道路与校园室外配套',
        runtimeTaskId: '',
        runtimeTitle: '',
        actionKind: 'collect_current_completed_task_or_confirm_scope_gap',
        currentStableCode: 'BTMP-SCH-05',
        proposedStableCode: 'BTMP-SCH-05',
        blockers: ['current_completed_task_evidence_required', 'human_operator_review_required'],
      },
      {
        index: 5,
        stableCode: 'BTMP-SCH-06',
        candidateTitle: '竣工验收与开学移交准备',
        runtimeTaskId: '',
        runtimeTitle: '',
        actionKind: 'collect_current_completed_task_or_confirm_scope_gap',
        currentStableCode: 'BTMP-SCH-06',
        proposedStableCode: 'BTMP-SCH-06',
        blockers: ['current_completed_task_evidence_required', 'human_operator_review_required'],
      },
    ],
    blockers: ['runtime_task_alignment_operator_review_required'],
    executionControl: {
      executeAllowed: false,
      reason: 'operator_review_package_only_no_automatic_task_update',
    },
    mutationBoundary: {
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
    },
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
