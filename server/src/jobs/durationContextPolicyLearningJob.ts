import { logger } from '../middleware/logger.js'
import { listActiveProjectIds } from '../services/activeProjectService.js'
import { executeSQL } from '../services/dbService.js'
import {
  buildDurationContextPolicyLearningOperationIdentity,
  createDatabaseDurationContextPolicyLearningCheckpointStore,
  executeDurationContextPolicyLearningStage,
  hashDurationContextPolicyLearningValue,
  type DurationContextPolicyLearningCheckpointStore,
} from '../services/durationContextPolicyLearningCheckpointService.js'
import {
  extractDurationContextPolicyRuntimeParameterProposals,
  runDurationContextPolicyRuntimePublicationBridge,
  type DurationContextPolicyRuntimeMonitoringObservation,
  type DurationContextPolicyRuntimeParameterProposal,
} from '../services/durationContextPolicyRuntimePublicationBridgeService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import { reconcileDurationExperienceSamples } from '../services/durationExperienceReconciliationService.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'

type DurationContextPolicyLearningModules = {
  backfillDurationContextPolicyRewards: (input: { projectIds: string[]; asOfDate: string }) => Promise<unknown>
  runDurationContextPolicyOfflineReplay: (input: {
    projectIds: string[]
    windowEndDate: string
    persistDecisions: false
  }) => Promise<unknown>
  learnDurationContextPolicyParameters: (input: { projectIds: string[]; persist: true }) => Promise<unknown>
  runDurationContextLearnedPolicyReplay: (input: { projectIds: string[] }) => Promise<unknown>
  generateDurationContextPolicyCanaryCandidates: (input: {
    projectIds: string[]
    persist: true
    operationId?: string
    idempotencyStage?: string
  }) => Promise<unknown>
  autoPublishDurationContextPolicyCandidates: (input: {
    asOfDate: string
    candidates?: readonly unknown[] | null
    persist: true
    operationId?: string
    idempotencyStage?: string
  }) => Promise<unknown>
  runDurationContextApprovedCanaryShadowReplay: (input: { projectIds: string[]; asOfDate: string }) => Promise<unknown>
  evaluateDurationContextCanaryActivationReadiness: (input: { projectIds: string[]; asOfDate: string }) => Promise<unknown>
  buildDurationContextCanaryTrialReleasePlan: (input: { projectIds: string[]; asOfDate: string }) => Promise<unknown>
  buildDurationContextColdStartLearningPlan: (input: { projectIds: string[]; asOfDate: string }) => Promise<unknown>
}

type DurationContextPolicyLearningModuleLoadResult =
  | { status: 'available'; modules: DurationContextPolicyLearningModules }
  | { status: 'missing'; missingModule: string }

