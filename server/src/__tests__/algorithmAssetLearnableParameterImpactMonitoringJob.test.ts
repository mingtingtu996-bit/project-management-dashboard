import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

import {
  AlgorithmAssetLearnableParameterImpactMonitoringJob,
  collectLearnableParameterImpactMonitoringCandidates,
  runAlgorithmAssetLearnableParameterImpactMonitoringSweep,
  type AlgorithmAssetLearnableParameterMonitoringCandidate,
} from '../jobs/algorithmAssetLearnableParameterImpactMonitoringJob.js'

function createRecordingQueryExec() {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    return [] as T[]
  }
  return { calls, queryExec }
}

function joinedSql(calls: Array<{ sql: string }>) {
  return calls.map((call) => call.sql).join('\n').toLowerCase()
}

const failedParameterCandidate: AlgorithmAssetLearnableParameterMonitoringCandidate = {
  sourcePublicationKey: 'learnable-parameter-runtime:event-duration-blend:company_override',
  rollbackTarget: 'duration-blend-v1',
  parameterKey: 'duration.benchmark_blend_weight',
  monitoredAssetCount: 18,
  monitoringWindowHours: 48,
  metrics: {
    forecastErrorRegressionRate: 0.18,
    rollbackThreshold: 0.1,
  },
  thresholdViolations: ['forecast_error_regression_rate_above_threshold'],
}

const healthyParameterCandidate: AlgorithmAssetLearnableParameterMonitoringCandidate = {
  sourcePublicationKey: 'learnable-parameter-runtime:event-confidence-penalty:project_override',
  rollbackTarget: 'confidence-penalty-v2',
  parameterKey: 'forecast.confidence_penalty',
  monitoredAssetCount: 7,
  monitoringWindowHours: 72,
  metrics: {
    forecastErrorRegressionRate: 0.02,
    rollbackThreshold: 0.1,
  },
  thresholdViolations: [],
}

const defaultStopConditionViolationCandidate: AlgorithmAssetLearnableParameterMonitoringCandidate = {
  sourcePublicationKey: 'learnable-parameter-runtime:event-p50-p75:company_override',
  rollbackTarget: 'duration-p50-p75-v1',
  parameterKey: 'duration.p50_p75_blend_ratio',
  monitoredAssetCount: 42,
  monitoringWindowHours: 72,
  metrics: {
    overcompensationRate: 0.24,
    forecastErrorRegressionRate: 0.01,
  },
}

