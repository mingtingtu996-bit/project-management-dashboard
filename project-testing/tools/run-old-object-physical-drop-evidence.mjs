#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkReleaseHandoffReadiness,
} from './check-release-handoff-readiness.mjs';

const __filename = fileURLToPath(import.meta.url);
const OLD_OBJECT_GATE_ID = 'old-object-physical-drop-closeout';

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    handoffFile: null,
    artifactRoot: null,
    includeDb: false,
    confirmDbReady: false,
    allowDrop: false,
    candidateBundle: null,
    executorResultFile: null,
    outputSummary: null,
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
    } else if (arg === '--artifact-root') {
      options.artifactRoot = path.resolve(nextValue());
    } else if (arg === '--include-db') {
      options.includeDb = true;
    } else if (arg === '--confirm-db-ready') {
      options.confirmDbReady = true;
    } else if (arg === '--allow-drop') {
      options.allowDrop = true;
    } else if (arg === '--candidate-bundle') {
      options.candidateBundle = path.resolve(nextValue());
    } else if (arg === '--executor-result-file') {
      options.executorResultFile = path.resolve(nextValue());
    } else if (arg === '--output-summary') {
      options.outputSummary = path.resolve(nextValue());
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.handoffFile) {
    throw new Error('--handoff-file is required');
  }

  if (!options.help && !options.artifactRoot) {
    throw new Error('--artifact-root is required');
  }

  return options;
}

export async function runOldObjectPhysicalDropEvidence({
  handoffFile,
  artifactRoot,
  includeDb = false,
  confirmDbReady = false,
  allowDrop = false,
  candidateBundle = null,
  executorResultFile = null,
  outputSummary = null,
  now = new Date(),
  dropExecutor = null,
} = {}) {
  if (!handoffFile) {
    throw new Error('handoffFile is required');
  }
  if (!artifactRoot) {
    throw new Error('artifactRoot is required');
  }

  const root = path.resolve(artifactRoot);
  await mkdir(root, { recursive: true });
  const handoff = await readJson(handoffFile);
  const oldObject = handoff.gates?.[OLD_OBJECT_GATE_ID] ?? {};
  const metadata = oldObjectMetadata(oldObject);

  if (!allowDrop) {
    return writeBlockedEvidence({
      root,
      metadata,
      now,
      outputSummary,
      reasons: [
        'retired-object-audit-only',
        'ddl-export-missing',
        'rollback-plan-missing',
        'approval-missing',
        'post-drop-smoke-missing',
      ],
    });
  }

  const readiness = await checkReleaseHandoffReadiness({
    handoffFile,
    gateIds: [OLD_OBJECT_GATE_ID],
    now,
  });
  if (!includeDb || !confirmDbReady || !handoff.unlockFlags?.includeDb || !handoff.unlockFlags?.confirmDbReady || !readiness.readyToRun) {
    throw new Error('old-object DB handoff is not ready for physical drop');
  }
  if (!candidateBundle) {
    return writeBlockedEvidence({
      root,
      metadata,
      now,
      outputSummary,
      reasons: [
        'retired-object-audit-only',
        'ddl-export-missing',
        'rollback-plan-missing',
        'post-drop-smoke-missing',
        'candidate_bundle_required',
      ],
    });
  }

  const executor = dropExecutor ?? (executorResultFile ? readExecutorResultFile : defaultDropExecutor);
  const executorResult = await executor({ metadata, candidateBundle, executorResultFile, now });
  return writeExecutorEvidence({
    root,
    metadata,
    now,
    outputSummary,
    executorResult,
  });
}

