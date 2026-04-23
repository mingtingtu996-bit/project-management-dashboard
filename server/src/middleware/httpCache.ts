import type { NextFunction, Request, Response } from 'express'

const READ_ONLY_CACHE_CONTROL = 'private, max-age=30, stale-while-revalidate=30'
const CACHE_BYPASS_PREFIXES = ['/api/auth', '/api/health', '/api/jobs', '/api/client-errors']
const CACHEABLE_TAIL_SEGMENTS = new Set([
  'board',
  'catalog',
  'dashboard',
  'governance',
  'health-score',
  'ledger',
  'notifications',
  'planning-governance',
  'reports',
  'summary',
])

function isResourceIdSegment(segment: string | undefined) {
  if (!segment) return false
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment) || /^\d+$/.test(segment)
}

export function shouldApplyReadCache(pathname: string) {
  if (!pathname.startsWith('/api/')) return false

  if (CACHE_BYPASS_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return false
  }

  const segments = pathname.split('/').filter(Boolean)
  const tail = segments.at(-1)

  if (segments.length <= 2) {
    return true
  }

  if (tail && CACHEABLE_TAIL_SEGMENTS.has(tail)) {
    return true
  }

  return !segments.slice(1).some((segment) => isResourceIdSegment(segment))
}

export function readOnlyCacheMiddleware(req: Request, res: Response, next: NextFunction) {
  if ((req.method === 'GET' || req.method === 'HEAD') && shouldApplyReadCache(req.path)) {
    res.vary('Authorization')
    res.vary('Cookie')
    res.vary('Accept-Encoding')

    if (!res.getHeader('Cache-Control')) {
      res.setHeader('Cache-Control', READ_ONLY_CACHE_CONTROL)
    }
  }

  next()
}

export const READ_ONLY_CACHE_HEADER = READ_ONLY_CACHE_CONTROL
