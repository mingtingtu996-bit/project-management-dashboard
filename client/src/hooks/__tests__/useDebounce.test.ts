import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDebounce } from '../useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the previous value until the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'alpha' },
    })

    rerender({ value: 'beta' })
    expect(result.current).toBe('alpha')

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe('alpha')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('beta')
  })

  it('cancels the previous timer when the value changes again', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'alpha' },
    })

    rerender({ value: 'beta' })
    act(() => {
      vi.advanceTimersByTime(200)
    })

    rerender({ value: 'gamma' })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe('alpha')

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe('gamma')
  })
})
