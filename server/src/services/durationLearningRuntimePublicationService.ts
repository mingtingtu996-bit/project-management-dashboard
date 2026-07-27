import { executeSQL } from './dbService.js'
import { hashDurationContextPolicyLearningValue } from './durationContextPolicyLearningCheckpointService.js'

export type DurationLearningRuntimeAssetKey =
  | 'base_duration_benchmark'
  | 'standard_work_duration_seed'
  | 'special_work_duration_seed'
  | 'wbs_reference_days'
  | 'dependency_rule_candidate'
  | 'critical_path_rule_candidate'

export type DurationLearningRuntimeScope =
  | { level: 'project'; companyId: string; projectId: string }
  | { level: 'company'; companyId: string }
  | { level: 'industry'; industryKey: string }
  | { level: 'global' }

export type DurationLearningRuntimePublicationQueryExec = <T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<T[]>

export const executeDurationLearningRuntimePublicationQuery:
DurationLearningRuntimePublicationQueryExec = async <T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
) => {
  // execute-sql-dynamic-approved: this adapter executes only fixed, parameterized SQL owned by the duration runtime publication resolver/persistence functions; callers provide scope values, never SQL fragments.
  return executeSQL<T>(sql, params)
}

export type DurationLearningRuntimePublicationStage = 'canary' | 'stable'

export interface PersistDurationLearningRuntimePublicationInput {
  queryExec: DurationLearningRuntimePublicationQueryExec
  publicationKey: string
  assetKey: DurationLearningRuntimeAssetKey
  artifactKey: string
  scope: DurationLearningRuntimeScope
  stage: DurationLearningRuntimePublicationStage
  runtimePayload: Record<string, unknown>
  sourceCandidateRefs: string[]
  sourceEvidenceRefs: string[]
  automationDecision?: Record<string, unknown> | null
  previousPublicationKey?: string | null
  trafficPercent?: number
  monitoringWindowHours?: number
  publishedAt?: string
}

export interface DurationLearningRuntimePublicationRecord {
  publicationKey: string
  assetKey: DurationLearningRuntimeAssetKey
  artifactKey: string
  scopeLevel: DurationLearningRuntimeScope['level']
  companyId: string | null
  projectId: string | null
  industryKey: string | null
  publicationStage: 'canary' | 'stable' | 'superseded' | 'rolled_back'
  runtimePayload: Record<string, unknown>
  sourceCandidateRefs: string[]
  sourceEvidenceRefs: string[]
  automationDecision: Record<string, unknown>
  previousPublicationKey: string | null
  trafficPercent: number
  monitoringWindowHours: number
  monitoringStatus: 'pending' | 'collecting' | 'passed' | 'failed' | 'rollback_pending'
  publishedAt: string | null
}

export type DurationLearningRuntimePublicationIdentity = {
  publicationKey: string
  assetKey: DurationLearningRuntimeAssetKey
  artifactKey: string
  scope: DurationLearningRuntimeScope
}

export function durationLearningRuntimePublicationScopesMatch(
  left: DurationLearningRuntimeScope,
  right: DurationLearningRuntimeScope,
) {
  if (left.level !== right.level) return false
  if (left.level === 'project' && right.level === 'project') {
    return left.companyId === right.companyId && left.projectId === right.projectId
  }
  if (left.level === 'company' && right.level === 'company') {
    return left.companyId === right.companyId
  }
  if (left.level === 'industry' && right.level === 'industry') {
    return left.industryKey === right.industryKey
  }
  return left.level === 'global' && right.level === 'global'
}

export function durationLearningRuntimePublicationIdentitiesMatch(
  left: DurationLearningRuntimePublicationIdentity,
  right: DurationLearningRuntimePublicationIdentity,
) {
  return left.assetKey === right.assetKey
    && left.artifactKey === right.artifactKey
    && durationLearningRuntimePublicationScopesMatch(left.scope, right.scope)
}

export type PersistDurationLearningRuntimePublicationResult =
  | {
      status: 'published'
      publication: DurationLearningRuntimePublicationRecord
      reasons: []
    }
  | {
      status: 'blocked'
      publication: null
      reasons: string[]
    }

export interface ResolveDurationLearningRuntimePublicationInput {
  queryExec: DurationLearningRuntimePublicationQueryExec
  assetKey: DurationLearningRuntimeAssetKey
  artifactKey: string
  companyId?: string | null
  projectId?: string | null
  industryKey?: string | null
}

export interface ResolveDurationLearningRuntimePublicationResult {
  runtimeConsumable: boolean
  publicationKey: string | null
  selectionBasis: `${DurationLearningRuntimeScope['level']}_${'canary' | 'stable'}` | null
  publication: DurationLearningRuntimePublicationRecord | null
  reasons: string[]
}

type DurationLearningRuntimeConsumablePublicationRecord =
  Omit<DurationLearningRuntimePublicationRecord, 'publicationStage'> & {
    publicationStage: DurationLearningRuntimePublicationStage
  }

type DurationLearningRuntimeScopeContext = Pick<
  ResolveDurationLearningRuntimePublicationInput,
  'companyId' | 'projectId' | 'industryKey'
>

export interface ListApplicableDurationLearningRuntimePublicationsInput {
  queryExec: DurationLearningRuntimePublicationQueryExec
  assetKey: DurationLearningRuntimeAssetKey
  companyId?: string | null
  projectId?: string | null
  industryKey?: string | null
}