async function writeBlockedEvidence({
  root,
  metadata,
  now,
  outputSummary,
  reasons,
}) {
  const generatedAt = now.toISOString();
  const common = {
    generatedAt,
    ...metadata,
    rowCount: null,
    catalogReadback: null,
    dependencyReadback: null,
    dbMutation: false,
    reasons,
  };
  const jsonDocuments = {
    'old-object-drop-candidates.json': {
      schemaVersion: 'workbuddy-old-object-drop-candidates/v1',
      status: 'blocked',
      ...common,
      retiredObjectAuditOnly: true,
      candidates: [],
    },
    'old-object-rowcount-and-catalog-readback.json': {
      schemaVersion: 'workbuddy-old-object-rowcount-catalog-readback/v1',
      status: 'blocked',
      ...common,
      catalogReadbackMissing: true,
    },
    'old-object-dependency-readback.json': {
      schemaVersion: 'workbuddy-old-object-dependency-readback/v1',
      status: 'blocked',
      ...common,
      dependencyReadbackMissing: true,
    },
    'old-object-post-drop-catalog-readback.json': {
      schemaVersion: 'workbuddy-old-object-post-drop-catalog-readback/v1',
      status: 'blocked',
      ...common,
      postDropSmokeMissing: true,
    },
    'old-object-post-drop-api-browser-smoke.json': {
      schemaVersion: 'workbuddy-old-object-post-drop-api-browser-smoke/v1',
      status: 'blocked',
      ...common,
      postDropSmokePath: metadata.postDropSmokePath,
      postDropSmokeMissing: true,
    },
    'old-object-physical-drop-summary.json': {
      schemaVersion: 'workbuddy-old-object-physical-drop-summary/v1',
      status: 'blocked',
      ...common,
      ddlExportMissing: true,
      rollbackPlanMissing: true,
      approvalMissing: true,
      postDropSmokeMissing: true,
      retiredObjectAuditOnly: true,
      boundary: 'No physical DROP was executed. This artifact preserves blockers and must not be counted as pass.',
    },
  };
  const sqlDocuments = {
    'old-object-ddl-export.sql': '-- ddl-export-missing: no approved old-object candidate has a verified DDL export.\n',
    'old-object-rollback-plan.sql': '-- rollback-plan-missing: no approved old-object candidate has a rollback plan.\n',
    'old-object-controlled-drop-migration.sql': '-- approval-missing: controlled DROP migration is not authorized.\n',
  };
  const outputs = [
    ...await writeJsonDocuments(root, jsonDocuments),
    ...await writeTextDocuments(root, sqlDocuments),
  ];
  const summary = {
    schemaVersion: 'workbuddy-old-object-physical-drop-evidence-run/v1',
    status: 'blocked',
    generatedAt,
    gateId: OLD_OBJECT_GATE_ID,
    dbMutation: false,
    outputs,
    reasons,
  };
  if (outputSummary) {
    await writeJson(outputSummary, summary);
  }
  return summary;
}

