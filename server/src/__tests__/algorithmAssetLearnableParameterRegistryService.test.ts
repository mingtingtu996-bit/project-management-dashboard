import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import {
  evaluateAlgorithmAssetParameterRuntimeUse,
  getAlgorithmAssetLearnableParameter,
  listAlgorithmAssetLearnableParameters,
  persistAlgorithmAssetLearnableParameterRegistry,
  validateAlgorithmAssetLearnableParameterRegistry,
} from '../services/algorithmAssetLearnableParameterRegistryService.js'

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

const serviceSourcePath = fileURLToPath(new URL('../services/algorithmAssetLearnableParameterRegistryService.ts', import.meta.url))

describe('algorithmAssetLearnableParameterRegistryService', () => {
  it('registers the required v1.4.22.3 learnable parameter families with governance fields', () => {
    const parameters = listAlgorithmAssetLearnableParameters()
    const keys = parameters.map((parameter) => parameter.parameterKey)

    expect(keys).toEqual(expect.arrayContaining([
      'duration.project_progress_velocity_multiplier',
      'duration.benchmark_blend_weight',
      'duration.p50_p75_blend_ratio',
      'forecast.L0.candidate_weight',
      'forecast.L1.candidate_weight',
      'forecast.L2.candidate_weight',
      'forecast.progress_curve_multiplier',
      'forecast.confidence_penalty',
      'forecast.confidence_weight_multiplier',
      'duration.context.weather_multiplier',
      'duration.context.site_pressure_multiplier',
      'governance.canary_stop_conditions',
    ]))

    for (const parameter of parameters) {
      expect(parameter).toEqual(expect.objectContaining({
        parameterKey: expect.any(String),
        ownerAlgorithm: expect.any(String),
        learningMaturity: expect.any(String),
        learningTarget: expect.any(String),
        publishAnchor: expect.any(String),
        automationMaturity: expect.any(String),
        scopePolicy: expect.any(String),
        riskLevel: expect.any(String),
        evidenceRequired: expect.objectContaining({
          minSampleCount: expect.any(Number),
          replayRequired: expect.any(Boolean),
          conflictFreeRequired: expect.any(Boolean),
        }),
        maxDeltaPerRelease: expect.any(Number),
        rollbackTarget: expect.any(String),
      }))
    }
    expect(validateAlgorithmAssetLearnableParameterRegistry().status).toBe('pass')
  })

  it('persists learnable parameter registry definitions without granting runtime writes', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await persistAlgorithmAssetLearnableParameterRegistry({ queryExec })

    expect(result).toEqual({
      persisted: true,
      parameterCount: listAlgorithmAssetLearnableParameters().length,
    })
    expect(calls.length).toBe(listAlgorithmAssetLearnableParameters().length)
    expect(joinedSql(calls)).toContain('insert into public.algorithm_learnable_parameter_registry')
    const benchmarkCall = calls.find((call) => call.params[0] === 'duration.benchmark_blend_weight')
    expect(benchmarkCall?.params).toEqual(expect.arrayContaining([
      'duration.benchmark_blend_weight',
      'durationSuggestionService',
      'system',
      'base_duration',
      'guarded_live_tuning',
      'guarded_runtime_auto_publish',
      'auto_publish',
      'low',
    ]))
    expect(benchmarkCall?.params).toEqual(expect.arrayContaining([
      expect.objectContaining({
        declaredScopePolicy: 'company',
        minSampleCount: 30,
        replayRequired: true,
        conflictFreeRequired: true,
        rollbackRequired: true,
      }),
      expect.objectContaining({
        rollbackTarget: 'duration.benchmark_blend_weight.default',
      }),
    ]))
    const sql = joinedSql(calls)
    expect(sql).not.toContain('insert into public.algorithm_seed_records')
    expect(sql).not.toContain('insert into public.algorithm_seed_versions')
    expect(sql).not.toContain('insert into public.algorithm_seed_overrides')
    expect(sql).not.toContain('update public.standard_work_duration')
  })

  it('keeps the production registry persistence path on fixed SQL literals', () => {
    const source = readFileSync(serviceSourcePath, 'utf8')

    expect(source).not.toContain('defaultRegistryQueryExec')
    expect(source).not.toContain('queryExec ??')
    expect(source).toContain('persistLearnableParameterRegistryWithRawQuery')
    expect(source).toContain('INSERT INTO public.algorithm_learnable_parameter_registry')
  })

  it('treats unregistered parameters as frozen constants that cannot be consumed as live learning', () => {
    const decision = evaluateAlgorithmAssetParameterRuntimeUse({
      parameterKey: 'forecast.hidden_magic_weight',
      proposedValue: 0.4,
      currentValue: 0.3,
      scopeType: 'company',
      companyId: 'company-a',
      evidence: {
        sampleCount: 100,
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'magic-weight-v1',
      },
    })

    expect(getAlgorithmAssetLearnableParameter('forecast.hidden_magic_weight')).toBeNull()
    expect(decision).toEqual(expect.objectContaining({
      status: 'frozen_constant',
      runtimeConsumable: false,
      effectiveLearningMaturity: 'frozen_constant',
    }))
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'unregistered_parameter_defaults_to_frozen_constant',
    ]))
  })

  it('allows guarded live tuning only when scope evidence delta and rollback gates pass', () => {
    const decision = evaluateAlgorithmAssetParameterRuntimeUse({
      parameterKey: 'duration.benchmark_blend_weight',
      proposedValue: 0.58,
      currentValue: 0.55,
      scopeType: 'company',
      companyId: 'company-a',
      evidence: {
        sampleCount: 80,
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'duration-blend-v1',
        maeImprovement: 1.2,
        overcompensationRate: 0.05,
      },
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'runtime_consumable',
      runtimeConsumable: true,
      effectiveLearningMaturity: 'guarded_live_tuning',
    }))
    expect(decision.reasons).toEqual([])
  })

  it('keeps registered parameters out of runtime when evidence is missing or delta exceeds the registered limit', () => {
    const decision = evaluateAlgorithmAssetParameterRuntimeUse({
      parameterKey: 'duration.context.weather_multiplier',
      proposedValue: 1.4,
      currentValue: 1.05,
      scopeType: 'company',
      companyId: 'company-a',
      evidence: {
        sampleCount: 4,
        replayPassed: false,
        conflictFree: true,
        rollbackTarget: null,
      },
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'review_required',
      runtimeConsumable: false,
      effectiveLearningMaturity: 'guarded_live_tuning',
    }))
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'sample_count_below_parameter_threshold',
      'replay_evidence_required',
      'rollback_target_required',
      'delta_exceeds_max_delta_per_release',
    ]))
  })

  it('does not let high-risk model weights become live parameters even with positive evidence', () => {
    const decision = evaluateAlgorithmAssetParameterRuntimeUse({
      parameterKey: 'forecast.L2.candidate_weight',
      proposedValue: 0.44,
      currentValue: 0.42,
      scopeType: 'system',
      evidence: {
        sampleCount: 1_000,
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'forecast-l2-v3',
        crossCompanyReplayPassed: true,
      },
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'governed_candidate_only',
      runtimeConsumable: false,
      effectiveLearningMaturity: 'governed_candidate',
    }))
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'parameter_learning_maturity_does_not_allow_runtime_consumption',
      'manual_or_system_curated_publish_anchor_requires_governance_package',
    ]))
  })
})
