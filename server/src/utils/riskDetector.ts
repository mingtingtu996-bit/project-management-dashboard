// 风险检测核心逻辑
// 检测任务延期、开工条件、阻碍、证照过期等风险

import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { logger } from '../middleware/logger.js'
import type { Task, TaskCondition, TaskObstacle, PreMilestone, Risk } from '../types/db.js'

// 风险等级定义
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low'

// 风险类型定义
export type RiskType = 
  | 'task_delay'           // 任务延期
  | 'condition_unmet'      // 开工条件未满足
  | 'obstacle_unresolved'  // 阻碍未解决
  | 'license_expiry'       // 证照过期

// 检测到的风险项
export interface DetectedRisk {
  type: RiskType
  level: RiskLevel
  projectId: string
  title: string
  description: string
  relatedId: string          // 关联的任务/条件/阻碍/证照ID
  relatedType: 'task' | 'condition' | 'obstacle' | 'premilestone'
  dueDate?: string           // 到期日期（用于排序）
  daysRemaining?: number     // 剩余天数
}

// 风险检测结果
export interface RiskDetectionResult {
  totalCount: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  risks: DetectedRisk[]
}

export class RiskDetector {
  /**
   * 执行所有风险检测
   */
  async detectAllRisks(): Promise<RiskDetectionResult> {
    logger.info('Starting risk detection...')
    const startTime = Date.now()

    const allRisks: DetectedRisk[] = []

    // 并行执行所有检测
    const [
      delayRisks,
      conditionRisks,
      obstacleRisks,
      licenseRisks
    ] = await Promise.all([
      this.detectTaskDelayRisks(),
      this.detectConditionRisks(),
      this.detectObstacleRisks(),
      this.detectLicenseExpiryRisks()
    ])

    allRisks.push(...delayRisks, ...conditionRisks, ...obstacleRisks, ...licenseRisks)

    // 按等级和日期排序
    allRisks.sort((a, b) => {
      const levelOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      if (levelOrder[a.level] !== levelOrder[b.level]) {
        return levelOrder[a.level] - levelOrder[b.level]
      }
      // 同等级按剩余天数排序
      if (a.daysRemaining !== undefined && b.daysRemaining !== undefined) {
        return a.daysRemaining - b.daysRemaining
      }
      return 0
    })

    const result: RiskDetectionResult = {
      totalCount: allRisks.length,
      criticalCount: allRisks.filter(r => r.level === 'critical').length,
      highCount: allRisks.filter(r => r.level === 'high').length,
      mediumCount: allRisks.filter(r => r.level === 'medium').length,
      lowCount: allRisks.filter(r => r.level === 'low').length,
      risks: allRisks
    }

    const duration = Date.now() - startTime
    logger.info('Risk detection completed', {
      duration: `${duration}ms`,
      totalRisks: result.totalCount,
      critical: result.criticalCount,
      high: result.highCount,
      medium: result.mediumCount,
      low: result.lowCount
    })

    return result
  }

  /**
   * 1. 任务延期预警检测
   * - 严重（已延期）：计划完成日期 < 当前日期
   * - 高（即将延期）：计划完成日期 < 当前日期 + 3天
   * - 中（注意）：计划完成日期 < 当前日期 + 7天
   */
  private async detectTaskDelayRisks(): Promise<DetectedRisk[]> {
    const risks: DetectedRisk[] = []
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    try {
      // 获取所有未完成的、有截止日期的任务
      const tasks: Task[] = await executeSQL(
        `SELECT * FROM tasks WHERE status != 'completed' AND end_date IS NOT NULL`
      )

      for (const task of tasks) {
        const endDate = new Date(task.end_date!)
        const daysDiff = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        let level: RiskLevel | null = null
        let title = ''
        let description = ''

        if (daysDiff < 0) {
          // 已延期
          level = 'critical'
          title = `任务已延期: ${task.title}`
          description = `任务"${task.title}"已延期 ${Math.abs(daysDiff)} 天，计划完成日期为 ${task.end_date}`
        } else if (daysDiff <= 3) {
          // 即将延期（3天内）
          level = 'high'
          title = `任务即将延期: ${task.title}`
          description = `任务"${task.title}"将在 ${daysDiff} 天内到期，请尽快处理`
        } else if (daysDiff <= 7) {
          // 注意（7天内）
          level = 'medium'
          title = `任务即将到期: ${task.title}`
          description = `任务"${task.title}"将在 ${daysDiff} 天内到期，请关注进度`
        }

        if (level) {
          risks.push({
            type: 'task_delay',
            level,
            projectId: task.project_id,
            title,
            description,
            relatedId: task.id,
            relatedType: 'task',
            dueDate: task.end_date,
            daysRemaining: daysDiff
          })
        }
      }

      logger.debug('Task delay risks detected', { count: risks.length })
    } catch (error) {
      logger.error('Error detecting task delay risks', { error })
    }

    return risks
  }

