// v1.4.7.1: Planning field registry frontend cache
// Single authority for field definitions used by the shared planning tree

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '@/lib/apiClient'

export type PlanningSurface = 'baseline' | 'monthly_plan' | 'task_list'
export type PlanningFieldDataType = 'text' | 'number' | 'date' | 'percent' | 'enum' | 'lookup' | 'boolean'
export type PlanningLookupSource = 'participant_units' | 'engineering_objects' | 'tasks' | 'dictionary'
export type PlanningFieldFormatter = 'tabular_num' | 'date_short' | 'percent_int' | 'wbs_label'
export type PlanningFieldEditableWhen = 'always' | 'unconfirmed' | 'unpublished' | 'never'
export type PlanningFieldDisplayGroup =
  | 'basic_plan' | 'progress_fact' | 'engineering_object' | 'engineering_category'
  | 'responsibility' | 'node_control' | 'dependency' | 'acceptance_impact'
  | 'quality_hint' | 'template_source'
export type PlanningFieldMergeGroup =
  | 'identity' | 'schedule' | 'progress_status' | 'assignee' | 'participant_unit'
  | 'structure' | 'node_control' | 'engineering_object' | 'engineering_category'
  | 'dependency' | 'readonly_derived'

export interface PlanningFieldValidator {
  type: string
  params?: Record<string, unknown>
  severity?: 'block_save' | 'confirm' | 'hint'
}

export interface PlanningFieldDefinition {
  key: string
  group: PlanningFieldDisplayGroup
  displayGroup: PlanningFieldDisplayGroup
  mergeGroup: PlanningFieldMergeGroup
  label: string
  dataType: PlanningFieldDataType
  lookupSource?: PlanningLookupSource
  editableIn: PlanningSurface[]
  editableWhen?: PlanningFieldEditableWhen
  defaultVisibleIn: PlanningSurface[]
  formatter?: PlanningFieldFormatter
  validators?: PlanningFieldValidator[]
  readonlyReasonCode?: string
  surfaceLabel?: Partial<Record<PlanningSurface, string>>
}

export interface PlanningFieldGroupDefinition {
  key: PlanningFieldDisplayGroup
  label: string
  sortOrder: number
}

export interface PlanningFieldRegistryResponse {
  registryVersion: string
  surface: PlanningSurface
  generatedAt: string
  updatedAt: string
  groups: PlanningFieldGroupDefinition[]
  fields: PlanningFieldDefinition[]
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry {
  data: PlanningFieldRegistryResponse
  fetchedAt: number
}

const registryCache = new Map<string, CacheEntry>()

function cacheKey(projectId: string, surface: PlanningSurface): string {
  return `${projectId}:${surface}`
}

export function usePlanningFieldRegistry(projectId: string | undefined, surface: PlanningSurface) {
  const [registry, setRegistry] = useState<PlanningFieldRegistryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchRegistry = useCallback(async (forceRefresh = false) => {
    if (!projectId) return null
    const key = cacheKey(projectId, surface)
    const cached = registryCache.get(key)
    if (!forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      if (mountedRef.current) setRegistry(cached.data)
      return cached.data
    }

    setLoading(true)
    setError(null)
    try {
      const data = await apiGet<PlanningFieldRegistryResponse>(`/api/planning/field-registry?projectId=${encodeURIComponent(projectId)}&surface=${encodeURIComponent(surface)}`)
      const entry: CacheEntry = { data, fetchedAt: Date.now() }
      registryCache.set(key, entry)
      if (mountedRef.current) setRegistry(data)
      return data
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load field registry'
      if (mountedRef.current) setError(msg)
      return null
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [projectId, surface])

  useEffect(() => {
    fetchRegistry()
  }, [fetchRegistry])

  const refetch = useCallback(() => fetchRegistry(true), [fetchRegistry])

  const fieldsByGroup = useCallback((group: PlanningFieldDisplayGroup) => {
    return (registry?.fields ?? []).filter((f) => f.displayGroup === group)
  }, [registry])

  const isFieldEditable = useCallback((fieldKey: string, s?: PlanningSurface) => {
    const srf = s ?? surface
    const field = (registry?.fields ?? []).find((f) => f.key === fieldKey)
    if (!field) return false
    return field.editableIn.includes(srf) && field.editableWhen !== 'never'
  }, [registry, surface])

  const defaultVisibleFields = useCallback((s?: PlanningSurface) => {
    const srf = s ?? surface
    return (registry?.fields ?? []).filter((f) => f.defaultVisibleIn.includes(srf))
  }, [registry, surface])

  const getFieldLabel = useCallback((fieldKey: string) => {
    return (registry?.fields ?? []).find((f) => f.key === fieldKey)?.label ?? fieldKey
  }, [registry])

  const getMergeGroup = useCallback((fieldKey: string): PlanningFieldMergeGroup | undefined => {
    return (registry?.fields ?? []).find((f) => f.key === fieldKey)?.mergeGroup
  }, [registry])

  return {
    registry,
    loading,
    error,
    refetch,
    fieldsByGroup,
    isFieldEditable,
    defaultVisibleFields,
    getFieldLabel,
    getMergeGroup,
  }
}

export default usePlanningFieldRegistry
