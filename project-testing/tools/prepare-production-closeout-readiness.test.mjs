import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  parseArgs,
  prepareProductionCloseoutReadiness,
} from './prepare-production-closeout-readiness.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('production readiness can select only candidate-backed gates and leave C15 unselected when no candidate exists', async () => {
  const root = await mkdtemp(path.join(repoRoot, 'project-testing', 'tmp-production-readiness-selection-'));
  const outputRoot = path.join(root, 'reports');
  const envFile = path.join(root, 'server.production.env');

  try {
    await writeFile(envFile, [
      'SUPABASE_URL=https://workbuddy-prod.supabase.co',
      'SUPABASE_ANON_KEY=anon-key-set',
      'SUPABASE_SERVICE_KEY=service-key-set',
      'SUPABASE_MIGRATION_URL=postgres://prod-db-host/workbuddy',
      'DB_CONNECTION_STRING=postgres://prod-db-host/workbuddy',
      'JWT_SECRET=jwt-secret-set',
      '',
    ].join('\n'), 'utf8');

    const result = await prepareProductionCloseoutReadiness({
      envFile,
      outputRoot,
      baseUrl: 'https://project-management-dashboard-hazel-nine.vercel.app',
      companyId: 'company-prod-1',
      projectId: 'project-prod-1',
      planId: 'plan-prod-1',
      candidateId: '',
      sampleCohortRef: 'db-sample://project/project-prod-1/duration-context-policy-canary-candidates',
      approvalRef: 'github-actions://run/test',
      monitoringWindow: '2026-07-01T00:00:00Z/PT30M',
      gateIds: [
        'c18-l07-l15-live-diagnostics',
        'c19-runtime-publication-release-rollback',
        'old-object-physical-drop-closeout',
      ],
    });

    assert.equal(result.readiness.status, 'pass');
    assert.equal(result.readiness.readyToRun, true);
    assert.equal(result.readiness.gateCount, 3);
    assert.deepEqual(result.readiness.gates.map((gate) => gate.id), [
      'c18-l07-l15-live-diagnostics',
      'c19-runtime-publication-release-rollback',
      'old-object-physical-drop-closeout',
    ]);

    const handoff = JSON.parse(await readFile(result.handoffPath, 'utf8'));
    assert.deepEqual(handoff.gateSelection.selectedGateIds, [
      'c18-l07-l15-live-diagnostics',
      'c19-runtime-publication-release-rollback',
      'old-object-physical-drop-closeout',
    ]);
    assert.deepEqual(handoff.gateSelection.notSelectedGateIds, ['c15-live-learning-closeout']);

    const summary = JSON.parse(await readFile(path.join(outputRoot, 'production-closeout-readiness-summary.json'), 'utf8'));
    assert.equal(summary.readyToRun, true);
    assert.deepEqual(summary.notSelectedGateIds, ['c15-live-learning-closeout']);

    const parsed = parseArgs([
      '--output-root',
      outputRoot,
      '--gate',
      'c18-l07-l15-live-diagnostics',
      '--gate',
      'c19-runtime-publication-release-rollback',
    ]);
    assert.deepEqual(parsed.gateIds, [
      'c18-l07-l15-live-diagnostics',
      'c19-runtime-publication-release-rollback',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('production readiness can consume server-side sanitized signals without copying production env to the runner', async () => {
  const root = await mkdtemp(path.join(repoRoot, 'project-testing', 'tmp-production-readiness-server-signals-'));
  const outputRoot = path.join(root, 'reports');
  const serverSignalsFile = path.join(root, 'server-handoff-signals.json');

  try {
    await writeFile(serverSignalsFile, JSON.stringify({
      schemaVersion: 'workbuddy-release-handoff-signals/v1',
      envPresence: {
        SUPABASE_URL: true,
        SUPABASE_ANON_KEY: true,
        SUPABASE_SERVICE_KEY: true,
        SUPABASE_MIGRATION_URL: true,
        DB_CONNECTION_STRING: true,
        JWT_SECRET: true,
      },
      connectivity: {
        db: {
          ok: true,
          databaseTargetRef: 'env://deploy/env/server.production.env#SUPABASE_MIGRATION_URL',
          discoverySource: 'server-side-sanitized-signals',
        },
      },
      discoveredTargets: {
        companyId: 'company-prod-1',
        projectId: 'project-prod-1',
        planId: 'plan-prod-1',
        candidateId: '',
        sampleCohortRef: 'db-sample://project/project-prod-1/duration-context-policy-canary-candidates',
      },
      boundary: {
        noSecretValuesWritten: true,
        liveMutation: false,
        dbMutation: false,
      },
    }, null, 2), 'utf8');

    const result = await prepareProductionCloseoutReadiness({
      envFile: 'deploy/env/server.production.env',
      serverSignalsFile,
      outputRoot,
      baseUrl: 'https://project-management-dashboard-hazel-nine.vercel.app',
      companyId: 'company-prod-1',
      projectId: 'project-prod-1',
      planId: 'plan-prod-1',
      candidateId: '',
      sampleCohortRef: 'db-sample://project/project-prod-1/duration-context-policy-canary-candidates',
      approvalRef: 'github-actions://run/test',
      monitoringWindow: '2026-07-01T00:00:00Z/PT30M',
      gateIds: [
        'c18-l07-l15-live-diagnostics',
        'c19-runtime-publication-release-rollback',
        'old-object-physical-drop-closeout',
      ],
    });

    assert.equal(result.readiness.status, 'pass');
    assert.equal(result.readiness.refIssueCount, 0);

    const handoff = JSON.parse(await readFile(result.handoffPath, 'utf8'));
    assert.equal(handoff.boundary.serverSideDiscovery, true);
    assert.equal(handoff.boundary.envFileUploaded, false);
    assert.equal(handoff.envPresence.source, 'server-side-sanitized-signals');

    const envInventory = JSON.parse(await readFile(path.join(outputRoot, 'env-key-readiness.json'), 'utf8'));
    assert.deepEqual(envInventory.missingRequiredKeys, []);
    assert.equal(envInventory.boundary.valuesIncluded, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
