import { algorithmSeedCandidateDiscoveryJob } from './jobs/algorithmSeedCandidateDiscoveryJob.js'
import { algorithmAssetLearnableParameterImpactMonitoringJob } from './jobs/algorithmAssetLearnableParameterImpactMonitoringJob.js'
import { acceptanceTemplatePolicyAutoPublishJob } from './jobs/acceptanceTemplatePolicyAutoPublishJob.js'
import { certificateTemplatePolicyAutoPublishJob } from './jobs/certificateTemplatePolicyAutoPublishJob.js'
import { constructionDependencyReplayCalibrationJob } from './jobs/constructionDependencyReplayCalibrationJob.js'
import { constructionOrganizationPlanNetworkRuntimeEvidenceJob } from './jobs/constructionOrganizationPlanNetworkRuntimeEvidenceJob.js'
import { dataRetentionJob } from './jobs/dataRetentionJob.js'
import { deletionRetentionCleanupJob } from './jobs/deletionRetentionCleanupJob.js'
import { durationContextPolicyLearningJob } from './jobs/durationContextPolicyLearningJob.js'
import { defaultMasterPlanVisibilityLearningJob } from './jobs/defaultMasterPlanVisibilityLearningJob.js'
import { durationLiveLearningProductionClaimAuditJob } from './jobs/durationLiveLearningProductionClaimAuditJob.js'
import { drawingPackageExperienceIterationJob } from './jobs/drawingPackageExperienceIterationJob.js'
import { forecastResidualOverlayProductionJob } from './jobs/forecastResidualOverlayProductionJob.js'
import { officialHolidayCalendarJob } from './jobs/officialHolidayCalendarJob.js'
import { planningDraftLockTimeoutJob } from './jobs/planningDraftLockTimeoutJob.js'
import { planningReplayCalibrationJob } from './jobs/planningReplayCalibrationJob.js'
import { policyTemplateReleaseImpactMonitoringJob } from './jobs/policyTemplateReleaseImpactMonitoringJob.js'
import { projectClimateProfileJob } from './jobs/projectClimateProfileJob.js'
import { projectProductivityCalibrationJob } from './jobs/projectProductivityCalibrationJob.js'
import { projectWeatherForecastJob } from './jobs/projectWeatherForecastJob.js'
import { responsibilityAlertJob } from './jobs/responsibilityAlertJob.js'
import { riskStatisticsJob } from './jobs/riskStatisticsJob.js'
import { criticalPathRefreshJob } from './jobs/criticalPathRefreshJob.js'
import { standardWorkDurationSeedReplayJob } from './jobs/standardWorkDurationSeedReplayJob.js'
import { templateDurationGovernanceJob } from './jobs/templateDurationGovernanceJob.js'
import { warningImpactSignalGovernanceJob } from './jobs/warningImpactSignalGovernanceJob.js'
import { wizardGenerationRecoveryJob } from './jobs/wizardGenerationRecoveryJob.js'
import { logger } from './middleware/logger.js'
import { runJobWithRetry, runWithJobLease } from './services/jobRuntime.js'
import {
  acquireSchedulerLeadership,
  type SchedulerLeadership,
} from './services/schedulerLeadershipService.js'
import { dataQualityService } from './services/dataQualityService.js'
import { NotificationLifecycleService } from './services/notificationLifecycleService.js'
import { OperationalNotificationService } from './services/operationalNotificationService.js'
import { PlanningHealthService } from './services/planningHealthService.js'
import { PlanningIntegrityService } from './services/planningIntegrityService.js'
import { planningGovernanceService } from './services/planningGovernanceService.js'
import { scanAllProjectBaselineValidity } from './services/baselineGovernanceService.js'
import { scanStableDurationPublicationBaselineImpacts } from './services/durationAssetBaselineRevisionBridgeService.js'
import { materialArrivalReminderService } from './services/materialArrivalReminderService.js'
import { recordProjectDailySnapshots } from './services/projectDailySnapshotService.js'
import { runScheduledProjectDailySnapshotCycle } from './services/scheduledDurationJobResultPolicyService.js'
import { SystemAnomalyService } from './services/systemAnomalyService.js'
import { WarningService } from './services/warningService.js'
import { weeklyDigestService } from './services/weeklyDigestService.js'
import { reconcileResolvedNotifications } from './services/notificationReconciliationService.js'
import { reconcileAllProjectTaskProgressSnapshots } from './services/taskProgressSnapshotReconciliationService.js'
import {
  ScopedBatchOperationError,
  type ScopedBatchFailure,
} from './services/scopedBatchRunner.js'
import {
  assertPersistentJobScheduleReady,
  PersistentWallClockJobTimer,
} from './services/persistentJobScheduleService.js'

