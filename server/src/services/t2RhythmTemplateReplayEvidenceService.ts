import {
  type T2RhythmTemplateReplayAcceptanceResult,
  evaluateT2RhythmTemplateReplayAcceptance,
} from './t2RhythmTemplateReplayAcceptanceService.js'
import type { T2RhythmScheduleCandidatePackage } from './t2DivisionRhythmTemplateRegistryService.js'
import {
  productionDaysBetweenInclusive,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import {
  delayDayDelta,
  normalizeDurationDateUtc,
} from '../utils/durationDays.js'

export type T2RhythmTemplateReplayEvidenceSample = {
  sampleId: string
  projectId?: string | null
  workfaceKey?: string | null
  windowCode: string
  plannedWindowDurationDays: number
  templateP80WindowDurationDays: number
  plannedGateDate?: string | Date | null
  actualGateDate?: string | Date | null
  actualStartDate?: string | Date | null
  actualEndDate?: string | Date | null
  predecessorActualEndDate?: string | Date | null
  dependencySatisfied?: boolean | null
  evidenceRef?: string | null
}

export type T2RhythmTemplateReplayEvidenceInput = {
  templateId: string
  samples: T2RhythmTemplateReplayEvidenceSample[]
  calendar?: ConstructionCalendarContext | null
}

export type T2RhythmReplayTaskActualRow = {
  id?: string | null
  project_id?: string | null
  projectId?: string | null
  title?: string | null
  standard_work_code?: string | null
  standardWorkCode?: string | null
  standard_work_name?: string | null
  standardWorkName?: string | null
  specialty_type?: string | null
  specialtyType?: string | null
  planned_start_date?: string | Date | null
  plannedStartDate?: string | Date | null
  start_date?: string | Date | null
  planned_end_date?: string | Date | null
  plannedEndDate?: string | Date | null
  end_date?: string | Date | null
  actual_start_date?: string | Date | null
  actualStartDate?: string | Date | null
  actual_end_date?: string | Date | null
  actualEndDate?: string | Date | null
  predecessor_actual_end_date?: string | Date | null
  predecessorActualEndDate?: string | Date | null
  dependency_satisfied?: boolean | null
  dependencySatisfied?: boolean | null
  standard_task_metadata?: Record<string, unknown> | null
  standardTaskMetadata?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

export type T2RhythmReplayTaskActualAdapterInput = {
  candidatePackage: T2RhythmScheduleCandidatePackage
  tasks: T2RhythmReplayTaskActualRow[]
  calendar?: ConstructionCalendarContext | null
}

export type T2RhythmReplayTaskActualRejectedRow = {
  rowId: string
  reasonCode:
    | 'missing_row_id'
    | 'missing_t2_window_code'
    | 'unknown_t2_window_code'
    | 'missing_actual_window_dates'
    | 'invalid_planned_window_dates'
    | 'missing_template_p80_window_duration'
  detail: string
  observedWindowCode?: string
}

export type T2RhythmReplayTaskActualAdapterResult = {
  samples: T2RhythmTemplateReplayEvidenceSample[]
  rejectedRows: T2RhythmReplayTaskActualRejectedRow[]
  governance: {
    source: 'task_actual_rows_to_t2_window_replay_samples'
    directSeedMutationAllowed: false
    writesPlanDates: false
    writesTaskDependencies: false
  }
}

export type T2RhythmTemplateReplaySampleQualityIssue = {
  sampleId: string
  issueCode:
    | 'missing_actual_window_dates'
    | 'invalid_actual_window_order'
    | 'missing_planned_window_duration'
    | 'missing_template_p80_window_duration'
    | 'dependency_violation'
  detail: string
}

export type T2RhythmTemplateReplayEvidenceResult = {
  templateId: string
  metrics: {
    sampleCount: number
    comparableWorkfaceWindowCount: number
    p80CaptureRate: number
    medianAbsoluteErrorDays: number
    gateSlipMedianDays: number
    dependencyViolationRate: number
  }
  evidenceRefs: string[]
  sampleQualityIssues: T2RhythmTemplateReplaySampleQualityIssue[]
  acceptance: T2RhythmTemplateReplayAcceptanceResult
  governance: {
    source: 't2_window_actual_replay_evidence'
    directSeedMutationAllowed: false
    writesPlanDates: false
    writesTaskDependencies: false
    requiresL5Publication: true
  }
}

function finitePositiveNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function actualWindowDurationDays(
  sample: T2RhythmTemplateReplayEvidenceSample,
  calendar?: ConstructionCalendarContext | null,
) {
  const start = normalizeDurationDateUtc(sample.actualStartDate)
  const end = normalizeDurationDateUtc(sample.actualEndDate)
  if (!start || !end) return null
  if (end.getTime() < start.getTime()) return null
  return productionDaysBetweenInclusive(start, end, calendar)
}

function plannedWindowDurationDays(
  startValue: string | Date | null | undefined,
  endValue: string | Date | null | undefined,
  calendar?: ConstructionCalendarContext | null,
) {
  const start = normalizeDurationDateUtc(startValue)
  const end = normalizeDurationDateUtc(endValue)
  if (!start || !end || end.getTime() < start.getTime()) return null
  const days = productionDaysBetweenInclusive(start, end, calendar)
  return days > 0 ? days : null
}

function collectEvidenceRefs(samples: T2RhythmTemplateReplayEvidenceSample[]) {
  return Array.from(new Set(samples
    .map((sample) => String(sample.evidenceRef ?? '').trim())
    .filter(Boolean)))
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readFirstText(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return null
}

function readFirstBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (['true', '1', 'yes', 'y'].includes(normalized)) return true
      if (['false', '0', 'no', 'n'].includes(normalized)) return false
    }
  }
  return null
}

