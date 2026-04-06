// AI工期API路由 - Phase 2

import { Router } from 'express'
import { AIDurationService } from '../services/aiDurationService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { AIDurationEstimate } from '../types/db.js'

const router = Router()
router.use(authenticate)
const aiDurationService = new AIDurationService()

/**
 * AI工期估算
 * POST /api/ai/estimate-duration
 * Body: {
 *   task_id: string,
 *   project_id: string,
 *   task_type?: string,
 *   building_type?: string,
 *   total_area?: number,
 *   historical_data?: boolean
 * }
 */
router.post('/estimate-duration', asyncHandler(async (req, res) => {
  const input = req.body

  logger.info('Estimating duration', input)

  try {
    const estimate = await aiDurationService.estimateDuration(input)

    const response: ApiResponse<AIDurationEstimate> = {
      success: true,
      data: estimate,
      timestamp: new Date().toISOString(),
    }

    res.json(response)
  } catch (error: any) {
    logger.error('Failed to estimate duration', error)

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'ESTIMATE_FAILED',
        message: error.message || '工期估算失败',
      },
      timestamp: new Date().toISOString(),
    }

    res.status(500).json(response)
  }
}))

/**
 * AI工期修正
 * POST /api/ai/correct-duration
 * Body: {
 *   task_id: string,
 *   corrected_duration: number,
 *   correction_reason: string,
 *   approved_by: string
 * }
 */
router.post('/correct-duration', asyncHandler(async (req, res) => {
  const input = req.body

  logger.info('Correcting duration', input)

  try {
    const estimate = await aiDurationService.correctDuration(input)

    const response: ApiResponse<AIDurationEstimate> = {
      success: true,
      data: estimate,
      timestamp: new Date().toISOString(),
    }

    res.json(response)
  } catch (error: any) {
    logger.error('Failed to correct duration', error)

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'CORRECTION_FAILED',
        message: error.message || '工期修正失败',
      },
      timestamp: new Date().toISOString(),
    }

    res.status(500).json(response)
  }
}))

/**
 * 获取工期置信度
 * GET /api/ai/confidence/:taskId
 */
router.get('/confidence/:taskId', asyncHandler(async (req, res) => {
  const { taskId } = req.params

  logger.info('Getting confidence', { taskId })

  try {
    const estimate = await aiDurationService.getConfidence(taskId)

    if (!estimate) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'ESTIMATE_NOT_FOUND',
          message: '未找到工期估算结果',
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }

    const response: ApiResponse<{
      confidence_level: number
      confidence_score?: number
      estimated_duration?: number
      factors: any
    }> = {
      success: true,
      data: {
        confidence_level: estimate.confidence_level,
        confidence_score: estimate.confidence_score,
        estimated_duration: estimate.estimated_duration,
        factors: estimate.factors,
      },
      timestamp: new Date().toISOString(),
    }

    res.json(response)
  } catch (error: any) {
    logger.error('Failed to get confidence', error)

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error.message || '获取置信度失败',
      },
      timestamp: new Date().toISOString(),
    }

    res.status(500).json(response)
  }
}))

/**
 * 批量工期估算（内部使用）
 * POST /api/ai/estimate-batch
 * Body: {
 *   task_ids: string[],
 *   project_id: string,
 *   historical_data?: boolean
 * }
 */
router.post('/estimate-batch', asyncHandler(async (req, res) => {
  const { task_ids, project_id, historical_data = false } = req.body

  logger.info('Batch estimating duration', { task_ids, project_id, historical_data })

  try {
    const estimates: AIDurationEstimate[] = []

    for (const taskId of task_ids) {
      const estimate = await aiDurationService.estimateDuration({
        task_id: taskId,
        project_id,
        historical_data,
      })
      estimates.push(estimate)
    }

    const response: ApiResponse<AIDurationEstimate[]> = {
      success: true,
      data: estimates,
      timestamp: new Date().toISOString(),
    }

    res.json(response)
  } catch (error: any) {
    logger.error('Failed to batch estimate duration', error)

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'BATCH_ESTIMATE_FAILED',
        message: error.message || '批量工期估算失败',
      },
      timestamp: new Date().toISOString(),
    }

    res.status(500).json(response)
  }
}))

export default router
