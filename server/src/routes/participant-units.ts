import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { validate, validateIdParam } from '../middleware/validation.js'
import { query as rawQuery } from '../database.js'
import { SupabaseService } from '../services/dbService.js'
import { executeRetention } from '../services/deletionRetentionGovernanceService.js'
import type { ParticipantUnit } from '../types/db.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()
const supabase = new SupabaseService()
const TABLE_NAME = 'participant_units'
const PARTICIPANT_UNIT_CACHE_TTL_MS = 30_000
const participantUnitReadCache = new Map<string, {
  expiresAt: number
  promise: Promise<ParticipantUnit[]>
}>()

router.use(authenticate)

const participantUnitsQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  project_id: z.string().trim().min(1).optional(),
  status: z.enum(['active', 'disabled', 'archived', 'all']).optional(),
  unit_status: z.enum(['active', 'disabled', 'archived', 'all']).optional(),
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
  status: z.enum(['active', 'disabled', 'archived']).optional(),
  unit_status: z.enum(['active', 'disabled', 'archived']).optional(),
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
    unit_status: normalizeText(row.unit_status) || 'active',
    version: Number(row.version ?? 1),
    created_at: String(row.created_at ?? now()),
    updated_at: String(row.updated_at ?? now()),
  }
}

function normalizeDirectRow(row: Record<string, any>) {
  const normalized: Record<string, any> = {}
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = value instanceof Date ? value.toISOString() : value
  }
  return normalized
}

function clearParticipantUnitReadCache(projectId?: string | null) {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) {
    participantUnitReadCache.clear()
    return
  }
  for (const key of [...participantUnitReadCache.keys()]) {
    if (key.startsWith(`${normalizedProjectId}:`)) {
      participantUnitReadCache.delete(key)
    }
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
    unit_status: normalizeText(body.unit_status ?? body.status) || 'active',
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
    unit_status: resolveRequiredText(body.unit_status ?? body.status, current.unit_status || 'active'),
    version: nextVersion,
    updated_at: now(),
  }
}

async function resolveParticipantUnitProjectId(id: string) {
  const rows = await supabase.query<Record<string, any>>(TABLE_NAME, { id })
  return normalizeText(rows[0]?.project_id)
}

async function safeCountReferences(table: string, unitId: string) {
  try {
    const rows = await supabase.query<Record<string, any>>(table, { participant_unit_id: unitId })
    return rows.length
  } catch (error) {
    logger.warn('Skipping participant unit reference check', {
      table,
      error: error instanceof Error ? error.message : String(error),
    })
    return 0
  }
}

type ParticipantUnitSnapshotReferenceTable =
  | 'task_baseline_items'
  | 'monthly_plan_items'
  | 'task_progress_snapshots'

async function queryParticipantUnitSnapshotReferences(table: ParticipantUnitSnapshotReferenceTable, unitId: string) {
  const params = [JSON.stringify({ participant_unit_id: unitId })]
  switch (table) {
    case 'task_baseline_items':
      return rawQuery('SELECT id FROM task_baseline_items WHERE task_fact_snapshot @> $1::jsonb LIMIT 1', params)
    case 'monthly_plan_items':
      return rawQuery('SELECT id FROM monthly_plan_items WHERE task_fact_snapshot @> $1::jsonb LIMIT 1', params)
    case 'task_progress_snapshots':
      return rawQuery('SELECT id FROM task_progress_snapshots WHERE snapshot_data @> $1::jsonb LIMIT 1', params)
  }
}

async function safeCountSnapshotReferences(table: ParticipantUnitSnapshotReferenceTable, unitId: string) {
  try {
    const result = await queryParticipantUnitSnapshotReferences(table, unitId)
    return result.rowCount ?? result.rows.length
  } catch (error) {
    logger.warn('Skipping participant unit snapshot reference check', {
      table,
      error: error instanceof Error ? error.message : String(error),
    })
    return 0
  }
}

