#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_INVENTORY_PATH = path.join(REPO_ROOT, 'project-testing/plugins/testing-tool-inventory.json');
const DEFAULT_OUTPUT_PATH = path.join(REPO_ROOT, 'project-testing/reports/tool-readiness-summary.json');

export function parseToolArgs(argv = process.argv.slice(2)) {
  const options = {
    inventoryPath: DEFAULT_INVENTORY_PATH,
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

    if (arg === '--inventory') {
      options.inventoryPath = path.resolve(nextValue());
    } else if (arg === '--output') {
      options.outputPath = path.resolve(nextValue());
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export async function loadToolInventory(inventoryPath = DEFAULT_INVENTORY_PATH) {
  const raw = await readFile(inventoryPath, 'utf8');
  const inventory = JSON.parse(raw);

  if (!Array.isArray(inventory.tools)) {
    throw new Error(`Invalid tool inventory: tools must be an array in ${inventoryPath}`);
  }

  return inventory;
}

export async function runToolReadinessCheck({
  inventoryPath = DEFAULT_INVENTORY_PATH,
  outputPath = DEFAULT_OUTPUT_PATH,
  cwd = REPO_ROOT,
  env = process.env,
  now = new Date(),
} = {}) {
  const inventory = await loadToolInventory(inventoryPath);
  const tools = [];

  for (const tool of inventory.tools) {
    tools.push(await summarizeTool(tool, { cwd, env }));
  }

  const summary = {
    schemaVersion: 'workbuddy-testing-tool-readiness/v1',
    inventorySchemaVersion: inventory.schemaVersion,
    inventoryGeneratedAt: inventory.generatedAt,
    generatedAt: now.toISOString(),
    profile: 'tool-readiness',
    productionMutationPossible: false,
    tools,
    statusCounts: countStatuses(tools),
    boundary: [
      'CloakBrowser is a browser runtime, not a release assertion framework.',
      'Yingdao RPA is manual-assisted UAT evidence, not a hard automated release gate.',
      'Playwright MCP is exploratory until findings are converted into repeatable scripts.',
      'Future tools stay inventory-only until prerequisites are satisfied.',
    ],
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return summary;
}

async function summarizeTool(tool, context) {
  const check = tool.check ?? { type: 'unknown' };
  const result = {
    id: tool.id,
    name: tool.name,
    layer: tool.layer,
    stage: tool.stage,
    purpose: tool.purpose,
    releaseEvidencePolicy: tool.releaseEvidencePolicy,
    productionMutation: Boolean(tool.productionMutation),
    governance: tool.governance,
    status: 'unknown',
    evidence: '',
    nextAction: '',
  };

  if (check.type === 'executable') {
    const candidatePath = context.env[check.envVar] || check.fallbackPath;
    result.evidence = candidatePath || `${check.envVar} is not set`;
    result.status = candidatePath && await isReadable(candidatePath) ? 'present' : 'missing';
    result.nextAction = result.status === 'present'
      ? 'Wire this executable through Playwright launch configuration or CLOAK_BROWSER_EXECUTABLE.'
      : `Set ${check.envVar} or restore the expected local executable.`;
  } else if (check.type === 'manual') {
    result.status = 'manual';
    result.evidence = 'Manual desktop/RPA availability cannot be proven from repo-only checks.';
    result.nextAction = 'Attach Yingdao run logs, screenshots, or exported flow evidence under project-testing/reports when used.';
  } else if (check.type === 'mcp-reference') {
    result.status = hasMcpEnvHint(context.env) ? 'configured' : 'missing';
    result.evidence = result.status === 'configured'
      ? 'MCP-related environment/config hints detected.'
      : 'No repo-local MCP readiness signal; use Codex tool discovery when needed.';
    result.nextAction = 'Use for exploration only, then convert stable findings into repeatable scripts.';
  } else if (check.type === 'package-reference') {
    const packagePresent = await packageExists(check.packageName, context.cwd);
    result.status = packagePresent ? 'present' : tool.stage === 'future' ? 'future' : 'missing';
    result.evidence = packagePresent
      ? `${check.packageName} found in package manifests.`
      : `${check.packageName} is not declared in current package manifests.`;
    result.nextAction = packagePresent
      ? 'Use only in the matrix tier documented for this tool; do not count mocked or container evidence as live readiness.'
      : tool.stage === 'future'
      ? 'Keep inventory-only until a selected test surface needs deterministic mocked data.'
      : `Install or configure ${check.packageName} only after ownership is clear.`;
  } else if (check.type === 'future-prerequisite') {
    result.status = 'future';
    result.evidence = `Requires: ${(check.requires ?? []).join('; ')}`;
    result.nextAction = 'Do not install or run until prerequisites are satisfied and added to the matrix.';
  }

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

function hasMcpEnvHint(env) {
  return Object.keys(env).some((key) => key.toUpperCase().includes('MCP') || key.toUpperCase().includes('PLAYWRIGHT'));
}

async function packageExists(packageName, cwd) {
  const manifestPaths = [
    path.join(cwd, 'package.json'),
    path.join(cwd, 'client/package.json'),
    path.join(cwd, 'server/package.json'),
  ];

  for (const manifestPath of manifestPaths) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (manifest.dependencies?.[packageName] || manifest.devDependencies?.[packageName]) {
        return true;
      }
    } catch {
      // Missing or invalid manifests are not fatal for a read-only readiness check.
    }
  }

  return false;
}

function countStatuses(tools) {
  return tools.reduce((counts, tool) => {
    counts[tool.status] = (counts[tool.status] ?? 0) + 1;
    return counts;
  }, {});
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/check-testing-tools.mjs --output project-testing/reports/tool-readiness-summary.json

Options:
  --inventory <path>  Override testing tool inventory path
  --output <path>     Write readiness summary JSON to this path
`.trim();
}

async function main() {
  try {
    const options = parseToolArgs();

    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const summary = await runToolReadinessCheck(options);
    console.log(`Testing tool readiness: ${options.outputPath}`);
    console.log(JSON.stringify(summary.statusCounts));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
