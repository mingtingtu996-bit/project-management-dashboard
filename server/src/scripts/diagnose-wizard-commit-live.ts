import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { readJsonFile, writeJsonFile } from './jsonEvidenceUtils.js'

type DiagnosticStatus = 'blocked' | 'pass' | 'fail'
type EvidenceStatus = 'missing' | 'pass' | 'fail'

const FAILURE_INJECTION_STAGE_CONFIGS = [
  {
    key: 'engineering',
    failureStage: 'after_engineering_objects',
    injectedStage: 'engineering_objects',
  },
  {
    key: 'tasks',
    failureStage: 'after_tasks',
    injectedStage: 'tasks',
  },
  {
    key: 'dependencies',
    failureStage: 'after_dependencies_or_acceptance_plans',
    injectedStage: 'dependencies_acceptance_plans',
  },
] as const

export type WizardCommitRequest = {
  baseUrl: string
  authToken: string
  projectId: string
  wizardPayload: Record<string, unknown>
  requestTimeoutMs?: number | null
}

export type WizardCommitResponse = {
  httpStatus: number
  success: boolean
  errorCode: string | null
  errorMessage?: string | null
  projectId?: string | null
  inferredFromArtifactInventory?: boolean
}

export type WizardArtifactInventoryRequest = {
  baseUrl: string
  authToken: string
  projectId: string
  requestTimeoutMs?: number | null
}

export type WizardArtifactInventoryResponse = {
  httpStatus: number
  success: boolean
  projectId: string | null
  wizardGenerationState: string | null
  wizardGenerationLastError?: string | null
  wizardGenerationLastErrorCode?: string | null
  generatedTaskCount: number
  generatedPrimaryScheduleTaskCount?: number
  generatedPrimaryScheduleExecutableTaskCount?: number
  generatedPrimaryScheduleRecordOnlyTaskCount?: number
  generatedNonPrimaryTaskCount?: number
  generationBatchIds: string[]
  duplicateGeneratedTaskSignatureCount: number
  candidateBaselinesRemaining?: number
  candidateBaselineDraftCount?: number
  candidateBaselineIds?: string[]
  candidateBaselineStatuses?: string[]
  candidateBaselineItemCount?: number
  candidateBaselineMappedItemCount?: number
  candidateBaselineUnmappedItemCount?: number
  errorCode: string | null
  errorMessage?: string | null
}

export type DisposableWizardDraftCreateRequest = {
  baseUrl: string
  authToken: string
  companyId?: string | null
  wizardPayload: Record<string, unknown>
  now: Date
  diagnosticRunId: string
  requestTimeoutMs?: number | null
}

export type DisposableWizardDraftCreateResponse = {
  httpStatus: number
  success: boolean
  projectId: string | null
  errorCode: string | null
  errorMessage?: string | null
}

export type DisposableWizardProjectCleanupRequest = {
  baseUrl: string
  authToken: string
  projectId: string
  requestTimeoutMs?: number | null
}

export type DisposableWizardProjectCleanupStep = {
  httpStatus: number | null
  success: boolean
  errorCode: string | null
  errorMessage?: string | null
}

export type DisposableWizardProjectCleanupResponse = {
  status: 'not_applicable' | 'pass' | 'fail'
  rollback: DisposableWizardProjectCleanupStep
  deleteDraft: DisposableWizardProjectCleanupStep
  projectStillReadable: boolean | null
  errorCode: string | null
  errorMessage?: string | null
}

export type WizardCommitRequester = (
  request: WizardCommitRequest,
) => Promise<WizardCommitResponse>

export type WizardArtifactInventoryRequester = (
  request: WizardArtifactInventoryRequest,
) => Promise<WizardArtifactInventoryResponse>

export type DisposableWizardDraftCreator = (
  request: DisposableWizardDraftCreateRequest,
) => Promise<DisposableWizardDraftCreateResponse>

export type DisposableWizardProjectCleanupRequester = (
  request: DisposableWizardProjectCleanupRequest,
) => Promise<DisposableWizardProjectCleanupResponse>

export type WizardFailureInjectionCommitRequest = {
  baseUrl: string
  authToken: string
  projectId: string
  wizardPayload: Record<string, unknown>
  diagnosticRunId: string
  failureStage: string
  requestTimeoutMs?: number | null
}

export type WizardFailureInjectionCommitResponse = WizardCommitResponse & {
  requestId?: string | null
  routeInvocationId?: string | null
}

export type WizardFailureInjectionCleanupReadbackRequest = {
  baseUrl: string
  authToken: string
  projectId: string
  failureStage: string
  requestTimeoutMs?: number | null
}

export type WizardFailureInjectionCleanupReadbackResponse = {
  httpStatus: number | null
  success: boolean
  projectId: string | null
  wizardGenerationBatchId: string | null
  tasksRemaining: number
  dependenciesRemaining: number
  acceptancePlansRemaining: number
  engineeringObjectsRemaining: number
  projectStatus: string | null
  wizardGenerationState: string | null
  errorCode: string | null
  errorMessage?: string | null
}

export type WizardFailureInjectionCommitRequester = (
  request: WizardFailureInjectionCommitRequest,
) => Promise<WizardFailureInjectionCommitResponse>

export type WizardFailureInjectionCleanupReadbackRequester = (
  request: WizardFailureInjectionCleanupReadbackRequest,
) => Promise<WizardFailureInjectionCleanupReadbackResponse>

export type FailureInjectionEvidenceWriter = (
  path: string,
  evidence: Record<string, unknown>,
) => void

export type WizardArtifactInventoryReadbackCheck = WizardArtifactInventoryResponse & {
  status: DiagnosticStatus
  reason?: string
}

export type WizardCommitConcurrencyCheck = {
  status: DiagnosticStatus
  attemptCount: 2
  successCount: number
  reentrantConflictCount: number
  unexpectedFailureCount: number
  successResponseProjectIdMatches: boolean
  elapsedMs: number | null
  responses: WizardCommitResponse[]
  artifactInventoryReadback: WizardArtifactInventoryReadbackCheck
  failureInjectionEvidenceRequired: true
  failureInjectionEvidenceRequiredReason: string
  reason?: string
}

export type WizardCommitLiveDiagnosticReport = {
  reportCode: 'c18_l09_wizard_commit_live_diagnostic'
  evidenceKind: 'live_http_concurrent_wizard_commit_probe'
  generatedAt: string
  diagnosticRunId: string
  liveEvidenceRequired: true
  liveEvidenceRequiredReason: string
  liveEvidenceChecklist: string[]
  failureInjectionEvidenceChecklist: string[]
  outputFile: string | null
  failureInjectionEvidenceFile: string | null
  failureInjectionEvidenceAssessment: FailureInjectionEvidenceAssessment
  createdDisposableDraft: boolean
  disposableProjectCleanup: DisposableWizardProjectCleanupResponse
  runtimeEvidenceGap: {
    missingAllowWrite: boolean
    missingBaseUrl: boolean
    missingAuthToken: boolean
    missingProjectId: boolean
    missingPayload: boolean
    missingLiveDoubleCommitRun: boolean
    missingArtifactInventoryReadback: boolean
    missingFailureInjectionRun: boolean
    missingCleanupReadback: boolean
    missingDisposableDraftCleanup: boolean
    missingArchivedJson: boolean
  }
  status: DiagnosticStatus
  allowWrite: boolean
  baseUrl: string | null
  companyId: string | null
  projectId: string | null
  payloadProvided: boolean
  checks: {
    concurrentCommit: WizardCommitConcurrencyCheck
  }
}

export type WizardCommitLiveDiagnosticOptions = {
  now?: Date
  diagnosticRunId?: string | null
  allowWrite?: boolean
  baseUrl?: string | null
  authToken?: string | null
  companyId?: string | null
  projectId?: string | null
  createDisposableDraft?: boolean
  createFailureInjectionEvidence?: boolean
  failureInjectionStages?: string[] | null
  requestTimeoutMs?: number | null
  artifactInventoryPollAttempts?: number | null
  artifactInventoryPollIntervalMs?: number | null
  failureInjectionReadbackPollAttempts?: number | null
  failureInjectionReadbackPollIntervalMs?: number | null
  payloadFile?: string | null
  wizardPayload?: Record<string, unknown> | null
  outputFile?: string | null
  failureInjectionEvidenceFile?: string | null
  failureInjectionEvidence?: unknown
  requestCommit?: WizardCommitRequester
  requestArtifactInventory?: WizardArtifactInventoryRequester
  createDisposableWizardDraft?: DisposableWizardDraftCreator
  cleanupDisposableWizardProject?: DisposableWizardProjectCleanupRequester
  requestFailureInjectionCommit?: WizardFailureInjectionCommitRequester
  requestFailureInjectionCleanupReadback?: WizardFailureInjectionCleanupReadbackRequester
  writeFailureInjectionEvidence?: FailureInjectionEvidenceWriter
}

