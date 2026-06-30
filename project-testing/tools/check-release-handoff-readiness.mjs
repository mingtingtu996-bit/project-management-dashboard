#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadMatrix } from './validate-release-evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_MATRIX_PATH = path.join(REPO_ROOT, 'project-testing/matrix/release-test-matrix.json');
const DEFAULT_GATE_IDS = [
  'c18-l07-l15-live-diagnostics',
  'c15-live-learning-closeout',
  'c19-runtime-publication-release-rollback',
  'old-object-physical-drop-closeout',
];

const GATE_REQUIREMENTS = {
  'c18-l07-l15-live-diagnostics': {
    requiredFields: [
      'live.baseUrl',
      'live.authTokenRef',
      'live.environmentOwner',
      'live.writeApprovalRef',
      'live.cleanupOwner',
      'live.artifactRoot',
      'targets.projectId',
      'targets.planId',
    ],
    recommendedFields: [
      'evidenceOwners.backendDiagnosticsOwner',
      'evidenceOwners.databaseEvidenceOwner',
      'evidenceOwners.browserEvidenceOwner',
    ],
  },
  'c15-live-learning-closeout': {
    requiredFields: [
      'live.environmentOwner',
      'live.writeApprovalRef',
      'live.artifactRoot',
      'targets.companyId',
      'targets.projectId',
      'targets.candidateId',
      'targets.sampleCohortRef',
      'approvals.manualApprovalRef',
      'owners.monitoringOwner',
      'owners.rollbackOwner',
    ],
    recommendedFields: [
      'evidenceOwners.learningLoopOwner',
      'evidenceOwners.databaseEvidenceOwner',
    ],
  },
  'c19-runtime-publication-release-rollback': {
    requiredFields: [
      'live.environmentOwner',
      'live.writeApprovalRef',
      'live.artifactRoot',
      'targets.companyId',
      'targets.projectId',
      'release.phase1L5Ref',
      'release.releaseClosureArtifactRef',
      'approvals.manualApprovalRef',
      'owners.runtimePublicationOwner',
      'owners.consumerObservationOwner',
      'owners.monitoringOwner',
      'owners.rollbackOwner',
    ],
    recommendedFields: [
      'release.rollbackTargetRef',
      'release.monitoringWindow',
    ],
  },
  'old-object-physical-drop-closeout': {
    requiredFields: [
      'db.databaseTargetRef',
      'db.databaseReadinessOwner',
      'approvals.manualApprovalRef',
      'owners.migrationOwner',
      'owners.rollbackOwner',
      'owners.postDropSmokeOwner',
    ],
    recommendedFields: [
      'db.backupLocationRef',
      'db.catalogReadbackOwner',
      'db.apiBrowserSmokeOwner',
    ],
  },
};

const SECRET_FIELD_NAMES = new Set([
  'authToken',
  'jwt',
  'serviceRoleKey',
  'supabaseMigrationUrl',
  'databaseUrl',
  'password',
]);

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    handoffFile: null,
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

    if (arg === '--handoff-file') {
      options.handoffFile = path.resolve(nextValue());
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

  if (!options.help && !options.handoffFile) {
    throw new Error('--handoff-file is required');
  }

  return options;
}

export async function checkReleaseHandoffReadiness({
  handoffFile,
  matrixPath = DEFAULT_MATRIX_PATH,
  gateIds = DEFAULT_GATE_IDS,
  now = new Date(),
} = {}) {
  if (!handoffFile) {
    throw new Error('handoffFile is required');
  }

  const matrix = await loadMatrix(matrixPath);
  const raw = await readFile(handoffFile, 'utf8');
  const handoff = JSON.parse(raw);
  const selectedGateIds = gateIds.length > 0 ? gateIds : DEFAULT_GATE_IDS;
  const secretLeaks = findSecretLeaks(handoff);
  const refIssues = findReferenceIssues(handoff, [], buildServerSideEnvRefContext(handoff));
  const gates = selectedGateIds.map((gateId) => evaluateGateReadiness({
    gateId,
    matrix,
    handoff,
    secretLeaks,
    refIssues,
  }));
  const blockingIssues = gates.flatMap((gate) => gate.blockingIssues);

  return {
    schemaVersion: 'workbuddy-release-handoff-readiness/v1',
    handoffFile: path.resolve(handoffFile),
    evaluatedAt: now.toISOString(),
    status: blockingIssues.length === 0 ? 'pass' : 'fail',
    readyToRun: blockingIssues.length === 0,
    gateCount: gates.length,
    readyGateCount: gates.filter((gate) => gate.readyToRun).length,
    blockedGateCount: gates.filter((gate) => !gate.readyToRun).length,
    secretLeakCount: secretLeaks.length,
    secretLeaks,
    refIssueCount: refIssues.length,
    refIssues,
    gates,
    decision: {
      mayRunWhen: 'All selected gates have required unlock flags, target references, owners, approval refs, artifact root, no inline secrets, and resolvable non-placeholder env refs.',
      mustNotRunWhen: 'Any gate is missing required handoff fields, lacks live/db unlock confirmation, stores secret values instead of secret references, or points env refs at missing, empty, example, or placeholder values.',
    },
  };
}

