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
  type DurationLearningExperienceTier,
  type DurationLearningFactSource,
} from './durationLearningAssetAutomationPolicyService.js'

const STRUCTURAL_ASSET_KEYS = new Set<DurationLearningRuntimeAssetKey>([
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
])

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
  conflictCount: number
  replayPassed: boolean
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
  publicationStage: 'canary' | 'stable'
  scopeLevel: DurationLearningRuntimeScope['level']
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
  rollbackExecuted: number
  failed: number
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
  recordImpact?: typeof recordDurationLearningRuntimeImpact
  promoteCanary?: typeof promoteDurationLearningRuntimeCanary
  rollbackPublication?: typeof rollbackDurationLearningRuntimePublication
  observedAt?: string
}

type SourceRow = Record<string, unknown>

function text(value: unknown) {
  return String(value ?? '').trim()
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

function cloneProposal(proposal: DurationLearningRuntimeCandidateProposal): DurationLearningRuntimeCandidateProposal {
  return {
    ...proposal,
    scope: { ...proposal.scope },
    runtimePayload: structuredClone(proposal.runtimePayload),
    sourceCandidateRefs: uniqueTexts(proposal.sourceCandidateRefs),
    sourceEvidenceRefs: uniqueTexts(proposal.sourceEvidenceRefs),
    projectIds: uniqueTexts(proposal.projectIds),
    companyIds: uniqueTexts(proposal.companyIds),
    industryKeys: uniqueTexts(proposal.industryKeys),
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
    conflictCount,
    replayPassed: proposals.every((proposal) => proposal.replayPassed),
    blockingReasons: uniqueTexts([
      ...proposals.flatMap((proposal) => proposal.blockingReasons ?? []),
      ...aggregateNodeSetBlockingReasons(proposals),
    ]),
    policyEvaluationRequired: proposals.some((proposal) => proposal.policyEvaluationRequired),
    automationEvidence: {
      maeBefore: weightedAverage(proposals, 'maeBefore'),
      maeAfter: weightedAverage(proposals, 'maeAfter'),
      conflictRate: weightedAverage(proposals, 'conflictRate'),
      overcompensationRate: weightedAverage(proposals, 'overcompensationRate'),
      rollbackReady: proposals.every((proposal) => proposal.automationEvidence?.rollbackReady === true),
      tenantScopeValid: proposals.every((proposal) => proposal.automationEvidence?.tenantScopeValid === true),
      structuralMutation: proposals.some((proposal) => proposal.automationEvidence?.structuralMutation === true),
      exceptionalConflict: proposals.some((proposal) => proposal.automationEvidence?.exceptionalConflict === true),
    },
  }
  return aggregate.policyEvaluationRequired ? withAutomationDecision(aggregate) : aggregate
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
    return {
      p50Days: weightedPayloadNumber(proposals, ['p50Days', 'p50_days']),
      p80Days: weightedPayloadNumber(proposals, ['p80Days', 'p80_days'])
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
  key: 'maeBefore' | 'maeAfter' | 'conflictRate' | 'overcompensationRate',
) {
  const measured = proposals.flatMap((proposal) => {
    const value = proposal.automationEvidence?.[key]
    const parsed = Number(value)
    return Number.isFinite(parsed)
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
  const decision = evaluateDurationLearningAssetAutomationPolicy({
    experienceTier: STRUCTURAL_ASSET_KEYS.has(proposal.assetKey) ? 'T3' : 'T2',
    reuseScope: proposal.scope.level,
    factSource: proposal.assetKey === 'base_duration_benchmark' ? 'actual_outcome' : 'hybrid',
    targetStage: 'canary',
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
  return {
    ...proposal,
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
  const projectProposals = input.map(cloneProposal)
  const expanded = [...projectProposals]

  const companyGroups = groupProjectProposals(projectProposals, (proposal) => proposal.companyIds[0] ?? null)
  for (const proposals of companyGroups.values()) {
    const companyId = proposals[0]?.companyIds[0]
    if (!companyId) continue
    const aggregate = aggregateProposal(proposals, { level: 'company', companyId })
    if (meetsAggregationFloor(aggregate, 'company')) expanded.push(aggregate)
  }

  const industryGroups = groupProjectProposals(projectProposals, (proposal) => proposal.industryKeys[0] ?? null)
  for (const proposals of industryGroups.values()) {
    const industryKey = proposals[0]?.industryKeys[0]
    if (!industryKey) continue
    const aggregate = aggregateProposal(proposals, { level: 'industry', industryKey })
    if (meetsAggregationFloor(aggregate, 'industry')) expanded.push(aggregate)
  }

  const globalGroups = groupProjectProposals(projectProposals, () => 'global')
  for (const proposals of globalGroups.values()) {
    const aggregate = aggregateProposal(proposals, { level: 'global' })
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
  return text(
    row.industry_key
      ?? row.business_type
      ?? row.project_type
      ?? metadata.businessType
      ?? metadata.business_type
      ?? metadata.projectTypeCode
      ?? metadata.project_type_code,
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
    conflictCount: nonNegativeInteger(metadata.conflictCount ?? metadata.conflict_count),
    replayPassed: metadata.replayPassed !== false && metadata.replay_passed !== false,
    blockingReasons: text(row.duration_day_basis) === 'construction_production_day'
      ? []
      : ['benchmark_production_day_basis_required'],
    policyEvaluationRequired: true,
    automationEvidence: automationEvidenceFrom(metadata),
  })
}

function automationEvidenceFrom(source: Record<string, unknown>): DurationLearningAutomationEvidence {
  return {
    maeBefore: optionalNumber(source.maeBefore ?? source.mae_before),
    maeAfter: optionalNumber(source.maeAfter ?? source.mae_after),
    conflictRate: optionalNumber(source.conflictRate ?? source.conflict_rate),
    overcompensationRate: optionalNumber(source.overcompensationRate ?? source.overcompensation_rate),
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
      ...list(metadata.auto_task_ids),
      ...list(metadata.primary_chain_task_ids),
      ...list(metadata.sample_dependency_ids),
    ]),
    realOutcomeCount: outcomeStatus === 'accepted' ? 1 : 0,
    replayCaseCount: nonNegativeInteger(metadata.sample_count ?? metadata.comparable_actual_date_count),
    observationWindowDays: nonNegativeInteger(metadata.observation_window_days),
    conflictCount: nonNegativeInteger(metadata.conflict_count) + Number(outcomeStatus === 'rejected'),
    replayPassed: outcomeStatus === 'accepted',
    blockingReasons,
    policyEvaluationRequired: true,
    automationEvidence: automationEvidenceFrom(metadata),
  })
}

// workspace-isolation-system-job-approved: the singleton duration-learning lifecycle scheduler reads candidate evidence across tenants, preserves company/project lineage on every proposal, and only publishes scoped reversible overlays.
export async function collectDurationLearningRuntimeCandidateProposals(
  queryExec: DurationLearningRuntimePublicationQueryExec = executeSQL,
) {
  const [benchmarkRows, seedRows, networkRows] = await Promise.all([
    queryExec<SourceRow>(
      `select benchmark.*,
              project.company_id as project_company_id,
              coalesce(project.business_type, project.project_type) as business_type
         from public.duration_benchmarks benchmark
         left join public.projects project on project.id = benchmark.project_id
        where benchmark.is_active = true
          and benchmark.is_current = false
          and benchmark.duration_day_basis = 'construction_production_day'
          and benchmark.metadata ->> 'runtime_publication_status' = 'candidate'
        order by benchmark.updated_at asc
        limit 500`,
    ),
    queryExec<SourceRow>(
      `select candidate.*,
              coalesce(candidate.company_id, project.company_id) as resolved_company_id,
              coalesce(project.business_type, project.project_type) as business_type
         from public.algorithm_seed_upgrade_candidates candidate
         left join public.projects project on project.id = candidate.project_id
        where candidate.seed_type in ('standard_work_duration', 'special_work_duration')
          and candidate.action_policy = 'auto_govern'
          and candidate.status in ('pending', 'candidate_only', 'auto_published')
        order by candidate.updated_at asc
        limit 500`,
    ),
    queryExec<SourceRow>(
      `select outcome.*,
              coalesce(outcome.company_id, project.company_id) as resolved_company_id,
              coalesce(project.business_type, project.project_type) as business_type
         from public.duration_plan_network_outcomes outcome
         left join public.projects project on project.id = outcome.project_id
        where outcome.outcome_status in ('accepted', 'weak', 'rejected')
          and outcome.publication_key is null
        order by outcome.observed_at asc
        limit 1000`,
    ),
  ])
  const normalizedRows = [
    ...benchmarkRows.map((row) => ({
      ...row,
      company_id: row.company_id ?? row.project_company_id,
    })).map(benchmarkProposalFromRow),
    ...seedRows.map((row) => ({
      ...row,
      company_id: row.company_id ?? row.resolved_company_id,
    })).map(seedProposalFromRow),
    ...networkRows.map((row) => ({
      ...row,
      company_id: row.company_id ?? row.resolved_company_id,
    })).map(networkProposalFromRow),
  ]
  return normalizedRows.filter((proposal): proposal is DurationLearningRuntimeCandidateProposal => Boolean(proposal))
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function monitoringCandidateFromRow(row: SourceRow): DurationLearningRuntimeMonitoringCandidate | null {
  const publicationKey = text(row.publication_key)
  const assetKey = text(row.asset_key) as DurationLearningRuntimeAssetKey
  const publicationStage = text(row.publication_stage)
  const scopeLevel = text(row.scope_level)
  if (!publicationKey || ![
    'base_duration_benchmark',
    'standard_work_duration_seed',
    'special_work_duration_seed',
    'wbs_reference_days',
    'dependency_rule_candidate',
    'critical_path_rule_candidate',
  ].includes(assetKey)) return null
  if (publicationStage !== 'canary' && publicationStage !== 'stable') return null
  if (!['project', 'company', 'industry', 'global'].includes(scopeLevel)) return null
  return {
    publicationKey,
    assetKey,
    publicationStage,
    scopeLevel: scopeLevel as DurationLearningRuntimeScope['level'],
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

// workspace-isolation-system-job-approved: the singleton duration-learning lifecycle scheduler measures scoped runtime publications across tenants; results update only the matching publication_key and never return tenant rows to a request.
export async function collectDurationLearningRuntimeMonitoringCandidates(
  queryExec: DurationLearningRuntimePublicationQueryExec = executeSQL,
) {
  const rows = await queryExec<SourceRow>(
    `select publication.publication_key,
            publication.asset_key,
            publication.publication_stage,
            publication.scope_level,
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
            accuracy.regression_rate
       from public.duration_learning_runtime_publications publication
       left join lateral (
         select count(*) filter (where source.observation_status = 'observed') as observed_count,
                count(*) filter (where source.observation_status = 'rejected') as rejected_observation_count
           from public.runtime_consumer_observations source
          where source.publication_key = publication.publication_key
            and source.observed_at >= publication.monitoring_started_at
       ) observation on true
       left join lateral (
         select count(*) filter (where measured.outcome_status = 'accepted') as accepted_outcome_count,
                count(*) filter (where measured.outcome_status in ('weak', 'rejected')) as weak_or_rejected_outcome_count
           from (
             select source.outcome_status
               from public.duration_plan_network_outcomes source
              where source.publication_key = publication.publication_key
                and source.observed_at >= publication.monitoring_started_at
             union all
             select case when exists (
                      select 1
                        from jsonb_array_elements_text(
                          coalesce(observation.observation_context -> 'appliedTaskIds', '[]'::jsonb)
                        ) watched(task_id)
                        join jsonb_array_elements_text(
                          coalesce(outcome.metadata -> 'auto_task_ids', '[]'::jsonb)
                        ) critical(task_id)
                          on critical.task_id = watched.task_id
                    ) then 'accepted' else 'weak' end as outcome_status
               from public.runtime_consumer_observations observation
               join public.duration_plan_network_outcomes outcome
                 on outcome.asset_key = 'critical_path_rule_candidate'
                and outcome.project_id::text = observation.observation_context ->> 'projectId'
                and outcome.observed_at >= observation.observed_at
              where publication.asset_key = 'critical_path_rule_candidate'
                and observation.publication_key = publication.publication_key
                and observation.observation_status = 'observed'
                and outcome.publication_key is null
           ) measured
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
            )
       ) accuracy on true
      where publication.publication_stage in ('canary', 'stable')
        and publication.monitoring_status in ('pending', 'collecting', 'passed')
      order by publication.monitoring_started_at asc
      limit 500`,
  )
  return rows
    .map(monitoringCandidateFromRow)
    .filter((candidate): candidate is DurationLearningRuntimeMonitoringCandidate => Boolean(candidate))
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
    rollbackExecuted: 0,
    failed: 0,
  }
}

function proposalCanEnterCanary(proposal: DurationLearningRuntimeCandidateProposal) {
  return proposal.sampleCount > 0
    && proposal.replayPassed
    && proposal.sourceCandidateRefs.length > 0
    && proposal.sourceEvidenceRefs.length > 0
    && Object.keys(proposal.runtimePayload).length > 0
    && (proposal.blockingReasons?.length ?? 0) === 0
    && (
      !proposal.policyEvaluationRequired
      || proposal.automationDecision?.autoPromotionAllowed === true
    )
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
  const sourceObservationWindowDays = nonNegativeInteger(
    sourceObserved.observationWindowDays ?? sourceObserved.observation_window_days,
  )
  const postPublicationObservationDays = Math.floor(candidate.monitoringElapsedHours / 24)

  return evaluateDurationLearningAssetAutomationPolicy({
    experienceTier,
    reuseScope: candidate.scopeLevel,
    factSource,
    targetStage: 'stable',
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
      maeBefore: optionalNumber(monitoringMetrics.maeBefore),
      maeAfter: optionalNumber(monitoringMetrics.maeAfter),
      conflictRate: optionalNumber(monitoringMetrics.runtimeConflictRate),
      overcompensationRate: optionalNumber(
        sourceObserved.overcompensationRate
          ?? sourceObserved.overcompensation_rate
          ?? sourceEvidence.overcompensationRate
          ?? sourceEvidence.overcompensation_rate,
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
  const candidates = input.candidateProvider
    ? await input.candidateProvider()
    : await collectDurationLearningRuntimeCandidateProposals(queryExec)
  const expanded = expandDurationLearningRuntimeCandidateScopes(candidates)
  const monitoringCandidates = input.monitoringProvider
    ? await input.monitoringProvider()
    : await collectDurationLearningRuntimeMonitoringCandidates(queryExec)
  const result = emptySweepResult()
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
    } catch {
      result.failed += 1
    }
  }

  for (const candidate of monitoringCandidates) {
    try {
      const evaluation = evaluateMonitoring(candidate)
      if (evaluation.status === 'pending') {
        result.monitoringPending += 1
        await recordImpact({
          queryExec,
          publicationKey: candidate.publicationKey,
          monitoringStatus: 'collecting',
          metrics: { ...evaluation.metrics, reasonCodes: evaluation.reasons },
          observedAt,
        })
        continue
      }
      if (evaluation.status === 'failed') {
        result.monitoringFailed += 1
        await recordImpact({
          queryExec,
          publicationKey: candidate.publicationKey,
          monitoringStatus: 'failed',
          metrics: { ...evaluation.metrics, reasonCodes: evaluation.reasons },
          observedAt,
        })
        const rollback = await rollbackPublication({
          queryExec,
          publicationKey: candidate.publicationKey,
          reason: `duration_learning_runtime_regression:${evaluation.reasons.join(',')}`,
          rolledBackAt: observedAt,
        })
        if (rollback.status === 'rollback_executed') result.rollbackExecuted += 1
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
            result.monitoringFailed += 1
            await recordImpact({
              queryExec,
              publicationKey: candidate.publicationKey,
              monitoringStatus: 'failed',
              metrics: stableMetrics,
              observedAt,
            })
            const rollback = await rollbackPublication({
              queryExec,
              publicationKey: candidate.publicationKey,
              reason: `duration_learning_stable_policy_blocked:${stableDecision.reasonCodes.join(',')}`,
              rolledBackAt: observedAt,
            })
            if (rollback.status === 'rollback_executed') result.rollbackExecuted += 1
          } else {
            result.monitoringPending += 1
            await recordImpact({
              queryExec,
              publicationKey: candidate.publicationKey,
              monitoringStatus: 'collecting',
              metrics: stableMetrics,
              observedAt,
            })
          }
          continue
        }
        evaluation.metrics = stableMetrics
      }
      result.monitoringPassed += 1
      const impact = await recordImpact({
        queryExec,
        publicationKey: candidate.publicationKey,
        monitoringStatus: 'passed',
        metrics: evaluation.metrics,
        observedAt,
      })
      if (candidate.publicationStage === 'canary' && impact.status === 'impact_recorded') {
        const promotion = await promoteCanary({
          queryExec,
          publicationKey: candidate.publicationKey,
          promotedAt: observedAt,
        })
        if (promotion.status === 'stable_promoted') result.stablePromoted += 1
      }
    } catch {
      result.failed += 1
    }
  }

  return result
}
