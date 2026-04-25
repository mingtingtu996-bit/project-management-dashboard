/**
 * 8.4.1 项目创建与共享摘要联动验收
 *
 * 目标：验证"项目数据 -> /api/dashboard/projects-summary"最短链路
 *  1. 项目列表增加时，共享摘要结果中项目总数随之增加
 *  2. 摘要结果返回稳定结构，不因缺省字段导致接口异常（number 字段不为 undefined）
 *  3. 新项目进入摘要后，摘要列表中能读到该项目名称
 *
 * 注：POST /api/projects 需认证（Bearer test-auth-token），此文件聚焦
 *     dashboard 路由（无认证要求）与 service 层，不重复测试 projects 路由自身。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── mock 定义 ────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  // 可在测试间动态变更的项目列表
  let projectList: any[] = []

  return {
    get projectList() {
      return projectList
    },
    setProjectList(list: any[]) {
      projectList = list
    },
    dbService: {
      getProjects: vi.fn(async () => projectList),
      getProject: vi.fn(async (id: string) => projectList.find((p: any) => p.id === id) ?? null),
      getTasks: vi.fn(async () => []),
      getRisks: vi.fn(async () => []),
      executeSQL: vi.fn(async (query?: string) => {
        const sql = String(query ?? '').toLowerCase()
        if (sql.includes('from projects')) return projectList
        return []
      }),
      executeSQLOne: vi.fn(async () => null),
      createProject: vi.fn(),
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
      supabase: {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: vi.fn((resolve: any) => resolve({ data: [], error: null })),
        })),
      },
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    calculateProjectHealth: vi.fn(async () => ({
      score: 88,
      details: {
        dataIntegrityScore: 90,
        mappingIntegrityScore: 85,
        systemConsistencyScore: 88,
        milestoneIntegrityScore: 89,
        passiveReorderPenalty: 0,
        totalScore: 88,
        healthStatus: '健康',
      },
    })),
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: mocks.dbService.supabase,
  SupabaseService: vi.fn(),
  executeSQL: mocks.dbService.executeSQL,
  executeSQLOne: mocks.dbService.executeSQLOne,
  getProject: mocks.dbService.getProject,
  getProjects: mocks.dbService.getProjects,
  createProject: mocks.dbService.createProject,
  updateProject: mocks.dbService.updateProject,
  deleteProject: mocks.dbService.deleteProject,
  getRisks: mocks.dbService.getRisks,
  getRisk: vi.fn(),
  createRisk: vi.fn(),
  updateRisk: vi.fn(),
  deleteRisk: vi.fn(),
  getTasks: mocks.dbService.getTasks,
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

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

vi.mock('../services/projectHealthService.js', () => ({
  calculateProjectHealth: mocks.calculateProjectHealth,
}))

// ── 测试 ─────────────────────────────────────────────────────────────────────

import { request } from './testSetup.js'

describe('project creation -> shared summary chain (8.4.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setProjectList([])
    mocks.dbService.getProjects.mockImplementation(async () => mocks.projectList)
    mocks.dbService.getTasks.mockResolvedValue([])
    mocks.dbService.getRisks.mockResolvedValue([])
    mocks.dbService.executeSQL.mockImplementation(async (query?: string) => {
      const sql = String(query ?? '').toLowerCase()
      if (sql.includes('from projects')) return mocks.projectList
      return []
    })
    mocks.calculateProjectHealth.mockResolvedValue({
      score: 88,
      details: {
        dataIntegrityScore: 90,
        mappingIntegrityScore: 85,
        systemConsistencyScore: 88,
        milestoneIntegrityScore: 89,
        passiveReorderPenalty: 0,
        totalScore: 88,
        healthStatus: '健康',
      },
    })
  })

  it('shared summary returns empty list when no projects exist', async () => {
    const res = await request.get('/api/dashboard/projects-summary')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data).toHaveLength(0)
  })

  it('shared summary includes new project after it is added and returns stable structure', async () => {
    // 模拟项目创建后数据层已有新项目
    mocks.setProjectList([
      {
        id: 'proj-8-4-1',
        name: '8.4.1联动验收项目',
        description: '项目创建后应出现在共享摘要中',
        status: 'active',
        version: 1,
      },
    ])

    const summaryRes = await request.get('/api/dashboard/projects-summary')
    expect(summaryRes.status).toBe(200)
    expect(summaryRes.body.success).toBe(true)
    expect(Array.isArray(summaryRes.body.data)).toBe(true)
    expect(summaryRes.body.data).toHaveLength(1)

    const summary = summaryRes.body.data[0]
    // 验证稳定结构字段存在
    expect(summary).toHaveProperty('id', 'proj-8-4-1')
    expect(summary).toHaveProperty('name', '8.4.1联动验收项目')
    expect(summary).toHaveProperty('status')
    expect(summary).toHaveProperty('totalTasks')
    expect(summary).toHaveProperty('completedTaskCount')
    expect(summary).toHaveProperty('overallProgress')
    expect(summary).toHaveProperty('healthScore')
    // 确认数值型字段不为 undefined（缺省字段不导致渲染失败）
    expect(typeof summary.totalTasks).toBe('number')
    expect(typeof summary.overallProgress).toBe('number')
    expect(typeof summary.healthScore).toBe('number')
    // 名称可读取
    expect(
      summaryRes.body.data.map((s: any) => s.name),
    ).toContain('8.4.1联动验收项目')
  })

  it('summary project count increases as more projects are added', async () => {
    // 0 个项目
    let summaryRes = await request.get('/api/dashboard/projects-summary')
    expect(summaryRes.body.data).toHaveLength(0)

    // 增加第 1 个项目
    mocks.setProjectList([{ id: 'p1', name: '联动项目A', status: 'active', version: 1 }])
    summaryRes = await request.get('/api/dashboard/projects-summary')
    expect(summaryRes.body.data).toHaveLength(1)

    // 增加第 2 个项目
    mocks.setProjectList([
      { id: 'p1', name: '联动项目A', status: 'active', version: 1 },
      { id: 'p2', name: '联动项目B', status: 'active', version: 1 },
    ])
    summaryRes = await request.get('/api/dashboard/projects-summary')
    expect(summaryRes.body.data).toHaveLength(2)

    // 两个项目名称都在摘要中
    const names = summaryRes.body.data.map((s: any) => s.name)
    expect(names).toContain('联动项目A')
    expect(names).toContain('联动项目B')
  })
})
