import { executeSQL } from './dbService.js'
import {
  persistDurationLearningRuntimePublication,
  promoteDurationLearningRuntimeCanary,
  recordDurationLearningRuntimeImpact,
  rollbackDurationLearningRuntimePublication,
  type DurationLearningRuntimeAssetKey,
  type DurationLearningRuntimePublicationQueryExec,
  type DurationLearningRuntimeScope,
  type PersistDurationLearningRuntimePublicationInput,
} from './durationLearningRuntimePublicationService.js'
import {
  buildDurationContextPolicyLearningOperationIdentity,
  createDatabaseDurationContextPolicyLearningCheckpointStore,
  executeDurationContextPolicyLearningStage,
  hashDurationContextPolicyLearningValue,
  type DurationContextPolicyLearningCheckpointStore,
} from './durationContextPolicyLearningCheckpointService.js'
import {
  evaluateDurationLearningAssetAutomationPolicy,
  type DurationLearningAutomationEvidence,
  type DurationLearningAutomationQualityModel,
  type DurationLearningExperienceTier,
  type DurationLearningFactSource,
} from './durationLearningAssetAutomationPolicyService.js'

const STRUCTURAL_ASSET_KEYS = new Set<DurationLearningRuntimeAssetKey>([
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
])

const QUALITY_MODEL_BY_ASSET: Record<DurationLearningRuntimeAssetKey, DurationLearningAutomationQualityModel> = {
  base_duration_benchmark: 'numeric_holdout',
  standard_work_duration_seed: 'numeric_holdout',
  special_work_duration_seed: 'numeric_replay',
  wbs_reference_days: 'numeric_holdout',
  dependency_rule_candidate: 'structural_replay',
  critical_path_rule_candidate: 'structural_replay',
}

const AGGREGATION_FLOORS = {
  ordinary: {
    company: { projects: 2, companies: 1, industries: 1 },
    industry: { projects: 4, companies: 2, industries: 1 },
    global: { projects: 8, companies: 4, industries: 2 },
  },
  structural: {
    company: { projects: 4, companies: 1, industries: 1 },
    industry: { projects: 8, companies: 3, industries: 1 },
    global: { projects: 16, companies: 6, industries: 3 },
  },
} as const

export interface DurationLearningRuntimeCandidateProposal {
  proposalKey: string
  assetKey: DurationLearningRuntimeAssetKey
  artifactKey: string
  scope: DurationLearningRuntimeScope
  runtimePayload: Record<string, unknown>
  sourceCandidateRefs: string[]
  sourceEvidenceRefs: string[]
  sampleCount: number
  projectIds: string[]
  companyIds: string[]
  industryKeys: string[]
  taskIds?: string[]
  realOutcomeCount?: number
  replayCaseCount?: number
  observationWindowDays?: number
  productionDaySamples?: number[]
  conflictCount: number
  replayPassed: boolean
  qualityModel?: DurationLearningAutomationQualityModel | null
  blockingReasons?: string[]
  policyEvaluationRequired?: boolean
  automationEvidence?: DurationLearningAutomationEvidence
  automationDecision?: {
    stage: string
    autoPromotionAllowed: boolean
    manualReviewRequired: boolean
    reasonCodes: string[]
  }
}

export interface DurationLearningRuntimeMonitoringCandidate {
  publicationKey: string
  assetKey: DurationLearningRuntimeAssetKey
  artifactKey: string
  publicationStage: 'canary' | 'stable'
  scope: DurationLearningRuntimeScope
  monitoringWindowHours: number
  monitoringElapsedHours: number
  observedCount: number
  rejectedObservationCount: number
  acceptedOutcomeCount: number
  weakOrRejectedOutcomeCount: number
  accuracySampleCount: number
  maeBefore: number | null
  maeAfter: number | null
  regressionRate: number | null
  sourceAutomationDecision?: Record<string, unknown>
}

export interface DurationLearningRuntimeLifecycleSweepResult {
  candidateCount: number
  expandedCandidateCount: number
  canaryPublished: number
  candidateCheckpointReused: number
  candidateCollecting: number
  manualFallback: number
  monitoringPending: number
  monitoringPassed: number
  monitoringFailed: number
  stablePromoted: number
  stablePromotionReused: number
  rollbackExecuted: number
  rollbackReused: number
  failed: number
  failureRefs: DurationLearningRuntimeLifecycleFailureRef[]
  collectionCursorAdvanced: boolean
}

export interface DurationLearningRuntimeLifecycleFailureRef {
  phase: 'candidate_collection' | 'candidate_publication' | 'monitoring_collection' | 'monitoring' | 'collection_cursor'
  reference: string
  message: string
}

export interface DurationLearningRuntimeCollectionCursorPosition {
  lastGroupKey: string | null
  wrapCount: number
}

export interface DurationLearningRuntimeCollectionCursorState {
  version: number
  positions: Record<string, DurationLearningRuntimeCollectionCursorPosition>
}

export interface DurationLearningRuntimeCollectionCursorStore {
  load(): Promise<DurationLearningRuntimeCollectionCursorState>
  commit(
    expected: DurationLearningRuntimeCollectionCursorState,
    next: DurationLearningRuntimeCollectionCursorState,
  ): Promise<DurationLearningRuntimeCollectionCursorState>
}

type PersistPublication = (
  input: PersistDurationLearningRuntimePublicationInput,
) => ReturnType<typeof persistDurationLearningRuntimePublication>

export interface RunDurationLearningRuntimeLifecycleSweepInput {
  queryExec?: DurationLearningRuntimePublicationQueryExec
  candidateProvider?: () => Promise<DurationLearningRuntimeCandidateProposal[]>
  monitoringProvider?: () => Promise<DurationLearningRuntimeMonitoringCandidate[]>
  persistPublication?: PersistPublication
  checkpointStore?: DurationContextPolicyLearningCheckpointStore | null
  checkpointOwnerId?: string
  collectionCursorStore?: DurationLearningRuntimeCollectionCursorStore | null
  recordImpact?: typeof recordDurationLearningRuntimeImpact
  promoteCanary?: typeof promoteDurationLearningRuntimeCanary
  rollbackPublication?: typeof rollbackDurationLearningRuntimePublication
  observedAt?: string
}

type SourceRow = Record<string, unknown>

const COLLECTION_CURSOR_OPERATION_ID = 'duration-learning-runtime-collection-cursor'
const COLLECTION_CURSOR_STAGE_KEY = 'collection_cursor'
const COLLECTION_CURSOR_SCHEMA = 'duration-learning-runtime-collection-cursor/v1'
const COLLECTION_CURSOR_INPUT_HASH = `${COLLECTION_CURSOR_SCHEMA}:asset-artifact-keyset-fair-history-v1`
const SOURCE_GROUP_LIMIT = 25
const SOURCE_STREAM_COUNT = 7
const PROJECT_SCOPE_STREAM_BUDGET = 64
const COMPANY_SCOPE_PROJECT_LIMIT = 40
const INDUSTRY_SCOPE_PROJECT_LIMIT = 150
const GLOBAL_SCOPE_PROJECT_LIMIT = 250
const SCOPE_CURSOR_SEPARATOR = '\u001f'
const ACTIVE_MONITORING_LIMIT = 400
const STABLE_MONITORING_LIMIT = 100
const MONITORING_CURSOR_STREAM_KEYS = ['monitor:active', 'monitor:stable'] as const

const DURATION_LEARNING_CANONICAL_INDUSTRY_ALIASES = {
  general_civil: [
    'general_civil',
    'civil',
    'civil_building',
    'residential',
    'civil_residential',
    'general_civil_residential',
    'high_rise_residential',
    'residential_high_rise',
    'civil_office_commercial',
    'civil_complex',
    'commercial_complex',
    'office',
    'commercial',
  ],
  hotel: ['hotel'],
  hospital: ['hospital'],
  school: ['school'],
  industrial: [
    'industrial',
    'factory',
    'manufacturing_plant',
    'industrial_general',
    'industrial_logistics',
    'industrial_cleanroom',
    'industrial_heavy',
    'logistics',
    'logistics_warehouse',
    'automated_warehouse',
    'clean_industrial',
    'process_facility',
    'clean_manufacturing',
    'pharma_factory',
    'heavy_manufacturing',
    'heavy_industry',
    'heavy_industrial_plant',
    'equipment_manufacturing',
  ],
  data_center: ['data_center', 'datacenter'],
  transportation_hub: [
    'transportation_hub',
    'transportation',
    'transport_hub',
    'multimodal_hub',
    'transport_multimodal',
    'transport_railway_station',
    'transport_metro_interchange',
    'transport_bus_terminal',
    'railway_station',
    'metro_interchange',
    'underground_station',
    'bus_terminal',
  ],
  sports_culture: [
    'sports_culture',
    'sports',
    'culture',
    'sports_venue',
    'culture_venue',
    'large_span_public',
    'sports_stadium',
    'sports_indoor_arena',
    'sports_theater',
    'sports_exhibition',
    'indoor_arena',
    'arena',
    'theater',
    'performing_arts_center',
    'exhibition_venue',
    'museum',
    'convention_center',
  ],
  tod_upper_cover: ['tod_upper_cover', 'tod'],
  renovation: [
    'renovation',
    'renovation_seismic',
    'renovation_energy',
    'renovation_heritage',
    'energy_retrofit',
    'heritage',
    'historic_preservation',
    'heritage_preservation',
  ],
  modular_building: ['modular_building', 'modular', 'mic', 'modular_mic'],
} as const

type DurationLearningCanonicalIndustryKey = keyof typeof DURATION_LEARNING_CANONICAL_INDUSTRY_ALIASES

function normalizeDurationLearningIndustryAlias(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

const DURATION_LEARNING_INDUSTRY_ALIAS_TO_CANONICAL = new Map<string, DurationLearningCanonicalIndustryKey>()
for (const [canonicalKey, aliases] of Object.entries(DURATION_LEARNING_CANONICAL_INDUSTRY_ALIASES)) {
  for (const alias of aliases) {
    const normalized = normalizeDurationLearningIndustryAlias(alias)
    const existing = DURATION_LEARNING_INDUSTRY_ALIAS_TO_CANONICAL.get(normalized)
    if (existing && existing !== canonicalKey) {
      throw new Error(`duration_learning_industry_alias_conflict:${normalized}:${existing}:${canonicalKey}`)
    }
    DURATION_LEARNING_INDUSTRY_ALIAS_TO_CANONICAL.set(
      normalized,
      canonicalKey as DurationLearningCanonicalIndustryKey,
    )
  }
}

export function canonicalizeDurationLearningIndustryKey(value: unknown): DurationLearningCanonicalIndustryKey | null {
  return DURATION_LEARNING_INDUSTRY_ALIAS_TO_CANONICAL.get(
    normalizeDurationLearningIndustryAlias(value),
  ) ?? null
}

function sqlStringLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

export function durationLearningProjectIndustrySqlExpression(projectAlias = 'project') {
  if (!/^[a-z_][a-z0-9_]*$/i.test(projectAlias)) {
    throw new Error('duration_learning_project_sql_alias_invalid')
  }
  const candidates = [
    `${projectAlias}.metadata ->> 'wizard_business_type'`,
    `${projectAlias}.metadata ->> 'wizardBusinessType'`,
    `${projectAlias}.metadata ->> 'businessType'`,
    `${projectAlias}.metadata ->> 'business_type'`,
    `${projectAlias}.metadata #>> '{projectGenerationFacts,businessType}'`,
    `${projectAlias}.metadata #>> '{projectGenerationFacts,business_type}'`,
    `${projectAlias}.metadata #>> '{project_generation_facts,businessType}'`,
    `${projectAlias}.metadata #>> '{project_generation_facts,business_type}'`,
    `${projectAlias}.project_type::text`,
    `${projectAlias}.building_type::text`,
  ]
  const aliasRows = [...DURATION_LEARNING_INDUSTRY_ALIAS_TO_CANONICAL.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([alias, canonicalKey]) => `(${sqlStringLiteral(alias)}, ${sqlStringLiteral(canonicalKey)})`)
  return `coalesce((
      select alias_map.canonical_key
        from unnest(array[
          ${candidates.join(',\n          ')}
        ]) with ordinality as candidate(raw_key, priority)
        join (values
          ${aliasRows.join(',\n          ')}
        ) as alias_map(alias_key, canonical_key)
          on alias_map.alias_key = lower(regexp_replace(btrim(candidate.raw_key), '[[:space:]-]+', '_', 'g'))
       where nullif(btrim(candidate.raw_key), '') is not null
       order by candidate.priority
       limit 1
    ), '')`
}

export const DURATION_LEARNING_RUNTIME_SWEEP_BUDGETS = Object.freeze({
  sourceStreamCount: SOURCE_STREAM_COUNT,
  artifactDiscoveryPerSourceStream: SOURCE_GROUP_LIMIT,
  projectProposalsPerSourceStream: PROJECT_SCOPE_STREAM_BUDGET,
  projectProposalsTotal: SOURCE_STREAM_COUNT * PROJECT_SCOPE_STREAM_BUDGET,
  explicitScopeProposalsPerSourceStream: 3,
  explicitScopeProposalsTotal: SOURCE_STREAM_COUNT * 3,
  candidateProposalsTotal: SOURCE_STREAM_COUNT * PROJECT_SCOPE_STREAM_BUDGET + SOURCE_STREAM_COUNT * 3,
  expandedProposalsTotal: 1024,
  companyEvidenceRowsTotal: SOURCE_STREAM_COUNT * COMPANY_SCOPE_PROJECT_LIMIT,
  industryEvidenceRowsTotal: SOURCE_STREAM_COUNT * INDUSTRY_SCOPE_PROJECT_LIMIT,
  globalEvidenceRowsTotal: SOURCE_STREAM_COUNT * GLOBAL_SCOPE_PROJECT_LIMIT,
})

function emptyCollectionCursorState(): DurationLearningRuntimeCollectionCursorState {
  return { version: 0, positions: {} }
}

function normalizeCursorPosition(value: unknown): DurationLearningRuntimeCollectionCursorPosition {
  const source = record(value)
  return {
    lastGroupKey: nullableText(source.lastGroupKey ?? source.last_group_key),
    wrapCount: nonNegativeInteger(source.wrapCount ?? source.wrap_count),
  }
}

function normalizeCollectionCursorState(value: unknown, versionFallback = 0): DurationLearningRuntimeCollectionCursorState {
  const source = record(value)
  const positions = record(source.positions)
  return {
    version: nonNegativeInteger(source.version ?? versionFallback),
    positions: Object.fromEntries(
      Object.entries(positions)
        .map(([key, position]) => [text(key), normalizeCursorPosition(position)] as const)
        .filter(([key]) => Boolean(key)),
    ),
  }
}

function cursorPayload(state: DurationLearningRuntimeCollectionCursorState) {
  return normalizeCollectionCursorState(state, state.version)
}

function cursorOutputHash(state: DurationLearningRuntimeCollectionCursorState) {
  return hashDurationContextPolicyLearningValue(cursorPayload(state))
}

export function createInMemoryDurationLearningRuntimeCollectionCursorStore(
  initial: DurationLearningRuntimeCollectionCursorState = emptyCollectionCursorState(),
): DurationLearningRuntimeCollectionCursorStore {
  let current = structuredClone(normalizeCollectionCursorState(initial))
  return {
    async load() {
      return structuredClone(current)
    },
    async commit(expected, next) {
      if (cursorOutputHash(current) !== cursorOutputHash(normalizeCollectionCursorState(expected))) {
        throw new Error('duration_learning_runtime_collection_cursor_conflict')
      }
      current = {
        ...normalizeCollectionCursorState(next),
        version: current.version + 1,
      }
      return structuredClone(current)
    },
  }
}

export function createDatabaseDurationLearningRuntimeCollectionCursorStore(
  queryExec: DurationLearningRuntimePublicationQueryExec = executeSQL,
): DurationLearningRuntimeCollectionCursorStore {
  return {
    async load() {
      const rows = await queryExec<SourceRow>(
        `/* duration-learning-runtime-collection-cursor:read */
         select stage_status,
                input_hash,
                output_hash,
                output_payload,
                attempt_count
           from public.duration_context_policy_learning_checkpoints
          where operation_id = $1
            and stage_key = '${COLLECTION_CURSOR_STAGE_KEY}'
          limit 1`,
        [COLLECTION_CURSOR_OPERATION_ID],
      )
      const row = rows[0]
      if (!row) return emptyCollectionCursorState()
      if (text(row.stage_status) !== 'succeeded' || text(row.input_hash) !== COLLECTION_CURSOR_INPUT_HASH) {
        throw new Error('duration_learning_runtime_collection_cursor_contract_mismatch')
      }
      const state = normalizeCollectionCursorState(row.output_payload, row.attempt_count as number)
      if (text(row.output_hash) !== cursorOutputHash(state)) {
        throw new Error('duration_learning_runtime_collection_cursor_hash_mismatch')
      }
      return { ...state, version: nonNegativeInteger(row.attempt_count) }
    },
    async commit(expected, next) {
      const nextState = {
        ...normalizeCollectionCursorState(next),
        version: expected.version + 1,
      }
      const payload = cursorPayload(nextState)
      const outputHash = cursorOutputHash(nextState)
      const now = new Date().toISOString()
      const expectedHash = expected.version > 0 ? cursorOutputHash(expected) : null
      const rows = await queryExec<SourceRow>(
        `/* duration-learning-runtime-collection-cursor:commit collection_cursor */
         insert into public.duration_context_policy_learning_checkpoints (
           operation_id, stage_key, stage_status, input_hash, output_hash, output_payload,
           attempt_count, operation_identity, created_at, updated_at
         ) values ($1, '${COLLECTION_CURSOR_STAGE_KEY}', 'succeeded', $2, $3, $4::jsonb, 1, $5::jsonb, $6, $6)
         on conflict (operation_id, stage_key) do update
           set stage_status = 'succeeded',
               output_hash = excluded.output_hash,
               output_payload = excluded.output_payload,
               attempt_count = public.duration_context_policy_learning_checkpoints.attempt_count + 1,
               operation_identity = excluded.operation_identity,
               error_message = null,
               lease_owner = null,
               lease_expires_at = null,
               updated_at = excluded.updated_at
         where public.duration_context_policy_learning_checkpoints.stage_status = 'succeeded'
           and public.duration_context_policy_learning_checkpoints.input_hash = $2
           and public.duration_context_policy_learning_checkpoints.attempt_count = $7
           and public.duration_context_policy_learning_checkpoints.output_hash is not distinct from $8
         returning output_payload, output_hash, attempt_count`,
        [
          COLLECTION_CURSOR_OPERATION_ID,
          COLLECTION_CURSOR_INPUT_HASH,
          outputHash,
          payload,
          { cursorSchema: COLLECTION_CURSOR_SCHEMA },
          now,
          expected.version,
          expectedHash,
        ],
      )
      if (!rows[0]) throw new Error('duration_learning_runtime_collection_cursor_conflict')
      return {
        ...normalizeCollectionCursorState(rows[0].output_payload, rows[0].attempt_count as number),
        version: nonNegativeInteger(rows[0].attempt_count),
      }
    },
  }
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function producerQualityModel(
  assetKey: DurationLearningRuntimeAssetKey,
  source: Record<string, unknown>,
): DurationLearningAutomationQualityModel | null {
  const model = text(source.qualityModel ?? source.quality_model)
  return model === QUALITY_MODEL_BY_ASSET[assetKey]
    ? model as DurationLearningAutomationQualityModel
    : null
}

function nullableText(value: unknown) {
  return text(value) || null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function nonNegativeInteger(value: unknown) {
  return Math.max(0, Math.trunc(finiteNumber(value)))
}

function positiveNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function uniqueTexts(values: readonly unknown[]) {
  return [...new Set(values.map(text).filter(Boolean))].sort()
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]),
  )
}

