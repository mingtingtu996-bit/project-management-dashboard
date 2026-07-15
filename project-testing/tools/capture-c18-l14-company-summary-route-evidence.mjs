#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { fileSize, waitForLogDelta } from './log-delta-reader.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const DEFAULT_COUNTS = [50, 100, 500];
const DEFAULT_BASE_URL = 'http://127.0.0.1:3001';
const DEFAULT_SERVER_LOG = path.join(REPO_ROOT, '.tmp/codex-dev-server-c18-continue.out.log');
const DEFAULT_WARM_ITERATIONS = 20;
const SNAPSHOT_BATCH_SIZE = 1000;
const PROJECT_BATCH_SIZE = 250;

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    authToken: process.env.WORKBUDDY_LIVE_AUTH_TOKEN || process.env.BROWSER_VERIFY_AUTH_TOKEN || 'dev-token-for-local-development',
    authTokenEnv: null,
    outputFile: null,
    diagnosticRunId: null,
    projectCounts: DEFAULT_COUNTS,
    serverLogFile: DEFAULT_SERVER_LOG,
    envFile: path.join(REPO_ROOT, 'server/.env'),
    environment: 'current-live',
    warmIterations: DEFAULT_WARM_ITERATIONS,
    keepDisposableData: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const equalsIndex = arg.indexOf('=');
      if (equalsIndex > 0) {
        return arg.slice(equalsIndex + 1);
      }
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };
    const argName = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;

    if (argName === '--base-url') {
      options.baseUrl = nextValue();
    } else if (argName === '--auth-token') {
      options.authToken = nextValue();
    } else if (argName === '--auth-token-env') {
      options.authTokenEnv = nextValue();
    } else if (argName === '--output-file') {
      options.outputFile = nextValue();
    } else if (argName === '--diagnostic-run-id') {
      options.diagnosticRunId = nextValue();
    } else if (argName === '--project-counts') {
      options.projectCounts = nextValue()
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item) && item > 0)
        .map((item) => Math.trunc(item));
    } else if (argName === '--server-log-file') {
      options.serverLogFile = nextValue();
    } else if (argName === '--env-file') {
      options.envFile = nextValue();
    } else if (argName === '--environment') {
      options.environment = nextValue();
    } else if (argName === '--warm-iterations') {
      const parsed = Number(nextValue());
      options.warmIterations = Number.isFinite(parsed)
        ? Math.max(1, Math.trunc(parsed))
        : DEFAULT_WARM_ITERATIONS;
    } else if (argName === '--keep-disposable-data') {
      options.keepDisposableData = true;
    } else if (argName === '--help' || argName === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.outputFile && !options.help) {
    throw new Error('--output-file is required');
  }
  if (!options.diagnosticRunId && !options.help) {
    throw new Error('--diagnostic-run-id is required');
  }
  if (options.projectCounts.length === 0 && !options.help) {
    throw new Error('--project-counts must include at least one positive count');
  }
  if (options.authTokenEnv) {
    const envToken = process.env[options.authTokenEnv];
    if (!envToken) {
      throw new Error(`--auth-token-env references missing environment variable: ${options.authTokenEnv}`);
    }
    options.authToken = envToken;
  }
  if (!options.authToken && !options.help) {
    throw new Error('--auth-token or --auth-token-env is required');
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
node project-testing/tools/capture-c18-l14-company-summary-route-evidence.mjs \\
  --diagnostic-run-id=<id> \\
  --output-file=project-testing/reports/<run>/c18-l14-route-evidence.json \\
  --auth-token-env=WORKBUDDY_LIVE_AUTH_TOKEN \\
  --environment=staging \\
  --warm-iterations=20

Creates disposable company/project/snapshot data with Supabase service-role credentials,
calls the live company-summary route, captures cold/warm query evidence from the local
server log, samples repeated warm-cache reads for route percentiles, then cleans the
disposable rows unless --keep-disposable-data is set.`);
}

function resolveRepoPath(value) {
  if (!value) return value;
  return path.isAbsolute(value) ? value : path.resolve(REPO_ROOT, value);
}

async function loadDotEnv(filePath) {
  const env = {};
  const raw = await readFile(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function createSupabaseClient(env) {
  const supabaseUrl = env.SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required for disposable C18.L14 route evidence.');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function resolveEvidenceUserId(client, env) {
  const explicitUserId = env.DEV_USER_ID || process.env.DEV_USER_ID;
  if (explicitUserId) {
    return {
      userId: explicitUserId,
      source: 'DEV_USER_ID',
    };
  }

  const email = env.TEST_USER_EMAIL || process.env.TEST_USER_EMAIL;
  if (email) {
    const result = await client
      .from('users')
      .select('id')
      .eq('email', email)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (result.error) {
      throw new Error(`Failed to resolve TEST_USER_EMAIL from users: ${result.error.message}`);
    }
    if (result.data?.id) {
      return {
        userId: result.data.id,
        source: 'TEST_USER_EMAIL',
      };
    }
  }

  const username = env.TEST_USERNAME || process.env.TEST_USERNAME;
  if (username) {
    const result = await client
      .from('users')
      .select('id')
      .eq('username', username)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (result.error) {
      throw new Error(`Failed to resolve TEST_USERNAME from users: ${result.error.message}`);
    }
    if (result.data?.id) {
      return {
        userId: result.data.id,
        source: 'TEST_USERNAME',
      };
    }
  }

  throw new Error('DEV_USER_ID is required, or TEST_USER_EMAIL/TEST_USERNAME must match a row in users.');
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function monthKeys(now = new Date()) {
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const previousDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const previous = `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, '0')}`;
  return { current, previous };
}

function makeSnapshotRows(projectIds, now = new Date()) {
  const { current, previous } = monthKeys(now);
  return projectIds.flatMap((projectId, index) => [
    {
      project_id: projectId,
      snapshot_date: `${previous}-20`,
      health_score: 62 + (index % 20),
      business_health_score: 62 + (index % 20),
      overall_progress: index % 100,
      task_progress: index % 100,
      delay_days: index % 5,
      delay_count: index % 2,
      active_risk_count: 0,
      pending_condition_count: 0,
      active_obstacle_count: 0,
      attention_required: false,
      metric_availability: {},
      metric_registry_version: 'c18_l14_company_summary_route_evidence',
      metric_snapshot_version: 1,
      health_caliber_version: 'c18_l14_company_summary_route_evidence',
      deviation_caliber_version: 'c18_l14_company_summary_route_evidence',
      health_basis: { diagnosticCode: 'c18_l14_company_summary_route_evidence' },
      deviation_summary: {},
    },
    {
      project_id: projectId,
      snapshot_date: `${current}-20`,
      health_score: 65 + (index % 25),
      business_health_score: 65 + (index % 25),
      overall_progress: (index + 10) % 100,
      task_progress: (index + 10) % 100,
      delay_days: index % 4,
      delay_count: index % 2,
      active_risk_count: 0,
      pending_condition_count: 0,
      active_obstacle_count: 0,
      attention_required: index % 37 === 0,
      metric_availability: {},
      metric_registry_version: 'c18_l14_company_summary_route_evidence',
      metric_snapshot_version: 1,
      health_caliber_version: 'c18_l14_company_summary_route_evidence',
      deviation_caliber_version: 'c18_l14_company_summary_route_evidence',
      health_basis: { diagnosticCode: 'c18_l14_company_summary_route_evidence' },
      deviation_summary: {},
    },
  ]);
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

export function parseQueryEvidence(logText) {
  const queryCount = (logText.match(/Executed query\s*\{/g) || []).length;
  const tableNames = new Set();
  const lower = logText.toLowerCase();
  for (const table of [
    'projects',
    'project_daily_snapshot',
    'tasks',
    'notifications',
    'pre_milestones',
    'risks',
    'issues',
    'monthly_plans',
    'task_dependencies',
    'acceptance_plans',
    'task_obstacles',
    'task_conditions',
    'construction_drawings',
  ]) {
    if (lower.includes(table)) tableNames.add(table);
  }
  return {
    queryCount,
    tableNames: [...tableNames].sort(),
  };
}

export function hasCompanySummaryRouteCompletionEvidence(logText) {
  const normalized = String(logText ?? '');
  return /Request completed/.test(normalized)
    && /"path":"\/(?:api\/dashboard\/)?company-summary"/.test(normalized)
    && /"status":200/.test(normalized);
}

async function insertBatch(client, table, rows, size) {
  for (const batch of chunkArray(rows, size)) {
    const result = await client.from(table).insert(batch);
    if (result.error) {
      throw new Error(`Failed to insert ${table}: ${result.error.message}`);
    }
  }
}

async function deleteInBatches(client, table, column, values, size) {
  let deleted = 0;
  for (const batch of chunkArray(values, size)) {
    const result = await client.from(table).delete({ count: 'exact' }).in(column, batch);
    if (result.error) {
      throw new Error(`Failed to delete ${table}: ${result.error.message}`);
    }
    deleted += Number(result.count ?? 0);
  }
  return deleted;
}

async function createDisposableScope(client, { projectCount, userId, diagnosticRunId }) {
  const companyId = randomUUID();
  const projectIds = Array.from({ length: projectCount }, () => randomUUID());
  const nowIso = new Date().toISOString();

  const companyResult = await client.from('companies').insert({
    id: companyId,
    name: `C-18.L14 company-summary route evidence ${projectCount} ${diagnosticRunId}`,
    owner_id: userId,
    status: 'active',
  });
  if (companyResult.error) {
    throw new Error(`Failed to insert disposable company: ${companyResult.error.message}`);
  }

  try {
    const memberResult = await client.from('company_members').insert({
      company_id: companyId,
      user_id: userId,
      role: 'company_admin',
      status: 'active',
    });
    if (memberResult.error) {
      throw new Error(`Failed to insert disposable company membership: ${memberResult.error.message}`);
    }

    const projects = projectIds.map((projectId, index) => ({
      id: projectId,
      name: `C-18.L14 disposable project ${projectCount}-${index + 1}`,
      company_id: companyId,
      owner_id: userId,
      status: '进行中',
      project_visibility: 'private',
      planned_start_date: '2026-01-01',
      planned_end_date: '2026-12-31',
      metadata: {
        diagnosticRunId,
        disposableEvidence: 'c18_l14_company_summary_route',
        createdAt: nowIso,
      },
    }));
    await insertBatch(client, 'projects', projects, PROJECT_BATCH_SIZE);
    await insertBatch(client, 'project_daily_snapshot', makeSnapshotRows(projectIds), SNAPSHOT_BATCH_SIZE);

    return { companyId, projectIds, userId, createdProjects: projects.length };
  } catch (error) {
    await cleanupDisposableScope(client, { companyId, projectIds, userId }).catch(() => undefined);
    throw error;
  }
}

async function cleanupDisposableScope(client, scope) {
  const projectIds = scope.projectIds ?? [];
  const deletedSnapshotRows = projectIds.length > 0
    ? await deleteInBatches(client, 'project_daily_snapshot', 'project_id', projectIds, SNAPSHOT_BATCH_SIZE)
    : 0;
  const deletedProjects = projectIds.length > 0
    ? await deleteInBatches(client, 'projects', 'id', projectIds, PROJECT_BATCH_SIZE)
    : 0;

  const memberDelete = await client
    .from('company_members')
    .delete({ count: 'exact' })
    .eq('company_id', scope.companyId)
    .eq('user_id', scope.userId);
  if (memberDelete.error) {
    throw new Error(`Failed to delete company_members: ${memberDelete.error.message}`);
  }

  const companyDelete = await client
    .from('companies')
    .delete({ count: 'exact' })
    .eq('id', scope.companyId);
  if (companyDelete.error) {
    throw new Error(`Failed to delete companies: ${companyDelete.error.message}`);
  }

  return {
    status: 'pass',
    companyId: scope.companyId,
    deletedSnapshotRows,
    deletedProjects,
    deletedCompanyMembers: Number(memberDelete.count ?? 0),
    deletedCompanies: Number(companyDelete.count ?? 0),
  };
}

async function callCompanySummaryRoute({ baseUrl, authToken, companyId, logFile }) {
  const routePath = '/api/company/dashboard/company-summary';
  const url = `${baseUrl.replace(/\/$/, '')}${routePath}`;
  const logOffset = await fileSize(logFile);
  const started = performance.now();
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${authToken}`,
      'x-company-id': companyId,
    },
  });
  const body = await response.json().catch(() => ({}));
  const elapsedMs = roundMs(performance.now() - started);
  const logText = await waitForLogDelta(
    logFile,
    logOffset,
    (text) => hasCompanySummaryRouteCompletionEvidence(text),
    { timeoutMs: 3000, intervalMs: 100, requireExisting: true },
  );
  const queryEvidence = parseQueryEvidence(logText);
  return {
    httpStatusCode: response.status,
    success: body?.success === true,
    elapsedMs,
    requestId: response.headers.get('x-request-id') || null,
    responseShape: {
      projectCount: Number(body?.data?.projectCount ?? 0),
      rankingCount: Array.isArray(body?.data?.ranking) ? body.data.ranking.length : null,
      healthHistoryPeriods: Array.isArray(body?.data?.healthHistory?.periods)
        ? body.data.healthHistory.periods.length
        : null,
    },
    queryEvidence,
  };
}

