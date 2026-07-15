import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectMember } from '../middleware/auth.js'
import {
  PlanningDraftLockServiceError,
  readBaselineVersionLock,
} from '../services/baselineVersionLock.js'
import {
  getProgressDeviationAnalysisOrThrow,
  ProgressDeviationServiceError,
} from '../services/progressDeviationService.js'
import type { ApiResponse } from '../types/index.js'
import type { BaselineVersionLock, ProgressDeviationAnalysisResponse } from '../types/planning.js'

const router = Router()

router.use(authenticate)

const PROGRESS_DEVIATION_CACHE_TTL_MS = 15_000

type ResponseCacheEntry<T> = {
  expiresAt: number
  promise: Promise<ApiResponse<T>>
}

const progressDeviationLockCache = new Map<
  string,
  ResponseCacheEntry<{ lock: BaselineVersionLock | null }>
>()
const progressDeviationAnalysisCache = new Map<
  string,
  ResponseCacheEntry<ProgressDeviationAnalysisResponse>
>()

function getCachedResponse<T>(
  cache: Map<string, ResponseCacheEntry<T>>,
  key: string,
  factory: () => Promise<ApiResponse<T>>
) {
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.promise
  }
  if (cached) {
    cache.delete(key)
  }

  const promise = factory().catch((error) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, {
    expiresAt: now + PROGRESS_DEVIATION_CACHE_TTL_MS,
    promise,
  })
  return promise
}

function badRequest(message: string, code = 'VALIDATION_ERROR') {
  return {
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
  }
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  const normalized = String(value ?? '').trim().toLowerCase()
  return ['1', 'true', 'yes', 'on'].includes(normalized)
}

router.get(
  '/lock',
  requireProjectMember((req) => req.query.project_id as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.query.project_id ?? '').trim()
    const baselineVersionId = String(req.query.baseline_version_id ?? '').trim()

    if (!projectId || !baselineVersionId) {
      return res.status(400).json(badRequest('project_id 和 baseline_version_id 不能为空'))
    }

    try {
      const response = await getCachedResponse(
        progressDeviationLockCache,
        `${projectId}:${baselineVersionId}`,
        async () => {
          const lock = await readBaselineVersionLock(projectId, baselineVersionId)
          return {
            success: true,
            data: { lock },
            timestamp: new Date().toISOString(),
          }
        }
      )
      res.json(response)
    } catch (error) {
      if (error instanceof PlanningDraftLockServiceError) {
        return res.status(error.statusCode).json(badRequest(error.message, error.code))
      }
      throw error
    }
  })
)

router.get(
  '/',
  requireProjectMember((req) => req.query.project_id as string | undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.query.project_id ?? '').trim()
    const baselineVersionId = String(req.query.baseline_version_id ?? '').trim()
    const monthlyPlanVersionId = String(req.query.monthly_plan_version_id ?? '').trim() || null

    if (!projectId || !baselineVersionId) {
      return res.status(400).json(badRequest('project_id 和 baseline_version_id 不能为空'))
    }

    try {
      const lockRequested = parseBoolean(req.query.lock)
      const buildResponse = async (): Promise<ApiResponse<ProgressDeviationAnalysisResponse>> => {
        const data = await getProgressDeviationAnalysisOrThrow({
          project_id: projectId,
          baseline_version_id: baselineVersionId,
          monthly_plan_version_id: monthlyPlanVersionId,
          lock: lockRequested,
          actorUserId: req.user?.id ?? 'system',
          deferDataGapNotification: !lockRequested,
        })

        return {
          success: true,
          data,
          timestamp: new Date().toISOString(),
        }
      }

      const response = lockRequested
        ? await buildResponse()
        : await getCachedResponse(
            progressDeviationAnalysisCache,
            `${projectId}:${baselineVersionId}:${monthlyPlanVersionId ?? 'none'}`,
            buildResponse
          )
      res.json(response)
    } catch (error) {
      if (error instanceof ProgressDeviationServiceError) {
        return res.status(error.statusCode).json(badRequest(error.message, error.code))
      }
      if (error instanceof PlanningDraftLockServiceError) {
        return res.status(error.statusCode).json(badRequest(error.message, error.code))
      }
      throw error
    }
  })
)

export default router
