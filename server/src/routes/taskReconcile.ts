// v1.4.22.1 §10.7b + §14: Reconcile preview/apply/rollback + bulk-scope endpoints
import { Router } from 'express'
import type { Request } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { query as rawQuery, withDatabaseTransaction } from '../database.js'
import { logger } from '../middleware/logger.js'
import { buildReconcilePreview } from '../services/wbsReconciliationService.js'
import { updateTaskInMainChain } from '../services/taskWriteChainService.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()
const now = () => new Date().toISOString()

const previewSchema = z.object({
  existingTaskIds: z.array(z.string()).default([]),
  recommendedTemplateCodes: z.array(z.string()).default([]),
  recommendedTemplateNames: z.array(z.string()).default([]),
})

const applySchema = z.object({
  reconcileBatchId: z.string().trim().min(1).max(200),
  acceptedEntries: z.array(z.object({
    taskId: z.string().trim().min(1),
    phase: z.enum(['match', 'add', 'rename_suggest', 'orphan']),
    action: z.enum(['keep', 'replace', 'merge_to_standard', 'delete']),
    newTitle: z.string().trim().min(1).max(500).optional(),
  }).superRefine((entry, context) => {
    if ((entry.action === 'replace' || entry.action === 'merge_to_standard') && !entry.newTitle) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['newTitle'],
        message: 'replace and merge_to_standard actions require newTitle',
      })
    }
  })).min(1).max(500),
}).superRefine((body, context) => {
  const taskIds = body.acceptedEntries.map((entry) => entry.taskId)
  if (new Set(taskIds).size !== taskIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['acceptedEntries'],
      message: 'acceptedEntries cannot contain duplicate taskId values',
    })
  }
})

type ReconcileTaskSnapshot = {
  id: string
  title?: string | null
  deleted_at?: string | null
  status?: string | null
  start_date?: string | null
  end_date?: string | null
  progress?: number | null
  assignee_user_id?: string | null
}

type ReconcileDependencySnapshot = {
  id: string
  status: string
  metadata: Record<string, unknown>
}

type ReconcileBackupPayload = {
  schemaVersion: 2
  tasks: ReconcileTaskSnapshot[]
  dependencies: ReconcileDependencySnapshot[]
}

function createReconcileError(code: string, message: string, statusCode = 409) {
  return Object.assign(new Error(message), { code, statusCode })
}

function parseBackupPayload(value: unknown): ReconcileBackupPayload {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw createReconcileError('RECONCILE_BACKUP_INVALID', '对账备份内容无法解析', 422)
    }
  }

  if (Array.isArray(parsed)) {
    return {
      schemaVersion: 2,
      tasks: parsed as ReconcileTaskSnapshot[],
      dependencies: [],
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw createReconcileError('RECONCILE_BACKUP_INVALID', '对账备份内容无效', 422)
  }

  const record = parsed as Record<string, unknown>
  const tasks = Array.isArray(record.tasks) ? record.tasks as ReconcileTaskSnapshot[] : []
  const dependencies = Array.isArray(record.dependencies)
    ? record.dependencies as ReconcileDependencySnapshot[]
    : []
  if (tasks.length === 0) {
    throw createReconcileError('RECONCILE_BACKUP_EMPTY', '对账备份没有可恢复任务', 422)
  }

  return { schemaVersion: 2, tasks, dependencies }
}

function buildTaskRestorePatch(task: ReconcileTaskSnapshot, actorId: string | null) {
  const patch: Record<string, unknown> = {
    title: task.title ?? null,
    deleted_at: task.deleted_at ?? null,
    updated_by: actorId,
  }
  const optionalFields: Array<keyof ReconcileTaskSnapshot> = [
    'status',
    'start_date',
    'end_date',
    'progress',
    'assignee_user_id',
  ]
  for (const field of optionalFields) {
    if (Object.prototype.hasOwnProperty.call(task, field)) patch[field] = task[field] ?? null
  }
  return patch
}

const bulkScopeSchema = z.object({
  taskIds: z.array(z.string()).min(1).max(500),
  buildingObjectId: z.string().optional(),
  basementObjectId: z.string().optional(),
  floorObjectId: z.string().optional(),
  physicalZoneObjectId: z.string().optional(),
  functionalAreaObjectId: z.string().optional(),
})

