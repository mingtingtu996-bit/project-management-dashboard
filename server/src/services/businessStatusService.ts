// 业务状态计算服务
// 根据任务基础状态、条件、阻碍计算前端显示的业务状态

import { executeSQL, executeSQLOne } from './dbService.js'
import { logger } from '../middleware/logger.js'
import type {
  Task,
  TaskCondition,
  TaskObstacle
} from '../types/db.js'
import { deriveTaskUnifiedStatus, TASK_STATUS_RULE_REGISTRY } from './taskStatusDerivationService.js'

const TASK_OBSTACLE_BUSINESS_STATUS_COLUMNS = [
  'id',
  'task_id',
  'project_id',
  'description',
  'obstacle_type',
  'severity',
  'status',
  'resolution',
  'resolved_at',
  'resolved_by',
  'estimated_resolve_date',
  'notes',
  'is_resolved',
  'severity_escalated_at',
  'severity_manually_overridden',
  'created_at',
  'updated_at',
].join(', ')

// 业务状态类型定义
export interface BusinessStatus {
  display: string
  reason: string
  priority: number
}

export interface BusinessStatusFacts {
  taskStatus: string
  taskProgress: number | string
  conditions?: TaskCondition[]
  obstacles?: TaskObstacle[]
  task?: Partial<Task> & Record<string, unknown>
}

// 业务状态枚举
export enum BusinessStatusType {
  PENDING_CONDITIONS = '待开工',
  READY_TO_START = '可开工',
  IN_PROGRESS = '进行中',
  IN_PROGRESS_BLOCKED = '进行中(有阻碍)',
  PROGRESS_WARNING = '执行预警',
  PARTIAL_BLOCKED = '部分受影响',
  BLOCKED = '受阻',
  COMPLETED = '已完成'
}

// 条件完成接口
export interface ConditionCompleteInput {
  id: string
  confirmed_by: string
  project_id?: string | null
  user_id?: string
}

// 阻碍解决接口
export interface ObstacleResolveInput {
  id: string
  resolution: string
  resolved_by: string
  project_id?: string | null
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
  static async calculateBusinessStatus(taskId: string, projectId: string): Promise<BusinessStatus> {
    try {
      // 1. 获取任务基础信息
      const task = await executeSQLOne(
        `SELECT id, project_id, status, progress,
                ready_for_start, dependency_status, condition_status,
                obstacle_status, progress_impact_level, blocked_for_progress,
                readiness_summary, planned_start_date, planned_end_date, start_date, end_date
           FROM tasks
          WHERE id = ? AND project_id = ?
          LIMIT 1`,
        [taskId, projectId]
      )

      if (!task) {
        logger.error('Task not found', { taskId })
        throw new Error('任务不存在')
      }

      // 2. 获取任务的条件
      const conditions = await executeSQL(
        'SELECT id, is_satisfied FROM task_conditions WHERE task_id = ? AND project_id = ?',
        [taskId, (task as any).project_id]
      )

      // 3. 获取任务的阻碍
      const obstacles = await executeSQL(
        'SELECT id, status FROM task_obstacles WHERE task_id = ? AND project_id = ?',
        [taskId, (task as any).project_id]
      )

      // PostgreSQL boolean 字段返回值标准化
      const normalizedConditions = (conditions || []).map((c: any) => ({
        ...c,
        is_satisfied: c.is_satisfied === 1 || c.is_satisfied === true
      }))

      // 4. 根据优先级规则计算业务状态
      return this.evaluateBusinessStatusFromFacts({
        taskStatus: task.status,
        taskProgress: task.progress,
        conditions: normalizedConditions,
        obstacles: obstacles || [],
        task: task as any,
      })
    } catch (error) {
      logger.error('Failed to calculate business status', { taskId, error })
      throw error
    }
  }

