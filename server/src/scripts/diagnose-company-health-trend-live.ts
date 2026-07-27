import { performance } from 'node:perf_hooks'
import { randomUUID } from 'node:crypto'
import { writeJsonFile } from './jsonEvidenceUtils.js'

import { createClient } from '@supabase/supabase-js'

type DiagnosticStatus = 'pass' | 'fail' | 'blocked'
type SnapshotProbeKind = 'max_rows' | 'snapshot_trend'

export type SnapshotHealthTrendRow = {
  project_id: string | null
  snapshot_date: string | null
  health_score: number | null
}

export type SnapshotPageFetchRequest = {
  probe: SnapshotProbeKind
  from: number
  to: number
  periodStart: string
  periodEnd: string
  projectIds: string[] | null
}

export type SnapshotPageFetchResult = {
  rows: SnapshotHealthTrendRow[]
  count: number | null
  elapsedMs: number
  error?: string
}

export type SnapshotPageFetcher = (
  request: SnapshotPageFetchRequest,
) => Promise<SnapshotPageFetchResult>

export type CompanyHealthTrendLiveDiagnosticOptions = {
  now?: Date
  diagnosticRunId?: string | null
  outputFile?: string | null
  pageSize?: number
  projectIds?: string[]
  maxPages?: number
  env?: NodeJS.ProcessEnv
  fetchSnapshotPage?: SnapshotPageFetcher
  allowWrite?: boolean
  createDisposableSnapshots?: boolean
  createDisposableSnapshotEvidence?: DisposableSnapshotEvidenceCreator
  cleanupDisposableSnapshotEvidence?: DisposableSnapshotEvidenceCleaner
}

type SupabaseDiagnosticEnvironment = {
  hasSupabaseUrl: boolean
  hasSupabaseKey: boolean
  keyKind: 'service' | 'anon' | 'missing'
  canRunLiveProbe: boolean
}

type MaxRowsProbeResult = {
  status: DiagnosticStatus
  requestedRows: number
  observedRows: number
  reportedCount: number | null
  range: { from: number; to: number }
  elapsedMs: number
  reason?: string
}

type SnapshotTrendPaginationResult = {
  status: DiagnosticStatus
  pageSize: number
  rangeCalls: number
  totalRows: number
  reportedCount: number | null
  ranges: Array<{ from: number; to: number; rows: number; elapsedMs: number }>
  reason?: string
}

export type DisposableSnapshotEvidenceCreateRequest = {
  rowCount: number
  snapshotDate: string
  periodStart: string
  periodEnd: string
  now: Date
}

export type DisposableSnapshotEvidenceCreateResult = {
  status: DiagnosticStatus
  rowCount: number
  projectIds: string[]
  cleanupToken: string
  reason?: string
}

export type DisposableSnapshotEvidenceCleanupResult = {
  status: DiagnosticStatus
  deletedSnapshotRows: number
  deletedProjects: number
  deletedCompanies?: number
  reason?: string
}

export type DisposableSnapshotEvidenceCreator = (
  request: DisposableSnapshotEvidenceCreateRequest,
) => Promise<DisposableSnapshotEvidenceCreateResult>

export type DisposableSnapshotEvidenceCleaner = (
  evidence: DisposableSnapshotEvidenceCreateResult,
) => Promise<DisposableSnapshotEvidenceCleanupResult>

type DisposableSnapshotEvidenceReport = {
  enabled: boolean
  requestedRows: number
  snapshotDate: string
  projectIdFilterApplied: boolean
  created: DisposableSnapshotEvidenceCreateResult | null
  cleanup: DisposableSnapshotEvidenceCleanupResult | null
  reason?: string
}

