import { describe, expect, it } from 'vitest'

import {
  buildRuntimeExecutionInference,
} from '../services/runtimeExecutionInferenceService.js'
import type { ProjectScheduleStateResult } from '../services/projectScheduleStateService.js'

describe('runtimeExecutionInferenceService', () => {
  it('commercializes resource pressure, parallel density, milestone pressure, and evidence as inferred runtime facts without requiring site-only inputs', () => {
    const inference = buildRuntimeExecutionInference({
      projectId: 'project-1',
      asOfDate: '2026-06-14',
      windowDays: 14,
      rows: [
        {
          id: 'critical-structure',
          status: 'in_progress',
          progress: 35,
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-06-20',
          is_critical: true,
          total_float_days: 0,
          free_float_days: 0,
        },
        {
          id: 'mep-blocked',
          status: 'blocked',
          progress: 10,
          planned_start_date: '2026-06-05',
          planned_end_date: '2026-06-18',
          total_float_days: 2,
          free_float_days: 1,
        },
        {
          id: 'handover-milestone',
          status: 'todo',
          progress: 0,
          planned_end_date: '2026-06-19',
          is_milestone: true,
          total_float_days: 1,
        },
      ],
      scheduleState: {
        projectId: 'project-1',
        scopeType: 'project',
        scopeId: 'project',
        state: 'blocked',
        confidence: 0.78,
        windowDays: 14,
        windowStartDate: '2026-06-01',
        windowEndDate: '2026-06-14',
        localAccelerationFactor: null,
        throughputRatio: 0.72,
        parallelDensityRatio: 1.42,
        deviationRecoveryDays: -6,
        evidence: [
          { code: 'critical_path_throughput_down', label: 'Critical path throughput down', weight: 0.9, value: 0.62 },
          { code: 'parallel_density_up', label: 'Parallel density up', weight: 0.65, value: 1.42 },
          { code: 'milestone_pressure', label: 'Milestone pressure', weight: 0.55, value: 0.72 },
          { code: 'resource_pressure_high', label: 'Resource pressure high', weight: 0.8, value: 9 },
        ],
        downstreamPolicy: {
          canAdjustRemainingDuration: true,
          canExplainDeviation: true,
          canRelaxResourceConflictPenalty: false,
          velocityFactorSupersedes: false,
          resourceConflictPenaltyMultiplier: 1.2,
          localAccelerationFactor: null,
          maxForwardDays: 0,
          confidenceOnly: false,
          actionPolicy: 'candidate_only',
        },
        metrics: {
          previousThroughput: 20,
          currentThroughput: 12,
          previousCriticalPathThroughput: 10,
          currentCriticalPathThroughput: 6,
          criticalPathThroughputRatio: 0.6,
          previousMilestoneThroughput: 4,
          currentMilestoneThroughput: 2,
          milestoneThroughputRatio: 0.5,
          previousStandardFloorThroughput: 0,
          currentStandardFloorThroughput: 0,
          standardFloorThroughputRatio: 1,
          previousParallelDensity: 1,
          currentParallelDensity: 1.42,
          blockerTrend: 2,
          hardBlockerCount: 1,
          qualityAnomalyTrend: 0,
          resourcePressureScore: 9,
          dataQualityScore: 0.82,
        },
      },
    })

    expect(inference.sourcePolicy).toBe('existing_execution_state_only')
    expect(inference.inputPolicy.requiredUserSiteInputs).toEqual([])
    expect(inference.inputPolicy.forbiddenSyntheticInputs).toEqual(expect.arrayContaining([
      'crewCount',
      'actualWorkfaceCount',
      'towerCraneUtilizationHours',
    ]))
    expect(inference.commercialReadiness.status).toBe('commercial_ready')
    expect(inference.facts).toEqual(expect.objectContaining({
      resourcePressureScore: 9,
      parallelDensityRatio: 1.42,
      milestonePressureScore: 0.72,
      scheduleState: 'blocked',
      hardBlockerCount: 1,
    }))
    expect(inference.facts.evidenceCodes).toEqual(expect.arrayContaining([
      'resource_pressure_high',
      'parallel_density_up',
      'milestone_pressure',
      'runtime_inference_commercial_ready',
    ]))
    expect(inference.facts.runtimeInferenceSummary).toEqual(expect.objectContaining({
      factType: 'inferred',
      sourcePolicy: 'existing_execution_state_only',
      confidence: expect.any(Number),
    }))
    expect(inference.evidenceObjects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'resource_pressure_high',
        factType: 'inferred',
        strength: 'inferred',
        sourceType: 'project_schedule_state_window',
        sourceIds: expect.arrayContaining(['critical-structure', 'mep-blocked', 'handover-milestone']),
        scope: { type: 'project', id: 'project' },
        windowDays: 14,
        confidence: expect.any(Number),
        boundaryPolicy: expect.arrayContaining([
          'does_not_require_manual_site_resource_inputs',
          'does_not_rewrite_task_dates_or_static_project_facts',
        ]),
        contributions: expect.arrayContaining([
          expect.objectContaining({ code: 'critical_path_throughput_down' }),
          expect.objectContaining({ code: 'blocker_pressure' }),
        ]),
      }),
      expect.objectContaining({
        code: 'milestone_pressure',
        sourceType: 'project_schedule_state_window',
        contributions: expect.arrayContaining([
          expect.objectContaining({ code: 'milestone_due_soon' }),
        ]),
      }),
    ]))
  })

  it('downgrades inferred runtime facts to advisory when execution updates are too sparse', () => {
    const inference = buildRuntimeExecutionInference({
      projectId: 'project-1',
      asOfDate: '2026-06-14',
      windowDays: 14,
      rows: [
        {
          id: 'task-no-progress',
          status: 'todo',
          progress: 0,
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-06-20',
        },
      ],
      scheduleState: null,
    })

    expect(inference.commercialReadiness.status).toBe('advisory_only')
    expect(inference.facts.runtimeInferenceSummary).toEqual(expect.objectContaining({
      factType: 'inferred',
      confidence: expect.any(Number),
      impactBoundary: 'confidence_only',
    }))
    expect(inference.facts.evidenceCodes).toEqual(expect.arrayContaining([
      'runtime_inference_advisory_only',
      'execution_update_sparse',
    ]))
    expect(inference.evidenceObjects.every((item) => item.boundaryPolicy.includes('confidence_only_when_source_window_is_sparse'))).toBe(true)
  })

  it('normalizes schedule-state evidence without optional label or weight before exposing runtime facts', () => {
    const incompleteScheduleState = {
      metrics: {
        hardBlockerCount: 0,
        resourcePressureScore: 0.4,
      },
      evidence: [{ code: 'milestone_pressure', value: 0.7 }],
      parallelDensityRatio: 0.3,
      deviationRecoveryDays: -8,
      state: 'recovery',
      localAccelerationFactor: 0.9,
    } as unknown as ProjectScheduleStateResult

    const inference = buildRuntimeExecutionInference({
      projectId: 'project-1',
      asOfDate: '2026-06-14',
      rows: [
        {
          id: 'critical-task',
          status: 'todo',
          progress: 0,
          planned_end_date: '2026-06-20',
          is_critical: true,
        },
      ],
      scheduleState: incompleteScheduleState,
    })

    const contributions = inference.evidenceObjects.flatMap((item) => item.contributions)
    expect(contributions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'milestone_pressure',
        label: 'milestone_pressure',
        weight: 0,
        value: 0.7,
      }),
    ]))
    expect(contributions.every((item) => Number.isFinite(item.weight))).toBe(true)
  })
})
