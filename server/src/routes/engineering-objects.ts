import { Router } from 'express'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { supabase } from '../services/dbService.js'
import type { ApiResponse } from '../types/index.js'
import { ENGINEERING_OBJECT_TYPES, type EngineeringObject, type EngineeringObjectType } from '../types/db.js'
import {
  listEngineeringObjects,
  createEngineeringObject,
  updateEngineeringObject,
  deleteEngineeringObject,
  bootstrapEngineeringObjects,
} from '../services/engineeringObjectService.js'
import { refreshLiveProjectGenerationFactsFromProjectState } from '../services/projectGenerationFactsStoreService.js'

const router = Router()
router.use(authenticate)

function now() {
  return new Date().toISOString()
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function validationError(message: string): ApiResponse {
  return {
    success: false,
    error: { code: 'VALIDATION_ERROR', message },
    timestamp: now(),
  }
}

function isValidEngineeringObjectType(value: string): value is EngineeringObjectType {
  return (ENGINEERING_OBJECT_TYPES as readonly string[]).includes(value)
}

async function resolveEngineeringObjectProjectId(objectId: string): Promise<string | null> {
  const { data } = await supabase
    .from('engineering_objects')
    .select('project_id')
    .eq('id', objectId)
    .maybeSingle()
  return (data as any)?.project_id ?? null
}

async function refreshProjectGenerationFacts(projectId: string | null | undefined, source: string) {
  await refreshLiveProjectGenerationFactsFromProjectState({ projectId, source }).catch((error) => {
    logger.warn('Engineering object project generation facts refresh skipped', {
      projectId,
      source,
      error: error instanceof Error ? error.message : String(error),
    })
  })
}

// GET /api/engineering-objects
router.get(
  '/',
  requireProjectMember((req) => normalizeText(req.query.projectId)),
  asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.query.projectId)
    if (!projectId) {
      return res.status(400).json(validationError('projectId is required'))
    }

    const typeParam = normalizeText(req.query.type || req.query.objectType)
    const parentIdParam = normalizeText(req.query.parentId)
    const statusParam = normalizeText(req.query.status) || 'active'

    const parentId =
      parentIdParam === '__root__' || parentIdParam === '' ? ('__root__' as const) : parentIdParam || undefined

    if (typeParam && !isValidEngineeringObjectType(typeParam)) {
      return res.status(400).json(validationError(`objectType must be one of: ${ENGINEERING_OBJECT_TYPES.join(', ')}`))
    }
    const objectType = typeParam ? (typeParam as EngineeringObjectType) : undefined

    const objects = await listEngineeringObjects({
      projectId,
      type: objectType,
      parentId: parentId as string | null | undefined,
      status: (['active','inactive','all'].includes(statusParam) ? statusParam : 'active') as 'active' | 'inactive' | 'all',
    })

    res.json({
      success: true,
      data: objects,
      timestamp: now(),
    } as ApiResponse<EngineeringObject[]>)
  }),
)

// POST /api/engineering-objects/bootstrap
router.post(
  '/bootstrap',
  requireProjectEditor((req) => normalizeText(req.body?.projectId)),
  asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.body?.projectId)
    if (!projectId) {
      return res.status(400).json(validationError('projectId is required'))
    }

    const objects = await bootstrapEngineeringObjects(projectId)
    await refreshProjectGenerationFacts(projectId, 'engineering_object_bootstrap')

    res.status(201).json({
      success: true,
      data: objects,
      timestamp: now(),
    } as ApiResponse<EngineeringObject[]>)
  }),
)

