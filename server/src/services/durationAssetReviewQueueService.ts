import { executeSQL } from './dbService.js'
import { withDatabaseTransaction } from '../database.js'
import type {
  DurationLearningRuntimeAssetKey,
  DurationLearningRuntimeScope,
} from './durationLearningRuntimePublicationService.js'
import { hashDurationContextPolicyLearningValue } from './durationContextPolicyLearningCheckpointService.js'

export const DURATION_ASSET_REVIEW_KEYS = [
  'base_duration_benchmark',
  'standard_work_duration_seed',
  'special_work_duration_seed',
  'wbs_reference_days',
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
] as const satisfies readonly DurationLearningRuntimeAssetKey[]

export type DurationAssetReviewKey = typeof DURATION_ASSET_REVIEW_KEYS[number]
export type DurationAssetReviewScope = DurationLearningRuntimeScope
export type DurationAssetReviewStatus = 'open' | 'approved' | 'rejected' | 'superseded' | 'resolved_by_publication'
export type DurationAssetReviewKind = 'candidate_publication' | 'stable_promotion'
export type DurationAssetReviewResolutionSource =
  | 'automatic_publication'
  | 'manual_approval'
  | 'manual_rejection'
  | 'manual_supersession'

export interface BuildDurationAssetReviewDecisionFingerprintInput {
  runtimePayload: Record<string, unknown>
  sourceCandidateRefs: string[]
  sourceEvidenceRefs: string[]
  conflictState: { conflictCount: number }
  replayState: { replayPassed: boolean | null }
  policyEvidence: {
    evaluationRequired: boolean
    stage: string | null
    autoPromotionAllowed: boolean | null
    manualReviewRequired: boolean | null
    reasonCodes: string[]
    evidence: Record<string, unknown> | null
  }
  reasonCodes: string[]
  monitoringEvidence: null | {
    publicationKey: string
    monitoringStatus: string
    monitoringMetrics: Record<string, unknown>
    stableDecision: Record<string, unknown>
  }
}

export interface BuildDurationAssetReviewSourceKeyInput {
  reviewKind: DurationAssetReviewKind
  assetKey: DurationAssetReviewKey
  artifactKey: string
  proposalKey?: string | null
  publicationKey?: string | null
  decisionFingerprint: string
  scope: DurationLearningRuntimeScope
}

export interface BuildDurationAssetReviewPayloadInput {
  stableKeys?: Record<string, unknown>
  counts?: Record<string, unknown>
  stage?: string | null
  scope?: DurationLearningRuntimeScope | null
  reasonCodes?: string[]
  sourceCandidateRefs?: string[]
  sourceEvidenceRefs?: string[]
  monitoringEvidence?: BuildDurationAssetReviewDecisionFingerprintInput['monitoringEvidence']
}

export type DurationAssetReviewTransactionRunner = <T>(work: () => Promise<T>) => Promise<T>
export type DurationAssetReviewQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export interface DurationAssetReviewItem {
  id: string
  sourceKey: string
  decisionFingerprint: string
  reviewKind: DurationAssetReviewKind
  assetKey: DurationAssetReviewKey
  artifactKey: string
  scope: DurationLearningRuntimeScope
  proposalKey: string | null
  candidateEventRef: string | null
  conflictRef: string | null
  publicationKey: string | null
  resolvedPublicationKey: string | null
  reasonCodes: string[]
  reviewPayload: Record<string, unknown> | null
  status: DurationAssetReviewStatus
  canReview: boolean
  approvalReady: boolean
  assignedToUserId: string | null
  reviewedByUserId: string | null
  reviewedAt: string | null
  decisionReason: string | null
  resolutionSource: DurationAssetReviewResolutionSource | null
  createdAt: string
  updatedAt: string
}

export interface UpsertDurationAssetReviewItemInput extends BuildDurationAssetReviewSourceKeyInput {
  candidateEventRef?: string | null
  conflictRef?: string | null
  reasonCodes: string[]
  reviewPayload: Record<string, unknown>
}

export interface ResolveDurationAssetReviewItemInput {
  sourceKey: string
  publicationKey: string
  reviewedAt: string
  resolutionSource: 'automatic_publication' | 'manual_approval'
  reviewerUserId: string | null
  decisionReason: string
}

