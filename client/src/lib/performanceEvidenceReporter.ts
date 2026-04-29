type PerformanceEvidenceSource = 'navigation' | 'route' | 'web_vital' | 'long_task' | 'api'
type PerformanceEvidenceUnit = 'ms' | 'score' | 'count'

export interface PerformanceEvidenceReport {
  source: PerformanceEvidenceSource
  name: string
  value: number
  unit?: PerformanceEvidenceUnit
  route?: string
  url?: string
  metadata?: Record<string, unknown>
  occurredAt?: string
}

interface PerformanceEvidenceConfig {
  enabled: boolean
  endpoint: string
  apiSlowThresholdMs: number
  navigationSlowThresholdMs: number
  routeSettledThresholdMs: number
  lcpSlowThresholdMs: number
  clsThreshold: number
  maxLongTaskReports: number
}

interface ApiPerformanceEvidenceInput {
  url: string
  method: string
  statusCode: number | null
  durationMs: number
  cacheStatus?: 'network' | 'runtime_cache' | 'inflight'
  errorCode?: string
}

const DEFAULT_PERFORMANCE_EVIDENCE_CONFIG: PerformanceEvidenceConfig = {
  enabled: import.meta.env.MODE !== 'test',
  endpoint: '/api/performance-reports',
  apiSlowThresholdMs: 1200,
  navigationSlowThresholdMs: 2500,
  routeSettledThresholdMs: 250,
  lcpSlowThresholdMs: 2500,
  clsThreshold: 0.1,
  maxLongTaskReports: 8,
}

let runtimeConfig: PerformanceEvidenceConfig = { ...DEFAULT_PERFORMANCE_EVIDENCE_CONFIG }
let installed = false
let longTaskReportCount = 0

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function trimText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : undefined
}

function getCurrentRoute(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function compactMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(metadata).slice(0, 24)) {
    const normalizedKey = key.slice(0, 80)
    if (typeof value === 'string') {
      result[normalizedKey] = value.slice(0, 500)
      continue
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
      result[normalizedKey] = value
      continue
    }

    try {
      result[normalizedKey] = JSON.stringify(value).slice(0, 500)
    } catch {
      result[normalizedKey] = '[unserializable]'
    }
  }

  return Object.keys(result).length > 0 ? result : undefined
}

function buildPayload(report: PerformanceEvidenceReport) {
  return {
    source: report.source,
    name: trimText(report.name, 120) ?? 'unknown_metric',
    value: Number.isFinite(report.value) ? report.value : 0,
    unit: report.unit ?? 'ms',
    route: trimText(report.route ?? getCurrentRoute(), 1000),
    url: trimText(report.url ?? (typeof window !== 'undefined' ? window.location.href : undefined), 1000),
    userAgent: trimText(typeof navigator !== 'undefined' ? navigator.userAgent : undefined, 1000),
    metadata: compactMetadata(report.metadata),
    occurredAt: report.occurredAt ?? new Date().toISOString(),
  }
}

export function configurePerformanceEvidenceReporting(config: Partial<PerformanceEvidenceConfig>): void {
  runtimeConfig = {
    ...runtimeConfig,
    ...config,
  }
}

export async function reportPerformanceEvidence(report: PerformanceEvidenceReport): Promise<boolean> {
  if (!runtimeConfig.enabled || typeof window === 'undefined') return false

  const body = JSON.stringify(buildPayload(report))

  try {
    const response = await fetch(runtimeConfig.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'include',
      keepalive: true,
    })
    if (response.ok) return true
  } catch {
    // Fall back to sendBeacon below when keepalive fetch is unavailable or interrupted.
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      return navigator.sendBeacon(
        runtimeConfig.endpoint,
        new Blob([body], { type: 'application/json' }),
      )
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[performance-evidence] failed to report metric', error)
    }
  }

  return false
}

export function shouldReportApiPerformanceEvidence(input: ApiPerformanceEvidenceInput): boolean {
  if (!runtimeConfig.enabled) return false
  if (input.errorCode) return true
  if ((input.statusCode ?? 200) >= 400) return true
  return input.durationMs >= runtimeConfig.apiSlowThresholdMs
}

export function reportApiPerformanceEvidence(input: ApiPerformanceEvidenceInput): Promise<boolean> {
  if (!shouldReportApiPerformanceEvidence(input)) return Promise.resolve(false)

  return reportPerformanceEvidence({
    source: 'api',
    name: 'api_request',
    value: Math.round(input.durationMs),
    unit: 'ms',
    url: input.url,
    metadata: {
      method: input.method,
      statusCode: input.statusCode,
      cacheStatus: input.cacheStatus ?? 'network',
      errorCode: input.errorCode ?? null,
    },
  })
}

