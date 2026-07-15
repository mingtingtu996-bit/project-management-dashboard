import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  generateHandoffPack,
  parseArgs,
} from './generate-release-handoff-pack.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const matrixPath = path.join(repoRoot, 'project-testing/matrix/release-test-matrix.json');

test('real-closeout handoff pack contains only the four remaining real-environment gates', async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-'));

  try {
    const result = await generateHandoffPack({
      target: 'real-closeout',
      matrixPath,
      outputRoot,
      now: new Date('2026-06-29T02:40:00+08:00'),
    });

    assert.match(result.outputDir, /handoff-20260629-024000$/);
    assert.equal(result.handoff.executionBoundary.planningOnly, true);
    assert.equal(result.handoff.executionBoundary.commandsExecuted, 0);
    assert.deepEqual(result.handoff.gates.map((gate) => gate.id), [
      'c18-l07-l15-live-diagnostics',
      'c15-live-learning-closeout',
      'c19-runtime-publication-release-rollback',
      'old-object-physical-drop-closeout',
    ]);
    assert.ok(result.handoff.gates.every((gate) => gate.validationCommand.includes('validate-release-evidence.mjs')));
    assert.ok(result.handoff.gates.every((gate) => gate.closeoutDecision.mustRemainOpenWhen.some((item) => item.includes('dry-run'))));

    const markdown = await readFile(path.join(result.outputDir, 'handoff-plan.md'), 'utf8');
    assert.match(markdown, /WorkBuddy Release Handoff - real-closeout/);
    assert.match(markdown, /c18-l07-l15-live-diagnostics/);
    assert.match(markdown, /old-object-physical-drop-closeout/);
    assert.match(markdown, /Commands executed: 0/);
    assert.match(markdown, /Validation command/);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test('live and db targets select the matching matrix tiers without running commands', async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-targets-'));

  try {
    const live = await generateHandoffPack({
      target: 'live',
      matrixPath,
      outputRoot,
      now: new Date('2026-06-29T02:41:00+08:00'),
    });
    const db = await generateHandoffPack({
      target: 'db',
      matrixPath,
      outputRoot,
      now: new Date('2026-06-29T02:41:00+08:00'),
    });

    assert.ok(live.handoff.gates.length >= 4);
    assert.ok(live.handoff.gates.every((gate) => gate.tier === 'live_only'));
    assert.ok(db.handoff.gates.length >= 2);
    assert.ok(db.handoff.gates.every((gate) => gate.tier === 'db_dependent'));
    assert.equal(live.handoff.executionBoundary.commandsExecuted, 0);
    assert.equal(db.handoff.executionBoundary.commandsExecuted, 0);
    assert.notEqual(live.outputDir, db.outputDir);
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test('explicit gate selection overrides target defaults', async () => {
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-gate-'));

  try {
    const result = await generateHandoffPack({
      target: 'real-closeout',
      gateIds: ['old-object-physical-drop-closeout'],
      matrixPath,
      outputRoot,
      now: new Date('2026-06-29T02:42:00+08:00'),
    });

    assert.deepEqual(result.handoff.gates.map((gate) => gate.id), ['old-object-physical-drop-closeout']);
    assert.equal(result.handoff.gates[0].unlockPolicy.profile, 'db');
    assert.ok(result.handoff.gates[0].expectedArtifacts.includes('old-object-controlled-drop-migration.sql'));
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test('argument parser supports repeatable gate selection and rejects unknown targets', () => {
  const parsed = parseArgs([
    '--target',
    'real-closeout',
    '--gate',
    'c18-l07-l15-live-diagnostics',
    '--gate',
    'c15-live-learning-closeout',
  ]);

  assert.equal(parsed.target, 'real-closeout');
  assert.deepEqual(parsed.gateIds, [
    'c18-l07-l15-live-diagnostics',
    'c15-live-learning-closeout',
  ]);
  assert.throws(() => parseArgs(['--target', 'production']), /--target must be one of/);
});
