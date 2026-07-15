import { describe, expect, it } from 'vitest'

import {
  buildProjectScheduleState,
  inferDominantProjectRhythmState,
  selectApplicableProjectScheduleStates,
  selectEffectiveProjectScheduleState,
  toProjectScheduleStateRow,
} from '../services/projectScheduleStateService.js'

describe('projectScheduleStateService', () => {
  it('recognizes local organized acceleration and relaxes resource conflict instead of treating parallel density as delay pressure', () => {
    const state = buildProjectScheduleState({
      projectId: 'project-1',
      scopeType: 'building',
      scopeId: 'building-2',
      windowDays: 14,
      windowEndDate: '2027-08-15',
      previous: {
        progressDeltaWeightedDays: 18,
        completedPlannedDurationDays: 12,
        activeTaskCount: 18,
        updatedTaskCount: 14,
        snapshotCount: 7,
        parallelDensity: 1.2,
        blockerCount: 3,
        qualityAnomalyCount: 1,
        forecastDelayDays: 12,
        baselineDeviationDays: 8,
      },
      current: {
        progressDeltaWeightedDays: 34,
        completedPlannedDurationDays: 20,
        activeTaskCount: 24,
        updatedTaskCount: 22,
        snapshotCount: 8,
        parallelDensity: 1.8,
        blockerCount: 2,
        clearedBlockerCount: 2,
        qualityAnomalyCount: 1,
        resourcePressureScore: 5,
        forecastDelayDays: 8,
        baselineDeviationDays: 6,
        milestonePressureScore: 0.7,
      },
    })

    expect(state.state).toBe('accelerating')
    expect(state.localAccelerationFactor).toBeLessThan(1)
    expect(state.downstreamPolicy.canAdjustRemainingDuration).toBe(true)
    expect(state.downstreamPolicy.canRelaxResourceConflictPenalty).toBe(true)
    expect(state.downstreamPolicy.velocityFactorSupersedes).toBe(true)
    expect(state.downstreamPolicy.resourceConflictPenaltyMultiplier).toBeLessThan(1)
    expect(state.evidence.map((item) => item.code)).toEqual(expect.arrayContaining([
      'completion_throughput_up',
      'parallel_density_up',
      'planned_variance_recovering',
      'quality_anomaly_not_increasing',
    ]))
  })

  it('classifies dense parallel work with rising quality/resource pressure as overcompressed rather than acceleration', () => {
    const state = buildProjectScheduleState({
      projectId: 'project-1',
      scopeType: 'zone',
      scopeId: 'zone-a',
      windowDays: 14,
      previous: {
        progressDeltaWeightedDays: 20,
        completedPlannedDurationDays: 10,
        activeTaskCount: 12,
        updatedTaskCount: 10,
        snapshotCount: 6,
        parallelDensity: 1.1,
        blockerCount: 2,
        qualityAnomalyCount: 1,
        forecastDelayDays: 6,
      },
      current: {
        progressDeltaWeightedDays: 35,
        completedPlannedDurationDays: 16,
        activeTaskCount: 26,
        updatedTaskCount: 21,
        snapshotCount: 7,
        parallelDensity: 2.1,
        blockerCount: 4,
        qualityAnomalyCount: 5,
        progressQualityIssueCount: 2,
        resourcePressureScore: 9,
        forecastDelayDays: 7,
      },
    })

    expect(state.state).toBe('overcompressed')
    expect(state.localAccelerationFactor).toBeNull()
    expect(state.downstreamPolicy.canRelaxResourceConflictPenalty).toBe(false)
    expect(state.downstreamPolicy.resourceConflictPenaltyMultiplier).toBeGreaterThan(1)
    expect(state.evidence.map((item) => item.code)).toEqual(expect.arrayContaining([
      'quality_anomaly_up',
      'resource_pressure_high',
      'blockers_increasing',
    ]))
  })

  it('keeps cold-start windows confidence-only and does not leak short acceleration into forecasts', () => {
    const state = buildProjectScheduleState({
      projectId: 'project-1',
      scopeType: 'project',
      windowDays: 5,
      previous: { progressDeltaWeightedDays: 4, snapshotCount: 1, parallelDensity: 1 },
      current: { progressDeltaWeightedDays: 10, snapshotCount: 2, parallelDensity: 2, activeTaskCount: 10, updatedTaskCount: 8 },
    })

    expect(state.state).toBe('normal')
    expect(state.downstreamPolicy.actionPolicy).toBe('confidence_only')
    expect(state.downstreamPolicy.canAdjustRemainingDuration).toBe(false)
    expect(state.evidence.map((item) => item.code)).toContain('cold_start_window')
  })

  it('resolves scope conflicts by letting project-level blocked override local acceleration', () => {
    const localAcceleration = buildProjectScheduleState({
      projectId: 'project-1',
      scopeType: 'building',
      scopeId: 'building-2',
      windowDays: 14,
      previous: { progressDeltaWeightedDays: 10, completedPlannedDurationDays: 8, snapshotCount: 5, parallelDensity: 1, forecastDelayDays: 8 },
      current: { progressDeltaWeightedDays: 24, completedPlannedDurationDays: 14, snapshotCount: 6, activeTaskCount: 12, updatedTaskCount: 10, parallelDensity: 1.5, blockerCount: 0, qualityAnomalyCount: 0, forecastDelayDays: 4 },
    })
    const projectBlocked = buildProjectScheduleState({
      projectId: 'project-1',
      scopeType: 'project',
      scopeId: 'project',
      windowDays: 14,
      previous: { progressDeltaWeightedDays: 40, snapshotCount: 7, parallelDensity: 1.3, blockerCount: 2, forecastDelayDays: 12 },
      current: { progressDeltaWeightedDays: 20, snapshotCount: 7, activeTaskCount: 50, updatedTaskCount: 40, parallelDensity: 1.4, blockerCount: 7, hardBlockerCount: 2, resourcePressureScore: 9, forecastDelayDays: 18 },
    })

    expect(localAcceleration.state).toBe('accelerating')
    expect(projectBlocked.state).toBe('blocked')
    expect(selectEffectiveProjectScheduleState([localAcceleration, projectBlocked])).toBe(projectBlocked)
  })

  it('keeps applicable scope combinations so project normal, local acceleration, and specialty blocked can coexist', () => {
    const projectNormal = buildProjectScheduleState({
      projectId: 'project-1',
      scopeType: 'project',
      scopeId: 'project',
      windowDays: 14,
      previous: { progressDeltaWeightedDays: 20, snapshotCount: 6, parallelDensity: 1 },
      current: { progressDeltaWeightedDays: 22, snapshotCount: 7, activeTaskCount: 20, updatedTaskCount: 18, parallelDensity: 1.05 },
    })
    const localAcceleration = buildProjectScheduleState({
      projectId: 'project-1',
      scopeType: 'building',
      scopeId: 'building-2',
      windowDays: 14,
      previous: { progressDeltaWeightedDays: 10, completedPlannedDurationDays: 8, snapshotCount: 5, parallelDensity: 1, forecastDelayDays: 8 },
      current: { progressDeltaWeightedDays: 24, completedPlannedDurationDays: 14, snapshotCount: 6, activeTaskCount: 12, updatedTaskCount: 10, parallelDensity: 1.5, blockerCount: 0, qualityAnomalyCount: 0, forecastDelayDays: 4 },
    })
    const specialtyBlocked = buildProjectScheduleState({
      projectId: 'project-1',
      scopeType: 'specialty',
      scopeId: 'mep',
      windowDays: 14,
      previous: { progressDeltaWeightedDays: 24, snapshotCount: 7, parallelDensity: 1.1, blockerCount: 1, forecastDelayDays: 4 },
      current: { progressDeltaWeightedDays: 10, snapshotCount: 7, activeTaskCount: 15, updatedTaskCount: 12, parallelDensity: 1.4, blockerCount: 4, hardBlockerCount: 1, resourcePressureScore: 9, forecastDelayDays: 9 },
    })

    const applicable = selectApplicableProjectScheduleStates([projectNormal, localAcceleration, specialtyBlocked])

    expect(applicable.map((state) => `${state.scopeType}:${state.scopeId}:${state.state}`)).toEqual(expect.arrayContaining([
      'project:project:normal',
      'building:building-2:accelerating',
      'specialty:mep:blocked',
    ]))
  })

  it('uses critical path, milestone, and standard-floor rhythm throughput as precision acceleration signals', () => {
    const state = buildProjectScheduleState({
      projectId: 'project-1',
      scopeType: 'milestone_window',
      scopeId: 'handover-2027-09',
      windowDays: 14,
      previous: {
        progressDeltaWeightedDays: 10,
        criticalPathProgressDeltaWeightedDays: 6,
        milestoneProgressDeltaWeightedDays: 4,
        standardFloorProgressDeltaWeightedDays: 5,
        snapshotCount: 6,
        parallelDensity: 1,
        forecastDelayDays: 10,
      },
      current: {
        progressDeltaWeightedDays: 15,
        criticalPathProgressDeltaWeightedDays: 15,
        milestoneProgressDeltaWeightedDays: 10,
        standardFloorProgressDeltaWeightedDays: 12,
        snapshotCount: 7,
        activeTaskCount: 16,
        updatedTaskCount: 14,
        parallelDensity: 1.25,
        blockerCount: 0,
        qualityAnomalyCount: 0,
        forecastDelayDays: 6,
      },
    })

    expect(state.state).toBe('accelerating')
    expect(state.metrics.criticalPathThroughputRatio).toBeGreaterThan(1.3)
    expect(state.metrics.milestoneThroughputRatio).toBeGreaterThan(1.3)
    expect(state.metrics.standardFloorThroughputRatio).toBeGreaterThan(1.3)
    expect(state.evidence.map((item) => item.code)).toEqual(expect.arrayContaining([
      'critical_path_throughput_up',
      'milestone_window_throughput_up',
      'standard_floor_rhythm_throughput_up',
    ]))
  })

  it('identifies a project-level dominant rhythm without discarding local blocked and acceleration states', () => {
    const projectNormal = buildProjectScheduleState({
      projectId: 'project-1',
      scopeType: 'project',
      scopeId: 'project',
      windowDays: 14,
      previous: { progressDeltaWeightedDays: 20, snapshotCount: 6, parallelDensity: 1 },
      current: { progressDeltaWeightedDays: 22, snapshotCount: 7, activeTaskCount: 20, updatedTaskCount: 18, parallelDensity: 1.05 },
    })
    const buildingAcceleration = buildProjectScheduleState({
      projectId: 'project-1',
      scopeType: 'building',
      scopeId: 'building-2',
      windowDays: 14,
      previous: { progressDeltaWeightedDays: 10, completedPlannedDurationDays: 8, snapshotCount: 5, parallelDensity: 1, forecastDelayDays: 8 },
      current: {
        progressDeltaWeightedDays: 24,
        completedPlannedDurationDays: 14,
        standardFloorProgressDeltaWeightedDays: 12,
        snapshotCount: 6,
        activeTaskCount: 12,
        updatedTaskCount: 10,
        parallelDensity: 1.5,
        blockerCount: 0,
        qualityAnomalyCount: 0,
        forecastDelayDays: 4,
      },
    })
    const specialtyBlocked = buildProjectScheduleState({
      projectId: 'project-1',
      scopeType: 'specialty',
      scopeId: 'mep',
      windowDays: 14,
      previous: { progressDeltaWeightedDays: 24, snapshotCount: 7, parallelDensity: 1.1, blockerCount: 1, forecastDelayDays: 4 },
      current: { progressDeltaWeightedDays: 10, snapshotCount: 7, activeTaskCount: 15, updatedTaskCount: 12, parallelDensity: 1.4, blockerCount: 4, hardBlockerCount: 1, resourcePressureScore: 9, forecastDelayDays: 9 },
    })

    const dominant = inferDominantProjectRhythmState([projectNormal, buildingAcceleration, specialtyBlocked])

    expect(dominant).toEqual(expect.objectContaining({
      dominantRhythm: 'standard_floor_accelerating_with_local_blockers',
      primaryState: 'accelerating',
      actionPolicy: 'candidate_only',
    }))
    expect(dominant?.applicableStateScopes).toEqual(expect.arrayContaining([
      'project:project:normal',
      'building:building-2:accelerating',
      'specialty:mep:blocked',
    ]))
    expect(dominant?.blockedScopes).toEqual(['specialty:mep'])
    expect(dominant?.accelerationScopes).toEqual(['building:building-2'])
  })

  it('maps service results to the project_schedule_states audit row shape', () => {
    const state = buildProjectScheduleState({
      projectId: 'project-1',
      scopeType: 'specialty',
      scopeId: 'mep',
      windowDays: 14,
      windowEndDate: '2027-09-01',
      previous: { progressDeltaWeightedDays: 12, snapshotCount: 5, parallelDensity: 1, forecastDelayDays: 10 },
      current: { progressDeltaWeightedDays: 20, snapshotCount: 6, activeTaskCount: 8, updatedTaskCount: 7, parallelDensity: 1.2, blockerCount: 0, qualityAnomalyCount: 0, forecastDelayDays: 6 },
    })
    const row = toProjectScheduleStateRow(state)

    expect(row).toEqual(expect.objectContaining({
      project_id: 'project-1',
      scope_type: 'specialty',
      scope_id: 'mep',
      state: state.state,
      downstream_policy: state.downstreamPolicy,
      source: 'projectScheduleStateService',
    }))
  })
})
