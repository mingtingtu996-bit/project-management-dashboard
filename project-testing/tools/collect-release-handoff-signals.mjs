#!/usr/bin/env node

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'server/.env');
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing/reports');
const localRequire = createRequire(import.meta.url);
const containerRequire = createRequire('/app/package.json');

async function importDependency(packageName) {
  try {
    return await import(pathToFileURL(localRequire.resolve(packageName)).href);
  } catch (localError) {
    try {
      return await import(pathToFileURL(containerRequire.resolve(packageName)).href);
    } catch {
      throw localError;
    }
  }
}

const TABLES_TO_PROBE = [
  'companies',
  'projects',
  'monthly_plans',
  'baseline_plans',
  'duration_context_policy_canary_candidates',
  'task_dependencies',
  'tasks',
  'schedule_runtime_publications',
  't2_rhythm_schedule_runtime_publications',
  'schema_migrations',
];

const ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_MIGRATION_URL',
  'DB_CONNECTION_STRING',
  'DB_PASSWORD',
  'JWT_SECRET',
  'WORKBUDDY_LIVE_BASE_URL',
  'API_BASE_URL',
  'DEV_USER_ID',
  'PORT',
  'CORS_ORIGIN',
];

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: DEFAULT_ENV_FILE,
    outputDir: null,
    reportRoot: DEFAULT_REPORT_ROOT,
    includeLive: false,
    confirmLiveHandoff: false,
    includeDb: false,
    confirmDbReady: false,
    environmentOwner: '',
    writeApprovalRef: '',
    manualApprovalRef: '',
    monitoringOwner: '',
    rollbackOwner: '',
    cleanupOwner: '',
    migrationOwner: '',
    runtimePublicationOwner: '',
    consumerObservationOwner: '',
    serverSignalsFile: '',
    envSource: 'file',
    discoverySource: '',
    help: false,
  };

  const readValue = (args, index, flag) => {
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${flag} requires a value`);
    }
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--env-file') {
      options.envFile = path.resolve(readValue(argv, index, arg));
      index += 1;
    } else if (arg === '--output-dir') {
      options.outputDir = path.resolve(readValue(argv, index, arg));
      index += 1;
    } else if (arg === '--report-root') {
      options.reportRoot = path.resolve(readValue(argv, index, arg));
      index += 1;
    } else if (arg === '--include-live') {
      options.includeLive = true;
    } else if (arg === '--confirm-live-handoff') {
      options.confirmLiveHandoff = true;
    } else if (arg === '--include-db') {
      options.includeDb = true;
    } else if (arg === '--confirm-db-ready') {
      options.confirmDbReady = true;
    } else if (arg === '--environment-owner') {
      options.environmentOwner = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--write-approval-ref') {
      options.writeApprovalRef = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--manual-approval-ref') {
      options.manualApprovalRef = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--monitoring-owner') {
      options.monitoringOwner = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--rollback-owner') {
      options.rollbackOwner = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--cleanup-owner') {
      options.cleanupOwner = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--migration-owner') {
      options.migrationOwner = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--runtime-publication-owner') {
      options.runtimePublicationOwner = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--consumer-observation-owner') {
      options.consumerObservationOwner = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--server-signals-file') {
      options.serverSignalsFile = path.resolve(readValue(argv, index, arg));
      index += 1;
    } else if (arg === '--env-source') {
      options.envSource = readValue(argv, index, arg);
      if (!['file', 'process'].includes(options.envSource)) {
        throw new Error('--env-source must be file or process');
      }
      index += 1;
    } else if (arg === '--discovery-source') {
      options.discoverySource = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node project-testing/tools/collect-release-handoff-signals.mjs [options]

Creates redacted handoff signals and a candidate handoff declaration under project-testing/reports.

Options:
  --env-file <path>                 Env file to inspect. Defaults to server/.env.
  --output-dir <path>               Handoff report directory. Defaults to the latest handoff-* report.
  --include-live                    Set candidate unlockFlags.includeLive=true.
  --confirm-live-handoff            Set candidate unlockFlags.confirmLiveHandoff=true.
  --include-db                      Set candidate unlockFlags.includeDb=true.
  --confirm-db-ready                Set candidate unlockFlags.confirmDbReady=true.
  --environment-owner <ref>         Fill live environment owner fields.
  --write-approval-ref <ref>        Fill write approval refs.
  --manual-approval-ref <ref>       Fill manual approval refs.
  --monitoring-owner <ref>          Fill monitoring owner fields.
  --rollback-owner <ref>            Fill rollback owner fields.
  --cleanup-owner <ref>             Fill C-18 cleanup owner.
  --migration-owner <ref>           Fill old-object migration owner.
  --runtime-publication-owner <ref> Fill C-19 runtime publication owner.
  --consumer-observation-owner <ref> Fill C-19 consumer observation owner.
  --server-signals-file <path>      Use sanitized server-side discovery signals instead of probing DB locally.
  --env-source <file|process>       Read env keys from a dotenv file or process.env. Defaults to file.
  --discovery-source <label>        Override DB discovery source label for sanitized reports.
`);
}

