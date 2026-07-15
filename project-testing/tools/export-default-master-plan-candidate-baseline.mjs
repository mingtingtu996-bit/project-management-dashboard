#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'
import { defaultMasterPlanCandidateQualityBlockers } from './default-master-plan-source-guard.mjs'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'server', '.env')
const MANAGED_FRONTIER_SOURCE_LABEL = 'managed_frontier_default_master_plan'
const ALLOWED_PROFILE_LINEAGE_SOURCE_LABELS = new Set([
  'business_type_base_master_plan_profile_v1',
  'business_type_master_plan_profile_v1',
])

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    source: 'api',
    baseUrl: process.env.WORKBUDDY_API_BASE_URL || 'http://127.0.0.1:3001',
    baselineId: '',
    projectId: '',
    envFile: DEFAULT_ENV_FILE,
    companyId: process.env.TEST_COMPANY_ID || '',
    outputRoot: DEFAULT_OUTPUT_ROOT,
    label: 'items',
    exportedBy: '',
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

    if (arg === '--source') {
      options.source = text(nextValue()) || options.source
      if (!['api', 'db'].includes(options.source)) throw new Error('--source must be api or db')
    } else if (arg === '--env-file') {
      options.envFile = path.resolve(nextValue())
    } else if (arg === '--base-url') {
      options.baseUrl = nextValue()
    } else if (arg === '--baseline-id') {
      options.baselineId = nextValue()
    } else if (arg === '--project-id') {
      options.projectId = nextValue()
    } else if (arg === '--company-id') {
      options.companyId = nextValue()
    } else if (arg === '--output-root') {
      options.outputRoot = path.resolve(nextValue())
    } else if (arg === '--label') {
      options.label = nextValue()
    } else if (arg === '--exported-by') {
      options.exportedBy = nextValue()
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

export async function exportDefaultMasterPlanCandidateBaseline({
  baseUrl = 'http://127.0.0.1:3001',
  baselineId,
  projectId,
  companyId = '',
  outputRoot = DEFAULT_OUTPUT_ROOT,
  label = 'items',
  exportedBy = '',
  fetchFn = globalThis.fetch,
  now = new Date(),
} = {}) {
  const normalized = {
    baseUrl: trimTrailingSlash(text(baseUrl)),
    baselineId: text(baselineId),
    projectId: text(projectId),
    companyId: text(companyId),
    outputRoot: path.resolve(outputRoot),
    label: slug(text(label) || 'items'),
    exportedBy: text(exportedBy),
  }

  if (!normalized.baselineId) throw new Error('baselineId is required')
  if (!normalized.projectId) throw new Error('projectId is required')
  if (typeof fetchFn !== 'function') throw new Error('fetch is not available')

  const url = `${normalized.baseUrl}/api/task-baselines/${encodeURIComponent(normalized.baselineId)}?project_id=${encodeURIComponent(normalized.projectId)}`
  const headers = { accept: 'application/json' }
  if (normalized.companyId) headers['x-company-id'] = normalized.companyId

  const response = await fetchFn(url, { method: 'GET', headers })
  if (!response?.ok) {
    const body = typeof response?.text === 'function' ? await response.text().catch(() => '') : ''
    throw new Error(`failed to read baseline ${normalized.baselineId}: HTTP ${response?.status ?? 'unknown'} ${body}`.trim())
  }
  const payload = await response.json()
  if (!payload?.success || !payload?.data) {
    throw new Error(`baseline ${normalized.baselineId} response is not a successful API payload`)
  }

  const baseline = payload.data
  const items = Array.isArray(baseline.items) ? baseline.items : []
  const rows = items
    .slice()
    .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
    .map((item, index) => summarizeItem(item, index + 1))

  const report = buildCandidateBaselineReport({
    baseline,
    rows,
    baselineId: normalized.baselineId,
    projectId: normalized.projectId,
    exportedBy: normalized.exportedBy,
    source: 'export-default-master-plan-candidate-baseline',
    now,
    mutationBoundary: {
      readsApi: true,
      readsExistingCandidateBaselineExport: false,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      invokesRuntimeWriters: false,
      writesRuntimePublication: false,
    },
  })

  await writeCandidateBaselineReport(report, normalized.outputRoot, normalized.label)
  return report
}

export async function exportDefaultMasterPlanCandidateBaselineFromDb({
  baselineId,
  projectId,
  envFile = DEFAULT_ENV_FILE,
  outputRoot = DEFAULT_OUTPUT_ROOT,
  label = 'items',
  exportedBy = '',
  dbClientFactory = null,
  now = new Date(),
} = {}) {
  const normalized = {
    baselineId: text(baselineId),
    projectId: text(projectId),
    envFile: path.resolve(envFile),
    outputRoot: path.resolve(outputRoot),
    label: slug(text(label) || 'items'),
    exportedBy: text(exportedBy),
  }

  if (!normalized.baselineId) throw new Error('baselineId is required')
  if (!normalized.projectId) throw new Error('projectId is required')

  const client = await (typeof dbClientFactory === 'function'
    ? dbClientFactory()
    : createPgClient(normalized.envFile))
  try {
    const baselineResult = await client.query(
      'SELECT id, project_id, source_version_label, status, title, description, created_at, updated_at FROM public.task_baselines WHERE id = $1::uuid AND project_id = $2::uuid LIMIT 1',
      [normalized.baselineId, normalized.projectId],
    )
    const baseline = readObject(baselineResult?.rows?.[0])
    if (!baseline.id) {
      throw new Error(`candidate baseline ${normalized.baselineId} was not found for project ${normalized.projectId}`)
    }

    const itemsResult = await client.query(
      'SELECT * FROM public.task_baseline_items WHERE baseline_version_id = $1::uuid AND project_id = $2::uuid ORDER BY sort_order ASC, created_at ASC, id ASC',
      [normalized.baselineId, normalized.projectId],
    )
    const rows = Array.isArray(itemsResult?.rows)
      ? itemsResult.rows
        .slice()
        .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
        .map((item, index) => summarizeItem(item, index + 1))
      : []

    const report = buildCandidateBaselineReport({
      baseline,
      rows,
      baselineId: normalized.baselineId,
      projectId: normalized.projectId,
      exportedBy: normalized.exportedBy,
      source: 'export-default-master-plan-candidate-baseline-db',
      now,
      mutationBoundary: {
        readsApi: false,
        readsDatabase: true,
        readsExistingCandidateBaselineExport: false,
        databaseTargetRef: `env://${repoRelative(normalized.envFile)}#SUPABASE_MIGRATION_URL_OR_DB_CONNECTION_STRING`,
        writesProductionTables: false,
        writesTaskBaselineItems: false,
        writesTasks: false,
        writesTaskDependencies: false,
        invokesRuntimeWriters: false,
        writesRuntimePublication: false,
      },
    })

    await writeCandidateBaselineReport(report, normalized.outputRoot, normalized.label)
    return report
  } finally {
    if (client && typeof client.end === 'function') {
      await client.end().catch(() => undefined)
    }
  }
}

export async function normalizeExistingCandidateBaselineExport({
  input,
  outputRoot = DEFAULT_OUTPUT_ROOT,
  label = 'items',
  exportedBy = '',
  now = new Date(),
} = {}) {
  const inputPath = path.resolve(input)
  const normalized = {
    outputRoot: path.resolve(outputRoot),
    label: slug(text(label) || 'items'),
    exportedBy: text(exportedBy),
  }
  const candidate = JSON.parse(await readFile(inputPath, 'utf8'))
  const rows = Array.isArray(candidate.rows)
    ? candidate.rows.map((row, index) => normalizeExistingCandidateRow(row, index + 1))
    : []
  const report = buildCandidateBaselineReport({
    baseline: {
      source_version_label: text(candidate.sourceVersionLabel ?? candidate.source_version_label),
      status: text(candidate.status),
      title: text(candidate.title ?? candidate.name),
      summary: candidate.summary ?? null,
    },
    rows,
    baselineId: text(candidate.baselineId ?? candidate.baseline_id),
    projectId: text(candidate.projectId ?? candidate.project_id),
    exportedBy: normalized.exportedBy || text(candidate.exportedBy ?? candidate.exported_by),
    source: 'normalize-existing-default-master-plan-candidate-baseline-export',
    now,
    mutationBoundary: {
      readsApi: false,
      readsExistingCandidateBaselineExport: true,
      sourceCandidateBaselineRef: `candidate_baseline_export:${repoRelative(inputPath)}`,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      invokesRuntimeWriters: false,
      writesRuntimePublication: false,
    },
  })

  await writeCandidateBaselineReport(report, normalized.outputRoot, normalized.label)
  return report
}

function buildCandidateBaselineReport({
  baseline,
  rows,
  baselineId,
  projectId,
  exportedBy,
  source,
  now,
  mutationBoundary,
}) {
  const sourceLabels = unique(rows.map((row) => row.source).filter(Boolean)).sort()
  const profileSourceLabels = unique(rows.map((row) => row.profileSourceType).filter(Boolean)).sort()
  const quality = {
    rowsMissingReferenceDuration: rows.filter((row) => !(Number(row.smartReferenceDays) > 0)).length,
    rowsNotCandidateOnly: rows.filter((row) => row.candidateOnly !== true).length,
    rowsWritingTasks: rows.filter((row) => row.writesTasks === true).length,
    rowsWritingTaskDependencies: rows.filter((row) => row.writesTaskDependencies === true).length,
    sourceLabels,
    profileSourceLabels,
  }
  const productionQuality = defaultMasterPlanCandidateQualityBlockers({
    rows,
    sourceVersionLabel: text(baseline.source_version_label),
    status: '',
  })
  quality.retiredOrLowInformationSourceRowCount = productionQuality.retiredOrLowInformationSourceRowCount
  quality.blockedSourceLabels = productionQuality.sourceGuard.retiredOrLowInformationLabels
  quality.unsupportedSourceVersionLabels = productionQuality.sourceGuard.unsupportedDefaultPlanLabels
  const blockers = [
    ...productionQuality.blockers.map((blocker) => {
      if (blocker === 'retired_or_low_information_default_master_plan_source') {
        return 'candidate_baseline_contains_retired_or_low_information_sources'
      }
      if (blocker === 'unsupported_default_master_plan_source_label') {
        return 'candidate_baseline_source_version_label_unsupported'
      }
      return blocker
    }),
  ]

  const report = {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    generatedAt: now.toISOString(),
    source,
    exportedBy: text(exportedBy) || null,
    baselineId,
    projectId,
    sourceVersionLabel: text(baseline.source_version_label),
    status: blockers.length > 0 ? 'blocked' : text(baseline.status),
    productionCandidateEligible: blockers.length === 0,
    title: text(baseline.title ?? baseline.name),
    rowCount: rows.length,
    summary: baseline.summary ?? null,
    quality,
    blockers,
    rows,
    mutationBoundary,
  }

  return report
}

async function writeCandidateBaselineReport(report, outputRoot, label) {
  await mkdir(outputRoot, { recursive: true })
  const baseName = `candidate-baseline-${slug(report.baselineId)}-${slug(label) || 'items'}`
  const jsonPath = path.join(outputRoot, `${baseName}.json`)
  const markdownPath = path.join(outputRoot, `${baseName}.md`)
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPath, renderMarkdown(report), 'utf8')
  report.output = {
    jsonPath: path.relative(REPO_ROOT, jsonPath).replaceAll('\\', '/'),
    markdownPath: path.relative(REPO_ROOT, markdownPath).replaceAll('\\', '/'),
  }
}

