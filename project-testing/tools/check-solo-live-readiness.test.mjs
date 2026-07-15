import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { checkSoloLiveReadiness } from './check-solo-live-readiness.mjs';

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('solo-live readiness classifies local staging real-test environment separately from solo live', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'workbuddy-solo-live-readiness-'));

  try {
    const handoffFile = join(tempDir, 'handoff.json');
    const outputPath = join(tempDir, 'report.json');
    await writeJson(handoffFile, {
      target: {
        environment: 'staging',
        baseUrl: 'http://127.0.0.1:5174',
        supabaseProjectRef: 'xemqmqpifsstkovbkatp',
      },
      owner: {
        operator: 'user:jjj64',
      },
      evidence: {
        apiHealthRef: 'project-testing/reports/current/api-health.json',
      },
      claims: {
        productionReady: false,
      },
    });

    const report = await checkSoloLiveReadiness({ handoffFile, outputPath });

    assert.equal(report.status, 'staging_real_test_ready');
    assert.equal(report.realTestEnvironmentReady, true);
    assert.equal(report.soloLiveReady, false);
    assert.equal(report.productionReady, false);
    assert.ok(report.soloLiveBlockers.includes('solo_live_base_url_must_not_be_localhost'));
    assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')).status, 'staging_real_test_ready');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('solo-live readiness passes only with non-local URL and personal operation refs', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'workbuddy-solo-live-readiness-'));

  try {
    const handoffFile = join(tempDir, 'handoff.json');
    await writeJson(handoffFile, {
      target: {
        environment: 'solo-live',
        baseUrl: 'https://workbuddy-staging.example.com',
        supabaseProjectRef: 'xemqmqpifsstkovbkatp',
        deploymentRef: 'git:abcdef1',
      },
      approvals: {
        selfApprovalRef: 'project-testing/reports/solo-live/self-approval.md',
      },
      owner: {
        operator: 'user:jjj64',
        rollbackOwner: 'user:jjj64',
        monitoringOwner: 'user:jjj64',
      },
      plans: {
        rollbackPlanRef: 'project-testing/reports/solo-live/rollback-plan.md',
        monitoringPlanRef: 'project-testing/reports/solo-live/monitoring-plan.md',
      },
      evidence: {
        apiHealthRef: 'project-testing/reports/solo-live/api-health.json',
        apiReadSmokeRef: 'project-testing/reports/solo-live/api-read-smoke.json',
        uiSmokeRef: 'project-testing/reports/solo-live/ui-smoke.json',
      },
      claims: {
        productionReady: false,
      },
    });

    const report = await checkSoloLiveReadiness({ handoffFile, outputPath: null });

    assert.equal(report.status, 'solo_live_ready');
    assert.equal(report.realTestEnvironmentReady, true);
    assert.equal(report.soloLiveReady, true);
    assert.equal(report.productionReady, false);
    assert.deepEqual(report.blockers, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('solo-live readiness rejects inline secrets in handoff files', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'workbuddy-solo-live-readiness-'));

  try {
    const handoffFile = join(tempDir, 'handoff.json');
    await writeJson(handoffFile, {
      target: {
        environment: 'staging',
        baseUrl: 'http://127.0.0.1:5174',
        supabaseProjectRef: 'xemqmqpifsstkovbkatp',
      },
      owner: {
        operator: 'user:jjj64',
      },
      evidence: {
        apiHealthRef: 'project-testing/reports/current/api-health.json',
      },
      secrets: {
        databaseUrl: 'postgresql://postgres:password@example.supabase.co:5432/postgres',
      },
    });

    const report = await checkSoloLiveReadiness({ handoffFile, outputPath: null });

    assert.equal(report.status, 'blocked');
    assert.equal(report.secretLeakCount, 1);
    assert.ok(report.realTestBlockers.some((blocker) => blocker.includes('inline_secret_not_allowed')));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