async function writeExecutorEvidence({
  root,
  metadata,
  now,
  outputSummary,
  executorResult,
}) {
  const passEvidence = normalizeExecutorPassEvidence(metadata, executorResult);
  if (!passEvidence.ready) {
    return writeBlockedEvidence({
      root,
      metadata,
      now,
      outputSummary,
      reasons: [
        'ddl-export-missing',
        'rollback-plan-missing',
        'post-drop-smoke-missing',
        ...passEvidence.reasons,
      ],
    });
  }

  const generatedAt = now.toISOString();
  const common = {
    generatedAt,
    ...metadata,
    candidateObject: passEvidence.candidateObject,
    rowCount: 0,
    catalogReadback: passEvidence.catalogReadback,
    dependencyReadback: passEvidence.dependencyReadback,
    dbMutation: true,
    executorResult,
  };
  const jsonDocuments = {
    'old-object-drop-candidates.json': {
      schemaVersion: 'workbuddy-old-object-drop-candidates/v1',
      status: 'pass',
      ...common,
      candidates: passEvidence.candidates,
    },
    'old-object-rowcount-and-catalog-readback.json': {
      schemaVersion: 'workbuddy-old-object-rowcount-catalog-readback/v1',
      status: 'pass',
      ...common,
      rowCountReadbackReady: true,
    },
    'old-object-dependency-readback.json': {
      schemaVersion: 'workbuddy-old-object-dependency-readback/v1',
      status: 'pass',
      ...common,
      dependencyReadbackReady: true,
    },
    'old-object-post-drop-catalog-readback.json': {
      schemaVersion: 'workbuddy-old-object-post-drop-catalog-readback/v1',
      status: 'pass',
      ...common,
      postDropCatalogReadback: passEvidence.postDropCatalogReadback,
    },
    'old-object-post-drop-api-browser-smoke.json': {
      schemaVersion: 'workbuddy-old-object-post-drop-api-browser-smoke/v1',
      status: 'pass',
      ...common,
      postDropSmokePath: metadata.postDropSmokePath,
      postDropApiBrowserSmoke: passEvidence.postDropApiBrowserSmoke,
    },
    'old-object-physical-drop-summary.json': {
      schemaVersion: 'workbuddy-old-object-physical-drop-summary/v1',
      status: 'pass',
      ...common,
      ddlExportPath: metadata.ddlExportPath,
      rollbackPath: metadata.rollbackPath,
      postDropSmokePath: metadata.postDropSmokePath,
      migrationWindow: metadata.migrationWindow,
      passCriteria: {
        rowCountZero: true,
        catalogReadback: true,
        dependencyReadback: true,
        ddlExportArchived: true,
        rollbackPlanArchived: true,
        controlledDropArchived: true,
        postDropCatalogReadback: true,
        postDropApiBrowserSmoke: true,
      },
    },
  };
  const sqlDocuments = {
    'old-object-ddl-export.sql': passEvidence.ddlExportSql,
    'old-object-rollback-plan.sql': passEvidence.rollbackSql,
    'old-object-controlled-drop-migration.sql': passEvidence.controlledDropSql,
  };
  const outputs = [
    ...await writeJsonDocuments(root, jsonDocuments),
    ...await writeTextDocuments(root, sqlDocuments, 'pass'),
  ];
  const summary = {
    schemaVersion: 'workbuddy-old-object-physical-drop-evidence-run/v1',
    status: 'pass',
    generatedAt,
    gateId: OLD_OBJECT_GATE_ID,
    dbMutation: true,
    outputs,
  };
  if (outputSummary) {
    await writeJson(outputSummary, summary);
  }
  return summary;
}

async function readExecutorResultFile({ executorResultFile }) {
  return readJson(executorResultFile);
}

async function defaultDropExecutor() {
  throw new Error('Physical DROP executor is not wired in this Node harness. Provide dropExecutor from a controlled runner or keep --allow-drop unset.');
}

function oldObjectMetadata(oldObject) {
  const db = oldObject.db ?? {};
  return {
    databaseTarget: normalizeText(db.databaseTargetRef),
    candidateObject: normalizeText(db.candidateBundleRef) || 'no-approved-drop-candidate',
    ddlExportPath: normalizeText(db.ddlExportRef) || 'old-object-ddl-export.sql',
    rollbackPath: normalizeText(db.rollbackPlanRef) || 'old-object-rollback-plan.sql',
    approvalRef: normalizeText(oldObject.approvals?.manualApprovalRef),
    migrationWindow: normalizeText(db.migrationWindow) || 'migration-window-required',
    postDropSmokePath: 'old-object-post-drop-api-browser-smoke.json',
  };
}

