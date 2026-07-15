#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const C19_GATE_ID = 'c19-runtime-publication-release-rollback';
const T2_WINDOW_CODE_PATTERN = /^t2-[a-z0-9-]+:W\d{2}$/;

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    handoffFile: null,
    runtimeInputFile: null,
    output: null,
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

    if (arg === '--handoff-file') {
      options.handoffFile = path.resolve(nextValue());
    } else if (arg === '--runtime-input-file') {
      options.runtimeInputFile = path.resolve(nextValue());
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue());
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.handoffFile) {
    throw new Error('--handoff-file is required');
  }
  if (!options.help && !options.runtimeInputFile) {
    throw new Error('--runtime-input-file is required');
  }

  return options;
}

export async function checkC19RuntimeInput({
  handoffFile,
  runtimeInputFile,
  now = new Date(),
} = {}) {
  if (!handoffFile) throw new Error('handoffFile is required');
  if (!runtimeInputFile) throw new Error('runtimeInputFile is required');

  const [handoff, runtimeInput] = await Promise.all([
    readJson(handoffFile),
    readJson(runtimeInputFile),
  ]);
  const c19 = handoff.gates?.[C19_GATE_ID] ?? {};
  const release = c19.release ?? {};
  const failures = [];
  const warnings = [];

  requireText(failures, 'targets.projectId', c19.targets?.projectId);
  requireText(failures, 'release.phase1L5Ref', release.phase1L5Ref);
  requireText(failures, 'release.releaseClosureArtifactRef', release.releaseClosureArtifactRef);
  requireText(failures, 'release.rollbackTargetRef', release.rollbackTargetRef);
  requireText(failures, 'release.monitoringWindow', release.monitoringWindow);
  requireText(failures, 'approvals.manualApprovalRef', c19.approvals?.manualApprovalRef);
  requireText(failures, 'owners.consumerObservationOwner', c19.owners?.consumerObservationOwner);
  requireText(failures, 'owners.monitoringOwner', c19.owners?.monitoringOwner);
  requireText(failures, 'owners.rollbackOwner', c19.owners?.rollbackOwner);

  requireText(failures, 'runtimeInput.projectStartDate', runtimeInput.projectStartDate);
  requireArray(failures, 'runtimeInput.approvalEvidenceRefs', runtimeInput.approvalEvidenceRefs);
  requireArray(failures, 'runtimeInput.consumerVerificationRefs', runtimeInput.consumerVerificationRefs);
  requireArray(failures, 'runtimeInput.impactMonitoringRefs', runtimeInput.impactMonitoringRefs);
  requireText(failures, 'runtimeInput.eventStatus', runtimeInput.eventStatus);
  requireText(failures, 'runtimeInput.rollbackReason', runtimeInput.rollbackReason);
  requireArray(failures, 'runtimeInput.rollbackEvidenceRefs', runtimeInput.rollbackEvidenceRefs);
  requireArray(failures, 'runtimeInput.taskMappings', runtimeInput.taskMappings);
  requireArray(failures, 'runtimeInput.networkNodes', runtimeInput.networkNodes);
  requireArray(failures, 'runtimeInput.networkEdges', runtimeInput.networkEdges);

  const taskMappings = Array.isArray(runtimeInput.taskMappings) ? runtimeInput.taskMappings : [];
  const networkNodes = Array.isArray(runtimeInput.networkNodes) ? runtimeInput.networkNodes : [];
  const networkEdges = Array.isArray(runtimeInput.networkEdges) ? runtimeInput.networkEdges : [];
  const mappedNodeIds = new Set(taskMappings.map((item) => normalizeText(item?.nodeId)).filter(Boolean));
  const nodeIds = new Set(networkNodes.map((item) => normalizeText(item?.nodeId)).filter(Boolean));

  for (const [index, node] of networkNodes.entries()) {
    const nodeId = normalizeText(node?.nodeId);
    if (!nodeId) failures.push(fieldFailure(`runtimeInput.networkNodes[${index}].nodeId`, 'nodeId is required'));
    if (nodeId && !mappedNodeIds.has(nodeId)) {
      failures.push(fieldFailure(`runtimeInput.networkNodes[${index}].nodeId`, `node ${nodeId} has no task mapping`));
    }
    if (!normalizeText(node?.templateId)) failures.push(fieldFailure(`runtimeInput.networkNodes[${index}].templateId`, 'templateId is required'));
    const windowCode = normalizeText(node?.windowCode);
    if (!windowCode) {
      failures.push(fieldFailure(`runtimeInput.networkNodes[${index}].windowCode`, 'windowCode is required'));
    } else if (!T2_WINDOW_CODE_PATTERN.test(windowCode)) {
      failures.push(fieldFailure(`runtimeInput.networkNodes[${index}].windowCode`, 'windowCode must use canonical T2 package window format, for example t2-residential-standard-floor-structure-rhythm-v1:W01'));
    }
    if (!Number.isFinite(Number(node?.startDay))) failures.push(fieldFailure(`runtimeInput.networkNodes[${index}].startDay`, 'startDay must be numeric'));
    if (!Number.isFinite(Number(node?.finishDay))) failures.push(fieldFailure(`runtimeInput.networkNodes[${index}].finishDay`, 'finishDay must be numeric'));
  }

  for (const [index, mapping] of taskMappings.entries()) {
    const nodeId = normalizeText(mapping?.nodeId);
    if (!nodeId) failures.push(fieldFailure(`runtimeInput.taskMappings[${index}].nodeId`, 'nodeId is required'));
    if (!normalizeText(mapping?.taskId)) failures.push(fieldFailure(`runtimeInput.taskMappings[${index}].taskId`, 'taskId is required'));
    if (nodeId && !nodeIds.has(nodeId)) {
      warnings.push(fieldFailure(`runtimeInput.taskMappings[${index}].nodeId`, `mapping ${nodeId} does not match a network node`));
    }
  }

  for (const [index, edge] of networkEdges.entries()) {
    const predecessor = normalizeText(edge?.predecessorNodeId);
    const successor = normalizeText(edge?.successorNodeId);
    if (!predecessor) failures.push(fieldFailure(`runtimeInput.networkEdges[${index}].predecessorNodeId`, 'predecessorNodeId is required'));
    if (!successor) failures.push(fieldFailure(`runtimeInput.networkEdges[${index}].successorNodeId`, 'successorNodeId is required'));
    if (predecessor && !nodeIds.has(predecessor)) {
      failures.push(fieldFailure(`runtimeInput.networkEdges[${index}].predecessorNodeId`, `unknown predecessor node ${predecessor}`));
    }
    if (successor && !nodeIds.has(successor)) {
      failures.push(fieldFailure(`runtimeInput.networkEdges[${index}].successorNodeId`, `unknown successor node ${successor}`));
    }
    const predecessorWindowCode = normalizeText(edge?.predecessorWindowCode);
    const successorWindowCode = normalizeText(edge?.successorWindowCode);
    if (!predecessorWindowCode) {
      failures.push(fieldFailure(`runtimeInput.networkEdges[${index}].predecessorWindowCode`, 'predecessorWindowCode is required'));
    } else if (!T2_WINDOW_CODE_PATTERN.test(predecessorWindowCode)) {
      failures.push(fieldFailure(`runtimeInput.networkEdges[${index}].predecessorWindowCode`, 'predecessorWindowCode must use canonical T2 package window format'));
    }
    if (!successorWindowCode) {
      failures.push(fieldFailure(`runtimeInput.networkEdges[${index}].successorWindowCode`, 'successorWindowCode is required'));
    } else if (!T2_WINDOW_CODE_PATTERN.test(successorWindowCode)) {
      failures.push(fieldFailure(`runtimeInput.networkEdges[${index}].successorWindowCode`, 'successorWindowCode must use canonical T2 package window format'));
    }
  }

  const canWriteTaskDependencies = runtimeInput.canWriteTaskDependencies !== false;
  const canWritePlanDates = runtimeInput.canWritePlanDates !== false;
  if (!canWriteTaskDependencies) {
    failures.push(fieldFailure('runtimeInput.canWriteTaskDependencies', 'runtime dependency write approval is required'));
  }
  if (!canWritePlanDates) {
    failures.push(fieldFailure('runtimeInput.canWritePlanDates', 'runtime plan date write approval is required'));
  }

  return {
    schemaVersion: 'workbuddy-c19-runtime-input-check/v1',
    checkedAt: now.toISOString(),
    handoffFile,
    runtimeInputFile,
    status: failures.length === 0 ? 'pass' : 'fail',
    counts: {
      failures: failures.length,
      warnings: warnings.length,
      taskMappings: taskMappings.length,
      networkNodes: networkNodes.length,
      networkEdges: networkEdges.length,
    },
    failures,
    warnings,
    boundary: {
      liveMutation: false,
      dbMutation: false,
      note: 'This checker validates C19 runtime publication input shape only. It does not connect to live services or execute runtime publication writes.',
    },
  };
}

function requireText(failures, field, value) {
  if (!normalizeText(value)) failures.push(fieldFailure(field, 'required text is missing'));
}

function requireArray(failures, field, value) {
  if (!Array.isArray(value) || value.length === 0) {
    failures.push(fieldFailure(field, 'required non-empty array is missing'));
  }
}

function fieldFailure(field, message) {
  return {
    code: 'runtime-input-field-invalid',
    field,
    message,
  };
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/check-c19-runtime-input.mjs --handoff-file <handoff.json> --runtime-input-file <runtime-input.json> --output <check.json>

This checker is read-only. It validates runtime publication input before guarded C19 apply/monitor/rollback.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const report = await checkC19RuntimeInput(options);
    if (options.output) {
      await writeJson(options.output, report);
    }

    console.log(`C19 runtime input check: ${report.status}`);
    console.log(`Failures: ${report.counts.failures}`);
    process.exitCode = report.status === 'pass' ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
