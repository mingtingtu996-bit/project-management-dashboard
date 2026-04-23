import { dataRetentionJob } from './jobs/dataRetentionJob.js'
import { planningDraftLockTimeoutJob } from './jobs/planningDraftLockTimeoutJob.js'
import { responsibilityAlertJob } from './jobs/responsibilityAlertJob.js'
import { riskStatisticsJob } from './jobs/riskStatisticsJob.js'
import { logger } from './middleware/logger.js'
import { runJobWithRetry } from './services/jobRuntime.js'
import { DelayRequestNotificationService } from './services/delayRequestNotificationService.js'
import { dataQualityService } from './services/dataQualityService.js'
import { NotificationLifecycleService } from './services/notificationLifecycleService.js'
import { OperationalNotificationService } from './services/operationalNotificationService.js'
import { PlanningHealthService } from './services/planningHealthService.js'
import { PlanningIntegrityService } from './services/planningIntegrityService.js'
import { planningGovernanceService } from './services/planningGovernanceService.js'
import { scanAllProjectBaselineValidity } from './services/baselineGovernanceService.js'
import { materialArrivalReminderService } from './services/materialArrivalReminderService.js'
import { recordProjectHealthSnapshots } from './services/projectHealthService.js'
import { SystemAnomalyService } from './services/systemAnomalyService.js'
import { WarningService } from './services/warningService.js'
import { weeklyDigestService } from './services/weeklyDigestService.js'

const MAX_TIMEOUT_MS = 2_147_483_647
const DAY_IN_MS = 24 * 60 * 60 * 1000
const HOUR_IN_MS = 60 * 60 * 1000

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

class ConditionAlertJob {
  private timer: NodeJS.Timeout | null = null
  private startTimer: NodeJS.Timeout | null = null
  private warningService = new WarningService()

  start() {
    if (this.timer || this.startTimer) {
      logger.warn('Condition/obstacle warning job is already running')
      return
    }

    const now = new Date()
    const nextHour = new Date(now)
    nextHour.setMinutes(0, 0, 0)
    nextHour.setHours(nextHour.getHours() + 1)
    const initialDelay = Math.max(nextHour.getTime() - now.getTime(), 0)

    this.startTimer = setTimeout(() => {
      this.startTimer = null
      void this.execute('scheduler')
      this.timer = setInterval(() => {
        void this.execute('scheduler')
      }, HOUR_IN_MS)
    }, initialDelay)
  }

  stop() {
    if (this.startTimer) {
      clearTimeout(this.startTimer)
      this.startTimer = null
    }

    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      logger.info('Condition/obstacle warning job stopped')
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    const jobId = createJobId()

    try {
      logger.info('Start condition/obstacle warning scan', { triggeredBy, jobId })
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'conditionAlertJob',
          triggeredBy,
          jobId,
        },
        async () => {
          const warnings = await this.warningService.syncActiveWarnings()
          const reminders = await this.warningService.generateReminders()
          const [conditionExpiredIssues, acceptanceExpiredIssues, autoEscalatedRisks, autoEscalatedIssues] = await Promise.all([
            this.warningService.syncConditionExpiredIssues(),
            this.warningService.syncAcceptanceExpiredIssues(),
            this.warningService.autoEscalateWarnings(),
            this.warningService.autoEscalateRisksToIssues(),
          ])

          return {
            warnings: warnings.length,
            reminders: reminders.length,
            conditionExpiredIssues: conditionExpiredIssues.length,
            acceptanceExpiredIssues: acceptanceExpiredIssues.length,
            autoEscalatedRisks: autoEscalatedRisks.length,
            autoEscalatedIssues: autoEscalatedIssues.length,
          }
        },
      )

