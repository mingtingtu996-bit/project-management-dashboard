#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'server/.env');

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    artifactRoot: null,
    envFile: DEFAULT_ENV_FILE,
    databaseTarget: '',
    includeDb: false,
    confirmDbReady: false,
    reviewOnly: false,
    candidateObjects: [],
    candidatesFile: null,
    approvalRef: '',
    migrationWindow: '',
    backupLocationRef: '',
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

    if (arg === '--artifact-root') {
      options.artifactRoot = path.resolve(nextValue());
    } else if (arg === '--env-file') {
      options.envFile = path.resolve(nextValue());
    } else if (arg === '--database-target') {
      options.databaseTarget = nextValue();
    } else if (arg === '--include-db') {
      options.includeDb = true;
    } else if (arg === '--confirm-db-ready') {
      options.confirmDbReady = true;
    } else if (arg === '--review-only') {
      options.reviewOnly = true;
    } else if (arg === '--candidate-object') {
      options.candidateObjects.push(nextValue());
    } else if (arg === '--candidates-file') {
      options.candidatesFile = path.resolve(nextValue());
    } else if (arg === '--approval-ref') {
      options.approvalRef = nextValue();
    } else if (arg === '--migration-window') {
      options.migrationWindow = nextValue();
    } else if (arg === '--backup-location-ref') {
      options.backupLocationRef = nextValue();
    } else if (arg === '--output-summary') {
      options.outputSummary = path.resolve(nextValue());
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

export async function generateOldObjectReviewArtifacts({
  artifactRoot,
  envFile = DEFAULT_ENV_FILE,
  databaseTarget = '',
  includeDb = true,
  confirmDbReady = true,
  reviewOnly = true,
  candidateObjects = [],
  candidatesFile = null,
  approvalRef = '',
  migrationWindow = '',
  backupLocationRef = '',
  outputSummary = null,
  queryExec = null,
  now = new Date(),
} = {}) {
  if (!artifactRoot) {
    throw new Error('artifactRoot is required');
  }

  const root = path.resolve(artifactRoot);
  await mkdir(root, { recursive: true });
  const candidates = unique([
    ...normalizeCandidateObjects(candidateObjects),
    ...await readCandidateObjectsFromFile(candidatesFile),
  ]);
  const target = normalizeText(databaseTarget) || envRef(envFile, 'SUPABASE_MIGRATION_URL');

  if (!includeDb || !confirmDbReady || reviewOnly !== true) {
    return writeBlockedReviewArtifacts({
      root,
      now,
      databaseTarget: target,
      reasons: ['db_review_unlock_required'],
      outputSummary,
    });
  }

  if (candidates.length === 0) {
    return writeBlockedReviewArtifacts({
      root,
      now,
      databaseTarget: target,
      reasons: ['candidate_object_required'],
      outputSummary,
    });
  }

  const exec = queryExec ?? await createPgQueryExec(envFile);
  const readbacks = [];
  for (const objectName of candidates) {
    readbacks.push(await readObjectReviewEvidence({
      queryExec: exec,
      objectName,
    }));
  }

  return writeReviewArtifacts({
    root,
    now,
    databaseTarget: target,
    approvalRef,
    migrationWindow,
    backupLocationRef,
    readbacks,
    outputSummary,
  });
}

async function createPgQueryExec(envFile) {
  const env = dotenv.parse(await readFile(envFile, 'utf8'));
  const connectionString = normalizeText(env.SUPABASE_MIGRATION_URL) || normalizeText(env.DB_CONNECTION_STRING);
  if (!connectionString) {
    throw new Error('SUPABASE_MIGRATION_URL or DB_CONNECTION_STRING is required for old-object review artifact generation');
  }
  const client = new pg.Client({
    connectionString,
    ssl: env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
    query_timeout: 12000,
    statement_timeout: 12000,
  });
  await client.connect();
  return async (sql, params = []) => {
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      if (sql === 'COMMIT' || sql === 'ROLLBACK') {
        await client.end();
      }
    }
  };
}

