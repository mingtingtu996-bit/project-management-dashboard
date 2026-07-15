import { beforeEach, describe, expect, it, vi } from 'vitest'

type MaterialRow = {
  id: string
  project_id: string
  participant_unit_id: string | null
  participant_unit_name: string | null
  material_name: string
  specialty_type: string | null
  requires_sample_confirmation: boolean
  sample_confirmed: boolean
  expected_arrival_date: string
  actual_arrival_date: string | null
  requires_inspection: boolean
  inspection_done: boolean
  version: number
  created_at: string
  updated_at: string
  linked_task_id?: string | null
  linked_task_start_date?: string | null
  linked_task_buffer_days?: number | null
}

type NotificationRow = {
  id: string
  project_id?: string | null
  type: string
  source_entity_type?: string | null
  source_entity_id?: string | null
  lifecycle_status?: string | null
  recipients?: string[] | null
  status?: string | null
  is_read?: boolean | null
  resolved_at?: string | null
  resolved_source?: string | null
  created_at: string
  metadata?: Record<string, unknown> | null
  title: string
  content: string
}

function buildMaterial(overrides: Partial<MaterialRow> & Pick<MaterialRow, 'id'>): MaterialRow {
  return {
    project_id: 'project-1',
    participant_unit_id: 'unit-1',
    participant_unit_name: 'Unit 1',
    material_name: overrides.id,
    specialty_type: 'facade',
    requires_sample_confirmation: false,
    sample_confirmed: false,
    expected_arrival_date: '2026-04-21',
    actual_arrival_date: null,
    requires_inspection: false,
    inspection_done: false,
    version: 1,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

const state = vi.hoisted(() => {
  const materials: MaterialRow[] = []
  const notifications: NotificationRow[] = []
  const taskRows: Array<Record<string, unknown>> = []
  const projectRows: Array<Record<string, unknown>> = []
  const memberRows: Array<Record<string, unknown>> = []
  const participantUnitRows: Array<Record<string, unknown>> = []
  const userRows: Array<Record<string, unknown>> = []
  const notificationUserStates: Array<Record<string, unknown>> = []
  const conditionRows: Array<Record<string, unknown>> = []
  const auditRows: Array<Record<string, unknown>> = []
  const dataQualityFindings: Array<Record<string, unknown>> = []
  const rawQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM public.project_materials') && sql.includes('id::text = ANY')) {
      const projectId = String(params[0] ?? '')
      const materialIds = new Set((Array.isArray(params[1]) ? params[1] : []).map(String))
      return {
        rows: materials.filter((row) => row.project_id === projectId && materialIds.has(row.id)),
        rowCount: materialIds.size,
      }
    }

    if (sql.includes('FROM public.tasks')) {
      const projectId = String(params[0] ?? '')
      const taskIds = new Set((Array.isArray(params[1]) ? params[1] : []).map(String))
      const unitIds = new Set((Array.isArray(params[2]) ? params[2] : []).map(String))
      const rows = taskRows.filter((row) =>
        String(row.project_id) === projectId
        && (
          taskIds.has(String(row.id))
          || unitIds.has(String(row.participant_unit_id ?? ''))
        ),
      )
      return { rows, rowCount: rows.length }
    }

    if (sql.includes('FROM public.participant_units pu')) {
      const projectId = String(params[0] ?? '')
      const unitIds = new Set((Array.isArray(params[1]) ? params[1] : []).map(String))
      const rows = participantUnitRows
        .filter((row) => String(row.project_id) === projectId && unitIds.has(String(row.id)))
        .flatMap((unit) => {
          const contactEmail = String(unit.contact_email ?? '').trim().toLowerCase()
          const user = userRows.find((row) => String(row.email ?? '').trim().toLowerCase() === contactEmail)
          if (!user) return []
          const member = memberRows.find((row) => String(row.project_id) === projectId && String(row.user_id) === String(user.id))
          return member ? [{ participant_unit_id: unit.id, user_id: user.id, recipient_source: 'participant_unit_contact_email_member' }] : []
        })
      return { rows, rowCount: rows.length }
    }

    if (sql.includes('FROM public.notification_user_states')) {
      const notificationIds = new Set((Array.isArray(params[0]) ? params[0] : []).map(String))
      const rows = notificationUserStates.filter((row) =>
        notificationIds.has(String(row.notification_id))
        && (row.is_acknowledged === true || row.acknowledged_at),
      )
      return { rows, rowCount: rows.length }
    }

    if (sql.includes('FROM public.task_conditions')) {
      const projectId = String(params[0] ?? '')
      const materialId = String(params[2] ?? '')
      return {
        rows: conditionRows.filter((row) =>
          String(row.project_id) === projectId
          && String(row.source_ref_id ?? row.source_entity_id ?? '') === materialId,
        ),
        rowCount: conditionRows.length,
      }
    }

    if (sql.includes('INSERT INTO public.material_arrival_to_condition')) {
      auditRows.push({ sql, params })
      return { rows: [], rowCount: 1 }
    }

    return { rows: [], rowCount: 0 }
  })

  return { materials, notifications, taskRows, projectRows, memberRows, participantUnitRows, userRows, notificationUserStates, conditionRows, auditRows, dataQualityFindings, rawQuery }
})

