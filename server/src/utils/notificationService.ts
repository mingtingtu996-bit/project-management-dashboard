// 通知服务
// 处理风险预警的通知生成和记录

import { v4 as uuidv4 } from 'uuid'
import { executeSQL, executeSQLOne, getRisks, createRisk, updateRisk, getMembers } from '../services/dbService.js'
import { logger } from '../middleware/logger.js'
import type { DetectedRisk, RiskLevel, RiskType } from './riskDetector.js'
import type { Risk } from '../types/db.js'

// 通知渠道
export type NotificationChannel = 'in_app' | 'email' | 'sms'

// 通知记录
export interface NotificationRecord {
  id: string
  riskId: string
  projectId: string
  channel: NotificationChannel
  title: string
  content: string
  recipients: string[]
  sentAt: string
  status: 'pending' | 'sent' | 'failed'
  errorMessage?: string
}

// 通知配置
export interface NotificationConfig {
  channels: NotificationChannel[]
  minRiskLevel: RiskLevel
  digestMode: boolean        // 是否合并发送摘要
  digestInterval: number     // 摘要间隔（小时）
}

// 默认通知配置
const DEFAULT_CONFIG: NotificationConfig = {
  channels: ['in_app'],
  minRiskLevel: 'medium',
  digestMode: true,
  digestInterval: 24
}

export class NotificationService {
  private config: NotificationConfig

