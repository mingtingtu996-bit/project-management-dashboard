import type { T2RhythmScheduleCandidatePackage } from './t2DivisionRhythmTemplateRegistryService.js'
import {
  buildT2RhythmReplaySamplesFromTaskActuals,
  buildT2RhythmTemplateReplayEvidence,
  type T2RhythmReplayTaskActualAdapterResult,
  type T2RhythmReplayTaskActualRow,
  type T2RhythmTemplateReplayEvidenceResult,
} from './t2RhythmTemplateReplayEvidenceService.js'
import type { ConstructionCalendarContext } from './constructionCalendar.js'

export type { T2RhythmReplayTaskActualRow } from './t2RhythmTemplateReplayEvidenceService.js'

export type T2RhythmTaskActualReplayReadQuery = {
  projectId: string
  candidatePackageId: 't2_division_rhythm_schedule_candidate_package'
  selectedTemplateIds: string[]
  windowCodes: string[]
}

export type T2RhythmTaskActualReplayReader = (
  query: T2RhythmTaskActualReplayReadQuery,
) => Promise<T2RhythmReplayTaskActualRow[]>

export type T2RhythmTaskActualSupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => unknown
  }
}

export type T2RhythmTaskActualSupabaseReaderOptions = {
  limit?: number
  preserveRowsForDiagnostics?: boolean
}

export type T2RhythmTaskActualReplayEvidenceInput = {
  templateId: string
  projectId: string
  candidatePackage: T2RhythmScheduleCandidatePackage
  reader: T2RhythmTaskActualReplayReader
  calendar?: ConstructionCalendarContext | null
}

export type T2RhythmTaskActualReplayEvidenceResult = {
  source: 't2_task_actual_replay_read_model'
  projectId: string
  templateId: string
  taskRowsRead: number
  adapter: T2RhythmReplayTaskActualAdapterResult
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

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readWindowCode(row: T2RhythmReplayTaskActualRow) {
  const metadata = {
    ...readRecord(row.metadata),
    ...readRecord(row.standard_task_metadata),
    ...readRecord(row.standardTaskMetadata),
  }
  return normalizeText(
    metadata.t2RhythmWindowCode
    ?? metadata.t2_rhythm_window_code
    ?? metadata.rhythmWindowCode
    ?? metadata.rhythm_window_code
    ?? metadata.windowCode
    ?? metadata.window_code,
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

function buildQueryWindowCodeLookup(query: T2RhythmTaskActualReplayReadQuery) {
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

function matchesQueryWindowCode(rawWindowCode: string, lookup: Map<string, string | null>) {
  return Boolean(lookup.get(canonicalWindowToken(rawWindowCode)))
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

export function createT2RhythmTaskActualSupabaseReader(
  supabaseLike: T2RhythmTaskActualSupabaseLike,
  options: T2RhythmTaskActualSupabaseReaderOptions = {},
): T2RhythmTaskActualReplayReader {
  return async (query) => {
    const windowCodes = new Set(query.windowCodes.map((code) => code.trim()).filter(Boolean))
    let taskQuery = supabaseLike
      .from('tasks')
      .select([
        'id',
        'project_id',
        'title',
        'standard_work_code',
        'standard_work_name',
        'specialty_type',
        'planned_start_date',
        'planned_end_date',
        'start_date',
        'end_date',
        'actual_start_date',
        'actual_end_date',
        'standard_task_metadata',
      ].join(', '))
    taskQuery = chainCall(taskQuery, 'eq', 'project_id', query.projectId)
    taskQuery = chainCall(taskQuery, 'not', 'actual_start_date', 'is', null)
    taskQuery = chainCall(taskQuery, 'not', 'actual_end_date', 'is', null)
    taskQuery = chainCall(taskQuery, 'limit', Math.max(1, Math.floor(Number(options.limit ?? 500))))
    const result = await resolveQueryResult(taskQuery)
    if (result.error) throw result.error
    const rows = Array.isArray(result.data) ? result.data as T2RhythmReplayTaskActualRow[] : []
    if (options.preserveRowsForDiagnostics || windowCodes.size === 0) return rows
    const windowCodeLookup = buildQueryWindowCodeLookup(query)
    return rows.filter((row) => matchesQueryWindowCode(readWindowCode(row), windowCodeLookup))
  }
}

export async function buildT2RhythmTaskActualReplayEvidence(
  input: T2RhythmTaskActualReplayEvidenceInput,
): Promise<T2RhythmTaskActualReplayEvidenceResult> {
  const query: T2RhythmTaskActualReplayReadQuery = {
    projectId: input.projectId,
    candidatePackageId: 't2_division_rhythm_schedule_candidate_package',
    selectedTemplateIds: input.candidatePackage.selectedTemplateIds,
    windowCodes: unique(input.candidatePackage.packageWindows.map((window) => window.windowCode)),
  }
  const taskRows = await input.reader(query)
  const adapter = buildT2RhythmReplaySamplesFromTaskActuals({
    candidatePackage: input.candidatePackage,
    tasks: taskRows,
    calendar: input.calendar,
  })
  const evidence = buildT2RhythmTemplateReplayEvidence({
    templateId: input.templateId,
    samples: adapter.samples,
    calendar: input.calendar,
  })

  return {
    source: 't2_task_actual_replay_read_model',
    projectId: input.projectId,
    templateId: input.templateId,
    taskRowsRead: taskRows.length,
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