vi.mock('../database.js', () => ({
  query: state.rawQuery,
}))

vi.mock('../services/materialReportsService.js', () => ({
  listProjectMaterials: vi.fn(async (projectId: string) => state.materials.filter((row) => row.project_id === projectId)),
  listMaterialReminderCandidateMaterials: vi.fn(async (projectId: string, options?: { fromDate?: string; toDate?: string }) =>
    state.materials.filter((row) =>
      row.project_id === projectId
      && !row.actual_arrival_date
      && (!options?.fromDate || row.expected_arrival_date >= options.fromDate)
      && (!options?.toDate || row.expected_arrival_date <= options.toDate),
    )),
  listLongOverdueMaterialGovernanceCandidates: vi.fn(async (projectId: string, options?: { beforeDate?: string }) =>
    state.materials.filter((row) =>
      row.project_id === projectId
      && !row.actual_arrival_date
      && Boolean(options?.beforeDate)
      && row.expected_arrival_date < String(options?.beforeDate),
    )),
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: vi.fn(async () => ({ error: null })),
    })),
  },
  executeSQL: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith('SELECT id, status FROM projects')) {
      return state.projectRows
    }

    if (sql.startsWith('SELECT id, owner_id FROM projects')) {
      const projectId = String(params[0] ?? '')
      return state.projectRows.filter((row) => String(row.id) === projectId)
    }

    if (sql.startsWith('SELECT project_id, user_id, permission_level FROM project_members')) {
      const projectId = String(params[0] ?? '')
      return state.memberRows.filter((row) => String(row.project_id) === projectId)
    }

    if (sql.startsWith('SELECT notification_id, user_id, is_acknowledged')) {
      const notificationIds = Array.isArray(params[0]) ? new Set(params[0].map(String)) : null
      return state.notificationUserStates.filter((row) =>
        !notificationIds || notificationIds.has(String(row.notification_id)),
      )
    }

    if (sql.startsWith('SELECT id, project_id, participant_unit_id, planned_start_date, status')) {
      const projectId = String(params[0] ?? '')
      const ids = Array.isArray(params[1]) ? new Set(params[1].map(String)) : null
      const filtersByTaskId = String(sql).includes('id = ANY')
      const filtersByUnitId = String(sql).includes('participant_unit_id = ANY')
      return state.taskRows.filter((row) =>
        String(row.project_id) === projectId
        && (!ids
          ? true
          : (filtersByTaskId && ids.has(String(row.id)))
            || (filtersByUnitId && ids.has(String(row.participant_unit_id ?? '')))),
      )
    }

    return []
  }),
}))

vi.mock('../services/notificationStore.js', () => ({
  listNotifications: vi.fn(async (options: { projectId?: string; sourceEntityType?: string } = {}) =>
    state.notifications.filter((notification) => {
      if (options.projectId && notification.project_id !== options.projectId) return false
      if (options.sourceEntityType && notification.source_entity_type !== options.sourceEntityType) return false
      return true
    })),
  findNotification: vi.fn(async (options: { projectId?: string; sourceEntityType?: string; sourceEntityId?: string; type?: string } = {}) =>
    state.notifications.find((notification) => {
      if (options.projectId && notification.project_id !== options.projectId) return false
      if (options.sourceEntityType && notification.source_entity_type !== options.sourceEntityType) return false
      if (options.sourceEntityId && notification.source_entity_id !== options.sourceEntityId) return false
      if (options.type && notification.type !== options.type) return false
      return true
    }) ?? null),
  insertNotification: vi.fn(async (notification: NotificationRow) => {
    state.notifications.push({ ...notification })
    return notification
  }),
  updateNotificationById: vi.fn(async (id: string, patch: Partial<NotificationRow>) => {
    const index = state.notifications.findIndex((notification) => notification.id === id)
    if (index >= 0) {
      state.notifications[index] = {
        ...state.notifications[index],
        ...patch,
      }
    }
  }),
}))

vi.mock('../services/taskConstraintGovernanceService.js', () => ({
  satisfyCondition: vi.fn(async (conditionId: string) => {
    const condition = state.conditionRows.find((row) => String(row.id) === conditionId)
    return condition ? { taskId: String(condition.task_id ?? '') } : null
  }),
}))

vi.mock('../services/dataQualityService.js', () => ({
  dataQualityService: {
    buildProjectSummary: vi.fn(async (projectId: string) => ({
      projectId,
      month: '2026-04',
      confidence: {},
      prompt: { count: 0, summary: '', items: [] },
      ownerDigest: { shouldNotify: false, severity: 'info', scopeLabel: null, findingCount: 0, summary: '' },
      findings: state.dataQualityFindings.filter((finding) => String(finding.project_id) === projectId),
    })),
  },
}))

import { materialArrivalReminderService } from '../services/materialArrivalReminderService.js'
import { executeSQL } from '../services/dbService.js'
import * as materialReportsService from '../services/materialReportsService.js'

