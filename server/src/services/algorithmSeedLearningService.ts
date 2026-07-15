import { v4 as uuidv4 } from 'uuid'
import { createHash } from 'node:crypto'

import { supabase } from './dbService.js'
import type { AlgorithmSeedType } from './algorithmSeedRegistry.js'
import { clearAlgorithmSeedResolverCache } from './algorithmSeedResolver.js'
import { validateAlgorithmSeedRuntimePayload } from './algorithmSeedValidationService.js'
import { getAlgorithmSeedGovernancePolicy, type AlgorithmSeedCandidateQualityWeights } from './algorithmSeedGovernancePolicyService.js'
import { sanitizeLegacyScopeObjectFields } from './legacyScopeObjectSanitizer.js'

export type AlgorithmSeedCandidateSource = 'project_history' | 'company_history' | 'standard_update' | 'system_observation'
export type AlgorithmSeedCandidateStatus = 'pending' | 'candidate_only' | 'auto_published' | 'quarantined' | 'rejected' | 'superseded'
export type AlgorithmSeedOverrideScope = 'project' | 'company'

export type CreateAlgorithmSeedCandidateInput = {
  seedType: AlgorithmSeedType
  stableCode: string
  candidatePayload: Record<string, unknown>
  candidateSource: AlgorithmSeedCandidateSource
  projectId?: string | null
  companyId?: string | null
  sampleCount?: number
  variance?: number | null
  confidenceLevel?: 'high' | 'medium' | 'low'
  evidenceSummary?: Record<string, unknown>
  actionPolicy?: 'candidate_only' | 'auto_govern'
  createdBy?: string | null
}

export type CreateAlgorithmSeedOverrideInput = {
  seedType: AlgorithmSeedType
  stableCode: string
  scopeType: AlgorithmSeedOverrideScope
  projectId?: string | null
  companyId?: string | null
  overridePayload: Record<string, unknown>
  sourceCandidateId?: string | null
  effectiveFrom?: string | null
  effectiveTo?: string | null
  createdBy?: string | null
  publishedBy?: string | null
  autoGovernanceResult?: Record<string, unknown>
}

export type RollbackAlgorithmSeedOverrideRuntimePublicationInput = {
  seedType: AlgorithmSeedType
  stableCode: string
  scopeType: AlgorithmSeedOverrideScope
  projectId?: string | null
  companyId?: string | null
  rollbackTarget: string
  reason?: string | null
  executedAt?: string | null
  executedBy?: string | null
}

export type RollbackAlgorithmSeedOverrideRuntimePublicationResult = {
  status: 'rollback_executed' | 'rollback_blocked'
  seedType: AlgorithmSeedType
  stableCode: string
  scopeType: AlgorithmSeedOverrideScope
  rollbackTarget: string | null
  writesSeedOverrideRuntime: boolean
  writesSystemSeedRuntimeDirectly: false
  reasons: string[]
}

export type AlgorithmSeedOverrideImpactMonitoringStatus =
  | 'monitoring_armed'
  | 'monitoring_passed'
  | 'monitoring_failed'

export type RecordAlgorithmSeedOverrideImpactMonitoringInput = {
  seedType: AlgorithmSeedType
  stableCode: string
  scopeType: AlgorithmSeedOverrideScope
  projectId?: string | null
  companyId?: string | null
  monitoringStatus: AlgorithmSeedOverrideImpactMonitoringStatus
  eventRef?: string | null
  rollbackTarget?: string | null
  reason?: string | null
  monitoredAt?: string | null
  monitoredBy?: string | null
  metrics?: Record<string, unknown> | null
}

export type AlgorithmSeedOverrideImpactMonitoringEvent = {
  status: AlgorithmSeedOverrideImpactMonitoringStatus
  eventRef: string
  rollbackTarget: string | null
  reason: string | null
  monitoredAt: string
  monitoredBy: string | null
  metrics: Record<string, unknown>
}

export type RecordAlgorithmSeedOverrideImpactMonitoringResult = {
  status: 'monitoring_recorded' | 'monitoring_rolled_back' | 'monitoring_blocked' | 'monitoring_recorded_rollback_blocked'
  seedType: AlgorithmSeedType
  stableCode: string
  scopeType: AlgorithmSeedOverrideScope
  rollbackTarget: string | null
  writesSeedOverrideRuntime: boolean
  writesSystemSeedRuntimeDirectly: false
  impactMonitoring: AlgorithmSeedOverrideImpactMonitoringEvent | null
  rollback: RollbackAlgorithmSeedOverrideRuntimePublicationResult | null
  reasons: string[]
}

