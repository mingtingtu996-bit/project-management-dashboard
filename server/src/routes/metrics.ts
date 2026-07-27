import { Router, type Request } from 'express'

import { getCurrentCompanyMembership, getVisibleProjectIds } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { authenticate, requireProjectMember } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import {
  getMetricRegistryEntry,
  isRegisteredMetric,
  listMetricRegistry,
  type MetricGranularity,
  type MetricGroupBy,
  type MetricKey,
} from '../services/metricRegistryService.js'
import { getCompanyTrendAnalytics } from '../services/companyTrendAnalyticsService.js'
import { supabase } from '../services/dbService.js'
import {
  getProjectTrendAnalytics,
  normalizeTrendGranularity,
  normalizeTrendGroupBy,
} from '../services/projectTrendAnalyticsService.js'
import { evaluateV14AssetAdmissionAutomationForTypes } from '../services/v14AssetAdmissionAutomationService.js'

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

function errorResponse(code: string, message: string): ApiResponse {
  return {
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
  }
}

function toBusinessMetricRegistryEntry(entry: ReturnType<typeof listMetricRegistry>[number]) {
  return {
    key: entry.key,
    label: entry.label,
    description: entry.description,
    valueType: entry.dataType,
    defaultGranularity: entry.defaultGranularity,
    supportedGroupBy: entry.supportedGroupBy,
    emptyValuePolicy: entry.nullStrategy,
    frontendVisible: entry.frontendVisible !== false,
    legacyAliases: entry.deprecatedAliases ?? [],
  }
}

function validateMetricAndOptions(req: Pick<Request, 'query'>, metric: string | undefined) {
  if (!metric || !isRegisteredMetric(metric)) {
    return {
      ok: false as const,
      status: 404,
      response: errorResponse('METRIC_NOT_REGISTERED', 'Metric is not registered'),
    }
  }

  const entry = getMetricRegistryEntry(metric)
  if (!entry) {
    return {
      ok: false as const,
      status: 404,
      response: errorResponse('METRIC_NOT_REGISTERED', 'Metric registry entry is missing'),
    }
  }

  const groupByRaw = getQueryValue(req.query.groupBy)
  const resolvedGroupBy = groupByRaw ? normalizeTrendGroupBy(groupByRaw) : 'none'
  if (groupByRaw && !resolvedGroupBy) {
    return {
      ok: false as const,
      status: 400,
      response: errorResponse('METRIC_GROUP_BY_UNSUPPORTED', 'Metric does not support this groupBy'),
    }
  }

  const groupBy: MetricGroupBy = resolvedGroupBy ?? 'none'
  if (groupBy !== 'none' && !entry.supportedGroupBy.includes(groupBy)) {
    return {
      ok: false as const,
      status: 400,
      response: errorResponse('METRIC_GROUP_BY_UNSUPPORTED', 'Metric does not support this groupBy'),
    }
  }

  const granularityRaw = getQueryValue(req.query.granularity)
  const resolvedGranularity = granularityRaw ? normalizeTrendGranularity(granularityRaw) : entry.defaultGranularity
  if (granularityRaw && !resolvedGranularity) {
    return {
      ok: false as const,
      status: 400,
      response: errorResponse('METRIC_GRANULARITY_UNSUPPORTED', 'Invalid granularity'),
    }
  }

  return {
    ok: true as const,
    entry,
    metric: metric as MetricKey,
    groupBy,
    granularity: resolvedGranularity ?? entry.defaultGranularity,
  }
}

function isTrendValidationError(error: Error) {
  return error.message.startsWith('Invalid date') ||
    error.message === 'Start date cannot be later than end date' ||
    error.message.startsWith('无效日期格式') ||
    error.message === '开始日期不能晚于结束日期'
}

