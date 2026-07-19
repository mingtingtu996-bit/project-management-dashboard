import { logger } from '../middleware/logger.js'
import { executeSQL } from '../services/dbService.js'
import { runJobWithRetry } from '../services/jobRuntime.js'
import {
  executeAlgorithmAssetLearnableParameterRuntimeRollback,
  recordAlgorithmAssetLearnableParameterImpactMonitoring,
  type AlgorithmAssetLearnableParameterReleaseExecutionQueryExec,
} from '../services/algorithmAssetLearnableParameterReleaseExecutionService.js'
import { getAlgorithmAssetLearnableParameter } from '../services/algorithmAssetLearnableParameterRegistryService.js'
import { hashDurationContextPolicyLearningValue } from '../services/durationContextPolicyLearningCheckpointService.js'
import {
  runDurationLearningRuntimeLifecycleSweep,
  type DurationLearningRuntimeLifecycleSweepResult,
} from '../services/durationLearningRuntimeLifecycleService.js'
import { PersistentWallClockJobTimer } from '../services/persistentJobScheduleService.js'

const DEFAULT_MONITORING_WINDOW_HOURS = 72
const GOVERNANCE_CANARY_STOP_CONDITIONS_KEY = 'governance.canary_stop_conditions'

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readNonNegativeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function readOptionalNonNegativeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function readGovernanceCanaryStopConditions() {
  const parameter = getAlgorithmAssetLearnableParameter(GOVERNANCE_CANARY_STOP_CONDITIONS_KEY)
  const value = asRecord(parameter?.defaultValue) ?? asRecord(parameter?.currentValue) ?? {}
  return {
    source: `${GOVERNANCE_CANARY_STOP_CONDITIONS_KEY}.default`,
    maxOvercompensationRate: readNonNegativeNumber(value.maxOvercompensationRate ?? value.max_overcompensation_rate, 0.2),
    maxRegressionRate: readNonNegativeNumber(value.maxRegressionRate ?? value.max_regression_rate, 0.05),
  }
}

export type AlgorithmAssetLearnableParameterMonitoringCandidate = {
  sourcePublicationKey: string
  rollbackTarget: string
  parameterKey: string
  monitoredAssetCount: number
  monitoringWindowHours?: number
  monitoringElapsedHours?: number
  metrics?: Record<string, unknown>
  thresholdViolations?: string[]
}

export type AlgorithmAssetLearnableParameterImpactMonitoringSweepResult = {
  total: number
  monitored: number
  monitoringPassed: number
  monitoringFailed: number
  monitoringPending: number
  rollbackEvents: number
  failed: number
}

export type AlgorithmAssetLearnableParameterImpactMonitoringSweepInput = {
  queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
  candidates?: AlgorithmAssetLearnableParameterMonitoringCandidate[] | null
  candidateProvider?: () => Promise<AlgorithmAssetLearnableParameterMonitoringCandidate[]>
  thresholdEvaluator?: (candidate: AlgorithmAssetLearnableParameterMonitoringCandidate) => string[]
  executedAt?: string
}

export type AlgorithmAssetLearnableParameterImpactMonitoringJobOptions = {
  queryExec?: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec
  candidateProvider?: () => Promise<AlgorithmAssetLearnableParameterMonitoringCandidate[]>
  thresholdEvaluator?: (candidate: AlgorithmAssetLearnableParameterMonitoringCandidate) => string[]
  durationLearningRuntimeLifecycleSweep?: () => Promise<DurationLearningRuntimeLifecycleSweepResult>
}

export class DurationLearningRuntimeLifecyclePartialFailureError extends Error {
  readonly details: {
    result: DurationLearningRuntimeLifecycleSweepResult
    failureRefs: DurationLearningRuntimeLifecycleSweepResult['failureRefs']
  }

  constructor(result: DurationLearningRuntimeLifecycleSweepResult) {
    const references = result.failureRefs.map((failure) => `${failure.phase}:${failure.reference}`).join(',')
    super(`duration_learning_runtime_lifecycle_partial_failure:${result.failed}:${references || 'unclassified'}`)
    this.name = 'DurationLearningRuntimeLifecyclePartialFailureError'
    this.details = { result, failureRefs: result.failureRefs }
  }
}

function assertDurationLearningRuntimeLifecycleSweepSucceeded(
  result: DurationLearningRuntimeLifecycleSweepResult,
) {
  if (result.failed > 0) throw new DurationLearningRuntimeLifecyclePartialFailureError(result)
  return result
}

function emptyResult(total = 0): AlgorithmAssetLearnableParameterImpactMonitoringSweepResult {
  return {
    total,
    monitored: 0,
    monitoringPassed: 0,
    monitoringFailed: 0,
    monitoringPending: 0,
    rollbackEvents: 0,
    failed: 0,
  }
}

