import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  addConstructionProductionDays,
  productionDaysBetweenInclusive,
  type ConstructionCalendarContext,
} from '../../services/constructionCalendar.js'
import { calculateWbsParentPlanRollup } from '../../services/wbsPlanRollupService.js'
import { delayDayDelta, inclusiveDurationDays, signedDurationDayDelta } from '../../utils/durationDays.js'

const repoRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? resolve(process.cwd(), '..')
  : process.cwd()

const PRODUCTION_DAY_FIXTURE = {
  plannedStart: '2026-05-01',
  plannedEnd: '2026-05-07',
  ordinaryWeekendDates: ['2026-05-02', '2026-05-03'],
  officialShutdownDates: ['2026-05-04', '2026-05-05'],
  compensatoryWorkDates: ['2026-05-06'],
} as const

const PARENT_CHILD_TRUTH_FIXTURE = {
  parentId: 'standard-floor-structure-package',
  parentRole: 'rhythm_package_window',
  parentPlanWindow: { start: '2026-05-01', end: '2026-05-07' },
  childReferenceDurations: [
    { taskId: 'rebar', referenceDays: 3, plannedStart: '2026-05-01', plannedEnd: '2026-05-03' },
    { taskId: 'formwork', referenceDays: 3, plannedStart: '2026-05-02', plannedEnd: '2026-05-04' },
    { taskId: 'concrete', referenceDays: 4, plannedStart: '2026-05-04', plannedEnd: '2026-05-07' },
  ],
} as const

function enumerateDateRange(start: string, end: string) {
  const cursor = new Date(`${start}T00:00:00.000Z`)
  const stop = new Date(`${end}T00:00:00.000Z`)
  const dates: string[] = []

  while (cursor <= stop) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return dates
}

function countTargetProductionDays() {
  const shutdown = new Set<string>(PRODUCTION_DAY_FIXTURE.officialShutdownDates)
  const compensatory = new Set<string>(PRODUCTION_DAY_FIXTURE.compensatoryWorkDates)
  return enumerateDateRange(PRODUCTION_DAY_FIXTURE.plannedStart, PRODUCTION_DAY_FIXTURE.plannedEnd)
    .filter((date) => compensatory.has(date) || !shutdown.has(date))
    .length
}

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function readSource(relativeToRepo: string) {
  return readFileSync(resolve(repoRoot, relativeToRepo), 'utf8')
}

function listFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const fullPath = resolve(root, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) return listFiles(fullPath)
    return fullPath
  })
}

