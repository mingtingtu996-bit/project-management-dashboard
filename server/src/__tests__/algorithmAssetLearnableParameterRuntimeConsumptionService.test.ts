import { describe, expect, it } from 'vitest'

import {
  loadAlgorithmAssetLearnableParameterRuntimeValue,
} from '../services/algorithmAssetLearnableParameterRuntimeConsumptionService.js'

function createRecordingQueryExec(rows: Record<string, unknown>[]) {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    return rows as T[]
  }
  return { calls, queryExec }
}

function joinedSql(calls: Array<{ sql: string }>) {
  return calls.map((call) => call.sql).join('\n').toLowerCase()
}

function durationBlendPublication(overrides: Record<string, unknown> = {}) {
  return {
    publication_key: 'learnable-parameter-runtime:duration-blend:company_override',
    parameter_key: 'duration.benchmark_blend_weight',
    owner_algorithm: 'durationSuggestionService',
    scope_level: 'company',
    company_id: 'company-a',
    project_id: null,
    target_surface: 'company_override',
    publication_status: 'published',
    parameter_value: 0.58,
    previous_value: 0.55,
    rollback_target: 'duration.benchmark_blend_weight.default',
    release_package: {
      candidatePayload: {
        evidence: {
          sampleCount: 80,
          replayPassed: true,
          conflictFree: true,
          rollbackTarget: 'duration.benchmark_blend_weight.default',
          maeImprovement: 1.2,
          overcompensationRate: 0.05,
        },
      },
    },
    writes_seed_runtime_directly: false,
    target_runtime_table: 'algorithm_learnable_parameter_runtime_publications',
    published_at: '2026-06-14T06:00:00.000Z',
    ...overrides,
  }
}

function trafficBucket(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 100
}

