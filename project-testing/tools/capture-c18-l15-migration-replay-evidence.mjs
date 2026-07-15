#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    diagnosticRunId: null,
    outputFile: null,
    replayRunCount: 2,
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

    if (arg === '--diagnostic-run-id') {
      options.diagnosticRunId = nextValue();
    } else if (arg === '--output-file') {
      options.outputFile = nextValue();
    } else if (arg === '--replay-run-count') {
      options.replayRunCount = Number(nextValue());
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.help) return options;
  if (!options.diagnosticRunId) throw new Error('--diagnostic-run-id is required');
  if (!options.outputFile) throw new Error('--output-file is required');
  if (!Number.isInteger(options.replayRunCount) || options.replayRunCount < 2) {
    throw new Error('--replay-run-count must be an integer >= 2');
  }
  return options;
}

function printHelp() {
  console.log(`Usage:
node project-testing/tools/capture-c18-l15-migration-replay-evidence.mjs --diagnostic-run-id <id> --output-file <json> [--replay-run-count 2]

Runs the read-only server migration safety gate multiple times and writes C18.L15
migration replay evidence only when repeated results are stable and passing.`);
}

function runCommand(command, args, cwd) {
  return new Promise((resolve) => {
    const useShell = process.platform === 'win32';
    const child = spawn(
      useShell ? [command, ...args].join(' ') : command,
      useShell ? [] : args,
      {
      cwd,
      shell: useShell,
      env: process.env,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
    child.on('error', (error) => {
      resolve({ exitCode: 1, stdout, stderr: `${stderr}${error.message}` });
    });
  });
}

function extractBalancedJsonObject(value, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return value.slice(startIndex, index + 1);
    }
  }
  return null;
}

function parseJsonFromOutput(output) {
  const trimmed = output.replace(/^\uFEFF/, '').trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // npm may prefix command banners before the JSON payload.
  }

  for (let index = trimmed.indexOf('{'); index >= 0; index = trimmed.indexOf('{', index + 1)) {
    const candidate = extractBalancedJsonObject(trimmed, index);
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // keep looking
    }
  }
  return null;
}

function stablePayload(payload) {
  return {
    gate: payload?.gate ?? null,
    status: payload?.status ?? null,
    ledgerAvailable: payload?.ledgerAvailable ?? null,
    allowPendingMigrations: payload?.allowPendingMigrations ?? null,
    reasonCodes: payload?.reasonCodes ?? [],
    pendingMigrations: payload?.pendingMigrations ?? [],
    checksumMismatches: payload?.checksumMismatches ?? [],
    orphanLedgerRows: payload?.orphanLedgerRows ?? [],
    adoptedBaselineLedgerRows: payload?.adoptedBaselineLedgerRows ?? [],
    duplicateVersions: payload?.duplicateVersions ?? [],
    unsafeBaselineReplayRisk: payload?.unsafeBaselineReplayRisk ?? null,
    existingBaselineTables: payload?.existingBaselineTables ?? [],
  };
}

function hashPayload(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function summarizeRun(run, index) {
  const payload = parseJsonFromOutput(run.stdout);
  const stable = payload ? stablePayload(payload) : null;
  return {
    run: index + 1,
    command: 'npm run migrate:check --workspace=server',
    exitCode: run.exitCode,
    parsed: Boolean(payload),
    status: payload?.status ?? null,
    ledgerAvailable: payload?.ledgerAvailable ?? null,
    reasonCodes: payload?.reasonCodes ?? null,
    pendingMigrations: payload?.pendingMigrations ?? null,
    checksumMismatches: payload?.checksumMismatches ?? null,
    orphanLedgerRows: payload?.orphanLedgerRows ?? null,
    duplicateVersions: payload?.duplicateVersions ?? null,
    unsafeBaselineReplayRisk: payload?.unsafeBaselineReplayRisk ?? null,
    stablePayloadHash: stable ? hashPayload(stable) : null,
    stderrSummary: run.stderr.trim().slice(0, 1000) || null,
  };
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }

  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = ['run', 'migrate:check', '--workspace=server'];
  const startedAt = new Date().toISOString();
  const rawRuns = [];
  for (let index = 0; index < options.replayRunCount; index += 1) {
    rawRuns.push(await runCommand(command, args, REPO_ROOT));
  }
  const finishedAt = new Date().toISOString();
  const runs = rawRuns.map(summarizeRun);
  const firstHash = runs[0]?.stablePayloadHash ?? null;
  const stableReplay = Boolean(firstHash) && runs.every((run) => run.stablePayloadHash === firstHash);
  const passRuns = runs.every((run) =>
    run.exitCode === 0 &&
    run.parsed &&
    run.status === 'pass' &&
    run.ledgerAvailable === true &&
    Array.isArray(run.reasonCodes) &&
    run.reasonCodes.length === 0 &&
    Array.isArray(run.pendingMigrations) &&
    run.pendingMigrations.length === 0 &&
    Array.isArray(run.checksumMismatches) &&
    run.checksumMismatches.length === 0 &&
    Array.isArray(run.orphanLedgerRows) &&
    run.orphanLedgerRows.length === 0 &&
    Array.isArray(run.duplicateVersions) &&
    run.duplicateVersions.length === 0 &&
    run.unsafeBaselineReplayRisk === false
  );
  const idempotentReplay = stableReplay && passRuns;
  const outputPath = path.resolve(REPO_ROOT, options.outputFile);
  const relativeOutput = path.relative(REPO_ROOT, outputPath).replaceAll(path.sep, '/');
  const report = {
    schemaVersion: 'workbuddy-c18-l15-migration-replay-evidence/v1',
    reportCode: 'c18_l15_migration_replay_evidence',
    evidenceKind: 'read_only_migration_safety_replay',
    environment: 'current-live',
    evidenceRef: relativeOutput,
    diagnosticRunId: options.diagnosticRunId,
    status: idempotentReplay ? 'pass' : 'fail',
    idempotentReplay,
    replayRunCount: runs.length,
    command: 'npm run migrate:check --workspace=server',
    startedAt,
    finishedAt,
    comparison: {
      stableReplay,
      passRuns,
      stablePayloadHash: firstHash,
    },
    runs,
    reason: idempotentReplay
      ? null
      : 'Expected at least two stable passing migrate:check runs with ledger available, no pending migrations, no unreconciled checksum mismatches, no orphan rows, no duplicate versions, and no unsafe baseline replay risk.',
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (!idempotentReplay) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
