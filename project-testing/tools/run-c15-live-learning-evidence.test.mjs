import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parseArgs,
  runC15LiveLearningEvidence,
} from './run-c15-live-learning-evidence.mjs';
import { validateReleaseEvidence } from './validate-release-evidence.mjs';

test('C15 live learning evidence runner writes fail-closed artifacts by default', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c15-learning-blocked-'));
  const handoffFile = path.join(root, 'handoff.json');
  await writeFile(handoffFile, `${JSON.stringify(c15Handoff(), null, 2)}\n`, 'utf8');

  try {
    const result = await runC15LiveLearningEvidence({
      handoffFile,
      artifactRoot: root,
      metricWindow: '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z',
      now: new Date('2026-06-29T04:30:00.000Z'),
      canaryWriter: async () => {
        throw new Error('canary writer must not run without --allow-write');
      },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.liveMutation, false);
    assert.equal(result.dbMutation, false);
    assert.deepEqual(result.outputs.map((item) => path.basename(item.path)).sort(), [
      'c15-canary-approval-monitoring.json',
      'c15-live-evidence-summary.json',
      'c15-pending-prediction-closure.json',
      'c15-policy-version-tenant-isolation.json',
      'c15-reward-mae-quality-readback.json',
      'c15-rollback-or-supersede.json',
      'c15-sample-cohort-readback.json',
    ]);

    const sample = JSON.parse(await readFile(path.join(root, 'c15-sample-cohort-readback.json'), 'utf8'));
    const tenant = JSON.parse(await readFile(path.join(root, 'c15-policy-version-tenant-isolation.json'), 'utf8'));
    const summary = JSON.parse(await readFile(path.join(root, 'c15-live-evidence-summary.json'), 'utf8'));

    assert.equal(sample.missingRealSampleCohort, true);
    assert.equal(tenant.missingTenantIsolationReadback, true);
    assert.equal(summary.missingRealSampleCohort, true);
    assert.equal(summary.missingTenantIsolationReadback, true);
    assert.equal(sample.environment, 'operator://environment');
    assert.equal(sample.companyId, 'company-1');
    assert.equal(sample.projectId, 'project-1');
    assert.equal(sample.candidateId, 'candidate-1');
    assert.equal(sample.sampleCohortRef, 'db-sample://candidate-1');
    assert.equal(sample.metricWindow, '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z');
    assert.equal(sample.approvalRef, 'approval://manual');
    assert.equal(sample.rollbackRef, 'operator://rollback');

    const validation = await validateReleaseEvidence({
      gateId: 'c15-live-learning-closeout',
      evidenceRoot: root,
      now: new Date('2026-06-29T04:31:00.000Z'),
    });

    assert.equal(validation.status, 'fail');
    assert.ok(validation.failures.some((failure) => failure.code === 'reject-marker-present'
      && failure.detail === 'missing-real-sample-cohort'));
    assert.ok(validation.failures.some((failure) => failure.code === 'reject-marker-present'
      && failure.detail === 'missing-tenant-isolation-readback'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C15 live learning evidence runner rejects write mode unless handoff is ready', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c15-learning-write-blocked-'));
  const handoffFile = path.join(root, 'handoff.json');
  const handoff = c15Handoff();
  handoff.unlockFlags.confirmLiveHandoff = false;
  await writeFile(handoffFile, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');

  try {
    await assert.rejects(
      runC15LiveLearningEvidence({
        handoffFile,
        artifactRoot: root,
        includeLive: true,
        confirmLiveHandoff: true,
        allowWrite: true,
        canaryWriter: async () => {
          throw new Error('canary writer must not run with failed handoff');
        },
      }),
      /handoff is not ready/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C15 live learning evidence runner records missing metadata reasons in fail-closed artifacts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c15-learning-blocked-metadata-'));
  const handoffFile = path.join(root, 'handoff.json');
  const handoff = c15Handoff();
  handoff.gates['c15-live-learning-closeout'].targets.candidateId = '';
  handoff.gates['c15-live-learning-closeout'].targets.sampleCohortRef = '';
  await writeFile(handoffFile, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');

  try {
    const result = await runC15LiveLearningEvidence({
      handoffFile,
      artifactRoot: root,
      now: new Date('2026-06-29T04:35:00.000Z'),
    });

    assert.equal(result.status, 'blocked');

    const sample = JSON.parse(await readFile(path.join(root, 'c15-sample-cohort-readback.json'), 'utf8'));
    const summary = JSON.parse(await readFile(path.join(root, 'c15-live-evidence-summary.json'), 'utf8'));

    assert.ok(sample.metadataReasons.includes('candidate_id_required'));
    assert.ok(sample.metadataReasons.includes('sample_cohort_ref_required'));
    assert.ok(summary.metadataReasons.includes('metric_window_required'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C15 live learning evidence runner writes pass artifacts from a controlled writer result', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c15-learning-pass-'));
  const handoffFile = path.join(root, 'handoff.json');
  await writeFile(handoffFile, `${JSON.stringify(c15Handoff(), null, 2)}\n`, 'utf8');

  try {
    const result = await runC15LiveLearningEvidence({
      handoffFile,
      artifactRoot: root,
      includeLive: true,
      confirmLiveHandoff: true,
      allowWrite: true,
      metricWindow: '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z',
      now: new Date('2026-06-29T05:30:00.000Z'),
      canaryWriter: async () => ({
        status: 'pass',
        sampleCohortReadback: { status: 'pass', sampleCount: 42 },
        rewardMaeQualityReadback: {
          status: 'pass',
          maeBefore: 4.8,
          maeAfter: 3.2,
          evaluatedDecisionCount: 12,
        },
        pendingPredictionClosure: { status: 'pass', pendingPredictionCount: 0 },
        policyVersionUniqueness: { status: 'pass', duplicateVersionCount: 0 },
        tenantIsolationReadback: { status: 'pass', crossTenantRows: 0 },
        canaryApprovalMonitoring: { status: 'pass', monitoringWindow: '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z' },
        rollbackOrSupersede: { status: 'pass', rollbackRef: 'operator://rollback' },
      }),
    });

    assert.equal(result.status, 'pass');
    assert.equal(result.liveMutation, true);
    assert.equal(result.dbMutation, true);

    const summary = JSON.parse(await readFile(path.join(root, 'c15-live-evidence-summary.json'), 'utf8'));
    assert.equal(summary.status, 'pass');
    assert.equal(summary.missingRealSampleCohort, false);
    assert.equal(summary.missingTenantIsolationReadback, false);
    assert.equal(summary.tenantIsolationReadback.status, 'pass');

    const validation = await validateReleaseEvidence({
      gateId: 'c15-live-learning-closeout',
      evidenceRoot: root,
      now: new Date('2026-06-29T05:31:00.000Z'),
    });

    assert.equal(validation.status, 'pass');
    assert.equal(validation.counts.expectedArtifactsPresent, 7);
    assert.equal(validation.counts.rejectMarkersMatched, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C15 live learning evidence runner blocks flat reward MAE writer results', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c15-learning-flat-mae-'));
  const handoffFile = path.join(root, 'handoff.json');
  await writeFile(handoffFile, `${JSON.stringify(c15Handoff(), null, 2)}\n`, 'utf8');

  try {
    const result = await runC15LiveLearningEvidence({
      handoffFile,
      artifactRoot: root,
      includeLive: true,
      confirmLiveHandoff: true,
      allowWrite: true,
      metricWindow: '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z',
      now: new Date('2026-06-29T05:35:00.000Z'),
      canaryWriter: async () => ({
        status: 'pass',
        sampleCohortReadback: { status: 'pass', sampleCount: 42 },
        rewardMaeQualityReadback: {
          status: 'pass',
          maeBefore: 0.126,
          maeAfter: 0.126,
          evaluatedDecisionCount: 4,
        },
        pendingPredictionClosure: { status: 'pass', pendingPredictionCount: 0 },
        policyVersionUniqueness: { status: 'pass', duplicateVersionCount: 0 },
        tenantIsolationReadback: { status: 'pass', crossTenantRows: 0 },
        canaryApprovalMonitoring: { status: 'pass', monitoringWindow: '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z' },
        rollbackOrSupersede: { status: 'pass', rollbackRef: 'operator://rollback' },
      }),
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.liveMutation, false);
    assert.equal(result.dbMutation, false);
    assert.ok(result.reasons.includes('reward_mae_improvement_required'));

    const summary = JSON.parse(await readFile(path.join(root, 'c15-live-evidence-summary.json'), 'utf8'));
    assert.equal(summary.status, 'blocked');
    assert.ok(summary.reasons.includes('reward_mae_improvement_required'));

    const validation = await validateReleaseEvidence({
      gateId: 'c15-live-learning-closeout',
      evidenceRoot: root,
      now: new Date('2026-06-29T05:36:00.000Z'),
    });

    assert.equal(validation.status, 'fail');
    assert.ok(validation.failures.some((failure) => failure.detail === 'reward-mae-improvement'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C15 live learning evidence runner keeps weak writer results blocked', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c15-learning-weak-'));
  const handoffFile = path.join(root, 'handoff.json');
  await writeFile(handoffFile, `${JSON.stringify(c15Handoff(), null, 2)}\n`, 'utf8');

  try {
    const result = await runC15LiveLearningEvidence({
      handoffFile,
      artifactRoot: root,
      includeLive: true,
      confirmLiveHandoff: true,
      allowWrite: true,
      metricWindow: '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z',
      now: new Date('2026-06-29T05:40:00.000Z'),
      canaryWriter: async () => ({
        status: 'pass',
        sampleCohortReadback: { status: 'pass', sampleCount: 42 },
      }),
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.liveMutation, false);
    assert.equal(result.dbMutation, false);

    const validation = await validateReleaseEvidence({
      gateId: 'c15-live-learning-closeout',
      evidenceRoot: root,
      now: new Date('2026-06-29T05:41:00.000Z'),
    });

    assert.equal(validation.status, 'fail');
    assert.ok(validation.failures.some((failure) => failure.code === 'reject-marker-present'
      && failure.detail === 'missing-tenant-isolation-readback'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C15 live learning evidence runner keeps pass writer result blocked when required metadata is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c15-learning-metadata-'));
  const handoffFile = path.join(root, 'handoff.json');
  await writeFile(handoffFile, `${JSON.stringify(c15Handoff(), null, 2)}\n`, 'utf8');

  try {
    const result = await runC15LiveLearningEvidence({
      handoffFile,
      artifactRoot: root,
      includeLive: true,
      confirmLiveHandoff: true,
      allowWrite: true,
      now: new Date('2026-06-29T05:45:00.000Z'),
      canaryWriter: async () => ({
        status: 'pass',
        sampleCohortReadback: { status: 'pass', sampleCount: 42 },
        rewardMaeQualityReadback: {
          status: 'pass',
          maeBefore: 4.8,
          maeAfter: 3.2,
          evaluatedDecisionCount: 12,
        },
        pendingPredictionClosure: { status: 'pass', pendingPredictionCount: 0 },
        policyVersionUniqueness: { status: 'pass', duplicateVersionCount: 0 },
        tenantIsolationReadback: { status: 'pass', crossTenantRows: 0 },
        canaryApprovalMonitoring: { status: 'pass' },
        rollbackOrSupersede: { status: 'pass' },
      }),
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.liveMutation, false);

    const summary = JSON.parse(await readFile(path.join(root, 'c15-live-evidence-summary.json'), 'utf8'));
    assert.ok(summary.reasons.includes('metric_window_required'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C15 live learning evidence runner can read a controlled writer result file', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c15-learning-file-'));
  const handoffFile = path.join(root, 'handoff.json');
  const writerResultFile = path.join(root, 'writer-result.json');
  await writeFile(handoffFile, `${JSON.stringify(c15Handoff(), null, 2)}\n`, 'utf8');
  await writeFile(writerResultFile, `${JSON.stringify({
    status: 'pass',
    sampleCohortReadback: { status: 'pass', sampleCount: 42 },
    rewardMaeQualityReadback: {
      status: 'pass',
      maeBefore: 4.8,
      maeAfter: 3.2,
      evaluatedDecisionCount: 12,
    },
    pendingPredictionClosure: { status: 'pass', pendingPredictionCount: 0 },
    policyVersionUniqueness: { status: 'pass', duplicateVersionCount: 0 },
    tenantIsolationReadback: { status: 'pass', crossTenantRows: 0 },
    canaryApprovalMonitoring: { status: 'pass' },
    rollbackOrSupersede: { status: 'pass' },
  }, null, 2)}\n`, 'utf8');

  try {
    const result = await runC15LiveLearningEvidence({
      handoffFile,
      artifactRoot: root,
      includeLive: true,
      confirmLiveHandoff: true,
      allowWrite: true,
      metricWindow: '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z',
      writerResultFile,
      now: new Date('2026-06-29T05:50:00.000Z'),
    });

    assert.equal(result.status, 'pass');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C15 argument parser accepts guarded write inputs', () => {
  const parsed = parseArgs([
    '--handoff-file',
    'project-testing/reports/handoff/handoff.json',
    '--artifact-root',
    'project-testing/reports/handoff',
    '--include-live',
    '--confirm-live-handoff',
    '--allow-write',
    '--metric-window',
    '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z',
    '--writer-result-file',
    'c15-writer-result.json',
  ]);

  assert.equal(parsed.includeLive, true);
  assert.equal(parsed.confirmLiveHandoff, true);
  assert.equal(parsed.allowWrite, true);
  assert.equal(parsed.metricWindow, '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z');
  assert.match(parsed.writerResultFile, /c15-writer-result\.json$/);
});

function c15Handoff() {
  return {
    schemaVersion: 'workbuddy-release-handoff-input/v1',
    unlockFlags: {
      includeLive: true,
      confirmLiveHandoff: true,
      includeDb: false,
      confirmDbReady: false,
    },
    gates: {
      'c15-live-learning-closeout': {
        live: {
          environmentOwner: 'operator://environment',
          writeApprovalRef: 'approval://write',
          artifactRoot: 'project-testing/reports/handoff-test',
        },
        targets: {
          companyId: 'company-1',
          projectId: 'project-1',
          candidateId: 'candidate-1',
          sampleCohortRef: 'db-sample://candidate-1',
        },
        approvals: {
          manualApprovalRef: 'approval://manual',
        },
        owners: {
          monitoringOwner: 'operator://monitoring',
          rollbackOwner: 'operator://rollback',
        },
      },
    },
  };
}
