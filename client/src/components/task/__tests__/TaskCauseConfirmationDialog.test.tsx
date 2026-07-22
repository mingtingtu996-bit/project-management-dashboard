import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TaskCauseConfirmationDialog } from '../TaskCauseConfirmationDialog'
import { confirmTaskCause, listCauseTaxonomy } from '@/services/causeAttributionApi'
import { toast } from '@/hooks/use-toast'

vi.mock('@/services/causeAttributionApi', () => ({
  confirmTaskCause: vi.fn(),
  listCauseTaxonomy: vi.fn(),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

const mockedConfirmTaskCause = vi.mocked(confirmTaskCause)
const mockedListCauseTaxonomy = vi.mocked(listCauseTaxonomy)
const task = { id: 'task-1', title: 'Concrete work', rawText: 'Material has not arrived' }

describe('TaskCauseConfirmationDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: ResizeObserverStub })
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    Object.assign(HTMLElement.prototype, {
      hasPointerCapture: () => false,
      setPointerCapture: () => undefined,
      releasePointerCapture: () => undefined,
      scrollIntoView: () => undefined,
    })
    mockedListCauseTaxonomy.mockResolvedValue({
      version: 'v1.0.0',
      entries: [{ code: 'material_shortage', label: 'Material shortage or late arrival', category: 'resource', linkedDeviationReasonTypes: [], priority: 90 }],
    })
    mockedConfirmTaskCause.mockResolvedValue({
      id: 'cause-1',
      subject_id: 'task-1',
      cause_code: 'material_shortage',
      status: 'confirmed',
    })
  })

  it('submits an editor confirmation with the original delay text and fixed task semantics', async () => {
    const user = userEvent.setup()
    const onConfirmed = vi.fn()
    render(
      <TaskCauseConfirmationDialog
        open
        projectId="project-1"
        task={task}
        onOpenChange={vi.fn()}
        onConfirmed={onConfirmed}
      />,
    )

    const submit = await screen.findByRole('button', { name: '确认原因' })
    expect(submit).toBeDisabled()
    expect(screen.getByLabelText('原始说明')).toHaveValue(task.rawText)

    await user.click(screen.getByLabelText('延误原因分类'))
    await user.click(await screen.findByRole('option', { name: 'Material shortage or late arrival' }))
    await user.click(submit)

    await waitFor(() => expect(mockedConfirmTaskCause).toHaveBeenCalledWith({
      projectId: 'project-1',
      taskId: 'task-1',
      causeCode: 'material_shortage',
      causeRole: 'primary',
      eventType: 'delay',
      rawText: task.rawText,
    }))
    expect(onConfirmed).toHaveBeenCalledWith(expect.objectContaining({ id: 'cause-1', status: 'confirmed' }))
  })

  it('keeps confirmation disabled and reports an error when taxonomy loading fails', async () => {
    mockedListCauseTaxonomy.mockRejectedValue(new Error('taxonomy unavailable'))

    render(
      <TaskCauseConfirmationDialog
        open
        projectId="project-1"
        task={task}
        onOpenChange={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('taxonomy unavailable')
    expect(screen.getByRole('button', { name: '确认原因' })).toBeDisabled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }))
  })
})
