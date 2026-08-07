import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  normalizePgConnectionStringForLivegate,
  runProductionLivegateEvidence,
} from './run-production-livegate-evidence.mjs';
import { hashC19RuntimeConsumerLedgerRows } from './check-c19-runtime-preflight.mjs';
import { readProjectBusinessResidueReadback } from './project-residue-policy.mjs';

const RELEASE_SHA = 'a'.repeat(40);
const PROJECT_ID = '00000000-0000-4000-8000-000000000101';
const GENERATION_BATCH_ID = 'production-livegate-generation-1';
const RUNTIME_CALL_ROWS = [{
  id: '00000000-0000-4000-8000-000000000201',
  consumer_key: 'wbsTemplateGenerationService',
  runtime_entry_ref: 'wbsTemplateGenerationService:generateWbsTemplateRows',
  call_status: 'called',
  call_context: {
    projectId: PROJECT_ID,
    generationBatchId: GENERATION_BATCH_ID,
    runtimeAssetMode: 'no_published_artifact',
    runtimeArtifactCount: 0,
    runtimeArtifactPublicationKeys: [],
  },
  source_evidence_refs: ['wbs_template_generation:production-livegate'],
  called_at: new Date('2026-07-01T01:59:00.000Z'),
}];
const RUNTIME_OBSERVATION_ROWS = [];

test('production livegate normalizes sslmode=require before opening a non-verifying Supabase pg connection', () => {
  const normalized = normalizePgConnectionStringForLivegate(
    'postgres://user:secret@example.invalid:6543/postgres?sslmode=require&application_name=workbuddy',
    { rejectUnauthorized: false },
  );

  assert.equal(
    normalized,
    'postgres://user:secret@example.invalid:6543/postgres?sslmode=no-verify&application_name=workbuddy',
  );
});

