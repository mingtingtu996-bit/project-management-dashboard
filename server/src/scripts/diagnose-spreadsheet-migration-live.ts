import { basename } from 'node:path'
import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import pg from 'pg'
import { readJsonFile, resolveEvidencePath, writeJsonFile } from './jsonEvidenceUtils.js'

type DiagnosticStatus = 'blocked' | 'pass' | 'fail'

export type SpreadsheetImportPressureUploadRequest = {
  baseUrl: string
  authToken: string
  projectId: string
  workbookFile: string
  name: string
  templateType: string
  iteration: number
  diagnosticRunId?: string | null
  requestId?: string | null
  routeInvocationId?: string | null
}

export type SpreadsheetImportPressureUploadResponse = {
  httpStatus: number
  success: boolean
  templateId: string | null
  nodeCount: number | null
  errorCode: string | null
  errorMessage?: string | null
  requestId?: string | null
  routeInvocationId?: string | null
}

export type SpreadsheetImportPressureUploader = (
  request: SpreadsheetImportPressureUploadRequest,
) => Promise<SpreadsheetImportPressureUploadResponse>

export type SpreadsheetMigrationReplayEvidence = {
  status: 'pass' | 'fail' | 'blocked' | string
  diagnosticRunId?: string | null
  idempotentReplay?: boolean
  replayRunCount?: number
  environment?: string | null
  evidenceRef?: string | null
  reason?: string | null
}

export type SpreadsheetMigrationReplayEvidenceReader = (
  evidenceFile: string,
) => Promise<SpreadsheetMigrationReplayEvidence>

export type SpreadsheetImportPressureEvidenceArchiver = (
  evidenceFile: string,
  evidence: SpreadsheetImportPressureEvidence,
) => Promise<void> | void

export type SpreadsheetImportedTemplateCleanupRequest = {
  baseUrl: string
  authToken: string
  projectId: string
  templateId: string
  diagnosticRunId: string
  namePrefix?: string | null
}

export type SpreadsheetImportedTemplateCleanupResult = {
  templateId: string
  success: boolean
  httpStatus: number
  errorMessage?: string | null
  cleanupStrategy?: 'route_delete' | 'guarded_direct_delete'
}

export type SpreadsheetImportedTemplateCleanup = (
  request: SpreadsheetImportedTemplateCleanupRequest,
) => Promise<SpreadsheetImportedTemplateCleanupResult>

export type SpreadsheetImportPressureDiagnosticCheck = {
  status: DiagnosticStatus
  importPressureEvidenceFile: string | null
  attemptCount: number
  successCount: number
  unexpectedFailureCount: number
  elapsedMs: number | null
  totalImportedNodeCount: number | null
  averageElapsedMsPerAttempt: number | null
  runtimeEvidenceGap: {
    missingMemoryObservation: boolean
    missingCpuObservation: boolean
    missingTimeoutBudgetEvidence: boolean
    missingCleanupEvidence: boolean
    missingDiagnosticScopeEvidence: boolean
    missingEvidenceMetadata: boolean
    missingCreatedTemplateEvidence: boolean
    missingImportedNodeEvidence: boolean
    missingDiagnosticCorrelationEvidence: boolean
  }
  responses: SpreadsheetImportPressureUploadResponse[]
  reason?: string
}

export type SpreadsheetImportPressureEvidence = {
  diagnosticRunId?: string | null
  projectId?: string | null
  workbookFile?: string | null
  iterationCount?: number | null
  importRoutePath?: string | null
  importRouteMethod?: string | null
  environment?: string | null
  evidenceRef?: string | null
  memoryObserved?: boolean
  cpuObserved?: boolean
  timeoutBudgetObserved?: boolean
  cleanupObserved?: boolean
  cleanupTemplateIds?: string[]
  attemptEvidence?: Array<{
    iteration: number
    requestId?: string | null
    routeInvocationId?: string | null
    templateId?: string | null
  }>
}

export type SpreadsheetMigrationReplayDiagnosticCheck = {
  status: DiagnosticStatus
  evidenceFile: string | null
  idempotentReplay: boolean | null
  replayRunCount: number | null
  environment: string | null
  evidenceRef: string | null
  reason?: string
}

export type SpreadsheetMigrationLiveDiagnosticReport = {
  reportCode: 'c18_l15_spreadsheet_migration_live_diagnostic'
  evidenceKind: 'live_wbs_spreadsheet_import_and_migration_replay_probe'
  generatedAt: string
  environment: 'current-live'
  diagnosticRunId: string
  expectedDiagnosticRunId: string
  command: string
  exitCode: number
  artifactPath: string | null
  targetIds: {
    projectId: string | null
    workbookFile: string | null
  }
  startedAt: string
  finishedAt: string
  cleanupReadback: {
    status: 'not_required' | 'pass' | 'fail'
    reason?: string
    cleanupTemplateIds?: string[]
    cleanupAttempts?: SpreadsheetImportedTemplateCleanupResult[]
  }
  outputFile: string | null
  missingArchivedJson: boolean
  liveEvidenceRequired: true
  liveEvidenceRequiredReason: string
  migrationReplayEvidenceRequired: true
  migrationReplayEvidenceRequiredReason: string
  liveEvidenceChecklist: string[]
  status: DiagnosticStatus
  allowWrite: boolean
  baseUrl: string | null
  projectId: string | null
  workbookFileProvided: boolean
  iterations: number
  migrationReplayEvidenceFile: string | null
  checks: {
    spreadsheetImportPressure: SpreadsheetImportPressureDiagnosticCheck
    migrationReplayEvidence: SpreadsheetMigrationReplayDiagnosticCheck
  }
}

