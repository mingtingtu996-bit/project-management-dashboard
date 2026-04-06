/**
 * 风险预警系统
 * 自动识别项目风险并触发预警
 */

import type { Task } from './localDb'

// 兼容旧数据：获取任务名称，支持 name 或 title 字段
const getTaskName = (task: Task & { name?: string }): string => {
  return task.title || task.name || '未知任务'
}

// 风险类型
export type RiskType = 
  | 'deadline'      // 截止日期风险
  | 'dependency'    // 依赖关系风险
  | 'resource'      // 资源风险
  | 'progress'      // 进度风险
  | 'critical_path' // 关键路径风险
  | 'milestone'     // 里程碑风险（P1-05新增）

// 风险严重程度
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical'

// 风险预警项
export interface RiskAlert {
  id: string
  type: RiskType
  severity: RiskSeverity
  title: string
  description: string
  relatedTaskId?: string
  relatedTaskName?: string
  taskId?: string        // relatedTaskId 的别名，兼容旧代码
  task?: unknown             // 关联任务对象
  建议?: string
  createdAt?: Date
}

// 风险预警配置
export interface RiskAlertConfig {
  deadlineWarningDays: number    // 截止日期提前多少天预警
  progressWarningThreshold: number // 进度落后多少百分比预警
  dependencyCheckEnabled: boolean // 是否检查依赖风险
  autoRefreshInterval: number      // 自动刷新间隔（毫秒）
}

const DEFAULT_CONFIG: RiskAlertConfig = {
  deadlineWarningDays: 3,       // 截止日期前3天预警
  progressWarningThreshold: 20,  // 进度落后20%预警
  dependencyCheckEnabled: true,
  autoRefreshInterval: 60000,    // 1分钟刷新一次
}

/**
 * 计算任务工期（天）
 */
function calculateDuration(startDate?: string, endDate?: string): number {
  if (!startDate || !endDate) return 0
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diff = end.getTime() - start.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

/**
 * 检查截止日期风险
 */
function checkDeadlineRisks(tasks: Task[], config: RiskAlertConfig): RiskAlert[] {
  const alerts: RiskAlert[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  tasks.forEach(task => {
    if (!task.end_date || task.status === 'completed') return

    const endDate = new Date(task.end_date)
    endDate.setHours(0, 0, 0, 0)
    
    const daysUntilDeadline = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntilDeadline < 0) {
      // 已过期
      alerts.push({
        id: `deadline-overdue-${task.id}`,
        type: 'deadline',
        severity: 'critical',
        title: `任务已过期: ${getTaskName(task)}`,
        description: `任务截止日期已过${Math.abs(daysUntilDeadline)}天`,
        relatedTaskId: task.id,
        relatedTaskName: getTaskName(task),
        建议: '立即处理或调整截止日期'
      })
    } else if (daysUntilDeadline <= config.deadlineWarningDays) {
      // 即将到期
      const severity = daysUntilDeadline <= 1 ? 'critical' : 
                       daysUntilDeadline <= 2 ? 'high' : 'medium'
      
      alerts.push({
        id: `deadline-warning-${task.id}`,
        type: 'deadline',
        severity,
        title: `任务即将到期: ${getTaskName(task)}`,
        description: `距离截止日期还有${daysUntilDeadline}天`,
        relatedTaskId: task.id,
        relatedTaskName: getTaskName(task),
        建议: '优先处理或申请延期'
      })
    }
  })

  return alerts
}

/**
 * 检查进度风险
 */
function checkProgressRisks(tasks: Task[], config: RiskAlertConfig): RiskAlert[] {
  const alerts: RiskAlert[] = []

  tasks.forEach(task => {
    if (!task.start_date || !task.end_date || task.status === 'completed') return

    const startDate = new Date(task.start_date)
    const endDate = new Date(task.end_date)
    const today = new Date()
    
    // 计算项目应该完成的比例
    const totalDuration = calculateDuration(task.start_date, task.end_date)
    const elapsedDuration = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    
    if (totalDuration <= 0 || elapsedDuration < 0) return

    const expectedProgress = Math.min(100, (elapsedDuration / totalDuration) * 100)
    const actualProgress = task.progress || 0
    const progressGap = expectedProgress - actualProgress

    if (progressGap >= config.progressWarningThreshold) {
      const severity = progressGap >= 40 ? 'critical' :
                       progressGap >= 30 ? 'high' : 'medium'

      alerts.push({
        id: `progress-risk-${task.id}`,
        type: 'progress',
        severity,
        title: `进度落后: ${getTaskName(task)}`,
        description: `预期进度${Math.round(expectedProgress)}%，实际${actualProgress}%，落后${Math.round(progressGap)}%`,
        relatedTaskId: task.id,
        relatedTaskName: getTaskName(task),
        建议: '增加资源或调整计划'
      })
    }
  })

  return alerts
}

/**
 * 检查依赖关系风险
 */
function checkDependencyRisks(tasks: Task[], config: RiskAlertConfig): RiskAlert[] {
  if (!config.dependencyCheckEnabled) return []

  const alerts: RiskAlert[] = []
  const taskMap = new Map(tasks.map(t => [t.id, t]))

  tasks.forEach(task => {
    const dependencies = task.dependencies || []
    
    dependencies.forEach(depId => {
      const depTask = taskMap.get(depId)
      if (!depTask || depTask.status === 'completed') return

      // 检查依赖任务是否可能延期
      if (depTask.end_date) {
        const depEndDate = new Date(depTask.end_date)
        const taskStartDate = task.start_date ? new Date(task.start_date) : null

        // 如果依赖任务的截止日期晚于当前任务的开始日期，存在风险
        if (taskStartDate && depEndDate > taskStartDate) {
          const daysDelay = Math.ceil((depEndDate.getTime() - taskStartDate.getTime()) / (1000 * 60 * 60 * 24))
          
          alerts.push({
            id: `dependency-risk-${task.id}-${depId}`,
            type: 'dependency',
            severity: daysDelay > 5 ? 'high' : 'medium',
            title: `依赖风险: ${getTaskName(task)}`,
            description: `前置任务"${getTaskName(depTask)}"可能延期${daysDelay}天，影响当前任务`,
            relatedTaskId: task.id,
            relatedTaskName: getTaskName(task),
            建议: '关注前置任务进度或准备备选方案'
          })
        }
      }
    })
  })

  return alerts
}

/**
 * 检查关键路径风险
 */
function checkCriticalPathRisks(tasks: Task[], criticalTaskIds: string[]): RiskAlert[] {
  const alerts: RiskAlert[] = []
  const criticalSet = new Set(criticalTaskIds)

  tasks.forEach(task => {
    if (!criticalSet.has(task.id)) return
    if (!task.end_date || task.status === 'completed') return

    const endDate = new Date(task.end_date)
    const today = new Date()
    const daysUntilDeadline = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    // 关键路径上的任务如果有风险，提高严重程度
    if (daysUntilDeadline > 0 && daysUntilDeadline <= 3) {
      alerts.push({
        id: `critical-path-risk-${task.id}`,
        type: 'critical_path',
        severity: daysUntilDeadline <= 1 ? 'critical' : 'high',
        title: `关键路径风险: ${getTaskName(task)}`,
        description: `该任务位于关键路径上，延期将影响项目整体工期`,
        relatedTaskId: task.id,
        relatedTaskName: getTaskName(task),
        建议: '优先保障，关键路径任务不容有失'
      })
    }
  })

  return alerts
}

/**
 * 综合风险评估
 */
export function analyzeRisks(
  tasks: Task[],
  criticalTaskIds: string[] = [],
  config: Partial<RiskAlertConfig> = {}
): RiskAlert[] {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  const allAlerts: RiskAlert[] = []

  // 执行各项风险检查
  allAlerts.push(...checkDeadlineRisks(tasks, finalConfig))
  allAlerts.push(...checkProgressRisks(tasks, finalConfig))
  allAlerts.push(...checkDependencyRisks(tasks, finalConfig))
  allAlerts.push(...checkCriticalPathRisks(tasks, criticalTaskIds))

  // 按严重程度排序
  const severityOrder: Record<RiskSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3
  }

  return allAlerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
}

