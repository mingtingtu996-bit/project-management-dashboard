import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useTabPersist } from '../useTabPersist'

describe('useTabPersist', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('returns the defaultTab when no persisted value exists', () => {
    const { result } = renderHook(() => useTabPersist('test-page', 'all'))
    expect(result.current[0]).toBe('all')
  })

  it('restores the persisted tab on mount', () => {
    sessionStorage.setItem('tab_persist_test-page', 'settings')
    const { result } = renderHook(() => useTabPersist('test-page', 'all'))
    expect(result.current[0]).toBe('settings')
  })

  it('updates the active tab and persists the new value', () => {
    const { result } = renderHook(() => useTabPersist('page-a', 'tab1'))

    act(() => {
      result.current[1]('tab2')
    })

    expect(result.current[0]).toBe('tab2')
    expect(sessionStorage.getItem('tab_persist_page-a')).toBe('tab2')
  })

  it('uses separate keys for different storageKeys', () => {
    const { result: hookA } = renderHook(() => useTabPersist('page-a', 'default'))
    const { result: hookB } = renderHook(() => useTabPersist('page-b', 'default'))

    act(() => {
      hookA.current[1]('tabX')
    })

    expect(hookA.current[0]).toBe('tabX')
    expect(hookB.current[0]).toBe('default')
  })

  it('falls back to defaultTab when sessionStorage is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new Error('blocked')
      },
      configurable: true,
    })

    const { result } = renderHook(() => useTabPersist('page-c', 'fallback'))
    expect(result.current[0]).toBe('fallback')

    if (original) {
      Object.defineProperty(window, 'sessionStorage', original)
    }
  })
})