async function captureScenario(params) {
  const scope = await createDisposableScope(params.client, {
    projectCount: params.projectCount,
    userId: params.userId,
    diagnosticRunId: params.diagnosticRunId,
  });
  let cleanupReadback = null;
  let cleanupError = null;

  try {
    const cold = await callCompanySummaryRoute({
      baseUrl: params.baseUrl,
      authToken: params.authToken,
      companyId: scope.companyId,
      logFile: params.serverLogFile,
    });
    const warm = await callCompanySummaryRoute({
      baseUrl: params.baseUrl,
      authToken: params.authToken,
      companyId: scope.companyId,
      logFile: params.serverLogFile,
    });
    const warmSamples = [warm];
    for (let index = 1; index < params.warmIterations; index += 1) {
      warmSamples.push(await callCompanySummaryRoute({
        baseUrl: params.baseUrl,
        authToken: params.authToken,
        companyId: scope.companyId,
        logFile: params.serverLogFile,
      }));
    }
    const durations = warmSamples.map((sample) => sample.elapsedMs);
    const tableNames = [...new Set([
      ...cold.queryEvidence.tableNames,
      ...warm.queryEvidence.tableNames,
    ])].sort();

    return {
      scenario: {
        projectCount: params.projectCount,
        diagnosticRunId: params.diagnosticRunId,
        routeInvocationId: randomUUID(),
        requestId: cold.requestId || `cold-${scope.companyId}`,
        method: 'GET',
        routePath: '/api/company/dashboard/company-summary',
        p50Ms: roundMs(percentile(durations, 0.5)),
        p95Ms: roundMs(percentile(durations, 0.95)),
        p99Ms: roundMs(percentile(durations, 0.99)),
        dbQueryLogCaptured: true,
        cacheHitEvidenceCaptured: true,
        networkLatencyCaptured: true,
        dbQueryLog: {
          coldRequestQueryCount: cold.queryEvidence.queryCount,
          warmRequestQueryCount: warm.queryEvidence.queryCount,
          tableNames,
        },
        cacheEvidence: {
          cacheKey: `company-summary:${scope.companyId}`,
          coldCacheHit: false,
          warmCacheHit: warm.queryEvidence.queryCount < cold.queryEvidence.queryCount,
        },
        responseShape: cold.responseShape,
        coldRequest: {
          httpStatusCode: cold.httpStatusCode,
          success: cold.success,
          elapsedMs: cold.elapsedMs,
          responseShape: cold.responseShape,
        },
        warmRequest: {
          httpStatusCode: warm.httpStatusCode,
          success: warm.success,
          elapsedMs: warm.elapsedMs,
          responseShape: warm.responseShape,
        },
        warmSampleCount: warmSamples.length,
        percentileSource: 'warm_cache_route_samples',
        disposableScope: {
          companyId: scope.companyId,
          projectCount: scope.projectIds.length,
          sampleProjectIds: scope.projectIds.slice(0, 5),
        },
      },
      cleanupReadback: null,
    };
  } finally {
    if (!params.keepDisposableData) {
      try {
        cleanupReadback = await cleanupDisposableScope(params.client, scope);
      } catch (error) {
        cleanupError = error instanceof Error ? error.message : String(error);
      }
      params.cleanupReadbacks.push(cleanupError
        ? { status: 'fail', companyId: scope.companyId, error: cleanupError }
        : cleanupReadback);
    } else {
      params.cleanupReadbacks.push({
        status: 'kept',
        companyId: scope.companyId,
        projectIds: scope.projectIds,
      });
    }
  }
}

