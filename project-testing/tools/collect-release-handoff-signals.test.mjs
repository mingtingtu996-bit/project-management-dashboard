import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildCandidateDiscovery,
  buildCandidateDiscoveryBlockers,
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
