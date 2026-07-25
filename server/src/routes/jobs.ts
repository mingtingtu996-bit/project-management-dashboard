import express from 'express'
import { z } from 'zod'

import { acceptanceTemplatePolicyAutoPublishJob } from '../jobs/acceptanceTemplatePolicyAutoPublishJob.js'
import { algorithmSeedCandidateDiscoveryJob } from '../jobs/algorithmSeedCandidateDiscoveryJob.js'
import { certificateTemplatePolicyAutoPublishJob } from '../jobs/certificateTemplatePolicyAutoPublishJob.js'
import { constructionDependencyReplayCalibrationJob } from '../jobs/constructionDependencyReplayCalibrationJob.js'
import { constructionOrganizationPlanNetworkRuntimeEvidenceJob } from '../jobs/constructionOrganizationPlanNetworkRuntimeEvidenceJob.js'
import { dataRetentionJob } from '../jobs/dataRetentionJob.js'
import { defaultMasterPlanVisibilityLearningJob } from '../jobs/defaultMasterPlanVisibilityLearningJob.js'
import { durationContextPolicyLearningJob } from '../jobs/durationContextPolicyLearningJob.js'
import { durationLearningRuntimeEvidenceOutboxDrainJob } from '../jobs/durationLearningRuntimeEvidenceOutboxDrainJob.js'
import { taskWriteFinalizationOutboxDrainJob } from '../jobs/taskWriteFinalizationOutboxDrainJob.js'
import { durationLiveLearningProductionClaimAuditJob } from '../jobs/durationLiveLearningProductionClaimAuditJob.js'
import { drawingPackageExperienceIterationJob } from '../jobs/drawingPackageExperienceIterationJob.js'
import { forecastResidualOverlayProductionJob } from '../jobs/forecastResidualOverlayProductionJob.js'
import { officialHolidayCalendarJob } from '../jobs/officialHolidayCalendarJob.js'
import { planningDraftLockTimeoutJob } from '../jobs/planningDraftLockTimeoutJob.js'
import { planningReplayCalibrationJob } from '../jobs/planningReplayCalibrationJob.js'
import { projectClimateProfileJob } from '../jobs/projectClimateProfileJob.js'
import { projectProductivityCalibrationJob } from '../jobs/projectProductivityCalibrationJob.js'
import { projectWeatherForecastJob } from '../jobs/projectWeatherForecastJob.js'
import { criticalPathRefreshJob } from '../jobs/criticalPathRefreshJob.js'
import { responsibilityAlertJob } from '../jobs/responsibilityAlertJob.js'
import { riskStatisticsJob } from '../jobs/riskStatisticsJob.js'
import { standardWorkDurationSeedReplayJob } from '../jobs/standardWorkDurationSeedReplayJob.js'
import { templateDurationGovernanceJob } from '../jobs/templateDurationGovernanceJob.js'
import { getCurrentCompanyMembership, getVisibleProjectIds } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'
import {
  runJobWithRetry,
  runWithJobLease,
  type JobLeaseContext,
} from '../services/jobRuntime.js'
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

async function requireCurrentCompanyAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: '请先登录' },
        timestamp: new Date().toISOString(),
      })
    }

    const membership = await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
    if (membership?.role !== 'company_admin') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: '仅公司管理员可以访问后台任务' },
        timestamp: new Date().toISOString(),
      })
    }

    next()
  } catch (error) {
    next(error)
  }
}

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

type JobProjectScope = string[] | null

async function resolveJobProjectScope(req: express.Request): Promise<JobProjectScope> {
  if (!req.user?.id) return []
  return await getVisibleProjectIds(req.user.id, req.user.globalRole, getRequestCompanyId(req))
}

function buildStatus(isRunning: boolean, isScheduled: boolean) {
  if (isRunning) return 'running'
  if (isScheduled) return 'scheduled'
  return 'idle'
}

