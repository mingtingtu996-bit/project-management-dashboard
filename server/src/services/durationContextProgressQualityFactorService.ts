import { inclusiveDurationDays } from '../utils/durationDays.js'
import {
  inferTitleWeakStandardWorkMatchesFromResolver,
  inferWorkEnvironmentFromResolver,
  resolveStandardWorkDurationSeed,
  type AlgorithmSeedResolveContext,
} from './algorithmSeedResolver.js'
import {
  readDurationContextProgressQualityFindings,
  readDurationContextTaskMaterialRows,
  readDurationContextTaskProgressSnapshotRows,
  readDurationContextTaskReadinessSignalRows,
} from './durationContextFactReadModelService.js'
import {
  detectProgressAnomalySignals,
  type ProgressAnomalyCode,
  type ProgressAnomalySeverity,
  type ProgressAnomalySignal,
} from './progressAnomalyService.js'
import type {
  DurationContextFactor,
  DurationContextInput,
} from '../types/durationContext.js'

type DurationContextProgressCurve = 'linear' | 'front_heavy' | 'back_heavy' | 's_curve' | 'hold'

type ProgressQualityWorkContext = {
  progressCurve: DurationContextProgressCurve | null
  progressCurveSource: string | null
}

type ActiveReadinessRows = {
  conditions: Record<string, unknown>[]
  obstacles: Record<string, unknown>[]
  materials: Record<string, unknown>[]
}

type ProgressQualityRuntimeCache = {
  activeReadinessRowsByTaskId?: Map<string, Promise<ActiveReadinessRows>>
}

type ProgressQualityCode =
  | ProgressAnomalyCode
  | 'snapshot_gap'
  | 'source_low_confidence'
  | 'progress_rollback'
  | 'duplicate_progress_fill'

type ProgressQualitySignal = {
  code: ProgressQualityCode
  severity: ProgressAnomalySeverity
  summary: string
  acknowledged: boolean
  excludedFromVelocityLearning: boolean
  metadata: Record<string, unknown>
}

type QualitySnapshot = {
  progress: number
  date: Date
  source: string
  notes: string
  sourceConfidence: string
  confirmationStatus: string
  confirmedAt: string
  confirmedBy: string
}

const OPEN_CONDITION_STATUSES = ['pending', 'open', 'active', 'blocked', 'not_satisfied', '\u5f85\u6ee1\u8db3', '\u672a\u6ee1\u8db3', '\u53d7\u963b']
const OPEN_OBSTACLE_STATUSES = ['pending', 'open', 'active', 'resolving', 'in_progress', 'blocked', '\u5f85\u5904\u7406', '\u5904\u7406\u4e2d', '\u53d7\u963b']

const PROGRESS_QUALITY_POLICY = {
  severityPenalty: {
    critical: 18,
    warning: 10,
    info: 4,
  },
  maxConfidencePenalty: 25,
  acknowledgedPenaltyRatio: 0.45,
  acknowledgedPenaltyMin: 3,
  closeoutSupportedPenaltyMax: 5,
  extraSignalPenalty: 2,
  downgradeLearningPenalty: 10,
  excludeLearningPenalty: 18,
  planReferenceFallbackPenalty: 18,
}

const PROGRESS_QUALITY_RULE_CODE_BY_SIGNAL: Record<ProgressQualityCode, string> = {
  progress_jump: 'PROGRESS_JUMP',
  month_end_burst: 'PROGRESS_MONTH_END_BURST',
  stuck_finishing: 'PROGRESS_STUCK_FINISHING',
  snapshot_gap: 'SNAPSHOT_GAP',
  source_low_confidence: 'PROGRESS_SOURCE_LOW_CONFIDENCE',
  progress_rollback: 'PROGRESS_ROLLBACK',
  duplicate_progress_fill: 'PROGRESS_DUPLICATE_FILL',
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = normalizeText(value).toLowerCase()
  if (['true', '1', 'yes', 'y', '\u662f'].includes(text)) return true
  if (['false', '0', 'no', 'n', '\u5426'].includes(text)) return false
  return fallback
}