async function findLatestHandoffDir(reportRoot) {
  const entries = await readdir(reportRoot, { withFileTypes: true }).catch(() => []);
  const handoffDirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('handoff-')) continue;
    const fullPath = path.join(reportRoot, entry.name);
    const stats = await stat(fullPath).catch(() => null);
    if (stats) handoffDirs.push({ fullPath, mtimeMs: stats.mtimeMs });
  }
  handoffDirs.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!handoffDirs[0]) {
    throw new Error(`No handoff-* report directory found under ${reportRoot}`);
  }
  return handoffDirs[0].fullPath;
}

function hasEnv(env, key) {
  return Boolean(String(env[key] ?? '').trim());
}

function envRef(envFile, key) {
  return `env://${path.relative(REPO_ROOT, envFile).replace(/\\/g, '/')}#${key}`;
}

function qident(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function getColumns(client, tableName) {
  const result = await client.query(
    `select column_name, data_type
     from information_schema.columns
     where table_schema = 'public' and table_name = $1
     order by ordinal_position`,
    [tableName],
  );
  return result.rows;
}

async function tableCount(client, tableName) {
  try {
    const result = await client.query(`select count(*)::int as count from public.${qident(tableName)}`);
    return { exists: true, count: result.rows[0]?.count ?? null };
  } catch (error) {
    return { exists: false, count: null, error: String(error.message ?? error).slice(0, 160) };
  }
}

async function selectFirst(client, tableName, wantedColumns, whereSql = '', whereValues = []) {
  const columns = await getColumns(client, tableName);
  if (columns.length === 0) return null;
  const available = new Set(columns.map((column) => column.column_name));
  const selected = wantedColumns.filter((column) => available.has(column));
  if (!selected.includes('id') && available.has('id')) selected.unshift('id');
  if (selected.length === 0) return null;
  const orderBy = available.has('updated_at')
    ? 'updated_at desc nulls last'
    : available.has('created_at')
      ? 'created_at desc nulls last'
      : 'id desc';
  const query = `select ${selected.map(qident).join(', ')}
    from public.${qident(tableName)}
    ${whereSql}
    order by ${orderBy}
    limit 1`;
  const result = await client.query(query, whereValues);
  return result.rows[0] ?? null;
}

async function selectBestProjectTarget(client) {
  const result = await client.query(`
    select
      p.id as "projectId",
      p.company_id as "companyId",
      p.name as "projectName",
      mp.id as "planId",
      coalesce(task_counts.task_count, 0)::int as "taskCount",
      coalesce(plan_counts.monthly_plan_count, 0)::int as "monthlyPlanCount",
      greatest(
        coalesce(mp.updated_at, mp.created_at, timestamp with time zone 'epoch'),
        coalesce(p.updated_at, p.created_at, timestamp with time zone 'epoch')
      ) as "targetUpdatedAt"
    from public.projects p
    left join public.monthly_plans mp on mp.project_id = p.id
    left join (
      select project_id, count(*)::int as task_count
      from public.tasks
      group by project_id
    ) task_counts on task_counts.project_id = p.id
    left join (
      select project_id, count(*)::int as monthly_plan_count
      from public.monthly_plans
      group by project_id
    ) plan_counts on plan_counts.project_id = p.id
    order by
      case when mp.id is null then 1 else 0 end,
      coalesce(task_counts.task_count, 0) desc,
      "targetUpdatedAt" desc nulls last
    limit 1
  `);
  return result.rows[0] ?? null;
}

async function probeDatabase(env, envFile, pgModule) {
  const connectionString = env.SUPABASE_MIGRATION_URL || env.DB_CONNECTION_STRING;
  if (!connectionString) {
    return {
      ok: false,
      databaseTargetRef: '',
      error: 'missing SUPABASE_MIGRATION_URL and DB_CONNECTION_STRING',
    };
  }

  const client = new pgModule.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
    query_timeout: 12000,
    statement_timeout: 12000,
  });

  const output = {
    ok: false,
    databaseTargetRef: env.SUPABASE_MIGRATION_URL
      ? envRef(envFile, 'SUPABASE_MIGRATION_URL')
      : envRef(envFile, 'DB_CONNECTION_STRING'),
    tableCounts: {},
    columns: {},
    targets: {
      companyId: '',
      projectId: '',
      planId: '',
      candidateId: '',
      sampleCohortRef: '',
    },
  };

  try {
    await client.connect();
    output.ok = true;

    for (const table of TABLES_TO_PROBE) {
      output.tableCounts[table] = await tableCount(client, table);
      output.columns[table] = await getColumns(client, table).catch(() => []);
    }

    const project = await selectBestProjectTarget(client);
    output.targets.projectId = project?.projectId ? String(project.projectId) : '';
    output.targets.companyId = project?.companyId ? String(project.companyId) : '';
    output.targets.planId = project?.planId ? String(project.planId) : '';

    if (!output.targets.projectId || !output.targets.companyId) {
      const fallbackProject = await selectFirst(client, 'projects', ['id', 'company_id', 'name', 'title']);
      output.targets.projectId ||= fallbackProject?.id ? String(fallbackProject.id) : '';
      output.targets.companyId ||= fallbackProject?.company_id ? String(fallbackProject.company_id) : '';
    }

    if (!output.targets.companyId) {
      const company = await selectFirst(client, 'companies', ['id', 'name']);
      output.targets.companyId = company?.id ? String(company.id) : '';
    }

    if (!output.targets.planId) {
      const monthlyPlanColumns = new Set(output.columns.monthly_plans.map((column) => column.column_name));
      const planWhere = output.targets.projectId && monthlyPlanColumns.has('project_id')
        ? 'where project_id = $1'
        : '';
      const planValues = planWhere ? [output.targets.projectId] : [];
      const monthlyPlan = await selectFirst(client, 'monthly_plans', ['id', 'project_id'], planWhere, planValues);
      output.targets.planId = monthlyPlan?.id ? String(monthlyPlan.id) : '';
    }

    const candidateColumns = new Set(output.columns.duration_context_policy_canary_candidates.map((column) => column.column_name));
    const candidatePredicates = [];
    const candidateValues = [];
    if (output.targets.projectId && candidateColumns.has('project_id')) {
      candidateValues.push(output.targets.projectId);
      candidatePredicates.push(`project_id = $${candidateValues.length}`);
    }
    if (candidateColumns.has('candidate_status')) {
      candidatePredicates.push(`candidate_status in ('candidate', 'approved_for_canary')`);
    }
    const candidateWhere = candidatePredicates.length > 0
      ? `where ${candidatePredicates.join(' and ')}`
      : '';
    const candidate = await selectFirst(
      client,
      'duration_context_policy_canary_candidates',
      ['id', 'project_id', 'company_id', 'candidate_status'],
      candidateWhere,
      candidateValues,
    );
    output.targets.candidateId = candidate?.id ? String(candidate.id) : '';
    output.targets.sampleCohortRef = output.targets.projectId
      ? `db-sample://project/${output.targets.projectId}/duration-context-policy-canary-candidates`
      : '';

    return output;
  } catch (error) {
    return {
      ...output,
      ok: false,
      error: String(error.message ?? error).slice(0, 200),
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function loadEnv(options) {
  if (options.envSource === 'process') {
    return {
      envRaw: '',
      env: Object.fromEntries(ENV_KEYS
        .filter((key) => Object.prototype.hasOwnProperty.call(process.env, key))
        .map((key) => [key, process.env[key] ?? ''])),
    };
  }

  const envRaw = await readFile(options.envFile, 'utf8');
  const dotenvModule = await importDependency('dotenv');
  return {
    envRaw,
    env: dotenvModule.default.parse(envRaw),
  };
}

function sanitizeTargetValue(value) {
  return String(value ?? '').trim().replace(/[\r\n]/g, '').slice(0, 240);
}

function sanitizeDiscoveredTargets(targets = {}) {
  return {
    companyId: sanitizeTargetValue(targets.companyId),
    projectId: sanitizeTargetValue(targets.projectId),
    planId: sanitizeTargetValue(targets.planId),
    candidateId: sanitizeTargetValue(targets.candidateId),
    sampleCohortRef: sanitizeTargetValue(targets.sampleCohortRef),
  };
}

function sanitizeTableCounts(tableCounts = {}) {
  const sanitized = {};
  if (!tableCounts || typeof tableCounts !== 'object') return sanitized;
  for (const [tableName, value] of Object.entries(tableCounts)) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) continue;
    const count = Number(value?.count);
    sanitized[tableName] = {
      exists: Boolean(value?.exists),
      count: Number.isFinite(count) ? count : null,
      ...(value?.error ? { error: String(value.error).slice(0, 160) } : {}),
    };
  }
  return sanitized;
}

