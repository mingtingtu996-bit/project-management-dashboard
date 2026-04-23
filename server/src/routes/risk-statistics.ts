/**
 * 风险统计 API 路由
 * 提供风险趋势分析数据接口
 */

import { Router } from 'express'
import { z } from 'zod'

import { authenticate as requireAuth, optionalAuthenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate } from '../middleware/validation.js'
import { riskStatisticsService } from '../services/riskStatisticsService.js'

const router = Router()

const trendQuerySchema = z.object({
  projectId: z.string().trim().min(1, '缺少 projectId 参数'),
  days: z.coerce.number().int().min(1).max(365).optional(),
})

const latestQuerySchema = z.object({
  projectId: z.string().trim().min(1, '缺少 projectId 参数'),
})

const generateBodySchema = z.object({
  projectId: z.string().trim().min(1, '缺少 projectId 参数'),
  date: z.string().trim().optional(),
})

const generateHistoricalBodySchema = z.object({
  projectId: z.string().trim().min(1, '缺少 projectId 参数'),
  days: z.coerce.number().int().min(1).max(365).optional(),
})

function buildError(message: string) {
  return {
    success: false,
    error: {
      code: 'RISK_STATISTICS_FAILED',
      message,
    },
    timestamp: new Date().toISOString(),
  }
}

router.get('/trend', optionalAuthenticate, validate(trendQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId)
  const days = Number(req.query.days ?? 30)
  const trendData = await riskStatisticsService.getRiskTrend(projectId, days)

  res.json({
    success: true,
    data: trendData,
  })
}))

router.get('/latest', requireAuth, validate(latestQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId)
  const snapshot = await riskStatisticsService.getLatestSnapshot(projectId)

  res.json({
    success: true,
    data: snapshot,
  })
}))

router.post('/generate', requireAuth, validate(generateBodySchema), asyncHandler(async (req, res) => {
  const { projectId, date } = req.body
  const statDate = date || new Date().toISOString().split('T')[0]
  const snapshot = await riskStatisticsService.generateDailySnapshot(projectId, statDate)

  if (!snapshot) {
    return res.status(500).json(buildError('生成统计快照失败'))
  }

  res.json({
    success: true,
    data: snapshot,
    message: `成功生成 ${statDate} 的统计快照`,
  })
}))

router.post('/generate-historical', requireAuth, validate(generateHistoricalBodySchema), asyncHandler(async (req, res) => {
  const projectId = String(req.body.projectId)
  const days = Number(req.body.days ?? 30)
  const generated = await riskStatisticsService.generateHistoricalSnapshots(projectId, days)

  res.json({
    success: true,
    data: { generatedCount: generated },
    message: `成功生成 ${generated} 条历史统计记录`,
  })
}))

router.get('/summary', requireAuth, validate(latestQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId)

  const [weekTrend, monthTrend] = await Promise.all([
    riskStatisticsService.getRiskTrend(projectId, 7),
    riskStatisticsService.getRiskTrend(projectId, 30),
  ])

  const latest = monthTrend.trend.length > 0
    ? monthTrend.trend[monthTrend.trend.length - 1]
    : null

  res.json({
    success: true,
    data: {
      week: weekTrend.summary,
      month: monthTrend.summary,
      latest,
      trend: monthTrend.trend,
    },
  })
}))

export default router