function summarizeItem(item, index) {
  const metadata = item?.generation_metadata && typeof item.generation_metadata === 'object'
    ? item.generation_metadata
    : {}
  const predecessorDependencies = normalizePredecessorDependencies(
    metadata.predecessorDependencies ?? metadata.predecessor_dependencies,
  )
  const durationSuggestion = metadata.durationSuggestion && typeof metadata.durationSuggestion === 'object'
    ? metadata.durationSuggestion
    : {}
  const mutationBoundary = metadata.mutationBoundary && typeof metadata.mutationBoundary === 'object'
    ? metadata.mutationBoundary
    : {}
  const smartReferenceDays = firstPositiveNumber([
    item.smart_reference_days,
    item.smartReferenceDays,
    durationSuggestion.planReferenceDays,
    durationSuggestion.contextualReferenceDays,
    durationSuggestion.independentReferenceDurationDays,
    metadata.planReferenceDays,
  ])
  const rawSource = text(metadata.source)
  const rawProfileSourceType = text(readObject(metadata.businessTypeMasterPlan).profileSourceType ?? metadata.profileSourceType ?? metadata.profile_source_type)
  const profileSourceType = rawProfileSourceType || (ALLOWED_PROFILE_LINEAGE_SOURCE_LABELS.has(rawSource) ? rawSource : '')
  const source = ALLOWED_PROFILE_LINEAGE_SOURCE_LABELS.has(rawSource)
    ? MANAGED_FRONTIER_SOURCE_LABEL
    : rawSource

  return {
    index,
    id: text(item.id),
    title: text(item.title),
    plannedStart: dateOnly(item.planned_start_date),
    plannedEnd: dateOnly(item.planned_end_date),
    sortOrder: Number(item.sort_order ?? index - 1),
    standardWorkCode: text(item.standard_work_code ?? metadata.standardWorkCode ?? metadata.stableCode),
    source,
    originalSource: rawSource && rawSource !== source ? rawSource : '',
    profileSourceType,
    fallbackApplied: normalizeFallbackApplied(metadata.fallbackApplied ?? metadata.fallback_applied),
    controlledDegradation: normalizeControlledDegradation(metadata.controlledDegradation ?? metadata.controlled_degradation),
    handoffGenerationMode: text(metadata.handoffGenerationMode ?? metadata.handoff_generation_mode),
    scenarioType: text(metadata.scenarioType ?? metadata.scenario_type),
    comparisonScenario: text(metadata.comparisonScenario ?? metadata.comparison_scenario),
    executionLane: text(metadata.executionLane),
    executionPhase: text(metadata.executionPhase),
    scheduleParticipation: text(metadata.scheduleParticipation ?? metadata.schedule_participation),
    clientRowId: text(metadata.clientRowId ?? metadata.client_row_id),
    predecessorDependencies,
    smartReferenceDays,
    durationOutputCode: text(durationSuggestion.durationOutputCode),
    durationEvidence: text(durationSuggestion.durationEvidenceSource ?? durationSuggestion.planDurationTruthSource ?? durationSuggestion.durationCalibrationSource),
    candidateOnly: metadata.candidateOnly === true,
    writesTasks: metadata.writesTasks === true,
    writesTaskDependencies: metadata.writesTaskDependencies === true,
    writesProductionDependencies: mutationBoundary.writesProductionDependencies === true,
    writesCriticalPathFacts: mutationBoundary.writesCriticalPathFacts === true,
    predecessorCount: predecessorDependencies.length,
  }
}

