import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateReleaseEvidence } from './validate-release-evidence.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const matrixPath = path.join(repoRoot, 'project-testing/matrix/release-test-matrix.json');

test('C-18 live diagnostics evidence passes only with all artifacts and live metadata', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-c18-evidence-'));

  try {
    for (const artifact of [
      'c18-l07-critical-path-concurrency-live.json',
      'c18-l08-acceptance-status-concurrency-live.json',
      'c18-l09-wizard-commit-live.json',
      'c18-l10-wbs-generation-pressure.json',
      'c18-l11-warning-sync-query-log.json',
      'c18-l12-critical-path-network-pressure.json',
      'c18-l14-company-summary-pressure.json',
      'c18-l15-spreadsheet-migration-replay.json',
      'c18-live-evidence-summary.json',
    ]) {
      await writeJson(path.join(evidenceRoot, artifact), liveDiagnosticDoc(artifact));
    }

    const result = await validateReleaseEvidence({
      gateId: 'c18-l07-l15-live-diagnostics',
      evidenceRoot,
      matrixPath,
      now: new Date('2026-06-29T02:20:00+08:00'),
    });

    assert.equal(result.status, 'pass');
    assert.equal(result.counts.failures, 0);
    assert.equal(result.counts.expectedArtifactsPresent, 9);
    assert.equal(result.counts.requiredPatternsMatched, 8);
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('C-18 validation rejects dry-run evidence even when filenames are present', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-c18-dryrun-evidence-'));

  try {
    for (const artifact of [
      'c18-l07-critical-path-concurrency-live.json',
      'c18-l08-acceptance-status-concurrency-live.json',
      'c18-l09-wizard-commit-live.json',
      'c18-l10-wbs-generation-pressure.json',
      'c18-l11-warning-sync-query-log.json',
      'c18-l12-critical-path-network-pressure.json',
      'c18-l14-company-summary-pressure.json',
      'c18-l15-spreadsheet-migration-replay.json',
      'c18-live-evidence-summary.json',
    ]) {
      await writeJson(path.join(evidenceRoot, artifact), {
        ...liveDiagnosticDoc(artifact),
        dryRun: artifact === 'c18-l07-critical-path-concurrency-live.json',
      });
    }

    const result = await validateReleaseEvidence({
      gateId: 'c18-l07-l15-live-diagnostics',
      evidenceRoot,
      matrixPath,
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.failures.some((failure) => failure.code === 'reject-marker-present' && failure.detail === 'dry-run-only'));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('C-18 validation rejects blocked expected summary artifacts', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-c18-blocked-summary-'));

  try {
    for (const artifact of [
      'c18-l07-critical-path-concurrency-live.json',
      'c18-l08-acceptance-status-concurrency-live.json',
      'c18-l09-wizard-commit-live.json',
      'c18-l10-wbs-generation-pressure.json',
      'c18-l11-warning-sync-query-log.json',
      'c18-l12-critical-path-network-pressure.json',
      'c18-l14-company-summary-pressure.json',
      'c18-l15-spreadsheet-migration-replay.json',
    ]) {
      await writeJson(path.join(evidenceRoot, artifact), liveDiagnosticDoc(artifact));
    }
    await writeJson(path.join(evidenceRoot, 'c18-live-evidence-summary.json'), {
      ...liveDiagnosticDoc('c18-live-evidence-summary.json'),
      status: 'blocked',
      canClaimLiveCloseoutComplete: false,
    });

    const result = await validateReleaseEvidence({
      gateId: 'c18-l07-l15-live-diagnostics',
      evidenceRoot,
      matrixPath,
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.failures.some((failure) => failure.code === 'expected-json-status-not-pass'
      && failure.artifact === 'c18-live-evidence-summary.json'));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('C-18 validation ignores prior validator output when scanning evidence artifacts', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-c18-selfscan-evidence-'));

  try {
    for (const artifact of [
      'c18-l07-critical-path-concurrency-live.json',
      'c18-l08-acceptance-status-concurrency-live.json',
      'c18-l09-wizard-commit-live.json',
      'c18-l10-wbs-generation-pressure.json',
      'c18-l11-warning-sync-query-log.json',
      'c18-l12-critical-path-network-pressure.json',
      'c18-l14-company-summary-pressure.json',
      'c18-l15-spreadsheet-migration-replay.json',
      'c18-live-evidence-summary.json',
    ]) {
      await writeJson(path.join(evidenceRoot, artifact), liveDiagnosticDoc(artifact));
    }

    await writeJson(path.join(evidenceRoot, 'c18-l07-l15-live-diagnostics-evidence-validation.json'), {
      schemaVersion: 'workbuddy-release-evidence-validation/v1',
      gateId: 'c18-l07-l15-live-diagnostics',
      status: 'fail',
      policy: {
        rejectIf: [
          'dry-run-only',
          'local-only',
          'synthetic-only',
          'manual-assisted-only',
          'missing-db-query-log-or-lock-telemetry-for-db-backed-diagnostics',
        ],
      },
    });
    await writeJson(path.join(evidenceRoot, 'c18-l07-l15-live-diagnostics-evidence-validation.current.json'), {
      schemaVersion: 'workbuddy-release-evidence-validation/v1',
      gateId: 'c18-l07-l15-live-diagnostics',
      status: 'fail',
      dryRun: true,
    });
    await writeJson(path.join(evidenceRoot, 'c18-l07-l15-live-diagnostics-evidence-validation.before-rerun.json'), {
      schemaVersion: 'workbuddy-release-evidence-validation/v1',
      gateId: 'c18-l07-l15-live-diagnostics',
      status: 'fail',
      localOnly: true,
    });

    const result = await validateReleaseEvidence({
      gateId: 'c18-l07-l15-live-diagnostics',
      evidenceRoot,
      matrixPath,
    });

    assert.equal(result.status, 'pass');
    assert.equal(result.counts.rejectMarkersMatched, 0);
    assert.ok(
      !result.checks.jsonArtifacts.documents.some((artifact) => artifact.basename.includes('-evidence-validation.')),
    );
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('C-15 learning closeout rejects local scheduler only evidence', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-c15-evidence-'));

  try {
    for (const artifact of [
      'c15-sample-cohort-readback.json',
      'c15-reward-mae-quality-readback.json',
      'c15-pending-prediction-closure.json',
      'c15-policy-version-tenant-isolation.json',
      'c15-canary-approval-monitoring.json',
      'c15-rollback-or-supersede.json',
      'c15-live-evidence-summary.json',
    ]) {
      await writeJson(path.join(evidenceRoot, artifact), {
        environment: 'live',
        companyId: 'company-live-1',
        projectId: 'project-live-1',
        candidateId: 'candidate-live-1',
        sampleCohortRef: 'cohort-20260629',
        metricWindow: '2026-06-29T02:00:00+08:00/PT30M',
        approvalRef: 'approval-c15',
        rollbackRef: 'rollback-c15',
        tenantIsolationReadback: { status: 'pass' },
        sourceType: artifact === 'c15-sample-cohort-readback.json' ? 'local-scheduler-only' : 'live',
      });
    }

    const result = await validateReleaseEvidence({
      gateId: 'c15-live-learning-closeout',
      evidenceRoot,
      matrixPath,
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.failures.some((failure) => failure.detail === 'local-scheduler-only'));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('C-15 learning closeout requires reward MAE improvement, not just readback presence', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-c15-flat-mae-evidence-'));

  try {
    const liveBase = {
      status: 'pass',
      environment: 'live',
      companyId: 'company-live-1',
      projectId: 'project-live-1',
      candidateId: 'candidate-live-1',
      sampleCohortRef: 'cohort-20260629',
      metricWindow: '2026-06-29T02:00:00+08:00/PT30M',
      approvalRef: 'approval-c15',
      rollbackRef: 'rollback-c15',
      tenantIsolationReadback: { status: 'pass', crossTenantRows: 0 },
      liveMutation: true,
      dbMutation: true,
    };
    const rewardMaeQualityReadback = {
      status: 'pass',
      calibrationId: 'calibration-c15',
      maeBefore: 0.126,
      maeAfter: 0.126,
      evaluatedDecisionCount: 4,
    };

    await writeJson(path.join(evidenceRoot, 'c15-sample-cohort-readback.json'), {
      ...liveBase,
      sampleCohortReadback: { status: 'pass', sampleCount: 9, source: 'duration_experience_samples' },
    });
    await writeJson(path.join(evidenceRoot, 'c15-reward-mae-quality-readback.json'), {
      ...liveBase,
      rewardMaeQualityReadback,
    });
    await writeJson(path.join(evidenceRoot, 'c15-pending-prediction-closure.json'), {
      ...liveBase,
      pendingPredictionClosure: { status: 'pass', pendingPredictionCount: 0 },
    });
    await writeJson(path.join(evidenceRoot, 'c15-policy-version-tenant-isolation.json'), {
      ...liveBase,
      policyVersionUniqueness: { status: 'pass', duplicateVersionCount: 0, versionCount: 1 },
    });
    await writeJson(path.join(evidenceRoot, 'c15-canary-approval-monitoring.json'), {
      ...liveBase,
      canaryApprovalMonitoring: { status: 'pass', candidateStatus: 'approved_for_canary' },
    });
    await writeJson(path.join(evidenceRoot, 'c15-rollback-or-supersede.json'), {
      ...liveBase,
      rollbackOrSupersede: { status: 'pass', policyVersionStatus: 'rolled_back' },
    });
    await writeJson(path.join(evidenceRoot, 'c15-live-evidence-summary.json'), {
      ...liveBase,
      result: { rewardMaeQualityReadback },
      liveLearningCloseoutEvidence: { rewardMaeQualityReadback },
    });

    const result = await validateReleaseEvidence({
      gateId: 'c15-live-learning-closeout',
      evidenceRoot,
      matrixPath,
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.failures.some((failure) => failure.code === 'content-check-failed'
      && failure.detail === 'reward-mae-improvement'));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('C-15 learning closeout rejects improved MAE when live/db mutation evidence is missing', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-c15-missing-mutation-evidence-'));

  try {
    const liveBase = {
      status: 'pass',
      environment: 'live',
      companyId: 'company-live-1',
      projectId: 'project-live-1',
      candidateId: 'candidate-live-1',
      sampleCohortRef: 'cohort-20260629',
      metricWindow: '2026-06-29T02:00:00+08:00/PT30M',
      approvalRef: 'approval-c15',
      rollbackRef: 'rollback-c15',
      tenantIsolationReadback: { status: 'pass', crossTenantRows: 0 },
    };
    const rewardMaeQualityReadback = {
      status: 'pass',
      calibrationId: 'calibration-c15',
      maeBefore: 0.29,
      maeAfter: 0.2467,
      evaluatedDecisionCount: 1,
    };

    await writeJson(path.join(evidenceRoot, 'c15-sample-cohort-readback.json'), {
      ...liveBase,
      sampleCohortReadback: { status: 'pass', sampleCount: 9, source: 'duration_experience_samples' },
    });
    await writeJson(path.join(evidenceRoot, 'c15-reward-mae-quality-readback.json'), {
      ...liveBase,
      rewardMaeQualityReadback,
    });
    await writeJson(path.join(evidenceRoot, 'c15-pending-prediction-closure.json'), {
      ...liveBase,
      pendingPredictionClosure: { status: 'pass', pendingPredictionCount: 0 },
    });
    await writeJson(path.join(evidenceRoot, 'c15-policy-version-tenant-isolation.json'), {
      ...liveBase,
      policyVersionUniqueness: { status: 'pass', duplicateVersionCount: 0, versionCount: 1 },
    });
    await writeJson(path.join(evidenceRoot, 'c15-canary-approval-monitoring.json'), {
      ...liveBase,
      canaryApprovalMonitoring: { status: 'pass', candidateStatus: 'approved_for_canary' },
    });
    await writeJson(path.join(evidenceRoot, 'c15-rollback-or-supersede.json'), {
      ...liveBase,
      rollbackOrSupersede: { status: 'pass', policyVersionStatus: 'rolled_back' },
    });
    await writeJson(path.join(evidenceRoot, 'c15-live-evidence-summary.json'), {
      ...liveBase,
      result: { rewardMaeQualityReadback },
      liveLearningCloseoutEvidence: { rewardMaeQualityReadback },
    });

    const result = await validateReleaseEvidence({
      gateId: 'c15-live-learning-closeout',
      evidenceRoot,
      matrixPath,
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.failures.some((failure) => failure.code === 'content-check-failed'
      && failure.detail === 'live-db-mutation-recorded'));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('C-19 runtime publication evidence passes only when apply, monitoring, rollback, and observation artifacts exist', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-evidence-'));

  try {
    await writeJson(path.join(evidenceRoot, 'summary.json'), {
      schemaVersion: 'workbuddy-release-dashboard-summary/v1',
      profile: 'live',
      dryRun: false,
      deferredGroups: [
        {
          id: 'c19-runtime-publication-release-rollback',
          artifactValidationPolicy: {
            rejectIf: [
              'generated-package-only',
              'missing-runtime-apply',
              'missing-impact-monitoring',
            ],
          },
        },
      ],
    });

    await writeC19EvidenceArtifacts(evidenceRoot);

    const result = await validateReleaseEvidence({
      gateId: 'c19-runtime-publication-release-rollback',
      evidenceRoot,
      matrixPath,
    });

    assert.equal(result.status, 'pass');
    assert.equal(result.counts.failures, 0);
    assert.equal(result.counts.requiredPatternsMatched, 6);
    assert.ok(result.checks.content.passed.some((item) => item.detail === 'runtime-apply-ready'));
    assert.ok(result.checks.content.passed.some((item) => item.detail === 'construction-organization-runtime-evidence'));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('C-19 runtime publication validation rejects metadata-only artifacts without nested runtime proof', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-shallow-evidence-'));

  try {
    for (const artifact of [
      'c19-t2-rhythm-live-replay.json',
      'c19-release-closure-artifact.json',
      'c19-release-closure-verification.json',
      'c19-manual-approval-preflight.json',
      'c19-runtime-publication-apply.json',
      'c19-impact-monitoring-observation.json',
      'c19-runtime-rollback-saved-outcome.json',
      'c19-construction-organization-e1-e3-e5.json',
      'c19-live-evidence-summary.json',
    ]) {
      await writeJson(path.join(evidenceRoot, artifact), c19BaseDoc());
    }

    const result = await validateReleaseEvidence({
      gateId: 'c19-runtime-publication-release-rollback',
      evidenceRoot,
      matrixPath,
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.failures.some((failure) => failure.detail === 'runtime-apply-ready'));
    assert.ok(result.failures.some((failure) => failure.detail === 'impact-monitoring-recorded'));
    assert.ok(result.failures.some((failure) => failure.detail === 'runtime-rollback-ready'));
    assert.ok(result.failures.some((failure) => failure.detail === 'construction-organization-runtime-evidence'));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('old-object physical drop rejects nonzero row counts even with required artifacts present', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-old-object-evidence-'));

  try {
    await writeJson(path.join(evidenceRoot, 'old-object-drop-candidates.json'), oldObjectDoc({ rowCount: 1 }));
    await writeJson(path.join(evidenceRoot, 'old-object-rowcount-and-catalog-readback.json'), oldObjectDoc({ rowCount: 1 }));
    await writeJson(path.join(evidenceRoot, 'old-object-dependency-readback.json'), oldObjectDoc({ rowCount: 0 }));
    await writeJson(path.join(evidenceRoot, 'old-object-post-drop-catalog-readback.json'), oldObjectDoc({ rowCount: 0 }));
    await writeJson(path.join(evidenceRoot, 'old-object-post-drop-api-browser-smoke.json'), oldObjectDoc({ rowCount: 0 }));
    await writeJson(path.join(evidenceRoot, 'old-object-physical-drop-summary.json'), oldObjectDoc({ rowCount: 0 }));
    await writeText(path.join(evidenceRoot, 'old-object-ddl-export.sql'), 'create table public.legacy_table(id uuid primary key);\n');
    await writeText(path.join(evidenceRoot, 'old-object-rollback-plan.sql'), 'create table public.legacy_table(id uuid primary key);\n');
    await writeText(path.join(evidenceRoot, 'old-object-controlled-drop-migration.sql'), 'drop table public.legacy_table;\n');

    const result = await validateReleaseEvidence({
      gateId: 'old-object-physical-drop-closeout',
      evidenceRoot,
      matrixPath,
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.failures.some((failure) => failure.detail === 'row-count-nonzero'));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('old-object physical drop rejects placeholder SQL artifacts', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-old-object-placeholder-sql-'));

  try {
    await writeJson(path.join(evidenceRoot, 'old-object-drop-candidates.json'), oldObjectDoc({ rowCount: 0 }));
    await writeJson(path.join(evidenceRoot, 'old-object-rowcount-and-catalog-readback.json'), oldObjectDoc({ rowCount: 0 }));
    await writeJson(path.join(evidenceRoot, 'old-object-dependency-readback.json'), oldObjectDoc({ rowCount: 0 }));
    await writeJson(path.join(evidenceRoot, 'old-object-post-drop-catalog-readback.json'), oldObjectDoc({ rowCount: 0 }));
    await writeJson(path.join(evidenceRoot, 'old-object-post-drop-api-browser-smoke.json'), oldObjectDoc({ rowCount: 0 }));
    await writeJson(path.join(evidenceRoot, 'old-object-physical-drop-summary.json'), oldObjectDoc({ rowCount: 0 }));
    await writeText(path.join(evidenceRoot, 'old-object-ddl-export.sql'), '-- ddl-export-missing: no approved old-object candidate has a verified DDL export.\n');
    await writeText(path.join(evidenceRoot, 'old-object-rollback-plan.sql'), '-- rollback-plan-missing: no approved old-object candidate has a rollback plan.\n');
    await writeText(path.join(evidenceRoot, 'old-object-controlled-drop-migration.sql'), '-- approval-missing: controlled DROP migration is not authorized.\n');

    const result = await validateReleaseEvidence({
      gateId: 'old-object-physical-drop-closeout',
      evidenceRoot,
      matrixPath,
    });

    assert.equal(result.status, 'fail');
    assert.equal(result.counts.contentChecks, 3);
    assert.equal(result.counts.contentCheckFailures, 3);
    assert.ok(result.failures.some((failure) => failure.code === 'content-check-failed'
      && failure.detail === 'ddl-export'));
    assert.ok(result.failures.some((failure) => failure.code === 'content-check-failed'
      && failure.detail === 'rollback-plan'));
    assert.ok(result.failures.some((failure) => failure.code === 'content-check-failed'
      && failure.detail === 'controlled-drop-migration'));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('old-object cleanup accepts DB-backed no-safe-candidate closeout without claiming physical DROP', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-old-object-no-safe-'));

  try {
    const discovery = noSafeCandidateDiscovery({ inspectedCount: 2 });
    await writeJson(path.join(evidenceRoot, 'old-object-candidate-discovery.all.json'), discovery);
    await writeJson(path.join(evidenceRoot, 'old-object-candidate-discovery.json'), {
      ...discovery,
      discoveryMode: 'name_hint_filtered',
      minNameHint: true,
    });
    await writeJson(path.join(evidenceRoot, 'legacy-object-drop-guard.initial.json'), {
      status: 'blocked',
      reasons: ['row_count_zero_not_sufficient'],
      candidates: [],
    });
    await writeJson(path.join(evidenceRoot, 'old-object-no-safe-candidate-closeout.json'), {
      schemaVersion: 'workbuddy-old-object-no-safe-candidate-closeout/v1',
      generatedAt: '2026-06-29T06:30:00.000Z',
      gateId: 'old-object-physical-drop-closeout',
      status: 'pass',
      closeoutMode: 'no_safe_candidate',
      databaseTarget: 'env://server/.env#SUPABASE_MIGRATION_URL',
      discoveryRef: 'old-object-candidate-discovery.all.json',
      candidateCount: 0,
      candidates: [],
      inspectedCount: 2,
      physicalDropExecuted: false,
      liveMutation: false,
      dbMutation: false,
      boundary: {
        liveMutation: false,
        dbMutation: false,
        physicalDropExecuted: false,
      },
    });

    const result = await validateReleaseEvidence({
      gateId: 'old-object-physical-drop-closeout',
      evidenceRoot,
      matrixPath,
    });

    assert.equal(result.status, 'pass');
    assert.equal(result.counts.failures, 0);
    assert.equal(result.checks.alternateCloseout.mode, 'no_safe_candidate');
    assert.equal(result.counts.requiredPatterns, 0);
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('old-object no-safe-candidate closeout rejects empty-shell discovery', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-old-object-no-safe-empty-'));

  try {
    await writeJson(path.join(evidenceRoot, 'old-object-candidate-discovery.all.json'), noSafeCandidateDiscovery({ inspectedCount: 0 }));
    await writeJson(path.join(evidenceRoot, 'legacy-object-drop-guard.initial.json'), {
      status: 'blocked',
      reasons: ['row_count_zero_not_sufficient'],
      candidates: [],
    });
    await writeJson(path.join(evidenceRoot, 'old-object-no-safe-candidate-closeout.json'), {
      schemaVersion: 'workbuddy-old-object-no-safe-candidate-closeout/v1',
      generatedAt: '2026-06-29T06:30:00.000Z',
      gateId: 'old-object-physical-drop-closeout',
      status: 'pass',
      closeoutMode: 'no_safe_candidate',
      databaseTarget: 'env://server/.env#SUPABASE_MIGRATION_URL',
      discoveryRef: 'old-object-candidate-discovery.all.json',
      candidateCount: 0,
      candidates: [],
      inspectedCount: 0,
      physicalDropExecuted: false,
      liveMutation: false,
      dbMutation: false,
      boundary: {
        liveMutation: false,
        dbMutation: false,
        physicalDropExecuted: false,
      },
    });

    const result = await validateReleaseEvidence({
      gateId: 'old-object-physical-drop-closeout',
      evidenceRoot,
      matrixPath,
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.failures.some((failure) => failure.detail === 'scan-inventory-nonempty'));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('old-object physical drop reports missing catalog and rollback artifacts as failures', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-old-object-missing-evidence-'));

  try {
    await writeJson(path.join(evidenceRoot, 'old-object-drop-candidates.json'), {
      databaseTarget: 'safe-test-db',
      candidateObject: 'legacy_table',
    });

    const result = await validateReleaseEvidence({
      gateId: 'old-object-physical-drop-closeout',
      evidenceRoot,
      matrixPath,
    });

    assert.equal(result.status, 'fail');
    assert.ok(result.failures.some((failure) => failure.code === 'expected-artifact-missing'));
    assert.ok(result.failures.some((failure) => failure.code === 'required-pattern-missing'));
    assert.ok(result.failures.some((failure) => failure.code === 'required-metadata-missing'));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, 'utf8');
}

function liveDiagnosticDoc(artifactPath) {
  return {
    environment: 'live',
    diagnosticRunId: `run-${artifactPath}`,
    command: 'diagnose:live',
    exitCode: 0,
    artifactPath,
    targetIds: {
      projectId: 'project-live-1',
    },
    startedAt: '2026-06-29T02:00:00+08:00',
    finishedAt: '2026-06-29T02:01:00+08:00',
    cleanupReadback: {
      status: 'pass',
    },
  };
}

async function writeC19EvidenceArtifacts(evidenceRoot) {
  const base = c19BaseDoc();
  await writeJson(path.join(evidenceRoot, 'c19-t2-rhythm-live-replay.json'), {
    ...base,
    status: 'pass',
    liveMutation: true,
    dbMutation: true,
    result: { status: 'pass', replaySampleCount: 3 },
  });
  await writeJson(path.join(evidenceRoot, 'c19-release-closure-artifact.json'), {
    ...base,
    status: 'manual_publication_candidate_ready',
    report: { status: 'manual_publication_candidate_ready' },
  });
  await writeJson(path.join(evidenceRoot, 'c19-release-closure-verification.json'), {
    ...base,
    status: 'pass',
    manualApproval: { status: 'pass' },
  });
  await writeJson(path.join(evidenceRoot, 'c19-manual-approval-preflight.json'), {
    ...base,
    status: 'pass',
    manualApproval: { status: 'pass' },
  });
  await writeJson(path.join(evidenceRoot, 'c19-runtime-publication-apply.json'), {
    ...base,
    status: 'pass',
    liveMutation: true,
    dbMutation: true,
    result: { status: 'runtime_apply_ready', publicationKey: 'publication-c19' },
  });
  await writeJson(path.join(evidenceRoot, 'c19-impact-monitoring-observation.json'), {
    ...base,
    status: 'pass',
    liveMutation: true,
    dbMutation: true,
    result: { status: 'runtime_event_recorded', eventCount: 1 },
  });
  await writeJson(path.join(evidenceRoot, 'c19-runtime-rollback-saved-outcome.json'), {
    ...base,
    status: 'pass',
    liveMutation: true,
    dbMutation: true,
    result: { status: 'runtime_rollback_ready', rollbackPlanId: 'rollback-c19' },
  });
  await writeJson(path.join(evidenceRoot, 'c19-construction-organization-e1-e3-e5.json'), {
    ...base,
    status: 'pass',
    liveMutation: true,
    dbMutation: true,
    result: {
      status: 'pass',
      e1RuntimeEvidence: { status: 'pass', evidenceRef: 'e1-runtime' },
      e3RuntimeEvidence: { status: 'pass', evidenceRef: 'e3-runtime' },
      e5RuntimeEvidence: { status: 'pass', evidenceRef: 'e5-runtime' },
    },
  });
  await writeJson(path.join(evidenceRoot, 'c19-live-evidence-summary.json'), {
    ...base,
    status: 'pass',
    liveMutation: true,
    dbMutation: true,
    result: {
      apply: { status: 'runtime_apply_ready' },
      monitoring: { status: 'runtime_event_recorded' },
      rollback: { status: 'runtime_rollback_ready' },
      constructionOrganization: { status: 'pass' },
    },
  });
}

function c19BaseDoc() {
  return {
    environment: 'live',
    projectId: 'project-live-1',
    releasePackageId: 'release-package-c19',
    phase1L5Ref: 'phase1-l5-handoff',
    approvalRef: 'approval-c19',
    runtimePublicationId: 'runtime-publication-1',
    monitoringWindow: '2026-06-29T02:00:00+08:00/PT30M',
    rollbackRef: 'rollback-c19',
    consumerObservationRef: 'consumer-observation-c19',
  };
}

function oldObjectDoc({ rowCount }) {
  return {
    databaseTarget: 'safe-test-db',
    candidateObject: 'legacy_table',
    rowCount,
    catalogReadback: { status: 'pass' },
    dependencyReadback: { status: 'pass' },
    ddlExportPath: 'old-object-ddl-export.sql',
    rollbackPath: 'old-object-rollback-plan.sql',
    approvalRef: 'approval-old-object',
    migrationWindow: '2026-06-29T02:00:00+08:00/PT30M',
    postDropSmokePath: 'old-object-post-drop-api-browser-smoke.json',
  };
}

function noSafeCandidateDiscovery({ inspectedCount }) {
  const inspected = Array.from({ length: inspectedCount }, (_, index) => ({
    objectName: `public.object_${index}`,
    rowCount: 0,
    hintScore: 0,
    dependencyStatus: 'pass',
    runtimeReferenceCount: 0,
  }));
  return {
    schemaVersion: 'workbuddy-old-object-drop-candidate-discovery/v1',
    generatedAt: '2026-06-29T06:29:00.000Z',
    discoveryMode: 'full_catalog',
    minNameHint: false,
    status: 'no_safe_candidate',
    databaseTarget: 'env://server/.env#SUPABASE_MIGRATION_URL',
    candidateCount: 0,
    candidates: [],
    inspectedCount,
    inspected,
    physicalDropExecuted: false,
    boundary: {
      liveMutation: false,
      dbMutation: false,
    },
  };
}
