import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {
    delay_requests: [],
    tasks: [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: '一期结构',
        progress: 45,
        status: 'in_progress',
        is_critical: false,
      },
    ],
    projects: [
      {
        id: 'project-1',
        owner_id: 'owner-1',
        name: '示例项目',
      },
    ],
    project_members: [
      { project_id: 'project-1', user_id: 'owner-1', permission_level: 'owner' },
      { project_id: 'project-1', user_id: 'admin-1', permission_level: 'admin' },
    ],
  }

  const projectMemberSelects: string[] = []

  const buildQuery = (table: string) => {
    let operation: 'select' | 'insert' = 'select'
    let payload: any = null
    let selectColumns = '*'
    let singleResult = false
    const filters: Array<{ kind: 'eq'; column: string; value: any }> = []

    const matches = (row: Row) => filters.every((filter) => row[filter.column] === filter.value)

    const builder: any = {
      select: (columns = '*') => {
        selectColumns = columns
        if (table === 'project_members') {
          projectMemberSelects.push(columns)
        }
        operation = 'select'
        return builder
      },
      insert: (value: any) => {
        operation = 'insert'
        payload = value
        return builder
      },
      eq: (column: string, value: any) => {
        filters.push({ kind: 'eq', column, value })
        return builder
      },
      single: () => {
        singleResult = true
        return builder
      },
      then: (resolve: (value: any) => void, reject: (reason?: any) => void) =>
        Promise.resolve().then(() => {
          if (table === 'project_members' && operation === 'select' && selectColumns.includes('role')) {
            return {
              data: null,
              error: {
                code: '42703',
                message: 'column project_members.role does not exist',
              },
            }
          }

          const rows = tables[table] ?? []
          if (operation === 'select') {
            const data = rows.filter(matches).map((row) => ({ ...row }))
            if (singleResult) {
              return data[0]
                ? { data: data[0], error: null }
                : { data: null, error: { code: 'PGRST116', message: 'Not found' } }
            }
            return { data, error: null }
          }

          if (operation === 'insert') {
            tables[table] = [...rows, { ...payload }]
            return { data: payload, error: null }
          }

          return { data: null, error: null }
        }).then(resolve, reject),
    }

    return builder
  }

  return {
    tables,
    projectMemberSelects,
    supabase: {
      from: (table: string) => buildQuery(table),
      rpc: vi.fn(async () => ({ data: null, error: { code: '42883', message: 'function missing' } })),
    },
    recordTaskProgressSnapshot: vi.fn(async () => undefined),
    recalculateProjectCriticalPath: vi.fn(async () => undefined),
    getProjectCriticalPathSnapshot: vi.fn(async (projectId: string) => ({
      projectId,
      autoTaskIds: [],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: null,
      alternateChains: [],
      displayTaskIds: [],
      watchedTaskIds: [],
      edges: [],
      tasks: tables.tasks
        .filter((row) => row.project_id === projectId)
        .map((row) => ({
          taskId: row.id,
          title: row.title ?? '',
          floatDays: 10,
          durationDays: 1,
          isAutoCritical: false,
          isManualAttention: false,
          isManualInserted: false,
        })),
      projectDurationDays: 0,
      calculatedAt: '2026-04-01T00:00:00.000Z',
    })),
    persistNotification: vi.fn(async (payload: any) => payload),
    writeLog: vi.fn(async () => undefined),
    writeStatusTransitionLog: vi.fn(async () => undefined),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  recordTaskProgressSnapshot: mocks.recordTaskProgressSnapshot,
  supabase: mocks.supabase,
}))

vi.mock('../services/projectCriticalPathService.js', () => ({
  recalculateProjectCriticalPath: mocks.recalculateProjectCriticalPath,
  getProjectCriticalPathSnapshot: mocks.getProjectCriticalPathSnapshot,
}))

vi.mock('../services/warningChainService.js', () => ({
  persistNotification: mocks.persistNotification,
  resolvePendingDelayWarningSeverity: vi.fn(({ has_pending_request }: { has_pending_request: boolean }) => ({
    severity: has_pending_request ? 'info' : 'warning',
    note: has_pending_request ? 'pending_request_downgraded' : 'approved_assessment_followup',
  })),
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLog: mocks.writeLog,
  writeStatusTransitionLog: mocks.writeStatusTransitionLog,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

const { createDelayRequest } = await import('../services/delayRequests.js')

describe('delay requests project member fallback', () => {
  beforeEach(() => {
    mocks.tables.delay_requests = []
    mocks.projectMemberSelects.length = 0
    vi.clearAllMocks()
  })

  it('uses permission_level-only project member query and still persists submitted notification', async () => {
    const created = await createDelayRequest({
      project_id: 'project-1',
      task_id: 'task-1',
      original_date: '2026-04-10',
      delayed_date: '2026-04-13',
      delay_days: 3,
      reason: '材料运输受阻',
      requested_by: 'user-1',
    })

    expect(created.status).toBe('pending')
    expect(mocks.persistNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'delay_request_submitted',
      source_entity_type: 'delay_request',
      source_entity_id: created.id,
      recipients: expect.arrayContaining(['owner-1', 'admin-1']),
    }))
    expect(mocks.projectMemberSelects).toEqual([
      'project_id, user_id, permission_level',
    ])
    expect(mocks.logger.warn).not.toHaveBeenCalled()
  })
})
