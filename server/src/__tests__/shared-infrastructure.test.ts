import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const baseTables: Record<string, Row[]> = {
    tasks: [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: '主体结构施工',
        status: 'todo',
        priority: 'medium',
        progress: 0,
        start_date: '2026-04-01',
        end_date: '2026-04-10',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-04-10',
        actual_start_date: null,
        actual_end_date: null,
        first_progress_at: null,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
        version: 1,
      },
    ],
    risks: [
      {
        id: 'risk-1',
        project_id: 'project-1',
        title: '高温施工风险',
        status: 'identified',
        level: 'high',
        probability: 50,
        impact: 60,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
        version: 1,
      },
    ],
    issues: [
      {
        id: 'issue-1',
        project_id: 'project-1',
        title: '材料到货延迟',
        source_type: 'manual',
        severity: 'medium',
        priority: 50,
        pending_manual_close: false,
        status: 'open',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
        version: 1,
      },
    ],
    delay_requests: [],
    task_conditions: [],
    projects: [
      {
        id: 'project-1',
        owner_id: 'owner-1',
        name: '示例项目',
      },
    ],
    project_members: [
      {
        project_id: 'project-1',
        user_id: 'owner-1',
        role: 'owner',
        permission_level: 'owner',
      },
      {
        project_id: 'project-1',
        user_id: 'admin-1',
        role: 'admin',
        permission_level: 'admin',
      },
    ],
    task_delay_history: [
      {
        id: 'legacy-delay-1',
        task_id: 'task-1',
        original_date: '2026-04-10',
        delayed_date: '2026-04-12',
        delay_days: 2,
        delay_type: '主动延期',
        reason: '旧延期记录',
        delay_reason: '旧延期记录',
        approved_by: 'user-1',
        approved_at: '2026-04-02T00:00:00.000Z',
        created_at: '2026-04-02T00:00:00.000Z',
      },
    ],
    task_progress_snapshots: [],
    change_logs: [],
  }

  const tables: Record<string, Row[]> = {}
  for (const [key, value] of Object.entries(baseTables)) {
    tables[key] = value.map((row) => ({ ...row }))
  }

  const makeResult = (data: any, error: any = null, count?: number) => ({ data, error, count })

  const matches = (row: Row, filters: Array<{ kind: 'eq' | 'in'; column: string; value: any }>) =>
    filters.every((filter) => {
      if (filter.kind === 'eq') return row[filter.column] === filter.value
      if (Array.isArray(filter.value)) return filter.value.includes(row[filter.column])
      return false
    })

  const createQuery = (table: string) => {
    let operation: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: any = null
    let singleResult = false
    const filters: Array<{ kind: 'eq' | 'in'; column: string; value: any }> = []

    const builder: any = {
      select: () => {
        if (operation === 'select') {
          operation = 'select'
        }
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
      delete: () => {
        operation = 'delete'
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
      order: () => builder,
      gte: () => builder,
      lte: () => builder,
      not: () => builder,
      limit: () => builder,
      range: () => builder,
      single: () => {
        singleResult = true
        return builder
      },
      maybeSingle: () => {
        singleResult = true
        return builder
      },
      then: (resolve: (value: any) => void, reject: (reason?: any) => void) =>
        Promise.resolve(run()).then(resolve, reject),
    }

    async function run() {
      const rows = tables[table] ?? []
      if (operation === 'select') {
        const data = rows.filter((row) => matches(row, filters)).map((row) => ({ ...row }))
        if (singleResult) {
          if (data.length === 0) {
            return makeResult(null, { code: 'PGRST116', message: 'Not found' })
          }
          return makeResult(data[0], null)
        }
        return makeResult(data, null)
      }

      if (operation === 'insert') {
        const inserts = Array.isArray(payload) ? payload : [payload]
        const cloned = inserts.map((row) => ({ ...row }))
        tables[table] = [...rows, ...cloned]
        return makeResult(Array.isArray(payload) ? cloned : cloned[0], null)
      }

      if (operation === 'update') {
        const updatedRows: Row[] = []
        tables[table] = rows.map((row) => {
          if (!matches(row, filters)) return row
          const next = { ...row, ...payload }
          updatedRows.push(next)
          return next
        })
        return makeResult(updatedRows, null, updatedRows.length)
      }

      if (operation === 'delete') {
        const removed = rows.filter((row) => matches(row, filters))
        tables[table] = rows.filter((row) => !matches(row, filters))
        return makeResult(removed, null, removed.length)
      }

      return makeResult([], null)
    }

    return builder
  }

  const supabase = {
    from: (table: string) => createQuery(table),
    rpc: vi.fn(async (fn: string, params: Record<string, any>) => {
      const timestamp = new Date().toISOString()
      if (fn === 'approve_delay_request_atomic') {
        const delayRequest = tables.delay_requests.find((row) => row.id === params.p_delay_request_id)
        if (!delayRequest) {
          return { data: { ok: false, code: 'DELAY_REQUEST_NOT_FOUND', message: '延期申请不存在', status_code: 404 }, error: null }
        }
        if (delayRequest.status !== 'pending') {
          return { data: { ok: false, code: 'DELAY_REQUEST_STATE_INVALID', message: '只有待审批延期申请可以通过', status_code: 422 }, error: null }
        }

        const task = tables.tasks.find((row) => row.id === delayRequest.task_id)
        if (!task) {
          return { data: { ok: false, code: 'TASK_NOT_FOUND', message: '任务不存在', status_code: 404 }, error: null }
        }

        delayRequest.status = 'approved'
        delayRequest.reviewed_by = params.p_reviewer_id ?? null
        delayRequest.reviewed_at = timestamp
        delayRequest.approved_by = params.p_reviewer_id ?? null
        delayRequest.approved_at = timestamp
        delayRequest.updated_at = timestamp

        tables.change_logs.push({
          id: `change-${tables.change_logs.length + 1}`,
          entity_type: 'delay_request',
          entity_id: delayRequest.id,
          field_name: 'status',
          old_value: 'pending',
          new_value: 'approved',
          change_source: 'approval',
          changed_by: params.p_reviewer_id ?? null,
          changed_at: timestamp,
        })

        tables.change_logs.push({
          id: `change-${tables.change_logs.length + 1}`,
          entity_type: 'task',
          entity_id: task.id,
          field_name: 'end_date',
          old_value: task.end_date ?? task.planned_end_date ?? null,
          new_value: delayRequest.delayed_date,
          change_source: 'approval',
          changed_by: params.p_reviewer_id ?? null,
          changed_at: timestamp,
        })

        task.end_date = delayRequest.delayed_date
        task.planned_end_date = delayRequest.delayed_date
        task.updated_at = timestamp

        tables.task_progress_snapshots.push({
          id: `snapshot-${tables.task_progress_snapshots.length + 1}`,
          task_id: task.id,
          progress: Number(task.progress ?? 0),
          snapshot_date: String(timestamp).slice(0, 10),
          event_type: 'delay_approved',
          event_source: 'delay_request',
          notes: `延期审批通过，计划完成时间调整为 ${delayRequest.delayed_date}`,
          status: task.status ?? null,
          conditions_met_count: Number(task.conditions_met_count ?? 0),
          conditions_total_count: Number(task.conditions_total_count ?? 0),
          obstacles_active_count: Number(task.obstacles_active_count ?? 0),
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
        if (delayRequest.status !== 'pending') {
          return { data: { ok: false, code: 'DELAY_REQUEST_STATE_INVALID', message: '只有待审批延期申请可以驳回', status_code: 422 }, error: null }
        }

        delayRequest.status = 'rejected'
        delayRequest.reviewed_by = params.p_reviewer_id ?? null
        delayRequest.reviewed_at = timestamp
        delayRequest.updated_at = timestamp
        tables.change_logs.push({
          id: `change-${tables.change_logs.length + 1}`,
          entity_type: 'delay_request',
          entity_id: delayRequest.id,
          field_name: 'status',
          old_value: 'pending',
          new_value: 'rejected',
          change_source: 'approval',
          changed_by: params.p_reviewer_id ?? null,
          changed_at: timestamp,
        })

        return {
          data: {
            ok: true,
            project_id: delayRequest.project_id ?? null,
            delay_request: { ...delayRequest },
          },
          error: null,
        }
      }

      if (
        fn === 'delete_task_with_source_backfill_atomic'
        || fn === 'delete_risk_with_source_backfill_atomic'
        || fn === 'delete_task_condition_with_source_backfill_atomic'
        || fn === 'delete_task_obstacle_with_source_backfill_atomic'
      ) {
        return { data: true, error: null }
      }

      return { data: null, error: { message: `Unknown RPC ${fn}` } }
    }),
  }

  return {
    tables,
    baseTables,
    supabase,
    createClient: vi.fn(() => supabase),
    persistNotification: vi.fn(async (payload: any) => payload),
    writeLog: vi.fn(async (..._args: any[]) => undefined),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
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
  writeLifecycleLog: vi.fn(async (params: Record<string, any>) => {
    await (mocks.writeLog as any)({
      project_id: params.project_id ?? null,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      field_name: 'lifecycle',
      old_value: null,
      new_value: params.action,
      changed_by: params.changed_by ?? null,
      change_source: params.change_source ?? 'manual_adjusted',
    })
  }),
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

const dbService = await import('../services/dbService.js')
const delayRequests = await import('../services/delayRequests.js')

const { createTask, reopenTask, updateTask, updateRisk, updateIssue } = dbService
const {
  approveDelayRequest,
  calculateDelayImpact,
  createDelayRequest,
  getApprovedDelayRequestsByTaskId,
  getApprovedDelayRequestsByProjectId,
  listDelayRequests,
  rejectDelayRequest,
  withdrawDelayRequest,
} = delayRequests

function resetTables() {
  for (const [key, value] of Object.entries(mocks.baseTables)) {
    mocks.tables[key] = value.map((row) => ({ ...row }))
  }
  mocks.tables.delay_requests = []
  mocks.tables.task_progress_snapshots = []
  mocks.tables.change_logs = []
  vi.clearAllMocks()
}

describe('shared infrastructure contract', () => {
  beforeEach(() => {
    resetTables()
  })

  it('locks delay request pending conflict and duplicate reject reason rules', async () => {
    const firstCreated = await createDelayRequest({
      project_id: 'project-1',
      task_id: 'task-1',
      original_date: '2026-04-10',
      delayed_date: '2026-04-12',
      delay_days: 2,
      reason: '材料运输受阻',
      requested_by: 'user-1',
    })

    expect(mocks.persistNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'critical_path_delay_request_submitted',
      severity: 'critical',
      is_broadcast: true,
      source_entity_type: 'delay_request',
      source_entity_id: firstCreated.id,
      recipients: expect.arrayContaining(['owner-1', 'admin-1']),
    }))

    await expect(createDelayRequest({
      project_id: 'project-1',
      task_id: 'task-1',
      original_date: '2026-04-10',
      delayed_date: '2026-04-13',
      delay_days: 3,
      reason: '第二次延期',
      requested_by: 'user-1',
    })).rejects.toMatchObject({ code: 'PENDING_CONFLICT', statusCode: 409 })

    mocks.tables.delay_requests = []
    mocks.tables.delay_requests.push({
      id: 'rejected-delay-1',
      project_id: 'project-1',
      task_id: 'task-1',
      original_date: '2026-04-10',
      delayed_date: '2026-04-13',
      delay_days: 3,
      delay_type: '主动延期',
      reason: '旧延期记录',
      delay_reason: '旧延期记录',
      status: 'rejected',
      requested_by: 'user-1',
      requested_at: '2026-04-03T00:00:00.000Z',
      reviewed_by: 'reviewer-1',
      reviewed_at: '2026-04-04T00:00:00.000Z',
      withdrawn_at: null,
      approved_by: null,
      approved_at: null,
      chain_id: null,
      created_at: '2026-04-03T00:00:00.000Z',
      updated_at: '2026-04-04T00:00:00.000Z',
    })
    await expect(createDelayRequest({
      project_id: 'project-1',
      task_id: 'task-1',
      original_date: '2026-04-10',
      delayed_date: '2026-04-14',
      delay_days: 4,
      reason: '旧延期记录',
      requested_by: 'user-1',
    })).rejects.toMatchObject({ code: 'DUPLICATE_REASON', statusCode: 422 })
  })

  it('persists milestone_id when creating tasks', async () => {
    const created = await createTask({
      project_id: 'project-1',
      title: '主体结构施工',
      description: null,
      status: 'todo',
      priority: 'medium',
      progress: 0,
      task_type: 'task',
      wbs_code: '1.1',
      wbs_level: 1,
      sort_order: 1,
      is_milestone: false,
      milestone_level: null,
      milestone_order: null,
      milestone_id: 'milestone-1',
      is_critical: false,
      specialty_type: null,
      reference_duration: null,
      ai_duration: null,
      first_progress_at: null,
      delay_reason: null,
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-10',
      actual_start_date: null,
      actual_end_date: null,
      planned_duration: null,
      standard_duration: null,
      ai_adjusted_duration: null,
      assignee_id: null,
      assignee_name: null,
      assignee_unit: null,
      assignee_type: 'person',
      estimated_hours: null,
      actual_hours: null,
      version: 1,
      parent_id: null,
      phase_id: null,
      created_by: null,
    } as any)

    expect(created.milestone_id).toBe('milestone-1')
    expect(mocks.tables.tasks.find((task) => task.id === created.id)?.milestone_id).toBe('milestone-1')
  })

  it('rejects pending requests and blocks later withdrawal', async () => {
    const created = await createDelayRequest({
      project_id: 'project-1',
      task_id: 'task-1',
      original_date: '2026-04-10',
      delayed_date: '2026-04-12',
      delay_days: 2,
      reason: '雨天影响施工',
      requested_by: 'user-1',
    })

    const rejected = await rejectDelayRequest(created.id, 'reviewer-1')
    expect(rejected.status).toBe('rejected')

    await expect(withdrawDelayRequest(created.id, 'user-1')).rejects.toMatchObject({
      code: 'DELAY_REQUEST_STATE_INVALID',
      statusCode: 422,
    })
  })

  it('allows pending delay requests to be withdrawn by the requester only', async () => {
    const created = await createDelayRequest({
      project_id: 'project-1',
      task_id: 'task-1',
      original_date: '2026-04-10',
      delayed_date: '2026-04-12',
      delay_days: 2,
      reason: '雨天影响施工',
      requested_by: 'user-1',
    })

    await expect(withdrawDelayRequest(created.id, 'user-2')).rejects.toMatchObject({
      code: 'DELAY_REQUEST_FORBIDDEN',
      statusCode: 403,
    })

    const withdrawn = await withdrawDelayRequest(created.id, 'user-1')
    expect(withdrawn.status).toBe('withdrawn')
  })

  it('approves delay requests by updating task end dates, logs and snapshots', async () => {
    const created = await createDelayRequest({
      project_id: 'project-1',
      task_id: 'task-1',
      original_date: '2026-04-10',
      delayed_date: '2026-04-12',
      delay_days: 2,
      reason: '关键材料延期',
      requested_by: 'user-1',
    })

    const approved = await approveDelayRequest(created.id, 'reviewer-1')
    expect(approved.status).toBe('approved')

    const task = (mocks.tables.tasks as Row[]).find((row) => row.id === 'task-1')
    expect(task?.end_date).toBe('2026-04-12')
    expect(task?.planned_end_date).toBe('2026-04-12')

    const snapshot = mocks.tables.task_progress_snapshots[0]
    expect(snapshot).toMatchObject({
      task_id: 'task-1',
      progress: 0,
      event_type: 'delay_approved',
      event_source: 'delay_request',
      status: 'todo',
      conditions_met_count: 0,
      conditions_total_count: 0,
      obstacles_active_count: 0,
      recorded_by: 'reviewer-1',
      is_auto_generated: true,
    })

    expect(mocks.tables.change_logs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entity_type: 'delay_request',
        field_name: 'status',
        new_value: 'approved',
      }),
      expect.objectContaining({
        entity_type: 'task',
        field_name: 'end_date',
        new_value: '2026-04-12',
      }),
    ]))
  })

  it('calculates delay impact for task and project duration before submission', async () => {
    const impact = await calculateDelayImpact({
      project_id: 'project-1',
      task_id: 'task-1',
      original_date: '2026-04-10',
      delayed_date: '2026-04-12',
    })

    expect(impact).toMatchObject({
      original_task_end_date: '2026-04-10',
      delayed_task_end_date: '2026-04-12',
      task_end_date_impact_days: 2,
      original_project_end_date: '2026-04-10',
      delayed_project_end_date: '2026-04-12',
      project_total_duration_impact_days: 2,
    })
  })

  it('rejects decimal progress values at the service layer', async () => {
    await expect(updateTask('task-1', {
      progress: 12.5,
      updated_by: 'user-1',
    } as any, 1)).rejects.toMatchObject({
      code: 'INVALID_TASK_PROGRESS',
      statusCode: 400,
    })
  })

  it('automatically fills actual dates and writes task snapshots on explicit task saves', async () => {
    const todayDate = new Date().toISOString().slice(0, 10)

    const updated = await updateTask('task-1', {
      status: 'in_progress',
      progress: 35,
      end_date: '2026-04-13',
      updated_by: 'user-1',
    } as any, 1)

    expect(updated).not.toBeNull()
    expect(updated?.actual_start_date).toBe(todayDate)
    expect(updated?.first_progress_at).toBeTruthy()
    expect(updated?.actual_end_date).toBeNull()

    const task = (mocks.tables.tasks as Row[]).find((row) => row.id === 'task-1')
    expect(task?.actual_start_date).toBe(todayDate)

    // GAP-10.2b-03: updateTask no longer auto-creates approved delay_requests;
    // end_date changes must go through the delay approval flow (POST /api/delay-requests).
    expect(mocks.tables.delay_requests).toHaveLength(0)
    expect(mocks.tables.task_progress_snapshots).toHaveLength(1)
    expect(mocks.tables.task_progress_snapshots[0]).toMatchObject({
      task_id: 'task-1',
      progress: 35,
      event_type: 'task_update',
      event_source: 'user_action',
      status: 'in_progress',
      recorded_by: 'user-1',
      is_auto_generated: true,
    })

    const completed = await updateTask('task-1', {
      status: 'completed',
      progress: 100,
      updated_by: 'user-1',
    } as any, 2)

    expect(completed?.actual_end_date).toBe(todayDate)
    await expect(updateTask('task-1', {
      status: 'in_progress',
      progress: 80,
      updated_by: 'user-1',
    } as any, 3)).rejects.toMatchObject({
      code: 'TASK_REOPEN_REQUIRED',
      statusCode: 422,
    })

    const reopened = await reopenTask('task-1', {
      progress: 80,
      updated_by: 'user-1',
    } as any, 3)
    expect(reopened?.actual_end_date).toBeNull()
    expect(reopened?.status).toBe('in_progress')
    expect(reopened?.progress).toBe(80)
    expect(mocks.tables.task_progress_snapshots.at(-1)).toMatchObject({
      task_id: 'task-1',
      progress: 80,
      event_type: 'task_reopened',
      event_source: 'user_action',
      status: 'in_progress',
    })

    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'task',
      field_name: 'actual_start_date',
      change_source: 'system_auto',
    }))
    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'task',
      field_name: 'actual_end_date',
      change_source: 'system_auto',
    }))
  })

  it('writes task title changes to change_logs so gantt realtime can observe task edits', async () => {
    const updated = await updateTask('task-1', {
      title: '主体结构施工-已改名',
      updated_by: 'user-1',
    } as any, 1)

    expect(updated?.title).toBe('主体结构施工-已改名')
    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'task',
      entity_id: 'task-1',
      field_name: 'title',
      old_value: '主体结构施工',
      new_value: '主体结构施工-已改名',
      change_source: 'manual_adjusted',
    }))
  })

  it('writes an independent lifecycle event when a completed task is reopened across months', async () => {
    const task = (mocks.tables.tasks as Row[]).find((row) => row.id === 'task-1')
    expect(task).toBeTruthy()
    Object.assign(task!, {
      status: 'completed',
      progress: 100,
      actual_end_date: '2026-03-31',
      actual_start_date: '2026-03-01',
      first_progress_at: '2026-03-02T00:00:00.000Z',
      version: 1,
    })

    const reopened = await reopenTask('task-1', {
      progress: 60,
      updated_by: 'user-1',
    } as any, 1)

    expect(reopened?.status).toBe('in_progress')
    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'task',
      field_name: 'lifecycle',
      new_value: 'cross_month_reopened',
      change_source: 'manual_adjusted',
    }))
  })

  it('normalizes progress to 100 when a task is marked completed without explicit progress', async () => {
    const todayDate = new Date().toISOString().slice(0, 10)

    const completed = await updateTask('task-1', {
      status: 'completed',
      updated_by: 'user-1',
    } as any, 1)

    expect(completed?.status).toBe('completed')
    expect(completed?.progress).toBe(100)
    expect(completed?.actual_end_date).toBe(todayDate)

    const task = (mocks.tables.tasks as Row[]).find((row) => row.id === 'task-1')
    expect(task?.status).toBe('completed')
    expect(task?.progress).toBe(100)
  })

  it('writes change logs when risk and issue states change', async () => {
    const risk = await updateRisk('risk-1', { status: 'mitigating' })
    const issue = await updateIssue('issue-1', { status: 'investigating' })

    expect(risk?.status).toBe('mitigating')
    expect(issue?.status).toBe('investigating')

    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'risk',
      field_name: 'status',
      old_value: 'identified',
      new_value: 'mitigating',
    }))
    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'issue',
      field_name: 'status',
      old_value: 'open',
      new_value: 'investigating',
    }))
  })

  it('allows the first 0 -> >0 progress update but blocks later advances when task conditions are still unmet', async () => {
    mocks.tables.task_conditions = [
      {
        id: 'condition-1',
        task_id: 'task-1',
        is_satisfied: false,
      },
    ]

    const firstReported = await updateTask('task-1', {
      progress: 20,
      updated_by: 'user-1',
    } as any, 1)

    expect(firstReported?.progress).toBe(20)
    expect(firstReported?.first_progress_at).toBeTruthy()

    await expect(updateTask('task-1', {
      progress: 35,
      updated_by: 'user-1',
    } as any, 2)).rejects.toMatchObject({
      code: 'TASK_CONDITIONS_UNMET',
      statusCode: 422,
    })
  })

  it('rejects direct terminal state jumps for risk and issue flows', async () => {
    await expect(updateRisk('risk-1', { status: 'closed' })).rejects.toMatchObject({
      code: 'INVALID_RISK_STATUS_TRANSITION',
      statusCode: 422,
    })

    await expect(updateIssue('issue-1', { status: 'closed' })).rejects.toMatchObject({
      code: 'INVALID_ISSUE_STATUS_TRANSITION',
      statusCode: 422,
    })
  })

  it('reads approved delays through the new delay_requests contract and legacy fallback', async () => {
    const projectDelays = await getApprovedDelayRequestsByProjectId('project-1')
    const taskDelays = await getApprovedDelayRequestsByTaskId('task-1')
    const rawList = await listDelayRequests('task-1')

    expect(projectDelays).toHaveLength(1)
    expect(taskDelays).toHaveLength(1)
    expect(rawList.length).toBeGreaterThanOrEqual(1)
    expect(taskDelays[0].reason).toBe('旧延期记录')
  })
})
