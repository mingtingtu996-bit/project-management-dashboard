#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  extractProjectRefFromSupabaseUrl,
  parseEnvFile,
} from './export-supabase-advisor-management-api.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'deploy/env/staging.env');

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/');
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: DEFAULT_ENV_FILE,
    output: '',
    projectRef: '',
    dashboardUrl: '',
    environment: 'staging',
    operator: 'release-dashboard-db-profile',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };

    if (arg === '--env-file') {
      options.envFile = path.resolve(nextValue());
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue());
    } else if (arg === '--project-ref') {
      options.projectRef = nextValue().trim();
    } else if (arg === '--dashboard-url') {
      options.dashboardUrl = nextValue().trim();
    } else if (arg === '--environment') {
      options.environment = nextValue().trim();
    } else if (arg === '--operator') {
      options.operator = nextValue().trim();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.output) throw new Error('--output is required');
  return options;
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function extractProjectRefFromAnySupabaseValue(value) {
  const text = String(value ?? '').trim();
  return extractProjectRefFromSupabaseUrl(text)
    || text.match(/db\.([a-z0-9-]+)\.supabase\.co/i)?.[1]
    || '';
}

async function resolveProjectRef(options) {
  if (hasText(options.projectRef)) return options.projectRef;
  const envRaw = options.envFile ? await readFile(options.envFile, 'utf8') : '';
  const env = parseEnvFile(envRaw);
  for (const key of ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'DATABASE_URL', 'DIRECT_DATABASE_URL', 'SUPABASE_MIGRATION_URL']) {
    const ref = extractProjectRefFromAnySupabaseValue(env[key]);
    if (ref) return ref;
  }
  throw new Error('Supabase project ref missing; pass --project-ref or provide a Supabase URL in the env file');
}

export async function buildSupabaseAdvisorDashboardUiCaptureTemplate(options) {
  const projectRef = await resolveProjectRef(options);
  const dashboardUrl = options.dashboardUrl || `https://supabase.com/dashboard/project/${projectRef}/advisors/security`;
  if (!/supabase\.com\/dashboard\/project\//i.test(dashboardUrl)) {
    throw new Error('Dashboard URL must be a Supabase dashboard project URL');
  }
  const outputPath = options.output
    ? path.resolve(options.output)
    : path.join(REPO_ROOT, 'project-testing/reports/release-v1.4.24-20260702-125254/supabase-advisor-dashboard-ui-capture.template.json');
  const filledCapturePath = outputPath.replace(/\.template\.json$/i, '.filled.json');

  return {
    schemaVersion: 'manual-supabase-advisor-dashboard-capture/v1',
    templateOnly: true,
    generatedAt: new Date().toISOString(),
    environment: options.environment || 'staging',
    operator: options.operator || 'release-dashboard-db-profile',
    projectRef,
    dashboardUrl,
    capturedAt: '__FILL_CURRENT_CAPTURE_TIMESTAMP_ISO__',
    captureEvidenceRefs: [
      '__FILL_SCREENSHOT_OR_OPERATOR_NOTE_PATH__',
    ],
    instructions: [
      'Open the Supabase Dashboard Advisor page for this exact project.',
      'Open both /advisors/security and /advisors/performance for the same project.',
      'Record current Security and Performance Advisor issue counts from the UI header/cards.',
      'If either count is greater than zero, list the visible issue rows in the matching issues array.',
      'Add at least one captureEvidenceRefs entry pointing to a screenshot path or operator note that proves the current Dashboard UI state.',
      'Set templateOnly to false before running evidence:supabase-advisor:dashboard-ui-normalize.',
      'Do not derive this file from Supabase CLI db advisors output.',
    ],
    manualChecklist: [
      {
        id: 'SECURITY_ADVISOR_CURRENT',
        page: `https://supabase.com/dashboard/project/${projectRef}/advisors/security`,
        requiredAction: 'Open Security Advisor and copy the current issue count into security.issueCount.',
        expectedCapture: 'Screenshot or operator note showing the Security Advisor issue count.',
      },
      {
        id: 'PERFORMANCE_ADVISOR_CURRENT',
        page: `https://supabase.com/dashboard/project/${projectRef}/advisors/performance`,
        requiredAction: 'Open Performance Advisor and copy the current issue count into performance.issueCount.',
        expectedCapture: 'Screenshot or operator note showing the Performance Advisor issue count.',
      },
      {
        id: 'TEMPLATE_UNLOCK',
        page: dashboardUrl,
        requiredAction: 'Set templateOnly=false, replace capturedAt with the current ISO timestamp, and replace every __FILL_* placeholder.',
        expectedCapture: 'captureEvidenceRefs contains at least one current screenshot or operator note path.',
      },
    ],
    normalizeCommand: [
      'npm run evidence:supabase-advisor:dashboard-ui-normalize --',
      `--input ${repoRelative(filledCapturePath)}`,
      '--output project-testing/reports/release-v1.4.24-20260702-125254/supabase-advisor-management-api-export.json',
      `--project-ref ${projectRef}`,
      `--dashboard-url ${dashboardUrl}`,
      `--operator ${options.operator || 'release-dashboard-db-profile'}`,
    ].join(' '),
    security: {
      issueCount: '__FILL_CURRENT_SECURITY_ISSUE_COUNT_FROM_DASHBOARD__',
      issues: [],
    },
    performance: {
      issueCount: '__FILL_CURRENT_PERFORMANCE_ISSUE_COUNT_FROM_DASHBOARD__',
      issues: [],
    },
    boundary: {
      liveMutation: false,
      dbMutation: false,
      dashboardUiCaptureTemplate: true,
      advisorCliRescan: false,
      note: 'This is a fill-in template only. It is not Advisor export evidence until normalized after operator capture.',
    },
  };
}

export async function writeSupabaseAdvisorDashboardUiCaptureTemplate(options) {
  const outputPath = path.resolve(options.output);
  const template = await buildSupabaseAdvisorDashboardUiCaptureTemplate(options);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  return {
    ...template,
    artifactPath: repoRelative(outputPath),
  };
}

export function isMainModule(importMetaUrl = import.meta.url, argv1 = process.argv[1]) {
  if (!argv1) return false;
  return fileURLToPath(importMetaUrl) === path.resolve(argv1);
}

if (isMainModule()) {
  try {
    const template = await writeSupabaseAdvisorDashboardUiCaptureTemplate(parseArgs());
    console.log(JSON.stringify({
      status: 'template-written',
      output: template.artifactPath,
      projectRef: template.projectRef,
      dashboardUrl: template.dashboardUrl,
      templateOnly: true,
      mutationBoundary: template.boundary,
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  }
}
