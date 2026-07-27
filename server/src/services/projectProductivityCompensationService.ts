import { supabase } from './dbService.js'
import {
  loadApplicableProjectScheduleStates,
  type ProjectScheduleStateResult,
} from './projectScheduleStateService.js'
import {
  loadPublishedProjectProductivityCalibration,
  type ProjectProductivityPublishedCalibration,
} from './projectProductivityCalibrationStore.js'
import { inclusiveDurationDays } from '../utils/durationDays.js'

export type ProjectProductivityCompensationPolicy = 'auto_apply' | 'candidate_only' | 'confidence_only'

export type ProjectProductivityCompensationSourceKey =
  | 'weather_makeup'
  | 'overtime'
  | 'resequencing'
  | 'crew_learning'
  | 'stakeholder_pressure'

export interface ProjectProductivityCompensationSource {
  key: ProjectProductivityCompensationSourceKey
  contribution: number
  reason: string
  evidence?: Record<string, unknown>
}

export interface ProjectProductivityCompensationInput {
  projectId?: string | null
  scopeIds?: Array<string | null | undefined>
  baseProductivity?: number | null
  year?: number | null
  month?: number | null
  calendarKind?: string | null
  holidayCode?: string | null
  appliedFactorKeys?: string[]
  currentProgress?: number | null
  shutdownSignals?: string[]
  activeWeatherSignals?: string[]
  skipDurationExperienceContribution?: boolean
  skipScheduleStateContribution?: boolean
  skipPublishedCalibrationOverlay?: boolean
  governanceMode?: 'learning_shadow_replay'
  shadowEvidence?: {
    durationSamples?: DurationSampleRow[]
    dailySnapshots?: DailySnapshotRow[]
    scheduleStates?: ProjectScheduleStateResult[]
    publishedCalibration?: ProjectProductivityPublishedCalibration | null
  }
}

export interface ProjectProductivityCompensationResult {
  projectId: string | null
  baseProductivity: number
  adjustedProductivity: number
  productivityUplift: number
  productivityMultiplier: number
  durationMultiplier: number
  actionPolicy: ProjectProductivityCompensationPolicy
  confidenceLevel: 'unavailable' | 'low' | 'medium' | 'high'
  maturityTier: 'cold_start' | 'warm_30d' | 'stable_50d' | 'mature_90d'
  maturityScoreDays: number
  compensationCap: number
  capApplied: boolean
  sourceBreakdown: ProjectProductivityCompensationSource[]
  notAppliedReason: string | null
  dataDependencies: string[]
  metadata: Record<string, unknown>
}

type DurationSampleRow = {
  id?: string | null
  task_id?: string | null
  planned_duration?: number | string | null
  actual_duration?: number | string | null
  sample_strength?: string | null
  confidence_level?: string | null
  completed_at?: string | null
  created_at?: string | null
  metadata?: unknown
}

type DailySnapshotRow = {
  snapshot_date?: string | null
  overall_progress?: number | string | null
  task_progress?: number | string | null
  delay_days?: number | string | null
  active_obstacle_count?: number | string | null
  pending_condition_count?: number | string | null
  active_risk_count?: number | string | null
  shifted_milestone_count?: number | string | null
  critical_path_affected_tasks?: number | string | null
  attention_required?: boolean | string | number | null
}

const PRODUCTIVITY_COMPENSATION_POLICY = {
  coldStartDays: 30,
  stableDays: 50,
  matureDays: 90,
  minAppliedUplift: 0.05,
  maxAppliedUplift: 0.18,
  maxAdjustedProductivity: 0.95,
  lowProductivityThreshold: 0.86,
  noSignalMinRawUplift: 0.025,
}

const WEATHER_WINDOW_COMPENSATION_CAPS: Array<{
  tokens: string[]
  maxAdjustedProductivity: number
  maxUplift: number
  reason: string
}> = [
  {
    tokens: ['spring_festival', 'chunjie', 'lunar_new_year', 'post_festival', 'remobilization', 'restart_window', 'shutdown'],
    maxAdjustedProductivity: 0.45,
    maxUplift: 0,
    reason: 'rigid_shutdown_window_not_compensated',
  },
  {
    tokens: ['red_rainstorm', 'typhoon_red', 'red_weather', 'site_shutdown', 'severe_shutdown'],
    maxAdjustedProductivity: 0.5,
    maxUplift: 0,
    reason: 'severe_weather_shutdown_not_compensated',
  },
  {
    tokens: ['rain_blocks_work', 'rain blocks work', 'persistent_humidity', 'persistent humidity', 'plum_rain', 'plum rain', 'heavy_rain', 'heavy rain', 'rainy_season', 'rainy season'],
    maxAdjustedProductivity: 0.82,
    maxUplift: 0.035,
    reason: 'active_rain_window_compensation_limited',
  },
  {
    tokens: ['wind_warning', 'high_wind', 'typhoon peripheral'],
    maxAdjustedProductivity: 0.86,
    maxUplift: 0.05,
    reason: 'active_wind_window_compensation_limited',
  },
  {
    tokens: ['summer_heat', 'extreme_heat'],
    maxAdjustedProductivity: 0.9,
    maxUplift: 0.07,
    reason: 'active_heat_window_compensation_limited',
  },
]

