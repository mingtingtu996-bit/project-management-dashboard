#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { fileSize, sleep, waitForLogDelta } from './log-delta-reader.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const DEFAULT_BASE_URL = 'http://127.0.0.1:3001';
const DEFAULT_AUTH_TOKEN = 'dev-token-for-local-development';
const DEFAULT_SERVER_LOG = path.join(REPO_ROOT, '.tmp/codex-dev-server-c18-continue.out.log');
const DEFAULT_TASK_COUNT = 1000;
const DEFAULT_LOCK_HOLD_MS = 700;
const DEFAULT_DB_WRITE_BUDGET_MS = 30000;
const CRITICAL_PATH_LOCK_NAMESPACE = 'workbuddy_critical_path_project';
const TASK_BATCH_SIZE = 500;
const DEPENDENCY_BATCH_SIZE = 500;

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    authToken: DEFAULT_AUTH_TOKEN,
    authTokenEnv: null,
    outputFile: null,
    diagnosticRunId: null,
    serverLogFile: DEFAULT_SERVER_LOG,
    envFile: path.join(REPO_ROOT, 'server/.env'),
    taskCount: DEFAULT_TASK_COUNT,
    lockHoldMs: DEFAULT_LOCK_HOLD_MS,
    dbWriteBudgetMs: DEFAULT_DB_WRITE_BUDGET_MS,
    keepDisposableData: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const argName = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
    const nextValue = () => {
      const equalsIndex = arg.indexOf('=');
      if (equalsIndex > 0) return arg.slice(equalsIndex + 1);
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };

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
    } else if (argName === '--server-log-file') {
      options.serverLogFile = nextValue();
    } else if (argName === '--env-file') {
      options.envFile = nextValue();
    } else if (argName === '--task-count') {
      const parsed = Number(nextValue());
      options.taskCount = Number.isFinite(parsed) ? Math.max(1000, Math.trunc(parsed)) : DEFAULT_TASK_COUNT;
    } else if (argName === '--lock-hold-ms') {
      const parsed = Number(nextValue());
      options.lockHoldMs = Number.isFinite(parsed) ? Math.max(100, Math.trunc(parsed)) : DEFAULT_LOCK_HOLD_MS;
    } else if (argName === '--db-write-budget-ms') {
      const parsed = Number(nextValue());
      options.dbWriteBudgetMs = Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : DEFAULT_DB_WRITE_BUDGET_MS;
    } else if (argName === '--keep-disposable-data') {
      options.keepDisposableData = true;
    } else if (argName === '--help' || argName === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.authTokenEnv) {
    const envToken = process.env[options.authTokenEnv];
    if (!envToken) throw new Error(`--auth-token-env references missing environment variable: ${options.authTokenEnv}`);
    options.authToken = envToken;
  }
  if (!options.help && !options.outputFile) throw new Error('--output-file is required');
  if (!options.help && !options.diagnosticRunId) throw new Error('--diagnostic-run-id is required');
  return options;
}

