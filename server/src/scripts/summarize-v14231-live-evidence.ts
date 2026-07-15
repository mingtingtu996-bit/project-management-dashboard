import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveEvidencePath, writeJsonFile } from './jsonEvidenceUtils.js'

export type V14231EvidenceNormalizedStatus =
  | 'pass'
  | 'closed'
  | 'ready'
  | 'blocked'
  | 'fail'
  | 'missing'
  | 'unknown'

export type V14231LiveEvidenceInventoryItem = {
  itemId: string
  title: string
  evidenceFile: string
  missingEvidenceFile: boolean
  rawStatus: string | null
  normalizedStatus: V14231EvidenceNormalizedStatus
  missingArchivedJson: boolean | null
  blockingReasons: string[]
  missingInputs: string[]
  boundary: 'live_required' | 'release_required' | 'old_object_drop_required'
}

export type V14231LiveEvidenceInventory = {
  reportCode: 'v14231_live_evidence_inventory'
  generatedAt: string
  evidenceDir: string
  outputFile: string | null
  status: 'pass' | 'blocked'
  canClaimLiveCloseoutComplete: boolean
  countsByNormalizedStatus: Partial<Record<V14231EvidenceNormalizedStatus, number>>
  items: V14231LiveEvidenceInventoryItem[]
  boundaryPolicy: string[]
}

export type V14231LiveEvidenceInventoryOptions = {
  evidenceDir?: string | null
  outputFile?: string | null
  generatedAt?: string | null
}

type EvidenceDefinition = {
  itemId: string
  title: string
  filename?: string
  filenames?: string[]
  summaryItemId?: string
  boundary: V14231LiveEvidenceInventoryItem['boundary']
}

type JsonRecord = Record<string, unknown>

const evidenceDefinitions: EvidenceDefinition[] = [
  {
    itemId: 'C-18.L01-L03',
    title: 'RLS / policy / runtime role live catalog readback',
    filename: 'c18-l01-l03-rls-proacl-current.json',
    boundary: 'live_required',
  },
  {
    itemId: 'C-18.L04',
    title: 'retired SQL RPC anonymous PoC live probe',
    filename: 'c18-l04-execute-sql-anon-current.json',
    boundary: 'live_required',
  },
  {
    itemId: 'C-18.L06',
    title: 'duration canary approval live concurrency probe',
    filename: 'c18-l06-duration-canary-current.json',
    boundary: 'live_required',
  },
  {
    itemId: 'C-18.L07',
    title: 'critical path true concurrency and route refresh',
    filenames: [
      'c18-l07-critical-path-concurrency-live.json',
      'c18-l07-critical-path-concurrency-blocked.json',
      'c18-live-evidence-summary.json',
    ],
    summaryItemId: 'C-18.L07',
    boundary: 'live_required',
  },
  {
    itemId: 'C-18.L08',
    title: 'acceptance status concurrency',
    filenames: [
      'c18-l08-acceptance-status-concurrency-live.json',
      'c18-l08-acceptance-concurrency-blocked.json',
      'c18-live-evidence-summary.json',
    ],
    summaryItemId: 'C-18.L08',
    boundary: 'live_required',
  },
  {
    itemId: 'C-18.L09',
    title: 'wizard commit live concurrency and failure injection',
    filenames: [
      'c18-l09-wizard-commit-live.json',
      'c18-l09-wizard-commit-blocked.json',
      'c18-live-evidence-summary.json',
    ],
    summaryItemId: 'C-18.L09',
    boundary: 'live_required',
  },
  {
    itemId: 'C-18.L10',
    title: 'WBS large generation route pressure evidence',
    filenames: [
      'c18-l10-wbs-generation-pressure.json',
      'c18-l10-wbs-generation-require-live-blocked.json',
      'c18-live-evidence-summary.json',
    ],
    summaryItemId: 'C-18.L10',
    boundary: 'live_required',
  },
  {
    itemId: 'C-18.L11',
    title: 'warning notification sync DB query log evidence',
    filenames: [
      'c18-l11-warning-sync-query-log.json',
      'c18-l11-warning-sync-blocked.json',
      'c18-live-evidence-summary.json',
    ],
    summaryItemId: 'C-18.L11',
    boundary: 'live_required',
  },
  {
    itemId: 'C-18.L12',
    title: 'critical path large persisted network DB evidence',
    filenames: [
      'c18-l12-critical-path-network-pressure.json',
      'c18-l12-critical-path-require-live-blocked.json',
      'c18-live-evidence-summary.json',
    ],
    summaryItemId: 'C-18.L12',
    boundary: 'live_required',
  },
  {
    itemId: 'C-18.L13',
    title: 'company health trend >1000 snapshot pagination live probe',
    filename: 'c18-l13-health-trend-current.json',
    boundary: 'live_required',
  },
  {
    itemId: 'C-18.L14',
    title: 'company summary 50/100/500 route and DB performance evidence',
    filenames: [
      'c18-l14-company-summary-pressure.json',
      'c18-l14-company-summary-require-live-blocked.json',
      'c18-live-evidence-summary.json',
    ],
    summaryItemId: 'C-18.L14',
    boundary: 'live_required',
  },
  {
    itemId: 'C-18.L15',
    title: 'spreadsheet import pressure and migration replay evidence',
    filenames: [
      'c18-l15-spreadsheet-migration-replay.json',
      'c18-l15-spreadsheet-migration-blocked.json',
      'c18-live-evidence-summary.json',
    ],
    summaryItemId: 'C-18.L15',
    boundary: 'live_required',
  },
  {
    itemId: 'C-19.T2-LIVE-REPLAY',
    title: 'T2 rhythm archived live replay evidence',
    filenames: [
      'c19-t2-rhythm-live-replay.json',
      'c19-t2-rhythm-live-replay-current.json',
    ],
    boundary: 'release_required',
  },
  {
    itemId: 'C-19.CONSTRUCTION-ORG',
    title: 'construction organization product closeout live diagnostic',
    filenames: [
      'c19-construction-organization-e1-e3-e5.json',
      'c19-construction-organization-closeout-current.json',
    ],
    boundary: 'release_required',
  },
  {
    itemId: 'OLD-OBJECT-DROP',
    title: 'legacy object physical drop guard',
    filenames: [
      'old-object-no-safe-candidate-closeout.json',
      'guard-legacy-object-drop.json',
      'legacy-object-drop-guard.initial.json',
    ],
    boundary: 'old_object_drop_required',
  },
]

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function defaultEvidenceDir() {
  return join('artifacts', 'test-runs', '20260628-v14231-live-execution')
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function tryParseJsonRecord(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function extractBalancedJsonObject(value: string, startIndex: number) {
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = inString
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === '{') {
      depth += 1
      continue
    }

    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return value.slice(startIndex, index + 1)
      }
    }
  }

  return null
}