/**
 * 获取风险统计
 */
export function getRiskStatistics(alerts: RiskAlert[]): {
  total: number
  bySeverity: Record<RiskSeverity, number>
  byType: Record<RiskType, number>
} {
  const bySeverity: Record<RiskSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  }

  const byType: Record<RiskType, number> = {
    deadline: 0,
    dependency: 0,
    resource: 0,
    progress: 0,
    critical_path: 0,
    milestone: 0,
  }

  alerts.forEach(alert => {
    bySeverity[alert.severity]++
    byType[alert.type]++
  })

  return {
    total: alerts.length,
    bySeverity,
    byType
  }
}

/**
 * 生成风险报告
 */
export function generateRiskReport(alerts: RiskAlert[]): string {
  if (alerts.length === 0) {
    return '✅ 当前无风险预警，项目进展正常'
  }

  const stats = getRiskStatistics(alerts)
  let report = `📊 风险预警报告 (共${stats.total}项)\n\n`

  if (stats.bySeverity.critical > 0) {
    report += `🔴 严重: ${stats.bySeverity.critical}项\n`
  }
  if (stats.bySeverity.high > 0) {
    report += `🟠 高风险: ${stats.bySeverity.high}项\n`
  }
  if (stats.bySeverity.medium > 0) {
    report += `🟡 中风险: ${stats.bySeverity.medium}项\n`
  }
  if (stats.bySeverity.low > 0) {
    report += `🟢 低风险: ${stats.bySeverity.low}项\n`
  }

  report += '\n详细风险项:\n'
  alerts.slice(0, 5).forEach((alert, i) => {
    const icon = alert.severity === 'critical' ? '🔴' :
                 alert.severity === 'high' ? '🟠' :
                 alert.severity === 'medium' ? '🟡' : '🟢'
    report += `${i + 1}. ${icon} ${alert.title}\n`
  })

  if (alerts.length > 5) {
    report += `\n...还有${alerts.length - 5}项风险\n`
  }

  return report
}