function readTaskMetadata(task: T2RhythmReplayTaskActualRow) {
  return {
    ...readRecord(task.metadata),
    ...readRecord(task.standard_task_metadata),
    ...readRecord(task.standardTaskMetadata),
  }
}

function readWindowCode(task: T2RhythmReplayTaskActualRow, metadata: Record<string, unknown>) {
  return readFirstText(
    metadata.t2RhythmWindowCode,
    metadata.t2_rhythm_window_code,
    metadata.rhythmWindowCode,
    metadata.rhythm_window_code,
    metadata.windowCode,
    metadata.window_code,
  )
}

function canonicalWindowToken(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function windowSuffix(value: unknown) {
  const text = normalizeText(value)
  const parts = text.split(':').map((part) => part.trim()).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : text
}

function buildWindowCodeLookup(candidatePackage: T2RhythmScheduleCandidatePackage) {
  const canonicalToWindow = new Map<string, string | null>()
  const remember = (alias: unknown, windowCode: string) => {
    const key = canonicalWindowToken(alias)
    if (!key) return
    const existing = canonicalToWindow.get(key)
    canonicalToWindow.set(key, existing && existing !== windowCode ? null : windowCode)
  }

  for (const window of candidatePackage.packageWindows) {
    remember(window.windowCode, window.windowCode)
    remember(windowSuffix(window.windowCode), window.windowCode)
    remember(`${window.templateId}:${windowSuffix(window.windowCode)}`, window.windowCode)
    remember(`${window.templateId}:${window.role}`, window.windowCode)
    remember(window.role, window.windowCode)
  }

  return canonicalToWindow
}

function resolvePackageWindowCode(rawWindowCode: string, windowCodeLookup: Map<string, string | null>) {
  const resolved = windowCodeLookup.get(canonicalWindowToken(rawWindowCode))
  return resolved ?? null
}

function readDateValue(value: unknown): string | Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const text = value.trim()
    return text || null
  }
  return null
}

function readTaskDate(
  task: T2RhythmReplayTaskActualRow,
  camelKey: keyof T2RhythmReplayTaskActualRow,
  snakeKey: keyof T2RhythmReplayTaskActualRow,
  fallbackKey?: keyof T2RhythmReplayTaskActualRow,
) {
  for (const key of [snakeKey, camelKey, fallbackKey].filter(Boolean) as Array<keyof T2RhythmReplayTaskActualRow>) {
    const value = readDateValue(task[key])
    if (value) return value
  }
  return null
}

function rejectRow(
  rejectedRows: T2RhythmReplayTaskActualRejectedRow[],
  rowId: string,
  reasonCode: T2RhythmReplayTaskActualRejectedRow['reasonCode'],
  detail: string,
  observedWindowCode?: string | null,
) {
  const normalizedObservedWindowCode = normalizeText(observedWindowCode)
  rejectedRows.push({
    rowId,
    reasonCode,
    detail,
    ...(normalizedObservedWindowCode ? { observedWindowCode: normalizedObservedWindowCode } : {}),
  })
}

