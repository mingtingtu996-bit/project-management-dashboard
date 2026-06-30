#!/usr/bin/env node

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing/reports');

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    reportRoot: DEFAULT_REPORT_ROOT,
    handoffPackPath: null,
    handoffReadinessPath: null,
    closeoutDecisionPath: null,
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

    if (arg === '--report-root') {
      options.reportRoot = path.resolve(nextValue());
    } else if (arg === '--handoff-pack') {
      options.handoffPackPath = path.resolve(nextValue());
    } else if (arg === '--handoff-readiness') {
      options.handoffReadinessPath = path.resolve(nextValue());
    } else if (arg === '--closeout-decision') {
      options.closeoutDecisionPath = path.resolve(nextValue());
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

export async function summarizeReleaseCloseoutStatus({
  reportRoot = DEFAULT_REPORT_ROOT,
  handoffPackPath = null,
  handoffReadinessPath = null,
  closeoutDecisionPath = null,
  now = new Date(),
} = {}) {
  const root = path.resolve(reportRoot);
  const files = await listFiles(root);
  const inputs = {
    handoffPack: await readOptionalJson(handoffPackPath ?? latestByBasename(files, 'handoff-plan.json')),
    handoffReadiness: await readOptionalJson(
      handoffReadinessPath ?? await latestJsonByBasenamePattern(files, /^handoff-readiness(?:\.[\w-]+)?\.json$/u, [
        'evaluatedAt',
        'generatedAt',
        'checkedAt',
        'validatedAt',
      ]),
    ),
    closeoutDecision: await readOptionalJson(
      closeoutDecisionPath ?? await latestJsonByBasename(files, 'closeout-decision.json', [
        'evaluatedAt',
        'generatedAt',
        'validatedAt',
      ]),
    ),
  };
  const stages = buildStages(inputs);
  const openGateIds = collectOpenGateIds(inputs);
  const consistencyIssues = collectConsistencyIssues({ stages, inputs });
  const mayCloseAll = stages.handoffReadiness.status === 'pass' && stages.closeoutDecision.status === 'pass';
  const nextActions = deriveNextActions({
    stages,
    inputs,
    openGateIds,
    consistencyIssues,
  });

  return {
    schemaVersion: 'workbuddy-release-closeout-status-index/v1',
    reportRoot: root,
    generatedAt: now.toISOString(),
    overallStatus: deriveOverallStatus(stages, openGateIds),
    mayRunLiveOrDb: stages.handoffReadiness.status === 'pass',
    mayCloseAll,
    openGateIds,
    stages,
    inputs: Object.fromEntries(Object.entries(inputs).map(([key, value]) => [
      key,
      summarizeInput(value),
    ])),
    evidenceSummary: summarizeEvidence(inputs),
    consistencyIssues,
    nextActions,
    boundary: {
      indexOnly: true,
      planningOnly: true,
      commandsExecuted: 0,
      note: 'This index reads existing project-testing reports only. It does not run live commands, mutate DB state, or validate new evidence by itself. See evidenceSummary for the archived evidence mutation/noop boundaries.',
    },
  };
}

function buildStages(inputs) {
  return {
    handoffPack: {
      status: inputs.handoffPack.document ? 'pass' : 'missing',
      ready: Boolean(inputs.handoffPack.document),
      detail: inputs.handoffPack.document
        ? `${inputs.handoffPack.document.gates?.length ?? 0} gate(s) in handoff plan`
        : 'No handoff-plan.json found',
    },
    handoffReadiness: {
      status: inputs.handoffReadiness.document?.status ?? 'missing',
      ready: inputs.handoffReadiness.document?.readyToRun === true,
      detail: inputs.handoffReadiness.document
        ? `${inputs.handoffReadiness.document.blockedGateCount ?? 0} blocked gate(s), ${inputs.handoffReadiness.document.secretLeakCount ?? 0} secret leak(s)`
        : 'No handoff-readiness.json found',
    },
    closeoutDecision: {
      status: inputs.closeoutDecision.document?.status ?? 'missing',
      ready: inputs.closeoutDecision.document?.mayCloseAll === true,
      detail: inputs.closeoutDecision.document
        ? `${inputs.closeoutDecision.document.openGateCount ?? 0} open gate(s)`
        : 'No closeout-decision.json found',
    },
  };
}

function collectOpenGateIds(inputs) {
  if (inputs.handoffReadiness.document?.status !== 'pass' && Array.isArray(inputs.handoffReadiness.document?.gates)) {
    return inputs.handoffReadiness.document.gates
      .filter((gate) => gate.readyToRun === false)
      .map((gate) => gate.id);
  }

  if (Array.isArray(inputs.closeoutDecision.document?.decision?.openGateIds)) {
    return inputs.closeoutDecision.document.decision.openGateIds;
  }

  if (Array.isArray(inputs.handoffReadiness.document?.gates)) {
    return inputs.handoffReadiness.document.gates
      .filter((gate) => gate.readyToRun === false)
      .map((gate) => gate.id);
  }

  return [];
}

function deriveOverallStatus(stages, openGateIds) {
  if (stages.handoffReadiness.status !== 'pass') {
    if (stages.handoffPack.status === 'pass') {
      return 'handoff-not-ready';
    }

    return openGateIds.length > 0 ? 'open' : 'missing-handoff-pack';
  }

  if (stages.closeoutDecision.status === 'pass') {
    return 'closeout-ready';
  }

  return 'ready-for-live-db-execution';
}

function collectConsistencyIssues({ stages, inputs }) {
  const issues = [];

  if (stages.handoffReadiness.status !== 'pass' && stages.closeoutDecision.status === 'pass') {
    issues.push({
      code: 'closeout-decision-ignored-while-handoff-not-ready',
      severity: 'blocking',
      detail: 'A passing closeout decision exists, but the selected handoff readiness is not pass. Do not use archived or cross-environment closeout evidence as the current live/DB execution pass.',
      handoffReadinessPath: inputs.handoffReadiness.path,
      closeoutDecisionPath: inputs.closeoutDecision.path,
    });
  }

  return issues;
}

function deriveNextActions({
  stages,
  inputs,
  openGateIds,
  consistencyIssues = [],
}) {
  const actions = [];

  for (const issue of consistencyIssues) {
    actions.push(`${issue.code}: ${issue.detail}`);
  }

  if (stages.handoffPack.status !== 'pass') {
    actions.push('Generate a planning-only handoff pack with generate-release-handoff-pack.mjs.');
  }

  if (stages.handoffReadiness.status !== 'pass') {
    actions.push('Prepare a handoff declaration from release-handoff-template.json and pass check-release-handoff-readiness.mjs.');
    const blocked = inputs.handoffReadiness.document?.gates
      ?.filter((gate) => gate.readyToRun === false)
      ?.map((gate) => {
        const blockingDetails = Array.isArray(gate.blockingIssues) && gate.blockingIssues.length > 0
          ? gate.blockingIssues.map((issue) => `${issue.code}: ${issue.detail}`).join('; ')
          : `${gate.missingFlags.length} missing flag(s), ${gate.missingFields.length} missing field(s)`;
        return `${gate.id}: ${blockingDetails}`;
      });
    if (blocked?.length) {
      actions.push(...blocked);
    }
  }

  if (stages.handoffReadiness.status === 'pass' && stages.closeoutDecision.status !== 'pass') {
    actions.push('Run authorized live/db commands, archive artifacts, validate evidence, then run evaluate-release-closeout.mjs.');
  }

  if (stages.closeoutDecision.status === 'fail') {
    actions.push(`Keep ${openGateIds.length} gate(s) open: ${openGateIds.join(', ')}`);
  }

  if (actions.length === 0) {
    actions.push('All real-environment closeout gates may close according to the available decision report.');
  }

  return actions;
}

function summarizeEvidence(inputs) {
  const decision = inputs.closeoutDecision.document;
  const gates = Array.isArray(decision?.gates) ? decision.gates : [];
  const gateSummaries = gates.map((gate) => {
    const mutation = gate.mutationSummary ?? {};
    const alternate = gate.alternateCloseout ?? null;
    return {
      id: gate.id,
      tier: gate.tier ?? null,
      validationStatus: gate.validationStatus ?? null,
      mayClose: gate.mayClose === true,
      closeoutMode: gate.closeoutMode ?? alternate?.mode ?? 'standard',
      hasLiveMutationEvidence: mutation.hasLiveMutationEvidence === true,
      hasDbMutationEvidence: mutation.hasDbMutationEvidence === true,
      physicalDropExecuted: mutation.physicalDropExecuted === true || alternate?.physicalDropExecuted === true,
      alternateCloseout: alternate,
    };
  });

  return {
    source: inputs.closeoutDecision.path,
    gateCount: gateSummaries.length,
    liveMutationEvidenceGateIds: gateSummaries.filter((gate) => gate.hasLiveMutationEvidence).map((gate) => gate.id),
    dbMutationEvidenceGateIds: gateSummaries.filter((gate) => gate.hasDbMutationEvidence).map((gate) => gate.id),
    physicalDropExecutedGateIds: gateSummaries.filter((gate) => gate.physicalDropExecuted).map((gate) => gate.id),
    noSafeCandidateGateIds: gateSummaries.filter((gate) => gate.closeoutMode === 'no_safe_candidate').map((gate) => gate.id),
    gates: gateSummaries,
  };
}

function summarizeInput(input) {
  return {
    path: input.path,
    exists: Boolean(input.document),
    schemaVersion: input.document?.schemaVersion ?? null,
    status: input.document?.status ?? null,
  };
}

async function readOptionalJson(filePath) {
  if (!filePath) {
    return {
      path: null,
      document: null,
    };
  }

  try {
    const raw = await readFile(filePath, 'utf8');
    return {
      path: path.resolve(filePath),
      document: JSON.parse(raw),
    };
  } catch {
    return {
      path: path.resolve(filePath),
      document: null,
    };
  }
}

async function listFiles(root) {
  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      return [];
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const results = [];

  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        results.push({
          path: fullPath,
          basename: path.basename(fullPath),
          relativePath: path.relative(root, fullPath).replaceAll(path.sep, '/'),
        });
      }
    }
  }

  await walk(root);
  return results;
}

