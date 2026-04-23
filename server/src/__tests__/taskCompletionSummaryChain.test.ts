/**
 * 8.4.2 任务完成与任务总结联动验收
 *
 * 目标：验证"任务状态切到完成 -> /api/task-summaries/projects/:id/task-summary"最短链路
 *  1. 任务状态为 completed 时，任务总结接口的完成统计（total_completed）能正确读取到完成数量
 *  2. 任务总结接口结构稳定，返回 stats / groups / timeline_ready
 *  3. 已完成任务的信息（title/assignee）可以在 groups 中读到
 *  4. 零任务时，接口不崩溃且返回 total_completed = 0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── mock ─────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  // 可在测试间动态修改的完成任务列表
  let completedTasks: any[] = []

  const createQuery = (tableData: () => any[]) => {
    const q: any = {
      select: () => q,
      eq: () => q,
      order: () => q,
      in: (field: string, values: any[]) => {
        // 对 status in [...] 进行过滤
        if (field === 'status') {
          return {
            ...q,
            then: (resolve: (v: any) => void, reject: (r: any) => void) =>
              Promise.resolve({ data: tableData().filter((r: any) => values.includes(r.status)), error: null }).then(resolve, reject),
            gte: () => q,
            lte: () => q,
          }
        }
        if (field === 'task_id') {
          return {
            ...q,
            then: (resolve: (v: any) => void, reject: (r: any) => void) =>
              Promise.resolve({ data: [], error: null }).then(resolve, reject),
          }
        }
        return q
      },
      gte: () => q,
      lte: () => q,
      not: () => q,
      limit: () => q,
      then: (resolve: (v: any) => void, reject: (r: any) => void) =>
        Promise.resolve({ data: tableData(), error: null }).then(resolve, reject),
    }
    return q
  }

  return {
    get completedTasks() {
      return completedTasks
    },
    setCompletedTasks(tasks: any[]) {
      completedTasks = tasks
    },
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'tasks') return createQuery(() => completedTasks)
        if (table === 'milestones') return createQuery(() => [])
        if (table === 'task_milestones') return createQuery(() => [])
        return createQuery(() => [])
      }),
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
  supabase: mocks.supabase,
  SupabaseService: vi.fn(),
  executeSQL: vi.fn(async () => []),
  executeSQLOne: vi.fn(async () => null),
  getProject: vi.fn(),
  getProjects: vi.fn(async () => []),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  getRisks: vi.fn(async () => []),
  getRisk: vi.fn(),
  createRisk: vi.fn(),
  updateRisk: vi.fn(),
  deleteRisk: vi.fn(),
  getTasks: vi.fn(async () => []),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getMilestones: vi.fn(async () => []),
  getMilestone: vi.fn(),
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  getMembers: vi.fn(async () => []),
  createMember: vi.fn(),
  updateMember: vi.fn(),
  deleteMember: vi.fn(),
  getInvitations: vi.fn(async () => []),
  createInvitation: vi.fn(),
  updateInvitation: vi.fn(),
  deleteInvitation: vi.fn(),
  validateInvitation: vi.fn(),
}))

vi.mock('../services/taskTimelineService.js', () => ({
  getProjectTimelineEvents: mocks.getProjectTimelineEvents,
  isTaskTimelineEventStoreReady: mocks.isTaskTimelineEventStoreReady,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

// ── 测试 ─────────────────────────────────────────────────────────────────────

import { request } from './testSetup.js'

const projectId = '44444444-4444-4444-8444-444444444444'

describe('task completion -> task summary chain (8.4.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setCompletedTasks([])
    mocks.isTaskTimelineEventStoreReady.mockResolvedValue(false)
    mocks.getProjectTimelineEvents.mockResolvedValue([])
    // 重置 supabase.from 以使用最新的 completedTasks
    mocks.supabase.from.mockImplementation((table: string) => {
      const createQ = (tableData: () => any[]) => {
        const q: any = {
          select: () => q,
          eq: () => q,
          order: () => q,
          in: (field: string, values: any[]) => {
            if (field === 'status') {
              return {
                ...q,
                then: (resolve: (v: any) => void, _reject: (r: any) => void) =>
                  Promise.resolve({
                    data: tableData().filter((r: any) => values.includes(r.status)),
                    error: null,
                  }).then(resolve, _reject),
                gte: () => q,
                lte: () => q,
              }
            }
            if (field === 'task_id') {
              return {
                ...q,
                then: (resolve: (v: any) => void, _reject: (r: any) => void) =>
                  Promise.resolve({ data: [], error: null }).then(resolve, _reject),
              }
            }
            return q
          },
          gte: () => q,
          lte: () => q,
          not: () => q,
          limit: () => q,
          then: (resolve: (v: any) => void, _reject: (r: any) => void) =>
            Promise.resolve({ data: tableData(), error: null }).then(resolve, _reject),
        }
        return q
      }
      if (table === 'tasks') return createQ(() => mocks.completedTasks)
      return createQ(() => [])
    })
  })

  it('returns total_completed = 0 when no tasks are completed', async () => {
    const res = await request.get(`/api/task-summaries/projects/${projectId}/task-summary`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.stats.total_completed).toBe(0)
    expect(Array.isArray(res.body.data.groups)).toBe(true)
    expect(res.body.data.timeline_ready).toBe(false)
  })

  it('total_completed increases when a task status is set to completed', async () => {
    // 模拟任务完成后的状态
    mocks.setCompletedTasks([
      {
        id: 'task-done-1',
        title: '主体结构施工',
        assignee: '张三',
        assignee_unit: '总包',
        status: 'completed',
        start_date: '2026-04-01',
        end_date: '2026-04-10',
        progress: 100,
        is_milestone: false,
        updated_at: '2026-04-10T08:00:00.000Z',
        project_id: projectId,
      },
    ])

    const res = await request.get(`/api/task-summaries/projects/${projectId}/task-summary`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.stats.total_completed).toBe(1)
  })

  it('completed task information is accessible in groups', async () => {
    mocks.setCompletedTasks([
      {
        id: 'task-done-2',
        title: '地基开挖作业',
        assignee: '李四',
        assignee_unit: '分包A',
        status: 'completed',
        start_date: '2026-03-15',
        end_date: '2026-03-25',
        progress: 100,
        is_milestone: false,
        updated_at: '2026-03-25T17:00:00.000Z',
        project_id: projectId,
      },
    ])

    const res = await request.get(`/api/task-summaries/projects/${projectId}/task-summary`)
    expect(res.status).toBe(200)
    const { stats, groups } = res.body.data
    expect(stats.total_completed).toBe(1)
    expect(Array.isArray(groups)).toBe(true)
    // groups 中应包含已完成任务
    const allTasks = groups.flatMap((g: any) => g.tasks ?? [])
    const found = allTasks.find((t: any) => t.id === 'task-done-2' || t.title === '地基开挖作业')
    expect(found).toBeTruthy()
  })

  it('task summary page entry remains accessible (stable response structure)', async () => {
    const res = await request.get(`/api/task-summaries/projects/${projectId}/task-summary`)
    expect(res.status).toBe(200)
    // 稳定结构字段
    expect(res.body).toHaveProperty('success', true)
    expect(res.body.data).toHaveProperty('stats')
    expect(res.body.data).toHaveProperty('groups')
    expect(res.body.data).toHaveProperty('timeline_ready')
    expect(res.body.data).toHaveProperty('timeline_events')
    // stats 子字段
    expect(res.body.data.stats).toHaveProperty('total_completed')
    expect(typeof res.body.data.stats.total_completed).toBe('number')
  })
})
