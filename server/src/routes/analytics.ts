import { Router } from 'express'

import { getVisibleProjectIds } from '../auth/access.js'
import { authenticate, requireProjectMember } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import {
  getMetricRegistryEntry,
  isRegisteredMetric,
  type MetricGranularity,
  type MetricGroupBy,
} from '../analytics/metricRegistry.js'
import { getCompanyTrendAnalytics } from '../services/companyTrendAnalyticsService.js'
import {
  getProjectTrendAnalytics,
  normalizeTrendGranularity,
  normalizeTrendGroupBy,
} from '../services/projectTrendAnalyticsService.js'

const router = Router()

router.use(authenticate)

function getQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized || undefined
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    const normalized = value[0].trim()
    return normalized || undefined
  }

  return undefined
}

function validationError(message: string): ApiResponse {
  return {
    success: false,
    error: { code: 'VALIDATION_ERROR', message },
    timestamp: new Date().toISOString(),
  }
}

router.get(
  '/project-trend',
  requireProjectMember((req) => getQueryValue(req.query.projectId)),
  asyncHandler(async (req, res) => {
    const projectId = getQueryValue(req.query.projectId)
    const metric = getQueryValue(req.query.metric)

    if (!projectId) {
      return res.status(400).json(validationError('项目ID不能为空'))
    }

    if (!metric || !isRegisteredMetric(metric)) {
      return res.status(400).json(validationError('指标不在白名单中'))
    }

    const entry = getMetricRegistryEntry(metric)
    if (!entry) {
      return res.status(400).json(validationError('指标配置缺失'))
    }

    const groupByRaw = getQueryValue(req.query.groupBy)
    const resolvedGroupBy = groupByRaw ? normalizeTrendGroupBy(groupByRaw) : 'none'
    if (groupByRaw && !resolvedGroupBy) {
      return res.status(400).json(validationError('groupBy 参数不合法'))
    }
    const groupBy: MetricGroupBy = resolvedGroupBy ?? 'none'

    if (groupBy !== 'none' && !entry.supportedGroupBy.includes(groupBy)) {
      return res.status(400).json(validationError('当前指标不支持该 groupBy'))
    }

    const granularityRaw = getQueryValue(req.query.granularity)
    const resolvedGranularity = granularityRaw ? normalizeTrendGranularity(granularityRaw) : entry.defaultGranularity
    if (granularityRaw && !resolvedGranularity) {
      return res.status(400).json(validationError('granularity 参数不合法'))
    }
    const granularity: MetricGranularity = resolvedGranularity ?? entry.defaultGranularity

    logger.info('Fetching project trend analytics', { projectId, metric, groupBy, granularity })

    try {
      const data = await getProjectTrendAnalytics(projectId, metric, {
        from: getQueryValue(req.query.from),
        to: getQueryValue(req.query.to),
        groupBy,
        granularity,
      })

      const response: ApiResponse<typeof data> = {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    } catch (error) {
      if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
        return res.status(404).json(validationError('项目不存在'))
      }

      if (
        error instanceof Error &&
        (error.message.startsWith('无效日期格式') || error.message === '开始日期不能晚于结束日期')
      ) {
        return res.status(400).json(validationError(error.message))
      }

      throw error
    }
  }),
)

router.get('/company-trend', asyncHandler(async (req, res) => {
  const metric = getQueryValue(req.query.metric)

  if (!metric || !isRegisteredMetric(metric)) {
    return res.status(400).json(validationError('指标不在白名单中'))
  }

  const entry = getMetricRegistryEntry(metric)
  if (!entry) {
    return res.status(400).json(validationError('指标配置缺失'))
  }

  const groupByRaw = getQueryValue(req.query.groupBy)
  if (groupByRaw && groupByRaw !== 'none') {
    return res.status(400).json(validationError('company-trend 不支持 groupBy'))
  }

  const granularityRaw = getQueryValue(req.query.granularity)
  const resolvedGranularity = granularityRaw ? normalizeTrendGranularity(granularityRaw) : entry.defaultGranularity
  if (granularityRaw && !resolvedGranularity) {
    return res.status(400).json(validationError('granularity 参数不合法'))
  }
  const granularity: MetricGranularity = resolvedGranularity ?? entry.defaultGranularity

  let visibleProjectIds: string[] | null = null
  if (req.user?.id) {
    const ids = await getVisibleProjectIds(req.user.id, req.user.globalRole)
    visibleProjectIds = ids ? [...ids] : null
  }

  logger.info('Fetching company trend analytics', {
    metric,
    granularity,
    visibleProjectCount: visibleProjectIds?.length ?? null,
  })

  try {
    const data = await getCompanyTrendAnalytics(metric, {
      from: getQueryValue(req.query.from),
      to: getQueryValue(req.query.to),
      granularity,
      projectIds: visibleProjectIds,
    })

    const response: ApiResponse<typeof data> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith('无效日期格式') || error.message === '开始日期不能晚于结束日期')
    ) {
      return res.status(400).json(validationError(error.message))
    }

    throw error
  }
}))

export default router