type DurationContextPolicyLearningSweepOptions = {
  loadModules?: () => Promise<DurationContextPolicyLearningModuleLoadResult>
  checkpointStore?: DurationContextPolicyLearningCheckpointStore
  checkpointOwnerId?: string
  inputFactDigestProvider?: (input: { projectIds: string[]; asOfDate: string }) => Promise<string>
  runtimePublicationBridge?: typeof runDurationContextPolicyRuntimePublicationBridge
  sampleReconciliation?: typeof reconcileDurationExperienceSamples
}

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function buildDurationContextPolicyLearningFailureAudit(params: {
  triggeredBy: 'scheduler' | 'manual'
  jobId: string
  error: unknown
}) {
  return {
    jobCode: 'duration_context_policy_learning_sweep',
    frontendExposurePolicy: 'backend_admin_api_only',
    runtimeMutationPolicy: 'none_failure_audit_only',
    scannedProjects: 0,
    learningModulesAvailable: null,
    sweepResult: 'job_failed_local_audit_recorded',
    failureAuditPolicy: 'jobRuntime_records_exhausted_retry_failures_in_job_failures_table',
    monitoringBoundary: 'local_failure_audit_only_not_production_monitoring_or_rollback',
    triggeredBy: params.triggeredBy,
    jobId: params.jobId,
    errorMessage: params.error instanceof Error ? params.error.message : String(params.error),
  }
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
    const autoPublishGateModule = await import(optionalServicePath('durationContextPolicyAutoPublishGateService'))
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
        autoPublishDurationContextPolicyCandidates: autoPublishGateModule.autoPublishDurationContextPolicyCandidates,
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

async function loadDurationContextPolicyLearningInputFactDigest(input: {
  projectIds: string[]
  asOfDate: string
}) {
  const rows = await executeSQL<Record<string, unknown>>(
    `select source_kind, source_id, scope_id, source_status, source_updated_at
       from (
         select 'decision'::text as source_kind,
                id::text as source_id,
                project_id::text as scope_id,
                concat_ws(':', decision_status, reward_status, runtime_policy) as source_status,
                updated_at::text as source_updated_at
           from public.duration_context_policy_decisions
          where model_family = 'contextual_bandit_v1'
            and project_id = any($1::uuid[])
         union all
         select 'parameter'::text as source_kind,
                id::text as source_id,
                project_id::text as scope_id,
                concat_ws(':', parameter_status, state_bucket, action_key) as source_status,
                updated_at::text as source_updated_at
           from public.duration_context_policy_parameters
          where model_family = 'contextual_bandit_v1'
            and project_id = any($1::uuid[])
         union all
         select 'parameter'::text as source_kind,
                id::text as source_id,
                null::text as scope_id,
                concat_ws(':', parameter_status, state_bucket, action_key) as source_status,
                updated_at::text as source_updated_at
           from public.duration_context_policy_parameters
          where model_family = 'contextual_bandit_v1'
            and project_id is null
         union all
         select 'runtime_observation'::text as source_kind,
                id::text as source_id,
                observation_context ->> 'projectId' as scope_id,
                concat_ws(':', publication_key, consumer_key, observation_status) as source_status,
                observed_at::text as source_updated_at
           from public.runtime_consumer_observations
          where asset_key = 'base_duration_benchmark'
            and nullif(observation_context ->> 'projectId', '')::uuid = any($1::uuid[])
         union all
         select 'accuracy_backtest'::text as source_kind,
                id::text as source_id,
                project_id::text as scope_id,
                concat_ws(':', backtest_status, signed_error_days, absolute_error_days, baseline_absolute_error_days, overcompensated) as source_status,
                updated_at::text as source_updated_at
           from public.duration_algorithm_accuracy_events
          where project_id = any($1::uuid[])
            and backtest_status = 'backtested'
       ) facts
      order by source_kind, source_id`,
    [input.projectIds],
  )
  return hashDurationContextPolicyLearningValue({
    asOfDate: input.asOfDate,
    projectIds: [...input.projectIds].sort(),
    rows,
  })
}

export async function runDurationContextPolicyLearningSweep(params: {
  projectIds?: string[] | null
  asOfDate?: string | null
  inputFactDigest?: string | null
  runtimeParameterProposals?: readonly DurationContextPolicyRuntimeParameterProposal[] | null
  monitoringObservations?: readonly DurationContextPolicyRuntimeMonitoringObservation[] | null
} = {}, options: DurationContextPolicyLearningSweepOptions = {}) {
  const projectIds = await listActiveProjectIds(params.projectIds)
  const asOfDate = params.asOfDate || todayIsoDate()
  const sampleReconciliation = await (options.sampleReconciliation ?? reconcileDurationExperienceSamples)({ projectIds })
  const loaded = await (options.loadModules ?? loadDurationContextPolicyLearningModules)()

  if (loaded.status === 'missing') {
    return {
      jobCode: 'duration_context_policy_learning_sweep',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimeMutationPolicy: 'none_candidate_report_only_dependency_missing',
      scannedProjects: projectIds.length,
      sampleReconciliation,
      learningModulesAvailable: false,
      missingLearningModule: loaded.missingModule,
      sweepResult: 'dependency_missing_report_only',
      rewardBackfill: null,
      offlineReplay: null,
      parameterLearning: null,
      learnedPolicyReplay: null,
      canaryGate: null,
      autoPublishGate: null,
      approvedCanaryShadowReplay: null,
      canaryActivationReadiness: null,
      canaryTrialReleasePlan: null,
      coldStartLearningPlan: null,
      canaryApprovalPolicy: 'auto_publish_gate_unavailable_dependency_missing',
      policyVersionRegistryPolicy: 'not_mutated_dependency_missing',
    }
  }

  const {
    backfillDurationContextPolicyRewards,
    runDurationContextPolicyOfflineReplay,
    learnDurationContextPolicyParameters,
    runDurationContextLearnedPolicyReplay,
    generateDurationContextPolicyCanaryCandidates,
    autoPublishDurationContextPolicyCandidates,
    runDurationContextApprovedCanaryShadowReplay,
    evaluateDurationContextCanaryActivationReadiness,
    buildDurationContextCanaryTrialReleasePlan,
    buildDurationContextColdStartLearningPlan,
  } = loaded.modules

  const inputFactDigest = normalizeText(params.inputFactDigest)
    || await (options.inputFactDigestProvider ?? loadDurationContextPolicyLearningInputFactDigest)({ projectIds, asOfDate })
  const operation = buildDurationContextPolicyLearningOperationIdentity({
    scheduledWindow: asOfDate,
    projectIds,
    inputFactDigest,
  })
  const checkpointStore = options.checkpointStore ?? createDatabaseDurationContextPolicyLearningCheckpointStore()
  const checkpointOwnerId = options.checkpointOwnerId ?? `sweep-${createJobId()}`
  const runStage = async <T>(
    stage: Parameters<typeof executeDurationContextPolicyLearningStage<T>>[0]['stage'],
    stageInput: unknown,
    execute: () => Promise<T>,
  ) => (await executeDurationContextPolicyLearningStage({
    identity: operation,
    stage,
    stageInput,
    ownerId: checkpointOwnerId,
    store: checkpointStore,
    execute,
  })).output

  const rewardBackfill = await runStage('reward_backfill', { projectIds, asOfDate }, () => (
    backfillDurationContextPolicyRewards({ projectIds, asOfDate })
  ))
  const offlineReplay = await runStage('offline_replay', {
    projectIds,
    asOfDate,
    rewardBackfill,
  }, () => runDurationContextPolicyOfflineReplay({
    projectIds,
    windowEndDate: asOfDate,
    persistDecisions: false,
  }))
  const parameterLearning = await runStage('parameter_learning', {
    projectIds,
    rewardBackfill,
    offlineReplay,
  }, () => learnDurationContextPolicyParameters({
    projectIds,
    persist: true,
  }))
  const learnedPolicyReplay = await runStage('learned_policy_replay', {
    projectIds,
    parameterLearning,
  }, () => runDurationContextLearnedPolicyReplay({ projectIds }))
  const canaryGate = await runStage('candidate_persistence', {
    projectIds,
    learnedPolicyReplay,
  }, () => generateDurationContextPolicyCanaryCandidates({
    projectIds,
    persist: true,
    operationId: operation.operationId,
    idempotencyStage: 'candidate_persistence',
  }))
  const canaryCandidates = Array.isArray((canaryGate as { candidates?: unknown[] }).candidates)
    ? (canaryGate as { candidates: unknown[] }).candidates
    : []
  const autoPublishGate = await runStage('decision_persistence', {
    asOfDate,
    canaryCandidates,
  }, () => autoPublishDurationContextPolicyCandidates({
    asOfDate,
    candidates: canaryCandidates,
    persist: true,
    operationId: operation.operationId,
    idempotencyStage: 'decision_persistence',
  }))
  const approvedCanaryShadowReplay = await runStage('approved_canary_shadow_replay', {
    projectIds,
    asOfDate,
    autoPublishGate,
  }, () => runDurationContextApprovedCanaryShadowReplay({ projectIds, asOfDate }))
  const canaryActivationReadiness = await runStage('activation_readiness', {
    projectIds,
    asOfDate,
    approvedCanaryShadowReplay,
  }, () => evaluateDurationContextCanaryActivationReadiness({ projectIds, asOfDate }))
  const canaryTrialReleasePlan = await runStage('trial_release_plan', {
    projectIds,
    asOfDate,
    canaryActivationReadiness,
  }, () => buildDurationContextCanaryTrialReleasePlan({ projectIds, asOfDate }))
  const runtimeParameterProposals = params.runtimeParameterProposals
    ? [...params.runtimeParameterProposals]
    : extractDurationContextPolicyRuntimeParameterProposals(autoPublishGate)
  const runtimePublicationBridge = await runStage('runtime_publication', {
    autoPublishGate,
    canaryActivationReadiness,
    canaryTrialReleasePlan,
    runtimeParameterProposals,
    monitoringObservations: params.monitoringObservations ?? [],
  }, () => (options.runtimePublicationBridge ?? runDurationContextPolicyRuntimePublicationBridge)({
    operationId: operation.operationId,
    proposals: runtimeParameterProposals,
    autoPublishGate,
    activationReadiness: canaryActivationReadiness,
    trialReleasePlan: canaryTrialReleasePlan,
    monitoringObservations: params.monitoringObservations,
  }))
  const coldStartLearningPlan = await runStage('cold_start_learning_plan', {
    projectIds,
    asOfDate,
    runtimePublicationBridge,
  }, () => buildDurationContextColdStartLearningPlan({ projectIds, asOfDate }))
  const stageCheckpoints = await checkpointStore.listOperationCheckpoints(operation.operationId)
  const runtimeMutationPolicy = runtimePublicationBridge.stablePublishedCount > 0
    ? 'stable_parameter_runtime_publication_with_monitoring_and_rollback'
    : runtimePublicationBridge.canaryPublishedCount > 0
      ? 'bounded_canary_parameter_runtime_publication_with_explicit_boundary'
      : runtimePublicationBridge.rollbackCount > 0
        ? 'runtime_canary_rollback_restored_previous_stable'
        : 'none_runtime_or_fact_mutation_canary_registry_only'

  return {
    jobCode: 'duration_context_policy_learning_sweep',
    frontendExposurePolicy: 'backend_admin_api_only',
    runtimeMutationPolicy,
    scannedProjects: projectIds.length,
    learningModulesAvailable: true,
    operation,
    checkpointPolicy: 'durable_stage_checkpoint_with_output_hash_and_lease',
    stageCheckpoints,
    sampleReconciliation,
    rewardBackfill,
    offlineReplay,
    parameterLearning,
    learnedPolicyReplay,
    canaryGate,
    autoPublishGate,
    approvedCanaryShadowReplay,
    canaryActivationReadiness,
    canaryTrialReleasePlan,
    runtimePublicationBridge,
    coldStartLearningPlan,
    canaryApprovalPolicy: 'low_risk_automated_gate; medium_bounded_canary; high_risk_professional_approval',
    policyVersionRegistryPolicy: 'registry_candidate_plus_runtime_parameter_publication_bridge',
  }
}

export class DurationContextPolicyLearningJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer: PersistentWallClockJobTimer

  constructor(private readonly options: DurationContextPolicyLearningSweepOptions = {}) {
    this.wallClockTimer = new PersistentWallClockJobTimer({
      jobName: 'durationContextPolicyLearningJob',
      schedule: { kind: 'daily', hour: 6, minute: 20 },
      execute: () => this.execute('scheduler'),
      onScheduled: ({ nextRun, delayMs }) => {
        this.nextRun = nextRun
        logger.info('durationContextPolicyLearningJob scheduled', {
          nextRun: nextRun.toISOString(),
          trigger: 'daily_06_20',
          initialDelay: delayMs,
        })
      },
      onError: (error) => logger.error('durationContextPolicyLearningJob scheduler failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    })
  }

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('durationContextPolicyLearningJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('durationContextPolicyLearningJob stopped')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.wallClockTimer.getStatus().isScheduled,
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
      const asOfDate = todayIsoDate()
      const scopedProjectIds = await listActiveProjectIds(Array.isArray(projectIds) ? projectIds : null)
      const inputFactDigest = await (
        this.options.inputFactDigestProvider ?? loadDurationContextPolicyLearningInputFactDigest
      )({
        projectIds: scopedProjectIds,
        asOfDate,
      })
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'durationContextPolicyLearningJob',
          triggeredBy,
          jobId,
        },
        async (attempt) => runDurationContextPolicyLearningSweep({
          projectIds: scopedProjectIds,
          asOfDate,
          inputFactDigest,
        }, {
          ...this.options,
          checkpointOwnerId: `${jobId}:attempt-${attempt}`,
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
      if (triggeredBy === 'scheduler') throw error
      return buildDurationContextPolicyLearningFailureAudit({ triggeredBy, jobId, error })
    } finally {
      this.isRunning = false
    }
  }
}

export const durationContextPolicyLearningJob = new DurationContextPolicyLearningJob()