export interface ResolveOpenDurationAssetReviewItemsByPublicationInput {
  reviewKind: DurationAssetReviewKind
  assetKey: DurationAssetReviewKey
  artifactKey: string
  scope: DurationLearningRuntimeScope
  proposalKey?: string | null
  publicationKey: string
  reviewedAt: string
  resolutionSource: 'automatic_publication'
  reviewerUserId: null
  decisionReason: string
}

export interface DecideDurationAssetReviewProjectionInput {
  id: string
  status: 'rejected' | 'superseded'
  reviewerUserId: string
  reviewedAt: string
  decisionReason: string
  resolutionSource: 'manual_rejection' | 'manual_supersession'
}

export interface DurationAssetReviewWriteResult {
  item: DurationAssetReviewItem
  disposition: 'created' | 'reused' | 'terminal_reused' | 'resolved' | 'decided'
}

export interface ListDurationAssetReviewItemsInput {
  companyId: string
  projectIds: string[] | null
  assetKey?: DurationAssetReviewKey | null
  scopeLevel?: DurationLearningRuntimeScope['level'] | null
  projectId?: string | null
  reason?: string | null
  status?: DurationAssetReviewStatus | null
  age?: 'all' | '24h' | '7d' | '30d'
  limit?: number
  now?: string
}

export interface DurationAssetReviewReadModel {
  generatedAt: string
  items: DurationAssetReviewItem[]
  total: number
}

export interface DurationAssetReviewQueueStore {
  upsertOpen(input: UpsertDurationAssetReviewItemInput): Promise<DurationAssetReviewWriteResult>
  loadForUpdate(id: string): Promise<DurationAssetReviewItem | null>
  resolveByPublication(input: ResolveDurationAssetReviewItemInput): Promise<DurationAssetReviewWriteResult>
  resolveOpenByPublicationIdentity(input: ResolveOpenDurationAssetReviewItemsByPublicationInput): Promise<number>
  decide(input: DecideDurationAssetReviewProjectionInput): Promise<DurationAssetReviewWriteResult>
  list(input: ListDurationAssetReviewItemsInput): Promise<DurationAssetReviewReadModel>
}

type QueueRow = Record<string, unknown>

const ASSET_KEYS = new Set<string>(DURATION_ASSET_REVIEW_KEYS)
const SCOPE_LEVELS = new Set<DurationLearningRuntimeScope['level']>(['project', 'company', 'industry', 'global'])
const REVIEW_KINDS = new Set<DurationAssetReviewKind>(['candidate_publication', 'stable_promotion'])
const REVIEW_STATUSES = new Set<DurationAssetReviewStatus>([
  'open', 'approved', 'rejected', 'superseded', 'resolved_by_publication',
])
const FORBIDDEN_PAYLOAD_KEY = /runtime.?payload|secret|token|credential|raw.?evidence|call.?context/i
const MAX_PAYLOAD_BYTES = 32768

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function nullableText(value: unknown) {
  return normalizeText(value) || null
}

function uniqueTexts(values: readonly unknown[]) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function canonicalValue(value: unknown): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalValue(entry)]),
    )
  }
  return String(value)
}

function requireNonEmpty(value: unknown, error: string) {
  const normalized = normalizeText(value)
  if (!normalized) throw new Error(error)
  return normalized
}

function requireFingerprint(value: string) {
  const normalized = normalizeText(value)
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('duration_asset_review_decision_fingerprint_invalid')
  }
  return normalized
}

export function requireDurationAssetReviewKey(value: unknown): DurationAssetReviewKey {
  const normalized = normalizeText(value)
  if (!ASSET_KEYS.has(normalized)) throw new Error('duration_asset_review_key_invalid')
  return normalized as DurationAssetReviewKey
}

function requireReviewKind(value: unknown): DurationAssetReviewKind {
  const normalized = normalizeText(value)
  if (!REVIEW_KINDS.has(normalized as DurationAssetReviewKind)) {
    throw new Error('duration_asset_review_kind_invalid')
  }
  return normalized as DurationAssetReviewKind
}

function requireReviewStatus(value: unknown): DurationAssetReviewStatus {
  const normalized = normalizeText(value)
  if (!REVIEW_STATUSES.has(normalized as DurationAssetReviewStatus)) {
    throw new Error('duration_asset_review_status_invalid')
  }
  return normalized as DurationAssetReviewStatus
}

function requirePublicationResolutionSource(value: unknown): 'automatic_publication' | 'manual_approval' {
  const normalized = normalizeText(value)
  if (normalized !== 'automatic_publication' && normalized !== 'manual_approval') {
    throw new Error('duration_asset_review_resolution_source_invalid')
  }
  return normalized
}