type PublishedCalibrationOverlay = {
  applied: boolean
  id: string | null
  compensationCap: number | null
  minAppliedUplift: number
  maxAdjustedProductivity: number
  sourceWeightScale: {
    durationExperience: number
    dailySnapshot: number
    scheduleState: number
  }
  evidenceSampleCount: number
  evidenceSnapshotCount: number
  evidenceMaturityDays: number
}

const RUNTIME_PRODUCTIVITY_DATA_DEPENDENCIES = [
  'project_productivity_compensation_calibrations',
  'project_daily_snapshot',
  'project_schedule_states',
] as const

function productivityDataDependencies(input: ProjectProductivityCompensationInput) {
  return input.governanceMode === 'learning_shadow_replay'
    ? ['duration_experience_samples', ...RUNTIME_PRODUCTIVITY_DATA_DEPENDENCIES]
    : [...RUNTIME_PRODUCTIVITY_DATA_DEPENDENCIES]
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

function parseDate(value: unknown) {
  const normalized = normalizeDate(value)
  if (!normalized) return null
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function readBoolean(value: unknown, fallback = false) {
  if (value === true || value === 1 || value === 'true' || value === '1') return true
  if (value === false || value === 0 || value === 'false' || value === '0') return false
  return fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, precision = 3) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function normalizePublishedCalibrationOverlay(
  published: ProjectProductivityPublishedCalibration | null,
): PublishedCalibrationOverlay {
  const payload = readRecord(published?.parameterPayload)
  const evidence = readRecord(published?.evidenceSummary)
  const sourceWeightScale = readRecord(payload.sourceWeightScale)
  const compensationCap = readNumber(payload.compensationCap ?? published?.recommendedCap, NaN)
  return {
    applied: Boolean(published),
    id: published?.id ?? null,
    compensationCap: Number.isFinite(compensationCap)
      ? clamp(compensationCap, 0, PRODUCTIVITY_COMPENSATION_POLICY.maxAppliedUplift)
      : null,
    minAppliedUplift: clamp(
      readNumber(payload.minAppliedUplift ?? published?.recommendedMinUplift, PRODUCTIVITY_COMPENSATION_POLICY.minAppliedUplift),
      0,
      PRODUCTIVITY_COMPENSATION_POLICY.maxAppliedUplift,
    ),
    maxAdjustedProductivity: clamp(
      readNumber(payload.maxAdjustedProductivity, PRODUCTIVITY_COMPENSATION_POLICY.maxAdjustedProductivity),
      0.7,
      0.98,
    ),
    sourceWeightScale: {
      durationExperience: clamp(readNumber(sourceWeightScale.durationExperience, 1), 0.4, 1.4),
      dailySnapshot: clamp(readNumber(sourceWeightScale.dailySnapshot, 1), 0.4, 1.4),
      scheduleState: clamp(readNumber(sourceWeightScale.scheduleState, 1), 0.4, 1.4),
    },
    evidenceSampleCount: Math.max(0, Math.trunc(readNumber(
      payload.sampleCount ?? evidence.sampleCount ?? (Array.isArray(evidence.samples) ? evidence.samples.length : 0),
      0,
    ))),
    evidenceSnapshotCount: Math.max(0, Math.trunc(readNumber(
      payload.snapshotCount ?? evidence.snapshotCount,
      0,
    ))),
    evidenceMaturityDays: Math.max(0, Math.trunc(readNumber(
      payload.maturityDays ?? evidence.maturityDays ?? evidence.windowDays,
      0,
    ))),
  }
}

function scaleContribution(value: number, scale: number) {
  return round(clamp(value * scale, 0, PRODUCTIVITY_COMPENSATION_POLICY.maxAppliedUplift))
}

function confidenceWeight(value: unknown) {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'high') return 1
  if (normalized === 'medium') return 0.85
  if (normalized === 'low') return 0.65
  return 0.75
}

function sampleStrengthWeight(value: unknown) {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'strong') return 1
  if (normalized === 'medium') return 0.75
  if (normalized === 'weak') return 0.5
  return 0.75
}

