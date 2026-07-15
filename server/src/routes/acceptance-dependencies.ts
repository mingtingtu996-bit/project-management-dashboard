import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import { executeSQLOne } from '../services/dbService.js'
import type { ApiResponse } from '../types/index.js'
import type { AcceptanceDependency } from '../types/db.js'
import {
  createAcceptanceDependency,
  deleteAcceptanceDependency,
  listAcceptanceDependencies,
} from '../services/acceptanceFlowService.js'

const router = Router()
router.use(authenticate)

const dependencyIdParamSchema = z.object({
  id: z.string().trim().min(1, 'id 不能为空'),
})

const dependencyListQuerySchema = z.object({
  plan_id: z.string().trim().min(1).optional(),
  planId: z.string().trim().min(1).optional(),
}).passthrough()

const dependencyCreateBodySchema = z.object({
  id: z.string().trim().min(1).optional(),
  project_id: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  source_plan_id: z.string().trim().optional(),
  from_plan_id: z.string().trim().optional(),
  fromPlanId: z.string().trim().optional(),
  target_plan_id: z.string().trim().optional(),
  to_plan_id: z.string().trim().optional(),
  toPlanId: z.string().trim().optional(),
  dependency_kind: z.string().trim().optional(),
  dependency_type: z.unknown().optional(),
  status: z.string().trim().optional(),
}).passthrough()

function normalizeDependencyPayload(body: Record<string, any>) {
  return {
    id: body.id || uuidv4(),
    project_id: body.project_id ?? body.projectId ?? null,
    source_plan_id: body.source_plan_id ?? body.from_plan_id ?? body.fromPlanId ?? '',
    target_plan_id: body.target_plan_id ?? body.to_plan_id ?? body.toPlanId ?? '',
    dependency_kind: body.dependency_kind ?? 'hard',
    status: body.status ?? 'active',
  }
}

async function resolvePlanProjectId(planId: string) {
  const plan = await executeSQLOne<{ project_id?: string }>('SELECT project_id FROM acceptance_plans WHERE id = ? LIMIT 1', [planId])
  return plan?.project_id
}

async function validateDependencyPlansForProject(projectId: string, sourcePlanId: string, targetPlanId: string) {
  const [sourcePlan, targetPlan] = await Promise.all([
    executeSQLOne<{ project_id?: string }>('SELECT project_id FROM acceptance_plans WHERE id = ? LIMIT 1', [sourcePlanId]),
    executeSQLOne<{ project_id?: string }>('SELECT project_id FROM acceptance_plans WHERE id = ? LIMIT 1', [targetPlanId]),
  ])
  const invalidPlanIds = [
    !sourcePlan || String(sourcePlan.project_id ?? '') !== projectId ? sourcePlanId : null,
    !targetPlan || String(targetPlan.project_id ?? '') !== projectId ? targetPlanId : null,
  ].filter(Boolean)

  return invalidPlanIds as string[]
}

router.get('/',
  validate(dependencyListQuerySchema, 'query'),
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

  logger.info('Fetching acceptance dependencies', { planId })
  const projectId = String(await resolvePlanProjectId(planId) ?? '').trim()
  const data = await listAcceptanceDependencies(projectId, planId)

  const response: ApiResponse<AcceptanceDependency[]> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/',
  requireProjectEditor((req) => req.body.project_id ?? req.body.projectId),
  validate(dependencyCreateBodySchema),
  asyncHandler(async (req, res) => {
  if (req.body?.dependency_type !== undefined) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'dependency_type 已下线，请改用 dependency_kind' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const payload = normalizeDependencyPayload(req.body ?? {})
  if (!payload.source_plan_id || !payload.target_plan_id) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'source_plan_id 和 target_plan_id 是必需字段' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const invalidPlanIds = await validateDependencyPlansForProject(
    String(payload.project_id ?? ''),
    payload.source_plan_id,
    payload.target_plan_id,
  )
  if (invalidPlanIds.length > 0) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'PLAN_PROJECT_MISMATCH',
        message: 'Acceptance dependency plans must belong to the current project',
        details: { invalidPlanIds },
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Creating acceptance dependency', payload)
  const data = await createAcceptanceDependency(payload)

  const response: ApiResponse<AcceptanceDependency | null> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

router.delete('/:id',
  requireProjectEditor(async (req) => {
    const dependency = await executeSQLOne<{ project_id?: string }>('SELECT project_id FROM acceptance_dependencies WHERE id = ? LIMIT 1', [req.params.id])
    return dependency?.project_id
  }),
  validate(dependencyIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting acceptance dependency', { id })
  const dependency = await executeSQLOne<{ project_id?: string | null }>('SELECT project_id FROM acceptance_dependencies WHERE id = ? LIMIT 1', [id])
  const { enforceRetentionOrBlock, buildRetentionBlockedApiError, buildRetentionBlockedHttpStatus } = await import('../services/deletionRetentionGovernanceService.js')
  const retention = await enforceRetentionOrBlock({ entityType: 'acceptance_dependency', entityId: id, projectId: dependency?.project_id ?? null, userId: req.user?.id ?? null, userAction: 'delete' })
  if (retention.blocked) {
    return res.status(buildRetentionBlockedHttpStatus(retention.result)).json({ success: false, error: buildRetentionBlockedApiError(retention.reason, retention.result), timestamp: new Date().toISOString() })
  }
  await deleteAcceptanceDependency(String(dependency?.project_id ?? ''), id)

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
