// 工期预测服务
// 基于历史数据预测任务工期和评估延期风险

import type { Task } from '../types/db.js'
import { executeSQL, executeSQLOne } from './dbService.js'
import {
  calculateDeviationRate,
  calculateWeightedAverage,
  calculateTypeCoefficient,
  getSeasonalCoefficient,
  calculateComplexityCoefficient,
  calculateDelayProbability,
  groupBy,
  calculatePercentile,
  calculateAverage,
} from '../utils/statistics.js'

export interface DurationPrediction {
  task_id: string
  task_title: string
  planned_duration_days: number
  predicted_duration_days: number
  adjustment_coefficient: number
  type_coefficient: number
  seasonal_coefficient: number
  complexity_coefficient: number
  confidence: number
  breakdown: {
    base_duration: number
    type_adjustment: number
    seasonal_adjustment: number
    complexity_adjustment: number
  }
  risk_level: 'low' | 'medium' | 'high'
}

export interface DelayRiskAnalysis {
  task_id: string
  task_title: string
  progress_deviation: number
  remaining_days: number
  obstacle_count: number
  delay_probability: number
  delay_risk: 'low' | 'medium' | 'high'
  risk_factors: string[]
  recommendations: string[]
}

export interface ProjectDurationInsight {
  project_id: string
  project_name: string
  total_tasks: number
  completed_tasks: number
  avg_deviation_rate: number
  deviation_distribution: {
    p25: number
    p50: number
    p75: number
    p90: number
  }
  common_delay_reasons: string[]
  task_type_insights: Array<{
    task_type: string
    avg_duration: number
    avg_deviation: number
    sample_size: number
  }>
  assignee_insights: Array<{
    assignee: string
    avg_deviation: number
    task_count: number
  }>
}

export class SchedulePredictor {
  constructor() {
    // No Supabase client needed — uses dbService directly
  }

  /**
   * 预测任务工期
   * @param taskId 任务ID
   * @returns 工期预测结果
   */
  async predictDuration(taskId: string): Promise<DurationPrediction | null> {
    // 获取任务信息
    const task = await executeSQLOne(
      'SELECT * FROM tasks WHERE id = ? LIMIT 1',
      [taskId]
    )

    if (!task) {
      throw new Error(`任务不存在: ${taskId}`)
    }

    // 解析 JSON 字段
    if (task.dependencies && typeof task.dependencies === 'string') {
      try { task.dependencies = JSON.parse(task.dependencies) } catch { task.dependencies = [] }
    }

    // 计算基础工期
    const baseDuration = this.calculateBaseDuration(task as Task)
    if (!baseDuration) {
      return null
    }

    // 获取历史同类型任务数据
    const historicalData = await this.getHistoricalTasks(task as Task)
    const typeResult = calculateTypeCoefficient(historicalData.deviationRates)

    // 计算季节系数
    const startMonth = task.start_date ? new Date(task.start_date).getMonth() + 1 : new Date().getMonth() + 1
    const seasonalCoefficient = getSeasonalCoefficient(startMonth)

    // 计算复杂度系数
    const dependenciesCount = (task.dependencies as any[])?.length || 0
    const isMilestone = !!task.milestone_id
    const complexityCoefficient = calculateComplexityCoefficient(
      dependenciesCount,
      isMilestone
    )

    // 综合调整系数
    const adjustmentCoefficient =
      typeResult.coefficient * seasonalCoefficient * complexityCoefficient

    // 预测工期
    const predictedDuration = baseDuration * adjustmentCoefficient

    // 风险等级
    const riskLevel = this.assessRiskLevel(adjustmentCoefficient, typeResult.confidence)

    return {
      task_id: task.id,
      task_title: task.title,
      planned_duration_days: baseDuration,
      predicted_duration_days: Math.round(predictedDuration),
      adjustment_coefficient: Math.round(adjustmentCoefficient * 100) / 100,
      type_coefficient: Math.round(typeResult.coefficient * 100) / 100,
      seasonal_coefficient: seasonalCoefficient,
      complexity_coefficient: Math.round(complexityCoefficient * 100) / 100,
      confidence: typeResult.confidence,
      breakdown: {
        base_duration: baseDuration,
        type_adjustment: Math.round(baseDuration * (typeResult.coefficient - 1)),
        seasonal_adjustment: Math.round(baseDuration * (seasonalCoefficient - 1)),
        complexity_adjustment: Math.round(baseDuration * (complexityCoefficient - 1)),
      },
      risk_level: riskLevel,
    }
  }

