import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from '../button'

describe('Button', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
  })

  it('renders a native loading state and blocks clicks', () => {
    const onClick = vi.fn()

    act(() => {
      root?.render(<Button loading onClick={onClick}>保存</Button>)
    })

    const button = container.querySelector('button')
    expect(button).not.toBeNull()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    expect(container.querySelector('svg')).not.toBeNull()

    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('blocks asChild interactions when disabled', () => {
    const onClick = vi.fn()

    act(() => {
      root?.render(
        <Button asChild disabled>
          <a href="/demo" onClick={onClick}>
            打开
          </a>
        </Button>
      )
    })

    const link = container.querySelector('a')
    expect(link).not.toBeNull()
    expect(link).toHaveAttribute('aria-disabled', 'true')
    expect(link).toHaveAttribute('tabindex', '-1')

    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
