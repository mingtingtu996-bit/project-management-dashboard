import { supabase } from './dbService.js'
import {
  createAlgorithmSeedOverride,
  buildAlgorithmSeedCandidateQuality,
  type AlgorithmSeedCandidateQuality,
  type AlgorithmSeedCandidateStatus,
  type AlgorithmSeedOverrideScope,
} from './algorithmSeedLearningService.js'
import type { AlgorithmSeedType } from './algorithmSeedRegistry.js'
import { isAlgorithmSeedPayloadActive } from './algorithmSeedRegistry.js'
import {
  getAlgorithmSeedGovernancePolicy,
  getAlgorithmSeedGovernanceThreshold,
  isAlgorithmSeedCandidateOnly,
  type AlgorithmSeedGovernancePolicy,
} from './algorithmSeedGovernancePolicyService.js'
import { validateAlgorithmSeedRuntimePayload, type AlgorithmSeedRuntimePayloadValidationResult } from './algorithmSeedValidationService.js'

export type AlgorithmSeedCandidateRow = {
  id: string
  seed_type: AlgorithmSeedType
  stable_code: string
  candidate_payload: Record<string, unknown>
  candidate_source: string
  project_id?: string | null
  company_id?: string | null
  sample_count?: number | null
  variance?: number | string | null
  confidence_level?: 'high' | 'medium' | 'low' | string | null
  confidence_score?: number | string | null
  evidence_summary?: Record<string, unknown> | null
  action_policy?: 'candidate_only' | 'auto_govern' | string | null
  created_by?: string | null
}

export type AlgorithmSeedAutoGovernanceInput = {
  triggeredBy?: string | null
  scopeType: AlgorithmSeedOverrideScope
  companyId?: string | null
  projectId?: string | null
}

export type AlgorithmSeedAutoGovernanceDecision = {
  status: AlgorithmSeedCandidateStatus
  score: number
  shouldPublish: boolean
  runtimePublicationPolicy?: AlgorithmSeedRuntimePublicationPolicy
  scopeType: AlgorithmSeedOverrideScope | null
  quarantineReason: string | null
  reasons: string[]
  warnings: string[]
  audit: AlgorithmSeedAutoGovernanceAudit
}

export type AlgorithmSeedRuntimePublicationPolicy = {
  localStatusOnly: boolean
  runtimeWriteAllowed: boolean
  requiredReleaseChain: string[]
  reasons: string[]
}