function requireDecisionStatus(value: unknown): 'rejected' | 'superseded' {
  const normalized = normalizeText(value)
  if (normalized !== 'rejected' && normalized !== 'superseded') {
    throw new Error('duration_asset_review_decision_status_invalid')
  }
  return normalized
}

function normalizeScope(scope: DurationLearningRuntimeScope): DurationLearningRuntimeScope {
  const record = asRecord(scope)
  const level = normalizeText(record.level) as DurationLearningRuntimeScope['level']
  if (!SCOPE_LEVELS.has(level)) throw new Error('duration_asset_review_scope_invalid')
  if (level === 'project') {
    if (nullableText(record.industryKey)) throw new Error('duration_asset_review_scope_invalid')
    const companyId = requireNonEmpty(record.companyId, 'project_scope_company_id_required')
    const projectId = requireNonEmpty(record.projectId, 'project_scope_project_id_required')
    return { level, companyId, projectId }
  }
  if (level === 'company') {
    if (nullableText(record.projectId) || nullableText(record.industryKey)) {
      throw new Error('duration_asset_review_scope_invalid')
    }
    return { level, companyId: requireNonEmpty(record.companyId, 'company_scope_company_id_required') }
  }
  if (level === 'industry') {
    if (nullableText(record.companyId) || nullableText(record.projectId)) {
      throw new Error('duration_asset_review_scope_invalid')
    }
    return { level, industryKey: requireNonEmpty(record.industryKey, 'industry_scope_key_required') }
  }
  if (nullableText(record.companyId) || nullableText(record.projectId) || nullableText(record.industryKey)) {
    throw new Error('duration_asset_review_scope_invalid')
  }
  return { level: 'global' }
}

function scopeFields(scope: DurationLearningRuntimeScope) {
  const normalized = normalizeScope(scope)
  return {
    scope: normalized,
    companyId: normalized.level === 'project' || normalized.level === 'company' ? normalized.companyId : null,
    projectId: normalized.level === 'project' ? normalized.projectId : null,
    industryKey: normalized.level === 'industry' ? normalized.industryKey : null,
  }
}

function assertNoForbiddenPayloadKeys(value: unknown) {
  if (Array.isArray(value)) {
    for (const entry of value) assertNoForbiddenPayloadKeys(entry)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PAYLOAD_KEY.test(key)) throw new Error('duration_asset_review_payload_key_forbidden')
    assertNoForbiddenPayloadKeys(entry)
  }
}

function assertPayloadSize(payload: Record<string, unknown>) {
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new Error('duration_asset_review_payload_too_large')
  }
}

function normalizeStableKeys(value: unknown) {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('duration_asset_review_payload_stable_keys_invalid')
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    const stableKey = requireNonEmpty(key, 'duration_asset_review_payload_stable_key_invalid')
    if (entry == null || typeof entry === 'object' || typeof entry === 'boolean') {
      throw new Error('duration_asset_review_payload_stable_key_invalid')
    }
    return [stableKey, requireNonEmpty(entry, 'duration_asset_review_payload_stable_key_invalid')]
  }))
}

function normalizeCounts(value: unknown) {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('duration_asset_review_payload_counts_invalid')
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, value]) => {
    const countKey = requireNonEmpty(key, 'duration_asset_review_payload_count_invalid')
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new Error('duration_asset_review_payload_count_invalid')
    }
    return [countKey, value]
  }))
}

function normalizePayloadCount(value: unknown) {
  if (value === undefined) return 0
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('duration_asset_review_payload_count_invalid')
  }
  return value
}

function normalizeOptionalTextList(value: unknown, error: string) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) throw new Error(error)
  return uniqueTexts(value).sort()
}

