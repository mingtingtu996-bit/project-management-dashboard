import express from 'express'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

import { getProjectPermissionLevel, isCompanyAdminRole } from '../auth/access.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate } from '../middleware/validation.js'
import { SupabaseService } from '../services/dbService.js'
import { writeLifecycleLog, writeLog } from '../services/changeLogs.js'
import { buildMaterialReportSummary, listProjectMaterials } from '../services/materialReportsService.js'
import type { ProjectMaterialRecord } from '../services/materialReportsService.js'
import { autoSatisfyMaterialConditions } from '../services/taskConditionLinkageService.js'

const router = express.Router({ mergeParams: true })
const supabaseService = new SupabaseService()

const projectIdParamSchema = z.object({
  projectId: z.string().trim().min(1, 'projectId 不能为空'),
})

const materialIdParamSchema = projectIdParamSchema.extend({
  materialId: z.string().trim().min(1, 'materialId 不能为空'),
})

const optionalLooseString = z.union([z.string(), z.null()]).optional()
const optionalLooseBoolean = z.union([z.boolean(), z.string(), z.number()]).optional()

const materialMutationSchema = z.object({
  participant_unit_id: optionalLooseString,
  material_name: optionalLooseString,
  specialty_type: optionalLooseString,
  requires_sample_confirmation: optionalLooseBoolean,
  sample_confirmed: optionalLooseBoolean,
  expected_arrival_date: optionalLooseString,
  actual_arrival_date: optionalLooseString,
  requires_inspection: optionalLooseBoolean,
  inspection_done: optionalLooseBoolean,
}).passthrough()

const materialCreateBodySchema = z.union([
  materialMutationSchema,
  z.array(materialMutationSchema),
  z.object({
    items: z.array(materialMutationSchema),
  }).passthrough(),
])

type MaterialMutationPayload = {
  participant_unit_id?: unknown
  material_name?: unknown
  specialty_type?: unknown
  requires_sample_confirmation?: unknown
  sample_confirmed?: unknown
  expected_arrival_date?: unknown
  actual_arrival_date?: unknown
  requires_inspection?: unknown
  inspection_done?: unknown
  change_reason?: unknown
}

router.use(authenticate)

function nowIso() {
  return new Date().toISOString()
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized || null
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (value === undefined) return fallback
  return value === true || value === 1 || value === '1' || String(value).trim().toLowerCase() === 'true'
}

function validationError(message: string) {
  return {
    success: false,
    error: { code: 'VALIDATION_ERROR', message },
    timestamp: nowIso(),
  }
}

async function getAccess(projectId: string, userId?: string, globalRole?: string) {
  if (!userId) {
    return { canRead: false, canWrite: false }
  }

  if (isCompanyAdminRole(globalRole)) {
    const permissionLevel = await getProjectPermissionLevel(userId, projectId)
    return {
      canRead: true,
      canWrite: permissionLevel === 'owner' || permissionLevel === 'editor',
    }
  }

  const permissionLevel = await getProjectPermissionLevel(userId, projectId)
  return {
    canRead: permissionLevel !== null,
    canWrite: permissionLevel === 'owner' || permissionLevel === 'editor',
  }
}