export type SpreadsheetMigrationLiveDiagnosticOptions = {
  now?: Date
  diagnosticRunId?: string | null
  outputFile?: string | null
  allowWrite?: boolean
  baseUrl?: string | null
  authToken?: string | null
  projectId?: string | null
  workbookFile?: string | null
  iterations?: number | null
  namePrefix?: string | null
  templateType?: string | null
  importPressureEvidenceFile?: string | null
  importPressureEvidence?: unknown
  migrationReplayEvidenceFile?: string | null
  uploadWorkbook?: SpreadsheetImportPressureUploader
  readMigrationReplayEvidence?: SpreadsheetMigrationReplayEvidenceReader
  archiveImportPressureEvidence?: SpreadsheetImportPressureEvidenceArchiver
  cleanupImportedTemplate?: SpreadsheetImportedTemplateCleanup
  command?: string | null
}

const SPREADSHEET_IMPORT_TIMEOUT_BUDGET_MS = 30_000

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function createDefaultDiagnosticRunId(now: Date) {
  return `c18-l15-${now.toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100
}

function liveEvidenceChecklist() {
  return [
    'live/staging WBS spreadsheet import attempts with node counts and elapsed timing',
    'memory, CPU, and request timeout observations for the import process',
    'archived migration replay JSON with at least two idempotent runs',
    'post-run cleanup or retention decision for imported diagnostic templates',
  ]
}

function runtimeEvidenceGap(): SpreadsheetImportPressureDiagnosticCheck['runtimeEvidenceGap'] {
  return {
    missingMemoryObservation: true,
    missingCpuObservation: true,
    missingTimeoutBudgetEvidence: true,
    missingCleanupEvidence: true,
    missingDiagnosticScopeEvidence: true,
    missingEvidenceMetadata: true,
    missingCreatedTemplateEvidence: true,
    missingImportedNodeEvidence: true,
    missingDiagnosticCorrelationEvidence: true,
  }
}

function runtimeEvidenceGapFromImportPressureEvidence(
  evidence: SpreadsheetImportPressureEvidence | null,
  expected: {
    projectId: string
    workbookFile: string
    iterations: number
    diagnosticRunId: string
  },
) {
  const scopeMatches = evidence?.projectId === expected.projectId &&
    evidence?.workbookFile === expected.workbookFile &&
    evidence?.iterationCount === expected.iterations &&
    normalizeText(evidence?.importRouteMethod).toUpperCase() === 'POST' &&
    evidence?.importRoutePath === '/api/planning/wbs-templates/import-excel'
  const hasEvidenceMetadata = Boolean(normalizeText(evidence?.environment)) && Boolean(normalizeText(evidence?.evidenceRef))
  const expectedIterations = Array.from({ length: expected.iterations }, (_, index) => index + 1)
  const attemptEvidenceByIteration = new Map((evidence?.attemptEvidence ?? [])
    .map((attempt) => [attempt.iteration, attempt]))
  const evidenceDiagnosticRunId = normalizeText(evidence?.diagnosticRunId)
  const hasAttemptCorrelation = Boolean(evidenceDiagnosticRunId) &&
    evidenceDiagnosticRunId === expected.diagnosticRunId &&
    expectedIterations.every((iteration) => {
      const attempt = attemptEvidenceByIteration.get(iteration)
      return Boolean(
        attempt &&
          normalizeText(attempt.requestId) &&
          normalizeText(attempt.routeInvocationId),
      )
    })
  return {
    missingMemoryObservation: evidence?.memoryObserved !== true,
    missingCpuObservation: evidence?.cpuObserved !== true,
    missingTimeoutBudgetEvidence: evidence?.timeoutBudgetObserved !== true,
    missingCleanupEvidence: evidence?.cleanupObserved !== true,
    missingDiagnosticScopeEvidence: !scopeMatches,
    missingEvidenceMetadata: !hasEvidenceMetadata,
    missingCreatedTemplateEvidence: true,
    missingImportedNodeEvidence: true,
    missingDiagnosticCorrelationEvidence: !hasAttemptCorrelation,
  }
}

function hasRuntimeEvidenceGap(gap: ReturnType<typeof runtimeEvidenceGapFromImportPressureEvidence>) {
  return Object.values(gap).some(Boolean)
}

function importResponseEvidenceGap(
  responses: SpreadsheetImportPressureUploadResponse[],
  expectedAttempts: number,
  evidence: SpreadsheetImportPressureEvidence | null,
) {
  const successfulResponses = responses.filter(isSuccessfulImport)
  const createdTemplateIds = successfulResponses
    .map((response) => normalizeText(response.templateId))
    .filter(Boolean)
  const cleanupTemplateIds = new Set((evidence?.cleanupTemplateIds ?? [])
    .map((templateId) => normalizeText(templateId))
    .filter(Boolean))
  const attemptTemplateIds = new Set((evidence?.attemptEvidence ?? [])
    .map((attempt) => normalizeText(attempt.templateId))
    .filter(Boolean))
  const cleanupCoversCreatedTemplates = createdTemplateIds.length === expectedAttempts &&
    createdTemplateIds.every((templateId) => cleanupTemplateIds.has(templateId))
  const attemptEvidenceCoversCreatedTemplates = createdTemplateIds.length === expectedAttempts &&
    createdTemplateIds.every((templateId) => attemptTemplateIds.has(templateId))
  const allSuccessfulResponsesHaveTemplateIds = successfulResponses.length === expectedAttempts
    && successfulResponses.every((response) => Boolean(normalizeText(response.templateId)))
  const allSuccessfulResponsesHaveImportedNodes = successfulResponses.length === expectedAttempts
    && successfulResponses.every((response) =>
      typeof response.nodeCount === 'number'
      && Number.isFinite(response.nodeCount)
      && response.nodeCount > 0,
    )

  return {
    missingCleanupEvidence: evidence?.cleanupObserved !== true || !cleanupCoversCreatedTemplates,
    missingCreatedTemplateEvidence: !allSuccessfulResponsesHaveTemplateIds,
    missingImportedNodeEvidence: !allSuccessfulResponsesHaveImportedNodes,
    missingDiagnosticCorrelationEvidence: !attemptEvidenceCoversCreatedTemplates,
  }
}

function normalizeIterations(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1
}

function blockedSpreadsheetImportCheck(
  reason: string,
  importPressureEvidenceFile: string | null = null,
  evidenceGap: ReturnType<typeof runtimeEvidenceGapFromImportPressureEvidence> = runtimeEvidenceGap(),
): SpreadsheetImportPressureDiagnosticCheck {
  return {
    status: 'blocked',
    importPressureEvidenceFile,
    attemptCount: 0,
    successCount: 0,
    unexpectedFailureCount: 0,
    elapsedMs: null,
    totalImportedNodeCount: null,
    averageElapsedMsPerAttempt: null,
    runtimeEvidenceGap: evidenceGap,
    responses: [],
    reason,
  }
}

function blockedMigrationReplayEvidenceCheck(reason: string, evidenceFile: string | null = null): SpreadsheetMigrationReplayDiagnosticCheck {
  return {
    status: 'blocked',
    evidenceFile,
    idempotentReplay: null,
    replayRunCount: null,
    environment: null,
    evidenceRef: null,
    reason,
  }
}

function isSuccessfulImport(response: SpreadsheetImportPressureUploadResponse) {
  return response.success && response.httpStatus >= 200 && response.httpStatus < 300
}

async function defaultUploadWorkbook(
  request: SpreadsheetImportPressureUploadRequest,
): Promise<SpreadsheetImportPressureUploadResponse> {
  const workbookBytes = readFileSync(resolveEvidencePath(request.workbookFile))
  const body = new FormData()
  body.append('project_id', request.projectId)
  body.append('name', request.name)
  body.append('template_type', request.templateType)
  body.append(
    'file',
    new Blob([new Uint8Array(workbookBytes)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    basename(request.workbookFile),
  )

  const response = await fetch(`${trimTrailingSlash(request.baseUrl)}/api/planning/wbs-templates/import-excel?project_id=${encodeURIComponent(request.projectId)}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${request.authToken}`,
      ...(request.diagnosticRunId ? { 'x-workbuddy-diagnostic-run-id': request.diagnosticRunId } : {}),
      ...(request.requestId ? { 'x-workbuddy-diagnostic-request-id': request.requestId } : {}),
    },
    body,
    signal: AbortSignal.timeout(SPREADSHEET_IMPORT_TIMEOUT_BUDGET_MS),
  })

  let responseBody: any = null
  try {
    responseBody = await response.json()
  } catch {
    responseBody = null
  }

  const nodeCount = Number(responseBody?.data?.nodeCount ?? responseBody?.data?.node_count)

  return {
    httpStatus: response.status,
    success: Boolean(responseBody?.success ?? response.ok),
    templateId: normalizeText(responseBody?.data?.id ?? responseBody?.data?.templateId ?? responseBody?.data?.template_id) || null,
    nodeCount: Number.isFinite(nodeCount) ? nodeCount : null,
    errorCode: normalizeText(responseBody?.error?.code) || null,
    errorMessage: normalizeText(responseBody?.error?.message) || null,
    requestId: request.requestId ?? null,
    routeInvocationId: normalizeText(response.headers.get('x-request-id') ?? responseBody?.requestId ?? responseBody?.request_id ?? responseBody?.data?.routeInvocationId ?? responseBody?.data?.route_invocation_id) || request.routeInvocationId || null,
  }
}

async function defaultCleanupImportedTemplate(
  request: SpreadsheetImportedTemplateCleanupRequest,
  directCleanup: SpreadsheetImportedTemplateDirectCleanupExecutor = defaultDirectCleanupImportedTemplate,
): Promise<SpreadsheetImportedTemplateCleanupResult> {
  let routeResult: SpreadsheetImportedTemplateCleanupResult | null = null
  try {
    const response = await fetch(`${trimTrailingSlash(request.baseUrl)}/api/planning/wbs-templates/${encodeURIComponent(request.templateId)}`, {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${request.authToken}`,
        'x-workbuddy-diagnostic-run-id': request.diagnosticRunId,
      },
      signal: AbortSignal.timeout(SPREADSHEET_IMPORT_TIMEOUT_BUDGET_MS),
    })
    let responseBody: any = null
    try {
      responseBody = await response.json()
    } catch {
      responseBody = null
    }
    const result = {
      templateId: request.templateId,
      success: response.ok && Boolean(responseBody?.success ?? true),
      httpStatus: response.status,
      errorMessage: normalizeText(responseBody?.error?.message) || null,
      cleanupStrategy: 'route_delete' as const,
    }
    if (result.success) return result
    routeResult = result
  } catch (error) {
    routeResult = {
      templateId: request.templateId,
      success: false,
      httpStatus: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
      cleanupStrategy: 'route_delete',
    }
  }

  if (routeResult?.success) return routeResult

  try {
    const directResult = await directCleanup(
      request.templateId,
      request.projectId,
      normalizeText(request.namePrefix) || 'C18L15',
    )
    const deleted = Number(directResult.rowCount ?? 0) > 0
    return {
      templateId: request.templateId,
      success: deleted,
      httpStatus: deleted ? 200 : (routeResult?.httpStatus ?? 0),
      errorMessage: deleted
        ? null
        : routeResult?.errorMessage || 'No diagnostic WBS template matched the guarded direct cleanup scope.',
      cleanupStrategy: 'guarded_direct_delete',
    }
  } catch (error) {
    return {
      templateId: request.templateId,
      success: false,
      httpStatus: routeResult?.httpStatus ?? 0,
      errorMessage: error instanceof Error ? error.message : String(error),
      cleanupStrategy: 'guarded_direct_delete',
    }
  }
}