      logger.info('Condition/obstacle warning scan completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
    } catch (error) {
      logger.error('Condition/obstacle warning scan failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

class DelayRequestReminderJob {
  private timer: NodeJS.Timeout | null = null
  private startTimer: NodeJS.Timeout | null = null
  private isRunning = false
  private service = new DelayRequestNotificationService()

  start() {
    if (this.timer || this.startTimer) {
      logger.warn('Delay request reminder job is already running')
      return
    }

    void this.execute('scheduler')

    const now = new Date()
    const nextRun = new Date(now)
    nextRun.setDate(nextRun.getDate() + 1)
    nextRun.setHours(9, 0, 0, 0)
    const initialDelay = Math.max(nextRun.getTime() - now.getTime(), 0)

    this.startTimer = setTimeout(() => {
      this.startTimer = null
      void this.execute('scheduler')
      this.timer = setInterval(() => {
        void this.execute('scheduler')
      }, DAY_IN_MS)
    }, initialDelay)
  }

  stop() {
    if (this.startTimer) {
      clearTimeout(this.startTimer)
      this.startTimer = null
    }

    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      logger.info('Delay request reminder job stopped')
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    if (this.isRunning) {
      logger.warn('Delay request reminder job is already running, skip tick')
      return
    }

    this.isRunning = true
    const jobId = createJobId()

    try {
      logger.info('Start delay request reminder scan', { triggeredBy, jobId })
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'delayRequestReminderJob',
          triggeredBy,
          jobId,
        },
        async () => {
          const notifications = await this.service.persistPendingDelayRequestNotifications()
          return {
            scanned: notifications.length,
            reminders: notifications.filter((item) => item.type === 'delay_request_reminder').length,
            escalations: notifications.filter((item) => item.type === 'delay_request_escalation').length,
          }
        },
      )

      logger.info('Delay request reminder scan completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
    } catch (error) {
      logger.error('Delay request reminder scan failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.isRunning = false
    }
  }
}

class HealthHistorySnapshotJob {
  private timer: NodeJS.Timeout | null = null
  private isRunning = false
  private nextRun: Date | null = null

  start() {
    if (this.timer) {
      logger.warn('Health history snapshot job is already running')
      return
    }

    this.scheduleNextRun()
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
      this.nextRun = null
      logger.info('Health history snapshot job stopped')
    }
  }

  private scheduleNextRun() {
    const now = new Date()
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 5, 0, 0)
    const nextRun =
      firstDayThisMonth > now
        ? firstDayThisMonth
        : new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 5, 0, 0)

    this.scheduleForDate(nextRun)
  }

  private scheduleForDate(targetDate: Date) {
    const delay = Math.max(targetDate.getTime() - Date.now(), 0)
    this.nextRun = targetDate

    logger.info('Health history snapshot job scheduled', {
      nextRun: targetDate.toISOString(),
      remainingMs: delay,
    })

    if (delay > MAX_TIMEOUT_MS) {
      this.timer = setTimeout(() => {
        this.timer = null
        this.scheduleForDate(targetDate)
      }, MAX_TIMEOUT_MS)
      return
    }

    this.timer = setTimeout(async () => {
      this.timer = null
      await this.execute('scheduler')
      this.scheduleNextRun()
    }, delay)
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    if (this.isRunning) {
      logger.warn('Health history snapshot job is already running, skip tick')
      return
    }

    this.isRunning = true
    const jobId = createJobId()

    try {
      logger.info('Start health history snapshot recording', { triggeredBy, jobId })
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'healthHistorySnapshotJob',
          triggeredBy,
          jobId,
        },
        async () => recordProjectHealthSnapshots(),
      )

      logger.info('Health history snapshot recording completed', {
        triggeredBy,
        jobId,
        attempts,
        recorded: value.recorded,
        failed: value.failed,
        period: value.period,
      })
    } catch (error) {
      logger.error('Health history snapshot recording failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.isRunning = false
    }
  }
}

class DataQualityJob {
  private timer: NodeJS.Timeout | null = null
  private startTimer: NodeJS.Timeout | null = null
  private isRunning = false

