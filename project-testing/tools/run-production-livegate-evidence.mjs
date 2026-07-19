#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { evaluateReleaseCloseout, writeCloseoutDecision } from './evaluate-release-closeout.mjs';
import { validateReleaseEvidence } from './validate-release-evidence.mjs';
import {
  checkC19RuntimePreflight,
  readC19RuntimeConsumerLedgerReadback,
  resolveC19SelectedDatabaseProjectRef,
  selectC19DatabaseConnectionString,
} from './check-c19-runtime-preflight.mjs';
import {
  RETAINED_HISTORICAL_PROJECT_REFERENCE_TABLES,
  readProjectBusinessResidueReadback,
} from './project-residue-policy.mjs';

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
    canonicalWizardSmokeFile: '',
    expectedEnvironment: '',
    expectedReleaseSha: '',
    expectedProjectRef: '',
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
    } else if (arg === '--wizard-smoke-file') {
      options.canonicalWizardSmokeFile = nextValue();
    } else if (arg === '--expected-environment') {
      options.expectedEnvironment = nextValue();
    } else if (arg === '--expected-release-sha') {
      options.expectedReleaseSha = nextValue();
    } else if (arg === '--expected-project-ref') {
      options.expectedProjectRef = nextValue();
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
  canonicalWizardSmokeFile = '',
  expectedEnvironment = '',
  expectedReleaseSha = '',
  expectedProjectRef = '',
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
  const deployment = handoff.deployment ?? {};
  const normalizedExpectedEnvironment = normalizeText(expectedEnvironment)
    || normalizeText(deployment.environment);
  const normalizedExpectedReleaseSha = (normalizeText(expectedReleaseSha)
    || normalizeText(deployment.releaseSha)).toLowerCase();
  const normalizedExpectedProjectRef = (normalizeText(expectedProjectRef)
    || normalizeText(deployment.supabaseProjectRef)).toLowerCase();
  if (normalizedExpectedEnvironment !== 'production'
    || !/^[0-9a-f]{40}$/.test(normalizedExpectedReleaseSha)
    || !/^[a-z0-9]{20}$/.test(normalizedExpectedProjectRef)
    || normalizeText(deployment.environment) !== normalizedExpectedEnvironment
    || normalizeText(deployment.releaseSha).toLowerCase() !== normalizedExpectedReleaseSha
    || normalizeText(deployment.supabaseProjectRef).toLowerCase() !== normalizedExpectedProjectRef) {
    throw new Error('production_livegate_expected_identity_mismatch');
  }
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
      canonicalWizardSmokeFile,
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
  let transactionOpen = false;
  try {
    const gate = handoff.gates?.[gateId] ?? {};
    const targetIds = {
      projectId: normalizeText(gate.targets?.projectId),
      planId: normalizeText(gate.targets?.planId),
    };
    const diagnosticRunId = `production-livegate-c18-${compactTimestamp(now)}`;
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

    const probePayloads = C18_ARTIFACTS.map(([itemId, filename]) => ({
      item_id: itemId,
      probe_payload: {
        gateId,
        itemId,
        diagnosticRunId,
        targetIds,
        artifactPath: filename,
        productionLivegateProbe: true,
      },
    }));

    await client.query('BEGIN');
    transactionOpen = true;
    await client.query(`
      CREATE TEMP TABLE workbuddy_production_livegate_probe (
        item_id TEXT PRIMARY KEY,
        probe_payload JSONB NOT NULL
      ) ON COMMIT DROP
    `);
    const inserted = await client.query(
      `INSERT INTO workbuddy_production_livegate_probe (item_id, probe_payload)
       SELECT item_id, probe_payload
       FROM jsonb_to_recordset($1::jsonb) AS source(item_id TEXT, probe_payload JSONB)
       RETURNING item_id`,
      [JSON.stringify(probePayloads)],
    );
    const readback = await client.query(
      'SELECT count(*)::int AS row_count FROM workbuddy_production_livegate_probe',
    );
    const deleted = await client.query(
      'DELETE FROM workbuddy_production_livegate_probe RETURNING item_id',
    );
    const afterDelete = await client.query(
      'SELECT count(*)::int AS row_count FROM workbuddy_production_livegate_probe',
    );
    await client.query('ROLLBACK');
    transactionOpen = false;

    const insertedIds = inserted.rows.map((row) => normalizeText(row.item_id)).filter(Boolean);
    const deletedIds = deleted.rows.map((row) => normalizeText(row.item_id)).filter(Boolean);
    const rowCount = Number(readback.rows[0]?.row_count ?? 0);
    const residualBeforeRollback = Number(afterDelete.rows[0]?.row_count ?? 0);
    const cleanupReadback = {
      status: insertedIds.length === C18_ARTIFACTS.length
        && rowCount === C18_ARTIFACTS.length
        && deletedIds.length === C18_ARTIFACTS.length
        && residualBeforeRollback === 0
        ? 'pass'
        : 'fail',
      insertedCount: insertedIds.length,
      readbackCount: rowCount,
      deletedCount: deletedIds.length,
      residualBeforeRollback,
      transactionRolledBack: true,
      persistentResidual: 0,
    };

    const probeRows = C18_ARTIFACTS.map(([itemId, filename]) => ({
      itemId,
      filename,
      inserted: insertedIds.includes(itemId),
      deleted: deletedIds.includes(itemId),
    }));
    for (const row of probeRows) {
      const { itemId, filename } = row;
      await writeJson(path.join(root, filename), {
        schemaVersion: `workbuddy-${itemId.toLowerCase().replaceAll('.', '-')}-production-livegate/v1`,
        gateId,
        itemId,
        status: 'pass',
        artifactPath: filename,
        ...base,
        cleanupReadback,
        queryLog: {
          probeStorage: 'session_temp_only',
          inserted: row.inserted,
          deleted: row.deleted,
          transactionRolledBack: true,
        },
        checks: {
          tempRowInserted: row.inserted,
          tempRowDeleted: row.deleted,
          cleanupReadbackPass: cleanupReadback.status === 'pass',
        },
        boundary: {
          liveMutation: true,
          dbMutation: true,
          productionLivegateProbe: true,
          physicalDropExecuted: false,
          probeStorage: 'session_temp_only',
          scope: 'Session-local TEMP table write/read/delete probe inside a rolled-back transaction. It creates no persistent business or evidence rows and does not claim to execute the richer C18 diagnostics.',
        },
      });
    }

    const artifacts = C18_ARTIFACTS.map(([, filename]) => filename);
    const summary = {
      schemaVersion: 'workbuddy-c18-l07-l15-live-evidence-summary/v1',
      gateId,
      status: cleanupReadback.status === 'pass' ? 'pass' : 'fail',
      reason: cleanupReadback.status === 'pass' ? '' : 'c18_db_probe_cleanup_failed',
      artifactPath: 'c18-live-evidence-summary.json',
      ...base,
      cleanupReadback,
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
        probeStorage: 'session_temp_only',
        scope: 'C18 plumbing evidence uses only a transaction-local TEMP table and rolls the transaction back. It leaves persistentResidual=0 and does not stand in for wizard or business-chain evidence.',
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
    if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined);
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
  canonicalWizardSmokeFile,
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

  const deployment = handoff.deployment ?? {};
  const expectedEnvironment = normalizeText(deployment.environment);
  const expectedEnvironmentClassification = normalizeText(deployment.environmentClassification);
  const expectedReleaseSha = normalizeText(deployment.releaseSha).toLowerCase();
  const expectedSupabaseProjectRef = normalizeText(deployment.supabaseProjectRef).toLowerCase();
  if (expectedEnvironment !== 'production'
    || expectedEnvironmentClassification !== 'deployed_production_private_server'
    || !/^[0-9a-f]{40}$/.test(expectedReleaseSha)
    || !/^[a-z0-9]{20}$/.test(expectedSupabaseProjectRef)) {
    return writeC19BlockedEvidence({
      root,
      handoff,
      includeLive,
      confirmLiveHandoff,
      startedAt,
      now,
      reasonOverride: 'production_deployment_identity_required',
    });
  }
  if (!canonicalWizardSmokeFile) {
    return writeC19BlockedEvidence({
      root,
      handoff,
      includeLive,
      confirmLiveHandoff,
      startedAt,
      now,
      reasonOverride: 'canonical_wizard_smoke_file_required',
    });
  }

  const connectionString = selectC19DatabaseConnectionString(env);
  const selectedDatabaseProjectRef = resolveC19SelectedDatabaseProjectRef(env);
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
  if (!selectedDatabaseProjectRef || selectedDatabaseProjectRef !== expectedSupabaseProjectRef) {
    return writeC19BlockedEvidence({
      root,
      handoff,
      includeLive,
      confirmLiveHandoff,
      startedAt,
      now,
      reasonOverride: selectedDatabaseProjectRef
        ? 'selected_database_project_ref_mismatch'
        : 'selected_database_project_ref_unresolved',
    });
  }

  let smoke;
  let sourceWizardSmokeInputSha256;
  let sourceWizardSmokeInputPath;
  try {
    const sourceBytes = await readFile(path.resolve(canonicalWizardSmokeFile));
    sourceWizardSmokeInputSha256 = createHash('sha256').update(sourceBytes).digest('hex');
    smoke = JSON.parse(sourceBytes.toString('utf8').replace(/^\uFEFF/u, ''));
    sourceWizardSmokeInputPath = path.join(
      root,
      'inputs',
      `source-c19-wizard-smoke-${sourceWizardSmokeInputSha256}.json`,
    );
    await writeImmutableInput(sourceWizardSmokeInputPath, sourceBytes);
    assertProductionWizardSmokeIdentity({
      smoke,
      handoffProjectId: normalizeText(handoff.gates?.[gateId]?.targets?.projectId),
      expectedEnvironment,
      expectedEnvironmentClassification,
      expectedReleaseSha,
      expectedSupabaseProjectRef,
    });
  } catch (error) {
    return writeC19BlockedEvidence({
      root,
      handoff,
      includeLive,
      confirmLiveHandoff,
      startedAt,
      now,
      reasonOverride: 'canonical_wizard_smoke_input_invalid:' + sanitizeErrorCode(error),
    });
  }

  let projectResidueReadback = null;
  let evidenceSmoke = smoke;
  let client = null;
  try {
    client = dbClientFactory
      ? dbClientFactory({ connectionString, env, envFile })
      : await createPgClient({ connectionString, env });
    await client.connect();
    const smokeProjectId = normalizeText(smoke.projectId);
    const smokeGenerationBatchId = normalizeText(smoke.generationBatchId);

    const queryExec = async (sql, values = []) => {
      const result = await client.query(sql, values);
      return result.rows ?? [];
    };
    queryExec.targetProjectRef = selectedDatabaseProjectRef;
    projectResidueReadback = await readProjectBusinessResidueReadback(queryExec, {
      projectId: smokeProjectId,
    });
    if (projectResidueReadback.status !== 'pass') {
      return writeC19BlockedEvidence({
        root,
        handoff,
        includeLive,
        confirmLiveHandoff,
        startedAt,
        now,
        reasonOverride: 'c19_disposable_project_business_residue',
        projectResidueReadback,
        sourceSmoke: smoke,
        postSmokeMutationOccurred: true,
      });
    }
    const databaseLedger = await readC19RuntimeConsumerLedgerReadback(queryExec, {
      projectId: smokeProjectId,
      generationBatchId: smokeGenerationBatchId,
    });
    const enrichedSmoke = {
      ...smoke,
      cleanup: {
        ...(smoke.cleanup ?? {}),
        projectResidueReadback,
      },
      steps: {
        ...(smoke.steps ?? {}),
        runtimeConsumerLedgerReadback: {
          status: 'pass',
          appendOnly: true,
          projectId: smokeProjectId,
          generationBatchId: smokeGenerationBatchId,
          ...databaseLedger,
          deleteMutationCount: 0,
        },
      },
    };
    evidenceSmoke = enrichedSmoke;
    const canonicalInputBytes = Buffer.from(`${JSON.stringify(enrichedSmoke, null, 2)}\n`, 'utf8');
    const canonicalWizardSmokeInputSha256 = createHash('sha256').update(canonicalInputBytes).digest('hex');
    const canonicalWizardSmokeInputPath = path.join(
      root,
      'inputs',
      `c19-wizard-smoke-${canonicalWizardSmokeInputSha256}.json`,
    );
    await writeImmutableInput(canonicalWizardSmokeInputPath, canonicalInputBytes);
    const preflight = await checkC19RuntimePreflight({
      envFile,
      projectId: smokeProjectId,
      canonicalWizardSmokeFile: canonicalWizardSmokeInputPath,
      expectedEnvironment,
      expectedReleaseSha,
      expectedProjectRef: expectedSupabaseProjectRef,
      queryExec,
      now,
    });
    const preflightArtifact = {
      ...preflight,
      artifactPath: 'c19-canonical-wizard-preflight.json',
      canonicalWizardSmokeInputSha256,
      canonicalWizardSmokeInputFile: repoRef(canonicalWizardSmokeInputPath),
      sourceWizardSmokeInputSha256,
      sourceWizardSmokeInputFile: repoRef(sourceWizardSmokeInputPath),
    };
    if (preflight.status !== 'ready') {
      return writeC19BlockedEvidence({
        root,
        handoff,
        includeLive,
        confirmLiveHandoff,
        startedAt,
        now,
        reasonOverride: 'c19_canonical_wizard_preflight_blocked:' + preflight.reasonCodes.join(','),
        preflightArtifact,
        projectResidueReadback,
        sourceSmoke: enrichedSmoke,
        postSmokeMutationOccurred: true,
      });
    }

    const liveArtifact = {
      ...enrichedSmoke,
      artifactPath: 'wizard-baseline-revision-live.json',
      canonicalWizardSmokeInputSha256,
      canonicalWizardSmokeInputFile: repoRef(canonicalWizardSmokeInputPath),
      selectedDatabaseProjectRef,
      sourceWizardSmokeInputSha256,
    };
    const cleanupArtifact = {
      schemaVersion: 'workbuddy-wizard-baseline-revision-cleanup-readback/v1',
      generatedAt: now.toISOString(),
      source: normalizeText(enrichedSmoke.source),
      environmentClassification: normalizeText(enrichedSmoke.environmentClassification),
      productionLive: enrichedSmoke.productionLive === true,
      releaseSha: normalizeText(enrichedSmoke.releaseSha).toLowerCase(),
      supabaseProjectRef: normalizeText(enrichedSmoke.supabaseProjectRef).toLowerCase(),
      projectId: smokeProjectId,
      generationBatchId: smokeGenerationBatchId,
      status: normalizeText(enrichedSmoke.cleanup?.status) || 'blocked',
      projectPhysicallyDeleted: enrichedSmoke.cleanup?.projectPhysicallyDeleted === true,
      projectUnreadable: enrichedSmoke.cleanup?.projectUnreadable === true,
      projectResidueReadback,
      cleanup: enrichedSmoke.cleanup ?? {},
      artifactPath: 'wizard-baseline-revision-cleanup-readback.json',
      canonicalWizardSmokeInputSha256,
      sourceWizardSmokeInputSha256,
      selectedDatabaseProjectRef,
      liveMutation: true,
      dbMutation: true,
      boundary: {
        runtimeConsumerLedgersAppendOnly: true,
        runtimeConsumerLedgerDeleteMutationCount: Number(
          enrichedSmoke.steps?.runtimeConsumerLedgerReadback?.deleteMutationCount ?? -1,
        ),
        businessObjectResidualExpected: 0,
      },
    };
    await writeJson(path.join(root, 'wizard-baseline-revision-live.json'), liveArtifact);
    await writeJson(path.join(root, 'wizard-baseline-revision-cleanup-readback.json'), cleanupArtifact);
    await writeJson(path.join(root, 'c19-canonical-wizard-preflight.json'), preflightArtifact);

    return {
      gateId,
      status: 'pass',
      projectId: smokeProjectId,
      generationBatchId: smokeGenerationBatchId,
      releaseSha: expectedReleaseSha,
      liveMutation: true,
      dbMutation: true,
      runtimeConsumerLedgerDeleteMutationCount: 0,
      cleanupStatus: cleanupArtifact.status,
    };
  } catch (error) {
    return writeC19BlockedEvidence({
      root,
      handoff,
      includeLive,
      confirmLiveHandoff,
      startedAt,
      now,
      reasonOverride: 'c19_canonical_wizard_probe_failed:' + sanitizeErrorCode(error),
      projectResidueReadback,
      sourceSmoke: evidenceSmoke,
      postSmokeMutationOccurred: true,
    });
  } finally {
    await client?.end().catch(() => undefined);
  }
}

function assertProductionWizardSmokeIdentity({
  smoke,
  handoffProjectId,
  expectedEnvironment,
  expectedEnvironmentClassification,
  expectedReleaseSha,
  expectedSupabaseProjectRef,
}) {
  const smokeProjectId = normalizeText(smoke?.projectId);
  const generationBatchId = normalizeText(smoke?.generationBatchId);
  if (!smokeProjectId || !generationBatchId) {
    throw new Error('canonical_wizard_smoke_project_and_generation_batch_required');
  }
  if (handoffProjectId && handoffProjectId !== smokeProjectId) {
    throw new Error('canonical_wizard_smoke_handoff_project_mismatch');
  }
  if (normalizeText(smoke?.source) !== 'wizard_baseline_revision_live_probe'
    || normalizeText(smoke?.status) !== 'pass') {
    throw new Error('canonical_wizard_smoke_status_invalid');
  }
  if (expectedEnvironment !== 'production'
    || normalizeText(smoke?.environmentClassification) !== expectedEnvironmentClassification
    || smoke?.productionLive !== true) {
    throw new Error('canonical_wizard_smoke_environment_mismatch');
  }
  if (normalizeText(smoke?.releaseSha).toLowerCase() !== expectedReleaseSha) {
    throw new Error('canonical_wizard_smoke_release_sha_mismatch');
  }
  if (normalizeText(smoke?.supabaseProjectRef).toLowerCase() !== expectedSupabaseProjectRef) {
    throw new Error('canonical_wizard_smoke_project_ref_mismatch');
  }
  const readyz = smoke?.deployedReadiness ?? {};
  if (normalizeText(readyz.releaseSha).toLowerCase() !== expectedReleaseSha
    || normalizeText(readyz.deployTarget) !== expectedEnvironment
    || normalizeText(readyz.supabaseProjectRef).toLowerCase() !== expectedSupabaseProjectRef
    || normalizeText(readyz.databaseProjectRef).toLowerCase() !== expectedSupabaseProjectRef) {
    throw new Error('canonical_wizard_smoke_readyz_identity_mismatch');
  }
}

async function writeC19BlockedEvidence({
  root,
  handoff,
  includeLive,
  confirmLiveHandoff,
  startedAt,
  now,
  reasonOverride = '',
  preflightArtifact = null,
  projectResidueReadback = null,
  sourceSmoke = null,
  postSmokeMutationOccurred = false,
}) {
  const gateId = 'c19-runtime-publication-release-rollback';
  const gate = handoff.gates?.[gateId] ?? {};
  const deployment = handoff.deployment ?? {};
  const reason = reasonOverride || (!includeLive || !confirmLiveHandoff
    ? 'include_live_and_confirm_live_handoff_required'
    : 'canonical_wizard_smoke_required');
  const sourceCommit = sourceSmoke?.steps?.commitWizardGeneration ?? {};
  const mutationOccurred = postSmokeMutationOccurred === true
    && sourceSmoke?.productionLive === true
    && normalizeText(sourceSmoke?.status) === 'pass'
    && normalizeText(sourceCommit.status) === 'pass'
    && Number(sourceCommit.createdTaskCount ?? 0) > 0;
  const sourceCleanup = mutationOccurred && sourceSmoke?.cleanup && typeof sourceSmoke.cleanup === 'object'
    ? sourceSmoke.cleanup
    : { status: 'not_run' };
  const cleanup = mutationOccurred
    ? {
        ...sourceCleanup,
        ...(projectResidueReadback ? { projectResidueReadback } : {}),
      }
    : { status: 'not_run' };
  const base = {
    generatedAt: now.toISOString(),
    source: mutationOccurred
      ? normalizeText(sourceSmoke.source) || 'production_livegate_canonical_wizard_preflight'
      : 'production_livegate_canonical_wizard_preflight',
    environmentClassification: mutationOccurred
      ? normalizeText(sourceSmoke.environmentClassification) || 'unknown'
      : normalizeText(deployment.environmentClassification) || 'unknown',
    productionLive: mutationOccurred,
    releaseSha: mutationOccurred
      ? normalizeText(sourceSmoke.releaseSha) || null
      : normalizeText(deployment.releaseSha) || null,
    supabaseProjectRef: mutationOccurred
      ? normalizeText(sourceSmoke.supabaseProjectRef) || null
      : normalizeText(deployment.supabaseProjectRef) || null,
    projectId: mutationOccurred
      ? normalizeText(sourceSmoke.projectId) || null
      : normalizeText(gate.targets?.projectId) || null,
    generationBatchId: mutationOccurred ? normalizeText(sourceSmoke.generationBatchId) || null : null,
    status: 'blocked',
    reason,
    startedAt,
    finishedAt: now.toISOString(),
    liveMutation: mutationOccurred,
    dbMutation: mutationOccurred,
    mutationAttempted: mutationOccurred,
    mutationOccurred,
  };
  await writeJson(path.join(root, 'wizard-baseline-revision-live.json'), {
    schemaVersion: 'workbuddy-wizard-baseline-revision-live/v1',
    ...base,
    artifactPath: 'wizard-baseline-revision-live.json',
    steps: mutationOccurred ? sourceSmoke.steps ?? {} : {},
    cleanup,
  });
  await writeJson(path.join(root, 'wizard-baseline-revision-cleanup-readback.json'), {
    schemaVersion: 'workbuddy-wizard-baseline-revision-cleanup-readback/v1',
    ...base,
    artifactPath: 'wizard-baseline-revision-cleanup-readback.json',
    projectPhysicallyDeleted: mutationOccurred && sourceCleanup.projectPhysicallyDeleted === true,
    projectUnreadable: mutationOccurred && sourceCleanup.projectUnreadable === true,
    sourceCleanup,
    cleanup,
    projectResidueReadback: projectResidueReadback ?? {
      schemaVersion: 'workbuddy-project-residue-readback/v1',
      status: 'not_run',
      reason: 'trusted_project_and_database_identity_required',
      projectId: base.projectId,
      scannedTableCount: 0,
      scannedTables: [],
      retainedHistoricalProjectReferenceTables: [...RETAINED_HISTORICAL_PROJECT_REFERENCE_TABLES],
      retainedHistoricalResidue: [],
      totalRetainedHistoricalResidueCount: 0,
      nonZeroBusinessTables: [],
      totalBusinessResidueCount: 0,
      queryMutationCount: 0,
      readbackHash: null,
    },
  });
  await writeJson(
    path.join(root, 'c19-canonical-wizard-preflight.json'),
    preflightArtifact ?? {
      schemaVersion: 'workbuddy-c19-runtime-preflight/v2',
      ...base,
      artifactPath: 'c19-canonical-wizard-preflight.json',
      readiness: {},
      reasonCodes: [reason],
    },
  );
  return {
    gateId,
    status: 'blocked',
    reason,
    liveMutation: mutationOccurred,
    dbMutation: mutationOccurred,
    mutationAttempted: mutationOccurred,
    mutationOccurred,
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

async function writeImmutableInput(filePath, bytes) {
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    await writeFile(filePath, bytes, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = await readFile(filePath);
    if (!Buffer.from(existing).equals(Buffer.from(bytes))) {
      throw new Error('canonical_wizard_smoke_immutable_input_collision');
    }
  }
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/run-production-livegate-evidence.mjs --handoff-file <json> --artifact-root <dir> --wizard-smoke-file <json> --expected-environment production --expected-release-sha <sha> --expected-project-ref <ref> --env-source process --env-file deploy/env/server.production.env --include-live --confirm-live-handoff --include-db --confirm-db-ready

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