type RuntimePublicationRow = {
  publication_key?: unknown
  publicationKey?: unknown
  asset_key?: unknown
  assetKey?: unknown
  artifact_key?: unknown
  artifactKey?: unknown
  scope_level?: unknown
  scopeLevel?: unknown
  company_id?: unknown
  companyId?: unknown
  project_id?: unknown
  projectId?: unknown
  industry_key?: unknown
  industryKey?: unknown
  publication_stage?: unknown
  publicationStage?: unknown
  runtime_payload?: unknown
  runtimePayload?: unknown
  source_candidate_refs?: unknown
  sourceCandidateRefs?: unknown
  source_evidence_refs?: unknown
  sourceEvidenceRefs?: unknown
  automation_decision?: unknown
  automationDecision?: unknown
  previous_publication_key?: unknown
  previousPublicationKey?: unknown
  traffic_percent?: unknown
  trafficPercent?: unknown
  monitoring_window_hours?: unknown
  monitoringWindowHours?: unknown
  monitoring_status?: unknown
  monitoringStatus?: unknown
  published_at?: unknown
  publishedAt?: unknown
  restored_publication_key?: unknown
  restoredPublicationKey?: unknown
  scope_authorized?: unknown
  scopeAuthorized?: unknown
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function nullableText(value: unknown) {
  return normalizeText(value) || null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readList(value: unknown) {
  return Array.isArray(value) ? value : []
}

function readPositiveNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function readNonNegativeNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function readTimestamp(value: unknown) {
  const normalized = normalizeText(value)
  return normalized && Number.isFinite(Date.parse(normalized)) ? normalized : null
}

function uniqueText(values: readonly unknown[]) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function canonicalTextList(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return null
  const normalized = value.map((item) => typeof item === 'string' ? item.trim() : '')
  if (normalized.some((item) => !item)) return null
  const canonical = [...new Set(normalized)].sort()
  return canonical.length === normalized.length
    && canonical.every((item, index) => item === normalized[index])
    ? canonical
    : null
}

export function durationLearningBenchmarkRuntimeVersionReasons(
  payload: Record<string, unknown>,
  scope: DurationLearningRuntimeScope,
) {
  const benchmarkVersion = normalizeText(payload.benchmarkVersion ?? payload.benchmark_version)
  if (!benchmarkVersion) return ['benchmark_version_required']
  if (scope.level === 'project') return []

  const aggregateProvenance = readRecord(payload.aggregateProvenance ?? payload.aggregate_provenance)
  const sourceBenchmarkIds = canonicalTextList(
    aggregateProvenance.sourceBenchmarkIds ?? aggregateProvenance.source_benchmark_ids,
  )
  const sourceBenchmarkVersions = canonicalTextList(
    aggregateProvenance.sourceBenchmarkVersions ?? aggregateProvenance.source_benchmark_versions,
  )
  const sourceAsOf = readTimestamp(payload.sourceAsOf ?? payload.source_as_of)
  const reasons = [
    ...(sourceBenchmarkIds ? [] : ['benchmark_aggregate_source_ids_canonical_required']),
    ...(sourceBenchmarkVersions ? [] : ['benchmark_aggregate_source_versions_canonical_required']),
  ]
  if (!sourceBenchmarkIds || !sourceBenchmarkVersions || !sourceAsOf) return reasons

  const expectedVersion = `aggregate:${scope.level}:${hashDurationContextPolicyLearningValue({
    scope,
    sourceBenchmarkIds,
    sourceBenchmarkVersions,
    sourceAsOf,
  }).slice(0, 16)}`
  return benchmarkVersion === expectedVersion
    ? reasons
    : [...reasons, 'benchmark_aggregate_version_mismatch']
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalJson(entry)]),
  )
}

function jsonEquals(left: unknown, right: unknown) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right))
}

function field(row: RuntimePublicationRow, snake: keyof RuntimePublicationRow, camel: keyof RuntimePublicationRow) {
  return row[snake] ?? row[camel]
}

function normalizeScope(scope: DurationLearningRuntimeScope) {
  return {
    level: scope.level,
    companyId: 'companyId' in scope ? nullableText(scope.companyId) : null,
    projectId: 'projectId' in scope ? nullableText(scope.projectId) : null,
    industryKey: 'industryKey' in scope ? nullableText(scope.industryKey) : null,
  }
}

function scopeReasons(scope: DurationLearningRuntimeScope) {
  const normalized = normalizeScope(scope)
  if (normalized.level === 'project') {
    return [
      ...(normalized.companyId ? [] : ['project_scope_company_id_required']),
      ...(normalized.projectId ? [] : ['project_scope_project_id_required']),
    ]
  }
  if (normalized.level === 'company') {
    return normalized.companyId ? [] : ['company_scope_company_id_required']
  }
  if (normalized.level === 'industry') {
    return normalized.industryKey ? [] : ['industry_scope_key_required']
  }
  return []
}

