import { describe, expect, it } from 'vitest'
import { summarizeCriticalPathSnapshot } from '../criticalPath'
import { buildCriticalPathSnapshot } from '../criticalPathCompatibility'
import { calculateCPM, getCriticalPathSummary } from '../cpm'

describe('criticalPath', () => {
  it('builds a snapshot with stable auto and manual path fields', () => {
    const snapshot = buildCriticalPathSnapshot('project-1', [
      {
        id: 'task-a',
        name: 'A',
        duration: 1,
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-04-01'),
        dependencies: [],
      },
      {
        id: 'task-b',
        name: 'B',
        duration: 6,
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-04-06'),
        dependencies: [],
      },
      {
        id: 'task-c',
        name: 'C',
        duration: 1,
        startDate: new Date('2026-04-02'),
        endDate: new Date('2026-04-02'),
        dependencies: ['task-a'],
      },
    ], [
      {
        taskId: 'task-c',
        mode: 'manual_insert',
        anchorType: 'after',
        leftTaskId: 'task-a',
        reason: '插在 A 后面',
      },
      {
        taskId: 'task-a',
        mode: 'manual_attention',
        reason: '手动关注',
      },
    ])

    expect(snapshot.projectId).toBe('project-1')
    expect(snapshot.autoTaskIds).toContain('task-b')
    expect(snapshot.manualAttentionTaskIds).toContain('task-a')
    expect(snapshot.manualInsertedTaskIds).toContain('task-c')
    expect(snapshot.primaryChain).not.toBeNull()
    expect(snapshot.displayTaskIds).toContain('task-a')
    expect(snapshot.displayTaskIds).toContain('task-c')
    expect(snapshot.edges.some((edge) => edge.source === 'manual_link')).toBe(true)
    expect(snapshot.tasks.find((task) => task.taskId === 'task-c')?.isManualInserted).toBe(true)
    expect(summarizeCriticalPathSnapshot(snapshot)).toContain('关键路径')
    expect(summarizeCriticalPathSnapshot(snapshot)).toContain('插链')
  })

  it('ignores legacy critical flags when building the display snapshot', () => {
    const snapshot = buildCriticalPathSnapshot('project-1', [
      {
        id: 'task-a',
        name: 'A',
        duration: 1,
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-04-01'),
        dependencies: [],
        isCritical: true,
      },
      {
        id: 'task-b',
        name: 'B',
        duration: 6,
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-04-06'),
        dependencies: [],
      },
      {
        id: 'task-c',
        name: 'C',
        duration: 1,
        startDate: new Date('2026-04-02'),
        endDate: new Date('2026-04-02'),
        dependencies: ['task-a'],
      },
    ])

    expect(snapshot.manualAttentionTaskIds).toEqual([])
    expect(snapshot.displayTaskIds).toEqual(['task-b'])
    expect(snapshot.tasks.some((task) => task.taskId === 'task-a')).toBe(false)
  })

  it('keeps the compatibility CPM summary stable', () => {
    const result = calculateCPM([
      {
        id: 'task-a',
        name: 'A',
        duration: 3,
        dependencies: [],
      },
      {
        id: 'task-b',
        name: 'B',
        duration: 6,
        dependencies: [],
      },
      {
        id: 'task-c',
        name: 'C',
        duration: 3,
        dependencies: ['task-a'],
      },
    ])

    expect(result.criticalPath).toEqual(['task-a', 'task-b'])
    expect(getCriticalPathSummary(result)).toBe('2个关键任务，工期 6 天')
  })

  it('prefers the auto chain with more level-one milestones when durations tie', () => {
    const snapshot = buildCriticalPathSnapshot('project-1', [
      {
        id: 'task-a',
        name: 'A',
        duration: 2,
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-04-02'),
        dependencies: [],
        isMilestone: true,
        milestoneLevel: 1,
      },
      {
        id: 'task-c',
        name: 'C',
        duration: 5,
        startDate: new Date('2026-04-03'),
        endDate: new Date('2026-04-06'),
        dependencies: ['task-a'],
      },
      {
        id: 'task-b',
        name: 'B',
        duration: 6,
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-04-06'),
        dependencies: [],
      },
    ])

    expect(snapshot.primaryChain?.taskIds).toEqual(['task-a', 'task-c'])
    expect(snapshot.alternateChains[0]?.taskIds).toEqual(['task-b'])
    expect(snapshot.autoTaskIds).toEqual(['task-a', 'task-c', 'task-b'])
  })

  it('includes automatic zero-float parallel chains before manual inserts in alternates', () => {
    const snapshot = buildCriticalPathSnapshot('project-1', [
      {
        id: 'task-a',
        name: 'A',
        duration: 2,
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-04-02'),
        dependencies: [],
      },
      {
        id: 'task-c',
        name: 'C',
        duration: 5,
        startDate: new Date('2026-04-03'),
        endDate: new Date('2026-04-07'),
        dependencies: ['task-a'],
      },
      {
        id: 'task-b',
        name: 'B',
        duration: 6,
        startDate: new Date('2026-04-03'),
        endDate: new Date('2026-04-08'),
        dependencies: [],
      },
      {
        id: 'task-d',
        name: 'D',
        duration: 1,
        startDate: new Date('2026-04-04'),
        endDate: new Date('2026-04-04'),
        dependencies: [],
      },
    ], [
      {
        taskId: 'task-d',
        mode: 'manual_insert',
        anchorType: 'after',
        leftTaskId: 'task-b',
        reason: '插在 B 后面',
      },
    ])

    expect(snapshot.primaryChain?.taskIds).toEqual(['task-b'])
    expect(snapshot.alternateChains.map((chain) => ({ source: chain.source, taskIds: chain.taskIds }))).toEqual([
      { source: 'auto', taskIds: ['task-a', 'task-c'] },
      { source: 'manual_insert', taskIds: ['task-b', 'task-d'] },
    ])
  })
})