function evaluateGateReadiness({
  gateId,
  matrix,
  handoff,
  secretLeaks,
  refIssues,
}) {
  const matrixGate = matrix.gateGroups.find((group) => group.id === gateId);
  if (!matrixGate) {
    throw new Error(`Unknown gate: ${gateId}`);
  }

  const requirements = GATE_REQUIREMENTS[gateId] ?? {
    requiredFields: [],
    recommendedFields: [],
  };
  const requiredFlags = matrixGate.unlockPolicy?.requiredFlags ?? [];
  const missingFlags = requiredFlags.filter((flag) => !hasFlag(handoff, flag));
  const gateHandoff = handoff.gates?.[gateId];
  const noSafeCandidateMode = gateId === 'old-object-physical-drop-closeout'
    && hasValue(gateHandoff, 'db.noSafeCandidateCloseoutRef');
  const requiredFields = noSafeCandidateMode
    ? requirements.requiredFields
    : [
        ...requirements.requiredFields,
        ...(gateId === 'old-object-physical-drop-closeout'
          ? [
              'db.candidateBundleRef',
              'db.ddlExportRef',
              'db.rollbackPlanRef',
              'db.migrationWindow',
            ]
          : []),
      ];
  const missingFields = requiredFields.filter((field) => !hasValue(gateHandoff, field));
  const placeholderFields = requiredFields
    .filter((field) => hasValue(gateHandoff, field))
    .map((field) => ({
      field,
      value: getValue(gateHandoff, field),
    }))
    .filter(({ value }) => isPlaceholderHandoffValue(value));
  const missingRecommendedFields = requirements.recommendedFields.filter((field) => !hasValue(handoff.gates?.[gateId], field));
  const gateSecretLeaks = secretLeaks.filter((leak) => leak.path.startsWith(`gates.${gateId}.`));
  const gateRefIssues = refIssues.filter((issue) => issue.path.startsWith(`gates.${gateId}.`));
  const blockingIssues = [
    ...missingFlags.map((flag) => ({
      code: 'unlock-flag-missing',
      detail: flag,
    })),
    ...missingFields.map((field) => ({
      code: 'handoff-field-missing',
      detail: field,
    })),
    ...placeholderFields.map(({ field }) => ({
      code: 'handoff-field-placeholder',
      detail: field,
    })),
    ...gateSecretLeaks.map((leak) => ({
      code: 'inline-secret-present',
      detail: leak.path,
    })),
    ...gateRefIssues.map((issue) => ({
      code: issue.code,
      detail: `${issue.path}: ${issue.reason}`,
    })),
  ];

  return {
    id: gateId,
    tier: matrixGate.tier,
    matrixStatus: matrixGate.status,
    closeoutMode: noSafeCandidateMode ? 'no_safe_candidate' : matrixGate.unlockPolicy?.operationMode ?? null,
    unlockPolicy: matrixGate.unlockPolicy ?? null,
    requiredFlags,
    missingFlags,
    requiredFields,
    missingFields,
    placeholderFields: placeholderFields.map(({ field }) => field),
    recommendedFields: requirements.recommendedFields,
    missingRecommendedFields,
    readyToRun: blockingIssues.length === 0,
    blockingIssues,
  };
}

function hasFlag(handoff, flag) {
  const normalized = flag.replace(/^--/u, '').replaceAll('-', '');
  const flags = handoff.unlockFlags ?? {};
  return Object.entries(flags).some(([key, value]) => {
    return key.toLowerCase().replaceAll(/[-_]/g, '') === normalized
      && value === true;
  });
}

function hasValue(scope, dottedPath) {
  if (!scope) {
    return false;
  }

  const value = dottedPath.split('.').reduce((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    return current[key];
  }, scope);

  return value !== null
    && value !== undefined
    && value !== ''
    && !(Array.isArray(value) && value.length === 0);
}

