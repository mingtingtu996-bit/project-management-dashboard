import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

import { safeStorageGet, safeStorageRemove } from '@/lib/browserStorage'
import type {
  GanttTimelineCompareMode,
  GanttTimelineScale,
} from './TaskTimelineView'
import {
  buildGanttViewSearchParams,
  getNextTimelineBaselineVersionId,
  normalizeGanttViewMode,
  normalizeTimelineCompareMode,
  normalizeTimelineScale,
  persistGanttViewPreferences,
  type GanttViewMode,
} from './ganttViewUtils'

type GanttBaselineOptionLike = {
  id: string
}

type GanttLocationLike = {
  pathname: string
  search: string
}

type GanttNavigateLike = (
  to: {
    pathname: string
    search: string
  },
  options: {
    replace: boolean
  },
) => void

type UseGanttViewPreferencesInput = {
  location: GanttLocationLike
  navigate: GanttNavigateLike
  projectId?: string | null
  searchParams: URLSearchParams
}

function getInitialTaskListViewMode(locationSearch: string, projectId?: string | null): GanttViewMode {
  const queryMode = normalizeGanttViewMode(new URLSearchParams(locationSearch).get('view'))
  if (queryMode) return queryMode

  const storageKey = `gantt_view_mode_${projectId}`
  const storedMode = normalizeGanttViewMode(safeStorageGet(localStorage, storageKey))
  if (storedMode === 'gantt') {
    safeStorageRemove(localStorage, storageKey)
  }
  return storedMode && storedMode !== 'gantt' ? storedMode : 'list'
}

export function useGanttViewPreferences({
  location,
  navigate,
  projectId,
  searchParams,
}: UseGanttViewPreferencesInput) {
  const [viewMode, setViewMode] = useState<GanttViewMode>(() => {
    return getInitialTaskListViewMode(location.search, projectId)
  })
  const [timelineScale, setTimelineScale] = useState<GanttTimelineScale>(() => {
    const queryScale = normalizeTimelineScale(new URLSearchParams(location.search).get('scale'))
    if (queryScale) return queryScale
    return normalizeTimelineScale(safeStorageGet(localStorage, `gantt_timeline_scale_${projectId}`)) || 'week'
  })
  const [timelineCompareMode, setTimelineCompareMode] = useState<GanttTimelineCompareMode>(() => {
    const queryMode = normalizeTimelineCompareMode(new URLSearchParams(location.search).get('compare'))
    if (queryMode) return queryMode
    return normalizeTimelineCompareMode(safeStorageGet(localStorage, `gantt_timeline_compare_${projectId}`)) || 'plan'
  })
  const [timelineBaselineVersionId, setTimelineBaselineVersionId] = useState<string>(() => (
    new URLSearchParams(location.search).get('baselineVersionId')
    || ''
  ))

  useEffect(() => {
    const nextViewMode = normalizeGanttViewMode(searchParams.get('view'))
    if (nextViewMode) {
      setViewMode((current) => (nextViewMode === current ? current : nextViewMode))
    }

    const nextScale = normalizeTimelineScale(searchParams.get('scale'))
    if (nextScale) {
      setTimelineScale((current) => (nextScale === current ? current : nextScale))
    }

    const nextCompareMode = normalizeTimelineCompareMode(searchParams.get('compare'))
    if (nextCompareMode) {
      setTimelineCompareMode((current) => (nextCompareMode === current ? current : nextCompareMode))
    }

    const nextBaselineVersionId = searchParams.get('baselineVersionId')
    if (nextBaselineVersionId) {
      setTimelineBaselineVersionId((current) => (nextBaselineVersionId === current ? current : nextBaselineVersionId))
    }
  }, [searchParams])

  useEffect(() => {
    if (!projectId) return
    safeStorageRemove(localStorage, `gantt_timeline_baseline_${projectId}`)

    const preferences = {
      viewMode,
      timelineScale,
      timelineCompareMode,
      timelineBaselineVersionId,
    }
    persistGanttViewPreferences(localStorage, projectId, preferences)
    const nextSearch = buildGanttViewSearchParams(location.search, preferences)
    const currentSearch = location.search.startsWith('?') ? location.search.slice(1) : location.search
    if (nextSearch !== currentSearch) {
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : '',
        },
        { replace: true },
      )
    }
  }, [
    projectId,
    location.pathname,
    location.search,
    navigate,
    timelineBaselineVersionId,
    timelineCompareMode,
    timelineScale,
    viewMode,
  ])

  return {
    setTimelineBaselineVersionId,
    setTimelineCompareMode,
    setTimelineScale,
    setViewMode,
    timelineBaselineVersionId,
    timelineCompareMode,
    timelineScale,
    viewMode,
  }
}

type UseGanttTimelineBaselinePreferenceInput = {
  baselineOptions: GanttBaselineOptionLike[]
  setTimelineBaselineVersionId: Dispatch<SetStateAction<string>>
  timelineBaselineVersionId: string
  timelineCompareMode: GanttTimelineCompareMode
}

export function useGanttTimelineBaselinePreference({
  baselineOptions,
  setTimelineBaselineVersionId,
  timelineBaselineVersionId,
  timelineCompareMode,
}: UseGanttTimelineBaselinePreferenceInput) {
  useEffect(() => {
    const nextBaselineVersionId = getNextTimelineBaselineVersionId({
      baselineOptions,
      timelineCompareMode,
      timelineBaselineVersionId,
    })
    if (nextBaselineVersionId !== null) {
      setTimelineBaselineVersionId(nextBaselineVersionId)
    }
  }, [baselineOptions, setTimelineBaselineVersionId, timelineBaselineVersionId, timelineCompareMode])
}