function latestByBasename(files, basename) {
  const matches = files
    .filter((file) => file.basename === basename)
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  return matches.at(-1)?.path ?? null;
}

async function latestJsonByBasename(files, basename, timestampKeys = []) {
  const matches = files.filter((file) => file.basename === basename);
  return latestJsonFile(matches, timestampKeys);
}

async function latestJsonByBasenamePattern(files, basenamePattern, timestampKeys = []) {
  const matches = files.filter((file) => basenamePattern.test(file.basename));
  return latestJsonFile(matches, timestampKeys);
}

async function latestJsonFile(matches, timestampKeys = []) {
  const ranked = [];

  for (const file of matches) {
    ranked.push({
      file,
      timestamp: await readJsonTimestamp(file.path, timestampKeys),
    });
  }

  ranked.sort((left, right) => {
    if (left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }

    return left.file.relativePath.localeCompare(right.file.relativePath);
  });

  return ranked.at(-1)?.file.path ?? null;
}

async function readJsonTimestamp(filePath, timestampKeys) {
  try {
    const raw = await readFile(filePath, 'utf8');
    const document = JSON.parse(raw);

    for (const key of timestampKeys) {
      const timestamp = Date.parse(document?.[key]);
      if (Number.isFinite(timestamp)) {
        return timestamp;
      }
    }
  } catch {
    return 0;
  }

  return 0;
}

