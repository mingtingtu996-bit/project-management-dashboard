#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_MATRIX_PATH = path.join(REPO_ROOT, 'project-testing/matrix/release-test-matrix.json');
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing/reports');
const REAL_CLOSEOUT_GATE_IDS = [
  'c18-l07-l15-live-diagnostics',
  'c15-live-learning-closeout',
  'c19-runtime-publication-release-rollback',
  'old-object-physical-drop-closeout',
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    target: 'real-closeout',
    gateIds: [],
    matrixPath: DEFAULT_MATRIX_PATH,
    outputRoot: DEFAULT_OUTPUT_ROOT,
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

    if (arg === '--target') {
      options.target = nextValue();
    } else if (arg === '--gate') {
      options.gateIds.push(nextValue());
    } else if (arg === '--matrix') {
      options.matrixPath = path.resolve(nextValue());
    } else if (arg === '--output-root') {
      options.outputRoot = path.resolve(nextValue());
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!['real-closeout', 'live', 'db'].includes(options.target)) {
    throw new Error('--target must be one of real-closeout, live, db');
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

export async function generateHandoffPack({
  target = 'real-closeout',
  gateIds = [],
  matrixPath = DEFAULT_MATRIX_PATH,
  outputRoot = DEFAULT_OUTPUT_ROOT,
  now = new Date(),
} = {}) {
  const matrix = await loadMatrix(matrixPath);
  const selectedGates = selectGates(matrix, { target, gateIds });
  const outputDir = await createUniqueHandoffDir(outputRoot, now);
  const handoff = buildHandoff({ matrix, target, selectedGates, outputDir, now });

  await writeFile(path.join(outputDir, 'handoff-plan.json'), `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');
  await writeFile(path.join(outputDir, 'handoff-plan.md'), renderMarkdown(handoff), 'utf8');

  return {
    outputDir,
    handoff,
  };
}

function selectGates(matrix, { target, gateIds }) {
  const byId = new Map(matrix.gateGroups.map((group) => [group.id, group]));
  const ids = gateIds.length > 0 ? gateIds : defaultGateIds(matrix, target);
  const selected = [];

  for (const id of ids) {
    const gate = byId.get(id);
    if (!gate) {
      throw new Error(`Unknown gate: ${id}`);
    }
    selected.push(gate);
  }

  return selected;
}

function defaultGateIds(matrix, target) {
  if (target === 'real-closeout') {
    return REAL_CLOSEOUT_GATE_IDS;
  }

  return matrix.gateGroups
    .filter((group) => target === 'live' ? group.tier === 'live_only' : group.tier === 'db_dependent')
    .map((group) => group.id);
}

function buildHandoff({ matrix, target, selectedGates, outputDir, now }) {
  return {
    schemaVersion: 'workbuddy-release-handoff-pack/v1',
    target,
    generatedAt: now.toISOString(),
    outputDir,
    executionBoundary: {
      planningOnly: true,
      commandsExecuted: 0,
      liveMutation: false,
      dbMutation: false,
      hotFilesNotModified: matrix.concurrencyPolicy?.doNotModify ?? [],
      allowedWriteScope: matrix.concurrencyPolicy?.allowedNow ?? ['project-testing/**'],
      closeoutRule: 'A gate may close only after the live/DB handoff run produces artifacts and validate-release-evidence returns pass for that gate.',
    },
    gates: selectedGates.map((gate) => buildGateHandoff(gate)),
  };
}

function buildGateHandoff(gate) {
  const validationOutput = `${gate.id}-evidence-validation.json`;

  return {
    id: gate.id,
    tier: gate.tier,
    matrixStatus: gate.status,
    purpose: gate.purpose,
    closeoutTargets: gate.closeoutTargets ?? [],
    unlockPolicy: gate.unlockPolicy ?? null,
    mutationBoundary: gate.mutationBoundary,
    handoffChecklist: gate.handoffChecklist ?? [],
    blockingPrerequisites: gate.blockingPrerequisites ?? [],
    commandTemplates: gate.commandTemplates ?? [],
    expectedArtifacts: gate.expectedArtifacts ?? [],
    artifactValidationPolicy: gate.artifactValidationPolicy ?? null,
    passCriteria: gate.passCriteria ?? [],
    requiredEvidence: gate.requiredEvidence ?? [],
    evidenceOwners: gate.evidenceOwners ?? [],
    validationCommand: [
      'node project-testing/tools/validate-release-evidence.mjs',
      `--gate ${gate.id}`,
      '--evidence-root <release-report-dir>',
      `--output <release-report-dir>/${validationOutput}`,
    ].join(' '),
    closeoutDecision: {
      mayCloseWhen: [
        'Required live/DB unlock flags and owner handoff are present.',
        'All command templates that apply to the gate have produced archived artifacts.',
        'No blockingPrerequisites remain true.',
        `Validation command exits 0 and ${validationOutput} has status=pass.`,
      ],
      mustRemainOpenWhen: [
        'Only dry-run, local, MCP-only, or manual-assisted evidence exists.',
        'Expected artifacts, required patterns, required metadata, approval, rollback, monitoring, cleanup, or post-drop smoke are missing.',
        'The validator reports any failure.',
      ],
    },
  };
}

async function createUniqueHandoffDir(outputRoot, now) {
  await mkdir(outputRoot, { recursive: true });
  const baseDir = path.join(outputRoot, `handoff-${formatTimestamp(now)}`);

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

  throw new Error(`Unable to allocate unique handoff directory under ${outputRoot}`);
}

function renderMarkdown(handoff) {
  const lines = [
    `# WorkBuddy Release Handoff - ${handoff.target}`,
    '',
    `- Generated at: ${handoff.generatedAt}`,
    `- Planning only: ${handoff.executionBoundary.planningOnly ? 'yes' : 'no'}`,
    `- Commands executed: ${handoff.executionBoundary.commandsExecuted}`,
    `- Live mutation: ${handoff.executionBoundary.liveMutation ? 'yes' : 'no'}`,
    `- DB mutation: ${handoff.executionBoundary.dbMutation ? 'yes' : 'no'}`,
    `- Closeout rule: ${handoff.executionBoundary.closeoutRule}`,
    '',
    '## Gates',
    '',
  ];

  for (const gate of handoff.gates) {
    lines.push(
      `### ${gate.id}`,
      '',
      `- Tier: ${gate.tier}`,
      `- Matrix status: ${gate.matrixStatus}`,
      `- Purpose: ${gate.purpose}`,
      `- Mutation boundary: ${gate.mutationBoundary}`,
      '',
      'Closeout targets:',
      ...renderList(gate.closeoutTargets),
      '',
      'Unlock policy:',
      ...renderObjectEntries(gate.unlockPolicy ?? {}),
      '',
      'Handoff checklist:',
      ...renderList(gate.handoffChecklist),
      '',
      'Blocking prerequisites:',
      ...renderList(gate.blockingPrerequisites),
      '',
      'Command templates:',
      ...renderList(gate.commandTemplates.map((command) => `\`${escapePipes(command)}\``)),
      '',
      'Expected artifacts:',
      ...renderList(gate.expectedArtifacts),
      '',
      'Evidence owners:',
      ...renderList(gate.evidenceOwners),
      '',
      'Validation command:',
      `- \`${escapePipes(gate.validationCommand)}\``,
      '',
      'May close when:',
      ...renderList(gate.closeoutDecision.mayCloseWhen),
      '',
      'Must remain open when:',
      ...renderList(gate.closeoutDecision.mustRemainOpenWhen),
      '',
    );
  }

  return `${lines.join('\n')}\n`;
}

function renderList(items) {
  if (!items?.length) {
    return ['- None recorded.'];
  }

  return items.map((item) => `- ${item}`);
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
  node project-testing/tools/generate-release-handoff-pack.mjs --target real-closeout

Targets:
  real-closeout  The four remaining v1.4.23.1/v1.4.23.1-A real-environment closeout gates
  live           All live_only gates from the matrix
  db             All db_dependent gates from the matrix

Options:
  --gate <id>          Include a specific gate. Repeatable; overrides target defaults.
  --output-root <dir>  Output root. Defaults to project-testing/reports.
  --matrix <path>      Override matrix path.

This tool is planning-only. It does not run live commands, mutate DB state, or execute release scripts.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();

    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const result = await generateHandoffPack(options);
    console.log(`Release handoff pack: ${result.outputDir}`);
    console.log(`Target: ${result.handoff.target}`);
    console.log(`Gates: ${result.handoff.gates.length}`);
    console.log('Commands executed: 0');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