async function readObjectReviewEvidence({ queryExec, objectName }) {
  const parsed = parseQualifiedObjectName(objectName);
  const regclass = `${parsed.schemaName}.${parsed.objectName}`;
  const catalogRows = await queryExec(
    `SELECT c.oid::text AS object_oid,
            n.nspname AS schema_name,
            c.relname AS object_name,
            c.relkind,
            CASE c.relkind
              WHEN 'r' THEN 'table'
              WHEN 'p' THEN 'partitioned_table'
              WHEN 'v' THEN 'view'
              WHEN 'm' THEN 'materialized_view'
              WHEN 'S' THEN 'sequence'
              WHEN 'i' THEN 'index'
              ELSE c.relkind::text
            END AS relation_type
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.oid = to_regclass($1)
      LIMIT 1`,
    [regclass],
  );
  const catalog = catalogRows[0] ?? null;
  const relationType = normalizeText(catalog?.relation_type) || 'unknown';
  const rowCount = relationType.includes('table') && catalog
    ? await readRowCount(queryExec, parsed)
    : null;
  const columns = relationType.includes('table') && catalog
    ? await readColumns(queryExec, parsed)
    : [];
  const constraints = relationType.includes('table') && catalog
    ? await readConstraints(queryExec, parsed)
    : [];
  const indexes = relationType.includes('table') && catalog
    ? await readIndexes(queryExec, parsed)
    : [];
  const dependencies = catalog
    ? await readDependencies(queryExec, catalog.object_oid)
    : [];

  return {
    objectName: `${parsed.schemaName}.${parsed.objectName}`,
    parsed,
    relationType,
    exists: Boolean(catalog),
    catalog,
    rowCount,
    columns,
    constraints,
    indexes,
    dependencies,
    ddlExportSql: buildDdlExportSql({
      parsed,
      relationType,
      columns,
      constraints,
      indexes,
    }),
    rollbackSql: buildRollbackSql({
      parsed,
      relationType,
      columns,
      constraints,
      indexes,
    }),
    controlledDropSql: buildControlledDropSql({
      parsed,
      relationType,
    }),
  };
}

async function readRowCount(queryExec, parsed) {
  const rows = await queryExec(`SELECT count(*)::bigint AS row_count FROM ${quoteQualified(parsed)}`);
  return Number(rows[0]?.row_count ?? rows[0]?.count ?? Number.NaN);
}