function parseDate(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function readProgressCurveFromRecord(record: Record<string, unknown>) {
  const curve = normalizeText(record.progressCurve ?? record.progress_curve).toLowerCase()
  if (['linear', 'front_heavy', 'back_heavy', 's_curve', 'hold'].includes(curve)) {
    return curve as DurationContextProgressCurve
  }
  return null
}

function readTaskWorkMetadata(task: Record<string, unknown>) {
  return readRecord(task.standardTaskMetadata ?? task.standard_task_metadata)
}

function readTaskWorkText(task: Record<string, unknown>) {
  return {
    title: normalizeText(task.taskTitle ?? task.title),
    standardWorkCode: normalizeId(task.standardWorkCode ?? task.standard_work_code),
    standardWorkName: normalizeText(task.standardWorkName ?? task.standard_work_name),
  }
}

function compactFactorText(input: DurationContextInput) {
  const metadata = readRecord(input.standardTaskMetadata)
  return [
    input.taskTitle,
    input.standardWorkName,
    input.standardWorkCode,
    input.wbsNodeType,
    input.engineeringCategoryId,
    input.projectTypeCode,
    input.structureTypeCode,
    metadata.workEnvironment,
    metadata.work_environment,
    ...(Array.isArray(input.methodVariantCodes) ? input.methodVariantCodes : []),
    ...(Array.isArray(input.elementVariantCodes) ? input.elementVariantCodes : []),
  ].map(normalizeText).filter(Boolean).join(' ')
}

function buildSeedResolveContext(input: DurationContextInput): AlgorithmSeedResolveContext {
  const metadata = readRecord(input.standardTaskMetadata)
  const buildingPatternObservation = readRecord(metadata.buildingPatternObservation ?? metadata.building_pattern_observation)
  const observedPrimaryWorkfaceType = normalizeText(buildingPatternObservation.primaryWorkfaceType ?? buildingPatternObservation.primary_workface_type)
  const observedPhaseWindow = normalizeText(buildingPatternObservation.phaseWindow ?? buildingPatternObservation.phase_window)
  const observedExpansionStrategy = normalizeText(buildingPatternObservation.expansionStrategy ?? buildingPatternObservation.expansion_strategy)
  const scopeDimensions = [
    input.buildingObjectId ? 'building' : null,
    input.floorObjectId ? 'floor' : null,
    input.zoneObjectId ? 'zone' : null,
  ].filter((item): item is string => Boolean(item))
  const rhythmDrivers = [
    input.floorObjectId ? 'floor_count' : null,
    input.buildingObjectId ? 'building_count' : null,
    input.zoneObjectId ? 'zone_count' : null,
    (input.methodVariantCodes?.length ?? 0) > 0 ? 'method_variant' : null,
    input.acceptanceRequired ? 'acceptance_gate' : null,
    input.materialRequired ? 'readiness_gate' : null,
    input.responsibleUnitId ? 'resource_capacity' : null,
  ].filter((item): item is string => Boolean(item))

  return {
    projectId: input.projectId,
    standardWorkCode: input.standardWorkCode,
    standardWorkCodes: input.standardWorkCode ? [input.standardWorkCode] : [],
    templateNodeId: input.templateNodeId,
    methodVariantCodes: input.methodVariantCodes ?? [],
    elementVariantCodes: input.elementVariantCodes ?? [],
    projectTypeCode: input.projectTypeCode ?? null,
    structureTypeCode: input.structureTypeCode ?? null,
    applicableGranularity: input.applicableGranularity ?? null,
    workEnvironment: inferWorkEnvironmentFromResolver(compactFactorText(input), metadata),
    scopeDimensions,
    rhythmDrivers,
    primaryWorkfaceType: observedPrimaryWorkfaceType || (scopeDimensions.includes('floor')
      ? 'standard_floor'
      : scopeDimensions.includes('zone')
        ? 'building_zone'
        : scopeDimensions.includes('building')
          ? 'building_zone'
          : null),
    phaseWindow: observedPhaseWindow || (scopeDimensions.includes('floor') ? 'superstructure' : null),
    expansionStrategy: observedExpansionStrategy || (scopeDimensions.includes('floor')
      ? 'floor_ordered'
      : scopeDimensions.includes('zone')
        ? 'zone_ordered'
        : scopeDimensions.includes('building')
          ? 'building'
          : null),
  }
}

async function resolveProgressQualityWorkContext(input: DurationContextInput): Promise<ProgressQualityWorkContext> {
  const task = input as Record<string, unknown>
  const workText = readTaskWorkText(task)
  const metadata = readTaskWorkMetadata(task)
  const rawText = [
    workText.title,
    workText.standardWorkName,
    workText.standardWorkCode,
    metadata.standardWorkCode,
    metadata.standard_work_code,
  ].map(normalizeText).filter(Boolean).join(' ')

  const baseContext = buildSeedResolveContext(input)
  let standardWorkCode = workText.standardWorkCode
  if (!standardWorkCode && rawText) {
    const weakMatches = await inferTitleWeakStandardWorkMatchesFromResolver(rawText, baseContext)
    const firstWeakMatch = weakMatches[0] as Record<string, unknown> | undefined
    if (firstWeakMatch?.standardWorkCode) {
      standardWorkCode = normalizeId(firstWeakMatch.standardWorkCode)
    }
  }

  const scopedContext = {
    ...baseContext,
    standardWorkCode,
    standardWorkCodes: standardWorkCode ? [standardWorkCode] : baseContext.standardWorkCodes,
  }
  const durationSeed = standardWorkCode
    ? await resolveStandardWorkDurationSeed(rawText, scopedContext) as Record<string, unknown> | null
    : null
  const seedMetadata = readRecord(durationSeed)
  const taskProgressCurve = readProgressCurveFromRecord(metadata)
  const seedProgressCurve = readProgressCurveFromRecord(seedMetadata)
  return {
    progressCurve: taskProgressCurve ?? seedProgressCurve,
    progressCurveSource: taskProgressCurve ? 'task_metadata' : seedProgressCurve ? 'duration_seed' : null,
  }
}

function cacheKeyFromId(value: unknown) {
  return normalizeId(value) ?? '__none__'
}

function isOpenCondition(row: Record<string, unknown>) {
  const status = normalizeLower(row.status)
  if (!status) return true
  return OPEN_CONDITION_STATUSES.includes(status) || readBoolean(row.is_satisfied, false) === false
}

function isOpenObstacle(row: Record<string, unknown>) {
  const status = normalizeLower(row.status)
  if (!status) return true
  return OPEN_OBSTACLE_STATUSES.includes(status)
}

function isMaterialCondition(row: Record<string, unknown>) {
  const text = [
    row.condition_type,
    row.source_type,
    row.source_entity_type,
    row.description,
    row.title,
  ].map(normalizeLower).join(' ')
  return ['material', 'project_material', 'materials', '\u6750\u6599', '\u5230\u8d27', '\u5c01\u6837'].some((token) => text.includes(token))
}

function isActiveMaterial(row: Record<string, unknown>) {
  const recordStatus = normalizeLower(row.record_status)
  const lifecycleStatus = normalizeLower(row.lifecycle_status)
  if (recordStatus && recordStatus !== 'active') return false
  if (['archived', 'voided', 'deleted', 'inactive'].includes(lifecycleStatus)) return false
  return !row.actual_arrival_date
}

async function loadProgressQualityActiveReadinessRows(input: DurationContextInput, runtimeCache?: ProgressQualityRuntimeCache) {
  const taskId = normalizeId(input.taskId)
  if (!taskId) return { conditions: [], obstacles: [], materials: [] } satisfies ActiveReadinessRows
  if (runtimeCache?.activeReadinessRowsByTaskId) {
    const cacheKey = cacheKeyFromId(taskId)
    const current = runtimeCache.activeReadinessRowsByTaskId.get(cacheKey)
    if (current) return current
    const promise = loadProgressQualityActiveReadinessRows(input)
    runtimeCache.activeReadinessRowsByTaskId.set(cacheKey, promise)
    return promise
  }

  const rawReadinessRows = await readDurationContextTaskReadinessSignalRows({ taskId })
  const conditions = rawReadinessRows.conditions.filter(isOpenCondition)
  const obstacles = rawReadinessRows.obstacles.filter(isOpenObstacle)

  const explicitMaterialIds = [...new Set((conditions as Array<Record<string, unknown>>).flatMap((condition) => {
    if (!isMaterialCondition(condition)) return []
    return [
      condition.source_ref_id,
      condition.sourceRefId,
      condition.source_entity_id,
      condition.sourceEntityId,
    ]
  }).map(normalizeId).filter(Boolean) as string[])]

  const materialRows = await readDurationContextTaskMaterialRows({ taskId, explicitMaterialIds })
  const materials = materialRows.filter(isActiveMaterial).map((row: Record<string, unknown>) => ({
    ...row,
    __linkage_quality: explicitMaterialIds.length > 0 ? 'explicit_condition' : 'linked_task_fallback',
  }))

  return {
    conditions: conditions as Record<string, unknown>[],
    obstacles: obstacles as Record<string, unknown>[],
    materials,
  } satisfies ActiveReadinessRows
}

function inferFinishingStagnationReason(rows: ActiveReadinessRows) {
  const text = [
    ...rows.conditions,
    ...rows.obstacles,
  ].map((row) => [
    row.condition_type,
    row.obstacle_type,
    row.source_type,
    row.title,
    row.description,
  ].map(normalizeLower).join(' ')).join(' ')

  if (['\u6574\u6539', 'rectification', 'punch', 'rework'].some((token) => text.includes(token))) {
    return 'rectification'
  }
  if (['\u9a8c\u6536', '\u62a5\u9a8c', 'acceptance', 'inspection'].some((token) => text.includes(token))) {
    return 'acceptance_wait'
  }
  if (['\u8d44\u6599', '\u79fb\u4ea4', 'document', 'handover', 'closeout'].some((token) => text.includes(token))) {
    return 'documentation_closeout'
  }
  if (rows.materials.length > 0) return 'material_closeout'
  return 'physical_closeout'
}

function progressQualitySeverityPenalty(severity: ProgressAnomalySeverity) {
  if (severity === 'critical') return PROGRESS_QUALITY_POLICY.severityPenalty.critical
  if (severity === 'warning') return PROGRESS_QUALITY_POLICY.severityPenalty.warning
  return PROGRESS_QUALITY_POLICY.severityPenalty.info
}

function progressQualitySeverityRank(severity: ProgressAnomalySeverity) {
  if (severity === 'critical') return 3
  if (severity === 'warning') return 2
  return 1
}

function isDataQualityFindingResolved(row: Record<string, unknown>) {
  const status = normalizeLower(row.status)
  const resolvedType = normalizeLower(row.resolved_type)
  return ['resolved', 'ignored', 'dismissed', 'closed', '\u5df2\u89e3\u51b3', '\u5df2\u5ffd\u7565'].includes(status)
    || ['resolved', 'ignored', 'accepted', '\u5df2\u5ffd\u7565'].includes(resolvedType)
    || Boolean(row.resolved_at)
}

function isDataQualityFindingAcknowledged(row: Record<string, unknown>) {
  const status = normalizeLower(row.status)
  const resolvedType = normalizeLower(row.resolved_type)
  return ['acknowledged', 'confirmed', 'reviewed', '\u5df2\u786e\u8ba4', '\u5df2\u590d\u6838'].includes(status)
    || ['confirmed', 'accepted', 'acknowledged', '\u5df2\u786e\u8ba4'].includes(resolvedType)
}

async function loadProgressQualityFindings(taskId: string) {
  const ruleCodes = Object.values(PROGRESS_QUALITY_RULE_CODE_BY_SIGNAL)
  return readDurationContextProgressQualityFindings({ taskId, ruleCodes })
}

function buildSnapshotGapQualitySignal(
  input: DurationContextInput,
  snapshots: Array<Record<string, unknown>>,
  workContext?: ProgressQualityWorkContext | null,
): ProgressQualitySignal | null {
  const progress = clamp(Number(input.progress ?? 0), 0, 100)
  const status = normalizeLower((input as Record<string, unknown>).status)
  if (progress <= 0 || progress >= 100 || ['completed', 'closed', 'cancelled', 'deleted', '\u5df2\u5b8c\u6210'].includes(status)) return null

  const latest = snapshots
    .map((snapshot) => parseDate(snapshot.snapshot_date ?? snapshot.created_at))
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => right.getTime() - left.getTime())[0]
  if (!latest) return null

  const gapDays = Math.max(0, (inclusiveDurationDays(latest, new Date()) ?? 1) - 1)
  const plannedStart = parseDate(input.plannedStartDate)
  const plannedEnd = parseDate(input.plannedEndDate)
  const plannedDuration = plannedStart && plannedEnd ? inclusiveDurationDays(plannedStart, plannedEnd) ?? 1 : null
  const curve = workContext?.progressCurve ?? null
  const warningThreshold = curve === 'hold'
    ? 10
    : progress >= 85
      ? 5
      : plannedDuration !== null && plannedDuration <= 7
        ? 2
        : 3
  const criticalThreshold = curve === 'hold'
    ? 21
    : progress >= 85
      ? 10
      : plannedDuration !== null && plannedDuration <= 7
        ? 5
        : 7
  if (gapDays < warningThreshold) return null

  return {
    code: 'snapshot_gap',
    severity: gapDays >= criticalThreshold ? 'critical' : 'warning',
    summary: 'Progress has not been updated recently, so the forecast can only use stale progress facts.',
    acknowledged: false,
    excludedFromVelocityLearning: true,
    metadata: {
      gap_days: gapDays,
      warning_threshold_days: warningThreshold,
      critical_threshold_days: criticalThreshold,
      latest_snapshot_date: latest.toISOString().slice(0, 10),
      progress,
      progress_curve: curve,
      planned_duration_days: plannedDuration,
    },
  }
}