describe('materialArrivalReminderService', () => {
  beforeEach(() => {
    state.materials.splice(0, state.materials.length)
    state.notifications.splice(0, state.notifications.length)
    state.taskRows.splice(0, state.taskRows.length)
    state.projectRows.splice(0, state.projectRows.length)
    state.memberRows.splice(0, state.memberRows.length)
    state.participantUnitRows.splice(0, state.participantUnitRows.length)
    state.userRows.splice(0, state.userRows.length)
    state.notificationUserStates.splice(0, state.notificationUserStates.length)
    state.conditionRows.splice(0, state.conditionRows.length)
    state.auditRows.splice(0, state.auditRows.length)
    state.dataQualityFindings.splice(0, state.dataQualityFindings.length)
    vi.clearAllMocks()

    state.projectRows.push(
      { id: 'project-1', owner_id: 'owner-1', status: '进行中' },
      { id: 'project-2', owner_id: 'owner-2', status: '已完成' },
    )
  })

  it('creates grouped upcoming reminders and daily overdue reminders', async () => {
    state.materials.push(
      {
        id: 'material-1',
        project_id: 'project-1',
        participant_unit_id: 'unit-1',
        participant_unit_name: '幕墙单位',
        material_name: '铝型材',
        specialty_type: '幕墙',
        requires_sample_confirmation: true,
        sample_confirmed: false,
        expected_arrival_date: '2026-04-21',
        actual_arrival_date: null,
        requires_inspection: false,
        inspection_done: false,
        version: 1,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'material-2',
        project_id: 'project-1',
        participant_unit_id: 'unit-1',
        participant_unit_name: '幕墙单位',
        material_name: 'Low-E 玻璃',
        specialty_type: '幕墙',
        requires_sample_confirmation: false,
        sample_confirmed: false,
        expected_arrival_date: '2026-04-22',
        actual_arrival_date: null,
        requires_inspection: false,
        inspection_done: false,
        version: 1,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'material-3',
        project_id: 'project-1',
        participant_unit_id: 'unit-2',
        participant_unit_name: '机电单位',
        material_name: '风管',
        specialty_type: '机电',
        requires_sample_confirmation: false,
        sample_confirmed: false,
        expected_arrival_date: '2026-04-18',
        actual_arrival_date: null,
        requires_inspection: false,
        inspection_done: false,
        version: 1,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
    )
    state.taskRows.push(
      {
        id: 'task-1',
        project_id: 'project-1',
        participant_unit_id: 'unit-1',
        planned_start_date: '2026-04-24',
        status: 'pending',
      },
      {
        id: 'task-2',
        project_id: 'project-1',
        participant_unit_id: 'unit-2',
        planned_start_date: '2026-04-25',
        status: 'in_progress',
      },
    )

    const result = await materialArrivalReminderService.run('project-1', new Date('2026-04-19T09:00:00.000Z'))

    expect(result.notifications).toBe(2)
    expect(result.reminderCount).toBe(1)
    expect(result.overdueCount).toBe(1)

    const upcoming = state.notifications.find((notification) => notification.type === 'material_arrival_reminder')
    expect(upcoming).toMatchObject({
      title: '幕墙单位材料到场提醒',
      source_entity_type: 'project_material',
    })
    expect(upcoming?.metadata?.material_ids).toEqual(['material-1', 'material-2'])

    const overdue = state.notifications.find((notification) => notification.type === 'material_arrival_overdue')
    expect(overdue).toMatchObject({
      title: '机电单位材料逾期未到',
      source_entity_type: 'project_material',
    })
    expect(overdue?.metadata?.material_ids).toEqual(['material-3'])
  })

  it('deduplicates non-overdue reminders within the same natural week', async () => {
    state.materials.push(
      {
        id: 'material-1',
        project_id: 'project-1',
        participant_unit_id: 'unit-1',
        participant_unit_name: '幕墙单位',
        material_name: '铝型材',
        specialty_type: '幕墙',
        requires_sample_confirmation: false,
        sample_confirmed: false,
        expected_arrival_date: '2026-04-21',
        actual_arrival_date: null,
        requires_inspection: false,
        inspection_done: false,
        version: 1,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'material-2',
        project_id: 'project-1',
        participant_unit_id: 'unit-1',
        participant_unit_name: '幕墙单位',
        material_name: 'Low-E 玻璃',
        specialty_type: '幕墙',
        requires_sample_confirmation: false,
        sample_confirmed: false,
        expected_arrival_date: '2026-04-22',
        actual_arrival_date: null,
        requires_inspection: false,
        inspection_done: false,
        version: 1,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
    )
    state.taskRows.push({
      id: 'task-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      planned_start_date: '2026-04-24',
      status: 'pending',
    })
    state.notifications.push({
      id: 'existing-1',
      project_id: 'project-1',
      type: 'material_arrival_reminder',
      source_entity_type: 'project_material',
      source_entity_id: 'project-1:unit-1:2026-04-15:material_arrival_reminder',
      created_at: '2026-04-15T08:00:00.000Z',
      metadata: { material_ids: ['material-1'] },
      title: '旧提醒',
      content: '旧提醒',
    })

    const result = await materialArrivalReminderService.run('project-1', new Date('2026-04-19T09:00:00.000Z'))

    expect(result.notifications).toBe(1)
    expect(state.notifications.at(-1)?.metadata?.material_ids).toEqual(['material-2'])
  })

  it('loads reminder candidate materials through the narrowed candidate reader', async () => {
    state.materials.push(buildMaterial({ id: 'material-1', expected_arrival_date: '2026-04-21' }))
    state.taskRows.push({
      id: 'task-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      planned_start_date: '2026-04-24',
      status: 'pending',
    })

    await materialArrivalReminderService.run('project-1', new Date('2026-04-19T09:00:00.000Z'))

    expect((materialReportsService as any).listMaterialReminderCandidateMaterials).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        fromDate: '2026-01-19',
        toDate: '2026-04-26',
      }),
    )
    expect(materialReportsService.listProjectMaterials).not.toHaveBeenCalled()
  })

  it('treats not_started tasks as open fallback links and sends reminders to task assignees', async () => {
    state.memberRows.push({ project_id: 'project-1', user_id: 'editor-1', permission_level: 'editor' })
    state.materials.push({
      id: 'material-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      participant_unit_name: 'Unit 1',
      material_name: 'Curtain wall panel',
      specialty_type: 'facade',
      requires_sample_confirmation: false,
      sample_confirmed: false,
      expected_arrival_date: '2026-04-21',
      actual_arrival_date: null,
      requires_inspection: false,
      inspection_done: false,
      version: 1,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })
    state.taskRows.push({
      id: 'task-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      planned_start_date: '2026-04-24',
      status: 'not_started',
      assignee_user_id: 'assignee-1',
    })

    const result = await materialArrivalReminderService.run('project-1', new Date('2026-04-19T09:00:00.000Z'))

    expect(result.reminderCount).toBe(1)
    expect(state.notifications.at(-1)?.recipients).toEqual(['owner-1', 'editor-1', 'assignee-1'])
    expect(state.notifications.at(-1)?.metadata?.linked_task_ids).toEqual(['task-1'])
    expect(state.notifications.at(-1)?.metadata?.impacted_task_ids).toEqual(['task-1'])
  })

  it('adds participant unit contact project members as material reminder recipients', async () => {
    state.memberRows.push({ project_id: 'project-1', user_id: 'unit-user-1', permission_level: 'editor' })
    state.userRows.push({ id: 'unit-user-1', email: 'unit.lead@example.com' })
    state.participantUnitRows.push({
      id: 'unit-1',
      project_id: 'project-1',
      contact_email: 'unit.lead@example.com',
    })
    state.materials.push(buildMaterial({ id: 'material-1', participant_unit_id: 'unit-1' }))
    state.taskRows.push({
      id: 'task-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      planned_start_date: '2026-04-24',
      status: 'pending',
    })

    await materialArrivalReminderService.run('project-1', new Date('2026-04-19T09:00:00.000Z'))

    expect(state.notifications.at(-1)?.recipients).toEqual(['owner-1', 'unit-user-1'])
    expect(state.notifications.at(-1)?.metadata?.recipient_sources).toEqual(
      expect.arrayContaining(['project_owner_editor', 'participant_unit_contact_email_member']),
    )
  })

  it('spaces ordinary acknowledged overdue reminders while keeping critical overdue reminders daily', async () => {
    state.materials.push(
      buildMaterial({
        id: 'material-ordinary',
        participant_unit_id: 'unit-1',
        participant_unit_name: 'Unit 1',
        expected_arrival_date: '2026-04-16',
      }),
      buildMaterial({
        id: 'material-critical',
        participant_unit_id: 'unit-2',
        participant_unit_name: 'Unit 2',
        expected_arrival_date: '2026-04-16',
      }),
    )
    state.taskRows.push({
      id: 'task-critical',
      project_id: 'project-1',
      participant_unit_id: 'unit-2',
      planned_start_date: '2026-04-20',
      status: 'pending',
      is_critical: true,
      assignee_user_id: 'assignee-critical',
    })
    state.notifications.push({
      id: 'overdue-ordinary-old',
      project_id: 'project-1',
      type: 'material_arrival_overdue',
      source_entity_type: 'project_material',
      source_entity_id: 'project-1:unit-1:2026-04-18:material_arrival_overdue',
      lifecycle_status: 'active',
      recipients: ['owner-1'],
      created_at: '2026-04-18T08:00:00.000Z',
      metadata: { material_ids: ['material-ordinary'], reminder_kind: 'overdue' },
      title: 'old ordinary overdue',
      content: 'old',
    })
    state.notifications.push({
      id: 'overdue-critical-old',
      project_id: 'project-1',
      type: 'material_arrival_overdue',
      source_entity_type: 'project_material',
      source_entity_id: 'project-1:unit-2:2026-04-18:material_arrival_overdue',
      lifecycle_status: 'active',
      recipients: ['owner-1'],
      created_at: '2026-04-18T08:00:00.000Z',
      metadata: { material_ids: ['material-critical'], reminder_kind: 'overdue' },
      title: 'old critical overdue',
      content: 'old',
    })
    state.notificationUserStates.push({
      notification_id: 'overdue-ordinary-old',
      user_id: 'owner-1',
      is_acknowledged: true,
      acknowledged_at: '2026-04-18T09:00:00.000Z',
    })

    const result = await materialArrivalReminderService.run('project-1', new Date('2026-04-19T09:00:00.000Z'))

    expect(result.overdueCount).toBe(1)
    expect(state.notifications.at(-1)?.metadata?.material_ids).toEqual(['material-critical'])
    expect(state.notifications.at(-1)?.metadata?.cadence_policy).toBe('critical_daily')
  })

  it('only includes unsuppressed materials in a mixed ordinary overdue reminder group', async () => {
    state.materials.push(
      buildMaterial({
        id: 'material-suppressed',
        participant_unit_id: 'unit-1',
        participant_unit_name: 'Unit 1',
        material_name: 'Suppressed panel',
        expected_arrival_date: '2026-04-16',
      }),
      buildMaterial({
        id: 'material-active',
        participant_unit_id: 'unit-1',
        participant_unit_name: 'Unit 1',
        material_name: 'Active panel',
        expected_arrival_date: '2026-04-10',
      }),
    )
    state.notifications.push({
      id: 'overdue-suppressed-old',
      project_id: 'project-1',
      type: 'material_arrival_overdue',
      source_entity_type: 'project_material',
      source_entity_id: 'project-1:unit-1:2026-04-18:material_arrival_overdue',
      lifecycle_status: 'active',
      recipients: ['owner-1'],
      created_at: '2026-04-18T08:00:00.000Z',
      metadata: { material_ids: ['material-suppressed'], reminder_kind: 'overdue' },
      title: 'old ordinary overdue',
      content: 'old',
    })
    state.notificationUserStates.push({
      notification_id: 'overdue-suppressed-old',
      user_id: 'owner-1',
      is_acknowledged: true,
      acknowledged_at: '2026-04-18T09:00:00.000Z',
    })

    await materialArrivalReminderService.run('project-1', new Date('2026-04-19T09:00:00.000Z'))

    const notification = state.notifications.at(-1)
    expect(notification?.metadata?.material_ids).toEqual(['material-active'])
    expect(notification?.metadata?.suppressed_material_ids).toEqual(['material-suppressed'])
    expect(notification?.content).toContain('Active panel')
    expect(notification?.content).not.toContain('Suppressed panel')
  })

  it('does not treat unacknowledged notification user states as acknowledged quiet signals', async () => {
    state.materials.push(buildMaterial({
      id: 'material-unacknowledged',
      participant_unit_id: 'unit-1',
      participant_unit_name: 'Unit 1',
      expected_arrival_date: '2026-04-16',
    }))
    state.notifications.push({
      id: 'overdue-unacknowledged-old',
      project_id: 'project-1',
      type: 'material_arrival_overdue',
      source_entity_type: 'project_material',
      source_entity_id: 'project-1:unit-1:2026-04-18:material_arrival_overdue',
      lifecycle_status: 'active',
      recipients: ['owner-1'],
      created_at: '2026-04-18T08:00:00.000Z',
      metadata: { material_ids: ['material-unacknowledged'], reminder_kind: 'overdue' },
      title: 'old ordinary overdue',
      content: 'old',
    })
    state.notificationUserStates.push({
      notification_id: 'overdue-unacknowledged-old',
      user_id: 'owner-1',
      is_acknowledged: false,
      acknowledged_at: null,
    })

    const result = await materialArrivalReminderService.run('project-1', new Date('2026-04-19T09:00:00.000Z'))

    expect(result.overdueCount).toBe(1)
    expect(state.notifications.at(-1)?.metadata?.material_ids).toEqual(['material-unacknowledged'])
  })

  it('narrows task impact lookup to candidate material task ids and participant units', async () => {
    state.materials.push(buildMaterial({
      id: 'material-1',
      participant_unit_id: 'unit-1',
      linked_task_id: 'task-candidate',
      linked_task_start_date: '2026-04-24',
    }))
    state.taskRows.push(
      {
        id: 'task-candidate',
        project_id: 'project-1',
        participant_unit_id: 'unit-1',
        planned_start_date: '2026-04-24',
        status: 'pending',
      },
      {
        id: 'task-irrelevant',
        project_id: 'project-1',
        participant_unit_id: 'unit-irrelevant',
        planned_start_date: '2026-04-20',
        status: 'pending',
        is_critical: true,
      },
    )

    await materialArrivalReminderService.run('project-1', new Date('2026-04-19T09:00:00.000Z'))

    const taskLookupCalls = (executeSQL as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([sql]) =>
      String(sql).startsWith('SELECT id, project_id, participant_unit_id, planned_start_date, status'),
    )
    expect(taskLookupCalls.map((call) => call[1])).toEqual([
      ['project-1', ['task-candidate']],
      ['project-1', ['unit-1']],
    ])
    expect(state.notifications.at(-1)?.metadata?.linked_task_ids).toEqual(['task-candidate'])
  })

  it('creates a monthly governance summary for long-overdue materials beyond the daily lookback', async () => {
    state.materials.push(buildMaterial({
      id: 'material-long-overdue',
      participant_unit_id: 'unit-1',
      participant_unit_name: 'Unit 1',
      material_name: 'Old unresolved panel',
      expected_arrival_date: '2025-12-01',
    }))

    const result = await materialArrivalReminderService.run('project-1', new Date('2026-04-19T09:00:00.000Z'))

    expect(result.overdueCount).toBe(0)
    expect(result.notifications).toBe(1)
    expect(state.notifications.at(-1)).toMatchObject({
      type: 'material_arrival_long_overdue_governance',
      notification_type: 'business-warning',
      severity: 'warning',
    })
    expect(state.notifications.at(-1)?.metadata).toMatchObject({
      material_ids: ['material-long-overdue'],
      governance_kind: 'long_overdue_summary',
      cadence_policy: 'monthly_governance_summary',
      long_overdue_threshold_days: 90,
      governance_month: '2026-04',
    })
  })

  it('resolves participant unit contacts through the current contact-email schema', async () => {
    state.memberRows.push(
      { project_id: 'project-1', user_id: 'email-user-1', permission_level: 'editor' },
    )
    state.userRows.push({ id: 'email-user-1', email: 'unit.lead@example.com' })
    state.participantUnitRows.push({
      id: 'unit-1',
      project_id: 'project-1',
      contact_email: 'unit.lead@example.com',
    })
    state.materials.push(buildMaterial({ id: 'material-1', participant_unit_id: 'unit-1' }))
    state.taskRows.push({
      id: 'task-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      planned_start_date: '2026-04-24',
      status: 'pending',
    })

    await materialArrivalReminderService.run('project-1', new Date('2026-04-19T09:00:00.000Z'))

    expect(state.notifications.at(-1)?.recipients).toEqual(['owner-1', 'email-user-1'])
    expect(state.notifications.at(-1)?.metadata?.recipient_sources).toEqual(
      expect.arrayContaining(['project_owner_editor', 'participant_unit_contact_email_member']),
    )
    const recipientSql = String(state.rawQuery.mock.calls.find(([sql]) => String(sql).includes('FROM public.participant_units pu'))?.[0] ?? '')
    expect(recipientSql).not.toContain('contact_user_id')
  })

  it('records rule registry policy metadata on material arrival reminders', async () => {
    state.memberRows.push({ project_id: 'project-1', user_id: 'editor-1', permission_level: 'editor' })
    state.materials.push({
      id: 'material-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      participant_unit_name: 'Unit 1',
      material_name: 'Fire damper',
      specialty_type: 'mep',
      requires_sample_confirmation: false,
      sample_confirmed: false,
      expected_arrival_date: '2026-04-21',
      actual_arrival_date: null,
      requires_inspection: false,
      inspection_done: false,
      version: 1,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })
    state.taskRows.push({
      id: 'task-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      planned_start_date: '2026-04-24',
      status: 'not_started',
    })

    await materialArrivalReminderService.run('project-1', new Date('2026-04-19T09:00:00.000Z'))

    const metadata = state.notifications.at(-1)?.metadata
    expect(metadata).toMatchObject({
      rule_id: 'material_arrival_reminder',
      rule_version: 'v1.4.21-p3',
      upcoming_window_days: 7,
      fallback_window_days: 5,
      dedupe_policy: 'upcoming_weekly_overdue_aging_acknowledged_quiet',
      recipient_policy: ['project_owner', 'project_editor', 'impacted_task_assignee', 'participant_unit_contact_email_member'],
      status_policy_open_task_statuses: expect.arrayContaining(['not_started']),
    })
  })

  it('adds execution-impact criticality as priority metadata without creating risk or issue records', async () => {
    state.materials.push({
      id: 'material-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      participant_unit_name: 'Unit 1',
      material_name: 'Curtain wall bracket',
      specialty_type: 'facade',
      requires_sample_confirmation: false,
      sample_confirmed: false,
      expected_arrival_date: '2026-04-18',
      actual_arrival_date: null,
      requires_inspection: false,
      inspection_done: false,
      version: 1,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })
    state.taskRows.push({
      id: 'task-critical',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      planned_start_date: '2026-04-20',
      status: 'pending',
      assignee_user_id: 'assignee-1',
      is_critical: true,
      total_float_days: 0,
      free_float_days: 0,
      successor_count: 6,
      downstream_milestone_distance_days: 5,
      criticality_weight: 1.5,
    })

    await materialArrivalReminderService.run('project-1', new Date('2026-04-19T09:00:00.000Z'))

    const metadata = state.notifications.at(-1)?.metadata
    expect(metadata).toMatchObject({
      reminder_kind: 'overdue',
      impacted_task_ids: ['task-critical'],
      criticality_weight: 1.5,
      criticality_basis: 'cpm_live_projection',
      criticality_basis_factors: expect.arrayContaining(['critical_path', 'zero_free_float', 'high_successor_fanout', 'near_downstream_milestone']),
      priority_policy: 'execution_impact_explain_only',
      weighted_priority_score: expect.any(Number),
    })
    expect(Number(metadata?.weighted_priority_score)).toBeGreaterThan(1)
    expect(state.rawQuery.mock.calls.some(([sql]) => /INSERT INTO public\.(risks|issues|warnings)/i.test(String(sql)))).toBe(false)
  })

  it('uses explicit linked task criticality before participant-unit fallback', async () => {
    state.materials.push({
      id: 'material-1',
      project_id: 'project-1',
      participant_unit_id: 'unit-1',
      participant_unit_name: 'Unit 1',
      material_name: 'AHU unit',
      specialty_type: 'mep',
      requires_sample_confirmation: false,
      sample_confirmed: false,
      expected_arrival_date: '2026-04-21',
      actual_arrival_date: null,
      requires_inspection: false,
      inspection_done: false,
      linked_task_id: 'task-explicit',
      linked_task_start_date: '2026-04-23',
      version: 1,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    } as MaterialRow)
    state.taskRows.push(
      {
        id: 'task-explicit',
        project_id: 'project-1',
        participant_unit_id: 'unit-1',
        planned_start_date: '2026-04-23',
        status: 'pending',
        total_float_days: 0,
        free_float_days: 0,
        successor_count: 5,
        downstream_milestone_distance_days: 6,
        criticality_weight: 1.55,
      },
      {
        id: 'task-fallback',
        project_id: 'project-1',
        participant_unit_id: 'unit-1',
        planned_start_date: '2026-04-24',
        status: 'pending',
        criticality_weight: 1,
      },
    )

    await materialArrivalReminderService.run('project-1', new Date('2026-04-19T09:00:00.000Z'))

    expect(state.notifications.at(-1)?.metadata).toMatchObject({
      linked_task_ids: ['task-explicit'],
      impacted_task_ids: ['task-explicit'],
      link_source: 'material_condition',
      criticality_weight: 1.55,
      criticality_basis_factors: expect.arrayContaining(['zero_total_float', 'zero_free_float']),
    })
  })

  it('adds data-quality degradation metadata as explanation only', async () => {
    state.materials.push({
      id: 'material-1',
      project_id: 'project-1',
      participant_unit_id: null,
      participant_unit_name: null,
      material_name: 'Cable tray',
      specialty_type: 'mep',
      requires_sample_confirmation: false,
      sample_confirmed: false,
      expected_arrival_date: '2026-04-23',
      actual_arrival_date: null,
      requires_inspection: false,
      inspection_done: false,
      version: 1,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })
    state.dataQualityFindings.push({
      id: 'finding-1',
      project_id: 'project-1',
      rule_code: 'MATERIAL_UNIT_MISSING',
      rule_type: 'completeness',
      severity: 'warning',
      summary: 'Material missing participant unit',
      status: 'active',
      entity_type: 'project_material',
      entity_id: 'material-1',
      source_type: 'project_materials',
      details_json: { material_id: 'material-1' },
    })

    await materialArrivalReminderService.run('project-1', new Date('2026-04-19T09:00:00.000Z'))

    expect(state.notifications.at(-1)?.recipients).toEqual(['owner-1'])
    expect(state.notifications.at(-1)?.metadata).toMatchObject({
      material_ids: ['material-1'],
      data_quality_degraded: true,
      data_quality_policy: 'explain_only',
      data_quality_rule_codes: ['MATERIAL_UNIT_MISSING'],
      data_quality_findings: [
        {
          material_id: 'material-1',
          rule_code: 'MATERIAL_UNIT_MISSING',
          severity: 'warning',
        },
      ],
    })
  })

  it('unlocks linked material conditions and resolves existing material reminders after arrival', async () => {
    state.conditionRows.push({
      id: 'condition-1',
      project_id: 'project-1',
      task_id: 'task-1',
      source_type: 'material',
      source_ref_id: 'material-1',
      condition_type: 'material',
      is_satisfied: false,
    })
    state.notifications.push({
      id: 'existing-reminder',
      project_id: 'project-1',
      type: 'material_arrival_reminder',
      source_entity_type: 'project_material',
      source_entity_id: 'project-1:unit-1:2026-04-19:material_arrival_reminder',
      lifecycle_status: 'active',
      recipients: ['owner-1'],
      created_at: '2026-04-19T08:00:00.000Z',
      metadata: { material_ids: ['material-1'] },
      title: 'Material arrival reminder',
      content: 'test',
    })

    const unlockResult = await materialArrivalReminderService.handleMaterialArrived({
      projectId: 'project-1',
      materialId: 'material-1',
      participantUnitId: 'unit-1',
      arrivedAt: '2026-04-20T10:00:00.000Z',
      changedBy: 'user-1',
    })

    expect(unlockResult.conditionUnlockCount).toBe(1)
    expect(unlockResult.conditionIds).toEqual(['condition-1'])
    expect(state.notifications[0]).toMatchObject({
      lifecycle_status: 'resolved',
      status: 'read',
      is_read: true,
      resolved_source: 'source_resolved',
    })
  })

  it('does not resolve grouped material reminders until every referenced material has arrived', async () => {
    state.materials.push(
      buildMaterial({ id: 'material-1', actual_arrival_date: '2026-04-20' }),
      buildMaterial({ id: 'material-2', actual_arrival_date: null }),
    )
    state.notifications.push({
      id: 'grouped-reminder',
      project_id: 'project-1',
      type: 'material_arrival_reminder',
      source_entity_type: 'project_material',
      source_entity_id: 'project-1:unit-1:2026-04-19:material_arrival_reminder',
      lifecycle_status: 'active',
      recipients: ['owner-1'],
      created_at: '2026-04-19T08:00:00.000Z',
      metadata: { material_ids: ['material-1', 'material-2'], reminder_kind: 'upcoming' },
      title: 'Grouped material arrival reminder',
      content: 'test',
    })

    await materialArrivalReminderService.handleMaterialArrived({
      projectId: 'project-1',
      materialId: 'material-1',
      participantUnitId: 'unit-1',
      arrivedAt: '2026-04-20T10:00:00.000Z',
      changedBy: 'user-1',
    })

    expect(state.notifications[0]).toMatchObject({
      lifecycle_status: 'active',
    })
    expect(state.notifications[0]?.metadata?.material_ids).toEqual(['material-2'])
    expect(state.notifications[0]?.metadata?.arrived_material_ids).toEqual(['material-1'])
  })

  it('resolves grouped material reminders when all referenced materials have already arrived', async () => {
    state.materials.push(
      buildMaterial({ id: 'material-1', actual_arrival_date: '2026-04-20' }),
      buildMaterial({ id: 'material-2', actual_arrival_date: '2026-04-20' }),
    )
    state.notifications.push({
      id: 'grouped-reminder',
      project_id: 'project-1',
      type: 'material_arrival_reminder',
      source_entity_type: 'project_material',
      source_entity_id: 'project-1:unit-1:2026-04-19:material_arrival_reminder',
      lifecycle_status: 'active',
      recipients: ['owner-1'],
      created_at: '2026-04-19T08:00:00.000Z',
      metadata: { material_ids: ['material-1', 'material-2'], reminder_kind: 'upcoming' },
      title: 'Grouped material arrival reminder',
      content: 'test',
    })

    await materialArrivalReminderService.handleMaterialArrived({
      projectId: 'project-1',
      materialId: 'material-1',
      participantUnitId: 'unit-1',
      arrivedAt: '2026-04-20T10:00:00.000Z',
      changedBy: 'user-1',
    })

    expect(state.notifications[0]).toMatchObject({
      lifecycle_status: 'resolved',
      status: 'read',
      is_read: true,
      resolved_source: 'source_resolved',
    })
    expect(state.notifications[0]?.metadata?.material_ids).toEqual([])
    expect(state.notifications[0]?.metadata?.arrived_material_ids).toEqual(['material-1', 'material-2'])
  })

  it('only scans active projects when running globally', async () => {
    state.materials.push({
      id: 'material-1',
      project_id: 'project-1',
      participant_unit_id: null,
      participant_unit_name: null,
      material_name: '电梯导轨',
      specialty_type: '电梯',
      requires_sample_confirmation: false,
      sample_confirmed: false,
      expected_arrival_date: '2026-04-23',
      actual_arrival_date: null,
      requires_inspection: false,
      inspection_done: false,
      version: 1,
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
    })

    const result = await materialArrivalReminderService.run(undefined, new Date('2026-04-19T09:00:00.000Z'))

    expect(result.projects).toBe(1)
    expect(result.notifications).toBe(1)
    expect(state.notifications).toHaveLength(1)
    expect(state.notifications[0].project_id).toBe('project-1')
  })

  it('propagates failed project scopes after retrying only those projects', async () => {
    state.projectRows.push({ id: 'project-3', owner_id: 'owner-3', status: 'active' })
    const persist = vi.spyOn(materialArrivalReminderService as any, 'persistProjectNotifications')
      .mockImplementation(async (projectId: string) => {
        if (projectId === 'project-3') throw new Error('reminder failed')
        return []
      })

    await expect(materialArrivalReminderService.run(
      undefined,
      new Date('2026-04-19T09:00:00.000Z'),
    )).rejects.toMatchObject({
      code: 'SCOPED_BATCH_PARTIAL_FAILURE',
      successfulScopeIds: ['project-1'],
      failures: [{ scopeId: 'project-3', attempts: 3, errorMessage: 'reminder failed' }],
    })
    expect(persist.mock.calls.filter(([projectId]) => projectId === 'project-1')).toHaveLength(1)
    expect(persist.mock.calls.filter(([projectId]) => projectId === 'project-3')).toHaveLength(3)
  })
})
