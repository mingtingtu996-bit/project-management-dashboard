import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deleteProject: vi.fn(),
  enforceRetentionOrBlock: vi.fn(),
}))

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', username: 'owner-1', globalRole: 'company_admin' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../auth/access.js', () => ({
  clearProjectCompanyIdCache: vi.fn(),
  ensureDefaultCompanyForUser: vi.fn(async () => 'company-1'),
  getCurrentCompanyMembership: vi.fn(async () => ({ companyId: 'company-1', role: 'company_admin' })),
  getVisibleProjectIds: vi.fn(async () => ['project-1']),
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => 'company-1'),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
}))

vi.mock('../services/supabaseService.js', () => ({
  SupabaseService: vi.fn().mockImplementation(() => ({
    deleteProject: mocks.deleteProject,
  })),
}))

vi.mock('../services/dataQualityService.js', () => ({
  dataQualityService: {},
}))

vi.mock('../services/projectBootstrapService.js', () => ({
  getProjectBootstrap: vi.fn(),
}))

vi.mock('../services/engineeringObjectService.js', () => ({
  bootstrapEngineeringObjects: vi.fn(async () => []),
}))

vi.mock('../services/deletionRetentionGovernanceService.js', () => ({
  enforceRetentionOrBlock: mocks.enforceRetentionOrBlock,
  buildRetentionBlockedApiError: vi.fn(() => ({ code: 'RETENTION_BLOCKED', message: 'blocked' })),
  buildRetentionBlockedHttpStatus: vi.fn(() => 409),
}))

const { default: projectsRouter } = await import('../routes/projects.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects', projectsRouter)
  return app
}

describe('project deletion high-risk protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.enforceRetentionOrBlock.mockResolvedValue({ blocked: false })
    mocks.deleteProject.mockResolvedValue(undefined)
  })

  it('rejects deletion when the request does not carry an explicit resource-bound confirmation', async () => {
    const response = await request(buildApp())
      .delete(`/api/projects/${PROJECT_ID}`)
      .expect(409)

    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'PROJECT_DELETE_CONFIRMATION_REQUIRED',
      },
    })
    expect(mocks.enforceRetentionOrBlock).not.toHaveBeenCalled()
    expect(mocks.deleteProject).not.toHaveBeenCalled()
  })

  it('passes actor and confirmation evidence into the atomic deletion audit', async () => {
    await request(buildApp())
      .delete(`/api/projects/${PROJECT_ID}`)
      .set('X-WorkBuddy-Confirm-Action', `delete-project:${PROJECT_ID}`)
      .expect(200)

    expect(mocks.enforceRetentionOrBlock).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'project',
      entityId: PROJECT_ID,
      projectId: PROJECT_ID,
      userId: 'user-1',
      userAction: 'delete',
    }))
    expect(mocks.deleteProject).toHaveBeenCalledWith(PROJECT_ID, {
      actorUserId: 'user-1',
      actorUsername: 'owner-1',
      companyId: 'company-1',
      confirmation: {
        action: 'delete-project',
        resourceId: PROJECT_ID,
        source: 'explicit_request_header',
      },
      requestPath: `/api/projects/${PROJECT_ID}`,
    })
  })
})