async function listParticipantUnits(projectId: string, status: string): Promise<ParticipantUnit[]> {
  const cacheKey = `${projectId}:${status}`
  const cached = participantUnitReadCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise
  }

  const promise = (async () => {
    try {
      const params: unknown[] = [projectId]
      const statusClause = status === 'all'
        ? ''
        : 'AND COALESCE(unit_status, $2) = $2'
      if (status !== 'all') {
        params.push(status)
      }

      const { rows } = await rawQuery(
        `SELECT *
         FROM participant_units
         WHERE project_id::text = $1
           ${statusClause}
         ORDER BY created_at DESC`,
        params,
      )
      return rows.map((row) => mapParticipantUnit(normalizeDirectRow(row)))
    } catch (error) {
      logger.warn('Falling back to Supabase REST for participant units list', {
        projectId,
        status,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    const rows = await supabase.query<Record<string, any>>(TABLE_NAME, { project_id: projectId })
    return rows
      .filter((row) => status === 'all' || (normalizeText(row.unit_status) || 'active') === status)
      .map(mapParticipantUnit)
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
  })()

  participantUnitReadCache.set(cacheKey, {
    expiresAt: Date.now() + PARTICIPANT_UNIT_CACHE_TTL_MS,
    promise,
  })
  try {
    return await promise
  } catch (error) {
    const current = participantUnitReadCache.get(cacheKey)
    if (current?.promise === promise) {
      participantUnitReadCache.delete(cacheKey)
    }
    throw error
  }
}

router.get(
  '/',
  requireProjectMember((req) => normalizeText(req.query.projectId ?? req.query.project_id)),
  validate(participantUnitsQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const projectId = normalizeText(req.query.projectId ?? req.query.project_id)
    const status = normalizeText(req.query.status ?? req.query.unit_status) || 'active'
    logger.info('Fetching participant units', { projectId: projectId || null, status })

    const data = await listParticipantUnits(projectId, status)

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
    clearParticipantUnitReadCache(record.project_id)

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

    const submittedProjectId = normalizeText(req.body?.project_id)
    if (submittedProjectId && submittedProjectId !== normalizeText(current.project_id)) {
      return res.status(400).json(validationError('project_id cannot be changed for participant units'))
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
    clearParticipantUnitReadCache(current.project_id)

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
    const projectId = await resolveParticipantUnitProjectId(id)

    // v1.4.10: check references before deciding physical delete vs archive
    const referenceCounts = await Promise.all([
      safeCountReferences('tasks', id),
      safeCountReferences('task_conditions', id),
      safeCountReferences('acceptance_plans', id),
      safeCountReferences('project_materials', id),
      safeCountReferences('responsibility_watchlist', id),
      safeCountReferences('responsibility_alert_states', id),
      safeCountReferences('project_daily_snapshot', id),
      safeCountSnapshotReferences('task_baseline_items', id),
      safeCountSnapshotReferences('monthly_plan_items', id),
      safeCountSnapshotReferences('task_progress_snapshots', id),
    ])

    const hasReferences = referenceCounts.some((count) => count > 0)
    const retention = await executeRetention({
      entityType: 'participant_unit',
      entityId: id,
      projectId,
      userId: req.user?.id ?? null,
      userAction: 'delete',
      suggestedAction: {
        classification: 'participant_unit_reference_aware_delete_or_archive',
        referenceCounts,
        hasReferences,
      },
    })

    if (retention.resolvedAction === 'archive') {
      logger.info('Archiving participant unit (has references)', { id })
      await supabase.update(TABLE_NAME, id, { unit_status: 'archived', updated_at: new Date().toISOString() } as any)
    } else if (retention.resolvedAction === 'physical_delete' && retention.executionMode === 'auto_execute') {
      logger.info('Physically deleting participant unit (no references)', { id })
      await supabase.delete(TABLE_NAME, id)
    } else {
      logger.warn('Participant unit deletion blocked by retention governance', {
        id,
        resolvedAction: retention.resolvedAction,
        reasonCode: retention.reasonCode,
      })
      return res.status(422).json({
        success: false,
        error: {
          code: 'PARTICIPANT_UNIT_RETENTION_BLOCKED',
          message: retention.reason,
          details: retention,
        },
        timestamp: now(),
      } as ApiResponse)
    }
    clearParticipantUnitReadCache(projectId)

    const response: ApiResponse = {
      success: true,
      timestamp: now(),
    }

    res.json(response)
  }),
)

export default router
