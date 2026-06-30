#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkReleaseHandoffReadiness,
  writeHandoffReadinessReport,
} from './check-release-handoff-readiness.mjs';
import {
  summarizeReleaseCloseoutStatus,
  writeStatusIndex,
} from './summarize-release-closeout-status.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_GATE_IDS = [
  'c18-l07-l15-live-diagnostics',
  'c15-live-learning-closeout',
  'c19-runtime-publication-release-rollback',
  'old-object-physical-drop-closeout',
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    productionEnvRef: 'deploy/env/server.production.env',
    outputRoot: null,
    baseUrl: '',
    projectId: '',
    planId: '',
    companyId: '',
    candidateId: '',
    sampleCohortRef: '',
    phase1L5Ref: '',
    releaseClosureArtifactRef: '',
    rollbackTargetRef: '',
    monitoringWindow: '',
    approvalRef: '',
    operator: 'production-closeout-operator',
    gateIds: [],
    serverSignalsFile: '',
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

    if (arg === '--production-env-ref') {
      options.productionEnvRef = nextValue();
    } else if (arg === '--env-file') {
      throw new Error('--env-file conflicts with the Node.js runtime option; use --production-env-ref instead');
    } else if (arg === '--output-root') {
      options.outputRoot = nextValue();
    } else if (arg === '--base-url') {
      options.baseUrl = nextValue();
    } else if (arg === '--project-id') {
      options.projectId = nextValue();
    } else if (arg === '--plan-id') {
      options.planId = nextValue();
    } else if (arg === '--company-id') {
      options.companyId = nextValue();
    } else if (arg === '--candidate-id') {
      options.candidateId = nextValue();
    } else if (arg === '--sample-cohort-ref') {
      options.sampleCohortRef = nextValue();
    } else if (arg === '--phase1-l5-ref') {
      options.phase1L5Ref = nextValue();
    } else if (arg === '--release-closure-artifact-ref') {
      options.releaseClosureArtifactRef = nextValue();
    } else if (arg === '--rollback-target-ref') {
      options.rollbackTargetRef = nextValue();
    } else if (arg === '--monitoring-window') {
      options.monitoringWindow = nextValue();
    } else if (arg === '--approval-ref') {
      options.approvalRef = nextValue();
    } else if (arg === '--operator') {
      options.operator = nextValue();
    } else if (arg === '--gate') {
      options.gateIds.push(nextValue());
    } else if (arg === '--server-signals-file') {
      options.serverSignalsFile = nextValue();
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.outputRoot) {
    throw new Error('--output-root is required');
  }

  return options;
}