  start() {
    if (this.timer || this.startTimer) {
      logger.warn('Data quality job is already running')
      return
    }

    const now = new Date()
    const nextRun = new Date(now)
    nextRun.setHours(2, 30, 0, 0)
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1)
    }

    const initialDelay = Math.max(nextRun.getTime() - now.getTime(), 0)
    logger.info('Data quality job scheduled', {
      nextRun: nextRun.toISOString(),
      trigger: 'daily_02_30',
      initialDelay,
    })

    this.startTimer = setTimeout(() => {
      this.startTimer = null
      void this.execute('scheduler')
      this.timer = setInterval(() => {
        void this.execute('scheduler')
      }, DAY_IN_MS)
    }, initialDelay)
  }

  stop() {
    if (this.startTimer) {
      clearTimeout(this.startTimer)
      this.startTimer = null
    }

    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      logger.info('Data quality job stopped')
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    if (this.isRunning) {
      logger.warn('Data quality job is already running, skip tick')
      return
    }

    this.isRunning = true
    const jobId = createJobId()

    try {
      logger.info('Start data quality scan', { triggeredBy, jobId })
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'dataQualityJob',
          triggeredBy,
          jobId,
        },
        async () => {
          const reports = await dataQualityService.syncAllProjectsDataQuality()
          return {
            projects: reports.length,
            lowConfidenceProjects: reports.filter((report) => report.confidence.flag === 'low').length,
            activeFindings: reports.reduce((sum, report) => sum + report.confidence.activeFindingCount, 0),
            trendWarnings: reports.reduce((sum, report) => sum + report.confidence.trendWarningCount, 0),
          }
        },
      )

      logger.info('Data quality scan completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
    } catch (error) {
      logger.error('Data quality scan failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.isRunning = false
    }
  }
}

class PlanningGovernanceJob {
  private timer: NodeJS.Timeout | null = null
  private startTimer: NodeJS.Timeout | null = null
  private isRunning = false

  start() {
    if (this.timer || this.startTimer) {
      logger.warn('Planning governance job is already running')
      return
    }

    const now = new Date()
    const nextRun = new Date(now)
    nextRun.setHours(1, 0, 0, 0)
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1)
    }

    const initialDelay = Math.max(nextRun.getTime() - now.getTime(), 0)
    logger.info('Planning governance job scheduled', {
      nextRun: nextRun.toISOString(),
      trigger: 'daily_01_00',
      initialDelay,
    })

    this.startTimer = setTimeout(() => {
      this.startTimer = null
      void this.execute('scheduler')
      this.timer = setInterval(() => {
        void this.execute('scheduler')
      }, DAY_IN_MS)
    }, initialDelay)
  }

  stop() {
    if (this.startTimer) {
      clearTimeout(this.startTimer)
      this.startTimer = null
    }

    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      logger.info('Planning governance job stopped')
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    if (this.isRunning) {
      logger.warn('Planning governance job is already running, skip tick')
      return
    }

    this.isRunning = true
    const jobId = createJobId()

    try {
      logger.info('Start planning governance scan', { triggeredBy, jobId })
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'planningGovernanceJob',
          triggeredBy,
          jobId,
        },
        async () => {
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
            baselineValidityReports: baselineValidityReports.length,
            baselinesQueuedForRealign: baselineValidityReports.filter((item) => item.action === 'queued_realign').length,
            notifications_written: notifications.length,
            closeout_notifications: notifications.filter((item) => String(item.type ?? '').includes('closeout')).length,
            reorder_notifications: notifications.filter((item) => String(item.type ?? '').includes('reorder')).length,
            ad_hoc_notifications: notifications.filter((item) => String(item.type ?? '').includes('ad_hoc_cross_month')).length,
          }
        },
      )

      logger.info('Planning governance scan completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
    } catch (error) {
      logger.error('Planning governance scan failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.isRunning = false
    }
  }
}

class OperationalNotificationJob {
  private timer: NodeJS.Timeout | null = null
  private isRunning = false
  private service = new OperationalNotificationService()

