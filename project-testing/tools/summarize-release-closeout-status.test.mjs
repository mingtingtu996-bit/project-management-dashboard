import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parseArgs,
  summarizeReleaseCloseoutStatus,
  writeStatusIndex,
} from './summarize-release-closeout-status.mjs';

test('status index reports missing handoff pack when no reports exist', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-status-empty-'));

  try {
    const index = await summarizeReleaseCloseoutStatus({
      reportRoot,
      now: new Date('2026-06-29T03:40:00+08:00'),
    });

    assert.equal(index.overallStatus, 'missing-handoff-pack');
    assert.equal(index.mayRunLiveOrDb, false);
    assert.equal(index.mayCloseAll, false);
    assert.equal(index.stages.handoffPack.status, 'missing');
    assert.ok(index.nextActions.some((action) => action.includes('generate-release-handoff-pack')));
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});

test('status index summarizes a generated handoff with failing readiness and open closeout decision', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-status-open-'));

  try {
    await writeJson(path.join(reportRoot, 'handoff-20260629-034100', 'handoff-plan.json'), {
      schemaVersion: 'workbuddy-release-handoff-pack/v1',
      gates: [
        { id: 'c18-l07-l15-live-diagnostics' },
        { id: 'old-object-physical-drop-closeout' },
      ],
    });
    await writeJson(path.join(reportRoot, 'handoff-readiness.json'), {
      schemaVersion: 'workbuddy-release-handoff-readiness/v1',
      status: 'fail',
      readyToRun: false,
      blockedGateCount: 2,
      secretLeakCount: 0,
      gates: [
        {
          id: 'c18-l07-l15-live-diagnostics',
          readyToRun: false,
          missingFlags: ['--include-live'],
          missingFields: ['live.authTokenRef'],
        },
        {
          id: 'old-object-physical-drop-closeout',
          readyToRun: false,
          missingFlags: ['--include-db'],
          missingFields: ['db.databaseTargetRef'],
        },
      ],
    });
    await writeJson(path.join(reportRoot, 'release-20260629-034100', 'closeout-decision.json'), {
      schemaVersion: 'workbuddy-release-closeout-decision/v1',
      status: 'fail',
      mayCloseAll: false,
      openGateCount: 2,
      decision: {
        openGateIds: [
          'c18-l07-l15-live-diagnostics',
          'old-object-physical-drop-closeout',
        ],
      },
    });

    const index = await summarizeReleaseCloseoutStatus({
      reportRoot,
      now: new Date('2026-06-29T03:41:00+08:00'),
    });

    assert.equal(index.overallStatus, 'handoff-not-ready');
    assert.equal(index.mayRunLiveOrDb, false);
    assert.equal(index.mayCloseAll, false);
    assert.deepEqual(index.openGateIds, [
      'c18-l07-l15-live-diagnostics',
      'old-object-physical-drop-closeout',
    ]);
    assert.ok(index.nextActions.some((action) => action.includes('missing flag')));
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});

