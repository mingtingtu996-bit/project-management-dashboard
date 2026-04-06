// 任务到期状态服务 - 基于通用到期状态服务
// 保持向后兼容，内部使用 dueDateService

import { executeSQL } from './dbService.js'
import type { Task } from '../types/db.js'
import {
  calculateDueStatus,
  batchCalculateDueStatus,
  sortByDueStatus,
  countDueStatus,
  DUE_CONFIG,
  type DueStatus,
  type DueStatusResult,
  type WithDueStatus,
} from './dueDateService.js'

// 重新导出类型（保持向后兼容）
export type { DueStatus, DueStatusResult }
export { DUE_CONFIG }

// 带到期状态的任务（保持向后兼容）
export type TaskWithDue = WithDueStatus<Task>

export class TaskDueService {

  /**
   * 计算任务的到期状态
   * @param task 任务对象
   * @returns 带到期状态的任务
   */
  calculateDueStatus(task: Task): TaskWithDue {
    return {
      ...task,
      ...calculateDueStatus(task.end_date),
    }
  }

  /**
   * 获取待完成任务列表（带到期状态）
   * @param projectId 项目ID
   * @param limit 限制数量
   * @returns 按优先级排序的待完成任务列表
   */
  async getPendingTasks(projectId: string, limit: number = 10): Promise<TaskWithDue[]> {
    // 查询未开始和进行中的任务，按 end_date 升序（NULL 排最后）
    const tasks = await executeSQL<Task>(
      `SELECT * FROM tasks
       WHERE project_id = ? AND status IN ('pending', 'in_progress', 'blocked')
       ORDER BY CASE WHEN end_date IS NULL THEN 1 ELSE 0 END, end_date ASC`,
      [projectId]
    )

    // 计算每个任务的到期状态并排序
    const tasksWithDue = batchCalculateDueStatus(tasks || [], 'end_date')
    const sortedTasks = sortByDueStatus(tasksWithDue)

    return limit ? sortedTasks.slice(0, limit) : sortedTasks
  }

  /**
   * 获取任务统计信息
   * @param projectId 项目ID
   * @returns 各类状态的任务数量
   */
  async getTaskStats(projectId: string): Promise<{
    total: number
    overdue: number
    urgent: number
    approaching: number
    normal: number
  }> {
    const tasks = await this.getPendingTasks(projectId, 1000)
    return countDueStatus(tasks)
  }

  /**
   * 批量计算到期状态（用于已有任务列表）
   * @param tasks 任务列表
   * @returns 带到期状态的任务列表
   */
  batchCalculateDueStatus(tasks: Task[]): TaskWithDue[] {
    return batchCalculateDueStatus(tasks, 'end_date')
  }
}

// 导出单例实例
export const taskDueService = new TaskDueService()
