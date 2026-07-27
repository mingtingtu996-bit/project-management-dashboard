import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Step1ProjectIdentityTime } from '@/components/project/wizard/Step1ProjectIdentityTime'
import type { WizardDraftPayload } from '@/components/project/wizard/types'

describe('Step1ProjectIdentityTime', () => {
  it('captures project scale facts in the identity step before scope modeling', () => {
    const onUpdate = vi.fn()
    const draft: WizardDraftPayload = {
      step: 1,
      mode: 'new',
      detailLevel: 'overview',
    }

    render(<Step1ProjectIdentityTime draft={draft} mode="new" onUpdate={onUpdate} />)

    fireEvent.change(screen.getByLabelText('总建筑面积 (m²)'), { target: { value: '180000' } })
    fireEvent.change(screen.getByLabelText('地上建筑面积 (m²)'), { target: { value: '135000' } })
    fireEvent.change(screen.getByLabelText('地下建筑面积 (m²)'), { target: { value: '45000' } })
    fireEvent.change(screen.getByLabelText('占地面积 (m²)'), { target: { value: '62000' } })

    expect(onUpdate).toHaveBeenCalledWith({ totalAreaM2: 180000 })
    expect(onUpdate).toHaveBeenCalledWith({ aboveGroundAreaM2: 135000 })
    expect(onUpdate).toHaveBeenCalledWith({ basementAreaM2: 45000 })
    expect(onUpdate).toHaveBeenCalledWith({ siteAreaM2: 62000 })
  })

  it('captures delivery caliber as three separate project identity facts', () => {
    const onUpdate = vi.fn()
    const draft: WizardDraftPayload = {
      step: 1,
      mode: 'new',
      detailLevel: 'overview',
    }

    render(<Step1ProjectIdentityTime draft={draft} mode="new" onUpdate={onUpdate} />)

    fireEvent.change(screen.getByLabelText('计划范围口径'), { target: { value: 'general_contract' } })
    fireEvent.change(screen.getByLabelText('交付标准'), { target: { value: 'full_fitout' } })
    fireEvent.change(screen.getByLabelText('终点事件'), { target: { value: 'owner_handover' } })

    expect(onUpdate).toHaveBeenCalledWith({ planScopeCaliber: 'general_contract' })
    expect(onUpdate).toHaveBeenCalledWith({ deliveryStandard: 'full_fitout' })
    expect(onUpdate).toHaveBeenCalledWith({ terminalEvent: 'owner_handover' })
  })
})
