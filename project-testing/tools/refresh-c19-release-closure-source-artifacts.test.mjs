import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkC19ReleaseClosureSources,
} from './check-c19-release-closure-sources.mjs';
import {
  refreshC19ReleaseClosureSourceArtifacts,
} from './refresh-c19-release-closure-source-artifacts.mjs';

test('refreshes current C19 runtime evidence into generator-consumable closure sources', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-source-refresh-'));
  await writeJson(path.join(root, 'c19-t2-rhythm-live-replay.json'), {
    schemaVersion: 'workbuddy-c19-t2-rhythm-live-replay-evidence/v1',
    status: 'pass',
    projectId: 'project-1',
    releasePackageId: 'release-package://c19/project-1/2026-07-05T00:00:00.000Z',
    phase1L5Ref: 'phase1-l5://c19/project-1/2026-07-05T00:00:00.000Z',
    monitoringWindow: '2026-07-05T10:00:00+08:00/2026-07-05T12:00:00+08:00',
    selectedTemplateIds: ['t2-controlled-closeout-template'],
    sourceEvidenceRefs: ['duration_experience_samples:sample-1'],
    rollbackRef: 'rollback://c19-runtime-publication/pre-apply-snapshot-20260705-01',
    consumerObservationRef: 'jjj64',
  });
  await writeJson(path.join(root, 'phase1-evaluation.json'), {
    schemaVersion: 'workbuddy-c19-phase1-l5-evaluation/v1',
    source: 't2_rhythm_phase1_multinetwork_selection_trust_gate',
    status: 'phase1_readonly_evaluation_ready',
    candidateId: 'candidate-1',
    standardLibraryReadiness: {
      releaseEvidenceClosure: {
        selectedTemplateIds: ['t2-controlled-closeout-template'],
      },
    },
    phase1PublicationGate: {
      status: 'canary_handoff_ready_not_published',
      phase1L5Ref: 'phase1-l5://c19/project-1/2026-07-05T00:00:00.000Z',
    },
  });
  await writeJson(path.join(root, 'c19-release-closure-artifact.json'), {
    schemaVersion: 'workbuddy-c19-release-closure-artifact/v1',
    status: 'manual_publication_candidate_ready',
    projectId: 'project-1',
    releasePackageId: 'release-package://c19/project-1/2026-07-05T00:00:00.000Z',
    phase1L5Ref: 'phase1-l5://c19/project-1/2026-07-05T00:00:00.000Z',
    monitoringWindow: '2026-07-05T10:00:00+08:00/2026-07-05T12:00:00+08:00',
    rollbackRef: 'rollback://c19-runtime-publication/pre-apply-snapshot-20260705-01',
    consumerObservationRef: 'jjj64',
    report: {
      companyId: 'company-1',
      selectedTemplateIds: ['t2-controlled-closeout-template'],
      releaseEvidenceRefs: ['duration_experience_samples:sample-1'],
    },
    sourceEvidenceRefs: ['duration_experience_samples:sample-1'],
  });

  const before = await checkC19ReleaseClosureSources({
    artifactRoot: root,
    now: new Date('2026-07-05T00:01:00.000Z'),
  });
  assert.equal(before.status, 'blocked');

  const summaryPath = path.join(root, 'c19-release-closure-source-artifact-refresh.json');
  const summary = await refreshC19ReleaseClosureSourceArtifacts({
    artifactRoot: root,
    outputSummary: summaryPath,
    now: new Date('2026-07-05T00:02:00.000Z'),
  });

  assert.equal(summary.status, 'pass');
  assert.deepEqual(summary.selectedTemplateIds, ['t2-controlled-closeout-template']);
  assert.equal(summary.evidenceRefCount, 1);

  const after = await checkC19ReleaseClosureSources({
    artifactRoot: root,
    now: new Date('2026-07-05T00:03:00.000Z'),
  });
  assert.equal(after.status, 'ready');
  assert.equal(after.readyToGenerateReleaseClosure, true);
  assert.deepEqual(after.missingSourceFileRoles, []);
  assert.deepEqual(after.invalidSourceFileRoles, []);
  assert.deepEqual(after.templateScope.commonTemplateIds, ['t2-controlled-closeout-template']);

  const saved = JSON.parse(await readFile(summaryPath, 'utf8'));
  assert.equal(saved.status, 'pass');
});

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
