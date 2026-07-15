#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    candidateBundle: null,
    ddlExportFile: null,
    rollbackPlanFile: null,
    controlledDropFile: null,
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

    if (arg === '--candidate-bundle') {
      options.candidateBundle = path.resolve(nextValue());
    } else if (arg === '--ddl-export-file') {
      options.ddlExportFile = path.resolve(nextValue());
    } else if (arg === '--rollback-plan-file') {
      options.rollbackPlanFile = path.resolve(nextValue());
    } else if (arg === '--controlled-drop-file') {
      options.controlledDropFile = path.resolve(nextValue());
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue());
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.candidateBundle) {
    throw new Error('--candidate-bundle is required');
  }

  return options;
}

export async function checkOldObjectCandidateBundle({
  candidateBundle,
  ddlExportFile = null,
  rollbackPlanFile = null,
  controlledDropFile = null,
  now = new Date(),
} = {}) {
  if (!candidateBundle) throw new Error('candidateBundle is required');

  const bundle = await readJson(candidateBundle);
  const failures = [];
  const warnings = [];
  const candidates = Array.isArray(bundle?.candidates) ? bundle.candidates : [];

  requireText(failures, 'databaseTarget', bundle?.databaseTarget);
  requireText(failures, 'candidateObject', bundle?.candidateObject);
  requireText(failures, 'ddlExportPath', bundle?.ddlExportPath);
  requireText(failures, 'rollbackPath', bundle?.rollbackPath);
  requireText(failures, 'approvalRef', bundle?.approvalRef);
  requireText(failures, 'migrationWindow', bundle?.migrationWindow);
  requireText(failures, 'postDropSmokePath', bundle?.postDropSmokePath);

  if (!Array.isArray(bundle?.candidates) || candidates.length === 0) {
    failures.push(fieldFailure('candidates', 'at least one candidate is required'));
  }

  const topLevelRowCount = readNumber(bundle?.rowCount);
  if (!Number.isFinite(topLevelRowCount) || topLevelRowCount !== 0) {
    failures.push(fieldFailure('rowCount', 'top-level rowCount must be 0'));
  }

  if (!evidenceReady(bundle?.catalogReadback)) {
    failures.push(fieldFailure('catalogReadback', 'catalog readback must pass'));
  }
  if (!evidenceReady(bundle?.dependencyReadback)) {
    failures.push(fieldFailure('dependencyReadback', 'dependency readback must pass'));
  }
  if (hasRuntimeReferences(bundle?.dependencyReadback)) {
    failures.push(fieldFailure('dependencyReadback.runtimeReferences', 'runtime references must be empty before physical DROP'));
  }

  for (const [index, candidate] of candidates.entries()) {
    const prefix = `candidates[${index}]`;
    requireText(failures, `${prefix}.objectName`, candidate?.objectName);
    const rowCount = readNumber(candidate?.rowCount);
    if (!Number.isFinite(rowCount) || rowCount !== 0) {
      failures.push(fieldFailure(`${prefix}.rowCount`, 'candidate rowCount must be 0'));
    }
    if (!evidenceReady(candidate?.dependencyScan) && !evidenceReady(candidate?.dependencyReadback)) {
      failures.push(fieldFailure(`${prefix}.dependencyReadback`, 'candidate dependency evidence must pass'));
    }
    if (!evidenceReady(candidate?.catalogReadback)) {
      warnings.push(fieldFailure(`${prefix}.catalogReadback`, 'candidate-level catalog readback is recommended'));
    }
    requireText(failures, `${prefix}.approvalRef`, candidate?.approvalRef ?? bundle?.approvalRef);
  }

  const sqlChecks = await readSqlChecks({
    ddlExportFile,
    rollbackPlanFile,
    controlledDropFile,
    bundle,
  });
  failures.push(...sqlChecks.failures);
  warnings.push(...sqlChecks.warnings);

  return {
    schemaVersion: 'workbuddy-old-object-candidate-bundle-check/v1',
    checkedAt: now.toISOString(),
    candidateBundle,
    status: failures.length === 0 ? 'pass' : 'fail',
    counts: {
      candidates: candidates.length,
      failures: failures.length,
      warnings: warnings.length,
    },
    failures,
    warnings,
    boundary: {
      liveMutation: false,
      dbMutation: false,
      note: 'This checker validates old-object candidate and SQL review artifacts only. It does not execute DROP or connect to a database.',
    },
  };
}

