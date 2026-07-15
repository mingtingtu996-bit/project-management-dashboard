import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  evaluatePlanningReplayCalibration,
  persistPlanningReplayCalibrationReport,
  readPlanningReplayCalibrationReadback,
} from '../services/planningReplayCalibrationService.js'

const serviceSourcePath = fileURLToPath(new URL('../services/planningReplayCalibrationService.ts', import.meta.url))

const sharedSamples = [
  {
    sampleId: 'baseline-1',
    companyId: 'company-a',
    projectId: 'project-1',
    surface: 'baseline_generation' as const,
    standardWorkCode: 'STD-STRUCT-001',
    standardWorkName: '主体结构',
    originalPrediction: 10,
    actual: 13,
    replayPrediction: 12,
    projectType: 'residential',
    buildingPatternCode: 'tower',
    climateZone: 'hot_summer_cold_winter',
  },
  {
    sampleId: 'baseline-2',
    companyId: 'company-a',
    projectId: 'project-1',
    surface: 'baseline_generation' as const,
    standardWorkCode: 'STD-STRUCT-001',
    standardWorkName: '主体结构',
    originalPrediction: 8,
    actual: 10,
    replayPrediction: 9.5,
    projectType: 'hospital',
    buildingPatternCode: 'podium_tower',
    climateZone: 'hot_summer_warm_winter',
  },
  {
    sampleId: 'monthly-1',
    companyId: 'company-a',
    projectId: 'project-1',
    surface: 'monthly_plan_generation' as const,
    standardWorkCode: 'STD-STRUCT-001',
    standardWorkName: '主体结构',
    originalPrediction: 6,
    actual: 8,
    replayPrediction: 7.5,
    projectType: 'residential',
    buildingPatternCode: 'tower',
    climateZone: 'hot_summer_cold_winter',
  },
  {
    sampleId: 'monthly-2',
    companyId: 'company-a',
    projectId: 'project-1',
    surface: 'monthly_plan_generation' as const,
    standardWorkCode: 'STD-STRUCT-001',
    standardWorkName: '主体结构',
    originalPrediction: 9,
    actual: 11,
    replayPrediction: 10.5,
    projectType: 'hotel',
    buildingPatternCode: 'high_rise',
    climateZone: 'severe_cold',
  },
]

