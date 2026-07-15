import { query as rawQuery } from '../database.js'
import { logger } from '../middleware/logger.js'
import {
  recordConstructionOrganizationPlanNetworkRecommendationDecision,
  recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation,
  recordConstructionOrganizationPlanNetworkSavedOutcome,
  type ConstructionOrganizationPlanNetworkUseCaseKey,
} from './constructionOrganizationPlanNetworkRuntimeEvidenceService.js'
import { createDurationRuntimeConsumerObservationQueryExec } from './durationRuntimeConsumerObservationService.js'
import { recalculateProjectCriticalPath } from './projectCriticalPathService.js'

export type WizardPostCommitDerivationKey = 'critical_path' | 'duration_evidence'
export type WizardPostCommitDerivationStatus = 'pending' | 'succeeded' | 'failed'

export type WizardPostCommitDerivationStageState = {
  status: WizardPostCommitDerivationStatus
  attemptCount: number
  lastAttemptAt: string | null
  succeededAt: string | null
  failedAt: string | null
  lastError: string | null
  output: unknown
}

export type WizardPostCommitDerivationState = {
  source: 'wizard_post_commit_derivation_recovery'
  operationId: string
  projectId: string
  generationBatchId: string
  status: WizardPostCommitDerivationStatus
  createdAt: string
  updatedAt: string
  maxAttempts: number
  stages: Record<WizardPostCommitDerivationKey, WizardPostCommitDerivationStageState>
  mutationBoundary: {
    transactionAlreadyCommitted: true
    retriesDerivationsOnly: true
    rewritesGeneratedTasks: false
    rewritesTaskDependencies: false
    rewritesPlanDates: false
  }
}

type WizardPostCommitDerivationExecutor = () => Promise<unknown>

export type WizardPostCommitDerivationQueryExec = <T = Record<string, unknown>>(
  sql: string,
  queryParams?: unknown[],
) => Promise<T[]>

