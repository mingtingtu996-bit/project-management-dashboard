#!/usr/bin/env node

import { randomUUID, createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'
import { mapReplacementRowsToBaselineItems } from './run-default-master-plan-candidate-refresh-execution.mjs'
import {
  DEFAULT_STAGING_SUPABASE_PROJECT_REF,
  buildDefaultMasterPlanDatabaseTargetFingerprint,
  isApprovedDefaultMasterPlanNonProductionTarget,
  readDefaultMasterPlanEnvTarget,
  sameDefaultMasterPlanDatabaseTarget,
} from './default-master-plan-env-target.mjs'

const __filename = fileURLToPath(import.meta.url)
const SCRIPT_DIR = path.dirname(__filename)
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_REFRESH_PACKAGE = path.join(DEFAULT_REPORT_ROOT, 'candidate-refresh-package.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_REPORT_ROOT, 'candidate-baseline-materialization.json')
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'deploy', 'env', 'staging.env')
const REQUIRED_UNLOCK = 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION'
const EXPECTED_OPERATION_MODE = 'full_replace_candidate_baseline_items_from_profile_report'
const SOURCE_VERSION_LABEL = 'managed_frontier_default_master_plan'
const BASELINE_SOURCE_TYPE = 'current_schedule'
const ALLOWED_ENVIRONMENTS = new Set(['local', 'staging'])
const EXPECTED_REFRESH_BLOCKERS = new Set([
  'selected_candidate_export_profile_shape_mismatch',
  'candidate_baseline_refresh_required_before_runtime_publication',
])
const AUTOMATION_ACTOR_PATTERNS = [
  /^codex\b/i,
  /^automation\b/i,
  /^bot\b/i,
  /^system\b/i,
]
const BASELINE_ITEM_COLUMNS = [
  'id',
  'project_id',
  'baseline_version_id',
  'parent_item_id',
  'source_task_id',
  'source_milestone_id',
  'title',
  'planned_start_date',
  'planned_end_date',
  'target_progress',
  'sort_order',
  'is_milestone',
  'is_critical',
  'is_baseline_critical',
  'mapping_status',
  'notes',
  'template_id',
  'template_node_id',
  'engineering_category_id',
  'wbs_node_type',
  'wbs_path',
  'is_wbs_summary',
  'is_executable',
  'standard_work_code',
  'standard_work_name',
  'duration_calibration_source',
  'duration_provenance',
  'generation_metadata',
  'last_generated_at',
  'created_at',
  'updated_at',
]
const BASELINE_ITEM_JSON_COLUMNS = new Set(['generation_metadata'])

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    refreshPackage: DEFAULT_REFRESH_PACKAGE,
    output: DEFAULT_OUTPUT,
    envFile: DEFAULT_ENV_FILE,
    environment: 'staging',
    operatorApprovalRef: '',
    materializedBy: '',
    mode: 'dry-run',
    allowMaterialization: false,
    failOnBlocked: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }

    if (arg === '--refresh-package') args.refreshPackage = path.resolve(nextValue())
    else if (arg === '--output') args.output = path.resolve(nextValue())
    else if (arg === '--env-file') args.envFile = path.resolve(nextValue())
    else if (arg === '--environment') args.environment = text(nextValue()) || args.environment
    else if (arg === '--operator-approval-ref') args.operatorApprovalRef = text(nextValue())
    else if (arg === '--materialized-by') args.materializedBy = text(nextValue())
    else if (arg === '--mode') args.mode = text(nextValue())
    else if (arg === '--allow-materialization') args.allowMaterialization = true
    else if (arg === '--fail-on-blocked') args.failOnBlocked = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return args
}