function validateQueuePayload(value: unknown) {
  assertNoForbiddenPayloadKeys(value)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('duration_asset_review_payload_invalid')
  }
  const payload = value as Record<string, unknown>
  const allowed = new Set([
    'stableKeys', 'counts', 'stage', 'scope', 'reasonCodes', 'sourceCandidateRefCount',
    'sourceEvidenceRefCount', 'monitoringEvidenceDigest',
  ])
  if (Object.keys(payload).some((key) => !allowed.has(key))) {
    throw new Error('duration_asset_review_payload_key_not_allowed')
  }
  const monitoringEvidenceDigest = nullableText(payload.monitoringEvidenceDigest)
  if (monitoringEvidenceDigest && !/^[a-f0-9]{64}$/.test(monitoringEvidenceDigest)) {
    throw new Error('duration_asset_review_payload_monitoring_digest_invalid')
  }
  const normalized = {
    stableKeys: normalizeStableKeys(payload.stableKeys),
    counts: normalizeCounts(payload.counts),
    stage: nullableText(payload.stage),
    scope: payload.scope == null ? null : normalizeScope(payload.scope as DurationLearningRuntimeScope),
    reasonCodes: normalizeOptionalTextList(payload.reasonCodes, 'duration_asset_review_payload_reason_codes_invalid'),
    sourceCandidateRefCount: normalizePayloadCount(payload.sourceCandidateRefCount),
    sourceEvidenceRefCount: normalizePayloadCount(payload.sourceEvidenceRefCount),
    monitoringEvidenceDigest,
  }
  const canonical = canonicalValue(normalized) as Record<string, unknown>
  assertPayloadSize(canonical)
  return canonical
}

export function buildDurationAssetReviewSourceKey(input: BuildDurationAssetReviewSourceKeyInput) {
  return `duration_asset_review:v1:${hashDurationContextPolicyLearningValue({
    reviewKind: requireReviewKind(input.reviewKind),
    assetKey: requireDurationAssetReviewKey(input.assetKey),
    artifactKey: requireNonEmpty(input.artifactKey, 'duration_asset_review_artifact_key_required'),
    proposalKey: nullableText(input.proposalKey),
    publicationKey: nullableText(input.publicationKey),
    decisionFingerprint: requireFingerprint(input.decisionFingerprint),
    scope: normalizeScope(input.scope),
  }).slice(0, 40)}`
}

export function buildDurationAssetReviewDecisionFingerprint(
  input: BuildDurationAssetReviewDecisionFingerprintInput,
) {
  return hashDurationContextPolicyLearningValue({
    runtimePayloadHash: hashDurationContextPolicyLearningValue(input.runtimePayload),
    sourceCandidateRefs: uniqueTexts(input.sourceCandidateRefs).sort(),
    sourceEvidenceRefs: uniqueTexts(input.sourceEvidenceRefs).sort(),
    conflictState: input.conflictState,
    replayState: input.replayState,
    policyEvidence: {
      ...input.policyEvidence,
      reasonCodes: uniqueTexts(input.policyEvidence.reasonCodes).sort(),
    },
    reasonCodes: uniqueTexts(input.reasonCodes).sort(),
    monitoringEvidence: input.monitoringEvidence
      ? {
          publicationKey: input.monitoringEvidence.publicationKey,
          monitoringStatus: input.monitoringEvidence.monitoringStatus,
          monitoringMetricsHash: hashDurationContextPolicyLearningValue(input.monitoringEvidence.monitoringMetrics),
          stableDecisionHash: hashDurationContextPolicyLearningValue(input.monitoringEvidence.stableDecision),
        }
      : null,
  })
}

export function buildDurationAssetReviewPayload(input: BuildDurationAssetReviewPayloadInput) {
  assertNoForbiddenPayloadKeys(input)
  const raw = asRecord(input)
  const allowed = new Set([
    'stableKeys', 'counts', 'stage', 'scope', 'reasonCodes', 'sourceCandidateRefs',
    'sourceEvidenceRefs', 'monitoringEvidence',
  ])
  if (Object.keys(raw).some((key) => !allowed.has(key))) {
    throw new Error('duration_asset_review_payload_key_not_allowed')
  }
  const counts = normalizeCounts(input.counts)
  const stableKeys = normalizeStableKeys(input.stableKeys)
  const payload = {
    stableKeys,
    counts,
    stage: nullableText(input.stage),
    scope: input.scope ? normalizeScope(input.scope) : null,
    reasonCodes: normalizeOptionalTextList(input.reasonCodes, 'duration_asset_review_payload_reason_codes_invalid'),
    sourceCandidateRefCount: normalizeOptionalTextList(
      input.sourceCandidateRefs,
      'duration_asset_review_payload_source_candidate_refs_invalid',
    ).length,
    sourceEvidenceRefCount: normalizeOptionalTextList(
      input.sourceEvidenceRefs,
      'duration_asset_review_payload_source_evidence_refs_invalid',
    ).length,
    monitoringEvidenceDigest: input.monitoringEvidence
      ? hashDurationContextPolicyLearningValue({
          publicationKey: input.monitoringEvidence.publicationKey,
          monitoringStatus: input.monitoringEvidence.monitoringStatus,
          monitoringMetrics: input.monitoringEvidence.monitoringMetrics,
          stableDecision: input.monitoringEvidence.stableDecision,
        })
      : null,
  }
  return validateQueuePayload(payload)
}