export type AlgorithmSeedCandidateQualityInput = {
  seedType: AlgorithmSeedType
  candidatePayload: Record<string, unknown>
  sampleCount?: number | null
  variance?: number | string | null
  confidenceLevel?: 'high' | 'medium' | 'low' | string | null
  confidenceScore?: number | string | null
  evidenceSummary?: Record<string, unknown> | null
}

export type AlgorithmSeedCandidateQuality = {
  sampleQualityScore: number
  conflictScore: number
  replayEvidenceScore: number
  overallQualityScore: number
  qualityLevel: 'high' | 'medium' | 'low'
  factors: {
    seedType: AlgorithmSeedType
    sampleCount: number
    variance: number
    confidenceScore: number
    conflictCount: number
    replayTruePositiveRate: number | null
    replayFalsePositiveRate: number | null
    replayWindowDays: number | null
    replayCaseCount: number | null
    qualityWeights: AlgorithmSeedCandidateQualityWeights
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readConfidenceScore(input: AlgorithmSeedCandidateQualityInput) {
  const payload = isPlainObject(input.candidatePayload) ? input.candidatePayload : {}
  const explicit = normalizeNumber(input.confidenceScore ?? payload.confidenceScore ?? payload.confidence_score ?? payload.confidence, NaN)
  if (Number.isFinite(explicit)) return Math.max(0, Math.min(1, explicit > 1 ? explicit / 100 : explicit))
  const confidence = normalizeText(input.confidenceLevel || 'low') as 'high' | 'medium' | 'low'
  if (confidence === 'high') return 0.9
  if (confidence === 'medium') return 0.7
  return 0.4
}

function readEvidenceNumber(summary: Record<string, unknown>, keys: string[], fallback = NaN) {
  for (const key of keys) {
    const value = normalizeNumber(summary[key], NaN)
    if (Number.isFinite(value)) return value
  }
  return fallback
}

export function buildAlgorithmSeedCandidateQuality(input: AlgorithmSeedCandidateQualityInput): AlgorithmSeedCandidateQuality {
  const evidenceSummary = isPlainObject(input.evidenceSummary) ? input.evidenceSummary : {}
  const policy = getAlgorithmSeedGovernancePolicy(input.seedType)
  const qualityWeights = policy.qualityWeights
  const sampleCount = Math.max(0, Math.trunc(normalizeNumber(input.sampleCount, 0)))
  const variance = Math.abs(normalizeNumber(input.variance, 0))
  const confidenceScore = readConfidenceScore(input)
  const conflictCount = Math.max(0, Math.trunc(readEvidenceNumber(evidenceSummary, ['conflictCount', 'conflict_count'], 0)))
  const replayTruePositiveRate = readEvidenceNumber(evidenceSummary, ['replayTruePositiveRate', 'replay_true_positive_rate'], NaN)
  const replayFalsePositiveRate = readEvidenceNumber(evidenceSummary, ['replayFalsePositiveRate', 'replay_false_positive_rate'], NaN)
  const replayWindowDays = readEvidenceNumber(evidenceSummary, ['replayWindowDays', 'replay_window_days'], NaN)
  const replayCaseCount = readEvidenceNumber(evidenceSummary, ['replayCaseCount', 'replay_case_count'], NaN)
  const normalizedTruePositiveRate = Number.isFinite(replayTruePositiveRate)
    ? Math.max(0, Math.min(1, replayTruePositiveRate))
    : null
  const normalizedFalsePositiveRate = Number.isFinite(replayFalsePositiveRate)
    ? Math.max(0, Math.min(1, replayFalsePositiveRate))
    : null

  const sampleSaturation = Math.min(1, sampleCount / 10)
  const varianceScore = variance <= 0
    ? 100
    : clampScore(100 - Math.min(100, variance * 180))
  const sampleQualityScore = clampScore(sampleSaturation * 35 + confidenceScore * 45 + varianceScore * 0.2)
  const conflictScore = clampScore(100 - conflictCount * 12 - (normalizedFalsePositiveRate ?? 0) * 60)
  const replayEvidenceScore = normalizedTruePositiveRate == null
    ? clampScore(confidenceScore * 75)
    : clampScore(normalizedTruePositiveRate * 100 - (normalizedFalsePositiveRate ?? 0) * 50)
  const overallQualityScore = clampScore(
    sampleQualityScore * qualityWeights.sample
    + conflictScore * qualityWeights.conflict
    + replayEvidenceScore * qualityWeights.replay,
  )

  return {
    sampleQualityScore,
    conflictScore,
    replayEvidenceScore,
    overallQualityScore,
    qualityLevel: overallQualityScore >= 75 ? 'high' : overallQualityScore >= 50 ? 'medium' : 'low',
    factors: {
      seedType: input.seedType,
      sampleCount,
      variance,
      confidenceScore,
      conflictCount,
      replayTruePositiveRate: normalizedTruePositiveRate,
      replayFalsePositiveRate: normalizedFalsePositiveRate,
      replayWindowDays: Number.isFinite(replayWindowDays) ? Math.max(0, Math.trunc(replayWindowDays)) : null,
      replayCaseCount: Number.isFinite(replayCaseCount) ? Math.max(0, Math.trunc(replayCaseCount)) : null,
      qualityWeights,
    },
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function buildAlgorithmSeedCandidateFingerprint(input: {
  seedType: AlgorithmSeedType
  stableCode: string
  candidateSource: AlgorithmSeedCandidateSource
  projectId?: string | null
  companyId?: string | null
  candidatePayload: Record<string, unknown>
  evidenceSummary?: Record<string, unknown>
}) {
  const raw = stableJson({
    seedType: input.seedType,
    stableCode: normalizeText(input.stableCode),
    candidateSource: input.candidateSource,
    projectId: normalizeText(input.projectId),
    companyId: normalizeText(input.companyId),
    candidatePayload: input.candidatePayload,
    evidenceSummary: input.evidenceSummary ?? {},
  })
  return createHash('sha256').update(raw).digest('hex')
}

function throwPayloadValidationError(validation: ReturnType<typeof validateAlgorithmSeedRuntimePayload>) {
  const error = new Error('algorithm seed runtime payload validation failed')
  ;(error as any).code = 'ALGORITHM_SEED_PAYLOAD_VALIDATION_FAILED'
  ;(error as any).details = validation
  throw error
}

export async function createAlgorithmSeedUpgradeCandidate(input: CreateAlgorithmSeedCandidateInput) {
  const validation = validateAlgorithmSeedRuntimePayload(input.seedType, input.candidatePayload, {
    stableCode: input.stableCode,
    strict: true,
  })
  if (!validation.ok) throwPayloadValidationError(validation)

  const stableCode = validation.stableCode
  const candidatePayload = sanitizeLegacyScopeObjectFields(validation.normalizedPayload).payload
  const candidateFingerprint = buildAlgorithmSeedCandidateFingerprint({
    seedType: input.seedType,
    stableCode,
    candidatePayload,
    candidateSource: input.candidateSource,
    projectId: input.projectId,
    companyId: input.companyId,
    evidenceSummary: input.evidenceSummary,
  })

  const { data: existing, error: existingError } = await supabase
    .from('algorithm_seed_upgrade_candidates')
    .select('*')
    .eq('candidate_fingerprint', candidateFingerprint)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing && ['pending', 'candidate_only'].includes(normalizeText((existing as any).status))) {
    return existing
  }

  const row = {
    id: uuidv4(),
    seed_type: input.seedType,
    stable_code: stableCode,
    candidate_fingerprint: candidateFingerprint,
    candidate_payload: candidatePayload,
    candidate_source: input.candidateSource,
    project_id: input.projectId ?? null,
    company_id: input.companyId ?? null,
    sample_count: Math.max(0, Math.trunc(normalizeNumber(input.sampleCount, 0))),
    variance: input.variance ?? null,
    confidence_level: input.confidenceLevel ?? 'low',
    evidence_summary: input.evidenceSummary ?? {},
    action_policy: input.actionPolicy ?? 'auto_govern',
    status: input.actionPolicy === 'candidate_only' ? 'candidate_only' : 'pending',
    created_by: input.createdBy ?? null,
  }

  const { data, error } = await supabase
    .from('algorithm_seed_upgrade_candidates')
    .insert(row)
    .select('*')
    .single()
  if (error) throw error
  clearAlgorithmSeedResolverCache(input.seedType)
  return data
}

export async function listAlgorithmSeedUpgradeCandidates(filters: {
  seedType?: AlgorithmSeedType | null
  status?: AlgorithmSeedCandidateStatus | null
  companyId?: string | null
  projectId?: string | null
} = {}) {
  let query = supabase
    .from('algorithm_seed_upgrade_candidates')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (filters.seedType) query = query.eq('seed_type', filters.seedType)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.companyId) query = query.eq('company_id', filters.companyId)
  if (filters.projectId) query = query.eq('project_id', filters.projectId)

  const { data, error } = await query
  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function createAlgorithmSeedOverride(input: CreateAlgorithmSeedOverrideInput) {
  const projectId = normalizeText(input.projectId) || null
  const companyId = normalizeText(input.companyId) || null
  if (input.scopeType === 'project' && !projectId) {
    throw Object.assign(new Error('projectId is required for project algorithm seed overrides'), { code: 'PROJECT_SCOPE_REQUIRED' })
  }
  if (input.scopeType === 'company' && !companyId) {
    throw Object.assign(new Error('companyId is required for company algorithm seed overrides'), { code: 'COMPANY_SCOPE_REQUIRED' })
  }
  const validation = validateAlgorithmSeedRuntimePayload(input.seedType, input.overridePayload, {
    stableCode: input.stableCode,
    strict: true,
  })
  if (!validation.ok) throwPayloadValidationError(validation)
  const stableCode = validation.stableCode
  const overridePayload = sanitizeLegacyScopeObjectFields(validation.normalizedPayload).payload

  const now = new Date().toISOString()
  let deactivate = supabase
    .from('algorithm_seed_overrides')
    .update({ status: 'inactive', updated_at: now })
    .eq('seed_type', input.seedType)
    .eq('stable_code', stableCode)
    .eq('scope_type', input.scopeType)
    .eq('status', 'active')
  deactivate = input.scopeType === 'project'
    ? deactivate.eq('project_id', projectId)
    : deactivate.eq('company_id', companyId)
  const { error: deactivateError } = await deactivate
  if (deactivateError) throw deactivateError

  const { data, error } = await supabase
    .from('algorithm_seed_overrides')
    .insert({
      id: uuidv4(),
      seed_type: input.seedType,
      stable_code: stableCode,
      scope_type: input.scopeType,
      project_id: input.scopeType === 'project' ? projectId : null,
      company_id: input.scopeType === 'company' ? companyId : companyId,
      override_payload: overridePayload,
      source_candidate_id: input.sourceCandidateId ?? null,
      effective_from: input.effectiveFrom ?? null,
      effective_to: input.effectiveTo ?? null,
      status: 'active',
      created_by: input.createdBy ?? null,
      published_by: input.publishedBy ?? null,
      auto_governance_result: input.autoGovernanceResult ?? {},
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single()
  if (error) throw error
  clearAlgorithmSeedResolverCache()
  return data
}

export async function listAlgorithmSeedOverrides(filters: {
  seedType?: AlgorithmSeedType | null
  scopeType?: AlgorithmSeedOverrideScope | null
  companyId?: string | null
  projectId?: string | null
  status?: 'active' | 'inactive' | 'deprecated' | null
} = {}) {
  let query = supabase
    .from('algorithm_seed_overrides')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (filters.seedType) query = query.eq('seed_type', filters.seedType)
  if (filters.scopeType) query = query.eq('scope_type', filters.scopeType)
  if (filters.companyId) query = query.eq('company_id', filters.companyId)
  if (filters.projectId) query = query.eq('project_id', filters.projectId)
  if (filters.status) query = query.eq('status', filters.status)

  const { data, error } = await query
  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function updateAlgorithmSeedOverride(
  id: string,
  patch: { status?: 'active' | 'inactive' | 'deprecated'; effectiveFrom?: string | null; effectiveTo?: string | null; overridePayload?: Record<string, unknown> },
) {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.status) update.status = patch.status
  if ('effectiveFrom' in patch) update.effective_from = patch.effectiveFrom ?? null
  if ('effectiveTo' in patch) update.effective_to = patch.effectiveTo ?? null
  if (patch.overridePayload) {
    update.override_payload = sanitizeLegacyScopeObjectFields(patch.overridePayload).payload
  }

  const { data, error } = await supabase
    .from('algorithm_seed_overrides')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

function rollbackBlockedResult(
  input: RollbackAlgorithmSeedOverrideRuntimePublicationInput,
  reasons: string[],
): RollbackAlgorithmSeedOverrideRuntimePublicationResult {
  return {
    status: 'rollback_blocked',
    seedType: input.seedType,
    stableCode: normalizeText(input.stableCode),
    scopeType: input.scopeType,
    rollbackTarget: normalizeText(input.rollbackTarget) || null,
    writesSeedOverrideRuntime: false,
    writesSystemSeedRuntimeDirectly: false,
    reasons: Array.from(new Set(reasons.filter(Boolean))),
  }
}

function impactMonitoringBlockedResult(
  input: RecordAlgorithmSeedOverrideImpactMonitoringInput,
  reasons: string[],
): RecordAlgorithmSeedOverrideImpactMonitoringResult {
  return {
    status: 'monitoring_blocked',
    seedType: input.seedType,
    stableCode: normalizeText(input.stableCode),
    scopeType: input.scopeType,
    rollbackTarget: normalizeText(input.rollbackTarget) || null,
    writesSeedOverrideRuntime: false,
    writesSystemSeedRuntimeDirectly: false,
    impactMonitoring: null,
    rollback: null,
    reasons: Array.from(new Set(reasons.filter(Boolean))),
  }
}

export async function rollbackAlgorithmSeedOverrideRuntimePublication(
  input: RollbackAlgorithmSeedOverrideRuntimePublicationInput,
): Promise<RollbackAlgorithmSeedOverrideRuntimePublicationResult> {
  const stableCode = normalizeText(input.stableCode)
  const projectId = normalizeText(input.projectId) || null
  const companyId = normalizeText(input.companyId) || null
  const rollbackTarget = normalizeText(input.rollbackTarget)
  const reasons: string[] = []

  if (!stableCode) reasons.push('stable_code_required')
  if (!rollbackTarget) reasons.push('rollback_target_required')
  if (input.scopeType === 'project' && !projectId) reasons.push('project_scope_required')
  if (input.scopeType === 'company' && !companyId) reasons.push('company_scope_required')
  if (reasons.length > 0) return rollbackBlockedResult(input, reasons)

  let lookup = supabase
    .from('algorithm_seed_overrides')
    .select('id, auto_governance_result')
    .eq('seed_type', input.seedType)
    .eq('stable_code', stableCode)
    .eq('scope_type', input.scopeType)
    .eq('status', 'active')
  lookup = input.scopeType === 'project'
    ? lookup.eq('project_id', projectId)
    : lookup.eq('company_id', companyId)

  const { data: activeOverride, error: lookupError } = await lookup.maybeSingle()
  if (lookupError) throw lookupError
  if (!activeOverride) return rollbackBlockedResult(input, ['active_seed_override_not_found'])

  const executedAt = normalizeText(input.executedAt) || new Date().toISOString()
  const effectiveTo = /^\d{4}-\d{2}-\d{2}/.test(executedAt)
    ? executedAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10)
  const existingGovernance = isPlainObject((activeOverride as any).auto_governance_result)
    ? (activeOverride as any).auto_governance_result
    : {}
  const rollbackExecution = {
    status: 'runtime_rolled_back',
    rollbackTarget,
    reason: normalizeText(input.reason) || 'runtime_rollback_requested',
    executedAt,
    executedBy: normalizeText(input.executedBy) || null,
  }

  let update = supabase
    .from('algorithm_seed_overrides')
    .update({
      status: 'inactive',
      effective_to: effectiveTo,
      auto_governance_result: {
        ...existingGovernance,
        rollbackExecution,
      },
      updated_at: executedAt,
    })
    .eq('id', (activeOverride as any).id)
    .eq('scope_type', input.scopeType)
    .eq('status', 'active')
  update = input.scopeType === 'project'
    ? update.eq('project_id', projectId)
    : update.eq('company_id', companyId)
  const { error: updateError } = await update
  if (updateError) throw updateError

  clearAlgorithmSeedResolverCache(input.seedType)

  return {
    status: 'rollback_executed',
    seedType: input.seedType,
    stableCode,
    scopeType: input.scopeType,
    rollbackTarget,
    writesSeedOverrideRuntime: true,
    writesSystemSeedRuntimeDirectly: false,
    reasons: [],
  }
}

export async function recordAlgorithmSeedOverrideImpactMonitoring(
  input: RecordAlgorithmSeedOverrideImpactMonitoringInput,
): Promise<RecordAlgorithmSeedOverrideImpactMonitoringResult> {
  const stableCode = normalizeText(input.stableCode)
  const projectId = normalizeText(input.projectId) || null
  const companyId = normalizeText(input.companyId) || null
  const monitoringStatus = input.monitoringStatus
  const rollbackTarget = normalizeText(input.rollbackTarget)
  const reasons: string[] = []

  if (!stableCode) reasons.push('stable_code_required')
  if (!['monitoring_armed', 'monitoring_passed', 'monitoring_failed'].includes(monitoringStatus)) {
    reasons.push('monitoring_status_required')
  }
  if (input.scopeType === 'project' && !projectId) reasons.push('project_scope_required')
  if (input.scopeType === 'company' && !companyId) reasons.push('company_scope_required')
  if (monitoringStatus === 'monitoring_failed' && !rollbackTarget) {
    reasons.push('rollback_target_required_for_failed_monitoring')
  }
  if (reasons.length > 0) return impactMonitoringBlockedResult(input, reasons)

  let lookup = supabase
    .from('algorithm_seed_overrides')
    .select('id, auto_governance_result')
    .eq('seed_type', input.seedType)
    .eq('stable_code', stableCode)
    .eq('scope_type', input.scopeType)
    .eq('status', 'active')
  lookup = input.scopeType === 'project'
    ? lookup.eq('project_id', projectId)
    : lookup.eq('company_id', companyId)

  const { data: activeOverride, error: lookupError } = await lookup.maybeSingle()
  if (lookupError) throw lookupError
  if (!activeOverride) return impactMonitoringBlockedResult(input, ['active_seed_override_not_found'])

  const monitoredAt = normalizeText(input.monitoredAt) || new Date().toISOString()
  const monitoredBy = normalizeText(input.monitoredBy) || null
  const reason = normalizeText(input.reason) || null
  const eventRef = normalizeText(input.eventRef)
    || `impact_monitoring:algorithm_seed_overrides:${input.seedType}:${stableCode}:${input.scopeType}:${projectId ?? companyId}:${monitoringStatus}`
  const metrics = isPlainObject(input.metrics) ? input.metrics : {}
  const existingGovernance = isPlainObject((activeOverride as any).auto_governance_result)
    ? (activeOverride as any).auto_governance_result
    : {}
  const impactMonitoring: AlgorithmSeedOverrideImpactMonitoringEvent = {
    status: monitoringStatus,
    eventRef,
    rollbackTarget: rollbackTarget || null,
    reason,
    monitoredAt,
    monitoredBy,
    metrics,
  }

  const { error: updateError } = await supabase
    .from('algorithm_seed_overrides')
    .update({
      auto_governance_result: {
        ...existingGovernance,
        impactMonitoring,
      },
      updated_at: monitoredAt,
    })
    .eq('id', (activeOverride as any).id)
  if (updateError) throw updateError

  clearAlgorithmSeedResolverCache(input.seedType)

  if (monitoringStatus !== 'monitoring_failed') {
    return {
      status: 'monitoring_recorded',
      seedType: input.seedType,
      stableCode,
      scopeType: input.scopeType,
      rollbackTarget: rollbackTarget || null,
      writesSeedOverrideRuntime: true,
      writesSystemSeedRuntimeDirectly: false,
      impactMonitoring,
      rollback: null,
      reasons: [],
    }
  }

  const rollback = await rollbackAlgorithmSeedOverrideRuntimePublication({
    seedType: input.seedType,
    stableCode,
    scopeType: input.scopeType,
    projectId,
    companyId,
    rollbackTarget,
    reason: reason || 'impact_monitoring_failed',
    executedAt: monitoredAt,
    executedBy: monitoredBy,
  })

  return {
    status: rollback.status === 'rollback_executed'
      ? 'monitoring_rolled_back'
      : 'monitoring_recorded_rollback_blocked',
    seedType: input.seedType,
    stableCode,
    scopeType: input.scopeType,
    rollbackTarget,
    writesSeedOverrideRuntime: true,
    writesSystemSeedRuntimeDirectly: false,
    impactMonitoring,
    rollback,
    reasons: rollback.reasons,
  }
}