export async function runDefaultMasterPlanCandidateBaselineMaterialization({
  refreshPackage = DEFAULT_REFRESH_PACKAGE,
  output = DEFAULT_OUTPUT,
  envFile = DEFAULT_ENV_FILE,
  environment = 'staging',
  operatorApprovalRef = '',
  materializedBy = '',
  mode = 'dry-run',
  allowMaterialization = false,
  env = process.env,
  dbClientFactory,
  targetReader = null,
  expectedStagingProjectRef = DEFAULT_STAGING_SUPABASE_PROJECT_REF,
  idFactory = (kind, _index, _row) => randomUUID(),
  now = new Date(),
} = {}) {
  const generatedAt = now.toISOString()
  const loadedRefreshPackage = await readJsonWithHash(path.resolve(refreshPackage))
  const payload = loadedRefreshPackage.json
  const target = await (targetReader ?? ((file) => readDefaultMasterPlanEnvTarget(file, { repoRoot: REPO_ROOT })))(path.resolve(envFile))
  const baselineId = firstText(payload.baselineId, payload.baseline_id) || idFactory('baseline', 0, payload)
  const projectId = firstText(payload.projectId, payload.project_id)
  const businessType = firstText(payload.businessType, payload.business_type)
  const targetRows = readArray(payload.targetReplacementRows)
  const baselineRow = buildCandidateBaselineRow({
    baselineId,
    projectId,
    businessType,
    payload,
    materializedBy,
    operatorApprovalRef,
    generatedAt,
  })
  const items = mapReplacementRowsToBaselineItems({
    rows: targetRows,
    baselineId,
    projectId,
    businessType,
    refreshedBy: materializedBy,
    operatorApprovalRef,
    generatedAt,
    idFactory: (index, row) => idFactory('item', index, row),
  }).map((item) => ({
    ...item,
    generation_metadata: {
      ...item.generation_metadata,
      source: 'candidate_baseline_materialization',
      candidateRefreshExecution: undefined,
      candidateBaselineMaterialization: {
        materializedAt: generatedAt,
        materializedBy,
        operatorApprovalRef,
        operationMode: EXPECTED_OPERATION_MODE,
      },
      mutationBoundary: {
        ...item.generation_metadata.mutationBoundary,
        writesCandidateBaselines: true,
      },
    },
  }))
  const gate = evaluateCandidateBaselineMaterializationGate({
    refreshPackage: payload,
    targetRows,
    args: {
      mode,
      environment,
      operatorApprovalRef,
      materializedBy,
      allowMaterialization,
      expectedStagingProjectRef,
    },
    env,
    target,
  })

  let executionResult = {
    status: mode === 'execute' ? 'blocked' : 'dry_run',
    insertedBaselineCount: 0,
    insertedItemCount: 0,
    transactionRolledBack: false,
    queryLog: [],
  }

  if (gate.executionAllowed) {
    const client = dbClientFactory ? dbClientFactory() : await createPgClient(envFile)
    try {
      executionResult = await executeCandidateBaselineMaterializationTransaction({
        client,
        baselineRow,
        items,
        projectId,
        stagingMaterialization: gate.stagingMaterialization,
      })
    } catch (error) {
      executionResult = {
        status: 'failed',
        insertedBaselineCount: 0,
        insertedItemCount: 0,
        errorCode: text(error?.code),
        errorMessage: error?.message ?? String(error),
        tenantValidation: readRecord(error?.tenantValidation),
        transactionRolledBack: true,
        queryLog: readArray(error?.queryLog),
      }
    } finally {
      if (client && typeof client.end === 'function') {
        await client.end().catch(() => undefined)
      }
    }
  }

  const report = buildMaterializationReport({
    loadedRefreshPackage,
    refreshPackage: payload,
    baselineId,
    projectId,
    businessType,
    baselineRow,
    items,
    gate,
    args: {
      mode,
      environment,
      operatorApprovalRef,
      materializedBy,
      allowMaterialization,
    },
    env,
    executionResult,
    target,
    generatedAt,
  })
  await writeReport(path.resolve(output), report)
  return report
}