type SpreadsheetImportedTemplateDirectCleanupExecutor = (
  templateId: string,
  projectId: string,
  namePrefix: string,
) => Promise<{ rowCount: number | null }>

async function defaultDirectCleanupImportedTemplate(
  templateId: string,
  projectId: string,
  namePrefix: string,
): Promise<{ rowCount: number | null }> {
  const migrationCleanupUrl = normalizeDiagnosticCleanupConnectionString(
    process.env.WORKBUDDY_DIAGNOSTIC_CLEANUP_DATABASE_URL
      ?? process.env.SUPABASE_MIGRATION_URL,
  )
  if (!migrationCleanupUrl) return { rowCount: 0 }

  const client = new pg.Client({
    connectionString: migrationCleanupUrl,
    ssl: { rejectUnauthorized: false },
  })
  try {
    await client.connect()
    const result = await client.query(
      `WITH guarded_template AS (
          SELECT id
          FROM public.wbs_templates
          WHERE id = $1
            AND project_id = $2
            AND template_name LIKE ($3 || '-%')
        ),
        deleted_nodes AS (
          DELETE FROM public.wbs_template_nodes
          WHERE template_id IN (SELECT id FROM guarded_template)
          RETURNING id
        )
        DELETE FROM public.wbs_templates
        WHERE id IN (SELECT id FROM guarded_template)`,
      [templateId, projectId, namePrefix],
    )
    return { rowCount: result.rowCount ?? 0 }
  } finally {
    await client.end().catch(() => undefined)
  }
}

