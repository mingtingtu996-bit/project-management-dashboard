#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'server/.env');

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: DEFAULT_ENV_FILE,
    projectId: '',
    canonicalWizardSmokeFile: null,
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
  output = null,
  queryExec = null,
  now = new Date(),
} = {}) {
  const exec = queryExec ?? await createPgQueryExec(envFile);
  try {
    const normalizedProjectId = normalizeText(projectId);
    const replaySampleReadiness = await readReplaySampleReadiness(exec, normalizedProjectId);
    const taskReadiness = await readTaskReadiness(exec, normalizedProjectId);
    const canonicalWizardWbsReadiness = await readCanonicalWizardSmokeReadiness({
      canonicalWizardSmokeFile,
      projectId: normalizedProjectId,
    });
    const reasonCodes = canonicalWizardWbsReadiness.reasonCodes;
    const advisoryCodes = buildAdvisoryCodes({ replaySampleReadiness, taskReadiness });
    const report = {
      schemaVersion: 'workbuddy-c19-runtime-preflight/v2',
      status: reasonCodes.length === 0 ? 'ready' : 'blocked',
      generatedAt: now.toISOString(),
      projectId: normalizedProjectId,
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
    await closeQueryExec(exec);
  }
}

async function createPgQueryExec(envFile) {
  const env = dotenv.parse(await readFile(envFile, 'utf8'));
  const connectionString = normalizeText(env.SUPABASE_MIGRATION_URL) || normalizeText(env.DB_CONNECTION_STRING);
  if (!connectionString) {
    throw new Error('SUPABASE_MIGRATION_URL or DB_CONNECTION_STRING is required for C19 canonical preflight');
  }
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
  exec.close = async () => client.end();
  return exec;
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

async function readCanonicalWizardSmokeReadiness({ canonicalWizardSmokeFile, projectId }) {
  if (!canonicalWizardSmokeFile) return emptyCanonicalReadiness(['canonical_wizard_smoke_file_required']);

  let smoke;
  try {
    smoke = JSON.parse((await readFile(canonicalWizardSmokeFile, 'utf8')).replace(/^\uFEFF/, ''));
  } catch (error) {
    return emptyCanonicalReadiness([
      `canonical_wizard_smoke_invalid:${error instanceof Error ? error.message : String(error)}`,
    ]);
  }

  const reasonCodes = [];
  if (normalizeText(smoke.source) !== 'wizard_baseline_revision_live_probe') {
    reasonCodes.push('canonical_wizard_smoke_source_invalid');
  }
  if (normalizeText(smoke.status) !== 'pass') reasonCodes.push('canonical_wizard_smoke_not_pass');
  if (projectId && normalizeText(smoke.projectId) !== projectId) {
    reasonCodes.push('canonical_wizard_smoke_project_mismatch');
  }

  const steps = smoke.steps ?? {};
  const commit = steps.commitWizardGeneration ?? {};
  const dependency = steps.taskDependencyReadback ?? {};
  const criticalPath = steps.criticalPathReadback ?? {};
  const baseline = steps.readCandidateBaseline ?? {};
  const publish = steps.publishBaseline ?? {};
  const revision = steps.startRevision ?? {};
  const rollback = steps.rollbackRevisionDraft ?? {};
  const cleanup = smoke.cleanup ?? {};
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
  const cleanupReady = cleanup.status === 'pass'
    && cleanup.projectPhysicallyDeleted === true
    && cleanup.projectUnreadable === true;

  if (!wizardCommitReady) reasonCodes.push('canonical_wizard_commit_missing');
  if (!dependencyReadbackReady) reasonCodes.push('canonical_dependency_readback_missing');
  if (!criticalPathReady) reasonCodes.push('canonical_critical_path_readback_missing');
  if (!baselineRevisionRollbackReady) reasonCodes.push('canonical_baseline_revision_rollback_missing');
  if (!cleanupReady) reasonCodes.push('canonical_smoke_cleanup_missing');

  return {
    canonicalWizardSmokeFile: path.resolve(canonicalWizardSmokeFile),
    environmentClassification: normalizeText(smoke.environmentClassification) || null,
    deployedStagingCode: smoke.deployedStagingCode === true,
    productionLive: smoke.productionLive === true,
    projectId: normalizeText(smoke.projectId) || null,
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
    reasonCodes: Array.from(new Set(reasonCodes)),
  };
}

function emptyCanonicalReadiness(reasonCodes) {
  return {
    canonicalWizardSmokeFile: null,
    environmentClassification: null,
    deployedStagingCode: false,
    productionLive: false,
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
    reasonCodes,
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
  node project-testing/tools/check-c19-runtime-preflight.mjs --project-id <id> --wizard-smoke-file <staging-wizard-baseline-revision.json> --output <json>

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
