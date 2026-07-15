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
    schema: 'public',
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
    } else if (arg === '--schema') {
      options.schema = nextValue();
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
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function parseJsonFromStdout(stdout) {
  const firstBrace = stdout.indexOf('{');
  const lastBrace = stdout.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    return { parseStatus: 'fail', parseError: 'no JSON object found in stdout', parsed: null };
  }
  try {
    return {
      parseStatus: 'pass',
      parseError: '',
      parsed: JSON.parse(stdout.slice(firstBrace, lastBrace + 1)),
    };
  } catch (error) {
    return {
      parseStatus: 'fail',
      parseError: error instanceof Error ? error.message : 'JSON parse failed',
      parsed: null,
    };
  }
}

function redactSecretText(value, secrets) {
  let next = String(value || '');
  for (const secret of secrets) {
    if (!secret) continue;
    next = next.split(secret).join('<redacted>');
  }
  return next;
}

function flattenIssues(parsed) {
  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  const issues = [];
  for (const result of results) {
    for (const issue of Array.isArray(result.issues) ? result.issues : []) {
      issues.push({
        function: result.function || null,
        level: issue.level || null,
        message: issue.message || null,
        sqlState: issue.sqlState || null,
        lineNumber: issue.statement?.lineNumber ?? null,
      });
    }
  }
  return { results, issues };
}

function runSupabaseLint(args) {
  const direct = spawnSync('npx.cmd', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 120000,
  });

  if (!direct.error) return { ...direct, invocation: 'npx.cmd' };

  const fallback = spawnSync('npx.cmd', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: true,
    windowsHide: true,
    timeout: 120000,
  });
  return {
    ...fallback,
    invocation: 'npx.cmd-shell-fallback',
    initialError: direct.error,
  };
}

function main() {
  const options = parseArgs();
  const env = parseEnvFile(options.envFile);
  const dbUrl = env.SUPABASE_MIGRATION_URL || env.DB_CONNECTION_STRING || env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('SUPABASE_MIGRATION_URL, DB_CONNECTION_STRING, or DATABASE_URL is required');
  }

  const startedAt = new Date();
  const args = [
    'supabase',
    'db',
    'lint',
    '--db-url',
    dbUrl,
    '--schema',
    options.schema,
    '--fail-on',
    'none',
    '--output-format',
    'json',
  ];
  const result = runSupabaseLint(args);
  const finishedAt = new Date();
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const json = parseJsonFromStdout(stdout);
  const { results, issues } = flattenIssues(json.parsed);
  const rlsDisabledIssues = issues.filter((issue) => (
    /rls|row level security|rowsecurity/i.test(`${issue.message || ''} ${issue.level || ''}`)
  ));

  const evidence = {
    schemaVersion: 'workbuddy-supabase-db-lint-evidence/v1',
    generatedAt: finishedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    command: `npx supabase db lint --db-url <redacted> --schema ${options.schema} --fail-on none --output-format json`,
    environment: 'staging',
    databaseTarget: `env://${path.relative(REPO_ROOT, options.envFile).replace(/\\/g, '/')}#SUPABASE_MIGRATION_URL`,
    exitCode: result.status,
    signal: result.signal,
    spawnError: result.error ? {
      name: result.error.name,
      message: result.error.message,
      code: result.error.code || null,
    } : null,
    parseStatus: json.parseStatus,
    parseError: json.parseError,
    invocation: result.invocation,
    initialSpawnError: result.initialError ? {
      name: result.initialError.name,
      message: result.initialError.message,
      code: result.initialError.code || null,
    } : null,
    stderrPreview: redactSecretText(stderr, [dbUrl]).slice(0, 2000),
    stdoutPreview: json.parseStatus === 'pass' ? '' : redactSecretText(stdout, [dbUrl]).slice(0, 2000),
    resultCount: results.length,
    issueCount: issues.length,
    issues,
    rlsDisabledIssueCount: rlsDisabledIssues.length,
    rlsDisabledIssues,
    boundary: {
      liveMutation: false,
      dbMutation: false,
      advisorUiOrApiExport: false,
      note: 'Supabase CLI db lint is a read-only DB lint run. It is supporting machine evidence, not a Supabase Advisor UI/API rescan export by itself.',
    },
  };

  writeFileSync(options.output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    output: path.relative(REPO_ROOT, options.output).replace(/\\/g, '/'),
    exitCode: evidence.exitCode,
    parseStatus: evidence.parseStatus,
    issueCount: evidence.issueCount,
    rlsDisabledIssueCount: evidence.rlsDisabledIssueCount,
    spawnError: evidence.spawnError,
  }, null, 2));
}

main();
