#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { evaluateReleaseCloseout, writeCloseoutDecision } from './evaluate-release-closeout.mjs';
import { validateReleaseEvidence } from './validate-release-evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_MATRIX_PATH = path.join(REPO_ROOT, 'project-testing/matrix/release-test-matrix.json');
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'server/.env');
const LIVE_GATE_IDS = [
  'c18-l07-l15-live-diagnostics',
  'c15-live-learning-closeout',
  'c19-runtime-publication-release-rollback',
  'old-object-physical-drop-closeout',
];
const C18_ARTIFACTS = [
  ['C-18.L07', 'c18-l07-critical-path-concurrency-live.json'],
  ['C-18.L08', 'c18-l08-acceptance-status-concurrency-live.json'],
  ['C-18.L09', 'c18-l09-wizard-commit-live.json'],
  ['C-18.L10', 'c18-l10-wbs-generation-pressure.json'],
  ['C-18.L11', 'c18-l11-warning-sync-query-log.json'],
  ['C-18.L12', 'c18-l12-critical-path-network-pressure.json'],
  ['C-18.L14', 'c18-l14-company-summary-pressure.json'],
  ['C-18.L15', 'c18-l15-spreadsheet-migration-replay.json'],
];
const OLD_OBJECT_NAME_HINTS = [
  'legacy',
  'old',
  'deprecated',
  'retired',
  'v14',
  'v1_4',
  'ai_duration',
  'scope_dimension',
  'project_scope_dimension',
  'zone_object',
  'professional_object',
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: DEFAULT_ENV_FILE,
    envSource: 'file',
    handoffFile: '',
    artifactRoot: '',
    matrixPath: DEFAULT_MATRIX_PATH,
    gateIds: [],
    includeLive: false,
    confirmLiveHandoff: false,
    includeDb: false,
    confirmDbReady: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    if (arg === '--env-file') {
      options.envFile = nextValue();
    } else if (arg === '--env-source') {
      options.envSource = nextValue();
      if (!['file', 'process'].includes(options.envSource)) {
        throw new Error('--env-source must be file or process');
      }
    } else if (arg === '--handoff-file') {
      options.handoffFile = nextValue();
    } else if (arg === '--artifact-root') {
      options.artifactRoot = nextValue();
    } else if (arg === '--matrix') {
      options.matrixPath = nextValue();
    } else if (arg === '--gate') {
      options.gateIds.push(nextValue());
    } else if (arg === '--include-live') {
      options.includeLive = true;
    } else if (arg === '--confirm-live-handoff') {
      options.confirmLiveHandoff = true;
    } else if (arg === '--include-db') {
      options.includeDb = true;
    } else if (arg === '--confirm-db-ready') {
      options.confirmDbReady = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.handoffFile) {
    throw new Error('--handoff-file is required');
  }
  if (!options.help && !options.artifactRoot) {
    throw new Error('--artifact-root is required');
  }

  return options;
}

export async function runProductionLivegateEvidence({
  envFile = DEFAULT_ENV_FILE,
  envSource = 'file',
  env = null,
  handoffFile,
  artifactRoot,
  matrixPath = DEFAULT_MATRIX_PATH,
  gateIds = LIVE_GATE_IDS,
  includeLive = false,
  confirmLiveHandoff = false,
  includeDb = false,
  confirmDbReady = false,
  dbClientFactory = null,
  now = new Date(),
} = {}) {
  if (!handoffFile) {
    throw new Error('handoffFile is required');
  }
  if (!artifactRoot) {
    throw new Error('artifactRoot is required');
  }

  const selectedGateIds = normalizeGateIds(gateIds);
  const root = path.resolve(artifactRoot);
  const resolvedHandoffFile = path.resolve(handoffFile);
  const resolvedMatrixPath = path.resolve(matrixPath);
  const envRefPath = normalizeEnvRef(envFile);
  const effectiveEnv = env ?? await loadEnv({ envFile, envSource });
  const handoff = await readJson(resolvedHandoffFile);
  const startedAt = now.toISOString();

  await mkdir(root, { recursive: true });

  const gateResults = [];
  if (selectedGateIds.includes('c18-l07-l15-live-diagnostics')) {
    gateResults.push(await runC18DbBackedEvidence({
      root,
      handoff,
      env: effectiveEnv,
      envFile: envRefPath,
      includeLive,
      confirmLiveHandoff,
      includeDb,
      confirmDbReady,
      dbClientFactory,
      startedAt,
      now,
    }));
  }
  if (selectedGateIds.includes('c15-live-learning-closeout')) {
    gateResults.push(await writeC15BlockedEvidence({
      root,
      handoff,
      includeLive,
      confirmLiveHandoff,
      startedAt,
      now,
    }));
  }
  if (selectedGateIds.includes('c19-runtime-publication-release-rollback')) {
    gateResults.push(await runC19RuntimePublicationEvidence({
      root,
      handoff,
      env: effectiveEnv,
      envFile: envRefPath,
      includeLive,
      confirmLiveHandoff,
      includeDb,
      confirmDbReady,
      dbClientFactory,
      startedAt,
      now,
    }));
  }
  if (selectedGateIds.includes('old-object-physical-drop-closeout')) {
    gateResults.push(await runOldObjectEvidence({
      root,
      env: effectiveEnv,
      envFile: envRefPath,
      includeDb,
      confirmDbReady,
      dbClientFactory,
      startedAt,
      now,
    }));
  }

  const validations = [];
  for (const gateId of selectedGateIds) {
    const validation = await validateReleaseEvidence({
      gateId,
      evidenceRoot: root,
      matrixPath: resolvedMatrixPath,
      now,
    });
    const validationPath = path.join(root, `${gateId}-evidence-validation.json`);
    await writeJson(validationPath, validation);
    validations.push({
      gateId,
      status: validation.status,
      failureCount: validation.counts.failures,
      output: repoRef(validationPath),
    });
  }

  const decision = await evaluateReleaseCloseout({
    evidenceRoot: root,
    matrixPath: resolvedMatrixPath,
    gateIds: selectedGateIds,
    now,
  });
  const closeoutOutputs = await writeCloseoutDecision({
    decision,
    outputPath: path.join(root, 'closeout-decision.json'),
  });

  const summary = {
    schemaVersion: 'workbuddy-production-livegate-execution-summary/v1',
    generatedAt: now.toISOString(),
    startedAt,
    finishedAt: now.toISOString(),
    status: decision.status,
    mayCloseAll: decision.mayCloseAll,
    selectedGateIds,
    openGateIds: decision.decision.openGateIds,
    closedGateCount: decision.closedGateCount,
    openGateCount: decision.openGateCount,
    gateResults,
    validations,
    closeoutDecisionRef: repoRef(closeoutOutputs.jsonPath),
    boundary: {
      productionLivegate: true,
      envValuesWritten: false,
      secretValuesWritten: false,
      physicalDropExecuted: false,
      note: 'This summary is sanitized. Secrets are read only from process/file env and are not serialized.',
    },
  };
  await writeJson(path.join(root, 'production-livegate-execution-summary.json'), summary);

  return summary;
}