function dateSpanDays(values: unknown[]) {
  const dates = values
    .map(parseDate)
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => left.getTime() - right.getTime())
  if (dates.length < 2) return dates.length
  return inclusiveDurationDays(dates[0], dates[dates.length - 1]) ?? 1
}

async function loadDailySnapshots(projectId: string): Promise<DailySnapshotRow[]> {
  const { data, error } = await (supabase as any)
    .from('project_daily_snapshot')
    .select('snapshot_date, overall_progress, task_progress, delay_days, active_obstacle_count, pending_condition_count, active_risk_count, shifted_milestone_count, critical_path_affected_tasks, attention_required')
    .eq('project_id', projectId)
    .order('snapshot_date', { ascending: false })
    .limit(120)

  if (error || !Array.isArray(data)) return []
  return data as DailySnapshotRow[]
}

function summarizeDurationExperience(
  rows: DurationSampleRow[],
  skipContribution: boolean,
) {
  const samples = rows
    .map((row) => {
      const weight = sampleStrengthWeight(row.sample_strength) * confidenceWeight(row.confidence_level)
      const plannedDuration = readNumber(row.planned_duration, 0)
      const actualDuration = readNumber(row.actual_duration, 0)
      const durationRatio = plannedDuration > 0 && actualDuration > 0
        ? clamp(actualDuration / plannedDuration, 0.625, 2)
        : null
      return {
        id: normalizeId(row.id) ?? normalizeId(row.task_id) ?? 'sample',
        weight,
        completedAt: normalizeDate(row.completed_at ?? row.created_at),
        durationRatio,
      }
    })
    .filter((sample) => sample.durationRatio != null)

  const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0)
  const durationRatio = totalWeight > 0
    ? clamp(samples.reduce((sum, sample) => sum + (sample.durationRatio ?? 1) * sample.weight, 0) / totalWeight, 0.625, 2)
    : 1
  const averageEfficiency = samples.length > 0
    ? clamp(1 / Math.max(durationRatio, 0.01), 0.5, 1.6)
    : 1
  const fasterRatio = Math.max(0, averageEfficiency - 1)
  const sampleConfidenceLevel = samples.length >= 50 ? 'high' : samples.length >= 20 ? 'medium' : samples.length > 0 ? 'low' : 'unavailable'
  const sampleConfidenceScore = samples.length > 0 ? Math.min(95, 40 + samples.length) : null
  const confidenceMultiplier = confidenceWeight(sampleConfidenceLevel)
  return {
    sampleCount: samples.length,
    spanDays: dateSpanDays(samples.map((sample) => sample.completedAt)),
    averageEfficiency: round(averageEfficiency),
    durationRatio: samples.length > 0 ? round(durationRatio) : null,
    source: samples.length > 0 ? 'governed_learning_shadow_replay' : 'runtime_publication_only',
    velocitySampleCount: samples.length,
    velocityGroupKey: samples.length > 0 ? 'learning_shadow_replay:project' : null,
    confidenceLevel: sampleConfidenceLevel,
    confidenceScore: sampleConfidenceScore,
    fasterRatio: round(fasterRatio),
    contribution: skipContribution ? 0 : round(clamp(fasterRatio * 0.55 * confidenceMultiplier, 0, 0.08)),
    sampleIds: samples.slice(0, 20).map((sample) => sample.id),
  }
}

