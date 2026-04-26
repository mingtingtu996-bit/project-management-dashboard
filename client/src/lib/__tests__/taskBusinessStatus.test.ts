import { describe, expect, it } from 'vitest'

import {
  buildProjectTaskProgressSnapshot,
  calculateProjectHealthScore,
  getTaskBusinessStatus,
  getTaskLagLevel,
  getTaskLagStatus,
  TASK_STATUS_THEME,
} from '../taskBusinessStatus'

describe('taskBusinessStatus', () => {
  it('builds a unified project progress snapshot from tasks, conditions, and obstacles', () => {
    const tasks = [
      { id: 'parent', status: 'todo', progress: 0 },
      { id: 't1', parent_id: 'parent', status: 'todo', progress: 0, planned_end_date: '2099-01-10' },
      { id: 't2', parent_id: 'parent', status: 'in_progress', progress: 60, planned_end_date: '2020-01-10' },
      { id: 't3', parent_id: 'parent', status: 'completed', progress: 100, planned_end_date: '2020-01-09' },
    ]

    const conditions = [
      { task_id: 't1', is_satisfied: false },
      { task_id: 't1', is_satisfied: true },
      { task_id: 't2', is_satisfied: true },
    ]

    const obstacles = [
      { task_id: 't2', is_resolved: false },
      { task_id: 't3', is_resolved: true },
    ]

    const snapshot = buildProjectTaskProgressSnapshot(tasks, conditions, obstacles)

    expect(snapshot.totalTasks).toBe(4)
    expect(snapshot.leafTaskCount).toBe(3)
    expect(snapshot.progressBaseTaskCount).toBe(3)
    expect(snapshot.completedTaskCount).toBe(1)
    expect(snapshot.inProgressTaskCount).toBe(1)
    expect(snapshot.delayedTaskCount).toBe(1)
    expect(snapshot.overallProgress).toBe(53)
    expect(snapshot.pendingConditionCount).toBe(1)
    expect(snapshot.pendingConditionTaskCount).toBe(1)
    expect(snapshot.activeObstacleCount).toBe(1)
    expect(snapshot.activeObstacleTaskCount).toBe(1)
    expect(snapshot.readyToStartTaskCount).toBe(0)
    expect(snapshot.taskConditionMap.t1).toEqual({ total: 2, satisfied: 1 })
    expect(snapshot.obstacleCountMap.t2).toBe(1)
  })

  it('returns the same business status categories used by gantt and dashboard views', () => {
    expect(
      getTaskBusinessStatus(
        { id: 'done', status: 'completed', progress: 100 },
        { conditionSummary: { total: 0, satisfied: 0 }, activeObstacleCount: 0 },
      ),
    ).toEqual(TASK_STATUS_THEME.completed)

    expect(
      getTaskBusinessStatus(
        { id: 'blocked', status: 'in_progress', progress: 50 },
        { conditionSummary: { total: 0, satisfied: 0 }, activeObstacleCount: 2 },
      ),
    ).toEqual(TASK_STATUS_THEME.in_progress)

    expect(
      getTaskBusinessStatus(
        { id: 'pending', status: 'todo', progress: 0 },
        { conditionSummary: { total: 2, satisfied: 1 }, activeObstacleCount: 0 },
      ),
    ).toEqual(TASK_STATUS_THEME.pending_conditions)

    expect(
      getTaskBusinessStatus(
        { id: 'ready', status: 'todo', progress: 0 },
        { conditionSummary: { total: 1, satisfied: 1 }, activeObstacleCount: 0 },
      ),
    ).toEqual(TASK_STATUS_THEME.ready)
  })

  it('derives lag labels and snapshot counts from explicit lag fields', () => {
    expect(
      getTaskLagLevel({ id: 'lag-mild', status: 'todo', progress: 0, lagLevel: 'mild' }),
    ).toBe('mild')
    expect(
      getTaskLagStatus({ id: 'lag-mild', status: 'todo', progress: 0, lagLevel: 'mild' }),
    ).toBe('轻度滞后')

    expect(
      getTaskLagLevel({ id: 'lag-severe', status: 'todo', progress: 0, lagStatus: '严重滞后' }),
    ).toBe('severe')
    expect(
      getTaskLagStatus({ id: 'lag-severe', status: 'todo', progress: 0, lagStatus: '严重滞后' }),
    ).toBe('严重滞后')

    const snapshot = buildProjectTaskProgressSnapshot(
      [
        { id: 'root', status: 'todo', progress: 0 },
        { id: 'lag-a', parent_id: 'root', status: 'todo', progress: 0, lagLevel: 'mild' },
        { id: 'lag-b', parent_id: 'root', status: 'todo', progress: 0, lagStatus: '中度滞后' },
        { id: 'ready', parent_id: 'root', status: 'todo', progress: 0 },
      ],
      [],
      [],
    )

    expect(snapshot.laggedTaskCount).toBe(2)
  })

  it('matches the fallback health score formula used by the unified project summary', () => {
    const healthScore = calculateProjectHealthScore({
      completedTaskCount: 3,
      completedMilestones: 1,
      delayDays: 6,
      activeRisks: [{ level: 'high' }, { level: 'low' }],
    })

    expect(healthScore).toBe(43)
  })
})
