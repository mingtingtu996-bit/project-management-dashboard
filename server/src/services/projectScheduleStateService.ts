import { supabase } from './dbService.js'

export type ProjectScheduleScopeType =
  | 'project'
  | 'building'
  | 'floor_group'
  | 'zone'
  | 'specialty'
  | 'milestone_window'

export type ProjectScheduleState =
  | 'normal'
  | 'accelerating'
  | 'recovery'
  | 'blocked'
  | 'overcompressed'
  | 'low_confidence'

export type ProjectScheduleStateEvidenceCode =
  | 'completion_throughput_up'
  | 'completion_throughput_down'
  | 'critical_path_throughput_up'
  | 'critical_path_throughput_down'
  | 'milestone_window_throughput_up'
  | 'milestone_window_throughput_down'
  | 'standard_floor_rhythm_throughput_up'
  | 'standard_floor_rhythm_throughput_down'
  | 'planned_variance_recovering'
  | 'planned_variance_worsening'
  | 'parallel_density_up'
  | 'blockers_cleared'
  | 'blockers_increasing'
  | 'hard_blocker_present'
  | 'quality_anomaly_not_increasing'
  | 'quality_anomaly_up'
  | 'resource_pressure_high'
  | 'resource_pressure_controlled'
  | 'milestone_pressure'
  | 'cold_start_window'
  | 'data_quality_low'

export interface ProjectScheduleStateWindowMetrics {
  progressDeltaWeightedDays?: number | null
  completedPlannedDurationDays?: number | null
  completedTaskCount?: number | null
  criticalPathProgressDeltaWeightedDays?: number | null
  criticalPathCompletedPlannedDurationDays?: number | null
  criticalPathCompletedTaskCount?: number | null
  milestoneProgressDeltaWeightedDays?: number | null
  milestoneCompletedPlannedDurationDays?: number | null
  milestoneCompletedTaskCount?: number | null
  standardFloorProgressDeltaWeightedDays?: number | null
  standardFloorCompletedPlannedDurationDays?: number | null
  standardFloorCompletedTaskCount?: number | null
  activeTaskCount?: number | null
  updatedTaskCount?: number | null
  snapshotCount?: number | null
  parallelDensity?: number | null
  blockerCount?: number | null
  hardBlockerCount?: number | null
  clearedBlockerCount?: number | null
  resourcePressureScore?: number | null
  qualityAnomalyCount?: number | null
  progressQualityIssueCount?: number | null
  forecastDelayDays?: number | null
  baselineDeviationDays?: number | null
  milestonePressureScore?: number | null
  dataQualityScore?: number | null
}

export interface ProjectScheduleStateInput {
  projectId: string | null
  scopeType: ProjectScheduleScopeType
  scopeId?: string | null
  windowDays?: number | null
  windowStartDate?: string | null
  windowEndDate?: string | null
  previous: ProjectScheduleStateWindowMetrics
  current: ProjectScheduleStateWindowMetrics
  options?: {
    minWindowDays?: number
    minSnapshotCount?: number
    accelerationThroughputRatio?: number
    recoveryThroughputRatio?: number
    blockedThroughputRatio?: number
    parallelDensityRatio?: number
    overcompressedParallelDensityRatio?: number
    highResourcePressureScore?: number
    minConfidenceForAdjustment?: number
    maxForwardDays?: number
  }
}

export interface ProjectScheduleStateEvidence {
  code: ProjectScheduleStateEvidenceCode
  label: string
  weight: number
  value?: number | string | boolean | null
}

export interface ProjectScheduleStateDownstreamPolicy {
  canAdjustRemainingDuration: boolean
  canExplainDeviation: boolean
  canRelaxResourceConflictPenalty: boolean
  velocityFactorSupersedes: boolean
  resourceConflictPenaltyMultiplier: number
  localAccelerationFactor: number | null
  maxForwardDays: number
  confidenceOnly: boolean
  actionPolicy: 'candidate_only' | 'confidence_only'
}

export interface ProjectScheduleStateResult {
  projectId: string | null
  scopeType: ProjectScheduleScopeType
  scopeId: string
  state: ProjectScheduleState
  confidence: number
  windowDays: number
  windowStartDate: string | null
  windowEndDate: string | null
  localAccelerationFactor: number | null
  throughputRatio: number
  parallelDensityRatio: number
  deviationRecoveryDays: number
  evidence: ProjectScheduleStateEvidence[]
  downstreamPolicy: ProjectScheduleStateDownstreamPolicy
  metrics: {
    previousThroughput: number
    currentThroughput: number
    previousCriticalPathThroughput: number
    currentCriticalPathThroughput: number
    criticalPathThroughputRatio: number
    previousMilestoneThroughput: number
    currentMilestoneThroughput: number
    milestoneThroughputRatio: number
    previousStandardFloorThroughput: number
    currentStandardFloorThroughput: number
    standardFloorThroughputRatio: number
    previousParallelDensity: number
    currentParallelDensity: number
    blockerTrend: number
    hardBlockerCount: number
    qualityAnomalyTrend: number
    resourcePressureScore: number
    dataQualityScore: number
  }
}