  constructor(config: Partial<NotificationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 处理检测到的风险，生成通知并写入数据库
   */
  async processDetectedRisks(detectedRisks: DetectedRisk[]): Promise<{
    risksCreated: number
    notificationsCreated: number
    errors: string[]
  }> {
    const result = {
      risksCreated: 0,
      notificationsCreated: 0,
      errors: [] as string[]
    }

    logger.info('Processing detected risks for notification', {
      totalRisks: detectedRisks.length
    })

    for (const detectedRisk of detectedRisks) {
      try {
        // 检查是否已存在相同的风险（避免重复创建）
        const existingRisk = await this.findExistingRisk(detectedRisk)
        
        if (existingRisk) {
          // 更新现有风险（如果等级变化）
          await this.updateExistingRisk(existingRisk, detectedRisk)
          logger.debug('Updated existing risk', {
            riskId: existingRisk.id,
            type: detectedRisk.type
          })
        } else {
          // 创建新风险记录
          const newRisk = await this.createRiskRecord(detectedRisk)
          result.risksCreated++

          // 创建通知记录
          await this.createNotification(newRisk, detectedRisk)
          result.notificationsCreated++

          logger.info('Created new risk and notification', {
            riskId: newRisk.id,
            type: detectedRisk.type,
            level: detectedRisk.level
          })
        }
      } catch (error: any) {
        const errorMsg = `Failed to process risk ${detectedRisk.type}: ${error.message}`
        logger.error(errorMsg, { error, detectedRisk })
        result.errors.push(errorMsg)
      }
    }

    logger.info('Risk processing completed', {
      risksCreated: result.risksCreated,
      notificationsCreated: result.notificationsCreated,
      errors: result.errors.length
    })

    return result
  }

  /**
   * 查找是否已存在相同的风险记录
   */
  private async findExistingRisk(detectedRisk: DetectedRisk): Promise<Risk | null> {
    try {
      const risks = await getRisks(detectedRisk.projectId)
      return risks.find(r => 
        r.status !== 'closed' &&
        r.title === detectedRisk.title &&
        r.description === detectedRisk.description
      ) || null
    } catch (error) {
      logger.error('Error finding existing risk', { error })
      return null
    }
  }

  /**
   * 更新现有风险记录
   */
  private async updateExistingRisk(existingRisk: Risk, detectedRisk: DetectedRisk): Promise<void> {
    // 如果风险等级变化，更新风险记录
    const { probability, impact } = this.getProbabilityImpact(detectedRisk.level)
    
    if (existingRisk.probability !== probability || existingRisk.impact !== impact) {
      await updateRisk(existingRisk.id, {
        probability,
        impact
      }, existingRisk.version)
      
      logger.info('Risk level updated', {
        riskId: existingRisk.id,
        oldLevel: `${existingRisk.probability}-${existingRisk.impact}`,
        newLevel: `${probability}-${impact}`
      })
    }
  }

  /**
   * 创建风险记录
   */
  private async createRiskRecord(detectedRisk: DetectedRisk): Promise<Risk> {
    const { probability, impact } = this.getProbabilityImpact(detectedRisk.level)
    
    const categoryMap: Record<RiskType, Risk['category']> = {
      task_delay: 'schedule',
      condition_unmet: 'resource',
      obstacle_unresolved: 'external',
      license_expiry: 'external'
    }

    const risk = await createRisk({
      project_id: detectedRisk.projectId,
      title: detectedRisk.title,
      description: detectedRisk.description,
      category: categoryMap[detectedRisk.type],
      probability,
      impact,
      status: 'identified',
      mitigation_plan: this.generateMitigationPlan(detectedRisk),
      version: 1
    } as any)

    return risk
  }

  /**
   * 创建通知记录
   */
  private async createNotification(risk: Risk, detectedRisk: DetectedRisk): Promise<void> {
    // 获取项目成员作为通知接收者
    const members = await getMembers(detectedRisk.projectId)
    const recipients = members
      .filter(m => ['owner', 'admin', 'editor'].includes(m.role))
      .map(m => m.user_id)

    if (recipients.length === 0) {
      logger.warn('No recipients found for notification', {
        projectId: detectedRisk.projectId,
        riskId: risk.id
      })
      return
    }

    // 构建通知内容
    const now = new Date().toISOString()
    const notificationId = uuidv4()
    const recipientsJson = JSON.stringify(recipients)

    await executeSQL(
      `INSERT INTO notifications (id, risk_id, project_id, type, level, title, content, recipients, channel, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        notificationId,
        risk.id,
        detectedRisk.projectId,
        detectedRisk.type,
        detectedRisk.level,
        this.buildNotificationTitle(detectedRisk),
        this.buildNotificationContent(detectedRisk, risk),
        recipientsJson,
        'in_app',
        'unread',
        now
      ]
    )
  }

  /**
   * 构建通知标题
   */
  private buildNotificationTitle(detectedRisk: DetectedRisk): string {
    const levelText = {
      critical: '【严重】',
      high: '【高】',
      medium: '【中】',
      low: '【低】'
    }
    return `${levelText[detectedRisk.level]} ${detectedRisk.title}`
  }

  /**
   * 构建通知内容
   */
  private buildNotificationContent(detectedRisk: DetectedRisk, risk: Risk): string {
    const lines: string[] = [
      detectedRisk.description,
      '',
      `风险等级: ${this.getLevelText(detectedRisk.level)}`,
      `风险类型: ${this.getTypeText(detectedRisk.type)}`,
    ]

    if (detectedRisk.daysRemaining !== undefined) {
      if (detectedRisk.daysRemaining < 0) {
        lines.push(`已过期: ${Math.abs(detectedRisk.daysRemaining)} 天`)
      } else {
        lines.push(`剩余时间: ${detectedRisk.daysRemaining} 天`)
      }
    }

    if (risk.mitigation_plan) {
      lines.push('', '缓解建议:', risk.mitigation_plan)
    }

    return lines.join('\n')
  }

  /**
   * 获取概率和影响值
   */
  private getProbabilityImpact(level: RiskLevel): { probability: number; impact: number } {
    const map: Record<RiskLevel, { probability: number; impact: number }> = {
      critical: { probability: 0.9, impact: 5 },
      high: { probability: 0.7, impact: 4 },
      medium: { probability: 0.5, impact: 3 },
      low: { probability: 0.3, impact: 2 }
    }
    return map[level]
  }

  /**
   * 获取风险等级文本
   */
  private getLevelText(level: RiskLevel): string {
    const map: Record<RiskLevel, string> = {
      critical: '严重',
      high: '高',
      medium: '中',
      low: '低'
    }
    return map[level]
  }

  /**
   * 获取风险类型文本
   */
  private getTypeText(type: RiskType): string {
    const map: Record<RiskType, string> = {
      task_delay: '任务延期',
      condition_unmet: '开工条件未满足',
      obstacle_unresolved: '阻碍未解决',
      license_expiry: '证照过期'
    }
    return map[type]
  }

  /**
   * 生成缓解建议
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

  /**
   * 发送风险摘要报告
   */
  async sendRiskDigest(projectId: string, risks: DetectedRisk[]): Promise<void> {
    if (risks.length === 0) return

    const members = await getMembers(projectId)
    const recipients = members
      .filter(m => ['owner', 'admin'].includes(m.role))
      .map(m => m.user_id)

    if (recipients.length === 0) return

    const criticalCount = risks.filter(r => r.level === 'critical').length
    const highCount = risks.filter(r => r.level === 'high').length
    const mediumCount = risks.filter(r => r.level === 'medium').length

    const title = `项目风险日报 - ${new Date().toLocaleDateString('zh-CN')}`
    const content = [
      `本日检测到 ${risks.length} 项风险：`,
      `- 严重: ${criticalCount} 项`,
      `- 高: ${highCount} 项`,
      `- 中: ${mediumCount} 项`,
      '',
      '详细风险列表：',
      ...risks.map((r, i) => `${i + 1}. [${this.getLevelText(r.level)}] ${r.title}`)
    ].join('\n')

    const digestLevel = criticalCount > 0 ? 'critical' : highCount > 0 ? 'high' : 'medium'
    const now = new Date().toISOString()
    const notificationId = uuidv4()
    const recipientsJson = JSON.stringify(recipients)

    await executeSQL(
      `INSERT INTO notifications (id, risk_id, project_id, type, level, title, content, recipients, channel, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        notificationId,
        '',
        projectId,
        'digest',
        digestLevel,
        title,
        content,
        recipientsJson,
        'in_app',
        'unread',
        now
      ]
    )

    logger.info('Risk digest sent', {
      projectId,
      recipientCount: recipients.length,
      riskCount: risks.length
    })
  }
}

// 导出单例实例
export const notificationService = new NotificationService()
