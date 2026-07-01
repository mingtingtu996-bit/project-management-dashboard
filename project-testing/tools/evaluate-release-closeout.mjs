#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMatrix, validateReleaseEvidence } from './validate-release-evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_MATRIX_PATH = path.join(REPO_ROOT, 'project-testing/matrix/release-test-matrix.json');
const REAL_CLOSEOUT_GATE_IDS = [
  'c18-l07-l15-live-diagnostics',
  'c15-live-learning-closeout',
  'c19-runtime-publication-release-rollback',
  'old-object-physical-drop-closeout',
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    evidenceRoot: null,
    matrixPath: DEFAULT_MATRIX_PATH,
    gateIds: [],
    outputPath: null,
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

    if (arg === '--evidence-root') {
      options.evidenceRoot = path.resolve(nextValue());
    } else if (arg === '--matrix') {
      options.matrixPath = path.resolve(nextValue());
    } else if (arg === '--gate') {
      options.gateIds.push(nextValue());
    } else if (arg === '--output') {
      options.outputPath = path.resolve(nextValue());
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.evidenceRoot) {
    throw new Error('--evidence-root is required');
  }

  return options;
}

export async function evaluateReleaseCloseout({
  evidenceRoot,
  matrixPath = DEFAULT_MATRIX_PATH,
  gateIds = REAL_CLOSEOUT_GATE_IDS,
  now = new Date(),
} = {}) {
  if (!evidenceRoot) {
    throw new Error('evidenceRoot is required');
  }

  const matrix = await loadMatrix(matrixPath);
  const root = path.resolve(evidenceRoot);
  const selectedGateIds = gateIds.length > 0 ? gateIds : REAL_CLOSEOUT_GATE_IDS;
  const gates = [];

  for (const gateId of selectedGateIds) {
    const matrixGate = matrix.gateGroups.find((group) => group.id === gateId);
    if (!matrixGate) {
      throw new Error(`Unknown gate: ${gateId}`);
    }

    const validation = await validateReleaseEvidence({
      gateId,
      evidenceRoot: root,
      matrixPath,
      now,
    });

    gates.push({
      id: gateId,
      tier: matrixGate.tier,
      matrixStatus: matrixGate.status,
      closeoutTargets: matrixGate.closeoutTargets ?? [],
      validationOutput: `${gateId}-evidence-validation.json`,
      validationStatus: validation.status,
      mayClose: validation.status === 'pass',
      closeoutMode: validation.checks?.alternateCloseout?.mode ?? 'standard',
      mutationSummary: summarizeMutationEvidence(validation),
      alternateCloseout: validation.checks?.alternateCloseout ?? null,
      failureCount: validation.counts.failures,
      evidenceFiles: validation.counts.evidenceFiles,
      expectedArtifactsPresent: validation.counts.expectedArtifactsPresent,
      requiredPatternsMatched: validation.counts.requiredPatternsMatched,
      requiredMetadataPresent: validation.counts.requiredMetadataPresent,
      rejectMarkersMatched: validation.counts.rejectMarkersMatched,
      topFailures: validation.failures.slice(0, 10),
      validation,
    });
  }

  const openGates = gates.filter((gate) => !gate.mayClose);
  return {
    schemaVersion: 'workbuddy-release-closeout-decision/v1',
    evidenceRoot: root,
    evaluatedAt: now.toISOString(),
    status: openGates.length === 0 ? 'pass' : 'fail',
    mayCloseAll: openGates.length === 0,
    gateCount: gates.length,
    closedGateCount: gates.length - openGates.length,
    openGateCount: openGates.length,
    gates,
    decision: {
      mayCloseWhen: 'All selected gates have validationStatus=pass and mayClose=true.',
      mustRemainOpenWhen: 'Any selected gate validation fails, is missing artifacts, has reject markers, or lacks required live/DB metadata.',
      openGateIds: openGates.map((gate) => gate.id),
    },
  };
}

export async function writeCloseoutDecision({ decision, outputPath }) {
  const jsonPath = outputPath
    ? path.resolve(outputPath)
    : path.join(decision.evidenceRoot, 'closeout-decision.json');
  const markdownPath = jsonPath.endsWith('.json')
    ? jsonPath.replace(/\.json$/u, '.md')
    : `${jsonPath}.md`;

  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(stripEmbeddedValidations(decision), null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, renderMarkdown(decision), 'utf8');

  for (const gate of decision.gates) {
    const validationPath = path.join(decision.evidenceRoot, gate.validationOutput);
    await writeFile(validationPath, `${JSON.stringify(gate.validation, null, 2)}\n`, 'utf8');
  }

  return { jsonPath, markdownPath };
}