test('status index selects the most recently evaluated closeout decision across report folders', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-status-latest-decision-'));

  try {
    await writeJson(path.join(reportRoot, 'handoff-20260629-034150', 'handoff-plan.json'), {
      schemaVersion: 'workbuddy-release-handoff-pack/v1',
      gates: [
        { id: 'c18-l07-l15-live-diagnostics' },
        { id: 'c15-live-learning-closeout' },
      ],
    });
    await writeJson(path.join(reportRoot, 'handoff-20260629-034150', 'handoff-readiness.json'), {
      schemaVersion: 'workbuddy-release-handoff-readiness/v1',
      status: 'fail',
      readyToRun: false,
      blockedGateCount: 1,
      secretLeakCount: 0,
      gates: [
        {
          id: 'c18-l07-l15-live-diagnostics',
          readyToRun: true,
          missingFlags: [],
          missingFields: [],
        },
        {
          id: 'c15-live-learning-closeout',
          readyToRun: false,
          missingFlags: [],
          missingFields: ['targets.candidateId'],
        },
      ],
    });
    await writeJson(path.join(reportRoot, 'release-20260629-034100', 'closeout-decision.json'), {
      schemaVersion: 'workbuddy-release-closeout-decision/v1',
      evaluatedAt: '2026-06-29T03:41:00.000Z',
      status: 'fail',
      mayCloseAll: false,
      openGateCount: 2,
      decision: {
        openGateIds: [
          'c18-l07-l15-live-diagnostics',
          'c15-live-learning-closeout',
        ],
      },
    });
    await writeJson(path.join(reportRoot, 'handoff-20260629-034150', 'closeout-decision.json'), {
      schemaVersion: 'workbuddy-release-closeout-decision/v1',
      evaluatedAt: '2026-06-29T03:42:00.000Z',
      status: 'fail',
      mayCloseAll: false,
      openGateCount: 1,
      decision: {
        openGateIds: [
          'c15-live-learning-closeout',
        ],
      },
    });

    const index = await summarizeReleaseCloseoutStatus({
      reportRoot,
      now: new Date('2026-06-29T03:42:30+08:00'),
    });

    assert.deepEqual(index.openGateIds, ['c15-live-learning-closeout']);
    assert.equal(index.inputs.closeoutDecision.path, path.join(reportRoot, 'handoff-20260629-034150', 'closeout-decision.json'));
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});

test('status index prefers the latest closeout readiness artifact over older generic readiness files', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-status-closeout-readiness-'));

  try {
    await writeJson(path.join(reportRoot, 'handoff-20260629-034150', 'handoff-readiness.json'), {
      schemaVersion: 'workbuddy-release-handoff-readiness/v1',
      generatedAt: '2026-06-29T03:41:00.000Z',
      status: 'fail',
      readyToRun: false,
      blockedGateCount: 1,
      secretLeakCount: 0,
      gates: [
        {
          id: 'c15-live-learning-closeout',
          readyToRun: false,
          missingFlags: [],
          missingFields: ['targets.candidateId'],
        },
      ],
    });
    await writeJson(path.join(reportRoot, 'handoff-20260629-034300', 'handoff-plan.json'), {
      schemaVersion: 'workbuddy-release-handoff-pack/v1',
      gates: [{ id: 'c15-live-learning-closeout' }],
    });
    await writeJson(path.join(reportRoot, 'handoff-20260629-034300', 'handoff-readiness.closeout.json'), {
      schemaVersion: 'workbuddy-release-handoff-readiness/v1',
      generatedAt: '2026-06-29T03:43:00.000Z',
      status: 'pass',
      readyToRun: true,
      blockedGateCount: 0,
      secretLeakCount: 0,
      gates: [],
    });
    await writeJson(path.join(reportRoot, 'handoff-20260629-034300', 'closeout-decision.json'), {
      schemaVersion: 'workbuddy-release-closeout-decision/v1',
      evaluatedAt: '2026-06-29T03:43:30.000Z',
      status: 'fail',
      mayCloseAll: false,
      openGateCount: 1,
      decision: {
        openGateIds: ['c15-live-learning-closeout'],
      },
    });

    const index = await summarizeReleaseCloseoutStatus({
      reportRoot,
      now: new Date('2026-06-29T03:44:00+08:00'),
    });

    assert.equal(index.stages.handoffReadiness.status, 'pass');
    assert.equal(index.mayRunLiveOrDb, true);
    assert.match(index.inputs.handoffReadiness.path, /handoff-readiness\.closeout\.json$/);
    assert.deepEqual(index.openGateIds, ['c15-live-learning-closeout']);
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});