function parseJsonObjectFromText(value: string) {
  const text = value.replace(/^\uFEFF/, '').trim()
  const direct = tryParseJsonRecord(text)
  if (direct) return direct

  for (let index = text.indexOf('{'); index >= 0; index = text.indexOf('{', index + 1)) {
    const candidate = extractBalancedJsonObject(text, index)
    if (!candidate) continue
    const parsed = tryParseJsonRecord(candidate)
    if (parsed) return parsed
  }

  return null
}

function decodeEvidenceText(path: string) {
  const buffer = readFileSync(path)
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le')
  }

  const utf8 = buffer.toString('utf8')
  const sample = utf8.slice(0, 128)
  const nulCount = Array.from(sample).filter((char) => char === '\u0000').length
  return nulCount > sample.length / 4 ? buffer.toString('utf16le') : utf8
}

function readEvidenceJson(path: string) {
  try {
    return parseJsonObjectFromText(decodeEvidenceText(path))
  } catch {
    return null
  }
}

function readStringArray(payload: JsonRecord | null, key: string) {
  const value = payload?.[key]
  return Array.isArray(value)
    ? value.map(normalizeText).filter(Boolean)
    : []
}

function isMissingEvidenceValue(value: unknown) {
  return value === null || value === undefined || normalizeText(value) === ''
}

const liveAssessmentKeys = [
  'routeEvidenceAssessment',
  'dbEvidenceAssessment',
  'importPressureEvidenceAssessment',
  'migrationReplayEvidenceAssessment',
]

function liveAssessmentRecords(payload: JsonRecord | null) {
  if (!payload) return []
  return liveAssessmentKeys
    .map((key) => payload[key])
    .filter(isRecord)
}

function collectRuntimeEvidenceGapReasons(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectRuntimeEvidenceGapReasons)
  }

  if (!isRecord(value)) return []

  const reasons: string[] = []
  for (const [key, childValue] of Object.entries(value)) {
    if (key === 'runtimeEvidenceGap' && isRecord(childValue)) {
      for (const [gapKey, gapValue] of Object.entries(childValue)) {
        if (gapValue === true) reasons.push(`runtime_evidence_gap:${gapKey}`)
      }
    }
    reasons.push(...collectRuntimeEvidenceGapReasons(childValue))
  }
  return reasons
}