export function evaluateCandidateBaselineMaterializationGate({
  refreshPackage,
  targetRows,
  args = {},
  env = process.env,
  target = null,
} = {}) {
  const normalizedMode = text(args.mode || 'dry-run')
  const normalizedEnvironment = text(args.environment || 'staging')
  const operatorApprovalRef = text(args.operatorApprovalRef)
  const materializedBy = text(args.materializedBy)
  const stagingMaterialization = readStagingMaterialization(refreshPackage)
  const unlockPresent = text(env?.[REQUIRED_UNLOCK]) === '1'
  const packageBlockers = readArray(refreshPackage?.blockers).map(text).filter(Boolean)
  const packageHardBlockers = packageBlockers.filter((blocker) => !EXPECTED_REFRESH_BLOCKERS.has(blocker))
  const blockers = uniqueStrings([
    text(refreshPackage?.status) === 'refresh_required' ? null : 'candidate_refresh_package_not_refresh_required',
    refreshPackage?.refreshRequired === true ? null : 'candidate_refresh_required_flag_missing',
    firstText(refreshPackage?.baselineId, refreshPackage?.baseline_id) ? null : 'baseline_id_required',
    firstText(refreshPackage?.projectId, refreshPackage?.project_id) ? null : 'project_id_required',
    firstText(refreshPackage?.businessType, refreshPackage?.business_type) ? null : 'business_type_required',
    readRecord(refreshPackage?.operationPlan).mode === EXPECTED_OPERATION_MODE ? null : 'candidate_refresh_operation_mode_invalid',
    refreshPackage?.productionReady === false ? null : 'candidate_refresh_package_must_not_mark_production_ready',
    packageHardBlockers.length === 0 ? null : 'candidate_baseline_materialization_refresh_package_has_unresolved_hard_blockers',
    targetRows.length > 0 ? null : 'candidate_baseline_materialization_target_rows_required',
    targetRows.every(isSafeReplacementRow) ? null : 'candidate_baseline_materialization_rows_must_be_candidate_only_no_runtime_writes',
    ALLOWED_ENVIRONMENTS.has(normalizedEnvironment) ? null : 'candidate_baseline_materialization_environment_must_be_local_or_staging',
    normalizedMode === 'execute' && !isApprovedDefaultMasterPlanNonProductionTarget(target, {
      environment: normalizedEnvironment,
      expectedStagingProjectRef: text(args.expectedStagingProjectRef) || DEFAULT_STAGING_SUPABASE_PROJECT_REF,
    })
      ? normalizedEnvironment === 'staging'
        ? 'candidate_baseline_materialization_target_not_approved_staging_project'
        : 'candidate_baseline_materialization_target_not_approved_non_production'
      : null,
    normalizedMode === 'execute' && packageHardBlockers.length === 0 && !hasCompleteStagingMaterializationContext(stagingMaterialization)
      ? 'candidate_baseline_materialization_staging_context_required'
      : null,
    normalizedMode === 'execute' && packageHardBlockers.length === 0 && hasCompleteStagingMaterializationContext(stagingMaterialization)
      && !stagingMaterializationMatchesExecution({
        stagingMaterialization,
        refreshPackage,
        target,
        environment: normalizedEnvironment,
        operatorApprovalRef,
        materializedBy,
      })
      ? 'candidate_baseline_materialization_staging_context_mismatch'
      : null,
    normalizedMode === 'execute' ? null : 'candidate_baseline_materialization_execute_mode_required',
    args.allowMaterialization === true ? null : 'candidate_baseline_materialization_allow_flag_required',
    unlockPresent ? null : 'candidate_baseline_materialization_unlock_required',
    operatorApprovalRef ? null : 'candidate_baseline_materialization_operator_approval_required',
    materializedBy ? null : 'candidate_baseline_materialized_by_required',
    materializedBy && isHumanActor(materializedBy) ? null : materializedBy ? 'human_candidate_baseline_materialization_actor_required' : null,
  ])

  return {
    executionAllowed: normalizedMode === 'execute' && blockers.length === 0,
    blockers,
    packageBlockers,
    packageHardBlockers,
    unlockPresent,
    stagingMaterialization,
  }
}

