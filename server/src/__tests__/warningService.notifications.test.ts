import { afterEach, describe, expect, it, vi } from 'vitest'
import { WarningService } from '../services/warningService.js'

describe('warningService notification generation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes warning notifications and dedupes by chain identity', async () => {
    const service = new WarningService()

    vi.spyOn(service, 'scanExecutionImpactSignalWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanConditionWarnings').mockResolvedValue([
      {
        id: 'w-1',
        project_id: 'p-1',
        task_id: 'task-1',
        warning_type: 'condition_expired',
        warning_level: 'warning',
        title: '条件即将到期',
        description: '条件 A',
        is_acknowledged: false,
        created_at: '2026-04-13T08:00:00.000Z',
      },
      {
        id: 'w-2',
        project_id: 'p-1',
        task_id: 'task-1',
        warning_type: 'condition_expired',
        warning_level: 'warning',
        title: '条件即将到期（更新）',
        description: '条件 B',
        is_acknowledged: false,
        created_at: '2026-04-13T09:00:00.000Z',
      },
    ] as any)
    vi.spyOn(service, 'scanObstacleWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanAcceptanceWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanDelayExceededWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanPreMilestoneWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanCriticalPathStagnationWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanCriticalPathDelayWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanProgressTrendWarnings').mockResolvedValue([] as any)

    const notifications = await service.generateNotifications('p-1')

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      project_id: 'p-1',
      type: 'condition_expired',
      category: 'condition_expired',
      task_id: 'task-1',
      source_entity_type: 'warning',
      source_entity_id: 'task-1',
      title: '条件即将到期（更新）',
    })
  })

  it('collapses same-task delay warnings to the highest-severity notification in one scan cycle', async () => {
    const service = new WarningService()

    vi.spyOn(service, 'scanExecutionImpactSignalWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanConditionWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanObstacleWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanAcceptanceWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanDelayExceededWarnings').mockResolvedValue([
      {
        id: 'delay-1',
        project_id: 'p-1',
        task_id: 'task-1',
        warning_type: 'delay_exceeded',
        warning_level: 'warning',
        title: '连续延期 - 需关注',
        description: '任务“主体结构”已延期 4 次',
        is_acknowledged: false,
        created_at: '2026-04-13T08:10:00.000Z',
      },
    ] as any)
    vi.spyOn(service, 'scanPreMilestoneWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanCriticalPathStagnationWarnings').mockResolvedValue([
      {
        id: 'stagnation-1',
        project_id: 'p-1',
        task_id: 'task-1',
        warning_type: 'critical_path_stagnation',
        warning_level: 'critical',
        title: '关键路径任务连续 7 天无进度变化',
        description: '关键路径任务“主体结构”近 7 天进度没有变化，请立即处理',
        is_acknowledged: false,
        created_at: '2026-04-13T08:00:00.000Z',
      },
    ] as any)
    vi.spyOn(service, 'scanCriticalPathDelayWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanProgressTrendWarnings').mockResolvedValue([
      {
        id: 'trend-1',
        project_id: 'p-1',
        task_id: 'task-1',
        warning_type: 'progress_trend_delay',
        warning_level: 'warning',
        title: '任务出现进度滞后趋势',
        description: '任务“主体结构”当前进度明显滞后。',
        is_acknowledged: false,
        created_at: '2026-04-13T08:05:00.000Z',
      },
    ] as any)

    const notifications = await service.generateNotifications('p-1')

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      project_id: 'p-1',
      task_id: 'task-1',
      type: 'critical_path_stagnation',
      title: '关键路径任务停滞且延期风险持续累积',
    })
    expect(notifications[0].content).toContain('延期 4 次')
  })

  it('preserves unified impact source entity ids when generating warning notifications', async () => {
    const service = new WarningService()

    vi.spyOn(service, 'scanAll').mockResolvedValue([
      {
        id: 'signal-warning-1',
        project_id: 'p-1',
        task_id: 'task-1',
        warning_type: 'critical_path_delay',
        warning_level: 'critical',
        title: '确定延期预警',
        description: '共享材料阻塞造成确定延期',
        is_acknowledged: false,
        created_at: '2026-05-26T00:00:00.000Z',
        source_entity_type: 'project_material',
        source_entity_id: 'material-1',
      },
    ] as any)

    const notifications = await service.generateNotifications('p-1')

    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      source_entity_type: 'warning',
      source_entity_id: 'material-1',
      task_id: 'task-1',
      category: 'critical_path_delay',
    })
  })

  it('parses reminders from actual due labels like N days later due instead of treating them as zero days', async () => {
    const service = new WarningService()

    vi.spyOn(service, 'scanConditionWarnings').mockResolvedValue([
      {
        id: 'condition-warning-1',
        project_id: 'p-1',
        task_id: 'task-1',
        warning_type: 'condition_due',
        warning_level: 'warning',
        title: '条件即将到期',
        description: '任务"机电调试"的开工窗口3天后到期，当前条件"供电接入"仍未满足',
        is_acknowledged: false,
        created_at: '2026-04-13T08:00:00.000Z',
      },
    ] as any)
    vi.spyOn(service, 'scanObstacleWarnings').mockResolvedValue([] as any)
    vi.spyOn(service, 'scanAcceptanceWarnings').mockResolvedValue([
      {
        id: 'acceptance-warning-1',
        project_id: 'p-1',
        task_id: 'task-2',
        warning_type: 'acceptance_expired',
        warning_level: 'warning',
        title: '验收即将到期',
        description: '消防验收"消防专项"当前为待提交，7天后到期',
        is_acknowledged: false,
        created_at: '2026-04-13T08:00:00.000Z',
      },
    ] as any)

    const reminders = await service.generateReminders('p-1')

    expect(reminders.map((reminder) => reminder.reminder_type)).toEqual([
      'condition_3day',
      'acceptance_7day',
    ])
  })
})