export interface DominantProjectRhythmState {
  dominantRhythm:
    | 'blocked_project_rhythm'
    | 'overcompressed_project_rhythm'
    | 'standard_floor_accelerating_with_local_blockers'
    | 'critical_path_or_milestone_accelerating'
    | 'local_acceleration'
    | 'recovery_rhythm'
    | 'normal_project_rhythm'
    | 'low_confidence_rhythm'
  primaryState: ProjectScheduleState
  confidence: number
  actionPolicy: 'candidate_only' | 'confidence_only'
  applicableStateScopes: string[]
  accelerationScopes: string[]
  blockedScopes: string[]
  evidenceCodes: ProjectScheduleStateEvidenceCode[]
}

type ProjectScheduleStateDbRow = {
  project_id?: string | null
  scope_type?: string | null
  scope_id?: string | null
  state?: string | null
  confidence_score?: number | string | null
  window_days?: number | string | null
  window_start_date?: string | null
  window_end_date?: string | null
  local_acceleration_factor?: number | string | null
  throughput_ratio?: number | string | null
  parallel_density_ratio?: number | string | null
  deviation_recovery_days?: number | string | null
  evidence?: unknown
  downstream_policy?: unknown
  metrics?: unknown
}

const DEFAULT_OPTIONS = {
  minWindowDays: 7,
  minSnapshotCount: 3,
  accelerationThroughputRatio: 1.3,
  recoveryThroughputRatio: 1.15,
  blockedThroughputRatio: 0.75,
  parallelDensityRatio: 1.1,
  overcompressedParallelDensityRatio: 1.35,
  highResourcePressureScore: 8,
  minConfidenceForAdjustment: 0.7,
  maxForwardDays: 14,
}

function normalizeNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text.slice(0, 10)
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeEvidenceValue(value: unknown): ProjectScheduleStateEvidence['value'] {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
    return value as ProjectScheduleStateEvidence['value']
  }
  return String(value)
}

function normalizeScopeType(value: unknown): ProjectScheduleScopeType | null {
  const text = normalizeText(value)
  if (['project', 'building', 'floor_group', 'zone', 'specialty', 'milestone_window'].includes(text)) {
    return text as ProjectScheduleScopeType
  }
  return null
}

function normalizeState(value: unknown): ProjectScheduleState | null {
  const text = normalizeText(value)
  if (['normal', 'accelerating', 'recovery', 'blocked', 'overcompressed', 'low_confidence'].includes(text)) {
    return text as ProjectScheduleState
  }
  return null
}

function normalizeEvidence(value: unknown): ProjectScheduleStateEvidence[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): ProjectScheduleStateEvidence | null => {
      const record = readRecord(item)
      const code = normalizeText(record.code)
      if (!code) return null
      return {
        code: code as ProjectScheduleStateEvidenceCode,
        label: normalizeText(record.label) || code,
        weight: normalizeNumber(record.weight, 0),
        value: normalizeEvidenceValue(record.value),
      }
    })
    .filter((item): item is ProjectScheduleStateEvidence => item !== null)
}

function normalizeDownstreamPolicy(value: unknown, state: ProjectScheduleState): ProjectScheduleStateDownstreamPolicy {
  const record = readRecord(value)
  const localFactor = normalizeNumber(record.localAccelerationFactor ?? record.local_acceleration_factor, NaN)
  const hasLocalFactor = Number.isFinite(localFactor) && localFactor > 0 && localFactor <= 1
  return {
    canAdjustRemainingDuration: Boolean(record.canAdjustRemainingDuration ?? record.can_adjust_remaining_duration),
    canExplainDeviation: record.canExplainDeviation === false || record.can_explain_deviation === false ? false : true,
    canRelaxResourceConflictPenalty: Boolean(record.canRelaxResourceConflictPenalty ?? record.can_relax_resource_conflict_penalty),
    velocityFactorSupersedes: Boolean(record.velocityFactorSupersedes ?? record.velocity_factor_supersedes),
    resourceConflictPenaltyMultiplier: normalizeNumber(
      record.resourceConflictPenaltyMultiplier ?? record.resource_conflict_penalty_multiplier,
      state === 'overcompressed' ? 1.1 : 1,
    ),
    localAccelerationFactor: hasLocalFactor ? round(localFactor) : null,
    maxForwardDays: Math.max(0, Math.trunc(normalizeNumber(record.maxForwardDays ?? record.max_forward_days, 0))),
    confidenceOnly: Boolean(record.confidenceOnly ?? record.confidence_only),
    actionPolicy: normalizeText(record.actionPolicy ?? record.action_policy) === 'candidate_only'
      ? 'candidate_only'
      : 'confidence_only',
  }
}