function normalizeDiagnosticCleanupConnectionString(value: unknown) {
  const text = normalizeText(value)
  if (!text) return ''
  try {
    const url = new URL(text)
    url.searchParams.delete('sslmode')
    return url.toString()
  } catch {
    return text
  }
}

async function defaultReadMigrationReplayEvidence(
  evidenceFile: string,
): Promise<SpreadsheetMigrationReplayEvidence> {
  const parsed = readJsonFile(evidenceFile)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      status: 'fail',
      idempotentReplay: false,
      replayRunCount: 0,
      reason: 'Migration replay evidence file must contain a JSON object.',
    }
  }
  return parsed as SpreadsheetMigrationReplayEvidence
}

function normalizeImportPressureEvidence(value: unknown): SpreadsheetImportPressureEvidence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const cleanupTemplateIdsValue = record.cleanupTemplateIds ?? record.cleanup_template_ids
  const attemptEvidenceValue = record.attemptEvidence ?? record.attempt_evidence
  return {
    diagnosticRunId: normalizeText(record.diagnosticRunId ?? record.diagnostic_run_id) || null,
    projectId: normalizeText(record.projectId ?? record.project_id) || null,
    workbookFile: normalizeText(record.workbookFile ?? record.workbook_file) || null,
    iterationCount: Number.isFinite(Number(record.iterationCount ?? record.iteration_count))
      ? Number(record.iterationCount ?? record.iteration_count)
      : null,
    importRoutePath: normalizeText(record.importRoutePath ?? record.import_route_path ?? record.routePath ?? record.route_path) || null,
    importRouteMethod: normalizeText(record.importRouteMethod ?? record.import_route_method ?? record.method) || null,
    environment: normalizeText(record.environment) || null,
    evidenceRef: normalizeText(record.evidenceRef ?? record.evidence_ref) || null,
    memoryObserved: record.memoryObserved === true,
    cpuObserved: record.cpuObserved === true,
    timeoutBudgetObserved: record.timeoutBudgetObserved === true,
    cleanupObserved: record.cleanupObserved === true,
    cleanupTemplateIds: Array.isArray(cleanupTemplateIdsValue)
      ? cleanupTemplateIdsValue
        .map((item) => normalizeText(item))
        .filter(Boolean)
      : [],
    attemptEvidence: Array.isArray(attemptEvidenceValue)
      ? attemptEvidenceValue
        .flatMap((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return []
          const attempt = item as Record<string, unknown>
          const iteration = Number(attempt.iteration)
          if (!Number.isFinite(iteration) || iteration <= 0) return []
          return [{
            iteration: Math.floor(iteration),
            requestId: normalizeText(attempt.requestId ?? attempt.request_id) || null,
            routeInvocationId: normalizeText(attempt.routeInvocationId ?? attempt.route_invocation_id) || null,
            templateId: normalizeText(attempt.templateId ?? attempt.template_id) || null,
          }]
        })
      : [],
  }
}

