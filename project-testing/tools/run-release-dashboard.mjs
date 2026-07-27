#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runToolReadinessCheck } from './check-testing-tools.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_MATRIX_PATH = path.join(REPO_ROOT, 'project-testing/matrix/release-test-matrix.json');
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing/reports');
const DEFAULT_TEST_ENV_FILE = path.join(REPO_ROOT, 'deploy/env/staging.env');
const DEFAULT_DEFAULT_MASTER_PLAN_GAP_SUMMARY = path.join(
  REPO_ROOT,
  'project-testing/reports/default-master-plan-production-readiness/real-evidence-gap-summary.json',
);

function defaultTestEnvFile() {
  return existsSync(DEFAULT_TEST_ENV_FILE) ? DEFAULT_TEST_ENV_FILE : null;
}

const PROFILE_DEFINITIONS = {
  smoke: {
    description: 'Fast local readiness slice for static, bundle, and closeout evidence.',
    includeGroupIds: [
      'static-build-typecheck',
      'bundle-and-performance-evidence',
      'v14231-closeout-local',
    ],
  },
  'release-local': {
    description: 'All ready local_static, local_browser, local deterministic, and tooling_readiness gates.',
    predicate: (group) => group.status === 'ready' && [
      'local_static',
      'local_browser',
      'local_browser_msw',
      'local_api_contract',
      'container_db',
      'tooling_readiness',
    ].includes(group.tier),
  },
  'local-deterministic': {
    description: 'Non-live deterministic gates and readiness checks that avoid real Supabase dependencies.',
    includeGroupIds: [
      'static-build-typecheck',
      'unit-and-contract',
      'backend-governance-guards',
      'local-deterministic-readiness',
      'msw-deterministic-page-data',
    ],
  },
  uiux: {
    description: 'UIUX visual, overlap, accessibility, performance, and release smoke gates.',
    includeGroupIds: ['uiux-predeploy'],
  },
  'tool-readiness': {
    description: 'Read-only Phase 4 testing tool inventory and boundary check.',
    includeGroupIds: ['testing-tool-readiness'],
    toolReadiness: true,
  },
  'solo-live': {
    description: 'Personal real-environment readiness lane; can close soloLiveReady but not productionReady.',
    predicate: (group) => group.tier === 'solo_live',
    requires: ['solo-live'],
  },
  live: {
    description: 'Live-only evidence and workspace-isolation gates after explicit handoff.',
    predicate: (group) => group.tier === 'live_only',
    requires: ['live'],
  },
  db: {
    description: 'Database-dependent migration and recovery gates after DB readiness confirmation.',
    predicate: (group) => group.tier === 'db_dependent',
    requires: ['db'],
  },
};

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    profile: 'smoke',
    dryRun: false,
    includeLive: false,
    confirmLiveHandoff: false,
    includeSoloLive: false,
    confirmSoloLiveOwner: false,
    includeDb: false,
    confirmDbReady: false,
    matrixPath: DEFAULT_MATRIX_PATH,
    reportRoot: DEFAULT_REPORT_ROOT,
    envFile: defaultTestEnvFile(),
    gateIds: [],
    handoffFile: null,
    defaultMasterPlanGapSummaryPath: DEFAULT_DEFAULT_MASTER_PLAN_GAP_SUMMARY,
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

    if (arg === '--profile') {
      options.profile = nextValue();
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--include-live') {
      options.includeLive = true;
    } else if (arg === '--confirm-live-handoff') {
      options.confirmLiveHandoff = true;
    } else if (arg === '--include-solo-live') {
      options.includeSoloLive = true;
    } else if (arg === '--confirm-solo-live-owner') {
      options.confirmSoloLiveOwner = true;
    } else if (arg === '--include-db') {
      options.includeDb = true;
    } else if (arg === '--confirm-db-ready') {
      options.confirmDbReady = true;
    } else if (arg === '--matrix') {
      options.matrixPath = path.resolve(nextValue());
    } else if (arg === '--report-root') {
      options.reportRoot = path.resolve(nextValue());
    } else if (arg === '--env-file') {
      options.envFile = path.resolve(nextValue());
    } else if (arg === '--gate') {
      options.gateIds.push(nextValue());
    } else if (arg === '--handoff-file') {
      options.handoffFile = path.resolve(nextValue());
    } else if (arg === '--default-master-plan-gap-summary') {
      options.defaultMasterPlanGapSummaryPath = path.resolve(nextValue());
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!PROFILE_DEFINITIONS[options.profile]) {
    throw new Error(`Unknown profile: ${options.profile}`);
  }

  return options;
}

export async function loadMatrix(matrixPath = DEFAULT_MATRIX_PATH) {
  const raw = await readFile(matrixPath, 'utf8');
  const matrix = JSON.parse(raw);

  if (!Array.isArray(matrix.gateGroups)) {
    throw new Error(`Invalid matrix: gateGroups must be an array in ${matrixPath}`);
  }

  return matrix;
}

export function planReleaseRun(matrix, options) {
  const profile = PROFILE_DEFINITIONS[options.profile];
  assertUnlocks(options, profile);

  const gateFilter = normalizeGateFilter(options.selectedGateIds ?? options.gateIds ?? []);
  const selectedGroups = matrix.gateGroups.filter((group) => isSelectedGroup(group, profile) && isAllowedByGateFilter(group, gateFilter));
  const deferredGroups = matrix.gateGroups.filter(
    (group) => ['live_only', 'solo_live'].includes(group.tier) && !selectedGroups.some((selected) => selected.id === group.id),
  );
  const blockedGroups = matrix.gateGroups.filter(
    (group) => group.tier === 'db_dependent' && !selectedGroups.some((selected) => selected.id === group.id),
  );
  const inventoryGroups = matrix.gateGroups.filter((group) => group.status === 'inventory_only');

  return {
    profile: options.profile,
    profileDescription: profile.description,
    selectedGroups,
    deferredGroups,
    blockedGroups,
    inventoryGroups,
    dryRun: options.dryRun,
    gateFilter: gateFilter ? [...gateFilter] : [],
  };
}

export async function runDashboard({
  argv = process.argv.slice(2),
  cwd = REPO_ROOT,
  now = new Date(),
} = {}) {
  const options = parseArgs(argv);

  if (options.help) {
    return {
      exitCode: 0,
      help: renderHelp(),
      executedCommands: [],
    };
  }

  const matrix = await loadMatrix(options.matrixPath);
  const selectedGateIds = await resolveSelectedGateIds(options);
  const plan = planReleaseRun(matrix, {
    ...options,
    selectedGateIds,
  });
  const reportDir = await createUniqueReportDir(options.reportRoot, now);
  const environment = await loadEnvironment(options.envFile);
  const executedCommands = [];
  const commandResults = [];
  let toolReadiness = null;
  let defaultMasterPlanActionHandoff = null;

  if (!options.dryRun) {
    for (const group of plan.selectedGroups) {
      for (const command of group.commands ?? []) {
        const result = await runCommand(resolveCommandTemplate(command, { reportDir, env: environment.env }), {
          cwd,
          env: environment.env,
          redactionValues: environment.redactionValues,
        });
        commandResults.push({ groupId: group.id, ...result });
        executedCommands.push(command);

        if (result.exitCode !== 0) {
          break;
        }
      }
    }
  } else if (PROFILE_DEFINITIONS[options.profile].toolReadiness) {
    toolReadiness = await runToolReadinessCheck({
      outputPath: path.join(reportDir, 'tool-readiness-summary.json'),
      cwd,
      now,
    });
  }

  defaultMasterPlanActionHandoff = await loadDefaultMasterPlanActionHandoff({
    plan,
    gapSummaryPath: options.defaultMasterPlanGapSummaryPath,
  });

  const summary = redactValue(buildSummary({
    matrix,
    plan,
    options,
    reportDir,
    commandResults,
    toolReadiness,
    defaultMasterPlanActionHandoff,
    environment: environment.summary,
    startedAt: now,
    finishedAt: new Date(),
  }), environment.redactionValues);

  await writeReports(reportDir, summary);

  const failedCommands = commandResults.filter((result) => result.exitCode !== 0);
  return {
    exitCode: failedCommands.length > 0 ? 1 : 0,
    reportDir,
    executedCommands,
    summary,
  };
}

function assertUnlocks(options, profile) {
  if (!profile.requires?.length) {
    return;
  }

  if (profile.requires.includes('live') && !(options.includeLive && options.confirmLiveHandoff)) {
    throw new Error('Profile live requires --include-live and --confirm-live-handoff');
  }

  if (profile.requires.includes('solo-live') && !(options.includeSoloLive && options.confirmSoloLiveOwner)) {
    throw new Error('Profile solo-live requires --include-solo-live and --confirm-solo-live-owner');
  }

  if (profile.requires.includes('db') && !(options.includeDb && options.confirmDbReady)) {
    throw new Error('Profile db requires --include-db and --confirm-db-ready');
  }
}

function isSelectedGroup(group, profile) {
  if (profile.includeGroupIds) {
    return profile.includeGroupIds.includes(group.id);
  }

  if (profile.predicate) {
    return profile.predicate(group);
  }

  return false;
}

function normalizeGateFilter(gateIds = []) {
  const normalized = [];
  for (const gateId of gateIds) {
    const value = String(gateId ?? '').trim();
    if (!value) continue;
    if (!normalized.includes(value)) normalized.push(value);
  }
  return normalized.length > 0 ? new Set(normalized) : null;
}

function isAllowedByGateFilter(group, gateFilter) {
  return !gateFilter || gateFilter.has(group.id);
}

async function resolveSelectedGateIds(options) {
  if (options.gateIds.length > 0 && options.handoffFile) {
    throw new Error('Use either --gate or --handoff-file, not both');
  }
  if (options.gateIds.length > 0) {
    return options.gateIds;
  }
  if (!options.handoffFile) {
    return [];
  }

  const raw = await readFile(options.handoffFile, 'utf8');
  const handoff = JSON.parse(raw);
  const fromGateSelection = handoff.gateSelection?.selectedGateIds;
  if (Array.isArray(fromGateSelection)) {
    return fromGateSelection.map((gateId) => String(gateId ?? '').trim()).filter(Boolean);
  }
  if (Array.isArray(handoff.selectedGateIds)) {
    return handoff.selectedGateIds.map((gateId) => String(gateId ?? '').trim()).filter(Boolean);
  }
  if (Array.isArray(handoff.gates)) {
    return handoff.gates.map((gate) => String(gate.id ?? '').trim()).filter(Boolean);
  }

  throw new Error('--handoff-file must contain gateSelection.selectedGateIds, selectedGateIds, or readiness gates[]');
}

async function loadEnvironment(envFile) {
  if (!envFile) {
    return {
      env: process.env,
      redactionValues: [],
      summary: null,
    };
  }

  const raw = await readFile(envFile, 'utf8');
  const parsed = parseEnvFile(raw);
  return {
    env: {
      ...process.env,
      ...parsed.values,
    },
    redactionValues: parsed.redactionValues,
    summary: {
      envFile,
      loadedKeys: Object.keys(parsed.values).sort(),
      secretValuesRedacted: true,
    },
  };
}

function parseEnvFile(raw) {
  const values = {};
  const redactionValues = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
    if (value.length >= 8) {
      redactionValues.push(value);
    }
  }

  return { values, redactionValues };
}

function runCommand(command, { cwd, env, redactionValues = [] }) {
  const startedAt = new Date();

  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (exitCode, signal) => {
      const finishedAt = new Date();
      resolve({
        command,
        exitCode,
        signal,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        stdoutTail: tailText(redactText(stdout, redactionValues)),
        stderrTail: tailText(redactText(stderr, redactionValues)),
      });
    });
    child.on('error', (error) => {
      const finishedAt = new Date();
      resolve({
        command,
        exitCode: 1,
        signal: null,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        stdoutTail: tailText(redactText(stdout, redactionValues)),
        stderrTail: tailText(redactText(`${stderr}\n${error.stack ?? error.message}`, redactionValues)),
      });
    });
  });
}

function resolveCommandTemplate(command, { reportDir, env = process.env }) {
  const reportDirFromServer = path.relative(path.join(REPO_ROOT, 'server'), reportDir).replace(/\\/g, '/');
  const projectId = env.TEST_PROJECT_ID || env.TEST_PROJECT_UUID || '';
  const companyId = env.TEST_COMPANY_ID || env.TEST_COMPANY_UUID || '';
  const serverUrl = env.API_BASE_URL || env.SERVER_URL || '';
  const authToken = env.TEST_AUTH_TOKEN || env.AUTH_TOKEN || '';
  return command
    .replaceAll('<artifact-root>', quoteForShell(reportDir))
    .replaceAll('<artifact-root-posix>', reportDir.replace(/\\/g, '/'))
    .replaceAll('<artifact-root-from-server>', reportDirFromServer)
    .replaceAll('<project-id>', quoteForShell(projectId))
    .replaceAll('<company-id>', quoteForShell(companyId))
    .replaceAll('<server-url>', quoteForShell(serverUrl))
    .replaceAll('<jwt>', quoteForShell(authToken));
}

function quoteForShell(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:\\-]+$/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '\\"')}"`;
}

function redactText(text, redactionValues) {
  let result = String(text ?? '');
  for (const value of redactionValues) {
    if (!value) continue;
    result = result.split(value).join('[REDACTED]');
  }
  return result;
}

function redactValue(value, redactionValues) {
  if (!redactionValues.length) return value;
  if (typeof value === 'string') return redactText(value, redactionValues);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, redactionValues));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactValue(item, redactionValues)]),
    );
  }
  return value;
}