  /**
   * 2. 开工条件未满足预警
   * 检测条件：任务的 condition 状态包含"未满足"
   * 预警等级：根据未满足条件数量
   */
  private async detectConditionRisks(): Promise<DetectedRisk[]> {
    const risks: DetectedRisk[] = []

    try {
      // 获取所有未满足的条件
      const conditions: TaskCondition[] = await executeSQL(
        `SELECT * FROM task_conditions WHERE is_met = 0`
      )
      
      // 按任务分组统计
      const taskConditionsMap = new Map<string, { task: Task; conditions: TaskCondition[] }>()

      for (const condition of conditions) {
        const task: Task | null = await executeSQLOne(
          'SELECT * FROM tasks WHERE id = ? LIMIT 1',
          [condition.task_id]
        )
        if (task && task.status !== 'completed') {
          if (!taskConditionsMap.has(task.id)) {
            taskConditionsMap.set(task.id, { task, conditions: [] })
          }
          taskConditionsMap.get(task.id)!.conditions.push(condition)
        }
      }

      // 为每个有未满足条件的任务生成风险
      for (const [taskId, { task, conditions: taskConds }] of taskConditionsMap) {
        const unmetCount = taskConds.length
        
        let level: RiskLevel
        if (unmetCount >= 3) {
          level = 'high'
        } else if (unmetCount >= 2) {
          level = 'medium'
        } else {
          level = 'low'
        }

        const conditionNames = taskConds.map(c => c.condition_name).join('、')
        
        risks.push({
          type: 'condition_unmet',
          level,
          projectId: task.project_id,
          title: `开工条件未满足: ${task.title}`,
          description: `任务"${task.title}"有 ${unmetCount} 项开工条件未满足：${conditionNames}，请尽快处理`,
          relatedId: taskId,
          relatedType: 'task'
        })
      }

      logger.debug('Condition risks detected', { count: risks.length })
    } catch (error) {
      logger.error('Error detecting condition risks', { error })
    }

    return risks
  }

  /**
   * 3. 阻碍未解决预警
   * 检测条件：task_obstacles 状态为"处理中"超过3天
   * - 高：超过7天未解决
   * - 中：超过3天未解决
   */
  private async detectObstacleRisks(): Promise<DetectedRisk[]> {
    const risks: DetectedRisk[] = []
    const now = new Date()

    try {
      // 获取所有处理中的阻碍（非已解决）
      const obstacles: TaskObstacle[] = await executeSQL(
        `SELECT * FROM task_obstacles WHERE status != 'resolved'`
      )

      for (const obstacle of obstacles) {
        const createdAt = new Date(obstacle.created_at)
        const daysUnresolved = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))

        let level: RiskLevel | null = null
        let title = ''
        let description = ''

        if (daysUnresolved > 7) {
          level = 'high'
          title = `阻碍长期未解决`
          description = `阻碍"${obstacle.description}"已处理中 ${daysUnresolved} 天未解决，请重点关注`
        } else if (daysUnresolved > 3) {
          level = 'medium'
          title = `阻碍处理中`
          description = `阻碍"${obstacle.description}"已处理中 ${daysUnresolved} 天，请关注处理进度`
        }

        if (level) {
          const task: Task | null = await executeSQLOne(
            'SELECT * FROM tasks WHERE id = ? LIMIT 1',
            [obstacle.task_id]
          )
          if (task) {
            risks.push({
              type: 'obstacle_unresolved',
              level,
              projectId: task.project_id,
              title,
              description,
              relatedId: obstacle.id,
              relatedType: 'obstacle'
            })
          }
        }
      }

