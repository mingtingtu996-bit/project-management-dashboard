import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  selectRows: [] as any[],
  upsertRows: [] as any[],
  executeSQL: vi.fn(),
  listTaskProgressSnapshotsByTaskIds: vi.fn(async () => []),
  getProjectCriticalPathSnapshot: vi.fn(async () => ({
    projectId: 'project-1',
    autoTaskIds: ['task-critical'],
    manualAttentionTaskIds: [],
    manualInsertedTaskIds: [],
    primaryChain: {
      id: 'primary',
      source: 'auto',
      taskIds: ['task-critical'],
      totalDurationDays: 0,
      displayLabel: '关键路径',
    },
    alternateChains: [],
    displayTaskIds: ['task-critical'],
    watchedTaskIds: [],
    edges: [],
    tasks: [],
    projectDurationDays: 0,
    calculatedAt: '2026-04-18T12:00:00.000Z',
  })),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: state.executeSQL,
  listTaskProgressSnapshotsByTaskIds: state.listTaskProgressSnapshotsByTaskIds,
  supabase: {
    from: vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        limit: vi.fn(async () => ({ data: state.selectRows, error: null })),
        upsert: vi.fn((payload: any) => {
          state.upsertRows = [payload]
          state.selectRows = [payload]
          return builder
        }),
        single: vi.fn(async () => ({ data: state.selectRows[0] ?? null, error: null })),
      }
      return builder
    }),
  },
}))

vi.mock('../services/notificationStore.js', () => ({
  insertNotification: vi.fn(),
  listNotifications: vi.fn(async () => []),
  updateNotificationById: vi.fn(),
}))

