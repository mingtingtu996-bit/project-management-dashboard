/**
 * 健康度 API 路由
 * 提供项目健康度的计算和更新接口
 *
 * 路由顺序说明：固定路径（batch/record-snapshot）必须在参数路径（/:projectId）之前
 */

import express from 'express'
import { z } from 'zod'

import { getVisibleProjectIds } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import {
  loadProjectMonthlyHealthHistory,
  recordProjectDailySnapshot,
  recordProjectDailySnapshots,
} from '../services/projectDailySnapshotService.js'
import { REQUEST_TIMEOUT_BUDGETS, runWithRequestBudget } from '../services/requestBudgetService.js'
import { calculateProjectHealth, updateProjectHealth, updateAllProjectsHealth } from '../services/projectHealthService.js'
import type { ApiResponse } from '../types/index.js'

const router = express.Router()
router.use(authenticate)

type ProjectHealthResult = Awaited<ReturnType<typeof calculateProjectHealth>>
type ProjectHealthDegradedResult = {
  degraded: true
  degradationReason: 'request_budget_exceeded'
  score: null
  details: null
  status: 'degraded'
  message: string
}
type ProjectHealthReadResult = ProjectHealthResult | ProjectHealthDegradedResult

const HEALTH_SCORE_READ_CACHE_TTL_MS = Number(process.env.HEALTH_SCORE_READ_CACHE_TTL_MS ?? 60_000)
const projectHealthScoreReadCache = new Map<string, { expiresAt: number; result: ProjectHealthResult }>()

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

export function clearHealthScoreReadCacheForTest() {
  if (process.env.NODE_ENV !== 'test') return
  projectHealthScoreReadCache.clear()
}

function buildDegradedProjectHealthScore(projectId: string, error: unknown): ProjectHealthDegradedResult {
  logger.warn('[health-score] project health score degraded after budgeted read failed without cache', {
    projectId,
    error: error instanceof Error ? error.message : String(error),
  })

  return {
    degraded: true,
    degradationReason: 'request_budget_exceeded',
    score: null,
    details: null,
    status: 'degraded',
    message: '健康分解暂不可用，请稍后重试。',
  }
}

async function loadProjectHealthScoreWithBudget(projectId: string): Promise<ProjectHealthReadResult> {
  const cached = projectHealthScoreReadCache.get(projectId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result
  }

  try {
    const result = await runWithRequestBudget(
      {
        operation: 'health-score.project-read',
        timeoutMs: REQUEST_TIMEOUT_BUDGETS.analysisReadMs,
      },
      () => calculateProjectHealth(projectId),
    )
    projectHealthScoreReadCache.set(projectId, {
      expiresAt: Date.now() + HEALTH_SCORE_READ_CACHE_TTL_MS,
      result,
    })
    return result
  } catch (error) {
    if (cached) {
      logger.warn('[health-score] reused stale project health score after budgeted read failed', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      })
      return cached.result
    }
    return buildDegradedProjectHealthScore(projectId, error)
  }
}

async function getVisibleProjectIdsForRequest(req: express.Request): Promise<string[] | null> {
  if (!req.user?.id) return []
  return getVisibleProjectIds(req.user.id, req.user.globalRole, getRequestCompanyId(req))
}

/**
 * POST /api/health-score/batch
 * 批量更新所有项目的健康度
 */
router.post('/batch', asyncHandler(async (req, res) => {
  try {
    const visibleProjectIds = await getVisibleProjectIdsForRequest(req)
    const updatedCount = await runWithRequestBudget(
      {
        operation: 'health_score.batch',
        timeoutMs: REQUEST_TIMEOUT_BUDGETS.batchWriteMs,
      },
      async () => updateAllProjectsHealth(visibleProjectIds),
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
 * POST /api/health-score/record-snapshot
 */
router.post('/record-snapshot', asyncHandler(async (req, res) => {
  try {
    const visibleProjectIds = await getVisibleProjectIdsForRequest(req)
    const result = await runWithRequestBudget(
      {
        operation: 'health_score.record_snapshot',
        timeoutMs: REQUEST_TIMEOUT_BUDGETS.batchWriteMs,
      },
      async () => {
        if (visibleProjectIds === null) return recordProjectDailySnapshots()
        const results = await Promise.all(visibleProjectIds.map((projectId) => recordProjectDailySnapshot(projectId)))
        // eslint-disable-next-line -- route-level-aggregation-approved
        return results.reduce((acc, item) => ({
          recorded: acc.recorded + item.recorded,
          failed: acc.failed + item.failed,
          snapshotDate: item.snapshotDate || acc.snapshotDate,
        }), { recorded: 0, failed: 0, snapshotDate: new Date().toISOString().split('T')[0] })
      },
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
router.get('/:projectId', validate(projectIdParamSchema, 'params'), requireProjectMember((req) => req.params.projectId), asyncHandler(async (req, res) => {
  const { projectId } = req.params
  const healthResult = await loadProjectHealthScoreWithBudget(projectId)

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
  requireProjectMember((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    try {
      const { projectId } = req.params
      const months = Number(req.query.months ?? 3)

      const history = await loadProjectMonthlyHealthHistory(projectId, months)
      res.json({ success: true, data: history })
    } catch (error) {
      logger.error('获取健康度历史失败', { error, projectId: req.params.projectId })
      res.json({ success: true, data: [] })
    }
  }),
)

/**
 * PUT /api/health-score/:projectId
 */
router.put('/:projectId', validate(projectIdParamSchema, 'params'), requireProjectEditor((req) => req.params.projectId), asyncHandler(async (req, res) => {
  const { projectId } = req.params
  const healthResult = await updateProjectHealth(projectId)

  res.json({
    success: true,
    data: healthResult,
    message: '项目健康度已更新',
  })
}))

export default router