router.get('/metrics/registry', asyncHandler(async (_req, res) => {
  const data = listMetricRegistry()
    .filter((metric) => metric.frontendVisible !== false)
    .map(toBusinessMetricRegistryEntry)

  const response: ApiResponse<typeof data> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/metrics/admission-automation', asyncHandler(async (_req, res) => {
  const response: ApiResponse = {
    success: true,
    data: evaluateV14AssetAdmissionAutomationForTypes(['metric_admission_asset']),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get(
  '/projects/:projectId/metrics/trend',
  requireProjectMember((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId ?? '').trim()
    const validation = validateMetricAndOptions(req, getQueryValue(req.query.metric))
    if (!validation.ok) return res.status(validation.status).json(validation.response)

    logger.info('Fetching project metric trend', {
      projectId,
      metric: validation.metric,
      groupBy: validation.groupBy,
      granularity: validation.granularity,
    })

    try {
      const data = await getProjectTrendAnalytics(projectId, validation.metric, {
        from: getQueryValue(req.query.from),
        to: getQueryValue(req.query.to),
        groupBy: validation.groupBy,
        granularity: validation.granularity,
      })

      const response: ApiResponse<typeof data> = {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    } catch (error) {
      if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
        return res.status(404).json(errorResponse('PROJECT_NOT_FOUND', 'Project not found'))
      }
      if (error instanceof Error && isTrendValidationError(error)) {
        return res.status(400).json(errorResponse('VALIDATION_ERROR', error.message))
      }
      throw error
    }
  }),
)

router.get(
  '/projects/:projectId/metrics/availability',
  requireProjectMember((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId ?? '').trim()
    const { data, error } = await supabase
      .from('project_daily_snapshot')
      .select('snapshot_date, metric_availability, metric_registry_version, metric_snapshot_version')
      .eq('project_id', projectId)
      .order('snapshot_date', { ascending: false })
      .limit(1)

    if (error) throw error

    const latest = Array.isArray(data) ? data[0] : null
    const response: ApiResponse = {
      success: true,
      data: {
        projectId,
        snapshotDate: latest?.snapshot_date ?? null,
        metricAvailability: latest?.metric_availability ?? {},
        metricRegistryVersion: latest?.metric_registry_version ?? null,
        metricSnapshotVersion: latest?.metric_snapshot_version ?? null,
      },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.get(
  '/projects/:projectId/metrics/summary',
  requireProjectMember((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId ?? '').trim()
    const latestResult = await supabase
      .from('metric_value_snapshots')
      .select('snapshot_date')
      .eq('project_id', projectId)
      .eq('group_by', 'project')
      .order('snapshot_date', { ascending: false })
      .limit(1)

    if (latestResult.error) throw latestResult.error

    const snapshotDate = Array.isArray(latestResult.data) ? latestResult.data[0]?.snapshot_date : null
    if (!snapshotDate) {
      const emptyResponse: ApiResponse = {
        success: true,
        data: { projectId, snapshotDate: null, metrics: [] },
        timestamp: new Date().toISOString(),
      }
      return res.json(emptyResponse)
    }

    const { data, error } = await supabase
      .from('metric_value_snapshots')
      .select('metric_key, metric_value, value_text, value_type, availability_status, null_strategy, caliber_version, group_by, group_key, group_label')
      .eq('project_id', projectId)
      .eq('snapshot_date', snapshotDate)
      .eq('group_by', 'project')
      .order('metric_key', { ascending: true })

    if (error) throw error

    const response: ApiResponse = {
      success: true,
      data: {
        projectId,
        snapshotDate,
        metrics: data ?? [],
      },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.get('/company/metrics/trend', asyncHandler(async (req, res) => {
  const membership = req.user?.id
    ? await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
    : null

  if (membership?.role !== 'company_admin') {
    return res.status(403).json(errorResponse('FORBIDDEN', 'You do not have permission to view company metrics'))
  }

  const validation = validateMetricAndOptions(req, getQueryValue(req.query.metric))
  if (!validation.ok) return res.status(validation.status).json(validation.response)
  if (validation.groupBy !== 'none') {
    return res.status(400).json(errorResponse('METRIC_GROUP_BY_UNSUPPORTED', 'Company trend does not support groupBy'))
  }

  const visibleProjectIds = req.user?.id
    ? await getVisibleProjectIds(req.user.id, req.user.globalRole, membership.companyId)
    : null

  try {
    const data = await getCompanyTrendAnalytics(validation.metric, {
      from: getQueryValue(req.query.from),
      to: getQueryValue(req.query.to),
      granularity: validation.granularity as MetricGranularity,
      projectIds: visibleProjectIds ? [...visibleProjectIds] : [],
    })

    const response: ApiResponse<typeof data> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (error) {
    if (error instanceof Error && isTrendValidationError(error)) {
      return res.status(400).json(errorResponse('VALIDATION_ERROR', error.message))
    }
    throw error
  }
}))

export default router
