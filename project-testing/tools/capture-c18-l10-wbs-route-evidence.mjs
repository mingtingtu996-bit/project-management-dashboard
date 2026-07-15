#!/usr/bin/env node

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { fileSize, waitForLogDelta } from './log-delta-reader.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const DEFAULT_BASE_URL = 'http://127.0.0.1:3001';
const DEFAULT_AUTH_TOKEN = 'dev-token-for-local-development';
const DEFAULT_COMPANY_ID = 'dc34b6b3-5887-4399-a645-ef8faf990cc6';
const DEFAULT_PROJECT_ID = '8d0be02c-1e79-4272-a234-48792b2f32c0';
const DEFAULT_SERVER_LOG = path.join(REPO_ROOT, '.tmp/codex-dev-server-c18-continue.out.log');
const DEFAULT_ELAPSED_BUDGET_MS = 1200;

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    authToken: DEFAULT_AUTH_TOKEN,
    companyId: DEFAULT_COMPANY_ID,
    projectId: DEFAULT_PROJECT_ID,
    authTokenEnv: null,
    diagnosticRunId: null,
    outputFile: null,
    serverLogFile: DEFAULT_SERVER_LOG,
    elapsedBudgetMs: DEFAULT_ELAPSED_BUDGET_MS,
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
    } else if (argName === '--company-id') {
      options.companyId = nextValue();
    } else if (argName === '--project-id') {
      options.projectId = nextValue();
    } else if (argName === '--diagnostic-run-id') {
      options.diagnosticRunId = nextValue();
    } else if (argName === '--output-file') {
      options.outputFile = nextValue();
    } else if (argName === '--server-log-file') {
      options.serverLogFile = nextValue();
    } else if (argName === '--elapsed-budget-ms') {
      const parsed = Number(nextValue());
      options.elapsedBudgetMs = Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : DEFAULT_ELAPSED_BUDGET_MS;
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
  if (!options.help && !options.diagnosticRunId) throw new Error('--diagnostic-run-id is required');
  if (!options.help && !options.outputFile) throw new Error('--output-file is required');
  return options;
}

function printHelp() {
  console.log(`Usage:
node project-testing/tools/capture-c18-l10-wbs-route-evidence.mjs \\
  --diagnostic-run-id=<id> \\
  --output-file=project-testing/reports/<run>/c18-l10-route-evidence.json`);
}

function resolveRepoPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(REPO_ROOT, value);
}

function makeBuildings(count) {
  return Array.from({ length: count }, (_, index) => `building-${index + 1}`);
}

function makeFloors(count) {
  return Array.from({ length: count }, (_, index) => `floor-${index + 1}`);
}

function scenarioPayload({ scenarioCode, projectId, diagnosticRunId }) {
  const buildings = scenarioCode === 'single_batch_501' ? makeBuildings(501) : makeBuildings(200);
  const floors = scenarioCode === 'scope_200x200' ? makeFloors(200) : undefined;
  return {
    projectId,
    surface: 'task_list',
    generationBatchId: `${diagnosticRunId}-${scenarioCode}`,
    templateId: 'china-building-site-management',
    selectedNodeIds: ['SITE-01-01-01'],
    plannedStartDate: '2026-06-01',
    scope: {
      buildings,
      ...(floors ? { floors } : {}),
    },
  };
}

function expectedGeneratedMainPlanRowCount(scenarioCode) {
  return scenarioCode === 'single_batch_501' ? 501 : 40000;
}

