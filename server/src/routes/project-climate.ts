import { Router } from 'express'
import { z } from 'zod'

import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate } from '../middleware/validation.js'
import type { ApiResponse } from '../types/index.js'
import {
  getOfficialWeatherProviderStatus,
  rebuildProjectClimateProfile,
  recordProjectLocationObservation,
  recordProjectLocationObservationFromBrowserCoordinates,
  resolveProjectClimateProfile,
  syncProjectWeatherForecast,
} from '../services/projectClimateProfileService.js'

const router = Router({ mergeParams: true })
router.use(authenticate)

const projectIdParamSchema = z.object({
  projectId: z.string().trim().min(1),
})

const observationSchema = z.object({
  province: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  adminCode: z.string().trim().optional().nullable(),
  source: z.enum(['browser_geolocation', 'ip_location', 'project_location', 'system_inference']).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  rawSourceSnapshot: z.record(z.unknown()).optional(),
})

const browserLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().optional().nullable(),
})

function success<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
}

function createRequestAbortSignal(req: any, res: any) {
  const controller = new AbortController()
  const abort = () => controller.abort(new Error('Climate request client disconnected'))
  if (req.aborted) abort()
  else req.once('aborted', abort)
  res.once('close', () => {
    if (!res.writableEnded) abort()
  })
  return controller.signal
}

router.get(
  '/:projectId/climate/profile',
  validate(projectIdParamSchema, 'params'),
  requireProjectMember((req) => req.params.projectId),
  asyncHandler(async (req: any, res) => {
    res.json(success(await resolveProjectClimateProfile(req.params.projectId)))
  }),
)

router.get(
  '/:projectId/climate/weather-provider/status',
  validate(projectIdParamSchema, 'params'),
  requireProjectMember((req) => req.params.projectId),
  asyncHandler(async (req: any, res) => {
    const profile = await resolveProjectClimateProfile(req.params.projectId)
    res.json(success(getOfficialWeatherProviderStatus(profile)))
  }),
)

router.post(
  '/:projectId/climate/observations',
  validate(projectIdParamSchema, 'params'),
  validate(observationSchema),
  requireProjectEditor((req) => req.params.projectId),
  asyncHandler(async (req: any, res) => {
    const result = await recordProjectLocationObservation({
      projectId: req.params.projectId,
      observedByUserId: req.user?.id ?? null,
      province: req.body.province ?? null,
      city: req.body.city ?? null,
      adminCode: req.body.adminCode ?? null,
      source: req.body.source ?? 'browser_geolocation',
      confidence: req.body.confidence ?? undefined,
      rawSourceSnapshot: req.body.rawSourceSnapshot ?? {},
    })
    res.status(201).json(success(result))
  }),
)

router.post(
  '/:projectId/climate/browser-location',
  validate(projectIdParamSchema, 'params'),
  validate(browserLocationSchema),
  requireProjectEditor((req) => req.params.projectId),
  asyncHandler(async (req: any, res) => {
    const signal = createRequestAbortSignal(req, res)
    const result = await recordProjectLocationObservationFromBrowserCoordinates({
      projectId: req.params.projectId,
      observedByUserId: req.user?.id ?? null,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      accuracyMeters: req.body.accuracyMeters ?? null,
      signal,
    })
    res.status(result.status === 'recorded' ? 201 : 200).json(success(result))
  }),
)

router.post(
  '/:projectId/climate/refresh',
  validate(projectIdParamSchema, 'params'),
  requireProjectEditor((req) => req.params.projectId),
  asyncHandler(async (req: any, res) => {
    const signal = createRequestAbortSignal(req, res)
    const profile = await rebuildProjectClimateProfile(req.params.projectId)
    const weather = await syncProjectWeatherForecast(req.params.projectId, { signal })
    res.json(success({ profile, weather }))
  }),
)

export default router
