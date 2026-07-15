import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  hydrateReleaseHandoffFromArtifacts,
  parseArgs,
} from './hydrate-release-handoff-from-artifacts.mjs';

test('handoff hydration skips blocked placeholder artifacts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-hydrate-blocked-'));
  const handoffFile = path.join(root, 'handoff.json');
  const output = path.join(root, 'hydrated.json');
  await writeJson(handoffFile, handoff());
  await writeJson(path.join(root, 'c19-release-closure-artifact.json'), {
    status: 'blocked',
    generatedPackageOnly: true,
  });
  await writeJson(path.join(root, 'old-object-drop-candidates.json'), {
    status: 'blocked',
    candidates: [],
  });
  await writeFile(path.join(root, 'old-object-ddl-export.sql'), '-- ddl-export-missing\n', 'utf8');

  try {
    const report = await hydrateReleaseHandoffFromArtifacts({
      handoffFile,
      artifactRoot: root,
      output,
      now: new Date('2026-06-29T07:20:00.000Z'),
    });

    assert.equal(report.counts.mutations, 0);
    assert.ok(report.counts.skipped > 0);

    const hydrated = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(hydrated.gates['c19-runtime-publication-release-rollback'].release.releaseClosureArtifactRef, '');
    assert.equal(hydrated.gates['old-object-physical-drop-closeout'].db.candidateBundleRef, '');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('handoff hydration fills refs from usable artifacts only', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-hydrate-pass-'));
  const handoffFile = path.join(root, 'handoff.json');
  await writeJson(handoffFile, handoff());
  await writeJson(path.join(root, 'phase1-evaluation.json'), { status: 'pass' });
  await writeJson(path.join(root, 'c19-release-closure-artifact.json'), { status: 'pass' });
  await writeJson(path.join(root, 'c19-live-evidence-summary.json'), {
    status: 'pass',
    rollbackRef: 'rollback://target',
    monitoringWindow: '2026-06-29T07:00:00Z/2026-06-29T08:00:00Z',
  });
  await writeJson(path.join(root, 'old-object-drop-candidates.json'), oldObjectBundle());
  await writeJson(path.join(root, 'old-object-physical-drop-summary.json'), {
    status: 'pass',
    migrationWindow: 'window://2026-06-29T07:00:00Z',
    backupLocationRef: 'backup://old-object',
  });
  await writeFile(path.join(root, 'old-object-ddl-export.sql'), 'CREATE TABLE public.legacy_scope_objects (id uuid PRIMARY KEY);\n', 'utf8');
  await writeFile(path.join(root, 'old-object-rollback-plan.sql'), 'CREATE TABLE public.legacy_scope_objects (id uuid PRIMARY KEY);\n', 'utf8');

  try {
    const report = await hydrateReleaseHandoffFromArtifacts({
      handoffFile,
      artifactRoot: root,
      now: new Date('2026-06-29T07:25:00.000Z'),
    });

    assert.equal(report.counts.mutations, 9);
    const c19 = report.handoff.gates['c19-runtime-publication-release-rollback'].release;
    const oldObject = report.handoff.gates['old-object-physical-drop-closeout'].db;

    assert.match(c19.phase1L5Ref, /phase1-evaluation\.json$/);
    assert.match(c19.releaseClosureArtifactRef, /c19-release-closure-artifact\.json$/);
    assert.equal(c19.rollbackTargetRef, 'rollback://target');
    assert.equal(c19.monitoringWindow, '2026-06-29T07:00:00Z/2026-06-29T08:00:00Z');
    assert.match(oldObject.candidateBundleRef, /old-object-drop-candidates\.json$/);
    assert.match(oldObject.ddlExportRef, /old-object-ddl-export\.sql$/);
    assert.match(oldObject.rollbackPlanRef, /old-object-rollback-plan\.sql$/);
    assert.equal(oldObject.migrationWindow, 'window://2026-06-29T07:00:00Z');
    assert.equal(oldObject.backupLocationRef, 'backup://old-object');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('handoff hydration argument parser accepts required paths', () => {
  const parsed = parseArgs([
    '--handoff-file',
    'handoff.json',
    '--artifact-root',
    'project-testing/reports/handoff',
    '--output',
    'hydrated-handoff.json',
  ]);

  assert.match(parsed.handoffFile, /handoff\.json$/);
  assert.match(parsed.artifactRoot, /handoff$/);
  assert.match(parsed.output, /hydrated-handoff\.json$/);
});

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function handoff() {
  return {
    schemaVersion: 'workbuddy-release-handoff-input/v1',
    gates: {
      'c19-runtime-publication-release-rollback': {
        release: {
          phase1L5Ref: '',
          releaseClosureArtifactRef: '',
          rollbackTargetRef: '',
          monitoringWindow: '',
        },
      },
      'old-object-physical-drop-closeout': {
        db: {
          candidateBundleRef: '',
          ddlExportRef: '',
          rollbackPlanRef: '',
          migrationWindow: '',
          backupLocationRef: '',
        },
      },
    },
  };
}

function oldObjectBundle() {
  return {
    status: 'pass',
    databaseTarget: 'env://server/.env#SUPABASE_MIGRATION_URL',
    candidateObject: 'public.legacy_scope_objects',
    rowCount: 0,
    catalogReadback: { status: 'pass' },
    dependencyReadback: { status: 'pass', runtimeReferences: [] },
    candidates: [{
      objectName: 'public.legacy_scope_objects',
      rowCount: 0,
    }],
  };
}
