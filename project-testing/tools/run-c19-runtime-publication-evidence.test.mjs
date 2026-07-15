import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assessC19RuntimePublicationMigrationGovernance,
  parseArgs,
  runC19RuntimePublicationEvidence,
} from './run-c19-runtime-publication-evidence.mjs';
import { validateReleaseEvidence } from './validate-release-evidence.mjs';

test('C19 runtime evidence runner writes fail-closed artifacts by default without invoking writers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-runtime-blocked-'));
  const handoffFile = path.join(root, 'handoff.json');
  await writeFile(handoffFile, `${JSON.stringify(c19Handoff(), null, 2)}\n`, 'utf8');

  try {
    const result = await runC19RuntimePublicationEvidence({
      handoffFile,
      artifactRoot: root,
      now: new Date('2026-06-29T04:10:00.000Z'),
      runtimeWriter: async () => {
        throw new Error('runtime writer must not run without --allow-write');
      },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.liveMutation, false);
    assert.equal(result.dbMutation, false);
    assert.deepEqual(result.outputs.map((item) => path.basename(item.path)).sort(), [
      'c19-construction-organization-e1-e3-e5.json',
      'c19-impact-monitoring-observation.json',
      'c19-live-evidence-summary.json',
      'c19-manual-approval-preflight.json',
      'c19-release-closure-artifact.json',
      'c19-release-closure-verification.json',
      'c19-runtime-publication-apply.json',
      'c19-runtime-rollback-saved-outcome.json',
      'c19-t2-rhythm-live-replay.json',
    ]);

    const replay = JSON.parse(await readFile(path.join(root, 'c19-t2-rhythm-live-replay.json'), 'utf8'));
    const releaseArtifact = JSON.parse(await readFile(path.join(root, 'c19-release-closure-artifact.json'), 'utf8'));
    const releaseVerification = JSON.parse(await readFile(path.join(root, 'c19-release-closure-verification.json'), 'utf8'));
    const manualApproval = JSON.parse(await readFile(path.join(root, 'c19-manual-approval-preflight.json'), 'utf8'));
    const apply = JSON.parse(await readFile(path.join(root, 'c19-runtime-publication-apply.json'), 'utf8'));
    const monitoring = JSON.parse(await readFile(path.join(root, 'c19-impact-monitoring-observation.json'), 'utf8'));
    const rollback = JSON.parse(await readFile(path.join(root, 'c19-runtime-rollback-saved-outcome.json'), 'utf8'));
    const constructionOrganization = JSON.parse(await readFile(path.join(root, 'c19-construction-organization-e1-e3-e5.json'), 'utf8'));
    const summary = JSON.parse(await readFile(path.join(root, 'c19-live-evidence-summary.json'), 'utf8'));

    assert.equal(replay.missingReplaySamples, true);
    assert.equal(releaseArtifact.missingReleaseClosureArtifact, true);
    assert.equal(releaseVerification.missingReleaseClosureVerification, true);
    assert.equal(manualApproval.missingManualApproval, true);
    assert.equal(apply.missingRuntimeApply, true);
    assert.equal(monitoring.missingImpactMonitoring, true);
    assert.equal(rollback.missingRollbackOrSavedOutcome, true);
    assert.equal(constructionOrganization.missingConstructionOrganizationRuntimeEvidence, true);
    assert.equal(summary.generatedPackageOnly, true);
    assert.equal(summary.missingReplaySamples, true);
    assert.equal(summary.missingManualApproval, true);
    assert.equal(summary.missingRuntimeApply, true);
    assert.equal(apply.projectId, 'project-1');
    assert.equal(apply.phase1L5Ref, 'artifact://phase1-l5');
    assert.equal(apply.approvalRef, 'approval://manual');
    assert.equal(apply.monitoringWindow, '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z');
    assert.equal(apply.rollbackRef, 'rollback://target');
    assert.equal(apply.consumerObservationRef, 'operator://consumer-observation');

    const validation = await validateReleaseEvidence({
      gateId: 'c19-runtime-publication-release-rollback',
      evidenceRoot: root,
      now: new Date('2026-06-29T04:11:00.000Z'),
    });

    assert.equal(validation.status, 'fail');
    assert.equal(validation.counts.expectedArtifactsPresent, validation.counts.expectedArtifacts);
    assert.equal(validation.counts.requiredPatternsMatched, validation.counts.requiredPatterns);
    assert.ok(validation.failures.some((failure) => failure.code === 'reject-marker-present'
      && failure.detail === 'missing-runtime-apply'));
    assert.ok(validation.failures.some((failure) => failure.code === 'reject-marker-present'
      && failure.detail === 'missing-impact-monitoring'));
    assert.ok(validation.failures.some((failure) => failure.code === 'reject-marker-present'
      && failure.detail === 'missing-rollback-or-saved-outcome'));
    assert.ok(validation.failures.some((failure) => failure.code === 'reject-marker-present'
      && failure.detail === 'missing-manual-approval'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 runtime evidence runner records missing metadata reasons in fail-closed artifacts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-runtime-blocked-metadata-'));
  const handoffFile = path.join(root, 'handoff.json');
  const handoff = c19Handoff();
  handoff.gates['c19-runtime-publication-release-rollback'].release.phase1L5Ref = '';
  handoff.gates['c19-runtime-publication-release-rollback'].release.releaseClosureArtifactRef = '';
  handoff.gates['c19-runtime-publication-release-rollback'].release.monitoringWindow = '';
  await writeFile(handoffFile, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');

  try {
    const result = await runC19RuntimePublicationEvidence({
      handoffFile,
      artifactRoot: root,
      now: new Date('2026-06-29T04:12:00.000Z'),
    });

    assert.equal(result.status, 'blocked');

    const apply = JSON.parse(await readFile(path.join(root, 'c19-runtime-publication-apply.json'), 'utf8'));
    const summary = JSON.parse(await readFile(path.join(root, 'c19-live-evidence-summary.json'), 'utf8'));

    assert.ok(apply.metadataReasons.includes('phase1_l5_ref_required'));
    assert.ok(apply.metadataReasons.includes('release_package_id_required'));
    assert.ok(summary.metadataReasons.includes('monitoring_window_required'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 runtime evidence runner requires explicit live handoff and write approval for write mode', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-runtime-write-blocked-'));
  const handoffFile = path.join(root, 'handoff.json');
  const handoff = c19Handoff();
  handoff.unlockFlags.includeLive = false;
  await writeFile(handoffFile, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');

  try {
    await assert.rejects(
      runC19RuntimePublicationEvidence({
        handoffFile,
        artifactRoot: root,
        includeLive: true,
        confirmLiveHandoff: true,
        allowWrite: true,
        runtimeWriter: async () => {
          throw new Error('runtime writer must not run with failed handoff');
        },
      }),
      /handoff is not ready/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 runtime evidence runner can apply, monitor, and rollback through the runtime publication service', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-runtime-service-'));
  const handoffFile = path.join(root, 'handoff.json');
  const releaseArtifactFile = path.join(root, 'c19-release-closure-artifact.json');
  const releaseVerificationFile = path.join(root, 'c19-release-closure-verification.json');
  const phase1EvaluationFile = path.join(root, 'phase1-evaluation.json');
  const runtimeInputFile = path.join(root, 'runtime-input.json');
  const migrationGovernanceFile = path.join(root, 'migration-governance.json');
  await writeFile(handoffFile, `${JSON.stringify(c19Handoff(), null, 2)}\n`, 'utf8');
  await writeFile(releaseArtifactFile, `${JSON.stringify(readyArtifact(), null, 2)}\n`, 'utf8');
  await writeFile(releaseVerificationFile, `${JSON.stringify(passingVerification(), null, 2)}\n`, 'utf8');
  await writeFile(phase1EvaluationFile, `${JSON.stringify(readyEvaluation(), null, 2)}\n`, 'utf8');
  await writeFile(runtimeInputFile, `${JSON.stringify(runtimeInput(), null, 2)}\n`, 'utf8');
  await writeFile(migrationGovernanceFile, `${JSON.stringify(closedMigrationGovernanceReport(), null, 2)}\n`, 'utf8');

  const calls = [];
  const queryExec = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('FROM public.tasks') && sql.includes('planned_start_date')) {
      return [{
        id: '20000000-0000-4000-8000-000000000001',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-02',
        start_date: '2026-06-01',
        end_date: '2026-06-02',
      }, {
        id: '20000000-0000-4000-8000-000000000002',
        planned_start_date: '2026-06-03',
        planned_end_date: '2026-06-07',
        start_date: '2026-06-03',
        end_date: '2026-06-07',
      }];
    }
    if (sql.includes('FROM public.t2_rhythm_schedule_runtime_publications')) {
      return [{
        publication_key: 't2-rhythm-schedule-runtime:project-1:candidate-t2-runtime-1:2026-06-23T08:00:00.000Z',
        project_id: 'project-1',
        runtime_publication_status: 'runtime_published',
        applied_dependency_edges: [{
          taskId: '20000000-0000-4000-8000-000000000002',
          dependencyTaskId: '20000000-0000-4000-8000-000000000001',
          dependencyType: 'FS',
        }],
        applied_plan_date_patches: [{
          taskId: '20000000-0000-4000-8000-000000000001',
          previousPlannedStartDate: '2026-06-01',
          previousPlannedEndDate: '2026-06-02',
          previousStartDate: '2026-06-01',
          previousEndDate: '2026-06-02',
        }, {
          taskId: '20000000-0000-4000-8000-000000000002',
          previousPlannedStartDate: '2026-06-03',
          previousPlannedEndDate: '2026-06-07',
          previousStartDate: '2026-06-03',
          previousEndDate: '2026-06-07',
        }],
      }];
    }
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return [];
    if (sql.includes('INSERT INTO public.task_dependencies')) return [{ id: 'dep-1' }];
    if (sql.includes('UPDATE public.tasks')) return [{ id: params[1] }];
    if (sql.includes('INSERT INTO public.t2_rhythm_schedule_runtime_publications')) return [{ id: 'pub-1' }];
    if (sql.includes('UPDATE public.t2_rhythm_schedule_runtime_publications')) return [{ id: 'pub-1' }];
    if (sql.includes('UPDATE public.task_dependencies')) return [{ id: 'dep-1' }];
    if (sql.includes('INSERT INTO public.t2_rhythm_schedule_runtime_events')) return [{ id: 'evt-1' }];
    return [];
  };

  try {
    const result = await runC19RuntimePublicationEvidence({
      handoffFile,
      artifactRoot: root,
      includeLive: true,
      confirmLiveHandoff: true,
      allowWrite: true,
      releaseArtifactFile,
      releaseVerificationFile,
      phase1EvaluationFile,
      runtimeInputFile,
      migrationGovernanceFile,
      queryExec,
      now: new Date('2026-06-29T04:20:00.000Z'),
    });

    assert.equal(result.status, 'pass');
    assert.equal(result.liveMutation, true);
    assert.equal(result.dbMutation, true);

    const apply = JSON.parse(await readFile(path.join(root, 'c19-runtime-publication-apply.json'), 'utf8'));
    const monitoring = JSON.parse(await readFile(path.join(root, 'c19-impact-monitoring-observation.json'), 'utf8'));
    const rollback = JSON.parse(await readFile(path.join(root, 'c19-runtime-rollback-saved-outcome.json'), 'utf8'));
    const summary = JSON.parse(await readFile(path.join(root, 'c19-live-evidence-summary.json'), 'utf8'));

    assert.equal(apply.status, 'pass');
    assert.equal(apply.missingRuntimeApply, false);
    assert.equal(apply.result.status, 'runtime_apply_ready');
    assert.equal(monitoring.result.status, 'runtime_event_recorded');
    assert.equal(rollback.result.status, 'runtime_rollback_ready');
    assert.equal(summary.generatedPackageOnly, false);
    assert.equal(summary.missingRollbackOrSavedOutcome, false);
    assert.ok(calls.some((call) => call.sql.includes('INSERT INTO public.task_dependencies')));
    assert.ok(calls.some((call) => call.sql.includes('INSERT INTO public.t2_rhythm_schedule_runtime_events')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 runtime evidence runner keeps successful writer result blocked when required metadata is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-runtime-metadata-'));
  const handoffFile = path.join(root, 'handoff.json');
  const releaseArtifactFile = path.join(root, 'c19-release-closure-artifact.json');
  const releaseVerificationFile = path.join(root, 'c19-release-closure-verification.json');
  const phase1EvaluationFile = path.join(root, 'phase1-evaluation.json');
  const runtimeInputFile = path.join(root, 'runtime-input.json');
  const migrationGovernanceFile = path.join(root, 'migration-governance.json');
  const handoff = c19Handoff();
  handoff.gates['c19-runtime-publication-release-rollback'].release.monitoringWindow = '';
  await writeFile(handoffFile, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');
  await writeFile(releaseArtifactFile, `${JSON.stringify(readyArtifact(), null, 2)}\n`, 'utf8');
  await writeFile(releaseVerificationFile, `${JSON.stringify(passingVerification(), null, 2)}\n`, 'utf8');
  await writeFile(phase1EvaluationFile, `${JSON.stringify(readyEvaluation(), null, 2)}\n`, 'utf8');
  await writeFile(runtimeInputFile, `${JSON.stringify(runtimeInput(), null, 2)}\n`, 'utf8');
  await writeFile(migrationGovernanceFile, `${JSON.stringify(closedMigrationGovernanceReport(), null, 2)}\n`, 'utf8');

  try {
    const result = await runC19RuntimePublicationEvidence({
      handoffFile,
      artifactRoot: root,
      includeLive: true,
      confirmLiveHandoff: true,
      allowWrite: true,
      releaseArtifactFile,
      releaseVerificationFile,
      phase1EvaluationFile,
      runtimeInputFile,
      migrationGovernanceFile,
      runtimeWriter: async () => ({
        apply: { status: 'runtime_apply_ready', publicationKey: 'pub-1' },
        monitoring: { status: 'runtime_event_recorded' },
        rollback: { status: 'runtime_rollback_ready' },
      }),
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.liveMutation, false);

    const summary = JSON.parse(await readFile(path.join(root, 'c19-live-evidence-summary.json'), 'utf8'));
    assert.ok(summary.metadataReasons.includes('monitoring_window_required'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 runtime evidence runner blocks before DB connection when metadata is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-runtime-metadata-block-'));
  const handoffFile = path.join(root, 'handoff.json');
  const releaseArtifactFile = path.join(root, 'c19-release-closure-artifact.json');
  const releaseVerificationFile = path.join(root, 'c19-release-closure-verification.json');
  const phase1EvaluationFile = path.join(root, 'phase1-evaluation.json');
  const runtimeInputFile = path.join(root, 'runtime-input.json');
  const migrationGovernanceFile = path.join(root, 'migration-governance.json');
  const handoff = c19Handoff();
  handoff.gates['c19-runtime-publication-release-rollback'].release.monitoringWindow = '';
  await writeFile(handoffFile, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');
  await writeFile(releaseArtifactFile, `${JSON.stringify(readyArtifact(), null, 2)}\n`, 'utf8');
  await writeFile(releaseVerificationFile, `${JSON.stringify(passingVerification(), null, 2)}\n`, 'utf8');
  await writeFile(phase1EvaluationFile, `${JSON.stringify(readyEvaluation(), null, 2)}\n`, 'utf8');
  await writeFile(runtimeInputFile, `${JSON.stringify(runtimeInput(), null, 2)}\n`, 'utf8');
  await writeFile(migrationGovernanceFile, `${JSON.stringify(closedMigrationGovernanceReport(), null, 2)}\n`, 'utf8');

  try {
    const result = await runC19RuntimePublicationEvidence({
      handoffFile,
      artifactRoot: root,
      includeLive: true,
      confirmLiveHandoff: true,
      allowWrite: true,
      releaseArtifactFile,
      releaseVerificationFile,
      phase1EvaluationFile,
      runtimeInputFile,
      migrationGovernanceFile,
      env: {},
      runtimeWriter: async () => {
        throw new Error('runtime writer must not run');
      },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.liveMutation, false);
    assert.equal(result.dbMutation, false);

    const summary = JSON.parse(await readFile(path.join(root, 'c19-live-evidence-summary.json'), 'utf8'));
    assert.equal(summary.status, 'blocked');
    assert.equal(summary.generatedPackageOnly, true);
    assert.ok(summary.metadataReasons.includes('monitoring_window_required'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 runtime evidence runner blocks before writer when migration governance is not closed', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-runtime-mg-block-'));
  const handoffFile = path.join(root, 'handoff.json');
  const releaseArtifactFile = path.join(root, 'c19-release-closure-artifact.json');
  const releaseVerificationFile = path.join(root, 'c19-release-closure-verification.json');
  const phase1EvaluationFile = path.join(root, 'phase1-evaluation.json');
  const runtimeInputFile = path.join(root, 'runtime-input.json');
  const migrationGovernanceFile = path.join(root, 'migration-governance.json');
  await writeFile(handoffFile, `${JSON.stringify(c19Handoff(), null, 2)}\n`, 'utf8');
  await writeFile(releaseArtifactFile, `${JSON.stringify(readyArtifact(), null, 2)}\n`, 'utf8');
  await writeFile(releaseVerificationFile, `${JSON.stringify(passingVerification(), null, 2)}\n`, 'utf8');
  await writeFile(phase1EvaluationFile, `${JSON.stringify(readyEvaluation(), null, 2)}\n`, 'utf8');
  await writeFile(runtimeInputFile, `${JSON.stringify(runtimeInput(), null, 2)}\n`, 'utf8');
  await writeFile(migrationGovernanceFile, `${JSON.stringify(blockedMigrationGovernanceReport(), null, 2)}\n`, 'utf8');

  try {
    const result = await runC19RuntimePublicationEvidence({
      handoffFile,
      artifactRoot: root,
      includeLive: true,
      confirmLiveHandoff: true,
      allowWrite: true,
      releaseArtifactFile,
      releaseVerificationFile,
      phase1EvaluationFile,
      runtimeInputFile,
      migrationGovernanceFile,
      env: {},
      runtimeWriter: async () => {
        throw new Error('runtime writer must not run when MG-07 is blocked');
      },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.liveMutation, false);
    assert.equal(result.dbMutation, false);
    assert.ok(result.reasons.includes('production_migration_governance_closed_evidence_required'));
    assert.ok(result.reasons.includes('production_migration_governance_mg07_pass_required'));
    assert.ok(result.reasons.includes('production_migration_governance_runtime_writes_not_allowed'));

    const apply = JSON.parse(await readFile(path.join(root, 'c19-runtime-publication-apply.json'), 'utf8'));
    assert.equal(apply.status, 'blocked');
    assert.equal(apply.liveMutation, false);
    assert.ok(apply.reasons.includes('production_migration_governance_mg07_pass_required'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 runtime publication migration governance assessment requires closed MG-07 and scheduler permission', () => {
  assert.deepEqual(
    assessC19RuntimePublicationMigrationGovernance(null),
    {
      status: 'blocked',
      reasons: ['migration_governance_file_required'],
    },
  );

  assert.deepEqual(
    assessC19RuntimePublicationMigrationGovernance(blockedMigrationGovernanceReport()),
    {
      status: 'blocked',
      reasons: [
        'production_migration_governance_closed_evidence_required',
        'production_migration_governance_mg07_pass_required',
        'production_migration_governance_runtime_writes_not_allowed',
      ],
    },
  );

  assert.deepEqual(
    assessC19RuntimePublicationMigrationGovernance(closedMigrationGovernanceReport()),
    {
      status: 'pass',
      reasons: [],
    },
  );
});

test('C19 argument parser accepts guarded write inputs', () => {
  const parsed = parseArgs([
    '--handoff-file',
    'project-testing/reports/handoff/handoff.json',
    '--artifact-root',
    'project-testing/reports/handoff',
    '--include-live',
    '--confirm-live-handoff',
    '--allow-write',
    '--release-artifact-file',
    'c19-release-closure-artifact.json',
    '--release-verification-file',
    'c19-release-closure-verification.json',
    '--phase1-evaluation-file',
    'phase1.json',
    '--runtime-input-file',
    'runtime-input.json',
    '--migration-governance-file',
    'mg07.json',
  ]);

  assert.equal(parsed.includeLive, true);
  assert.equal(parsed.confirmLiveHandoff, true);
  assert.equal(parsed.allowWrite, true);
  assert.match(parsed.releaseArtifactFile, /c19-release-closure-artifact\.json$/);
  assert.match(parsed.migrationGovernanceFile, /mg07\.json$/);
});

test('C19 default query exec refuses guarded writes without a DB connection string', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-runtime-no-db-'));
  const handoffFile = path.join(root, 'handoff.json');
  const releaseArtifactFile = path.join(root, 'c19-release-closure-artifact.json');
  const releaseVerificationFile = path.join(root, 'c19-release-closure-verification.json');
  const phase1EvaluationFile = path.join(root, 'phase1-evaluation.json');
  const runtimeInputFile = path.join(root, 'runtime-input.json');
  const migrationGovernanceFile = path.join(root, 'migration-governance.json');
  await writeFile(handoffFile, `${JSON.stringify(c19Handoff(), null, 2)}\n`, 'utf8');
  await writeFile(releaseArtifactFile, `${JSON.stringify(readyArtifact(), null, 2)}\n`, 'utf8');
  await writeFile(releaseVerificationFile, `${JSON.stringify(passingVerification(), null, 2)}\n`, 'utf8');
  await writeFile(phase1EvaluationFile, `${JSON.stringify(readyEvaluation(), null, 2)}\n`, 'utf8');
  await writeFile(runtimeInputFile, `${JSON.stringify(runtimeInput(), null, 2)}\n`, 'utf8');
  await writeFile(migrationGovernanceFile, `${JSON.stringify(closedMigrationGovernanceReport(), null, 2)}\n`, 'utf8');

  try {
    await assert.rejects(
      runC19RuntimePublicationEvidence({
        handoffFile,
        artifactRoot: root,
        includeLive: true,
        confirmLiveHandoff: true,
        allowWrite: true,
        releaseArtifactFile,
        releaseVerificationFile,
        phase1EvaluationFile,
        runtimeInputFile,
        migrationGovernanceFile,
        env: {},
      }),
      /SUPABASE_MIGRATION_URL or DB_CONNECTION_STRING is required/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function c19Handoff() {
  return {
    schemaVersion: 'workbuddy-release-handoff-input/v1',
    unlockFlags: {
      includeLive: true,
      confirmLiveHandoff: true,
      includeDb: false,
      confirmDbReady: false,
    },
    gates: {
      'c19-runtime-publication-release-rollback': {
        live: {
          environmentOwner: 'operator://environment',
          writeApprovalRef: 'approval://write',
          artifactRoot: 'project-testing/reports/handoff-test',
        },
        targets: {
          companyId: 'company-1',
          projectId: 'project-1',
        },
        release: {
          phase1L5Ref: 'artifact://phase1-l5',
          releaseClosureArtifactRef: 'artifact://release-closure',
          rollbackTargetRef: 'rollback://target',
          monitoringWindow: '2026-06-29T04:00:00Z/2026-06-29T05:00:00Z',
        },
        approvals: {
          manualApprovalRef: 'approval://manual',
        },
        owners: {
          runtimePublicationOwner: 'operator://runtime-publication',
          consumerObservationOwner: 'operator://consumer-observation',
          monitoringOwner: 'operator://monitoring',
          rollbackOwner: 'operator://rollback',
        },
      },
    },
  };
}

function blockedMigrationGovernanceReport() {
  return {
    gate: 'production-migration-governance',
    status: 'ready_for_closeout_readback',
    gates: [
      { id: 'MG-07', name: 'closeout_readback', status: 'blocked', reasonCodes: ['live_advisor_rescan_missing'] },
    ],
    allowValidate: true,
    allowWarmup: false,
    allowScheduler: false,
  };
}

function readyArtifact() {
  return {
    artifactCode: 'c19_t2_rhythm_release_closure_artifact',
    status: 'manual_publication_candidate_ready',
    generatedAt: '2026-06-23T08:00:00.000Z',
    outputFile: 'c19-release-closure-artifact.json',
    missingOutputFile: false,
    sourceFiles: {
      liveReplayEvidenceFile: 'c19-t2-rhythm-live-replay.json',
      phase1SelectionGateFile: 'phase1-evaluation.json',
      l5ReleaseGateFile: 'phase1-l5.json',
    },
    provenance: {
      source: 't2_rhythm_release_closure_artifact_provenance',
      sourceFileCoverageStatus: 'ready',
      missingSourceFileRoles: [],
      inputFileDigests: [],
      standardLibrarySnapshot: {
        seedVersion: 't2-seed-test',
        templateCount: 196,
        businessTypeCount: 11,
        systemBusinessTypeCoverageStatus: 'ready',
        standardLibraryThicknessCoverageStatus: 'ready',
        systemBusinessTypeCoverageRate: 1,
        standardLibraryThicknessCoverageRate: 1,
        selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
        selectedTemplateCoverageStatus: 'covered_by_current_seed',
        missingSelectedTemplateIds: [],
      },
    },
    report: {
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      releaseEvidenceRefs: ['artifact:t2-release-review-package'],
    },
    sourceEvidenceRefs: ['artifact:t2-release-review-package'],
    publicationDecision: {
      source: 't2_rhythm_release_closure_artifact_publication_decision',
      status: 'manual_publication_candidate_ready',
      canEmitReleaseArtifact: true,
      canBypassManualApproval: false,
      canAutoMaterializeTaskDependencies: false,
      canAutoPublishRuntimeExperience: false,
      blockingReasons: [],
    },
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    },
  };
}

function passingVerification() {
  return {
    verificationCode: 'c19_t2_rhythm_release_closure_artifact_verification',
    status: 'pass',
    generatedAt: '2026-06-23T08:05:00.000Z',
    artifactFile: 'c19-release-closure-artifact.json',
    outputFile: 'c19-release-closure-verification.json',
    checks: {
      artifactStatusReady: true,
      publicationDecisionReady: true,
      inputDigestsMatch: true,
      standardLibrarySnapshotCurrent: true,
      sourceEvidenceRefsMatch: true,
      noRuntimeWriteBoundary: true,
      manualApprovalStillRequired: true,
    },
    digestMismatches: [],
    standardLibrarySnapshotMismatches: [],
    blockingReasons: [],
  };
}

function readyEvaluation() {
  return {
    source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
    candidateId: 'candidate-t2-runtime-1',
    tier: 'T2',
    status: 'phase1_readonly_evaluation_ready',
    canEnterC1913Phase1Selection: true,
    standardLibraryReadiness: {
      releaseEvidenceClosure: {
        selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      },
    },
    phase1PublicationGate: {
      status: 'canary_handoff_ready_not_published',
    },
  };
}

function runtimeInput() {
  return {
    projectStartDate: '2026-07-01',
    approvedByUserId: 'release-user',
    approvalEvidenceRefs: ['approval:t2-runtime-publication'],
    consumerVerificationRefs: [
      'projectCriticalPathService.consumes_task_dependencies',
      'durationInputAssemblerService.reads_t2_runtime_context',
    ],
    impactMonitoringRefs: ['monitor:t2-runtime-publication:14d'],
    eventStatus: 'monitoring_passed',
    eventPayload: {
      businessType: 'residential',
      monitoredDependencyViolationRate: 0,
      medianGateSlipDays: 1,
    },
    rollbackReason: 'canary_monitoring_regression',
    rollbackEvidenceRefs: ['rollback-drill:t2-schedule-runtime'],
    taskMappings: [{
      nodeId: 'node-foundation',
      taskId: '20000000-0000-4000-8000-000000000001',
    }, {
      nodeId: 'node-structure',
      taskId: '20000000-0000-4000-8000-000000000002',
    }],
    networkNodes: [{
      nodeId: 'node-foundation',
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      windowCode: 'W01',
      role: 'foundation_ready',
      startDay: 1,
      finishDay: 2,
      durationDays: 2,
      durationSource: 'parent_package_rhythm_window',
      tier: 'T2',
      confidence: 'high',
      durationBearing: true,
      autoApply: false,
    }, {
      nodeId: 'node-structure',
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      windowCode: 'W02',
      role: 'standard_floor_structure',
      startDay: 3,
      finishDay: 7,
      durationDays: 5,
      durationSource: 'parent_package_rhythm_window',
      tier: 'T2',
      confidence: 'high',
      durationBearing: true,
      autoApply: false,
    }],
    networkEdges: [{
      edgeId: 'edge-foundation-structure',
      sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
      predecessorNodeId: 'node-foundation',
      successorNodeId: 'node-structure',
      predecessorWindowCode: 'W01',
      successorWindowCode: 'W02',
      relation: 'FS',
      lagDays: 0,
      mandatory: true,
      edgeType: 'handover_gate',
      tier: 'T2',
      autoApply: false,
    }],
  };
}

function closedMigrationGovernanceReport() {
  return {
    gate: 'production-migration-governance',
    status: 'closed',
    gates: [
      { id: 'MG-07', name: 'closeout_readback', status: 'pass', reasonCodes: [] },
    ],
    allowScheduler: true,
  };
}
