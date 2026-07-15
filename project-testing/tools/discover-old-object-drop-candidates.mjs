#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'server/.env');

const NAME_HINTS = [
  'legacy',
  'old',
  'deprecated',
  'retired',
  'v14',
  'v1_4',
  'ai_duration',
  'scope_dimension',
  'project_scope_dimension',
  'zone_object',
  'professional_object',
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: DEFAULT_ENV_FILE,
    output: null,
    minNameHint: false,
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

    if (arg === '--env-file') {
      options.envFile = path.resolve(nextValue());
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue());
    } else if (arg === '--min-name-hint') {
      options.minNameHint = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.output) throw new Error('--output is required');
  return options;
}

export async function discoverOldObjectDropCandidates({
  envFile = DEFAULT_ENV_FILE,
  output,
  minNameHint = false,
  now = new Date(),
} = {}) {
  if (!output) throw new Error('output is required');
  const env = dotenv.parse(await readFile(envFile, 'utf8'));
  const client = await connectPg(env);
  try {
    const relations = await client.query(
      `SELECT n.nspname AS schema_name,
              c.relname AS object_name,
              c.relkind,
              obj_description(c.oid, 'pg_class') AS comment
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p', 'v', 'm')
          AND c.relname NOT LIKE 'pg_%'
          AND c.relname NOT LIKE 'schema_%'
        ORDER BY c.relname`,
    );
    const candidates = [];
    const inspected = [];
    for (const relation of relations.rows) {
      const objectName = `${relation.schema_name}.${relation.object_name}`;
      const hintScore = scoreNameHint(`${objectName} ${relation.comment ?? ''}`);
      if (minNameHint && hintScore < 1) {
        inspected.push({ objectName, status: 'skipped_no_name_hint', hintScore });
        continue;
      }
      const rowCount = relation.relkind === 'v' || relation.relkind === 'm'
        ? 0
        : await safeRowCount(client, relation.schema_name, relation.object_name);
      const dependencyReadback = await readDependencyReadback(client, relation.schema_name, relation.object_name);
      const runtimeReferences = await readRuntimeReferences(client, relation.object_name);
      const candidate = {
        objectName,
        relationType: relationKind(relation.relkind),
        rowCount,
        hintScore,
        nameHints: matchedNameHints(`${objectName} ${relation.comment ?? ''}`),
        catalogReadback: {
          status: 'pass',
          exists: true,
          relationType: relationKind(relation.relkind),
          rowCount,
        },
        dependencyReadback,
        runtimeReferences,
        dependencyClean: dependencyReadback.status === 'pass' && runtimeReferences.length === 0,
      };
      inspected.push({
        objectName,
        rowCount,
        hintScore,
        dependencyStatus: dependencyReadback.status,
        runtimeReferenceCount: runtimeReferences.length,
      });
      if (rowCount === 0 && hintScore > 0 && candidate.dependencyClean) {
        candidates.push(candidate);
      }
    }

    const report = {
      schemaVersion: 'workbuddy-old-object-drop-candidate-discovery/v1',
      generatedAt: now.toISOString(),
      discoveryMode: minNameHint ? 'name_hint_filtered' : 'full_catalog',
      minNameHint,
      status: candidates.length > 0 ? 'candidate_found' : 'no_safe_candidate',
      databaseTarget: envRef(envFile, 'SUPABASE_MIGRATION_URL'),
      candidateCount: candidates.length,
      candidates,
      inspectedCount: inspected.length,
      inspected,
      safeCandidateRule: {
        rowCountMustBeZero: true,
        nameHintRequired: true,
        dependencyReadbackMustPass: true,
        runtimeReferenceCountMustBeZero: true,
      },
      noSafeCandidateReason: candidates.length > 0
        ? ''
        : 'No public relation satisfied rowCount=0, old-object name hint, dependency-clean, and runtime-reference-clean together.',
      physicalDropExecuted: false,
      boundary: {
        liveMutation: false,
        dbMutation: false,
        note: 'Read-only discovery. A discovered candidate is not dropped here; it must still pass review bundle, approval, controlled DROP, and post-drop smoke.',
      },
    };
    await writeJson(output, report);
    return report;
  } finally {
    await client.end();
  }
}