function normalizeCreatePayload(projectId: string, body: MaterialMutationPayload) {
  const requiresSample = normalizeBoolean(body.requires_sample_confirmation)
  const requiresInspection = normalizeBoolean(body.requires_inspection)

  return {
    id: uuidv4(),
    project_id: projectId,
    participant_unit_id: normalizeNullableText(body.participant_unit_id),
    material_name: normalizeText(body.material_name),
    specialty_type: normalizeNullableText(body.specialty_type),
    requires_sample_confirmation: requiresSample,
    sample_confirmed: requiresSample ? normalizeBoolean(body.sample_confirmed) : false,
    expected_arrival_date: normalizeText(body.expected_arrival_date),
    actual_arrival_date: normalizeNullableText(body.actual_arrival_date),
    requires_inspection: requiresInspection,
    inspection_done: requiresInspection ? normalizeBoolean(body.inspection_done) : false,
    version: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
}

function normalizeUpdatePayload(current: Record<string, any>, body: MaterialMutationPayload) {
  const nextVersion = Number(current.version ?? 1) + 1
  const requiresSample = body.requires_sample_confirmation === undefined
    ? normalizeBoolean(current.requires_sample_confirmation)
    : normalizeBoolean(body.requires_sample_confirmation)
  const requiresInspection = body.requires_inspection === undefined
    ? normalizeBoolean(current.requires_inspection)
    : normalizeBoolean(body.requires_inspection)

  return {
    participant_unit_id: body.participant_unit_id === undefined
      ? normalizeNullableText(current.participant_unit_id)
      : normalizeNullableText(body.participant_unit_id),
    material_name: body.material_name === undefined
      ? normalizeText(current.material_name)
      : normalizeText(body.material_name),
    specialty_type: body.specialty_type === undefined
      ? normalizeNullableText(current.specialty_type)
      : normalizeNullableText(body.specialty_type),
    requires_sample_confirmation: requiresSample,
    sample_confirmed: body.sample_confirmed === undefined
      ? (requiresSample ? normalizeBoolean(current.sample_confirmed) : false)
      : (requiresSample ? normalizeBoolean(body.sample_confirmed) : false),
    expected_arrival_date: body.expected_arrival_date === undefined
      ? normalizeText(current.expected_arrival_date)
      : normalizeText(body.expected_arrival_date),
    actual_arrival_date: body.actual_arrival_date === undefined
      ? normalizeNullableText(current.actual_arrival_date)
      : normalizeNullableText(body.actual_arrival_date),
    requires_inspection: requiresInspection,
    inspection_done: body.inspection_done === undefined
      ? (requiresInspection ? normalizeBoolean(current.inspection_done) : false)
      : (requiresInspection ? normalizeBoolean(body.inspection_done) : false),
    version: nextVersion,
    updated_at: nowIso(),
  }
}

function validateMaterialPayload(record: ReturnType<typeof normalizeCreatePayload> | ReturnType<typeof normalizeUpdatePayload>) {
  if (!record.material_name) return 'material_name is required'
  if (!record.expected_arrival_date) return 'expected_arrival_date is required'
  return ''
}

function buildMaterialRecordFallback(
  current: Record<string, any>,
  updates: ReturnType<typeof normalizeUpdatePayload>,
): ProjectMaterialRecord {
  return {
    id: normalizeText(current.id),
    project_id: normalizeText(current.project_id),
    participant_unit_id: updates.participant_unit_id,
    participant_unit_name: normalizeNullableText(current.participant_unit_name),
    material_name: updates.material_name,
    specialty_type: updates.specialty_type,
    requires_sample_confirmation: updates.requires_sample_confirmation,
    sample_confirmed: updates.sample_confirmed,
    expected_arrival_date: updates.expected_arrival_date,
    actual_arrival_date: updates.actual_arrival_date,
    requires_inspection: updates.requires_inspection,
    inspection_done: updates.inspection_done,
    linked_task_id: normalizeNullableText(current.linked_task_id),
    linked_task_title: normalizeNullableText(current.linked_task_title),
    linked_task_start_date: normalizeNullableText(current.linked_task_start_date),
    linked_task_status: normalizeNullableText(current.linked_task_status),
    linked_task_buffer_days: current.linked_task_buffer_days == null ? null : Number(current.linked_task_buffer_days),
    version: Number(updates.version ?? current.version ?? 1) || 1,
    created_at: normalizeText(current.created_at) || nowIso(),
    updated_at: normalizeText(updates.updated_at ?? current.updated_at) || nowIso(),
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)
    }),
  ])
}

