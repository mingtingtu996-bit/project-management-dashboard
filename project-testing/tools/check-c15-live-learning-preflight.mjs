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
    companyId: '',
    metricWindow: '',
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
    } else if (arg === '--company-id') {
      options.companyId = nextValue();
    } else if (arg === '--metric-window') {
      options.metricWindow = nextValue();
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

export async function checkC15LiveLearningPreflight({
  envFile = DEFAULT_ENV_FILE,
  projectId = '',
  companyId = '',
  metricWindow = '',
  output = null,
  queryExec = null,
  now = new Date(),
} = {}) {
  const exec = queryExec ?? await createPgQueryExec(envFile);
  try {
    const normalizedProjectId = normalizeText(projectId);
    const normalizedCompanyId = normalizeText(companyId);
    const decisionSummary = await readDecisionSummary(exec, normalizedProjectId);
    const candidateSummary = await readCandidateSummary(exec, normalizedProjectId, normalizedCompanyId);
    const calibrationSummary = await readCalibrationSummary(exec, normalizedProjectId);
    const reasonCodes = buildReasonCodes({
      metricWindow,
      decisionSummary,
      candidateSummary,
      calibrationSummary,
    });
    const report = {
      schemaVersion: 'workbuddy-c15-live-learning-preflight/v1',
      status: reasonCodes.length === 0 ? 'ready' : 'blocked',
      generatedAt: now.toISOString(),
      projectId: normalizedProjectId,
      companyId: normalizedCompanyId,
      metricWindow: normalizeText(metricWindow),
      dbMutation: false,
      liveMutation: false,
      decisionSummary,
      candidateSummary,
      calibrationSummary,
      readiness: {
        rewardEvaluationReady: Number(decisionSummary.evaluatedCount) > 0
          && Number(decisionSummary.pendingCount) === 0,
        candidateReady: Number(candidateSummary.candidateCount) > 0
          && Boolean(normalizeText(candidateSummary.latestCandidateId)),
        metricWindowReady: Boolean(normalizeText(metricWindow)),
        calibrationReadbackReady: Number(calibrationSummary.calibrationCount) > 0,
      },
      reasonCodes,
      boundary: 'Read-only C15 preflight. This report does not create canary candidates, evaluate rewards, approve policy versions, or mutate live/DB state.',
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
    throw new Error('SUPABASE_MIGRATION_URL or DB_CONNECTION_STRING is required for C15 live-learning preflight');
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

async function closeQueryExec(queryExec) {
  if (typeof queryExec?.close === 'function') {
    await queryExec.close();
  }
}

async function readDecisionSummary(queryExec, projectId) {
  const whereProject = projectId ? 'AND project_id = $1' : '';
  const params = projectId ? [projectId] : [];
  const rows = await queryExec(
    `SELECT count(*)::int AS decision_count,
            count(*) FILTER (WHERE reward_status = 'pending')::int AS pending_count,
            count(*) FILTER (WHERE reward_status = 'evaluated')::int AS evaluated_count,
            count(*) FILTER (WHERE reward_status = 'pending' AND target_reward_date <= now())::int AS eligible_now_count,
            count(*) FILTER (WHERE reward_status = 'pending' AND target_reward_date > now())::int AS future_pending_count,
            min(target_reward_date) AS min_target_reward_date,
            max(target_reward_date) AS max_target_reward_date
       FROM public.duration_context_policy_decisions
      WHERE true
        ${whereProject}`,
    params,
  );
  const row = rows[0] ?? {};
  return {
    decisionCount: readInt(row.decision_count),
    pendingCount: readInt(row.pending_count),
    evaluatedCount: readInt(row.evaluated_count),
    eligibleNowCount: readInt(row.eligible_now_count),
    futurePendingCount: readInt(row.future_pending_count),
    minTargetRewardDate: normalizeText(row.min_target_reward_date) || null,
    maxTargetRewardDate: normalizeText(row.max_target_reward_date) || null,
  };
}

async function readCandidateSummary(queryExec, projectId, companyId) {
  const predicates = ["candidate_status IN ('candidate', 'approved_for_canary')"];
  const params = [];
  if (projectId) {
    params.push(projectId);
    predicates.push(`project_id = $${params.length}`);
  }
  if (companyId) {
    params.push(companyId);
    predicates.push(`company_id = $${params.length}`);
  }
  const rows = await queryExec(
    `SELECT count(*)::int AS candidate_count,
            (array_agg(id ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST))[1]::text AS latest_candidate_id
       FROM public.duration_context_policy_canary_candidates
      WHERE ${predicates.join(' AND ')}`,
    params,
  );
  const row = rows[0] ?? {};
  return {
    candidateCount: readInt(row.candidate_count),
    latestCandidateId: normalizeText(row.latest_candidate_id) || null,
  };
}

async function readCalibrationSummary(queryExec, projectId) {
  const whereProject = projectId ? 'AND project_id = $1' : '';
  const params = projectId ? [projectId] : [];
  const rows = await queryExec(
    `SELECT count(*)::int AS calibration_count,
            max(window_end_date) AS latest_window_end_date
       FROM public.project_productivity_compensation_calibrations
      WHERE true
        ${whereProject}`,
    params,
  );
  const row = rows[0] ?? {};
  return {
    calibrationCount: readInt(row.calibration_count),
    latestWindowEndDate: normalizeText(row.latest_window_end_date) || null,
  };
}

function buildReasonCodes({
  metricWindow,
  decisionSummary,
  candidateSummary,
  calibrationSummary,
}) {
  const reasons = [];
  if (!normalizeText(metricWindow)) reasons.push('metric_window_required');
  if (decisionSummary.decisionCount < 1) reasons.push('duration_policy_decisions_missing');
  if (decisionSummary.futurePendingCount > 0 && decisionSummary.eligibleNowCount < 1 && decisionSummary.evaluatedCount < 1) {
    reasons.push('reward_targets_not_due');
  }
  if (decisionSummary.evaluatedCount < 1) reasons.push('evaluated_reward_decisions_missing');
  if (candidateSummary.candidateCount < 1 || !candidateSummary.latestCandidateId) {
    reasons.push('canary_candidate_missing');
  }
  if (calibrationSummary.calibrationCount < 1) reasons.push('calibration_readback_missing');
  return Array.from(new Set(reasons));
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
  node project-testing/tools/check-c15-live-learning-preflight.mjs --project-id <id> --company-id <id> --metric-window <window> --output <json>

Runs read-only DB preflight for C15 live learning. It does not mutate policy decisions, canary candidates, or runtime versions.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }
    const report = await checkC15LiveLearningPreflight(options);
    console.log(`C15 live learning preflight: ${report.status}`);
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
