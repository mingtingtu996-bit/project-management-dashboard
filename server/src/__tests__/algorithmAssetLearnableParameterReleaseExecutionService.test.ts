import { describe, expect, it } from 'vitest'

import {
  buildAlgorithmAssetLearnableParameterSuggestionRelease,
} from '../services/algorithmAssetLearnableParameterSuggestionService.js'
import {
  executeAlgorithmAssetLearnableParameterRuntimeRollback,
  persistAlgorithmAssetLearnableParameterRuntimePublication,
} from '../services/algorithmAssetLearnableParameterReleaseExecutionService.js'

function createRecordingQueryExec() {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    if (sql.includes('insert into public.algorithm_learnable_parameter_runtime_publications')) {
      return [{ id: 'runtime-publication-row-id' }] as T[]
    }
    return [] as T[]
  }
  return { calls, queryExec }
}

function joinedSql(calls: Array<{ sql: string }>) {
  return calls.map((call) => call.sql).join('\n').toLowerCase()
}

function readyParameterRelease() {
  return buildAlgorithmAssetLearnableParameterSuggestionRelease({
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
  }).releaseExit
}

describe('algorithmAssetLearnableParameterReleaseExecutionService', () => {
  it('persists a ready learnable parameter handoff as a scoped runtime publication and audit event', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await persistAlgorithmAssetLearnableParameterRuntimePublication({
      releaseExit: readyParameterRelease(),
      queryExec,
      executedAt: '2026-06-14T06:00:00.000Z',
      impactMonitoring: {
        monitoredAssetCount: 12,
        monitoringWindowHours: 48,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_parameter_published',
      canPersist: true,
      writesParameterRuntime: true,
      writesSeedRuntimeDirectly: false,
      publicationStatus: 'published',
      rollbackTarget: 'duration-blend-v1',
    }))
    expect(result.runtimePublication).toEqual(expect.objectContaining({
      parameterKey: 'duration.benchmark_blend_weight',
      targetSurface: 'company_override',
      scopeType: 'company',
      parameterValue: 0.58,
      previousValue: 0.55,
      impactMonitoring: expect.objectContaining({
        status: 'monitoring_armed',
        monitoredAssetCount: 12,
        monitoringWindowHours: 48,
      }),
    }))
    const sql = joinedSql(calls)
    expect(sql).toContain('insert into public.algorithm_learnable_parameter_runtime_publications')
    expect(sql).toContain('insert into public.algorithm_learnable_parameter_release_events')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('algorithm_seed_versions')
    expect(sql).not.toContain('algorithm_seed_overrides')
    expect(sql).not.toContain('standard_work_duration')
  })

  it('blocks non-ready parameter handoff packages without writing runtime tables', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    const reviewOnlyRelease = buildAlgorithmAssetLearnableParameterSuggestionRelease({
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
    }).releaseExit

    const result = await persistAlgorithmAssetLearnableParameterRuntimePublication({
      releaseExit: reviewOnlyRelease,
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'blocked',
      canPersist: false,
      writesParameterRuntime: false,
      writesSeedRuntimeDirectly: false,
    }))
    expect(result.reasons).toContain('release_exit_package_required')
    expect(calls).toHaveLength(0)
  })

  it('executes rollback by marking the parameter runtime publication rolled back and recording an audit event', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await executeAlgorithmAssetLearnableParameterRuntimeRollback({
      queryExec,
      sourcePublicationKey: 'parameter-publication:duration.benchmark_blend_weight:company-a',
      rollbackTarget: 'duration-blend-v1',
      reason: 'impact_monitoring_failed',
      executedAt: '2026-06-14T08:00:00.000Z',
    })

    expect(result).toEqual({
      status: 'rollback_executed',
      sourcePublicationKey: 'parameter-publication:duration.benchmark_blend_weight:company-a',
      rollbackTarget: 'duration-blend-v1',
      restoredRuntimePolicy: 'previous_parameter_value_retained',
      writesParameterRuntime: true,
      writesSeedRuntimeDirectly: false,
      reasons: [],
    })
    const sql = joinedSql(calls)
    expect(sql).toContain('update public.algorithm_learnable_parameter_runtime_publications')
    expect(sql).toContain('insert into public.algorithm_learnable_parameter_release_events')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('algorithm_seed_versions')
    expect(sql).not.toContain('algorithm_seed_overrides')
    expect(sql).not.toContain('standard_work_duration')
  })
})