describe('algorithmAssetLearnableParameterImpactMonitoringJob', () => {
  it('runs the duration learning runtime lifecycle from the production monitoring job while injected jobs opt in explicitly', async () => {
    const durationLearningRuntimeLifecycleSweep = vi.fn(async () => ({
      candidateCount: 3,
      expandedCandidateCount: 5,
      canaryPublished: 2,
      candidateCheckpointReused: 0,
      candidateCollecting: 1,
      manualFallback: 0,
      monitoringPending: 1,
      monitoringPassed: 1,
      monitoringFailed: 0,
      stablePromoted: 1,
      stablePromotionReused: 0,
      rollbackExecuted: 0,
      rollbackReused: 0,
      failed: 0,
      failureRefs: [],
      collectionCursorAdvanced: true,
    }))
    const job = new AlgorithmAssetLearnableParameterImpactMonitoringJob({
      candidateProvider: async () => [],
      durationLearningRuntimeLifecycleSweep,
    })

    const result = await job.executeNow()

    expect(durationLearningRuntimeLifecycleSweep).toHaveBeenCalledOnce()
    expect(result).toEqual(expect.objectContaining({
      total: 0,
      durationLearningRuntimeLifecycle: expect.objectContaining({
        canaryPublished: 2,
        stablePromoted: 1,
      }),
    }))
  })

  it('retries a structured duration lifecycle partial failure before logging the parent job as completed', async () => {
    const partial = {
      candidateCount: 2,
      expandedCandidateCount: 2,
      canaryPublished: 1,
      candidateCheckpointReused: 0,
      candidateCollecting: 0,
      manualFallback: 0,
      monitoringPending: 0,
      monitoringPassed: 0,
      monitoringFailed: 0,
      stablePromoted: 0,
      stablePromotionReused: 0,
      rollbackExecuted: 0,
      rollbackReused: 0,
      failed: 1,
      failureRefs: [{
        phase: 'candidate_publication',
        reference: 'benchmark:p2',
        message: 'transient publication failure',
      }],
    }
    const recovered = {
      ...partial,
      canaryPublished: 1,
      candidateCheckpointReused: 1,
      failed: 0,
      failureRefs: [],
    }
    const durationLearningRuntimeLifecycleSweep = vi.fn()
      .mockResolvedValueOnce(partial)
      .mockResolvedValueOnce(recovered)
    const job = new AlgorithmAssetLearnableParameterImpactMonitoringJob({
      candidateProvider: async () => [],
      durationLearningRuntimeLifecycleSweep,
    })

    const result = await job.executeNow()

    expect(durationLearningRuntimeLifecycleSweep).toHaveBeenCalledTimes(2)
    expect(result).toEqual(expect.objectContaining({
      durationLearningRuntimeLifecycle: expect.objectContaining({
        failed: 0,
        candidateCheckpointReused: 1,
        failureRefs: [],
      }),
    }))
  })

  it('binds runtime publications to scoped consumer observations and measured accuracy outcomes', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{
        publication_key: 'learnable-parameter-runtime:duration-blend:company',
        rollback_target: 'duration-blend-v1',
        parameter_key: 'duration.benchmark_blend_weight',
        owner_algorithm: 'durationSuggestionService',
        scope_level: 'company',
        target_surface: 'company_override',
        publication_status: 'published',
        monitoring_window_hours: 72,
        monitoring_elapsed_hours: 96,
        consumer_count: 44,
        sample_count: 38,
        mae_before: 8.5,
        mae_after: 7.1,
        overcompensation_rate: 0.04,
        regression_rate: 0.21,
      }] as T[]
    }

    const candidates = await collectLearnableParameterImpactMonitoringCandidates(queryExec)

    expect(candidates).toEqual([expect.objectContaining({
      sourcePublicationKey: 'learnable-parameter-runtime:duration-blend:company',
      monitoredAssetCount: 38,
      monitoringWindowHours: 72,
      monitoringElapsedHours: 96,
      metrics: expect.objectContaining({
        consumerCount: 44,
        maeBefore: 8.5,
        maeAfter: 7.1,
        overcompensationRate: 0.04,
        forecastErrorRegressionRate: 0.21,
      }),
    })])
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('runtime_consumer_observations')
    expect(calls[0].sql).toContain('duration_algorithm_accuracy_events')
    expect(calls[0].sql).toContain('observed_project.company_id = publication.company_id')
  })

  it('does not treat null aggregate metrics as measured zero regression', async () => {
    const queryExec = async <T = Record<string, unknown>>(): Promise<T[]> => [{
      publication_key: 'learnable-parameter-runtime:duration-blend:pending',
      rollback_target: 'duration-blend-v1',
      parameter_key: 'duration.benchmark_blend_weight',
      scope_level: 'company',
      publication_status: 'canary',
      monitoring_window_hours: 72,
      monitoring_elapsed_hours: 96,
      consumer_count: 40,
      sample_count: 40,
      mae_before: null,
      mae_after: null,
      overcompensation_rate: null,
      regression_rate: null,
    }] as T[]

    const candidates = await collectLearnableParameterImpactMonitoringCandidates(queryExec)

    expect(candidates[0]?.metrics).toEqual(expect.objectContaining({
      maeBefore: null,
      maeAfter: null,
      overcompensationRate: null,
      forecastErrorRegressionRate: null,
    }))
  })

  it('keeps publications pending when no measured accuracy or overcompensation metric exists', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await runAlgorithmAssetLearnableParameterImpactMonitoringSweep({
      queryExec,
      candidates: [{
        sourcePublicationKey: 'learnable-parameter-runtime:pending:company_override',
        rollbackTarget: 'duration-blend-v1',
        parameterKey: 'duration.benchmark_blend_weight',
        monitoredAssetCount: 0,
        monitoringWindowHours: 72,
        metrics: { publicationStatus: 'canary', scopeLevel: 'company' },
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      total: 1,
      monitored: 0,
      monitoringPending: 1,
      monitoringPassed: 0,
      monitoringFailed: 0,
      rollbackEvents: 0,
    }))
    expect(calls).toHaveLength(0)
  })

  it('records impact monitoring and marks a parameter publication rolled back when thresholds fail', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await runAlgorithmAssetLearnableParameterImpactMonitoringSweep({
      queryExec,
      candidates: [failedParameterCandidate],
      executedAt: '2026-09-04T01:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      total: 1,
      monitored: 1,
      monitoringPassed: 0,
      monitoringFailed: 1,
      rollbackEvents: 1,
      failed: 0,
    }))
    expect(calls).toHaveLength(3)
    expect(joinedSql(calls)).toContain('update public.algorithm_learnable_parameter_runtime_publications')
    expect(joinedSql(calls)).toContain('insert into public.algorithm_learnable_parameter_release_events')
    expect(calls[0].params).toEqual(expect.arrayContaining([
      'impact_monitoring',
      'monitoring_failed',
      'learnable-parameter-runtime:event-duration-blend:company_override',
      expect.objectContaining({
        thresholdViolations: ['forecast_error_regression_rate_above_threshold'],
        rollbackRecommended: true,
      }),
    ]))
    expect(calls[2].params).toEqual(expect.arrayContaining([
      'rollback_execution',
      'rollback_executed',
      'learnable-parameter-runtime:event-duration-blend:company_override',
      expect.objectContaining({
        rollbackTarget: 'duration-blend-v1',
        reason: 'impact_monitoring_failed',
      }),
    ]))
    expect(joinedSql(calls)).not.toContain('algorithm_seed_records')
    expect(joinedSql(calls)).not.toContain('algorithm_seed_overrides')
    expect(joinedSql(calls)).not.toContain('standard_work_duration')
  })

  it('records passed monitoring without rollback when parameter thresholds are clean', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await runAlgorithmAssetLearnableParameterImpactMonitoringSweep({
      queryExec,
      candidates: [healthyParameterCandidate],
      executedAt: '2026-09-04T01:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      total: 1,
      monitored: 1,
      monitoringPassed: 1,
      monitoringFailed: 0,
      rollbackEvents: 0,
      failed: 0,
    }))
    expect(calls).toHaveLength(1)
    expect(calls[0].params).toEqual(expect.arrayContaining([
      'impact_monitoring',
      'monitoring_passed',
      'learnable-parameter-runtime:event-confidence-penalty:project_override',
      expect.objectContaining({
        thresholdViolations: [],
        rollbackRecommended: false,
      }),
    ]))
    expect(joinedSql(calls)).not.toContain('algorithm_seed_records')
    expect(joinedSql(calls)).not.toContain('standard_work_duration')
  })

  it('uses frozen governance canary stop-condition defaults when no external evaluator is injected', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await runAlgorithmAssetLearnableParameterImpactMonitoringSweep({
      queryExec,
      candidates: [defaultStopConditionViolationCandidate],
      executedAt: '2026-09-04T01:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      total: 1,
      monitored: 1,
      monitoringPassed: 0,
      monitoringFailed: 1,
      rollbackEvents: 1,
      failed: 0,
    }))
    expect(calls).toHaveLength(3)
    expect(calls[0].params).toEqual(expect.arrayContaining([
      'impact_monitoring',
      'monitoring_failed',
      'learnable-parameter-runtime:event-p50-p75:company_override',
      expect.objectContaining({
        thresholdViolations: ['overcompensation_rate_above_governance_canary_stop_condition'],
        rollbackRecommended: true,
      }),
    ]))
    expect(calls[0].params).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metrics: expect.objectContaining({
          canaryStopConditionsSource: 'governance.canary_stop_conditions.default',
          canaryStopConditions: expect.objectContaining({
            maxOvercompensationRate: 0.2,
            maxRegressionRate: 0.05,
          }),
        }),
      }),
    ]))
    expect(joinedSql(calls)).not.toContain('algorithm_seed_records')
    expect(joinedSql(calls)).not.toContain('algorithm_seed_overrides')
    expect(joinedSql(calls)).not.toContain('standard_work_duration')
  })

  it('is wired into the scheduler as the learnable-parameter post-release monitoring job', () => {
    const schedulerSource = readFileSync(new URL('../scheduler.ts', import.meta.url), 'utf8')

    expect(schedulerSource).toContain("import { algorithmAssetLearnableParameterImpactMonitoringJob } from './jobs/algorithmAssetLearnableParameterImpactMonitoringJob.js'")
    expect(schedulerSource).toContain('algorithmAssetLearnableParameterImpactMonitoringJob.start()')
    expect(schedulerSource).toContain('algorithmAssetLearnableParameterImpactMonitoringJob.stop()')
  })
})