test('status index reports ready-for-live-db-execution when handoff readiness passes but closeout artifacts are absent', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-status-ready-'));

  try {
    await writeJson(path.join(reportRoot, 'handoff-20260629-034200', 'handoff-plan.json'), {
      schemaVersion: 'workbuddy-release-handoff-pack/v1',
      gates: [{ id: 'c18-l07-l15-live-diagnostics' }],
    });
    await writeJson(path.join(reportRoot, 'handoff-readiness.json'), {
      schemaVersion: 'workbuddy-release-handoff-readiness/v1',
      status: 'pass',
      readyToRun: true,
      blockedGateCount: 0,
      secretLeakCount: 0,
      gates: [],
    });

    const index = await summarizeReleaseCloseoutStatus({
      reportRoot,
      now: new Date('2026-06-29T03:42:00+08:00'),
    });

    assert.equal(index.overallStatus, 'ready-for-live-db-execution');
    assert.equal(index.mayRunLiveOrDb, true);
    assert.equal(index.mayCloseAll, false);
    assert.ok(index.nextActions.some((action) => action.includes('Run authorized live/db commands')));
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});

test('status index does not close when selected handoff readiness fails even if archived closeout passed', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-status-cross-env-'));

  try {
    const handoffReadinessPath = path.join(reportRoot, 'production-goal', 'handoff-readiness.json');
    await writeJson(path.join(reportRoot, 'handoff-20260630-210059', 'handoff-plan.json'), {
      schemaVersion: 'workbuddy-release-handoff-pack/v1',
      gates: [
        { id: 'c18-l07-l15-live-diagnostics' },
        { id: 'old-object-physical-drop-closeout' },
      ],
    });
    await writeJson(handoffReadinessPath, {
      schemaVersion: 'workbuddy-release-handoff-readiness/v1',
      status: 'fail',
      readyToRun: false,
      blockedGateCount: 2,
      secretLeakCount: 0,
      gates: [
        {
          id: 'c18-l07-l15-live-diagnostics',
          readyToRun: false,
          missingFlags: [],
          missingFields: [],
          blockingIssues: [
            {
              code: 'env-ref-missing',
              detail: 'gates.c18-l07-l15-live-diagnostics.live.authTokenRef: env file is empty: deploy/env/server.production.env',
            },
          ],
        },
        {
          id: 'old-object-physical-drop-closeout',
          readyToRun: false,
          missingFlags: [],
          missingFields: [],
          blockingIssues: [
            {
              code: 'env-ref-missing',
              detail: 'gates.old-object-physical-drop-closeout.db.databaseTargetRef: env file is empty: deploy/env/server.production.env',
            },
          ],
        },
      ],
    });
    await writeJson(path.join(reportRoot, 'release-20260630-live-closeout-staging', 'closeout-decision.json'), {
      schemaVersion: 'workbuddy-release-closeout-decision/v1',
      status: 'pass',
      mayCloseAll: true,
      openGateCount: 0,
      gates: [],
      decision: {
        openGateIds: [],
      },
    });

    const index = await summarizeReleaseCloseoutStatus({
      reportRoot,
      handoffReadinessPath,
      now: new Date('2026-06-30T21:15:00+08:00'),
    });

    assert.equal(index.overallStatus, 'handoff-not-ready');
    assert.equal(index.mayRunLiveOrDb, false);
    assert.equal(index.mayCloseAll, false);
    assert.deepEqual(index.openGateIds, [
      'c18-l07-l15-live-diagnostics',
      'old-object-physical-drop-closeout',
    ]);
    assert.equal(index.consistencyIssues.length, 1);
    assert.equal(index.consistencyIssues[0].code, 'closeout-decision-ignored-while-handoff-not-ready');
    assert.ok(index.nextActions.some((action) => action.includes('env file is empty: deploy/env/server.production.env')));
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});

