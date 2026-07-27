import { v4 as uuidv4 } from 'uuid'

import { logger } from '../middleware/logger.js'
import { getClient } from '../database.js'
import { supabase } from './dbService.js'
import { clearAlgorithmSeedResolverCache } from './algorithmSeedResolver.js'
import type { V1474HolidayWindow, V1474SeedEvidenceSource } from '../seeds/v1474WorkCalendarSeed.js'
import { buildForecastWorkCalendarRecords } from '../utils/workCalendarForecastBuilder.js'
import { orderedInclusiveDurationDays } from '../utils/durationDays.js'

export type OfficialHolidayWindowInput = {
  holidayCode?: string | null
  holidayName: string
  startDate: string
  endDate: string
  adjustedWorkDates?: string[] | null
  productivity?: number | null
  calendarKind?: V1474HolidayWindow['calendarKind'] | null
  isCompensatoryWorkday?: boolean | null
  adjustmentOrigin?: string | null
}

export type OfficialHolidayCalendarImportInput = {
  year: number
  sourceUrl: string
  holidays: OfficialHolidayWindowInput[]
  userId?: string | null
}

type CurrentWorkCalendarRecordSnapshot = {
  stableCode: string
  payload: V1474HolidayWindow
  sourceStandard: string | null
  sourceVersion: string | null
  sourceClauseRef: string | null
  evidenceSourceKeys: string[]
  confidence: string | null
  webVerified: boolean
  reviewNeeded: boolean
}

type CurrentWorkCalendarSnapshot = {
  versionId: string | null
  evidenceSources: V1474SeedEvidenceSource[]
  sourceStandards: string[]
  records: CurrentWorkCalendarRecordSnapshot[]
}

type OfficialWorkCalendarPublishPlan = {
  now: string
  seedVersionId: string
  seedVersion: string
  sourceStandards: string[]
  evidenceSources: V1474SeedEvidenceSource[]
  validationResult: {
    ok: boolean
    source: string
    year: number
    recordCount: number
    totalRecordCount: number
    availableYears: string[]
  }
  mergedRecords: CurrentWorkCalendarRecordSnapshot[]
}

export type WorkCalendarImpactPropagationResult = {
  baselineRealignQueued: number
  monthlyPlanRealignQueued: number
  affectedProjectIds: string[]
  skipped?: boolean
  reason?: string
}

const BUILTIN_OFFICIAL_HOLIDAY_NOTICE_URLS: Record<number, string> = {
  2026: 'https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm',
}

function readPositiveIntEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const OFFICIAL_HOLIDAY_NOTICE_FETCH_TIMEOUT_MS = readPositiveIntEnv('OFFICIAL_HOLIDAY_NOTICE_FETCH_TIMEOUT_MS', 15_000)
const OFFICIAL_WORK_CALENDAR_DB_TIMEOUT_MS = readPositiveIntEnv(
  'OFFICIAL_WORK_CALENDAR_DB_TIMEOUT_MS',
  readPositiveIntEnv('SUPABASE_REST_QUERY_TIMEOUT_MS', 12_000),
)

function buildCalendarSeedVersion(baseVersion: string, now: string) {
  return `${baseVersion}-${now.replace(/\D/g, '').slice(0, 14)}`
}

type AbortableSupabaseQuery<T> = PromiseLike<T> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<T>
}

