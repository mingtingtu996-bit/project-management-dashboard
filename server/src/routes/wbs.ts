// WBS 节点管理 API 路由

import { Router } from 'express'
import { z } from 'zod'
import {
  executeSQL,
  executeSQLOne,
  getTask,
} from '../services/dbService.js'
import { createTaskInMainChain, deleteTaskInMainChain, updateTaskInMainChain } from '../services/taskWriteChainService.js'
import {
  buildRetentionBlockedApiError,
  buildRetentionBlockedHttpStatus,
  executeRetention,
} from '../services/deletionRetentionGovernanceService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { getCurrentCompanyMembership, getProjectCompanyId, getVisibleProjectIds } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { validate } from '../middleware/validation.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()
router.use(authenticate)

const wbsListQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  project_id: z.string().trim().min(1).optional(),
}).passthrough()

const wbsIdParamSchema = z.object({
  id: z.string().trim().min(1),
})

const wbsCreateBodySchema = z.object({
  project_id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().optional().nullable(),
  wbs_level: z.coerce.number().int().min(0),
  parent_id: z.string().trim().optional().nullable(),
  priority: z.string().trim().optional().nullable(),
  start_date: z.string().trim().optional().nullable(),
  end_date: z.string().trim().optional().nullable(),
}).passthrough()

