import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
  executeSQLOne: vi.fn(),
  listTaskProgressSnapshotsByTaskIds: vi.fn(async () => []),
  listActiveProjectIds: vi.fn(async () => ['project-1']),
  findNotification: vi.fn(async () => null),
  insertNotification: vi.fn(async (notification: Record<string, unknown>) => notification),
  enqueueProjectHealthUpdate: vi.fn(),
  evaluateProjectHealth: vi.fn(),
  scanProjectIntegrity: vi.fn(),
  scanProjectPassiveReorder: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
  listTaskProgressSnapshotsByTaskIds: mocks.listTaskProgressSnapshotsByTaskIds,
}))

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: mocks.listActiveProjectIds,
}))

vi.mock('../services/notificationStore.js', () => ({
  findNotification: mocks.findNotification,
  insertNotification: mocks.insertNotification,
}))

vi.mock('../services/projectHealthService.js', () => ({
  enqueueProjectHealthUpdate: mocks.enqueueProjectHealthUpdate,
}))

vi.mock('../services/planningHealthService.js', () => ({
  PlanningHealthService: vi.fn().mockImplementation(() => ({
    evaluateProjectHealth: mocks.evaluateProjectHealth,
    scanAllProjectHealth: vi.fn(async () => []),
  })),
}))

vi.mock('../services/planningIntegrityService.js', () => ({
  PlanningIntegrityService: vi.fn().mockImplementation(() => ({
    scanProjectIntegrity: mocks.scanProjectIntegrity,
    scanAllProjectIntegrity: vi.fn(async () => []),
  })),
}))

vi.mock('../services/systemAnomalyService.js', () => ({
  SystemAnomalyService: vi.fn().mockImplementation(() => ({
    scanProjectPassiveReorder: mocks.scanProjectPassiveReorder,
    scanAllProjectPassiveReorder: vi.fn(async () => []),
  })),
}))