function payloadFingerprint(value: Record<string, unknown>) {
  return hashDurationContextPolicyLearningValue(canonicalValue(value)).slice(0, 24)
}

function proposalIdentity(proposal: DurationLearningRuntimeCandidateProposal) {
  return [proposal.assetKey, proposal.artifactKey, payloadFingerprint(proposal.runtimePayload)].join(':')
}

function proposalGroupingIdentity(proposal: DurationLearningRuntimeCandidateProposal) {
  return `${proposal.assetKey}:${proposal.artifactKey}`
}

function scopeIdentity(scope: DurationLearningRuntimeScope) {
  if (scope.level === 'project') return `project:${scope.companyId}:${scope.projectId}`
  if (scope.level === 'company') return `company:${scope.companyId}`
  if (scope.level === 'industry') return `industry:${scope.industryKey}`
  return 'global'
}

function canonicalIndustryKeys(values: readonly unknown[]) {
  return uniqueTexts(values.map(canonicalizeDurationLearningIndustryKey).filter(Boolean))
}

function cloneProposal(proposal: DurationLearningRuntimeCandidateProposal): DurationLearningRuntimeCandidateProposal {
  const scope = proposal.scope.level === 'industry'
    ? {
        ...proposal.scope,
        industryKey: canonicalizeDurationLearningIndustryKey(proposal.scope.industryKey) ?? '',
      }
    : { ...proposal.scope }
  return {
    ...proposal,
    scope,
    runtimePayload: structuredClone(proposal.runtimePayload),
    sourceCandidateRefs: uniqueTexts(proposal.sourceCandidateRefs),
    sourceEvidenceRefs: uniqueTexts(proposal.sourceEvidenceRefs),
    projectIds: uniqueTexts(proposal.projectIds),
    companyIds: uniqueTexts(proposal.companyIds),
    industryKeys: canonicalIndustryKeys(proposal.industryKeys),
    taskIds: uniqueTexts(proposal.taskIds ?? []),
    blockingReasons: uniqueTexts(proposal.blockingReasons ?? []),
    automationEvidence: proposal.automationEvidence
      ? structuredClone(proposal.automationEvidence)
      : undefined,
    automationDecision: proposal.automationDecision
      ? structuredClone(proposal.automationDecision)
      : undefined,
  }
}

function aggregationFloor(assetKey: DurationLearningRuntimeAssetKey, scope: 'company' | 'industry' | 'global') {
  return AGGREGATION_FLOORS[STRUCTURAL_ASSET_KEYS.has(assetKey) ? 'structural' : 'ordinary'][scope]
}

function meetsAggregationFloor(
  proposal: Pick<DurationLearningRuntimeCandidateProposal, 'assetKey' | 'projectIds' | 'companyIds' | 'industryKeys'>,
  scope: 'company' | 'industry' | 'global',
) {
  const floor = aggregationFloor(proposal.assetKey, scope)
  return proposal.projectIds.length >= floor.projects
    && proposal.companyIds.length >= floor.companies
    && proposal.industryKeys.length >= floor.industries
}

function aggregateProposal(
  proposals: DurationLearningRuntimeCandidateProposal[],
  scope: DurationLearningRuntimeScope,
): DurationLearningRuntimeCandidateProposal {
  const first = proposals[0]
  const projectIds = uniqueTexts(proposals.flatMap((proposal) => proposal.projectIds))
  const companyIds = uniqueTexts(proposals.flatMap((proposal) => proposal.companyIds))
  const industryKeys = uniqueTexts(proposals.flatMap((proposal) => proposal.industryKeys))
  const sourceCandidateRefs = uniqueTexts(proposals.flatMap((proposal) => proposal.sourceCandidateRefs))
  const sourceEvidenceRefs = uniqueTexts(proposals.flatMap((proposal) => proposal.sourceEvidenceRefs))
  const taskIds = uniqueTexts(proposals.flatMap((proposal) => proposal.taskIds ?? []))
  const conflictCount = proposals.reduce((sum, proposal) => sum + nonNegativeInteger(proposal.conflictCount), 0)
  const sampleCount = proposals.reduce((sum, proposal) => sum + nonNegativeInteger(proposal.sampleCount), 0)
  const runtimePayload = aggregateRuntimePayload(proposals)
  const proposalKey = `duration-learning-aggregate:${proposalGroupingIdentity(first)}:${scopeIdentity(scope)}:${payloadFingerprint(runtimePayload)}`
  const aggregate: DurationLearningRuntimeCandidateProposal = {
    proposalKey,
    assetKey: first.assetKey,
    artifactKey: first.artifactKey,
    scope,
    runtimePayload,
    sourceCandidateRefs,
    sourceEvidenceRefs,
    sampleCount,
    projectIds,
    companyIds,
    industryKeys,
    taskIds,
    realOutcomeCount: proposals.reduce((sum, proposal) => sum + nonNegativeInteger(proposal.realOutcomeCount), 0),
    replayCaseCount: proposals.reduce((sum, proposal) => sum + nonNegativeInteger(proposal.replayCaseCount), 0),
    observationWindowDays: Math.max(...proposals.map((proposal) => nonNegativeInteger(proposal.observationWindowDays)), 0),
    productionDaySamples: proposals.flatMap((proposal) => (proposal.productionDaySamples ?? [])
      .map(positiveNumber)
      .filter((value): value is number => value !== null)),
    conflictCount,
    replayPassed: proposals.every((proposal) => proposal.replayPassed),
    qualityModel: proposals.every((proposal) => (
      proposal.qualityModel != null && proposal.qualityModel === first.qualityModel
    ))
      ? first.qualityModel
      : null,
    blockingReasons: uniqueTexts([
      ...proposals.flatMap((proposal) => proposal.blockingReasons ?? []),
      ...aggregateNodeSetBlockingReasons(proposals),
      ...(proposals.every((proposal) => (
        proposal.qualityModel != null && proposal.qualityModel === first.qualityModel
      )) ? [] : ['duration_learning_quality_model_required']),
    ]),
    policyEvaluationRequired: true,
    automationEvidence: {
      holdoutSampleCount: proposals.reduce(
        (sum, proposal) => sum + nonNegativeInteger(proposal.automationEvidence?.holdoutSampleCount),
        0,
      ),
      maeBefore: weightedAverage(proposals, 'maeBefore'),
      maeAfter: weightedAverage(proposals, 'maeAfter'),
      conflictRate: weightedAverage(proposals, 'conflictRate'),
      overcompensationRate: weightedAverage(proposals, 'overcompensationRate'),
      replayPassRate: weightedAverage(proposals, 'replayPassRate'),
      outcomeAcceptanceRate: weightedAverage(proposals, 'outcomeAcceptanceRate'),
      qualityConsistencyRate: weightedAverage(proposals, 'qualityConsistencyRate'),
      rollbackReady: proposals.every((proposal) => proposal.automationEvidence?.rollbackReady === true),
      tenantScopeValid: proposals.every((proposal) => proposal.automationEvidence?.tenantScopeValid === true),
      structuralMutation: proposals.some((proposal) => proposal.automationEvidence?.structuralMutation === true),
      exceptionalConflict: proposals.some((proposal) => proposal.automationEvidence?.exceptionalConflict === true),
    },
  }
  return withAutomationDecision(aggregate)
}

function pooledPercentile(values: readonly number[], percentileValue: number) {
  const sorted = values
    .map(positiveNumber)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right)
  if (sorted.length === 0) return null
  const index = Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)
  return sorted[Math.min(index, sorted.length - 1)]
}

function weightedPayloadNumber(
  proposals: DurationLearningRuntimeCandidateProposal[],
  keys: string[],
) {
  const values = proposals.flatMap((proposal) => {
    const raw = keys.map((key) => proposal.runtimePayload[key]).find((value) => positiveNumber(value) !== null)
    const value = positiveNumber(raw)
    return value === null ? [] : [{ value, weight: Math.max(1, proposal.sampleCount) }]
  })
  if (values.length === 0) return null
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0)
  return Math.max(1, Math.round(values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight))
}

function weightedSignedPayloadNumber(
  proposals: DurationLearningRuntimeCandidateProposal[],
  keys: string[],
) {
  const values = proposals.flatMap((proposal) => {
    const raw = keys.map((key) => proposal.runtimePayload[key]).find((value) => optionalNumber(value) !== null)
    const value = optionalNumber(raw)
    return value === null ? [] : [{ value, weight: Math.max(1, proposal.sampleCount) }]
  })
  if (values.length === 0) return null
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0)
  return Math.round(values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight)
}

function nodeIdentity(node: Record<string, unknown>) {
  return text(node.sourceId ?? node.source_id ?? node.stableCode ?? node.stable_code ?? node.path)
}

function aggregateNodeSetBlockingReasons(proposals: DurationLearningRuntimeCandidateProposal[]) {
  const assetKey = proposals[0]?.assetKey
  if (assetKey !== 'special_work_duration_seed' && assetKey !== 'wbs_reference_days') return []
  const nodeSets = proposals.map((proposal) => uniqueTexts(
    list(proposal.runtimePayload.nodes).map((value) => nodeIdentity(record(value))),
  ))
  if (assetKey === 'wbs_reference_days' && nodeSets.some((nodes) => nodes.length === 0)) {
    return ['wbs_reference_days_nodes_required']
  }
  if (nodeSets.every((nodes) => nodes.length === 0)) return []
  const expected = JSON.stringify(nodeSets[0])
  return nodeSets.every((nodes) => JSON.stringify(nodes) === expected)
    ? []
    : [`${assetKey}_node_set_incompatible`]
}

function aggregatePayloadNodes(proposals: DurationLearningRuntimeCandidateProposal[]) {
  const byIdentity = new Map<string, Array<{ node: Record<string, unknown>, weight: number }>>()
  for (const proposal of proposals) {
    for (const value of list(proposal.runtimePayload.nodes)) {
      const node = record(value)
      const identity = nodeIdentity(node)
      if (!identity) continue
      const entries = byIdentity.get(identity) ?? []
      entries.push({ node, weight: Math.max(1, proposal.sampleCount) })
      byIdentity.set(identity, entries)
    }
  }
  return [...byIdentity.entries()]
    .filter(([, entries]) => entries.length === proposals.length)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, entries]) => {
      const first = entries[0].node
      const durationKeys = [
        ['referenceDays', 'reference_days', 'suggestedReferenceDays', 'suggested_reference_days'],
        ['p50Days', 'p50_days', 'durationDays', 'duration_days'],
        ['p80Days', 'p80_days'],
      ]
      const aggregated = { ...first }
      for (const keys of durationKeys) {
        const measured = entries.flatMap((entry) => {
          const raw = keys.map((key) => entry.node[key]).find((value) => positiveNumber(value) !== null)
          const value = positiveNumber(raw)
          return value === null ? [] : [{ value, weight: entry.weight }]
        })
        if (measured.length === 0) continue
        const totalWeight = measured.reduce((sum, item) => sum + item.weight, 0)
        aggregated[keys[0]] = Math.max(1, Math.round(
          measured.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight,
        ))
      }
      return aggregated
    })
}

