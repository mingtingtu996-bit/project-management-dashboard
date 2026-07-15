import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildDefaultMasterPlanRuntimeTaskAlignmentRefreshPackage,
  parseArgs,
} from './build-default-master-plan-runtime-task-alignment-refresh-package.mjs'

test('parseArgs accepts runtime candidate alignment preflight, output, and operator identity', () => {
  const preflightPath = path.join('tmp', 'runtime-candidate-alignment-preflight.json')
  const outputPath = path.join('tmp', 'runtime-task-alignment-refresh-package.json')

  const options = parseArgs([
    '--runtime-candidate-alignment-preflight',
    preflightPath,
    '--output',
    outputPath,
    '--prepared-by',
    'pm-reviewer-1',
  ])

  assert.equal(options.runtimeCandidateAlignmentPreflight, path.resolve(preflightPath))
  assert.equal(options.output, path.resolve(outputPath))
  assert.equal(options.preparedBy, 'pm-reviewer-1')
})

test('builds a no-write operator review package for runtime task stableCode drift and missing runtime tasks', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-task-alignment-refresh-'))
  const preflightPath = path.join(root, 'runtime-candidate-alignment-preflight.json')
  const outputPath = path.join(root, 'runtime-task-alignment-refresh-package.json')

  await writeJson(preflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-runtime-candidate-alignment-preflight/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    summary: {
      candidateRowCount: 5,
      runtimeTaskCount: 3,
      matchedStableCodeCount: 3,
      missingRuntimeTaskCount: 2,
      titleMismatchCount: 2,
      titleMatchedDifferentStableCodeCount: 2,
      rowsWithActualDateRangeCount: 2,
      rowsMissingActualDateRangeCount: 3,
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
        blockers: [
          'runtime_task_title_mismatch',
          'runtime_task_title_matches_different_candidate_stable_code',
        ],
      },
      {
        stableCode: 'BTMP-SCH-03',
        candidateTitle: '实验室通风与专业机电安装',
        runtimeTaskId: 'runtime-task-3',
        runtimeTitle: '操场道路与校园室外配套',
        alignmentStatus: 'title_mismatch',
        matchingCandidateStableCodeByRuntimeTitle: 'BTMP-SCH-05',
        recommendedAction: 'refresh_runtime_task_stable_code_or_collect_current_completed_task',
        blockers: [
          'runtime_task_title_mismatch',
          'runtime_task_title_matches_different_candidate_stable_code',
        ],
      },
      {
        stableCode: 'BTMP-SCH-04',
        candidateTitle: '食堂宿舍装修与机电收口',
        runtimeTaskId: 'runtime-task-4',
        runtimeTitle: '食堂宿舍装修与机电收口',
        alignmentStatus: 'actual_date_range_missing',
        recommendedAction: '',
        blockers: ['runtime_task_actual_date_range_missing'],
      },
      {
        stableCode: 'BTMP-SCH-05',
        candidateTitle: '操场道路与校园室外配套',
        runtimeTaskId: '',
        runtimeTitle: '',
        alignmentStatus: 'missing_runtime_task',
        recommendedAction: 'refresh_runtime_task_stable_code_or_collect_current_completed_task',
        blockers: [
          'runtime_task_missing_for_candidate_stable_code',
          'runtime_task_actual_date_range_missing',
        ],
      },
      {
        stableCode: 'BTMP-SCH-06',
        candidateTitle: '竣工验收与开学移交准备',
        runtimeTaskId: '',
        runtimeTitle: '',
        alignmentStatus: 'missing_runtime_task',
        recommendedAction: 'refresh_runtime_task_stable_code_or_collect_current_completed_task',
        blockers: [
          'runtime_task_missing_for_candidate_stable_code',
          'runtime_task_actual_date_range_missing',
        ],
      },
    ],
    blockers: [
      'runtime_candidate_alignment_coverage_incomplete',
      'runtime_candidate_title_mismatch_rows_present',
      'runtime_candidate_actual_date_range_missing',
    ],
  })

  try {
    const report = await buildDefaultMasterPlanRuntimeTaskAlignmentRefreshPackage({
      runtimeCandidateAlignmentPreflight: preflightPath,
      output: outputPath,
      preparedBy: 'pm-reviewer-1',
      now: new Date('2026-07-07T01:20:00.000Z'),
    })

    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-runtime-task-alignment-refresh-package/v1')
    assert.equal(report.status, 'runtime_task_alignment_refresh_review_required')
    assert.equal(report.productionReady, false)
    assert.equal(report.baselineId, 'baseline-1')
    assert.equal(report.projectId, 'project-1')
    assert.equal(report.preparedBy, 'pm-reviewer-1')
    assert.equal(report.executionControl.executeAllowed, false)
    assert.equal(report.summary.stableCodeRefreshReviewActionCount, 2)
    assert.equal(report.summary.missingRuntimeTaskActionCount, 2)
    assert.equal(report.summary.actualDateRangeCollectionActionCount, 3)
    assert.equal(report.summary.collisionReviewActionCount, 1)
    assert.deepEqual(report.actions.map((action) => action.actionKind), [
      'review_runtime_task_stable_code_refresh',
      'review_runtime_task_stable_code_refresh',
      'collect_runtime_task_actual_date_range',
      'collect_current_completed_task_or_confirm_scope_gap',
      'collect_current_completed_task_or_confirm_scope_gap',
    ])
    assert.deepEqual(report.actions[0], {
      index: 1,
      stableCode: 'BTMP-SCH-02',
      candidateTitle: '教学楼二次结构与普通教室粗装修',
      runtimeTaskId: 'runtime-task-2',
      runtimeTitle: '实验室通风与专业机电安装',
      actionKind: 'review_runtime_task_stable_code_refresh',
      currentStableCode: 'BTMP-SCH-02',
      proposedStableCode: 'BTMP-SCH-03',
      matchingCandidateStableCodeByRuntimeTitle: 'BTMP-SCH-03',
      requiresHumanReview: true,
      executeAllowed: false,
      recommendedOperatorAction: 'review_runtime_task_stable_code_refresh_against_source_task_and_operator_review',
      blockers: [
        'human_operator_review_required',
        'runtime_stable_code_collision_review_required',
      ],
    })
    assert.equal(report.actions[3].actionKind, 'collect_current_completed_task_or_confirm_scope_gap')
    assert.equal(report.actions[3].stableCode, 'BTMP-SCH-05')
    assert.equal(report.actions[3].runtimeTaskId, '')
    assert.equal(report.actions[3].executeAllowed, false)
    assert.equal(report.mutationBoundary.writesTasks, false)
    assert.equal(report.mutationBoundary.writesProductionTables, false)

    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(written.summary.missingRuntimeTaskActionCount, 2)
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /Runtime Task Alignment Refresh Package/)
    assert.match(markdown, /runtime_task_alignment_refresh_review_required/)
    assert.match(markdown, /BTMP-SCH-02/)
    assert.match(markdown, /BTMP-SCH-03/)
    assert.match(markdown, /no automatic database mutation/i)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