function timestamp(value?: string | null) {
  const normalized = String(value ?? '').trim()
  return normalized || new Date().toISOString()
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readStringArray(value: unknown): string[] {
  return readArray(value).map((item) => normalizeText(item)).filter(Boolean)
}

function pendingStage(): WizardPostCommitDerivationStageState {
  return {
    status: 'pending',
    attemptCount: 0,
    lastAttemptAt: null,
    succeededAt: null,
    failedAt: null,
    lastError: null,
    output: null,
  }
}

function cloneState(state: WizardPostCommitDerivationState): WizardPostCommitDerivationState {
  return {
    ...state,
    stages: {
      critical_path: { ...state.stages.critical_path },
      duration_evidence: { ...state.stages.duration_evidence },
    },
    mutationBoundary: { ...state.mutationBoundary },
  }
}

function overallStatus(state: WizardPostCommitDerivationState): WizardPostCommitDerivationStatus {
  const stages = Object.values(state.stages)
  if (stages.some((stage) => stage.status === 'failed')) return 'failed'
  if (stages.every((stage) => stage.status === 'succeeded')) return 'succeeded'
  return 'pending'
}

export function createPendingWizardPostCommitDerivationState(input: {
  projectId: string
  generationBatchId: string
  createdAt?: string | null
  maxAttempts?: number
}): WizardPostCommitDerivationState {
  const createdAt = timestamp(input.createdAt)
  const maxAttempts = Math.max(1, Math.floor(input.maxAttempts ?? 3))
  return {
    source: 'wizard_post_commit_derivation_recovery',
    operationId: `${input.projectId}:${input.generationBatchId}:wizard_post_commit_derivations`,
    projectId: input.projectId,
    generationBatchId: input.generationBatchId,
    status: 'pending',
    createdAt,
    updatedAt: createdAt,
    maxAttempts,
    stages: {
      critical_path: pendingStage(),
      duration_evidence: pendingStage(),
    },
    mutationBoundary: {
      transactionAlreadyCommitted: true,
      retriesDerivationsOnly: true,
      rewritesGeneratedTasks: false,
      rewritesTaskDependencies: false,
      rewritesPlanDates: false,
    },
  }
}

export async function runWizardPostCommitDerivations(input: {
  state: WizardPostCommitDerivationState
  derivations: Record<WizardPostCommitDerivationKey, WizardPostCommitDerivationExecutor>
  persistState: (state: WizardPostCommitDerivationState) => Promise<void>
  maxAttempts?: number
  now?: () => string
}): Promise<WizardPostCommitDerivationState> {
  let state = cloneState(input.state)
  if (state.status === 'succeeded' || state.status === 'failed') return state
  const maxAttempts = Math.max(1, Math.floor(input.maxAttempts ?? state.maxAttempts ?? 3))
  state.maxAttempts = maxAttempts
  const now = input.now ?? (() => new Date().toISOString())

  for (const key of ['critical_path', 'duration_evidence'] as const) {
    const current = state.stages[key]
    if (current.status === 'succeeded' || current.status === 'failed') continue
    const attemptedAt = timestamp(now())
    state.stages[key] = {
      ...current,
      attemptCount: current.attemptCount + 1,
      lastAttemptAt: attemptedAt,
      lastError: null,
    }
    state.updatedAt = attemptedAt
    await input.persistState(cloneState(state))

    try {
      const output = await input.derivations[key]()
      const succeededAt = timestamp(now())
      state.stages[key] = {
        ...state.stages[key],
        status: 'succeeded',
        succeededAt,
        failedAt: null,
        lastError: null,
        output: output ?? null,
      }
      state.updatedAt = succeededAt
    } catch (error) {
      const failedAt = timestamp(now())
      const attemptCount = state.stages[key].attemptCount
      state.stages[key] = {
        ...state.stages[key],
        status: attemptCount >= maxAttempts ? 'failed' : 'pending',
        failedAt: attemptCount >= maxAttempts ? failedAt : null,
        lastError: errorMessage(error),
        output: null,
      }
      state.updatedAt = failedAt
    }
    state.status = overallStatus(state)
    await input.persistState(cloneState(state))
  }

  state.status = overallStatus(state)
  state.updatedAt = timestamp(now())
  await input.persistState(cloneState(state))
  return state
}

function findConstructionOrganizationPlanOptionById(
  scenario: Record<string, unknown> | null,
  optionId?: string | null,
) {
  const normalizedOptionId = normalizeText(optionId)
  const recommendedPlanOption = readRecord(scenario?.recommendedPlanOption)
  if (normalizedOptionId && normalizeText(recommendedPlanOption.optionId) === normalizedOptionId) {
    return recommendedPlanOption
  }
  const planOptions = readArray(scenario?.planOptions).map(readRecord)
  if (normalizedOptionId) {
    const matchedOption = planOptions.find((option) => normalizeText(option.optionId) === normalizedOptionId)
    if (matchedOption) return matchedOption
  }
  return Object.keys(recommendedPlanOption).length > 0 ? recommendedPlanOption : planOptions[0] ?? {}
}

function readConstructionOrganizationPublicationKey(option: Record<string, unknown>) {
  return normalizeText(readRecord(option.runtimeEngineEvidence).publicationKey)
    || normalizeText(readRecord(option.runtimeMaterializationEvidence).publicationKey)
    || normalizeText(option.publicationKey)
    || null
}

function readConstructionOrganizationPlanOptionRuntimePublication(row: Record<string, unknown>) {
  const candidatePayload = readRecord(row.candidate_payload)
  const option = readRecord(candidatePayload.option)
  if (Object.keys(option).length === 0) return null
  return {
    optionId: normalizeText(option.optionId) || null,
    businessType: normalizeText(option.businessType) || null,
    draftNetworkKey: normalizeText(option.draftNetworkKey) || null,
    publicationKey: readConstructionOrganizationPublicationKey(option),
    publicationStatus: normalizeText(row.event_status) || null,
    selectedScenarioIds: readStringArray(option.selectedScenarioIds),
  }
}

async function queryConstructionOrganizationPlanOptionRuntimePublicationRows(params: {
  projectId: string
  companyId?: string | null
  queryExec: WizardPostCommitDerivationQueryExec
}) {
  const sql = `
    SELECT
      candidate_payload,
      asset_key,
      project_id,
      company_id,
      event_status,
      runtime_effect,
      created_at,
      updated_at
    FROM public.algorithm_asset_candidate_events
    WHERE company_id = $1::uuid
      AND project_id = $2::uuid
      AND asset_key LIKE $3
      AND source_module = $4
      AND event_status = 'runtime_published'
    ORDER BY created_at DESC
    LIMIT 16
  `
  return params.queryExec(sql, [
    normalizeText(params.companyId),
    params.projectId,
    'construction_organization.plan_option.%',
    'constructionOrganizationScenarioGovernanceService',
  ])
}

function buildWizardConstructionOrganizationRuntimeEvidenceCandidate(params: {
  projectId: string
  companyId?: string | null
  scenario: Record<string, unknown> | null
  summary: Record<string, unknown> | null
  useCase: ConstructionOrganizationPlanNetworkUseCaseKey
  generationBatchId: string
  capturedAt: string
  actorId?: string | null
  runtimePublicationRows?: Record<string, unknown>[]
}) {
  const recommendation = readRecord(readRecord(params.summary?.scenarioRecommendations)[params.useCase]
    ?? params.summary?.[params.useCase])
  const selectedDecision = readRecord(readRecord(readRecord(params.summary?.organizationDecisionReport).selectedByUseCase)[params.useCase])
  const optionId = normalizeText(recommendation.optionId)
    || normalizeText(selectedDecision.optionId)
    || normalizeText(params.summary?.recommendedPlanOptionId)
  if (!optionId) return null

  const option = findConstructionOrganizationPlanOptionById(params.scenario, optionId)
  const runtimePublicationRows = params.runtimePublicationRows ?? []
  const runtimePublication = runtimePublicationRows
    .map(readRecord)
    .map(readConstructionOrganizationPlanOptionRuntimePublication)
    .filter((item): item is NonNullable<ReturnType<typeof readConstructionOrganizationPlanOptionRuntimePublication>> => Boolean(item))
    .find((item) => normalizeText(item.optionId) === optionId)
    ?? (runtimePublicationRows.length === 1
      ? readConstructionOrganizationPlanOptionRuntimePublication(readRecord(runtimePublicationRows[0]))
      : null)
  const publicationKey = readConstructionOrganizationPublicationKey(option)
    || runtimePublication?.publicationKey
    || null
  if (!publicationKey) return null

  const draftNetworkKey = normalizeText(option.draftNetworkKey)
    || normalizeText(option.optionDraftNetworkKey)
    || normalizeText(runtimePublication?.draftNetworkKey)
    || optionId
  const selectedScenarioIds = readStringArray(recommendation.selectedScenarioIds)
    .concat(readStringArray(option.selectedScenarioIds))
    .concat(runtimePublication?.selectedScenarioIds ?? [])
    .filter(Boolean)
  const factBasis = readRecord(params.scenario?.factBasis)
  const businessType = normalizeText(factBasis.businessType)
    || normalizeText(runtimePublication?.businessType)
    || null
  const decisionContext = {
    source: 'construction_organization_plan_network_runtime_evidence_service',
    decisionSource: 'project_wizard_commit',
    assetKey: 'construction_organization_plan_network',
    projectId: params.projectId,
    companyId: normalizeText(params.companyId) || null,
    businessType,
    useCase: params.useCase,
    optionId,
    draftNetworkKey,
    publicationKey,
    publicationStatus: runtimePublication?.publicationStatus ?? null,
    selectedScenarioIds,
    generationBatchId: params.generationBatchId,
    decidedBy: normalizeText(params.actorId) || null,
    decidedAt: params.capturedAt,
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: [
      'wizard_commit_records_product_entry_consumption_only',
      'published_plan_network_identity_required',
      'does_not_trigger_runtime_apply',
      'does_not_write_task_dependencies_or_plan_dates',
      'does_not_write_seed_baseline_task_facts_acceleration_drafts_or_critical_path_facts',
    ],
  }
  return {
    projectId: params.projectId,
    companyId: normalizeText(params.companyId) || null,
    useCase: params.useCase,
    optionId,
    draftNetworkKey,
    publicationKey,
    publicationStatus: runtimePublication?.publicationStatus ?? null,
    selectedScenarioIds,
    decisionContext,
  }
}

export async function recordWizardConstructionOrganizationRuntimeEvidence(params: {
  projectId: string
  companyId?: string | null
  scenario: Record<string, unknown> | null
  summary: Record<string, unknown> | null
  mode?: string | null
  generationBatchId: string
  capturedAt: string
  actorId?: string | null
  queryExec?: WizardPostCommitDerivationQueryExec
}) {
  const useCase: ConstructionOrganizationPlanNetworkUseCaseKey =
    normalizeText(params.mode) === 'starting_line' ? 'startingLineOnboarding' : 'newProjectPlanning'
  const queryExec = params.queryExec ?? (async <T = Record<string, unknown>>(sql: string, queryParams?: unknown[]) => {
    // database-query-dynamic-approved: internal evidence services own the SQL text; this service injects execution only.
    const result = await rawQuery(sql, queryParams as any[] | undefined)
    return (result.rows ?? []) as T[]
  })
  const runtimePublicationRows = await queryConstructionOrganizationPlanOptionRuntimePublicationRows({
    projectId: params.projectId,
    companyId: params.companyId,
    queryExec,
  })
  const candidate = buildWizardConstructionOrganizationRuntimeEvidenceCandidate({
    projectId: params.projectId,
    companyId: params.companyId,
    scenario: params.scenario,
    summary: params.summary,
    runtimePublicationRows,
    useCase,
    generationBatchId: params.generationBatchId,
    capturedAt: params.capturedAt,
    actorId: params.actorId,
  })
  if (!candidate) return null

  const decisionResult = await recordConstructionOrganizationPlanNetworkRecommendationDecision({
    queryExec,
    projectId: params.projectId,
    companyId: candidate.companyId,
    actionType: 'adopted',
    optionId: candidate.optionId,
    draftNetworkKey: candidate.draftNetworkKey,
    publicationKey: candidate.publicationKey,
    selectedScenarioIds: candidate.selectedScenarioIds,
    decidedBy: params.actorId ?? null,
    decidedAt: params.capturedAt,
    decisionContext: candidate.decisionContext,
  })
  const outcomeResult = await recordConstructionOrganizationPlanNetworkSavedOutcome({
    queryExec,
    publicationKey: candidate.publicationKey,
    outcomeStatus: 'accepted',
    outcomeRef: `project_wizard_commit:${params.projectId}:${params.generationBatchId}:${useCase}`,
    companyId: candidate.companyId,
    projectId: params.projectId,
    metadata: {
      ...candidate.decisionContext,
      outcomeSource: 'project_wizard_commit',
    },
    observedAt: params.capturedAt,
  })
  const consumerObservationResult = await recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation({
    queryExec: createDurationRuntimeConsumerObservationQueryExec(queryExec),
    projectId: params.projectId,
    publicationKey: candidate.publicationKey,
    publicationStatus: candidate.publicationStatus,
    consumerKey: 'projectWizard',
    consumerSurface: 'project_wizard_commit',
    runtimeEntryRef: 'projectWizard:commitWizardGeneration',
    calledAt: params.capturedAt,
    observedAt: params.capturedAt,
    observationContext: {
      ...candidate.decisionContext,
      consumerTrigger: 'project_wizard_commit',
      outcomeRef: `project_wizard_commit:${params.projectId}:${params.generationBatchId}:${useCase}`,
      savedOutcomeStatus: outcomeResult.status,
    },
    callContext: {
      ...candidate.decisionContext,
      consumerTrigger: 'project_wizard_commit',
    },
    sourceEvidenceRefs: [
      `project_wizard_commit:${params.projectId}:${params.generationBatchId}:${useCase}`,
      `recommendation_actions:${candidate.publicationKey}:${useCase}`,
      `duration_plan_network_outcomes:${candidate.publicationKey}`,
    ],
  })
  return {
    source: 'project_wizard_commit_construction_organization_runtime_evidence',
    useCase,
    recommendationDecision: decisionResult,
    runtimeConsumerObservation: consumerObservationResult,
    savedOutcome: outcomeResult,
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesBaseline: false,
      writesSeed: false,
      writesTaskFacts: false,
      writesAccelerationDraft: false,
      writesCriticalPathFacts: false,
    },
  }
}