function normalizeLogValue(value: unknown) {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

function collectMaterialChangeLogs(
  current: Record<string, any>,
  updates: ReturnType<typeof normalizeUpdatePayload>,
  projectId: string,
  materialId: string,
  changedBy?: string,
  changeReason?: string | null,
) {
  const trackedFields: Array<[fieldName: string, currentValue: unknown, nextValue: unknown]> = [
    ['participant_unit_id', current.participant_unit_id ?? null, updates.participant_unit_id ?? null],
    ['material_name', current.material_name ?? '', updates.material_name ?? ''],
    ['specialty_type', current.specialty_type ?? null, updates.specialty_type ?? null],
    ['requires_sample_confirmation', current.requires_sample_confirmation ?? false, updates.requires_sample_confirmation ?? false],
    ['sample_confirmed', current.sample_confirmed ?? false, updates.sample_confirmed ?? false],
    ['expected_arrival_date', current.expected_arrival_date ?? '', updates.expected_arrival_date ?? ''],
    ['actual_arrival_date', current.actual_arrival_date ?? null, updates.actual_arrival_date ?? null],
    ['requires_inspection', current.requires_inspection ?? false, updates.requires_inspection ?? false],
    ['inspection_done', current.inspection_done ?? false, updates.inspection_done ?? false],
  ]

  return trackedFields
    .filter(([, currentValue, nextValue]) => normalizeLogValue(currentValue) !== normalizeLogValue(nextValue))
    .map(([fieldName, currentValue, nextValue]) =>
      writeLog({
        project_id: projectId,
        entity_type: 'project_material',
        entity_id: materialId,
        field_name: fieldName,
        old_value: normalizeLogValue(currentValue),
        new_value: normalizeLogValue(nextValue),
        change_reason: changeReason ?? null,
        changed_by: changedBy ?? null,
      }),
    )
}

router.get('/', validate(projectIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const projectId = normalizeText(req.params.projectId)
  const access = await getAccess(projectId, req.user?.id, req.user?.globalRole)

  if (!access.canRead) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: '您没有权限访问此项目的材料清单' },
      timestamp: nowIso(),
    })
  }

  const data = await listProjectMaterials(projectId)
  res.json({ success: true, data, timestamp: nowIso() })
}))

router.get('/summary', validate(projectIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const projectId = normalizeText(req.params.projectId)
  const access = await getAccess(projectId, req.user?.id, req.user?.globalRole)

  if (!access.canRead) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: '您没有权限访问此项目的材料分析' },
      timestamp: nowIso(),
    })
  }

  const data = await buildMaterialReportSummary(projectId)
  res.json({ success: true, data, timestamp: nowIso() })
}))

router.post(
  '/',
  validate(projectIdParamSchema, 'params'),
  validate(materialCreateBodySchema),
  asyncHandler(async (req, res) => {
  const projectId = normalizeText(req.params.projectId)
  const access = await getAccess(projectId, req.user?.id, req.user?.globalRole)

  if (!access.canWrite) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: '您没有编辑此项目材料清单的权限' },
      timestamp: nowIso(),
    })
  }

  const rawBody = req.body ?? {}
  const items = Array.isArray(rawBody) ? rawBody : Array.isArray(rawBody.items) ? rawBody.items : [rawBody]
  if (items.length === 0) {
    return res.status(400).json(validationError('至少需要一条材料记录'))
  }

  const createdRows = []
  for (const item of items) {
    const record = normalizeCreatePayload(projectId, (item ?? {}) as MaterialMutationPayload)
    const message = validateMaterialPayload(record)
    if (message) {
      return res.status(400).json(validationError(message))
    }

    const created = await supabaseService.create<Record<string, unknown>>('project_materials', record)
    createdRows.push(created ?? record)
    await writeLifecycleLog({
      project_id: projectId,
      entity_type: 'project_material',
      entity_id: record.id,
      action: 'created',
      changed_by: req.user?.id ?? null,
      change_reason: normalizeNullableText((item as MaterialMutationPayload)?.change_reason) ?? '材料创建',
    })
  }

  const data = await listProjectMaterials(projectId)
  const createdIds = new Set(createdRows.map((row) => String((row as Record<string, unknown>).id ?? '')))
  const createdMaterials = data.filter((item) => createdIds.has(item.id))

  res.status(201).json({
    success: true,
    data: Array.isArray(rawBody) || Array.isArray(rawBody.items) ? createdMaterials : createdMaterials[0] ?? null,
    timestamp: nowIso(),
  })
}),
)