function buildDurationLearningRuntimeEvidenceOutboxDrainStatusView(
  jobStatus = durationLearningRuntimeEvidenceOutboxDrainJob.getStatus(),
): JobStatusView {
  return {
    name: 'durationLearningRuntimeEvidenceOutboxDrainJob',
    displayName: 'Duration learning runtime evidence outbox drain job',
    isRunning: jobStatus.isRunning,
    isScheduled: jobStatus.isScheduled,
    schedule: '*/5 * * * *',
    lastRun: jobStatus.lastRun,
    nextRun: jobStatus.nextRun,
    status: buildStatus(jobStatus.isRunning, jobStatus.isScheduled),
    description:
      'Drains durable duration-learning runtime evidence every five minutes. HTTP manual execution is unavailable; controlled recovery uses the server CLI runbook.',
  }
}

function buildJobStatusViews(): JobStatusView[] {
  const riskJobStatus = riskStatisticsJob.getStatus()
  const draftLockStatus = planningDraftLockTimeoutJob.getStatus()
  const dataRetentionStatus = dataRetentionJob.getStatus()
  const officialHolidayCalendarStatus = officialHolidayCalendarJob.getStatus()
  const projectClimateProfileStatus = projectClimateProfileJob.getStatus()
  const projectWeatherForecastStatus = projectWeatherForecastJob.getStatus()
  const criticalPathRefreshStatus = criticalPathRefreshJob.getStatus()
  const certificateTemplatePolicyAutoPublishStatus = certificateTemplatePolicyAutoPublishJob.getStatus()
  const acceptanceTemplatePolicyAutoPublishStatus = acceptanceTemplatePolicyAutoPublishJob.getStatus()
  const drawingPackageExperienceIterationStatus = drawingPackageExperienceIterationJob.getStatus()
  const algorithmSeedCandidateDiscoveryStatus = algorithmSeedCandidateDiscoveryJob.getStatus()
  const defaultMasterPlanVisibilityLearningStatus = defaultMasterPlanVisibilityLearningJob.getStatus()
  const projectProductivityCalibrationStatus = projectProductivityCalibrationJob.getStatus()
  const forecastResidualOverlayProductionStatus = forecastResidualOverlayProductionJob.getStatus()
  const durationContextPolicyLearningStatus = durationContextPolicyLearningJob.getStatus()
  const durationLearningRuntimeEvidenceOutboxDrainStatus = durationLearningRuntimeEvidenceOutboxDrainJob.getStatus()
  const taskWriteFinalizationOutboxDrainStatus = taskWriteFinalizationOutboxDrainJob.getStatus()
  const responsibilityAlertStatus = responsibilityAlertJob.getStatus()
  const templateDurationGovernanceStatus = templateDurationGovernanceJob.getStatus()
  const standardWorkDurationSeedReplayStatus = standardWorkDurationSeedReplayJob.getStatus()
  const constructionDependencyReplayCalibrationStatus = constructionDependencyReplayCalibrationJob.getStatus()
  const constructionOrganizationPlanNetworkRuntimeEvidenceStatus = constructionOrganizationPlanNetworkRuntimeEvidenceJob.getStatus()
  const planningReplayCalibrationStatus = planningReplayCalibrationJob.getStatus()
  const durationLiveLearningProductionClaimAuditStatus = durationLiveLearningProductionClaimAuditJob.getStatus()

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
      name: 'officialHolidayCalendarJob',
      displayName: '法定节假日官方日历刷新任务',
      isRunning: officialHolidayCalendarStatus.isRunning,
      isScheduled: officialHolidayCalendarStatus.isScheduled,
      schedule: '45 4 * * *',
      lastRun: officialHolidayCalendarStatus.lastRun,
      nextRun: officialHolidayCalendarStatus.nextRun,
      status: buildStatus(officialHolidayCalendarStatus.isRunning, officialHolidayCalendarStatus.isScheduled),
      description: '按年度检查当前年和下一年官方 gov.cn 节假日公告，自动导入缺失年度日历。',
    },
    {
      name: 'projectClimateProfileJob',
      displayName: '项目气候画像刷新任务',
      isRunning: projectClimateProfileStatus.isRunning,
      isScheduled: projectClimateProfileStatus.isScheduled,
      schedule: '10 5 * * *',
      lastRun: projectClimateProfileStatus.lastRun,
      nextRun: projectClimateProfileStatus.nextRun,
      status: buildStatus(projectClimateProfileStatus.isRunning, projectClimateProfileStatus.isScheduled),
      description: '按项目市级定位观察生成气候画像，并在配置可信天气接口时同步城市天气预报。',
    },
    {
      name: 'algorithmSeedCandidateDiscoveryJob',
      displayName: 'Algorithm seed candidate discovery job',
      isRunning: algorithmSeedCandidateDiscoveryStatus.isRunning,
      isScheduled: algorithmSeedCandidateDiscoveryStatus.isScheduled,
      schedule: '40 5 * * *',
      lastRun: algorithmSeedCandidateDiscoveryStatus.lastRun,
      nextRun: algorithmSeedCandidateDiscoveryStatus.nextRun,
      status: buildStatus(algorithmSeedCandidateDiscoveryStatus.isRunning, algorithmSeedCandidateDiscoveryStatus.isScheduled),
      description: 'Discovers semantic process-constraint and acceptance-lag seed candidates from project facts, then runs automatic governance.',
    },
    {
      name: 'defaultMasterPlanVisibilityLearningJob',
      displayName: 'Default master-plan visibility learning job',
      isRunning: defaultMasterPlanVisibilityLearningStatus.isRunning,
      isScheduled: defaultMasterPlanVisibilityLearningStatus.isScheduled,
      schedule: '35 6 * * *',
      lastRun: defaultMasterPlanVisibilityLearningStatus.lastRun,
      nextRun: defaultMasterPlanVisibilityLearningStatus.nextRun,
      status: buildStatus(
        defaultMasterPlanVisibilityLearningStatus.isRunning,
        defaultMasterPlanVisibilityLearningStatus.isScheduled,
      ),
      description: 'Aggregates explicit PM keep, hide, and promote decisions into governed candidate-only visibility policies.',
    },
    {
      name: 'certificateTemplatePolicyAutoPublishJob',
      displayName: 'Certificate template policy auto-publish job',
      isRunning: certificateTemplatePolicyAutoPublishStatus.isRunning,
      isScheduled: certificateTemplatePolicyAutoPublishStatus.isScheduled,
      schedule: '25 5 * * *',
      lastRun: certificateTemplatePolicyAutoPublishStatus.lastRun,
      nextRun: certificateTemplatePolicyAutoPublishStatus.nextRun,
      status: buildStatus(
        certificateTemplatePolicyAutoPublishStatus.isRunning,
        certificateTemplatePolicyAutoPublishStatus.isScheduled,
      ),
      description:
        'Auto-publishes pre-certificate province and city policy seed updates when trusted sources are complete; weak-source assets keep the previous published version.',
    },
    {
      name: 'acceptanceTemplatePolicyAutoPublishJob',
      displayName: 'Acceptance timeline template policy auto-publish job',
      isRunning: acceptanceTemplatePolicyAutoPublishStatus.isRunning,
      isScheduled: acceptanceTemplatePolicyAutoPublishStatus.isScheduled,
      schedule: '35 5 * * *',
      lastRun: acceptanceTemplatePolicyAutoPublishStatus.lastRun,
      nextRun: acceptanceTemplatePolicyAutoPublishStatus.nextRun,
      status: buildStatus(
        acceptanceTemplatePolicyAutoPublishStatus.isRunning,
        acceptanceTemplatePolicyAutoPublishStatus.isScheduled,
      ),
      description:
        'Auto-publishes acceptance timeline city and province policy seed updates when trusted sources are complete; material-affecting changes keep the previous published version.',
    },
    {
      name: 'drawingPackageExperienceIterationJob',
      displayName: 'Drawing package experience iteration job',
      isRunning: drawingPackageExperienceIterationStatus.isRunning,
      isScheduled: drawingPackageExperienceIterationStatus.isScheduled,
      schedule: '45 5 * * *',
      lastRun: drawingPackageExperienceIterationStatus.lastRun,
      nextRun: drawingPackageExperienceIterationStatus.nextRun,
      status: buildStatus(
        drawingPackageExperienceIterationStatus.isRunning,
        drawingPackageExperienceIterationStatus.isScheduled,
      ),
      description:
        'Publishes backend-only drawing package candidate overlays from real project drawing package boards without network policy crawling or silent seed mutation.',
    },
    {
      name: 'projectProductivityCalibrationJob',
      displayName: 'Project productivity calibration job',
      isRunning: projectProductivityCalibrationStatus.isRunning,
      isScheduled: projectProductivityCalibrationStatus.isScheduled,
      schedule: '55 5 * * *',
      lastRun: projectProductivityCalibrationStatus.lastRun,
      nextRun: projectProductivityCalibrationStatus.nextRun,
      status: buildStatus(projectProductivityCalibrationStatus.isRunning, projectProductivityCalibrationStatus.isScheduled),
      description: 'Runs 30-day shadow productivity backtests and 90-day governed auto-calibration for published compensation overlays.',
    },
    {
      name: 'forecastResidualOverlayProductionJob',
      displayName: 'Forecast residual overlay production job',
      isRunning: forecastResidualOverlayProductionStatus.isRunning,
      isScheduled: forecastResidualOverlayProductionStatus.isScheduled,
      schedule: '5 6 * * *',
      lastRun: forecastResidualOverlayProductionStatus.lastRun,
      nextRun: forecastResidualOverlayProductionStatus.nextRun,
      status: buildStatus(forecastResidualOverlayProductionStatus.isRunning, forecastResidualOverlayProductionStatus.isScheduled),
      description: 'Produces governed residual overlay candidates from completed task forecast outcomes without rewriting task facts or base duration seeds.',
    },
    {
      name: 'templateDurationGovernanceJob',
      displayName: 'Template duration governance job',
      isRunning: templateDurationGovernanceStatus.isRunning,
      isScheduled: templateDurationGovernanceStatus.isScheduled,
      schedule: '10 6 * * *',
      lastRun: templateDurationGovernanceStatus.lastRun,
      nextRun: templateDurationGovernanceStatus.nextRun,
      status: buildStatus(
        templateDurationGovernanceStatus.isRunning,
        templateDurationGovernanceStatus.isScheduled,
      ),
      description:
        'Promotes included duration experience samples into company-scoped duration benchmarks consumed by E1 without rewriting template defaults, task facts, seeds or runtime publications.',
    },
    {
      name: 'standardWorkDurationSeedReplayJob',
      displayName: 'Standard work duration seed replay job',
      isRunning: standardWorkDurationSeedReplayStatus.isRunning,
      isScheduled: standardWorkDurationSeedReplayStatus.isScheduled,
      schedule: '15 6 * * *',
      lastRun: standardWorkDurationSeedReplayStatus.lastRun,
      nextRun: standardWorkDurationSeedReplayStatus.nextRun,
      status: buildStatus(
        standardWorkDurationSeedReplayStatus.isRunning,
        standardWorkDurationSeedReplayStatus.isScheduled,
      ),
      description:
        'Runs report-only P50 replay from duration experience samples for standard work duration seed governance; seed values are never written by this job.',
    },
    {
      name: 'durationContextPolicyLearningJob',
      displayName: 'Duration context policy learning job',
      isRunning: durationContextPolicyLearningStatus.isRunning,
      isScheduled: durationContextPolicyLearningStatus.isScheduled,
      schedule: '20 6 * * *',
      lastRun: durationContextPolicyLearningStatus.lastRun,
      nextRun: durationContextPolicyLearningStatus.nextRun,
      status: buildStatus(
        durationContextPolicyLearningStatus.isRunning,
        durationContextPolicyLearningStatus.isScheduled,
      ),
      description:
        'Runs the checkpointed duration-context learning sweep and governed runtime publication bridge for the current visible project scope.',
    },
    buildDurationLearningRuntimeEvidenceOutboxDrainStatusView(
      durationLearningRuntimeEvidenceOutboxDrainStatus,
    ),
    {
      name: 'taskWriteFinalizationOutboxDrainJob',
      displayName: 'Task write finalization outbox drain job',
      isRunning: taskWriteFinalizationOutboxDrainStatus.isRunning,
      isScheduled: taskWriteFinalizationOutboxDrainStatus.isScheduled,
      schedule: '*/5 * * * *',
      lastRun: taskWriteFinalizationOutboxDrainStatus.lastRun,
      nextRun: taskWriteFinalizationOutboxDrainStatus.nextRun,
      status: buildStatus(
        taskWriteFinalizationOutboxDrainStatus.isRunning,
        taskWriteFinalizationOutboxDrainStatus.isScheduled,
      ),
      description:
        'Retries durable canonical task-write finalization every five minutes. Cross-tenant manual HTTP execution is intentionally unavailable.',
    },
    {
      name: 'constructionDependencyReplayCalibrationJob',
      displayName: 'Construction dependency replay calibration job',
      isRunning: constructionDependencyReplayCalibrationStatus.isRunning,
      isScheduled: constructionDependencyReplayCalibrationStatus.isScheduled,
      schedule: '30 6 * * *',
      lastRun: constructionDependencyReplayCalibrationStatus.lastRun,
      nextRun: constructionDependencyReplayCalibrationStatus.nextRun,
      status: buildStatus(
        constructionDependencyReplayCalibrationStatus.isRunning,
        constructionDependencyReplayCalibrationStatus.isScheduled,
      ),
      description:
        'Runs report-only L3/L4 dependency replay calibration queues from real project task dependencies; seeds and task dependencies are never written by this job.',
    },
    {
      name: 'constructionOrganizationPlanNetworkRuntimeEvidenceJob',
      displayName: 'Construction organization plan-network runtime evidence job',
      isRunning: constructionOrganizationPlanNetworkRuntimeEvidenceStatus.isRunning,
      isScheduled: constructionOrganizationPlanNetworkRuntimeEvidenceStatus.isScheduled,
      schedule: '20 7 * * *',
      lastRun: constructionOrganizationPlanNetworkRuntimeEvidenceStatus.lastRun,
      nextRun: constructionOrganizationPlanNetworkRuntimeEvidenceStatus.nextRun,
      status: buildStatus(
        constructionOrganizationPlanNetworkRuntimeEvidenceStatus.isRunning,
        constructionOrganizationPlanNetworkRuntimeEvidenceStatus.isScheduled,
      ),
      description:
        'Records post-publication impact monitoring and rollback-path verification evidence for adopted construction organization plan networks without writing task dependencies, plan dates, seeds, baselines or critical-path facts.',
    },
    {
      name: 'planningReplayCalibrationJob',
      displayName: 'Planning replay calibration job',
      isRunning: planningReplayCalibrationStatus.isRunning,
      isScheduled: planningReplayCalibrationStatus.isScheduled,
      schedule: '45 6 * * *',
      lastRun: planningReplayCalibrationStatus.lastRun,
      nextRun: planningReplayCalibrationStatus.nextRun,
      status: buildStatus(
        planningReplayCalibrationStatus.isRunning,
        planningReplayCalibrationStatus.isScheduled,
      ),
      description:
        'Runs shared baseline/monthly replay calibration from confirmed or closed planning samples; it only writes replay evidence and candidate governance records.',
    },
    {
      name: 'durationLiveLearningProductionClaimAuditJob',
      displayName: 'Duration live learning production claim audit job',
      isRunning: durationLiveLearningProductionClaimAuditStatus.isRunning,
      isScheduled: durationLiveLearningProductionClaimAuditStatus.isScheduled,
      schedule: '45 6 * * *',
      lastRun: durationLiveLearningProductionClaimAuditStatus.lastRun,
      nextRun: durationLiveLearningProductionClaimAuditStatus.nextRun,
      status: buildStatus(
        durationLiveLearningProductionClaimAuditStatus.isRunning,
        durationLiveLearningProductionClaimAuditStatus.isScheduled,
      ),
      description:
        'Runs the canonical DB production claim audit for v1.4.22.5 duration live learning; it is audit-only and never publishes runtime artifacts or rewrites facts.',
    },
    {
      name: 'projectWeatherForecastJob',
      displayName: '项目实时天气同步任务',
      isRunning: projectWeatherForecastStatus.isRunning,
      isScheduled: projectWeatherForecastStatus.isScheduled,
      schedule: `*/${projectWeatherForecastStatus.intervalHours}h :20`,
      lastRun: projectWeatherForecastStatus.lastRun,
      nextRun: projectWeatherForecastStatus.nextRun,
      status: buildStatus(projectWeatherForecastStatus.isRunning, projectWeatherForecastStatus.isScheduled),
      description: '按固定间隔同步项目城市天气事实，供算法判断雨季、高温、低温、大风等实时影响。',
    },
    {
      name: 'criticalPathRefreshJob',
      displayName: 'Critical path refresh job',
      isRunning: criticalPathRefreshStatus.isRunning,
      isScheduled: criticalPathRefreshStatus.isScheduled,
      schedule: '25 0 * * *',
      lastRun: criticalPathRefreshStatus.lastRun,
      nextRun: criticalPathRefreshStatus.nextRun,
      status: buildStatus(criticalPathRefreshStatus.isRunning, criticalPathRefreshStatus.isScheduled),
      description: 'Refreshes active project E3 CPM snapshots so E4 project remaining forecasts and E5 acceleration advice consume fresh critical-path truth.',
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

async function runApiJob<T>(
  jobName: string,
  runner: (lease?: JobLeaseContext) => Promise<T>,
  options: { useLease?: boolean } = {},
) {
  const jobId = createJobId()
  const executeWithRetry = async (lease?: JobLeaseContext) => await runJobWithRetry(
    {
      jobName,
      triggeredBy: 'api',
      jobId,
    },
    async () => {
      lease?.assertActive()
      const value = await runner(lease)
      lease?.assertActive()
      return value
    },
  )

  if (options.useLease) {
    const lease = await runWithJobLease(
      {
        jobName,
        jobId,
      },
      executeWithRetry,
    )

    if (!lease.acquired) {
      return {
        jobId,
        attempts: 0,
        result: {
          skipped: true as const,
          reason: 'lease_not_acquired' as const,
        },
      }
    }

    return {
      jobId,
      attempts: lease.value.attempts,
      result: lease.value.value,
    }
  }

  const { attempts, value } = await executeWithRetry()

  return {
    jobId,
    attempts,
    result: value,
  }
}

type ConditionAlertJobResult = {
  warnings: number
  reminders: number
  conditionExpiredIssues: number
  acceptanceExpiredIssues: number
  autoEscalatedRisks: number
  autoEscalatedIssues: number
}

function emptyConditionAlertJobResult(): ConditionAlertJobResult {
  return {
    warnings: 0,
    reminders: 0,
    conditionExpiredIssues: 0,
    acceptanceExpiredIssues: 0,
    autoEscalatedRisks: 0,
    autoEscalatedIssues: 0,
  }
}

function addConditionAlertJobResult(left: ConditionAlertJobResult, right: ConditionAlertJobResult): ConditionAlertJobResult {
  return {
    warnings: left.warnings + right.warnings,
    reminders: left.reminders + right.reminders,
    conditionExpiredIssues: left.conditionExpiredIssues + right.conditionExpiredIssues,
    acceptanceExpiredIssues: left.acceptanceExpiredIssues + right.acceptanceExpiredIssues,
    autoEscalatedRisks: left.autoEscalatedRisks + right.autoEscalatedRisks,
    autoEscalatedIssues: left.autoEscalatedIssues + right.autoEscalatedIssues,
  }
}

async function runConditionAlertScope(
  warningService: WarningService,
  projectId?: string,
  lease?: JobLeaseContext,
): Promise<ConditionAlertJobResult> {
  lease?.assertActive()
  const warnings = await warningService.syncActiveWarnings(projectId, { systemJob: !projectId })
  lease?.assertActive()
  const reminders = await warningService.generateReminders(projectId)
  lease?.assertActive()
  const conditionExpiredIssues = await warningService.syncConditionExpiredIssues(projectId)
  lease?.assertActive()
  const acceptanceExpiredIssues = await warningService.syncAcceptanceExpiredIssues(projectId)
  lease?.assertActive()
  const autoEscalatedRisks = await warningService.autoEscalateWarnings(projectId)
  lease?.assertActive()
  const autoEscalatedIssues = await warningService.autoEscalateRisksToIssues(projectId)
  lease?.assertActive()

  return {
    warnings: warnings.length,
    reminders: reminders.length,
    conditionExpiredIssues: conditionExpiredIssues.length,
    acceptanceExpiredIssues: acceptanceExpiredIssues.length,
    autoEscalatedRisks: autoEscalatedRisks.length,
    autoEscalatedIssues: autoEscalatedIssues.length,
  }
}

async function executeConditionAlertJob(projectScope?: JobProjectScope) {
  return runApiJob('conditionAlertJob', async (lease) => {
    const warningService = new WarningService()
    if (!Array.isArray(projectScope)) {
      return await runConditionAlertScope(warningService, undefined, lease)
    }

    let total = emptyConditionAlertJobResult()
    for (const projectId of projectScope) {
      total = addConditionAlertJobResult(total, await runConditionAlertScope(warningService, projectId, lease))
    }
    return total
  }, { useLease: true })
}

async function executeProjectDailySnapshotJob(projectScope?: JobProjectScope) {
  return runApiJob('projectDailySnapshotJob', async () => recordProjectDailySnapshots(undefined, projectScope))
}

async function executePlanningGovernanceJob(projectScope?: JobProjectScope) {
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
      safeRun('healthScan', () => new PlanningHealthService().scanAllProjectHealth(projectScope)),
      safeRun('integrityScan', () => new PlanningIntegrityService().scanAllProjectIntegrity(projectScope)),
      safeRun('anomalyScan', () => new SystemAnomalyService().scanAllProjectPassiveReorder(projectScope)),
      safeRun('governanceNotifications', () => planningGovernanceService.persistProjectGovernanceNotifications(undefined, projectScope)),
      safeRun('baselineValidity', () => scanAllProjectBaselineValidity(projectScope)),
    ])

    return {
      healthReports: healthReports.length,
      integrityReports: integrityReports.length,
      anomalyReports: anomalyReports.length,
      notifications: notifications.length,
      baselineValidityReports: baselineValidityReports.length,
      // eslint-disable-next-line -- route-level-aggregation-approved
      baselinesQueuedForRealign: baselineValidityReports.filter((item) => item.action === 'queued_realign').length,
    }
  })
}

