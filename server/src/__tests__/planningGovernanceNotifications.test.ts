import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const supabaseUpsert = vi.fn(async () => ({ error: null }))
  return {
    executeSQL: vi.fn(),
    executeSQLOne: vi.fn(),
    listTaskProgressSnapshotsByTaskIds: vi.fn(async () => []),
    listActiveProjectIds: vi.fn(async () => ['project-1']),
    findNotification: vi.fn(async () => null),
    insertNotification: vi.fn(async (notification: Record<string, unknown>) => notification),
    updateNotificationById: vi.fn(async () => undefined),
    supabaseFrom: vi.fn(() => ({ upsert: supabaseUpsert })),
    supabaseUpsert,
    enqueueProjectHealthUpdate: vi.fn(),
    evaluateProjectHealth: vi.fn(),
    scanProjectIntegrity: vi.fn(),
    scanProjectPassiveReorder: vi.fn(),
    writeLog: vi.fn(async () => undefined),
  }
})

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
  listTaskProgressSnapshotsByTaskIds: mocks.listTaskProgressSnapshotsByTaskIds,
  supabase: {
    from: mocks.supabaseFrom,
  },
}))

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: mocks.listActiveProjectIds,
}))

vi.mock('../services/notificationStore.js', () => ({
  findNotification: mocks.findNotification,
  insertNotification: mocks.insertNotification,
  updateNotificationById: mocks.updateNotificationById,
}))

