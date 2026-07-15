import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Step6Generation } from '@/components/project/wizard/Step6Generation'
import type { WizardDraftPayload } from '@/components/project/wizard/types'

const baseDraft: WizardDraftPayload = {
  step: 6,
  mode: 'new',
  detailLevel: 'standard',
  projectName: '示例项目',
}

describe('Step6Generation', () => {
  it('updates detail level and company template save fields before generation', () => {
    const onUpdate = vi.fn()
    const onGenerate = vi.fn()

    render(
      <Step6Generation
        draft={baseDraft}
        projectId="project-1"
        onUpdate={onUpdate}
        onGenerate={onGenerate}
      />,
    )

    const detailButtons = screen.getAllByRole('button').filter((button) => button.className.includes('text-left'))
    expect(detailButtons).toHaveLength(3)

    fireEvent.click(detailButtons[0])
    expect(onUpdate).toHaveBeenCalledWith({ detailLevel: 'overview' })

    fireEvent.click(screen.getByRole('checkbox'))
    expect(onUpdate).toHaveBeenCalledWith({ saveAsCompanyTemplate: true })

    fireEvent.click(screen.getByRole('button', { name: /生成任务/ }))
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })

  it('disables the generate button while generating', () => {
    render(
      <Step6Generation
        draft={baseDraft}
        projectId="project-1"
        onUpdate={vi.fn()}
        onGenerate={vi.fn()}
        generating
      />,
    )

    expect(screen.getByRole('button', { name: /正在生成/ })).toBeDisabled()
  })

  it('can hide the legacy generate button when profile confirmation owns generation', () => {
    render(
      <Step6Generation
        draft={baseDraft}
        projectId="project-1"
        onUpdate={vi.fn()}
        onGenerate={vi.fn()}
        hideGenerateButton
      />,
    )

    expect(screen.queryByRole('button', { name: /生成任务/ })).not.toBeInTheDocument()
  })
})