function aggregateRuntimePayload(proposals: DurationLearningRuntimeCandidateProposal[]) {
  const first = proposals[0]
  if (first.assetKey === 'base_duration_benchmark') {
    const productionDaySamples = proposals.flatMap((proposal) => proposal.productionDaySamples ?? [])
    return {
      p50Days: pooledPercentile(productionDaySamples, 0.5)
        ?? weightedPayloadNumber(proposals, ['p50Days', 'p50_days']),
      p80Days: pooledPercentile(productionDaySamples, 0.8)
        ?? weightedPayloadNumber(proposals, ['p80Days', 'p80_days'])
        ?? weightedPayloadNumber(proposals, ['p50Days', 'p50_days']),
      durationDayBasis: 'construction_production_day',
    }
  }
  if (first.assetKey === 'standard_work_duration_seed') {
    return {
      ...structuredClone(first.runtimePayload),
      stableCode: text(first.runtimePayload.stableCode ?? first.runtimePayload.stable_code) || first.artifactKey,
      p50Days: weightedPayloadNumber(proposals, ['p50Days', 'p50_days', 'baseDurationDays', 'base_duration_days']),
      p80Days: weightedPayloadNumber(proposals, ['p80Days', 'p80_days']),
      durationDayBasis: 'construction_production_day',
    }
  }
  if (first.assetKey === 'dependency_rule_candidate') {
    return {
      ...structuredClone(first.runtimePayload),
      lagDays: weightedSignedPayloadNumber(proposals, ['lagDays', 'lag_days']) ?? 0,
      durationDayBasis: 'construction_production_day',
    }
  }
  if (first.assetKey === 'special_work_duration_seed' || first.assetKey === 'wbs_reference_days') {
    return {
      ...structuredClone(first.runtimePayload),
      nodes: aggregatePayloadNodes(proposals),
      durationDayBasis: 'construction_production_day',
    }
  }
  return structuredClone(first.runtimePayload)
}

function weightedAverage(
  proposals: DurationLearningRuntimeCandidateProposal[],
  key:
    | 'maeBefore'
    | 'maeAfter'
    | 'conflictRate'
    | 'overcompensationRate'
    | 'replayPassRate'
    | 'outcomeAcceptanceRate'
    | 'qualityConsistencyRate',
) {
  const measured = proposals.flatMap((proposal) => {
    const value = proposal.automationEvidence?.[key]
    const parsed = optionalNumber(value)
    return parsed !== null
      ? [{ value: parsed, weight: Math.max(1, proposal.sampleCount) }]
      : []
  })
  if (measured.length === 0) return null
  const totalWeight = measured.reduce((sum, item) => sum + item.weight, 0)
  return measured.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight
}

function withAutomationDecision(
  proposal: DurationLearningRuntimeCandidateProposal,
): DurationLearningRuntimeCandidateProposal {
  const expectedQualityModel = QUALITY_MODEL_BY_ASSET[proposal.assetKey]
  const qualityModel = proposal.qualityModel === expectedQualityModel
    ? proposal.qualityModel
    : null
  const qualityModelReasons = qualityModel ? [] : ['duration_learning_quality_model_required']
  const factSource: DurationLearningFactSource = qualityModel === 'numeric_replay'
    ? 'replay'
    : qualityModel === 'structural_replay'
      ? 'hybrid'
      : 'actual_outcome'
  const evaluated = evaluateDurationLearningAssetAutomationPolicy({
    experienceTier: STRUCTURAL_ASSET_KEYS.has(proposal.assetKey) ? 'T3' : 'T2',
    reuseScope: proposal.scope.level,
    factSource,
    targetStage: 'canary',
    qualityModel: qualityModel ?? expectedQualityModel,
    evidence: {
      ...proposal.automationEvidence,
      validChangeCount: proposal.sampleCount,
      taskIds: proposal.taskIds ?? [],
      projectIds: proposal.projectIds,
      companyIds: proposal.companyIds,
      realOutcomeCount: proposal.realOutcomeCount ?? 0,
      replayCaseCount: proposal.replayCaseCount ?? 0,
      observationWindowDays: proposal.observationWindowDays ?? 0,
      exceptionalConflict: proposal.conflictCount > 0
        || proposal.automationEvidence?.exceptionalConflict === true,
    },
  })
  const decision = qualityModel
    ? evaluated
    : {
        ...evaluated,
        stage: 'collecting' as const,
        autoPromotionAllowed: false,
        manualReviewRequired: false,
        reasonCodes: uniqueTexts([...evaluated.reasonCodes, ...qualityModelReasons]),
      }
  return {
    ...proposal,
    qualityModel,
    blockingReasons: uniqueTexts([
      ...(proposal.blockingReasons ?? []),
      ...qualityModelReasons,
    ]),
    automationDecision: decision,
  }
}

function groupProjectProposals(
  proposals: DurationLearningRuntimeCandidateProposal[],
  groupKey: (proposal: DurationLearningRuntimeCandidateProposal) => string | null,
) {
  const groups = new Map<string, DurationLearningRuntimeCandidateProposal[]>()
  for (const proposal of proposals) {
    if (proposal.scope.level !== 'project') continue
    const key = groupKey(proposal)
    if (!key) continue
    const identity = `${proposalGroupingIdentity(proposal)}:${key}`
    const existing = groups.get(identity) ?? []
    existing.push(proposal)
    groups.set(identity, existing)
  }
  return groups
}

export function expandDurationLearningRuntimeCandidateScopes(
  input: readonly DurationLearningRuntimeCandidateProposal[],
) {
  const cloned = input
    .map(cloneProposal)
    .filter((proposal) => proposal.scope.level !== 'industry' || Boolean(proposal.scope.industryKey))
  const projectProposals = cloned.filter((proposal) => proposal.scope.level === 'project')
  const explicitScopes = new Map<string, DurationLearningRuntimeCandidateProposal>()
  for (const proposal of cloned) {
    if (proposal.scope.level === 'project') continue
    const key = `${proposalGroupingIdentity(proposal)}:${scopeIdentity(proposal.scope)}`
    if (!explicitScopes.has(key)) explicitScopes.set(key, proposal)
  }
  const expanded = [...projectProposals, ...explicitScopes.values()]

  const companyGroups = groupProjectProposals(projectProposals, (proposal) => proposal.companyIds[0] ?? null)
  for (const proposals of companyGroups.values()) {
    const companyId = proposals[0]?.companyIds[0]
    if (!companyId) continue
    const scope = { level: 'company' as const, companyId }
    if (explicitScopes.has(`${proposalGroupingIdentity(proposals[0])}:${scopeIdentity(scope)}`)) continue
    const aggregate = aggregateProposal(proposals, scope)
    if (meetsAggregationFloor(aggregate, 'company')) expanded.push(aggregate)
  }

  const industryGroups = groupProjectProposals(projectProposals, (proposal) => proposal.industryKeys[0] ?? null)
  for (const proposals of industryGroups.values()) {
    const industryKey = proposals[0]?.industryKeys[0]
    if (!industryKey) continue
    const scope = { level: 'industry' as const, industryKey }
    if (explicitScopes.has(`${proposalGroupingIdentity(proposals[0])}:${scopeIdentity(scope)}`)) continue
    const aggregate = aggregateProposal(proposals, scope)
    if (meetsAggregationFloor(aggregate, 'industry')) expanded.push(aggregate)
  }

  const globalGroups = groupProjectProposals(projectProposals, () => 'global')
  for (const proposals of globalGroups.values()) {
    const scope = { level: 'global' as const }
    if (explicitScopes.has(`${proposalGroupingIdentity(proposals[0])}:${scopeIdentity(scope)}`)) continue
    const aggregate = aggregateProposal(proposals, scope)
    if (meetsAggregationFloor(aggregate, 'global')) expanded.push(aggregate)
  }

  const deduped = new Map<string, DurationLearningRuntimeCandidateProposal>()
  for (const proposal of expanded) {
    const key = `${proposalIdentity(proposal)}:${scopeIdentity(proposal.scope)}`
    if (!deduped.has(key)) deduped.set(key, proposal)
  }
  return [...deduped.values()]
}

function rowIndustryKey(row: SourceRow, metadata: Record<string, unknown>) {
  for (const candidate of [
    row.industry_key,
    row.business_type,
    row.project_type,
    metadata.wizard_business_type,
    metadata.wizardBusinessType,
    metadata.businessType,
    metadata.business_type,
    record(metadata.projectGenerationFacts ?? metadata.project_generation_facts).businessType,
    record(metadata.projectGenerationFacts ?? metadata.project_generation_facts).business_type,
    metadata.projectTypeCode,
    metadata.project_type_code,
  ]) {
    const canonical = canonicalizeDurationLearningIndustryKey(candidate)
    if (canonical) return canonical
  }
  return ''
}

function hasProjectCompanyAuthority(row: SourceRow) {
  const hasAuthorityReadback = Object.prototype.hasOwnProperty.call(row, 'source_company_id')
    || Object.prototype.hasOwnProperty.call(row, 'project_company_id')
  if (!hasAuthorityReadback) return true
  const projectId = text(row.project_id)
  const sourceCompanyId = text(row.source_company_id)
  const projectCompanyId = text(row.project_company_id)
  return Boolean(
    projectId
    && projectCompanyId
    && (!sourceCompanyId || sourceCompanyId === projectCompanyId),
  )
}

function scopeFromRow(row: SourceRow, industryKey: string): DurationLearningRuntimeScope | null {
  const projectId = text(row.project_id)
  const companyId = text(row.company_id)
  const sourceScope = text(row.learning_scope ?? row.scope_level)
  if (sourceScope === 'global') return { level: 'global' }
  if (sourceScope === 'industry' && industryKey) return { level: 'industry', industryKey }
  if (projectId && companyId) return { level: 'project', companyId, projectId }
  if (companyId) return { level: 'company', companyId }
  return null
}

function evidenceRefs(value: unknown, fallback: string) {
  const source = record(value)
  return uniqueTexts([
    ...list(value),
    ...list(source.sourceEvidenceRefs),
    ...list(source.source_evidence_refs),
    ...list(source.evidenceRefs),
    ...list(source.evidence_refs),
    fallback,
  ])
}

function benchmarkProposalFromRow(row: SourceRow): DurationLearningRuntimeCandidateProposal | null {
  if (!hasProjectCompanyAuthority(row)) return null
  const metadata = record(row.metadata)
  const id = text(row.id)
  const artifactKey = text(row.benchmark_key)
  const industryKey = rowIndustryKey(row, metadata)
  const scope = scopeFromRow(row, industryKey)
  const p50Days = positiveNumber(row.p50_days)
  if (!id || !artifactKey || !scope || !p50Days) return null
  const p80Days = positiveNumber(row.p80_days) ?? p50Days
  const projectId = text(row.project_id)
  const companyId = text(row.company_id)
  return withAutomationDecision({
    proposalKey: `duration_benchmarks:${id}`,
    assetKey: 'base_duration_benchmark',
    artifactKey,
    scope,
    runtimePayload: {
      p50Days,
      p80Days,
      durationDayBasis: text(row.duration_day_basis),
    },
    sourceCandidateRefs: [`duration_benchmarks:${id}`],
    sourceEvidenceRefs: evidenceRefs(metadata, `duration_benchmarks:${id}:metadata`),
    sampleCount: nonNegativeInteger(row.sample_count),
    projectIds: uniqueTexts([projectId]),
    companyIds: uniqueTexts([companyId]),
    industryKeys: uniqueTexts([industryKey]),
    taskIds: uniqueTexts(list(metadata.taskIds ?? metadata.task_ids)),
    realOutcomeCount: nonNegativeInteger(metadata.realOutcomeCount ?? metadata.real_outcome_count ?? row.sample_count),
    replayCaseCount: nonNegativeInteger(metadata.replayCaseCount ?? metadata.replay_case_count ?? row.sample_count),
    observationWindowDays: nonNegativeInteger(metadata.observationWindowDays ?? metadata.observation_window_days),
    productionDaySamples: list(metadata.productionDaySamples ?? metadata.production_day_samples)
      .map(positiveNumber)
      .filter((value): value is number => value !== null),
    conflictCount: nonNegativeInteger(metadata.conflictCount ?? metadata.conflict_count),
    replayPassed: metadata.replayPassed !== false && metadata.replay_passed !== false,
    qualityModel: producerQualityModel('base_duration_benchmark', metadata),
    blockingReasons: text(row.duration_day_basis) === 'construction_production_day'
      ? []
      : ['benchmark_production_day_basis_required'],
    policyEvaluationRequired: true,
    automationEvidence: automationEvidenceFrom(metadata),
  })
}

function automationEvidenceFrom(source: Record<string, unknown>): DurationLearningAutomationEvidence {
  return {
    holdoutSampleCount: optionalNumber(source.holdoutSampleCount ?? source.holdout_sample_count),
    maeBefore: optionalNumber(source.maeBefore ?? source.mae_before),
    maeAfter: optionalNumber(source.maeAfter ?? source.mae_after),
    conflictRate: optionalNumber(source.conflictRate ?? source.conflict_rate),
    overcompensationRate: optionalNumber(source.overcompensationRate ?? source.overcompensation_rate),
    replayPassRate: optionalNumber(source.replayPassRate ?? source.replay_pass_rate),
    outcomeAcceptanceRate: optionalNumber(source.outcomeAcceptanceRate ?? source.outcome_acceptance_rate),
    qualityConsistencyRate: optionalNumber(source.qualityConsistencyRate ?? source.quality_consistency_rate),
    rollbackReady: typeof (source.rollbackReady ?? source.rollback_ready) === 'boolean'
      ? Boolean(source.rollbackReady ?? source.rollback_ready)
      : null,
    tenantScopeValid: typeof (source.tenantScopeValid ?? source.tenant_scope_valid) === 'boolean'
      ? Boolean(source.tenantScopeValid ?? source.tenant_scope_valid)
      : null,
    structuralMutation: source.structuralMutation === true || source.structural_mutation === true,
    exceptionalConflict: source.exceptionalConflict === true || source.exceptional_conflict === true,
  }
}

function seedAssetKey(seedType: string): DurationLearningRuntimeAssetKey | null {
  if (seedType === 'standard_work_duration') return 'standard_work_duration_seed'
  if (seedType === 'special_work_duration') return 'special_work_duration_seed'
  return null
}