test('production livegate uses a session temp probe and validates canonical wizard/WBS evidence', async () => {
  const artifactRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-livegate-'));
  const handoffFile = path.join(artifactRoot, 'handoff.json');
  const canonicalWizardSmokeFile = path.join(artifactRoot, 'production-wizard-smoke.json');

  try {
    await writeJson(handoffFile, buildHandoff());
    await writeJson(canonicalWizardSmokeFile, buildCanonicalWizardSmoke());
    const env = {
      SUPABASE_MIGRATION_URL: 'postgres://postgres.wwdrkjnbvcbfytwnnyvs:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
    };
    const fakeClient = new FakePgClient({
      relations: [
        { schema_name: 'public', object_name: 'projects', relkind: 'r', comment: null, rowCount: 3 },
        { schema_name: 'public', object_name: 'tasks', relkind: 'r', comment: null, rowCount: 12 },
      ],
    });
    const result = await runProductionLivegateEvidence({
      env,
      envFile: 'deploy/env/server.production.env',
      handoffFile,
      artifactRoot,
      canonicalWizardSmokeFile,
      includeLive: true,
      confirmLiveHandoff: true,
      includeDb: true,
      confirmDbReady: true,
      gateIds: [
        'c18-l07-l15-live-diagnostics',
        'c19-runtime-publication-release-rollback',
        'old-object-physical-drop-closeout',
      ],
      dbClientFactory: () => fakeClient,
      now: new Date('2026-07-01T02:00:00.000Z'),
    });

    const earlyC19Validation = await readJson(
      path.join(artifactRoot, 'c19-runtime-publication-release-rollback-evidence-validation.json'),
    );
    assert.equal(result.status, 'pass', JSON.stringify({ result, earlyC19Validation }, null, 2));
    assert.equal(result.mayCloseAll, true);
    assert.deepEqual(result.openGateIds, []);

    const closeout = await readJson(path.join(artifactRoot, 'old-object-no-safe-candidate-closeout.json'));
    const discovery = await readJson(path.join(artifactRoot, 'old-object-candidate-discovery.all.json'));
    const c18Summary = await readJson(path.join(artifactRoot, 'c18-live-evidence-summary.json'));
    const c19Smoke = await readJson(path.join(artifactRoot, 'wizard-baseline-revision-live.json'));
    const c19Cleanup = await readJson(path.join(artifactRoot, 'wizard-baseline-revision-cleanup-readback.json'));
    const c19Preflight = await readJson(path.join(artifactRoot, 'c19-canonical-wizard-preflight.json'));
    const c19Validation = await readJson(path.join(artifactRoot, 'c19-runtime-publication-release-rollback-evidence-validation.json'));
    const serialized = await readFile(path.join(artifactRoot, 'production-livegate-execution-summary.json'), 'utf8');

    assert.equal(closeout.status, 'pass');
    assert.equal(closeout.closeoutMode, 'no_safe_candidate');
    assert.equal(closeout.physicalDropExecuted, false);
    assert.equal(discovery.inspectedCount, 2);
    assert.equal(c18Summary.status, 'pass');
    assert.equal(c18Summary.dbMutation, true);
    assert.equal(c18Summary.cleanupReadback.status, 'pass');
    assert.equal(c18Summary.boundary.probeStorage, 'session_temp_only');
    assert.equal(c18Summary.cleanupReadback.persistentResidual, 0);
    assert.equal(c19Smoke.productionLive, true);
    assert.equal(c19Smoke.status, 'pass');
    assert.equal(c19Cleanup.projectPhysicallyDeleted, true);
    assert.equal(c19Cleanup.projectResidueReadback.status, 'pass');
    assert.equal(c19Cleanup.projectResidueReadback.scannedTableCount, 2);
    assert.equal(c19Cleanup.projectResidueReadback.totalBusinessResidueCount, 0);
    assert.deepEqual(c19Cleanup.projectResidueReadback.nonZeroBusinessTables, []);
    assert.deepEqual(c19Cleanup.projectResidueReadback.retainedHistoricalResidue, [
      { tableName: 'operation_logs', rowCount: 2 },
    ]);
    assert.equal(c19Preflight.status, 'ready');
    assert.equal(c19Preflight.readiness.canonicalWizardCommitReady, true);
    assert.equal(c19Preflight.readiness.baselineRevisionRollbackReady, true);
    assert.equal(c19Preflight.readiness.cleanupReady, true);
    assert.equal(c19Preflight.readiness.runtimeConsumerCallDeltaReady, true);
    assert.equal(c19Preflight.readiness.runtimeConsumerObservationDeltaReady, true);
    assert.match(c19Preflight.canonicalWizardSmokeInputSha256, /^[0-9a-f]{64}$/u);
    assert.match(
      c19Preflight.canonicalWizardWbsReadiness.canonicalWizardSmokeFile,
      /inputs[\\/]c19-wizard-smoke-[0-9a-f]{64}\.json$/u,
    );
    assert.equal(c19Validation.status, 'pass');
    assert.equal(fakeClient.queries.some((query) => (
      /delete\s+from\s+public\.runtime_consumer_(?:runtime_calls|observations)/iu.test(query.sql)
    )), false);
    assert.equal(serialized.includes('postgres://'), false);
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }
});

test('project residue scan is type-aware and fails closed on incomplete table readback', async () => {
  const queries = [];
  const queryExec = async (sql) => {
    queries.push(sql);
    if (sql.includes('information_schema.columns')) {
      return [
        { table_name: 'legacy_text_project_rows', data_type: 'text', udt_name: 'text' },
        { table_name: 'tasks', data_type: 'uuid', udt_name: 'uuid' },
      ];
    }
    if (sql.includes('workbuddy_c19_project_residue_scan')) {
      return [{ table_name: 'tasks', residue_count: 0 }];
    }
    throw new Error(`Unexpected residue query: ${sql}`);
  };

  const readback = await readProjectBusinessResidueReadback(queryExec, { projectId: PROJECT_ID });
  const countQuery = queries.find((sql) => sql.includes('workbuddy_c19_project_residue_scan'));

  assert.match(
    countQuery,
    /FROM public\."legacy_text_project_rows"[\s\S]*?project_id::text = \$1/u,
  );
  assert.match(countQuery, /FROM public\."tasks"[\s\S]*?project_id = \$1::uuid/u);
  assert.equal(readback.status, 'blocked');
  assert.equal(readback.reason, 'project_residue_scan_count_readback_incomplete');
});