/**
 * 里程碑专项预警扫描（P1-05）
 * 
 * 扫描所有 is_milestone=true 的任务，根据截止日期生成预警：
 * - 已逾期：critical
 * - 3天内到期：high（一级里程碑加权）
 * - 7天内到期：medium
 * - 14天内到期（一级里程碑）：low
 * 
 * @param tasks - 所有任务（含is_milestone字段）
 * @param earlyWarningDays - 提前预警天数，默认7天
 */
export function scanMilestoneWarnings(
  tasks: (Task & { is_milestone?: boolean; milestone_level?: number })[],
  earlyWarningDays = 7
): RiskAlert[] {
  const alerts: RiskAlert[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 只处理里程碑任务
  const milestoneTasks = tasks.filter(t => t.is_milestone === true && t.status !== 'completed')

  milestoneTasks.forEach(task => {
    if (!task.end_date) return

    const endDate = new Date(task.end_date)
    endDate.setHours(0, 0, 0, 0)
    const daysUntilDeadline = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    const taskName = getTaskName(task)
    const levelLabel = task.milestone_level === 1 ? '一级里程碑' 
      : task.milestone_level === 2 ? '二级里程碑' 
      : task.milestone_level === 3 ? '三级里程碑' 
      : '里程碑'

    if (daysUntilDeadline < 0) {
      // 已逾期
      alerts.push({
        id: `milestone-overdue-${task.id}`,
        type: 'milestone',
        severity: 'critical',
        title: `${levelLabel}已逾期：${taskName}`,
        description: `里程碑截止日期已过 ${Math.abs(daysUntilDeadline)} 天，需立即处理`,
        relatedTaskId: task.id,
        relatedTaskName: taskName,
        建议: task.milestone_level === 1 ? '一级里程碑逾期影响整体工期，请立即上报并制定补救方案' : '尽快完成或调整里程碑计划',
        createdAt: new Date(),
      })
    } else if (daysUntilDeadline === 0) {
      // 今天到期
      alerts.push({
        id: `milestone-today-${task.id}`,
        type: 'milestone',
        severity: task.milestone_level === 1 ? 'critical' : 'high',
        title: `${levelLabel}今日到期：${taskName}`,
        description: '里程碑今天到期，请确认完成状态',
        relatedTaskId: task.id,
        relatedTaskName: taskName,
        建议: '今日必须完成或更新进度',
        createdAt: new Date(),
      })
    } else if (daysUntilDeadline <= 3) {
      // 3天内
      const severity = task.milestone_level === 1 ? 'critical' : 'high'
      alerts.push({
        id: `milestone-3days-${task.id}`,
        type: 'milestone',
        severity,
        title: `${levelLabel}即将到期（${daysUntilDeadline}天）：${taskName}`,
        description: `里程碑距截止日期仅剩 ${daysUntilDeadline} 天`,
        relatedTaskId: task.id,
        relatedTaskName: taskName,
        建议: task.milestone_level === 1 ? '优先保障，一级里程碑接近截止日期' : '安排人员跟进，确保按时完成',
        createdAt: new Date(),
      })
    } else if (daysUntilDeadline <= earlyWarningDays) {
      // earlyWarningDays天内（默认7天）
      alerts.push({
        id: `milestone-warning-${task.id}`,
        type: 'milestone',
        severity: 'medium',
        title: `${levelLabel}需关注（${daysUntilDeadline}天）：${taskName}`,
        description: `里程碑距截止日期还有 ${daysUntilDeadline} 天`,
        relatedTaskId: task.id,
        relatedTaskName: taskName,
        建议: '关注进度，确保前置条件均已满足',
        createdAt: new Date(),
      })
    } else if (daysUntilDeadline <= 14 && task.milestone_level === 1) {
      // 一级里程碑14天内提前预警
      alerts.push({
        id: `milestone-advance-${task.id}`,
        type: 'milestone',
        severity: 'low',
        title: `一级里程碑提前预警（${daysUntilDeadline}天）：${taskName}`,
        description: `重要里程碑距截止还有 ${daysUntilDeadline} 天，提前关注`,
        relatedTaskId: task.id,
        relatedTaskName: taskName,
        建议: '检查前置条件完成情况，确保按计划推进',
        createdAt: new Date(),
      })
    }
  })

  // 按严重程度排序
  const severityOrder: Record<RiskSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
}

/**
 * 综合预警扫描（含里程碑）
 * 在 analyzeRisks 基础上增加里程碑专项预警
 */
export function analyzeAllWarnings(
  tasks: (Task & { is_milestone?: boolean; milestone_level?: number })[],
  criticalTaskIds: string[] = [],
  config: Partial<RiskAlertConfig> = {}
): RiskAlert[] {
  const taskAlerts = analyzeRisks(tasks, criticalTaskIds, config)
  const milestoneAlerts = scanMilestoneWarnings(tasks)
  
  // 合并，去重（里程碑任务可能同时触发 deadline 和 milestone 两类预警）
  const allAlerts = [...taskAlerts, ...milestoneAlerts]
  
  // 按严重程度排序
  const severityOrder: Record<RiskSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  return allAlerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
}
