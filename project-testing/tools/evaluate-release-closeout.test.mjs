import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  evaluateReleaseCloseout,
  parseArgs,
  writeCloseoutDecision,
} from './evaluate-release-closeout.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const matrixPath = path.join(repoRoot, 'project-testing/matrix/release-test-matrix.json');

test('closeout evaluator keeps selected gates open when evidence is missing', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-closeout-missing-'));

  try {
    const decision = await evaluateReleaseCloseout({
      evidenceRoot,
      matrixPath,
      gateIds: [
        'c18-l07-l15-live-diagnostics',
        'old-object-physical-drop-closeout',
      ],
      now: new Date('2026-07-01T02:00:00.000Z'),
    });

    assert.equal(decision.status, 'fail');
    assert.equal(decision.mayCloseAll, false);
    assert.deepEqual(decision.decision.openGateIds, [
      'c18-l07-l15-live-diagnostics',
      'old-object-physical-drop-closeout',
    ]);
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('closeout evaluator allows old-object no-safe-candidate closeout without physical DROP claim', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-closeout-old-object-'));

  try {
    await writeOldObjectNoSafeArtifacts(evidenceRoot);
    const decision = await evaluateReleaseCloseout({
      evidenceRoot,
      matrixPath,
      gateIds: ['old-object-physical-drop-closeout'],
      now: new Date('2026-07-01T02:01:00.000Z'),
    });
    const outputs = await writeCloseoutDecision({
      decision,
      outputPath: path.join(evidenceRoot, 'closeout-decision.json'),
    });
    const summary = JSON.parse(await readFile(outputs.jsonPath, 'utf8'));
    const markdown = await readFile(outputs.markdownPath, 'utf8');

    assert.equal(decision.status, 'pass');
    assert.equal(decision.mayCloseAll, true);
    assert.equal(summary.gates[0].closeoutMode, 'no_safe_candidate');
    assert.equal(summary.gates[0].mutationSummary.physicalDropExecuted, false);
    assert.match(markdown, /no_safe_candidate/u);
    assert.match(markdown, /Physical DROP/u);
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('argument parser requires evidence root and accepts repeatable selected gates', () => {
  const parsed = parseArgs([
    '--evidence-root',
    'project-testing/reports/production-livegate-1/artifacts',
    '--gate',
    'c18-l07-l15-live-diagnostics',
    '--gate',
    'old-object-physical-drop-closeout',
  ]);

  assert.equal(parsed.gateIds.length, 2);
  assert.match(parsed.evidenceRoot, /production-livegate-1[\\/]artifacts$/u);
  assert.throws(() => parseArgs([]), /--evidence-root is required/u);
});

async function writeOldObjectNoSafeArtifacts(root) {
  const discovery = {
    schemaVersion: 'workbuddy-old-object-drop-candidate-discovery/v1',
    generatedAt: '2026-07-01T02:01:00.000Z',
    discoveryMode: 'full_catalog',
    minNameHint: false,
    status: 'no_safe_candidate',
    databaseTarget: 'env://deploy/env/server.production.env#SUPABASE_MIGRATION_URL',
    candidateCount: 0,
    candidates: [],
    inspectedCount: 1,
    inspected: [
      {
        objectName: 'public.projects',
        rowCount: 3,
        hintScore: 0,
        dependencyStatus: 'pass',
        runtimeReferenceCount: 0,
      },
    ],
    physicalDropExecuted: false,
    boundary: {
      liveMutation: false,
      dbMutation: false,
      physicalDropExecuted: false,
    },
  };
  await writeJson(path.join(root, 'old-object-candidate-discovery.all.json'), discovery);
  await writeJson(path.join(root, 'legacy-object-drop-guard.initial.json'), {
    status: 'no_safe_candidate',
    candidates: [],
  });
  await writeJson(path.join(root, 'old-object-no-safe-candidate-closeout.json'), {
    schemaVersion: 'workbuddy-old-object-no-safe-candidate-closeout/v1',
    generatedAt: '2026-07-01T02:01:00.000Z',
    gateId: 'old-object-physical-drop-closeout',
    status: 'pass',
    closeoutMode: 'no_safe_candidate',
    databaseTarget: discovery.databaseTarget,
    discoveryRef: 'old-object-candidate-discovery.all.json',
    fullCatalogDiscoveryRef: 'old-object-candidate-discovery.all.json',
    guardRef: 'legacy-object-drop-guard.initial.json',
    candidateCount: 0,
    candidates: [],
    inspectedCount: 1,
    physicalDropExecuted: false,
    liveMutation: false,
    dbMutation: false,
    boundary: {
      liveMutation: false,
      dbMutation: false,
      physicalDropExecuted: false,
    },
  });
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