function normalizeQualitySnapshots(snapshots: Array<Record<string, unknown>>): QualitySnapshot[] {
  return snapshots
    .map((snapshot) => {
      const date = parseDate(snapshot.snapshot_date ?? snapshot.created_at)
      if (!date) return null
      return {
        progress: clamp(Number(snapshot.progress ?? 0), 0, 100),
        date,
        source: normalizeLower(snapshot.event_source ?? snapshot.source ?? snapshot.created_by_source),
        notes: normalizeLower(snapshot.notes ?? snapshot.remark ?? snapshot.description),
        sourceConfidence: normalizeLower(snapshot.source_confidence),
        confirmationStatus: normalizeLower(snapshot.confirmation_status),
        confirmedAt: normalizeText(snapshot.confirmed_at),
        confirmedBy: normalizeText(snapshot.confirmed_by),
      }
    })
    .filter((snapshot): snapshot is QualitySnapshot => Boolean(snapshot))
    .sort((left, right) => left.date.getTime() - right.date.getTime())
}

function snapshotHasAcknowledgement(snapshot: QualitySnapshot) {
  if (['confirmed', 'acknowledged', 'verified', 'manual_confirmed'].includes(snapshot.confirmationStatus)) return true
  if (snapshot.confirmedAt || snapshot.confirmedBy) return true
  const marker = `${snapshot.source} ${snapshot.notes}`
  return ['confirmed', 'acknowledged', 'verified', 'manual_confirm', '\u5df2\u786e\u8ba4', '\u5df2\u590d\u6838'].some((token) => marker.includes(token))
}

