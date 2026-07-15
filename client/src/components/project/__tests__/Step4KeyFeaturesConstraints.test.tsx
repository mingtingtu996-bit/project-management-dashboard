import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Step4KeyFeaturesConstraints } from '@/components/project/wizard/Step4KeyFeaturesConstraints'
import type { WizardDraftPayload } from '@/components/project/wizard/types'

describe('Step4KeyFeaturesConstraints', () => {
  it('captures project-level engineering dimension facts for generation algorithms', () => {
    const onUpdate = vi.fn()
    const draft: WizardDraftPayload = {
      step: 4,
      mode: 'new',
      businessType: 'general_civil',
      projectFeatures: {},
    }

    const { rerender } = render(<Step4KeyFeaturesConstraints draft={draft} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByLabelText('深基坑'))
    expect(onUpdate).toHaveBeenCalledWith({ projectFeatures: { deep_pit: 10 } })
    rerender(<Step4KeyFeaturesConstraints draft={{ ...draft, projectFeatures: { deep_pit: 10 } }} onUpdate={onUpdate} />)
    fireEvent.change(screen.getByLabelText('深基坑尺寸'), { target: { value: '11' } })
    expect(onUpdate).toHaveBeenLastCalledWith({ projectFeatures: { deep_pit: 11 } })

    fireEvent.click(screen.getByLabelText('高支模'))
    expect(onUpdate).toHaveBeenCalledWith({ projectFeatures: { deep_pit: 10, supportHeightM: 8 } })
  })

  it('exposes non-live foundation facts as flat wizard project features', () => {
    const onUpdate = vi.fn()
    const draft: WizardDraftPayload = {
      step: 4,
      mode: 'new',
      businessType: 'general_civil',
      projectFeatures: {},
    }

    const { rerender } = render(<Step4KeyFeaturesConstraints draft={draft} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByLabelText('深基坑'))
    expect(onUpdate).toHaveBeenCalledWith({ projectFeatures: { deep_pit: 10 } })
    rerender(<Step4KeyFeaturesConstraints draft={{ ...draft, projectFeatures: { deep_pit: 10 } }} onUpdate={onUpdate} />)

    fireEvent.change(screen.getByLabelText('深基坑尺寸'), { target: { value: '12' } })
    expect(onUpdate).toHaveBeenLastCalledWith({ projectFeatures: { deep_pit: 12 } })

    fireEvent.click(screen.getByLabelText('地下层数'))
    expect(onUpdate).toHaveBeenCalledWith({ projectFeatures: { deep_pit: 10, basementLevelCount: 2 } })
    fireEvent.click(screen.getByLabelText('地下面积'))
    expect(onUpdate).toHaveBeenCalledWith({ projectFeatures: { deep_pit: 10, basementAreaM2: 8000 } })
    fireEvent.click(screen.getByLabelText('桩基工程'))
    expect(onUpdate).toHaveBeenCalledWith({ projectFeatures: { deep_pit: 10, pile_foundation: true } })
    fireEvent.click(screen.getByLabelText('降排水'))
    expect(onUpdate).toHaveBeenCalledWith({ projectFeatures: { deep_pit: 10, foundation_dewatering: true } })
    fireEvent.click(screen.getByLabelText('基坑监测'))
    expect(onUpdate).toHaveBeenCalledWith({ projectFeatures: { deep_pit: 10, foundation_monitoring: true } })
  })

  it('shows the surgery-room quantity field when the surgery feature is selected', () => {
    const onUpdate = vi.fn()
    const draft: WizardDraftPayload = {
      step: 4,
      mode: 'new',
      projectFeatures: {},
    }

    const { rerender } = render(<Step4KeyFeaturesConstraints draft={draft} onUpdate={onUpdate} />)

    fireEvent.change(screen.getByPlaceholderText("找'手术'、'装配率'……"), { target: { value: '手术' } })
    fireEvent.click(screen.getByLabelText('手术部'))

    expect(onUpdate).toHaveBeenCalledWith({ projectFeatures: { has_or: 6 } })

    rerender(<Step4KeyFeaturesConstraints draft={{ ...draft, projectFeatures: { has_or: 6 } }} onUpdate={onUpdate} />)

    const quantityInput = screen.getByLabelText('手术部数量')
    expect(quantityInput).toHaveAttribute('placeholder', '6')
    expect(quantityInput).toHaveValue(6)

    fireEvent.change(quantityInput, { target: { value: '16' } })
    expect(onUpdate).toHaveBeenCalledWith({ projectFeatures: { has_or: 16 } })
  })

  it('filters special constraints by selected business type and method', () => {
    const onUpdate = vi.fn()

    render(
      <Step4KeyFeaturesConstraints
        draft={{
          step: 4,
          mode: 'new',
          businessType: 'general_civil',
          methodVariantCodes: ['precast_concrete'],
          projectFeatures: {},
        }}
        onUpdate={onUpdate}
      />,
    )

    expect(screen.queryByLabelText('装配率')).toBeInTheDocument()
    expect(screen.queryByLabelText('整体卫浴')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('集成厨房')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('手术部')).not.toBeInTheDocument()
    expect(screen.queryByText('数据中心 Tier 等级')).not.toBeInTheDocument()
  })

  it('keeps external hard constraints as backend-consumed feature facts', () => {
    const onUpdate = vi.fn()
    render(
      <Step4KeyFeaturesConstraints
        draft={{
          step: 4,
          mode: 'new',
          businessType: 'tod_upper_cover',
          projectFeatures: {},
        }}
        onUpdate={onUpdate}
      />,
    )

    fireEvent.click(screen.getByLabelText('运营接口 / 不停运施工'))

    expect(onUpdate).toHaveBeenCalledWith({
      projectFeatures: { non_stop_operation: true },
    })
  })

  it('suggests business features from scope tree while preserving user choices', () => {
    const onUpdate = vi.fn()

    render(
      <Step4KeyFeaturesConstraints
        draft={{
          step: 4,
          mode: 'new',
          businessType: 'hospital',
          scopeTree: [
            {
              type: 'building',
              label: '1#住院楼',
              children: [
                { type: 'functional_zone', label: '手术中心' },
                { type: 'functional_zone', label: 'ICU' },
              ],
            },
          ],
          projectFeatures: { has_or: 8 },
        }}
        onUpdate={onUpdate}
      />,
    )

    expect(onUpdate).toHaveBeenCalledWith({
      projectFeatures: expect.objectContaining({
        has_medical_gas: true,
        cleanroom_grade: 10000,
        has_or: 8,
      }),
    })
  })
})
