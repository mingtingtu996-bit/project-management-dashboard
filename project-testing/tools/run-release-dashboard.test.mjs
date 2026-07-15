import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  loadMatrix,
  parseArgs,
  planReleaseRun,
  runDashboard,
} from './run-release-dashboard.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const matrixPath = path.join(repoRoot, 'project-testing/matrix/release-test-matrix.json');

test('release-local dry run selects ready local gates and preserves blocked gates as non-pass', async () => {
  const matrix = await loadMatrix(matrixPath);
  const options = parseArgs(['--profile', 'release-local', '--dry-run']);
  const plan = planReleaseRun(matrix, options);
  const expectedSelectedIds = matrix.gateGroups
    .filter((group) => group.status === 'ready' && ['local_static', 'local_browser', 'tooling_readiness'].includes(group.tier))
    .map((group) => group.id);

  assert.deepEqual(plan.selectedGroups.map((group) => group.id), expectedSelectedIds);
  assert.ok(plan.selectedGroups.every((group) => group.status === 'ready'));
  assert.ok(plan.selectedGroups.every((group) => ['local_static', 'local_browser', 'tooling_readiness'].includes(group.tier)));
  assert.ok(plan.selectedGroups.some((group) => group.id === 'testing-tool-readiness'));
  assert.ok(plan.selectedGroups.some((group) => group.id === 'default-master-plan-evidence-source-kit'));
  assert.ok(plan.deferredGroups.some((group) => group.id === 'live-evidence-and-workspace-isolation'));
  assert.ok(plan.blockedGroups.some((group) => group.id === 'database-migration-and-recovery'));
});

test('matrix defaults no longer assume another thread currently owns live testing', async () => {
  const matrix = await loadMatrix(matrixPath);

  assert.equal(matrix.concurrencyPolicy?.activeLiveThread, false);
  assert.equal(matrix.concurrencyPolicy?.allowedNow?.includes('project-testing/**'), true);
  assert.ok(
    matrix.gateGroups
      .filter((group) => group.tier === 'live_only')
      .every((group) => !String(group.mutationBoundary).includes('another live-testing thread')),
  );
});

test('live and db profiles require explicit unlock flags', async () => {
  const matrix = await loadMatrix(matrixPath);

  assert.throws(
    () => planReleaseRun(matrix, parseArgs(['--profile', 'live', '--dry-run'])),
    /requires --include-live and --confirm-live-handoff/,
  );
  assert.throws(
    () => planReleaseRun(matrix, parseArgs(['--profile', 'db', '--dry-run'])),
    /requires --include-db and --confirm-db-ready/,
  );
});

test('env file values are loaded for executed commands but not written to summaries', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-release-dashboard-env-'));
  const envDir = await mkdtemp(path.join(tmpdir(), 'workbuddy-release-dashboard-env-file-'));
  const envFile = path.join(envDir, 'staging.env');
  const matrixFile = path.join(envDir, 'matrix.json');
  const secretValue = 'do-not-print-this-secret-value';

  try {
    await import('node:fs/promises').then(async ({ writeFile }) => {
      await writeFile(envFile, `TEST_RELEASE_DASHBOARD_SECRET=${secretValue}\nTEST_RELEASE_DASHBOARD_NAME=staging\n`, 'utf8');
      await writeFile(matrixFile, JSON.stringify({
        schemaVersion: 'test/v1',
        generatedAt: '2026-06-29T01:02:03+08:00',
        concurrencyPolicy: { activeLiveThread: false },
        gateGroups: [
          {
            id: 'static-build-typecheck',
            tier: 'local_static',
            status: 'ready',
            purpose: 'env propagation test',
            commands: [
              'node -e "if (process.env.TEST_RELEASE_DASHBOARD_SECRET !== \'do-not-print-this-secret-value\') process.exit(7); console.log(process.env.TEST_RELEASE_DASHBOARD_NAME)"',
            ],
          },
        ],
      }, null, 2), 'utf8');
    });

    const result = await runDashboard({
      argv: [
        '--profile',
        'smoke',
        '--matrix',
        matrixFile,
        '--report-root',
        reportRoot,
        '--env-file',
        envFile,
      ],
      cwd: repoRoot,
      now: new Date('2026-06-29T01:02:03+08:00'),
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.summary.environment?.envFile, envFile);
    assert.ok(result.summary.environment?.loadedKeys?.includes('TEST_RELEASE_DASHBOARD_SECRET'));

    const summaryText = await readFile(path.join(result.reportDir, 'summary.json'), 'utf8');
    assert.doesNotMatch(summaryText, new RegExp(secretValue));
    assert.match(summaryText, /TEST_RELEASE_DASHBOARD_SECRET/);
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
    await rm(envDir, { recursive: true, force: true });
  }
});

