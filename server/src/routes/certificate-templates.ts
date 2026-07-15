import { Router } from 'express'

import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import type { ApiResponse } from '../types/index.js'
import {
  applyCertificateTemplate,
  buildCertificateTemplatePreview,
  CertificateTemplateError,
  type ApplyCertificateTemplateRequest,
} from '../services/certificateTemplateService.js'

const router = Router({ mergeParams: true })
router.use(authenticate)

export const certificateTemplateContracts = {
  types: ['CertificateTemplatePreview', 'ApplyCertificateTemplateResult'],
  endpoints: [
    {
      method: 'GET',
      path: '/api/projects/:projectId/certificate-templates/system/preview',
      requestShape: '{ projectId: string, query?: { landAcquisitionMethod?: string } }',
      responseShape: 'CertificateTemplatePreview',
      errorCodes: ['CERTIFICATE_TEMPLATE_NOT_FOUND', 'VALIDATION_ERROR'],
    },
    {
      method: 'POST',
      path: '/api/projects/:projectId/certificate-templates/system/apply',
      requestShape:
        '{ templateCode: string, seedVersion: string, selectedCertificateKeys: string[], selectedWorkItemCodes: string[], selectedDependencyCodes: string[], duplicatePolicy: "skip_existing", landAcquisitionMethodCode?: string, idempotencyKey?: string }',
      responseShape: 'ApplyCertificateTemplateResult',
      errorCodes: [
        'CERTIFICATE_TEMPLATE_VERSION_MISMATCH',
        'CERTIFICATE_TEMPLATE_INVALID_SELECTION',
        'CERTIFICATE_TEMPLATE_APPLY_CONFLICT',
        'CERTIFICATE_TEMPLATE_IDEMPOTENCY_CONFLICT',
        'FORBIDDEN',
      ],
    },
  ],
} as const

function buildTemplateErrorResponse(error: unknown): { status: number; body: ApiResponse } {
  const code = error instanceof CertificateTemplateError
    ? error.code
    : String((error as { code?: string } | null)?.code ?? 'CERTIFICATE_TEMPLATE_APPLY_CONFLICT')
  const status = error instanceof CertificateTemplateError
    ? error.status
    : Number((error as { status?: number } | null)?.status ?? 500)
  const message = error instanceof Error ? error.message : '系统证照模板处理失败'
  const details = error instanceof CertificateTemplateError
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
    const landAcquisitionMethodCode = String(req.query.landAcquisitionMethod ?? req.query.landAcquisitionMethodCode ?? '').trim()
    const data = await buildCertificateTemplatePreview(projectId, landAcquisitionMethodCode ? { landAcquisitionMethodCode } : {})
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
    const headerIdempotencyKey = String(req.get('Idempotency-Key') ?? '').trim()
    const payload: ApplyCertificateTemplateRequest = {
      ...(req.body as ApplyCertificateTemplateRequest),
      ...(headerIdempotencyKey ? { idempotencyKey: headerIdempotencyKey } : {}),
    }
    try {
      const data = await applyCertificateTemplate(projectId, payload, req.user?.id ?? null)
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
