import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import pg from 'pg'
import { query as rawQuery } from '../database.js'
import { readJsonFile, writeJsonFile } from './jsonEvidenceUtils.js'

type DiagnosticStatus = 'blocked' | 'pass' | 'fail'
type EvidenceStatus = 'missing' | 'pass' | 'fail'

export type AcceptanceStatusChangeRequest = {
  baseUrl: string
  authToken: string
  planId: string
  status: string
  expectedStatus?: string | null
  actualDate?: string | null
}

export type AcceptanceStatusChangeResponse = {
  httpStatus: number
  success: boolean
  errorCode: string | null
  errorMessage?: string | null
}

export type AcceptancePlanReadbackRequest = {
  baseUrl: string
  authToken: string
  planId: string
}

export type AcceptancePlanReadbackResponse = {
  httpStatus: number
  success: boolean
  status: string | null
  actualDate: string | null
  projectId: string | null
  errorCode: string | null
  errorMessage?: string | null
}

export type DisposableAcceptancePlanCreateRequest = {
  baseUrl: string
  authToken: string
  projectId: string
  now: Date
}

export type DisposableAcceptancePlanCreateResponse = {
  httpStatus: number
  success: boolean
  planId: string | null
  projectId: string | null
  status?: string | null
  errorCode: string | null
  errorMessage?: string | null
}

export type DisposableAcceptancePlanCleanupRequest = {
  baseUrl: string
  authToken: string
  planId: string
  projectId?: string | null
}

export type DisposableAcceptancePlanCleanupResponse = {
  httpStatus: number | null
  success: boolean
  errorCode: string | null
  errorMessage?: string | null
}

export type AcceptanceStatusChangeRequester = (
  request: AcceptanceStatusChangeRequest,
) => Promise<AcceptanceStatusChangeResponse>

export type AcceptancePlanReadbackRequester = (
  request: AcceptancePlanReadbackRequest,
) => Promise<AcceptancePlanReadbackResponse>

export type DisposableAcceptancePlanCreator = (
  request: DisposableAcceptancePlanCreateRequest,
) => Promise<DisposableAcceptancePlanCreateResponse>

export type DisposableAcceptancePlanCleanupRequester = (
  request: DisposableAcceptancePlanCleanupRequest,
) => Promise<DisposableAcceptancePlanCleanupResponse>

export type DisposableAcceptancePlanDirectCleanupExecutor = (
  planId: string,
  projectId: string | null,
) => Promise<{ rowCount: number | null }>

export type AcceptancePlanReadbackCheck = Omit<AcceptancePlanReadbackResponse, 'httpStatus' | 'status'> & {
  status: DiagnosticStatus
  httpStatus: number | null
  planStatus: string | null
  expectedStatus: string
  expectedActualDate: string | null
  expectedProjectId: string | null
  reason?: string
}

export type AcceptanceStatusConcurrencyCheck = {
  status: DiagnosticStatus
  attemptCount: 2
  successCount: number
  conflictCount: number
  unexpectedFailureCount: number
  elapsedMs: number | null
  responses: AcceptanceStatusChangeResponse[]
  finalPlanReadback: AcceptancePlanReadbackCheck
  reason?: string
}

export type AcceptanceStatusConcurrencyLiveDiagnosticReport = {
  reportCode: 'c18_l08_acceptance_status_concurrency_live_diagnostic'
  evidenceKind: 'live_http_concurrent_status_probe'
  generatedAt: string
  diagnosticRunId: string
  liveEvidenceRequired: true
  liveEvidenceRequiredReason: string
  liveEvidenceChecklist: string[]
  outputFile: string | null
  disposablePlanEvidenceFile: string | null
  disposablePlanEvidenceAssessment: DisposablePlanEvidenceAssessment
  createdDisposablePlan: boolean
  disposablePlanCleanup: {
    status: 'not_applicable' | 'pass' | 'fail'
    httpStatus: number | null
    errorCode: string | null
    errorMessage: string | null
    deletionReadback?: DisposablePlanDeletionReadbackCheck
  }
  runtimeEvidenceGap: {
    missingAllowWrite: boolean
    missingBaseUrl: boolean
    missingAuthToken: boolean
    missingPlanId: boolean
    missingDisposablePlanEvidence: boolean
    missingLiveConcurrentRun: boolean
    missingFinalPlanReadback: boolean
    missingArchivedJson: boolean
  }
  status: DiagnosticStatus
  allowWrite: boolean
  baseUrl: string | null
  projectId: string | null
  planId: string | null
  targetStatus: string
  actualDate: string | null
  checks: {
    concurrentStatusWrite: AcceptanceStatusConcurrencyCheck
  }
}

