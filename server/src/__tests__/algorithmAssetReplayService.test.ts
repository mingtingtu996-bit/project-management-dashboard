import { describe, expect, it } from 'vitest'
import {
  evaluateAlgorithmAssetReplay,
  evaluateAndPersistAlgorithmAssetReplay,
} from '../services/algorithmAssetReplayService.js'

const improvingCompanySamples = [
  {
    sampleId: 'sample-1',
    companyId: 'company-a',
    originalPrediction: 10,
    actual: 12,
    overlayPrediction: 11,
  },
  {
    sampleId: 'sample-2',
    companyId: 'company-a',
    originalPrediction: 8,
    actual: 10,
    overlayPrediction: 9.5,
  },
  {
    sampleId: 'sample-3',
    companyId: 'company-a',
    originalPrediction: 5,
    actual: 6,
    overlayPrediction: 6,
  },
]

describe('algorithmAssetReplayService', () => {
  it('produces a unified replay summary that can feed the publish gate', () => {
    const result = evaluateAlgorithmAssetReplay({
      candidate: {
        assetKey: 'duration.context.rain_factor',
        sourceSystem: 'durationContextPolicyLearningService',
        assetType: 'calibration',
        companyId: 'company-a',
        candidatePayload: { factor: 1.08 },
        learningTarget: 'context_factor',
        learningMaturity: 'guarded_live_tuning',
        publishAnchor: 'guarded_runtime_auto_publish',
        automationMaturity: 'auto_publish',
        requestedRuntimeEffect: 'bounded_calibration',
      },
      samples: improvingCompanySamples,
      minAcceptedSamples: 3,
      rollbackTarget: 'rain-factor-v1',
      conflictFree: true,
      existingRules: [{
        assetKey: 'duration.context.rain_factor',
        stableCode: 'duration.context.rain_factor',
        lifecycleStatus: 'published',
        scopeType: 'company',
        companyId: 'company-a',
        runtimePublicationStatus: 'runtime_published',
        releaseRecordId: 'release-rain-factor-v1',
        runtimeWriterKey: 'durationContextRuntimeWriter',
        consumerVerificationRef: 'consumer-rain-factor-v1',
        impactMonitoringRef: 'monitor-rain-factor-v1',
        rollbackTarget: 'rain-factor-v1',
      }],
    })

    expect(result.summary).toEqual(expect.objectContaining({
      acceptedSampleCount: 3,
      rejectedSampleCount: 0,
      replayPassed: true,
      runtimeImpact: 'publish_gate_evidence',
    }))
    expect(result.summary.originalMae).toBeCloseTo(1.67, 2)
    expect(result.summary.overlayMae).toBeCloseTo(0.5, 2)
    expect(result.summary.maeImprovement).toBeCloseTo(1.17, 2)
    expect(result.summary.overcompensationRate).toBe(0)
    expect(result.rows[0]).toEqual(expect.objectContaining({
      originalPrediction: 10,
      actual: 12,
      originalError: 2,
      overlayPrediction: 11,
      overlayError: 1,
      maeImprovement: 1,
      runtimeImpact: 'publish_gate_evidence',
    }))
    expect(result.governanceEvidence).toEqual(expect.objectContaining({
      replayPassed: true,
      conflictFree: true,
      rollbackTarget: 'rain-factor-v1',
    }))
    expect(result.candidateEvent.lifecycleStatus).toBe('published_ready')
    expect(result.conflictArbitration?.result).toBe('supersede_with_rollback_target')
  })

  it('keeps replay evidence out of runtime when existing published state lacks publication evidence', () => {
    const result = evaluateAlgorithmAssetReplay({
      candidate: {
        assetKey: 'duration.context.legacy_weather_factor',
        sourceSystem: 'durationContextPolicyLearningService',
        assetType: 'calibration',
        companyId: 'company-a',
        candidatePayload: { factor: 1.08 },
        learningTarget: 'context_factor',
        learningMaturity: 'guarded_live_tuning',
        publishAnchor: 'guarded_runtime_auto_publish',
        automationMaturity: 'auto_publish',
        requestedRuntimeEffect: 'bounded_calibration',
      },
      samples: improvingCompanySamples,
      minAcceptedSamples: 3,
      rollbackTarget: 'weather-factor-v2',
      conflictFree: true,
      existingRules: [{
        assetKey: 'duration.context.legacy_weather_factor',
        stableCode: 'duration.context.legacy_weather_factor',
        lifecycleStatus: 'published',
        scopeType: 'company',
        companyId: 'company-a',
        rollbackTarget: 'legacy-weather-factor-v1',
      }],
    })

    expect(result.summary).toEqual(expect.objectContaining({
      replayPassed: true,
      runtimeImpact: 'review_required',
    }))
    expect(result.conflictArbitration).toEqual(expect.objectContaining({
      result: 'shadow_compare_only',
      runtimeRule: 'candidate_blocked_from_runtime',
      activeRuleContinues: false,
    }))
    expect(result.conflictArbitration?.reasons).toEqual(expect.arrayContaining([
      'existing_published_rule_missing_unified_publication_evidence',
      'existing_published_rule_requires_legacy_audit_before_runtime_arbitration',
    ]))
  })

  it('rejects replay samples outside the candidate company or project scope', () => {
    const result = evaluateAlgorithmAssetReplay({
      candidate: {
        assetKey: 'duration.context.site_pressure',
        sourceSystem: 'durationContextPolicyLearningService',
        assetType: 'calibration',
        companyId: 'company-a',
        projectId: 'project-a1',
        learningTarget: 'context_factor',
        learningMaturity: 'guarded_live_tuning',
        publishAnchor: 'guarded_runtime_auto_publish',
        automationMaturity: 'auto_publish',
        requestedRuntimeEffect: 'bounded_calibration',
      },
      samples: [
        {
          sampleId: 'accepted',
          companyId: 'company-a',
          projectId: 'project-a1',
          originalPrediction: 6,
          actual: 8,
          overlayPrediction: 7.5,
        },
        {
          sampleId: 'wrong-company',
          companyId: 'company-b',
          projectId: 'project-a1',
          originalPrediction: 6,
          actual: 8,
          overlayPrediction: 7,
        },
        {
          sampleId: 'wrong-project',
          companyId: 'company-a',
          projectId: 'project-a2',
          originalPrediction: 6,
          actual: 8,
          overlayPrediction: 7,
        },
        {
          sampleId: 'missing-scope',
          originalPrediction: 6,
          actual: 8,
          overlayPrediction: 7,
        },
      ],
      minAcceptedSamples: 2,
      rollbackTarget: 'site-pressure-v1',
      conflictFree: true,
    })

    expect(result.summary).toEqual(expect.objectContaining({
      acceptedSampleCount: 1,
      rejectedSampleCount: 3,
      replayPassed: false,
      runtimeImpact: 'review_required',
    }))
    expect(result.rejectedSamples.map((sample) => sample.reason)).toEqual([
      'scope_mismatch',
      'scope_mismatch',
      'missing_scope',
    ])
    expect(result.governanceEvidence.replayPassed).toBe(false)
    expect(result.candidateEvent.lifecycleStatus).toBe('review_required')
  })

  it('keeps shadow-report-only assets out of live runtime even when replay improves MAE', () => {
    const result = evaluateAlgorithmAssetReplay({
      candidate: {
        assetKey: 'forecast.residual.overlay',
        sourceSystem: 'taskDurationForecastService',
        assetType: 'signal',
        companyId: 'company-a',
        learningTarget: 'forecast_residual',
        learningMaturity: 'shadow_report_only',
        publishAnchor: 'guarded_runtime_auto_publish',
        automationMaturity: 'auto_publish',
        requestedRuntimeEffect: 'bounded_calibration',
      },
      samples: improvingCompanySamples,
      minAcceptedSamples: 3,
      rollbackTarget: 'forecast-overlay-v1',
      conflictFree: true,
    })

    expect(result.summary).toEqual(expect.objectContaining({
      replayPassed: true,
      runtimeImpact: 'shadow_report_only',
    }))
    expect(result.candidateEvent.lifecycleStatus).toBe('review_required')
    expect(result.candidateEvent.governanceDecision.canWriteRuntime).toBe(false)
    expect(result.candidateEvent.governanceDecision.reasons).toEqual(expect.arrayContaining([
      'shadow_report_only_replay_cannot_write_runtime',
    ]))
  })

  it('keeps existing manual-anchor published rules active after replay', () => {
    const result = evaluateAlgorithmAssetReplay({
      candidate: {
        assetKey: 'critical.path.manual.rule',
        sourceSystem: 'constructionDependencyRuleSystemService',
        assetType: 'rule',
        companyId: 'company-a',
        candidatePayload: { dependencyRule: 'A before B' },
        learningTarget: 'dependency_order',
        learningMaturity: 'governed_candidate',
        publishAnchor: 'guarded_runtime_auto_publish',
        automationMaturity: 'auto_publish',
        requestedRuntimeEffect: 'direct_effect_request',
      },
      samples: improvingCompanySamples,
      minAcceptedSamples: 3,
      rollbackTarget: 'dependency-v3',
      conflictFree: true,
      existingRules: [{
        assetKey: 'critical.path.manual.rule',
        stableCode: 'critical.path.manual.rule',
        lifecycleStatus: 'published',
        scopeType: 'company',
        companyId: 'company-a',
        publishAnchor: 'manual_review_required_before_publish',
        runtimePublicationStatus: 'runtime_published',
        releaseRecordId: 'release-dependency-v2',
        runtimeWriterKey: 'constructionDependencyRuleRuntimeWriter',
        consumerVerificationRef: 'consumer-dependency-v2',
        impactMonitoringRef: 'monitor-dependency-v2',
        rollbackTarget: 'dependency-v2',
      }],
    })

    expect(result.summary).toEqual(expect.objectContaining({
      replayPassed: true,
      runtimeImpact: 'existing_published_rule_continues',
    }))
    expect(result.conflictArbitration).toEqual(expect.objectContaining({
      result: 'manual_governance_required',
      activeRuleContinues: true,
    }))
  })

  it('can persist replay evaluation through the unified governance persistence contract', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('INSERT INTO public.algorithm_asset_candidate_events')) {
        return [{ id: 'candidate-row-id' }] as T[]
      }
      if (sql.includes('INSERT INTO public.algorithm_asset_replay_runs')) {
        return [{ id: 'replay-run-row-id' }] as T[]
      }
      return [] as T[]
    }

    const result = await evaluateAndPersistAlgorithmAssetReplay({
      runKey: 'duration-context-rain-replay',
      queryExec,
      candidate: {
        assetKey: 'duration.context.rain_factor',
        sourceSystem: 'durationContextPolicyLearningService',
        assetType: 'calibration',
        companyId: 'company-a',
        candidatePayload: { factor: 1.08 },
        learningTarget: 'context_factor',
        learningMaturity: 'guarded_live_tuning',
        publishAnchor: 'guarded_runtime_auto_publish',
        automationMaturity: 'auto_publish',
        requestedRuntimeEffect: 'bounded_calibration',
      },
      samples: improvingCompanySamples,
      minAcceptedSamples: 3,
      rollbackTarget: 'rain-factor-v1',
      conflictFree: true,
    })

    expect(result.evaluation.summary.runtimeImpact).toBe('publish_gate_evidence')
    expect(result.persistence).toEqual({
      persisted: true,
      candidateEventId: 'candidate-row-id',
      replayRunId: 'replay-run-row-id',
      replayResultCount: 3,
    })
    const sql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(sql).toContain('insert into public.algorithm_asset_candidate_events')
    expect(sql).toContain('insert into public.algorithm_asset_replay_runs')
    expect(sql).toContain('insert into public.algorithm_asset_replay_results')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('task_dependencies')
  })
})
