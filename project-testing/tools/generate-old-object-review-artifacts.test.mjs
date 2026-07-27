import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  generateOldObjectReviewArtifacts,
  parseArgs,
} from './generate-old-object-review-artifacts.mjs';
import { validateReleaseEvidence } from './validate-release-evidence.mjs';

test('old-object review generator writes review artifacts without executing DROP', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-old-object-review-'));
  const calls = [];
  const queryExec = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('to_regclass')) {
      return [{
        object_oid: '12345',
        schema_name: 'public',
        object_name: 'legacy_scope_objects',
        relkind: 'r',
        relation_type: 'table',
      }];
    }
    if (sql.includes('count(*)::bigint')) return [{ row_count: '0' }];
    if (sql.includes('information_schema.columns')) {
      return [
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO', column_default: null },
        { column_name: 'name', data_type: 'text', is_nullable: 'YES', column_default: null },
      ];
    }
    if (sql.includes('pg_constraint')) return [];
    if (sql.includes('pg_indexes')) return [];
    if (sql.includes('pg_depend')) return [];
    return [];
  };

  try {
    const result = await generateOldObjectReviewArtifacts({
      artifactRoot: root,
      databaseTarget: 'env://server/.env#SUPABASE_MIGRATION_URL',
      candidateObjects: ['public.legacy_scope_objects'],
      approvalRef: 'approval://manual-old-object-review',
      migrationWindow: 'window://2026-06-29T06:00:00Z',
      backupLocationRef: 'backup://old-object/legacy_scope_objects',
      queryExec,
      now: new Date('2026-06-29T06:00:00.000Z'),
    });

    assert.equal(result.status, 'review_ready');
    assert.equal(result.dbMutation, false);
    assert.ok(!calls.some((call) => /\bdrop\s+/i.test(call.sql)));

    const candidates = JSON.parse(await readFile(path.join(root, 'old-object-drop-candidates.json'), 'utf8'));
    const rowcount = JSON.parse(await readFile(path.join(root, 'old-object-rowcount-and-catalog-readback.json'), 'utf8'));
    const dependency = JSON.parse(await readFile(path.join(root, 'old-object-dependency-readback.json'), 'utf8'));
    const summary = JSON.parse(await readFile(path.join(root, 'old-object-physical-drop-summary.json'), 'utf8'));
    const ddl = await readFile(path.join(root, 'old-object-ddl-export.sql'), 'utf8');
    const rollback = await readFile(path.join(root, 'old-object-rollback-plan.sql'), 'utf8');
    const migration = await readFile(path.join(root, 'old-object-controlled-drop-migration.sql'), 'utf8');

    assert.equal(candidates.status, 'review_ready');
    assert.equal(candidates.candidates[0].objectName, 'public.legacy_scope_objects');
    assert.equal(rowcount.rowCount, 0);
    assert.equal(rowcount.catalogReadback.status, 'pass');
    assert.equal(dependency.dependencyReadback.status, 'pass');
    assert.equal(summary.postDropSmokeMissing, true);
    assert.equal(summary.dbMutation, false);
    assert.match(ddl, /CREATE TABLE IF NOT EXISTS public\.legacy_scope_objects/i);
    assert.match(rollback, /CREATE TABLE IF NOT EXISTS public\.legacy_scope_objects/i);
    assert.match(migration, /DROP TABLE IF EXISTS public\.legacy_scope_objects RESTRICT/i);

    const validation = await validateReleaseEvidence({
      gateId: 'old-object-physical-drop-closeout',
      evidenceRoot: root,
      now: new Date('2026-06-29T06:01:00.000Z'),
    });

    assert.equal(validation.status, 'fail');
    assert.equal(validation.counts.expectedArtifactsPresent, 9);
    assert.equal(validation.counts.contentCheckFailures, 0);
    assert.ok(validation.failures.some((failure) => failure.code === 'reject-marker-present'
      && failure.detail === 'post-drop-smoke-missing'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('old-object review generator fails closed without explicit candidates', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-old-object-review-empty-'));

  try {
    const result = await generateOldObjectReviewArtifacts({
      artifactRoot: root,
      databaseTarget: 'env://server/.env#SUPABASE_MIGRATION_URL',
      candidateObjects: [],
      queryExec: async () => {
        throw new Error('queryExec must not run without candidates');
      },
      now: new Date('2026-06-29T06:05:00.000Z'),
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.dbMutation, false);

    const summary = JSON.parse(await readFile(path.join(root, 'old-object-physical-drop-summary.json'), 'utf8'));
    assert.equal(summary.candidateObject, 'no-approved-drop-candidate');
    assert.ok(summary.reasons.includes('candidate_object_required'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('old-object review generator argument parser accepts read-only review inputs', () => {
  const parsed = parseArgs([
    '--artifact-root',
    'project-testing/reports/handoff',
    '--candidate-object',
    'public.legacy_scope_objects',
    '--include-db',
    '--confirm-db-ready',
    '--review-only',
    '--approval-ref',
    'approval://manual',
    '--migration-window',
    'window://2026-06-29T06:00:00Z',
  ]);

  assert.equal(parsed.includeDb, true);
  assert.equal(parsed.confirmDbReady, true);
  assert.equal(parsed.reviewOnly, true);
  assert.deepEqual(parsed.candidateObjects, ['public.legacy_scope_objects']);
  assert.match(parsed.artifactRoot, /handoff$/);
});