function snapshotHasCorrectionMarker(snapshot: QualitySnapshot) {
  const marker = `${snapshot.source} ${snapshot.notes}`
  return ['correction', 'corrected', 'rollback', 'adjust', 'manual_fix', '\u4fee\u6b63', '\u66f4\u6b63', '\u56de\u9000'].some((token) => marker.includes(token))
}

function classifyProgressSnapshotSource(source: string) {
  if (!source) return 'unknown' as const
  if (['manual', 'user', 'task_dialog', 'progress_dialog', 'mobile', 'field_report', 'daily_report', 'site_report'].some((token) => source.includes(token))) return 'high' as const
  if (['import', 'excel', 'csv', 'bulk', 'migration', 'system', 'sync', 'batch', 'legacy'].some((token) => source.includes(token))) return 'low' as const
  if (['api', 'integration', 'automation'].some((token) => source.includes(token))) return 'medium' as const
  return 'unknown' as const
}

function classifyQualitySnapshotSource(snapshot: QualitySnapshot) {
  if (['high', 'medium', 'low', 'unknown'].includes(snapshot.sourceConfidence)) {
    return snapshot.sourceConfidence as 'high' | 'medium' | 'low' | 'unknown'
  }
  return classifyProgressSnapshotSource(snapshot.source)
}

