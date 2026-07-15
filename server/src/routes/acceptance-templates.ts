import { Router } from 'express'

import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import type { ApiResponse } from '../types/index.js'
import {
  AcceptanceTemplateError,
  applyAcceptanceTemplate,
  buildAcceptanceTemplatePreview,
  type ApplyAcceptanceTemplateRequest,
} from '../services/acceptanceTemplateService.js'

const router = Router({ mergeParams: true })
router.use(authenticate)

export const acceptanceTemplateContracts = {
  types: ['AcceptanceTemplatePreview', 'ApplyAcceptanceTemplateResult'],
  endpoints: [
    {
      method: 'GET',
      path: '/api/projects/:projectId/acceptance-templates/system/preview',
      requestShape: '{ projectId: string }',
      responseShape: 'AcceptanceTemplatePreview',
      errorCodes: ['ACCEPTANCE_TEMPLATE_NOT_FOUND', 'VALIDATION_ERROR'],
    },
    {
      method: 'POST',
      path: '/api/projects/:projectId/acceptance-templates/system/apply',
      requestShape:
        '{ templateCode: string, seedVersion: string, selectedItemCodes: string[], selectedDependencyCodes: string[], selectedRequirementCodes: string[], duplicatePolicy: "skip_existing" }',
      responseShape: 'ApplyAcceptanceTemplateResult',
      errorCodes: [
        'ACCEPTANCE_TEMPLATE_VERSION_MISMATCH',
        'ACCEPTANCE_TEMPLATE_INVALID_SELECTION',
        'ACCEPTANCE_TEMPLATE_APPLY_CONFLICT',
        'FORBIDDEN',
      ],
    },
  ],
} as const

function buildTemplateErrorResponse(error: unknown): { status: number; body: ApiResponse } {
  const code = error instanceof AcceptanceTemplateError
    ? error.code
    : String((error as { code?: string } | null)?.code ?? 'ACCEPTANCE_TEMPLATE_APPLY_CONFLICT')
  const status = error instanceof AcceptanceTemplateError
    ? error.status
    : Number((error as { status?: number } | null)?.status ?? 500)
  const message = error instanceof Error ? error.message : '系统验收模板处理失败'
  const details = error instanceof AcceptanceTemplateError
    ? error.details
    : (error as { details?: Record<string, unknown> } | null)?.details

  return {
    status,
    body: {
      success: false,
      error: {
        code,
        message,
        details,
      },
      timestamp: new Date().toISOString(),
    },
  }
}

router.get(
  '/system/preview',
  requireProjectMember((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId ?? '').trim()
    const data = await buildAcceptanceTemplatePreview(projectId)
    const response: ApiResponse<typeof data> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.post(
  '/system/apply',
  requireProjectEditor((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId ?? '').trim()
    const payload = req.body as ApplyAcceptanceTemplateRequest
    try {
      const data = await applyAcceptanceTemplate(projectId, payload, req.user?.id ?? null)
      const response: ApiResponse<typeof data> = {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      }
      res.json(response)
    } catch (error) {
      const mapped = buildTemplateErrorResponse(error)
      res.status(mapped.status).json(mapped.body)
    }
  }),
)

export default router
