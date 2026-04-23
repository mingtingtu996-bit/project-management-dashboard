// WBS节点管理 API 路由

import { Router } from 'express'
import { z } from 'zod'
import {
  createTask,
  deleteTask,
  executeSQL,
  executeSQLOne,
  getTask,
  updateTask,
} from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
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
  assignee_unit: z.string().trim().optional().nullable(),
  sort_order: z.coerce.number().int().optional(),
  is_milestone: z.boolean().optional(),
}).passthrough()

const wbsTemplatesQuerySchema = z.object({
  type: z.string().trim().optional(),
}).passthrough()

const wbsTemplateCreateBodySchema = z.object({
  template_name: z.string().trim().min(1),
  template_type: z.string().trim().min(1),
  description: z.string().optional().nullable(),
  wbs_nodes: z.unknown(),
  is_default: z.boolean().optional(),
  created_by: z.string().trim().optional().nullable(),
}).passthrough()


// GET /api/wbs-nodes?projectId= - 获取项目的WBS节点树
router.get('/', validate(wbsListQuerySchema, 'query'), asyncHandler(async (req, res) => {
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

  // WBS节点通过task的wbs_level和parent_task_id关系构建树
  const tasks: any[] = await executeSQL(
    'SELECT * FROM tasks WHERE project_id = ? AND wbs_level IS NOT NULL ORDER BY wbs_level ASC, sort_order ASC',
    [projectId]
  )

  const response: ApiResponse<typeof tasks> = {
    success: true,
    data: tasks,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// POST /api/wbs-nodes - 创建WBS节点（实际是创建带wbs_level的task）
router.post('/', validate(wbsCreateBodySchema), asyncHandler(async (req, res) => {
  logger.info('Creating WBS node', req.body)

  const { project_id, title, description, wbs_level, parent_id, priority, start_date, end_date } = req.body

  if (!project_id || !title || wbs_level === undefined) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'project_id, title, wbs_level are required' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const task = await createTask({
    id: uuidv4(),
    project_id,
    title,
    description: description || null,
    status: 'pending',
    priority: priority || 'medium',
    progress: 0,
    wbs_level,
    parent_id: parent_id || null,
    start_date: start_date || null,
    end_date: end_date || null,
    planned_start_date: start_date || null,
    planned_end_date: end_date || null,
    created_by: req.user?.id ?? null,
  } as any)

  const response: ApiResponse<typeof task> = {
    success: true,
    data: task,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// PUT /api/wbs-nodes/:id - 更新WBS节点
router.put('/:id', validate(wbsIdParamSchema, 'params'), validate(wbsUpdateBodySchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { version, ...updates } = req.body

  logger.info('Updating WBS node', { id, updates })

  // 版本检查
  const existing: any = await getTask(id)
  if (!existing) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'NOT_FOUND', message: 'WBS节点不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  if (version !== undefined && existing.version !== version) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'VERSION_MISMATCH', message: '数据已被修改，请刷新后重试' },
      timestamp: new Date().toISOString(),
    }
    return res.status(409).json(response)
  }

  // 字段白名单防止 SQL 注入
  const ALLOWED_WBS_FIELDS = new Set([
    'title', 'description', 'status', 'priority',
    'wbs_level', 'parent_id', 'start_date', 'end_date',
    'progress', 'assignee', 'assignee_unit', 'sort_order', 'is_milestone'
  ])
  const safeUpdates = Object.fromEntries(
    Object.entries(updates).filter(([k]) => ALLOWED_WBS_FIELDS.has(k))
  )
  const task = Object.keys(safeUpdates).length > 0
    ? await updateTask(id, { ...safeUpdates, updated_by: req.user?.id ?? null } as any, version)
    : await getTask(id)

  const response: ApiResponse<typeof task> = {
    success: true,
    data: task,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// DELETE /api/wbs-nodes/:id - 删除WBS节点
router.delete('/:id', validate(wbsIdParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting WBS node', { id })

  await deleteTask(id)

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// GET /api/wbs-nodes/templates - 获取WBS模板列表
router.get('/templates', validate(wbsTemplatesQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const templateType = req.query.type as string | undefined
  logger.info('Fetching WBS templates', { templateType })

  let templates: any[]
  if (templateType) {
    templates = await executeSQL('SELECT * FROM wbs_templates WHERE template_type = ? ORDER BY created_at DESC', [templateType])
  } else {
    templates = await executeSQL('SELECT * FROM wbs_templates ORDER BY created_at DESC', [])
  }

  const response: ApiResponse<any[]> = {
    success: true,
    data: templates,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// POST /api/wbs-nodes/templates - 创建WBS模板
router.post('/templates', validate(wbsTemplateCreateBodySchema), asyncHandler(async (req, res) => {
  logger.info('Creating WBS template', req.body)

  const { template_name, template_type, description, wbs_nodes, is_default } = req.body

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
    `INSERT INTO wbs_templates (id, template_name, template_type, description, wbs_nodes, is_default, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, template_name, template_type, description || null, JSON.stringify(wbs_nodes), is_default || false,
     req.body.created_by || null, now, now]
  )

  const data = await executeSQLOne('SELECT * FROM wbs_templates WHERE id = ?', [id])

  const response: ApiResponse<typeof data> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

export default router