type BulkScopePatchBody = z.infer<typeof bulkScopeSchema>

const bulkScopeProjectLookupSchema = bulkScopeSchema.pick({ taskIds: true })

function hasBulkScopeField(body: BulkScopePatchBody) {
  return body.buildingObjectId !== undefined
    || body.basementObjectId !== undefined
    || body.floorObjectId !== undefined
    || body.physicalZoneObjectId !== undefined
    || body.functionalAreaObjectId !== undefined
}

function buildBulkScopePatchRows(body: BulkScopePatchBody) {
  return body.taskIds.map((taskId) => ({
    task_id: taskId,
    building_object_id: body.buildingObjectId || null,
    building_object_id_present: body.buildingObjectId !== undefined,
    basement_object_id: body.basementObjectId || null,
    basement_object_id_present: body.basementObjectId !== undefined,
    floor_object_id: body.floorObjectId || null,
    floor_object_id_present: body.floorObjectId !== undefined,
    physical_zone_object_id: body.physicalZoneObjectId || null,
    physical_zone_object_id_present: body.physicalZoneObjectId !== undefined,
    functional_area_object_id: body.functionalAreaObjectId || null,
    functional_area_object_id_present: body.functionalAreaObjectId !== undefined,
  }))
}

async function resolveBulkScopeProjectId(req: Request) {
  const parsed = bulkScopeProjectLookupSchema.safeParse(req.body)
  if (!parsed.success) {
    return undefined
  }

  const result = await rawQuery(
    `SELECT DISTINCT project_id::text AS project_id
       FROM public.tasks
      WHERE id = ANY($1::text[])
        AND deleted_at IS NULL`,
    [parsed.data.taskIds],
  )
  const projectIds = (result.rows ?? [])
    .map((row) => String(row.project_id ?? '').trim())
    .filter(Boolean)

  if (projectIds.length !== 1) {
    return undefined
  }

  const projectId = projectIds[0]
  ;(req as any).bulkScopeProjectId = projectId
  return projectId
}

async function applyBulkScopePatch(body: BulkScopePatchBody, updatedAt: string, projectId: string) {
  await rawQuery(
    `WITH patch AS (
       SELECT *
       FROM jsonb_to_recordset($1::jsonb) AS p(
         task_id text,
         building_object_id text,
         building_object_id_present boolean,
         basement_object_id text,
         basement_object_id_present boolean,
         floor_object_id text,
         floor_object_id_present boolean,
         physical_zone_object_id text,
         physical_zone_object_id_present boolean,
         functional_area_object_id text,
         functional_area_object_id_present boolean
       )
     )
     UPDATE tasks AS t
        SET building_object_id = CASE WHEN patch.building_object_id_present THEN patch.building_object_id ELSE t.building_object_id END,
            basement_object_id = CASE WHEN patch.basement_object_id_present THEN patch.basement_object_id ELSE t.basement_object_id END,
            floor_object_id = CASE WHEN patch.floor_object_id_present THEN patch.floor_object_id ELSE t.floor_object_id END,
            physical_zone_object_id = CASE WHEN patch.physical_zone_object_id_present THEN patch.physical_zone_object_id ELSE t.physical_zone_object_id END,
            functional_area_object_id = CASE WHEN patch.functional_area_object_id_present THEN patch.functional_area_object_id ELSE t.functional_area_object_id END,
            updated_at = $2
       FROM patch
      WHERE t.id::text = patch.task_id
        AND t.project_id::text = $3`,
    [JSON.stringify(buildBulkScopePatchRows(body)), updatedAt, projectId],
  )
}

// POST /api/projects/:id/reconcile/preview
router.post('/api/projects/:id/reconcile/preview', authenticate, requireProjectMember((req) => req.params.id), asyncHandler(async (req, res) => {
  const body = previewSchema.parse(req.body)
  const ts = now()
  const result = buildReconcilePreview({
    projectId: req.params.id,
    existingTaskIds: body.existingTaskIds,
    recommendedTemplateCodes: body.recommendedTemplateCodes,
    recommendedTemplateNames: body.recommendedTemplateNames,
  })

  res.json({ success: true, data: result, timestamp: ts } as ApiResponse)
}))

