import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const baselineRows: Row[] = []

  const supabaseDb = {
    from: vi.fn((table: string) => {
      if (table !== 'task_baseline_items') {
        throw new Error(`Unexpected table access: ${table}`)
      }

      let filters: Array<{ column: string; value: any }> = []
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: any) => {
          filters.push({ column, value })
          return builder
        }),
        then: (resolve: (value: any) => void, reject: (reason?: any) => void) =>
          Promise.resolve().then(() => ({
            data: baselineRows
              .filter((row) => filters.every((filter) => row[filter.column] === filter.value))
              .map((row) => ({ ...row })),
            error: null,
          })).then(resolve, reject),
      }
      return builder
    }),
  }

  return {
    baselineRows,
    executeSQL: vi.fn(async (sql: string) => {
      if (sql.includes('FROM participant_units WHERE id IN')) {
        return [{ id: 'unit-1', unit_name: '总包单位' }]
      }
      return []
    }),
    supabaseDb,
    supabaseService: {
      getTask: vi.fn(),
      getTasks: vi.fn(async () => []),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: any, _res: any, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  requireProjectMember: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
}))

vi.mock('../middleware/validation.js', () => ({
  validate: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  validateIdParam: vi.fn((_req: any, _res: any, next: () => void) => next()),
  taskSchema: {},
  taskUpdateSchema: {},
  validateTaskDateWindow: vi.fn(() => true),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../services/supabaseService.js', () => ({
  SupabaseService: vi.fn().mockImplementation(() => mocks.supabaseService),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  supabase: mocks.supabaseDb,
}))

vi.mock('../services/taskWriteChainService.js', () => ({
  closeTaskInMainChain: vi.fn(),
  createTaskInMainChain: vi.fn(),
  reopenTaskInMainChain: vi.fn(),
  updateTaskInMainChain: vi.fn(),
}))

vi.mock('../services/requestBudgetService.js', () => ({
  REQUEST_TIMEOUT_BUDGETS: {
    batchWriteMs: 1000,
  },
  runWithRequestBudget: vi.fn(async (_budget: unknown, task: () => Promise<unknown>) => task()),
}))

const { default: tasksRouter } = await import('../routes/tasks.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/tasks', tasksRouter)
  return app
}

describe('tasks timeline projection route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.baselineRows.splice(0, mocks.baselineRows.length, {
      source_task_id: 'task-1',
      baseline_version_id: 'baseline-1',
      planned_start_date: '2026-03-28',
      planned_end_date: '2026-04-03',
      is_baseline_critical: true,
    })
    mocks.supabaseService.getTasks.mockResolvedValue([
      {
        id: 'task-2',
        project_id: 'project-1',
        title: '主体结构',
        status: 'in_progress',
        priority: 'medium',
        start_date: '2026-04-10',
        end_date: '2026-04-15',
        sort_order: 2,
        progress: 25,
        participant_unit_id: null,
        responsible_unit: '机电部',
        assignee_unit: null,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
        version: 1,
      },
      {
        id: 'task-1',
        project_id: 'project-1',
        title: '基础施工',
        status: 'in_progress',
        priority: 'high',
        start_date: '2026-04-01',
        end_date: '2026-04-05',
        sort_order: 1,
        progress: 50,
        participant_unit_id: 'unit-1',
        responsible_unit: null,
        assignee_unit: null,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
        version: 1,
      },
    ])
  })

  it('returns stable timeline projection fields on the shared tasks resource', async () => {
    const response = await supertest(buildApp())
      .get('/api/tasks')
      .query({
        projectId: 'project-1',
        timeline_projection: 'true',
        baseline_version_id: 'baseline-1',
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.map((task: any) => task.id)).toEqual(['task-1', 'task-2'])
    expect(response.body.data[0]).toMatchObject({
      id: 'task-1',
      participant_unit_name: '总包单位',
      baseline_start: '2026-03-28',
      baseline_end: '2026-04-03',
      baseline_is_critical: true,
    })
    expect(response.body.data[1]).toMatchObject({
      id: 'task-2',
      baseline_start: null,
      baseline_end: null,
      baseline_is_critical: null,
    })
  })
})