test('live profile runnable commands carry required evidence and write flags', async () => {
  const matrix = await loadMatrix(matrixPath);
  const plan = planReleaseRun(
    matrix,
    parseArgs(['--profile', 'live', '--include-live', '--confirm-live-handoff']),
  );

  const c15 = plan.selectedGroups.find((group) => group.id === 'c15-live-learning-closeout');
  const c19 = plan.selectedGroups.find((group) => group.id === 'c19-runtime-publication-release-rollback');

  assert.ok(c15?.commands?.some((command) => command.includes('--allow-write')));
  assert.ok(c15?.commands?.some((command) => command.includes('--create-disposable-candidate')));
  assert.ok(c15?.commands?.some((command) => command.includes('--output-file')));
  assert.ok(c19?.commands?.some((command) => command.includes('diagnose:t2-rhythm-live-replay') && command.includes('--allow-live')));
  assert.ok(c19?.commands?.some((command) => command.includes('--environment=staging')));
  assert.ok(c19?.commands?.some((command) => command.includes('--evidence-ref=')));
  assert.ok(c19?.commands?.some((command) => command.includes('--output-file')));
});

test('real-environment closeout gates stay deferred or blocked in local dry-runs', async () => {
  const matrix = await loadMatrix(matrixPath);
  const plan = planReleaseRun(matrix, parseArgs(['--profile', 'smoke', '--dry-run']));

  const selectedIds = new Set(plan.selectedGroups.map((group) => group.id));
  for (const id of [
    'c18-l07-l15-live-diagnostics',
    'c15-live-learning-closeout',
    'c19-runtime-publication-release-rollback',
    'old-object-physical-drop-closeout',
  ]) {
    assert.equal(selectedIds.has(id), false, `${id} must not be selected by local smoke`);
  }

  assert.ok(plan.deferredGroups.some((group) => group.id === 'c18-l07-l15-live-diagnostics'));
  assert.ok(plan.deferredGroups.some((group) => group.id === 'c15-live-learning-closeout'));
  assert.ok(plan.deferredGroups.some((group) => group.id === 'c19-runtime-publication-release-rollback'));
  assert.ok(plan.blockedGroups.some((group) => group.id === 'old-object-physical-drop-closeout'));

  const c18 = plan.deferredGroups.find((group) => group.id === 'c18-l07-l15-live-diagnostics');
  const oldObject = plan.blockedGroups.find((group) => group.id === 'old-object-physical-drop-closeout');
  assert.ok(c18.commandTemplates?.some((command) => command.includes('diagnose:critical-path-concurrency-live')));
  assert.ok(c18.requiredEvidence?.some((item) => item.includes('DB query log')));
  assert.ok(c18.closeoutTargets?.includes('C-18.L07'));
  assert.equal(c18.unlockPolicy?.profile, 'live');
  assert.equal(c18.unlockPolicy?.hardPassFromMcpOnlyAllowed, false);
  assert.ok(c18.artifactValidationPolicy?.rejectIf?.includes('manual-assisted-only'));
  assert.ok(c18.handoffChecklist?.some((item) => item.includes('Live environment ownership')));
  assert.ok(c18.blockingPrerequisites?.some((item) => item.includes('--include-live')));
  assert.ok(c18.passCriteria?.some((item) => item.includes('C-18.L07')));
  assert.ok(c18.expectedArtifacts?.some((item) => item.includes('c18-l07-critical-path-concurrency-live.json')));
  assert.ok(c18.evidenceOwners?.includes('database-evidence-owner'));
  assert.ok(oldObject.commandTemplates?.some((command) => command.includes('guard:legacy-object-drop')));
  assert.ok(oldObject.requiredEvidence?.some((item) => item.includes('rowCount=0')));
  assert.ok(oldObject.closeoutTargets?.includes('old-object.controlled-drop-migration'));
  assert.equal(oldObject.unlockPolicy?.profile, 'db');
  assert.equal(oldObject.unlockPolicy?.dbReadyRequired, true);
  assert.ok(oldObject.artifactValidationPolicy?.rejectIf?.includes('retired-object-audit-only'));
  assert.ok(oldObject.handoffChecklist?.some((item) => item.includes('Database recovery')));
  assert.ok(oldObject.blockingPrerequisites?.some((item) => item.includes('--include-db')));
  assert.ok(oldObject.passCriteria?.some((item) => item.includes('Physical DROP path')));
  assert.ok(oldObject.passCriteria?.some((item) => item.includes('No-safe-candidate path')));
  assert.ok(oldObject.commandTemplates?.some((command) => command.includes('old-object-candidate-discovery.all.json')));
  assert.ok(oldObject.commandTemplates?.some((command) => command.includes('write-old-object-no-safe-candidate-closeout')));
  assert.ok(oldObject.expectedArtifacts?.some((item) => item.includes('old-object-controlled-drop-migration.sql')));
  assert.ok(oldObject.evidenceOwners?.includes('rollback-owner'));
});

