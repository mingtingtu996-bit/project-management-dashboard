import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { usePlanningKeyboard } from '../usePlanningKeyboard'

describe('usePlanningKeyboard', () => {
  it('initializes with open=false by default', () => {
    const { result } = renderHook(() => usePlanningKeyboard())
    expect(result.current.open).toBe(false)
  })

  it('initializes with a custom initial value', () => {
    const { result } = renderHook(() => usePlanningKeyboard(true))
    expect(result.current.open).toBe(true)
  })

  it('setOpen toggles the open state', () => {
    const { result } = renderHook(() => usePlanningKeyboard())

    act(() => {
      result.current.setOpen(true)
    })
    expect(result.current.open).toBe(true)

    act(() => {
      result.current.setOpen(false)
    })
    expect(result.current.open).toBe(false)
  })

  it('setOpen accepts a function updater', () => {
    const { result } = renderHook(() => usePlanningKeyboard(false))

    act(() => {
      result.current.setOpen((prev) => !prev)
    })
    expect(result.current.open).toBe(true)
  })
})