router.patch(
  '/:materialId',
  validate(materialIdParamSchema, 'params'),
  validate(materialMutationSchema),
  asyncHandler(async (req, res) => {
  const projectId = normalizeText(req.params.projectId)
  const materialId = normalizeText(req.params.materialId)
  const access = await getAccess(projectId, req.user?.id, req.user?.globalRole)

  if (!access.canWrite) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: '您没有编辑此项目材料清单的权限' },
      timestamp: nowIso(),
    })
  }

  const rows = await supabaseService.query<Record<string, any>>('project_materials', { id: materialId, project_id: projectId })
  const current = rows[0]
  if (!current) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Material not found' },
      timestamp: nowIso(),
    })
  }

  const updates = normalizeUpdatePayload(current, (req.body ?? {}) as MaterialMutationPayload)
  const message = validateMaterialPayload(updates)
  if (message) {
    return res.status(400).json(validationError(message))
  }

  await supabaseService.update<Record<string, unknown>>('project_materials', materialId, updates)
  const actualArrivalChanged = normalizeNullableText(current.actual_arrival_date) !== updates.actual_arrival_date
  if (actualArrivalChanged && updates.actual_arrival_date) {
    const participantUnitId = updates.participant_unit_id ?? normalizeNullableText(current.participant_unit_id)
    let responsibleUnitName = normalizeNullableText(current.participant_unit_name)

    if (!responsibleUnitName && participantUnitId) {
      const unitRows = await supabaseService.query<Record<string, any>>('participant_units', {
        id: participantUnitId,
        project_id: projectId,
      })
      responsibleUnitName = normalizeNullableText(unitRows[0]?.unit_name)
    }

    await autoSatisfyMaterialConditions({
      projectId,
      responsibleUnit: responsibleUnitName,
      satisfiedAt: updates.actual_arrival_date,
      confirmedBy: req.user?.id ?? null,
    })
  }

  void Promise.all(
    collectMaterialChangeLogs(
      current,
      updates,
      projectId,
      materialId,
      req.user?.id ?? null,
      normalizeNullableText((req.body as MaterialMutationPayload)?.change_reason) ?? null,
    ),
  ).catch(() => undefined)

  let responseData = buildMaterialRecordFallback(current, updates)
  try {
    const data = await withTimeout(listProjectMaterials(projectId), 5000)
    responseData = data.find((item) => item.id === materialId) ?? responseData
  } catch {
    responseData = buildMaterialRecordFallback(current, updates)
  }

  res.json({
    success: true,
    data: responseData,
    timestamp: nowIso(),
  })
}),
)

router.delete('/:materialId', validate(materialIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const projectId = normalizeText(req.params.projectId)
  const materialId = normalizeText(req.params.materialId)
  const access = await getAccess(projectId, req.user?.id, req.user?.globalRole)

  if (!access.canWrite) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: '您没有编辑此项目材料清单的权限' },
      timestamp: nowIso(),
    })
  }

  const rows = await supabaseService.query<Record<string, any>>('project_materials', { id: materialId, project_id: projectId })
  if (!rows[0]) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Material not found' },
      timestamp: nowIso(),
    })
  }

  await writeLifecycleLog({
    project_id: projectId,
    entity_type: 'project_material',
    entity_id: materialId,
    action: 'deleted',
    changed_by: req.user?.id ?? null,
    change_reason: '材料删除',
  })
  await supabaseService.delete('project_materials', materialId)
  res.json({ success: true, timestamp: nowIso() })
}))

export default router