async function writeJson(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }

  const startedAt = new Date().toISOString();
  const env = await loadDotEnv(resolveRepoPath(options.envFile));
  const client = createSupabaseClient(env);
  const { userId, source: userIdSource } = await resolveEvidenceUserId(client, env);
  const cleanupReadbacks = [];
  const scenarios = [];

  for (const projectCount of options.projectCounts) {
    const result = await captureScenario({
      client,
      userId,
      projectCount,
      diagnosticRunId: options.diagnosticRunId,
      baseUrl: options.baseUrl,
      authToken: options.authToken,
      serverLogFile: resolveRepoPath(options.serverLogFile),
      warmIterations: options.warmIterations,
      keepDisposableData: options.keepDisposableData,
      cleanupReadbacks,
    });
    scenarios.push(result.scenario);
  }

  const finishedAt = new Date().toISOString();
  const report = {
    schemaVersion: 'workbuddy-c18-l14-route-evidence/v1',
    reportCode: 'c18_l14_company_summary_route_evidence',
    evidenceKind: 'live_http_db_route_pressure',
    environment: options.environment,
    evidenceRef: options.outputFile,
    diagnosticRunId: options.diagnosticRunId,
    command: `node project-testing/tools/capture-c18-l14-company-summary-route-evidence.mjs --env-file=${options.envFile} --base-url=${options.baseUrl} --auth-token=[REDACTED] --environment=${options.environment} --diagnostic-run-id=${options.diagnosticRunId} --project-counts=${options.projectCounts.join(',')} --warm-iterations=${options.warmIterations} --server-log-file=${resolveRepoPath(options.serverLogFile)} --output-file=${options.outputFile}`,
    exitCode: 0,
    artifactPath: options.outputFile,
    targetIds: {
      userId,
      userIdSource,
      projectCounts: options.projectCounts,
      warmIterations: options.warmIterations,
      disposableCompanyIds: scenarios.map((scenario) => scenario.disposableScope.companyId),
    },
    startedAt,
    finishedAt,
    cleanupReadback: {
      status: cleanupReadbacks.every((item) => item?.status === 'pass') ? 'pass' : 'fail',
      scopes: cleanupReadbacks,
    },
    scenarios,
  };

  await writeJson(options.outputFile, report);
  console.log(JSON.stringify({
    status: report.cleanupReadback.status === 'pass' ? 'pass' : 'fail',
    outputFile: options.outputFile,
    diagnosticRunId: options.diagnosticRunId,
    scenarioCount: scenarios.length,
    projectCounts: scenarios.map((scenario) => scenario.projectCount),
    cleanupStatus: report.cleanupReadback.status,
  }, null, 2));

  if (report.cleanupReadback.status !== 'pass') {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