export type CompanyHealthTrendLiveDiagnosticReport = {
  reportCode: 'c18_l13_supabase_max_rows_snapshot_trend_diagnostic'
  evidenceKind: 'live_supabase_diagnostic_entrypoint'
  generatedAt: string
  diagnosticRunId: string
  evidenceRef: string | null
  outputFile: string | null
  missingArchivedJson: boolean
  liveEvidenceRequired: true
  liveEvidenceRequiredReason: string
  status: DiagnosticStatus
  table: 'project_daily_snapshot'
  periodStart: string
  periodEnd: string
  pageSize: number
  projectIds: string[] | null
  environment: SupabaseDiagnosticEnvironment
  allowWrite: boolean
  disposableSnapshotEvidence?: DisposableSnapshotEvidenceReport
  checks: {
    maxRowsProbe: MaxRowsProbeResult
    snapshotTrendPagination: SnapshotTrendPaginationResult
  }
}

const DEFAULT_PAGE_SIZE = 1000
const DEFAULT_MAX_PAGES = 100
const DISPOSABLE_PROJECT_BATCH_SIZE = 500
const DISPOSABLE_SNAPSHOT_BATCH_SIZE = 500
const MAX_PROJECT_ID_FILTER_COUNT = 200

function roundMs(value: number) {
  return Math.round(value * 100) / 100
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function createDefaultDiagnosticRunId(now: Date) {
  return `c18-l13-health-trend-${now.toISOString().replace(/[:.]/g, '-')}`
}

function formatUtcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10)
}

function monthStart(date: Date) {
  return formatUtcDate(date.getUTCFullYear(), date.getUTCMonth(), 1)
}

function nextMonthStart(date: Date) {
  return formatUtcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
}

function currentMonthStart(date: Date) {
  return monthStart(date)
}

function previousMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1))
}

function normalizePageSize(value?: number) {
  if (!Number.isFinite(value)) return DEFAULT_PAGE_SIZE
  return Math.max(1, Math.trunc(value as number))
}

function normalizeProjectIds(projectIds?: string[]) {
  if (!projectIds || projectIds.length === 0) return null
  const normalized = Array.from(new Set(
    projectIds.map((projectId) => String(projectId ?? '').trim()).filter(Boolean),
  ))
  return normalized.length === 0 ? null : normalized
}

function readSupabaseEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const hasSupabaseUrl = Boolean(env.SUPABASE_URL)
  const hasServiceKey = Boolean(env.SUPABASE_SERVICE_KEY)
  const hasAnonKey = Boolean(env.SUPABASE_ANON_KEY)
  return {
    hasSupabaseUrl,
    hasSupabaseKey: hasServiceKey || hasAnonKey,
    keyKind: hasServiceKey ? 'service' : hasAnonKey ? 'anon' : 'missing',
    canRunLiveProbe: hasSupabaseUrl && (hasServiceKey || hasAnonKey),
  } satisfies SupabaseDiagnosticEnvironment
}

function createSupabaseServiceClient(env: NodeJS.ProcessEnv = process.env) {
  const supabaseUrl = env.SUPABASE_URL || ''
  const supabaseServiceKey = env.SUPABASE_SERVICE_KEY || ''
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Disposable snapshot evidence requires SUPABASE_URL and SUPABASE_SERVICE_KEY.')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function insufficientRowsReason(pageSize: number) {
  return `C-18.L13 needs at least ${pageSize + 1} live project_daily_snapshot rows in the two-month window to prove Supabase max-rows and pagination behavior.`
}

function buildDisposableSnapshotRows(projectIds: string[], snapshotDate: string) {
  return projectIds.map((projectId, index) => {
    const healthScore = 50 + (index % 50)
    return {
      project_id: projectId,
      snapshot_date: snapshotDate,
      health_score: healthScore,
      business_health_score: healthScore,
      overall_progress: index % 100,
      task_progress: index % 100,
      delay_days: index % 7,
      delay_count: index % 3,
      active_risk_count: index % 4,
      pending_condition_count: index % 2,
      active_obstacle_count: index % 2,
      attention_required: false,
      metric_availability: {},
      metric_registry_version: 'c18_l13_diagnostic',
      metric_snapshot_version: 1,
      health_caliber_version: 'c18_l13_diagnostic',
      deviation_caliber_version: 'c18_l13_diagnostic',
      health_basis: {
        diagnosticCode: 'c18_l13_supabase_max_rows_snapshot_trend_diagnostic',
      },
      deviation_summary: {},
    }
  })
}

