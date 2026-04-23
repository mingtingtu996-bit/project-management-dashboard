// AI工期服务 - Phase 2（基于 Supabase PostgreSQL）

import { executeSQL, executeSQLOne } from './dbService.js'
import type { AIDurationEstimate, Task } from '../types/db.js'

function isMissingAIDurationEstimatesTable(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''

  if (!message) return false

  return message.includes('ai_duration_estimates') && (
    /could not find the table/i.test(message) ||
    /does not exist/i.test(message)
  )
}

export interface DurationEstimateInput {
  task_id: string
  task_type?: string
  category?: string
  project_id: string
  building_type?: string
  total_area?: number
  historical_data?: boolean // 是否使用历史数据
}

export interface DurationCorrectionInput {
  task_id: string
  corrected_duration: number
  correction_reason: string
  approved_by: string
}

export class AIDurationService {

  /**
   * AI工期估算
   * 基于任务类型、历史数据、工程量计算工期
   */
  async estimateDuration(input: DurationEstimateInput): Promise<AIDurationEstimate> {
    // 获取任务信息
    const task = await executeSQLOne<any>(
      'SELECT * FROM tasks WHERE id = ? LIMIT 1',
      [input.task_id]
    )

    if (!task) {
      throw new Error('任务不存在')
    }

    // 获取项目信息
    const project = await executeSQLOne<any>(
      'SELECT * FROM projects WHERE id = ? LIMIT 1',
      [input.project_id]
    )

    if (!project) {
      throw new Error('项目不存在')
    }

    // 获取相似任务的历史数据
    let historicalWeight = 0.3
    if (input.historical_data) {
      const historicalData = await this.getHistoricalData(
        task.task_type || '',
        input.building_type || project.building_type || ''
      )
      
      if (historicalData.length > 0) {
        // 有历史数据，增加权重
        historicalWeight = 0.5
      }
    }

    // 任务类型因子
    const taskTypeFactor = this.getTaskTypeFactor(task.task_type || '')

    // 项目规模因子
    const projectScaleFactor = this.getProjectScaleFactor(
      project.total_area || 0,
      project.building_count || 1
    )

    // 地区因子
    const regionalFactor = this.getRegionalFactor(
      project.province || '',
      project.city || ''
    )

    // 季节因子
    const seasonalFactor = this.getSeasonalFactor(new Date())

    // 基础工期（根据任务类型）
    const baseDuration = this.getBaseDuration(task.task_type || '')

    // 计算修正后工期
    const estimatedDuration = Math.round(
      baseDuration *
      (1 + taskTypeFactor + projectScaleFactor + regionalFactor + seasonalFactor) *
      (1 + historicalWeight * 0.5) // 历史数据影响
    )

    // 计算置信度
    const confidenceScore = this.calculateConfidenceScore({
      hasHistoricalData: input.historical_data ?? false,
      taskTypeKnown: !!task.task_type,
      projectKnown: !!project.total_area,
      regionalKnown: !!project.province,
    })

    const confidenceLevel = this.getConfidenceLevel(confidenceScore)

    const estimate: AIDurationEstimate = {
      id: crypto.randomUUID(),
      task_id: input.task_id,
      project_id: input.project_id,
      base_duration: baseDuration,
      adjusted_duration: Math.max(1, estimatedDuration),
      estimated_duration: Math.max(1, estimatedDuration),
      confidence_level: confidenceLevel as any,
      confidence_score: confidenceScore,
      factors: {
        historical_data_weight: historicalWeight,
        task_type_factor: taskTypeFactor,
        project_scale_factor: projectScaleFactor,
        regional_factor: regionalFactor,
        seasonal_factor: seasonalFactor,
      },
      reasoning: `基于任务类型"${task.task_type || '未知'}"和项目规模计算`,
      model_version: '1.0.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // live 库若尚未补齐 AI 估算历史表，不阻断前台拿到估算结果
    try {
      await this.saveEstimate(estimate)
    } catch (error) {
      if (!isMissingAIDurationEstimatesTable(error)) {
        throw error
      }
    }

    return estimate
  }

  /**
   * AI工期修正
   * 人工调整后重新计算工期
   */
  async correctDuration(input: DurationCorrectionInput): Promise<AIDurationEstimate> {
    // 获取原估算结果
    const originalEstimate = await executeSQLOne<AIDurationEstimate>(
      'SELECT * FROM ai_duration_estimates WHERE task_id = ? ORDER BY created_at DESC LIMIT 1',
      [input.task_id]
    )

    if (!originalEstimate) {
      throw new Error('未找到原始估算结果')
    }

    // 创建新的修正记录
    const correctedEstimate: AIDurationEstimate = {
      ...originalEstimate,
      id: crypto.randomUUID(),
      estimated_duration: input.corrected_duration,
      adjusted_duration: input.corrected_duration,
      reasoning: input.correction_reason,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // 保存修正结果
    await this.saveEstimate(correctedEstimate)

    return correctedEstimate
  }

  /**
   * 获取工期置信度
   */
  async getConfidence(taskId: string): Promise<AIDurationEstimate | null> {
    try {
      const data = await executeSQLOne<AIDurationEstimate>(
        'SELECT * FROM ai_duration_estimates WHERE task_id = ? ORDER BY created_at DESC LIMIT 1',
        [taskId]
      )

      return data ?? null
    } catch (error) {
      if (isMissingAIDurationEstimatesTable(error)) {
        return null
      }
      throw error
    }
  }

  /**
   * 获取历史数据
   */
  private async getHistoricalData(taskType: string, buildingType: string): Promise<any[]> {
    // 两步查询避免 JOIN 正则截断
    const taskData = await executeSQL<any>(
      `SELECT id, task_type, start_date, end_date, project_id
       FROM tasks
       WHERE task_type = ?
         AND status = 'completed'
         AND start_date IS NOT NULL
         AND end_date IS NOT NULL
       LIMIT 10`,
      [taskType]
    )

    if (!taskData || taskData.length === 0) return []

    // 获取关联的项目信息
    const projectIds = [...new Set(taskData.map(t => t.project_id).filter(Boolean))]
    const projectMap = new Map<string, any>()
    for (const pid of projectIds) {
      const proj = await executeSQLOne('SELECT building_type, total_area FROM projects WHERE id = ? LIMIT 1', [pid])
      if (proj) projectMap.set(pid as string, proj)
    }

    // 合并数据
    return taskData.map((t: any) => {
      const proj = projectMap.get(t.project_id)
      return {
        id: t.id,
        task_type: t.task_type,
        start_date: t.start_date,
        end_date: t.end_date,
        building_type: proj?.building_type ?? null,
        total_area: proj?.total_area ?? null,
      }
    })
  }

  /**
   * 获取任务类型因子
   */
  private getTaskTypeFactor(taskType: string): number {
    const factors: Record<string, number> = {
      '土方工程': -0.1,
      '地基基础': 0.0,
      '主体结构': 0.2,
      '装修工程': 0.1,
      '设备安装': 0.05,
      '园林绿化': -0.05,
      '其他': 0.0,
    }

    return factors[taskType] || 0.0
  }

  /**
   * 获取项目规模因子
   */
  private getProjectScaleFactor(totalArea: number, buildingCount: number): number {
    if (totalArea < 10000) return -0.1
    if (totalArea < 50000) return 0.0
    if (totalArea < 100000) return 0.1
    return 0.2
  }

  /**
   * 获取地区因子
   */
  private getRegionalFactor(province: string, city: string): number {
    // 简化处理：一线城市略微增加工期
    const tier1Cities = ['北京', '上海', '广州', '深圳']
    const tier2Cities = ['杭州', '南京', '武汉', '成都', '重庆', '天津', '苏州']

    if (tier1Cities.includes(city)) return 0.1
    if (tier2Cities.includes(city)) return 0.05
    return 0.0
  }

  /**
   * 获取季节因子
   */
  private getSeasonalFactor(date: Date): number {
    const month = date.getMonth() + 1

    // 冬季施工难度大
    if (month >= 11 || month <= 2) return 0.15
    
    // 梅雨季节（6-7月）
    if (month === 6 || month === 7) return 0.1
    
    // 最佳施工季节（3-5月，9-10月）
    if ((month >= 3 && month <= 5) || (month === 9 || month === 10)) return -0.05

    return 0.0
  }

  /**
   * 获取基础工期
   */
  private getBaseDuration(taskType: string): number {
    const durations: Record<string, number> = {
      '土方工程': 15, // 天
      '地基基础': 30,
      '主体结构': 60,
      '装修工程': 45,
      '设备安装': 20,
      '园林绿化': 30,
      '其他': 20,
    }

    return durations[taskType] || 20
  }

  /**
   * 计算置信度分数
   */
  private calculateConfidenceScore(params: {
    hasHistoricalData: boolean
    taskTypeKnown: boolean
    projectKnown: boolean
    regionalKnown: boolean
  }): number {
    let score = 50

    if (params.hasHistoricalData) score += 20
    if (params.taskTypeKnown) score += 15
    if (params.projectKnown) score += 10
    if (params.regionalKnown) score += 5

    return Math.min(100, score)
  }

  /**
   * 获取置信度等级
   */
  private getConfidenceLevel(score: number): 'high' | 'medium' | 'low' {
    if (score >= 80) return 'high'
    if (score >= 60) return 'medium'
    return 'low'
  }

  /**
   * 保存估算结果
   */
  private async saveEstimate(estimate: AIDurationEstimate): Promise<void> {
    await executeSQL(
      `INSERT INTO ai_duration_estimates
         (id, task_id, project_id, base_duration, adjusted_duration, estimated_duration,
          confidence_level, confidence_score, adjustment_factors, factors, reasoning,
          model_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         adjusted_duration = VALUES(adjusted_duration),
         estimated_duration = VALUES(estimated_duration),
         confidence_score = VALUES(confidence_score),
         updated_at = VALUES(updated_at)`,
      [
        estimate.id,
        estimate.task_id,
        estimate.project_id,
        estimate.base_duration,
        estimate.adjusted_duration,
        estimate.estimated_duration ?? estimate.adjusted_duration,
        String(estimate.confidence_level),
        estimate.confidence_score ?? 0,
        JSON.stringify(estimate.adjustment_factors ?? null),
        JSON.stringify(estimate.factors ?? null),
        estimate.reasoning ?? null,
        estimate.model_version ?? '1.0.0',
        estimate.created_at,
        estimate.updated_at,
      ]
    )
  }
}