function summarizeDailySnapshots(rows: DailySnapshotRow[]) {
  const snapshots = [...rows]
    .map((row) => ({
      date: normalizeDate(row.snapshot_date),
      progress: readNumber(row.overall_progress ?? row.task_progress, 0),
      delayDays: Math.max(0, readNumber(row.delay_days, 0)),
      obstacleCount: Math.max(0, readNumber(row.active_obstacle_count, 0)),
      conditionCount: Math.max(0, readNumber(row.pending_condition_count, 0)),
      riskCount: Math.max(0, readNumber(row.active_risk_count, 0)),
      milestoneShiftCount: Math.max(0, readNumber(row.shifted_milestone_count, 0)),
      criticalPathAffectedTasks: Math.max(0, readNumber(row.critical_path_affected_tasks, 0)),
      attentionRequired: readBoolean(row.attention_required, false),
    }))
    .filter((row) => row.date)
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))

  const first = snapshots[0] ?? null
  const last = snapshots[snapshots.length - 1] ?? null
  const spanDays = dateSpanDays(snapshots.map((snapshot) => snapshot.date))
  const progressGain = first && last ? last.progress - first.progress : 0
  const delayRecoveryDays = first && last ? first.delayDays - last.delayDays : 0
  const blockerRecovery = first && last
    ? (first.obstacleCount + first.conditionCount) - (last.obstacleCount + last.conditionCount)
    : 0
  const riskRecovery = first && last ? first.riskCount - last.riskCount : 0
  const criticalPressure = last ? last.criticalPathAffectedTasks + last.milestoneShiftCount : 0
  const recoveryContribution = progressGain > 0 && delayRecoveryDays > 0
    ? clamp(delayRecoveryDays / 140 + progressGain / 500, 0, 0.05)
    : 0
  const blockerContribution = blockerRecovery > 0 ? clamp(blockerRecovery * 0.006, 0, 0.025) : 0
  const riskContribution = riskRecovery > 0 ? clamp(riskRecovery * 0.004, 0, 0.015) : 0

  return {
    snapshotCount: snapshots.length,
    spanDays,
    progressGain: round(progressGain),
    delayRecoveryDays: round(delayRecoveryDays),
    blockerRecovery: round(blockerRecovery),
    riskRecovery: round(riskRecovery),
    criticalPressure,
    latestAttentionRequired: Boolean(last?.attentionRequired),
    contribution: round(clamp(recoveryContribution + blockerContribution + riskContribution, 0, 0.07)),
  }
}

function summarizeScheduleStates(states: ProjectScheduleStateResult[], skipContribution: boolean) {
  const blockingState = states.find((state) => (
    ['blocked', 'overcompressed'].includes(state.state)
    && state.confidence >= 0.65
  ))
  const positiveStates = states.filter((state) => (
    (state.state === 'accelerating' || state.state === 'recovery')
    && state.confidence >= 0.7
    && state.downstreamPolicy.canAdjustRemainingDuration
  ))
  const rawContribution = positiveStates.reduce((sum, state) => {
    const localFactor = readNumber(state.downstreamPolicy.localAccelerationFactor ?? state.localAccelerationFactor, 1)
    const localUplift = localFactor > 0 && localFactor < 1 ? 1 - localFactor : 0
    const throughputUplift = Math.max(0, state.throughputRatio - 1) * 0.035
    return sum + Math.max(localUplift, throughputUplift) * clamp(state.confidence, 0.5, 1)
  }, 0)

  return {
    scheduleStateCount: states.length,
    positiveStateCount: positiveStates.length,
    blockingState: blockingState
      ? `${blockingState.scopeType}:${blockingState.scopeId}:${blockingState.state}`
      : null,
    contribution: skipContribution || blockingState ? 0 : round(clamp(rawContribution, 0, 0.07)),
    states: states.map((state) => ({
      state: state.state,
      scopeType: state.scopeType,
      scopeId: state.scopeId,
      confidence: state.confidence,
      localAccelerationFactor: state.localAccelerationFactor,
      throughputRatio: state.throughputRatio,
      criticalPathThroughputRatio: state.metrics.criticalPathThroughputRatio,
      milestoneThroughputRatio: state.metrics.milestoneThroughputRatio,
      standardFloorThroughputRatio: state.metrics.standardFloorThroughputRatio,
    })),
  }
}

function maturityPolicy(input: {
  durationSampleCount: number
  durationSpanDays: number
  snapshotCount: number
  snapshotSpanDays: number
}) {
  const maturityScoreDays = Math.max(
    input.durationSpanDays,
    input.snapshotSpanDays,
    Math.min(90, input.durationSampleCount),
    Math.min(90, input.snapshotCount),
  )
  if (maturityScoreDays >= PRODUCTIVITY_COMPENSATION_POLICY.matureDays) {
    return { tier: 'mature_90d' as const, cap: 0.18, confidenceLevel: 'high' as const, actionPolicy: 'auto_apply' as const, maturityScoreDays }
  }
  if (maturityScoreDays >= PRODUCTIVITY_COMPENSATION_POLICY.stableDays) {
    return { tier: 'stable_50d' as const, cap: 0.1, confidenceLevel: 'medium' as const, actionPolicy: 'auto_apply' as const, maturityScoreDays }
  }
  if (maturityScoreDays >= PRODUCTIVITY_COMPENSATION_POLICY.coldStartDays) {
    return { tier: 'warm_30d' as const, cap: 0.05, confidenceLevel: 'medium' as const, actionPolicy: 'auto_apply' as const, maturityScoreDays }
  }
  return { tier: 'cold_start' as const, cap: 0, confidenceLevel: 'low' as const, actionPolicy: 'confidence_only' as const, maturityScoreDays }
}