// POST /api/projects/:id/reconcile/apply
router.post('/api/projects/:id/reconcile/apply', authenticate, requireProjectEditor((req) => req.params.id), asyncHandler(async (req, res) => {
  const { id } = req.params
  const body = applySchema.parse(req.body)
  const userId = (req as any).user?.id ?? null
  const backupId = uuidv4()
  const ts = now()

  const result = await withDatabaseTransaction(async () => {
    const actionableEntries = body.acceptedEntries.filter((entry) => entry.action !== 'keep')
    const taskIds = actionableEntries.map((entry) => entry.taskId)
    const deleteTaskIds = actionableEntries
      .filter((entry) => entry.action === 'delete')
      .map((entry) => entry.taskId)

    const taskResult = await rawQuery(
      `SELECT id::text AS id, title, deleted_at, version
         FROM public.tasks
        WHERE project_id::text = $1
          AND id::text = ANY($2::text[])
          AND deleted_at IS NULL
        FOR UPDATE`,
      [id, taskIds],
    )
    const currentTasks = (taskResult.rows ?? []) as ReconcileTaskSnapshot[]
    if (currentTasks.length !== taskIds.length) {
      throw createReconcileError(
        'RECONCILE_TASK_SCOPE_MISMATCH',
        '部分对账任务不存在、已删除或不属于当前项目，请刷新后重试',
      )
    }

    const dependencyResult = deleteTaskIds.length > 0
      ? await rawQuery(
        `SELECT id::text AS id, status, COALESCE(metadata, '{}'::jsonb) AS metadata
           FROM public.task_dependencies
          WHERE project_id::text = $1
            AND (
              task_id::text = ANY($2::text[])
              OR dependency_task_id::text = ANY($2::text[])
            )
          FOR UPDATE`,
        [id, deleteTaskIds],
      )
      : { rows: [] }
    const dependencies = (dependencyResult.rows ?? []) as ReconcileDependencySnapshot[]
    const backupPayload: ReconcileBackupPayload = {
      schemaVersion: 2,
      tasks: currentTasks,
      dependencies,
    }

    await rawQuery(
      `INSERT INTO public.task_reconcile_backups (
         id, project_id, reconcile_batch_id, task_snapshot, created_by, created_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [backupId, id, body.reconcileBatchId, JSON.stringify(backupPayload), userId, ts],
    )

    if (deleteTaskIds.length > 0) {
      await rawQuery(
        `UPDATE public.task_dependencies
            SET status = 'inactive',
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                  'reconcile_batch_id', $3::text,
                  'reconcile_deactivated_at', $4::text
                ),
                updated_at = $4::timestamptz
          WHERE project_id::text = $1
            AND status = 'active'
            AND (
              task_id::text = ANY($2::text[])
              OR dependency_task_id::text = ANY($2::text[])
            )`,
        [id, deleteTaskIds, body.reconcileBatchId, ts],
      )
    }

    let applied = 0
    for (const entry of actionableEntries) {
      const patch = entry.action === 'delete'
        ? { deleted_at: ts, updated_by: userId }
        : { title: entry.newTitle, updated_by: userId }
      const updated = await updateTaskInMainChain(entry.taskId, patch as any)
      if (!updated) {
        throw createReconcileError('RECONCILE_TASK_UPDATE_FAILED', `任务 ${entry.taskId} 更新失败`)
      }
      applied++
    }

    return { applied, dependencyCount: dependencies.length }
  })

  logger.info('Reconcile applied', {
    projectId: id,
    backupId,
    applied: result.applied,
    deactivatedDependencies: result.dependencyCount,
    userId,
  })
  res.json({
    success: true,
    data: {
      backupId,
      applied: result.applied,
      deactivatedDependencies: result.dependencyCount,
      total: body.acceptedEntries.length,
    },
    timestamp: ts,
  } as ApiResponse)
}))

// POST /api/projects/:id/reconcile/:batchId/rollback
router.post('/api/projects/:id/reconcile/:batchId/rollback', authenticate, requireProjectEditor((req) => req.params.id), asyncHandler(async (req, res) => {
  const { id, batchId } = req.params
  const userId = (req as any).user?.id ?? null
  const ts = now()

  const result = await withDatabaseTransaction(async () => {
    const backupResult = await rawQuery(
      `SELECT id::text AS id, task_snapshot, created_at, rolled_back_at, rollback_result
         FROM public.task_reconcile_backups
        WHERE reconcile_batch_id = $1
          AND project_id::text = $2
          AND created_at > NOW() - INTERVAL '30 days'
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [batchId, id],
    )
    const backup = backupResult.rows?.[0] as Record<string, unknown> | undefined
    if (!backup) return null

    if (backup.rolled_back_at) {
      const previousResult = backup.rollback_result && typeof backup.rollback_result === 'object'
        ? backup.rollback_result as Record<string, unknown>
        : {}
      return {
        backedUpAt: backup.created_at,
        alreadyRolledBack: true,
        restoredTasks: Number(previousResult.restoredTasks ?? 0),
        restoredDependencies: Number(previousResult.restoredDependencies ?? 0),
      }
    }

    const payload = parseBackupPayload(backup.task_snapshot)
    for (const task of payload.tasks) {
      const restored = await updateTaskInMainChain(
        String(task.id),
        buildTaskRestorePatch(task, userId) as any,
      )
      if (!restored) {
        throw createReconcileError(
          'RECONCILE_ROLLBACK_TASK_MISSING',
          `任务 ${String(task.id)} 已不存在，无法完成原子回滚`,
        )
      }
    }

    if (payload.dependencies.length > 0) {
      await rawQuery(
        `WITH restore AS (
           SELECT *
             FROM jsonb_to_recordset($1::jsonb) AS item(
               id text,
               status text,
               metadata jsonb
             )
         )
         UPDATE public.task_dependencies AS dependency
            SET status = restore.status,
                metadata = COALESCE(restore.metadata, '{}'::jsonb),
                updated_at = $2::timestamptz
           FROM restore
          WHERE dependency.id::text = restore.id
            AND dependency.project_id::text = $3`,
        [JSON.stringify(payload.dependencies), ts, id],
      )
    }

    const rollbackResult = {
      restoredTasks: payload.tasks.length,
      restoredDependencies: payload.dependencies.length,
    }
    await rawQuery(
      `UPDATE public.task_reconcile_backups
          SET rolled_back_at = $1,
              rolled_back_by = $2,
              rollback_result = $3::jsonb
        WHERE id::text = $4
          AND project_id::text = $5`,
      [ts, userId, JSON.stringify(rollbackResult), String(backup.id), id],
    )

    return {
      backedUpAt: backup.created_at,
      alreadyRolledBack: false,
      ...rollbackResult,
    }
  })

  if (!result) {
    return res.status(404).json({
      success: false,
      error: { code: 'BACKUP_NOT_FOUND', message: '备份不存在或已超过30天保留期' },
      timestamp: ts,
    } as ApiResponse)
  }

  logger.info('Reconcile rolled back', { projectId: id, batchId, userId, ...result })
  res.json({ success: true, data: result, timestamp: ts } as ApiResponse)
}))

// PATCH /api/tasks/bulk-scope
router.patch('/api/tasks/bulk-scope', authenticate, requireProjectEditor(async (req) => resolveBulkScopeProjectId(req)), asyncHandler(async (req, res) => {
  const body = bulkScopeSchema.parse(req.body)
  const projectId = (req as any).bulkScopeProjectId as string | undefined
  const userId = (req as any).user?.id ?? null
  const ts = now()

  if (!hasBulkScopeField(body)) {
    return res.status(400).json({ success: false, error: { code: 'NO_FIELDS', message: '至少指定一个空间字段' }, timestamp: ts } as ApiResponse)
  }

  if (!projectId) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '您没有编辑此项目的权限' }, timestamp: ts } as ApiResponse)
  }

  await applyBulkScopePatch(body, ts, projectId)

  logger.info('Bulk scope updated', { count: body.taskIds.length, projectId, userId })
  res.json({ success: true, data: { updated: body.taskIds.length }, timestamp: ts } as ApiResponse)
}))

export default router
