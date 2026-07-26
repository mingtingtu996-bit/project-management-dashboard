import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import * as registryModule from '../services/algorithmAssetLearnableParameterRegistryService.js'
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

function sourcePath(relativePath: string) {
  return fileURLToPath(new URL(relativePath, import.meta.url))
}

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

  it('keeps every source-defined forecast and duration tuning surface explicitly governed or frozen', () => {
    const inventoryFactory = (registryModule as typeof registryModule & {
      listAlgorithmAssetTunableParameterSourceInventory?: () => Array<{
        inventoryKey: string
        classification: string
        sourcePath: string
        sourceSymbols: string[]
        registryParameterKeys: string[]
      }>
    }).listAlgorithmAssetTunableParameterSourceInventory

    expect(inventoryFactory).toEqual(expect.any(Function))

    const inventory = inventoryFactory!()
    const expectedEntries = [
      {
        inventoryKey: 'forecast.candidate_weights',
        classification: 'governed_learnable',
        sourcePath: 'server/src/services/taskDurationForecastService.ts',
        sourceSymbols: ['DEFAULT_CANDIDATE_WEIGHTS'],
        registryParameterKeys: [
          'forecast.L0.candidate_weight',
          'forecast.L1.candidate_weight',
          'forecast.L2.candidate_weight',
        ],
      },
      {
        inventoryKey: 'forecast.progress_curve_policy',
        classification: 'governed_learnable',
        sourcePath: 'server/src/services/taskDurationForecastService.ts',
        sourceSymbols: ['DEFAULT_PROGRESS_CURVE_POLICIES'],
        registryParameterKeys: ['forecast.progress_curve_multiplier'],
      },
      {
        inventoryKey: 'forecast.residual_overlay_limits',
        classification: 'frozen_constant',
        sourcePath: 'server/src/services/taskDurationForecastService.ts',
        sourceSymbols: [
          'RESIDUAL_OVERLAY_MIN_PROJECT_SAMPLE_COUNT',
          'RESIDUAL_OVERLAY_MIN_COMPANY_SAMPLE_COUNT',
          'PROJECT_FORECAST_OVERLAY_MIN_SAMPLE_COUNT',
          'MAX_RUNTIME_RESIDUAL_OVERCOMPENSATION_RATIO',
          'MAX_RUNTIME_RESIDUAL_CORRECTION_DAYS',
        ],
        registryParameterKeys: [],
      },
      {
        inventoryKey: 'forecast.earliest_start_rule_policy',
        classification: 'frozen_constant',
        sourcePath: 'server/src/services/taskDurationForecastService.ts',
        sourceSymbols: ['DEFAULT_EARLIEST_START_RULE_POLICY'],
        registryParameterKeys: [],
      },
      {
        inventoryKey: 'forecast.default_model_profile',
        classification: 'frozen_constant',
        sourcePath: 'server/src/services/taskDurationForecastService.ts',
        sourceSymbols: ['DEFAULT_FORECAST_MODEL_PROFILE'],
        registryParameterKeys: [],
      },
      {
        inventoryKey: 'forecast.trigger_context_defaults',
        classification: 'frozen_constant',
        sourcePath: 'server/src/services/taskDurationForecastService.ts',
        sourceSymbols: ['DEFAULT_FORECAST_OPTIONS', 'TRIGGER_CONTEXT_DEFAULTS'],
        registryParameterKeys: [],
      },
      {
        inventoryKey: 'forecast.stuck_finishing_policy',
        classification: 'frozen_constant',
        sourcePath: 'server/src/services/taskDurationForecastService.ts',
        sourceSymbols: ['DEFAULT_STUCK_FINISHING_POLICIES'],
        registryParameterKeys: [],
      },
      {
        inventoryKey: 'duration.context.factor_multiplier_caps',
        classification: 'frozen_constant',
        sourcePath: 'server/src/services/durationContextService.ts',
        sourceSymbols: ['FACTOR_MULTIPLIER_CAP_POLICY'],
        registryParameterKeys: [],
      },
      {
        inventoryKey: 'duration.context.site_capacity_pressure_policy',
        classification: 'frozen_constant',
        sourcePath: 'server/src/services/durationContextService.ts',
        sourceSymbols: ['DEFAULT_SITE_CAPACITY_PRESSURE_POLICY'],
        registryParameterKeys: [],
      },
      {
        inventoryKey: 'duration.context.site_pressure_runtime_parameter',
        classification: 'governed_learnable',
        sourcePath: 'server/src/services/durationContextService.ts',
        sourceSymbols: ['SITE_PRESSURE_MULTIPLIER_PARAMETER_KEY'],
        registryParameterKeys: ['duration.context.site_pressure_multiplier'],
      },
      {
        inventoryKey: 'duration.context.application_safety_bounds',
        classification: 'frozen_constant',
        sourcePath: 'server/src/services/durationContextService.ts',
        sourceSymbols: [
          'DURATION_MULTIPLIER_SAFETY_MAX',
          'DURATION_CONTEXT_CONFIDENCE_DELTA_MIN',
          'DURATION_CONTEXT_CONFIDENCE_DELTA_MAX',
        ],
        registryParameterKeys: [],
      },
      {
        inventoryKey: 'duration.context.synthesis_safety_bounds',
        classification: 'frozen_constant',
        sourcePath: 'server/src/services/durationContextFactorSynthesisService.ts',
        sourceSymbols: [
          'DURATION_CONTEXT_FACTOR_SYNTHESIS_MULTIPLIER_SAFETY_MAX',
          'DURATION_CONTEXT_FACTOR_SYNTHESIS_CONFIDENCE_DELTA_MIN',
          'DURATION_CONTEXT_FACTOR_SYNTHESIS_CONFIDENCE_DELTA_MAX',
        ],
        registryParameterKeys: [],
      },
      {
        inventoryKey: 'forecast.network_monte_carlo_defaults',
        classification: 'frozen_constant',
        sourcePath: 'server/src/services/durationNetworkMonteCarloService.ts',
        sourceSymbols: ['DEFAULT_SIMULATION_COUNT', 'DEFAULT_SCENARIO_CORRELATION'],
        registryParameterKeys: [],
      },
    ]

    expect(inventory).toEqual(expectedEntries)

    const registeredKeys = new Set(listAlgorithmAssetLearnableParameters().map((parameter) => parameter.parameterKey))
    for (const entry of inventory) {
      const source = readFileSync(sourcePath(`../services/${entry.sourcePath.split('/').at(-1)}`), 'utf8')
      for (const symbol of entry.sourceSymbols) {
        expect(source).toContain(symbol)
      }
      if (entry.classification === 'governed_learnable') {
        expect(entry.registryParameterKeys.length).toBeGreaterThan(0)
        for (const parameterKey of entry.registryParameterKeys) {
          expect(registeredKeys).toContain(parameterKey)
        }
      } else {
        expect(entry.registryParameterKeys).toEqual([])
      }
    }

    const sourceCandidatePatterns: Array<{ sourcePath: string, pattern: RegExp }> = [
      {
        sourcePath: 'server/src/services/taskDurationForecastService.ts',
        pattern: /^(?:RESIDUAL_OVERLAY_|PROJECT_FORECAST_OVERLAY_|MAX_RUNTIME_RESIDUAL_|DEFAULT_CANDIDATE_WEIGHTS$|DEFAULT_FORECAST_MODEL_PROFILE$|DEFAULT_EARLIEST_START_RULE_POLICY$|DEFAULT_FORECAST_OPTIONS$|TRIGGER_CONTEXT_DEFAULTS$|DEFAULT_PROGRESS_CURVE_POLICIES$|DEFAULT_STUCK_FINISHING_POLICIES$)/,
      },
      {
        sourcePath: 'server/src/services/durationContextService.ts',
        pattern: /^(?:DURATION_MULTIPLIER_SAFETY_MAX$|DURATION_CONTEXT_CONFIDENCE_DELTA_(?:MIN|MAX)$|FACTOR_MULTIPLIER_CAP_POLICY$|DEFAULT_SITE_CAPACITY_PRESSURE_POLICY$|SITE_PRESSURE_MULTIPLIER_PARAMETER_KEY$)/,
      },
      {
        sourcePath: 'server/src/services/durationContextFactorSynthesisService.ts',
        pattern: /^DURATION_CONTEXT_FACTOR_SYNTHESIS_(?:MULTIPLIER_SAFETY_MAX|CONFIDENCE_DELTA_MIN|CONFIDENCE_DELTA_MAX)$/,
      },
      {
        sourcePath: 'server/src/services/durationNetworkMonteCarloService.ts',
        pattern: /^(?:DEFAULT_SIMULATION_COUNT|DEFAULT_SCENARIO_CORRELATION)$/,
      },
    ]

    for (const entry of sourceCandidatePatterns) {
      const source = readFileSync(sourcePath(`../services/${entry.sourcePath.split('/').at(-1)}`), 'utf8')
      const sourceCandidates = [...source.matchAll(/^(?:export )?const ([A-Z][A-Z0-9_]*)/gm)]
        .map((match) => match[1])
        .filter((symbol): symbol is string => Boolean(symbol) && entry.pattern.test(symbol))
        .sort()
      const inventoriedSymbols = inventory
        .filter((item) => item.sourcePath === entry.sourcePath)
        .flatMap((item) => item.sourceSymbols)
        .sort()

      expect(inventoriedSymbols).toEqual(sourceCandidates)
    }
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
