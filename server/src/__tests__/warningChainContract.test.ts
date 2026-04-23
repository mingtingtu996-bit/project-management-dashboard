import { describe, expect, it } from 'vitest'
import {
  buildNotificationIdentity,
  collapseWarningRedundancy,
  dedupeNotifications,
  normalizeNotificationPayload,
  resolveWarningsForTaskCompletion,
  shouldSkipAutoUpgrade,
} from '../services/warningChainService.js'

describe('warning chain contract', () => {
  it('preserves notification routing fields and dedupes warnings by warning_type + task_id + day', () => {
    const normalized = normalizeNotificationPayload({
      id: 'w-1',
      project_id: 'p-1',
      warning_type: 'condition_expired',
      warning_level: 'warning',
      title: '条件即将到期',
      description: '示例',
      is_acknowledged: false,
      created_at: '2026-04-13T08:00:00.000Z',
      task_id: 'task-1',
      category: 'risk',
      delay_request_id: 'delay-1',
    })

    expect(normalized.category).toBe('risk')
    expect(normalized.task_id).toBe('task-1')
    expect(normalized.delay_request_id).toBe('delay-1')
    expect(buildNotificationIdentity(normalized)).toBe('condition_expired|task-1|2026-04-13')

    const deduped = dedupeNotifications([
      normalized,
      {
        ...normalized,
        id: 'w-2',
        title: '改了标题但同源',
        created_at: '2026-04-13T09:00:00.000Z',
      },
      {
        ...normalized,
        id: 'w-3',
        task_id: 'task-2',
        created_at: '2026-04-13T10:00:00.000Z',
      },
      {
        ...normalized,
        id: 'w-4',
        created_at: '2026-04-14T08:00:00.000Z',
      },
    ])

    expect(deduped).toHaveLength(3)
    expect(deduped.map((item) => item.id)).toEqual(['w-4', 'w-3', 'w-2'])
  })

  it('does not coerce non-uuid source keys into task_id', () => {
    const normalized = normalizeNotificationPayload({
      id: 'w-subject-1',
      project_id: 'p-1',
      warning_type: 'responsibility_subject_alert',
      warning_level: 'warning',
      title: '责任主体预警',
      description: '示例',
      is_acknowledged: false,
      created_at: '2026-04-21T08:00:00.000Z',
      source_entity_id: 'unit:unit:12345678-1234-4abc-8def-1234567890ab',
    })

    expect(normalized.task_id).toBeNull()
    expect(normalized.source_entity_id).toBe('unit:unit:12345678-1234-4abc-8def-1234567890ab')
  })

  it('skips auto-upgrade when acknowledged or muted, and allows normal checks otherwise', () => {
    expect(shouldSkipAutoUpgrade({ acknowledged_at: '2026-04-13T08:00:00.000Z' })).toBe(true)
    expect(
      shouldSkipAutoUpgrade({
        muted_until: '2026-04-15T00:00:00.000Z',
        now: '2026-04-13T08:00:00.000Z',
      })
    ).toBe(true)
    expect(
      shouldSkipAutoUpgrade({
        muted_until: '2026-04-12T00:00:00.000Z',
        now: '2026-04-13T08:00:00.000Z',
      })
    ).toBe(false)
    expect(shouldSkipAutoUpgrade({})).toBe(false)
  })

  it('marks active warnings resolved when their task completes', () => {
    const warnings = resolveWarningsForTaskCompletion(
      [
        {
          id: 'w-1',
          project_id: 'p-1',
          type: 'task',
          warning_type: 'delay_exceeded',
          warning_level: 'warning',
          title: '任务延期',
          content: '示例',
          is_read: false,
          source_entity_type: 'warning',
          source_entity_id: 'task-1',
          created_at: '2026-04-13T08:00:00.000Z',
        },
        {
          id: 'w-2',
          project_id: 'p-1',
          type: 'task',
          warning_type: 'obstacle_timeout',
          warning_level: 'warning',
          title: '阻碍提醒',
          content: '示例',
          is_read: false,
          source_entity_type: 'warning',
          source_entity_id: 'task-2',
          created_at: '2026-04-13T08:00:00.000Z',
        },
      ],
      { task_id: 'task-1', task_status: 'completed' }
    ) as Array<any>

    expect(warnings[0].resolved).toBe(true)
    expect((warnings[0] as any).status).toBe('resolved')
    expect(warnings[1].resolved).toBeUndefined()
  })

  it('collapses same-task delay warnings to a single critical summary within one scan cycle', () => {
    const collapsed = collapseWarningRedundancy([
      {
        id: 'w-1',
        project_id: 'p-1',
        task_id: 'task-1',
        warning_type: 'critical_path_stagnation',
        warning_level: 'critical',
        title: '关键路径任务连续 7 天无进度变化',
        description: '关键路径任务“主体结构”近 7 天进度没有变化，请立即处理',
        is_acknowledged: false,
        created_at: '2026-04-13T08:00:00.000Z',
      },
      {
        id: 'w-2',
        project_id: 'p-1',
        task_id: 'task-1',
        warning_type: 'progress_trend_delay',
        warning_level: 'warning',
        title: '任务出现进度滞后趋势',
        description: '任务“主体结构”当前进度明显滞后。',
        is_acknowledged: false,
        created_at: '2026-04-13T08:05:00.000Z',
      },
      {
        id: 'w-3',
        project_id: 'p-1',
        task_id: 'task-1',
        warning_type: 'delay_exceeded',
        warning_level: 'warning',
        title: '连续延期 - 需关注',
        description: '任务“主体结构”已延期 4 次',
        is_acknowledged: false,
        created_at: '2026-04-13T08:10:00.000Z',
      },
      {
        id: 'w-4',
        project_id: 'p-1',
        task_id: 'task-2',
        warning_type: 'delay_exceeded',
        warning_level: 'warning',
        title: '连续延期 - 需关注',
        description: '任务“机电安装”已延期 3 次',
        is_acknowledged: false,
        created_at: '2026-04-13T08:15:00.000Z',
      },
    ] as any)

    expect(collapsed).toHaveLength(2)
    expect(collapsed[0]).toMatchObject({
      warning_type: 'critical_path_stagnation',
      task_id: 'task-1',
      title: '关键路径任务停滞且延期风险持续累积',
    })
    expect(collapsed[0].description).toContain('延期 4 次')
    expect(collapsed[1]).toMatchObject({
      warning_type: 'delay_exceeded',
      task_id: 'task-2',
    })
  })
})
