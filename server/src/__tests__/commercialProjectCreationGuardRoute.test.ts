import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createProjectUnderCommercialGuard: vi.fn(),
  createProject: vi.fn(),
  getProjects: vi.fn(),
  getCurrentCompanyMembership: vi.fn(),
  ensureDefaultCompanyForUser: vi.fn(),
  clearProjectCompanyIdCache: vi.fn(),
  bootstrapEngineeringObjects: vi.fn(),
  refreshLiveProjectGenerationFactsFromProjectState: vi.fn(),
}))

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: USER_ID, globalRole: 'company_admin', currentCompanyId: COMPANY_ID }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  requireProjectOwner: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
}))

vi.mock('../auth/access.js', () => ({
  clearProjectCompanyIdCache: mocks.clearProjectCompanyIdCache,
  ensureDefaultCompanyForUser: mocks.ensureDefaultCompanyForUser,
  getCurrentCompanyMembership: mocks.getCurrentCompanyMembership,
  getVisibleProjectIds: vi.fn(async () => null),
}))

vi.mock('../services/supabaseService.js', () => ({
  SupabaseService: class {
    createProject(input: unknown) {
      return mocks.createProject(input)
    }
    getProjects() {
      return mocks.getProjects()
    }
  },
}))

vi.mock('../services/commercialTransactionService.js', () => {
  class CommercialOperationError extends Error {
    code: string
    statusCode: number
    details?: Record<string, unknown>

    constructor(code: string, message: string, statusCode: number, details?: Record<string, unknown>) {
      super(message)
      this.code = code
      this.statusCode = statusCode
      this.details = details
    }
  }
  return {
    CommercialOperationError,
    createProjectUnderCommercialGuard: mocks.createProjectUnderCommercialGuard,
  }
})

vi.mock('../services/engineeringObjectService.js', () => ({
  bootstrapEngineeringObjects: mocks.bootstrapEngineeringObjects,
}))

vi.mock('../services/projectGenerationFactsStoreService.js', () => ({
  refreshLiveProjectGenerationFactsFromProjectState: mocks.refreshLiveProjectGenerationFactsFromProjectState,
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: vi.fn(async () => []),
  executeSQLOne: vi.fn(async () => null),
}))

vi.mock('../services/dataQualityService.js', () => ({
  dataQualityService: {
    buildProjectSummary: vi.fn(),
  },
}))

vi.mock('../services/projectBootstrapService.js', () => ({
  getProjectBootstrap: vi.fn(),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

const { default: projectsRouter } = await import('../routes/projects.js')
const { CommercialOperationError } = await import('../services/commercialTransactionService.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects', projectsRouter)
  return app
}

function projectPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: '商业化 guard 测试项目',
    company_id: COMPANY_ID,
    ...overrides,
  }
}

describe('commercial project creation guard route integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCurrentCompanyMembership.mockResolvedValue({
      companyId: COMPANY_ID,
      role: 'company_admin',
    })
    mocks.ensureDefaultCompanyForUser.mockResolvedValue(COMPANY_ID)
    mocks.createProjectUnderCommercialGuard.mockResolvedValue({
      id: 'project-1',
      name: '商业化 guard 测试项目',
      company_id: COMPANY_ID,
      status: '未开始',
      created_at: '2026-06-30T00:00:00.000Z',
      updated_at: '2026-06-30T00:00:00.000Z',
    })
    mocks.createProject.mockResolvedValue({
      id: 'project-1',
      name: '商业化 guard 测试项目',
      company_id: COMPANY_ID,
      status: '未开始',
      created_at: '2026-06-30T00:00:00.000Z',
      updated_at: '2026-06-30T00:00:00.000Z',
    })
    mocks.bootstrapEngineeringObjects.mockResolvedValue([])
    mocks.refreshLiveProjectGenerationFactsFromProjectState.mockResolvedValue(undefined)
  })

  it('checks commercial admission before normal project creation', async () => {
    const response = await request(buildApp())
      .post('/api/projects')
      .send(projectPayload())

    expect(response.status).toBe(201)
    expect(mocks.createProjectUnderCommercialGuard).toHaveBeenCalledWith({
      project: expect.objectContaining({
        company_id: COMPANY_ID,
        owner_id: USER_ID,
        created_by: USER_ID,
      }),
      actorUserId: USER_ID,
    })
    expect(mocks.createProject).not.toHaveBeenCalled()
  })

  it('blocks quota failures without calling createProject', async () => {
    mocks.createProjectUnderCommercialGuard.mockRejectedValueOnce(new CommercialOperationError(
      'COMMERCIAL_PROJECT_LIMIT_REACHED',
      '当前套餐的 active 项目数量已达上限。',
      402,
      {
        companyId: COMPANY_ID,
        planTier: 'free',
        commercialState: 'trial',
        activeProjectLimit: 1,
        activeProjectCount: 1,
        billingEnabled: true,
      },
    ))

    const response = await request(buildApp())
      .post('/api/projects')
      .send(projectPayload())

    expect(response.status).toBe(402)
    expect(response.body.error.code).toBe('COMMERCIAL_PROJECT_LIMIT_REACHED')
    expect(response.body.error.details.activeProjectLimit).toBe(1)
    expect(mocks.createProject).not.toHaveBeenCalled()
  })

  it('applies the same admission guard to explicit-id project creation', async () => {
    const response = await request(buildApp())
      .post('/api/projects/with-id')
      .send(projectPayload({ id: 'explicit-project-id' }))

    expect(response.status).toBe(201)
    expect(mocks.createProjectUnderCommercialGuard).toHaveBeenCalledWith({
      project: expect.objectContaining({
        id: 'explicit-project-id',
        company_id: COMPANY_ID,
      }),
      actorUserId: USER_ID,
    })
    expect(mocks.createProject).not.toHaveBeenCalled()
  })
})
