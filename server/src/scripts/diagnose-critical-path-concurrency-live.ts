import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { closeDatabasePool, getClient } from '../database.js'
import { readJsonFile, writeJsonFile } from './jsonEvidenceUtils.js'

type DiagnosticStatus = 'blocked' | 'pass' | 'fail'
type LockTelemetryStatus = 'pass' | 'fail' | 'missing'

export type CriticalPathSweepRequest = {
  projectId: string
}

export type CriticalPathSweepResponse = {
  scannedProjects?: number
  refreshedProjects?: number
  failedProjects?: number
  skippedProjects?: number
  failures?: unknown[]
} | null

export type CriticalPathRouteRefreshRequest = {
  baseUrl: string
  authToken: string
  projectId: string
}

export type CriticalPathRouteRefreshResponse = {
  httpStatus: number
  success: boolean
  projectId?: string | null
  taskCount?: number | null
  criticalTaskCount?: number | null
  projectDurationDays?: number | null
  errorCode: string | null
  errorMessage?: string | null
}

export type CriticalPathFinalProjectionReadbackRequest = CriticalPathRouteRefreshRequest

export type CriticalPathFinalProjectionReadbackResponse = {
  httpStatus: number
  success: boolean
  projectId?: string | null
  taskCount: number | null
  criticalTaskCount: number | null
  projectedFloatTaskCount: number | null
  projectDurationDays: number | null
  networkLineagePresent: boolean
  calculationStatus: string | null
  errorCode: string | null
  errorMessage?: string | null
}

export type CriticalPathSweepRunner = (
  request: CriticalPathSweepRequest,
) => Promise<CriticalPathSweepResponse>

export type CriticalPathRouteRefreshRequester = (
  request: CriticalPathRouteRefreshRequest,
) => Promise<CriticalPathRouteRefreshResponse>

export type CriticalPathFinalProjectionReadbackRequester = (
  request: CriticalPathFinalProjectionReadbackRequest,
) => Promise<CriticalPathFinalProjectionReadbackResponse>

export type CriticalPathFinalProjectionReadbackCheck = Omit<CriticalPathFinalProjectionReadbackResponse, 'httpStatus'> & {
  status: DiagnosticStatus
  httpStatus: number | null
  projectId: string | null
  expectedProjectId: string | null
  projectIdMatches: boolean
  routeResponseTaskCounts: number[]
  routeResponseCriticalTaskCounts: number[]
  routeResponseProjectDurationDays: number[]
  consistencyStatus: 'pass' | 'fail' | 'not_evaluable'
  reason?: string
}

export type CriticalPathConcurrentOperationResult = {
  operation: 'sweep' | 'route_refresh'
  status: 'fulfilled' | 'rejected'
  success: boolean
  elapsedMs: number
  response?: CriticalPathSweepResponse | CriticalPathRouteRefreshResponse
  errorMessage?: string
}

export type CriticalPathConcurrencyCheck = {
  status: DiagnosticStatus
  sweepAttemptCount: 1
  routeAttemptCount: number
  successCount: number
  unexpectedFailureCount: number
  elapsedMs: number | null
  operations: CriticalPathConcurrentOperationResult[]
  routeResponseProjectIds: string[]
  routeResponseProjectIdMatches: boolean
  finalProjectionEvidenceRequired: true
  finalProjectionEvidenceRequiredReason: string
  finalProjectionReadback: CriticalPathFinalProjectionReadbackCheck
  reason?: string
}

export type CriticalPathConcurrencyLiveDiagnosticReport = {
  reportCode: 'c18_l07_critical_path_concurrency_live_diagnostic'
  evidenceKind: 'live_db_http_concurrent_cpm_probe'
  generatedAt: string
  environment: string
  diagnosticRunId: string
  command: string
  exitCode: 0 | 1
  artifactPath: string | null
  targetIds: {
    projectId: string | null
  }
  startedAt: string
  finishedAt: string
  cleanupReadback: {
    status: 'pass' | 'not_required' | 'blocked'
    disposableDataCreated: false
    projectId: string | null
    reason: string
  }
  liveEvidenceRequired: true
  liveEvidenceRequiredReason: string
  liveEvidenceChecklist: string[]
  outputFile: string | null
  lockTelemetryFile: string | null
  lockTelemetryAssessment: CriticalPathLockTelemetryAssessment
  runtimeEvidenceGap: {
    missingAllowWrite: boolean
    missingBaseUrl: boolean
    missingAuthToken: boolean
    missingProjectId: boolean
    missingLiveConcurrentRun: boolean
    missingLockTelemetryEvidence: boolean
    missingFinalProjectionReadback: boolean
    missingArchivedJson: boolean
  }
  status: DiagnosticStatus
  allowWrite: boolean
  baseUrl: string | null
  projectId: string | null
  routeRefreshCount: number
  checks: {
    concurrentSweepAndRoute: CriticalPathConcurrencyCheck
  }
}

export type CriticalPathConcurrencyLiveDiagnosticOptions = {
  now?: Date
  allowWrite?: boolean
  baseUrl?: string | null
  authToken?: string | null
  projectId?: string | null
  diagnosticRunId?: string | null
  routeRefreshCount?: number | null
  outputFile?: string | null
  lockTelemetryFile?: string | null
  lockTelemetry?: unknown
  collectLockTelemetry?: boolean | null
  runSweep?: CriticalPathSweepRunner
  requestRouteRefresh?: CriticalPathRouteRefreshRequester
  requestFinalProjectionReadback?: CriticalPathFinalProjectionReadbackRequester
  runLockTelemetryProbe?: CriticalPathLockTelemetryProbeRunner
}

export type CriticalPathLockTelemetryProbeRequest = {
  diagnosticRunId: string
  projectId: string
  baseUrl: string
  authToken: string
  lockTelemetryFile: string
  requestRouteRefresh: CriticalPathRouteRefreshRequester
}

export type CriticalPathLockTelemetryProbeRunner = (
  request: CriticalPathLockTelemetryProbeRequest,
) => Promise<unknown>

export type CriticalPathLockTelemetryAssessment = {
  evidenceFile: string | null
  environment: string | null
  evidenceRef: string | null
  missingEvidenceMetadata: boolean
  status: LockTelemetryStatus
  acquiredCount: number
  waitCount: number
  releasedCount: number
  errorReleaseCount: number
  diagnosticRunIdMatch: boolean
  diagnosticRunIdMatchesReport: boolean
  expectedDiagnosticRunId: string | null
  lockScopeMatch: boolean
  eventSequenceValid: boolean
  coherentDiagnosticRunId: string | null
  coherentLockScope: string | null
  normalReleasePairCount: number
  errorReleasePairCount: number
  waitEvidenceCount: number
  missingSignals: string[]
}