function buildSourceLowConfidenceQualitySignal(snapshots: Array<Record<string, unknown>>): ProgressQualitySignal | null {
  const ordered = normalizeQualitySnapshots(snapshots)
  if (ordered.length === 0) return null

  const lowSourceSnapshots = ordered.filter((snapshot) => classifyQualitySnapshotSource(snapshot) === 'low')
  const unknownSourceSnapshots = ordered.filter((snapshot) => classifyQualitySnapshotSource(snapshot) === 'unknown')
  const lowRatio = lowSourceSnapshots.length / ordered.length
  const unknownRatio = unknownSourceSnapshots.length / ordered.length
  const latest = ordered[ordered.length - 1]
  const latestLow = classifyQualitySnapshotSource(latest) === 'low'
  const acknowledged = ordered.some(snapshotHasAcknowledgement)

  if (acknowledged) return null
  if (
    lowRatio < 0.6
    && !(latestLow && ordered.length >= 2)
    && !(unknownRatio >= 0.8 && ordered.length >= 3)
  ) return null

  return {
    code: 'source_low_confidence',
    severity: lowRatio >= 0.85 || (latestLow && latest.progress >= 100) ? 'warning' : 'info',
    summary: 'Progress snapshots mainly come from low-confidence import or batch sources.',
    acknowledged: false,
    excludedFromVelocityLearning: lowRatio >= 0.6,
    metadata: {
      snapshot_count: ordered.length,
      low_source_count: lowSourceSnapshots.length,
      unknown_source_count: unknownSourceSnapshots.length,
      low_source_ratio: Number(lowRatio.toFixed(3)),
      unknown_source_ratio: Number(unknownRatio.toFixed(3)),
      latest_event_source: latest.source || null,
      latest_source_confidence: classifyQualitySnapshotSource(latest),
      latest_progress: latest.progress,
    },
  }
}

function buildProgressRollbackQualitySignal(snapshots: Array<Record<string, unknown>>): ProgressQualitySignal | null {
  const ordered = normalizeQualitySnapshots(snapshots)
  if (ordered.length < 2) return null

  let strongest: ProgressQualitySignal | null = null
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]
    const current = ordered[index]
    const delta = current.progress - previous.progress
    if (delta > -5) continue

    const acknowledged = snapshotHasAcknowledgement(current) || snapshotHasCorrectionMarker(current)
    const severity: ProgressAnomalySeverity = Math.abs(delta) >= 25 && !acknowledged ? 'critical' : 'warning'
    const signal: ProgressQualitySignal = {
      code: 'progress_rollback',
      severity,
      summary: 'Progress was rolled back after a previous higher value; this is treated as correction evidence.',
      acknowledged,
      excludedFromVelocityLearning: !acknowledged || Math.abs(delta) >= 15,
      metadata: {
        previous_progress: previous.progress,
        current_progress: current.progress,
        progress_delta: delta,
        previous_snapshot_date: previous.date.toISOString().slice(0, 10),
        current_snapshot_date: current.date.toISOString().slice(0, 10),
        current_event_source: current.source || null,
        correction_marker: snapshotHasCorrectionMarker(current),
      },
    }
    if (!strongest || progressQualitySeverityRank(signal.severity) > progressQualitySeverityRank(strongest.severity)) {
      strongest = signal
    }
  }

  return strongest
}

