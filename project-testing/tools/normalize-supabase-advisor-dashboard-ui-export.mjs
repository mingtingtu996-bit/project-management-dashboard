#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    input: '',
    output: '',
    projectRef: '',
    dashboardUrl: '',
    environment: 'staging',
    operator: 'codex-advisor-dashboard-ui-export',
    exportedAt: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };

    if (arg === '--input') {
      options.input = path.resolve(nextValue());
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
    } else if (arg === '--exported-at') {
      options.exportedAt = nextValue().trim();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.input) throw new Error('--input is required');
  if (!options.output) throw new Error('--output is required');
  return options;
}

export function extractProjectRefFromDashboardUrl(value) {
  const url = String(value ?? '').trim();
  const match = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9-]+)/i);
  return match?.[1] ?? '';
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function readObject(payload, fieldName) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${fieldName} must be a JSON object`);
  }
  return payload;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value.issues)) return value.issues;
  if (Array.isArray(value.results)) return value.results;
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.rows)) return value.rows;
  return [];
}

function normalizeTextArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function isPlaceholder(value) {
  return typeof value === 'string' && /__FILL_|<operator-|<project-|<supabase-|TODO|TBD/i.test(value);
}

function assertNoPlaceholders(value, pathLabel) {
  if (isPlaceholder(value)) {
    throw new Error(`Dashboard UI Advisor capture still contains placeholder value at ${pathLabel}`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPlaceholders(item, `${pathLabel}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      assertNoPlaceholders(nested, `${pathLabel}.${key}`);
    }
  }
}

function normalizeAdvisorIssue(issue, defaultCategory, index) {
  const record = issue && typeof issue === 'object' ? issue : {};
  const categories = normalizeTextArray(record.categories);
  const normalizedCategories = categories.length > 0 ? categories : [defaultCategory.toUpperCase()];
  return {
    code: record.name || record.code || record.cacheKey || `${defaultCategory}_advisor_issue_${index + 1}`,
    name: record.name || null,
    title: record.title || record.name || record.code || 'Untitled advisor issue',
    level: record.level || record.severity || null,
    facing: record.facing || null,
    categories: normalizedCategories,
    detail: record.detail || record.description || record.message || '',
    remediation: record.remediation || record.fix || null,
    metadata: record.metadata || null,
    cacheKey: record.cacheKey || null,
  };
}

function sectionIssueCount(section, issues, label) {
  const rawCount = section?.issueCount ?? section?.count ?? section?.total ?? section?.visibleCount;
  if (rawCount === undefined || rawCount === null || rawCount === '') return issues.length;
  const count = Number(rawCount);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`${label} issue count must be a non-negative integer`);
  }
  if (Array.isArray(section?.issues) && count !== issues.length) {
    throw new Error(`${label} issue count does not match issues length`);
  }
  return count;
}

function pickAdvisorSection(capture, key) {
  const direct = capture[key];
  if (direct && typeof direct === 'object') return direct;

  if (Array.isArray(capture.sections)) {
    const section = capture.sections.find((item) => {
      const record = item && typeof item === 'object' ? item : {};
      const id = String(record.id ?? record.key ?? record.name ?? record.title ?? '').toLowerCase();
      return id.includes(key);
    });
    if (section && typeof section === 'object') return section;
  }

  return {};
}

function normalizeSection(capture, key) {
  const section = pickAdvisorSection(capture, key);
  const issues = asArray(section).map((issue, index) => normalizeAdvisorIssue(issue, key, index));
  const issueCount = sectionIssueCount(section, issues, key);
  return {
    issueCount,
    issues,
    status: section.status || section.state || null,
    capturedLabel: section.label || section.title || section.name || key,
  };
}