function getValue(scope, dottedPath) {
  if (!scope) {
    return undefined;
  }

  return dottedPath.split('.').reduce((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    return current[key];
  }, scope);
}

function isPlaceholderHandoffValue(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return isPlaceholderEnvValue(normalized)
    || normalized.includes('required')
    || normalized.includes('example.test')
    || normalized.includes('example.invalid')
    || normalized.startsWith('secure://production/')
    || normalized.startsWith('approval://production-required')
    || normalized === 'production-window-required';
}

function findSecretLeaks(value, pathParts = []) {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSecretLeaks(item, [...pathParts, String(index)]));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).flatMap(([key, item]) => {
    const currentPath = [...pathParts, key];
    const normalizedKey = key.toLowerCase();
    const exactSecretName = [...SECRET_FIELD_NAMES].some((name) => name.toLowerCase() === normalizedKey);
    const suspiciousSecretName = /token|secret|password|databaseurl|migrationurl/u.test(normalizedKey)
      && !/ref$/u.test(normalizedKey);
    const leaks = [];

    if ((exactSecretName || suspiciousSecretName) && typeof item === 'string' && item.trim()) {
      leaks.push({
        path: currentPath.join('.'),
        reason: 'Use a reference field such as authTokenRef or databaseTargetRef; do not place secret values in project-testing files.',
      });
    }

    return [...leaks, ...findSecretLeaks(item, currentPath)];
  });
}

function findReferenceIssues(value, pathParts = [], envRefContext = null) {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findReferenceIssues(item, [...pathParts, String(index)], envRefContext));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).flatMap(([key, item]) => {
    const currentPath = [...pathParts, key];
    const issues = [];
    if (typeof item === 'string' && /ref$/iu.test(key) && item.trim().startsWith('env://')) {
      const issue = validateEnvRef(item.trim(), currentPath.join('.'), envRefContext);
      if (issue) issues.push(issue);
    }
    return [...issues, ...findReferenceIssues(item, currentPath, envRefContext)];
  });
}