describe('planningReplayCalibrationService', () => {
  it('keeps production readback on a fixed SQL literal instead of a dynamic default executor', () => {
    const source = readFileSync(serviceSourcePath, 'utf8')

    expect(source).not.toContain('buildDefaultPlanningReplayReadbackQueryExec')
    expect(source).not.toContain('rawQuery(sql')
    expect(source).toContain('FROM public.algorithm_asset_replay_runs r')
  })

  it('uses one shared replay machine for baseline and monthly plan calibration candidates', () => {
    const report = evaluatePlanningReplayCalibration({
      companyId: 'company-a',
      projectId: 'project-1',
      samples: sharedSamples,
      minAcceptedSamplesPerProcess: 3,
      rollbackTarget: 'planning-replay-v1',
      conflictFree: true,
    })

    expect(report.status).toBe('planning_replay_calibration_ready')
    expect(report.policy).toEqual(expect.objectContaining({
      calibrationLoop: 'shared_baseline_and_monthly_plan',
      writePolicy: 'candidate_overlay_only_no_fact_mutation',
      groupingPolicy: 'coarse_process_first_no_project_type_building_climate_split_until_sample_depth',
    }))
    expect(report.consumerCoverage).toEqual(expect.objectContaining({
      unifiedMachine: true,
      servedSurfaces: ['baseline_generation', 'monthly_plan_generation'],
      baselineSampleCount: 2,
      monthlyPlanSampleCount: 2,
    }))
    expect(report.groups).toHaveLength(1)
    expect(report.groups[0]).toEqual(expect.objectContaining({
      coarseProcessKey: 'standard_work:STD-STRUCT-001',
      sampleGate: 'passed',
      acceptedSampleCount: 4,
      sourceSurfaces: ['baseline_generation', 'monthly_plan_generation'],
    }))
    expect(report.groups[0].replay.summary).toEqual(expect.objectContaining({
      acceptedSampleCount: 4,
      rejectedSampleCount: 0,
      replayPassed: true,
      runtimeImpact: 'review_required',
    }))
    expect(report.groups[0].suggestions.map((item) => item.target).sort()).toEqual([
      'capacity_parameter_adjustment',
      'e1_duration_adjustment',
      'e2_residual_correction',
      'e2_target_discount_adjustment',
      'priority_weight_adjustment',
      'seed_weight_adjustment',
    ].sort())
    expect(report.groups[0].replay.candidateEvent.candidatePayload).toEqual(expect.objectContaining({
      writePolicy: 'candidate_overlay_only_no_fact_mutation',
      forbiddenWriteTargets: expect.arrayContaining([
        'task_baselines',
        'monthly_plan_items',
        'tasks',
        'actual_duration_outcomes',
        'algorithm_seed_records',
      ]),
    }))
  })

  it('keeps coarse process grouping ahead of project type building pattern and climate splits', () => {
    const report = evaluatePlanningReplayCalibration({
      companyId: 'company-a',
      projectId: 'project-1',
      samples: sharedSamples,
      minAcceptedSamplesPerProcess: 3,
      rollbackTarget: 'planning-replay-v1',
      conflictFree: true,
    })

    expect(report.groups).toHaveLength(1)
    expect(report.groups[0].calibrationScope).toEqual(expect.objectContaining({
      level: 'coarse_process',
      deferredFineSplits: ['project_type', 'building_pattern', 'climate_zone', 'building', 'floor', 'zone'],
    }))
    expect(report.groups[0].sampleIds).toEqual([
      'baseline-1',
      'baseline-2',
      'monthly-1',
      'monthly-2',
    ])
  })

  it('blocks calibration suggestions when the coarse process sample gate is not met', () => {
    const report = evaluatePlanningReplayCalibration({
      companyId: 'company-a',
      projectId: 'project-1',
      samples: [sharedSamples[0]],
      minAcceptedSamplesPerProcess: 3,
      rollbackTarget: 'planning-replay-v1',
      conflictFree: true,
    })

    expect(report.status).toBe('planning_replay_calibration_needs_more_samples')
    expect(report.groups).toHaveLength(1)
    expect(report.groups[0]).toEqual(expect.objectContaining({
      sampleGate: 'blocked',
      acceptedSampleCount: 1,
      suggestions: [],
    }))
    expect(report.groups[0].replay.candidateEvent.governanceDecision.reasons).toEqual(expect.arrayContaining([
      'planning_replay_coarse_process_sample_gate_not_met',
    ]))
  })

  it('rejects samples without a coarse process identity instead of silently widening the bucket', () => {
    const report = evaluatePlanningReplayCalibration({
      companyId: 'company-a',
      samples: [{
        sampleId: 'missing-process',
        companyId: 'company-a',
        surface: 'baseline_generation',
        originalPrediction: 10,
        actual: 12,
        replayPrediction: 11,
      }],
      minAcceptedSamplesPerProcess: 1,
      rollbackTarget: 'planning-replay-v1',
      conflictFree: true,
    })

    expect(report.status).toBe('planning_replay_calibration_needs_more_samples')
    expect(report.groups).toEqual([])
    expect(report.rejectedSamples).toEqual([{
      sampleId: 'missing-process',
      reason: 'missing_coarse_process_identity',
    }])
  })

  it('keeps replay calibration out of business fact mutation targets', () => {
    const report = evaluatePlanningReplayCalibration({
      companyId: 'company-a',
      projectId: 'project-1',
      samples: sharedSamples,
      minAcceptedSamplesPerProcess: 3,
      rollbackTarget: 'planning-replay-v1',
      conflictFree: true,
    })

    expect(report.mutationPolicy).toEqual({
      writesRuntimeDirectly: false,
      writesFactsDirectly: false,
      writesSeedsDirectly: false,
      forbiddenWriteTargets: expect.arrayContaining([
        'task_baselines',
        'monthly_plans',
        'monthly_plan_items',
        'tasks',
        'task_dependencies',
        'critical_path_snapshots',
        'actual_duration_outcomes',
        'progress_snapshots',
        'algorithm_seed_records',
        'algorithm_seed_overrides',
      ]),
    })
  })

  it('persists shared planning replay evaluations as governance replay evidence', async () => {
    const report = evaluatePlanningReplayCalibration({
      companyId: 'company-a',
      projectId: 'project-1',
      samples: sharedSamples,
      minAcceptedSamplesPerProcess: 3,
      rollbackTarget: 'planning-replay-v1',
      conflictFree: true,
    })
    const calls: string[] = []
    const queryExec = async <T = any>(sql: string): Promise<T[]> => {
      calls.push(sql)
      if (sql.includes('algorithm_asset_candidate_events')) return [{ id: `candidate-${calls.length}` }] as T[]
      if (sql.includes('algorithm_asset_replay_runs')) return [{ id: `run-${calls.length}` }] as T[]
      return [] as T[]
    }

    const result = await persistPlanningReplayCalibrationReport({
      report,
      runKey: 'planning-replay-test',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      persistedGroupCount: 1,
      persistedReplayResultCount: 4,
      failedGroupCount: 0,
    }))
    const joinedSql = calls.join('\n')
    expect(joinedSql).toContain('algorithm_asset_candidate_events')
    expect(joinedSql).toContain('algorithm_asset_replay_runs')
    expect(joinedSql).toContain('algorithm_asset_replay_results')
  })

  it('reads back only passed bounded calibration evidence for baseline and monthly consumers', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const queryExec = async <T = any>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [
        {
          candidate_event_id: 'candidate-ok',
          replay_run_id: 'run-ok',
          asset_key: 'planning_replay_calibration:standard_work:STD-STRUCT-001',
          source_module: 'planningReplayCalibrationService',
          result_status: 'replay_passed',
          sample_count: 8,
          replay_summary: {
            acceptedSampleCount: 8,
            replayPassed: true,
            originalMae: 4,
            overlayMae: 2,
            maeImprovement: 2,
            overcompensationRate: 0.1,
          },
          candidate_payload: {
            coarseProcessKey: 'standard_work:STD-STRUCT-001',
            standardWorkCode: 'STD-STRUCT-001',
            sampleGate: 'passed',
            minAcceptedSamples: 5,
            acceptedSampleCount: 8,
            calibrationTargets: [
              'e1_duration_adjustment',
              'e2_residual_correction',
              'capacity_parameter_adjustment',
              'priority_weight_adjustment',
              'e2_target_discount_adjustment',
            ],
            writePolicy: 'candidate_overlay_only_no_fact_mutation',
          },
        },
        {
          candidate_event_id: 'candidate-small',
          replay_run_id: 'run-small',
          asset_key: 'planning_replay_calibration:standard_work:STD-STRUCT-001',
          source_module: 'planningReplayCalibrationService',
          result_status: 'replay_passed',
          sample_count: 1,
          replay_summary: {
            acceptedSampleCount: 1,
            replayPassed: true,
            originalMae: 4,
            overlayMae: 1,
            maeImprovement: 3,
            overcompensationRate: 0,
          },
          candidate_payload: {
            coarseProcessKey: 'standard_work:STD-STRUCT-001',
            standardWorkCode: 'STD-STRUCT-001',
            sampleGate: 'passed',
            minAcceptedSamples: 5,
            acceptedSampleCount: 1,
            calibrationTargets: ['e1_duration_adjustment'],
            writePolicy: 'candidate_overlay_only_no_fact_mutation',
          },
        },
        {
          candidate_event_id: 'candidate-over',
          replay_run_id: 'run-over',
          asset_key: 'planning_replay_calibration:standard_work:STD-STRUCT-001',
          source_module: 'planningReplayCalibrationService',
          result_status: 'replay_passed',
          sample_count: 8,
          replay_summary: {
            acceptedSampleCount: 8,
            replayPassed: true,
            originalMae: 4,
            overlayMae: 2,
            maeImprovement: 2,
            overcompensationRate: 0.6,
          },
          candidate_payload: {
            coarseProcessKey: 'standard_work:STD-STRUCT-001',
            standardWorkCode: 'STD-STRUCT-001',
            sampleGate: 'passed',
            minAcceptedSamples: 5,
            acceptedSampleCount: 8,
            calibrationTargets: ['capacity_parameter_adjustment'],
            writePolicy: 'candidate_overlay_only_no_fact_mutation',
          },
        },
      ] as T[]
    }

    const readback = await readPlanningReplayCalibrationReadback({
      projectId: 'project-1',
      standardWorkCode: 'STD-STRUCT-001',
      queryExec,
    })

    expect(calls[0].sql).toContain('algorithm_asset_replay_runs')
    expect(calls[0].sql).toContain('algorithm_asset_candidate_events')
    expect(calls[0].params).toEqual(['project-1', 'standard_work:STD-STRUCT-001'])
    expect(readback.status).toBe('ready')
    expect(readback.evidenceRefs).toEqual(['algorithm_asset_candidate_events:candidate-ok', 'algorithm_asset_replay_runs:run-ok'])
    expect(readback.e1DurationAdjustmentDays).toBe(2)
    expect(readback.e2ResidualCorrectionDays).toBe(2)
    expect(readback.capacityBudgetFactor).toBe(0.9)
    expect(readback.priorityWeightAdjustment).toBe(0.1)
    expect(readback.e2TargetDiscountFactor).toBe(0.9)
    expect(readback.rejectedEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ candidateEventId: 'candidate-small', reason: 'sample_gate_not_met' }),
      expect.objectContaining({ candidateEventId: 'candidate-over', reason: 'overcompensation_guardrail_exceeded' }),
    ]))
    expect(readback.writePolicy).toBe('candidate_overlay_only_no_fact_mutation')
  })
})