function seedProposalFromRow(row: SourceRow): DurationLearningRuntimeCandidateProposal | null {
  if (!hasProjectCompanyAuthority(row)) return null
  const id = text(row.id)
  const seedType = text(row.seed_type)
  const assetKey = seedAssetKey(seedType)
  const artifactKey = text(row.stable_code)
  const payload = record(row.candidate_payload)
  const evidence = record(row.evidence_summary)
  const industryKey = rowIndustryKey(row, { ...evidence, ...payload })
  const scope = scopeFromRow(row, industryKey)
  if (!id || !assetKey || !artifactKey || !scope) return null
  const projectId = text(row.project_id)
  const companyId = text(row.company_id)
  return withAutomationDecision({
    proposalKey: `algorithm_seed_upgrade_candidates:${id}`,
    assetKey,
    artifactKey,
    scope,
    runtimePayload: {
      ...payload,
      stableCode: text(payload.stableCode ?? payload.stable_code) || artifactKey,
    },
    sourceCandidateRefs: [`algorithm_seed_upgrade_candidates:${id}`],
    sourceEvidenceRefs: evidenceRefs(evidence, `algorithm_seed_upgrade_candidates:${id}:evidence_summary`),
    sampleCount: nonNegativeInteger(row.sample_count),
    projectIds: uniqueTexts([projectId]),
    companyIds: uniqueTexts([companyId]),
    industryKeys: uniqueTexts([industryKey]),
    taskIds: uniqueTexts(list(evidence.taskIds ?? evidence.task_ids)),
    realOutcomeCount: nonNegativeInteger(evidence.realOutcomeCount ?? evidence.real_outcome_count),
    replayCaseCount: nonNegativeInteger(evidence.replayCaseCount ?? evidence.replay_case_count),
    observationWindowDays: nonNegativeInteger(evidence.observationWindowDays ?? evidence.observation_window_days),
    conflictCount: nonNegativeInteger(evidence.conflictCount ?? evidence.conflict_count),
    replayPassed: evidence.replayPassed !== false && evidence.replay_passed !== false,
    qualityModel: producerQualityModel(assetKey, { ...evidence, ...payload }),
    blockingReasons: uniqueTexts(list(evidence.blockingReasons ?? evidence.blocking_reasons)),
    policyEvaluationRequired: true,
    automationEvidence: automationEvidenceFrom({ ...evidence, ...payload }),
  })
}

function networkArtifactAndPayload(row: SourceRow) {
  const assetKey = text(row.asset_key) as DurationLearningRuntimeAssetKey
  const metadata = record(row.metadata)
  if (assetKey === 'special_work_duration_seed') {
    const templateId = text(metadata.template_id ?? metadata.templateId)
    return {
      artifactKey: templateId,
      payload: { nodes: list(metadata.duration_candidate_nodes ?? metadata.durationCandidateNodes) },
    }
  }
  if (assetKey === 'wbs_reference_days') {
    const templateId = text(metadata.template_id ?? metadata.templateId)
    return {
      artifactKey: templateId,
      payload: { nodes: list(metadata.nodes) },
    }
  }
  if (assetKey === 'dependency_rule_candidate') {
    const predecessorCode = text(metadata.predecessor_stable_code ?? metadata.predecessorStableCode)
    const successorCode = text(metadata.successor_stable_code ?? metadata.successorStableCode)
    const dependencyType = text(metadata.dependency_type ?? metadata.dependencyType).toUpperCase()
    return {
      artifactKey: predecessorCode && successorCode && dependencyType
        ? `${predecessorCode}->${successorCode}:${dependencyType}`
        : '',
      payload: {
        predecessorCode,
        successorCode,
        dependencyType,
        lagDays: finiteNumber(metadata.suggested_lag_days ?? metadata.suggestedLagDays),
        constructionCalendarBasis: metadata.construction_calendar ?? metadata.constructionCalendar ?? null,
      },
    }
  }
  if (assetKey === 'critical_path_rule_candidate') {
    const stableCodes = uniqueTexts([
      ...list(metadata.auto_task_stable_codes ?? metadata.autoTaskStableCodes),
      ...list(metadata.primary_chain_stable_codes ?? metadata.primaryChainStableCodes),
    ])
    return {
      artifactKey: stableCodes.length > 0 ? `critical-path:${payloadFingerprint({ stableCodes })}` : '',
      payload: { criticalStableCodes: stableCodes },
    }
  }
  return { artifactKey: '', payload: {} }
}

function networkProposalFromRow(row: SourceRow): DurationLearningRuntimeCandidateProposal | null {
  if (!hasProjectCompanyAuthority(row)) return null
  const assetKey = text(row.asset_key) as DurationLearningRuntimeAssetKey
  if (![
    'special_work_duration_seed',
    'wbs_reference_days',
    'dependency_rule_candidate',
    'critical_path_rule_candidate',
  ].includes(assetKey)) return null
  const id = text(row.id)
  const metadata = record(row.metadata)
  const industryKey = rowIndustryKey(row, metadata)
  const scope = scopeFromRow(row, industryKey)
  const { artifactKey, payload } = networkArtifactAndPayload(row)
  if (!id || !artifactKey || !scope) return null
  const projectId = text(row.project_id)
  const companyId = text(row.company_id)
  const outcomeStatus = text(row.outcome_status)
  const productionDayBasis = text(
    metadata.duration_day_unit
      ?? metadata.durationDayUnit
      ?? metadata.day_count_basis
      ?? metadata.dayCountBasis
      ?? metadata.reference_day_basis
      ?? metadata.referenceDayBasis
  ) === 'construction_production_day'
  const productionDayConversionReady = assetKey !== 'wbs_reference_days'
    || metadata.production_day_conversion_applied === true
    || metadata.productionDayConversionApplied === true
  const constructionCalendarReady = assetKey !== 'dependency_rule_candidate'
    || Boolean(metadata.construction_calendar ?? metadata.constructionCalendar)
  const blockingReasons = [
    ...(!productionDayBasis && assetKey !== 'critical_path_rule_candidate'
      ? ['construction_production_day_basis_required']
      : []),
    ...(!productionDayConversionReady ? ['wbs_reference_day_production_conversion_required'] : []),
    ...(!constructionCalendarReady ? ['dependency_construction_calendar_required'] : []),
  ]
  return withAutomationDecision({
    proposalKey: `duration_plan_network_outcomes:${id}`,
    assetKey,
    artifactKey,
    scope,
    runtimePayload: payload,
    sourceCandidateRefs: [`duration_plan_network_outcomes:${id}`],
    sourceEvidenceRefs: evidenceRefs(metadata, `duration_plan_network_outcomes:${id}`),
    sampleCount: nonNegativeInteger(
      metadata.sample_count
        ?? metadata.sample_task_count
        ?? metadata.generated_row_count
        ?? metadata.critical_task_count,
    ),
    projectIds: uniqueTexts([projectId, ...list(metadata.project_ids)]),
    companyIds: uniqueTexts([companyId]),
    industryKeys: uniqueTexts([industryKey]),
    taskIds: uniqueTexts([
      ...list(metadata.task_ids),
      ...list(metadata.source_task_ids),
      ...list(metadata.auto_task_ids),
      ...list(metadata.primary_chain_task_ids),
      ...list(metadata.runtime_publication_input_task_ids),
    ]),
    realOutcomeCount: nonNegativeInteger(
      metadata.real_outcome_count
        ?? metadata.realOutcomeCount
        ?? Number(outcomeStatus === 'accepted'),
    ),
    replayCaseCount: nonNegativeInteger(
      metadata.replay_case_count
        ?? metadata.replayCaseCount
        ?? metadata.sample_count
        ?? metadata.comparable_actual_date_count,
    ),
    observationWindowDays: nonNegativeInteger(metadata.observation_window_days),
    conflictCount: nonNegativeInteger(metadata.conflict_count) + Number(outcomeStatus === 'rejected'),
    replayPassed: outcomeStatus === 'accepted',
    qualityModel: producerQualityModel(assetKey, metadata),
    blockingReasons,
    policyEvaluationRequired: true,
    automationEvidence: automationEvidenceFrom(metadata),
  })
}

type SourceCollectionStreamResult = {
  rows: SourceRow[]
  positions: Array<readonly [string, DurationLearningRuntimeCollectionCursorPosition]>
}

export interface DurationLearningRuntimeCandidateBatch {
  candidates: DurationLearningRuntimeCandidateProposal[]
  nextCursorState: DurationLearningRuntimeCollectionCursorState
}

export interface DurationLearningRuntimeMonitoringBatch {
  candidates: DurationLearningRuntimeMonitoringCandidate[]
  nextCursorState: DurationLearningRuntimeCollectionCursorState
}

function cursorPositionFor(
  state: DurationLearningRuntimeCollectionCursorState,
  streamKey: string,
) {
  return normalizeCursorPosition(state.positions[streamKey])
}

function nextCursorStateWithPositions(
  state: DurationLearningRuntimeCollectionCursorState,
  positions: ReadonlyArray<readonly [string, DurationLearningRuntimeCollectionCursorPosition]>,
) {
  return normalizeCollectionCursorState({
    version: state.version,
    positions: {
      ...state.positions,
      ...Object.fromEntries(positions),
    },
  })
}

function scopeCursorKey(
  streamKey: string,
  artifactKey: string,
  scopeLevel: 'project' | 'company-selector' | 'company' | 'industry-selector' | 'industry' | 'global' | 'scope-artifact',
  scopeId = '*',
) {
  return [streamKey, artifactKey, scopeLevel, scopeId].join(SCOPE_CURSOR_SEPARATOR)
}

function advancedCursorPosition(
  current: DurationLearningRuntimeCollectionCursorPosition,
  lastGroupKey: string | null,
  wrapped = false,
): DurationLearningRuntimeCollectionCursorPosition {
  return {
    lastGroupKey: lastGroupKey || current.lastGroupKey,
    wrapCount: current.wrapCount + Number(wrapped),
  }
}

async function discoverSourceGroups(input: {
  queryExec: DurationLearningRuntimePublicationQueryExec
  streamKey: string
  cursorState: DurationLearningRuntimeCollectionCursorState
  discoverySql: string
  fallbackGroupKey: (row: SourceRow) => string
  cursorKey?: string
  limit?: number
}) {
  const cursorKey = input.cursorKey ?? input.streamKey
  const limit = input.limit ?? SOURCE_GROUP_LIMIT
  const current = cursorPositionFor(input.cursorState, cursorKey)
  const discover = async (after: string) => {
    const rows = await input.queryExec<SourceRow>(input.discoverySql, [after, limit])
    return uniqueTexts(rows.map((row) => row.collector_group_key ?? input.fallbackGroupKey(row)))
      .slice(0, limit)
  }
  let selectedGroupKeys = await discover(current.lastGroupKey ?? '')
  let wrapped = false
  if (selectedGroupKeys.length === 0 && current.lastGroupKey) {
    selectedGroupKeys = await discover('')
    wrapped = selectedGroupKeys.length > 0
  }
  if (selectedGroupKeys.length === 0) {
    return { selectedGroupKeys: [], cursorKey, position: current }
  }
  return {
    selectedGroupKeys,
    cursorKey,
    position: advancedCursorPosition(current, selectedGroupKeys.at(-1) ?? null, wrapped),
  }
}

function lastScopePageRow(rows: SourceRow[], target: string, artifactKey: string) {
  return rows
    .filter((row) => (
      text(row.collector_scope_target) === target
      && (text(row.collector_group_key) || artifactKey) === artifactKey
    ))
    .sort((left, right) => nonNegativeInteger(right.collector_scope_page_rank) - nonNegativeInteger(left.collector_scope_page_rank))[0]
}

async function collectSourceStream(input: {
  queryExec: DurationLearningRuntimePublicationQueryExec
  streamKey: string
  cursorState: DurationLearningRuntimeCollectionCursorState
  discoverySql: string
  historySql: string
  fallbackGroupKey: (row: SourceRow) => string
}): Promise<SourceCollectionStreamResult> {
  const discovery = await discoverSourceGroups(input)
  if (discovery.selectedGroupKeys.length === 0) {
    return { rows: [], positions: [[discovery.cursorKey, discovery.position]] }
  }
  const projectCursorByArtifact = Object.fromEntries(discovery.selectedGroupKeys.map((artifactKey) => [
    artifactKey,
    cursorPositionFor(input.cursorState, scopeCursorKey(input.streamKey, artifactKey, 'project')).lastGroupKey ?? '',
  ]))
  const queriedRows = await input.queryExec<SourceRow>(input.historySql, [
    discovery.selectedGroupKeys,
    projectCursorByArtifact,
    PROJECT_SCOPE_STREAM_BUDGET,
  ])
  const rows = queriedRows.slice(0, PROJECT_SCOPE_STREAM_BUDGET)
  const positions: Array<readonly [string, DurationLearningRuntimeCollectionCursorPosition]> = [
    [discovery.cursorKey, discovery.position],
  ]
  for (const artifactKey of discovery.selectedGroupKeys) {
    const cursorKey = scopeCursorKey(input.streamKey, artifactKey, 'project')
    const current = cursorPositionFor(input.cursorState, cursorKey)
    const last = lastScopePageRow(rows, 'project', artifactKey)
      ?? rows.filter((row) => input.fallbackGroupKey(row) === artifactKey).at(-1)
    if (!last) continue
    positions.push([cursorKey, advancedCursorPosition(
      current,
      text(last.project_id),
      last.collector_scope_wrapped === true,
    )])
  }
  return { rows, positions }
}

function benchmarkGroupKey(row: SourceRow) {
  return text(row.collector_group_key ?? row.benchmark_key)
}

function seedGroupKey(row: SourceRow) {
  return text(row.collector_group_key ?? row.stable_code)
}

function networkGroupKey(row: SourceRow) {
  return text(row.collector_group_key) || networkArtifactAndPayload(row).artifactKey
}

function projectScopeHistorySql(streamKey: string, eligibleCte: string) {
  return `/* duration-learning-collector:history:${streamKey} */
    with ${eligibleCte}, project_ranked as (
      select eligible.*,
             row_number() over (
               partition by collector_group_key, collector_project_key
               order by collector_sort_at desc, id desc
             ) as collector_project_history_rank
        from eligible
       where collector_group_key = any($1::text[])
         and collector_project_key <> ''
         and collector_company_key <> ''
    ), project_representatives as (
      select *
        from project_ranked
       where collector_project_history_rank = 1
    ), project_scope_ordered as (
      select project_representatives.*,
             row_number() over (
               partition by collector_group_key
               order by
                 case when collector_project_key > coalesce($2::jsonb ->> collector_group_key, '') then 0 else 1 end,
                 collector_project_key
             ) as artifact_project_round,
             coalesce($2::jsonb ->> collector_group_key, '') <> ''
               and collector_project_key <= coalesce($2::jsonb ->> collector_group_key, '') as collector_scope_wrapped
        from project_representatives
    ), project_scope_interleaved as (
      select project_scope_ordered.*,
             row_number() over (
               order by artifact_project_round, collector_group_key
             ) as stream_project_rank
        from project_scope_ordered
    )
    select project_scope_interleaved.*,
           'project'::text as collector_scope_target,
           collector_project_key as collector_scope_id,
           collector_project_key as collector_scope_cursor_value,
           artifact_project_round as collector_scope_page_rank
      from project_scope_interleaved
     where stream_project_rank <= $3
     order by stream_project_rank`
}