const DEFAULT_ROUTE_REFRESH_COUNT = 2
const MAX_ROUTE_REFRESH_COUNT = 10

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readEvidenceMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { environment: null, evidenceRef: null }
  }
  const record = value as Record<string, unknown>
  return {
    environment: normalizeText(record.environment) || null,
    evidenceRef: normalizeText(record.evidenceRef ?? record.evidence_ref) || null,
  }
}

function normalizeOptionalPath(value: unknown) {
  return normalizeText(value).replace(/\\/g, '/')
}

function readFiniteNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function normalizeRouteRefreshCount(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_ROUTE_REFRESH_COUNT
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_ROUTE_REFRESH_COUNT)
}

function createDiagnosticRunId(now: Date) {
  return `c18-l07-${now.toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', 'z')}`
}

function runtimeEnvironment() {
  return process.env.APP_ENV || process.env.DEPLOY_ENV || process.env.NODE_ENV || 'live'
}

function redactCommandValue(value: string) {
  return value.replace(/(--auth-token=)[^\s]+/g, '$1<redacted>')
}

function buildDiagnosticCommand(options: CriticalPathConcurrencyLiveDiagnosticOptions) {
  const parts = ['npm run diagnose:critical-path-concurrency-live --workspace=server --']
  if (options.allowWrite === true) parts.push('--allow-write')
  if (options.baseUrl) parts.push(`--base-url=${normalizeText(options.baseUrl)}`)
  if (options.authToken) parts.push('--auth-token=<redacted>')
  if (options.projectId) parts.push(`--project-id=${normalizeText(options.projectId)}`)
  if (options.diagnosticRunId) parts.push(`--diagnostic-run-id=${normalizeText(options.diagnosticRunId)}`)
  if (options.routeRefreshCount != null) parts.push(`--route-refresh-count=${normalizeRouteRefreshCount(options.routeRefreshCount)}`)
  if (options.outputFile) parts.push(`--output-file=${normalizeOptionalPath(options.outputFile)}`)
  if (options.lockTelemetryFile) parts.push(`--lock-telemetry-file=${normalizeOptionalPath(options.lockTelemetryFile)}`)
  if (options.collectLockTelemetry === true) parts.push('--collect-lock-telemetry')
  return redactCommandValue(parts.join(' '))
}

function cleanupReadbackForCriticalPath(projectId: string, status: DiagnosticStatus) {
  return {
    status: status === 'blocked' ? 'blocked' as const : 'not_required' as const,
    disposableDataCreated: false as const,
    projectId: projectId || null,
    reason: 'C-18.L07 refreshes existing critical-path projections only; it does not create disposable rows, so cleanup readback is not required.',
  }
}

function liveEvidenceChecklist() {
  return [
    'Run against a real DB/API environment with the project-level CPM advisory lock enabled.',
    'Trigger one scheduler sweep and multiple user route refreshes for the same project concurrently.',
    'Capture lock acquire/wait/release evidence or equivalent job logs for the same project.',
    'Read back the final critical-path snapshot and task float projection after the race.',
    'Archive the full JSON diagnostic output before closing C-18.L07.',
  ]
}

function runtimeEvidenceGap(input: {
  allowWrite: boolean
  baseUrl: string
  authToken: string
  projectId: string
  outputFile: string
  lockTelemetryAssessment?: CriticalPathLockTelemetryAssessment
  liveConcurrentRunCompleted?: boolean
  finalProjectionReadbackCompleted?: boolean
}) {
  return {
    missingAllowWrite: !input.allowWrite,
    missingBaseUrl: !input.baseUrl,
    missingAuthToken: !input.authToken,
    missingProjectId: !input.projectId,
    missingLiveConcurrentRun: input.liveConcurrentRunCompleted !== true,
    missingLockTelemetryEvidence: input.lockTelemetryAssessment?.status !== 'pass',
    missingFinalProjectionReadback: input.finalProjectionReadbackCompleted !== true,
    missingArchivedJson: !input.outputFile,
  }
}

function normalizeLockTelemetryEntries(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
    )
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    return normalizeLockTelemetryEntries(record.events ?? record.entries ?? record.telemetry)
  }
  return []
}

function missingLockTelemetryAssessment(params: {
  evidenceFile: string | null
  projectId: string
  expectedDiagnosticRunId: string
}) {
  return assessLockTelemetry({
    evidenceFile: params.evidenceFile,
    environment: null,
    evidenceRef: null,
    entries: [],
    projectId: params.projectId,
    expectedDiagnosticRunId: params.expectedDiagnosticRunId,
  })
}

function assessLoadedLockTelemetry(
  options: CriticalPathConcurrencyLiveDiagnosticOptions,
  params: {
    evidenceFile: string | null
    projectId: string
    expectedDiagnosticRunId: string
  },
) {
  if (options.lockTelemetry === undefined && !params.evidenceFile) {
    return missingLockTelemetryAssessment(params)
  }
  if (
    options.collectLockTelemetry === true
    && options.lockTelemetry === undefined
    && params.evidenceFile
    && !existsSync(resolveReadableEvidencePath(params.evidenceFile))
  ) {
    return missingLockTelemetryAssessment(params)
  }
  const lockTelemetry = loadLockTelemetry(options)
  return assessLockTelemetry({
    evidenceFile: params.evidenceFile,
    environment: lockTelemetry.environment,
    evidenceRef: lockTelemetry.evidenceRef,
    entries: lockTelemetry.entries,
    projectId: params.projectId,
    expectedDiagnosticRunId: params.expectedDiagnosticRunId,
  })
}

function loadLockTelemetry(options: CriticalPathConcurrencyLiveDiagnosticOptions) {
  if (options.lockTelemetry !== undefined) {
    return {
      ...readEvidenceMetadata(options.lockTelemetry),
      entries: normalizeLockTelemetryEntries(options.lockTelemetry),
    }
  }
  const lockTelemetryFile = normalizeOptionalPath(options.lockTelemetryFile)
  if (!lockTelemetryFile) return { environment: null, evidenceRef: null, entries: [] }
  const readablePath = resolveReadableEvidencePath(lockTelemetryFile)
  const evidence = readJsonFile(readablePath)
  return {
    ...readEvidenceMetadata(evidence),
    entries: normalizeLockTelemetryEntries(evidence),
  }
}

function resolveReadableEvidencePath(path: string) {
  if (isAbsolute(path) || existsSync(path)) return path
  const workspaceRelativePath = resolve('..', path)
  return existsSync(workspaceRelativePath) ? workspaceRelativePath : path
}