async function executeDataQualityJob(projectScope?: JobProjectScope) {
  return runApiJob('dataQualityJob', async () => {
    const reports = await dataQualityService.syncAllProjectsDataQuality(undefined, projectScope)
    return {
      projects: reports.length,
      // eslint-disable-next-line -- route-level-aggregation-approved
      lowConfidenceProjects: reports.filter((report) => report.confidence.flag === 'low').length,
      // eslint-disable-next-line -- route-level-aggregation-approved
      activeFindings: reports.reduce((sum, report) => sum + report.confidence.activeFindingCount, 0),
      // eslint-disable-next-line -- route-level-aggregation-approved
      trendWarnings: reports.reduce((sum, report) => sum + report.confidence.trendWarningCount, 0),
    }
  })
}

async function executeOperationalNotificationJob(projectScope?: JobProjectScope) {
  return runApiJob('operationalNotificationJob', async () => {
    const notifications = await new OperationalNotificationService().syncAllProjectNotifications(projectScope)
    return {
      notificationsWritten: notifications.length,
      // eslint-disable-next-line -- route-level-aggregation-approved
      dateInversionNotifications: notifications.filter((item) => item.type === 'date_inversion').length,
      // eslint-disable-next-line -- route-level-aggregation-approved
      statusProgressNotifications: notifications.filter((item) => item.type === 'status_progress_mismatch').length,
    }
  })
}

