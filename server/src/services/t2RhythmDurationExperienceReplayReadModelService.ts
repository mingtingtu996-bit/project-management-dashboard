import type { T2RhythmScheduleCandidatePackage } from './t2DivisionRhythmTemplateRegistryService.js'
import {
  buildT2RhythmTemplateReplayEvidence,
  type T2RhythmTemplateReplayEvidenceResult,
  type T2RhythmTemplateReplayEvidenceSample,
} from './t2RhythmTemplateReplayEvidenceService.js'
import type { ConstructionCalendarContext } from './constructionCalendar.js'

export type T2RhythmDurationExperienceReplayReadQuery = {
  projectId: string
  candidatePackageId: 't2_division_rhythm_schedule_candidate_package'
  selectedTemplateIds: string[]
  windowCodes: string[]
}

export type T2RhythmDurationExperienceRow = {
  id?: string | null
  project_id?: string | null
  projectId?: string | null
  planned_duration?: number | string | null
  plannedDuration?: number | string | null
  actual_duration?: number | string | null
  actualDuration?: number | string | null
  started_at?: string | Date | null
  startedAt?: string | Date | null
  completed_at?: string | Date | null
  completedAt?: string | Date | null
  sample_strength?: string | null
  sampleStrength?: string | null
  sample_status?: string | null
  sampleStatus?: string | null
  included_in_benchmark?: boolean | null
  includedInBenchmark?: boolean | null
  duration_calibration_source?: string | null
  durationCalibrationSource?: string | null
  learning_scope?: string | null
  learningScope?: string | null
  learning_scope_source?: string | null
  learningScopeSource?: string | null
  metadata?: Record<string, unknown> | null
}

export type T2RhythmDurationExperienceReplayReader = (
  query: T2RhythmDurationExperienceReplayReadQuery,
) => Promise<T2RhythmDurationExperienceRow[]>

export type T2RhythmDurationExperienceSupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => unknown
  }
}

export type T2RhythmDurationExperienceSupabaseReaderOptions = {
  limit?: number
  preserveRowsForDiagnostics?: boolean
}

export type T2RhythmDurationExperienceReplayInput = {
  templateId: string
  projectId: string
  candidatePackage: T2RhythmScheduleCandidatePackage
  reader: T2RhythmDurationExperienceReplayReader
  calendar?: ConstructionCalendarContext | null
}

export type T2RhythmDurationExperienceRejectedRow = {
  rowId: string
  reasonCode:
    | 'missing_row_id'
    | 'missing_t2_window_code'
    | 'unknown_t2_window_code'
    | 'unusable_sample_strength'
    | 'excluded_from_benchmark'
    | 'missing_actual_window_dates'
    | 'missing_planned_window_duration'
    | 'missing_template_p80_window_duration'
  detail: string
  observedWindowCode?: string
}

export type T2RhythmDurationExperienceAdapterResult = {
  samples: T2RhythmTemplateReplayEvidenceSample[]
  rejectedRows: T2RhythmDurationExperienceRejectedRow[]
  governance: {
    source: 'duration_experience_samples_to_t2_window_replay_samples'
    directSeedMutationAllowed: false
    writesPlanDates: false
    writesTaskDependencies: false
  }
}

export type T2RhythmDurationExperienceReplayResult = {
  source: 't2_duration_experience_replay_read_model'
  projectId: string
  templateId: string
  durationExperienceRowsRead: number
  adapter: T2RhythmDurationExperienceAdapterResult
  evidence: T2RhythmTemplateReplayEvidenceResult
  governance: {
    directSeedMutationAllowed: false
    writesPlanDates: false
    writesTaskDependencies: false
    requiresL5Publication: true
    readerOnly: true
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function finitePositiveNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readFirstText(...values: unknown[]) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return null
}

function readDateValue(value: unknown): string | Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const text = value.trim()
    return text || null
  }
  return null
}

function readMetadata(row: T2RhythmDurationExperienceRow) {
  return readRecord(row.metadata)
}

