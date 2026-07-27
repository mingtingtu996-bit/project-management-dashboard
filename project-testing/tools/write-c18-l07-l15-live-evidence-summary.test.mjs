import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { writeC18L07L15LiveEvidenceSummary } from './write-c18-l07-l15-live-evidence-summary.mjs';

const requiredArtifacts = [
  'c18-l07-critical-path-concurrency-live.json',
  'c18-l08-acceptance-status-concurrency-live.json',
  'c18-l09-wizard-commit-live.json',
  'c18-l10-wbs-generation-pressure.json',
  'c18-l11-warning-sync-query-log.json',
  'c18-l12-critical-path-network-pressure.json',
  'c18-l14-company-summary-pressure.json',
  'c18-l15-spreadsheet-migration-replay.json',
];

test('C-18 summary accepts live assessment status when synthetic wrapper has no top-level status', async () => {
  const artifactRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-c18-summary-nested-pass-'));

  try {
    await writeC18Artifacts(artifactRoot, {
      'c18-l10-wbs-generation-pressure.json': {
        status: undefined,
        routeEvidenceAssessment: { status: 'pass' },
      },
      'c18-l12-critical-path-network-pressure.json': {
        status: undefined,
        dbEvidenceAssessment: { status: 'pass' },
      },
      'c18-l14-company-summary-pressure.json': {
        status: undefined,
        routeEvidenceAssessment: { status: 'pass' },
      },
    });

    const result = await writeC18L07L15LiveEvidenceSummary({
      artifactRoot,
      now: new Date('2026-06-29T06:55:00.000Z'),
    });

    assert.equal(result.status, 'pass');
    assert.equal(result.counts.passedArtifacts, 8);
    assert.equal(result.counts.failures, 0);
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }
});

test('C-18 summary rejects blocked nested live assessment status', async () => {
  const artifactRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-c18-summary-nested-blocked-'));

  try {
    await writeC18Artifacts(artifactRoot, {
      'c18-l12-critical-path-network-pressure.json': {
        status: undefined,
        dbEvidenceAssessment: { status: 'blocked' },
      },
    });

    const result = await writeC18L07L15LiveEvidenceSummary({
      artifactRoot,
      now: new Date('2026-06-29T06:55:00.000Z'),
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.counts.failures, 1);
    assert.deepEqual(result.failures, [
      {
        itemId: 'C-18.L12',
        artifact: 'c18-l12-critical-path-network-pressure.json',
        reason: 'artifact_status_blocked',
      },
    ]);
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }
});

async function writeC18Artifacts(artifactRoot, overridesByArtifact = {}) {
  for (const artifact of requiredArtifacts) {
    await writeJson(path.join(artifactRoot, artifact), {
      status: 'pass',
      environment: 'current-live',
      diagnosticRunId: `run-${artifact}`,
      exitCode: 0,
      targetIds: { projectId: 'project-live-1' },
      cleanupReadback: { status: 'pass' },
      ...(overridesByArtifact[artifact] ?? {}),
    });
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
