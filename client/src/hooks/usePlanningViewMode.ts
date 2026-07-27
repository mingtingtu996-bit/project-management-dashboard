import { useCallback, useEffect, useMemo, useState } from 'react'

import { safeStorageGet, safeStorageSet } from '@/lib/browserStorage'
import type { PlanningFieldConfigSurface } from '@/lib/planningFieldConfig'
import type { PlanningRowMode, PlanningViewMode } from '@/components/planning/PlanningTreeView'

export const PLANNING_VIEW_MODE_STORAGE_PREFIX = 'workbuddy_planning_view_mode'

// v1.4.7.3: gantt view added for task_list surface
const PLANNING_VIEW_MODES = new Set<PlanningViewMode>(['list', 'card', 'detail', 'gantt'])

function getLocalStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function normalizeUserId(userId?: string | null) {
  return String(userId ?? 'anonymous').trim() || 'anonymous'
}

export function normalizePlanningViewMode(value: unknown): PlanningViewMode | null {
  const normalized = String(value ?? '').trim()
  return PLANNING_VIEW_MODES.has(normalized as PlanningViewMode) ? (normalized as PlanningViewMode) : null
}

export function getPlanningViewModeStorageKey(
  projectId: string | null | undefined,
  surface: PlanningFieldConfigSurface,
  userId?: string | null,
) {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) return null
  return `${PLANNING_VIEW_MODE_STORAGE_PREFIX}:${normalizeUserId(userId)}:${normalizedProjectId}:${surface}`
}

export function readPlanningViewMode(storageKey: string | null | undefined, storage = getLocalStorage()) {
  if (!storageKey) return null
  return normalizePlanningViewMode(safeStorageGet(storage, storageKey))
}

export function writePlanningViewMode(
  storageKey: string | null | undefined,
  mode: PlanningViewMode,
  storage = getLocalStorage(),
) {
  if (!storageKey) return false
  return safeStorageSet(storage, storageKey, mode)
}

export function usePlanningViewMode({
  projectId,
  surface,
  userId,
  rowMode = 'read',
  defaultMode = 'card',
  editMode = 'list',
  storage,
}: {
  projectId: string | null | undefined
  surface: PlanningFieldConfigSurface
  userId?: string | null
  rowMode?: PlanningRowMode
  defaultMode?: PlanningViewMode
  editMode?: PlanningViewMode
  storage?: Storage
}) {
  const storageKey = useMemo(
    () => getPlanningViewModeStorageKey(projectId, surface, userId),
    [projectId, surface, userId],
  )

  const [readModePreference, setReadModePreference] = useState<PlanningViewMode>(() => (
    readPlanningViewMode(storageKey, storage) ?? defaultMode
  ))
  const [viewMode, setViewModeState] = useState<PlanningViewMode>(() => (
    rowMode === 'edit' ? editMode : readPlanningViewMode(storageKey, storage) ?? defaultMode
  ))

  useEffect(() => {
    const storedMode = readPlanningViewMode(storageKey, storage) ?? defaultMode
    setReadModePreference(storedMode)
    setViewModeState(rowMode === 'edit' ? editMode : storedMode)
  }, [defaultMode, editMode, rowMode, storage, storageKey])

  useEffect(() => {
    if (rowMode === 'edit') {
      setViewModeState(editMode)
      return
    }
    setViewModeState(readModePreference)
  }, [editMode, readModePreference, rowMode])

  const setViewMode = useCallback((nextMode: PlanningViewMode) => {
    const normalizedMode = normalizePlanningViewMode(nextMode)
    if (!normalizedMode) return

    setViewModeState(normalizedMode)
    if (rowMode === 'edit') return

    setReadModePreference(normalizedMode)
    writePlanningViewMode(storageKey, normalizedMode, storage)
  }, [rowMode, storage, storageKey])

  return {
    viewMode,
    setViewMode,
    readModePreference,
    storageKey,
  }
}
