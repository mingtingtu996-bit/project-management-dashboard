import { Router } from 'express'
import type { Request } from 'express'

import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import {
  responsibilityInsightService,
  type ResponsibilityDimension,
  type ResponsibilityInsightsResponse,
} from '../services/responsibilityInsightService.js'

const router = Router({ mergeParams: true })

router.use(authenticate)

function getProjectId(req: Request) {
  return req.params.projectId as string | undefined
}

function normalizeDimension(value: unknown): ResponsibilityDimension {
  return String(value ?? '').trim().toLowerCase() === 'unit' ? 'unit' : 'person'
}

router.get(
  '/',
  requireProjectMember(getProjectId),
  asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId)
    logger.info('Fetching responsibility insights', { projectId })

    const data = await responsibilityInsightService.getProjectInsights(projectId)
    const response: ApiResponse<ResponsibilityInsightsResponse> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post(
  '/watchlist',
  requireProjectEditor(getProjectId),
  asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId)
    const subjectKey = String(req.body?.subject_key ?? '').trim()
    const subjectLabel = String(req.body?.subject_label ?? '').trim()

    if (!subjectKey || !subjectLabel) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'subject_key 和 subject_label 不能为空',
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const watch = await responsibilityInsightService.markWatch(projectId, {
      dimension: normalizeDimension(req.body?.dimension),
      subject_key: subjectKey,
      subject_label: subjectLabel,
      subject_user_id: req.body?.subject_user_id ? String(req.body.subject_user_id) : null,
      subject_unit_id: req.body?.subject_unit_id ? String(req.body.subject_unit_id) : null,
      actor_user_id: req.user?.id ?? null,
    })

    const response: ApiResponse = {
      success: true,
      data: watch,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post(
  '/watchlist/clear',
  requireProjectEditor(getProjectId),
  asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId)
    const subjectKey = String(req.body?.subject_key ?? '').trim()
    if (!subjectKey) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'subject_key 不能为空',
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const watch = await responsibilityInsightService.clearWatch(projectId, {
      dimension: normalizeDimension(req.body?.dimension),
      subject_key: subjectKey,
    })

    const response: ApiResponse = {
      success: true,
      data: watch,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post(
  '/watchlist/confirm-recovery',
  requireProjectEditor(getProjectId),
  asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId)
    const subjectKey = String(req.body?.subject_key ?? '').trim()
    if (!subjectKey) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'subject_key 不能为空',
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const watch = await responsibilityInsightService.confirmRecovery(projectId, {
      dimension: normalizeDimension(req.body?.dimension),
      subject_key: subjectKey,
    })

    const response: ApiResponse = {
      success: true,
      data: watch,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

export default router
