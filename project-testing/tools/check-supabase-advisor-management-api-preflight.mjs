#!/usr/bin/env node

import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractProjectRefFromSupabaseUrl,
  parseEnvFile,
  resolveManagementApiToken,
} from './export-supabase-advisor-management-api.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'deploy/env/staging.env');
const DEFAULT_TOKEN_ENV_NAMES = [
  'SUPABASE_MANAGEMENT_API_TOKEN',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_API_TOKEN',
];

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/');
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: DEFAULT_ENV_FILE,
    output: '',
    advisorOutput: '',
    projectRef: '',
    environment: 'staging',
    operator: 'release-dashboard-db-profile',
    tokenEnv: '',
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
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue());
    } else if (arg === '--advisor-output') {
      options.advisorOutput = path.resolve(nextValue());
    } else if (arg === '--project-ref') {
      options.projectRef = nextValue().trim();
    } else if (arg === '--environment') {
      options.environment = nextValue().trim();
    } else if (arg === '--operator') {
      options.operator = nextValue().trim();
    } else if (arg === '--token-env') {
      options.tokenEnv = nextValue().trim();
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.output) throw new Error('--output is required');
  return options;
}

async function fileExists(filePath) {
  return access(filePath, constants.R_OK).then(() => true).catch(() => false);
}

function tokenCandidates(tokenEnv) {
  return tokenEnv ? [tokenEnv] : DEFAULT_TOKEN_ENV_NAMES;
}

export async function buildSupabaseAdvisorManagementApiPreflight(options) {
  const envFile = options.envFile ? path.resolve(options.envFile) : DEFAULT_ENV_FILE;
  const envFilePresent = await fileExists(envFile);
  const envRaw = envFilePresent ? await readFile(envFile, 'utf8') : '';
  const envFileValues = parseEnvFile(envRaw);
  const projectRef = options.projectRef
    || extractProjectRefFromSupabaseUrl(envFileValues.SUPABASE_URL)
    || extractProjectRefFromSupabaseUrl(options.env?.SUPABASE_URL)
    || extractProjectRefFromSupabaseUrl(process.env.SUPABASE_URL);
  const candidates = tokenCandidates(options.tokenEnv);
  const tokenPresence = Object.fromEntries(candidates.map((name) => [
    name,
    typeof (options.env ?? process.env)[name] === 'string' && (options.env ?? process.env)[name].trim().length > 0,
  ]));

  let resolvedTokenEnv = null;
  const blockers = [];
  if (!envFilePresent) {
    blockers.push({
      code: 'env-file-missing',
      detail: repoRelative(envFile),
    });
  }
  if (!projectRef) {
    blockers.push({
      code: 'project-ref-missing',
      detail: 'Pass --project-ref or provide SUPABASE_URL in the env file.',
    });
  }
  try {
    resolvedTokenEnv = resolveManagementApiToken(options.env ?? process.env, options.tokenEnv).key;
  } catch (error) {
    blockers.push({
      code: 'management-api-token-missing',
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const advisorOutput = options.advisorOutput
    ? path.resolve(options.advisorOutput)
    : path.join(path.dirname(path.resolve(options.output)), 'supabase-advisor-management-api-export.json');
  const exportCommand = [
    'npm run evidence:supabase-advisor:management-api --',
    `--env-file ${repoRelative(envFile)}`,
    `--output ${repoRelative(advisorOutput)}`,
    `--operator ${options.operator || 'release-dashboard-db-profile'}`,
    options.projectRef ? `--project-ref ${projectRef}` : '',
    options.environment ? `--environment ${options.environment}` : '',
    options.tokenEnv ? `--token-env ${options.tokenEnv}` : '',
  ].filter(Boolean).join(' ');

  return {
    schemaVersion: 'workbuddy-supabase-advisor-management-api-preflight/v1',
    generatedAt: (options.now ?? new Date()).toISOString(),
    status: blockers.length === 0 ? 'ready' : 'blocked',
    readyToRun: blockers.length === 0,
    environment: options.environment || 'staging',
    envFile: repoRelative(envFile),
    envFilePresent,
    projectRef: projectRef || null,
    tokenCandidates: candidates,
    tokenPresence,
    resolvedTokenEnv,
    blockers,
    requiredExportArtifact: repoRelative(advisorOutput),
    requiredExportCommand: exportCommand,
    boundary: {
      liveMutation: false,
      dbMutation: false,
      networkMutation: false,
      secretSafe: true,
      note: 'Read-only preflight for Supabase Advisor Management API export. It does not call Supabase and never writes token values.',
    },
  };
}

export async function writeSupabaseAdvisorManagementApiPreflight(options) {
  const report = await buildSupabaseAdvisorManagementApiPreflight(options);
  const outputPath = path.resolve(options.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

function printHelp() {
  console.log(`Usage: node project-testing/tools/check-supabase-advisor-management-api-preflight.mjs --output <json> [--env-file <env>] [--advisor-output <json>] [--project-ref <ref>] [--token-env <env-name>]`);
}

export function isMainModule(importMetaUrl = import.meta.url, argv1 = process.argv[1]) {
  if (!argv1) return false;
  return fileURLToPath(importMetaUrl) === path.resolve(argv1);
}

if (isMainModule()) {
  try {
    const options = parseArgs();
    const report = await writeSupabaseAdvisorManagementApiPreflight(options);
    console.log(JSON.stringify({
      status: report.status,
      readyToRun: report.readyToRun,
      envFilePresent: report.envFilePresent,
      projectRef: report.projectRef,
      resolvedTokenEnv: report.resolvedTokenEnv,
      blockerCodes: report.blockers.map((blocker) => blocker.code),
      requiredExportArtifact: report.requiredExportArtifact,
    }, null, 2));
    process.exitCode = report.readyToRun ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({
      status: 'blocked',
      reason: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  }
}
