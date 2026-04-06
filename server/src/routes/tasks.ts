// Tasks API 路由

import { Router } from 'express'
import { SupabaseService } from '../services/supabaseService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate, validateIdParam, taskSchema, taskUpdateSchema } from '../middleware/validation.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import type { Task } from '../types/db.js'
import { executeSQL } from '../services/dbService.js'
import { generateId } from '../utils/id.js'

const router = Router()
const supabase = new SupabaseService()

// 所有路由都需要认证
router.use(authenticate)

// 获取任务列表
router.get('/', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  logger.info('Fetching tasks', { projectId })
  
  const tasks = await supabase.getTasks(projectId)
  
  const response: ApiResponse<Task[]> = {
    success: true,
    data: tasks,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取单个任务
router.get('/:id', validateIdParam, asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching task', { id })
  
  // 修复：使用 getTask 按 ID 直接查询，避免全表扫描
  const task = await supabase.getTask(id)
  
  if (!task) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }
  
  const response: ApiResponse<Task> = {
    success: true,
    data: task,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 创建任务
router.post('/', validate(taskSchema), asyncHandler(async (req, res) => {
  logger.info('Creating task', { body: req.body, project_id: req.body.project_id, title: req.body.title })

  // 修复：确保 created_by 为有效 UUID 或 null，删除空字符串/undefined
  const taskBody = { ...req.body }
  if (!taskBody.created_by && !taskBody.user_id) {
    delete taskBody.created_by
    delete taskBody.user_id
  }

  try {
    const task = await supabase.createTask({
      ...taskBody,
      created_by: req.user?.id,
    })
  
    const response: ApiResponse<Task> = {
      success: true,
      data: task,
      timestamp: new Date().toISOString(),
    }
    res.status(201).json(response)
  } catch (err) {
    logger.error('创建任务失败', { 
      error: (err as Error).message,
      stack: (err as Error).stack,
      taskBody: JSON.stringify(taskBody),
    })
    throw err
  }
}))

// 更新任务
router.put('/:id', validateIdParam, validate(taskUpdateSchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { version, ...updates } = req.body

  logger.info('Updating task', { id, version })

  try {
    // 修复：使用 getTask 按 ID 直接查询，避免全表扫描
    const oldTask = await supabase.getTask(id)

    // 恢复：传递 version 参数到 updateTask 函数（乐观锁机制）
    const task = await supabase.updateTask(id, updates, version)

    // P2: 前置工序自动联动：当任务被标记为完成时，自动满足所有以后置任务为前置的未开工条件
    const newProgress = updates.progress
    const oldProgress = (oldTask as any)?.progress ?? 0
    const newStatus = updates.status
    const oldStatus = (oldTask as any)?.status
    const isNowCompleted = (newStatus === '已完成' || newProgress === 100)
      && (oldStatus !== '已完成' && oldProgress !== 100)
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')

    if (isNowCompleted) {
      try {
        // P6+P2-9: 前置工序自动联动（支持 junction 表多对多）
        // 找出所有以刚完成的任务为前置工序的条件（包括旧字段 + junction 表）
        const dependentTasks = await executeSQL(
          `SELECT DISTINCT tc.id AS condition_id, tc.task_id
           FROM task_conditions tc
           INNER JOIN tasks t ON tc.task_id = t.id
           WHERE (t.preceding_task_id = ? OR tc.id IN (
             SELECT condition_id FROM task_preceding_relations WHERE task_id = ?
           )) AND tc.is_satisfied = 0`,
          [id, id]
        ) as any[]

        if (dependentTasks && dependentTasks.length > 0) {
          const conditionIds = dependentTasks.map(t => t.condition_id)
          const placeholders = conditionIds.map(() => '?').join(',')
          await executeSQL(
            `UPDATE task_conditions SET is_satisfied = 1, updated_at = ? WHERE id IN (${placeholders})`,
            [ts, ...conditionIds]
          )
          logger.info('Auto-satisfied preceding-task conditions', {
            completedTaskId: id,
            affectedConditions: conditionIds.length,
            taskIds: [...new Set(dependentTasks.map(t => t.task_id))]
          })
        }
      } catch (precedingErr) {
        // 前置工序联动失败不影响主流程，仅记录日志
        logger.error('Failed to auto-satisfy preceding-task conditions', { error: precedingErr })
      }
    }

    if (!task) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'TASK_NOT_FOUND', message: '任务不存在' },
        timestamp: new Date().toISOString(),
      }
      return res.status(404).json(response)
    }

    // 自动记录延期：当 end_date 被改得更晚时
    const newEndDate = updates.end_date || updates.planned_end_date
    const oldEndDate = (oldTask as any)?.end_date || (oldTask as any)?.planned_end_date
    if (oldTask && newEndDate && oldEndDate && newEndDate > oldEndDate) {
      try {
        const delayDays = Math.ceil(
          (new Date(newEndDate).getTime() - new Date(oldEndDate).getTime()) / 86400000
        )
        const delayTs = new Date().toISOString().slice(0, 19).replace('T', ' ')
        await executeSQL(
          `INSERT INTO task_delay_history
             (id, task_id, original_date, delayed_date, delay_days, delay_type, reason, delay_reason, approved_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            generateId(),
            id,
            oldEndDate,
            newEndDate,
            delayDays,
            '主动延期',
            updates.delay_reason || '修改计划完成日期',
            updates.delay_reason || null,
            null,  // 系统自动记录，无需人工审批（迁移已移除 approved_by NOT NULL）
            delayTs,
          ]
        )
        logger.info('Auto-recorded task delay', { taskId: id, delayDays, oldEndDate, newEndDate })
      } catch (delayErr) {
        // 延期记录失败不影响主流程
        logger.error('Failed to auto-record delay', { error: delayErr })
      }
    }

    const response: ApiResponse<Task> = {
      success: true,
      data: task,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  } catch (error: any) {
    // 恢复：VERSION_MISMATCH 错误处理（乐观锁机制）
    if (error.message && error.message.includes('VERSION_MISMATCH')) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VERSION_MISMATCH', message: error.message },
        timestamp: new Date().toISOString(),
      }
      return res.status(409).json(response)
    }
    throw error
  }
}))

// 删除任务
router.delete('/:id', validateIdParam, asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting task', { id })
  
  await supabase.deleteTask(id)
  
  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

// 获取项目所有任务的进度快照（用于连续滞后分析）
router.get('/progress-snapshots', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string
  
  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: '项目ID不能为空' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }
  
  logger.info('Fetching progress snapshots', { projectId })
  
  // 获取项目下所有任务的ID
  const tasks = await executeSQL(
    'SELECT id FROM tasks WHERE project_id = ?',
    [projectId]
  )
  
  if (!tasks || tasks.length === 0) {
    const response: ApiResponse = {
      success: true,
      data: [],
      timestamp: new Date().toISOString(),
    }
    return res.json(response)
  }
  
  const taskIds = (tasks as any[]).map(t => t.id)
  const placeholders = taskIds.map(() => '?').join(',')
  
  // 获取这些任务的所有进度快照记录
  const snapshots = await executeSQL(
    `SELECT * FROM task_progress_snapshots 
     WHERE task_id IN (${placeholders}) 
     ORDER BY task_id, recorded_at DESC`,
    taskIds
  )
  
  const response: ApiResponse = {
    success: true,
    data: snapshots || [],
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
