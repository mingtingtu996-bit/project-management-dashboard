import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ACCEPTANCE_TEMPLATE_SEED_VERSION, GENERAL_ACCEPTANCE_TEMPLATE_CODE } from '../seeds/acceptanceTimelineTemplateSeed.js'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

const state = vi.hoisted(() => {
  const buildAcceptanceTemplatePreview = vi.fn(async () => ({
    templateCode: 'general_delivery_acceptance_v1',
    templateName: '竣工交付验收事项模板',
    seedVersion: 'v1.4.22.5',
    projectId: 'project-1',
    summary: {
      itemCreateCount: 12,
      dependencyCreateCount: 6,
      requirementCreateCount: 30,
      skippedExistingCount: 0,
    },
    deliveryGoal: { targetName: '综合验收通过', explanation: '按交付目标倒推' },
    regionProfile: { provinceCode: 'GD', provinceName: '广东省', profileVersion: 'v1.4.22.5', source: 'project_static_profile' },
    industryProfile: { codes: ['residential'], labels: ['商品住宅'] },
    applicabilityConditions: [],
    items: [],
    dependencies: [],
    requirements: [],
    warnings: [],
  }))
  const applyAcceptanceTemplate = vi.fn(async () => ({
    templateCode: 'general_delivery_acceptance_v1',
    seedVersion: 'v1.4.22.5',
    projectId: 'project-1',
    createdCatalogIds: ['catalog-1'],
    createdPlanIds: ['plan-1'],
    createdDependencyIds: ['dep-1'],
    createdRequirementIds: ['req-1'],
    skippedExisting: [],
  }))

  return {
    buildAcceptanceTemplatePreview,
    applyAcceptanceTemplate,
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

vi.mock('../services/acceptanceTemplateService.js', async () => {
  const actual = await vi.importActual<any>('../services/acceptanceTemplateService.js')
  return {
    ...actual,
    buildAcceptanceTemplatePreview: state.buildAcceptanceTemplatePreview,
    applyAcceptanceTemplate: state.applyAcceptanceTemplate,
  }
})

const { default: acceptanceTemplatesRouter } = await import('../routes/acceptance-templates.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/acceptance-templates', acceptanceTemplatesRouter)
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const error = err as { code?: string; status?: number; message?: string }
    res.status(error.status ?? 500).json({
      success: false,
      error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message ?? 'internal error' },
    })
  })
  return app
}

describe('acceptance templates route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.editorAllowed = true
  })

  it('allows project members to preview the system acceptance template', async () => {
    const request = supertest(buildApp())
    const response = await request.get('/api/projects/project-1/acceptance-templates/system/preview')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      templateCode: GENERAL_ACCEPTANCE_TEMPLATE_CODE,
      seedVersion: ACCEPTANCE_TEMPLATE_SEED_VERSION,
    })
    expect(state.buildAcceptanceTemplatePreview).toHaveBeenCalledWith('project-1')
  })

  it('requires editor permission to apply the system acceptance template', async () => {
    state.editorAllowed = false

    const request = supertest(buildApp())
    const response = await request.post('/api/projects/project-1/acceptance-templates/system/apply').send({
      templateCode: GENERAL_ACCEPTANCE_TEMPLATE_CODE,
      seedVersion: ACCEPTANCE_TEMPLATE_SEED_VERSION,
      selectedItemCodes: [],
      selectedDependencyCodes: [],
      selectedRequirementCodes: [],
      duplicatePolicy: 'skip_existing',
    })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(state.applyAcceptanceTemplate).not.toHaveBeenCalled()
  })

  it('maps template service validation errors to stable API error codes', async () => {
    state.applyAcceptanceTemplate.mockRejectedValueOnce(
      Object.assign(new Error('version mismatch'), {
        code: 'ACCEPTANCE_TEMPLATE_VERSION_MISMATCH',
        status: 409,
      }),
    )

    const request = supertest(buildApp())
    const response = await request.post('/api/projects/project-1/acceptance-templates/system/apply').send({
      templateCode: GENERAL_ACCEPTANCE_TEMPLATE_CODE,
      seedVersion: 'old-version',
      selectedItemCodes: [],
      selectedDependencyCodes: [],
      selectedRequirementCodes: [],
      duplicatePolicy: 'skip_existing',
    })

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'ACCEPTANCE_TEMPLATE_VERSION_MISMATCH',
      },
    })
  })

  it('applies valid selections with the current user id', async () => {
    const request = supertest(buildApp())
    const payload = {
      templateCode: GENERAL_ACCEPTANCE_TEMPLATE_CODE,
      seedVersion: ACCEPTANCE_TEMPLATE_SEED_VERSION,
      selectedItemCodes: ['completion_acceptance'],
      selectedDependencyCodes: [],
      selectedRequirementCodes: ['COMPLETION-ACCEPTANCE-REQ-01'],
      duplicatePolicy: 'skip_existing',
    }
    const response = await request.post('/api/projects/project-1/acceptance-templates/system/apply').send(payload)

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.createdPlanIds).toEqual(['plan-1'])
    expect(state.applyAcceptanceTemplate).toHaveBeenCalledWith('project-1', payload, 'user-1')
  })
})
