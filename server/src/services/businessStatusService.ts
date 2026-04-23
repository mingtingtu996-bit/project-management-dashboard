// 业务状态计算服务
// 根据任务基础状态、条件、阻碍计算前端显示的业务状态

import { executeSQL, executeSQLOne } from './dbService.js'
import { logger } from '../middleware/logger.js'
import type {
  Task,
  TaskCondition,
  TaskObstacle
} from '../types/db.js'

// 业务状态类型定义
export interface BusinessStatus {
  display: string
  reason: string
  priority: number
}

// 业务状态枚举
export enum BusinessStatusType {
  PENDING_CONDITIONS = '待开工',
  READY_TO_START = '可开工',
  IN_PROGRESS = '进行中',
  IN_PROGRESS_BLOCKED = '进行中(有阻碍)',
  COMPLETED = '已完成'
}

// 条件完成接口
export interface ConditionCompleteInput {
  id: string
  confirmed_by: string
  user_id?: string
}

// 阻碍解决接口
export interface ObstacleResolveInput {
  id: string
  resolution: string
  resolved_by: string
  user_id?: string
}

/**
 * 计算任务的业务状态
 * 
 * 优先级规则：
 * 1. 待开工 - 基础状态='未开始'，且存在未满足的task_conditions
 * 2. 可开工 - 基础状态='未开始'，且无开工条件或条件已满足
 * 3. 进行中 - 基础状态='进行中'，且无进行中的阻碍
 * 4. 进行中(有阻碍) - 基础状态='进行中'，且存在进行中的task_obstacles
 * 5. 已完成 - 基础状态='已完成'
 */
export class BusinessStatusService {
  /**
   * 计算任务的业务状态
   */
  static async calculateBusinessStatus(taskId: string): Promise<BusinessStatus> {
    try {
      // 1. 获取任务基础信息
      const task = await executeSQLOne(
        'SELECT id, status, progress FROM tasks WHERE id = ? LIMIT 1',
        [taskId]
      )

      if (!task) {
        logger.error('Task not found', { taskId })
        throw new Error('任务不存在')
      }

      // 2. 获取任务的条件
      const conditions = await executeSQL(
        'SELECT id, is_satisfied FROM task_conditions WHERE task_id = ?',
        [taskId]
      )

      // 3. 获取任务的阻碍
      const obstacles = await executeSQL(
        'SELECT id, status FROM task_obstacles WHERE task_id = ?',
        [taskId]
      )

      // PostgreSQL boolean 字段返回值标准化
      const normalizedConditions = (conditions || []).map((c: any) => ({
        ...c,
        is_satisfied: c.is_satisfied === 1 || c.is_satisfied === true
      }))

      // 4. 根据优先级规则计算业务状态
      return this.evaluateBusinessStatus(
        task.status,
        task.progress,
        normalizedConditions,
        obstacles || []
      )
    } catch (error) {
      logger.error('Failed to calculate business status', { taskId, error })
      throw error
    }
  }

  /**
   * 根据基础状态、条件、阻碍评估业务状态
   */
  private static evaluateBusinessStatus(
    taskStatus: string,
    taskProgress: number,
    conditions: TaskCondition[],
    obstacles: TaskObstacle[]
  ): BusinessStatus {
    // 规则5：已完成
    if (taskStatus === '已完成' || taskProgress === 100) {
      return {
        display: BusinessStatusType.COMPLETED,
        reason: '任务已完成',
        priority: 5
      }
    }

    // 规则1：待开工 - 基础状态='未开始'，且存在未满足的task_conditions
    if (taskStatus === '未开始') {
      const hasUnsatisfiedConditions = conditions.some(
        c => !c.is_satisfied
      )

      if (hasUnsatisfiedConditions && conditions.length > 0) {
        const unsatisfiedCount = conditions.filter(
          c => !c.is_satisfied
        ).length
        return {
          display: BusinessStatusType.PENDING_CONDITIONS,
          reason: `有${unsatisfiedCount}项开工条件未满足`,
          priority: 1
        }
      }

      // 规则2：可开工 - 基础状态='未开始'，且无开工条件或条件已满足
      return {
        display: BusinessStatusType.READY_TO_START,
        reason: conditions.length === 0 ? '无开工条件' : '开工条件已满足',
        priority: 2
      }
    }

    // 规则3/4：进行中
    if (taskStatus === '进行中') {
      const hasActiveObstacles = obstacles.some(
        o => (o as any).status === 'active' || (o as any).status === 'resolving' ||
             (o as any).status === '待处理' || (o as any).status === '处理中'
      )

      if (hasActiveObstacles) {
        const activeCount = obstacles.filter(
          o => (o as any).status === 'active' || (o as any).status === 'resolving' ||
               (o as any).status === '待处理' || (o as any).status === '处理中'
        ).length
        return {
          display: BusinessStatusType.IN_PROGRESS_BLOCKED,
          reason: `有${activeCount}项阻碍未解决`,
          priority: 4
        }
      }

      // 规则3：正常进行中
      return {
        display: BusinessStatusType.IN_PROGRESS,
        reason: '正常进行中',
        priority: 3
      }
    }

    // 默认：返回基础状态
    return {
      display: taskStatus,
      reason: '根据任务状态显示',
      priority: 5
    }
  }