function readWindowCode(row: T2RhythmDurationExperienceRow) {
  const metadata = readMetadata(row)
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

function buildQueryWindowCodeLookup(query: T2RhythmDurationExperienceReplayReadQuery) {
  const canonicalToWindow = new Map<string, string | null>()
  const remember = (alias: unknown, windowCode: string) => {
    const key = canonicalWindowToken(alias)
    if (!key) return
    const existing = canonicalToWindow.get(key)
    canonicalToWindow.set(key, existing && existing !== windowCode ? null : windowCode)
  }

  for (const windowCode of query.windowCodes.map(normalizeText).filter(Boolean)) {
    remember(windowCode, windowCode)
    const suffix = windowSuffix(windowCode)
    remember(suffix, windowCode)
    for (const templateId of query.selectedTemplateIds.map(normalizeText).filter(Boolean)) {
      remember(`${templateId}:${suffix}`, windowCode)
    }
  }

  return canonicalToWindow
}

function matchesQueryWindowCode(rawWindowCode: string | null, lookup: Map<string, string | null>) {
  return Boolean(lookup.get(canonicalWindowToken(rawWindowCode)))
}

function readBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true
    if (['false', '0', 'no', 'n'].includes(normalized)) return false
  }
  return null
}

function chainCall(target: unknown, method: string, ...args: unknown[]) {
  const fn = (target as Record<string, unknown>)?.[method]
  if (typeof fn !== 'function') return target
  return fn.apply(target, args)
}

async function resolveQueryResult(query: unknown): Promise<{ data?: unknown; error?: unknown }> {
  const result = await Promise.resolve(query)
  return readRecord(result) as { data?: unknown; error?: unknown }
}

