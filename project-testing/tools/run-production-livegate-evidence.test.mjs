import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runProductionLivegateEvidence } from './run-production-livegate-evidence.mjs';

test('production livegate writes DB-backed C18/C19 evidence and no-safe old-object closeout', async () => {
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

    assert.equal(result.status, 'pass');
    assert.equal(result.mayCloseAll, true);
    assert.deepEqual(result.openGateIds, []);

    const closeout = await readJson(path.join(artifactRoot, 'old-object-no-safe-candidate-closeout.json'));
    const discovery = await readJson(path.join(artifactRoot, 'old-object-candidate-discovery.all.json'));
    const c18Summary = await readJson(path.join(artifactRoot, 'c18-live-evidence-summary.json'));
    const c19Apply = await readJson(path.join(artifactRoot, 'c19-runtime-publication-apply.json'));
    const c19Monitoring = await readJson(path.join(artifactRoot, 'c19-impact-monitoring-observation.json'));
    const c19Rollback = await readJson(path.join(artifactRoot, 'c19-runtime-rollback-saved-outcome.json'));
    const c19ConstructionOrganization = await readJson(path.join(artifactRoot, 'c19-construction-organization-e1-e3-e5.json'));
    const c19Summary = await readJson(path.join(artifactRoot, 'c19-live-evidence-summary.json'));
    const c19Validation = await readJson(path.join(artifactRoot, 'c19-runtime-publication-release-rollback-evidence-validation.json'));
    const serialized = await readFile(path.join(artifactRoot, 'production-livegate-execution-summary.json'), 'utf8');

    assert.equal(closeout.status, 'pass');
    assert.equal(closeout.closeoutMode, 'no_safe_candidate');
    assert.equal(closeout.physicalDropExecuted, false);
    assert.equal(discovery.inspectedCount, 2);
    assert.equal(c18Summary.status, 'pass');
    assert.equal(c18Summary.dbMutation, true);
    assert.equal(c18Summary.cleanupReadback.status, 'pass');
    assert.equal(c19Apply.result.status, 'runtime_apply_ready');
    assert.equal(c19Monitoring.result.status, 'runtime_event_recorded');
    assert.equal(c19Rollback.result.status, 'runtime_rollback_ready');
    assert.equal(c19ConstructionOrganization.status, 'pass');
    assert.equal(c19Summary.result.apply.status, 'runtime_apply_ready');
    assert.equal(c19Summary.result.constructionOrganization.status, 'pass');
    assert.equal(c19Summary.liveMutation, true);
    assert.equal(c19Summary.dbMutation, true);
    assert.equal(c19Validation.status, 'pass');
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
    this.events = [];
    this.publications = new Map();
    this.connected = false;
  }

  async connect() {
    this.connected = true;
  }

  async end() {
    this.connected = false;
  }

  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
    if (normalized.includes('select to_regclass($1)')) {
      const relationName = String(params[0] ?? '');
      const known = [
        'public.t2_rhythm_schedule_runtime_events',
        'public.t2_rhythm_schedule_runtime_publications',
      ];
      return { rows: [{ relation_name: known.includes(relationName) ? relationName : null }] };
    }
    if (normalized.includes('select pg_try_advisory_lock(hashtext($1))')) {
      return { rows: [{ acquired: true }] };
    }
    if (normalized.includes('select pg_advisory_unlock(hashtext($1))')) {
      return { rows: [{ released: true }] };
    }
    if (normalized.includes('insert into public.t2_rhythm_schedule_runtime_events')) {
      const event = {
        event_id: `event-${this.events.length + 1}`,
        event_type: params[0],
        event_status: params[1],
        source_publication_key: params[2],
        event_payload: safeParseJson(params[3]),
      };
      this.events.push(event);
      return { rows: [event] };
    }
    if (normalized.includes('delete from public.t2_rhythm_schedule_runtime_events')) {
      const sourceKey = params[0];
      const removed = this.events.filter((event) => event.source_publication_key === sourceKey);
      this.events = this.events.filter((event) => event.source_publication_key !== sourceKey);
      return { rows: removed.map((event) => ({ event_id: event.event_id })) };
    }
    if (normalized.includes('from public.t2_rhythm_schedule_runtime_events') && normalized.includes('group by')) {
      const sourceKey = params[0];
      const grouped = new Map();
      for (const event of this.events.filter((item) => item.source_publication_key === sourceKey)) {
        const key = `${event.event_type}:${event.event_status}`;
        grouped.set(key, {
          event_type: event.event_type,
          event_status: event.event_status,
          event_count: (grouped.get(key)?.event_count ?? 0) + 1,
        });
      }
      return { rows: [...grouped.values()] };
    }
    if (normalized.includes('from public.t2_rhythm_schedule_runtime_events') && normalized.includes('count(*)::int as event_count')) {
      const sourceKey = params[0];
      return { rows: [{ event_count: this.events.filter((event) => event.source_publication_key === sourceKey).length }] };
    }
    if (normalized.includes('insert into public.t2_rhythm_schedule_runtime_publications')) {
      const publication = {
        runtime_publication_id: `publication-${this.publications.size + 1}`,
        publication_key: params[0],
        runtime_publication_status: 'runtime_published',
        company_id: params[1],
        project_id: params[2],
        candidate_id: params[3],
        selected_template_ids: safeParseJson(params[4]),
        rollback_target: params[10],
      };
      this.publications.set(publication.publication_key, publication);
      return { rows: [publication] };
    }
    if (normalized.includes('update public.t2_rhythm_schedule_runtime_publications')) {
      const publicationKey = params[0];
      const publication = this.publications.get(publicationKey);
      if (!publication) return { rows: [] };
      publication.runtime_publication_status = 'runtime_rolled_back';
      publication.rollback_execution = safeParseJson(params[1]);
      publication.impact_monitoring = safeParseJson(params[2]);
      return { rows: [publication] };
    }
    if (normalized.includes('from public.t2_rhythm_schedule_runtime_publications')) {
      const publication = this.publications.get(params[0]);
      return { rows: publication ? [publication] : [] };
    }
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

function safeParseJson(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
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
