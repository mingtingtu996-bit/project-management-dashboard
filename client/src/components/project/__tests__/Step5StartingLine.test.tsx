import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Step5StartingLine } from '@/components/project/wizard/Step5StartingLine'
import { listMilestonePresets } from '@/components/project/wizard/projectWizardApi'
import type { WizardDraftPayload } from '@/components/project/wizard/types'

vi.mock('@/components/project/wizard/projectWizardApi', () => ({
  listMilestonePresets: vi.fn().mockResolvedValue([]),
}))

describe('Step5StartingLine', () => {
  it('uses buildings and floor counts from the wizard scope tree instead of hospital mock data', async () => {
    const onUpdate = vi.fn()
    const draft: WizardDraftPayload = {
      step: 5,
      mode: 'starting_line',
      businessType: 'general_civil',
      onboardingSubstage: 'main_structure',
      scopeTree: [
        {
          id: 'building-1',
          type: 'building',
          name: '1#住宅楼',
          metadata: { standardFloorCount: 26 },
          children: [],
        },
        {
          id: 'building-2',
          type: 'building',
          name: '2#商业裙房',
          metadata: {},
          children: [
            { id: 'floor-1', type: 'floor', name: 'L1', metadata: { floorOrder: 1 }, children: [] },
            { id: 'floor-2', type: 'floor', name: 'L2', metadata: { floorOrder: 2 }, children: [] },
          ],
        },
      ],
    }

    render(<Step5StartingLine draft={draft} onUpdate={onUpdate} />)

    expect(screen.getByRole('heading', { name: '起跑线接入' })).toBeInTheDocument()
    expect(screen.getByLabelText('1#住宅楼当前施工至')).toBeInTheDocument()
    expect(screen.getByLabelText('2#商业裙房当前施工至')).toBeInTheDocument()
    expect(screen.queryByText(/住院楼/)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('1#住宅楼当前施工至'), { target: { value: 'L26' } })
    expect(onUpdate).toHaveBeenCalledWith({
      onboardingPhaseProgress: expect.objectContaining({
        'building-1': expect.objectContaining({ floor: 'L26' }),
      }),
    })

    await waitFor(() => {
      expect(listMilestonePresets).toHaveBeenCalledWith({ businessType: 'general_civil', mainStage: 'main_structure' })
    })
  })

  it('shows an actionable empty state when no buildings are available for floor progress', () => {
    render(
      <Step5StartingLine
        draft={{
          step: 5,
          mode: 'starting_line',
          onboardingSubstage: 'main_structure',
          scopeTree: [],
        }}
        onUpdate={vi.fn()}
      />,
    )

    expect(screen.getByText(/请先在范围体量步骤补充单体/)).toBeInTheDocument()
  })
})
