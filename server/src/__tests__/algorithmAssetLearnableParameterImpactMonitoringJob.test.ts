import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
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