export type AcceptanceStatusConcurrencyLiveDiagnosticOptions = {
  now?: Date
  diagnosticRunId?: string | null
  allowWrite?: boolean
  baseUrl?: string | null
  authToken?: string | null
  projectId?: string | null
  planId?: string | null
  createDisposablePlan?: boolean
  status?: string | null
  actualDate?: string | null
  outputFile?: string | null
  disposablePlanEvidenceFile?: string | null
  disposablePlanEvidence?: unknown
  requestStatusChange?: AcceptanceStatusChangeRequester
  requestPlanReadback?: AcceptancePlanReadbackRequester
  createDisposableAcceptancePlan?: DisposableAcceptancePlanCreator
  cleanupDisposableAcceptancePlan?: DisposableAcceptancePlanCleanupRequester
  directCleanupDisposableAcceptancePlan?: DisposableAcceptancePlanDirectCleanupExecutor
}

export type DisposablePlanEvidenceAssessment = {
  evidenceFile: string | null
  status: EvidenceStatus
  planIdMatches: boolean
  createdProjectIdMatches: boolean
  disposable: boolean
  cleanupEvidencePresent: boolean
  diagnosticRunId: string | null
  diagnosticRunIdPresent: boolean
  diagnosticRunIdMatches: boolean
  routeInvocationId: string | null
  requestId: string | null
  requestCorrelationPresent: boolean
  environment: string | null
  evidenceRef: string | null
  missingEvidenceMetadata: boolean
  missingSignals: string[]
}

export type DisposablePlanDeletionReadbackCheck = {
  attempted: boolean
  status: 'pass' | 'fail'
  httpStatus: number | null
  success: boolean
  planStillReadable: boolean
  errorCode: string | null
  errorMessage?: string | null
}

const DEFAULT_TARGET_STATUS = 'preparing'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeOptionalPath(value: unknown) {
  return normalizeText(value).replace(/\\/g, '/')
}

function createDefaultDiagnosticRunId(now: Date) {
  return `c18-l08-${now.toISOString().replace(/[^0-9A-Za-z]+/g, '-')}`
}