function buildMaterializationReport({
  loadedRefreshPackage,
  refreshPackage,
  baselineId,
  projectId,
  businessType,
  baselineRow,
  items,
  gate,
  args,
  env,
  executionResult,
  generatedAt,
  target,
}) {
  const dryRun = text(args.mode) !== 'execute'
  const failed = executionResult.status === 'failed'
  const status = failed
    ? 'candidate_baseline_materialization_failed'
    : gate.executionAllowed && executionResult.status === 'completed'
      ? 'candidate_baseline_materialization_completed'
      : dryRun
        ? 'candidate_baseline_materialization_dry_run'
        : 'candidate_baseline_materialization_blocked'
  const blockers = uniqueStrings([
    ...gate.blockers,
    failed ? 'candidate_baseline_materialization_db_execution_failed' : null,
  ])
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-materialization/v1',
    source: 'run-default-master-plan-candidate-baseline-materialization',
    generatedAt,
    status,
    productionReady: false,
    baselineId,
    projectId,
    businessType,
    target: normalizeTarget(target),
    evidence: {
      refreshPackageRef: `candidate_refresh_package:${repoRelative(loadedRefreshPackage.path)}#sha256=${loadedRefreshPackage.sha256}`,
    },
    executionControl: {
      executionAllowed: gate.executionAllowed,
      mode: text(args.mode),
      environment: text(args.environment),
      allowMaterialization: args.allowMaterialization === true,
      requiredUnlock: REQUIRED_UNLOCK,
      unlockPresent: gate.unlockPresent,
      operatorApprovalRef: text(args.operatorApprovalRef),
      materializedBy: text(args.materializedBy),
    },
    stagingMaterialization: gate.stagingMaterialization,
    packageBlockers: gate.packageBlockers,
    packageHardBlockers: gate.packageHardBlockers,
    materializationPlan: {
      sourceVersionLabel: SOURCE_VERSION_LABEL,
      baselineSourceType: BASELINE_SOURCE_TYPE,
      targetReplacementRowCount: items.length,
      wouldInsertCandidateBaseline: true,
      wouldInsertCandidateBaselineItems: true,
      candidateTitle: baselineRow.title,
      targetProfile: refreshPackage.targetProfile ?? null,
      diff: {
        currentRowCount: readNumber(refreshPackage.diff?.currentRowCount),
        targetRowCount: readNumber(refreshPackage.diff?.targetRowCount),
        missingTargetRowCount: readArray(refreshPackage.diff?.missingTargetRows).length,
      },
    },
    insertedBaselineCount: executionResult.insertedBaselineCount ?? 0,
    insertedItemCount: executionResult.insertedItemCount ?? 0,
    errorCode: executionResult.errorCode || null,
    errorMessage: executionResult.errorMessage || null,
    blockers,
    transaction: {
      rolledBack: executionResult.transactionRolledBack === true,
      queryLog: readArray(executionResult.queryLog),
    },
    tenantValidation: normalizeTenantValidation(executionResult.tenantValidation, gate.stagingMaterialization),
    mutationBoundary: {
      readsCandidateRefreshPackage: true,
      readsEnvUnlockFlags: true,
      writesReportFiles: true,
      writesProductionTables: false,
      writesCandidateBaselines: status === 'candidate_baseline_materialization_completed',
      writesTaskBaselineItems: status === 'candidate_baseline_materialization_completed',
      writesTasks: false,
      writesTaskDependencies: false,
      writesProductionDependencies: false,
      writesCriticalPathFacts: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      performsRollback: false,
      invokesRuntimeWriters: false,
    },
    nextActions: nextActionsForStatus(status),
  }
}

function normalizeTarget(value) {
  const target = readRecord(value)
  return {
    envFileRef: text(target.envFileRef) || null,
    envFileSha256: text(target.envFileSha256) || null,
    connectionCredentialSha256: text(target.connectionCredentialSha256) || null,
    supabaseProjectRef: text(target.supabaseProjectRef) || null,
    databaseHost: text(target.databaseHost) || null,
    databasePort: text(target.databasePort) || null,
    databaseName: text(target.databaseName) || null,
    databaseUser: text(target.databaseUser) || null,
    targetFingerprint: text(target.targetFingerprint) || null,
    connectionSource: text(target.connectionSource) || null,
    readable: target.readable === true,
  }
}