function loadImportPressureEvidence(options: SpreadsheetMigrationLiveDiagnosticOptions): SpreadsheetImportPressureEvidence | null {
  if (options.importPressureEvidence !== undefined) {
    return normalizeImportPressureEvidence(options.importPressureEvidence)
  }
  const evidenceFile = normalizeText(options.importPressureEvidenceFile)
  if (!evidenceFile) return null
  try {
    return normalizeImportPressureEvidence(readJsonFile(evidenceFile))
  } catch {
    return null
  }
}

async function defaultArchiveImportPressureEvidence(
  evidenceFile: string,
  evidence: SpreadsheetImportPressureEvidence,
) {
  writeJsonFile(evidenceFile, evidence)
}

function buildGeneratedImportPressureEvidence(params: {
  diagnosticRunId: string
  projectId: string
  workbookFile: string
  iterations: number
  evidenceRef: string
  responses: SpreadsheetImportPressureUploadResponse[]
  cleanupResults: SpreadsheetImportedTemplateCleanupResult[]
  memoryBefore: NodeJS.MemoryUsage
  memoryAfter: NodeJS.MemoryUsage
  cpuBefore: NodeJS.CpuUsage
  cpuAfter: NodeJS.CpuUsage
  elapsedMs: number
}): SpreadsheetImportPressureEvidence {
  const cleanupTemplateIds = params.cleanupResults
    .filter((result) => result.success)
    .map((result) => normalizeText(result.templateId))
    .filter(Boolean)
  const cleanupTemplateIdSet = new Set(cleanupTemplateIds)
  const successfulTemplateIds = params.responses
    .filter(isSuccessfulImport)
    .map((response) => normalizeText(response.templateId))
    .filter(Boolean)

  return {
    schemaVersion: 'workbuddy-c18-l15-import-pressure-evidence/v1',
    reportCode: 'c18_l15_spreadsheet_import_pressure_evidence',
    evidenceKind: 'live_wbs_spreadsheet_import_pressure_runtime_observation',
    diagnosticRunId: params.diagnosticRunId,
    projectId: params.projectId,
    workbookFile: params.workbookFile,
    iterationCount: params.iterations,
    importRoutePath: '/api/planning/wbs-templates/import-excel',
    importRouteMethod: 'POST',
    environment: 'current-live',
    evidenceRef: params.evidenceRef,
    memoryObserved: true,
    cpuObserved: true,
    timeoutBudgetObserved: true,
    cleanupObserved: successfulTemplateIds.length > 0 &&
      successfulTemplateIds.every((templateId) => cleanupTemplateIdSet.has(templateId)),
    cleanupTemplateIds,
    attemptEvidence: params.responses.map((response, index) => ({
      iteration: index + 1,
      requestId: normalizeText(response.requestId) || `${params.diagnosticRunId}-request-${index + 1}`,
      routeInvocationId: normalizeText(response.routeInvocationId) || `${params.diagnosticRunId}-route-${index + 1}`,
      templateId: normalizeText(response.templateId) || null,
    })),
    runtimeObservation: {
      elapsedMs: roundMs(params.elapsedMs),
      timeoutBudgetMs: SPREADSHEET_IMPORT_TIMEOUT_BUDGET_MS,
      memoryBefore: params.memoryBefore,
      memoryAfter: params.memoryAfter,
      cpuBefore: params.cpuBefore,
      cpuAfter: params.cpuAfter,
    },
    cleanupAttempts: params.cleanupResults,
  } as SpreadsheetImportPressureEvidence
}

