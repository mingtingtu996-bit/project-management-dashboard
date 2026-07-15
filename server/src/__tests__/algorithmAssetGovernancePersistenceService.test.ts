import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { createAlgorithmAssetCandidateEvent } from '../services/algorithmAssetCandidateEventAdapterService.js'
import { evaluateAlgorithmAssetForecastResidualOverlay } from '../services/algorithmAssetForecastResidualOverlayService.js'
import {
  persistAlgorithmAssetCandidateEvent,
  persistAlgorithmAssetColdStartBaseline,
  persistAlgorithmAssetForecastResidualOverlayEvaluation,
  persistAlgorithmAssetReplayEvaluation,
  persistAlgorithmAssetSampleHealthReport,
  rollbackAlgorithmAssetColdStartBaselineRuntimePublicationRecord,
} from '../services/algorithmAssetGovernancePersistenceService.js'
import { evaluateAlgorithmAssetReplay } from '../services/algorithmAssetReplayService.js'
import { buildAlgorithmAssetSampleHealthReport } from '../services/algorithmAssetSampleHealthService.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'

function createRecordingQueryExec() {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    if (sql.includes('INSERT INTO public.algorithm_asset_candidate_events')) {
      return [{ id: 'candidate-event-row-id' }] as T[]
    }
    if (sql.includes('INSERT INTO public.algorithm_asset_replay_runs')) {
      return [{ id: 'replay-run-row-id' }] as T[]
    }
    if (sql.includes('INSERT INTO public.duration_forecast_residual_overlays')) {
      return [{ id: 'overlay-row-id' }] as T[]
    }
    if (sql.includes('INSERT INTO public.algorithm_cold_start_baselines')) {
      return [{ id: 'cold-start-baseline-row-id' }] as T[]
    }
    return [] as T[]
  }
  return { calls, queryExec }
}

function joinedSql(calls: Array<{ sql: string }>) {
  return calls.map((call) => call.sql).join('\n')
}

function expectNoRuntimeMutationSql(calls: Array<{ sql: string }>) {
  const sql = joinedSql(calls).toLowerCase()
  expect(sql).not.toContain('insert into public.algorithm_seed_records')
  expect(sql).not.toContain('insert into public.algorithm_seed_versions')
  expect(sql).not.toContain('insert into public.algorithm_seed_overrides')
  expect(sql).not.toContain('insert into public.task_dependencies')
  expect(sql).not.toContain('update public.standard_work_duration')
}

const serviceSourcePath = fileURLToPath(new URL('../services/algorithmAssetGovernancePersistenceService.ts', import.meta.url))

