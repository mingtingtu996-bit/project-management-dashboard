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
    output: null,
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
      options.envFile = path.resolve(nextValue());
    } else if (arg === '--project-id') {
      options.projectId = nextValue();
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
  output = null,
  queryExec = null,
  now = new Date(),
} = {}) {
  const exec = queryExec ?? await createPgQueryExec(envFile);
  try {
    const normalizedProjectId = normalizeText(projectId);
    const replaySampleReadiness = await readReplaySampleReadiness(exec, normalizedProjectId);
    const publicationReadiness = await readPublicationReadiness(exec, normalizedProjectId);
    const runtimeEventReadiness = await readRuntimeEventReadiness(exec);
    const taskReadiness = await readTaskReadiness(exec, normalizedProjectId);
    const reasonCodes = buildReasonCodes({
      replaySampleReadiness,
      publicationReadiness,
      runtimeEventReadiness,
      taskReadiness,
    });
    const report = {
      schemaVersion: 'workbuddy-c19-runtime-preflight/v1',
      status: reasonCodes.length === 0 ? 'ready' : 'blocked',
      generatedAt: now.toISOString(),
      projectId: normalizedProjectId,
      dbMutation: false,
      liveMutation: false,
      replaySampleReadiness,
      publicationReadiness,
      runtimeEventReadiness,
      taskReadiness,
      readiness: {
        replaySamplesReady: replaySampleReadiness.durationSampleCount > 0
          && replaySampleReadiness.t2WindowSampleCount > 0,
        runtimePublicationReady: publicationReadiness.publicationCount > 0
          && Boolean(publicationReadiness.latestPublicationKey),
        monitoringReady: runtimeEventReadiness.monitoringCount > 0,
        rollbackReady: runtimeEventReadiness.rollbackCount > 0,
        taskMetadataReady: taskReadiness.t2MetadataTaskCount > 0,
      },
      reasonCodes,
      boundary: 'Read-only C19 runtime preflight. This report does not generate release packages, publish runtime records, patch tasks, write dependencies, monitor, or rollback.',
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
    throw new Error('SUPABASE_MIGRATION_URL or DB_CONNECTION_STRING is required for C19 runtime preflight');
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
  exec.close = async () => {
    await client.end();
  };
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

async function readPublicationReadiness(queryExec, projectId) {
  const whereProject = projectId ? 'AND project_id = $1' : '';
  const params = projectId ? [projectId] : [];
  const rows = await queryExec(
    `SELECT count(*)::int AS publication_count,
            (array_agg(publication_key ORDER BY published_at DESC NULLS LAST, updated_at DESC NULLS LAST))[1]::text AS latest_publication_key
       FROM public.t2_rhythm_schedule_runtime_publications
      WHERE runtime_publication_status IN ('runtime_published', 'runtime_rolled_back')
        ${whereProject}`,
    params,
  );
  const row = rows[0] ?? {};
  return {
    publicationCount: readInt(row.publication_count),
    latestPublicationKey: normalizeText(row.latest_publication_key) || null,
  };
}

async function readRuntimeEventReadiness(queryExec) {
  const rows = await queryExec(
    `SELECT count(*)::int AS event_count,
            count(*) FILTER (WHERE event_type = 'impact_monitoring')::int AS monitoring_count,
            count(*) FILTER (WHERE event_type = 'rollback_execution')::int AS rollback_count
       FROM public.t2_rhythm_schedule_runtime_events`,
  );
  const row = rows[0] ?? {};
  return {
    eventCount: readInt(row.event_count),
    monitoringCount: readInt(row.monitoring_count),
    rollbackCount: readInt(row.rollback_count),
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

function buildReasonCodes({
  replaySampleReadiness,
  publicationReadiness,
  runtimeEventReadiness,
  taskReadiness,
}) {
  const reasons = [];
  if (replaySampleReadiness.durationSampleCount < 1) reasons.push('duration_experience_samples_missing');
  if (replaySampleReadiness.t2WindowSampleCount < 1) reasons.push('duration_experience_t2_window_samples_missing');
  if (taskReadiness.completedActualTaskCount > 0 && taskReadiness.t2MetadataTaskCount < 1) reasons.push('t2_window_metadata_missing');
  if (publicationReadiness.publicationCount < 1 || !publicationReadiness.latestPublicationKey) reasons.push('runtime_publication_missing');
  if (runtimeEventReadiness.monitoringCount < 1) reasons.push('impact_monitoring_event_missing');
  if (runtimeEventReadiness.rollbackCount < 1) reasons.push('rollback_event_missing');
  return Array.from(new Set(reasons));
}

async function closeQueryExec(queryExec) {
  if (typeof queryExec?.close === 'function') {
    await queryExec.close();
  }
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
  node project-testing/tools/check-c19-runtime-preflight.mjs --project-id <id> --output <json>

Runs read-only DB preflight for C19 runtime publication. It does not publish, monitor, rollback, or mutate tasks/dependencies.
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
    console.log(`C19 runtime preflight: ${report.status}`);
    console.log(`DB mutation: ${report.dbMutation ? 'yes' : 'no'}`);
    if (report.reasonCodes.length > 0) console.log(`Reasons: ${report.reasonCodes.join(', ')}`);
    process.exitCode = report.status === 'ready' ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