function payloadReasons(
  assetKey: DurationLearningRuntimeAssetKey,
  payload: Record<string, unknown>,
  scope: DurationLearningRuntimeScope,
) {
  const reasons: string[] = []
  if (Object.keys(payload).length === 0) reasons.push('runtime_payload_required')

  if (assetKey === 'base_duration_benchmark') {
    const basis = normalizeText(payload.durationDayBasis ?? payload.duration_day_basis)
    if (basis !== 'construction_production_day') reasons.push('benchmark_production_day_basis_required')
    const aggregate = scope.level !== 'project'
    const benchmarkId = normalizeText(payload.benchmarkId ?? payload.benchmark_id)
    const benchmarkKind = normalizeText(payload.benchmarkKind ?? payload.benchmark_kind)
    const causeApplicability = normalizeText(payload.causeApplicability ?? payload.cause_applicability)
    const aggregateProvenance = readRecord(payload.aggregateProvenance ?? payload.aggregate_provenance)
    reasons.push(...durationLearningBenchmarkRuntimeVersionReasons(payload, scope))
    if (!aggregate && !benchmarkId) reasons.push('benchmark_id_required')
    if (!aggregate && (benchmarkKind === 'aggregate_all_cause' || Object.keys(aggregateProvenance).length > 0)) {
      reasons.push('benchmark_project_exact_provenance_required')
    }
    if (aggregate) {
      if (benchmarkId) reasons.push('benchmark_aggregate_project_id_forbidden')
      if (benchmarkKind !== 'aggregate_all_cause' || causeApplicability !== 'all_cause') {
        reasons.push('benchmark_aggregate_provenance_required')
      }
      const schemaVersion = normalizeText(aggregateProvenance.schemaVersion ?? aggregateProvenance.schema_version)
      const scopeLevel = normalizeText(aggregateProvenance.scopeLevel ?? aggregateProvenance.scope_level)
      const sourceBenchmarkIds = uniqueText(readList(
        aggregateProvenance.sourceBenchmarkIds ?? aggregateProvenance.source_benchmark_ids,
      ))
      const sourceBenchmarkVersions = uniqueText(readList(
        aggregateProvenance.sourceBenchmarkVersions ?? aggregateProvenance.source_benchmark_versions,
      ))
      const sourceProjectIds = uniqueText(readList(
        aggregateProvenance.sourceProjectIds ?? aggregateProvenance.source_project_ids,
      ))
      const calendarIdentities = readList(
        aggregateProvenance.calendarIdentities ?? aggregateProvenance.calendar_identities,
      ).map(readRecord)
      if (
        schemaVersion !== 'duration-benchmark-aggregate/v1'
        || scopeLevel !== scope.level
        || sourceBenchmarkIds.length === 0
        || sourceBenchmarkVersions.length === 0
        || sourceProjectIds.length === 0
      ) reasons.push('benchmark_aggregate_provenance_required')
      if (
        calendarIdentities.length === 0
        || calendarIdentities.some((identity) => (
          !normalizeText(identity.calendarRef ?? identity.calendar_ref)
          || !normalizeText(identity.calendarVersion ?? identity.calendar_version)
        ))
      ) reasons.push('benchmark_aggregate_calendar_identity_required')
    }
    if (!readPositiveNumber(payload.p50Days ?? payload.p50_days)) reasons.push('benchmark_p50_days_required')
    if (!readPositiveNumber(payload.p75Days ?? payload.p75_days)) reasons.push('benchmark_p75_days_required')
    if (!readPositiveNumber(payload.p80Days ?? payload.p80_days)) reasons.push('benchmark_p80_days_required')
    if (!readPositiveNumber(payload.meanDays ?? payload.mean_days)) reasons.push('benchmark_mean_days_required')
    if (!readPositiveNumber(payload.sampleCount ?? payload.sample_count)) reasons.push('benchmark_sample_count_required')
    if (readNonNegativeNumber(payload.variance) === null) reasons.push('benchmark_variance_required')
    if (readNonNegativeNumber(
      payload.coefficientOfVariation ?? payload.coefficient_of_variation,
    ) === null) reasons.push('benchmark_coefficient_of_variation_required')
    if (!normalizeText(payload.confidenceLevel ?? payload.confidence_level)) reasons.push('benchmark_confidence_level_required')
    if (readNonNegativeNumber(payload.confidenceScore ?? payload.confidence_score) === null) {
      reasons.push('benchmark_confidence_score_required')
    }
    if (!readTimestamp(payload.generatedAt ?? payload.generated_at)) reasons.push('benchmark_generated_at_required')
    if (!readTimestamp(payload.sourceWindowStart ?? payload.source_window_start)) reasons.push('benchmark_source_window_start_required')
    if (!readTimestamp(payload.sourceAsOf ?? payload.source_as_of)) reasons.push('benchmark_source_as_of_required')
    if (!aggregate && !normalizeText(payload.calendarRef ?? payload.calendar_ref)) reasons.push('benchmark_calendar_ref_required')
    if (!aggregate && !normalizeText(payload.calendarVersion ?? payload.calendar_version)) reasons.push('benchmark_calendar_version_required')
  }
  if (assetKey === 'standard_work_duration_seed') {
    if (!normalizeText(payload.stableCode ?? payload.stable_code)) reasons.push('standard_seed_stable_code_required')
    if (!readPositiveNumber(
      payload.p50Days
        ?? payload.p50_days
        ?? payload.baseDurationDays
        ?? payload.base_duration_days,
    )) reasons.push('standard_seed_duration_required')
  }
  if (assetKey === 'special_work_duration_seed') {
    const basis = normalizeText(payload.durationDayBasis ?? payload.duration_day_basis)
    if (basis !== 'construction_production_day') reasons.push('special_seed_production_day_basis_required')
    const hasStableCode = Boolean(normalizeText(payload.stableCode ?? payload.stable_code))
    const hasNodes = readList(payload.nodes).length > 0
    if (!hasStableCode && !hasNodes) reasons.push('special_seed_artifact_required')
  }
  if (assetKey === 'wbs_reference_days') {
    const basis = normalizeText(payload.durationDayBasis ?? payload.duration_day_basis)
    if (basis !== 'construction_production_day') reasons.push('wbs_reference_days_production_day_basis_required')
    const validNodeCount = readList(payload.nodes).filter((value) => {
      const node = readRecord(value)
      const identity = normalizeText(node.sourceId ?? node.source_id ?? node.stableCode ?? node.stable_code ?? node.path)
      const duration = readPositiveNumber(
        node.referenceDays
          ?? node.reference_days
          ?? node.suggestedReferenceDays
          ?? node.suggested_reference_days,
      )
      return Boolean(identity && duration)
    }).length
    if (validNodeCount === 0) reasons.push('wbs_reference_day_nodes_required')
  }
  if (assetKey === 'dependency_rule_candidate') {
    if (!normalizeText(payload.predecessorCode ?? payload.predecessor_code)) reasons.push('dependency_predecessor_code_required')
    if (!normalizeText(payload.successorCode ?? payload.successor_code)) reasons.push('dependency_successor_code_required')
    if (!normalizeText(payload.dependencyType ?? payload.dependency_type)) reasons.push('dependency_type_required')
  }
  if (assetKey === 'critical_path_rule_candidate') {
    const stableCodes = readList(payload.criticalStableCodes ?? payload.critical_stable_codes ?? payload.stableCodes)
    if (uniqueText(stableCodes).length === 0) reasons.push('critical_path_stable_codes_required')
  }
  return reasons
}

