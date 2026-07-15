import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parseArgs,
  runOldObjectPhysicalDropEvidence,
} from './run-old-object-physical-drop-evidence.mjs';
import { validateReleaseEvidence } from './validate-release-evidence.mjs';

test('old-object physical drop runner writes fail-closed artifacts by default', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-old-object-blocked-'));
  const handoffFile = path.join(root, 'handoff.json');
  await writeFile(handoffFile, `${JSON.stringify(oldObjectHandoff(), null, 2)}\n`, 'utf8');

  try {
    const result = await runOldObjectPhysicalDropEvidence({
      handoffFile,
      artifactRoot: root,
      now: new Date('2026-06-29T04:50:00.000Z'),
      dropExecutor: async () => {
        throw new Error('drop executor must not run without --allow-drop');
      },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.dbMutation, false);
    assert.deepEqual(result.outputs.map((item) => path.basename(item.path)).sort(), [
      'old-object-controlled-drop-migration.sql',
      'old-object-ddl-export.sql',
      'old-object-dependency-readback.json',
      'old-object-drop-candidates.json',
      'old-object-physical-drop-summary.json',
      'old-object-post-drop-api-browser-smoke.json',
      'old-object-post-drop-catalog-readback.json',
      'old-object-rollback-plan.sql',
      'old-object-rowcount-and-catalog-readback.json',
    ]);

    const candidates = JSON.parse(await readFile(path.join(root, 'old-object-drop-candidates.json'), 'utf8'));
    const summary = JSON.parse(await readFile(path.join(root, 'old-object-physical-drop-summary.json'), 'utf8'));
    const rollback = await readFile(path.join(root, 'old-object-rollback-plan.sql'), 'utf8');

    assert.equal(candidates.retiredObjectAuditOnly, true);
    assert.equal(summary.ddlExportMissing, true);
    assert.equal(summary.rollbackPlanMissing, true);
    assert.equal(summary.postDropSmokeMissing, true);
    assert.equal(summary.rowCount, null);
    assert.equal(summary.databaseTarget, 'env://server/.env#SUPABASE_MIGRATION_URL');
    assert.equal(summary.candidateObject, 'no-approved-drop-candidate');
    assert.equal(summary.approvalRef, 'approval://manual');
    assert.match(rollback, /rollback-plan-missing/);
    assert.equal(result.outputs.find((item) => item.name === 'old-object-ddl-export.sql')?.status, 'blocked');
    assert.equal(result.outputs.find((item) => item.name === 'old-object-rollback-plan.sql')?.status, 'blocked');
    assert.equal(result.outputs.find((item) => item.name === 'old-object-controlled-drop-migration.sql')?.status, 'blocked');

    const validation = await validateReleaseEvidence({
      gateId: 'old-object-physical-drop-closeout',
      evidenceRoot: root,
      now: new Date('2026-06-29T04:51:00.000Z'),
    });

    assert.equal(validation.status, 'fail');
    assert.ok(validation.failures.some((failure) => failure.code === 'reject-marker-present'
      && failure.detail === 'retired-object-audit-only'));
    assert.ok(validation.failures.some((failure) => failure.code === 'reject-marker-present'
      && failure.detail === 'ddl-export-missing'));
    assert.ok(validation.failures.some((failure) => failure.code === 'reject-marker-present'
      && failure.detail === 'rollback-plan-missing'));
    assert.ok(validation.failures.some((failure) => failure.code === 'reject-marker-present'
      && failure.detail === 'post-drop-smoke-missing'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('old-object physical drop runner rejects drop mode unless DB handoff is ready', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-old-object-drop-blocked-'));
  const handoffFile = path.join(root, 'handoff.json');
  const handoff = oldObjectHandoff();
  handoff.unlockFlags.confirmDbReady = false;
  await writeFile(handoffFile, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');

  try {
    await assert.rejects(
      runOldObjectPhysicalDropEvidence({
        handoffFile,
        artifactRoot: root,
        includeDb: true,
        confirmDbReady: true,
        allowDrop: true,
        dropExecutor: async () => {
          throw new Error('drop executor must not run with failed handoff');
        },
      }),
      /handoff is not ready/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('old-object physical drop runner writes pass artifacts from a controlled executor result', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-old-object-drop-pass-'));
  const handoffFile = path.join(root, 'handoff.json');
  await writeFile(handoffFile, `${JSON.stringify(oldObjectReadyHandoff(), null, 2)}\n`, 'utf8');

  try {
    const result = await runOldObjectPhysicalDropEvidence({
      handoffFile,
      artifactRoot: root,
      includeDb: true,
      confirmDbReady: true,
      allowDrop: true,
      candidateBundle: path.join(root, 'candidate-bundle.json'),
      now: new Date('2026-06-29T05:10:00.000Z'),
      dropExecutor: async () => ({
        status: 'pass',
        candidateObject: 'public.legacy_scope_objects',
        candidates: [{ objectName: 'public.legacy_scope_objects', rowCount: 0 }],
        rowCount: 0,
        catalogReadback: { status: 'pass', objectPresentBeforeDrop: true },
        dependencyReadback: { status: 'pass', runtimeReferences: [] },
        postDropCatalogReadback: { status: 'pass', objectPresentAfterDrop: false },
        postDropApiBrowserSmoke: { status: 'pass', smokePath: 'old-object-post-drop-api-browser-smoke.json' },
        ddlExportSql: 'create table public.legacy_scope_objects(id uuid primary key);',
        rollbackSql: 'create table public.legacy_scope_objects(id uuid primary key);',
        controlledDropSql: 'drop table public.legacy_scope_objects;',
      }),
    });

    assert.equal(result.status, 'pass');
    assert.equal(result.dbMutation, true);

    const summary = JSON.parse(await readFile(path.join(root, 'old-object-physical-drop-summary.json'), 'utf8'));
    const ddl = await readFile(path.join(root, 'old-object-ddl-export.sql'), 'utf8');
    const rollback = await readFile(path.join(root, 'old-object-rollback-plan.sql'), 'utf8');
    const migration = await readFile(path.join(root, 'old-object-controlled-drop-migration.sql'), 'utf8');

    assert.equal(summary.status, 'pass');
    assert.equal(summary.rowCount, 0);
    assert.equal(summary.candidateObject, 'public.legacy_scope_objects');
    assert.equal(summary.migrationWindow, 'window://2026-06-29T05:00:00Z');
    assert.match(ddl, /create table public\.legacy_scope_objects/);
    assert.match(rollback, /create table public\.legacy_scope_objects/);
    assert.match(migration, /drop table public\.legacy_scope_objects/);
    assert.equal(result.outputs.find((item) => item.name === 'old-object-ddl-export.sql')?.status, 'pass');
    assert.equal(result.outputs.find((item) => item.name === 'old-object-rollback-plan.sql')?.status, 'pass');
    assert.equal(result.outputs.find((item) => item.name === 'old-object-controlled-drop-migration.sql')?.status, 'pass');

    const validation = await validateReleaseEvidence({
      gateId: 'old-object-physical-drop-closeout',
      evidenceRoot: root,
      now: new Date('2026-06-29T05:11:00.000Z'),
    });

    assert.equal(validation.status, 'pass');
    assert.equal(validation.counts.expectedArtifactsPresent, 9);
    assert.equal(validation.counts.rejectMarkersMatched, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('old-object physical drop runner can read a controlled executor result file', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-old-object-drop-file-'));
  const handoffFile = path.join(root, 'handoff.json');
  const executorResultFile = path.join(root, 'executor-result.json');
  await writeFile(handoffFile, `${JSON.stringify(oldObjectReadyHandoff(), null, 2)}\n`, 'utf8');
  await writeFile(executorResultFile, `${JSON.stringify({
    status: 'pass',
    candidateObject: 'public.legacy_scope_objects',
    candidates: [{ objectName: 'public.legacy_scope_objects', rowCount: 0 }],
    rowCount: 0,
    catalogReadback: { status: 'pass' },
    dependencyReadback: { status: 'pass', runtimeReferences: [] },
    postDropCatalogReadback: { status: 'pass' },
    postDropApiBrowserSmoke: { status: 'pass' },
    ddlExportSql: 'create table public.legacy_scope_objects(id uuid primary key);',
    rollbackSql: 'create table public.legacy_scope_objects(id uuid primary key);',
    controlledDropSql: 'drop table public.legacy_scope_objects;',
  }, null, 2)}\n`, 'utf8');

  try {
    const result = await runOldObjectPhysicalDropEvidence({
      handoffFile,
      artifactRoot: root,
      includeDb: true,
      confirmDbReady: true,
      allowDrop: true,
      candidateBundle: path.join(root, 'candidate-bundle.json'),
      executorResultFile,
      now: new Date('2026-06-29T05:15:00.000Z'),
    });

    assert.equal(result.status, 'pass');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('old-object physical drop runner keeps weak executor results blocked', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-old-object-drop-weak-'));
  const handoffFile = path.join(root, 'handoff.json');
  await writeFile(handoffFile, `${JSON.stringify(oldObjectReadyHandoff(), null, 2)}\n`, 'utf8');

  try {
    const result = await runOldObjectPhysicalDropEvidence({
      handoffFile,
      artifactRoot: root,
      includeDb: true,
      confirmDbReady: true,
      allowDrop: true,
      candidateBundle: path.join(root, 'candidate-bundle.json'),
      now: new Date('2026-06-29T05:20:00.000Z'),
      dropExecutor: async () => ({
        status: 'pass',
        candidateObject: 'public.legacy_scope_objects',
        rowCount: 1,
      }),
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.dbMutation, false);

    const validation = await validateReleaseEvidence({
      gateId: 'old-object-physical-drop-closeout',
      evidenceRoot: root,
      now: new Date('2026-06-29T05:21:00.000Z'),
    });

    assert.equal(validation.status, 'fail');
    assert.ok(validation.failures.some((failure) => failure.code === 'reject-marker-present'
      && failure.detail === 'ddl-export-missing'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('old-object argument parser accepts guarded drop inputs', () => {
  const parsed = parseArgs([
    '--handoff-file',
    'project-testing/reports/handoff/handoff.json',
    '--artifact-root',
    'project-testing/reports/handoff',
    '--include-db',
    '--confirm-db-ready',
    '--allow-drop',
    '--candidate-bundle',
    'old-object-drop-candidates.json',
    '--executor-result-file',
    'old-object-drop-executor-result.json',
  ]);

  assert.equal(parsed.includeDb, true);
  assert.equal(parsed.confirmDbReady, true);
  assert.equal(parsed.allowDrop, true);
  assert.match(parsed.candidateBundle, /old-object-drop-candidates\.json$/);
  assert.match(parsed.executorResultFile, /old-object-drop-executor-result\.json$/);
});

function oldObjectHandoff() {
  return {
    schemaVersion: 'workbuddy-release-handoff-input/v1',
    unlockFlags: {
      includeLive: false,
      confirmLiveHandoff: false,
      includeDb: true,
      confirmDbReady: true,
    },
    gates: {
      'old-object-physical-drop-closeout': {
        db: {
          databaseTargetRef: 'env://server/.env#SUPABASE_MIGRATION_URL',
          databaseReadinessOwner: 'operator://db',
          candidateBundleRef: '',
          ddlExportRef: '',
          rollbackPlanRef: '',
          migrationWindow: '',
          backupLocationRef: '',
          catalogReadbackOwner: 'operator://catalog',
          apiBrowserSmokeOwner: 'operator://smoke',
        },
        approvals: {
          manualApprovalRef: 'approval://manual',
        },
        owners: {
          migrationOwner: 'operator://migration',
          rollbackOwner: 'operator://rollback',
          postDropSmokeOwner: 'operator://post-drop-smoke',
        },
      },
    },
  };
}

function oldObjectReadyHandoff() {
  const handoff = oldObjectHandoff();
  const db = handoff.gates['old-object-physical-drop-closeout'].db;
  db.candidateBundleRef = 'old-object-drop-candidates.json';
  db.ddlExportRef = 'old-object-ddl-export.sql';
  db.rollbackPlanRef = 'old-object-rollback-plan.sql';
  db.migrationWindow = 'window://2026-06-29T05:00:00Z';
  db.backupLocationRef = 'backup://old-object/legacy_scope_objects';
  return handoff;
}
