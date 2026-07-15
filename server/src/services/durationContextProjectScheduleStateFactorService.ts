import { logger } from '../middleware/logger.js'
import {
  loadApplicableProjectScheduleStates,
  type ProjectScheduleStateResult,
} from './projectScheduleStateService.js'
import type {
  DurationContextActionPolicy,
  DurationContextFactor,
  DurationContextInput,
} from '../types/durationContext.js'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readNumber(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function readBoolean(value: unknown, fallback = false) {
  if (value === true || value === 1 || value === 'true' || value === '1') return true
  if (value === false || value === 0 || value === 'false' || value === '0') return false
  return fallback
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function selectPrimaryProjectScheduleState(states: ProjectScheduleStateResult[]) {
  if (states.length === 0) return null
  return states[0] ?? null
}

function combineProjectScheduleStatePolicy(states: ProjectScheduleStateResult[]) {
  const blockingState = states.find((state) => (
    ['blocked', 'overcompressed'].includes(state.state)
    && state.confidence >= 0.65
  ))
  const positiveStates = states.filter((state) => (
    (state.state === 'accelerating' || state.state === 'recovery')
    && state.downstreamPolicy.canAdjustRemainingDuration
    && Number(state.downstreamPolicy.localAccelerationFactor ?? state.localAccelerationFactor ?? 1) < 1
  ))
  const primary = blockingState ?? selectPrimaryProjectScheduleState(states)
  const positiveFactor = blockingState
    ? null
    : positiveStates
      .map((state) => Number(state.downstreamPolicy.localAccelerationFactor ?? state.localAccelerationFactor ?? 1))
      .filter((factor) => Number.isFinite(factor) && factor > 0 && factor < 1)
      .sort((left, right) => left - right)[0] ?? null

  const canAdjustRemainingDuration = Boolean(!blockingState && positiveFactor && primary?.confidence && primary.confidence >= 0.7)
  const canRelaxResourceConflictPenalty = Boolean(!blockingState && positiveStates.some((state) => state.downstreamPolicy.canRelaxResourceConflictPenalty))
  const resourceConflictPenaltyMultiplier = canRelaxResourceConflictPenalty
    ? Math.min(...positiveStates
      .map((state) => Number(state.downstreamPolicy.resourceConflictPenaltyMultiplier ?? 1))
      .filter((factor) => Number.isFinite(factor) && factor > 0), 1)
    : blockingState?.state === 'overcompressed'
      ? 1.1
      : 1

  return {
    primary,
    blockingState,
    positiveStates,
    localAccelerationFactor: canAdjustRemainingDuration ? positiveFactor : null,
    canAdjustRemainingDuration,
    canRelaxResourceConflictPenalty,
    velocityFactorSupersedes: canAdjustRemainingDuration && positiveStates.some((state) => state.downstreamPolicy.velocityFactorSupersedes),
    resourceConflictPenaltyMultiplier,
    maxForwardDays: canAdjustRemainingDuration
      ? Math.min(...positiveStates.map((state) => Math.max(1, Number(state.downstreamPolicy.maxForwardDays || 14))))
      : 0,
  }
}

function scheduleScopeWeight(state: ProjectScheduleStateResult) {
  const baseByScope: Record<string, number> = {
    project: 0.35,
    building: 0.7,
    floor_group: 0.8,
    zone: 0.9,
    specialty: 0.85,
    milestone_window: 0.95,
  }
  const stateBoost = state.state === 'blocked' || state.state === 'overcompressed'
    ? 1.15
    : state.state === 'accelerating' || state.state === 'recovery'
      ? 1
      : 0.65
  return Number(((baseByScope[state.scopeType] ?? 0.5) * clamp(state.confidence, 0.2, 1) * stateBoost).toFixed(3))
}

function buildProjectScheduleStateComposition(
  states: ProjectScheduleStateResult[],
  combined: ReturnType<typeof combineProjectScheduleStatePolicy>,
) {
  const stateRows = states.map((state) => ({
    scopeKey: `${state.scopeType}:${state.scopeId}`,
    scopeType: state.scopeType,
    scopeId: state.scopeId,
    state: state.state,
    confidence: state.confidence,
    weight: scheduleScopeWeight(state),
    localAccelerationFactor: state.downstreamPolicy.localAccelerationFactor ?? state.localAccelerationFactor ?? null,
    throughputRatio: state.throughputRatio,
    criticalPathThroughputRatio: state.metrics.criticalPathThroughputRatio,
    milestoneThroughputRatio: state.metrics.milestoneThroughputRatio,
    standardFloorThroughputRatio: state.metrics.standardFloorThroughputRatio,
  }))
  const acceleratingRows = stateRows.filter((state) => state.state === 'accelerating' || state.state === 'recovery')
  const blockingRows = stateRows.filter((state) => state.state === 'blocked' || state.state === 'overcompressed')
  const weightedAcceleration = acceleratingRows
    .map((state) => {
      const multiplier = Number(state.localAccelerationFactor ?? 1)
      return Number.isFinite(multiplier) && multiplier > 0 && multiplier < 1
        ? { multiplier, weight: state.weight }
        : null
    })
    .filter((item): item is { multiplier: number; weight: number } => Boolean(item))
  const totalWeight = weightedAcceleration.reduce((sum, item) => sum + item.weight, 0)
  const weightedMultiplier = blockingRows.length > 0 || weightedAcceleration.length === 0
    ? 1
    : clamp(
      weightedAcceleration.reduce((sum, item) => sum + item.multiplier * item.weight, 0) / Math.max(0.001, totalWeight),
      0.85,
      1,
    )
  const effectiveState = combined.blockingState?.state
    ?? (combined.positiveStates.find((state) => state.state === 'accelerating')?.state
      ?? combined.positiveStates.find((state) => state.state === 'recovery')?.state
      ?? combined.primary?.state
      ?? 'normal')
  return {
    policy: 'scope_weighted_composition_blocking_scope_overrides_local_acceleration',
    effectiveState,
    effectiveScopeKey: combined.primary ? `${combined.primary.scopeType}:${combined.primary.scopeId}` : null,
    weightedMultiplier: Number(weightedMultiplier.toFixed(3)),
    acceleratingScopes: acceleratingRows.map((state) => state.scopeKey),
    blockingScopes: blockingRows.map((state) => state.scopeKey),
    states: stateRows,
  }
}

export async function buildProjectScheduleStateFactor(input: DurationContextInput): Promise<DurationContextFactor | null> {
  const projectId = normalizeId(input.projectId)
  if (!projectId) return null

  let states: ProjectScheduleStateResult[] = []
  try {
    states = await loadApplicableProjectScheduleStates({
      projectId,
      scopeIds: [
        input.buildingObjectId,
        input.floorObjectId,
        input.zoneObjectId,
        input.standardWorkCode,
        input.standardWorkName,
        input.templateNodeId,
        input.engineeringCategoryId,
      ],
      limit: 6,
    })
  } catch (error) {
    logger.warn('[durationContextProjectScheduleStateFactorService] failed to load project schedule state', {
      projectId,
      taskId: input.taskId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }

  if (states.length === 0) return null

  const combined = combineProjectScheduleStatePolicy(states)
  const composition = buildProjectScheduleStateComposition(states, combined)
  const state = combined.primary
  if (!state) return null
  const canAdjust = combined.canAdjustRemainingDuration
  const confidenceOnly = !canAdjust || state.downstreamPolicy.confidenceOnly || state.state === 'normal' || state.state === 'low_confidence'
  const multiplier = canAdjust ? clamp(Number(composition.weightedMultiplier ?? combined.localAccelerationFactor ?? 1), 0.85, 1) : 1
  const confidenceDelta = state.state === 'low_confidence'
    ? -10
    : combined.blockingState || state.state === 'blocked' || state.state === 'overcompressed'
      ? -6
      : canAdjust || state.state === 'accelerating' || state.state === 'recovery'
        ? 2
        : 0
  const stateReason: Record<string, string> = {
    accelerating: 'Project schedule state shows organized local acceleration: throughput is rising while quality and blockers are controlled, so remaining duration may use a short-term positive correction.',
    recovery: 'Project schedule state shows recovery after blockers or delay pressure eased, so remaining duration may use a bounded short-term correction.',
    blocked: 'Project schedule state is blocked at project or local scope; keep this as schedule-state explanation and confidence context.',
    overcompressed: 'Project schedule state shows overcompressed parallel work; do not treat dense workfaces as effective acceleration.',
    low_confidence: 'Project schedule state confidence is low because progress facts are incomplete or noisy.',
    normal: 'Project schedule state is normal and is kept as explanation only.',
  }

  return {
    key: 'project_schedule_state',
    label: 'project schedule state',
    multiplier,
    extraDays: 0,
    confidenceDelta,
    actionPolicy: confidenceOnly ? 'confidence_only' : 'candidate_only',
    dataDependencies: ['project_schedule_states', 'task_progress_snapshots', 'project_daily_snapshot', 'task_duration_forecasts'],
    reason: stateReason[state.state] ?? stateReason.normal,
    source: 'project_schedule_state',
    metadata: {
      state: state.state,
      scopeType: state.scopeType,
      scopeId: state.scopeId,
      confidence: state.confidence,
      windowDays: state.windowDays,
      windowStartDate: state.windowStartDate,
      windowEndDate: state.windowEndDate,
      localAccelerationFactor: state.localAccelerationFactor,
      throughputRatio: state.throughputRatio,
      parallelDensityRatio: state.parallelDensityRatio,
      deviationRecoveryDays: state.deviationRecoveryDays,
      downstreamPolicy: {
        ...state.downstreamPolicy,
        canAdjustRemainingDuration: combined.canAdjustRemainingDuration,
        canRelaxResourceConflictPenalty: combined.canRelaxResourceConflictPenalty,
        velocityFactorSupersedes: combined.velocityFactorSupersedes,
        resourceConflictPenaltyMultiplier: combined.resourceConflictPenaltyMultiplier,
        localAccelerationFactor: combined.localAccelerationFactor,
        maxForwardDays: combined.maxForwardDays,
      },
      canRelaxResourceConflictPenalty: combined.canRelaxResourceConflictPenalty,
      resourceConflictPenaltyMultiplier: combined.resourceConflictPenaltyMultiplier,
      velocityFactorSupersedes: combined.velocityFactorSupersedes,
      maxForwardDays: combined.maxForwardDays,
      scheduleStateComposition: composition,
      applicableStates: states.map((item) => ({
        state: item.state,
        scopeType: item.scopeType,
        scopeId: item.scopeId,
        confidence: item.confidence,
        localAccelerationFactor: item.localAccelerationFactor,
        throughputRatio: item.throughputRatio,
        criticalPathThroughputRatio: item.metrics.criticalPathThroughputRatio,
        milestoneThroughputRatio: item.metrics.milestoneThroughputRatio,
        standardFloorThroughputRatio: item.metrics.standardFloorThroughputRatio,
      })),
      positiveStateScopes: combined.positiveStates.map((item) => `${item.scopeType}:${item.scopeId}`),
      blockingStateScope: combined.blockingState ? `${combined.blockingState.scopeType}:${combined.blockingState.scopeId}` : null,
      evidence: state.evidence,
      metrics: state.metrics,
    },
  }
}

export function applyProjectScheduleStatePolicy(factors: DurationContextFactor[]): DurationContextFactor[] {
  const stateFactor = factors.find((factor) => factor.key === 'project_schedule_state')
  if (!stateFactor) return factors
  const metadata = readRecord(stateFactor.metadata)
  const downstreamPolicy = readRecord(metadata.downstreamPolicy)
  const canRelaxResourceConflict = readBoolean(
    metadata.canRelaxResourceConflictPenalty ?? downstreamPolicy.canRelaxResourceConflictPenalty ?? downstreamPolicy.can_relax_resource_conflict_penalty,
    false,
  )
  const resourcePenaltyMultiplier = clamp(readNumber(
    metadata.resourceConflictPenaltyMultiplier
      ?? downstreamPolicy.resourceConflictPenaltyMultiplier
      ?? downstreamPolicy.resource_conflict_penalty_multiplier,
    1,
  ), 0.4, 1.5)
  const velocitySupersedes = readBoolean(
    metadata.velocityFactorSupersedes ?? downstreamPolicy.velocitySupersedes ?? downstreamPolicy.velocity_factor_supersedes,
    false,
  )
  const state = normalizeText(metadata.state)

  return factors.map((factor): DurationContextFactor => {
    if (factor.key === 'resource_conflict' && canRelaxResourceConflict && resourcePenaltyMultiplier < 1) {
      const relaxedMultiplier = factor.actionPolicy === 'confidence_only'
        ? factor.multiplier
        : Number((1 + ((Math.max(1, factor.multiplier) - 1) * resourcePenaltyMultiplier)).toFixed(3))
      const relaxedExtraDays = Math.max(0, Math.floor(Number(factor.extraDays ?? 0) * resourcePenaltyMultiplier))
      const relaxedConfidenceDelta = factor.confidenceDelta < 0
        ? Math.round(factor.confidenceDelta * Math.max(0.5, resourcePenaltyMultiplier))
        : factor.confidenceDelta
      return {
        ...factor,
        multiplier: relaxedMultiplier,
        extraDays: relaxedExtraDays,
        confidenceDelta: relaxedConfidenceDelta,
        reason: `${factor.reason} Project schedule state indicates organized acceleration/recovery, so parallel-density pressure is relaxed instead of being treated as confirmed resource delay.`,
        metadata: {
          ...(factor.metadata ?? {}),
          projectScheduleStatePolicyApplied: true,
          projectScheduleState: state,
          projectScheduleStateScopeType: metadata.scopeType ?? null,
          projectScheduleStateScopeId: metadata.scopeId ?? null,
          originalMultiplier: factor.multiplier,
          originalExtraDays: factor.extraDays,
          resourceConflictPenaltyMultiplier: resourcePenaltyMultiplier,
          relaxationReason: 'throughput_up_quality_and_blockers_controlled',
        },
      }
    }
    if (factor.key === 'progress_velocity' && velocitySupersedes && Number(factor.multiplier ?? 1) < 1) {
      return {
        ...factor,
        multiplier: 1,
        confidenceDelta: Math.min(factor.confidenceDelta, 0),
        actionPolicy: 'confidence_only' as DurationContextActionPolicy,
        reason: 'Project schedule state already accounts for short-term acceleration, so task-level ahead-of-curve velocity is kept as explanation only to avoid double counting.',
        metadata: {
          ...(factor.metadata ?? {}),
          projectScheduleStatePolicyApplied: true,
          projectScheduleState: state,
          supersededByProjectScheduleState: true,
          originalMultiplier: factor.multiplier,
          originalActionPolicy: factor.actionPolicy,
        },
      }
    }
    if (factor.key === 'progress_velocity' && ['blocked', 'overcompressed', 'low_confidence'].includes(state)) {
      return {
        ...factor,
        metadata: {
          ...(factor.metadata ?? {}),
          projectScheduleStatePolicyObserved: true,
          projectScheduleState: state,
        },
      }
    }
    return factor
  })
}
