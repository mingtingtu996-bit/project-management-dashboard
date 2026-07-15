#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'deploy/env/staging.env');
const DEFAULT_API_BASE_URL = 'https://api.supabase.com';
const DEFAULT_TOKEN_ENV_NAMES = [
  'SUPABASE_MANAGEMENT_API_TOKEN',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_API_TOKEN',
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: DEFAULT_ENV_FILE,
    output: '',
    projectRef: '',
    environment: 'staging',
    operator: 'codex-advisor-management-api-export',
    apiBaseUrl: DEFAULT_API_BASE_URL,
    tokenEnv: '',
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
    } else if (arg === '--environment') {
      options.environment = nextValue().trim();
    } else if (arg === '--operator') {
      options.operator = nextValue().trim();
    } else if (arg === '--api-base-url') {
      options.apiBaseUrl = nextValue().trim().replace(/\/+$/, '');
    } else if (arg === '--token-env') {
      options.tokenEnv = nextValue().trim();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.output) throw new Error('--output is required');
  return options;
}

export function parseEnvFile(raw) {
  const env = {};
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const splitIndex = trimmed.indexOf('=');
    if (splitIndex < 0) continue;
    const key = trimmed.slice(0, splitIndex).trim();
    let value = trimmed.slice(splitIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function extractProjectRefFromSupabaseUrl(value) {
  const url = String(value ?? '').trim();
  const match = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i);
  return match?.[1] ?? '';
}

export function resolveManagementApiToken(env = process.env, tokenEnv = '') {
  const candidates = tokenEnv ? [tokenEnv] : DEFAULT_TOKEN_ENV_NAMES;
  for (const key of candidates) {
    const value = env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return { key, value: value.trim() };
    }
  }
  throw new Error(`Supabase Management API token missing; set ${candidates.join(' or ')}`);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const record = value;
  if (Array.isArray(record.results)) return record.results;
  if (Array.isArray(record.issues)) return record.issues;
  if (Array.isArray(record.lints)) return record.lints;
  if (Array.isArray(record.advisories)) return record.advisories;
  if (Array.isArray(record.data)) return record.data;
  if (record.data && typeof record.data === 'object') return asArray(record.data);
  return [];
}

function normalizeTextArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

export function normalizeAdvisorIssues(payload, defaultCategory) {
  return asArray(payload).map((issue, index) => {
    const record = issue && typeof issue === 'object' ? issue : {};
    const categories = normalizeTextArray(record.categories);
    const normalizedCategories = categories.length > 0 ? categories : [defaultCategory.toUpperCase()];
    return {
      code: record.name || record.code || record.cacheKey || `${defaultCategory}_advisor_issue_${index + 1}`,
      name: record.name || null,
      title: record.title || record.name || record.code || 'Untitled advisor issue',
      level: record.level || null,
      facing: record.facing || null,
      categories: normalizedCategories,
      detail: record.detail || record.description || '',
      remediation: record.remediation || null,
      metadata: record.metadata || null,
      cacheKey: record.cacheKey || null,
    };
  });
}

async function readJsonResponse(response, endpointPath) {
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`Supabase Management API ${endpointPath} did not return JSON: ${error.message}`);
  }
  if (!response.ok) {
    const message = parsed && typeof parsed === 'object'
      ? (parsed.message || parsed.error || JSON.stringify(parsed).slice(0, 300))
      : text.slice(0, 300);
    throw new Error(`Supabase Management API ${endpointPath} failed with HTTP ${response.status}: ${message}`);
  }
  return parsed;
}

