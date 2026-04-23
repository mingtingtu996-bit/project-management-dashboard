import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CriticalPathOverrideInput, CriticalPathOverrideRecord, CriticalPathSnapshot } from '@/lib/criticalPath'
import type { Task } from '@/pages/GanttViewTypes'

import { CriticalPathGraph } from '../CriticalPathGraph'

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
    autoTaskIds: ['task-a', 'task-b', 'task-c', 'task-d'],
    manualAttentionTaskIds: ['task-d'],
    manualInsertedTaskIds: [],
    primaryChain: {
      id: 'primary-chain',
      source: 'auto',
      taskIds: ['task-a', 'task-b', 'task-c'],
      totalDurationDays: 10,
      displayLabel: '关键路径',
    },
    alternateChains: [],
    displayTaskIds: ['task-a', 'task-b', 'task-c', 'task-d'],
    edges: [
      { id: 'edge-a-b', fromTaskId: 'task-a', toTaskId: 'task-b', source: 'dependency', isPrimary: true },
      { id: 'edge-b-c', fromTaskId: 'task-b', toTaskId: 'task-c', source: 'dependency', isPrimary: true },
    ],
    tasks: [
      { taskId: 'task-a', title: '基础施工', floatDays: 0, durationDays: 2, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 0 },
      { taskId: 'task-b', title: '主体结构', floatDays: 0, durationDays: 3, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 1 },
      { taskId: 'task-c', title: '机电安装', floatDays: 0, durationDays: 5, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 2 },
      { taskId: 'task-d', title: '专项协调', floatDays: 4, durationDays: 2, isAutoCritical: false, isManualAttention: true, isManualInserted: false },
    ],
    projectDurationDays: 10,
  }
}

function createManualInsertSnapshot(): CriticalPathSnapshot {
  return {
    projectId: 'project-1',
    autoTaskIds: ['task-a', 'task-b'],
    manualAttentionTaskIds: [],
    manualInsertedTaskIds: ['task-c'],
    primaryChain: {
      id: 'primary-chain',
      source: 'auto',
      taskIds: ['task-a', 'task-b'],
      totalDurationDays: 5,
      displayLabel: '关键路径',
    },
    alternateChains: [
      {
        id: 'alternate-manual',
        source: 'manual_insert',
        taskIds: ['task-b', 'task-c'],
        totalDurationDays: 6,
        displayLabel: '手动插链 1',
      },
    ],
    displayTaskIds: ['task-a', 'task-b', 'task-c'],
    edges: [
      { id: 'edge-a-b', fromTaskId: 'task-a', toTaskId: 'task-b', source: 'dependency', isPrimary: true },
      { id: 'edge-b-c', fromTaskId: 'task-b', toTaskId: 'task-c', source: 'manual_link', isPrimary: false },
    ],
    tasks: [
      { taskId: 'task-a', title: '基础施工', floatDays: 0, durationDays: 2, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 0 },
      { taskId: 'task-b', title: '主体结构', floatDays: 0, durationDays: 3, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 1 },
      { taskId: 'task-c', title: '临建改造', floatDays: 1, durationDays: 1, isAutoCritical: false, isManualAttention: false, isManualInserted: true, chainIndex: 1 },
    ],
    projectDurationDays: 5,
  }
}

function createAlternateChainSnapshot(): CriticalPathSnapshot {
  return {
    projectId: 'project-1',
    autoTaskIds: ['task-a', 'task-b', 'task-c', 'task-e', 'task-f'],
    manualAttentionTaskIds: [],
    manualInsertedTaskIds: [],
    primaryChain: {
      id: 'primary-chain',
      source: 'auto',
      taskIds: ['task-a', 'task-b', 'task-c'],
      totalDurationDays: 10,
      displayLabel: '关键路径',
    },
    alternateChains: [
      {
        id: 'alternate-auto-1',
        source: 'auto',
        taskIds: ['task-e', 'task-f'],
        totalDurationDays: 7,
        displayLabel: '零浮时平行链 1',
      },
    ],
    displayTaskIds: ['task-a', 'task-b', 'task-c', 'task-e', 'task-f'],
    edges: [
      { id: 'edge-a-b', fromTaskId: 'task-a', toTaskId: 'task-b', source: 'dependency', isPrimary: true },
      { id: 'edge-b-c', fromTaskId: 'task-b', toTaskId: 'task-c', source: 'dependency', isPrimary: true },
      { id: 'edge-e-f', fromTaskId: 'task-e', toTaskId: 'task-f', source: 'dependency', isPrimary: false },
    ],
    tasks: [
      { taskId: 'task-a', title: '基础施工', floatDays: 0, durationDays: 2, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 0 },
      { taskId: 'task-b', title: '主体结构', floatDays: 0, durationDays: 3, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 1 },
      { taskId: 'task-c', title: '机电安装', floatDays: 0, durationDays: 5, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 2 },
      { taskId: 'task-e', title: '幕墙深化', floatDays: 0, durationDays: 3, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 0 },
      { taskId: 'task-f', title: '幕墙施工', floatDays: 0, durationDays: 4, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 1 },
    ],
    projectDurationDays: 10,
  }
}

