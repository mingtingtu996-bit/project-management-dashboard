import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRisks: vi.fn(async (projectId?: string) => (
    projectId
      ? [{ id: 'risk-1', project_id: projectId, title: '风险' }]
      : [
        { id: 'risk-1', project_id: 'project-1', title: '可见项目风险' },
        { id: 'risk-2', project_id: 'project-2', title: '其他项目风险' },
      ]
  )),
  getVisibleProjectIds: vi.fn(async () => ['project-1']),
  executeSQLOne: vi.fn(async () => null),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'regular' }
    next()
  }),
  requireProjectMember: vi.fn(() => (req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'regular' }
    next()
  }),
  requireProjectEditor: vi.fn(() => (req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'regular' }
    next()
  }),
}))

vi.mock('../auth/access.js', () => ({
  getVisibleProjectIds: mocks.getVisibleProjectIds,
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => 'company-1'),
}))

vi.mock('../services/supabaseService.js', () => ({
  SupabaseService: vi.fn().mockImplementation(() => ({
    getRisks: mocks.getRisks,
    getRisk: vi.fn(async () => null),
    createRisk: vi.fn(),
    updateRisk: vi.fn(),
    deleteRisk: vi.fn(),
  })),
}))

vi.mock('../services/dbService.js', () => ({
  closeRiskByRetention: vi.fn(),
  confirmRiskPendingManualClose: vi.fn(),
  executeSQLOne: mocks.executeSQLOne,
  keepRiskProcessing: vi.fn(),
}))

vi.mock('../services/upgradeChainService.js', () => ({
  isProtectedRisk: vi.fn(async () => false),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const { default: risksRouter } = await import('../routes/risks.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/risks', risksRouter)
  return app
}

describe('risks route access scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getVisibleProjectIds.mockResolvedValue(['project-1'])
    mocks.executeSQLOne.mockResolvedValue(null)
  })

  it('rejects project-scoped list requests before reading risks outside visible projects', async () => {
    const response = await supertest(buildApp()).get('/api/risks?projectId=project-2')

    expect(response.status).toBe(403)
    expect(response.body.error?.code).toBe('FORBIDDEN')
    expect(mocks.getRisks).not.toHaveBeenCalled()
  })

  it('filters unscoped list requests to visible projects', async () => {
    const response = await supertest(buildApp()).get('/api/risks')

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual([
      expect.objectContaining({ id: 'risk-1', project_id: 'project-1' }),
    ])
  })

  it('rejects risk task references outside the submitted project', async () => {
    mocks.executeSQLOne.mockResolvedValueOnce({ project_id: '00000000-0000-0000-0000-000000000002' })

    const response = await supertest(buildApp()).post('/api/risks').send({
      project_id: '00000000-0000-0000-0000-000000000001',
      title: '跨项目任务风险',
      task_id: '00000000-0000-0000-0000-000000000011',
      level: 'medium',
      status: 'identified',
      risk_category: 'progress',
    })

    expect(response.status).toBe(400)
    expect(response.body.error?.code).toBe('TASK_PROJECT_MISMATCH')
  })
})
