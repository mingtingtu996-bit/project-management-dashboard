import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkC19ReleaseClosureSources,
} from './check-c19-release-closure-sources.mjs';
import {
  assessControlledLiveWriterMigrationGovernance,
  assessC15RewardMaeReadback,
  buildC19ReleaseFiles,
  buildControlledCloseoutT2Metadata,
  buildC19ConstructionOrganizationRuntimeEvidence,
  buildC15SampleCalibrationCandidate,
  buildControlledCompletedTaskFixtureRows,
  buildRuntimeInput,
} from './run-controlled-live-closeout-writers.mjs';

test('C15 controlled writer blocks flat reward MAE readback', () => {
  const assessment = assessC15RewardMaeReadback({
    status: 'pass',
    calibrationId: 'calibration-1',
    maeBefore: 0.126,
    maeAfter: 0.126,
    evaluatedDecisionCount: 4,
  });

  assert.equal(assessment.status, 'blocked');
  assert.equal(assessment.reason, 'reward_mae_improvement_required');
  assert.equal(assessment.maeBefore, 0.126);
  assert.equal(assessment.maeAfter, 0.126);
  assert.equal(assessment.evaluatedDecisionCount, 4);
});

test('C15 controlled writer passes strictly improved reward MAE readback', () => {
  const assessment = assessC15RewardMaeReadback({
    status: 'pass',
    calibrationId: 'calibration-1',
    maeBefore: 0.126,
    maeAfter: 0.094,
    evaluatedDecisionCount: 4,
  });

  assert.equal(assessment.status, 'pass');
  assert.equal(assessment.reason, null);
});

test('C15 controlled writer blocks missing evaluated decision count', () => {
  const assessment = assessC15RewardMaeReadback({
    status: 'pass',
    calibrationId: 'calibration-1',
    maeBefore: 0.126,
    maeAfter: 0.094,
    evaluatedDecisionCount: 0,
  });

  assert.equal(assessment.status, 'blocked');
  assert.equal(assessment.reason, 'reward_mae_decision_count_required');
});

test('C15 controlled writer builds a real sample rebaseline candidate with holdout MAE improvement', () => {
  const candidate = buildC15SampleCalibrationCandidate({
    projectId: 'project-1',
    generatedAt: '2026-06-29T10:00:00.000Z',
    samples: [
      sample('s1', 7, 7),
      sample('s2', 8, 10),
      sample('s3', 5, 5),
      sample('s4', 9, 9),
      sample('s5', 21, 71),
      sample('s6', 9, 10),
      sample('s7', 6, 6),
      sample('s8', 6, 8),
      sample('s9', 58, 15),
    ],
  });

  assert.equal(candidate.status, 'candidate');
  assert.equal(candidate.actionPolicy, 'candidate_only');
  assert.equal(candidate.sampleCount, 9);
  assert.ok(candidate.maeAfter < candidate.maeBefore);
  assert.equal(candidate.evidenceSummary.replayMethod, 'ordered_train_holdout_duration_productivity_rebaseline');
  assert.equal(candidate.evidenceSummary.trainingSampleIds.length, 6);
  assert.equal(candidate.evidenceSummary.holdoutSampleIds.length, 3);
});

test('C15 controlled writer blocks sample rebaseline when holdout MAE does not improve', () => {
  const candidate = buildC15SampleCalibrationCandidate({
    projectId: 'project-1',
    generatedAt: '2026-06-29T10:00:00.000Z',
    samples: [
      sample('s1', 10, 10),
      sample('s2', 10, 10),
      sample('s3', 6, 10),
      sample('s4', 6, 10),
    ],
  });

  assert.equal(candidate.status, 'blocked');
  assert.equal(candidate.reason, 'holdout_mae_improvement_required');
  assert.ok(candidate.maeAfter >= candidate.maeBefore);
});

test('C19 controlled writer records E1/E3/E5 construction organization runtime evidence details', () => {
  const evidence = buildC19ConstructionOrganizationRuntimeEvidence({
    projectId: 'project-1',
    companyId: 'company-1',
    publicationKey: 'publication-1',
    insertedDependencyCount: 3,
    dependencyRollbackCount: 3,
    planDateRollbackCount: 4,
  });

  assert.equal(evidence.status, 'pass');
  assert.deepEqual(evidence.evidenceLevels, ['E1', 'E3', 'E5']);
  assert.equal(evidence.e1RuntimeEvidence.status, 'pass');
  assert.equal(evidence.e1RuntimeEvidence.source, 'runtime_publication_apply');
  assert.equal(evidence.e1RuntimeEvidence.insertedDependencyCount, 3);
  assert.equal(evidence.e3RuntimeEvidence.status, 'pass');
  assert.equal(evidence.e3RuntimeEvidence.source, 'impact_monitoring_observation');
  assert.equal(evidence.e5RuntimeEvidence.status, 'pass');
  assert.equal(evidence.e5RuntimeEvidence.source, 'runtime_rollback_saved_outcome');
  assert.equal(evidence.e5RuntimeEvidence.dependencyRollbackCount, 3);
  assert.equal(evidence.e5RuntimeEvidence.planDateRollbackCount, 4);
});

