import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import {
  useSetConditions,
  useSetObstacles,
  useSetTasks,
  useStore,
} from '@/hooks/useStore'
import { getApiErrorMessage, isAbortError } from '@/lib/apiClient'
import { DashboardApiService, type ProjectSummary } from '@/services/dashboardApi'
import { DataQualityApiService, type DataQualityProjectSummary } from '@/services/dataQualityApi'
import type { GanttTimelineCompareMode } from './TaskTimelineView'
import type { GanttViewMode } from './ganttViewUtils'
import {
  toStoreConditionRecords,
  toStoreObstacleRecords,
} from './ganttViewUtils'
import {
  listBaselineVersionOptions,
  listGanttTasks,
  type BaselineVersionOption,
} from './ganttProjectDataApi'
import { listProjectTaskConditions } from './taskConditionApi'
import { listProjectTaskObstacles } from './taskObstacleApi'

const GANTT_VISIBLE_REFRESH_INTERVAL_MS = 120_000
const GANTT_RESUME_REFRESH_DELAY_MS = 2_000
const GANTT_PROJECT_SUMMARY_DELAY_MS = 1_200
const GANTT_DATA_QUALITY_SUMMARY_DELAY_MS = 8_000
const GANTT_BASELINE_OPTIONS_DELAY_MS = 5_000

type RefreshGanttProjectDataOptions = {
  signal?: AbortSignal
  includeSummary?: boolean
}

type UseGanttProjectDataInput = {
  hasCachedProjectTasks?: boolean
  projectId?: string
  viewMode: GanttViewMode
  timelineCompareMode: GanttTimelineCompareMode
  timelineBaselineVersionId: string
  dataQualityRefreshKey: string
}

function getReadableErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isExpectedBackendReadUnavailable(error: unknown): boolean {
  const message = getReadableErrorMessage(error)
  return message.includes('任务列表加载超时') || message.includes('timed out after')
}