function buildCandidateBaselineRow({
  baselineId,
  projectId,
  businessType,
  payload,
  materializedBy,
  operatorApprovalRef,
  generatedAt,
}) {
  return {
    id: baselineId,
    project_id: projectId,
    status: 'draft',
    title: `默认主计划候选基线 - ${businessType || 'unknown'}`,
    description: [
      'Candidate-only default master-plan baseline materialized from governed refresh package.',
      'Not production-ready; requires runtime seed evidence, dependency writer, runtime publication, smoke and rollback evidence.',
      `operatorApprovalRef=${operatorApprovalRef || '-'}`,
      `materializedBy=${materializedBy || '-'}`,
    ].join(' '),
    source_type: BASELINE_SOURCE_TYPE,
    source_version_label: SOURCE_VERSION_LABEL,
    effective_from: firstDate(payload.targetReplacementRows?.[0]?.startDate ?? payload.targetReplacementRows?.[0]?.start_date),
    effective_to: firstDate(last(readArray(payload.targetReplacementRows))?.endDate ?? last(readArray(payload.targetReplacementRows))?.end_date),
    created_at: generatedAt,
    updated_at: generatedAt,
  }
}

async function executeCandidateBaselineMaterializationTransaction({
  client,
  baselineRow,
  items,
  projectId,
  stagingMaterialization,
}) {
  const queryLog = []
  const tenantValidation = {
    companyId: text(stagingMaterialization?.companyId),
    projectId: text(projectId),
    operatorId: text(stagingMaterialization?.operatorId),
    projectMatchedCompany: false,
    activeCompanyMembership: false,
    activeProjectMembership: false,
  }
  try {
    await loggedQuery(client, queryLog, 'BEGIN')
    const project = await loggedQuery(
      client,
      queryLog,
      'SELECT id, company_id FROM public.projects WHERE id = $1::uuid FOR SHARE',
      [projectId],
    )
    const projectRow = readRecord(project?.rows?.[0])
    if (!projectRow.id) {
      throw materializationTransactionError(
        'staging materialization project was not found',
        'candidate_baseline_materialization_project_not_found',
        tenantValidation,
      )
    }
    tenantValidation.projectMatchedCompany = text(projectRow.company_id) === tenantValidation.companyId
    if (!tenantValidation.projectMatchedCompany) {
      throw materializationTransactionError(
        'staging materialization project does not belong to the authorized company',
        'candidate_baseline_materialization_project_company_mismatch',
        tenantValidation,
      )
    }
    const companyMember = await loggedQuery(
      client,
      queryLog,
      "SELECT company_id FROM public.company_members WHERE company_id = $1::uuid AND user_id = $2::uuid AND status = 'active' LIMIT 1",
      [tenantValidation.companyId, tenantValidation.operatorId],
    )
    tenantValidation.activeCompanyMembership = Boolean(readRecord(companyMember?.rows?.[0]).company_id)
    if (!tenantValidation.activeCompanyMembership) {
      throw materializationTransactionError(
        'staging materialization operator is not an active member of the authorized company',
        'candidate_baseline_materialization_operator_company_membership_required',
        tenantValidation,
      )
    }
    const projectMember = await loggedQuery(
      client,
      queryLog,
      'SELECT project_id FROM public.project_members WHERE project_id = $1::uuid AND user_id = $2::uuid AND is_active = true LIMIT 1',
      [projectId, tenantValidation.operatorId],
    )
    tenantValidation.activeProjectMembership = Boolean(readRecord(projectMember?.rows?.[0]).project_id)
    if (!tenantValidation.activeProjectMembership) {
      throw materializationTransactionError(
        'staging materialization operator is not an active member of the target project',
        'candidate_baseline_materialization_operator_project_membership_required',
        tenantValidation,
      )
    }
    const existing = await loggedQuery(
      client,
      queryLog,
      'SELECT id FROM public.task_baselines WHERE id = $1::uuid OR (project_id = $2::uuid AND source_version_label = $3 AND status = $4) LIMIT 1 FOR UPDATE',
      [baselineRow.id, projectId, SOURCE_VERSION_LABEL, 'draft'],
    )
    if (readRecord(existing?.rows?.[0]).id) {
      throw Object.assign(new Error('candidate baseline already exists for materialization target'), {
        code: 'candidate_baseline_materialization_target_exists',
      })
    }
    const versionResult = await loggedQuery(
      client,
      queryLog,
      'SELECT COALESCE(MAX(version), 0)::int AS max_version FROM public.task_baselines WHERE project_id = $1::uuid',
      [projectId],
    )
    const version = Math.max(1, Number(versionResult?.rows?.[0]?.max_version ?? 0) + 1)
    await insertCandidateBaseline(client, queryLog, { ...baselineRow, version })
    await insertBaselineItems(client, queryLog, items)
    await loggedQuery(client, queryLog, 'COMMIT')
    return {
      status: 'completed',
      insertedBaselineCount: 1,
      insertedItemCount: items.length,
      transactionRolledBack: false,
      tenantValidation,
      queryLog,
    }
  } catch (error) {
    try {
      await loggedQuery(client, queryLog, 'ROLLBACK')
    } catch {
      // Preserve original failure.
    }
    throw Object.assign(error, {
      queryLog,
      tenantValidation: readRecord(error?.tenantValidation) || tenantValidation,
    })
  }
}