function evaluateMigrationReplayEvidence(
  evidenceFile: string,
  evidence: SpreadsheetMigrationReplayEvidence,
  expectedDiagnosticRunId?: string | null,
): SpreadsheetMigrationReplayDiagnosticCheck {
  const replayRunCount = Number(evidence.replayRunCount ?? 0)
  const hasFiniteReplayRunCount = Number.isFinite(replayRunCount)
  const idempotentReplay = evidence.idempotentReplay === true
  const environment = normalizeText(evidence.environment)
  const evidenceRef = normalizeText(evidence.evidenceRef)
  const diagnosticRunId = normalizeText((evidence as SpreadsheetMigrationReplayEvidence & { diagnosticRunId?: unknown; diagnostic_run_id?: unknown }).diagnosticRunId
    ?? (evidence as SpreadsheetMigrationReplayEvidence & { diagnostic_run_id?: unknown }).diagnostic_run_id)
  const status: DiagnosticStatus = evidence.status === 'pass'
    && idempotentReplay
    && hasFiniteReplayRunCount
    && replayRunCount >= 2
    && Boolean(environment)
    && Boolean(evidenceRef)
    && Boolean(diagnosticRunId)
    && (!expectedDiagnosticRunId || diagnosticRunId === expectedDiagnosticRunId)
    ? 'pass'
    : 'fail'

  return {
    status,
    evidenceFile,
    idempotentReplay,
    replayRunCount: Number.isFinite(replayRunCount) ? replayRunCount : null,
    environment: environment || null,
    evidenceRef: evidenceRef || null,
    ...(status === 'pass'
      ? {}
      : { reason: evidence.reason || 'Expected migration replay evidence with status=pass, idempotentReplay=true, finite replayRunCount >= 2, environment, evidenceRef, and diagnosticRunId.' }),
  }
}

