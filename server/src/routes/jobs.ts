import express from 'express'
import { z } from 'zod'

import { dataRetentionJob } from '../jobs/dataRetentionJob.js'
import { planningDraftLockTimeoutJob } from '../jobs/planningDraftLockTimeoutJob.js'
import { responsibilityAlertJob } from '../jobs/responsibilityAlertJob.js'
import { riskStatisticsJob } from '../jobs/riskStatisticsJob.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { DelayRequestNotificationService } from '../services/delayRequestNotificationService.js'
import { dataQualityService } from '../services/dataQualityService.js'
import { NotificationLifecycleService } from '../services/notificationLifecycleService.js'
import { OperationalNotificationService } from '../services/operationalNotificationService.js'
import { PlanningHealthService } from '../services/planningHealthService.js'
import { PlanningIntegrityService } from '../services/planningIntegrityService.js'
import { planningGovernanceService } from '../services/planningGovernanceService.js'
import { scanAllProjectBaselineValidity } from '../services/baselineGovernanceService.js'
import { materialArrivalReminderService } from '../services/materialArrivalReminderService.js'
import { recordProjectDailySnapshots } from '../services/projectDailySnapshotService.js'
import { SystemAnomalyService } from '../services/systemAnomalyService.js'
import { WarningService } from '../services/warningService.js'
import { weeklyDigestService } from '../services/weeklyDigestService.js'

const router = express.Router()
router.use(authenticate)

const jobNameParamSchema = z.object({
  jobName: z.string().trim().min(1, 'jobName 不能为空'),
})

type JobStatusView = {
  name: string
  displayName: string
  isRunning: boolean
  isScheduled: boolean
  schedule: string
  lastRun: string | null
  nextRun: string | null
  status: string
  description: string
}

function buildStatus(isRunning: boolean, isScheduled: boolean) {
  if (isRunning) return 'running'
  if (isScheduled) return 'scheduled'
  return 'idle'
}

function buildJobStatusViews(): JobStatusView[] {
  const riskJobStatus = riskStatisticsJob.getStatus()
  const draftLockStatus = planningDraftLockTimeoutJob.getStatus()
  const dataRetentionStatus = dataRetentionJob.getStatus()
  const responsibilityAlertStatus = responsibilityAlertJob.getStatus()

  return [
    {
      name: 'riskStatisticsJob',
      displayName: '风险统计定时任务',
      isRunning: riskJobStatus.isRunning,
      isScheduled: riskJobStatus.isScheduled,
      schedule: '0 2 * * *',
      lastRun: riskJobStatus.lastRun,
      nextRun: riskJobStatus.nextRun,
      status: buildStatus(riskJobStatus.isRunning, riskJobStatus.isScheduled),
      description: '为所有活跃项目生成风险统计快照。',
    },
    {
      name: 'conditionAlertJob',
      displayName: '预警主链同步任务',
      isRunning: false,
      isScheduled: true,
      schedule: '0 * * * *',
      lastRun: null,
      nextRun: null,
      status: 'scheduled',
      description: '同步 warning -> risk -> issue 主链与提醒状态。',
    },
    {
      name: 'healthHistorySnapshotJob',
      displayName: '项目健康快照任务',
      isRunning: false,
      isScheduled: false,
      schedule: '5 0 1 * *',
      lastRun: null,
      nextRun: null,
      status: 'disabled',
      description: '已由项目日快照任务接管，保留名称仅用于历史识别。',
    },
    {
      name: 'projectDailySnapshotJob',
      displayName: '项目日快照任务',
      isRunning: false,
      isScheduled: true,
      schedule: '10 0 * * *',
      lastRun: null,
      nextRun: null,
      status: 'scheduled',
      description: '记录项目级日快照，作为健康趋势与 BI 指标主来源。',
    },
    {
      name: 'responsibilityAlertJob',
      displayName: '责任主体异常扫描任务',
      isRunning: responsibilityAlertStatus.isRunning,
      isScheduled: responsibilityAlertStatus.isScheduled,
      schedule: '15 8 * * *',
      lastRun: responsibilityAlertStatus.lastRun,
      nextRun: responsibilityAlertStatus.nextRun,
      status: buildStatus(responsibilityAlertStatus.isRunning, responsibilityAlertStatus.isScheduled),
      description: '扫描责任主体异常、自动预警、恢复确认与关注名单状态。',
    },
    {
      name: 'planningDraftLockTimeoutJob',
      displayName: '规划草稿锁超时回收任务',
      isRunning: draftLockStatus.isRunning,
      isScheduled: draftLockStatus.isScheduled,
      schedule: '*/1 * * * *',
      lastRun: draftLockStatus.lastRun,
      nextRun: draftLockStatus.nextRun,
      status: buildStatus(draftLockStatus.isRunning, draftLockStatus.isScheduled),
      description: '每分钟扫描并释放超时草稿锁。',
    },
    {
      name: 'dataQualityJob',
      displayName: '数据质量扫描任务',
      isRunning: false,
      isScheduled: true,
      schedule: '30 2 * * *',
      lastRun: null,
      nextRun: null,
      status: 'scheduled',
      description: '扫描趋势预警、异常数据、置信度快照与数据质量通知。',
    },
    {
      name: 'planningGovernanceJob',
      displayName: '规划治理扫描任务',
      isRunning: false,
      isScheduled: true,
      schedule: '0 1 * * *',
      lastRun: null,
      nextRun: null,
      status: 'scheduled',
      description: '扫描治理状态、异常和治理通知。',
    },
    {
      name: 'delayRequestReminderJob',
      displayName: '延期申请催办任务',
      isRunning: false,
      isScheduled: true,
      schedule: '0 9 * * *',
      lastRun: null,
      nextRun: null,
      status: 'scheduled',
      description: '生成延期申请 3/5 天催办与升级提醒。',
    },
    {
      name: 'operationalNotificationJob',
      displayName: '运维异常检测任务',
      isRunning: false,
      isScheduled: true,
      schedule: '0 */2 * * *',
      lastRun: null,
      nextRun: null,
      status: 'scheduled',
      description: '检测快照断层、日期逆序和状态/进度不一致。',
    },
    {
      name: 'notificationLifecycleJob',
      displayName: '通知生命周期清理任务',
      isRunning: false,
      isScheduled: true,
      schedule: '30 3 * * *',
      lastRun: null,
      nextRun: null,
      status: 'scheduled',
      description: '执行通知 90 天归档和 180 天清理。',
    },
    {
      name: 'dataRetentionJob',
      displayName: '数据保留策略任务',
      isRunning: dataRetentionStatus.isRunning,
      isScheduled: dataRetentionStatus.isScheduled,
      schedule: '15 4 1 * *',
      lastRun: dataRetentionStatus.lastRun,
      nextRun: dataRetentionStatus.nextRun,
      status: buildStatus(dataRetentionStatus.isRunning, dataRetentionStatus.isScheduled),
      description: '按保留周期清理高增长日志与快照表。',
    },
    {
      name: 'weeklyDigestJob',
      displayName: '周度简报生成任务',
      isRunning: false,
      isScheduled: true,
      schedule: '0 9 * * 1',
      lastRun: null,
      nextRun: null,
      status: 'scheduled',
      description: '每周一 09:00 为所有活跃项目生成周度简报。',
    },
    {
      name: 'materialArrivalReminderJob',
      displayName: '材料到场提醒任务',
      isRunning: false,
      isScheduled: true,
      schedule: '30 8 * * *',
      lastRun: null,
      nextRun: null,
      status: 'scheduled',
      description: '按参建单位聚合材料到场提醒，并对逾期材料执行每日追踪。',
    },
  ]
}

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