function scopeBucketSql(streamKey: string, eligibleCte: string) {
  return `/* duration-learning-collector:scope-buckets:${streamKey} */
    with ${eligibleCte}, project_ranked as (
      select eligible.*,
             row_number() over (
               partition by collector_group_key, collector_project_key
               order by collector_sort_at desc, id desc
             ) as collector_project_history_rank
        from eligible
       where collector_group_key = $1
         and collector_project_key <> ''
         and collector_company_key <> ''
    ), project_representatives as (
      select *
        from project_ranked
       where collector_project_history_rank = 1
    ), company_buckets as (
      select distinct collector_company_key
        from project_representatives
       where collector_company_key <> ''
    ), industry_buckets as (
      select distinct collector_industry_key
        from project_representatives
       where collector_industry_key <> ''
    ), selected_company as (
      select collector_company_key
        from company_buckets
       order by case when collector_company_key > $2 then 0 else 1 end, collector_company_key
       limit 1
    ), selected_industry as (
      select collector_industry_key
        from industry_buckets
       order by case when collector_industry_key > $3 then 0 else 1 end, collector_industry_key
       limit 1
    )
    select (select collector_company_key from selected_company) as selected_company_id,
           (select collector_industry_key from selected_industry) as selected_industry_key,
           coalesce($2 <> '' and (select collector_company_key from selected_company) <= $2, false) as company_selector_wrapped,
           coalesce($3 <> '' and (select collector_industry_key from selected_industry) <= $3, false) as industry_selector_wrapped`
}

function scopeBatchSql(streamKey: string, eligibleCte: string) {
  return `/* duration-learning-collector:scope-batches:${streamKey} */
    with ${eligibleCte}, project_ranked as (
      select eligible.*,
             row_number() over (
               partition by collector_group_key, collector_project_key
               order by collector_sort_at desc, id desc
             ) as collector_project_history_rank
        from eligible
       where collector_group_key = $1
         and collector_project_key <> ''
         and collector_company_key <> ''
    ), project_representatives as (
      select *
        from project_ranked
       where collector_project_history_rank = 1
    ), company_scope_ordered as (
      select id,
             collector_project_key,
             row_number() over (
               order by case when collector_project_key > $3 then 0 else 1 end, collector_project_key
             ) as page_rank,
             $3 <> '' and collector_project_key <= $3 as page_wrapped
        from project_representatives
       where collector_company_key = $2
    ), company_scope_page as (
      select id,
             'company'::text as scope_target,
             $2::text as scope_id,
             collector_project_key as cursor_value,
             page_rank,
             page_wrapped
        from company_scope_ordered
       where page_rank <= $7
    ), industry_scope_company_projects as (
      select project_representatives.*,
             row_number() over (
               partition by collector_company_key
               order by collector_project_key
             ) as company_project_rank,
             count(*) over (partition by collector_company_key) as company_project_count
        from project_representatives
       where collector_industry_key = $4
    ), industry_scope_rotated as (
      select industry_scope_company_projects.*,
             mod(company_project_rank - 1 + $5::bigint, company_project_count) as rotation_rank
        from industry_scope_company_projects
    ), industry_scope_diversity as (
      select id,
             row_number() over (
               order by rotation_rank, collector_company_key, collector_project_key
             ) as page_rank
        from industry_scope_rotated
    ), industry_scope_page as (
      select id,
             'industry'::text as scope_target,
             $4::text as scope_id,
             ($5::bigint + 1)::text as cursor_value,
             page_rank,
             false as page_wrapped
        from industry_scope_diversity
       where page_rank <= $8
    ), global_scope_company_projects as (
      select project_representatives.*,
             row_number() over (
               partition by collector_industry_key, collector_company_key
               order by collector_project_key
             ) as company_project_rank,
             count(*) over (
               partition by collector_industry_key, collector_company_key
             ) as company_project_count
        from project_representatives
    ), global_scope_rotated as (
      select global_scope_company_projects.*,
             mod(company_project_rank - 1 + $6::bigint, company_project_count) as rotation_rank
        from global_scope_company_projects
    ), global_scope_interleaved as (
      select global_scope_rotated.*,
             row_number() over (
               partition by rotation_rank, collector_industry_key
               order by collector_company_key, collector_project_key
             ) as industry_company_round
        from global_scope_rotated
    ), global_scope_diversity as (
      select id,
             row_number() over (
               order by rotation_rank, industry_company_round, collector_industry_key, collector_company_key, collector_project_key
             ) as page_rank
        from global_scope_interleaved
    ), global_scope_page as (
      select id,
             'global'::text as scope_target,
             'global'::text as scope_id,
             ($6::bigint + 1)::text as cursor_value,
             page_rank,
             false as page_wrapped
        from global_scope_diversity
       where page_rank <= $9
    ), selected_scope_rows as (
      select * from company_scope_page
      union all
      select * from industry_scope_page
      union all
      select * from global_scope_page
    )
    select project_representatives.*,
           selected_scope_rows.scope_target as collector_scope_target,
           selected_scope_rows.scope_id as collector_scope_id,
           selected_scope_rows.cursor_value as collector_scope_cursor_value,
           selected_scope_rows.page_rank as collector_scope_page_rank,
           selected_scope_rows.page_wrapped as collector_scope_wrapped
      from selected_scope_rows
      join project_representatives on project_representatives.id = selected_scope_rows.id
     order by collector_scope_target, collector_scope_page_rank`
}

function benchmarkEligibleCte() {
  const projectIndustrySql = durationLearningProjectIndustrySqlExpression('project')
  return `eligible as (
    select benchmark.*,
           benchmark.benchmark_key as collector_group_key,
           coalesce(benchmark.project_id::text, '') as collector_project_key,
           project.company_id::text as collector_company_key,
           project_classification.business_type as collector_industry_key,
           benchmark.company_id as source_company_id,
           project.company_id as project_company_id,
           project_classification.business_type as business_type,
           benchmark.updated_at as collector_sort_at
      from public.duration_benchmarks benchmark
      join public.projects project on project.id = benchmark.project_id
      cross join lateral (
        select ${projectIndustrySql} as business_type
      ) project_classification
     where benchmark.is_active = true
       and benchmark.is_current = false
       and benchmark.duration_day_basis = 'construction_production_day'
       and benchmark.metadata ->> 'runtime_publication_status' = 'candidate'
       and project.company_id is not null
       and (benchmark.company_id is null or benchmark.company_id = project.company_id)
  )`
}

function benchmarkDiscoverySql(streamKey: string) {
  return `/* duration-learning-collector:discover:${streamKey} */
    select distinct benchmark.benchmark_key as collector_group_key
      from public.duration_benchmarks benchmark
     where benchmark.is_active = true
       and benchmark.is_current = false
       and benchmark.duration_day_basis = 'construction_production_day'
       and benchmark.metadata ->> 'runtime_publication_status' = 'candidate'
       and benchmark.benchmark_key > $1
     order by collector_group_key
     limit $2`
}

function benchmarkHistorySql(streamKey: string) {
  return projectScopeHistorySql(streamKey, benchmarkEligibleCte())
}

function seedDiscoverySql(streamKey: string, seedType: string) {
  return `/* duration-learning-collector:discover:${streamKey} */
    select distinct candidate.stable_code as collector_group_key
      from public.algorithm_seed_upgrade_candidates candidate
     where candidate.seed_type = '${seedType}'
       and candidate.action_policy = 'auto_govern'
       and candidate.status in ('pending', 'candidate_only', 'auto_published')
       and candidate.stable_code > $1
     order by collector_group_key
     limit $2`
}

function seedEligibleCte(seedType: string) {
  const projectIndustrySql = durationLearningProjectIndustrySqlExpression('project')
  return `eligible as (
    select candidate.*,
           candidate.stable_code as collector_group_key,
           coalesce(candidate.project_id::text, '') as collector_project_key,
           project.company_id::text as collector_company_key,
           project_classification.business_type as collector_industry_key,
           candidate.company_id as source_company_id,
           project.company_id as project_company_id,
           project.company_id as resolved_company_id,
           project_classification.business_type as business_type,
           candidate.updated_at as collector_sort_at
      from public.algorithm_seed_upgrade_candidates candidate
      join public.projects project on project.id = candidate.project_id
      cross join lateral (
        select ${projectIndustrySql} as business_type
      ) project_classification
     where candidate.seed_type = '${seedType}'
       and candidate.action_policy = 'auto_govern'
       and candidate.status in ('pending', 'candidate_only', 'auto_published')
       and project.company_id is not null
       and (candidate.company_id is null or candidate.company_id = project.company_id)
  )`
}

function seedHistorySql(streamKey: string, seedType: string) {
  return projectScopeHistorySql(streamKey, seedEligibleCte(seedType))
}

function networkCollectorGroupExpression(assetKey: DurationLearningRuntimeAssetKey) {
  if (assetKey === 'special_work_duration_seed' || assetKey === 'wbs_reference_days') {
    return `coalesce(nullif(outcome.metadata ->> 'template_id', ''), nullif(outcome.metadata ->> 'templateId', ''), '')`
  }
  if (assetKey === 'dependency_rule_candidate') {
    return `concat(
      coalesce(outcome.metadata ->> 'predecessor_stable_code', outcome.metadata ->> 'predecessorStableCode', ''),
      '->',
      coalesce(outcome.metadata ->> 'successor_stable_code', outcome.metadata ->> 'successorStableCode', ''),
      ':',
      upper(coalesce(outcome.metadata ->> 'dependency_type', outcome.metadata ->> 'dependencyType', ''))
    )`
  }
  return `coalesce((
    select jsonb_agg(stable_code order by stable_code)::text
      from (
        select distinct stable_code
          from (
            select jsonb_array_elements_text(coalesce(outcome.metadata -> 'auto_task_stable_codes', '[]'::jsonb)) as stable_code
            union all
            select jsonb_array_elements_text(coalesce(outcome.metadata -> 'primary_chain_stable_codes', '[]'::jsonb)) as stable_code
          ) source_codes
         where btrim(stable_code) <> ''
      ) canonical_codes
  ), '[]')`
}

function networkEligibleCte(assetKey: DurationLearningRuntimeAssetKey) {
  const groupExpression = networkCollectorGroupExpression(assetKey)
  const projectIndustrySql = durationLearningProjectIndustrySqlExpression('project')
  return `eligible as (
    select outcome.*,
           ${groupExpression} as collector_group_key,
           coalesce(outcome.project_id::text, '') as collector_project_key,
           project.company_id::text as collector_company_key,
           project_classification.business_type as collector_industry_key,
           outcome.company_id as source_company_id,
           project.company_id as project_company_id,
           project.company_id as resolved_company_id,
           project_classification.business_type as business_type,
           outcome.observed_at as collector_sort_at
      from public.duration_plan_network_outcomes outcome
      join public.projects project on project.id = outcome.project_id
      cross join lateral (
        select ${projectIndustrySql} as business_type
      ) project_classification
     where outcome.asset_key = '${assetKey}'
       and outcome.outcome_status in ('accepted', 'weak', 'rejected')
       and project.company_id is not null
       and (outcome.company_id is null or outcome.company_id = project.company_id)
  )`
}

function networkDiscoverySql(streamKey: string, assetKey: DurationLearningRuntimeAssetKey) {
  return `/* duration-learning-collector:discover:${streamKey} */
    with ${networkEligibleCte(assetKey)}
    select distinct collector_group_key
      from eligible
     where collector_group_key <> ''
       and collector_group_key > $1
     order by collector_group_key
     limit $2`
}

function networkHistorySql(streamKey: string, assetKey: DurationLearningRuntimeAssetKey) {
  return projectScopeHistorySql(streamKey, networkEligibleCte(assetKey))
}

type SourceStreamDefinition = {
  streamKey: string
  discoverySql: string
  historySql: string
  scopeBucketsSql: string
  scopeBatchesSql: string
  fallbackGroupKey: (row: SourceRow) => string
  proposalFromRow: (row: SourceRow) => DurationLearningRuntimeCandidateProposal | null
  normalizeRow: (row: SourceRow) => SourceRow
}

function scopedProposalRows(
  rows: SourceRow[],
  definition: SourceStreamDefinition,
): DurationLearningRuntimeCandidateProposal[] {
  const proposals: DurationLearningRuntimeCandidateProposal[] = []
  for (const target of ['project', 'company', 'industry', 'global'] as const) {
    const sourceRows = rows.filter((row) => text(row.collector_scope_target) === target)
    const projectProposals = sourceRows
      .map((row) => definition.proposalFromRow(definition.normalizeRow({
        ...row,
        learning_scope: 'project',
        scope_level: 'project',
      })))
      .filter((proposal): proposal is DurationLearningRuntimeCandidateProposal => Boolean(proposal))
    if (target === 'project') {
      proposals.push(...projectProposals)
      continue
    }
    if (projectProposals.length === 0) continue
    const scopeId = text(sourceRows[0]?.collector_scope_id)
    const scope: DurationLearningRuntimeScope | null = target === 'company' && scopeId
      ? { level: 'company', companyId: scopeId }
      : target === 'industry' && scopeId
        ? { level: 'industry', industryKey: scopeId }
        : target === 'global'
          ? { level: 'global' }
          : null
    if (!scope) continue
    const aggregate = aggregateProposal(projectProposals, scope)
    if (meetsAggregationFloor(aggregate, target)) proposals.push(aggregate)
  }
  return proposals
}

