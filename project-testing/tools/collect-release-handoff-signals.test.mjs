import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const collectorPath = path.join(repoRoot, 'project-testing/tools/collect-release-handoff-signals.mjs');

test('handoff signal collector discovers C15 candidates from the live canary candidate table', async () => {
  const collectorSource = await readFile(collectorPath, 'utf8');

  assert.match(collectorSource, /duration_context_policy_canary_candidates/);
  assert.doesNotMatch(collectorSource, /duration_context_policy_candidates/);
  assert.match(collectorSource, /duration-context-policy-canary-candidates/);
});

test('handoff signal collector normalizes sslmode=require for non-verifying Supabase pg discovery', async () => {
  const collectorSource = await readFile(collectorPath, 'utf8');

  assert.match(collectorSource, /function normalizePgConnectionStringForHandoff/u);
  assert.match(collectorSource, /sslmode', 'no-verify'/u);
  assert.doesNotMatch(collectorSource, /connectionString,\s*\n\s*ssl: \{ rejectUnauthorized: false \}/u);
});

test('handoff signal collector can hydrate targets from sanitized server-side discovery output', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-signals-'));
  try {
    const envFile = path.join(tempDir, 'server.production.env');
    const serverSignalsFile = path.join(tempDir, 'server-signals.json');
    const outputDir = path.join(tempDir, 'reports');

    await writeFile(envFile, [
      'SUPABASE_URL=https://example.supabase.co',
      'SUPABASE_ANON_KEY=anon-ref',
      'SUPABASE_SERVICE_KEY=service-ref',
      'SUPABASE_MIGRATION_URL=postgres://example.invalid/unreachable',
      'DB_CONNECTION_STRING=postgres://example.invalid/unreachable',
      'JWT_SECRET=jwt-ref',
      'WORKBUDDY_LIVE_BASE_URL=https://workbuddy.example.test',
      '',
    ].join('\n'), 'utf8');
    await writeFile(serverSignalsFile, JSON.stringify({
      schemaVersion: 'workbuddy-release-handoff-signals/v1',
      connectivity: {
        db: {
          ok: true,
          databaseTargetRef: 'env://deploy/env/server.production.env#SUPABASE_MIGRATION_URL',
          error: null,
        },
      },
      discoveredTargets: {
        companyId: 'company-prod-1',
        projectId: 'project-prod-1',
        planId: 'plan-prod-1',
        candidateId: 'candidate-prod-1',
        sampleCohortRef: 'db-sample://project/project-prod-1/duration-context-policy-canary-candidates',
      },
    }, null, 2), 'utf8');

    const result = spawnSync(process.execPath, [
      '--',
      collectorPath,
      '--env-file', envFile,
      '--output-dir', outputDir,
      '--server-signals-file', serverSignalsFile,
      '--include-live',
      '--confirm-live-handoff',
      '--include-db',
      '--confirm-db-ready',
      '--environment-owner', 'github-actions-production-closeout',
      '--write-approval-ref', 'github-actions://run/test',
      '--manual-approval-ref', 'github-actions://run/test',
      '--monitoring-owner', 'github-actions-production-closeout',
      '--rollback-owner', 'github-actions-production-closeout',
      '--cleanup-owner', 'github-actions-production-closeout',
      '--migration-owner', 'github-actions-production-closeout',
      '--runtime-publication-owner', 'github-actions-production-closeout',
      '--consumer-observation-owner', 'github-actions-production-closeout',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const signals = JSON.parse(await readFile(path.join(outputDir, 'handoff-signals.json'), 'utf8'));
    assert.deepEqual(signals.discoveredTargets, {
      companyId: 'company-prod-1',
      projectId: 'project-prod-1',
      planId: 'plan-prod-1',
      candidateId: 'candidate-prod-1',
      sampleCohortRef: 'db-sample://project/project-prod-1/duration-context-policy-canary-candidates',
    });
    assert.equal(signals.connectivity.db.ok, true);
    assert.equal(signals.connectivity.db.discoverySource, 'server-side-sanitized-signals');

    const candidate = JSON.parse(await readFile(path.join(outputDir, 'handoff-candidate.generated.json'), 'utf8'));
    assert.equal(candidate.gates['c18-l07-l15-live-diagnostics'].targets.projectId, 'project-prod-1');
    assert.equal(candidate.gates['c18-l07-l15-live-diagnostics'].targets.planId, 'plan-prod-1');
    assert.equal(candidate.gates['c15-live-learning-closeout'].targets.companyId, 'company-prod-1');
    assert.equal(candidate.gates['c15-live-learning-closeout'].targets.candidateId, 'candidate-prod-1');
    assert.equal(candidate.gates['c19-runtime-publication-release-rollback'].targets.projectId, 'project-prod-1');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('handoff signal collector can read env from process for server-side container discovery', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-process-env-'));
  try {
    const serverSignalsFile = path.join(tempDir, 'server-signals.json');
    const outputDir = path.join(tempDir, 'reports');

    await writeFile(serverSignalsFile, JSON.stringify({
      schemaVersion: 'workbuddy-release-handoff-signals/v1',
      connectivity: {
        db: {
          ok: true,
          databaseTargetRef: 'env://deploy/env/server.production.env#SUPABASE_MIGRATION_URL',
          error: null,
        },
      },
      discoveredTargets: {
        companyId: 'company-container-1',
        projectId: 'project-container-1',
        planId: 'plan-container-1',
        candidateId: 'candidate-container-1',
        sampleCohortRef: 'db-sample://project/project-container-1/duration-context-policy-canary-candidates',
      },
    }, null, 2), 'utf8');

    const result = spawnSync(process.execPath, [
      '--',
      collectorPath,
      '--env-source', 'process',
      '--env-file', 'deploy/env/server.production.env',
      '--output-dir', outputDir,
      '--server-signals-file', serverSignalsFile,
      '--include-live',
      '--confirm-live-handoff',
      '--include-db',
      '--confirm-db-ready',
      '--environment-owner', 'github-actions-production-closeout',
      '--write-approval-ref', 'github-actions://run/test',
      '--manual-approval-ref', 'github-actions://run/test',
      '--monitoring-owner', 'github-actions-production-closeout',
      '--rollback-owner', 'github-actions-production-closeout',
      '--cleanup-owner', 'github-actions-production-closeout',
      '--migration-owner', 'github-actions-production-closeout',
      '--runtime-publication-owner', 'github-actions-production-closeout',
      '--consumer-observation-owner', 'github-actions-production-closeout',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-ref',
        SUPABASE_SERVICE_KEY: 'service-ref',
        SUPABASE_MIGRATION_URL: 'postgres://example.invalid/unreachable',
        DB_CONNECTION_STRING: 'postgres://example.invalid/unreachable',
        JWT_SECRET: 'jwt-ref',
        WORKBUDDY_LIVE_BASE_URL: 'https://workbuddy.example.test',
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const signals = JSON.parse(await readFile(path.join(outputDir, 'handoff-signals.json'), 'utf8'));
    assert.equal(signals.envPresence.SUPABASE_MIGRATION_URL, true);
    assert.equal(signals.connectivity.db.discoverySource, 'server-side-sanitized-signals');
    const candidate = JSON.parse(await readFile(path.join(outputDir, 'handoff-candidate.generated.json'), 'utf8'));
    assert.equal(candidate.gates['c18-l07-l15-live-diagnostics'].live.baseUrl, 'https://workbuddy.example.test');
    assert.equal(candidate.gates['c15-live-learning-closeout'].targets.companyId, 'company-container-1');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('handoff signal collector labels server-side SSH discovery when requested', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-discovery-source-'));
  try {
    const outputDir = path.join(tempDir, 'reports');

    const result = spawnSync(process.execPath, [
      '--',
      collectorPath,
      '--env-source', 'process',
      '--env-file', 'deploy/env/server.production.env',
      '--output-dir', outputDir,
      '--discovery-source', 'server-side-ssh-discovery',
      '--include-live',
      '--confirm-live-handoff',
      '--include-db',
      '--confirm-db-ready',
      '--environment-owner', 'github-actions-production-closeout',
      '--write-approval-ref', 'github-actions://run/test',
      '--manual-approval-ref', 'github-actions://run/test',
      '--monitoring-owner', 'github-actions-production-closeout',
      '--rollback-owner', 'github-actions-production-closeout',
      '--cleanup-owner', 'github-actions-production-closeout',
      '--migration-owner', 'github-actions-production-closeout',
      '--runtime-publication-owner', 'github-actions-production-closeout',
      '--consumer-observation-owner', 'github-actions-production-closeout',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-ref',
        SUPABASE_SERVICE_KEY: 'service-ref',
        JWT_SECRET: 'jwt-ref',
        DB_CONNECTION_STRING: '',
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const signals = JSON.parse(await readFile(path.join(outputDir, 'handoff-signals.json'), 'utf8'));
    assert.equal(signals.connectivity.db.ok, false);
    assert.equal(signals.connectivity.db.discoverySource, 'server-side-ssh-discovery');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