async function readSqlChecks({
  ddlExportFile,
  rollbackPlanFile,
  controlledDropFile,
  bundle,
}) {
  const failures = [];
  const warnings = [];
  const files = [
    {
      field: 'ddlExportFile',
      path: ddlExportFile,
      fallback: bundle?.ddlExportPath,
      requiredPattern: /\bcreate\s+(table|view|function|trigger|policy|index)\b/i,
      message: 'DDL export must contain executable CREATE structure',
    },
    {
      field: 'rollbackPlanFile',
      path: rollbackPlanFile,
      fallback: bundle?.rollbackPath,
      requiredPattern: /\b(create|insert|alter|comment\s+on)\b/i,
      message: 'rollback plan must contain executable rollback structure',
    },
    {
      field: 'controlledDropFile',
      path: controlledDropFile,
      fallback: bundle?.controlledDropPath ?? bundle?.migrationPlan?.path,
      requiredPattern: /\bdrop\s+(table|view|function|trigger|policy|index)\b/i,
      message: 'controlled drop SQL must contain DROP structure',
    },
  ];

  for (const file of files) {
    const filePath = normalizeText(file.path) || normalizeText(file.fallback);
    if (!filePath) {
      failures.push(fieldFailure(file.field, 'SQL artifact path is required'));
      continue;
    }
    try {
      const raw = await readFile(filePath, 'utf8');
      const executable = stripSqlComments(raw).trim();
      const normalized = normalizeToken(raw);
      if (!executable || normalized.includes('missing') || normalized.includes('not-authorized')) {
        failures.push(fieldFailure(file.field, 'SQL artifact is empty, comment-only, or a missing-evidence placeholder'));
        continue;
      }
      if (!file.requiredPattern.test(executable)) {
        failures.push(fieldFailure(file.field, file.message));
      }
      if (!/\bapproval\b|\bwindow\b|\brollback\b|\brestrict\b/i.test(raw)) {
        warnings.push(fieldFailure(file.field, 'SQL artifact should carry approval/window/rollback context comments where applicable'));
      }
    } catch (error) {
      failures.push(fieldFailure(file.field, `SQL artifact cannot be read: ${error.message}`));
    }
  }

  return { failures, warnings };
}

function requireText(failures, field, value) {
  if (!normalizeText(value)) failures.push(fieldFailure(field, 'required text is missing'));
}

function fieldFailure(field, message) {
  return {
    code: 'old-object-candidate-bundle-field-invalid',
    field,
    message,
  };
}

function evidenceReady(value) {
  if (!value) return false;
  if (value === true) return true;
  if (typeof value !== 'object') return false;
  return value.status === 'pass' || value.ready === true || value.pass === true;
}

function hasRuntimeReferences(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value.runtimeReferences) && value.runtimeReferences.length > 0) return true;
  if (Array.isArray(value.references) && value.references.length > 0) return true;
  return false;
}

function readNumber(value) {
  if (value === null || value === undefined || value === '') return Number.NaN;
  return Number(value);
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function stripSqlComments(sql) {
  return String(sql ?? '')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function normalizeToken(value) {
  return String(value ?? '')
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replaceAll(/[_\s./:]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .toLowerCase();
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/check-old-object-candidate-bundle.mjs --candidate-bundle <old-object-drop-candidates.json> --ddl-export-file <old-object-ddl-export.sql> --rollback-plan-file <old-object-rollback-plan.sql> --controlled-drop-file <old-object-controlled-drop-migration.sql> --output <check.json>

This checker is read-only. It validates candidate and SQL review artifacts before any governed physical DROP.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const report = await checkOldObjectCandidateBundle(options);
    if (options.output) {
      await writeJson(options.output, report);
    }

    console.log(`Old-object candidate bundle check: ${report.status}`);
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
