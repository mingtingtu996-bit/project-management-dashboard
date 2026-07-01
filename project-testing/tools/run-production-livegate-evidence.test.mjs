import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runProductionLivegateEvidence } from './run-production-livegate-evidence.mjs';

test('production livegate writes no-safe old-object evidence and keeps missing live diagnostics blocked', async () => {
  const artifactRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-livegate-'));
  const handoffFile = path.join(artifactRoot, 'handoff.json');

  try {
    await writeJson(handoffFile, buildHandoff());
    const env = {
      SUPABASE_MIGRATION_URL: 'postgres://user@example.invalid:5432/postgres',
    };
    const result = await runProductionLivegateEvidence({
      env,
      envFile: 'deploy/env/server.production.env',
      handoffFile,
      artifactRoot,
      includeLive: true,
      confirmLiveHandoff: true,
      includeDb: true,
      confirmDbReady: true,
      gateIds: [
        'c18-l07-l15-live-diagnostics',
        'c19-runtime-publication-release-rollback',
        'old-object-physical-drop-closeout',
      ],
      dbClientFactory: () => new FakePgClient({
        relations: [
          { schema_name: 'public', object_name: 'projects', relkind: 'r', comment: null, rowCount: 3 },
          { schema_name: 'public', object_name: 'tasks', relkind: 'r', comment: null, rowCount: 12 },
        ],
      }),
      now: new Date('2026-07-01T02:00:00.000Z'),
    });

    assert.equal(result.status, 'fail');
    assert.equal(result.mayCloseAll, false);
    assert.deepEqual(result.openGateIds, [
      'c18-l07-l15-live-diagnostics',
      'c19-runtime-publication-release-rollback',
    ]);

    const closeout = await readJson(path.join(artifactRoot, 'old-object-no-safe-candidate-closeout.json'));
    const discovery = await readJson(path.join(artifactRoot, 'old-object-candidate-discovery.all.json'));
    const c18Summary = await readJson(path.join(artifactRoot, 'c18-live-evidence-summary.json'));
    const c19Summary = await readJson(path.join(artifactRoot, 'c19-live-evidence-summary.json'));
    const serialized = await readFile(path.join(artifactRoot, 'production-livegate-execution-summary.json'), 'utf8');

    assert.equal(closeout.status, 'pass');
    assert.equal(closeout.closeoutMode, 'no_safe_candidate');
    assert.equal(closeout.physicalDropExecuted, false);
    assert.equal(discovery.inspectedCount, 2);
    assert.equal(c18Summary.status, 'blocked');
    assert.equal(c19Summary.status, 'blocked');
    assert.equal(serialized.includes('postgres://'), false);
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }
});

test('production livegate does not write no-safe closeout when an old-object candidate exists', async () => {
  const artifactRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-livegate-candidate-'));
  const handoffFile = path.join(artifactRoot, 'handoff.json');

  try {
    await writeJson(handoffFile, buildHandoff());
    const result = await runProductionLivegateEvidence({
      env: { DB_CONNECTION_STRING: 'postgres://user@example.invalid:5432/postgres' },
      envFile: 'deploy/env/server.production.env',
      handoffFile,
      artifactRoot,
      includeLive: false,
      confirmLiveHandoff: false,
      includeDb: true,
      confirmDbReady: true,
      gateIds: ['old-object-physical-drop-closeout'],
      dbClientFactory: () => new FakePgClient({
        relations: [
          { schema_name: 'public', object_name: 'legacy_unused_table', relkind: 'r', comment: null, rowCount: 0 },
        ],
      }),
      now: new Date('2026-07-01T02:05:00.000Z'),
    });

    const discovery = await readJson(path.join(artifactRoot, 'old-object-candidate-discovery.all.json'));
    const guard = await readJson(path.join(artifactRoot, 'legacy-object-drop-guard.initial.json'));

    assert.equal(result.status, 'fail');
    assert.deepEqual(result.openGateIds, ['old-object-physical-drop-closeout']);
    assert.equal(discovery.status, 'candidate_found');
    assert.equal(discovery.candidateCount, 1);
    assert.equal(guard.candidates.length, 1);
    await assert.rejects(
      readJson(path.join(artifactRoot, 'old-object-no-safe-candidate-closeout.json')),
      /ENOENT/u,
    );
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }
});

function buildHandoff() {
  return {
    schemaVersion: 'workbuddy-release-handoff-input/v1',
    unlockFlags: {
      includeLive: true,
      confirmLiveHandoff: true,
      includeDb: true,
      confirmDbReady: true,
    },
    gates: {
      'c18-l07-l15-live-diagnostics': {
        live: {
          environmentOwner: 'github-actions-production-livegate',
          artifactRoot: 'project-testing/reports/production-livegate-test/artifacts',
        },
        targets: {
          projectId: 'project-1',
          planId: 'plan-1',
        },
      },
      'c19-runtime-publication-release-rollback': {
        live: {
          environmentOwner: 'github-actions-production-livegate',
          writeApprovalRef: 'github-actions://run/test',
        },
        targets: {
          companyId: 'company-1',
          projectId: 'project-1',
        },
        release: {
          phase1L5Ref: 'github-actions://run/test/phase1-l5',
          releaseClosureArtifactRef: 'github-actions://run/test/release-closure',
          rollbackTargetRef: 'github-actions://run/test/rollback',
          monitoringWindow: '2026-07-01T02:00:00.000Z/PT30M',
        },
        approvals: {
          manualApprovalRef: 'github-actions://run/test',
        },
        owners: {
          runtimePublicationOwner: 'github-actions-production-livegate',
          consumerObservationOwner: 'github-actions-production-livegate',
          monitoringOwner: 'github-actions-production-livegate',
          rollbackOwner: 'github-actions-production-livegate',
        },
      },
      'old-object-physical-drop-closeout': {
        db: {
          databaseTargetRef: 'env://deploy/env/server.production.env#SUPABASE_MIGRATION_URL',
        },
      },
    },
  };
}

class FakePgClient {
  constructor({ relations }) {
    this.relations = relations;
  }

  async connect() {}

  async end() {}

  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
    if (normalized.includes('from pg_depend')) {
      return { rows: [] };
    }
    if (normalized.includes('from pg_class c')) {
      return { rows: this.relations.map(({ rowCount, ...relation }) => relation) };
    }
    if (normalized.includes('select count(*)::int as row_count')) {
      const objectName = params.at(-1) ?? extractRelationName(sql);
      const relation = this.relations.find((item) => item.object_name === objectName);
      return { rows: [{ row_count: relation?.rowCount ?? 0 }] };
    }
    if (normalized.includes('from information_schema.columns')) {
      return { rows: [] };
    }
    throw new Error(`Unexpected fake query: ${sql}`);
  }
}

function extractRelationName(sql) {
  const match = sql.match(/"public"\."([^"]+)"/u);
  return match?.[1] ?? '';
}

async function writeJson(filePath, value) {
  await import('node:fs/promises').then(({ writeFile }) => writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8'));
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}
