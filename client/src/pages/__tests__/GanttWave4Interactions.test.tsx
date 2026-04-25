import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TaskDetailPanel } from '../GanttViewPanels'
import { TaskContextMenu } from '../GanttViewTaskContextMenu'
import type { Task } from '../GanttViewTypes'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-wave4',
    project_id: 'project-wave4',
    title: '主体结构施工',
    name: '主体结构施工',
    status: 'in_progress',
    priority: 'high',
    progress: 42,
    start_date: '2026-04-01',
    end_date: '2026-04-20',
    planned_start_date: '2026-04-01',
    planned_end_date: '2026-04-20',
    specialty_type: 'structure',
    version: 1,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('wave4 gantt interactions', () => {
  it('keeps the full task context menu action matrix wired', () => {
    const task = makeTask()
    const onClose = vi.fn()
    const onOpenEditDialog = vi.fn()
    const onOpenConditionDialog = vi.fn()
    const onOpenObstacleDialog = vi.fn()
    const onStartInlineTitleEdit = vi.fn()
    const onStatusChange = vi.fn()
    const onOpenEditChild = vi.fn()
    const onDeleteTaskFromContextMenu = vi.fn()
    const onMarkCriticalPathAttention = vi.fn()
    const onInsertBeforeChain = vi.fn()
    const onInsertAfterChain = vi.fn()
    const onRemoveCriticalPathOverride = vi.fn()

    render(
      <TaskContextMenu
        contextMenu={{ x: 120, y: 80, task }}
        onClose={onClose}
        onOpenEditDialog={onOpenEditDialog}
        onOpenConditionDialog={onOpenConditionDialog}
        onOpenObstacleDialog={onOpenObstacleDialog}
        onStartInlineTitleEdit={onStartInlineTitleEdit}
        onStatusChange={onStatusChange}
        onOpenEditChild={onOpenEditChild}
        onDeleteTaskFromContextMenu={onDeleteTaskFromContextMenu}
        onMarkCriticalPathAttention={onMarkCriticalPathAttention}
        onInsertBeforeChain={onInsertBeforeChain}
        onInsertAfterChain={onInsertAfterChain}
        onRemoveCriticalPathOverride={onRemoveCriticalPathOverride}
      />,
    )

    const clickableActions = [
      ['gantt-task-context-menu-edit', () => expect(onOpenEditDialog).toHaveBeenCalledWith(task)],
      ['gantt-task-context-menu-conditions', () => expect(onOpenConditionDialog).toHaveBeenCalledWith(task)],
      ['gantt-task-context-menu-obstacles', () => expect(onOpenObstacleDialog).toHaveBeenCalledWith(task)],
      ['gantt-task-context-menu-add-child', () => expect(onOpenEditChild).toHaveBeenCalledWith(task.id)],
      ['gantt-task-context-menu-rename', () => expect(onStartInlineTitleEdit).toHaveBeenCalledWith(task)],
      ['gantt-task-context-menu-mark-completed', () => expect(onStatusChange).toHaveBeenCalledWith(task.id, 'completed')],
      ['gantt-task-context-menu-mark-critical', () => expect(onMarkCriticalPathAttention).toHaveBeenCalledWith(task.id)],
      ['gantt-task-context-menu-insert-before', () => expect(onInsertBeforeChain).toHaveBeenCalledWith(task.id)],
      ['gantt-task-context-menu-insert-after', () => expect(onInsertAfterChain).toHaveBeenCalledWith(task.id)],
      ['gantt-task-context-menu-remove-critical', () => expect(onRemoveCriticalPathOverride).toHaveBeenCalledWith(task.id)],
      ['gantt-task-context-menu-delete', () => expect(onDeleteTaskFromContextMenu).toHaveBeenCalledWith(task)],
    ] as const

    for (const [testId, assertCalled] of clickableActions) {
      fireEvent.click(screen.getByTestId(testId))
      assertCalled()
    }

    expect(onClose).toHaveBeenCalledTimes(clickableActions.length)
  })

  it('hides mark-completed when the task is already completed', () => {
    render(
      <TaskContextMenu
        contextMenu={{ x: 120, y: 80, task: makeTask({ status: 'completed' }) }}
        onClose={vi.fn()}
        onOpenEditDialog={vi.fn()}
        onOpenConditionDialog={vi.fn()}
        onOpenObstacleDialog={vi.fn()}
        onStartInlineTitleEdit={vi.fn()}
        onStatusChange={vi.fn()}
        onOpenEditChild={vi.fn()}
        onDeleteTaskFromContextMenu={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('gantt-task-context-menu-mark-completed')).toBeNull()
  })

  it('keeps delay review buttons, critical delay notice and催办提示 wired in task detail panel', () => {
    const onApproveDelayRequest = vi.fn()
    const onRejectDelayRequest = vi.fn()
    const selectedTask = makeTask()
    const requestedAt = new Date(Date.now() - 4 * 86400000).toISOString()

    render(
      <TaskDetailPanel
        selectedTask={selectedTask}
        onClose={vi.fn()}
        getBusinessStatus={() => ({ label: '进行中', cls: 'bg-blue-50 text-blue-700' })}
        onEdit={vi.fn()}
        onOpenCondition={vi.fn()}
        onOpenObstacle={vi.fn()}
        criticalPathSummaryText="主关键路径"
        criticalPathError={null}
        selectedCriticalPathTask={{ isAutoCritical: true, floatDays: 0, durationDays: 5 }}
        onOpenCriticalPathDialog={vi.fn()}
        delayRequests={[
          {
            id: 'delay-pending-1',
            status: 'pending',
            delay_days: 4,
            original_date: '2026-04-20',
            delayed_date: '2026-04-24',
            reason: '关键材料到货延迟',
            requested_at: requestedAt,
          },
        ]}
        delayRequestsLoading={false}
        pendingDelayRequest={{
          id: 'delay-pending-1',
          status: 'pending',
          delay_days: 4,
          original_date: '2026-04-20',
          delayed_date: '2026-04-24',
          reason: '关键材料到货延迟',
          requested_at: requestedAt,
        }}
        rejectedDelayRequest={null}
        duplicateRejectedReason={false}
        baselineOptions={[{ id: 'baseline-1', version: 1, title: '首版基线' }]}
        baselineLoading={false}
        delayRequestForm={{ delayedDate: '2026-04-24', reason: '关键材料到货延迟', baselineVersionId: 'baseline-1' }}
        delayFormErrors={{}}
        delayRequestSubmitting={false}
        delayRequestWithdrawingId={null}
        delayRequestReviewingId={null}
        delayImpactDays={3}
        delayImpactSummary="预计会把项目总工期推迟 3 天。"
        onDelayRequestFormChange={vi.fn()}
        onSubmitDelayRequest={vi.fn()}
        onWithdrawDelayRequest={vi.fn()}
        onApproveDelayRequest={onApproveDelayRequest}
        onRejectDelayRequest={onRejectDelayRequest}
        canReviewDelayRequest
        onOpenChangeLogs={vi.fn()}
      />,
    )

    expect(screen.getByTestId('gantt-delay-request-approve')).toBeTruthy()
    expect(screen.getByTestId('gantt-delay-request-reject')).toBeTruthy()
    expect(screen.getByTestId('gantt-critical-delay-notice')).toBeTruthy()
    expect(screen.getByText(/当前任务位于关键路径/)).toBeTruthy()

    fireEvent.click(screen.getByTestId('gantt-delay-request-approve'))
    fireEvent.click(screen.getByTestId('gantt-delay-request-reject'))

    expect(onApproveDelayRequest).toHaveBeenCalledTimes(1)
    expect(onRejectDelayRequest).toHaveBeenCalledTimes(1)
  })
})