async function executeNotificationLifecycleJob(projectScope?: JobProjectScope) {
  return runApiJob('notificationLifecycleJob', async () => new NotificationLifecycleService().runRetentionPolicy(projectScope))
}

async function executeMaterialArrivalReminderJob(projectScope?: JobProjectScope) {
  return runApiJob('materialArrivalReminderJob', async () => materialArrivalReminderService.run(null, new Date(), projectScope))
}

async function executeWeeklyDigestJob(projectScope?: JobProjectScope) {
  return runApiJob('weeklyDigestJob', async () => {
    await weeklyDigestService.generateForAllProjects(projectScope)
    return {
      generated: true,
    }
  })
}

async function executeJob(jobName: string, projectScope?: JobProjectScope, companyId?: string | null) {
  switch (jobName) {
    case 'riskStatisticsJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await riskStatisticsJob.executeNow(projectScope),
      }
    case 'conditionAlertJob':
      return executeConditionAlertJob(projectScope)
    case 'projectDailySnapshotJob':
      return executeProjectDailySnapshotJob(projectScope)
    case 'planningDraftLockTimeoutJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await planningDraftLockTimeoutJob.executeNow(projectScope),
      }
    case 'responsibilityAlertJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await responsibilityAlertJob.executeNow(projectScope),
      }
    case 'planningGovernanceJob':
      return executePlanningGovernanceJob(projectScope)
    case 'dataQualityJob':
      return executeDataQualityJob(projectScope)
    case 'operationalNotificationJob':
      return executeOperationalNotificationJob(projectScope)
    case 'notificationLifecycleJob':
      return executeNotificationLifecycleJob(projectScope)
    case 'dataRetentionJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await dataRetentionJob.executeNow(projectScope),
      }
    case 'officialHolidayCalendarJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await officialHolidayCalendarJob.executeNow(),
      }
    case 'projectClimateProfileJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await projectClimateProfileJob.executeNow(projectScope),
      }
    case 'projectWeatherForecastJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await projectWeatherForecastJob.executeNow(projectScope),
      }
    case 'criticalPathRefreshJob':
      return runApiJob('criticalPathRefreshJob', async () => criticalPathRefreshJob.executeNow(projectScope))
    case 'certificateTemplatePolicyAutoPublishJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await certificateTemplatePolicyAutoPublishJob.executeNow(),
      }
    case 'acceptanceTemplatePolicyAutoPublishJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await acceptanceTemplatePolicyAutoPublishJob.executeNow(),
      }
    case 'drawingPackageExperienceIterationJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await drawingPackageExperienceIterationJob.executeNow(),
      }
    case 'algorithmSeedCandidateDiscoveryJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await algorithmSeedCandidateDiscoveryJob.executeNow(projectScope),
      }
    case 'defaultMasterPlanVisibilityLearningJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await defaultMasterPlanVisibilityLearningJob.executeNow(),
      }
    case 'projectProductivityCalibrationJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await projectProductivityCalibrationJob.executeNow(projectScope),
      }
    case 'forecastResidualOverlayProductionJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await forecastResidualOverlayProductionJob.executeNow(projectScope),
      }
    case 'templateDurationGovernanceJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await templateDurationGovernanceJob.executeNow(companyId ?? null),
      }
    case 'standardWorkDurationSeedReplayJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await standardWorkDurationSeedReplayJob.executeNow(projectScope),
      }
    case 'durationContextPolicyLearningJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await durationContextPolicyLearningJob.executeNow(projectScope),
      }
    case 'constructionDependencyReplayCalibrationJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await constructionDependencyReplayCalibrationJob.executeNow(projectScope),
      }
    case 'constructionOrganizationPlanNetworkRuntimeEvidenceJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await constructionOrganizationPlanNetworkRuntimeEvidenceJob.executeNow(),
      }
    case 'planningReplayCalibrationJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await planningReplayCalibrationJob.executeNow(projectScope),
      }
    case 'durationLiveLearningProductionClaimAuditJob':
      return {
        jobId: createJobId(),
        attempts: 1,
        result: await durationLiveLearningProductionClaimAuditJob.executeNow(),
      }
    case 'weeklyDigestJob':
      return executeWeeklyDigestJob(projectScope)
    case 'materialArrivalReminderJob':
      return executeMaterialArrivalReminderJob(projectScope)
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

router.get('/', requireCurrentCompanyAdmin, asyncHandler(async (_req, res) => {
  sendStatus(res)
}))

router.get('/status', requireCurrentCompanyAdmin, asyncHandler(async (_req, res) => {
  sendStatus(res)
}))

router.post('/:jobName/execute', requireCurrentCompanyAdmin, validate(jobNameParamSchema, 'params'), asyncHandler(async (req, res) => {
  const { jobName } = req.params
  const projectScope = await resolveJobProjectScope(req)
  const execution = await executeJob(jobName, projectScope, getRequestCompanyId(req))

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
