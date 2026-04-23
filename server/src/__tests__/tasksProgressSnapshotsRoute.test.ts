import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {
    tasks: [],
    task_progress_snapshots: [],
  }

  const supabaseDb = {
    from: vi.fn((table: string) => {
      let filters: Array<{ kind: 'eq' | 'in'; column: string; value: any }> = []
      const orders: Array<{ column: string; ascending: boolean }> = []

      const matches = (row: Row) => filters.every((filter) => {
        if (filter.kind === 'eq') return row[filter.column] === filter.value
        return Array.isArray(filter.value) ? filter.value.includes(row[filter.column]) : false
      })

      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: any) => {
          filters.push({ kind: 'eq', column, value })
          return builder
        }),
        in: vi.fn((column: string, value: any[]) => {
          filters.push({ kind: 'in', column, value })
          return builder
        }),
        order: vi.fn((column: string, options?: { ascending?: boolean }) => {
          orders.push({ column, ascending: options?.ascending !== false })
          return builder
        }),
        then: (resolve: (value: any) => void, reject: (reason?: any) => void) =>
          Promise.resolve().then(() => {
            let data = (tables[table] ?? []).filter(matches).map((row) => ({ ...row }))
            for (const order of [...orders].reverse()) {
              data = data.sort((left, right) => {
                const leftValue = left[order.column]
                const rightValue = right[order.column]
                if (leftValue === rightValue) return 0
                if (leftValue == null) return order.ascending ? -1 : 1
                if (rightValue == null) return order.ascending ? 1 : -1
                return order.ascending
                  ? String(leftValue).localeCompare(String(rightValue))
                  : String(rightValue).localeCompare(String(leftValue))
              })
            }
            return { data, error: null }
          }).then(resolve, reject),
      }

      return builder
    }),
  }

  return {
    tables,
    supabaseDb,
    supabaseService: {
      getTask: vi.fn(),
    },
    executeSQL: vi.fn(),
    getMembers: vi.fn(async () => []),
    reopenTask: vi.fn(),
    updateTaskRecord: vi.fn(),
    warningEvaluate: vi.fn(async () => undefined),
    passiveReorderDetection: vi.fn(async () => undefined),
    enqueueProjectHealthUpdate: vi.fn(async () => undefined),
    persistNotification: vi.fn(async () => undefined),
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
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../services/supabaseService.js', () => ({
  SupabaseService: vi.fn().mockImplementation(() => mocks.supabaseService),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  getMembers: mocks.getMembers,
  reopenTask: mocks.reopenTask,
  supabase: mocks.supabaseDb,
  updateTask: mocks.updateTaskRecord,
}))

vi.mock('../services/warningService.js', () => ({
  WarningService: vi.fn().mockImplementation(() => ({
    evaluate: mocks.warningEvaluate,
  })),
}))

vi.mock('../services/systemAnomalyService.js', () => ({
  SystemAnomalyService: vi.fn().mockImplementation(() => ({
    enqueuePassiveReorderDetection: mocks.passiveReorderDetection,
  })),
}))

vi.mock('../services/projectHealthService.js', () => ({
  enqueueProjectHealthUpdate: mocks.enqueueProjectHealthUpdate,
}))

vi.mock('../services/warningChainService.js', () => ({
  persistNotification: mocks.persistNotification,
}))

const { default: tasksRouter } = await import('../routes/tasks.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/tasks', tasksRouter)
  return app
}

describe('tasks progress snapshots route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tables.tasks = [
      { id: 'task-1', project_id: 'project-1' },
      { id: 'task-2', project_id: 'project-1' },
    ]
    mocks.tables.task_progress_snapshots = [
      { id: 'snapshot-1', task_id: 'task-1', snapshot_date: '2026-04-18', created_at: '2026-04-18T08:00:00.000Z', progress: 45 },
      { id: 'snapshot-2', task_id: 'task-1', snapshot_date: '2026-04-18', created_at: '2026-04-18T07:00:00.000Z', progress: 30 },
      { id: 'snapshot-3', task_id: 'task-2', snapshot_date: '2026-04-17', created_at: '2026-04-18T06:00:00.000Z', progress: 10 },
    ]
  })

  it('serves /progress-snapshots through the static route before /:id', async () => {
    const response = await supertest(buildApp())
      .get('/api/tasks/progress-snapshots')
      .query({ projectId: 'project-1' })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.map((row: any) => row.id)).toEqual([
      'snapshot-1',
      'snapshot-2',
      'snapshot-3',
    ])
    expect(mocks.supabaseService.getTask).not.toHaveBeenCalled()
    expect(mocks.supabaseDb.from).toHaveBeenCalledWith('tasks')
    expect(mocks.supabaseDb.from).toHaveBeenCalledWith('task_progress_snapshots')
  })
})