function buildDisposableProjects(projectIds: string[], companyId: string) {
  return projectIds.map((projectId, index) => ({
    id: projectId,
    name: `C-18.L13 disposable trend project ${index + 1}`,
    company_id: companyId,
    project_visibility: 'private',
  }))
}

async function defaultCreateDisposableSnapshotEvidence(
  request: DisposableSnapshotEvidenceCreateRequest,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DisposableSnapshotEvidenceCreateResult> {
  const client = createSupabaseServiceClient(env)
  const companyId = randomUUID()
  const projectIds = Array.from({ length: request.rowCount }, () => randomUUID())

  const companyInsert = await (client as any)
    .from('companies')
    .insert({
      id: companyId,
      name: `C-18.L13 disposable health trend evidence ${request.now.toISOString()}`,
      status: 'active',
    })

  if (companyInsert.error) {
    throw new Error(`Failed to create disposable company for C-18.L13: ${companyInsert.error.message}`)
  }

  try {
    for (const batch of chunkArray(buildDisposableProjects(projectIds, companyId), DISPOSABLE_PROJECT_BATCH_SIZE)) {
      const projectInsert = await (client as any).from('projects').insert(batch)
      if (projectInsert.error) {
        throw new Error(`Failed to create disposable projects for C-18.L13: ${projectInsert.error.message}`)
      }
    }

    for (const batch of chunkArray(buildDisposableSnapshotRows(projectIds, request.snapshotDate), DISPOSABLE_SNAPSHOT_BATCH_SIZE)) {
      const snapshotInsert = await (client as any).from('project_daily_snapshot').insert(batch)
      if (snapshotInsert.error) {
        throw new Error(`Failed to create disposable project_daily_snapshot rows for C-18.L13: ${snapshotInsert.error.message}`)
      }
    }

    return {
      status: 'pass',
      rowCount: request.rowCount,
      projectIds,
      cleanupToken: companyId,
    }
  } catch (error) {
    await defaultCleanupDisposableSnapshotEvidence({
      status: 'fail',
      rowCount: request.rowCount,
      projectIds,
      cleanupToken: companyId,
      reason: error instanceof Error ? error.message : String(error),
    }, env).catch(() => undefined)
    throw error
  }
}

async function defaultCleanupDisposableSnapshotEvidence(
  evidence: DisposableSnapshotEvidenceCreateResult,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DisposableSnapshotEvidenceCleanupResult> {
  const client = createSupabaseServiceClient(env)
  let deletedSnapshotRows = 0
  let deletedProjects = 0
  const projectIds = evidence.projectIds

  for (const batch of chunkArray(projectIds, DISPOSABLE_SNAPSHOT_BATCH_SIZE)) {
    const snapshotDelete = await (client as any)
      .from('project_daily_snapshot')
      .delete({ count: 'exact' })
      .in('project_id', batch)
    if (snapshotDelete.error) {
      throw new Error(`Failed to clean disposable C-18.L13 snapshot rows: ${snapshotDelete.error.message}`)
    }
    deletedSnapshotRows += Number(snapshotDelete.count ?? 0)
  }

  for (const batch of chunkArray(projectIds, DISPOSABLE_PROJECT_BATCH_SIZE)) {
    const projectDelete = await (client as any)
      .from('projects')
      .delete({ count: 'exact' })
      .in('id', batch)
    if (projectDelete.error) {
      throw new Error(`Failed to clean disposable C-18.L13 projects: ${projectDelete.error.message}`)
    }
    deletedProjects += Number(projectDelete.count ?? 0)
  }

  const companyDelete = await (client as any)
    .from('companies')
    .delete({ count: 'exact' })
    .eq('id', evidence.cleanupToken)
  if (companyDelete.error) {
    throw new Error(`Failed to clean disposable C-18.L13 company: ${companyDelete.error.message}`)
  }

  return {
    status: 'pass',
    deletedSnapshotRows,
    deletedProjects,
    deletedCompanies: Number(companyDelete.count ?? 0),
  }
}

async function runMaxRowsProbe(
  fetchSnapshotPage: SnapshotPageFetcher,
  requestBase: Pick<SnapshotPageFetchRequest, 'periodStart' | 'periodEnd' | 'projectIds'>,
  pageSize: number,
): Promise<MaxRowsProbeResult> {
  const requestedRows = pageSize + 1
  const result = await fetchSnapshotPage({
    probe: 'max_rows',
    from: 0,
    to: pageSize,
    ...requestBase,
  })

  const observedRows = result.rows.length
  if (result.error) {
    return {
      status: 'fail',
      requestedRows,
      observedRows,
      reportedCount: result.count,
      range: { from: 0, to: pageSize },
      elapsedMs: result.elapsedMs,
      reason: result.error,
    }
  }

  if ((result.count !== null && result.count < requestedRows) || observedRows < Math.min(requestedRows, pageSize)) {
    return {
      status: 'blocked',
      requestedRows,
      observedRows,
      reportedCount: result.count,
      range: { from: 0, to: pageSize },
      elapsedMs: result.elapsedMs,
      reason: insufficientRowsReason(pageSize),
    }
  }

  return {
    status: 'pass',
    requestedRows,
    observedRows,
    reportedCount: result.count,
    range: { from: 0, to: pageSize },
    elapsedMs: result.elapsedMs,
  }
}

async function runSnapshotTrendPaginationProbe(
  fetchSnapshotPage: SnapshotPageFetcher,
  requestBase: Pick<SnapshotPageFetchRequest, 'periodStart' | 'periodEnd' | 'projectIds'>,
  pageSize: number,
  maxPages: number,
): Promise<SnapshotTrendPaginationResult> {
  const ranges: SnapshotTrendPaginationResult['ranges'] = []
  let reportedCount: number | null = null
  let totalRows = 0

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const from = pageIndex * pageSize
    const to = from + pageSize - 1
    const result = await fetchSnapshotPage({
      probe: 'snapshot_trend',
      from,
      to,
      ...requestBase,
    })

    if (result.error) {
      return {
        status: 'fail',
        pageSize,
        rangeCalls: ranges.length + 1,
        totalRows,
        reportedCount,
        ranges,
        reason: result.error,
      }
    }

    if (reportedCount === null && result.count !== null) {
      reportedCount = result.count
    }

    const rowCount = result.rows.length
    totalRows += rowCount
    ranges.push({ from, to, rows: rowCount, elapsedMs: result.elapsedMs })

    if (rowCount < pageSize) {
      break
    }
  }

  if ((reportedCount !== null && reportedCount < pageSize + 1) || totalRows < pageSize + 1) {
    return {
      status: 'blocked',
      pageSize,
      rangeCalls: ranges.length,
      totalRows,
      reportedCount,
      ranges,
      reason: insufficientRowsReason(pageSize),
    }
  }

  if (ranges.length < 2) {
    return {
      status: 'fail',
      pageSize,
      rangeCalls: ranges.length,
      totalRows,
      reportedCount,
      ranges,
      reason: 'Expected at least two Supabase range calls when snapshot rows exceed one page.',
    }
  }

  const lastRange = ranges[ranges.length - 1]
  if (lastRange.rows === pageSize && ranges.length >= maxPages) {
    return {
      status: 'fail',
      pageSize,
      rangeCalls: ranges.length,
      totalRows,
      reportedCount,
      ranges,
      reason: `Pagination did not finish within maxPages=${maxPages}; raise the cap or narrow projectIds before using this as C-18.L13 evidence.`,
    }
  }

  return {
    status: 'pass',
    pageSize,
    rangeCalls: ranges.length,
    totalRows,
    reportedCount,
    ranges,
  }
}

function combineStatus(checks: DiagnosticStatus[]) {
  if (checks.includes('fail')) return 'fail'
  if (checks.includes('blocked')) return 'blocked'
  return 'pass'
}

function createBlockedReport(
  options: Required<Pick<CompanyHealthTrendLiveDiagnosticOptions, 'now'>> & {
    diagnosticRunId: string
    pageSize: number
    projectIds: string[] | null
    outputFile?: string | null
    environment: SupabaseDiagnosticEnvironment
    reason: string
    allowWrite?: boolean
    disposableSnapshotEvidence?: DisposableSnapshotEvidenceReport
  },
): CompanyHealthTrendLiveDiagnosticReport {
  const periodStart = monthStart(previousMonth(options.now))
  const periodEnd = nextMonthStart(options.now)
  return {
    reportCode: 'c18_l13_supabase_max_rows_snapshot_trend_diagnostic',
    evidenceKind: 'live_supabase_diagnostic_entrypoint',
    generatedAt: options.now.toISOString(),
    diagnosticRunId: options.diagnosticRunId,
    evidenceRef: options.outputFile || null,
    outputFile: options.outputFile || null,
    missingArchivedJson: !options.outputFile,
    liveEvidenceRequired: true,
    liveEvidenceRequiredReason: 'Run this script against staging or production-like Supabase data and archive the JSON output before closing C-18.L13.',
    status: 'blocked',
    table: 'project_daily_snapshot',
    periodStart,
    periodEnd,
    pageSize: options.pageSize,
    projectIds: options.projectIds,
    environment: options.environment,
    allowWrite: options.allowWrite === true,
    ...(options.disposableSnapshotEvidence ? { disposableSnapshotEvidence: options.disposableSnapshotEvidence } : {}),
    checks: {
      maxRowsProbe: {
        status: 'blocked',
        requestedRows: options.pageSize + 1,
        observedRows: 0,
        reportedCount: null,
        range: { from: 0, to: options.pageSize },
        elapsedMs: 0,
        reason: options.reason,
      },
      snapshotTrendPagination: {
        status: 'blocked',
        pageSize: options.pageSize,
        rangeCalls: 0,
        totalRows: 0,
        reportedCount: null,
        ranges: [],
        reason: options.reason,
      },
    },
  }
}

export async function buildCompanyHealthTrendLiveDiagnosticReport(
  options: CompanyHealthTrendLiveDiagnosticOptions = {},
): Promise<CompanyHealthTrendLiveDiagnosticReport> {
  const now = options.now ?? new Date()
  const outputFile = parseOptionalOutputFile(options.outputFile)
  const diagnosticRunId = normalizeText(options.diagnosticRunId) || createDefaultDiagnosticRunId(now)
  const pageSize = normalizePageSize(options.pageSize)
  let projectIds = normalizeProjectIds(options.projectIds)
  const allowWrite = options.allowWrite === true
  const createDisposableSnapshots = options.createDisposableSnapshots === true
  const environment = readSupabaseEnvironment(options.env)
  const periodStart = monthStart(previousMonth(now))
  const periodEnd = nextMonthStart(now)
  const disposableSnapshotDate = currentMonthStart(now)
  let disposableSnapshotEvidence: DisposableSnapshotEvidenceReport | undefined
  let createdDisposableEvidence: DisposableSnapshotEvidenceCreateResult | null = null

  if (createDisposableSnapshots) {
    disposableSnapshotEvidence = {
      enabled: true,
      requestedRows: pageSize + 1,
      snapshotDate: disposableSnapshotDate,
      projectIdFilterApplied: false,
      created: null,
      cleanup: null,
    }

    if (!allowWrite) {
      disposableSnapshotEvidence.reason = 'Pass --allow-write with --create-disposable-snapshots to create disposable C-18.L13 evidence.'
      return createBlockedReport({
        now,
        diagnosticRunId,
        pageSize,
        projectIds,
        outputFile,
        environment,
        reason: disposableSnapshotEvidence.reason,
        allowWrite,
        disposableSnapshotEvidence,
      })
    }

    try {
      const createDisposableSnapshotEvidence = options.createDisposableSnapshotEvidence
        ?? ((request: DisposableSnapshotEvidenceCreateRequest) => defaultCreateDisposableSnapshotEvidence(request, options.env))
      createdDisposableEvidence = await createDisposableSnapshotEvidence({
        rowCount: pageSize + 1,
        snapshotDate: disposableSnapshotDate,
        periodStart,
        periodEnd,
        now,
      })
      disposableSnapshotEvidence.created = createdDisposableEvidence
      if (createdDisposableEvidence.status !== 'pass') {
        disposableSnapshotEvidence.reason = createdDisposableEvidence.reason || 'Disposable snapshot evidence creation did not pass.'
      } else {
        const createdProjectIds = normalizeProjectIds(createdDisposableEvidence.projectIds)
        if (createdProjectIds && createdProjectIds.length <= MAX_PROJECT_ID_FILTER_COUNT) {
          projectIds = createdProjectIds
          disposableSnapshotEvidence.projectIdFilterApplied = true
        } else {
          projectIds = null
          disposableSnapshotEvidence.projectIdFilterApplied = false
          disposableSnapshotEvidence.reason = `Disposable sample has ${createdProjectIds?.length ?? 0} project IDs; skipping project_id IN filter to avoid oversized Supabase/PostgREST URLs while still proving the >${pageSize} snapshot window.`
        }
      }
    } catch (error) {
      disposableSnapshotEvidence.created = {
        status: 'fail',
        rowCount: pageSize + 1,
        projectIds: [],
        cleanupToken: '',
        reason: error instanceof Error ? error.message : String(error),
      }
      disposableSnapshotEvidence.reason = disposableSnapshotEvidence.created.reason
      return createBlockedReport({
        now,
        diagnosticRunId,
        pageSize,
        projectIds,
        outputFile,
        environment,
        reason: disposableSnapshotEvidence.reason || 'Disposable snapshot evidence creation failed.',
        allowWrite,
        disposableSnapshotEvidence,
      })
    }
  }

  const requestBase = { periodStart, periodEnd, projectIds }
  const fetchSnapshotPage = options.fetchSnapshotPage ??
    (environment.canRunLiveProbe ? createSupabaseSnapshotPageFetcher(options.env) : null)

  if (!fetchSnapshotPage) {
    return createBlockedReport({
      now,
      diagnosticRunId,
      pageSize,
      projectIds,
      environment,
      outputFile,
      allowWrite,
      disposableSnapshotEvidence,
      reason: 'Missing SUPABASE_URL and SUPABASE_SERVICE_KEY/SUPABASE_ANON_KEY; cannot produce C-18.L13 live evidence.',
    })
  }

  let maxRowsProbe: MaxRowsProbeResult
  let snapshotTrendPagination: SnapshotTrendPaginationResult

  try {
    maxRowsProbe = await runMaxRowsProbe(fetchSnapshotPage, requestBase, pageSize)
    snapshotTrendPagination = await runSnapshotTrendPaginationProbe(
      fetchSnapshotPage,
      requestBase,
      pageSize,
      Math.max(1, Math.trunc(options.maxPages ?? DEFAULT_MAX_PAGES)),
    )
  } finally {
    if (createdDisposableEvidence && disposableSnapshotEvidence) {
      try {
        const cleanupDisposableSnapshotEvidence = options.cleanupDisposableSnapshotEvidence
          ?? ((evidence: DisposableSnapshotEvidenceCreateResult) => defaultCleanupDisposableSnapshotEvidence(evidence, options.env))
        disposableSnapshotEvidence.cleanup = await cleanupDisposableSnapshotEvidence(createdDisposableEvidence)
      } catch (error) {
        disposableSnapshotEvidence.cleanup = {
          status: 'fail',
          deletedSnapshotRows: 0,
          deletedProjects: 0,
          reason: error instanceof Error ? error.message : String(error),
        }
      }
    }
  }

  const disposableStatus: DiagnosticStatus = !disposableSnapshotEvidence
    ? 'pass'
    : disposableSnapshotEvidence.created?.status === 'pass'
      && (disposableSnapshotEvidence.cleanup === null || disposableSnapshotEvidence.cleanup.status === 'pass')
      ? 'pass'
      : 'fail'
  const missingArchivedJson = !outputFile

  return {
    reportCode: 'c18_l13_supabase_max_rows_snapshot_trend_diagnostic',
    evidenceKind: 'live_supabase_diagnostic_entrypoint',
    generatedAt: now.toISOString(),
    diagnosticRunId,
    evidenceRef: outputFile || null,
    outputFile: outputFile || null,
    missingArchivedJson,
    liveEvidenceRequired: true,
    liveEvidenceRequiredReason: 'Run this script against staging or production-like Supabase data and archive the JSON output before closing C-18.L13.',
    table: 'project_daily_snapshot',
    periodStart,
    periodEnd,
    pageSize,
    projectIds,
    environment,
    allowWrite,
    ...(disposableSnapshotEvidence ? { disposableSnapshotEvidence } : {}),
    checks: {
      maxRowsProbe,
      snapshotTrendPagination,
    },
    status: combineStatus([
      maxRowsProbe.status,
      snapshotTrendPagination.status,
      disposableStatus,
      missingArchivedJson ? 'fail' : 'pass',
    ]),
  }
}

export function shouldFailCompanyHealthTrendLiveDiagnosticReport(
  report: CompanyHealthTrendLiveDiagnosticReport,
) {
  return report.status !== 'pass'
}

function createSupabaseSnapshotPageFetcher(env: NodeJS.ProcessEnv = process.env): SnapshotPageFetcher {
  const supabaseUrl = env.SUPABASE_URL || ''
  const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY || ''
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return async (request) => {
    const startedAt = performance.now()
    let query: any = client
      .from('project_daily_snapshot')
      .select('project_id, snapshot_date, health_score', { count: 'exact' })
      .gte('snapshot_date', request.periodStart)
      .lt('snapshot_date', request.periodEnd)
      .order('snapshot_date', { ascending: true })
      .order('project_id', { ascending: true })

    if (request.projectIds && request.projectIds.length > 0) {
      query = query.in('project_id', request.projectIds)
    }

    const { data, error, count } = await query.range(request.from, request.to)
    return {
      rows: (data || []) as SnapshotHealthTrendRow[],
      count: count ?? null,
      elapsedMs: roundMs(performance.now() - startedAt),
      error: error ? error.message : undefined,
    }
  }
}

function parseNumberArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  if (!inline) return undefined
  const parsed = Number(inline.slice(prefix.length))
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseStringArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : undefined
}

