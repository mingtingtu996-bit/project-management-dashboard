import { PlanningDraftLockService, PlanningDraftLockServiceError } from './planningDraftLockService.js'
import type { PlanningDraftLockRecord } from '../types/db.js'
import type { BaselineVersionLock } from '../types/planning.js'

const draftLockService = new PlanningDraftLockService()

export const baselineVersionLockContracts = {
  method: 'GET' as const,
  path: '/api/progress-deviation/lock',
  requestShape: '{ project_id: string, baseline_version_id: string, actor_user_id?: string }',
  responseShape: '{ lock: BaselineVersionLock | null }',
  errorCodes: ['LOCK_HELD', 'LOCK_EXPIRED', 'NOT_FOUND', 'VALIDATION_ERROR'] as const,
}

export function buildBaselineVersionLockResourceId(projectId: string, baselineVersionId: string) {
  void projectId
  return baselineVersionId
}

function toBaselineVersionLock(record: PlanningDraftLockRecord, baselineVersionId: string): BaselineVersionLock {
  return {
    ...record,
    baseline_version_id: baselineVersionId,
  }
}

export async function readBaselineVersionLock(projectId: string, baselineVersionId: string) {
  const lock = await draftLockService.getDraftLock(
    projectId,
    'baseline',
    buildBaselineVersionLockResourceId(projectId, baselineVersionId)
  )

  return lock ? toBaselineVersionLock(lock, baselineVersionId) : null
}

export const getBaselineVersionLock = readBaselineVersionLock

export async function acquireBaselineVersionLock(params: {
  projectId: string
  baselineVersionId: string
  actorUserId: string
}) {
  const lock = await draftLockService.acquireDraftLock({
    projectId: params.projectId,
    draftType: 'baseline',
    resourceId: buildBaselineVersionLockResourceId(params.projectId, params.baselineVersionId),
    actorUserId: params.actorUserId,
  })

  return toBaselineVersionLock(lock, params.baselineVersionId)
}

export async function releaseBaselineVersionLock(params: {
  projectId: string
  baselineVersionId: string
  actorUserId: string
  actorRole?: string | null
  reason?: 'manual_release' | 'force_unlock'
}) {
  const lock = await draftLockService.releaseDraftLock({
    projectId: params.projectId,
    draftType: 'baseline',
    resourceId: buildBaselineVersionLockResourceId(params.projectId, params.baselineVersionId),
    actorUserId: params.actorUserId,
    actorRole: params.actorRole ?? null,
    reason: params.reason ?? 'manual_release',
  })

  return lock ? toBaselineVersionLock(lock, params.baselineVersionId) : null
}

export { PlanningDraftLockServiceError }
