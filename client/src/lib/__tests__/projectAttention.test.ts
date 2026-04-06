import { describe, expect, it } from 'vitest'
import { buildProjectAttentionSnapshot } from '../projectAttention'

describe('projectAttention', () => {
  it('derives a shared navigation badge snapshot from the same project data', () => {
    const snapshot = buildProjectAttentionSnapshot(
      'p1',
      [
        { id: 't1', project_id: 'p1', status: 'todo', progress: 0, planned_end_date: '2026-03-01' } as any,
        { id: 't2', project_id: 'p1', status: 'in_progress', progress: 40, planned_end_date: '2099-01-01' } as any,
      ],
      [
        { id: 'r1', project_id: 'p1', status: 'open', level: 'high' } as any,
        { id: 'r2', project_id: 'p1', status: 'closed', level: 'critical' } as any,
      ],
      [
        { id: 'c1', task_id: 't1', is_satisfied: false, status: '待满足' } as any,
      ],
      [
        { id: 'o1', task_id: 't2', is_resolved: false, status: '处理中' } as any,
      ],
      [
        { id: 'a1', project_id: 'p1', status: 'pending' } as any,
        { id: 'a2', project_id: 'p1', status: 'passed' } as any,
      ],
    )

    expect(snapshot.delayedTaskCount).toBe(1)
    expect(snapshot.highRiskCount).toBe(1)
    expect(snapshot.activeRiskCount).toBe(1)
    expect(snapshot.pendingConditionTaskCount).toBe(1)
    expect(snapshot.activeObstacleTaskCount).toBe(1)
    expect(snapshot.pendingAcceptanceCount).toBe(1)
    expect(snapshot.totalAttentionCount).toBe(5)
  })
})