test('project residue scan retains duration learning outbox tombstones as historical audit residue', async () => {
  const projectResidues = {
    duration_learning_runtime_evidence_outbox_tombstones: 1,
    tasks: 0,
  };
  const queryExec = async (sql) => {
    if (sql.includes('information_schema.columns')) {
      return Object.keys(projectResidues).sort().map((tableName) => ({
        table_name: tableName,
        data_type: 'uuid',
        udt_name: 'uuid',
      }));
    }
    if (sql.includes('workbuddy_c19_project_residue_scan')) {
      return Object.entries(projectResidues).map(([tableName, residueCount]) => ({
        table_name: tableName,
        residue_count: residueCount,
      }));
    }
    throw new Error(`Unexpected residue query: ${sql}`);
  };

  const readback = await readProjectBusinessResidueReadback(queryExec, { projectId: PROJECT_ID });

  assert.equal(readback.status, 'pass');
  assert.equal(readback.reason, null);
  assert.deepEqual(readback.retainedHistoricalResidue, [
    { tableName: 'duration_learning_runtime_evidence_outbox_tombstones', rowCount: 1 },
  ]);
  assert.equal(readback.totalRetainedHistoricalResidueCount, 1);
  assert.deepEqual(readback.nonZeroBusinessTables, []);
  assert.equal(readback.totalBusinessResidueCount, 0);
});

test('production livegate workflow runs a same-SHA disposable wizard smoke with always cleanup and canonical handoff', async () => {
  const workflow = await readFile(
    path.resolve('.github/workflows/production-livegate-execution.yml'),
    'utf8',
  );
  const matrix = JSON.parse(await readFile(
    path.resolve('project-testing/matrix/release-test-matrix.json'),
    'utf8',
  ));

  for (const requiredSource of [
    'production_mutation_approval',
    'I_APPROVE_DISPOSABLE_PRODUCTION_WIZARD_SMOKE',
    '/api/readyz',
    'readiness.build?.releaseSha',
    'readiness.build?.deployTarget',
    'readiness.build?.supabaseProjectRef',
    'readiness.build?.databaseProjectRef',
    '${{ github.sha }}',
    'scripts/run-wizard-baseline-revision-staging.mjs',
    '--target-environment production',
    '--deployed-readiness-file',
    '--production-mutation-approval',
    '--cleanup-report',
    'if: always()',
    'check-c19-runtime-preflight.mjs',
    'project-residue-policy.mjs',
    '--wizard-smoke-file',
    '--expected-environment production',
    '--expected-release-sha',
    '--expected-project-ref',
    'production-wizard-smoke.json',
    'exit "$livegate_status"',
  ]) {
    assert.ok(workflow.includes(requiredSource), requiredSource);
  }
  assert.equal(workflow.includes('deployed_staging_private_server'), false);
  assert.equal(workflow.includes('ssh-keyscan'), false);
  assert.match(workflow, /if \[ -z "\$DEPLOY_KNOWN_HOSTS" \]/u);
  const c19Gate = matrix.gateGroups.find(
    (gate) => gate.id === 'c19-runtime-publication-release-rollback',
  );
  assert.ok(c19Gate.artifactValidationPolicy.requiredMetadata.includes('projectResidueReadback'));
  assert.ok(c19Gate.artifactValidationPolicy.rejectIf.includes('disposable-project-residue'));
});

test('production C19 writes only blocked artifacts for an invalid smoke', async () => {
  const artifactRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-livegate-invalid-smoke-'));
  const handoffFile = path.join(artifactRoot, 'handoff.json');
  const smokeFile = path.join(artifactRoot, 'source-smoke.json');
  const fakeClient = new FakePgClient({ relations: [] });

  try {
    const smoke = buildCanonicalWizardSmoke();
    smoke.productionLive = false;
    smoke.environmentClassification = 'deployed_staging_private_server';
    await writeJson(handoffFile, buildHandoff());
    await writeJson(smokeFile, smoke);

    const result = await runProductionLivegateEvidence({
      env: {
        SUPABASE_MIGRATION_URL: 'postgres://postgres.wwdrkjnbvcbfytwnnyvs:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
      },
      envFile: 'deploy/env/server.production.env',
      handoffFile,
      artifactRoot,
      canonicalWizardSmokeFile: smokeFile,
      includeLive: true,
      confirmLiveHandoff: true,
      includeDb: true,
      confirmDbReady: true,
      gateIds: ['c19-runtime-publication-release-rollback'],
      dbClientFactory: () => fakeClient,
    });

    assert.equal(result.status, 'fail');
    for (const artifactName of [
      'wizard-baseline-revision-live.json',
      'wizard-baseline-revision-cleanup-readback.json',
      'c19-canonical-wizard-preflight.json',
    ]) {
      const artifact = await readJson(path.join(artifactRoot, artifactName));
      assert.equal(artifact.status, 'blocked', artifactName);
      assert.equal(artifact.liveMutation, false, artifactName);
      assert.equal(artifact.dbMutation, false, artifactName);
    }
    assert.equal(fakeClient.queries.length, 0);
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }
});

