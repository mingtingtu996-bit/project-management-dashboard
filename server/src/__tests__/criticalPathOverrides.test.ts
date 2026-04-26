import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMocks = vi.hoisted(() => ({
  snapshot: {
    projectId: 'project-1',
    autoTaskIds: ['task-1'],
    manualAttentionTaskIds: ['task-2'],
    manualInsertedTaskIds: [],
    displayTaskIds: ['task-1', 'task-2'],
    primaryChain: { taskIds: ['task-1', 'task-2'], totalDurationDays: 8 },
    alternateChains: [],
    edges: [],
    tasks: [],
    generatedAt: '2026-04-17T12:00:00.000Z',
  },
  overrides: [
    {
      id: 'override-1',
      project_id: 'project-1',
      task_id: 'task-2',
      mode: 'manual_attention',
      anchor_type: null,
      left_task_id: null,
      right_task_id: null,
      reason: '管理关注',
      created_by: 'user-1',
      created_at: '2026-04-17T12:00:00.000Z',
      updated_at: '2026-04-17T12:00:00.000Z',
    },
  ],
  getProjectCriticalPathSnapshot: vi.fn(),
  recalculateProjectCriticalPath: vi.fn(),
  listCriticalPathOverrides: vi.fn(),
  createCriticalPathOverride: vi.fn(),
  deleteCriticalPathOverride: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1' }
    next()
  }),
  requireProjectEditor: vi.fn((getProjectId: (req: any) => string) => (req: any, _res: any, next: () => void) => {
    void getProjectId(req)
    next()
  }),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  requestLogger: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../services/projectCriticalPathService.js', () => ({
  getProjectCriticalPathSnapshot: serviceMocks.getProjectCriticalPathSnapshot,
  recalculateProjectCriticalPath: serviceMocks.recalculateProjectCriticalPath,
  listCriticalPathOverrides: serviceMocks.listCriticalPathOverrides,
  createCriticalPathOverride: serviceMocks.createCriticalPathOverride,
  deleteCriticalPathOverride: serviceMocks.deleteCriticalPathOverride,
}))

const { default: criticalPathRouter } = await import('../routes/critical-paths.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects', criticalPathRouter)
  return app
}

describe('critical path override routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serviceMocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      ...serviceMocks.snapshot,
    })
    serviceMocks.recalculateProjectCriticalPath.mockResolvedValue({
      projectId: 'project-1',
      snapshot: {
        ...serviceMocks.snapshot,
        generatedAt: '2026-04-17T12:05:00.000Z',
      },
    })
    serviceMocks.listCriticalPathOverrides.mockResolvedValue([...serviceMocks.overrides])
    serviceMocks.createCriticalPathOverride.mockImplementation(async (projectId: string, body: any) => ({
      id: 'override-new',
      project_id: projectId,
      task_id: body.task_id,
      mode: body.mode,
      anchor_type: body.anchor_type ?? null,
      left_task_id: body.left_task_id ?? null,
      right_task_id: body.right_task_id ?? null,
      reason: body.reason ?? null,
      created_by: 'user-1',
      created_at: '2026-04-17T12:10:00.000Z',
      updated_at: '2026-04-17T12:10:00.000Z',
    }))
    serviceMocks.deleteCriticalPathOverride.mockResolvedValue(undefined)
  })

  it('reads the unified critical path snapshot', async () => {
    const response = await supertest(buildApp()).get('/api/projects/project-1/critical-path')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      projectId: 'project-1',
      displayTaskIds: ['task-1', 'task-2'],
    })
    expect(serviceMocks.getProjectCriticalPathSnapshot).toHaveBeenCalledWith('project-1')
  })

  it('refreshes the snapshot through the server truth chain', async () => {
    const response = await supertest(buildApp()).post('/api/projects/project-1/critical-path/refresh')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.generatedAt).toBe('2026-04-17T12:05:00.000Z')
    expect(serviceMocks.recalculateProjectCriticalPath).toHaveBeenCalledWith('project-1')
  })

  it('lists the current override rows', async () => {
    const response = await supertest(buildApp()).get('/api/projects/project-1/critical-path/overrides')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toHaveLength(1)
    expect(response.body.data[0]).toMatchObject({
      id: 'override-1',
      mode: 'manual_attention',
    })
    expect(serviceMocks.listCriticalPathOverrides).toHaveBeenCalledWith('project-1')
  })

  it('creates a manual insert override with the posted payload', async () => {
    const payload = {
      task_id: 'task-3',
      mode: 'manual_insert',
      anchor_type: 'after',
      left_task_id: 'task-2',
      reason: '插到管理关注项后',
    }

    const response = await supertest(buildApp())
      .post('/api/projects/project-1/critical-path/overrides')
      .send(payload)

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      id: 'override-new',
      project_id: 'project-1',
      mode: 'manual_insert',
      left_task_id: 'task-2',
    })
    expect(serviceMocks.createCriticalPathOverride).toHaveBeenCalledWith('project-1', payload)
  })

  it('deletes an override by id', async () => {
    const response = await supertest(buildApp()).delete('/api/projects/project-1/critical-path/overrides/override-1')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(serviceMocks.deleteCriticalPathOverride).toHaveBeenCalledWith('project-1', 'override-1')
  })

  it('rejects invalid override mode before reaching the service', async () => {
    const response = await supertest(buildApp())
      .post('/api/projects/project-1/critical-path/overrides')
      .send({
        task_id: 'task-3',
        mode: 'unsupported-mode',
      })

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error?.code).toBe('VALIDATION_ERROR')
    expect(serviceMocks.createCriticalPathOverride).not.toHaveBeenCalled()
  })
})
