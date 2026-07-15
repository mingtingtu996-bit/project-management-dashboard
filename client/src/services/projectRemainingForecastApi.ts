import { apiPost } from '@/lib/apiClient'
import type {
  WbsAccelerationProposal,
  WbsConstructionOrganizationProductOutcomeCloseoutProgress,
  WbsTargetFeasibility,
} from './wbsTemplateGenerationApi'

export interface ProjectRemainingDurationForecastContext {
  primaryLayer?: 'projectGenerationFacts' | 'runtimeExecutionFacts' | string
  factWeights?: {
    projectGenerationFacts?: number | null
    runtimeExecutionFacts?: number | null
  } | null
  projectFactsRole?: 'primary' | 'background' | string
  runtimeFactsRole?: 'primary' | 'background' | string
  criticalPath?: {
    remainingTaskCount?: number | null
    latestCriticalFinishDate?: string | null
  } | null
  monthlyCommitments?: {
    activeCommitmentCount?: number | null
    carryoverCommitmentCount?: number | null
    latestCommitmentFinishDate?: string | null
  } | null
  externalInterfaces?: {
    hardGateCount?: number | null
    latestGateFinishDate?: string | null
  } | null
  boundaryPolicy?: string[] | null
}

export interface ProjectRemainingDurationForecast {
  durationOutputCode: 'project_remaining_forecast' | string | null
  durationOutputSemanticFieldName?: string | null
  projectRemainingForecastDays: number | null
  forecastFinishDate: string | null
  targetEndDate?: string | null
  targetGapDays?: number | null
  rowsEvaluated?: number | null
  calculationContext?: ProjectRemainingDurationForecastContext | null
}

export interface ProjectRemainingDurationForecastResponse {
  projectId?: string | null
  status?: 'ready' | 'stale' | 'degraded' | string | null
  degraded?: boolean
  degradationReason?: string | null
  message?: string | null
  rowsEvaluated?: number | null
  projectRemainingForecast: ProjectRemainingDurationForecast | null
  constructionOrganizationProductOutcomeCloseoutProgress?:
    WbsConstructionOrganizationProductOutcomeCloseoutProgress | null
}

export interface ProjectRemainingDurationForecastRequest {
  targetEndDate?: string | null
  asOfDate?: string | null
}

export interface ProjectScheduleAccelerationEvaluateRequest extends ProjectRemainingDurationForecastRequest {
  mode?: 'compare_only' | 'compression_preview' | 'reverse_cpm' | string
}

export interface ProjectScheduleAccelerationEvaluateResponse extends ProjectRemainingDurationForecastResponse {
  targetEndDate?: string | null
  targetFeasibility?: WbsTargetFeasibility | null
}

export interface ScheduleAccelerationRecommendationAdoptionResponse {
  adopted: boolean
  recommendationKey: string
  adoptedAt?: string | null
  constructionOrganizationRecommendationDecision?: {
    source?: 'construction_organization_plan_network_runtime_evidence_service' | string
    status?: 'recommendation_decision_recorded' | 'recommendation_decision_blocked' | string
    recommendationKind?: 'construction_organization_plan_network' | string
    recommendationKey?: string | null
    actionType?: string | null
    decisionPersisted?: boolean
    writesTaskDependencies?: false
    writesPlanDates?: false
    writesSeed?: false
    writesBaseline?: false
    writesCriticalPathFacts?: false
    writesAccelerationDraft?: false
    reasons?: string[]
    boundaryPolicy?: string[]
  } | null
  constructionOrganizationSavedOutcome?: {
    source?: 'construction_organization_plan_network_runtime_evidence_service' | string
    status?: 'saved_network_outcome_recorded' | 'saved_network_outcome_blocked' | string
    publicationKey?: string | null
    outcomeStatus?: string | null
    outcomePersisted?: boolean
    writesTaskDependencies?: false
    writesPlanDates?: false
    writesSeed?: false
    writesBaseline?: false
    writesCriticalPathFacts?: false
    writesAccelerationDraft?: false
    reasons?: string[]
    boundaryPolicy?: string[]
  } | null
}

function normalizeNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeForecast(raw: any): ProjectRemainingDurationForecast | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    durationOutputCode: raw.durationOutputCode ?? null,
    durationOutputSemanticFieldName: raw.durationOutputSemanticFieldName ?? null,
    projectRemainingForecastDays: normalizeNumber(raw.projectRemainingForecastDays),
    forecastFinishDate: raw.forecastFinishDate ?? null,
    targetEndDate: raw.targetEndDate ?? null,
    targetGapDays: normalizeNumber(raw.targetGapDays),
    rowsEvaluated: normalizeNumber(raw.rowsEvaluated),
    calculationContext: raw.calculationContext ?? null,
  }
}

