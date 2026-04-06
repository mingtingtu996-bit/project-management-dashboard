// 任务完成总结服务 - Phase 3.6（基于 Supabase PostgreSQL）

import { executeSQL, executeSQLOne } from './dbService.js'
import type { Task, TaskCompletionReport } from '../types/db.js'
import { logger } from '../middleware/logger.js'
import { v4 as uuidv4 } from 'uuid'

export interface EfficiencyStats {
  plannedDuration: number
  actualDuration: number
  efficiencyRatio: number
  efficiencyStatus: 'fast' | 'normal' | 'slow'
}

export interface DelayStats {
  totalDelayDays: number
  delayCount: number
  delayDetails: Array<{
    delay_date: string
    delay_days: number
    delay_type: string
    reason: string
  }>
}

export interface ObstacleStats {
  obstacleCount: number
  obstaclesSummary: string
  obstacles: Array<{
    type: string
    description: string
    severity: string
    resolvedAt?: string
  }>
}

export interface TaskSummaryData {
  task_id: string
  project_id: string
  report_type: string
  title: string
  summary: string
  planned_duration: number
  actual_duration: number
  efficiency_ratio: number
  efficiency_status: string
  total_delay_days: number
  delay_count: number
  delay_details: string
  obstacle_count: number
  obstacles_summary: string
  // P2-001修复: 添加质量评分字段
  quality_score?: number
  quality_notes?: string
  highlights: string
  issues: string
  lessons_learned: string
}

export class TaskSummaryService {

