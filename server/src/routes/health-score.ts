/**
 * 健康度 API 路由
 * 提供项目健康度的计算和更新接口
 *
 * 路由顺序说明：固定路径（batch/avg-history/record-snapshot）必须在参数路径（/:projectId）之前
 */

import express from 'express'
import { z } from 'zod'

import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import { REQUEST_TIMEOUT_BUDGETS, runWithRequestBudget } from '../services/requestBudgetService.js'
import { calculateProjectHealth, recordProjectHealthSnapshots, updateProjectHealth, updateAllProjectsHealth } from '../services/projectHealthService.js'
import type { ApiResponse } from '../types/index.js'

const router = express.Router()
router.use(authenticate)

const projectIdParamSchema = z.object({
  projectId: z.string().trim().min(1, 'projectId 不能为空'),
})

const projectHistoryQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).optional(),
})

function nowIso() {
  return new Date().toISOString()
}

function errorResponse(message: string, code: string, details?: unknown): ApiResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    timestamp: nowIso(),
  }
}

/**
 * POST /api/health-score/batch
 * 批量更新所有项目的健康度
 */
router.post('/batch', asyncHandler(async (_req, res) => {
  try {
    const updatedCount = await runWithRequestBudget(
      {
        operation: 'health_score.batch',
        timeoutMs: REQUEST_TIMEOUT_BUDGETS.batchWriteMs,
      },
      async () => updateAllProjectsHealth(),
    )

    res.json({
      success: true,
      data: { updatedCount },
      message: `成功更新 ${updatedCount} 个项目的健康度`,
    })
  } catch (error: any) {
    logger.error('批量更新健康度失败', { error })
    res.status(error?.statusCode || 500).json(
      errorResponse(
        error instanceof Error ? error.message : '未知错误',
        error?.code || 'BATCH_HEALTH_UPDATE_FAILED',
        error?.details,
      ),
    )
  }
}))

/**
 * GET /api/health-score/avg-history
 * 获取所有项目本月和上月的平均健康度
 */
router.get('/avg-history', asyncHandler(async (_req, res) => {
  try {
    const data = await runWithRequestBudget(
      {
        operation: 'health_score.avg_history',
        timeoutMs: REQUEST_TIMEOUT_BUDGETS.fastReadMs,
      },
      async () => {
        const { createClient } = await import('@supabase/supabase-js')
        const supabaseUrl = process.env.SUPABASE_URL || ''
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
        const supabase = createClient(supabaseUrl, supabaseKey)

        const now = new Date()
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`

        const { data, error } = await supabase
          .from('project_health_history')
          .select('period, health_score')
          .in('period', [thisMonth, lastMonth])

        if (error) {
          logger.warn('查询历史均值失败（可能表未创建）', { message: error.message })
          return { thisMonth: null, lastMonth: null, change: null }
        }

        const rows = data || []
        const thisMonthScores = rows.filter((row) => row.period === thisMonth).map((row) => row.health_score)
        const lastMonthScores = rows.filter((row) => row.period === lastMonth).map((row) => row.health_score)

        const avg = (values: number[]) =>
          values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null

        const thisAvg = avg(thisMonthScores)
        const lastAvg = avg(lastMonthScores)
        const change = thisAvg !== null && lastAvg !== null ? thisAvg - lastAvg : null

        return {
          thisMonth: thisAvg,
          lastMonth: lastAvg,
          change,
          thisMonthPeriod: thisMonth,
          lastMonthPeriod: lastMonth,
        }
      },
    )

    res.json({
      success: true,
      data,
    })
  } catch (error) {
    logger.error('获取健康度历史均值失败', { error })
    res.json({ success: true, data: { thisMonth: null, lastMonth: null, change: null } })
  }
}))

/**
 * POST /api/health-score/record-snapshot
 */
router.post('/record-snapshot', asyncHandler(async (_req, res) => {
  try {
    const result = await runWithRequestBudget(
      {
        operation: 'health_score.record_snapshot',
        timeoutMs: REQUEST_TIMEOUT_BUDGETS.batchWriteMs,
      },
      async () => recordProjectHealthSnapshots(),
    )

    res.json({
      success: true,
      data: result,
      message: `成功记录 ${result.recorded} 个项目的健康度快照（${result.period}）`,
    })
  } catch (error: any) {
    logger.error('记录健康度快照失败', { error })
    res.status(error?.statusCode || 500).json(
      errorResponse(
        error instanceof Error ? error.message : '未知错误',
        error?.code || 'HEALTH_SNAPSHOT_RECORD_FAILED',
        error?.details,
      ),
    )
  }
}))

/**
 * GET /api/health-score/:projectId
 */
router.get('/:projectId', validate(projectIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { projectId } = req.params
  const healthResult = await calculateProjectHealth(projectId)

  res.json({
    success: true,
    data: healthResult,
  })
}))

/**
 * GET /api/health-score/:projectId/history
 */
router.get(
  '/:projectId/history',
  validate(projectIdParamSchema, 'params'),
  validate(projectHistoryQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    try {
      const { projectId } = req.params
      const months = Number(req.query.months ?? 3)

      const { createClient } = await import('@supabase/supabase-js')
      const supabaseUrl = process.env.SUPABASE_URL || ''
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
      const supabase = createClient(supabaseUrl, supabaseKey)

      const { data, error } = await supabase
        .from('project_health_history')
        .select('period, health_score, health_status, recorded_at')
        .eq('project_id', projectId)
        .order('period', { ascending: false })
        .limit(months)

      if (error) {
        logger.warn('查询健康度历史失败（可能表未创建）', { message: error.message, projectId })
        return res.json({ success: true, data: [] })
      }

      res.json({ success: true, data: data || [] })
    } catch (error) {
      logger.error('获取健康度历史失败', { error, projectId: req.params.projectId })
      res.json({ success: true, data: [] })
    }
  }),
)

/**
 * PUT /api/health-score/:projectId
 */
router.put('/:projectId', validate(projectIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { projectId } = req.params
  const healthResult = await updateProjectHealth(projectId)

  res.json({
    success: true,
    data: healthResult,
    message: '项目健康度已更新',
  })
}))

export default router
