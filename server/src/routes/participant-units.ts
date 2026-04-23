import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { validate, validateIdParam } from '../middleware/validation.js'
import { SupabaseService } from '../services/dbService.js'
import type { ParticipantUnit } from '../types/db.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()
const supabase = new SupabaseService()
const TABLE_NAME = 'participant_units'

router.use(authenticate)

const participantUnitsQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  project_id: z.string().trim().min(1).optional(),
}).passthrough().refine(
  (value) => Boolean(String(value.projectId ?? value.project_id ?? '').trim()),
  'projectId is required',
)

const participantUnitCreateBodySchema = z.object({
  project_id: z.string().trim().optional(),
  unit_name: z.string().trim().optional(),
  unit_type: z.string().trim().optional(),
  contact_name: z.string().optional().nullable(),
  contact_role: z.string().optional().nullable(),
  contact_phone: z.string().optional().nullable(),
  contact_email: z.string().optional().nullable(),
}).passthrough()

const participantUnitUpdateBodySchema = participantUnitCreateBodySchema.extend({
  version: z.coerce.number().int().min(1).optional(),
}).passthrough()

function now() {
  return new Date().toISOString()
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized || null
}

function resolveRequiredText(value: unknown, fallback: unknown) {
  return value === undefined ? normalizeText(fallback) : normalizeText(value)
}

function resolveNullableText(value: unknown, fallback: unknown) {
  return value === undefined ? normalizeNullableText(fallback) : normalizeNullableText(value)
}

function mapParticipantUnit(row: Record<string, any>): ParticipantUnit {
  return {
    id: String(row.id),
    project_id: row.project_id ? String(row.project_id) : null,
    unit_name: normalizeText(row.unit_name),
    unit_type: normalizeText(row.unit_type),
    contact_name: normalizeNullableText(row.contact_name),
    contact_role: normalizeNullableText(row.contact_role),
    contact_phone: normalizeNullableText(row.contact_phone),
    contact_email: normalizeNullableText(row.contact_email),
    version: Number(row.version ?? 1),
    created_at: String(row.created_at ?? now()),
    updated_at: String(row.updated_at ?? now()),
  }
}

function validationError(message: string): ApiResponse {
  return {
    success: false,
    error: { code: 'VALIDATION_ERROR', message },
    timestamp: now(),
  }
}

function normalizeCreateBody(body: Record<string, unknown>) {
  return {
    id: uuidv4(),
    project_id: normalizeText(body.project_id),
    unit_name: normalizeText(body.unit_name),
    unit_type: normalizeText(body.unit_type),
    contact_name: normalizeNullableText(body.contact_name),
    contact_role: normalizeNullableText(body.contact_role),
    contact_phone: normalizeNullableText(body.contact_phone),
    contact_email: normalizeNullableText(body.contact_email),
    version: 1,
    created_at: now(),
    updated_at: now(),
  }
}

function normalizeUpdateBody(body: Record<string, unknown>, current: Record<string, any>, nextVersion: number) {
  return {
    project_id: resolveRequiredText(body.project_id, current.project_id),
    unit_name: resolveRequiredText(body.unit_name, current.unit_name),
    unit_type: resolveRequiredText(body.unit_type, current.unit_type),
    contact_name: resolveNullableText(body.contact_name, current.contact_name),
    contact_role: resolveNullableText(body.contact_role, current.contact_role),
    contact_phone: resolveNullableText(body.contact_phone, current.contact_phone),
    contact_email: resolveNullableText(body.contact_email, current.contact_email),
    version: nextVersion,
    updated_at: now(),
  }
}

async function resolveParticipantUnitProjectId(id: string) {
  const rows = await supabase.query<Record<string, any>>(TABLE_NAME, { id })
  return normalizeText(rows[0]?.project_id)
}

router.get(
  '/',
  requireProjectMember((req) => normalizeText(req.query.projectId ?? req.query.project_id)),
  validate(participantUnitsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.query.projectId ?? req.query.project_id)
    const conditions = { project_id: projectId }

    logger.info('Fetching participant units', { projectId: projectId || null })

    const rows = await supabase.query<Record<string, any>>(TABLE_NAME, conditions)
    const data = rows
      .map(mapParticipantUnit)
      .sort((left, right) => right.created_at.localeCompare(left.created_at))

    const response: ApiResponse<ParticipantUnit[]> = {
      success: true,
      data,
      timestamp: now(),
    }

    res.json(response)
  }),
)

router.post(
  '/',
  requireProjectEditor((req) => normalizeText(req.body?.project_id)),
  validate(participantUnitCreateBodySchema),
  asyncHandler(async (req, res) => {
    const record = normalizeCreateBody((req.body ?? {}) as Record<string, unknown>)

    if (!record.project_id) {
      return res.status(400).json(validationError('project_id is required'))
    }
    if (!record.unit_name) {
      return res.status(400).json(validationError('unit_name is required'))
    }
    if (!record.unit_type) {
      return res.status(400).json(validationError('unit_type is required'))
    }

    logger.info('Creating participant unit', {
      project_id: record.project_id,
      unit_name: record.unit_name,
      unit_type: record.unit_type,
    })

    const created = await supabase.create<Record<string, any>>(TABLE_NAME, record as Record<string, unknown>)

    const response: ApiResponse<ParticipantUnit> = {
      success: true,
      data: mapParticipantUnit((created ?? record) as Record<string, any>),
      timestamp: now(),
    }

    res.status(201).json(response)
  }),
)

router.put(
  '/:id',
  validateIdParam,
  requireProjectEditor(async (req) => resolveParticipantUnitProjectId(req.params.id)),
  validate(participantUnitUpdateBodySchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const expectedVersion = Number(req.body?.version)

    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return res.status(400).json(validationError('version is required'))
    }

    const rows = await supabase.query<Record<string, any>>(TABLE_NAME, { id })
    const current = rows[0]

    if (!current) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Participant unit not found' },
        timestamp: now(),
      }
      return res.status(404).json(response)
    }

    if (Number(current.version ?? 1) !== expectedVersion) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VERSION_MISMATCH', message: 'Participant unit version mismatch' },
        timestamp: now(),
      }
      return res.status(409).json(response)
    }

    const updates = normalizeUpdateBody((req.body ?? {}) as Record<string, unknown>, current, expectedVersion + 1)

    if (!updates.project_id) {
      return res.status(400).json(validationError('project_id is required'))
    }
    if (!updates.unit_name) {
      return res.status(400).json(validationError('unit_name is required'))
    }
    if (!updates.unit_type) {
      return res.status(400).json(validationError('unit_type is required'))
    }

    const updated = await supabase.update<Record<string, any>>(TABLE_NAME, id, updates)

    const response: ApiResponse<ParticipantUnit> = {
      success: true,
      data: mapParticipantUnit(updated ?? { ...current, ...updates }),
      timestamp: now(),
    }

    res.json(response)
  }),
)

router.delete(
  '/:id',
  validateIdParam,
  requireProjectEditor(async (req) => resolveParticipantUnitProjectId(req.params.id)),
  asyncHandler(async (req, res) => {
    const { id } = req.params

    logger.info('Deleting participant unit', { id })
    await supabase.delete(TABLE_NAME, id)

    const response: ApiResponse = {
      success: true,
      timestamp: now(),
    }

    res.json(response)
  }),
)

export default router
