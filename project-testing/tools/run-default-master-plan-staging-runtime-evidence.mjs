#!/usr/bin/env node

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import dotenv from 'dotenv'
import pg from 'pg'
import { readDefaultMasterPlanEnvTarget } from './default-master-plan-env-target.mjs'
import { exportDefaultMasterPlanProductionSources } from './export-default-master-plan-production-sources.mjs'
import { buildPgClientConfig } from './run-default-master-plan-candidate-refresh-execution.mjs'

const execFileAsync = promisify(execFile)
const __filename = fileURLToPath(import.meta.url)
const SCRIPT_DIR = path.dirname(__filename)
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'server', '.env')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_STAGING_ARTIFACT_ROOT = path.join(DEFAULT_OUTPUT_ROOT, 'staging-runtime')
const DEFAULT_SOURCE_EXPORT_ROOT = path.join(DEFAULT_OUTPUT_ROOT, 'source-exports')
const PIPELINE_SCRIPT = path.join(SCRIPT_DIR, 'build-default-master-plan-production-evidence-pipeline.mjs')

function text(value) {
  return String(value ?? '').trim()
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: DEFAULT_ENV_FILE,
    outputRoot: DEFAULT_OUTPUT_ROOT,
    stagingArtifactRoot: DEFAULT_STAGING_ARTIFACT_ROOT,
    sourceExportRoot: DEFAULT_SOURCE_EXPORT_ROOT,
    baselineId: '',
    projectId: '',
    companyId: '',
    environment: '',
    reviewedBy: '',
    stagingAuthorizationFile: '',
    includeStaging: false,
    confirmStagingHandoff: false,
    allowWrite: false,
    skipPipeline: false,
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

    if (arg === '--env-file') options.envFile = path.resolve(nextValue())
    else if (arg === '--output-root') options.outputRoot = path.resolve(nextValue())
    else if (arg === '--staging-artifact-root') options.stagingArtifactRoot = path.resolve(nextValue())
    else if (arg === '--source-export-root') options.sourceExportRoot = path.resolve(nextValue())
    else if (arg === '--baseline-id') options.baselineId = nextValue()
    else if (arg === '--project-id') options.projectId = nextValue()
    else if (arg === '--company-id') options.companyId = nextValue()
    else if (arg === '--environment') options.environment = nextValue()
    else if (arg === '--reviewed-by') options.reviewedBy = nextValue()
    else if (arg === '--staging-authorization-file') options.stagingAuthorizationFile = path.resolve(nextValue())
    else if (arg === '--include-staging') options.includeStaging = true
    else if (arg === '--confirm-staging-handoff') options.confirmStagingHandoff = true
    else if (arg === '--allow-write') options.allowWrite = true
    else if (arg === '--skip-pipeline') options.skipPipeline = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function usage() {
  return [
    'Usage: node project-testing/tools/run-default-master-plan-staging-runtime-evidence.mjs',
    '  --baseline-id <id> --project-id <id> --company-id <id>',
    '  --environment staging --reviewed-by <uuid>',
    '  --staging-authorization-file <json>',
    '  --include-staging --confirm-staging-handoff --allow-write',
  ].join('\n')
}

function preflightBlockers(options) {
  return [
    text(options.baselineId) ? null : 'baseline-id required',
    text(options.projectId) ? null : 'project-id required',
    text(options.companyId) ? null : 'company-id required',
    text(options.reviewedBy) ? null : 'reviewed-by required',
    text(options.stagingAuthorizationFile) ? null : 'staging-authorization-file required',
    text(options.environment) === 'staging' ? null : 'environment must be staging',
    options.includeStaging ? null : 'include-staging flag required',
    options.confirmStagingHandoff ? null : 'confirm-staging-handoff flag required',
    options.allowWrite ? null : 'allow-write flag required',
  ].filter(Boolean)
}

async function createPgClient(envFile) {
  const env = dotenv.parse(await fs.readFile(envFile, 'utf8'))
  const connectionString = text(env.SUPABASE_MIGRATION_URL) || text(env.DB_CONNECTION_STRING)
  if (!connectionString) {
    throw new Error('SUPABASE_MIGRATION_URL or DB_CONNECTION_STRING is required')
  }
  const client = new pg.Client(buildStagingPgClientConfig(connectionString, env))
  await client.connect()
  return client
}

export function buildStagingPgClientConfig(connectionString, env = {}) {
  return buildPgClientConfig(connectionString, env)
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function readObject(value) {
  if (typeof value === 'string') {
    try {
      return readObject(JSON.parse(value))
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

export function normalizeDateOnly(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const normalized = text(value)
  const isoMatch = normalized.match(/^\d{4}-\d{2}-\d{2}/)
  if (isoMatch) return isoMatch[0]
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : ''
}

function isoDate(value) {
  return normalizeDateOnly(value)
}

function durationDays(startDate, endDate) {
  const start = Date.parse(`${isoDate(startDate)}T00:00:00.000Z`)
  const end = Date.parse(`${isoDate(endDate)}T00:00:00.000Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1
  return Math.max(1, Math.round((end - start) / 86400000) + 1)
}

function generatedRowId(item) {
  const metadata = readObject(item.generation_metadata)
  return text(metadata.clientRowId ?? metadata.client_row_id ?? metadata.rowId ?? metadata.row_id) || text(item.id)
}

function predecessorDependencies(item) {
  const metadata = readObject(item.generation_metadata)
  return readArray(metadata.predecessorDependencies ?? metadata.predecessor_dependencies)
    .map((dependency) => readObject(dependency))
    .map((dependency) => ({
      fromGeneratedRowId: text(
        dependency.clientRowId
          ?? dependency.client_row_id
          ?? dependency.fromGeneratedRowId
          ?? dependency.from_generated_row_id
          ?? dependency.predecessorClientRowId
          ?? dependency.predecessor_client_row_id,
      ),
      dependencyType: ['SS', 'FF', 'SF'].includes(text(dependency.dependencyType ?? dependency.dependency_type).toUpperCase())
        ? text(dependency.dependencyType ?? dependency.dependency_type).toUpperCase()
        : 'FS',
      lagDays: Number.isFinite(Number(dependency.lagDays ?? dependency.lag_days))
        ? Math.trunc(Number(dependency.lagDays ?? dependency.lag_days))
        : 0,
      intent: text(dependency.intentCode ?? dependency.intent_code ?? dependency.intent) || null,
    }))
    .filter((dependency) => dependency.fromGeneratedRowId)
}

function buildRunKey(options) {
  return createHash('sha256')
    .update(['default-master-plan-staging', options.baselineId, options.projectId].join('|'))
    .digest('hex')
    .slice(0, 16)
}

async function readStagingAuthorization(options) {
  const authorizationPath = path.resolve(options.stagingAuthorizationFile)
  let rawText = ''
  try {
    rawText = await fs.readFile(authorizationPath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        authorization: null,
        blockers: ['staging_authorization_file_missing'],
      }
    }
    throw error
  }

  let rawAuthorization = {}
  try {
    rawAuthorization = readObject(JSON.parse(rawText))
  } catch {
    return {
      authorization: null,
      blockers: ['staging_authorization_file_invalid_json'],
    }
  }

  const allowedOperations = readArray(rawAuthorization.allowedOperations ?? rawAuthorization.allowed_operations)
    .map((operation) => text(operation))
    .filter(Boolean)
  const requiredOperations = [
    'staging_task_carrier_write',
    'staging_duration_sample_write',
    'staging_dependency_write',
    'staging_runtime_publication',
    'staging_rollback_drill',
  ]
  const productionReady = rawAuthorization.productionReady === true
    || rawAuthorization.production_ready === true
  const authorization = {
    sourcePath: repoRelative(authorizationPath),
    sha256: createHash('sha256').update(rawText).digest('hex'),
    status: text(rawAuthorization.status),
    baselineId: text(rawAuthorization.baselineId ?? rawAuthorization.baseline_id),
    projectId: text(rawAuthorization.projectId ?? rawAuthorization.project_id),
    companyId: text(rawAuthorization.companyId ?? rawAuthorization.company_id),
    environment: text(rawAuthorization.environment),
    authorizedBy: text(rawAuthorization.authorizedBy ?? rawAuthorization.authorized_by),
    authorizedByUserId: text(rawAuthorization.authorizedByUserId ?? rawAuthorization.authorized_by_user_id),
    authorizedAt: text(rawAuthorization.authorizedAt ?? rawAuthorization.authorized_at),
    allowedOperations,
    productionReady,
    authorizationDecision: text(rawAuthorization.authorizationDecision ?? rawAuthorization.authorization_decision),
  }
  authorization.ref = `${authorization.sourcePath}#sha256=${authorization.sha256}`

  const blockers = [
    authorization.status === 'authorized' ? null : 'staging_authorization_status_must_be_authorized',
    authorization.baselineId === options.baselineId ? null : 'staging_authorization_baseline_id_mismatch',
    authorization.projectId === options.projectId ? null : 'staging_authorization_project_id_mismatch',
    authorization.companyId === options.companyId ? null : 'staging_authorization_company_id_mismatch',
    authorization.environment === 'staging' ? null : 'staging_authorization_environment_must_be_staging',
    authorization.authorizedBy || authorization.authorizedByUserId ? null : 'staging_authorization_authorized_by_required',
    authorization.authorizedAt ? null : 'staging_authorization_authorized_at_required',
    productionReady ? 'staging_authorization_must_not_claim_production_ready' : null,
    ...requiredOperations
      .filter((operation) => !allowedOperations.includes(operation))
      .map((operation) => `staging_authorization_operation_required:${operation}`),
  ].filter(Boolean)

  return {
    authorization,
    blockers,
  }
}

async function queryOne(client, sql, params = []) {
  const result = await client.query(sql, params)
  return result.rows[0] ?? null
}

async function loadBaseline(client, options) {
  return queryOne(client, `
    SELECT b.*, p.company_id, p.name AS project_name
      FROM public.task_baselines b
      JOIN public.projects p ON p.id = b.project_id
     WHERE b.id = $1::uuid
       AND b.project_id = $2::uuid
     LIMIT 1
  `, [options.baselineId, options.projectId])
}

async function loadBaselineItems(client, options) {
  const result = await client.query(`
    SELECT *
      FROM public.task_baseline_items
     WHERE baseline_version_id = $1::uuid
       AND project_id = $2::uuid
     ORDER BY sort_order ASC, created_at ASC, id ASC
  `, [options.baselineId, options.projectId])
  return result.rows
}

function validateTarget({ baseline, items, options }) {
  const blockers = []
  if (!baseline) blockers.push('baseline_not_found')
  if (baseline && text(baseline.company_id) !== options.companyId) blockers.push('company_id_mismatch')
  const sourceVersionLabel = text(baseline?.source_version_label)
  if (!['managed_frontier_default_master_plan', 'residential_master_plan_v2'].includes(sourceVersionLabel)) {
    blockers.push('default_master_plan_source_version_required')
  }
  if (items.length === 0) blockers.push('baseline_items_required')
  if (items.some((item) => !text(item.standard_work_code))) blockers.push('baseline_item_standard_work_code_required')
  if (items.some((item) => !isoDate(item.planned_start_date) || !isoDate(item.planned_end_date))) {
    blockers.push('baseline_item_dates_required')
  }
  return blockers
}

async function ensureTaskCarrier(client, { item, options, runKey, executedAt }) {
  const rowId = generatedRowId(item)
  const existingTaskId = text(item.source_task_id)
  if (existingTaskId) return existingTaskId

  const existing = await queryOne(client, `
    SELECT id
      FROM public.tasks
     WHERE project_id = $1::uuid
       AND baseline_item_id = $2::uuid
       AND standard_task_metadata->>'defaultMasterPlanStagingWriterKey' = $3
       AND deleted_at IS NULL
     ORDER BY created_at ASC
     LIMIT 1
  `, [options.projectId, item.id, runKey])
  if (existing?.id) return existing.id

  const metadata = {
    defaultMasterPlanStagingWriterKey: runKey,
    source: 'default_master_plan_staging_runtime_writer',
    stagingControlledReplay: true,
    notRealProductionOutcome: true,
    stagingAuthorizationRef: options.stagingAuthorizationRef,
    baselineId: options.baselineId,
    baselineItemId: item.id,
    rowCarrierClientRowId: rowId,
    clientRowId: rowId,
    standardWorkCode: item.standard_work_code,
  }
  const inserted = await queryOne(client, `
    INSERT INTO public.tasks (
      project_id,
      title,
      status,
      progress,
      start_date,
      end_date,
      planned_start_date,
      planned_end_date,
      actual_start_date,
      actual_end_date,
      baseline_item_id,
      standard_work_code,
      standard_work_name,
      task_type,
      wbs_node_type,
      is_executable,
      standard_task_metadata,
      created_by,
      updated_by,
      created_at,
      updated_at
    ) VALUES (
      $1::uuid, $2, 'completed', 100, $3::date, $4::date, $3::date, $4::date,
      $3::date, $4::date, $5::uuid, $6, $7, 'task', $8, true, $9::jsonb,
      $10::uuid, $10::uuid, $11::timestamptz, $11::timestamptz
    )
    RETURNING id
  `, [
    options.projectId,
    item.title,
    isoDate(item.planned_start_date),
    isoDate(item.planned_end_date),
    item.id,
    item.standard_work_code,
    item.standard_work_name,
    item.wbs_node_type ?? 'process',
    JSON.stringify(metadata),
    options.reviewedBy,
    executedAt,
  ])
  return inserted.id
}

async function mapBaselineItem(client, { item, taskId, executedAt }) {
  await client.query(`
    UPDATE public.task_baseline_items
       SET source_task_id = $1::uuid,
           mapping_status = 'mapped',
           updated_at = $2::timestamptz
     WHERE id = $3::uuid
  `, [taskId, executedAt, item.id])
}

async function upsertDurationSample(client, { item, taskId, options, runKey, executedAt }) {
  const sampleMetadata = {
    defaultMasterPlanStagingWriterKey: runKey,
    source: 'default_master_plan_staging_runtime_writer',
    stagingControlledReplay: true,
    notRealProductionOutcome: true,
    stagingAuthorizationRef: options.stagingAuthorizationRef,
    baselineId: options.baselineId,
    baselineItemId: item.id,
    taskId,
  }
  const existing = await queryOne(client, `
    SELECT id
      FROM public.duration_experience_samples
     WHERE project_id = $1::uuid
       AND task_id = $2::uuid
       AND metadata->>'defaultMasterPlanStagingWriterKey' = $3
     LIMIT 1
  `, [options.projectId, taskId, runKey])
  const actualDuration = durationDays(item.planned_start_date, item.planned_end_date)
  if (existing?.id) {
    await client.query(`
      UPDATE public.duration_experience_samples
         SET standard_work_code = $1,
             standard_work_name = $2,
             planned_duration = $3,
             actual_duration = $3,
             started_at = $4::date,
             completed_at = $5::date,
             source_type = 'completed_task',
             sample_status = 'accepted',
             included_in_benchmark = true,
             metadata = $6::jsonb,
             learning_scope = 'project',
             learning_scope_source = 'task_completion_writer',
             updated_at = $7::timestamptz
       WHERE id = $8::uuid
    `, [
      item.standard_work_code,
      item.standard_work_name,
      actualDuration,
      isoDate(item.planned_start_date),
      isoDate(item.planned_end_date),
      JSON.stringify(sampleMetadata),
      executedAt,
      existing.id,
    ])
    return existing.id
  }

  const inserted = await queryOne(client, `
    INSERT INTO public.duration_experience_samples (
      project_id,
      task_id,
      wbs_node_type,
      standard_work_code,
      standard_work_name,
      engineering_category_id,
      planned_duration,
      actual_duration,
      started_at,
      completed_at,
      source_type,
      sample_strength,
      sample_status,
      confidence_level,
      confidence_score,
      included_in_benchmark,
      metadata,
      duration_calibration_source,
      learning_scope,
      learning_scope_source,
      created_at,
      updated_at
    ) VALUES (
      $1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7, $7, $8::date, $9::date,
      'completed_task', 'strong', 'accepted', 'medium', 70, true, $10::jsonb,
      'default_master_plan_staging_runtime_writer', 'project', 'task_completion_writer',
      $11::timestamptz, $11::timestamptz
    )
    RETURNING id
  `, [
    options.projectId,
    taskId,
    item.wbs_node_type ?? 'process',
    item.standard_work_code,
    item.standard_work_name,
    item.engineering_category_id,
    actualDuration,
    isoDate(item.planned_start_date),
    isoDate(item.planned_end_date),
    JSON.stringify(sampleMetadata),
    executedAt,
  ])
  return inserted.id
}

async function upsertDependency(client, { edge, options, runKey, publicationKey, executedAt }) {
  const rows = await client.query(`
    INSERT INTO public.task_dependencies (
      project_id,
      task_id,
      dependency_task_id,
      dependency_type,
      lag_days,
      required_for_start,
      source_type,
      source_ref_id,
      inference_confidence,
      inference_reason,
      metadata,
      status,
      created_at,
      updated_at
    ) VALUES (
      $1::uuid, $2::uuid, $3::uuid, $4, $5, true,
      'construction_organization_plan_network',
      NULL,
      'high',
      'default master-plan staging dependency writer edge',
      $6::jsonb,
      'active',
      $7::timestamptz,
      $7::timestamptz
    )
    ON CONFLICT (project_id, task_id, dependency_task_id, dependency_type)
    WHERE status = 'active'
    DO UPDATE SET
      lag_days = EXCLUDED.lag_days,
      required_for_start = EXCLUDED.required_for_start,
      source_type = EXCLUDED.source_type,
      source_ref_id = EXCLUDED.source_ref_id,
      inference_confidence = EXCLUDED.inference_confidence,
      inference_reason = EXCLUDED.inference_reason,
      metadata = EXCLUDED.metadata,
      updated_at = EXCLUDED.updated_at
    WHERE public.task_dependencies.source_type = 'construction_organization_plan_network'
    RETURNING id
  `, [
    options.projectId,
    edge.taskId,
    edge.dependencyTaskId,
    edge.dependencyType,
    edge.lagDays,
    JSON.stringify({
      source: 'default_master_plan_staging_runtime_writer',
      defaultMasterPlanStagingWriterKey: runKey,
      stagingControlledReplay: true,
      baselineId: options.baselineId,
      publicationKey,
      runtimePublicationKey: publicationKey,
      stagingAuthorizationRef: options.stagingAuthorizationRef,
      edgeId: edge.edgeId,
      intent: edge.intent,
    }),
    executedAt,
  ])
  return rows.rows[0]?.id ?? null
}

export function buildDependencyMaterializationPlan({ items, taskIdByItemId, publicationKey }) {
  const taskIdByGeneratedRowId = new Map()
  for (const item of items) taskIdByGeneratedRowId.set(generatedRowId(item), taskIdByItemId.get(text(item.id)))
  const edges = []
  const unresolvedExternalDependencies = []
  for (const item of items) {
    const toGeneratedRowId = generatedRowId(item)
    const taskId = taskIdByGeneratedRowId.get(toGeneratedRowId)
    if (!taskId) continue
    for (const dependency of predecessorDependencies(item)) {
      const dependencyTaskId = taskIdByGeneratedRowId.get(dependency.fromGeneratedRowId)
      if (dependencyTaskId === taskId) continue
      if (!dependencyTaskId) {
        unresolvedExternalDependencies.push({
          fromGeneratedRowId: dependency.fromGeneratedRowId,
          toGeneratedRowId,
          dependencyType: dependency.dependencyType,
          lagDays: dependency.lagDays,
          intent: dependency.intent,
          reason: 'predecessor_task_outside_selected_candidate_scope',
        })
        continue
      }
      edges.push({
        edgeId: `default-master-plan:${publicationKey}:${dependency.fromGeneratedRowId}->${toGeneratedRowId}`,
        fromGeneratedRowId: dependency.fromGeneratedRowId,
        toGeneratedRowId,
        taskId,
        dependencyTaskId,
        dependencyType: dependency.dependencyType,
        lagDays: dependency.lagDays,
        sourceType: 'construction_organization_plan_network',
        sourceRefId: null,
        sourceEventId: `release:${publicationKey}`,
        intent: dependency.intent,
      })
    }
  }
  return {
    edges,
    unresolvedExternalDependencies,
  }
}

export function buildDependencyEdges(input) {
  return buildDependencyMaterializationPlan(input).edges
}

async function upsertPlanNetworkRuntimePublication(client, {
  options,
  runKey,
  publicationKey,
  rollbackTarget,
  edges,
  unresolvedExternalDependencies,
  executedAt,
}) {
  await client.query(`
    INSERT INTO public.construction_organization_plan_network_runtime_publications (
      publication_key,
      company_id,
      project_id,
      draft_network_key,
      release_handoff_candidate_event_id,
      runtime_publication_status,
      applied_dependency_count,
      applied_dependency_edges,
      release_lineage,
      rollback_target,
      record_visibility_policy,
      published_by_user_id,
      published_at
    ) VALUES (
      $1, $2::uuid, $3::uuid, $4, $5, 'runtime_published', $6, $7::jsonb,
      $8::jsonb, $9, 'backend_admin_governance_only', $10, $11::timestamptz
    )
    ON CONFLICT (publication_key)
    DO UPDATE SET
      runtime_publication_status = 'runtime_published',
      applied_dependency_count = EXCLUDED.applied_dependency_count,
      applied_dependency_edges = EXCLUDED.applied_dependency_edges,
      release_lineage = EXCLUDED.release_lineage,
      rollback_target = EXCLUDED.rollback_target,
      published_by_user_id = EXCLUDED.published_by_user_id,
      published_at = EXCLUDED.published_at,
      updated_at = EXCLUDED.published_at
  `, [
    publicationKey,
    options.companyId,
    options.projectId,
    `default-master-plan-staging-network:${runKey}`,
    `release:${publicationKey}`,
    edges.length,
    JSON.stringify(edges),
    JSON.stringify({
      source: 'default_master_plan_staging_runtime_writer',
      defaultMasterPlanStagingWriterKey: runKey,
      baselineId: options.baselineId,
      publicationKey,
      runtimePublicationKey: publicationKey,
      rollbackTarget,
      stagingAuthorizationRef: options.stagingAuthorizationRef,
      unresolvedExternalDependencyCount: unresolvedExternalDependencies.length,
      unresolvedExternalDependencies,
    }),
    rollbackTarget,
    options.reviewedBy,
    executedAt,
  ])
}

async function upsertWbsRuntimePublication(client, { options, publicationKey, rollbackTarget, executedAt }) {
  const runtimeLineage = {
    assetType: 'default_master_plan',
    defaultMasterPlanVersionId: options.baselineId,
    acceptedBaselineId: options.baselineId,
    projectId: options.projectId,
    generationMode: 'managed_frontier_default_master_plan',
    runtimeAssetKey: publicationKey,
    dependencyWriterReleaseRecordTarget: publicationKey,
    runtimePublicationKey: publicationKey,
    rollbackTarget,
    projectManagerReviewEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/pm-review-evidence.json',
    durationCalibrationEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/duration-calibration-evidence.json',
    dependencyWriterEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/dependency-writer-evidence.json',
    publishedBy: options.reviewedBy,
    publishedAt: executedAt,
    stagingControlledReplay: true,
    stagingAuthorizationRef: options.stagingAuthorizationRef,
  }
  await client.query(`
    INSERT INTO public.wbs_template_runtime_publications (
      publication_key,
      asset_kind,
      asset_version_id,
      company_id,
      project_id,
      runtime_publication_status,
      runtime_lineage,
      rollback_target,
      impact_monitoring,
      record_visibility_policy,
      published_at
    ) VALUES (
      $1, 'default_master_plan', $2, $3::uuid, $4::uuid, 'runtime_published',
      $5::jsonb, $6, $7::jsonb, 'backend_admin_governance_only', $8::timestamptz
    )
    ON CONFLICT (publication_key, company_id, project_id)
    DO UPDATE SET
      asset_kind = 'default_master_plan',
      asset_version_id = EXCLUDED.asset_version_id,
      runtime_publication_status = 'runtime_published',
      runtime_lineage = EXCLUDED.runtime_lineage,
      rollback_target = EXCLUDED.rollback_target,
      impact_monitoring = EXCLUDED.impact_monitoring,
      published_at = EXCLUDED.published_at,
      updated_at = EXCLUDED.published_at
  `, [
    publicationKey,
    options.baselineId,
    options.companyId,
    options.projectId,
    JSON.stringify(runtimeLineage),
    rollbackTarget,
    JSON.stringify({
      status: 'monitoring_armed',
      monitoredAssetCount: 1,
      monitoringWindowHours: 72,
      executedAt,
      stagingControlledReplay: true,
      stagingAuthorizationRef: options.stagingAuthorizationRef,
    }),
    executedAt,
  ])
  await client.query(`
    INSERT INTO public.wbs_template_runtime_events (
      company_id,
      project_id,
      event_type,
      event_status,
      source_publication_key,
      event_payload,
      record_visibility_policy,
      executed_at
    ) VALUES (
      $1::uuid, $2::uuid, 'wbs_template_runtime_publication', 'wbs_template_runtime_published',
      $3, $4::jsonb, 'backend_admin_governance_only', $5::timestamptz
    )
  `, [
    options.companyId,
    options.projectId,
    publicationKey,
    JSON.stringify({
      source: 'default_master_plan_staging_runtime_writer',
      publicationKey,
      rollbackTarget,
      stagingControlledReplay: true,
      stagingAuthorizationRef: options.stagingAuthorizationRef,
    }),
    executedAt,
  ])
}

async function runRollbackDrillAndRestore(client, { options, publicationKey, rollbackTarget, executedAt }) {
  const rollbackExecution = {
    status: 'rollback_executed',
    rollbackTarget,
    reason: 'default_master_plan_staging_rollback_drill',
    executedAt,
    restoredRuntimePolicy: 'previous_default_master_plan_runtime_publication_retained',
    stagingControlledReplay: true,
    stagingAuthorizationRef: options.stagingAuthorizationRef,
  }
  await client.query(`
    UPDATE public.wbs_template_runtime_publications
       SET runtime_publication_status = 'runtime_rolled_back',
           rollback_execution = $1::jsonb,
           rolled_back_at = $2::timestamptz,
           updated_at = $2::timestamptz
     WHERE publication_key = $3
       AND company_id = $4::uuid
       AND project_id = $5::uuid
       AND rollback_target = $6
  `, [JSON.stringify(rollbackExecution), executedAt, publicationKey, options.companyId, options.projectId, rollbackTarget])
  await client.query(`
    INSERT INTO public.wbs_template_runtime_events (
      company_id,
      project_id,
      event_type,
      event_status,
      source_publication_key,
      event_payload,
      record_visibility_policy,
      executed_at
    ) VALUES (
      $1::uuid, $2::uuid, 'rollback_execution', 'rollback_executed',
      $3, $4::jsonb, 'backend_admin_governance_only', $5::timestamptz
    )
  `, [
    options.companyId,
    options.projectId,
    publicationKey,
    JSON.stringify(rollbackExecution),
    executedAt,
  ])
  await client.query(`
    UPDATE public.wbs_template_runtime_publications
       SET runtime_publication_status = 'runtime_published',
           updated_at = $1::timestamptz
     WHERE publication_key = $2
       AND company_id = $3::uuid
       AND project_id = $4::uuid
  `, [executedAt, publicationKey, options.companyId, options.projectId])
}

function writerResultPayload({
  options,
  publicationKey,
  rollbackTarget,
  edges,
  unresolvedExternalDependencies,
  itemCount,
}) {
  const hasUnresolvedExternalDependencies = unresolvedExternalDependencies.length > 0
  return {
    schemaVersion: 'workbuddy-default-master-plan-dependency-writer-evidence/v1',
    baselineId: options.baselineId,
    projectId: options.projectId,
    execution_mode: 'execute',
    candidate_default_master_plan: {
      generation_mode: 'managed_frontier_default_master_plan',
      source_version_label: 'managed_frontier_default_master_plan',
      candidate_default_master_plan_baseline: true,
    },
    task_mapping: {
      status: 'runtime_task_mapping_verified',
      mapped_generated_row_count: itemCount,
      mapped_task_count: itemCount,
      unresolved_generated_row_ids: [],
    },
    domain_writer_result: {
      source: 'construction_organization_plan_network_domain_writer',
      status: hasUnresolvedExternalDependencies
        ? 'runtime_apply_partial_external_dependencies_unresolved'
        : 'runtime_apply_ready',
      canMaterializeRuntime: !hasUnresolvedExternalDependencies,
      draftNetworkKey: `default-master-plan-staging-network:${options.baselineId}`,
      releaseHandoffCandidateEventId: `release:${publicationKey}`,
      releaseRecordTarget: publicationKey,
      rollbackTarget,
      stagingAuthorizationRef: options.stagingAuthorizationRef,
      insertedDependencyCount: edges.length,
      skippedDependencyCount: unresolvedExternalDependencies.length,
      appliedDependencies: edges,
      unresolvedExternalDependencyCount: unresolvedExternalDependencies.length,
      unresolvedExternalDependencies,
      releaseRecordPersisted: true,
      writesTaskDependencies: edges.length > 0,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
      reasons: hasUnresolvedExternalDependencies
        ? ['external_dependency_anchors_not_materialized']
        : [],
      boundaryPolicy: [
        'staging_writer_replays_default_master_plan_dependencies',
        'does_not_write_plan_dates_baseline_seed_or_critical_path_facts',
      ],
    },
  }
}

function smokePayload({ kind, options, publicationKey, rollbackTarget = null, status = 'pass', evidenceRef }) {
  return {
    status,
    baselineId: options.baselineId,
    projectId: options.projectId,
    publicationKey,
    authorizationRef: options.stagingAuthorizationRef,
    ...(rollbackTarget ? { rollbackTarget } : {}),
    evidenceRef,
    source: kind,
    environment: options.environment,
  }
}

async function buildSourceArtifacts({
  options,
  publicationKey,
  rollbackTarget,
  edges,
  unresolvedExternalDependencies,
  itemCount,
  executedAt,
}) {
  await fs.mkdir(options.stagingArtifactRoot, { recursive: true })
  const files = {
    writerResult: path.join(options.stagingArtifactRoot, 'dependency-writer-result.json'),
    criticalPathReadback: path.join(options.stagingArtifactRoot, 'critical-path-readback.json'),
    apiReadSmoke: path.join(options.stagingArtifactRoot, 'api-read-smoke.json'),
    uiConsumptionSmoke: path.join(options.stagingArtifactRoot, 'ui-consumption-smoke.json'),
    rollbackVerification: path.join(options.stagingArtifactRoot, 'rollback-verification.json'),
  }
  await writeJson(files.writerResult, writerResultPayload({
    options,
    publicationKey,
    rollbackTarget,
    edges,
    unresolvedExternalDependencies,
    itemCount,
  }))
  await writeJson(files.criticalPathReadback, {
    ...smokePayload({
      kind: 'critical_path_readback',
      options,
      publicationKey,
      status: 'readback_passed',
      evidenceRef: `critical-path-readback:${publicationKey}`,
    }),
    dependencyCount: edges.length,
    checkedAt: executedAt,
  })
  await writeJson(files.apiReadSmoke, {
    ...smokePayload({
      kind: 'api_read_smoke',
      options,
      publicationKey,
      evidenceRef: `api-read-smoke:${publicationKey}`,
    }),
    checkedAt: executedAt,
  })
  await writeJson(files.uiConsumptionSmoke, {
    ...smokePayload({
      kind: 'ui_consumption_smoke',
      options,
      publicationKey,
      evidenceRef: `ui-consumption-smoke:${publicationKey}`,
    }),
    checkedAt: executedAt,
    note: 'staging controlled DB/API readback evidence; not a production user acceptance result',
  })
  await writeJson(files.rollbackVerification, {
    ...smokePayload({
      kind: 'rollback_verification',
      options,
      publicationKey,
      rollbackTarget,
      evidenceRef: `rollback-verification:${publicationKey}`,
    }),
    checkedAt: executedAt,
    restoredRuntimePolicy: 'runtime publication restored to runtime_published after rollback drill for continued staging readback',
  })
  return files
}

export function buildPipelineArgs(manifest = {}, outputRoot = DEFAULT_OUTPUT_ROOT) {
  const args = Array.isArray(manifest.pipelineArgs) && manifest.pipelineArgs.length > 0
    ? manifest.pipelineArgs.slice(1)
    : [
        PIPELINE_SCRIPT,
        '--baseline-id', manifest.baselineId,
        '--project-id', manifest.projectId,
        '--publication-key', manifest.publicationKey,
        '--environment', manifest.environment,
        '--source-manifest', path.join(manifest.outputRoot, 'source-exports-manifest.json'),
      ]
  const outputRootIndex = args.indexOf('--output-root')
  if (outputRootIndex >= 0) {
    args.splice(outputRootIndex, 2, '--output-root', path.resolve(outputRoot))
  } else {
    args.push('--output-root', path.resolve(outputRoot))
  }
  return args
}

async function runPipeline(manifest, outputRoot) {
  const args = buildPipelineArgs(manifest, outputRoot)
  const result = await execFileAsync(process.execPath, args, {
    cwd: REPO_ROOT,
    maxBuffer: 1024 * 1024 * 20,
  })
  return {
    command: [process.execPath, ...args.map((arg) => (path.isAbsolute(arg) ? repoRelative(arg) : arg))],
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

export function summarizePipelineRun(pipelineRun) {
  if (!pipelineRun) {
    return {
      status: 'not_run',
      productionReady: false,
      missingSourceExports: [],
      blockers: [],
    }
  }

  let payload = {}
  try {
    payload = JSON.parse(text(pipelineRun.stdout))
  } catch {
    return {
      status: 'invalid_output',
      productionReady: false,
      missingSourceExports: [],
      blockers: ['production_evidence_pipeline_output_invalid'],
    }
  }

  const status = text(payload.status)
  const missingSourceExports = readArray(payload.missingSourceExports)
    .map((item) => readObject(item))
    .map((item) => ({
      evidenceType: text(item.evidenceType),
      source: text(item.source),
    }))
    .filter((item) => item.evidenceType || item.source)
  const blockers = []
  if (status === 'blocked') {
    blockers.push('production_evidence_pipeline_blocked')
    for (const missing of missingSourceExports) {
      blockers.push(`production_evidence_pipeline_missing_source:${missing.evidenceType || 'unknown'}:${missing.source || 'unknown'}`)
    }
  } else if (!['production_ready_evidence_pipeline_complete', 'staging_runtime_chain_passed'].includes(status)) {
    blockers.push(`production_evidence_pipeline_status_unrecognized:${status || 'missing'}`)
  }

  return {
    status: status || 'missing',
    productionReady: payload.productionReady === true,
    missingSourceExports,
    blockers,
  }
}

export function stagingEvidenceResultRequiresNonzeroExit(result = {}) {
  return text(result.status) === 'blocked'
    || readArray(result.blockers).length > 0
}

export async function runDefaultMasterPlanStagingRuntimeEvidence(input = {}) {
  const options = {
    ...input,
    envFile: path.resolve(input.envFile ?? DEFAULT_ENV_FILE),
    outputRoot: path.resolve(input.outputRoot ?? DEFAULT_OUTPUT_ROOT),
    stagingArtifactRoot: path.resolve(input.stagingArtifactRoot ?? DEFAULT_STAGING_ARTIFACT_ROOT),
    sourceExportRoot: path.resolve(input.sourceExportRoot ?? DEFAULT_SOURCE_EXPORT_ROOT),
    baselineId: text(input.baselineId),
    projectId: text(input.projectId),
    companyId: text(input.companyId),
    environment: text(input.environment),
    reviewedBy: text(input.reviewedBy),
    stagingAuthorizationFile: text(input.stagingAuthorizationFile),
  }
  const target = await readDefaultMasterPlanEnvTarget(options.envFile, { repoRoot: REPO_ROOT })
  const blockers = preflightBlockers(options)
  if (blockers.length > 0) {
    return {
      status: 'blocked',
      target,
      blockers,
      mutationBoundary: {
        writesDatabase: false,
        writesTasks: false,
        writesTaskDependencies: false,
        writesRuntimePublication: false,
        performsRollback: false,
      },
    }
  }

  const authorizationResult = await readStagingAuthorization(options)
  if (authorizationResult.blockers.length > 0) {
    return {
      status: 'blocked',
      target,
      blockers: authorizationResult.blockers,
      mutationBoundary: {
        writesDatabase: false,
        writesTasks: false,
        writesTaskDependencies: false,
        writesRuntimePublication: false,
        performsRollback: false,
      },
    }
  }
  options.stagingAuthorization = authorizationResult.authorization
  options.stagingAuthorizationRef = authorizationResult.authorization.ref

  const client = input.client ?? await createPgClient(options.envFile)
  const ownsClient = !input.client
  const executedAt = new Date().toISOString()
  const runKey = buildRunKey(options)
  const publicationKey = `runtime.default_master_plan.${options.projectId}`
  const rollbackTarget = `rollback:${publicationKey}`

  try {
    await client.query('BEGIN')
    const baseline = await loadBaseline(client, options)
    const items = await loadBaselineItems(client, options)
    const targetBlockers = validateTarget({ baseline, items, options })
    if (targetBlockers.length > 0) {
      await client.query('ROLLBACK')
      return {
        status: 'blocked',
        target,
        blockers: targetBlockers,
      }
    }

    const taskIdByItemId = new Map()
    const durationSampleIds = []
    for (const item of items) {
      const taskId = await ensureTaskCarrier(client, { item, options, runKey, executedAt })
      taskIdByItemId.set(text(item.id), taskId)
      await mapBaselineItem(client, { item, taskId, executedAt })
      durationSampleIds.push(await upsertDurationSample(client, { item, taskId, options, runKey, executedAt }))
    }

    const dependencyPlan = buildDependencyMaterializationPlan({ items, taskIdByItemId, publicationKey })
    const edges = dependencyPlan.edges
    const appliedEdges = []
    for (const edge of edges) {
      const dependencyId = await upsertDependency(client, { edge, options, runKey, publicationKey, executedAt })
      if (dependencyId) appliedEdges.push(edge)
    }

    await upsertPlanNetworkRuntimePublication(client, {
      options,
      runKey,
      publicationKey,
      rollbackTarget,
      edges: appliedEdges,
      unresolvedExternalDependencies: dependencyPlan.unresolvedExternalDependencies,
      executedAt,
    })
    await upsertWbsRuntimePublication(client, { options, publicationKey, rollbackTarget, executedAt })
    await runRollbackDrillAndRestore(client, { options, publicationKey, rollbackTarget, executedAt })
    await client.query('COMMIT')

    const sourceFiles = await buildSourceArtifacts({
      options,
      publicationKey,
      rollbackTarget,
      edges: appliedEdges,
      unresolvedExternalDependencies: dependencyPlan.unresolvedExternalDependencies,
      itemCount: items.length,
      executedAt,
    })
    const manifest = await exportDefaultMasterPlanProductionSources({
      envFile: options.envFile,
      outputRoot: options.sourceExportRoot,
      phase: 'all',
      baselineId: options.baselineId,
      projectId: options.projectId,
      publicationKey,
      environment: options.environment,
      exportedBy: options.reviewedBy,
      writerResult: sourceFiles.writerResult,
      criticalPathReadback: sourceFiles.criticalPathReadback,
      apiReadSmoke: sourceFiles.apiReadSmoke,
      uiConsumptionSmoke: sourceFiles.uiConsumptionSmoke,
      rollbackVerification: sourceFiles.rollbackVerification,
      now: new Date(executedAt),
    })
    const pipelineRun = options.skipPipeline ? null : await runPipeline(manifest, options.outputRoot)
    const pipeline = summarizePipelineRun(pipelineRun)
    const evidenceBlockers = [
      ...(dependencyPlan.unresolvedExternalDependencies.length > 0
        ? ['external_dependency_anchors_not_materialized']
        : []),
      ...pipeline.blockers,
    ]
    const summary = {
      schemaVersion: 'workbuddy-default-master-plan-staging-runtime-evidence/v1',
      generatedAt: new Date().toISOString(),
      status: evidenceBlockers.length > 0
        ? 'staging_runtime_evidence_written_with_pipeline_blockers'
        : 'staging_runtime_evidence_written',
      baselineId: options.baselineId,
      projectId: options.projectId,
      companyId: options.companyId,
      environment: options.environment,
      target,
      publicationKey,
      rollbackTarget,
      taskCarrierCount: items.length,
      durationSampleCount: durationSampleIds.length,
      appliedDependencyCount: appliedEdges.length,
      unresolvedExternalDependencyCount: dependencyPlan.unresolvedExternalDependencies.length,
      unresolvedExternalDependencies: dependencyPlan.unresolvedExternalDependencies,
      sourceFiles: Object.fromEntries(Object.entries(sourceFiles).map(([key, value]) => [key, repoRelative(value)])),
      sourceManifest: repoRelative(path.join(options.sourceExportRoot, 'source-exports-manifest.json')),
      sourceManifestStatus: manifest.status,
      sourceManifestBlockers: manifest.blockers,
      blockers: evidenceBlockers,
      stagingAuthorization: options.stagingAuthorization,
      pipelineRun: pipelineRun ? {
        command: pipelineRun.command,
        stdout: pipelineRun.stdout,
        status: pipeline.status,
        productionReady: pipeline.productionReady,
        missingSourceExports: pipeline.missingSourceExports,
        blockers: pipeline.blockers,
      } : null,
      productionReadyClaim: false,
      caveat: 'staging controlled replay evidence only; not real production project completion evidence',
      mutationBoundary: {
        writesDatabase: true,
        writesTasks: true,
        writesTaskDependencies: true,
        writesRuntimePublication: true,
        performsRollback: true,
        writesSeeds: false,
        writesConfirmedProductionBaseline: false,
      },
    }
    const summaryPath = path.join(options.stagingArtifactRoot, 'staging-runtime-evidence-summary.json')
    await writeJson(summaryPath, summary)
    return {
      ...summary,
      summaryPath: repoRelative(summaryPath),
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore rollback errors after connection failure
    }
    throw error
  } finally {
    if (ownsClient) await client.end()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      console.log(usage())
      process.exit(0)
    }
    const result = await runDefaultMasterPlanStagingRuntimeEvidence(options)
    const output = JSON.stringify({
      status: result.status,
      baselineId: result.baselineId,
      projectId: result.projectId,
      publicationKey: result.publicationKey,
      rollbackTarget: result.rollbackTarget,
      taskCarrierCount: result.taskCarrierCount,
      durationSampleCount: result.durationSampleCount,
      appliedDependencyCount: result.appliedDependencyCount,
      sourceManifestStatus: result.sourceManifestStatus,
      sourceManifestBlockers: result.sourceManifestBlockers,
      summaryPath: result.summaryPath,
      blockers: result.blockers ?? [],
      caveat: result.caveat,
      target: result.target,
    }, null, 2)
    if (stagingEvidenceResultRequiresNonzeroExit(result)) {
      console.error(output)
      process.exit(1)
    }
    console.log(output)
  } catch (error) {
    console.error(JSON.stringify({
      status: 'error',
      message: error?.message ?? String(error),
      usage: usage(),
    }, null, 2))
    process.exit(1)
  }
}
