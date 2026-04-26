import { Router } from 'express'

import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { planningGovernanceService } from '../services/planningGovernanceService.js'
import type { ApiResponse } from '../types/index.js'
import type { PlanningGovernanceSnapshot, PlanningGovernanceState } from '../types/planning.js'

const router = Router()

router.use(authenticate)

router.get('/',
  requireProjectMember((req) => req.query.projectId as string | undefined),
  asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined

  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const data = await planningGovernanceService.scanProjectGovernance(projectId)

  const response: ApiResponse<PlanningGovernanceSnapshot> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }

  res.json(response)
}))

router.post(
  '/:projectId/start-reorder',
  requireProjectEditor((req) => String(req.params.projectId ?? '').trim()),
  asyncHandler(async (req, res) => {
    try {
      const data = await planningGovernanceService.startProjectReorderSession({
        projectId: String(req.params.projectId ?? '').trim(),
        actorUserId: req.user?.id ?? null,
        reorderMode: req.body?.reorder_mode ?? null,
        note: req.body?.note ?? null,
      })

      const response: ApiResponse<PlanningGovernanceState> = {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      }
      res.status(201).json(response)
    } catch (error: any) {
      if (typeof error?.statusCode === 'number') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: error.code ?? 'INVALID_STATE',
            message: error.message ?? '主动重排启动失败',
          },
          timestamp: new Date().toISOString(),
        }
        return res.status(error.statusCode).json(response)
      }
      throw error
    }
  }),
)

router.post(
  '/:projectId/end-reorder',
  requireProjectEditor((req) => String(req.params.projectId ?? '').trim()),
  asyncHandler(async (req, res) => {
    try {
      const data = await planningGovernanceService.finishProjectReorderSession({
        projectId: String(req.params.projectId ?? '').trim(),
        actorUserId: req.user?.id ?? null,
        note: req.body?.note ?? null,
      })

      const response: ApiResponse<PlanningGovernanceState> = {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    } catch (error: any) {
      if (typeof error?.statusCode === 'number') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: error.code ?? 'INVALID_STATE',
            message: error.message ?? '主动重排结束失败',
          },
          timestamp: new Date().toISOString(),
        }
        return res.status(error.statusCode).json(response)
      }
      throw error
    }
  }),
)

export default router
