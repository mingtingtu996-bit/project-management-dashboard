import { beforeEach, describe, expect, it, vi } from 'vitest'

type TableRow = Record<string, unknown>

const state = vi.hoisted(() => {
  const tables = {
    tasks: [] as TableRow[],
    weekly_digests: [] as TableRow[],
    project_health_history: [] as TableRow[],
    task_progress_snapshots: [] as TableRow[],
    responsibility_alert_states: [] as TableRow[],
    risks: [] as TableRow[],
    task_obstacles: [] as TableRow[],
  }

  const upserts: TableRow[] = []

  function buildSelectQuery(table: keyof typeof tables) {
    const filters: Array<(row: TableRow) => boolean> = []
    let orderColumn: string | null = null
    let ascending = true
    let limitCount: number | null = null

    const materialize = () => {
      let rows = [...tables[table]].filter((row) => filters.every((filter) => filter(row)))
      if (orderColumn) {
        rows.sort((left, right) => {
          const leftValue = String(left[orderColumn!] ?? '')
          const rightValue = String(right[orderColumn!] ?? '')
          return ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue)
        })
      }
      if (typeof limitCount === 'number') {
        rows = rows.slice(0, limitCount)
      }
      return rows
    }

    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? '') === String(value ?? ''))
        return query
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        const allowed = new Set(values.map((value) => String(value ?? '')))
        filters.push((row) => allowed.has(String(row[column] ?? '')))
        return query
      }),
      gte: vi.fn((column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? '') >= String(value ?? ''))
        return query
      }),
      lt: vi.fn((column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? '') < String(value ?? ''))
        return query
      }),
      neq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? '') !== String(value ?? ''))
        return query
      }),
      not: vi.fn((column: string, operator: string, value: unknown) => {
        if (operator === 'is' && value === null) {
          filters.push((row) => row[column] !== null && row[column] !== undefined && String(row[column] ?? '').trim() !== '')
        }
        return query
      }),
      order: vi.fn((column: string, options?: { ascending?: boolean }) => {
        orderColumn = column
        ascending = options?.ascending !== false
        return query
      }),
      limit: vi.fn((value: number) => {
        limitCount = value
        return query
      }),
      then: (resolve: (value: { data: TableRow[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: materialize(), error: null })),
    }

    return query
  }

  const supabase = {
    from: vi.fn((table: keyof typeof tables | 'weekly_digests') => {
      if (table === 'weekly_digests') {
        const query = buildSelectQuery('weekly_digests')
        return {
          ...query,
          upsert: vi.fn(async (row: TableRow) => {
            upserts.push({ ...row })
            tables.weekly_digests.push({ ...row })
            return { data: null, error: null }
          }),
        }
      }
      return buildSelectQuery(table as keyof typeof tables)
    }),
  }

  const executeSQL = vi.fn(async (sql: string) => {
    if (sql.includes('FROM tasks')) {
      return tables.tasks.map((row) => ({ ...row }))
    }
    if (sql.includes('FROM task_critical_overrides')) {
      return []
    }
    return []
  })

  return { tables, upserts, supabase, executeSQL }
})

vi.mock('../services/dbService.js', () => ({
  supabase: state.supabase,
  executeSQL: state.executeSQL,
}))

vi.mock('../services/criticalPathHelpers.js', () => ({
  getCriticalPathTaskIds: vi.fn(async () => new Set(['task-1', 'task-2'])),
}))

import { weeklyDigestService } from '../services/weeklyDigestService.js'

describe('weeklyDigestService', () => {
  beforeEach(() => {
    Object.values(state.tables).forEach((rows) => rows.splice(0, rows.length))
    state.upserts.splice(0, state.upserts.length)
    vi.clearAllMocks()
  })

  it('writes a real critical_blocked_count for critical tasks with active obstacles', async () => {
    // Use dates within the current week so date-range filters work regardless of when the test runs
    const now = new Date()
    // Keep all event dates within the last 2 hours so they're always within the current week
    const recentISO = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const recentISO2 = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
    const recentISO3 = new Date(now.getTime() - 10 * 60 * 1000).toISOString()

    state.tables.tasks.push(
      {
        id: 'task-1',
        project_id: 'project-1',
        title: '主体结构施工',
        progress: 40,
        status: 'in_progress',
        is_critical: true,
        assignee: '张三',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-30',
        is_milestone: false,
      },
      {
        id: 'task-2',
        project_id: 'project-1',
        title: '结构封顶',
        progress: 0,
        status: 'pending',
        is_critical: true,
        assignee: '李四',
        planned_start_date: '2026-04-10',
        planned_end_date: '2026-04-30',
        is_milestone: true,
      },
    )
    state.tables.project_health_history.push({
      project_id: 'project-1',
      health_score: 82,
      recorded_at: recentISO,
    })
    state.tables.task_progress_snapshots.push(
      { project_id: 'project-1', event_type: 'task_completed', created_at: recentISO },
      { project_id: 'project-1', event_type: 'milestone_completed', created_at: recentISO2 },
    )
    state.tables.responsibility_alert_states.push({
      project_id: 'project-1',
      subject_id: 'unit-1',
      subject_name: '总包单位',
      subject_type: 'contractor',
      is_active: true,
    })
    state.tables.risks.push({
      project_id: 'project-1',
      severity: 'high',
      created_at: recentISO,
    })
    state.tables.task_obstacles.push(
      {
        id: 'obs-1',
        project_id: 'project-1',
        task_id: 'task-1',
        status: 'active',
        resolved_at: null,
        created_at: recentISO,
      },
      {
        id: 'obs-2',
        project_id: 'project-1',
        task_id: 'task-1',
        status: 'resolving',
        resolved_at: null,
        created_at: recentISO2,
      },
      {
        id: 'obs-3',
        project_id: 'project-1',
        task_id: 'task-2',
        status: 'resolved',
        resolved_at: recentISO3,
        created_at: recentISO3,
      },
    )

    await weeklyDigestService.generateForProject('project-1')

    expect(state.upserts).toHaveLength(1)
    expect(state.upserts[0]).toMatchObject({
      project_id: 'project-1',
      critical_tasks_count: 2,
      critical_blocked_count: 1,
      completed_tasks_count: 1,
      completed_milestones_count: 1,
      new_risks_count: 1,
      new_obstacles_count: 3,
    })
  })
})
