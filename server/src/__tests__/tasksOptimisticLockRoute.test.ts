import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  supabaseService: {
    getTask: vi.fn(),
  },
  updateTaskInMainChain: vi.fn(),
  executeSQL: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1' }
    next()
  }),
  requireProjectEditor: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  requireProjectMember: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
}))

vi.mock('../middleware/validation.js', () => ({
  validate: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  validateIdParam: vi.fn((_req: any, _res: any, next: () => void) => next()),
  taskSchema: {},
  taskUpdateSchema: {},
  validateTaskDateWindow: vi.fn(() => ({
    valid: true,
    issues: [],
  })),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../services/supabaseService.js', () => ({
  SupabaseService: vi.fn().mockImplementation(() => mocks.supabaseService),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('../services/taskWriteChainService.js', () => ({
  createTaskInMainChain: vi.fn(),
  updateTaskInMainChain: mocks.updateTaskInMainChain,
  closeTaskInMainChain: vi.fn(),
  reopenTaskInMainChain: vi.fn(),
}))

vi.mock('../services/requestBudgetService.js', () => ({
  REQUEST_TIMEOUT_BUDGETS: {},
  runWithRequestBudget: vi.fn(async (_budget: unknown, fn: () => Promise<unknown>) => fn()),
}))

const { default: tasksRouter } = await import('../routes/tasks.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/tasks', tasksRouter)
  return app
}

function buildTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    project_id: 'project-1',
    title: 'Initial task',
    status: 'todo',
    progress: 0,
    version: 1,
    planned_start_date: '2026-04-20',
    planned_end_date: '2026-04-25',
    start_date: null,
    end_date: null,
    participant_unit_id: null,
    participant_unit_name: null,
    responsible_unit: null,
    assignee_unit: null,
    ...overrides,
  }
}

describe('tasks optimistic lock route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.executeSQL.mockResolvedValue([])
    mocks.supabaseService.getTask.mockResolvedValue(buildTask())
  })

  it('forwards the provided version into the main write chain', async () => {
    mocks.updateTaskInMainChain.mockResolvedValue({
      task: buildTask({
        title: 'Updated task',
        version: 2,
        updated_by: 'user-1',
      }),
      participantUnit: null,
    })

    const response = await supertest(buildApp())
      .put('/api/tasks/task-1')
      .send({
        title: 'Updated task',
        version: 1,
      })

    expect(response.status).toBe(200)
    expect(mocks.updateTaskInMainChain).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        title: 'Updated task',
        updated_by: 'user-1',
      }),
      1,
    )
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: 'task-1',
        version: 2,
        title: 'Updated task',
      },
    })
  })

  it('returns 409 when the task main chain reports VERSION_MISMATCH', async () => {
    mocks.updateTaskInMainChain.mockRejectedValue(
      new Error('VERSION_MISMATCH: 该任务已被他人修改，请刷新后重试'),
    )

    const response = await supertest(buildApp())
      .put('/api/tasks/task-1')
      .send({
        title: 'Stale task',
        version: 1,
      })

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'VERSION_MISMATCH',
      },
    })
  })
})