function readEvidenceJson(path: string) {
  if (isAbsolute(path) || existsSync(path)) return readJsonFile(path)
  const workspaceRelativePath = resolve('..', path)
  return readJsonFile(existsSync(workspaceRelativePath) ? workspaceRelativePath : path)
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function liveEvidenceChecklist() {
  return [
    'Run against a real DB/API environment using a disposable acceptance plan.',
    'Send two concurrent status writes to the same plan and require one stale-write conflict.',
    'Read back the final acceptance plan state after the race.',
    'Verify no illegal status jump, lost update, or stale actual date survived.',
    'Archive the full JSON diagnostic output before closing C-18.L08.',
  ]
}

function runtimeEvidenceGap(input: {
  allowWrite: boolean
  baseUrl: string
  authToken: string
  planId: string
  outputFile: string
  disposablePlanEvidenceAssessment?: DisposablePlanEvidenceAssessment
  liveConcurrentRunCompleted?: boolean
  finalPlanReadbackCompleted?: boolean
}) {
  return {
    missingAllowWrite: !input.allowWrite,
    missingBaseUrl: !input.baseUrl,
    missingAuthToken: !input.authToken,
    missingPlanId: !input.planId,
    missingDisposablePlanEvidence: input.disposablePlanEvidenceAssessment?.status !== 'pass',
    missingLiveConcurrentRun: input.liveConcurrentRunCompleted !== true,
    missingFinalPlanReadback: input.finalPlanReadbackCompleted !== true,
    missingArchivedJson: !input.outputFile,
  }
}

function normalizeDisposablePlanEvidence(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

function loadDisposablePlanEvidence(options: AcceptanceStatusConcurrencyLiveDiagnosticOptions) {
  if (options.disposablePlanEvidence !== undefined) return normalizeDisposablePlanEvidence(options.disposablePlanEvidence)
  const evidenceFile = normalizeOptionalPath(options.disposablePlanEvidenceFile)
  if (!evidenceFile) return {}
  return normalizeDisposablePlanEvidence(readEvidenceJson(evidenceFile))
}

function readNestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function assessDisposablePlanEvidence(params: {
  evidenceFile: string | null
  evidence: Record<string, unknown>
  planId: string
  diagnosticRunId: string
  expectedProjectId?: string | null
}): DisposablePlanEvidenceAssessment {
  if (Object.keys(params.evidence).length === 0) {
    return {
      evidenceFile: params.evidenceFile,
      status: 'missing',
      planIdMatches: false,
      createdProjectIdMatches: false,
      disposable: false,
      cleanupEvidencePresent: false,
      diagnosticRunId: null,
      diagnosticRunIdPresent: false,
      diagnosticRunIdMatches: false,
      routeInvocationId: null,
      requestId: null,
      requestCorrelationPresent: false,
      environment: null,
      evidenceRef: null,
      missingEvidenceMetadata: true,
      missingSignals: ['plan_id_match', 'disposable_plan', 'cleanup_evidence', 'diagnostic_run_id', 'route_correlation', 'evidence_metadata'],
    }
  }

  const cleanup = readNestedRecord(params.evidence, 'cleanup')
  const planId = normalizeText(params.evidence.planId ?? params.evidence.plan_id)
  const createdProjectId = normalizeText(params.evidence.projectId ?? params.evidence.project_id)
  const createdForDiagnostic = normalizeText(params.evidence.createdForDiagnostic ?? params.evidence.created_for_diagnostic)
  const diagnosticRunId = normalizeText(params.evidence.diagnosticRunId ?? params.evidence.diagnostic_run_id)
  const routeInvocationId = normalizeText(params.evidence.routeInvocationId ?? params.evidence.route_invocation_id)
  const requestId = normalizeText(params.evidence.requestId ?? params.evidence.request_id)
  const environment = normalizeText(params.evidence.environment)
  const evidenceRef = normalizeText(params.evidence.evidenceRef ?? params.evidence.evidence_ref)
  const cleanupStatus = normalizeText(cleanup.status ?? params.evidence.cleanupStatus ?? params.evidence.cleanup_status).toLowerCase()
  const cleanupStrategy = normalizeText(cleanup.strategy ?? params.evidence.cleanupStrategy ?? params.evidence.cleanup_strategy)
  const planIdMatches = Boolean(params.planId && planId === params.planId)
  const createdProjectIdMatches = params.expectedProjectId
    ? createdProjectId === params.expectedProjectId
    : true
  const disposable = params.evidence.disposable === true
    || params.evidence.isDisposable === true
    || normalizeText(params.evidence.kind).toLowerCase() === 'disposable'
  const cleanupEvidencePresent = cleanupStatus === 'pass' && Boolean(cleanupStrategy)
  const diagnosticMatches = createdForDiagnostic === 'C-18.L08'
  const diagnosticRunIdPresent = Boolean(diagnosticRunId)
  const diagnosticRunIdMatches = Boolean(params.diagnosticRunId && diagnosticRunId === params.diagnosticRunId)
  const requestCorrelationPresent = Boolean(routeInvocationId && requestId)
  const missingEvidenceMetadata = !environment || !evidenceRef
  const missingSignals = [
    planIdMatches ? null : 'plan_id_match',
    createdProjectIdMatches ? null : 'created_project_id_match',
    disposable ? null : 'disposable_plan',
    cleanupEvidencePresent ? null : 'cleanup_evidence',
    diagnosticMatches ? null : 'diagnostic_scope',
    diagnosticRunIdPresent && diagnosticRunIdMatches ? null : 'diagnostic_run_id',
    requestCorrelationPresent ? null : 'route_correlation',
    missingEvidenceMetadata ? 'evidence_metadata' : null,
  ].filter((signal): signal is string => Boolean(signal))

  return {
    evidenceFile: params.evidenceFile,
    status: missingSignals.length === 0 ? 'pass' : 'fail',
    planIdMatches,
    createdProjectIdMatches,
    disposable,
    cleanupEvidencePresent,
    diagnosticRunId: diagnosticRunId || null,
    diagnosticRunIdPresent,
    diagnosticRunIdMatches,
    routeInvocationId: routeInvocationId || null,
    requestId: requestId || null,
    requestCorrelationPresent,
    environment: environment || null,
    evidenceRef: evidenceRef || null,
    missingEvidenceMetadata,
    missingSignals,
  }
}

function blockedPlanReadback(
  reason: string,
  expectedStatus = DEFAULT_TARGET_STATUS,
  expectedActualDate: string | null = null,
  expectedProjectId: string | null = null,
): AcceptancePlanReadbackCheck {
  return {
    status: 'blocked',
    httpStatus: null,
    success: false,
    planStatus: null,
    expectedStatus,
    actualDate: null,
    expectedActualDate,
    expectedProjectId,
    projectId: null,
    errorCode: null,
    reason,
  }
}

function blockedCheck(
  reason: string,
  expectedStatus = DEFAULT_TARGET_STATUS,
  expectedActualDate: string | null = null,
): AcceptanceStatusConcurrencyCheck {
  return {
    status: 'blocked',
    attemptCount: 2,
    successCount: 0,
    conflictCount: 0,
    unexpectedFailureCount: 0,
    elapsedMs: null,
    responses: [],
    finalPlanReadback: blockedPlanReadback(reason, expectedStatus, expectedActualDate),
    reason,
  }
}

async function defaultRequestStatusChange(
  request: AcceptanceStatusChangeRequest,
): Promise<AcceptanceStatusChangeResponse> {
  const response = await fetch(
    `${trimTrailingSlash(request.baseUrl)}/api/acceptance-plans/${encodeURIComponent(request.planId)}/status`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${request.authToken}`,
      },
      body: JSON.stringify({
        status: request.status,
        ...(request.expectedStatus ? { expected_status: request.expectedStatus } : {}),
        ...(request.actualDate !== undefined ? { actual_date: request.actualDate } : {}),
      }),
    },
  )

  let body: any = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  return {
    httpStatus: response.status,
    success: Boolean(body?.success ?? response.ok),
    errorCode: normalizeText(body?.error?.code) || null,
    errorMessage: normalizeText(body?.error?.message) || null,
  }
}

async function defaultRequestPlanReadback(
  request: AcceptancePlanReadbackRequest,
): Promise<AcceptancePlanReadbackResponse> {
  const response = await fetch(
    `${trimTrailingSlash(request.baseUrl)}/api/acceptance-plans/${encodeURIComponent(request.planId)}`,
    {
      method: 'GET',
      headers: {
        authorization: `Bearer ${request.authToken}`,
      },
    },
  )

  let body: any = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  return {
    httpStatus: response.status,
    success: Boolean(body?.success ?? response.ok),
    status: normalizeText(body?.data?.status) || null,
    actualDate: normalizeText(body?.data?.actual_date) || null,
    projectId: normalizeText(body?.data?.project_id) || null,
    errorCode: normalizeText(body?.error?.code) || null,
    errorMessage: normalizeText(body?.error?.message) || null,
  }
}

async function defaultCreateDisposableAcceptancePlan(
  request: DisposableAcceptancePlanCreateRequest,
): Promise<DisposableAcceptancePlanCreateResponse> {
  const dateKey = request.now.toISOString().slice(0, 10)
  const response = await fetch(`${trimTrailingSlash(request.baseUrl)}/api/acceptance-plans`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${request.authToken}`,
    },
    body: JSON.stringify({
      project_id: request.projectId,
      acceptance_name: `C-18.L08 disposable acceptance plan ${request.now.getTime()}`,
      acceptance_type: '其他',
      planned_date: dateKey,
      status: 'draft',
      notes: 'createdForDiagnostic=C-18.L08; disposable=true',
    }),
  })

  let body: any = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  return {
    httpStatus: response.status,
    success: Boolean(body?.success ?? response.ok),
    planId: normalizeText(body?.data?.id) || null,
    projectId: normalizeText(body?.data?.project_id) || request.projectId || null,
    status: normalizeText(body?.data?.status) || 'draft',
    errorCode: normalizeText(body?.error?.code) || null,
    errorMessage: normalizeText(body?.error?.message) || null,
  }
}

