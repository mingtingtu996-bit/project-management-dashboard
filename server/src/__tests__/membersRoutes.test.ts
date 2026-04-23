import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  projectMembers: [] as Array<Record<string, any>>,
  users: [] as Array<Record<string, any>>,
  tasks: [] as Array<Record<string, any>>,
}))

function createSelectBuilder(table: 'project_members' | 'users' | 'tasks') {
  const filters: Array<{ type: 'eq' | 'is'; field: string; value: unknown }> = []

  const applyFilters = () => {
    const source = table === 'project_members' ? state.projectMembers : table === 'users' ? state.users : state.tasks
    return source.filter((row) =>
      filters.every((filter) => {
        if (filter.type === 'eq') return row[filter.field] === filter.value
        return row[filter.field] === filter.value
      }),
    )
  }

  const builder: any = {
    eq(field: string, value: unknown) {
      filters.push({ type: 'eq', field, value })
      return builder
    },
    is(field: string, value: unknown) {
      filters.push({ type: 'is', field, value })
      return builder
    },
    single: vi.fn(async () => ({ data: applyFilters()[0] ?? null, error: null })),
    order: vi.fn(async () => ({ data: applyFilters(), error: null })),
    then(onFulfilled: (value: { data: Array<Record<string, any>>; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: applyFilters(), error: null }).then(onFulfilled, onRejected)
    },
  }

  return builder
}

function createUpdateBuilder(table: 'project_members' | 'projects') {
  return {
    eq: vi.fn(async (field: string, value: unknown) => {
      if (table === 'project_members') {
        state.projectMembers = state.projectMembers.map((row) =>
          row[field] === value ? { ...row, ...createUpdateBuilder.pendingFields } : row,
        )
      }
      return { error: null }
    }),
  }
}

createUpdateBuilder.pendingFields = {} as Record<string, unknown>

const mocks = vi.hoisted(() => ({
  getProjectPermissionLevel: vi.fn(async (userId: string) => (userId === 'user-1' ? 'owner' : 'editor')),
  getAuthUserByUsername: vi.fn(async (username: string) => state.users.find((user) => user.username === username) ?? null),
  updateTaskRecord: vi.fn(async (taskId: string, updates: Record<string, unknown>) => {
    state.tasks = state.tasks.map((task) => (task.id === taskId ? { ...task, ...updates } : task))
    return state.tasks.find((task) => task.id === taskId) ?? null
  }),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'company_admin' }
    next()
  }),
}))

vi.mock('../auth/access.js', () => ({
  getProjectPermissionLevel: mocks.getProjectPermissionLevel,
  isCompanyAdminRole: (value?: string | null) => String(value ?? '').trim().toLowerCase() === 'company_admin',
  normalizeProjectPermissionLevel: (value?: string | null) => {
    const normalized = String(value ?? '').trim().toLowerCase()
    if (normalized === 'owner' || normalized === 'editor' || normalized === 'viewer') return normalized
    return 'viewer'
  },
}))

vi.mock('../auth/session.js', () => ({
  getAuthUserByUsername: mocks.getAuthUserByUsername,
  mapLegacyRoleToGlobalRole: (value?: string | null) => (value === 'company_admin' ? 'company_admin' : 'regular'),
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'project_members') {
        return {
          select: vi.fn(() => createSelectBuilder('project_members')),
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            state.projectMembers.push({ id: 'member-new', ...payload })
            return { error: null }
          }),
          update: vi.fn((fields: Record<string, unknown>) => {
            createUpdateBuilder.pendingFields = fields
            return createUpdateBuilder('project_members')
          }),
        }
      }

      if (table === 'users') {
        return {
          select: vi.fn(() => createSelectBuilder('users')),
        }
      }

      if (table === 'tasks') {
        return {
          select: vi.fn(() => createSelectBuilder('tasks')),
        }
      }

      if (table === 'projects') {
        return {
          update: vi.fn((fields: Record<string, unknown>) => {
            createUpdateBuilder.pendingFields = fields
            return createUpdateBuilder('projects')
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  },
  updateTask: mocks.updateTaskRecord,
}))

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api/members', router)
  return app
}

describe('members routes - assignee linking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.users = [
      { id: 'user-1', username: 'owner', display_name: '项目负责人', role: 'company_admin', global_role: 'company_admin' },
      { id: 'user-2', username: 'lisi', display_name: '李四', role: 'regular', global_role: 'regular' },
    ]
    state.projectMembers = [
      {
        id: 'member-owner',
        project_id: 'project-1',
        user_id: 'user-1',
        permission_level: 'owner',
        joined_at: '2026-04-18T00:00:00.000Z',
        is_active: true,
        users: state.users[0],
      },
    ]
    state.tasks = [
      { id: 'task-1', project_id: 'project-1', title: '主体结构验收', assignee_name: '李四', assignee_user_id: null },
      { id: 'task-2', project_id: 'project-1', title: '机电样板确认', assignee_name: '李四', assignee_user_id: null },
      { id: 'task-3', project_id: 'project-1', title: '总包巡检', assignee_name: '王五', assignee_user_id: null },
    ]
  })

  it('returns grouped unlinked assignees for project owners', async () => {
    const { default: router } = await import('../routes/members.js')
    const response = await request(buildApp(router)).get('/api/members/project-1/unlinked-assignees')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      data: [
        expect.objectContaining({ assigneeName: '李四', taskCount: 2 }),
        expect.objectContaining({ assigneeName: '王五', taskCount: 1 }),
      ],
    })
  })

  it('links all tasks for the selected assignee name to a project member', async () => {
    state.projectMembers.push({
      id: 'member-lisi',
      project_id: 'project-1',
      user_id: 'user-2',
      permission_level: 'editor',
      joined_at: '2026-04-18T01:00:00.000Z',
      is_active: true,
      users: state.users[1],
    })

    const { default: router } = await import('../routes/members.js')
    const response = await request(buildApp(router))
      .post('/api/members/project-1/link-assignee')
      .send({ assigneeName: '李四', userId: 'user-2' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      linkedTaskCount: 2,
    })
    expect(mocks.updateTaskRecord).toHaveBeenCalledTimes(2)
    expect(state.tasks.filter((task) => task.assignee_user_id === 'user-2')).toHaveLength(2)
  })

  it('returns suggested matches when a newly added member matches unlinked assignee names', async () => {
    const { default: router } = await import('../routes/members.js')
    const response = await request(buildApp(router))
      .post('/api/members/project-1')
      .send({ username: 'lisi', permission_level: 'editor' })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      suggestedMatches: [
        expect.objectContaining({ assigneeName: '李四', taskCount: 2 }),
      ],
    })
  })

  it('returns viewer access for company admins outside the project', async () => {
    mocks.getProjectPermissionLevel.mockResolvedValueOnce(null)

    const { default: router } = await import('../routes/members.js')
    const response = await request(buildApp(router)).get('/api/members/project-1/me')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      data: {
        projectId: 'project-1',
        permissionLevel: 'viewer',
        globalRole: 'company_admin',
        canManageTeam: false,
        canEdit: false,
      },
    })
  })
})
