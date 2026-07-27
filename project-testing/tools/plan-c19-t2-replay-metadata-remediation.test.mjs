import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildUpdatePlan,
  parseArgs,
  planC19T2ReplayMetadataRemediation,
} from './plan-c19-t2-replay-metadata-remediation.mjs';

test('C19 T2 replay remediation planner writes dry-run plan for legacy coarse window codes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-t2-remediation-'));
  const diagnosticFile = path.join(root, 'c19-t2-rhythm-live-replay.json');
  const output = path.join(root, 'remediation-plan.json');
  await writeFile(diagnosticFile, `${JSON.stringify(diagnostic(), null, 2)}\n`, 'utf8');

  try {
    const report = await planC19T2ReplayMetadataRemediation({
      diagnosticFile,
      output,
      now: new Date('2026-07-04T14:10:00.000Z'),
    });

    assert.equal(report.status, 'dry-run-plan-ready');
    assert.equal(report.liveMutation, false);
    assert.equal(report.dbMutation, false);
    assert.equal(report.projectId, 'project-1');
    assert.deepEqual(report.unknownCodes.sort(), [
      'T2-FACADE',
      'T2-FINISH',
      'T2-MEP',
      'T2-STRUCTURE',
    ].sort());
    assert.equal(report.plannedUpdateCount, 18);
    assert.deepEqual(
      report.updatePlan.filter((item) => item.windowCode.endsWith(':W01')).map((item) => item.workfaceKey),
      [
        'controlled-live-closeout:workface-1:W01',
        'controlled-live-closeout:workface-2:W01',
        'controlled-live-closeout:workface-3:W01',
      ],
    );
    assert.equal(report.sqlPreview.parameters.requiredRows, 18);
    assert.ok(report.reasonCodes.includes('dry_run_only_not_evidence_of_repair'));

    const written = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(written.schemaVersion, 'workbuddy-c19-t2-replay-metadata-remediation-plan/v1');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 T2 replay remediation planner blocks unsupported unknown codes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-t2-remediation-blocked-'));
  const diagnosticFile = path.join(root, 'c19-t2-rhythm-live-replay.json');
  const output = path.join(root, 'remediation-plan.json');
  const payload = diagnostic();
  payload.checks.taskActualReplay.unknownWindowCodeSamples = ['T2-STRUCTURE', 'custom-old-code'];
  await writeFile(diagnosticFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  try {
    const report = await planC19T2ReplayMetadataRemediation({ diagnosticFile, output });

    assert.equal(report.status, 'blocked');
    assert.deepEqual(report.unsupportedCodes, ['custom-old-code']);
    assert.equal(report.plannedUpdateCount, 0);
    assert.ok(report.reasonCodes.includes('unsupported_unknown_window_codes_present'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 T2 replay remediation planner refuses execute mode', async () => {
  await assert.rejects(
    () => planC19T2ReplayMetadataRemediation({
      allowWrite: true,
      confirmStagingRemediation: true,
    }),
    /execute mode is intentionally not implemented/,
  );
});

test('C19 T2 replay remediation update plan covers the replay diversity gate shape', () => {
  const plan = buildUpdatePlan('project-1');
  const byWindow = new Map();
  for (const item of plan) {
    if (!byWindow.has(item.windowCode)) byWindow.set(item.windowCode, new Set());
    byWindow.get(item.windowCode).add(item.workfaceKey);
  }

  assert.equal(plan.length, 18);
  assert.deepEqual(
    [...byWindow.entries()].map(([windowCode, workfaces]) => [windowCode, workfaces.size]).sort(),
    [
      ['t2-residential-standard-floor-structure-rhythm-v1:W01', 3],
      ['t2-residential-standard-floor-structure-rhythm-v1:W02', 3],
      ['t2-residential-standard-floor-structure-rhythm-v1:W03', 3],
      ['t2-residential-standard-floor-structure-rhythm-v1:W04', 3],
      ['t2-residential-standard-floor-structure-rhythm-v1:W05', 3],
      ['t2-residential-standard-floor-structure-rhythm-v1:W06', 3],
    ],
  );
});

test('C19 T2 replay remediation argument parser keeps dry-run default', () => {
  const parsed = parseArgs([
    '--diagnostic-file',
    'c19.json',
    '--output',
    'plan.json',
    '--project-id',
    'project-1',
  ]);

  assert.match(parsed.diagnosticFile, /c19\.json$/);
  assert.match(parsed.output, /plan\.json$/);
  assert.equal(parsed.projectId, 'project-1');
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.allowWrite, false);
});

function diagnostic() {
  return {
    status: 'fail',
    projectId: 'project-1',
    sampleAvailability: { status: 'fail' },
    replayCoverage: { status: 'fail' },
    checks: {
      taskActualReplay: {
        unknownWindowCodeSamples: ['T2-STRUCTURE', 'T2-FINISH', 'T2-MEP', 'T2-FACADE'],
      },
      durationExperienceReplay: {
        unknownWindowCodeSamples: ['T2-STRUCTURE', 'T2-MEP', 'T2-FACADE', 'T2-FINISH'],
      },
    },
  };
}