async function insertCandidateBaseline(client, queryLog, row) {
  const columns = [
    'id',
    'project_id',
    'version',
    'status',
    'title',
    'description',
    'source_type',
    'source_version_label',
    'effective_from',
    'effective_to',
    'created_at',
    'updated_at',
  ]
  const values = columns.map((column) => row[column] ?? null)
  const placeholders = columns.map((_, index) => `$${index + 1}`)
  await loggedQuery(
    client,
    queryLog,
    `INSERT INTO public.task_baselines (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    values,
  )
}

async function insertBaselineItems(client, queryLog, rows) {
  if (rows.length === 0) return 0
  const values = []
  const groups = rows.map((row) => {
    const placeholders = BASELINE_ITEM_COLUMNS.map((column) => {
      values.push(normalizeParameterValue(column, row[column]))
      return `$${values.length}`
    })
    return `(${placeholders.join(', ')})`
  })
  const sql = [
    `INSERT INTO public.task_baseline_items (${BASELINE_ITEM_COLUMNS.join(', ')})`,
    `VALUES ${groups.join(', ')}`,
  ].join(' ')
  await loggedQuery(client, queryLog, sql, values)
  return rows.length
}

function normalizeParameterValue(column, value) {
  const normalized = value === undefined ? null : value
  if (normalized === null) return null
  if (!BASELINE_ITEM_JSON_COLUMNS.has(column)) return normalized
  return typeof normalized === 'string' ? normalized : JSON.stringify(normalized)
}

async function createPgClient(envFile) {
  const parsed = dotenv.parse(await fs.readFile(envFile, 'utf8'))
  const connectionString = text(parsed.SUPABASE_MIGRATION_URL) || text(parsed.DB_CONNECTION_STRING) || text(parsed.DATABASE_URL)
  if (!connectionString) throw new Error('SUPABASE_MIGRATION_URL, DB_CONNECTION_STRING, or DATABASE_URL is required')
  const client = new pg.Client(buildCandidateBaselineMaterializationPgClientConfig(connectionString, parsed))
  await client.connect()
  return client
}

export function buildCandidateBaselineMaterializationPgClientConfig(connectionString, env = {}) {
  const normalizedConnectionString = stripSslModeFromConnectionString(connectionString)
  return {
    connectionString: normalizedConnectionString,
    ssl: env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
    query_timeout: 30000,
    statement_timeout: 30000,
  }
}

function stripSslModeFromConnectionString(connectionString) {
  try {
    const url = new URL(connectionString)
    url.searchParams.delete('sslmode')
    return url.toString()
  } catch {
    return connectionString
  }
}

async function loggedQuery(client, queryLog, sql, params = []) {
  queryLog.push(normalizeSqlForLog(sql))
  return client.query(sql, params)
}

function normalizeSqlForLog(sql) {
  const normalized = String(sql ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.startsWith('INSERT INTO public.task_baselines')) return 'INSERT INTO public.task_baselines'
  if (normalized.startsWith('INSERT INTO public.task_baseline_items')) return 'INSERT INTO public.task_baseline_items'
  return normalized
}

async function readJsonWithHash(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  return {
    path: filePath,
    sha256: createHash('sha256').update(raw).digest('hex'),
    json: JSON.parse(raw),
  }
}

async function writeReport(outputPath, report) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await fs.writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Candidate Baseline Materialization',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Production ready: ${report.productionReady ? 'yes' : 'no'}`,
    `Baseline: ${report.baselineId || '-'}`,
    `Project: ${report.projectId || '-'}`,
    `Business type: ${report.businessType || '-'}`,
    '',
    '## Execution Control',
    '',
    `- mode: ${report.executionControl.mode}`,
    `- environment: ${report.executionControl.environment}`,
    `- allowMaterialization: ${report.executionControl.allowMaterialization}`,
    `- unlockPresent: ${report.executionControl.unlockPresent}`,
    `- executionAllowed: ${report.executionControl.executionAllowed}`,
    '',
    '## Materialization Plan',
    '',
    `- sourceVersionLabel: ${report.materializationPlan.sourceVersionLabel}`,
    `- target replacement rows: ${report.materializationPlan.targetReplacementRowCount}`,
    `- inserted baseline count: ${report.insertedBaselineCount}`,
    `- inserted item count: ${report.insertedItemCount}`,
    '',
    '## Blockers',
    '',
  ]
  if (report.blockers.length === 0) lines.push('- none')
  else report.blockers.forEach((blocker) => lines.push(`- ${blocker}`))
  lines.push(
    '',
    '## Mutation Boundary',
    '',
    `- writesCandidateBaselines: ${report.mutationBoundary.writesCandidateBaselines}`,
    `- writesTaskBaselineItems: ${report.mutationBoundary.writesTaskBaselineItems}`,
    `- writesTasks: ${report.mutationBoundary.writesTasks}`,
    `- writesTaskDependencies: ${report.mutationBoundary.writesTaskDependencies}`,
    `- writesDurationSamples: ${report.mutationBoundary.writesDurationSamples}`,
    `- writesRuntimePublication: ${report.mutationBoundary.writesRuntimePublication}`,
    '',
  )
  return `${lines.join('\n')}\n`
}

