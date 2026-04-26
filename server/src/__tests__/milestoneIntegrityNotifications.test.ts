import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
  listNotifications: vi.fn(),
  insertNotification: vi.fn(async (notification: Record<string, unknown>) => notification),
  updateNotificationById: vi.fn(async () => undefined),
  writeLog: vi.fn(async () => undefined),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: state.executeSQL,
  executeSQLOne: state.executeSQLOne,
}))

vi.mock('../services/notificationStore.js', () => ({
  listNotifications: state.listNotifications,
  insertNotification: state.insertNotification,
  updateNotificationById: state.updateNotificationById,
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLog: state.writeLog,
}))

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: vi.fn(async () => ['project-1']),
}))

const { MilestoneIntegrityService } = await import('../services/milestoneIntegrityService.js')

describe('milestone integrity notification sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      owner_id: 'owner-1',
    })
    state.executeSQL.mockResolvedValue([
      { project_id: 'project-1', user_id: 'owner-1', permission_level: 'owner' },
    ])
    state.listNotifications.mockResolvedValue([])
  })

  it('persists per-milestone notifications for non-aligned M1-M9 scenes', async () => {
    const notifications = await new MilestoneIntegrityService().syncProjectMilestoneNotifications(
      'project-1',
      {
        project_id: 'project-1',
        summary: { total: 1, aligned: 0, needs_attention: 0, missing_data: 1, blocked: 0 },
        items: [
          {
            milestone_id: 'milestone-1',
            milestone_key: 'M1',
            title: 'M1 拿地',
            planned_date: '2026-04-01T00:00:00.000Z',
            current_planned_date: '2026-04-01T00:00:00.000Z',
            actual_date: null,
            state: 'missing_data',
            issues: ['missing actual date for completed milestone'],
          },
        ],
      },
    )

    expect(state.insertNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'milestone_mapping_pending',
      notification_type: 'planning-governance-milestone',
      source_entity_type: 'milestone_integrity',
      source_entity_id: 'milestone-1',
      category: 'planning_governance',
    }))
    expect(state.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1',
      entity_type: 'milestone',
      entity_id: 'milestone-1',
      field_name: 'integrity_state',
      old_value: null,
      new_value: 'missing_data',
      change_source: 'system_auto',
    }))
    expect(notifications).toHaveLength(1)
  })

  it('resolves obsolete milestone notifications when the scene is aligned again', async () => {
    state.listNotifications.mockResolvedValue([
      {
        id: 'notification-1',
        project_id: 'project-1',
        type: 'milestone_mapping_pending',
        source_entity_type: 'milestone_integrity',
        source_entity_id: 'milestone-1',
        status: 'unread',
        is_read: false,
      },
    ])

    const notifications = await new MilestoneIntegrityService().syncProjectMilestoneNotifications(
      'project-1',
      {
        project_id: 'project-1',
        summary: { total: 1, aligned: 1, needs_attention: 0, missing_data: 0, blocked: 0 },
        items: [
          {
            milestone_id: 'milestone-1',
            milestone_key: 'M1',
            title: 'M1 拿地',
            planned_date: '2026-04-01T00:00:00.000Z',
            current_planned_date: '2026-04-01T00:00:00.000Z',
            actual_date: '2026-04-01T00:00:00.000Z',
            state: 'aligned',
            issues: [],
          },
        ],
      },
    )

    expect(notifications).toHaveLength(0)
    expect(state.updateNotificationById).toHaveBeenCalledWith('notification-1', expect.objectContaining({
      status: 'resolved',
      is_read: true,
    }))
    expect(state.writeLog).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1',
      entity_type: 'milestone',
      entity_id: 'milestone-1',
      field_name: 'integrity_state',
      old_value: 'needs_attention',
      new_value: 'aligned',
      change_reason: '里程碑一致性恢复',
      change_source: 'system_auto',
    }))
  })
})