test('C19 controlled writer emits generator-consumable release closure source contracts', async () => {
  const releaseFiles = buildC19ReleaseFiles({
    projectId: 'project-1',
    companyId: 'company-1',
    generatedAt: '2026-07-05T02:00:00.000Z',
    runtimeInput: {
      impactMonitoringRefs: ['2026-07-05T10:00:00+08:00/2026-07-05T12:00:00+08:00'],
    },
    c15Result: {
      candidateId: 'candidate-1',
    },
    samples: [
      { id: 'sample-1' },
      { id: 'sample-2' },
    ],
    fixtureSeed: {
      insertedCount: 0,
    },
  });
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-writer-sources-'));
  await writeJson(path.join(root, 'c19-t2-rhythm-live-replay.json'), releaseFiles.liveReplay);
  await writeJson(path.join(root, 'phase1-evaluation.json'), releaseFiles.phase1Evaluation);
  await writeJson(path.join(root, 'l5-release-gate.json'), releaseFiles.l5ReleaseGate);

  const report = await checkC19ReleaseClosureSources({
    artifactRoot: root,
    now: new Date('2026-07-05T02:05:00.000Z'),
  });

  assert.equal(report.status, 'ready');
  assert.equal(report.readyToGenerateReleaseClosure, true);
  assert.deepEqual(report.missingSourceFileRoles, []);
  assert.deepEqual(report.invalidSourceFileRoles, []);
  assert.deepEqual(report.templateScope.commonTemplateIds, ['t2-controlled-closeout-template']);
});

test('C19 controlled writer emits canonical package T2 window codes for runtime input', () => {
  const runtimeInput = buildRuntimeInput({
    handoff: {
      gates: {
        'c19-runtime-publication-release-rollback': {
          approvals: { manualApprovalRef: 'approval://manual' },
          owners: {
            consumerObservationOwner: 'operator://consumer',
            rollbackOwner: 'operator://rollback',
          },
        },
      },
    },
    project: {
      planned_start_date: '2026-07-01',
      start_date: null,
      created_at: '2026-07-01T00:00:00.000Z',
    },
    tasks: [
      task('task-1', '2026-07-01', '2026-07-02'),
      task('task-2', '2026-07-03', '2026-07-05'),
      task('task-3', '2026-07-06', '2026-07-08'),
      task('task-4', '2026-07-09', '2026-07-11'),
    ],
    metricWindow: '2026-07-01T00:00:00.000Z/2026-07-01T01:00:00.000Z',
  });

  assert.deepEqual(
    runtimeInput.networkNodes.map((node) => node.windowCode),
    [
      't2-residential-standard-floor-structure-rhythm-v1:W01',
      't2-residential-standard-floor-structure-rhythm-v1:W02',
      't2-residential-standard-floor-structure-rhythm-v1:W03',
      't2-residential-standard-floor-structure-rhythm-v1:W04',
    ],
  );
  assert.deepEqual(
    runtimeInput.networkEdges.map((edge) => [edge.predecessorWindowCode, edge.successorWindowCode]),
    [
      [
        't2-residential-standard-floor-structure-rhythm-v1:W01',
        't2-residential-standard-floor-structure-rhythm-v1:W02',
      ],
      [
        't2-residential-standard-floor-structure-rhythm-v1:W02',
        't2-residential-standard-floor-structure-rhythm-v1:W03',
      ],
      [
        't2-residential-standard-floor-structure-rhythm-v1:W03',
        't2-residential-standard-floor-structure-rhythm-v1:W04',
      ],
    ],
  );
});