function rowToRecord(row: RuntimePublicationRow): DurationLearningRuntimePublicationRecord {
  return {
    publicationKey: normalizeText(field(row, 'publication_key', 'publicationKey')),
    assetKey: normalizeText(field(row, 'asset_key', 'assetKey')) as DurationLearningRuntimeAssetKey,
    artifactKey: normalizeText(field(row, 'artifact_key', 'artifactKey')),
    scopeLevel: normalizeText(field(row, 'scope_level', 'scopeLevel')) as DurationLearningRuntimeScope['level'],
    companyId: nullableText(field(row, 'company_id', 'companyId')),
    projectId: nullableText(field(row, 'project_id', 'projectId')),
    industryKey: nullableText(field(row, 'industry_key', 'industryKey')),
    publicationStage: normalizeText(field(row, 'publication_stage', 'publicationStage')) as DurationLearningRuntimePublicationRecord['publicationStage'],
    runtimePayload: readRecord(field(row, 'runtime_payload', 'runtimePayload')),
    sourceCandidateRefs: uniqueText(readList(field(row, 'source_candidate_refs', 'sourceCandidateRefs'))),
    sourceEvidenceRefs: uniqueText(readList(field(row, 'source_evidence_refs', 'sourceEvidenceRefs'))),
    automationDecision: readRecord(field(row, 'automation_decision', 'automationDecision')),
    previousPublicationKey: nullableText(field(row, 'previous_publication_key', 'previousPublicationKey')),
    trafficPercent: Math.max(1, Math.min(100, Math.trunc(Number(field(row, 'traffic_percent', 'trafficPercent')) || 100))),
    monitoringWindowHours: Math.max(1, Math.min(2160, Math.trunc(Number(field(row, 'monitoring_window_hours', 'monitoringWindowHours')) || 72))),
    monitoringStatus: (normalizeText(field(row, 'monitoring_status', 'monitoringStatus')) || 'pending') as DurationLearningRuntimePublicationRecord['monitoringStatus'],
    publishedAt: nullableText(field(row, 'published_at', 'publishedAt')),
  }
}

const DURATION_LEARNING_RUNTIME_ASSET_KEYS = new Set<DurationLearningRuntimeAssetKey>([
  'base_duration_benchmark',
  'standard_work_duration_seed',
  'special_work_duration_seed',
  'wbs_reference_days',
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
])

function publicationIdentityScope(
  publication: DurationLearningRuntimePublicationRecord,
): DurationLearningRuntimeScope | null {
  if (publication.scopeLevel === 'project') {
    return publication.companyId && publication.projectId && !publication.industryKey
      ? { level: 'project', companyId: publication.companyId, projectId: publication.projectId }
      : null
  }
  if (publication.scopeLevel === 'company') {
    return publication.companyId && !publication.projectId && !publication.industryKey
      ? { level: 'company', companyId: publication.companyId }
      : null
  }
  if (publication.scopeLevel === 'industry') {
    return publication.industryKey && !publication.companyId && !publication.projectId
      ? { level: 'industry', industryKey: publication.industryKey }
      : null
  }
  if (publication.scopeLevel === 'global') {
    return !publication.companyId && !publication.projectId && !publication.industryKey
      ? { level: 'global' }
      : null
  }
  return null
}

function clampTrafficPercent(value: unknown, stage: DurationLearningRuntimePublicationStage) {
  if (stage === 'stable') return 100
  const number = Number(value ?? 5)
  return Number.isFinite(number) ? Math.max(1, Math.min(100, Math.trunc(number))) : 5
}

function clampMonitoringWindowHours(value: unknown) {
  const number = Number(value ?? 72)
  return Number.isFinite(number) ? Math.max(1, Math.min(2160, Math.trunc(number))) : 72
}

async function findPublicationByKey(
  input: Pick<PersistDurationLearningRuntimePublicationInput, 'queryExec'>,
  publicationKey: string,
) {
  const rows = await input.queryExec<RuntimePublicationRow>(
    `select publication_key,
            asset_key,
            artifact_key,
            scope_level,
            company_id,
            project_id,
            industry_key,
            publication_stage,
            runtime_payload,
            source_candidate_refs,
            source_evidence_refs,
            automation_decision,
            previous_publication_key,
            traffic_percent,
            monitoring_window_hours,
            monitoring_status,
            published_at
       from public.duration_learning_runtime_publications
      where publication_key = $1
      limit 1`,
    [publicationKey],
  )
  return rows[0] ? rowToRecord(rows[0]) : null
}

