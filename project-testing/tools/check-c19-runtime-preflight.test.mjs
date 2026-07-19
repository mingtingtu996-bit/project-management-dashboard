import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkC19RuntimePreflight,
  hashC19RuntimeConsumerLedgerRows,
  parseArgs,
  resolveC19SelectedDatabaseProjectRef,
} from './check-c19-runtime-preflight.mjs';
import { hashProjectBusinessResidueReadback } from './project-residue-policy.mjs';

const RELEASE_SHA = 'a'.repeat(40);
const PROJECT_REF = 'wwdrkjnbvcbfytwnnyvs';
const PROJECT_ID = '00000000-0000-4000-8000-000000000101';
const GENERATION_BATCH_ID = 'production-livegate-batch-1';
const CALL_ROWS = [{
  id: '00000000-0000-4000-8000-000000000201',
  consumer_key: 'wbsTemplateGenerationService',
  runtime_entry_ref: 'wbsTemplateGenerationService.generateWbsTemplateRows',
  call_status: 'called',
  call_context: {
    projectId: PROJECT_ID,
    generationBatchId: GENERATION_BATCH_ID,
    runtimeAssetMode: 'no_published_artifact',
    runtimeArtifactCount: 0,
    runtimeArtifactPublicationKeys: [],
  },
  source_evidence_refs: ['wbs_template_generation:fixture'],
  called_at: '2026-06-29T06:29:00.000Z',
}];
const OBSERVATION_ROWS = [];

test('C19 database identity rejects Supabase-shaped usernames on external hosts', () => {
  assert.equal(resolveC19SelectedDatabaseProjectRef({
    SUPABASE_MIGRATION_URL:
      `postgresql://postgres.${PROJECT_REF}:secret@external.example.com:5432/postgres`,
  }), null);
});

