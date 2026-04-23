import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validation.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import {
  createCriticalPathOverride,
  deleteCriticalPathOverride,
  getProjectCriticalPathSnapshot,
  listCriticalPathOverrides,
  recalculateProjectCriticalPath,
} from '../services/projectCriticalPathService.js'

const router = Router()
router.use(authenticate)

const projectIdParamSchema = z.object({
  id: z.string().trim().min(1),
})

const overrideIdParamSchema = projectIdParamSchema.extend({
  overrideId: z.string().trim().min(1),
})

const overrideBodySchema = z.object({
  task_id: z.string().trim().min(1),
  mode: z.enum(['manual_attention', 'manual_insert']),
  anchor_type: z.string().trim().optional().nullable(),
  left_task_id: z.string().trim().optional().nullable(),
  right_task_id: z.string().trim().optional().nullable(),
  reason: z.string().trim().optional().nullable(),
  created_by: z.string().trim().optional().nullable(),
}).passthrough()

router.get('/:id/critical-path', validate(projectIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const projectId = req.params.id
  logger.info('Fetching critical path snapshot', { projectId })

  const snapshot = await getProjectCriticalPathSnapshot(projectId)
  const response: ApiResponse<typeof snapshot> = {
    success: true,
    data: snapshot,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/:id/critical-path/refresh', validate(projectIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const projectId = req.params.id
  logger.info('Refreshing critical path snapshot', { projectId })

  const result = await recalculateProjectCriticalPath(projectId)
  const response: ApiResponse<typeof result.snapshot> = {
    success: true,
    data: result.snapshot,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/:id/critical-path/overrides', validate(projectIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const projectId = req.params.id
  logger.info('Listing critical path overrides', { projectId })

  const data = await listCriticalPathOverrides(projectId)
  const response: ApiResponse<typeof data> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/:id/critical-path/overrides', validate(projectIdParamSchema, 'params'), validate(overrideBodySchema), asyncHandler(async (req, res) => {
  const projectId = req.params.id
  logger.info('Creating critical path override', { projectId, body: req.body })

  const data = await createCriticalPathOverride(projectId, req.body)
  const response: ApiResponse<typeof data> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

router.delete('/:id/critical-path/overrides/:overrideId', validate(overrideIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const projectId = req.params.id
  const { overrideId } = req.params
  logger.info('Deleting critical path override', { projectId, overrideId })

  await deleteCriticalPathOverride(projectId, overrideId)
  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
