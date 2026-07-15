import { Router } from 'express'

import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import type { ApiResponse } from '../types/index.js'
import { clearDrawingBoardCache } from './drawing-packages.js'
import {
  applyDrawingPackageTemplate,
  buildDrawingPackageTemplatePreview,
  DrawingPackageTemplateError,
  type ApplyDrawingPackageTemplateRequest,
} from '../services/drawingPackageTemplateService.js'

const router = Router({ mergeParams: true })
router.use(authenticate)

export const drawingPackageTemplateContracts = {
  types: ['DrawingPackageTemplatePreview', 'ApplyDrawingPackageTemplateResult'],
  endpoints: [
    {
      method: 'GET',
      path: '/api/projects/:projectId/drawing-package-templates/system/preview',
      requestShape: '{ projectId: string }',
      responseShape: 'DrawingPackageTemplatePreview',
      errorCodes: ['DRAWING_PACKAGE_TEMPLATE_NOT_FOUND', 'VALIDATION_ERROR'],
    },
    {
      method: 'POST',
      path: '/api/projects/:projectId/drawing-package-templates/system/apply',
      requestShape:
        '{ templateCode: string, seedVersion: string, selectedPackageCodes: string[], duplicatePolicy: "skip_existing" }',
      responseShape: 'ApplyDrawingPackageTemplateResult',
      errorCodes: [
        'DRAWING_PACKAGE_TEMPLATE_VERSION_MISMATCH',
        'DRAWING_PACKAGE_TEMPLATE_INVALID_SELECTION',
        'DRAWING_PACKAGE_TEMPLATE_APPLY_CONFLICT',
        'FORBIDDEN',
      ],
    },
  ],
} as const

function buildTemplateErrorResponse(error: unknown): { status: number; body: ApiResponse } {
  const code = error instanceof DrawingPackageTemplateError
    ? error.code
    : String((error as { code?: string } | null)?.code ?? 'DRAWING_PACKAGE_TEMPLATE_APPLY_CONFLICT')
  const status = error instanceof DrawingPackageTemplateError
    ? error.status
    : Number((error as { status?: number } | null)?.status ?? 500)
  const message = error instanceof Error ? error.message : '系统施工图纸包模板处理失败'
  const details = error instanceof DrawingPackageTemplateError
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
    const data = await buildDrawingPackageTemplatePreview(projectId)
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
    const payload = req.body as ApplyDrawingPackageTemplateRequest
    try {
      const data = await applyDrawingPackageTemplate(projectId, payload, req.user?.id ?? null)
      clearDrawingBoardCache(projectId)
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