function normalizeConstructionOrganizationProductOutcomeCloseoutProgress(
  raw: any,
): WbsConstructionOrganizationProductOutcomeCloseoutProgress | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as WbsConstructionOrganizationProductOutcomeCloseoutProgress
}

export async function getProjectRemainingDurationForecast(
  projectId: string,
  request: ProjectRemainingDurationForecastRequest = {},
  options?: RequestInit,
): Promise<ProjectRemainingDurationForecastResponse> {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) {
    return {
      projectId: null,
      rowsEvaluated: 0,
      projectRemainingForecast: null,
    }
  }

  const raw = await apiPost<any>(
    `/api/projects/${encodeURIComponent(normalizedProjectId)}/schedule-acceleration/remaining-forecast`,
    {
      targetEndDate: request.targetEndDate ?? null,
      asOfDate: request.asOfDate ?? null,
    },
    options,
  )

  return {
    projectId: raw?.projectId ?? normalizedProjectId,
    status: raw?.status ?? null,
    degraded: raw?.degraded === true,
    degradationReason: raw?.degradationReason ?? null,
    message: raw?.message ?? null,
    rowsEvaluated: normalizeNumber(raw?.rowsEvaluated),
    projectRemainingForecast: normalizeForecast(raw?.projectRemainingForecast),
    constructionOrganizationProductOutcomeCloseoutProgress:
      normalizeConstructionOrganizationProductOutcomeCloseoutProgress(
        raw?.constructionOrganizationProductOutcomeCloseoutProgress,
      ),
  }
}

export async function evaluateProjectScheduleAcceleration(
  projectId: string,
  request: ProjectScheduleAccelerationEvaluateRequest = {},
  options?: RequestInit,
): Promise<ProjectScheduleAccelerationEvaluateResponse> {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) {
    return {
      projectId: null,
      targetEndDate: request.targetEndDate ?? null,
      rowsEvaluated: 0,
      projectRemainingForecast: null,
      targetFeasibility: null,
      constructionOrganizationProductOutcomeCloseoutProgress: null,
    }
  }

  const raw = await apiPost<any>(
    `/api/projects/${encodeURIComponent(normalizedProjectId)}/schedule-acceleration/evaluate`,
    {
      targetEndDate: request.targetEndDate ?? null,
      asOfDate: request.asOfDate ?? null,
      mode: request.mode ?? 'compression_preview',
    },
    options,
  )

  return {
    projectId: raw?.projectId ?? normalizedProjectId,
    targetEndDate: raw?.targetEndDate ?? request.targetEndDate ?? null,
    rowsEvaluated: normalizeNumber(raw?.rowsEvaluated),
    projectRemainingForecast: normalizeForecast(raw?.projectRemainingForecast),
    targetFeasibility: raw?.targetFeasibility && typeof raw.targetFeasibility === 'object'
      ? raw.targetFeasibility as WbsTargetFeasibility
      : null,
    constructionOrganizationProductOutcomeCloseoutProgress:
      normalizeConstructionOrganizationProductOutcomeCloseoutProgress(
        raw?.constructionOrganizationProductOutcomeCloseoutProgress,
      ),
  }
}

export async function recordScheduleAccelerationRecommendationAdoption(
  projectId: string,
  proposal: WbsAccelerationProposal,
  evidence?: {
    outcomeRef?: string | null
    outcomeMetadata?: Record<string, unknown> | null
  } | null,
  options?: RequestInit,
): Promise<ScheduleAccelerationRecommendationAdoptionResponse> {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) {
    return {
      adopted: false,
      recommendationKey: '',
      adoptedAt: null,
    }
  }

  const raw = await apiPost<any>(
    `/api/projects/${encodeURIComponent(normalizedProjectId)}/schedule-acceleration/recommendations/adopt`,
    {
      proposal,
      outcomeRef: evidence?.outcomeRef ?? null,
      outcomeMetadata: evidence?.outcomeMetadata ?? null,
    },
    options,
  )

  return {
    adopted: Boolean(raw?.adopted),
    recommendationKey: String(raw?.recommendationKey ?? ''),
    adoptedAt: raw?.adoptedAt ?? null,
    constructionOrganizationRecommendationDecision:
      raw?.constructionOrganizationRecommendationDecision
      && typeof raw.constructionOrganizationRecommendationDecision === 'object'
      && !Array.isArray(raw.constructionOrganizationRecommendationDecision)
        ? raw.constructionOrganizationRecommendationDecision
        : null,
    constructionOrganizationSavedOutcome:
      raw?.constructionOrganizationSavedOutcome
      && typeof raw.constructionOrganizationSavedOutcome === 'object'
      && !Array.isArray(raw.constructionOrganizationSavedOutcome)
        ? raw.constructionOrganizationSavedOutcome
        : null,
  }
}