async function collectScopeAggregateStream(input: {
  queryExec: DurationLearningRuntimePublicationQueryExec
  definition: SourceStreamDefinition
  cursorState: DurationLearningRuntimeCollectionCursorState
}) {
  const scopeArtifactCursorKey = scopeCursorKey(input.definition.streamKey, '*', 'scope-artifact')
  const discovery = await discoverSourceGroups({
    queryExec: input.queryExec,
    streamKey: input.definition.streamKey,
    cursorState: input.cursorState,
    discoverySql: input.definition.discoverySql,
    fallbackGroupKey: input.definition.fallbackGroupKey,
    cursorKey: scopeArtifactCursorKey,
    limit: 1,
  })
  const positions: Array<readonly [string, DurationLearningRuntimeCollectionCursorPosition]> = [
    [scopeArtifactCursorKey, discovery.position],
  ]
  const artifactKey = discovery.selectedGroupKeys[0]
  if (!artifactKey) return { candidates: [], positions }

  const companySelectorKey = scopeCursorKey(input.definition.streamKey, artifactKey, 'company-selector')
  const industrySelectorKey = scopeCursorKey(input.definition.streamKey, artifactKey, 'industry-selector')
  const companySelector = cursorPositionFor(input.cursorState, companySelectorKey)
  const industrySelector = cursorPositionFor(input.cursorState, industrySelectorKey)
  const bucketRows = await input.queryExec<SourceRow>(input.definition.scopeBucketsSql, [
    artifactKey,
    companySelector.lastGroupKey ?? '',
    industrySelector.lastGroupKey ?? '',
  ])
  const selectedCompanyId = text(bucketRows[0]?.selected_company_id)
  const selectedIndustryKey = text(bucketRows[0]?.selected_industry_key)
  if (selectedCompanyId) {
    positions.push([companySelectorKey, advancedCursorPosition(
      companySelector,
      selectedCompanyId,
      bucketRows[0]?.company_selector_wrapped === true,
    )])
  }
  if (selectedIndustryKey) {
    positions.push([industrySelectorKey, advancedCursorPosition(
      industrySelector,
      selectedIndustryKey,
      bucketRows[0]?.industry_selector_wrapped === true,
    )])
  }

  const companyCursorKey = selectedCompanyId
    ? scopeCursorKey(input.definition.streamKey, artifactKey, 'company', selectedCompanyId)
    : null
  const industryCursorKey = selectedIndustryKey
    ? scopeCursorKey(input.definition.streamKey, artifactKey, 'industry', selectedIndustryKey)
    : null
  const globalCursorKey = scopeCursorKey(input.definition.streamKey, artifactKey, 'global', 'global')
  const companyCursor = companyCursorKey
    ? cursorPositionFor(input.cursorState, companyCursorKey)
    : normalizeCursorPosition(null)
  const industryCursor = industryCursorKey
    ? cursorPositionFor(input.cursorState, industryCursorKey)
    : normalizeCursorPosition(null)
  const globalCursor = cursorPositionFor(input.cursorState, globalCursorKey)
  const queriedRows = await input.queryExec<SourceRow>(input.definition.scopeBatchesSql, [
    artifactKey,
    selectedCompanyId,
    companyCursor.lastGroupKey ?? '',
    selectedIndustryKey,
    nonNegativeInteger(industryCursor.lastGroupKey),
    nonNegativeInteger(globalCursor.lastGroupKey),
    COMPANY_SCOPE_PROJECT_LIMIT,
    INDUSTRY_SCOPE_PROJECT_LIMIT,
    GLOBAL_SCOPE_PROJECT_LIMIT,
  ])
  const rows = [
    ...queriedRows.filter((row) => text(row.collector_scope_target) === 'company').slice(0, COMPANY_SCOPE_PROJECT_LIMIT),
    ...queriedRows.filter((row) => text(row.collector_scope_target) === 'industry').slice(0, INDUSTRY_SCOPE_PROJECT_LIMIT),
    ...queriedRows.filter((row) => text(row.collector_scope_target) === 'global').slice(0, GLOBAL_SCOPE_PROJECT_LIMIT),
  ]

  const companyLast = lastScopePageRow(rows, 'company', artifactKey)
  if (companyCursorKey && companyLast) {
    positions.push([companyCursorKey, advancedCursorPosition(
      companyCursor,
      text(companyLast.collector_scope_cursor_value ?? companyLast.project_id),
      companyLast.collector_scope_wrapped === true,
    )])
  }
  const industryLast = lastScopePageRow(rows, 'industry', artifactKey)
  if (industryCursorKey && industryLast) {
    positions.push([industryCursorKey, advancedCursorPosition(
      industryCursor,
      text(industryLast.collector_scope_cursor_value) || String(nonNegativeInteger(industryCursor.lastGroupKey) + 1),
    )])
  }
  const globalLast = lastScopePageRow(rows, 'global', artifactKey)
  if (globalLast) {
    positions.push([globalCursorKey, advancedCursorPosition(
      globalCursor,
      text(globalLast.collector_scope_cursor_value) || String(nonNegativeInteger(globalCursor.lastGroupKey) + 1),
    )])
  }

  return {
    candidates: scopedProposalRows(rows, input.definition),
    positions,
  }
}

// workspace-isolation-system-job-approved: the singleton duration-learning lifecycle scheduler reads candidate evidence across tenants, preserves company/project lineage on every proposal, and only publishes scoped reversible overlays.
export async function collectDurationLearningRuntimeCandidateBatch(
  queryExec: DurationLearningRuntimePublicationQueryExec = executeSQL,
  cursorStateInput: DurationLearningRuntimeCollectionCursorState = emptyCollectionCursorState(),
): Promise<DurationLearningRuntimeCandidateBatch> {
  const cursorState = normalizeCollectionCursorState(cursorStateInput)
  const benchmarkStreamKey = 'benchmark:base_duration_benchmark'
  const seedStreams = [
    ['seed:standard_work_duration_seed', 'standard_work_duration'],
    ['seed:special_work_duration_seed', 'special_work_duration'],
  ] as const
  const networkStreams = [
    ['network:special_work_duration_seed', 'special_work_duration_seed'],
    ['network:wbs_reference_days', 'wbs_reference_days'],
    ['network:dependency_rule_candidate', 'dependency_rule_candidate'],
    ['network:critical_path_rule_candidate', 'critical_path_rule_candidate'],
  ] as const
  const definitions: SourceStreamDefinition[] = [
    {
      streamKey: benchmarkStreamKey,
      discoverySql: benchmarkDiscoverySql(benchmarkStreamKey),
      historySql: benchmarkHistorySql(benchmarkStreamKey),
      scopeBucketsSql: scopeBucketSql(benchmarkStreamKey, benchmarkEligibleCte()),
      scopeBatchesSql: scopeBatchSql(benchmarkStreamKey, benchmarkEligibleCte()),
      fallbackGroupKey: benchmarkGroupKey,
      proposalFromRow: benchmarkProposalFromRow,
      normalizeRow: (row) => ({ ...row, company_id: row.project_company_id ?? row.company_id }),
    },
    ...seedStreams.map(([streamKey, seedType]): SourceStreamDefinition => ({
      streamKey,
      discoverySql: seedDiscoverySql(streamKey, seedType),
      historySql: seedHistorySql(streamKey, seedType),
      scopeBucketsSql: scopeBucketSql(streamKey, seedEligibleCte(seedType)),
      scopeBatchesSql: scopeBatchSql(streamKey, seedEligibleCte(seedType)),
      fallbackGroupKey: seedGroupKey,
      proposalFromRow: seedProposalFromRow,
      normalizeRow: (row) => ({
        ...row,
        company_id: row.project_company_id ?? row.resolved_company_id ?? row.company_id,
      }),
    })),
    ...networkStreams.map(([streamKey, assetKey]): SourceStreamDefinition => ({
      streamKey,
      discoverySql: networkDiscoverySql(streamKey, assetKey),
      historySql: networkHistorySql(streamKey, assetKey),
      scopeBucketsSql: scopeBucketSql(streamKey, networkEligibleCte(assetKey)),
      scopeBatchesSql: scopeBatchSql(streamKey, networkEligibleCte(assetKey)),
      fallbackGroupKey: networkGroupKey,
      proposalFromRow: networkProposalFromRow,
      normalizeRow: (row) => ({
        ...row,
        company_id: row.project_company_id ?? row.resolved_company_id ?? row.company_id,
      }),
    })),
  ]
  const baseResults = await Promise.all(definitions.map((definition) => collectSourceStream({
    queryExec,
    streamKey: definition.streamKey,
    cursorState,
    discoverySql: definition.discoverySql,
    historySql: definition.historySql,
    fallbackGroupKey: definition.fallbackGroupKey,
  })))
  const scopeResults = await Promise.all(definitions.map((definition) => collectScopeAggregateStream({
    queryExec,
    definition,
    cursorState,
  })))
  const candidates = definitions.flatMap((definition, index) => [
    ...baseResults[index].rows
      .map((row) => definition.proposalFromRow(definition.normalizeRow(row)))
      .filter((proposal): proposal is DurationLearningRuntimeCandidateProposal => Boolean(proposal)),
    ...scopeResults[index].candidates,
  ])
  const deduped = new Map<string, DurationLearningRuntimeCandidateProposal>()
  for (const proposal of candidates) {
    const key = `${proposal.proposalKey}:${scopeIdentity(proposal.scope)}`
    if (!deduped.has(key)) deduped.set(key, proposal)
  }
  if (deduped.size > DURATION_LEARNING_RUNTIME_SWEEP_BUDGETS.candidateProposalsTotal) {
    throw new Error(`duration_learning_runtime_candidate_budget_exceeded:${deduped.size}`)
  }
  const expandedCount = expandDurationLearningRuntimeCandidateScopes([...deduped.values()]).length
  if (expandedCount > DURATION_LEARNING_RUNTIME_SWEEP_BUDGETS.expandedProposalsTotal) {
    throw new Error(`duration_learning_runtime_expanded_candidate_budget_exceeded:${expandedCount}`)
  }
  return {
    candidates: [...deduped.values()],
    nextCursorState: nextCursorStateWithPositions(cursorState, [
      ...baseResults.flatMap((result) => result.positions),
      ...scopeResults.flatMap((result) => result.positions),
    ]),
  }
}

