import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CriticalPathOverrideInput, CriticalPathSnapshot } from '@/lib/criticalPath'
import type { Task } from '@/pages/GanttViewTypes'

import { CriticalPathGraph } from '../CriticalPathGraph'

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

function withTypedMetrics<T extends { taskId: string; floatDays: number; durationDays: number }>(tasks: T[]) {
  return tasks.map((task) => ({
    ...task,
    float: productionMetric(task.taskId === 'task-d' ? 4 : task.floatDays),
    duration: productionMetric(task.taskId === 'task-d' ? 2 : task.durationDays),
    freeFloat: productionMetric(0),
  }))
}

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
      totalDuration: productionMetric(10),
      displayLabel: '关键路径',
    },
    alternateChains: [],
    displayTaskIds: ['task-a', 'task-b', 'task-c', 'task-d'],
    edges: [
      { id: 'edge-a-b', fromTaskId: 'task-a', toTaskId: 'task-b', source: 'dependency', isPrimary: true },
      { id: 'edge-b-c', fromTaskId: 'task-b', toTaskId: 'task-c', source: 'dependency', isPrimary: true },
    ],
    tasks: withTypedMetrics([
      { taskId: 'task-a', title: '基础施工', floatDays: 0, durationDays: 2, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 0 },
      { taskId: 'task-b', title: '主体结构', floatDays: 0, durationDays: 3, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 1 },
      { taskId: 'task-c', title: '机电安装', floatDays: 0, durationDays: 5, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 2 },
      { taskId: 'task-d', title: '专项协调', floatDays: 999, durationDays: 999, isAutoCritical: false, isManualAttention: true, isManualInserted: false },
    ]),
    projectDurationDays: 999,
    projectDuration: productionMetric(10),
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
      totalDuration: productionMetric(5),
      displayLabel: '关键路径',
    },
    alternateChains: [
      {
        id: 'alternate-manual',
        source: 'manual_insert',
        taskIds: ['task-b', 'task-c'],
        totalDurationDays: 6,
        totalDuration: productionMetric(6),
        displayLabel: '手动插链 1',
      },
    ],
    displayTaskIds: ['task-a', 'task-b', 'task-c'],
    edges: [
      { id: 'edge-a-b', fromTaskId: 'task-a', toTaskId: 'task-b', source: 'dependency', isPrimary: true },
      { id: 'edge-b-c', fromTaskId: 'task-b', toTaskId: 'task-c', source: 'manual_link', isPrimary: false },
    ],
    tasks: withTypedMetrics([
      { taskId: 'task-a', title: '基础施工', floatDays: 0, durationDays: 2, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 0 },
      { taskId: 'task-b', title: '主体结构', floatDays: 0, durationDays: 3, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 1 },
      { taskId: 'task-c', title: '临建改造', floatDays: 1, durationDays: 1, isAutoCritical: false, isManualAttention: false, isManualInserted: true, chainIndex: 1 },
    ]),
    projectDurationDays: 5,
    projectDuration: productionMetric(5),
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
      totalDuration: productionMetric(10),
      displayLabel: '关键路径',
    },
    alternateChains: [
      {
        id: 'alternate-auto-1',
        source: 'auto',
        taskIds: ['task-e', 'task-f'],
        totalDurationDays: 999,
        totalDuration: productionMetric(7),
        displayLabel: '零浮时平行链 1',
      },
    ],
    displayTaskIds: ['task-a', 'task-b', 'task-c', 'task-e', 'task-f'],
    edges: [
      { id: 'edge-a-b', fromTaskId: 'task-a', toTaskId: 'task-b', source: 'dependency', isPrimary: true },
      { id: 'edge-b-c', fromTaskId: 'task-b', toTaskId: 'task-c', source: 'dependency', isPrimary: true },
      { id: 'edge-e-f', fromTaskId: 'task-e', toTaskId: 'task-f', source: 'dependency', isPrimary: false },
    ],
    tasks: withTypedMetrics([
      { taskId: 'task-a', title: '基础施工', floatDays: 0, durationDays: 2, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 0 },
      { taskId: 'task-b', title: '主体结构', floatDays: 0, durationDays: 3, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 1 },
      { taskId: 'task-c', title: '机电安装', floatDays: 0, durationDays: 5, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 2 },
      { taskId: 'task-e', title: '幕墙深化', floatDays: 0, durationDays: 3, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 0 },
      { taskId: 'task-f', title: '幕墙施工', floatDays: 0, durationDays: 4, isAutoCritical: true, isManualAttention: false, isManualInserted: false, chainIndex: 1 },
    ]),
    projectDurationDays: 999,
    projectDuration: productionMetric(10),
  }
}

