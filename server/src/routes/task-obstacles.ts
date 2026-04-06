// 任务阻碍记录 API 路由

import { Router } from 'express'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate, requireProjectMember } from '../middleware/auth.js'
import { validate, obstacleSchema, obstacleUpdateSchema } from '../middleware/validation.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

const OBSTACLE_TYPE_PERSONNEL = '\u4eba\u5458'
const OBSTACLE_TYPE_MATERIAL = '\u6750\u6599'
const OBSTACLE_TYPE_EQUIPMENT = '\u8bbe\u5907'
const OBSTACLE_TYPE_ENVIRONMENT = '\u73af\u5883'
const OBSTACLE_TYPE_DESIGN = '\u8bbe\u8ba1'
const OBSTACLE_TYPE_PROCEDURE = '\u624b\u7eed'
const OBSTACLE_TYPE_FUNDS = '\u8d44\u91d1'
const OBSTACLE_TYPE_OTHER = '\u5176\u4ed6'

const OBSTACLE_STATUS_PENDING = '\u5f85\u5904\u7406'
const OBSTACLE_STATUS_PROCESSING = '\u5904\u7406\u4e2d'
const OBSTACLE_STATUS_RESOLVED = '\u5df2\u89e3\u51b3'
const OBSTACLE_STATUS_UNRESOLVABLE = '\u65e0\u6cd5\u89e3\u51b3'

const OBSTACLE_TYPE_MAP: Record<string, string> = {
  personnel: OBSTACLE_TYPE_PERSONNEL,
  material: OBSTACLE_TYPE_MATERIAL,
  equipment: OBSTACLE_TYPE_EQUIPMENT,
  environment: OBSTACLE_TYPE_ENVIRONMENT,
  design: OBSTACLE_TYPE_DESIGN,
  procedure: OBSTACLE_TYPE_PROCEDURE,
  funds: OBSTACLE_TYPE_FUNDS,
  other: OBSTACLE_TYPE_OTHER,
  [OBSTACLE_TYPE_PERSONNEL]: OBSTACLE_TYPE_PERSONNEL,
  [OBSTACLE_TYPE_MATERIAL]: OBSTACLE_TYPE_MATERIAL,
  [OBSTACLE_TYPE_EQUIPMENT]: OBSTACLE_TYPE_EQUIPMENT,
  [OBSTACLE_TYPE_ENVIRONMENT]: OBSTACLE_TYPE_ENVIRONMENT,
  [OBSTACLE_TYPE_DESIGN]: OBSTACLE_TYPE_DESIGN,
  [OBSTACLE_TYPE_PROCEDURE]: OBSTACLE_TYPE_PROCEDURE,
  [OBSTACLE_TYPE_FUNDS]: OBSTACLE_TYPE_FUNDS,
  [OBSTACLE_TYPE_OTHER]: OBSTACLE_TYPE_OTHER,
}

const OBSTACLE_STATUS_MAP: Record<string, string> = {
  pending: OBSTACLE_STATUS_PENDING,
  active: OBSTACLE_STATUS_PENDING,
  resolving: OBSTACLE_STATUS_PROCESSING,
  resolved: OBSTACLE_STATUS_RESOLVED,
  closed: OBSTACLE_STATUS_RESOLVED,
  blocked: OBSTACLE_STATUS_PENDING,
  [OBSTACLE_STATUS_PENDING]: OBSTACLE_STATUS_PENDING,
  [OBSTACLE_STATUS_PROCESSING]: OBSTACLE_STATUS_PROCESSING,
  [OBSTACLE_STATUS_RESOLVED]: OBSTACLE_STATUS_RESOLVED,
  [OBSTACLE_STATUS_UNRESOLVABLE]: OBSTACLE_STATUS_UNRESOLVABLE,
}

function normalizeObstacleType(value: unknown): string {
  if (typeof value !== 'string') return OBSTACLE_TYPE_OTHER
  return OBSTACLE_TYPE_MAP[value] || OBSTACLE_TYPE_OTHER
}