test('C19 controlled writer metadata covers six duration-bearing windows with three workfaces each', () => {
  const metadata = Array.from({ length: 18 }, (_, index) => buildControlledCloseoutT2Metadata(index));
  const countsByWindow = new Map();
  const workfacesByWindow = new Map();

  for (const item of metadata) {
    assert.match(item.windowCode, /^t2-residential-standard-floor-structure-rhythm-v1:W0[1-6]$/);
    countsByWindow.set(item.windowCode, (countsByWindow.get(item.windowCode) ?? 0) + 1);
    if (!workfacesByWindow.has(item.windowCode)) workfacesByWindow.set(item.windowCode, new Set());
    workfacesByWindow.get(item.windowCode).add(item.workfaceKey);
  }

  assert.deepEqual(
    [...countsByWindow.entries()].sort(),
    [
      ['t2-residential-standard-floor-structure-rhythm-v1:W01', 3],
      ['t2-residential-standard-floor-structure-rhythm-v1:W02', 3],
      ['t2-residential-standard-floor-structure-rhythm-v1:W03', 3],
      ['t2-residential-standard-floor-structure-rhythm-v1:W04', 3],
      ['t2-residential-standard-floor-structure-rhythm-v1:W05', 3],
      ['t2-residential-standard-floor-structure-rhythm-v1:W06', 3],
    ],
  );
  assert.deepEqual(
    [...workfacesByWindow.entries()].map(([windowCode, workfaces]) => [windowCode, workfaces.size]).sort(),
    [
      ['t2-residential-standard-floor-structure-rhythm-v1:W01', 3],
      ['t2-residential-standard-floor-structure-rhythm-v1:W02', 3],
      ['t2-residential-standard-floor-structure-rhythm-v1:W03', 3],
      ['t2-residential-standard-floor-structure-rhythm-v1:W04', 3],
      ['t2-residential-standard-floor-structure-rhythm-v1:W05', 3],
      ['t2-residential-standard-floor-structure-rhythm-v1:W06', 3],
    ],
  );
});

test('controlled fixture task rows only fill the C19 completed-task gap', () => {
  const rows = buildControlledCompletedTaskFixtureRows({
    generatedAt: '2026-07-05T00:00:00.000Z',
    existingTasks: [
      task('task-1', '2026-06-01', '2026-06-05'),
      task('task-2', '2026-06-06', '2026-06-10'),
      task('task-3', '2026-06-11', '2026-06-15'),
    ],
    missingCount: 2,
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'v1.4.24 controlled closeout completed task 4');
  assert.equal(rows[0].startDate, '2026-06-16');
  assert.equal(rows[0].endDate, '2026-06-20');
  assert.equal(rows[1].startDate, '2026-06-21');
  assert.equal(rows[1].endDate, '2026-06-25');
  assert.equal(rows[0].standardTaskMetadata.workbuddyControlledCloseoutFixture, true);
  assert.equal(rows[0].standardTaskMetadata.controlledCloseoutVersion, 'v1.4.24');
  assert.equal(rows[0].planningGovernanceMetadata.controlledCloseoutFixture, true);
});

test('controlled fixture task rows are empty when no C19 gap exists', () => {
  const rows = buildControlledCompletedTaskFixtureRows({
    generatedAt: '2026-07-05T00:00:00.000Z',
    existingTasks: [task('task-1', '2026-06-01', '2026-06-05')],
    missingCount: 0,
  });

  assert.deepEqual(rows, []);
});

test('controlled live writer requires explicit closed migration governance before runtime writes', () => {
  assert.deepEqual(
    assessControlledLiveWriterMigrationGovernance(null),
    {
      status: 'blocked',
      reasons: ['migration_governance_file_required'],
    },
  );

  assert.deepEqual(
    assessControlledLiveWriterMigrationGovernance({
      status: 'ready_for_closeout_readback',
      allowScheduler: false,
      gates: [{ id: 'MG-07', status: 'blocked' }],
    }),
    {
      status: 'blocked',
      reasons: [
        'production_migration_governance_closed_evidence_required',
        'production_migration_governance_mg07_pass_required',
        'production_migration_governance_runtime_writes_not_allowed',
      ],
    },
  );

  assert.deepEqual(
    assessControlledLiveWriterMigrationGovernance({
      status: 'closed',
      allowScheduler: true,
      gates: [{ id: 'MG-07', status: 'pass' }],
    }),
    {
      status: 'pass',
      reasons: [],
    },
  );
});

function sample(id, plannedDuration, actualDuration) {
  return {
    id,
    taskId: `task-${id}`,
    plannedDuration,
    actualDuration,
    completedAt: '2026-05-01',
  };
}

function task(id, actualStartDate, actualEndDate) {
  return {
    id,
    actual_start_date: actualStartDate,
    actual_end_date: actualEndDate,
    planned_start_date: actualStartDate,
    planned_end_date: actualEndDate,
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('controlled live writer SQL templates do not skip positional parameters', async () => {
  const source = await readFile(new URL('./run-controlled-live-closeout-writers.mjs', import.meta.url), 'utf8');
  const templates = [...source.matchAll(/`([\s\S]*?)`/g)].map((match) => match[1]);
  const skipped = [];
  for (const sql of templates) {
    if (!/\$\d+/.test(sql)) continue;
    const params = [...new Set([...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])))]
      .sort((left, right) => left - right);
    for (let index = 1; index <= params.at(-1); index += 1) {
      if (!params.includes(index)) {
        skipped.push({ missing: index, sql: sql.trim().split(/\s+/).slice(0, 12).join(' ') });
      }
    }
  }

  assert.deepEqual(skipped, []);
});
