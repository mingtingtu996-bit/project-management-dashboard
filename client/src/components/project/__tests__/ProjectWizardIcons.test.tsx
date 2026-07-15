import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BUSINESS_TYPES, BusinessTypeCard } from '@/components/project/wizard/BusinessTypeCard'
import { ConstructionMethodCard } from '@/components/project/wizard/ConstructionMethodCard'
import { Step0EntryChoice } from '@/components/project/wizard/Step0EntryChoice'
import { Step3EngineeringScopeScale } from '@/components/project/wizard/Step3EngineeringScopeScale'
import { StepIndicator } from '@/components/project/wizard/StepIndicator'
import { StickyFooter } from '@/components/project/wizard/StickyFooter'
import { WizardDraftBadge } from '@/components/project/wizard/WizardDraftBadge'

describe('project wizard shared icons', () => {
  it('exposes four dedicated subtype choices for each specialty business type', () => {
    const expectedSubtypeCodes = {
      industrial: [
        'industrial_general',
        'industrial_logistics',
        'industrial_cleanroom',
        'industrial_heavy',
      ],
      transportation_hub: [
        'transport_multimodal',
        'transport_railway_station',
        'transport_metro_interchange',
        'transport_bus_terminal',
      ],
      sports_culture: [
        'sports_stadium',
        'sports_indoor_arena',
        'sports_theater',
        'sports_exhibition',
      ],
    }

    for (const [businessType, subtypeCodes] of Object.entries(expectedSubtypeCodes)) {
      const option = BUSINESS_TYPES.find(candidate => candidate.code === businessType)
      expect(option?.subtypes?.map(subtype => subtype.code)).toEqual(subtypeCodes)
    }

    const onSelectSubtype = vi.fn()
    const { rerender } = render(
      <BusinessTypeCard
        selectedType="transportation_hub"
        selectedSubtype={null}
        onSelectType={vi.fn()}
        onSelectSubtype={onSelectSubtype}
      />,
    )

    expect(screen.getAllByRole('button')).toHaveLength(BUSINESS_TYPES.length + 4)
    fireEvent.click(screen.getAllByRole('button').at(-1)!)
    expect(onSelectSubtype).toHaveBeenLastCalledWith('transport_bus_terminal')

    rerender(
      <BusinessTypeCard
        selectedType="sports_culture"
        selectedSubtype={null}
        onSelectType={vi.fn()}
        onSelectSubtype={onSelectSubtype}
      />,
    )
    fireEvent.click(screen.getAllByRole('button').at(-1)!)
    expect(onSelectSubtype).toHaveBeenLastCalledWith('sports_exhibition')

    rerender(
      <BusinessTypeCard
        selectedType="industrial"
        selectedSubtype={null}
        onSelectType={vi.fn()}
        onSelectSubtype={onSelectSubtype}
      />,
    )
    fireEvent.click(screen.getAllByRole('button').at(-1)!)
    expect(onSelectSubtype).toHaveBeenLastCalledWith('industrial_heavy')
  })

  it('uses the shared wizard icon registry across entry cards and step navigation', () => {
    render(
      <Step0EntryChoice
        onSelectBlank={vi.fn()}
        onSelectTemplate={vi.fn()}
        onSelectCopy={vi.fn()}
      />,
    )

    expect(screen.getByTestId('wizard-icon-entry-blank')).toBeInTheDocument()
    expect(screen.getByTestId('wizard-icon-entry-template')).toBeInTheDocument()
    expect(screen.getByTestId('wizard-icon-entry-copy')).toBeInTheDocument()

    render(
      <StepIndicator
        currentStep={3}
        totalSteps={6}
        mode="new"
        onStepClick={vi.fn()}
        onToggleFreeMode={vi.fn()}
        showFreeMode={false}
      />,
    )

    expect(screen.getByTestId('wizard-icon-wizard-step-scope')).toBeInTheDocument()
    expect(screen.getAllByTestId('wizard-icon-wizard-complete').length).toBeGreaterThan(0)
  })

  it('uses shared semantic icons across business choices, methods, scope intake, drafts, and generation actions', () => {
    render(
      <BusinessTypeCard
        selectedType="hospital"
        selectedSubtype={null}
        onSelectType={vi.fn()}
        onSelectSubtype={vi.fn()}
      />,
    )
    expect(screen.getByTestId('wizard-icon-hospital')).toBeInTheDocument()
    expect(screen.getAllByTestId('wizard-icon-wizard-complete').length).toBeGreaterThan(0)

    render(
      <ConstructionMethodCard
        businessType="general_civil"
        selectedMethods={['cast_in_situ']}
        onToggleMethod={vi.fn()}
      />,
    )
    expect(screen.getAllByTestId('wizard-icon-wizard-complete').length).toBeGreaterThan(0)

    render(
      <Step3EngineeringScopeScale
        draft={{ step: 3, mode: 'new', businessType: 'hospital', detailLevel: 'overview' }}
        onUpdate={vi.fn()}
      />,
    )
    expect(screen.getAllByTestId('wizard-icon-recommendation-draft').length).toBeGreaterThan(0)

    render(
      <Step3EngineeringScopeScale
        draft={{
          step: 3,
          mode: 'new',
          businessType: 'hospital',
          detailLevel: 'overview',
          scopeTree: [
            {
              id: 'building-open',
              type: 'building',
              name: '1#楼',
              parentId: null,
              children: [],
              expanded: true,
              metadata: {},
            },
            {
              id: 'basement-closed',
              type: 'basement',
              name: '地下室',
              parentId: null,
              children: [],
              expanded: true,
              metadata: { childrenComplete: true, basementLevelCount: 2 },
            },
          ],
        }}
        onUpdate={vi.fn()}
      />,
    )
    expect(screen.getAllByTestId('wizard-icon-add-scope').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('wizard-icon-configured').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('wizard-icon-pending').length).toBeGreaterThan(0)

    render(
      <WizardDraftBadge
        draftCount={1}
        drafts={[{ id: 'draft-1', name: '草稿项目', draftStep: 3, updatedAt: '刚刚' }]}
        onResume={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByTestId('wizard-icon-draft')).toBeInTheDocument()

    render(
      <StickyFooter
        currentStep={6}
        totalSteps={6}
        mode="new"
        onPrev={vi.fn()}
        onNext={vi.fn()}
        onSaveDraft={vi.fn()}
        onGenerate={vi.fn()}
        canGoNext
      />,
    )
    expect(screen.getByTestId('wizard-icon-generation')).toBeInTheDocument()
  })
})