  start() {
    if (this.timer) {
      logger.warn('Operational notification job is already running')
      return
    }

    void this.execute('scheduler')
    this.timer = setInterval(() => {
      void this.execute('scheduler')
    }, 2 * HOUR_IN_MS)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      logger.info('Operational notification job stopped')
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    if (this.isRunning) {
      logger.warn('Operational notification job is already running, skip tick')
      return
    }

    this.isRunning = true
    const jobId = createJobId()

    try {
      logger.info('Start operational notification scan', { triggeredBy, jobId })
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'operationalNotificationJob',
          triggeredBy,
          jobId,
        },
        async () => {
          const notifications = await this.service.syncAllProjectNotifications()
          return {
            notificationsWritten: notifications.length,
            dateInversionNotifications: notifications.filter((item) => item.type === 'date_inversion').length,
            statusProgressNotifications: notifications.filter((item) => item.type === 'status_progress_mismatch').length,
          }
        },
      )

      logger.info('Operational notification scan completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
    } catch (error) {
      logger.error('Operational notification scan failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.isRunning = false
    }
  }
}

class NotificationLifecycleJob {
  private timer: NodeJS.Timeout | null = null
  private startTimer: NodeJS.Timeout | null = null
  private isRunning = false
  private service = new NotificationLifecycleService()

  start() {
    if (this.timer || this.startTimer) {
      logger.warn('Notification lifecycle job is already running')
      return
    }

    const now = new Date()
    const nextRun = new Date(now)
    nextRun.setHours(3, 30, 0, 0)
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1)
    }

    const initialDelay = Math.max(nextRun.getTime() - now.getTime(), 0)
    logger.info('Notification lifecycle job scheduled', {
      nextRun: nextRun.toISOString(),
      trigger: 'daily_03_30',
      initialDelay,
    })

    this.startTimer = setTimeout(() => {
      this.startTimer = null
      void this.execute('scheduler')
      this.timer = setInterval(() => {
        void this.execute('scheduler')
      }, DAY_IN_MS)
    }, initialDelay)
  }

  stop() {
    if (this.startTimer) {
      clearTimeout(this.startTimer)
      this.startTimer = null
    }

    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      logger.info('Notification lifecycle job stopped')
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    if (this.isRunning) {
      logger.warn('Notification lifecycle job is already running, skip tick')
      return
    }

    this.isRunning = true
    const jobId = createJobId()

    try {
      logger.info('Start notification lifecycle cleanup', { triggeredBy, jobId })
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'notificationLifecycleJob',
          triggeredBy,
          jobId,
        },
        async () => this.service.runRetentionPolicy(),
      )

      logger.info('Notification lifecycle cleanup completed', {
        triggeredBy,
        jobId,
        attempts,
        archived: value.archived,
        deleted: value.deleted,
      })
    } catch (error) {
      logger.error('Notification lifecycle cleanup failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.isRunning = false
    }
  }
}

class WeeklyDigestJob {
  private timer: NodeJS.Timeout | null = null
  private startTimer: NodeJS.Timeout | null = null

  start() {
    if (this.timer || this.startTimer) return
    const now = new Date()
    // 下一个周一 09:00
    const next = new Date(now)
    const day = next.getDay()
    const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day
    next.setDate(next.getDate() + daysUntilMonday)
    next.setHours(9, 0, 0, 0)
    const initialDelay = Math.max(next.getTime() - now.getTime(), 0)
    const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000

    this.startTimer = setTimeout(() => {
      this.startTimer = null
      void weeklyDigestService.generateForAllProjects()
      this.timer = setInterval(() => {
        void weeklyDigestService.generateForAllProjects()
      }, WEEK_IN_MS)
    }, initialDelay)
  }

  stop() {
    if (this.startTimer) { clearTimeout(this.startTimer); this.startTimer = null }
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }
}

class MaterialArrivalReminderJob {
  private timer: NodeJS.Timeout | null = null
  private startTimer: NodeJS.Timeout | null = null
  private isRunning = false

