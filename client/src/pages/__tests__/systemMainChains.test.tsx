import { afterEach, describe, expect, it } from 'vitest'

import {
  selectParticipantUnits,
  selectProjectScope,
  selectScopeDimensions,
  useStore,
} from '@/hooks/useStore'
import { buildProjectTaskProgressSnapshot } from '@/lib/taskBusinessStatus'
import { buildTaskTimelineDetailSnapshot, buildTaskTimelineEvents } from '@/lib/taskTimeline'

describe('system main chains', () => {
  const projectId = 'project-1'

  afterEach(() => {
    useStore.setState({
      currentProject: null,
      projects: [] as never,
      tasks: [] as never,
      risks: [] as never,
      milestones: [] as never,
      conditions: [] as never,
      obstacles: [] as never,
      participantUnits: [] as never,
      scopeDimensions: [] as never,
    })
  })

  it('keeps one shared project scope across tasks, risks, conditions, and obstacles', () => {
    useStore.setState({
      currentProject: {
        id: projectId,
        name: '城市中心广场项目（二期）',
        description: '共享项目上下文',
        status: 'active',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-12-31',
      } as never,
      projects: [{ id: projectId, name: '城市中心广场项目（二期）' } as never],
      tasks: [
        { id: 'task-1', project_id: projectId, title: '主体结构施工', status: 'in_progress' },
        { id: 'task-2', project_id: 'other-project', title: '其他项目任务', status: 'todo' },
      ] as never,
      risks: [
        { id: 'risk-1', project_id: projectId, title: '既有风险', status: 'open' },
        { id: 'risk-2', project_id: 'other-project', title: '其他风险', status: 'open' },
      ] as never,
      conditions: [
        { id: 'condition-1', task_id: 'task-1', status: '未满足' },
        { id: 'condition-2', task_id: 'task-2', status: '未满足' },
      ] as never,
      obstacles: [
        { id: 'obstacle-1', task_id: 'task-1', status: '处理中' },
        { id: 'obstacle-2', task_id: 'task-2', status: '处理中' },
      ] as never,
    })

    const scope = selectProjectScope(useStore.getState(), projectId)

    expect(scope.project.id).toBe(projectId)
    expect(scope.tasks.map((task) => task.id)).toEqual(['task-1'])
    expect(scope.risks.map((risk) => risk.id)).toEqual(['risk-1'])
    expect(scope.conditions.map((condition) => condition.id)).toEqual(['condition-1'])
    expect(scope.obstacles.map((obstacle) => obstacle.id)).toEqual(['obstacle-1'])
    expect(() => selectProjectScope(useStore.getState(), 'missing-project')).toThrow('[useStore] project not found')
  })

  it('keeps gantt shared slices in store and clears them with project switches', () => {
    useStore.setState({
      participantUnits: [
        { id: 'unit-1', unit_name: '总包单位', unit_type: 'general', version: 1 },
      ] as never,
      scopeDimensions: [
        { key: 'building', label: '建筑维度', options: ['A'], selected: ['A'] },
        { key: 'specialty', label: '专业维度', options: ['B'], selected: ['B'] },
        { key: 'phase', label: '阶段维度', options: ['C'], selected: ['C'] },
        { key: 'region', label: '区域维度', options: ['D'], selected: ['D'] },
      ] as never,
    })

    expect(selectParticipantUnits(useStore.getState()).map((unit) => unit.unit_name)).toEqual(['总包单位'])
    expect(selectScopeDimensions(useStore.getState()).map((section) => section.key)).toEqual([
      'building',
      'specialty',
      'phase',
      'region',
    ])

    useStore.getState().setCurrentProject(null)

    expect(selectParticipantUnits(useStore.getState())).toEqual([])
    expect(selectScopeDimensions(useStore.getState())).toEqual([])
  })

  it('keeps task timeline facts and summary on one shared event source', () => {
    const tasks = [
      {
        id: 'task-1',
        title: '主体结构施工',
        status: 'in_progress',
        progress: 40,
        is_milestone: true,
        updated_at: '2026-04-02T08:00:00.000Z',
        planned_end_date: '2000-01-01T00:00:00.000Z',
        created_at: '2026-04-01T08:00:00.000Z',
      },
    ]

    const conditions = [
      {
        id: 'condition-1',
        task_id: 'task-1',
        condition_name: '工作面移交',
        description: '工作面尚未移交',
        status: '未满足',
        created_at: '2026-04-02T07:00:00.000Z',
      },
    ]

    const obstacles = [
      {
        id: 'obstacle-1',
        task_id: 'task-1',
        description: '材料未到场',
        status: '处理中',
        created_at: '2026-04-02T07:30:00.000Z',
      },
    ]

    const snapshot = buildProjectTaskProgressSnapshot(tasks as never, conditions as never, obstacles as never)
    const events = buildTaskTimelineEvents(tasks as never, conditions as never, obstacles as never)
    const detail = buildTaskTimelineDetailSnapshot(events, 'task-1', '主体结构施工')

    expect(snapshot.delayedTaskCount).toBe(1)
    expect(snapshot.pendingConditionTaskCount).toBe(1)
    expect(snapshot.activeObstacleTaskCount).toBe(1)
    expect(events.map((event) => event.kind)).toEqual(['milestone', 'task', 'obstacle', 'condition'])
    expect(detail.taskEvents.length).toBe(4)
    expect(detail.taskSummary).toMatchObject({
      taskId: 'task-1',
      total: 4,
      taskCount: 1,
      milestoneCount: 1,
      conditionCount: 1,
      obstacleCount: 1,
    })
    expect(detail.narrative.headline).toContain('主体结构施工')
    expect(detail.narrative.summaryLines.join(' ')).toContain('4 条事实')
  })
})
