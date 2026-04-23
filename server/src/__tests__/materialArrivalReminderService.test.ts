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
}

type NotificationRow = {
  id: string
  project_id?: string | null
  type: string
  source_entity_type?: string | null
  source_entity_id?: string | null
  created_at: string
  metadata?: Record<string, unknown> | null
  title: string
  content: string
}

const state = vi.hoisted(() => {
  const materials: MaterialRow[] = []
  const notifications: NotificationRow[] = []
  const taskRows: Array<Record<string, unknown>> = []
  const projectRows: Array<Record<string, unknown>> = []
  const memberRows: Array<Record<string, unknown>> = []

  return { materials, notifications, taskRows, projectRows, memberRows }
})

vi.mock('../services/materialReportsService.js', () => ({
  listProjectMaterials: vi.fn(async (projectId: string) => state.materials.filter((row) => row.project_id === projectId)),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith('SELECT id, status FROM projects')) {
      return state.projectRows
    }

    if (sql.startsWith('SELECT id, owner_id FROM projects')) {
      const projectId = String(params[0] ?? '')
      return state.projectRows.filter((row) => String(row.id) === projectId)
    }

    if (sql.startsWith('SELECT project_id, user_id, role, permission_level FROM project_members')) {
      const projectId = String(params[0] ?? '')
      return state.memberRows.filter((row) => String(row.project_id) === projectId)
    }

    if (sql.startsWith('SELECT id, project_id, participant_unit_id, planned_start_date, status FROM tasks')) {
      const projectId = String(params[0] ?? '')
      return state.taskRows.filter((row) => String(row.project_id) === projectId)
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
}))

import { materialArrivalReminderService } from '../services/materialArrivalReminderService.js'

describe('materialArrivalReminderService', () => {
  beforeEach(() => {
    state.materials.splice(0, state.materials.length)
    state.notifications.splice(0, state.notifications.length)
    state.taskRows.splice(0, state.taskRows.length)
    state.projectRows.splice(0, state.projectRows.length)
    state.memberRows.splice(0, state.memberRows.length)
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
})
