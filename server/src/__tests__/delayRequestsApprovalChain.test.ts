import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const state = {
    criticalDisplayTaskIds: null as string[] | null,
  }

  const tables: Record<string, Row[]> = {
    delay_requests: [],
    tasks: [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: '一期结构',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_end_date: '2026-04-03',
        progress: 45,
        status: 'in_progress',
        dependencies: [],
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
      { project_id: 'project-1', user_id: 'owner-1', role: 'owner', permission_level: 'owner' },
      { project_id: 'project-1', user_id: 'admin-1', role: 'admin', permission_level: 'admin' },
    ],
    task_progress_snapshots: [],
  }

  const buildQuery = (table: string) => {
    let operation: 'select' | 'insert' | 'update' = 'select'
    let payload: any = null
    let singleResult = false
    const filters: Array<{ kind: 'eq' | 'in'; column: string; value: any }> = []

    const matches = (row: Row) =>
      filters.every((filter) => {
        if (filter.kind === 'eq') return row[filter.column] === filter.value
        return Array.isArray(filter.value) ? filter.value.includes(row[filter.column]) : false
      })

    const builder: any = {
      select: () => {
        operation = 'select'
        return builder
      },
      insert: (value: any) => {
        operation = 'insert'
        payload = value
        return builder
      },
      upsert: (value: any, _opts?: any) => {
        operation = 'insert'
        payload = value
        return builder
      },
      update: (value: any) => {
        operation = 'update'
        payload = value
        return builder
      },
      eq: (column: string, value: any) => {
        filters.push({ kind: 'eq', column, value })
        return builder
      },
      in: (column: string, value: any[]) => {
        filters.push({ kind: 'in', column, value })
        return builder
      },
      single: () => {
        singleResult = true
        return builder
      },
      then: (resolve: (value: any) => void, reject: (reason?: any) => void) =>
        Promise.resolve(run()).then(resolve, reject),
    }

    async function run() {
      const rows = tables[table] ?? []

      if (operation === 'select') {
        const data = rows.filter(matches).map((row) => ({ ...row }))
        if (singleResult) {
          return data.length > 0
            ? { data: data[0], error: null }
            : { data: null, error: { code: 'PGRST116', message: 'Not found' } }
        }
        return { data, error: null }
      }

      if (operation === 'insert') {
        const record = { ...payload }
        tables[table] = [...rows, record]
        return { data: record, error: null }
      }

      if (operation === 'update') {
        const updatedRows: Row[] = []
        tables[table] = rows.map((row) => {
          if (!matches(row)) return row
          const next = { ...row, ...payload }
          updatedRows.push(next)
          return next
        })
        return { data: updatedRows, error: null }
      }

      return { data: [], error: null }
    }

    return builder
  }

  return {
    tables,
    supabase: {
      from: (table: string) => buildQuery(table),
      rpc: vi.fn(async (fn: string, params: Record<string, any>) => {
        const timestamp = new Date().toISOString()
        if (fn === 'approve_delay_request_atomic') {
          const delayRequest = tables.delay_requests.find((row) => row.id === params.p_delay_request_id)
          const task = tables.tasks.find((row) => row.id === delayRequest?.task_id)
          if (!delayRequest || !task) {
            return { data: { ok: false, code: 'DELAY_REQUEST_NOT_FOUND', message: '延期申请不存在', status_code: 404 }, error: null }
          }
          delayRequest.status = 'approved'
          delayRequest.reviewed_by = params.p_reviewer_id ?? null
          delayRequest.reviewed_at = timestamp
          delayRequest.approved_by = params.p_reviewer_id ?? null
          delayRequest.approved_at = timestamp
          delayRequest.updated_at = timestamp
          task.end_date = delayRequest.delayed_date
          task.planned_end_date = delayRequest.delayed_date
          task.updated_at = timestamp
          tables.task_progress_snapshots.push({
            id: `snapshot-${tables.task_progress_snapshots.length + 1}`,
            task_id: task.id,
            progress: Number(task.progress ?? 0),
            snapshot_date: timestamp.slice(0, 10),
            event_type: 'delay_approved',
            event_source: 'delay_request',
            status: task.status ?? null,
            conditions_met_count: 0,
            conditions_total_count: 0,
            obstacles_active_count: 0,
            recorded_by: params.p_reviewer_id ?? null,
            is_auto_generated: true,
            created_at: timestamp,
          })
          tables.task_progress_snapshots.push({
            id: `snapshot-${tables.task_progress_snapshots.length + 1}`,
            task_id: task.id,
            progress: Number(task.progress ?? 0),
            snapshot_date: timestamp.slice(0, 10),
            event_type: 'delay_approved_assessment',
            event_source: 'delay_request',
            status: task.status ?? null,
            conditions_met_count: 0,
            conditions_total_count: 0,
            obstacles_active_count: 0,
            recorded_by: params.p_reviewer_id ?? null,
            is_auto_generated: true,
            created_at: timestamp,
          })
          return {
            data: {
              ok: true,
              project_id: delayRequest.project_id ?? task.project_id ?? null,
              delay_request: { ...delayRequest },
              task: { ...task },
            },
            error: null,
          }
        }
        if (fn === 'reject_delay_request_atomic') {
          const delayRequest = tables.delay_requests.find((row) => row.id === params.p_delay_request_id)
          if (!delayRequest) {
            return { data: { ok: false, code: 'DELAY_REQUEST_NOT_FOUND', message: '延期申请不存在', status_code: 404 }, error: null }
          }
          delayRequest.status = 'rejected'
          delayRequest.reviewed_by = params.p_reviewer_id ?? null
          delayRequest.reviewed_at = timestamp
          delayRequest.updated_at = timestamp
          return {
            data: {
              ok: true,
              project_id: delayRequest.project_id ?? null,
              delay_request: { ...delayRequest },
            },
            error: null,
          }
        }
        return { data: null, error: { message: `Unknown RPC ${fn}` } }
      }),
    },
    writeLog: vi.fn(async () => undefined),
    recalculateProjectCriticalPath: vi.fn(async () => ({
      projectId: 'project-1',
      taskCount: 1,
      eligibleTaskCount: 1,
      criticalTaskIds: ['task-1'],
      projectDuration: 3,
    })),
    getProjectCriticalPathSnapshot: vi.fn(async (projectId: string) => {
      const projectTasks = tables.tasks.filter((row) => row.project_id === projectId)
      const displayTaskIds = state.criticalDisplayTaskIds ?? projectTasks.filter((row) => row.is_critical).map((row) => row.id)
      return {
        projectId,
        autoTaskIds: displayTaskIds,
        manualAttentionTaskIds: [],
        manualInsertedTaskIds: [],
        primaryChain: displayTaskIds.length > 0
          ? { id: 'primary', source: 'auto', taskIds: displayTaskIds, totalDurationDays: 0, displayLabel: '关键路径' }
          : null,
        alternateChains: [],
        displayTaskIds,
        watchedTaskIds: [],
        edges: [],
        tasks: projectTasks.map((row) => ({
          taskId: row.id,
          title: row.title ?? '',
          floatDays: row.is_critical ? 0 : 10,
          durationDays: 1,
          isAutoCritical: Boolean(row.is_critical),
          isManualAttention: false,
          isManualInserted: false,
        })),
        projectDurationDays: 0,
        calculatedAt: '2026-04-01T00:00:00.000Z',
      }
    }),
    state,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    persistNotification: vi.fn(async (payload: any) => payload),
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  supabase: mocks.supabase,
  recordTaskProgressSnapshot: vi.fn(async (task: Row, options?: Record<string, any>) => {
    mocks.tables.task_progress_snapshots.push({
      id: `snapshot-${mocks.tables.task_progress_snapshots.length + 1}`,
      task_id: task.id,
      progress: Number(task.progress ?? 0),
      snapshot_date: String(task.updated_at ?? new Date().toISOString()).slice(0, 10),
      event_type: options?.eventType ?? 'task_update',
      event_source: options?.eventSource ?? 'system_auto',
      notes: options?.notes ?? null,
      status: task.status ?? null,
      conditions_met_count: Number(task.conditions_met_count ?? 0),
      conditions_total_count: Number(task.conditions_total_count ?? 0),
      obstacles_active_count: Number(task.obstacles_active_count ?? 0),
      recorded_by: options?.recordedBy ?? null,
      is_auto_generated: true,
      created_at: new Date().toISOString(),
    })
  }),
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLog: mocks.writeLog,
  writeStatusTransitionLog: vi.fn(async (params: Record<string, any>) => {
    await (mocks.writeLog as any)({
      project_id: params.project_id ?? null,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      field_name: 'status',
      old_value: params.old_status ?? null,
      new_value: params.new_status,
      changed_by: params.changed_by ?? null,
      change_source: params.change_source ?? 'manual_adjusted',
    })
  }),
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

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

const { approveDelayRequest, createDelayRequest } = await import('../services/delayRequests.js')
const { clearCriticalPathCache } = await import('../services/criticalPathHelpers.js')

describe('delay request approval chain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCriticalPathCache()
    mocks.state.criticalDisplayTaskIds = null
    mocks.tables.delay_requests = []
    mocks.tables.tasks = [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: '一期结构',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_end_date: '2026-04-03',
        progress: 45,
        status: 'in_progress',
        dependencies: [],
        is_critical: false,
      },
    ]
    mocks.tables.task_progress_snapshots = []
  })

  it('notifies project manager and owner when a delay request is submitted', async () => {
    const created = await createDelayRequest({
      project_id: 'project-1',
      task_id: 'task-1',
      original_date: '2026-04-03',
      delayed_date: '2026-04-06',
      delay_days: 3,
      reason: '关键材料延期',
      requested_by: 'user-1',
    })

    expect(created.status).toBe('pending')
    expect(created.delay_type).toBe('主动申请')
    expect(mocks.persistNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'delay_request_submitted',
      source_entity_type: 'delay_request',
      source_entity_id: created.id,
      task_id: 'task-1',
      recipients: expect.arrayContaining(['owner-1', 'admin-1']),
    }))
  })

  it('recalculates CPM after approving a delay request', async () => {
    const created = await createDelayRequest({
      project_id: 'project-1',
      task_id: 'task-1',
      original_date: '2026-04-03',
      delayed_date: '2026-04-06',
      delay_days: 3,
      reason: '关键材料延期',
      requested_by: 'user-1',
    })

    const approved = await approveDelayRequest(created.id, 'reviewer-1')

    expect(approved.status).toBe('approved')
    expect(mocks.recalculateProjectCriticalPath).toHaveBeenCalledWith('project-1')

    const task = mocks.tables.tasks.find((row) => row.id === 'task-1')
    expect(task?.end_date).toBe('2026-04-06')
    expect(task?.planned_end_date).toBe('2026-04-06')
    expect(mocks.tables.task_progress_snapshots).toHaveLength(2)
    expect(mocks.tables.task_progress_snapshots[0]).toMatchObject({
      event_type: 'delay_approved',
      event_source: 'delay_request',
    })
    expect(mocks.tables.task_progress_snapshots[1]).toMatchObject({
      event_type: 'delay_approved_assessment',
      event_source: 'delay_request',
    })
  })

  it('uses a dedicated critical reminder when the delayed task is on the critical path', async () => {
    mocks.tables.tasks = [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: '一期结构',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_end_date: '2026-04-03',
        progress: 45,
        status: 'in_progress',
        dependencies: [],
        is_critical: true,
      },
    ]

    await createDelayRequest({
      project_id: 'project-1',
      task_id: 'task-1',
      original_date: '2026-04-03',
      delayed_date: '2026-04-06',
      delay_days: 3,
      reason: '关键材料延期',
      requested_by: 'user-1',
    })

    expect(mocks.persistNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'critical_path_delay_request_submitted',
      severity: 'critical',
      is_broadcast: true,
    }))
  })

  it('ignores legacy is_critical and chain_id when the latest critical path snapshot excludes the task', async () => {
    mocks.state.criticalDisplayTaskIds = []
    mocks.tables.tasks = [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: '一期结构',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
        planned_end_date: '2026-04-03',
        progress: 45,
        status: 'in_progress',
        dependencies: [],
        is_critical: true,
      },
    ]

    await createDelayRequest({
      project_id: 'project-1',
      task_id: 'task-1',
      original_date: '2026-04-03',
      delayed_date: '2026-04-06',
      delay_days: 3,
      reason: '关键材料延期',
      requested_by: 'user-1',
      chain_id: '00000000-0000-4000-8000-000000000001',
    })

    expect(mocks.persistNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'delay_request_submitted',
      severity: 'warning',
      is_broadcast: false,
      metadata: expect.objectContaining({
        is_critical_task: false,
      }),
    }))
    expect(mocks.persistNotification).not.toHaveBeenCalledWith(expect.objectContaining({
      type: 'critical_path_delay_request_submitted',
    }))
  })

  it('falls back to direct approval writes when the atomic rpc chain is unavailable', async () => {
    mocks.supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '42883', message: 'function missing' },
    })

    const created = await createDelayRequest({
      project_id: 'project-1',
      task_id: 'task-1',
      original_date: '2026-04-03',
      delayed_date: '2026-04-06',
      delay_days: 3,
      reason: '关键材料延期',
      requested_by: 'user-1',
    })

    const approved = await approveDelayRequest(created.id, 'reviewer-1')

    expect(approved.status).toBe('approved')
    expect(mocks.tables.delay_requests.find((row) => row.id === created.id)?.status).toBe('approved')
    expect(mocks.tables.task_progress_snapshots).toHaveLength(2)
  })
})
