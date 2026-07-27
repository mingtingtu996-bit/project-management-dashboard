import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildSupabaseAdvisorDashboardUiExport,
  extractProjectRefFromDashboardUrl,
  isMainModule,
  parseArgs,
  writeSupabaseAdvisorDashboardUiExport,
} from './normalize-supabase-advisor-dashboard-ui-export.mjs';

test('extractProjectRefFromDashboardUrl parses Supabase dashboard project refs', () => {
  assert.equal(
    extractProjectRefFromDashboardUrl('https://supabase.com/dashboard/project/xemqmqpifsstkovbkatp/advisors/security'),
    'xemqmqpifsstkovbkatp',
  );
  assert.equal(extractProjectRefFromDashboardUrl('https://example.com/dashboard/project/test'), '');
});

test('buildSupabaseAdvisorDashboardUiExport normalizes a dashboard UI capture', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'advisor-dashboard-ui-'));
  const input = path.join(root, 'capture.json');
  const output = path.join(root, 'supabase-advisor-management-api-export.json');
  try {
    await writeFile(input, `${JSON.stringify({
      schemaVersion: 'manual-supabase-advisor-dashboard-capture/v1',
      templateOnly: false,
      dashboardUrl: 'https://supabase.com/dashboard/project/xemqmqpifsstkovbkatp/advisors/security',
      capturedAt: '2026-07-04T09:00:00.000Z',
      security: {
        issueCount: 0,
        issues: [],
      },
      performance: {
        issues: [
          {
            code: 'unindexed_foreign_keys',
            title: 'Unindexed foreign keys',
            categories: ['PERFORMANCE'],
            detail: 'A foreign key is missing a covering index.',
          },
        ],
      },
      captureEvidenceRefs: ['supabase-dashboard-advisor-screenshot.png'],
    }, null, 2)}\n`, 'utf8');

    const evidence = await buildSupabaseAdvisorDashboardUiExport({
      input,
      output,
      environment: 'staging',
      operator: 'test-operator',
    });

    assert.equal(evidence.schemaVersion, 'workbuddy-supabase-advisor-ui-or-api-export/v1');
    assert.equal(evidence.source, 'dashboard_ui');
    assert.equal(evidence.projectRef, 'xemqmqpifsstkovbkatp');
    assert.equal(evidence.securityIssueCount, 0);
    assert.equal(evidence.performanceIssueCount, 1);
    assert.equal(evidence.issueCount, 1);
    assert.equal(evidence.boundary.advisorUiOrApiExport, true);
    assert.equal(evidence.boundary.advisorCliRescan, false);
    assert.match(evidence.dashboardUi.inputArtifactPath, /capture\.json$/);
    assert.deepEqual(evidence.dashboardUi.captureEvidenceRefs, ['supabase-dashboard-advisor-screenshot.png']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('writeSupabaseAdvisorDashboardUiExport persists a dashboard_ui export', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'advisor-dashboard-ui-write-'));
  const input = path.join(root, 'capture.json');
  const output = path.join(root, 'export.json');
  try {
    await writeFile(input, `${JSON.stringify({
      templateOnly: false,
      dashboardUrl: 'https://supabase.com/dashboard/project/xemqmqpifsstkovbkatp',
      capturedAt: '2026-07-04T09:00:00.000Z',
      captureEvidenceRefs: ['operator-note.md'],
      sections: [
        { id: 'security', issueCount: 0 },
        { id: 'performance', issueCount: 0 },
      ],
    })}\n`, 'utf8');

    await writeSupabaseAdvisorDashboardUiExport({ input, output });
    const written = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(written.source, 'dashboard_ui');
    assert.equal(written.securityIssueCount, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildSupabaseAdvisorDashboardUiExport fails closed on weak or mismatched captures', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'advisor-dashboard-ui-blocked-'));
  const input = path.join(root, 'capture.json');
  const output = path.join(root, 'export.json');
  try {
    await writeFile(input, `${JSON.stringify({
      templateOnly: false,
      dashboardUrl: 'https://supabase.com/dashboard/project/otherproject',
      capturedAt: '2026-07-04T09:00:00.000Z',
      captureEvidenceRefs: ['operator-note.md'],
      security: { issueCount: 0 },
      performance: { issueCount: 0 },
    })}\n`, 'utf8');

    await assert.rejects(
      buildSupabaseAdvisorDashboardUiExport({
        input,
        output,
        projectRef: 'xemqmqpifsstkovbkatp',
      }),
      /Dashboard URL project ref mismatch/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildSupabaseAdvisorDashboardUiExport rejects unfilled template-only captures', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'advisor-dashboard-ui-template-only-'));
  const input = path.join(root, 'capture.template.json');
  const output = path.join(root, 'export.json');
  try {
    await writeFile(input, `${JSON.stringify({
      schemaVersion: 'manual-supabase-advisor-dashboard-capture/v1',
      templateOnly: true,
      dashboardUrl: 'https://supabase.com/dashboard/project/xemqmqpifsstkovbkatp/advisors/security',
      capturedAt: '2026-07-04T09:00:00.000Z',
      security: { issueCount: 0 },
      performance: { issueCount: 0 },
    })}\n`, 'utf8');

    await assert.rejects(
      buildSupabaseAdvisorDashboardUiExport({
        input,
        output,
        projectRef: 'xemqmqpifsstkovbkatp',
      }),
      /templateOnly/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildSupabaseAdvisorDashboardUiExport rejects captures with placeholders or missing evidence refs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'advisor-dashboard-ui-weak-capture-'));
  const input = path.join(root, 'capture.json');
  const output = path.join(root, 'export.json');
  try {
    await writeFile(input, `${JSON.stringify({
      schemaVersion: 'manual-supabase-advisor-dashboard-capture/v1',
      templateOnly: false,
      dashboardUrl: 'https://supabase.com/dashboard/project/xemqmqpifsstkovbkatp/advisors/security',
      capturedAt: '__FILL_CURRENT_CAPTURE_TIMESTAMP_ISO__',
      security: { issueCount: 0 },
      performance: { issueCount: 0 },
      captureEvidenceRefs: ['operator-note.md'],
    })}\n`, 'utf8');

    await assert.rejects(
      buildSupabaseAdvisorDashboardUiExport({
        input,
        output,
        projectRef: 'xemqmqpifsstkovbkatp',
      }),
      /placeholder/,
    );

    await writeFile(input, `${JSON.stringify({
      schemaVersion: 'manual-supabase-advisor-dashboard-capture/v1',
      templateOnly: false,
      dashboardUrl: 'https://supabase.com/dashboard/project/xemqmqpifsstkovbkatp/advisors/security',
      capturedAt: '2026-07-04T09:00:00.000Z',
      security: { issueCount: 0 },
      performance: { issueCount: 0 },
      captureEvidenceRefs: [],
    })}\n`, 'utf8');

    await assert.rejects(
      buildSupabaseAdvisorDashboardUiExport({
        input,
        output,
        projectRef: 'xemqmqpifsstkovbkatp',
      }),
      /captureEvidenceRefs/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildSupabaseAdvisorDashboardUiExport rejects CLI-derived advisor captures', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'advisor-dashboard-ui-cli-derived-'));
  const input = path.join(root, 'capture.json');
  const output = path.join(root, 'export.json');
  try {
    await writeFile(input, `${JSON.stringify({
      schemaVersion: 'manual-supabase-advisor-dashboard-capture/v1',
      templateOnly: false,
      source: 'cli_db_advisors',
      dashboardUrl: 'https://supabase.com/dashboard/project/xemqmqpifsstkovbkatp/advisors/security',
      capturedAt: '2026-07-04T09:00:00.000Z',
      security: { issueCount: 0 },
      performance: { issueCount: 0 },
      captureEvidenceRefs: ['operator-note.md'],
    })}\n`, 'utf8');

    await assert.rejects(
      buildSupabaseAdvisorDashboardUiExport({
        input,
        output,
        projectRef: 'xemqmqpifsstkovbkatp',
      }),
      /CLI db advisors/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('parseArgs requires input and output paths', () => {
  assert.throws(() => parseArgs(['--output', 'out.json']), /--input is required/);
  assert.throws(() => parseArgs(['--input', 'capture.json']), /--output is required/);
  const parsed = parseArgs(['--input', 'capture.json', '--output', 'out.json', '--project-ref', 'xemqmqpifsstkovbkatp']);
  assert.match(parsed.input, /capture\.json$/);
  assert.match(parsed.output, /out\.json$/);
  assert.equal(parsed.projectRef, 'xemqmqpifsstkovbkatp');
});

test('isMainModule detects relative CLI entrypoint invocations', () => {
  const entry = path.join(process.cwd(), 'project-testing/tools/normalize-supabase-advisor-dashboard-ui-export.mjs');
  assert.equal(isMainModule(`file://${entry.replace(/\\/g, '/')}`, 'project-testing/tools/normalize-supabase-advisor-dashboard-ui-export.mjs'), true);
  assert.equal(isMainModule(`file://${entry.replace(/\\/g, '/')}`, 'project-testing/tools/other.mjs'), false);
});