  /**
   * 完成开工条件
   * 将条件状态从"已满足"更新为"已确认"
   */
  static async completeCondition(input: ConditionCompleteInput): Promise<TaskCondition> {
    try {
      logger.info('Completing task condition', { id: input.id })

      // 获取当前条件
      const current = await executeSQLOne(
        'SELECT * FROM task_conditions WHERE id = ? LIMIT 1',
        [input.id]
      )

      if (!current) {
        throw new Error('开工条件不存在')
      }

      // 验证：只有未满足的条件才需要完成
      const isSatisfied = current.is_satisfied === 1 || current.is_satisfied === true
      if (isSatisfied) {
        throw new Error('条件已满足，无需重复确认')
      }

      // 更新条件状态
      const now = new Date().toISOString().replace('T', ' ').replace('Z', '')
      await executeSQL(
        'UPDATE task_conditions SET is_satisfied = 1, confirmed_by = ?, confirmed_at = ? WHERE id = ?',
        [input.confirmed_by, now, input.id]
      )

      const updated = await executeSQLOne(
        'SELECT * FROM task_conditions WHERE id = ? LIMIT 1',
        [input.id]
      )

      logger.info('Task condition completed', { id: input.id })
      return updated as TaskCondition
    } catch (error) {
      logger.error('Failed to complete condition', { id: input.id, error })
      throw error
    }
  }

  /**
   * 解决阻碍
   * 将阻碍状态从任意状态更新为"已解决"，并记录解决方案
   */
  static async resolveObstacle(input: ObstacleResolveInput): Promise<TaskObstacle> {
    try {
      logger.info('Resolving task obstacle', { id: input.id })

      // 验证必填字段
      if (!input.resolution || input.resolution.trim() === '') {
        throw new Error('解决方案不能为空')
      }

      // 获取当前阻碍
      const current = await executeSQLOne(
        'SELECT * FROM task_obstacles WHERE id = ? LIMIT 1',
        [input.id]
      )

      if (!current) {
        throw new Error('阻碍记录不存在')
      }

      // 如果已经是"已解决"状态，不允许重复解决
      if (current.status === '已解决') {
        throw new Error(`阻碍已处于${current.status}状态，无需重复操作`)
      }

      // 更新阻碍状态
      const now = new Date().toISOString().replace('T', ' ').replace('Z', '')
      await executeSQL(
        'UPDATE task_obstacles SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?',
        ['已解决', input.resolution, input.resolved_by, now, input.id]
      )

      const updated = await executeSQLOne(
        'SELECT * FROM task_obstacles WHERE id = ? LIMIT 1',
        [input.id]
      )

      logger.info('Task obstacle resolved', { id: input.id })
      return updated as TaskObstacle
    } catch (error) {
      logger.error('Failed to resolve obstacle', { id: input.id, error })
      throw error
    }
  }

  /**
   * 批量计算多个任务的业务状态
   */
  static async calculateBatchBusinessStatus(
    taskIds: string[]
  ): Promise<Map<string, BusinessStatus>> {
    const results = new Map<string, BusinessStatus>()

    // 并行计算所有任务的业务状态
    await Promise.all(
      taskIds.map(async (taskId) => {
        try {
          const status = await this.calculateBusinessStatus(taskId)
          results.set(taskId, status)
        } catch (error) {
          logger.error('Failed to calculate business status for task', { taskId, error })
          // 失败的任务不添加到结果中
        }
      })
    )

    return results
  }
}