test('C19 canonical preflight treats learning samples as advisory but requires a wizard smoke', async () => {
  const queryExec = createQueryExec({ completedActualTaskCount: 90 });
  const report = await checkC19RuntimePreflight({
    projectId: 'project-1',
    queryExec,
    now: new Date('2026-06-29T06:30:00.000Z'),
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.dbMutation, false);
  assert.ok(report.reasonCodes.includes('canonical_wizard_smoke_file_required'));
  assert.ok(report.reasonCodes.includes('expected_environment_required'));
  assert.ok(report.reasonCodes.includes('expected_release_sha_required'));
  assert.ok(report.reasonCodes.includes('expected_project_ref_required'));
  assert.ok(report.advisoryCodes.includes('duration_experience_samples_missing'));
  assert.equal(report.taskReadiness.completedActualTaskCount, 0);
  assert.equal(queryExec.queryCount(), 0);
});

test('C19 production preflight binds canonical smoke identity, same SHA, cleanup, and append-only ledger deltas', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-preflight-'));
  const smokeFile = path.join(root, 'wizard-smoke.json');
  const output = path.join(root, 'c19-preflight.json');

  try {
    await writeJson(smokeFile, buildSmoke());
    const report = await checkC19RuntimePreflight({
      canonicalWizardSmokeFile: smokeFile,
      expectedEnvironment: 'production',
      expectedReleaseSha: RELEASE_SHA,
      expectedProjectRef: PROJECT_REF,
      output,
      queryExec: createQueryExec(),
      now: new Date('2026-06-29T06:30:00.000Z'),
    });

    assert.equal(report.status, 'ready');
    assert.deepEqual(report.reasonCodes, []);
    assert.equal(report.canonicalWizardWbsReadiness.productionLive, true);
    assert.equal(report.canonicalWizardWbsReadiness.releaseSha, RELEASE_SHA);
    assert.equal(report.readiness.runtimeConsumerCallDeltaReady, true);
    assert.equal(report.readiness.runtimeConsumerObservationDeltaReady, true);
    assert.equal(report.canonicalWizardWbsReadiness.runtimeConsumerLedger.callDelta, CALL_ROWS.length);
    assert.equal(report.canonicalWizardWbsReadiness.runtimeConsumerLedger.observationDelta, 0);

    const written = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(written.status, 'ready');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 production preflight rejects staging, stale SHA, and inconsistent observation claims', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-preflight-negative-'));
  const smokeFile = path.join(root, 'wizard-smoke.json');

  try {
    const cases = [
      {
        mutate: (smoke) => { smoke.productionLive = false; smoke.environmentClassification = 'deployed_staging_private_server'; },
        reason: 'canonical_wizard_smoke_not_production',
      },
      {
        mutate: (smoke) => { smoke.environmentClassification = 'not-production-but-contains-production'; },
        reason: 'canonical_wizard_smoke_not_production',
      },
      {
        mutate: (smoke) => { smoke.releaseSha = 'b'.repeat(40); },
        reason: 'canonical_wizard_smoke_release_sha_mismatch',
      },
      {
        mutate: (smoke) => { smoke.steps.runtimeConsumerLedgerReadback.callRowsHash = 'f'.repeat(64); },
        reason: 'canonical_runtime_consumer_ledger_hash_mismatch',
      },
    ];

    for (const item of cases) {
      const smoke = buildSmoke();
      item.mutate(smoke);
      await writeJson(smokeFile, smoke);
      const report = await checkC19RuntimePreflight({
        canonicalWizardSmokeFile: smokeFile,
        expectedEnvironment: 'production',
        expectedReleaseSha: RELEASE_SHA,
        expectedProjectRef: PROJECT_REF,
        queryExec: createQueryExec(),
      });
      assert.equal(report.status, 'blocked');
      assert.ok(report.reasonCodes.includes(item.reason), JSON.stringify(report.reasonCodes));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 production preflight rejects API-only cleanup without zero business residue readback', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-preflight-residue-'));
  const smokeFile = path.join(root, 'wizard-smoke.json');

  try {
    const projectResidues = { notifications: 1, operation_logs: 1 };
    const smoke = buildSmoke({ projectResidues });
    await writeJson(smokeFile, smoke);
    const report = await checkC19RuntimePreflight({
      canonicalWizardSmokeFile: smokeFile,
      expectedEnvironment: 'production',
      expectedReleaseSha: RELEASE_SHA,
      expectedProjectRef: PROJECT_REF,
      queryExec: createQueryExec({ projectResidues }),
    });

    assert.equal(report.status, 'blocked');
    assert.ok(report.reasonCodes.includes('canonical_project_business_residue_present'));
    assert.equal(report.readiness.cleanupReady, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 ledger hashing preserves timestamptz values returned as Date objects', () => {
  const first = hashC19RuntimeConsumerLedgerRows([{
    ...CALL_ROWS[0],
    called_at: new Date('2026-06-29T06:29:00.000Z'),
  }]);
  const sameAsIsoText = hashC19RuntimeConsumerLedgerRows([{
    ...CALL_ROWS[0],
    called_at: '2026-06-29T06:29:00.000Z',
  }]);
  const later = hashC19RuntimeConsumerLedgerRows([{
    ...CALL_ROWS[0],
    called_at: new Date('2026-06-29T06:29:01.000Z'),
  }]);

  assert.equal(first, sameAsIsoText);
  assert.notEqual(first, later);
});

test('C19 production preflight rejects observation rows that are not declared by canonical runtime calls', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-preflight-forged-observation-'));
  const smokeFile = path.join(root, 'wizard-smoke.json');
  const forgedObservationRows = [{
    id: '00000000-0000-4000-8000-000000000301',
    asset_key: 'wbs_reference_days',
    publication_key: 'forged-publication-key',
    consumer_key: 'wbsTemplateGenerationService',
    consumer_surface: 'wbs_template_generation',
    observation_status: 'consumed',
    observation_context: { projectId: PROJECT_ID, generationBatchId: GENERATION_BATCH_ID },
    source_evidence_refs: ['runtime_publication:wbs_reference_days:forged-publication-key'],
    observed_at: '2026-06-29T06:29:00.000Z',
  }];

  try {
    const smoke = buildSmoke({ observationRows: forgedObservationRows });
    await writeJson(smokeFile, smoke);
    const report = await checkC19RuntimePreflight({
      canonicalWizardSmokeFile: smokeFile,
      expectedEnvironment: 'production',
      expectedReleaseSha: RELEASE_SHA,
      expectedProjectRef: PROJECT_REF,
      queryExec: createQueryExec({ observationRows: forgedObservationRows }),
    });

    assert.equal(report.status, 'blocked');
    assert.ok(report.reasonCodes.includes('canonical_runtime_consumer_publication_keys_mismatch'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 production preflight rejects project-ref and readyz identity mismatches before DB queries', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-preflight-project-ref-'));
  const smokeFile = path.join(root, 'wizard-smoke.json');
  const cases = [
    {
      mutate: (smoke) => { smoke.supabaseProjectRef = 'xemqmqpifsstkovbkatp'; },
      queryProjectRef: PROJECT_REF,
      reason: 'canonical_wizard_smoke_project_ref_mismatch',
    },
    {
      mutate: (smoke) => { smoke.deployedReadiness.supabaseProjectRef = 'xemqmqpifsstkovbkatp'; },
      queryProjectRef: PROJECT_REF,
      reason: 'canonical_wizard_smoke_readyz_project_ref_mismatch',
    },
    {
      mutate: (smoke) => { smoke.deployedReadiness.databaseProjectRef = 'xemqmqpifsstkovbkatp'; },
      queryProjectRef: PROJECT_REF,
      reason: 'canonical_wizard_smoke_readyz_database_project_ref_mismatch',
    },
    {
      mutate: () => {},
      queryProjectRef: 'xemqmqpifsstkovbkatp',
      reason: 'selected_database_project_ref_mismatch',
    },
  ];

  try {
    for (const item of cases) {
      const smoke = buildSmoke();
      item.mutate(smoke);
      await writeJson(smokeFile, smoke);
      const queryExec = createQueryExec({ targetProjectRef: item.queryProjectRef });
      const report = await checkC19RuntimePreflight({
        canonicalWizardSmokeFile: smokeFile,
        expectedEnvironment: 'production',
        expectedReleaseSha: RELEASE_SHA,
        expectedProjectRef: PROJECT_REF,
        queryExec,
      });

      assert.equal(report.status, 'blocked');
      assert.ok(report.reasonCodes.includes(item.reason), JSON.stringify(report.reasonCodes));
      assert.equal(queryExec.queryCount(), 0);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 preflight closes query executors that expose a close hook', async () => {
  let closed = false;
  const queryExec = createQueryExec();
  queryExec.close = async () => { closed = true; };

  await checkC19RuntimePreflight({ queryExec });

  assert.equal(closed, true);
});

test('C19 preflight argument parser accepts production identity inputs', () => {
  const parsed = parseArgs([
    '--wizard-smoke-file', 'project-testing/reports/wizard-smoke.json',
    '--expected-environment', 'production',
    '--expected-release-sha', RELEASE_SHA,
    '--expected-project-ref', PROJECT_REF,
    '--output', 'project-testing/reports/c19-preflight.json',
  ]);

  assert.equal(parsed.expectedEnvironment, 'production');
  assert.equal(parsed.expectedReleaseSha, RELEASE_SHA);
  assert.equal(parsed.expectedProjectRef, PROJECT_REF);
  assert.match(parsed.canonicalWizardSmokeFile, /wizard-smoke\.json$/);
  assert.match(parsed.output, /c19-preflight\.json$/);
});

function createQueryExec({
  completedActualTaskCount = 0,
  callRows = CALL_ROWS,
  observationRows = OBSERVATION_ROWS,
  targetProjectRef = PROJECT_REF,
  projectResidues = { operation_logs: 1, tasks: 0 },
} = {}) {
  let count = 0;
  const queryExec = async (sql) => {
    count += 1;
    if (sql.includes('FROM public.duration_experience_samples')) {
      return [{ duration_sample_count: 0, t2_window_sample_count: 0 }];
    }
    if (sql.includes('FROM public.tasks')) {
      return [{ completed_actual_task_count: completedActualTaskCount, t2_metadata_task_count: 0 }];
    }
    if (sql.includes('FROM public.runtime_consumer_runtime_calls')) return callRows;
    if (sql.includes('FROM public.runtime_consumer_observations')) return observationRows;
    if (sql.includes('information_schema.columns')) {
      return Object.keys(projectResidues).sort().map((tableName) => ({
        table_name: tableName,
        data_type: tableName === 'operation_logs' ? 'text' : 'uuid',
        udt_name: tableName === 'operation_logs' ? 'text' : 'uuid',
      }));
    }
    if (sql.includes('workbuddy_c19_project_residue_scan')) {
      return Object.entries(projectResidues).map(([tableName, residueCount]) => ({
        table_name: tableName,
        residue_count: residueCount,
      }));
    }
    return [];
  };
  queryExec.targetProjectRef = targetProjectRef;
  queryExec.queryCount = () => count;
  return queryExec;
}

function buildSmoke({
  callRows = CALL_ROWS,
  observationRows = OBSERVATION_ROWS,
  projectResidues = { operation_logs: 1, tasks: 0 },
} = {}) {
  const expectedPublicationKeys = Array.from(new Set(callRows.flatMap((row) => (
    row.call_context?.runtimeArtifactPublicationKeys ?? []
  )))).sort();
  return {
    source: 'wizard_baseline_revision_live_probe',
    environmentClassification: 'deployed_production_private_server',
    productionLive: true,
    releaseSha: RELEASE_SHA,
    supabaseProjectRef: PROJECT_REF,
    deployedReadiness: {
      releaseSha: RELEASE_SHA,
      deployTarget: 'production',
      supabaseProjectRef: PROJECT_REF,
      databaseProjectRef: PROJECT_REF,
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
        callAfter: callRows.length,
        callDelta: callRows.length,
        observationBefore: 0,
        observationAfter: observationRows.length,
        observationDelta: observationRows.length,
        expectedPublicationKeys,
        publishedArtifactCount: expectedPublicationKeys.length,
        expectedObservationDelta: expectedPublicationKeys.length,
        callRowIds: callRows.map((row) => row.id),
        callRowsHash: hashC19RuntimeConsumerLedgerRows(callRows),
        observationRowIds: observationRows.map((row) => row.id),
        observationRowsHash: hashC19RuntimeConsumerLedgerRows(observationRows),
        deleteMutationCount: 0,
      },
    },
    cleanup: {
      status: 'pass',
      projectPhysicallyDeleted: true,
      projectUnreadable: true,
      projectResidueReadback: buildProjectResidueReadback(projectResidues),
    },
  };
}

function buildProjectResidueReadback(projectResidues) {
  const scannedTables = Object.keys(projectResidues).sort();
  const retainedHistoricalResidue = scannedTables
    .filter((tableName) => tableName === 'operation_logs' && projectResidues[tableName] > 0)
    .map((tableName) => ({ tableName, rowCount: projectResidues[tableName] }));
  const nonZeroBusinessTables = scannedTables
    .filter((tableName) => tableName !== 'operation_logs' && projectResidues[tableName] > 0)
    .map((tableName) => ({ tableName, rowCount: projectResidues[tableName] }));
  const totalBusinessResidueCount = nonZeroBusinessTables.reduce((sum, row) => sum + row.rowCount, 0);
  const readback = {
    schemaVersion: 'workbuddy-project-residue-readback/v1',
    status: totalBusinessResidueCount === 0 ? 'pass' : 'blocked',
    reason: totalBusinessResidueCount === 0 ? null : 'disposable_project_business_residue',
    projectId: PROJECT_ID,
    scannedTableCount: scannedTables.length,
    scannedTables,
    retainedHistoricalProjectReferenceTables: ['operation_logs'],
    retainedHistoricalResidue,
    totalRetainedHistoricalResidueCount: retainedHistoricalResidue.reduce(
      (sum, row) => sum + row.rowCount,
      0,
    ),
    nonZeroBusinessTables,
    totalBusinessResidueCount,
    queryMutationCount: 0,
  };
  return { ...readback, readbackHash: hashProjectBusinessResidueReadback(readback) };
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