const DAY_IN_MS = 24 * 60 * 60 * 1000
const HOUR_IN_MS = 60 * 60 * 1000

function readPositiveIntEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const DAILY_DURATION_FORECAST_LIMIT = readPositiveIntEnv('DAILY_DURATION_FORECAST_LIMIT', 500)
const DAILY_DURATION_FORECAST_BATCH_SIZE = readPositiveIntEnv('DAILY_DURATION_FORECAST_BATCH_SIZE', 50)
const DAILY_DURATION_FORECAST_MAX_RUNTIME_MS = readPositiveIntEnv('DAILY_DURATION_FORECAST_MAX_RUNTIME_MS', 45_000)
const DAILY_DURATION_FORECAST_FRESHNESS_SLO_MS = readPositiveIntEnv('DAILY_DURATION_FORECAST_FRESHNESS_SLO_MS', 36 * HOUR_IN_MS)

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

class ConditionAlertJob {
  private isRunning = false
  private warningService = new WarningService()
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'conditionAlertJob',
    schedule: { kind: 'hourly', minute: 0 },
    catchUp: { limit: 1, maxAgeMs: 2 * HOUR_IN_MS },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => logger.info('Condition/obstacle warning job scheduled', {
      nextRun: nextRun.toISOString(),
      trigger: 'hourly_00',
      initialDelay: delayMs,
    }),
    onError: (error) => logger.error('Condition/obstacle warning scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('Condition/obstacle warning job is already running')
    }
  }

  stop() {
    if (this.wallClockTimer.stop()) {
      logger.info('Condition/obstacle warning job stopped')
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    if (this.isRunning) {
      logger.warn('Condition/obstacle warning job is already running, skip tick')
      return
    }

    this.isRunning = true
    const jobId = createJobId()

    try {
      logger.info('Start condition/obstacle warning scan', { triggeredBy, jobId })
      const lease = await runWithJobLease(
        {
          jobName: 'conditionAlertJob',
          jobId,
        },
        async (lease) => {
          return runJobWithRetry(
            {
              jobName: 'conditionAlertJob',
              triggeredBy,
              jobId,
            },
            async () => {
              lease.assertActive()
              const warnings = await this.warningService.syncActiveWarnings(undefined, { systemJob: true })
              lease.assertActive()
              const reminders = await this.warningService.generateReminders()
              lease.assertActive()
              const conditionExpiredIssues = await this.warningService.syncConditionExpiredIssues()
              lease.assertActive()
              const acceptanceExpiredIssues = await this.warningService.syncAcceptanceExpiredIssues()
              lease.assertActive()
              const autoEscalatedRisks = await this.warningService.autoEscalateWarnings()
              lease.assertActive()
              const autoEscalatedIssues = await this.warningService.autoEscalateRisksToIssues()
              lease.assertActive()

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
        },
      )

      if (!lease.acquired) {
        logger.warn('Condition/obstacle warning scan skipped because distributed lease was not acquired', {
          triggeredBy,
          jobId,
          reason: 'lease_not_acquired',
        })
        return
      }

      const { attempts, value } = lease.value

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
      throw error
    } finally {
      this.isRunning = false
    }
  }
}

class ProjectDailySnapshotJob {
  private isRunning = false
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'projectDailySnapshotJob',
    schedule: { kind: 'daily', hour: 0, minute: 10 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => logger.info('Project daily snapshot job scheduled', {
      nextRun: nextRun.toISOString(),
      trigger: 'daily_00_10',
      initialDelay: delayMs,
    }),
    onError: (error) => logger.error('Project daily snapshot scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('Project daily snapshot job is already running')
    }
  }

  stop() {
    if (this.wallClockTimer.stop()) {
      logger.info('Project daily snapshot job stopped')
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    if (this.isRunning) {
      logger.warn('Project daily snapshot job is already running, skip tick')
      return
    }

    this.isRunning = true
    const jobId = createJobId()

    try {
      logger.info('Start project daily snapshot recording', { triggeredBy, jobId })
      const lease = await runWithJobLease(
        {
          jobName: 'projectDailySnapshotJob',
          jobId,
        },
        async (lease) => runJobWithRetry(
          {
            jobName: 'projectDailySnapshotJob',
            triggeredBy,
            jobId,
          },
          async () => {
            lease.assertActive()
            return runScheduledProjectDailySnapshotCycle({
              reconcileTaskProgressSnapshots: () => reconcileAllProjectTaskProgressSnapshots(),
              assertLeaseActive: lease.assertActive,
              writeProjectDailySnapshots: () => recordProjectDailySnapshots(),
            })
          },
        ),
      )

      if (!lease.acquired) {
        logger.warn('Project daily snapshot recording skipped because distributed lease was not acquired', {
          triggeredBy,
          jobId,
          reason: 'lease_not_acquired',
        })
        return
      }

      const { attempts, value } = lease.value
      logger.info('Project daily snapshot recording completed', {
        triggeredBy,
        jobId,
        attempts,
        reconciledTaskProgressSnapshots: value.reconciliation.repaired,
        taskProgressSnapshotDrift: value.reconciliation.driftCount,
        recorded: value.snapshot.recorded,
        failed: value.snapshot.failed,
        snapshotDate: value.snapshot.snapshotDate,
      })
    } catch (error) {
      logger.error('Project daily snapshot recording failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      this.isRunning = false
    }
  }
}

class DailyTaskDurationForecastJob {
  private isRunning = false
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'dailyTaskDurationForecastJob',
    schedule: { kind: 'daily', hour: 0, minute: 40 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => logger.info('Daily task duration forecast job scheduled', {
      nextRun: nextRun.toISOString(),
      trigger: 'daily_00_40',
      initialDelay: delayMs,
    }),
    onError: (error) => logger.error('Daily task duration forecast scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('Daily task duration forecast job is already running')
    }
  }

  stop() {
    if (this.wallClockTimer.stop()) {
      logger.info('Daily task duration forecast job stopped')
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    if (this.isRunning) {
      logger.warn('Daily task duration forecast job is already running, skip tick')
      return
    }

    this.isRunning = true
    const jobId = createJobId()

    try {
      logger.info('Start daily task duration forecast refresh', { triggeredBy, jobId })
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'dailyTaskDurationForecastJob',
          triggeredBy,
          jobId,
        },
        async () => {
          const { refreshDailyActiveTaskDurationForecasts } = await import('./services/taskDurationForecastService.js')
          return refreshDailyActiveTaskDurationForecasts({
            limit: DAILY_DURATION_FORECAST_LIMIT,
            batchSize: DAILY_DURATION_FORECAST_BATCH_SIZE,
            maxRuntimeMs: DAILY_DURATION_FORECAST_MAX_RUNTIME_MS,
            freshnessSloMs: DAILY_DURATION_FORECAST_FRESHNESS_SLO_MS,
          })
        },
      )

      logger.info('Daily task duration forecast refresh completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
    } catch (error) {
      logger.error('Daily task duration forecast refresh failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
      if (triggeredBy === 'scheduler') throw error
    } finally {
      this.isRunning = false
    }
  }
}

class DataQualityJob {
  private isRunning = false
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'dataQualityJob',
    schedule: { kind: 'daily', hour: 2, minute: 30 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => logger.info('Data quality job scheduled', {
      nextRun: nextRun.toISOString(),
      trigger: 'daily_02_30',
      initialDelay: delayMs,
    }),
    onError: (error) => logger.error('Data quality scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('Data quality job is already running')
    }
  }

  stop() {
    if (this.wallClockTimer.stop()) {
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
      throw error
    } finally {
      this.isRunning = false
    }
  }
}

class PlanningGovernanceJob {
  private isRunning = false
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'planningGovernanceJob',
    schedule: { kind: 'daily', hour: 1, minute: 0 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => logger.info('Planning governance job scheduled', {
      nextRun: nextRun.toISOString(),
      trigger: 'daily_01_00',
      initialDelay: delayMs,
    }),
    onError: (error) => logger.error('Planning governance scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('Planning governance job is already running')
    }
  }

  stop() {
    if (this.wallClockTimer.stop()) {
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
      const lease = await runWithJobLease(
        {
          jobName: 'planningGovernanceJob',
          jobId,
        },
        async (lease) => runJobWithRetry(
          {
            jobName: 'planningGovernanceJob',
            triggeredBy,
            jobId,
          },
          async () => {
            const planningGovernanceFailures: ScopedBatchFailure[] = []
            const successfulPlanningGovernanceScopes: string[] = []
            const safeRun = async <T>(label: string, fn: () => Promise<T[]>): Promise<T[]> => {
              lease.assertActive()
              try {
                const value = await fn()
                lease.assertActive()
                successfulPlanningGovernanceScopes.push(label)
                return value
              } catch (error) {
                lease.assertActive()
                logger.error(`[planningGovernanceJob] ${label} failed`, {
                  error: error instanceof Error ? error.message : String(error),
                })
                planningGovernanceFailures.push({
                  scopeId: label,
                  attempts: 1,
                  errorMessage: error instanceof Error ? error.message : String(error),
                })
                return []
              }
            }

            const baselineValidityReports = await safeRun('baselineValidity', () => scanAllProjectBaselineValidity())
            const healthReports = await safeRun('healthScan', () => new PlanningHealthService().scanAllProjectHealth())
            const integrityReports = await safeRun('integrityScan', () => new PlanningIntegrityService().scanAllProjectIntegrity())
            const anomalyReports = await safeRun('anomalyScan', () => new SystemAnomalyService().scanAllProjectPassiveReorder())
            const notifications = await safeRun('governanceNotifications', () => planningGovernanceService.persistProjectGovernanceNotifications())
            const baselineRevisionReports = await safeRun(
              'stableDurationPublicationBaselineImpact',
              () => scanStableDurationPublicationBaselineImpacts(),
            )

            if (planningGovernanceFailures.length > 0) {
              throw new ScopedBatchOperationError(
                'planning_governance_scan',
                planningGovernanceFailures,
                successfulPlanningGovernanceScopes,
              )
            }

            return {
              healthReports: healthReports.length,
              integrityReports: integrityReports.length,
              anomalyReports: anomalyReports.length,
              baselineValidityReports: baselineValidityReports.length,
              baselinesQueuedForRealign: baselineValidityReports.filter((item) => item.action === 'queued_realign').length,
              baselineRevisionImpactReports: baselineRevisionReports.length,
              baselineRevisionDraftsCreated: baselineRevisionReports.filter((item) => item.status === 'revision_draft_created').length,
              baselineRevisionNoChange: baselineRevisionReports.filter((item) => item.status === 'no_revision_required').length,
              baselineRevisionBlocked: baselineRevisionReports.filter((item) => item.status === 'blocked').length,
              notifications_written: notifications.length,
              closeout_notifications: notifications.filter((item) => String(item.type ?? '').includes('closeout')).length,
              reorder_notifications: notifications.filter((item) => String(item.type ?? '').includes('reorder')).length,
              ad_hoc_notifications: notifications.filter((item) => String(item.type ?? '').includes('ad_hoc_cross_month')).length,
            }
          },
        ),
      )

      if (!lease.acquired) {
        logger.warn('Planning governance scan skipped because distributed lease was not acquired', {
          triggeredBy,
          jobId,
          reason: 'lease_not_acquired',
        })
        return
      }

      const { attempts, value } = lease.value
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
      throw error
    } finally {
      this.isRunning = false
    }
  }
}

class OperationalNotificationJob {
  private isRunning = false
  private service = new OperationalNotificationService()
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'operationalNotificationJob',
    schedule: { kind: 'hourly_interval', intervalHours: 2, minute: 0 },
    catchUp: { limit: 1, maxAgeMs: 4 * HOUR_IN_MS },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => logger.info('Operational notification job scheduled', {
      nextRun: nextRun.toISOString(),
      trigger: 'every_2_hours',
      initialDelay: delayMs,
    }),
    onError: (error) => logger.error('Operational notification scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('Operational notification job is already running')
    }
  }

  stop() {
    if (this.wallClockTimer.stop()) {
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
      const lease = await runWithJobLease(
        {
          jobName: 'operationalNotificationJob',
          jobId,
        },
        async (lease) => runJobWithRetry(
          {
            jobName: 'operationalNotificationJob',
            triggeredBy,
            jobId,
          },
          async () => {
            lease.assertActive()
            const notifications = await this.service.syncAllProjectNotifications()
            lease.assertActive()
            return {
              notificationsWritten: notifications.length,
              dateInversionNotifications: notifications.filter((item) => item.type === 'date_inversion').length,
              statusProgressNotifications: notifications.filter((item) => item.type === 'status_progress_mismatch').length,
            }
          },
        ),
      )

      if (!lease.acquired) {
        logger.warn('Operational notification scan skipped because distributed lease was not acquired', {
          triggeredBy,
          jobId,
          reason: 'lease_not_acquired',
        })
        return
      }

      const { attempts, value } = lease.value
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
      throw error
    } finally {
      this.isRunning = false
    }
  }
}

class NotificationLifecycleJob {
  private isRunning = false
  private service = new NotificationLifecycleService()
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'notificationLifecycleJob',
    schedule: { kind: 'daily', hour: 3, minute: 30 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => logger.info('Notification lifecycle job scheduled', {
      nextRun: nextRun.toISOString(),
      trigger: 'daily_03_30',
      initialDelay: delayMs,
    }),
    onError: (error) => logger.error('Notification lifecycle scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('Notification lifecycle job is already running')
    }
  }

  stop() {
    if (this.wallClockTimer.stop()) {
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
      const lease = await runWithJobLease(
        {
          jobName: 'notificationLifecycleJob',
          jobId,
        },
        async (lease) => runJobWithRetry(
          {
            jobName: 'notificationLifecycleJob',
            triggeredBy,
            jobId,
          },
          async () => {
            lease.assertActive()
            const value = await this.service.runRetentionPolicy()
            lease.assertActive()
            return value
          },
        ),
      )

      if (!lease.acquired) {
        logger.warn('Notification lifecycle cleanup skipped because distributed lease was not acquired', {
          triggeredBy,
          jobId,
          reason: 'lease_not_acquired',
        })
        return
      }

      const { attempts, value } = lease.value
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
      throw error
    } finally {
      this.isRunning = false
    }
  }
}

class NotificationReconciliationJob {
  private isRunning = false
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'notificationReconciliationJob',
    schedule: { kind: 'hourly', minute: 20 },
    catchUp: { limit: 1, maxAgeMs: 2 * HOUR_IN_MS },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => logger.info('Notification reconciliation job scheduled', {
      nextRun: nextRun.toISOString(),
      trigger: 'hourly_20',
      initialDelay: delayMs,
    }),
    onError: (error) => logger.error('Notification reconciliation scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('Notification reconciliation job is already running')
    }
  }

  stop() {
    if (this.wallClockTimer.stop()) {
      logger.info('Notification reconciliation job stopped')
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    if (this.isRunning) {
      logger.warn('Notification reconciliation job is already running, skip tick')
      return
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      const lease = await runWithJobLease(
        {
          jobName: 'notificationReconciliationJob',
          jobId,
        },
        async (lease) => runJobWithRetry(
          {
            jobName: 'notificationReconciliationJob',
            triggeredBy,
            jobId,
          },
          async () => {
            lease.assertActive()
            const value = await reconcileResolvedNotifications()
            lease.assertActive()
            return value
          },
        ),
      )

      if (!lease.acquired) {
        logger.warn('Notification reconciliation skipped because distributed lease was not acquired', {
          triggeredBy,
          jobId,
          reason: 'lease_not_acquired',
        })
        return
      }

      const { attempts, value } = lease.value
      logger.info('Notification reconciliation completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
    } catch (error) {
      logger.error('Notification reconciliation failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      this.isRunning = false
    }
  }
}

class WeeklyDigestJob {
  private isRunning = false
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'weeklyDigestJob',
    schedule: { kind: 'weekly', dayOfWeek: 1, hour: 9, minute: 0 },
    catchUp: { limit: 1, maxAgeMs: 8 * DAY_IN_MS },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => logger.info('Weekly digest job scheduled', {
      nextRun: nextRun.toISOString(),
      trigger: 'weekly_monday_09_00',
      initialDelay: delayMs,
    }),
    onError: (error) => logger.error('Weekly digest scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('Weekly digest job is already running')
    }
  }

  stop() {
    if (this.wallClockTimer.stop()) {
      logger.info('Weekly digest job stopped')
    }
  }

  private async execute(triggeredBy: 'scheduler' | 'manual' = 'scheduler') {
    if (this.isRunning) {
      logger.warn('Weekly digest job is already running, skip tick')
      return
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      const lease = await runWithJobLease(
        {
          jobName: 'weeklyDigestJob',
          jobId,
        },
        async (lease) => runJobWithRetry(
          {
            jobName: 'weeklyDigestJob',
            triggeredBy,
            jobId,
          },
          async () => {
            lease.assertActive()
            const value = await weeklyDigestService.generateForAllProjects()
            lease.assertActive()
            return value
          },
        ),
      )

      if (!lease.acquired) {
        logger.warn('Weekly digest generation skipped because distributed lease was not acquired', {
          triggeredBy,
          jobId,
          reason: 'lease_not_acquired',
        })
        return
      }

      const { attempts } = lease.value
      logger.info('Weekly digest generation completed', { triggeredBy, jobId, attempts })
    } catch (error) {
      logger.error('Weekly digest generation failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      this.isRunning = false
    }
  }
}

class MaterialArrivalReminderJob {
  private isRunning = false
  private wallClockTimer = new PersistentWallClockJobTimer({
    jobName: 'materialArrivalReminderJob',
    schedule: { kind: 'daily', hour: 8, minute: 30 },
    execute: () => this.execute('scheduler'),
    onScheduled: ({ nextRun, delayMs }) => logger.info('Material arrival reminder job scheduled', {
      nextRun: nextRun.toISOString(),
      trigger: 'daily_08_30',
      initialDelay: delayMs,
    }),
    onError: (error) => logger.error('Material arrival reminder scheduler failed', {
      error: error instanceof Error ? error.message : String(error),
    }),
  })

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('Material arrival reminder job is already running')
    }
  }

  stop() {
    if (this.wallClockTimer.stop()) {
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
      const lease = await runWithJobLease(
        {
          jobName: 'materialArrivalReminderJob',
          jobId,
        },
        async (lease) => runJobWithRetry(
          {
            jobName: 'materialArrivalReminderJob',
            triggeredBy,
            jobId,
          },
          async () => {
            lease.assertActive()
            const value = await materialArrivalReminderService.run()
            lease.assertActive()
            return value
          },
        ),
      )

      if (!lease.acquired) {
        logger.warn('Material arrival reminder scan skipped because distributed lease was not acquired', {
          triggeredBy,
          jobId,
          reason: 'lease_not_acquired',
        })
        return
      }

      const { attempts, value } = lease.value
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
      throw error
    } finally {
      this.isRunning = false
    }
  }
}

const conditionAlertJob = new ConditionAlertJob()
const projectDailySnapshotJob = new ProjectDailySnapshotJob()
const dailyTaskDurationForecastJob = new DailyTaskDurationForecastJob()
const dataQualityJob = new DataQualityJob()
const planningGovernanceJob = new PlanningGovernanceJob()
const operationalNotificationJob = new OperationalNotificationJob()
const notificationLifecycleJob = new NotificationLifecycleJob()
const notificationReconciliationJob = new NotificationReconciliationJob()
const weeklyDigestJob = new WeeklyDigestJob()
const materialArrivalReminderJob = new MaterialArrivalReminderJob()

type SchedulerStartOptions = {
  ownerId?: string
  onLeadershipLost?: (error: Error) => void
}

let schedulerStarted = false
let schedulerLeadership: SchedulerLeadership | null = null

export async function startAllJobs(options: SchedulerStartOptions = {}) {
  if (schedulerStarted) return true
  const ownerId = options.ownerId ?? `scheduler-${process.pid}`
  await assertPersistentJobScheduleReady()
  const leadership = await acquireSchedulerLeadership({
    ownerId,
    onLost: (error) => {
      schedulerLeadership = null
      stopScheduledJobTimers()
      schedulerStarted = false
      options.onLeadershipLost?.(error)
    },
  })
  if (!leadership) return false

  schedulerLeadership = leadership
  schedulerStarted = true
  console.log('Starting scheduled jobs...')

  riskStatisticsJob.start('0 2 * * *')
  console.log('Risk statistics job started (daily 02:00)')

  conditionAlertJob.start()
  console.log('Condition/obstacle warning job started (hourly)')

  projectDailySnapshotJob.start()
  console.log('Project daily snapshot job started (daily 00:10)')

  dailyTaskDurationForecastJob.start()
  console.log('Daily task duration forecast job started (daily 00:40)')

  dataQualityJob.start()
  console.log('Data quality job started (daily 02:30)')

  planningDraftLockTimeoutJob.start()
  console.log('Planning draft lock timeout job started (every minute)')

  wizardGenerationRecoveryJob.start()
  console.log('Wizard generation recovery job started (every 5 minutes)')

  planningGovernanceJob.start()
  console.log('Planning governance job started (daily 01:00)')

  warningImpactSignalGovernanceJob.start()
  console.log('Warning impact signal governance job started (daily 01:20)')

  responsibilityAlertJob.start()
  console.log('Responsibility alert job started (daily 08:15)')

  operationalNotificationJob.start()
  console.log('Operational notification job started (every 2 hours)')

  notificationLifecycleJob.start()
  console.log('Notification lifecycle job started (daily 03:30)')

  notificationReconciliationJob.start()

  dataRetentionJob.start()
  console.log('Data retention job started (monthly 1st 04:15)')

  deletionRetentionCleanupJob.start()
  console.log('Deletion retention cleanup job started (daily 03:45)')

  officialHolidayCalendarJob.start()
  console.log('Official holiday calendar job started (daily 04:45)')

  projectClimateProfileJob.start()
  console.log('Project climate profile job started (daily 05:10)')

  certificateTemplatePolicyAutoPublishJob.start()
  console.log('Certificate template policy auto-publish job started (daily 05:25)')

  acceptanceTemplatePolicyAutoPublishJob.start()
  console.log('Acceptance template policy auto-publish job started (daily 05:35)')

  policyTemplateReleaseImpactMonitoringJob.start()
  console.log('Policy template release impact monitoring job started (daily 06:45)')

  algorithmAssetLearnableParameterImpactMonitoringJob.start()
  console.log('Algorithm asset learnable parameter impact monitoring job started (daily 07:05)')

  constructionOrganizationPlanNetworkRuntimeEvidenceJob.start()
  console.log('Construction organization plan network runtime evidence job started (daily 07:20)')

  drawingPackageExperienceIterationJob.start()
  console.log('Drawing package experience iteration job started (daily 05:45)')

  projectWeatherForecastJob.start()
  console.log('Project weather forecast job started (configured interval)')

  criticalPathRefreshJob.start()
  console.log('Critical path refresh job started (daily 00:25)')

  algorithmSeedCandidateDiscoveryJob.start()
  console.log('Algorithm seed candidate discovery job started (daily 05:40)')

  projectProductivityCalibrationJob.start()
  console.log('Project productivity calibration job started (daily 05:55)')

  forecastResidualOverlayProductionJob.start()
  console.log('Forecast residual overlay production job started (daily 06:05)')

  templateDurationGovernanceJob.start()
  console.log('Template duration governance job started (daily 06:10)')

  standardWorkDurationSeedReplayJob.start()
  console.log('Standard work duration seed replay job started (daily 06:15)')

  durationContextPolicyLearningJob.start()
  console.log('Duration context policy learning job started (daily 06:20)')

  constructionDependencyReplayCalibrationJob.start()
  console.log('Construction dependency replay calibration job started (daily 06:30)')

  defaultMasterPlanVisibilityLearningJob.start()
  console.log('Default master-plan visibility learning job started (daily 06:35)')

  planningReplayCalibrationJob.start()
  console.log('Planning replay calibration job started (daily 06:45)')

  durationLiveLearningProductionClaimAuditJob.start()
  console.log('Duration live learning production claim audit job started (daily 06:45)')

  weeklyDigestJob.start()
  console.log('Weekly digest job started (every Monday 09:00)')

  materialArrivalReminderJob.start()
  console.log('Material arrival reminder job started (daily 08:30)')

  console.log('All scheduled jobs started, running...')
  return true
}

function stopScheduledJobTimers() {
  riskStatisticsJob.stop()
  conditionAlertJob.stop()
  wizardGenerationRecoveryJob.stop()
  planningDraftLockTimeoutJob.stop()
  planningGovernanceJob.stop()
  warningImpactSignalGovernanceJob.stop()
  responsibilityAlertJob.stop()
  projectDailySnapshotJob.stop()
  dailyTaskDurationForecastJob.stop()
  dataQualityJob.stop()
  operationalNotificationJob.stop()
  notificationLifecycleJob.stop()
  notificationReconciliationJob.stop()
  dataRetentionJob.stop()
  deletionRetentionCleanupJob.stop()
  officialHolidayCalendarJob.stop()
  projectClimateProfileJob.stop()
  certificateTemplatePolicyAutoPublishJob.stop()
  acceptanceTemplatePolicyAutoPublishJob.stop()
  policyTemplateReleaseImpactMonitoringJob.stop()
  algorithmAssetLearnableParameterImpactMonitoringJob.stop()
  constructionOrganizationPlanNetworkRuntimeEvidenceJob.stop()
  drawingPackageExperienceIterationJob.stop()
  projectWeatherForecastJob.stop()
  criticalPathRefreshJob.stop()
  algorithmSeedCandidateDiscoveryJob.stop()
  projectProductivityCalibrationJob.stop()
  forecastResidualOverlayProductionJob.stop()
  templateDurationGovernanceJob.stop()
  standardWorkDurationSeedReplayJob.stop()
  durationContextPolicyLearningJob.stop()
  constructionDependencyReplayCalibrationJob.stop()
  defaultMasterPlanVisibilityLearningJob.stop()
  planningReplayCalibrationJob.stop()
  durationLiveLearningProductionClaimAuditJob.stop()
  weeklyDigestJob.stop()
  materialArrivalReminderJob.stop()
}

export async function stopAllJobs() {
  stopScheduledJobTimers()
  schedulerStarted = false
  console.log('All scheduled job timers stopped')
}

export async function releaseSchedulerLeadership() {
  const leadership = schedulerLeadership
  schedulerLeadership = null
  if (leadership) await leadership.release()
}
