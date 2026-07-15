import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  evaluateReleaseCloseout,
  parseArgs,
  writeCloseoutDecision,
} from './evaluate-release-closeout.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const matrixPath = path.join(repoRoot, 'project-testing/matrix/release-test-matrix.json');

test('closeout evaluator keeps all real gates open when artifacts are missing', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-closeout-missing-'));

  try {
    await writeJson(path.join(evidenceRoot, 'summary.json'), {
      schemaVersion: 'workbuddy-release-dashboard-summary/v1',
      profile: 'smoke',
      dryRun: true,
    });

    const decision = await evaluateReleaseCloseout({
      evidenceRoot,
      matrixPath,
      now: new Date('2026-06-29T03:00:00+08:00'),
    });

    assert.equal(decision.status, 'fail');
    assert.equal(decision.mayCloseAll, false);
    assert.equal(decision.gateCount, 4);
    assert.equal(decision.openGateCount, 4);
    assert.ok(decision.gates.every((gate) => gate.mayClose === false));
    assert.ok(decision.gates.some((gate) => gate.id === 'old-object-physical-drop-closeout'));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('closeout evaluator passes when all four gate evidence sets satisfy the matrix', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-closeout-pass-'));

  try {
    await writeJson(path.join(evidenceRoot, 'summary.json'), {
      schemaVersion: 'workbuddy-release-dashboard-summary/v1',
      profile: 'live',
      dryRun: false,
    });
    await writeC18Artifacts(evidenceRoot);
    await writeC15Artifacts(evidenceRoot);
    await writeC19Artifacts(evidenceRoot);
    await writeOldObjectArtifacts(evidenceRoot);

    const decision = await evaluateReleaseCloseout({
      evidenceRoot,
      matrixPath,
      now: new Date('2026-06-29T03:01:00+08:00'),
    });

    assert.equal(decision.status, 'pass');
    assert.equal(decision.mayCloseAll, true);
    assert.equal(decision.openGateCount, 0);
    assert.equal(decision.decisionScope, 'live-db-closeout-gates');
    assert.equal(decision.decisionAuthority.authoritativeForCloseout, true);
    assert.equal(decision.decisionAuthority.authoritativeForRelease, false);
    assert.equal(decision.decisionAuthority.authoritativeForProduction, false);
    assert.equal(decision.decisionAuthority.releaseDecisionArtifact, 'v1424-release-decision.json');
    assert.ok(decision.gates.every((gate) => gate.validationStatus === 'pass'));
    assert.equal(
      decision.gates.find((gate) => gate.id === 'c15-live-learning-closeout').mutationSummary.hasLiveMutationEvidence,
      true,
    );
    assert.equal(
      decision.gates.find((gate) => gate.id === 'c19-runtime-publication-release-rollback').mutationSummary.hasDbMutationEvidence,
      true,
    );
    const oldObjectGate = decision.gates.find((gate) => gate.id === 'old-object-physical-drop-closeout');
    assert.equal(oldObjectGate.closeoutMode, 'no_safe_candidate');
    assert.equal(oldObjectGate.mutationSummary.physicalDropExecuted, false);
    assert.equal(oldObjectGate.alternateCloseout.physicalDropExecuted, false);

    const outputs = await writeCloseoutDecision({
      decision,
      outputPath: path.join(evidenceRoot, 'closeout-decision.json'),
    });
    const summary = JSON.parse(await readFile(outputs.jsonPath, 'utf8'));
    const markdown = await readFile(outputs.markdownPath, 'utf8');

    assert.equal(summary.mayCloseAll, true);
    assert.equal(summary.decisionAuthority.authoritativeForRelease, false);
    assert.equal(summary.gates[0].validation, undefined);
    assert.equal(summary.gates.find((gate) => gate.id === 'old-object-physical-drop-closeout').closeoutMode, 'no_safe_candidate');
    assert.equal(summary.gates.find((gate) => gate.id === 'old-object-physical-drop-closeout').mutationSummary.physicalDropExecuted, false);
    assert.match(markdown, /All gates may close/);
    assert.match(markdown, /no_safe_candidate/);
    assert.match(markdown, /Physical DROP/);
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('closeout evaluator writes validation files and fails process-ready decision for partial evidence', async () => {
  const evidenceRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-closeout-partial-'));

  try {
    await writeC18Artifacts(evidenceRoot);

    const decision = await evaluateReleaseCloseout({
      evidenceRoot,
      matrixPath,
      gateIds: [
        'c18-l07-l15-live-diagnostics',
        'c15-live-learning-closeout',
      ],
      now: new Date('2026-06-29T03:02:00+08:00'),
    });
    const outputs = await writeCloseoutDecision({
      decision,
      outputPath: path.join(evidenceRoot, 'partial-closeout.json'),
    });
    const markdown = await readFile(outputs.markdownPath, 'utf8');

    assert.equal(decision.status, 'fail');
    assert.deepEqual(decision.decision.openGateIds, ['c15-live-learning-closeout']);
    assert.match(markdown, /c15-live-learning-closeout/);

    const c18Validation = JSON.parse(await readFile(path.join(evidenceRoot, 'c18-l07-l15-live-diagnostics-evidence-validation.json'), 'utf8'));
    assert.equal(c18Validation.status, 'pass');
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test('argument parser defaults to all real closeout gates and supports repeatable gate flags', () => {
  const parsed = parseArgs([
    '--evidence-root',
    'project-testing/reports/release-20260629-000000',
    '--gate',
    'c18-l07-l15-live-diagnostics',
    '--gate',
    'old-object-physical-drop-closeout',
  ]);

  assert.equal(parsed.gateIds.length, 2);
  assert.match(parsed.evidenceRoot, /release-20260629-000000$/);
  assert.throws(() => parseArgs([]), /--evidence-root is required/);
});

async function writeC18Artifacts(root) {
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
    await writeJson(path.join(root, artifact), {
      environment: 'live',
      diagnosticRunId: `run-${artifact}`,
      command: 'diagnose:live',
      exitCode: 0,
      artifactPath: artifact,
      targetIds: {
        projectId: 'project-live-1',
      },
      startedAt: '2026-06-29T03:00:00+08:00',
      finishedAt: '2026-06-29T03:01:00+08:00',
      cleanupReadback: { status: 'pass' },
    });
  }
}

async function writeC15Artifacts(root) {
  const base = {
    environment: 'live',
    companyId: 'company-live-1',
    projectId: 'project-live-1',
    candidateId: 'candidate-live-1',
    sampleCohortRef: 'cohort-live-1',
    metricWindow: '2026-06-29T03:00:00+08:00/PT30M',
    approvalRef: 'approval-c15',
    rollbackRef: 'rollback-c15',
    tenantIsolationReadback: { status: 'pass', crossTenantRows: 0 },
    liveMutation: true,
    dbMutation: true,
  };
  const rewardMaeQualityReadback = {
    status: 'pass',
    maeBefore: 4.8,
    maeAfter: 3.2,
    evaluatedDecisionCount: 12,
  };
  await writeJson(path.join(root, 'c15-sample-cohort-readback.json'), {
    ...base,
    sampleCohortReadback: { status: 'pass', sampleCount: 42 },
  });
  await writeJson(path.join(root, 'c15-reward-mae-quality-readback.json'), {
    ...base,
    rewardMaeQualityReadback,
  });
  await writeJson(path.join(root, 'c15-pending-prediction-closure.json'), {
    ...base,
    pendingPredictionClosure: { status: 'pass', pendingPredictionCount: 0 },
  });
  await writeJson(path.join(root, 'c15-policy-version-tenant-isolation.json'), {
    ...base,
    policyVersionUniqueness: { status: 'pass', duplicateVersionCount: 0 },
  });
  await writeJson(path.join(root, 'c15-canary-approval-monitoring.json'), {
    ...base,
    canaryApprovalMonitoring: { status: 'pass' },
  });
  await writeJson(path.join(root, 'c15-rollback-or-supersede.json'), {
    ...base,
    rollbackOrSupersede: { status: 'pass' },
  });
  await writeJson(path.join(root, 'c15-live-evidence-summary.json'), {
    ...base,
    result: { rewardMaeQualityReadback },
    liveLearningCloseoutEvidence: { rewardMaeQualityReadback },
  });
}

async function writeC19Artifacts(root) {
  const base = {
    environment: 'live',
    projectId: 'project-live-1',
    releasePackageId: 'release-c19',
    phase1L5Ref: 'phase1-l5',
    approvalRef: 'approval-c19',
    runtimePublicationId: 'runtime-publication-c19',
    monitoringWindow: '2026-06-29T03:00:00+08:00/PT30M',
    rollbackRef: 'rollback-c19',
    consumerObservationRef: 'consumer-observation-c19',
  };

  await writeJson(path.join(root, 'c19-t2-rhythm-live-replay.json'), {
    ...base,
    status: 'pass',
    liveMutation: true,
    dbMutation: true,
    result: { status: 'pass', replaySampleCount: 3 },
  });
  await writeJson(path.join(root, 'c19-release-closure-artifact.json'), {
    ...base,
    status: 'manual_publication_candidate_ready',
    report: { status: 'manual_publication_candidate_ready' },
  });
  await writeJson(path.join(root, 'c19-release-closure-verification.json'), {
    ...base,
    status: 'pass',
    manualApproval: { status: 'pass' },
  });
  await writeJson(path.join(root, 'c19-manual-approval-preflight.json'), {
    ...base,
    status: 'pass',
    manualApproval: { status: 'pass' },
  });
  await writeJson(path.join(root, 'c19-runtime-publication-apply.json'), {
    ...base,
    status: 'pass',
    liveMutation: true,
    dbMutation: true,
    result: {
      status: 'runtime_apply_ready',
      publicationKey: 'publication-c19',
      insertedDependencyCount: 3,
      patchedPlanDateCount: 4,
    },
  });
  await writeJson(path.join(root, 'c19-impact-monitoring-observation.json'), {
    ...base,
    status: 'pass',
    liveMutation: true,
    dbMutation: true,
    result: { status: 'runtime_event_recorded', eventCount: 1 },
  });
  await writeJson(path.join(root, 'c19-runtime-rollback-saved-outcome.json'), {
    ...base,
    status: 'pass',
    liveMutation: true,
    dbMutation: true,
    result: {
      status: 'runtime_rollback_ready',
      rollbackPlanId: 'rollback-c19',
      dependencyRollbackCount: 3,
      planDateRollbackCount: 4,
    },
  });
  await writeJson(path.join(root, 'c19-construction-organization-e1-e3-e5.json'), {
    ...base,
    status: 'pass',
    liveMutation: true,
    dbMutation: true,
    result: {
      status: 'pass',
      e1RuntimeEvidence: {
        status: 'pass',
        evidenceLevel: 'E1',
        evidenceRef: 'runtime-publication-c19:E1',
        source: 'runtime_publication_apply',
      },
      e3RuntimeEvidence: {
        status: 'pass',
        evidenceLevel: 'E3',
        evidenceRef: 'runtime-publication-c19:E3',
        source: 'impact_monitoring_observation',
      },
      e5RuntimeEvidence: {
        status: 'pass',
        evidenceLevel: 'E5',
        evidenceRef: 'runtime-publication-c19:E5',
        source: 'runtime_rollback_saved_outcome',
      },
    },
  });
  await writeJson(path.join(root, 'c19-live-evidence-summary.json'), {
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

async function writeOldObjectArtifacts(root) {
  const discovery = {
    schemaVersion: 'workbuddy-old-object-drop-candidate-discovery/v1',
    generatedAt: '2026-06-29T03:00:00+08:00',
    discoveryMode: 'full_catalog',
    minNameHint: false,
    status: 'no_safe_candidate',
    databaseTarget: 'safe-test-db',
    candidateCount: 0,
    candidates: [],
    inspectedCount: 1,
    inspected: [
      {
        objectName: 'public.algorithm_asset_registry_view',
        rowCount: 0,
        hintScore: 0,
        dependencyStatus: 'pass',
        runtimeReferenceCount: 0,
      },
    ],
    physicalDropExecuted: false,
    boundary: {
      liveMutation: false,
      dbMutation: false,
    },
  };
  await writeJson(path.join(root, 'old-object-candidate-discovery.all.json'), discovery);
  await writeJson(path.join(root, 'legacy-object-drop-guard.initial.json'), {
    status: 'blocked',
    reasons: ['row_count_zero_not_sufficient'],
    candidates: [],
  });
  await writeJson(path.join(root, 'old-object-no-safe-candidate-closeout.json'), {
    schemaVersion: 'workbuddy-old-object-no-safe-candidate-closeout/v1',
    generatedAt: '2026-06-29T03:00:00+08:00',
    gateId: 'old-object-physical-drop-closeout',
    status: 'pass',
    closeoutMode: 'no_safe_candidate',
    databaseTarget: 'safe-test-db',
    discoveryRef: 'old-object-candidate-discovery.all.json',
    candidateCount: 0,
    candidates: [],
    inspectedCount: 1,
    physicalDropExecuted: false,
    liveMutation: false,
    dbMutation: false,
    boundary: {
      liveMutation: false,
      dbMutation: false,
      physicalDropExecuted: false,
    },
  });
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeText(filePath, value) {
  await writeFile(filePath, value, 'utf8');
}
