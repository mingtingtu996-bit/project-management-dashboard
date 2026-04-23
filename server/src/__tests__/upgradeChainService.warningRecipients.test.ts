import { beforeEach, describe, expect, it, vi } from 'vitest'

type TableRow = Record<string, unknown>

const state = vi.hoisted(() => {
  const notifications: TableRow[] = []
  const tasks: TableRow[] = []
  const getMembers = vi.fn(async () => [] as Array<{ user_id: string; permission_level: string }>)

  function buildNotificationsQuery() {
    const filters: Array<(row: TableRow) => boolean> = []
    let orderColumn: string | null = null
    let ascending = true

    const materialize = () => {
      const rows = [...notifications].filter((row) => filters.every((filter) => filter(row)))
      if (!orderColumn) return rows
      return rows.sort((left, right) => {
        const leftValue = String(left[orderColumn!] ?? '')
        const rightValue = String(right[orderColumn!] ?? '')
        return ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue)
      })
    }

    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? '') === String(value ?? ''))
        return query
      }),
      order: vi.fn((column: string, options?: { ascending?: boolean }) => {
        orderColumn = column
        ascending = options?.ascending !== false
        return query
      }),
      single: vi.fn(async () => {
        const row = materialize()[0]
        if (!row) {
          return { data: null, error: { code: 'PGRST116', message: 'not found' } }
        }
        return { data: row, error: null }
      }),
      insert: vi.fn(async (row: TableRow) => {
        notifications.push({ ...row })
        return { data: null, error: null }
      }),
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
      then: (resolve: (value: { data: TableRow[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: materialize(), error: null })),
    }

    return query
  }

  function buildTasksQuery() {
    const filters: Array<(row: TableRow) => boolean> = []

    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? '') === String(value ?? ''))
        return query
      }),
      single: vi.fn(async () => {
        const row = tasks.find((item) => filters.every((filter) => filter(item)))
        if (!row) {
          return { data: null, error: { code: 'PGRST116', message: 'not found' } }
        }
        return { data: row, error: null }
      }),
    }

    return query
  }

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'notifications') return buildNotificationsQuery()
      if (table === 'tasks') return buildTasksQuery()
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  return { notifications, tasks, getMembers, supabase }
})

vi.mock('../services/dbService.js', () => ({
  createIssue: vi.fn(),
  getIssue: vi.fn(),
  getMembers: state.getMembers,
  getRisk: vi.fn(),
  supabase: state.supabase,
  updateIssue: vi.fn(),
  updateRisk: vi.fn(),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { syncWarningNotifications } from '../services/upgradeChainService.js'

describe('upgradeChainService critical path delay recipients', () => {
  beforeEach(() => {
    state.notifications.splice(0, state.notifications.length)
    state.tasks.splice(0, state.tasks.length)
    vi.clearAllMocks()
  })

  it('routes info-level critical path delay warnings to the direct task assignee', async () => {
    state.tasks.push({
      id: 'task-1',
      assignee_user_id: 'user-task',
      assignee_id: null,
    })
    state.getMembers.mockResolvedValue([
      { user_id: 'user-owner', permission_level: 'owner' },
    ])

    await syncWarningNotifications([
      {
        id: 'warning-1',
        project_id: 'project-1',
        task_id: 'task-1',
        warning_type: 'critical_path_delay',
        warning_level: 'info',
        title: '关键路径任务已延期 6 天（关注）',
        description: '关键路径任务已超出计划完成日期 6 天',
        is_acknowledged: false,
        created_at: '2026-04-19T08:00:00.000Z',
      },
    ] as any, 'project-1')

    expect(state.notifications).toHaveLength(1)
    expect(state.notifications[0]?.recipients).toEqual(['user-task'])
  })

  it('routes warning-level critical path delay warnings to project owners instead of the task assignee', async () => {
    state.tasks.push({
      id: 'task-2',
      assignee_user_id: 'user-task',
      assignee_id: null,
    })
    state.getMembers.mockResolvedValue([
      { user_id: 'user-owner-1', permission_level: 'owner' },
      { user_id: 'user-owner-2', permission_level: 'owner' },
    ])

    await syncWarningNotifications([
      {
        id: 'warning-2',
        project_id: 'project-1',
        task_id: 'task-2',
        warning_type: 'critical_path_delay',
        warning_level: 'warning',
        title: '关键路径任务已延期 12 天',
        description: '关键路径任务已超出计划完成日期 12 天',
        is_acknowledged: false,
        created_at: '2026-04-19T08:00:00.000Z',
      },
    ] as any, 'project-1')

    expect(state.notifications).toHaveLength(1)
    expect(state.notifications[0]?.recipients).toEqual(['user-owner-1', 'user-owner-2'])
  })
})
