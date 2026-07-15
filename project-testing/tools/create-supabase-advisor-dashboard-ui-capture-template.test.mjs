import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildSupabaseAdvisorDashboardUiCaptureTemplate,
  isMainModule,
  parseArgs,
  writeSupabaseAdvisorDashboardUiCaptureTemplate,
} from './create-supabase-advisor-dashboard-ui-capture-template.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('buildSupabaseAdvisorDashboardUiCaptureTemplate derives project ref from staging env without secrets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'advisor-dashboard-template-'));
  const envFile = path.join(root, 'staging.env');
  try {
    await writeFile(envFile, [
      'SUPABASE_URL=https://xemqmqpifsstkovbkatp.supabase.co',
      'SUPABASE_SERVICE_ROLE_KEY=secret-value-that-must-not-appear',
    ].join('\n'), 'utf8');

    const template = await buildSupabaseAdvisorDashboardUiCaptureTemplate({
      envFile,
      output: path.join(root, 'capture.template.json'),
      environment: 'staging',
      operator: 'test-operator',
    });

    assert.equal(template.schemaVersion, 'manual-supabase-advisor-dashboard-capture/v1');
    assert.equal(template.templateOnly, true);
    assert.equal(template.projectRef, 'xemqmqpifsstkovbkatp');
    assert.equal(template.dashboardUrl, 'https://supabase.com/dashboard/project/xemqmqpifsstkovbkatp/advisors/security');
    assert.equal(template.security.issueCount, '__FILL_CURRENT_SECURITY_ISSUE_COUNT_FROM_DASHBOARD__');
    assert.equal(template.manualChecklist.length, 3);
    assert.equal(
      template.manualChecklist.some((item) => item.page === 'https://supabase.com/dashboard/project/xemqmqpifsstkovbkatp/advisors/performance'),
      true,
    );
    assert.match(template.normalizeCommand, /capture\.filled\.json/);
    assert.doesNotMatch(template.normalizeCommand, /\.template\.json/);
    assert.equal(JSON.stringify(template).includes('secret-value-that-must-not-appear'), false);
    assert.equal(template.boundary.advisorCliRescan, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('writeSupabaseAdvisorDashboardUiCaptureTemplate persists a template-only artifact', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'advisor-dashboard-template-write-'));
  const output = path.join(root, 'capture.template.json');
  try {
    await writeSupabaseAdvisorDashboardUiCaptureTemplate({
      output,
      projectRef: 'xemqmqpifsstkovbkatp',
      dashboardUrl: 'https://supabase.com/dashboard/project/xemqmqpifsstkovbkatp/advisors/performance',
    });
    const written = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(written.templateOnly, true);
    assert.equal(written.projectRef, 'xemqmqpifsstkovbkatp');
    assert.equal(written.instructions.some((line) => /templateOnly to false/.test(line)), true);
    assert.equal(written.instructions.some((line) => /both \/advisors\/security and \/advisors\/performance/.test(line)), true);
    assert.match(written.normalizeCommand, /--project-ref xemqmqpifsstkovbkatp/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('parseArgs requires output and accepts dashboard URL override', () => {
  assert.throws(() => parseArgs(['--project-ref', 'xemqmqpifsstkovbkatp']), /--output is required/);
  const parsed = parseArgs([
    '--output', 'capture.template.json',
    '--project-ref', 'xemqmqpifsstkovbkatp',
    '--dashboard-url', 'https://supabase.com/dashboard/project/xemqmqpifsstkovbkatp/advisors/security',
  ]);
  assert.match(parsed.output, /capture\.template\.json$/);
  assert.equal(parsed.projectRef, 'xemqmqpifsstkovbkatp');
});

test('template CLI writes JSON without printing secrets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'advisor-dashboard-template-cli-'));
  const envFile = path.join(root, 'staging.env');
  const output = path.join(root, 'capture.template.json');
  try {
    await writeFile(envFile, [
      'DATABASE_URL=postgresql://postgres:secret@db.xemqmqpifsstkovbkatp.supabase.co:5432/postgres',
    ].join('\n'), 'utf8');
    const result = spawnSync(process.execPath, [
      'project-testing/tools/create-supabase-advisor-dashboard-ui-capture-template.mjs',
      '--env-file', envFile,
      '--output', output,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /template-written/);
    assert.equal(result.stdout.includes('secret'), false);
    const written = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(written.projectRef, 'xemqmqpifsstkovbkatp');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('isMainModule detects direct CLI entrypoint', () => {
  const entry = path.join(process.cwd(), 'project-testing/tools/create-supabase-advisor-dashboard-ui-capture-template.mjs');
  assert.equal(isMainModule(`file://${entry.replace(/\\/g, '/')}`, 'project-testing/tools/create-supabase-advisor-dashboard-ui-capture-template.mjs'), true);
  assert.equal(isMainModule(`file://${entry.replace(/\\/g, '/')}`, 'project-testing/tools/other.mjs'), false);
});
