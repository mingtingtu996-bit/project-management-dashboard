import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildCandidateDiscovery,
  buildCandidateDiscoveryBlockers,
  normalizePgConnectionStringForHandoff,
} from './collect-release-handoff-signals.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const collectorPath = path.join(repoRoot, 'project-testing/tools/collect-release-handoff-signals.mjs');
const canaryDiagnosticPath = path.join(repoRoot, 'server/src/scripts/diagnose-duration-canary-approval-live.ts');

test('handoff signal collector discovers C15 candidates from the live canary candidate table', async () => {
  const [collectorSource, diagnosticSource] = await Promise.all([
    readFile(collectorPath, 'utf8'),
    readFile(canaryDiagnosticPath, 'utf8'),
  ]);

  assert.match(diagnosticSource, /duration_context_policy_canary_candidates/);
  assert.match(collectorSource, /duration_context_policy_canary_candidates/);
  assert.doesNotMatch(collectorSource, /duration_context_policy_candidates/);
  assert.match(collectorSource, /duration-context-policy-canary-candidates/);
  assert.match(collectorSource, /eligible_canary_candidate_project/);
  assert.match(collectorSource, /selectProjectTargetById/);
});

function createCandidateClient(rows) {
  const columns = [
    'id',
    'project_id',
    'company_id',
    'candidate_status',
    'updated_at',
    'created_at',
  ].map((column_name) => ({ column_name }));

  const matches = (row, sql, params) => {
    if (/project_id = \$1/.test(sql) && row.project_id !== params[0]) return false;
    if (/company_id = \$1/.test(sql) && row.company_id !== params[0]) return false;
    if (/project_id = \$1/.test(sql) && /company_id = \$2/.test(sql) && row.company_id !== params[1]) return false;
    if (/candidate_status in/i.test(sql)) {
      const statuses = params.filter((value) => ['candidate', 'approved_for_canary'].includes(value));
      if (!statuses.includes(row.candidate_status)) return false;
    }
    return true;
  };

  const sortRows = (items) => [...items].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));

  return {
    async query(sql, params = []) {
      if (/information_schema\.columns/.test(sql)) {
        return { rows: columns };
      }
      if (/select count\(\*\)::int as count/i.test(sql)) {
        return { rows: [{ count: rows.filter((row) => matches(row, sql, params)).length }] };
      }
      if (/from public\."duration_context_policy_canary_candidates"/.test(sql)) {
        return { rows: sortRows(rows.filter((row) => matches(row, sql, params))).slice(0, 1) };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

test('candidate discovery selects an eligible candidate matching the selected project and company', async () => {
  const rows = [
    {
      id: 'candidate-other',
      project_id: 'project-other',
      company_id: 'company-1',
      candidate_status: 'candidate',
      updated_at: '2026-07-03T00:00:00.000Z',
      created_at: '2026-07-03T00:00:00.000Z',
    },
    {
      id: 'candidate-selected',
      project_id: 'project-1',
      company_id: 'company-1',
      candidate_status: 'approved_for_canary',
      updated_at: '2026-07-04T00:00:00.000Z',
      created_at: '2026-07-04T00:00:00.000Z',
    },
  ];

  const discovery = await buildCandidateDiscovery(createCandidateClient(rows), {
    columns: [
      { column_name: 'id' },
      { column_name: 'project_id' },
      { column_name: 'company_id' },
      { column_name: 'candidate_status' },
      { column_name: 'updated_at' },
      { column_name: 'created_at' },
    ],
    tableCount: { exists: true, count: rows.length },
    projectId: 'project-1',
    companyId: 'company-1',
  });

  assert.equal(discovery.ready, true);
  assert.equal(discovery.selectedCandidateId, 'candidate-selected');
  assert.equal(discovery.selectedBy, 'project_company_status');
  assert.deepEqual(discovery.blockers, []);
  assert.equal(discovery.counts.selectedProjectCompanyEligibleStatus, 1);
});

test('candidate discovery explains why a populated candidate table did not produce a handoff candidateId', async () => {
  const rows = [
    {
      id: 'candidate-other-project',
      project_id: 'project-other',
      company_id: 'company-1',
      candidate_status: 'candidate',
      updated_at: '2026-07-04T00:00:00.000Z',
      created_at: '2026-07-04T00:00:00.000Z',
    },
  ];

  const discovery = await buildCandidateDiscovery(createCandidateClient(rows), {
    columns: [
      { column_name: 'id' },
      { column_name: 'project_id' },
      { column_name: 'company_id' },
      { column_name: 'candidate_status' },
      { column_name: 'updated_at' },
      { column_name: 'created_at' },
    ],
    tableCount: { exists: true, count: rows.length },
    projectId: 'project-1',
    companyId: 'company-1',
  });

  assert.equal(discovery.ready, false);
  assert.equal(discovery.selectedCandidateId, '');
  assert.equal(discovery.counts.total, 1);
  assert.equal(discovery.counts.selectedProject, 0);
  assert.equal(discovery.counts.selectedCompany, 1);
  assert.equal(discovery.counts.eligibleStatus, 1);
  assert.equal(discovery.latest.any.id, 'candidate-other-project');
  assert.deepEqual(
    discovery.blockers,
    [
      'canary_candidate_selected_project_missing',
      'canary_candidate_selected_project_eligible_status_missing',
      'canary_candidate_selected_project_company_eligible_status_missing',
      'canary_candidate_selected_id_missing',
    ],
  );
});

test('candidate discovery blockers reject missing table and missing status column', () => {
  assert.deepEqual(
    buildCandidateDiscoveryBlockers({
      tableExists: false,
      columns: {},
      filterInputs: {},
      counts: {},
      selectedCandidateId: '',
    }),
    ['canary_candidate_table_missing', 'canary_candidate_selected_id_missing'],
  );

  assert.deepEqual(
    buildCandidateDiscoveryBlockers({
      tableExists: true,
      columns: { projectId: true, companyId: true, candidateStatus: false },
      filterInputs: { projectIdPresent: true, companyIdPresent: true },
      counts: { total: 1, selectedProject: 1, selectedCompany: 1 },
      selectedCandidateId: '',
    }),
    ['canary_candidate_status_column_missing', 'canary_candidate_selected_id_missing'],
  );
});

test('handoff signal collector normalizes Supabase sslmode for non-verifying TLS', () => {
  assert.equal(
    normalizePgConnectionStringForHandoff(
      'postgresql://postgres:secret@db.example.supabase.co:5432/postgres?sslmode=require',
      { rejectUnauthorized: false },
    ),
    'postgresql://postgres:secret@db.example.supabase.co:5432/postgres?sslmode=no-verify',
  );
});

test('handoff signal collector hydrates targets from sanitized server-side process discovery', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-server-signals-'));
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
        companyId: 'company-prod-1',
        projectId: 'project-prod-1',
        planId: 'plan-prod-1',
        candidateId: 'candidate-prod-1',
        sampleCohortRef: 'db-sample://project/project-prod-1/duration-context-policy-canary-candidates',
      },
    }, null, 2), 'utf8');

    const result = spawnSync(process.execPath, [
      '--', collectorPath,
      '--env-source', 'process',
      '--env-file', 'deploy/env/server.production.env',
      '--output-dir', outputDir,
      '--server-signals-file', serverSignalsFile,
      '--include-live', '--confirm-live-handoff', '--include-db', '--confirm-db-ready',
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
        SUPABASE_MIGRATION_URL: 'postgresql://example.invalid/unreachable',
        WORKBUDDY_LIVE_BASE_URL: 'https://workbuddy.example.test',
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const signals = JSON.parse(await readFile(path.join(outputDir, 'handoff-signals.json'), 'utf8'));
    assert.equal(signals.connectivity.db.discoverySource, 'server-side-sanitized-signals');
    assert.equal(signals.discoveredTargets.candidateId, 'candidate-prod-1');
    const candidate = JSON.parse(await readFile(path.join(outputDir, 'handoff-candidate.generated.json'), 'utf8'));
    assert.equal(candidate.gates['c18-l07-l15-live-diagnostics'].live.baseUrl, 'https://workbuddy.example.test');
    assert.equal(candidate.gates['c15-live-learning-closeout'].targets.candidateId, 'candidate-prod-1');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('handoff signal collector labels requested server-side discovery when DB input is absent', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-discovery-source-'));
  try {
    const outputDir = path.join(tempDir, 'reports');
    const result = spawnSync(process.execPath, [
      '--', collectorPath,
      '--env-source', 'process',
      '--env-file', 'deploy/env/server.production.env',
      '--output-dir', outputDir,
      '--discovery-source', 'server-side-ssh-discovery',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        SUPABASE_MIGRATION_URL: '',
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