function mapProjectScheduleStateRow(row: ProjectScheduleStateDbRow): ProjectScheduleStateResult | null {
  const scopeType = normalizeScopeType(row.scope_type)
  const state = normalizeState(row.state)
  if (!scopeType || !state) return null
  const downstreamPolicy = normalizeDownstreamPolicy(row.downstream_policy, state)
  const localFactor = normalizeNumber(row.local_acceleration_factor, NaN)

  return {
    projectId: normalizeId(row.project_id),
    scopeType,
    scopeId: normalizeId(row.scope_id) ?? 'project',
    state,
    confidence: clamp(normalizeNumber(row.confidence_score, 0), 0, 1),
    windowDays: Math.max(1, Math.trunc(normalizeNumber(row.window_days, 14))),
    windowStartDate: normalizeDate(row.window_start_date),
    windowEndDate: normalizeDate(row.window_end_date),
    localAccelerationFactor: Number.isFinite(localFactor) && localFactor > 0 && localFactor <= 1
      ? round(localFactor)
      : downstreamPolicy.localAccelerationFactor,
    throughputRatio: normalizeNumber(row.throughput_ratio, 1),
    parallelDensityRatio: normalizeNumber(row.parallel_density_ratio, 1),
    deviationRecoveryDays: normalizeNumber(row.deviation_recovery_days, 0),
    evidence: normalizeEvidence(row.evidence),
    downstreamPolicy,
    metrics: {
      previousThroughput: normalizeNumber(readRecord(row.metrics).previousThroughput ?? readRecord(row.metrics).previous_throughput, 0),
      currentThroughput: normalizeNumber(readRecord(row.metrics).currentThroughput ?? readRecord(row.metrics).current_throughput, 0),
      previousCriticalPathThroughput: normalizeNumber(readRecord(row.metrics).previousCriticalPathThroughput ?? readRecord(row.metrics).previous_critical_path_throughput, 0),
      currentCriticalPathThroughput: normalizeNumber(readRecord(row.metrics).currentCriticalPathThroughput ?? readRecord(row.metrics).current_critical_path_throughput, 0),
      criticalPathThroughputRatio: normalizeNumber(readRecord(row.metrics).criticalPathThroughputRatio ?? readRecord(row.metrics).critical_path_throughput_ratio, 1),
      previousMilestoneThroughput: normalizeNumber(readRecord(row.metrics).previousMilestoneThroughput ?? readRecord(row.metrics).previous_milestone_throughput, 0),
      currentMilestoneThroughput: normalizeNumber(readRecord(row.metrics).currentMilestoneThroughput ?? readRecord(row.metrics).current_milestone_throughput, 0),
      milestoneThroughputRatio: normalizeNumber(readRecord(row.metrics).milestoneThroughputRatio ?? readRecord(row.metrics).milestone_throughput_ratio, 1),
      previousStandardFloorThroughput: normalizeNumber(readRecord(row.metrics).previousStandardFloorThroughput ?? readRecord(row.metrics).previous_standard_floor_throughput, 0),
      currentStandardFloorThroughput: normalizeNumber(readRecord(row.metrics).currentStandardFloorThroughput ?? readRecord(row.metrics).current_standard_floor_throughput, 0),
      standardFloorThroughputRatio: normalizeNumber(readRecord(row.metrics).standardFloorThroughputRatio ?? readRecord(row.metrics).standard_floor_throughput_ratio, 1),
      previousParallelDensity: normalizeNumber(readRecord(row.metrics).previousParallelDensity ?? readRecord(row.metrics).previous_parallel_density, 0),
      currentParallelDensity: normalizeNumber(readRecord(row.metrics).currentParallelDensity ?? readRecord(row.metrics).current_parallel_density, 0),
      blockerTrend: normalizeNumber(readRecord(row.metrics).blockerTrend ?? readRecord(row.metrics).blocker_trend, 0),
      hardBlockerCount: normalizeNumber(readRecord(row.metrics).hardBlockerCount ?? readRecord(row.metrics).hard_blocker_count, 0),
      qualityAnomalyTrend: normalizeNumber(readRecord(row.metrics).qualityAnomalyTrend ?? readRecord(row.metrics).quality_anomaly_trend, 0),
      resourcePressureScore: normalizeNumber(readRecord(row.metrics).resourcePressureScore ?? readRecord(row.metrics).resource_pressure_score, 0),
      dataQualityScore: normalizeNumber(readRecord(row.metrics).dataQualityScore ?? readRecord(row.metrics).data_quality_score, 1),
    },
  }
}

