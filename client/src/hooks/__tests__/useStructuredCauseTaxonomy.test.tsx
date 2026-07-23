import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listCauseTaxonomy } from '@/services/causeAttributionApi'
import {
  resetStructuredCauseTaxonomyCacheForTests,
  useStructuredCauseTaxonomy,
} from '../useStructuredCauseTaxonomy'

vi.mock('@/services/causeAttributionApi', () => ({
  listCauseTaxonomy: vi.fn(),
}))

const mockedListCauseTaxonomy = vi.mocked(listCauseTaxonomy)
const taxonomyResponse = {
  version: 'v1.0.0',
  entries: [{
    code: 'server_code',
    label: 'Server code',
    category: 'test',
    linkedDeviationReasonTypes: [],
    priority: 1,
  }],
}

describe('useStructuredCauseTaxonomy', () => {
  beforeEach(() => {
    vi.useRealTimers()
    mockedListCauseTaxonomy.mockReset()
    resetStructuredCauseTaxonomyCacheForTests()
  })

  it('fails closed while the taxonomy request is loading', async () => {
    let resolveRequest: ((value: typeof taxonomyResponse) => void) | undefined
    mockedListCauseTaxonomy.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve
    }))

    const { result } = renderHook(() => useStructuredCauseTaxonomy())

    expect(result.current.status).toBe('loading')
    expect(result.current.entries).toEqual([])
    expect(result.current.resolveCode('server_code')).toBeUndefined()

    await act(async () => {
      resolveRequest?.(taxonomyResponse)
    })
  })

  it('fails closed for empty and failed taxonomy responses', async () => {
    mockedListCauseTaxonomy.mockResolvedValueOnce({ version: 'v1.0.0', entries: [] })
    const empty = renderHook(() => useStructuredCauseTaxonomy())

    await waitFor(() => expect(empty.result.current.status).toBe('empty'))
    expect(empty.result.current.entries).toEqual([])
    expect(empty.result.current.resolveCode('server_code')).toBeUndefined()
    empty.unmount()
    resetStructuredCauseTaxonomyCacheForTests()

    mockedListCauseTaxonomy.mockRejectedValueOnce(new Error('taxonomy unavailable'))
    const failed = renderHook(() => useStructuredCauseTaxonomy())

    await waitFor(() => expect(failed.result.current.status).toBe('error'))
    expect(failed.result.current.entries).toEqual([])
    expect(failed.result.current.resolveCode('server_code')).toBeUndefined()
  })

  it('shares one in-flight request and reuses the fresh response across consumers', async () => {
    mockedListCauseTaxonomy.mockResolvedValue(taxonomyResponse)

    const first = renderHook(() => useStructuredCauseTaxonomy())
    const second = renderHook(() => useStructuredCauseTaxonomy())

    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    await waitFor(() => expect(second.result.current.status).toBe('ready'))
    expect(mockedListCauseTaxonomy).toHaveBeenCalledTimes(1)

    const third = renderHook(() => useStructuredCauseTaxonomy())
    expect(third.result.current.status).toBe('ready')
    expect(third.result.current.resolveCode('server_code')?.label).toBe('Server code')
    expect(mockedListCauseTaxonomy).toHaveBeenCalledTimes(1)
  })

  it('clears entries and enters stale before refreshing an expired response', async () => {
    vi.useFakeTimers()
    mockedListCauseTaxonomy.mockResolvedValueOnce(taxonomyResponse)
    let resolveRefresh: ((value: typeof taxonomyResponse) => void) | undefined
    mockedListCauseTaxonomy.mockReturnValueOnce(new Promise((resolve) => {
      resolveRefresh = resolve
    }))

    const { result } = renderHook(() => useStructuredCauseTaxonomy())
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.status).toBe('ready')

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000)
    })

    expect(result.current.status).toBe('stale')
    expect(result.current.entries).toEqual([])
    expect(result.current.resolveCode('server_code')).toBeUndefined()
    expect(mockedListCauseTaxonomy).toHaveBeenCalledTimes(2)

    await act(async () => {
      resolveRefresh?.(taxonomyResponse)
    })
    expect(result.current.status).toBe('ready')
  })
})
