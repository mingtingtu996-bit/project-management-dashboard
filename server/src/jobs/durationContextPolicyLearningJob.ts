import { logger } from '../middleware/logger.js'
import { listActiveProjectIds } from '../services/activeProjectService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'

const DAY_IN_MS = 24 * 60 * 60 * 1000

type DurationContextPolicyLearningModules = {
  backfillDurationContextPolicyRewards: (input: { projectIds: string[]; asOfDate: string }) => Promise<unknown>
  runDurationContextPolicyOfflineReplay: (input: {
    projectIds: string[]
    windowEndDate: string
    persistDecisions: false
  }) => Promise<unknown>
  learnDurationContextPolicyParameters: (input: { projectIds: string[]; persist: false }) => Promise<unknown>
  runDurationContextLearnedPolicyReplay: (input: { projectIds: string[] }) => Promise<unknown>
  generateDurationContextPolicyCanaryCandidates: (input: { projectIds: string[]; persist: false }) => Promise<unknown>
  runDurationContextApprovedCanaryShadowReplay: (input: { projectIds: string[]; asOfDate: string }) => Promise<unknown>
  evaluateDurationContextCanaryActivationReadiness: (input: { projectIds: string[]; asOfDate: string }) => Promise<unknown>
  buildDurationContextCanaryTrialReleasePlan: (input: { projectIds: string[]; asOfDate: string }) => Promise<unknown>
  buildDurationContextColdStartLearningPlan: (input: { projectIds: string[]; asOfDate: string }) => Promise<unknown>
}

type DurationContextPolicyLearningModuleLoadResult =
  | { status: 'available'; modules: DurationContextPolicyLearningModules }
  | { status: 'missing'; missingModule: string }

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function nextDailyRunAt(hour: number, minute: number) {
  const now = new Date()
  const nextRun = new Date(now)
  nextRun.setHours(hour, minute, 0, 0)
  if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1)
  return nextRun
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function optionalServicePath(moduleName: string) {
  return `../services/${moduleName}.js`
}

function isOptionalModuleMissing(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? '')
  const message = String((error as Error | null | undefined)?.message ?? '')
  return code === 'ERR_MODULE_NOT_FOUND'
    || code === 'MODULE_NOT_FOUND'
    || message.includes('Cannot find module')
}

