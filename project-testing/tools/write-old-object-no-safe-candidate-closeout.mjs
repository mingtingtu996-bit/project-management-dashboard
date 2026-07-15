#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');
const DEFAULT_FULL_DISCOVERY = 'old-object-candidate-discovery.all.json';
const DEFAULT_NAME_HINT_DISCOVERY = 'old-object-candidate-discovery.json';
const DEFAULT_GUARD = 'legacy-object-drop-guard.initial.json';
const DEFAULT_OUTPUT = 'old-object-no-safe-candidate-closeout.json';

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    artifactRoot: null,
    fullDiscoveryFile: '',
    nameHintDiscoveryFile: '',
    guardFile: '',
    output: '',
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

    if (arg === '--artifact-root') {
      options.artifactRoot = path.resolve(nextValue());
    } else if (arg === '--full-discovery-file') {
      options.fullDiscoveryFile = path.resolve(nextValue());
    } else if (arg === '--name-hint-discovery-file') {
      options.nameHintDiscoveryFile = path.resolve(nextValue());
    } else if (arg === '--guard-file') {
      options.guardFile = path.resolve(nextValue());
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue());
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.artifactRoot) {
    throw new Error('--artifact-root is required');
  }

  return options;
}

export async function writeOldObjectNoSafeCandidateCloseout({
  artifactRoot,
  fullDiscoveryFile = '',
  nameHintDiscoveryFile = '',
  guardFile = '',
  output = '',
  now = new Date(),
} = {}) {
  if (!artifactRoot) {
    throw new Error('artifactRoot is required');
  }

  const root = path.resolve(artifactRoot);
  const fullDiscoveryPath = path.resolve(fullDiscoveryFile || path.join(root, DEFAULT_FULL_DISCOVERY));
  const nameHintDiscoveryPath = path.resolve(nameHintDiscoveryFile || path.join(root, DEFAULT_NAME_HINT_DISCOVERY));
  const guardPath = path.resolve(guardFile || path.join(root, DEFAULT_GUARD));
  const outputPath = path.resolve(output || path.join(root, DEFAULT_OUTPUT));
  const failures = [];
  const fullDiscovery = await readRequiredJson(fullDiscoveryPath, failures, 'full-catalog-discovery');
  const nameHintDiscovery = await readOptionalJson(nameHintDiscoveryPath);
  const guard = await readRequiredJson(guardPath, failures, 'legacy-drop-guard');

  if (fullDiscovery) {
    validateDiscovery(fullDiscovery, {
      artifact: toRepoRelativeRef(fullDiscoveryPath),
      requireFullCatalog: true,
      failures,
    });
  }
  if (nameHintDiscovery) {
    validateDiscovery(nameHintDiscovery, {
      artifact: toRepoRelativeRef(nameHintDiscoveryPath),
      requireFullCatalog: false,
      failures,
    });
  }
  if (guard) {
    const guardCandidates = Array.isArray(guard.candidates) ? guard.candidates : [];
    if (guardCandidates.length !== 0) {
      failures.push(fieldFailure('legacy-drop-guard', 'guard candidates must be empty for no_safe_candidate closeout', toRepoRelativeRef(guardPath)));
    }
  }

  const status = failures.length === 0 ? 'pass' : 'fail';
  const generatedAt = now.toISOString();
  const closeout = {
    schemaVersion: 'workbuddy-old-object-no-safe-candidate-closeout/v1',
    generatedAt,
    gateId: 'old-object-physical-drop-closeout',
    status,
    closeoutMode: 'no_safe_candidate',
    databaseTarget: normalizeText(fullDiscovery?.databaseTarget),
    discoveryRef: toRepoRelativeRef(fullDiscoveryPath),
    fullCatalogDiscoveryRef: toRepoRelativeRef(fullDiscoveryPath),
    nameHintDiscoveryRef: nameHintDiscovery ? toRepoRelativeRef(nameHintDiscoveryPath) : '',
    guardRef: toRepoRelativeRef(guardPath),
    candidateCount: Number(fullDiscovery?.candidateCount ?? 0),
    candidates: [],
    inspectedCount: Number(fullDiscovery?.inspectedCount ?? 0),
    nameHintInspectedCount: Number(nameHintDiscovery?.inspectedCount ?? 0),
    exclusionSummary: summarizeInspected(fullDiscovery?.inspected),
    safeCandidateRule: fullDiscovery?.safeCandidateRule ?? {
      rowCountMustBeZero: true,
      nameHintRequired: true,
      dependencyReadbackMustPass: true,
      runtimeReferenceCountMustBeZero: true,
    },
    noSafeCandidateReason: normalizeText(fullDiscovery?.noSafeCandidateReason)
      || 'No safe DB object candidate was discovered; physical DROP is not applicable for this closeout run.',
    physicalDropExecuted: false,
    liveMutation: false,
    dbMutation: false,
    boundary: {
      liveMutation: false,
      dbMutation: false,
      physicalDropExecuted: false,
      note: 'Negative closeout only: the DB scan found no safe candidate, so no DROP, DDL apply, or post-drop smoke was executed.',
    },
    decision: {
      mayCloseAsNoOp: status === 'pass',
      mustNotClaimPhysicalDrop: true,
      physicalDropPathRequiredIfCandidatesAppear: true,
    },
    failures,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(closeout, null, 2)}\n`, 'utf8');
  return {
    ...closeout,
    outputPath,
  };
}

async function readRequiredJson(filePath, failures, detail) {
  try {
    return await readJson(filePath);
  } catch (error) {
    failures.push(fieldFailure(detail, `required JSON artifact cannot be read: ${error.message}`, toRepoRelativeRef(filePath)));
    return null;
  }
}

async function readOptionalJson(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function validateDiscovery(value, {
  artifact,
  requireFullCatalog,
  failures,
}) {
  if (value.schemaVersion !== 'workbuddy-old-object-drop-candidate-discovery/v1') {
    failures.push(fieldFailure('schemaVersion', 'discovery schemaVersion is not recognized', artifact));
  }
  if (value.status !== 'no_safe_candidate') {
    failures.push(fieldFailure('status', 'discovery status must be no_safe_candidate', artifact));
  }
  if (requireFullCatalog && (value.minNameHint === true || (value.discoveryMode && value.discoveryMode !== 'full_catalog'))) {
    failures.push(fieldFailure('discoveryMode', 'full catalog discovery is required; name-hint-only scans are supporting evidence only', artifact));
  }
  if (Number(value.candidateCount) !== 0) {
    failures.push(fieldFailure('candidateCount', 'candidateCount must be 0', artifact));
  }
  if (!Array.isArray(value.candidates) || value.candidates.length !== 0) {
    failures.push(fieldFailure('candidates', 'candidates must be an empty array', artifact));
  }
  if (!Number.isFinite(Number(value.inspectedCount)) || Number(value.inspectedCount) <= 0) {
    failures.push(fieldFailure('inspectedCount', 'inspectedCount must be greater than 0', artifact));
  }
  if (!Array.isArray(value.inspected) || value.inspected.length !== Number(value.inspectedCount)) {
    failures.push(fieldFailure('inspected', 'inspected array length must match inspectedCount', artifact));
  }
  if (value.physicalDropExecuted !== false) {
    failures.push(fieldFailure('physicalDropExecuted', 'physicalDropExecuted must be false', artifact));
  }
  if (value.boundary?.liveMutation !== false || value.boundary?.dbMutation !== false) {
    failures.push(fieldFailure('boundary', 'boundary must record liveMutation=false and dbMutation=false', artifact));
  }
}

function summarizeInspected(items) {
  const summary = {};
  for (const item of Array.isArray(items) ? items : []) {
    const key = normalizeText(item.status) || normalizeText(item.dependencyStatus) || 'unknown';
    summary[key] = (summary[key] ?? 0) + 1;
  }
  return summary;
}

function fieldFailure(field, message, artifact) {
  return {
    code: 'old-object-no-safe-candidate-invalid',
    field,
    artifact,
    message,
  };
}

function toRepoRelativeRef(value) {
  const resolved = path.resolve(value);
  return path.relative(REPO_ROOT, resolved).replace(/\\/g, '/');
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/write-old-object-no-safe-candidate-closeout.mjs --artifact-root <dir>

Writes old-object-no-safe-candidate-closeout.json from read-only discovery artifacts.
It never executes DROP and never mutates the database.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const report = await writeOldObjectNoSafeCandidateCloseout(options);
    console.log(`Old-object no-safe-candidate closeout: ${report.status}`);
    console.log(`Candidates: ${report.candidateCount}`);
    console.log(`Output: ${report.outputPath}`);
    process.exitCode = report.status === 'pass' ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