  start() {
    if (this.timer || this.startTimer) {
      logger.warn('Material arrival reminder job is already running')
      return
    }

    void this.execute('scheduler')

    const now = new Date()
    const nextRun = new Date(now)
    nextRun.setDate(nextRun.getDate() + 1)
    nextRun.setHours(8, 30, 0, 0)
    const initialDelay = Math.max(nextRun.getTime() - now.getTime(), 0)

    this.startTimer = setTimeout(() => {
      this.startTimer = null
      void this.execute('scheduler')
      this.timer = setInterval(() => {
        void this.execute('scheduler')
      }, DAY_IN_MS)
    }, initialDelay)
  }

  stop() {
    if (this.startTimer) {
      clearTimeout(this.startTimer)
      this.startTimer = null
    }

    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      logger.info('Material arrival reminder job stopped')
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    if (this.isRunning) {
      logger.warn('Material arrival reminder job is already running, skip tick')
      return
    }

    this.isRunning = true
    const jobId = createJobId()

    try {
      logger.info('Start material arrival reminder scan', { triggeredBy, jobId })
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'materialArrivalReminderJob',
          triggeredBy,
          jobId,
        },
        async () => materialArrivalReminderService.run(),
      )

      logger.info('Material arrival reminder scan completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
    } catch (error) {
      logger.error('Material arrival reminder scan failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.isRunning = false
    }
  }
}

const conditionAlertJob = new ConditionAlertJob()
const delayRequestReminderJob = new DelayRequestReminderJob()
const healthHistorySnapshotJob = new HealthHistorySnapshotJob()
const dataQualityJob = new DataQualityJob()
const planningGovernanceJob = new PlanningGovernanceJob()
const operationalNotificationJob = new OperationalNotificationJob()
const notificationLifecycleJob = new NotificationLifecycleJob()
const weeklyDigestJob = new WeeklyDigestJob()
const materialArrivalReminderJob = new MaterialArrivalReminderJob()

function startAllJobs() {
  console.log('Starting scheduled jobs...')

  riskStatisticsJob.start('0 2 * * *')
  console.log('Risk statistics job started (daily 02:00)')

  conditionAlertJob.start()
  console.log('Condition/obstacle warning job started (hourly)')

  healthHistorySnapshotJob.start()
  console.log('Health history snapshot job started (monthly 1st 00:05)')

  dataQualityJob.start()
  console.log('Data quality job started (daily 02:30)')

  planningDraftLockTimeoutJob.start()
  console.log('Planning draft lock timeout job started (every minute)')

  planningGovernanceJob.start()
  console.log('Planning governance job started (daily 01:00)')

  delayRequestReminderJob.start()
  console.log('Delay request reminder job started (daily 09:00)')

  responsibilityAlertJob.start()
  console.log('Responsibility alert job started (daily 08:15)')

  operationalNotificationJob.start()
  console.log('Operational notification job started (every 2 hours)')

  notificationLifecycleJob.start()
  console.log('Notification lifecycle job started (daily 03:30)')

  dataRetentionJob.start()
  console.log('Data retention job started (monthly 1st 04:15)')

  weeklyDigestJob.start()
  console.log('Weekly digest job started (every Monday 09:00)')

  materialArrivalReminderJob.start()
  console.log('Material arrival reminder job started (daily 08:30)')

  console.log('All scheduled jobs started, running...')
  console.log('Press Ctrl+C to stop all jobs')

  const stopAll = () => {
    console.log('\nReceived shutdown signal, stopping scheduled jobs...')
    riskStatisticsJob.stop()
    conditionAlertJob.stop()
    planningDraftLockTimeoutJob.stop()
    planningGovernanceJob.stop()
    delayRequestReminderJob.stop()
    responsibilityAlertJob.stop()
    healthHistorySnapshotJob.stop()
    dataQualityJob.stop()
    operationalNotificationJob.stop()
    notificationLifecycleJob.stop()
    dataRetentionJob.stop()
    weeklyDigestJob.stop()
    materialArrivalReminderJob.stop()
    console.log('All jobs stopped')
    process.exit(0)
  }

  process.on('SIGINT', stopAll)
  process.on('SIGTERM', stopAll)
}

startAllJobs()