describe('planning governance notification persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listTaskProgressSnapshotsByTaskIds.mockResolvedValue([])

    mocks.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      owner_id: 'owner-1',
    })

    mocks.executeSQL.mockImplementation(async (sql: string) => {
      const normalized = sql.toLowerCase().replace(/\s+/g, ' ').trim()
      if (normalized.startsWith('select project_id, user_id, permission_level from project_members')) {
        return [
          { project_id: 'project-1', user_id: 'owner-1', permission_level: 'owner' },
        ]
      }
      if (normalized.startsWith('select * from monthly_plans where project_id = ?')) {
        return []
      }
      if (normalized.startsWith('select * from tasks where project_id = ?')) {
        return []
      }
      return []
    })

    mocks.evaluateProjectHealth.mockResolvedValue({
      project_id: 'project-1',
      score: 90,
      status: 'healthy',
      label: '健康',
      breakdown: {
        data_integrity_score: 90,
        mapping_integrity_score: 60,
        system_consistency_score: 90,
        m1_m9_score: 60,
        passive_reorder_penalty: 0,
        total_score: 90,
      },
    })

    mocks.scanProjectIntegrity.mockResolvedValue({
      project_id: 'project-1',
      milestone_integrity: {
        project_id: 'project-1',
        summary: {
          total: 2,
          aligned: 0,
          needs_attention: 1,
          missing_data: 1,
          blocked: 0,
        },
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
          {
            milestone_id: 'milestone-2',
            milestone_key: 'M2',
            title: 'M2 开工',
            planned_date: '2026-04-02T00:00:00.000Z',
            current_planned_date: '2026-04-03T00:00:00.000Z',
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
        inconsistent_milestones: 2,
        stale_snapshot_count: 0,
      },
      passive_reorder: {
        project_id: 'project-1',
        detected_at: '2026-04-18T00:00:00.000Z',
        total_events: 0,
        windows: [
          { window_days: 3, event_count: 0, affected_task_count: 0, cumulative_event_count: 0, triggered: false },
          { window_days: 5, event_count: 0, affected_task_count: 0, cumulative_event_count: 0, triggered: false },
          { window_days: 7, event_count: 0, affected_task_count: 0, cumulative_event_count: 0, triggered: false },
        ],
      },
    })

    mocks.scanProjectPassiveReorder.mockResolvedValue({
      project_id: 'project-1',
      detected_at: '2026-04-18T00:00:00.000Z',
      total_events: 0,
      windows: [
        { window_days: 3, event_count: 0, affected_task_count: 0, cumulative_event_count: 0, triggered: false },
        { window_days: 5, event_count: 0, affected_task_count: 0, cumulative_event_count: 0, triggered: false },
        { window_days: 7, event_count: 0, affected_task_count: 0, cumulative_event_count: 0, triggered: false },
      ],
    })
  })

  it('persists dedicated notification types for mapping orphan pointers and milestone scenarios', async () => {
    const { planningGovernanceService } = await import('../services/planningGovernanceService.js')
    const notifications = await planningGovernanceService.persistProjectGovernanceNotifications('project-1')

    expect(notifications).toHaveLength(4)
    expect(mocks.insertNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'planning_gov_mapping_orphan_pointer',
      notification_type: 'planning-governance-mapping',
      category: 'planning_mapping_orphan',
      source_entity_id: 'project-1:mapping_orphan_pointer',
    }))
    expect(mocks.insertNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'planning_gov_milestone_missing_data',
      notification_type: 'planning-governance-milestone',
      source_entity_id: 'project-1:milestone:milestone-1:milestone_missing_data',
    }))
    expect(mocks.insertNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'planning_gov_milestone_needs_attention',
      notification_type: 'planning-governance-milestone',
      source_entity_id: 'project-1:milestone:milestone-2:milestone_needs_attention',
    }))
    expect(mocks.enqueueProjectHealthUpdate).toHaveBeenCalledWith('project-1', 'planning_governance_notification')
  })

  it('persists closeout, reorder and ad_hoc governance alerts with scene-specific notification types', async () => {
    mocks.listTaskProgressSnapshotsByTaskIds.mockResolvedValue([
      { id: 'snapshot-1', task_id: 'task-1', snapshot_date: '2026-01-15', planning_source_type: 'execution' },
      { id: 'snapshot-2', task_id: 'task-1', snapshot_date: '2026-02-15', planning_source_type: 'execution' },
      { id: 'snapshot-3', task_id: 'task-1', snapshot_date: '2026-03-15', planning_source_type: 'execution' },
    ])

    mocks.executeSQL.mockImplementation(async (sql: string) => {
      const normalized = sql.toLowerCase().replace(/\s+/g, ' ').trim()
      if (normalized.startsWith('select project_id, user_id, permission_level from project_members')) {
        return [{ project_id: 'project-1', user_id: 'owner-1', permission_level: 'owner' }]
      }
      if (normalized.startsWith('select * from monthly_plans where project_id = ?')) {
        return [{
          id: 'monthly-1',
          project_id: 'project-1',
          month: '2026-03',
          title: '四月计划',
          status: 'confirmed',
          closeout_at: null,
        }]
      }
      if (normalized.startsWith('select * from tasks where project_id = ?')) {
        return [{
          id: 'task-1',
          project_id: 'project-1',
          title: '临时协调任务',
          task_source: 'ad_hoc',
        }]
      }
      return []
    })

    mocks.scanProjectIntegrity.mockResolvedValue({
      project_id: 'project-1',
      milestone_integrity: {
        project_id: 'project-1',
        summary: { total: 0, aligned: 0, needs_attention: 0, missing_data: 0, blocked: 0 },
        items: [],
      },
      data_integrity: {
        total_tasks: 1,
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
        detected_at: '2026-04-18T00:00:00.000Z',
        total_events: 3,
        windows: [
          { window_days: 3, event_count: 3, affected_task_count: 1, cumulative_event_count: 3, triggered: true, key_task_count: 1, average_offset_days: 2 },
          { window_days: 5, event_count: 0, affected_task_count: 0, cumulative_event_count: 3, triggered: false },
          { window_days: 7, event_count: 0, affected_task_count: 0, cumulative_event_count: 3, triggered: false },
        ],
      },
    })

    mocks.scanProjectPassiveReorder.mockResolvedValue({
      project_id: 'project-1',
      detected_at: '2026-04-18T00:00:00.000Z',
      total_events: 3,
      windows: [
        { window_days: 3, event_count: 3, affected_task_count: 1, cumulative_event_count: 3, triggered: true, key_task_count: 1, average_offset_days: 2 },
        { window_days: 5, event_count: 0, affected_task_count: 0, cumulative_event_count: 3, triggered: false },
        { window_days: 7, event_count: 0, affected_task_count: 0, cumulative_event_count: 3, triggered: false },
      ],
    })

    const { planningGovernanceService } = await import('../services/planningGovernanceService.js')
    await planningGovernanceService.persistProjectGovernanceNotifications('project-1')

    expect(mocks.insertNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'planning_gov_closeout_reminder',
      notification_type: 'planning-governance-closeout',
    }))
    expect(mocks.insertNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'planning_gov_reorder_reminder',
      notification_type: 'planning-governance-reorder',
    }))
    expect(mocks.insertNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'planning_gov_ad_hoc_cross_month_reminder',
      notification_type: 'planning-governance-ad-hoc',
      task_id: 'task-1',
    }))
  })
})
