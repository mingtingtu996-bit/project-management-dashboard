import { describe, expect, it } from 'vitest'

import type { CriticalPathSnapshot } from '@/lib/criticalPath'
import type { Task } from '@/pages/GanttViewTypes'

import { buildCriticalPathLayout } from '../buildCriticalPathLayout'

function createTask(id: string, title: string): Task {
  return {
    id,
    project_id: 'project-1',
    title,
    created_at: '2026-04-19T08:00:00.000Z',
    updated_at: '2026-04-19T08:00:00.000Z',
  }
}

function createSnapshot(): CriticalPathSnapshot {
  return {
    projectId: 'project-1',
    autoTaskIds: ['task-a', 'task-b', 'task-c', 'task-d', 'task-e'],
    manualAttentionTaskIds: ['task-f'],
    manualInsertedTaskIds: ['task-g'],
    primaryChain: {
      id: 'primary-chain',
      source: 'auto',
      taskIds: ['task-a', 'task-b', 'task-c'],
      totalDurationDays: 10,
      displayLabel: '关键路径',
    },
    alternateChains: [
      {
        id: 'alternate-chain-1',
        source: 'auto',
        taskIds: ['task-d', 'task-e'],
        totalDurationDays: 8,
        displayLabel: '零浮时平行链 1',
      },
      {
        id: 'alternate-chain-2',
        source: 'manual_insert',
        taskIds: ['task-c', 'task-g'],
        totalDurationDays: 11,
        displayLabel: '手动插链 1',
      },
    ],
    displayTaskIds: ['task-a', 'task-b', 'task-c', 'task-d', 'task-e', 'task-f', 'task-g', 'task-h'],
    edges: [
      { id: 'edge-a-b', fromTaskId: 'task-a', toTaskId: 'task-b', source: 'dependency', isPrimary: true },
      { id: 'edge-b-c', fromTaskId: 'task-b', toTaskId: 'task-c', source: 'dependency', isPrimary: true },
      { id: 'edge-d-e', fromTaskId: 'task-d', toTaskId: 'task-e', source: 'dependency', isPrimary: false },
      { id: 'edge-c-g', fromTaskId: 'task-c', toTaskId: 'task-g', source: 'manual_link', isPrimary: false },
    ],
    tasks: [
      { taskId: 'task-a', title: '基础施工', floatDays: 0, durationDays: 2, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 0 },
      { taskId: 'task-b', title: '主体结构', floatDays: 0, durationDays: 3, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 1 },
      { taskId: 'task-c', title: '机电安装', floatDays: 0, durationDays: 5, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 2 },
      { taskId: 'task-d', title: '幕墙深化', floatDays: 0, durationDays: 3, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 0 },
      { taskId: 'task-e', title: '幕墙施工', floatDays: 0, durationDays: 5, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 1 },
      { taskId: 'task-f', title: '专项协调', floatDays: 4, durationDays: 2, isAutoCritical: false, isManualAttention: true, isManualInserted: false },
      { taskId: 'task-g', title: '临建改造', floatDays: 1, durationDays: 1, isAutoCritical: false, isManualAttention: false, isManualInserted: true, chainIndex: 1 },
      { taskId: 'task-h', title: '资料收口', floatDays: 6, durationDays: 2, isAutoCritical: false, isManualAttention: false, isManualInserted: false },
    ],
    projectDurationDays: 10,
  }
}

describe('buildCriticalPathLayout', () => {
  it('builds stable lanes for primary, alternate, attention, and remaining display tasks', () => {
    const layout = buildCriticalPathLayout({
      snapshot: createSnapshot(),
      tasks: [
        createTask('task-a', '基础施工'),
        createTask('task-b', '主体结构'),
        createTask('task-c', '机电安装'),
        createTask('task-d', '幕墙深化'),
        createTask('task-e', '幕墙施工'),
        createTask('task-f', '专项协调'),
        createTask('task-g', '临建改造'),
        createTask('task-h', '资料收口'),
      ],
    })

    expect(layout.lanes.map((lane) => ({ type: lane.type, taskIds: lane.taskIds }))).toEqual([
      { type: 'primary', taskIds: ['task-a', 'task-b', 'task-c'] },
      { type: 'alternate', taskIds: ['task-d', 'task-e'] },
      { type: 'alternate', taskIds: ['task-c', 'task-g'] },
      { type: 'attention', taskIds: ['task-f'] },
      { type: 'other', taskIds: ['task-h'] },
    ])
    expect(layout.columnCount).toBeGreaterThanOrEqual(3)
    expect(layout.canvasWidth).toBeGreaterThan(600)
    expect(layout.canvasHeight).toBeGreaterThan(500)
  })

  it('keeps edge direction monotonic and preserves manual attention/manual insert node flags', () => {
    const layout = buildCriticalPathLayout({
      snapshot: createSnapshot(),
      tasks: [
        createTask('task-a', '基础施工'),
        createTask('task-b', '主体结构'),
        createTask('task-c', '机电安装'),
        createTask('task-d', '幕墙深化'),
        createTask('task-e', '幕墙施工'),
        createTask('task-f', '专项协调'),
        createTask('task-g', '临建改造'),
        createTask('task-h', '资料收口'),
      ],
    })

    const nodeById = new Map(layout.nodes.map((node) => [node.taskId, node]))
    const edgeById = new Map(layout.edges.map((edge) => [edge.id, edge]))

    expect(nodeById.get('task-f')?.isManualAttention).toBe(true)
    expect(nodeById.get('task-g')?.isManualInserted).toBe(true)
    expect(nodeById.get('task-a')?.isPrimary).toBe(true)

    expect((nodeById.get('task-b')?.column ?? -1)).toBeGreaterThan(nodeById.get('task-a')?.column ?? Number.MAX_SAFE_INTEGER)
    expect((nodeById.get('task-c')?.column ?? -1)).toBeGreaterThan(nodeById.get('task-b')?.column ?? Number.MAX_SAFE_INTEGER)
    expect((nodeById.get('task-e')?.column ?? -1)).toBeGreaterThan(nodeById.get('task-d')?.column ?? Number.MAX_SAFE_INTEGER)
    expect((nodeById.get('task-g')?.column ?? -1)).toBeGreaterThan(nodeById.get('task-c')?.column ?? Number.MAX_SAFE_INTEGER)

    expect(edgeById.get('edge-a-b')?.path).toContain('C')
    expect(edgeById.get('edge-c-g')?.source).toBe('manual_link')
    expect((edgeById.get('edge-c-g')?.endX ?? 0)).toBeGreaterThan(edgeById.get('edge-c-g')?.startX ?? Number.MAX_SAFE_INTEGER)
  })
})
