import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildProjectTaskProgressSnapshot,
  getTaskDisplayStatus,
  isActiveObstacle,
  isActiveRisk,
  isCompletedTask,
  isPendingCondition,
  getTaskBusinessStatus,
  getTaskLagLevel,
  getTaskLagStatus,
  TASK_STATUS_THEME,
} from '../taskBusinessStatus'

describe('taskBusinessStatus', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

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

  it('prefers backend-derived task business status codes when present', () => {
    expect(
      getTaskBusinessStatus({ id: 'warning', status: 'in_progress', progress: 40, businessStatus: { status: 'progress_warning', label: '执行预警' } }),
    ).toEqual(TASK_STATUS_THEME.progress_warning)

    expect(
      getTaskBusinessStatus({ id: 'partial', status: 'in_progress', progress: 40, businessStatus: { status: 'partial_blocked', label: '部分受影响' } }),
    ).toEqual(TASK_STATUS_THEME.partial_blocked)

    expect(
      getTaskBusinessStatus({ id: 'blocked', status: 'in_progress', progress: 40, businessStatus: { status: 'blocked_by_obstacle', label: '受阻' } }),
    ).toEqual(TASK_STATUS_THEME.blocked_by_obstacle)
  })

  it('prefers backend business status over local lag fallback when both are present', () => {
    expect(
      getTaskBusinessStatus({
        id: 'backend-status',
        status: 'in_progress',
        progress: 40,
        businessStatus: { status: 'progress_warning', label: '执行预警' },
        lagLevel: 'severe',
        lagStatus: '严重滞后',
      }),
    ).toEqual(TASK_STATUS_THEME.progress_warning)
  })

  it('prefers unified statusDerivation business status before compatibility fields', () => {
    expect(
      getTaskBusinessStatus({
        id: 'unified-status',
        status: 'in_progress',
        progress: 40,
        statusDerivation: {
          businessStatus: { status: 'blocked_by_obstacle', label: '受阻' },
        },
        businessStatus: { status: 'progress_warning', label: '执行预警' },
        lagLevel: 'severe',
      } as any),
    ).toEqual(TASK_STATUS_THEME.blocked_by_obstacle)
  })

  it('maps task display status for dashboard and recent tasks cards', () => {
    expect(getTaskDisplayStatus({ id: 'done', status: 'completed', progress: 100 })).toBe('completed')
    expect(getTaskDisplayStatus({ id: 'blocked', status: 'blocked', progress: 20 })).toBe('blocked')
    expect(getTaskDisplayStatus({ id: 'running', status: 'in_progress', progress: 20 })).toBe('in_progress')
    expect(getTaskDisplayStatus({ id: 'todo', status: 'todo', progress: 0 })).toBe('pending')
  })

  it('uses the BI v1.2 canonical status sets for frontend-only display helpers', () => {
    expect(isCompletedTask({ id: 'done', status: 'done', progress: 0 })).toBe(true)
    expect(isCompletedTask({ id: 'cn-done', status: '已完成', progress: 0 })).toBe(true)
    expect(isCompletedTask({ id: 'full-progress', status: 'in_progress', progress: 100 })).toBe(true)

    expect(isPendingCondition({ status: 'completed' })).toBe(false)
    expect(isPendingCondition({ status: 'confirmed' })).toBe(false)
    expect(isPendingCondition({ status: '已确认' })).toBe(false)

    expect(isActiveObstacle({ status: 'resolved' })).toBe(false)
    expect(isActiveObstacle({ status: 'closed' })).toBe(false)
    expect(isActiveObstacle({ is_resolved: 0, status: 'resolved' })).toBe(true)

    expect(isActiveRisk({ status: 'resolved' })).toBe(true)
    expect(isActiveRisk({ status: 'mitigated' })).toBe(true)
    expect(isActiveRisk({ status: 'closed' })).toBe(false)
    expect(isActiveRisk({ status: '已关闭' })).toBe(false)
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

  it('does not reconstruct lag status from dates when backend derivation is absent', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-03T23:30:00.000Z'))

    const legacyTaskPayload = {
      id: 'ending-today',
      status: 'in_progress',
      progress: 0,
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-03',
    } as unknown as Parameters<typeof getTaskLagLevel>[0]

    expect(getTaskLagLevel(legacyTaskPayload)).toBeNull()
  })

})