describe('duration consistency contract scaffold', () => {
  it('keeps inclusive calendar span distinct from construction production-day target semantics', () => {
    expect(inclusiveDurationDays(PRODUCTION_DAY_FIXTURE.plannedStart, PRODUCTION_DAY_FIXTURE.plannedEnd)).toBe(7)
    expect(countTargetProductionDays()).toBe(5)
    expect(PRODUCTION_DAY_FIXTURE.ordinaryWeekendDates.every((date) => enumerateDateRange(
      PRODUCTION_DAY_FIXTURE.plannedStart,
      PRODUCTION_DAY_FIXTURE.plannedEnd,
    ).includes(date))).toBe(true)
  })

  it('models parent package truth as a child-network plan window rather than child reference-duration sum', () => {
    const parentWindowDays = inclusiveDurationDays(
      PARENT_CHILD_TRUTH_FIXTURE.parentPlanWindow.start,
      PARENT_CHILD_TRUTH_FIXTURE.parentPlanWindow.end,
    )
    const childReferenceTotal = PARENT_CHILD_TRUTH_FIXTURE.childReferenceDurations.reduce(
      (sum, child) => sum + child.referenceDays,
      0,
    )

    expect(parentWindowDays).toBe(7)
    expect(childReferenceTotal).toBe(10)
    expect(parentWindowDays).not.toBe(childReferenceTotal)
  })

  it('asserts backend plan-span and CPM outlets consume the shared inclusive duration helper', () => {
    const durationBearingFiles = [
      'server/src/services/projectCriticalPathService.ts',
      'server/src/services/projectExecutionSummaryService.ts',
      'server/src/services/taskSummaryService.ts',
      'server/src/routes/task-baselines.ts',
    ]

    for (const file of durationBearingFiles) {
      expect(readSource(file), file).toContain('inclusiveDurationDays')
    }
  })

  it('keeps backend analysis services from defining private inclusive calendar-day span formulas', () => {
    const analysisServices = [
      'server/src/services/acceptanceFlowService.ts',
      'server/src/services/baselineGenerationService.ts',
      'server/src/services/constructionDependencyReplayCalibrationService.ts',
      'server/src/services/dataQualityService.ts',
      'server/src/services/durationContextColdStartLearningPlanService.ts',
      'server/src/services/durationExperienceService.ts',
      'server/src/services/durationContextService.ts',
      'server/src/services/highFidelitySyntheticStressService.ts',
      'server/src/services/materialReportsService.ts',
      'server/src/services/materialArrivalReminderService.ts',
      'server/src/services/monthlyPlanGenerationService.ts',
      'server/src/services/notificationLifecycleService.ts',
      'server/src/services/officialHolidayCalendarService.ts',
      'server/src/services/planningGovernanceService.ts',
      'server/src/services/planningIntegrityService.ts',
      'server/src/services/planningRevisionPoolService.ts',
      'server/src/services/progressAnomalyService.ts',
      'server/src/services/progressVelocityLearningService.ts',
      'server/src/services/projectExecutionSummaryService.ts',
      'server/src/services/projectProductivityCalibrationService.ts',
      'server/src/services/projectProductivityCompensationService.ts',
      'server/src/services/projectRemainingDurationForecastService.ts',
      'server/src/services/responsibilityInsightService.ts',
      'server/src/services/scheduleAccelerationService.ts',
      'server/src/services/systemAnomalyService.ts',
      'server/src/services/taskDurationForecastService.ts',
      'server/src/services/taskLagStatusService.ts',
      'server/src/services/taskStatusDerivationService.ts',
      'server/src/services/weeklyDigestService.ts',
      'server/src/utils/taskPerformance.ts',
      'server/src/services/wbsTemplateGenerationService.ts',
      'server/src/services/wbsTemplateFeedback.ts',
      'server/src/services/wbsPlanRollupService.ts',
      'server/src/services/dueDateService.ts',
      'server/src/routes/task-baselines.ts',
    ]
    const privateInclusiveFormula = /Math\.(?:round|floor|ceil)\(\s*\([^)]*?(?:end|getTime\(\)|endTime)[^)]*?-[^)]*?(?:start|getTime\(\)|startTime)[^)]*?\)\s*\/\s*(?:86_?400_?000|DAY_MS|24\s*\*\s*60\s*\*\s*60\s*\*\s*1000)\s*\)\s*\+\s*1/
    const privateDayMathFormula = /Math\.(?:round|floor|ceil)\(\s*\([^)]*?(?:getTime\(\)|Date\.now\(\)|todayUtc|endAt|startAt|toDate|fromDate|timestamp|planned)[^)]*?-[^)]*?(?:getTime\(\)|Date\.now\(\)|todayUtc|endAt|startAt|toDate|fromDate|timestamp|planned)[^)]*?\)\s*\/\s*(?:86_?400_?000|DAY_MS|24\s*\*\s*60\s*\*\s*60\s*\*\s*1000)\s*\)/
    const privateInclusiveFunction = /function\s+(?:daysBetweenInclusive|inclusiveDays|daysInclusive|calendarDaysInclusive|readInclusiveDurationDays|computeDurationDays|diffBaselineDateDays|diffPlanDays)\s*\(/
    const privateGenericDayFunction = /function\s+daysBetween\s*\(/

    for (const file of analysisServices) {
      const source = readSource(file)
      expect(source, file).toMatch(/inclusiveDurationDays|orderedInclusiveDurationDays|signedDurationDayDelta|delayDayDelta|productionDaysBetweenInclusive/)
      expect(source, file).not.toMatch(privateInclusiveFormula)
      expect(source, file).not.toMatch(privateDayMathFormula)
      expect(source, file).not.toMatch(privateInclusiveFunction)
      expect(source, file).not.toMatch(privateGenericDayFunction)
    }
  })

  it('keeps migrated G6 business-day helper copies from regressing to private millisecond math', () => {
    const migratedBusinessDayServices = [
      'server/src/services/dueDateService.ts',
      'server/src/services/materialArrivalReminderService.ts',
      'server/src/services/notificationLifecycleService.ts',
      'server/src/services/planningGovernanceService.ts',
      'server/src/services/planningIntegrityService.ts',
      'server/src/services/progressVelocityLearningService.ts',
      'server/src/services/responsibilityInsightService.ts',
      'server/src/services/systemAnomalyService.ts',
      'server/src/services/weeklyDigestService.ts',
      'server/src/services/constructionDependencyReplayCalibrationService.ts',
      'server/src/services/dataQualityService.ts',
      'server/src/utils/taskPerformance.ts',
    ]
    const privateDayMsConstant = /const\s+(?:DAY_MS|DAY_IN_MS)\s*=\s*(?:86_?400_?000|24\s*\*\s*60\s*\*\s*60\s*\*\s*1000)/
    const privateDayMathFormula = /Math\.(?:round|floor|ceil)\(\s*\([^)]*?(?:getTime\(\)|Date\.now\(\)|todayUtc|endAt|startAt|toDate|fromDate|timestamp|planned)[^)]*?-[^)]*?(?:getTime\(\)|Date\.now\(\)|todayUtc|endAt|startAt|toDate|fromDate|timestamp|planned)[^)]*?\)\s*\/\s*(?:86_?400_?000|DAY_MS|DAY_IN_MS|24\s*\*\s*60\s*\*\s*60\s*\*\s*1000|1000\s*\*\s*60\s*\*\s*60\s*\*\s*24)\s*\)/

    for (const file of migratedBusinessDayServices) {
      const source = readSource(file)
      expect(source, file).toMatch(/signedDurationDayDelta|delayDayDelta|inclusiveDurationDays|orderedInclusiveDurationDays/)
      expect(source, file).not.toMatch(privateDayMsConstant)
      expect(source, file).not.toMatch(privateDayMathFormula)
      expect(source, file).not.toContain('86400000')
      expect(source, file).not.toContain('86_400_000')
      expect(source, file).not.toContain('1000 * 60 * 60 * 24')
      expect(source, file).not.toContain('24 * 60 * 60 * 1000')
    }
  })

  it('keeps server raw millisecond day math limited to documented non-duration infrastructure uses', () => {
    const allowedRawDateFiles = new Set([
      // Scheduler cadence, auth cookie TTL, and background job intervals.
      'server/src/scheduler.ts',
      'server/src/auth/config.ts',
      'server/src/auth/http.ts',
      'server/src/jobs/acceptanceTemplatePolicyAutoPublishJob.ts',
      'server/src/jobs/algorithmSeedCandidateDiscoveryJob.ts',
      'server/src/jobs/algorithmAssetLearnableParameterImpactMonitoringJob.ts',
      'server/src/jobs/certificateTemplatePolicyAutoPublishJob.ts',
      'server/src/jobs/constructionOrganizationPlanNetworkRuntimeEvidenceJob.ts',
      'server/src/jobs/constructionDependencyReplayCalibrationJob.ts',
      'server/src/jobs/criticalPathRefreshJob.ts',
      'server/src/jobs/deletionRetentionCleanupJob.ts',
      'server/src/jobs/drawingPackageExperienceIterationJob.ts',
      'server/src/jobs/durationContextPolicyLearningJob.ts',
      'server/src/jobs/durationLiveLearningProductionClaimAuditJob.ts',
      'server/src/jobs/forecastResidualOverlayProductionJob.ts',
      'server/src/jobs/officialHolidayCalendarJob.ts',
      'server/src/jobs/planningReplayCalibrationJob.ts',
      'server/src/jobs/policyTemplateReleaseImpactMonitoringJob.ts',
      'server/src/jobs/projectClimateProfileJob.ts',
      'server/src/jobs/projectProductivityCalibrationJob.ts',
      'server/src/jobs/responsibilityAlertJob.ts',
      'server/src/jobs/riskStatisticsJob.ts',
      'server/src/jobs/standardWorkDurationSeedReplayJob.ts',
      'server/src/jobs/templateDurationGovernanceJob.ts',
      'server/src/jobs/warningImpactSignalGovernanceJob.ts',
      // Shared date primitives and calendar/window indexing internals.
      'server/src/utils/durationDays.ts',
      'server/src/services/constructionCalendar.ts',
      'server/src/services/highFidelitySyntheticStressService.ts',
      'server/src/services/todoTouchpointService.ts',
      'server/src/services/weatherForecastImpactService.ts',
      // Retention, learning, lifecycle, climate, cache, and priority windows that are not displayed task durations.
      'server/src/services/deletionRetentionGovernanceService.ts',
      'server/src/services/durationExperienceReconciliationService.ts',
      'server/src/services/projectClimateProfileService.ts',
      'server/src/services/riskIssueWarningGovernanceService.ts',
      // Warning registry thresholds use millisecond lifecycles, not task delay or duration math.
      'server/src/services/riskIssueWarningRuleRegistry.ts',
      'server/src/services/taskDurationForecastService.ts',
      'server/src/services/upgradeChainService.ts',
      'server/src/services/warningService.ts',
      'server/src/domain/riskIssueWorkflowPolicy.ts',
    ])
    const rawDatePattern = /(?:86400000|86_400_000|24\s*\*\s*60\s*\*\s*60\s*\*\s*1000|1000\s*\*\s*60\s*\*\s*60\s*\*\s*24|DAY_MS|DAY_IN_MS|MS_PER_DAY)/
    const offenders = listFiles(resolve(repoRoot, 'server/src'))
      .filter((file) => /\.(?:ts)$/.test(file))
      .map((file) => file.replace(/\\/g, '/').slice(repoRoot.replace(/\\/g, '/').length + 1))
      .filter((file) => !file.includes('/__tests__/'))
      .filter((file) => rawDatePattern.test(readSource(file)))
      .filter((file) => !allowedRawDateFiles.has(file))

    expect(offenders).toEqual([])
  })

  it('keeps delay and deviation outlets on the shared signed delay helper', () => {
    expect(delayDayDelta('2026-05-03', '2026-05-06')).toBe(3)

    const delayBearingFiles = [
      'server/src/services/progressDeviationService.ts',
      'server/src/services/taskSummaryService.ts',
      'server/src/services/taskAttributionSummaryService.ts',
      'server/src/services/scheduleAccelerationService.ts',
      'server/src/services/projectExecutionSummaryService.ts',
      'server/src/services/projectHealthService.ts',
      'server/src/services/weeklyDigestService.ts',
      'server/src/services/warningService.ts',
      'server/src/routes/task-summaries.ts',
    ]

    for (const file of delayBearingFiles) {
      const source = readSource(file)
      expect(source, file).toContain('delayDayDelta')
      expect(source, file).not.toMatch(/Math\.(?:round|floor|ceil)\(\s*\([^)]*?(?:actual|completed|today|toTime|rightTime|Date)[^)]*?-[^)]*?(?:planned|fromTime|leftTime|Date)[^)]*?\)\s*\/\s*(?:86_?400_?000|DAY_MS)\s*\)/)
    }

    const summarySource = readSource('server/src/services/projectExecutionSummaryService.ts')
    expect(summarySource).toContain('buildMilestoneOverview(tasks, asOf, calendar)')
    expect(summarySource).toContain('delayDayDelta(rawBaselineTargetDate, task.actual_end_date, calendar)')
    expect(summarySource).not.toContain('actualDate.getTime() - plannedDate.getTime()')
  })

  it('keeps delay and deviation outlets calendar-aware after moving to the shared helper', () => {
    const calendarAwareDelayFiles = [
      'server/src/services/progressDeviationService.ts',
      'server/src/services/taskSummaryService.ts',
      'server/src/services/taskAttributionSummaryService.ts',
      'server/src/services/scheduleAccelerationService.ts',
      'server/src/services/projectExecutionSummaryService.ts',
      'server/src/services/projectHealthService.ts',
      'server/src/services/weeklyDigestService.ts',
      'server/src/services/warningService.ts',
      'server/src/routes/task-summaries.ts',
    ]

    for (const file of calendarAwareDelayFiles) {
      const source = readSource(file)
      expect(source, file).toMatch(/ConstructionCalendarContext|resolveConstructionCalendarContext/)
      expect(source, file).toMatch(/delayDayDelta\([^)]*,[^)]*,\s*(?:calendar|workCalendar|constructionCalendar|calendarByProjectId|getCalendarForProject|calendarContext)/)
    }
  })

  it('keeps dashboard due KPIs on construction production-day semantics', () => {
    const dashboardSource = readSource('server/src/routes/dashboard.ts')
    const taskStatusSource = readSource('server/src/services/taskStatusDerivationService.ts')

    expect(taskStatusSource).toContain('delayDayDelta')
    expect(taskStatusSource).toContain('calendar?: ConstructionCalendarContext')
    expect(taskStatusSource).toContain('delayDayDelta(planned, now, options.calendar)')
    expect(dashboardSource).toContain('resolveConstructionCalendarContext')
    expect(dashboardSource).toContain('toFocusTaskItem(task, new Date(), todayTodoTaskIds, workCalendar)')
    expect(dashboardSource).toContain('{ currentDate: now, calendar }')
  })

  it('keeps migrated contract and utility specs inside the server vitest collection', () => {
    const configSource = readSource('server/vitest.config.ts')
    const guardConfigSource = readSource('server/vitest.guard.config.mjs')
    const guardScriptSource = readSource('server/scripts/run-vitest-guard.mjs')
    const longRunningServerTests = [
      'src/__tests__/wbsTemplateManagedFrontierGeneration.test.ts',
      'src/__tests__/wbsTemplateGenerationService.test.ts',
      'src/__tests__/constructionDependencyFireL5Coverage.test.ts',
      'src/__tests__/constructionDependencyRuleSystemTrust.test.ts',
      'src/__tests__/highFidelitySyntheticStressService.test.ts',
      'src/__tests__/schedulerJobContracts.test.ts',
      'src/__tests__/wbs-template-governance.test.ts',
      'src/__tests__/wbsGovernanceCandidateAdapters.test.ts',
      'src/__tests__/wbsTemplateGoldenBenchmarkCli.test.ts',
      'src/__tests__/wbsTemplateProjectAE2E.test.ts',
      'src/__tests__/progressKnowledgePlannedScheduleFieldReview.test.ts',
    ]
    const migratedSpecFiles = [
      'server/src/__tests__/contracts/durationConsistency.contract.test.ts',
      'server/src/__tests__/taskLagStatusService.test.ts',
      'server/src/services/__tests__/taskLagStatusService.test.ts',
      'server/src/utils/__tests__/durationDays.test.ts',
      'server/src/utils/__tests__/taskPerformance.test.ts',
    ]

    expect(configSource).toContain('root:')
    expect(configSource).toContain('src/**/*.{test,spec}.ts')
    for (const source of [configSource, guardConfigSource, guardScriptSource]) {
      expect(source).toContain('projects:')
      expect(source).toContain('longRunningServerTests')
      for (const testFile of longRunningServerTests) {
        expect(source).toContain(`'${testFile}'`)
      }
      expect(source).toContain("pool: 'threads'")
      expect(source).toContain('fileParallelism: false')
      expect(source).toContain('maxWorkers: 1')
      expect(source).toContain('groupOrder')
    }
    expect(configSource).toContain('exclude: [...longRunningServerTests, ...releaseExcludedTests]')
    expect(configSource).toContain('include: releaseLongRunningServerTests')
    expect(configSource).toContain('isReleaseTestSuite ? projectSearchOwnedTests : []')
    for (const source of [guardConfigSource, guardScriptSource]) {
      expect(source).toContain('exclude: longRunningServerTests')
      expect(source).toContain('include: longRunningServerTests')
    }
    for (const file of migratedSpecFiles) {
      expect(existsSync(resolve(process.cwd().replace(/\\/g, '/').endsWith('/server') ? process.cwd() : resolve(process.cwd(), 'server'), file.replace(/^server\//, ''))), file).toBe(true)
    }
  })

  it('keeps date-shift and target-gap calculations on the shared signed day delta helper', () => {
    expect(signedDurationDayDelta('2026-05-03', '2026-05-06')).toBe(3)

    const signedDateDeltaFiles = [
      'server/src/services/projectRemainingDurationForecastService.ts',
      'server/src/services/planningRevisionPoolService.ts',
      'server/src/services/baselineGenerationService.ts',
      'server/src/routes/task-baselines.ts',
      'server/src/services/wbsTemplateGenerationService.ts',
      'server/src/services/durationContextService.ts',
    ]

    for (const file of signedDateDeltaFiles) {
      const source = readSource(file)
      expect(source, file).toContain('signedDurationDayDelta')
      expect(source, file).not.toMatch(/Math\.(?:round|floor|ceil)\(\s*\([^)]*?(?:afterTime|beforeTime|toTime|fromTime|leftTime|rightTime|getTime\(\)|expected)[^)]*?-[^)]*?(?:afterTime|beforeTime|toTime|fromTime|leftTime|rightTime|getTime\(\)|plannedStart)[^)]*?\)\s*\/\s*(?:86_?400_?000|DAY_MS|24\s*\*\s*60\s*\*\s*60\s*\*\s*1000)\s*\)/)
    }
  })

  it('persists project generation facts once at project level while keeping task snapshots frozen by purpose', () => {
    const wizardSource = readSource('server/src/routes/projectWizard.ts')
    const projectsRouteSource = readSource('server/src/routes/projects.ts')
    const engineeringObjectsRouteSource = readSource('server/src/routes/engineering-objects.ts')
    const templateGenerationSource = readSource('server/src/services/wbsTemplateGenerationService.ts')
    const hydrationSource = readSource('server/src/services/durationAlgorithmInputHydrationService.ts')
    const forecastSource = readSource('server/src/services/taskDurationForecastService.ts')
    const baselineSource = readSource('server/src/services/baselineGenerationService.ts')
    const monthlySource = readSource('server/src/services/monthlyPlanGenerationService.ts')

    expect(wizardSource).toContain('projectGenerationFacts: buildProjectGenerationFactsSnapshot(buildProjectGenerationFacts(payload))')
    expect(projectsRouteSource).toContain('refreshLiveProjectGenerationFactsFromProjectState')
    expect(engineeringObjectsRouteSource).toContain('refreshLiveProjectGenerationFactsFromProjectState')
    expect(templateGenerationSource).toContain('persistProjectGenerationFactsSnapshot')
    expect(templateGenerationSource).toContain('buildProjectGenerationFactsSnapshot(projectFacts)')
    expect(hydrationSource).toContain('allowLiveProjectReread')
    expect(forecastSource).toContain('readLiveProjectGenerationFacts')
    expect(forecastSource).toContain("suggestionPurpose: 'execution_reference'")
    expect(baselineSource).toContain('readProjectGenerationFactsSnapshot(metadata, standardTaskMetadata)')
    expect(monthlySource).toContain('readProjectGenerationFactsSnapshot(metadata, wbsSnapshot, taskFactSnapshot)')
  })

  it('keeps project remaining critical-set and productivity facts on their live published inputs', () => {
    const remainingSource = readSource('server/src/services/projectRemainingDurationForecastService.ts')
    const runtimeSource = readSource('server/src/services/scheduleAccelerationRuntimeService.ts')
    const productivitySource = readSource('server/src/services/projectProductivityCompensationService.ts')

    expect(remainingSource).not.toContain('row.values.baseline_is_critical === true')
    expect(runtimeSource).not.toContain('row.baseline_is_critical === true')
    expect(productivitySource).toContain('loadPublishedProjectProductivityCalibration')
    expect(productivitySource).toContain("governanceMode === 'learning_shadow_replay'")
    expect(productivitySource).not.toContain('buildProjectProgressVelocityLearning')
    expect(productivitySource).not.toMatch(/\.from\(['"]duration_experience_samples['"]\)/)
    expect(productivitySource).not.toContain('planned / actual')
  })

  it('keeps runtime criticality consumers off baseline criticality fields', () => {
    const runtimeCriticalityConsumers = [
      'server/src/services/taskDurationForecastService.ts',
      'server/src/services/runtimeExecutionInferenceService.ts',
      'server/src/services/progressDeviationService.ts',
      'server/src/services/materialArrivalReminderService.ts',
      'server/src/services/projectExecutionSummaryService.ts',
      'server/src/services/milestoneIntegrityService.ts',
    ]

    for (const file of runtimeCriticalityConsumers) {
      const source = readSource(file)
      expect(source, file).toMatch(/resolveLiveTaskCriticalityProjection|isLiveCriticalOrNearCriticalTask/)
      expect(source, file).not.toMatch(/baseline_is_critical\s*(?:\|\||\?\s*['"]baseline_critical_path['"])/)
      expect(source, file).not.toMatch(/(?:is_critical|isCritical)\s*(?:\|\||\?\?)\s*[^;\n]*baseline_is_critical/)
    }
  })

  it('keeps acceleration target feasibility verdict wired to the conservative confidence band', () => {
    const source = readSource('server/src/services/scheduleAccelerationService.ts')
    const adjustmentIndex = source.indexOf('const verdictUnrecoverableDays = confidenceAdjustedUnrecoverableDays({')
    const verdictIndex = source.indexOf('const verdict = resolveTargetFeasibilityVerdict({', adjustmentIndex)
    const verdictBlock = source.slice(verdictIndex, verdictIndex + 260)

    expect(adjustmentIndex).toBeGreaterThan(-1)
    expect(verdictIndex).toBeGreaterThan(adjustmentIndex)
    expect(verdictBlock).toContain('unrecoverableDays: verdictUnrecoverableDays')
    expect(verdictBlock).not.toContain('unrecoverableDays,\n  })')
  })

  it('guards lag fallback and WBS feedback learning samples against private duration formulas', () => {
    const lagSource = readSource('server/src/services/taskLagStatusService.ts')
    const feedbackSource = readSource('server/src/services/wbsTemplateFeedback.ts')

    expect(lagSource).toContain('normalizeDurationDateUtc')
    expect(lagSource).toContain('inclusiveDurationDays')
    expect(feedbackSource).toContain('productionDaysBetweenInclusive')
    expect(feedbackSource).not.toContain('86400000')
    expect(feedbackSource).not.toContain('Math.ceil((new Date')
  })

  it('guards task performance delay status against calendar-free and legacy-cache-first regressions', () => {
    const source = readSource('server/src/utils/taskPerformance.ts')
    const attributionSource = readSource('server/src/services/taskAttributionSummaryService.ts')
    const responsibilitySource = readSource('server/src/services/responsibilityInsightService.ts')

    expect(source).toContain('calendar?: ConstructionCalendarContext | null')
    expect(source).toContain('delayDayDelta(planned, actual, calendar)')
    expect(source).toContain('delayDayDelta(planned, today, calendar)')
    expect(source.indexOf('const computedDelay = delayDayDelta')).toBeLessThan(source.indexOf('return isExplicitlyDelayed(task)'))
    expect(attributionSource).toContain('isCompletedTaskDelayedAgainstPlan(task, calendar)')
    expect(attributionSource.indexOf('const computedDelay = delayDayDelta')).toBeLessThan(attributionSource.indexOf('return Math.max(Number(task.delay_total_days ?? 0), 0)'))
    expect(responsibilitySource).toContain('resolveConstructionCalendarContext')
    expect(responsibilitySource).toContain('buildTaskDetail(task, resolvedCriticalTaskIds, unitNameMap, calendar)')
  })

  it('asserts construction production days deduct official shutdown windows but not ordinary weekends', () => {
    const calendar: ConstructionCalendarContext = {
      basis: 'official_construction_calendar_seed',
      windows: [{
        holidayCode: 'project_shutdown_2026',
        holidayName: 'Project shutdown',
        startDate: '2026-05-04',
        endDate: '2026-05-05',
        counts_as_construction_shutdown: true,
      }],
    }

    expect(productionDaysBetweenInclusive(date('2026-05-01'), date('2026-05-03'), calendar)).toBe(3)
    expect(productionDaysBetweenInclusive(date('2026-05-01'), date('2026-05-07'), calendar)).toBe(5)
    expect(addConstructionProductionDays(date('2026-05-01'), 5, calendar)).toBe('2026-05-07')
  })

  it('asserts standard floor packages, specialty packages, and ordinary summary parents do not expose two duration truths', () => {
    const standardFloor = calculateWbsParentPlanRollup('item_work', [
      { plannedStartDate: '2026-05-01', plannedEndDate: '2026-05-03', referenceDuration: 3, durationContributionMode: 'duration_bearing', wbsNodeType: 'process' },
      { plannedStartDate: '2026-05-02', plannedEndDate: '2026-05-04', referenceDuration: 3, durationContributionMode: 'duration_bearing', wbsNodeType: 'process' },
      { plannedStartDate: '2026-05-04', plannedEndDate: '2026-05-07', referenceDuration: 4, durationContributionMode: 'duration_bearing', wbsNodeType: 'process' },
    ])
    const specialtyPackage = calculateWbsParentPlanRollup('item_work', [
      { plannedStartDate: '2026-06-01', plannedEndDate: '2026-06-01', referenceDuration: 1, durationContributionMode: 'duration_bearing', wbsNodeType: 'process' },
      { plannedStartDate: '2026-06-02', plannedEndDate: '2026-06-04', referenceDuration: 3, durationContributionMode: 'duration_bearing', wbsNodeType: 'process' },
      { plannedStartDate: '2026-06-08', plannedEndDate: '2026-06-08', referenceDuration: 1, durationContributionMode: 'handover_marker', wbsNodeType: 'process' },
    ])
    const ordinarySummary = calculateWbsParentPlanRollup('item_work', [
      { plannedStartDate: '2026-07-01', plannedEndDate: '2026-07-04', referenceDuration: 4, durationContributionMode: 'duration_bearing', wbsNodeType: 'process' },
      { plannedStartDate: '2026-07-05', plannedEndDate: '2026-07-07', referenceDuration: 3, durationContributionMode: 'duration_bearing', wbsNodeType: 'process' },
    ])

    expect(standardFloor).toEqual(expect.objectContaining({
      plannedDurationDays: 7,
      referenceDurationDays: 7,
      childReferenceDurationTotal: 10,
      rollupSource: 'child_plan_window',
      referenceDurationPolicy: 'date_window',
    }))
    expect(specialtyPackage).toEqual(expect.objectContaining({
      plannedDurationDays: 8,
      referenceDurationDays: 4,
      childReferenceDurationTotal: 4,
      rollupSource: 'child_plan_window',
    }))
    expect(ordinarySummary).toEqual(expect.objectContaining({
      plannedDurationDays: 7,
      referenceDurationDays: 7,
      childReferenceDurationTotal: 7,
      rollupSource: 'child_plan_window',
    }))
  })
})