test('production C19 does not infer mutation from production labels without commit proof', async () => {
  const artifactRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-livegate-no-commit-'));
  const handoffFile = path.join(artifactRoot, 'handoff.json');
  const smokeFile = path.join(artifactRoot, 'source-smoke.json');
  const fakeClient = new FakePgClient({ relations: [] });

  try {
    const smoke = buildCanonicalWizardSmoke();
    delete smoke.steps.commitWizardGeneration;
    await writeJson(handoffFile, buildHandoff());
    await writeJson(smokeFile, smoke);
    const result = await runProductionLivegateEvidence({
      env: {
        SUPABASE_MIGRATION_URL: 'postgres://postgres.wwdrkjnbvcbfytwnnyvs:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
      },
      envFile: 'deploy/env/server.production.env',
      handoffFile,
      artifactRoot,
      canonicalWizardSmokeFile: smokeFile,
      includeLive: true,
      confirmLiveHandoff: true,
      includeDb: true,
      confirmDbReady: true,
      gateIds: ['c19-runtime-publication-release-rollback'],
      dbClientFactory: () => fakeClient,
    });

    assert.equal(result.status, 'fail');
    const c19GateResult = result.gateResults.find(
      (gate) => gate.gateId === 'c19-runtime-publication-release-rollback',
    );
    assert.equal(c19GateResult.status, 'blocked');
    assert.equal(c19GateResult.mutationOccurred, false);
    assert.equal(c19GateResult.liveMutation, false);
    assert.equal(c19GateResult.dbMutation, false);
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }
});

test('production C19 rejects a selected database target from another project before connect or query', async () => {
  const artifactRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-livegate-wrong-db-'));
  const handoffFile = path.join(artifactRoot, 'handoff.json');
  const smokeFile = path.join(artifactRoot, 'source-smoke.json');
  const fakeClient = new FakePgClient({ relations: [] });

  try {
    await writeJson(handoffFile, buildHandoff());
    await writeJson(smokeFile, buildCanonicalWizardSmoke());
    const result = await runProductionLivegateEvidence({
      env: {
        SUPABASE_MIGRATION_URL: 'postgres://postgres.xemqmqpifsstkovbkatp:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
      },
      envFile: 'deploy/env/server.production.env',
      handoffFile,
      artifactRoot,
      canonicalWizardSmokeFile: smokeFile,
      includeLive: true,
      confirmLiveHandoff: true,
      includeDb: true,
      confirmDbReady: true,
      gateIds: ['c19-runtime-publication-release-rollback'],
      dbClientFactory: () => fakeClient,
    });

    assert.equal(result.status, 'fail');
    assert.equal(fakeClient.connectCount, 0);
    assert.equal(fakeClient.queries.length, 0);
    assert.equal((await readJson(path.join(artifactRoot, 'wizard-baseline-revision-live.json'))).status, 'blocked');
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }
});