function readThresholdViolations(
  candidate: AlgorithmAssetLearnableParameterMonitoringCandidate,
  thresholdEvaluator?: (candidate: AlgorithmAssetLearnableParameterMonitoringCandidate) => string[],
) {
  if (thresholdEvaluator) return thresholdEvaluator(candidate)
  if (candidate.thresholdViolations) return candidate.thresholdViolations

  const stopConditions = readGovernanceCanaryStopConditions()
  const metrics = candidate.metrics ?? {}
  const overcompensationRate = readOptionalNonNegativeNumber(
    metrics.overcompensationRate ?? metrics.overcompensation_rate,
  )
  const regressionRate = readOptionalNonNegativeNumber(
    metrics.forecastErrorRegressionRate
      ?? metrics.forecast_error_regression_rate
      ?? metrics.regressionRate
      ?? metrics.regression_rate,
  )

  return [
    ...(
      overcompensationRate !== null && overcompensationRate > stopConditions.maxOvercompensationRate
        ? ['overcompensation_rate_above_governance_canary_stop_condition']
        : []
    ),
    ...(
      regressionRate !== null && regressionRate > stopConditions.maxRegressionRate
        ? ['regression_rate_above_governance_canary_stop_condition']
        : []
    ),
  ]
}

function monitoringMetricsFor(
  candidate: AlgorithmAssetLearnableParameterMonitoringCandidate,
  thresholdEvaluator?: (candidate: AlgorithmAssetLearnableParameterMonitoringCandidate) => string[],
) {
  if (thresholdEvaluator) return candidate.metrics ?? {}

  const stopConditions = readGovernanceCanaryStopConditions()
  return {
    ...(candidate.metrics ?? {}),
    canaryStopConditionsSource: stopConditions.source,
    canaryStopConditions: {
      maxOvercompensationRate: stopConditions.maxOvercompensationRate,
      maxRegressionRate: stopConditions.maxRegressionRate,
    },
  }
}

function hasMeasuredMonitoringEvidence(
  candidate: AlgorithmAssetLearnableParameterMonitoringCandidate,
  thresholdEvaluator?: (candidate: AlgorithmAssetLearnableParameterMonitoringCandidate) => string[],
) {
  if (
    candidate.monitoringElapsedHours !== undefined
    && candidate.monitoringElapsedHours < (candidate.monitoringWindowHours ?? DEFAULT_MONITORING_WINDOW_HOURS)
  ) return false
  if (thresholdEvaluator || candidate.thresholdViolations !== undefined) return candidate.monitoredAssetCount > 0
  const metrics = candidate.metrics ?? {}
  const parameter = getAlgorithmAssetLearnableParameter(candidate.parameterKey)
  const minimumSamples = Math.max(5, parameter?.evidenceRequired.minSampleCount ?? 20)
  return candidate.monitoredAssetCount >= minimumSamples && [
    metrics.overcompensationRate,
    metrics.overcompensation_rate,
    metrics.forecastErrorRegressionRate,
    metrics.forecast_error_regression_rate,
    metrics.regressionRate,
    metrics.regression_rate,
  ].some((value) => readOptionalNonNegativeNumber(value) !== null)
}

function buildCandidateFromPublication(row: Record<string, unknown>): AlgorithmAssetLearnableParameterMonitoringCandidate | null {
  const sourcePublicationKey = normalizeText(row.publication_key)
  const rollbackTarget = normalizeText(row.rollback_target)
  const parameterKey = normalizeText(row.parameter_key)
  if (!sourcePublicationKey || !rollbackTarget || !parameterKey) return null

  return {
    sourcePublicationKey,
    rollbackTarget,
    parameterKey,
    monitoredAssetCount: readNonNegativeNumber(row.sample_count, 0),
    monitoringWindowHours: readNonNegativeNumber(
      row.monitoring_window_hours,
      DEFAULT_MONITORING_WINDOW_HOURS,
    ),
    monitoringElapsedHours: readNonNegativeNumber(row.monitoring_elapsed_hours, 0),
    metrics: {
      ownerAlgorithm: normalizeText(row.owner_algorithm) || null,
      scopeLevel: normalizeText(row.scope_level) || null,
      targetSurface: normalizeText(row.target_surface) || null,
      publicationStatus: normalizeText(row.publication_status) || null,
      consumerCount: readNonNegativeNumber(row.consumer_count, 0),
      sampleCount: readNonNegativeNumber(row.sample_count, 0),
      maeBefore: readOptionalNonNegativeNumber(row.mae_before),
      maeAfter: readOptionalNonNegativeNumber(row.mae_after),
      overcompensationRate: readOptionalNonNegativeNumber(row.overcompensation_rate),
      forecastErrorRegressionRate: readOptionalNonNegativeNumber(row.regression_rate),
    },
  }
}