function isRigidShutdownWindow(input: ProjectProductivityCompensationInput, baseProductivity: number) {
  const text = [
    normalizeText(input.calendarKind),
    normalizeText(input.holidayCode),
    ...(input.shutdownSignals ?? []).map((signal) => normalizeText(signal)),
  ].join(' ').toLowerCase()
  const currentProgress = readNumber(input.currentProgress, NaN)
  const hasZeroProgressShutdownSignal = Number.isFinite(currentProgress)
    && currentProgress <= 0
    && [
      'spring_festival',
      'chunjie',
      'lunar_new_year',
      'post_festival',
      'remobilization',
      'restart_window',
      'labor_return',
      'return_to_site',
      'shutdown',
      'velocity_skipped_due_to_zero_progress',
      '春节',
      '复工',
      '返场',
      '返岗',
      '劳务',
      '停工',
    ].some((needle) => text.includes(needle))
  return baseProductivity <= 0.45
    || hasZeroProgressShutdownSignal
    || text.includes('spring_festival')
    || text.includes('chunjie')
    || text.includes('lunar_new_year')
    || text.includes('typhoon_red')
    || text.includes('red_weather')
    || text.includes('severe_shutdown')
}

function resolveWeatherWindowCompensationGuard(input: ProjectProductivityCompensationInput, baseProductivity: number) {
  const text = [
    normalizeText(input.calendarKind),
    normalizeText(input.holidayCode),
    ...(input.shutdownSignals ?? []).map((signal) => normalizeText(signal)),
    ...(input.activeWeatherSignals ?? []).map((signal) => normalizeText(signal)),
  ].join(' ').toLowerCase()
  for (const guard of WEATHER_WINDOW_COMPENSATION_CAPS) {
    if (!guard.tokens.some((token) => text.includes(token))) continue
    return {
      ...guard,
      maxAdjustedProductivity: Math.max(baseProductivity, guard.maxAdjustedProductivity),
    }
  }
  return null
}

function hasCurrentPenaltySignal(input: ProjectProductivityCompensationInput, baseProductivity: number, scheduleContribution: number) {
  const pressureKeys = new Set([
    'seasonal_productivity',
    'process_seasonal_sensitivity',
    'weather_forecast_impact',
    'resource_conflict',
    'progress_velocity',
    'external_readiness',
    'process_constraint',
  ])
  return baseProductivity < PRODUCTIVITY_COMPENSATION_POLICY.lowProductivityThreshold
    || scheduleContribution > 0
    || (input.appliedFactorKeys ?? []).some((key) => pressureKeys.has(key))
}

function buildSourceBreakdown(input: {
  baseProductivity: number
  durationContribution: number
  snapshotContribution: number
  scheduleContribution: number
  durationEvidence?: Record<string, unknown>
}) {
  const sources: ProjectProductivityCompensationSource[] = []
  if (input.durationContribution > 0) {
    sources.push({
      key: 'crew_learning',
      contribution: input.durationContribution,
      reason: 'Completed duration samples show the project can deliver faster than the neutral baseline.',
      evidence: input.durationEvidence,
    })
  }
  if (input.snapshotContribution > 0) {
    const overtime = round(input.snapshotContribution * 0.45)
    const stakeholder = round(input.snapshotContribution * 0.25)
    const weatherMakeup = round(input.snapshotContribution - overtime - stakeholder)
    if (overtime > 0) {
      sources.push({
        key: 'overtime',
        contribution: overtime,
        reason: 'Daily snapshots show delay recovery while progress continues to advance.',
      })
    }
    if (weatherMakeup > 0) {
      sources.push({
        key: 'weather_makeup',
        contribution: weatherMakeup,
        reason: 'Recovered snapshot trend is treated as rain-stop or clear-window catch-up capacity.',
      })
    }
    if (stakeholder > 0) {
      sources.push({
        key: 'stakeholder_pressure',
        contribution: stakeholder,
        reason: 'Delay recovery under milestone pressure indicates managed pull-forward capacity.',
      })
    }
  }
  if (input.scheduleContribution > 0) {
    sources.push({
      key: 'resequencing',
      contribution: input.scheduleContribution,
      reason: 'Applicable schedule states show organized acceleration or recovery without worsening blockers.',
    })
  }
  if (input.baseProductivity < 0.78 && (input.snapshotContribution > 0 || input.scheduleContribution > 0)) {
    sources.push({
      key: 'weather_makeup',
      contribution: round(clamp((0.78 - input.baseProductivity) * 0.18, 0, 0.035)),
      reason: 'Low weather/calendar productivity is partially recoverable when live execution evidence shows catch-up.',
    })
  }
  return sources.filter((source) => source.contribution > 0)
}