function parseJson(raw, inputPath) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Dashboard UI Advisor capture must be JSON: ${error.message}; input=${inputPath}`);
  }
}

function resolveExportTimestamp(options, capture) {
  const timestamp = options.exportedAt || capture.exportedAt || capture.capturedAt || capture.generatedAt;
  if (!hasText(timestamp)) {
    throw new Error('Dashboard UI Advisor export must include exportedAt/capturedAt from the operator capture');
  }
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error('Dashboard UI Advisor export must include a valid exportedAt/capturedAt timestamp');
  }
  return new Date(timestamp).toISOString();
}

function assertCaptureIsOperatorEvidence(capture) {
  if (capture.templateOnly === true) {
    throw new Error('Dashboard UI Advisor capture is still templateOnly; fill current Dashboard counts and set templateOnly=false before normalization');
  }
  assertNoPlaceholders(capture, 'capture');

  const refs = normalizeTextArray(capture.captureEvidenceRefs);
  if (refs.length === 0) {
    throw new Error('Dashboard UI Advisor capture must include at least one captureEvidenceRefs entry, such as a screenshot path or operator note');
  }
  if (capture.boundary?.advisorCliRescan === true || capture.source === 'supabase_cli' || capture.source === 'cli_db_advisors') {
    throw new Error('Dashboard UI Advisor capture must not be derived from Supabase CLI db advisors output');
  }
}

export async function buildSupabaseAdvisorDashboardUiExport(options) {
  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output);
  const capture = readObject(parseJson(await readFile(inputPath, 'utf8'), inputPath), 'Dashboard UI Advisor capture');
  assertCaptureIsOperatorEvidence(capture);

  const dashboardUrl = options.dashboardUrl || capture.dashboardUrl || capture.pageUrl || capture.url || '';
  const projectRef = options.projectRef
    || capture.projectRef
    || extractProjectRefFromDashboardUrl(dashboardUrl);
  if (!hasText(projectRef)) {
    throw new Error('Supabase project ref missing; pass --project-ref or include dashboardUrl/pageUrl with /dashboard/project/<ref>');
  }
  if (!hasText(dashboardUrl)) {
    throw new Error('Dashboard UI Advisor capture must include dashboardUrl/pageUrl or pass --dashboard-url');
  }
  const urlProjectRef = extractProjectRefFromDashboardUrl(dashboardUrl);
  if (urlProjectRef && urlProjectRef !== projectRef) {
    throw new Error(`Dashboard URL project ref mismatch: url=${urlProjectRef}, expected=${projectRef}`);
  }
  if (!/supabase\.com\/dashboard\/project\//i.test(dashboardUrl)) {
    throw new Error('Dashboard UI Advisor capture must come from a Supabase dashboard project URL');
  }

  const security = normalizeSection(capture, 'security');
  const performance = normalizeSection(capture, 'performance');
  const exportedAt = resolveExportTimestamp(options, capture);
  const artifactPath = path.relative(REPO_ROOT, outputPath).replace(/\\/g, '/');
  const inputArtifactPath = path.relative(REPO_ROOT, inputPath).replace(/\\/g, '/');
  const issueCount = security.issueCount + performance.issueCount;

  return {
    schemaVersion: 'workbuddy-supabase-advisor-ui-or-api-export/v1',
    source: 'dashboard_ui',
    exportedAt,
    projectRef,
    environment: options.environment || capture.environment || 'staging',
    issueCount,
    securityIssueCount: security.issueCount,
    performanceIssueCount: performance.issueCount,
    artifactPath,
    operator: options.operator || capture.operator || 'codex-advisor-dashboard-ui-export',
    dashboardUi: {
      dashboardUrl,
      capturedAt: capture.capturedAt || capture.exportedAt || exportedAt,
      inputArtifactPath,
      inputSchemaVersion: capture.schemaVersion || null,
      captureEvidenceRefs: normalizeTextArray(capture.captureEvidenceRefs),
      sections: {
        security: {
          status: security.status,
          issueCount: security.issueCount,
          capturedLabel: security.capturedLabel,
        },
        performance: {
          status: performance.status,
          issueCount: performance.issueCount,
          capturedLabel: performance.capturedLabel,
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
      source: 'supabase_dashboard_ui',
      note: 'Formal Supabase Advisor export normalized from an operator-captured Supabase Dashboard UI JSON capture. It is read-only and must not be synthesized from CLI db advisors output.',
    },
  };
}

export async function writeSupabaseAdvisorDashboardUiExport(options) {
  const evidence = await buildSupabaseAdvisorDashboardUiExport(options);
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
    const evidence = await writeSupabaseAdvisorDashboardUiExport(options);
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