function nextActionsForStatus(status) {
  if (status === 'candidate_baseline_materialization_completed') {
    return [
      'Rerun candidate discovery for the staging project and baseline.',
      'Rerun candidate refresh preflight with the discovery report, then refresh candidate baseline items if still required.',
      'Re-export candidate baseline and rerun candidate hygiene before runtime gates.',
    ]
  }
  if (status === 'candidate_baseline_materialization_dry_run') {
    return [
      `Set ${REQUIRED_UNLOCK}=1 and rerun with --mode execute --allow-materialization only for local/staging candidate-only materialization.`,
    ]
  }
  return [
    'Resolve blockers before candidate baseline materialization.',
  ]
}

function isSafeReplacementRow(row) {
  const record = readRecord(row)
  return record.candidateOnly === true
    && record.writesTasks === false
    && record.writesTaskDependencies === false
    && record.writesProductionDependencies === false
    && record.writesRuntimePublication === false
}

function isHumanActor(value) {
  const actor = text(value)
  return Boolean(actor) && !AUTOMATION_ACTOR_PATTERNS.some((pattern) => pattern.test(actor))
}

function materializationTransactionError(message, code, tenantValidation) {
  return Object.assign(new Error(message), { code, tenantValidation })
}

function normalizeTenantValidation(value, fallbackContext) {
  const validation = readRecord(value)
  const context = readRecord(fallbackContext)
  return {
    companyId: text(validation.companyId || context.companyId) || null,
    projectId: text(validation.projectId || context.projectId) || null,
    operatorId: text(validation.operatorId || context.operatorId) || null,
    projectMatchedCompany: validation.projectMatchedCompany === true,
    activeCompanyMembership: validation.activeCompanyMembership === true,
    activeProjectMembership: validation.activeProjectMembership === true,
  }
}

