import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Card, CardDescription } from '../card'

describe('Card UI contract', () => {
  it('renders CardDescription content', () => {
    render(<CardDescription>说明内容</CardDescription>)

    expect(screen.getByText('说明内容')).toBeInTheDocument()
  })

  it('uses elevation tokens and metric left rail', () => {
    const { container } = render(<Card variant="metric">指标</Card>)
    const card = container.firstElementChild

    expect(card?.className).toContain('shadow-[var(--el-1)]')
    expect(card?.className).toContain('hover:shadow-[var(--el-2)]')
    expect(card?.className).toContain('border-l-blue-500')
  })
})