function field(row: QueueRow, snake: string, camel: string) {
  return row[snake] ?? row[camel]
}

function scopeFromRow(row: QueueRow): DurationLearningRuntimeScope {
  const level = normalizeText(field(row, 'scope_level', 'scopeLevel')) as DurationLearningRuntimeScope['level']
  const companyId = nullableText(field(row, 'company_id', 'companyId'))
  const projectId = nullableText(field(row, 'project_id', 'projectId'))
  const industryKey = nullableText(field(row, 'industry_key', 'industryKey'))
  if (level === 'project' && companyId && projectId && !industryKey) return { level, companyId, projectId }
  if (level === 'company' && companyId && !projectId && !industryKey) return { level, companyId }
  if (level === 'industry' && !companyId && !projectId && industryKey) return { level, industryKey }
  if (level === 'global' && !companyId && !projectId && !industryKey) return { level }
  throw new Error('duration_asset_review_row_scope_invalid')
}

function rowToItem(row: QueueRow, options: { sanitizeShared?: boolean } = {}): DurationAssetReviewItem {
  const scope = scopeFromRow(row)
  const shared = scope.level === 'industry' || scope.level === 'global'
  const sanitize = Boolean(options.sanitizeShared && shared)
  const status = requireReviewStatus(field(row, 'status', 'status'))
  const resolutionSource = nullableText(field(row, 'resolution_source', 'resolutionSource')) as DurationAssetReviewResolutionSource | null
  return {
    id: requireNonEmpty(field(row, 'id', 'id'), 'duration_asset_review_row_id_required'),
    sourceKey: requireNonEmpty(field(row, 'source_key', 'sourceKey'), 'duration_asset_review_row_source_key_required'),
    decisionFingerprint: requireFingerprint(String(field(row, 'decision_fingerprint', 'decisionFingerprint'))),
    reviewKind: requireReviewKind(field(row, 'review_kind', 'reviewKind')),
    assetKey: requireDurationAssetReviewKey(field(row, 'asset_key', 'assetKey')),
    artifactKey: requireNonEmpty(field(row, 'artifact_key', 'artifactKey'), 'duration_asset_review_row_artifact_key_required'),
    scope,
    proposalKey: sanitize ? null : nullableText(field(row, 'proposal_key', 'proposalKey')),
    candidateEventRef: sanitize ? null : nullableText(field(row, 'candidate_event_ref', 'candidateEventRef')),
    conflictRef: sanitize ? null : nullableText(field(row, 'conflict_ref', 'conflictRef')),
    publicationKey: nullableText(field(row, 'publication_key', 'publicationKey')),
    resolvedPublicationKey: nullableText(field(row, 'resolved_publication_key', 'resolvedPublicationKey')),
    reasonCodes: uniqueTexts(asArray(field(row, 'reason_codes', 'reasonCodes'))).sort(),
    reviewPayload: sanitize ? null : validateQueuePayload(field(row, 'review_payload', 'reviewPayload')),
    status,
    canReview: !shared,
    approvalReady: status === 'open' && !shared,
    assignedToUserId: sanitize ? null : nullableText(field(row, 'assigned_to_user_id', 'assignedToUserId')),
    reviewedByUserId: sanitize ? null : nullableText(field(row, 'reviewed_by_user_id', 'reviewedByUserId')),
    reviewedAt: nullableText(field(row, 'reviewed_at', 'reviewedAt')),
    decisionReason: nullableText(field(row, 'decision_reason', 'decisionReason')),
    resolutionSource,
    createdAt: requireNonEmpty(field(row, 'created_at', 'createdAt'), 'duration_asset_review_row_created_at_required'),
    updatedAt: requireNonEmpty(field(row, 'updated_at', 'updatedAt'), 'duration_asset_review_row_updated_at_required'),
  }
}

async function assertProjectScopeAuthorized(
  queryExec: DurationAssetReviewQueryExec,
  scope: DurationLearningRuntimeScope,
) {
  if (scope.level !== 'project') return
  const rows = await queryExec<QueueRow>(
    `select exists (
       select 1 from public.projects project
        where project.id = $1::uuid and project.company_id = $2::uuid
     ) as scope_authorized`,
    [scope.projectId, scope.companyId],
  )
  if (rows[0]?.scope_authorized !== true) throw new Error('project_scope_company_mismatch')
}