function readStagingMaterialization(refreshPackage) {
  const context = readRecord(refreshPackage?.stagingMaterialization)
  return {
    environment: text(context.environment),
    companyId: text(context.companyId),
    projectId: text(context.projectId),
    baselineId: text(context.baselineId),
    operatorId: text(context.operatorId),
    operatorApprovalRef: text(context.operatorApprovalRef),
    target: readRecord(context.target),
  }
}

function hasCompleteStagingMaterializationContext(context) {
  const targetFingerprint = buildDefaultMasterPlanDatabaseTargetFingerprint(context.target)
  return Boolean(
    context.environment
    && context.companyId
    && context.projectId
    && context.baselineId
    && context.operatorId
    && context.operatorApprovalRef
    && targetFingerprint
    && text(context.target?.targetFingerprint) === targetFingerprint,
  )
}

function stagingMaterializationMatchesExecution({
  stagingMaterialization,
  refreshPackage,
  target,
  environment,
  operatorApprovalRef,
  materializedBy,
}) {
  return stagingMaterialization.environment === environment
    && stagingMaterialization.projectId === firstText(refreshPackage?.projectId, refreshPackage?.project_id)
    && stagingMaterialization.baselineId === firstText(refreshPackage?.baselineId, refreshPackage?.baseline_id)
    && stagingMaterialization.operatorId === materializedBy
    && stagingMaterialization.operatorApprovalRef === operatorApprovalRef
    && sameDefaultMasterPlanDatabaseTarget(stagingMaterialization.target, target)
}

function firstText(...values) {
  return text(values.find((value) => text(value)) ?? '')
}

function firstDate(value) {
  const candidate = text(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function text(value) {
  return String(value ?? '').trim()
}

function uniqueStrings(values) {
  return [...new Set(values.map(text).filter(Boolean))]
}

function last(values) {
  return Array.isArray(values) && values.length > 0 ? values[values.length - 1] : null
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function markdownPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.md') : `${outputPath}.md`
}

function printHelp() {
  console.log([
    'Usage: node project-testing/tools/run-default-master-plan-candidate-baseline-materialization.mjs',
    '  [--refresh-package <candidate-refresh-package.json>]',
    '  [--output <candidate-baseline-materialization.json>]',
    '  [--env-file <env-file>]',
    '  [--environment local|staging]',
    '  [--operator-approval-ref <ref>]',
    '  [--materialized-by <user-id-or-name>]',
    '  [--mode dry-run|execute]',
    '  [--allow-materialization]',
    '  [--fail-on-blocked]',
  ].join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const args = parseArgs()
    if (args.help) {
      printHelp()
      process.exit(0)
    }
    const report = await runDefaultMasterPlanCandidateBaselineMaterialization(args)
    const summary = {
      status: report.status,
      productionReady: report.productionReady,
      baselineId: report.baselineId,
      projectId: report.projectId,
      businessType: report.businessType,
      insertedBaselineCount: report.insertedBaselineCount,
      insertedItemCount: report.insertedItemCount,
      blockers: report.blockers,
      output: repoRelative(path.resolve(args.output)),
    }
    console.log(JSON.stringify(summary, null, 2))
    if (args.failOnBlocked && report.status.endsWith('_blocked')) process.exit(1)
  } catch (error) {
    console.error(error?.stack ?? error)
    process.exit(1)
  }
}
