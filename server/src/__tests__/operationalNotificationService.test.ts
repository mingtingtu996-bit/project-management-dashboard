import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
  listNotifications: vi.fn(),
  insertNotification: vi.fn(async (notification: Record<string, unknown>) => notification),
  updateNotificationById: vi.fn(async () => undefined),
  listActiveProjectIds: vi.fn(),
  scanProjectIntegrity: vi.fn(),
  syncProjectMilestoneNotifications: vi.fn(async () => []),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
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

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: state.listActiveProjectIds,
}))

vi.mock('../services/planningIntegrityService.js', () => ({
  PlanningIntegrityService: vi.fn().mockImplementation(() => ({
    scanProjectIntegrity: state.scanProjectIntegrity,
  })),
}))

vi.mock('../services/milestoneIntegrityService.js', () => ({
  MilestoneIntegrityService: vi.fn().mockImplementation(() => ({
    syncProjectMilestoneNotifications: state.syncProjectMilestoneNotifications,
  })),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: state.logger,
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

const { OperationalNotificationService } = await import('../services/operationalNotificationService.js')

describe('operational notification service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.listActiveProjectIds.mockResolvedValue(['project-1'])
    state.scanProjectIntegrity.mockResolvedValue({
      project_id: 'project-1',
      milestone_integrity: {
        project_id: 'project-1',
        summary: { total: 0, aligned: 0, needs_attention: 0, missing_data: 0, blocked: 0 },
        items: [],
      },
      data_integrity: {
        total_tasks: 0,
        missing_participant_unit_count: 0,
        missing_scope_dimension_count: 0,
        missing_progress_snapshot_count: 0,
      },
      mapping_integrity: {
        baseline_pending_count: 0,
        baseline_merged_count: 0,
        monthly_carryover_count: 0,
      },
      system_consistency: {
        inconsistent_milestones: 0,
        stale_snapshot_count: 0,
      },
      passive_reorder: {
        project_id: 'project-1',
        windows: [],
      },
    })
  })

  it('stops emitting snapshot gap notifications and resolves legacy rows', async () => {
    state.executeSQL.mockImplementation(async (query: string) => {
      if (query.includes('FROM tasks WHERE project_id = ?')) {
        return [
          {
            id: 'task-1',
            project_id: 'project-1',
            title: '主体结构',
            status: 'in_progress',
            progress: 35,
            planned_start_date: '2026-04-01',
            planned_end_date: '2026-04-20',
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-13T00:00:00.000Z',
          },
        ]
      }

      return []
    })
    state.listNotifications.mockResolvedValue([
      {
        id: 'notification-1',
        project_id: 'project-1',
        type: 'snapshot_gap',
        source_entity_type: 'task_snapshot_gap',
        source_entity_id: 'task-1',
        status: 'unread',
        is_read: false,
        title: '任务进度快照存在断层',
        content: 'legacy',
        created_at: '2026-04-13T00:00:00.000Z',
      },
    ])

    const notifications = await new OperationalNotificationService().syncProjectNotifications('project-1')

    expect(notifications).toHaveLength(0)
    expect(state.insertNotification).not.toHaveBeenCalled()
    expect(state.updateNotificationById).toHaveBeenCalledWith('notification-1', expect.objectContaining({
      status: 'resolved',
      is_read: true,
    }))
    const taskQuery = String(
      state.executeSQL.mock.calls.find(([query]) => String(query).includes('FROM tasks WHERE project_id = ?'))?.[0],
    )
    expect(taskQuery).not.toContain('SELECT *')
    expect(taskQuery).toContain('planned_start_date')
    expect(taskQuery).toContain('actual_end_date')
  })

  it('serializes project and notification stages to cap database pressure', async () => {
    let active = 0
    let maxActive = 0
    const tracked = async <T>(value: T): Promise<T> => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return value
    }

    state.listActiveProjectIds.mockResolvedValue(['project-1', 'project-2'])
    state.scanProjectIntegrity.mockImplementation(async (projectId: string) => tracked({
      project_id: projectId,
      milestone_integrity: {
        project_id: projectId,
        summary: { total: 0, aligned: 0, needs_attention: 0, missing_data: 0, blocked: 0 },
        items: [],
      },
    }))
    state.syncProjectMilestoneNotifications.mockImplementation(async () => tracked([]))

    const service = new OperationalNotificationService()
    vi.spyOn(service, 'syncProjectNotifications').mockImplementation(async () => tracked([]))
    vi.spyOn(service, 'syncMappingOrphanPointerNotifications').mockImplementation(async () => tracked([]))

    await service.syncAllProjectNotifications()

    expect(maxActive).toBe(1)
  })

  it('continues later notification stages when an earlier stage fails', async () => {
    const service = new OperationalNotificationService()
    vi.spyOn(service, 'syncProjectNotifications').mockRejectedValue(new Error('operational stage failed'))
    const mappingStage = vi.spyOn(service, 'syncMappingOrphanPointerNotifications').mockResolvedValue([])
    state.syncProjectMilestoneNotifications.mockResolvedValue([])

    await service.syncAllProjectNotifications()

    expect(mappingStage).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ project_id: 'project-1' }),
      expect.any(Map),
    )
    expect(state.syncProjectMilestoneNotifications).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ project_id: 'project-1' }),
    )
    expect(state.logger.warn).toHaveBeenCalledWith(
      '[operationalNotificationService] notification stage failed',
      expect.objectContaining({
        projectId: 'project-1',
        stage: 'operational',
        error: 'operational stage failed',
      }),
    )
  })

  it('syncs mapping-orphan and milestone integrity notifications through the all-project entrypoint', async () => {
    state.executeSQL.mockImplementation(async (query: string) => {
      if (query.includes('FROM project_members WHERE project_id = ?')) {
        return [
          {
            project_id: 'project-1',
            user_id: 'owner-1',
            role: 'owner',
            permission_level: 'owner',
          },
        ]
      }

      return []
    })
    state.executeSQLOne.mockImplementation(async (query: string) => {
      if (query.includes('FROM projects WHERE id = ?')) {
        return {
          id: 'project-1',
          owner_id: 'owner-1',
        }
      }

      return null
    })
    state.listNotifications.mockResolvedValue([])
    state.scanProjectIntegrity.mockResolvedValue({
      project_id: 'project-1',
      milestone_integrity: {
        project_id: 'project-1',
        summary: { total: 1, aligned: 0, needs_attention: 1, missing_data: 0, blocked: 0 },
        items: [
          {
            milestone_id: 'milestone-1',
            milestone_key: 'M1',
            title: 'M1 拿地',
            planned_date: '2026-04-01T00:00:00.000Z',
            current_planned_date: '2026-04-02T00:00:00.000Z',
            actual_date: null,
            state: 'needs_attention',
            issues: ['current planned date earlier than baseline date'],
          },
        ],
      },
      data_integrity: {
        total_tasks: 0,
        missing_participant_unit_count: 0,
        missing_scope_dimension_count: 0,
        missing_progress_snapshot_count: 0,
      },
      mapping_integrity: {
        baseline_pending_count: 2,
        baseline_merged_count: 1,
        monthly_carryover_count: 0,
      },
      system_consistency: {
        inconsistent_milestones: 1,
        stale_snapshot_count: 0,
      },
      passive_reorder: {
        project_id: 'project-1',
        windows: [],
      },
    })
    state.syncProjectMilestoneNotifications.mockResolvedValue([
      {
        id: 'notification-m1',
        project_id: 'project-1',
        type: 'milestone_needs_attention',
      },
    ])

    const notifications = await new OperationalNotificationService().syncAllProjectNotifications()

    expect(state.scanProjectIntegrity).toHaveBeenCalledWith('project-1')
    expect(state.insertNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'planning_gov_mapping_orphan_pointer',
      notification_type: 'system-exception',
      source_entity_type: 'planning_governance',
      category: 'planning_mapping_orphan',
      source_entity_id: 'project-1:mapping_orphan_pointer',
    }))
    expect(state.syncProjectMilestoneNotifications).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        project_id: 'project-1',
        summary: expect.objectContaining({ needs_attention: 1 }),
      }),
    )
    expect(notifications.map((item: any) => item.type)).toEqual(expect.arrayContaining([
      'planning_gov_mapping_orphan_pointer',
      'milestone_needs_attention',
    ]))
  })

  it('reuses project recipients within a single project sync', async () => {
    state.executeSQL.mockImplementation(async (query: string) => {
      if (query.includes('FROM tasks WHERE project_id = ?')) {
        return [
          {
            id: 'task-1',
            project_id: 'project-1',
            title: '主体结构',
            status: 'completed',
            progress: 80,
          },
          {
            id: 'task-2',
            project_id: 'project-1',
            title: '机电安装',
            status: 'pending',
            progress: 20,
          },
        ]
      }

      if (query.includes('FROM project_members WHERE project_id = ?')) {
        return [
          {
            project_id: 'project-1',
            user_id: 'owner-1',
            role: 'owner',
            permission_level: 'owner',
          },
        ]
      }

      return []
    })
    state.executeSQLOne.mockImplementation(async (query: string) => {
      if (query.includes('FROM projects WHERE id = ?')) {
        return {
          id: 'project-1',
          owner_id: 'owner-1',
        }
      }

      return null
    })
    state.listNotifications.mockResolvedValue([])

    const notifications = await new OperationalNotificationService().syncProjectNotifications('project-1')

    expect(notifications).toHaveLength(2)
    expect(state.insertNotification).toHaveBeenCalledTimes(2)
    expect(
      state.executeSQL.mock.calls.filter(([query]) => String(query).includes('FROM project_members WHERE project_id = ?')),
    ).toHaveLength(1)
    expect(
      state.executeSQLOne.mock.calls.filter(([query]) => String(query).includes('FROM projects WHERE id = ?')),
    ).toHaveLength(1)
  })
})