async function loadDurationContextPolicyLearningModules(): Promise<DurationContextPolicyLearningModuleLoadResult> {
  try {
    const learningLogModule = await import(optionalServicePath('durationContextPolicyLearningLogService'))
    const parameterLearningModule = await import(optionalServicePath('durationContextPolicyParameterLearningService'))
    const learnedPolicyReplayModule = await import(optionalServicePath('durationContextLearnedPolicyReplayService'))
    const canaryGateModule = await import(optionalServicePath('durationContextPolicyCanaryGateService'))
    const shadowReplayModule = await import(optionalServicePath('durationContextPolicyShadowReplayService'))
    const activationGateModule = await import(optionalServicePath('durationContextPolicyActivationGateService'))
    const trialReleasePlanModule = await import(optionalServicePath('durationContextPolicyTrialReleasePlanService'))
    const coldStartLearningPlanModule = await import(optionalServicePath('durationContextColdStartLearningPlanService'))

    return {
      status: 'available',
      modules: {
        backfillDurationContextPolicyRewards: learningLogModule.backfillDurationContextPolicyRewards,
        runDurationContextPolicyOfflineReplay: learningLogModule.runDurationContextPolicyOfflineReplay,
        learnDurationContextPolicyParameters: parameterLearningModule.learnDurationContextPolicyParameters,
        runDurationContextLearnedPolicyReplay: learnedPolicyReplayModule.runDurationContextLearnedPolicyReplay,
        generateDurationContextPolicyCanaryCandidates: canaryGateModule.generateDurationContextPolicyCanaryCandidates,
        runDurationContextApprovedCanaryShadowReplay: shadowReplayModule.runDurationContextApprovedCanaryShadowReplay,
        evaluateDurationContextCanaryActivationReadiness: activationGateModule.evaluateDurationContextCanaryActivationReadiness,
        buildDurationContextCanaryTrialReleasePlan: trialReleasePlanModule.buildDurationContextCanaryTrialReleasePlan,
        buildDurationContextColdStartLearningPlan: coldStartLearningPlanModule.buildDurationContextColdStartLearningPlan,
      },
    }
  } catch (error) {
    if (!isOptionalModuleMissing(error)) {
      throw error
    }
    return {
      status: 'missing',
      missingModule: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function runDurationContextPolicyLearningSweep(params: {
  projectIds?: string[] | null
  asOfDate?: string | null
} = {}, options: {
  loadModules?: () => Promise<DurationContextPolicyLearningModuleLoadResult>
} = {}) {
  const projectIds = await listActiveProjectIds(params.projectIds)
  const asOfDate = params.asOfDate || todayIsoDate()
  const loaded = await (options.loadModules ?? loadDurationContextPolicyLearningModules)()

  if (loaded.status === 'missing') {
    return {
      jobCode: 'duration_context_policy_learning_sweep',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimeMutationPolicy: 'none_candidate_report_only',
      scannedProjects: projectIds.length,
      learningModulesAvailable: false,
      missingLearningModule: loaded.missingModule,
      sweepResult: 'dependency_missing_report_only',
      rewardBackfill: null,
      offlineReplay: null,
      parameterLearning: null,
      learnedPolicyReplay: null,
      canaryGate: null,
      approvedCanaryShadowReplay: null,
      canaryActivationReadiness: null,
      canaryTrialReleasePlan: null,
      coldStartLearningPlan: null,
      canaryApprovalPolicy: 'manual_backend_admin_endpoint_only',
      policyVersionRegistryPolicy: 'not_mutated_by_learning_sweep',
    }
  }

  const {
    backfillDurationContextPolicyRewards,
    runDurationContextPolicyOfflineReplay,
    learnDurationContextPolicyParameters,
    runDurationContextLearnedPolicyReplay,
    generateDurationContextPolicyCanaryCandidates,
    runDurationContextApprovedCanaryShadowReplay,
    evaluateDurationContextCanaryActivationReadiness,
    buildDurationContextCanaryTrialReleasePlan,
    buildDurationContextColdStartLearningPlan,
  } = loaded.modules

  const rewardBackfill = await backfillDurationContextPolicyRewards({
    projectIds,
    asOfDate,
  })
  const offlineReplay = await runDurationContextPolicyOfflineReplay({
    projectIds,
    windowEndDate: asOfDate,
    persistDecisions: false,
  })
  const parameterLearning = await learnDurationContextPolicyParameters({
    projectIds,
    persist: false,
  })
  const learnedPolicyReplay = await runDurationContextLearnedPolicyReplay({
    projectIds,
  })
  const canaryGate = await generateDurationContextPolicyCanaryCandidates({
    projectIds,
    persist: false,
  })
  const approvedCanaryShadowReplay = await runDurationContextApprovedCanaryShadowReplay({
    projectIds,
    asOfDate,
  })
  const canaryActivationReadiness = await evaluateDurationContextCanaryActivationReadiness({
    projectIds,
    asOfDate,
  })
  const canaryTrialReleasePlan = await buildDurationContextCanaryTrialReleasePlan({
    projectIds,
    asOfDate,
  })
  const coldStartLearningPlan = await buildDurationContextColdStartLearningPlan({
    projectIds,
    asOfDate,
  })

  return {
    jobCode: 'duration_context_policy_learning_sweep',
    frontendExposurePolicy: 'backend_admin_api_only',
    runtimeMutationPolicy: 'none_candidate_report_only',
    scannedProjects: projectIds.length,
    learningModulesAvailable: true,
    rewardBackfill,
    offlineReplay,
    parameterLearning,
    learnedPolicyReplay,
    canaryGate,
    approvedCanaryShadowReplay,
    canaryActivationReadiness,
    canaryTrialReleasePlan,
    coldStartLearningPlan,
    canaryApprovalPolicy: 'manual_backend_admin_endpoint_only',
    policyVersionRegistryPolicy: 'not_mutated_by_learning_sweep',
  }
}

export class DurationContextPolicyLearningJob {
  private timer: NodeJS.Timeout | null = null
  private startTimer: NodeJS.Timeout | null = null
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null

  start() {
    if (this.timer || this.startTimer) {
      logger.warn('durationContextPolicyLearningJob is already running')
      return
    }

    const nextRun = nextDailyRunAt(6, 20)
    this.nextRun = nextRun
    const initialDelay = Math.max(nextRun.getTime() - Date.now(), 0)
    logger.info('durationContextPolicyLearningJob scheduled', {
      nextRun: nextRun.toISOString(),
      trigger: 'daily_06_20',
      initialDelay,
    })

    this.startTimer = setTimeout(() => {
      this.startTimer = null
      void this.execute('scheduler')
      this.timer = setInterval(() => {
        this.nextRun = new Date(Date.now() + DAY_IN_MS)
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
    }
    this.nextRun = null
    logger.info('durationContextPolicyLearningJob stopped')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.timer !== null || this.startTimer !== null,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
    }
  }

  async executeNow(projectIds?: string[] | null) {
    return this.execute('manual', projectIds)
  }

  private async execute(triggeredBy: 'scheduler' | 'manual', projectIds?: string[] | null) {
    if (this.isRunning) {
      logger.warn('durationContextPolicyLearningJob is already running, skip tick', { triggeredBy })
      return null
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'durationContextPolicyLearningJob',
          triggeredBy,
          jobId,
        },
        async () => runDurationContextPolicyLearningSweep({
          projectIds: Array.isArray(projectIds) ? projectIds : null,
        }),
      )

      logger.info('durationContextPolicyLearningJob completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
      })
      return value
    } catch (error) {
      logger.error('durationContextPolicyLearningJob failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    } finally {
      this.isRunning = false
    }
  }
}

export const durationContextPolicyLearningJob = new DurationContextPolicyLearningJob()