function sanitizeColumns(columns = {}) {
  const sanitized = {};
  if (!columns || typeof columns !== 'object') return sanitized;
  for (const [tableName, tableColumns] of Object.entries(columns)) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(tableName) || !Array.isArray(tableColumns)) continue;
    sanitized[tableName] = tableColumns
      .map((column) => ({
        column_name: sanitizeTargetValue(column?.column_name),
        data_type: sanitizeTargetValue(column?.data_type),
      }))
      .filter((column) => column.column_name);
  }
  return sanitized;
}

async function readServerSignalsProbe(serverSignalsFile, envFile, env) {
  const raw = await readFile(serverSignalsFile, 'utf8');
  const signals = JSON.parse(raw);
  const db = signals.connectivity?.db ?? {};
  const targets = sanitizeDiscoveredTargets(signals.discoveredTargets ?? {});
  const error = db.error
    ? String(db.error).replace(/[\r\n]/g, ' ').slice(0, 200)
    : undefined;
  const databaseTargetRef = hasEnv(env, 'SUPABASE_MIGRATION_URL')
    ? envRef(envFile, 'SUPABASE_MIGRATION_URL')
    : hasEnv(env, 'DB_CONNECTION_STRING')
      ? envRef(envFile, 'DB_CONNECTION_STRING')
      : sanitizeTargetValue(db.databaseTargetRef);

  return {
    ok: db.ok === true,
    databaseTargetRef,
    error,
    tableCounts: sanitizeTableCounts(signals.tableCounts),
    columns: sanitizeColumns(signals.columns),
    targets,
    discoverySource: 'server-side-sanitized-signals',
  };
}

