import { describe, expect, it } from 'vitest'

import { mapPersistedTaskTimelineEvent } from '../services/taskTimelineService.js'

describe('mapPersistedTaskTimelineEvent', () => {
  it('maps persisted rows into the task timeline dto shape', () => {
    const event = mapPersistedTaskTimelineEvent({
      id: 'evt-1',
      task_id: 'task-1',
      event_type: 'milestone',
      title: '主体封顶',
      description: '关键节点已达成',
      status_label: '已完成',
      occurred_at: '2026-04-01T08:00:00.000Z',
      created_at: '2026-04-01T08:05:00.000Z',
    })

    expect(event).toEqual({
      id: 'evt-1',
      kind: 'milestone',
      taskId: 'task-1',
      title: '主体封顶',
      description: '关键节点已达成',
      statusLabel: '已完成',
      occurredAt: '2026-04-01T08:00:00.000Z',
    })
  })

  it('falls back to task kind and created_at when source fields are missing', () => {
    const event = mapPersistedTaskTimelineEvent({
      id: 'evt-2',
      event_type: 'unexpected',
      title: '   ',
      description: '',
      created_at: '2026-04-01T09:00:00.000Z',
    })

    expect(event).toEqual({
      id: 'evt-2',
      kind: 'task',
      title: '未命名事件',
      description: '暂无说明',
      occurredAt: '2026-04-01T09:00:00.000Z',
      taskId: undefined,
      statusLabel: undefined,
    })
  })
})