function buildSummary({
  matrix,
  plan,
  options,
  reportDir,
  commandResults,
  toolReadiness,
  defaultMasterPlanActionHandoff,
  environment,
  startedAt,
  finishedAt,
}) {
  return {
    schemaVersion: 'workbuddy-release-dashboard-summary/v1',
    matrixSchemaVersion: matrix.schemaVersion,
    matrixGeneratedAt: matrix.generatedAt,
    profile: plan.profile,
    profileDescription: plan.profileDescription,
    dryRun: options.dryRun,
    reportDir,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    activeLiveThread: Boolean(matrix.concurrencyPolicy?.activeLiveThread),
    selectedGroups: plan.selectedGroups.map(summarizeGroup),
    deferredGroups: plan.deferredGroups.map(summarizeGroup),
    blockedGroups: plan.blockedGroups.map(summarizeGroup),
    inventoryGroups: plan.inventoryGroups.map(summarizeGroup),
    gateFilter: plan.gateFilter,
    handoffFile: options.handoffFile ?? null,
    commandResults,
    environment,
    toolReadiness: toolReadiness ?? null,
    defaultMasterPlanActionHandoff: defaultMasterPlanActionHandoff ?? null,
    statusCounts: {
      selected: plan.selectedGroups.length,
      deferred: plan.deferredGroups.length,
      blocked: plan.blockedGroups.length,
      inventory: plan.inventoryGroups.length,
      commandsPlanned: plan.selectedGroups.reduce((count, group) => count + (group.commands?.length ?? 0), 0),
      commandsExecuted: commandResults.length,
      commandsFailed: commandResults.filter((result) => result.exitCode !== 0).length,
    },
    mutationBoundary: [
      'No live-only gate is selected without explicit live unlock flags.',
      'No solo-live gate is selected without explicit personal owner unlock flags.',
      'No DB-dependent gate is selected without explicit DB unlock flags.',
      'Dry-run mode never executes matrix commands.',
      'Reports are written under project-testing/reports unless --report-root is supplied.',
    ],
  };
}

async function loadDefaultMasterPlanActionHandoff({ plan, gapSummaryPath }) {
  const selected = plan.selectedGroups.some((group) => group.id === 'default-master-plan-evidence-source-kit');
  if (!selected) return null;

  try {
    const raw = await readFile(gapSummaryPath, 'utf8');
    return summarizeDefaultMasterPlanActionHandoff(JSON.parse(raw), gapSummaryPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        status: 'missing',
        productionReady: false,
        gateSummary: summarizeDefaultMasterPlanGateSummary(null),
        completionRate: 0,
    blockedGateActionCoverageSummary: summarizeDefaultMasterPlanBlockedGateActionCoverageSummary(null),
    blockedGateActionCoverage: [],
    operatorUnblockRequirementSummary: summarizeDefaultMasterPlanOperatorUnblockRequirementSummary(null, []),
    operatorUnblockRequirementMatrix: [],
    operatorCommandPlanSummary: summarizeDefaultMasterPlanOperatorCommandPlanSummary(null, []),
    operatorCommandPlan: [],
    operatorCommandExecutionPlanSummary: summarizeDefaultMasterPlanOperatorCommandExecutionPlanSummary(null, []),
    operatorCommandExecutionPlan: [],
    operatorCommandExecutionQueueSummary: summarizeDefaultMasterPlanOperatorCommandExecutionQueueSummary(null, []),
    operatorCommandExecutionQueues: emptyDefaultMasterPlanOperatorCommandExecutionQueues(),
    compactActionItems: [],
    sourcePath: gapSummaryPath,
        sourceInputSummary: summarizeDefaultMasterPlanSourceInputSummary(null),
        actionGroupCount: 0,
        blockedActionGroupCount: 0,
        deferredActionGroupCount: 0,
        actionGroups: [],
        blockers: ['default_master_plan_real_evidence_gap_summary_missing'],
        mutationBoundary: 'read-only dashboard summary; missing gap summary does not run evidence builders or mutate production state',
      };
    }
    throw error;
  }
}

function summarizeDefaultMasterPlanActionHandoff(gapSummary, sourcePath) {
  const actionGroups = Array.isArray(gapSummary.prioritizedNextActionGroups)
    ? gapSummary.prioritizedNextActionGroups.map((group) => summarizeDefaultMasterPlanActionGroup(group))
    : [];
  const gateSummary = summarizeDefaultMasterPlanGateSummary(gapSummary.gateSummary);
  const blockedGateActionCoverage = summarizeDefaultMasterPlanBlockedGateActionCoverage(gapSummary.blockedGateActionCoverage);
  const operatorUnblockRequirementMatrix = summarizeDefaultMasterPlanOperatorUnblockRequirementMatrix(
    gapSummary.operatorUnblockRequirementMatrix,
    actionGroups,
  );
  const operatorCommandPlan = summarizeDefaultMasterPlanOperatorCommandPlan(
    gapSummary.operatorCommandPlan,
    actionGroups,
  );
  const operatorCommandExecutionPlan = summarizeDefaultMasterPlanOperatorCommandExecutionPlan(
    gapSummary.operatorCommandExecutionPlan,
    operatorCommandPlan,
  );
  const operatorCommandExecutionQueues = summarizeDefaultMasterPlanOperatorCommandExecutionQueues(
    gapSummary.operatorCommandExecutionQueues,
    operatorCommandExecutionPlan,
  );
  const compactActionItems = summarizeDefaultMasterPlanCompactActionItems({
    actionGroups,
    blockedGateActionCoverage,
    operatorUnblockRequirementMatrix,
    operatorCommandExecutionQueues,
  });

  return {
    status: String(gapSummary.status ?? 'unknown'),
    productionReady: gapSummary.productionReady === true,
    gateSummary,
    completionRate: gateSummary.completionRate,
    blockedGateActionCoverageSummary: summarizeDefaultMasterPlanBlockedGateActionCoverageSummary(gapSummary.blockedGateActionCoverageSummary),
    blockedGateActionCoverage,
    operatorUnblockRequirementSummary: summarizeDefaultMasterPlanOperatorUnblockRequirementSummary(
      gapSummary.operatorUnblockRequirementSummary,
      actionGroups,
    ),
    operatorUnblockRequirementMatrix,
    operatorCommandPlanSummary: summarizeDefaultMasterPlanOperatorCommandPlanSummary(
      gapSummary.operatorCommandPlanSummary,
      actionGroups,
    ),
    operatorCommandPlan,
    operatorCommandExecutionPlanSummary: summarizeDefaultMasterPlanOperatorCommandExecutionPlanSummary(
      gapSummary.operatorCommandExecutionPlanSummary,
      operatorCommandPlan,
      actionGroups.length,
    ),
    operatorCommandExecutionPlan,
    operatorCommandExecutionQueueSummary: summarizeDefaultMasterPlanOperatorCommandExecutionQueueSummary(
      gapSummary.operatorCommandExecutionQueueSummary,
      operatorCommandExecutionPlan,
    ),
    operatorCommandExecutionQueues,
    compactActionItems,
    sourcePath,
    actionGroupCount: actionGroups.length,
    blockedActionGroupCount: actionGroups.filter((group) => group.status === 'blocked').length,
    deferredActionGroupCount: actionGroups.filter((group) => group.status === 'deferred').length,
    sourceInputSummary: summarizeDefaultMasterPlanSourceInputSummary(gapSummary.sourceInputSummary),
    actionGroups,
    mutationBoundary: 'read-only dashboard projection from real-evidence-gap-summary.json; does not run evidence builders, writers, source exports, seed imports, publication, rollback, or DB mutations',
  };
}

function summarizeDefaultMasterPlanGateSummary(value) {
  const summary = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const total = Number.isFinite(Number(summary.total)) ? Number(summary.total) : 0;
  const pass = Number.isFinite(Number(summary.pass)) ? Number(summary.pass) : 0;
  const blocked = Number.isFinite(Number(summary.blocked)) ? Number(summary.blocked) : 0;
  const fail = Number.isFinite(Number(summary.fail)) ? Number(summary.fail) : 0;
  const suppliedCompletionRate = Number(summary.completionRate ?? summary.completion_rate);
  return {
    total,
    pass,
    blocked,
    fail,
    completionRate: Number.isFinite(suppliedCompletionRate)
      ? suppliedCompletionRate
      : total > 0
        ? Number(((pass / total) * 100).toFixed(1))
        : 0,
  };
}

function summarizeDefaultMasterPlanSourceInputSummary(value) {
  const summary = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    total: Number.isFinite(Number(summary.total)) ? Number(summary.total) : 0,
    present: Number.isFinite(Number(summary.present)) ? Number(summary.present) : 0,
    missing: Number.isFinite(Number(summary.missing)) ? Number(summary.missing) : 0,
    hashed: Number.isFinite(Number(summary.hashed)) ? Number(summary.hashed) : 0,
    ready: summary.ready === true,
    missingKeys: arrayOfStrings(summary.missingKeys ?? summary.missing_keys),
  };
}

function summarizeDefaultMasterPlanBlockedGateActionCoverageSummary(value) {
  const summary = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const totalBlockedGateCount = numberValue(summary.totalBlockedGateCount ?? summary.total_blocked_gate_count);
  const coveredBlockedGateCount = numberValue(summary.coveredBlockedGateCount ?? summary.covered_blocked_gate_count);
  const suppliedCoverageRate = Number(summary.coverageRate ?? summary.coverage_rate);
  const uncoveredBlockedGateCount = Number.isFinite(Number(summary.uncoveredBlockedGateCount ?? summary.uncovered_blocked_gate_count))
    ? Number(summary.uncoveredBlockedGateCount ?? summary.uncovered_blocked_gate_count)
    : Math.max(totalBlockedGateCount - coveredBlockedGateCount, 0);
  return {
    totalBlockedGateCount,
    coveredBlockedGateCount,
    uncoveredBlockedGateCount,
    coverageRate: Number.isFinite(suppliedCoverageRate)
      ? suppliedCoverageRate
      : totalBlockedGateCount > 0
        ? Number(((coveredBlockedGateCount / totalBlockedGateCount) * 100).toFixed(1))
        : 100,
    coveredBlockedGateIds: arrayOfStrings(summary.coveredBlockedGateIds ?? summary.covered_blocked_gate_ids),
    uncoveredBlockedGateIds: arrayOfStrings(summary.uncoveredBlockedGateIds ?? summary.uncovered_blocked_gate_ids),
    coveringActionGroupIds: arrayOfStrings(summary.coveringActionGroupIds ?? summary.covering_action_group_ids),
  };
}

function summarizeDefaultMasterPlanBlockedGateActionCoverage(value) {
  return arrayOfObjects(value).map((entry) => ({
    gateId: String(entry.gateId ?? entry.gate_id ?? '').trim(),
    tier: String(entry.tier ?? '').trim(),
    status: String(entry.status ?? '').trim(),
    blockerCount: numberValue(entry.blockerCount ?? entry.blocker_count),
    covered: entry.covered === true,
    coveredByActionGroupIds: arrayOfStrings(entry.coveredByActionGroupIds ?? entry.covered_by_action_group_ids),
    uncoveredBlockers: arrayOfStrings(entry.uncoveredBlockers ?? entry.uncovered_blockers),
  }));
}

function summarizeDefaultMasterPlanOperatorUnblockRequirementSummary(value, actionGroups = []) {
  const supplied = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  const computed = buildDefaultMasterPlanOperatorUnblockRequirementReport(actionGroups).summary;
  const source = supplied ?? computed;
  return {
    actionGroupCount: numberValue(source.actionGroupCount ?? source.action_group_count),
    blockedActionGroupCount: numberValue(source.blockedActionGroupCount ?? source.blocked_action_group_count),
    deferredActionGroupCount: numberValue(source.deferredActionGroupCount ?? source.deferred_action_group_count),
    operatorRequirementActionCount: numberValue(source.operatorRequirementActionCount ?? source.operator_requirement_action_count),
    envUnlockCount: numberValue(source.envUnlockCount ?? source.env_unlock_count),
    requiredFlagCount: numberValue(source.requiredFlagCount ?? source.required_flag_count),
    operatorFieldCount: numberValue(source.operatorFieldCount ?? source.operator_field_count),
    evidenceInputCount: numberValue(source.evidenceInputCount ?? source.evidence_input_count),
    environmentTargetCount: numberValue(source.environmentTargetCount ?? source.environment_target_count),
    verificationCommandCount: numberValue(source.verificationCommandCount ?? source.verification_command_count),
    repairRequiredStepCount: numberValue(source.repairRequiredStepCount ?? source.repair_required_step_count),
    dbRepairRequiredStepCount: numberValue(source.dbRepairRequiredStepCount ?? source.db_repair_required_step_count),
    blockedPlanStepCount: numberValue(source.blockedPlanStepCount ?? source.blocked_plan_step_count),
    envUnlockVariables: arrayOfStrings(source.envUnlockVariables ?? source.env_unlock_variables),
    requiredFlags: arrayOfStrings(source.requiredFlags ?? source.required_flags),
    operatorFields: arrayOfStrings(source.operatorFields ?? source.operator_fields),
    evidenceInputArtifacts: arrayOfStrings(source.evidenceInputArtifacts ?? source.evidence_input_artifacts),
    requiredEnvironmentTargets: arrayOfStrings(source.requiredEnvironmentTargets ?? source.required_environment_targets),
    verificationCommands: arrayOfStrings(source.verificationCommands ?? source.verification_commands),
    repairRequiredStepIds: arrayOfStrings(source.repairRequiredStepIds ?? source.repair_required_step_ids),
    dbRepairRequiredStepIds: arrayOfStrings(source.dbRepairRequiredStepIds ?? source.db_repair_required_step_ids),
    blockedPlanStepIds: arrayOfStrings(source.blockedPlanStepIds ?? source.blocked_plan_step_ids),
  };
}

