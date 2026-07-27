#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_OUTPUT_PATH = path.join(REPO_ROOT, 'project-testing/reports/local-deterministic-readiness.json');

const REQUIRED_CHECKS = [
  {
    id: 'client-msw-package',
    label: 'Client MSW package',
    kind: 'package',
    manifest: 'client/package.json',
    packageName: 'msw',
    required: true,
  },
  {
    id: 'client-msw-handlers',
    label: 'Client MSW handlers',
    kind: 'file',
    path: 'client/src/mocks/handlers.ts',
    required: true,
  },
  {
    id: 'client-msw-browser-worker',
    label: 'Client MSW browser worker entry',
    kind: 'file',
    path: 'client/src/mocks/browser.ts',
    required: true,
  },
  {
    id: 'company-cockpit-msw-smoke',
    label: 'Company cockpit MSW smoke test',
    kind: 'file',
    path: 'client/src/pages/__tests__/CompanyCockpit.msw.test.tsx',
    required: true,
  },
  {
    id: 'server-runtime-db-override',
    label: 'Server runtime DB connection override',
    kind: 'source-contains',
    path: 'server/src/database.ts',
    needle: 'DB_CONNECTION_STRING',
    required: true,
  },
  {
    id: 'server-boot-db-validation-switch',
    label: 'Server boot DB validation switch',
    kind: 'source-contains',
    path: 'server/src/index.ts',
    needle: 'SKIP_DATABASE_VALIDATE',
    required: true,
  },
  {
    id: 'github-postgres-service-container-template',
    label: 'GitHub Actions Postgres service container template',
    kind: 'file',
    path: 'project-testing/plugins/github-actions-postgres-service-container.example.yml',
    required: true,
  },
  {
    id: 'local-deterministic-runbook',
    label: 'Local deterministic testing runbook',
    kind: 'file',
    path: 'project-testing/runbooks/local-deterministic-testing.md',
    required: true,
  },
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    outputPath: DEFAULT_OUTPUT_PATH,
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

    if (arg === '--output') {
      options.outputPath = path.resolve(nextValue());
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export async function runLocalDeterministicReadiness({
  outputPath = DEFAULT_OUTPUT_PATH,
  cwd = REPO_ROOT,
  now = new Date(),
} = {}) {
  const checks = [];

  for (const check of REQUIRED_CHECKS) {
    checks.push(await evaluateCheck(check, cwd));
  }

  const blockers = checks
    .filter((check) => check.required && check.status !== 'present')
    .map((check) => ({
      id: check.id,
      label: check.label,
      reason: check.evidence,
    }));

  const summary = {
    schemaVersion: 'workbuddy-local-deterministic-readiness/v1',
    generatedAt: now.toISOString(),
    status: blockers.length === 0 ? 'ready' : 'blocked',
    productionMutationPossible: false,
    target: 'local deterministic test planning; no live Supabase and no production database access',
    checks,
    blockers,
    recommendedNextActions: [
      'Promote selected flaky frontend/browser gates to MSW-backed deterministic scripts before counting them as local pass evidence.',
      'Use DB_CONNECTION_STRING against a temporary Postgres service container for integration tests that need SQL behavior.',
      'Keep RLS, real migration, live concurrency, production auth, and real file/storage gates in live_only or db_dependent tiers.',
    ],
    mutationBoundary: 'read-only repo inspection; no live Supabase; does not start app servers, connect to databases, run migrations, or write production data',
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return summary;
}

async function evaluateCheck(check, cwd) {
  const result = {
    id: check.id,
    label: check.label,
    required: Boolean(check.required),
    status: 'missing',
    evidence: '',
  };

  if (check.kind === 'file') {
    const absolutePath = path.join(cwd, check.path);
    result.status = await isReadable(absolutePath) ? 'present' : 'missing';
    result.evidence = check.path;
    return result;
  }

  if (check.kind === 'source-contains') {
    const absolutePath = path.join(cwd, check.path);
    try {
      const source = await readFile(absolutePath, 'utf8');
      result.status = source.includes(check.needle) ? 'present' : 'missing';
      result.evidence = result.status === 'present'
        ? `${check.path} contains ${check.needle}`
        : `${check.path} does not contain ${check.needle}`;
    } catch {
      result.status = 'missing';
      result.evidence = `${check.path} is not readable`;
    }
    return result;
  }

  if (check.kind === 'package') {
    const absolutePath = path.join(cwd, check.manifest);
    try {
      const manifest = JSON.parse(await readFile(absolutePath, 'utf8'));
      const version = manifest.dependencies?.[check.packageName] ?? manifest.devDependencies?.[check.packageName];
      result.status = version ? 'present' : 'missing';
      result.evidence = version
        ? `${check.packageName}@${version} in ${check.manifest}`
        : `${check.packageName} is not declared in ${check.manifest}`;
    } catch {
      result.status = 'missing';
      result.evidence = `${check.manifest} is not readable JSON`;
    }
    return result;
  }

  result.evidence = `Unknown check kind: ${check.kind}`;
  return result;
}

async function isReadable(filePath) {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/check-local-deterministic-readiness.mjs --output project-testing/reports/local-deterministic-readiness.json

Options:
  --output <path>  Write local deterministic readiness summary JSON to this path
`.trim();
}

async function main() {
  try {
    const options = parseArgs();

    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const summary = await runLocalDeterministicReadiness(options);
    console.log(`Local deterministic readiness: ${options.outputPath}`);
    console.log(JSON.stringify({ status: summary.status, blockers: summary.blockers.length }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
