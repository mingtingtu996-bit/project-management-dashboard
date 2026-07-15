#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'
import {
  defaultMasterPlanRowSourceSignals,
  defaultMasterPlanSourceBlockers,
  defaultMasterPlanStructuredSourceSignals,
} from './default-master-plan-source-guard.mjs'
import { buildPgClientConfig } from './run-default-master-plan-candidate-refresh-execution.mjs'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'server/.env')
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'project-testing/reports/default-master-plan-production-readiness/source-exports/candidate-default-master-plan-review-export.json')
const REAL_ENVIRONMENTS = new Set(['staging', 'production', 'live'])
const REVIEW_BLOCKERS = [
  'PROJECT_MANAGER_REVIEW_REQUIRED',
  'DURATION_EVIDENCE_NOT_RUNTIME_CALIBRATED',
  'PRODUCTION_DEPENDENCY_WRITER_NOT_APPLIED',
  'RUNTIME_PUBLICATION_EVIDENCE_MISSING',
  'POST_PUBLISH_SMOKE_ROLLBACK_EVIDENCE_MISSING',
]
const AUTOMATION_REVIEWER_PATTERNS = [
  /^codex\b/i,
  /^automation\b/i,
  /^bot\b/i,
  /^system\b/i,
  /after-/i,
]

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: DEFAULT_ENV_FILE,
    output: DEFAULT_OUTPUT,
    baselineId: '',
    projectId: '',
    reviewedBy: '',
    reviewNotes: '',
    reviewPackage: '',
    environment: '',
    exportedBy: '',
    mode: 'dry_run',
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

    if (arg === '--env-file') {
      options.envFile = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--baseline-id') {
      options.baselineId = nextValue()
    } else if (arg === '--project-id') {
      options.projectId = nextValue()
    } else if (arg === '--reviewed-by') {
      options.reviewedBy = nextValue()
    } else if (arg === '--review-notes') {
      options.reviewNotes = nextValue()
    } else if (arg === '--review-package') {
      options.reviewPackage = path.resolve(nextValue())
    } else if (arg === '--environment') {
      options.environment = nextValue()
    } else if (arg === '--exported-by') {
      options.exportedBy = nextValue()
    } else if (arg === '--mode') {
      options.mode = nextValue()
    } else if (arg === '--execute') {
      options.mode = 'execute'
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

export async function recordDefaultMasterPlanReviewExport({
  envFile = DEFAULT_ENV_FILE,
  output = DEFAULT_OUTPUT,
  baselineId = '',
  projectId = '',
  reviewedBy = '',
  reviewNotes = '',
  reviewPackage = '',
  environment = '',
  exportedBy = '',
  mode = 'dry_run',
  queryExec = null,
  now = new Date(),
} = {}) {
  const normalized = {
    envFile: path.resolve(envFile),
    output: path.resolve(output),
    baselineId: text(baselineId),
    projectId: text(projectId),
    reviewedBy: text(reviewedBy),
    reviewNotes: text(reviewNotes),
    reviewPackage: text(reviewPackage) ? path.resolve(reviewPackage) : '',
    environment: text(environment),
    exportedBy: text(exportedBy),
    mode: text(mode) === 'execute' ? 'execute' : 'dry_run',
  }

  const reviewPackageResult = normalized.mode === 'execute'
    ? await readReviewPackage(normalized.reviewPackage, normalized)
    : { reviewedItemIds: [], blockers: [] }
  const preflightBlockers = [
    ...validateInputs(normalized),
    ...reviewPackageResult.blockers,
  ]
  let rows = []
  let changeLogId = ''
  let changedAt = now.toISOString()
  const exec = queryExec ?? (preflightBlockers.length === 0 ? await createPgQueryExec(normalized.envFile) : null)
  try {
    const schema = exec ? await readRelevantSchema(exec) : emptySchema()
    const schemaBlockers = schema.change_logs.exists ? [] : ['change_logs_table_missing']
    const baselineItems = preflightBlockers.length === 0 && schemaBlockers.length === 0
      ? await readCandidateBaselineItems(exec, schema, normalized.baselineId)
      : []
    const reviewedItemIds = baselineItems.map((row) => text(row.id)).filter(Boolean)
    const itemBlockers = preflightBlockers.length === 0 && schemaBlockers.length === 0 && reviewedItemIds.length === 0
      ? ['candidate_baseline_items_required']
      : []
    const reviewPackageItemBlockers = normalized.mode === 'execute'
      && reviewPackageResult.reviewedItemIds.length > 0
      && reviewedItemIds.length > 0
      ? compareReviewedItemIds(reviewPackageResult.reviewedItemIds, reviewedItemIds)
      : []
    const blockers = [...preflightBlockers, ...schemaBlockers, ...itemBlockers, ...reviewPackageItemBlockers]
    const review = buildReview({
      reviewedBy: normalized.reviewedBy,
      reviewedAt: now.toISOString(),
      reviewedItemIds,
      reviewNotes: normalized.reviewNotes,
    })
    const baseRow = buildChangeLogRow({
      baselineId: normalized.baselineId,
      projectId: normalized.projectId,
      review,
      changedAt,
    })

    if (blockers.length === 0 && normalized.mode === 'execute') {
      const inserted = await insertReviewChangeLog(exec, schema, baseRow)
      changeLogId = text(inserted.id)
      changedAt = text(inserted.changed_at) || changedAt
    }

    rows = [{
      ...baseRow,
      ...(changeLogId ? { id: changeLogId } : {}),
      changed_at: changedAt,
    }]
    const payload = {
      schemaVersion: 'workbuddy-default-master-plan-source-export/v1',
      export_metadata: buildExportMetadata({
        options: normalized,
        now,
        sourceKind: normalized.mode === 'execute' ? 'database_table' : 'dry_run_candidate_review',
      }),
      rows,
      change_logs: rows,
    }
    await writeJson(normalized.output, payload)

    return {
      schemaVersion: 'workbuddy-default-master-plan-review-export-record/v1',
      status: blockers.length > 0
        ? 'blocked'
        : normalized.mode === 'execute'
          ? 'review_recorded'
          : 'dry_run_ready',
      baselineId: normalized.baselineId,
      projectId: normalized.projectId,
      reviewedItemCount: reviewedItemIds.length,
      output: repoRelative(normalized.output),
      changeLogId,
      blockers,
      writesChangeLogs: blockers.length === 0 && normalized.mode === 'execute',
      mutationBoundary: {
        readsDatabase: Boolean(exec),
        writesChangeLogs: blockers.length === 0 && normalized.mode === 'execute',
        writesTasks: false,
        writesTaskDependencies: false,
        writesRuntimePublication: false,
        invokesRuntimeWriters: false,
      },
    }
  } finally {
    if (!queryExec && exec) await closeQueryExec(exec)
  }
}

function validateInputs(options) {
  return [
    options.baselineId ? null : 'baseline_id_required',
    options.projectId ? null : 'project_id_required',
    options.reviewedBy ? null : 'reviewed_by_required',
    isHumanReviewer(options.reviewedBy) ? null : 'human_project_manager_reviewer_required',
    options.reviewNotes ? null : 'review_notes_required',
    REAL_ENVIRONMENTS.has(options.environment) ? null : 'real_environment_required',
    options.exportedBy ? null : 'exported_by_required',
  ].filter(Boolean)
}

async function readReviewPackage(reviewPackagePath, options) {
  if (!reviewPackagePath) {
    return {
      reviewedItemIds: [],
      blockers: ['pm_review_package_required'],
    }
  }

  let payload = {}
  try {
    payload = JSON.parse(await readFile(reviewPackagePath, 'utf8'))
  } catch (error) {
    return {
      reviewedItemIds: [],
      blockers: [error?.code === 'ENOENT' ? 'pm_review_package_missing' : 'pm_review_package_invalid_json'],
    }
  }

  const reviewedItemIds = Array.isArray(payload.reviewedItemIds)
    ? payload.reviewedItemIds.map(text).filter(Boolean)
    : []
  const reviewedItemCount = Number(payload.reviewedItemCount ?? reviewedItemIds.length)
  const rows = Array.isArray(payload.rows) ? payload.rows : []
  const reviewPackageSourceGuard = defaultMasterPlanSourceBlockers([
    ...defaultMasterPlanStructuredSourceSignals(payload),
    ...rows.flatMap(defaultMasterPlanRowSourceSignals),
  ])
  const blockers = [
    text(payload.status) === 'ready_for_human_pm_review' ? null : 'pm_review_package_not_ready',
    payload.productionReady === false ? null : 'pm_review_package_must_not_mark_production_ready',
    text(payload.baselineId ?? payload.baseline_id) === options.baselineId ? null : 'pm_review_package_baseline_id_mismatch',
    text(payload.projectId ?? payload.project_id) === options.projectId ? null : 'pm_review_package_project_id_mismatch',
    reviewedItemIds.length > 0 ? null : 'pm_review_package_reviewed_item_ids_required',
    Number.isFinite(reviewedItemCount) && reviewedItemCount === reviewedItemIds.length
      ? null
      : 'pm_review_package_reviewed_item_count_mismatch',
    ...reviewPackageSourceGuard.blockers.map((blocker) => `pm_review_package_${blocker}`),
    ...(Array.isArray(payload.blockers) ? payload.blockers.map(text).filter(Boolean) : []),
  ].filter(Boolean)

  return {
    reviewedItemIds,
    blockers,
  }
}

function compareReviewedItemIds(packageReviewedItemIds, databaseReviewedItemIds) {
  const databaseIds = new Set(databaseReviewedItemIds)
  const packageIds = new Set(packageReviewedItemIds)
  const missingFromDatabase = packageReviewedItemIds.filter((id) => !databaseIds.has(id))
  const missingFromPackage = databaseReviewedItemIds.filter((id) => !packageIds.has(id))
  return [
    missingFromDatabase.length > 0 ? 'pm_review_package_item_ids_not_in_database' : null,
    missingFromPackage.length > 0 ? 'pm_review_package_missing_database_item_ids' : null,
  ].filter(Boolean)
}

function isHumanReviewer(value) {
  const reviewer = text(value)
  if (!reviewer) return false
  return !AUTOMATION_REVIEWER_PATTERNS.some((pattern) => pattern.test(reviewer))
}

function buildReview({ reviewedBy, reviewedAt, reviewedItemIds, reviewNotes }) {
  const remainingProductionReadinessBlockers = REVIEW_BLOCKERS.filter((code) => code !== 'PROJECT_MANAGER_REVIEW_REQUIRED')
  return {
    decision: 'accepted_for_baseline',
    reviewed_by: reviewedBy,
    reviewed_at: reviewedAt,
    reviewed_item_ids: reviewedItemIds,
    reviewed_item_count: reviewedItemIds.length,
    acknowledged_blockers: [...REVIEW_BLOCKERS],
    review_notes: reviewNotes,
    change_summary: reviewNotes,
    evidence_level: 'project_manager_reviewed_candidate',
    production_ready: false,
    remaining_production_readiness_blockers: remainingProductionReadinessBlockers,
    mutation_boundary: {
      writesTasks: false,
      writesProductionDependencies: false,
      writesCriticalPathFacts: false,
      writesRuntimePublication: false,
    },
  }
}

function buildChangeLogRow({ baselineId, projectId, review, changedAt }) {
  return {
    project_id: projectId,
    entity_type: 'baseline',
    entity_id: baselineId,
    field_name: 'candidate_default_master_plan_review',
    old_value: null,
    new_value: review.decision,
    changed_by: review.reviewed_by,
    changed_at: changedAt,
    change_source: 'manual_adjusted',
    action_type: 'candidate_default_master_plan_review',
    action_group: 'governance_review',
    after_snapshot: {
      candidate_governance_review: review,
    },
    metadata: {
      candidateItemCount: review.reviewed_item_count,
      reviewedItemIds: review.reviewed_item_ids,
      acknowledgedBlockers: review.acknowledged_blockers,
      remainingProductionReadinessBlockers: review.remaining_production_readiness_blockers,
      productionReady: false,
      mutationBoundary: review.mutation_boundary,
    },
    visibility: 'governance',
    retention_policy: 'project_lifecycle',
  }
}

async function readRelevantSchema(queryExec) {
  const entries = []
  for (const table of ['task_baseline_items', 'change_logs']) {
    entries.push([table, await readTableColumns(queryExec, 'public', table)])
  }
  return Object.fromEntries(entries)
}

function emptySchema() {
  return {
    task_baseline_items: { exists: false, columns: new Set() },
    change_logs: { exists: false, columns: new Set() },
  }
}

async function readCandidateBaselineItems(queryExec, schema, baselineId) {
  const table = schema.task_baseline_items
  if (!table.exists) return []
  const baselineReferenceColumn = firstExistingColumn(table.columns, ['baseline_version_id', 'baseline_id'])
  if (!baselineReferenceColumn || !table.columns.has('id')) return []
  const rows = await queryExec(
    `SELECT id FROM public.task_baseline_items WHERE ${quoteIdent(baselineReferenceColumn)} = $1 ORDER BY ${quoteIdent('id')} ASC LIMIT 1000`,
    [baselineId],
  )
  return rows
}

async function insertReviewChangeLog(queryExec, schema, row) {
  const columns = [
    'project_id',
    'entity_type',
    'entity_id',
    'field_name',
    'old_value',
    'new_value',
    'changed_by',
    'change_source',
    'action_type',
    'action_group',
    'after_snapshot',
    'metadata',
    'visibility',
    'retention_policy',
  ].filter((column) => schema.change_logs.columns.has(column))
  if (schema.change_logs.columns.has('changed_at')) columns.splice(7, 0, 'changed_at')
  const params = columns.map((column) => {
    const value = row[column]
    return typeof value === 'object' && value !== null ? JSON.stringify(value) : value
  })
  const placeholders = columns.map((_, index) => `$${index + 1}`)
  const returning = [
    schema.change_logs.columns.has('id') ? 'id' : null,
    schema.change_logs.columns.has('changed_at') ? 'changed_at' : null,
  ].filter(Boolean)
  const sql = [
    `INSERT INTO public.change_logs (${columns.map(quoteIdent).join(', ')})`,
    `VALUES (${placeholders.join(', ')})`,
    returning.length > 0 ? `RETURNING ${returning.map(quoteIdent).join(', ')}` : '',
  ].filter(Boolean).join(' ')
  const rows = await queryExec(sql, params)
  return rows[0] ?? {}
}

async function readTableColumns(queryExec, schemaName, tableName) {
  const rows = await queryExec(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position`,
    [schemaName, tableName],
  )
  const columns = rows.map((row) => text(row.column_name)).filter(Boolean)
  return {
    exists: columns.length > 0,
    columns: new Set(columns),
  }
}

function buildExportMetadata({ options, now, sourceKind }) {
  return {
    source: 'candidate_default_master_plan_review',
    source_kind: sourceKind,
    table: sourceKind === 'database_table' ? 'public.change_logs' : null,
    exported_at: now.toISOString(),
    exported_by: options.exportedBy,
    environment: options.environment,
    baseline_id: options.baselineId,
    project_id: options.projectId,
    publication_key: null,
    mutation_boundary: {
      readsDatabase: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
  }
}

async function createPgQueryExec(envFile) {
  const env = dotenv.parse(await readFile(envFile, 'utf8'))
  const connectionString = text(env.SUPABASE_MIGRATION_URL) || text(env.DB_CONNECTION_STRING)
  if (!connectionString) {
    throw new Error('SUPABASE_MIGRATION_URL or DB_CONNECTION_STRING is required for default master-plan review export')
  }
  const client = new pg.Client(buildPgClientConfig(connectionString, env))
  await client.connect()
  const exec = async (sql, params = []) => {
    const result = await client.query(sql, params)
    return result.rows
  }
  exec.close = async () => {
    await client.end()
  }
  return exec
}

async function closeQueryExec(queryExec) {
  if (typeof queryExec?.close === 'function') await queryExec.close()
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function firstExistingColumn(columns, candidates) {
  return candidates.find((column) => columns.has(column)) ?? ''
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function text(value) {
  return String(value ?? '').trim()
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const options = parseArgs()
  if (options.help) {
    console.log([
      'Usage: node project-testing/tools/record-default-master-plan-review-export.mjs',
      '  --baseline-id <id> --project-id <id> --reviewed-by <human-user-id>',
      '  --review-notes <text> --review-package <pm-review-package.json>',
      '  --environment <staging|production|live> --exported-by <actor>',
      '  [--mode dry_run|execute] [--env-file <path>] [--output <json>]',
    ].join('\n'))
    process.exit(0)
  }
  const report = await recordDefaultMasterPlanReviewExport(options)
  console.log(JSON.stringify({
    status: report.status,
    baselineId: report.baselineId,
    projectId: report.projectId,
    reviewedItemCount: report.reviewedItemCount,
    output: report.output,
    changeLogId: report.changeLogId || null,
    blockers: report.blockers,
    writesChangeLogs: report.writesChangeLogs,
  }, null, 2))
}