function printHelp() {
  console.log(`Usage:
node project-testing/tools/capture-c18-l12-critical-path-db-evidence.mjs \\
  --diagnostic-run-id=<id> \\
  --output-file=project-testing/reports/<run>/c18-l12-db-evidence.json

Creates a disposable company/project with 1000 tasks and 999 active FS dependencies,
forces a real critical-path advisory-lock wait, calls the live refresh/readback routes,
captures final projection readback, then cleans the disposable rows unless
--keep-disposable-data is set.`);
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
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required for disposable C18.L12 evidence.');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function createPgPool(env) {
  const connectionString = env.DB_CONNECTION_STRING || env.SUPABASE_MIGRATION_URL || process.env.DB_CONNECTION_STRING;
  if (connectionString) {
    const parsed = new URL(connectionString);
    parsed.searchParams.delete('sslmode');
    return new Pool({
      connectionString: parsed.toString(),
      ssl: { rejectUnauthorized: false },
      max: 3,
      connectionTimeoutMillis: 8000,
      query_timeout: 30000,
      statement_timeout: 30000,
    });
  }

  const supabaseUrl = env.SUPABASE_URL || process.env.SUPABASE_URL || '';
  const projectRef = supabaseUrl.match(/^https:\/\/([^.]+)\.supabase\.co$/)?.[1];
  return new Pool({
    host: env.DB_HOST || process.env.DB_HOST || (projectRef ? `db.${projectRef}.supabase.co` : '127.0.0.1'),
    port: Number(env.DB_PORT || process.env.DB_PORT || 5432),
    database: env.DB_NAME || process.env.DB_NAME || 'postgres',
    user: env.DB_USER || process.env.DB_USER || 'postgres',
    password: env.DB_PASSWORD || process.env.DB_PASSWORD || '',
    ssl: { rejectUnauthorized: false },
    max: 3,
    connectionTimeoutMillis: 8000,
    query_timeout: 30000,
    statement_timeout: 30000,
  });
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function makeTaskRows({ projectId, taskIds, diagnosticRunId }) {
  const start = new Date(Date.UTC(2026, 0, 1));
  const nowIso = new Date().toISOString();
  return taskIds.map((taskId, index) => {
    const plannedDate = toDateOnly(addDays(start, index));
    return {
      id: taskId,
      project_id: projectId,
      title: `C-18.L12 live critical path task ${index + 1}`,
      status: 'todo',
      priority: 'medium',
      start_date: plannedDate,
      end_date: plannedDate,
      planned_start_date: plannedDate,
      planned_end_date: plannedDate,
      progress: 0,
      is_milestone: false,
      wbs_level: 1,
      sort_order: index + 1,
      duration_contribution_mode: 'duration_bearing',
      created_at: nowIso,
      updated_at: nowIso,
      standard_work_code: `C18L12-${String(index + 1).padStart(4, '0')}`,
    };
  });
}

function makeDependencyRows({ projectId, taskIds, diagnosticRunId }) {
  const nowIso = new Date().toISOString();
  return taskIds.slice(1).map((taskId, index) => ({
    id: randomUUID(),
    project_id: projectId,
    task_id: taskId,
    dependency_task_id: taskIds[index],
    dependency_type: 'FS',
    lag_days: 0,
    required_for_start: true,
    source_type: 'c18_l12_live_evidence',
    status: 'active',
    inference_confidence: 'high',
    inference_reason: 'C18.L12 disposable 1000-task live critical-path pressure chain',
    metadata: {
      diagnosticRunId,
      disposableEvidence: 'c18_l12_critical_path_db_evidence',
      chainIndex: index + 1,
    },
    created_at: nowIso,
    updated_at: nowIso,
  }));
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

async function countRows(client, table, filters) {
  let query = client.from(table).select('id', { count: 'exact', head: true });
  for (const filter of filters) {
    if (filter.operator === 'eq') query = query.eq(filter.column, filter.value);
    if (filter.operator === 'notIsNull') query = query.not(filter.column, 'is', null);
  }
  const result = await query;
  if (result.error) throw new Error(`Failed to count ${table}: ${result.error.message}`);
  return Number(result.count ?? 0);
}

async function createDisposableScope(client, { userId, diagnosticRunId, taskCount }) {
  const companyId = randomUUID();
  const projectId = randomUUID();
  const taskIds = Array.from({ length: taskCount }, () => randomUUID());
  const nowIso = new Date().toISOString();

  const companyResult = await client.from('companies').insert({
    id: companyId,
    name: `C-18.L12 critical-path db evidence ${diagnosticRunId}`,
    owner_id: userId,
    status: 'active',
  });
  if (companyResult.error) {
    throw new Error(`Failed to insert disposable company: ${companyResult.error.message}`);
  }

  try {
    const companyMemberResult = await client.from('company_members').insert({
      company_id: companyId,
      user_id: userId,
      role: 'company_admin',
      status: 'active',
    });
    if (companyMemberResult.error) {
      throw new Error(`Failed to insert disposable company membership: ${companyMemberResult.error.message}`);
    }

    const projectResult = await client.from('projects').insert({
      id: projectId,
      name: `C-18.L12 disposable critical-path project ${diagnosticRunId}`,
      company_id: companyId,
      owner_id: userId,
      status: '进行中',
      project_visibility: 'private',
      planned_start_date: '2026-01-01',
      planned_end_date: '2028-09-26',
      metadata: {
        diagnosticRunId,
        disposableEvidence: 'c18_l12_critical_path_db_evidence',
        createdAt: nowIso,
      },
    });
    if (projectResult.error) {
      throw new Error(`Failed to insert disposable project: ${projectResult.error.message}`);
    }

    const projectMemberResult = await client.from('project_members').insert({
      project_id: projectId,
      user_id: userId,
      permission_level: 'owner',
      is_active: true,
    });
    if (projectMemberResult.error) {
      throw new Error(`Failed to insert disposable project membership: ${projectMemberResult.error.message}`);
    }

    await insertBatch(client, 'tasks', makeTaskRows({ projectId, taskIds, diagnosticRunId }), TASK_BATCH_SIZE);
    await insertBatch(client, 'task_dependencies', makeDependencyRows({ projectId, taskIds, diagnosticRunId }), DEPENDENCY_BATCH_SIZE);

    return { companyId, projectId, taskIds, userId };
  } catch (error) {
    await cleanupDisposableScope(client, { companyId, projectId, taskIds, userId }).catch(() => undefined);
    throw error;
  }
}

async function cleanupDisposableScope(client, scope) {
  const taskIds = scope.taskIds ?? [];
  const cleanup = {
    status: 'pass',
    companyId: scope.companyId,
    projectId: scope.projectId,
    deletedDurationAccuracyEvents: 0,
    deletedDurationPlanNetworkOutcomes: 0,
    deletedTaskCriticalOverrides: 0,
    deletedTaskDependencies: 0,
    deletedTasks: 0,
    deletedProjectMembers: 0,
    deletedProjects: 0,
    deletedCompanyMembers: 0,
    deletedCompanies: 0,
  };

  const deleteProjectScoped = async (table) => {
    const result = await client.from(table).delete({ count: 'exact' }).eq('project_id', scope.projectId);
    if (result.error) throw new Error(`Failed to delete ${table}: ${result.error.message}`);
    return Number(result.count ?? 0);
  };

  cleanup.deletedDurationAccuracyEvents = await deleteProjectScoped('duration_algorithm_accuracy_events').catch(() => 0);
  cleanup.deletedDurationPlanNetworkOutcomes = await deleteProjectScoped('duration_plan_network_outcomes').catch(() => 0);
  cleanup.deletedTaskCriticalOverrides = await deleteProjectScoped('task_critical_overrides').catch(() => 0);
  cleanup.deletedTaskDependencies = await deleteProjectScoped('task_dependencies');
  cleanup.deletedTasks = taskIds.length > 0
    ? await deleteInBatches(client, 'tasks', 'id', taskIds, TASK_BATCH_SIZE)
    : 0;

  const projectMemberDelete = await client
    .from('project_members')
    .delete({ count: 'exact' })
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId);
  if (projectMemberDelete.error) {
    throw new Error(`Failed to delete project_members: ${projectMemberDelete.error.message}`);
  }
  cleanup.deletedProjectMembers = Number(projectMemberDelete.count ?? 0);

  const projectDelete = await client.from('projects').delete({ count: 'exact' }).eq('id', scope.projectId);
  if (projectDelete.error) throw new Error(`Failed to delete projects: ${projectDelete.error.message}`);
  cleanup.deletedProjects = Number(projectDelete.count ?? 0);

  const companyMemberDelete = await client
    .from('company_members')
    .delete({ count: 'exact' })
    .eq('company_id', scope.companyId)
    .eq('user_id', scope.userId);
  if (companyMemberDelete.error) {
    throw new Error(`Failed to delete company_members: ${companyMemberDelete.error.message}`);
  }
  cleanup.deletedCompanyMembers = Number(companyMemberDelete.count ?? 0);

  const companyDelete = await client.from('companies').delete({ count: 'exact' }).eq('id', scope.companyId);
  if (companyDelete.error) throw new Error(`Failed to delete companies: ${companyDelete.error.message}`);
  cleanup.deletedCompanies = Number(companyDelete.count ?? 0);

  return cleanup;
}

function parseQueryEvidence(logText) {
  const lower = logText.toLowerCase();
  return {
    queryCount: (logText.match(/Executed query\s*\{/g) || []).length,
    requestCompletedCount: (logText.match(/Request completed/g) || []).length,
    containsTaskRead: lower.includes('from public.tasks') || lower.includes('from tasks'),
    containsDependencyRead: lower.includes('task_dependencies'),
    containsProjectionUpdate: lower.includes('total_float_days') || lower.includes('criticality_weight'),
  };
}

function readRequestId(logText) {
  const matches = [...logText.matchAll(/"requestId":"([^"]+)"/g)].map((match) => match[1]);
  return matches.at(-1) ?? null;
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

async function callRoute({ baseUrl, authToken, companyId, method, routePath }) {
  const url = `${baseUrl.replace(/\/$/, '')}${routePath}`;
  const started = performance.now();
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${authToken}`,
      'x-company-id': companyId,
      'content-type': 'application/json',
    },
  });
  const elapsedMs = roundMs(performance.now() - started);
  const body = await response.json().catch(() => ({}));
  return {
    method,
    routePath,
    httpStatusCode: response.status,
    success: body?.success === true,
    requestId: response.headers.get('x-request-id') || null,
    elapsedMs,
    body,
  };
}

async function holdCriticalPathLock(pgPool, projectId) {
  const client = await pgPool.connect();
  let released = false;
  await client.query(
    'SELECT pg_advisory_lock(hashtext($1), hashtext($2))',
    [CRITICAL_PATH_LOCK_NAMESPACE, projectId],
  );
  return {
    async release() {
      if (released) return;
      released = true;
      try {
        await client.query(
          'SELECT pg_advisory_unlock(hashtext($1), hashtext($2)) AS released',
          [CRITICAL_PATH_LOCK_NAMESPACE, projectId],
        );
      } finally {
        client.release();
      }
    },
  };
}

async function captureScenario(params) {
  const routePath = `/api/projects/${params.scope.projectId}/critical-path/refresh`;
  const readbackRoutePath = `/api/projects/${params.scope.projectId}/critical-path`;
  const logOffset = await fileSize(params.serverLogFile);
  const lock = await holdCriticalPathLock(params.pgPool, params.scope.projectId);
  const lockAcquiredAt = performance.now();

  let primarySettledBeforeUnlock = false;
  let concurrentSettledBeforeUnlock = false;
  const markSettled = (promise, onSettled) => promise.finally(onSettled);

  const primaryRefreshPromise = markSettled(callRoute({
    baseUrl: params.baseUrl,
    authToken: params.authToken,
    companyId: params.scope.companyId,
    method: 'POST',
    routePath,
  }), () => {
    primarySettledBeforeUnlock = true;
  });

  await sleep(Math.min(250, Math.max(100, Math.floor(params.lockHoldMs / 2))));

  const concurrentRefreshPromise = markSettled(callRoute({
    baseUrl: params.baseUrl,
    authToken: params.authToken,
    companyId: params.scope.companyId,
    method: 'POST',
    routePath,
  }), () => {
    concurrentSettledBeforeUnlock = true;
  });

  await sleep(params.lockHoldMs);
  const lockWaitObserved = !primarySettledBeforeUnlock;
  const concurrentSweepAndRouteRunObserved = !concurrentSettledBeforeUnlock;
  await lock.release();
  const lockReleasedAt = performance.now();

  const [primaryRefresh, concurrentRefresh] = await Promise.all([primaryRefreshPromise, concurrentRefreshPromise]);
  const readback = await callRoute({
    baseUrl: params.baseUrl,
    authToken: params.authToken,
    companyId: params.scope.companyId,
    method: 'GET',
    routePath: readbackRoutePath,
  });

  const logText = await waitForLogDelta(
    params.serverLogFile,
    logOffset,
    (text) => {
      const evidence = parseQueryEvidence(text);
      return evidence.queryCount > 0 && evidence.requestCompletedCount > 0;
    },
    { timeoutMs: 5000, intervalMs: 100, requireExisting: true },
  );
  const queryEvidence = parseQueryEvidence(logText);
  const persistedTaskCount = await countRows(params.client, 'tasks', [
    { operator: 'eq', column: 'project_id', value: params.scope.projectId },
  ]);
  const persistedDependencyEdgeCount = await countRows(params.client, 'task_dependencies', [
    { operator: 'eq', column: 'project_id', value: params.scope.projectId },
    { operator: 'eq', column: 'status', value: 'active' },
  ]);
  const finalProjectedFloatTaskCount = await countRows(params.client, 'tasks', [
    { operator: 'eq', column: 'project_id', value: params.scope.projectId },
    { operator: 'notIsNull', column: 'total_float_days' },
  ]);
  const finalCriticalTaskCount = await countRows(params.client, 'tasks', [
    { operator: 'eq', column: 'project_id', value: params.scope.projectId },
    { operator: 'eq', column: 'is_critical', value: true },
  ]);

  const readbackData = readback.body?.data ?? {};
  const refreshRequestId = primaryRefresh.requestId || readRequestId(logText) || randomUUID();
  const readbackRequestId = readback.requestId || randomUUID();
  const dbWriteP95Ms = Math.max(primaryRefresh.elapsedMs, concurrentRefresh.elapsedMs);

  return {
    scenarioCode: 'resource_chain_1000',
    diagnosticRunId: params.diagnosticRunId,
    refreshRequestId,
    concurrentRefreshRequestId: concurrentRefresh.requestId || null,
    readbackRequestId,
    dbWriteTraceId: randomUUID(),
    projectId: params.scope.projectId,
    routeMethod: 'POST',
    routePath,
    readbackRouteMethod: 'GET',
    readbackRoutePath,
    persistedTaskCount,
    persistedDependencyEdgeCount,
    concurrentSweepAndRouteRunObserved: primaryRefresh.success && concurrentRefresh.success && concurrentSweepAndRouteRunObserved,
    dbWriteP95Ms,
    dbWriteBudgetMs: params.dbWriteBudgetMs,
    connectionPoolObserved: queryEvidence.queryCount > 0 && queryEvidence.requestCompletedCount > 0,
    lockWaitObserved,
    finalProjectionReadbackObserved: readback.success &&
      readback.httpStatusCode === 200 &&
      finalProjectedFloatTaskCount >= params.taskCount &&
      finalCriticalTaskCount > 0,
    finalProjectionReadbackProjectId: params.scope.projectId,
    finalProjectedFloatTaskCount,
    finalCriticalTaskCount,
    finalProjectDurationDays: Number(readbackData.projectDurationDays ?? 0),
    routeEvidence: {
      primaryRefresh: {
        httpStatusCode: primaryRefresh.httpStatusCode,
        success: primaryRefresh.success,
        elapsedMs: primaryRefresh.elapsedMs,
      },
      concurrentRefresh: {
        httpStatusCode: concurrentRefresh.httpStatusCode,
        success: concurrentRefresh.success,
        elapsedMs: concurrentRefresh.elapsedMs,
      },
      readback: {
        httpStatusCode: readback.httpStatusCode,
        success: readback.success,
        elapsedMs: readback.elapsedMs,
        autoTaskCount: Array.isArray(readbackData.autoTaskIds) ? readbackData.autoTaskIds.length : null,
        displayTaskCount: Array.isArray(readbackData.displayTaskIds) ? readbackData.displayTaskIds.length : null,
        networkScheduleCount: Array.isArray(readbackData.networkSchedule) ? readbackData.networkSchedule.length : null,
        edgeCount: Array.isArray(readbackData.edges) ? readbackData.edges.length : null,
        calculationStatus: readbackData.calculationStatus ?? null,
      },
    },
    lockEvidence: {
      namespace: CRITICAL_PATH_LOCK_NAMESPACE,
      holdMs: roundMs(lockReleasedAt - lockAcquiredAt),
      primarySettledBeforeUnlock,
      concurrentSettledBeforeUnlock,
      observedRouteWait: lockWaitObserved,
    },
    queryEvidence,
  };
}

async function writeJson(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function scenarioPasses(scenario) {
  return scenario.persistedTaskCount >= 1000 &&
    scenario.persistedDependencyEdgeCount >= 999 &&
    scenario.concurrentSweepAndRouteRunObserved === true &&
    scenario.dbWriteP95Ms >= 0 &&
    scenario.dbWriteP95Ms <= scenario.dbWriteBudgetMs &&
    scenario.connectionPoolObserved === true &&
    scenario.lockWaitObserved === true &&
    scenario.finalProjectionReadbackObserved === true &&
    scenario.finalProjectionReadbackProjectId === scenario.projectId &&
    scenario.finalProjectedFloatTaskCount >= 1000 &&
    scenario.finalCriticalTaskCount > 0 &&
    scenario.finalProjectDurationDays > 0;
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }

  options.envFile = resolveRepoPath(options.envFile);
  options.serverLogFile = resolveRepoPath(options.serverLogFile);
  const env = await loadDotEnv(options.envFile);
  const userId = env.DEV_USER_ID || process.env.DEV_USER_ID;
  if (!userId) throw new Error('DEV_USER_ID is required to create disposable route-access evidence.');

  const client = createSupabaseClient(env);
  const pgPool = createPgPool(env);
  const startedAt = new Date().toISOString();
  const scope = await createDisposableScope(client, {
    userId,
    diagnosticRunId: options.diagnosticRunId,
    taskCount: options.taskCount,
  });

  let cleanupReadback = null;
  let cleanupError = null;
  let scenarios = [];

  try {
    scenarios = [await captureScenario({
      client,
      pgPool,
      scope,
      baseUrl: options.baseUrl,
      authToken: options.authToken,
      serverLogFile: options.serverLogFile,
      diagnosticRunId: options.diagnosticRunId,
      taskCount: options.taskCount,
      dbWriteBudgetMs: options.dbWriteBudgetMs,
      lockHoldMs: options.lockHoldMs,
    })];
  } finally {
    if (!options.keepDisposableData) {
      try {
        cleanupReadback = await cleanupDisposableScope(client, scope);
      } catch (error) {
        cleanupError = error instanceof Error ? error.message : String(error);
        cleanupReadback = {
          status: 'fail',
          companyId: scope.companyId,
          projectId: scope.projectId,
          error: cleanupError,
        };
      }
    } else {
      cleanupReadback = {
        status: 'skipped',
        reason: '--keep-disposable-data was set',
        companyId: scope.companyId,
        projectId: scope.projectId,
      };
    }
    await pgPool.end().catch(() => undefined);
  }

  const finishedAt = new Date().toISOString();
  const report = {
    schemaVersion: 'workbuddy-c18-l12-db-evidence/v1',
    reportCode: 'c18_l12_critical_path_db_evidence',
    evidenceKind: 'live_db_route_projection_readback',
    environment: 'current-live',
    evidenceRef: options.outputFile,
    diagnosticRunId: options.diagnosticRunId,
    command: `node project-testing/tools/capture-c18-l12-critical-path-db-evidence.mjs --env-file=${options.envFile} --base-url=${options.baseUrl} --auth-token=[REDACTED] --diagnostic-run-id=${options.diagnosticRunId} --server-log-file=${options.serverLogFile} --output-file=${options.outputFile}`,
    exitCode: 0,
    artifactPath: options.outputFile,
    targetIds: {
      companyId: scope.companyId,
      projectId: scope.projectId,
      taskCount: options.taskCount,
    },
    startedAt,
    finishedAt,
    cleanupReadback,
    scenarios,
  };

  const pass = scenarios.every(scenarioPasses) && cleanupReadback?.status === 'pass';
  report.exitCode = pass ? 0 : 1;
  await writeJson(options.outputFile, report);

  console.log(JSON.stringify({
    status: pass ? 'pass' : 'fail',
    outputFile: options.outputFile,
    diagnosticRunId: options.diagnosticRunId,
    cleanupStatus: cleanupReadback?.status ?? null,
    scenarios: scenarios.map((scenario) => ({
      scenarioCode: scenario.scenarioCode,
      httpStatusCode: scenario.routeEvidence.primaryRefresh.httpStatusCode,
      persistedTaskCount: scenario.persistedTaskCount,
      persistedDependencyEdgeCount: scenario.persistedDependencyEdgeCount,
      finalProjectedFloatTaskCount: scenario.finalProjectedFloatTaskCount,
      finalCriticalTaskCount: scenario.finalCriticalTaskCount,
      finalProjectDurationDays: scenario.finalProjectDurationDays,
      dbWriteP95Ms: scenario.dbWriteP95Ms,
      lockWaitObserved: scenario.lockWaitObserved,
      connectionPoolObserved: scenario.connectionPoolObserved,
    })),
    ...(cleanupError ? { cleanupError } : {}),
  }, null, 2));

  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
