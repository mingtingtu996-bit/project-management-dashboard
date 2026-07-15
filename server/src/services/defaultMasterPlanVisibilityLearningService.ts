import { query as rawQuery } from '../database.js'
import { createAndPersistAlgorithmAssetCandidateEvent } from './algorithmAssetCandidateEventAdapterService.js'
import type { AlgorithmAssetGovernanceQueryExec } from './algorithmAssetGovernancePersistenceService.js'
import type {
  DefaultMasterPlanVisibilityClass,
  DefaultMasterPlanVisibilityPolicyRecord,
} from './defaultMasterPlanVisibilityService.js'

export type DefaultMasterPlanVisibilityFeedbackEventRow = {
  id?: unknown
  company_id?: unknown
  companyId?: unknown
  project_id?: unknown
  projectId?: unknown
  asset_key?: unknown
  assetKey?: unknown
  source_module?: unknown
  sourceModule?: unknown
  event_status?: unknown
  eventStatus?: unknown
  candidate_payload?: unknown
  candidatePayload?: unknown
  created_at?: unknown
  createdAt?: unknown
}

export type DefaultMasterPlanVisibilityPolicyCandidate = {
  companyId: string
  businessType: string
  stableCode: string
  independentProjectCount: number
  observationCount: number
  agreementRate: number
  desiredVisibleOnMasterPlan: boolean
  sourceEventIds: string[]
  policyRecord: DefaultMasterPlanVisibilityPolicyRecord & {
    learningEvidence: {
      independentProjectCount: number
      observationCount: number
      agreementRate: number
      sourceEventIds: string[]
    }
  }
}

