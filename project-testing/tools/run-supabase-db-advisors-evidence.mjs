#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: path.join(REPO_ROOT, 'deploy/env/staging.env'),
    output: '',
    type: 'all',
    level: 'info',
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
    } else if (arg === '--type') {
      options.type = nextValue();
    } else if (arg === '--level') {
      options.level = nextValue();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.output) throw new Error('--output is required');
  return options;
}

function parseEnvFile(envFile) {
  const env = {};
  const raw = readFileSync(envFile, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const splitIndex = trimmed.indexOf('=');
    if (splitIndex < 0) continue;
    const key = trimmed.slice(0, splitIndex).trim();
    let value = trimmed.slice(splitIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function redact(value, secrets) {
  let output = String(value ?? '');
  for (const secret of secrets) {
    if (secret && secret.length > 8) output = output.split(secret).join('<redacted>');
  }
  output = output.replace(/postgres(?:ql)?:\/\/[^\s"']+/g, 'postgresql://<redacted>');
  return output;
}

function normalizeAdvisorIssue(issue) {
  return {
    code: issue.name || issue.code || issue.cacheKey || 'unknown_advisor_issue',
    name: issue.name || null,
    title: issue.title || issue.name || 'Untitled advisor issue',
    level: issue.level || null,
    facing: issue.facing || null,
    categories: Array.isArray(issue.categories) ? issue.categories : [],
    detail: issue.detail || '',
    metadata: issue.metadata || null,
    cacheKey: issue.cacheKey || null,
    raw: [],
  };
}

function parseAdvisorJson(stdout) {
  const parsed = JSON.parse(String(stdout ?? ''));
  const results = Array.isArray(parsed) ? parsed : parsed.results;
  if (!Array.isArray(results)) return null;
  return results.map(normalizeAdvisorIssue);
}

function parseAdvisorText(stdout) {
  const lines = String(stdout ?? '').split(/\r?\n/);
  const issues = [];
  let current = null;
  for (const line of lines) {
    const issueHeader = line.match(/^\s*([A-Z0-9_]+):\s*(.+)$/);
    if (issueHeader) {
      current = {
        code: issueHeader[1],
        title: issueHeader[2].trim(),
        raw: [line],
      };
      issues.push(current);
    } else if (current && line.trim()) {
      current.raw.push(line);
    }
  }
  return issues;
}

function parseAdvisorOutput(stdout) {
  const trimmed = String(stdout ?? '').trim();
  if (!trimmed) return [];
  try {
    const jsonIssues = parseAdvisorJson(trimmed);
    if (jsonIssues) return jsonIssues;
  } catch {
    // Fall back to the older human-readable Supabase CLI output format.
  }
  return parseAdvisorText(stdout);
}

function runAdvisors(args, env) {
  const direct = spawnSync('npx.cmd', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 180000,
    env,
  });
  if (!direct.error) return { ...direct, invocation: 'npx.cmd' };
  const fallback = spawnSync('npx.cmd', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: true,
    windowsHide: true,
    timeout: 180000,
    env,
  });
  return { ...fallback, invocation: 'npx.cmd-shell-fallback', initialError: direct.error };
}

const options = parseArgs();
const env = parseEnvFile(options.envFile);
const dbUrl = env.SUPABASE_MIGRATION_URL || env.DB_CONNECTION_STRING || env.DATABASE_URL;
if (!dbUrl) throw new Error('SUPABASE_MIGRATION_URL, DB_CONNECTION_STRING, or DATABASE_URL is required');
const secrets = Object.values(env).filter((value) => typeof value === 'string' && value.length > 8);
const childEnv = {
  ...process.env,
  SUPABASE_TELEMETRY_DISABLED: '1',
  NO_TELEMETRY: '1',
};
const args = [
  'supabase',
  'db',
  'advisors',
  '--db-url',
  dbUrl,
  '--type',
  options.type,
  '--level',
  options.level,
  '--fail-on',
  'none',
];
const startedAt = new Date();
const result = runAdvisors(args, childEnv);
const finishedAt = new Date();
const stdout = result.stdout || '';
const stderr = result.stderr || '';
const issues = parseAdvisorOutput(stdout);
const rlsIssues = issues.filter((issue) => /rls|row level security|policy|force/i.test([
  issue.code,
  issue.name,
  issue.title,
  issue.detail,
  issue.categories.join(' '),
  issue.raw.join('\n'),
].join(' ')));
const securityIssues = issues.filter((issue) => issue.categories.some((category) => /security/i.test(category)));
const performanceIssues = issues.filter((issue) => issue.categories.some((category) => /performance/i.test(category)));
const evidence = {
  schemaVersion: 'workbuddy-supabase-db-advisors-evidence/v1',
  generatedAt: finishedAt.toISOString(),
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  command: `npx supabase db advisors --db-url <redacted> --type ${options.type} --level ${options.level} --fail-on none`,
  environment: 'staging',
  databaseTarget: `env://${path.relative(REPO_ROOT, options.envFile).replace(/\\/g, '/')}#SUPABASE_MIGRATION_URL`,
  exitCode: result.status,
  signal: result.signal,
  spawnError: result.error ? {
    name: result.error.name,
    message: result.error.message,
    code: result.error.code || null,
  } : null,
  invocation: result.invocation,
  initialSpawnError: result.initialError ? {
    name: result.initialError.name,
    message: result.initialError.message,
    code: result.initialError.code || null,
  } : null,
  stdoutPreview: redact(stdout, [dbUrl, ...secrets]).slice(0, 12000),
  stderrPreview: redact(stderr, [dbUrl, ...secrets]).slice(0, 12000),
  issueCount: issues.length,
  issues,
  securityIssueCount: securityIssues.length,
  securityIssues,
  performanceIssueCount: performanceIssues.length,
  performanceIssues,
  rlsIssueCount: rlsIssues.length,
  rlsIssues,
  boundary: {
    liveMutation: false,
    dbMutation: false,
    advisorCliRescan: true,
    advisorUiOrApiExport: false,
    note: 'Supabase CLI db advisors is a read-only Advisor rescan through the Supabase CLI. It is not a dashboard screenshot or Management API export.',
  },
};
writeFileSync(options.output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  output: path.relative(REPO_ROOT, options.output).replace(/\\/g, '/'),
  exitCode: evidence.exitCode,
  issueCount: evidence.issueCount,
  rlsIssueCount: evidence.rlsIssueCount,
  spawnError: evidence.spawnError,
}, null, 2));
process.exitCode = evidence.exitCode === 0 ? 0 : 1;
