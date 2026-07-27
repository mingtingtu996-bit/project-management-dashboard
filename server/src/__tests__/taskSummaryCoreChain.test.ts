import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const queryResults = {
    milestones: {
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          title: '主体封顶',
          status: 'active',
          target_date: '2026-05-01',
          completed_at: null,
        },
      ],
      error: null,
    },
    tasks: {
      data: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          title: '主体结构施工',
          assignee: '寮犱笁',
          assignee_unit: '总包',
          status: 'completed',
          start_date: '2026-04-01',
          end_date: '2026-04-10',
          progress: 100,
          is_milestone: false,
          updated_at: '2026-04-10T08:00:00.000Z',
        },
      ],
      error: null,
    },
    task_milestones: {
      data: [
        {
          task_id: '22222222-2222-4222-8222-222222222222',
          milestone_id: '11111111-1111-4111-8111-111111111111',
        },
      ],
      error: null,
    },
    monthly_plans: {
      data: [],
      error: null,
    },
    monthly_plan_items: {
      data: [],
      error: null,
    },
    participant_units: {
      data: [],
      error: null,
    },
  }

  const createQuery = (table: keyof typeof queryResults) => {
    const query: any = {
      select: () => query,
      eq: () => query,
      order: () => query,
      in: () => query,
      gte: () => query,
      lte: () => query,
      not: () => query,
      limit: () => query,
      single: () => query,
      then: (resolve: (value: any) => void, reject: (reason?: any) => void) =>
        Promise.resolve(queryResults[table] ?? { data: [], error: null }).then(resolve, reject),
    }
    return query
  }

  return {
    queryResults,
    supabase: {
      from: (table: string) => createQuery(table as keyof typeof queryResults),
    },
    getProjectTimelineEvents: vi.fn(),
    isTaskTimelineEventStoreReady: vi.fn(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  registerDbServiceBusinessSideEffectAdapters: vi.fn(),
  assertDbServiceBusinessSideEffectAdaptersRegistered: vi.fn(),
  supabase: mocks.supabase,
  SupabaseService: vi.fn(),
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
  getProject: vi.fn(),
  getProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  getRisks: vi.fn(),
  getRisk: vi.fn(),
  createRisk: vi.fn(),
  updateRisk: vi.fn(),
  deleteRisk: vi.fn(),
  getTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getMilestones: vi.fn(),
  getMilestone: vi.fn(),
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  getMembers: vi.fn(),
  createMember: vi.fn(),
  updateMember: vi.fn(),
  deleteMember: vi.fn(),
  getInvitations: vi.fn(),
  createInvitation: vi.fn(),
  updateInvitation: vi.fn(),
  deleteInvitation: vi.fn(),
  validateInvitation: vi.fn(),
}))

vi.mock('../services/taskTimelineService.js', () => ({
  getProjectTimelineEvents: mocks.getProjectTimelineEvents,
  isTaskTimelineEventStoreReady: mocks.isTaskTimelineEventStoreReady,
}))

vi.mock('../auth/access.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../auth/access.js')>(),
  getProjectPermissionLevel: vi.fn(async () => 'owner'),
}))

vi.mock('../database.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../database.js')>(),
  query: vi.fn(async (sql: string) => ({
    rows: /FROM public\.projects/i.test(String(sql)) ? [{ id: projectId }] : [],
  })),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import { request } from './testSetup.js'

const projectId = '33333333-3333-4333-8333-333333333333'

describe('task-summary core chain validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isTaskTimelineEventStoreReady.mockResolvedValue(true)
    mocks.getProjectTimelineEvents.mockResolvedValue([
      {
        id: 'evt-1',
        kind: 'task',
        title: 'task completed',
        description: '任务完成后写入的持久化时间线事件',
        occurredAt: '2026-04-10T08:00:00.000Z',
        taskId: '22222222-2222-4222-8222-222222222222',
        statusLabel: 'completed',
      },
    ])
  })

  it('returns persisted timeline events when the timeline store is ready', async () => {
    const response = await request.get(`/api/task-summaries/projects/${projectId}/task-summary?date_from=2026-04-01`)

    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.timeline_ready).toBe(true)
    expect(response.body.data.timeline_events).toHaveLength(1)
    expect(response.body.data.stats.total_completed).toBe(1)
    expect(mocks.getProjectTimelineEvents).toHaveBeenCalledWith(projectId)
  })

  it('keeps the timeline empty when the store probe is not ready', async () => {
    mocks.isTaskTimelineEventStoreReady.mockResolvedValueOnce(false)

    const response = await request.get(`/api/task-summaries/projects/${projectId}/task-summary?date_from=2026-05-01`)

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.timeline_ready).toBe(false)
    expect(response.body.data.timeline_events).toEqual([])
    expect(mocks.getProjectTimelineEvents).not.toHaveBeenCalled()
  })
})