describe('CriticalPathGraph', () => {
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined
  let originalRevokeObjectURL: typeof URL.revokeObjectURL | undefined
  let anchorClickSpy: ReturnType<typeof vi.spyOn>
  let createObjectUrlMock: ReturnType<typeof vi.fn>
  let revokeObjectUrlMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
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
    document.body.innerHTML = ''
  })

  it('renders an svg DAG and lets us switch the selected node from the graph', async () => {
    render(
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

    expect(screen.getByTestId('critical-path-svg')).toBeTruthy()
    expect(screen.getByTestId('critical-path-svg-node-task-a')).toBeTruthy()
    expect(document.body.textContent).toContain('基础施工')

    fireEvent.click(screen.getByTestId('critical-path-svg-node-task-d'))

    await waitFor(() => expect(document.body.textContent).toContain('专项协调'))
    expect(document.body.textContent).toContain('浮动 4 个生产日 · 工期 2 个生产日')
    expect(document.body.textContent).not.toContain('999')
  })

  it('keeps unavailable typed task facts fail-closed instead of showing legacy numbers or zero', async () => {
    const snapshot = createSnapshot()
    snapshot.tasks = snapshot.tasks.map((task) => task.taskId === 'task-d'
      ? {
          ...task,
          floatDays: 999,
          durationDays: 999,
          float: productionMetric(null, 'unavailable'),
          duration: null,
        }
      : task)

    render(
      <CriticalPathGraph
        projectName="示例项目"
        tasks={[createTask('task-d', '专项协调')]}
        snapshot={snapshot}
        overrides={[]}
        onRefresh={vi.fn()}
        onCreateOverride={vi.fn()}
        onDeleteOverride={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('critical-path-svg-node-task-d'))
    await waitFor(() => expect(document.body.textContent).toContain('生产日口径不可用'))
    expect(document.body.textContent).not.toContain('999')
    expect(document.body.textContent).not.toContain('计划工期 0 天')
  })

  it('submits a manual attention override for the task selected from the graph', async () => {
    const onCreateOverride = vi.fn()

    render(
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
        onCreateOverride={onCreateOverride}
        onDeleteOverride={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('critical-path-svg-node-task-d'))
    fireEvent.click(screen.getByTestId('critical-path-create-attention'))

    await waitFor(() =>
      expect(onCreateOverride).toHaveBeenCalledWith({
        taskId: 'task-d',
        mode: 'manual_attention',
        reason: '来自关键路径视图',
      } satisfies CriticalPathOverrideInput),
    )
  })

  it('supports zoom controls and svg export from the graph toolbar', async () => {
    render(
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

    const zoomInButton = screen.getByTestId('critical-path-zoom-in')
    const centerButton = screen.getByTestId('critical-path-center-selected')
    const exportSvgButton = screen.getByTestId('critical-path-export-svg')

    expect(zoomInButton).toBeTruthy()
    expect(centerButton).toBeTruthy()
    expect(exportSvgButton).toBeTruthy()
    expect(screen.getByTestId('critical-path-zoom-level').textContent).toContain('100%')

    fireEvent.click(zoomInButton)
    fireEvent.click(centerButton)

    expect(screen.getByTestId('critical-path-zoom-level').textContent).toContain('110%')

    fireEvent.click(exportSvgButton)

    await waitFor(() => {
      expect(createObjectUrlMock).toHaveBeenCalled()
      expect(anchorClickSpy).toHaveBeenCalled()
      expect(revokeObjectUrlMock).toHaveBeenCalled()
    })
  })

  it('renders manual insert edges with the required orange dashed styling', async () => {
    render(
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

    fireEvent.click(screen.getByTestId('critical-path-lane-alternate-manual'))

    await waitFor(() => expect(screen.getByTestId('critical-path-svg-edge-edge-b-c')).toBeTruthy())
    const manualEdge = screen.getByTestId('critical-path-svg-edge-edge-b-c')
    expect(manualEdge.getAttribute('stroke')).toBe('#fb923c')
    expect(manualEdge.getAttribute('stroke-dasharray')).toBe('7 5')
  })

  it('shows a cached failure banner when the snapshot comes from a failed recalculation', async () => {
    render(
      <CriticalPathGraph
        projectName="示例项目"
        tasks={[
          createTask('task-a', '基础施工'),
          createTask('task-b', '主体结构'),
          createTask('task-c', '机电安装'),
          createTask('task-d', '专项协调'),
        ]}
        snapshot={{
          ...createSnapshot(),
          calculationStatus: 'cached_after_failure',
          calculatedAt: '2026-04-26T08:00:00.000Z',
          lastSuccessfulCalculatedAt: '2026-04-26T08:00:00.000Z',
          calculationFailedAt: '2026-04-26T09:00:00.000Z',
          calculationFailureMessage: 'CRITICAL_PATH_CYCLE_DETECTED:task-b',
        }}
        overrides={[]}
        onRefresh={vi.fn()}
        onCreateOverride={vi.fn()}
        onDeleteOverride={vi.fn()}
      />,
    )

    const banner = screen.getByTestId('critical-path-calculation-cached-banner')
    expect(banner.textContent).toContain('最新计算失败')
    expect(banner.textContent).toContain('CRITICAL_PATH_CYCLE_DETECTED')
    expect(banner.textContent).toContain('最近成功')
  })

  it('keeps alternate chains collapsed by default and expands them on demand', async () => {
    render(
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

    expect(screen.getByTestId('critical-path-alternate-collapsed-alternate-auto-1')).toBeTruthy()
    expect(screen.queryByTestId('critical-path-alternate-content-alternate-auto-1')).toBeNull()

    fireEvent.click(screen.getByTestId('critical-path-alternate-toggle-alternate-auto-1'))

    await waitFor(() => {
      expect(screen.queryByTestId('critical-path-alternate-collapsed-alternate-auto-1')).toBeNull()
      expect(screen.getByTestId('critical-path-alternate-content-alternate-auto-1')).toBeTruthy()
    })
    expect(document.body.textContent).toContain('幕墙深化')
    expect(document.body.textContent).toContain('幕墙施工')
    expect(document.body.textContent).toContain('7 个生产日')
    expect(document.body.textContent).not.toContain('999')
  })
})
