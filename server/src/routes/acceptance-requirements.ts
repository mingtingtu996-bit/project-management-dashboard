import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
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
import { deactivateEntityLinksForEntity } from '../services/projectLinkingService.js'

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
  if (body.drawing_package_id !== undefined || body.drawingPackageId !== undefined) updates.drawing_package_id = body.drawing_package_id ?? body.drawingPackageId
  if (body.description !== undefined || body.notes !== undefined) updates.description = body.description ?? body.notes
  if (body.status !== undefined) updates.status = body.status
  if (body.is_required !== undefined) updates.is_required = body.is_required
  if (body.is_satisfied !== undefined) updates.is_satisfied = body.is_satisfied
  return updates
}

function hasForbiddenLineageFields(body: Record<string, any> = {}) {
  return body.source_entity_type !== undefined
    || body.source_entity_id !== undefined
    || body.source_id !== undefined
    || body.sourceEntityType !== undefined
    || body.sourceEntityId !== undefined
}

function isEntityExitStatus(value: unknown): boolean {
  const status = String(value ?? '').trim().toLowerCase()
  return status === 'archived' || status === 'inactive' || status === 'deleted'
}

async function resolvePlanProjectId(planId: string) {
  const plan = await executeSQLOne<{ project_id?: string }>('SELECT project_id FROM acceptance_plans WHERE id = ? LIMIT 1', [planId])
  return plan?.project_id
}

async function validateRequirementReferencesForProject(projectId: string, planId: string, drawingPackageId?: unknown) {
  const plan = await executeSQLOne<{ project_id?: string }>(
    'SELECT project_id FROM acceptance_plans WHERE id = ? LIMIT 1',
    [planId],
  )
  if (!plan || String(plan.project_id ?? '') !== projectId) {
    return {
      ok: false as const,
      code: 'PLAN_PROJECT_MISMATCH',
      message: 'Acceptance requirement plan must belong to the current project',
      details: { invalidPlanIds: [planId] },
    }
  }

  const packageId = String(drawingPackageId ?? '').trim()
  if (packageId) {
    const drawingPackage = await executeSQLOne<{ id?: string }>(
      'SELECT id FROM drawing_packages WHERE id = ? AND project_id = ? LIMIT 1',
      [packageId, projectId],
    )
    if (!drawingPackage) {
      return {
        ok: false as const,
        code: 'DRAWING_PACKAGE_PROJECT_MISMATCH',
        message: 'Acceptance requirement drawing package must belong to the current project',
        details: { invalidDrawingPackageIds: [packageId] },
      }
    }
  }

  return { ok: true as const }
}

async function validateDrawingPackageForProject(projectId: string, drawingPackageId?: unknown) {
  const packageId = String(drawingPackageId ?? '').trim()
  if (!packageId) return { ok: true as const }

  const drawingPackage = await executeSQLOne<{ id?: string }>(
    'SELECT id FROM drawing_packages WHERE id = ? AND project_id = ? LIMIT 1',
    [packageId, projectId],
  )
  if (!drawingPackage) {
    return {
      ok: false as const,
      code: 'DRAWING_PACKAGE_PROJECT_MISMATCH',
      message: 'Acceptance requirement drawing package must belong to the current project',
      details: { invalidDrawingPackageIds: [packageId] },
    }
  }

  return { ok: true as const }
}

router.get('/',
  validate(requirementListQuerySchema, 'query'),
  requireProjectMember((req) => {
    const planId = String(req.query.plan_id ?? req.query.planId ?? '').trim()
    return planId ? resolvePlanProjectId(planId) : undefined
  }),
  asyncHandler(async (req, res) => {
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
  const projectId = String(await resolvePlanProjectId(planId) ?? '').trim()
  const data = await listAcceptanceRequirements(projectId, planId)

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
  // v1.4.6: Reject source_entity_* fields from normal API — backend auto-derives
  if (hasForbiddenLineageFields(req.body ?? {})) {
    return res.status(400).json({ success: false, error: { code: 'LINEAGE_FIELD_FORBIDDEN', message: 'source_entity_type/source_entity_id 不允许前端传入' }, timestamp: new Date().toISOString() })
  }
  const payload = normalizeRequirementCreatePayload(req.body ?? {})
  // Auto-derive from acceptance plan context
  if (payload.plan_id) {
    payload.source_entity_type = 'acceptance_plan'
    payload.source_entity_id = payload.plan_id
  }
  if (!payload.plan_id || !payload.requirement_type) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'plan_id、requirement_type 是必需字段' }, timestamp: new Date().toISOString() })
  }

  const referenceValidation = await validateRequirementReferencesForProject(
    String(payload.project_id ?? ''),
    payload.plan_id,
    payload.drawing_package_id,
  )
  if (!referenceValidation.ok) {
    return res.status(400).json({
      success: false,
      error: {
        code: referenceValidation.code,
        message: referenceValidation.message,
        details: referenceValidation.details,
      },
      timestamp: new Date().toISOString(),
    })
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
  if (hasForbiddenLineageFields(req.body ?? {})) {
    return res.status(400).json({ success: false, error: { code: 'LINEAGE_FIELD_FORBIDDEN', message: 'source_entity_type/source_entity_id 不允许前端传入' }, timestamp: new Date().toISOString() })
  }
  const payload = normalizeRequirementUpdatePayload(req.body ?? {})
  logger.info('Updating acceptance requirement', { id })
  const current = await executeSQLOne<{ project_id?: string | null }>(
    'SELECT project_id FROM acceptance_requirements WHERE id = ? LIMIT 1',
    [id],
  )

  if (current?.project_id && payload.drawing_package_id !== undefined) {
    const packageValidation = await validateDrawingPackageForProject(
      String(current.project_id),
      payload.drawing_package_id,
    )
    if (!packageValidation.ok) {
      return res.status(400).json({
        success: false,
        error: {
          code: packageValidation.code,
          message: packageValidation.message,
          details: packageValidation.details,
        },
        timestamp: new Date().toISOString(),
      })
    }
  }

  const data = await updateAcceptanceRequirement(String(current?.project_id ?? ''), id, payload)

  if (current?.project_id && isEntityExitStatus(payload.status)) {
    await deactivateEntityLinksForEntity({
      projectId: String(current.project_id),
      entityType: 'acceptance_requirement',
      entityId: id,
      roles: ['target'],
    })
  }

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
  const current = await executeSQLOne<{ project_id?: string | null }>(
    'SELECT project_id FROM acceptance_requirements WHERE id = ? LIMIT 1',
    [id],
  )

  if (current?.project_id) {
    await deactivateEntityLinksForEntity({
      projectId: String(current.project_id),
      entityType: 'acceptance_requirement',
      entityId: id,
      roles: ['target'],
    })
  }

  const { enforceRetentionOrBlock, buildRetentionBlockedApiError, buildRetentionBlockedHttpStatus } = await import('../services/deletionRetentionGovernanceService.js')
  const retention = await enforceRetentionOrBlock({ entityType: 'acceptance_requirement', entityId: id, projectId: (current as any)?.project_id ?? null, userId: req.user?.id ?? null, userAction: 'delete' })
  if (retention.blocked) {
    return res.status(buildRetentionBlockedHttpStatus(retention.result)).json({ success: false, error: buildRetentionBlockedApiError(retention.reason, retention.result), timestamp: new Date().toISOString() })
  }

  const deleted = await deleteAcceptanceRequirement(String(current?.project_id ?? ''), id)
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