async function fetchAdvisorIssues({ apiBaseUrl, projectRef, token, kind, fetchImpl }) {
  const endpointPath = `/v1/projects/${encodeURIComponent(projectRef)}/advisors/${kind}`;
  const response = await fetchImpl(`${apiBaseUrl}${endpointPath}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const payload = await readJsonResponse(response, endpointPath);
  const issues = normalizeAdvisorIssues(payload, kind);
  return {
    endpointPath,
    status: response.status,
    issueCount: issues.length,
    issues,
  };
}

export async function buildSupabaseAdvisorManagementApiExport(options) {
  const envRaw = options.envFile ? await readFile(options.envFile, 'utf8') : '';
  const envFileValues = parseEnvFile(envRaw);
  const projectRef = options.projectRef
    || extractProjectRefFromSupabaseUrl(envFileValues.SUPABASE_URL)
    || extractProjectRefFromSupabaseUrl(process.env.SUPABASE_URL);
  if (!projectRef) {
    throw new Error('Supabase project ref missing; pass --project-ref or provide SUPABASE_URL in the env file');
  }

  const token = resolveManagementApiToken(options.env ?? process.env, options.tokenEnv);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('global fetch is unavailable; run with Node.js 18+');
  }

  const apiBaseUrl = (options.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  const [security, performance] = await Promise.all([
    fetchAdvisorIssues({ apiBaseUrl, projectRef, token: token.value, kind: 'security', fetchImpl }),
    fetchAdvisorIssues({ apiBaseUrl, projectRef, token: token.value, kind: 'performance', fetchImpl }),
  ]);

  const outputPath = options.output ? path.resolve(options.output) : path.join(REPO_ROOT, 'project-testing/reports/production-migration-governance/supabase-advisor-management-api-export.json');
  const artifactPath = path.relative(REPO_ROOT, outputPath).replace(/\\/g, '/');
  const issueCount = security.issueCount + performance.issueCount;
  return {
    schemaVersion: 'workbuddy-supabase-advisor-ui-or-api-export/v1',
    source: 'management_api',
    exportedAt: (options.now ?? new Date()).toISOString(),
    projectRef,
    environment: options.environment || 'staging',
    issueCount,
    securityIssueCount: security.issueCount,
    performanceIssueCount: performance.issueCount,
    artifactPath,
    operator: options.operator || 'codex-advisor-management-api-export',
    managementApi: {
      baseUrl: apiBaseUrl,
      tokenEnv: token.key,
      endpoints: {
        security: {
          path: security.endpointPath,
          status: security.status,
          issueCount: security.issueCount,
        },
        performance: {
          path: performance.endpointPath,
          status: performance.status,
          issueCount: performance.issueCount,
        },
      },
    },
    issues: [
      ...security.issues,
      ...performance.issues,
    ],
    securityIssues: security.issues,
    performanceIssues: performance.issues,
    boundary: {
      liveMutation: false,
      dbMutation: false,
      advisorUiOrApiExport: true,
      advisorCliRescan: false,
      source: 'supabase_management_api',
      note: 'Formal Supabase Advisor export captured through the Supabase Management API. Requires a Supabase Management API token; does not use database service-role credentials.',
    },
  };
}

export async function writeSupabaseAdvisorManagementApiExport(options) {
  const evidence = await buildSupabaseAdvisorManagementApiExport(options);
  const outputPath = path.resolve(options.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return evidence;
}

export function isMainModule(importMetaUrl = import.meta.url, argv1 = process.argv[1]) {
  if (!argv1) return false;
  return fileURLToPath(importMetaUrl) === path.resolve(argv1);
}

if (isMainModule()) {
  try {
    const options = parseArgs();
    const evidence = await writeSupabaseAdvisorManagementApiExport(options);
    const status = evidence.securityIssueCount === 0 ? 'pass' : 'blocked';
    console.log(JSON.stringify({
      output: evidence.artifactPath,
      status,
      issueCount: evidence.issueCount,
      securityIssueCount: evidence.securityIssueCount,
      performanceIssueCount: evidence.performanceIssueCount,
      source: evidence.source,
    }, null, 2));
    process.exitCode = status === 'pass' ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({
      status: 'blocked',
      reason: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  }
}