function summarizeDefaultMasterPlanOperatorUnblockRequirementMatrix(value, actionGroups = []) {
  const supplied = Array.isArray(value) ? value : null;
  const source = supplied ?? buildDefaultMasterPlanOperatorUnblockRequirementReport(actionGroups).matrix;
  return arrayOfObjects(source).map((entry) => ({
    actionGroupId: String(entry.actionGroupId ?? entry.action_group_id ?? '').trim(),
    priority: numberValue(entry.priority),
    status: String(entry.status ?? '').trim(),
    operatorRequirementActionIds: arrayOfStrings(entry.operatorRequirementActionIds ?? entry.operator_requirement_action_ids),
    envUnlockVariables: arrayOfStrings(entry.envUnlockVariables ?? entry.env_unlock_variables),
    requiredFlags: arrayOfStrings(entry.requiredFlags ?? entry.required_flags),
    operatorFields: arrayOfStrings(entry.operatorFields ?? entry.operator_fields),
    evidenceInputArtifacts: arrayOfStrings(entry.evidenceInputArtifacts ?? entry.evidence_input_artifacts),
    requiredEnvironmentTargets: arrayOfStrings(entry.requiredEnvironmentTargets ?? entry.required_environment_targets),
    verificationCommands: arrayOfStrings(entry.verificationCommands ?? entry.verification_commands),
    repairRequiredStepIds: arrayOfStrings(entry.repairRequiredStepIds ?? entry.repair_required_step_ids),
    dbRepairRequiredStepIds: arrayOfStrings(entry.dbRepairRequiredStepIds ?? entry.db_repair_required_step_ids),
    blockedPlanStepIds: arrayOfStrings(entry.blockedPlanStepIds ?? entry.blocked_plan_step_ids),
  }));
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function requirementNext(requirement) {
  return objectValue(objectValue(requirement).nextRequirements);
}

function operatorRequirementValues(operatorRequirements, collectionName, valueName) {
  return uniqueStrings(operatorRequirements.flatMap((requirement) => {
    const collection = requirementNext(requirement)[collectionName];
    return Array.isArray(collection)
      ? collection.map((item) => objectValue(item)[valueName])
      : [];
  }));
}

function actionPlanStepIds(group, planNames, fieldName) {
  return uniqueStrings(planNames.flatMap((planName) => arrayOfStrings(objectValue(group[planName])[fieldName])));
}

function buildDefaultMasterPlanOperatorUnblockRequirementReport(actionGroups) {
  const groups = Array.isArray(actionGroups) ? actionGroups : [];
  const matrix = groups.map((group) => {
    const operatorRequirements = Array.isArray(group.operatorRequirements) ? group.operatorRequirements : [];
    const repairRequiredStepIds = actionPlanStepIds(group, ['repairPlan'], 'requiredStepIds');
    const dbRepairRequiredStepIds = actionPlanStepIds(group, ['dbRepairPlan'], 'requiredStepIds');
    const blockedPlanStepIds = actionPlanStepIds(group, ['repairPlan', 'dbRepairPlan', 'executionGatePlan'], 'blockedStepIds');
    return {
      actionGroupId: String(group.id ?? '').trim(),
      priority: numberValue(group.priority),
      status: String(group.status ?? '').trim(),
      operatorRequirementActionIds: uniqueStrings(operatorRequirements.map((requirement) => objectValue(requirement).actionId)),
      envUnlockVariables: operatorRequirementValues(operatorRequirements, 'envUnlocks', 'variable'),
      requiredFlags: operatorRequirementValues(operatorRequirements, 'requiredFlags', 'flag'),
      operatorFields: operatorRequirementValues(operatorRequirements, 'operatorFields', 'field'),
      evidenceInputArtifacts: operatorRequirementValues(operatorRequirements, 'evidenceInputs', 'artifact'),
      requiredEnvironmentTargets: operatorRequirementValues(operatorRequirements, 'requiredEnvironmentTargets', 'target'),
      verificationCommands: uniqueStrings(operatorRequirements.flatMap((requirement) => arrayOfStrings(requirementNext(requirement).verificationCommands))),
      repairRequiredStepIds,
      dbRepairRequiredStepIds,
      blockedPlanStepIds,
    };
  });

  return {
    summary: {
      actionGroupCount: groups.length,
      blockedActionGroupCount: groups.filter((group) => group.status === 'blocked').length,
      deferredActionGroupCount: groups.filter((group) => group.status === 'deferred').length,
      operatorRequirementActionCount: matrix.reduce((sum, row) => sum + row.operatorRequirementActionIds.length, 0),
      envUnlockCount: matrix.reduce((sum, row) => sum + row.envUnlockVariables.length, 0),
      requiredFlagCount: matrix.reduce((sum, row) => sum + row.requiredFlags.length, 0),
      operatorFieldCount: matrix.reduce((sum, row) => sum + row.operatorFields.length, 0),
      evidenceInputCount: matrix.reduce((sum, row) => sum + row.evidenceInputArtifacts.length, 0),
      environmentTargetCount: matrix.reduce((sum, row) => sum + row.requiredEnvironmentTargets.length, 0),
      verificationCommandCount: matrix.reduce((sum, row) => sum + row.verificationCommands.length, 0),
      repairRequiredStepCount: matrix.reduce((sum, row) => sum + row.repairRequiredStepIds.length, 0),
      dbRepairRequiredStepCount: matrix.reduce((sum, row) => sum + row.dbRepairRequiredStepIds.length, 0),
      blockedPlanStepCount: matrix.reduce((sum, row) => sum + row.blockedPlanStepIds.length, 0),
      envUnlockVariables: uniqueStrings(matrix.flatMap((row) => row.envUnlockVariables)),
      requiredFlags: uniqueStrings(matrix.flatMap((row) => row.requiredFlags)),
      operatorFields: uniqueStrings(matrix.flatMap((row) => row.operatorFields)),
      evidenceInputArtifacts: uniqueStrings(matrix.flatMap((row) => row.evidenceInputArtifacts)),
      requiredEnvironmentTargets: uniqueStrings(matrix.flatMap((row) => row.requiredEnvironmentTargets)),
      verificationCommands: uniqueStrings(matrix.flatMap((row) => row.verificationCommands)),
      repairRequiredStepIds: uniqueStrings(matrix.flatMap((row) => row.repairRequiredStepIds)),
      dbRepairRequiredStepIds: uniqueStrings(matrix.flatMap((row) => row.dbRepairRequiredStepIds)),
      blockedPlanStepIds: uniqueStrings(matrix.flatMap((row) => row.blockedPlanStepIds)),
    },
    matrix,
  };
}

function classifyDefaultMasterPlanOperatorCommand(command) {
  const text = String(command ?? '').trim();
  if (!text) return 'read_only_evidence';
  if (
    text.startsWith('$env:')
    || text.toLowerCase().startsWith('update ')
    || text.includes('<')
    || text.includes('docker ')
    || text.includes('supabase start')
    || text.includes('supabase --version')
    || text.includes('supabase status')
  ) {
    return 'manual_prerequisite';
  }
  if (
    text.includes('build-default-master-plan-production-evidence-pipeline')
    || text.includes('evidence:default-master-plan:export-sources')
  ) {
    return 'production_or_live_guarded';
  }
  if (
    text.includes('candidate-refresh-execution')
    || text.includes('candidate-baseline-materialization')
    || text.includes('runtime-seed-import-execution')
  ) {
    return 'guarded_write_or_db_dependent';
  }
  return 'read_only_evidence';
}

function defaultMasterPlanCommandReadiness(status) {
  if (status === 'deferred') return 'deferred';
  if (status === 'blocked') return 'blocked';
  return 'ready';
}

function pushDefaultMasterPlanOperatorCommands(entries, group, commands, commandSource) {
  const actionGroupId = String(group.id ?? '').trim();
  const status = String(group.status ?? '').trim();
  const priority = numberValue(group.priority);
  for (const command of arrayOfStrings(commands)) {
    entries.push({
      actionGroupId,
      priority,
      status,
      commandSource,
      executionReadiness: defaultMasterPlanCommandReadiness(status),
      commandKind: classifyDefaultMasterPlanOperatorCommand(command),
      command,
    });
  }
}

function buildDefaultMasterPlanOperatorCommandPlan(actionGroups) {
  const groups = Array.isArray(actionGroups) ? actionGroups : [];
  const plan = [];
  for (const group of groups) {
    pushDefaultMasterPlanOperatorCommands(plan, group, group.commands, 'action_group_command');
    for (const [planName, sourcePrefix] of [
      ['repairPlan', 'repair_plan'],
      ['dbRepairPlan', 'db_repair_plan'],
      ['executionGatePlan', 'execution_gate_plan'],
    ]) {
      const actionPlan = objectValue(group[planName]);
      for (const step of arrayOfObjects(actionPlan.orderedSteps)) {
        const stepId = String(step.id ?? '').trim() || 'unknown';
        pushDefaultMasterPlanOperatorCommands(plan, group, step.commands, sourcePrefix + ':' + stepId + ':command');
        pushDefaultMasterPlanOperatorCommands(plan, group, step.verificationCommands, sourcePrefix + ':' + stepId + ':verification');
      }
    }

    const materializationNextCommands = objectValue(objectValue(group.materializationReadinessPlan).nextCommands);
    for (const [key, value] of Object.entries(materializationNextCommands)) {
      pushDefaultMasterPlanOperatorCommands(plan, group, [value], 'materialization_next_command:' + key);
    }
  }

  return {
    summary: {
      actionGroupCount: groups.length,
      totalCommandCount: plan.length,
      blockedCommandCount: plan.filter((entry) => entry.executionReadiness === 'blocked').length,
      deferredCommandCount: plan.filter((entry) => entry.executionReadiness === 'deferred').length,
      readOnlyEvidenceCommandCount: plan.filter((entry) => entry.commandKind === 'read_only_evidence').length,
      guardedWriteOrLiveCommandCount: plan.filter((entry) => (
        entry.commandKind === 'guarded_write_or_db_dependent'
        || entry.commandKind === 'production_or_live_guarded'
      )).length,
      manualPrerequisiteCommandCount: plan.filter((entry) => entry.commandKind === 'manual_prerequisite').length,
    },
    plan,
  };
}

function summarizeDefaultMasterPlanOperatorCommandPlanSummary(value, actionGroups = []) {
  const supplied = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  const computed = buildDefaultMasterPlanOperatorCommandPlan(actionGroups).summary;
  const source = supplied ?? computed;
  return {
    actionGroupCount: numberValue(source.actionGroupCount ?? source.action_group_count),
    totalCommandCount: numberValue(source.totalCommandCount ?? source.total_command_count),
    blockedCommandCount: numberValue(source.blockedCommandCount ?? source.blocked_command_count),
    deferredCommandCount: numberValue(source.deferredCommandCount ?? source.deferred_command_count),
    readOnlyEvidenceCommandCount: numberValue(source.readOnlyEvidenceCommandCount ?? source.read_only_evidence_command_count),
    guardedWriteOrLiveCommandCount: numberValue(source.guardedWriteOrLiveCommandCount ?? source.guarded_write_or_live_command_count),
    manualPrerequisiteCommandCount: numberValue(source.manualPrerequisiteCommandCount ?? source.manual_prerequisite_command_count),
  };
}

function summarizeDefaultMasterPlanOperatorCommandPlan(value, actionGroups = []) {
  const supplied = Array.isArray(value) ? value : null;
  const source = supplied ?? buildDefaultMasterPlanOperatorCommandPlan(actionGroups).plan;
  return arrayOfObjects(source).map((entry) => ({
    actionGroupId: String(entry.actionGroupId ?? entry.action_group_id ?? '').trim(),
    priority: numberValue(entry.priority),
    status: String(entry.status ?? '').trim(),
    commandSource: String(entry.commandSource ?? entry.command_source ?? '').trim(),
    executionReadiness: String(entry.executionReadiness ?? entry.execution_readiness ?? '').trim(),
    commandKind: String(entry.commandKind ?? entry.command_kind ?? '').trim(),
    command: String(entry.command ?? '').trim(),
  })).filter((entry) => entry.command);
}

function normalizeDefaultMasterPlanOperatorCommandKey(command) {
  return normalizeDefaultMasterPlanOperatorCommandText(command).replace(/^npm\.cmd\b/i, 'npm');
}

function normalizeDefaultMasterPlanOperatorCommandText(command) {
  return String(command ?? '').trim().replace(/\s+/g, ' ');
}

function preferredDefaultMasterPlanOperatorCommandDisplay(current, candidate) {
  const currentText = normalizeDefaultMasterPlanOperatorCommandText(current);
  const candidateText = normalizeDefaultMasterPlanOperatorCommandText(candidate);
  if (!currentText) return candidateText;
  if (/^npm\.cmd\b/i.test(candidateText) && !/^npm\.cmd\b/i.test(currentText)) return candidateText;
  return currentText;
}

function strongestDefaultMasterPlanExecutionReadiness(left, right) {
  const rank = { ready: 0, deferred: 1, blocked: 2 };
  const leftValue = String(left ?? '').trim() || 'ready';
  const rightValue = String(right ?? '').trim() || 'ready';
  return (rank[rightValue] ?? 0) > (rank[leftValue] ?? 0) ? rightValue : leftValue;
}

function strongestDefaultMasterPlanCommandKind(left, right) {
  const rank = {
    read_only_evidence: 0,
    manual_prerequisite: 1,
    guarded_write_or_db_dependent: 2,
    production_or_live_guarded: 3,
  };
  const leftValue = String(left ?? '').trim() || 'read_only_evidence';
  const rightValue = String(right ?? '').trim() || 'read_only_evidence';
  return (rank[rightValue] ?? 0) > (rank[leftValue] ?? 0) ? rightValue : leftValue;
}

function buildDefaultMasterPlanOperatorCommandExecutionPlan(operatorCommandPlan, actionGroupCount = 0) {
  const rawPlan = Array.isArray(operatorCommandPlan) ? operatorCommandPlan : [];
  const byCommand = new Map();

  for (const entry of rawPlan) {
    const command = normalizeDefaultMasterPlanOperatorCommandText(entry.command);
    const commandKey = normalizeDefaultMasterPlanOperatorCommandKey(command);
    if (!commandKey) continue;
    const existing = byCommand.get(commandKey) ?? {
      command,
      executionReadiness: 'ready',
      commandKind: 'read_only_evidence',
      actionGroupIds: [],
      commandSources: [],
      duplicateCount: 0,
    };
    existing.command = preferredDefaultMasterPlanOperatorCommandDisplay(existing.command, command);
    existing.executionReadiness = strongestDefaultMasterPlanExecutionReadiness(
      existing.executionReadiness,
      entry.executionReadiness,
    );
    existing.commandKind = strongestDefaultMasterPlanCommandKind(existing.commandKind, entry.commandKind);
    existing.actionGroupIds = uniqueStrings([
      ...existing.actionGroupIds,
      String(entry.actionGroupId ?? entry.action_group_id ?? '').trim(),
    ].filter(Boolean));
    existing.commandSources = uniqueStrings([
      ...existing.commandSources,
      String(entry.commandSource ?? entry.command_source ?? '').trim(),
    ].filter(Boolean));
    existing.duplicateCount += 1;
    byCommand.set(commandKey, existing);
  }

  const plan = [...byCommand.values()];
  return {
    summary: {
      actionGroupCount,
      rawCommandCount: rawPlan.length,
      uniqueCommandCount: plan.length,
      duplicateCommandCount: rawPlan.length - plan.length,
      blockedCommandCount: plan.filter((entry) => entry.executionReadiness === 'blocked').length,
      deferredCommandCount: plan.filter((entry) => entry.executionReadiness === 'deferred').length,
      readOnlyEvidenceCommandCount: plan.filter((entry) => entry.commandKind === 'read_only_evidence').length,
      guardedWriteOrLiveCommandCount: plan.filter((entry) => (
        entry.commandKind === 'guarded_write_or_db_dependent'
        || entry.commandKind === 'production_or_live_guarded'
      )).length,
      manualPrerequisiteCommandCount: plan.filter((entry) => entry.commandKind === 'manual_prerequisite').length,
    },
    plan,
  };
}

function summarizeDefaultMasterPlanOperatorCommandExecutionPlanSummary(value, operatorCommandPlan = [], actionGroupCount = 0) {
  const supplied = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  const computed = buildDefaultMasterPlanOperatorCommandExecutionPlan(operatorCommandPlan, actionGroupCount).summary;
  const source = supplied ?? computed;
  return {
    actionGroupCount: numberValue(source.actionGroupCount ?? source.action_group_count),
    rawCommandCount: numberValue(source.rawCommandCount ?? source.raw_command_count),
    uniqueCommandCount: numberValue(source.uniqueCommandCount ?? source.unique_command_count),
    duplicateCommandCount: numberValue(source.duplicateCommandCount ?? source.duplicate_command_count),
    blockedCommandCount: numberValue(source.blockedCommandCount ?? source.blocked_command_count),
    deferredCommandCount: numberValue(source.deferredCommandCount ?? source.deferred_command_count),
    readOnlyEvidenceCommandCount: numberValue(source.readOnlyEvidenceCommandCount ?? source.read_only_evidence_command_count),
    guardedWriteOrLiveCommandCount: numberValue(source.guardedWriteOrLiveCommandCount ?? source.guarded_write_or_live_command_count),
    manualPrerequisiteCommandCount: numberValue(source.manualPrerequisiteCommandCount ?? source.manual_prerequisite_command_count),
  };
}

function summarizeDefaultMasterPlanOperatorCommandExecutionPlan(value, operatorCommandPlan = []) {
  const supplied = Array.isArray(value) ? value : null;
  const source = supplied ?? buildDefaultMasterPlanOperatorCommandExecutionPlan(operatorCommandPlan).plan;
  return arrayOfObjects(source).map((entry) => ({
    command: normalizeDefaultMasterPlanOperatorCommandText(entry.command),
    executionReadiness: String(entry.executionReadiness ?? entry.execution_readiness ?? '').trim(),
    commandKind: String(entry.commandKind ?? entry.command_kind ?? '').trim(),
    actionGroupIds: arrayOfStrings(entry.actionGroupIds ?? entry.action_group_ids),
    commandSources: arrayOfStrings(entry.commandSources ?? entry.command_sources),
    duplicateCount: numberValue(entry.duplicateCount ?? entry.duplicate_count),
  })).filter((entry) => entry.command);
}

const DEFAULT_MASTER_PLAN_OPERATOR_QUEUE_IDS = [
  'read_only_evidence',
  'manual_prerequisite',
  'guarded_write_or_live',
];

function emptyDefaultMasterPlanOperatorCommandExecutionQueues() {
  return {
    readOnlyEvidence: [],
    manualPrerequisite: [],
    guardedWriteOrLive: [],
  };
}

function defaultMasterPlanOperatorQueueEntry(entry, queueId, autoRunAllowed) {
  return {
    ...entry,
    queueId,
    autoRunAllowed,
  };
}

function buildDefaultMasterPlanOperatorCommandExecutionQueues(operatorCommandExecutionPlan) {
  const plan = Array.isArray(operatorCommandExecutionPlan) ? operatorCommandExecutionPlan : [];
  const queues = emptyDefaultMasterPlanOperatorCommandExecutionQueues();

  for (const entry of plan) {
    if (entry.commandKind === 'read_only_evidence') {
      queues.readOnlyEvidence.push(defaultMasterPlanOperatorQueueEntry(entry, 'read_only_evidence', true));
    } else if (entry.commandKind === 'manual_prerequisite') {
      queues.manualPrerequisite.push(defaultMasterPlanOperatorQueueEntry(entry, 'manual_prerequisite', false));
    } else {
      queues.guardedWriteOrLive.push(defaultMasterPlanOperatorQueueEntry(entry, 'guarded_write_or_live', false));
    }
  }

  return {
    summary: {
      totalUniqueCommandCount: plan.length,
      readOnlyEvidenceCommandCount: queues.readOnlyEvidence.length,
      manualPrerequisiteCommandCount: queues.manualPrerequisite.length,
      guardedWriteOrLiveCommandCount: queues.guardedWriteOrLive.length,
      autoRunAllowedCommandCount: queues.readOnlyEvidence.length,
      autoRunForbiddenCommandCount: queues.manualPrerequisite.length + queues.guardedWriteOrLive.length,
      queueIds: DEFAULT_MASTER_PLAN_OPERATOR_QUEUE_IDS,
    },
    queues,
  };
}

function summarizeDefaultMasterPlanOperatorCommandExecutionQueueSummary(value, operatorCommandExecutionPlan = []) {
  const supplied = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  const computed = buildDefaultMasterPlanOperatorCommandExecutionQueues(operatorCommandExecutionPlan).summary;
  const source = supplied ?? computed;
  return {
    totalUniqueCommandCount: numberValue(source.totalUniqueCommandCount ?? source.total_unique_command_count),
    readOnlyEvidenceCommandCount: numberValue(source.readOnlyEvidenceCommandCount ?? source.read_only_evidence_command_count),
    manualPrerequisiteCommandCount: numberValue(source.manualPrerequisiteCommandCount ?? source.manual_prerequisite_command_count),
    guardedWriteOrLiveCommandCount: numberValue(source.guardedWriteOrLiveCommandCount ?? source.guarded_write_or_live_command_count),
    autoRunAllowedCommandCount: numberValue(source.autoRunAllowedCommandCount ?? source.auto_run_allowed_command_count),
    autoRunForbiddenCommandCount: numberValue(source.autoRunForbiddenCommandCount ?? source.auto_run_forbidden_command_count),
    queueIds: arrayOfStrings(source.queueIds ?? source.queue_ids).length
      ? arrayOfStrings(source.queueIds ?? source.queue_ids)
      : DEFAULT_MASTER_PLAN_OPERATOR_QUEUE_IDS,
  };
}

function summarizeDefaultMasterPlanOperatorCommandExecutionQueues(value, operatorCommandExecutionPlan = []) {
  const supplied = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  const source = supplied ?? buildDefaultMasterPlanOperatorCommandExecutionQueues(operatorCommandExecutionPlan).queues;
  return {
    readOnlyEvidence: summarizeDefaultMasterPlanOperatorCommandExecutionQueueEntries(source.readOnlyEvidence ?? source.read_only_evidence),
    manualPrerequisite: summarizeDefaultMasterPlanOperatorCommandExecutionQueueEntries(source.manualPrerequisite ?? source.manual_prerequisite),
    guardedWriteOrLive: summarizeDefaultMasterPlanOperatorCommandExecutionQueueEntries(source.guardedWriteOrLive ?? source.guarded_write_or_live),
  };
}

function summarizeDefaultMasterPlanOperatorCommandExecutionQueueEntries(value) {
  return arrayOfObjects(value).map((entry) => ({
    command: normalizeDefaultMasterPlanOperatorCommandText(entry.command),
    executionReadiness: String(entry.executionReadiness ?? entry.execution_readiness ?? '').trim(),
    commandKind: String(entry.commandKind ?? entry.command_kind ?? '').trim(),
    actionGroupIds: arrayOfStrings(entry.actionGroupIds ?? entry.action_group_ids),
    commandSources: arrayOfStrings(entry.commandSources ?? entry.command_sources),
    duplicateCount: numberValue(entry.duplicateCount ?? entry.duplicate_count),
    queueId: String(entry.queueId ?? entry.queue_id ?? '').trim(),
    autoRunAllowed: entry.autoRunAllowed === true || entry.auto_run_allowed === true,
  })).filter((entry) => entry.command);
}

function summarizeDefaultMasterPlanCompactActionItems({
  actionGroups,
  blockedGateActionCoverage,
  operatorUnblockRequirementMatrix,
  operatorCommandExecutionQueues,
}) {
  const coverage = Array.isArray(blockedGateActionCoverage) ? blockedGateActionCoverage : [];
  const requirementRows = Array.isArray(operatorUnblockRequirementMatrix) ? operatorUnblockRequirementMatrix : [];
  const queues = operatorCommandExecutionQueues && typeof operatorCommandExecutionQueues === 'object' && !Array.isArray(operatorCommandExecutionQueues)
    ? operatorCommandExecutionQueues
    : emptyDefaultMasterPlanOperatorCommandExecutionQueues();

  return (Array.isArray(actionGroups) ? actionGroups : [])
    .map((group) => {
      const actionGroupId = String(group.id ?? '').trim();
      const requirementRow = requirementRows.find((row) => row.actionGroupId === actionGroupId) ?? {};
      const blockers = uniqueStrings([
        ...arrayOfStrings(group.blockedBy),
        ...arrayOfStrings(group.deferredBy),
        ...arrayOfObjects(group.operatorRequirements).flatMap((requirement) => arrayOfStrings(requirement.blockers)),
      ]);
      return {
        actionGroupId,
        priority: numberValue(group.priority),
        status: String(group.status ?? '').trim() || 'unknown',
        coveredGateIds: coverage
          .filter((entry) => arrayOfStrings(entry.coveredByActionGroupIds).includes(actionGroupId))
          .map((entry) => String(entry.gateId ?? '').trim())
          .filter(Boolean),
        nextAction: String(group.nextAction ?? '').trim(),
        envUnlockVariables: arrayOfStrings(requirementRow.envUnlockVariables ?? requirementRow.env_unlock_variables),
        requiredFlags: arrayOfStrings(requirementRow.requiredFlags ?? requirementRow.required_flags),
        operatorFields: arrayOfStrings(requirementRow.operatorFields ?? requirementRow.operator_fields),
        evidenceInputArtifacts: arrayOfStrings(requirementRow.evidenceInputArtifacts ?? requirementRow.evidence_input_artifacts),
        requiredEnvironmentTargets: arrayOfStrings(requirementRow.requiredEnvironmentTargets ?? requirementRow.required_environment_targets),
        blockerCount: blockers.length,
        blockers: blockers.slice(0, 5),
        commandCounts: {
          readOnlyEvidence: countQueueEntriesForActionGroup(queues.readOnlyEvidence, actionGroupId),
          manualPrerequisite: countQueueEntriesForActionGroup(queues.manualPrerequisite, actionGroupId),
          guardedWriteOrLive: countQueueEntriesForActionGroup(queues.guardedWriteOrLive, actionGroupId),
        },
      };
    })
    .filter((entry) => entry.actionGroupId)
    .sort((a, b) => a.priority - b.priority);
}

function countQueueEntriesForActionGroup(entries, actionGroupId) {
  return arrayOfObjects(entries).filter((entry) => arrayOfStrings(entry.actionGroupIds).includes(actionGroupId)).length;
}

function summarizeDefaultMasterPlanActionGroup(group) {
  const operatorRequirements = Array.isArray(group.operatorRequirements) ? group.operatorRequirements : [];
  return {
    id: String(group.id ?? '').trim(),
    priority: Number.isFinite(Number(group.priority)) ? Number(group.priority) : 0,
    status: String(group.status ?? 'unknown').trim(),
    blockedBy: arrayOfStrings(group.blockedBy),
    deferredBy: arrayOfStrings(group.deferredBy),
    nextAction: String(group.nextAction ?? '').trim(),
    commands: arrayOfStrings(group.commands),
    mutationBoundary: String(group.mutationBoundary ?? '').trim(),
    requirementSummary: summarizeOperatorRequirements(operatorRequirements),
    operatorRequirements,
    repairPlan: summarizeDefaultMasterPlanActionPlan(group.repairPlan),
    dbRepairPlan: summarizeDefaultMasterPlanActionPlan(group.dbRepairPlan),
    executionGatePlan: summarizeDefaultMasterPlanActionPlan(group.executionGatePlan),
    materializationReadinessPlan: summarizeDefaultMasterPlanMaterializationReadinessPlan(group.materializationReadinessPlan),
    durationAlignmentPlan: summarizeDefaultMasterPlanDurationAlignmentPlan(group.durationAlignmentPlan),
    productionOutcomePlan: summarizeDefaultMasterPlanProductionOutcomePlan(group.productionOutcomePlan),
  };
}

function summarizeDefaultMasterPlanActionPlan(value) {
  const plan = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  if (!plan) return null;

  const orderedSteps = Array.isArray(plan.orderedSteps)
    ? plan.orderedSteps.map((step) => summarizeDefaultMasterPlanActionPlanStep(step))
    : [];

  return {
    status: String(plan.status ?? 'unknown').trim(),
    targetClass: String(plan.targetClass ?? plan.target_class ?? '').trim(),
    failureClass: String(plan.failureClass ?? plan.failure_class ?? '').trim(),
    noAutoInstall: plan.noAutoInstall === true || plan.no_auto_install === true,
    noAutoCredentialRotation: plan.noAutoCredentialRotation === true || plan.no_auto_credential_rotation === true,
    noAutoExecution: plan.noAutoExecution === true || plan.no_auto_execution === true,
    requiredStepIds: arrayOfStrings(plan.requiredStepIds ?? plan.required_step_ids),
    blockedStepIds: arrayOfStrings(plan.blockedStepIds ?? plan.blocked_step_ids),
    orderedStepCount: Number.isFinite(Number(plan.orderedStepCount ?? plan.ordered_step_count))
      ? Number(plan.orderedStepCount ?? plan.ordered_step_count)
      : orderedSteps.length,
    orderedSteps,
  };
}

function summarizeDefaultMasterPlanActionPlanStep(step) {
  const record = step && typeof step === 'object' && !Array.isArray(step) ? step : {};
  return {
    id: String(record.id ?? '').trim(),
    status: String(record.status ?? 'unknown').trim(),
    blockerCodes: arrayOfStrings(record.blockerCodes ?? record.blocker_codes),
    title: String(record.title ?? '').trim(),
    commands: arrayOfStrings(record.commands),
    verificationCommands: arrayOfStrings(record.verificationCommands ?? record.verification_commands),
    notes: arrayOfStrings(record.notes),
  };
}

function summarizeDefaultMasterPlanMaterializationReadinessPlan(value) {
  const plan = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  if (!plan) return null;
  const nextCommands = plan.nextCommands && typeof plan.nextCommands === 'object' && !Array.isArray(plan.nextCommands)
    ? plan.nextCommands
    : {};

  return {
    status: String(plan.status ?? 'unknown').trim(),
    productionReady: plan.productionReady === true,
    baselineId: String(plan.baselineId ?? plan.baseline_id ?? '').trim(),
    projectId: String(plan.projectId ?? plan.project_id ?? '').trim(),
    businessType: String(plan.businessType ?? plan.business_type ?? '').trim(),
    environment: String(plan.environment ?? '').trim(),
    materializationCommandReady: plan.materializationCommandReady === true || plan.materialization_command_ready === true,
    unlockVariable: String(plan.unlockVariable ?? plan.unlock_variable ?? '').trim(),
    unlockPresent: plan.unlockPresent === true || plan.unlock_present === true,
    executeReady: plan.executeReady === true || plan.execute_ready === true,
    operatorMustRunManually: plan.operatorMustRunManually === true || plan.operator_must_run_manually === true,
    blockers: arrayOfStrings(plan.blockers),
    doesNotConnectDatabase: plan.doesNotConnectDatabase === true || plan.does_not_connect_database === true,
    commandsExecuted: Number.isFinite(Number(plan.commandsExecuted ?? plan.commands_executed))
      ? Number(plan.commandsExecuted ?? plan.commands_executed)
      : 0,
    writesCandidateBaselines: plan.writesCandidateBaselines === true || plan.writes_candidate_baselines === true,
    writesTaskBaselineItems: plan.writesTaskBaselineItems === true || plan.writes_task_baseline_items === true,
    nextCommands: {
      setUnlockPowerShell: String(nextCommands.setUnlockPowerShell ?? nextCommands.set_unlock_power_shell ?? '').trim(),
      executeCandidateBaselineMaterialization: String(nextCommands.executeCandidateBaselineMaterialization ?? nextCommands.execute_candidate_baseline_materialization ?? '').trim(),
      refreshOperatorHandoff: String(nextCommands.refreshOperatorHandoff ?? nextCommands.refresh_operator_handoff ?? '').trim(),
      refreshOperatorHandoffPreflight: String(nextCommands.refreshOperatorHandoffPreflight ?? nextCommands.refresh_operator_handoff_preflight ?? '').trim(),
      refreshRealEvidenceGaps: String(nextCommands.refreshRealEvidenceGaps ?? nextCommands.refresh_real_evidence_gaps ?? '').trim(),
    },
  };
}

function summarizeDefaultMasterPlanDurationAlignmentPlan(value) {
  const plan = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  if (!plan) return null;

  const completedTaskExport = objectValue(plan.completedTaskExport ?? plan.completed_task_export);
  const runtimeCandidateAlignment = objectValue(plan.runtimeCandidateAlignment ?? plan.runtime_candidate_alignment);
  const runtimeTaskAlignmentRefreshPackage = objectValue(plan.runtimeTaskAlignmentRefreshPackage ?? plan.runtime_task_alignment_refresh_package);
  const realDurationSampleMaterialPreflight = objectValue(plan.realDurationSampleMaterialPreflight ?? plan.real_duration_sample_material_preflight);

  return {
    completedTaskExport: {
      status: String(completedTaskExport.status ?? '').trim(),
      requiredStableCodeCount: numberValue(completedTaskExport.requiredStableCodeCount ?? completedTaskExport.required_stable_code_count),
      rawTaskCount: numberValue(completedTaskExport.rawTaskCount ?? completedTaskExport.raw_task_count),
      exportedTaskCount: numberValue(completedTaskExport.exportedTaskCount ?? completedTaskExport.exported_task_count),
      invalidTaskCount: numberValue(completedTaskExport.invalidTaskCount ?? completedTaskExport.invalid_task_count),
      titleMismatchCount: numberValue(completedTaskExport.titleMismatchCount ?? completedTaskExport.title_mismatch_count),
      missingStableCodeCount: numberValue(completedTaskExport.missingStableCodeCount ?? completedTaskExport.missing_stable_code_count),
      missingStableCodes: arrayOfStrings(completedTaskExport.missingStableCodes ?? completedTaskExport.missing_stable_codes),
      invalidTaskExamples: arrayOfObjects(completedTaskExport.invalidTaskExamples ?? completedTaskExport.invalid_task_examples).map((example) => ({
        id: String(example.id ?? '').trim(),
        stableCode: String(example.stableCode ?? example.stable_code ?? '').trim(),
        recommendedAction: String(example.recommendedAction ?? example.recommended_action ?? '').trim(),
        blockers: arrayOfStrings(example.blockers),
      })),
      blockers: arrayOfStrings(completedTaskExport.blockers),
    },
    runtimeCandidateAlignment: {
      status: String(runtimeCandidateAlignment.status ?? '').trim(),
      candidateRowCount: numberValue(runtimeCandidateAlignment.candidateRowCount ?? runtimeCandidateAlignment.candidate_row_count),
      runtimeTaskCount: numberValue(runtimeCandidateAlignment.runtimeTaskCount ?? runtimeCandidateAlignment.runtime_task_count),
      missingRuntimeTaskCount: numberValue(runtimeCandidateAlignment.missingRuntimeTaskCount ?? runtimeCandidateAlignment.missing_runtime_task_count),
      titleMismatchCount: numberValue(runtimeCandidateAlignment.titleMismatchCount ?? runtimeCandidateAlignment.title_mismatch_count),
      rowsMissingActualDateRangeCount: numberValue(runtimeCandidateAlignment.rowsMissingActualDateRangeCount ?? runtimeCandidateAlignment.rows_missing_actual_date_range_count),
      driftExamples: arrayOfObjects(runtimeCandidateAlignment.driftExamples ?? runtimeCandidateAlignment.drift_examples).map((example) => ({
        stableCode: String(example.stableCode ?? example.stable_code ?? '').trim(),
        runtimeTaskId: String(example.runtimeTaskId ?? example.runtime_task_id ?? '').trim(),
        alignmentStatus: String(example.alignmentStatus ?? example.alignment_status ?? '').trim(),
        recommendedAction: String(example.recommendedAction ?? example.recommended_action ?? '').trim(),
        blockers: arrayOfStrings(example.blockers),
      })),
      blockers: arrayOfStrings(runtimeCandidateAlignment.blockers),
    },
    runtimeTaskAlignmentRefreshPackage: {
      status: String(runtimeTaskAlignmentRefreshPackage.status ?? '').trim(),
      actionCount: numberValue(runtimeTaskAlignmentRefreshPackage.actionCount ?? runtimeTaskAlignmentRefreshPackage.action_count),
      stableCodeRefreshReviewActionCount: numberValue(runtimeTaskAlignmentRefreshPackage.stableCodeRefreshReviewActionCount ?? runtimeTaskAlignmentRefreshPackage.stable_code_refresh_review_action_count),
      missingRuntimeTaskActionCount: numberValue(runtimeTaskAlignmentRefreshPackage.missingRuntimeTaskActionCount ?? runtimeTaskAlignmentRefreshPackage.missing_runtime_task_action_count),
      actualDateRangeCollectionActionCount: numberValue(runtimeTaskAlignmentRefreshPackage.actualDateRangeCollectionActionCount ?? runtimeTaskAlignmentRefreshPackage.actual_date_range_collection_action_count),
      collisionReviewActionCount: numberValue(runtimeTaskAlignmentRefreshPackage.collisionReviewActionCount ?? runtimeTaskAlignmentRefreshPackage.collision_review_action_count),
      executeAllowed: runtimeTaskAlignmentRefreshPackage.executeAllowed === true || runtimeTaskAlignmentRefreshPackage.execute_allowed === true,
      actionExamples: arrayOfObjects(runtimeTaskAlignmentRefreshPackage.actionExamples ?? runtimeTaskAlignmentRefreshPackage.action_examples).map((example) => ({
        stableCode: String(example.stableCode ?? example.stable_code ?? '').trim(),
        runtimeTaskId: String(example.runtimeTaskId ?? example.runtime_task_id ?? '').trim(),
        actionKind: String(example.actionKind ?? example.action_kind ?? '').trim(),
        proposedStableCode: String(example.proposedStableCode ?? example.proposed_stable_code ?? '').trim(),
        blockers: arrayOfStrings(example.blockers),
      })),
      blockers: arrayOfStrings(runtimeTaskAlignmentRefreshPackage.blockers),
    },
    realDurationSampleMaterialPreflight: {
      status: String(realDurationSampleMaterialPreflight.status ?? '').trim(),
      checkedBy: String(realDurationSampleMaterialPreflight.checkedBy ?? realDurationSampleMaterialPreflight.checked_by ?? '').trim(),
      requiredStableCodeCount: numberValue(realDurationSampleMaterialPreflight.requiredStableCodeCount ?? realDurationSampleMaterialPreflight.required_stable_code_count),
      readyStableCodeCount: numberValue(realDurationSampleMaterialPreflight.readyStableCodeCount ?? realDurationSampleMaterialPreflight.ready_stable_code_count),
      missingStableCodeCount: numberValue(realDurationSampleMaterialPreflight.missingStableCodeCount ?? realDurationSampleMaterialPreflight.missing_stable_code_count),
      invalidSampleCount: numberValue(realDurationSampleMaterialPreflight.invalidSampleCount ?? realDurationSampleMaterialPreflight.invalid_sample_count),
      missingStableCodes: arrayOfStrings(realDurationSampleMaterialPreflight.missingStableCodes ?? realDurationSampleMaterialPreflight.missing_stable_codes),
      nextSampleCollectionTargets: arrayOfObjects(realDurationSampleMaterialPreflight.nextSampleCollectionTargets ?? realDurationSampleMaterialPreflight.next_sample_collection_targets).map((target) => ({
        priority: numberValue(target.priority),
        businessType: String(target.businessType ?? target.business_type ?? '').trim(),
        stableCode: String(target.stableCode ?? target.stable_code ?? '').trim(),
        requiredAcceptedSampleCount: numberValue(target.requiredAcceptedSampleCount ?? target.required_accepted_sample_count),
        readySampleCount: numberValue(target.readySampleCount ?? target.ready_sample_count),
        missingSampleCount: numberValue(target.missingSampleCount ?? target.missing_sample_count),
        invalidSampleCount: numberValue(target.invalidSampleCount ?? target.invalid_sample_count),
        nextAction: String(target.nextAction ?? target.next_action ?? '').trim(),
      })),
      readySampleExamples: arrayOfObjects(realDurationSampleMaterialPreflight.readySampleExamples ?? realDurationSampleMaterialPreflight.ready_sample_examples).map((sample) => ({
        stableCode: String(sample.stableCode ?? sample.stable_code ?? '').trim(),
        readySampleCount: numberValue(sample.readySampleCount ?? sample.ready_sample_count),
        readySampleIds: arrayOfStrings(sample.readySampleIds ?? sample.ready_sample_ids),
      })),
      blockers: arrayOfStrings(realDurationSampleMaterialPreflight.blockers),
      writesDurationSamples: realDurationSampleMaterialPreflight.writesDurationSamples === true || realDurationSampleMaterialPreflight.writes_duration_samples === true,
      writesRuntimePublication: realDurationSampleMaterialPreflight.writesRuntimePublication === true || realDurationSampleMaterialPreflight.writes_runtime_publication === true,
    },
  };
}

function summarizeDefaultMasterPlanProductionOutcomePlan(value) {
  const plan = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  if (!plan) return null;

  const realProductionOutcomePackage = objectValue(plan.realProductionOutcomePackage ?? plan.real_production_outcome_package);
  const operatorHandoff = objectValue(plan.operatorHandoff ?? plan.operator_handoff);

  return {
    realProductionOutcomePackage: {
      status: String(realProductionOutcomePackage.status ?? '').trim(),
      productionReady: realProductionOutcomePackage.productionReady === true || realProductionOutcomePackage.production_ready === true,
      targetEnvironment: String(realProductionOutcomePackage.targetEnvironment ?? realProductionOutcomePackage.target_environment ?? '').trim(),
      realProductionOutcomePath: String(realProductionOutcomePackage.realProductionOutcomePath ?? realProductionOutcomePackage.real_production_outcome_path ?? '').trim(),
      requiredFields: arrayOfStrings(realProductionOutcomePackage.requiredFields ?? realProductionOutcomePackage.required_fields),
      requiredFieldCount: numberValue(realProductionOutcomePackage.requiredFieldCount ?? realProductionOutcomePackage.required_field_count),
      blockers: arrayOfStrings(realProductionOutcomePackage.blockers),
      validationBlockers: arrayOfStrings(realProductionOutcomePackage.validationBlockers ?? realProductionOutcomePackage.validation_blockers),
    },
    operatorHandoff: {
      sourceExportMode: String(operatorHandoff.sourceExportMode ?? operatorHandoff.source_export_mode ?? '').trim(),
      mayRunSupportingSourceExport: operatorHandoff.mayRunSupportingSourceExport === true || operatorHandoff.may_run_supporting_source_export === true,
      mayRunProductionSourceExport: operatorHandoff.mayRunProductionSourceExport === true || operatorHandoff.may_run_production_source_export === true,
      mayRunSourceExport: operatorHandoff.mayRunSourceExport === true || operatorHandoff.may_run_source_export === true,
      mayAcceptRealProductionOutcomeEvidence: operatorHandoff.mayAcceptRealProductionOutcomeEvidence === true || operatorHandoff.may_accept_real_production_outcome_evidence === true,
      mayRunProductionEvidencePipeline: operatorHandoff.mayRunProductionEvidencePipeline === true || operatorHandoff.may_run_production_evidence_pipeline === true,
      productionSourceExportBlockers: arrayOfStrings(operatorHandoff.productionSourceExportBlockers ?? operatorHandoff.production_source_export_blockers),
      realProductionOutcomeEvidenceBlockers: arrayOfStrings(operatorHandoff.realProductionOutcomeEvidenceBlockers ?? operatorHandoff.real_production_outcome_evidence_blockers),
      currentBlockers: arrayOfStrings(operatorHandoff.currentBlockers ?? operatorHandoff.current_blockers),
      blockedActionIds: arrayOfStrings(operatorHandoff.blockedActionIds ?? operatorHandoff.blocked_action_ids),
      deferredActionIds: arrayOfStrings(operatorHandoff.deferredActionIds ?? operatorHandoff.deferred_action_ids),
      runnableActionIds: arrayOfStrings(operatorHandoff.runnableActionIds ?? operatorHandoff.runnable_action_ids),
    },
    productionReadinessBlockers: arrayOfStrings(plan.productionReadinessBlockers ?? plan.production_readiness_blockers),
  };
}

function summarizeOperatorRequirements(operatorRequirements) {
  const totals = {
    actionCount: operatorRequirements.length,
    envUnlockCount: 0,
    requiredFlagCount: 0,
    operatorFieldCount: 0,
    evidenceInputCount: 0,
    environmentTargetCount: 0,
    verificationCommandCount: 0,
  };

  for (const requirement of operatorRequirements) {
    const next = requirement?.nextRequirements && typeof requirement.nextRequirements === 'object'
      ? requirement.nextRequirements
      : {};
    totals.envUnlockCount += Array.isArray(next.envUnlocks) ? next.envUnlocks.length : 0;
    totals.requiredFlagCount += Array.isArray(next.requiredFlags) ? next.requiredFlags.length : 0;
    totals.operatorFieldCount += Array.isArray(next.operatorFields) ? next.operatorFields.length : 0;
    totals.evidenceInputCount += Array.isArray(next.evidenceInputs) ? next.evidenceInputs.length : 0;
    totals.environmentTargetCount += Array.isArray(next.requiredEnvironmentTargets) ? next.requiredEnvironmentTargets.length : 0;
    totals.verificationCommandCount += Array.isArray(next.verificationCommands) ? next.verificationCommands.length : 0;
  }

  return totals;
}

function arrayOfStrings(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arrayOfObjects(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function summarizeGroup(group) {
  return {
    id: group.id,
    tier: group.tier,
    status: group.status,
    purpose: group.purpose,
    commandCount: group.commands?.length ?? 0,
    commands: group.commands ?? [],
    commandTemplates: group.commandTemplates ?? [],
    requiredEvidence: group.requiredEvidence ?? [],
    closeoutTargets: group.closeoutTargets ?? [],
    unlockPolicy: group.unlockPolicy ?? null,
    artifactValidationPolicy: group.artifactValidationPolicy ?? null,
    handoffChecklist: group.handoffChecklist ?? [],
    blockingPrerequisites: group.blockingPrerequisites ?? [],
    passCriteria: group.passCriteria ?? [],
    expectedArtifacts: group.expectedArtifacts ?? [],
    evidenceOwners: group.evidenceOwners ?? [],
    recommendedTools: group.recommendedTools ?? [],
    mutationBoundary: group.mutationBoundary,
    artifactRoot: group.artifactRoot,
  };
}

async function writeReports(reportDir, summary) {
  await mkdir(reportDir, { recursive: true });
  await writeStableDefaultMasterPlanActionHandoff(reportDir, summary);
  await writeFile(path.join(reportDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(path.join(reportDir, 'summary.md'), renderMarkdownSummary(summary), 'utf8');
}

async function writeStableDefaultMasterPlanActionHandoff(reportDir, summary) {
  if (!summary.defaultMasterPlanActionHandoff) return;

  const stableRoot = path.join(path.dirname(reportDir), 'default-master-plan-production-readiness');
  const stableOutputJson = path.join(stableRoot, 'default-master-plan-action-handoff.json');
  const stableOutputMarkdown = path.join(stableRoot, 'default-master-plan-action-handoff.md');
  await mkdir(stableRoot, { recursive: true });

  const stableHandoff = {
    schemaVersion: 'workbuddy-default-master-plan-action-handoff/v1',
    generatedAt: summary.finishedAt,
    sourceDashboardReportDir: reportDir,
    dashboardProfile: summary.profile,
    dashboardDryRun: summary.dryRun,
    ...summary.defaultMasterPlanActionHandoff,
    stableOutputJson,
    stableOutputMarkdown,
  };

  summary.defaultMasterPlanActionHandoff = stableHandoff;

  await writeFile(stableOutputJson, `${JSON.stringify(stableHandoff, null, 2)}\n`, 'utf8');
  await writeFile(stableOutputMarkdown, renderStableDefaultMasterPlanActionHandoff(stableHandoff), 'utf8');
}

function renderStableDefaultMasterPlanActionHandoff(handoff) {
  return [
    '# WorkBuddy Default Master Plan Action Handoff',
    '',
    '- Schema: ' + handoff.schemaVersion,
    '- Source dashboard report: ' + handoff.sourceDashboardReportDir,
    '- Dashboard profile: ' + handoff.dashboardProfile,
    '- Dashboard dry run: ' + (handoff.dashboardDryRun ? 'yes' : 'no'),
    ...renderDefaultMasterPlanActionHandoff(handoff),
  ].join('\n') + '\n';
}

async function createUniqueReportDir(reportRoot, now) {
  await mkdir(reportRoot, { recursive: true });

  const baseDir = path.join(reportRoot, `release-${formatTimestamp(now)}`);

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = attempt === 0
      ? baseDir
      : `${baseDir}-${String(attempt).padStart(3, '0')}`;

    try {
      await mkdir(candidate, { recursive: false });
      return candidate;
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  throw new Error(`Unable to allocate unique release report directory under ${reportRoot}`);
}

function renderMarkdownSummary(summary) {
  const lines = [
    `# WorkBuddy Release Dashboard - ${summary.profile}`,
    '',
    `- Status: ${summary.dryRun ? 'Dry run' : summary.statusCounts.commandsFailed > 0 ? 'Failed' : 'Executed'}`,
    `- Matrix: ${summary.matrixSchemaVersion} (${summary.matrixGeneratedAt})`,
    `- Active live thread: ${summary.activeLiveThread ? 'yes' : 'no'}`,
    `- Selected gates: ${summary.statusCounts.selected}`,
    `- Planned commands: ${summary.statusCounts.commandsPlanned}`,
    `- Executed commands: ${summary.statusCounts.commandsExecuted}`,
    `- Failed commands: ${summary.statusCounts.commandsFailed}`,
    '',
    '## Selected Gates',
    '',
    ...renderGroupTable(summary.selectedGroups),
    '',
    '## Deferred Live Gates',
    '',
    ...renderGroupTable(summary.deferredGroups),
    '',
    '## Blocked DB Gates',
    '',
    ...renderGroupTable(summary.blockedGroups),
    '',
    '## Inventory Only Gates',
    '',
    ...renderGroupTable(summary.inventoryGroups),
    '',
    '## Gate Details',
    '',
    ...renderGateDetails([
      ...summary.selectedGroups,
      ...summary.deferredGroups,
      ...summary.blockedGroups,
      ...summary.inventoryGroups,
    ]),
    '',
    '## Command Results',
    '',
    ...renderCommandResults(summary.commandResults),
    '',
    ...renderToolReadiness(summary.toolReadiness),
    ...renderDefaultMasterPlanActionHandoff(summary.defaultMasterPlanActionHandoff),
    '',
    '## Mutation Boundary',
    '',
    ...summary.mutationBoundary.map((item) => `- ${item}`),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function renderGroupTable(groups) {
  if (groups.length === 0) {
    return ['No gates in this section.'];
  }

  return [
    '| Gate | Tier | Matrix status | Commands |',
    '| --- | --- | --- | ---: |',
    ...groups.map((group) => `| ${group.id} | ${group.tier} | ${group.status} | ${group.commandCount} |`),
  ];
}

function renderCommandResults(results) {
  if (results.length === 0) {
    return ['No commands executed.'];
  }

  return [
    '| Gate | Command | Exit | Duration ms |',
    '| --- | --- | ---: | ---: |',
    ...results.map((result) => `| ${result.groupId} | \`${escapePipes(result.command)}\` | ${result.exitCode ?? 'null'} | ${result.durationMs} |`),
  ];
}

function renderGateDetails(groups) {
  const detailedGroups = groups.filter((group) => {
    return group.commandTemplates?.length
      || group.requiredEvidence?.length
      || group.closeoutTargets?.length
      || group.unlockPolicy
      || group.artifactValidationPolicy
      || group.handoffChecklist?.length
      || group.blockingPrerequisites?.length
      || group.passCriteria?.length
      || group.expectedArtifacts?.length
      || group.evidenceOwners?.length
      || group.recommendedTools?.length;
  });

  if (detailedGroups.length === 0) {
    return ['No additional gate details.'];
  }

  return detailedGroups.flatMap((group) => {
    const lines = [
      `### ${group.id}`,
      '',
      `- Tier: ${group.tier}`,
      `- Status: ${group.status}`,
      `- Purpose: ${group.purpose}`,
    ];

    if (group.mutationBoundary) {
      lines.push(`- Mutation boundary: ${group.mutationBoundary}`);
    }

    if (group.closeoutTargets?.length) {
      lines.push('', 'Closeout targets:');
      lines.push(...group.closeoutTargets.map((item) => `- ${item}`));
    }

    if (group.unlockPolicy) {
      lines.push('', 'Unlock policy:');
      lines.push(...renderObjectEntries(group.unlockPolicy));
    }

    if (group.artifactValidationPolicy) {
      lines.push('', 'Artifact validation policy:');
      lines.push(...renderObjectEntries(group.artifactValidationPolicy));
    }

    if (group.requiredEvidence?.length) {
      lines.push('', 'Required evidence:');
      lines.push(...group.requiredEvidence.map((item) => `- ${item}`));
    }

    if (group.handoffChecklist?.length) {
      lines.push('', 'Handoff checklist:');
      lines.push(...group.handoffChecklist.map((item) => `- ${item}`));
    }

    if (group.blockingPrerequisites?.length) {
      lines.push('', 'Blocking prerequisites:');
      lines.push(...group.blockingPrerequisites.map((item) => `- ${item}`));
    }

    if (group.passCriteria?.length) {
      lines.push('', 'Pass criteria:');
      lines.push(...group.passCriteria.map((item) => `- ${item}`));
    }

    if (group.expectedArtifacts?.length) {
      lines.push('', 'Expected artifacts:');
      lines.push(...group.expectedArtifacts.map((item) => `- ${item}`));
    }

    if (group.evidenceOwners?.length) {
      lines.push('', 'Evidence owners:');
      lines.push(...group.evidenceOwners.map((item) => `- ${item}`));
    }

    if (group.commandTemplates?.length) {
      lines.push('', 'Command templates:');
      lines.push(...group.commandTemplates.map((command) => `- \`${escapePipes(command)}\``));
    }

    if (group.recommendedTools?.length) {
      lines.push('', 'Recommended tools:');
      lines.push(...group.recommendedTools.map((tool) => `- ${tool}`));
    }

    lines.push('');
    return lines;
  });
}

function renderDefaultMasterPlanActionHandoff(handoff) {
  if (!handoff) return [];

  const lines = [
    '',
    '## Default Master Plan Action Handoff',
    '',
    '- Status: ' + handoff.status,
    '- Production ready: ' + (handoff.productionReady ? 'yes' : 'no'),
    '- Gate completion: ' + handoff.gateSummary.pass + '/' + handoff.gateSummary.total + ' (' + handoff.gateSummary.completionRate + '%)',
    '- Gate blockers: blocked=' + handoff.gateSummary.blocked + ', fail=' + handoff.gateSummary.fail,
    '- Blocked gate action coverage: '
      + handoff.blockedGateActionCoverageSummary.coveredBlockedGateCount
      + '/'
      + handoff.blockedGateActionCoverageSummary.totalBlockedGateCount
      + ' ('
      + handoff.blockedGateActionCoverageSummary.coverageRate
      + '%), uncovered='
      + handoff.blockedGateActionCoverageSummary.uncoveredBlockedGateCount,
    '- Operator unblock requirements: actions='
      + handoff.operatorUnblockRequirementSummary.operatorRequirementActionCount
      + ', env_unlocks='
      + handoff.operatorUnblockRequirementSummary.envUnlockCount
      + ', flags='
      + handoff.operatorUnblockRequirementSummary.requiredFlagCount
      + ', operator_fields='
      + handoff.operatorUnblockRequirementSummary.operatorFieldCount
      + ', evidence_inputs='
      + handoff.operatorUnblockRequirementSummary.evidenceInputCount
      + ', environment_targets='
      + handoff.operatorUnblockRequirementSummary.environmentTargetCount
      + ', verification_commands='
      + handoff.operatorUnblockRequirementSummary.verificationCommandCount,
    '- Operator command plan: total='
      + handoff.operatorCommandPlanSummary.totalCommandCount
      + ', blocked='
      + handoff.operatorCommandPlanSummary.blockedCommandCount
      + ', deferred='
      + handoff.operatorCommandPlanSummary.deferredCommandCount
      + ', read_only='
      + handoff.operatorCommandPlanSummary.readOnlyEvidenceCommandCount
      + ', guarded='
      + handoff.operatorCommandPlanSummary.guardedWriteOrLiveCommandCount
      + ', manual_prerequisite='
      + handoff.operatorCommandPlanSummary.manualPrerequisiteCommandCount,
    '- Operator command execution plan: raw='
      + handoff.operatorCommandExecutionPlanSummary.rawCommandCount
      + ', unique='
      + handoff.operatorCommandExecutionPlanSummary.uniqueCommandCount
      + ', duplicates='
      + handoff.operatorCommandExecutionPlanSummary.duplicateCommandCount
      + ', blocked='
      + handoff.operatorCommandExecutionPlanSummary.blockedCommandCount
      + ', deferred='
      + handoff.operatorCommandExecutionPlanSummary.deferredCommandCount
      + ', read_only='
      + handoff.operatorCommandExecutionPlanSummary.readOnlyEvidenceCommandCount
      + ', guarded='
      + handoff.operatorCommandExecutionPlanSummary.guardedWriteOrLiveCommandCount
      + ', manual_prerequisite='
      + handoff.operatorCommandExecutionPlanSummary.manualPrerequisiteCommandCount,
    '- Operator command execution queues: read_only='
      + handoff.operatorCommandExecutionQueueSummary.readOnlyEvidenceCommandCount
      + ', manual_prerequisite='
      + handoff.operatorCommandExecutionQueueSummary.manualPrerequisiteCommandCount
      + ', guarded='
      + handoff.operatorCommandExecutionQueueSummary.guardedWriteOrLiveCommandCount
      + ', auto_allowed='
      + handoff.operatorCommandExecutionQueueSummary.autoRunAllowedCommandCount
      + ', auto_forbidden='
      + handoff.operatorCommandExecutionQueueSummary.autoRunForbiddenCommandCount,
    '- Compact action items: ' + (handoff.compactActionItems?.length ?? 0),
    renderDefaultMasterPlanSourceInputSummary(handoff.sourceInputSummary),
    '- Source: ' + handoff.sourcePath,
    '- Action groups: ' + handoff.actionGroupCount,
    '- Blocked action groups: ' + handoff.blockedActionGroupCount,
    '- Deferred action groups: ' + handoff.deferredActionGroupCount,
    '- Mutation boundary: ' + handoff.mutationBoundary,
    '',
  ];

  if (!handoff.actionGroups?.length) {
    for (const blocker of arrayOfStrings(handoff.blockers)) {
      lines.push('- blocker: ' + blocker);
    }
    lines.push('- No action groups available.');
    return lines;
  }

  for (const entry of handoff.blockedGateActionCoverage ?? []) {
    const gateId = entry.gateId || 'unknown';
    const coveredBy = entry.coveredByActionGroupIds.length
      ? entry.coveredByActionGroupIds.join(', ')
      : 'uncovered';
    lines.push('- blocked_gate_action_coverage: ' + gateId + ' -> ' + coveredBy);
    for (const blocker of entry.uncoveredBlockers) {
      lines.push('- blocked_gate_uncovered_blocker: ' + gateId + ' | ' + blocker);
    }
  }
  for (const value of handoff.operatorUnblockRequirementSummary.envUnlockVariables) {
    lines.push('- operator_unblock_env_unlock: ' + value);
  }
  for (const value of handoff.operatorUnblockRequirementSummary.requiredFlags) {
    lines.push('- operator_unblock_required_flag: ' + value);
  }
  for (const value of handoff.operatorUnblockRequirementSummary.operatorFields) {
    lines.push('- operator_unblock_operator_field: ' + value);
  }
  for (const value of handoff.operatorUnblockRequirementSummary.evidenceInputArtifacts) {
    lines.push('- operator_unblock_evidence_input: ' + value);
  }
  for (const value of handoff.operatorUnblockRequirementSummary.requiredEnvironmentTargets) {
    lines.push('- operator_unblock_environment_target: ' + value);
  }
  for (const value of handoff.operatorUnblockRequirementSummary.verificationCommands) {
    lines.push('- operator_unblock_verification_command: ' + value);
  }
  for (const value of handoff.operatorUnblockRequirementSummary.repairRequiredStepIds) {
    lines.push('- operator_unblock_repair_required_step: ' + value);
  }
  for (const value of handoff.operatorUnblockRequirementSummary.dbRepairRequiredStepIds) {
    lines.push('- operator_unblock_db_repair_required_step: ' + value);
  }
  for (const value of handoff.operatorUnblockRequirementSummary.blockedPlanStepIds) {
    lines.push('- operator_unblock_blocked_plan_step: ' + value);
  }
  for (const entry of handoff.compactActionItems ?? []) {
    lines.push('- compact_action_item: ' + entry.priority + ' | ' + entry.status + ' | ' + entry.actionGroupId);
    lines.push('- compact_action_item_gates: ' + entry.actionGroupId + ' | ' + (entry.coveredGateIds.length ? entry.coveredGateIds.join(', ') : 'none'));
    if (entry.nextAction) lines.push('- compact_action_item_next_action: ' + entry.actionGroupId + ' | ' + entry.nextAction);
    lines.push('- compact_action_item_commands: ' + entry.actionGroupId + ' | read_only=' + entry.commandCounts.readOnlyEvidence + ', manual_prerequisite=' + entry.commandCounts.manualPrerequisite + ', guarded=' + entry.commandCounts.guardedWriteOrLive);
    if (entry.envUnlockVariables.length) lines.push('- compact_action_item_env_unlocks: ' + entry.actionGroupId + ' | ' + entry.envUnlockVariables.join(', '));
    if (entry.requiredFlags.length) lines.push('- compact_action_item_required_flags: ' + entry.actionGroupId + ' | ' + entry.requiredFlags.join(', '));
    if (entry.operatorFields.length) lines.push('- compact_action_item_operator_fields: ' + entry.actionGroupId + ' | ' + entry.operatorFields.join(', '));
    if (entry.evidenceInputArtifacts.length) lines.push('- compact_action_item_evidence_inputs: ' + entry.actionGroupId + ' | ' + entry.evidenceInputArtifacts.join(', '));
    if (entry.requiredEnvironmentTargets.length) lines.push('- compact_action_item_environment_targets: ' + entry.actionGroupId + ' | ' + entry.requiredEnvironmentTargets.join(', '));
    if (entry.blockers.length) lines.push('- compact_action_item_blockers: ' + entry.actionGroupId + ' | ' + entry.blockers.join(', '));
  }
  for (const entry of handoff.operatorCommandPlan ?? []) {
    lines.push('- operator_command_plan: ' + entry.actionGroupId + ' | ' + entry.executionReadiness + ' | ' + entry.commandKind + ' | ' + entry.command);
  }
  for (const entry of handoff.operatorCommandExecutionPlan ?? []) {
    const actionGroups = entry.actionGroupIds?.length ? entry.actionGroupIds.join(', ') : 'unknown';
    const commandSources = entry.commandSources?.length ? entry.commandSources.join(', ') : 'unknown';
    lines.push('- operator_command_execution_plan: ' + entry.executionReadiness + ' | ' + entry.commandKind + ' | dup=' + entry.duplicateCount + ' | ' + entry.command);
    lines.push('- operator_command_execution_action_groups: ' + actionGroups);
    lines.push('- operator_command_execution_sources: ' + commandSources);
  }
  for (const entries of Object.values(handoff.operatorCommandExecutionQueues ?? {})) {
    for (const entry of entries ?? []) {
      lines.push('- operator_command_execution_queue: ' + entry.queueId + ' | ' + (entry.autoRunAllowed ? 'auto' : 'manual') + ' | ' + entry.command);
    }
  }
  lines.push('');

  for (const group of handoff.actionGroups) {
    lines.push('### ' + group.priority + '. ' + group.id + ' [' + group.status + ']');
    if (group.nextAction) lines.push('- Next action: ' + group.nextAction);
    lines.push(...group.blockedBy.map((blocker) => '- blocked_by: ' + blocker));
    lines.push(...group.deferredBy.map((blocker) => '- deferred_by: ' + blocker));
    lines.push('- requirement_actions: ' + group.requirementSummary.actionCount);
    lines.push('- requirement_env_unlocks: ' + group.requirementSummary.envUnlockCount);
    lines.push('- requirement_flags: ' + group.requirementSummary.requiredFlagCount);
    lines.push('- requirement_operator_fields: ' + group.requirementSummary.operatorFieldCount);
    lines.push('- requirement_evidence_inputs: ' + group.requirementSummary.evidenceInputCount);
    lines.push('- requirement_environment_targets: ' + group.requirementSummary.environmentTargetCount);
    lines.push('- requirement_verification_commands: ' + group.requirementSummary.verificationCommandCount);
    for (const requirement of group.operatorRequirements) {
      const actionId = requirement.actionId || 'unknown';
      lines.push('- operator_requirement_action: ' + actionId + ' | ' + (requirement.gate || 'unknown'));
      const next = requirement.nextRequirements && typeof requirement.nextRequirements === 'object'
        ? requirement.nextRequirements
        : {};
      for (const item of Array.isArray(next.envUnlocks) ? next.envUnlocks : []) {
        const variable = String(item?.variable ?? '').trim() || 'unknown';
        const value = String(item?.value ?? '').trim();
        lines.push('- operator_requirement_env_unlock: ' + actionId + ' | ' + variable + (value ? '=' + value : ''));
      }
      for (const item of Array.isArray(next.requiredFlags) ? next.requiredFlags : []) {
        const flag = String(item?.flag ?? '').trim() || 'unknown';
        const value = String(item?.value ?? '').trim();
        lines.push('- operator_requirement_flag: ' + actionId + ' | ' + flag + (value ? '=' + value : ''));
      }
      for (const item of Array.isArray(next.operatorFields) ? next.operatorFields : []) {
        lines.push('- operator_requirement_operator_field: ' + actionId + ' | ' + (String(item?.field ?? '').trim() || 'unknown'));
      }
      for (const item of Array.isArray(next.evidenceInputs) ? next.evidenceInputs : []) {
        lines.push('- operator_requirement_evidence_input: ' + actionId + ' | ' + (String(item?.artifact ?? '').trim() || 'unknown') + ' => ' + (String(item?.requiredStatus ?? '').trim() || 'unknown'));
      }
      for (const item of Array.isArray(next.requiredEnvironmentTargets) ? next.requiredEnvironmentTargets : []) {
        lines.push('- operator_requirement_environment_target: ' + actionId + ' | ' + (String(item?.target ?? '').trim() || 'unknown'));
      }
      for (const command of arrayOfStrings(next.verificationCommands)) {
        lines.push('- operator_requirement_verification_command: ' + actionId + ' | ' + command);
      }
    }
    lines.push(...renderDefaultMasterPlanActionPlan('repair', group.repairPlan));
    lines.push(...renderDefaultMasterPlanActionPlan('db_repair', group.dbRepairPlan));
    lines.push(...renderDefaultMasterPlanActionPlan('execution_gate', group.executionGatePlan));
    lines.push(...renderDefaultMasterPlanMaterializationReadinessPlan(group.materializationReadinessPlan));
    lines.push(...renderDefaultMasterPlanDurationAlignmentPlan(group.durationAlignmentPlan));
    lines.push(...renderDefaultMasterPlanProductionOutcomePlan(group.productionOutcomePlan));
    lines.push('');
  }

  return lines;
}

function renderDefaultMasterPlanActionPlan(prefix, plan) {
  if (!plan) return [];

  const lines = [
    '- ' + prefix + '_plan_status: ' + plan.status,
  ];

  if (plan.failureClass) {
    lines.push('- ' + prefix + '_failure_class: ' + plan.failureClass);
  }
  if (plan.targetClass) {
    lines.push('- ' + prefix + '_target_class: ' + plan.targetClass);
  }
  if (plan.noAutoInstall) {
    lines.push('- ' + prefix + '_no_auto_install: yes');
  }
  if (plan.noAutoCredentialRotation) {
    lines.push('- ' + prefix + '_no_auto_credential_rotation: yes');
  }
  if (plan.noAutoExecution) {
    lines.push('- ' + prefix + '_no_auto_execution: yes');
  }
  if (plan.requiredStepIds.length) {
    lines.push('- ' + prefix + '_required_steps: ' + plan.requiredStepIds.join(', '));
  }
  if (plan.blockedStepIds.length) {
    lines.push('- ' + prefix + '_blocked_steps: ' + plan.blockedStepIds.join(', '));
  }
  lines.push('- ' + prefix + '_ordered_step_count: ' + plan.orderedStepCount);

  for (const step of plan.orderedSteps) {
    const stepLabel = step.id || 'unknown';
    lines.push('- ' + prefix + '_step: ' + stepLabel + ' | ' + step.status);
    if (step.blockerCodes.length) {
      lines.push('- ' + prefix + '_step_blockers: ' + stepLabel + ' | ' + step.blockerCodes.join(', '));
    }
    if (step.title) {
      lines.push('- ' + prefix + '_step_title: ' + stepLabel + ' | ' + step.title);
    }
    for (const command of step.commands) {
      lines.push('- ' + prefix + '_step_command: ' + stepLabel + ' | ' + command);
    }
    for (const command of step.verificationCommands) {
      lines.push('- ' + prefix + '_step_verification_command: ' + stepLabel + ' | ' + command);
    }
    for (const note of step.notes) {
      lines.push('- ' + prefix + '_step_note: ' + stepLabel + ' | ' + note);
    }
  }

  return lines;
}

function renderDefaultMasterPlanMaterializationReadinessPlan(plan) {
  if (!plan) return [];

  const lines = [
    '- materialization_readiness_plan_status: ' + plan.status,
    '- materialization_readiness_command_ready: ' + (plan.materializationCommandReady ? 'yes' : 'no'),
    '- materialization_readiness_unlock_variable: ' + (plan.unlockVariable || 'missing'),
    '- materialization_readiness_unlock_present: ' + (plan.unlockPresent ? 'yes' : 'no'),
    '- materialization_readiness_execute_ready: ' + (plan.executeReady ? 'yes' : 'no'),
    '- materialization_readiness_operator_must_run_manually: ' + (plan.operatorMustRunManually ? 'yes' : 'no'),
    '- materialization_readiness_does_not_connect_database: ' + (plan.doesNotConnectDatabase ? 'yes' : 'no'),
    '- materialization_readiness_commands_executed: ' + plan.commandsExecuted,
  ];

  for (const blocker of plan.blockers) {
    lines.push('- materialization_readiness_blocker: ' + blocker);
  }

  for (const [key, command] of Object.entries(plan.nextCommands ?? {})) {
    if (String(command ?? '').trim()) {
      lines.push('- materialization_next_command: ' + key + ' | ' + command);
    }
  }

  return lines;
}

function renderDefaultMasterPlanDurationAlignmentPlan(plan) {
  if (!plan) return [];

  const completedTaskExport = objectValue(plan.completedTaskExport);
  const runtimeCandidateAlignment = objectValue(plan.runtimeCandidateAlignment);
  const runtimeTaskAlignmentRefreshPackage = objectValue(plan.runtimeTaskAlignmentRefreshPackage);
  const realDurationSampleMaterialPreflight = objectValue(plan.realDurationSampleMaterialPreflight);
  const lines = [];

  if (Object.keys(completedTaskExport).length) {
    lines.push('- duration_alignment_completed_task_export_required_stable_codes: ' + completedTaskExport.requiredStableCodeCount);
    lines.push('- duration_alignment_completed_task_export_exported_tasks: ' + completedTaskExport.exportedTaskCount);
    lines.push('- duration_alignment_completed_task_export_invalid_tasks: ' + completedTaskExport.invalidTaskCount);
    lines.push('- duration_alignment_completed_task_export_missing_stable_codes: ' + completedTaskExport.missingStableCodeCount);
    for (const stableCode of arrayOfStrings(completedTaskExport.missingStableCodes)) {
      lines.push('- duration_alignment_completed_task_export_missing_stable_code: ' + stableCode);
    }
    for (const example of arrayOfObjects(completedTaskExport.invalidTaskExamples)) {
      lines.push('- duration_alignment_completed_task_invalid_example: '
        + (example.stableCode || 'unknown')
        + ' | '
        + (example.recommendedAction || 'unknown'));
    }
  }

  if (Object.keys(runtimeCandidateAlignment).length) {
    lines.push('- duration_alignment_runtime_candidate_rows: ' + runtimeCandidateAlignment.candidateRowCount);
    lines.push('- duration_alignment_runtime_tasks: ' + runtimeCandidateAlignment.runtimeTaskCount);
    lines.push('- duration_alignment_runtime_candidate_missing_runtime_tasks: ' + runtimeCandidateAlignment.missingRuntimeTaskCount);
    lines.push('- duration_alignment_runtime_candidate_title_mismatches: ' + runtimeCandidateAlignment.titleMismatchCount);
    lines.push('- duration_alignment_runtime_candidate_actual_date_missing_rows: ' + runtimeCandidateAlignment.rowsMissingActualDateRangeCount);
    for (const example of arrayOfObjects(runtimeCandidateAlignment.driftExamples)) {
      lines.push('- duration_alignment_runtime_candidate_drift_example: '
        + (example.stableCode || 'unknown')
        + ' | '
        + (example.alignmentStatus || 'unknown')
        + ' | '
        + (example.recommendedAction || 'unknown'));
    }
  }

  if (Object.keys(runtimeTaskAlignmentRefreshPackage).length) {
    lines.push('- duration_alignment_refresh_package_status: ' + (runtimeTaskAlignmentRefreshPackage.status || 'unknown'));
    lines.push('- duration_alignment_refresh_package_actions: ' + runtimeTaskAlignmentRefreshPackage.actionCount);
    lines.push('- duration_alignment_refresh_package_stable_code_review_actions: ' + runtimeTaskAlignmentRefreshPackage.stableCodeRefreshReviewActionCount);
    lines.push('- duration_alignment_refresh_package_missing_runtime_task_actions: ' + runtimeTaskAlignmentRefreshPackage.missingRuntimeTaskActionCount);
    lines.push('- duration_alignment_refresh_package_actual_date_collection_actions: ' + runtimeTaskAlignmentRefreshPackage.actualDateRangeCollectionActionCount);
    lines.push('- duration_alignment_refresh_package_execute_allowed: ' + (runtimeTaskAlignmentRefreshPackage.executeAllowed ? 'yes' : 'no'));
    for (const example of arrayOfObjects(runtimeTaskAlignmentRefreshPackage.actionExamples)) {
      lines.push('- duration_alignment_refresh_package_action_example: '
        + (example.stableCode || 'unknown')
        + ' | '
        + (example.actionKind || 'unknown')
        + ' | '
        + (example.proposedStableCode || 'none'));
    }
  }

  if (Object.keys(realDurationSampleMaterialPreflight).length) {
    lines.push('- duration_alignment_sample_preflight_status: ' + (realDurationSampleMaterialPreflight.status || 'unknown'));
    lines.push('- duration_alignment_sample_preflight_checked_by: ' + (realDurationSampleMaterialPreflight.checkedBy || 'missing'));
    lines.push('- duration_alignment_sample_preflight_required_stable_codes: ' + realDurationSampleMaterialPreflight.requiredStableCodeCount);
    lines.push('- duration_alignment_sample_preflight_ready_stable_codes: ' + realDurationSampleMaterialPreflight.readyStableCodeCount);
    lines.push('- duration_alignment_sample_preflight_missing_stable_codes: ' + realDurationSampleMaterialPreflight.missingStableCodeCount);
    lines.push('- duration_alignment_sample_preflight_writes_duration_samples: ' + (realDurationSampleMaterialPreflight.writesDurationSamples ? 'yes' : 'no'));
    lines.push('- duration_alignment_sample_preflight_writes_runtime_publication: ' + (realDurationSampleMaterialPreflight.writesRuntimePublication ? 'yes' : 'no'));
    for (const blocker of arrayOfStrings(realDurationSampleMaterialPreflight.blockers)) {
      lines.push('- duration_alignment_sample_preflight_blocker: ' + blocker);
    }
    for (const target of arrayOfObjects(realDurationSampleMaterialPreflight.nextSampleCollectionTargets)) {
      lines.push('- duration_alignment_next_sample_target: '
        + target.priority
        + ' | '
        + (target.businessType || 'unknown')
        + ' | '
        + (target.stableCode || 'unknown')
        + ' | '
        + target.missingSampleCount
        + ' missing');
    }
    for (const sample of arrayOfObjects(realDurationSampleMaterialPreflight.readySampleExamples)) {
      lines.push('- duration_alignment_ready_sample: '
        + (sample.stableCode || 'unknown')
        + ' | '
        + sample.readySampleCount
        + ' ready');
    }
  }

  return lines;
}

function renderDefaultMasterPlanProductionOutcomePlan(plan) {
  if (!plan) return [];

  const realProductionOutcomePackage = objectValue(plan.realProductionOutcomePackage);
  const operatorHandoff = objectValue(plan.operatorHandoff);
  const lines = [];

  if (Object.keys(realProductionOutcomePackage).length) {
    lines.push('- production_outcome_package_status: ' + (realProductionOutcomePackage.status || 'unknown'));
    lines.push('- production_outcome_target_environment: ' + (realProductionOutcomePackage.targetEnvironment || 'unknown'));
    lines.push('- production_outcome_real_outcome_path: ' + (realProductionOutcomePackage.realProductionOutcomePath || 'missing'));
    lines.push('- production_outcome_required_field_count: ' + realProductionOutcomePackage.requiredFieldCount);
    for (const field of arrayOfStrings(realProductionOutcomePackage.requiredFields)) {
      lines.push('- production_outcome_required_field: ' + field);
    }
    for (const blocker of arrayOfStrings(realProductionOutcomePackage.blockers)) {
      lines.push('- production_outcome_package_blocker: ' + blocker);
    }
    for (const blocker of arrayOfStrings(realProductionOutcomePackage.validationBlockers)) {
      lines.push('- production_outcome_validation_blocker: ' + blocker);
    }
  }

  if (Object.keys(operatorHandoff).length) {
    lines.push('- production_outcome_source_export_mode: ' + (operatorHandoff.sourceExportMode || 'unknown'));
    lines.push('- production_outcome_may_run_supporting_source_export: ' + (operatorHandoff.mayRunSupportingSourceExport ? 'yes' : 'no'));
    lines.push('- production_outcome_may_run_production_source_export: ' + (operatorHandoff.mayRunProductionSourceExport ? 'yes' : 'no'));
    lines.push('- production_outcome_may_run_source_export: ' + (operatorHandoff.mayRunSourceExport ? 'yes' : 'no'));
    lines.push('- production_outcome_may_accept_real_outcome: ' + (operatorHandoff.mayAcceptRealProductionOutcomeEvidence ? 'yes' : 'no'));
    lines.push('- production_outcome_may_run_production_evidence_pipeline: ' + (operatorHandoff.mayRunProductionEvidencePipeline ? 'yes' : 'no'));
    for (const blocker of arrayOfStrings(operatorHandoff.productionSourceExportBlockers)) {
      lines.push('- production_outcome_source_export_blocker: ' + blocker);
    }
    for (const blocker of arrayOfStrings(operatorHandoff.realProductionOutcomeEvidenceBlockers)) {
      lines.push('- production_outcome_real_outcome_evidence_blocker: ' + blocker);
    }
    for (const actionId of arrayOfStrings(operatorHandoff.blockedActionIds)) {
      lines.push('- production_outcome_blocked_action: ' + actionId);
    }
    for (const actionId of arrayOfStrings(operatorHandoff.deferredActionIds)) {
      lines.push('- production_outcome_deferred_action: ' + actionId);
    }
    for (const actionId of arrayOfStrings(operatorHandoff.runnableActionIds)) {
      lines.push('- production_outcome_runnable_action: ' + actionId);
    }
  }

  for (const blocker of arrayOfStrings(plan.productionReadinessBlockers)) {
    lines.push('- production_outcome_readiness_blocker: ' + blocker);
  }

  return lines;
}

function renderDefaultMasterPlanSourceInputSummary(sourceInputSummary) {
  if (!sourceInputSummary || sourceInputSummary.total <= 0) {
    return '- Source input coverage: not available';
  }

  return '- Source input coverage: '
    + sourceInputSummary.present
    + '/'
    + sourceInputSummary.total
    + ' (hashed '
    + sourceInputSummary.hashed
    + ', missing '
    + sourceInputSummary.missing
    + ', ready '
    + (sourceInputSummary.ready ? 'yes' : 'no')
    + ')';
}

function renderToolReadiness(toolReadiness) {
  if (!toolReadiness) {
    return [];
  }

  return [
    '## Tool Readiness',
    '',
    '| Tool | Layer | Status | Evidence policy |',
    '| --- | --- | --- | --- |',
    ...toolReadiness.tools.map((tool) => `| ${tool.id} | ${tool.layer} | ${tool.status} | ${tool.releaseEvidencePolicy} |`),
    '',
    '### Tool Boundary',
    '',
    ...toolReadiness.boundary.map((item) => `- ${item}`),
  ];
}

function renderObjectEntries(value, prefix = '') {
  return Object.entries(value).flatMap(([key, item]) => {
    const label = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(item)) {
      return [`- ${label}: ${item.join(', ')}`];
    }

    if (item && typeof item === 'object') {
      return renderObjectEntries(item, label);
    }

    return [`- ${label}: ${String(item)}`];
  });
}

function escapePipes(text) {
  return text.replaceAll('|', '\\|');
}

function tailText(text, maxLength = 8000) {
  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(text.length - maxLength);
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/run-release-dashboard.mjs --profile smoke --dry-run

Profiles:
  smoke          Fast local static/readiness slice
  release-local  All ready local static, browser, deterministic, and tooling gates
  local-deterministic
                 Non-live deterministic gates and readiness checks
  uiux           UIUX local browser gates
  tool-readiness Read-only Phase 4 testing tool inventory and boundary check
  solo-live      Personal real-environment readiness; requires --include-solo-live --confirm-solo-live-owner
  live           Live-only gates; requires --include-live --confirm-live-handoff
  db             DB-dependent gates; requires --include-db --confirm-db-ready

Options:
  --dry-run                  Write a plan report without executing commands
  --report-root <path>       Override report output root
  --matrix <path>            Override matrix file path
  --default-master-plan-gap-summary <path>
                            Override default master-plan real evidence gap summary input
  --include-live             Allow live profile selection
  --confirm-live-handoff     Confirm live environment ownership handoff
  --include-solo-live        Allow personal solo-live profile selection
  --confirm-solo-live-owner  Confirm the personal operator owns monitoring and rollback refs
  --include-db               Allow DB profile selection
  --confirm-db-ready         Confirm DB recovery or safe test DB readiness
`.trim();
}

async function main() {
  try {
    const result = await runDashboard();

    if (result.help) {
      console.log(result.help);
    } else {
      console.log(`Release dashboard report: ${result.reportDir}`);
      console.log(`Profile: ${result.summary.profile}`);
      console.log(`Dry run: ${result.summary.dryRun ? 'yes' : 'no'}`);
      console.log(`Selected gates: ${result.summary.statusCounts.selected}`);
      console.log(`Executed commands: ${result.summary.statusCounts.commandsExecuted}`);
      console.log(`Failed commands: ${result.summary.statusCounts.commandsFailed}`);
    }

    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
