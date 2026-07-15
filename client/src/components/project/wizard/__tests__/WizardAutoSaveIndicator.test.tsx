import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WizardAutoSaveIndicator } from '../WizardAutoSaveIndicator'

const mocks = vi.hoisted(() => ({
  saveWizardProjectDraft: vi.fn().mockResolvedValue({
    id: 'project-1',
    lastSaved: '2026-06-01T00:00:00.000Z',
    step: 1,
  }),
}))

vi.mock('../projectWizardApi', () => ({
  saveWizardProjectDraft: mocks.saveWizardProjectDraft,
}))

describe('WizardAutoSaveIndicator', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('does not patch the server when autosave is disabled for an active project workbench', async () => {
    vi.useFakeTimers()

    render(
      <WizardAutoSaveIndicator
        disabled
        draft={{ step: 1, mode: 'new', detailLevel: 'overview', projectName: 'Active project modeling' }}
        projectId="active-project-1"
      />,
    )

    await act(async () => {
      vi.advanceTimersByTime(2500)
    })

    expect(mocks.saveWizardProjectDraft).not.toHaveBeenCalled()
  })
})
