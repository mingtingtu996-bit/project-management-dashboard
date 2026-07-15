import { beforeEach, describe, expect, it, vi } from 'vitest'

type TableRow = Record<string, unknown>

const state = vi.hoisted(() => {
  const notifications: TableRow[] = []
  const risks: TableRow[] = []
  const tasks: TableRow[] = []
  const participantUnitMembers: TableRow[] = []
  const getMembers = vi.fn(async () => [] as Array<{ user_id: string; permission_level: string }>)
  const notificationWriteProbe = {
    delayMs: 0,
    active: 0,
    maxActive: 0,
  }

  async function trackNotificationWrite<T>(operation: () => T): Promise<T> {
    notificationWriteProbe.active += 1
    notificationWriteProbe.maxActive = Math.max(notificationWriteProbe.maxActive, notificationWriteProbe.active)
    try {
      if (notificationWriteProbe.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, notificationWriteProbe.delayMs))
      }
      return operation()
    } finally {
      notificationWriteProbe.active -= 1
    }
  }

  function decodeNotificationSqlValue(column: string, value: unknown) {
    if ((column === 'recipients' || column === 'metadata') && typeof value === 'string') {
      return JSON.parse(value)
    }
    return value
  }

  const executeSQL = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim()

    if (/^SELECT \* FROM notifications WHERE /i.test(normalized)) {
      let rows = notifications.filter((row) => (
        String(row.lifecycle_status ?? 'active') !== 'archived'
        && (!row.expires_at || new Date(String(row.expires_at)).getTime() > Date.now())
      ))
      let paramIndex = 2
      const equalityPattern = /\b(id|company_id|project_id|user_id|source_entity_type|source_entity_id|category|type|lifecycle_status|touchpoint_type|scope_type|dedupe_key) = \?/gi
      for (const match of normalized.matchAll(equalityPattern)) {
        const column = match[1].toLowerCase()
        const expected = params[paramIndex]
        paramIndex += 1
        rows = rows.filter((row) => String(row[column] ?? '') === String(expected ?? ''))
      }
      rows = [...rows].sort((left, right) => (
        String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''))
      ))
      if (/ LIMIT \?/i.test(normalized)) {
        const limitParamIndex = / OFFSET \?/i.test(normalized) ? params.length - 2 : params.length - 1
        rows = rows.slice(0, Number(params[limitParamIndex] ?? rows.length))
      }
      return rows
    }

    const insertMatch = normalized.match(/^INSERT INTO notifications \(([^)]+)\) VALUES \((.+)\)$/i)
    if (insertMatch) {
      const columns = insertMatch[1].split(',').map((column) => column.trim())
      const row = Object.fromEntries(columns.map((column, index) => [
        column,
        decodeNotificationSqlValue(column, params[index]),
      ]))
      return await trackNotificationWrite(() => {
        notifications.push(row)
        return []
      })
    }

    const updateMatch = normalized.match(/^UPDATE notifications SET (.+) WHERE (.+)$/i)
    if (updateMatch) {
      const columns = updateMatch[1].split(',').map((assignment) => assignment.trim().split(' = ')[0])
      const patch = Object.fromEntries(columns.map((column, index) => [
        column,
        decodeNotificationSqlValue(column, params[index]),
      ]))
      const whereParams = params.slice(columns.length)
      const id = String(whereParams[0] ?? '')
      return await trackNotificationWrite(() => {
        const index = notifications.findIndex((row) => String(row.id ?? '') === id)
        if (index >= 0) notifications[index] = { ...notifications[index], ...patch }
        return []
      })
    }

    throw new Error(`Unexpected executeSQL in warning-recipient test: ${normalized}`)
  })

  const executeSQLOne = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
    if (normalized === 'select company_id from projects where id = ? limit 1') {
      return params[0] === 'project-1' ? { company_id: 'company-1' } : null
    }
    throw new Error(`Unexpected executeSQLOne in warning-recipient test: ${normalized}`)
  })

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
      neq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? '') !== String(value ?? ''))
        return query
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        const set = new Set(values.map((value) => String(value ?? '')))
        filters.push((row) => set.has(String(row[column] ?? '')))
        return query
      }),
      or: vi.fn(() => query),
      limit: vi.fn(() => query),
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
      insert: vi.fn(async (row: TableRow) => trackNotificationWrite(() => {
        notifications.push({ ...row })
        return { data: null, error: null }
      })),
      update: vi.fn((patch: TableRow) => {
        const updateFilters: Array<(row: TableRow) => boolean> = []
        const updateQuery = {
          eq: vi.fn((column: string, value: unknown) => {
            updateFilters.push((row) => String(row[column] ?? '') === String(value ?? ''))
            return updateQuery
          }),
          then: (resolve: (value: { data: null; error: null }) => unknown) => trackNotificationWrite(() => {
            notifications.forEach((row, index) => {
              if (updateFilters.every((filter) => filter(row))) {
                notifications[index] = { ...row, ...patch }
              }
            })
            return resolve({ data: null, error: null })
          }),
        }
        return updateQuery
      }),
      then: (resolve: (value: { data: TableRow[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: materialize(), error: null })),
    }

    return query
  }

  function buildTasksQuery() {
    const filters: Array<(row: TableRow) => boolean> = []

    const materialize = () => tasks.filter((item) => filters.every((filter) => filter(item)))
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? '') === String(value ?? ''))
        return query
      }),
      limit: vi.fn(() => query),
      single: vi.fn(async () => {
        const row = materialize()[0]
        if (!row) {
          return { data: null, error: { code: 'PGRST116', message: 'not found' } }
        }
        return { data: row, error: null }
      }),
      then: (resolve: (value: { data: TableRow[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: materialize(), error: null })),
    }

    return query
  }

  function buildRisksQuery() {
    const filters: Array<(row: TableRow) => boolean> = []
    const materialize = () => risks.filter((row) => filters.every((filter) => filter(row)))
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? '') === String(value ?? ''))
        return query
      }),
      single: vi.fn(async () => {
        const row = materialize()[0]
        if (!row) {
          return { data: null, error: { code: 'PGRST116', message: 'not found' } }
        }
        return { data: row, error: null }
      }),
      then: (resolve: (value: { data: TableRow[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: materialize(), error: null })),
    }
    return query
  }

  function buildParticipantUnitMembersQuery() {
    const filters: Array<(row: TableRow) => boolean> = []

    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? '') === String(value ?? ''))
        return query
      }),
      then: (resolve: (value: { data: TableRow[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: participantUnitMembers.filter((row) => filters.every((filter) => filter(row))), error: null })),
    }

    return query
  }

  function buildProjectsQuery() {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      limit: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: { company_id: 'company-1' }, error: null })),
    }
    return query
  }

  function buildNotificationUserStatesQuery() {
    return {
      upsert: vi.fn(async () => ({ data: null, error: null })),
    }
  }

  function buildWarningAcknowledgmentsQuery() {
    return {
      upsert: vi.fn(async () => ({ data: null, error: null })),
    }
  }

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'notifications') return buildNotificationsQuery()
      if (table === 'risks') return buildRisksQuery()
      if (table === 'tasks') return buildTasksQuery()
      if (table === 'participant_unit_members') return buildParticipantUnitMembersQuery()
      if (table === 'projects') return buildProjectsQuery()
      if (table === 'notification_user_states') return buildNotificationUserStatesQuery()
      if (table === 'warning_acknowledgments') return buildWarningAcknowledgmentsQuery()
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  return {
    notifications,
    risks,
    tasks,
    participantUnitMembers,
    getMembers,
    executeSQL,
    executeSQLOne,
    notificationWriteProbe,
    supabase: {
      ...supabase,
      rpc: vi.fn(async (fn: string, params: Record<string, unknown>) => {
        if (fn !== 'confirm_warning_as_risk_atomic') {
          return { data: null, error: { message: `Unexpected rpc: ${fn}` } }
        }
        const riskId = `risk-${risks.length + 1}`
        risks.push({
          id: riskId,
          project_id: 'project-1',
          source_type: params.p_source_type,
          source_entity_type: 'warning',
          source_entity_id: params.p_warning_id,
          source_id: params.p_warning_id,
          status: 'identified',
          created_at: '2026-04-23T08:00:00.000Z',
          updated_at: '2026-04-23T08:00:00.000Z',
        })
        return { data: riskId, error: null }
      }),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  createIssue: vi.fn(),
  getIssue: vi.fn(),
  getMembers: state.getMembers,
  getRisk: vi.fn(),
  executeSQL: state.executeSQL,
  executeSQLOne: state.executeSQLOne,
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

import { autoEscalateWarnings, confirmWarningAsRisk, syncWarningNotifications } from '../services/upgradeChainService.js'

describe('upgradeChainService critical path delay recipients', () => {
  beforeEach(() => {
    state.notifications.splice(0, state.notifications.length)
    state.risks.splice(0, state.risks.length)
    state.tasks.splice(0, state.tasks.length)
    state.participantUnitMembers.splice(0, state.participantUnitMembers.length)
    state.notificationWriteProbe.delayMs = 0
    state.notificationWriteProbe.active = 0
    state.notificationWriteProbe.maxActive = 0
    vi.clearAllMocks()
  })

  it('routes info-level critical path delay warnings to the direct task assignee', async () => {
    state.tasks.push({
      id: 'task-1',
      project_id: 'project-1',
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

  it('does not resolve a direct task recipient from another project', async () => {
    state.tasks.push({
      id: 'task-foreign',
      project_id: 'project-2',
      assignee_user_id: 'user-foreign',
      assignee_id: null,
    })
    state.getMembers.mockResolvedValue([
      { user_id: 'user-owner', permission_level: 'owner' },
    ])

    await syncWarningNotifications([
      {
        id: 'warning-cross-project',
        project_id: 'project-1',
        task_id: 'task-foreign',
        warning_type: 'critical_path_delay',
        warning_level: 'info',
        title: 'Cross-project task reference',
        description: 'Must not resolve a foreign assignee',
        is_acknowledged: false,
        created_at: '2026-04-19T08:00:00.000Z',
      },
    ] as any, 'project-1')

    expect(state.notifications[0]?.recipients).toEqual(['user-owner'])
  })

  it('reads both warning and created risk inside the requested project', async () => {
    await syncWarningNotifications([
      {
        id: 'warning-confirm',
        project_id: 'project-1',
        warning_type: 'condition_expired',
        warning_level: 'warning',
        title: 'Confirm as risk',
        description: 'Scoped confirmation',
        is_acknowledged: false,
        created_at: '2026-04-19T08:00:00.000Z',
      },
    ] as any, 'project-1')

    const warningId = String(state.notifications[0]?.id ?? '')
    const risk = await confirmWarningAsRisk('project-1', warningId, 'user-1')

    expect(risk).toMatchObject({ project_id: 'project-1' })
  })

  it('routes warning-level critical path delay warnings to project owners instead of the task assignee', async () => {
    state.tasks.push({
      id: 'task-2',
      project_id: 'project-1',
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

  it('routes high-confidence impact signal warnings to responsible participant unit members before project owners', async () => {
    state.tasks.push({
      id: 'task-3',
      project_id: 'project-1',
      assignee_user_id: 'user-task',
      assignee_id: null,
    })
    state.participantUnitMembers.push(
      { participant_unit_id: 'unit-doc', user_id: 'user-doc-1', is_active: true },
      { participant_unit_id: 'unit-doc', user_id: 'user-doc-2', is_active: true },
    )
    state.getMembers.mockResolvedValue([
      { user_id: 'user-owner', permission_level: 'owner' },
    ])

    await syncWarningNotifications([
      {
        id: 'warning-3',
        project_id: 'project-1',
        task_id: 'task-3',
        warning_type: 'acceptance_expired',
        warning_level: 'warning',
        title: 'archive document gate',
        description: 'acceptance document gate pending',
        is_acknowledged: false,
        created_at: '2026-05-26T08:00:00.000Z',
        source_entity_type: 'acceptance_plan',
        source_entity_id: 'acceptance-archive-1',
        metadata: {
          routing: {
            strategy: 'responsibility_owner',
            ownerType: 'participant_unit',
            ownerUnitId: 'unit-doc',
            ownerRole: 'archive_owner',
            confidence: 0.88,
          },
        },
      },
    ] as any, 'project-1')

    expect(state.notifications).toHaveLength(1)
    expect(state.notifications[0]?.recipients).toEqual(['user-doc-1', 'user-doc-2'])
  })

  it('caches warning recipient lookups within one sync batch', async () => {
    state.tasks.push({
      id: 'task-shared',
      project_id: 'project-1',
      assignee_user_id: 'user-task',
      assignee_id: null,
    })
    state.participantUnitMembers.push({
      participant_unit_id: 'unit-doc',
      user_id: 'user-doc',
      is_active: true,
    })
    state.getMembers.mockResolvedValue([
      { user_id: 'user-owner', permission_level: 'owner' },
    ])

    await syncWarningNotifications([
      {
        id: 'warning-owner-1',
        project_id: 'project-1',
        task_id: 'task-shared',
        warning_type: 'critical_path_delay',
        warning_level: 'warning',
        title: 'Critical delay 1',
        description: 'Critical delay 1',
        is_acknowledged: false,
        created_at: '2026-04-19T08:00:00.000Z',
      },
      {
        id: 'warning-owner-2',
        project_id: 'project-1',
        task_id: 'task-shared',
        warning_type: 'critical_path_delay',
        warning_level: 'critical',
        title: 'Critical delay 2',
        description: 'Critical delay 2',
        is_acknowledged: false,
        created_at: '2026-04-20T08:00:00.000Z',
      },
      {
        id: 'warning-unit-1',
        project_id: 'project-1',
        task_id: 'task-shared',
        warning_type: 'acceptance_expired',
        warning_level: 'warning',
        title: 'Acceptance delay 1',
        description: 'Acceptance delay 1',
        is_acknowledged: false,
        created_at: '2026-04-21T08:00:00.000Z',
        metadata: { routing: { strategy: 'responsibility_owner', ownerUnitId: 'unit-doc' } },
      },
      {
        id: 'warning-unit-2',
        project_id: 'project-1',
        task_id: 'task-shared',
        warning_type: 'acceptance_expired',
        warning_level: 'critical',
        title: 'Acceptance delay 2',
        description: 'Acceptance delay 2',
        is_acknowledged: false,
        created_at: '2026-04-22T08:00:00.000Z',
        metadata: { routing: { strategy: 'responsibility_owner', ownerUnitId: 'unit-doc' } },
      },
    ] as any, 'project-1')

    expect(state.notifications).toHaveLength(4)
    expect(state.getMembers).toHaveBeenCalledTimes(1)
    expect(state.supabase.from.mock.calls.filter(([table]) => table === 'tasks')).toHaveLength(1)
    expect(state.supabase.from.mock.calls.filter(([table]) => table === 'participant_unit_members')).toHaveLength(1)
  })

  it('keeps recipient lookups bounded for hundreds of repeated warnings in one sync batch', async () => {
    state.tasks.push({
      id: 'task-scale',
      project_id: 'project-1',
      assignee_user_id: 'user-task',
      assignee_id: null,
    })
    state.participantUnitMembers.push({
      participant_unit_id: 'unit-scale',
      user_id: 'user-unit',
      is_active: true,
    })
    state.getMembers.mockResolvedValue([
      { user_id: 'user-owner', permission_level: 'owner' },
    ])

    const warnings = Array.from({ length: 240 }, (_, index) => {
      const ownerWarning = index % 2 === 0
      return {
        id: `warning-scale-${index + 1}`,
        project_id: 'project-1',
        task_id: 'task-scale',
        warning_type: ownerWarning ? 'critical_path_delay' : 'acceptance_expired',
        warning_level: ownerWarning ? 'warning' : 'critical',
        title: `Repeated warning ${index + 1}`,
        description: `Repeated warning ${index + 1}`,
        is_acknowledged: false,
        created_at: `2026-04-${String((index % 20) + 1).padStart(2, '0')}T08:00:00.000Z`,
        source_entity_type: ownerWarning ? 'critical_path_projection' : 'acceptance_plan',
        source_entity_id: ownerWarning ? `critical-path-${index + 1}` : `acceptance-${index + 1}`,
        metadata: ownerWarning
          ? undefined
          : { routing: { strategy: 'responsibility_owner', ownerUnitId: 'unit-scale' } },
      }
    })

    await syncWarningNotifications(warnings as any, 'project-1')

    expect(state.notifications).toHaveLength(240)
    expect(state.getMembers).toHaveBeenCalledTimes(1)
    expect(state.supabase.from.mock.calls.filter(([table]) => table === 'tasks')).toHaveLength(1)
    expect(state.supabase.from.mock.calls.filter(([table]) => table === 'participant_unit_members')).toHaveLength(1)
  })

  it('writes repeated warning notifications with bounded concurrency instead of a serial write loop', async () => {
    state.notificationWriteProbe.delayMs = 20
    state.tasks.push({
      id: 'task-concurrency',
      project_id: 'project-1',
      assignee_user_id: 'user-task',
      assignee_id: null,
    })
    state.participantUnitMembers.push({
      participant_unit_id: 'unit-concurrency',
      user_id: 'user-unit',
      is_active: true,
    })
    state.getMembers.mockResolvedValue([
      { user_id: 'user-owner', permission_level: 'owner' },
    ])

    const warnings = Array.from({ length: 16 }, (_, index) => {
      const ownerWarning = index % 2 === 0
      return {
        id: `warning-concurrency-${index + 1}`,
        project_id: 'project-1',
        task_id: 'task-concurrency',
        warning_type: ownerWarning ? 'critical_path_delay' : 'acceptance_expired',
        warning_level: ownerWarning ? 'warning' : 'critical',
        title: `Concurrent warning ${index + 1}`,
        description: `Concurrent warning ${index + 1}`,
        is_acknowledged: false,
        created_at: `2026-04-${String((index % 20) + 1).padStart(2, '0')}T08:00:00.000Z`,
        source_entity_type: ownerWarning ? 'critical_path_projection' : 'acceptance_plan',
        source_entity_id: ownerWarning ? `critical-path-concurrency-${index + 1}` : `acceptance-concurrency-${index + 1}`,
        metadata: ownerWarning
          ? undefined
          : { routing: { strategy: 'responsibility_owner', ownerUnitId: 'unit-concurrency' } },
      }
    })

    await syncWarningNotifications(warnings as any, 'project-1', { writeConcurrency: 4 } as any)

    expect(state.notifications).toHaveLength(16)
    expect(state.notificationWriteProbe.maxActive).toBeGreaterThan(1)
    expect(state.notificationWriteProbe.maxActive).toBeLessThanOrEqual(4)
  })

  it('emits recipient lookup telemetry for cache misses and hits in one sync batch', async () => {
    state.tasks.push({
      id: 'task-telemetry',
      project_id: 'project-1',
      assignee_user_id: 'user-task',
      assignee_id: null,
    })
    state.participantUnitMembers.push({
      participant_unit_id: 'unit-telemetry',
      user_id: 'user-unit',
      is_active: true,
    })
    state.getMembers.mockResolvedValue([
      { user_id: 'user-owner', permission_level: 'owner' },
    ])

    const recipientLookupEvents: Array<{ lookupKind: string; cacheHit: boolean; cacheKey: string }> = []

    await syncWarningNotifications([
      {
        id: 'warning-telemetry-owner-1',
        project_id: 'project-1',
        task_id: 'task-telemetry',
        warning_type: 'critical_path_delay',
        warning_level: 'warning',
        title: 'Telemetry owner 1',
        description: 'Telemetry owner 1',
        is_acknowledged: false,
        created_at: '2026-04-19T08:00:00.000Z',
      },
      {
        id: 'warning-telemetry-owner-2',
        project_id: 'project-1',
        task_id: 'task-telemetry',
        warning_type: 'critical_path_delay',
        warning_level: 'critical',
        title: 'Telemetry owner 2',
        description: 'Telemetry owner 2',
        is_acknowledged: false,
        created_at: '2026-04-20T08:00:00.000Z',
      },
      {
        id: 'warning-telemetry-unit-1',
        project_id: 'project-1',
        task_id: 'task-telemetry',
        warning_type: 'acceptance_expired',
        warning_level: 'warning',
        title: 'Telemetry unit 1',
        description: 'Telemetry unit 1',
        is_acknowledged: false,
        created_at: '2026-04-21T08:00:00.000Z',
        metadata: { routing: { strategy: 'responsibility_owner', ownerUnitId: 'unit-telemetry' } },
      },
      {
        id: 'warning-telemetry-unit-2',
        project_id: 'project-1',
        task_id: 'task-telemetry',
        warning_type: 'acceptance_expired',
        warning_level: 'critical',
        title: 'Telemetry unit 2',
        description: 'Telemetry unit 2',
        is_acknowledged: false,
        created_at: '2026-04-22T08:00:00.000Z',
        metadata: { routing: { strategy: 'responsibility_owner', ownerUnitId: 'unit-telemetry' } },
      },
    ] as any, 'project-1', {
      onRecipientLookup: (event: { lookupKind: string; cacheHit: boolean; cacheKey: string }) => {
        recipientLookupEvents.push(event)
      },
    } as any)

    expect(recipientLookupEvents.filter((event) => event.lookupKind === 'owner_project' && !event.cacheHit)).toHaveLength(1)
    expect(recipientLookupEvents.filter((event) => event.lookupKind === 'direct_task' && !event.cacheHit)).toHaveLength(1)
    expect(recipientLookupEvents.filter((event) => event.lookupKind === 'participant_unit' && !event.cacheHit)).toHaveLength(1)
    expect(recipientLookupEvents.filter((event) => event.lookupKind === 'owner_project' && event.cacheHit)).toHaveLength(1)
    expect(recipientLookupEvents.filter((event) => event.lookupKind === 'direct_task' && event.cacheHit)).toHaveLength(1)
    expect(recipientLookupEvents.filter((event) => event.lookupKind === 'participant_unit' && event.cacheHit)).toHaveLength(1)
    expect(recipientLookupEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ lookupKind: 'owner_project', cacheKey: 'project-1', cacheHit: false }),
      expect.objectContaining({ lookupKind: 'owner_project', cacheKey: 'project-1', cacheHit: true }),
      expect.objectContaining({ lookupKind: 'direct_task', cacheKey: 'task-telemetry', cacheHit: false }),
      expect.objectContaining({ lookupKind: 'direct_task', cacheKey: 'task-telemetry', cacheHit: true }),
      expect.objectContaining({ lookupKind: 'participant_unit', cacheKey: 'unit-telemetry', cacheHit: false }),
      expect.objectContaining({ lookupKind: 'participant_unit', cacheKey: 'unit-telemetry', cacheHit: true }),
    ]))
  })

  it('keeps cross-day warnings active when the same natural source is still emitted', async () => {
    state.notifications.push({
      id: 'notification-existing',
      project_id: 'project-1',
      type: 'critical_path_delay',
      category: 'critical_path_delay',
      notification_type: 'business-warning',
      severity: 'warning',
      title: 'Critical path task delayed 10 days',
      content: 'Critical path task was delayed 10 days on the first day',
      source_entity_type: 'warning',
      source_entity_id: 'critical_path_delay|task-keep-active|2026-04-19',
      source_hash: 'critical_path_delay:task-keep-active',
      warning_signature: 'critical_path_delay|task-keep-active|2026-04-19',
      warning_lifecycle_status: 'active',
      task_id: 'task-keep-active',
      status: 'active',
      first_seen_at: '2026-04-19T08:00:00.000Z',
      created_at: '2026-04-19T08:00:00.000Z',
      updated_at: '2026-04-19T08:00:00.000Z',
    })

    await syncWarningNotifications([
      {
        id: 'warning-next-day',
        project_id: 'project-1',
        task_id: 'task-keep-active',
        warning_type: 'critical_path_delay',
        warning_level: 'warning',
        title: 'Critical path task delayed 11 days',
        description: 'Critical path task was delayed 11 days on the next day',
        is_acknowledged: false,
        created_at: '2026-04-20T08:00:00.000Z',
      },
    ] as any, 'project-1')

    expect(state.notifications).toHaveLength(1)
    expect(state.notifications[0]).toMatchObject({
      id: 'notification-existing',
      status: 'active',
      warning_lifecycle_status: 'active',
      resolved_at: null,
      resolved_source: null,
      source_entity_id: 'critical_path_delay|task-keep-active|2026-04-20',
      warning_signature: 'critical_path_delay|task-keep-active|2026-04-20',
      first_seen_at: '2026-04-19T08:00:00.000Z',
    })
  })

  it('keeps cross-day impact-signal warnings active by their original source entity', async () => {
    state.notifications.push({
      id: 'notification-source-existing',
      project_id: 'project-1',
      type: 'critical_path_delay',
      category: 'critical_path_delay',
      notification_type: 'business-warning',
      severity: 'critical',
      title: 'Shared material delay 3 days',
      content: 'Shared material delayed the critical task by 3 days',
      source_entity_type: 'warning',
      source_entity_id: 'critical_path_delay|project_material:material-1|2026-04-19',
      source_hash: 'critical_path_delay:project_material:material-1',
      warning_signature: 'critical_path_delay|project_material:material-1|2026-04-19',
      warning_lifecycle_status: 'active',
      task_id: 'task-with-material',
      status: 'active',
      first_seen_at: '2026-04-19T08:00:00.000Z',
      created_at: '2026-04-19T08:00:00.000Z',
      updated_at: '2026-04-19T08:00:00.000Z',
    })

    await syncWarningNotifications([
      {
        id: 'warning-source-next-day',
        project_id: 'project-1',
        task_id: 'task-with-material',
        warning_type: 'critical_path_delay',
        warning_level: 'critical',
        title: 'Shared material delay 4 days',
        description: 'Shared material delayed the critical task by 4 days',
        is_acknowledged: false,
        created_at: '2026-04-20T08:00:00.000Z',
        source_entity_type: 'project_material',
        source_entity_id: 'material-1',
      },
    ] as any, 'project-1')

    expect(state.notifications).toHaveLength(1)
    expect(state.notifications[0]).toMatchObject({
      id: 'notification-source-existing',
      status: 'active',
      warning_lifecycle_status: 'active',
      resolved_at: null,
      resolved_source: null,
      source_entity_id: 'critical_path_delay|project_material:material-1|2026-04-20',
      warning_signature: 'critical_path_delay|project_material:material-1|2026-04-20',
      first_seen_at: '2026-04-19T08:00:00.000Z',
    })
  })

  it('preserves first_seen_at across daily warning text changes so warning-to-risk auto escalation can mature', async () => {
    state.notifications.push({
      id: 'notification-mature',
      project_id: 'project-1',
      type: 'critical_path_delay',
      category: 'critical_path_delay',
      notification_type: 'business-warning',
      severity: 'warning',
      title: 'Critical path task delayed 10 days',
      content: 'Critical path task was delayed 10 days',
      source_entity_type: 'warning',
      source_entity_id: 'critical_path_delay|task-mature|2026-04-19',
      source_hash: 'critical_path_delay:task-mature',
      warning_signature: 'critical_path_delay|task-mature|2026-04-19',
      warning_lifecycle_status: 'active',
      task_id: 'task-mature',
      status: 'active',
      first_seen_at: '2026-04-19T08:00:00.000Z',
      created_at: '2026-04-19T08:00:00.000Z',
      updated_at: '2026-04-19T08:00:00.000Z',
    })

    await syncWarningNotifications([
      {
        id: 'warning-mature-next-day',
        project_id: 'project-1',
        task_id: 'task-mature',
        warning_type: 'critical_path_delay',
        warning_level: 'warning',
        title: 'Critical path task delayed 13 days',
        description: 'Critical path task was delayed 13 days',
        is_acknowledged: false,
        created_at: new Date().toISOString(),
      },
    ] as any, 'project-1')

    expect(state.notifications[0]?.first_seen_at).toBe('2026-04-19T08:00:00.000Z')

    const createdRisks = await autoEscalateWarnings('project-1')

    expect(createdRisks).toHaveLength(1)
    expect(state.risks[0]).toEqual(expect.objectContaining({
      id: 'risk-1',
      source_type: 'warning_auto_escalated',
      source_entity_id: 'notification-mature',
    }))
  })
})
