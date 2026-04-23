import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SkipLink } from '../SkipLink'

describe('SkipLink', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
  })

  it('moves focus to the target main area when activated', () => {
    const target = document.createElement('main')
    target.id = 'app-main'
    target.tabIndex = -1
    document.body.appendChild(target)

    act(() => {
      root?.render(<SkipLink targetId="app-main" />)
    })

    const link = container.querySelector('a')
    expect(link).not.toBeNull()
    expect(link).toHaveAttribute('href', '#app-main')
    expect(link).toHaveClass('skip-link')

    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(document.activeElement).toBe(target)

    target.remove()
  })
})
