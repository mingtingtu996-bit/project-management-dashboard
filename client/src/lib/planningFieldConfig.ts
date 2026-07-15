import { safeJsonParse, safeStorageGet } from '@/lib/browserStorage'

export type PlanningFieldConfigSurface = 'baseline' | 'monthly_plan' | 'task_list'
export type PlanningFieldConfigExtraColumnKey =
  | 'progress'
  | 'type'
  | 'critical'
  | 'duration_risk'
  | 'float'
  | 'duration_asset_evidence'
  | 'parent'
  | 'level'
  | 'notes'
  | 'actions'

export const PLANNING_FIELD_CONFIG_STORAGE_PREFIX = 'workbuddy_planning_field_config'
const PLANNING_FIELD_CONFIG_EXTRA_COLUMNS = new Set<PlanningFieldConfigExtraColumnKey>([
  'progress',
  'type',
  'critical',
  'duration_risk',
  'float',
  'duration_asset_evidence',
  'parent',
  'level',
  'notes',
  'actions',
])

export interface PlanningFieldConfigSnapshot {
  registryVersion?: string | null
  extraColumns?: unknown
}

export function getPlanningFieldConfigStorageKey(
  projectId: string | null | undefined,
  surface: PlanningFieldConfigSurface,
  userId?: string | null,
) {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) return null

  const normalizedUserId = String(userId ?? 'anonymous').trim() || 'anonymous'
  return `${PLANNING_FIELD_CONFIG_STORAGE_PREFIX}:${normalizedUserId}:${normalizedProjectId}:${surface}`
}

export function isPlanningFieldConfigExtraColumnKey(value: unknown): value is PlanningFieldConfigExtraColumnKey {
  return PLANNING_FIELD_CONFIG_EXTRA_COLUMNS.has(value as PlanningFieldConfigExtraColumnKey)
}

export function readPlanningFieldConfigExtraColumns(
  storageKey: string | null | undefined,
  registryVersion?: string | null,
) {
  if (!storageKey || typeof window === 'undefined') return []

  const snapshot = safeJsonParse<PlanningFieldConfigSnapshot | null>(
    safeStorageGet(window.localStorage, storageKey),
    null,
    storageKey,
  )
  if (!snapshot) return []
  if (registryVersion && snapshot.registryVersion !== registryVersion) return []
  if (!Array.isArray(snapshot.extraColumns)) return []

  return snapshot.extraColumns.filter(isPlanningFieldConfigExtraColumnKey)
}