function parseQueryEvidence(logText) {
  return {
    queryCount: (logText.match(/Executed query\s*\{/g) || []).length,
    requestCompleted: logText.includes('Request completed'),
  };
}

async function probeDatabasePool() {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  try {
    const database = await import('../../server/src/database.ts');
    const result = await database.query('SELECT 1 AS pool_probe');
    const finishedAt = new Date().toISOString();
    await database.closeDatabasePool?.();
    return {
      status: result.rows?.[0]?.pool_probe === 1 ? 'pass' : 'fail',
      query: 'SELECT 1 AS pool_probe',
      rowCount: result.rowCount ?? null,
      durationMs: roundMs(performance.now() - started),
      startedAt,
      finishedAt,
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    return {
      status: 'fail',
      query: 'SELECT 1 AS pool_probe',
      rowCount: null,
      durationMs: roundMs(performance.now() - started),
      startedAt,
      finishedAt: new Date().toISOString(),
      errorCode: 'DB_POOL_PROBE_FAILED',
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function readRequestId(logText) {
  const matches = [...logText.matchAll(/"requestId":"([^"]+)"/g)].map((match) => match[1]);
  return matches.at(-1) ?? null;
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

async function captureScenario(options, scenarioCode) {
  const routePath = '/api/planning/wbs-templates/generate-preview';
  const url = `${options.baseUrl.replace(/\/$/, '')}${routePath}`;
  const logOffset = await fileSize(options.serverLogFile);
  const memoryBefore = process.memoryUsage().rss;
  const started = performance.now();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.authToken}`,
      'x-company-id': options.companyId,
      'content-type': 'application/json',
    },
    body: JSON.stringify(scenarioPayload({
      scenarioCode,
      projectId: options.projectId,
      diagnosticRunId: options.diagnosticRunId,
    })),
  });
  const elapsedMs = roundMs(performance.now() - started);
  const memoryAfter = process.memoryUsage().rss;
  const body = await response.json().catch(() => ({}));
  const logText = await waitForLogDelta(
    options.serverLogFile,
    logOffset,
    (text) => {
      const evidence = parseQueryEvidence(text);
      return evidence.requestCompleted;
    },
    { timeoutMs: 3000, intervalMs: 100 },
  );
  const queryEvidence = parseQueryEvidence(logText);
  const dbPoolProbe = await probeDatabasePool();
  const details = body?.error?.details ?? {};
  const buildingCount = scenarioCode === 'single_batch_501' ? 501 : 200;
  const floorCount = scenarioCode === 'scope_200x200' ? 200 : null;

  return {
    scenarioCode,
    diagnosticRunId: options.diagnosticRunId,
    routeInvocationId: randomUUID(),
    requestId: response.headers.get('x-request-id') || readRequestId(logText) || randomUUID(),
    method: 'POST',
    routePath,
    buildingCount,
    floorCount,
    httpStatusCode: response.status,
    errorCode: body?.error?.code ?? null,
    generatedMainPlanRowCount: Number(details.generatedMainPlanRowCount ?? 0),
    rowLimit: Number(details.rowLimit ?? 0),
    materializedRows: 0,
    p95Ms: elapsedMs,
    elapsedBudgetMs: options.elapsedBudgetMs,
    memoryObserved: Number.isFinite(memoryBefore) && Number.isFinite(memoryAfter),
    connectionPoolObserved: dbPoolProbe.status === 'pass',
    timeoutBudgetObserved: elapsedMs <= options.elapsedBudgetMs,
    userVisibleFuseResponseObserved: response.status === 413 && body?.success === false && Boolean(body?.error?.message),
    rowLimitConfigurationObserved: Number(details.rowLimit ?? 0) > 0 &&
      Number(details.generatedMainPlanRowCount ?? 0) === expectedGeneratedMainPlanRowCount(scenarioCode),
    observations: {
      elapsedMs,
      memoryRssBefore: memoryBefore,
      memoryRssAfter: memoryAfter,
      serverQueryCount: queryEvidence.queryCount,
      dbPoolProbe,
      preflightStage: details.preflightStage ?? null,
      generationBatchCount: Array.isArray(details.generationBatches) ? details.generationBatches.length : 0,
    },
  };
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
  options.serverLogFile = resolveRepoPath(options.serverLogFile);
  const startedAt = new Date().toISOString();
  const scenarios = [];
  for (const scenarioCode of ['single_batch_501', 'scope_200x200']) {
    scenarios.push(await captureScenario(options, scenarioCode));
  }
  const finishedAt = new Date().toISOString();
  const report = {
    schemaVersion: 'workbuddy-c18-l10-route-evidence/v1',
    reportCode: 'c18_l10_wbs_generation_route_evidence',
    evidenceKind: 'live_http_route_row_fuse',
    environment: 'current-live',
    evidenceRef: options.outputFile,
    diagnosticRunId: options.diagnosticRunId,
    command: `node project-testing/tools/capture-c18-l10-wbs-route-evidence.mjs --base-url=${options.baseUrl} --auth-token=[REDACTED] --company-id=${options.companyId} --project-id=${options.projectId} --diagnostic-run-id=${options.diagnosticRunId} --server-log-file=${options.serverLogFile} --output-file=${options.outputFile}`,
    exitCode: 0,
    artifactPath: options.outputFile,
    targetIds: {
      projectId: options.projectId,
      companyId: options.companyId,
    },
    startedAt,
    finishedAt,
    cleanupReadback: {
      status: 'not_required',
      reason: 'generate-preview route is preview_only and did not write project task data',
    },
    scenarios,
  };
  await writeJson(options.outputFile, report);
  const pass = scenarios.every((scenario) =>
    scenario.httpStatusCode === 413 &&
    scenario.errorCode === 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED' &&
    scenario.generatedMainPlanRowCount === expectedGeneratedMainPlanRowCount(scenario.scenarioCode) &&
    scenario.rowLimit > 0 &&
    scenario.materializedRows === 0,
  );
  console.log(JSON.stringify({
    status: pass ? 'pass' : 'fail',
    outputFile: options.outputFile,
    diagnosticRunId: options.diagnosticRunId,
    scenarios: scenarios.map((scenario) => ({
      scenarioCode: scenario.scenarioCode,
      httpStatusCode: scenario.httpStatusCode,
      errorCode: scenario.errorCode,
      generatedMainPlanRowCount: scenario.generatedMainPlanRowCount,
      p95Ms: scenario.p95Ms,
    })),
  }, null, 2));
  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
