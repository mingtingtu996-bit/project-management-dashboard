import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

const state = vi.hoisted(() => {
  const executeSQL = vi.fn(async () => [])
  const executeSQLOne = vi.fn(async () => null)

  return {
    executeSQL,
    executeSQLOne,
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: state.executeSQL,
  executeSQLOne: state.executeSQLOne,
}))

const { certificateDependencyContracts, default: certificateDependenciesRouter } = await import('../routes/certificate-dependencies.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/certificate-dependencies', certificateDependenciesRouter)
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : 'internal error'
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    })
  })
  return app
}

describe('certificate dependencies route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('documents the project-scoped dependency contract endpoints', () => {
    expect(certificateDependencyContracts.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '/api/projects/:projectId/certificate-dependencies' }),
        expect.objectContaining({ method: 'POST', path: '/api/projects/:projectId/certificate-dependencies' }),
        expect.objectContaining({ method: 'DELETE', path: '/api/projects/:projectId/certificate-dependencies/:id' }),
      ]),
    )
  })

  it('lists project dependencies and filters them by certificate when requested', async () => {
    state.executeSQL.mockResolvedValue([
      {
        id: 'dep-1',
        project_id: 'project-1',
        predecessor_type: 'certificate',
        predecessor_id: 'cert-a',
        successor_type: 'work_item',
        successor_id: 'work-1',
        dependency_kind: 'hard',
        created_at: '2026-04-16T00:00:00.000Z',
      },
      {
        id: 'dep-2',
        project_id: 'project-1',
        predecessor_type: 'certificate',
        predecessor_id: 'cert-b',
        successor_type: 'work_item',
        successor_id: 'work-2',
        dependency_kind: 'soft',
        created_at: '2026-04-16T00:00:00.000Z',
      },
    ])

    const request = supertest(buildApp())
    const response = await request.get('/api/projects/project-1/certificate-dependencies?certificate_id=cert-a')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toHaveLength(1)
    expect(response.body.data[0]).toMatchObject({
      id: 'dep-1',
      predecessor_id: 'cert-a',
      dependency_kind: 'hard',
    })
    expect(state.executeSQL).toHaveBeenCalledWith(
      'SELECT * FROM certificate_dependencies WHERE project_id = ? ORDER BY created_at ASC',
      ['project-1'],
    )
  })

  it('creates and deletes dependencies through the project-scoped route', async () => {
    state.executeSQLOne.mockResolvedValue({
      id: 'dep-created',
      project_id: 'project-1',
      predecessor_type: 'certificate',
      predecessor_id: 'cert-a',
      successor_type: 'work_item',
      successor_id: 'work-1',
      dependency_kind: 'hard',
      notes: null,
      created_at: '2026-04-16T00:00:00.000Z',
    })

    const request = supertest(buildApp())
    const createResponse = await request.post('/api/projects/project-1/certificate-dependencies').send({
      predecessor_type: 'certificate',
      predecessor_id: 'cert-a',
      successor_type: 'work_item',
      successor_id: 'work-1',
      dependency_kind: 'hard',
    })

    expect(createResponse.status).toBe(201)
    expect(createResponse.body.success).toBe(true)
    expect(createResponse.body.data).toMatchObject({
      id: 'dep-created',
      predecessor_id: 'cert-a',
      successor_id: 'work-1',
    })
    expect(state.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO certificate_dependencies'),
      expect.arrayContaining([
        expect.any(String),
        'project-1',
        'certificate',
        'cert-a',
        'work_item',
        'work-1',
        'hard',
      ]),
    )

    const deleteResponse = await request.delete('/api/projects/project-1/certificate-dependencies/dep-created')

    expect(deleteResponse.status).toBe(200)
    expect(deleteResponse.body.success).toBe(true)
    expect(state.executeSQL).toHaveBeenCalledWith(
      'DELETE FROM certificate_dependencies WHERE id = ? AND project_id = ?',
      ['dep-created', 'project-1'],
    )
  })

  it('rejects a dependency that would introduce a cycle', async () => {
    state.executeSQL.mockResolvedValue([
      {
        id: 'dep-1',
        project_id: 'project-1',
        predecessor_type: 'certificate',
        predecessor_id: 'cert-a',
        successor_type: 'work_item',
        successor_id: 'work-1',
        dependency_kind: 'hard',
        created_at: '2026-04-16T00:00:00.000Z',
      },
      {
        id: 'dep-2',
        project_id: 'project-1',
        predecessor_type: 'work_item',
        predecessor_id: 'work-1',
        successor_type: 'certificate',
        successor_id: 'cert-b',
        dependency_kind: 'hard',
        created_at: '2026-04-16T00:05:00.000Z',
      },
    ])

    const request = supertest(buildApp())
    const response = await request.post('/api/projects/project-1/certificate-dependencies').send({
      predecessor_type: 'certificate',
      predecessor_id: 'cert-b',
      successor_type: 'certificate',
      successor_id: 'cert-a',
      dependency_kind: 'hard',
    })

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'DEPENDENCY_CYCLE_DETECTED',
      },
    })
    expect(state.executeSQL).toHaveBeenCalledTimes(1)
    expect(state.executeSQLOne).not.toHaveBeenCalled()
  })
})
