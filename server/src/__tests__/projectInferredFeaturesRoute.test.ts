import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'owner' }
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
  getVisibleProjectIds: vi.fn(async () => null),
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => 'company-1'),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
}))

vi.mock('../services/supabaseService.js', () => ({
  SupabaseService: vi.fn().mockImplementation(() => ({
    getProjects: vi.fn(),
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

const projectId = '11111111-1111-4111-8111-111111111111'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects', projectsRouter)
  return app
}

describe('projects inferred features route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.executeSQLOne.mockResolvedValue({
      id: projectId,
      metadata: {},
      project_type: 'residential',
      above_ground_floors: 3,
      underground_floors: 2,
    })
    mocks.executeSQL.mockResolvedValue([])
  })

  it('expands project floor counts into an ordered floor sequence for template inference', async () => {
    const response = await request(buildApp())
      .get(`/api/projects/${projectId}/inferred-features`)
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data.scopeCandidates.floorSequence).toEqual(expect.objectContaining({
      source: 'projects.floor_count',
      aboveGroundFloors: 3,
      undergroundFloors: 2,
      totalFloors: 5,
    }))
    expect(response.body.data.scopeCandidates.floorSequence.floors.map((item: any) => item.label)).toEqual([
      'B2',
      'B1',
      '1F',
      '2F',
      '3F',
    ])
    expect(response.body.data.scopeCandidates.floorSequence.floors.map((item: any) => item.isBasement)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ])
    expect(response.body.data.explanationSources).toContain('projects.floor_count')
  })
})
