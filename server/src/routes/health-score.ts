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
import { recordProjectDailySnapshots } from '../services/projectDailySnapshotService.js'
import { REQUEST_TIMEOUT_BUDGETS, runWithRequestBudget } from '../services/requestBudgetService.js'
import { calculateProjectHealth, updateProjectHealth, updateAllProjectsHealth } from '../services/projectHealthService.js'
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

function formatMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getPreviousMonthKey(date = new Date()) {
  const previous = new Date(date.getFullYear(), date.getMonth() - 1, 1)
  return formatMonthKey(previous)
}

function monthStart(monthKey: string) {
  return `${monthKey}-01`
}

function nextMonthStart(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return monthStart(formatMonthKey(new Date(year, month, 1)))
}

function snapshotDateToMonthKey(value: unknown) {
  const text = String(value ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.slice(0, 7) : null
}

function toFiniteNumber(value: unknown) {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function average(values: number[]) {
  if (values.length === 0) return null
  // eslint-disable-next-line -- route-level-aggregation-approved
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function latestMonthlySnapshotRows<T extends {
  project_id: string | null
  snapshot_date: string | null
  health_score?: number | null
}>(rows: T[]) {
  const latestRows = new Map<string, T>()

  for (const row of rows) {
    const period = snapshotDateToMonthKey(row.snapshot_date)
    const projectId = String(row.project_id ?? '').trim()
    if (!period || !projectId) continue

    const key = `${period}::${projectId}`
    const current = latestRows.get(key)
    if (!current || String(row.snapshot_date) > String(current.snapshot_date)) {
      latestRows.set(key, row)
    }
  }

  return [...latestRows.values()]
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

        const thisMonth = formatMonthKey()
        const lastMonth = getPreviousMonthKey()

        const { data, error } = await supabase
          .from('project_daily_snapshot')
          .select('project_id, snapshot_date, health_score')
          .gte('snapshot_date', monthStart(lastMonth))
          .lt('snapshot_date', nextMonthStart(thisMonth))
          .order('snapshot_date', { ascending: true })
          .order('project_id', { ascending: true })

        if (error) {
          logger.warn('查询日快照历史均值失败（可能表未创建）', { message: error.message })
          return { thisMonth: null, lastMonth: null, change: null }
        }

        const rows = latestMonthlySnapshotRows(data || [])
        const thisMonthScores = rows
          .filter((row) => snapshotDateToMonthKey(row.snapshot_date) === thisMonth)
          .map((row) => toFiniteNumber(row.health_score))
          .filter((value): value is number => value !== null)
        const lastMonthScores = rows
          .filter((row) => snapshotDateToMonthKey(row.snapshot_date) === lastMonth)
          .map((row) => toFiniteNumber(row.health_score))
          .filter((value): value is number => value !== null)

        const thisAvg = average(thisMonthScores)
        const lastAvg = average(lastMonthScores)
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
      async () => recordProjectDailySnapshots(),
    )

    res.json({
      success: true,
      data: result,
      message: `成功记录 ${result.recorded} 个项目的日快照（${result.snapshotDate}）`,
    })
  } catch (error: any) {
    logger.error('记录项目日快照失败', { error })
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
        .from('project_daily_snapshot')
        .select('project_id, snapshot_date, health_score, health_status, updated_at')
        .eq('project_id', projectId)
        .order('snapshot_date', { ascending: false })

      if (error) {
        logger.warn('查询日快照健康度历史失败（可能表未创建）', { message: error.message, projectId })
        return res.json({ success: true, data: [] })
      }

      const monthlyRows = latestMonthlySnapshotRows(data || [])
        .sort((left, right) => String(right.snapshot_date).localeCompare(String(left.snapshot_date)))
        .slice(0, months)
        .map((row) => ({
          period: snapshotDateToMonthKey(row.snapshot_date),
          health_score: row.health_score,
          health_status: row.health_status,
          recorded_at: row.updated_at ?? row.snapshot_date,
        }))

      res.json({ success: true, data: monthlyRows })
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
