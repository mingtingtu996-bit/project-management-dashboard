// 施工图纸 API 路由
// 独立于前期证照（pre-milestones），施工图纸有独立的表和管理逻辑

import { Router } from 'express'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { ConstructionDrawing } from '../types/db.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()
router.use(authenticate)

// ─── 获取项目的所有施工图纸 ─────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string

  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  // 支持按类型和状态筛选
  const { drawing_type, status, review_status } = req.query
  let sql = 'SELECT * FROM construction_drawings WHERE project_id = ?'
  const params: any[] = [projectId]

  if (drawing_type) {
    sql += ' AND drawing_type = ?'
    params.push(drawing_type)
  }
  if (status) {
    sql += ' AND status = ?'
    params.push(status)
  }
  if (review_status) {
    sql += ' AND review_status = ?'
    params.push(review_status)
  }

  sql += ' ORDER BY sort_order ASC, created_at ASC'

  logger.info('Fetching construction drawings', { projectId, drawing_type, status })
  const data = await executeSQL(sql, params)

  const response: ApiResponse<ConstructionDrawing[]> = {
    success: true,
    data: data || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// ─── 获取图纸统计数据（放在 /:id 之前，避免路由冲突）───────────
// 注意：此路由挂载到 /api/construction-drawings 后，
// 访问路径为 GET /api/construction-drawings/project/:projectId/stats
router.get('/project/:projectId/stats', asyncHandler(async (req, res) => {
  const { projectId } = req.params
  logger.info('Fetching drawing stats', { projectId })

  const [total, byType, byStatus, byReviewStatus] = await Promise.all([
    executeSQLOne(
      'SELECT COUNT(*) as count FROM construction_drawings WHERE project_id = ?',
      [projectId]
    ),
    executeSQL(
      `SELECT drawing_type, COUNT(*) as count FROM construction_drawings
       WHERE project_id = ? GROUP BY drawing_type`,
      [projectId]
    ),
    executeSQL(
      `SELECT status, COUNT(*) as count FROM construction_drawings
       WHERE project_id = ? GROUP BY status`,
      [projectId]
    ),
    executeSQL(
      `SELECT review_status, COUNT(*) as count FROM construction_drawings
       WHERE project_id = ? GROUP BY review_status`,
      [projectId]
    ),
  ])

  const response: ApiResponse = {
    success: true,
    data: {
      total: total?.count || 0,
      by_type: byType || [],
      by_status: byStatus || [],
      by_review_status: byReviewStatus || [],
    },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// ─── 获取单张施工图纸 ───────────────────────────────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching construction drawing', { id })

  const data = await executeSQLOne(
    'SELECT * FROM construction_drawings WHERE id = ? LIMIT 1',
    [id]
  )

  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'DRAWING_NOT_FOUND', message: '施工图纸不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<ConstructionDrawing> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// ─── 创建施工图纸 ───────────────────────────────────────────────
router.post('/', asyncHandler(async (req, res) => {
  logger.info('Creating construction drawing', req.body)

  const required = ['project_id', 'drawing_name']
  for (const field of required) {
    if (!req.body[field]) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: `${field} 不能为空` },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }
  }

  const id = uuidv4()
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

  await executeSQL(
    `INSERT INTO construction_drawings
       (id, project_id, drawing_type, drawing_name, version, description,
        status, design_unit, design_person, drawing_date,
        review_unit, review_status, review_date, review_opinion, review_report_no,
        related_license_id, planned_submit_date, planned_pass_date,
        actual_submit_date, actual_pass_date,
        lead_unit, responsible_user_id, sort_order, notes, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.body.project_id,
      req.body.drawing_type ?? '建筑',
      req.body.drawing_name,
      req.body.version ?? '1.0',
      req.body.description ?? null,
      req.body.status ?? '编制中',
      req.body.design_unit ?? null,
      req.body.design_person ?? null,
      req.body.drawing_date ?? null,
      req.body.review_unit ?? null,
      req.body.review_status ?? '未提交',
      req.body.review_date ?? null,
      req.body.review_opinion ?? null,
      req.body.review_report_no ?? null,
      req.body.related_license_id ?? null,
      req.body.planned_submit_date ?? null,
      req.body.planned_pass_date ?? null,
      req.body.actual_submit_date ?? null,
      req.body.actual_pass_date ?? null,
      req.body.lead_unit ?? null,
      req.body.responsible_user_id ?? null,
      req.body.sort_order ?? 0,
      req.body.notes ?? null,
      (req.body.created_by || req.body.user_id) || null,
      ts,
      ts,
    ]
  )

  const data = await executeSQLOne(
    'SELECT * FROM construction_drawings WHERE id = ? LIMIT 1',
    [id]
  )

  const response: ApiResponse<ConstructionDrawing> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// ─── 更新施工图纸 ───────────────────────────────────────────────
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Updating construction drawing', { id })

  const current = await executeSQLOne(
    'SELECT * FROM construction_drawings WHERE id = ? LIMIT 1',
    [id]
  )

  if (!current) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'DRAWING_NOT_FOUND', message: '施工图纸不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const setClauses: string[] = ['updated_at = ?']
  const params: any[] = [ts]

  const fieldMap: Record<string, any> = {
    drawing_type: req.body.drawing_type,
    drawing_name: req.body.drawing_name,
    version: req.body.version,
    description: req.body.description,
    status: req.body.status,
    design_unit: req.body.design_unit,
    design_person: req.body.design_person,
    drawing_date: req.body.drawing_date,
    review_unit: req.body.review_unit,
    review_status: req.body.review_status,
    review_date: req.body.review_date,
    review_opinion: req.body.review_opinion,
    review_report_no: req.body.review_report_no,
    related_license_id: req.body.related_license_id,
    planned_submit_date: req.body.planned_submit_date,
    planned_pass_date: req.body.planned_pass_date,
    actual_submit_date: req.body.actual_submit_date,
    actual_pass_date: req.body.actual_pass_date,
    lead_unit: req.body.lead_unit,
    responsible_user_id: req.body.responsible_user_id,
    sort_order: req.body.sort_order,
    notes: req.body.notes,
  }

  for (const [col, val] of Object.entries(fieldMap)) {
    if (val !== undefined) {
      setClauses.push(`${col} = ?`)
      params.push(val)
    }
  }

  params.push(id)
  await executeSQL(
    `UPDATE construction_drawings SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  )

  const data = await executeSQLOne(
    'SELECT * FROM construction_drawings WHERE id = ? LIMIT 1',
    [id]
  )

  const response: ApiResponse<ConstructionDrawing> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// ─── 删除施工图纸 ───────────────────────────────────────────────
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting construction drawing', { id })

  await executeSQL('DELETE FROM construction_drawings WHERE id = ?', [id])

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