function normalizeExistingCandidateRow(row, index) {
  const rawSource = text(row.source)
  const rawProfileSourceType = text(row.profileSourceType ?? row.profile_source_type)
  const profileSourceType = rawProfileSourceType || (ALLOWED_PROFILE_LINEAGE_SOURCE_LABELS.has(rawSource) ? rawSource : '')
  const source = ALLOWED_PROFILE_LINEAGE_SOURCE_LABELS.has(rawSource)
    ? MANAGED_FRONTIER_SOURCE_LABEL
    : rawSource

  return {
    index: Number(row.index ?? index),
    id: text(row.id),
    title: text(row.title),
    plannedStart: text(row.plannedStart ?? row.planned_start),
    plannedEnd: text(row.plannedEnd ?? row.planned_end),
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? index - 1),
    standardWorkCode: text(row.standardWorkCode ?? row.standard_work_code),
    source,
    originalSource: text(row.originalSource ?? row.original_source) || (rawSource && rawSource !== source ? rawSource : ''),
    profileSourceType,
    fallbackApplied: normalizeFallbackApplied(row.fallbackApplied ?? row.fallback_applied),
    controlledDegradation: normalizeControlledDegradation(row.controlledDegradation ?? row.controlled_degradation),
    handoffGenerationMode: text(row.handoffGenerationMode ?? row.handoff_generation_mode),
    scenarioType: text(row.scenarioType ?? row.scenario_type),
    comparisonScenario: text(row.comparisonScenario ?? row.comparison_scenario),
    executionLane: text(row.executionLane ?? row.execution_lane),
    executionPhase: text(row.executionPhase ?? row.execution_phase),
    scheduleParticipation: text(row.scheduleParticipation ?? row.schedule_participation),
    clientRowId: text(row.clientRowId ?? row.client_row_id),
    predecessorDependencies: normalizePredecessorDependencies(
      row.predecessorDependencies ?? row.predecessor_dependencies,
    ),
    smartReferenceDays: firstPositiveNumber([
      row.smartReferenceDays,
      row.smart_reference_days,
      row.referenceDays,
      row.reference_days,
    ]),
    durationOutputCode: text(row.durationOutputCode ?? row.duration_output_code),
    durationEvidence: text(row.durationEvidence ?? row.duration_evidence),
    candidateOnly: row.candidateOnly === true,
    writesTasks: row.writesTasks === true,
    writesTaskDependencies: row.writesTaskDependencies === true,
    writesProductionDependencies: row.writesProductionDependencies === true,
    writesCriticalPathFacts: row.writesCriticalPathFacts === true,
    predecessorCount: Number(row.predecessorCount ?? row.predecessor_count ?? 0),
  }
}