async function connectPg(env) {
  const connectionString = normalizeText(env.SUPABASE_MIGRATION_URL) || normalizeText(env.DB_CONNECTION_STRING);
  if (!connectionString) throw new Error('SUPABASE_MIGRATION_URL or DB_CONNECTION_STRING is required');
  const client = new pg.Client({
    connectionString,
    ssl: env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
    query_timeout: 30000,
    statement_timeout: 30000,
  });
  await client.connect();
  return client;
}

async function safeRowCount(client, schemaName, objectName) {
  try {
    const rows = await client.query(`SELECT count(*)::int AS row_count FROM ${quoteIdent(schemaName)}.${quoteIdent(objectName)}`);
    return Number(rows.rows[0]?.row_count ?? Number.NaN);
  } catch {
    return Number.NaN;
  }
}

async function readDependencyReadback(client, schemaName, objectName) {
  const rows = await client.query(
    `WITH target AS (
       SELECT c.oid
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname = $2
        LIMIT 1
     )
     SELECT dep.classid::regclass::text AS dependent_catalog,
            dep.objid::text AS dependent_oid,
            dep.refclassid::regclass::text AS referenced_catalog,
            dep.deptype
       FROM pg_depend dep
       JOIN target t ON t.oid = dep.refobjid
      WHERE dep.deptype NOT IN ('i')
      ORDER BY dep.classid::regclass::text, dep.objid::text`,
    [schemaName, objectName],
  );
  const runtimeReferences = rows.rows.filter((row) => !isIgnorableDependency(row));
  return {
    status: runtimeReferences.length === 0 ? 'pass' : 'blocked',
    dependencyCount: runtimeReferences.length,
    runtimeReferences,
  };
}

async function readRuntimeReferences(client, objectName) {
  const searchText = objectName.toLowerCase();
  const rows = await client.query(
    `SELECT table_name,
            column_name,
            data_type
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND lower(column_name) LIKE $1
      ORDER BY table_name, column_name`,
    [`%${searchText}%`],
  );
  return rows.rows;
}

function isIgnorableDependency(row) {
  const catalog = normalizeText(row.dependent_catalog);
  if (catalog === 'pg_type') return true;
  if (catalog === 'pg_class') return true;
  if (catalog === 'pg_attrdef') return true;
  return false;
}

function relationKind(kind) {
  if (kind === 'r') return 'table';
  if (kind === 'p') return 'partitioned_table';
  if (kind === 'v') return 'view';
  if (kind === 'm') return 'materialized_view';
  return normalizeText(kind) || 'unknown';
}

function scoreNameHint(value) {
  const lower = normalizeText(value).toLowerCase();
  return NAME_HINTS.filter((hint) => lower.includes(hint)).length;
}

function matchedNameHints(value) {
  const lower = normalizeText(value).toLowerCase();
  return NAME_HINTS.filter((hint) => lower.includes(hint));
}

function quoteIdent(value) {
  const text = normalizeText(value);
  if (!/^[a-z_][a-z0-9_]*$/i.test(text)) throw new Error(`Unsafe identifier: ${value}`);
  return `"${text}"`;
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
  node project-testing/tools/discover-old-object-drop-candidates.mjs --output <json>

Read-only discovery of empty, legacy-named, dependency-clean public relations.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }
    const report = await discoverOldObjectDropCandidates(options);
    console.log(`Old-object candidate discovery: ${report.status}`);
    console.log(`Candidates: ${report.candidateCount}`);
    process.exitCode = report.status === 'candidate_found' || report.status === 'no_safe_candidate' ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