export async function resolveDurationLearningRuntimePublicationIdentity(input: {
  queryExec: DurationLearningRuntimePublicationQueryExec
  publicationKey: string
}): Promise<DurationLearningRuntimePublicationIdentity | null> {
  const publicationKey = normalizeText(input.publicationKey)
  if (!publicationKey) return null
  const publication = await findPublicationByKey(input, publicationKey)
  if (
    !publication
    || publication.publicationKey !== publicationKey
    || !DURATION_LEARNING_RUNTIME_ASSET_KEYS.has(publication.assetKey)
    || !publication.artifactKey
  ) return null
  const scope = publicationIdentityScope(publication)
  return scope
    ? {
        publicationKey,
        assetKey: publication.assetKey,
        artifactKey: publication.artifactKey,
        scope,
      }
    : null
}

function publicationMatchesInput(
  publication: DurationLearningRuntimePublicationRecord,
  input: PersistDurationLearningRuntimePublicationInput,
) {
  const scope = normalizeScope(input.scope)
  return publication.publicationKey === normalizeText(input.publicationKey)
    && publication.assetKey === input.assetKey
    && publication.artifactKey === normalizeText(input.artifactKey)
    && publication.scopeLevel === scope.level
    && publication.companyId === scope.companyId
    && publication.projectId === scope.projectId
    && publication.industryKey === scope.industryKey
    && publication.publicationStage === input.stage
    && jsonEquals(publication.runtimePayload, input.runtimePayload)
    && jsonEquals(publication.sourceCandidateRefs, uniqueText(input.sourceCandidateRefs))
    && jsonEquals(publication.sourceEvidenceRefs, uniqueText(input.sourceEvidenceRefs))
    && jsonEquals(publication.automationDecision, input.automationDecision ?? {})
    && publication.trafficPercent === clampTrafficPercent(input.trafficPercent, input.stage)
    && publication.monitoringWindowHours === clampMonitoringWindowHours(input.monitoringWindowHours)
    && (
      input.previousPublicationKey === undefined
      || publication.previousPublicationKey === nullableText(input.previousPublicationKey)
    )
}

async function isProjectScopeAuthorized(input: {
  queryExec: DurationLearningRuntimePublicationQueryExec
  scope: DurationLearningRuntimeScope
}) {
  if (input.scope.level !== 'project') return true
  const rows = await input.queryExec<RuntimePublicationRow>(
    `select exists (
       select 1
         from public.projects project
        where project.id = $1::uuid
          and project.company_id = $2::uuid
     ) as scope_authorized`,
    [normalizeText(input.scope.projectId), normalizeText(input.scope.companyId)],
  )
  return field(rows[0] ?? {}, 'scope_authorized', 'scopeAuthorized') === true
}

export async function persistDurationLearningRuntimePublication(
  input: PersistDurationLearningRuntimePublicationInput,
): Promise<PersistDurationLearningRuntimePublicationResult> {
  const publicationKey = normalizeText(input.publicationKey)
  const artifactKey = normalizeText(input.artifactKey)
  const sourceCandidateRefs = uniqueText(input.sourceCandidateRefs)
  const sourceEvidenceRefs = uniqueText(input.sourceEvidenceRefs)
  const reasons = Array.from(new Set([
    ...(publicationKey ? [] : ['publication_key_required']),
    ...(artifactKey ? [] : ['artifact_key_required']),
    ...(sourceCandidateRefs.length > 0 ? [] : ['source_candidate_refs_required']),
    ...(sourceEvidenceRefs.length > 0 ? [] : ['source_evidence_refs_required']),
    ...scopeReasons(input.scope),
    ...payloadReasons(input.assetKey, input.runtimePayload, input.scope),
  ]))
  if (reasons.length > 0) return { status: 'blocked', publication: null, reasons }

  if (!await isProjectScopeAuthorized(input)) {
    return { status: 'blocked', publication: null, reasons: ['project_scope_company_mismatch'] }
  }

  const existingPublication = await findPublicationByKey(input, publicationKey)
  if (existingPublication) {
    return publicationMatchesInput(existingPublication, input)
      ? { status: 'published', publication: existingPublication, reasons: [] }
      : { status: 'blocked', publication: null, reasons: ['publication_key_contract_mismatch'] }
  }

  const scope = normalizeScope(input.scope)
  const publishedAt = input.publishedAt ?? new Date().toISOString()
  const rows = await input.queryExec<RuntimePublicationRow>(
    `select *
       from public.persist_duration_learning_runtime_publication(
         $1::text,
         $2::text,
         $3::text,
         $4::text,
         $5::uuid,
         $6::uuid,
         $7::text,
         $8::text,
         $9::jsonb,
         $10::jsonb,
         $11::jsonb,
         $12::jsonb,
         $13::text,
         $14::integer,
         $15::integer,
         $16::timestamptz
       )`,
    [
      publicationKey,
      input.assetKey,
      artifactKey,
      scope.level,
      scope.companyId,
      scope.projectId,
      scope.industryKey,
      input.stage,
      input.runtimePayload,
      sourceCandidateRefs,
      sourceEvidenceRefs,
      input.automationDecision ?? {},
      nullableText(input.previousPublicationKey),
      clampTrafficPercent(input.trafficPercent, input.stage),
      clampMonitoringWindowHours(input.monitoringWindowHours),
      publishedAt,
    ],
  )
  if (rows[0]) return { status: 'published', publication: rowToRecord(rows[0]), reasons: [] }

  const racedPublication = await findPublicationByKey(input, publicationKey)
  if (racedPublication && publicationMatchesInput(racedPublication, input)) {
    return { status: 'published', publication: racedPublication, reasons: [] }
  }
  return racedPublication
    ? { status: 'blocked', publication: null, reasons: ['publication_key_contract_mismatch'] }
    : input.previousPublicationKey
      ? { status: 'blocked', publication: null, reasons: ['previous_publication_key_mismatch'] }
      : { status: 'blocked', publication: null, reasons: ['runtime_publication_insert_result_required'] }
}

