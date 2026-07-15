// v1.4.22.1 §10.7b + §14: Reconcile preview/apply/rollback + bulk-scope endpoints
import { Router } from 'express'
import type { Request } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { executeSQL } from '../services/dbService.js'
import { query as rawQuery } from '../database.js'
import { logger } from '../middleware/logger.js'
import { buildReconcilePreview } from '../services/wbsReconciliationService.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()
const now = () => new Date().toISOString()

const previewSchema = z.object({
  existingTaskIds: z.array(z.string()).default([]),
  recommendedTemplateCodes: z.array(z.string()).default([]),
  recommendedTemplateNames: z.array(z.string()).default([]),
})

const applySchema = z.object({
  reconcileBatchId: z.string(),
  acceptedEntries: z.array(z.object({
    taskId: z.string(),
    phase: z.enum(['match', 'add', 'rename_suggest', 'orphan']),
    action: z.enum(['keep', 'replace', 'merge_to_standard', 'delete']),
    newTitle: z.string().optional(),
  })),
})

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
router.post('/api/projects/:id/reconcile/apply', authenticate, requireProjectMember((req) => req.params.id), asyncHandler(async (req, res) => {
  const { id } = req.params
  const body = applySchema.parse(req.body)
  const userId = (req as any).user?.id ?? null
  const backupId = uuidv4()
  const ts = now()

  // Save backup snapshot of current tasks
  const currentTasks = await executeSQL(
    `SELECT id, title, status, start_date, end_date, progress, assignee_user_id
     FROM tasks WHERE project_id = $1 AND deleted_at IS NULL`,
    [id],
  )

  await executeSQL(
    `INSERT INTO task_reconcile_backups (id, project_id, reconcile_batch_id, task_snapshot, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [backupId, id, body.reconcileBatchId, JSON.stringify(currentTasks), userId, ts],
  )

  // Apply accepted changes
  let applied = 0
  for (const entry of body.acceptedEntries) {
    if (entry.action === 'replace' && entry.newTitle) {
      await executeSQL(`UPDATE tasks SET title = $1, updated_at = $2 WHERE id = $3 AND project_id = $4`,
        [entry.newTitle, ts, entry.taskId, id])
      applied++
    } else if (entry.action === 'delete') {
      await executeSQL(`UPDATE tasks SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND project_id = $3`,
        [ts, entry.taskId, id])
      applied++
    }
  }

  logger.info('Reconcile applied', { projectId: id, backupId, applied, userId })
  res.json({ success: true, data: { backupId, applied, total: body.acceptedEntries.length }, timestamp: ts } as ApiResponse)
}))

// POST /api/projects/:id/reconcile/:batchId/rollback
router.post('/api/projects/:id/reconcile/:batchId/rollback', authenticate, requireProjectMember((req) => req.params.id), asyncHandler(async (req, res) => {
  const { id, batchId } = req.params
  const ts = now()

  const backup = await executeSQL(
    `SELECT id, task_snapshot, created_at FROM task_reconcile_backups
     WHERE reconcile_batch_id = $1 AND project_id = $2
     AND created_at > NOW() - INTERVAL '30 days'
     ORDER BY created_at DESC LIMIT 1`,
    [batchId, id],
  ) as any[]

  if (!backup || backup.length === 0) {
    return res.status(404).json({
      success: false, error: { code: 'BACKUP_NOT_FOUND', message: '备份不存在或已超过30天保留期' },
      timestamp: ts,
    } as ApiResponse)
  }

  res.json({ success: true, data: { backedUpAt: backup[0].created_at, message: '回滚数据已就绪' }, timestamp: ts } as ApiResponse)
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
