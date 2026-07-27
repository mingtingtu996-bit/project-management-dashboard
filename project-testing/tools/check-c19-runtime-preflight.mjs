#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

import {
  hashProjectBusinessResidueReadback,
  readProjectBusinessResidueReadback,
} from './project-residue-policy.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'server/.env');

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: DEFAULT_ENV_FILE,
    projectId: '',
    canonicalWizardSmokeFile: null,
    expectedEnvironment: '',
    expectedReleaseSha: '',
    expectedProjectRef: '',
    output: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };

    if (arg === '--env-file') {
      options.envFile = path.resolve(nextValue());
    } else if (arg === '--project-id') {
      options.projectId = nextValue();
    } else if (arg === '--wizard-smoke-file') {
      options.canonicalWizardSmokeFile = path.resolve(nextValue());
    } else if (arg === '--expected-environment') {
      options.expectedEnvironment = nextValue();
      if (!['staging', 'production'].includes(options.expectedEnvironment)) {
        throw new Error('--expected-environment must be staging or production');
      }
    } else if (arg === '--expected-release-sha') {
      options.expectedReleaseSha = nextValue();
      if (!/^[0-9a-f]{40}$/i.test(options.expectedReleaseSha)) {
        throw new Error('--expected-release-sha must be a 40-character Git SHA');
      }
    } else if (arg === '--expected-project-ref') {
      options.expectedProjectRef = nextValue().toLowerCase();
      if (!/^[a-z0-9]{20}$/.test(options.expectedProjectRef)) {
        throw new Error('--expected-project-ref must be a 20-character Supabase project ref');
      }
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue());
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export async function checkC19RuntimePreflight({
  envFile = DEFAULT_ENV_FILE,
  projectId = '',
  canonicalWizardSmokeFile = null,
  expectedEnvironment = '',
  expectedReleaseSha = '',
  expectedProjectRef = '',
  output = null,
  queryExec = null,
  now = new Date(),
} = {}) {
  let exec = queryExec;
  try {
    const normalizedProjectId = normalizeText(projectId);
    const normalizedExpectedEnvironment = normalizeText(expectedEnvironment);
    const normalizedExpectedReleaseSha = normalizeText(expectedReleaseSha).toLowerCase();
    const normalizedExpectedProjectRef = normalizeText(expectedProjectRef).toLowerCase();
    const inputReasonCodes = [];
    if (!['staging', 'production'].includes(normalizedExpectedEnvironment)) {
      inputReasonCodes.push('expected_environment_required');
    }
    if (!/^[0-9a-f]{40}$/.test(normalizedExpectedReleaseSha)) {
      inputReasonCodes.push('expected_release_sha_required');
    }
    if (!/^[a-z0-9]{20}$/.test(normalizedExpectedProjectRef)) {
      inputReasonCodes.push('expected_project_ref_required');
    }
    const smokeReadback = await readCanonicalWizardSmoke(canonicalWizardSmokeFile);
    const smokeIdentityReasonCodes = buildCanonicalWizardSmokeIdentityReasonCodes({
      smoke: smokeReadback.smoke,
      readError: smokeReadback.error,
      projectId: normalizedProjectId,
      expectedEnvironment: normalizedExpectedEnvironment,
      expectedReleaseSha: normalizedExpectedReleaseSha,
      expectedProjectRef: normalizedExpectedProjectRef,
    });
    const selectedDatabaseProjectRef = normalizeText(
      queryExec?.targetProjectRef
        ?? await readC19SelectedDatabaseProjectRefFromEnvFile(envFile),
    ).toLowerCase();
    if (!selectedDatabaseProjectRef) {
      inputReasonCodes.push('selected_database_project_ref_unresolved');
    } else if (normalizedExpectedProjectRef && selectedDatabaseProjectRef !== normalizedExpectedProjectRef) {
      inputReasonCodes.push('selected_database_project_ref_mismatch');
    }
    const identityReady = inputReasonCodes.length === 0 && smokeIdentityReasonCodes.length === 0;
    if (identityReady && !exec) exec = await createPgQueryExec(envFile);
    const replaySampleReadiness = identityReady
      ? await readReplaySampleReadiness(exec, normalizedProjectId)
      : emptyReplaySampleReadiness();
    const taskReadiness = identityReady
      ? await readTaskReadiness(exec, normalizedProjectId)
      : emptyTaskReadiness();
    const canonicalWizardWbsReadiness = await readCanonicalWizardSmokeReadiness({
      canonicalWizardSmokeFile,
      smoke: smokeReadback.smoke,
      smokeReadError: smokeReadback.error,
      identityReasonCodes: smokeIdentityReasonCodes,
      identityReady,
      projectId: normalizedProjectId,
      expectedEnvironment: normalizedExpectedEnvironment,
      expectedReleaseSha: normalizedExpectedReleaseSha,
      expectedProjectRef: normalizedExpectedProjectRef,
      queryExec: exec,
    });
    const reasonCodes = Array.from(new Set([
      ...inputReasonCodes,
      ...canonicalWizardWbsReadiness.reasonCodes,
    ]));
    const advisoryCodes = buildAdvisoryCodes({ replaySampleReadiness, taskReadiness });
    const report = {
      schemaVersion: 'workbuddy-c19-runtime-preflight/v2',
      status: reasonCodes.length === 0 ? 'ready' : 'blocked',
      generatedAt: now.toISOString(),
      projectId: normalizedProjectId,
      expectedEnvironment: normalizedExpectedEnvironment || null,
      expectedReleaseSha: normalizedExpectedReleaseSha || null,
      expectedProjectRef: normalizedExpectedProjectRef || null,
      selectedDatabaseProjectRef: selectedDatabaseProjectRef || null,
      dbMutation: false,
      liveMutation: false,
      replaySampleReadiness,
      taskReadiness,
      canonicalWizardWbsReadiness,
      readiness: {
        canonicalWizardCommitReady: canonicalWizardWbsReadiness.wizardCommitReady,
        dependencyReadbackReady: canonicalWizardWbsReadiness.dependencyReadbackReady,
        criticalPathReady: canonicalWizardWbsReadiness.criticalPathReady,
        baselineRevisionRollbackReady: canonicalWizardWbsReadiness.baselineRevisionRollbackReady,
        cleanupReady: canonicalWizardWbsReadiness.cleanupReady,
        projectResidueReadbackReady: canonicalWizardWbsReadiness.projectResidueReadbackReady,
        runtimeConsumerCallDeltaReady: canonicalWizardWbsReadiness.runtimeConsumerCallDeltaReady,
        runtimeConsumerObservationDeltaReady: canonicalWizardWbsReadiness.runtimeConsumerObservationDeltaReady,
        replaySamplesAvailable: replaySampleReadiness.durationSampleCount > 0
          && replaySampleReadiness.t2WindowSampleCount > 0,
        taskMetadataAvailable: taskReadiness.t2MetadataTaskCount > 0,
      },
      reasonCodes,
      advisoryCodes,
      boundary: 'Read-only canonical wizard/WBS preflight. Duplicate T2 runtime publication tables and their direct writer are retired; real samples remain advisory for learning and do not block cold-start plan generation.',
    };

    if (output) {
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }

    return report;
  } finally {
    await closeQueryExec(exec ?? queryExec);
  }
}