function lockTelemetryScopeForProject(projectId: string) {
  return `workbuddy_critical_path_project:${projectId}`
}

async function sleep(ms: number) {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

async function pollForAdvisoryWaiter() {
  const client = await getClient()
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const result = await client.query(
        `SELECT COUNT(*)::int AS waiting_count
           FROM pg_locks
          WHERE locktype = 'advisory'
            AND granted = false`,
      )
      const waitingCount = Number(result.rows?.[0]?.waiting_count ?? 0)
      if (waitingCount > 0) return { observed: true, attempts: attempt + 1, waitingCount }
      await sleep(100)
    }
    return { observed: false, attempts: 40, waitingCount: 0 }
  } finally {
    client.release()
  }
}

async function defaultRunLockTelemetryProbe(
  request: CriticalPathLockTelemetryProbeRequest,
): Promise<unknown> {
  const events: Record<string, unknown>[] = []
  const lockNamespace = 'workbuddy_critical_path_project'
  const lockScope = lockTelemetryScopeForProject(request.projectId)
  const holderClient = await getClient()
  let holderAcquired = false
  let routeRefresh: Promise<CriticalPathRouteRefreshResponse> | null = null

  try {
    await holderClient.query(
      `SELECT pg_advisory_lock(hashtext($1), hashtext($2))`,
      [lockNamespace, request.projectId],
    )
    holderAcquired = true
    events.push({
      event: 'advisory_lock_acquired',
      operationRunId: 'lock-telemetry-holder',
      diagnosticRunId: request.diagnosticRunId,
      projectId: request.projectId,
      lockScope,
      source: 'db_advisory_lock_probe',
    })

    routeRefresh = request.requestRouteRefresh({
      baseUrl: request.baseUrl,
      authToken: request.authToken,
      projectId: request.projectId,
    })
    const routeStillWaitingWhileLockHeld = await Promise.race([
      routeRefresh.then(
        () => false,
        () => false,
      ),
      sleep(250).then(() => true),
    ])
    events.push({
      event: routeStillWaitingWhileLockHeld
        ? 'route_refresh_waiting_while_lock_held'
        : 'route_refresh_completed_without_lock_wait',
      operationRunId: 'route-refresh-waiter',
      diagnosticRunId: request.diagnosticRunId,
      projectId: request.projectId,
      lockScope,
      source: 'http_route_refresh_probe',
      observedAfterMs: 250,
    })
    const waitReadback = await pollForAdvisoryWaiter()
    events.push({
      event: waitReadback.observed ? 'advisory_lock_wait' : 'advisory_lock_wait_not_observed',
      operationRunId: 'route-refresh-waiter',
      diagnosticRunId: request.diagnosticRunId,
      projectId: request.projectId,
      lockScope,
      source: 'pg_locks_readback',
      attempts: waitReadback.attempts,
      waitingCount: waitReadback.waitingCount,
    })

    await holderClient.query(
      `SELECT pg_advisory_unlock(hashtext($1), hashtext($2)) AS released`,
      [lockNamespace, request.projectId],
    )
    holderAcquired = false
    events.push({
      event: 'advisory_lock_released',
      operationRunId: 'lock-telemetry-holder',
      diagnosticRunId: request.diagnosticRunId,
      projectId: request.projectId,
      lockScope,
      source: 'db_advisory_lock_probe',
    })

    const routeResult = await routeRefresh
    events.push({
      event: routeResult.success ? 'route_refresh_completed_after_wait' : 'route_refresh_failed_after_wait',
      operationRunId: 'route-refresh-waiter',
      diagnosticRunId: request.diagnosticRunId,
      projectId: request.projectId,
      lockScope,
      source: 'http_route_refresh_probe',
      httpStatus: routeResult.httpStatus,
      success: routeResult.success,
      errorCode: routeResult.errorCode,
    })
  } finally {
    if (holderAcquired) {
      try {
        await holderClient.query(
          `SELECT pg_advisory_unlock(hashtext($1), hashtext($2)) AS released`,
          [lockNamespace, request.projectId],
        )
      } catch {
        // Best-effort cleanup. The diagnostic report records the failure path below.
      }
    }
    holderClient.release()
  }

  const errorClient = await getClient()
  let errorProbeAcquired = false
  try {
    const errorAcquireResult = await errorClient.query(
      `SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS acquired`,
      [lockNamespace, request.projectId],
    )
    errorProbeAcquired = errorAcquireResult.rows?.[0]?.acquired === true
    if (!errorProbeAcquired) {
      throw new Error('error_release_probe_lock_not_acquired')
    }
    events.push({
      event: 'advisory_lock_acquired',
      operationRunId: 'error-release-probe',
      diagnosticRunId: request.diagnosticRunId,
      projectId: request.projectId,
      lockScope,
      source: 'db_advisory_lock_error_probe',
    })
    throw new Error('intentional_lock_release_probe')
  } catch (error) {
    if (!errorProbeAcquired) {
      events.push({
        event: 'advisory_lock_error_probe_failed_before_acquire',
        operationRunId: 'error-release-probe',
        diagnosticRunId: request.diagnosticRunId,
        projectId: request.projectId,
        lockScope,
        source: 'db_advisory_lock_error_probe',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    }
  } finally {
    if (errorProbeAcquired) {
      try {
        await errorClient.query(
          `SELECT pg_advisory_unlock(hashtext($1), hashtext($2)) AS released`,
          [lockNamespace, request.projectId],
        )
        events.push({
          event: 'advisory_lock_released_after_error',
          operationRunId: 'error-release-probe',
          diagnosticRunId: request.diagnosticRunId,
          projectId: request.projectId,
          lockScope,
          source: 'db_advisory_lock_error_probe',
        })
      } catch (error) {
        events.push({
          event: 'advisory_lock_error_release_failed',
          operationRunId: 'error-release-probe',
          diagnosticRunId: request.diagnosticRunId,
          projectId: request.projectId,
          lockScope,
          source: 'db_advisory_lock_error_probe',
          errorMessage: error instanceof Error ? error.message : String(error),
        })
      }
    }
    errorClient.release()
  }

  const evidence = {
    environment: process.env.APP_ENV || process.env.NODE_ENV || 'live',
    evidenceRef: request.lockTelemetryFile,
    evidenceKind: 'db_advisory_lock_probe_with_pg_locks_readback',
    diagnosticRunId: request.diagnosticRunId,
    projectId: request.projectId,
    lockScope,
    generatedAt: new Date().toISOString(),
    events,
  }
  writeJsonFile(request.lockTelemetryFile, evidence)
  return evidence
}

function writeLockTelemetryProbeFailureEvidence(
  request: CriticalPathLockTelemetryProbeRequest,
  error: unknown,
) {
  const lockScope = lockTelemetryScopeForProject(request.projectId)
  const evidence = {
    environment: process.env.APP_ENV || process.env.NODE_ENV || 'live',
    evidenceRef: request.lockTelemetryFile,
    evidenceKind: 'db_advisory_lock_probe_failure',
    diagnosticRunId: request.diagnosticRunId,
    projectId: request.projectId,
    lockScope,
    generatedAt: new Date().toISOString(),
    events: [
      {
        event: 'lock_telemetry_probe_failed',
        operationRunId: 'lock-telemetry-probe',
        diagnosticRunId: request.diagnosticRunId,
        projectId: request.projectId,
        lockScope,
        source: 'db_advisory_lock_probe',
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    ],
  }
  writeJsonFile(request.lockTelemetryFile, evidence)
  return evidence
}

function lockTelemetryEntryText(entry: Record<string, unknown>) {
  return [
    entry.event,
    entry.type,
    entry.action,
    entry.message,
    entry.status,
  ].map((value) => normalizeText(value).toLowerCase()).join(' ')
}

function lockTelemetryProjectId(entry: Record<string, unknown>) {
  return normalizeText(
    entry.projectId
    ?? entry.project_id
    ?? entry.project
    ?? entry.lockProjectId
    ?? entry.lock_project_id,
  )
}

function filterLockTelemetryEntriesByProject(
  entries: Record<string, unknown>[],
  projectId: string,
) {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) return entries
  return entries.filter((entry) => lockTelemetryProjectId(entry) === normalizedProjectId)
}

function countLockTelemetryMatches(
  entries: Record<string, unknown>[],
  patterns: RegExp[],
  excludePatterns: RegExp[] = [],
) {
  return entries.filter((entry) => {
    const text = lockTelemetryEntryText(entry)
    if (excludePatterns.some((pattern) => pattern.test(text))) return false
    return patterns.some((pattern) => pattern.test(text))
  }).length
}

type LockTelemetryEventKind = 'acquired' | 'wait' | 'released' | 'error_released'

type LockTelemetryCoherenceAssessment = {
  diagnosticRunIdMatch: boolean
  diagnosticRunIdMatchesReport: boolean
  expectedDiagnosticRunId: string | null
  lockScopeMatch: boolean
  eventSequenceValid: boolean
  coherentDiagnosticRunId: string | null
  coherentLockScope: string | null
  normalReleasePairCount: number
  errorReleasePairCount: number
  waitEvidenceCount: number
}

function emptyLockTelemetryCoherence(): LockTelemetryCoherenceAssessment {
  return {
    diagnosticRunIdMatch: false,
    diagnosticRunIdMatchesReport: false,
    expectedDiagnosticRunId: null,
    lockScopeMatch: false,
    eventSequenceValid: false,
    coherentDiagnosticRunId: null,
    coherentLockScope: null,
    normalReleasePairCount: 0,
    errorReleasePairCount: 0,
    waitEvidenceCount: 0,
  }
}

function lockTelemetryDiagnosticRunId(entry: Record<string, unknown>) {
  return normalizeText(
    entry.diagnosticRunId
    ?? entry.diagnostic_run_id
    ?? entry.probeRunId
    ?? entry.probe_run_id
    ?? entry.reportRunId
    ?? entry.report_run_id
    ?? entry.batchId
    ?? entry.batch_id,
  )
}

function lockTelemetryOperationRunId(entry: Record<string, unknown>) {
  return normalizeText(
    entry.operationRunId
    ?? entry.operation_run_id
    ?? entry.runId
    ?? entry.run_id
    ?? entry.requestId
    ?? entry.request_id
    ?? entry.attemptId
    ?? entry.attempt_id
    ?? entry.operationId
    ?? entry.operation_id
    ?? entry.jobRunId
    ?? entry.job_run_id,
  )
}

function lockTelemetryScope(entry: Record<string, unknown>) {
  return normalizeText(
    entry.lockScope
    ?? entry.lock_scope
    ?? entry.lockKey
    ?? entry.lock_key
    ?? entry.advisoryLockKey
    ?? entry.advisory_lock_key
    ?? entry.lockName
    ?? entry.lock_name,
  ).toLowerCase()
}

function lockScopeMatchesProject(scope: string, projectId: string) {
  const normalizedProjectId = normalizeText(projectId).toLowerCase()
  return Boolean(scope && normalizedProjectId && scope.includes(normalizedProjectId))
}

function lockTelemetryEventKind(entry: Record<string, unknown>): LockTelemetryEventKind | null {
  const text = lockTelemetryEntryText(entry)
  if (/lock_?released?_?after_?error/.test(text) || /error.*lock_?releas/.test(text) || /exception.*lock_?releas/.test(text)) {
    return 'error_released'
  }
  if (/wait_?not_?observed/.test(text) || /not_?observed.*wait/.test(text)) {
    return null
  }
  if (/lock_?acquir/.test(text) || /advisory.*acquir/.test(text)) return 'acquired'
  if (/lock_?wait/.test(text) || /advisory.*wait/.test(text) || /waiting_?while_?lock_?held/.test(text) || /route.*pending.*lock/.test(text)) return 'wait'
  if (/lock_?releas/.test(text) || /advisory.*releas/.test(text)) return 'released'
  return null
}

function hasAllLockTelemetryKinds(kinds: Set<LockTelemetryEventKind>) {
  return kinds.has('acquired')
    && kinds.has('wait')
    && kinds.has('released')
    && kinds.has('error_released')
}

function countOrderedOperationPairs(
  entries: Record<string, unknown>[],
  firstKind: LockTelemetryEventKind,
  secondKind: LockTelemetryEventKind,
) {
  const byOperation = new Map<string, { firstIndex: number | null; secondIndex: number | null }>()

  entries.forEach((entry, index) => {
    const operationRunId = lockTelemetryOperationRunId(entry)
    if (!operationRunId) return

    const kind = lockTelemetryEventKind(entry)
    if (kind !== firstKind && kind !== secondKind) return

    const current = byOperation.get(operationRunId) ?? { firstIndex: null, secondIndex: null }
    if (kind === firstKind && current.firstIndex === null) current.firstIndex = index
    if (kind === secondKind && current.secondIndex === null) current.secondIndex = index
    byOperation.set(operationRunId, current)
  })

  return [...byOperation.values()].filter((item) =>
    item.firstIndex !== null
    && item.secondIndex !== null
    && item.firstIndex < item.secondIndex,
  ).length
}

function assessLockTelemetryCoherence(
  entries: Record<string, unknown>[],
  projectId: string,
  expectedDiagnosticRunId: string,
): LockTelemetryCoherenceAssessment {
  const diagnosticKinds = new Map<string, Set<LockTelemetryEventKind>>()
  const scopeKinds = new Map<string, Set<LockTelemetryEventKind>>()
  const scopedEntries = new Map<string, Record<string, unknown>[]>()

  for (const entry of entries) {
    const kind = lockTelemetryEventKind(entry)
    if (!kind) continue

    const diagnosticRunId = lockTelemetryDiagnosticRunId(entry)
    if (diagnosticRunId) {
      const kinds = diagnosticKinds.get(diagnosticRunId) ?? new Set<LockTelemetryEventKind>()
      kinds.add(kind)
      diagnosticKinds.set(diagnosticRunId, kinds)
    }

    const scope = lockTelemetryScope(entry)
    if (lockScopeMatchesProject(scope, projectId)) {
      const kinds = scopeKinds.get(scope) ?? new Set<LockTelemetryEventKind>()
      kinds.add(kind)
      scopeKinds.set(scope, kinds)
    }

    if (diagnosticRunId && lockScopeMatchesProject(scope, projectId)) {
      const groupKey = `${diagnosticRunId}\u0000${scope}`
      const group = scopedEntries.get(groupKey) ?? []
      group.push(entry)
      scopedEntries.set(groupKey, group)
    }
  }

  const diagnosticRunIdMatch = [...diagnosticKinds.values()].some(hasAllLockTelemetryKinds)
  const lockScopeMatch = [...scopeKinds.values()].some(hasAllLockTelemetryKinds)

  for (const [groupKey, groupEntries] of scopedEntries.entries()) {
    const groupKinds = new Set(
      groupEntries
        .map((entry) => lockTelemetryEventKind(entry))
        .filter((kind): kind is LockTelemetryEventKind => Boolean(kind)),
    )
    if (!hasAllLockTelemetryKinds(groupKinds)) continue

    const normalReleasePairCount = countOrderedOperationPairs(groupEntries, 'acquired', 'released')
    const errorReleasePairCount = countOrderedOperationPairs(groupEntries, 'acquired', 'error_released')
    const waitEvidenceCount = groupEntries.filter((entry) =>
      lockTelemetryEventKind(entry) === 'wait' && Boolean(lockTelemetryOperationRunId(entry)),
    ).length

    if (normalReleasePairCount > 0 && errorReleasePairCount > 0 && waitEvidenceCount > 0) {
      const [coherentDiagnosticRunId, coherentLockScope] = groupKey.split('\u0000')
      const diagnosticRunIdMatchesReport = coherentDiagnosticRunId === expectedDiagnosticRunId
      return {
        diagnosticRunIdMatch,
        diagnosticRunIdMatchesReport,
        expectedDiagnosticRunId,
        lockScopeMatch,
        eventSequenceValid: true,
        coherentDiagnosticRunId,
        coherentLockScope,
        normalReleasePairCount,
        errorReleasePairCount,
        waitEvidenceCount,
      }
    }
  }

  return {
    ...emptyLockTelemetryCoherence(),
    diagnosticRunIdMatch,
    expectedDiagnosticRunId,
    lockScopeMatch,
  }
}

function assessLockTelemetry(params: {
  evidenceFile: string | null
  environment: string | null
  evidenceRef: string | null
  entries: Record<string, unknown>[]
  projectId: string
  expectedDiagnosticRunId: string
}): CriticalPathLockTelemetryAssessment {
  const projectEntries = filterLockTelemetryEntriesByProject(params.entries, params.projectId)
  const missingEvidenceMetadata = !params.environment || !params.evidenceRef

  if (params.entries.length === 0 || projectEntries.length === 0) {
    const missingSignals = [
      params.entries.length > 0 && projectEntries.length === 0 ? 'project_id_match' : null,
      params.entries.length > 0 && missingEvidenceMetadata ? 'evidence_metadata' : null,
      'lock_acquired',
      'lock_wait',
      'lock_released',
      'lock_released_after_error',
    ].filter((signal): signal is string => Boolean(signal))
    return {
      evidenceFile: params.evidenceFile,
      environment: params.environment,
      evidenceRef: params.evidenceRef,
      missingEvidenceMetadata,
      status: params.entries.length === 0 ? 'missing' : 'fail',
      acquiredCount: 0,
      waitCount: 0,
      releasedCount: 0,
      errorReleaseCount: 0,
      ...emptyLockTelemetryCoherence(),
      missingSignals,
    }
  }

  const acquiredCount = countLockTelemetryMatches(projectEntries, [/lock_?acquir/, /advisory.*acquir/])
  const waitCount = projectEntries.filter((entry) => lockTelemetryEventKind(entry) === 'wait').length
  const errorReleaseCount = countLockTelemetryMatches(projectEntries, [/lock_?released?_?after_?error/, /error.*lock_?releas/, /exception.*lock_?releas/])
  const releasedCount = countLockTelemetryMatches(
    projectEntries,
    [/lock_?releas/, /advisory.*releas/],
    [/lock_?released?_?after_?error/, /error.*lock_?releas/, /exception.*lock_?releas/],
  )
  const baseMissingSignals = [
    missingEvidenceMetadata ? 'evidence_metadata' : null,
    acquiredCount > 0 ? null : 'lock_acquired',
    waitCount > 0 ? null : 'lock_wait',
    releasedCount > 0 ? null : 'lock_released',
    errorReleaseCount > 0 ? null : 'lock_released_after_error',
  ].filter((signal): signal is string => Boolean(signal))
  const coherence = assessLockTelemetryCoherence(projectEntries, params.projectId, params.expectedDiagnosticRunId)
  const missingSignals = baseMissingSignals.length > 0
    ? baseMissingSignals
    : [
        coherence.diagnosticRunIdMatch ? null : 'diagnostic_run_id_match',
        coherence.diagnosticRunIdMatchesReport ? null : 'diagnostic_run_id',
        coherence.lockScopeMatch ? null : 'lock_scope_match',
        coherence.eventSequenceValid ? null : 'lock_event_sequence',
      ].filter((signal): signal is string => Boolean(signal))

  return {
    evidenceFile: params.evidenceFile,
    environment: params.environment,
    evidenceRef: params.evidenceRef,
    missingEvidenceMetadata,
    status: missingSignals.length === 0 ? 'pass' : 'fail',
    acquiredCount,
    waitCount,
    releasedCount,
    errorReleaseCount,
    ...coherence,
    missingSignals,
  }
}

function blockedProjectionReadback(reason: string): CriticalPathFinalProjectionReadbackCheck {
  return {
    status: 'blocked',
    httpStatus: null,
    success: false,
    projectId: null,
    expectedProjectId: null,
    projectIdMatches: false,
    taskCount: null,
    criticalTaskCount: null,
    projectedFloatTaskCount: null,
    projectDurationDays: null,
    networkLineagePresent: false,
    calculationStatus: null,
    errorCode: null,
    routeResponseTaskCounts: [],
    routeResponseCriticalTaskCounts: [],
    routeResponseProjectDurationDays: [],
    consistencyStatus: 'not_evaluable',
    reason,
  }
}

function blockedCheck(reason: string, routeRefreshCount: number): CriticalPathConcurrencyCheck {
  return {
    status: 'blocked',
    sweepAttemptCount: 1,
    routeAttemptCount: routeRefreshCount,
    successCount: 0,
    unexpectedFailureCount: 0,
    elapsedMs: null,
    operations: [],
    routeResponseProjectIds: [],
    routeResponseProjectIdMatches: false,
    finalProjectionEvidenceRequired: true,
    finalProjectionEvidenceRequiredReason: 'The local diagnostic entrypoint cannot by itself prove that the final critical_path snapshot and task float projection are untorn; archive DB/API readback evidence after a live run.',
    finalProjectionReadback: blockedProjectionReadback(reason),
    reason,
  }
}

function isSuccessfulSweep(response: CriticalPathSweepResponse) {
  return Boolean(response) && Number(response?.failedProjects ?? 0) === 0
}

function isSuccessfulRouteRefresh(response: CriticalPathRouteRefreshResponse) {
  return response.success && response.httpStatus >= 200 && response.httpStatus < 300
}

function readRouteRefreshResponses(
  operations: CriticalPathConcurrentOperationResult[],
): CriticalPathRouteRefreshResponse[] {
  return operations
    .filter((operation) => operation.operation === 'route_refresh' && operation.success)
    .map((operation) => operation.response)
    .filter((response): response is CriticalPathRouteRefreshResponse =>
      Boolean(response)
      && typeof response === 'object'
      && 'httpStatus' in response
      && 'success' in response,
    )
}

function readRouteResponseProjectIds(routeResponses: CriticalPathRouteRefreshResponse[]) {
  return routeResponses.map((response) => normalizeText(response.projectId)).filter(Boolean)
}

function routeResponseProjectIdsMatch(routeResponses: CriticalPathRouteRefreshResponse[], projectId: string) {
  if (routeResponses.length === 0) return false
  return routeResponses.every((response) => normalizeText(response.projectId) === projectId)
}

function compactNumbers(values: Array<number | null | undefined>) {
  return values.filter((value): value is number => Number.isFinite(value))
}

function everyMatches(values: number[], expected: number | null) {
  return values.length === 0 || (expected != null && values.every((value) => value === expected))
}

function evaluateFinalProjectionReadback(
  response: CriticalPathFinalProjectionReadbackResponse,
  operations: CriticalPathConcurrentOperationResult[],
  expectedProjectId: string,
): CriticalPathFinalProjectionReadbackCheck {
  const routeResponses = readRouteRefreshResponses(operations)
  const routeResponseTaskCounts = compactNumbers(routeResponses.map((item) => item.taskCount ?? null))
  const routeResponseCriticalTaskCounts = compactNumbers(routeResponses.map((item) => item.criticalTaskCount ?? null))
  const routeResponseProjectDurationDays = compactNumbers(routeResponses.map((item) => item.projectDurationDays ?? null))
  const responseProjectId = normalizeText(response.projectId)
  const projectIdMatches = Boolean(expectedProjectId && responseProjectId === expectedProjectId)
  const routeEvidencePresent = routeResponseTaskCounts.length > 0
    || routeResponseCriticalTaskCounts.length > 0
    || routeResponseProjectDurationDays.length > 0
  const consistencyStatus = !routeEvidencePresent
    ? 'not_evaluable'
    : everyMatches(routeResponseTaskCounts, response.taskCount)
      && everyMatches(routeResponseCriticalTaskCounts, response.criticalTaskCount)
      && everyMatches(routeResponseProjectDurationDays, response.projectDurationDays)
      ? 'pass'
      : 'fail'
  const reasons: string[] = []
  if (!response.success || response.httpStatus < 200 || response.httpStatus >= 300) {
    reasons.push('final_snapshot_http_readback_failed')
  }
  if ((response.taskCount ?? 0) <= 0) reasons.push('final_snapshot_task_count_missing')
  if ((response.criticalTaskCount ?? 0) <= 0) reasons.push('final_snapshot_critical_task_count_missing')
  if ((response.projectedFloatTaskCount ?? 0) <= 0) reasons.push('final_snapshot_float_projection_missing')
  if ((response.projectDurationDays ?? 0) <= 0) reasons.push('final_snapshot_project_duration_missing')
  if (!projectIdMatches) reasons.push('final_snapshot_project_id_mismatch')
  if (!response.networkLineagePresent) reasons.push('final_snapshot_network_lineage_missing')
  if (consistencyStatus === 'fail') reasons.push('final_snapshot_route_response_mismatch')
  const status: DiagnosticStatus = reasons.length === 0 ? 'pass' : 'fail'

  return {
    status,
    httpStatus: response.httpStatus,
    success: response.success,
    projectId: responseProjectId || null,
    expectedProjectId,
    projectIdMatches,
    taskCount: response.taskCount,
    criticalTaskCount: response.criticalTaskCount,
    projectedFloatTaskCount: response.projectedFloatTaskCount,
    projectDurationDays: response.projectDurationDays,
    networkLineagePresent: response.networkLineagePresent,
    calculationStatus: response.calculationStatus,
    errorCode: response.errorCode,
    ...(response.errorMessage ? { errorMessage: response.errorMessage } : {}),
    routeResponseTaskCounts,
    routeResponseCriticalTaskCounts,
    routeResponseProjectDurationDays,
    consistencyStatus,
    ...(reasons.length > 0 ? { reason: reasons.join(',') } : {}),
  }
}

async function requestAndEvaluateFinalProjectionReadback(
  requestFinalProjectionReadback: CriticalPathFinalProjectionReadbackRequester,
  request: CriticalPathFinalProjectionReadbackRequest,
  operations: CriticalPathConcurrentOperationResult[],
): Promise<CriticalPathFinalProjectionReadbackCheck> {
  try {
    const response = await requestFinalProjectionReadback(request)
    return evaluateFinalProjectionReadback(response, operations, request.projectId)
  } catch (error) {
    return {
      ...blockedProjectionReadback(error instanceof Error ? error.message : String(error)),
      expectedProjectId: request.projectId,
      status: 'fail',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

async function timeOperation<T>(
  operation: 'sweep' | 'route_refresh',
  runner: () => Promise<T>,
  isSuccess: (response: T) => boolean,
): Promise<CriticalPathConcurrentOperationResult> {
  const operationStartedAt = performance.now()
  try {
    const response = await runner()
    return {
      operation,
      status: 'fulfilled',
      success: isSuccess(response),
      elapsedMs: roundMs(performance.now() - operationStartedAt),
      response: response as CriticalPathConcurrentOperationResult['response'],
    }
  } catch (error) {
    return {
      operation,
      status: 'rejected',
      success: false,
      elapsedMs: roundMs(performance.now() - operationStartedAt),
      errorMessage: error instanceof Error ? error.message : String(error),
    }
  }
}

async function defaultRunSweep(request: CriticalPathSweepRequest): Promise<CriticalPathSweepResponse> {
  const job = await import('../jobs/criticalPathRefreshJob.js')
  return await job.criticalPathRefreshJob.executeNow([request.projectId])
}

async function defaultRequestRouteRefresh(
  request: CriticalPathRouteRefreshRequest,
): Promise<CriticalPathRouteRefreshResponse> {
  const response = await fetch(
    `${trimTrailingSlash(request.baseUrl)}/api/projects/${encodeURIComponent(request.projectId)}/critical-path/refresh`,
    {
      method: 'POST',
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
    projectId: normalizeText(body?.data?.projectId ?? body?.data?.project_id) || null,
    taskCount: Array.isArray(body?.data?.tasks)
      ? body.data.tasks.length
      : body?.data?.taskCount ?? null,
    criticalTaskCount: Array.isArray(body?.data?.autoTaskIds)
      ? body.data.autoTaskIds.length
      : body?.data?.criticalTaskCount ?? null,
    projectDurationDays: readFiniteNumber(body?.data?.projectDurationDays),
    errorCode: normalizeText(body?.error?.code) || null,
    errorMessage: normalizeText(body?.error?.message) || null,
  }
}

async function defaultRequestFinalProjectionReadback(
  request: CriticalPathFinalProjectionReadbackRequest,
): Promise<CriticalPathFinalProjectionReadbackResponse> {
  const response = await fetch(
    `${trimTrailingSlash(request.baseUrl)}/api/projects/${encodeURIComponent(request.projectId)}/critical-path`,
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

  const data = body?.data
  const tasks = Array.isArray(data?.tasks) ? data.tasks : []
  const autoTaskIds = Array.isArray(data?.autoTaskIds) ? data.autoTaskIds : []
  const projectedFloatTaskCount = tasks.filter((task: any) => Number.isFinite(Number(task?.floatDays))).length

  return {
    httpStatus: response.status,
    success: Boolean(body?.success ?? response.ok),
    projectId: normalizeText(data?.projectId ?? data?.project_id) || null,
    taskCount: tasks.length,
    criticalTaskCount: autoTaskIds.length,
    projectedFloatTaskCount,
    projectDurationDays: readFiniteNumber(data?.projectDurationDays),
    networkLineagePresent: Boolean(data?.networkLineage?.criticalPathInputHash && data?.networkLineage?.criticalSetHash),
    calculationStatus: normalizeText(data?.calculationStatus) || null,
    errorCode: normalizeText(body?.error?.code) || null,
    errorMessage: normalizeText(body?.error?.message) || null,
  }
}

export async function buildCriticalPathConcurrencyLiveDiagnosticReport(
  options: CriticalPathConcurrencyLiveDiagnosticOptions = {},
): Promise<CriticalPathConcurrencyLiveDiagnosticReport> {
  const now = options.now ?? new Date()
  const evidenceStartedAt = now.toISOString()
  const diagnosticRunId = normalizeText(options.diagnosticRunId) || createDiagnosticRunId(now)
  const allowWrite = options.allowWrite === true
  const baseUrl = normalizeText(options.baseUrl)
  const authToken = normalizeText(options.authToken)
  const projectId = normalizeText(options.projectId)
  const outputFile = normalizeOptionalPath(options.outputFile)
  const lockTelemetryFile = normalizeOptionalPath(options.lockTelemetryFile)
  const routeRefreshCount = normalizeRouteRefreshCount(options.routeRefreshCount)
  const makeBase = (lockTelemetryAssessment: CriticalPathLockTelemetryAssessment) => ({
    reportCode: 'c18_l07_critical_path_concurrency_live_diagnostic' as const,
    evidenceKind: 'live_db_http_concurrent_cpm_probe' as const,
    generatedAt: now.toISOString(),
    environment: runtimeEnvironment(),
    diagnosticRunId,
    command: buildDiagnosticCommand({
      ...options,
      allowWrite,
      baseUrl,
      authToken,
      projectId,
      diagnosticRunId,
      routeRefreshCount,
      outputFile,
      lockTelemetryFile,
    }),
    exitCode: 1 as const,
    artifactPath: outputFile || null,
    targetIds: {
      projectId: projectId || null,
    },
    startedAt: evidenceStartedAt,
    finishedAt: new Date().toISOString(),
    cleanupReadback: cleanupReadbackForCriticalPath(projectId, 'blocked'),
    liveEvidenceRequired: true as const,
    liveEvidenceRequiredReason: 'C-18.L07 requires a real DB/API run that concurrently triggers the critical path sweep job and user refresh route, plus archived JSON and projection readback evidence.',
    liveEvidenceChecklist: liveEvidenceChecklist(),
    outputFile: outputFile || null,
    lockTelemetryFile: lockTelemetryFile || null,
    lockTelemetryAssessment,
    runtimeEvidenceGap: runtimeEvidenceGap({
      allowWrite,
      baseUrl,
      authToken,
      projectId,
      outputFile,
      lockTelemetryAssessment,
    }),
    allowWrite,
    baseUrl: baseUrl || null,
    projectId: projectId || null,
    routeRefreshCount,
  })

  let lockTelemetryAssessment = assessLoadedLockTelemetry(options, {
    evidenceFile: lockTelemetryFile || null,
    projectId,
    expectedDiagnosticRunId: diagnosticRunId,
  })
  const baseBeforeProbe = makeBase(lockTelemetryAssessment)

  if (!allowWrite || !baseUrl || !authToken || !projectId) {
    const missing = [
      !allowWrite ? '--allow-write' : null,
      !baseUrl ? '--base-url=<server>' : null,
      !authToken ? '--auth-token=<jwt>' : null,
      !projectId ? '--project-id=<project>' : null,
    ].filter(Boolean).join(', ')
    return {
      ...baseBeforeProbe,
      status: 'blocked',
      checks: {
        concurrentSweepAndRoute: blockedCheck(`Missing ${missing}; live CPM concurrency probe is intentionally blocked.`, routeRefreshCount),
      },
    }
  }

  const runSweep = options.runSweep ?? defaultRunSweep
  const requestRouteRefresh = options.requestRouteRefresh ?? defaultRequestRouteRefresh
  const requestFinalProjectionReadback = options.requestFinalProjectionReadback ?? defaultRequestFinalProjectionReadback
  if (options.collectLockTelemetry === true && lockTelemetryFile) {
    const runLockTelemetryProbe = options.runLockTelemetryProbe ?? defaultRunLockTelemetryProbe
    const lockTelemetryProbeRequest = {
      diagnosticRunId,
      projectId,
      baseUrl,
      authToken,
      lockTelemetryFile,
      requestRouteRefresh,
    }
    try {
      await runLockTelemetryProbe(lockTelemetryProbeRequest)
    } catch (error) {
      writeLockTelemetryProbeFailureEvidence(lockTelemetryProbeRequest, error)
    }
  }
  lockTelemetryAssessment = assessLoadedLockTelemetry(options, {
    evidenceFile: lockTelemetryFile || null,
    projectId,
    expectedDiagnosticRunId: diagnosticRunId,
  })
  const base = makeBase(lockTelemetryAssessment)
  const sweepRequest = { projectId }
  const routeRequest = { baseUrl, authToken, projectId }
  const operationStartedAt = performance.now()
  const operations = await Promise.all([
    timeOperation('sweep', () => runSweep(sweepRequest), isSuccessfulSweep),
    ...Array.from({ length: routeRefreshCount }, () =>
      timeOperation('route_refresh', () => requestRouteRefresh(routeRequest), isSuccessfulRouteRefresh),
    ),
  ])
  const routeResponses = readRouteRefreshResponses(operations)
  const routeResponseProjectIds = readRouteResponseProjectIds(routeResponses)
  const routeResponseProjectIdMatches = routeResponseProjectIdsMatch(routeResponses, projectId)
  const successCount = operations.filter((operation) => operation.success).length
  const unexpectedFailureCount = operations.length - successCount
  const finalProjectionReadback = await requestAndEvaluateFinalProjectionReadback(
    requestFinalProjectionReadback,
    routeRequest,
    operations,
  )
  const status: DiagnosticStatus = unexpectedFailureCount === 0
    && routeResponseProjectIdMatches
    && finalProjectionReadback.status === 'pass'
    && lockTelemetryAssessment.status === 'pass'
    && Boolean(outputFile)
    ? 'pass'
    : 'fail'

  return {
    ...base,
    exitCode: status === 'pass' ? 0 : 1,
    finishedAt: new Date().toISOString(),
    cleanupReadback: cleanupReadbackForCriticalPath(projectId, status),
    runtimeEvidenceGap: runtimeEvidenceGap({
      allowWrite,
      baseUrl,
      authToken,
      projectId,
      outputFile,
      lockTelemetryAssessment,
      liveConcurrentRunCompleted: operations.length === routeRefreshCount + 1,
      finalProjectionReadbackCompleted: finalProjectionReadback.status !== 'blocked',
    }),
    status,
    checks: {
      concurrentSweepAndRoute: {
        status,
        sweepAttemptCount: 1,
        routeAttemptCount: routeRefreshCount,
        successCount,
        unexpectedFailureCount,
        elapsedMs: roundMs(performance.now() - operationStartedAt),
        operations,
        routeResponseProjectIds,
        routeResponseProjectIdMatches,
        finalProjectionEvidenceRequired: true,
        finalProjectionEvidenceRequiredReason: 'This report includes final critical path snapshot and task float projection readback; archive the JSON after a live run before closing C-18.L07.',
        finalProjectionReadback,
        ...(status === 'pass'
          ? {}
          : {
            reason: unexpectedFailureCount > 0
                ? 'Expected sweep and all route refreshes to complete successfully; inspect failed operation responses before trusting CPM concurrency behavior.'
                : !routeResponseProjectIdMatches
                  ? 'Expected every successful route refresh project id to match the diagnostic project before trusting CPM concurrency behavior.'
                  : finalProjectionReadback.status !== 'pass'
                  ? 'Expected final critical path projection readback to match successful route refresh responses before trusting CPM concurrency behavior.'
                  : lockTelemetryAssessment.status !== 'pass'
                    ? 'Expected lock telemetry evidence to include acquire, wait, release, and release-after-error signals before trusting CPM concurrency behavior.'
                    : 'Archive the full diagnostic JSON with --output-file before closing C-18.L07.',
            }),
      },
    },
  }
}

export function shouldFailCriticalPathConcurrencyLiveDiagnosticReport(
  report: CriticalPathConcurrencyLiveDiagnosticReport,
) {
  return report.status !== 'pass' || report.checks.concurrentSweepAndRoute.status !== 'pass'
}

function parseStringArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : undefined
}

export function parseCriticalPathConcurrencyLiveDiagnosticOptionsFromArgs(
  args: string[],
): Pick<CriticalPathConcurrencyLiveDiagnosticOptions, 'allowWrite' | 'baseUrl' | 'authToken' | 'projectId' | 'diagnosticRunId' | 'routeRefreshCount' | 'outputFile' | 'lockTelemetryFile' | 'collectLockTelemetry'> {
  return {
    allowWrite: args.includes('--allow-write'),
    ...(args.includes('--collect-lock-telemetry') ? { collectLockTelemetry: true } : {}),
    baseUrl: parseStringArg(args, 'base-url'),
    authToken: parseStringArg(args, 'auth-token') ?? process.env.WORKBUDDY_LIVE_AUTH_TOKEN,
    projectId: parseStringArg(args, 'project-id'),
    diagnosticRunId: parseStringArg(args, 'diagnostic-run-id'),
    routeRefreshCount: parseStringArg(args, 'route-refresh-count') !== undefined
      ? normalizeRouteRefreshCount(parseStringArg(args, 'route-refresh-count'))
      : undefined,
    outputFile: parseStringArg(args, 'output-file'),
    lockTelemetryFile: parseStringArg(args, 'lock-telemetry-file'),
  }
}

function writeReportIfRequested(report: CriticalPathConcurrencyLiveDiagnosticReport) {
  if (!report.outputFile) return
  writeJsonFile(report.outputFile, report)
}

async function main() {
  try {
    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport(
      parseCriticalPathConcurrencyLiveDiagnosticOptionsFromArgs(process.argv),
    )
    writeReportIfRequested(report)
    console.log(JSON.stringify(report, null, 2))
    if (shouldFailCriticalPathConcurrencyLiveDiagnosticReport(report)) {
      process.exitCode = 1
    }
  } finally {
    await closeDatabasePool()
  }
}

if (process.argv[1]?.endsWith('diagnose-critical-path-concurrency-live.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