function rejectRow(
  rejectedRows: T2RhythmDurationExperienceRejectedRow[],
  rowId: string,
  reasonCode: T2RhythmDurationExperienceRejectedRow['reasonCode'],
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

export function buildT2RhythmReplaySamplesFromDurationExperience(
  input: {
    candidatePackage: T2RhythmScheduleCandidatePackage
    rows: T2RhythmDurationExperienceRow[]
  },
): T2RhythmDurationExperienceAdapterResult {
  const samples: T2RhythmTemplateReplayEvidenceSample[] = []
  const rejectedRows: T2RhythmDurationExperienceRejectedRow[] = []
  const windowsByCode = new Map(input.candidatePackage.packageWindows.map((window) => [window.windowCode, window]))
  const windowCodeLookup = buildWindowCodeLookup(input.candidatePackage)

  for (const row of input.rows) {
    const rowId = readFirstText(row.id)
    if (!rowId) {
      rejectRow(rejectedRows, 'unknown', 'missing_row_id', 'Duration experience row must have an id before replay.')
      continue
    }

    const sampleStrength = normalizeLower(row.sample_strength ?? row.sampleStrength)
    if (['weak', 'unusable'].includes(sampleStrength)) {
      rejectRow(rejectedRows, rowId, 'unusable_sample_strength', 'Weak or unusable duration samples cannot calibrate T2 rhythm templates.')
      continue
    }
    const included = readBoolean(row.included_in_benchmark ?? row.includedInBenchmark)
    if (included === false) {
      rejectRow(rejectedRows, rowId, 'excluded_from_benchmark', 'Duration experience row is excluded from benchmark/replay evidence.')
      continue
    }

    const metadata = readMetadata(row)
    const windowCode = readWindowCode(row)
    if (!windowCode) {
      rejectRow(rejectedRows, rowId, 'missing_t2_window_code', 'Duration experience row does not declare a T2 rhythm window code.')
      continue
    }
    const resolvedWindowCode = resolvePackageWindowCode(windowCode, windowCodeLookup)
    const packageWindow = resolvedWindowCode ? windowsByCode.get(resolvedWindowCode) : null
    if (!packageWindow) {
      rejectRow(
        rejectedRows,
        rowId,
        'unknown_t2_window_code',
        'Duration experience row references a T2 rhythm window code that is not in the candidate package.',
        windowCode,
      )
      continue
    }

    const actualStartDate = readDateValue(row.started_at ?? row.startedAt)
    const actualEndDate = readDateValue(row.completed_at ?? row.completedAt)
    if (!actualStartDate || !actualEndDate) {
      rejectRow(rejectedRows, rowId, 'missing_actual_window_dates', 'Duration experience row needs started_at and completed_at before replay.')
      continue
    }
    const plannedWindowDurationDays = finitePositiveNumber(row.planned_duration ?? row.plannedDuration)
    if (plannedWindowDurationDays === null) {
      rejectRow(rejectedRows, rowId, 'missing_planned_window_duration', 'Duration experience row needs planned_duration before replay.')
      continue
    }
    const templateP80WindowDurationDays = finitePositiveNumber(packageWindow.durationDays)
    if (templateP80WindowDurationDays === null) {
      rejectRow(rejectedRows, rowId, 'missing_template_p80_window_duration', 'Candidate package window does not expose a usable template duration.')
      continue
    }

    samples.push({
      sampleId: `duration_experience_samples:${rowId}`,
      projectId: readFirstText(row.project_id, row.projectId),
      workfaceKey: readFirstText(metadata.workfaceKey, metadata.workface_key, metadata.scopeKey, metadata.scope_key),
      windowCode: packageWindow.windowCode,
      plannedWindowDurationDays,
      templateP80WindowDurationDays,
      plannedGateDate: readDateValue(metadata.plannedGateDate ?? metadata.planned_gate_date),
      actualGateDate: actualEndDate,
      actualStartDate,
      actualEndDate,
      predecessorActualEndDate: readDateValue(metadata.predecessorActualEndDate ?? metadata.predecessor_actual_end_date),
      dependencySatisfied: readBoolean(metadata.dependencySatisfied ?? metadata.dependency_satisfied),
      evidenceRef: `duration_experience_samples:${rowId}`,
    })
  }

  return {
    samples,
    rejectedRows,
    governance: {
      source: 'duration_experience_samples_to_t2_window_replay_samples',
      directSeedMutationAllowed: false,
      writesPlanDates: false,
      writesTaskDependencies: false,
    },
  }
}

export function createT2RhythmDurationExperienceSupabaseReader(
  supabaseLike: T2RhythmDurationExperienceSupabaseLike,
  options: T2RhythmDurationExperienceSupabaseReaderOptions = {},
): T2RhythmDurationExperienceReplayReader {
  return async (query) => {
    const windowCodes = new Set(query.windowCodes.map((code) => code.trim()).filter(Boolean))
    let sampleQuery = supabaseLike
      .from('duration_experience_samples')
      .select([
        'id',
        'project_id',
        'task_id',
        'template_node_id',
        'wbs_node_type',
        'standard_work_code',
        'standard_work_name',
        'planned_duration',
        'actual_duration',
        'duration_day_basis',
        'actual_duration_calendar_days',
        'actual_duration_production_days',
        'started_at',
        'completed_at',
        'source_type',
        'sample_strength',
        'sample_status',
        'included_in_benchmark',
        'duration_calibration_source',
        'learning_scope',
        'learning_scope_source',
        'metadata',
      ].join(', '))
    sampleQuery = chainCall(sampleQuery, 'eq', 'project_id', query.projectId)
    sampleQuery = chainCall(sampleQuery, 'eq', 'sample_status', 'active')
    sampleQuery = chainCall(sampleQuery, 'eq', 'included_in_benchmark', true)
    sampleQuery = chainCall(sampleQuery, 'eq', 'duration_day_basis', 'construction_production_day')
    sampleQuery = chainCall(sampleQuery, 'not', 'started_at', 'is', null)
    sampleQuery = chainCall(sampleQuery, 'not', 'completed_at', 'is', null)
    sampleQuery = chainCall(sampleQuery, 'limit', Math.max(1, Math.floor(Number(options.limit ?? 500))))
    const result = await resolveQueryResult(sampleQuery)
    if (result.error) throw result.error
    const rows = Array.isArray(result.data) ? result.data as T2RhythmDurationExperienceRow[] : []
    if (options.preserveRowsForDiagnostics || windowCodes.size === 0) return rows
    const windowCodeLookup = buildQueryWindowCodeLookup(query)
    return rows.filter((row) => {
      const windowCode = readWindowCode(row)
      return matchesQueryWindowCode(windowCode, windowCodeLookup)
    })
  }
}

export async function buildT2RhythmDurationExperienceReplayEvidence(
  input: T2RhythmDurationExperienceReplayInput,
): Promise<T2RhythmDurationExperienceReplayResult> {
  const query: T2RhythmDurationExperienceReplayReadQuery = {
    projectId: input.projectId,
    candidatePackageId: 't2_division_rhythm_schedule_candidate_package',
    selectedTemplateIds: input.candidatePackage.selectedTemplateIds,
    windowCodes: unique(input.candidatePackage.packageWindows.map((window) => window.windowCode)),
  }
  const rows = await input.reader(query)
  const adapter = buildT2RhythmReplaySamplesFromDurationExperience({
    candidatePackage: input.candidatePackage,
    rows,
  })
  const evidence = buildT2RhythmTemplateReplayEvidence({
    templateId: input.templateId,
    samples: adapter.samples,
    calendar: input.calendar,
  })

  return {
    source: 't2_duration_experience_replay_read_model',
    projectId: input.projectId,
    templateId: input.templateId,
    durationExperienceRowsRead: rows.length,
    adapter,
    evidence,
    governance: {
      directSeedMutationAllowed: false,
      writesPlanDates: false,
      writesTaskDependencies: false,
      requiresL5Publication: true,
      readerOnly: true,
    },
  }
}