export function buildWizardCriticalPathRefreshSummary(params: {
  projectId: string
  generationBatchId: string
  refreshedAt: string
  result?: {
    taskCount?: number | null
    eligibleTaskCount?: number | null
    criticalTaskIds?: unknown
    projectDuration?: number | null
    snapshot?: Record<string, unknown> | null
  } | null
  error?: unknown
}) {
  const snapshot = readRecord(params.result?.snapshot)
  const networkLineage = readRecord(snapshot.networkLineage)
  const criticalTaskIds = Array.isArray(params.result?.criticalTaskIds)
    ? params.result.criticalTaskIds
    : readStringArray(snapshot.autoTaskIds)
  const criticalPathErrorMessage = params.error instanceof Error
    ? params.error.message
    : params.error
      ? String(params.error)
      : null

  return {
    source: 'project_wizard_post_commit_critical_path_refresh',
    status: criticalPathErrorMessage ? 'failed' : 'refreshed',
    projectId: params.projectId,
    generationBatchId: params.generationBatchId,
    refreshedAt: params.refreshedAt,
    taskCount: Number(params.result?.taskCount ?? 0) || 0,
    eligibleTaskCount: Number(params.result?.eligibleTaskCount ?? 0) || 0,
    criticalTaskCount: criticalTaskIds.length,
    criticalTaskIds,
    projectDurationDays: Number(params.result?.projectDuration ?? snapshot.projectDurationDays ?? 0) || 0,
    calculationStatus: normalizeText(snapshot.calculationStatus) || null,
    criticalPathInputHash: normalizeText(networkLineage.criticalPathInputHash) || null,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesRuntimeCriticalPathProjection: !criticalPathErrorMessage,
    writesCriticalPathFacts: !criticalPathErrorMessage,
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesRuntimeCriticalPathProjection: !criticalPathErrorMessage,
      writesCriticalPathFacts: !criticalPathErrorMessage,
      writer: 'projectCriticalPathService.recalculateProjectCriticalPath',
    },
    ...(criticalPathErrorMessage ? { error: criticalPathErrorMessage } : {}),
  }
}

export async function refreshWizardCriticalPathAfterCommit(params: {
  projectId: string
  generationBatchId: string
}) {
  const refreshedAt = new Date().toISOString()
  try {
    const result = await recalculateProjectCriticalPath(params.projectId)
    return buildWizardCriticalPathRefreshSummary({
      ...params,
      refreshedAt,
      result: result as unknown as {
        taskCount?: number | null
        eligibleTaskCount?: number | null
        criticalTaskIds?: unknown
        projectDuration?: number | null
        snapshot?: Record<string, unknown> | null
      },
    })
  } catch (error) {
    logger.warn('project wizard post-commit critical path refresh failed', {
      projectId: params.projectId,
      generationBatchId: params.generationBatchId,
      error: errorMessage(error),
    })
    return buildWizardCriticalPathRefreshSummary({
      ...params,
      refreshedAt,
      error,
    })
  }
}