function collectDerivedBlockingReasons(payload: JsonRecord | null) {
  if (!payload) return []

  const liveEvidenceMissingReasons: string[] = []
  const requiresLiveEvidence = payload.requireLiveEvidence === true || payload.liveEvidenceRequired === true
  const assessmentRecords = liveAssessmentRecords(payload)

  if (requiresLiveEvidence) {
    if ('routeEvidenceFile' in payload && isMissingEvidenceValue(payload.routeEvidenceFile)) {
      liveEvidenceMissingReasons.push('missing_route_evidence_file')
    }
    if ('routeEvidenceAssessment' in payload && isMissingEvidenceValue(payload.routeEvidenceAssessment)) {
      liveEvidenceMissingReasons.push('missing_route_evidence_assessment')
    }
    if ('dbEvidenceFile' in payload && isMissingEvidenceValue(payload.dbEvidenceFile)) {
      liveEvidenceMissingReasons.push('missing_db_evidence_file')
    }
    if ('dbEvidenceAssessment' in payload && isMissingEvidenceValue(payload.dbEvidenceAssessment)) {
      liveEvidenceMissingReasons.push('missing_db_evidence_assessment')
    }
  }

  const assessmentMetadataReasons = assessmentRecords.flatMap((assessment) => [
    ...(assessment.missingEvidenceMetadata === true ? ['missing_live_evidence_metadata'] : []),
    ...(assessment.nonLiveEvidenceMetadata === true ? ['non_live_evidence_metadata'] : []),
  ])
  const gapReasons = assessmentRecords.length > 0
    ? assessmentRecords.flatMap(collectRuntimeEvidenceGapReasons)
    : collectRuntimeEvidenceGapReasons(payload)
  return [
    ...(requiresLiveEvidence && (
      liveEvidenceMissingReasons.length > 0
      || assessmentMetadataReasons.length > 0
      || gapReasons.length > 0
    )
      ? ['live_evidence_required']
      : []),
    ...liveEvidenceMissingReasons,
    ...assessmentMetadataReasons,
    ...gapReasons,
  ]
}

function collectBlockingReasons(payload: JsonRecord | null) {
  return Array.from(new Set([
    ...readStringArray(payload, 'blockingReasons'),
    ...readStringArray(payload, 'reasons'),
    ...readStringArray(payload, 'reasonCodes'),
    ...collectDerivedBlockingReasons(payload),
  ]))
}

function findSummaryItem(payload: JsonRecord | null, itemId: string | undefined) {
  if (!payload || !itemId || !Array.isArray(payload.items)) return null
  return payload.items.find((item): item is JsonRecord => (
    isRecord(item) && normalizeText(item.itemId) === itemId
  )) ?? null
}

function collectBlockingReasonsForDefinition(
  definition: EvidenceDefinition,
  payload: JsonRecord | null,
) {
  return collectBlockingReasons(findSummaryItem(payload, definition.summaryItemId) ?? payload)
}

function collectMissingInputs(payload: JsonRecord | null) {
  return Array.from(new Set([
    ...readStringArray(payload, 'missingInputs'),
    ...readStringArray(payload, 'requiredInputs'),
  ]))
}

function collectMissingInputsForDefinition(
  definition: EvidenceDefinition,
  payload: JsonRecord | null,
) {
  return collectMissingInputs(findSummaryItem(payload, definition.summaryItemId) ?? payload)
}

function rawStatus(payload: JsonRecord | null) {
  return normalizeText(payload?.status) || null
}

function effectiveRawStatus(payload: JsonRecord | null) {
  const status = rawStatus(payload)
  if (status) return status

  const assessmentStatuses = liveAssessmentRecords(payload)
    .map(rawStatus)
    .filter((value): value is string => Boolean(value))
  if (assessmentStatuses.length === 0) return null

  const normalized = assessmentStatuses.map(normalizeStatus)
  if (normalized.some((value) => value === 'fail')) return 'fail'
  if (normalized.some((value) => value === 'blocked')) return 'blocked'
  if (normalized.every((value) => value === 'pass')) return 'pass'
  if (normalized.every((value) => value === 'pass' || value === 'closed' || value === 'ready')) {
    return 'ready'
  }
  return assessmentStatuses[0] ?? null
}

function effectiveRawStatusForDefinition(
  definition: EvidenceDefinition,
  payload: JsonRecord | null,
) {
  const summaryItem = findSummaryItem(payload, definition.summaryItemId)
  if (summaryItem) return effectiveRawStatus(summaryItem)
  if (definition.summaryItemId && payload && Array.isArray(payload.items)) return null
  return effectiveRawStatus(payload)
}

function normalizeStatus(status: string | null): V14231EvidenceNormalizedStatus {
  const value = normalizeText(status).toLowerCase()
  if (value === 'pass') return 'pass'
  if (value === 'closed') return 'closed'
  if (value.includes('ready')) return 'ready'
  if (value === 'blocked') return 'blocked'
  if (value === 'fail' || value === 'failed') return 'fail'
  if (!value) return 'unknown'
  return 'unknown'
}

function normalizeEvidenceStatus(
  status: string | null,
  payload: JsonRecord | null,
): V14231EvidenceNormalizedStatus {
  const normalized = normalizeStatus(status)
  if (normalized !== 'unknown') return normalized
  return collectDerivedBlockingReasons(payload).length > 0 ? 'blocked' : 'unknown'
}

