import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import { executeSQLOne } from '../services/dbService.js'
import type { ApiResponse } from '../types/index.js'
import type { AcceptanceRequirement } from '../types/db.js'
import {
  createAcceptanceRequirement,
  deleteAcceptanceRequirement,
  listAcceptanceRequirements,
  updateAcceptanceRequirement,
} from '../services/acceptanceFlowService.js'

const router = Router()
router.use(authenticate)

const requirementIdParamSchema = z.object({
  id: z.string().trim().min(1, 'id 不能为空'),
})

const requirementListQuerySchema = z.object({
  plan_id: z.string().trim().min(1).optional(),
  planId: z.string().trim().min(1).optional(),
}).passthrough()

const requirementCreateBodySchema = z.object({
  id: z.string().trim().min(1).optional(),
  project_id: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  plan_id: z.string().trim().optional(),
  planId: z.string().trim().optional(),
  requirement_type: z.string().trim().optional(),
  requirementType: z.string().trim().optional(),
  source_entity_type: z.string().trim().optional(),
  sourceEntityType: z.string().trim().optional(),
  source_entity_id: z.string().trim().optional(),
  source_id: z.string().trim().optional(),
  sourceEntityId: z.string().trim().optional(),
  drawing_package_id: z.string().trim().optional().nullable(),
  drawingPackageId: z.string().trim().optional().nullable(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.string().trim().optional(),
  is_required: z.boolean().optional(),
  is_satisfied: z.boolean().optional(),
}).passthrough()

const requirementUpdateBodySchema = z.object({
  requirement_type: z.string().trim().optional().nullable(),
  requirementType: z.string().trim().optional().nullable(),
  source_entity_type: z.string().trim().optional().nullable(),
  sourceEntityType: z.string().trim().optional().nullable(),
  source_entity_id: z.string().trim().optional().nullable(),
  source_id: z.string().trim().optional().nullable(),
  sourceEntityId: z.string().trim().optional().nullable(),
  drawing_package_id: z.string().trim().optional().nullable(),
  drawingPackageId: z.string().trim().optional().nullable(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.string().trim().optional().nullable(),
  is_required: z.boolean().optional(),
  is_satisfied: z.boolean().optional(),
}).passthrough()

function normalizeRequirementCreatePayload(body: Record<string, any>) {
  return {
    id: body.id || uuidv4(),
    project_id: body.project_id ?? body.projectId ?? null,
    plan_id: body.plan_id ?? body.planId ?? '',
    requirement_type: body.requirement_type ?? body.requirementType ?? '',
    source_entity_type: body.source_entity_type ?? body.sourceEntityType ?? '',
    source_entity_id: body.source_entity_id ?? body.source_id ?? body.sourceEntityId ?? '',
    drawing_package_id: body.drawing_package_id ?? body.drawingPackageId ?? null,
    description: body.description ?? body.notes ?? null,
    status: body.status ?? 'open',
    is_required: body.is_required ?? true,
    is_satisfied: body.is_satisfied ?? false,
  }
}

function normalizeRequirementUpdatePayload(body: Record<string, any>) {
  const updates: Record<string, any> = {}
  if (body.requirement_type !== undefined || body.requirementType !== undefined) updates.requirement_type = body.requirement_type ?? body.requirementType
  if (body.source_entity_type !== undefined || body.sourceEntityType !== undefined) updates.source_entity_type = body.source_entity_type ?? body.sourceEntityType
  if (body.source_entity_id !== undefined || body.source_id !== undefined || body.sourceEntityId !== undefined) updates.source_entity_id = body.source_entity_id ?? body.source_id ?? body.sourceEntityId
  if (body.drawing_package_id !== undefined || body.drawingPackageId !== undefined) updates.drawing_package_id = body.drawing_package_id ?? body.drawingPackageId
  if (body.description !== undefined || body.notes !== undefined) updates.description = body.description ?? body.notes
  if (body.status !== undefined) updates.status = body.status
  if (body.is_required !== undefined) updates.is_required = body.is_required
  if (body.is_satisfied !== undefined) updates.is_satisfied = body.is_satisfied
  return updates
}

router.get('/', validate(requirementListQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const planId = String(req.query.plan_id ?? req.query.planId ?? '').trim()
  if (!planId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PLAN_ID', message: 'plan_id 不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Fetching acceptance requirements', { planId })
  const data = await listAcceptanceRequirements(planId)

  const response: ApiResponse<AcceptanceRequirement[]> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/',
  requireProjectEditor((req) => req.body.project_id ?? req.body.projectId),
  validate(requirementCreateBodySchema),
  asyncHandler(async (req, res) => {
  const payload = normalizeRequirementCreatePayload(req.body ?? {})
  if (!payload.plan_id || !payload.requirement_type || !payload.source_entity_type || !payload.source_entity_id) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'plan_id、requirement_type、source_entity_type、source_entity_id 是必需字段',
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Creating acceptance requirement', payload)
  const data = await createAcceptanceRequirement(payload)

  const response: ApiResponse<AcceptanceRequirement | null> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

router.put('/:id',
  requireProjectEditor(async (req) => {
    const requirement = await executeSQLOne<{ project_id?: string }>('SELECT project_id FROM acceptance_requirements WHERE id = ? LIMIT 1', [req.params.id])
    return requirement?.project_id
  }),
  validate(requirementIdParamSchema, 'params'),
  validate(requirementUpdateBodySchema),
  asyncHandler(async (req, res) => {
  const { id } = req.params
  const payload = normalizeRequirementUpdatePayload(req.body ?? {})
  logger.info('Updating acceptance requirement', { id })

  const data = await updateAcceptanceRequirement(id, payload)

  const response: ApiResponse<AcceptanceRequirement | null> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.delete('/:id',
  requireProjectEditor(async (req) => {
    const requirement = await executeSQLOne<{ project_id?: string }>('SELECT project_id FROM acceptance_requirements WHERE id = ? LIMIT 1', [req.params.id])
    return requirement?.project_id
  }),
  validate(requirementIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting acceptance requirement', { id })

  const deleted = await deleteAcceptanceRequirement(id)
  if (!deleted) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'REQUIREMENT_NOT_FOUND', message: '验收条件不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<AcceptanceRequirement | null> = {
    success: true,
    data: deleted,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