export function buildT2RhythmReplaySamplesFromTaskActuals(
  input: T2RhythmReplayTaskActualAdapterInput,
): T2RhythmReplayTaskActualAdapterResult {
  const samples: T2RhythmTemplateReplayEvidenceSample[] = []
  const rejectedRows: T2RhythmReplayTaskActualRejectedRow[] = []
  const windowsByCode = new Map(input.candidatePackage.packageWindows.map((window) => [window.windowCode, window]))
  const windowCodeLookup = buildWindowCodeLookup(input.candidatePackage)

  for (const task of input.tasks) {
    const rowId = readFirstText(task.id)
    if (!rowId) {
      rejectRow(rejectedRows, 'unknown', 'missing_row_id', 'Task actual row must have an id before it can become T2 replay evidence.')
      continue
    }
    const metadata = readTaskMetadata(task)
    const windowCode = readWindowCode(task, metadata)
    if (!windowCode) {
      rejectRow(rejectedRows, rowId, 'missing_t2_window_code', 'Task actual row does not declare a T2 rhythm window code.')
      continue
    }
    const resolvedWindowCode = resolvePackageWindowCode(windowCode, windowCodeLookup)
    const packageWindow = resolvedWindowCode ? windowsByCode.get(resolvedWindowCode) : null
    if (!packageWindow) {
      rejectRow(
        rejectedRows,
        rowId,
        'unknown_t2_window_code',
        'Task actual row references a T2 rhythm window code that is not in the candidate package.',
        windowCode,
      )
      continue
    }

    const actualStartDate = readTaskDate(task, 'actualStartDate', 'actual_start_date')
    const actualEndDate = readTaskDate(task, 'actualEndDate', 'actual_end_date')
    if (!normalizeDurationDateUtc(actualStartDate) || !normalizeDurationDateUtc(actualEndDate)) {
      rejectRow(rejectedRows, rowId, 'missing_actual_window_dates', 'Task actual row needs actual start and end dates before replay.')
      continue
    }

    const plannedStartDate = readTaskDate(task, 'plannedStartDate', 'planned_start_date', 'start_date')
    const plannedEndDate = readTaskDate(task, 'plannedEndDate', 'planned_end_date', 'end_date')
    const plannedDurationDays = plannedWindowDurationDays(plannedStartDate, plannedEndDate, input.calendar)
    if (plannedDurationDays === null) {
      rejectRow(rejectedRows, rowId, 'invalid_planned_window_dates', 'Task actual row needs ordered planned start and end dates before replay.')
      continue
    }
    const templateP80WindowDurationDays = finitePositiveNumber(packageWindow.durationDays)
    if (templateP80WindowDurationDays === null) {
      rejectRow(rejectedRows, rowId, 'missing_template_p80_window_duration', 'Candidate package window does not expose a usable template duration.')
      continue
    }

    samples.push({
      sampleId: `task:${rowId}`,
      projectId: readFirstText(task.project_id, task.projectId),
      workfaceKey: readFirstText(metadata.workfaceKey, metadata.workface_key, metadata.scopeKey, metadata.scope_key),
      windowCode: packageWindow.windowCode,
      plannedWindowDurationDays: plannedDurationDays,
      templateP80WindowDurationDays,
      plannedGateDate: plannedEndDate,
      actualGateDate: actualEndDate,
      actualStartDate,
      actualEndDate,
      predecessorActualEndDate: readTaskDate(task, 'predecessorActualEndDate', 'predecessor_actual_end_date') ?? null,
      dependencySatisfied: readFirstBoolean(
        task.dependency_satisfied,
        task.dependencySatisfied,
        metadata.dependencySatisfied,
        metadata.dependency_satisfied,
      ),
      evidenceRef: `tasks:${rowId}`,
    })
  }

  return {
    samples,
    rejectedRows,
    governance: {
      source: 'task_actual_rows_to_t2_window_replay_samples',
      directSeedMutationAllowed: false,
      writesPlanDates: false,
      writesTaskDependencies: false,
    },
  }
}