function parseOptionalOutputFile(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

export function parseCompanyHealthTrendDiagnosticArgs(
  args: string[],
): Pick<CompanyHealthTrendLiveDiagnosticOptions, 'pageSize' | 'projectIds' | 'allowWrite' | 'createDisposableSnapshots' | 'outputFile' | 'diagnosticRunId'> {
  const pageSize = parseNumberArg(args, 'page-size')
  const projectIdsValue = parseStringArg(args, 'project-ids')
  const outputFile = parseOptionalOutputFile(parseStringArg(args, 'output-file'))
  const diagnosticRunId = normalizeText(parseStringArg(args, 'diagnostic-run-id'))
  const projectIds = projectIdsValue
    ? normalizeProjectIds(projectIdsValue.split(',')) ?? undefined
    : undefined

  return {
    ...(pageSize === undefined ? {} : { pageSize }),
    ...(projectIds === undefined ? {} : { projectIds }),
    ...(args.includes('--allow-write') ? { allowWrite: true } : {}),
    ...(args.includes('--create-disposable-snapshots') ? { createDisposableSnapshots: true } : {}),
    ...(outputFile ? { outputFile } : {}),
    ...(diagnosticRunId ? { diagnosticRunId } : {}),
  }
}

function writeReportIfRequested(report: CompanyHealthTrendLiveDiagnosticReport) {
  if (!report.outputFile) return
  writeJsonFile(report.outputFile, report)
}

async function main() {
  const report = await buildCompanyHealthTrendLiveDiagnosticReport(
    parseCompanyHealthTrendDiagnosticArgs(process.argv),
  )
  writeReportIfRequested(report)
  console.log(JSON.stringify(report, null, 2))
  if (shouldFailCompanyHealthTrendLiveDiagnosticReport(report)) {
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('diagnose-company-health-trend-live.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
