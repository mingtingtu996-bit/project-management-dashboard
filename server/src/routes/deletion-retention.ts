import { Router } from 'express'

import { getCurrentCompanyMembership, getVisibleProjectIds } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { authenticate, requireProjectEditor } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import {
  confirmRetentionDecision,
  getRetentionGovernanceDiagnostics,
  previewRetentionConfirmedAction,
  resolveRetentionOperatorAttention,
  type ConfirmRetentionDecisionResult,
} from '../services/deletionRetentionGovernanceService.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()

router.use(authenticate)

async function ensureRetentionGovernanceAdmin(req: any, res: any) {
  const requestedCompanyId = getRequestCompanyId(req)
  const membership = req.user?.id
    ? await getCurrentCompanyMembership(req.user.id, requestedCompanyId)
    : null
  if (membership?.role === 'company_admin') {
    return { companyId: membership.companyId }
  }
  res.status(403).json({
    success: false,
    error: {
      code: 'FORBIDDEN',
      message: 'Retention governance diagnostics are available to company administrators only.',
    },
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
  return null
}

function errorResponse(code: string, message: string): ApiResponse {
  return {
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
  }
}

const RETENTION_ERROR_MESSAGES: Record<string, string> = {
  ENTITY_RETENTION_DECISION_EXPIRED: '保留处置凭证已过期或引用关系已变化，请刷新后重新发起操作。',
  RETENTION_DECISION_CONFIRMING: '保留处置正在确认中，请稍后刷新查看结果。',
  RETENTION_DECISION_NOT_CONFIRMABLE: '该保留处置已经被处理或状态已变化，请刷新后查看最新结果。',
  RETENTION_DECISION_NOT_FOUND: '未找到这次保留处置凭证，请刷新后重新发起操作。',
  RETENTION_DECISION_TOKEN_REQUIRED: '缺少保留处置凭证，请刷新后重新发起操作。',
}

function retentionErrorMessage(code: string) {
  return RETENTION_ERROR_MESSAGES[code] ?? '保留处置确认失败，请稍后重试。'
}

function retentionErrorStatus(code: string) {
  switch (code) {
    case 'RETENTION_DECISION_NOT_FOUND':
      return 404
    case 'RETENTION_DECISION_NOT_CONFIRMABLE':
    case 'RETENTION_DECISION_CONFIRMING':
    case 'ENTITY_RETENTION_DECISION_EXPIRED':
    case 'RETENTION_DECISION_ACTOR_MISMATCH':
    case 'RETENTION_DECISION_RECOVERY_LIMIT_EXCEEDED':
      return 409
    case 'RETENTION_DECISION_TOKEN_REQUIRED':
      return 400
    default:
      return 500
  }
}

async function loadVisibleProjectScope(req: any, companyId?: string | null) {
  return req.user?.id
    ? await getVisibleProjectIds(req.user.id, req.user.globalRole, companyId ?? null)
    : []
}

function visibleProjectScopeContains(visibleProjectIds: string[] | null, projectId: string) {
  if (visibleProjectIds === null) return true
  return visibleProjectIds.includes(projectId)
}

router.get(
  '/diagnostics',
  asyncHandler(async (req, res) => {
    const adminScope = await ensureRetentionGovernanceAdmin(req, res)
    if (!adminScope) return
    const visibleProjectIds = await loadVisibleProjectScope(req, adminScope.companyId)
    const data = await getRetentionGovernanceDiagnostics({
      companyId: adminScope.companyId,
      visibleProjectIds,
    })
    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }),
)

router.post(
  '/preview',
  requireProjectEditor((req) => String(req.body?.projectId ?? '').trim()),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.projectId ?? '').trim()
    const entityType = String(req.body?.entityType ?? '').trim()
    const entityId = String(req.body?.entityId ?? '').trim()
    const resolvedAction = String(req.body?.resolvedAction ?? '').trim()

    if (!projectId || !entityType || !entityId || !resolvedAction) {
      return res.status(400).json(errorResponse('RETENTION_PREVIEW_INPUT_REQUIRED', 'Retention preview requires projectId, entityType, entityId, and resolvedAction.'))
    }

    const data = await previewRetentionConfirmedAction({
      projectId,
      entityType,
      entityId,
      resolvedAction,
      actorId: req.user?.id ?? null,
    })

    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }),
)

router.post(
  '/operator-actions',
  asyncHandler(async (req, res) => {
    const adminScope = await ensureRetentionGovernanceAdmin(req, res)
    if (!adminScope) return

    const projectId = String(req.body?.projectId ?? '').trim()
    const eventId = String(req.body?.eventId ?? '').trim()
    const action = String(req.body?.action ?? '').trim()
    const note = typeof req.body?.note === 'string' ? req.body.note : null
    if (!projectId || !eventId || !['mark_handled', 'retry_requested'].includes(action)) {
      return res.status(400).json(errorResponse('RETENTION_OPERATOR_ACTION_INPUT_REQUIRED', 'Retention operator action requires projectId, eventId, and a supported action.'))
    }
    const visibleProjectIds = await loadVisibleProjectScope(req, adminScope.companyId)
    if (!visibleProjectScopeContains(visibleProjectIds, projectId)) {
      return res.status(403).json(errorResponse('FORBIDDEN', 'Retention operator action is outside the current visible project scope.'))
    }

    const data = await resolveRetentionOperatorAttention({
      projectId,
      eventId,
      action: action as 'mark_handled' | 'retry_requested',
      note,
      actorId: req.user?.id ?? null,
    })

    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    } satisfies ApiResponse)
  }),
)

router.post(
  '/confirm',
  requireProjectEditor((req) => String(req.body?.projectId ?? '').trim()),
  asyncHandler(async (req, res) => {
    const projectId = String(req.body?.projectId ?? '').trim()
    const decisionToken = String(req.body?.decisionToken ?? '').trim()

    if (!projectId || !decisionToken) {
      return res
        .status(400)
        .json(errorResponse('RETENTION_DECISION_TOKEN_REQUIRED', retentionErrorMessage('RETENTION_DECISION_TOKEN_REQUIRED')))
    }

    try {
      const data = await confirmRetentionDecision({
        projectId,
        decisionToken,
        actorId: req.user?.id ?? null,
      })

      const response: ApiResponse<ConfirmRetentionDecisionResult> = {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      }
      return res.json(response)
    } catch (error) {
      const code = error instanceof Error ? error.message : 'RETENTION_DECISION_CONFIRM_FAILED'
      if (
        code === 'RETENTION_DECISION_TOKEN_REQUIRED' ||
        code === 'RETENTION_DECISION_NOT_FOUND' ||
        code === 'RETENTION_DECISION_NOT_CONFIRMABLE' ||
        code === 'RETENTION_DECISION_CONFIRMING' ||
        code === 'RETENTION_DECISION_ACTOR_MISMATCH' ||
        code === 'RETENTION_DECISION_RECOVERY_LIMIT_EXCEEDED' ||
        code === 'ENTITY_RETENTION_DECISION_EXPIRED'
      ) {
        return res.status(retentionErrorStatus(code)).json(errorResponse(code, retentionErrorMessage(code)))
      }
      throw error
    }
  }),
)

export default router
