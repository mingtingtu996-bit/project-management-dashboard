import type { TaskProgressSnapshot } from '../types/db.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'
import {
  classifyProgressSnapshotSource,
  normalizeProgressSnapshotSource,
} from '../utils/progressSnapshotSource.js'

export {
  classifyProgressSnapshotSource,
  normalizeProgressSnapshotSource,
} from '../utils/progressSnapshotSource.js'

export type ProgressAnomalyCode = 'month_end_burst' | 'stuck_finishing' | 'progress_jump'
export type ProgressQualityCode =
  | ProgressAnomalyCode
  | 'source_low_confidence'
  | 'progress_rollback'
  | 'duplicate_progress_fill'
export type ProgressAnomalySeverity = 'info' | 'warning' | 'critical'

export interface ProgressAnomalySnapshot {
  task_id?: string | null
  progress?: number | null
  snapshot_date?: string | null
  created_at?: string | null
  notes?: string | null
  event_source?: string | null
  source_confidence?: string | null
  confirmation_status?: string | null
  confirmed_at?: string | null
  confirmed_by?: string | null
}

export interface ProgressAnomalySignal {
  code: ProgressAnomalyCode
  severity: ProgressAnomalySeverity
  summary: string
  confidenceAction: 'confidence_only'
  excludedFromVelocityLearning: boolean
  acknowledged: boolean
  metadata: Record<string, unknown>
}

export interface ProgressQualitySignal extends Omit<ProgressAnomalySignal, 'code'> {
  code: ProgressQualityCode
}

function parseDate(value?: string | null) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function snapshotGapDays(left: Date, right: Date) {
  return Math.max(0, signedDurationDayDelta(left, right) ?? 0)
}

function readProgress(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function snapshotTime(snapshot: ProgressAnomalySnapshot) {
  return parseDate(snapshot.snapshot_date ?? snapshot.created_at ?? null)
}

function normalizeSnapshots(snapshots: Array<ProgressAnomalySnapshot | TaskProgressSnapshot>) {
  return snapshots
    .map((snapshot) => ({
      ...snapshot,
      progress: readProgress(snapshot.progress),
      date: snapshotTime(snapshot),
    }))
    .filter((snapshot): snapshot is ProgressAnomalySnapshot & { progress: number; date: Date } => Boolean(snapshot.date))
    .sort((left, right) => left.date.getTime() - right.date.getTime())
}

function isAcknowledged(snapshot: ProgressAnomalySnapshot) {
  const confirmationStatus = normalizeText(snapshot.confirmation_status)
  if (['confirmed', 'acknowledged', 'verified', 'manual_confirmed'].includes(confirmationStatus)) return true
  if (snapshot.confirmed_at || snapshot.confirmed_by) return true

  const marker = `${snapshot.notes ?? ''} ${snapshot.event_source ?? ''}`.toLowerCase()
  return marker.includes('confirmed')
    || marker.includes('acknowledged')
    || marker.includes('verified')
    || marker.includes('已确认')
    || marker.includes('已核实')
}

function hasCorrectionMarker(snapshot: ProgressAnomalySnapshot) {
  const marker = `${snapshot.notes ?? ''} ${snapshot.event_source ?? ''}`.toLowerCase()
  return marker.includes('correction')
    || marker.includes('corrected')
    || marker.includes('rollback')
    || marker.includes('adjust')
    || marker.includes('manual_fix')
    || marker.includes('修正')
    || marker.includes('更正')
    || marker.includes('回退')
}

function hasAcknowledgement(snapshots: ProgressAnomalySnapshot[]) {
  return snapshots.some(isAcknowledged)
}

function lastProductionDatesOfMonth(date: Date, count = 3) {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const cursor = new Date(Date.UTC(year, month + 1, 0))
  const result: string[] = []

  while (result.length < count && cursor.getUTCMonth() === month) {
    result.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return new Set(result)
}

function isLastThreeProductionDays(date: Date) {
  return lastProductionDatesOfMonth(date).has(date.toISOString().slice(0, 10))
}

export function detectProgressAnomalySignals(
  snapshots: Array<ProgressAnomalySnapshot | TaskProgressSnapshot>,
): ProgressAnomalySignal[] {
  const ordered = normalizeSnapshots(snapshots)
  if (ordered.length < 2) return []

  const signals: ProgressAnomalySignal[] = []

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]
    const current = ordered[index]
    const progressDelta = current.progress - previous.progress
    const dayGap = Math.max(1, snapshotGapDays(previous.date, current.date))
    const acknowledged = hasAcknowledgement([previous, current])

    if (progressDelta > 30 && isLastThreeProductionDays(current.date)) {
      signals.push({
        code: 'month_end_burst',
        severity: progressDelta >= 60 ? 'critical' : 'warning',
        summary: 'Progress changed sharply in the last three effective construction days of a month.',
        confidenceAction: 'confidence_only',
        excludedFromVelocityLearning: true,
        acknowledged,
        metadata: {
          previous_progress: previous.progress,
          current_progress: current.progress,
          progress_delta: progressDelta,
          snapshot_date: current.date.toISOString().slice(0, 10),
          days_between: dayGap,
        },
      })
    }

    if (Math.abs(progressDelta) > 50 && dayGap <= 3) {
      signals.push({
        code: 'progress_jump',
        severity: Math.abs(progressDelta) >= 70 || dayGap <= 1 ? 'critical' : 'warning',
        summary: 'Progress jumped by more than 50 percent within three days.',
        confidenceAction: 'confidence_only',
        excludedFromVelocityLearning: true,
        acknowledged,
        metadata: {
          previous_progress: previous.progress,
          current_progress: current.progress,
          progress_delta: progressDelta,
          snapshot_date: current.date.toISOString().slice(0, 10),
          days_between: dayGap,
        },
      })
    }
  }

  const latest = ordered[ordered.length - 1]
  if (latest.progress >= 85 && latest.progress < 100) {
    let plateauStart = latest
    for (let index = ordered.length - 2; index >= 0; index -= 1) {
      if (Math.abs(ordered[index].progress - latest.progress) > 0.001) break
      plateauStart = ordered[index]
    }

    const stuckDays = snapshotGapDays(plateauStart.date, latest.date)
    if (stuckDays > 14) {
      signals.push({
        code: 'stuck_finishing',
        severity: stuckDays >= 28 ? 'critical' : 'warning',
        summary: 'Progress stayed between 85 and 99 percent for more than 14 days without change.',
        confidenceAction: 'confidence_only',
        excludedFromVelocityLearning: true,
        acknowledged: hasAcknowledgement(ordered),
        metadata: {
          progress: latest.progress,
          plateau_start_date: plateauStart.date.toISOString().slice(0, 10),
          latest_snapshot_date: latest.date.toISOString().slice(0, 10),
          stuck_days: stuckDays,
        },
      })
    }
  }

  const strongestByCode = new Map<ProgressAnomalyCode, ProgressAnomalySignal>()
  const rank = { info: 1, warning: 2, critical: 3 } satisfies Record<ProgressAnomalySeverity, number>
  for (const signal of signals) {
    const current = strongestByCode.get(signal.code)
    if (!current || rank[signal.severity] > rank[current.severity]) {
      strongestByCode.set(signal.code, signal)
    }
  }

  return [...strongestByCode.values()]
}

