import { describe, expect, it } from 'vitest'

import {
  buildCriticalPathSummaryModel,
  summarizeCriticalPathSnapshot,
  type CriticalPathSnapshot,
} from '../criticalPath'

function makeSnapshot(): CriticalPathSnapshot {
  return {
    projectId: 'project-1',
    autoTaskIds: ['task-a', 'task-b'],
    manualAttentionTaskIds: ['task-c'],
    manualInsertedTaskIds: ['task-d'],
    primaryChain: {
      id: 'chain-primary',
      source: 'auto',
      taskIds: ['task-a', 'task-b'],
      totalDurationDays: 12,
      displayLabel: '主关键路径',
    },
    alternateChains: [{
      id: 'chain-alt',
      source: 'manual_insert',
      taskIds: ['task-b', 'task-d'],
      totalDurationDays: 8,
      displayLabel: '手动插链',
    }],
    displayTaskIds: ['task-a', 'task-b', 'task-c', 'task-d'],
    edges: [],
    tasks: [
      {
        taskId: 'task-a',
        title: 'A',
        floatDays: 0,
        durationDays: 5,
        isAutoCritical: true,
        isManualAttention: false,
        isManualInserted: false,
        chainIndex: 0,
      },
      {
        taskId: 'task-b',
        title: 'B',
        floatDays: 0,
        durationDays: 7,
        isAutoCritical: true,
        isManualAttention: false,
        isManualInserted: false,
        chainIndex: 1,
      },
    ],
    projectDurationDays: 12,
    calculatedAt: '2026-06-12T00:00:00.000Z',
  }
}

describe('criticalPath snapshot display helpers', () => {
  it('summarizes backend critical path snapshots without running a frontend CPM engine', () => {
    expect(summarizeCriticalPathSnapshot(makeSnapshot())).toBe('关键路径 2 项，工期 12 天，备选 1 条，关注 1 项，插链 1 项')
  })

  it('builds a display model from the backend snapshot', () => {
    const model = buildCriticalPathSummaryModel(makeSnapshot())

    expect(model?.primaryTaskCount).toBe(2)
    expect(model?.alternateChainCount).toBe(1)
    expect(model?.manualAttentionCount).toBe(1)
    expect(model?.manualInsertedCount).toBe(1)
    expect(model?.displayTaskCount).toBe(4)
    expect(model?.projectDurationDays).toBe(12)
  })

  it('keeps empty and missing snapshots display-safe', () => {
    const empty = {
      ...makeSnapshot(),
      autoTaskIds: [],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: null,
      alternateChains: [],
      displayTaskIds: [],
      tasks: [],
      projectDurationDays: 0,
    } satisfies CriticalPathSnapshot

    expect(summarizeCriticalPathSnapshot(null)).toBe('')
    expect(summarizeCriticalPathSnapshot(empty)).toBe('无关键路径')
    expect(buildCriticalPathSummaryModel(null)).toBeNull()
  })
})