function canaryBucket(publicationKey: string, projectId: string) {
  let hash = 2166136261
  const value = `${publicationKey}:${projectId}`
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 100
}

export function isDurationLearningRuntimeCanarySelected(input: {
  publicationKey: string
  projectId?: string | null
  trafficPercent: number
}) {
  const projectId = normalizeText(input.projectId)
  if (!projectId) return false
  return canaryBucket(normalizeText(input.publicationKey), projectId) < Math.max(1, Math.min(100, input.trafficPercent))
}

function scopeApplies(record: DurationLearningRuntimePublicationRecord, input: DurationLearningRuntimeScopeContext) {
  if (record.scopeLevel === 'project') return record.companyId === nullableText(input.companyId) && record.projectId === nullableText(input.projectId)
  if (record.scopeLevel === 'company') return record.companyId === nullableText(input.companyId)
  if (record.scopeLevel === 'industry') return record.industryKey === nullableText(input.industryKey)
  return record.scopeLevel === 'global'
}

function isRuntimeConsumablePublication(
  record: DurationLearningRuntimePublicationRecord,
): record is DurationLearningRuntimeConsumablePublicationRecord {
  if (record.publicationStage === 'canary') {
    return record.monitoringStatus === 'pending'
      || record.monitoringStatus === 'collecting'
      || record.monitoringStatus === 'passed'
  }
  return record.publicationStage === 'stable' && record.monitoringStatus === 'passed'
}

function runtimeSelectionBasis(
  publication: DurationLearningRuntimeConsumablePublicationRecord,
): ResolveDurationLearningRuntimePublicationResult['selectionBasis'] {
  return `${publication.scopeLevel}_${publication.publicationStage}`
}

const SCOPE_RANK: Record<DurationLearningRuntimeScope['level'], number> = {
  project: 4,
  company: 3,
  industry: 2,
  global: 1,
}

export async function resolveDurationLearningRuntimePublication(
  input: ResolveDurationLearningRuntimePublicationInput,
): Promise<ResolveDurationLearningRuntimePublicationResult> {
  const artifactKey = normalizeText(input.artifactKey)
  if (!artifactKey) {
    return {
      runtimeConsumable: false,
      publicationKey: null,
      selectionBasis: null,
      publication: null,
      reasons: ['artifact_key_required'],
    }
  }
  const rows = await input.queryExec<RuntimePublicationRow>(
    `select publication_key,
            asset_key,
            artifact_key,
            scope_level,
            company_id,
            project_id,
            industry_key,
            publication_stage,
            runtime_payload,
            previous_publication_key,
            traffic_percent,
            monitoring_status,
            published_at
       from public.duration_learning_runtime_publications
      where asset_key = $1
        and artifact_key = $2
        and (
          (publication_stage = 'canary' and monitoring_status in ('pending', 'collecting', 'passed'))
          or (publication_stage = 'stable' and monitoring_status = 'passed')
        )
        and (
          scope_level = 'global'
          or (scope_level = 'industry' and industry_key = $3)
          or (scope_level = 'company' and company_id = $4::uuid)
          or (scope_level = 'project' and company_id = $4::uuid and project_id = $5::uuid)
        )
      order by published_at desc`,
    [input.assetKey, artifactKey, nullableText(input.industryKey), nullableText(input.companyId), nullableText(input.projectId)],
  )
  const candidates = rows
    .map(rowToRecord)
    .filter((record) => record.assetKey === input.assetKey && record.artifactKey === artifactKey)
    .filter((record) => scopeApplies(record, input))
    .filter(isRuntimeConsumablePublication)
    .filter((record) => record.publicationStage === 'stable' || isDurationLearningRuntimeCanarySelected({
      publicationKey: record.publicationKey,
      projectId: input.projectId,
      trafficPercent: record.trafficPercent,
    }))
    .sort((left, right) => {
      const scopeDelta = SCOPE_RANK[right.scopeLevel] - SCOPE_RANK[left.scopeLevel]
      if (scopeDelta !== 0) return scopeDelta
      const stageDelta = Number(right.publicationStage === 'canary') - Number(left.publicationStage === 'canary')
      if (stageDelta !== 0) return stageDelta
      return String(right.publishedAt ?? '').localeCompare(String(left.publishedAt ?? ''))
    })
  const publication = candidates[0] ?? null
  if (!publication) {
    return {
      runtimeConsumable: false,
      publicationKey: null,
      selectionBasis: null,
      publication: null,
      reasons: ['duration_learning_runtime_publication_not_found'],
    }
  }
  return {
    runtimeConsumable: true,
    publicationKey: publication.publicationKey,
    selectionBasis: runtimeSelectionBasis(publication),
    publication,
    reasons: [],
  }
}