export type FailureInjectionEvidenceAssessment = {
  evidenceFile: string | null
  diagnosticRunId: string | null
  environment: string | null
  evidenceRef: string | null
  missingEvidenceMetadata: boolean
  status: EvidenceStatus
  projectIdMatches: boolean
  diagnosticRunIdPresent: boolean
  diagnosticRunIdMatches: boolean
  perStageRunCorrelationPresent: boolean
  injectedEngineeringObjects: boolean
  injectedTasks: boolean
  injectedDependenciesOrAcceptancePlans: boolean
  perStageRunCount: number
  cleanupReadbackPresent: boolean
  partialArtifactsDeleted: boolean
  projectNotFalselyActive: boolean
  cleanupBatchIdEvidencePresent: boolean
  cleanupBatchIdsConsistent: boolean
  missingSignals: string[]
}

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

function createDefaultDiagnosticRunId(now: Date) {
  return `c18-l09-${now.toISOString().replace(/[^0-9A-Za-z]+/g, '-')}`
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

function normalizePositiveInteger(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : null
}

function normalizeNonNegativeInteger(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.floor(numberValue) : null
}

function createAbortSignal(timeoutMs?: number | null) {
  const normalizedTimeoutMs = normalizePositiveInteger(timeoutMs)
  if (!normalizedTimeoutMs) return undefined
  return AbortSignal.timeout(normalizedTimeoutMs)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function classifyRequestErrorCode(error: unknown) {
  const record = (error && typeof error === 'object') ? error as Record<string, unknown> : {}
  const code = normalizeText(record.code)
  const cause = (record.cause && typeof record.cause === 'object') ? record.cause as Record<string, unknown> : {}
  const causeCode = normalizeText(cause.code)
  const message = error instanceof Error ? error.message : String(error)
  if (
    code === 'UND_ERR_HEADERS_TIMEOUT'
    || causeCode === 'UND_ERR_HEADERS_TIMEOUT'
    || error instanceof DOMException && error.name === 'TimeoutError'
    || /timeout/i.test(message)
  ) {
    return 'REQUEST_TIMEOUT'
  }
  return 'REQUEST_FAILED'
}

function classifyRequestErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function normalizeFailureInjectionStages(stages?: string[] | null) {
  const requested = new Set((stages ?? []).map(normalizeText).filter(Boolean))
  if (requested.size === 0) return [...FAILURE_INJECTION_STAGE_CONFIGS]
  return FAILURE_INJECTION_STAGE_CONFIGS.filter((config) => requested.has(config.failureStage))
}

function withRequestTimeout<T extends Record<string, unknown>>(request: T, timeoutMs?: number | null): T & { requestTimeoutMs?: number } {
  const normalizedTimeoutMs = normalizePositiveInteger(timeoutMs)
  return normalizedTimeoutMs ? { ...request, requestTimeoutMs: normalizedTimeoutMs } : request
}

function liveEvidenceChecklist() {
  return [
    'Run against a real DB/API environment using a disposable wizard draft project.',
    'Send two concurrent commit requests for the same project and require one reentrant conflict.',
    'Read back generated tasks and wizard metadata after the race.',
    'Run a separate step-N failure-injection probe in the same FK/RLS/trigger environment.',
    'Archive both the double-commit JSON and the failure-injection cleanup JSON before closing C-18.L09.',
  ]
}

function failureInjectionEvidenceChecklist() {
  return [
    'Inject a failure after engineering objects have started materializing.',
    'Inject a failure after generated tasks have started writing.',
    'Inject a failure after dependencies or acceptance plans have started writing.',
    'Read back tasks, dependencies, acceptance plans, engineering objects, and project status after each injected failure.',
    'Prove partial artifacts are physically deleted and the project does not remain falsely active.',
  ]
}

function runtimeEvidenceGap(input: {
  allowWrite: boolean
  baseUrl: string
  authToken: string
  projectId: string
  payloadProvided: boolean
  outputFile: string
  failureInjectionEvidenceAssessment?: FailureInjectionEvidenceAssessment
  createDisposableDraft?: boolean
  disposableProjectCleanup?: DisposableWizardProjectCleanupResponse
  liveDoubleCommitRunCompleted?: boolean
  artifactInventoryReadbackCompleted?: boolean
}) {
  return {
    missingAllowWrite: !input.allowWrite,
    missingBaseUrl: !input.baseUrl,
    missingAuthToken: !input.authToken,
    missingProjectId: !input.projectId,
    missingPayload: !input.payloadProvided,
    missingLiveDoubleCommitRun: input.liveDoubleCommitRunCompleted !== true,
    missingArtifactInventoryReadback: input.artifactInventoryReadbackCompleted !== true,
    missingFailureInjectionRun: input.failureInjectionEvidenceAssessment?.status !== 'pass',
    missingCleanupReadback: input.failureInjectionEvidenceAssessment?.cleanupReadbackPresent !== true
      || input.failureInjectionEvidenceAssessment?.partialArtifactsDeleted !== true
      || input.failureInjectionEvidenceAssessment?.projectNotFalselyActive !== true,
    missingDisposableDraftCleanup: input.createDisposableDraft === true
      && input.disposableProjectCleanup?.status !== 'pass',
    missingArchivedJson: !input.outputFile,
  }
}

function notApplicableDisposableWizardCleanup(): DisposableWizardProjectCleanupResponse {
  return {
    status: 'not_applicable',
    rollback: { httpStatus: null, success: false, errorCode: null },
    deleteDraft: { httpStatus: null, success: false, errorCode: null },
    projectStillReadable: null,
    errorCode: null,
    errorMessage: null,
  }
}

function loadFailureInjectionEvidence(options: WizardCommitLiveDiagnosticOptions) {
  if (options.failureInjectionEvidence !== undefined) return readRecord(options.failureInjectionEvidence)
  if (options.createFailureInjectionEvidence === true) return {}
  const evidenceFile = normalizeOptionalPath(options.failureInjectionEvidenceFile)
  if (!evidenceFile) return {}
  return readRecord(readEvidenceJson(evidenceFile))
}

function evidenceHasStage(stages: string[], names: string[]) {
  return stages.some((stage) => names.includes(stage))
}

function isTruthLike(value: unknown) {
  if (value === true) return true
  const normalized = normalizeText(value).toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'pass'
}

function assessCleanupReadback(value: unknown) {
  const cleanupReadback = readRecord(value)
  const projectStatus = normalizeText(cleanupReadback.projectStatus ?? cleanupReadback.project_status).toLowerCase()
  const wizardGenerationState = normalizeText(cleanupReadback.wizardGenerationState ?? cleanupReadback.wizard_generation_state).toLowerCase()
  const remainingCounts = [
    cleanupReadback.tasksRemaining ?? cleanupReadback.tasks_remaining,
    cleanupReadback.dependenciesRemaining ?? cleanupReadback.dependencies_remaining,
    cleanupReadback.acceptancePlansRemaining ?? cleanupReadback.acceptance_plans_remaining,
    cleanupReadback.engineeringObjectsRemaining ?? cleanupReadback.engineering_objects_remaining,
  ].map((value) => Number(value))
  const cleanupReadbackPresent = Object.keys(cleanupReadback).length > 0
  const partialArtifactsDeleted = cleanupReadbackPresent
    && remainingCounts.every((value) => Number.isFinite(value) && value === 0)
  const projectNotFalselyActive = cleanupReadbackPresent
    && !['active', '\u8fdb\u884c\u4e2d'].includes(projectStatus)
    && !['running'].includes(wizardGenerationState)

  return {
    cleanupReadbackPresent,
    partialArtifactsDeleted,
    projectNotFalselyActive,
  }
}
function readFailureInjectionRuns(evidence: Record<string, unknown>) {
  return readArray(evidence.runs ?? evidence.failureInjectionRuns ?? evidence.failure_injection_runs)
    .map(readRecord)
    .filter((run) => Object.keys(run).length > 0)
}

function normalizeInjectedStage(run: Record<string, unknown>) {
  return normalizeText(run.injectedStage ?? run.injected_stage ?? run.stage ?? run.failureStage ?? run.failure_stage)
}

function normalizeRunBatchId(run: Record<string, unknown>) {
  return normalizeText(
    run.wizardGenerationBatchId ??
    run.wizard_generation_batch_id ??
    run.generationBatchId ??
    run.generation_batch_id ??
    run.batchId ??
    run.batch_id,
  )
}

function normalizeCleanupBatchId(cleanupReadback: Record<string, unknown>) {
  return normalizeText(
    cleanupReadback.wizardGenerationBatchId ??
    cleanupReadback.wizard_generation_batch_id ??
    cleanupReadback.generationBatchId ??
    cleanupReadback.generation_batch_id ??
    cleanupReadback.batchId ??
    cleanupReadback.batch_id,
  )
}

function assessFailureInjectionEvidence(params: {
  evidenceFile: string | null
  evidence: Record<string, unknown>
  projectId: string
  diagnosticRunId: string
}): FailureInjectionEvidenceAssessment {
  const { environment, evidenceRef } = readEvidenceMetadata(params.evidence)
  const diagnosticRunId = normalizeText(params.evidence.diagnosticRunId ?? params.evidence.diagnostic_run_id)
  const missingEvidenceMetadata = !environment || !evidenceRef
  if (Object.keys(params.evidence).length === 0) {
    return {
      evidenceFile: params.evidenceFile,
      diagnosticRunId: null,
      environment,
      evidenceRef,
      missingEvidenceMetadata,
      status: 'missing',
      projectIdMatches: false,
      diagnosticRunIdPresent: false,
      diagnosticRunIdMatches: false,
      perStageRunCorrelationPresent: false,
      injectedEngineeringObjects: false,
      injectedTasks: false,
      injectedDependenciesOrAcceptancePlans: false,
      perStageRunCount: 0,
      cleanupReadbackPresent: false,
      partialArtifactsDeleted: false,
      projectNotFalselyActive: false,
      cleanupBatchIdEvidencePresent: false,
      cleanupBatchIdsConsistent: false,
      missingSignals: [
        'project_id_match',
        'evidence_metadata',
        'diagnostic_run_id',
        'per_stage_run_correlation',
        'injected_engineering_objects',
        'injected_tasks',
        'injected_dependencies_or_acceptance_plans',
        'per_stage_failure_runs',
        'cleanup_readback',
        'cleanup_batch_id_evidence',
        'partial_artifacts_deleted',
        'project_not_falsely_active',
      ],
    }
  }

  const stages = readArray(params.evidence.injectedStages ?? params.evidence.injected_stages)
    .map((stage) => normalizeText(stage))
    .filter(Boolean)
  const failureInjectionRuns = readFailureInjectionRuns(params.evidence)
  const validPerStageRuns = failureInjectionRuns.filter((run) => {
    const runIdentity = normalizeText(run.runId ?? run.run_id ?? run.attemptId ?? run.attempt_id)
    const stage = normalizeInjectedStage(run)
    const cleanup = assessCleanupReadback(run.cleanupReadback ?? run.cleanup_readback)
    return Boolean(runIdentity)
      && isTruthLike(run.failureInjected ?? run.failure_injected ?? run.injected)
      && Boolean(stage)
      && cleanup.cleanupReadbackPresent
      && cleanup.partialArtifactsDeleted
      && cleanup.projectNotFalselyActive
  })
  const cleanupBatchIdEvidencePresent = validPerStageRuns.length > 0
    && validPerStageRuns.every((run) => {
      const cleanup = readRecord(run.cleanupReadback ?? run.cleanup_readback)
      return Boolean(normalizeRunBatchId(run) && normalizeCleanupBatchId(cleanup))
    })
  const cleanupBatchIdsConsistent = cleanupBatchIdEvidencePresent
    && validPerStageRuns.every((run) => {
      const cleanup = readRecord(run.cleanupReadback ?? run.cleanup_readback)
      return normalizeRunBatchId(run) === normalizeCleanupBatchId(cleanup)
    })
  const diagnosticRunIdPresent = Boolean(diagnosticRunId)
  const diagnosticRunIdMatches = Boolean(params.diagnosticRunId && diagnosticRunId === params.diagnosticRunId)
  const perStageRunCorrelationPresent = validPerStageRuns.length > 0
    && validPerStageRuns.every((run) => {
      const runDiagnosticRunId = normalizeText(run.diagnosticRunId ?? run.diagnostic_run_id)
      const requestId = normalizeText(run.requestId ?? run.request_id)
      const routeInvocationId = normalizeText(run.routeInvocationId ?? run.route_invocation_id)
      return runDiagnosticRunId === params.diagnosticRunId
        && Boolean(requestId)
        && Boolean(routeInvocationId)
    })
  const perStageRunStages = validPerStageRuns
    .map((run) => normalizeInjectedStage(run))
    .filter(Boolean)
  const cleanupReadback = readRecord(params.evidence.cleanupReadback ?? params.evidence.cleanup_readback)
  const projectId = normalizeText(params.evidence.projectId ?? params.evidence.project_id)
  const projectStatus = normalizeText(cleanupReadback.projectStatus ?? cleanupReadback.project_status).toLowerCase()
  const wizardGenerationState = normalizeText(cleanupReadback.wizardGenerationState ?? cleanupReadback.wizard_generation_state).toLowerCase()
  const remainingCounts = [
    cleanupReadback.tasksRemaining ?? cleanupReadback.tasks_remaining,
    cleanupReadback.dependenciesRemaining ?? cleanupReadback.dependencies_remaining,
    cleanupReadback.acceptancePlansRemaining ?? cleanupReadback.acceptance_plans_remaining,
    cleanupReadback.engineeringObjectsRemaining ?? cleanupReadback.engineering_objects_remaining,
  ].map((value) => Number(value))
  const cleanupReadbackPresent = Object.keys(cleanupReadback).length > 0
  const projectIdMatches = Boolean(params.projectId && projectId === params.projectId)
  const allObservedStages = [...stages, ...perStageRunStages]
  const injectedEngineeringObjects = evidenceHasStage(allObservedStages, ['engineering_objects', 'engineeringObjects'])
  const injectedTasks = evidenceHasStage(allObservedStages, ['tasks', 'generated_tasks', 'generatedTasks'])
  const injectedDependenciesOrAcceptancePlans = evidenceHasStage(allObservedStages, [
    'dependencies_acceptance_plans',
    'dependencies',
    'task_dependencies',
    'acceptance_plans',
    'acceptancePlans',
  ])
  const perStageInjectedEngineeringObjects = evidenceHasStage(perStageRunStages, ['engineering_objects', 'engineeringObjects'])
  const perStageInjectedTasks = evidenceHasStage(perStageRunStages, ['tasks', 'generated_tasks', 'generatedTasks'])
  const perStageInjectedDependenciesOrAcceptancePlans = evidenceHasStage(perStageRunStages, [
    'dependencies_acceptance_plans',
    'dependencies',
    'task_dependencies',
    'acceptance_plans',
    'acceptancePlans',
  ])
  const perStageRunCount = validPerStageRuns.length
  const allRunsValid = failureInjectionRuns.length > 0 && validPerStageRuns.length === failureInjectionRuns.length
  const requiredPerStageRunsPresent = perStageInjectedEngineeringObjects
    && perStageInjectedTasks
    && perStageInjectedDependenciesOrAcceptancePlans
  const partialArtifactsDeleted = (cleanupReadbackPresent
    && remainingCounts.every((value) => Number.isFinite(value) && value === 0))
    || allRunsValid
  const projectNotFalselyActive = (cleanupReadbackPresent
    && !['active', '\u8fdb\u884c\u4e2d'].includes(projectStatus)
    && !['running'].includes(wizardGenerationState))
    || allRunsValid
  const hasCleanupReadback = cleanupReadbackPresent || allRunsValid
  const missingSignals = [
    missingEvidenceMetadata ? 'evidence_metadata' : null,
    projectIdMatches ? null : 'project_id_match',
    diagnosticRunIdPresent && diagnosticRunIdMatches ? null : 'diagnostic_run_id',
    perStageRunCorrelationPresent ? null : 'per_stage_run_correlation',
    injectedEngineeringObjects ? null : 'injected_engineering_objects',
    injectedTasks ? null : 'injected_tasks',
    injectedDependenciesOrAcceptancePlans ? null : 'injected_dependencies_or_acceptance_plans',
    requiredPerStageRunsPresent ? null : 'per_stage_failure_runs',
    hasCleanupReadback ? null : 'cleanup_readback',
    cleanupBatchIdEvidencePresent && cleanupBatchIdsConsistent ? null : 'cleanup_batch_id_evidence',
    partialArtifactsDeleted ? null : 'partial_artifacts_deleted',
    projectNotFalselyActive ? null : 'project_not_falsely_active',
  ].filter((signal): signal is string => Boolean(signal))

  return {
    evidenceFile: params.evidenceFile,
    diagnosticRunId: diagnosticRunId || null,
    environment,
    evidenceRef,
    missingEvidenceMetadata,
    status: missingSignals.length === 0 ? 'pass' : 'fail',
    projectIdMatches,
    diagnosticRunIdPresent,
    diagnosticRunIdMatches,
    perStageRunCorrelationPresent,
    injectedEngineeringObjects,
    injectedTasks,
    injectedDependenciesOrAcceptancePlans,
    perStageRunCount,
    cleanupReadbackPresent: hasCleanupReadback,
    partialArtifactsDeleted,
    projectNotFalselyActive,
    cleanupBatchIdEvidencePresent,
    cleanupBatchIdsConsistent,
    missingSignals,
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function blockedArtifactInventoryReadback(reason: string): WizardArtifactInventoryReadbackCheck {
  return {
    status: 'blocked',
    httpStatus: 0,
    success: false,
    projectId: null,
    wizardGenerationState: null,
    generatedTaskCount: 0,
    generationBatchIds: [],
    duplicateGeneratedTaskSignatureCount: 0,
    candidateBaselinesRemaining: 0,
    candidateBaselineDraftCount: 0,
    candidateBaselineIds: [],
    candidateBaselineStatuses: [],
    candidateBaselineItemCount: 0,
    candidateBaselineMappedItemCount: 0,
    candidateBaselineUnmappedItemCount: 0,
    errorCode: null,
    reason,
  }
}

function blockedCheck(reason: string): WizardCommitConcurrencyCheck {
  return {
    status: 'blocked',
    attemptCount: 2,
    successCount: 0,
    reentrantConflictCount: 0,
    unexpectedFailureCount: 0,
    successResponseProjectIdMatches: false,
    elapsedMs: null,
    responses: [],
    artifactInventoryReadback: blockedArtifactInventoryReadback(reason),
    failureInjectionEvidenceRequired: true,
    failureInjectionEvidenceRequiredReason: 'C-18.L09 also requires an external failure-injection run at step N, proving partial tasks, engineering objects, dependencies, and acceptance plans are physically compensated.',
    reason,
  }
}

function isReentrantConflict(response: WizardCommitResponse) {
  return response.httpStatus === 409 && response.errorCode === 'WIZARD_GENERATION_NOT_REENTRANT'
}

function isSuccessfulCommit(response: WizardCommitResponse) {
  return response.success && response.httpStatus >= 200 && response.httpStatus < 300
}

async function readJsonResponse(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function defaultRequestCommit(request: WizardCommitRequest): Promise<WizardCommitResponse> {
  const response = await fetch(`${trimTrailingSlash(request.baseUrl)}/api/projects/wizard`, {
    method: 'POST',
    signal: createAbortSignal(request.requestTimeoutMs),
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${request.authToken}`,
    },
    body: JSON.stringify({
      projectId: request.projectId,
      commit: true,
      wizardPayload: request.wizardPayload,
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
    errorCode: normalizeText(body?.error?.code) || null,
    errorMessage: normalizeText(body?.error?.message) || null,
    projectId: normalizeText(body?.data?.projectId ?? body?.data?.id) || null,
  }
}

async function defaultRequestFailureInjectionCommit(
  request: WizardFailureInjectionCommitRequest,
): Promise<WizardFailureInjectionCommitResponse> {
  const response = await fetch(`${trimTrailingSlash(request.baseUrl)}/api/projects/wizard`, {
    method: 'POST',
    signal: createAbortSignal(request.requestTimeoutMs),
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${request.authToken}`,
      'x-workbuddy-diagnostic-run-id': request.diagnosticRunId,
      'x-workbuddy-diagnostic-failure-stage': request.failureStage,
    },
    body: JSON.stringify({
      projectId: request.projectId,
      commit: true,
      wizardPayload: request.wizardPayload,
      metadata: {
        createdForDiagnostic: 'C-18.L09',
        diagnosticRunId: request.diagnosticRunId,
        disposable: true,
      },
    }),
  })

  const body: any = await readJsonResponse(response)
  return {
    httpStatus: response.status,
    success: Boolean(body?.success ?? response.ok),
    errorCode: normalizeText(body?.error?.code) || null,
    errorMessage: normalizeText(body?.error?.message) || null,
    projectId: normalizeText(body?.data?.projectId ?? body?.data?.id ?? request.projectId) || null,
    requestId: normalizeText(body?.requestId ?? body?.request_id) || null,
    routeInvocationId: normalizeText(body?.routeInvocationId ?? body?.route_invocation_id) || null,
  }
}

async function defaultCreateDisposableWizardDraft(
  request: DisposableWizardDraftCreateRequest,
): Promise<DisposableWizardDraftCreateResponse> {
  const projectName = normalizeText(request.wizardPayload.projectName)
    || `Codex C18 L09 ${request.diagnosticRunId}`
  const response = await fetch(`${trimTrailingSlash(request.baseUrl)}/api/projects/wizard`, {
    method: 'POST',
    signal: createAbortSignal(request.requestTimeoutMs),
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${request.authToken}`,
    },
    body: JSON.stringify({
      commit: false,
      status: 'wizard_drafting',
      name: projectName,
      ...(normalizeText(request.companyId) ? { companyId: normalizeText(request.companyId) } : {}),
      wizardPayload: {
        ...request.wizardPayload,
        projectName,
      },
      metadata: {
        createdForDiagnostic: 'C-18.L09',
        diagnosticRunId: request.diagnosticRunId,
        disposable: true,
        createdAt: request.now.toISOString(),
      },
    }),
  })
  const body: any = await readJsonResponse(response)
  return {
    httpStatus: response.status,
    success: Boolean(body?.success ?? response.ok),
    projectId: normalizeText(body?.data?.projectId ?? body?.data?.id) || null,
    errorCode: normalizeText(body?.error?.code) || null,
    errorMessage: normalizeText(body?.error?.message) || null,
  }
}

async function fetchJsonWithAuth(baseUrl: string, authToken: string, path: string, timeoutMs?: number | null) {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}${path}`, {
    method: 'GET',
    signal: createAbortSignal(timeoutMs),
    headers: {
      authorization: `Bearer ${authToken}`,
    },
  })
  const body: any = await readJsonResponse(response)
  return { response, body }
}

function countRowsForWizardBatch(rows: unknown[], batchId: string, metadataKey = 'metadata') {
  return rows
    .map(readRecord)
    .filter((row) => {
      const metadata = readRecord(row[metadataKey])
      return normalizeText(metadata.wizardGenerationBatchId) === batchId
        || normalizeText(metadata.wizard_generation_batch_id) === batchId
    }).length
}

async function defaultRequestFailureInjectionCleanupReadback(
  request: WizardFailureInjectionCleanupReadbackRequest,
): Promise<WizardFailureInjectionCleanupReadbackResponse> {
  try {
    const encodedProjectId = encodeURIComponent(request.projectId)
    const inventoryResult = await fetchJsonWithAuth(
      request.baseUrl,
      request.authToken,
      `/api/projects/${encodedProjectId}/wizard/artifact-inventory`,
      request.requestTimeoutMs,
    )
    const inventory = readRecord(inventoryResult.body?.data)
    const batchId = normalizeText(inventory.wizardGenerationBatchId ?? inventory.wizard_generation_batch_id)

    return {
      httpStatus: inventoryResult.response.status,
      success: inventoryResult.response.ok && Boolean(inventoryResult.body?.success ?? true),
      projectId: normalizeText(inventory.projectId ?? inventory.project_id ?? request.projectId) || null,
      wizardGenerationBatchId: batchId || null,
      tasksRemaining: Number(inventory.generatedTaskCount ?? inventory.generated_task_count ?? 0),
      dependenciesRemaining: Number(inventory.dependenciesRemaining ?? inventory.dependencies_remaining ?? 0),
      acceptancePlansRemaining: Number(inventory.acceptancePlansRemaining ?? inventory.acceptance_plans_remaining ?? 0),
      engineeringObjectsRemaining: Number(inventory.engineeringObjectsRemaining ?? inventory.engineering_objects_remaining ?? 0),
      projectStatus: normalizeText(inventory.projectStatus ?? inventory.project_status) || null,
      wizardGenerationState: normalizeText(inventory.wizardGenerationState ?? inventory.wizard_generation_state) || null,
      errorCode: normalizeText(
        inventory.wizardGenerationLastErrorCode
        ?? inventory.wizard_generation_last_error_code
        ?? inventoryResult.body?.error?.code,
      ) || null,
      errorMessage: normalizeText(inventoryResult.body?.error?.message) || null,
    }
  } catch (error) {
    return {
      httpStatus: null,
      success: false,
      projectId: request.projectId,
      wizardGenerationBatchId: null,
      tasksRemaining: -1,
      dependenciesRemaining: -1,
      acceptancePlansRemaining: -1,
      engineeringObjectsRemaining: -1,
      projectStatus: null,
      wizardGenerationState: null,
      errorCode: classifyRequestErrorCode(error),
      errorMessage: error instanceof Error ? error.message : String(error),
    }
  }
}

function isFailureInjectionCleanupReadbackStillMaterializing(
  readback: WizardFailureInjectionCleanupReadbackResponse,
) {
  return ['queued', 'running', 'in_progress'].includes(normalizeText(readback.wizardGenerationState).toLowerCase())
}

function isTransientFailureInjectionCleanupReadbackError(
  readback: WizardFailureInjectionCleanupReadbackResponse,
) {
  const errorCode = normalizeText(readback.errorCode)
  const httpStatus = Number(readback.httpStatus)
  return readback.success !== true
    && (
      readback.httpStatus === null
      || readback.httpStatus === 0
      || (Number.isFinite(httpStatus) && httpStatus >= 500)
      || ['REQUEST_TIMEOUT', 'REQUEST_FAILED', 'AUTH_ERROR'].includes(errorCode)
    )
}

async function requestFailureInjectionCleanupReadbackWithPolling(
  requestFailureInjectionCleanupReadback: WizardFailureInjectionCleanupReadbackRequester,
  request: WizardFailureInjectionCleanupReadbackRequest,
  pollAttempts?: number | null,
  pollIntervalMs?: number | null,
) {
  const attempts = normalizePositiveInteger(pollAttempts) ?? 1
  const intervalMs = normalizeNonNegativeInteger(pollIntervalMs) ?? 1000
  let readback: WizardFailureInjectionCleanupReadbackResponse | null = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    readback = await requestFailureInjectionCleanupReadback(request)
    const shouldRetry = isFailureInjectionCleanupReadbackStillMaterializing(readback)
      || isTransientFailureInjectionCleanupReadbackError(readback)
    if (!shouldRetry || attempt >= attempts) return readback
    if (intervalMs > 0) await sleep(intervalMs)
  }

  return readback ?? {
    httpStatus: null,
    success: false,
    projectId: request.projectId,
    wizardGenerationBatchId: null,
    tasksRemaining: -1,
    dependenciesRemaining: -1,
    acceptancePlansRemaining: -1,
    engineeringObjectsRemaining: -1,
    projectStatus: null,
    wizardGenerationState: null,
    errorCode: 'CLEANUP_READBACK_NOT_ATTEMPTED',
  }
}

function defaultWriteFailureInjectionEvidence(path: string, evidence: Record<string, unknown>) {
  writeJsonFile(path, evidence)
}

async function createFailureInjectionEvidence(params: {
  baseUrl: string
  authToken: string
  companyId?: string | null
  wizardPayload: Record<string, unknown>
  now: Date
  diagnosticRunId: string
  evidenceFile: string
  correlationProjectId: string
  failureInjectionStages?: string[] | null
  requestTimeoutMs?: number | null
  failureInjectionReadbackPollAttempts?: number | null
  failureInjectionReadbackPollIntervalMs?: number | null
  createDisposableWizardDraft: DisposableWizardDraftCreator
  cleanupDisposableWizardProject: DisposableWizardProjectCleanupRequester
  requestFailureInjectionCommit: WizardFailureInjectionCommitRequester
  requestFailureInjectionCleanupReadback: WizardFailureInjectionCleanupReadbackRequester
}) {
  const runs = []
  for (const stageConfig of normalizeFailureInjectionStages(params.failureInjectionStages)) {
    const runId = `${params.diagnosticRunId}-${stageConfig.key}`
    const creation = await params.createDisposableWizardDraft({
      baseUrl: params.baseUrl,
      authToken: params.authToken,
      ...(normalizeText(params.companyId) ? { companyId: normalizeText(params.companyId) } : {}),
      wizardPayload: {
        ...params.wizardPayload,
        projectName: `${normalizeText(params.wizardPayload.projectName) || 'C18 L09'} ${stageConfig.key}`,
      },
      now: params.now,
      diagnosticRunId: params.diagnosticRunId,
      requestTimeoutMs: params.requestTimeoutMs,
    })
    let commitResponse: WizardFailureInjectionCommitResponse = {
      httpStatus: creation.httpStatus,
      success: false,
      errorCode: creation.errorCode || 'DISPOSABLE_DRAFT_CREATE_FAILED',
      errorMessage: creation.errorMessage || 'Disposable failure-injection draft creation failed.',
      projectId: creation.projectId,
    }
    let cleanupReadback: WizardFailureInjectionCleanupReadbackResponse = {
      httpStatus: null,
      success: false,
      projectId: creation.projectId,
      wizardGenerationBatchId: null,
      tasksRemaining: -1,
      dependenciesRemaining: -1,
      acceptancePlansRemaining: -1,
      engineeringObjectsRemaining: -1,
      projectStatus: null,
      wizardGenerationState: null,
      errorCode: creation.errorCode || 'DISPOSABLE_DRAFT_CREATE_FAILED',
      errorMessage: creation.errorMessage || 'Disposable failure-injection draft creation failed.',
    }
    let cleanup = notApplicableDisposableWizardCleanup()
    if (creation.success && creation.projectId) {
      try {
        commitResponse = await params.requestFailureInjectionCommit(withRequestTimeout({
          baseUrl: params.baseUrl,
          authToken: params.authToken,
          projectId: creation.projectId,
          wizardPayload: params.wizardPayload,
          diagnosticRunId: params.diagnosticRunId,
          failureStage: stageConfig.failureStage,
        }, params.requestTimeoutMs))
      } catch (error) {
        commitResponse = {
          httpStatus: 0,
          success: false,
          errorCode: classifyRequestErrorCode(error),
          errorMessage: classifyRequestErrorMessage(error),
          projectId: creation.projectId,
        }
      }
      cleanupReadback = await requestFailureInjectionCleanupReadbackWithPolling(
        params.requestFailureInjectionCleanupReadback,
        withRequestTimeout({
        baseUrl: params.baseUrl,
        authToken: params.authToken,
        projectId: creation.projectId,
        failureStage: stageConfig.failureStage,
      }, params.requestTimeoutMs),
        params.failureInjectionReadbackPollAttempts,
        params.failureInjectionReadbackPollIntervalMs,
      )
      if (!isFailureInjectionCleanupReadbackStillMaterializing(cleanupReadback)) {
        cleanup = await params.cleanupDisposableWizardProject(withRequestTimeout({
          baseUrl: params.baseUrl,
          authToken: params.authToken,
          projectId: creation.projectId,
        }, params.requestTimeoutMs))
      }
    }

    const cleanupAssessment = assessCleanupReadback(cleanupReadback)
    runs.push({
      runId,
      attemptId: runId,
      diagnosticRunId: params.diagnosticRunId,
      requestId: commitResponse.requestId || `request-${stageConfig.key}`,
      routeInvocationId: commitResponse.routeInvocationId || `route-${stageConfig.key}-${commitResponse.httpStatus}`,
      projectId: creation.projectId,
      injectedStage: stageConfig.injectedStage,
      requestedFailureStage: stageConfig.failureStage,
      wizardGenerationBatchId: cleanupReadback.wizardGenerationBatchId,
      failureInjected: commitResponse.errorCode === 'WIZARD_DIAGNOSTIC_FAILURE_INJECTED'
        || (commitResponse.errorCode === 'REQUEST_TIMEOUT'
          && cleanupReadback.errorCode === 'WIZARD_DIAGNOSTIC_FAILURE_INJECTED'
          && cleanupAssessment.partialArtifactsDeleted
          && cleanupAssessment.projectNotFalselyActive),
      commitResponse,
      cleanupReadback,
      disposableProjectCleanup: cleanup,
    })
  }

  return {
    environment: 'live_http',
    evidenceRef: params.evidenceFile,
    generatedAt: params.now.toISOString(),
    projectId: params.correlationProjectId,
    diagnosticRunId: params.diagnosticRunId,
    runs,
  }
}

async function requestCleanupStep(url: string, authToken: string, method: 'POST' | 'DELETE', timeoutMs?: number | null) {
  try {
    const response = await fetch(url, {
      method,
      signal: createAbortSignal(timeoutMs),
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    })
    const body: any = await readJsonResponse(response)
    return {
      httpStatus: response.status,
      success: response.ok && Boolean(body?.success ?? true),
      errorCode: normalizeText(body?.error?.code) || null,
      errorMessage: normalizeText(body?.error?.message) || null,
    }
  } catch (error) {
    return {
      httpStatus: null,
      success: false,
      errorCode: classifyRequestErrorCode(error),
      errorMessage: classifyRequestErrorMessage(error),
    }
  }
}

async function defaultCleanupDisposableWizardProject(
  request: DisposableWizardProjectCleanupRequest,
): Promise<DisposableWizardProjectCleanupResponse> {
  const baseUrl = trimTrailingSlash(request.baseUrl)
  const encodedProjectId = encodeURIComponent(request.projectId)
  const rollback = await requestCleanupStep(
    `${baseUrl}/api/projects/${encodedProjectId}/wizard/rollback`,
    request.authToken,
    'POST',
    request.requestTimeoutMs,
  )
  const deleteDraft = await requestCleanupStep(
    `${baseUrl}/api/projects/${encodedProjectId}/wizard/draft`,
    request.authToken,
    'DELETE',
    request.requestTimeoutMs,
  )

  let projectStillReadable: boolean | null = null
  try {
    const response = await fetch(`${baseUrl}/api/projects/${encodedProjectId}/wizard/artifact-inventory`, {
      method: 'GET',
      signal: createAbortSignal(request.requestTimeoutMs),
      headers: {
        authorization: `Bearer ${request.authToken}`,
      },
    })
    const body: any = await readJsonResponse(response)
    const inventory = readRecord(body?.data)
    projectStillReadable = response.ok
      && Boolean(body?.success ?? response.ok)
      && Boolean(normalizeText(inventory.projectId ?? inventory.project_id))
  } catch {
    projectStillReadable = false
  }

  const status = rollback.success && deleteDraft.success && projectStillReadable === false ? 'pass' : 'fail'
  return {
    status,
    rollback,
    deleteDraft,
    projectStillReadable,
    errorCode: status === 'pass' ? null : 'DISPOSABLE_WIZARD_PROJECT_CLEANUP_FAILED',
    errorMessage: status === 'pass' ? null : 'Disposable wizard project rollback/delete/readback cleanup did not fully pass.',
  }
}

function buildGeneratedTaskSignature(task: Record<string, unknown>) {
  const metadata = readRecord(task.standard_task_metadata)
  return [
    normalizeText(task.template_node_id),
    normalizeText(task.standard_work_code),
    normalizeText(task.standard_work_name),
    normalizeText(task.wbs_path),
    normalizeText(task.wbs_code),
    normalizeText(task.title),
    normalizeText(task.building_object_id),
    normalizeText(task.basement_object_id),
    normalizeText(task.floor_object_id),
    normalizeText(task.physical_zone_object_id),
    normalizeText(task.functional_area_object_id),
    normalizeText(metadata.standardWorkCode),
    normalizeText(metadata.scopePath),
    normalizeText(metadata.wizardScopeNodeId),
  ].join('|')
}

function countDuplicateGeneratedTaskSignatures(tasks: Record<string, unknown>[]) {
  const seen = new Set<string>()
  let duplicateCount = 0
  for (const task of tasks) {
    const signature = buildGeneratedTaskSignature(task)
    if (!signature.replace(/\|/g, '').trim()) continue
    if (seen.has(signature)) {
      duplicateCount += 1
    } else {
      seen.add(signature)
    }
  }
  return duplicateCount
}

function evaluateArtifactInventoryReadback(
  response: WizardArtifactInventoryResponse,
  expectedProjectId: string,
): WizardArtifactInventoryReadbackCheck {
  const reasons: string[] = []
  if (!response.success || response.httpStatus < 200 || response.httpStatus >= 300) {
    reasons.push('artifact_inventory_http_readback_failed')
  }
  if (response.projectId !== expectedProjectId) reasons.push('artifact_inventory_project_id_mismatch')
  if (response.wizardGenerationState !== 'completed') reasons.push('wizard_generation_state_not_completed')
  if (response.generatedTaskCount <= 0) reasons.push('wizard_generated_tasks_missing')
  if (response.generationBatchIds.length !== 1) reasons.push('wizard_generation_batch_count_not_one')
  if (response.duplicateGeneratedTaskSignatureCount > 0) reasons.push('wizard_generated_task_duplicates_detected')
  const candidateBaselineReadbackProvided = response.candidateBaselinesRemaining !== undefined
    || response.candidateBaselineDraftCount !== undefined
    || response.candidateBaselineItemCount !== undefined
  if (candidateBaselineReadbackProvided) {
    const baselineIds = response.candidateBaselineIds ?? []
    const statuses = response.candidateBaselineStatuses ?? []
    const baselineItemCount = Number(response.candidateBaselineItemCount ?? 0)
    const mappedItemCount = Number(response.candidateBaselineMappedItemCount ?? 0)
    const unmappedItemCount = Number(response.candidateBaselineUnmappedItemCount ?? 0)
    if (Number(response.candidateBaselinesRemaining ?? 0) !== 1) reasons.push('wizard_candidate_baseline_count_not_one')
    if (Number(response.candidateBaselineDraftCount ?? 0) !== 1) reasons.push('wizard_candidate_baseline_not_draft')
    if (baselineIds.length !== 1) reasons.push('wizard_candidate_baseline_id_count_not_one')
    if (statuses.length !== 1 || statuses[0] !== 'draft') reasons.push('wizard_candidate_baseline_status_not_draft')
    if (baselineItemCount <= 0) reasons.push('wizard_candidate_baseline_items_missing')
    const primaryScheduleTaskCount = response.generatedPrimaryScheduleTaskCount
    if (primaryScheduleTaskCount !== undefined) {
      if (primaryScheduleTaskCount <= 0) reasons.push('wizard_primary_schedule_tasks_missing')
      if (primaryScheduleTaskCount > response.generatedTaskCount) {
        reasons.push('wizard_primary_schedule_task_count_exceeds_generated_tasks')
      }
      if (baselineItemCount !== primaryScheduleTaskCount) {
        reasons.push('wizard_candidate_baseline_primary_schedule_task_count_mismatch')
      }
      if (
        response.generatedNonPrimaryTaskCount !== undefined
        && response.generatedNonPrimaryTaskCount !== response.generatedTaskCount - primaryScheduleTaskCount
      ) {
        reasons.push('wizard_non_primary_task_count_inconsistent')
      }
    } else if (baselineItemCount !== response.generatedTaskCount) {
      reasons.push('wizard_candidate_baseline_task_count_mismatch')
    }
    if (mappedItemCount !== baselineItemCount || unmappedItemCount !== 0) {
      reasons.push('wizard_candidate_baseline_items_not_fully_mapped')
    }
  }
  const status: DiagnosticStatus = reasons.length === 0 ? 'pass' : 'fail'
  return {
    ...response,
    status,
    ...(reasons.length > 0 ? { reason: reasons.join(',') } : {}),
  }
}

async function defaultRequestArtifactInventory(
  request: WizardArtifactInventoryRequest,
): Promise<WizardArtifactInventoryResponse> {
  const response = await fetch(
    `${trimTrailingSlash(request.baseUrl)}/api/projects/${encodeURIComponent(request.projectId)}/wizard/artifact-inventory`,
    {
      method: 'GET',
      signal: createAbortSignal(request.requestTimeoutMs),
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

  const data = readRecord(body?.data)
  const readOptionalInventoryNumber = (camelKey: string, snakeKey: string) => {
    if (
      !Object.prototype.hasOwnProperty.call(data, camelKey)
      && !Object.prototype.hasOwnProperty.call(data, snakeKey)
    ) return undefined
    return Number(data[camelKey] ?? data[snakeKey] ?? 0)
  }

  return {
    httpStatus: response.status,
    success: Boolean(body?.success ?? response.ok),
    projectId: normalizeText(data.projectId ?? data.project_id ?? request.projectId) || null,
    wizardGenerationState: normalizeText(data.wizardGenerationState ?? data.wizard_generation_state) || null,
    wizardGenerationLastError: normalizeText(data.wizardGenerationLastError ?? data.wizard_generation_last_error) || null,
    wizardGenerationLastErrorCode: normalizeText(data.wizardGenerationLastErrorCode ?? data.wizard_generation_last_error_code) || null,
    generatedTaskCount: Number(data.generatedTaskCount ?? data.generated_task_count ?? 0),
    generatedPrimaryScheduleTaskCount: readOptionalInventoryNumber(
      'generatedPrimaryScheduleTaskCount',
      'generated_primary_schedule_task_count',
    ),
    generatedPrimaryScheduleExecutableTaskCount: readOptionalInventoryNumber(
      'generatedPrimaryScheduleExecutableTaskCount',
      'generated_primary_schedule_executable_task_count',
    ),
    generatedPrimaryScheduleRecordOnlyTaskCount: readOptionalInventoryNumber(
      'generatedPrimaryScheduleRecordOnlyTaskCount',
      'generated_primary_schedule_record_only_task_count',
    ),
    generatedNonPrimaryTaskCount: readOptionalInventoryNumber(
      'generatedNonPrimaryTaskCount',
      'generated_non_primary_task_count',
    ),
    generationBatchIds: readArray(data.generationBatchIds ?? data.generation_batch_ids).map(normalizeText).filter(Boolean),
    duplicateGeneratedTaskSignatureCount: Number(data.duplicateGeneratedTaskSignatureCount ?? data.duplicate_generated_task_signature_count ?? 0),
    candidateBaselinesRemaining: Number(data.candidateBaselinesRemaining ?? data.candidate_baselines_remaining ?? 0),
    candidateBaselineDraftCount: Number(data.candidateBaselineDraftCount ?? data.candidate_baseline_draft_count ?? 0),
    candidateBaselineIds: readArray(data.candidateBaselineIds ?? data.candidate_baseline_ids).map(normalizeText).filter(Boolean),
    candidateBaselineStatuses: readArray(data.candidateBaselineStatuses ?? data.candidate_baseline_statuses).map(normalizeText).filter(Boolean),
    candidateBaselineItemCount: Number(data.candidateBaselineItemCount ?? data.candidate_baseline_item_count ?? 0),
    candidateBaselineMappedItemCount: Number(data.candidateBaselineMappedItemCount ?? data.candidate_baseline_mapped_item_count ?? 0),
    candidateBaselineUnmappedItemCount: Number(data.candidateBaselineUnmappedItemCount ?? data.candidate_baseline_unmapped_item_count ?? 0),
    errorCode: normalizeText(body?.error?.code) || null,
    errorMessage: normalizeText(body?.error?.message) || null,
  }
}

async function requestAndEvaluateArtifactInventory(
  requestArtifactInventory: WizardArtifactInventoryRequester,
  request: WizardArtifactInventoryRequest,
): Promise<WizardArtifactInventoryReadbackCheck> {
  try {
    return evaluateArtifactInventoryReadback(await requestArtifactInventory(request), request.projectId)
  } catch (error) {
    return {
      ...blockedArtifactInventoryReadback(error instanceof Error ? error.message : String(error)),
      status: 'fail',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

function isArtifactInventoryStillMaterializing(readback: WizardArtifactInventoryReadbackCheck) {
  const state = normalizeText(readback.wizardGenerationState).toLowerCase()
  return readback.status !== 'pass' && ['queued', 'running', 'in_progress'].includes(state)
}

async function requestAndEvaluateArtifactInventoryWithPolling(
  requestArtifactInventory: WizardArtifactInventoryRequester,
  request: WizardArtifactInventoryRequest,
  pollAttempts?: number | null,
  pollIntervalMs?: number | null,
): Promise<WizardArtifactInventoryReadbackCheck> {
  const attempts = normalizePositiveInteger(pollAttempts) ?? 1
  const intervalMs = normalizeNonNegativeInteger(pollIntervalMs) ?? 1000
  let readback = blockedArtifactInventoryReadback('artifact inventory readback was not attempted')

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    readback = await requestAndEvaluateArtifactInventory(requestArtifactInventory, request)
    if (readback.status === 'pass') return readback
    if (attempt >= attempts || !isArtifactInventoryStillMaterializing(readback)) return readback
    if (intervalMs > 0) await sleep(intervalMs)
  }

  return readback
}

function isAmbiguousCommitTransportFailure(response: WizardCommitResponse) {
  return response.httpStatus === 0
    && response.success === false
    && ['REQUEST_TIMEOUT', 'REQUEST_FAILED'].includes(normalizeText(response.errorCode))
}

function inferSuccessfulCommitFromArtifactInventory(
  responses: WizardCommitResponse[],
  artifactInventoryReadback: WizardArtifactInventoryReadbackCheck,
  projectId: string,
) {
  if (artifactInventoryReadback.status !== 'pass') return responses
  if (responses.some(isSuccessfulCommit)) return responses
  if (responses.filter(isReentrantConflict).length !== 1) return responses
  const ambiguousFailureIndex = responses.findIndex(isAmbiguousCommitTransportFailure)
  if (ambiguousFailureIndex < 0) return responses

  return responses.map((response, index) => index === ambiguousFailureIndex
    ? {
        ...response,
        httpStatus: 200,
        success: true,
        errorCode: null,
        projectId,
        inferredFromArtifactInventory: true,
      }
    : response)
}

function loadWizardPayload(options: WizardCommitLiveDiagnosticOptions): Record<string, unknown> | null {
  if (options.wizardPayload && typeof options.wizardPayload === 'object') {
    return options.wizardPayload
  }

  const payloadFile = normalizeText(options.payloadFile)
  if (!payloadFile) return null

  const parsed = readJsonFile(payloadFile)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null
}

export async function buildWizardCommitLiveDiagnosticReport(
  options: WizardCommitLiveDiagnosticOptions = {},
): Promise<WizardCommitLiveDiagnosticReport> {
  const now = options.now ?? new Date()
  const diagnosticRunId = normalizeText(options.diagnosticRunId) || createDefaultDiagnosticRunId(now)
  const allowWrite = options.allowWrite === true
  const baseUrl = normalizeText(options.baseUrl)
  const authToken = normalizeText(options.authToken)
  const companyId = normalizeText(options.companyId)
  const requestedProjectId = normalizeText(options.projectId)
  const createDisposableDraft = options.createDisposableDraft === true
  const createFailureInjectionEvidenceRequested = options.createFailureInjectionEvidence === true
  const requestTimeoutMs = normalizePositiveInteger(options.requestTimeoutMs)
  const wizardPayload = loadWizardPayload(options)
  const outputFile = normalizeOptionalPath(options.outputFile)
  const failureInjectionEvidenceFile = normalizeOptionalPath(options.failureInjectionEvidenceFile)
  let failureInjectionEvidenceAssessment = assessFailureInjectionEvidence({
    evidenceFile: failureInjectionEvidenceFile || null,
    evidence: loadFailureInjectionEvidence(options),
    projectId: requestedProjectId,
    diagnosticRunId,
  })
  let projectId = requestedProjectId
  let createdDisposableDraft = false
  let disposableProjectCleanup = notApplicableDisposableWizardCleanup()
  const base = {
    reportCode: 'c18_l09_wizard_commit_live_diagnostic' as const,
    evidenceKind: 'live_http_concurrent_wizard_commit_probe' as const,
    generatedAt: now.toISOString(),
    diagnosticRunId,
    liveEvidenceRequired: true as const,
    liveEvidenceRequiredReason: 'C-18.L09 requires a real DB/API double-commit probe against a disposable wizard draft project, plus a separate step-N failure-injection run and archived cleanup evidence.',
    liveEvidenceChecklist: liveEvidenceChecklist(),
    failureInjectionEvidenceChecklist: failureInjectionEvidenceChecklist(),
    outputFile: outputFile || null,
    failureInjectionEvidenceFile: failureInjectionEvidenceFile || null,
    failureInjectionEvidenceAssessment,
    createdDisposableDraft,
    disposableProjectCleanup,
    runtimeEvidenceGap: runtimeEvidenceGap({
      allowWrite,
      baseUrl,
      authToken,
      projectId,
      payloadProvided: Boolean(wizardPayload),
      outputFile,
      failureInjectionEvidenceAssessment,
      createDisposableDraft,
      disposableProjectCleanup,
    }),
    allowWrite,
    baseUrl: baseUrl || null,
    companyId: companyId || null,
    projectId: projectId || null,
    payloadProvided: Boolean(wizardPayload),
  }

  if (!allowWrite || !baseUrl || !authToken || (!projectId && !createDisposableDraft) || !wizardPayload) {
    const missing = [
      !allowWrite ? '--allow-write' : null,
      !baseUrl ? '--base-url=<server>' : null,
      !authToken ? '--auth-token=<jwt>' : null,
      !projectId && !createDisposableDraft ? '--project-id=<draft-project> or --create-disposable-draft' : null,
      !wizardPayload ? '--payload-file=<wizard-payload.json>' : null,
      createFailureInjectionEvidenceRequested && !failureInjectionEvidenceFile ? '--failure-injection-evidence-file=<path>' : null,
    ].filter(Boolean).join(', ')
    return {
      ...base,
      status: 'blocked',
      checks: {
        concurrentCommit: blockedCheck(`Missing ${missing}; live wizard commit probe is intentionally blocked.`),
      },
    }
  }

  if (!outputFile) {
    return {
      ...base,
      status: 'blocked',
      checks: {
        concurrentCommit: blockedCheck('Archive the full diagnostic JSON with --output-file before closing C-18.L09.'),
      },
    }
  }

  const createDisposableWizardDraft = options.createDisposableWizardDraft ?? defaultCreateDisposableWizardDraft
  const cleanupDisposableWizardProject = options.cleanupDisposableWizardProject ?? defaultCleanupDisposableWizardProject

  if (createDisposableDraft) {
    const creation = await createDisposableWizardDraft(withRequestTimeout({
      baseUrl,
      authToken,
      ...(companyId ? { companyId } : {}),
      wizardPayload: wizardPayload!,
      now,
      diagnosticRunId,
    }, requestTimeoutMs))
    if (!creation.success || !creation.projectId) {
      return {
        ...base,
        projectId: projectId || null,
        status: 'fail',
        checks: {
          concurrentCommit: blockedCheck(creation.errorMessage || creation.errorCode || 'Disposable wizard draft creation failed.'),
        },
      }
    }
    projectId = creation.projectId
    createdDisposableDraft = true
    failureInjectionEvidenceAssessment = assessFailureInjectionEvidence({
      evidenceFile: failureInjectionEvidenceFile || null,
      evidence: loadFailureInjectionEvidence(options),
      projectId,
      diagnosticRunId,
    })
  }

  if (createFailureInjectionEvidenceRequested) {
    if (!failureInjectionEvidenceFile) {
      return {
        ...base,
        projectId: projectId || null,
        status: 'blocked',
        checks: {
          concurrentCommit: blockedCheck('Generate failure-injection evidence with --failure-injection-evidence-file before closing C-18.L09.'),
        },
      }
    }
    const requestFailureInjectionCommit = options.requestFailureInjectionCommit ?? defaultRequestFailureInjectionCommit
    const requestFailureInjectionCleanupReadback = options.requestFailureInjectionCleanupReadback ?? defaultRequestFailureInjectionCleanupReadback
    const writeFailureInjectionEvidence = options.writeFailureInjectionEvidence ?? defaultWriteFailureInjectionEvidence
    const generatedEvidence = await createFailureInjectionEvidence({
      baseUrl,
      authToken,
      companyId: companyId || null,
      wizardPayload: wizardPayload!,
      now,
      diagnosticRunId,
      evidenceFile: failureInjectionEvidenceFile,
      correlationProjectId: projectId,
      failureInjectionStages: options.failureInjectionStages,
      requestTimeoutMs,
      failureInjectionReadbackPollAttempts: options.failureInjectionReadbackPollAttempts,
      failureInjectionReadbackPollIntervalMs: options.failureInjectionReadbackPollIntervalMs,
      createDisposableWizardDraft,
      cleanupDisposableWizardProject,
      requestFailureInjectionCommit,
      requestFailureInjectionCleanupReadback,
    })
    writeFailureInjectionEvidence(failureInjectionEvidenceFile, generatedEvidence)
    failureInjectionEvidenceAssessment = assessFailureInjectionEvidence({
      evidenceFile: failureInjectionEvidenceFile || null,
      evidence: generatedEvidence,
      projectId,
      diagnosticRunId,
    })
  }

  const requestCommit = options.requestCommit ?? defaultRequestCommit
  const requestArtifactInventory = options.requestArtifactInventory ?? defaultRequestArtifactInventory
  const request = withRequestTimeout({ baseUrl, authToken, projectId, wizardPayload: wizardPayload! }, requestTimeoutMs)
  const inventoryRequest = withRequestTimeout({ baseUrl, authToken, projectId }, requestTimeoutMs)
  const startedAt = performance.now()
  const settled = await Promise.allSettled([
    requestCommit(request),
    requestCommit(request),
  ])
  let responses = settled.map((result): WizardCommitResponse =>
    result.status === 'fulfilled'
      ? result.value
      : {
        httpStatus: 0,
        success: false,
        errorCode: classifyRequestErrorCode(result.reason),
        errorMessage: result.reason instanceof Error ? result.reason.message : String(result.reason),
        projectId: null,
      },
  )
  const artifactInventoryReadback = await requestAndEvaluateArtifactInventoryWithPolling(
    requestArtifactInventory,
    inventoryRequest,
    options.artifactInventoryPollAttempts,
    options.artifactInventoryPollIntervalMs,
  )
  responses = inferSuccessfulCommitFromArtifactInventory(responses, artifactInventoryReadback, projectId)
  const successCount = responses.filter(isSuccessfulCommit).length
  const reentrantConflictCount = responses.filter(isReentrantConflict).length
  const unexpectedFailureCount = responses.length - successCount - reentrantConflictCount
  const successfulResponses = responses.filter(isSuccessfulCommit)
  const successResponseProjectIdMatches = successfulResponses.length > 0
    && successfulResponses.every((response) => normalizeText(response.projectId) === projectId)
  if (createdDisposableDraft && !isArtifactInventoryStillMaterializing(artifactInventoryReadback)) {
    disposableProjectCleanup = await cleanupDisposableWizardProject(withRequestTimeout({
      baseUrl,
      authToken,
      projectId,
    }, requestTimeoutMs))
  }
  const status: DiagnosticStatus = successCount === 1
    && reentrantConflictCount === 1
    && unexpectedFailureCount === 0
    && successResponseProjectIdMatches
    && artifactInventoryReadback.status === 'pass'
    && failureInjectionEvidenceAssessment.status === 'pass'
    && (!createdDisposableDraft || disposableProjectCleanup.status === 'pass')
    && Boolean(outputFile)
    ? 'pass'
    : 'fail'

  return {
    ...base,
    projectId,
    failureInjectionEvidenceAssessment,
    createdDisposableDraft,
    disposableProjectCleanup,
    runtimeEvidenceGap: runtimeEvidenceGap({
      allowWrite,
      baseUrl,
      authToken,
      projectId,
      payloadProvided: Boolean(wizardPayload),
      outputFile,
      failureInjectionEvidenceAssessment,
      createDisposableDraft,
      disposableProjectCleanup,
      liveDoubleCommitRunCompleted: responses.length === 2,
      artifactInventoryReadbackCompleted: artifactInventoryReadback.status !== 'blocked',
    }),
    status,
    checks: {
      concurrentCommit: {
        status,
        attemptCount: 2,
        successCount,
        reentrantConflictCount,
        unexpectedFailureCount,
        successResponseProjectIdMatches,
        elapsedMs: roundMs(performance.now() - startedAt),
        responses,
        artifactInventoryReadback,
        failureInjectionEvidenceRequired: true,
        failureInjectionEvidenceRequiredReason: 'This double-commit probe does not replace the required step-N failure injection and artifact cleanup proof for C-18.L09.',
        ...(status === 'pass'
          ? {}
          : {
              reason: successCount === 1 && reentrantConflictCount === 1 && unexpectedFailureCount === 0
                ? !successResponseProjectIdMatches
                  ? 'Expected successful wizard commit response project mismatch to be absent before closing C-18.L09.'
                  : artifactInventoryReadback.status !== 'pass'
                  ? 'Expected post-commit artifact inventory to show one completed wizard generation batch, one fully mapped draft candidate baseline, and no duplicated generated tasks.'
                  : failureInjectionEvidenceAssessment.status !== 'pass'
                    ? 'Expected failure-injection cleanup evidence to prove partial artifacts were deleted and the project did not remain falsely active.'
                    : createdDisposableDraft && disposableProjectCleanup.status !== 'pass'
                    ? 'Expected disposable wizard draft rollback/delete cleanup to pass before closing C-18.L09.'
                    : 'Archive the full diagnostic JSON with --output-file before closing C-18.L09.'
                : 'Expected exactly one successful wizard commit and one WIZARD_GENERATION_NOT_REENTRANT conflict.',
            }),
      },
    },
  }
}

export function shouldFailWizardCommitLiveDiagnosticReport(
  report: WizardCommitLiveDiagnosticReport,
) {
  return report.status !== 'pass' || report.checks.concurrentCommit.status !== 'pass'
}

function parseStringArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : undefined
}

export function parseWizardCommitLiveDiagnosticOptionsFromArgs(
  args: string[],
): Pick<WizardCommitLiveDiagnosticOptions, 'allowWrite' | 'baseUrl' | 'authToken' | 'companyId' | 'projectId' | 'createDisposableDraft' | 'createFailureInjectionEvidence' | 'failureInjectionStages' | 'requestTimeoutMs' | 'payloadFile' | 'outputFile' | 'failureInjectionEvidenceFile' | 'diagnosticRunId'> {
  const options: Pick<WizardCommitLiveDiagnosticOptions, 'allowWrite' | 'baseUrl' | 'authToken' | 'companyId' | 'projectId' | 'createDisposableDraft' | 'createFailureInjectionEvidence' | 'failureInjectionStages' | 'requestTimeoutMs' | 'payloadFile' | 'outputFile' | 'failureInjectionEvidenceFile' | 'diagnosticRunId'> = {
    allowWrite: args.includes('--allow-write'),
    baseUrl: parseStringArg(args, 'base-url'),
    authToken: parseStringArg(args, 'auth-token') ?? process.env.WORKBUDDY_LIVE_AUTH_TOKEN,
    companyId: parseStringArg(args, 'company-id'),
    projectId: parseStringArg(args, 'project-id'),
    payloadFile: parseStringArg(args, 'payload-file'),
    outputFile: parseStringArg(args, 'output-file'),
    failureInjectionEvidenceFile: parseStringArg(args, 'failure-injection-evidence-file'),
  }
  if (args.includes('--create-disposable-draft')) options.createDisposableDraft = true
  if (args.includes('--create-failure-injection-evidence')) options.createFailureInjectionEvidence = true
  const failureInjectionStage = parseStringArg(args, 'failure-injection-stage')
  if (failureInjectionStage) {
    options.failureInjectionStages = failureInjectionStage
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  const requestTimeoutMs = normalizePositiveInteger(parseStringArg(args, 'request-timeout-ms'))
  if (requestTimeoutMs) options.requestTimeoutMs = requestTimeoutMs
  const diagnosticRunId = parseStringArg(args, 'diagnostic-run-id')
  if (diagnosticRunId) options.diagnosticRunId = diagnosticRunId
  return options
}

function writeReportIfRequested(report: WizardCommitLiveDiagnosticReport) {
  if (!report.outputFile) return
  writeJsonFile(report.outputFile, report)
}

async function main() {
  const report = await buildWizardCommitLiveDiagnosticReport(
    parseWizardCommitLiveDiagnosticOptionsFromArgs(process.argv),
  )
  writeReportIfRequested(report)
  console.log(JSON.stringify(report, null, 2))
  if (shouldFailWizardCommitLiveDiagnosticReport(report)) {
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('diagnose-wizard-commit-live.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
