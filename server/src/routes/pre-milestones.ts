// 前期证照 API 路由

import { Router } from 'express'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { PreMilestone } from '../types/db.js'
import { ValidationService } from '../services/validationService.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()
router.use(authenticate)

// 获取项目的所有前期证照
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

  logger.info('Fetching pre-milestones', { projectId })

  const data = await executeSQL(
    'SELECT * FROM pre_milestones WHERE project_id = ? ORDER BY created_at ASC',
    [projectId]
  )

  const response: ApiResponse<PreMilestone[]> = {
    success: true,
    data: data || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个前期证照
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching pre-milestone', { id })

  const data = await executeSQLOne('SELECT * FROM pre_milestones WHERE id = ? LIMIT 1', [id])

  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PRE_MILESTONE_NOT_FOUND', message: '前期证照不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<PreMilestone> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建前期证照
router.post('/', asyncHandler(async (req, res) => {
  logger.info('Creating pre-milestone', req.body)

  // 验证数据
  const validation = ValidationService.validatePreMilestone(req.body)
  if (!validation.valid) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: validation.errors.join('; ')
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const id = uuidv4()
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

  await executeSQL(
    `INSERT INTO pre_milestones
       (id, project_id, milestone_type, milestone_name, status, document_no, issue_date,
        expiry_date, issuing_authority, description, phase_id, lead_unit, planned_start_date,
        planned_end_date, responsible_user_id, sort_order, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.body.project_id,
      req.body.milestone_type ?? null,
      req.body.milestone_name || req.body.name,
      req.body.status ?? '待申请',
      req.body.document_no ?? null,
      req.body.issue_date ?? null,
      req.body.expiry_date ?? null,
      req.body.issuing_authority ?? null,
      req.body.description ?? null,
      req.body.phase_id ?? null,
      req.body.lead_unit ?? null,
      req.body.planned_start_date ?? null,
      req.body.planned_end_date ?? null,
      req.body.responsible_user_id ?? null,
      req.body.sort_order ?? 0,
      (req.body.created_by || req.body.user_id) || null,  // 修复：确保 NULL 值不传空字符串
      ts,
      ts,
    ]
  )

  const data = await executeSQLOne('SELECT * FROM pre_milestones WHERE id = ? LIMIT 1', [id])

  const response: ApiResponse<PreMilestone> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// 更新前期证照
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Updating pre-milestone', { id })

  // 获取当前状态
  const current = await executeSQLOne(
    'SELECT * FROM pre_milestones WHERE id = ? LIMIT 1',
    [id]
  )

  if (!current) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PRE_MILESTONE_NOT_FOUND', message: '前期证照不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  // 如果更新状态，验证状态转换
  if (req.body.status && req.body.status !== current.status) {
    const statusValidation = ValidationService.validatePreMilestoneStatusUpdate(
      current.status,
      req.body.status,
      req.body.document_no,
      req.body.issue_date
    )
    if (!statusValidation.valid) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'STATUS_TRANSITION_ERROR',
          message: statusValidation.errors.join('; ')
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }
  }

  // 验证其他数据
  const validation = ValidationService.validatePreMilestone({
    ...current,
    ...req.body
  })
  if (!validation.valid) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: validation.errors.join('; ')
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const setClauses: string[] = ['updated_at = ?']
  const params: any[] = [ts]

  const fieldMap: Record<string, any> = {
    milestone_type: req.body.milestone_type,
    milestone_name: req.body.milestone_name || req.body.name,
    status: req.body.status,
    document_no: req.body.document_no,
    issue_date: req.body.issue_date,
    expiry_date: req.body.expiry_date,
    issuing_authority: req.body.issuing_authority,
    description: req.body.description,
    phase_id: req.body.phase_id,
    lead_unit: req.body.lead_unit,
    planned_start_date: req.body.planned_start_date,
    planned_end_date: req.body.planned_end_date,
    responsible_user_id: req.body.responsible_user_id,
    sort_order: req.body.sort_order,
  }

  for (const [col, val] of Object.entries(fieldMap)) {
    if (val !== undefined) {
      setClauses.push(`${col} = ?`)
      params.push(val)
    }
  }

  params.push(id)
  await executeSQL(`UPDATE pre_milestones SET ${setClauses.join(', ')} WHERE id = ?`, params)

  const data = await executeSQLOne('SELECT * FROM pre_milestones WHERE id = ? LIMIT 1', [id])

  const response: ApiResponse<PreMilestone> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 删除前期证照
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting pre-milestone', { id })

  await executeSQL('DELETE FROM pre_milestones WHERE id = ?', [id])

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 解锁施工阶段 - 当施工证完成后调用
router.put('/:id/unlock-construction', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { user_id } = req.body
  logger.info('Unlocking construction phase', { id, user_id })

  // 获取证照信息（两步查询避免 JOIN 正则截断）
  const milestone = await executeSQLOne(
    'SELECT * FROM pre_milestones WHERE id = ? LIMIT 1',
    [id]
  ) as any
  let projName: string | undefined
  if (milestone?.project_id) {
    const proj = await executeSQLOne('SELECT id, name FROM projects WHERE id = ? LIMIT 1', [milestone.project_id])
    projName = (proj as any)?.name
    if (proj) {
      milestone.proj_id = proj.id
      milestone.proj_name = proj.name
    }
  }

  if (!milestone) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PRE_MILESTONE_NOT_FOUND', message: '前期证照不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  // 验证是否为施工证类型
  if (milestone.milestone_type !== '施工证') {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVALID_MILESTONE_TYPE', message: '只有施工证才能解锁施工阶段' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  // 验证状态为已取得（数据库存储的是DB值，不是Display值）
  if (milestone.status !== '已取得') {
    const response: ApiResponse = {
      success: false,
      error: { code: 'INVALID_STATUS', message: '施工证必须已取得才能解锁施工阶段' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  // 更新项目阶段为施工中
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const unlockDate = new Date().toISOString().split('T')[0]
  await executeSQL(
    'UPDATE projects SET current_phase = ?, construction_unlock_date = ?, construction_unlock_by = ?, updated_at = ? WHERE id = ?',
    ['construction', unlockDate, user_id ?? null, ts, milestone.project_id]
  )

  const response: ApiResponse = {
    success: true,
    data: {
      project_id: milestone.project_id,
      current_phase: 'construction',
      message: '已成功解锁施工阶段'
    },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 生成默认WBS结构 - 从模板生成施工阶段WBS
router.post('/:id/generate-wbs', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { user_id } = req.body
  logger.info('Generating default WBS from pre-milestone', { id, user_id })

  // 获取证照信息 + 项目（两步查询避免 JOIN 正则截断）
  const milestone = await executeSQLOne(
    'SELECT * FROM pre_milestones WHERE id = ? LIMIT 1',
    [id]
  ) as any
  if (milestone?.project_id) {
    const proj = await executeSQLOne(
      'SELECT id, name, current_phase, default_wbs_generated FROM projects WHERE id = ? LIMIT 1',
      [milestone.project_id]
    ) as any
    if (proj) {
      milestone.proj_id = proj.id
      milestone.proj_name = proj.name
      milestone.current_phase = proj.current_phase
      milestone.default_wbs_generated = proj.default_wbs_generated
    }
  }

  if (!milestone) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'PRE_MILESTONE_NOT_FOUND', message: '前期证照不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  // 检查项目是否已生成过WBS
  if (milestone.default_wbs_generated) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'WBS_ALREADY_GENERATED', message: '该项目已生成过WBS结构' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  // 获取默认施工阶段WBS模板
  const template = await executeSQLOne(
    'SELECT * FROM wbs_templates WHERE is_construction_default = 1 LIMIT 1',
    []
  )

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

  if (!template) {
    // 如果没有默认模板，创建一个基本的WBS结构
    const defaultNodes = [
      { node_name: '地基与基础', level: 1, sort_order: 1 },
      { node_name: '主体结构', level: 1, sort_order: 2 },
      { node_name: '装饰装修', level: 1, sort_order: 3 },
      { node_name: '机电安装', level: 1, sort_order: 4 },
      { node_name: '竣工验收', level: 1, sort_order: 5 }
    ]

    // 为每个节点创建WBS结构
    for (const node of defaultNodes) {
      try {
        const nodeId = uuidv4()
        await executeSQL(
          `INSERT INTO wbs_structure (id, project_id, node_name, level, sort_order, status, wbs_code, wbs_path, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, '待开始', ?, ?, ?, ?)`,
          [
            nodeId,
            milestone.project_id,
            node.node_name,
            node.level,
            node.sort_order,
            `WBS-${node.sort_order.toString().padStart(3, '0')}`,
            node.sort_order.toString(),
            ts,
            ts,
          ]
        )
      } catch (e) {
        logger.warn('Failed to insert WBS node', { node, error: e })
      }
    }

    // 标记项目已生成WBS
    await executeSQL(
      'UPDATE projects SET default_wbs_generated = 1, updated_at = ? WHERE id = ?',
      [ts, milestone.project_id]
    )

    const response: ApiResponse = {
      success: true,
      data: {
        project_id: milestone.project_id,
        nodes_generated: defaultNodes.length,
        message: '已生成默认施工阶段WBS结构'
      },
      timestamp: new Date().toISOString(),
    }
    return res.json(response)
  }

  // 使用模板生成WBS
  let templateNodes: any[] = template.wbs_nodes || []
  if (typeof templateNodes === 'string') {
    try { templateNodes = JSON.parse(templateNodes) } catch { templateNodes = [] }
  }

  let nodesCreated = 0
  for (const node of templateNodes) {
    try {
      const nodeId = uuidv4()
      await executeSQL(
        `INSERT INTO wbs_structure (id, project_id, node_name, level, sort_order, status, description, wbs_code, wbs_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, '待开始', ?, ?, ?, ?, ?)`,
        [
          nodeId,
          milestone.project_id,
          node.node_name || node.name,
          node.level || 1,
          node.sort_order || nodesCreated + 1,
          node.description ?? null,
          node.wbs_code || `WBS-${(nodesCreated + 1).toString().padStart(3, '0')}`,
          node.wbs_path || (nodesCreated + 1).toString(),
          ts,
          ts,
        ]
      )
      nodesCreated++
    } catch (e) {
      logger.warn('Failed to insert WBS node from template', { node, error: e })
    }
  }

  // 标记项目已生成WBS
  await executeSQL(
    'UPDATE projects SET default_wbs_generated = 1, updated_at = ? WHERE id = ?',
    [ts, milestone.project_id]
  )

  const response: ApiResponse = {
    success: true,
    data: {
      project_id: milestone.project_id,
      nodes_generated: nodesCreated,
      template_name: template.template_name,
      message: '已根据模板生成施工阶段WBS结构'
    },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
