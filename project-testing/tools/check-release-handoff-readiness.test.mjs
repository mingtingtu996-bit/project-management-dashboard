import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkReleaseHandoffReadiness,
  parseArgs,
  writeHandoffReadinessReport,
} from './check-release-handoff-readiness.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const matrixPath = path.join(repoRoot, 'project-testing/matrix/release-test-matrix.json');

test('handoff template is intentionally not ready because unlock flags and required refs are blank', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-template-'));
  const handoffFile = path.join(root, 'handoff-template.json');

  try {
    await writeJson(handoffFile, incompleteHandoffTemplate());

    const report = await checkReleaseHandoffReadiness({
      handoffFile,
      matrixPath,
      now: new Date('2026-06-29T03:20:00+08:00'),
    });

    assert.equal(report.status, 'fail');
    assert.equal(report.readyToRun, false);
    assert.equal(report.blockedGateCount, 4);
    assert.ok(report.gates.some((gate) => gate.missingFlags.includes('--include-live')));
    assert.ok(report.gates.some((gate) => gate.missingFields.includes('live.authTokenRef')));
    assert.equal(report.secretLeakCount, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('complete handoff declaration passes readiness without embedding secrets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-ready-'));
  const handoffFile = path.join(root, 'handoff.json');

  try {
    await writeJson(handoffFile, completeHandoff());

    const report = await checkReleaseHandoffReadiness({
      handoffFile,
      matrixPath,
      now: new Date('2026-06-29T03:21:00+08:00'),
    });

    assert.equal(report.status, 'pass');
    assert.equal(report.readyToRun, true);
    assert.equal(report.readyGateCount, 4);
    assert.equal(report.secretLeakCount, 0);

    const outputs = await writeHandoffReadinessReport({
      report,
      outputPath: path.join(root, 'handoff-readiness.json'),
    });
    const summary = JSON.parse(await readFile(outputs.jsonPath, 'utf8'));
    const markdown = await readFile(outputs.markdownPath, 'utf8');

    assert.equal(summary.readyToRun, true);
    assert.match(markdown, /No blocking issues/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readiness check rejects inline secret fields even if required refs exist', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-secret-'));
  const handoffFile = path.join(root, 'handoff.json');
  const handoff = completeHandoff();
  handoff.gates['c18-l07-l15-live-diagnostics'].live.authToken = 'raw-jwt-value';
  handoff.gates['old-object-physical-drop-closeout'].db.databaseUrl = 'postgres://user:pass@example/db';

  try {
    await writeJson(handoffFile, handoff);

    const report = await checkReleaseHandoffReadiness({
      handoffFile,
      matrixPath,
    });

    assert.equal(report.status, 'fail');
    assert.equal(report.readyToRun, false);
    assert.equal(report.secretLeakCount, 2);
    assert.ok(report.gates.some((gate) => gate.blockingIssues.some((issue) => issue.code === 'inline-secret-present')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readiness check rejects placeholder handoff values in required fields', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-placeholder-'));
  const handoffFile = path.join(root, 'handoff.json');
  const handoff = completeHandoff();
  handoff.gates['c18-l07-l15-live-diagnostics'].live.baseUrl = 'https://production.example.invalid';
  handoff.gates['c18-l07-l15-live-diagnostics'].targets.projectId = 'production-project-id-required';
  handoff.gates['c19-runtime-publication-release-rollback'].release.phase1L5Ref = 'secure://production/phase1-l5-required';

  try {
    await writeJson(handoffFile, handoff);

    const report = await checkReleaseHandoffReadiness({
      handoffFile,
      matrixPath,
    });

    assert.equal(report.status, 'fail');
    assert.equal(report.readyToRun, false);
    assert.ok(report.gates.some((gate) => gate.placeholderFields.includes('live.baseUrl')));
    assert.ok(report.gates.some((gate) => gate.blockingIssues.some((issue) => issue.code === 'handoff-field-placeholder')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readiness check rejects env refs that point to empty, missing, example, or placeholder env values', async () => {
  const root = await mkdtemp(path.join(repoRoot, 'project-testing', 'tmp-handoff-env-ref-'));
  const handoffFile = path.join(root, 'handoff.json');
  const emptyEnvFile = path.join(root, 'server.production.env');
  const placeholderEnvFile = path.join(root, 'server.production.example');
  const handoff = completeHandoff();
  handoff.gates['c18-l07-l15-live-diagnostics'].live.authTokenRef = `env://${path.relative(repoRoot, emptyEnvFile).replace(/\\/g, '/')}#SUPABASE_SERVICE_KEY`;
  handoff.gates['old-object-physical-drop-closeout'].db.databaseTargetRef = `env://${path.relative(repoRoot, placeholderEnvFile).replace(/\\/g, '/')}#SUPABASE_MIGRATION_URL`;

  try {
    await writeFile(emptyEnvFile, '', 'utf8');
    await writeFile(placeholderEnvFile, 'SUPABASE_MIGRATION_URL=postgresql://postgres.<tenant-or-ref>:YOUR_DATABASE_PASSWORD_HERE@example.invalid/postgres\n', 'utf8');
    await writeJson(handoffFile, handoff);

    const report = await checkReleaseHandoffReadiness({
      handoffFile,
      matrixPath,
    });

    assert.equal(report.status, 'fail');
    assert.equal(report.readyToRun, false);
    assert.ok(report.gates.some((gate) => gate.blockingIssues.some((issue) => issue.code === 'env-ref-missing')));
    assert.ok(report.gates.some((gate) => gate.blockingIssues.some((issue) => issue.code === 'env-ref-placeholder')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readiness check supports scoped gate selection and argument parsing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-scoped-'));
  const handoffFile = path.join(root, 'handoff.json');

  try {
    await writeJson(handoffFile, completeHandoff());

    const report = await checkReleaseHandoffReadiness({
      handoffFile,
      matrixPath,
      gateIds: ['old-object-physical-drop-closeout'],
    });

    assert.equal(report.gateCount, 1);
    assert.equal(report.gates[0].id, 'old-object-physical-drop-closeout');
    assert.equal(report.gates[0].readyToRun, true);

    const parsed = parseArgs([
      '--handoff-file',
      handoffFile,
      '--gate',
      'old-object-physical-drop-closeout',
    ]);
    assert.deepEqual(parsed.gateIds, ['old-object-physical-drop-closeout']);
    assert.throws(() => parseArgs([]), /--handoff-file is required/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readiness check accepts server-side sanitized env presence without a runner-local production env file', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-server-env-'));
  const handoffFile = path.join(root, 'handoff.json');
  const handoff = completeHandoff();
  handoff.boundary = {
    serverSideDiscovery: true,
    envFileUploaded: false,
  };
  handoff.envPresence = {
    source: 'server-side-sanitized-signals',
    envFile: 'deploy/env/server.production.env',
    keyStatus: {
      SUPABASE_SERVICE_KEY: { present: true, nonEmpty: true },
      SUPABASE_MIGRATION_URL: { present: true, nonEmpty: true },
    },
  };
  handoff.gates['c18-l07-l15-live-diagnostics'].live.authTokenRef = 'env://deploy/env/server.production.env#SUPABASE_SERVICE_KEY';
  handoff.gates['old-object-physical-drop-closeout'].db.databaseTargetRef = 'env://deploy/env/server.production.env#SUPABASE_MIGRATION_URL';

  try {
    await writeJson(handoffFile, handoff);

    const report = await checkReleaseHandoffReadiness({
      handoffFile,
      matrixPath,
      gateIds: [
        'c18-l07-l15-live-diagnostics',
        'old-object-physical-drop-closeout',
      ],
    });

    assert.equal(report.status, 'pass');
    assert.equal(report.refIssueCount, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('old-object readiness accepts no-safe-candidate closeout refs without physical DROP refs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-handoff-no-safe-'));
  const handoffFile = path.join(root, 'handoff.json');
  const handoff = completeHandoff();
  const db = handoff.gates['old-object-physical-drop-closeout'].db;
  db.noSafeCandidateCloseoutRef = 'old-object-no-safe-candidate-closeout.json';
  db.candidateBundleRef = '';
  db.ddlExportRef = '';
  db.rollbackPlanRef = '';
  db.migrationWindow = '';

  try {
    await writeJson(handoffFile, handoff);

    const report = await checkReleaseHandoffReadiness({
      handoffFile,
      matrixPath,
      gateIds: ['old-object-physical-drop-closeout'],
    });

    assert.equal(report.status, 'pass');
    assert.equal(report.gates[0].readyToRun, true);
    assert.equal(report.gates[0].closeoutMode, 'no_safe_candidate');
    assert.equal(report.gates[0].missingFields.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function incompleteHandoffTemplate() {
  return {
    schemaVersion: 'workbuddy-release-handoff-input/v1',
    unlockFlags: {
      includeLive: false,
      confirmLiveHandoff: false,
      includeDb: false,
      confirmDbReady: false,
    },
    gates: {
      'c18-l07-l15-live-diagnostics': {
        live: {},
        targets: {},
        evidenceOwners: {},
      },
      'c15-live-learning-closeout': {
        live: {},
        targets: {},
        approvals: {},
        owners: {},
        evidenceOwners: {},
      },
      'c19-runtime-publication-release-rollback': {
        live: {},
        targets: {},
        release: {},
        approvals: {},
        owners: {},
      },
      'old-object-physical-drop-closeout': {
        db: {},
        approvals: {},
        owners: {},
      },
    },
  };
}

function completeHandoff() {
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
          baseUrl: 'https://workbuddy-production.testable.local',
          authTokenRef: 'secure://operator/live-jwt',
          environmentOwner: 'live-owner',
          writeApprovalRef: 'approval-c18',
          cleanupOwner: 'cleanup-owner',
          artifactRoot: 'project-testing/reports/release-live',
        },
        targets: {
          projectId: 'project-live-1',
          planId: 'plan-live-1',
        },
        evidenceOwners: {
          backendDiagnosticsOwner: 'backend-owner',
          databaseEvidenceOwner: 'db-owner',
          browserEvidenceOwner: 'browser-owner',
        },
      },
      'c15-live-learning-closeout': {
        live: {
          environmentOwner: 'live-owner',
          writeApprovalRef: 'approval-c15',
          artifactRoot: 'project-testing/reports/release-live',
        },
        targets: {
          companyId: 'company-live-1',
          projectId: 'project-live-1',
          candidateId: 'candidate-live-1',
          sampleCohortRef: 'secure://operator/c15-cohort',
        },
        approvals: {
          manualApprovalRef: 'approval-c15',
        },
        owners: {
          monitoringOwner: 'monitoring-owner',
          rollbackOwner: 'rollback-owner',
        },
        evidenceOwners: {
          learningLoopOwner: 'learning-owner',
          databaseEvidenceOwner: 'db-owner',
        },
      },
      'c19-runtime-publication-release-rollback': {
        live: {
          environmentOwner: 'live-owner',
          writeApprovalRef: 'approval-c19',
          artifactRoot: 'project-testing/reports/release-live',
        },
        targets: {
          companyId: 'company-live-1',
          projectId: 'project-live-1',
        },
        release: {
          phase1L5Ref: 'phase1-l5',
          releaseClosureArtifactRef: 'release-closure',
          rollbackTargetRef: 'rollback-target',
          monitoringWindow: '2026-06-29T03:00:00+08:00/PT30M',
        },
        approvals: {
          manualApprovalRef: 'approval-c19',
        },
        owners: {
          runtimePublicationOwner: 'runtime-owner',
          consumerObservationOwner: 'consumer-owner',
          monitoringOwner: 'monitoring-owner',
          rollbackOwner: 'rollback-owner',
        },
      },
      'old-object-physical-drop-closeout': {
        db: {
          databaseTargetRef: 'secure://operator/safe-test-db',
          databaseReadinessOwner: 'db-ready-owner',
          candidateBundleRef: 'old-object-drop-candidates.json',
          ddlExportRef: 'old-object-ddl-export.sql',
          rollbackPlanRef: 'old-object-rollback-plan.sql',
          migrationWindow: '2026-06-29T03:00:00+08:00/PT30M',
          backupLocationRef: 'secure://operator/db-backup',
          catalogReadbackOwner: 'catalog-owner',
          apiBrowserSmokeOwner: 'browser-owner',
        },
        approvals: {
          manualApprovalRef: 'approval-old-object',
        },
        owners: {
          migrationOwner: 'migration-owner',
          rollbackOwner: 'rollback-owner',
          postDropSmokeOwner: 'smoke-owner',
        },
      },
    },
  };
}
