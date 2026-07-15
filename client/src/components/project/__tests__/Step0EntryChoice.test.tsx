import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Step0EntryChoice } from '@/components/project/wizard/Step0EntryChoice'

describe('Step0EntryChoice', () => {
  it('calls the selected entry handler for blank, company template, and copied project starts', () => {
    const onSelectBlank = vi.fn()
    const onSelectTemplate = vi.fn()
    const onSelectCopy = vi.fn()

    render(
      <Step0EntryChoice
        onSelectBlank={onSelectBlank}
        onSelectTemplate={onSelectTemplate}
        onSelectCopy={onSelectCopy}
      />,
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)

    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])
    fireEvent.click(buttons[2])

    expect(onSelectBlank).toHaveBeenCalledTimes(1)
    expect(onSelectTemplate).toHaveBeenCalledTimes(1)
    expect(onSelectCopy).toHaveBeenCalledTimes(1)
  })
})