test('status index reports closeout-ready when final decision passes and writes markdown', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-status-pass-'));

  try {
    await writeJson(path.join(reportRoot, 'handoff-20260629-034300', 'handoff-plan.json'), {
      schemaVersion: 'workbuddy-release-handoff-pack/v1',
      gates: [{ id: 'c18-l07-l15-live-diagnostics' }],
    });
    await writeJson(path.join(reportRoot, 'handoff-readiness.json'), {
      schemaVersion: 'workbuddy-release-handoff-readiness/v1',
      status: 'pass',
      readyToRun: true,
      blockedGateCount: 0,
      secretLeakCount: 0,
      gates: [],
    });
    await writeJson(path.join(reportRoot, 'release-20260629-034300', 'closeout-decision.json'), {
      schemaVersion: 'workbuddy-release-closeout-decision/v1',
      status: 'pass',
      mayCloseAll: true,
      openGateCount: 0,
      gates: [
        {
          id: 'c15-live-learning-closeout',
          tier: 'live_only',
          validationStatus: 'pass',
          mayClose: true,
          closeoutMode: 'standard',
          mutationSummary: {
            hasLiveMutationEvidence: true,
            hasDbMutationEvidence: true,
            physicalDropExecuted: false,
          },
        },
        {
          id: 'c19-runtime-publication-release-rollback',
          tier: 'live_only',
          validationStatus: 'pass',
          mayClose: true,
          closeoutMode: 'standard',
          mutationSummary: {
            hasLiveMutationEvidence: true,
            hasDbMutationEvidence: true,
            physicalDropExecuted: false,
          },
        },
        {
          id: 'old-object-physical-drop-closeout',
          tier: 'db_dependent',
          validationStatus: 'pass',
          mayClose: true,
          closeoutMode: 'no_safe_candidate',
          mutationSummary: {
            hasLiveMutationEvidence: false,
            hasDbMutationEvidence: false,
            physicalDropExecuted: false,
          },
          alternateCloseout: {
            mode: 'no_safe_candidate',
            artifact: 'old-object-no-safe-candidate-closeout.json',
            physicalDropExecuted: false,
          },
        },
      ],
      decision: {
        openGateIds: [],
      },
    });

    const index = await summarizeReleaseCloseoutStatus({
      reportRoot,
      now: new Date('2026-06-29T03:43:00+08:00'),
    });
    const outputs = await writeStatusIndex({
      index,
      outputPath: path.join(reportRoot, 'closeout-status-index.json'),
    });
    const saved = JSON.parse(await readFile(outputs.jsonPath, 'utf8'));
    const markdown = await readFile(outputs.markdownPath, 'utf8');

    assert.equal(index.overallStatus, 'closeout-ready');
    assert.equal(index.boundary.indexOnly, true);
    assert.equal(index.boundary.liveMutation, undefined);
    assert.equal(index.boundary.dbMutation, undefined);
    assert.deepEqual(index.evidenceSummary.liveMutationEvidenceGateIds, [
      'c15-live-learning-closeout',
      'c19-runtime-publication-release-rollback',
    ]);
    assert.deepEqual(index.evidenceSummary.noSafeCandidateGateIds, ['old-object-physical-drop-closeout']);
    assert.deepEqual(index.evidenceSummary.physicalDropExecutedGateIds, []);
    assert.equal(saved.mayCloseAll, true);
    assert.equal(saved.evidenceSummary.gates.find((gate) => gate.id === 'old-object-physical-drop-closeout').physicalDropExecuted, false);
    assert.match(markdown, /Overall status: closeout-ready/);
    assert.match(markdown, /Index commands executed: 0/);
    assert.match(markdown, /Evidence live mutation gates: c15-live-learning-closeout, c19-runtime-publication-release-rollback/);
    assert.match(markdown, /Physical DROP executed gates: none/);
    assert.match(markdown, /No-safe-candidate gates: old-object-physical-drop-closeout/);
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});

test('argument parser accepts explicit report paths', () => {
  const parsed = parseArgs([
    '--report-root',
    'project-testing/reports',
    '--handoff-pack',
    'project-testing/reports/handoff/handoff-plan.json',
    '--handoff-readiness',
    'project-testing/reports/handoff-readiness.json',
    '--closeout-decision',
    'project-testing/reports/closeout-decision.json',
  ]);

  assert.match(parsed.reportRoot, /project-testing[\\/]+reports$/);
  assert.match(parsed.handoffPackPath, /handoff-plan\.json$/);
  assert.match(parsed.handoffReadinessPath, /handoff-readiness\.json$/);
  assert.match(parsed.closeoutDecisionPath, /closeout-decision\.json$/);
});

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
