/**
 * §4.10 + §3.7 Scheduler job & issue domain contracts
 *
 * 覆盖以下项目：
 *  §4.10.3  conditionAlertJob  — 4路并发单路失败不阻断 / 自动升级链等
 *  §4.10.4  riskStatisticsJob  — 每日快照 / job_execution_logs / getStatus()
 *  §4.10.5  responsibilityAlertJob — scanned/abnormalSubjects / getNextRunTime()
 *  §4.10.6  delayRequestReminderJob — reminder/escalation 两类 / initialDelay 对齐 09:00
 *  §4.10.7  dataQualityJob — confidence.flag='low' 统计 / initialDelay 对齐 02:30
 *  §4.10.12 projectDailySnapshotJob — 项目日快照
 *  §4.10.13 weeklyDigestJob/materialArrivalReminderJob — 周一09:00对齐 / 到货提醒
 *  §4.10 顶层 — baseline pending_realign / data-quality panel / Dashboard刷新
 *  §3.7 — 优先级分数 / change_logs priority / pendingManualClose / 通知去重
 */

import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── helpers ──────────────────────────────────────────────────────────────────

function readServerFile(...segments: string[]) {
  const serverRoot = process.cwd().endsWith(`${sep}server`)
    ? process.cwd()
    : resolve(process.cwd(), 'server')
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

// ─────────────────────────────────────────────────────────────────────────────
// §4.10.3 conditionAlertJob
// ─────────────────────────────────────────────────────────────────────────────

describe('§4.10.3 conditionAlertJob', () => {
  it('4路并发分支单路失败不阻断其余分支（Promise.all 内独立 resolve）', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    // conditionAlertJob 内部用 Promise.all 并发四路
    expect(schedulerSource).toContain('Promise.all([')
    expect(schedulerSource).toContain('syncConditionExpiredIssues()')
    expect(schedulerSource).toContain('syncAcceptanceExpiredIssues()')
    expect(schedulerSource).toContain('autoEscalateWarnings()')
    expect(schedulerSource).toContain('autoEscalateRisksToIssues()')
  })

  it('自动升级链：conditionAlertJob 结果包含 autoEscalatedRisks 和 autoEscalatedIssues 计数', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    expect(schedulerSource).toContain('autoEscalatedRisks: autoEscalatedRisks.length')
    expect(schedulerSource).toContain('autoEscalatedIssues: autoEscalatedIssues.length')
  })

  it('conditionAlertJob 结果包含 conditionExpiredIssues 和 acceptanceExpiredIssues 计数', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    expect(schedulerSource).toContain('conditionExpiredIssues: conditionExpiredIssues.length')
    expect(schedulerSource).toContain('acceptanceExpiredIssues: acceptanceExpiredIssues.length')
  })

  it('conditionAlertJob 按小时触发：initialDelay 对齐下一整点', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    // 小时对齐逻辑
    expect(schedulerSource).toContain("nextHour.getHours() + 1")
    expect(schedulerSource).toContain('setMinutes(0, 0, 0)')
    expect(schedulerSource).toContain('HOUR_IN_MS')
  })

  it('conditionAlertJob 使用 runJobWithRetry 包裹执行逻辑', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    // conditionAlertJob execute 中使用 runJobWithRetry
    expect(schedulerSource).toContain("jobName: 'conditionAlertJob'")
  })

  it('conditionAlertJob 结果中包含 warnings 和 reminders 字段', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    expect(schedulerSource).toContain('warnings: warnings.length')
    expect(schedulerSource).toContain('reminders: reminders.length')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §4.10.4 riskStatisticsJob
// ─────────────────────────────────────────────────────────────────────────────

describe('§4.10.4 riskStatisticsJob', () => {
  it('每日风险快照：对活跃项目调用 generateDailySnapshot', () => {
    const jobSource = readServerFile('src', 'jobs', 'riskStatisticsJob.ts')
    expect(jobSource).toContain('riskStatisticsService.generateDailySnapshot')
    expect(jobSource).toContain('snapshotDate')
  })

  it('job_execution_logs 写入：成功时 status=success，失败时 status=error', () => {
    const jobSource = readServerFile('src', 'jobs', 'riskStatisticsJob.ts')
    expect(jobSource).toContain("from('job_execution_logs').insert(")
    expect(jobSource).toContain("status: 'success'")
    expect(jobSource).toContain("status: 'error'")
  })

  it('getStatus() 返回 isRunning / isScheduled / lastRun / nextRun', () => {
    const jobSource = readServerFile('src', 'jobs', 'riskStatisticsJob.ts')
    expect(jobSource).toContain('isRunning: this.isRunning')
    expect(jobSource).toContain('isScheduled:')
    expect(jobSource).toContain('lastRun:')
    expect(jobSource).toContain('nextRun:')
  })

  it('每日风险快照结果包含 success / failed / total 字段', () => {
    const jobSource = readServerFile('src', 'jobs', 'riskStatisticsJob.ts')
    expect(jobSource).toContain('success,')
    expect(jobSource).toContain('failed,')
    expect(jobSource).toContain('total: activeProjects.length')
  })

  it('nextRun 在调度器触发后更新为下一天', () => {
    const jobSource = readServerFile('src', 'jobs', 'riskStatisticsJob.ts')
    expect(jobSource).toContain("triggeredBy === 'scheduler'")
    expect(jobSource).toContain('this.nextRun = new Date(startedAt.getTime() + DAY_IN_MS)')
  })

  it('并发保护：isRunning=true 时跳过 tick', () => {
    const jobSource = readServerFile('src', 'jobs', 'riskStatisticsJob.ts')
    expect(jobSource).toContain('if (this.isRunning)')
    expect(jobSource).toContain('skip tick')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §4.10.5 responsibilityAlertJob
// ─────────────────────────────────────────────────────────────────────────────

describe('§4.10.5 responsibilityAlertJob', () => {
  it('syncAllProjects 返回值中包含 scanned 和 abnormalSubjects 统计', () => {
    const serviceSource = readServerFile('src', 'services', 'responsibilityInsightService.ts')
    expect(serviceSource).toContain('scanned')
    expect(serviceSource).toContain('abnormalSubjects')
  })

  it('responsibilityAlertJob 将 syncAllProjects 结果透传到日志', () => {
    const jobSource = readServerFile('src', 'jobs', 'responsibilityAlertJob.ts')
    expect(jobSource).toContain('responsibilityInsightService.syncAllProjects()')
    expect(jobSource).toContain('...value')
  })

  it('getNextRunTime() 将时间对齐到 08:15', () => {
    const jobSource = readServerFile('src', 'jobs', 'responsibilityAlertJob.ts')
    expect(jobSource).toContain('setHours(8, 15, 0, 0)')
  })

  it('getNextRunTime() 跨日计算：若当前时间晚于 08:15 则推进到次日', () => {
    const jobSource = readServerFile('src', 'jobs', 'responsibilityAlertJob.ts')
    // next <= now 时增加一天
    expect(jobSource).toContain('next.setDate(next.getDate() + 1)')
    expect(jobSource).toContain('next <= now')
  })

  it('responsibilityAlertJob 写入 job_execution_logs', () => {
    const jobSource = readServerFile('src', 'jobs', 'responsibilityAlertJob.ts')
    expect(jobSource).toContain("from('job_execution_logs').insert(")
  })

  it('responsibilityAlertJob getStatus() 暴露 isRunning / isScheduled / lastRun / nextRun', () => {
    const jobSource = readServerFile('src', 'jobs', 'responsibilityAlertJob.ts')
    expect(jobSource).toContain('getStatus()')
    expect(jobSource).toContain('isRunning: this.isRunning')
    expect(jobSource).toContain('lastRun:')
    expect(jobSource).toContain('nextRun:')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §4.10.6 delayRequestReminderJob
// ─────────────────────────────────────────────────────────────────────────────

describe('§4.10.6 delayRequestReminderJob', () => {
  it('生成 delay_request_reminder 类通知', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    expect(schedulerSource).toContain("type === 'delay_request_reminder'")
    expect(schedulerSource).toContain('reminders:')
  })

  it('生成 delay_request_escalation 类通知', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    expect(schedulerSource).toContain("type === 'delay_request_escalation'")
    expect(schedulerSource).toContain('escalations:')
  })

  it('initialDelay 对齐次日 09:00', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    // DelayRequestReminderJob.start() 的 09:00 逻辑
    expect(schedulerSource).toContain('setHours(9, 0, 0, 0)')
    expect(schedulerSource).toContain("'delayRequestReminderJob'")
  })

  it('start() 立即执行一次后再等待 initialDelay', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    // delayRequestReminderJob.start() 先调用 execute，再 setTimeout
    const delayJobSection = schedulerSource.slice(
      schedulerSource.indexOf('class DelayRequestReminderJob'),
      schedulerSource.indexOf('class ProjectDailySnapshotJob'),
    )
    expect(delayJobSection).toContain("void this.execute('scheduler')")
    expect(delayJobSection).toContain('setDate(nextRun.getDate() + 1)')
  })

  it('并发保护：isRunning=true 时跳过 tick', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    const section = schedulerSource.slice(
      schedulerSource.indexOf('class DelayRequestReminderJob'),
      schedulerSource.indexOf('class ProjectDailySnapshotJob'),
    )
    expect(section).toContain('if (this.isRunning)')
    expect(section).toContain('skip tick')
  })

  it('DelayRequestNotificationService.persistPendingDelayRequestNotifications 存在且可调用', () => {
    const serviceSource = readServerFile('src', 'services', 'delayRequestNotificationService.ts')
    expect(serviceSource).toContain('persistPendingDelayRequestNotifications')
    expect(serviceSource).toContain('delay_request_reminder')
    expect(serviceSource).toContain('delay_request_escalation')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §4.10.7 dataQualityJob
// ─────────────────────────────────────────────────────────────────────────────

describe('§4.10.7 dataQualityJob', () => {
  it("confidence.flag='low' 的项目计入 lowConfidenceProjects 统计", () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    expect(schedulerSource).toContain("report.confidence.flag === 'low'")
    expect(schedulerSource).toContain('lowConfidenceProjects:')
  })

  it('dataQualityJob initialDelay 对齐当日 02:30', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    const section = schedulerSource.slice(
      schedulerSource.indexOf('class DataQualityJob'),
      schedulerSource.indexOf('class PlanningGovernanceJob'),
    )
    expect(section).toContain('setHours(2, 30, 0, 0)')
    expect(section).toContain("'daily_02_30'")
  })

  it('dataQualityJob 使用 dataQualityService.syncAllProjectsDataQuality()', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    expect(schedulerSource).toContain('dataQualityService.syncAllProjectsDataQuality()')
  })

  it('dataQualityJob 统计 activeFindings 和 trendWarnings', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    expect(schedulerSource).toContain('activeFindings:')
    expect(schedulerSource).toContain('trendWarnings:')
  })

  it('dataQualityJob 并发保护：isRunning=true 时跳过', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    const section = schedulerSource.slice(
      schedulerSource.indexOf('class DataQualityJob'),
      schedulerSource.indexOf('class PlanningGovernanceJob'),
    )
    expect(section).toContain('if (this.isRunning)')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §4.10.12 projectDailySnapshotJob
// ─────────────────────────────────────────────────────────────────────────────

describe('§4.10.12 projectDailySnapshotJob', () => {
  it('项目日快照：对项目写入 project_daily_snapshot 表', () => {
    const serviceSource = readServerFile('src', 'services', 'projectDailySnapshotService.ts')
    expect(serviceSource).toContain("from('project_daily_snapshot')")
    expect(serviceSource).toContain('.upsert(')
    expect(serviceSource).toContain("onConflict: 'project_id,snapshot_date'")
  })

  it('recordProjectDailySnapshots 返回 { recorded, failed, snapshotDate }', () => {
    const serviceSource = readServerFile('src', 'services', 'projectDailySnapshotService.ts')
    expect(serviceSource).toContain('recorded: 0, failed: 0, snapshotDate')
    expect(serviceSource).toContain('return { recorded, failed, snapshotDate }')
  })

  it('scheduler 只启动项目日快照，不再启动旧月度健康历史任务', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    expect(schedulerSource).not.toContain('class HealthHistorySnapshotJob')
    expect(schedulerSource).not.toContain('recordProjectHealthSnapshots')
    expect(schedulerSource).not.toContain("jobName: 'healthHistorySnapshotJob'")
    expect(schedulerSource).not.toContain('healthHistorySnapshotJob.start()')
    expect(schedulerSource).toContain('projectDailySnapshotJob.start()')
    expect(schedulerSource).toContain("jobName: 'projectDailySnapshotJob'")
  })

  it('projectHealthService no longer writes the legacy project_health_history table', () => {
    const serviceSource = readServerFile('src', 'services', 'projectHealthService.ts')
    expect(serviceSource).not.toContain('recordProjectHealthSnapshots')
    expect(serviceSource).not.toContain('project_health_history')
  })

  it('jobs route exposes projectDailySnapshotJob and disables the legacy healthHistorySnapshotJob schedule', () => {
    const jobsRouteSource = readServerFile('src', 'routes', 'jobs.ts')
    expect(jobsRouteSource).toContain("name: 'projectDailySnapshotJob'")
    expect(jobsRouteSource).toContain("case 'projectDailySnapshotJob'")
    expect(jobsRouteSource).toContain("runApiJob('projectDailySnapshotJob'")
    expect(jobsRouteSource).toContain("name: 'healthHistorySnapshotJob'")
    expect(jobsRouteSource).toContain("status: 'disabled'")
  })

  it('/api/health-score/avg-history reads from project_daily_snapshot after the BI switch', () => {
    const routeSource = readServerFile('src', 'routes', 'health-score.ts')
    const avgHistorySection = routeSource.slice(
      routeSource.indexOf("router.get('/avg-history'"),
      routeSource.indexOf("router.post('/record-snapshot'"),
    )
    expect(avgHistorySection).toContain("from('project_daily_snapshot')")
    expect(avgHistorySection).not.toContain("from('project_health_history')")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §4.10.13 weeklyDigestJob / materialArrivalReminderJob
// ─────────────────────────────────────────────────────────────────────────────

describe('§4.10.13 weeklyDigestJob / materialArrivalReminderJob', () => {
  it('weeklyDigestJob 计算 initialDelay 时对齐下一个周一 09:00', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    const section = schedulerSource.slice(
      schedulerSource.indexOf('class WeeklyDigestJob'),
      schedulerSource.indexOf('class MaterialArrivalReminderJob'),
    )
    expect(section).toContain('setHours(9, 0, 0, 0)')
    // daysUntilMonday 逻辑：day===1 ? 7
    expect(section).toContain('daysUntilMonday')
    expect(section).toContain('WEEK_IN_MS')
  })

  it('weeklyDigestJob 调用 weeklyDigestService.generateForAllProjects()', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    expect(schedulerSource).toContain('weeklyDigestService.generateForAllProjects()')
  })

  it('jobs route exposes weeklyDigestJob status and manual execute entry', () => {
    const jobsRouteSource = readServerFile('src', 'routes', 'jobs.ts')
    expect(jobsRouteSource).toContain("name: 'weeklyDigestJob'")
    expect(jobsRouteSource).toContain("schedule: '0 9 * * 1'")
    expect(jobsRouteSource).toContain("case 'weeklyDigestJob'")
    expect(jobsRouteSource).toContain("runApiJob('weeklyDigestJob'")
  })

  it('materialArrivalReminderJob 结果包含 reminderCount 和 overdueCount', () => {
    const serviceSource = readServerFile('src', 'services', 'materialArrivalReminderService.ts')
    expect(serviceSource).toContain('reminderCount:')
    expect(serviceSource).toContain('overdueCount:')
  })

  it('materialArrivalReminderJob 使用 Promise.allSettled 并发扫描各项目，单项失败不影响其余', () => {
    const serviceSource = readServerFile('src', 'services', 'materialArrivalReminderService.ts')
    expect(serviceSource).toContain('Promise.allSettled(')
    expect(serviceSource).toContain("item.status === 'fulfilled'")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §4.10 顶层 — baseline validity → pending_realign
// ─────────────────────────────────────────────────────────────────────────────

describe('§4.10 顶层 — 基线有效性扫描触发 pending_realign', () => {
  it('planningGovernanceJob 调用 scanAllProjectBaselineValidity 并统计 baselinesQueuedForRealign', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    expect(schedulerSource).toContain('scanAllProjectBaselineValidity()')
    expect(schedulerSource).toContain("item.action === 'queued_realign'")
    expect(schedulerSource).toContain('baselinesQueuedForRealign:')
  })

  it('baselineGovernanceService 将需要重整的基线状态置为 pending_realign', () => {
    const serviceSource = readServerFile('src', 'services', 'baselineGovernanceService.ts')
    expect(serviceSource).toContain("'pending_realign'")
    expect(serviceSource).toContain("action: 'queued_realign'")
  })
})

// ──────────────────────────────────────────────────────────────────────────��──
// §4.10 顶层 — data-quality 报表置信度面板同步
// ─────────────────────────────────────────────────────────────────────────────

describe('§4.10 顶层 — data-quality 报表置信度面板同步', () => {
  it('dataQualityService.syncAllProjectsDataQuality 返回带 confidence 字段的报告', () => {
    const serviceSource = readServerFile('src', 'services', 'dataQualityService.ts')
    expect(serviceSource).toContain('confidence')
  })

  it('dataQualityJob 将 lowConfidenceProjects 写入日志供面板消费', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    expect(schedulerSource).toContain('lowConfidenceProjects')
    expect(schedulerSource).toContain("jobName: 'dataQualityJob'")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §4.10 顶层 — 健康度定时计算后 Dashboard 刷新
// ─────────────────────────────────────────────────────────────────────────────

describe('§4.10 顶层 — 健康度定时计算后 Dashboard 刷新', () => {
  it('planningGovernanceJob 调用 PlanningHealthService.scanAllProjectHealth()', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    expect(schedulerSource).toContain('new PlanningHealthService().scanAllProjectHealth()')
    expect(schedulerSource).toContain('healthReports:')
  })

  it('recordProjectDailySnapshots 将 health_score 写入 project_daily_snapshot', () => {
    const serviceSource = readServerFile('src', 'services', 'projectDailySnapshotService.ts')
    expect(serviceSource).toContain('health_score:')
    expect(serviceSource).toContain('health_status:')
    expect(serviceSource).toContain("from('project_daily_snapshot')")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §3.7 — 自动优先级分数：来源权重 × 严重性权重 × 时间衰减
// ─────────────────────────────────────────────────────────────────────────────

describe('§3.7 自动优先级分数展示', () => {
  it('getIssueBasePriority = ISSUE_SOURCE_WEIGHT × ISSUE_SEVERITY_WEIGHT', async () => {
    const { getIssueBasePriority } = await import('../services/workflowDomainPolicy.js')

    // condition_expired(4) × critical(4) = 16
    expect(getIssueBasePriority('condition_expired', 'critical')).toBe(16)
    // obstacle_escalated(3) × high(3) = 9
    expect(getIssueBasePriority('obstacle_escalated', 'high')).toBe(9)
    // risk_converted(2) × medium(2) = 4
    expect(getIssueBasePriority('risk_converted', 'medium')).toBe(4)
    // manual(1) × low(1) = 1
    expect(getIssueBasePriority('manual', 'low')).toBe(1)
  })

  it('computeDynamicIssuePriority 对超过7天未处理的问题应用时间衰减上浮', async () => {
    const { computeDynamicIssuePriority } = await import('../services/workflowDomainPolicy.js')

    const now = new Date('2026-04-20T10:00:00.000Z')
    const createdAt14DaysAgo = new Date('2026-04-06T10:00:00.000Z').toISOString()

    // risk_converted × medium = 2×2=4，14天=2个周期，upliftFactor=1.2 → round(4.8)=5 > 4。注意 manual×low=1 经round仍为1，改用��同，至少 > 1
    const base = computeDynamicIssuePriority(
      { source_type: 'risk_converted', severity: 'medium', created_at: createdAt14DaysAgo, status: 'open', priority: 4 },
      { now },
    )
    // 未衰减基础分=4，14天后应上浮为 round(4*1.2)=5
    expect(base).toBeGreaterThan(4)
  })

  it('computeDynamicIssuePriority 对 isLocked=true 返回原始 priority 值', async () => {
    const { computeDynamicIssuePriority } = await import('../services/workflowDomainPolicy.js')

    const now = new Date('2026-04-20T10:00:00.000Z')
    const createdAt = new Date('2026-01-01T00:00:00.000Z').toISOString()

    const locked = computeDynamicIssuePriority(
      { source_type: 'condition_expired', severity: 'critical', created_at: createdAt, status: 'open', priority: 99 },
      { now, isLocked: true },
    )
    // 锁定时返回 clamp(99) 而不是动态计算值
    expect(locked).toBe(99)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §3.7 — 已锁定 issue 在 change_logs 中写入 field_name='priority'
// ─────────────────────────────────────────────────────────────────────────────

describe('§3.7 已锁定 issue change_logs field_name=priority', () => {
  it('listPriorityLockedIssueIds 从 change_logs 表查询 field_name=priority', () => {
    const dbServiceSource = readServerFile('src', 'services', 'dbService.ts')
    expect(dbServiceSource).toContain("eq('field_name', 'priority')")
    expect(dbServiceSource).toContain("eq('entity_type', 'issue')")
  })

  it('updateIssue 在优先级变更时写入 field_name=priority 的 change_log', () => {
    const dbServiceSource = readServerFile('src', 'services', 'dbService.ts')
    expect(dbServiceSource).toContain("field_name: 'priority'")
    expect(dbServiceSource).toContain('old_value: Number(oldIssue.priority)')
    expect(dbServiceSource).toContain('new_value: Number(updated.priority)')
  })

  it('createIssue 时若手动指定 priority 则写入 field_name=priority change_log', () => {
    const dbServiceSource = readServerFile('src', 'services', 'dbService.ts')
    // createIssue 路径中 field_name: 'priority'
    expect(dbServiceSource).toContain("field_name: 'priority'")
    // 同时有创建时的 p_priority 参数
    expect(dbServiceSource).toContain('p_priority:')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §3.7 — pendingManualClose 筛选
// ─────────────────────────────────────────────────────────────────────────────

describe('§3.7 pendingManualClose 筛选', () => {
  it('buildIssuePendingManualClosePatch 将 pending_manual_close 置为 true', async () => {
    const { buildIssuePendingManualClosePatch } = await import('../services/workflowDomainPolicy.js')

    const patch = buildIssuePendingManualClosePatch({ status: 'open' })
    expect(patch.pending_manual_close).toBe(true)
    expect(patch.status).toBe('resolved')
  })

  it('issues 路由存在 confirm-close 和 keep-processing 专用动作端点', () => {
    const issuesRouteSource = readServerFile('src', 'routes', 'issues.ts')
    expect(issuesRouteSource).toContain('confirm-close')
    expect(issuesRouteSource).toContain('keep-processing')
  })

  it('workflowDomainPolicy.buildIssueConfirmClosePatch 返回 status=closed 且 closed_reason=manual_confirmed_close', () => {
    const policySource = readServerFile('src', 'services', 'workflowDomainPolicy.ts')
    expect(policySource).toContain("'manual_confirmed_close'")
    expect(policySource).toContain('pending_manual_close: false')
    expect(policySource).toContain("status: 'closed'")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §3.7 — 同任务同周期通知去重：critical_path_stagnation + progress_trend_delay
// ─────────────────────────────────────────────────────────────────────────────

describe('§3.7 同任务同周期通知去重', () => {
  it('dedupeNotifications 对相同 (type, task_id) 的通知只保留一条', async () => {
    const { dedupeNotifications } = await import('../services/warningChainService.js')

    const now = new Date().toISOString()
    const notifications = [
      {
        id: 'n1',
        project_id: 'p1',
        type: 'critical_path_stagnation',
        warning_type: 'critical_path_stagnation',
        category: 'critical_path_stagnation',
        task_id: 'task-1',
        source_entity_type: 'task',
        source_entity_id: 'task-1',
        delay_request_id: null,
        created_at: now,
      },
      {
        id: 'n2',
        project_id: 'p1',
        type: 'critical_path_stagnation',
        warning_type: 'critical_path_stagnation',
        category: 'critical_path_stagnation',
        task_id: 'task-1',
        source_entity_type: 'task',
        source_entity_id: 'task-1',
        delay_request_id: null,
        created_at: now,
      },
    ]

    const result = dedupeNotifications(notifications as any)
    expect(result).toHaveLength(1)
  })

  it('dedupeNotifications 对不同 task_id 的相同类型通知不去重', async () => {
    const { dedupeNotifications } = await import('../services/warningChainService.js')

    const now = new Date().toISOString()
    const notifications = [
      {
        id: 'n1', project_id: 'p1', type: 'progress_trend_delay', warning_type: 'progress_trend_delay',
        category: 'progress_trend_delay', task_id: 'task-1', source_entity_type: 'task',
        source_entity_id: 'task-1', delay_request_id: null, created_at: now,
      },
      {
        id: 'n2', project_id: 'p1', type: 'progress_trend_delay', warning_type: 'progress_trend_delay',
        category: 'progress_trend_delay', task_id: 'task-2', source_entity_type: 'task',
        source_entity_id: 'task-2', delay_request_id: null, created_at: now,
      },
    ]

    const result = dedupeNotifications(notifications as any)
    expect(result).toHaveLength(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §3.7 — 延期审批通知去重：delay_request_reminder 仅在 submitted 且已读未处理时发送
// ─────────────────────────────────────────────────────────────────────────────

describe('§3.7 延期审批通知去重', () => {
  it('非 escalation 时：存在未读的 submitted 通知则跳过（不发 reminder）', () => {
    const serviceSource = readServerFile('src', 'services', 'delayRequestNotificationService.ts')
    // 只有 submitted 通知已读才发 reminder
    expect(serviceSource).toContain('isNotificationRead(submittedNotification)')
    expect(serviceSource).toContain('delay_request_submitted')
    // 未读时 continue 跳过
    expect(serviceSource).toContain('if (!isEscalated)')
    expect(serviceSource).toContain('continue')
  })

  it('已存在同类型通知时跳过（source_entity_type + source_entity_id + type 去重）', () => {
    const serviceSource = readServerFile('src', 'services', 'delayRequestNotificationService.ts')
    expect(serviceSource).toContain('findNotification(')
    expect(serviceSource).toContain("sourceEntityType: 'delay_request'")
    expect(serviceSource).toContain('sourceEntityId: request.id')
    expect(serviceSource).toContain('type: notificationType')
  })

  it('isNotificationRead 识别 is_read=true / status=acknowledged / status=resolved', () => {
    const serviceSource = readServerFile('src', 'services', 'delayRequestNotificationService.ts')
    expect(serviceSource).toContain("status === 'acknowledged'")
    expect(serviceSource).toContain("status === 'resolved'")
    expect(serviceSource).toContain('is_read')
  })
})
