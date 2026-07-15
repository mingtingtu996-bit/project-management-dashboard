import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkC19ReleaseClosureSources,
  parseArgs,
} from './check-c19-release-closure-sources.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const selectedTemplateIds = ['t2-residential-standard-floor-structure-rhythm-v1'];

test('blocks when all C19 release closure source files are missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-sources-missing-'));
  const output = path.join(root, 'c19-release-closure-sources-preflight.json');

  const report = await checkC19ReleaseClosureSources({
    artifactRoot: root,
    output,
    now: new Date('2026-07-04T00:00:00.000Z'),
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.readyToGenerateReleaseClosure, false);
  assert.deepEqual(report.missingSourceFileRoles, [
    'archived_live_replay',
    'c19_13_phase1_multinetwork_selection',
    'l5_canary_handoff',
  ]);
  assert.deepEqual(report.invalidSourceFileRoles, []);
  assert.ok(report.reasonCodes.includes('release_closure_source_files_missing'));
  assert.equal(report.boundary.dbMutation, false);
  assert.equal(report.boundary.liveMutation, false);

  const saved = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(saved.status, 'blocked');
});

test('passes when current release dir contains generator-consumable C19 closure sources', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-sources-ready-'));
  await writeJson(path.join(root, 'c19-t2-rhythm-live-replay.json'), {
    releaseEvidenceInput: liveReplayReleaseEvidenceInput(),
  });
  await writeJson(path.join(root, 'phase1-evaluation.json'), {
    phase1MultiNetworkSelectionTrustGate: phase1Gate(),
  });
  await writeJson(path.join(root, 'l5-release-gate.json'), {
    l5ReleaseGate: l5Gate(),
  });

  const report = await checkC19ReleaseClosureSources({
    artifactRoot: root,
    now: new Date('2026-07-04T00:05:00.000Z'),
  });

  assert.equal(report.status, 'ready');
  assert.equal(report.readyToGenerateReleaseClosure, true);
  assert.deepEqual(report.missingSourceFileRoles, []);
  assert.deepEqual(report.invalidSourceFileRoles, []);
  assert.deepEqual(report.reasonCodes, []);
  assert.equal(report.sources.archived_live_replay.artifact, 'c19-t2-rhythm-live-replay.json');
  assert.equal(report.sources.c19_13_phase1_multinetwork_selection.artifact, 'phase1-evaluation.json');
  assert.equal(report.sources.l5_canary_handoff.artifact, 'l5-release-gate.json');
  assert.equal(report.templateScope.status, 'ready');
  assert.deepEqual(report.templateScope.commonTemplateIds, selectedTemplateIds);
});

test('blocks present files that are not usable release closure sources', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-sources-invalid-'));
  await writeJson(path.join(root, 'c19-t2-rhythm-live-replay.json'), {
    releaseEvidenceInput: {
      ...liveReplayReleaseEvidenceInput(),
      canFeedReleaseEvidenceClosure: false,
      blockingReasons: ['live_replay_not_archived'],
    },
  });
  await writeJson(path.join(root, 'phase1-evaluation.json'), {
    status: 'blocked',
    phase1MultiNetworkSelectionTrustGate: phase1Gate(),
  });
  await writeJson(path.join(root, 'l5-release-gate.json'), {
    l5ReleaseGate: {
      ...l5Gate(),
      status: 'l5_release_blocked',
      releaseBlockers: ['rollback_drill_missing'],
    },
  });

  const report = await checkC19ReleaseClosureSources({
    artifactRoot: root,
    now: new Date('2026-07-04T00:10:00.000Z'),
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.readyToGenerateReleaseClosure, false);
  assert.deepEqual(report.missingSourceFileRoles, []);
  assert.deepEqual(report.invalidSourceFileRoles, [
    'archived_live_replay',
    'c19_13_phase1_multinetwork_selection',
    'l5_canary_handoff',
  ]);
  assert.ok(report.reasonCodes.includes('release_closure_source_files_not_usable'));
  assert.ok(report.sources.archived_live_replay.reasonCodes.includes('archived_live_replay_not_feedable'));
  assert.ok(report.sources.c19_13_phase1_multinetwork_selection.reasonCodes.includes('artifact_status_blocked'));
  assert.ok(report.sources.l5_canary_handoff.reasonCodes.includes('l5_canary_handoff_not_ready'));
});

