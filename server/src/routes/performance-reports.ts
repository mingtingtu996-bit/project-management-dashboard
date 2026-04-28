import { Router } from 'express'
import { z } from 'zod'

import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'

const router = Router()

const performanceReportBodySchema = z.object({
  source: z.enum(['navigation', 'route', 'web_vital', 'long_task', 'api']),
  name: z.string().trim().min(1).max(120),
  value: z.number().refine(Number.isFinite),
  unit: z.enum(['ms', 'score', 'count']).default('ms'),
  route: z.string().trim().max(1000).optional().nullable(),
  url: z.string().trim().max(1000).optional().nullable(),
  userAgent: z.string().trim().max(1000).optional().nullable(),
  occurredAt: z.string().trim().max(80).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
}).passthrough()

type PerformanceReportBody = z.infer<typeof performanceReportBodySchema>
type PerformanceReportSource = PerformanceReportBody['source']
type PerformanceReportUnit = NonNullable<PerformanceReportBody['unit']>
type PerformanceGateStatus = 'pass' | 'watch' | 'fail' | 'insufficient_data'

interface StoredPerformanceReport {
  source: PerformanceReportSource
  name: string
  value: number
  unit: PerformanceReportUnit
  route: string | null
  url: string | null
  userAgent: string | null
  occurredAt: string
  receivedAt: string
  metadata: Record<string, unknown>
  thresholdExceeded: boolean
  requestId?: string
}

interface MetricGroupSummary {
  key: string
  samples: number
  average: number
  p95: number
  max: number
  thresholdExceeded: number
  lastOccurredAt: string
}

function readPositiveNumberEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const SLOW_NAVIGATION_MS = readPositiveNumberEnv('CLIENT_SLOW_NAVIGATION_MS', 2500)
const SLOW_ROUTE_SETTLED_MS = readPositiveNumberEnv('CLIENT_SLOW_ROUTE_SETTLED_MS', 250)
const SLOW_API_MS = readPositiveNumberEnv('CLIENT_SLOW_API_MS', 1200)
const SLOW_LCP_MS = readPositiveNumberEnv('CLIENT_SLOW_LCP_MS', 2500)
const CLS_THRESHOLD = readPositiveNumberEnv('CLIENT_CLS_THRESHOLD', 0.1)
const MAX_STORED_PERFORMANCE_REPORTS = Math.floor(
  readPositiveNumberEnv('PERFORMANCE_REPORTS_MEMORY_LIMIT', 1000),
)

const performanceReportWindow: StoredPerformanceReport[] = []

function trimText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function compactMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(value).slice(0, 24)) {
    const normalizedKey = key.slice(0, 80)
    if (typeof entry === 'string') {
      result[normalizedKey] = entry.slice(0, 500)
      continue
    }
    if (typeof entry === 'number' || typeof entry === 'boolean' || entry == null) {
      result[normalizedKey] = entry
      continue
    }

    try {
      result[normalizedKey] = JSON.stringify(entry).slice(0, 500)
    } catch {
      result[normalizedKey] = '[unserializable]'
    }
  }

  return result
}