function validateEnvRef(ref, refPath, envRefContext = null) {
  const match = /^env:\/\/([^#]+)#([A-Z0-9_]+)$/u.exec(ref);
  if (!match) {
    return {
      code: 'env-ref-invalid',
      path: refPath,
      ref,
      reason: 'env ref must use env://relative/path.env#KEY format',
    };
  }

  const relativeFile = match[1].replaceAll('\\', '/');
  const key = match[2];
  const filePath = path.resolve(REPO_ROOT, relativeFile);
  const relativeResolved = path.relative(REPO_ROOT, filePath);
  if (relativeResolved.startsWith('..') || path.isAbsolute(relativeResolved)) {
    return {
      code: 'env-ref-invalid',
      path: refPath,
      ref,
      reason: 'env ref must stay inside repository-controlled handoff paths',
    };
  }

  const serverSideStatus = getServerSideEnvStatus(envRefContext, relativeFile, key);
  if (serverSideStatus) {
    if (serverSideStatus.nonEmpty) return null;
    return {
      code: 'env-ref-missing',
      path: refPath,
      ref,
      reason: `server-side env presence does not confirm a non-empty key: ${key}`,
    };
  }

  if (!existsSync(filePath)) {
    return {
      code: 'env-ref-missing',
      path: refPath,
      ref,
      reason: `env file does not exist: ${relativeFile}`,
    };
  }

  if (statSync(filePath).size === 0) {
    return {
      code: 'env-ref-missing',
      path: refPath,
      ref,
      reason: `env file is empty: ${relativeFile}`,
    };
  }

  if (/\.example$/iu.test(filePath) || /\.template$/iu.test(filePath)) {
    return {
      code: 'env-ref-placeholder',
      path: refPath,
      ref,
      reason: `env ref points at an example/template file: ${relativeFile}`,
    };
  }

  const env = parseEnvFile(readFileSync(filePath, 'utf8'));
  const value = String(env[key] ?? '').trim();
  if (!value) {
    return {
      code: 'env-ref-missing',
      path: refPath,
      ref,
      reason: `env key is missing or empty: ${key}`,
    };
  }

  if (isPlaceholderEnvValue(value)) {
    return {
      code: 'env-ref-placeholder',
      path: refPath,
      ref,
      reason: `env key contains a placeholder value: ${key}`,
    };
  }

  return null;
}

function buildServerSideEnvRefContext(handoff) {
  if (!handoff?.boundary?.serverSideDiscovery || handoff?.boundary?.envFileUploaded !== false) {
    return null;
  }
  const envPresence = handoff.envPresence;
  if (envPresence?.source !== 'server-side-sanitized-signals') {
    return null;
  }
  return {
    envFile: String(envPresence.envFile || 'deploy/env/server.production.env').replaceAll('\\', '/'),
    keyStatus: envPresence.keyStatus ?? {},
  };
}

function getServerSideEnvStatus(envRefContext, relativeFile, key) {
  if (!envRefContext || envRefContext.envFile !== relativeFile) {
    return null;
  }
  const status = envRefContext.keyStatus?.[key];
  if (typeof status === 'boolean') {
    return { present: status, nonEmpty: status };
  }
  if (!status || typeof status !== 'object') {
    return { present: false, nonEmpty: false };
  }
  return {
    present: status.present === true || status.nonEmpty === true,
    nonEmpty: status.nonEmpty === true,
  };
}

function parseEnvFile(source) {
  const env = {};
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function isPlaceholderEnvValue(value) {
  const normalized = value.trim().toLowerCase();
  return normalized === ''
    || normalized.includes('your-')
    || normalized.includes('your_')
    || normalized.includes('<tenant-or-ref>')
    || normalized.includes('change_me')
    || normalized.includes('change-me')
    || normalized.includes('changeme')
    || normalized.includes('placeholder')
    || normalized.includes('example.invalid')
    || normalized.includes('example.com')
    || /^x+$/u.test(normalized);
}

export async function writeHandoffReadinessReport({
  report,
  outputPath,
}) {
  const jsonPath = outputPath
    ? path.resolve(outputPath)
    : path.join(path.dirname(report.handoffFile), 'handoff-readiness.json');
  const markdownPath = jsonPath.endsWith('.json')
    ? jsonPath.replace(/\.json$/u, '.md')
    : `${jsonPath}.md`;

  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, renderMarkdown(report), 'utf8');

  return {
    jsonPath,
    markdownPath,
  };
}

function renderMarkdown(report) {
  const lines = [
    '# WorkBuddy Release Handoff Readiness',
    '',
    `- Status: ${report.status}`,
    `- Ready to run: ${report.readyToRun ? 'yes' : 'no'}`,
    `- Gates: ${report.gateCount}`,
    `- Ready gates: ${report.readyGateCount}`,
    `- Blocked gates: ${report.blockedGateCount}`,
    `- Secret leaks: ${report.secretLeakCount}`,
    `- Reference issues: ${report.refIssueCount}`,
    '',
    '## Gate Readiness',
    '',
    '| Gate | Tier | Ready | Missing flags | Missing required fields |',
    '| --- | --- | --- | ---: | ---: |',
    ...report.gates.map((gate) => {
      return `| ${gate.id} | ${gate.tier} | ${gate.readyToRun ? 'yes' : 'no'} | ${gate.missingFlags.length} | ${gate.missingFields.length} |`;
    }),
    '',
    '## Blocking Issues',
    '',
    ...renderBlockingIssues(report.gates),
    '',
    '## Decision Rule',
    '',
    `- May run when: ${report.decision.mayRunWhen}`,
    `- Must not run when: ${report.decision.mustNotRunWhen}`,
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function renderBlockingIssues(gates) {
  const issues = gates.flatMap((gate) => gate.blockingIssues.map((issue) => ({
    gateId: gate.id,
    ...issue,
  })));

  if (issues.length === 0) {
    return ['No blocking issues.'];
  }

  return issues.map((issue) => `- ${issue.gateId}: ${issue.code} - ${issue.detail}`);
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/check-release-handoff-readiness.mjs --handoff-file <handoff.json> --output <readiness.json>

Options:
  --gate <id>      Check a specific gate. Repeatable. Defaults to the four real closeout gates.
  --matrix <path>  Override matrix path.
  --output <path>  Output JSON path. Markdown is written beside it.

This tool reads a handoff declaration only. It does not run live commands, mutate DB state, or validate produced artifacts.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const report = await checkReleaseHandoffReadiness({
      handoffFile: options.handoffFile,
      matrixPath: options.matrixPath,
      gateIds: options.gateIds,
    });
    const outputs = await writeHandoffReadinessReport({
      report,
      outputPath: options.outputPath,
    });

    console.log(`Handoff readiness: ${report.status}`);
    console.log(`Ready to run: ${report.readyToRun ? 'yes' : 'no'}`);
    console.log(`Blocked gates: ${report.blockedGateCount}`);
    console.log(`Readiness JSON: ${outputs.jsonPath}`);
    process.exitCode = report.readyToRun ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
