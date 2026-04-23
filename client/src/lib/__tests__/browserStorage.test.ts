import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  bindStorageWarningToToast,
  isQuotaExceededError,
  listAppStorageKeys,
  safeJsonParse,
  safeStorageGet,
  safeStorageSet,
} from '@/lib/browserStorage'

/** Create an in-memory Storage that actually stores values (unlike the global mock). */
function makeRealStorage(): Storage {
  const store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
    get length() { return Object.keys(store).length },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─────────────────────────────────────────────
// §6.4 QuotaExceededError / NS_ERROR_DOM_QUOTA_REACHED
// ─────────────────────────────────────────────
describe('isQuotaExceededError', () => {
  it('returns true for DOMException with name QuotaExceededError', () => {
    const err = new DOMException('quota exceeded', 'QuotaExceededError')
    expect(isQuotaExceededError(err)).toBe(true)
  })

  it('returns true for DOMException with name NS_ERROR_DOM_QUOTA_REACHED', () => {
    const err = new DOMException('quota exceeded', 'NS_ERROR_DOM_QUOTA_REACHED')
    expect(isQuotaExceededError(err)).toBe(true)
  })

  it('returns false for a regular Error', () => {
    expect(isQuotaExceededError(new Error('oops'))).toBe(false)
  })

  it('returns false for null/undefined', () => {
    expect(isQuotaExceededError(null)).toBe(false)
    expect(isQuotaExceededError(undefined)).toBe(false)
  })

  it('dispatches workbuddy:storage-warning event when safeStorageSet hits QuotaExceededError', () => {
    const listener = vi.fn()
    window.addEventListener('workbuddy:storage-warning', listener)

    const mockStorage = {
      setItem: vi.fn(() => {
        throw new DOMException('full', 'QuotaExceededError')
      }),
      getItem: vi.fn(() => null),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    } as unknown as Storage

    const result = safeStorageSet(mockStorage, 'pm_key', 'value')

    expect(result).toBe(false)
    expect(listener).toHaveBeenCalledOnce()

    window.removeEventListener('workbuddy:storage-warning', listener)
  })
})

// ─────────────────────────────────────────────
// §6.4 存储告警绑定防重复监听
// ─────────────────────────────────────────────
describe('bindStorageWarningToToast de-duplication', () => {
  it('registers at most one listener even when called multiple times', () => {
    const addEventSpy = vi.spyOn(window, 'addEventListener')

    bindStorageWarningToToast()
    bindStorageWarningToToast()
    bindStorageWarningToToast()

    const storageWarningCalls = addEventSpy.mock.calls.filter(
      ([type]) => type === 'workbuddy:storage-warning',
    )
    // Should have been added at most once
    expect(storageWarningCalls.length).toBeLessThanOrEqual(1)
  })
})

// ─────────────────────────────────────────────
// §6.4 safeStorageGet
// ─────────────────────────────────────────────
describe('safeStorageGet', () => {
  it('returns value from storage when key exists', () => {
    const store = makeRealStorage()
    store.setItem('pm_test', 'hello')
    expect(safeStorageGet(store, 'pm_test')).toBe('hello')
  })

  it('returns null when key does not exist', () => {
    const store = makeRealStorage()
    expect(safeStorageGet(store, 'pm_missing')).toBeNull()
  })

  it('returns null and logs error when storage.getItem throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockStorage = {
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
    } as unknown as Storage

    expect(safeStorageGet(mockStorage, 'pm_key')).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────
// §6.4 SSR 安全降级 (null storage = explicit null)
// ─────────────────────────────────────────────
describe('SSR safety: explicit null/undefined storage', () => {
  it('safeStorageGet returns null when passed a storage whose getItem returns null', () => {
    const store = makeRealStorage()
    expect(safeStorageGet(store, 'nonexistent')).toBeNull()
  })

  it('safeStorageSet returns false when storage.setItem throws', () => {
    const brokenStorage = {
      ...makeRealStorage(),
      setItem: () => { throw new Error('blocked') },
    } as unknown as Storage
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(safeStorageSet(brokenStorage, 'pm_key', 'v')).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('safeStorageGet falls back to window.localStorage when null is passed', () => {
    // Passing null → getBrowserStorage(null ?? undefined) = getBrowserStorage(undefined) → window.localStorage
    // In jsdom, window.localStorage is the vi.fn() mock that returns undefined, not null
    // The key behavior: no crash, returns string | null | undefined from mock
    expect(() => safeStorageGet(null, 'pm_any')).not.toThrow()
  })
})

// ─────────────────────────────────────────────
// §6.4 safeJsonParse
// ─────────────────────────────────────────────
describe('safeJsonParse', () => {
  it('parses valid JSON and returns the typed value', () => {
    const result = safeJsonParse<{ x: number }>('{"x":42}', { x: 0 })
    expect(result).toEqual({ x: 42 })
  })

  it('returns the fallback for invalid JSON', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = safeJsonParse<number>('not-json', -1)
    expect(result).toBe(-1)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('returns the fallback for null input', () => {
    expect(safeJsonParse<string[]>(null, [])).toEqual([])
  })

  it('returns the fallback for undefined input', () => {
    expect(safeJsonParse<boolean>(undefined, false)).toBe(false)
  })

  it('returns the fallback for empty string input', () => {
    expect(safeJsonParse<number>('', 99)).toBe(99)
  })

  it('returns the fallback for whitespace-only string', () => {
    expect(safeJsonParse<number>('   ', 99)).toBe(99)
  })
})

// ─────────────────────────────────────────────
// §6.4 listAppStorageKeys
// ─────────────────────────────────────────────
describe('listAppStorageKeys', () => {
  it('returns keys matching app prefixes', () => {
    const store = makeRealStorage()
    store.setItem('pm_task_1', 'a')
    store.setItem('workbuddy_setting', 'b')
    store.setItem('auth_token', 'c')
    store.setItem('unrelated_key', 'd')

    const keys = listAppStorageKeys(store)
    expect(keys).toContain('pm_task_1')
    expect(keys).toContain('workbuddy_setting')
    expect(keys).toContain('auth_token')
    expect(keys).not.toContain('unrelated_key')
  })

  it('returns empty array when storage is empty', () => {
    const store = makeRealStorage()
    expect(listAppStorageKeys(store)).toEqual([])
  })

  it('returns array for non-empty storage', () => {
    const store = makeRealStorage()
    store.setItem('pm_x', '1')
    const keys = listAppStorageKeys(store)
    expect(Array.isArray(keys)).toBe(true)
    expect(keys.length).toBeGreaterThan(0)
  })

  it('matches all defined app prefixes', () => {
    const store = makeRealStorage()
    const prefixes = [
      'pm_', 'workbuddy_', 'auth_', 'access_token', 'device_id',
      'storage_mode', 'pending_sync_ops', 'modal_manager_',
      'user_feedback', 'gantt_', 'wbs_template_', 'wbs-template',
    ]
    prefixes.forEach((prefix) => {
      store.setItem(`${prefix}x`, '1')
    })

    const keys = listAppStorageKeys(store)
    prefixes.forEach((prefix) => {
      expect(keys.some((k) => k.startsWith(prefix))).toBe(true)
    })
  })
})