  /**
   * 根据已加载事实评估业务状态
   */
  static evaluateBusinessStatusFromFacts(input: BusinessStatusFacts): BusinessStatus {
    const unsatisfiedCount = (input.conditions ?? []).filter((condition) => !condition.is_satisfied).length
    const activeCount = (input.obstacles ?? []).filter(
      (obstacle) => (obstacle as any).status === 'active'
        || (obstacle as any).status === 'resolving'
        || (obstacle as any).status === '待处理'
        || (obstacle as any).status === '处理中',
    ).length
    const unified = deriveTaskUnifiedStatus({
      ...(input.task ?? {}),
      status: input.taskStatus,
      progress: input.taskProgress,
      conditions_unmet: unsatisfiedCount,
      obstacles_active: activeCount,
    })
    return {
      display: this.mapUnifiedBusinessDisplay(unified.businessStatus.status, unified.businessStatus.label),
      reason: unified.businessStatus.reason,
      priority: this.mapUnifiedBusinessPriority(unified.businessStatus.status),
    }
  }

  /**
   * 根据基础状态、条件、阻碍评估业务状态
   */
  private static evaluateBusinessStatus(
    taskStatus: string,
    taskProgress: number,
    conditions: TaskCondition[],
    obstacles: TaskObstacle[],
    task?: Partial<Task> & Record<string, unknown>
  ): BusinessStatus {
    return this.evaluateBusinessStatusFromFacts({
      taskStatus,
      taskProgress,
      conditions,
      obstacles,
      task,
    })
  }

  private static mapUnifiedBusinessDisplay(status: string, fallbackLabel: string): string {
    switch (status) {
      case 'completed':
        return BusinessStatusType.COMPLETED
      case 'blocked_by_obstacle':
        return BusinessStatusType.BLOCKED
      case 'partial_blocked':
        return BusinessStatusType.PARTIAL_BLOCKED
      case 'progress_warning':
        return BusinessStatusType.PROGRESS_WARNING
      case 'pending_conditions':
        return BusinessStatusType.PENDING_CONDITIONS
      case 'ready':
        return BusinessStatusType.READY_TO_START
      case 'in_progress':
        return BusinessStatusType.IN_PROGRESS
      default:
        return fallbackLabel
    }
  }

  private static mapUnifiedBusinessPriority(status: string): number {
    const priorityIndex = TASK_STATUS_RULE_REGISTRY.business.priority.indexOf(status as any)
    return priorityIndex >= 0 ? priorityIndex + 1 : TASK_STATUS_RULE_REGISTRY.business.priority.length
  }

  static async evaluateBusinessStatusForTaskFromLoadedFact(
    taskId: string | null | undefined,
    loadedFacts: {
      task?: (Partial<Task> & Record<string, unknown>) | null
      conditions?: TaskCondition[]
      obstacles?: TaskObstacle[]
      projectId?: string | null
    } = {},
  ): Promise<BusinessStatus> {
    const normalizedTaskId = String(taskId ?? '').trim()
    if (!normalizedTaskId) {
      throw new Error('任务ID不能为空')
    }

    const requestedProjectId = String(loadedFacts.projectId ?? loadedFacts.task?.project_id ?? '').trim()
    if (!requestedProjectId) {
      throw new Error('项目ID不能为空')
    }

    const task = loadedFacts.task ?? await executeSQLOne(
      `SELECT id, project_id, status, progress,
              ready_for_start, dependency_status, condition_status,
              obstacle_status, progress_impact_level, blocked_for_progress,
              readiness_summary, planned_start_date, planned_end_date, start_date, end_date
         FROM tasks
        WHERE id = ? AND project_id = ?
        LIMIT 1`,
      [normalizedTaskId, requestedProjectId],
    ) as (Partial<Task> & Record<string, unknown>) | null

    if (!task) {
      throw new Error('任务不存在')
    }

    const projectId = String(task.project_id ?? requestedProjectId).trim()
    if (projectId !== requestedProjectId) {
      throw new Error('任务不属于当前项目')
    }
    const conditions = loadedFacts.conditions
      ?? await executeSQL<TaskCondition>(
        'SELECT id, task_id, is_satisfied, status FROM task_conditions WHERE task_id = ? AND project_id = ?',
        [normalizedTaskId, projectId],
      )
    const obstacles = loadedFacts.obstacles
      ?? await executeSQL<TaskObstacle>(
        'SELECT id, task_id, status, is_resolved FROM task_obstacles WHERE task_id = ? AND project_id = ?',
        [normalizedTaskId, projectId],
      )

    return this.evaluateBusinessStatusFromFacts({
      taskStatus: String(task.status ?? ''),
      taskProgress: task.progress as number | string,
      conditions,
      obstacles,
      task,
    })
  }

