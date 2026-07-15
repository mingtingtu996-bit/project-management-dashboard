import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  getVisibleProjectIds: vi.fn(),
  getProjects: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'regular' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../auth/access.js', () => ({
  ensureDefaultCompanyForUser: vi.fn(async () => 'company-1'),
  getVisibleProjectIds: mocks.getVisibleProjectIds,
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => 'company-1'),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
}))

vi.mock('../services/supabaseService.js', () => ({
  SupabaseService: vi.fn().mockImplementation(() => ({
    getProjects: mocks.getProjects,
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

const { default: projectsRouter } = await import('../routes/projects.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects', projectsRouter)
  return app
}

describe('projects list route company isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getVisibleProjectIds.mockResolvedValue(['project-1', 'project-2'])
    mocks.executeSQL.mockResolvedValue([
      { id: 'project-1', name: '项目一' },
      { id: 'project-2', name: '项目二' },
    ])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('queries only visible project ids instead of loading the global project cache', async () => {
    const response = await request(buildApp()).get('/api/projects').expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data.map((project: { id: string }) => project.id)).toEqual(['project-1', 'project-2'])
    expect(mocks.getVisibleProjectIds).toHaveBeenCalledWith('user-1', 'regular', 'company-1')
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id IN (?, ?)'),
      ['project-1', 'project-2'],
    )
    expect(mocks.getProjects).not.toHaveBeenCalled()
  })

  it('scopes the permission-bypass project cache by current company when company context exists', async () => {
    mocks.getVisibleProjectIds.mockResolvedValue(null)
    mocks.executeSQL.mockResolvedValue([{ id: 'project-company-1', name: '公司项目' }])

    const response = await request(buildApp()).get('/api/projects').expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data.map((project: { id: string }) => project.id)).toEqual(['project-company-1'])
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('WHERE company_id = ?'),
      ['company-1'],
    )
    expect(mocks.getProjects).not.toHaveBeenCalled()
  })

  it('returns the stale visible-project cache when the database read fails after the fresh TTL expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-30T00:00:00.000Z'))
    mocks.getVisibleProjectIds.mockResolvedValue(['project-stale'])
    mocks.executeSQL.mockResolvedValueOnce([{ id: 'project-stale', name: '缓存项目' }])

    const firstResponse = await request(buildApp()).get('/api/projects').expect(200)
    expect(firstResponse.body.data.map((project: { id: string }) => project.id)).toEqual(['project-stale'])

    vi.setSystemTime(new Date('2026-06-30T00:05:01.000Z'))
    mocks.executeSQL.mockRejectedValueOnce(new Error('dbService.executeSQL SELECT projects direct query timed out after 4000ms'))

    const staleResponse = await request(buildApp()).get('/api/projects').expect(200)

    expect(staleResponse.body.success).toBe(true)
    expect(staleResponse.body.data.map((project: { id: string }) => project.id)).toEqual(['project-stale'])
    expect(mocks.executeSQL).toHaveBeenCalledTimes(2)
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      'Project list fell back to stale user-scoped cache after read failure',
      expect.objectContaining({
        cacheKey: expect.stringContaining('visible:project-stale'),
        error: 'dbService.executeSQL SELECT projects direct query timed out after 4000ms',
      }),
    )
  })
})