async function runApiJob<T>(jobName: string, runner: () => Promise<T>) {
  const jobId = createJobId()
  const { attempts, value } = await runJobWithRetry(
    {
      jobName,
      triggeredBy: 'api',
      jobId,
    },
    async () => runner(),
  )

  return {
    jobId,
    attempts,
    result: value,
  }
}

async function executeConditionAlertJob() {
  return runApiJob('conditionAlertJob', async () => {
    const warningService = new WarningService()
    const warnings = await warningService.syncActiveWarnings()
    const reminders = await warningService.generateReminders()
    const [conditionExpiredIssues, acceptanceExpiredIssues, autoEscalatedRisks, autoEscalatedIssues] = await Promise.all([
      warningService.syncConditionExpiredIssues(),
      warningService.syncAcceptanceExpiredIssues(),
      warningService.autoEscalateWarnings(),
      warningService.autoEscalateRisksToIssues(),
    ])

    return {
      warnings: warnings.length,
      reminders: reminders.length,
      conditionExpiredIssues: conditionExpiredIssues.length,
      acceptanceExpiredIssues: acceptanceExpiredIssues.length,
      autoEscalatedRisks: autoEscalatedRisks.length,
      autoEscalatedIssues: autoEscalatedIssues.length,
    }
  })
}

async function executeProjectDailySnapshotJob() {
  return runApiJob('projectDailySnapshotJob', async () => recordProjectDailySnapshots())
}