async function withTimeout<T>(request: PromiseLike<T>, label: string, timeoutMs: number, code: string, controller?: AbortController) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller?.abort()
      reject(Object.assign(new Error(`${label} timed out after ${timeoutMs}ms`), { code }))
    }, timeoutMs)
  })

  try {
    return await Promise.race([Promise.resolve(request), timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function withOfficialCalendarDbTimeout<T>(query: AbortableSupabaseQuery<T>, label: string) {
  const controller = new AbortController()
  const request = typeof query.abortSignal === 'function'
    ? query.abortSignal(controller.signal)
    : query
  return withTimeout(request, label, OFFICIAL_WORK_CALENDAR_DB_TIMEOUT_MS, 'OFFICIAL_CALENDAR_DB_TIMEOUT', controller)
}

async function fetchOfficialHolidayNotice(sourceUrl: string) {
  const controller = new AbortController()
  return withTimeout(
    fetch(sourceUrl, { signal: controller.signal }),
    'Fetch official holiday notice',
    OFFICIAL_HOLIDAY_NOTICE_FETCH_TIMEOUT_MS,
    'OFFICIAL_NOTICE_FETCH_TIMEOUT',
    controller,
  )
}

const HOLIDAY_NAME_DEFINITIONS = [
  { baseCode: 'new_year_day', labels: ['\u5143\u65e6', 'New Year'] },
  { baseCode: 'spring_festival', labels: ['\u6625\u8282', 'Spring Festival'] },
  { baseCode: 'qingming', labels: ['\u6e05\u660e', 'Qingming'] },
  { baseCode: 'labor_day', labels: ['\u52b3\u52a8\u8282', 'Labor Day'] },
  { baseCode: 'dragon_boat', labels: ['\u7aef\u5348', 'Dragon Boat'] },
  { baseCode: 'mid_autumn', labels: ['\u4e2d\u79cb', 'Mid-Autumn'] },
  { baseCode: 'national_day', labels: ['\u56fd\u5e86', 'National Day'] },
] as const

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function uniqueTexts(values: unknown[]) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function shouldUsePostgresCalendarPublisher(env: NodeJS.ProcessEnv = process.env) {
  const driver = normalizeText(env.OFFICIAL_WORK_CALENDAR_DB_DRIVER).toLowerCase()
  return driver === 'postgres' || Boolean(normalizeText(env.DB_CONNECTION_STRING) || normalizeText(env.SUPABASE_MIGRATION_URL))
}

function normalizeEvidenceSources(value: unknown): V1474SeedEvidenceSource[] {
  return Array.isArray(value)
    ? value
      .map((item: any) => ({
        sourceKey: normalizeText(item?.sourceKey),
        title: normalizeText(item?.title),
        url: normalizeText(item?.url),
        accessedAt: normalizeText(item?.accessedAt),
      }))
      .filter((item) => item.sourceKey && item.title && item.url)
    : []
}

function readPayloadYear(payload: Partial<V1474HolidayWindow>) {
  const yearText = normalizeText((payload as any).year)
  const explicit = yearText ? Number(yearText) : Number.NaN
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  const fromStart = normalizeDate((payload as any).startDate)?.slice(0, 4)
  const parsedStart = Number(fromStart)
  if (Number.isFinite(parsedStart) && parsedStart > 0) return parsedStart
  const fromCode = normalizeText((payload as any).holidayCode).match(/(?:^|_)(\d{4})$/)?.[1]
  const parsedCode = Number(fromCode)
  return Number.isFinite(parsedCode) && parsedCode > 0 ? parsedCode : null
}

function buildOfficialWorkCalendarPublishPlan(
  input: OfficialHolidayCalendarImportInput,
  records: V1474HolidayWindow[],
  currentSnapshot: CurrentWorkCalendarSnapshot,
  options: {
    evidenceSourceKey?: string
    evidenceTitle?: string
    seedVersion?: string
    validationSource?: string
    sourceStandardLabel?: string
  } = {},
): OfficialWorkCalendarPublishPlan {
  const previousRecords = currentSnapshot.records.filter((record) => readPayloadYear(record.payload) !== input.year)
  const mergedRecords = [
    ...previousRecords,
    ...records.map((record) => ({
      stableCode: record.holidayCode,
      payload: record,
      sourceStandard: record.sourceStandard,
      sourceVersion: record.sourceVersion,
      sourceClauseRef: record.sourceClauseRef,
      evidenceSourceKeys: record.evidenceSourceKeys,
      confidence: record.confidence,
      webVerified: record.webVerified,
      reviewNeeded: record.reviewNeeded,
    } satisfies CurrentWorkCalendarRecordSnapshot)),
  ]
  const seedVersionId = uuidv4()
  const now = new Date().toISOString()
  const sourceKey = options.evidenceSourceKey ?? `STATE_COUNCIL_HOLIDAY_${input.year}`
  const newEvidenceSource: V1474SeedEvidenceSource = {
    sourceKey,
    title: options.evidenceTitle ?? `State Council ${input.year} holiday notice`,
    url: input.sourceUrl,
    accessedAt: now.slice(0, 10),
  }
  const evidenceSources = [
    ...currentSnapshot.evidenceSources.filter((item) => item.sourceKey !== sourceKey),
    newEvidenceSource,
  ]
  const seedVersion = buildCalendarSeedVersion(
    options.seedVersion ?? `v1.4.7.4-work-calendar-${input.year}`,
    now,
  )
  const validationResult = {
    ok: true,
    source: options.validationSource ?? 'official_gov_cn_calendar_import',
    year: input.year,
    recordCount: records.length,
    totalRecordCount: mergedRecords.length,
    availableYears: uniqueTexts(mergedRecords.map((record) => readPayloadYear(record.payload))).sort(),
  }

  return {
    now,
    seedVersionId,
    seedVersion,
    sourceStandards: uniqueTexts([...currentSnapshot.sourceStandards, options.sourceStandardLabel ?? `State Council ${input.year} holiday notice`]),
    evidenceSources,
    validationResult,
    mergedRecords,
  }
}

function parseOfficialHolidayNoticeUrlMap(value: unknown): Record<number, string> {
  const text = normalizeText(value)
  if (!text) return {}

  if (text.startsWith('{')) {
    const parsed = JSON.parse(text) as Record<string, unknown>
    return Object.fromEntries(Object.entries(parsed)
      .map(([year, url]) => [Number(year), normalizeText(url)] as const)
      .filter(([year, url]) => Number.isInteger(year) && Boolean(url)))
  }

  return Object.fromEntries(text
    .split(/[\n;,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [year, ...urlParts] = item.split('=')
      return [Number(year), normalizeText(urlParts.join('='))] as const
    })
    .filter(([year, url]) => Number.isInteger(year) && Boolean(url)))
}

function assertGovCnSource(sourceUrl: string) {
  let parsed: URL
  try {
    parsed = new URL(sourceUrl)
  } catch {
    throw Object.assign(new Error('Official holiday calendar sourceUrl must be a valid URL'), { code: 'INVALID_SOURCE_URL' })
  }
  if (parsed.hostname !== 'gov.cn' && !parsed.hostname.endsWith('.gov.cn')) {
    throw Object.assign(new Error('Official holiday calendar sourceUrl must be under gov.cn'), { code: 'NON_GOVCN_SOURCE_BLOCKED' })
  }
}

export function resolveOfficialHolidayNoticeSourceUrl(year: number, env: NodeJS.ProcessEnv = process.env) {
  const normalizedYear = Number(year)
  if (!Number.isInteger(normalizedYear)) return null

  const direct = normalizeText(env[`OFFICIAL_HOLIDAY_NOTICE_URL_${normalizedYear}`])
  const mapped = parseOfficialHolidayNoticeUrlMap(env.OFFICIAL_HOLIDAY_NOTICE_URLS)[normalizedYear]
  const sourceUrl = direct || mapped || BUILTIN_OFFICIAL_HOLIDAY_NOTICE_URLS[normalizedYear] || null
  if (!sourceUrl) return null
  assertGovCnSource(sourceUrl)
  return sourceUrl
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function calendarOnlyProductivity(year: number, month: number, startDate: string, endDate: string, explicit?: number | null) {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0 && explicit <= 1) {
    return Number(explicit.toFixed(2))
  }
  const holidayDays = orderedInclusiveDurationDays(startDate, endDate) ?? 0
  if (holidayDays <= 0) return 1
  return Math.max(0.55, Math.min(1, Number((1 - holidayDays / daysInMonth(year, month)).toFixed(2))))
}

function buildCompensatoryWorkdayCode(originCode: string, date: string) {
  return `${originCode}_adjusted_workday_${date.replace(/-/g, '_')}`
}

function buildOfficialHolidayCode(holidayName: string, year: number) {
  const normalizedName = holidayName
    .replace(new RegExp(`^${year}\\s*[-_/年]?\\s*`, 'i'), '')
    .trim()
  const slug = normalizedName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return `${slug || 'holiday'}_${year}`
}

function buildCompensatoryWorkdayRecord(params: {
  year: number
  date: string
  originHolidayCode: string
  originHolidayName: string
  sourceVersion: string
  evidenceSourceKeys: string[]
  confidence: V1474HolidayWindow['confidence']
  webVerified: boolean
  reviewNeeded: boolean
}): V1474HolidayWindow {
  return {
    holidayCode: buildCompensatoryWorkdayCode(params.originHolidayCode, params.date),
    holidayName: `${params.originHolidayName} adjusted workday`,
    year: params.year,
    month: Number(params.date.slice(5, 7)),
    startDate: params.date,
    endDate: params.date,
    adjustedWorkDates: [],
    productivity: 1,
    isCompensatoryWorkday: true,
    adjustmentOrigin: params.originHolidayCode,
    calendarKind: 'compensatory_workday',
    sourceStandard: params.webVerified ? 'national_calendar' : 'system_default',
    sourceVersion: params.sourceVersion,
    sourceClauseRef: `${params.originHolidayName} adjusted workday: ${params.date}`,
    evidenceSourceKeys: params.evidenceSourceKeys,
    webVerified: params.webVerified,
    reviewNeeded: params.reviewNeeded,
    confidence: params.confidence,
  }
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildDate(year: number, month: string | number, day: string | number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function extractHolidaySegment(text: string, labels: readonly string[]) {
  const candidates = labels.flatMap((label) => {
    const indexes: Array<{ index: number; label: string }> = []
    let index = text.indexOf(label)
    while (index >= 0) {
      indexes.push({ index, label })
      index = text.indexOf(label, index + label.length)
    }
    return indexes
  }).sort((left, right) => left.index - right.index)

  if (!candidates.length) return null

  const heading = candidates.find(({ index, label }) => {
    const afterLabel = text.slice(index + label.length, index + label.length + 16)
    return /^[^、，,和及]{0,8}[：:]/.test(afterLabel)
  }) ?? candidates[0]

  const sectionPattern = /[一二三四五六七八九十]+、[^：:]{1,16}[：:]/g
  let nextSectionIndex = -1
  for (const match of text.matchAll(sectionPattern)) {
    const index = match.index ?? -1
    if (index > heading.index + heading.label.length) {
      nextSectionIndex = index
      break
    }
  }

  const endIndex = nextSectionIndex > 0 ? nextSectionIndex : heading.index + 260
  return text.slice(heading.index, endIndex)
}

function parseHolidayRange(year: number, segment: string) {
  const range = segment.match(/(?:(\d{1,2})\u6708)?(\d{1,2})\u65e5(?:\([^)]+\)|\uff08[^\uff09]+\uff09)?\u81f3(?:(\d{1,2})\u6708)?(\d{1,2})\u65e5/)
  if (!range) return null
  const startMonth = range[1] ?? range[3]
  const startDay = range[2]
  const endMonth = range[3] ?? startMonth
  const endDay = range[4]
  if (!startMonth || !endMonth) return null
  return {
    startDate: buildDate(year, startMonth, startDay),
    endDate: buildDate(year, endMonth, endDay),
  }
}

function parseAdjustedWorkDates(year: number, segment: string) {
  const workIndex = segment.indexOf('\u4e0a\u73ed')
  if (workIndex < 0) return []
  const beforeWork = segment.slice(0, workIndex)
  const sentenceStart = Math.max(
    beforeWork.lastIndexOf('\u3002'),
    beforeWork.lastIndexOf('\uff1b'),
    beforeWork.lastIndexOf(';'),
  ) + 1
  const workSentence = beforeWork.slice(sentenceStart)
  return Array.from(workSentence.matchAll(/(\d{1,2})\u6708(\d{1,2})\u65e5/g))
    .map((match) => buildDate(year, match[1], match[2]))
}

export function parseOfficialHolidayNotice(year: number, html: string): OfficialHolidayWindowInput[] {
  const text = htmlToText(html)
  return HOLIDAY_NAME_DEFINITIONS.flatMap((definition) => {
    const segment = extractHolidaySegment(text, definition.labels)
    if (!segment) return []
    const range = parseHolidayRange(year, segment)
    if (!range) return []
    return [{
      holidayCode: `${definition.baseCode}_${year}`,
      holidayName: `${year} ${definition.baseCode}`,
      startDate: range.startDate,
      endDate: range.endDate,
      adjustedWorkDates: parseAdjustedWorkDates(year, segment),
    }]
  })
}

export function buildOfficialWorkCalendarRecords(input: OfficialHolidayCalendarImportInput): V1474HolidayWindow[] {
  const year = Number(input.year)
  if (!Number.isInteger(year) || year < 2026 || year > 2100) {
    throw Object.assign(new Error('Official holiday calendar year is invalid'), { code: 'INVALID_HOLIDAY_YEAR' })
  }
  assertGovCnSource(input.sourceUrl)

  const holidayRecords = input.holidays.map((holiday) => {
    const startDate = normalizeDate(holiday.startDate)
    const endDate = normalizeDate(holiday.endDate)
    if (!startDate || !endDate || !startDate.startsWith(`${year}-`) || !endDate.startsWith(`${year}-`)) {
      throw Object.assign(new Error('Holiday startDate/endDate must be ISO dates in the import year'), { code: 'INVALID_HOLIDAY_DATE' })
    }
    const month = Number(startDate.slice(5, 7))
    const holidayName = normalizeText(holiday.holidayName)
    const holidayCode = normalizeText(holiday.holidayCode) || buildOfficialHolidayCode(holidayName, year)
    const adjustedWorkDates = Array.isArray(holiday.adjustedWorkDates)
      ? holiday.adjustedWorkDates.map(normalizeDate).filter((date): date is string => Boolean(date))
      : []
    const sourceVersion = `State Council ${year} holiday notice`
    const evidenceSourceKeys = [`STATE_COUNCIL_HOLIDAY_${year}`]
    return {
      holidayCode,
      holidayName,
      year,
      month,
      startDate,
      endDate,
      adjustedWorkDates,
      productivity: calendarOnlyProductivity(year, month, startDate, endDate, holiday.productivity),
      isCompensatoryWorkday: holiday.isCompensatoryWorkday === true,
      adjustmentOrigin: normalizeText(holiday.adjustmentOrigin) || input.sourceUrl,
      calendarKind: holiday.calendarKind ?? 'statutory_holiday',
      sourceStandard: 'national_calendar',
      sourceVersion,
      sourceClauseRef: `${holidayName}: ${startDate} to ${endDate}${adjustedWorkDates.length ? `; adjusted workdays ${adjustedWorkDates.join(', ')}` : ''}`,
      evidenceSourceKeys,
      webVerified: true,
      reviewNeeded: false,
      confidence: 'high',
    } satisfies V1474HolidayWindow
  })
  const records = [
    ...holidayRecords,
    ...holidayRecords.flatMap((holiday) => holiday.adjustedWorkDates.map((date) => buildCompensatoryWorkdayRecord({
      year,
      date,
      originHolidayCode: holiday.holidayCode,
      originHolidayName: holiday.holidayName,
      sourceVersion: holiday.sourceVersion,
      evidenceSourceKeys: holiday.evidenceSourceKeys,
      confidence: holiday.confidence,
      webVerified: holiday.webVerified,
      reviewNeeded: holiday.reviewNeeded,
    }))),
  ]

  const duplicateCodes = records
    .map((record) => record.holidayCode)
    .filter((code, index, codes) => codes.indexOf(code) !== index)
  if (duplicateCodes.length > 0) {
    throw Object.assign(new Error(`Duplicate holidayCode in official calendar import: ${Array.from(new Set(duplicateCodes)).join(', ')}`), { code: 'DUPLICATE_HOLIDAY_CODE' })
  }
  if (records.length === 0) {
    throw Object.assign(new Error('Official holiday calendar import produced no records'), { code: 'EMPTY_HOLIDAY_CALENDAR' })
  }
  return records
}

async function loadCurrentWorkCalendarSnapshot(): Promise<CurrentWorkCalendarSnapshot> {
  const { data: version, error: versionError } = await withOfficialCalendarDbTimeout(
    supabase
      .from('algorithm_seed_versions')
      .select('id, evidence_sources, source_standards')
      .eq('seed_type', 'work_calendar')
      .eq('status', 'active')
      .eq('is_current', true)
      .maybeSingle(),
    'Load current official work_calendar seed version',
  )

  if (versionError) throw versionError
  const versionId = normalizeText((version as any)?.id) || null
  if (!versionId) {
    return {
      versionId: null,
      evidenceSources: [],
      sourceStandards: [],
      records: [],
    }
  }

  const { data, error } = await withOfficialCalendarDbTimeout(
    supabase
      .from('algorithm_seed_records')
      .select('stable_code, rule_payload, source_standard, source_version, source_clause_ref, evidence_source_keys, confidence, web_verified, review_needed')
      .eq('seed_version_id', versionId)
      .eq('seed_type', 'work_calendar')
      .eq('status', 'active')
      .limit(500),
    'Load current official work_calendar seed records',
  )

  if (error) throw error
  return {
    versionId,
    evidenceSources: normalizeEvidenceSources((version as any)?.evidence_sources),
    sourceStandards: uniqueTexts(Array.isArray((version as any)?.source_standards) ? (version as any).source_standards : []),
    records: ((data ?? []) as any[]).map((row) => ({
      stableCode: normalizeText(row.stable_code),
      payload: row.rule_payload as V1474HolidayWindow,
      sourceStandard: normalizeText(row.source_standard) || null,
      sourceVersion: normalizeText(row.source_version) || null,
      sourceClauseRef: normalizeText(row.source_clause_ref) || null,
      evidenceSourceKeys: Array.isArray(row.evidence_source_keys)
        ? uniqueTexts(row.evidence_source_keys)
        : [],
      confidence: normalizeText(row.confidence) || null,
      webVerified: Boolean(row.web_verified),
      reviewNeeded: Boolean(row.review_needed),
    })),
  }
}

async function loadCurrentWorkCalendarSnapshotFromPostgres(client: Awaited<ReturnType<typeof getClient>>): Promise<CurrentWorkCalendarSnapshot> {
  const versionResult = await client.query(
    `
      SELECT id, evidence_sources, source_standards
      FROM public.algorithm_seed_versions
      WHERE seed_type = 'work_calendar'
        AND status = 'active'
        AND is_current = TRUE
      LIMIT 1
    `,
  )
  const version = versionResult.rows[0]
  const versionId = normalizeText(version?.id) || null
  if (!versionId) {
    return {
      versionId: null,
      evidenceSources: [],
      sourceStandards: [],
      records: [],
    }
  }

  const recordResult = await client.query(
    `
      SELECT stable_code, rule_payload, source_standard, source_version, source_clause_ref,
             evidence_source_keys, confidence, web_verified, review_needed
      FROM public.algorithm_seed_records
      WHERE seed_version_id = $1
        AND seed_type = 'work_calendar'
        AND status = 'active'
      LIMIT 500
    `,
    [versionId],
  )

  return {
    versionId,
    evidenceSources: normalizeEvidenceSources(version.evidence_sources),
    sourceStandards: uniqueTexts(Array.isArray(version.source_standards) ? version.source_standards : []),
    records: recordResult.rows.map((row) => ({
      stableCode: normalizeText(row.stable_code),
      payload: row.rule_payload as V1474HolidayWindow,
      sourceStandard: normalizeText(row.source_standard) || null,
      sourceVersion: normalizeText(row.source_version) || null,
      sourceClauseRef: normalizeText(row.source_clause_ref) || null,
      evidenceSourceKeys: Array.isArray(row.evidence_source_keys)
        ? uniqueTexts(row.evidence_source_keys)
        : [],
      confidence: normalizeText(row.confidence) || null,
      webVerified: Boolean(row.web_verified),
      reviewNeeded: Boolean(row.review_needed),
    })),
  }
}

export async function hasCurrentOfficialWorkCalendarForYear(year: number) {
  if (shouldUsePostgresCalendarPublisher()) {
    const client = await withTimeout(
      getClient(),
      'Open PostgreSQL connection for official work_calendar lookup',
      OFFICIAL_WORK_CALENDAR_DB_TIMEOUT_MS,
      'OFFICIAL_CALENDAR_DB_TIMEOUT',
    )
    try {
      const snapshot = await loadCurrentWorkCalendarSnapshotFromPostgres(client)
      return snapshot.records.some((record) => (
        readPayloadYear(record.payload) === year
        && record.payload.sourceStandard === 'national_calendar'
        && record.webVerified === true
      ))
    } finally {
      client.release()
    }
  }

  const snapshot = await loadCurrentWorkCalendarSnapshot()
  return snapshot.records.some((record) => (
    readPayloadYear(record.payload) === year
    && record.payload.sourceStandard === 'national_calendar'
    && record.webVerified === true
  ))
}

export async function hasCurrentForecastWorkCalendarForYear(year: number) {
  if (shouldUsePostgresCalendarPublisher()) {
    const client = await withTimeout(
      getClient(),
      'Open PostgreSQL connection for forecast work_calendar lookup',
      OFFICIAL_WORK_CALENDAR_DB_TIMEOUT_MS,
      'OFFICIAL_CALENDAR_DB_TIMEOUT',
    )
    try {
      const snapshot = await loadCurrentWorkCalendarSnapshotFromPostgres(client)
      return snapshot.records.some((record) => (
        readPayloadYear(record.payload) === year
        && record.payload.sourceStandard === 'system_default'
        && record.payload.calendarKind === 'forecast_calendar_window'
      ))
    } finally {
      client.release()
    }
  }

  const snapshot = await loadCurrentWorkCalendarSnapshot()
  return snapshot.records.some((record) => (
    readPayloadYear(record.payload) === year
    && record.payload.sourceStandard === 'system_default'
    && record.payload.calendarKind === 'forecast_calendar_window'
  ))
}

async function insertPlanningImpactChangeLogs(
  client: Awaited<ReturnType<typeof getClient>>,
  rows: Array<{ id: string; project_id: string; entity_type: 'baseline' | 'monthly_plan' }>,
  seedVersionId: string,
  year: number,
  now: string,
) {
  if (rows.length === 0) return
  for (const row of rows) {
    await client.query(
      `
        INSERT INTO public.change_logs (
          project_id, entity_type, entity_id, field_name, old_value, new_value,
          change_reason, changed_by, changed_at, change_source
        )
        VALUES ($1, $2, $3, 'status', 'confirmed', 'pending_realign',
          $4, NULL, $5, 'system_auto')
      `,
      [
        row.project_id,
        row.entity_type,
        row.id,
        `work_calendar_${year}_published:${seedVersionId}`,
        now,
      ],
    )
  }
}

// workspace-isolation-system-job-approved: official work-calendar publication is a reviewed system job that intentionally realigns every confirmed plan intersecting the published national calendar year.
async function propagateWorkCalendarPlanImpactWithClient(
  client: Awaited<ReturnType<typeof getClient>>,
  year: number,
  seedVersionId: string,
  now: string,
): Promise<WorkCalendarImpactPropagationResult> {
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`
  let savepointCreated = false
  try {
    await client.query('SAVEPOINT work_calendar_impact')
    savepointCreated = true
    const baselineResult = await client.query(
      `
        WITH affected AS (
          SELECT DISTINCT b.id, b.project_id
          FROM public.task_baselines b
          JOIN public.task_baseline_items i ON i.baseline_version_id = b.id
          WHERE b.status = 'confirmed'
            AND (
              (i.planned_start_date BETWEEN $1::date AND $2::date)
              OR (i.planned_end_date BETWEEN $1::date AND $2::date)
              OR (i.planned_start_date <= $1::date AND i.planned_end_date >= $2::date)
            )
        )
        UPDATE public.task_baselines b
        SET status = 'pending_realign',
            updated_at = $3
        FROM affected a
        WHERE b.id = a.id
        RETURNING b.id, b.project_id
      `,
      [startDate, endDate, now],
    )

    const monthlyResult = await client.query(
      `
        WITH affected AS (
          SELECT DISTINCT p.id, p.project_id
          FROM public.monthly_plans p
          LEFT JOIN public.monthly_plan_items i ON i.monthly_plan_version_id = p.id
          WHERE p.status = 'confirmed'
            AND (
              p.month LIKE $1
              OR (i.planned_start_date BETWEEN $2::date AND $3::date)
              OR (i.planned_end_date BETWEEN $2::date AND $3::date)
              OR (i.planned_start_date <= $2::date AND i.planned_end_date >= $3::date)
            )
        )
        UPDATE public.monthly_plans p
        SET status = 'pending_realign',
            updated_at = $4
        FROM affected a
        WHERE p.id = a.id
        RETURNING p.id, p.project_id
      `,
      [`${year}-%`, startDate, endDate, now],
    )

    const changedRows = [
      ...baselineResult.rows.map((row) => ({ ...row, entity_type: 'baseline' as const })),
      ...monthlyResult.rows.map((row) => ({ ...row, entity_type: 'monthly_plan' as const })),
    ]
    try {
      await insertPlanningImpactChangeLogs(client, changedRows, seedVersionId, year, now)
    } catch (error) {
      logger.warn('[officialHolidayCalendarService] failed to write work_calendar impact change logs', {
        seedVersionId,
        year,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    await client.query('RELEASE SAVEPOINT work_calendar_impact')
    return {
      baselineRealignQueued: baselineResult.rowCount ?? 0,
      monthlyPlanRealignQueued: monthlyResult.rowCount ?? 0,
      affectedProjectIds: Array.from(new Set(changedRows.map((row) => normalizeText(row.project_id)).filter(Boolean))),
    }
  } catch (error) {
    if (savepointCreated) {
      await client.query('ROLLBACK TO SAVEPOINT work_calendar_impact')
      await client.query('RELEASE SAVEPOINT work_calendar_impact')
    }
    logger.warn('[officialHolidayCalendarService] skipped work_calendar impact propagation', {
      seedVersionId,
      year,
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      baselineRealignQueued: 0,
      monthlyPlanRealignQueued: 0,
      affectedProjectIds: [],
      skipped: true,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

async function propagateWorkCalendarPlanImpact(year: number, seedVersionId: string, now: string) {
  const client = await withTimeout(
    getClient(),
    'Open PostgreSQL connection for official work_calendar impact propagation',
    OFFICIAL_WORK_CALENDAR_DB_TIMEOUT_MS,
    'OFFICIAL_CALENDAR_DB_TIMEOUT',
  )
  try {
    await client.query('BEGIN')
    const result = await propagateWorkCalendarPlanImpactWithClient(client, year, seedVersionId, now)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      logger.warn('[officialHolidayCalendarService] failed to rollback work_calendar impact propagation', {
        error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      })
    }
    throw error
  } finally {
    client.release()
  }
}

export async function importOfficialWorkCalendar(input: OfficialHolidayCalendarImportInput) {
  const records = buildOfficialWorkCalendarRecords(input)
  if (shouldUsePostgresCalendarPublisher()) {
    return importOfficialWorkCalendarWithPostgres(input, records)
  }

  const currentSnapshot = await loadCurrentWorkCalendarSnapshot()
  const plan = buildOfficialWorkCalendarPublishPlan(input, records, currentSnapshot)

  await withOfficialCalendarDbTimeout(
    supabase
      .from('algorithm_seed_versions')
      .update({ is_current: false, status: 'deprecated', updated_at: plan.now })
      .eq('seed_type', 'work_calendar')
      .eq('is_current', true),
    'Deprecate previous official work_calendar seed version',
  )

  const { error: versionError } = await withOfficialCalendarDbTimeout(
    supabase.from('algorithm_seed_versions').insert({
      id: plan.seedVersionId,
      seed_type: 'work_calendar',
      seed_version: plan.seedVersion,
      seed_scope: 'algorithm_auxiliary',
      source_standards: plan.sourceStandards,
      expected_counts: { records: plan.mergedRecords.length, importedYearRecords: records.length, year: input.year },
      evidence_sources: plan.evidenceSources,
      validation_result: plan.validationResult,
      status: 'active',
      is_current: true,
      imported_by: input.userId ?? null,
      published_by: input.userId ?? null,
      imported_at: plan.now,
      published_at: plan.now,
      created_at: plan.now,
      updated_at: plan.now,
    }),
    'Insert official work_calendar seed version',
  )
  if (versionError) throw versionError

  const { error: recordError } = await withOfficialCalendarDbTimeout(
    supabase.from('algorithm_seed_records').insert(plan.mergedRecords.map((record) => ({
      id: uuidv4(),
      seed_version_id: plan.seedVersionId,
      seed_type: 'work_calendar',
      stable_code: record.stableCode,
      rule_payload: record.payload,
      source_standard: record.sourceStandard,
      source_version: record.sourceVersion,
      source_clause_ref: record.sourceClauseRef,
      evidence_source_keys: record.evidenceSourceKeys,
      confidence: record.confidence,
      web_verified: record.webVerified,
      review_needed: record.reviewNeeded,
      status: 'active',
    }))),
    'Insert official work_calendar seed records',
  )
  if (recordError) throw recordError

  const { error: logError } = await withOfficialCalendarDbTimeout(
    supabase.from('algorithm_seed_import_logs').insert({
      id: uuidv4(),
      seed_version_id: plan.seedVersionId,
      seed_type: 'work_calendar',
      import_source: 'official_gov_cn_calendar',
      expected_counts_snapshot: { records: plan.mergedRecords.length, importedYearRecords: records.length, year: input.year },
      actual_counts_snapshot: { records: plan.mergedRecords.length, importedYearRecords: records.length, year: input.year },
      validation_result: plan.validationResult,
      imported_by: input.userId ?? null,
      imported_at: plan.now,
    }),
    'Insert official work_calendar import log',
  )
  if (logError) {
    logger.warn('[officialHolidayCalendarService] failed to write import log', {
      seedVersionId: plan.seedVersionId,
      error: logError.message,
    })
  }

  clearAlgorithmSeedResolverCache('work_calendar')
  const impactPropagation = await propagateWorkCalendarPlanImpact(input.year, plan.seedVersionId, plan.now)
  return {
    seedType: 'work_calendar' as const,
    seedVersionId: plan.seedVersionId,
    seedVersion: plan.seedVersion,
    recordCount: records.length,
    totalRecordCount: plan.mergedRecords.length,
    records,
    impactPropagation,
  }
}

async function importOfficialWorkCalendarWithPostgres(input: OfficialHolidayCalendarImportInput, records: V1474HolidayWindow[]) {
  const client = await withTimeout(
    getClient(),
    'Open PostgreSQL connection for official work_calendar publish',
    OFFICIAL_WORK_CALENDAR_DB_TIMEOUT_MS,
    'OFFICIAL_CALENDAR_DB_TIMEOUT',
  )
  try {
    await client.query('BEGIN')
    const currentSnapshot = await loadCurrentWorkCalendarSnapshotFromPostgres(client)
    const plan = buildOfficialWorkCalendarPublishPlan(input, records, currentSnapshot)

    await client.query(
      `
        UPDATE public.algorithm_seed_versions
        SET is_current = FALSE,
            status = 'deprecated',
            updated_at = $1
        WHERE seed_type = 'work_calendar'
          AND is_current = TRUE
      `,
      [plan.now],
    )

    await client.query(
      `
        INSERT INTO public.algorithm_seed_versions (
          id, seed_type, seed_version, seed_scope, source_standards, expected_counts,
          evidence_sources, validation_result, status, is_current, imported_by, published_by,
          imported_at, published_at, created_at, updated_at
        )
        VALUES ($1, 'work_calendar', $2, 'algorithm_auxiliary', $3::jsonb, $4::jsonb,
          $5::jsonb, $6::jsonb, 'active', TRUE, $7, $7, $8, $8, $8, $8)
      `,
      [
        plan.seedVersionId,
        plan.seedVersion,
        JSON.stringify(plan.sourceStandards),
        JSON.stringify({ records: plan.mergedRecords.length, importedYearRecords: records.length, year: input.year }),
        JSON.stringify(plan.evidenceSources),
        JSON.stringify(plan.validationResult),
        input.userId ?? null,
        plan.now,
      ],
    )

    for (const record of plan.mergedRecords) {
      await client.query(
        `
          INSERT INTO public.algorithm_seed_records (
            id, seed_version_id, seed_type, stable_code, rule_payload, source_standard,
            source_version, source_clause_ref, evidence_source_keys, confidence,
            web_verified, review_needed, status
          )
          VALUES ($1, $2, 'work_calendar', $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9, $10, $11, 'active')
        `,
        [
          uuidv4(),
          plan.seedVersionId,
          record.stableCode,
          JSON.stringify(record.payload),
          record.sourceStandard,
          record.sourceVersion,
          record.sourceClauseRef,
          JSON.stringify(record.evidenceSourceKeys),
          record.confidence,
          record.webVerified,
          record.reviewNeeded,
        ],
      )
    }

    await client.query(
      `
        INSERT INTO public.algorithm_seed_import_logs (
          id, seed_version_id, seed_type, import_source, expected_counts_snapshot,
          actual_counts_snapshot, validation_result, imported_by, imported_at
        )
        VALUES ($1, $2, 'work_calendar', 'official_gov_cn_calendar', $3::jsonb, $3::jsonb, $4::jsonb, $5, $6)
      `,
      [
        uuidv4(),
        plan.seedVersionId,
        JSON.stringify({ records: plan.mergedRecords.length, importedYearRecords: records.length, year: input.year }),
        JSON.stringify(plan.validationResult),
        input.userId ?? null,
        plan.now,
      ],
    )

    const impactPropagation = await propagateWorkCalendarPlanImpactWithClient(client, input.year, plan.seedVersionId, plan.now)
    await client.query('COMMIT')
    clearAlgorithmSeedResolverCache('work_calendar')
    return {
      seedType: 'work_calendar' as const,
      seedVersionId: plan.seedVersionId,
      seedVersion: plan.seedVersion,
      recordCount: records.length,
      totalRecordCount: plan.mergedRecords.length,
      records,
      impactPropagation,
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      logger.warn('[officialHolidayCalendarService] failed to rollback official work_calendar publish', {
        error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      })
    }
    throw error
  } finally {
    client.release()
  }
}

export async function importForecastWorkCalendar(year: number, userId?: string | null) {
  const records = buildForecastWorkCalendarRecords(year)
  const input: OfficialHolidayCalendarImportInput = {
    year,
    sourceUrl: `system://work-calendar-forecast/${year}`,
    holidays: [],
    userId: userId ?? null,
  }
  const planOptions = {
    evidenceSourceKey: `SYSTEM_FORECAST_WORK_CALENDAR_${year}`,
    evidenceTitle: `System forecast work calendar ${year}`,
    seedVersion: `v1.4.7.4-work-calendar-${year}-forecast`,
    validationSource: 'system_forecast_calendar',
    sourceStandardLabel: `System forecast work calendar ${year}`,
  }

  if (shouldUsePostgresCalendarPublisher()) {
    const client = await withTimeout(
      getClient(),
      'Open PostgreSQL connection for forecast work_calendar publish',
      OFFICIAL_WORK_CALENDAR_DB_TIMEOUT_MS,
      'OFFICIAL_CALENDAR_DB_TIMEOUT',
    )
    try {
      await client.query('BEGIN')
      const currentSnapshot = await loadCurrentWorkCalendarSnapshotFromPostgres(client)
      const plan = buildOfficialWorkCalendarPublishPlan(input, records, currentSnapshot, planOptions)

      await client.query(
        `
          UPDATE public.algorithm_seed_versions
          SET is_current = FALSE,
              status = 'deprecated',
              updated_at = $1
          WHERE seed_type = 'work_calendar'
            AND is_current = TRUE
        `,
        [plan.now],
      )

      await client.query(
        `
          INSERT INTO public.algorithm_seed_versions (
            id, seed_type, seed_version, seed_scope, source_standards, expected_counts,
            evidence_sources, validation_result, status, is_current, imported_by, published_by,
            imported_at, published_at, created_at, updated_at
          )
          VALUES ($1, 'work_calendar', $2, 'algorithm_auxiliary', $3::jsonb, $4::jsonb,
            $5::jsonb, $6::jsonb, 'active', TRUE, $7, $7, $8, $8, $8, $8)
        `,
        [
          plan.seedVersionId,
          plan.seedVersion,
          JSON.stringify(plan.sourceStandards),
          JSON.stringify({ records: plan.mergedRecords.length, forecastYearRecords: records.length, year }),
          JSON.stringify(plan.evidenceSources),
          JSON.stringify(plan.validationResult),
          userId ?? null,
          plan.now,
        ],
      )

      for (const record of plan.mergedRecords) {
        await client.query(
          `
            INSERT INTO public.algorithm_seed_records (
              id, seed_version_id, seed_type, stable_code, rule_payload, source_standard,
              source_version, source_clause_ref, evidence_source_keys, confidence,
              web_verified, review_needed, status
            )
            VALUES ($1, $2, 'work_calendar', $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9, $10, $11, 'active')
          `,
          [
            uuidv4(),
            plan.seedVersionId,
            record.stableCode,
            JSON.stringify(record.payload),
            record.sourceStandard,
            record.sourceVersion,
            record.sourceClauseRef,
            JSON.stringify(record.evidenceSourceKeys),
            record.confidence,
            record.webVerified,
            record.reviewNeeded,
          ],
        )
      }

      await client.query(
        `
          INSERT INTO public.algorithm_seed_import_logs (
            id, seed_version_id, seed_type, import_source, expected_counts_snapshot,
            actual_counts_snapshot, validation_result, imported_by, imported_at
          )
          VALUES ($1, $2, 'work_calendar', 'system_forecast_calendar', $3::jsonb, $3::jsonb, $4::jsonb, $5, $6)
        `,
        [
          uuidv4(),
          plan.seedVersionId,
          JSON.stringify({ records: plan.mergedRecords.length, forecastYearRecords: records.length, year }),
          JSON.stringify(plan.validationResult),
          userId ?? null,
          plan.now,
        ],
      )

      await client.query('COMMIT')
      clearAlgorithmSeedResolverCache('work_calendar')
      return {
        seedType: 'work_calendar' as const,
        seedVersionId: plan.seedVersionId,
        seedVersion: plan.seedVersion,
        recordCount: records.length,
        totalRecordCount: plan.mergedRecords.length,
        records,
        impactPropagation: {
          baselineRealignQueued: 0,
          monthlyPlanRealignQueued: 0,
          affectedProjectIds: [],
          skipped: true,
          reason: 'forecast_calendar_does_not_realign_confirmed_plans',
        } satisfies WorkCalendarImpactPropagationResult,
      }
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        logger.warn('[officialHolidayCalendarService] failed to rollback forecast work_calendar publish', {
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        })
      }
      throw error
    } finally {
      client.release()
    }
  }

  const currentSnapshot = await loadCurrentWorkCalendarSnapshot()
  const plan = buildOfficialWorkCalendarPublishPlan(input, records, currentSnapshot, planOptions)
  await withOfficialCalendarDbTimeout(
    supabase
      .from('algorithm_seed_versions')
      .update({ is_current: false, status: 'deprecated', updated_at: plan.now })
      .eq('seed_type', 'work_calendar')
      .eq('is_current', true),
    'Deprecate previous forecast work_calendar seed version',
  )
  const { error: versionError } = await withOfficialCalendarDbTimeout(
    supabase.from('algorithm_seed_versions').insert({
      id: plan.seedVersionId,
      seed_type: 'work_calendar',
      seed_version: plan.seedVersion,
      seed_scope: 'algorithm_auxiliary',
      source_standards: plan.sourceStandards,
      expected_counts: { records: plan.mergedRecords.length, forecastYearRecords: records.length, year },
      evidence_sources: plan.evidenceSources,
      validation_result: plan.validationResult,
      status: 'active',
      is_current: true,
      imported_by: userId ?? null,
      published_by: userId ?? null,
      imported_at: plan.now,
      published_at: plan.now,
      created_at: plan.now,
      updated_at: plan.now,
    }),
    'Insert forecast work_calendar seed version',
  )
  if (versionError) throw versionError

  const { error: recordError } = await withOfficialCalendarDbTimeout(
    supabase.from('algorithm_seed_records').insert(plan.mergedRecords.map((record) => ({
      id: uuidv4(),
      seed_version_id: plan.seedVersionId,
      seed_type: 'work_calendar',
      stable_code: record.stableCode,
      rule_payload: record.payload,
      source_standard: record.sourceStandard,
      source_version: record.sourceVersion,
      source_clause_ref: record.sourceClauseRef,
      evidence_source_keys: record.evidenceSourceKeys,
      confidence: record.confidence,
      web_verified: record.webVerified,
      review_needed: record.reviewNeeded,
      status: 'active',
    }))),
    'Insert forecast work_calendar seed records',
  )
  if (recordError) throw recordError

  clearAlgorithmSeedResolverCache('work_calendar')
  return {
    seedType: 'work_calendar' as const,
    seedVersionId: plan.seedVersionId,
    seedVersion: plan.seedVersion,
    recordCount: records.length,
    totalRecordCount: plan.mergedRecords.length,
    records,
    impactPropagation: {
      baselineRealignQueued: 0,
      monthlyPlanRealignQueued: 0,
      affectedProjectIds: [],
      skipped: true,
      reason: 'forecast_calendar_does_not_realign_confirmed_plans',
    } satisfies WorkCalendarImpactPropagationResult,
  }
}

export async function refreshOfficialWorkCalendarFromNotice(params: { year: number; sourceUrl: string; userId?: string | null }) {
  assertGovCnSource(params.sourceUrl)
  const response = await fetchOfficialHolidayNotice(params.sourceUrl)
  if (!response.ok) {
    throw Object.assign(new Error(`Failed to fetch official holiday notice: HTTP ${response.status}`), { code: 'OFFICIAL_NOTICE_FETCH_FAILED' })
  }
  const html = await response.text()
  const holidays = parseOfficialHolidayNotice(params.year, html)
  logger.info('[officialHolidayCalendarService] parsed official holiday notice', {
    year: params.year,
    sourceUrl: params.sourceUrl,
    records: holidays.length,
  })
  return await importOfficialWorkCalendar({
    year: params.year,
    sourceUrl: params.sourceUrl,
    holidays,
    userId: params.userId ?? null,
  })
}
