import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiDelete: vi.fn(),
  apiGet: mocks.apiGet,
  apiPatch: vi.fn(),
  apiPost: mocks.apiPost,
}))

import {
  buildCriticalPathSummaryModel,
  fetchCriticalPathSnapshot,
  normalizeCriticalPathSnapshot,
  refreshCriticalPathSnapshot,
  summarizeCriticalPathSnapshot,
  type CriticalPathSnapshot,
} from '../criticalPath'

function productionMetric(value: number | null, availability: 'available' | 'unavailable' = 'available') {
  return {
    value: availability === 'available' ? value : null,
    unit: 'construction_production_day' as const,
    calendarRef: availability === 'available' ? 'work_calendar' : null,
    calendarVersion: availability === 'available' ? 'calendar-v1' : null,
    timezone: 'Asia/Shanghai',
    asOf: '2026-06-12',
    availability,
    unavailableReason: availability === 'available' ? null : 'construction_calendar_identity_missing',
  }
}

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
      totalDurationDays: 999,
      totalDuration: productionMetric(12),
      displayLabel: '主关键路径',
    },
    alternateChains: [{
      id: 'chain-alt',
      source: 'manual_insert',
      taskIds: ['task-b', 'task-d'],
      totalDurationDays: 998,
      totalDuration: productionMetric(8),
      displayLabel: '手动插链',
    }],
    displayTaskIds: ['task-a', 'task-b', 'task-c', 'task-d'],
    edges: [],
    tasks: [
      {
        taskId: 'task-a',
        title: 'A',
        floatDays: 999,
        float: productionMetric(0),
        durationDays: 999,
        duration: productionMetric(5),
        freeFloatDays: 999,
        freeFloat: productionMetric(1),
        isAutoCritical: true,
        isManualAttention: false,
        isManualInserted: false,
        chainIndex: 0,
      },
      {
        taskId: 'task-b',
        title: 'B',
        floatDays: 999,
        float: productionMetric(0),
        durationDays: 999,
        duration: productionMetric(7),
        freeFloatDays: 999,
        freeFloat: productionMetric(0),
        isAutoCritical: true,
        isManualAttention: false,
        isManualInserted: false,
        chainIndex: 1,
      },
    ],
    networkSchedule: [{
      taskId: 'task-a',
      earliestStartOffsetDays: 0,
      earliestFinishOffsetDays: 5,
      latestStartOffsetDays: 0,
      latestFinishOffsetDays: 5,
      floatDays: 999,
      float: productionMetric(0),
      freeFloatDays: 999,
      freeFloat: productionMetric(1),
      durationDays: 999,
      duration: productionMetric(5),
      isAutoCritical: true,
    }],
    projectDurationDays: 999,
    projectDuration: productionMetric(12),
    calculatedAt: '2026-06-12T00:00:00.000Z',
  }
}

describe('criticalPath snapshot display helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('summarizes backend critical path snapshots without running a frontend CPM engine', () => {
    const summary = summarizeCriticalPathSnapshot(makeSnapshot())

    expect(summary).toBe('关键路径 2 项，工期 12 个生产日，备选 1 条，关注 1 项，插链 1 项')
    expect(summary).not.toContain('999')
  })

  it('builds a display model from the backend snapshot', () => {
    const model = buildCriticalPathSummaryModel(makeSnapshot())

    expect(model?.primaryTaskCount).toBe(2)
    expect(model?.alternateChainCount).toBe(1)
    expect(model?.manualAttentionCount).toBe(1)
    expect(model?.manualInsertedCount).toBe(1)
    expect(model?.displayTaskCount).toBe(4)
    expect(model?.projectDuration).toEqual(productionMetric(12))
    expect(model).not.toHaveProperty('projectDurationDays')
  })

  it('fails closed when typed production-day facts are missing or use the wrong unit', () => {
    const raw = {
      ...makeSnapshot(),
      projectDuration: undefined,
    } as unknown as CriticalPathSnapshot & Record<string, unknown>
    raw.projectDurationDays = 999
    raw.primaryChain = {
      ...raw.primaryChain!,
      totalDuration: {
        ...productionMetric(12),
        unit: 'calendar_day',
      },
      totalDurationDays: 999,
    }

    const normalized = normalizeCriticalPathSnapshot(raw)
    const summary = summarizeCriticalPathSnapshot(normalized)

    expect(normalized.projectDuration).toBeNull()
    expect(normalized.primaryChain?.totalDuration).toBeNull()
    expect(summary).toContain('生产日口径不可用')
    expect(summary).not.toContain('999')
  })

  it('normalizes GET and refresh responses without synthesizing typed facts from legacy numbers', async () => {
    const raw = {
      ...makeSnapshot(),
      projectDuration: undefined,
      projectDurationDays: 999,
    }
    mocks.apiGet.mockResolvedValueOnce(raw)
    mocks.apiPost.mockResolvedValueOnce(raw)

    const fetched = await fetchCriticalPathSnapshot('project-1')
    const refreshed = await refreshCriticalPathSnapshot('project-1')

    expect(fetched.projectDuration).toBeNull()
    expect(refreshed.projectDuration).toBeNull()
    expect(summarizeCriticalPathSnapshot(fetched)).not.toContain('999')
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
      projectDuration: productionMetric(0),
    } satisfies CriticalPathSnapshot

    expect(summarizeCriticalPathSnapshot(null)).toBe('')
    expect(summarizeCriticalPathSnapshot(empty)).toBe('无关键路径')
    expect(buildCriticalPathSummaryModel(null)).toBeNull()
  })
})
