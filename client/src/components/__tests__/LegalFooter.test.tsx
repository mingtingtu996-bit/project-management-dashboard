import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LegalFooter } from '../LegalFooter'

describe('LegalFooter', () => {
  it('links the issued ICP filing number to the MIIT filing portal', () => {
    render(<LegalFooter />)

    const filingLink = screen.getByRole('link', { name: '粤ICP备2026075705号-2' })
    expect(filingLink).toHaveAttribute('href', 'https://beian.miit.gov.cn/')
    expect(filingLink).toHaveAttribute('target', '_blank')
    expect(filingLink).toHaveAttribute('rel', 'noreferrer')
  })
})
