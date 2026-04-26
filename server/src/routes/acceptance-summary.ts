import { Router } from 'express'

import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { buildAcceptanceProjectSummary, getAcceptanceFlowSnapshot } from '../services/acceptanceFlowService.js'
import type { ApiResponse } from '../types/index.js'

const router = Router({ mergeParams: true })
router.use(authenticate)

router.get('/', asyncHandler(async (req, res) => {
  const projectId = String(req.params.projectId ?? req.query.projectId ?? req.query.project_id ?? '').trim()
  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: 'projectId 不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const snapshot = await getAcceptanceFlowSnapshot(projectId)
  const response: ApiResponse<ReturnType<typeof buildAcceptanceProjectSummary>> = {
    success: true,
    data: buildAcceptanceProjectSummary(snapshot.plans),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