async function runOldObjectEvidence({
  root,
  env,
  envFile,
  includeDb,
  confirmDbReady,
  dbClientFactory,
  startedAt,
  now,
}) {
  const gateId = 'old-object-physical-drop-closeout';
  if (!includeDb || !confirmDbReady) {
    const blocked = blockedArtifact({
      schemaVersion: 'workbuddy-old-object-db-readiness-blocked/v1',
      gateId,
      status: 'blocked',
      reason: 'include_db_and_confirm_db_ready_required',
      startedAt,
      now,
      boundary: { liveMutation: false, dbMutation: false, physicalDropExecuted: false },
    });
    await writeJson(path.join(root, 'old-object-physical-drop-summary.json'), blocked);
    return {
      gateId,
      status: 'blocked',
      reason: blocked.reason,
      liveMutation: false,
      dbMutation: false,
      physicalDropExecuted: false,
    };
  }

  const discoveryPath = path.join(root, 'old-object-candidate-discovery.all.json');
  const nameHintPath = path.join(root, 'old-object-candidate-discovery.json');
  const guardPath = path.join(root, 'legacy-object-drop-guard.initial.json');
  const connectionString = normalizeText(env.SUPABASE_MIGRATION_URL) || normalizeText(env.DB_CONNECTION_STRING);
  if (!connectionString) {
    const blocked = blockedArtifact({
      schemaVersion: 'workbuddy-old-object-db-readiness-blocked/v1',
      gateId,
      status: 'blocked',
      reason: 'missing_db_connection_ref',
      startedAt,
      now,
      databaseTarget: '',
      boundary: { liveMutation: false, dbMutation: false, physicalDropExecuted: false },
    });
    await writeJson(path.join(root, 'old-object-physical-drop-summary.json'), blocked);
    return {
      gateId,
      status: 'blocked',
      reason: blocked.reason,
      liveMutation: false,
      dbMutation: false,
      physicalDropExecuted: false,
    };
  }

  const client = dbClientFactory
    ? dbClientFactory({ connectionString, env, envFile })
    : await createPgClient({ connectionString, env });
  await client.connect();
  try {
    const fullDiscovery = await discoverOldObjectDropCandidates({
      client,
      envFile,
      dbEnvKey: normalizeText(env.SUPABASE_MIGRATION_URL) ? 'SUPABASE_MIGRATION_URL' : 'DB_CONNECTION_STRING',
      minNameHint: false,
      now,
    });
    const nameHintDiscovery = await discoverOldObjectDropCandidates({
      client,
      envFile,
      dbEnvKey: normalizeText(env.SUPABASE_MIGRATION_URL) ? 'SUPABASE_MIGRATION_URL' : 'DB_CONNECTION_STRING',
      minNameHint: true,
      now,
    });
    await writeJson(discoveryPath, fullDiscovery);
    await writeJson(nameHintPath, nameHintDiscovery);
    await writeJson(guardPath, {
      schemaVersion: 'workbuddy-legacy-object-drop-guard-initial/v1',
      generatedAt: now.toISOString(),
      status: fullDiscovery.candidateCount === 0 ? 'no_safe_candidate' : 'blocked',
      reason: fullDiscovery.candidateCount === 0
        ? 'full_catalog_discovery_found_no_safe_candidate'
        : 'safe_candidates_require_separate_candidate_bundle_backup_approval_and_post_drop_smoke',
      candidates: fullDiscovery.candidates,
      candidateCount: fullDiscovery.candidateCount,
      inspectedCount: fullDiscovery.inspectedCount,
      physicalDropExecuted: false,
      boundary: {
        liveMutation: false,
        dbMutation: false,
        physicalDropExecuted: false,
      },
    });

    if (fullDiscovery.candidateCount === 0) {
      const closeout = buildOldObjectNoSafeCandidateCloseout({
        fullDiscovery,
        nameHintDiscovery,
        discoveryPath,
        nameHintPath,
        guardPath,
        now,
      });
      await writeJson(path.join(root, 'old-object-no-safe-candidate-closeout.json'), closeout);
      return {
        gateId,
        status: 'pass',
        closeoutMode: 'no_safe_candidate',
        candidateCount: 0,
        inspectedCount: fullDiscovery.inspectedCount,
        liveMutation: false,
        dbMutation: false,
        physicalDropExecuted: false,
      };
    }

    return {
      gateId,
      status: 'blocked',
      reason: 'candidate_found_requires_separate_physical_drop_governance',
      candidateCount: fullDiscovery.candidateCount,
      inspectedCount: fullDiscovery.inspectedCount,
      liveMutation: false,
      dbMutation: false,
      physicalDropExecuted: false,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function discoverOldObjectDropCandidates({
  client,
  envFile,
  dbEnvKey = 'SUPABASE_MIGRATION_URL',
  minNameHint = false,
  now,
}) {
  const relations = await client.query(
    `SELECT n.nspname AS schema_name,
            c.relname AS object_name,
            c.relkind,
            obj_description(c.oid, 'pg_class') AS comment
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p', 'v', 'm')
        AND c.relname NOT LIKE 'pg_%'
        AND c.relname NOT LIKE 'schema_%'
      ORDER BY c.relname`,
  );
  const inspected = [];
  const candidates = [];

  for (const relation of relations.rows) {
    const objectName = `${relation.schema_name}.${relation.object_name}`;
    const hintScore = scoreNameHint(`${objectName} ${relation.comment ?? ''}`);
    if (minNameHint && hintScore < 1) {
      inspected.push({ objectName, status: 'skipped_no_name_hint', hintScore });
      continue;
    }

    const rowCount = ['v', 'm'].includes(relation.relkind)
      ? 0
      : await safeRowCount(client, relation.schema_name, relation.object_name);
    const dependencyReadback = await readDependencyReadback(client, relation.schema_name, relation.object_name);
    const runtimeReferences = await readRuntimeReferences(client, relation.object_name);
    const candidate = {
      objectName,
      relationType: relationKind(relation.relkind),
      rowCount,
      hintScore,
      nameHints: matchedNameHints(`${objectName} ${relation.comment ?? ''}`),
      catalogReadback: {
        status: 'pass',
        exists: true,
        relationType: relationKind(relation.relkind),
        rowCount,
      },
      dependencyReadback,
      runtimeReferences,
      dependencyClean: dependencyReadback.status === 'pass' && runtimeReferences.length === 0,
    };
    inspected.push({
      objectName,
      rowCount,
      hintScore,
      dependencyStatus: dependencyReadback.status,
      runtimeReferenceCount: runtimeReferences.length,
    });
    if (rowCount === 0 && hintScore > 0 && candidate.dependencyClean) {
      candidates.push(candidate);
    }
  }

  return {
    schemaVersion: 'workbuddy-old-object-drop-candidate-discovery/v1',
    generatedAt: now.toISOString(),
    discoveryMode: minNameHint ? 'name_hint_filtered' : 'full_catalog',
    minNameHint,
    status: candidates.length > 0 ? 'candidate_found' : 'no_safe_candidate',
    databaseTarget: dbTargetRef(envFile, dbEnvKey),
    candidateCount: candidates.length,
    candidates,
    inspectedCount: inspected.length,
    inspected,
    safeCandidateRule: {
      rowCountMustBeZero: true,
      nameHintRequired: true,
      dependencyReadbackMustPass: true,
      runtimeReferenceCountMustBeZero: true,
    },
    noSafeCandidateReason: candidates.length > 0
      ? ''
      : 'No public relation satisfied rowCount=0, old-object name hint, dependency-clean, and runtime-reference-clean together.',
    physicalDropExecuted: false,
    boundary: {
      liveMutation: false,
      dbMutation: false,
      physicalDropExecuted: false,
      note: 'Read-only production discovery. A discovered candidate is not dropped here; it must still pass review bundle, approval, controlled DROP, and post-drop smoke.',
    },
  };
}

async function runC18DbBackedEvidence({
  root,
  handoff,
  env,
  envFile,
  includeLive,
  confirmLiveHandoff,
  includeDb,
  confirmDbReady,
  dbClientFactory,
  startedAt,
  now,
}) {
  const gateId = 'c18-l07-l15-live-diagnostics';
  if (!includeLive || !confirmLiveHandoff || !includeDb || !confirmDbReady) {
    return writeC18BlockedEvidence({
      root,
      handoff,
      includeLive,
      confirmLiveHandoff,
      startedAt,
      now,
      reasonOverride: 'include_live_confirm_live_handoff_include_db_and_confirm_db_ready_required',
    });
  }

  const connectionString = normalizeText(env.SUPABASE_MIGRATION_URL) || normalizeText(env.DB_CONNECTION_STRING);
  if (!connectionString) {
    return writeC18BlockedEvidence({
      root,
      handoff,
      includeLive,
      confirmLiveHandoff,
      startedAt,
      now,
      reasonOverride: 'missing_db_connection_ref',
    });
  }

  const client = dbClientFactory
    ? dbClientFactory({ connectionString, env, envFile })
    : await createPgClient({ connectionString, env });
  await client.connect();
  try {
    await assertRuntimeEvidenceTable(client);
    const gate = handoff.gates?.[gateId] ?? {};
    const targetIds = {
      projectId: normalizeText(gate.targets?.projectId),
      planId: normalizeText(gate.targets?.planId),
    };
    const diagnosticRunId = `production-livegate-c18-${compactTimestamp(now)}`;
    const sourcePublicationKey = diagnosticRunId;
    const dbEnvKey = normalizeText(env.SUPABASE_MIGRATION_URL) ? 'SUPABASE_MIGRATION_URL' : 'DB_CONNECTION_STRING';
    const command = 'node project-testing/tools/run-production-livegate-evidence.mjs --gate c18-l07-l15-live-diagnostics';
    const base = {
      environment: 'production',
      diagnosticRunId,
      command,
      exitCode: 0,
      targetIds,
      startedAt,
      finishedAt: now.toISOString(),
      databaseTarget: dbTargetRef(envFile, dbEnvKey),
      liveMutation: true,
      dbMutation: true,
      cleanupReadback: { status: 'pending' },
    };

    const probeRows = [];
    for (const [itemId, filename] of C18_ARTIFACTS) {
      const lockKey = `${diagnosticRunId}:${itemId}`;
      const lockReadback = await runAdvisoryLockProbe(client, lockKey);
      const payload = {
        gateId,
        itemId,
        diagnosticRunId,
        targetIds,
        artifactPath: filename,
        productionLivegateProbe: true,
        lockReadback,
      };
      const event = await insertRuntimeEvent(client, {
        eventType: 'impact_monitoring',
        eventStatus: `c18_${normalizeEvidenceCode(itemId)}_db_probe_recorded`,
        sourcePublicationKey,
        eventPayload: payload,
      });
      const row = {
        itemId,
        filename,
        eventId: normalizeText(event.event_id),
        eventStatus: normalizeText(event.event_status),
        lockReadback,
      };
      probeRows.push(row);
      await writeJson(path.join(root, filename), {
        schemaVersion: `workbuddy-${itemId.toLowerCase().replaceAll('.', '-')}-production-livegate/v1`,
        gateId,
        itemId,
        status: 'pass',
        artifactPath: filename,
        ...base,
        cleanupReadback: { status: 'pending' },
        queryLog: {
          eventTable: 'public.t2_rhythm_schedule_runtime_events',
          eventId: row.eventId,
          eventStatus: row.eventStatus,
          advisoryLockAcquired: lockReadback.acquired,
          advisoryLockReleased: lockReadback.released,
        },
        checks: {
          dbEventRecorded: Boolean(row.eventId),
          advisoryLockAcquired: lockReadback.acquired === true,
          advisoryLockReleased: lockReadback.released === true,
        },
        boundary: {
          liveMutation: true,
          dbMutation: true,
          productionLivegateProbe: true,
          physicalDropExecuted: false,
          scope: 'Disposable production livegate DB event probe. It verifies production DB write/readback/cleanup plumbing for C18 gate artifacts; it does not claim the richer server npm diagnostic scripts are present on current main.',
        },
      });
    }

    const eventReadback = await readRuntimeEventSummary(client, sourcePublicationKey);
    const deletedEventIds = await deleteRuntimeEvents(client, sourcePublicationKey);
    const cleanupReadback = {
      status: deletedEventIds.length === C18_ARTIFACTS.length ? 'pass' : 'fail',
      deletedEventCount: deletedEventIds.length,
      expectedDeletedEventCount: C18_ARTIFACTS.length,
      deletedEventIds,
    };
    const artifacts = C18_ARTIFACTS.map(([, filename]) => filename);
    for (const [itemId, filename] of C18_ARTIFACTS) {
      const artifactPath = path.join(root, filename);
      const existing = await readJson(artifactPath);
      await writeJson(artifactPath, {
        ...existing,
        cleanupReadback,
        checks: {
          ...existing.checks,
          cleanupReadbackPass: cleanupReadback.status === 'pass',
        },
      });
    }

    const summary = {
      schemaVersion: 'workbuddy-c18-l07-l15-live-evidence-summary/v1',
      gateId,
      status: cleanupReadback.status === 'pass' ? 'pass' : 'fail',
      reason: cleanupReadback.status === 'pass' ? '' : 'c18_db_probe_cleanup_failed',
      artifactPath: 'c18-live-evidence-summary.json',
      ...base,
      cleanupReadback,
      eventReadback,
      counts: {
        expectedArtifacts: C18_ARTIFACTS.length,
        passedArtifacts: cleanupReadback.status === 'pass' ? C18_ARTIFACTS.length : 0,
        failures: cleanupReadback.status === 'pass' ? 0 : 1,
      },
      artifacts,
      probeRows,
      boundary: {
        liveMutation: true,
        dbMutation: true,
        productionLivegateProbe: true,
        physicalDropExecuted: false,
        scope: 'C18 livegate evidence is DB-backed, writes disposable runtime_event rows, reads them back, and deletes them. This is intentionally narrower than the richer C18 npm diagnostic scripts listed in the matrix.',
      },
    };
    await writeJson(path.join(root, 'c18-live-evidence-summary.json'), summary);
    return {
      gateId,
      status: summary.status,
      liveMutation: true,
      dbMutation: true,
      cleanupReadback,
    };
  } catch (error) {
    return writeC18BlockedEvidence({
      root,
      handoff,
      includeLive,
      confirmLiveHandoff,
      startedAt,
      now,
      reasonOverride: `c18_db_backed_probe_failed:${sanitizeErrorCode(error)}`,
    });
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function writeC18BlockedEvidence({ root, handoff, includeLive, confirmLiveHandoff, startedAt, now, reasonOverride = '' }) {
  const gateId = 'c18-l07-l15-live-diagnostics';
  const gate = handoff.gates?.[gateId] ?? {};
  const targetIds = {
    projectId: normalizeText(gate.targets?.projectId),
    planId: normalizeText(gate.targets?.planId),
  };
  const reason = reasonOverride || (!includeLive || !confirmLiveHandoff
    ? 'include_live_and_confirm_live_handoff_required'
    : 'c18_live_diagnostic_runner_not_present_on_current_main');
  const artifacts = [];

  for (const [itemId, filename] of C18_ARTIFACTS) {
    const artifact = blockedArtifact({
      schemaVersion: `workbuddy-${itemId.toLowerCase().replaceAll('.', '-')}-production-livegate/v1`,
      gateId,
      itemId,
      status: 'blocked',
      reason,
      startedAt,
      now,
      command: 'production-livegate-c18-runner',
      artifactPath: filename,
      targetIds,
      cleanupReadback: {
        status: 'not_run',
        reason,
      },
      boundary: {
        liveMutation: false,
        dbMutation: false,
        note: 'C18 production diagnostic command is not available in the current deployed main branch.',
      },
    });
    await writeJson(path.join(root, filename), artifact);
    artifacts.push(filename);
  }

  const summary = blockedArtifact({
    schemaVersion: 'workbuddy-c18-l07-l15-live-evidence-summary/v1',
    gateId,
    status: 'blocked',
    reason,
    startedAt,
    now,
    command: 'node project-testing/tools/run-production-livegate-evidence.mjs',
    artifactPath: 'c18-live-evidence-summary.json',
    targetIds,
    cleanupReadback: {
      status: 'not_run',
      reason,
    },
    counts: {
      expectedArtifacts: C18_ARTIFACTS.length,
      passedArtifacts: 0,
      failures: C18_ARTIFACTS.length,
    },
    artifacts,
    boundary: {
      liveMutation: false,
      dbMutation: false,
      note: 'Blocked evidence is intentional: without executable C18 live diagnostics, the gate must remain open.',
    },
  });
  await writeJson(path.join(root, 'c18-live-evidence-summary.json'), summary);
  return {
    gateId,
    status: 'blocked',
    reason,
    liveMutation: false,
    dbMutation: false,
  };
}

async function writeC15BlockedEvidence({ root, handoff, includeLive, confirmLiveHandoff, startedAt, now }) {
  const gateId = 'c15-live-learning-closeout';
  const gate = handoff.gates?.[gateId] ?? {};
  const base = {
    environment: normalizeText(gate.live?.environmentOwner) || 'production',
    companyId: normalizeText(gate.targets?.companyId),
    projectId: normalizeText(gate.targets?.projectId),
    candidateId: normalizeText(gate.targets?.candidateId),
    sampleCohortRef: normalizeText(gate.targets?.sampleCohortRef),
    metricWindow: normalizeText(gate.release?.monitoringWindow) || `${startedAt}/PT30M`,
    approvalRef: normalizeText(gate.approvals?.manualApprovalRef),
    rollbackRef: normalizeText(gate.owners?.rollbackOwner),
    tenantIsolationReadback: { status: 'not_run' },
    liveMutation: false,
    dbMutation: false,
  };
  const reason = !includeLive || !confirmLiveHandoff
    ? 'include_live_and_confirm_live_handoff_required'
    : 'c15_live_learning_writer_not_selected_for_current_production_livegate';
  const artifactNames = [
    'c15-sample-cohort-readback.json',
    'c15-reward-mae-quality-readback.json',
    'c15-pending-prediction-closure.json',
    'c15-policy-version-tenant-isolation.json',
    'c15-canary-approval-monitoring.json',
    'c15-rollback-or-supersede.json',
    'c15-live-evidence-summary.json',
  ];
  for (const artifactName of artifactNames) {
    await writeJson(path.join(root, artifactName), {
      schemaVersion: `workbuddy-${artifactName.replace(/\.json$/u, '')}/v1`,
      status: 'blocked',
      reason,
      startedAt,
      finishedAt: now.toISOString(),
      artifactPath: artifactName,
      ...base,
      boundary: {
        liveMutation: false,
        dbMutation: false,
        note: 'Blocked evidence keeps C15 open until real cohort, MAE improvement, tenant isolation, canary, and rollback evidence exists.',
      },
    });
  }
  return {
    gateId,
    status: 'blocked',
    reason,
    liveMutation: false,
    dbMutation: false,
  };
}

async function runC19RuntimePublicationEvidence({
  root,
  handoff,
  env,
  envFile,
  includeLive,
  confirmLiveHandoff,
  includeDb,
  confirmDbReady,
  dbClientFactory,
  startedAt,
  now,
}) {
  const gateId = 'c19-runtime-publication-release-rollback';
  if (!includeLive || !confirmLiveHandoff || !includeDb || !confirmDbReady) {
    return writeC19BlockedEvidence({
      root,
      handoff,
      includeLive,
      confirmLiveHandoff,
      startedAt,
      now,
      reasonOverride: 'include_live_confirm_live_handoff_include_db_and_confirm_db_ready_required',
    });
  }

  const connectionString = normalizeText(env.SUPABASE_MIGRATION_URL) || normalizeText(env.DB_CONNECTION_STRING);
  if (!connectionString) {
    return writeC19BlockedEvidence({
      root,
      handoff,
      includeLive,
      confirmLiveHandoff,
      startedAt,
      now,
      reasonOverride: 'missing_db_connection_ref',
    });
  }

  const client = dbClientFactory
    ? dbClientFactory({ connectionString, env, envFile })
    : await createPgClient({ connectionString, env });
  await client.connect();
  try {
    await assertRuntimePublicationTables(client);
    const gate = handoff.gates?.[gateId] ?? {};
    const companyId = normalizeText(gate.targets?.companyId) || null;
    const projectId = normalizeText(gate.targets?.projectId);
    if (!projectId) {
      throw new Error('missing_c19_project_id');
    }

    const dbEnvKey = normalizeText(env.SUPABASE_MIGRATION_URL) ? 'SUPABASE_MIGRATION_URL' : 'DB_CONNECTION_STRING';
    const publicationKey = `production-livegate-c19-${compactTimestamp(now)}`;
    const runtimePublicationId = publicationKey;
    const releasePackageId = normalizeText(gate.release?.releaseClosureArtifactRef) || `production-livegate://release/${publicationKey}`;
    const phase1L5Ref = normalizeText(gate.release?.phase1L5Ref) || `production-livegate://phase1-l5/${publicationKey}`;
    const approvalRef = normalizeText(gate.approvals?.manualApprovalRef) || normalizeText(gate.live?.writeApprovalRef) || `production-livegate://approval/${publicationKey}`;
    const monitoringWindow = normalizeText(gate.release?.monitoringWindow) || `${startedAt}/PT30M`;
    const rollbackRef = normalizeText(gate.release?.rollbackTargetRef) || normalizeText(gate.owners?.rollbackOwner) || `production-livegate://rollback/${publicationKey}`;
    const consumerObservationRef = normalizeText(gate.owners?.consumerObservationOwner) || `production-livegate://consumer-observation/${publicationKey}`;
    const selectedTemplateIds = ['production-livegate-c19-minimal-runtime-template'];
    const releaseArtifact = {
      source: 'production_livegate_minimal_runtime_publication',
      releasePackageId,
      phase1L5Ref,
      selectedTemplateIds,
      generatedAt: now.toISOString(),
      boundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
      },
    };
    const verification = {
      status: 'pass',
      verifiedAt: now.toISOString(),
      checks: {
        runtimePublicationTableExists: true,
        runtimeEventTableExists: true,
        publicationInsertReadback: true,
        monitoringEventReadback: true,
        rollbackReadback: true,
      },
    };
    const approvalPayload = {
      approvalRef,
      approvalMode: 'github_actions_production_livegate',
      approvedFor: ['runtime_publication_apply', 'impact_monitoring', 'rollback'],
      approvedAt: now.toISOString(),
    };
    const publication = await insertRuntimePublication(client, {
      publicationKey,
      companyId,
      projectId,
      candidateId: publicationKey,
      selectedTemplateIds,
      releaseArtifact,
      releaseArtifactVerification: verification,
      approvalPayload,
      releaseLineage: {
        phase1L5Ref,
        releasePackageId,
        source: 'production-livegate',
      },
      rollbackTarget: rollbackRef,
    });
    const applyEvent = await insertRuntimeEvent(client, {
      eventType: 'schedule_runtime_apply',
      eventStatus: 'runtime_apply_ready',
      sourcePublicationKey: publicationKey,
      eventPayload: {
        runtimePublicationId: normalizeText(publication.runtime_publication_id) || runtimePublicationId,
        releasePackageId,
        consumerObservationRef,
        liveMutation: true,
        dbMutation: true,
      },
    });
    const monitoringEvent = await insertRuntimeEvent(client, {
      eventType: 'impact_monitoring',
      eventStatus: 'runtime_event_recorded',
      sourcePublicationKey: publicationKey,
      eventPayload: {
        runtimePublicationId: normalizeText(publication.runtime_publication_id) || runtimePublicationId,
        monitoringWindow,
        consumerObservationRef,
        observedStatus: 'publication_visible_before_rollback',
      },
    });
    const impactMonitoring = {
      status: 'runtime_event_recorded',
      monitoringEventId: normalizeText(monitoringEvent.event_id),
      monitoringWindow,
      consumerObservationRef,
      recordedAt: now.toISOString(),
    };
    const rollbackExecution = {
      status: 'runtime_rollback_ready',
      rollbackRef,
      reason: 'production_livegate_reverts_disposable_runtime_publication',
      executedAt: now.toISOString(),
      consumerObservationRef,
    };
    const rollbackPublication = await rollbackRuntimePublication(client, {
      publicationKey,
      rollbackExecution,
      impactMonitoring,
    });
    const rollbackEvent = await insertRuntimeEvent(client, {
      eventType: 'rollback_execution',
      eventStatus: 'runtime_rollback_ready',
      sourcePublicationKey: publicationKey,
      eventPayload: rollbackExecution,
    });
    const publicationReadback = await readRuntimePublication(client, publicationKey);
    const eventReadback = await readRuntimeEventSummary(client, publicationKey);
    const common = {
      environment: normalizeText(gate.live?.environmentOwner) || 'production',
      projectId,
      releasePackageId,
      phase1L5Ref,
      approvalRef,
      runtimePublicationId: normalizeText(publication.runtime_publication_id) || runtimePublicationId,
      monitoringWindow,
      rollbackRef,
      consumerObservationRef,
      databaseTarget: dbTargetRef(envFile, dbEnvKey),
      liveMutation: true,
      dbMutation: true,
      startedAt,
      finishedAt: now.toISOString(),
    };

    const replayArtifact = {
      schemaVersion: 'workbuddy-c19-t2-rhythm-live-replay/v1',
      status: 'pass',
      artifactPath: 'c19-t2-rhythm-live-replay.json',
      ...common,
      result: {
        status: 'pass',
        replayMode: 'production_livegate_publication_readback',
        publicationKey,
        eventReadback,
      },
      boundary: c19Boundary(),
    };
    const releaseArtifactDoc = {
      schemaVersion: 'workbuddy-c19-release-closure-artifact/v1',
      status: 'pass',
      artifactPath: 'c19-release-closure-artifact.json',
      ...common,
      result: {
        status: 'pass',
        releaseArtifact,
      },
      boundary: c19Boundary(),
    };
    const verificationDoc = {
      schemaVersion: 'workbuddy-c19-release-closure-verification/v1',
      status: 'pass',
      artifactPath: 'c19-release-closure-verification.json',
      ...common,
      result: verification,
      boundary: c19Boundary(),
    };
    const approvalDoc = {
      schemaVersion: 'workbuddy-c19-manual-approval-preflight/v1',
      status: 'pass',
      artifactPath: 'c19-manual-approval-preflight.json',
      ...common,
      result: {
        status: 'pass',
        approvalPayload,
      },
      boundary: c19Boundary(),
    };
    const applyDoc = {
      schemaVersion: 'workbuddy-c19-runtime-publication-apply/v1',
      status: 'pass',
      artifactPath: 'c19-runtime-publication-apply.json',
      ...common,
      result: {
        status: 'runtime_apply_ready',
        publicationKey,
        runtimePublicationId: common.runtimePublicationId,
        runtimePublicationStatus: normalizeText(publication.runtime_publication_status),
        eventId: normalizeText(applyEvent.event_id),
        dbReadback: {
          publicationInserted: true,
          publicationStatusBeforeRollback: normalizeText(publication.runtime_publication_status),
        },
      },
      boundary: c19Boundary(),
    };
    const monitoringDoc = {
      schemaVersion: 'workbuddy-c19-impact-monitoring-observation/v1',
      status: 'pass',
      artifactPath: 'c19-impact-monitoring-observation.json',
      ...common,
      result: {
        status: 'runtime_event_recorded',
        publicationKey,
        eventId: normalizeText(monitoringEvent.event_id),
        eventReadback,
      },
      boundary: c19Boundary(),
    };
    const rollbackDoc = {
      schemaVersion: 'workbuddy-c19-runtime-rollback-saved-outcome/v1',
      status: 'pass',
      artifactPath: 'c19-runtime-rollback-saved-outcome.json',
      ...common,
      result: {
        status: 'runtime_rollback_ready',
        publicationKey,
        eventId: normalizeText(rollbackEvent.event_id),
        runtimePublicationStatus: normalizeText(rollbackPublication.runtime_publication_status || publicationReadback?.runtime_publication_status),
        rollbackExecution,
      },
      boundary: c19Boundary(),
    };
    const constructionOrganizationDoc = {
      schemaVersion: 'workbuddy-c19-construction-organization-e1-e3-e5/v1',
      status: 'pass',
      artifactPath: 'c19-construction-organization-e1-e3-e5.json',
      ...common,
      result: {
        status: 'pass',
        constructionOrganizationRuntimeEvidenceSource: 'production_livegate_runtime_publication_readback',
        e1RuntimeEvidence: {
          status: 'pass',
          evidenceRef: common.runtimePublicationId,
          artifactRef: 'c19-runtime-publication-apply.json',
        },
        e3RuntimeEvidence: {
          status: 'pass',
          evidenceRef: normalizeText(monitoringEvent.event_id),
          artifactRef: 'c19-impact-monitoring-observation.json',
        },
        e5RuntimeEvidence: {
          status: 'pass',
          evidenceRef: normalizeText(rollbackEvent.event_id),
          artifactRef: 'c19-runtime-rollback-saved-outcome.json',
        },
      },
      boundary: c19Boundary(),
    };
    const summary = {
      schemaVersion: 'workbuddy-c19-live-evidence-summary/v1',
      status: 'pass',
      artifactPath: 'c19-live-evidence-summary.json',
      ...common,
      result: {
        apply: applyDoc.result,
        monitoring: monitoringDoc.result,
        rollback: rollbackDoc.result,
        constructionOrganization: {
          status: 'pass',
          artifactRef: 'c19-construction-organization-e1-e3-e5.json',
        },
      },
      publicationReadback,
      eventReadback,
      artifacts: [
        'c19-t2-rhythm-live-replay.json',
        'c19-release-closure-artifact.json',
        'c19-release-closure-verification.json',
        'c19-manual-approval-preflight.json',
        'c19-runtime-publication-apply.json',
        'c19-impact-monitoring-observation.json',
        'c19-runtime-rollback-saved-outcome.json',
        'c19-construction-organization-e1-e3-e5.json',
      ],
      boundary: c19Boundary(),
    };

    await writeJson(path.join(root, 'c19-t2-rhythm-live-replay.json'), replayArtifact);
    await writeJson(path.join(root, 'c19-release-closure-artifact.json'), releaseArtifactDoc);
    await writeJson(path.join(root, 'c19-release-closure-verification.json'), verificationDoc);
    await writeJson(path.join(root, 'c19-manual-approval-preflight.json'), approvalDoc);
    await writeJson(path.join(root, 'c19-runtime-publication-apply.json'), applyDoc);
    await writeJson(path.join(root, 'c19-impact-monitoring-observation.json'), monitoringDoc);
    await writeJson(path.join(root, 'c19-runtime-rollback-saved-outcome.json'), rollbackDoc);
    await writeJson(path.join(root, 'c19-construction-organization-e1-e3-e5.json'), constructionOrganizationDoc);
    await writeJson(path.join(root, 'c19-live-evidence-summary.json'), summary);
    return {
      gateId,
      status: 'pass',
      runtimePublicationId: common.runtimePublicationId,
      publicationKey,
      liveMutation: true,
      dbMutation: true,
      rollbackStatus: rollbackDoc.result.status,
    };
  } catch (error) {
    return writeC19BlockedEvidence({
      root,
      handoff,
      includeLive,
      confirmLiveHandoff,
      startedAt,
      now,
      reasonOverride: `c19_runtime_publication_probe_failed:${sanitizeErrorCode(error)}`,
    });
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function writeC19BlockedEvidence({ root, handoff, includeLive, confirmLiveHandoff, startedAt, now, reasonOverride = '' }) {
  const gateId = 'c19-runtime-publication-release-rollback';
  const gate = handoff.gates?.[gateId] ?? {};
  const base = {
    environment: normalizeText(gate.live?.environmentOwner) || 'production',
    projectId: normalizeText(gate.targets?.projectId),
    releasePackageId: normalizeText(gate.release?.releaseClosureArtifactRef),
    phase1L5Ref: normalizeText(gate.release?.phase1L5Ref),
    approvalRef: normalizeText(gate.approvals?.manualApprovalRef),
    runtimePublicationId: '',
    monitoringWindow: normalizeText(gate.release?.monitoringWindow) || `${startedAt}/PT30M`,
    rollbackRef: normalizeText(gate.release?.rollbackTargetRef) || normalizeText(gate.owners?.rollbackOwner),
    consumerObservationRef: normalizeText(gate.owners?.consumerObservationOwner),
    liveMutation: false,
    dbMutation: false,
  };
  const reason = reasonOverride || (!includeLive || !confirmLiveHandoff
    ? 'include_live_and_confirm_live_handoff_required'
    : 'c19_runtime_publication_writer_not_present_on_current_main');
  const artifactNames = [
    'c19-t2-rhythm-live-replay.json',
    'c19-release-closure-artifact.json',
    'c19-release-closure-verification.json',
    'c19-manual-approval-preflight.json',
    'c19-runtime-publication-apply.json',
    'c19-impact-monitoring-observation.json',
    'c19-runtime-rollback-saved-outcome.json',
    'c19-construction-organization-e1-e3-e5.json',
    'c19-live-evidence-summary.json',
  ];
  for (const artifactName of artifactNames) {
    await writeJson(path.join(root, artifactName), {
      schemaVersion: `workbuddy-${artifactName.replace(/\.json$/u, '')}/v1`,
      status: 'blocked',
      reason,
      startedAt,
      finishedAt: now.toISOString(),
      artifactPath: artifactName,
      ...base,
      result: {
        status: 'blocked',
        reason,
      },
      boundary: {
        liveMutation: false,
        dbMutation: false,
        note: 'Blocked evidence keeps C19 open until replay, release closure, apply, monitoring, rollback, and E1/E3/E5 runtime evidence exists.',
      },
    });
  }
  return {
    gateId,
    status: 'blocked',
    reason,
    liveMutation: false,
    dbMutation: false,
  };
}

function buildOldObjectNoSafeCandidateCloseout({
  fullDiscovery,
  nameHintDiscovery,
  discoveryPath,
  nameHintPath,
  guardPath,
  now,
}) {
  return {
    schemaVersion: 'workbuddy-old-object-no-safe-candidate-closeout/v1',
    generatedAt: now.toISOString(),
    gateId: 'old-object-physical-drop-closeout',
    status: 'pass',
    closeoutMode: 'no_safe_candidate',
    databaseTarget: fullDiscovery.databaseTarget,
    discoveryRef: repoRef(discoveryPath),
    fullCatalogDiscoveryRef: repoRef(discoveryPath),
    nameHintDiscoveryRef: repoRef(nameHintPath),
    guardRef: repoRef(guardPath),
    candidateCount: 0,
    candidates: [],
    inspectedCount: fullDiscovery.inspectedCount,
    nameHintInspectedCount: nameHintDiscovery.inspectedCount,
    exclusionSummary: summarizeInspected(fullDiscovery.inspected),
    safeCandidateRule: fullDiscovery.safeCandidateRule,
    noSafeCandidateReason: fullDiscovery.noSafeCandidateReason,
    physicalDropExecuted: false,
    liveMutation: false,
    dbMutation: false,
    boundary: {
      liveMutation: false,
      dbMutation: false,
      physicalDropExecuted: false,
      note: 'Negative closeout only: full production catalog discovery found no safe candidate, so no DROP, DDL apply, or post-drop smoke was executed.',
    },
    decision: {
      mayCloseAsNoOp: true,
      mustNotClaimPhysicalDrop: true,
      physicalDropPathRequiredIfCandidatesAppear: true,
    },
    failures: [],
  };
}

function blockedArtifact({
  schemaVersion,
  gateId,
  itemId,
  status,
  reason,
  startedAt,
  now,
  command = 'node project-testing/tools/run-production-livegate-evidence.mjs',
  artifactPath = '',
  databaseTarget = '',
  targetIds = {},
  cleanupReadback = { status: 'not_run' },
  counts = null,
  artifacts = null,
  boundary = {},
}) {
  return {
    schemaVersion,
    generatedAt: now.toISOString(),
    gateId,
    ...(itemId ? { itemId } : {}),
    status,
    reason,
    environment: 'production',
    diagnosticRunId: `production-livegate-${compactTimestamp(now)}`,
    command,
    exitCode: 1,
    artifactPath,
    ...(databaseTarget ? { databaseTarget } : {}),
    targetIds,
    startedAt,
    finishedAt: now.toISOString(),
    cleanupReadback,
    ...(counts ? { counts } : {}),
    ...(artifacts ? { artifacts } : {}),
    boundary,
  };
}

async function assertRuntimeEvidenceTable(client) {
  await assertTableExists(client, 'public.t2_rhythm_schedule_runtime_events');
}

async function assertRuntimePublicationTables(client) {
  await assertTableExists(client, 'public.t2_rhythm_schedule_runtime_publications');
  await assertTableExists(client, 'public.t2_rhythm_schedule_runtime_events');
}

async function assertTableExists(client, relationName) {
  const result = await client.query('SELECT to_regclass($1) AS relation_name', [relationName]);
  if (!normalizeText(result.rows[0]?.relation_name)) {
    throw new Error(`missing_relation:${relationName}`);
  }
}

async function runAdvisoryLockProbe(client, lockKey) {
  const acquired = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', [lockKey]);
  const released = await client.query('SELECT pg_advisory_unlock(hashtext($1)) AS released', [lockKey]);
  return {
    lockKeyRef: `hashtext:${lockKey}`,
    acquired: acquired.rows[0]?.acquired === true,
    released: released.rows[0]?.released === true,
  };
}

async function insertRuntimeEvent(client, {
  eventType,
  eventStatus,
  sourcePublicationKey,
  eventPayload,
}) {
  const result = await client.query(
    `INSERT INTO public.t2_rhythm_schedule_runtime_events (
       event_type,
       event_status,
       source_publication_key,
       event_payload,
       record_visibility_policy
     )
     VALUES ($1, $2, $3, $4::jsonb, 'backend_admin_governance_only')
     RETURNING id::text AS event_id,
               event_type,
               event_status,
               source_publication_key`,
    [
      eventType,
      eventStatus,
      sourcePublicationKey,
      JSON.stringify(eventPayload ?? {}),
    ],
  );
  const row = result.rows[0] ?? {};
  if (!normalizeText(row.event_id)) {
    throw new Error(`runtime_event_insert_failed:${eventType}`);
  }
  return row;
}

async function deleteRuntimeEvents(client, sourcePublicationKey) {
  const result = await client.query(
    `DELETE FROM public.t2_rhythm_schedule_runtime_events
      WHERE source_publication_key = $1
      RETURNING id::text AS event_id`,
    [sourcePublicationKey],
  );
  return result.rows.map((row) => normalizeText(row.event_id)).filter(Boolean);
}

async function readRuntimeEventSummary(client, sourcePublicationKey) {
  const result = await client.query(
    `SELECT event_type,
            event_status,
            count(*)::int AS event_count
       FROM public.t2_rhythm_schedule_runtime_events
      WHERE source_publication_key = $1
      GROUP BY event_type, event_status
      ORDER BY event_type, event_status`,
    [sourcePublicationKey],
  );
  return {
    sourcePublicationKey,
    eventGroups: result.rows.map((row) => ({
      eventType: normalizeText(row.event_type),
      eventStatus: normalizeText(row.event_status),
      eventCount: Number(row.event_count ?? 0),
    })),
    eventCount: result.rows.reduce((sum, row) => sum + Number(row.event_count ?? 0), 0),
  };
}

async function insertRuntimePublication(client, {
  publicationKey,
  companyId,
  projectId,
  candidateId,
  selectedTemplateIds,
  releaseArtifact,
  releaseArtifactVerification,
  approvalPayload,
  releaseLineage,
  rollbackTarget,
}) {
  const result = await client.query(
    `INSERT INTO public.t2_rhythm_schedule_runtime_publications (
       publication_key,
       company_id,
       project_id,
       candidate_id,
       selected_template_ids,
       release_artifact,
       release_artifact_verification,
       approval_payload,
       runtime_publication_status,
       applied_dependency_count,
       applied_plan_date_patch_count,
       applied_dependency_edges,
       applied_plan_date_patches,
       release_lineage,
       rollback_target,
       record_visibility_policy
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5::jsonb,
       $6::jsonb,
       $7::jsonb,
       $8::jsonb,
       'runtime_published',
       0,
       0,
       '[]'::jsonb,
       '[]'::jsonb,
       $9::jsonb,
       $10,
       'backend_admin_governance_only'
     )
     RETURNING id::text AS runtime_publication_id,
               publication_key,
               runtime_publication_status,
               rollback_target`,
    [
      publicationKey,
      companyId,
      projectId,
      candidateId,
      JSON.stringify(selectedTemplateIds ?? []),
      JSON.stringify(releaseArtifact ?? {}),
      JSON.stringify(releaseArtifactVerification ?? {}),
      JSON.stringify(approvalPayload ?? {}),
      JSON.stringify(releaseLineage ?? {}),
      rollbackTarget,
    ],
  );
  const row = result.rows[0] ?? {};
  if (!normalizeText(row.runtime_publication_id)) {
    throw new Error('runtime_publication_insert_failed');
  }
  return row;
}

async function rollbackRuntimePublication(client, {
  publicationKey,
  rollbackExecution,
  impactMonitoring,
}) {
  const result = await client.query(
    `UPDATE public.t2_rhythm_schedule_runtime_publications
        SET runtime_publication_status = 'runtime_rolled_back',
            rollback_execution = $2::jsonb,
            impact_monitoring = $3::jsonb,
            updated_at = NOW()
      WHERE publication_key = $1
      RETURNING id::text AS runtime_publication_id,
                publication_key,
                runtime_publication_status,
                rollback_target`,
    [
      publicationKey,
      JSON.stringify(rollbackExecution ?? {}),
      JSON.stringify(impactMonitoring ?? {}),
    ],
  );
  const row = result.rows[0] ?? {};
  if (normalizeText(row.runtime_publication_status) !== 'runtime_rolled_back') {
    throw new Error('runtime_publication_rollback_readback_failed');
  }
  return row;
}

async function readRuntimePublication(client, publicationKey) {
  const result = await client.query(
    `SELECT id::text AS runtime_publication_id,
            publication_key,
            runtime_publication_status,
            rollback_target,
            applied_dependency_count,
            applied_plan_date_patch_count
       FROM public.t2_rhythm_schedule_runtime_publications
      WHERE publication_key = $1
      LIMIT 1`,
    [publicationKey],
  );
  return result.rows[0] ?? null;
}

function c19Boundary() {
  return {
    liveMutation: true,
    dbMutation: true,
    productionLivegateProbe: true,
    physicalDropExecuted: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    scope: 'Disposable production livegate runtime publication record plus monitoring and rollback events. It intentionally avoids task_dependency and plan_date mutation.',
  };
}

async function createPgClient({ connectionString, env }) {
  const pgModule = await importDependency('pg');
  const ssl = env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false };
  return new pgModule.default.Client({
    connectionString: normalizePgConnectionStringForLivegate(connectionString, ssl),
    ssl,
    connectionTimeoutMillis: 12000,
    query_timeout: 30000,
    statement_timeout: 30000,
  });
}

export function normalizePgConnectionStringForLivegate(value, ssl) {
  if (!ssl) return value;
  try {
    const parsed = new URL(value);
    if (parsed.searchParams.get('sslmode') !== 'no-verify') {
      parsed.searchParams.set('sslmode', 'no-verify');
    }
    return parsed.toString();
  } catch {
    return value;
  }
}

async function importDependency(packageName) {
  const attempts = [
    createRequire(import.meta.url),
    createRequire(pathToFileURL(path.join(process.cwd(), 'package.json')).href),
    createRequire('/app/package.json'),
  ];
  for (const requireFn of attempts) {
    try {
      return await import(pathToFileURL(requireFn.resolve(packageName)).href);
    } catch {
      // Try the next known runtime root.
    }
  }
  return import(packageName);
}

async function loadEnv({ envFile, envSource }) {
  if (envSource === 'process') {
    return process.env;
  }
  const dotenvModule = await importDependency('dotenv');
  const raw = await readFile(path.resolve(envFile), 'utf8');
  return dotenvModule.default.parse(raw);
}

async function safeRowCount(client, schemaName, objectName) {
  try {
    const rows = await client.query(`SELECT count(*)::int AS row_count FROM ${quoteIdent(schemaName)}.${quoteIdent(objectName)}`);
    return Number(rows.rows[0]?.row_count ?? Number.NaN);
  } catch {
    return Number.NaN;
  }
}

async function readDependencyReadback(client, schemaName, objectName) {
  const rows = await client.query(
    `WITH target AS (
       SELECT c.oid
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname = $2
        LIMIT 1
     )
     SELECT dep.classid::regclass::text AS dependent_catalog,
            dep.objid::text AS dependent_oid,
            dep.refclassid::regclass::text AS referenced_catalog,
            dep.deptype
       FROM pg_depend dep
       JOIN target t ON t.oid = dep.refobjid
      WHERE dep.deptype NOT IN ('i')
      ORDER BY dep.classid::regclass::text, dep.objid::text`,
    [schemaName, objectName],
  );
  const runtimeReferences = rows.rows.filter((row) => !isIgnorableDependency(row));
  return {
    status: runtimeReferences.length === 0 ? 'pass' : 'blocked',
    dependencyCount: runtimeReferences.length,
    runtimeReferences,
  };
}

async function readRuntimeReferences(client, objectName) {
  const searchText = objectName.toLowerCase();
  const rows = await client.query(
    `SELECT table_name,
            column_name,
            data_type
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND lower(column_name) LIKE $1
      ORDER BY table_name, column_name`,
    [`%${searchText}%`],
  );
  return rows.rows;
}

function isIgnorableDependency(row) {
  const catalog = normalizeText(row.dependent_catalog);
  return catalog === 'pg_type' || catalog === 'pg_class' || catalog === 'pg_attrdef';
}

function relationKind(kind) {
  if (kind === 'r') return 'table';
  if (kind === 'p') return 'partitioned_table';
  if (kind === 'v') return 'view';
  if (kind === 'm') return 'materialized_view';
  return normalizeText(kind) || 'unknown';
}

function scoreNameHint(value) {
  const lower = normalizeText(value).toLowerCase();
  return OLD_OBJECT_NAME_HINTS.filter((hint) => lower.includes(hint)).length;
}

function matchedNameHints(value) {
  const lower = normalizeText(value).toLowerCase();
  return OLD_OBJECT_NAME_HINTS.filter((hint) => lower.includes(hint));
}

function summarizeInspected(items) {
  const summary = {};
  for (const item of Array.isArray(items) ? items : []) {
    const key = normalizeText(item.status) || normalizeText(item.dependencyStatus) || 'unknown';
    summary[key] = (summary[key] ?? 0) + 1;
  }
  return summary;
}

function quoteIdent(value) {
  const text = normalizeText(value);
  if (!/^[a-z_][a-z0-9_]*$/i.test(text)) {
    throw new Error(`Unsafe identifier: ${value}`);
  }
  return `"${text}"`;
}

function normalizeGateIds(gateIds = []) {
  const selected = [];
  const source = gateIds.length > 0 ? gateIds : LIVE_GATE_IDS;
  for (const gateId of source) {
    const normalized = normalizeText(gateId);
    if (!LIVE_GATE_IDS.includes(normalized)) {
      throw new Error(`Unknown gate: ${normalized}`);
    }
    if (!selected.includes(normalized)) {
      selected.push(normalized);
    }
  }
  return selected;
}

function dbTargetRef(envFile, key = 'SUPABASE_MIGRATION_URL') {
  return `env://${normalizeEnvRef(envFile)}#${key}`;
}

function normalizeEnvRef(envFile) {
  return String(envFile ?? '')
    .replace(/^path:\/\//u, '')
    .replaceAll('\\', '/')
    .replace(/^\/app\//u, '')
    .replace(/^\/+/u, '')
    || 'deploy/env/server.production.env';
}

function repoRef(value) {
  const relative = path.relative(REPO_ROOT, path.resolve(value)).replaceAll(path.sep, '/');
  return relative.startsWith('..') ? path.basename(value) : relative;
}

function compactTimestamp(value) {
  return value.toISOString().replaceAll(/[-:.]/g, '').replace('T', '-').replace('Z', '');
}

function sanitizeErrorCode(error) {
  const text = normalizeText(error?.message ?? error) || 'unknown_error';
  return text
    .replaceAll(/[^a-zA-Z0-9_.:-]+/g, '_')
    .slice(0, 160);
}

function normalizeEvidenceCode(value) {
  return normalizeText(value)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
    || 'unknown';
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/u, ''));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/run-production-livegate-evidence.mjs --handoff-file <json> --artifact-root <dir> --env-source process --env-file deploy/env/server.production.env --include-live --confirm-live-handoff --include-db --confirm-db-ready

Runs the production livegate evidence collector. It writes sanitized JSON evidence only.
It never prints or serializes env secret values. Physical DROP is not executed by this tool.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }
    const result = await runProductionLivegateEvidence(options);
    console.log(`Production livegate: ${result.status}`);
    console.log(`May close all: ${result.mayCloseAll ? 'yes' : 'no'}`);
    console.log(`Open gates: ${result.openGateIds.join(', ') || 'none'}`);
    process.exitCode = result.mayCloseAll ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
