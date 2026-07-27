import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkC19RuntimeInput,
  parseArgs,
} from './check-c19-runtime-input.mjs';

test('C19 runtime input check passes for complete guarded publication input', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-runtime-input-pass-'));
  const handoffFile = path.join(root, 'handoff.json');
  const runtimeInputFile = path.join(root, 'runtime-input.json');
  await writeJson(handoffFile, c19Handoff());
  await writeJson(runtimeInputFile, runtimeInput());

  try {
    const report = await checkC19RuntimeInput({
      handoffFile,
      runtimeInputFile,
      now: new Date('2026-06-29T06:10:00.000Z'),
    });

    assert.equal(report.status, 'pass');
    assert.equal(report.counts.failures, 0);
    assert.equal(report.boundary.liveMutation, false);
    assert.equal(report.boundary.dbMutation, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 runtime input check fails for missing refs and unmapped nodes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-runtime-input-fail-'));
  const handoffFile = path.join(root, 'handoff.json');
  const runtimeInputFile = path.join(root, 'runtime-input.json');
  const handoff = c19Handoff();
  handoff.gates['c19-runtime-publication-release-rollback'].release.phase1L5Ref = '';
  const input = runtimeInput();
  input.approvalEvidenceRefs = [];
  input.networkNodes.push({
    nodeId: 'node-unmapped',
    templateId: 't2-residential-standard-floor-structure-rhythm-v1',
    startDay: 8,
    finishDay: 10,
  });
  input.networkEdges.push({
    predecessorNodeId: 'node-missing',
    successorNodeId: 'node-unmapped',
  });
  await writeJson(handoffFile, handoff);
  await writeJson(runtimeInputFile, input);

  try {
    const report = await checkC19RuntimeInput({ handoffFile, runtimeInputFile });

    assert.equal(report.status, 'fail');
    assert.ok(report.failures.some((failure) => failure.field === 'release.phase1L5Ref'));
    assert.ok(report.failures.some((failure) => failure.field === 'runtimeInput.approvalEvidenceRefs'));
    assert.ok(report.failures.some((failure) => failure.message.includes('no task mapping')));
    assert.ok(report.failures.some((failure) => failure.message.includes('unknown predecessor node')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 runtime input check rejects legacy coarse T2 window codes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-runtime-input-window-code-fail-'));
  const handoffFile = path.join(root, 'handoff.json');
  const runtimeInputFile = path.join(root, 'runtime-input.json');
  const input = runtimeInput();
  input.networkNodes[0].windowCode = 'T2-STRUCTURE';
  input.networkEdges[0].predecessorWindowCode = 'T2-STRUCTURE';
  await writeJson(handoffFile, c19Handoff());
  await writeJson(runtimeInputFile, input);

  try {
    const report = await checkC19RuntimeInput({ handoffFile, runtimeInputFile });

    assert.equal(report.status, 'fail');
    assert.ok(report.failures.some((failure) => (
      failure.field === 'runtimeInput.networkNodes[0].windowCode'
      && failure.message.includes('canonical T2 package window format')
    )));
    assert.ok(report.failures.some((failure) => (
      failure.field === 'runtimeInput.networkEdges[0].predecessorWindowCode'
      && failure.message.includes('canonical T2 package window format')
    )));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 runtime input argument parser accepts required paths', () => {
  const parsed = parseArgs([
    '--handoff-file',
    'handoff.json',
    '--runtime-input-file',
    'runtime-input.json',
    '--output',
    'check.json',
  ]);

  assert.match(parsed.handoffFile, /handoff\.json$/);
  assert.match(parsed.runtimeInputFile, /runtime-input\.json$/);
  assert.match(parsed.output, /check\.json$/);
});

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function c19Handoff() {
  return {
    schemaVersion: 'workbuddy-release-handoff-input/v1',
    gates: {
      'c19-runtime-publication-release-rollback': {
        targets: {
          companyId: 'company-1',
          projectId: 'project-1',
        },
        release: {
          phase1L5Ref: 'artifact://phase1-l5',
          releaseClosureArtifactRef: 'artifact://release-closure',
          rollbackTargetRef: 'rollback://target',
          monitoringWindow: '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z',
        },
        approvals: {
          manualApprovalRef: 'approval://manual',
        },
        owners: {
          consumerObservationOwner: 'operator://consumer-observation',
          monitoringOwner: 'operator://monitoring',
          rollbackOwner: 'operator://rollback',
        },
      },
    },
  };
}

function runtimeInput() {
  return {
    projectStartDate: '2026-07-01',
    approvedByUserId: 'release-user',
    approvalEvidenceRefs: ['approval:t2-runtime-publication'],
    consumerVerificationRefs: ['projectCriticalPathService.consumes_task_dependencies'],
    impactMonitoringRefs: ['monitor:t2-runtime-publication:14d'],
    eventStatus: 'monitoring_passed',
    eventPayload: {
      businessType: 'residential',
    },
    rollbackReason: 'canary_monitoring_regression',
    rollbackEvidenceRefs: ['rollback-drill:t2-schedule-runtime'],
    taskMappings: [{
      nodeId: 'node-foundation',
      taskId: '20000000-0000-4000-8000-000000000001',
    }, {
      nodeId: 'node-structure',
      taskId: '20000000-0000-4000-8000-000000000002',
    }],
    networkNodes: [{
      nodeId: 'node-foundation',
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      windowCode: 't2-residential-standard-floor-structure-rhythm-v1:W01',
      startDay: 1,
      finishDay: 2,
    }, {
      nodeId: 'node-structure',
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      windowCode: 't2-residential-standard-floor-structure-rhythm-v1:W02',
      startDay: 3,
      finishDay: 7,
    }],
    networkEdges: [{
      predecessorNodeId: 'node-foundation',
      successorNodeId: 'node-structure',
      predecessorWindowCode: 't2-residential-standard-floor-structure-rhythm-v1:W01',
      successorWindowCode: 't2-residential-standard-floor-structure-rhythm-v1:W02',
    }],
  };
}