function normalizedScopeToken(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function matchesScheduleStateScope(row: ProjectScheduleStateResult, scopeTokens: Set<string>) {
  if (row.scopeType === 'project') return true
  const scopeId = normalizedScopeToken(row.scopeId)
  return Boolean(scopeId && scopeTokens.has(scopeId))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, precision = 3) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function positive(value: unknown) {
  return Math.max(0, normalizeNumber(value, 0))
}

function baseThroughput(metrics: ProjectScheduleStateWindowMetrics) {
  return positive(metrics.progressDeltaWeightedDays)
    + positive(metrics.completedPlannedDurationDays)
    + positive(metrics.completedTaskCount) * 0.35
}

function scopedThroughput(metrics: ProjectScheduleStateWindowMetrics, prefix: 'criticalPath' | 'milestone' | 'standardFloor') {
  if (prefix === 'criticalPath') {
    return positive(metrics.criticalPathProgressDeltaWeightedDays)
      + positive(metrics.criticalPathCompletedPlannedDurationDays)
      + positive(metrics.criticalPathCompletedTaskCount) * 0.35
  }
  if (prefix === 'milestone') {
    return positive(metrics.milestoneProgressDeltaWeightedDays)
      + positive(metrics.milestoneCompletedPlannedDurationDays)
      + positive(metrics.milestoneCompletedTaskCount) * 0.35
  }
  return positive(metrics.standardFloorProgressDeltaWeightedDays)
    + positive(metrics.standardFloorCompletedPlannedDurationDays)
    + positive(metrics.standardFloorCompletedTaskCount) * 0.35
}

function throughputProfile(metrics: ProjectScheduleStateWindowMetrics) {
  const base = baseThroughput(metrics)
  const criticalPath = scopedThroughput(metrics, 'criticalPath')
  const milestone = scopedThroughput(metrics, 'milestone')
  const standardFloor = scopedThroughput(metrics, 'standardFloor')
  return {
    base,
    criticalPath,
    milestone,
    standardFloor,
    composite: round(base + criticalPath * 0.55 + milestone * 0.45 + standardFloor * 0.35),
  }
}

function ratio(current: number, previous: number) {
  if (previous <= 0.1) return current > 0 ? 1 + Math.min(1, current / 10) : 1
  return round(current / previous)
}

function dataQuality(input: ProjectScheduleStateInput) {
  const explicit = normalizeNumber(input.current.dataQualityScore, NaN)
  if (Number.isFinite(explicit)) return clamp(explicit, 0, 1)
  const snapshotCount = positive(input.current.snapshotCount)
  const updatedTaskCount = positive(input.current.updatedTaskCount)
  const activeTaskCount = Math.max(1, positive(input.current.activeTaskCount))
  const snapshotScore = clamp(snapshotCount / Math.max(1, input.options?.minSnapshotCount ?? DEFAULT_OPTIONS.minSnapshotCount), 0, 1)
  const updateScore = clamp(updatedTaskCount / activeTaskCount, 0, 1)
  return round(snapshotScore * 0.55 + updateScore * 0.45)
}

function evidence(
  code: ProjectScheduleStateEvidenceCode,
  label: string,
  weight: number,
  value?: number | string | boolean | null,
): ProjectScheduleStateEvidence {
  return { code, label, weight: round(weight), value }
}

function localAccelerationFactor(state: ProjectScheduleState, throughputRatio: number, confidence: number) {
  if (confidence < DEFAULT_OPTIONS.minConfidenceForAdjustment) return null
  if (state === 'accelerating') return round(clamp(1 - Math.max(0, throughputRatio - 1) * 0.08, 0.9, 0.98))
  if (state === 'recovery') return round(clamp(1 - Math.max(0, throughputRatio - 1) * 0.05, 0.94, 0.99))
  return null
}

function buildConfidence(input: {
  state: ProjectScheduleState
  evidence: ProjectScheduleStateEvidence[]
  dataQualityScore: number
  contradictionCount: number
}) {
  if (input.state === 'low_confidence') return round(clamp(input.dataQualityScore * 0.65, 0.15, 0.45))
  const weight = input.evidence.reduce((sum, item) => sum + item.weight, 0)
  const base = input.state === 'normal' ? 0.48 : 0.42
  return round(clamp(base + Math.min(0.42, weight * 0.12) + input.dataQualityScore * 0.16 - input.contradictionCount * 0.08, 0.15, 0.95))
}

function statePriority(state: ProjectScheduleState) {
  const priority: Record<ProjectScheduleState, number> = {
    blocked: 6,
    overcompressed: 5,
    accelerating: 4,
    recovery: 3,
    normal: 2,
    low_confidence: 1,
  }
  return priority[state]
}

function scopePriority(scopeType: ProjectScheduleScopeType) {
  const priority: Record<ProjectScheduleScopeType, number> = {
    milestone_window: 6,
    zone: 5,
    specialty: 4,
    floor_group: 3,
    building: 2,
    project: 1,
  }
  return priority[scopeType]
}

export function buildProjectScheduleState(input: ProjectScheduleStateInput): ProjectScheduleStateResult {
  const options = { ...DEFAULT_OPTIONS, ...(input.options ?? {}) }
  const windowDays = Math.max(1, Math.trunc(normalizeNumber(input.windowDays, 14)))
  const previousProfile = throughputProfile(input.previous)
  const currentProfile = throughputProfile(input.current)
  const previousThroughput = previousProfile.composite
  const currentThroughput = currentProfile.composite
  const throughputRatio = ratio(currentThroughput, previousThroughput)
  const criticalPathThroughputRatio = ratio(currentProfile.criticalPath, previousProfile.criticalPath)
  const milestoneThroughputRatio = ratio(currentProfile.milestone, previousProfile.milestone)
  const standardFloorThroughputRatio = ratio(currentProfile.standardFloor, previousProfile.standardFloor)
  const precisionThroughputUp = (
    (currentProfile.criticalPath > 0 && criticalPathThroughputRatio >= options.accelerationThroughputRatio)
    || (currentProfile.milestone > 0 && milestoneThroughputRatio >= options.accelerationThroughputRatio)
    || (currentProfile.standardFloor > 0 && standardFloorThroughputRatio >= options.accelerationThroughputRatio)
  )
  const precisionThroughputRecovering = (
    (currentProfile.criticalPath > 0 && criticalPathThroughputRatio >= options.recoveryThroughputRatio)
    || (currentProfile.milestone > 0 && milestoneThroughputRatio >= options.recoveryThroughputRatio)
    || (currentProfile.standardFloor > 0 && standardFloorThroughputRatio >= options.recoveryThroughputRatio)
  )
  const precisionThroughputDown = (
    (previousProfile.criticalPath > 0 && criticalPathThroughputRatio <= options.blockedThroughputRatio)
    || (previousProfile.milestone > 0 && milestoneThroughputRatio <= options.blockedThroughputRatio)
    || (previousProfile.standardFloor > 0 && standardFloorThroughputRatio <= options.blockedThroughputRatio)
  )
  const previousParallelDensity = positive(input.previous.parallelDensity)
  const currentParallelDensity = positive(input.current.parallelDensity)
  const parallelDensityRatio = ratio(currentParallelDensity, previousParallelDensity)
  const blockerTrend = positive(input.current.blockerCount) - positive(input.previous.blockerCount)
  const hardBlockerCount = positive(input.current.hardBlockerCount)
  const qualityAnomalyTrend = positive(input.current.qualityAnomalyCount) + positive(input.current.progressQualityIssueCount)
    - positive(input.previous.qualityAnomalyCount) - positive(input.previous.progressQualityIssueCount)
  const resourcePressureScore = positive(input.current.resourcePressureScore)
  const previousDelay = positive(input.previous.forecastDelayDays) + positive(input.previous.baselineDeviationDays)
  const currentDelay = positive(input.current.forecastDelayDays) + positive(input.current.baselineDeviationDays)
  const deviationRecoveryDays = round(previousDelay - currentDelay)
  const milestonePressureScore = positive(input.current.milestonePressureScore)
  const dataQualityScore = dataQuality({ ...input, options })
  const evidenceList: ProjectScheduleStateEvidence[] = []
  let contradictionCount = 0

  if (windowDays < options.minWindowDays || positive(input.current.snapshotCount) < options.minSnapshotCount) {
    evidenceList.push(evidence('cold_start_window', 'Window is too short or has too few progress snapshots for state adjustment.', 0.7, windowDays))
    const confidence = buildConfidence({
      state: 'normal',
      evidence: evidenceList,
      dataQualityScore,
      contradictionCount: 1,
    })
    return {
      projectId: input.projectId,
      scopeType: input.scopeType,
      scopeId: input.scopeId || 'project',
      state: 'normal',
      confidence,
      windowDays,
      windowStartDate: input.windowStartDate ?? null,
      windowEndDate: input.windowEndDate ?? null,
      localAccelerationFactor: null,
      throughputRatio,
      parallelDensityRatio,
      deviationRecoveryDays,
      evidence: evidenceList,
      downstreamPolicy: {
        canAdjustRemainingDuration: false,
        canExplainDeviation: true,
        canRelaxResourceConflictPenalty: false,
        velocityFactorSupersedes: false,
        resourceConflictPenaltyMultiplier: 1,
        localAccelerationFactor: null,
        maxForwardDays: 0,
        confidenceOnly: true,
        actionPolicy: 'confidence_only',
      },
      metrics: {
        previousThroughput,
        currentThroughput,
        previousCriticalPathThroughput: previousProfile.criticalPath,
        currentCriticalPathThroughput: currentProfile.criticalPath,
        criticalPathThroughputRatio,
        previousMilestoneThroughput: previousProfile.milestone,
        currentMilestoneThroughput: currentProfile.milestone,
        milestoneThroughputRatio,
        previousStandardFloorThroughput: previousProfile.standardFloor,
        currentStandardFloorThroughput: currentProfile.standardFloor,
        standardFloorThroughputRatio,
        previousParallelDensity,
        currentParallelDensity,
        blockerTrend,
        hardBlockerCount,
        qualityAnomalyTrend,
        resourcePressureScore,
        dataQualityScore,
      },
    }
  }

  if (dataQualityScore < 0.45) {
    evidenceList.push(evidence('data_quality_low', 'Progress data quality is too low to distinguish real acceleration from reporting noise.', 1, dataQualityScore))
  }
  if (throughputRatio >= options.accelerationThroughputRatio) {
    evidenceList.push(evidence('completion_throughput_up', 'Weighted completion throughput increased across the rolling window.', 1, throughputRatio))
  } else if (throughputRatio <= options.blockedThroughputRatio) {
    evidenceList.push(evidence('completion_throughput_down', 'Weighted completion throughput decreased across the rolling window.', 1, throughputRatio))
  }
  if (currentProfile.criticalPath > 0 && criticalPathThroughputRatio >= options.accelerationThroughputRatio) {
    evidenceList.push(evidence('critical_path_throughput_up', 'Critical-path throughput increased across the rolling window.', 0.9, criticalPathThroughputRatio))
  } else if (previousProfile.criticalPath > 0 && criticalPathThroughputRatio <= options.blockedThroughputRatio) {
    evidenceList.push(evidence('critical_path_throughput_down', 'Critical-path throughput decreased across the rolling window.', 0.9, criticalPathThroughputRatio))
  }
  if (currentProfile.milestone > 0 && milestoneThroughputRatio >= options.accelerationThroughputRatio) {
    evidenceList.push(evidence('milestone_window_throughput_up', 'Milestone-window throughput increased across the rolling window.', 0.75, milestoneThroughputRatio))
  } else if (previousProfile.milestone > 0 && milestoneThroughputRatio <= options.blockedThroughputRatio) {
    evidenceList.push(evidence('milestone_window_throughput_down', 'Milestone-window throughput decreased across the rolling window.', 0.75, milestoneThroughputRatio))
  }
  if (currentProfile.standardFloor > 0 && standardFloorThroughputRatio >= options.accelerationThroughputRatio) {
    evidenceList.push(evidence('standard_floor_rhythm_throughput_up', 'Standard-floor rhythm throughput increased across the rolling window.', 0.7, standardFloorThroughputRatio))
  } else if (previousProfile.standardFloor > 0 && standardFloorThroughputRatio <= options.blockedThroughputRatio) {
    evidenceList.push(evidence('standard_floor_rhythm_throughput_down', 'Standard-floor rhythm throughput decreased across the rolling window.', 0.7, standardFloorThroughputRatio))
  }
  if (deviationRecoveryDays > 0.5) {
    evidenceList.push(evidence('planned_variance_recovering', 'Schedule variance or forecast delay is recovering.', 0.8, deviationRecoveryDays))
  } else if (deviationRecoveryDays < -0.5) {
    evidenceList.push(evidence('planned_variance_worsening', 'Schedule variance or forecast delay is worsening.', 0.8, deviationRecoveryDays))
  }
  if (parallelDensityRatio >= options.parallelDensityRatio) {
    evidenceList.push(evidence('parallel_density_up', 'Parallel workface density increased.', 0.65, parallelDensityRatio))
  }
  if (blockerTrend < 0 || positive(input.current.clearedBlockerCount) > 0) {
    evidenceList.push(evidence('blockers_cleared', 'Blockers are being cleared or not increasing.', 0.55, blockerTrend))
  } else if (blockerTrend > 0) {
    evidenceList.push(evidence('blockers_increasing', 'Blockers are increasing.', 0.8, blockerTrend))
  }
  if (hardBlockerCount > 0) {
    evidenceList.push(evidence('hard_blocker_present', 'Hard blocker remains active.', 0.9, hardBlockerCount))
  }
  if (qualityAnomalyTrend <= 0) {
    evidenceList.push(evidence('quality_anomaly_not_increasing', 'Progress quality anomalies are not increasing.', 0.45, qualityAnomalyTrend))
  } else {
    evidenceList.push(evidence('quality_anomaly_up', 'Progress quality anomalies are increasing.', 0.85, qualityAnomalyTrend))
  }
  if (resourcePressureScore >= options.highResourcePressureScore) {
    evidenceList.push(evidence('resource_pressure_high', 'Site capacity pressure remains high.', 0.8, resourcePressureScore))
  } else if (resourcePressureScore > 0) {
    evidenceList.push(evidence('resource_pressure_controlled', 'Site capacity pressure exists but is controlled.', 0.35, resourcePressureScore))
  }
  if (milestonePressureScore >= 0.6) {
    evidenceList.push(evidence('milestone_pressure', 'Milestone or handover window creates schedule pull pressure.', 0.55, milestonePressureScore))
  }

  let state: ProjectScheduleState = 'normal'
  if (dataQualityScore < 0.45) {
    state = 'low_confidence'
  } else if (
    parallelDensityRatio >= options.overcompressedParallelDensityRatio
    && (qualityAnomalyTrend > 0 || resourcePressureScore >= options.highResourcePressureScore || blockerTrend > 0)
  ) {
    state = 'overcompressed'
  } else if (
    (throughputRatio <= options.blockedThroughputRatio || precisionThroughputDown)
    && (hardBlockerCount > 0 || blockerTrend > 0 || resourcePressureScore >= options.highResourcePressureScore || deviationRecoveryDays < -0.5)
  ) {
    state = 'blocked'
  } else if (
    (throughputRatio >= options.accelerationThroughputRatio || precisionThroughputUp)
    && deviationRecoveryDays > 0
    && parallelDensityRatio >= options.parallelDensityRatio
    && qualityAnomalyTrend <= 0
    && blockerTrend <= 0
  ) {
    state = 'accelerating'
  } else if (
    (throughputRatio >= options.recoveryThroughputRatio || precisionThroughputRecovering)
    && (deviationRecoveryDays > 0 || blockerTrend < 0 || positive(input.current.clearedBlockerCount) > 0)
    && qualityAnomalyTrend <= 0
  ) {
    state = 'recovery'
  }

  if ((state === 'accelerating' || state === 'recovery') && (qualityAnomalyTrend > 0 || blockerTrend > 0)) {
    contradictionCount += 1
  }
  const confidence = buildConfidence({ state, evidence: evidenceList, dataQualityScore, contradictionCount })
  const factor = localAccelerationFactor(state, throughputRatio, confidence)
  const canAdjustRemainingDuration = Boolean(factor && confidence >= options.minConfidenceForAdjustment)
  const canRelaxResourceConflictPenalty = canAdjustRemainingDuration
    && (state === 'accelerating' || state === 'recovery')
    && throughputRatio >= options.recoveryThroughputRatio
    && qualityAnomalyTrend <= 0
    && blockerTrend <= 0
  const confidenceOnly = confidence < options.minConfidenceForAdjustment || state === 'low_confidence' || state === 'normal'
  const resourceConflictPenaltyMultiplier = state === 'overcompressed'
    ? 1.1
    : canRelaxResourceConflictPenalty
      ? 0.65
      : 1

  return {
    projectId: input.projectId,
    scopeType: input.scopeType,
    scopeId: input.scopeId || 'project',
    state,
    confidence,
    windowDays,
    windowStartDate: input.windowStartDate ?? null,
    windowEndDate: input.windowEndDate ?? null,
    localAccelerationFactor: factor,
    throughputRatio,
    parallelDensityRatio,
    deviationRecoveryDays,
    evidence: evidenceList.sort((left, right) => right.weight - left.weight || left.code.localeCompare(right.code)),
    downstreamPolicy: {
      canAdjustRemainingDuration,
      canExplainDeviation: true,
      canRelaxResourceConflictPenalty,
      velocityFactorSupersedes: canAdjustRemainingDuration,
      resourceConflictPenaltyMultiplier,
      localAccelerationFactor: factor,
      maxForwardDays: canAdjustRemainingDuration ? Math.min(options.maxForwardDays, windowDays) : 0,
      confidenceOnly,
      actionPolicy: confidenceOnly ? 'confidence_only' : 'candidate_only',
    },
    metrics: {
      previousThroughput,
      currentThroughput,
      previousCriticalPathThroughput: previousProfile.criticalPath,
      currentCriticalPathThroughput: currentProfile.criticalPath,
      criticalPathThroughputRatio,
      previousMilestoneThroughput: previousProfile.milestone,
      currentMilestoneThroughput: currentProfile.milestone,
      milestoneThroughputRatio,
      previousStandardFloorThroughput: previousProfile.standardFloor,
      currentStandardFloorThroughput: currentProfile.standardFloor,
      standardFloorThroughputRatio,
      previousParallelDensity,
      currentParallelDensity,
      blockerTrend,
      hardBlockerCount,
      qualityAnomalyTrend,
      resourcePressureScore,
      dataQualityScore,
    },
  }
}

export function selectEffectiveProjectScheduleState(states: ProjectScheduleStateResult[]) {
  if (states.length === 0) return null
  const projectCritical = states
    .filter((state) => state.scopeType === 'project' && ['blocked', 'overcompressed'].includes(state.state) && state.confidence >= 0.65)
    .sort((left, right) => statePriority(right.state) - statePriority(left.state) || right.confidence - left.confidence)[0]
  if (projectCritical) return projectCritical

  return [...states].sort((left, right) => (
    statePriority(right.state) - statePriority(left.state)
    || scopePriority(right.scopeType) - scopePriority(left.scopeType)
    || right.confidence - left.confidence
  ))[0] ?? null
}

export function selectApplicableProjectScheduleStates(states: ProjectScheduleStateResult[], maxStates = 5) {
  if (states.length === 0) return []
  const sorted = [...states].sort((left, right) => {
    const leftProjectCritical = left.scopeType === 'project' && ['blocked', 'overcompressed'].includes(left.state) && left.confidence >= 0.65
    const rightProjectCritical = right.scopeType === 'project' && ['blocked', 'overcompressed'].includes(right.state) && right.confidence >= 0.65
    return Number(rightProjectCritical) - Number(leftProjectCritical)
      || statePriority(right.state) - statePriority(left.state)
      || scopePriority(right.scopeType) - scopePriority(left.scopeType)
      || right.confidence - left.confidence
  })
  const selected = sorted.filter((state) => (
    state.state !== 'low_confidence'
    || state.confidence >= 0.35
    || states.length === 1
  ))
  const projectNormal = sorted.find((state) => state.scopeType === 'project' && state.state === 'normal')
  const withProjectNormal = projectNormal && !selected.some((state) => state.scopeType === 'project')
    ? [...selected, projectNormal]
    : selected
  const byScope = new Map<string, ProjectScheduleStateResult>()
  for (const state of withProjectNormal) {
    const key = `${state.scopeType}:${state.scopeId}`
    if (!byScope.has(key)) byScope.set(key, state)
  }
  return [...byScope.values()].slice(0, Math.max(1, maxStates))
}

function stateScopeKey(state: ProjectScheduleStateResult) {
  return `${state.scopeType}:${state.scopeId}`
}

function stateScopeStateKey(state: ProjectScheduleStateResult) {
  return `${state.scopeType}:${state.scopeId}:${state.state}`
}

function hasEvidenceCode(state: ProjectScheduleStateResult, code: ProjectScheduleStateEvidenceCode) {
  return state.evidence.some((item) => item.code === code)
}

export function inferDominantProjectRhythmState(states: ProjectScheduleStateResult[]): DominantProjectRhythmState | null {
  const applicableStates = selectApplicableProjectScheduleStates(states, 8)
  if (applicableStates.length === 0) return null
  const effective = selectEffectiveProjectScheduleState(applicableStates) ?? applicableStates[0]
  const accelerationStates = applicableStates.filter((state) => state.state === 'accelerating' || state.state === 'recovery')
  const blockedStates = applicableStates.filter((state) => state.state === 'blocked' || state.state === 'overcompressed')
  const standardFloorAcceleration = accelerationStates.find((state) => (
    hasEvidenceCode(state, 'standard_floor_rhythm_throughput_up')
    || state.scopeType === 'floor_group'
    || /floor|standard/i.test(state.scopeId)
  ))
  const precisionAcceleration = accelerationStates.find((state) => (
    hasEvidenceCode(state, 'critical_path_throughput_up')
    || hasEvidenceCode(state, 'milestone_window_throughput_up')
  ))

  let dominantRhythm: DominantProjectRhythmState['dominantRhythm']
  let primary = effective
  if (effective.scopeType === 'project' && effective.state === 'blocked') {
    dominantRhythm = 'blocked_project_rhythm'
  } else if (effective.scopeType === 'project' && effective.state === 'overcompressed') {
    dominantRhythm = 'overcompressed_project_rhythm'
  } else if (standardFloorAcceleration) {
    primary = standardFloorAcceleration
    dominantRhythm = blockedStates.length > 0
      ? 'standard_floor_accelerating_with_local_blockers'
      : 'local_acceleration'
  } else if (precisionAcceleration) {
    primary = precisionAcceleration
    dominantRhythm = 'critical_path_or_milestone_accelerating'
  } else if (accelerationStates.some((state) => state.state === 'accelerating')) {
    primary = accelerationStates.find((state) => state.state === 'accelerating') ?? primary
    dominantRhythm = 'local_acceleration'
  } else if (accelerationStates.some((state) => state.state === 'recovery')) {
    primary = accelerationStates.find((state) => state.state === 'recovery') ?? primary
    dominantRhythm = 'recovery_rhythm'
  } else if (effective.state === 'low_confidence') {
    dominantRhythm = 'low_confidence_rhythm'
  } else {
    dominantRhythm = 'normal_project_rhythm'
  }

  const evidenceCodes = Array.from(new Set(applicableStates.flatMap((state) => state.evidence.map((item) => item.code))))
  const confidence = round(clamp(
    Math.max(...applicableStates.map((state) => state.confidence), primary.confidence)
      - (blockedStates.length > 0 && accelerationStates.length > 0 ? 0.05 : 0),
    0.15,
    0.95,
  ))
  return {
    dominantRhythm,
    primaryState: primary.state,
    confidence,
    actionPolicy: confidence >= DEFAULT_OPTIONS.minConfidenceForAdjustment ? 'candidate_only' : 'confidence_only',
    applicableStateScopes: applicableStates.map(stateScopeStateKey),
    accelerationScopes: accelerationStates.map(stateScopeKey),
    blockedScopes: blockedStates.map(stateScopeKey),
    evidenceCodes,
  }
}

export function toProjectScheduleStateRow(result: ProjectScheduleStateResult) {
  return {
    project_id: result.projectId,
    scope_type: result.scopeType,
    scope_id: result.scopeId,
    state: result.state,
    confidence_score: result.confidence,
    window_days: result.windowDays,
    window_start_date: result.windowStartDate,
    window_end_date: result.windowEndDate,
    local_acceleration_factor: result.localAccelerationFactor,
    throughput_ratio: result.throughputRatio,
    parallel_density_ratio: result.parallelDensityRatio,
    deviation_recovery_days: result.deviationRecoveryDays,
    evidence: result.evidence,
    downstream_policy: result.downstreamPolicy,
    metrics: result.metrics,
    source: 'projectScheduleStateService',
  }
}

export async function loadLatestProjectScheduleStates(params: {
  projectId?: string | null
  scopeIds?: Array<string | null | undefined>
  limit?: number
}) {
  const projectId = normalizeId(params.projectId)
  if (!projectId) return [] as ProjectScheduleStateResult[]

  const { data, error } = await supabase
    .from('project_schedule_states')
    .select('project_id, scope_type, scope_id, state, confidence_score, window_days, window_start_date, window_end_date, local_acceleration_factor, throughput_ratio, parallel_density_ratio, deviation_recovery_days, evidence, downstream_policy, metrics')
    .eq('project_id', projectId)
    .order('window_end_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(Math.max(1, params.limit ?? 20))

  if (error) throw new Error(`Failed to load project schedule states: ${error.message}`)

  const scopeTokens = new Set(
    (params.scopeIds ?? [])
      .map(normalizedScopeToken)
      .filter(Boolean),
  )
  const rows = (data ?? [])
    .map((row) => mapProjectScheduleStateRow(row as ProjectScheduleStateDbRow))
    .filter((row): row is ProjectScheduleStateResult => Boolean(row))
    .filter((row) => matchesScheduleStateScope(row, scopeTokens))

  const byScope = new Map<string, ProjectScheduleStateResult>()
  for (const row of rows) {
    const key = `${row.scopeType}:${row.scopeId}`
    if (!byScope.has(key)) byScope.set(key, row)
  }

  return [...byScope.values()]
}

export async function loadEffectiveProjectScheduleState(params: {
  projectId?: string | null
  scopeIds?: Array<string | null | undefined>
}) {
  const states = await loadLatestProjectScheduleStates(params)
  return selectEffectiveProjectScheduleState(states)
}

export async function loadApplicableProjectScheduleStates(params: {
  projectId?: string | null
  scopeIds?: Array<string | null | undefined>
  limit?: number
}) {
  const states = await loadLatestProjectScheduleStates(params)
  return selectApplicableProjectScheduleStates(states, params.limit)
}

export async function persistProjectScheduleState(result: ProjectScheduleStateResult) {
  const projectId = String(result.projectId ?? '').trim()
  if (!projectId) throw new Error('project schedule state requires projectId')
  const row = toProjectScheduleStateRow(result)
  const { data, error } = await supabase
    .from('project_schedule_states')
    .upsert({ ...row, project_id: projectId }, { onConflict: 'project_id,scope_type,scope_id,window_end_date' })
    .select('*')
    .single()
  if (error) throw new Error(`Failed to persist project schedule state: ${error.message}`)
  return data
}