function buildSourceLowConfidenceSignal(
  snapshots: Array<ProgressAnomalySnapshot | TaskProgressSnapshot>,
): ProgressQualitySignal | null {
  const ordered = normalizeSnapshots(snapshots)
  if (ordered.length === 0) return null

  const lowSourceSnapshots = ordered.filter((snapshot) => classifyProgressSnapshotSource(snapshot) === 'low')
  const unknownSourceSnapshots = ordered.filter((snapshot) => classifyProgressSnapshotSource(snapshot) === 'unknown')
  const lowRatio = lowSourceSnapshots.length / ordered.length
  const unknownRatio = unknownSourceSnapshots.length / ordered.length
  const latest = ordered[ordered.length - 1]
  const latestLow = classifyProgressSnapshotSource(latest) === 'low'
  const acknowledged = hasAcknowledgement(ordered)

  if (acknowledged) return null
  if (
    lowRatio < 0.6
    && !(latestLow && ordered.length >= 2)
    && !(unknownRatio >= 0.8 && ordered.length >= 3)
  ) return null

  return {
    code: 'source_low_confidence',
    severity: lowRatio >= 0.85 || (latestLow && latest.progress >= 100) ? 'warning' : 'info',
    summary: 'Progress snapshots mainly come from import, batch, or unknown sources.',
    confidenceAction: 'confidence_only',
    excludedFromVelocityLearning: lowRatio >= 0.6,
    acknowledged: false,
    metadata: {
      snapshot_count: ordered.length,
      low_source_count: lowSourceSnapshots.length,
      unknown_source_count: unknownSourceSnapshots.length,
      low_source_ratio: Number(lowRatio.toFixed(3)),
      unknown_source_ratio: Number(unknownRatio.toFixed(3)),
      latest_event_source: normalizeProgressSnapshotSource(latest.event_source),
      latest_source_confidence: classifyProgressSnapshotSource(latest),
      latest_progress: latest.progress,
    },
  }
}