// POST /api/engineering-objects
router.post(
  '/',
  requireProjectEditor((req) => normalizeText(req.body?.projectId)),
  asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.body?.projectId)
    const objectType = normalizeText(req.body?.objectType) as EngineeringObjectType
    const objectName = normalizeText(req.body?.objectName)
    const parentId = req.body?.parentId === '__root__' || req.body?.parentId === ''
      ? null
      : normalizeText(req.body?.parentId) || null
    const sortOrder = typeof req.body?.sortOrder === 'number' ? req.body.sortOrder : undefined
    const metadata = req.body?.metadata

    if (!projectId) {
      return res.status(400).json(validationError('projectId is required'))
    }
    if (!objectType) {
      return res.status(400).json(validationError('objectType is required'))
    }
    if (!objectName) {
      return res.status(400).json(validationError('objectName is required'))
    }

    try {
      const obj = await createEngineeringObject({
        projectId,
        objectType,
        objectName,
        parentId,
        sortOrder,
        metadata,
      })
      await refreshProjectGenerationFacts(projectId, 'engineering_object_create')

      res.status(201).json({
        success: true,
        data: obj,
        timestamp: now(),
      } as ApiResponse<EngineeringObject>)
    } catch (err: any) {
      logger.error('Failed to create engineering object', { error: err.message })
      return res.status(400).json(validationError(err.message))
    }
  }),
)

// PATCH /api/engineering-objects/:id
router.patch(
  '/:id',
  requireProjectEditor(async (req) => resolveEngineeringObjectProjectId(req.params.id)),
  asyncHandler(async (req, res) => {
    const id = normalizeText(req.params.id)
    if (!id) {
      return res.status(400).json(validationError('id is required'))
    }

    const projectId = await resolveEngineeringObjectProjectId(id)
    if (!projectId) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Engineering object not found' },
        timestamp: now(),
      } as ApiResponse)
    }

    const input: Record<string, unknown> = { projectId }
    if (req.body?.objectName !== undefined) input.objectName = normalizeText(req.body.objectName)
    if (req.body?.parentId !== undefined) {
      input.parentId = req.body.parentId === '__root__' || req.body.parentId === '' ? null : normalizeText(req.body.parentId) || null
    }
    if (req.body?.sortOrder !== undefined) input.sortOrder = req.body.sortOrder
    if (req.body?.status !== undefined) input.status = normalizeText(req.body.status)
    if (req.body?.metadata !== undefined) input.metadata = req.body.metadata

    try {
      const obj = await updateEngineeringObject(id, input as any)
      await refreshProjectGenerationFacts(obj.project_id, 'engineering_object_update')

      res.json({
        success: true,
        data: obj,
        timestamp: now(),
      } as ApiResponse<EngineeringObject>)
    } catch (err: any) {
      logger.error('Failed to update engineering object', { id, error: err.message })
      const status = err.message === 'Engineering object not found' ? 404 : 400
      return res.status(status).json({
        success: false,
        error: { code: status === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR', message: err.message },
        timestamp: now(),
      })
    }
  }),
)

// DELETE /api/engineering-objects/:id
router.delete(
  '/:id',
  requireProjectEditor(async (req) => resolveEngineeringObjectProjectId(req.params.id)),
  asyncHandler(async (req, res) => {
    const id = normalizeText(req.params.id)
    if (!id) {
      return res.status(400).json(validationError('id is required'))
    }

    const projectId = await resolveEngineeringObjectProjectId(id)
    if (!projectId) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Engineering object not found' },
        timestamp: now(),
      } as ApiResponse)
    }

    try {
      // v1.4.15: retention decision must block unsafe delete requests.
      const { enforceRetentionOrBlock, buildRetentionBlockedApiError, buildRetentionBlockedHttpStatus } = await import('../services/deletionRetentionGovernanceService.js')
      const retention = await enforceRetentionOrBlock({
        entityType: 'engineering_object',
        entityId: id,
        projectId,
        userId: req.user?.id ?? null,
        userAction: 'delete',
      })
      if (retention.blocked) {
        return res.status(buildRetentionBlockedHttpStatus(retention.result)).json({ success: false, error: buildRetentionBlockedApiError(retention.reason, retention.result), timestamp: now() })
      }

      await deleteEngineeringObject(projectId, id)
      await refreshProjectGenerationFacts(projectId, 'engineering_object_delete')

      res.json({
        success: true,
        timestamp: now(),
      } as ApiResponse)
    } catch (err: any) {
      logger.error('Failed to delete engineering object', { id, error: err.message })
      const status = err.message === 'Engineering object not found' ? 404 : 400
      return res.status(status).json({
        success: false,
        error: { code: status === 404 ? 'NOT_FOUND' : 'CANNOT_DELETE', message: err.message },
        timestamp: now(),
      })
    }
  }),
)

export default router