test('dry run writes summary reports without executing commands', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-release-dashboard-'));

  try {
    const result = await runDashboard({
      argv: ['--profile', 'smoke', '--dry-run', '--report-root', reportRoot],
      cwd: repoRoot,
      now: new Date('2026-06-29T01:02:03+08:00'),
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.executedCommands.length, 0);
    assert.match(result.reportDir, /release-20260629-010203$/);

    const summary = JSON.parse(await readFile(path.join(result.reportDir, 'summary.json'), 'utf8'));
    const markdown = await readFile(path.join(result.reportDir, 'summary.md'), 'utf8');

    assert.equal(summary.profile, 'smoke');
    assert.equal(summary.dryRun, true);
    assert.equal(summary.activeLiveThread, false);
    assert.ok(summary.selectedGroups.length > 0);
    assert.ok(summary.deferredGroups.some((group) => group.status === 'deferred_live'));
    assert.ok(summary.blockedGroups.some((group) => group.status === 'blocked_db'));
    assert.ok(summary.deferredGroups.some((group) => group.commandTemplates?.length > 0));
    assert.ok(summary.blockedGroups.some((group) => group.requiredEvidence?.length > 0));
    assert.ok(summary.deferredGroups.some((group) => group.closeoutTargets?.length > 0));
    assert.ok(summary.deferredGroups.some((group) => group.unlockPolicy?.profile === 'live'));
    assert.ok(summary.blockedGroups.some((group) => group.unlockPolicy?.profile === 'db'));
    assert.ok(summary.deferredGroups.some((group) => group.artifactValidationPolicy?.requiredMetadata?.length > 0));
    assert.ok(summary.deferredGroups.some((group) => group.handoffChecklist?.length > 0));
    assert.ok(summary.deferredGroups.some((group) => group.passCriteria?.length > 0));
    assert.ok(summary.blockedGroups.some((group) => group.expectedArtifacts?.length > 0));
    assert.ok(summary.blockedGroups.some((group) => group.evidenceOwners?.length > 0));
    assert.match(markdown, /Dry run/);
    assert.match(markdown, /Gate Details/);
    assert.match(markdown, /c18-l07-l15-live-diagnostics/);
    assert.match(markdown, /old-object-physical-drop-closeout/);
    assert.match(markdown, /Closeout targets/);
    assert.match(markdown, /Unlock policy/);
    assert.match(markdown, /Artifact validation policy/);
    assert.match(markdown, /Required evidence/);
    assert.match(markdown, /Handoff checklist/);
    assert.match(markdown, /Blocking prerequisites/);
    assert.match(markdown, /Pass criteria/);
    assert.match(markdown, /Expected artifacts/);
    assert.match(markdown, /Evidence owners/);
    assert.match(markdown, /Command templates/);
    assert.match(markdown, /Active live thread: no/);
    assert.doesNotMatch(markdown, /pass.*live-evidence-and-workspace-isolation/i);
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});

test('dry run report directories stay unique inside the same second', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-release-dashboard-collision-'));
  const now = new Date('2026-06-29T01:02:03+08:00');

  try {
    const first = await runDashboard({
      argv: ['--profile', 'smoke', '--dry-run', '--report-root', reportRoot],
      cwd: repoRoot,
      now,
    });
    const second = await runDashboard({
      argv: ['--profile', 'smoke', '--dry-run', '--report-root', reportRoot],
      cwd: repoRoot,
      now,
    });

    assert.notEqual(first.reportDir, second.reportDir);
    assert.match(first.reportDir, /release-20260629-010203$/);
    assert.match(second.reportDir, /release-20260629-010203-001$/);
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});
