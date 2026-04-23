import { Router } from 'express'
import { z } from 'zod'

import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import type { ApiResponse } from '../types/index.js'
import {
  approveDelayRequest,
  calculateDelayImpact,
  createDelayRequest,
  getDelayRequest,
  listDelayRequests,
  rejectDelayRequest,
  withdrawDelayRequest,
} from '../services/delayRequests.js'

const router = Router()
router.use(authenticate)

const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}, z.string().optional())

const delayRequestIdParamSchema = z.object({
  id: z.string().trim().min(1, '延期申请ID不能为空'),
})

const delayRequestListQuerySchema = z.object({
  taskId: optionalTrimmedString,
  projectId: optionalTrimmedString,
}).passthrough()

const delayDaysSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined
  const next = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(next) ? next : value
}, z.number().positive('延期天数必须大于0'))

const createDelayRequestSchema = z.object({
  project_id: z.string().trim().min(1, '项目ID不能为空'),
  task_id: z.string().trim().min(1, '任务ID不能为空'),
  baseline_version_id: z.string().trim().min(1, 'baseline_version_id 不能为空'),
  original_date: z.string().trim().min(1, '原日期不能为空'),
  delayed_date: z.string().trim().min(1, '延期后日期不能为空'),
  delay_days: delayDaysSchema,
  reason: optionalTrimmedString,
  delay_reason: optionalTrimmedString,
  delay_type: z.unknown().optional(),
  chain_id: z.unknown().optional(),
}).passthrough()

function validationError(message: string, code = 'VALIDATION_ERROR') {
  return {
    success: false,
    error: { code, message },
    timestamp: new Date().toISOString(),
  }
}

function respondError(res: any, error: any) {
  const status = Number(error?.statusCode ?? 500)
  const response: ApiResponse = {
    success: false,
    error: {
      code: error?.code ?? 'INTERNAL_ERROR',
      message: error?.message ?? '延期申请处理失败',
      details: error?.details,
    },
    timestamp: new Date().toISOString(),
  }
  return res.status(status >= 400 && status < 600 ? status : 500).json(response)
}

router.get('/', validate(delayRequestListQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const taskId = req.query.taskId as string | undefined
  const projectId = req.query.projectId as string | undefined
  logger.info('Fetching delay requests', { taskId, projectId })
  const data = await listDelayRequests(taskId, projectId)
  const response: ApiResponse = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/', validate(createDelayRequestSchema), asyncHandler(async (req, res) => {
  const { project_id, task_id, baseline_version_id, original_date, delayed_date, delay_days } = req.body ?? {}
  const reason = String(req.body?.reason ?? req.body?.delay_reason ?? '').trim()
  if (!project_id || !task_id || !original_date || !delayed_date) {
    return res.status(400).json(validationError('项目ID、任务ID、原日期和延期后日期不能为空'))
  }
  if (!baseline_version_id) {
    return res.status(400).json(validationError('baseline_version_id 不能为空'))
  }
  if (!delay_days || Number(delay_days) <= 0) {
    return res.status(400).json(validationError('延期天数必须大于0'))
  }
  if (new Date(delayed_date) <= new Date(original_date)) {
    return res.status(400).json(validationError('延期后日期必须晚于原计划日期'))
  }
  if (!reason) {
    return res.status(400).json(validationError('延期原因不能为空'))
  }

  try {
    const impact = await calculateDelayImpact({
      project_id,
      task_id,
      original_date,
      delayed_date,
    })
    const delayRequest = await createDelayRequest({
      project_id,
      task_id,
      baseline_version_id,
      original_date,
      delayed_date,
      delay_days: Number(delay_days),
      delay_type: req.body?.delay_type ?? null,
      reason,
      delay_reason: req.body?.delay_reason ?? null,
      requested_by: req.user?.id ?? null,
      chain_id: req.body?.chain_id ?? null,
    })
    const response: ApiResponse = {
      success: true,
      data: {
        ...delayRequest,
        impact,
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(201).json(response)
  } catch (error: any) {
    return respondError(res, error)
  }
}))

router.post('/:id/approve', validate(delayRequestIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  try {
    const delayRequest = await approveDelayRequest(req.params.id, req.user?.id ?? null)
    const response: ApiResponse = {
      success: true,
      data: delayRequest,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (error: any) {
    respondError(res, error)
  }
}))

router.post('/:id/reject', validate(delayRequestIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  try {
    const delayRequest = await rejectDelayRequest(req.params.id, req.user?.id ?? null)
    const response: ApiResponse = {
      success: true,
      data: delayRequest,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (error: any) {
    respondError(res, error)
  }
}))

router.post('/:id/withdraw', validate(delayRequestIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  try {
    const delayRequest = await withdrawDelayRequest(req.params.id, req.user?.id ?? null)
    const response: ApiResponse = {
      success: true,
      data: delayRequest,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (error: any) {
    respondError(res, error)
  }
}))

router.delete('/:id', validate(delayRequestIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  try {
    const existing = await getDelayRequest(req.params.id)
    if (!existing) {
      return res.status(404).json(validationError('延期申请不存在', 'DELAY_REQUEST_NOT_FOUND'))
    }
    await withdrawDelayRequest(req.params.id, req.user?.id ?? null)
    const response: ApiResponse = {
      success: true,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (error: any) {
    respondError(res, error)
  }
}))

export default router
