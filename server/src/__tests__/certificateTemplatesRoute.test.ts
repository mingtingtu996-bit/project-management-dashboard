import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CERTIFICATE_TEMPLATE_SEED_VERSION, GENERAL_CERTIFICATE_TEMPLATE_CODE } from '../seeds/certificateTemplateSeed.js'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

const state = vi.hoisted(() => {
  const buildCertificateTemplatePreview = vi.fn(async () => ({
    templateCode: 'general_construction_v1',
    templateName: '通用建设工程四证办理模板',
    seedVersion: 'v1.4.22.2',
    projectId: 'project-1',
    summary: {
      certificateCreateCount: 4,
      workItemCreateCount: 2,
      dependencyCreateCount: 1,
      skippedExistingCount: 0,
      needsConfirmationCount: 0,
    },
    certificates: [],
    workItems: [],
    dependencies: [],
    materialPackages: [],
    landAcquisition: {
      selectedMethodCode: 'transfer',
      source: 'default',
      methods: [],
    },
    provinceProfile: null,
    warnings: [],
  }))
  const applyCertificateTemplate = vi.fn(async () => ({
    templateCode: 'general_construction_v1',
    seedVersion: 'v1.4.22.2',
    projectId: 'project-1',
    createdCertificateIds: ['cert-1'],
    createdWorkItemIds: ['work-1'],
    createdDependencyIds: ['dep-1'],
    skippedExisting: [],
  }))

  return {
    buildCertificateTemplatePreview,
    applyCertificateTemplate,
    editorAllowed: true,
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (_req: unknown, res: any, next: () => void) => {
    if (!state.editorAllowed) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '您没有编辑此项目的权限' },
        timestamp: new Date().toISOString(),
      })
      return
    }
    next()
  }),
}))

vi.mock('../services/certificateTemplateService.js', async () => {
  const actual = await vi.importActual<any>('../services/certificateTemplateService.js')
  return {
    ...actual,
    buildCertificateTemplatePreview: state.buildCertificateTemplatePreview,
    applyCertificateTemplate: state.applyCertificateTemplate,
  }
})

const { default: certificateTemplatesRouter } = await import('../routes/certificate-templates.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/certificate-templates', certificateTemplatesRouter)
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const error = err as { code?: string; status?: number; message?: string }
    res.status(error.status ?? 500).json({
      success: false,
      error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message ?? 'internal error' },
    })
  })
  return app
}

describe('certificate templates route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.editorAllowed = true
  })

  it('allows project members to preview the system certificate template', async () => {
    const request = supertest(buildApp())
    const response = await request.get('/api/projects/project-1/certificate-templates/system/preview')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      templateCode: GENERAL_CERTIFICATE_TEMPLATE_CODE,
      seedVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
    })
    expect(state.buildCertificateTemplatePreview).toHaveBeenCalledWith('project-1', {})
  })

  it('passes land acquisition method query options to preview', async () => {
    const request = supertest(buildApp())
    const response = await request.get('/api/projects/project-1/certificate-templates/system/preview?landAcquisitionMethod=allocation')

    expect(response.status).toBe(200)
    expect(state.buildCertificateTemplatePreview).toHaveBeenCalledWith('project-1', {
      landAcquisitionMethodCode: 'allocation',
    })
  })

  it('requires editor permission to apply the system certificate template', async () => {
    state.editorAllowed = false

    const request = supertest(buildApp())
    const response = await request.post('/api/projects/project-1/certificate-templates/system/apply').send({
      templateCode: GENERAL_CERTIFICATE_TEMPLATE_CODE,
      seedVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
      selectedCertificateKeys: [],
      selectedWorkItemCodes: [],
      selectedDependencyCodes: [],
      duplicatePolicy: 'skip_existing',
    })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(state.applyCertificateTemplate).not.toHaveBeenCalled()
  })

  it('maps template service validation errors to stable API error codes', async () => {
    state.applyCertificateTemplate.mockRejectedValueOnce(
      Object.assign(new Error('version mismatch'), {
        code: 'CERTIFICATE_TEMPLATE_VERSION_MISMATCH',
        status: 409,
      }),
    )

    const request = supertest(buildApp())
    const response = await request.post('/api/projects/project-1/certificate-templates/system/apply').send({
      templateCode: GENERAL_CERTIFICATE_TEMPLATE_CODE,
      seedVersion: 'old-version',
      selectedCertificateKeys: [],
      selectedWorkItemCodes: [],
      selectedDependencyCodes: [],
      duplicatePolicy: 'skip_existing',
    })

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'CERTIFICATE_TEMPLATE_VERSION_MISMATCH',
      },
    })
  })

  it('applies valid selections with the current user id', async () => {
    const request = supertest(buildApp())
    const payload = {
      templateCode: GENERAL_CERTIFICATE_TEMPLATE_CODE,
      seedVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
      selectedCertificateKeys: ['construction_permit'],
      selectedWorkItemCodes: ['CERT-DOC-PROJECT-BASIC'],
      selectedDependencyCodes: [],
      duplicatePolicy: 'skip_existing',
      landAcquisitionMethodCode: 'allocation',
    }
    const response = await request.post('/api/projects/project-1/certificate-templates/system/apply').send(payload)

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.createdCertificateIds).toEqual(['cert-1'])
    expect(state.applyCertificateTemplate).toHaveBeenCalledWith('project-1', payload, 'user-1')
  })

  it('forwards the Idempotency-Key header to the apply transaction', async () => {
    const request = supertest(buildApp())
    const payload = {
      templateCode: GENERAL_CERTIFICATE_TEMPLATE_CODE,
      seedVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
      selectedCertificateKeys: [],
      selectedWorkItemCodes: [],
      selectedDependencyCodes: [],
      duplicatePolicy: 'skip_existing',
    }

    const response = await request
      .post('/api/projects/project-1/certificate-templates/system/apply')
      .set('Idempotency-Key', 'certificate-apply-1')
      .send(payload)

    expect(response.status).toBe(200)
    expect(state.applyCertificateTemplate).toHaveBeenCalledWith(
      'project-1',
      { ...payload, idempotencyKey: 'certificate-apply-1' },
      'user-1',
    )
  })
})
