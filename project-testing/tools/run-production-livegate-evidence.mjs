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
    gateResults.push(await writeC18BlockedEvidence({
      root,
      handoff,
      includeLive,
      confirmLiveHandoff,
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
    gateResults.push(await writeC19BlockedEvidence({
      root,
      handoff,
      includeLive,
      confirmLiveHandoff,
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

async function writeC18BlockedEvidence({ root, handoff, includeLive, confirmLiveHandoff, startedAt, now }) {
  const gateId = 'c18-l07-l15-live-diagnostics';
  const gate = handoff.gates?.[gateId] ?? {};
  const targetIds = {
    projectId: normalizeText(gate.targets?.projectId),
    planId: normalizeText(gate.targets?.planId),
  };
  const reason = !includeLive || !confirmLiveHandoff
    ? 'include_live_and_confirm_live_handoff_required'
    : 'c18_live_diagnostic_runner_not_present_on_current_main';
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

async function writeC19BlockedEvidence({ root, handoff, includeLive, confirmLiveHandoff, startedAt, now }) {
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
  const reason = !includeLive || !confirmLiveHandoff
    ? 'include_live_and_confirm_live_handoff_required'
    : 'c19_runtime_publication_writer_not_present_on_current_main';
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

async function createPgClient({ connectionString, env }) {
  const pgModule = await importDependency('pg');
  return new pgModule.default.Client({
    connectionString,
    ssl: env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
    query_timeout: 30000,
    statement_timeout: 30000,
  });
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