function scaleSourceBreakdown(sources: ProjectProductivityCompensationSource[], targetUplift: number) {
  const total = sources.reduce((sum, source) => sum + source.contribution, 0)
  if (total <= 0 || targetUplift <= 0) return []
  const scaled = sources.map((source) => ({
    ...source,
    contribution: round(source.contribution * targetUplift / total),
  })).filter((source) => source.contribution > 0)
  const delta = round(targetUplift - scaled.reduce((sum, source) => sum + source.contribution, 0))
  if (Math.abs(delta) >= 0.001 && scaled[0]) {
    scaled[0] = { ...scaled[0], contribution: round(scaled[0].contribution + delta) }
  }
  return scaled
}

function emptyResult(input: {
  projectId: string | null
  baseProductivity: number
  notAppliedReason: string
  maturity?: ReturnType<typeof maturityPolicy>
  metadata?: Record<string, unknown>
  dataDependencies?: string[]
}): ProjectProductivityCompensationResult {
  const maturity = input.maturity ?? {
    tier: 'cold_start' as const,
    cap: 0,
    confidenceLevel: 'unavailable' as const,
    actionPolicy: 'confidence_only' as const,
    maturityScoreDays: 0,
  }
  return {
    projectId: input.projectId,
    baseProductivity: input.baseProductivity,
    adjustedProductivity: input.baseProductivity,
    productivityUplift: 0,
    productivityMultiplier: 1,
    durationMultiplier: 1,
    actionPolicy: 'confidence_only',
    confidenceLevel: maturity.confidenceLevel,
    maturityTier: maturity.tier,
    maturityScoreDays: maturity.maturityScoreDays,
    compensationCap: maturity.cap,
    capApplied: false,
    sourceBreakdown: [],
    notAppliedReason: input.notAppliedReason,
    dataDependencies: input.dataDependencies ?? [...RUNTIME_PRODUCTIVITY_DATA_DEPENDENCIES],
    metadata: {
      policy: 'controlled_project_productivity_compensation',
      coldStartPolicy: 'no_auto_compensation_before_30d_or_30_samples',
      notAppliedReason: input.notAppliedReason,
      ...(input.metadata ?? {}),
    },
  }
}

