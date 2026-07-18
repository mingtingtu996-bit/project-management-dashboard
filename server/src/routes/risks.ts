// Risks API 路由

import { Router } from 'express'
import { SupabaseService } from '../services/supabaseService.js'
import { closeRiskByRetention, confirmRiskPendingManualClose, executeSQLOne, keepRiskProcessing } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate, validateIdParam, riskIssueClosureOutcomeSchema, riskSchema, riskUpdateSchema } from '../middleware/validation.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { isProtectedRisk } from '../services/upgradeChainService.js'
import { assertTransition } from '../services/statusDictionaryService.js'
import type { ApiResponse } from '../types/index.js'
import type { Risk } from '../types/db.js'
import { getVisibleProjectIds } from '../auth/access.js'

const router = Router()
const supabase = new SupabaseService()
const RISK_LIST_CACHE_TTL_MS = Number(process.env.RISK_LIST_CACHE_TTL_MS ?? 120_000)
const riskListCache = new Map<string, { expiresAt: number; data: Risk[] }>()
const riskListInFlight = new Map<string, Promise<Risk[]>>()

function clearRiskListCache() {
  riskListCache.clear()
  riskListInFlight.clear()
}

async function loadRisksWithCache(projectId?: string | null) {
  const cacheKey = projectId ? `project:${projectId}` : 'all'
  const cached = riskListCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  const pending = riskListInFlight.get(cacheKey)
  if (pending) return pending

  const promise = supabase.getRisks(projectId ?? undefined)
  riskListInFlight.set(cacheKey, promise)
  try {
    const data = await promise
    riskListCache.set(cacheKey, {
      expiresAt: Date.now() + RISK_LIST_CACHE_TTL_MS,
      data,
    })
    return data
  } finally {
    riskListInFlight.delete(cacheKey)
  }
}

export async function warmRiskListCache(projectId?: string | null) {
  return loadRisksWithCache(projectId)
}

function parseExpectedVersion(input: unknown) {
  if (input === undefined || input === null || input === '') return undefined
  const version = Number(input)
  return Number.isInteger(version) && version > 0 ? version : null
}

router.use(authenticate)

function buildUpgradeChainProtectedResponse(risk: Risk): ApiResponse {
  return {
    success: false,
    error: {
      code: 'UPGRADE_CHAIN_PROTECTED',
      message: 'This record is linked to an upgrade chain. Close it instead of deleting it.',
      details: {
        entity_type: 'risk',
        entity_id: risk.id,
        source_type: risk.source_type ?? null,
        source_id: risk.source_id ?? null,
        chain_id: risk.chain_id ?? null,
        linked_issue_id: risk.linked_issue_id ?? null,
        closed_reason: risk.closed_reason ?? null,
        closed_at: risk.closed_at ?? null,
      },
    },
    timestamp: new Date().toISOString(),
  }
}

async function validateRiskProjectReferences(projectId: string, payload: Record<string, unknown>) {
  const taskId = String(payload.task_id ?? '').trim()
  if (taskId) {
    const task = await executeSQLOne<{ project_id?: string | null }>('SELECT project_id FROM tasks WHERE id = ? LIMIT 1', [taskId])
    if (!task || String(task.project_id ?? '') !== projectId) {
      return {
        success: false,
        error: {
          code: 'TASK_PROJECT_MISMATCH',
          message: '风险关联的任务必须属于当前项目',
          details: { taskId, projectId },
        },
        timestamp: new Date().toISOString(),
      } satisfies ApiResponse
    }
  }

  const linkedIssueId = String(payload.linked_issue_id ?? '').trim()
  if (linkedIssueId) {
    const issue = await executeSQLOne<{ project_id?: string | null }>('SELECT project_id FROM issues WHERE id = ? LIMIT 1', [linkedIssueId])
    if (!issue || String(issue.project_id ?? '') !== projectId) {
      return {
        success: false,
        error: {
          code: 'ISSUE_PROJECT_MISMATCH',
          message: '风险关联的问题必须属于当前项目',
          details: { issueId: linkedIssueId, projectId },
        },
        timestamp: new Date().toISOString(),
      } satisfies ApiResponse
    }
  }

  return null
}