function buildDuplicateProgressFillQualitySignal(snapshots: Array<Record<string, unknown>>): ProgressQualitySignal | null {
  const ordered = normalizeQualitySnapshots(snapshots)
    .filter((snapshot) => snapshot.progress > 0 && snapshot.progress < 100)
  if (ordered.length < 3) return null

  const groups = new Map<number, QualitySnapshot[]>()
  for (const snapshot of ordered) {
    const bucket = Math.round(snapshot.progress)
    groups.set(bucket, [...(groups.get(bucket) ?? []), snapshot])
  }

  let strongest: ProgressQualitySignal | null = null
  for (const [progress, group] of groups) {
    if (group.length < 3) continue
    const start = group[0]
    const end = group[group.length - 1]
    const spanDays = Math.max(0, (inclusiveDurationDays(start.date, end.date) ?? 1) - 1)
    const hasManualAcknowledgement = group.some(snapshotHasAcknowledgement)
    if (spanDays < 3 || hasManualAcknowledgement) continue
    const lowSourceCount = group.filter((snapshot) => classifyQualitySnapshotSource(snapshot) === 'low').length
    const severity: ProgressAnomalySeverity = spanDays >= 10 || lowSourceCount >= 3
      ? 'critical'
      : spanDays >= 5
        ? 'warning'
        : 'info'
    const signal: ProgressQualitySignal = {
      code: 'duplicate_progress_fill',
      severity,
      summary: 'The same progress value was recorded repeatedly across several days.',
      acknowledged: false,
      excludedFromVelocityLearning: spanDays >= 7,
      metadata: {
        progress,
        repeated_count: group.length,
        span_days: spanDays,
        first_snapshot_date: start.date.toISOString().slice(0, 10),
        latest_snapshot_date: end.date.toISOString().slice(0, 10),
        low_source_count: lowSourceCount,
      },
    }
    if (!strongest || progressQualitySeverityRank(signal.severity) > progressQualitySeverityRank(strongest.severity)) {
      strongest = signal
    }
  }

  return strongest
}

function normalizeProgressAnomalySignal(signal: ProgressAnomalySignal): ProgressQualitySignal {
  return {
    code: signal.code,
    severity: signal.severity,
    summary: signal.summary,
    acknowledged: signal.acknowledged,
    excludedFromVelocityLearning: signal.excludedFromVelocityLearning,
    metadata: signal.metadata,
  }
}

function selectPrimaryProgressQualitySignal(signals: ProgressQualitySignal[]) {
  const severityRank: Record<ProgressAnomalySeverity, number> = { info: 1, warning: 2, critical: 3 }
  const codeRank: Record<ProgressQualityCode, number> = {
    month_end_burst: 5,
    progress_jump: 4,
    stuck_finishing: 3,
    snapshot_gap: 2,
    progress_rollback: 4,
    duplicate_progress_fill: 2,
    source_low_confidence: 1,
  }
  return [...signals].sort((left, right) => {
    const severityDiff = severityRank[right.severity] - severityRank[left.severity]
    if (severityDiff !== 0) return severityDiff
    return codeRank[right.code] - codeRank[left.code]
  })[0] ?? null
}

function buildProgressQualityReason(primary: ProgressQualitySignal, input: {
  activeSignalCount: number
  acknowledgedCount: number
  resolvedOrIgnoredCount: number
  businessSupportedCloseout: boolean
}) {
  if (primary.code === 'snapshot_gap') return 'Progress has not been updated recently; the forecast keeps timing unchanged but lowers confidence.'
  if (primary.code === 'source_low_confidence') return 'Progress mostly comes from import, batch, or unknown sources; the forecast keeps dates unchanged but lowers confidence.'
  if (primary.code === 'progress_rollback') return 'Progress was corrected downward; the forecast keeps dates unchanged and treats this as lower-confidence evidence until stable updates resume.'
  if (primary.code === 'duplicate_progress_fill') return 'The same progress value was repeatedly filled over several days; trend learning is downgraded until fresh progress appears.'
  if (primary.code === 'month_end_burst') return 'Progress was concentrated near month end; trend analysis is retained only as low-confidence evidence.'
  if (primary.code === 'progress_jump') return 'Progress changed sharply between snapshots; forecast confidence is reduced until the entry is confirmed.'
  if (primary.code === 'stuck_finishing' && input.businessSupportedCloseout) {
    return 'Finishing progress is stagnant, but linked closeout facts explain the delay; this is treated mainly as business closeout evidence and only lightly lowers confidence.'
  }
  if (primary.code === 'stuck_finishing') return 'Progress is stuck near completion without enough supporting closeout facts; forecast confidence is reduced.'
  return 'Progress quality issue lowers forecast confidence without changing business dates.'
}