describe('algorithmAssetLearnableParameterRuntimeConsumptionService', () => {
  it('loads a scoped published parameter value from the parameter publication table only', async () => {
    const { calls, queryExec } = createRecordingQueryExec([durationBlendPublication()])

    const result = await loadAlgorithmAssetLearnableParameterRuntimeValue({
      parameterKey: 'duration.benchmark_blend_weight',
      companyId: 'company-a',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_parameter_consumable',
      runtimeConsumable: true,
      parameterKey: 'duration.benchmark_blend_weight',
      runtimeValue: 0.58,
      publicationKey: 'learnable-parameter-runtime:duration-blend:company_override',
      publicationStatus: 'published',
      scopeLevel: 'company',
      writesSeedRuntimeDirectly: false,
    }))
    expect(result.reasons).toEqual([])
    const sql = joinedSql(calls)
    expect(sql).toContain('from public.algorithm_learnable_parameter_runtime_publications')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('algorithm_seed_versions')
    expect(sql).not.toContain('algorithm_seed_overrides')
    expect(sql).not.toContain('standard_work_duration')
  })

  it('blocks rolled back parameter publications even if the query returns one defensively', async () => {
    const { queryExec } = createRecordingQueryExec([
      durationBlendPublication({
        publication_status: 'rolled_back',
        rolled_back_at: '2026-06-14T08:00:00.000Z',
      }),
    ])

    const result = await loadAlgorithmAssetLearnableParameterRuntimeValue({
      parameterKey: 'duration.benchmark_blend_weight',
      companyId: 'company-a',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_parameter_blocked',
      runtimeConsumable: false,
      runtimeValue: null,
      writesSeedRuntimeDirectly: false,
    }))
    expect(result.reasons).toContain('publication_status_not_runtime_consumable')
  })

  it('blocks manually governed or high-risk parameters instead of treating publication rows as release permission', async () => {
    const { queryExec } = createRecordingQueryExec([
      durationBlendPublication({
        publication_key: 'learnable-parameter-runtime:forecast-l2:system_seed',
        parameter_key: 'forecast.L2.candidate_weight',
        owner_algorithm: 'taskDurationForecastService',
        scope_level: 'system',
        company_id: null,
        target_surface: 'system_seed',
        parameter_value: 0.44,
        previous_value: 0.42,
        rollback_target: 'forecast.L2.candidate_weight.default',
        release_package: {
          candidatePayload: {
            evidence: {
              sampleCount: 1_000,
              replayPassed: true,
              conflictFree: true,
              rollbackTarget: 'forecast.L2.candidate_weight.default',
              crossCompanyReplayPassed: true,
            },
          },
        },
      }),
    ])

    const result = await loadAlgorithmAssetLearnableParameterRuntimeValue({
      parameterKey: 'forecast.L2.candidate_weight',
      allowSystemScope: true,
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_parameter_blocked',
      runtimeConsumable: false,
      runtimeValue: null,
      writesSeedRuntimeDirectly: false,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'parameter_learning_maturity_does_not_allow_runtime_consumption',
      'manual_or_system_curated_publish_anchor_requires_governance_package',
    ]))
  })

  it('loads a canary parameter only when the consumer provides an explicit canary runtime boundary', async () => {
    const { calls, queryExec } = createRecordingQueryExec([
      durationBlendPublication({
        publication_key: 'learnable-parameter-runtime:weather-multiplier:company_canary',
        parameter_key: 'duration.context.weather_multiplier',
        owner_algorithm: 'durationContextPolicyLearningService',
        scope_level: 'company',
        publication_status: 'canary',
        parameter_value: 1.12,
        previous_value: 1.05,
        rollback_target: 'duration.context.weather_multiplier.default',
        release_package: {
          candidatePayload: {
            evidence: {
              sampleCount: 40,
              replayPassed: true,
              conflictFree: true,
              rollbackTarget: 'duration.context.weather_multiplier.default',
              maeImprovement: 0.8,
              overcompensationRate: 0.08,
            },
          },
        },
      }),
    ])

    const result = await loadAlgorithmAssetLearnableParameterRuntimeValue({
      parameterKey: 'duration.context.weather_multiplier',
      companyId: 'company-a',
      consumptionMode: 'canary',
      canaryRuntimeBoundary: {
        consumerKey: 'durationContextService.weather_forecast_impact',
        scopeBoundary: 'company',
        stopConditionKeys: ['overcompensation_rate', 'mae_regression'],
        monitoringWindowHours: 72,
      },
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_parameter_consumable',
      runtimeConsumable: true,
      parameterKey: 'duration.context.weather_multiplier',
      runtimeValue: 1.12,
      publicationKey: 'learnable-parameter-runtime:weather-multiplier:company_canary',
      publicationStatus: 'canary',
      scopeLevel: 'company',
      consumptionMode: 'canary',
      writesSeedRuntimeDirectly: false,
    }))
    expect(result.reasons).toEqual([])
    expect(calls[0]?.params).toContain('canary')
  })

  it('blocks canary parameter publications when the canary runtime boundary is missing', async () => {
    const { queryExec } = createRecordingQueryExec([
      durationBlendPublication({
        publication_key: 'learnable-parameter-runtime:weather-multiplier:company_canary',
        parameter_key: 'duration.context.weather_multiplier',
        owner_algorithm: 'durationContextPolicyLearningService',
        scope_level: 'company',
        publication_status: 'canary',
        parameter_value: 1.12,
        previous_value: 1.05,
        rollback_target: 'duration.context.weather_multiplier.default',
      }),
    ])

    const result = await loadAlgorithmAssetLearnableParameterRuntimeValue({
      parameterKey: 'duration.context.weather_multiplier',
      companyId: 'company-a',
      consumptionMode: 'canary',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_parameter_blocked',
      runtimeConsumable: false,
      runtimeValue: null,
      publicationStatus: 'canary',
      writesSeedRuntimeDirectly: false,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'canary_runtime_consumer_key_required',
      'canary_runtime_scope_boundary_required',
      'canary_runtime_stop_conditions_required',
      'canary_runtime_monitoring_window_required',
    ]))
  })

  it('enforces the published canary traffic allocation with a stable subject hash', async () => {
    const publicationKey = 'learnable-parameter-runtime:duration-blend:company_canary'
    const publication = durationBlendPublication({
      publication_key: publicationKey,
      publication_status: 'canary',
      release_package: {
        candidatePayload: {
          runtimeBoundary: {
            trafficPercent: 5,
            scopeBoundary: 'company',
            allowedConsumerKeys: ['durationSuggestionService.company_benchmark_blend'],
          },
          evidence: {
            sampleCount: 80,
            replayPassed: true,
            conflictFree: true,
            rollbackTarget: 'duration.benchmark_blend_weight.default',
            maeImprovement: 1.2,
            overcompensationRate: 0.05,
          },
        },
      },
    })
    const matchingSubject = Array.from({ length: 500 }, (_, index) => `task-${index}`)
      .find((subject) => trafficBucket(`${publicationKey}:${subject}`) < 5)!
    const outsideSubject = Array.from({ length: 500 }, (_, index) => `task-${index}`)
      .find((subject) => trafficBucket(`${publicationKey}:${subject}`) >= 5)!
    const boundary = {
      consumerKey: 'durationSuggestionService.company_benchmark_blend',
      scopeBoundary: 'company',
      stopConditionKeys: ['mae_regression', 'overcompensation'],
      monitoringWindowHours: 72,
    }

    const inside = await loadAlgorithmAssetLearnableParameterRuntimeValue({
      parameterKey: 'duration.benchmark_blend_weight',
      companyId: 'company-a',
      consumptionMode: 'canary',
      canaryRuntimeBoundary: { ...boundary, trafficSubjectKey: matchingSubject },
      queryExec: createRecordingQueryExec([publication]).queryExec,
    })
    const outside = await loadAlgorithmAssetLearnableParameterRuntimeValue({
      parameterKey: 'duration.benchmark_blend_weight',
      companyId: 'company-a',
      consumptionMode: 'canary',
      canaryRuntimeBoundary: { ...boundary, trafficSubjectKey: outsideSubject },
      queryExec: createRecordingQueryExec([publication]).queryExec,
    })
    const missingSubject = await loadAlgorithmAssetLearnableParameterRuntimeValue({
      parameterKey: 'duration.benchmark_blend_weight',
      companyId: 'company-a',
      consumptionMode: 'canary',
      canaryRuntimeBoundary: boundary,
      queryExec: createRecordingQueryExec([publication]).queryExec,
    })

    expect(inside.runtimeConsumable).toBe(true)
    expect(outside).toEqual(expect.objectContaining({
      runtimeConsumable: false,
      reasons: expect.arrayContaining(['canary_subject_outside_traffic_allocation']),
    }))
    expect(missingSubject.reasons).toContain('canary_runtime_traffic_subject_key_required')
  })
})