export async function writeStatusIndex({
  index,
  outputPath,
}) {
  const jsonPath = outputPath
    ? path.resolve(outputPath)
    : path.join(index.reportRoot, 'closeout-status-index.json');
  const markdownPath = jsonPath.endsWith('.json')
    ? jsonPath.replace(/\.json$/u, '.md')
    : `${jsonPath}.md`;

  await writeFile(jsonPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, renderMarkdown(index), 'utf8');

  return {
    jsonPath,
    markdownPath,
  };
}

function renderMarkdown(index) {
  const lines = [
    '# WorkBuddy Release Closeout Status Index',
    '',
    `- Overall status: ${index.overallStatus}`,
    `- May run live/DB: ${index.mayRunLiveOrDb ? 'yes' : 'no'}`,
    `- May close all: ${index.mayCloseAll ? 'yes' : 'no'}`,
    `- Index commands executed: ${index.boundary.commandsExecuted}`,
    `- Evidence live mutation gates: ${formatGateList(index.evidenceSummary?.liveMutationEvidenceGateIds)}`,
    `- Evidence DB mutation gates: ${formatGateList(index.evidenceSummary?.dbMutationEvidenceGateIds)}`,
    `- Physical DROP executed gates: ${formatGateList(index.evidenceSummary?.physicalDropExecutedGateIds)}`,
    `- No-safe-candidate gates: ${formatGateList(index.evidenceSummary?.noSafeCandidateGateIds)}`,
    '',
    '## Stages',
    '',
    '| Stage | Status | Ready | Detail |',
    '| --- | --- | --- | --- |',
    ...Object.entries(index.stages).map(([stage, value]) => {
      return `| ${stage} | ${value.status} | ${value.ready ? 'yes' : 'no'} | ${value.detail} |`;
    }),
    '',
    '## Open Gates',
    '',
    ...renderList(index.openGateIds.length ? index.openGateIds : ['None recorded.']),
    '',
    '## Next Actions',
    '',
    ...renderList(index.nextActions),
    '',
    '## Consistency Issues',
    '',
    ...renderConsistencyIssues(index.consistencyIssues),
    '',
    '## Evidence Summary',
    '',
    '| Gate | Validation | May close | Mode | Live mutation evidence | DB mutation evidence | Physical DROP |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...renderEvidenceRows(index.evidenceSummary?.gates ?? []),
    '',
    '## Boundary',
    '',
    `- Index only: ${index.boundary.indexOnly ? 'yes' : 'no'}`,
    `- Planning only: ${index.boundary.planningOnly ? 'yes' : 'no'}`,
    `- Note: ${index.boundary.note}`,
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function renderList(items) {
  return items.map((item) => `- ${item}`);
}

function renderConsistencyIssues(issues = []) {
  if (!issues.length) {
    return ['- None recorded.'];
  }

  return issues.map((issue) => `- ${issue.severity}: ${issue.code} - ${issue.detail}`);
}

function formatGateList(items = []) {
  return items.length > 0 ? items.join(', ') : 'none';
}

function renderEvidenceRows(gates) {
  if (!gates.length) {
    return ['| None recorded. | - | - | - | - | - | - |'];
  }

  return gates.map((gate) => {
    return `| ${gate.id} | ${gate.validationStatus ?? '-'} | ${gate.mayClose ? 'yes' : 'no'} | ${gate.closeoutMode ?? 'standard'} | ${gate.hasLiveMutationEvidence ? 'yes' : 'no'} | ${gate.hasDbMutationEvidence ? 'yes' : 'no'} | ${gate.physicalDropExecuted ? 'yes' : 'no'} |`;
  });
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/summarize-release-closeout-status.mjs --report-root project-testing/reports

Options:
  --handoff-pack <path>       Explicit handoff-plan.json path
  --handoff-readiness <path>  Explicit handoff-readiness.json path
  --closeout-decision <path>  Explicit closeout-decision.json path
  --output <path>             Output JSON path. Markdown is written beside it.

This tool reads project-testing reports only. It does not run live commands, mutate DB state, or execute release scripts.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const index = await summarizeReleaseCloseoutStatus(options);
    const outputs = await writeStatusIndex({
      index,
      outputPath: options.outputPath,
    });

    console.log(`Closeout status: ${index.overallStatus}`);
    console.log(`May run live/DB: ${index.mayRunLiveOrDb ? 'yes' : 'no'}`);
    console.log(`May close all: ${index.mayCloseAll ? 'yes' : 'no'}`);
    console.log(`Status JSON: ${outputs.jsonPath}`);
    process.exitCode = index.mayCloseAll ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