export async function collectDurationLearningRuntimeCandidateProposals(
  queryExec: DurationLearningRuntimePublicationQueryExec = executeSQL,
) {
  return (await collectDurationLearningRuntimeCandidateBatch(queryExec)).candidates
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function monitoringScopeFromRow(row: SourceRow): DurationLearningRuntimeScope | null {
  const scopeLevel = text(row.scope_level)
  const companyId = text(row.company_id)
  const projectId = text(row.project_id)
  const industryKey = text(row.industry_key)
  if (scopeLevel === 'project') {
    return companyId && projectId ? { level: 'project', companyId, projectId } : null
  }
  if (scopeLevel === 'company') return companyId ? { level: 'company', companyId } : null
  if (scopeLevel === 'industry') return industryKey ? { level: 'industry', industryKey } : null
  return scopeLevel === 'global' ? { level: 'global' } : null
}

function monitoringCandidateFromRow(row: SourceRow): DurationLearningRuntimeMonitoringCandidate | null {
  const publicationKey = text(row.publication_key)
  const assetKey = text(row.asset_key) as DurationLearningRuntimeAssetKey
  const artifactKey = text(row.artifact_key)
  const publicationStage = text(row.publication_stage)
  const scope = monitoringScopeFromRow(row)
  if (!publicationKey || ![
    'base_duration_benchmark',
    'standard_work_duration_seed',
    'special_work_duration_seed',
    'wbs_reference_days',
    'dependency_rule_candidate',
    'critical_path_rule_candidate',
  ].includes(assetKey) || !artifactKey || !scope) return null
  if (publicationStage !== 'canary' && publicationStage !== 'stable') return null
  return {
    publicationKey,
    assetKey,
    artifactKey,
    publicationStage,
    scope,
    monitoringWindowHours: Math.max(1, nonNegativeInteger(row.monitoring_window_hours) || 72),
    monitoringElapsedHours: Math.max(0, finiteNumber(row.monitoring_elapsed_hours)),
    observedCount: nonNegativeInteger(row.observed_count),
    rejectedObservationCount: nonNegativeInteger(row.rejected_observation_count),
    acceptedOutcomeCount: nonNegativeInteger(row.accepted_outcome_count),
    weakOrRejectedOutcomeCount: nonNegativeInteger(row.weak_or_rejected_outcome_count),
    accuracySampleCount: nonNegativeInteger(row.accuracy_sample_count),
    maeBefore: optionalNumber(row.mae_before),
    maeAfter: optionalNumber(row.mae_after),
    regressionRate: optionalNumber(row.regression_rate),
    sourceAutomationDecision: record(row.automation_decision),
  }
}

function durationLearningRuntimeMonitoringCollectorSql() {
  return `/* duration-learning-monitor-collector */
    with active_publications as (
      select publication.publication_key,
             'monitor:active'::text as collector_stream_key,
             0 as collector_priority
        from public.duration_learning_runtime_publications publication
       where (
         (publication.publication_stage = 'canary' and publication.monitoring_status in ('pending', 'collecting', 'passed'))
         or (publication.publication_stage = 'stable' and publication.monitoring_status in ('pending', 'collecting'))
       )
         and publication.publication_key > $1
       order by publication.publication_key
       limit $3
    ), stable_publications as (
      select publication.publication_key,
             'monitor:stable'::text as collector_stream_key,
             1 as collector_priority
        from public.duration_learning_runtime_publications publication
       where publication.publication_stage = 'stable'
         and publication.monitoring_status = 'passed'
         and publication.publication_key > $2
       order by publication.publication_key
       limit $4
    ), selected_publications as (
      select * from active_publications
      union all
      select * from stable_publications
    )
    select publication.publication_key,
             publication.asset_key,
             publication.artifact_key,
             publication.publication_stage,
             publication.scope_level,
            publication.company_id,
            publication.project_id,
            publication.industry_key,
            publication.automation_decision,
            publication.monitoring_window_hours,
            extract(epoch from (now() - publication.monitoring_started_at)) / 3600.0 as monitoring_elapsed_hours,
            coalesce(observation.observed_count, 0) as observed_count,
            coalesce(observation.rejected_observation_count, 0) as rejected_observation_count,
            coalesce(network.accepted_outcome_count, 0) as accepted_outcome_count,
            coalesce(network.weak_or_rejected_outcome_count, 0) as weak_or_rejected_outcome_count,
            coalesce(accuracy.accuracy_sample_count, 0) as accuracy_sample_count,
             accuracy.mae_before,
             accuracy.mae_after,
             accuracy.regression_rate,
             selected.collector_stream_key,
             publication.publication_key as collector_group_key
       from selected_publications selected
       join public.duration_learning_runtime_publications publication
         on publication.publication_key = selected.publication_key
       left join lateral (
         select count(*) filter (where source.observation_status = 'observed') as observed_count,
                count(*) filter (where source.observation_status = 'rejected') as rejected_observation_count
           from (
             select source.observation_status,
                    source.observed_at
               from public.runtime_consumer_observations source
              where source.publication_key = publication.publication_key
                and source.asset_key = publication.asset_key
                and source.observation_context ->> 'artifactKey' = publication.artifact_key
                and source.source_evidence_refs ? (
                  'duration_learning_runtime_publications:' || publication.publication_key
                )
             union all
             select 'observed'::text as observation_status,
                    source.consumed_at as observed_at
               from public.duration_learning_runtime_consumptions source
              where source.publication_key = publication.publication_key
                and source.asset_key = publication.asset_key
                and source.artifact_key = publication.artifact_key
                and source.source_evidence_refs ? (
                  'duration_learning_runtime_publications:' || publication.publication_key
                )
           ) source
          where source.observed_at >= publication.monitoring_started_at
       ) observation on true
       left join lateral (
         select count(*) filter (where source.outcome_status = 'accepted') as accepted_outcome_count,
                count(*) filter (where source.outcome_status in ('weak', 'rejected')) as weak_or_rejected_outcome_count
           from public.duration_plan_network_outcomes source
          where source.publication_key = publication.publication_key
            and source.asset_key = publication.asset_key
            and source.observed_at >= publication.monitoring_started_at
            and (
              publication.asset_key not in (
                'special_work_duration_seed',
                'wbs_reference_days',
                'dependency_rule_candidate',
                'critical_path_rule_candidate'
              )
              or (
                source.metadata ->> 'runtime_publication_key' = publication.publication_key
                and source.metadata ->> 'runtime_publication_artifact_key' = publication.artifact_key
                and jsonb_typeof(source.metadata -> 'runtime_publication_input_task_ids') = 'array'
                and jsonb_array_length(source.metadata -> 'runtime_publication_input_task_ids') > 0
                and (
                  (
                    (
                      publication.asset_key = 'special_work_duration_seed'
                      or publication.asset_key = 'critical_path_rule_candidate'
                    )
                    and exists (
                      select 1
                        from public.runtime_consumer_observations exact_observation
                       where exact_observation.publication_key = publication.publication_key
                         and exact_observation.asset_key = publication.asset_key
                         and exact_observation.observation_status = 'observed'
                         and exact_observation.observed_at >= publication.monitoring_started_at
                         and exact_observation.observation_context ->> 'artifactKey' = publication.artifact_key
                         and exact_observation.observation_context ->> 'projectId' = source.project_id::text
                         and exact_observation.observation_context -> 'inputTaskIds'
                           = source.metadata -> 'runtime_publication_input_task_ids'
                         and exact_observation.source_evidence_refs ? (
                           'duration_learning_runtime_publications:' || publication.publication_key
                         )
                    )
                  )
                  or (
                    publication.asset_key in ('wbs_reference_days', 'dependency_rule_candidate')
                    and exists (
                      select 1
                        from (
                          select coalesce(
                                   jsonb_agg(consumed_input.task_id order by consumed_input.task_id),
                                   '[]'::jsonb
                                 ) as input_task_ids
                            from (
                              select distinct consumption_input.task_id
                                from public.duration_learning_runtime_consumptions exact_consumption
                                cross join lateral jsonb_array_elements_text(
                                  case
                                    when publication.asset_key = 'dependency_rule_candidate'
                                    then coalesce(
                                      exact_consumption.consumption_context -> 'inputTaskIds',
                                      jsonb_build_array(exact_consumption.task_id::text)
                                    )
                                    else jsonb_build_array(exact_consumption.task_id::text)
                                  end
                                ) as consumption_input(task_id)
                               where exact_consumption.publication_key = publication.publication_key
                                 and exact_consumption.asset_key = publication.asset_key
                                 and exact_consumption.artifact_key = publication.artifact_key
                                 and exact_consumption.company_id = source.company_id
                                 and exact_consumption.project_id = source.project_id
                                 and exact_consumption.consumed_at >= publication.monitoring_started_at
                                 and exact_consumption.source_evidence_refs ? (
                                   'duration_learning_runtime_publications:' || publication.publication_key
                                 )
                                 and consumption_input.task_id is not null
                                 and consumption_input.task_id <> ''
                            ) consumed_input
                        ) exact_consumed
                        cross join lateral (
                          select coalesce(
                                   jsonb_agg(outcome_input.task_id order by outcome_input.task_id),
                                   '[]'::jsonb
                                 ) as input_task_ids
                            from (
                              select distinct metadata_input.task_id
                                from jsonb_array_elements_text(
                                  source.metadata -> 'runtime_publication_input_task_ids'
                                ) as metadata_input(task_id)
                            ) outcome_input
                        ) exact_outcome
                       where exact_consumed.input_task_ids = exact_outcome.input_task_ids
                         and jsonb_array_length(exact_consumed.input_task_ids) > 0
                    )
                  )
                )
              )
            )
       ) network on true
       left join lateral (
         select count(*) as accuracy_sample_count,
                avg(source.baseline_absolute_error_days) as mae_before,
                avg(source.absolute_error_days) as mae_after,
                avg(case
                  when source.baseline_absolute_error_days is not null
                    and source.absolute_error_days > source.baseline_absolute_error_days
                  then 1.0 else 0.0 end) as regression_rate
           from public.duration_algorithm_accuracy_events source
          where source.backtest_status = 'backtested'
            and source.backtested_at >= publication.monitoring_started_at
            and (
              publication.publication_key in (
                source.prediction_context ->> 'runtimePublicationKey',
                source.prediction_context ->> 'runtime_publication_key',
                source.prediction_context ->> 'publicationKey',
                source.prediction_context ->> 'publication_key'
              )
              or source.prediction_context -> 'runtimePublicationKeys' ? publication.publication_key
              or exists (
                select 1
                  from jsonb_array_elements(
                    coalesce(
                      source.actual_context -> 'durationLearningRuntimeConsumptions',
                      source.actual_context -> 'duration_learning_runtime_consumptions',
                      '[]'::jsonb
                    )
                  ) consumption
                 where consumption ->> 'publicationKey' = publication.publication_key
                   and consumption ->> 'assetKey' = publication.asset_key
                   and consumption ->> 'artifactKey' = publication.artifact_key
              )
            )
       ) accuracy on true
      order by selected.collector_priority, publication.publication_key`
}

function uniqueMonitoringRows(rows: SourceRow[]) {
  const byKey = new Map<string, SourceRow>()
  for (const row of rows) {
    const key = text(row.publication_key)
    if (key && !byKey.has(key)) byKey.set(key, row)
  }
  return [...byKey.values()].sort((left, right) => {
    const priority = Number(text(left.collector_stream_key) === 'monitor:stable')
      - Number(text(right.collector_stream_key) === 'monitor:stable')
    return priority || text(left.publication_key).localeCompare(text(right.publication_key))
  })
}

// workspace-isolation-system-job-approved: the singleton duration-learning lifecycle scheduler measures scoped runtime publications across tenants; results update only the matching publication_key and never return tenant rows to a request.
export async function collectDurationLearningRuntimeMonitoringBatch(
  queryExec: DurationLearningRuntimePublicationQueryExec = executeSQL,
  cursorStateInput: DurationLearningRuntimeCollectionCursorState = emptyCollectionCursorState(),
): Promise<DurationLearningRuntimeMonitoringBatch> {
  const cursorState = normalizeCollectionCursorState(cursorStateInput)
  const activeKey = 'monitor:active'
  const stableKey = 'monitor:stable'
  const activePosition = cursorPositionFor(cursorState, activeKey)
  const stablePosition = cursorPositionFor(cursorState, stableKey)
  const runQuery = (activeAfter: string, stableAfter: string) => queryExec<SourceRow>(
    durationLearningRuntimeMonitoringCollectorSql(),
    [activeAfter, stableAfter, ACTIVE_MONITORING_LIMIT, STABLE_MONITORING_LIMIT],
  )
  const initialRows = await runQuery(activePosition.lastGroupKey ?? '', stablePosition.lastGroupKey ?? '')
  const initialStreams = new Set(initialRows.map((row) => text(row.collector_stream_key)).filter(Boolean))
  const wrapActive = Boolean(activePosition.lastGroupKey) && !initialStreams.has(activeKey)
  const wrapStable = Boolean(stablePosition.lastGroupKey) && !initialStreams.has(stableKey)
  const wrappedRows = wrapActive || wrapStable
    ? await runQuery(
        wrapActive ? '' : activePosition.lastGroupKey ?? '',
        wrapStable ? '' : stablePosition.lastGroupKey ?? '',
      )
    : []
  const rows = uniqueMonitoringRows([...initialRows, ...wrappedRows])
  const groupKeysByStream = new Map<string, string[]>()
  for (const row of rows) {
    const streamKey = text(row.collector_stream_key)
    const groupKey = text(row.collector_group_key ?? row.publication_key)
    if (!streamKey || !groupKey) continue
    const keys = groupKeysByStream.get(streamKey) ?? []
    keys.push(groupKey)
    groupKeysByStream.set(streamKey, uniqueTexts(keys))
  }
  const nextPosition = (
    streamKey: string,
    current: DurationLearningRuntimeCollectionCursorPosition,
    wrapped: boolean,
  ): DurationLearningRuntimeCollectionCursorPosition => {
    const keys = groupKeysByStream.get(streamKey) ?? []
    return keys.length === 0
      ? current
      : {
          lastGroupKey: keys.at(-1) ?? current.lastGroupKey,
          wrapCount: current.wrapCount + Number(wrapped),
        }
  }
  return {
    candidates: rows
      .map(monitoringCandidateFromRow)
      .filter((candidate): candidate is DurationLearningRuntimeMonitoringCandidate => Boolean(candidate)),
    nextCursorState: nextCursorStateWithPositions(cursorState, [
      [activeKey, nextPosition(activeKey, activePosition, wrapActive)],
      [stableKey, nextPosition(stableKey, stablePosition, wrapStable)],
    ]),
  }
}

export async function collectDurationLearningRuntimeMonitoringCandidates(
  queryExec: DurationLearningRuntimePublicationQueryExec = executeSQL,
) {
  return (await collectDurationLearningRuntimeMonitoringBatch(queryExec)).candidates
}

function emptySweepResult(): DurationLearningRuntimeLifecycleSweepResult {
  return {
    candidateCount: 0,
    expandedCandidateCount: 0,
    canaryPublished: 0,
    candidateCheckpointReused: 0,
    candidateCollecting: 0,
    manualFallback: 0,
    monitoringPending: 0,
    monitoringPassed: 0,
    monitoringFailed: 0,
    stablePromoted: 0,
    stablePromotionReused: 0,
    rollbackExecuted: 0,
    rollbackReused: 0,
    failed: 0,
    failureRefs: [],
    collectionCursorAdvanced: false,
  }
}

function proposalCanEnterCanary(proposal: DurationLearningRuntimeCandidateProposal) {
  return proposal.sampleCount > 0
    && proposal.replayPassed
    && proposal.sourceCandidateRefs.length > 0
    && proposal.sourceEvidenceRefs.length > 0
    && Object.keys(proposal.runtimePayload).length > 0
    && (proposal.blockingReasons?.length ?? 0) === 0
    && proposal.policyEvaluationRequired === true
    && proposal.automationDecision?.autoPromotionAllowed === true
}

function publicationKeyFor(proposal: DurationLearningRuntimeCandidateProposal) {
  const digest = hashDurationContextPolicyLearningValue({
    proposalKey: proposal.proposalKey,
    assetKey: proposal.assetKey,
    artifactKey: proposal.artifactKey,
    scope: proposal.scope,
    runtimePayload: canonicalValue(proposal.runtimePayload),
    sourceCandidateRefs: uniqueTexts(proposal.sourceCandidateRefs),
    sourceEvidenceRefs: uniqueTexts(proposal.sourceEvidenceRefs),
  }).slice(0, 32)
  return `duration_learning_runtime:${proposal.assetKey}:${digest}`
}

function buildRuntimePublicationCheckpointIdentity(
  proposal: DurationLearningRuntimeCandidateProposal,
  publicationKey: string,
) {
  return buildDurationContextPolicyLearningOperationIdentity({
    scheduledWindow: 'duration-learning-runtime-publication',
    projectIds: proposal.projectIds,
    inputFactDigest: publicationKey,
    learnerVersion: 'duration-learning-runtime-lifecycle-v1',
  })
}

function buildRuntimePublicationCheckpointInput(
  proposal: DurationLearningRuntimeCandidateProposal,
  publicationKey: string,
) {
  return {
    publicationKey,
    assetKey: proposal.assetKey,
    artifactKey: proposal.artifactKey,
    scope: proposal.scope,
    runtimePayload: canonicalValue(proposal.runtimePayload),
    sourceCandidateRefs: uniqueTexts(proposal.sourceCandidateRefs),
    sourceEvidenceRefs: uniqueTexts(proposal.sourceEvidenceRefs),
  }
}

type MonitoringEvaluation = {
  status: 'pending' | 'passed' | 'failed'
  reasons: string[]
  metrics: Record<string, unknown>
}

function evaluateMonitoring(candidate: DurationLearningRuntimeMonitoringCandidate): MonitoringEvaluation {
  const structural = STRUCTURAL_ASSET_KEYS.has(candidate.assetKey)
  const totalObservations = candidate.observedCount + candidate.rejectedObservationCount
  const totalOutcomes = candidate.acceptedOutcomeCount + candidate.weakOrRejectedOutcomeCount
  const rejectedRate = totalObservations > 0
    ? candidate.rejectedObservationCount / totalObservations
    : 0
  const weakOrRejectedRate = totalOutcomes > 0
    ? candidate.weakOrRejectedOutcomeCount / totalOutcomes
    : 0
  const reasons = [
    ...(candidate.maeBefore !== null && candidate.maeAfter !== null && candidate.maeAfter > candidate.maeBefore
      ? ['mae_regression_detected']
      : []),
    ...(candidate.regressionRate !== null && candidate.regressionRate > 0.05
      ? ['regression_rate_exceeds_limit']
      : []),
    ...(rejectedRate > 0.05 ? ['runtime_rejection_rate_exceeds_limit'] : []),
    ...(structural && weakOrRejectedRate > 0.05 ? ['structural_outcome_conflict_rate_exceeds_limit'] : []),
  ]
  const metrics = {
    observedCount: candidate.observedCount,
    rejectedObservationCount: candidate.rejectedObservationCount,
    acceptedOutcomeCount: candidate.acceptedOutcomeCount,
    weakOrRejectedOutcomeCount: candidate.weakOrRejectedOutcomeCount,
    accuracySampleCount: candidate.accuracySampleCount,
    maeBefore: candidate.maeBefore,
    maeAfter: candidate.maeAfter,
    regressionRate: candidate.regressionRate,
    rejectedRate,
    weakOrRejectedRate,
    runtimeConflictRate: Math.max(rejectedRate, structural ? weakOrRejectedRate : 0),
  }
  if (reasons.length > 0) return { status: 'failed', reasons, metrics }
  if (candidate.monitoringElapsedHours < candidate.monitoringWindowHours) {
    return { status: 'pending', reasons: ['monitoring_window_not_elapsed'], metrics }
  }
  const measured = structural
    ? candidate.acceptedOutcomeCount >= 5
    : candidate.observedCount >= 5
      && candidate.accuracySampleCount >= 5
      && candidate.maeBefore !== null
      && candidate.maeAfter !== null
  return measured
    ? { status: 'passed', reasons: [], metrics }
    : { status: 'pending', reasons: ['measured_monitoring_evidence_insufficient'], metrics }
}

function stableAutomationDecision(
  candidate: DurationLearningRuntimeMonitoringCandidate,
  monitoringMetrics: Record<string, unknown>,
) {
  const sourceDecision = record(candidate.sourceAutomationDecision)
  const sourceObserved = record(sourceDecision.observed)
  const sourceEvidence = record(
    sourceDecision.sourceAutomationEvidence
      ?? sourceDecision.source_automation_evidence
      ?? sourceDecision.automationEvidence
      ?? sourceDecision.automation_evidence,
  )
  const experienceTierValue = text(sourceDecision.experienceTier ?? sourceDecision.experience_tier)
  const experienceTier: DurationLearningExperienceTier = ['T1', 'T2', 'T3'].includes(experienceTierValue)
    ? experienceTierValue as DurationLearningExperienceTier
    : STRUCTURAL_ASSET_KEYS.has(candidate.assetKey) ? 'T3' : 'T2'
  const factSourceValue = text(sourceDecision.factSource ?? sourceDecision.fact_source)
  const factSource: DurationLearningFactSource = [
    'actual_outcome',
    'behavioral_change',
    'replay',
    'hybrid',
  ].includes(factSourceValue)
    ? factSourceValue as DurationLearningFactSource
    : candidate.assetKey === 'base_duration_benchmark' ? 'actual_outcome' : 'hybrid'
  const totalPostPublicationOutcomes = candidate.accuracySampleCount
    + candidate.acceptedOutcomeCount
    + candidate.weakOrRejectedOutcomeCount
  const stableFactSource: DurationLearningFactSource = totalPostPublicationOutcomes > 0
    && (factSource === 'replay' || factSource === 'behavioral_change')
    ? 'hybrid'
    : factSource
  const sourceObservationWindowDays = nonNegativeInteger(
    sourceObserved.observationWindowDays ?? sourceObserved.observation_window_days,
  )
  const postPublicationObservationDays = Math.floor(candidate.monitoringElapsedHours / 24)

  return evaluateDurationLearningAssetAutomationPolicy({
    experienceTier,
    reuseScope: candidate.scope.level,
    factSource: stableFactSource,
    targetStage: 'stable',
    qualityModel: QUALITY_MODEL_BY_ASSET[candidate.assetKey],
    evidence: {
      validChangeCount: nonNegativeInteger(
        sourceObserved.validChangeCount ?? sourceObserved.valid_change_count,
      ),
      distinctTaskCount: nonNegativeInteger(
        sourceObserved.distinctTaskCount ?? sourceObserved.distinct_task_count,
      ),
      distinctProjectCount: nonNegativeInteger(
        sourceObserved.distinctProjectCount ?? sourceObserved.distinct_project_count,
      ),
      distinctCompanyCount: nonNegativeInteger(
        sourceObserved.distinctCompanyCount ?? sourceObserved.distinct_company_count,
      ),
      realOutcomeCount: nonNegativeInteger(
        sourceObserved.realOutcomeCount ?? sourceObserved.real_outcome_count,
      ) + totalPostPublicationOutcomes,
      replayCaseCount: nonNegativeInteger(
        sourceObserved.replayCaseCount ?? sourceObserved.replay_case_count,
      ),
      observationWindowDays: sourceObservationWindowDays + postPublicationObservationDays,
      holdoutSampleCount: nonNegativeInteger(
        sourceObserved.holdoutSampleCount
          ?? sourceObserved.holdout_sample_count
          ?? sourceEvidence.holdoutSampleCount
          ?? sourceEvidence.holdout_sample_count,
      ) + candidate.accuracySampleCount,
      maeBefore: optionalNumber(monitoringMetrics.maeBefore),
      maeAfter: optionalNumber(monitoringMetrics.maeAfter),
      conflictRate: optionalNumber(monitoringMetrics.runtimeConflictRate),
      overcompensationRate: optionalNumber(
        sourceObserved.overcompensationRate
          ?? sourceObserved.overcompensation_rate
          ?? sourceEvidence.overcompensationRate
          ?? sourceEvidence.overcompensation_rate,
      ),
      replayPassRate: optionalNumber(
        sourceObserved.replayPassRate
          ?? sourceObserved.replay_pass_rate
          ?? sourceEvidence.replayPassRate
          ?? sourceEvidence.replay_pass_rate,
      ),
      outcomeAcceptanceRate: optionalNumber(
        sourceObserved.outcomeAcceptanceRate
          ?? sourceObserved.outcome_acceptance_rate
          ?? sourceEvidence.outcomeAcceptanceRate
          ?? sourceEvidence.outcome_acceptance_rate,
      ),
      qualityConsistencyRate: optionalNumber(
        sourceObserved.qualityConsistencyRate
          ?? sourceObserved.quality_consistency_rate
          ?? sourceEvidence.qualityConsistencyRate
          ?? sourceEvidence.quality_consistency_rate,
      ),
      rollbackReady: typeof (sourceObserved.rollbackReady ?? sourceObserved.rollback_ready) === 'boolean'
        ? Boolean(sourceObserved.rollbackReady ?? sourceObserved.rollback_ready)
        : typeof (sourceEvidence.rollbackReady ?? sourceEvidence.rollback_ready) === 'boolean'
          ? Boolean(sourceEvidence.rollbackReady ?? sourceEvidence.rollback_ready)
          : null,
      tenantScopeValid: typeof (sourceObserved.tenantScopeValid ?? sourceObserved.tenant_scope_valid) === 'boolean'
        ? Boolean(sourceObserved.tenantScopeValid ?? sourceObserved.tenant_scope_valid)
        : typeof (sourceEvidence.tenantScopeValid ?? sourceEvidence.tenant_scope_valid) === 'boolean'
          ? Boolean(sourceEvidence.tenantScopeValid ?? sourceEvidence.tenant_scope_valid)
          : null,
      structuralMutation: sourceEvidence.structuralMutation === true
        || sourceEvidence.structural_mutation === true,
      recentRollback: sourceEvidence.recentRollback === true
        || sourceEvidence.recent_rollback === true,
      exceptionalConflict: sourceEvidence.exceptionalConflict === true
        || sourceEvidence.exceptional_conflict === true,
    },
  })
}

export async function runDurationLearningRuntimeLifecycleSweep(
  input: RunDurationLearningRuntimeLifecycleSweepInput = {},
) {
  const queryExec = input.queryExec ?? executeSQL
  const persistPublication = input.persistPublication ?? persistDurationLearningRuntimePublication
  const checkpointStore = input.checkpointStore === undefined
    ? input.candidateProvider || input.persistPublication
      ? null
      : createDatabaseDurationContextPolicyLearningCheckpointStore(queryExec)
    : input.checkpointStore
  const checkpointOwnerId = text(input.checkpointOwnerId)
    || `duration-learning-runtime-lifecycle:${process.env.HOSTNAME ?? 'local'}:${process.pid}`
  const recordImpact = input.recordImpact ?? recordDurationLearningRuntimeImpact
  const promoteCanary = input.promoteCanary ?? promoteDurationLearningRuntimeCanary
  const rollbackPublication = input.rollbackPublication ?? rollbackDurationLearningRuntimePublication
  const observedAt = input.observedAt ?? new Date().toISOString()
  const result = emptySweepResult()
  const collectionCursorStore = input.collectionCursorStore === undefined
    ? input.candidateProvider || input.monitoringProvider
      ? null
      : createDatabaseDurationLearningRuntimeCollectionCursorStore(queryExec)
    : input.collectionCursorStore
  const addFailure = (
    phase: DurationLearningRuntimeLifecycleFailureRef['phase'],
    reference: string,
    error: unknown,
  ) => {
    result.failed += 1
    result.failureRefs.push({
      phase,
      reference,
      message: error instanceof Error ? error.message : String(error),
    })
  }
  const operationBlockedError = (operation: string, response: { reasons?: readonly string[] }) => new Error(
    `${operation}_blocked:${(response.reasons ?? []).join(',') || 'unknown'}`,
  )

  let cursorState = emptyCollectionCursorState()
  if (collectionCursorStore) {
    try {
      cursorState = await collectionCursorStore.load()
    } catch (error) {
      addFailure('collection_cursor', COLLECTION_CURSOR_OPERATION_ID, error)
      return result
    }
  }
  let nextCursorState = normalizeCollectionCursorState(cursorState)
  let candidates: DurationLearningRuntimeCandidateProposal[] = []
  try {
    if (input.candidateProvider) {
      candidates = await input.candidateProvider()
    } else {
      const batch = await collectDurationLearningRuntimeCandidateBatch(queryExec, cursorState)
      candidates = batch.candidates
      nextCursorState = nextCursorStateWithPositions(
        nextCursorState,
        Object.entries(batch.nextCursorState.positions),
      )
    }
  } catch (error) {
    addFailure('candidate_collection', 'duration-learning-runtime-candidates', error)
  }
  let monitoringCandidates: DurationLearningRuntimeMonitoringCandidate[] = []
  try {
    if (input.monitoringProvider) {
      monitoringCandidates = await input.monitoringProvider()
    } else {
      const batch = await collectDurationLearningRuntimeMonitoringBatch(queryExec, cursorState)
      monitoringCandidates = batch.candidates
      nextCursorState = nextCursorStateWithPositions(nextCursorState, MONITORING_CURSOR_STREAM_KEYS.map((streamKey) => [
        streamKey,
        cursorPositionFor(batch.nextCursorState, streamKey),
      ]))
    }
  } catch (error) {
    addFailure('monitoring_collection', 'duration-learning-runtime-monitoring', error)
  }
  const expanded = expandDurationLearningRuntimeCandidateScopes(candidates)
  result.candidateCount = candidates.length
  result.expandedCandidateCount = expanded.length

  for (const proposal of expanded) {
    try {
      if (proposal.conflictCount > 0) {
        result.manualFallback += 1
        continue
      }
      if (proposal.policyEvaluationRequired && proposal.automationDecision?.manualReviewRequired) {
        result.manualFallback += 1
        continue
      }
      if (!proposalCanEnterCanary(proposal)) {
        result.candidateCollecting += 1
        continue
      }
      const publicationKey = publicationKeyFor(proposal)
      const publicationInput: PersistDurationLearningRuntimePublicationInput = {
        queryExec,
        publicationKey,
        assetKey: proposal.assetKey,
        artifactKey: proposal.artifactKey,
        scope: proposal.scope,
        stage: 'canary',
        runtimePayload: proposal.runtimePayload,
        sourceCandidateRefs: proposal.sourceCandidateRefs,
        sourceEvidenceRefs: proposal.sourceEvidenceRefs,
        automationDecision: {
          ...(proposal.automationDecision ?? {}),
          sourceAutomationEvidence: proposal.automationEvidence ?? null,
          decision: 'auto_canary',
          proposalKey: proposal.proposalKey,
          sampleCount: proposal.sampleCount,
          projectIds: proposal.projectIds,
          companyIds: proposal.companyIds,
          industryKeys: proposal.industryKeys,
          replayPassed: proposal.replayPassed,
        },
        trafficPercent: proposal.scope.level === 'project' ? 20 : 5,
        monitoringWindowHours: STRUCTURAL_ASSET_KEYS.has(proposal.assetKey) ? 168 : 72,
        publishedAt: observedAt,
      }
      if (checkpointStore) {
        const checkpointed = await executeDurationContextPolicyLearningStage({
          identity: buildRuntimePublicationCheckpointIdentity(proposal, publicationKey),
          stage: 'runtime_publication',
          stageInput: buildRuntimePublicationCheckpointInput(proposal, publicationKey),
          ownerId: checkpointOwnerId,
          store: checkpointStore,
          execute: async () => {
            const publication = await persistPublication(publicationInput)
            if (publication.status !== 'published') {
              throw new Error(`duration_learning_runtime_publication_blocked:${publication.reasons.join(',')}`)
            }
            return publication
          },
        })
        if (checkpointed.disposition === 'reused') result.candidateCheckpointReused += 1
        else result.canaryPublished += 1
        continue
      }
      const publication = await persistPublication(publicationInput)
      if (publication.status === 'published') result.canaryPublished += 1
      else result.candidateCollecting += 1
    } catch (error) {
      addFailure('candidate_publication', proposal.proposalKey, error)
    }
  }

  for (const candidate of monitoringCandidates) {
    try {
      const evaluation = evaluateMonitoring(candidate)
      if (evaluation.status === 'pending') {
        const impact = await recordImpact({
          queryExec,
          publicationKey: candidate.publicationKey,
          monitoringStatus: 'collecting',
          metrics: { ...evaluation.metrics, reasonCodes: evaluation.reasons },
          observedAt,
        })
        if (impact.status !== 'impact_recorded') throw operationBlockedError('duration_learning_runtime_impact', impact)
        result.monitoringPending += 1
        continue
      }
      if (evaluation.status === 'failed') {
        const impact = await recordImpact({
          queryExec,
          publicationKey: candidate.publicationKey,
          monitoringStatus: 'failed',
          metrics: { ...evaluation.metrics, reasonCodes: evaluation.reasons },
          observedAt,
        })
        const rollback = await rollbackPublication({
          queryExec,
          publicationKey: candidate.publicationKey,
          assetKey: candidate.assetKey,
          artifactKey: candidate.artifactKey,
          scope: candidate.scope,
          reason: `duration_learning_runtime_regression:${evaluation.reasons.join(',')}`,
          rolledBackAt: observedAt,
        })
        if (rollback.status === 'rollback_executed') result.rollbackExecuted += 1
        else if (rollback.status === 'rollback_already_executed') result.rollbackReused += 1
        else throw operationBlockedError('duration_learning_runtime_rollback', rollback)
        if (impact.status !== 'impact_recorded' && rollback.status !== 'rollback_already_executed') {
          throw operationBlockedError('duration_learning_runtime_impact', impact)
        }
        result.monitoringFailed += 1
        continue
      }
      if (candidate.publicationStage === 'canary') {
        const stableDecision = stableAutomationDecision(candidate, evaluation.metrics)
        const stableMetrics = {
          ...evaluation.metrics,
          stableAutomationDecision: stableDecision,
        }
        if (!stableDecision.autoPromotionAllowed) {
          if (stableDecision.manualReviewRequired) result.manualFallback += 1
          if (stableDecision.retainPreviousStable && stableDecision.stage === 'blocked_retain_previous') {
            const impact = await recordImpact({
              queryExec,
              publicationKey: candidate.publicationKey,
              monitoringStatus: 'failed',
              metrics: stableMetrics,
              observedAt,
            })
            const rollback = await rollbackPublication({
              queryExec,
              publicationKey: candidate.publicationKey,
              assetKey: candidate.assetKey,
              artifactKey: candidate.artifactKey,
              scope: candidate.scope,
              reason: `duration_learning_stable_policy_blocked:${stableDecision.reasonCodes.join(',')}`,
              rolledBackAt: observedAt,
            })
            if (rollback.status === 'rollback_executed') result.rollbackExecuted += 1
            else if (rollback.status === 'rollback_already_executed') result.rollbackReused += 1
            else throw operationBlockedError('duration_learning_runtime_rollback', rollback)
            if (impact.status !== 'impact_recorded' && rollback.status !== 'rollback_already_executed') {
              throw operationBlockedError('duration_learning_runtime_impact', impact)
            }
            result.monitoringFailed += 1
          } else {
            const impact = await recordImpact({
              queryExec,
              publicationKey: candidate.publicationKey,
              monitoringStatus: 'collecting',
              metrics: stableMetrics,
              observedAt,
            })
            if (impact.status !== 'impact_recorded') throw operationBlockedError('duration_learning_runtime_impact', impact)
            result.monitoringPending += 1
          }
          continue
        }
        evaluation.metrics = stableMetrics
      }
      const impact = await recordImpact({
        queryExec,
        publicationKey: candidate.publicationKey,
        monitoringStatus: 'passed',
        metrics: evaluation.metrics,
        observedAt,
      })
      if (impact.status !== 'impact_recorded') throw operationBlockedError('duration_learning_runtime_impact', impact)
      if (candidate.publicationStage === 'canary') {
        const promotion = await promoteCanary({
          queryExec,
          publicationKey: candidate.publicationKey,
          promotedAt: observedAt,
        })
        if (promotion.status === 'stable_promoted') result.stablePromoted += 1
        else if (promotion.status === 'stable_already_promoted') result.stablePromotionReused += 1
        else throw operationBlockedError('duration_learning_runtime_promotion', promotion)
      }
      result.monitoringPassed += 1
    } catch (error) {
      addFailure('monitoring', candidate.publicationKey, error)
    }
  }

  if (
    collectionCursorStore
    && result.failed === 0
    && cursorOutputHash(cursorState) !== cursorOutputHash(nextCursorState)
  ) {
    try {
      await collectionCursorStore.commit(cursorState, nextCursorState)
      result.collectionCursorAdvanced = true
    } catch (error) {
      addFailure('collection_cursor', COLLECTION_CURSOR_OPERATION_ID, error)
    }
  }

  return result
}