export function selectC19DatabaseConnectionString(env) {
  return [
    env.SUPABASE_MIGRATION_URL,
    env.DIRECT_DATABASE_URL,
    env.DATABASE_URL,
    env.DB_CONNECTION_STRING,
  ].map(normalizeText).find(Boolean) ?? '';
}

export function resolveC19SelectedDatabaseProjectRef(env = {}) {
  const connectionString = selectC19DatabaseConnectionString(env);
  if (!connectionString) return null;
  try {
    const parsed = new URL(connectionString);
    const direct = /^(?:db\.)?([a-z0-9]{20})\.supabase\.co$/i.exec(parsed.hostname)?.[1];
    const poolerHost = /(?:^|\.)pooler\.supabase\.(?:com|co)$/i.test(parsed.hostname);
    const pooler = poolerHost
      ? /(?:^|\.)([a-z0-9]{20})$/i.exec(decodeURIComponent(parsed.username))?.[1]
      : null;
    const refs = [...new Set([direct, pooler].filter(Boolean).map((value) => value.toLowerCase()))];
    return refs.length === 1 ? refs[0] : null;
  } catch {
    return null;
  }
}

async function readC19SelectedDatabaseProjectRefFromEnvFile(envFile) {
  try {
    return resolveC19SelectedDatabaseProjectRef(dotenv.parse(await readFile(envFile, 'utf8')));
  } catch {
    return null;
  }
}

