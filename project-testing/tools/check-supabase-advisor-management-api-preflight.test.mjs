import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildSupabaseAdvisorManagementApiPreflight,
  isMainModule,
  parseArgs,
  writeSupabaseAdvisorManagementApiPreflight,
} from './check-supabase-advisor-management-api-preflight.mjs';

test('Advisor Management API preflight blocks without a token but does not leak secrets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'advisor-preflight-missing-token-'));
  const envFile = path.join(root, 'staging.env');
  await writeFile(envFile, 'SUPABASE_URL=https://xemqmqpifsstkovbkatp.supabase.co\n', 'utf8');
  try {
    const report = await buildSupabaseAdvisorManagementApiPreflight({
      envFile,
      output: path.join(root, 'advisor-preflight.json'),
      env: {},
      now: new Date('2026-07-04T12:00:00.000Z'),
    });

    assert.equal(report.status, 'blocked');
    assert.equal(report.readyToRun, false);
    assert.equal(report.projectRef, 'xemqmqpifsstkovbkatp');
    assert.ok(report.blockers.some((blocker) => blocker.code === 'management-api-token-missing'));
    assert.equal(JSON.stringify(report).includes('test-token'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Advisor Management API preflight is ready with env file, project ref, and token env', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'advisor-preflight-ready-'));
  const envFile = path.join(root, 'staging.env');
  const output = path.join(root, 'advisor-preflight.json');
  await writeFile(envFile, 'SUPABASE_URL=https://xemqmqpifsstkovbkatp.supabase.co\n', 'utf8');
  try {
    const report = await writeSupabaseAdvisorManagementApiPreflight({
      envFile,
      output,
      advisorOutput: path.join(root, 'supabase-advisor-management-api-export.json'),
      env: { SUPABASE_MANAGEMENT_API_TOKEN: 'test-token' },
      operator: 'release-dashboard-db-profile',
      now: new Date('2026-07-04T12:00:00.000Z'),
    });
    const written = JSON.parse(await readFile(output, 'utf8'));

    assert.equal(report.status, 'ready');
    assert.equal(report.readyToRun, true);
    assert.equal(report.resolvedTokenEnv, 'SUPABASE_MANAGEMENT_API_TOKEN');
    assert.equal(report.tokenPresence.SUPABASE_MANAGEMENT_API_TOKEN, true);
    assert.match(report.requiredExportCommand, /evidence:supabase-advisor:management-api/);
    assert.match(report.requiredExportCommand, /--operator release-dashboard-db-profile/);
    assert.equal(JSON.stringify(written).includes('test-token'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Advisor Management API preflight reports missing env file and project ref', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'advisor-preflight-missing-env-'));
  try {
    const report = await buildSupabaseAdvisorManagementApiPreflight({
      envFile: path.join(root, 'missing.env'),
      output: path.join(root, 'advisor-preflight.json'),
      env: { SUPABASE_MANAGEMENT_API_TOKEN: 'test-token' },
      now: new Date('2026-07-04T12:00:00.000Z'),
    });

    assert.equal(report.status, 'blocked');
    assert.deepEqual(
      report.blockers.map((blocker) => blocker.code),
      ['env-file-missing', 'project-ref-missing'],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Advisor Management API preflight argument parser and entrypoint detection work', () => {
  const parsed = parseArgs(['--output', 'out.json', '--project-ref', 'xemqmqpifsstkovbkatp', '--token-env', 'SUPABASE_ACCESS_TOKEN']);
  assert.match(parsed.output, /out\.json$/);
  assert.equal(parsed.projectRef, 'xemqmqpifsstkovbkatp');
  assert.equal(parsed.tokenEnv, 'SUPABASE_ACCESS_TOKEN');
  assert.throws(() => parseArgs([]), /--output is required/);

  const entry = path.join(process.cwd(), 'project-testing/tools/check-supabase-advisor-management-api-preflight.mjs');
  assert.equal(isMainModule(`file://${entry.replace(/\\/g, '/')}`, 'project-testing/tools/check-supabase-advisor-management-api-preflight.mjs'), true);
});
