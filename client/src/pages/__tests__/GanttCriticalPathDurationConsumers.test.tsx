import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { CriticalTaskNetworkSchedule, CriticalTaskSnapshot } from '@/lib/criticalPath'
import { TaskDetailPanel } from '../GanttViewPanels'
import { TaskRowMetaChips } from '../GanttViewRowSections'
import type { Task } from '../GanttViewTypes'
import { formatGanttCriticalPathSummary } from '../GanttView/ganttViewUtils'

function productionMetric(value: number | null, availability: 'available' | 'unavailable' = 'available') {
  return {
    value: availability === 'available' ? value : null,
    unit: 'construction_production_day' as const,
    calendarRef: availability === 'available' ? 'work_calendar' : null,
    calendarVersion: availability === 'available' ? 'calendar-v1' : null,
    timezone: 'Asia/Shanghai',
    asOf: '2026-07-07',
    availability,
    unavailableReason: availability === 'available' ? null : 'construction_calendar_identity_missing',
  }
}

function schedule(availability: 'available' | 'unavailable' = 'available'): CriticalTaskNetworkSchedule {
  return {
    taskId: 'task-1',
    earliestStartOffsetDays: 0,
    earliestFinishOffsetDays: 10,
    latestStartOffsetDays: 4,
    latestFinishOffsetDays: 14,
    floatDays: 999,
    float: productionMetric(4, availability),
    freeFloatDays: 999,
    freeFloat: productionMetric(2, availability),
    durationDays: 999,
    duration: productionMetric(10, availability),
    isAutoCritical: true,
  }
}

const snapshotTask: CriticalTaskSnapshot = {
  taskId: 'task-1',
  title: '主体结构',
  floatDays: 999,
  float: productionMetric(4),
  durationDays: 999,
  duration: productionMetric(10),
  freeFloatDays: 999,
  freeFloat: productionMetric(2),
  isAutoCritical: true,
  isManualAttention: false,
  isManualInserted: false,
}

const task: Task = {
  id: 'task-1',
  project_id: 'project-1',
  title: '主体结构',
  total_float_days: 999,
  free_float_days: 999,
  created_at: '2026-07-07T00:00:00.000Z',
  updated_at: '2026-07-07T00:00:00.000Z',
}

describe('Gantt critical-path typed duration consumers', () => {
  it('formats the Gantt summary from the typed project production-day fact', () => {
    expect(formatGanttCriticalPathSummary({
      primaryTaskCount: 2,
      projectDuration: productionMetric(12),
      alternateChainCount: 0,
      manualAttentionCount: 0,
      manualInsertedCount: 0,
    })).toContain('工期 12 个生产日')

    expect(formatGanttCriticalPathSummary({
      primaryTaskCount: 2,
      projectDuration: productionMetric(null, 'unavailable'),
      alternateChainCount: 0,
      manualAttentionCount: 0,
      manualInsertedCount: 0,
    })).toContain('工期 生产日口径不可用')
  })

  it('renders selected-task CPM values from network typed facts only', () => {
    render(
      <MemoryRouter>
        <TaskDetailPanel
          projectId="project-1"
          selectedTask={task}
          onClose={vi.fn()}
          getBusinessStatus={() => ({ label: '进行中', cls: 'text-blue-700' })}
          onEdit={vi.fn()}
          onOpenCondition={vi.fn()}
          onOpenObstacle={vi.fn()}
          criticalPathSummaryText="关键路径 1 项"
          selectedCriticalPathTask={snapshotTask}
          selectedCriticalPathSchedule={schedule()}
          onOpenCriticalPathDialog={vi.fn()}
          onSaveProgress={vi.fn()}
          onOpenChangeLogs={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('4 个生产日')).toBeInTheDocument()
    expect(screen.getByText('2 个生产日')).toBeInTheDocument()
    expect(screen.getByText('10 个生产日')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('999')
  })

  it('renders row float badges from typed network facts and fails closed when unavailable', () => {
    const { rerender } = render(
      <TaskRowMetaChips
        taskId="task-1"
        bizStatus={{ label: '进行中', cls: 'text-blue-700' }}
        overdueDays={0}
        conditionSummary={undefined}
        obstacleCount={0}
        criticalTask={snapshotTask}
        criticalSchedule={schedule()}
        expandedConditionTaskId={null}
        onToggleInlineConditions={vi.fn()}
      />,
    )

    expect(screen.getByTestId('gantt-critical-badge-task-1')).toHaveTextContent('关键 · 4 个生产日')
    expect(document.body.textContent).not.toContain('999')

    rerender(
      <TaskRowMetaChips
        taskId="task-1"
        bizStatus={{ label: '进行中', cls: 'text-blue-700' }}
        overdueDays={0}
        conditionSummary={undefined}
        obstacleCount={0}
        criticalTask={snapshotTask}
        criticalSchedule={schedule('unavailable')}
        expandedConditionTaskId={null}
        onToggleInlineConditions={vi.fn()}
      />,
    )

    expect(screen.getByTestId('gantt-critical-badge-task-1')).toHaveTextContent('关键 · 生产日口径不可用')
    expect(document.body.textContent).not.toContain('999')
  })
})