async function createPgQueryExec(envFile) {
  const env = dotenv.parse(await readFile(envFile, 'utf8'));
  const connectionString = selectC19DatabaseConnectionString(env);
  if (!connectionString) {
    throw new Error('A migration database connection URL is required for C19 canonical preflight');
  }
  const targetProjectRef = resolveC19SelectedDatabaseProjectRef(env);
  if (!targetProjectRef) throw new Error('C19_SELECTED_DATABASE_PROJECT_REF_UNRESOLVED');
  const client = new pg.Client({
    connectionString,
    ssl: env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
    query_timeout: 12000,
    statement_timeout: 12000,
  });
  await client.connect();
  const exec = async (sql, params = []) => {
    const result = await client.query(sql, params);
    return result.rows;
  };
  exec.targetProjectRef = targetProjectRef;
  exec.close = async () => client.end();
  return exec;
}

async function readCanonicalWizardSmoke(canonicalWizardSmokeFile) {
  if (!canonicalWizardSmokeFile) {
    return { smoke: null, error: 'canonical_wizard_smoke_file_required' };
  }
  try {
    return {
      smoke: JSON.parse((await readFile(canonicalWizardSmokeFile, 'utf8')).replace(/^\uFEFF/, '')),
      error: null,
    };
  } catch (error) {
    return {
      smoke: null,
      error: `canonical_wizard_smoke_invalid:${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function buildCanonicalWizardSmokeIdentityReasonCodes({
  smoke,
  readError,
  projectId,
  expectedEnvironment,
  expectedReleaseSha,
  expectedProjectRef,
}) {
  if (readError) return [readError];
  const reasonCodes = [];
  if (normalizeText(smoke?.source) !== 'wizard_baseline_revision_live_probe') {
    reasonCodes.push('canonical_wizard_smoke_source_invalid');
  }
  if (normalizeText(smoke?.status) !== 'pass') reasonCodes.push('canonical_wizard_smoke_not_pass');
  if (projectId && normalizeText(smoke?.projectId) !== projectId) {
    reasonCodes.push('canonical_wizard_smoke_project_mismatch');
  }
  const environmentClassification = normalizeText(smoke?.environmentClassification);
  const releaseSha = normalizeText(smoke?.releaseSha).toLowerCase();
  const productionLive = smoke?.productionLive === true;
  if (expectedEnvironment === 'production'
    && (!productionLive || environmentClassification !== 'deployed_production_private_server')) {
    reasonCodes.push('canonical_wizard_smoke_not_production');
  }
  if (expectedEnvironment === 'staging'
    && (productionLive || environmentClassification !== 'deployed_staging_private_server')) {
    reasonCodes.push('canonical_wizard_smoke_not_staging');
  }
  if (expectedReleaseSha && releaseSha !== expectedReleaseSha) {
    reasonCodes.push('canonical_wizard_smoke_release_sha_mismatch');
  }
  if (expectedProjectRef && normalizeText(smoke?.supabaseProjectRef).toLowerCase() !== expectedProjectRef) {
    reasonCodes.push('canonical_wizard_smoke_project_ref_mismatch');
  }
  const deployedReadiness = smoke?.deployedReadiness ?? {};
  if (expectedReleaseSha && normalizeText(deployedReadiness.releaseSha).toLowerCase() !== expectedReleaseSha) {
    reasonCodes.push('canonical_wizard_smoke_readyz_release_sha_mismatch');
  }
  if (expectedEnvironment && normalizeText(deployedReadiness.deployTarget) !== expectedEnvironment) {
    reasonCodes.push('canonical_wizard_smoke_readyz_deploy_target_mismatch');
  }
  if (expectedProjectRef
    && normalizeText(deployedReadiness.supabaseProjectRef).toLowerCase() !== expectedProjectRef) {
    reasonCodes.push('canonical_wizard_smoke_readyz_project_ref_mismatch');
  }
  if (expectedProjectRef
    && normalizeText(deployedReadiness.databaseProjectRef).toLowerCase() !== expectedProjectRef) {
    reasonCodes.push('canonical_wizard_smoke_readyz_database_project_ref_mismatch');
  }
  return Array.from(new Set(reasonCodes));
}

function emptyReplaySampleReadiness() {
  return { durationSampleCount: 0, t2WindowSampleCount: 0 };
}

function emptyTaskReadiness() {
  return { completedActualTaskCount: 0, t2MetadataTaskCount: 0 };
}

async function readReplaySampleReadiness(queryExec, projectId) {
  const whereProject = projectId ? 'AND project_id = $1' : '';
  const params = projectId ? [projectId] : [];
  const rows = await queryExec(
    `SELECT count(*)::int AS duration_sample_count,
            count(*) FILTER (
              WHERE metadata ? 't2RhythmWindowCode'
                 OR metadata ? 't2_rhythm_window_code'
                 OR metadata ? 'rhythmWindowCode'
                 OR metadata ? 'rhythm_window_code'
                 OR metadata ? 'windowCode'
                 OR metadata ? 'window_code'
            )::int AS t2_window_sample_count
       FROM public.duration_experience_samples
      WHERE sample_status = 'active'
        ${whereProject}`,
    params,
  );
  const row = rows[0] ?? {};
  return {
    durationSampleCount: readInt(row.duration_sample_count),
    t2WindowSampleCount: readInt(row.t2_window_sample_count),
  };
}

async function readTaskReadiness(queryExec, projectId) {
  const whereProject = projectId ? 'AND project_id = $1' : '';
  const params = projectId ? [projectId] : [];
  const rows = await queryExec(
    `SELECT count(*) FILTER (
              WHERE deleted_at IS NULL
                AND (status IN ('completed', 'done', '已完成') OR progress >= 100)
                AND actual_start_date IS NOT NULL
                AND actual_end_date IS NOT NULL
            )::int AS completed_actual_task_count,
            count(*) FILTER (
              WHERE deleted_at IS NULL
                AND standard_task_metadata IS NOT NULL
                AND (
                  standard_task_metadata ? 't2RhythmWindowCode'
                  OR standard_task_metadata ? 't2_rhythm_window_code'
                  OR standard_task_metadata ? 'rhythmWindowCode'
                  OR standard_task_metadata ? 'rhythm_window_code'
                  OR standard_task_metadata ? 'windowCode'
                  OR standard_task_metadata ? 'window_code'
                )
            )::int AS t2_metadata_task_count
       FROM public.tasks
      WHERE true
        ${whereProject}`,
    params,
  );
  const row = rows[0] ?? {};
  return {
    completedActualTaskCount: readInt(row.completed_actual_task_count),
    t2MetadataTaskCount: readInt(row.t2_metadata_task_count),
  };
}

async function readCanonicalWizardSmokeReadiness({
  canonicalWizardSmokeFile,
  smoke,
  smokeReadError,
  identityReasonCodes,
  identityReady,
  projectId,
  expectedEnvironment,
  expectedReleaseSha,
  expectedProjectRef,
  queryExec,
}) {
  if (!smoke) return emptyCanonicalReadiness(identityReasonCodes.length > 0
    ? identityReasonCodes
    : [smokeReadError || 'canonical_wizard_smoke_invalid']);

  const reasonCodes = [...identityReasonCodes];
  const environmentClassification = normalizeText(smoke.environmentClassification);
  const releaseSha = normalizeText(smoke.releaseSha).toLowerCase();
  const productionLive = smoke.productionLive === true;
  const smokeProjectRef = normalizeText(smoke.supabaseProjectRef).toLowerCase();

  const steps = smoke.steps ?? {};
  const commit = steps.commitWizardGeneration ?? {};
  const dependency = steps.taskDependencyReadback ?? {};
  const criticalPath = steps.criticalPathReadback ?? {};
  const baseline = steps.readCandidateBaseline ?? {};
  const publish = steps.publishBaseline ?? {};
  const revision = steps.startRevision ?? {};
  const rollback = steps.rollbackRevisionDraft ?? {};
  const runtimeConsumerLedger = steps.runtimeConsumerLedgerReadback ?? {};
  const cleanup = smoke.cleanup ?? {};
  const artifactProjectResidueReadback = cleanup.projectResidueReadback ?? {};
  const wizardCommitReady = commit.status === 'pass' && readInt(commit.createdTaskCount) > 0;
  const dependencyReadbackReady = dependency.status === 'pass'
    && readInt(dependency.dependencyReadbackCount) > 0
    && readInt(dependency.dependencyReadbackCount) === readInt(dependency.inventoryDependencyCount)
    && readInt(dependency.danglingDependencyCount) === 0;
  const criticalPathReady = criticalPath.status === 'pass'
    && criticalPath.calculationStatus === 'fresh'
    && readInt(criticalPath.dependencyEdgeCount) > 0
    && readInt(criticalPath.projectDurationDays) > 0;
  const baselineRevisionRollbackReady = baseline.status === 'pass'
    && readInt(baseline.itemCount) > 0
    && publish.status === 'pass'
    && publish.baselineStatus === 'confirmed'
    && revision.status === 'pass'
    && revision.idempotent === true
    && rollback.status === 'pass'
    && rollback.revisionPhysicallyDeleted === true
    && rollback.confirmedBaselineStatus === 'confirmed';
  const smokeProjectId = normalizeText(smoke.projectId);
  const generationBatchId = normalizeText(smoke.generationBatchId);
  const databaseProjectResidueReadback = identityReady && queryExec
    ? await readProjectBusinessResidueReadback(queryExec, { projectId: smokeProjectId })
    : emptyProjectResidueReadback(smokeProjectId);
  const artifactResidueHash = normalizeText(artifactProjectResidueReadback.readbackHash);
  const calculatedArtifactResidueHash = hashProjectBusinessResidueReadback(
    artifactProjectResidueReadback,
  );
  const projectResidueReadbackMatches = artifactResidueHash.length === 64
    && artifactResidueHash === calculatedArtifactResidueHash
    && artifactResidueHash === databaseProjectResidueReadback.readbackHash;
  const projectResidueReadbackReady = databaseProjectResidueReadback.status === 'pass'
    && databaseProjectResidueReadback.projectId === smokeProjectId
    && databaseProjectResidueReadback.scannedTableCount > 0
    && databaseProjectResidueReadback.totalBusinessResidueCount === 0
    && databaseProjectResidueReadback.nonZeroBusinessTables.length === 0
    && databaseProjectResidueReadback.queryMutationCount === 0
    && projectResidueReadbackMatches;
  const cleanupReady = cleanup.status === 'pass'
    && cleanup.projectPhysicallyDeleted === true
    && cleanup.projectUnreadable === true
    && projectResidueReadbackReady;
  const databaseLedger = identityReady && queryExec
    ? await readC19RuntimeConsumerLedgerReadback(queryExec, {
        projectId: smokeProjectId,
        generationBatchId,
      })
    : emptyRuntimeConsumerLedgerReadback();
  const artifactCallRowIds = stringArray(runtimeConsumerLedger.callRowIds);
  const artifactObservationRowIds = stringArray(runtimeConsumerLedger.observationRowIds);
  const artifactExpectedPublicationKeys = stringArray(runtimeConsumerLedger.expectedPublicationKeys);
  const ledgerHashMatches = normalizeText(runtimeConsumerLedger.callRowsHash) === databaseLedger.callRowsHash
    && normalizeText(runtimeConsumerLedger.observationRowsHash) === databaseLedger.observationRowsHash
    && arraysEqual(artifactCallRowIds, databaseLedger.callRowIds)
    && arraysEqual(artifactObservationRowIds, databaseLedger.observationRowIds);
  const runtimeConsumerCallDeltaReady = runtimeConsumerLedger.status === 'pass'
    && runtimeConsumerLedger.appendOnly === true
    && readInt(runtimeConsumerLedger.deleteMutationCount) === 0
    && normalizeText(runtimeConsumerLedger.projectId) === smokeProjectId
    && normalizeText(runtimeConsumerLedger.generationBatchId) === generationBatchId
    && readInt(runtimeConsumerLedger.callBefore) === 0
    && readInt(runtimeConsumerLedger.callAfter) === databaseLedger.callAfter
    && readInt(runtimeConsumerLedger.callDelta) === databaseLedger.callDelta
    && databaseLedger.callDelta > 0
    && ledgerHashMatches;
  const runtimeConsumerObservationDeltaReady = runtimeConsumerLedger.status === 'pass'
    && runtimeConsumerLedger.appendOnly === true
    && readInt(runtimeConsumerLedger.deleteMutationCount) === 0
    && readInt(runtimeConsumerLedger.observationBefore) === 0
    && readInt(runtimeConsumerLedger.observationAfter) === databaseLedger.observationAfter
    && readInt(runtimeConsumerLedger.observationDelta) === databaseLedger.observationDelta
    && readInt(runtimeConsumerLedger.publishedArtifactCount) === databaseLedger.publishedArtifactCount
    && readInt(runtimeConsumerLedger.expectedObservationDelta) === databaseLedger.expectedObservationDelta
    && arraysEqual(artifactExpectedPublicationKeys, databaseLedger.expectedPublicationKeys)
    && databaseLedger.publicationKeysMatch
    && databaseLedger.runtimeCallArtifactDeclarationsValid
    && ledgerHashMatches;

  if (!wizardCommitReady) reasonCodes.push('canonical_wizard_commit_missing');
  if (!dependencyReadbackReady) reasonCodes.push('canonical_dependency_readback_missing');
  if (!criticalPathReady) reasonCodes.push('canonical_critical_path_readback_missing');
  if (!baselineRevisionRollbackReady) reasonCodes.push('canonical_baseline_revision_rollback_missing');
  if (!cleanupReady) reasonCodes.push('canonical_smoke_cleanup_missing');
  if (databaseProjectResidueReadback.totalBusinessResidueCount > 0) {
    reasonCodes.push('canonical_project_business_residue_present');
  }
  if (databaseProjectResidueReadback.status !== 'pass'
    && databaseProjectResidueReadback.totalBusinessResidueCount === 0) {
    reasonCodes.push('canonical_project_residue_scan_incomplete');
  }
  if (!projectResidueReadbackMatches) reasonCodes.push('canonical_project_residue_readback_mismatch');
  if (!runtimeConsumerCallDeltaReady) reasonCodes.push('canonical_runtime_consumer_call_delta_invalid');
  if (!runtimeConsumerObservationDeltaReady) reasonCodes.push('canonical_runtime_consumer_observation_delta_invalid');
  if (!ledgerHashMatches) reasonCodes.push('canonical_runtime_consumer_ledger_hash_mismatch');
  if (!databaseLedger.publicationKeysMatch || !databaseLedger.runtimeCallArtifactDeclarationsValid) {
    reasonCodes.push('canonical_runtime_consumer_publication_keys_mismatch');
  }

  return {
    canonicalWizardSmokeFile: path.resolve(canonicalWizardSmokeFile),
    environmentClassification: environmentClassification || null,
    deployedStagingCode: smoke.deployedStagingCode === true,
    productionLive,
    releaseSha: releaseSha || null,
    supabaseProjectRef: smokeProjectRef || null,
    expectedEnvironment: expectedEnvironment || null,
    expectedReleaseSha: expectedReleaseSha || null,
    expectedProjectRef: expectedProjectRef || null,
    identityReady,
    projectId: smokeProjectId || null,
    createdTaskCount: readInt(commit.createdTaskCount),
    dependencyReadbackCount: readInt(dependency.dependencyReadbackCount),
    criticalPathDependencyEdgeCount: readInt(criticalPath.dependencyEdgeCount),
    projectDurationDays: readInt(criticalPath.projectDurationDays),
    baselineItemCount: readInt(baseline.itemCount),
    wizardCommitReady,
    dependencyReadbackReady,
    criticalPathReady,
    baselineRevisionRollbackReady,
    cleanupReady,
    projectResidueReadbackReady,
    projectResidueReadback: {
      ...databaseProjectResidueReadback,
      artifactReadbackHash: artifactResidueHash || null,
      calculatedArtifactReadbackHash: calculatedArtifactResidueHash,
      databaseVerified: projectResidueReadbackMatches,
    },
    runtimeConsumerCallDeltaReady,
    runtimeConsumerObservationDeltaReady,
    runtimeConsumerLedger: {
      status: normalizeText(runtimeConsumerLedger.status) || null,
      appendOnly: runtimeConsumerLedger.appendOnly === true,
      projectId: normalizeText(runtimeConsumerLedger.projectId) || null,
      generationBatchId: normalizeText(runtimeConsumerLedger.generationBatchId) || null,
      ...databaseLedger,
      artifactCallRowIds,
      artifactObservationRowIds,
      artifactExpectedPublicationKeys,
      artifactCallRowsHash: normalizeText(runtimeConsumerLedger.callRowsHash) || null,
      artifactObservationRowsHash: normalizeText(runtimeConsumerLedger.observationRowsHash) || null,
      deleteMutationCount: 0,
      databaseVerified: ledgerHashMatches,
    },
    reasonCodes: Array.from(new Set(reasonCodes)),
  };
}

export async function readC19RuntimeConsumerLedgerReadback(queryExec, { projectId, generationBatchId }) {
  if (!projectId || !generationBatchId) {
    return emptyRuntimeConsumerLedgerReadback();
  }
  const callRows = await queryExec(
    `SELECT id::text AS id,
            consumer_key,
            runtime_entry_ref,
            call_status,
            call_context,
            source_evidence_refs,
            called_at
       FROM public.runtime_consumer_runtime_calls
      WHERE call_context ->> 'projectId' = $1
        AND call_context ->> 'generationBatchId' = $2
      ORDER BY id`,
    [projectId, generationBatchId],
  );
  const observationRows = await queryExec(
    `SELECT id::text AS id,
            asset_key,
            publication_key,
            consumer_key,
            consumer_surface,
            observation_status,
            observation_context,
            source_evidence_refs,
            observed_at
       FROM public.runtime_consumer_observations
      WHERE observation_context ->> 'projectId' = $1
        AND observation_context ->> 'generationBatchId' = $2
      ORDER BY id`,
    [projectId, generationBatchId],
  );
  const callRowIds = stringArray(callRows.map((row) => row.id));
  const observationRowIds = stringArray(observationRows.map((row) => row.id));
  const expectedObservationBindings = sortedTextArray(callRows.flatMap((row) => {
    const context = row.call_context && typeof row.call_context === 'object'
      ? row.call_context
      : {};
    return stringArray(context.runtimeArtifactPublicationKeys).map((publicationKey) => (
      `${normalizeText(row.consumer_key)}\u0000${publicationKey}`
    ));
  }));
  const observedObservationBindings = sortedTextArray(observationRows.map((row) => (
    `${normalizeText(row.consumer_key)}\u0000${normalizeText(row.publication_key)}`
  )));
  const expectedPublicationKeys = stringArray(callRows.flatMap((row) => {
    const context = row.call_context && typeof row.call_context === 'object'
      ? row.call_context
      : {};
    return context.runtimeArtifactPublicationKeys;
  }));
  const observedPublicationKeys = stringArray(observationRows.map((row) => row.publication_key));
  const runtimeCallArtifactDeclarationsValid = callRows.every((row) => {
    const context = row.call_context && typeof row.call_context === 'object'
      ? row.call_context
      : {};
    const publicationKeys = stringArray(context.runtimeArtifactPublicationKeys);
    const artifactCount = readInt(context.runtimeArtifactCount);
    const expectedMode = publicationKeys.length > 0 ? 'published_artifact' : 'no_published_artifact';
    return artifactCount === publicationKeys.length
      && normalizeText(context.runtimeAssetMode) === expectedMode;
  });
  const publicationKeysMatch = arraysEqual(expectedPublicationKeys, observedPublicationKeys)
    && arraysEqual(expectedObservationBindings, observedObservationBindings);
  return {
    callBefore: 0,
    callAfter: callRows.length,
    callDelta: callRows.length,
    observationBefore: 0,
    observationAfter: observationRows.length,
    observationDelta: observationRows.length,
    expectedPublicationKeys,
    observedPublicationKeys,
    publishedArtifactCount: expectedPublicationKeys.length,
    expectedObservationDelta: expectedObservationBindings.length,
    publicationKeysMatch,
    runtimeCallArtifactDeclarationsValid,
    callRowIds,
    callRowsHash: hashC19RuntimeConsumerLedgerRows(callRows),
    observationRowIds,
    observationRowsHash: hashC19RuntimeConsumerLedgerRows(observationRows),
  };
}

function emptyRuntimeConsumerLedgerReadback() {
  return {
    callBefore: 0,
    callAfter: 0,
    callDelta: 0,
    observationBefore: 0,
    observationAfter: 0,
    observationDelta: 0,
    publishedArtifactCount: 0,
    expectedObservationDelta: 0,
    expectedPublicationKeys: [],
    observedPublicationKeys: [],
    publicationKeysMatch: true,
    runtimeCallArtifactDeclarationsValid: false,
    callRowIds: [],
    callRowsHash: hashC19RuntimeConsumerLedgerRows([]),
    observationRowIds: [],
    observationRowsHash: hashC19RuntimeConsumerLedgerRows([]),
  };
}

export function hashC19RuntimeConsumerLedgerRows(rows) {
  const normalized = [...(Array.isArray(rows) ? rows : [])]
    .sort((left, right) => normalizeText(left?.id).localeCompare(normalizeText(right?.id)))
    .map(stableJsonValue);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]),
  );
}

function stringArray(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(normalizeText).filter(Boolean))].sort();
}

function sortedTextArray(value) {
  return (Array.isArray(value) ? value : []).map(normalizeText).filter(Boolean).sort();
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function emptyCanonicalReadiness(reasonCodes) {
  return {
    canonicalWizardSmokeFile: null,
    environmentClassification: null,
    deployedStagingCode: false,
    productionLive: false,
    releaseSha: null,
    projectId: null,
    createdTaskCount: 0,
    dependencyReadbackCount: 0,
    criticalPathDependencyEdgeCount: 0,
    projectDurationDays: 0,
    baselineItemCount: 0,
    wizardCommitReady: false,
    dependencyReadbackReady: false,
    criticalPathReady: false,
    baselineRevisionRollbackReady: false,
    cleanupReady: false,
    projectResidueReadbackReady: false,
    projectResidueReadback: emptyProjectResidueReadback(null),
    runtimeConsumerCallDeltaReady: false,
    runtimeConsumerObservationDeltaReady: false,
    runtimeConsumerLedger: {
      status: null,
      appendOnly: false,
      projectId: null,
      generationBatchId: null,
      callBefore: 0,
      callAfter: 0,
      callDelta: 0,
      observationBefore: 0,
      observationAfter: 0,
      observationDelta: 0,
      publishedArtifactCount: 0,
      expectedObservationDelta: 0,
    },
    reasonCodes,
  };
}

function emptyProjectResidueReadback(projectId) {
  return {
    schemaVersion: 'workbuddy-project-residue-readback/v1',
    status: 'not_run',
    reason: 'trusted_project_and_database_identity_required',
    projectId: projectId || null,
    scannedTableCount: 0,
    scannedTables: [],
    retainedHistoricalProjectReferenceTables: [],
    retainedHistoricalResidue: [],
    totalRetainedHistoricalResidueCount: 0,
    nonZeroBusinessTables: [],
    totalBusinessResidueCount: 0,
    queryMutationCount: 0,
    readbackHash: null,
  };
}

function buildAdvisoryCodes({ replaySampleReadiness, taskReadiness }) {
  const advisoryCodes = [];
  if (replaySampleReadiness.durationSampleCount < 1) advisoryCodes.push('duration_experience_samples_missing');
  if (replaySampleReadiness.t2WindowSampleCount < 1) advisoryCodes.push('duration_experience_t2_window_samples_missing');
  if (taskReadiness.completedActualTaskCount > 0 && taskReadiness.t2MetadataTaskCount < 1) {
    advisoryCodes.push('t2_window_metadata_missing');
  }
  return Array.from(new Set(advisoryCodes));
}

async function closeQueryExec(queryExec) {
  if (typeof queryExec?.close === 'function') await queryExec.close();
}

function readInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/check-c19-runtime-preflight.mjs --wizard-smoke-file <wizard-baseline-revision.json> --expected-environment <staging|production> --expected-release-sha <sha> --expected-project-ref <ref> --output <json>

Runs a read-only canonical wizard/WBS preflight. It never writes tasks, dependencies, baselines, forecasts, or runtime publications.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }
    const report = await checkC19RuntimePreflight(options);
    console.log(`C19 canonical wizard/WBS preflight: ${report.status}`);
    console.log(`DB mutation: ${report.dbMutation ? 'yes' : 'no'}`);
    if (report.reasonCodes.length > 0) console.log(`Reasons: ${report.reasonCodes.join(', ')}`);
    if (report.advisoryCodes.length > 0) console.log(`Advisories: ${report.advisoryCodes.join(', ')}`);
    process.exitCode = report.status === 'ready' ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) await main();
