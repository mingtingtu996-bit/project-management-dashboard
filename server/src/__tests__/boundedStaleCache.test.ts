import { describe, expect, it } from 'vitest'

import { BoundedStaleCache } from '../services/boundedStaleCache.js'

describe('BoundedStaleCache', () => {
  it('deletes entries after the stale window rather than retaining expired values', () => {
    const cache = new BoundedStaleCache<string>(3)
    cache.set('a', 'value-a', { freshTtlMs: 10, staleTtlMs: 20 }, 100)

    expect(cache.getFresh('a', 105)).toBe('value-a')
    expect(cache.getFresh('a', 115)).toBeNull()
    expect(cache.getStale('a', 115)).toBe('value-a')
    expect(cache.getStale('a', 131)).toBeNull()
    expect(cache.size).toBe(0)
  })

  it('evicts the least recently used entry before exceeding its hard limit', () => {
    const cache = new BoundedStaleCache<string>(2)
    const ttl = { freshTtlMs: 100, staleTtlMs: 100 }
    cache.set('a', 'value-a', ttl, 0)
    cache.set('b', 'value-b', ttl, 1)
    expect(cache.getFresh('a', 2)).toBe('value-a')

    cache.set('c', 'value-c', ttl, 3)

    expect(cache.size).toBe(2)
    expect(cache.getFresh('b', 4)).toBeNull()
    expect(cache.getFresh('a', 4)).toBe('value-a')
    expect(cache.getFresh('c', 4)).toBe('value-c')
  })
})