function normalizeDecisionReason(value: unknown) {
  return requireNonEmpty(value, 'duration_asset_review_decision_reason_required')
}

function normalizeReviewedAt(value: unknown) {
  return requireNonEmpty(value, 'duration_asset_review_reviewed_at_required')
}

function normalizeOptionalId(value: unknown) {
  return nullableText(value)
}

export function createDatabaseDurationAssetReviewQueueStore(
  providedQueryExec?: DurationAssetReviewQueryExec,
  providedTransactionRunner?: DurationAssetReviewTransactionRunner,
): DurationAssetReviewQueueStore {
  const queryExec = providedQueryExec ?? executeSQL
  const transactionRunner: DurationAssetReviewTransactionRunner | null = providedTransactionRunner
    ?? (providedQueryExec === undefined ? withDatabaseTransaction : null)
  const runLockingMutation = <T>(work: () => Promise<T>) => {
    if (!transactionRunner) throw new Error('duration_asset_review_transaction_runner_required')
    return transactionRunner(work)
  }

  const loadBySourceKeyForUpdate = async (sourceKey: string) => {
    const rows = await queryExec<QueueRow>(
      'select * from public.duration_asset_review_items where source_key = $1 for update',
      [sourceKey],
    )
    return rows[0] ? rowToItem(rows[0]) : null
  }

  const loadForUpdate = async (id: string) => {
    const rows = await queryExec<QueueRow>(
      'select * from public.duration_asset_review_items where id = $1::uuid for update',
      [requireNonEmpty(id, 'duration_asset_review_id_required')],
    )
    return rows[0] ? rowToItem(rows[0]) : null
  }

  return {
    async upsertOpen(input) {
      const assetKey = requireDurationAssetReviewKey(input.assetKey)
      const reviewKind = requireReviewKind(input.reviewKind)
      const artifactKey = requireNonEmpty(input.artifactKey, 'duration_asset_review_artifact_key_required')
      const scopeFieldsValue = scopeFields(input.scope)
      await assertProjectScopeAuthorized(queryExec, scopeFieldsValue.scope)
      const decisionFingerprint = requireFingerprint(input.decisionFingerprint)
      const sourceKey = buildDurationAssetReviewSourceKey({
        reviewKind, assetKey, artifactKey, proposalKey: input.proposalKey, publicationKey: input.publicationKey,
        decisionFingerprint, scope: scopeFieldsValue.scope,
      })
      const reasonCodes = uniqueTexts(input.reasonCodes).sort()
      const reviewPayload = validateQueuePayload(input.reviewPayload)
      const rows = await queryExec<QueueRow>(
        `insert into public.duration_asset_review_items (
          scope_level, company_id, project_id, industry_key, asset_key, artifact_key,
          review_kind, decision_fingerprint, source_key, proposal_key, candidate_event_ref, conflict_ref,
          publication_key, reason_codes, review_payload
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::TEXT[],$15::JSONB)
        on conflict (source_key) do update
           set reason_codes = excluded.reason_codes,
               review_payload = excluded.review_payload,
               candidate_event_ref = coalesce(excluded.candidate_event_ref, duration_asset_review_items.candidate_event_ref),
               conflict_ref = coalesce(excluded.conflict_ref, duration_asset_review_items.conflict_ref),
               publication_key = coalesce(excluded.publication_key, duration_asset_review_items.publication_key),
               updated_at = now()
         where duration_asset_review_items.status = 'open'
        returning *, (xmax = 0) as was_created`,
        [
          scopeFieldsValue.scope.level, scopeFieldsValue.companyId, scopeFieldsValue.projectId,
          scopeFieldsValue.industryKey, assetKey, artifactKey, reviewKind, decisionFingerprint, sourceKey,
          nullableText(input.proposalKey), nullableText(input.candidateEventRef), nullableText(input.conflictRef),
          nullableText(input.publicationKey), reasonCodes, reviewPayload,
        ],
      )
      if (rows[0]) {
        const item = rowToItem(rows[0])
        return { item, disposition: rows[0].was_created === true ? 'created' : 'reused' }
      }
      const existing = await loadBySourceKeyForUpdate(sourceKey)
      if (!existing) throw new Error('duration_asset_review_upsert_missing')
      return { item: existing, disposition: existing.status === 'open' ? 'reused' : 'terminal_reused' }
    },

    loadForUpdate,

    async resolveByPublication(input) {
      const sourceKey = requireNonEmpty(input.sourceKey, 'duration_asset_review_source_key_required')
      const publicationKey = requireNonEmpty(input.publicationKey, 'duration_asset_review_publication_key_required')
      const reviewedAt = normalizeReviewedAt(input.reviewedAt)
      const decisionReason = normalizeDecisionReason(input.decisionReason)
      const reviewerUserId = normalizeOptionalId(input.reviewerUserId)
      const resolutionSource = requirePublicationResolutionSource(input.resolutionSource)
      if (resolutionSource === 'automatic_publication' && reviewerUserId) {
        throw new Error('automatic_publication_reviewer_forbidden')
      }
      if (resolutionSource === 'manual_approval' && !reviewerUserId) {
        throw new Error('manual_approval_reviewer_required')
      }
      return runLockingMutation(async () => {
        const locked = await loadBySourceKeyForUpdate(sourceKey)
        if (!locked) throw new Error('duration_asset_review_item_not_found')
        if (locked.status !== 'open') return { item: locked, disposition: 'terminal_reused' }
        const rows = await queryExec<QueueRow>(
          `update public.duration_asset_review_items
              set status = 'resolved_by_publication',
                  resolved_publication_key = $2,
                  reviewed_at = $3::timestamptz,
                  resolution_source = $4,
                  reviewed_by_user_id = $5::uuid,
                  decision_reason = $6,
                  updated_at = now()
            where source_key = $1
              and status = 'open'
          returning *`,
          [sourceKey, publicationKey, reviewedAt, resolutionSource, reviewerUserId, decisionReason],
        )
        if (rows[0]) return { item: rowToItem(rows[0]), disposition: 'resolved' }
        const current = await loadBySourceKeyForUpdate(sourceKey)
        if (!current) throw new Error('duration_asset_review_item_not_found')
        if (current.status === 'open') throw new Error('duration_asset_review_resolution_conflict')
        return { item: current, disposition: 'terminal_reused' }
      })
    },

    async resolveOpenByPublicationIdentity(input) {
      const assetKey = requireDurationAssetReviewKey(input.assetKey)
      const reviewKind = requireReviewKind(input.reviewKind)
      const artifactKey = requireNonEmpty(input.artifactKey, 'duration_asset_review_artifact_key_required')
      const scopeValue = scopeFields(input.scope)
      const resolutionSource = requirePublicationResolutionSource(input.resolutionSource)
      if (resolutionSource !== 'automatic_publication') {
        throw new Error('duration_asset_review_resolution_source_invalid')
      }
      if (input.reviewerUserId !== null) {
        throw new Error('automatic_publication_reviewer_forbidden')
      }
      const proposalKey = nullableText(input.proposalKey)
      if (reviewKind === 'candidate_publication' && !proposalKey) {
        throw new Error('duration_asset_review_candidate_proposal_key_required')
      }
      if (reviewKind === 'stable_promotion' && proposalKey) {
        throw new Error('duration_asset_review_stable_proposal_key_forbidden')
      }
      const publicationKey = requireNonEmpty(input.publicationKey, 'duration_asset_review_publication_key_required')
      await assertProjectScopeAuthorized(queryExec, scopeValue.scope)
      const rows = await queryExec<QueueRow>(
        `with resolved as (
           update public.duration_asset_review_items
              set status = 'resolved_by_publication',
                  resolved_publication_key = $10,
                  reviewed_at = $11::timestamptz,
                  resolution_source = $12,
                  reviewed_by_user_id = null,
                  decision_reason = $13,
                  updated_at = now()
            where review_kind = $1
              and asset_key = $2
              and artifact_key = $3
              and scope_level = $4
              and company_id is not distinct from $5::uuid
              and project_id is not distinct from $6::uuid
              and industry_key is not distinct from $7
              and (
                ($1 = 'candidate_publication' and proposal_key is not distinct from $8::text)
                or ($1 = 'stable_promotion' and proposal_key is null and publication_key is not distinct from $9::text)
              )
              and status = 'open'
            returning id
         ) select count(*)::int as resolved_count from resolved`,
        [
          reviewKind, assetKey, artifactKey, scopeValue.scope.level, scopeValue.companyId, scopeValue.projectId,
          scopeValue.industryKey, proposalKey, publicationKey, publicationKey,
          normalizeReviewedAt(input.reviewedAt), resolutionSource, normalizeDecisionReason(input.decisionReason),
        ],
      )
      return Math.max(0, Math.trunc(Number(rows[0]?.resolved_count) || 0))
    },

    async decide(input) {
      const id = requireNonEmpty(input.id, 'duration_asset_review_id_required')
      const status = requireDecisionStatus(input.status)
      const reviewerUserId = requireNonEmpty(input.reviewerUserId, 'duration_asset_review_reviewer_required')
      const decisionReason = normalizeDecisionReason(input.decisionReason)
      const source = status === 'rejected' ? 'manual_rejection' : 'manual_supersession'
      if (input.resolutionSource !== source) throw new Error('duration_asset_review_resolution_source_invalid')
      return runLockingMutation(async () => {
        const locked = await loadForUpdate(id)
        if (!locked) throw new Error('duration_asset_review_item_not_found')
        if (locked.status !== 'open') return { item: locked, disposition: 'terminal_reused' }
        const rows = await queryExec<QueueRow>(
          `update public.duration_asset_review_items
              set status = $2,
                  reviewed_by_user_id = $3::uuid,
                  reviewed_at = $4::timestamptz,
                  decision_reason = $5,
                  resolution_source = $6,
                  updated_at = now()
            where id = $1::uuid
              and status = 'open'
          returning *`,
          [id, status, reviewerUserId, normalizeReviewedAt(input.reviewedAt), decisionReason, source],
        )
        if (rows[0]) return { item: rowToItem(rows[0]), disposition: 'decided' }
        const current = await loadForUpdate(id)
        if (!current) throw new Error('duration_asset_review_item_not_found')
        if (current.status === 'open') throw new Error('duration_asset_review_decision_conflict')
        return { item: current, disposition: 'terminal_reused' }
      })
    },

    async list(input) {
      const companyId = requireNonEmpty(input.companyId, 'duration_asset_review_company_id_required')
      const projectIds = input.projectIds === null ? null : uniqueTexts(input.projectIds ?? [])
      const assetKey = input.assetKey == null ? null : requireDurationAssetReviewKey(input.assetKey)
      const scopeLevel = input.scopeLevel == null ? null : normalizeText(input.scopeLevel)
      if (scopeLevel && !SCOPE_LEVELS.has(scopeLevel as DurationLearningRuntimeScope['level'])) {
        throw new Error('duration_asset_review_scope_invalid')
      }
      const status = input.status == null ? null : requireReviewStatus(input.status)
      const age = input.age ?? 'all'
      if (!['all', '24h', '7d', '30d'].includes(age)) throw new Error('duration_asset_review_age_invalid')
      const now = normalizeText(input.now) || new Date().toISOString()
      const limit = Math.max(1, Math.min(200, Math.trunc(Number(input.limit) || 100)))
      const rows = await queryExec<QueueRow>(
        `select *, count(*) over() as total_count
           from public.duration_asset_review_items
          where (
            (scope_level in ('company', 'project') and company_id = $1::uuid)
            or scope_level in ('industry', 'global')
          )
            and (scope_level <> 'project' or $2::uuid[] is null or project_id = any($2::uuid[]))
            and ($3::text is null or asset_key = $3)
            and ($4::text is null or scope_level = $4)
            and ($5::text is null or status = $5)
            and ($6::text is null or $6 = any(reason_codes))
            and ($7::uuid is null or project_id is not distinct from $7::uuid)
            and ($9::text = 'all' or updated_at >= case $9::text
              when '24h' then $8::timestamptz - interval '24 hours'
              when '7d' then $8::timestamptz - interval '7 days'
              when '30d' then $8::timestamptz - interval '30 days'
              else $8::timestamptz
            end)
          order by updated_at desc, id asc
          limit $10`,
        [companyId, projectIds, assetKey, scopeLevel || null, status, nullableText(input.reason), nullableText(input.projectId), now, age, limit],
      )
      const items = rows.map((row) => rowToItem(row, { sanitizeShared: true }))
      return { generatedAt: now, items, total: Math.max(0, Math.trunc(Number(rows[0]?.total_count) || items.length)) }
    },
  }
}

export async function listDurationAssetReviewItems(
  input: ListDurationAssetReviewItemsInput & { queryExec?: DurationAssetReviewQueryExec },
) {
  const { queryExec, ...listInput } = input
  return createDatabaseDurationAssetReviewQueueStore(queryExec).list(listInput)
}
