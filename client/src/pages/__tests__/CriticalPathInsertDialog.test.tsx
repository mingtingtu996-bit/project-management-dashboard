import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { CriticalPathSnapshot } from '@/lib/criticalPath'
import type { Task } from '@/pages/GanttViewTypes'

import { CriticalPathInsertDialog } from '../GanttView/CriticalPathInsertDialog'

function productionMetric(value: number) {
  return {
    value,
    unit: 'construction_production_day' as const,
    calendarRef: 'work_calendar',
    calendarVersion: 'calendar-v1',
    timezone: 'Asia/Shanghai',
    asOf: '2026-06-12',
    availability: 'available' as const,
    unavailableReason: null,
  }
}

function createTask(id: string, title: string, status?: string): Task {
  return {
    id,
    project_id: 'project-1',
    title,
    status,
    created_at: '2026-04-19T08:00:00.000Z',
    updated_at: '2026-04-19T08:00:00.000Z',
  }
}

function createSnapshot(): CriticalPathSnapshot {
  return {
    projectId: 'project-1',
    autoTaskIds: ['task-b'],
    manualAttentionTaskIds: [],
    manualInsertedTaskIds: [],
    primaryChain: {
      id: 'primary-chain',
      source: 'auto',
      taskIds: ['task-b'],
      totalDurationDays: 5,
      totalDuration: productionMetric(5),
      displayLabel: '关键路径',
    },
    alternateChains: [],
    displayTaskIds: ['task-b'],
    edges: [],
    tasks: [
      {
        taskId: 'task-b',
        title: '主体结构',
        floatDays: 0,
        float: productionMetric(0),
        durationDays: 5,
        duration: productionMetric(5),
        freeFloat: productionMetric(0),
        isAutoCritical: true,
        isManualAttention: false,
        isManualInserted: false,
        chainIndex: 0,
      },
    ],
    projectDurationDays: 5,
    projectDuration: productionMetric(5),
  }
}

describe('CriticalPathInsertDialog', () => {
  it('selects a non-main-chain task and submits the correct anchor payload', async () => {
    const onCreateOverride = vi.fn().mockResolvedValue(undefined)

    render(
      <CriticalPathInsertDialog
        open
        onOpenChange={vi.fn()}
        anchorTask={createTask('task-b', '主体结构')}
        direction="before"
        tasks={[
          createTask('task-a', '基础施工', 'todo'),
          createTask('task-b', '主体结构', 'in_progress'),
          createTask('task-c', '机电安装', 'completed'),
        ]}
        snapshot={createSnapshot()}
        actionLoading={false}
        onCreateOverride={onCreateOverride}
      />,
    )

    expect(screen.getByTestId('critical-path-insert-dialog')).toBeTruthy()
    expect(screen.getByTestId('critical-path-insert-task-task-a')).toBeTruthy()
    expect(screen.queryByTestId('critical-path-insert-task-task-b')).toBeNull()

    fireEvent.click(screen.getByTestId('critical-path-insert-submit'))

    await waitFor(() => {
      expect(onCreateOverride).toHaveBeenCalledWith({
        taskId: 'task-a',
        mode: 'manual_insert',
        anchorType: 'before',
        leftTaskId: null,
        rightTaskId: 'task-b',
        reason: '来自关键路径操作：主体结构',
      })
    })
  })
})