export async function prepareProductionCloseoutReadiness(options = {}) {
  const outputRoot = path.resolve(REPO_ROOT, options.outputRoot);
  const serverSignals = options.serverSignalsFile ? await readServerSignals(options.serverSignalsFile) : null;
  const envFile = normalizeProductionEnvRef(options.productionEnvRef, serverSignals);
  const artifactRoot = normalizeRepoPath(path.join(options.outputRoot, 'artifacts'));
  const databaseTargetRef = resolveDatabaseTargetRef(envFile, serverSignals);
  const operator = options.operator || 'production-closeout-operator';
  const approvalRef = options.approvalRef || `github-actions://${process.env.GITHUB_RUN_ID || 'manual-run'}`;
  const sampleCohortRef = options.sampleCohortRef || `${artifactRoot}/c15-sample-cohort-readback.json`;
  const phase1L5Ref = options.phase1L5Ref || `${artifactRoot}/phase1-l5-handoff.json`;
  const releaseClosureArtifactRef = options.releaseClosureArtifactRef || `${artifactRoot}/c19-release-closure-artifact.json`;
  const rollbackTargetRef = options.rollbackTargetRef || `${artifactRoot}/c19-runtime-rollback-target.json`;
  const monitoringWindow = options.monitoringWindow || 'production-observation-window-required';
  const selectedGateIds = normalizeGateIds(options.gateIds);
  const notSelectedGateIds = DEFAULT_GATE_IDS.filter((gateId) => !selectedGateIds.includes(gateId));

  await mkdir(outputRoot, { recursive: true });

  const handoff = {
    schemaVersion: 'workbuddy-release-handoff-input/v1',
    generatedAt: new Date().toISOString(),
    source: 'github-actions-production-closeout-readiness',
    boundary: {
      secretsEmbedded: false,
      envFileUploaded: false,
      serverSideDiscovery: Boolean(serverSignals),
      readinessOnly: true,
      liveOrDbCommandsExecuted: 0,
    },
    unlockFlags: {
      includeLive: true,
      confirmLiveHandoff: true,
      includeDb: true,
      confirmDbReady: true,
    },
    gateSelection: {
      selectedGateIds,
      notSelectedGateIds,
      note: 'Readiness is evaluated only for selected gates. Not-selected gates are not marked ready and still require a separate handoff/readiness run before live or DB execution.',
    },
    envPresence: null,
    gates: {
      'c18-l07-l15-live-diagnostics': {
        live: {
          baseUrl: options.baseUrl,
          authTokenRef: `env://${envFile}#SUPABASE_SERVICE_KEY`,
          environmentOwner: operator,
          writeApprovalRef: approvalRef,
          cleanupOwner: operator,
          artifactRoot,
        },
        targets: {
          projectId: options.projectId,
          planId: options.planId,
        },
        evidenceOwners: {
          backendDiagnosticsOwner: operator,
          databaseEvidenceOwner: operator,
          browserEvidenceOwner: operator,
        },
      },
      'c15-live-learning-closeout': {
        live: {
          environmentOwner: operator,
          writeApprovalRef: approvalRef,
          artifactRoot,
        },
        targets: {
          companyId: options.companyId,
          projectId: options.projectId,
          candidateId: options.candidateId,
          sampleCohortRef,
        },
        approvals: {
          manualApprovalRef: approvalRef,
        },
        owners: {
          monitoringOwner: operator,
          rollbackOwner: operator,
        },
        evidenceOwners: {
          learningLoopOwner: operator,
          databaseEvidenceOwner: operator,
        },
      },
      'c19-runtime-publication-release-rollback': {
        live: {
          environmentOwner: operator,
          writeApprovalRef: approvalRef,
          artifactRoot,
        },
        targets: {
          companyId: options.companyId,
          projectId: options.projectId,
        },
        release: {
          phase1L5Ref,
          releaseClosureArtifactRef,
          rollbackTargetRef,
          monitoringWindow,
        },
        approvals: {
          manualApprovalRef: approvalRef,
        },
        owners: {
          runtimePublicationOwner: operator,
          consumerObservationOwner: operator,
          monitoringOwner: operator,
          rollbackOwner: operator,
        },
      },
      'old-object-physical-drop-closeout': {
        db: {
          databaseTargetRef,
          databaseReadinessOwner: operator,
          noSafeCandidateCloseoutRef: `${artifactRoot}/old-object-no-safe-candidate-closeout.json`,
          backupLocationRef: `${artifactRoot}/db-backup-reference.json`,
          catalogReadbackOwner: operator,
          apiBrowserSmokeOwner: operator,
        },
        approvals: {
          manualApprovalRef: approvalRef,
        },
        owners: {
          migrationOwner: operator,
          rollbackOwner: operator,
          postDropSmokeOwner: operator,
        },
      },
    },
  };

  const handoffPath = path.join(outputRoot, 'production-handoff.generated.json');
  const readinessPath = path.join(outputRoot, 'handoff-readiness.json');
  const statusPath = path.join(outputRoot, 'closeout-status-index.json');
  const selectionPath = path.join(outputRoot, 'production-gate-selection.generated.json');
  const envInventory = await buildEnvInventory(envFile, { serverSignals });
  handoff.envPresence = buildHandoffEnvPresence(envInventory);
  await writeFile(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');
  await writeFile(selectionPath, `${JSON.stringify(handoff.gateSelection, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outputRoot, 'env-key-readiness.json'), `${JSON.stringify(envInventory, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outputRoot, 'env-key-readiness.md'), renderEnvInventoryMarkdown(envInventory), 'utf8');

  const readiness = await checkReleaseHandoffReadiness({
    handoffFile: handoffPath,
    gateIds: selectedGateIds,
  });
  const readinessOutputs = await writeHandoffReadinessReport({
    report: readiness,
    outputPath: readinessPath,
  });
  const statusIndex = await summarizeReleaseCloseoutStatus({
    reportRoot: path.resolve(REPO_ROOT, 'project-testing/reports'),
    handoffReadinessPath: readinessOutputs.jsonPath,
  });
  const statusOutputs = await writeStatusIndex({
    index: statusIndex,
    outputPath: statusPath,
  });

  await writeFile(path.join(outputRoot, 'production-closeout-readiness-summary.json'), `${JSON.stringify({
    schemaVersion: 'workbuddy-production-closeout-readiness-summary/v1',
    generatedAt: new Date().toISOString(),
    status: readiness.status,
    readyToRun: readiness.readyToRun,
    blockedGateCount: readiness.blockedGateCount,
    secretLeakCount: readiness.secretLeakCount,
    refIssueCount: readiness.refIssueCount,
    envMissingRequiredKeys: envInventory.missingRequiredKeys,
    envMissingRecommendedKeys: envInventory.missingRecommendedKeys,
    handoffFile: normalizeRepoPath(handoffPath),
    readinessFile: normalizeRepoPath(readinessOutputs.jsonPath),
    statusFile: normalizeRepoPath(statusOutputs.jsonPath),
    selectedGateIds,
    notSelectedGateIds,
    gateSelectionFile: normalizeRepoPath(selectionPath),
    serverSignalsFile: serverSignals ? normalizeRepoPath(options.serverSignalsFile) : '',
    boundary: handoff.boundary,
  }, null, 2)}\n`, 'utf8');

  return {
    handoffPath,
    readinessPath: readinessOutputs.jsonPath,
    statusPath: statusOutputs.jsonPath,
    selectionPath,
    readiness,
  };
}

function normalizeGateIds(gateIds = []) {
  const selected = [];
  for (const gateId of gateIds.length > 0 ? gateIds : DEFAULT_GATE_IDS) {
    const normalized = String(gateId ?? '').trim();
    if (!normalized) continue;
    if (!DEFAULT_GATE_IDS.includes(normalized)) {
      throw new Error(`Unknown gate: ${normalized}`);
    }
    if (!selected.includes(normalized)) {
      selected.push(normalized);
    }
  }
  if (selected.length === 0) {
    throw new Error('At least one --gate is required when gate selection is provided');
  }
  return selected;
}

async function readServerSignals(serverSignalsFile) {
  const raw = await readFile(path.resolve(REPO_ROOT, serverSignalsFile), 'utf8');
  return JSON.parse(raw);
}

function normalizeProductionEnvRef(productionEnvRef, serverSignals) {
  const fromSignals = normalizeEnvFileRef(serverSignals?.envFileRef);
  return fromSignals || normalizeRepoPath(productionEnvRef || 'deploy/env/server.production.env');
}

function normalizeEnvFileRef(envFileRef) {
  const raw = String(envFileRef ?? '').trim();
  if (!raw) return '';
  return raw.replace(/^path:\/\//u, '').replaceAll('\\', '/').replace(/^\/+/u, '');
}

function resolveDatabaseTargetRef(envFile, serverSignals) {
  const fromSignals = String(serverSignals?.connectivity?.db?.databaseTargetRef ?? '').trim();
  if (fromSignals.startsWith('env://')) return fromSignals;
  const status = serverSignals?.envPresence ?? {};
  if (normalizeServerEnvPresence(status.SUPABASE_MIGRATION_URL).nonEmpty) {
    return `env://${envFile}#SUPABASE_MIGRATION_URL`;
  }
  return `env://${envFile}#DB_CONNECTION_STRING`;
}

async function buildEnvInventory(envFile, { serverSignals = null } = {}) {
  const requiredKeys = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_KEY',
    'DB_CONNECTION_STRING',
    'JWT_SECRET',
  ];
  const recommendedKeys = [
    'SUPABASE_MIGRATION_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DIRECT_DATABASE_URL',
    'DATABASE_URL',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
  ];
  const source = serverSignals ? 'server-side-sanitized-signals' : 'repo-env-file';
  const envFilePath = path.resolve(REPO_ROOT, envFile);
  const env = serverSignals ? null : parseEnvFile(await readFile(envFilePath, 'utf8'));
  const keyStatus = Object.fromEntries([...requiredKeys, ...recommendedKeys].map((key) => [
    key,
    serverSignals
      ? normalizeServerEnvPresence(serverSignals.envPresence?.[key])
      : {
          present: Object.prototype.hasOwnProperty.call(env, key),
          nonEmpty: String(env[key] ?? '').trim().length > 0,
        },
  ]));

  return {
    schemaVersion: 'workbuddy-production-env-key-readiness/v1',
    generatedAt: new Date().toISOString(),
    source,
    envFile,
    requiredKeys,
    recommendedKeys,
    keyStatus,
    missingRequiredKeys: requiredKeys.filter((key) => !keyStatus[key].nonEmpty),
    missingRecommendedKeys: recommendedKeys.filter((key) => !keyStatus[key].nonEmpty),
    boundary: {
      valuesIncluded: false,
      valuesPrinted: false,
      serverSideDiscovery: Boolean(serverSignals),
    },
  };
}

function normalizeServerEnvPresence(value) {
  if (typeof value === 'boolean') {
    return { present: value, nonEmpty: value };
  }
  if (!value || typeof value !== 'object') {
    return { present: false, nonEmpty: false };
  }
  return {
    present: value.present === true || value.nonEmpty === true,
    nonEmpty: value.nonEmpty === true || value.present === true,
  };
}

function buildHandoffEnvPresence(inventory) {
  return {
    source: inventory.source,
    envFile: inventory.envFile,
    keyStatus: inventory.keyStatus,
    valuesIncluded: false,
  };
}

function parseEnvFile(source) {
  const env = {};
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function renderEnvInventoryMarkdown(inventory) {
  const lines = [
    '# Production Env Key Readiness',
    '',
    `- Values included: ${inventory.boundary.valuesIncluded ? 'yes' : 'no'}`,
    `- Missing required keys: ${inventory.missingRequiredKeys.length > 0 ? inventory.missingRequiredKeys.join(', ') : 'none'}`,
    `- Missing recommended keys: ${inventory.missingRecommendedKeys.length > 0 ? inventory.missingRecommendedKeys.join(', ') : 'none'}`,
    '',
    '| Key | Required | Present | Non-empty |',
    '| --- | --- | --- | --- |',
    ...[...inventory.requiredKeys, ...inventory.recommendedKeys].map((key) => {
      const status = inventory.keyStatus[key];
      return `| ${key} | ${inventory.requiredKeys.includes(key) ? 'yes' : 'no'} | ${status.present ? 'yes' : 'no'} | ${status.nonEmpty ? 'yes' : 'no'} |`;
    }),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function normalizeRepoPath(filePath) {
  return path.relative(REPO_ROOT, path.resolve(REPO_ROOT, filePath)).replaceAll(path.sep, '/');
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/prepare-production-closeout-readiness.mjs --output-root <report-dir> --base-url <url> --company-id <id> --project-id <id> --plan-id <id> --candidate-id <id> [--gate <gate-id>] [--production-env-ref <relative-env-path>] [--server-signals-file <signals.json>]

This tool creates a handoff declaration with env:// refs, runs the read-only readiness checker,
and writes sanitized reports. It does not run live diagnostics or DB mutations.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const result = await prepareProductionCloseoutReadiness(options);
    console.log(`Production closeout readiness: ${result.readiness.status}`);
    console.log(`Ready to run: ${result.readiness.readyToRun ? 'yes' : 'no'}`);
    console.log(`Blocked gates: ${result.readiness.blockedGateCount}`);
    console.log(`Readiness JSON: ${result.readinessPath}`);
    process.exitCode = result.readiness.readyToRun ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