  /**
   * 批量预测任务工期
   * @param taskIds 任务ID数组
   * @returns 工期预测结果数组
   */
  async predictBatchDurations(taskIds: string[]): Promise<DurationPrediction[]> {
    const predictions: DurationPrediction[] = []

    for (const taskId of taskIds) {
      try {
        const prediction = await this.predictDuration(taskId)
        if (prediction) {
          predictions.push(prediction)
        }
      } catch (error) {
        console.error(`预测任务 ${taskId} 失败:`, error)
      }
    }

    return predictions
  }

  /**
   * 分析任务延期风险
   * @param taskId 任务ID
   * @returns 延期风险分析结果
   */
  async analyzeDelayRisk(taskId: string): Promise<DelayRiskAnalysis | null> {
    // 获取任务信息
    const task = await executeSQLOne(
      'SELECT * FROM tasks WHERE id = ? LIMIT 1',
      [taskId]
    )

    if (!task) {
      throw new Error(`任务不存在: ${taskId}`)
    }

    // 解析 JSON 字段
    if (task.dependencies && typeof task.dependencies === 'string') {
      try { task.dependencies = JSON.parse(task.dependencies) } catch { task.dependencies = [] }
    }

    // 计算进度偏差
    const progressDeviation = this.calculateProgressDeviation(task as Task)

    // 计算剩余天数
    const remainingDays = this.calculateRemainingDays(task as Task)

    // 获取阻碍数量
    const obstacleRow = await executeSQLOne(
      `SELECT COUNT(*) AS cnt FROM task_obstacles
       WHERE task_id = ? AND status IN ('待处理', '处理中')`,
      [taskId]
    )
    const obstacleCount = obstacleRow ? Number(obstacleRow.cnt) : 0

    // 计算复杂度系数
    const dependenciesCount = (task.dependencies as any[])?.length || 0
    const isMilestone = !!task.milestone_id
    const complexityCoefficient = calculateComplexityCoefficient(
      dependenciesCount,
      isMilestone
    )

    // 计算延期概率
    const delayProbability = calculateDelayProbability(
      progressDeviation,
      remainingDays,
      obstacleCount,
      complexityCoefficient
    )

    // 风险等级
    const delayRisk = this.assessDelayRisk(delayProbability)

    // 风险因素
    const riskFactors = this.identifyRiskFactors(
      task as Task,
      progressDeviation,
      remainingDays,
      obstacleCount
    )

    // 建议
    const recommendations = this.generateRecommendations(
      delayRisk,
      riskFactors,
      task as Task
    )

    return {
      task_id: task.id,
      task_title: task.title,
      progress_deviation: Math.round(progressDeviation * 100) / 100,
      remaining_days: remainingDays,
      obstacle_count: obstacleCount,
      delay_probability: Math.round(delayProbability * 100) / 100,
      delay_risk: delayRisk,
      risk_factors: riskFactors,
      recommendations: recommendations,
    }
  }

  /**
   * 项目工期洞察
   * @param projectId 项目ID
   * @returns 项目工期洞察
   */
  async getProjectDurationInsight(
    projectId: string
  ): Promise<ProjectDurationInsight> {
    // 获取项目信息
    const project = await executeSQLOne(
      'SELECT name FROM projects WHERE id = ? LIMIT 1',
      [projectId]
    )

    if (!project) {
      throw new Error(`项目不存在: ${projectId}`)
    }

    // 获取所有任务
    const allTasksRaw = await executeSQL(
      'SELECT * FROM tasks WHERE project_id = ?',
      [projectId]
    )

    const allTasks: Task[] = (allTasksRaw || []).map((t: any) => {
      if (t.dependencies && typeof t.dependencies === 'string') {
        try { t.dependencies = JSON.parse(t.dependencies) } catch { t.dependencies = [] }
      }
      return t as Task
    })

    const completedTasks = allTasks.filter((t) => t.status === 'completed')

    // 计算平均偏差率
    const deviationRates = this.calculateDeviationRates(completedTasks)
    const avgDeviation = calculateAverage(deviationRates)

    // 偏差分布
    const deviationDistribution = {
      p25: calculatePercentile(deviationRates, 25),
      p50: calculatePercentile(deviationRates, 50),
      p75: calculatePercentile(deviationRates, 75),
      p90: calculatePercentile(deviationRates, 90),
    }

    // 常见延期原因
    const commonDelayReasons = await this.getCommonDelayReasons(projectId)

    // 任务类型洞察
    const taskTypeInsights = await this.getTaskTypeInsights(projectId)

    // 负责人洞察
    const assigneeInsights = await this.getAssigneeInsights(projectId)

    return {
      project_id: projectId,
      project_name: project.name,
      total_tasks: allTasks.length,
      completed_tasks: completedTasks.length,
      avg_deviation_rate: Math.round(avgDeviation * 100) / 100,
      deviation_distribution: {
        p25: Math.round(deviationDistribution.p25 * 100) / 100,
        p50: Math.round(deviationDistribution.p50 * 100) / 100,
        p75: Math.round(deviationDistribution.p75 * 100) / 100,
        p90: Math.round(deviationDistribution.p90 * 100) / 100,
      },
      common_delay_reasons: commonDelayReasons,
      task_type_insights: taskTypeInsights,
      assignee_insights: assigneeInsights,
    }
  }

