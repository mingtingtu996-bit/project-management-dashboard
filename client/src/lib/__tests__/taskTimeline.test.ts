import { describe, expect, it } from 'vitest'
import {
  buildTaskTimelineEvents,
  buildTaskTimelineDetailSnapshot,
  filterTaskTimelineEvents,
  summarizeTaskTimeline,
  summarizeTaskTimelineForTask,
  summarizeTaskTimelineNarrative,
} from '../taskTimeline'

describe('taskTimeline', () => {
  it('builds a unified timeline from task status, progress, conditions, obstacles, and milestones', () => {
    const events = buildTaskTimelineEvents(
      [
        {
          id: 'task-1',
          title: '主体结构施工',
          status: 'in_progress',
          progress: 40,
          updated_at: '2026-04-02T08:00:00.000Z',
        },
        {
          id: 'task-2',
          title: '主体封顶',
          status: 'completed',
          progress: 100,
          is_milestone: true,
          updated_at: '2026-04-03T09:00:00.000Z',
        },
      ] as never,
      [
        {
          id: 'condition-1',
          task_id: 'task-1',
          condition_name: '工作面移交',
          description: '工作面尚未移交',
          status: '未满足',
          created_at: '2026-04-02T07:00:00.000Z',
        },
      ] as never,
      [
        {
          id: 'obstacle-1',
          task_id: 'task-1',
          description: '材料未到场',
          status: '处理中',
          created_at: '2026-04-02T07:30:00.000Z',
        },
      ] as never,
    )

    expect(events.map((event) => event.kind)).toContain('task')
    expect(events.map((event) => event.kind)).toContain('milestone')
    expect(events.map((event) => event.kind)).toContain('condition')
    expect(events.map((event) => event.kind)).toContain('obstacle')
    expect(events[0]?.taskId).toBe('task-2')
    expect(events[0]?.occurredAt).toBe('2026-04-03T09:00:00.000Z')
    expect(events.some((event) => event.description.includes('40%'))).toBe(true)
  })

  it('summarizes the same timeline source deterministically', () => {
    const summary = summarizeTaskTimeline([
      { id: 'a', kind: 'task', title: 'A', description: '', occurredAt: '2026-04-01T00:00:00.000Z' },
      { id: 'b', kind: 'milestone', title: 'B', description: '', occurredAt: '2026-04-01T00:00:00.000Z' },
      { id: 'c', kind: 'condition', title: 'C', description: '', occurredAt: '2026-04-01T00:00:00.000Z' },
      { id: 'd', kind: 'obstacle', title: 'D', description: '', occurredAt: '2026-04-01T00:00:00.000Z' },
    ])

    expect(summary).toEqual({
      total: 4,
      taskCount: 1,
      milestoneCount: 1,
      conditionCount: 1,
      obstacleCount: 1,
    })
  })

  it('extracts a stable journey for a single task from the shared event source', () => {
    const events = buildTaskTimelineEvents(
      [
        {
          id: 'task-1',
          title: '主体结构施工',
          status: 'in_progress',
          progress: 40,
          updated_at: '2026-04-02T08:00:00.000Z',
        },
        {
          id: 'task-2',
          title: '主体封顶',
          status: 'completed',
          progress: 100,
          is_milestone: true,
          updated_at: '2026-04-03T09:00:00.000Z',
        },
      ] as never,
      [
        {
          id: 'condition-1',
          task_id: 'task-1',
          condition_name: '工作面移交',
          description: '工作面尚未移交',
          status: '未满足',
          created_at: '2026-04-02T07:00:00.000Z',
        },
      ] as never,
      [
        {
          id: 'obstacle-1',
          task_id: 'task-1',
          description: '材料未到场',
          status: '处理中',
          created_at: '2026-04-02T07:30:00.000Z',
        },
      ] as never,
    )

    const journeyEvents = filterTaskTimelineEvents(events, 'task-1')
    const journeySummary = summarizeTaskTimelineForTask(events, 'task-1')

    expect(journeyEvents.every((event) => event.taskId === 'task-1')).toBe(true)
    expect(journeySummary).toMatchObject({
      taskId: 'task-1',
      total: 3,
      taskCount: 1,
      conditionCount: 1,
      obstacleCount: 1,
      milestoneCount: 0,
      firstOccurredAt: '2026-04-02T07:00:00.000Z',
      lastOccurredAt: '2026-04-02T08:00:00.000Z',
    })
  })

  it('creates an auto summary from the same timeline events', () => {
    const narrative = summarizeTaskTimelineNarrative([
      { id: 'a', kind: 'task', title: 'A', description: '', occurredAt: '2026-04-01T00:00:00.000Z' },
      { id: 'b', kind: 'condition', title: 'B', description: '', occurredAt: '2026-04-02T00:00:00.000Z' },
      { id: 'c', kind: 'obstacle', title: 'C', description: '', occurredAt: '2026-04-03T00:00:00.000Z' },
    ], '主体结构施工')

    expect(narrative.headline).toContain('主体结构施工')
    expect(narrative.summaryLines.join(' ')).toContain('3 条事实')
    expect(narrative.summaryLines.join(' ')).toContain('1 条开工条件')
    expect(narrative.summaryLines.join(' ')).toContain('1 条阻碍')
    expect(narrative.supplementalLine).toContain('补充说明')
  })

  it('builds the task detail snapshot from the same shared event facts', () => {
    const events = buildTaskTimelineEvents(
      [
        {
          id: 'task-1',
          title: '主体结构施工',
          status: 'in_progress',
          progress: 40,
          updated_at: '2026-04-02T08:00:00.000Z',
        },
      ] as never,
      [
        {
          id: 'condition-1',
          task_id: 'task-1',
          condition_name: '工作面移交',
          description: '工作面尚未移交',
          status: '未满足',
          created_at: '2026-04-02T07:00:00.000Z',
        },
      ] as never,
      [
        {
          id: 'obstacle-1',
          task_id: 'task-1',
          description: '材料未到场',
          status: '处理中',
          created_at: '2026-04-02T07:30:00.000Z',
        },
      ] as never,
    )

    const snapshot = buildTaskTimelineDetailSnapshot(events, 'task-1', '主体结构施工')

    expect(snapshot.taskEvents.length).toBe(3)
    expect(snapshot.taskSummary).toMatchObject({
      taskId: 'task-1',
      total: 3,
      taskCount: 1,
      conditionCount: 1,
      obstacleCount: 1,
      milestoneCount: 0,
    })
    expect(snapshot.narrative.headline).toContain('主体结构施工')
    expect(snapshot.narrative.summaryLines.join(' ')).toContain('3 条事实')
  })
  it('keeps the detail snapshot focused on a single task when the source list is mixed', () => {
    const events = [
      { id: 'a', kind: 'task', title: 'A', description: '', occurredAt: '2026-04-01T00:00:00.000Z', taskId: 'task-1' },
      { id: 'b', kind: 'task', title: 'B', description: '', occurredAt: '2026-04-02T00:00:00.000Z', taskId: 'task-2' },
      { id: 'c', kind: 'condition', title: 'C', description: '', occurredAt: '2026-04-03T00:00:00.000Z', taskId: 'task-1' },
      { id: 'd', kind: 'obstacle', title: 'D', description: '', occurredAt: '2026-04-04T00:00:00.000Z', taskId: 'task-2' },
    ] as never

    const snapshot = buildTaskTimelineDetailSnapshot(events, 'task-1', 'Task 1')

    expect(snapshot.taskEvents.map((event) => event.taskId)).toEqual(['task-1', 'task-1'])
    expect(snapshot.taskSummary).toMatchObject({
      taskId: 'task-1',
      total: 2,
      taskCount: 1,
      conditionCount: 1,
      obstacleCount: 0,
      milestoneCount: 0,
    })
    expect(snapshot.narrative.summaryLines.length).toBeGreaterThan(0)
  })
})