async function flush() {
  await Promise.resolve()
}

function clickNode(element: Element | null) {
  if (!element) {
    throw new Error('Expected node element to exist')
  }
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('CriticalPathGraph', () => {
  let container: HTMLDivElement
  let root: Root | null = null
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined
  let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined
  let anchorClickSpy: ReturnType<typeof vi.spyOn>
  let createObjectUrlMock: ReturnType<typeof vi.fn>
  let revokeObjectUrlMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    originalCreateObjectURL = URL.createObjectURL
    originalRevokeObjectURL = URL.revokeObjectURL
    createObjectUrlMock = vi.fn(() => 'blob:critical-path')
    revokeObjectUrlMock = vi.fn(() => undefined)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectUrlMock,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectUrlMock,
    })
    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    root = null
    anchorClickSpy.mockRestore()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: originalCreateObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: originalRevokeObjectURL,
    })
    container.remove()
  })

  it('renders an svg DAG and lets us switch the selected node from the graph', async () => {
    await act(async () => {
      root?.render(
        <CriticalPathGraph
          projectName="示例项目"
          tasks={[
            createTask('task-a', '基础施工'),
            createTask('task-b', '主体结构'),
            createTask('task-c', '机电安装'),
            createTask('task-d', '专项协调'),
          ]}
          snapshot={createSnapshot()}
          overrides={[]}
          onRefresh={vi.fn()}
          onCreateOverride={vi.fn()}
          onDeleteOverride={vi.fn()}
        />,
      )
      await flush()
    })

    expect(container.querySelector('[data-testid=\"critical-path-svg\"]')).not.toBeNull()
    expect(container.querySelector('[data-testid=\"critical-path-svg-node-task-a\"]')).not.toBeNull()
    expect(container.textContent).toContain('基础施工')

    await act(async () => {
      clickNode(container.querySelector('[data-testid=\"critical-path-svg-node-task-d\"]'))
      await flush()
    })

    expect(container.textContent).toContain('专项协调')
    expect(container.textContent).toContain('浮动 4 天 · 工期 2 天')
  })

  it('submits a manual attention override for the task selected from the graph', async () => {
    const onCreateOverride = vi.fn<(input: CriticalPathOverrideInput) => void>()
    const overrides: CriticalPathOverrideRecord[] = []

    await act(async () => {
      root?.render(
        <CriticalPathGraph
          projectName="示例项目"
          tasks={[
            createTask('task-a', '基础施工'),
            createTask('task-b', '主体结构'),
            createTask('task-c', '机电安装'),
            createTask('task-d', '专项协调'),
          ]}
          snapshot={createSnapshot()}
          overrides={overrides}
          onRefresh={vi.fn()}
          onCreateOverride={onCreateOverride}
          onDeleteOverride={vi.fn()}
        />,
      )
      await flush()
    })

    await act(async () => {
      clickNode(container.querySelector('[data-testid=\"critical-path-svg-node-task-d\"]'))
      await flush()
    })

    const attentionButton = container.querySelector('[data-testid=\"critical-path-create-attention\"]')
    expect(attentionButton).not.toBeNull()

    await act(async () => {
      ;(attentionButton as HTMLButtonElement).click()
      await flush()
    })

    expect(onCreateOverride).toHaveBeenCalledWith({
      taskId: 'task-d',
      mode: 'manual_attention',
      reason: '来自关键路径视图',
    })
  })

  it('supports zoom controls and svg export from the graph toolbar', async () => {
    await act(async () => {
      root?.render(
        <CriticalPathGraph
          projectName="示例项目"
          tasks={[
            createTask('task-a', '基础施工'),
            createTask('task-b', '主体结构'),
            createTask('task-c', '机电安装'),
            createTask('task-d', '专项协调'),
          ]}
          snapshot={createSnapshot()}
          overrides={[]}
          onRefresh={vi.fn()}
          onCreateOverride={vi.fn()}
          onDeleteOverride={vi.fn()}
        />,
      )
      await flush()
    })

    const zoomInButton = container.querySelector('[data-testid=\"critical-path-zoom-in\"]')
    const centerButton = container.querySelector('[data-testid=\"critical-path-center-selected\"]')
    const exportSvgButton = container.querySelector('[data-testid=\"critical-path-export-svg\"]')

    expect(zoomInButton).not.toBeNull()
    expect(centerButton).not.toBeNull()
    expect(exportSvgButton).not.toBeNull()
    expect(container.querySelector('[data-testid=\"critical-path-zoom-level\"]')?.textContent).toContain('100%')

    await act(async () => {
      ;(zoomInButton as HTMLButtonElement).click()
      ;(centerButton as HTMLButtonElement).click()
      await flush()
    })

    expect(container.querySelector('[data-testid=\"critical-path-zoom-level\"]')?.textContent).toContain('110%')

    await act(async () => {
      ;(exportSvgButton as HTMLButtonElement).click()
      await flush()
    })

    expect(createObjectUrlMock).toHaveBeenCalled()
    expect(anchorClickSpy).toHaveBeenCalled()
    expect(revokeObjectUrlMock).toHaveBeenCalled()
  })

  it('renders manual insert edges with the required orange dashed styling', async () => {
    await act(async () => {
      root?.render(
        <CriticalPathGraph
          projectName="示例项目"
          tasks={[
            createTask('task-a', '基础施工'),
            createTask('task-b', '主体结构'),
            createTask('task-c', '临建改造'),
          ]}
          snapshot={createManualInsertSnapshot()}
          overrides={[]}
          onRefresh={vi.fn()}
          onCreateOverride={vi.fn()}
          onDeleteOverride={vi.fn()}
        />,
      )
      await flush()
    })

    const manualEdge = container.querySelector('[data-testid=\"critical-path-svg-edge-edge-b-c\"]')
    expect(manualEdge).not.toBeNull()
    expect(manualEdge?.getAttribute('stroke')).toBe('#fb923c')
    expect(manualEdge?.getAttribute('stroke-dasharray')).toBe('7 5')
  })

  it('keeps alternate chains collapsed by default and expands them on demand', async () => {
    await act(async () => {
      root?.render(
        <CriticalPathGraph
          projectName="示例项目"
          tasks={[
            createTask('task-a', '基础施工'),
            createTask('task-b', '主体结构'),
            createTask('task-c', '机电安装'),
            createTask('task-e', '幕墙深化'),
            createTask('task-f', '幕墙施工'),
          ]}
          snapshot={createAlternateChainSnapshot()}
          overrides={[]}
          onRefresh={vi.fn()}
          onCreateOverride={vi.fn()}
          onDeleteOverride={vi.fn()}
        />,
      )
      await flush()
    })

    expect(container.querySelector('[data-testid=\"critical-path-alternate-collapsed-alternate-auto-1\"]')).not.toBeNull()
    expect(container.querySelector('[data-testid=\"critical-path-alternate-content-alternate-auto-1\"]')).toBeNull()

    await act(async () => {
      ;(container.querySelector('[data-testid=\"critical-path-alternate-toggle-alternate-auto-1\"]') as HTMLButtonElement).click()
      await flush()
    })

    expect(container.querySelector('[data-testid=\"critical-path-alternate-collapsed-alternate-auto-1\"]')).toBeNull()
    expect(container.querySelector('[data-testid=\"critical-path-alternate-content-alternate-auto-1\"]')).not.toBeNull()
    expect(container.textContent).toContain('幕墙深化')
    expect(container.textContent).toContain('幕墙施工')
  })
})
