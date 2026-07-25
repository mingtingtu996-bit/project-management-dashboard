import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.DB_SQL_EXECUTION_MODE = 'rest'

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
    rpc: vi.fn(async (fn: string, _params: Record<string, any>) => {
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

  const writeLog = vi.fn(async (..._args: any[]) => undefined)
  const writeLifecycleLog = vi.fn(async (params: Record<string, any>) => {
    await writeLog({
      project_id: params.project_id ?? null,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      field_name: 'lifecycle',
      old_value: null,
      new_value: params.action,
      changed_by: params.changed_by ?? null,
      change_source: params.change_source ?? 'manual_adjusted',
    })
  })

  return {
    tables,
    baseTables,
    supabase,
    createClient: vi.fn(() => supabase),
    persistNotification: vi.fn(async (payload: any) => payload),
    writeLog,
    writeLifecycleLog,
    enqueueProjectHealthUpdate: vi.fn(async () => undefined),
    syncProjectDataQuality: vi.fn(async () => undefined),
    evaluateTaskConstraint: vi.fn(async () => undefined),
    requestTaskWriteFinalizationOutboxDrain: vi.fn(async () => undefined),
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
  writeLifecycleLog: mocks.writeLifecycleLog,
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
const {
  createTask,
  registerDbServiceBusinessSideEffectAdapters,
  reopenTask,
  updateTask,
  updateRisk,
  updateIssue,
} = dbService

registerDbServiceBusinessSideEffectAdapters({
  writeLog: mocks.writeLog,
  writeLifecycleLog: mocks.writeLifecycleLog,
  enqueueProjectHealthUpdate: mocks.enqueueProjectHealthUpdate,
  syncProjectDataQuality: mocks.syncProjectDataQuality,
  evaluateTaskConstraint: mocks.evaluateTaskConstraint,
  requestTaskWriteFinalizationOutboxDrain: mocks.requestTaskWriteFinalizationOutboxDrain,
})

function resetTables() {
  for (const [key, value] of Object.entries(mocks.baseTables)) {
    mocks.tables[key] = value.map((row) => ({ ...row }))
  }
  mocks.tables.task_progress_snapshots = []
  mocks.tables.change_logs = []
  vi.clearAllMocks()
}

describe('shared infrastructure contract', () => {
  beforeEach(() => {
    resetTables()
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
      first_progress_at: null,
      delay_reason: null,
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-10',
      actual_start_date: null,
      actual_end_date: null,
      planned_duration: null,
      standard_duration: null,
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

  it('ignores manual actual date writes in ordinary task create and update flows', async () => {
    const created = await createTask({
      project_id: 'project-1',
      title: 'manual actual dates are ignored on create',
      status: 'todo',
      priority: 'medium',
      progress: 0,
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-10',
      actual_start_date: '2026-03-28',
      actual_end_date: '2026-03-30',
    } as any)

    expect(created.actual_start_date).toBeNull()
    expect(created.actual_end_date).toBeNull()

    const updated = await updateTask('task-1', {
      actual_start_date: '2026-03-28',
      actual_end_date: '2026-03-30',
      updated_by: 'user-1',
    } as any, 1)

    expect(updated?.actual_start_date).toBeNull()
    expect(updated?.actual_end_date).toBeNull()
  })

  it('persists system critical-path projection fields through updateTask', async () => {
    const updated = await updateTask('task-1', {
      is_critical: true,
      total_float_days: 0,
      free_float_days: 0,
      criticality_weight: 1.35,
      updated_by: 'system-cpm',
    } as any, 1)

    expect(updated).toEqual(expect.objectContaining({
      is_critical: true,
      total_float_days: 0,
      free_float_days: 0,
      criticality_weight: 1.35,
    }))
    expect(mocks.tables.tasks.find((task) => task.id === 'task-1')).toEqual(expect.objectContaining({
      is_critical: true,
      total_float_days: 0,
      free_float_days: 0,
      criticality_weight: 1.35,
    }))
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

    // end_date changes are direct schedule edits; automatic delay signals and planning algorithms consume the saved task state.
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
    await vi.waitFor(() => {
      expect(mocks.enqueueProjectHealthUpdate).toHaveBeenCalledWith('project-1', expect.any(String))
      expect(mocks.syncProjectDataQuality).toHaveBeenCalledWith('project-1')
      expect(mocks.evaluateTaskConstraint).toHaveBeenCalledWith('task-1', {
        projectId: 'project-1',
        sourceEventType: 'task_progress_or_status_updated',
      })
    })
  })

  it('writes task title changes to change_logs so gantt realtime can observe task edits', async () => {
    const updated = await updateTask('task-1', {
      title: 'main structure construction renamed',
      updated_by: 'user-1',
    } as any, 1)

    expect(updated?.title).toBe('main structure construction renamed')
    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'task',
      entity_id: 'task-1',
      field_name: 'title',
      old_value: '主体结构施工',
      new_value: 'main structure construction renamed',
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

  it('schedules durable canonical task finalization for low-level completion updates', async () => {
    const completed = await updateTask('task-1', {
      status: 'completed',
      progress: 100,
      updated_by: 'user-1',
    } as any, 1)

    expect(completed?.status).toBe('completed')
    await vi.waitFor(() => {
      expect(mocks.requestTaskWriteFinalizationOutboxDrain).toHaveBeenCalledWith('task-1')
    })
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

  it('allows progress updates with unmet task conditions and records an execution quality signal', async () => {
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

    const laterReported = await updateTask('task-1', {
      progress: 35,
      updated_by: 'user-1',
    } as any, 2)

    expect(laterReported?.progress).toBe(35)
    expect(mocks.logger.info).toHaveBeenCalledWith(
      '[dbService] task progressed with unmet start conditions',
      expect.objectContaining({
        taskId: 'task-1',
        unmetConditionCount: 1,
      }),
    )
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

  it('requires structured outcomes when generic writes enter a terminal risk or issue state', async () => {
    mocks.tables.risks[0].status = 'mitigating'
    mocks.tables.issues[0].status = 'resolved'

    await expect(updateRisk('risk-1', { status: 'closed' })).rejects.toMatchObject({
      code: 'CLOSURE_OUTCOME_REQUIRED',
      statusCode: 422,
    })
    await expect(updateIssue('issue-1', { status: 'closed' })).rejects.toMatchObject({
      code: 'CLOSURE_OUTCOME_REQUIRED',
      statusCode: 422,
    })
  })

  it('persists complete structured outcomes when generic writes enter a terminal state', async () => {
    mocks.tables.risks[0].status = 'mitigating'
    mocks.tables.issues[0].status = 'resolved'
    const structuredOutcome = {
      status: 'closed' as const,
      closure_result_code: 'resolved' as const,
      closure_result_summary: 'Corrective work completed and checked.',
      closure_effectiveness: 'resolved' as const,
      closure_evidence_refs: ['inspection:inspection-1'],
      closure_cause_attribution_id: null,
      closed_by: 'user-1',
      closure_recorded_at: '2026-07-17T00:00:00.000Z',
    }

    const risk = await updateRisk('risk-1', structuredOutcome)
    const issue = await updateIssue('issue-1', structuredOutcome)

    expect(risk).toEqual(expect.objectContaining(structuredOutcome))
    expect(issue).toEqual(expect.objectContaining(structuredOutcome))
  })

})