function calculateProgressQualityPenalty(signals: ProgressQualitySignal[], input: {
  acknowledgedCodes: Set<string>
  resolvedOrIgnoredCodes: Set<string>
  businessSupportedCloseout: boolean
}) {
  let penalty = 0
  for (const signal of signals) {
    const ruleCode = PROGRESS_QUALITY_RULE_CODE_BY_SIGNAL[signal.code]
    if (input.resolvedOrIgnoredCodes.has(ruleCode)) continue
    let signalPenalty = progressQualitySeverityPenalty(signal.severity)
    if (signal.acknowledged || input.acknowledgedCodes.has(ruleCode)) {
      signalPenalty = Math.max(
        PROGRESS_QUALITY_POLICY.acknowledgedPenaltyMin,
        Math.ceil(signalPenalty * PROGRESS_QUALITY_POLICY.acknowledgedPenaltyRatio),
      )
    }
    if (signal.code === 'stuck_finishing' && input.businessSupportedCloseout) {
      signalPenalty = Math.min(signalPenalty, PROGRESS_QUALITY_POLICY.closeoutSupportedPenaltyMax)
    }
    penalty = Math.max(penalty, signalPenalty)
  }
  const extraSignals = Math.max(0, signals.length - 1)
  return Math.min(PROGRESS_QUALITY_POLICY.maxConfidencePenalty, penalty + extraSignals * PROGRESS_QUALITY_POLICY.extraSignalPenalty)
}

function signalCodeFromDataQualityRule(ruleCode: unknown): ProgressQualityCode | null {
  const normalized = normalizeText(ruleCode).toUpperCase()
  const entry = Object.entries(PROGRESS_QUALITY_RULE_CODE_BY_SIGNAL)
    .find(([, value]) => value === normalized)
  return (entry?.[0] as ProgressQualityCode | undefined) ?? null
}

function dataQualityFindingToProgressQualitySignal(row: Record<string, unknown>): ProgressQualitySignal | null {
  const code = signalCodeFromDataQualityRule(row.rule_code)
  if (!code) return null
  const severity = normalizeLower(row.severity)
  const normalizedSeverity: ProgressAnomalySeverity = severity === 'critical'
    ? 'critical'
    : severity === 'info'
      ? 'info'
      : 'warning'
  return {
    code,
    severity: normalizedSeverity,
    summary: normalizeText(row.summary) || 'Progress data quality finding is active.',
    acknowledged: isDataQualityFindingAcknowledged(row),
    excludedFromVelocityLearning: true,
    metadata: {
      finding_id: row.id ?? null,
      finding_status: row.status ?? null,
      finding_rule_code: row.rule_code ?? null,
      details_json: row.details_json ?? null,
    },
  }
}