      logger.debug('Obstacle risks detected', { count: risks.length })
    } catch (error) {
      logger.error('Error detecting obstacle risks', { error })
    }

    return risks
  }

  /**
   * 4. 证照过期预警
   * 检测条件：pre_milestones 的 expiry_date < 当前日期 + 60天
   * - 严重：已过期
   * - 高：30天内过期
   * - 中：60天内过期
   */
  private async detectLicenseExpiryRisks(): Promise<DetectedRisk[]> {
    const risks: DetectedRisk[] = []
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    try {
      // 获取所有有到期日期的证照（60天内或已过期）
      const cutoffDate = new Date(today)
      cutoffDate.setDate(cutoffDate.getDate() + 60)
      const cutoffStr = cutoffDate.toISOString().split('T')[0]

      const milestones: PreMilestone[] = await executeSQL(
        `SELECT * FROM pre_milestones WHERE expiry_date IS NOT NULL AND expiry_date <= ?`,
        [cutoffStr]
      )

      for (const milestone of milestones) {
        if (!milestone.expiry_date) continue

        const expiryDate = new Date(milestone.expiry_date)
        const daysDiff = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        let level: RiskLevel | null = null
        let title = ''
        let description = ''

        if (daysDiff < 0) {
          // 已过期
          level = 'critical'
          title = `证照已过期: ${milestone.milestone_name}`
          description = `${milestone.milestone_name}已过期 ${Math.abs(daysDiff)} 天，请立即处理延期或重新申请`
        } else if (daysDiff <= 30) {
          // 30天内过期
          level = 'high'
          title = `证照即将过期: ${milestone.milestone_name}`
          description = `${milestone.milestone_name}将在 ${daysDiff} 天内过期，请尽快办理延期`
        } else if (daysDiff <= 60) {
          // 60天内过期
          level = 'medium'
          title = `证照即将到期: ${milestone.milestone_name}`
          description = `${milestone.milestone_name}将在 ${daysDiff} 天内过期，请关注办理进度`
        }

        if (level) {
          risks.push({
            type: 'license_expiry',
            level,
            projectId: milestone.project_id,
            title,
            description,
            relatedId: milestone.id,
            relatedType: 'premilestone',
            dueDate: milestone.expiry_date,
            daysRemaining: daysDiff
          })
        }
      }

      logger.debug('License expiry risks detected', { count: risks.length })
    } catch (error) {
      logger.error('Error detecting license expiry risks', { error })
    }

    return risks
  }

  /**
   * 将检测到的风险转换为数据库 Risk 记录格式
   */
  convertToRiskRecord(detectedRisk: DetectedRisk): Omit<Risk, 'id' | 'created_at' | 'updated_at'> {
    // 根据风险等级设置概率和影响
    const probabilityImpactMap: Record<RiskLevel, { probability: number; impact: number }> = {
      critical: { probability: 0.9, impact: 5 },
      high: { probability: 0.7, impact: 4 },
      medium: { probability: 0.5, impact: 3 },
      low: { probability: 0.3, impact: 2 }
    }

    const { probability, impact } = probabilityImpactMap[detectedRisk.level]

    // 风险类型映射到 category
    const categoryMap: Record<RiskType, Risk['category']> = {
      task_delay: 'schedule',
      condition_unmet: 'resource',
      obstacle_unresolved: 'external',
      license_expiry: 'external'
    }

    return {
      project_id: detectedRisk.projectId,
      title: detectedRisk.title,
      description: detectedRisk.description,
      category: categoryMap[detectedRisk.type],
      probability,
      impact,
      status: 'identified',
      mitigation_plan: this.generateMitigationPlan(detectedRisk),
      version: 1
    }
  }

  /**
   * 生成风险缓解建议
   */
  private generateMitigationPlan(detectedRisk: DetectedRisk): string {
    switch (detectedRisk.type) {
      case 'task_delay':
        return '建议：1) 评估延期原因；2) 调整资源分配；3) 与相关方沟通新的完成日期；4) 更新项目计划'
      case 'condition_unmet':
        return '建议：1) 明确未满足条件的具体要求；2) 指定责任人跟进；3) 制定满足条件的时间计划；4) 条件满足后及时确认'
      case 'obstacle_unresolved':
        return '建议：1) 升级阻碍到管理层；2) 召开专项协调会议；3) 寻求外部资源支持；4) 制定应急预案'
      case 'license_expiry':
        return '建议：1) 立即启动延期申请流程；2) 准备所需材料；3) 与相关部门确认办理时间；4) 考虑临时许可方案'
      default:
        return '建议：及时跟进处理，必要时升级至管理层'
    }
  }
}

// 导出单例实例
export const riskDetector = new RiskDetector()
