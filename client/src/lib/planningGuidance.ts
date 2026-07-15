import { safeJsonParse, safeStorageGet, safeStorageRemove, safeStorageSet } from '@/lib/browserStorage'
import type { PlanningFieldConfigSurface } from '@/lib/planningFieldConfig'

export type PlanningGuideKey = 'start_edit' | 'paste' | 'undo' | 'field_config'

export interface PlanningGuidanceSnapshot {
  dismissed_at?: string | null
  first_seen_at?: string | null
  completed_count?: number | null
}

export const PLANNING_GUIDANCE_STORAGE_PREFIX = 'workbuddy_planning_guidance'
export const PLANNING_GUIDANCE_AUTO_DISMISS_EDIT_COUNT = 5
export const PLANNING_GUIDANCE_AUTO_DISMISS_DAYS = 30

const GUIDE_KEYS: PlanningGuideKey[] = ['start_edit', 'paste', 'undo', 'field_config']
const AUTO_DISMISS_MS = PLANNING_GUIDANCE_AUTO_DISMISS_DAYS * 24 * 60 * 60 * 1000

function getStorage(storage?: Storage) {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  return window.localStorage
}

function normalizeUserId(userId?: string | null) {
  return String(userId ?? 'anonymous').trim() || 'anonymous'
}

export function getPlanningGuidanceStorageKey(
  userId: string | null | undefined,
  surface: PlanningFieldConfigSurface,
  guideKey: PlanningGuideKey,
) {
  return `${PLANNING_GUIDANCE_STORAGE_PREFIX}:${normalizeUserId(userId)}:${surface}:${guideKey}`
}

export function readPlanningGuidanceSnapshot(
  storageKey: string | null | undefined,
  storage?: Storage,
): PlanningGuidanceSnapshot | null {
  if (!storageKey) return null
  return safeJsonParse<PlanningGuidanceSnapshot | null>(
    safeStorageGet(getStorage(storage), storageKey),
    null,
    storageKey,
  )
}

export function shouldShowPlanningGuidance(
  storageKey: string | null | undefined,
  options?: { now?: Date; storage?: Storage },
) {
  if (!storageKey) return false
  const snapshot = readPlanningGuidanceSnapshot(storageKey, options?.storage)
  if (!snapshot) return true
  if (snapshot.dismissed_at) return false
  if (Number(snapshot.completed_count ?? 0) >= PLANNING_GUIDANCE_AUTO_DISMISS_EDIT_COUNT) return false

  const firstSeenAt = snapshot.first_seen_at ? new Date(snapshot.first_seen_at).getTime() : null
  if (firstSeenAt !== null && Number.isFinite(firstSeenAt)) {
    const now = options?.now ?? new Date()
    if (now.getTime() - firstSeenAt >= AUTO_DISMISS_MS) return false
  }

  return true
}

export function writePlanningGuidanceSnapshot(
  storageKey: string | null | undefined,
  snapshot: PlanningGuidanceSnapshot,
  storage?: Storage,
) {
  if (!storageKey) return false
  return safeStorageSet(getStorage(storage), storageKey, JSON.stringify(snapshot))
}

export function markPlanningGuidanceSeen(
  storageKey: string | null | undefined,
  options?: { now?: Date; storage?: Storage },
) {
  if (!storageKey) return false
  const snapshot = readPlanningGuidanceSnapshot(storageKey, options?.storage) ?? {}
  if (snapshot.first_seen_at) return true
  return writePlanningGuidanceSnapshot(
    storageKey,
    {
      ...snapshot,
      first_seen_at: (options?.now ?? new Date()).toISOString(),
      completed_count: Number(snapshot.completed_count ?? 0),
    },
    options?.storage,
  )
}

export function dismissPlanningGuidance(
  storageKey: string | null | undefined,
  options?: { now?: Date; storage?: Storage },
) {
  if (!storageKey) return false
  const snapshot = readPlanningGuidanceSnapshot(storageKey, options?.storage) ?? {}
  return writePlanningGuidanceSnapshot(
    storageKey,
    {
      ...snapshot,
      first_seen_at: snapshot.first_seen_at ?? (options?.now ?? new Date()).toISOString(),
      dismissed_at: (options?.now ?? new Date()).toISOString(),
      completed_count: Number(snapshot.completed_count ?? 0),
    },
    options?.storage,
  )
}

export function recordPlanningGuidanceCompletion(
  storageKey: string | null | undefined,
  options?: { now?: Date; storage?: Storage },
) {
  if (!storageKey) return false
  const snapshot = readPlanningGuidanceSnapshot(storageKey, options?.storage) ?? {}
  const completedCount = Number(snapshot.completed_count ?? 0) + 1
  const next: PlanningGuidanceSnapshot = {
    ...snapshot,
    first_seen_at: snapshot.first_seen_at ?? (options?.now ?? new Date()).toISOString(),
    completed_count: completedCount,
  }
  if (completedCount >= PLANNING_GUIDANCE_AUTO_DISMISS_EDIT_COUNT) {
    next.dismissed_at = next.dismissed_at ?? (options?.now ?? new Date()).toISOString()
  }
  return writePlanningGuidanceSnapshot(storageKey, next, options?.storage)
}

export function resetPlanningGuidanceForUser(
  userId: string | null | undefined,
  surface?: PlanningFieldConfigSurface,
  storage?: Storage,
) {
  const resolvedStorage = getStorage(storage)
  if (!resolvedStorage) return 0
  const normalizedUserId = normalizeUserId(userId)
  const prefix = `${PLANNING_GUIDANCE_STORAGE_PREFIX}:${normalizedUserId}:`
  let removed = 0
  const keys: string[] = []

  for (let index = 0; index < resolvedStorage.length; index += 1) {
    const key = resolvedStorage.key(index)
    if (!key?.startsWith(prefix)) continue
    if (surface && !key.startsWith(`${prefix}${surface}:`)) continue
    keys.push(key)
  }

  keys.forEach((key) => {
    if (safeStorageRemove(resolvedStorage, key)) removed += 1
  })

  return removed
}

export function getPlanningGuidanceStorageKeys(
  userId: string | null | undefined,
  surface: PlanningFieldConfigSurface,
) {
  return Object.fromEntries(
    GUIDE_KEYS.map((guideKey) => [guideKey, getPlanningGuidanceStorageKey(userId, surface, guideKey)]),
  ) as Record<PlanningGuideKey, string>
}
