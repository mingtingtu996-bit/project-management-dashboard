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

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: 'deploy/env/server.production.env',
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
  const envFile = normalizeRepoPath(options.envFile);
  const artifactRoot = normalizeRepoPath(path.join(options.outputRoot, 'artifacts'));
  const operator = options.operator || 'production-closeout-operator';
  const approvalRef = options.approvalRef || `github-actions://${process.env.GITHUB_RUN_ID || 'manual-run'}`;
  const sampleCohortRef = options.sampleCohortRef || `${artifactRoot}/c15-sample-cohort-readback.json`;
  const phase1L5Ref = options.phase1L5Ref || `${artifactRoot}/phase1-l5-handoff.json`;
  const releaseClosureArtifactRef = options.releaseClosureArtifactRef || `${artifactRoot}/c19-release-closure-artifact.json`;
  const rollbackTargetRef = options.rollbackTargetRef || `${artifactRoot}/c19-runtime-rollback-target.json`;
  const monitoringWindow = options.monitoringWindow || 'production-observation-window-required';

  await mkdir(outputRoot, { recursive: true });

  const handoff = {
    schemaVersion: 'workbuddy-release-handoff-input/v1',
    generatedAt: new Date().toISOString(),
    source: 'github-actions-production-closeout-readiness',
    boundary: {
      secretsEmbedded: false,
      envFileUploaded: false,
      readinessOnly: true,
      liveOrDbCommandsExecuted: 0,
    },
    unlockFlags: {
      includeLive: true,
      confirmLiveHandoff: true,
      includeDb: true,
      confirmDbReady: true,
    },
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
          databaseTargetRef: `env://${envFile}#SUPABASE_MIGRATION_URL`,
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
  const envInventory = await buildEnvInventory(path.resolve(REPO_ROOT, envFile));
  await writeFile(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outputRoot, 'env-key-readiness.json'), `${JSON.stringify(envInventory, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outputRoot, 'env-key-readiness.md'), renderEnvInventoryMarkdown(envInventory), 'utf8');

  const readiness = await checkReleaseHandoffReadiness({
    handoffFile: handoffPath,
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
    boundary: handoff.boundary,
  }, null, 2)}\n`, 'utf8');

  return {
    handoffPath,
    readinessPath: readinessOutputs.jsonPath,
    statusPath: statusOutputs.jsonPath,
    readiness,
  };
}

async function buildEnvInventory(envFilePath) {
  const raw = await readFile(envFilePath, 'utf8');
  const env = parseEnvFile(raw);
  const requiredKeys = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_MIGRATION_URL',
    'DB_CONNECTION_STRING',
    'JWT_SECRET',
  ];
  const recommendedKeys = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'DIRECT_DATABASE_URL',
    'DATABASE_URL',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
  ];
  const keyStatus = Object.fromEntries([...requiredKeys, ...recommendedKeys].map((key) => [
    key,
    {
      present: Object.prototype.hasOwnProperty.call(env, key),
      nonEmpty: String(env[key] ?? '').trim().length > 0,
    },
  ]));

  return {
    schemaVersion: 'workbuddy-production-env-key-readiness/v1',
    generatedAt: new Date().toISOString(),
    envFile: normalizeRepoPath(envFilePath),
    requiredKeys,
    recommendedKeys,
    keyStatus,
    missingRequiredKeys: requiredKeys.filter((key) => !keyStatus[key].nonEmpty),
    missingRecommendedKeys: recommendedKeys.filter((key) => !keyStatus[key].nonEmpty),
    boundary: {
      valuesIncluded: false,
      valuesPrinted: false,
    },
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
  node project-testing/tools/prepare-production-closeout-readiness.mjs --output-root <report-dir> --base-url <url> --company-id <id> --project-id <id> --plan-id <id> --candidate-id <id>

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