function stripEmbeddedValidations(decision) {
  return {
    ...decision,
    gates: decision.gates.map((gate) => {
      const { validation, ...rest } = gate;
      return rest;
    }),
  };
}

function summarizeMutationEvidence(validation) {
  const documents = (validation.checks?.jsonArtifacts?.documents ?? [])
    .map((item) => item.document)
    .filter((item) => item && typeof item === 'object');
  return {
    hasLiveMutationEvidence: documents.some((document) => document.liveMutation === true || document.boundary?.liveMutation === true),
    hasDbMutationEvidence: documents.some((document) => document.dbMutation === true || document.boundary?.dbMutation === true),
    physicalDropExecuted: documents.some((document) => document.physicalDropExecuted === true || document.boundary?.physicalDropExecuted === true),
    noMutationBoundaryCount: documents.filter((document) => {
      return document.liveMutation === false
        || document.dbMutation === false
        || document.boundary?.liveMutation === false
        || document.boundary?.dbMutation === false
        || document.physicalDropExecuted === false
        || document.boundary?.physicalDropExecuted === false;
    }).length,
  };
}

function renderMarkdown(decision) {
  const lines = [
    '# WorkBuddy Release Closeout Decision',
    '',
    `- Status: ${decision.status}`,
    `- May close all: ${decision.mayCloseAll ? 'yes' : 'no'}`,
    `- Gates: ${decision.gateCount}`,
    `- Closed gates: ${decision.closedGateCount}`,
    `- Open gates: ${decision.openGateCount}`,
    `- Evidence root: ${decision.evidenceRoot}`,
    '',
    '## Gate Decisions',
    '',
    '| Gate | Tier | Validation | May close | Mode | Live mutation evidence | DB mutation evidence | Physical DROP | Failures | Evidence files |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: |',
    ...decision.gates.map((gate) => {
      const mutation = gate.mutationSummary ?? {};
      return `| ${gate.id} | ${gate.tier} | ${gate.validationStatus} | ${gate.mayClose ? 'yes' : 'no'} | ${gate.closeoutMode ?? 'standard'} | ${mutation.hasLiveMutationEvidence ? 'yes' : 'no'} | ${mutation.hasDbMutationEvidence ? 'yes' : 'no'} | ${mutation.physicalDropExecuted ? 'yes' : 'no'} | ${gate.failureCount} | ${gate.evidenceFiles} |`;
    }),
    '',
    '## Open Gates',
    '',
    ...renderOpenGates(decision.gates.filter((gate) => !gate.mayClose)),
    '',
    '## Decision Rule',
    '',
    `- May close when: ${decision.decision.mayCloseWhen}`,
    `- Must remain open when: ${decision.decision.mustRemainOpenWhen}`,
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function renderOpenGates(gates) {
  if (gates.length === 0) {
    return ['All gates may close.'];
  }

  return gates.flatMap((gate) => [
    `### ${gate.id}`,
    '',
    `- Validation output: ${gate.validationOutput}`,
    `- Failure count: ${gate.failureCount}`,
    '',
    'Top failures:',
    ...gate.topFailures.map((failure) => {
      const artifact = failure.artifact ? ` (${failure.artifact})` : '';
      return `- ${failure.code}: ${failure.detail}${artifact}`;
    }),
    '',
  ]);
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/evaluate-release-closeout.mjs --evidence-root <release-report-dir>

Options:
  --gate <id>       Evaluate a specific gate. Repeatable. Defaults to the real closeout gates.
  --output <path>   Output JSON path. Markdown is written beside it.
  --matrix <path>   Override matrix path.

This tool reads evidence artifacts only. It does not run live commands or mutate DB state.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const decision = await evaluateReleaseCloseout({
      evidenceRoot: options.evidenceRoot,
      matrixPath: options.matrixPath,
      gateIds: options.gateIds,
    });
    const outputs = await writeCloseoutDecision({
      decision,
      outputPath: options.outputPath,
    });

    console.log(`Release closeout decision: ${decision.status}`);
    console.log(`May close all: ${decision.mayCloseAll ? 'yes' : 'no'}`);
    console.log(`Open gates: ${decision.openGateCount}`);
    console.log(`Decision JSON: ${outputs.jsonPath}`);
    process.exitCode = decision.mayCloseAll ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
