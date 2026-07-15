import { Router } from 'express'

import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import type { ApiResponse } from '../types/index.js'
import {
  buildV14231ReadinessLedger,
  getV14231CapabilityReadiness,
  getV14231PageConsumptionReadiness,
} from '../services/v14231CapabilityReadinessService.js'
import { loadV14231ReadinessEvaluationContext } from '../services/v14231ReadinessGateRuntimeService.js'
import {
  buildV14231ActionableSurfaceLedger,
  getV14231ActionableSurface,
} from '../services/v14231ActionableSurfaceRegistryService.js'

const router = Router()
router.use(authenticate)

router.get('/', asyncHandler(async (_req, res) => {
  const context = loadV14231ReadinessEvaluationContext()
  const response: ApiResponse<ReturnType<typeof buildV14231ReadinessLedger>> = {
    success: true,
    data: buildV14231ReadinessLedger(context),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/capabilities/:nameOrKey', asyncHandler(async (req, res) => {
  const data = getV14231CapabilityReadiness(
    req.params.nameOrKey,
    loadV14231ReadinessEvaluationContext(),
  )
  const response: ApiResponse<typeof data> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/pages/:pageOrKey', asyncHandler(async (req, res) => {
  const data = getV14231PageConsumptionReadiness(
    req.params.pageOrKey,
    loadV14231ReadinessEvaluationContext(),
  )
  const response: ApiResponse<typeof data> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/actionable-surfaces', asyncHandler(async (_req, res) => {
  const response: ApiResponse<ReturnType<typeof buildV14231ActionableSurfaceLedger>> = {
    success: true,
    data: buildV14231ActionableSurfaceLedger(),
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/actionable-surfaces/:key', asyncHandler(async (req, res) => {
  const surface = getV14231ActionableSurface(req.params.key)
  const data = surface ?? {
    key: String(req.params.key ?? '').trim(),
    status: 'display-only' as const,
    defaultUnregisteredSurfaceStatus: 'display-only' as const,
    boundaryPolicy: {
      canUseAsStableAction: false,
      writesRuntimePublication: false,
      declaresProductionReady: false,
      requiresLiveEvidenceForUpgrade: true,
    },
    reason: 'unregistered actionable surface defaults to display-only and cannot be used as a stable action',
  }
  const response: ApiResponse<typeof data> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