function normalizePredecessorDependencies(value) {
  return (Array.isArray(value) ? value : [])
    .map((dependency) => readObject(dependency))
    .map((dependency) => ({
      clientRowId: text(
        dependency.clientRowId
          ?? dependency.client_row_id
          ?? dependency.predecessorClientRowId
          ?? dependency.predecessor_client_row_id,
      ),
      dependencyType: text(dependency.dependencyType ?? dependency.dependency_type ?? 'FS').toUpperCase() || 'FS',
      lagDays: Number.isFinite(Number(dependency.lagDays ?? dependency.lag_days))
        ? Number(dependency.lagDays ?? dependency.lag_days)
        : 0,
      intentCode: text(dependency.intentCode ?? dependency.intent_code ?? dependency.intent),
    }))
    .filter((dependency) => dependency.clientRowId)
}

function renderMarkdown(report) {
  const lines = [
    `# Candidate Baseline ${report.baselineId} Items`,
    '',
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- sourceVersionLabel: ${report.sourceVersionLabel}`,
    `- status: ${report.status}`,
    `- rowCount: ${report.rowCount}`,
    `- rowsMissingReferenceDuration: ${report.quality.rowsMissingReferenceDuration}`,
    `- rowsNotCandidateOnly: ${report.quality.rowsNotCandidateOnly}`,
    `- rowsWritingTasks: ${report.quality.rowsWritingTasks}`,
    `- rowsWritingTaskDependencies: ${report.quality.rowsWritingTaskDependencies}`,
    `- mutationBoundary: ${formatMutationBoundary(report.mutationBoundary)}`,
    '',
    '| # | title | start | end | code | source | profileSourceType | smartReferenceDays | durationOutput | evidence | candidate | deps |',
    '|---:|---|---|---|---|---|---|---:|---|---|---|---:|',
  ]
  for (const row of report.rows) {
    lines.push([
      row.index,
      escapeTable(row.title),
      row.plannedStart,
      row.plannedEnd,
      escapeTable(row.standardWorkCode),
      escapeTable(row.source),
      escapeTable(row.profileSourceType),
      row.smartReferenceDays ?? '',
      escapeTable(row.durationOutputCode),
      escapeTable(row.durationEvidence),
      row.candidateOnly ? 'yes' : 'no',
      row.predecessorCount,
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
  }
  return `${lines.join('\n')}\n`
}

function firstPositiveNumber(values) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number) && number > 0) return number
  }
  return null
}

function unique(values) {
  return [...new Set(values)]
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function formatMutationBoundary(boundary) {
  return Object.entries(readObject(boundary))
    .filter(([, value]) => typeof value === 'boolean')
    .map(([key, value]) => `${key}=${value}`)
    .join(', ')
}

async function createPgClient(envFile) {
  const parsed = dotenv.parse(await readFile(envFile, 'utf8'))
  const connectionString = text(parsed.SUPABASE_MIGRATION_URL) || text(parsed.DB_CONNECTION_STRING) || text(parsed.DATABASE_URL)
  if (!connectionString) throw new Error('SUPABASE_MIGRATION_URL, DB_CONNECTION_STRING, or DATABASE_URL is required')
  const client = new pg.Client(buildCandidateBaselineExportPgClientConfig(connectionString, parsed))
  await client.connect()
  return client
}

export function buildCandidateBaselineExportPgClientConfig(connectionString, env = {}) {
  return {
    connectionString: stripSslModeFromConnectionString(connectionString),
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

function normalizeFallbackApplied(value) {
  if (value === true) return true
  const label = text(value)
  if (!label || label.toLowerCase() === 'false') return ''
  if (label.toLowerCase() === 'true') return true
  return label
}

function normalizeControlledDegradation(value) {
  if (value === true) return true
  const label = text(value)
  if (!label || label.toLowerCase() === 'false') return ''
  if (label.toLowerCase() === 'true') return true
  return label
}

function dateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatLocalDate(value)
  const raw = text(value)
  if (!raw) return ''
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : raw
}

function formatLocalDate(value) {
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${value.getFullYear()}-${month}-${day}`
}

function slug(value) {
  return text(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
}

function trimTrailingSlash(value) {
  return text(value).replace(/\/+$/, '')
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function escapeTable(value) {
  return text(value).replaceAll('|', '\\|')
}

function text(value) {
  return String(value ?? '').trim()
}

function printHelp() {
  console.log(`Usage: node project-testing/tools/export-default-master-plan-candidate-baseline.mjs --baseline-id <id> --project-id <id> [--source api|db] [--base-url http://127.0.0.1:3001] [--env-file server/.env] [--company-id <id>] [--label school-items] [--exported-by codex]`)
}

export function isCliEntry(moduleUrl = import.meta.url, argvPath = process.argv[1]) {
  if (!argvPath) return false
  return path.resolve(fileURLToPath(moduleUrl)) === path.resolve(argvPath)
}

if (isCliEntry()) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = options.source === 'db'
      ? await exportDefaultMasterPlanCandidateBaselineFromDb(options)
      : await exportDefaultMasterPlanCandidateBaseline(options)
    console.log(JSON.stringify({
      baselineId: report.baselineId,
      rowCount: report.rowCount,
      rowsMissingReferenceDuration: report.quality.rowsMissingReferenceDuration,
      output: report.output,
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
