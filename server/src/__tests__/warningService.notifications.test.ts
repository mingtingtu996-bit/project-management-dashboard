import { afterEach, describe, expect, it, vi } from 'vitest'
import { WarningService } from '../services/warningService.js'

describe('warningService notification generation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes warning notifications and dedupes by chain identity', async () => {
    const service = new WarningService()

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
})