export function buildT2RhythmTemplateReplayEvidence(
  input: T2RhythmTemplateReplayEvidenceInput,
): T2RhythmTemplateReplayEvidenceResult {
  const sampleQualityIssues: T2RhythmTemplateReplaySampleQualityIssue[] = []
  const absoluteErrors: number[] = []
  const gateSlips: number[] = []
  let p80CapturedCount = 0
  let comparableWorkfaceWindowCount = 0
  let dependencyCheckedCount = 0
  let dependencyViolationCount = 0

  for (const sample of input.samples) {
    const plannedDuration = finitePositiveNumber(sample.plannedWindowDurationDays)
    const templateP80Duration = finitePositiveNumber(sample.templateP80WindowDurationDays)
    const actualDuration = actualWindowDurationDays(sample, input.calendar)

    if (!normalizeDurationDateUtc(sample.actualStartDate) || !normalizeDurationDateUtc(sample.actualEndDate)) {
      sampleQualityIssues.push({
        sampleId: sample.sampleId,
        issueCode: 'missing_actual_window_dates',
        detail: 'Actual start and end dates are required before a T2 window can join replay evidence.',
      })
      continue
    }
    if (actualDuration === null) {
      sampleQualityIssues.push({
        sampleId: sample.sampleId,
        issueCode: 'invalid_actual_window_order',
        detail: 'Actual end date is earlier than actual start date.',
      })
      continue
    }
    if (plannedDuration === null) {
      sampleQualityIssues.push({
        sampleId: sample.sampleId,
        issueCode: 'missing_planned_window_duration',
        detail: 'Planned window duration is required for median absolute error replay.',
      })
      continue
    }
    if (templateP80Duration === null) {
      sampleQualityIssues.push({
        sampleId: sample.sampleId,
        issueCode: 'missing_template_p80_window_duration',
        detail: 'Template P80 window duration is required for P80 capture replay.',
      })
      continue
    }

    comparableWorkfaceWindowCount += 1
    absoluteErrors.push(Math.abs(actualDuration - plannedDuration))
    if (actualDuration <= templateP80Duration) p80CapturedCount += 1

    const slip = delayDayDelta(sample.plannedGateDate, sample.actualGateDate, input.calendar)
    if (slip !== null) gateSlips.push(Math.max(0, slip))

    if (sample.dependencySatisfied !== null && sample.dependencySatisfied !== undefined) {
      dependencyCheckedCount += 1
      if (sample.dependencySatisfied === false) {
        dependencyViolationCount += 1
        sampleQualityIssues.push({
          sampleId: sample.sampleId,
          issueCode: 'dependency_violation',
          detail: 'Actual replay shows the T2 window dependency was not satisfied.',
        })
      }
    } else if (sample.predecessorActualEndDate) {
      dependencyCheckedCount += 1
      const predecessorEnd = normalizeDurationDateUtc(sample.predecessorActualEndDate)
      const actualStart = normalizeDurationDateUtc(sample.actualStartDate)
      if (predecessorEnd && actualStart && actualStart.getTime() < predecessorEnd.getTime()) {
        dependencyViolationCount += 1
        sampleQualityIssues.push({
          sampleId: sample.sampleId,
          issueCode: 'dependency_violation',
          detail: 'Actual start date is earlier than predecessor actual end date.',
        })
      }
    }
  }

  const metrics = {
    sampleCount: input.samples.length,
    comparableWorkfaceWindowCount,
    p80CaptureRate: comparableWorkfaceWindowCount > 0 ? roundMetric(p80CapturedCount / comparableWorkfaceWindowCount) : 0,
    medianAbsoluteErrorDays: roundMetric(median(absoluteErrors)),
    gateSlipMedianDays: roundMetric(median(gateSlips)),
    dependencyViolationRate: dependencyCheckedCount > 0 ? roundMetric(dependencyViolationCount / dependencyCheckedCount) : 0,
  }
  const evidenceRefs = collectEvidenceRefs(input.samples)
  const acceptance = evaluateT2RhythmTemplateReplayAcceptance({
    templateId: input.templateId,
    ...metrics,
    evidenceRefs,
  })

  return {
    templateId: input.templateId,
    metrics,
    evidenceRefs,
    sampleQualityIssues,
    acceptance,
    governance: {
      source: 't2_window_actual_replay_evidence',
      directSeedMutationAllowed: false,
      writesPlanDates: false,
      writesTaskDependencies: false,
      requiresL5Publication: true,
    },
  }
}
