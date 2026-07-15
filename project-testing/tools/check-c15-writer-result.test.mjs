import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkC15WriterResult,
  parseArgs,
} from './check-c15-writer-result.mjs';

test('C15 writer result check passes for complete controlled readback evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c15-writer-pass-'));
  const handoffFile = path.join(root, 'handoff.json');
  const writerResultFile = path.join(root, 'writer-result.json');
  await writeJson(handoffFile, c15Handoff());
  await writeJson(writerResultFile, writerResult());

  try {
    const report = await checkC15WriterResult({
      handoffFile,
      writerResultFile,
      metricWindow: '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z',
      now: new Date('2026-06-29T06:20:00.000Z'),
    });

    assert.equal(report.status, 'pass');
    assert.equal(report.counts.failures, 0);
    assert.equal(report.checks.tenantIsolationReadback, true);
    assert.equal(report.boundary.liveMutation, false);
    assert.equal(report.boundary.dbMutation, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C15 writer result check fails for missing handoff refs and weak evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c15-writer-fail-'));
  const handoffFile = path.join(root, 'handoff.json');
  const writerResultFile = path.join(root, 'writer-result.json');
  const handoff = c15Handoff();
  handoff.gates['c15-live-learning-closeout'].targets.candidateId = '';
  const weak = writerResult();
  weak.status = 'blocked';
  weak.rewardMaeQualityReadback = null;
  weak.tenantIsolationReadback = { status: 'pass', crossTenantRows: 2 };
  await writeJson(handoffFile, handoff);
  await writeJson(writerResultFile, weak);

  try {
    const report = await checkC15WriterResult({
      handoffFile,
      writerResultFile,
      metricWindow: '',
    });

    assert.equal(report.status, 'fail');
    assert.ok(report.failures.some((failure) => failure.field === 'targets.candidateId'));
    assert.ok(report.failures.some((failure) => failure.field === 'metricWindow'));
    assert.ok(report.failures.some((failure) => failure.field === 'writerResult.status'));
    assert.ok(report.failures.some((failure) => failure.field === 'writerResult.rewardMaeQualityReadback'));
    assert.ok(report.failures.some((failure) => failure.field === 'writerResult.tenantIsolationReadback.crossTenantRows'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C15 writer result check fails for flat reward MAE readback', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c15-writer-flat-mae-'));
  const handoffFile = path.join(root, 'handoff.json');
  const writerResultFile = path.join(root, 'writer-result.json');
  const flat = writerResult();
  flat.rewardMaeQualityReadback = {
    status: 'pass',
    maeBefore: 0.126,
    maeAfter: 0.126,
    evaluatedDecisionCount: 4,
  };
  await writeJson(handoffFile, c15Handoff());
  await writeJson(writerResultFile, flat);

  try {
    const report = await checkC15WriterResult({
      handoffFile,
      writerResultFile,
      metricWindow: '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z',
    });

    assert.equal(report.status, 'fail');
    assert.ok(report.failures.some((failure) =>
      failure.field === 'writerResult.rewardMaeQualityReadback.maeImprovement'
    ));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C15 writer result check warns that manual-assisted evidence is supporting only', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c15-writer-warning-'));
  const handoffFile = path.join(root, 'handoff.json');
  const writerResultFile = path.join(root, 'writer-result.json');
  const result = writerResult();
  result.manualAssistedEvidenceRefs = ['yingdao://operator-replay'];
  await writeJson(handoffFile, c15Handoff());
  await writeJson(writerResultFile, result);

  try {
    const report = await checkC15WriterResult({
      handoffFile,
      writerResultFile,
      metricWindow: '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z',
    });

    assert.equal(report.status, 'pass');
    assert.equal(report.counts.warnings, 1);
    assert.match(report.warnings[0].message, /supporting only/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C15 writer result argument parser accepts required paths', () => {
  const parsed = parseArgs([
    '--handoff-file',
    'handoff.json',
    '--writer-result-file',
    'c15-writer-result.json',
    '--metric-window',
    '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z',
    '--output',
    'check.json',
  ]);

  assert.match(parsed.handoffFile, /handoff\.json$/);
  assert.match(parsed.writerResultFile, /c15-writer-result\.json$/);
  assert.equal(parsed.metricWindow, '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z');
  assert.match(parsed.output, /check\.json$/);
});

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function c15Handoff() {
  return {
    schemaVersion: 'workbuddy-release-handoff-input/v1',
    gates: {
      'c15-live-learning-closeout': {
        live: {
          environmentOwner: 'operator://environment',
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
          rollbackOwner: 'operator://rollback',
        },
      },
    },
  };
}

function writerResult() {
  return {
    status: 'pass',
    sampleCohortReadback: { status: 'pass', sampleCount: 42 },
    rewardMaeQualityReadback: { status: 'pass', maeBefore: 4.8, maeAfter: 3.2, evaluatedDecisionCount: 12 },
    pendingPredictionClosure: { status: 'pass', pendingPredictionCount: 0 },
    policyVersionUniqueness: { status: 'pass', duplicateVersionCount: 0 },
    tenantIsolationReadback: { status: 'pass', crossTenantRows: 0 },
    canaryApprovalMonitoring: { status: 'pass', monitoringWindow: '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z' },
    rollbackOrSupersede: { status: 'pass', rollbackRef: 'operator://rollback' },
  };
}