function normalizeObstacleStatus(value: unknown, isResolved?: unknown): string {
  if (typeof value === 'string' && OBSTACLE_STATUS_MAP[value]) {
    return OBSTACLE_STATUS_MAP[value]
  }
  return isResolved ? OBSTACLE_STATUS_RESOLVED : OBSTACLE_STATUS_PENDING
}

// 获取任务的所有阻碍记录（支持 taskId 和 projectId 两种查询方式）
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
    logger.info('Fetching task obstacles by taskId', { taskId, limit, offset })
    data = await executeSQL(
      'SELECT * FROM task_obstacles WHERE task_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [taskId, limit, offset]
    )
  } else {
    // 通过项目ID查询：两步查询避免 JOIN（executeSQL 正则只取第一个表名）
    logger.info('Fetching task obstacles by projectId', { projectId, limit, offset })
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
        `SELECT * FROM task_obstacles WHERE task_id IN (${placeholders}) ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...taskIds, limit, offset]
      )
    }
  }

  const response: ApiResponse = {
    success: true,
    data: data || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个阻碍记录
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching task obstacle', { id })

  const data = await executeSQLOne('SELECT * FROM task_obstacles WHERE id = ? LIMIT 1', [id])

  if (!data) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'OBSTACLE_NOT_FOUND', message: '阻碍记录不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建阻碍记录
// P1修复：添加XSS防护验证，使用统一认证中间件
router.post('/', authenticate, requireProjectMember(req => req.body.project_id), validate(obstacleSchema), asyncHandler(async (req, res) => {
  logger.info('Creating task obstacle', req.body)

  // [F5]: 兼容 GanttView 发送的 title 字段 → description
  const description = req.body.description ?? req.body.title ?? null
  // [F5]: 兼容 GanttView 发送的 is_resolved 字段 → status
  const status = normalizeObstacleStatus(req.body.status, req.body.is_resolved)
  const obstacleType = normalizeObstacleType(req.body.obstacle_type)

  const id = uuidv4()
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

  // [F2]: 从 tasks 表获取 project_id（如果没有传入，兼容旧前端）
  let projectId = req.body.project_id
  if (!projectId) {
    const taskRows = await executeSQL('SELECT project_id FROM tasks WHERE id = ?', [req.body.task_id])
    projectId = taskRows?.[0]?.project_id ?? null
  }

  await executeSQL(
    `INSERT INTO task_obstacles (id, task_id, project_id, obstacle_type, description, status,
       severity, resolution, resolved_by, resolved_at, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.body.task_id,
      projectId, // [F2]: 使用自动获取的 project_id
      obstacleType,
      description,
      status,
      req.body.severity ?? '中',
      req.body.resolution ?? null,
      req.body.resolved_by ?? null,
      req.body.resolved_at ?? null,
      req.user!.id,
      ts,
      ts,
    ]
  )

  const data = await executeSQLOne('SELECT * FROM task_obstacles WHERE id = ? LIMIT 1', [id])

  const response: ApiResponse = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