export async function collectLearnableParameterImpactMonitoringCandidates(
  queryExec: AlgorithmAssetLearnableParameterReleaseExecutionQueryExec = executeSQL,
) {
  const rows = await queryExec<Record<string, unknown>>(
    `with publication as (
       select publication_key,
              parameter_key,
              owner_algorithm,
              scope_level,
              company_id,
              project_id,
              target_surface,
              publication_status,
              rollback_target,
              impact_monitoring,
              published_at
         from public.algorithm_learnable_parameter_runtime_publications
        where publication_status in ('published', 'canary')
        order by published_at desc
        limit 200
     )
     select publication.publication_key,
            publication.parameter_key,
            publication.owner_algorithm,
            publication.scope_level,
            publication.target_surface,
            publication.publication_status,
            publication.rollback_target,
            coalesce((publication.impact_monitoring ->> 'monitoringWindowHours')::numeric, $1) as monitoring_window_hours,
            extract(epoch from (now() - publication.published_at)) / 3600.0 as monitoring_elapsed_hours,
            coalesce(measured.consumer_count, 0) as consumer_count,
            coalesce(measured.sample_count, 0) as sample_count,
            measured.mae_before,
            measured.mae_after,
            measured.overcompensation_rate,
            measured.regression_rate
       from publication
       left join lateral (
         select count(distinct observation.id) as consumer_count,
                count(distinct accuracy.id) as sample_count,
                avg(accuracy.baseline_absolute_error_days) as mae_before,
                avg(accuracy.absolute_error_days) as mae_after,
                avg(case when accuracy.overcompensated is true then 1.0 else 0.0 end) as overcompensation_rate,
                avg(case
                  when accuracy.baseline_absolute_error_days is not null
                    and accuracy.absolute_error_days > accuracy.baseline_absolute_error_days
                  then 1.0 else 0.0 end) as regression_rate
           from public.runtime_consumer_observations observation
           join public.projects observed_project
             on observed_project.id::text = observation.observation_context ->> 'projectId'
           left join public.duration_algorithm_accuracy_events accuracy
             on accuracy.project_id = observed_project.id
            and accuracy.task_id::text = observation.observation_context ->> 'taskId'
            and accuracy.backtest_status = 'backtested'
            and accuracy.backtested_at >= publication.published_at
          where observation.publication_key = publication.publication_key
            and observation.observation_status = 'observed'
            and nullif(observation.observation_context ->> 'taskId', '') is not null
            and (
              publication.scope_level = 'system'
              or (publication.scope_level = 'company' and observed_project.company_id = publication.company_id)
              or (
                publication.scope_level = 'project'
                and observed_project.company_id = publication.company_id
                and observed_project.id = publication.project_id
              )
            )
       ) measured on true
      order by publication.published_at desc`,
    [DEFAULT_MONITORING_WINDOW_HOURS],
  )
  return rows
    .map(buildCandidateFromPublication)
    .filter((candidate): candidate is AlgorithmAssetLearnableParameterMonitoringCandidate => Boolean(candidate))
}

