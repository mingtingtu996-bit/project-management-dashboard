import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DurationBasisBadge, type DurationBasis } from '@/components/planning/DurationBasisBadge'

describe('DurationBasisBadge', () => {
  it('renders the agreed duration basis labels', () => {
    const cases: Array<[DurationBasis, string]> = [
      ['plan', '计划'],
      ['reference', '参考'],
      ['production', '生产日'],
      ['forecast', '预测'],
      ['remaining', '剩余'],
    ]

    render(
      <div>
        {cases.map(([basis]) => <DurationBasisBadge key={basis} basis={basis} />)}
      </div>,
    )

    for (const [, label] of cases) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })
})
