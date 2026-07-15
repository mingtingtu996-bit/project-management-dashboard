#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');

const REQUIRED_ARTIFACTS = [
  ['C-18.L07', 'c18-l07-critical-path-concurrency-live.json'],
  ['C-18.L08', 'c18-l08-acceptance-status-concurrency-live.json'],
  ['C-18.L09', 'c18-l09-wizard-commit-live.json'],
  ['C-18.L10', 'c18-l10-wbs-generation-pressure.json'],
  ['C-18.L11', 'c18-l11-warning-sync-query-log.json'],
  ['C-18.L12', 'c18-l12-critical-path-network-pressure.json'],
  ['C-18.L14', 'c18-l14-company-summary-pressure.json'],
  ['C-18.L15', 'c18-l15-spreadsheet-migration-replay.json'],
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    artifactRoot: null,
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

export async function writeC18L07L15LiveEvidenceSummary({
  artifactRoot,
  output = '',
  now = new Date(),
} = {}) {
  if (!artifactRoot) {
    throw new Error('artifactRoot is required');
  }

  const root = path.resolve(artifactRoot);
  const outputPath = path.resolve(output || path.join(root, 'c18-live-evidence-summary.json'));
  const items = [];
  const failures = [];

  for (const [itemId, filename] of REQUIRED_ARTIFACTS) {
    const filePath = path.join(root, filename);
    const document = await readOptionalJson(filePath);
    const status = resolveArtifactStatus(document);
    const exitCode = document?.exitCode ?? document?.checks?.exitCode ?? null;
    const item = {
      itemId,
      artifact: toRepoRelativeRef(filePath),
      status: status || 'missing',
      environment: document?.environment ?? null,
      diagnosticRunId: document?.diagnosticRunId ?? null,
      exitCode,
      targetIdsPresent: hasValue(document, 'targetIds'),
      cleanupReadbackPresent: hasValue(document, 'cleanupReadback'),
    };
    items.push(item);

    if (!document) {
      failures.push({ itemId, artifact: filename, reason: 'artifact_missing_or_invalid_json' });
    } else if (!['pass', 'ready', 'closed'].includes(status)) {
      failures.push({ itemId, artifact: filename, reason: `artifact_status_${status || 'missing'}` });
    }
  }

  const summary = {
    schemaVersion: 'workbuddy-c18-l07-l15-live-evidence-summary/v1',
    generatedAt: now.toISOString(),
    gateId: 'c18-l07-l15-live-diagnostics',
    status: failures.length === 0 ? 'pass' : 'blocked',
    environment: firstNonEmpty(items.map((item) => item.environment)) || 'mixed-live-evidence',
    diagnosticRunId: `c18-l07-l15-summary-${compactTimestamp(now)}`,
    command: 'node project-testing/tools/write-c18-l07-l15-live-evidence-summary.mjs',
    exitCode: failures.length === 0 ? 0 : 1,
    artifactPath: toRepoRelativeRef(outputPath),
    targetIds: {
      evidenceRoot: toRepoRelativeRef(root),
    },
    startedAt: now.toISOString(),
    finishedAt: now.toISOString(),
    cleanupReadback: {
      status: failures.length === 0 ? 'pass' : 'blocked',
      note: 'Per-artifact cleanup/readback is preserved in the referenced C-18 L07-L15 evidence files.',
    },
    canClaimC18L07L15Closeout: failures.length === 0,
    counts: {
      expectedArtifacts: REQUIRED_ARTIFACTS.length,
      passedArtifacts: items.filter((item) => ['pass', 'ready', 'closed'].includes(item.status)).length,
      failures: failures.length,
    },
    items,
    failures,
    boundary: {
      liveMutation: false,
      dbMutation: false,
      note: 'Summary-only artifact. It does not execute live diagnostics; it summarizes archived C-18 L07-L15 evidence in this handoff root.',
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return {
    ...summary,
    outputPath,
  };
}

async function readOptionalJson(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasValue(value, key) {
  if (Array.isArray(value)) {
    return value.some((item) => hasValue(item, key));
  }
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(value, key)) {
    const item = value[key];
    return item !== null && item !== undefined && item !== '';
  }
  return Object.values(value).some((item) => hasValue(item, key));
}

function firstNonEmpty(values) {
  return values.map(normalizeText).find(Boolean) ?? '';
}

function resolveArtifactStatus(document) {
  if (!document) {
    return '';
  }

  const topLevelStatus = normalizeToken(document.status ?? '');
  const assessmentStatuses = [
    document.routeEvidenceAssessment?.status,
    document.dbEvidenceAssessment?.status,
  ]
    .map(normalizeToken)
    .filter(Boolean);

  const failingAssessmentStatus = assessmentStatuses.find((status) => !isPassStatus(status));
  if (failingAssessmentStatus) {
    return failingAssessmentStatus;
  }

  if (topLevelStatus) {
    return topLevelStatus;
  }

  if (assessmentStatuses.length > 0 && assessmentStatuses.every(isPassStatus)) {
    return 'pass';
  }

  return '';
}

function isPassStatus(status) {
  return ['pass', 'ready', 'closed'].includes(normalizeToken(status));
}

function compactTimestamp(value) {
  return value.toISOString().replaceAll(/[-:.]/g, '').replace('T', '-').replace('Z', '');
}

function toRepoRelativeRef(value) {
  const resolved = path.resolve(value);
  return path.relative(REPO_ROOT, resolved).replace(/\\/g, '/');
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeToken(value) {
  return normalizeText(value)
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replaceAll(/[_\s./:]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .toLowerCase();
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/write-c18-l07-l15-live-evidence-summary.mjs --artifact-root <dir>

Writes c18-live-evidence-summary.json for the C-18 L07-L15 closeout gate from archived evidence files.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }
    const report = await writeC18L07L15LiveEvidenceSummary(options);
    console.log(`C-18 L07-L15 summary: ${report.status}`);
    console.log(`Failures: ${report.counts.failures}`);
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
