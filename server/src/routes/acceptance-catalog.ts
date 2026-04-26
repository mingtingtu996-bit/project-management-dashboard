import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import { executeSQLOne } from '../services/dbService.js'
import type { ApiResponse } from '../types/index.js'
import type { AcceptanceCatalog } from '../types/db.js'
import {
  createAcceptanceCatalog,
  deleteAcceptanceCatalog,
  listAcceptanceCatalog,
  updateAcceptanceCatalog,
} from '../services/acceptanceFlowService.js'

const router = Router()
router.use(authenticate)

const catalogIdParamSchema = z.object({
  id: z.string().trim().min(1, 'id 不能为空'),
})

const catalogListQuerySchema = z.object({
  project_id: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
}).passthrough()

const catalogCreateBodySchema = z.object({
  id: z.string().trim().min(1).optional(),
  project_id: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  catalog_code: z.string().trim().optional(),
  code: z.string().trim().optional(),
  catalog_name: z.string().trim().optional(),
  name: z.string().trim().optional(),
  phase_code: z.string().trim().optional().nullable(),
  default_phase: z.string().trim().optional().nullable(),
  scope_level: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  planned_finish_date: z.string().trim().optional().nullable(),
  planned_date: z.string().trim().optional().nullable(),
  description: z.string().optional().nullable(),
  is_system: z.boolean().optional(),
}).passthrough()

const catalogUpdateBodySchema = z.object({
  catalog_code: z.string().trim().optional().nullable(),
  code: z.string().trim().optional().nullable(),
  catalog_name: z.string().trim().optional().nullable(),
  name: z.string().trim().optional().nullable(),
  phase_code: z.string().trim().optional().nullable(),
  default_phase: z.string().trim().optional().nullable(),
  scope_level: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  planned_finish_date: z.string().trim().optional().nullable(),
  planned_date: z.string().trim().optional().nullable(),
  description: z.string().optional().nullable(),
  is_system: z.boolean().optional(),
}).passthrough()

function normalizeCatalogCreatePayload(body: Record<string, any>) {
  return {
    id: body.id || uuidv4(),
    project_id: body.project_id ?? body.projectId ?? null,
    catalog_code: body.catalog_code ?? body.code ?? null,
    catalog_name: body.catalog_name ?? body.name ?? body.catalog_code ?? body.code ?? '',
    phase_code: body.phase_code ?? body.default_phase ?? null,
    scope_level: body.scope_level ?? body.category ?? null,
    planned_finish_date: body.planned_finish_date ?? body.planned_date ?? null,
    description: body.description ?? null,
    is_system: body.is_system ?? false,
  }
}

function normalizeCatalogUpdatePayload(body: Record<string, any>) {
  const updates: Record<string, any> = {}
  if (body.catalog_code !== undefined || body.code !== undefined) updates.catalog_code = body.catalog_code ?? body.code
  if (body.catalog_name !== undefined || body.name !== undefined) updates.catalog_name = body.catalog_name ?? body.name
  if (body.phase_code !== undefined || body.default_phase !== undefined) updates.phase_code = body.phase_code ?? body.default_phase
  if (body.scope_level !== undefined || body.category !== undefined) updates.scope_level = body.scope_level ?? body.category
  if (body.planned_finish_date !== undefined || body.planned_date !== undefined) updates.planned_finish_date = body.planned_finish_date ?? body.planned_date
  if (body.description !== undefined) updates.description = body.description
  if (body.is_system !== undefined) updates.is_system = body.is_system
  return updates
}

router.get('/', validate(catalogListQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const projectId = String(req.query.project_id ?? req.query.projectId ?? '').trim()
  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: 'project_id 不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Fetching acceptance catalog', { projectId })
  const data = await listAcceptanceCatalog(projectId)

  const response: ApiResponse<AcceptanceCatalog[]> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/',
  requireProjectEditor((req) => req.body.project_id ?? req.body.projectId),
  validate(catalogCreateBodySchema),
  asyncHandler(async (req, res) => {
  const payload = normalizeCatalogCreatePayload(req.body ?? {})
  if (!payload.project_id || !payload.catalog_name) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'project_id 和 catalog_name 是必需字段' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Creating acceptance catalog', payload)
  const data = await createAcceptanceCatalog(payload)

  const response: ApiResponse<AcceptanceCatalog | null> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

router.put('/:id',
  requireProjectEditor(async (req) => {
    const catalog = await executeSQLOne<{ project_id?: string }>('SELECT project_id FROM acceptance_catalog WHERE id = ? LIMIT 1', [req.params.id])
    return catalog?.project_id
  }),
  validate(catalogIdParamSchema, 'params'),
  validate(catalogUpdateBodySchema),
  asyncHandler(async (req, res) => {
  const { id } = req.params
  const updates = normalizeCatalogUpdatePayload(req.body ?? {})
  logger.info('Updating acceptance catalog', { id })

  const data = await updateAcceptanceCatalog(id, updates)

  const response: ApiResponse<AcceptanceCatalog | null> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.delete('/:id',
  requireProjectEditor(async (req) => {
    const catalog = await executeSQLOne<{ project_id?: string }>('SELECT project_id FROM acceptance_catalog WHERE id = ? LIMIT 1', [req.params.id])
    return catalog?.project_id
  }),
  validate(catalogIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting acceptance catalog', { id })
  await deleteAcceptanceCatalog(id)

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
