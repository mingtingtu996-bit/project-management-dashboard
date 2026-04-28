import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

function readWorkspaceSource(relativePath: string) {
  const candidates = [
    join(process.cwd(), relativePath),
    join(process.cwd(), 'client', relativePath),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate source file: ${relativePath}`)
}

function normalizeSource(source: string) {
  return source.replace(/\r\n/g, '\n')
}

describe('Wave8 performance source contracts', () => {
  it('allows project routes to render once project metadata is ready', () => {
    const source = readWorkspaceSource('src/hooks/useProjectInit.ts')

    expect(source.includes("export type ProjectInitStatus = 'idle' | 'loading' | 'project_ready' | 'loaded' | 'not_found' | 'error'")).toBe(true)
    expect(source.includes("setStatus('project_ready')")).toBe(true)
    expect(source.indexOf("setStatus('project_ready')")).toBeLessThan(source.indexOf("setSharedSliceStatus('warnings', { loading: true, error: null })"))
    expect(source.includes("isLoaded:\n      (status === 'project_ready' || status === 'loaded')")).toBe(true)
    expect(source.includes("isHydrated: status === 'loaded'")).toBe(true)
  })

  it('uses the v1.2.2 project bootstrap endpoint before falling back to legacy fan-out', () => {
    const source = readWorkspaceSource('src/hooks/useProjectInit.ts')

    expect(source.includes("fetchProjectBootstrap(id, controller.signal)")).toBe(true)
    expect(source.includes('`/api/projects/${id}/bootstrap?changeLogLimit=100`')).toBe(true)
    expect(source.includes('bootstrap failed, falling back to legacy fan-out')).toBe(true)
    expect(source.indexOf('fetchProjectBootstrap(id, controller.signal)'))
      .toBeLessThan(source.indexOf('fetchAndCacheProject(id, controller.signal)'))
  })

  it('keeps the v1.2.3 api read path protected by short runtime cache and in-flight dedupe', () => {
    const source = readWorkspaceSource('src/lib/apiClient.ts')

    expect(source.includes('const DEFAULT_API_READ_CACHE_TTL_MS = 2500')).toBe(true)
    expect(source.includes('const apiReadCache = new Map')).toBe(true)
    expect(source.includes('const apiReadInflight = new Map')).toBe(true)
    expect(source.includes('export function clearApiClientRuntimeCache()')).toBe(true)
    expect(source.includes("if (method !== 'GET' && method !== 'HEAD')")).toBe(true)
    expect(source.includes('clearApiClientRuntimeCache()')).toBe(true)
    expect(source.includes('apiReadInflight.set(cacheKey, request)')).toBe(true)
  })

  it('keeps the v1.2.4 online performance evidence loop wired end to end', () => {
    const reporterSource = readWorkspaceSource('src/lib/performanceEvidenceReporter.ts')
    const apiClientSource = readWorkspaceSource('src/lib/apiClient.ts')
    const mainSource = readWorkspaceSource('src/main.tsx')
    const serverIndexSource = readWorkspaceSource('../server/src/index.ts')
    const performanceRouteSource = readWorkspaceSource('../server/src/routes/performance-reports.ts')
    const serverLoggerSource = readWorkspaceSource('../server/src/middleware/logger.ts')

    expect(reporterSource.includes("endpoint: '/api/performance-reports'")).toBe(true)
    expect(reporterSource.includes('PerformanceObserver.supportedEntryTypes')).toBe(true)
    expect(reporterSource.includes('reportApiPerformanceEvidence')).toBe(true)
    expect(reporterSource.includes('navigator.sendBeacon')).toBe(true)
    expect(mainSource.includes('installPerformanceEvidenceReporting({')).toBe(true)
    expect(apiClientSource.includes("import { reportApiPerformanceEvidence } from '@/lib/performanceEvidenceReporter'")).toBe(true)
    expect(apiClientSource.includes("cacheStatus: 'network'")).toBe(true)
    expect(serverIndexSource.includes("import performanceReportsRouter from './routes/performance-reports.js'")).toBe(true)
    expect(serverIndexSource.includes("app.use('/api/performance-reports', performanceReportsRouter)")).toBe(true)
    expect(performanceRouteSource.includes('Client performance evidence reported')).toBe(true)
    expect(performanceRouteSource.includes('Client performance threshold exceeded')).toBe(true)
    expect(serverLoggerSource.includes('Slow API request detected')).toBe(true)
  })

  it('keeps the v1.2.5 online evidence summary ready for precise performance governance', () => {
    const performanceRouteSource = readWorkspaceSource('../server/src/routes/performance-reports.ts')

    expect(performanceRouteSource.includes("router.get('/summary'")).toBe(true)
    expect(performanceRouteSource.includes('buildPerformanceEvidenceSummary')).toBe(true)
    expect(performanceRouteSource.includes('topSlowApis')).toBe(true)
    expect(performanceRouteSource.includes('topSlowRoutes')).toBe(true)
    expect(performanceRouteSource.includes('topWebVitals')).toBe(true)
    expect(performanceRouteSource.includes('topLongTasks')).toBe(true)
    expect(performanceRouteSource.includes('insufficient_data')).toBe(true)
    expect(performanceRouteSource.includes('不做无证据的大范围改造')).toBe(true)
  })

  it('keeps the v1.2.6 online performance evidence check executable after deployment', () => {
    const packageSource = readWorkspaceSource('../package.json')
    const deploySource = readWorkspaceSource('../scripts/deploy-lighthouse-server.sh')
    const checkSource = readWorkspaceSource('../scripts/check-performance-evidence-summary.mjs')

    expect(packageSource.includes('"verify:performance-evidence"')).toBe(true)
    expect(packageSource.includes('"verify:performance-evidence:unit"')).toBe(true)
    expect(deploySource.includes('PERFORMANCE_SUMMARY_URL')).toBe(true)
    expect(deploySource.includes('/api/performance-reports/summary')).toBe(true)
    expect(checkSource.includes('evaluateSummary')).toBe(true)
    expect(checkSource.includes('Performance release gate is fail.')).toBe(true)
    expect(checkSource.includes('Insufficient data is configured as failure.')).toBe(true)
  })

  it('routes gantt through lightweight project init instead of the full shared-slice bootstrap', () => {
    const source = readWorkspaceSource('src/components/layout/ProjectLayout.tsx')
    const initSource = readWorkspaceSource('src/hooks/useProjectInit.ts')

    expect(source.includes("const isGanttRoute = location.pathname.endsWith('/gantt')")).toBe(true)
    expect(source.includes("mode: isMaterialsRoute ? 'materials' : isGanttRoute ? 'gantt' : 'full'")).toBe(true)
    expect(initSource.includes("void prefetchProjectTasks(id, { signal: controller.signal })")).toBe(true)
  })

  it('keeps token-backed routes renderable while auth verification finishes in the background', () => {
    const source = normalizeSource(readWorkspaceSource('src/App.tsx'))

    expect(source.includes('const hasStoredToken = Boolean(getAuthToken())')).toBe(true)
    expect(source.includes("const initialGanttModulePromise = initialHash.includes('/gantt')")).toBe(true)
    expect(source.includes("const GanttView = lazy(() => initialGanttModulePromise ?? import('@/pages/GanttView'))")).toBe(true)
    expect(source.includes('if (authLoading) {\n      if (hasStoredToken) {\n        setLoading(false)\n      }\n      return')).toBe(true)
    expect(source.includes('if (loading || (authLoading && !hasStoredToken)) {')).toBe(true)
  })

  it('deduplicates project access probes across concurrent subscribers', () => {
    const source = readWorkspaceSource('src/hooks/usePermissions.ts')

    expect(source.includes('const projectAccessInflight = new Map<string, Promise<ProjectAccessSummary>>()')).toBe(true)
    expect(source.includes('const inflight = projectAccessInflight.get(cacheKey)')).toBe(true)
    expect(source.includes('projectAccessInflight.set(cacheKey, request)')).toBe(true)
  })

  it('defers gantt summary side requests until after first paint and hydrates participant units on demand', () => {
    const source = readWorkspaceSource('src/pages/GanttView.tsx')

    expect(source.includes("const tasksPromise = loadTasks({ signal: controller.signal })")).toBe(true)
    expect(source.includes("await prefetchProjectTasks(id, { signal: options?.signal, force: options?.force })")).toBe(true)
    expect(source.includes("void Promise.allSettled([\\n      loadParticipantUnits({ signal: controller.signal }),\\n      loadProjectSummary({ signal: controller.signal }),\\n    ])")).toBe(false)
    expect(source.includes("void loadProjectSummary({ signal: controller.signal })")).toBe(true)
    expect(source.includes("void loadDataQualitySummary({ signal: controller.signal })")).toBe(true)
    expect(source.includes('if (!dialogOpen && !participantUnitsOpen) {')).toBe(true)
    expect(source.includes('if (participantUnitsLoaded || participantUnitsLoading) {')).toBe(true)
  })

  it('loads gantt members and baseline versions only when a focused workflow needs them', () => {
    const source = readWorkspaceSource('src/pages/GanttView.tsx')

    expect(source.includes("if (!dialogOpen && !conditionDialogOpen && !forceSatisfyDialogOpen && !selectedTask?.id) {")).toBe(true)
    expect(source.includes("Boolean(selectedTask?.id) || (viewMode === 'timeline' && timelineCompareMode === 'baseline')")).toBe(true)
  })

  it('declares baseline option lookups before search-param sync consumes them', () => {
    const source = readWorkspaceSource('src/pages/GanttView.tsx')

    expect(source.includes('const validBaselineOptionIds = useMemo(')).toBe(true)
    expect(source.indexOf('const validBaselineOptionIds = useMemo('))
      .toBeLessThan(source.indexOf("const nextBaselineVersionId = searchParams.get('baselineVersionId')"))
  })

  it('progressively renders gantt rows so large lists stay interactive on first paint', () => {
    const source = readWorkspaceSource('src/pages/GanttViewRows.tsx')

    expect(source.includes('const INITIAL_RENDERED_ROW_COUNT = 48')).toBe(true)
    expect(source.includes('const RENDER_CHUNK_SIZE = 160')).toBe(true)
    expect(source.includes('const [visibleCount, setVisibleCount] = useState(() =>')).toBe(true)
    expect(source.includes('const visibleRows = props.filteredFlatList.slice(0, visibleCount)')).toBe(true)
    expect(source.includes('startTransition(() => {')).toBe(true)
    expect(source.includes('data-testid="gantt-progressive-render-hint"')).toBe(true)
  })

  it('promotes newly generated monthly drafts locally before the background reload finishes', () => {
    const source = readWorkspaceSource('src/pages/planning/MonthlyPlanPage.tsx')

    expect(source.includes('setPlanVersions(sortMonthlyPlanVersions([')).toBe(true)
    expect(source.includes('setActivePlan(created)')).toBe(true)
    expect(source.includes("setDraftStatus('editing')")).toBe(true)
    expect(source.includes('void loadMonthlyContext({ preferredMonth: created.month, preferredId: created.id, preserveNotice: true })')).toBe(true)
    expect(source.indexOf('setActivePlan(created)')).toBeLessThan(
      source.indexOf('void loadMonthlyContext({ preferredMonth: created.month, preferredId: created.id, preserveNotice: true })'),
    )
  })
})
