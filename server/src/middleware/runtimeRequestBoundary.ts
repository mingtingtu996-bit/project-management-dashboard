import type { RequestHandler } from 'express'

import { createRequestOriginGuard } from './requestOriginGuard.js'
import { shouldRejectInsecureProductionRequest } from '../services/httpsRuntimeBoundary.js'

type RuntimeRequestBoundaryOptions = {
  nodeEnv?: string
  expectedOrigin: string
}

export function createRuntimeRequestBoundary(options: RuntimeRequestBoundaryOptions): RequestHandler {
  const originGuard = createRequestOriginGuard({
    enforce: options.nodeEnv === 'production',
    expectedOrigin: options.expectedOrigin,
  })

  return (req, res, next) => {
    if (shouldRejectInsecureProductionRequest({
      nodeEnv: options.nodeEnv,
      path: req.originalUrl || req.path,
      secure: req.secure,
      forwardedProto: req.get('x-forwarded-proto'),
    })) {
      return res.status(426).json({
        success: false,
        error: {
          code: 'HTTPS_REQUIRED',
          message: 'Production API requests must use the trusted HTTPS entry point',
        },
        timestamp: new Date().toISOString(),
      })
    }
    return originGuard(req, res, next)
  }
}