export async function runAlgorithmAssetLearnableParameterImpactMonitoringSweep(
  input: AlgorithmAssetLearnableParameterImpactMonitoringSweepInput = {},
) {
  const queryExec = input.queryExec ?? executeSQL
  const candidates = input.candidates ?? (
    input.candidateProvider
      ? await input.candidateProvider()
      : await collectLearnableParameterImpactMonitoringCandidates(queryExec)
  )
  const result = emptyResult(candidates.length)
  const executedAt = input.executedAt ?? new Date().toISOString()

  for (const candidate of candidates) {
    try {
      if (!hasMeasuredMonitoringEvidence(candidate, input.thresholdEvaluator)) {
        result.monitoringPending += 1
        continue
      }
      const thresholdViolations = readThresholdViolations(candidate, input.thresholdEvaluator)
      const effectDigest = hashDurationContextPolicyLearningValue({
        sourcePublicationKey: candidate.sourcePublicationKey,
        monitoredAssetCount: candidate.monitoredAssetCount,
        metrics: candidate.metrics ?? {},
        thresholdViolations,
      }).slice(0, 24)
      const monitoring = await recordAlgorithmAssetLearnableParameterImpactMonitoring({
        queryExec,
        sourcePublicationKey: candidate.sourcePublicationKey,
        monitoredAssetCount: candidate.monitoredAssetCount,
        monitoringWindowHours: candidate.monitoringWindowHours ?? DEFAULT_MONITORING_WINDOW_HOURS,
        metrics: {
          ...monitoringMetricsFor(candidate, input.thresholdEvaluator),
          parameterKey: candidate.parameterKey,
        },
        thresholdViolations,
        executedAt,
        idempotencyKey: `learnable-parameter-monitor:${candidate.sourcePublicationKey}:${effectDigest}`,
      })

      result.monitored += 1
      if (monitoring.status === 'monitoring_failed') {
        result.monitoringFailed += 1
        const rollback = await executeAlgorithmAssetLearnableParameterRuntimeRollback({
          queryExec,
          sourcePublicationKey: candidate.sourcePublicationKey,
          rollbackTarget: candidate.rollbackTarget,
          reason: 'impact_monitoring_failed',
          executedAt,
          idempotencyKey: `learnable-parameter-rollback:${candidate.sourcePublicationKey}:${effectDigest}`,
        })
        if (rollback.status === 'rollback_executed') result.rollbackEvents += 1
      } else {
        result.monitoringPassed += 1
      }
    } catch (error) {
      result.failed += 1
      logger.warn('algorithmAssetLearnableParameterImpactMonitoringJob candidate failed', {
        sourcePublicationKey: candidate.sourcePublicationKey,
        parameterKey: candidate.parameterKey,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return result
}

export class AlgorithmAssetLearnableParameterImpactMonitoringJob {
  private isRunning = false
  private lastRun: Date | null = null
  private nextRun: Date | null = null
  private wallClockTimer: PersistentWallClockJobTimer

  constructor(private readonly options: AlgorithmAssetLearnableParameterImpactMonitoringJobOptions = {}) {
    this.wallClockTimer = new PersistentWallClockJobTimer({
      jobName: 'algorithmAssetLearnableParameterImpactMonitoringJob',
      schedule: { kind: 'daily', hour: 7, minute: 5 },
      execute: () => this.execute('scheduler'),
      onScheduled: ({ nextRun, delayMs }) => {
        this.nextRun = nextRun
        logger.info('algorithmAssetLearnableParameterImpactMonitoringJob scheduled', {
          nextRun: nextRun.toISOString(),
          trigger: 'daily_07_05',
          initialDelay: delayMs,
        })
      },
      onError: (error) => logger.error('algorithmAssetLearnableParameterImpactMonitoringJob scheduler failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    })
  }

  start() {
    if (!this.wallClockTimer.start()) {
      logger.warn('algorithmAssetLearnableParameterImpactMonitoringJob is already running')
    }
  }

  stop() {
    this.wallClockTimer.stop()
    this.nextRun = null
    logger.info('algorithmAssetLearnableParameterImpactMonitoringJob stopped')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: this.wallClockTimer.getStatus().isScheduled,
      lastRun: this.lastRun ? this.lastRun.toISOString() : null,
      nextRun: this.nextRun ? this.nextRun.toISOString() : null,
    }
  }

  async executeNow() {
    return this.execute('manual')
  }

  private async execute(triggeredBy: 'scheduler' | 'manual') {
    if (this.isRunning) {
      logger.warn('algorithmAssetLearnableParameterImpactMonitoringJob is already running, skip tick', { triggeredBy })
      return emptyResult()
    }

    this.isRunning = true
    const jobId = createJobId()
    try {
      this.lastRun = new Date()
      const { attempts, value } = await runJobWithRetry(
        {
          jobName: 'algorithmAssetLearnableParameterImpactMonitoringJob',
          triggeredBy,
          jobId,
        },
        async () => runAlgorithmAssetLearnableParameterImpactMonitoringSweep(this.options),
      )

      let durationLearningRuntimeLifecycle: DurationLearningRuntimeLifecycleSweepResult | null = null
      if (this.options.durationLearningRuntimeLifecycleSweep) {
        const lifecycleRun = await runJobWithRetry(
          {
            jobName: 'durationLearningRuntimeLifecycleSweep',
            triggeredBy,
            jobId,
          },
          async () => assertDurationLearningRuntimeLifecycleSweepSucceeded(
            await this.options.durationLearningRuntimeLifecycleSweep!(),
          ),
        )
        durationLearningRuntimeLifecycle = lifecycleRun.value
      }

      logger.info('algorithmAssetLearnableParameterImpactMonitoringJob completed', {
        triggeredBy,
        jobId,
        attempts,
        ...value,
        durationLearningRuntimeLifecycle,
      })
      return { ...value, durationLearningRuntimeLifecycle }
    } catch (error) {
      logger.error('algorithmAssetLearnableParameterImpactMonitoringJob failed', {
        triggeredBy,
        jobId,
        error: error instanceof Error ? error.message : String(error),
        details: error instanceof DurationLearningRuntimeLifecyclePartialFailureError
          ? error.details
          : null,
      })
      if (triggeredBy === 'scheduler') throw error
      return emptyResult()
    } finally {
      this.isRunning = false
    }
  }
}

export const algorithmAssetLearnableParameterImpactMonitoringJob = new AlgorithmAssetLearnableParameterImpactMonitoringJob({
  durationLearningRuntimeLifecycleSweep: runDurationLearningRuntimeLifecycleSweep,
})
