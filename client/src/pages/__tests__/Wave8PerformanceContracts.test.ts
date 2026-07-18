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
      return normalizeSource(readFileSync(candidate, 'utf8'))
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
    expect(source.includes("status === 'project_ready' || status === 'loaded'")).toBe(true)
    expect(source.includes("isHydrated: status === 'loaded'")).toBe(true)
  })

  it('uses the project bootstrap endpoint as the only full-project hydration path', () => {
    const source = readWorkspaceSource('src/hooks/useProjectInit.ts')

    expect(source.includes("fetchProjectBootstrap(id, controller.signal)")).toBe(true)
    expect(source.includes('`/api/projects/${id}/bootstrap?changeLogLimit=100`')).toBe(true)
    expect(source.includes('bootstrap failed, falling back to legacy fan-out')).toBe(false)
    expect(source.includes('Promise.allSettled([')).toBe(false)
    expect(source.includes('`/api/task-conditions?projectId=${encodeURIComponent(id)}`')).toBe(false)
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

  it('routes task list pages through lightweight project init instead of the full shared-slice bootstrap', () => {
    const source = readWorkspaceSource('src/components/layout/ProjectLayout.tsx')
    const initSource = readWorkspaceSource('src/hooks/useProjectInit.ts')

    expect(source.includes("const isTaskListRoute = location.pathname.endsWith('/gantt')")).toBe(true)
    expect(source.includes("const isDashboardRoute = location.pathname.endsWith('/dashboard')")).toBe(true)
    expect(source.includes('const isModelingWorkbenchRoute =')).toBe(true)
    expect(source.includes("mode: isDashboardRoute || isModelingWorkbenchRoute ? 'project_shell' : isMaterialsRoute ? 'materials' : isTaskListRoute ? 'gantt' : 'full'")).toBe(true)
    expect(initSource.includes('getRestorableProjectTasks(id)')).toBe(false)
    expect(initSource.includes('prefetchProjectTasks(id, { signal: controller.signal, includeAcceptanceImpact: false })')).toBe(true)
    expect(initSource.includes('.then((tasks) =>')).toBe(false)
  })

  it('keeps token-backed routes renderable while auth verification finishes in the background', () => {
    const source = normalizeSource(readWorkspaceSource('src/App.tsx'))

    expect(source.includes('const hasStoredToken = Boolean(getAuthToken())')).toBe(true)
    expect(source.includes('const isInitialModelingWorkbenchRoute =')).toBe(true)
    expect(source.includes("['generate', 'adjust'].includes(new URLSearchParams(initialRouteSearch).get('modelingWorkbench') ?? '')")).toBe(true)
    expect(source.includes("const isInitialTaskListRoute = /^\\/projects\\/[^/]+\\/gantt$/.test(initialRoutePath) && !isInitialModelingWorkbenchRoute")).toBe(true)
    expect(source.includes("const GanttView = lazy(() => initialGanttModulePromise ?? import('@/pages/GanttView'))")).toBe(true)
    expect(source.includes('if (authLoading) {\n      if (hasStoredToken) {\n        setLoading(false)\n      }\n      return')).toBe(true)
    expect(source.includes('if (loading || (authLoading && !hasStoredToken)) {')).toBe(true)
  })

  it('keeps the modeling workbench out of the full gantt bundle and project/task prefetch path', () => {
    const appSource = readWorkspaceSource('src/App.tsx')
    const layoutSource = readWorkspaceSource('src/components/layout/ProjectLayout.tsx')
    const initSource = readWorkspaceSource('src/hooks/useProjectInit.ts')
    const routeSource = readWorkspaceSource('src/pages/GanttView/PlanningModelingWorkbenchRoute.tsx')
    const projectInfoSource = readWorkspaceSource('src/pages/ProjectInfoModule/ProjectInfoModule.tsx')
    const step1Source = readWorkspaceSource('src/components/project/wizard/Step1ProjectIdentityTime.tsx')

    expect(appSource.includes("const PlanningModelingWorkbenchRoute = lazy(() => import('@/pages/GanttView/PlanningModelingWorkbenchRoute'))")).toBe(true)
    expect(appSource.includes('function GanttRouteElement()')).toBe(true)
    expect(appSource.includes("return withRouteBoundary(<PlanningModelingWorkbenchRoute />)")).toBe(true)
    expect(layoutSource.includes('const isModelingWorkbenchRoute =')).toBe(true)
    expect(layoutSource.includes("mode: isDashboardRoute || isModelingWorkbenchRoute ? 'project_shell'")).toBe(true)
    expect(initSource.includes("mode?: 'full' | 'materials' | 'gantt' | 'project_shell'")).toBe(true)
    expect(initSource.includes("if (mode === 'project_shell')")).toBe(true)
    expect(initSource.indexOf("if (mode === 'project_shell')")).toBeLessThan(initSource.indexOf('fetchProjectBootstrap(id, controller.signal)'))
    expect(initSource.indexOf("if (mode === 'project_shell')")).toBeLessThan(initSource.indexOf('fetchProject(id, controller.signal)'))
    expect(initSource.indexOf("if (mode === 'project_shell')")).toBeLessThan(initSource.indexOf('prefetchProjectTasks(id, { signal: controller.signal, includeAcceptanceImpact: false })'))
    expect(routeSource.includes("import('@/pages/GanttView')")).toBe(false)
    expect(routeSource.includes('PlanningModelingWorkbenchDialog')).toBe(true)
    expect(projectInfoSource.includes("const LazyStep3EngineeringScopeScale = lazy(() => import('@/components/project/wizard/Step3EngineeringScopeScale')")).toBe(true)
    expect(projectInfoSource.includes("{!embedded ? <WizardOnboardingTour /> : null}")).toBe(true)
    expect(appSource.includes('!isModelingWorkbenchRoute ? <OnboardingGuide /> : null')).toBe(true)
    expect(appSource.includes('!isModelingWorkbenchRoute ? <Header')).toBe(true)
    expect(step1Source.includes('import { memo }')).toBe(true)
    expect(step1Source.includes('export const Step1ProjectIdentityTime = memo')).toBe(true)
  })

  it('deduplicates project access probes across concurrent subscribers', () => {
    const source = readWorkspaceSource('src/hooks/usePermissions.ts')

    expect(source.includes('const projectAccessInflight = new Map<string, Promise<ProjectAccessSummary>>()')).toBe(true)
    expect(source.includes('const inflight = projectAccessInflight.get(cacheKey)')).toBe(true)
    expect(source.includes('projectAccessInflight.set(cacheKey, request)')).toBe(true)
  })

  it('defers gantt summary side requests until after first paint and hydrates participant units on demand', () => {
    const projectDataSource = readWorkspaceSource('src/pages/GanttView/useGanttProjectData.ts')
    const projectDataApiSource = readWorkspaceSource('src/pages/GanttView/ganttProjectDataApi.ts')
    const referenceDataSource = readWorkspaceSource('src/pages/GanttView/useGanttReferenceData.ts')
    const initSource = readWorkspaceSource('src/hooks/useProjectInit.ts')

    expect(projectDataSource.includes('hasCachedProjectTasks?: boolean')).toBe(true)
    expect(projectDataSource.includes('const [loading, setLoading] = useState(() => !hasCachedProjectTasks)')).toBe(true)
    expect(projectDataSource.includes('const tasksPromise = loadTasks({ signal: controller.signal, allowStaleOnError: canRenderCachedTasks })')).toBe(true)
    expect(initSource.includes("prefetchProjectTasks(id, { signal: controller.signal, includeAcceptanceImpact: false })")).toBe(true)
    expect(projectDataApiSource.includes("return prefetchProjectTasks(projectId, { signal, force, includeAcceptanceImpact: false }) as Promise<Task[]>")).toBe(true)
    expect(projectDataApiSource.includes("new URLSearchParams({ projectId, surface: 'task_list' })")).toBe(true)
    expect(projectDataSource.includes("void Promise.allSettled([\\n      loadParticipantUnits({ signal: controller.signal }),\\n      loadProjectSummary({ signal: controller.signal }),\\n    ])")).toBe(false)
    expect(projectDataSource.includes("void loadProjectSummary({ signal: controller.signal })")).toBe(true)
    expect(projectDataSource.includes("void loadDataQualitySummary({ signal: controller.signal })")).toBe(true)
    expect(referenceDataSource.includes('if (!dialogOpen && !participantUnitsOpen) {')).toBe(true)
    expect(referenceDataSource.includes('if (participantUnitsLoaded || participantUnitsLoading) {')).toBe(true)
  })

  it('loads gantt members only for focused workflows and baseline options after first paint', () => {
    const projectDataSource = normalizeSource(readWorkspaceSource('src/pages/GanttView/useGanttProjectData.ts'))
    const referenceDataSource = readWorkspaceSource('src/pages/GanttView/useGanttReferenceData.ts')

    expect(referenceDataSource.includes('if (!dialogOpen && !conditionDialogOpen) {')).toBe(true)
    expect(projectDataSource.includes('if (loading) {\n      return\n    }')).toBe(true)
    expect(projectDataSource.includes('void loadBaselineOptions({ signal: controller.signal })')).toBe(true)
    expect(projectDataSource.includes("viewMode === 'timeline' && timelineCompareMode === 'baseline'")).toBe(false)
  })

  it('keeps gantt background resume refresh from blocking the first visible paint', () => {
    const source = readWorkspaceSource('src/pages/GanttView/useGanttProjectData.ts')
    const prefetchSource = readWorkspaceSource('src/lib/projectTaskPrefetch.ts')

    expect(prefetchSource.includes('PROJECT_TASK_RESTORE_TTL_MS')).toBe(false)
    expect(prefetchSource.includes('sessionStorage')).toBe(false)
    expect(source.includes('const GANTT_VISIBLE_REFRESH_INTERVAL_MS = 120_000')).toBe(true)
    expect(source.includes('const GANTT_RESUME_REFRESH_DELAY_MS = 2_000')).toBe(true)
    expect(source.includes("document.addEventListener('visibilitychange', handleVisibilityChange)")).toBe(true)
    expect(source.includes('activeController?.abort()')).toBe(true)
    expect(source.includes('window.setInterval(refreshVisiblePage, GANTT_VISIBLE_REFRESH_INTERVAL_MS)')).toBe(true)
  })

  it('keeps baseline option reconciliation isolated from search-param sync', () => {
    const source = readWorkspaceSource('src/pages/GanttView.tsx')
    const preferenceSource = readWorkspaceSource('src/pages/GanttView/useGanttViewPreferences.ts')

    expect(preferenceSource.includes('export function useGanttTimelineBaselinePreference({')).toBe(true)
    expect(preferenceSource.includes('const nextBaselineVersionId = getNextTimelineBaselineVersionId({')).toBe(true)
    expect(source.indexOf('baselineOptions,')).toBeLessThan(source.indexOf('useGanttTimelineBaselinePreference({'))
  })

  it('progressively renders task list rows without forcing the heavy gantt view on first paint', () => {
    const source = readWorkspaceSource('src/pages/GanttViewRows.tsx')
    const adapterSource = readWorkspaceSource('src/pages/GanttView/GanttTaskPlanningTreeAdapter.tsx')
    const pageSource = readWorkspaceSource('src/pages/GanttView.tsx')
    const tableSource = readWorkspaceSource('src/components/planning/PlanningTreeView.tsx')
    const preferenceSource = readWorkspaceSource('src/pages/GanttView/useGanttViewPreferences.ts')

    expect(source.includes('const INITIAL_RENDERED_ROW_COUNT = 48')).toBe(true)
    expect(source.includes('const RENDER_CHUNK_SIZE = 80')).toBe(true)
    expect(source.includes("const shouldProgressivelyRenderRows = props.viewMode !== 'gantt'")).toBe(true)
    expect(source.includes('const [visibleCount, setVisibleCount] = useState(() =>')).toBe(true)
    expect(source.includes('orderedRows.slice(0, visibleCount)')).toBe(true)
    expect(source.includes('const handleLoadMoreRows = useCallback(() => {')).toBe(true)
    expect(source.includes('onLoadMoreRows={hiddenRowCount > 0 ? handleLoadMoreRows : undefined}')).toBe(true)
    expect(source.includes('const getAvailablePredecessors = shouldRenderPredecessorEditor')).toBe(true)
    expect(source.includes('getAvailableTasks={getAvailablePredecessors}')).toBe(true)
    expect(tableSource.includes('startTransition(() => {')).toBe(true)
    expect(pageSource.includes('<DndContext')).toBe(false)
    expect(pageSource.includes('<SortableContext')).toBe(false)
    expect(preferenceSource.includes("if (storedMode === 'gantt')")).toBe(true)
    expect(preferenceSource.includes('safeStorageRemove(localStorage, storageKey)')).toBe(true)
    expect(adapterSource.includes('defaultView="list"')).toBe(true)
    expect(adapterSource.includes('data-testid="gantt-progressive-render-hint"')).toBe(true)
    expect(adapterSource.includes('data-testid="gantt-load-more-rows"')).toBe(true)
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
