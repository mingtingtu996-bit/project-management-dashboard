// 任务开工条件 API 路由

import { Router } from 'express'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectMember } from '../middleware/auth.js'
import { validate, conditionSchema, conditionUpdateSchema } from '../middleware/validation.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { TaskCondition } from '../types/db.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

const CONDITION_TYPE_BLUEPRINT = '\u56fe\u7eb8'
const CONDITION_TYPE_MATERIAL = '\u6750\u6599'
const CONDITION_TYPE_PERSONNEL = '\u4eba\u5458'
const CONDITION_TYPE_EQUIPMENT = '\u8bbe\u5907'
const CONDITION_TYPE_PROCEDURE = '\u624b\u7eed'
const CONDITION_TYPE_OTHER = '\u5176\u4ed6'

const CONDITION_TYPE_MAP: Record<string, string> = {
  material: CONDITION_TYPE_MATERIAL,
  personnel: CONDITION_TYPE_PERSONNEL,
  weather: CONDITION_TYPE_OTHER,
  'design-change': CONDITION_TYPE_OTHER,
  preceding: CONDITION_TYPE_OTHER,
  other: CONDITION_TYPE_OTHER,
  [CONDITION_TYPE_BLUEPRINT]: CONDITION_TYPE_BLUEPRINT,
  [CONDITION_TYPE_MATERIAL]: CONDITION_TYPE_MATERIAL,
  [CONDITION_TYPE_PERSONNEL]: CONDITION_TYPE_PERSONNEL,
  [CONDITION_TYPE_EQUIPMENT]: CONDITION_TYPE_EQUIPMENT,
  [CONDITION_TYPE_PROCEDURE]: CONDITION_TYPE_PROCEDURE,
  [CONDITION_TYPE_OTHER]: CONDITION_TYPE_OTHER,
}

function normalizeConditionType(value: unknown): string {
  if (typeof value !== 'string') return CONDITION_TYPE_OTHER
  return CONDITION_TYPE_MAP[value] || CONDITION_TYPE_OTHER
}

// 所有路由都需要认证
router.use(authenticate)