router.get('/', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  logger.info('Fetching risks', { projectId })

  let visibleProjectIds: string[] | null = null

  if (req.user?.id) {
    visibleProjectIds = await getVisibleProjectIds(req.user.id, req.user.globalRole, getRequestCompanyId(req))
    if (visibleProjectIds) {
      if (projectId && !visibleProjectIds.includes(projectId)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: '您没有权限访问此项目风险' },
          timestamp: new Date().toISOString(),
        })
      }
    }
  }

  let risks = await loadRisksWithCache(projectId)
  if (!projectId && visibleProjectIds) {
    const visibleProjectIdSet = new Set(visibleProjectIds)
    risks = risks.filter((risk) => visibleProjectIdSet.has(risk.project_id))
  }

  const response: ApiResponse<Risk[]> = {
    success: true,
    data: risks,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/:id', validateIdParam, requireProjectMember(async (req) => {
  const risk = await supabase.getRisk(req.params.id)
  return risk?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching risk', { id })

  const risk = await supabase.getRisk(id)

  if (!risk) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'RISK_NOT_FOUND', message: 'Risk not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<Risk> = {
    success: true,
    data: risk,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/', requireProjectEditor(req => req.body.project_id), validate(riskSchema), asyncHandler(async (req, res) => {
  logger.info('Creating risk', req.body)
  const projectId = String(req.body?.project_id ?? '').trim()
  const referenceError = await validateRiskProjectReferences(projectId, req.body ?? {})
  if (referenceError) return res.status(400).json(referenceError)

  const risk = await supabase.createRisk({
    ...req.body,
    version: 1,
  })
  clearRiskListCache()

  const response: ApiResponse<Risk> = {
    success: true,
    data: risk,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

router.put('/:id', validateIdParam, requireProjectEditor(async (req) => {
  const risk = await supabase.getRisk(req.params.id)
  return risk?.project_id
}), validate(riskUpdateSchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { version, ...updates } = req.body

  logger.info('Updating risk', { id, version })
  const existing = await supabase.getRisk(id)
  if (!existing) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'RISK_NOT_FOUND', message: 'Risk not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const projectId = String(updates.project_id ?? existing.project_id ?? '').trim()
  if (updates.project_id !== undefined && projectId !== String(existing.project_id ?? '').trim()) {
    return res.status(400).json({
      success: false,
      error: { code: 'PROJECT_ID_IMMUTABLE', message: '风险所属项目不能通过更新接口变更' },
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }
  const referenceError = await validateRiskProjectReferences(projectId, updates)
  if (referenceError) return res.status(400).json(referenceError)

  const risk = await supabase.updateRisk(id, updates, version)

  if (!risk) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'RISK_NOT_FOUND', message: 'Risk not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }
  clearRiskListCache()

  const response: ApiResponse<Risk> = {
    success: true,
    data: risk,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/:id/confirm-close', validateIdParam, requireProjectEditor(async (req) => {
  const risk = await supabase.getRisk(req.params.id)
  return risk?.project_id
}), validate(riskIssueClosureOutcomeSchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const version = parseExpectedVersion(req.body?.version)
  if (version === null) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'version must be a positive integer' },
      timestamp: new Date().toISOString(),
    })
  }
  logger.info('Confirming risk pending manual close', { id, version })

  const risk = await confirmRiskPendingManualClose(id, {
    resultCode: req.body.resultCode,
    resultSummary: req.body.resultSummary,
    effectiveness: req.body.effectiveness,
    evidenceRefs: req.body.evidenceRefs,
    causeAttributionId: req.body.causeAttributionId,
  }, String(req.user?.id ?? ''), version)
  if (!risk) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'RISK_NOT_FOUND', message: 'Risk not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }
  clearRiskListCache()

  const response: ApiResponse<Risk> = {
    success: true,
    data: risk,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/:id/keep-processing', validateIdParam, requireProjectEditor(async (req) => {
  const risk = await supabase.getRisk(req.params.id)
  return risk?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  const version = parseExpectedVersion(req.body?.version)
  if (version === null) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'version must be a positive integer' },
      timestamp: new Date().toISOString(),
    })
  }
  logger.info('Keeping risk in processing', { id, version })

  const risk = await keepRiskProcessing(id, version)
  if (!risk) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'RISK_NOT_FOUND', message: 'Risk not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }
  clearRiskListCache()

  const response: ApiResponse<Risk> = {
    success: true,
    data: risk,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.delete('/:id', validateIdParam, requireProjectEditor(async (req) => {
  const risk = await supabase.getRisk(req.params.id)
  return risk?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting risk', { id })

  const risk = await supabase.getRisk(id)
  if (!risk) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'RISK_NOT_FOUND', message: 'Risk not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  if (isProtectedRisk(risk)) {
    return res.status(422).json(buildUpgradeChainProtectedResponse(risk))
  }

  // v1.4.15: enforce retention — close instead of physical delete when protected
  const { enforceRetentionOrBlock, buildRetentionBlockedApiError, buildRetentionBlockedHttpStatus } = await import('../services/deletionRetentionGovernanceService.js')
  const retention = await enforceRetentionOrBlock({
    entityType: 'risk',
    entityId: id,
    projectId: risk.project_id ?? null,
    userId: req.user?.id ?? null,
    userAction: 'delete',
  })
  if (retention.blocked) {
    return res.status(buildRetentionBlockedHttpStatus(retention.result)).json({ success: false, error: buildRetentionBlockedApiError(retention.reason, retention.result), timestamp: new Date().toISOString() })
  }
  if (retention.result.resolvedAction === 'close') {
    await assertTransition('risk.lifecycle', String(risk.status ?? 'identified'), 'closed')
    await closeRiskByRetention(id, risk.project_id, { actorId: req.user?.id ?? null })
  } else {
    await supabase.deleteRisk(id)
  }
  clearRiskListCache()

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