async function defaultCleanupDisposableAcceptancePlan(
  request: DisposableAcceptancePlanCleanupRequest,
  directCleanup: DisposableAcceptancePlanDirectCleanupExecutor = defaultDirectCleanupDisposableAcceptancePlan,
): Promise<DisposableAcceptancePlanCleanupResponse> {
  try {
    const result = await directCleanup(request.planId, request.projectId ?? null)
    return {
      httpStatus: 200,
      success: Number(result.rowCount ?? 0) > 0,
      errorCode: Number(result.rowCount ?? 0) > 0 ? null : 'DISPOSABLE_PLAN_NOT_DELETED',
      errorMessage: Number(result.rowCount ?? 0) > 0 ? null : 'No disposable C-18.L08 acceptance plan matched the cleanup guard.',
    }
  } catch (error) {
    return {
      httpStatus: null,
      success: false,
      errorCode: 'DISPOSABLE_PLAN_DIRECT_CLEANUP_FAILED',
      errorMessage: error instanceof Error ? error.message : String(error),
    }
  }
}

async function defaultDirectCleanupDisposableAcceptancePlan(
  planId: string,
  projectId: string | null,
): Promise<{ rowCount: number | null }> {
  const migrationCleanupUrl = normalizeDiagnosticCleanupConnectionString(
    process.env.WORKBUDDY_DIAGNOSTIC_CLEANUP_DATABASE_URL
      ?? process.env.SUPABASE_MIGRATION_URL,
  )
  if (migrationCleanupUrl) {
    const client = new pg.Client({
      connectionString: migrationCleanupUrl,
      ssl: { rejectUnauthorized: false },
    })
    try {
      await client.connect()
      const result = await client.query(
        `DELETE FROM acceptance_plans
          WHERE id = $1
            AND project_id = $2
            AND notes LIKE '%createdForDiagnostic=C-18.L08%'
            AND notes LIKE '%disposable=true%'`,
        [planId, projectId],
      )
      return { rowCount: result.rowCount ?? 0 }
    } finally {
      await client.end().catch(() => undefined)
    }
  }

  const result = await rawQuery(
    `DELETE FROM acceptance_plans
      WHERE id = $1
        AND project_id = $2
        AND notes LIKE '%createdForDiagnostic=C-18.L08%'
        AND notes LIKE '%disposable=true%'`,
    [planId, projectId],
  )
  return { rowCount: result.rowCount ?? 0 }
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

function evaluatePlanReadback(
  response: AcceptancePlanReadbackResponse,
  expectedStatus: string,
  expectedActualDate: string | null,
  expectedProjectId: string | null,
): AcceptancePlanReadbackCheck {
  const planStatus = normalizeText(response.status) || null
  const actualDate = normalizeText(response.actualDate) || null
  const projectId = normalizeText(response.projectId) || null
  const reasons: string[] = []
  if (!response.success || response.httpStatus < 200 || response.httpStatus >= 300) {
    reasons.push('final_plan_http_readback_failed')
  }
  if (!planStatus) reasons.push('final_plan_status_missing')
  if (planStatus && planStatus !== expectedStatus) reasons.push('final_plan_status_mismatch')
  if (expectedActualDate !== null && actualDate !== expectedActualDate) {
    reasons.push('final_plan_actual_date_mismatch')
  }
  if (expectedProjectId !== null && projectId !== expectedProjectId) {
    reasons.push('final_plan_project_id_mismatch')
  }

  return {
    status: reasons.length === 0 ? 'pass' : 'fail',
    httpStatus: response.httpStatus,
    success: response.success,
    planStatus,
    expectedStatus,
    actualDate,
    expectedActualDate,
    expectedProjectId,
    projectId,
    errorCode: response.errorCode,
    ...(response.errorMessage ? { errorMessage: response.errorMessage } : {}),
    ...(reasons.length > 0 ? { reason: reasons.join(',') } : {}),
  }
}

async function verifyDisposablePlanDeleted(
  requestPlanReadback: AcceptancePlanReadbackRequester,
  request: AcceptancePlanReadbackRequest,
): Promise<DisposablePlanDeletionReadbackCheck> {
  try {
    const response = await requestPlanReadback(request)
    const planStillReadable = response.success && response.httpStatus >= 200 && response.httpStatus < 300
    const deletedHttpStatus = response.httpStatus === 404 || response.httpStatus === 410
    const deletedByProjectScopeMiss = response.httpStatus === 400
      && response.errorCode === 'BAD_REQUEST'
      && !response.status
      && !response.projectId
    return {
      attempted: true,
      status: !planStillReadable && (deletedHttpStatus || deletedByProjectScopeMiss) ? 'pass' : 'fail',
      httpStatus: response.httpStatus,
      success: response.success,
      planStillReadable,
      errorCode: response.errorCode,
      ...(response.errorMessage ? { errorMessage: response.errorMessage } : {}),
    }
  } catch (error) {
    return {
      attempted: true,
      status: 'fail',
      httpStatus: null,
      success: false,
      planStillReadable: false,
      errorCode: 'DISPOSABLE_PLAN_DELETION_READBACK_FAILED',
      errorMessage: error instanceof Error ? error.message : String(error),
    }
  }
}

async function requestAndEvaluatePlanReadback(
  requestPlanReadback: AcceptancePlanReadbackRequester,
  request: AcceptancePlanReadbackRequest,
  expectedStatus: string,
  expectedActualDate: string | null,
  expectedProjectId: string | null,
): Promise<AcceptancePlanReadbackCheck> {
  try {
    const response = await requestPlanReadback(request)
    return evaluatePlanReadback(response, expectedStatus, expectedActualDate, expectedProjectId)
  } catch (error) {
    return {
      ...blockedPlanReadback(
        error instanceof Error ? error.message : String(error),
        expectedStatus,
        expectedActualDate,
        expectedProjectId,
      ),
      status: 'fail',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

function isAcceptanceStatusConflict(response: AcceptanceStatusChangeResponse) {
  return response.httpStatus === 409 && response.errorCode === 'ACCEPTANCE_STATUS_CONFLICT'
}

export async function buildAcceptanceStatusConcurrencyLiveDiagnosticReport(
  options: AcceptanceStatusConcurrencyLiveDiagnosticOptions = {},
): Promise<AcceptanceStatusConcurrencyLiveDiagnosticReport> {
  const now = options.now ?? new Date()
  const diagnosticRunId = normalizeText(options.diagnosticRunId) || createDefaultDiagnosticRunId(now)
  const allowWrite = options.allowWrite === true
  const baseUrl = normalizeText(options.baseUrl)
  const authToken = normalizeText(options.authToken)
  const projectId = normalizeText(options.projectId)
  let planId = normalizeText(options.planId)
  let expectedStatusForWrite: string | null = null
  const createDisposablePlan = options.createDisposablePlan === true
  const targetStatus = normalizeText(options.status) || DEFAULT_TARGET_STATUS
  const actualDate = normalizeText(options.actualDate) || null
  const outputFile = normalizeOptionalPath(options.outputFile)
  const disposablePlanEvidenceFile = normalizeOptionalPath(options.disposablePlanEvidenceFile)
  let createdDisposablePlan = false
  let disposablePlanCleanup: AcceptanceStatusConcurrencyLiveDiagnosticReport['disposablePlanCleanup'] = {
    status: 'not_applicable',
    httpStatus: null,
    errorCode: null,
    errorMessage: null,
  }
  const shouldLoadDisposablePlanEvidence = !(createDisposablePlan && !planId && options.disposablePlanEvidence === undefined)
  let disposablePlanEvidenceAssessment = assessDisposablePlanEvidence({
    evidenceFile: disposablePlanEvidenceFile || null,
    evidence: shouldLoadDisposablePlanEvidence ? loadDisposablePlanEvidence(options) : {},
    planId,
    diagnosticRunId,
    expectedProjectId: projectId || null,
  })
  const buildBase = () => ({
    reportCode: 'c18_l08_acceptance_status_concurrency_live_diagnostic' as const,
    evidenceKind: 'live_http_concurrent_status_probe' as const,
    generatedAt: now.toISOString(),
    diagnosticRunId,
    liveEvidenceRequired: true as const,
    liveEvidenceRequiredReason: 'C-18.L08 requires a real HTTP/API concurrent status probe against a disposable acceptance plan plus archived JSON output.',
    liveEvidenceChecklist: liveEvidenceChecklist(),
    outputFile: outputFile || null,
    disposablePlanEvidenceFile: disposablePlanEvidenceFile || null,
    disposablePlanEvidenceAssessment,
    createdDisposablePlan,
    disposablePlanCleanup,
    runtimeEvidenceGap: runtimeEvidenceGap({
      allowWrite,
      baseUrl,
      authToken,
      planId,
      outputFile,
      disposablePlanEvidenceAssessment,
    }),
    allowWrite,
    baseUrl: baseUrl || null,
    projectId: projectId || null,
    planId: planId || null,
    targetStatus,
    actualDate,
  })

  if (!allowWrite || !baseUrl || !authToken || (!planId && (!createDisposablePlan || !projectId))) {
    const missing = [
      !allowWrite ? '--allow-write' : null,
      !baseUrl ? '--base-url=<server>' : null,
      !authToken ? '--auth-token=<jwt>' : null,
      !planId && createDisposablePlan && !projectId ? '--project-id=<project>' : null,
      !planId && !createDisposablePlan ? '--plan-id=<acceptance-plan>' : null,
    ].filter(Boolean).join(', ')
    return {
      ...buildBase(),
      status: 'blocked',
      checks: {
        concurrentStatusWrite: blockedCheck(
          `Missing ${missing}; live probe is intentionally blocked.`,
          targetStatus,
          actualDate,
        ),
      },
    }
  }

  if (!outputFile) {
    return {
      ...buildBase(),
      status: 'blocked',
      checks: {
        concurrentStatusWrite: blockedCheck(
          'Archive the full diagnostic JSON with --output-file before closing C-18.L08.',
          targetStatus,
          actualDate,
        ),
      },
    }
  }

  if (createDisposablePlan && !planId) {
    try {
      const createPlan = options.createDisposableAcceptancePlan ?? defaultCreateDisposableAcceptancePlan
      const created = await createPlan({
        baseUrl,
        authToken,
        projectId,
        now,
      })
      if (!created.success || created.httpStatus < 200 || created.httpStatus >= 300 || !created.planId) {
        return {
          ...buildBase(),
          status: 'fail',
          checks: {
            concurrentStatusWrite: blockedCheck(
              created.errorMessage || created.errorCode || 'Failed to create disposable acceptance plan for C-18.L08.',
              targetStatus,
              actualDate,
            ),
          },
        }
      }
      planId = created.planId
      expectedStatusForWrite = normalizeText(created.status) || 'draft'
      createdDisposablePlan = true
      if (created.projectId !== projectId) {
        try {
          const cleanupPlan = options.cleanupDisposableAcceptancePlan ?? defaultCleanupDisposableAcceptancePlan
          const cleanupResult = await cleanupPlan({ baseUrl, authToken, planId, projectId: created.projectId })
          const deletionReadback = await verifyDisposablePlanDeleted(
            options.requestPlanReadback ?? defaultRequestPlanReadback,
            { baseUrl, authToken, planId },
          )
          disposablePlanCleanup = {
            status: cleanupResult.success && cleanupResult.httpStatus !== null && cleanupResult.httpStatus >= 200 && cleanupResult.httpStatus < 300 && deletionReadback.status === 'pass'
              ? 'pass'
              : 'fail',
            httpStatus: cleanupResult.httpStatus,
            errorCode: cleanupResult.errorCode,
            errorMessage: cleanupResult.errorMessage ?? null,
            deletionReadback,
          }
        } catch (error) {
          disposablePlanCleanup = {
            status: 'fail',
            httpStatus: null,
            errorCode: 'DISPOSABLE_PLAN_CLEANUP_FAILED',
            errorMessage: error instanceof Error ? error.message : String(error),
          }
        }
        const disposableEvidence = {
          planId,
          projectId: created.projectId,
          disposable: true,
          createdForDiagnostic: 'C-18.L08',
          diagnosticRunId,
          routeInvocationId: `create-disposable-plan:${diagnosticRunId}`,
          requestId: `create-disposable-plan:${diagnosticRunId}`,
          environment: 'live_http_probe',
          evidenceRef: disposablePlanEvidenceFile || outputFile,
          cleanup: {
            strategy: 'direct guarded DELETE acceptance_plans for C-18.L08 disposable plan',
            status: disposablePlanCleanup.status,
          },
        }
        if (disposablePlanEvidenceFile) writeJsonFile(disposablePlanEvidenceFile, disposableEvidence)
        disposablePlanEvidenceAssessment = assessDisposablePlanEvidence({
          evidenceFile: disposablePlanEvidenceFile || null,
          evidence: disposableEvidence,
          planId,
          diagnosticRunId,
          expectedProjectId: projectId,
        })
        return {
          ...buildBase(),
          runtimeEvidenceGap: runtimeEvidenceGap({
            allowWrite,
            baseUrl,
            authToken,
            planId,
            outputFile,
            disposablePlanEvidenceAssessment,
          }),
          status: 'fail',
          checks: {
            concurrentStatusWrite: blockedCheck(
              'Created disposable acceptance plan project mismatch; cleanup completed before concurrent writes.',
              targetStatus,
              actualDate,
            ),
          },
        }
      }
    } catch (error) {
      return {
        ...buildBase(),
        status: 'fail',
        checks: {
          concurrentStatusWrite: blockedCheck(
            error instanceof Error ? error.message : String(error),
            targetStatus,
            actualDate,
          ),
        },
      }
    }
  }

  if (!planId) {
    return {
      ...buildBase(),
      status: 'blocked',
      checks: {
        concurrentStatusWrite: blockedCheck(
          'Pass --plan-id=<acceptance-plan> or --create-disposable-plan with --project-id=<project>.',
          targetStatus,
          actualDate,
        ),
      },
    }
  }

  const requestStatusChange = options.requestStatusChange ?? defaultRequestStatusChange
  const requestPlanReadback = options.requestPlanReadback ?? defaultRequestPlanReadback
  const request = {
    baseUrl,
    authToken,
    planId,
    status: targetStatus,
    expectedStatus: expectedStatusForWrite,
    actualDate,
  }
  const readbackRequest = { baseUrl, authToken, planId }
  const startedAt = performance.now()
  const settled = await Promise.allSettled([
    requestStatusChange(request),
    requestStatusChange(request),
  ])
  const responses = settled.map((result): AcceptanceStatusChangeResponse =>
    result.status === 'fulfilled'
      ? result.value
      : {
        httpStatus: 0,
        success: false,
        errorCode: 'REQUEST_FAILED',
        errorMessage: result.reason instanceof Error ? result.reason.message : String(result.reason),
      },
  )
  const successCount = responses.filter((response) => response.success && response.httpStatus >= 200 && response.httpStatus < 300).length
  const conflictCount = responses.filter(isAcceptanceStatusConflict).length
  const unexpectedFailureCount = responses.length - successCount - conflictCount
  const finalPlanReadback = await requestAndEvaluatePlanReadback(
    requestPlanReadback,
    readbackRequest,
    targetStatus,
    actualDate,
    projectId || null,
  )
  if (createdDisposablePlan) {
    try {
      const cleanupPlan = options.cleanupDisposableAcceptancePlan ?? defaultCleanupDisposableAcceptancePlan
      const cleanupResult = await cleanupPlan({ baseUrl, authToken, planId, projectId })
      const deletionReadback = await verifyDisposablePlanDeleted(
        requestPlanReadback,
        readbackRequest,
      )
      disposablePlanCleanup = {
        status: cleanupResult.success && cleanupResult.httpStatus !== null && cleanupResult.httpStatus >= 200 && cleanupResult.httpStatus < 300 && deletionReadback.status === 'pass'
          ? 'pass'
          : 'fail',
        httpStatus: cleanupResult.httpStatus,
        errorCode: cleanupResult.errorCode,
        errorMessage: cleanupResult.errorMessage ?? null,
        deletionReadback,
      }
    } catch (error) {
      disposablePlanCleanup = {
        status: 'fail',
        httpStatus: null,
        errorCode: 'DISPOSABLE_PLAN_CLEANUP_FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
      }
    }
    const disposableEvidence = {
      planId,
      projectId,
      disposable: true,
      createdForDiagnostic: 'C-18.L08',
      diagnosticRunId,
      routeInvocationId: `create-disposable-plan:${diagnosticRunId}`,
      requestId: `create-disposable-plan:${diagnosticRunId}`,
      environment: 'live_http_probe',
      evidenceRef: disposablePlanEvidenceFile || outputFile,
      cleanup: {
        strategy: 'direct guarded DELETE acceptance_plans for C-18.L08 disposable plan',
        status: disposablePlanCleanup.status,
      },
    }
    if (disposablePlanEvidenceFile) writeJsonFile(disposablePlanEvidenceFile, disposableEvidence)
    disposablePlanEvidenceAssessment = assessDisposablePlanEvidence({
      evidenceFile: disposablePlanEvidenceFile || null,
      evidence: disposableEvidence,
      planId,
      diagnosticRunId,
      expectedProjectId: projectId || null,
    })
  }
  const status: DiagnosticStatus = successCount === 1
    && conflictCount === 1
    && unexpectedFailureCount === 0
    && finalPlanReadback.status === 'pass'
    && disposablePlanEvidenceAssessment.status === 'pass'
    && Boolean(outputFile)
    ? 'pass'
    : 'fail'

  return {
    ...buildBase(),
    runtimeEvidenceGap: runtimeEvidenceGap({
      allowWrite,
      baseUrl,
      authToken,
      planId,
      outputFile,
      disposablePlanEvidenceAssessment,
      liveConcurrentRunCompleted: responses.length === 2,
      finalPlanReadbackCompleted: finalPlanReadback.status !== 'blocked',
    }),
    status,
    checks: {
      concurrentStatusWrite: {
        status,
        attemptCount: 2,
        successCount,
        conflictCount,
        unexpectedFailureCount,
        elapsedMs: roundMs(performance.now() - startedAt),
        responses,
        finalPlanReadback,
        ...(status === 'pass'
          ? {}
          : {
              reason: successCount === 1 && conflictCount === 1 && unexpectedFailureCount === 0
                ? finalPlanReadback.status !== 'pass'
                  ? 'Expected final acceptance plan readback to match the target status after concurrent writes.'
                  : disposablePlanEvidenceAssessment.status !== 'pass'
                    ? 'Expected disposable plan evidence to match the probed plan and include cleanup proof, environment, and evidenceRef.'
                    : 'Archive the full diagnostic JSON with --output-file before closing C-18.L08.'
                : 'Expected exactly one successful status write and one ACCEPTANCE_STATUS_CONFLICT stale-write response.',
            }),
      },
    },
  }
}

export function shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(
  report: AcceptanceStatusConcurrencyLiveDiagnosticReport,
) {
  return report.status !== 'pass' || report.checks.concurrentStatusWrite.status !== 'pass'
}

function parseStringArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : undefined
}

export function parseAcceptanceStatusConcurrencyLiveDiagnosticOptionsFromArgs(
  args: string[],
): Pick<AcceptanceStatusConcurrencyLiveDiagnosticOptions, 'allowWrite' | 'baseUrl' | 'authToken' | 'projectId' | 'planId' | 'createDisposablePlan' | 'status' | 'actualDate' | 'outputFile' | 'disposablePlanEvidenceFile' | 'diagnosticRunId'> {
  return {
    allowWrite: args.includes('--allow-write'),
    baseUrl: parseStringArg(args, 'base-url'),
    authToken: parseStringArg(args, 'auth-token') ?? process.env.WORKBUDDY_LIVE_AUTH_TOKEN,
    projectId: parseStringArg(args, 'project-id'),
    planId: parseStringArg(args, 'plan-id'),
    createDisposablePlan: args.includes('--create-disposable-plan'),
    status: parseStringArg(args, 'status'),
    actualDate: parseStringArg(args, 'actual-date'),
    outputFile: parseStringArg(args, 'output-file'),
    disposablePlanEvidenceFile: parseStringArg(args, 'disposable-plan-evidence-file'),
    diagnosticRunId: parseStringArg(args, 'diagnostic-run-id'),
  }
}

function writeReportIfRequested(report: AcceptanceStatusConcurrencyLiveDiagnosticReport) {
  if (!report.outputFile) return
  writeJsonFile(report.outputFile, report)
}

async function main() {
  const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport(
    parseAcceptanceStatusConcurrencyLiveDiagnosticOptionsFromArgs(process.argv),
  )
  writeReportIfRequested(report)
  console.log(JSON.stringify(report, null, 2))
  if (shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)) {
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('diagnose-acceptance-status-concurrency-live.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
