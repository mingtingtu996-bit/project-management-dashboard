import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DRAWING_PACKAGE_TEMPLATE_SEED_VERSION,
  GENERAL_DRAWING_PACKAGE_TEMPLATE_CODE,
} from '../seeds/drawingPackageTemplateSeed.js'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

const state = vi.hoisted(() => {
  const buildDrawingPackageTemplatePreview = vi.fn(async () => ({
    templateCode: 'general_drawing_package_v1',
    templateName: '施工图纸包系统模板',
    seedVersion: 'v1.4.22.6',
    projectId: 'project-1',
    summary: {
      packageCreateCount: 10,
      packageSkipExistingCount: 0,
      itemCreateCount: 40,
    },
    templateBoundary: {
      assetLevel: 'drawing_package',
      mainPageLogic: 'preserved',
      applyPolicy: 'create_missing_packages_only',
    },
    businessProfile: {
      businessTypeCode: 'industrial',
      businessTypeName: '工业建筑',
      source: 'project_generation_facts',
      defaultPackageCodes: [],
      optionalPackageCodes: [],
      sourcePolicyHints: [],
    },
    packages: [],
    warnings: [],
  }))
  const applyDrawingPackageTemplate = vi.fn(async () => ({
    templateCode: 'general_drawing_package_v1',
    seedVersion: 'v1.4.22.6',
    projectId: 'project-1',
    createdPackageIds: ['pkg-1'],
    createdItemIds: ['item-1'],
    skippedExisting: [],
  }))
  const clearDrawingBoardCache = vi.fn()

  return {
    buildDrawingPackageTemplatePreview,
    applyDrawingPackageTemplate,
    clearDrawingBoardCache,
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
        error: { code: 'FORBIDDEN', message: '无权编辑此项目' },
        timestamp: new Date().toISOString(),
      })
      return
    }
    next()
  }),
}))

vi.mock('../services/drawingPackageTemplateService.js', async () => {
  const actual = await vi.importActual<any>('../services/drawingPackageTemplateService.js')
  return {
    ...actual,
    buildDrawingPackageTemplatePreview: state.buildDrawingPackageTemplatePreview,
    applyDrawingPackageTemplate: state.applyDrawingPackageTemplate,
  }
})

vi.mock('../routes/drawing-packages.js', () => ({
  clearDrawingBoardCache: state.clearDrawingBoardCache,
}))

const { default: drawingPackageTemplatesRouter } = await import('../routes/drawing-package-templates.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/drawing-package-templates', drawingPackageTemplatesRouter)
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const error = err as { code?: string; status?: number; message?: string }
    res.status(error.status ?? 500).json({
      success: false,
      error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message ?? 'internal error' },
    })
  })
  return app
}

describe('drawing package templates route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.editorAllowed = true
  })

  it('allows project members to preview the system drawing package template', async () => {
    const request = supertest(buildApp())
    const response = await request.get('/api/projects/project-1/drawing-package-templates/system/preview')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      templateCode: GENERAL_DRAWING_PACKAGE_TEMPLATE_CODE,
      seedVersion: DRAWING_PACKAGE_TEMPLATE_SEED_VERSION,
      templateBoundary: {
        assetLevel: 'drawing_package',
        mainPageLogic: 'preserved',
      },
    })
    expect(state.buildDrawingPackageTemplatePreview).toHaveBeenCalledWith('project-1')
  })

  it('requires editor permission to apply the system drawing package template', async () => {
    state.editorAllowed = false

    const request = supertest(buildApp())
    const response = await request.post('/api/projects/project-1/drawing-package-templates/system/apply').send({
      templateCode: GENERAL_DRAWING_PACKAGE_TEMPLATE_CODE,
      seedVersion: DRAWING_PACKAGE_TEMPLATE_SEED_VERSION,
      selectedPackageCodes: [],
      duplicatePolicy: 'skip_existing',
    })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(state.applyDrawingPackageTemplate).not.toHaveBeenCalled()
  })

  it('maps template service validation errors to stable API error codes', async () => {
    state.applyDrawingPackageTemplate.mockRejectedValueOnce(
      Object.assign(new Error('version mismatch'), {
        code: 'DRAWING_PACKAGE_TEMPLATE_VERSION_MISMATCH',
        status: 409,
      }),
    )

    const request = supertest(buildApp())
    const response = await request.post('/api/projects/project-1/drawing-package-templates/system/apply').send({
      templateCode: GENERAL_DRAWING_PACKAGE_TEMPLATE_CODE,
      seedVersion: 'old-version',
      selectedPackageCodes: [],
      duplicatePolicy: 'skip_existing',
    })

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'DRAWING_PACKAGE_TEMPLATE_VERSION_MISMATCH',
      },
    })
  })

  it('applies valid selections and clears the drawing board cache', async () => {
    const request = supertest(buildApp())
    const payload = {
      templateCode: GENERAL_DRAWING_PACKAGE_TEMPLATE_CODE,
      seedVersion: DRAWING_PACKAGE_TEMPLATE_SEED_VERSION,
      selectedPackageCodes: ['pkg-industrial-process'],
      duplicatePolicy: 'skip_existing',
    }
    const response = await request.post('/api/projects/project-1/drawing-package-templates/system/apply').send(payload)

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.createdPackageIds).toEqual(['pkg-1'])
    expect(state.applyDrawingPackageTemplate).toHaveBeenCalledWith('project-1', payload, 'user-1')
    expect(state.clearDrawingBoardCache).toHaveBeenCalledWith('project-1')
  })
})