export type AlgorithmSeedAutoGovernanceAudit = {
  policy: Pick<AlgorithmSeedGovernancePolicy, 'seedType' | 'candidateOnly' | 'autoPublishEnabled' | 'promotionBoundary'>
  candidateQuality: AlgorithmSeedCandidateQuality
  validationGate: {
    ok: boolean
    releaseGate: 'pass' | 'quarantine' | 'review' | 'reject'
    issueSummary: AlgorithmSeedRuntimePayloadValidationResult['issueSummary']
    issues: AlgorithmSeedRuntimePayloadValidationResult['issues']
  }
  thresholdUsed: GovernanceThreshold & { source: 'default' | 'recommended' | 'standard_update' }
  evidenceGate: {
    ok: boolean
    hasEvidence: boolean
    evidenceKeys: string[]
    sourceFieldsPresent: boolean
  }
  precisionGate?: {
    ok: boolean
    p20Days: number | null
    p50Days: number | null
    p80Days: number | null
    p80P20Ratio: number | null
    lowerBoundDays: number | null
    upperBoundDays: number | null
    issueCodes: string[]
  }
  scoreBreakdown: {
    confidence: number
    sampleCount: number
    evidence: number
    variance: number
    total: number
  }
  inputs: {
    sampleCount: number
    variance: number
    confidenceScore: number
    crossProjects: number
    crossCompanies: number
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readEvidenceGate(summary: Record<string, unknown> | null | undefined, payload: Record<string, unknown>) {
  const evidenceSummary = isPlainObject(summary) ? summary : {}
  const payloadEvidenceKeys = payload.evidenceSourceKeys
  const evidenceKeys = Array.isArray(payloadEvidenceKeys)
    ? payloadEvidenceKeys.map(normalizeText).filter(Boolean)
    : []
  const sourceFieldsPresent = Boolean(normalizeText(payload.sourceStandard) && normalizeText(payload.sourceVersion))
  const hasEvidence = Object.keys(evidenceSummary).length > 0 || evidenceKeys.length > 0 || sourceFieldsPresent
  return {
    ok: hasEvidence,
    hasEvidence,
    evidenceKeys,
    sourceFieldsPresent,
  }
}

function resolveScope(candidate: AlgorithmSeedCandidateRow): AlgorithmSeedOverrideScope | null {
  if (normalizeText(candidate.project_id)) return 'project'
  if (normalizeText(candidate.company_id)) return 'company'
  return null
}

function readEvidenceNumber(summary: Record<string, unknown> | null | undefined, payload: Record<string, unknown>, keys: string[], fallback = 0) {
  const evidenceSummary = isPlainObject(summary) ? summary : {}
  for (const key of keys) {
    const value = normalizeNumber(evidenceSummary[key] ?? payload[key], NaN)
    if (Number.isFinite(value)) return value
  }
  return fallback
}

const STANDARD_DURATION_STRICT_P50_WINDOW_RATIO = 0.3
const STANDARD_DURATION_WIDE_DISTRIBUTION_RATIO = 4

function readNullableEvidenceNumber(summary: Record<string, unknown> | null | undefined, payload: Record<string, unknown>, keys: string[]) {
  const evidenceSummary = isPlainObject(summary) ? summary : {}
  for (const key of keys) {
    const value = normalizeNumber(evidenceSummary[key] ?? payload[key], NaN)
    if (Number.isFinite(value)) return value
  }
  return null
}

function buildRuntimePublicationPolicy(decision: AlgorithmSeedAutoGovernanceDecision): AlgorithmSeedRuntimePublicationPolicy {
  if (decision.status !== 'auto_published') {
    return {
      localStatusOnly: false,
      runtimeWriteAllowed: false,
      requiredReleaseChain: [],
      reasons: ['candidate_not_locally_auto_published'],
    }
  }

  return {
    localStatusOnly: true,
    runtimeWriteAllowed: false,
    requiredReleaseChain: [
      'release_exit_package',
      'seed_override_domain_writer',
      'consumer_verification',
      'impact_monitoring',
      'rollback_target',
    ],
    reasons: ['auto_published_is_local_governance_status_until_release_execution'],
  }
}

function readStandardDurationPrecisionGate(
  candidate: AlgorithmSeedCandidateRow,
  payload: Record<string, unknown>,
): AlgorithmSeedAutoGovernanceAudit['precisionGate'] {
  if (candidate.seed_type !== 'standard_work_duration') return undefined
  const p20 = readNullableEvidenceNumber(candidate.evidence_summary, payload, ['p20Days', 'p20_days', 'defaultDaysP20', 'default_days_p20'])
  const p50 = readNullableEvidenceNumber(candidate.evidence_summary, payload, ['p50Days', 'p50_days', 'defaultDaysP50', 'default_days_p50', 'defaultDays'])
  const p80 = readNullableEvidenceNumber(candidate.evidence_summary, payload, ['p80Days', 'p80_days', 'defaultDaysP80', 'default_days_p80'])
  if (!p20 || !p50 || !p80 || p20 <= 0 || p50 <= 0 || p80 <= 0) {
    return {
      ok: false,
      p20Days: p20,
      p50Days: p50,
      p80Days: p80,
      p80P20Ratio: null,
      lowerBoundDays: null,
      upperBoundDays: null,
      issueCodes: ['standard_duration_percentiles_missing'],
    }
  }
  const p80P20Ratio = Math.round((p80 / p20) * 1000) / 1000
  const lowerBoundDays = Math.max(1, Math.round(p50 * (1 - STANDARD_DURATION_STRICT_P50_WINDOW_RATIO)))
  const upperBoundDays = Math.max(lowerBoundDays, Math.round(p50 * (1 + STANDARD_DURATION_STRICT_P50_WINDOW_RATIO)))
  const issueCodes = [
    p80P20Ratio >= STANDARD_DURATION_WIDE_DISTRIBUTION_RATIO
      ? 'p80_p20_distribution_too_wide'
      : null,
    p20 < lowerBoundDays || p80 > upperBoundDays
      ? 'p50_precision_window_exceeded'
      : null,
  ].filter((item): item is string => Boolean(item))
  return {
    ok: issueCodes.length === 0,
    p20Days: p20,
    p50Days: p50,
    p80Days: p80,
    p80P20Ratio,
    lowerBoundDays,
    upperBoundDays,
    issueCodes,
  }
}

type GovernanceThreshold = {
  minSamples: number
  maxCv: number
  minConfidence: number
  minCrossProjects: number
  minCrossCompanies?: number
}

function readGovernanceThresholdRecord(summary: Record<string, unknown> | null | undefined, payload: Record<string, unknown>) {
  const evidenceSummary = isPlainObject(summary) ? summary : {}
  const fromEvidence = evidenceSummary.recommendedGovernanceThresholds
  const fromPayload = payload.recommendedGovernanceThresholds
  if (isPlainObject(fromEvidence)) return fromEvidence
  if (isPlainObject(fromPayload)) return fromPayload
  return null
}

function applyRecommendedGovernanceThreshold(
  base: GovernanceThreshold,
  candidate: AlgorithmSeedCandidateRow,
  payload: Record<string, unknown>,
): GovernanceThreshold & { source: 'default' | 'recommended' } {
  const recommended = readGovernanceThresholdRecord(candidate.evidence_summary, payload)
  if (!recommended) return { ...base, source: 'default' }
  const minSamples = Math.min(500, Math.max(base.minSamples, Math.trunc(normalizeNumber(recommended.minSamples, base.minSamples))))
  const maxCv = Math.max(0.12, Math.min(base.maxCv, normalizeNumber(recommended.maxCv, base.maxCv)))
  const minConfidence = Math.min(0.95, Math.max(base.minConfidence, normalizeNumber(recommended.minConfidence, base.minConfidence)))
  const minCrossProjects = Math.min(20, Math.max(base.minCrossProjects, Math.trunc(normalizeNumber(recommended.minCrossProjects, base.minCrossProjects))))
  const baseCrossCompanies = base.minCrossCompanies ?? 0
  const minCrossCompanies = Math.min(10, Math.max(baseCrossCompanies, Math.trunc(normalizeNumber(recommended.minCrossCompanies, baseCrossCompanies))))
  return {
    minSamples,
    maxCv,
    minConfidence,
    minCrossProjects,
    ...(minCrossCompanies > 0 ? { minCrossCompanies } : {}),
    source: 'recommended',
  }
}

function normalizeConfidenceScore(candidate: AlgorithmSeedCandidateRow, payload: Record<string, unknown>) {
  const explicit = normalizeNumber(candidate.confidence_score ?? payload.confidenceScore ?? payload.confidence_score ?? payload.confidence, NaN)
  if (Number.isFinite(explicit)) return Math.max(0, Math.min(1, explicit > 1 ? explicit / 100 : explicit))
  const confidence = normalizeText(candidate.confidence_level || 'low') as 'high' | 'medium' | 'low'
  if (confidence === 'high') return 0.9
  if (confidence === 'medium') return 0.7
  return 0.4
}

function governanceThreshold(candidate: AlgorithmSeedCandidateRow, scopeType: AlgorithmSeedOverrideScope | null, payload: Record<string, unknown>) {
  const base = getAlgorithmSeedGovernanceThreshold(candidate.seed_type, scopeType, candidate.candidate_source)
  if (base.source === 'standard_update') return base
  return applyRecommendedGovernanceThreshold(base, candidate, payload)
}

function buildGovernanceAudit(input: {
  policy: AlgorithmSeedGovernancePolicy
  candidateQuality: AlgorithmSeedCandidateQuality
  validationGate: AlgorithmSeedAutoGovernanceAudit['validationGate']
  threshold: GovernanceThreshold & { source: 'default' | 'recommended' | 'standard_update' }
  evidenceGate: ReturnType<typeof readEvidenceGate>
  precisionGate?: AlgorithmSeedAutoGovernanceAudit['precisionGate']
  sampleCount: number
  variance: number
  confidenceScore: number
  crossProjects: number
  crossCompanies: number
  scoreBreakdown: AlgorithmSeedAutoGovernanceAudit['scoreBreakdown']
}): AlgorithmSeedAutoGovernanceAudit {
  return {
    policy: {
      seedType: input.policy.seedType,
      candidateOnly: input.policy.candidateOnly,
      autoPublishEnabled: input.policy.autoPublishEnabled,
      promotionBoundary: input.policy.promotionBoundary,
    },
    candidateQuality: input.candidateQuality,
    validationGate: input.validationGate,
    thresholdUsed: input.threshold,
    evidenceGate: input.evidenceGate,
    ...(input.precisionGate ? { precisionGate: input.precisionGate } : {}),
    scoreBreakdown: input.scoreBreakdown,
    inputs: {
      sampleCount: input.sampleCount,
      variance: input.variance,
      confidenceScore: input.confidenceScore,
      crossProjects: input.crossProjects,
      crossCompanies: input.crossCompanies,
    },
  }
}

function buildValidationGate(validation: AlgorithmSeedRuntimePayloadValidationResult): AlgorithmSeedAutoGovernanceAudit['validationGate'] {
  const summary = validation.issueSummary
  const releaseGate = summary.errorCount > 0
    ? 'reject'
    : summary.quarantineCount > 0
      ? 'quarantine'
      : summary.reviewCount > 0
        ? 'review'
        : 'pass'
  return {
    ok: validation.ok && releaseGate === 'pass',
    releaseGate,
    issueSummary: summary,
    issues: validation.issues,
  }
}

export function evaluateAlgorithmSeedCandidate(candidate: AlgorithmSeedCandidateRow): AlgorithmSeedAutoGovernanceDecision {
  const reasons: string[] = []
  const warnings: string[] = []
  const payload = isPlainObject(candidate.candidate_payload) ? candidate.candidate_payload : {}
  const stableCode = normalizeText(candidate.stable_code)
  const scopeType = resolveScope(candidate)
  const sampleCount = Math.max(0, Math.trunc(normalizeNumber(candidate.sample_count, 0)))
  const variance = Math.abs(normalizeNumber(candidate.variance, 0))
  const confidenceScore = normalizeConfidenceScore(candidate, payload)
  const evidenceGate = readEvidenceGate(candidate.evidence_summary, payload)
  const precisionGate = readStandardDurationPrecisionGate(candidate, payload)
  const evidenceOk = evidenceGate.ok
  const policy = getAlgorithmSeedGovernancePolicy(candidate.seed_type)
  const validationGate = buildValidationGate(validateAlgorithmSeedRuntimePayload(candidate.seed_type, payload, {
    stableCode,
    strict: true,
  }))
  const candidateQuality = buildAlgorithmSeedCandidateQuality({
    seedType: candidate.seed_type,
    candidatePayload: payload,
    sampleCount: candidate.sample_count,
    variance: candidate.variance,
    confidenceLevel: candidate.confidence_level,
    confidenceScore: candidate.confidence_score,
    evidenceSummary: candidate.evidence_summary,
  })
  const threshold = governanceThreshold(candidate, scopeType, payload)
  const minSamples = threshold.minSamples
  const maxCv = threshold.maxCv
  const minConfidence = threshold.minConfidence
  const minCrossProjects = threshold.minCrossProjects
  const minCrossCompanies = Number('minCrossCompanies' in threshold ? threshold.minCrossCompanies ?? 0 : 0)
  const crossProjects = readEvidenceNumber(candidate.evidence_summary, payload, ['crossProjects', 'cross_projects', 'projectCount', 'project_count'], 0)
  const crossCompanies = readEvidenceNumber(candidate.evidence_summary, payload, ['crossCompanies', 'cross_companies', 'companyCount', 'company_count'], 0)
  const scoreBreakdown = {
    confidence: 0,
    sampleCount: 0,
    evidence: 0,
    variance: 0,
    total: 0,
  }
  const audit = () => buildGovernanceAudit({
    policy,
    candidateQuality,
    validationGate,
    threshold,
    evidenceGate,
    precisionGate,
    sampleCount,
    variance,
    confidenceScore,
    crossProjects,
    crossCompanies,
    scoreBreakdown: { ...scoreBreakdown },
  })

  if (candidate.action_policy === 'candidate_only') {
    return {
      status: 'candidate_only',
      score: 0,
      shouldPublish: false,
      scopeType,
      quarantineReason: null,
      reasons: ['action_policy_candidate_only'],
      warnings: ['candidate_kept_without_runtime_effect'],
      audit: audit(),
    }
  }

  if (!stableCode) {
    return {
      status: 'rejected',
      score: 0,
      shouldPublish: false,
      scopeType,
      quarantineReason: 'stable_code_missing',
      reasons: ['stable_code_missing'],
      warnings,
      audit: audit(),
    }
  }

  if (Object.keys(payload).length === 0) {
    return {
      status: 'rejected',
      score: 0,
      shouldPublish: false,
      scopeType,
      quarantineReason: 'candidate_payload_empty',
      reasons: ['candidate_payload_empty'],
      warnings,
      audit: audit(),
    }
  }

  if (validationGate.releaseGate === 'reject') {
    return {
      status: 'rejected',
      score: 0,
      shouldPublish: false,
      scopeType,
      quarantineReason: 'validation_error_required',
      reasons: ['validation_error_required'],
      warnings,
      audit: audit(),
    }
  }

  if (validationGate.releaseGate === 'quarantine') {
    return {
      status: 'quarantined',
      score: 0,
      shouldPublish: false,
      scopeType,
      quarantineReason: 'validation_quarantine_required',
      reasons: ['validation_quarantine_required'],
      warnings,
      audit: audit(),
    }
  }

  if (validationGate.releaseGate === 'review') {
    return {
      status: 'candidate_only',
      score: 0,
      shouldPublish: false,
      scopeType,
      quarantineReason: null,
      reasons: ['validation_review_required'],
      warnings: [...warnings, 'manual_review_required_before_publish'],
      audit: audit(),
    }
  }

  if (candidate.seed_type === 'standard_internal_flow' && payload.reviewNeeded === true) {
    return {
      status: 'quarantined',
      score: 0,
      shouldPublish: false,
      scopeType,
      quarantineReason: 'standard_internal_flow_back_validation_requires_manual_review',
      reasons: ['standard_internal_flow_back_validation_requires_manual_review'],
      warnings: [
        'candidate_kept_without_runtime_effect',
        'manual_seed_or_template_source_order_review_required',
      ],
      audit: audit(),
    }
  }

  if (payload.reviewNeeded === true || payload.webVerified === false) {
    return {
      status: 'quarantined',
      score: 0,
      shouldPublish: false,
      scopeType,
      quarantineReason: 'candidate_payload_not_source_backed',
      reasons: ['candidate_payload_not_source_backed'],
      warnings,
      audit: audit(),
    }
  }

  if (!isAlgorithmSeedPayloadActive(candidate.seed_type, payload)) {
    return {
      status: 'candidate_only',
      score: 0,
      shouldPublish: false,
      scopeType,
      quarantineReason: null,
      reasons: ['seed_rule_inactive'],
      warnings: ['candidate_kept_without_runtime_effect'],
      audit: audit(),
    }
  }

  if (!scopeType) {
    return {
      status: 'candidate_only',
      score: 35,
      shouldPublish: false,
      scopeType,
      quarantineReason: null,
      reasons: ['missing_effective_scope'],
      warnings: ['candidate_kept_without_runtime_effect'],
      audit: audit(),
    }
  }

  let score = 0
  scoreBreakdown.confidence = Math.round(confidenceScore * 40)
  score += scoreBreakdown.confidence

  if (sampleCount >= minSamples) {
    scoreBreakdown.sampleCount = 25
    score += scoreBreakdown.sampleCount
  }
  else warnings.push(`sample_count_below_minimum:${sampleCount}/${minSamples}`)

  if (minCrossProjects > 0 && crossProjects < minCrossProjects) {
    warnings.push(`cross_projects_below_minimum:${crossProjects}/${minCrossProjects}`)
  }
  if (minCrossCompanies > 0 && crossCompanies < minCrossCompanies) {
    warnings.push(`cross_companies_below_minimum:${crossCompanies}/${minCrossCompanies}`)
  }

  if (evidenceOk) {
    scoreBreakdown.evidence = 25
    score += scoreBreakdown.evidence
  }
  else warnings.push('evidence_missing')

  if (variance <= maxCv) {
    scoreBreakdown.variance = 15
    score += scoreBreakdown.variance
  }
  else if (variance <= 0.6) warnings.push(`variance_above_publish_threshold:${variance}/${maxCv}`)
  scoreBreakdown.total = score

  if (precisionGate && !precisionGate.ok) {
    return {
      status: 'candidate_only',
      score,
      shouldPublish: false,
      scopeType,
      quarantineReason: null,
      reasons: ['standard_duration_precision_review_required'],
      warnings: [
        ...warnings,
        ...precisionGate.issueCodes,
        'candidate_kept_without_runtime_effect',
      ],
      audit: audit(),
    }
  }

  if (!evidenceOk) {
    return {
      status: 'quarantined',
      score,
      shouldPublish: false,
      scopeType,
      quarantineReason: 'evidence_missing',
      reasons: ['evidence_missing'],
      warnings,
      audit: audit(),
    }
  }

  if (variance > 0.6) {
    return {
      status: 'quarantined',
      score,
      shouldPublish: false,
      scopeType,
      quarantineReason: 'variance_out_of_range',
      reasons: ['variance_out_of_range'],
      warnings,
      audit: audit(),
    }
  }

  if (confidenceScore < 0.6) {
    return {
      status: 'candidate_only',
      score,
      shouldPublish: false,
      scopeType,
      quarantineReason: null,
      reasons: ['confidence_below_candidate_threshold'],
      warnings,
      audit: audit(),
    }
  }

  if (isAlgorithmSeedCandidateOnly(candidate.seed_type)) {
    return {
      status: 'candidate_only',
      score,
      shouldPublish: false,
      scopeType,
      quarantineReason: null,
      reasons: [`${candidate.seed_type}_requires_curated_seed_promotion`],
      warnings: [
        ...warnings,
        'candidate_kept_without_runtime_effect',
        'candidate_requires_curated_seed_or_enterprise_standard_library_governance',
      ],
      audit: audit(),
    }
  }

  if (
    sampleCount < minSamples
    || confidenceScore < minConfidence
    || variance > maxCv
    || (minCrossProjects > 0 && crossProjects < minCrossProjects)
    || (minCrossCompanies > 0 && crossCompanies < minCrossCompanies)
    || score < 80
  ) {
    return {
      status: 'candidate_only',
      score,
      shouldPublish: false,
      scopeType,
      quarantineReason: null,
      reasons: ['insufficient_auto_publish_confidence'],
      warnings,
      audit: audit(),
    }
  }

  return {
    status: 'auto_published',
    score,
    shouldPublish: true,
    scopeType,
    quarantineReason: null,
    reasons: ['auto_governance_passed'],
    warnings,
    audit: audit(),
  }
}

export async function autoGovernAlgorithmSeedUpgradeCandidate(
  candidateId: string,
  input: AlgorithmSeedAutoGovernanceInput,
) {
  const companyId = normalizeText(input.companyId) || null
  const projectId = normalizeText(input.projectId) || null
  if (input.scopeType === 'project' && !projectId) {
    throw Object.assign(new Error('Project scope is required for algorithm seed governance'), { code: 'CANDIDATE_SCOPE_REQUIRED' })
  }
  if (input.scopeType === 'company' && !companyId) {
    throw Object.assign(new Error('Company scope is required for algorithm seed governance'), { code: 'CANDIDATE_SCOPE_REQUIRED' })
  }

  let candidateQuery = supabase
    .from('algorithm_seed_upgrade_candidates')
    .select('*')
    .eq('id', candidateId)
  candidateQuery = input.scopeType === 'project'
    ? candidateQuery.eq('project_id', projectId)
    : candidateQuery.eq('company_id', companyId).is('project_id', null)

  const { data: candidate, error: loadError } = await candidateQuery.maybeSingle()
  if (loadError) throw loadError
  if (!candidate) {
    throw Object.assign(new Error('Algorithm seed upgrade candidate not found'), { code: 'CANDIDATE_NOT_FOUND' })
  }

  const rawDecision = evaluateAlgorithmSeedCandidate(candidate as AlgorithmSeedCandidateRow)
  const decision = {
    ...rawDecision,
    runtimePublicationPolicy: buildRuntimePublicationPolicy(rawDecision),
  }
  const now = new Date().toISOString()
  const governanceResult = {
    status: decision.status,
    score: decision.score,
    reasons: decision.reasons,
    warnings: decision.warnings,
    scopeType: decision.scopeType,
    runtimePublicationPolicy: decision.runtimePublicationPolicy,
    policy: decision.audit.policy,
    candidateQuality: decision.audit.candidateQuality,
    thresholdUsed: decision.audit.thresholdUsed,
    evidenceGate: decision.audit.evidenceGate,
    scoreBreakdown: decision.audit.scoreBreakdown,
    inputs: decision.audit.inputs,
    governedAt: now,
  }

  let updateQuery = supabase
    .from('algorithm_seed_upgrade_candidates')
    .update({
      status: decision.status,
      auto_score: decision.score,
      auto_governance_result: governanceResult,
      quarantine_reason: decision.quarantineReason,
      auto_governed_at: now,
      updated_at: now,
    })
    .eq('id', candidateId)
  updateQuery = input.scopeType === 'project'
    ? updateQuery.eq('project_id', projectId)
    : updateQuery.eq('company_id', companyId).is('project_id', null)

  const { data: governedCandidate, error: updateError } = await updateQuery
    .select('*')
    .single()
  if (updateError) throw updateError

  let override: unknown = null
  if (decision.runtimePublicationPolicy.runtimeWriteAllowed && decision.scopeType) {
    override = await createAlgorithmSeedOverride({
      seedType: candidate.seed_type,
      stableCode: candidate.stable_code,
      scopeType: decision.scopeType,
      projectId: candidate.project_id,
      companyId: candidate.company_id,
      overridePayload: candidate.candidate_payload,
      sourceCandidateId: candidate.id,
      createdBy: candidate.created_by ?? null,
      publishedBy: input.triggeredBy ?? candidate.created_by ?? null,
      autoGovernanceResult: governanceResult,
    })
  }

  return { candidate: governedCandidate, decision, override }
}