function buildProgressRollbackSignal(
  snapshots: Array<ProgressAnomalySnapshot | TaskProgressSnapshot>,
): ProgressQualitySignal | null {
  const ordered = normalizeSnapshots(snapshots)
  if (ordered.length < 2) return null

  let strongest: ProgressQualitySignal | null = null
  const rank = { info: 1, warning: 2, critical: 3 } satisfies Record<ProgressAnomalySeverity, number>
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]
    const current = ordered[index]
    const delta = current.progress - previous.progress
    if (delta > -5) continue

    const acknowledged = isAcknowledged(current) || hasCorrectionMarker(current)
    const signal: ProgressQualitySignal = {
      code: 'progress_rollback',
      severity: Math.abs(delta) >= 25 && !acknowledged ? 'critical' : 'warning',
      summary: 'Progress was corrected downward after a previous higher value.',
      confidenceAction: 'confidence_only',
      excludedFromVelocityLearning: !acknowledged || Math.abs(delta) >= 15,
      acknowledged,
      metadata: {
        previous_progress: previous.progress,
        current_progress: current.progress,
        progress_delta: delta,
        previous_snapshot_date: previous.date.toISOString().slice(0, 10),
        current_snapshot_date: current.date.toISOString().slice(0, 10),
        current_event_source: normalizeProgressSnapshotSource(current.event_source),
        current_source_confidence: classifyProgressSnapshotSource(current),
        correction_marker: hasCorrectionMarker(current),
      },
    }
    if (!strongest || rank[signal.severity] > rank[strongest.severity]) strongest = signal
  }
  return strongest
}

function buildDuplicateProgressFillSignal(
  snapshots: Array<ProgressAnomalySnapshot | TaskProgressSnapshot>,
): ProgressQualitySignal | null {
  const ordered = normalizeSnapshots(snapshots).filter((snapshot) => snapshot.progress > 0 && snapshot.progress < 100)
  if (ordered.length < 3) return null

  const groups = new Map<number, typeof ordered>()
  for (const snapshot of ordered) {
    const bucket = Math.round(snapshot.progress)
    groups.set(bucket, [...(groups.get(bucket) ?? []), snapshot])
  }

  let strongest: ProgressQualitySignal | null = null
  const rank = { info: 1, warning: 2, critical: 3 } satisfies Record<ProgressAnomalySeverity, number>
  for (const [progress, group] of groups) {
    if (group.length < 3 || hasAcknowledgement(group)) continue
    const start = group[0]
    const end = group[group.length - 1]
    const spanDays = snapshotGapDays(start.date, end.date)
    if (spanDays < 3) continue

    const lowSourceCount = group.filter((snapshot) => classifyProgressSnapshotSource(snapshot) === 'low').length
    const signal: ProgressQualitySignal = {
      code: 'duplicate_progress_fill',
      severity: spanDays >= 10 || lowSourceCount >= 3
        ? 'critical'
        : spanDays >= 5
          ? 'warning'
          : 'info',
      summary: 'The same progress value was recorded repeatedly across several days.',
      confidenceAction: 'confidence_only',
      excludedFromVelocityLearning: spanDays >= 7,
      acknowledged: false,
      metadata: {
        progress,
        repeated_count: group.length,
        span_days: spanDays,
        first_snapshot_date: start.date.toISOString().slice(0, 10),
        latest_snapshot_date: end.date.toISOString().slice(0, 10),
        low_source_count: lowSourceCount,
      },
    }
    if (!strongest || rank[signal.severity] > rank[strongest.severity]) strongest = signal
  }
  return strongest
}

export function detectProgressQualitySignals(
  snapshots: Array<ProgressAnomalySnapshot | TaskProgressSnapshot>,
): ProgressQualitySignal[] {
  const signals: ProgressQualitySignal[] = [
    ...detectProgressAnomalySignals(snapshots),
  ]
  const sourceSignal = buildSourceLowConfidenceSignal(snapshots)
  const rollbackSignal = buildProgressRollbackSignal(snapshots)
  const duplicateSignal = buildDuplicateProgressFillSignal(snapshots)
  for (const signal of [sourceSignal, rollbackSignal, duplicateSignal]) {
    if (signal) signals.push(signal)
  }
  return signals
}

export function hasVelocityLearningBlockingAnomaly(
  snapshots: Array<ProgressAnomalySnapshot | TaskProgressSnapshot>,
) {
  return detectProgressAnomalySignals(snapshots).some((signal) => signal.excludedFromVelocityLearning)
}