describe('algorithmAssetGovernancePersistenceService', () => {
  it('keeps the production governance persistence path on fixed SQL literals', () => {
    const source = readFileSync(serviceSourcePath, 'utf8')

    expect(source).not.toContain('buildDefaultQueryExec')
    expect(source).not.toContain('queryExec ??')
    expect(source).toContain('createAlgorithmAssetGovernanceQueryExec')
    expect(source).toContain('INSERT INTO public.algorithm_asset_candidate_events')
    expect(source).toContain('UPDATE public.algorithm_cold_start_baselines')
  })

  it('persists normalized candidate events with explicit scope and four governance fields', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    const event = createAlgorithmAssetCandidateEvent({
      assetKey: 'duration.context.rain_factor',
      sourceSystem: 'durationContextPolicyLearningService',
      assetType: 'calibration',
      companyId: COMPANY_ID,
      candidatePayload: { factor: 1.08 },
      learningTarget: 'context_factor',
      learningMaturity: 'governed_candidate',
      publishAnchor: 'manual_review_required_before_publish',
      automationMaturity: 'auto_review_package',
      requestedRuntimeEffect: 'bounded_calibration',
    })

    const result = await persistAlgorithmAssetCandidateEvent({ event, queryExec })

    expect(result).toEqual({
      persisted: true,
      candidateEventId: 'candidate-event-row-id',
    })
    expect(joinedSql(calls)).toContain('INSERT INTO public.algorithm_asset_candidate_events')
    expect(calls[0].params).toEqual(expect.arrayContaining([
      'duration.context.rain_factor',
      'durationContextPolicyLearningService',
      'company',
      COMPANY_ID,
      null,
      'context_factor',
      'governed_candidate',
      'manual_governance_required',
      'auto_review_package',
    ]))
    expectNoRuntimeMutationSql(calls)
  })

  it('persists experience tier fields as first-class candidate event columns while keeping JSON compatibility', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    const event = createAlgorithmAssetCandidateEvent({
      assetKey: 'duration.process.actual_sample',
      sourceSystem: 'durationExperienceService',
      assetType: 'calibration',
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      candidatePayload: {
        experienceTier: 'T1',
        experienceAssetType: 'process_duration',
        sampleCount: 12,
      },
      learningTarget: 'base_duration',
      learningMaturity: 'governed_candidate',
      publishAnchor: 'manual_review_required_before_publish',
      automationMaturity: 'auto_review_package',
      requestedRuntimeEffect: 'bounded_calibration',
    })

    await persistAlgorithmAssetCandidateEvent({ event, queryExec })

    const sql = joinedSql(calls)
    expect(sql).toContain('experience_tier')
    expect(sql).toContain('experience_asset_type')
    expect(calls[0].params.slice(-2)).toEqual(['T1', 'process_duration'])
    expect(calls[0].params[11]).toEqual(expect.objectContaining({
      experienceTier: 'T1',
      experienceAssetType: 'process_duration',
    }))
    expectNoRuntimeMutationSql(calls)
  })

  it('keeps unknown-scope candidate events as system observations instead of company runtime assets', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    const event = createAlgorithmAssetCandidateEvent({
      assetKey: 'llm.generated.rule',
      sourceSystem: 'llmGovernanceDraft',
      assetType: 'rule',
      candidatePayload: { rule: 'draft only' },
      generatedBy: 'llm',
      requestedRuntimeEffect: 'direct_effect_request',
    })

    await persistAlgorithmAssetCandidateEvent({ event, queryExec })

    expect(calls[0].params).toEqual(expect.arrayContaining([
      'system',
      null,
      null,
      'governance_report',
      'shadow_report_only',
      'candidate_only',
      'manual_required',
    ]))
    expectNoRuntimeMutationSql(calls)
  })

  it('strips legacy scope-object fields before candidate payload persistence', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    const event = createAlgorithmAssetCandidateEvent({
      assetKey: 'legacy.scope.candidate',
      sourceSystem: 'legacyScopeImport',
      assetType: 'rule',
      companyId: COMPANY_ID,
      candidatePayload: {
        factor: 1.08,
        zone_object_id: 'old-zone-1',
        nested: {
          scope_dimensions: [{ type: 'zone', value: 'A区' }],
          keep: 'business-context',
        },
      },
      learningTarget: 'context_factor',
      learningMaturity: 'governed_candidate',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'legacy-scope-candidate-v1',
      },
    })

    await persistAlgorithmAssetCandidateEvent({ event, queryExec })

    expect(event.lifecycleStatus).toBe('quarantined')
    const persistedPayload = calls[0].params[11] as Record<string, unknown>
    expect(persistedPayload).toEqual({
      factor: 1.08,
      nested: {
        keep: 'business-context',
      },
    })
    expect(JSON.stringify(persistedPayload)).not.toContain('zone_object_id')
    expect(JSON.stringify(persistedPayload)).not.toContain('scope_dimensions')
    expect(calls[0].params[12]).toEqual(expect.objectContaining({
      reasons: expect.arrayContaining(['legacy_scope_object_field_detected']),
      sanitizedLegacyScopeFields: expect.arrayContaining(['zone_object_id', 'scope_dimensions']),
    }))
  })

  it('persists replay runs and replay rows without turning report-only evidence into runtime mutations', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    const evaluation = evaluateAlgorithmAssetReplay({
      candidate: {
        assetKey: 'forecast.residual.overlay',
        sourceSystem: 'taskDurationForecastService',
        assetType: 'signal',
        companyId: COMPANY_ID,
        learningTarget: 'forecast_residual',
        learningMaturity: 'shadow_report_only',
        publishAnchor: 'guarded_runtime_auto_publish',
        automationMaturity: 'auto_publish',
        requestedRuntimeEffect: 'bounded_calibration',
      },
      samples: [
        { sampleId: 's1', companyId: COMPANY_ID, originalPrediction: 10, actual: 12, overlayPrediction: 11 },
        { sampleId: 's2', companyId: COMPANY_ID, originalPrediction: 8, actual: 10, overlayPrediction: 9 },
        { sampleId: 's3', companyId: COMPANY_ID, originalPrediction: 5, actual: 6, overlayPrediction: 6 },
      ],
      minAcceptedSamples: 3,
      rollbackTarget: 'forecast-overlay-v1',
      conflictFree: true,
    })

    const result = await persistAlgorithmAssetReplayEvaluation({
      runKey: 'forecast-residual-shadow-run',
      evaluation,
      queryExec,
    })

    expect(result).toEqual({
      persisted: true,
      candidateEventId: 'candidate-event-row-id',
      replayRunId: 'replay-run-row-id',
      replayResultCount: 3,
    })
    expect(joinedSql(calls)).toContain('INSERT INTO public.algorithm_asset_candidate_events')
    expect(joinedSql(calls)).toContain('INSERT INTO public.algorithm_asset_replay_runs')
    expect(joinedSql(calls)).toContain('INSERT INTO public.algorithm_asset_replay_results')
    expect(calls.some((call) => call.params.includes('shadow_report_only'))).toBe(true)
    expectNoRuntimeMutationSql(calls)
  })

  it('persists accepted weak and rejected sample health events with reasons instead of silently discarding them', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    const report = buildAlgorithmAssetSampleHealthReport({
      samples: [
        {
          sampleId: 'accepted-1',
          companyId: COMPANY_ID,
          projectId: PROJECT_ID,
          workCode: 'WBS-001',
          actualStartDate: '2026-05-01',
          actualEndDate: '2026-05-03',
          qualitySignal: 'verified',
        },
        {
          sampleId: 'weak-1',
          companyId: COMPANY_ID,
          projectId: PROJECT_ID,
          workCode: 'WBS-002',
          plannedStartDate: '2026-05-01',
          completionEventAt: '2026-05-05',
          status: 'completed',
          qualitySignal: 'low_confidence_match',
        },
        {
          sampleId: 'rejected-1',
          companyId: COMPANY_ID,
          projectId: PROJECT_ID,
          workCode: '',
          actualStartDate: '2026-05-10',
          actualEndDate: '2026-05-08',
          qualitySignal: 'unusable',
        },
      ],
    })

    const result = await persistAlgorithmAssetSampleHealthReport({
      assetKey: 'duration.sample.health',
      sourceModule: 'durationExperienceService',
      learningTarget: 'base_duration',
      report,
      queryExec,
    })

    expect(result).toEqual({
      persisted: true,
      sampleHealthEventCount: 3,
    })
    expect(joinedSql(calls)).toContain('INSERT INTO public.algorithm_sample_health_events')
    expect(calls.map((call) => call.params[8])).toEqual(['accepted', 'weak', 'rejected'])
    expect(calls[1].params[10]).toBe('actual_start_derived_from_planned_start,actual_end_derived_from_completion_event,low_confidence_match')
    expect(calls[2].params[9]).toBe('missing_work_code,date_anomaly,quality_unusable')
    expectNoRuntimeMutationSql(calls)
  })

  it('persists forecast residual overlays only to the residual overlay table and never to base duration seeds', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    const evaluation = evaluateAlgorithmAssetForecastResidualOverlay({
      assetKey: 'forecast.residual.company',
      companyId: COMPANY_ID,
      modelKey: 'taskDurationForecastService',
      modelVersion: 'v1',
      learningMaturity: 'guarded_live_tuning',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      rollbackTarget: 'forecast-residual-v1',
      conflictFree: true,
      minAcceptedSamples: 3,
      samples: [
        {
          sampleId: 'f1',
          companyId: COMPANY_ID,
          originalForecastFinishDate: '2026-05-10',
          overlayForecastFinishDate: '2026-05-11',
          actualFinishDate: '2026-05-12',
        },
        {
          sampleId: 'f2',
          companyId: COMPANY_ID,
          originalForecastFinishDate: '2026-05-09',
          overlayForecastFinishDate: '2026-05-10',
          actualFinishDate: '2026-05-10',
        },
        {
          sampleId: 'f3',
          companyId: COMPANY_ID,
          originalForecastFinishDate: '2026-05-07',
          overlayForecastFinishDate: '2026-05-06',
          actualFinishDate: '2026-05-06',
        },
      ],
    })

    const result = await persistAlgorithmAssetForecastResidualOverlayEvaluation({
      overlayKey: 'forecast-residual-company-v1',
      evaluation,
      queryExec,
    })

    expect(result).toEqual({
      persisted: true,
      overlayId: 'overlay-row-id',
    })
    expect(joinedSql(calls)).toContain('INSERT INTO public.duration_forecast_residual_overlays')
    expect(calls[0].params).toEqual(expect.arrayContaining([
      'forecast-residual-company-v1',
      'forecast_residual_overlay_runtime:forecast-residual-company-v1',
      'forecast.residual.company',
      'company',
      COMPANY_ID,
      null,
      'forecast_residual',
      'guarded_live_tuning',
      'guarded_runtime_auto_publish',
      'auto_publish',
      false,
      'duration_forecast_residual_overlays',
    ]))
    expectNoRuntimeMutationSql(calls)
  })

  it('persists only eligible anonymized shared cold-start baselines without writing seed or company runtime tables', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await persistAlgorithmAssetColdStartBaseline({
      baselineKey: 'standard_work_duration:wall-plaster',
      segmentKey: 'residential:interior:wall-plaster',
      value: 10,
      updateInput: {
        baselineScope: 'segment_baseline',
        anonymizationPolicy: 'k_anonymous_multi_company',
        contributingCompanyCount: 5,
        minCompanyCount: 3,
        contributingProjectCount: 18,
        minProjectCount: 10,
        singleCompanyShare: 0.28,
        maxSingleCompanyShare: 0.4,
        sourceAggregation: 'aggregate_summary_only',
        rollbackTarget: 'cold-start-baseline:v1',
      },
      applicableScenarioKeys: ['residential', 'interior'],
      disabledScenarioKeys: ['industrial-heavy'],
      evidenceSummary: {
        source: 'algorithmAssetColdStartBaselineService',
        sampleWindowDays: 90,
      },
      queryExec,
    })

    expect(result).toEqual({
      status: 'persisted',
      baselineId: 'cold-start-baseline-row-id',
      persisted: true,
      reasons: [],
    })
    expect(joinedSql(calls)).toContain('INSERT INTO public.algorithm_cold_start_baselines')
    expect(calls[0].params).toEqual(expect.arrayContaining([
      'standard_work_duration:wall-plaster',
      'residential:interior:wall-plaster',
      'segment_baseline',
      'base_duration',
      'system_curated_learning',
      'system_curated_publish',
      'manual_required',
      'anonymized_multi_company_aggregation',
      3,
      10,
      0.4,
    ]))
    expect(calls[0].params).toContainEqual(expect.objectContaining({
      source: 'algorithmAssetColdStartBaselineService',
      sampleWindowDays: 90,
      anonymizationPolicy: 'k_anonymous_multi_company',
      contributingCompanyCount: 5,
      contributingProjectCount: 18,
      singleCompanyShare: 0.28,
      sourceAggregation: 'aggregate_summary_only',
    }))
    expect(calls[0].params).toContainEqual({ rollbackTarget: 'cold-start-baseline:v1' })
    expectNoRuntimeMutationSql(calls)
  })

  it('blocks contaminated cold-start baseline persistence before any database write', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await persistAlgorithmAssetColdStartBaseline({
      baselineKey: 'standard_work_duration:wall-plaster',
      segmentKey: 'residential:interior:wall-plaster',
      value: 10,
      updateInput: {
        baselineScope: 'segment_baseline',
        anonymizationPolicy: 'none',
        contributingCompanyCount: 1,
        minCompanyCount: 3,
        contributingProjectCount: 8,
        minProjectCount: 10,
        singleCompanyShare: 1,
        maxSingleCompanyShare: 0.4,
        sourceAggregation: 'contains_private_details',
        consumesCompanyOverrides: true,
        consumesProjectSampleDetails: true,
        consumesCandidateResults: true,
        consumesReplaySamples: true,
      },
      applicableScenarioKeys: ['residential'],
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'blocked',
      baselineId: null,
      persisted: false,
      reasons: expect.arrayContaining([
        'anonymized_multi_company_policy_required',
        'aggregate_summary_only_required',
        'shared_baseline_requires_multi_company_aggregation',
        'single_company_samples_cannot_update_shared_baseline',
        'project_count_below_shared_baseline_threshold',
        'single_company_share_exceeds_cap',
        'rollback_target_required',
        'company_override_read_forbidden',
        'project_sample_detail_read_forbidden',
        'candidate_result_read_forbidden',
        'replay_sample_detail_read_forbidden',
      ]),
    }))
    expect(calls).toEqual([])
  })

  it('rolls back cold-start baseline runtime publication without writing seeds or company overrides', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('UPDATE public.algorithm_cold_start_baselines')) {
        return [{ id: 'cold-start-baseline-row-id', baseline_key: 'standard_work_duration:wall-plaster' }] as T[]
      }
      return [] as T[]
    }

    const result = await rollbackAlgorithmAssetColdStartBaselineRuntimePublicationRecord({
      baselineKey: 'standard_work_duration:wall-plaster',
      segmentKey: 'residential:interior:wall-plaster',
      rollbackTarget: 'cold-start-baseline:v1',
      reason: 'impact_monitoring_regression',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'rollback_executed',
      baselineKey: 'standard_work_duration:wall-plaster',
      segmentKey: 'residential:interior:wall-plaster',
      rollbackTarget: 'cold-start-baseline:v1',
      writesSharedBaseline: true,
      writesCompanyOverride: false,
      writesBaseDurationSeed: false,
      reasons: [],
    }))

    const sql = joinedSql(calls).toLowerCase()
    expect(sql).toContain('update public.algorithm_cold_start_baselines')
    expect(sql).toContain("runtime_publication_status = 'runtime_rolled_back'")
    expect(sql).toContain('rollback_execution')
    expect(sql).toContain('rolled_back_at')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('algorithm_seed_versions')
    expect(sql).not.toContain('algorithm_seed_overrides')
    expect(sql).not.toContain('standard_work_duration')
  })
})
