import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CriticalPathSnapshot } from '@/lib/criticalPath'
import type { Task } from '@/pages/GanttViewTypes'

import { CriticalPathDialog } from '../GanttView/CriticalPathDialog'

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
    autoTaskIds: ['task-a', 'task-b', 'task-c'],
    manualAttentionTaskIds: ['task-c'],
    manualInsertedTaskIds: [],
    primaryChain: {
      id: 'primary-chain',
      source: 'auto',
      taskIds: ['task-a', 'task-b'],
      totalDurationDays: 5,
      displayLabel: '关键路径',
    },
    alternateChains: [],
    displayTaskIds: ['task-a', 'task-b', 'task-c'],
    edges: [
      { id: 'edge-a-b', fromTaskId: 'task-a', toTaskId: 'task-b', source: 'dependency', isPrimary: true },
    ],
    tasks: [
      { taskId: 'task-a', title: '基础施工', floatDays: 0, durationDays: 2, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 0 },
      { taskId: 'task-b', title: '主体结构', floatDays: 0, durationDays: 3, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 1 },
      { taskId: 'task-c', title: '专项协调', floatDays: 4, durationDays: 2, isAutoCritical: false, isManualAttention: true, isManualInserted: false },
    ],
    projectDurationDays: 5,
  }
}

describe('CriticalPathDialog contract', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  function render(node: ReactElement) {
    act(() => {
      root?.render(node)
    })
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    document.body.innerHTML = ''
  })

  it('renders snapshot summary and nested critical path graph when open', () => {
    render(
      <CriticalPathDialog
        open
        onOpenChange={vi.fn()}
        projectName="示例项目"
        tasks={[
          createTask('task-a', '基础施工'),
          createTask('task-b', '主体结构'),
          createTask('task-c', '专项协调'),
        ]}
        snapshot={createSnapshot()}
        overrides={[]}
        onRefresh={vi.fn()}
        onCreateOverride={vi.fn()}
        onDeleteOverride={vi.fn()}
      />,
    )

    expect(document.body.querySelector('[data-testid=\"critical-path-dialog\"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid=\"critical-path-graph\"]')).toBeTruthy()
    expect(document.body.textContent).toContain('关键路径图谱')
    expect(document.body.textContent).toContain('工期 5 天')
    expect(document.body.textContent).toContain('关注 1 项')
  })

  it('shows loading summary text when snapshot is not ready', () => {
    render(
      <CriticalPathDialog
        open
        onOpenChange={vi.fn()}
        projectName="示例项目"
        tasks={[]}
        snapshot={null}
        overrides={[]}
        onRefresh={vi.fn()}
        onCreateOverride={vi.fn()}
        onDeleteOverride={vi.fn()}
      />,
    )

    expect(document.body.querySelector('[data-testid=\"critical-path-dialog\"]')).toBeTruthy()
    expect(document.body.textContent).toContain('等待关键路径快照加载')
  })
})
