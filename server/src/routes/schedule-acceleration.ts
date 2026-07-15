import { Router } from 'express'
import { authenticate, requireProjectMember } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import { getCurrentCompanyMembership, getProjectCompanyId } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { executeSQL } from '../services/dbService.js'
import {
  buildRuntimeProjectRemainingDurationForecast,
  evaluateRuntimeScheduleAcceleration,
  recordScheduleAccelerationRecommendationAdoption,
} from '../services/scheduleAccelerationRuntimeService.js'
import {
  createDurationRuntimeConsumerObservationQueryExec,
} from '../services/durationRuntimeConsumerObservationService.js'
import type {
  ScheduleAccelerationContext,
  ScheduleAccelerationMode,
  ScheduleTargetFeasibility,
} from '../services/scheduleAccelerationService.js'
import type { ProjectRemainingDurationForecast } from '../services/projectRemainingDurationForecastService.js'
import {
  buildConstructionOrganizationProductOutcomeCloseoutProgressForProject,
  type ConstructionOrganizationProductOutcomeCloseoutProgress,
} from '../services/constructionOrganizationProductOutcomeCloseoutMatrixService.js'
import { REQUEST_TIMEOUT_BUDGETS, runWithRequestBudget } from '../services/requestBudgetService.js'

const router = Router({ mergeParams: true })
router.use(authenticate)
const PRODUCT_OUTCOME_CLOSEOUT_PROGRESS_CACHE_TTL_MS = 30_000
const REMAINING_FORECAST_ROUTE_CACHE_TTL_MS = 30_000
const REMAINING_FORECAST_ROUTE_STALE_TTL_MS = 5 * 60_000
const productOutcomeCloseoutProgressCache = new Map<string, {
  expiresAt: number
  promise: Promise<ConstructionOrganizationProductOutcomeCloseoutProgress | null>
}>()
type RemainingForecastRouteResult = Awaited<ReturnType<typeof buildRuntimeProjectRemainingDurationForecast>>
const remainingForecastRouteCache = new Map<string, {
  expiresAt: number
  staleUntil: number
  result: RemainingForecastRouteResult
}>()

export function clearScheduleAccelerationRouteCachesForTest() {
  productOutcomeCloseoutProgressCache.clear()
  remainingForecastRouteCache.clear()
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeMode(value: unknown): ScheduleAccelerationMode {
  const mode = normalizeText(value)
  return mode === 'compare_only' || mode === 'reverse_cpm' ? mode : 'compression_preview'
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean)
  const text = normalizeText(value)
  return text ? text.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean) : []
}

function stableCacheValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null) return null
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => stableCacheValue(item, seen))
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      const nextValue = (value as Record<string, unknown>)[key]
      if (typeof nextValue !== 'undefined') {
        result[key] = stableCacheValue(nextValue, seen)
      }
      return result
    }, {})
}

function buildRemainingForecastRouteCacheKey(input: {
  projectId: string
  targetEndDate?: string | null
  asOfDate?: string | null
  context?: ScheduleAccelerationContext | null
}) {
  const projectId = normalizeText(input.projectId)
  if (!projectId) return null
  return JSON.stringify(stableCacheValue({
    projectId,
    targetEndDate: normalizeText(input.targetEndDate) || null,
    asOfDate: normalizeText(input.asOfDate) || null,
    context: input.context ?? null,
  }))
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

async function resolveRequestCompanyId(req: any, projectId: string) {
  const requestedCompanyId = getRequestCompanyId(req)
  const membership = await getCurrentCompanyMembership(req.user?.id, requestedCompanyId)
  return membership?.companyId
    ?? requestedCompanyId
    ?? await getProjectCompanyId(projectId)
}

async function buildProductOutcomeCloseoutProgressForRoute(req: any, projectId: string) {
  const companyId = await resolveRequestCompanyId(req, projectId)
  if (!companyId) return null
  const cacheKey = `${companyId}:${projectId}`
  const now = Date.now()
  const cached = productOutcomeCloseoutProgressCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.promise
  }

  const promise = buildProductOutcomeCloseoutProgress(companyId, projectId)
  productOutcomeCloseoutProgressCache.set(cacheKey, {
    expiresAt: now + PRODUCT_OUTCOME_CLOSEOUT_PROGRESS_CACHE_TTL_MS,
    promise,
  })
  promise.catch(() => {
    const current = productOutcomeCloseoutProgressCache.get(cacheKey)
    if (current?.promise === promise) {
      productOutcomeCloseoutProgressCache.delete(cacheKey)
    }
  })
  return promise
}

