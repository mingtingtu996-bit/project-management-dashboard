import type { Request, RequestHandler, Response } from 'express'

import { normalizePublicHttpsOrigin } from '../auth/config.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

type RequestOriginGuardOptions = {
  enforce: boolean
  expectedOrigin: string
}

function originOf(value: string | undefined): string | null {
  if (!value || value === 'null') return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function isCookieFreeBearerRequest(req: Request): boolean {
  return /^Bearer\s+\S+$/u.test(req.get('authorization') ?? '') && !req.get('cookie')
}

function reject(res: Response) {
  return res.status(403).json({
    success: false,
    error: {
      code: 'CROSS_ENVIRONMENT_ORIGIN_FORBIDDEN',
      message: 'The request origin does not match this deployment environment',
    },
    timestamp: new Date().toISOString(),
  })
}

export function createRequestOriginGuard(options: RequestOriginGuardOptions): RequestHandler {
  if (!options.enforce) return (_req, _res, next) => next()
  const expectedOrigin = normalizePublicHttpsOrigin(options.expectedOrigin)

  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method) || !req.path.startsWith('/api/')) return next()

    const originHeader = req.get('origin')
    const refererHeader = req.get('referer')
    if (!originHeader && !refererHeader && isCookieFreeBearerRequest(req)) return next()

    const suppliedOrigins = [originHeader, refererHeader]
      .filter((value): value is string => Boolean(value))
      .map(originOf)
    if (suppliedOrigins.length === 0 || suppliedOrigins.some((origin) => origin !== expectedOrigin)) {
      return reject(res)
    }
    return next()
  }
}