const wbsUpdateBodySchema = z.object({
  version: z.coerce.number().int().min(1).optional(),
  title: z.string().trim().optional(),
  description: z.string().optional().nullable(),
  status: z.string().trim().optional(),
  priority: z.string().trim().optional(),
  wbs_level: z.coerce.number().int().min(0).optional(),
  parent_id: z.string().trim().optional().nullable(),
  start_date: z.string().trim().optional().nullable(),
  end_date: z.string().trim().optional().nullable(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  assignee: z.string().trim().optional().nullable(),
  participant_unit_id: z.string().trim().optional().nullable(),
  sort_order: z.coerce.number().int().optional(),
  is_milestone: z.boolean().optional(),
}).passthrough()

const wbsTemplatesQuerySchema = z.object({
  type: z.string().trim().optional(),
}).passthrough()

const wbsTemplateCreateBodySchema = z.object({
  project_id: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  template_name: z.string().trim().min(1),
  template_type: z.string().trim().min(1),
  description: z.string().optional().nullable(),
  wbs_nodes: z.unknown(),
  is_default: z.boolean().optional(),
  created_by: z.string().trim().optional().nullable(),
}).passthrough()

const SYSTEM_WBS_TEMPLATE_SCOPES = new Set(['national', 'global', 'system', 'system_seed', 'global_dictionary'])

type WbsTemplateRow = Record<string, any> & {
  id?: string | null
  created_at?: string | null
}

function isAutoPhysicalRetention(retention: Record<string, any>) {
  return (
    retention.requestedAllowed === true &&
    retention.resolvedAllowed === true &&
    retention.executionMode === 'auto_execute' &&
    retention.resolvedAction === 'physical_delete'
  )
}

function buildWbsDeleteRetentionMessage(retention: Record<string, any>) {
  if (typeof retention.reason === 'string' && retention.reason.trim()) {
    return retention.reason.trim()
  }
  if (retention.executionMode === 'reject' || retention.resolvedAction === 'reject') {
    return '该 WBS 节点受删除保留规则保护，不能删除。'
  }
  return '该 WBS 节点仍有关联或历史记录，需要保留处置确认，不能在普通删除中直接物理删除。'
}

async function getVisibleTemplateContext(req: any) {
  const visibleProjectIds = req.user?.id
    ? await getVisibleProjectIds(req.user.id, req.user.globalRole, getRequestCompanyId(req))
    : []
  const membership = req.user?.id
    ? await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
    : null
  const currentCompanyId = String(membership?.companyId ?? '').trim()

  return { currentCompanyId, visibleProjectIds }
}

async function loadAllWbsTemplates(templateType?: string): Promise<WbsTemplateRow[]> {
  if (templateType) {
    return executeSQL<WbsTemplateRow>(
      'SELECT * FROM wbs_templates WHERE template_type = ? ORDER BY created_at DESC',
      [templateType],
    )
  }
  return executeSQL<WbsTemplateRow>('SELECT * FROM wbs_templates ORDER BY created_at DESC', [])
}

async function loadSystemCatalogScopeTemplates(templateType?: string): Promise<WbsTemplateRow[]> {
  const scopeValues = Array.from(SYSTEM_WBS_TEMPLATE_SCOPES)
  if (templateType) {
    return executeSQL<WbsTemplateRow>(
      'SELECT * FROM wbs_templates WHERE project_id IS NULL AND company_id IS NULL AND catalog_scope IN (?, ?, ?, ?, ?) AND template_type = ? ORDER BY created_at DESC',
      [...scopeValues, templateType],
    )
  }
  return executeSQL<WbsTemplateRow>(
    'SELECT * FROM wbs_templates WHERE project_id IS NULL AND company_id IS NULL AND catalog_scope IN (?, ?, ?, ?, ?) ORDER BY created_at DESC',
    scopeValues,
  )
}

async function loadSystemBuiltinTemplates(templateType?: string): Promise<WbsTemplateRow[]> {
  if (templateType) {
    return executeSQL<WbsTemplateRow>(
      'SELECT * FROM wbs_templates WHERE project_id IS NULL AND company_id IS NULL AND is_builtin = ? AND template_type = ? ORDER BY created_at DESC',
      [true, templateType],
    )
  }
  return executeSQL<WbsTemplateRow>(
    'SELECT * FROM wbs_templates WHERE project_id IS NULL AND company_id IS NULL AND is_builtin = ? ORDER BY created_at DESC',
    [true],
  )
}

async function loadSystemStandardCodeTemplates(templateType?: string): Promise<WbsTemplateRow[]> {
  if (templateType) {
    return executeSQL<WbsTemplateRow>(
      'SELECT * FROM wbs_templates WHERE project_id IS NULL AND company_id IS NULL AND standard_catalog_code IS NOT NULL AND template_type = ? ORDER BY created_at DESC',
      [templateType],
    )
  }
  return executeSQL<WbsTemplateRow>(
    'SELECT * FROM wbs_templates WHERE project_id IS NULL AND company_id IS NULL AND standard_catalog_code IS NOT NULL ORDER BY created_at DESC',
    [],
  )
}

async function loadCompanyTemplates(companyId: string, templateType?: string): Promise<WbsTemplateRow[]> {
  if (templateType) {
    return executeSQL<WbsTemplateRow>(
      'SELECT * FROM wbs_templates WHERE project_id IS NULL AND company_id = ? AND template_type = ? ORDER BY created_at DESC',
      [companyId, templateType],
    )
  }
  return executeSQL<WbsTemplateRow>(
    'SELECT * FROM wbs_templates WHERE project_id IS NULL AND company_id = ? ORDER BY created_at DESC',
    [companyId],
  )
}

async function loadProjectTemplates(projectId: string, templateType?: string): Promise<WbsTemplateRow[]> {
  if (templateType) {
    return executeSQL<WbsTemplateRow>(
      'SELECT * FROM wbs_templates WHERE project_id = ? AND template_type = ? ORDER BY created_at DESC',
      [projectId, templateType],
    )
  }
  return executeSQL<WbsTemplateRow>(
    'SELECT * FROM wbs_templates WHERE project_id = ? ORDER BY created_at DESC',
    [projectId],
  )
}

function mergeVisibleTemplates(templateGroups: WbsTemplateRow[][]) {
  const seen = new Set<string>()
  const rows: WbsTemplateRow[] = []

  for (const group of templateGroups) {
    for (const row of group) {
      const id = String(row?.id ?? '').trim()
      const dedupeKey = id || JSON.stringify(row)
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      rows.push(row)
    }
  }

  return rows.sort((left, right) => {
    const leftTime = Date.parse(String(left.created_at ?? '')) || 0
    const rightTime = Date.parse(String(right.created_at ?? '')) || 0
    return rightTime - leftTime
  })
}

async function loadVisibleWbsTemplates(req: any, templateType?: string) {
  const { currentCompanyId, visibleProjectIds } = await getVisibleTemplateContext(req)
  if (visibleProjectIds === null) {
    return loadAllWbsTemplates(templateType)
  }

  const groups = await Promise.all([
    loadSystemCatalogScopeTemplates(templateType),
    loadSystemBuiltinTemplates(templateType),
    loadSystemStandardCodeTemplates(templateType),
    ...(currentCompanyId ? [loadCompanyTemplates(currentCompanyId, templateType)] : []),
    ...visibleProjectIds.map((projectId) => loadProjectTemplates(projectId, templateType)),
  ])

  return mergeVisibleTemplates(groups)
}


// GET /api/wbs-nodes?projectId= - fetch project WBS nodes
router.get(
  '/',
  validate(wbsListQuerySchema, 'query'),
  requireProjectMember((req) => String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined),
  asyncHandler(async (req, res) => {
    const projectId = String(req.query.projectId ?? req.query.project_id ?? '').trim() || undefined
    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'projectId is required' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    logger.info('Fetching WBS nodes', { projectId })

    const tasks: any[] = await executeSQL(
      'SELECT * FROM tasks WHERE project_id = ? AND wbs_level IS NOT NULL ORDER BY wbs_level ASC, sort_order ASC',
      [projectId],
    )

    const response: ApiResponse<typeof tasks> = {
      success: true,
      data: tasks,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

// POST /api/wbs-nodes - create a WBS node backed by a task
router.post(
  '/',
  validate(wbsCreateBodySchema),
  requireProjectEditor((req) => (typeof req.body?.project_id === 'string' ? req.body.project_id : undefined)),
  asyncHandler(async (req, res) => {
    logger.info('Creating WBS node', req.body)

    const {
      project_id,
      title,
      description,
      wbs_level,
      parent_id,
      priority,
      start_date,
      end_date,
      engineering_object_id,
      phase_object_id,
      section_object_id,
      building_object_id,
      basement_object_id,
      floor_object_id,
      physical_zone_object_id,
      functional_area_object_id,
      engineering_category_id,
      wbs_node_type,
    } = req.body

    if (!project_id || !title || wbs_level === undefined) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'project_id, title, wbs_level are required' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const normalizedWbsNodeType = typeof wbs_node_type === 'string' ? wbs_node_type.trim() : ''
    const isStructureNode = ['division', 'sub_division', 'item_work'].includes(normalizedWbsNodeType)

    const { task } = await createTaskInMainChain({
      id: uuidv4(),
      project_id,
      title,
      description: description || null,
      status: 'pending',
      priority: priority || 'medium',
      ...(isStructureNode ? {} : { progress: 0 }),
      wbs_level,
      parent_id: parent_id || null,
      start_date: start_date || null,
      end_date: end_date || null,
      planned_start_date: start_date || null,
      planned_end_date: end_date || null,
      engineering_object_id: engineering_object_id || null,
      phase_object_id: phase_object_id || null,
      section_object_id: section_object_id || null,
      building_object_id: building_object_id || null,
      basement_object_id: basement_object_id || null,
      floor_object_id: floor_object_id || null,
      physical_zone_object_id: physical_zone_object_id || null,
      functional_area_object_id: functional_area_object_id || null,
      engineering_category_id: engineering_category_id || null,
      wbs_node_type: wbs_node_type || null,
      created_by: req.user?.id ?? null,
    } as any)

    const response: ApiResponse<typeof task> = {
      success: true,
      data: task,
      timestamp: new Date().toISOString(),
    }
    res.status(201).json(response)
  }),
)

// PUT /api/wbs-nodes/:id - update a WBS node
router.put(
  '/:id',
  validate(wbsIdParamSchema, 'params'),
  validate(wbsUpdateBodySchema),
  requireProjectEditor(async (req) => {
    const existing = await getTask(req.params.id)
    return existing?.project_id ?? undefined
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { version, ...updates } = req.body

    logger.info('Updating WBS node', { id, updates })

    const existing: any = await getTask(id)
    if (!existing) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'WBS node not found' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }

    if (version !== undefined && existing.version !== version) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VERSION_MISMATCH', message: 'Data has changed, please refresh and try again' },
        timestamp: new Date().toISOString(),
      }
      return res.status(409).json(response)
    }

    const ALLOWED_WBS_FIELDS = new Set([
      'title', 'description', 'status', 'priority',
      'wbs_level', 'parent_id', 'start_date', 'end_date',
      'progress', 'assignee', 'participant_unit_id', 'sort_order', 'is_milestone',
      'engineering_object_id', 'phase_object_id', 'section_object_id',
      'building_object_id', 'basement_object_id', 'floor_object_id',
      'physical_zone_object_id', 'functional_area_object_id',
      'engineering_category_id', 'wbs_node_type', 'standard_work_code', 'standard_work_name',
    ])
    const safeUpdates = Object.fromEntries(
      Object.entries(updates).filter(([k]) => ALLOWED_WBS_FIELDS.has(k)),
    )
    const task = Object.keys(safeUpdates).length > 0
      ? (await updateTaskInMainChain(id, { ...safeUpdates, updated_by: req.user?.id ?? null } as any, version))?.task
      : await getTask(id)

    const response: ApiResponse<typeof task> = {
      success: true,
      data: task,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)

// DELETE /api/wbs-nodes/:id - delete a WBS node
router.delete(
  '/:id',
  validate(wbsIdParamSchema, 'params'),
  requireProjectEditor(async (req) => {
    const existing = await getTask(req.params.id)
    return existing?.project_id ?? undefined
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params
    logger.info('Deleting WBS node', { id })

    const existing: any = await getTask(id)
    if (!existing) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'WBS node not found' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }

    const retention = await executeRetention({
      projectId: existing.project_id,
      entityType: 'task',
      entityId: id,
      entityNameSnapshot: existing.title ?? existing.name ?? null,
      userAction: 'delete',
      actorId: req.user?.id ?? null,
      source: 'wbs_node_api_delete',
    } as any)

    if (!isAutoPhysicalRetention(retention as any)) {
      const message = buildWbsDeleteRetentionMessage(retention as any)
      const response: ApiResponse = {
        success: false,
        error: buildRetentionBlockedApiError(message, retention as any, {
          details: {
            ...(retention as any),
            entityType: 'task',
            entityId: id,
          },
        }) as any,
        timestamp: new Date().toISOString(),
      }
      return res.status(buildRetentionBlockedHttpStatus(retention as any)).json(response)
    }

    const deleted = await deleteTaskInMainChain(id, String(existing.project_id), req.user?.id ?? null)
    if (!deleted) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: 'WBS node not found' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }

    const response: ApiResponse = {
      success: true,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  }),
)
// GET /api/wbs-nodes/templates - 获取 WBS 模板列表
router.get('/templates', validate(wbsTemplatesQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const templateType = req.query.type as string | undefined
  logger.info('Fetching WBS templates', { templateType })

  const templates = await loadVisibleWbsTemplates(req, templateType)

  const response: ApiResponse<any[]> = {
    success: true,
    data: templates,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// POST /api/wbs-nodes/templates - 创建 WBS 模板
router.post(
  '/templates',
  validate(wbsTemplateCreateBodySchema),
  requireProjectEditor((req) => String(req.body?.project_id ?? req.body?.projectId ?? '').trim() || undefined),
  asyncHandler(async (req, res) => {
  logger.info('Creating WBS template', req.body)

  const { template_name, template_type, description, wbs_nodes, is_default } = req.body
  const projectId = String(req.body?.project_id ?? req.body?.projectId ?? '').trim()
  const companyId = await getProjectCompanyId(projectId)

  if (!template_name || !template_type || !wbs_nodes) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'template_name, template_type, wbs_nodes are required' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const id = uuidv4()
  const now = new Date().toISOString()

  await executeSQL(
    `INSERT INTO wbs_templates (id, company_id, project_id, template_name, template_type, description, wbs_nodes, is_default, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, companyId, projectId, template_name, template_type, description || null, JSON.stringify(wbs_nodes), is_default || false,
     req.body.created_by || null, now, now]
  )

  const data = await executeSQLOne('SELECT * FROM wbs_templates WHERE id = ? AND project_id = ?', [id, projectId])

  const response: ApiResponse<typeof data> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

export default router