function deriveBaseUrl(env) {
  const explicitBaseUrl = String(env.WORKBUDDY_LIVE_BASE_URL ?? env.API_BASE_URL ?? '').trim();
  if (explicitBaseUrl && /^https?:\/\//i.test(explicitBaseUrl)) return explicitBaseUrl;
  const port = String(env.PORT ?? '').trim() || '3001';
  return `http://127.0.0.1:${port}`;
}

function buildCandidateHandoff({ env, envFile, dbProbe, outputDir, options }) {
  const artifactRoot = path.relative(REPO_ROOT, outputDir).replace(/\\/g, '/');
  const authTokenRef = hasEnv(env, 'JWT_SECRET') && hasEnv(env, 'DEV_USER_ID')
    ? `${envRef(envFile, 'JWT_SECRET')}+${envRef(envFile, 'DEV_USER_ID')}`
    : hasEnv(env, 'SUPABASE_SERVICE_KEY')
      ? envRef(envFile, 'SUPABASE_SERVICE_KEY')
      : '';
  const writeApprovalRef = options.writeApprovalRef;
  const manualApprovalRef = options.manualApprovalRef;
  const environmentOwner = options.environmentOwner;
  const monitoringOwner = options.monitoringOwner;
  const rollbackOwner = options.rollbackOwner;
  const cleanupOwner = options.cleanupOwner;
  const migrationOwner = options.migrationOwner;
  const runtimePublicationOwner = options.runtimePublicationOwner;
  const consumerObservationOwner = options.consumerObservationOwner;
  const targets = dbProbe.targets ?? {};

  return {
    schemaVersion: 'workbuddy-release-handoff-input/v1',
    notes: [
      'Generated candidate. Review before use.',
      'Contains only refs and target IDs; no raw JWTs, database URLs, service-role keys, passwords, or migration URLs.',
    ],
    unlockFlags: {
      includeLive: options.includeLive,
      confirmLiveHandoff: options.confirmLiveHandoff,
      includeDb: options.includeDb,
      confirmDbReady: options.confirmDbReady,
    },
    gates: {
      'c18-l07-l15-live-diagnostics': {
        live: {
          baseUrl: deriveBaseUrl(env),
          authTokenRef,
          environmentOwner,
          writeApprovalRef,
          cleanupOwner,
          artifactRoot,
        },
        targets: {
          projectId: targets.projectId ?? '',
          planId: targets.planId ?? '',
        },
        evidenceOwners: {
          backendDiagnosticsOwner: environmentOwner,
          databaseEvidenceOwner: environmentOwner,
          browserEvidenceOwner: environmentOwner,
        },
      },
      'c15-live-learning-closeout': {
        live: {
          environmentOwner,
          writeApprovalRef,
          artifactRoot,
        },
        targets: {
          companyId: targets.companyId ?? '',
          projectId: targets.projectId ?? '',
          candidateId: targets.candidateId ?? '',
          sampleCohortRef: targets.sampleCohortRef ?? '',
        },
        approvals: {
          manualApprovalRef,
        },
        owners: {
          monitoringOwner,
          rollbackOwner,
        },
        evidenceOwners: {
          learningLoopOwner: environmentOwner,
          databaseEvidenceOwner: environmentOwner,
        },
      },
      'c19-runtime-publication-release-rollback': {
        live: {
          environmentOwner,
          writeApprovalRef,
          artifactRoot,
        },
        targets: {
          companyId: targets.companyId ?? '',
          projectId: targets.projectId ?? '',
        },
        release: {
          phase1L5Ref: '',
          releaseClosureArtifactRef: '',
          rollbackTargetRef: '',
          monitoringWindow: '',
        },
        approvals: {
          manualApprovalRef,
        },
        owners: {
          runtimePublicationOwner,
          consumerObservationOwner,
          monitoringOwner,
          rollbackOwner,
        },
      },
      'old-object-physical-drop-closeout': {
        db: {
          databaseTargetRef: dbProbe.databaseTargetRef ?? '',
          databaseReadinessOwner: environmentOwner,
          candidateBundleRef: '',
          ddlExportRef: '',
          rollbackPlanRef: '',
          migrationWindow: '',
          backupLocationRef: '',
          catalogReadbackOwner: environmentOwner,
          apiBrowserSmokeOwner: environmentOwner,
        },
        approvals: {
          manualApprovalRef,
        },
        owners: {
          migrationOwner,
          rollbackOwner,
          postDropSmokeOwner: migrationOwner,
        },
      },
    },
  };
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }

  const outputDir = options.outputDir ?? await findLatestHandoffDir(options.reportRoot);
  await mkdir(outputDir, { recursive: true });

  const { env } = await loadEnv(options);
  const dbProbe = options.serverSignalsFile
    ? await readServerSignalsProbe(options.serverSignalsFile, options.envFile, env)
    : await probeDatabase(env, options.envFile, (await importDependency('pg')).default);
  const signals = {
    schemaVersion: 'workbuddy-release-handoff-signals/v1',
    generatedAt: new Date().toISOString(),
    envFileRef: `path://${path.relative(REPO_ROOT, options.envFile).replace(/\\/g, '/')}`,
    envPresence: Object.fromEntries(ENV_KEYS.map((key) => [key, hasEnv(env, key)])),
    connectivity: {
      db: {
        ok: dbProbe.ok,
        databaseTargetRef: dbProbe.databaseTargetRef,
        error: dbProbe.error ?? null,
        discoverySource: options.discoverySource || dbProbe.discoverySource || 'runner-local-db-probe',
      },
    },
    tableCounts: dbProbe.tableCounts ?? {},
    discoveredTargets: dbProbe.targets ?? {},
    boundary: {
      noSecretValuesWritten: true,
      liveMutation: false,
      dbMutation: false,
      note: 'This report is a read-only pre-handoff signal collector. It does not run live diagnostics, mutate DB state, or approve release gates.',
    },
  };

  const candidate = buildCandidateHandoff({
    env,
    envFile: options.envFile,
    dbProbe,
    outputDir,
    options,
  });

  const signalsPath = path.join(outputDir, 'handoff-signals.json');
  const candidatePath = path.join(outputDir, 'handoff-candidate.generated.json');
  await writeFile(signalsPath, `${JSON.stringify(signals, null, 2)}\n`, 'utf8');
  await writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    status: dbProbe.ok ? 'signals-collected' : 'signals-collected-with-db-error',
    outputDir,
    signalsPath,
    candidatePath,
    dbOk: dbProbe.ok,
    discoveredTargets: signals.discoveredTargets,
    missingOperatorRefs: {
      environmentOwner: !options.environmentOwner,
      writeApprovalRef: !options.writeApprovalRef,
      manualApprovalRef: !options.manualApprovalRef,
      monitoringOwner: !options.monitoringOwner,
      rollbackOwner: !options.rollbackOwner,
      cleanupOwner: !options.cleanupOwner,
      migrationOwner: !options.migrationOwner,
      runtimePublicationOwner: !options.runtimePublicationOwner,
      consumerObservationOwner: !options.consumerObservationOwner,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'failed',
    error: String(error.message ?? error),
  }, null, 2));
  process.exitCode = 1;
});