  /**
   * 完成开工条件
   * 将条件状态从"已满足"更新为"已确认"
   */
  static async completeCondition(input: ConditionCompleteInput): Promise<TaskCondition> {
    try {
      logger.info('Completing task condition', { id: input.id })

      const requestedProjectId = input.project_id ? String(input.project_id) : null
      // 获取当前条件；旧调用未传 project_id 时，先解析记录所属项目，再用项目范围执行后续写入
      const current = requestedProjectId
        ? await executeSQLOne('SELECT * FROM task_conditions WHERE id = ? AND project_id = ? LIMIT 1', [input.id, requestedProjectId])
        : await executeSQLOne('SELECT * FROM task_conditions WHERE id = ? LIMIT 1', [input.id])

      if (!current) {
        throw new Error('开工条件不存在')
      }
      const projectId = String((current as any).project_id ?? requestedProjectId ?? '')
      if (!projectId) {
        throw new Error('开工条件缺少项目归属')
      }

      // 验证：只有未满足的条件才需要完成
      const isSatisfied = current.is_satisfied === 1 || current.is_satisfied === true
      if (isSatisfied) {
        throw new Error('条件已满足，无需重复确认')
      }

      // 更新条件状态
      const now = new Date().toISOString().replace('T', ' ').replace('Z', '')
      await executeSQL(
        'UPDATE task_conditions SET is_satisfied = ?, confirmed_by = ?, confirmed_at = ? WHERE id = ? AND project_id = ?',
        [true, input.confirmed_by, now, input.id, projectId]
      )

      const updated = await executeSQLOne(
        'SELECT * FROM task_conditions WHERE id = ? AND project_id = ? LIMIT 1',
        [input.id, projectId]
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

      const requestedProjectId = input.project_id ? String(input.project_id) : null
      // 获取当前阻碍；旧调用未传 project_id 时，先解析记录所属项目，再用项目范围执行后续写入
      const current = requestedProjectId
        ? await executeSQLOne(`SELECT ${TASK_OBSTACLE_BUSINESS_STATUS_COLUMNS} FROM task_obstacles WHERE id = ? AND project_id = ? LIMIT 1`, [input.id, requestedProjectId])
        : await executeSQLOne(`SELECT ${TASK_OBSTACLE_BUSINESS_STATUS_COLUMNS} FROM task_obstacles WHERE id = ? LIMIT 1`, [input.id])

      if (!current) {
        throw new Error('阻碍记录不存在')
      }
      const projectId = String((current as any).project_id ?? requestedProjectId ?? '')
      if (!projectId) {
        throw new Error('阻碍记录缺少项目归属')
      }

      // 如果已经是"已解决"状态，不允许重复解决
      if (current.status === '已解决') {
        throw new Error(`阻碍已处于${current.status}状态，无需重复操作`)
      }

      // 更新阻碍状态
      const now = new Date().toISOString().replace('T', ' ').replace('Z', '')
      await executeSQL(
        'UPDATE task_obstacles SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ? AND project_id = ?',
        ['已解决', input.resolution, input.resolved_by, now, input.id, projectId]
      )

      const updated = await executeSQLOne(
        `SELECT ${TASK_OBSTACLE_BUSINESS_STATUS_COLUMNS} FROM task_obstacles WHERE id = ? AND project_id = ? LIMIT 1`,
        [input.id, projectId]
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
    projectId: string,
    taskIds: string[]
  ): Promise<Map<string, BusinessStatus>> {
    const results = new Map<string, BusinessStatus>()
    const normalizedProjectId = String(projectId ?? '').trim()
    if (!normalizedProjectId) throw new Error('projectId is required for batch business status')
    const uniqueTaskIds = [...new Set(taskIds.map((taskId) => String(taskId ?? '').trim()).filter(Boolean))]
    if (uniqueTaskIds.length === 0) return results

    const buildPlaceholders = (count: number) => Array.from({ length: count }, () => '?').join(', ')
    const chunkSize = 200
    const taskRows: Array<Record<string, unknown>> = []
    const conditionRows: Array<Record<string, unknown>> = []
    const obstacleRows: Array<Record<string, unknown>> = []

    for (let index = 0; index < uniqueTaskIds.length; index += chunkSize) {
      const chunk = uniqueTaskIds.slice(index, index + chunkSize)
      const placeholders = buildPlaceholders(chunk.length)
      const tasks = await executeSQL(
        `SELECT id, project_id, status, progress,
                ready_for_start, dependency_status, condition_status,
                obstacle_status, progress_impact_level, blocked_for_progress,
                readiness_summary, planned_start_date, planned_end_date, start_date, end_date
           FROM tasks
          WHERE project_id = ?
            AND id IN (${placeholders})`,
        [normalizedProjectId, ...chunk],
      )
      taskRows.push(...tasks)

      const scopedTaskIds = tasks
        .map((task: any) => String(task.id ?? '').trim())
        .filter(Boolean)
      if (scopedTaskIds.length === 0) continue
      const scopedPlaceholders = buildPlaceholders(scopedTaskIds.length)

      const conditions = await executeSQL(
        `SELECT task_id, is_satisfied
           FROM task_conditions
          WHERE task_id IN (${scopedPlaceholders})`,
        scopedTaskIds,
      )
      conditionRows.push(...conditions)

      const obstacles = await executeSQL(
        `SELECT task_id, status
           FROM task_obstacles
          WHERE task_id IN (${scopedPlaceholders})`,
        scopedTaskIds,
      )
      obstacleRows.push(...obstacles)
    }

    const taskById = new Map<string, Record<string, unknown>>(
      taskRows
        .map((task: any) => [String(task.id ?? '').trim(), task] as const)
        .filter(([taskId]) => Boolean(taskId)),
    )
    const conditionsByTaskId = new Map<string, TaskCondition[]>()
    for (const row of conditionRows as any[]) {
      const taskId = String(row.task_id ?? '').trim()
      if (!taskId) continue
      const existing = conditionsByTaskId.get(taskId) ?? []
      existing.push({
        id: String(row.id ?? taskId),
        task_id: taskId,
        is_satisfied: row.is_satisfied === 1 || row.is_satisfied === true,
      } as TaskCondition)
      conditionsByTaskId.set(taskId, existing)
    }
    const obstaclesByTaskId = new Map<string, TaskObstacle[]>()
    for (const row of obstacleRows as any[]) {
      const taskId = String(row.task_id ?? '').trim()
      if (!taskId) continue
      const existing = obstaclesByTaskId.get(taskId) ?? []
      existing.push({
        id: String(row.id ?? taskId),
        task_id: taskId,
        description: '',
        obstacle_type: '',
        is_resolved: ['resolved', 'closed', '已解决', '已关闭'].includes(String(row.status ?? '').trim().toLowerCase()),
        severity: 'medium',
        status: String(row.status ?? ''),
        created_at: '',
        updated_at: '',
        title: '',
      } as unknown as TaskObstacle)
      obstaclesByTaskId.set(taskId, existing)
    }

    for (const taskId of uniqueTaskIds) {
      const task = taskById.get(taskId)
      if (!task) continue
      try {
        const status = this.evaluateBusinessStatusFromFacts({
          taskStatus: String(task.status ?? ''),
          taskProgress: Number(task.progress ?? 0),
          conditions: conditionsByTaskId.get(taskId) ?? [],
          obstacles: obstaclesByTaskId.get(taskId) ?? [],
          task: task as any,
        })
        results.set(taskId, status)
      } catch (error) {
        logger.error('Failed to calculate business status for task', { taskId, error })
      }
    }

    return results
  }
}