// 更新阻碍记录
// P1修复：添加XSS防护验证，使用统一认证中间件
router.put('/:id', authenticate, requireProjectMember((async (req) => {
  const obstacle = await executeSQLOne(
    'SELECT project_id FROM task_obstacles WHERE id = ? LIMIT 1',
    [req.params.id]
  )
  return obstacle?.project_id
}) as any), validate(obstacleUpdateSchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const userId = req.user!.id

  logger.info('Updating task obstacle', { id, userId })

  if (req.body.is_resolved === true && req.body.status === undefined) {
    req.body.status = OBSTACLE_STATUS_RESOLVED
  } else if (req.body.is_resolved === false && req.body.status === undefined) {
    req.body.status = OBSTACLE_STATUS_PENDING
  }

  if (req.body.status !== undefined) {
    req.body.status = normalizeObstacleStatus(req.body.status, req.body.is_resolved)
  }

  if (req.body.obstacle_type !== undefined) {
    req.body.obstacle_type = normalizeObstacleType(req.body.obstacle_type)
  }

  // 获取当前阻碍信息
  const current = await executeSQLOne('SELECT * FROM task_obstacles WHERE id = ? LIMIT 1', [id])

  if (!current) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'OBSTACLE_NOT_FOUND', message: '阻碍记录不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  // 如果更新状态为已解决，验证必填字段
  if (req.body.status === OBSTACLE_STATUS_RESOLVED) {
    if (!req.body.resolution) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'MISSING_RESOLUTION',
          message: '已解决状态必须提供解决方案'
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    if (!req.body.resolved_by) {
      req.body.resolved_by = userId
    }

    req.body.resolved_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
  }

  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const setClauses: string[] = ['updated_at = ?']
  const params: any[] = [ts]

  const fieldMap: Record<string, any> = {
    obstacle_type: req.body.obstacle_type,
    description: req.body.description,
    status: req.body.status,
    severity: req.body.severity,
    resolution: req.body.resolution,
    resolved_by: req.body.resolved_by,
    resolved_at: req.body.resolved_at,
  }

  for (const [col, val] of Object.entries(fieldMap)) {
    if (val !== undefined) {
      setClauses.push(`${col} = ?`)
      params.push(val)
    }
  }

  params.push(id)
  await executeSQL(`UPDATE task_obstacles SET ${setClauses.join(', ')} WHERE id = ?`, params)

  const data = await executeSQLOne('SELECT * FROM task_obstacles WHERE id = ? LIMIT 1', [id])

  const response: ApiResponse = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 删除阻碍记录
// P1修复：使用统一认证中间件
router.delete('/:id', authenticate, requireProjectMember((async (req) => {
  const obstacle = await executeSQLOne(
    'SELECT project_id FROM task_obstacles WHERE id = ? LIMIT 1',
    [req.params.id]
  )
  return obstacle?.project_id
}) as any), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting task obstacle', { id })

  await executeSQL('DELETE FROM task_obstacles WHERE id = ?', [id])

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 解决阻碍
// P1修复：使用统一认证中间件
router.put('/:id/resolve', authenticate, requireProjectMember((async (req) => {
  const obstacle = await executeSQLOne(
    'SELECT project_id FROM task_obstacles WHERE id = ? LIMIT 1',
    [req.params.id]
  )
  return obstacle?.project_id
}) as any), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { resolution, resolved_by } = req.body
  const userId = req.user!.id

  logger.info('Resolving task obstacle', { id, resolution, resolved_by })

  if (!resolution || resolution.trim() === '') {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'MISSING_RESOLUTION',
        message: '解决方案不能为空'
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  try {
    const { BusinessStatusService } = await import('../services/businessStatusService.js')

    // 1. 解决阻碍
    const obstacle = await BusinessStatusService.resolveObstacle({
      id,
      resolution,
      resolved_by: resolved_by || userId
    })

    // P1修复：阻碍解决后重新计算任务的业务状态
    const businessStatus = await BusinessStatusService.calculateBusinessStatus(obstacle.task_id)

    logger.info('Business status recalculated after obstacle resolved', {
      taskId: obstacle.task_id,
      status: businessStatus.display,
      reason: businessStatus.reason
    })

    // 返回阻碍 + 业务状态
    const response: ApiResponse<{
      obstacle: any
      businessStatus: any
    }> = {
      success: true,
      data: {
        obstacle,
        businessStatus
      },
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (error: any) {
    console.error('Failed to resolve obstacle', { id, error })
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'RESOLVE_OBSTACLE_FAILED',
        message: error.message || '解决阻碍失败'
      },
      timestamp: new Date().toISOString(),
    }
    res.status(400).json(response)
  }
}))

export default router