export async function buildSpreadsheetMigrationLiveDiagnosticReport(
  options: SpreadsheetMigrationLiveDiagnosticOptions = {},
): Promise<SpreadsheetMigrationLiveDiagnosticReport> {
  const now = options.now ?? new Date()
  const startedAtIso = now.toISOString()
  const diagnosticRunId = normalizeText(options.diagnosticRunId) || createDefaultDiagnosticRunId(now)
  const allowWrite = options.allowWrite === true
  const baseUrl = normalizeText(options.baseUrl)
  const authToken = normalizeText(options.authToken)
  const projectId = normalizeText(options.projectId)
  const workbookFile = normalizeText(options.workbookFile)
  const migrationReplayEvidenceFile = normalizeText(options.migrationReplayEvidenceFile)
  const outputFile = normalizeText(options.outputFile)
  const iterations = normalizeIterations(options.iterations)
  const namePrefix = normalizeText(options.namePrefix) || 'C18L15'
  const templateType = normalizeText(options.templateType) || '住宅'
  const importPressureEvidenceFile = normalizeText(options.importPressureEvidenceFile)
  const hasExplicitImportPressureEvidence = options.importPressureEvidence !== undefined
  const importPressureEvidence = loadImportPressureEvidence(options)
  const importPressureRuntimeEvidenceGap = runtimeEvidenceGapFromImportPressureEvidence(importPressureEvidence, {
    projectId,
    workbookFile,
    iterations,
    diagnosticRunId,
  })
  const base = {
    reportCode: 'c18_l15_spreadsheet_migration_live_diagnostic' as const,
    evidenceKind: 'live_wbs_spreadsheet_import_and_migration_replay_probe' as const,
    generatedAt: now.toISOString(),
    environment: 'current-live' as const,
    diagnosticRunId,
    expectedDiagnosticRunId: diagnosticRunId,
    command: normalizeText(options.command) || 'npm run diagnose:spreadsheet-migration-live --workspace=server',
    exitCode: 1,
    artifactPath: outputFile || null,
    targetIds: {
      projectId: projectId || null,
      workbookFile: workbookFile || null,
    },
    startedAt: startedAtIso,
    finishedAt: new Date().toISOString(),
    cleanupReadback: {
      status: 'not_required' as const,
      reason: 'spreadsheet import diagnostic did not run because required live inputs were missing',
    },
    outputFile: outputFile || null,
    missingArchivedJson: !outputFile,
    liveEvidenceRequired: true as const,
    liveEvidenceRequiredReason: 'C-18.L15 requires a live/staging spreadsheet import pressure run against the WBS import API and archived migration replay evidence.',
    migrationReplayEvidenceRequired: true as const,
    migrationReplayEvidenceRequiredReason: 'The upload probe does not prove migration idempotence; archive a replay JSON showing at least two idempotent migration runs.',
    liveEvidenceChecklist: liveEvidenceChecklist(),
    allowWrite,
    baseUrl: baseUrl || null,
    projectId: projectId || null,
    workbookFileProvided: Boolean(workbookFile),
    iterations,
    importPressureEvidenceFile: importPressureEvidenceFile || null,
    migrationReplayEvidenceFile: migrationReplayEvidenceFile || null,
  }

  if (!allowWrite || !baseUrl || !authToken || !projectId || !workbookFile) {
    const missing = [
      !allowWrite ? '--allow-write' : null,
      !baseUrl ? '--base-url=<server>' : null,
      !authToken ? '--auth-token=<jwt>' : null,
      !projectId ? '--project-id=<project>' : null,
      !workbookFile ? '--workbook-file=<xlsx-or-csv>' : null,
    ].filter(Boolean).join(', ')
    const reason = `Missing ${missing}; live spreadsheet import diagnostic is intentionally blocked.`
    return {
      ...base,
      status: 'blocked',
      exitCode: 1,
      finishedAt: new Date().toISOString(),
      checks: {
        spreadsheetImportPressure: blockedSpreadsheetImportCheck(
          reason,
          importPressureEvidenceFile || null,
          importPressureRuntimeEvidenceGap,
        ),
        migrationReplayEvidence: blockedMigrationReplayEvidenceCheck(reason, migrationReplayEvidenceFile || null),
      },
    }
  }

  const uploadWorkbook = options.uploadWorkbook ?? defaultUploadWorkbook
  const archiveImportPressureEvidence = options.archiveImportPressureEvidence ?? defaultArchiveImportPressureEvidence
  const cleanupImportedTemplate = options.cleanupImportedTemplate ?? defaultCleanupImportedTemplate
  const startedAt = performance.now()
  const memoryBefore = process.memoryUsage()
  const cpuBefore = process.cpuUsage()
  const responses: SpreadsheetImportPressureUploadResponse[] = []
  for (let index = 0; index < iterations; index += 1) {
    const requestId = `${diagnosticRunId}-request-${index + 1}`
    const routeInvocationId = `${diagnosticRunId}-route-${index + 1}`
    try {
      responses.push(await uploadWorkbook({
        baseUrl,
        authToken,
        projectId,
        workbookFile,
        name: `${namePrefix}-${now.getTime()}-${index + 1}`,
        templateType,
        iteration: index + 1,
        diagnosticRunId,
        requestId,
        routeInvocationId,
      }))
    } catch (error) {
      responses.push({
        httpStatus: 0,
        success: false,
        templateId: null,
        nodeCount: null,
        errorCode: 'REQUEST_FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
        requestId,
        routeInvocationId,
      })
    }
  }
  const successCount = responses.filter(isSuccessfulImport).length
  const unexpectedFailureCount = responses.length - successCount
  const elapsedMs = roundMs(performance.now() - startedAt)
  const memoryAfter = process.memoryUsage()
  const cpuAfter = process.cpuUsage(cpuBefore)
  const cleanupResults: SpreadsheetImportedTemplateCleanupResult[] = []
  if (!hasExplicitImportPressureEvidence) {
    for (const templateId of responses
      .filter(isSuccessfulImport)
      .map((response) => normalizeText(response.templateId))
      .filter(Boolean)) {
      cleanupResults.push(await cleanupImportedTemplate({
        baseUrl,
        authToken,
        projectId,
        templateId,
        diagnosticRunId,
        namePrefix,
      }))
    }
  }
  let effectiveImportPressureEvidence = importPressureEvidence
  if (!hasExplicitImportPressureEvidence && importPressureEvidenceFile) {
    effectiveImportPressureEvidence = buildGeneratedImportPressureEvidence({
      diagnosticRunId,
      projectId,
      workbookFile,
      iterations,
      evidenceRef: importPressureEvidenceFile,
      responses,
      cleanupResults,
      memoryBefore,
      memoryAfter,
      cpuBefore,
      cpuAfter,
      elapsedMs,
    })
    await archiveImportPressureEvidence(importPressureEvidenceFile, effectiveImportPressureEvidence)
  }
  const effectiveImportPressureRuntimeEvidenceGap = runtimeEvidenceGapFromImportPressureEvidence(effectiveImportPressureEvidence, {
    projectId,
    workbookFile,
    iterations,
    diagnosticRunId,
  })
  const importedNodeCounts = responses
    .map((response) => response.nodeCount)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const totalImportedNodeCount = importedNodeCounts.length > 0
    ? importedNodeCounts.reduce((sum, count) => sum + count, 0)
    : null
  const responseEvidenceGap = importResponseEvidenceGap(responses, iterations, effectiveImportPressureEvidence)
  const combinedImportPressureRuntimeEvidenceGap = {
    missingMemoryObservation: effectiveImportPressureRuntimeEvidenceGap.missingMemoryObservation,
    missingCpuObservation: effectiveImportPressureRuntimeEvidenceGap.missingCpuObservation,
    missingTimeoutBudgetEvidence: effectiveImportPressureRuntimeEvidenceGap.missingTimeoutBudgetEvidence,
    missingCleanupEvidence: effectiveImportPressureRuntimeEvidenceGap.missingCleanupEvidence || responseEvidenceGap.missingCleanupEvidence,
    missingDiagnosticScopeEvidence: effectiveImportPressureRuntimeEvidenceGap.missingDiagnosticScopeEvidence,
    missingEvidenceMetadata: effectiveImportPressureRuntimeEvidenceGap.missingEvidenceMetadata,
    missingCreatedTemplateEvidence: responseEvidenceGap.missingCreatedTemplateEvidence,
    missingImportedNodeEvidence: responseEvidenceGap.missingImportedNodeEvidence,
    missingDiagnosticCorrelationEvidence: effectiveImportPressureRuntimeEvidenceGap.missingDiagnosticCorrelationEvidence || responseEvidenceGap.missingDiagnosticCorrelationEvidence,
  }
  const spreadsheetStatus: DiagnosticStatus = successCount === iterations && unexpectedFailureCount === 0
    && !hasRuntimeEvidenceGap(combinedImportPressureRuntimeEvidenceGap)
    ? 'pass'
    : 'fail'
  const spreadsheetImportPressure: SpreadsheetImportPressureDiagnosticCheck = {
    status: spreadsheetStatus,
    importPressureEvidenceFile: importPressureEvidenceFile || null,
    attemptCount: iterations,
    successCount,
    unexpectedFailureCount,
    elapsedMs,
    totalImportedNodeCount,
    averageElapsedMsPerAttempt: iterations > 0 ? roundMs(elapsedMs / iterations) : null,
    runtimeEvidenceGap: combinedImportPressureRuntimeEvidenceGap,
    responses,
    ...(spreadsheetStatus === 'pass'
      ? {}
      : { reason: successCount === iterations && unexpectedFailureCount === 0
          ? 'Import pressure runtime evidence is incomplete; provide memory, CPU, timeout budget, cleanup observations, environment, evidenceRef, diagnosticRunId, per-attempt request ids, created template ids and imported node counts.'
          : 'Expected every WBS spreadsheet import attempt to return a successful 2xx response.' }),
  }

  let migrationReplayEvidence: SpreadsheetMigrationReplayDiagnosticCheck
  if (!migrationReplayEvidenceFile) {
    migrationReplayEvidence = blockedMigrationReplayEvidenceCheck(
      'Missing --migration-replay-evidence-file=<archived-replay.json>; C-18.L15 cannot close without migration idempotence evidence.',
      null,
    )
  } else {
    try {
      const readEvidence = options.readMigrationReplayEvidence ?? defaultReadMigrationReplayEvidence
      migrationReplayEvidence = evaluateMigrationReplayEvidence(
        migrationReplayEvidenceFile,
        await readEvidence(migrationReplayEvidenceFile),
        diagnosticRunId,
      )
    } catch (error) {
      migrationReplayEvidence = {
        status: 'fail',
        evidenceFile: migrationReplayEvidenceFile,
        idempotentReplay: null,
        replayRunCount: null,
        environment: null,
        evidenceRef: null,
        reason: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const status: DiagnosticStatus = spreadsheetImportPressure.status === 'pass'
    && migrationReplayEvidence.status === 'pass'
    && Boolean(outputFile)
    ? 'pass'
    : 'fail'
  const successfulCleanupTemplateIds = cleanupResults
    .filter((result) => result.success)
    .map((result) => result.templateId)

  return {
    ...base,
    status,
    exitCode: status === 'pass' ? 0 : 1,
    finishedAt: new Date().toISOString(),
    cleanupReadback: cleanupResults.length > 0
      ? {
          status: cleanupResults.every((result) => result.success) ? 'pass' as const : 'fail' as const,
          cleanupTemplateIds: successfulCleanupTemplateIds,
          cleanupAttempts: cleanupResults,
        }
      : {
          status: 'not_required' as const,
          reason: 'no successful spreadsheet import templates were created during this diagnostic run',
        },
    checks: {
      spreadsheetImportPressure,
      migrationReplayEvidence,
    },
  }
}

export function shouldFailSpreadsheetMigrationLiveDiagnosticReport(
  report: SpreadsheetMigrationLiveDiagnosticReport,
) {
  return report.status !== 'pass'
    || report.checks.spreadsheetImportPressure.status !== 'pass'
    || report.checks.migrationReplayEvidence.status !== 'pass'
}

function parseStringArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : undefined
}

function parseNumberArg(args: string[], name: string) {
  const value = parseStringArg(args, name)
  return value ? normalizeIterations(value) : undefined
}

export function parseSpreadsheetMigrationLiveDiagnosticOptionsFromArgs(
  args: string[],
): Pick<
  SpreadsheetMigrationLiveDiagnosticOptions,
  'allowWrite' | 'baseUrl' | 'authToken' | 'projectId' | 'workbookFile' | 'iterations' | 'namePrefix' | 'importPressureEvidenceFile' | 'migrationReplayEvidenceFile' | 'outputFile' | 'diagnosticRunId'
> {
  return {
    allowWrite: args.includes('--allow-write'),
    baseUrl: parseStringArg(args, 'base-url'),
    authToken: parseStringArg(args, 'auth-token') ?? process.env.WORKBUDDY_LIVE_AUTH_TOKEN,
    projectId: parseStringArg(args, 'project-id'),
    workbookFile: parseStringArg(args, 'workbook-file'),
    iterations: parseNumberArg(args, 'iterations'),
    namePrefix: parseStringArg(args, 'name-prefix'),
    importPressureEvidenceFile: parseStringArg(args, 'import-pressure-evidence-file'),
    migrationReplayEvidenceFile: parseStringArg(args, 'migration-replay-evidence-file'),
    outputFile: parseStringArg(args, 'output-file'),
    diagnosticRunId: parseStringArg(args, 'diagnostic-run-id'),
  }
}

function writeReportIfRequested(report: SpreadsheetMigrationLiveDiagnosticReport) {
  if (!report.outputFile) return
  writeJsonFile(report.outputFile, report)
}

async function main() {
  const report = await buildSpreadsheetMigrationLiveDiagnosticReport(
    parseSpreadsheetMigrationLiveDiagnosticOptionsFromArgs(process.argv),
  )
  writeReportIfRequested(report)
  console.log(JSON.stringify(report, null, 2))
  if (shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)) {
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('diagnose-spreadsheet-migration-live.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