async function buildProductOutcomeCloseoutProgressForRemainingForecast(req: any, projectId: string) {
  try {
    return await runWithRequestBudget(
      {
        operation: 'schedule-acceleration.remaining-forecast.closeout-progress',
        timeoutMs: REQUEST_TIMEOUT_BUDGETS.fastReadMs,
      },
      () => buildProductOutcomeCloseoutProgressForRoute(req, projectId),
    )
  } catch (error) {
    logger.warn('schedule acceleration remaining forecast closeout progress degraded after budgeted read failed', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function buildProductOutcomeCloseoutProgress(companyId: string, projectId: string) {
  try {
    const snapshot = await buildConstructionOrganizationProductOutcomeCloseoutProgressForProject({
      companyId,
      projectId,
      limit: 2000,
      maxLimit: 2000,
      queryExec: executeSQL,
    })
    return snapshot.progress
  } catch (error) {
    logger.warn('schedule acceleration construction organization product closeout progress projection failed', {
      projectId,
      companyId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

function attachProductOutcomeCloseoutProgressToTargetFeasibility(
  feasibility: ScheduleTargetFeasibility | null | undefined,
  progress: ConstructionOrganizationProductOutcomeCloseoutProgress | null,
) {
  if (!feasibility || !progress) return feasibility
  const proposal = readRecord(feasibility.accelerationProposal)
  if (Object.keys(proposal).length === 0) return feasibility
  const calculationBasis = readRecord(proposal.calculationBasis)
  const constructionOrganizationScenario = readRecord(calculationBasis.constructionOrganizationScenario)
  if (Object.keys(constructionOrganizationScenario).length === 0) return feasibility
  const organizationDecisionReport = readRecord(constructionOrganizationScenario.organizationDecisionReport)
  const productCloseoutReadiness = readRecord(organizationDecisionReport.productCloseoutReadiness)
  return {
    ...feasibility,
    accelerationProposal: {
      ...proposal,
      calculationBasis: {
        ...calculationBasis,
        constructionOrganizationScenario: {
          ...constructionOrganizationScenario,
          productOutcomeCloseoutProgress: progress,
          organizationDecisionReport: {
            ...organizationDecisionReport,
            productOutcomeCloseoutProgress: progress,
            productCloseoutReadiness: {
              ...productCloseoutReadiness,
              productOutcomeCloseoutProgress: progress,
            },
          },
        },
      },
    },
  } as unknown as ScheduleTargetFeasibility
}

function serializeProjectRemainingForecast(forecast: ProjectRemainingDurationForecast | null | undefined) {
  if (!forecast) return null

  return {
    durationOutputCode: forecast.durationOutputCode,
    durationOutputSemanticFieldName: forecast.durationOutputSemanticFieldName,
    durationOutputContract: forecast.durationOutputContract ?? null,
    projectRemainingForecastDays: forecast.projectRemainingForecastDays,
    forecastFinishDate: forecast.forecastFinishDate,
    targetEndDate: forecast.targetEndDate ?? null,
    targetGapDays: forecast.targetGapDays ?? null,
    rowsEvaluated: forecast.rowsEvaluated,
    calculationContext: forecast.calculationContext,
  }
}

function buildRemainingForecastPayload(input: {
  projectId: string
  result: RemainingForecastRouteResult
  constructionOrganizationProductOutcomeCloseoutProgress?: ConstructionOrganizationProductOutcomeCloseoutProgress | null
  status?: 'ready' | 'stale' | 'degraded'
  degraded?: boolean
  degradationReason?: string | null
  message?: string | null
}) {
  return {
    projectId: input.projectId,
    status: input.status ?? 'ready',
    degraded: input.degraded ?? false,
    degradationReason: input.degradationReason ?? null,
    message: input.message ?? null,
    rowsEvaluated: input.result.rowsEvaluated,
    projectRemainingForecast: serializeProjectRemainingForecast(input.result.projectRemainingForecast),
    constructionOrganizationProductOutcomeCloseoutProgress:
      input.constructionOrganizationProductOutcomeCloseoutProgress ?? null,
  }
}

function normalizeRemainingForecastDegradationReason(error: unknown, fallback?: string | null) {
  const reason = normalizeText((error as any)?.degradationReason ?? fallback)
  if (reason === 'runtime_evidence_unavailable' || reason === 'runtime_forecast_unavailable') {
    return 'runtime_forecast_unavailable'
  }
  if (reason === 'runtime_forecast_unavailable_stale_cache') return reason
  if (reason === 'request_budget_exceeded_stale_cache') return reason
  return 'request_budget_exceeded'
}

function isUsableRemainingForecastResult(result: RemainingForecastRouteResult | null | undefined) {
  return Boolean(result?.projectRemainingForecast && Number(result.rowsEvaluated) > 0)
}

function buildRuntimeForecastUnavailableError() {
  return Object.assign(new Error('runtime project remaining forecast unavailable'), {
    degradationReason: 'runtime_forecast_unavailable',
  })
}

function buildRemainingForecastDegradedPayload(projectId: string, error: unknown, degradationReason?: string | null) {
  const normalizedReason = normalizeRemainingForecastDegradationReason(error, degradationReason)
  logger.warn('schedule acceleration remaining forecast degraded after budgeted read failed without cache', {
    projectId,
    error: error instanceof Error ? error.message : String(error),
    degradationReason: normalizedReason,
  })
  return {
    projectId,
    status: 'degraded',
    degraded: true,
    degradationReason: normalizedReason,
    message: '项目剩余工期预测暂不可用，后台计算仍在刷新，请稍后重试。',
    ...(normalizedReason === 'runtime_forecast_unavailable'
      ? { message: 'Project remaining forecast evidence is temporarily insufficient; refresh later.' }
      : {}),
    rowsEvaluated: null,
    projectRemainingForecast: null,
    constructionOrganizationProductOutcomeCloseoutProgress: null,
  }
}

async function loadRemainingForecastWithBudget(input: {
  projectId: string
  targetEndDate?: string | null
  asOfDate?: string | null
  context?: ScheduleAccelerationContext | null
  runtimeConsumerObservationQueryExec?: ReturnType<typeof createDurationRuntimeConsumerObservationQueryExec>
}) {
  const cacheKey = buildRemainingForecastRouteCacheKey(input)
  const cached = cacheKey ? remainingForecastRouteCache.get(cacheKey) : null
  const now = Date.now()
  if (cached && cached.expiresAt > now) {
    return { result: cached.result, status: 'ready' as const, degraded: false, degradationReason: null, message: null }
  }

  try {
    const result = await runWithRequestBudget(
      {
        operation: 'schedule-acceleration.remaining-forecast.read',
        timeoutMs: REQUEST_TIMEOUT_BUDGETS.analysisReadMs,
      },
      async () => {
        const nextResult = await buildRuntimeProjectRemainingDurationForecast(input)
        if (!isUsableRemainingForecastResult(nextResult)) {
          throw buildRuntimeForecastUnavailableError()
        }
        if (cacheKey) {
          remainingForecastRouteCache.set(cacheKey, {
            expiresAt: Date.now() + REMAINING_FORECAST_ROUTE_CACHE_TTL_MS,
            staleUntil: Date.now() + REMAINING_FORECAST_ROUTE_STALE_TTL_MS,
            result: nextResult,
          })
        }
        return nextResult
      },
    )
    return { result, status: 'ready' as const, degraded: false, degradationReason: null, message: null }
  } catch (error) {
    const degradationReason = normalizeRemainingForecastDegradationReason(error)
    if (cached && cached.staleUntil > now) {
      logger.warn('schedule acceleration remaining forecast reused stale cache after budgeted read failed', {
        projectId: input.projectId,
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        result: cached.result,
        status: 'stale' as const,
        degraded: true,
        degradationReason: degradationReason === 'runtime_forecast_unavailable'
          ? 'runtime_forecast_unavailable_stale_cache'
          : 'request_budget_exceeded_stale_cache',
        message: '项目剩余工期预测使用缓存参考，后台计算仍在刷新。',
      }
    }
    return {
      result: null,
      status: 'degraded' as const,
      degraded: true,
      degradationReason,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

function serializeTargetFeasibility(feasibility: ScheduleTargetFeasibility | null | undefined) {
  if (!feasibility) return undefined

  return {
    mode: feasibility.mode,
    scenario: feasibility.scenario,
    targetEndDate: feasibility.targetEndDate,
    naturalEndDate: feasibility.naturalEndDate,
    overshootDays: feasibility.overshootDays,
    recoverableDays: feasibility.recoverableDays,
    unrecoverableDays: feasibility.unrecoverableDays,
    verdict: feasibility.verdict,
    strategies: feasibility.strategies,
    accelerationProposal: feasibility.accelerationProposal,
    durationOutputCode: feasibility.durationOutputCode,
    durationOutputSemanticFieldName: feasibility.durationOutputSemanticFieldName ?? null,
    durationOutputContract: feasibility.durationOutputContract ?? null,
    accelerationTargetDays: feasibility.accelerationTargetDays ?? null,
  }
}

router.post(
  '/evaluate',
  requireProjectMember((req) => req.params.projectId || req.body?.projectId || req.body?.project_id),
  asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.params.projectId || req.body?.projectId || req.body?.project_id)
    const targetEndDateOverride = normalizeText(req.body?.targetEndDate ?? req.body?.target_end_date ?? req.body?.projectPlannedEndDate ?? req.body?.project_planned_end_date) || null

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'PROJECT_ID_REQUIRED', message: 'projectId 不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const result = await evaluateRuntimeScheduleAcceleration({
      projectId,
      targetEndDate: targetEndDateOverride,
      asOfDate: normalizeText(req.body?.asOfDate ?? req.body?.as_of_date) || null,
      mode: normalizeMode(req.body?.mode ?? req.body?.targetConstraintMode ?? req.body?.target_constraint_mode),
      runtimeConsumerObservationQueryExec: createDurationRuntimeConsumerObservationQueryExec(),
      context: {
        projectTypeCodes: normalizeStringArray(req.body?.projectTypeCodes ?? req.body?.project_type_codes ?? req.body?.projectTypeCode ?? req.body?.project_type_code),
        methodVariantCodes: normalizeStringArray(req.body?.methodVariantCodes ?? req.body?.method_variant_codes),
        climateSignals: normalizeStringArray(req.body?.climateSignals ?? req.body?.climate_signals ?? req.body?.monthlyClimateSignal ?? req.body?.monthly_climate_signal),
        weatherImpactBands: normalizeStringArray(req.body?.weatherImpactBands ?? req.body?.weather_impact_bands),
      },
    })
    const productOutcomeCloseoutProgress =
      await buildProductOutcomeCloseoutProgressForRoute(req, projectId)
    const targetFeasibilityWithProductCloseoutProgress =
      attachProductOutcomeCloseoutProgressToTargetFeasibility(
        result.targetFeasibility,
        productOutcomeCloseoutProgress,
      )

    const response: ApiResponse = {
      success: true,
      data: {
        projectId,
        targetEndDate: result.projectRemainingForecast.targetEndDate ?? targetEndDateOverride,
        rowsEvaluated: result.rowsEvaluated,
        projectRemainingForecast: serializeProjectRemainingForecast(result.projectRemainingForecast),
        targetFeasibility: serializeTargetFeasibility(targetFeasibilityWithProductCloseoutProgress),
        constructionOrganizationProductOutcomeCloseoutProgress: productOutcomeCloseoutProgress,
      },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post(
  '/recommendations/adopt',
  requireProjectMember((req) => req.params.projectId || req.body?.projectId || req.body?.project_id),
  asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.params.projectId || req.body?.projectId || req.body?.project_id)

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'PROJECT_ID_REQUIRED', message: 'projectId 涓嶈兘涓虹┖' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const result = await recordScheduleAccelerationRecommendationAdoption({
      projectId,
      adoptedBy: normalizeText((req as any).user?.id) || null,
      proposal: req.body?.proposal ?? req.body?.accelerationProposal ?? req.body?.acceleration_proposal ?? null,
      outcomeRef: normalizeText(req.body?.outcomeRef ?? req.body?.outcome_ref) || null,
      outcomeMetadata:
        req.body?.outcomeMetadata && typeof req.body.outcomeMetadata === 'object' && !Array.isArray(req.body.outcomeMetadata)
          ? req.body.outcomeMetadata
          : req.body?.outcome_metadata && typeof req.body.outcome_metadata === 'object' && !Array.isArray(req.body.outcome_metadata)
            ? req.body.outcome_metadata
            : null,
      runtimeConsumerObservationQueryExec: createDurationRuntimeConsumerObservationQueryExec(),
    })

    const response: ApiResponse = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post(
  '/remaining-forecast',
  requireProjectMember((req) => req.params.projectId || req.body?.projectId || req.body?.project_id),
  asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.params.projectId || req.body?.projectId || req.body?.project_id)

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'PROJECT_ID_REQUIRED', message: 'projectId 不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const targetEndDate =
      normalizeText(req.body?.targetEndDate ?? req.body?.target_end_date ?? req.body?.projectPlannedEndDate ?? req.body?.project_planned_end_date) || null
    const asOfDate = normalizeText(req.body?.asOfDate ?? req.body?.as_of_date) || null
    const context: ScheduleAccelerationContext = {
      projectTypeCodes: normalizeStringArray(req.body?.projectTypeCodes ?? req.body?.project_type_codes ?? req.body?.projectTypeCode ?? req.body?.project_type_code),
      methodVariantCodes: normalizeStringArray(req.body?.methodVariantCodes ?? req.body?.method_variant_codes),
      climateSignals: normalizeStringArray(req.body?.climateSignals ?? req.body?.climate_signals ?? req.body?.monthlyClimateSignal ?? req.body?.monthly_climate_signal),
      weatherImpactBands: normalizeStringArray(req.body?.weatherImpactBands ?? req.body?.weather_impact_bands),
    }

    const forecastRead = await loadRemainingForecastWithBudget({
      projectId,
      targetEndDate,
      asOfDate,
      context,
      runtimeConsumerObservationQueryExec: createDurationRuntimeConsumerObservationQueryExec(),
    })
    const productOutcomeCloseoutProgress = forecastRead.result && !forecastRead.degraded
      ? await buildProductOutcomeCloseoutProgressForRemainingForecast(req, projectId)
      : null

    const response: ApiResponse = {
      success: true,
      data: forecastRead.result
        ? buildRemainingForecastPayload({
            projectId,
            result: forecastRead.result,
            constructionOrganizationProductOutcomeCloseoutProgress: productOutcomeCloseoutProgress,
            status: forecastRead.status,
            degraded: forecastRead.degraded,
            degradationReason: forecastRead.degradationReason,
            message: forecastRead.message,
          })
        : buildRemainingForecastDegradedPayload(projectId, forecastRead.message, forecastRead.degradationReason),
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

export default router
