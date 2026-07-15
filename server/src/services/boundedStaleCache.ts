type CacheEntry<T> = {
  value: T
  expiresAt: number
  staleUntil: number
}

export class BoundedStaleCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>()

  private readonly maxEntries: number

  constructor(maxEntries: number) {
    this.maxEntries = Number.isFinite(maxEntries) && maxEntries > 0
      ? Math.floor(maxEntries)
      : 1
  }

  get size() {
    return this.entries.size
  }

  clear() {
    this.entries.clear()
  }

  private read(key: string, now: number) {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (entry.staleUntil <= now) {
      this.entries.delete(key)
      return null
    }

    // Map insertion order is the LRU order. Touch reads that can still be used.
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry
  }

  getFresh(key: string, now = Date.now()) {
    const entry = this.read(key, now)
    return entry && entry.expiresAt > now ? entry.value : null
  }

  getStale(key: string, now = Date.now()) {
    return this.read(key, now)?.value ?? null
  }

  set(
    key: string,
    value: T,
    ttl: { freshTtlMs: number; staleTtlMs: number },
    now = Date.now(),
  ) {
    for (const [entryKey, entry] of this.entries) {
      if (entry.staleUntil <= now) this.entries.delete(entryKey)
    }

    this.entries.delete(key)
    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value
      if (oldestKey === undefined) break
      this.entries.delete(oldestKey)
    }

    this.entries.set(key, {
      value,
      expiresAt: now + ttl.freshTtlMs,
      staleUntil: now + ttl.freshTtlMs + ttl.staleTtlMs,
    })
  }
}
