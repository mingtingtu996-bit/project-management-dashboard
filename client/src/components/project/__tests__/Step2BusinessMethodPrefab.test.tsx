import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Step2BusinessMethodPrefab } from '@/components/project/wizard/Step2BusinessMethodPrefab'
import type { WizardDraftPayload } from '@/components/project/wizard/types'

describe('Step2BusinessMethodPrefab', () => {
  it('keeps prefab system choices in the business/method step using business labels', () => {
    const onUpdate = vi.fn()
    const draft: WizardDraftPayload = {
      step: 2,
      mode: 'new',
      businessType: 'general_civil',
      methodVariantCodes: ['precast_concrete'],
      prefabSystemCodes: [],
    }

    render(<Step2BusinessMethodPrefab draft={draft} onUpdate={onUpdate} />)

    expect(screen.getByRole('heading', { name: /业态、工法与装配体系/ })).toBeInTheDocument()
    expect(screen.queryByText(/施工组织/)).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: /装饰一体化预制外墙板/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /整体卫浴/ })).toBeInTheDocument()
    expect(screen.queryByText(/^PCF$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^IBU$/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /整体卫浴/ }))

    expect(onUpdate).toHaveBeenCalledWith({ prefabSystemCodes: ['integrated_bathroom'] })
  })

  it('offers foundation and pit method candidates in the business/method step', () => {
    const onUpdate = vi.fn()
    const draft: WizardDraftPayload = {
      step: 2,
      mode: 'new',
      businessType: 'general_civil',
      methodVariantCodes: ['cast_in_situ'],
      prefabSystemCodes: [],
    }

    const { rerender } = render(<Step2BusinessMethodPrefab draft={draft} onUpdate={onUpdate} />)

    expect(screen.getByRole('heading', { name: /基础形式与基坑方案/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /钻孔灌注桩/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /筏板基础/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /地下连续墙/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /钻孔灌注桩/ }))
    rerender(<Step2BusinessMethodPrefab
      draft={{
        ...draft,
        methodVariantCodes: ['cast_in_situ', 'bored_pile'],
        projectFeatures: { foundationFormCodes: ['bored_pile'] },
      }}
      onUpdate={onUpdate}
    />)
    fireEvent.click(screen.getByRole('button', { name: /地下连续墙/ }))

    expect(onUpdate).toHaveBeenNthCalledWith(1, {
      methodVariantCodes: ['cast_in_situ', 'bored_pile'],
      projectFeatures: {
        foundationFormCodes: ['bored_pile'],
      },
    })
    expect(onUpdate).toHaveBeenNthCalledWith(2, {
      methodVariantCodes: ['cast_in_situ', 'bored_pile', 'diaphragm_wall'],
      projectFeatures: {
        foundationFormCodes: ['bored_pile', 'diaphragm_wall'],
      },
    })
  })
})
