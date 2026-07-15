#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_HANDOFF_FILE = path.join(REPO_ROOT, 'project-testing/runbooks/solo-live-handoff-template.json');
const DEFAULT_OUTPUT_PATH = path.join(REPO_ROOT, 'project-testing/reports/solo-live-readiness.json');

const REAL_TEST_REQUIRED_FIELDS = [
  'target.environment',
  'target.baseUrl',
  'target.supabaseProjectRef',
  'owner.operator',
  'evidence.apiHealthRef',
];

const SOLO_LIVE_REQUIRED_FIELDS = [
  ...REAL_TEST_REQUIRED_FIELDS,
  'target.deploymentRef',
  'approvals.selfApprovalRef',
  'owner.rollbackOwner',
  'owner.monitoringOwner',
  'plans.rollbackPlanRef',
  'plans.monitoringPlanRef',
  'evidence.apiReadSmokeRef',
  'evidence.uiSmokeRef',
];

const SECRET_KEY_PATTERN = /(password|token|secret|service.?role|database.?url|connection.?string|jwt|dsn)$/i;
const SECRET_VALUE_PATTERNS = [
  /^postgres(?:ql)?:\/\//i,
  /^supabase:\/\/.+/i,
  /^eyJ[A-Za-z0-9_-]+\./,
  /^sb_(?:secret|service|publishable)_/i,
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    handoffFile: DEFAULT_HANDOFF_FILE,
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

    if (arg === '--handoff-file') {
      options.handoffFile = path.resolve(nextValue());
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

export async function checkSoloLiveReadiness({
  handoffFile = DEFAULT_HANDOFF_FILE,
  outputPath = DEFAULT_OUTPUT_PATH,
  now = new Date(),
} = {}) {
  const raw = await readFile(handoffFile, 'utf8');
  const handoff = JSON.parse(raw);
  const secretLeaks = findSecretLeaks(handoff);
  const realTestMissingFields = missingFields(handoff, REAL_TEST_REQUIRED_FIELDS);
  const soloLiveMissingFields = missingFields(handoff, SOLO_LIVE_REQUIRED_FIELDS);
  const targetEnvironment = text(getPath(handoff, 'target.environment')).toLowerCase();
  const baseUrl = text(getPath(handoff, 'target.baseUrl'));
  const baseUrlIsLocal = isLocalUrl(baseUrl);
  const realEnvironmentNameAccepted = ['staging', 'solo-live', 'personal-live', 'live'].includes(targetEnvironment);
  const environmentBlockers = [];

  if (targetEnvironment && !realEnvironmentNameAccepted) {
    environmentBlockers.push('target_environment_must_be_staging_solo_live_personal_live_or_live');
  }

  const realTestBlockers = [
    ...realTestMissingFields.map((field) => `missing_${field.replaceAll('.', '_')}`),
    ...environmentBlockers,
    ...secretLeaks.map((leak) => `inline_secret_not_allowed_${leak.path.replaceAll('.', '_')}`),
  ];

  const soloLiveBlockers = [
    ...soloLiveMissingFields.map((field) => `missing_${field.replaceAll('.', '_')}`),
    ...environmentBlockers,
    ...(baseUrlIsLocal ? ['solo_live_base_url_must_not_be_localhost'] : []),
    ...secretLeaks.map((leak) => `inline_secret_not_allowed_${leak.path.replaceAll('.', '_')}`),
  ];

  const realTestEnvironmentReady = realTestBlockers.length === 0;
  const soloLiveReady = soloLiveBlockers.length === 0;
  const status = soloLiveReady
    ? 'solo_live_ready'
    : realTestEnvironmentReady
      ? 'staging_real_test_ready'
      : 'blocked';

  const report = {
    schemaVersion: 'workbuddy-solo-live-readiness/v1',
    generatedAt: now.toISOString(),
    handoffFile: path.resolve(handoffFile),
    status,
    readinessTier: soloLiveReady
      ? 'solo_live'
      : realTestEnvironmentReady
        ? 'staging_real_test'
        : 'blocked',
    realTestEnvironmentReady,
    soloLiveReady,
    productionReady: false,
    target: {
      environment: targetEnvironment || 'missing',
      baseUrlKind: baseUrl ? (baseUrlIsLocal ? 'local' : 'remote') : 'missing',
      supabaseProjectRefPresent: hasValue(handoff, 'target.supabaseProjectRef'),
      deploymentRefPresent: hasValue(handoff, 'target.deploymentRef'),
    },
    blockers: soloLiveReady ? [] : (realTestEnvironmentReady ? soloLiveBlockers : realTestBlockers),
    realTestBlockers,
    soloLiveBlockers,
    checks: buildChecks(handoff, baseUrlIsLocal),
    secretLeakCount: secretLeaks.length,
    secretLeaks,
    decision: {
      realTestEnvironmentReadyMeans: 'The app is configured for a real staging/personal environment with an explicit Supabase project reference and at least API health evidence.',
      soloLiveReadyMeans: 'A personal real environment has a non-local URL plus self-approval, rollback owner, monitoring owner, rollback plan, monitoring plan, API smoke, and UI smoke evidence references.',
      productionReadyMeans: 'Not evaluated by this checker. Company-grade production readiness remains a separate production/live outcome gate.',
    },
    mutationBoundary: 'read-only handoff checker; does not start servers, connect to Supabase, run migrations, write data, publish runtime assets, or perform rollback',
  };

  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  return report;
}

function buildChecks(handoff, baseUrlIsLocal) {
  return [
    ...REAL_TEST_REQUIRED_FIELDS.map((field) => ({
      id: `real-test:${field}`,
      status: hasValue(handoff, field) ? 'present' : 'missing',
      requiredFor: 'real_test_environment',
    })),
    ...SOLO_LIVE_REQUIRED_FIELDS.filter((field) => !REAL_TEST_REQUIRED_FIELDS.includes(field)).map((field) => ({
      id: `solo-live:${field}`,
      status: hasValue(handoff, field) ? 'present' : 'missing',
      requiredFor: 'solo_live',
    })),
    {
      id: 'solo-live:non-local-base-url',
      status: hasValue(handoff, 'target.baseUrl') && !baseUrlIsLocal ? 'present' : 'missing',
      requiredFor: 'solo_live',
    },
    {
      id: 'boundary:production-ready-not-claimed',
      status: getPath(handoff, 'claims.productionReady') === true ? 'blocked' : 'present',
      requiredFor: 'all',
    },
  ];
}

function missingFields(source, fields) {
  return fields.filter((field) => !hasValue(source, field));
}

function hasValue(source, dottedPath) {
  const value = getPath(source, dottedPath);
  const normalized = text(value);
  return Boolean(normalized) && !isPlaceholder(normalized);
}

function getPath(source, dottedPath) {
  return dottedPath.split('.').reduce((current, key) => (
    current && typeof current === 'object' ? current[key] : undefined
  ), source);
}

function text(value) {
  return String(value ?? '').trim();
}

function isPlaceholder(value) {
  const normalized = text(value).toLowerCase();
  return !normalized
    || normalized === 'todo'
    || normalized === 'tbd'
    || normalized === 'changeme'
    || normalized === 'placeholder'
    || /^<.+>$/.test(normalized);
}

function isLocalUrl(value) {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(text(value));
}

function findSecretLeaks(value, currentPath = '') {
  const leaks = [];

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      leaks.push(...findSecretLeaks(item, `${currentPath}[${index}]`));
    });
    return leaks;
  }

  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      const keyLooksSecret = SECRET_KEY_PATTERN.test(key) && !/ref$/i.test(key);
      if (keyLooksSecret && hasNonPlaceholderScalar(item)) {
        leaks.push({ path: nextPath, reason: 'secret_like_field_must_use_ref' });
        continue;
      }
      leaks.push(...findSecretLeaks(item, nextPath));
    }
    return leaks;
  }

  const scalar = text(value);
  if (scalar && SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(scalar))) {
    leaks.push({ path: currentPath, reason: 'secret_like_value_must_not_be_in_handoff' });
  }

  return leaks;
}

function hasNonPlaceholderScalar(value) {
  if (value && typeof value === 'object') return false;
  return Boolean(text(value)) && !isPlaceholder(text(value));
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/check-solo-live-readiness.mjs --handoff-file project-testing/runbooks/solo-live-handoff-template.json --output project-testing/reports/solo-live-readiness.json

Options:
  --handoff-file <path>  JSON handoff file with personal real-environment refs
  --output <path>        Write readiness JSON report
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const report = await checkSoloLiveReadiness(options);
    console.log(`Solo-live readiness: ${options.outputPath}`);
    console.log(JSON.stringify({
      status: report.status,
      realTestEnvironmentReady: report.realTestEnvironmentReady,
      soloLiveReady: report.soloLiveReady,
      productionReady: report.productionReady,
      blockers: report.blockers.length,
    }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
