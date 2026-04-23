// AI工期预测和延期风险分析 API 路由

import { Router } from 'express'
import { z } from 'zod'
import { SchedulePredictor } from '../services/schedulePredictor.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validation.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import {
  buildSyncBatchLimitError,
  REQUEST_TIMEOUT_BUDGETS,
  runWithRequestBudget,
} from '../services/requestBudgetService.js'

const router = Router()
router.use(authenticate)

// 直接实例化（SchedulePredictor 已迁移为不依赖 SupabaseClient）
const predictor = new SchedulePredictor()

const taskIdBodySchema = z.object({
  task_id: z.string().trim().min(1),
}).passthrough()

const predictBatchDurationsBodySchema = z.object({
  task_ids: z.array(z.string().trim().min(1)).min(1),
}).passthrough()

const projectDurationInsightQuerySchema = z.object({
  project_id: z.string().trim().min(1),
}).passthrough()

/**
 * POST /api/ai/predict-duration
 * 预测任务工期
 */
router.post(
  '/predict-duration',
  validate(taskIdBodySchema),
  asyncHandler(async (req, res) => {
    const { task_id } = req.body

    if (!task_id) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PARAM', message: '缺少 task_id 参数' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    logger.info('预测任务工期', { task_id })

    const prediction = await predictor.predictDuration(task_id)

    if (!prediction) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'NO_DURATION_DATA', message: '无法计算工期数据' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const response: ApiResponse = {
      success: true,
      data: prediction,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

/**
 * POST /api/ai/predict-batch-durations
 * 批量预测任务工期
 */
router.post(
  '/predict-batch-durations',
  validate(predictBatchDurationsBodySchema),
  asyncHandler(async (req, res) => {
    const { task_ids } = req.body

    if (!task_ids || !Array.isArray(task_ids) || task_ids.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'INVALID_PARAM', message: 'task_ids 必须是非空数组' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    if (task_ids.length > 100) {
      const error = buildSyncBatchLimitError(task_ids.length, { operation: 'ai_schedule.predict_batch_durations' })
      const response: ApiResponse = {
        success: false,
        error: {
          code: error.code ?? 'BATCH_ASYNC_REQUIRED',
          message: error.message,
          details: error.details,
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(error.statusCode ?? 413).json(response)
    }

    logger.info('批量预测任务工期', { count: task_ids.length })

    const predictions = await runWithRequestBudget(
      {
        operation: 'ai_schedule.predict_batch_durations',
        timeoutMs: REQUEST_TIMEOUT_BUDGETS.batchWriteMs,
      },
      async () => predictor.predictBatchDurations(task_ids),
    )

    const response: ApiResponse = {
      success: true,
      data: predictions,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

/**
 * POST /api/ai/analyze-delay-risk
 * 分析任务延期风险
 */
router.post(
  '/analyze-delay-risk',
  validate(taskIdBodySchema),
  asyncHandler(async (req, res) => {
    const { task_id } = req.body

    if (!task_id) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PARAM', message: '缺少 task_id 参数' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    logger.info('分析延期风险', { task_id })

    const analysis = await predictor.analyzeDelayRisk(task_id)

    if (!analysis) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'NO_TASK_DATA', message: '无法获取任务数据' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const response: ApiResponse = {
      success: true,
      data: analysis,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

/**
 * GET /api/ai/project-duration-insight
 * 获取项目工期洞察
 */
router.get(
  '/project-duration-insight',
  validate(projectDurationInsightQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { project_id } = req.query

    if (!project_id || typeof project_id !== 'string') {
      const response: ApiResponse = {
        success: false,
        error: { code: 'MISSING_PARAM', message: '缺少 project_id 参数' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    logger.info('获取项目工期洞察', { project_id })

    const insight = await predictor.getProjectDurationInsight(project_id)

    const response: ApiResponse = {
      success: true,
      data: insight,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

export default router