function normalizeExecutorPassEvidence(metadata, executorResult) {
  const reasons = [];
  if (!executorResult || executorResult.status !== 'pass') {
    reasons.push(...normalizeReasonArray(executorResult?.reasons, 'executor_result_not_pass'));
  }

  const candidateObject = normalizeText(executorResult?.candidateObject)
    || normalizeText(executorResult?.candidate_object)
    || normalizeText(metadata.candidateObject);
  if (!candidateObject || candidateObject === 'no-approved-drop-candidate') {
    reasons.push('candidate_object_missing');
  }

  const rowCount = Number(executorResult?.rowCount ?? executorResult?.row_count);
  if (rowCount !== 0) {
    reasons.push('row_count_zero_required');
  }

  const catalogReadback = executorResult?.catalogReadback ?? executorResult?.catalog_readback ?? null;
  if (!evidenceReady(catalogReadback)) {
    reasons.push('catalog_readback_required');
  }

  const dependencyReadback = executorResult?.dependencyReadback ?? executorResult?.dependency_readback ?? null;
  if (!evidenceReady(dependencyReadback)) {
    reasons.push('dependency_readback_required');
  }

  const postDropCatalogReadback = executorResult?.postDropCatalogReadback ?? executorResult?.post_drop_catalog_readback ?? null;
  if (!evidenceReady(postDropCatalogReadback)) {
    reasons.push('post_drop_catalog_readback_required');
  }

  const postDropApiBrowserSmoke = executorResult?.postDropApiBrowserSmoke ?? executorResult?.post_drop_api_browser_smoke ?? null;
  if (!evidenceReady(postDropApiBrowserSmoke)) {
    reasons.push('post_drop_api_browser_smoke_required');
  }

  const ddlExportSql = normalizeSqlText(executorResult?.ddlExportSql ?? executorResult?.ddl_export_sql);
  if (!ddlExportSql) {
    reasons.push('ddl_export_sql_required');
  }

  const rollbackSql = normalizeSqlText(executorResult?.rollbackSql ?? executorResult?.rollback_sql);
  if (!rollbackSql) {
    reasons.push('rollback_sql_required');
  }

  const controlledDropSql = normalizeSqlText(executorResult?.controlledDropSql ?? executorResult?.controlled_drop_sql);
  if (!controlledDropSql) {
    reasons.push('controlled_drop_sql_required');
  }

  if (!normalizeText(metadata.approvalRef)) {
    reasons.push('approval_ref_required');
  }
  if (!normalizeText(metadata.migrationWindow) || metadata.migrationWindow === 'migration-window-required') {
    reasons.push('migration_window_required');
  }

  const candidates = Array.isArray(executorResult?.candidates) && executorResult.candidates.length > 0
    ? executorResult.candidates
    : [{ objectName: candidateObject, rowCount: Number.isFinite(rowCount) ? rowCount : null }];

  return {
    ready: reasons.length === 0,
    reasons,
    candidateObject,
    candidates,
    catalogReadback,
    dependencyReadback,
    postDropCatalogReadback,
    postDropApiBrowserSmoke,
    ddlExportSql,
    rollbackSql,
    controlledDropSql,
  };
}

function normalizeReasonArray(value, fallback) {
  const items = Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : [];
  return items.length > 0 ? items : [fallback];
}

function evidenceReady(value) {
  if (!value) return false;
  if (value === true) return true;
  if (typeof value !== 'object') return false;
  if (value.status === 'pass' || value.ready === true) return true;
  return false;
}

function normalizeSqlText(value) {
  const text = normalizeText(value);
  if (!text) return '';
  return text.endsWith('\n') ? text : `${text}\n`;
}

async function writeJsonDocuments(root, documents) {
  const outputs = [];
  for (const [filename, document] of Object.entries(documents)) {
    const filePath = path.join(root, filename);
    await writeJson(filePath, document);
    outputs.push({
      name: filename,
      path: filePath,
      status: document.status,
    });
  }
  return outputs;
}

async function writeTextDocuments(root, documents, status = 'blocked') {
  const outputs = [];
  for (const [filename, text] of Object.entries(documents)) {
    const filePath = path.join(root, filename);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, text, 'utf8');
    outputs.push({
      name: filename,
      path: filePath,
      status,
    });
  }
  return outputs;
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
  node project-testing/tools/run-old-object-physical-drop-evidence.mjs --handoff-file <handoff.json> --artifact-root <dir>

Defaults to fail-closed evidence generation. To enter guarded drop mode, pass:
  --include-db --confirm-db-ready --allow-drop --candidate-bundle <json>

To archive an already controlled DB/drop executor result, pass:
  --executor-result-file <json>
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const summary = await runOldObjectPhysicalDropEvidence(options);
    console.log(`Old-object physical drop evidence: ${summary.status}`);
    console.log(`DB mutation: ${summary.dbMutation ? 'yes' : 'no'}`);
    process.exitCode = summary.status === 'pass' ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