function countStatuses(items: V14231LiveEvidenceInventoryItem[]) {
  const counts: Partial<Record<V14231EvidenceNormalizedStatus, number>> = {}
  for (const item of items) {
    counts[item.normalizedStatus] = (counts[item.normalizedStatus] ?? 0) + 1
  }
  return counts
}

function boundaryPolicy() {
  return [
    'inventory_is_read_only_and_does_not_execute_live_writes',
    'blocked_fail_or_missing_evidence_keeps_v14231_live_closeout_blocked',
    'http_ui_browser_evidence_does_not_replace_db_catalog_query_log_publication_or_rollback_evidence',
    'old_object_drop_requires_drop_ready_candidate_archived_readbacks_api_smoke_rollback_and_approval',
  ]
}

function evidenceFilenames(definition: EvidenceDefinition) {
  return (definition.filenames ?? [definition.filename])
    .map((filename) => normalizeText(filename))
    .filter(Boolean)
}

function resolveEvidenceFile(evidenceDir: string, definition: EvidenceDefinition) {
  const filenames = evidenceFilenames(definition)
  for (const filename of filenames) {
    const candidate = join(evidenceDir, filename)
    if (existsSync(candidate)) return { evidenceFile: candidate, missingEvidenceFile: false }
  }
  return {
    evidenceFile: join(evidenceDir, filenames[0] ?? ''),
    missingEvidenceFile: true,
  }
}

export function buildV14231LiveEvidenceInventory(
  options: V14231LiveEvidenceInventoryOptions = {},
): V14231LiveEvidenceInventory {
  const evidenceDir = normalizeText(options.evidenceDir) || defaultEvidenceDir()
  const resolvedEvidenceDir = resolveEvidencePath(evidenceDir)
  const generatedAt = normalizeText(options.generatedAt) || new Date().toISOString()
  const outputFile = normalizeText(options.outputFile) || null
  const items = evidenceDefinitions.map((definition): V14231LiveEvidenceInventoryItem => {
    const { evidenceFile, missingEvidenceFile } = resolveEvidenceFile(resolvedEvidenceDir, definition)
    const payload = missingEvidenceFile ? null : readEvidenceJson(evidenceFile)
    const status = missingEvidenceFile ? 'missing' : effectiveRawStatusForDefinition(definition, payload)
    return {
      itemId: definition.itemId,
      title: definition.title,
      evidenceFile,
      missingEvidenceFile,
      rawStatus: missingEvidenceFile ? null : status,
      normalizedStatus: missingEvidenceFile ? 'missing' : normalizeEvidenceStatus(status, payload),
      missingArchivedJson: typeof payload?.missingArchivedJson === 'boolean' ? payload.missingArchivedJson : null,
      blockingReasons: collectBlockingReasonsForDefinition(definition, payload),
      missingInputs: collectMissingInputsForDefinition(definition, payload),
      boundary: definition.boundary,
    }
  })
  const canClaimLiveCloseoutComplete = items.every((item) => (
    item.normalizedStatus === 'pass'
    || item.normalizedStatus === 'closed'
    || item.normalizedStatus === 'ready'
  ))

  return {
    reportCode: 'v14231_live_evidence_inventory',
    generatedAt,
    evidenceDir,
    outputFile,
    status: canClaimLiveCloseoutComplete ? 'pass' : 'blocked',
    canClaimLiveCloseoutComplete,
    countsByNormalizedStatus: countStatuses(items),
    items,
    boundaryPolicy: boundaryPolicy(),
  }
}

export function writeV14231LiveEvidenceInventoryIfRequested(
  inventory: V14231LiveEvidenceInventory,
) {
  if (!inventory.outputFile) return
  writeJsonFile(inventory.outputFile, inventory)
}

export function shouldFailV14231LiveEvidenceInventory(
  inventory: V14231LiveEvidenceInventory,
) {
  return !inventory.canClaimLiveCloseoutComplete
}

function parseStringArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : undefined
}

export function optionsFromArgs(argv: string[]): V14231LiveEvidenceInventoryOptions {
  const args = argv.slice(2)
  const evidenceDir = parseStringArg(args, 'evidence-dir') ?? parseStringArg(args, 'input-root')
  return {
    evidenceDir,
    outputFile: parseStringArg(args, 'output-file'),
    generatedAt: parseStringArg(args, 'generated-at'),
  }
}

function main() {
  const inventory = buildV14231LiveEvidenceInventory(optionsFromArgs(process.argv))
  writeV14231LiveEvidenceInventoryIfRequested(inventory)
  console.log(JSON.stringify(inventory, null, 2))
  if (shouldFailV14231LiveEvidenceInventory(inventory)) {
    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