vi.mock('../services/projectCriticalPathService.js', () => ({
  getProjectCriticalPathSnapshot: state.getProjectCriticalPathSnapshot,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('DataQualityService project settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.selectRows = []
    state.upsertRows = []
    state.getProjectCriticalPathSnapshot.mockResolvedValue({
      projectId: 'project-1',
      autoTaskIds: ['task-critical'],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: {
        id: 'primary',
        source: 'auto',
        taskIds: ['task-critical'],
        totalDurationDays: 0,
        displayLabel: '关键路径',
      },
      alternateChains: [],
      displayTaskIds: ['task-critical'],
      watchedTaskIds: [],
      edges: [],
      tasks: [],
      projectDurationDays: 0,
      calculatedAt: '2026-04-18T12:00:00.000Z',
    })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-18T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns normalized default weights when no project override exists', async () => {
    const { DataQualityService } = await import('../services/dataQualityService.js')
    const service = new DataQualityService()

    const settings = await service.getProjectSettings('project-1')

    expect(settings).toMatchObject({
      projectId: 'project-1',
      isDefault: true,
      weights: {
        timeliness: 0.3,
        anomaly: 0.25,
        consistency: 0.2,
        jumpiness: 0.1,
        coverage: 0.15,
      },
    })
  })

  it('uses project weights when building confidence scores', async () => {
    const { DataQualityService } = await import('../services/dataQualityService.js')
    const service = new DataQualityService()

    const tasks = [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: '任务 1',
        status: 'in_progress',
        progress: 20,
        updated_at: '2026-04-01T00:00:00.000Z',
        created_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'task-2',
        project_id: 'project-1',
        title: '任务 2',
        status: 'in_progress',
        progress: 60,
        updated_at: '2026-04-17T00:00:00.000Z',
        created_at: '2026-04-01T00:00:00.000Z',
      },
    ] as any

    const snapshots = [
      {
        id: 'snapshot-1',
        task_id: 'task-2',
        progress: 60,
        snapshot_date: '2026-04-17T00:00:00.000Z',
        created_at: '2026-04-17T00:00:00.000Z',
      },
    ] as any

    const findings = [
      {
        id: 'finding-1',
        project_id: 'project-1',
        task_id: 'task-1',
        rule_type: 'anomaly',
        rule_code: 'SNAPSHOT_GAP',
        status: 'active',
        severity: 'warning',
      },
    ] as any

    const mostlyTimeliness = (service as any).computeConfidence('2026-04', tasks, snapshots, findings, {
      timeliness: 1,
      anomaly: 0,
      consistency: 0,
      jumpiness: 0,
      coverage: 0,
    })
    const mostlyConsistency = (service as any).computeConfidence('2026-04', tasks, snapshots, findings, {
      timeliness: 0,
      anomaly: 0,
      consistency: 1,
      jumpiness: 0,
      coverage: 0,
    })

    expect(mostlyTimeliness.score).toBe(50)
    expect(mostlyConsistency.score).toBe(100)
    expect(mostlyConsistency.weights.consistency).toBe(1)
    expect(mostlyTimeliness.dimensions[0]).toMatchObject({
      key: 'timeliness',
      lossContribution: 50,
    })
  })

  it('previews live cross-check prompts for the edited task draft', async () => {
    state.executeSQL.mockImplementation(async (query: string) => {
      if (query.includes('FROM tasks WHERE project_id = ?')) {
        return [
          {
            id: 'task-parent',
            project_id: 'project-1',
            title: '主体结构',
            status: 'completed',
            progress: 100,
            updated_at: '2026-04-18T00:00:00.000Z',
            created_at: '2026-04-01T00:00:00.000Z',
          },
          {
            id: 'task-child',
            project_id: 'project-1',
            title: '二层梁板施工',
            parent_id: 'task-parent',
            status: 'pending',
            progress: 0,
            updated_at: '2026-04-18T00:00:00.000Z',
            created_at: '2026-04-01T00:00:00.000Z',
          },
        ]
      }

      if (query.includes('FROM task_conditions WHERE project_id = ?')) {
        return []
      }

      if (query.includes('FROM task_progress_snapshots WHERE task_id IN')) {
        return []
      }

      return []
    })

    const { DataQualityService } = await import('../services/dataQualityService.js')
    const service = new DataQualityService()

    const summary = await service.previewTaskLiveCheck(
      'project-1',
      {
        id: 'task-parent',
        status: 'completed',
        progress: 100,
      } as any,
      'task-parent',
    )

    expect(summary.count).toBe(1)
    expect(summary.summary).toContain('1 条任务存在数据矛盾')
    expect(summary.items[0]).toMatchObject({
      ruleCode: 'PARENT_CHILD_INCONSISTENT',
    })
  })

  it('only emits individual progress trend warnings for critical path tasks', async () => {
    state.executeSQL.mockImplementation(async (query: string) => {
      if (query.includes('FROM tasks WHERE project_id = ?')) {
        return [
          {
            id: 'task-critical',
            project_id: 'project-1',
            title: '关键路径主体结构',
            status: 'in_progress',
            progress: 20,
            planned_start_date: '2026-04-01',
            planned_end_date: '2026-04-20',
            is_critical: true,
            assignee_name: '张工',
          },
          {
            id: 'task-normal',
            project_id: 'project-1',
            title: '普通任务机电深化',
            status: 'in_progress',
            progress: 20,
            planned_start_date: '2026-04-01',
            planned_end_date: '2026-04-20',
            is_critical: false,
            assignee_name: '张工',
          },
        ]
      }

      if (query.includes('FROM task_conditions WHERE project_id = ?')) {
        return []
      }

      if (query.includes('FROM task_progress_snapshots WHERE task_id IN')) {
        return []
      }

      return []
    })

    const { DataQualityService } = await import('../services/dataQualityService.js')
    const service = new DataQualityService()

    const warnings = await service.scanTrendWarnings('project-1')

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      task_id: 'task-critical',
      warning_type: 'progress_trend_delay',
    })
  })

  it('folds non-critical progress trend findings into the owner digest summary', async () => {
    state.executeSQL.mockImplementation(async (query: string) => {
      if (query.includes('FROM tasks WHERE project_id = ?')) {
        return [
          {
            id: 'task-1',
            project_id: 'project-1',
            title: '机电深化一',
            status: 'in_progress',
            progress: 10,
            planned_start_date: '2026-04-01',
            planned_end_date: '2026-04-20',
            is_critical: false,
            assignee_name: '李工',
          },
          {
            id: 'task-2',
            project_id: 'project-1',
            title: '机电深化二',
            status: 'in_progress',
            progress: 15,
            planned_start_date: '2026-04-01',
            planned_end_date: '2026-04-20',
            is_critical: false,
            assignee_name: '李工',
          },
          {
            id: 'task-3',
            project_id: 'project-1',
            title: '机电深化三',
            status: 'in_progress',
            progress: 12,
            planned_start_date: '2026-04-01',
            planned_end_date: '2026-04-20',
            is_critical: false,
            assignee_name: '李工',
          },
        ]
      }

      if (query.includes('FROM task_conditions WHERE project_id = ?')) {
        return []
      }

      if (query.includes('FROM task_progress_snapshots WHERE task_id IN')) {
        return []
      }

      return []
    })

    const { DataQualityService } = await import('../services/dataQualityService.js')
    const service = new DataQualityService()

    const summary = await service.buildProjectSummary('project-1')

    expect(summary.ownerDigest).toMatchObject({
      shouldNotify: true,
      scopeLabel: '李工',
    })
    expect(summary.ownerDigest.findingCount).toBeGreaterThanOrEqual(3)
    expect(summary.ownerDigest.summary).toContain('进度趋势异常')
  })
})
