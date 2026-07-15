import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TaskListEmptyState } from '@/components/planning/TaskListEmptyState'

describe('TaskListEmptyState', () => {
  it('invokes the generate command without leaking the click event', () => {
    const onGenerateTasks = vi.fn()

    render(
      <TaskListEmptyState
        onAddFirstRow={vi.fn()}
        onGenerateTasks={onGenerateTasks}
      />,
    )

    fireEvent.click(screen.getByTestId('task-list-generate-tasks'))

    expect(onGenerateTasks).toHaveBeenCalledOnce()
    expect(onGenerateTasks).toHaveBeenCalledWith()
  })
})