function normalizePathLike(value: string | null): string {
  if (!value) return 'unknown'

  const normalizeDynamicSegments = (pathname: string) => pathname
    .split('/')
    .map((segment) => (
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment) || /^\d+$/.test(segment)
        ? ':id'
        : segment
    ))
    .join('/')

  try {
    return normalizeDynamicSegments(new URL(value, 'http://local.performance').pathname || '/')
  } catch {
    return normalizeDynamicSegments(value.split(/[?#]/)[0]?.slice(0, 160) || 'unknown')
  }
}

function readMetadataText(metadata: Record<string, unknown>, key: string, fallback = 'unknown') {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : fallback
}

function readMetadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isThresholdExceeded(params: {
  source: string
  name: string
  value: number
  metadata: Record<string, unknown>
}) {
  if (params.source === 'api') {
    return params.value >= SLOW_API_MS || Number(params.metadata.statusCode ?? 200) >= 400 || Boolean(params.metadata.errorCode)
  }
  if (params.source === 'navigation') return params.value >= SLOW_NAVIGATION_MS
  if (params.source === 'route') return params.value >= SLOW_ROUTE_SETTLED_MS
  if (params.source === 'long_task') return true
  if (params.name === 'largest_contentful_paint') return params.value >= SLOW_LCP_MS
  if (params.name === 'cumulative_layout_shift') return params.value >= CLS_THRESHOLD
  return false
}

function appendPerformanceReport(report: StoredPerformanceReport) {
  performanceReportWindow.push(report)
  if (performanceReportWindow.length > MAX_STORED_PERFORMANCE_REPORTS) {
    performanceReportWindow.splice(0, performanceReportWindow.length - MAX_STORED_PERFORMANCE_REPORTS)
  }
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
  return sorted[Math.max(index, 0)]
}

function roundMetric(value: number) {
  return Number(value.toFixed(2))
}

function summarizeGroups(
  reports: StoredPerformanceReport[],
  keySelector: (report: StoredPerformanceReport) => string,
): MetricGroupSummary[] {
  const groups = new Map<string, StoredPerformanceReport[]>()

  for (const report of reports) {
    const key = keySelector(report)
    const group = groups.get(key) ?? []
    group.push(report)
    groups.set(key, group)
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const values = group.map((report) => report.value)
      let sum = 0
      for (const value of values) {
        sum += value
      }

      let lastOccurredAt = group[0]?.occurredAt ?? new Date(0).toISOString()
      for (const report of group) {
        if (report.occurredAt > lastOccurredAt) {
          lastOccurredAt = report.occurredAt
        }
      }

      return {
        key,
        samples: group.length,
        average: roundMetric(sum / group.length),
        p95: roundMetric(percentile(values, 0.95)),
        max: roundMetric(Math.max(...values)),
        thresholdExceeded: group.filter((report) => report.thresholdExceeded).length,
        lastOccurredAt,
      }
    })
    .sort((left, right) => (
      right.thresholdExceeded - left.thresholdExceeded
      || right.p95 - left.p95
      || right.samples - left.samples
    ))
}

function buildSlowApiSummary(reports: StoredPerformanceReport[]) {
  const apiReports = reports.filter((report) => report.source === 'api')
  return summarizeGroups(apiReports, (report) => {
    const method = readMetadataText(report.metadata, 'method', 'GET').toUpperCase()
    return `${method} ${normalizePathLike(report.url)}`
  }).slice(0, 5).map((summary) => {
    const group = apiReports.filter((report) => {
      const method = readMetadataText(report.metadata, 'method', 'GET').toUpperCase()
      return `${method} ${normalizePathLike(report.url)}` === summary.key
    })

    return {
      ...summary,
      errorCount: group.filter((report) => (
        Boolean(report.metadata.errorCode)
        || (readMetadataNumber(report.metadata, 'statusCode') ?? 200) >= 400
      )).length,
      cacheStatuses: [...new Set(group.map((report) => readMetadataText(report.metadata, 'cacheStatus', 'network')))],
    }
  })
}

function buildReleaseGate(params: {
  totalReports: number
  thresholdExceededCount: number
  slowApis: Array<MetricGroupSummary & { errorCount: number }>
  slowRoutes: MetricGroupSummary[]
  webVitals: MetricGroupSummary[]
  longTasks: MetricGroupSummary[]
}): { status: PerformanceGateStatus; reasons: string[] } {
  if (params.totalReports === 0) {
    return {
      status: 'insufficient_data',
      reasons: ['当前窗口暂无线上性能证据，需要真实使用或巡检后再做精准治理判定。'],
    }
  }

  const reasons: string[] = []
  const failingApi = params.slowApis.find((item) => item.errorCount > 0 || item.p95 >= SLOW_API_MS * 2)
  const severeVital = params.webVitals.find((item) => (
    item.key.includes('largest_contentful_paint') && item.p95 >= SLOW_LCP_MS * 1.5
  ))

  if (failingApi) {
    reasons.push(`API 瓶颈需阻断处理：${failingApi.key}，p95=${failingApi.p95}ms，错误数=${failingApi.errorCount}。`)
  }
  if (severeVital) {
    reasons.push(`核心 Web Vital 严重超阈值：${severeVital.key}，p95=${severeVital.p95}ms。`)
  }
  if (reasons.length > 0) return { status: 'fail', reasons }

  if (params.thresholdExceededCount > 0) {
    return {
      status: 'watch',
      reasons: [
        `当前窗口存在 ${params.thresholdExceededCount} 条超阈值证据，应优先治理 TOP 慢点后再扩大优化范围。`,
      ],
    }
  }

  return {
    status: 'pass',
    reasons: ['当前窗口未发现超阈值性能证据，保持现有预算门禁并继续观察。'],
  }
}

function buildRecommendations(params: {
  totalReports: number
  slowApis: Array<MetricGroupSummary & { errorCount: number }>
  slowRoutes: MetricGroupSummary[]
  webVitals: MetricGroupSummary[]
  longTasks: MetricGroupSummary[]
}) {
  if (params.totalReports === 0) {
    return ['先跑一次核心路径巡检或等待真实用户访问，再按 summary 的 TOP 1-3 项进入定点治理。']
  }

  const recommendations: string[] = []
  const topApi = params.slowApis[0]
  const topRoute = params.slowRoutes[0]
  const topVital = params.webVitals[0]
  const topLongTask = params.longTasks[0]

  if (topApi?.thresholdExceeded) {
    recommendations.push(`优先治理慢 API：${topApi.key}，p95=${topApi.p95}ms，先查后端 SQL/缓存命中/并发去重。`)
  }
  if (topRoute?.thresholdExceeded) {
    recommendations.push(`优先治理慢路由：${topRoute.key}，p95=${topRoute.p95}ms，先查首屏请求扇出和大组件渲染。`)
  }
  if (topVital?.thresholdExceeded) {
    recommendations.push(`优先治理 Web Vital：${topVital.key}，p95=${topVital.p95}${topVital.key.includes('cumulative_layout_shift') ? '' : 'ms'}。`)
  }
  if (topLongTask) {
    recommendations.push(`拆分主线程长任务：${topLongTask.key}，max=${topLongTask.max}ms，优先延后非首屏计算。`)
  }

  return recommendations.length > 0
    ? recommendations.slice(0, 4)
    : ['当前窗口未发现明确慢点，不做无证据的大范围改造。']
}

export function buildPerformanceEvidenceSummary(reports: StoredPerformanceReport[] = performanceReportWindow) {
  const slowApis = buildSlowApiSummary(reports)
  const slowRoutes = summarizeGroups(
    reports.filter((report) => report.source === 'route' || report.source === 'navigation'),
    (report) => `${report.source}:${normalizePathLike(report.route ?? report.url)}`,
  ).slice(0, 5)
  const webVitals = summarizeGroups(
    reports.filter((report) => report.source === 'web_vital'),
    (report) => `${report.name}:${normalizePathLike(report.route ?? report.url)}`,
  ).slice(0, 5)
  const longTasks = summarizeGroups(
    reports.filter((report) => report.source === 'long_task'),
    (report) => normalizePathLike(report.route ?? report.url),
  ).slice(0, 5)
  const thresholdExceededCount = reports.filter((report) => report.thresholdExceeded).length
  const releaseGate = buildReleaseGate({
    totalReports: reports.length,
    thresholdExceededCount,
    slowApis,
    slowRoutes,
    webVitals,
    longTasks,
  })

  return {
    generatedAt: new Date().toISOString(),
    window: {
      retainedReports: reports.length,
      retentionLimit: MAX_STORED_PERFORMANCE_REPORTS,
      thresholdExceeded: thresholdExceededCount,
    },
    thresholds: {
      apiMs: SLOW_API_MS,
      navigationMs: SLOW_NAVIGATION_MS,
      routeSettledMs: SLOW_ROUTE_SETTLED_MS,
      lcpMs: SLOW_LCP_MS,
      cls: CLS_THRESHOLD,
    },
    topSlowApis: slowApis,
    topSlowRoutes: slowRoutes,
    topWebVitals: webVitals,
    topLongTasks: longTasks,
    releaseGate,
    recommendations: buildRecommendations({
      totalReports: reports.length,
      slowApis,
      slowRoutes,
      webVitals,
      longTasks,
    }),
  }
}

export function resetPerformanceReportsForTests() {
  performanceReportWindow.splice(0, performanceReportWindow.length)
}

router.post('/', validate(performanceReportBodySchema), asyncHandler(async (req, res) => {
  const body = req.body as PerformanceReportBody
  const metadata = compactMetadata(body.metadata)
  const thresholdExceeded = isThresholdExceeded({ source: body.source, name: body.name, value: body.value, metadata })
  const context = {
    source: body.source,
    name: body.name,
    value: body.value,
    unit: body.unit ?? 'ms',
    route: trimText(body.route, 1000),
    url: trimText(body.url, 1000),
    userAgent: trimText(body.userAgent, 1000),
    occurredAt: trimText(body.occurredAt, 80) ?? new Date().toISOString(),
    metadata,
    requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : undefined,
  }

  appendPerformanceReport({
    ...context,
    thresholdExceeded,
    receivedAt: new Date().toISOString(),
  })

  logger.info('Client performance evidence reported', context)

  if (thresholdExceeded) {
    logger.warn('Client performance threshold exceeded', context)
  }

  res.status(202).json({
    success: true,
    data: {
      accepted: true,
    },
  })
}))

router.get('/summary', asyncHandler(async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json({
    success: true,
    data: buildPerformanceEvidenceSummary(),
  })
}))

export default router