export async function buildProgressQualityFactor(
  input: DurationContextInput,
  runtimeCache?: ProgressQualityRuntimeCache,
): Promise<DurationContextFactor | null> {
  const taskId = normalizeId(input.taskId)
  if (!taskId) return null

  const [snapshots, findings, readinessRows] = await Promise.all([
    readDurationContextTaskProgressSnapshotRows({
      taskId,
      select: 'progress, snapshot_date, created_at, notes, event_source',
      limit: 20,
    }),
    loadProgressQualityFindings(taskId),
    loadProgressQualityActiveReadinessRows(input, runtimeCache),
  ])

  const workContext = await resolveProgressQualityWorkContext(input)
  const anomalySignals = snapshots.length >= 2
    ? detectProgressAnomalySignals(snapshots).map(normalizeProgressAnomalySignal)
    : []
  const snapshotGapSignal = buildSnapshotGapQualitySignal(input, snapshots, workContext)
  const sourceSignal = buildSourceLowConfidenceQualitySignal(snapshots)
  const rollbackSignal = buildProgressRollbackQualitySignal(snapshots)
  const duplicateFillSignal = buildDuplicateProgressFillQualitySignal(snapshots)
  const findingSignals = findings
    .filter((finding) => !isDataQualityFindingResolved(finding))
    .map(dataQualityFindingToProgressQualitySignal)
    .filter((signal): signal is ProgressQualitySignal => Boolean(signal))

  const signalByCode = new Map<ProgressQualityCode, ProgressQualitySignal>()
  for (const signal of [
    ...anomalySignals,
    ...(snapshotGapSignal ? [snapshotGapSignal] : []),
    ...(sourceSignal ? [sourceSignal] : []),
    ...(rollbackSignal ? [rollbackSignal] : []),
    ...(duplicateFillSignal ? [duplicateFillSignal] : []),
    ...findingSignals,
  ]) {
    const current = signalByCode.get(signal.code)
    if (!current || progressQualitySeverityPenalty(signal.severity) > progressQualitySeverityPenalty(current.severity)) {
      signalByCode.set(signal.code, signal)
    }
  }

  const allSignals = [...signalByCode.values()]
  if (allSignals.length === 0) return null

  const resolvedOrIgnoredCodes = new Set(findings
    .filter(isDataQualityFindingResolved)
    .map((finding) => normalizeText(finding.rule_code).toUpperCase()))
  const acknowledgedCodes = new Set(findings
    .filter(isDataQualityFindingAcknowledged)
    .map((finding) => normalizeText(finding.rule_code).toUpperCase()))
  const activeSignals = allSignals.filter((signal) => !resolvedOrIgnoredCodes.has(PROGRESS_QUALITY_RULE_CODE_BY_SIGNAL[signal.code]))
  if (activeSignals.length === 0) return null

  const finishingReason = activeSignals.some((signal) => signal.code === 'stuck_finishing')
    ? inferFinishingStagnationReason(readinessRows)
    : null
  const businessSupportedCloseout = Boolean(finishingReason && finishingReason !== 'physical_closeout')
  const primary = selectPrimaryProgressQualitySignal(activeSignals)
  if (!primary) return null

  const confidencePenalty = calculateProgressQualityPenalty(activeSignals, {
    acknowledgedCodes,
    resolvedOrIgnoredCodes,
    businessSupportedCloseout,
  })
  if (confidencePenalty <= 0) return null
  const acknowledgedCount = activeSignals.filter((signal) => signal.acknowledged || acknowledgedCodes.has(PROGRESS_QUALITY_RULE_CODE_BY_SIGNAL[signal.code])).length
  const resolvedOrIgnoredCount = allSignals.length - activeSignals.length
  const planReferenceFallbackRecommended = confidencePenalty >= PROGRESS_QUALITY_POLICY.planReferenceFallbackPenalty
    || activeSignals.some((signal) => signal.code === 'progress_rollback' && signal.severity === 'critical')
  const sampleEligibility = confidencePenalty >= PROGRESS_QUALITY_POLICY.excludeLearningPenalty || planReferenceFallbackRecommended
    ? 'exclude_duration_learning'
    : confidencePenalty >= PROGRESS_QUALITY_POLICY.downgradeLearningPenalty
      ? 'downgrade_duration_learning'
      : 'retain_with_lower_confidence'

  return {
    key: 'progress_quality',
    label: 'progress quality',
    multiplier: 1,
    extraDays: 0,
    confidenceDelta: -confidencePenalty,
    actionPolicy: 'confidence_only',
    dataDependencies: ['task_progress_snapshots', 'data_quality_findings'],
    reason: buildProgressQualityReason(primary, {
      activeSignalCount: activeSignals.length,
      acknowledgedCount,
      resolvedOrIgnoredCount,
      businessSupportedCloseout,
    }),
    source: 'task_fact',
    metadata: {
      anomalyCodes: activeSignals.map((signal) => signal.code),
      acknowledged: acknowledgedCount > 0,
      acknowledgedCount,
      resolvedOrIgnoredCount,
      excludedFromVelocityLearning: activeSignals.some((signal) => signal.excludedFromVelocityLearning),
      severityByCode: Object.fromEntries(activeSignals.map((signal) => [signal.code, signal.severity])),
      confidencePenalty,
      progressQualityPolicy: PROGRESS_QUALITY_POLICY,
      planReferenceFallbackPolicy: planReferenceFallbackRecommended ? 'plan_reference_ratio_only' : 'none',
      planReferenceFallbackRecommended,
      planReferenceFallbackReason: planReferenceFallbackRecommended
        ? 'Serious progress quality anomalies make execution-derived remaining-duration candidates unreliable.'
        : null,
      snapshotCount: snapshots.length,
      businessSupportedCloseout,
      finishingStagnationReason: finishingReason,
      dataQualityRuleCodes: activeSignals.map((signal) => PROGRESS_QUALITY_RULE_CODE_BY_SIGNAL[signal.code]),
      primaryMetadata: primary.metadata,
      progressCurveSource: workContext.progressCurveSource,
      learningObservation: {
        observationType: 'progress_quality_pattern',
        candidateKey: activeSignals.map((signal) => signal.code).sort().join('+'),
        sampleEligibility,
        signalCount: activeSignals.length,
        strongestSeverity: primary.severity,
        source: 'duration_context.progress_quality',
      },
    },
  }
}