export async function buildProjectProductivityCompensation(
  input: ProjectProductivityCompensationInput,
): Promise<ProjectProductivityCompensationResult> {
  const projectId = normalizeId(input.projectId)
  const baseProductivity = round(clamp(readNumber(input.baseProductivity, 1), 0.25, 1.1))
  if (!projectId) {
    return emptyResult({
      projectId: null,
      baseProductivity,
      notAppliedReason: 'missing_project_id',
      dataDependencies: productivityDataDependencies(input),
    })
  }

  const governanceReplayEnabled = input.governanceMode === 'learning_shadow_replay'
  const durationRows = governanceReplayEnabled
    ? input.shadowEvidence?.durationSamples ?? []
    : []
  const [snapshotRows, scheduleStates, publishedCalibration] = await Promise.all([
    governanceReplayEnabled && input.shadowEvidence?.dailySnapshots
      ? Promise.resolve(input.shadowEvidence.dailySnapshots)
      : loadDailySnapshots(projectId),
    governanceReplayEnabled && input.shadowEvidence?.scheduleStates
      ? Promise.resolve(input.shadowEvidence.scheduleStates)
      : loadApplicableProjectScheduleStates({
        projectId,
        scopeIds: input.scopeIds,
        limit: 8,
      }).catch(() => [] as ProjectScheduleStateResult[]),
    input.skipPublishedCalibrationOverlay
      ? Promise.resolve(null)
      : governanceReplayEnabled && input.shadowEvidence && 'publishedCalibration' in input.shadowEvidence
        ? Promise.resolve(input.shadowEvidence.publishedCalibration ?? null)
        : loadPublishedProjectProductivityCalibration(projectId).catch(() => null),
  ])

  const durationSummary = summarizeDurationExperience(durationRows, Boolean(input.skipDurationExperienceContribution))
  const snapshotSummary = summarizeDailySnapshots(snapshotRows)
  const scheduleSummary = summarizeScheduleStates(scheduleStates, Boolean(input.skipScheduleStateContribution))
  const publishedOverlay = normalizePublishedCalibrationOverlay(publishedCalibration)
  const effectiveDurationContribution = scaleContribution(
    durationSummary.contribution,
    publishedOverlay.sourceWeightScale.durationExperience,
  )
  const effectiveSnapshotContribution = scaleContribution(
    snapshotSummary.contribution,
    publishedOverlay.sourceWeightScale.dailySnapshot,
  )
  const effectiveScheduleContribution = scaleContribution(
    scheduleSummary.contribution,
    publishedOverlay.sourceWeightScale.scheduleState,
  )
  const maturity = maturityPolicy({
    durationSampleCount: Math.max(durationSummary.sampleCount, publishedOverlay.evidenceSampleCount),
    durationSpanDays: Math.max(durationSummary.spanDays, publishedOverlay.evidenceMaturityDays),
    snapshotCount: Math.max(snapshotSummary.snapshotCount, publishedOverlay.evidenceSnapshotCount),
    snapshotSpanDays: Math.max(snapshotSummary.spanDays, publishedOverlay.evidenceMaturityDays),
  })
  const dataDependencies = productivityDataDependencies(input)
  const commonMetadata = {
    policy: 'controlled_project_productivity_compensation',
    baseProductivity,
    year: input.year ?? null,
    month: input.month ?? null,
    appliedFactorKeys: input.appliedFactorKeys ?? [],
    currentProgress: Number.isFinite(readNumber(input.currentProgress, NaN))
      ? readNumber(input.currentProgress, NaN)
      : null,
    shutdownSignals: input.shutdownSignals ?? [],
    activeWeatherSignals: input.activeWeatherSignals ?? [],
    durationExperience: durationSummary,
    dailySnapshot: snapshotSummary,
    projectScheduleState: scheduleSummary,
    effectiveContributions: {
      durationExperience: effectiveDurationContribution,
      dailySnapshot: effectiveSnapshotContribution,
      projectScheduleState: effectiveScheduleContribution,
    },
    publishedCalibrationApplied: publishedOverlay.applied,
    publishedCalibrationId: publishedOverlay.id,
    publishedCalibrationPolicy: {
      compensationCap: publishedOverlay.compensationCap,
      minAppliedUplift: publishedOverlay.minAppliedUplift,
      maxAdjustedProductivity: publishedOverlay.maxAdjustedProductivity,
      sourceWeightScale: publishedOverlay.sourceWeightScale,
      evidenceSampleCount: publishedOverlay.evidenceSampleCount,
      evidenceSnapshotCount: publishedOverlay.evidenceSnapshotCount,
      evidenceMaturityDays: publishedOverlay.evidenceMaturityDays,
    },
    skipDurationExperienceContribution: Boolean(input.skipDurationExperienceContribution),
    skipScheduleStateContribution: Boolean(input.skipScheduleStateContribution),
    skipPublishedCalibrationOverlay: Boolean(input.skipPublishedCalibrationOverlay),
    governanceMode: input.governanceMode ?? 'runtime_publication_only',
    shadowEvidenceInjected: governanceReplayEnabled && Boolean(input.shadowEvidence),
    coldStartPolicy: 'no_auto_compensation_before_30d_or_30_samples',
    capPolicy: '+0.05_to_+0.18_by_30_50_90_day_maturity',
  }

  if (isRigidShutdownWindow(input, baseProductivity)) {
    return emptyResult({
      projectId,
      baseProductivity,
      notAppliedReason: 'rigid_shutdown_window_not_compensated',
      maturity,
      metadata: commonMetadata,
      dataDependencies,
    })
  }
  const weatherWindowGuard = resolveWeatherWindowCompensationGuard(input, baseProductivity)
  if (weatherWindowGuard && weatherWindowGuard.maxUplift <= 0) {
    return emptyResult({
      projectId,
      baseProductivity,
      notAppliedReason: weatherWindowGuard.reason,
      maturity,
      metadata: {
        ...commonMetadata,
        weatherWindowCompensationGuard: weatherWindowGuard,
      },
      dataDependencies,
    })
  }
  if (scheduleSummary.blockingState) {
    return emptyResult({
      projectId,
      baseProductivity,
      notAppliedReason: 'blocking_schedule_state_present',
      maturity,
      metadata: commonMetadata,
      dataDependencies,
    })
  }
  if (maturity.cap <= 0) {
    return emptyResult({
      projectId,
      baseProductivity,
      notAppliedReason: 'cold_start_observation_only',
      maturity,
      metadata: commonMetadata,
      dataDependencies,
    })
  }
  if (!hasCurrentPenaltySignal(input, baseProductivity, scheduleSummary.contribution)) {
    return emptyResult({
      projectId,
      baseProductivity,
      notAppliedReason: 'no_current_productivity_penalty_signal',
      maturity,
      metadata: commonMetadata,
      dataDependencies,
    })
  }

  const sourceBreakdown = buildSourceBreakdown({
    baseProductivity,
    durationContribution: effectiveDurationContribution,
    snapshotContribution: effectiveSnapshotContribution,
    scheduleContribution: effectiveScheduleContribution,
    durationEvidence: {
      source: durationSummary.source,
      durationRatio: durationSummary.durationRatio,
      averageEfficiency: durationSummary.averageEfficiency,
      velocitySampleCount: durationSummary.velocitySampleCount,
      velocityGroupKey: durationSummary.velocityGroupKey,
      confidenceLevel: durationSummary.confidenceLevel,
      confidenceScore: durationSummary.confidenceScore,
    },
  })
  const rawUplift = round(sourceBreakdown.reduce((sum, source) => sum + source.contribution, 0))
  if (rawUplift < PRODUCTIVITY_COMPENSATION_POLICY.noSignalMinRawUplift) {
    return emptyResult({
      projectId,
      baseProductivity,
      notAppliedReason: 'insufficient_positive_compensation_evidence',
      maturity,
      metadata: {
        ...commonMetadata,
        rawUplift,
      },
      dataDependencies,
    })
  }

  const effectiveCap = Math.min(
    maturity.cap,
    publishedOverlay.compensationCap ?? maturity.cap,
    weatherWindowGuard?.maxUplift ?? PRODUCTIVITY_COMPENSATION_POLICY.maxAppliedUplift,
    PRODUCTIVITY_COMPENSATION_POLICY.maxAppliedUplift,
  )
  const effectiveMinUplift = Math.min(publishedOverlay.minAppliedUplift, effectiveCap)
  const cappedUplift = Math.min(rawUplift, effectiveCap)
  const requestedUplift = Math.min(effectiveCap, Math.max(effectiveMinUplift, cappedUplift))
  const adjustedProductivity = round(clamp(
    baseProductivity + requestedUplift,
    baseProductivity,
    Math.min(publishedOverlay.maxAdjustedProductivity, weatherWindowGuard?.maxAdjustedProductivity ?? publishedOverlay.maxAdjustedProductivity),
  ))
  const productivityUplift = round(Math.max(0, adjustedProductivity - baseProductivity))
  if (productivityUplift <= 0) {
    return emptyResult({
      projectId,
      baseProductivity,
      notAppliedReason: 'adjusted_productivity_cap_reached',
      maturity,
      metadata: commonMetadata,
      dataDependencies,
    })
  }

  const finalSources = scaleSourceBreakdown(sourceBreakdown, productivityUplift)
  const productivityMultiplier = round(adjustedProductivity / Math.max(0.01, baseProductivity))
  const durationMultiplier = round(baseProductivity / adjustedProductivity)

  return {
    projectId,
    baseProductivity,
    adjustedProductivity,
    productivityUplift,
    productivityMultiplier,
    durationMultiplier,
    actionPolicy: maturity.actionPolicy,
    confidenceLevel: maturity.confidenceLevel,
    maturityTier: maturity.tier,
    maturityScoreDays: maturity.maturityScoreDays,
    compensationCap: effectiveCap,
    capApplied: rawUplift > productivityUplift,
    sourceBreakdown: finalSources,
    notAppliedReason: null,
    dataDependencies,
    metadata: {
      ...commonMetadata,
      rawUplift,
      productivityUplift,
      productivityMultiplier,
      durationMultiplier,
      adjustedProductivity,
      sourceBreakdown: finalSources,
      weatherWindowCompensationGuard: weatherWindowGuard,
    },
  }
}