export async function listApplicableDurationLearningRuntimePublications(
  input: ListApplicableDurationLearningRuntimePublicationsInput,
): Promise<ResolveDurationLearningRuntimePublicationResult[]> {
  const rows = await input.queryExec<RuntimePublicationRow>(
    `select publication_key,
            asset_key,
            artifact_key,
            scope_level,
            company_id,
            project_id,
            industry_key,
            publication_stage,
            runtime_payload,
            previous_publication_key,
            traffic_percent,
            monitoring_status,
            published_at
       from public.duration_learning_runtime_publications
      where asset_key = $1
        and (
          (publication_stage = 'canary' and monitoring_status in ('pending', 'collecting', 'passed'))
          or (publication_stage = 'stable' and monitoring_status = 'passed')
        )
        and (
          scope_level = 'global'
          or (scope_level = 'industry' and industry_key = $2)
          or (scope_level = 'company' and company_id = $3::uuid)
          or (scope_level = 'project' and company_id = $3::uuid and project_id = $4::uuid)
        )
      order by published_at desc`,
    [input.assetKey, nullableText(input.industryKey), nullableText(input.companyId), nullableText(input.projectId)],
  )
  const candidates = rows
    .map(rowToRecord)
    .filter((record) => record.assetKey === input.assetKey)
    .filter((record) => scopeApplies(record, input))
    .filter(isRuntimeConsumablePublication)
    .filter((record) => record.publicationStage === 'stable' || isDurationLearningRuntimeCanarySelected({
      publicationKey: record.publicationKey,
      projectId: input.projectId,
      trafficPercent: record.trafficPercent,
    }))
    .sort((left, right) => {
      const artifactDelta = left.artifactKey.localeCompare(right.artifactKey)
      if (artifactDelta !== 0) return artifactDelta
      const scopeDelta = SCOPE_RANK[right.scopeLevel] - SCOPE_RANK[left.scopeLevel]
      if (scopeDelta !== 0) return scopeDelta
      const stageDelta = Number(right.publicationStage === 'canary') - Number(left.publicationStage === 'canary')
      if (stageDelta !== 0) return stageDelta
      return String(right.publishedAt ?? '').localeCompare(String(left.publishedAt ?? ''))
    })
  const selectedByArtifact = new Map<string, DurationLearningRuntimeConsumablePublicationRecord>()
  for (const candidate of candidates) {
    if (!selectedByArtifact.has(candidate.artifactKey)) selectedByArtifact.set(candidate.artifactKey, candidate)
  }
  return [...selectedByArtifact.values()].map((publication) => ({
    runtimeConsumable: true,
    publicationKey: publication.publicationKey,
    selectionBasis: runtimeSelectionBasis(publication),
    publication,
    reasons: [],
  }))
}

export async function recordDurationLearningRuntimeImpact(input: {
  queryExec: DurationLearningRuntimePublicationQueryExec
  publicationKey: string
  monitoringStatus: 'collecting' | 'passed' | 'failed' | 'rollback_pending'
  metrics: Record<string, unknown>
  observedAt?: string
}) {
  const publicationKey = normalizeText(input.publicationKey)
  const reasons = [
    ...(publicationKey ? [] : ['publication_key_required']),
    ...(Object.keys(input.metrics).length > 0 ? [] : ['impact_metrics_required']),
  ]
  if (reasons.length > 0) return { status: 'blocked' as const, reasons }
  const rows = await input.queryExec<RuntimePublicationRow>(
    `update public.duration_learning_runtime_publications
        set impact_metrics = $1::jsonb,
            monitoring_status = $2,
            updated_at = $3::timestamptz
      where publication_key = $4
        and publication_stage in ('canary', 'stable')
      returning publication_key, monitoring_status`,
    [input.metrics, input.monitoringStatus, input.observedAt ?? new Date().toISOString(), publicationKey],
  )
  return rows[0]
    ? { status: 'impact_recorded' as const, reasons: [] }
    : { status: 'blocked' as const, reasons: ['runtime_publication_not_found'] }
}

export async function promoteDurationLearningRuntimeCanary(input: {
  queryExec: DurationLearningRuntimePublicationQueryExec
  publicationKey: string
  promotedAt?: string
}) {
  const publicationKey = normalizeText(input.publicationKey)
  if (!publicationKey) return { status: 'blocked' as const, previousPublicationKey: null, reasons: ['publication_key_required'] }
  const promotedAt = input.promotedAt ?? new Date().toISOString()
  const rows = await input.queryExec<RuntimePublicationRow>(
    `select *
       from public.promote_duration_learning_runtime_canary(
         $1::text,
         $2::timestamptz
       )`,
    [publicationKey, promotedAt],
  )
  if (rows[0]) {
    const previousPublicationKey = nullableText(
      (rows[0] as Record<string, unknown>).target_previous_publication_key
        ?? field(rows[0], 'previous_publication_key', 'previousPublicationKey'),
    )
    return { status: 'stable_promoted' as const, previousPublicationKey, reasons: [] }
  }

  const terminalRows = await input.queryExec<RuntimePublicationRow>(
    `select publication_key,
            publication_stage,
            monitoring_status,
            previous_publication_key
       from public.duration_learning_runtime_publications
      where publication_key = $1
      limit 1`,
    [publicationKey],
  )
  const terminal = terminalRows[0] ? rowToRecord(terminalRows[0]) : null
  if (terminal?.publicationStage === 'stable' && terminal.monitoringStatus === 'passed') {
    return {
      status: 'stable_already_promoted' as const,
      previousPublicationKey: terminal.previousPublicationKey,
      reasons: [],
    }
  }
  return terminal?.publicationStage === 'canary'
    ? {
        status: 'blocked' as const,
        previousPublicationKey: terminal.previousPublicationKey,
        reasons: ['canary_monitoring_pass_required'],
      }
    : { status: 'blocked' as const, previousPublicationKey: null, reasons: ['canary_publication_not_found'] }
}

