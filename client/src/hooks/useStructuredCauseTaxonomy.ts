import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  StructuredCauseTaxonomyEntry,
  StructuredCauseTaxonomyResponse,
} from '@/domain/structuredCauseTaxonomy'
import { listCauseTaxonomy } from '@/services/causeAttributionApi'

export type StructuredCauseTaxonomyStatus = 'loading' | 'ready' | 'empty' | 'stale' | 'error'

type TaxonomySnapshot = {
  status: StructuredCauseTaxonomyStatus
  version: string | null
  entries: StructuredCauseTaxonomyEntry[]
  error: string | null
}

const EMPTY_ENTRIES: StructuredCauseTaxonomyEntry[] = []
const CACHE_TTL_MS = 5 * 60 * 1000
const INITIAL_SNAPSHOT: TaxonomySnapshot = {
  status: 'loading',
  version: null,
  entries: EMPTY_ENTRIES,
  error: null,
}

type TaxonomyCacheEntry = {
  snapshot: TaxonomySnapshot
  fetchedAt: number
}

let taxonomyCache: TaxonomyCacheEntry | null = null
let taxonomyRequest: Promise<TaxonomyCacheEntry> | null = null
let cacheGeneration = 0

export function resetStructuredCauseTaxonomyCacheForTests() {
  cacheGeneration += 1
  taxonomyCache = null
  taxonomyRequest = null
}

function isTaxonomyEntry(value: unknown): value is StructuredCauseTaxonomyEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<StructuredCauseTaxonomyEntry>
  return typeof entry.code === 'string' && entry.code.trim().length > 0
    && typeof entry.label === 'string' && entry.label.trim().length > 0
}

function normalizeResponse(response: StructuredCauseTaxonomyResponse): TaxonomySnapshot {
  const entries = Array.isArray(response?.entries)
    ? response.entries.filter(isTaxonomyEntry)
    : EMPTY_ENTRIES
  return {
    status: entries.length > 0 ? 'ready' : 'empty',
    version: typeof response?.version === 'string' ? response.version : null,
    entries: entries.length > 0 ? entries : EMPTY_ENTRIES,
    error: null,
  }
}

function staleSnapshot(snapshot: TaxonomySnapshot): TaxonomySnapshot {
  return {
    status: 'stale',
    version: snapshot.version,
    entries: EMPTY_ENTRIES,
    error: null,
  }
}

function isFresh(entry: TaxonomyCacheEntry) {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS
}

function initialSnapshot() {
  if (!taxonomyCache) return INITIAL_SNAPSHOT
  return isFresh(taxonomyCache) ? taxonomyCache.snapshot : staleSnapshot(taxonomyCache.snapshot)
}

function requestTaxonomy() {
  if (taxonomyRequest) return taxonomyRequest

  const requestGeneration = cacheGeneration
  const request = listCauseTaxonomy().then((response) => {
    const entry = { snapshot: normalizeResponse(response), fetchedAt: Date.now() }
    if (requestGeneration === cacheGeneration) taxonomyCache = entry
    return entry
  })
  taxonomyRequest = request
  void request.then(
    () => { if (taxonomyRequest === request) taxonomyRequest = null },
    () => { if (taxonomyRequest === request) taxonomyRequest = null },
  )
  return request
}

export function useStructuredCauseTaxonomy() {
  const [snapshot, setSnapshot] = useState<TaxonomySnapshot>(initialSnapshot)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(async (forceRefresh = false) => {
    const cached = taxonomyCache
    if (!forceRefresh && cached && isFresh(cached)) {
      if (mountedRef.current) setSnapshot(cached.snapshot)
      return cached.snapshot
    }

    if (mountedRef.current) {
      setSnapshot(cached ? staleSnapshot(cached.snapshot) : INITIAL_SNAPSHOT)
    }
    try {
      const entry = await requestTaxonomy()
      if (mountedRef.current) setSnapshot(entry.snapshot)
      return entry.snapshot
    } catch (error) {
      if (mountedRef.current) {
        setSnapshot({
          status: 'error',
          version: null,
          entries: EMPTY_ENTRIES,
          error: error instanceof Error ? error.message : 'Failed to load structured cause taxonomy',
        })
      }
      return null
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (snapshot.status !== 'ready' && snapshot.status !== 'empty') return
    const cached = taxonomyCache
    if (!cached) return
    const remainingTtl = Math.max(0, cached.fetchedAt + CACHE_TTL_MS - Date.now())
    const timer = window.setTimeout(() => {
      if (!mountedRef.current) return
      if (taxonomyCache !== cached && taxonomyCache) {
        setSnapshot(taxonomyCache.snapshot)
        return
      }
      setSnapshot(staleSnapshot(cached.snapshot))
      void load(true)
    }, remainingTtl)
    return () => window.clearTimeout(timer)
  }, [load, snapshot.status, snapshot.version])

  const resolveCode = useCallback((code: string | null | undefined) => {
    if (snapshot.status !== 'ready' || !code) return undefined
    return snapshot.entries.find((entry) => entry.code === code)
  }, [snapshot.entries, snapshot.status])

  const refresh = useCallback(() => load(true), [load])

  return {
    ...snapshot,
    refresh,
    resolveCode,
  }
}