vi.mock('../services/projectHealthService.js', () => ({
  enqueueProjectHealthUpdate: mocks.enqueueProjectHealthUpdate,
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLog: mocks.writeLog,
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

import { planningGovernanceService } from '../services/planningGovernanceService.js'

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
      if (normalized.includes('from tasks where project_id = ?')) {
        return []
      }
      if (normalized.startsWith('select id, status from task_baselines where project_id = ?')) {
        return []
      }
      if (normalized.startsWith('select id, status from monthly_plans where project_id = ?')) {
        return []
      }
      if (normalized.startsWith('select * from task_constraint_snapshots where project_id = ?')) {
        return []
      }
      if (normalized.startsWith('select * from project_schedule_states where project_id = ?')) {
        return []
      }
      if (normalized.startsWith('select * from task_duration_forecasts where project_id = ?')) {
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
    mocks.supabaseFrom.mockReturnValue({ upsert: mocks.supabaseUpsert })
    mocks.supabaseUpsert.mockResolvedValue({ error: null })

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

  it('keeps project governance database work sequential within a constrained pool', async () => {
    const executeSQLImpl = mocks.executeSQL.getMockImplementation() as (...args: unknown[]) => unknown
    const healthImpl = mocks.evaluateProjectHealth.getMockImplementation() as (...args: unknown[]) => unknown
    const integrityImpl = mocks.scanProjectIntegrity.getMockImplementation() as (...args: unknown[]) => unknown
    const anomalyImpl = mocks.scanProjectPassiveReorder.getMockImplementation() as (...args: unknown[]) => unknown
    let active = 0
    let maxActive = 0

    const track = async <T>(work: () => T | Promise<T>): Promise<T> => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      try {
        return await work()
      } finally {
        active -= 1
      }
    }

    mocks.executeSQL.mockImplementation((...args: unknown[]) => track(() => executeSQLImpl(...args)))
    mocks.evaluateProjectHealth.mockImplementation((...args: unknown[]) => track(() => healthImpl(...args)))
    mocks.scanProjectIntegrity.mockImplementation((...args: unknown[]) => track(() => integrityImpl(...args)))
    mocks.scanProjectPassiveReorder.mockImplementation((...args: unknown[]) => track(() => anomalyImpl(...args)))

    await planningGovernanceService.scanProjectGovernance('project-1')

    expect(maxActive).toBe(1)
    const taskQuery = String(
      mocks.executeSQL.mock.calls.find((call) => /from\s+tasks\s+where\s+project_id/i.test(String(call[0])))?.[0] ?? '',
    )
    expect(taskQuery).not.toMatch(/select\s+\*/i)
    expect(taskQuery).not.toContain('CASE')
    expect(taskQuery).not.toContain('task_source')
    expect(taskQuery).toContain('monthly_plan_item_id')
  })

  it('serializes recipient reads across the governance persistence entrypoint', async () => {
    const executeSQLImpl = mocks.executeSQL.getMockImplementation() as (...args: unknown[]) => unknown
    const executeSQLOneImpl = mocks.executeSQLOne.getMockImplementation() as (...args: unknown[]) => unknown
    let active = 0
    let maxActive = 0
    const track = async <T>(work: () => T | Promise<T>): Promise<T> => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      try {
        return await work()
      } finally {
        active -= 1
      }
    }

    mocks.executeSQL.mockImplementation((...args: unknown[]) => track(() => executeSQLImpl(...args)))
    mocks.executeSQLOne.mockImplementation((...args: unknown[]) => track(() => executeSQLOneImpl(...args)))

    await planningGovernanceService.persistProjectGovernanceNotifications('project-1')

    expect(maxActive).toBe(1)
  })

  it('keeps manual reorder startup reads narrow and serialized', async () => {
    const executeSQLImpl = mocks.executeSQL.getMockImplementation() as (...args: unknown[]) => unknown
    let active = 0
    let maxActive = 0
    const track = async <T>(work: () => T | Promise<T>): Promise<T> => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      try {
        return await work()
      } finally {
        active -= 1
      }
    }

    mocks.executeSQL.mockImplementation((...args: unknown[]) => track(() => executeSQLImpl(...args)))

    await planningGovernanceService.startProjectReorderSession({ projectId: 'project-1' })

    const taskQuery = String(
      mocks.executeSQL.mock.calls.find((call) => /from\s+tasks\s+where\s+project_id/i.test(String(call[0])))?.[0] ?? '',
    )
    expect(taskQuery).not.toMatch(/select\s+\*/i)
    expect(taskQuery).toContain('is_milestone')
    expect(maxActive).toBe(1)
  })

  it('persists dedicated notification types for mapping orphan pointers and milestone scenarios', async () => {
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
      if (normalized.includes('from tasks where project_id = ?')) {
        return [{
          id: 'task-1',
          project_id: 'project-1',
          title: '临时协调任务',
          task_source: 'ad_hoc',
        }]
      }
      if (normalized.startsWith('select id, status from task_baselines where project_id = ?')) {
        return []
      }
      if (normalized.startsWith('select id, status from monthly_plans where project_id = ?')) {
        return []
      }
      if (normalized.startsWith('select * from task_constraint_snapshots where project_id = ?')) {
        return []
      }
      if (normalized.startsWith('select * from project_schedule_states where project_id = ?')) {
        return []
      }
      if (normalized.startsWith('select * from task_duration_forecasts where project_id = ?')) {
        return []
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

  it('includes persisted algorithm facts in planning governance snapshot signals', async () => {
    mocks.listTaskProgressSnapshotsByTaskIds.mockResolvedValue([
      { id: 'snapshot-1', task_id: 'task-9', snapshot_date: '2026-04-01', progress: 10 },
      { id: 'snapshot-2', task_id: 'task-9', snapshot_date: '2026-04-02', progress: 90 },
    ])

    mocks.executeSQL.mockImplementation(async (sql: string) => {
      const normalized = sql.toLowerCase().replace(/\s+/g, ' ').trim()
      if (normalized.startsWith('select project_id, user_id, permission_level from project_members')) {
        return [{ project_id: 'project-1', user_id: 'owner-1', permission_level: 'owner' }]
      }
      if (normalized.startsWith('select * from monthly_plans where project_id = ?')) {
        return []
      }
      if (normalized.includes('from tasks where project_id = ?')) {
        return [
          { id: 'task-8', project_id: 'project-1', title: 'constraint task' },
          { id: 'task-9', project_id: 'project-1', title: 'progress task' },
        ]
      }
      if (normalized.startsWith('select id, status from task_baselines where project_id = ?')) {
        return [{ id: 'baseline-pending', status: 'pending_realign' }]
      }
      if (normalized.startsWith('select id, status from monthly_plans where project_id = ?')) {
        return []
      }
      if (normalized.startsWith('select * from task_constraint_snapshots where project_id = ?')) {
        return [{
          id: 'constraint-snapshot-1',
          task_id: 'task-8',
          ready_for_start: false,
          dependency_status: 'blocking',
          condition_status: 'satisfied',
          obstacle_status: 'clear',
          progress_impact_level: 'none',
          blocked_for_progress: false,
          readiness_summary: {
            unmetDependencyCount: 1,
            unmetHardConditionCount: 0,
          },
          source_event_type: 'task_dependency_changed',
          source_event_key: 'task_dependency_changed:task-8',
          created_at: '2026-04-10T00:00:00.000Z',
        }]
      }
      if (normalized.startsWith('select * from project_schedule_states where project_id = ?')) {
        return [{
          id: 'schedule-state-1',
          scope_type: 'project',
          scope_id: 'project',
          state: 'blocked',
          confidence_score: 0.82,
          window_days: 14,
          window_end_date: '2026-04-10',
          metrics: { throughput_ratio: 0.72 },
          downstream_policy: { allowAcceleration: false },
        }]
      }
      if (normalized.startsWith('select * from task_duration_forecasts where project_id = ?')) {
        return [{
          id: 'forecast-1',
          task_id: 'task-9',
          forecast_delay_days: 6,
          confidence_level: 'medium',
          confidence_score: 68,
          delay_risk_index: 0.75,
          business_reason: 'remaining duration exceeds plan window',
          factor_summary: { topFactors: ['progress_velocity'] },
          calculation_context: { dataMaturity: 'L1' },
          generated_at: '2026-04-10T00:00:00.000Z',
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
        total_tasks: 2,
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
        total_events: 0,
        windows: [],
      },
    })

    mocks.scanProjectPassiveReorder.mockResolvedValue({
      project_id: 'project-1',
      detected_at: '2026-04-18T00:00:00.000Z',
      total_events: 0,
      windows: [],
    })

    const snapshot = await planningGovernanceService.scanProjectGovernance('project-1')

    expect(snapshot.governanceSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceAlgorithm: 'planning_revision_pool',
        gateLevel: 'confirm',
        targetSurface: 'baseline',
        sourceId: 'project-1:planning_revision_pool:baseline-pending',
      }),
      expect.objectContaining({
        sourceAlgorithm: 'task_constraint',
        gateLevel: 'confirm',
        targetSurface: 'monthly_plan',
        taskId: 'task-8',
      }),
      expect.objectContaining({
        sourceAlgorithm: 'progress_anomaly',
        gateLevel: 'confirm',
        targetSurface: 'planning_governance',
        taskId: 'task-9',
      }),
      expect.objectContaining({
        sourceAlgorithm: 'project_schedule_state',
        gateLevel: 'hint',
        targetSurface: 'planning_governance',
      }),
      expect.objectContaining({
        sourceAlgorithm: 'task_duration_forecast',
        gateLevel: 'hint',
        targetSurface: 'planning_governance',
        taskId: 'task-9',
      }),
    ]))
    expect(snapshot.governanceSignals.some((signal) => signal.sourceAlgorithm === 'progress_anomaly' && signal.gateLevel === 'block_save')).toBe(false)
    expect(snapshot.governanceSignals.some((signal) => signal.sourceAlgorithm === 'task_duration_forecast' && signal.gateLevel === 'block_save')).toBe(false)
  })
})
