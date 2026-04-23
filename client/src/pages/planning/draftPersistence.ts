import { safeJsonParse, safeStorageGet, safeStorageRemove, safeStorageSet } from '@/lib/browserStorage'

export interface PlanningDraftResumeSnapshot {
  resourceId: string
  versionLabel: string
  updatedAt: string
  workspaceLabel: string
}

export function buildPlanningDraftResumeKey(scope: string, projectId: string) {
  return `planning:draft-resume:${scope}:${projectId}`
}

export function readPlanningDraftResumeSnapshot(storageKey: string): PlanningDraftResumeSnapshot | null {
  if (typeof window === 'undefined') return null

  const raw = safeStorageGet(window.localStorage, storageKey)
  const parsed = safeJsonParse<Partial<PlanningDraftResumeSnapshot> | null>(raw, null, storageKey)
  if (!parsed?.resourceId || !parsed?.versionLabel || !parsed?.updatedAt || !parsed?.workspaceLabel) {
    return null
  }
  return {
    resourceId: parsed.resourceId,
    versionLabel: parsed.versionLabel,
    updatedAt: parsed.updatedAt,
    workspaceLabel: parsed.workspaceLabel,
  }
}

export function writePlanningDraftResumeSnapshot(
  storageKey: string,
  snapshot: PlanningDraftResumeSnapshot,
) {
  if (typeof window === 'undefined') return
  safeStorageSet(window.localStorage, storageKey, JSON.stringify(snapshot))
}

export function clearPlanningDraftResumeSnapshot(storageKey: string) {
  if (typeof window === 'undefined') return
  safeStorageRemove(window.localStorage, storageKey)
}