function reportNavigationTiming(): void {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  if (!navigation) return

  const loadEnd = navigation.loadEventEnd || navigation.domComplete || navigation.duration
  if (loadEnd <= 0) return

  void reportPerformanceEvidence({
    source: 'navigation',
    name: 'page_load',
    value: Math.round(loadEnd),
    unit: 'ms',
    metadata: {
      ttfbMs: Math.round(navigation.responseStart),
      domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
      transferSize: navigation.transferSize,
      encodedBodySize: navigation.encodedBodySize,
      slow: loadEnd >= runtimeConfig.navigationSlowThresholdMs,
    },
  })
}

function scheduleNavigationTimingReport(): void {
  if (document.readyState === 'complete') {
    window.setTimeout(reportNavigationTiming, 0)
    return
  }

  window.addEventListener('load', () => reportNavigationTiming(), { once: true })
}

function scheduleRouteSettledReport(fromRoute?: string): void {
  const startedAt = nowMs()
  const runAfterPaint = window.requestAnimationFrame ?? ((callback: FrameRequestCallback) => window.setTimeout(callback, 16))

  runAfterPaint(() => {
    runAfterPaint(() => {
      const durationMs = nowMs() - startedAt
      if (durationMs < runtimeConfig.routeSettledThresholdMs) return

      void reportPerformanceEvidence({
        source: 'route',
        name: 'route_settled',
        value: Math.round(durationMs),
        unit: 'ms',
        metadata: {
          fromRoute: fromRoute ?? null,
          toRoute: getCurrentRoute(),
        },
      })
    })
  })
}

function installRouteTiming(): void {
  const originalPushState = window.history.pushState
  const originalReplaceState = window.history.replaceState

  window.history.pushState = function pushState(...args) {
    const fromRoute = getCurrentRoute()
    const result = originalPushState.apply(window.history, args)
    scheduleRouteSettledReport(fromRoute)
    return result
  } as History['pushState']

  window.history.replaceState = function replaceState(...args) {
    const fromRoute = getCurrentRoute()
    const result = originalReplaceState.apply(window.history, args)
    scheduleRouteSettledReport(fromRoute)
    return result
  } as History['replaceState']

  window.addEventListener('popstate', () => scheduleRouteSettledReport())
}

function installWebVitalObservers(): void {
  if (typeof PerformanceObserver === 'undefined') return

  const supported = PerformanceObserver.supportedEntryTypes ?? []
  let latestLcp = 0
  let cls = 0

  if (supported.includes('largest-contentful-paint')) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        latestLcp = entry.startTime
      }
    })
    observer.observe({ type: 'largest-contentful-paint', buffered: true })
  }

  if (supported.includes('layout-shift')) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) {
        if (!entry.hadRecentInput) {
          cls += entry.value ?? 0
        }
      }
    })
    observer.observe({ type: 'layout-shift', buffered: true })
  }

  if (supported.includes('longtask')) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (longTaskReportCount >= runtimeConfig.maxLongTaskReports) return
        longTaskReportCount += 1

        void reportPerformanceEvidence({
          source: 'long_task',
          name: 'main_thread_long_task',
          value: Math.round(entry.duration),
          unit: 'ms',
          metadata: {
            startTimeMs: Math.round(entry.startTime),
          },
        })
      }
    })
    observer.observe({ type: 'longtask', buffered: true })
  }

  const flushVitals = () => {
    if (latestLcp > 0) {
      void reportPerformanceEvidence({
        source: 'web_vital',
        name: 'largest_contentful_paint',
        value: Math.round(latestLcp),
        unit: 'ms',
        metadata: {
          slow: latestLcp >= runtimeConfig.lcpSlowThresholdMs,
        },
      })
      latestLcp = 0
    }

    if (cls > 0) {
      void reportPerformanceEvidence({
        source: 'web_vital',
        name: 'cumulative_layout_shift',
        value: Number(cls.toFixed(4)),
        unit: 'score',
        metadata: {
          slow: cls >= runtimeConfig.clsThreshold,
        },
      })
      cls = 0
    }
  }

  window.addEventListener('pagehide', flushVitals)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushVitals()
    }
  })
}

export function installPerformanceEvidenceReporting(config: Partial<PerformanceEvidenceConfig> = {}): void {
  configurePerformanceEvidenceReporting(config)

  if (!runtimeConfig.enabled || installed || typeof window === 'undefined') return
  installed = true

  scheduleNavigationTimingReport()
  scheduleRouteSettledReport()
  installRouteTiming()
  installWebVitalObservers()
}

export function resetPerformanceEvidenceReportingForTests(): void {
  runtimeConfig = { ...DEFAULT_PERFORMANCE_EVIDENCE_CONFIG, enabled: false }
  installed = false
  longTaskReportCount = 0
}
