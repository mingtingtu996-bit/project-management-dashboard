import type {
  DurationAssetRole,
  EffectiveDurationAssetResolution,
  EffectiveDurationAssetSource,
} from './durationAssetRuntimeContractService.js'

export type DurationAssetConsumptionStatus =
  | 'effective_applied'
  | 'advisory_used'
  | 'evidence_only'
  | 'not_applicable'
  | 'blocked_by_conflict'

export type DurationAssetChangedField =
  | 'task_selection'
  | 'duration'
  | 'dates'
  | 'dependency'
  | 'overlap'
  | 'buffer'
  | 'confidence'

export type DurationAssetEffectProjection = {
  taskSelection?: unknown
  durationDays?: unknown
  dates?: unknown
  dependencies?: unknown
  overlapRatio?: unknown
  bufferDays?: unknown
  confidence?: unknown
  metadata?: unknown
}

export type DurationAssetConsumptionReceipt = {
  consumer: string
  assetType: string
  stableCode: string
  role: DurationAssetRole
  effectiveSource: EffectiveDurationAssetSource
  versionId: string | null
  publicationKey: string | null
  status: DurationAssetConsumptionStatus
  changedFields: DurationAssetChangedField[]
  targetRowIds: string[]
  reasonCodes: string[]
  rollbackTarget: string | null
  lineage?: Record<string, unknown>
}

export type DurationAssetConsumptionSummary = {
  source: 'duration_asset_consumption_receipt_summary'
  totalCount: number
  effectiveAppliedCount: number
  advisoryUsedCount: number
  evidenceOnlyCount: number
  notApplicableCount: number
  blockedByConflictCount: number
  changedFieldCounts: Record<DurationAssetChangedField, number>
  effectiveStableCodes: string[]
}

type ReceiptInput<T> = {
  consumer: string
  resolution: EffectiveDurationAssetResolution<T>
  before: DurationAssetEffectProjection
  after: DurationAssetEffectProjection
  targetRowIds: string[]
  applicable?: boolean
  reasonCodes?: string[]
  lineage?: Record<string, unknown>
}

const PROJECTION_FIELDS: Array<{
  changedField: DurationAssetChangedField
  projectionKey: keyof DurationAssetEffectProjection
}> = [
  { changedField: 'task_selection', projectionKey: 'taskSelection' },
  { changedField: 'duration', projectionKey: 'durationDays' },
  { changedField: 'dates', projectionKey: 'dates' },
  { changedField: 'dependency', projectionKey: 'dependencies' },
  { changedField: 'overlap', projectionKey: 'overlapRatio' },
  { changedField: 'buffer', projectionKey: 'bufferDays' },
  { changedField: 'confidence', projectionKey: 'confidence' },
]

function text(value: unknown) {
  return String(value ?? '').trim()
}

function uniqueText(values: unknown[]) {
  return Array.from(new Set(values.map(text).filter(Boolean)))
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  return value ?? null
}

function equivalent(left: unknown, right: unknown) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
}

function changedFields(
  before: DurationAssetEffectProjection,
  after: DurationAssetEffectProjection,
) {
  return PROJECTION_FIELDS
    .filter(({ projectionKey }) => !equivalent(before[projectionKey], after[projectionKey]))
    .map(({ changedField }) => changedField)
}

export function buildDurationAssetConsumptionReceipt<T>(
  input: ReceiptInput<T>,
): DurationAssetConsumptionReceipt {
  const resolution = input.resolution
  const targetRowIds = uniqueText(input.targetRowIds)
  const inputReasons = uniqueText(input.reasonCodes ?? [])
  const conflicts = uniqueText(resolution.conflictCodes)

  let status: DurationAssetConsumptionStatus
  let appliedFields: DurationAssetChangedField[] = []
  let reasonCodes: string[]

  if (input.applicable === false) {
    status = 'not_applicable'
    reasonCodes = inputReasons.length > 0 ? inputReasons : ['asset_not_applicable']
  } else if (conflicts.length > 0) {
    status = 'blocked_by_conflict'
    reasonCodes = uniqueText([...inputReasons, ...conflicts])
  } else {
    appliedFields = changedFields(input.before, input.after)
    if (resolution.role === 'candidate_advisory' && appliedFields.length > 0) {
      status = 'advisory_used'
      reasonCodes = uniqueText([...inputReasons, 'candidate_advisory_only'])
    } else if (resolution.runtimeConsumable && appliedFields.length > 0) {
      status = 'effective_applied'
      reasonCodes = inputReasons
    } else {
      status = 'evidence_only'
      reasonCodes = uniqueText([...inputReasons, 'no_governed_output_change'])
    }
  }

  return {
    consumer: text(input.consumer),
    assetType: text(resolution.assetType),
    stableCode: text(resolution.stableCode),
    role: resolution.role,
    effectiveSource: resolution.effectiveSource,
    versionId: resolution.versionId,
    publicationKey: resolution.publicationKey,
    status,
    changedFields: status === 'blocked_by_conflict' || status === 'not_applicable'
      ? []
      : appliedFields,
    targetRowIds,
    reasonCodes,
    rollbackTarget: resolution.rollbackTarget,
    ...(input.lineage && Object.keys(input.lineage).length > 0
      ? { lineage: canonicalize(input.lineage) as Record<string, unknown> }
      : {}),
  }
}

export function summarizeDurationAssetConsumption(
  receipts: DurationAssetConsumptionReceipt[],
): DurationAssetConsumptionSummary {
  const changedFieldCounts: Record<DurationAssetChangedField, number> = {
    task_selection: 0,
    duration: 0,
    dates: 0,
    dependency: 0,
    overlap: 0,
    buffer: 0,
    confidence: 0,
  }
  for (const receipt of receipts) {
    for (const field of receipt.changedFields) changedFieldCounts[field] += 1
  }

  return {
    source: 'duration_asset_consumption_receipt_summary',
    totalCount: receipts.length,
    effectiveAppliedCount: receipts.filter((receipt) => receipt.status === 'effective_applied').length,
    advisoryUsedCount: receipts.filter((receipt) => receipt.status === 'advisory_used').length,
    evidenceOnlyCount: receipts.filter((receipt) => receipt.status === 'evidence_only').length,
    notApplicableCount: receipts.filter((receipt) => receipt.status === 'not_applicable').length,
    blockedByConflictCount: receipts.filter((receipt) => receipt.status === 'blocked_by_conflict').length,
    changedFieldCounts,
    effectiveStableCodes: uniqueText(receipts
      .filter((receipt) => receipt.status === 'effective_applied')
      .map((receipt) => receipt.stableCode)),
  }
}