export type RunDefaultMasterPlanVisibilityLearningSweepInput = {
  queryExec?: AlgorithmAssetGovernanceQueryExec
  minimumIndependentProjects?: number
  minimumAgreementRate?: number
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function record(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function boolean(value: unknown) {
  return value === true || text(value).toLowerCase() === 'true'
}

function escapeExactPattern(value: string) {
  return `^${value.replace(/[^A-Za-z0-9_]/g, '\\$&')}$`
}

type NormalizedObservation = {
  eventId: string
  companyId: string
  projectId: string
  businessType: string
  stableCode: string
  desiredVisibleOnMasterPlan: boolean
  pmDecision: string
  systemVisibilityClass: DefaultMasterPlanVisibilityClass
  protectedFromAutoHide: boolean
}

function normalizeVisibilityClass(value: unknown): DefaultMasterPlanVisibilityClass {
  const normalized = text(value)
  if (normalized === 'commitment_milestone'
    || normalized === 'primary_control'
    || normalized === 'interface_gate'
    || normalized === 'internal_network_constraint'
    || normalized === 'detail_plan_only'
    || normalized === 'evidence_only') return normalized
  return 'primary_control'
}

function normalizeEventObservations(row: DefaultMasterPlanVisibilityFeedbackEventRow): NormalizedObservation[] {
  const payload = record(row.candidate_payload ?? row.candidatePayload)
  const companyId = text(row.company_id ?? row.companyId)
  const projectId = text(row.project_id ?? row.projectId)
  const businessType = text(payload.businessType ?? payload.business_type)
  const eventId = text(row.id)
  if (!companyId || !projectId || !businessType) return []
  return array(payload.observations).flatMap((value) => {
    const observation = record(value)
    const stableCode = text(observation.stableCode ?? observation.stable_code)
    const pmDecision = text(observation.pmDecision ?? observation.pm_decision)
    if (!stableCode || !['keep', 'hide', 'promote'].includes(pmDecision)) return []
    return [{
      eventId,
      companyId,
      projectId,
      businessType,
      stableCode,
      desiredVisibleOnMasterPlan: boolean(observation.desiredVisibleOnMasterPlan ?? observation.desired_visible_on_master_plan),
      pmDecision,
      systemVisibilityClass: normalizeVisibilityClass(observation.systemVisibilityClass ?? observation.system_visibility_class),
      protectedFromAutoHide: boolean(observation.protectedFromAutoHide ?? observation.protected_from_auto_hide),
    }]
  })
}

export function aggregateDefaultMasterPlanVisibilityPolicyCandidates(
  rows: readonly DefaultMasterPlanVisibilityFeedbackEventRow[],
  options: { minimumIndependentProjects?: number; minimumAgreementRate?: number } = {},
): DefaultMasterPlanVisibilityPolicyCandidate[] {
  const minimumIndependentProjects = Math.max(1, Math.round(options.minimumIndependentProjects ?? 3))
  const minimumAgreementRate = Math.min(1, Math.max(0.5, options.minimumAgreementRate ?? 0.75))
  const observationByScopeProject = new Map<string, NormalizedObservation>()
  for (const observation of rows.flatMap(normalizeEventObservations)) {
    if (observation.protectedFromAutoHide && !observation.desiredVisibleOnMasterPlan) continue
    const key = [observation.companyId, observation.businessType, observation.stableCode, observation.projectId].join('|')
    observationByScopeProject.set(key, observation)
  }

  const groups = new Map<string, NormalizedObservation[]>()
  for (const observation of observationByScopeProject.values()) {
    const key = [observation.companyId, observation.businessType, observation.stableCode].join('|')
    groups.set(key, [...(groups.get(key) ?? []), observation])
  }

  const candidates: DefaultMasterPlanVisibilityPolicyCandidate[] = []
  for (const observations of groups.values()) {
    const independentProjectCount = new Set(observations.map((item) => item.projectId)).size
    if (independentProjectCount < minimumIndependentProjects) continue
    const visibleVotes = observations.filter((item) => item.desiredVisibleOnMasterPlan).length
    const hiddenVotes = observations.length - visibleVotes
    const desiredVisibleOnMasterPlan = visibleVotes > hiddenVotes
    const agreementRate = Math.max(visibleVotes, hiddenVotes) / observations.length
    if (agreementRate < minimumAgreementRate) continue
    const first = observations[0]!
    const sourceEventIds = [...new Set(observations.map((item) => item.eventId).filter(Boolean))]
    const visibilityClass: DefaultMasterPlanVisibilityClass = desiredVisibleOnMasterPlan
      ? 'primary_control'
      : 'detail_plan_only'
    const policyRecord = {
      stableCode: `pm-feedback-${first.businessType}-${first.stableCode}`,
      businessTypes: [first.businessType],
      targetStableCodePatterns: [escapeExactPattern(first.stableCode)],
      visibilityClass,
      visibleOnMasterPlan: desiredVisibleOnMasterPlan,
      allowPromotionFromLinkedProjection: desiredVisibleOnMasterPlan
        && observations.some((item) => item.pmDecision === 'promote'),
      priority: 1_000,
      source: 'pm_feedback_governed_override' as const,
      isActive: true,
      evidenceSourceKeys: sourceEventIds,
      learningEvidence: {
        independentProjectCount,
        observationCount: observations.length,
        agreementRate,
        sourceEventIds,
      },
    }
    candidates.push({
      companyId: first.companyId,
      businessType: first.businessType,
      stableCode: first.stableCode,
      independentProjectCount,
      observationCount: observations.length,
      agreementRate,
      desiredVisibleOnMasterPlan,
      sourceEventIds,
      policyRecord,
    })
  }
  return candidates.sort((left, right) => (
    left.companyId.localeCompare(right.companyId)
    || left.businessType.localeCompare(right.businessType)
    || left.stableCode.localeCompare(right.stableCode)
  ))
}

// workspace-isolation-system-job-approved: daily service-role learning sweep reads all companies, then partitions candidate output by company and project evidence.
async function readFeedbackEvents(queryExec?: AlgorithmAssetGovernanceQueryExec) {
  const params = [
    'defaultMasterPlanVisibilityFeedbackService',
    'default_master_plan_visibility_feedback.%',
    ['candidate', 'review_required', 'replay_ready'],
    'defaultMasterPlanVisibilityLearningService',
    'default_master_plan_visibility_policy.%',
  ]
  if (queryExec) {
    return queryExec<DefaultMasterPlanVisibilityFeedbackEventRow>(
      `select id, company_id, project_id, asset_key, source_module, event_status, candidate_payload, created_at
         from public.algorithm_asset_candidate_events
        where (
          source_module = $1
          and asset_key like $2
          and event_status = any($3::text[])
        ) or (
          source_module = $4
          and asset_key like $5
        )
        order by created_at asc, id asc`,
      params,
    )
  }
  const result = await rawQuery(
    `select id, company_id, project_id, asset_key, source_module, event_status, candidate_payload, created_at
       from public.algorithm_asset_candidate_events
      where (
        source_module = $1
        and asset_key like $2
        and event_status = any($3::text[])
      ) or (
        source_module = $4
        and asset_key like $5
      )
      order by created_at asc, id asc`,
    params,
  )
  return result.rows as DefaultMasterPlanVisibilityFeedbackEventRow[]
}

function sourceModuleOf(row: DefaultMasterPlanVisibilityFeedbackEventRow) {
  return text(row.source_module ?? row.sourceModule)
}

function assetKeyOf(row: DefaultMasterPlanVisibilityFeedbackEventRow) {
  return text(row.asset_key ?? row.assetKey)
}

function evidenceFingerprint(assetKey: string, desiredVisibleOnMasterPlan: boolean, sourceEventIds: string[]) {
  if (!assetKey || sourceEventIds.length === 0) return ''
  return [
    assetKey,
    desiredVisibleOnMasterPlan ? 'visible' : 'hidden',
    [...new Set(sourceEventIds.map(text).filter(Boolean))].sort().join(','),
  ].join('|')
}

function existingPolicyCandidateFingerprints(rows: readonly DefaultMasterPlanVisibilityFeedbackEventRow[]) {
  return new Set(rows.flatMap((row) => {
    if (sourceModuleOf(row) !== 'defaultMasterPlanVisibilityLearningService') return []
    const payload = record(row.candidate_payload ?? row.candidatePayload)
    const policyRecord = record(payload.policyRecord ?? payload.policy_record)
    const evidence = record(payload.evidence)
    const sourceEventIds = array(evidence.sourceEventIds ?? evidence.source_event_ids).map(text).filter(Boolean)
    const fingerprint = evidenceFingerprint(
      assetKeyOf(row),
      boolean(policyRecord.visibleOnMasterPlan ?? policyRecord.visible_on_master_plan),
      sourceEventIds,
    )
    return fingerprint ? [fingerprint] : []
  }))
}

export async function runDefaultMasterPlanVisibilityLearningSweep(
  input: RunDefaultMasterPlanVisibilityLearningSweepInput = {},
) {
  const candidateEvents = await readFeedbackEvents(input.queryExec)
  const feedbackEvents = candidateEvents.filter((row) => (
    sourceModuleOf(row) === 'defaultMasterPlanVisibilityFeedbackService'
  ))
  const existingFingerprints = existingPolicyCandidateFingerprints(candidateEvents)
  const candidates = aggregateDefaultMasterPlanVisibilityPolicyCandidates(feedbackEvents, {
    minimumIndependentProjects: input.minimumIndependentProjects,
    minimumAgreementRate: input.minimumAgreementRate,
  })
  let persistedCandidateCount = 0
  let duplicateCandidateCount = 0
  for (const candidate of candidates) {
    const assetKey = `default_master_plan_visibility_policy.${candidate.businessType}.${candidate.stableCode}`
    const fingerprint = evidenceFingerprint(
      assetKey,
      candidate.desiredVisibleOnMasterPlan,
      candidate.sourceEventIds,
    )
    if (fingerprint && existingFingerprints.has(fingerprint)) {
      duplicateCandidateCount += 1
      continue
    }
    await createAndPersistAlgorithmAssetCandidateEvent({
      assetKey,
      sourceSystem: 'defaultMasterPlanVisibilityLearningService',
      assetType: 'rule',
      companyId: candidate.companyId,
      projectId: null,
      candidatePayload: {
        seedType: 'master_plan_visibility_policy',
        policyRecord: candidate.policyRecord,
        evidence: {
          independentProjectCount: candidate.independentProjectCount,
          observationCount: candidate.observationCount,
          agreementRate: candidate.agreementRate,
          sourceEventIds: candidate.sourceEventIds,
        },
        replayRequirements: [
          'protected_commitment_rows_remain_visible',
          'phase_coverage_rate_equals_one',
          'visible_dependency_network_acyclic',
          'no_detail_row_count_fill',
        ],
        writesRuntimePolicy: false,
        writesTasksOrDependencies: false,
        mutationBoundary: 'candidate_only_until_governed_seed_publication',
      },
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_shadow',
      learningMaturity: 'governed_candidate',
      learningTarget: 'template_structure',
      requestedRuntimeEffect: 'candidate_only',
      generatedBy: 'system',
      queryExec: input.queryExec,
    })
    persistedCandidateCount += 1
    if (fingerprint) existingFingerprints.add(fingerprint)
  }

  return {
    status: persistedCandidateCount > 0
      ? 'visibility_policy_candidates_generated' as const
      : candidates.length > 0
        ? 'visibility_policy_candidates_already_current' as const
        : 'no_visibility_policy_candidate' as const,
    feedbackEventCount: feedbackEvents.length,
    policyCandidateCount: candidates.length,
    persistedCandidateCount,
    duplicateCandidateCount,
    writesRuntimePolicy: false as const,
    writesTasksOrDependencies: false as const,
    mutationBoundary: 'candidate_only_until_governed_seed_publication' as const,
  }
}
