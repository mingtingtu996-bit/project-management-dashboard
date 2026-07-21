import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

const jobs = [
  ['dataRetentionJob.ts', "schedule: { kind: 'monthly', dayOfMonth: 1, hour: 4, minute: 15 }", true],
  ['deletionRetentionCleanupJob.ts', "schedule: { kind: 'daily', hour: 3, minute: 45 }", true],
  ['acceptanceTemplatePolicyAutoPublishJob.ts', "schedule: { kind: 'daily', hour: 5, minute: 35 }", true],
  ['certificateTemplatePolicyAutoPublishJob.ts', "schedule: { kind: 'daily', hour: 5, minute: 25 }", true],
  ['drawingPackageExperienceIterationJob.ts', "schedule: { kind: 'daily', hour: 5, minute: 45 }", true],
  ['planningDraftLockTimeoutJob.ts', "schedule: { kind: 'minute_interval', intervalMinutes", true],
  ['warningImpactSignalGovernanceJob.ts', "schedule: { kind: 'daily', hour: 1, minute: 20 }", true],
  ['responsibilityAlertJob.ts', "schedule: { kind: 'daily', hour: 8, minute: 15 }", true],
  ['riskStatisticsJob.ts', "schedule: { kind: 'daily', hour: 2, minute: 0 }", true],
  ['wizardGenerationRecoveryJob.ts', "schedule: { kind: 'minute_interval', intervalMinutes", true],
  ['policyTemplateReleaseImpactMonitoringJob.ts', "schedule: { kind: 'daily', hour: 6, minute: 45 }", true],
  ['criticalPathRefreshJob.ts', "schedule: { kind: 'daily', hour: 0, minute: 25 }", true],
  ['officialHolidayCalendarJob.ts', "schedule: { kind: 'daily', hour: 4, minute: 45 }", true],
  ['projectClimateProfileJob.ts', "schedule: { kind: 'daily', hour: 5, minute: 10 }", true],
  ['algorithmSeedCandidateDiscoveryJob.ts', "schedule: { kind: 'daily', hour: 5, minute: 40 }", true],
  ['projectProductivityCalibrationJob.ts', "schedule: { kind: 'daily', hour: 5, minute: 55 }", true],
  ['forecastResidualOverlayProductionJob.ts', "schedule: { kind: 'daily', hour: 6, minute: 5 }", true],
  ['templateDurationGovernanceJob.ts', "schedule: { kind: 'daily', hour: 6, minute: 10 }", true],
  ['standardWorkDurationSeedReplayJob.ts', "schedule: { kind: 'daily', hour: 6, minute: 15 }", true],
  ['durationContextPolicyLearningJob.ts', "schedule: { kind: 'daily', hour: 6, minute: 20 }", true],
  ['constructionDependencyReplayCalibrationJob.ts', "schedule: { kind: 'daily', hour: 6, minute: 30 }", true],
  ['defaultMasterPlanVisibilityLearningJob.ts', "schedule: { kind: 'daily', hour: 6, minute: 35 }", true],
  ['planningReplayCalibrationJob.ts', "schedule: { kind: 'daily', hour: 6, minute: 45 }", false],
  ['durationLiveLearningProductionClaimAuditJob.ts', "schedule: { kind: 'daily', hour: 6, minute: 45 }", true],
  ['durationLearningRuntimeEvidenceOutboxDrainJob.ts', "schedule: { kind: 'minute_interval', intervalMinutes", 'always'],
  ['algorithmAssetLearnableParameterImpactMonitoringJob.ts', "schedule: { kind: 'daily', hour: 7, minute: 5 }", true],
  ['constructionOrganizationPlanNetworkRuntimeEvidenceJob.ts', "schedule: { kind: 'daily', hour: 7, minute: 20 }", false],
  ['projectWeatherForecastJob.ts', "schedule: { kind: 'hourly_interval', intervalHours", true],
] as const

describe('independent persistent job schedule contract', () => {
  for (const [fileName, scheduleContract, requiresSchedulerRethrow] of jobs) {
    it(`${fileName} uses persistent slots and no drifting interval`, () => {
      const source = readFileSync(resolve(serverRoot, 'src/jobs', fileName), 'utf8')
      expect(source).toContain('PersistentWallClockJobTimer')
      expect(source).toContain(scheduleContract)
      expect(source).not.toContain('setInterval')
      expect(source).not.toContain('setTimeout')
      if (requiresSchedulerRethrow) {
        if (requiresSchedulerRethrow === 'always') {
          expect(source).toMatch(/catch \(error\) \{[\s\S]*?throw error/)
        } else {
          expect(source).toContain("if (triggeredBy === 'scheduler') throw error")
        }
      }
    })
  }
})