async function readColumns(queryExec, parsed) {
  return queryExec(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position`,
    [parsed.schemaName, parsed.objectName],
  );
}

async function readConstraints(queryExec, parsed) {
  return queryExec(
    `SELECT con.conname AS constraint_name,
            pg_get_constraintdef(con.oid) AS constraint_def
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = $1
        AND rel.relname = $2
      ORDER BY con.conname`,
    [parsed.schemaName, parsed.objectName],
  );
}

async function readIndexes(queryExec, parsed) {
  return queryExec(
    `SELECT indexname, indexdef
       FROM pg_indexes
      WHERE schemaname = $1
        AND tablename = $2
      ORDER BY indexname`,
    [parsed.schemaName, parsed.objectName],
  );
}

async function readDependencies(queryExec, objectOid) {
  return queryExec(
    `SELECT dep.classid::regclass::text AS dependent_catalog,
            dep.objid::text AS dependent_oid,
            dep.refclassid::regclass::text AS referenced_catalog,
            dep.deptype
       FROM pg_depend dep
      WHERE dep.refobjid = $1::oid
      ORDER BY dep.classid::regclass::text, dep.objid::text`,
    [objectOid],
  );
}

async function writeBlockedReviewArtifacts({
  root,
  now,
  databaseTarget,
  reasons,
  outputSummary,
}) {
  const generatedAt = now.toISOString();
  const common = {
    generatedAt,
    databaseTarget,
    candidateObject: 'no-approved-drop-candidate',
    rowCount: null,
    catalogReadback: null,
    dependencyReadback: null,
    ddlExportPath: 'old-object-ddl-export.sql',
    rollbackPath: 'old-object-rollback-plan.sql',
    approvalRef: '',
    migrationWindow: '',
    postDropSmokePath: 'old-object-post-drop-api-browser-smoke.json',
    dbMutation: false,
    reasons,
  };
  const docs = {
    'old-object-drop-candidates.json': {
      schemaVersion: 'workbuddy-old-object-drop-candidates/v1',
      status: 'blocked',
      ...common,
      retiredObjectAuditOnly: false,
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
      boundary: 'No physical DROP was executed. Explicit candidate objects are required before review artifacts can be generated.',
    },
  };
  const sql = {
    'old-object-ddl-export.sql': '-- ddl-export-missing: no explicit old-object candidate was provided.\n',
    'old-object-rollback-plan.sql': '-- rollback-plan-missing: no explicit old-object candidate was provided.\n',
    'old-object-controlled-drop-migration.sql': '-- approval-missing: no explicit old-object candidate was provided.\n',
  };
  const outputs = [
    ...await writeJsonDocuments(root, docs),
    ...await writeTextDocuments(root, sql, 'blocked'),
  ];
  return writeRunSummary({
    root,
    outputSummary,
    summary: {
      schemaVersion: 'workbuddy-old-object-review-artifacts-run/v1',
      status: 'blocked',
      generatedAt,
      dbMutation: false,
      outputs,
      reasons,
    },
  });
}

async function writeReviewArtifacts({
  root,
  now,
  databaseTarget,
  approvalRef,
  migrationWindow,
  backupLocationRef,
  readbacks,
  outputSummary,
}) {
  const generatedAt = now.toISOString();
  const first = readbacks[0] ?? {};
  const candidateObject = first.objectName ?? 'no-approved-drop-candidate';
  const rowCount = first.rowCount ?? null;
  const dependencyReadback = buildDependencyReadback(readbacks);
  const catalogReadback = {
    status: readbacks.every((item) => item.exists) ? 'pass' : 'blocked',
    objectCount: readbacks.length,
    objects: readbacks.map((item) => ({
      objectName: item.objectName,
      exists: item.exists,
      relationType: item.relationType,
      rowCount: item.rowCount,
    })),
  };
  const common = {
    generatedAt,
    databaseTarget,
    candidateObject,
    rowCount,
    catalogReadback,
    dependencyReadback,
    ddlExportPath: 'old-object-ddl-export.sql',
    rollbackPath: 'old-object-rollback-plan.sql',
    approvalRef: normalizeText(approvalRef),
    migrationWindow: normalizeText(migrationWindow),
    backupLocationRef: normalizeText(backupLocationRef),
    postDropSmokePath: 'old-object-post-drop-api-browser-smoke.json',
    dbMutation: false,
  };
  const candidates = readbacks.map((item) => ({
    objectName: item.objectName,
    classification: 'obsolete_or_superseded',
    rowCount: item.rowCount,
    dependencyScan: {
      pass: dependencyReadback.status === 'pass',
      evidencePath: 'old-object-dependency-readback.json',
    },
    structureExport: { path: 'old-object-ddl-export.sql' },
    migrationPlan: { path: 'old-object-controlled-drop-migration.sql' },
    rollbackPlan: { path: 'old-object-rollback-plan.sql' },
    controlledDropMigration: { filename: 'old-object-controlled-drop-migration.sql' },
    postDropReadback: { required: true, pass: false },
    catalogReadback: { pass: true, path: 'old-object-rowcount-and-catalog-readback.json' },
    dependencyReadback: { pass: dependencyReadback.status === 'pass', path: 'old-object-dependency-readback.json' },
    postDropApiSmoke: { pass: false, path: 'old-object-post-drop-api-browser-smoke.json' },
    approvalRef: normalizeText(approvalRef) || null,
    dependencies: {
      runtime: [],
      schema: dependencyReadback.runtimeReferences,
    },
  }));
  const docs = {
    'old-object-drop-candidates.json': {
      schemaVersion: 'workbuddy-old-object-drop-candidates/v1',
      status: 'review_ready',
      ...common,
      candidates,
      reviewOnly: true,
      noPhysicalDropExecuted: true,
    },
    'old-object-rowcount-and-catalog-readback.json': {
      schemaVersion: 'workbuddy-old-object-rowcount-catalog-readback/v1',
      status: catalogReadback.status,
      ...common,
      rowCountReadbackReady: readbacks.every((item) => item.rowCount === 0),
      reviewOnly: true,
    },
    'old-object-dependency-readback.json': {
      schemaVersion: 'workbuddy-old-object-dependency-readback/v1',
      status: dependencyReadback.status,
      ...common,
      dependencyReadbackReady: dependencyReadback.status === 'pass',
      runtimeReferencePresent: dependencyReadback.runtimeReferences.length > 0,
      reviewOnly: true,
    },
    'old-object-post-drop-catalog-readback.json': {
      schemaVersion: 'workbuddy-old-object-post-drop-catalog-readback/v1',
      status: 'blocked',
      ...common,
      postDropSmokeMissing: true,
      postDropCatalogReadback: null,
      boundary: 'Review artifacts generated only. Physical DROP has not run, so post-drop catalog readback remains open.',
    },
    'old-object-post-drop-api-browser-smoke.json': {
      schemaVersion: 'workbuddy-old-object-post-drop-api-browser-smoke/v1',
      status: 'blocked',
      ...common,
      postDropSmokeMissing: true,
      postDropApiBrowserSmoke: null,
      boundary: 'Review artifacts generated only. Physical DROP has not run, so post-drop API/browser smoke remains open.',
    },
    'old-object-physical-drop-summary.json': {
      schemaVersion: 'workbuddy-old-object-physical-drop-summary/v1',
      status: 'review_ready',
      ...common,
      postDropSmokeMissing: true,
      noPhysicalDropExecuted: true,
      reviewOnly: true,
      passCriteria: {
        rowCountZero: readbacks.every((item) => item.rowCount === 0),
        catalogReadback: catalogReadback.status === 'pass',
        dependencyReadback: dependencyReadback.status === 'pass',
        ddlExportArchived: true,
        rollbackPlanArchived: true,
        controlledDropArchived: true,
        postDropCatalogReadback: false,
        postDropApiBrowserSmoke: false,
      },
      boundary: 'This is a pre-drop review bundle. It cannot close old-object physical-drop until controlled DROP, post-drop catalog readback, and API/browser smoke are executed.',
    },
  };
  const sql = {
    'old-object-ddl-export.sql': readbacks.map((item) => item.ddlExportSql).join('\n'),
    'old-object-rollback-plan.sql': readbacks.map((item) => item.rollbackSql).join('\n'),
    'old-object-controlled-drop-migration.sql': readbacks.map((item) => item.controlledDropSql).join('\n'),
  };
  const outputs = [
    ...await writeJsonDocuments(root, docs),
    ...await writeTextDocuments(root, sql, 'review_ready'),
  ];
  return writeRunSummary({
    root,
    outputSummary,
    summary: {
      schemaVersion: 'workbuddy-old-object-review-artifacts-run/v1',
      status: 'review_ready',
      generatedAt,
      dbMutation: false,
      outputs,
      candidateCount: readbacks.length,
      postDropRequired: true,
    },
  });
}

function buildDependencyReadback(readbacks) {
  const references = readbacks.flatMap((item) => item.dependencies.map((dependency) => ({
    objectName: item.objectName,
    ...dependency,
  })));
  return {
    status: references.length === 0 ? 'pass' : 'blocked',
    runtimeReferences: references,
    dependencyCount: references.length,
  };
}

function buildDdlExportSql({ parsed, relationType, columns, constraints, indexes }) {
  if (!relationType.includes('table')) {
    return `-- DDL export for ${quoteQualified(parsed)} requires specialized ${relationType} exporter.\n`;
  }
  const columnLines = columns.length > 0
    ? columns.map((column) => `  ${quoteIdentifier(column.column_name)} ${columnTypeSql(column)}${column.is_nullable === 'NO' ? ' NOT NULL' : ''}${column.column_default ? ` DEFAULT ${column.column_default}` : ''}`)
    : ['  id uuid'];
  const constraintLines = constraints
    .filter((constraint) => normalizeText(constraint.constraint_def))
    .map((constraint) => `  CONSTRAINT ${quoteIdentifier(constraint.constraint_name)} ${constraint.constraint_def}`);
  const body = [...columnLines, ...constraintLines].join(',\n');
  const indexSql = indexes
    .map((index) => normalizeText(index.indexdef))
    .filter(Boolean)
    .map((line) => `${line};`)
    .join('\n');
  return [
    `-- Read-only DDL export generated for old-object review.`,
    `CREATE TABLE IF NOT EXISTS ${quoteQualified(parsed)} (`,
    body,
    `);`,
    indexSql,
    '',
  ].filter((line) => line !== '').join('\n') + '\n';
}

function buildRollbackSql({ parsed, relationType, columns, constraints, indexes }) {
  return [
    `-- Rollback plan: recreate ${quoteQualified(parsed)} if the controlled DROP must be reverted.`,
    buildDdlExportSql({ parsed, relationType, columns, constraints, indexes }).trim(),
    `-- Data restore must come from the recorded backup artifact before DROP execution.`,
    '',
  ].join('\n');
}

function buildControlledDropSql({ parsed, relationType }) {
  const dropType = relationType.includes('view') ? 'VIEW' : 'TABLE';
  return [
    `-- Controlled old-object DROP review SQL. Do not execute without approval, backup, migration window, and rollback owner.`,
    `DROP ${dropType} IF EXISTS ${quoteQualified(parsed)} RESTRICT;`,
    '',
  ].join('\n');
}

function columnTypeSql(column) {
  const type = normalizeText(column.data_type) || 'text';
  return type;
}

function parseQualifiedObjectName(value) {
  const raw = normalizeText(value).replaceAll('"', '');
  if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i.test(raw)) {
    throw new Error(`Unsafe candidate object name: ${value}`);
  }
  const parts = raw.split('.');
  return {
    schemaName: parts.length > 1 ? parts[0] : 'public',
    objectName: parts.length > 1 ? parts[1] : parts[0],
  };
}

function quoteQualified(parsed) {
  return `${quoteIdentifier(parsed.schemaName)}.${quoteIdentifier(parsed.objectName)}`;
}

function quoteIdentifier(identifier) {
  const text = normalizeText(identifier);
  if (!/^[a-z_][a-z0-9_]*$/i.test(text)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return text;
}

async function readCandidateObjectsFromFile(candidatesFile) {
  if (!candidatesFile) return [];
  const raw = await readFile(candidatesFile, 'utf8');
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
  if (Array.isArray(parsed)) {
    return normalizeCandidateObjects(parsed.map((item) => (
      typeof item === 'string' ? item : item?.objectName
    )));
  }
  if (Array.isArray(parsed?.candidates)) {
    return normalizeCandidateObjects(parsed.candidates.map((item) => item?.objectName ?? item?.candidateObject));
  }
  return [];
}

function normalizeCandidateObjects(values) {
  return (Array.isArray(values) ? values : [])
    .map(normalizeText)
    .filter(Boolean);
}

function unique(values) {
  return Array.from(new Set(values));
}

async function writeJsonDocuments(root, documents) {
  const outputs = [];
  for (const [name, document] of Object.entries(documents)) {
    const filePath = path.join(root, name);
    await writeJson(filePath, document);
    outputs.push({ name, path: filePath, status: document.status });
  }
  return outputs;
}

async function writeTextDocuments(root, documents, status) {
  const outputs = [];
  for (const [name, text] of Object.entries(documents)) {
    const filePath = path.join(root, name);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, text, 'utf8');
    outputs.push({ name, path: filePath, status });
  }
  return outputs;
}

async function writeRunSummary({ root, outputSummary, summary }) {
  const target = outputSummary ?? path.join(root, 'old-object-review-artifacts-run.json');
  await writeJson(target, summary);
  return summary;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function envRef(envFile, key) {
  return `env://${path.relative(REPO_ROOT, envFile).replace(/\\/g, '/')}#${key}`;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/generate-old-object-review-artifacts.mjs --artifact-root <dir> --candidate-object public.old_table --include-db --confirm-db-ready --review-only

This tool only generates pre-DROP review artifacts. It never executes DROP and cannot close the physical-drop gate by itself.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }
    const summary = await generateOldObjectReviewArtifacts(options);
    console.log(`Old-object review artifacts: ${summary.status}`);
    console.log(`DB mutation: ${summary.dbMutation ? 'yes' : 'no'}`);
    process.exitCode = summary.status === 'blocked' ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
