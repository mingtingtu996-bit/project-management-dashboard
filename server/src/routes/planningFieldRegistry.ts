// v1.4.7.1: Planning field registry API.
// Field definitions are owned by planningFieldRegistryService.

import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import { getPlanningFieldRegistry } from '../services/planningFieldRegistryService.js'

const router = Router()
router.use(authenticate)

router.get(
  '/field-registry',
  requireProjectMember((req) => String(req.query.projectId ?? '').trim() || undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.query.projectId ?? '').trim()
    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: { code: 'PROJECT_ID_REQUIRED', message: 'projectId 不能为空' },
        timestamp: new Date().toISOString(),
      } satisfies ApiResponse)
    }

    const updatedAt = new Date().toISOString()
    const registry = getPlanningFieldRegistry(req.query.surface, updatedAt)

    logger.info('Fetching planning field registry', { projectId, surface: registry.surface })

    res.json({
      success: true,
      data: registry,
      timestamp: updatedAt,
    } satisfies ApiResponse)
  }),
)

export default router