test('production C19 blocks when API cleanup leaves project-scoped business residue', async () => {
  const artifactRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-production-livegate-residue-'));
  const handoffFile = path.join(artifactRoot, 'handoff.json');
  const smokeFile = path.join(artifactRoot, 'source-smoke.json');
  const fakeClient = new FakePgClient({
    relations: [],
    projectResidues: {
      notifications: 1,
      operation_logs: 3,
    },
  });

  try {
    await writeJson(handoffFile, buildHandoff());
    await writeJson(smokeFile, buildCanonicalWizardSmoke());
    const result = await runProductionLivegateEvidence({
      env: {
        SUPABASE_MIGRATION_URL: 'postgres://postgres.wwdrkjnbvcbfytwnnyvs:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
      },
      envFile: 'deploy/env/server.production.env',
      handoffFile,
      artifactRoot,
      canonicalWizardSmokeFile: smokeFile,
      includeLive: true,
      confirmLiveHandoff: true,
      includeDb: true,
      confirmDbReady: true,
      gateIds: ['c19-runtime-publication-release-rollback'],
      dbClientFactory: () => fakeClient,
    });

    assert.equal(result.status, 'fail');
    const c19GateResult = result.gateResults.find(
      (gate) => gate.gateId === 'c19-runtime-publication-release-rollback',
    );
    assert.equal(c19GateResult.status, 'blocked');
    assert.match(c19GateResult.reason, /disposable_project_business_residue/u);
    assert.equal(c19GateResult.liveMutation, true);
    assert.equal(c19GateResult.dbMutation, true);
    assert.equal(c19GateResult.mutationOccurred, true);
    const live = await readJson(path.join(artifactRoot, 'wizard-baseline-revision-live.json'));
    const cleanup = await readJson(
      path.join(artifactRoot, 'wizard-baseline-revision-cleanup-readback.json'),
    );
    assert.equal(live.status, 'blocked');
    assert.equal(live.productionLive, true);
    assert.equal(live.liveMutation, true);
    assert.equal(live.dbMutation, true);
    assert.equal(live.cleanup.status, 'pass');
    assert.equal(live.cleanup.projectPhysicallyDeleted, true);
    assert.equal(live.cleanup.projectUnreadable, true);
    assert.equal(cleanup.status, 'blocked');
    assert.equal(cleanup.productionLive, true);
    assert.equal(cleanup.liveMutation, true);
    assert.equal(cleanup.dbMutation, true);
    assert.equal(cleanup.mutationAttempted, true);
    assert.equal(cleanup.mutationOccurred, true);
    assert.equal(cleanup.projectPhysicallyDeleted, true);
    assert.equal(cleanup.projectUnreadable, true);
    assert.equal(cleanup.sourceCleanup.status, 'pass');
    assert.equal(cleanup.sourceCleanup.projectPhysicallyDeleted, true);
    assert.equal(cleanup.sourceCleanup.projectUnreadable, true);
    assert.equal(cleanup.projectResidueReadback.status, 'blocked');
    assert.equal(cleanup.projectResidueReadback.totalBusinessResidueCount, 1);
    assert.deepEqual(cleanup.projectResidueReadback.nonZeroBusinessTables, [
      { tableName: 'notifications', rowCount: 1 },
    ]);
    assert.deepEqual(cleanup.projectResidueReadback.retainedHistoricalResidue, [
      { tableName: 'operation_logs', rowCount: 3 },
    ]);
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
    deployment: {
      environment: 'production',
      environmentClassification: 'deployed_production_private_server',
      releaseSha: RELEASE_SHA,
      supabaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
    },
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
          projectId: PROJECT_ID,
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

function buildCanonicalWizardSmoke() {
  return {
    source: 'wizard_baseline_revision_live_probe',
    environmentClassification: 'deployed_production_private_server',
    deployedStagingCode: false,
    productionLive: true,
    releaseSha: RELEASE_SHA,
    supabaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
    deployedReadiness: {
      releaseSha: RELEASE_SHA,
      deployTarget: 'production',
      supabaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
      databaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
    },
    status: 'pass',
    projectId: PROJECT_ID,
    generationBatchId: GENERATION_BATCH_ID,
    steps: {
      commitWizardGeneration: { status: 'pass', createdTaskCount: 72 },
      taskDependencyReadback: {
        status: 'pass',
        dependencyReadbackCount: 111,
        inventoryDependencyCount: 111,
        danglingDependencyCount: 0,
      },
      criticalPathReadback: {
        status: 'pass',
        calculationStatus: 'fresh',
        dependencyEdgeCount: 111,
        projectDurationDays: 420,
      },
      readCandidateBaseline: { status: 'pass', itemCount: 72 },
      publishBaseline: { status: 'pass', baselineStatus: 'confirmed' },
      startRevision: { status: 'pass', idempotent: true },
      rollbackRevisionDraft: {
        status: 'pass',
        revisionPhysicallyDeleted: true,
        confirmedBaselineStatus: 'confirmed',
      },
      runtimeConsumerLedgerReadback: {
        status: 'pass',
        appendOnly: true,
        projectId: PROJECT_ID,
        generationBatchId: GENERATION_BATCH_ID,
        callBefore: 0,
        callAfter: RUNTIME_CALL_ROWS.length,
        callDelta: RUNTIME_CALL_ROWS.length,
        observationBefore: 0,
        observationAfter: RUNTIME_OBSERVATION_ROWS.length,
        observationDelta: RUNTIME_OBSERVATION_ROWS.length,
        expectedPublicationKeys: [],
        publishedArtifactCount: 0,
        expectedObservationDelta: 0,
        callRowIds: RUNTIME_CALL_ROWS.map((row) => row.id),
        callRowsHash: hashC19RuntimeConsumerLedgerRows(RUNTIME_CALL_ROWS),
        observationRowIds: [],
        observationRowsHash: hashC19RuntimeConsumerLedgerRows([]),
        deleteMutationCount: 0,
      },
    },
    cleanup: {
      status: 'pass',
      projectPhysicallyDeleted: true,
      projectUnreadable: true,
    },
  };
}

class FakePgClient {
  constructor({ relations, projectResidues = { operation_logs: 2, tasks: 0 } }) {
    this.relations = relations;
    this.projectResidues = projectResidues;
    this.tempProbeRows = [];
    this.connected = false;
    this.connectCount = 0;
    this.queries = [];
  }

  async connect() {
    this.connectCount += 1;
    this.connected = true;
  }

  async end() {
    this.connected = false;
  }

  async query(sql, params = []) {
    this.queries.push({ sql, params });
    const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
    if (normalized === 'begin' || normalized === 'rollback') return { rows: [] };
    if (normalized.includes('create temp table workbuddy_production_livegate_probe')) return { rows: [] };
    if (normalized.includes('insert into workbuddy_production_livegate_probe')) {
      this.tempProbeRows = safeParseJson(params[0]);
      return { rows: this.tempProbeRows.map((row) => ({ item_id: row.item_id })) };
    }
    if (normalized.includes('delete from workbuddy_production_livegate_probe')) {
      const rows = this.tempProbeRows.map((row) => ({ item_id: row.item_id }));
      this.tempProbeRows = [];
      return { rows };
    }
    if (normalized.includes('from workbuddy_production_livegate_probe')) {
      return { rows: [{ row_count: this.tempProbeRows.length }] };
    }
    if (normalized.includes('from public.duration_experience_samples')) {
      return { rows: [{ duration_sample_count: 0, t2_window_sample_count: 0 }] };
    }
    if (normalized.includes('from public.tasks') && normalized.includes('completed_actual_task_count')) {
      return { rows: [{ completed_actual_task_count: 0, t2_metadata_task_count: 0 }] };
    }
    if (normalized.includes('from public.runtime_consumer_runtime_calls')) {
      return { rows: RUNTIME_CALL_ROWS };
    }
    if (normalized.includes('from public.runtime_consumer_observations')) {
      return { rows: RUNTIME_OBSERVATION_ROWS };
    }
    if (normalized.includes('workbuddy_c19_project_residue_scan')) {
      return {
        rows: Object.entries(this.projectResidues).map(([tableName, rowCount]) => ({
          table_name: tableName,
          residue_count: rowCount,
        })),
      };
    }
    if (normalized.includes('select pg_try_advisory_lock(hashtext($1))')) {
      return { rows: [{ acquired: true }] };
    }
    if (normalized.includes('select pg_advisory_unlock(hashtext($1))')) {
      return { rows: [{ released: true }] };
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
    if (normalized.includes('from information_schema.columns')
      && normalized.includes("column_name = 'project_id'")) {
      return {
        rows: Object.keys(this.projectResidues).sort().map((tableName) => ({
          table_name: tableName,
          data_type: tableName === 'operation_logs' ? 'text' : 'uuid',
          udt_name: tableName === 'operation_logs' ? 'text' : 'uuid',
        })),
      };
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
