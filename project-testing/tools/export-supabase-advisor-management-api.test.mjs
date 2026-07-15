import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildSupabaseAdvisorManagementApiExport,
  extractProjectRefFromSupabaseUrl,
  isMainModule,
  normalizeAdvisorIssues,
  parseArgs,
  writeSupabaseAdvisorManagementApiExport,
} from './export-supabase-advisor-management-api.mjs';

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

test('extractProjectRefFromSupabaseUrl parses the Supabase project ref', () => {
  assert.equal(
    extractProjectRefFromSupabaseUrl('https://xemqmqpifsstkovbkatp.supabase.co'),
    'xemqmqpifsstkovbkatp',
  );
  assert.equal(extractProjectRefFromSupabaseUrl('https://example.com'), '');
});

test('normalizeAdvisorIssues accepts common Advisor response containers', () => {
  assert.equal(normalizeAdvisorIssues([{ name: 'rls_disabled' }], 'security').length, 1);
  assert.equal(normalizeAdvisorIssues({ results: [{ name: 'slow_query' }] }, 'performance').length, 1);
  assert.equal(normalizeAdvisorIssues({ data: { issues: [{ code: 'nested' }] } }, 'security').length, 1);
});

test('buildSupabaseAdvisorManagementApiExport writes a formal management_api export shape', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith('/advisors/security')) return response({ results: [] });
    if (url.endsWith('/advisors/performance')) {
      return response({
        results: [
          {
            name: 'unindexed_foreign_keys',
            title: 'Unindexed foreign keys',
            categories: ['PERFORMANCE'],
            detail: 'Table public.tasks has a foreign key without a covering index.',
          },
        ],
      });
    }
    return response({ error: 'not found' }, 404);
  };

  const evidence = await buildSupabaseAdvisorManagementApiExport({
    envFile: '',
    output: path.join(tmpdir(), 'supabase-advisor-management-api-export.json'),
    projectRef: 'xemqmqpifsstkovbkatp',
    environment: 'staging',
    operator: 'test-operator',
    now: new Date('2026-07-04T09:00:00.000Z'),
    env: { SUPABASE_MANAGEMENT_API_TOKEN: 'test-token' },
    fetchImpl,
  });

  assert.equal(evidence.schemaVersion, 'workbuddy-supabase-advisor-ui-or-api-export/v1');
  assert.equal(evidence.source, 'management_api');
  assert.equal(evidence.securityIssueCount, 0);
  assert.equal(evidence.performanceIssueCount, 1);
  assert.equal(evidence.issueCount, 1);
  assert.equal(evidence.boundary.advisorUiOrApiExport, true);
  assert.equal(evidence.managementApi.tokenEnv, 'SUPABASE_MANAGEMENT_API_TOKEN');
  assert.equal(calls.length, 2);
});

test('writeSupabaseAdvisorManagementApiExport persists the export evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'advisor-management-api-export-'));
  const output = path.join(root, 'export.json');
  try {
    await writeSupabaseAdvisorManagementApiExport({
      envFile: '',
      output,
      projectRef: 'xemqmqpifsstkovbkatp',
      env: { SUPABASE_ACCESS_TOKEN: 'test-token' },
      fetchImpl: async (url) => response(url.endsWith('/advisors/security') ? [] : []),
      now: new Date('2026-07-04T09:00:00.000Z'),
    });

    const written = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(written.source, 'management_api');
    assert.equal(written.securityIssueCount, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildSupabaseAdvisorManagementApiExport fails closed without a Management API token', async () => {
  await assert.rejects(
    buildSupabaseAdvisorManagementApiExport({
      envFile: '',
      output: path.join(tmpdir(), 'export.json'),
      projectRef: 'xemqmqpifsstkovbkatp',
      env: {},
      fetchImpl: async () => response([]),
    }),
    /Supabase Management API token missing/,
  );
});

test('parseArgs requires an output path', () => {
  assert.throws(() => parseArgs(['--project-ref', 'xemqmqpifsstkovbkatp']), /--output is required/);
  const parsed = parseArgs(['--output', 'out.json', '--project-ref', 'xemqmqpifsstkovbkatp']);
  assert.equal(parsed.projectRef, 'xemqmqpifsstkovbkatp');
  assert.match(parsed.output, /out\.json$/);
});

test('isMainModule detects relative CLI entrypoint invocations', () => {
  const entry = path.join(process.cwd(), 'project-testing/tools/export-supabase-advisor-management-api.mjs');
  assert.equal(isMainModule(`file://${entry.replace(/\\/g, '/')}`, 'project-testing/tools/export-supabase-advisor-management-api.mjs'), true);
  assert.equal(isMainModule(`file://${entry.replace(/\\/g, '/')}`, 'project-testing/tools/other.mjs'), false);
});
