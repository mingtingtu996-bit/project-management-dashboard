import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkOldObjectCandidateBundle,
  parseArgs,
} from './check-old-object-candidate-bundle.mjs';

test('old-object candidate bundle check passes for zero-row approved review bundle', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-old-object-bundle-pass-'));
  const files = await writeBundleSet(root, candidateBundle());

  try {
    const report = await checkOldObjectCandidateBundle({
      candidateBundle: files.bundle,
      ddlExportFile: files.ddl,
      rollbackPlanFile: files.rollback,
      controlledDropFile: files.drop,
      now: new Date('2026-06-29T07:00:00.000Z'),
    });

    assert.equal(report.status, 'pass');
    assert.equal(report.counts.failures, 0);
    assert.equal(report.counts.candidates, 1);
    assert.equal(report.boundary.dbMutation, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('old-object candidate bundle check fails closed for placeholders and missing evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-old-object-bundle-placeholder-'));
  const files = await writeBundleSet(root, {
    databaseTarget: 'env://server/.env#SUPABASE_MIGRATION_URL',
    candidateObject: 'no-approved-drop-candidate',
    rowCount: null,
    catalogReadback: null,
    dependencyReadback: null,
    ddlExportPath: path.join(root, 'old-object-ddl-export.sql'),
    rollbackPath: path.join(root, 'old-object-rollback-plan.sql'),
    approvalRef: '',
    migrationWindow: '',
    postDropSmokePath: 'old-object-post-drop-api-browser-smoke.json',
    candidates: [],
  }, {
    ddl: '-- ddl-export-missing: none\n',
    rollback: '-- rollback-plan-missing: none\n',
    drop: '-- approval-missing: none\n',
  });

  try {
    const report = await checkOldObjectCandidateBundle({
      candidateBundle: files.bundle,
      ddlExportFile: files.ddl,
      rollbackPlanFile: files.rollback,
      controlledDropFile: files.drop,
    });

    assert.equal(report.status, 'fail');
    assert.ok(report.failures.some((failure) => failure.field === 'candidates'));
    assert.ok(report.failures.some((failure) => failure.field === 'rowCount'));
    assert.ok(report.failures.some((failure) => failure.field === 'approvalRef'));
    assert.ok(report.failures.some((failure) => failure.field === 'ddlExportFile'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('old-object candidate bundle check rejects runtime references and nonzero rows', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-old-object-bundle-risk-'));
  const bundle = candidateBundle();
  bundle.rowCount = 1;
  bundle.dependencyReadback = {
    status: 'pass',
    runtimeReferences: [{ dependentCatalog: 'pg_rewrite', dependentOid: '123' }],
  };
  bundle.candidates[0].rowCount = 1;
  const files = await writeBundleSet(root, bundle);

  try {
    const report = await checkOldObjectCandidateBundle({
      candidateBundle: files.bundle,
      ddlExportFile: files.ddl,
      rollbackPlanFile: files.rollback,
      controlledDropFile: files.drop,
    });

    assert.equal(report.status, 'fail');
    assert.ok(report.failures.some((failure) => failure.field === 'rowCount'));
    assert.ok(report.failures.some((failure) => failure.field === 'dependencyReadback.runtimeReferences'));
    assert.ok(report.failures.some((failure) => failure.field === 'candidates[0].rowCount'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('old-object candidate bundle argument parser accepts review artifact paths', () => {
  const parsed = parseArgs([
    '--candidate-bundle',
    'old-object-drop-candidates.json',
    '--ddl-export-file',
    'old-object-ddl-export.sql',
    '--rollback-plan-file',
    'old-object-rollback-plan.sql',
    '--controlled-drop-file',
    'old-object-controlled-drop-migration.sql',
    '--output',
    'old-object-candidate-bundle-check.json',
  ]);

  assert.match(parsed.candidateBundle, /old-object-drop-candidates\.json$/);
  assert.match(parsed.ddlExportFile, /old-object-ddl-export\.sql$/);
  assert.match(parsed.rollbackPlanFile, /old-object-rollback-plan\.sql$/);
  assert.match(parsed.controlledDropFile, /old-object-controlled-drop-migration\.sql$/);
  assert.match(parsed.output, /old-object-candidate-bundle-check\.json$/);
});

async function writeBundleSet(root, bundle, sql = {}) {
  const files = {
    bundle: path.join(root, 'old-object-drop-candidates.json'),
    ddl: path.join(root, 'old-object-ddl-export.sql'),
    rollback: path.join(root, 'old-object-rollback-plan.sql'),
    drop: path.join(root, 'old-object-controlled-drop-migration.sql'),
  };
  const withPaths = {
    ...bundle,
    ddlExportPath: files.ddl,
    rollbackPath: files.rollback,
    controlledDropPath: files.drop,
  };
  await writeJson(files.bundle, withPaths);
  await writeFile(files.ddl, sql.ddl ?? 'CREATE TABLE public.legacy_scope_objects (id uuid PRIMARY KEY);\n', 'utf8');
  await writeFile(files.rollback, sql.rollback ?? '-- rollback approval window\nCREATE TABLE public.legacy_scope_objects (id uuid PRIMARY KEY);\n', 'utf8');
  await writeFile(files.drop, sql.drop ?? '-- approval window rollback owner recorded\nDROP TABLE IF EXISTS public.legacy_scope_objects RESTRICT;\n', 'utf8');
  return files;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function candidateBundle() {
  return {
    databaseTarget: 'env://server/.env#SUPABASE_MIGRATION_URL',
    candidateObject: 'public.legacy_scope_objects',
    rowCount: 0,
    catalogReadback: { status: 'pass', objectCount: 1 },
    dependencyReadback: { status: 'pass', runtimeReferences: [] },
    ddlExportPath: 'old-object-ddl-export.sql',
    rollbackPath: 'old-object-rollback-plan.sql',
    approvalRef: 'approval://old-object',
    migrationWindow: 'window://2026-06-29T07:00:00Z',
    postDropSmokePath: 'old-object-post-drop-api-browser-smoke.json',
    candidates: [{
      objectName: 'public.legacy_scope_objects',
      rowCount: 0,
      dependencyReadback: { status: 'pass' },
      catalogReadback: { status: 'pass' },
      approvalRef: 'approval://old-object',
    }],
  };
}