// 获取任务的所有开工条件（支持 taskId 和 projectId 两种查询方式）
router.get('/', asyncHandler(async (req, res) => {
  const taskId = req.query.taskId as string
  const projectId = req.query.projectId as string
  const limit = parseInt(req.query.limit as string) || 200
  const offset = parseInt(req.query.offset as string) || 0

  if (!taskId && !projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_ID', message: '任务ID或项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  let data: any[]
  if (taskId) {
    logger.info('Fetching task conditions by taskId', { taskId, limit, offset })
    data = await executeSQL(
      'SELECT * FROM task_conditions WHERE task_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
      [taskId, limit, offset]
    )
  } else {
    // 通过项目ID查询：两步查询避免 JOIN（executeSQL 正则只取第一个表名）
    logger.info('Fetching task conditions by projectId', { projectId, limit, offset })
    const tasks = await executeSQL(
      'SELECT id FROM tasks WHERE project_id = ?',
      [projectId]
    )
    const taskIds = (tasks || []).map((t: any) => t.id)
    if (taskIds.length === 0) {
      data = []
    } else {
      const placeholders = taskIds.map(() => '?').join(', ')
      data = await executeSQL(
        `SELECT * FROM task_conditions WHERE task_id IN (${placeholders}) ORDER BY created_at ASC LIMIT ? OFFSET ?`,
        [...taskIds, limit, offset]
      )
    }
  }

  const response: ApiResponse<TaskCondition[]> = {
    success: true,
    data: data || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// P0-2: 批量满足任务的所有未满足开工条件（任务进度首次 >0 时调用）
router.post('/batch-satisfy', asyncHandler(async (req, res) => {
  const { task_id } = req.body
  if (!task_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_TASK_ID', message: '任务ID不能为空' },
      timestamp: new Date().toISOString()
    })
  }

  // 批量更新该任务所有 is_satisfied=false 的条件
  const result = await executeSQL(
    'UPDATE task_conditions SET is_satisfied = 1 WHERE task_id = ? AND is_satisfied = 0',
    [task_id]
  )
  const count = (result as any)?.affectedRows ?? 0

  const response: ApiResponse<{ count: number }> = {
    success: true,
    data: { count },
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个开工条件
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching task condition', { id })

  const data = await executeSQLOne('SELECT * FROM task_conditions WHERE id = ? LIMIT 1', [id])

  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'CONDITION_NOT_FOUND', message: '开工条件不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<TaskCondition> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建开工条件
// P1修复：添加XSS防护验证
router.post('/', authenticate, requireProjectMember(req => req.body.project_id), validate(conditionSchema), asyncHandler(async (req, res) => {
  logger.info('Creating task condition', req.body)

  const id = uuidv4()
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

  // [G3]: 从 tasks 表获取 project_id（如果没有传入）
  let projectId = req.body.project_id
  if (!projectId) {
    const taskRows = await executeSQL('SELECT project_id FROM tasks WHERE id = ?', [req.body.task_id])
    projectId = taskRows?.[0]?.project_id ?? null
  }

  const conditionType = normalizeConditionType(req.body.condition_type)

  await executeSQL(
    `INSERT INTO task_conditions (id, task_id, project_id, condition_type, name, description, responsible_unit, target_date, is_satisfied, attachments, confirmed_by, confirmed_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.body.task_id, projectId, conditionType, req.body.condition_name ?? req.body.name ?? '', req.body.description ?? null, req.body.responsible_unit ?? null, req.body.target_date ?? null, req.body.is_satisfied ? true : false, req.body.attachments ? JSON.stringify(req.body.attachments) : '[]', req.body.confirmed_by ?? null, req.body.confirmed_at ?? null, req.user!.id, ts, ts]
  )

  const data = await executeSQLOne('SELECT * FROM task_conditions WHERE id = ? LIMIT 1', [id])

  const response: ApiResponse<TaskCondition> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// 更新开工条件
// P1修复：添加XSS防护验证
router.put('/:id', authenticate, requireProjectMember((async (req) => {
  const condition = await executeSQLOne(
    'SELECT project_id FROM task_conditions WHERE id = ? LIMIT 1',
    [req.params.id]
  )
  return condition?.project_id
}) as any), validate(conditionUpdateSchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Updating task condition', { id })

  // 如果标记为已满足，自动记录确认时间
  if (req.body.is_satisfied === true && !req.body.confirmed_at) {
    req.body.confirmed_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
  }

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const setClauses: string[] = ['updated_at = ?']
  const params: any[] = [ts]

  const fieldMap: Record<string, string> = {
    condition_name: 'name',
    name: 'name',
    condition_type: 'condition_type',
    description: 'description',
    target_date: 'target_date',
    is_satisfied: 'is_satisfied',
    attachments: 'attachments',
    confirmed_by: 'confirmed_by',
    confirmed_at: 'confirmed_at',
  }

  for (const [key, col] of Object.entries(fieldMap)) {
    if (req.body[key] !== undefined) {
      setClauses.push(`${col} = ?`)
      if (key === 'is_satisfied') {
        params.push(req.body[key] ? 1 : 0)
      } else if (key === 'condition_type') {
        params.push(normalizeConditionType(req.body[key]))
      } else {
        params.push(req.body[key])
      }
    }
  }

  params.push(id)
  await executeSQL(`UPDATE task_conditions SET ${setClauses.join(', ')} WHERE id = ?`, params)

  const data = await executeSQLOne('SELECT * FROM task_conditions WHERE id = ? LIMIT 1', [id])
  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'CONDITION_NOT_FOUND', message: '开工条件不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<TaskCondition> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 删除开工条件
router.delete('/:id', authenticate, requireProjectMember((async (req) => {
  const condition = await executeSQLOne(
    'SELECT project_id FROM task_conditions WHERE id = ? LIMIT 1',
    [req.params.id]
  )
  return condition?.project_id
}) as any), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting task condition', { id })

  await executeSQL('DELETE FROM task_conditions WHERE id = ?', [id])

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 完成开工条件（标记为"已确认"）
router.put('/:id/complete', authenticate, requireProjectMember((async (req) => {
  const condition = await executeSQLOne(
    'SELECT project_id FROM task_conditions WHERE id = ? LIMIT 1',
    [req.params.id]
  )
  return condition?.project_id
}) as any), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { confirmed_by } = req.body
  const userId = req.user?.id

  logger.info('Completing task condition', { id, confirmed_by })

  if (!confirmed_by && !userId) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'MISSING_CONFIRMED_BY',
        message: '必须指定确认人ID'
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  try {
    const { BusinessStatusService } = await import('../services/businessStatusService.js')

    // 1. 完成条件
    const condition = await BusinessStatusService.completeCondition({
      id,
      confirmed_by: confirmed_by || userId
    })

    // P1修复：条件完成后重新计算任务的业务状态
    const businessStatus = await BusinessStatusService.calculateBusinessStatus(condition.task_id)

    logger.info('Business status recalculated after condition completed', {
      taskId: condition.task_id,
      status: businessStatus.display,
      reason: businessStatus.reason
    })

    // 返回条件 + 业务状态
    const response: ApiResponse<{
      condition: TaskCondition
      businessStatus: any
    }> = {
      success: true,
      data: {
        condition,
        businessStatus
      },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (error: any) {
    logger.error('Failed to complete condition', { id, error })
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'COMPLETE_CONDITION_FAILED',
        message: error.message || '完成条件失败'
      },
      timestamp: new Date().toISOString(),
    }
    res.status(400).json(response)
  }
}))

// P2-9: 获取条件的所有前置任务（通过 junction 表）
router.get('/:id/preceding-tasks', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching preceding tasks for condition', { id })

  // 优先从 junction 表读取多对多关系（两步查询避免 JOIN 正则截断）
  const precedingRows = await executeSQL(
    'SELECT task_id FROM task_preceding_relations WHERE condition_id = ?',
    [id]
  ) as any[]
  const relations: any[] = []
  for (const row of precedingRows) {
    const task = await executeSQLOne(
      'SELECT id AS task_id, title, name, status, progress FROM tasks WHERE id = ?',
      [row.task_id]
    )
    if (task) relations.push(task)
  }

  // 兼容旧数据：如果 junction 表无数据，尝试从 task_conditions.preceding_task_id 读取
  if (relations.length === 0) {
    const condition = await executeSQLOne(
      'SELECT preceding_task_id FROM task_conditions WHERE id = ?',
      [id]
    ) as any
    if (condition?.preceding_task_id) {
      const legacyTask = await executeSQLOne(
        'SELECT id AS task_id, title, name, status, progress FROM tasks WHERE id = ?',
        [condition.preceding_task_id]
      )
      if (legacyTask) relations.push(legacyTask)
    }
  }

  const response: ApiResponse<any[]> = {
    success: true,
    data: relations || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// P2-9: 设置条件的前置任务（批量替换）
router.post('/:id/preceding-tasks', authenticate, requireProjectMember((async (req) => {
  const cond = await executeSQLOne('SELECT project_id FROM task_conditions WHERE id = ?', [req.params.id])
  return cond?.project_id
}) as any), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { preceding_task_ids } = req.body // string[]

  logger.info('Setting preceding tasks for condition', { id, preceding_task_ids })

  // 1. 兼容旧数据：如果旧字段有值，先写入 junction 表（迁一次）
  const existingCondition = await executeSQLOne(
    'SELECT preceding_task_id FROM task_conditions WHERE id = ?',
    [id]
  ) as any
  if (existingCondition?.preceding_task_id) {
    await executeSQL(
      `INSERT IGNORE INTO task_preceding_relations (id, condition_id, task_id)
       VALUES (?, ?, ?)`,
      [uuidv4(), id, existingCondition.preceding_task_id]
    )
    // 清空旧字段（避免双重来源）
    await executeSQL(
      'UPDATE task_conditions SET preceding_task_id = NULL WHERE id = ?',
      [id]
    )
  }

  // 2. 清空 junction 表中该条件的所有关系
  await executeSQL('DELETE FROM task_preceding_relations WHERE condition_id = ?', [id])

  // 3. 批量写入新的前置任务关系
  if (Array.isArray(preceding_task_ids) && preceding_task_ids.length > 0) {
    for (const taskId of preceding_task_ids) {
      await executeSQL(
        `INSERT INTO task_preceding_relations (id, condition_id, task_id)
         VALUES (?, ?, ?)`,
        [uuidv4(), id, taskId]
      )
    }
  }

  // 4. 返回更新后的前置任务列表（两步查询避免 JOIN 正则截断）
  const updatedRows = await executeSQL(
    'SELECT task_id FROM task_preceding_relations WHERE condition_id = ?',
    [id]
  ) as any[]
  const relations: any[] = []
  for (const row of updatedRows) {
    const task = await executeSQLOne(
      'SELECT id AS task_id, title, name, status, progress FROM tasks WHERE id = ?',
      [row.task_id]
    )
    if (task) relations.push(task)
  }

  const response: ApiResponse<any[]> = {
    success: true,
    data: relations || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// P2-9: 移除单条前置任务关系
router.delete('/:conditionId/preceding-tasks/:taskId', authenticate, requireProjectMember((async (req) => {
  const cond = await executeSQLOne('SELECT project_id FROM task_conditions WHERE id = ?', [req.params.conditionId])
  return cond?.project_id
}) as any), asyncHandler(async (req, res) => {
  const { conditionId, taskId } = req.params
  logger.info('Removing preceding task relation', { conditionId, taskId })

  await executeSQL(
    'DELETE FROM task_preceding_relations WHERE condition_id = ? AND task_id = ?',
    [conditionId, taskId]
  )

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
