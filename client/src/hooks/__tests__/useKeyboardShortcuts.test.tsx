import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useKeyboardShortcuts } from '../useKeyboardShortcuts'

function TestHarness({ onTrigger }: { onTrigger: () => void }) {
  useKeyboardShortcuts(
    [
      {
        key: 'k',
        ctrlKey: true,
        action: onTrigger,
        description: '聚焦搜索',
      },
    ],
    true,
  )

  return null
}

describe('useKeyboardShortcuts', () => {
  const container = document.createElement('div')
  let root: Root | null = null

  beforeEach(() => {
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

  it('ignores malformed keydown events without crashing', async () => {
    const onTrigger = vi.fn()

    await act(async () => {
      root?.render(<TestHarness onTrigger={onTrigger} />)
    })

    const event = new Event('keydown') as KeyboardEvent
    Object.defineProperty(event, 'key', { value: undefined })

    expect(() => {
      window.dispatchEvent(event)
    }).not.toThrow()
    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('still handles valid shortcuts normally', async () => {
    const onTrigger = vi.fn()

    await act(async () => {
      root?.render(<TestHarness onTrigger={onTrigger} />)
    })

    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })

    act(() => {
      window.dispatchEvent(event)
    })

    expect(onTrigger).toHaveBeenCalledTimes(1)
  })
})