async function executePlanningGovernanceJob() {
  return runApiJob('planningGovernanceJob', async () => {
    const safeRun = async <T>(label: string, fn: () => Promise<T[]>): Promise<T[]> => {
      try {
        return await fn()
      } catch (error) {
        logger.error(`[planningGovernanceJob] ${label} failed`, {
          error: error instanceof Error ? error.message : String(error),
        })
        return []
      }
    }

    const [healthReports, integrityReports, anomalyReports, notifications, baselineValidityReports] = await Promise.all([
      safeRun('healthScan', () => new PlanningHealthService().scanAllProjectHealth()),
      safeRun('integrityScan', () => new PlanningIntegrityService().scanAllProjectIntegrity()),
      safeRun('anomalyScan', () => new SystemAnomalyService().scanAllProjectPassiveReorder()),
      safeRun('governanceNotifications', () => planningGovernanceService.persistProjectGovernanceNotifications()),
      safeRun('baselineValidity', () => scanAllProjectBaselineValidity()),
    ])

    return {
      healthReports: healthReports.length,
      integrityReports: integrityReports.length,
      anomalyReports: anomalyReports.length,
      notifications: notifications.length,
      baselineValidityReports: baselineValidityReports.length,
      baselinesQueuedForRealign: baselineValidityReports.filter((item) => item.action === 'queued_realign').length,
    }
  })
}

async function executeDataQualityJob() {
  return runApiJob('dataQualityJob', async () => {
    const reports = await dataQualityService.syncAllProjectsDataQuality()
    return {
      projects: reports.length,
      lowConfidenceProjects: reports.filter((report) => report.confidence.flag === 'low').length,
      // eslint-disable-next-line -- route-level-aggregation-approved
      activeFindings: reports.reduce((sum, report) => sum + report.confidence.activeFindingCount, 0),
      // eslint-disable-next-line -- route-level-aggregation-approved
      trendWarnings: reports.reduce((sum, report) => sum + report.confidence.trendWarningCount, 0),
    }
  })
}

async function executeDelayRequestReminderJob() {
  return runApiJob('delayRequestReminderJob', async () => {
    const notifications = await new DelayRequestNotificationService().persistPendingDelayRequestNotifications()
    return {
      scanned: notifications.length,
      reminders: notifications.filter((item) => item.type === 'delay_request_reminder').length,
      escalations: notifications.filter((item) => item.type === 'delay_request_escalation').length,
    }
  })
}

async function executeOperationalNotificationJob() {
  return runApiJob('operationalNotificationJob', async () => {
    const notifications = await new OperationalNotificationService().syncAllProjectNotifications()
    return {
      notificationsWritten: notifications.length,
      dateInversionNotifications: notifications.filter((item) => item.type === 'date_inversion').length,
      statusProgressNotifications: notifications.filter((item) => item.type === 'status_progress_mismatch').length,
    }
  })
}

async function executeNotificationLifecycleJob() {
  return runApiJob('notificationLifecycleJob', async () => new NotificationLifecycleService().runRetentionPolicy())
}

async function executeMaterialArrivalReminderJob() {
  return runApiJob('materialArrivalReminderJob', async () => materialArrivalReminderService.run())
}

async function executeWeeklyDigestJob() {
  return runApiJob('weeklyDigestJob', async () => {
    await weeklyDigestService.generateForAllProjects()
    return {
      generated: true,
    }
  })
}

async function executeJob(jobName: string) {
  switch (jobName) {
    case 'riskStatisticsJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await riskStatisticsJob.executeNow(),
      }
    case 'conditionAlertJob':
      return executeConditionAlertJob()
    case 'projectDailySnapshotJob':
      return executeProjectDailySnapshotJob()
    case 'planningDraftLockTimeoutJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await planningDraftLockTimeoutJob.executeNow(),
      }
    case 'responsibilityAlertJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await responsibilityAlertJob.executeNow(),
      }
    case 'planningGovernanceJob':
      return executePlanningGovernanceJob()
    case 'dataQualityJob':
      return executeDataQualityJob()
    case 'delayRequestReminderJob':
      return executeDelayRequestReminderJob()
    case 'operationalNotificationJob':
      return executeOperationalNotificationJob()
    case 'notificationLifecycleJob':
      return executeNotificationLifecycleJob()
    case 'dataRetentionJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await dataRetentionJob.executeNow(),
      }
    case 'weeklyDigestJob':
      return executeWeeklyDigestJob()
    case 'materialArrivalReminderJob':
      return executeMaterialArrivalReminderJob()
    default:
      return null
  }
}

function sendStatus(res: express.Response) {
  res.json({
    success: true,
    data: {
      jobs: buildJobStatusViews(),
      timestamp: new Date().toISOString(),
    },
  })
}

router.get('/', asyncHandler(async (_req, res) => {
  sendStatus(res)
}))

router.get('/status', asyncHandler(async (_req, res) => {
  sendStatus(res)
}))

router.post('/:jobName/execute', validate(jobNameParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { jobName } = req.params
  const execution = await executeJob(jobName)

  if (execution === null) {
    res.status(404).json({
      success: false,
      error: {
        code: 'JOB_NOT_FOUND',
        message: `Unknown job: ${jobName}`,
      },
      timestamp: new Date().toISOString(),
    })
    return
  }

  res.json({
    success: true,
    message: `任务已触发: ${jobName}`,
    jobId: execution.jobId,
    jobName,
    attempts: execution.attempts,
    result: execution.result,
    triggeredAt: new Date().toISOString(),
  })
}))

export default router