test('blocks when source roles cover different template scopes', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-sources-scope-'));
  await writeJson(path.join(root, 'c19-t2-rhythm-live-replay.json'), {
    releaseEvidenceInput: liveReplayReleaseEvidenceInput(),
  });
  await writeJson(path.join(root, 'phase1-evaluation.json'), {
    phase1MultiNetworkSelectionTrustGate: phase1Gate(['t2-other-template']),
  });
  await writeJson(path.join(root, 'l5-release-gate.json'), {
    l5ReleaseGate: l5Gate(),
  });

  const report = await checkC19ReleaseClosureSources({
    artifactRoot: root,
    now: new Date('2026-07-04T00:15:00.000Z'),
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.readyToGenerateReleaseClosure, false);
  assert.deepEqual(report.missingSourceFileRoles, []);
  assert.deepEqual(report.invalidSourceFileRoles, []);
  assert.ok(report.reasonCodes.includes('release_closure_template_scope_mismatch'));
  assert.equal(report.templateScope.status, 'mismatch');
  assert.ok(report.templateScope.mismatchRoles.includes('c19_13_phase1_multinetwork_selection'));
});

test('CLI writes report and exits non-zero for blocked source preflight', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-sources-cli-'));
  const output = path.join(root, 'preflight.json');
  const result = spawnSync(
    process.execPath,
    [
      'project-testing/tools/check-c19-release-closure-sources.mjs',
      '--artifact-root',
      root,
      '--output',
      output,
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /C19 release closure sources: blocked/);
  const saved = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(saved.status, 'blocked');
});

test('parseArgs supports --release-dir alias', () => {
  const parsed = parseArgs(['--release-dir', 'project-testing/reports/current', '--output', 'out.json']);
  assert.match(parsed.artifactRoot, /project-testing[\\/]reports[\\/]current$/);
  assert.match(parsed.output, /out\.json$/);
});

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function noWriteBoundary() {
  return {
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
    writesSeed: false,
    writesBaseline: false,
    writesRuntimePublications: false,
  };
}

function liveReplayReleaseEvidenceInput(templateIds = selectedTemplateIds) {
  return {
    source: 't2_live_replay_release_evidence_input',
    evidenceMode: 'archived_live_replay',
    selectedTemplateIds: templateIds,
    evidenceRefs: ['artifact:t2-live-replay-current.json'],
    liveReplayTrustGate: {
      status: 'shadow_replay_ready_not_publishable',
      selectedTemplateIds: templateIds,
      mutationBoundary: noWriteBoundary(),
    },
    canFeedReleaseEvidenceClosure: true,
    blockingReasons: [],
    mutationBoundary: noWriteBoundary(),
  };
}

function phase1Gate(templateIds = selectedTemplateIds) {
  return {
    source: 't2_rhythm_phase1_multinetwork_selection_trust_gate',
    status: 'phase1_multinetwork_selection_ready_not_publishable',
    evidenceMode: 'archived_phase1_selector_replay',
    canTrustForRealScheduleSelection: true,
    selectedTemplateIds: templateIds,
    selectionEvidenceRefs: ['artifact:c19-13-phase1-selector-replay.json'],
    releaseBlockers: [],
    mutationBoundary: noWriteBoundary(),
  };
}

function l5Gate(templateIds = selectedTemplateIds) {
  return {
    source: 't2_rhythm_standard_library_l5_release_gate',
    status: 'l5_canary_handoff_ready',
    canEnterCanary: true,
    canPublishRuntimeExperience: false,
    canMaterializeTaskDependencies: false,
    canWritePlanDates: false,
    canAutoPublishRuntimeExperience: false,
    releaseBlockers: [],
    releasePackage: {
      packageType: 't2_standard_library_canary_handoff',
      releaseMode: 'canary_only',
      selectedTemplateIds: templateIds,
      scopeType: 'project',
      companyId: 'company-1',
      projectId: 'project-1',
      evidenceRefs: ['artifact:t2-release-exit.md', 'artifact:t2-canary-plan.md'],
      rollbackTargetEvidenceRefs: ['artifact:t2-rollback-target.md'],
      consumerVerificationEvidenceRefs: ['artifact:t2-consumer-verification.md'],
      impactMonitoringEvidenceRefs: ['artifact:t2-impact-monitoring.md'],
    },
    mutationBoundary: noWriteBoundary(),
  };
}
