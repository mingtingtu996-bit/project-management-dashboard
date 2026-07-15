import { describe, expect, it } from 'vitest'

import {
  buildAlgorithmAssetLearnableParameterSuggestionRelease,
  createAlgorithmAssetLearnableParameterSuggestionEvent,
  createAndPersistAlgorithmAssetLearnableParameterSuggestionEvent,
} from '../services/algorithmAssetLearnableParameterSuggestionService.js'

function createRecordingQueryExec() {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    if (sql.includes('INSERT INTO public.algorithm_asset_candidate_events')) {
      return [{ id: 'parameter-candidate-row-id' }] as T[]
    }
    return [] as T[]
  }
  return { calls, queryExec }
}

function joinedSql(calls: Array<{ sql: string }>) {
  return calls.map((call) => call.sql).join('\n').toLowerCase()
}

describe('algorithmAssetLearnableParameterSuggestionService', () => {
  it('turns a qualified company learnable parameter suggestion into a release-exit handoff package', () => {
    const result = buildAlgorithmAssetLearnableParameterSuggestionRelease({
      parameterKey: 'duration.benchmark_blend_weight',
      sourceSystem: 'durationContextPolicyParameterLearningService',
      companyId: 'company-a',
      currentValue: 0.55,
      proposedValue: 0.58,
      evidence: {
        sampleCount: 80,
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'duration-blend-v1',
        maeImprovement: 1.2,
        overcompensationRate: 0.05,
      },
      conflictResult: 'supersede_with_rollback_target',
      replaySummary: {
        replayPassed: true,
        runtimeImpact: 'publish_gate_evidence',
      },
      releaseAdapter: {
        adapterKey: 'learnableParameterCompanyOverrideReleaseAdapter',
        targetSurface: 'company_override',
        supportsRollback: true,
      },
      platformPolicy: {
        impactMonitoringReady: true,
      },
    })

    expect(result.parameterDecision).toEqual(expect.objectContaining({
      status: 'runtime_consumable',
      runtimeConsumable: true,
    }))
    expect(result.event).toEqual(expect.objectContaining({
      assetKey: 'learnable_parameter:duration.benchmark_blend_weight',
      sourceSystem: 'durationContextPolicyParameterLearningService',
      scopeType: 'company',
      lifecycleStatus: 'published_ready',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      learningMaturity: 'guarded_live_tuning',
      learningTarget: 'base_duration',
    }))
    expect(result.event.candidatePayload).toEqual(expect.objectContaining({
      parameterKey: 'duration.benchmark_blend_weight',
      currentValue: 0.55,
      proposedValue: 0.58,
      parameterSuggestionInstance: true,
      maxDeltaPerRelease: 0.1,
      rollbackTarget: 'duration.benchmark_blend_weight.default',
    }))
    expect(result.releaseExit).toEqual(expect.objectContaining({
      status: 'release_package_ready',
      releaseAction: 'handoff_to_domain_release_adapter',
      canHandoffToRuntimeAdapter: true,
      writesRuntimeDirectly: false,
      targetSurface: 'company_override',
    }))
    expect(result.releaseExit.releasePackage).toEqual(expect.objectContaining({
      assetKey: 'learnable_parameter:duration.benchmark_blend_weight',
      adapterKey: 'learnableParameterCompanyOverrideReleaseAdapter',
      rollbackTarget: 'duration-blend-v1',
    }))
  })

  it('keeps qualified parameter suggestions in review when impact monitoring is missing', () => {
    const result = buildAlgorithmAssetLearnableParameterSuggestionRelease({
      parameterKey: 'duration.benchmark_blend_weight',
      sourceSystem: 'durationContextPolicyParameterLearningService',
      companyId: 'company-a',
      currentValue: 0.55,
      proposedValue: 0.58,
      evidence: {
        sampleCount: 80,
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'duration-blend-v1',
        maeImprovement: 1.2,
        overcompensationRate: 0.05,
      },
      conflictResult: 'supersede_with_rollback_target',
      replaySummary: {
        replayPassed: true,
        runtimeImpact: 'publish_gate_evidence',
      },
      releaseAdapter: {
        adapterKey: 'learnableParameterCompanyOverrideReleaseAdapter',
        targetSurface: 'company_override',
        supportsRollback: true,
      },
    })

    expect(result.parameterDecision).toEqual(expect.objectContaining({
      status: 'runtime_consumable',
      runtimeConsumable: true,
    }))
    expect(result.releaseExit).toEqual(expect.objectContaining({
      status: 'review_required',
      releaseAction: 'review_package_only',
      canHandoffToRuntimeAdapter: false,
      writesRuntimeDirectly: false,
      targetSurface: 'company_override',
    }))
    expect(result.releaseExit.reasons).toEqual(expect.arrayContaining([
      'impact_monitoring_required',
    ]))
    expect(result.releaseExit.releasePackage).toBeNull()
  })

  it('keeps high-risk or under-evidenced parameter suggestions in review instead of release-exit handoff', () => {
    const result = buildAlgorithmAssetLearnableParameterSuggestionRelease({
      parameterKey: 'forecast.L2.candidate_weight',
      sourceSystem: 'taskDurationForecastService',
      allowSystemReleaseScope: true,
      currentValue: 0.42,
      proposedValue: 0.44,
      evidence: {
        sampleCount: 1_000,
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'forecast-l2-v3',
        crossCompanyReplayPassed: true,
      },
      conflictResult: 'no_conflict_publish_allowed',
      replaySummary: {
        replayPassed: true,
        runtimeImpact: 'publish_gate_evidence',
      },
      releaseAdapter: {
        adapterKey: 'systemSeedReleaseAdapter',
        targetSurface: 'system_seed',
        supportsRollback: true,
      },
      platformPolicy: {
        systemAutoPublishPolicyReady: true,
        impactMonitoringReady: true,
        platformReleaseExitReady: true,
      },
    })

    expect(result.parameterDecision).toEqual(expect.objectContaining({
      status: 'governed_candidate_only',
      runtimeConsumable: false,
    }))
    expect(result.event).toEqual(expect.objectContaining({
      scopeType: 'system',
      lifecycleStatus: 'review_required',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_review_package',
    }))
    expect(result.event.governanceDecision.reasons).toEqual(expect.arrayContaining([
      'parameter_learning_maturity_does_not_allow_runtime_consumption',
      'manual_or_system_curated_publish_anchor_requires_governance_package',
      'parameter_suggestion_runtime_decision_blocks_release',
    ]))
    expect(result.releaseExit).toEqual(expect.objectContaining({
      status: 'manual_governance_required',
      releaseAction: 'review_package_only',
      canHandoffToRuntimeAdapter: false,
      writesRuntimeDirectly: false,
    }))
    expect(result.releaseExit.releasePackage).toBeNull()
  })

  it('persists parameter suggestion instances only as candidate events', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await createAndPersistAlgorithmAssetLearnableParameterSuggestionEvent({
      parameterKey: 'duration.context.weather_multiplier',
      sourceSystem: 'durationContextPolicyParameterLearningService',
      companyId: 'company-a',
      currentValue: 1.05,
      proposedValue: 1.08,
      evidence: {
        sampleCount: 40,
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'weather-multiplier-v1',
        maeImprovement: 0.8,
        overcompensationRate: 0.04,
      },
      queryExec,
    })

    expect(result.persistence).toEqual({
      persisted: true,
      candidateEventId: 'parameter-candidate-row-id',
    })
    expect(result.event).toEqual(expect.objectContaining({
      assetKey: 'learnable_parameter:duration.context.weather_multiplier',
      scopeType: 'company',
      lifecycleStatus: 'canary_ready',
    }))
    const sql = joinedSql(calls)
    expect(sql).toContain('insert into public.algorithm_asset_candidate_events')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('algorithm_seed_versions')
    expect(sql).not.toContain('algorithm_seed_overrides')
    expect(sql).not.toContain('standard_work_duration')
  })

  it('freezes unregistered parameter suggestions as review-only candidate events', () => {
    const event = createAlgorithmAssetLearnableParameterSuggestionEvent({
      parameterKey: 'duration.hidden_magic_multiplier',
      sourceSystem: 'llmParameterTuning',
      companyId: 'company-a',
      currentValue: 1,
      proposedValue: 1.3,
      evidence: {
        sampleCount: 500,
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'hidden-magic-v1',
      },
    })

    expect(event).toEqual(expect.objectContaining({
      assetKey: 'learnable_parameter:duration.hidden_magic_multiplier',
      lifecycleStatus: 'review_required',
      publishAnchor: 'candidate_only',
      automationMaturity: 'manual_required',
      learningMaturity: 'frozen_constant',
      learningTarget: 'governance_report',
    }))
    expect(event.candidatePayload).toEqual(expect.objectContaining({
      parameterSuggestionInstance: true,
      parameterDecisionStatus: 'frozen_constant',
      runtimeConsumable: false,
    }))
    expect(event.governanceDecision.reasons).toEqual(expect.arrayContaining([
      'unregistered_parameter_defaults_to_frozen_constant',
      'parameter_suggestion_runtime_decision_blocks_release',
    ]))
  })
})
