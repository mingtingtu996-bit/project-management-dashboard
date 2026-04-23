import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import type { ApiResponse } from '../types/index.js'
import type { AcceptanceRecord } from '../types/db.js'
import {
  createAcceptanceRecord,
  deleteAcceptanceRecord,
  listAcceptanceRecords,
  updateAcceptanceRecord,
} from '../services/acceptanceFlowService.js'

const router = Router()
router.use(authenticate)

const recordIdParamSchema = z.object({
  id: z.string().trim().min(1, 'id 不能为空'),
})

const recordListQuerySchema = z.object({
  plan_id: z.string().trim().min(1).optional(),
  planId: z.string().trim().min(1).optional(),
}).passthrough()

const recordCreateBodySchema = z.object({
  id: z.string().trim().min(1).optional(),
  project_id: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  plan_id: z.string().trim().optional(),
  planId: z.string().trim().optional(),
  record_type: z.string().trim().optional(),
  recordType: z.string().trim().optional(),
  content: z.string().optional(),
  notes: z.string().optional(),
  operator: z.string().trim().optional().nullable(),
  operator_id: z.string().trim().optional().nullable(),
  operatorId: z.string().trim().optional().nullable(),
  record_date: z.string().trim().optional().nullable(),
  recordDate: z.string().trim().optional().nullable(),
  attachments: z.unknown().optional().nullable(),
}).passthrough()

const recordUpdateBodySchema = z.object({
  project_id: z.string().trim().optional().nullable(),
  projectId: z.string().trim().optional().nullable(),
  plan_id: z.string().trim().optional().nullable(),
  planId: z.string().trim().optional().nullable(),
  record_type: z.string().trim().optional().nullable(),
  recordType: z.string().trim().optional().nullable(),
  content: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  operator: z.string().trim().optional().nullable(),
  operator_id: z.string().trim().optional().nullable(),
  operatorId: z.string().trim().optional().nullable(),
  record_date: z.string().trim().optional().nullable(),
  recordDate: z.string().trim().optional().nullable(),
  attachments: z.unknown().optional().nullable(),
}).passthrough()

function normalizeRecordPayload(body: Record<string, any>) {
  return {
    id: body.id || uuidv4(),
    project_id: body.project_id ?? body.projectId ?? null,
    plan_id: body.plan_id ?? body.planId ?? '',
    record_type: body.record_type ?? body.recordType ?? '',
    content: body.content ?? body.notes ?? '',
    operator: body.operator ?? body.operator_id ?? body.operatorId ?? null,
    record_date: body.record_date ?? body.recordDate ?? null,
    attachments: body.attachments ?? null,
  }
}

function normalizeRecordUpdatePayload(body: Record<string, any>) {
  const updates: Record<string, any> = {}
  if (body.project_id !== undefined || body.projectId !== undefined) updates.project_id = body.project_id ?? body.projectId
  if (body.plan_id !== undefined || body.planId !== undefined) updates.plan_id = body.plan_id ?? body.planId
  if (body.record_type !== undefined || body.recordType !== undefined) updates.record_type = body.record_type ?? body.recordType
  if (body.content !== undefined || body.notes !== undefined) updates.content = body.content ?? body.notes
  if (body.operator !== undefined || body.operator_id !== undefined || body.operatorId !== undefined) updates.operator = body.operator ?? body.operator_id ?? body.operatorId
  if (body.record_date !== undefined || body.recordDate !== undefined) updates.record_date = body.record_date ?? body.recordDate
  if (body.attachments !== undefined) updates.attachments = body.attachments
  return updates
}

router.get('/', validate(recordListQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const planId = String(req.query.plan_id ?? req.query.planId ?? '').trim()
  if (!planId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PLAN_ID', message: 'plan_id 不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Fetching acceptance records', { planId })
  const data = await listAcceptanceRecords(planId)

  const response: ApiResponse<AcceptanceRecord[]> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/', validate(recordCreateBodySchema), asyncHandler(async (req, res) => {
  const payload = normalizeRecordPayload(req.body ?? {})
  if (!payload.plan_id || !payload.record_type || !payload.content) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'plan_id、record_type、content 是必需字段',
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Creating acceptance record', payload)
  const data = await createAcceptanceRecord(payload)

  const response: ApiResponse<AcceptanceRecord | null> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

async function handleUpdateRecord(req: any, res: any) {
  const { id } = req.params
  const updates = normalizeRecordUpdatePayload(req.body ?? {})
  logger.info('Updating acceptance record', { id })

  const data = await updateAcceptanceRecord(id, updates)

  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'RECORD_NOT_FOUND', message: '验收记录不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<AcceptanceRecord | null> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}

router.put('/:id', validate(recordIdParamSchema, 'params'), validate(recordUpdateBodySchema), asyncHandler(handleUpdateRecord))
router.patch('/:id', validate(recordIdParamSchema, 'params'), validate(recordUpdateBodySchema), asyncHandler(handleUpdateRecord))

router.delete('/:id', validate(recordIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting acceptance record', { id })

  const deleted = await deleteAcceptanceRecord(id)
  if (!deleted) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'RECORD_NOT_FOUND', message: '验收记录不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<AcceptanceRecord | null> = {
    success: true,
    data: deleted,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