  /**
   * 计算基础工期
   */
  private calculateBaseDuration(task: Task): number | null {
    if (!task.start_date || !task.end_date) {
      return null
    }

    const start = new Date(task.start_date)
    const end = new Date(task.end_date)
    const diffTime = Math.abs(end.getTime() - start.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  /**
   * 获取历史同类型任务
   */
  private async getHistoricalTasks(
    currentTask: Task
  ): Promise<{ deviationRates: number[] }> {
    const completedTasksRaw = await executeSQL(
      'SELECT * FROM tasks WHERE status = ? AND id != ? LIMIT 100',
      ['completed', currentTask.id]
    )

    const deviationRates: number[] = []

    if (completedTasksRaw) {
      for (const t of completedTasksRaw) {
        const task = t as Task
        const baseDuration = this.calculateBaseDuration(task)
        const actualDuration = this.calculateActualDuration(task)

        if (baseDuration && actualDuration) {
          const deviationRate = calculateDeviationRate(baseDuration, actualDuration)
          deviationRates.push(deviationRate)
        }
      }
    }

    return { deviationRates }
  }

  /**
   * 计算实际工期
   */
  private calculateActualDuration(task: Task): number | null {
    if (!task.start_date || !task.updated_at) {
      return null
    }

    const start = new Date(task.start_date)
    const completed = new Date(task.updated_at)
    const diffTime = Math.abs(completed.getTime() - start.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  /**
   * 计算进度偏差
   */
  private calculateProgressDeviation(task: Task): number {
    if (!task.start_date || !task.end_date) {
      return 0
    }

    const now = new Date()
    const start = new Date(task.start_date)
    const end = new Date(task.end_date)

    const totalDuration = Math.abs(end.getTime() - start.getTime())
    const elapsedDuration = Math.abs(now.getTime() - start.getTime())

    const plannedProgress = elapsedDuration / totalDuration
    const actualProgress = task.progress / 100

    return actualProgress - plannedProgress
  }

  /**
   * 计算剩余天数
   */
  private calculateRemainingDays(task: Task): number {
    if (!task.end_date) {
      return 0
    }

    const now = new Date()
    const end = new Date(task.end_date)
    const diffTime = Math.max(0, end.getTime() - now.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  /**
   * 评估风险等级
   */
  private assessRiskLevel(
    coefficient: number,
    confidence: number
  ): 'low' | 'medium' | 'high' {
    if (coefficient > 1.3) return 'high'
    if (coefficient > 1.1) return 'medium'
    return 'low'
  }

  /**
   * 评估延期风险
   */
  private assessDelayRisk(probability: number): 'low' | 'medium' | 'high' {
    if (probability >= 0.7) return 'high'
    if (probability >= 0.4) return 'medium'
    return 'low'
  }

  /**
   * 识别风险因素
   */
  private identifyRiskFactors(
    task: Task,
    progressDeviation: number,
    remainingDays: number,
    obstacleCount: number
  ): string[] {
    const factors: string[] = []

    if (progressDeviation < -0.1) {
      factors.push('进度严重滞后')
    } else if (progressDeviation < -0.05) {
      factors.push('进度略有滞后')
    }

    if (remainingDays < 3) {
      factors.push('工期非常紧张')
    } else if (remainingDays < 7) {
      factors.push('工期紧张')
    }

    if (obstacleCount >= 3) {
      factors.push('多个未解决阻碍')
    } else if (obstacleCount >= 1) {
      factors.push('存在阻碍')
    }

    if ((task.dependencies as any[])?.length > 3) {
      factors.push('依赖任务较多')
    }

    if (task.priority === 'critical') {
      factors.push('高优先级任务')
    }

    return factors
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    delayRisk: string,
    riskFactors: string[],
    task: Task
  ): string[] {
    const recommendations: string[] = []

    if (delayRisk === 'high') {
      recommendations.push('建议立即召开风险评估会议，制定应对措施')
      recommendations.push('考虑增加人力或资源投入')
      recommendations.push('重新评估任务优先级和依赖关系')
    }

    if (riskFactors.includes('进度严重滞后')) {
      recommendations.push('分析进度滞后的根本原因，采取纠正措施')
    }

    if (riskFactors.includes('多个未解决阻碍')) {
      recommendations.push('优先处理阻碍任务，及时上报无法解决的阻碍')
    }

    if (riskFactors.includes('工期紧张')) {
      recommendations.push('制定详细的进度计划，监控每日进展')
    }

    if (task.priority === 'critical') {
      recommendations.push('加强关键路径任务的监控和支持')
    }

    if (recommendations.length === 0) {
      recommendations.push('继续保持良好进展，定期检查任务状态')
    }

    return recommendations
  }

  /**
   * 计算任务的偏差率数组
   */
  private calculateDeviationRates(tasks: Task[]): number[] {
    const deviationRates: number[] = []

    for (const task of tasks) {
      const baseDuration = this.calculateBaseDuration(task)
      const actualDuration = this.calculateActualDuration(task)

      if (baseDuration && actualDuration) {
        const deviationRate = calculateDeviationRate(baseDuration, actualDuration)
        deviationRates.push(deviationRate)
      }
    }

    return deviationRates
  }

  /**
   * 获取常见延期原因
   */
  private async getCommonDelayReasons(projectId: string): Promise<string[]> {
    // 注意：原代码中用 projectId 查询 task_id 字段，按原逻辑保留
    const delays = await executeSQL(
      'SELECT reason FROM task_delay_history WHERE task_id = ? LIMIT 50',
      [projectId]
    )

    if (!delays || delays.length === 0) {
      return []
    }

    // 统计原因频率
    const reasonCount = groupBy(delays, (d: any) => d.reason)
    const sortedReasons = Object.entries(reasonCount)
      .sort((a, b) => (b[1] as any[]).length - (a[1] as any[]).length)
      .slice(0, 5)
      .map(([reason]) => reason)

    return sortedReasons
  }

  /**
   * 获取任务类型洞察
   */
  private async getTaskTypeInsights(
    projectId: string
  ): Promise<
    Array<{
      task_type: string
      avg_duration: number
      avg_deviation: number
      sample_size: number
    }>
  > {
    const tasksRaw = await executeSQL(
      'SELECT * FROM tasks WHERE project_id = ? AND status = ?',
      [projectId, 'completed']
    )

    if (!tasksRaw || tasksRaw.length === 0) {
      return []
    }

    const tasks: Task[] = tasksRaw.map((t: any) => {
      if (t.dependencies && typeof t.dependencies === 'string') {
        try { t.dependencies = JSON.parse(t.dependencies) } catch { t.dependencies = [] }
      }
      return t as Task
    })

    // 提取任务类型（简化版，实际应使用专门的类型字段）
    const typeGroups = groupBy(tasks, (task) => {
      if (task.title.includes('设计')) return '设计'
      if (task.title.includes('施工')) return '施工'
      if (task.title.includes('验收')) return '验收'
      if (task.title.includes('材料')) return '材料'
      if (task.title.includes('安装')) return '安装'
      return '其他'
    })

    const insights = Object.entries(typeGroups).map(([taskType, typeTasks]) => {
      const taskArr = typeTasks as Task[]
      const durations = taskArr
        .map((t) => this.calculateBaseDuration(t))
        .filter((d): d is number => d !== null)

      const deviations = this.calculateDeviationRates(taskArr)

      return {
        task_type: taskType,
        avg_duration: Math.round(calculateAverage(durations)),
        avg_deviation: Math.round(calculateAverage(deviations) * 100) / 100,
        sample_size: taskArr.length,
      }
    })

    return insights.sort((a, b) => b.sample_size - a.sample_size)
  }

  /**
   * 获取负责人洞察
   */
  private async getAssigneeInsights(
    projectId: string
  ): Promise<
    Array<{
      assignee: string
      avg_deviation: number
      task_count: number
    }>
  > {
    const tasksRaw = await executeSQL(
      'SELECT * FROM tasks WHERE project_id = ? AND status = ? AND assignee IS NOT NULL',
      [projectId, 'completed']
    )

    if (!tasksRaw || tasksRaw.length === 0) {
      return []
    }

    const tasks: Task[] = tasksRaw.map((t: any) => {
      if (t.dependencies && typeof t.dependencies === 'string') {
        try { t.dependencies = JSON.parse(t.dependencies) } catch { t.dependencies = [] }
      }
      return t as Task
    })

    // 按负责人分组
    const assigneeGroups = groupBy(tasks, (task) => task.assignee || '未知')

    const insights = Object.entries(assigneeGroups).map(([assignee, assigneeTasks]) => {
      const taskArr = assigneeTasks as Task[]
      const deviations = this.calculateDeviationRates(taskArr)

      return {
        assignee: assignee,
        avg_deviation: Math.round(calculateAverage(deviations) * 100) / 100,
        task_count: taskArr.length,
      }
    })

    return insights.sort((a, b) => b.task_count - a.task_count)
  }
}
