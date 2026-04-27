import { getMetricRegistryEntry, type MetricGranularity, type MetricKey } from '../analytics/metricRegistry.js'
import {
  getCompanyTrendAnalytics as buildCompanyTrendAnalytics,
  resolveTrendDateRange,
  type CompanyTrendResponse,
} from './projectTrendAnalyticsService.js'

export type { CompanyTrendResponse } from './projectTrendAnalyticsService.js'

export async function getCompanyTrendAnalytics(
  metric: MetricKey,
  options: {
    from?: unknown
    to?: unknown
    granularity?: MetricGranularity
    projectIds?: string[] | null
  } = {},
): Promise<CompanyTrendResponse> {
  const entry = getMetricRegistryEntry(metric)
  const dateRange = resolveTrendDateRange(options.from, options.to)
  const granularity = options.granularity ?? entry?.defaultGranularity ?? 'day'

  return await buildCompanyTrendAnalytics(metric, {
    from: dateRange.from,
    to: dateRange.to,
    granularity,
    projectIds: options.projectIds ?? null,
  })
}
