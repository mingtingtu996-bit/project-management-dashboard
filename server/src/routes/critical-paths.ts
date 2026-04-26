import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor } from '../middleware/auth.js'
import { validate } from '../middleware/validation.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import {
  createCriticalPathOverride,
  deleteCriticalPathOverride,
  getProjectCriticalPathSnapshot,
  listCriticalPathOverrides,
  recalculateProjectCriticalPath,
  updateCriticalPathOverride,
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
  anchor_type: z.enum(['before', 'after', 'between']).optional().nullable(),
  left_task_id: z.string().trim().optional().nullable(),
  right_task_id: z.string().trim().optional().nullable(),
  reason: z.string().trim().optional().nullable(),
  created_by: z.string().trim().optional().nullable(),
}).passthrough().refine(
  (data) => {
    // manual_insert 模式下 anchor_type 必填
    if (data.mode === 'manual_insert' && !data.anchor_type) {
      return false
    }
    // anchor_type='after' 时 left_task_id 必填
    if (data.anchor_type === 'after' && !data.left_task_id) {
      return false
    }
    // anchor_type='before' 时 right_task_id 必填
    if (data.anchor_type === 'before' && !data.right_task_id) {
      return false
    }
    // anchor_type='between' 时 left_task_id 和 right_task_id 均必填
    if (data.anchor_type === 'between' && (!data.left_task_id || !data.right_task_id)) {
      return false
    }
    return true
  },
  {
    message: 'Invalid anchor configuration: manual_insert requires anchor_type; after requires left_task_id; before requires right_task_id; between requires both',
  }
)

const overrideUpdateBodySchema = z.object({
  anchor_type: z.enum(['before', 'after', 'between']).optional().nullable(),
  left_task_id: z.string().trim().optional().nullable(),
  right_task_id: z.string().trim().optional().nullable(),
  reason: z.string().trim().optional().nullable(),
}).refine(
  (data) => {
    if (data.anchor_type === 'after' && !data.left_task_id) {
      return false
    }
    if (data.anchor_type === 'before' && !data.right_task_id) {
      return false
    }
    if (data.anchor_type === 'between' && (!data.left_task_id || !data.right_task_id)) {
      return false
    }
    return true
  },
  {
    message: 'Invalid anchor configuration: after requires left_task_id; before requires right_task_id; between requires both',
  },
)

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

router.post(
  '/:id/critical-path/overrides',
  validate(projectIdParamSchema, 'params'),
  validate(overrideBodySchema),
  requireProjectEditor(async (req) => req.params.id),
  asyncHandler(async (req, res) => {
  const projectId = req.params.id
  logger.info('Creating critical path override', { projectId, body: req.body })

  const data = await createCriticalPathOverride(projectId, req.body)
  await recalculateProjectCriticalPath(projectId)
  const response: ApiResponse<typeof data> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
  }),
)

router.patch(
  '/:id/critical-path/overrides/:overrideId',
  validate(overrideIdParamSchema, 'params'),
  validate(overrideUpdateBodySchema),
  requireProjectEditor(async (req) => req.params.id),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id
    const { overrideId } = req.params
    logger.info('Updating critical path override', { projectId, overrideId, body: req.body })

    const overrides = await listCriticalPathOverrides(projectId)
    const existing = overrides.find((override) => override.id === overrideId)
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '关键路径覆盖不存在' },
        timestamp: new Date().toISOString(),
      } satisfies ApiResponse)
    }

    const data = await updateCriticalPathOverride(projectId, overrideId, {
      task_id: existing.task_id,
      mode: existing.mode,
      anchor_type: req.body.anchor_type ?? existing.anchor_type ?? null,
      left_task_id: req.body.left_task_id ?? existing.left_task_id ?? null,
      right_task_id: req.body.right_task_id ?? existing.right_task_id ?? null,
      reason: req.body.reason ?? existing.reason ?? null,
    })
    await recalculateProjectCriticalPath(projectId)
    const response: ApiResponse<typeof data> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

router.delete(
  '/:id/critical-path/overrides/:overrideId',
  validate(overrideIdParamSchema, 'params'),
  requireProjectEditor(async (req) => req.params.id),
  asyncHandler(async (req, res) => {
  const projectId = req.params.id
  const { overrideId } = req.params
  logger.info('Deleting critical path override', { projectId, overrideId })

  await deleteCriticalPathOverride(projectId, overrideId)
  await recalculateProjectCriticalPath(projectId)
  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
  }),
)

export default router
