import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WizardDraftBadge } from '@/components/project/wizard/WizardDraftBadge'

describe('WizardDraftBadge', () => {
  it('opens drafts popover and supports resume/delete actions', () => {
    const onResume = vi.fn()
    const onDelete = vi.fn()

    render(
      <WizardDraftBadge
        draftCount={1}
        drafts={[{ id: 'draft-1', name: '草稿项目', draftStep: 3, updatedAt: '刚刚' }]}
        onResume={onResume}
        onDelete={onDelete}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /草稿/ }))
    expect(screen.getByText('草稿项目')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '恢复' }))
    expect(onResume).toHaveBeenCalledWith('draft-1')

    fireEvent.click(screen.getByRole('button', { name: /草稿/ }))
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(onDelete).toHaveBeenCalledWith('draft-1')
  })
})
