import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
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
  asyncHandler(async (req, res) => {
    const projectId = String(req.query.project_id ?? '').trim()
    const baselineVersionId = String(req.query.baseline_version_id ?? '').trim()

    if (!projectId || !baselineVersionId) {
      return res.status(400).json(badRequest('project_id 和 baseline_version_id 不能为空'))
    }

    try {
      const lock = await readBaselineVersionLock(projectId, baselineVersionId)
      const response: ApiResponse<{ lock: BaselineVersionLock | null }> = {
        success: true,
        data: { lock },
        timestamp: new Date().toISOString(),
      }
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
  asyncHandler(async (req, res) => {
    const projectId = String(req.query.project_id ?? '').trim()
    const baselineVersionId = String(req.query.baseline_version_id ?? '').trim()
    const monthlyPlanVersionId = String(req.query.monthly_plan_version_id ?? '').trim() || null

    if (!projectId || !baselineVersionId) {
      return res.status(400).json(badRequest('project_id 和 baseline_version_id 不能为空'))
    }

    try {
      const data = await getProgressDeviationAnalysisOrThrow({
        project_id: projectId,
        baseline_version_id: baselineVersionId,
        monthly_plan_version_id: monthlyPlanVersionId,
        lock: parseBoolean(req.query.lock),
        actorUserId: req.user?.id ?? 'system',
      })

      const response: ApiResponse<ProgressDeviationAnalysisResponse> = {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      }
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