  /**
   * 生成任务完成总结
   */
  async generateTaskSummary(taskId: string, userId?: string): Promise<TaskCompletionReport> {
    // 获取任务信息
    const task = await executeSQLOne<Task>(
      'SELECT * FROM tasks WHERE id = ? LIMIT 1',
      [taskId]
    )

    if (!task) {
      throw new Error('任务不存在')
    }

    logger.info('开始生成任务总结', { taskId, taskName: (task as any).name || task.title })

    // 计算效率统计
    const efficiencyStats = await this.calculateEfficiencyStats(task)

    // 计算延期统计
    const delayStats = await this.calculateDelayStats(taskId)

    // 计算阻碍统计
    const obstacleStats = await this.calculateObstacleStats(taskId)

    // P2-001修复: 计算质量评分
    const qualityStats = this.calculateQualityScore(efficiencyStats, delayStats, obstacleStats)

    // 生成总结内容
    const taskName = (task as any).name || task.title
    const summaryData: TaskSummaryData = {
      task_id: task.id,
      project_id: task.project_id,
      report_type: 'task',
      title: `${taskName} 完成总结`,
      summary: `任务 "${taskName}" 已完成，本报告汇总了任务执行过程中的关键数据和经验教训。`,
      planned_duration: efficiencyStats.plannedDuration,
      actual_duration: efficiencyStats.actualDuration,
      efficiency_ratio: efficiencyStats.efficiencyRatio,
      efficiency_status: efficiencyStats.efficiencyStatus,
      total_delay_days: delayStats.totalDelayDays,
      delay_count: delayStats.delayCount,
      delay_details: JSON.stringify(delayStats.delayDetails),
      obstacle_count: obstacleStats.obstacleCount,
      obstacles_summary: obstacleStats.obstaclesSummary,
      // P2-001修复: 添加质量评分
      quality_score: qualityStats.score,
      quality_notes: qualityStats.notes,
      highlights: this.generateHighlights(efficiencyStats, delayStats),
      issues: this.generateIssues(delayStats, obstacleStats),
      lessons_learned: this.generateLessonsLearned(efficiencyStats, delayStats, obstacleStats)
    }

    // 检查是否已存在总结报告
    const existingReport = await executeSQLOne<any>(
      'SELECT * FROM task_completion_reports WHERE task_id = ? LIMIT 1',
      [taskId]
    )

    let report: TaskCompletionReport
    const now = new Date().toISOString()

    if (existingReport) {
      // 更新已有报告
      await executeSQL(
        `UPDATE task_completion_reports SET
           title = ?, summary = ?, planned_duration = ?, actual_duration = ?,
           efficiency_ratio = ?, efficiency_status = ?, total_delay_days = ?,
           delay_count = ?, delay_details = ?, obstacle_count = ?,
           obstacles_summary = ?, quality_score = ?, quality_notes = ?,
           highlights = ?, issues = ?, lessons_learned = ?,
           generated_by = ?, generated_at = ?, updated_at = ?
         WHERE id = ?`,
        [
          summaryData.title, summaryData.summary,
          summaryData.planned_duration, summaryData.actual_duration,
          summaryData.efficiency_ratio, summaryData.efficiency_status,
          summaryData.total_delay_days, summaryData.delay_count,
          summaryData.delay_details, summaryData.obstacle_count,
          summaryData.obstacles_summary,
          summaryData.quality_score ?? null, summaryData.quality_notes ?? null,
          summaryData.highlights, summaryData.issues, summaryData.lessons_learned,
          userId ?? null, now, now,
          existingReport.id
        ]
      )

      report = { ...existingReport, ...summaryData, generated_by: userId, generated_at: now, updated_at: now }
      logger.info('更新任务总结报告', { reportId: existingReport.id, taskId })
    } else {
      // 创建新报告
      const newId = uuidv4()
      await executeSQL(
        `INSERT INTO task_completion_reports
           (id, task_id, project_id, report_type, title, summary,
            planned_duration, actual_duration, efficiency_ratio, efficiency_status,
            total_delay_days, delay_count, delay_details, obstacle_count,
            obstacles_summary, quality_score, quality_notes,
            highlights, issues, lessons_learned,
            generated_by, generated_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          newId, summaryData.task_id, summaryData.project_id, summaryData.report_type,
          summaryData.title, summaryData.summary,
          summaryData.planned_duration, summaryData.actual_duration,
          summaryData.efficiency_ratio, summaryData.efficiency_status,
          summaryData.total_delay_days, summaryData.delay_count,
          summaryData.delay_details, summaryData.obstacle_count,
          summaryData.obstacles_summary,
          summaryData.quality_score ?? null, summaryData.quality_notes ?? null,
          summaryData.highlights, summaryData.issues, summaryData.lessons_learned,
          userId ?? null, now, now, now
        ]
      )

      report = {
        id: newId,
        ...summaryData,
        generated_by: userId,
        generated_at: now,
        created_at: now,
        updated_at: now
      } as any
      logger.info('创建任务总结报告', { reportId: newId, taskId })
    }

    return report
  }

  /**
   * 计算质量评分
   * P2-001修复: 实现多维度质量评分算法
   * 评分维度：效率(40%) + 延期(30%) + 阻碍(30%)
   */
  private calculateQualityScore(
    efficiency: EfficiencyStats,
    delays: DelayStats,
    obstacles: ObstacleStats
  ): { score: number; notes: string } {
    // 效率评分 (40%权重)
    let efficiencyScore = 70 // 基础分
    if (efficiency.efficiencyStatus === 'fast') {
      efficiencyScore = 95
    } else if (efficiency.efficiencyStatus === 'normal') {
      efficiencyScore = 80
    } else {
      efficiencyScore = 60
    }

    // 延期评分 (30%权重)
    let delayScore = 100 // 无延期满分
    if (delays.totalDelayDays > 0) {
      // 每延期1天扣5分，最低40分
      delayScore = Math.max(40, 100 - delays.totalDelayDays * 5)
    }

    // 阻碍评分 (30%权重)
    let obstacleScore = 100 // 无阻碍满分
    if (obstacles.obstacleCount > 0) {
      // 每个阻碍扣10分，最低40分
      obstacleScore = Math.max(40, 100 - obstacles.obstacleCount * 10)
    }

    // 加权计算总分
    const totalScore = Math.round(
      efficiencyScore * 0.4 + delayScore * 0.3 + obstacleScore * 0.3
    )

    // 生成质量评语
    let notes = ''
    if (totalScore >= 90) {
      notes = '任务执行质量优秀，各项指标表现良好。'
    } else if (totalScore >= 75) {
      notes = '任务执行质量良好，部分指标有改进空间。'
    } else if (totalScore >= 60) {
      notes = '任务执行质量合格，建议关注延期和阻碍问题。'
    } else {
      notes = '任务执行质量需改进，建议复盘总结问题原因。'
    }

    // 添加具体扣分项说明
    const deductions: string[] = []
    if (efficiencyScore < 80) {
      deductions.push(`效率偏低(${efficiencyScore}分)`)
    }
    if (delayScore < 100) {
      deductions.push(`延期影响(${delayScore}分)`)
    }
    if (obstacleScore < 100) {
      deductions.push(`阻碍较多(${obstacleScore}分)`)
    }

    if (deductions.length > 0) {
      notes += ` 扣分项：${deductions.join('、')}。`
    }

    return { score: totalScore, notes }
  }

  /**
   * 计算效率统计
   * BIZ-013: 效率计算除零保护
   */
  async calculateEfficiencyStats(task: Task): Promise<EfficiencyStats> {
    // 计划工期（天）
    const taskAny = task as any
    const plannedEnd = taskAny.planned_end_date || task.end_date
    const plannedDurationDays = task.start_date && plannedEnd
      ? Math.max(1, Math.round((new Date(plannedEnd).getTime() - new Date(task.start_date).getTime()) / (1000 * 60 * 60 * 24)))
      : 1

    // 实际工期（天）
    const actualEnd = task.actual_end_date || task.end_date
    const actualDurationDays = task.start_date && actualEnd
      ? Math.max(1, Math.round((new Date(actualEnd).getTime() - new Date(task.start_date).getTime()) / (1000 * 60 * 60 * 24)))
      : plannedDurationDays

    // 获取进度快照计算实际效率
    const snapshots = await executeSQL<any>(
      'SELECT * FROM task_progress_history WHERE task_id = ? ORDER BY created_at ASC',
      [task.id]
    )

    let efficiencyRatio = 1.0
    let efficiencyStatus: 'fast' | 'normal' | 'slow' = 'normal'

    if (snapshots && snapshots.length > 1) {
      // 基准效率（每天应完成的进度百分比）
      const baselineEfficiency = plannedDurationDays / 100

      // 计算实际效率（基于进度快照）
      let totalPhaseDuration = 0
      let totalProgressDelta = 0

      for (let i = 1; i < snapshots.length; i++) {
        const prevSnapshot = snapshots[i - 1]
        const currSnapshot = snapshots[i]

        const progressDelta = (currSnapshot.progress || 0) - (prevSnapshot.progress || 0)
        const phaseDuration = Math.round(
          (new Date(currSnapshot.created_at).getTime() - new Date(prevSnapshot.created_at).getTime()) /
          (1000 * 60 * 60 * 24)
        )

        // BIZ-013修复：添加除零保护
        if (progressDelta !== 0) {
          totalPhaseDuration += phaseDuration
          totalProgressDelta += progressDelta
        }
      }

      // BIZ-013修复：防止除零错误
      const actualEfficiency = totalProgressDelta !== 0
        ? totalPhaseDuration / totalProgressDelta
        : actualDurationDays

      // 计算效率比
      efficiencyRatio = actualEfficiency !== 0
        ? baselineEfficiency / actualEfficiency
        : 1

      // BIZ-013修复：安全检查
      if (isNaN(efficiencyRatio) || !isFinite(efficiencyRatio)) {
        efficiencyRatio = 1.0
      }
    }

    // 判断效率状态
    if (efficiencyRatio > 1.1) {
      efficiencyStatus = 'fast'  // 提前
    } else if (efficiencyRatio < 0.9) {
      efficiencyStatus = 'slow'   // 偏慢
    } else {
      efficiencyStatus = 'normal' // 正常
    }

    return {
      plannedDuration: plannedDurationDays,
      actualDuration: actualDurationDays,
      efficiencyRatio: Number(efficiencyRatio.toFixed(2)),
      efficiencyStatus
    }
  }

  /**
   * 计算延期统计
   */
  async calculateDelayStats(taskId: string): Promise<DelayStats> {
    const delayRecords = await executeSQL<any>(
      'SELECT * FROM task_delay_history WHERE task_id = ? ORDER BY created_at DESC',
      [taskId]
    )

    const delayCount = delayRecords?.length || 0
    const totalDelayDays = delayRecords?.reduce((sum: number, record: any) => sum + (record.delay_days || 0), 0) || 0

    const delayDetails = (delayRecords || []).map((record: any) => ({
      delay_date: record.created_at,
      delay_days: record.delay_days,
      delay_type: record.delay_type,
      reason: record.reason
    }))

    return {
      totalDelayDays,
      delayCount,
      delayDetails
    }
  }

  /**
   * 计算阻碍统计
   */
  async calculateObstacleStats(taskId: string): Promise<ObstacleStats> {
    const obstacles = await executeSQL<any>(
      'SELECT * FROM task_obstacles WHERE task_id = ? ORDER BY created_at DESC',
      [taskId]
    )

    const obstacleCount = obstacles?.length || 0
    const obstaclesSummary = obstacleCount > 0
      ? `任务执行过程中共遇到 ${obstacleCount} 个阻碍，主要集中在${this.getObstacleTypesSummary(obstacles || [])}等方面。`
      : '任务执行顺利，未记录到阻碍。'

    const formattedObstacles = (obstacles || []).map((obs: any) => ({
      type: obs.obstacle_type,
      description: obs.description,
      severity: obs.severity,
      resolvedAt: obs.resolved_at
    }))

    return {
      obstacleCount,
      obstaclesSummary,
      obstacles: formattedObstacles
    }
  }

  /**
   * 获取阻碍类型汇总
   */
  private getObstacleTypesSummary(obstacles: any[]): string {
    const typeCount = obstacles.reduce((acc: Record<string, number>, obs: any) => {
      acc[obs.obstacle_type] = (acc[obs.obstacle_type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return Object.entries(typeCount)
      .map(([type, count]) => `${type}（${count}次）`)
      .join('、')
  }

  /**
   * 生成亮点
   */
  private generateHighlights(
    efficiency: EfficiencyStats,
    delays: DelayStats
  ): string {
    const highlights: string[] = []

    if (efficiency.efficiencyStatus === 'fast') {
      highlights.push(`任务提前完成，效率比达到 ${efficiency.efficiencyRatio}`)
    }

    if (delays.delayCount === 0) {
      highlights.push('任务按期完成，无延期记录')
    }

    if (highlights.length === 0) {
      highlights.push('任务顺利达到100%完成')
    }

    return highlights.join('；') + '。'
  }

  /**
   * 生成问题
   */
  private generateIssues(
    delays: DelayStats,
    obstacles: ObstacleStats
  ): string {
    const issues: string[] = []

    if (delays.totalDelayDays > 0) {
      issues.push(`任务累计延期 ${delays.totalDelayDays} 天，共 ${delays.delayCount} 次延期`)
    }

    if (obstacles.obstacleCount > 0) {
      issues.push(`执行过程中遇到 ${obstacles.obstacleCount} 个阻碍，影响了任务进度`)
    }

    if (issues.length === 0) {
      return '未发现明显问题。'
    }

    return issues.join('；') + '。'
  }

  /**
   * 生成经验教训
   */
  private generateLessonsLearned(
    efficiency: EfficiencyStats,
    delays: DelayStats,
    obstacles: ObstacleStats
  ): string {
    const lessons: string[] = []

    if (efficiency.efficiencyStatus === 'fast') {
      lessons.push('本次任务执行效率较高，建议总结推广成功经验')
    } else if (efficiency.efficiencyStatus === 'slow') {
      lessons.push('建议分析效率偏低原因，优化资源配置和施工组织')
    }

    if (delays.delayCount > 0) {
      lessons.push('建议加强计划管理和风险预警，减少延期发生')
    }

    if (obstacles.obstacleCount > 0) {
      lessons.push('建议完善前期准备工作，减少施工阻碍')
    }

    if (lessons.length === 0) {
      lessons.push('任务执行平稳，建议保持现有管理模式')
    }

    return lessons.join('；') + '。'
  }

  /**
   * 获取任务总结
   */
  async getTaskSummary(taskId: string): Promise<TaskCompletionReport | null> {
    const report = await executeSQLOne<TaskCompletionReport>(
      'SELECT * FROM task_completion_reports WHERE task_id = ? LIMIT 1',
      [taskId]
    )

    return report ?? null
  }

  /**
   * 获取项目总结列表（支持分页）
   * P1-003修复: 添加分页支持
   */
  async getProjectSummaries(
    projectId: string,
    pagination?: { limit: number; offset: number }
  ): Promise<{ summaries: TaskCompletionReport[]; total: number }> {
    // 获取总数
    const countResult = await executeSQLOne<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM task_completion_reports WHERE project_id = ?',
      [projectId]
    )
    const total = countResult?.cnt || 0

    // 获取列表（带分页）
    let sql = 'SELECT * FROM task_completion_reports WHERE project_id = ? ORDER BY generated_at DESC'
    const params: any[] = [projectId]

    if (pagination) {
      sql += ' LIMIT ? OFFSET ?'
      params.push(pagination.limit, pagination.offset)
    }

    const reports = await executeSQL<TaskCompletionReport>(sql, params)

    return {
      summaries: reports || [],
      total
    }
  }

  /**
   * 获取总结统计数据（Dashboard卡片用）
   */
  async getSummaryStats(projectId: string) {
    // 获取已完成任务总数
    const completedResult = await executeSQLOne<{ cnt: number }>(
      "SELECT COUNT(*) AS cnt FROM tasks WHERE project_id = ? AND progress = 100",
      [projectId]
    )

    // 获取已生成总结的报告
    const reports = await executeSQL<any>(
      'SELECT efficiency_ratio, efficiency_status, total_delay_days FROM task_completion_reports WHERE project_id = ?',
      [projectId]
    )

    // 计算平均效率比
    const efficiencySum = reports?.reduce((sum: number, r: any) => sum + (r.efficiency_ratio || 0), 0) || 0
    const avgEfficiency = reports && reports.length > 0
      ? (efficiencySum / reports.length).toFixed(2)
      : '1.00'

    // 统计延期任务数
    const delayedTasks = reports?.filter((r: any) => r.total_delay_days > 0).length || 0

    // 统计高效任务数
    const fastTasks = reports?.filter((r: any) => r.efficiency_status === 'fast').length || 0

    // 统计低效任务数
    const slowTasks = reports?.filter((r: any) => r.efficiency_status === 'slow').length || 0

    return {
      totalCompleted: completedResult?.cnt || 0,
      totalReports: reports?.length || 0,
      avgEfficiencyRatio: parseFloat(avgEfficiency),
      delayedTasks,
      fastTasks,
      slowTasks
    }
  }
}