export function useGanttProjectData({
  hasCachedProjectTasks = false,
  projectId,
  viewMode,
  timelineCompareMode,
  timelineBaselineVersionId,
  dataQualityRefreshKey,
}: UseGanttProjectDataInput) {
  const lastRealtimeEvent = useStore((state) => state.lastRealtimeEvent)
  const setTasks = useSetTasks()
  const setProjectConditions = useSetConditions()
  const setProjectObstacles = useSetObstacles()
  const lastHandledRealtimeEventKeyRef = useRef<string | null>(null)
  const loadedProjectIdRef = useRef<string | null>(null)
  const hasLoadedTasksRef = useRef(false)

  const [loading, setLoading] = useState(() => !hasCachedProjectTasks)
  const [projectSummary, setProjectSummary] = useState<ProjectSummary | null>(null)
  const [dataQualitySummary, setDataQualitySummary] = useState<DataQualityProjectSummary | null>(null)
  const [pageLoadError, setPageLoadError] = useState<string | null>(null)
  const [refreshingTaskList, setRefreshingTaskList] = useState(false)
  const [baselineOptions, setBaselineOptions] = useState<BaselineVersionOption[]>([])
  const [baselineOptionsLoaded, setBaselineOptionsLoaded] = useState(false)
  const [baselineLoading, setBaselineLoading] = useState(false)

  const loadBaselineOptions = useCallback(async (requestOptions?: { signal?: AbortSignal }) => {
    if (!projectId) {
      setBaselineOptions([])
      setBaselineOptionsLoaded(false)
      setBaselineLoading(false)
      return
    }

    setBaselineLoading(true)
    setBaselineOptionsLoaded(false)
    try {
      const nextOptions = await listBaselineVersionOptions(projectId, requestOptions?.signal)
      if (!requestOptions?.signal?.aborted) {
        setBaselineOptions(nextOptions)
        setBaselineOptionsLoaded(true)
      }
    } catch (error) {
      if (!isAbortError(error)) {
        setBaselineOptions([])
        setBaselineOptionsLoaded(false)
      }
    } finally {
      if (!requestOptions?.signal?.aborted) {
        setBaselineLoading(false)
      }
    }
  }, [projectId])

  const loadTasks = useCallback(async (options?: { signal?: AbortSignal; force?: boolean; allowStaleOnError?: boolean }) => {
    if (!projectId) {
      return
    }

    try {
      const data = await listGanttTasks({
        projectId,
        viewMode,
        timelineCompareMode,
        timelineBaselineVersionId,
        signal: options?.signal,
        force: options?.force,
      })
      if (!options?.signal?.aborted) {
        setTasks(data)
        setPageLoadError(null)
      }
    } catch (error) {
      if (!isAbortError(error)) {
        const message = getApiErrorMessage(error, '甘特任务加载失败，请刷新后重试。')
        if (isExpectedBackendReadUnavailable(error)) {
          console.warn(`[GanttView] task list unavailable: ${message}`)
        } else {
          console.error('加载甘特任务失败:', error)
          toast({ title: '加载任务失败，请重试', variant: 'destructive' })
        }
        if (!options?.allowStaleOnError) {
          setPageLoadError(message)
        }
      }
    }
  }, [projectId, setTasks, timelineBaselineVersionId, timelineCompareMode, viewMode])

  const loadProjectConditions = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!projectId) {
      setProjectConditions([])
      return
    }

    try {
      const data = await listProjectTaskConditions(projectId, options?.signal)
      if (!options?.signal?.aborted) {
        setProjectConditions(toStoreConditionRecords(Array.isArray(data) ? data : []))
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('加载甘特开工条件失败:', error)
        toast({ title: '加载开工条件失败，请重试', variant: 'destructive' })
      }
    }
  }, [projectId, setProjectConditions])

  const loadProjectObstacles = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!projectId) {
      setProjectObstacles([])
      return
    }

    try {
      const data = await listProjectTaskObstacles(projectId, options?.signal)
      if (!options?.signal?.aborted) {
        setProjectObstacles(toStoreObstacleRecords(Array.isArray(data) ? data : []))
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('加载甘特阻碍失败:', error)
        toast({ title: '加载阻碍失败，请重试', variant: 'destructive' })
      }
    }
  }, [projectId, setProjectObstacles])

  const loadProjectSummary = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!projectId) {
      setProjectSummary(null)
      return
    }

    try {
      const nextSummary = await DashboardApiService.getProjectSummary(projectId, { signal: options?.signal })
      if (!options?.signal?.aborted) {
        setProjectSummary(nextSummary)
      }
    } catch (error) {
      if (!isAbortError(error)) {
        const message = getApiErrorMessage(error, '项目摘要加载失败，请刷新后重试。')
        console.warn(`[GanttView] project summary unavailable: ${message}`)
        setProjectSummary(null)
      }
    }
  }, [projectId])

  const loadDataQualitySummary = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!projectId) {
      setDataQualitySummary(null)
      return
    }

    try {
      const summary = await DataQualityApiService.getProjectSummary(projectId, undefined, { signal: options?.signal })
      if (!options?.signal?.aborted) {
        setDataQualitySummary(summary)
      }
    } catch (error) {
      if (!isAbortError(error)) {
        const message = getApiErrorMessage(error, '数据质量摘要加载失败，请刷新后重试。')
        console.warn(`[GanttView] data quality summary unavailable: ${message}`)
        setDataQualitySummary(null)
      }
    }
  }, [projectId])

  const refreshGanttProjectData = useCallback(async (options?: RefreshGanttProjectDataOptions) => {
    const requests: Array<Promise<unknown>> = [
      loadTasks({ signal: options?.signal, force: true, allowStaleOnError: true }),
      loadProjectConditions({ signal: options?.signal }),
      loadProjectObstacles({ signal: options?.signal }),
    ]

    if (options?.includeSummary) {
      requests.push(
        loadProjectSummary({ signal: options.signal }),
        loadDataQualitySummary({ signal: options.signal }),
      )
    }

    await Promise.allSettled(requests)
  }, [
    loadDataQualitySummary,
    loadProjectConditions,
    loadProjectObstacles,
    loadProjectSummary,
    loadTasks,
  ])

  const handleLightRefresh = useCallback(async () => {
    if (refreshingTaskList) return

    setRefreshingTaskList(true)
    try {
      await refreshGanttProjectData({ includeSummary: true })
      toast({ title: '任务列表已刷新' })
    } finally {
      setRefreshingTaskList(false)
    }
  }, [refreshGanttProjectData, refreshingTaskList])

  useEffect(() => {
    if (!projectId) {
      loadedProjectIdRef.current = null
      hasLoadedTasksRef.current = false
      setProjectSummary(null)
      setDataQualitySummary(null)
      setLoading(false)
      setRefreshingTaskList(false)
      return
    }

    const isInitialProjectLoad = loadedProjectIdRef.current !== projectId || !hasLoadedTasksRef.current
    const canRenderCachedTasks = isInitialProjectLoad && hasCachedProjectTasks
    if (isInitialProjectLoad && !canRenderCachedTasks) {
      setLoading(true)
      setProjectSummary(null)
    } else {
      setLoading(false)
      setRefreshingTaskList(true)
    }
    const controller = new AbortController()
    const tasksPromise = loadTasks({ signal: controller.signal, allowStaleOnError: canRenderCachedTasks })
    void tasksPromise.finally(() => {
      if (!controller.signal.aborted) {
        loadedProjectIdRef.current = projectId
        hasLoadedTasksRef.current = true
        setLoading(false)
        setRefreshingTaskList(false)
      }
    })

    return () => {
      controller.abort()
    }
  }, [hasCachedProjectTasks, loadTasks, projectId])

  useEffect(() => {
    if (!projectId) {
      setProjectSummary(null)
      return
    }
    if (loading || pageLoadError) {
      if (pageLoadError) setProjectSummary(null)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void loadProjectSummary({ signal: controller.signal })
    }, GANTT_PROJECT_SUMMARY_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [loadProjectSummary, loading, pageLoadError, projectId])

  useEffect(() => {
    if (!projectId) {
      setDataQualitySummary(null)
      return
    }
    if (loading || pageLoadError) {
      if (pageLoadError) setDataQualitySummary(null)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void loadDataQualitySummary({ signal: controller.signal })
    }, GANTT_DATA_QUALITY_SUMMARY_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [dataQualityRefreshKey, loadDataQualitySummary, loading, pageLoadError, projectId])

  useEffect(() => {
    if (!projectId || !lastRealtimeEvent) {
      return
    }

    if (lastRealtimeEvent.channel !== 'project' || lastRealtimeEvent.projectId !== projectId) {
      return
    }

    const entityType = String(lastRealtimeEvent.entityType ?? '').trim()
    if (!['task', 'task_list', 'task_condition', 'task_obstacle', 'milestone'].includes(entityType)) {
      return
    }

    const eventKey = [
      lastRealtimeEvent.timestamp,
      lastRealtimeEvent.type,
      lastRealtimeEvent.projectId ?? '',
      entityType,
      lastRealtimeEvent.entityId ?? '',
    ].join(':')
    if (lastHandledRealtimeEventKeyRef.current === eventKey) {
      return
    }
    lastHandledRealtimeEventKeyRef.current = eventKey

    const controller = new AbortController()
    void refreshGanttProjectData({ signal: controller.signal, includeSummary: true })

    return () => {
      controller.abort()
    }
  }, [
    lastRealtimeEvent,
    projectId,
    refreshGanttProjectData,
  ])

  useEffect(() => {
    if (!projectId || typeof window === 'undefined') {
      return
    }

    let activeController: AbortController | null = null
    let resumeRefreshTimer: number | null = null
    let resumeHoldUntil = 0
    const refreshVisiblePage = () => {
      if (document.visibilityState === 'hidden') {
        return
      }
      if (Date.now() < resumeHoldUntil) {
        return
      }

      activeController?.abort()
      activeController = new AbortController()
      void refreshGanttProjectData({ signal: activeController.signal })
    }

    const clearResumeRefreshTimer = () => {
      if (resumeRefreshTimer !== null) {
        window.clearTimeout(resumeRefreshTimer)
        resumeRefreshTimer = null
      }
    }

    const handleVisibilityChange = () => {
      clearResumeRefreshTimer()
      if (document.visibilityState === 'hidden') {
        activeController?.abort()
        activeController = null
        return
      }

      resumeHoldUntil = Date.now() + GANTT_RESUME_REFRESH_DELAY_MS
      resumeRefreshTimer = window.setTimeout(() => {
        resumeHoldUntil = 0
        refreshVisiblePage()
      }, GANTT_RESUME_REFRESH_DELAY_MS)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    const timer = window.setInterval(refreshVisiblePage, GANTT_VISIBLE_REFRESH_INTERVAL_MS)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearResumeRefreshTimer()
      window.clearInterval(timer)
      activeController?.abort()
    }
  }, [projectId, refreshGanttProjectData])

  useEffect(() => {
    setBaselineOptions([])
    setBaselineOptionsLoaded(false)
    setBaselineLoading(false)
  }, [projectId])

  useEffect(() => {
    if (!projectId) {
      setBaselineOptions([])
      setBaselineOptionsLoaded(false)
      setBaselineLoading(false)
      return
    }
    if (loading) {
      return
    }
    const controller = new AbortController()
    const baselineDelayMs = viewMode === 'gantt' && timelineCompareMode === 'baseline' ? 0 : GANTT_BASELINE_OPTIONS_DELAY_MS
    const timer = window.setTimeout(() => {
      void loadBaselineOptions({ signal: controller.signal })
    }, baselineDelayMs)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [loadBaselineOptions, loading, projectId, timelineCompareMode, viewMode])

  return {
    baselineLoading,
    baselineOptions,
    baselineOptionsLoaded,
    dataQualitySummary,
    handleLightRefresh,
    loadTasks,
    loading,
    pageLoadError,
    projectSummary,
    refreshingTaskList,
    refreshGanttProjectData,
  }
}