export async function rollbackDurationLearningRuntimePublication(input: {
  queryExec: DurationLearningRuntimePublicationQueryExec
  publicationKey: string
  assetKey?: DurationLearningRuntimeAssetKey | null
  artifactKey?: string | null
  scope?: DurationLearningRuntimeScope | null
  expectedPreviousPublicationKey?: string | null
  reason: string
  rolledBackAt?: string
}) {
  const publicationKey = normalizeText(input.publicationKey)
  const assetKey = normalizeText(input.assetKey) as DurationLearningRuntimeAssetKey
  const artifactKey = normalizeText(input.artifactKey)
  const scope = input.scope ? normalizeScope(input.scope) : null
  const expectedPreviousPublicationKey = nullableText(input.expectedPreviousPublicationKey)
  const reason = normalizeText(input.reason)
  if (!publicationKey || !reason || !assetKey || !artifactKey || !scope) {
    return {
      status: 'blocked' as const,
      restoredPublicationKey: null,
      reasons: [
        ...(publicationKey ? [] : ['publication_key_required']),
        ...(reason ? [] : ['rollback_reason_required']),
        ...(assetKey ? [] : ['rollback_asset_key_required']),
        ...(artifactKey ? [] : ['rollback_artifact_key_required']),
        ...(scope ? [] : ['rollback_scope_required']),
      ],
    }
  }
  const rollbackScopeReasons = scopeReasons(input.scope!).map((value) => `rollback_${value}`)
  if (rollbackScopeReasons.length > 0) {
    return { status: 'blocked' as const, restoredPublicationKey: null, reasons: rollbackScopeReasons }
  }
  if (!await isProjectScopeAuthorized({ queryExec: input.queryExec, scope: input.scope! })) {
    return {
      status: 'blocked' as const,
      restoredPublicationKey: null,
      reasons: ['rollback_project_scope_company_mismatch'],
    }
  }
  const rolledBackAt = input.rolledBackAt ?? new Date().toISOString()
  const rows = await input.queryExec<RuntimePublicationRow>(
    `select *
       from public.rollback_duration_learning_runtime_publication(
         $1::text,
         $2::text,
         $3::text,
         $4::text,
         $5::uuid,
         $6::uuid,
         $7::text,
         $8::text,
         $9::text,
         $10::timestamptz
       )`,
    [
      publicationKey,
      assetKey,
      artifactKey,
      scope.level,
      scope.companyId,
      scope.projectId,
      scope.industryKey,
      expectedPreviousPublicationKey,
      reason,
      rolledBackAt,
    ],
  )
  const row = rows[0]
  if (row) {
    const previousPublicationKey = nullableText(field(row, 'previous_publication_key', 'previousPublicationKey'))
    const restoredPublicationKey = nullableText(field(row, 'restored_publication_key', 'restoredPublicationKey'))
    if (previousPublicationKey && restoredPublicationKey !== previousPublicationKey) {
      return {
        status: 'blocked' as const,
        restoredPublicationKey: null,
        reasons: ['rollback_target_not_restored'],
      }
    }
    return {
      status: 'rollback_executed' as const,
      restoredPublicationKey,
      reasons: [],
    }
  }
  const terminalRows = await input.queryExec<RuntimePublicationRow>(
    `select target.publication_key,
            target.publication_stage,
            target.previous_publication_key,
            case
              when target.previous_publication_key is null then null
              when predecessor.publication_stage = 'stable' then predecessor.publication_key
              else null
            end as restored_publication_key
       from public.duration_learning_runtime_publications target
       left join public.duration_learning_runtime_publications predecessor
         on predecessor.publication_key = target.previous_publication_key
        and predecessor.asset_key = target.asset_key
        and predecessor.artifact_key = target.artifact_key
        and predecessor.scope_level = target.scope_level
        and predecessor.company_id is not distinct from target.company_id
        and predecessor.project_id is not distinct from target.project_id
        and predecessor.industry_key is not distinct from target.industry_key
      where target.publication_key = $1
        and target.asset_key = $2
        and target.artifact_key = $3
        and target.scope_level = $4
        and target.company_id is not distinct from $5::uuid
        and target.project_id is not distinct from $6::uuid
        and target.industry_key is not distinct from $7::text
      limit 1`,
    [
      publicationKey,
      assetKey,
      artifactKey,
      scope.level,
      scope.companyId,
      scope.projectId,
      scope.industryKey,
    ],
  )
  const terminal = terminalRows[0] ? rowToRecord(terminalRows[0]) : null
  if (
    terminal
    && expectedPreviousPublicationKey
    && terminal.previousPublicationKey !== expectedPreviousPublicationKey
  ) {
    return {
      status: 'blocked' as const,
      restoredPublicationKey: null,
      reasons: ['rollback_target_mismatch'],
    }
  }
  const restoredPublicationKey = nullableText(field(
    terminalRows[0] ?? {},
    'restored_publication_key',
    'restoredPublicationKey',
  ))
  if (terminal?.previousPublicationKey && restoredPublicationKey !== terminal.previousPublicationKey) {
    return {
      status: 'blocked' as const,
      restoredPublicationKey: null,
      reasons: ['rollback_target_not_restored'],
    }
  }
  if (terminal?.publicationStage === 'rolled_back') {
    return {
      status: 'rollback_already_executed' as const,
      restoredPublicationKey,
      reasons: [],
    }
  }
  return { status: 'blocked' as const, restoredPublicationKey: null, reasons: ['runtime_publication_not_found'] }
}
