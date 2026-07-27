import { supabase } from './dbService.js'
import {
  loadAlgorithmAssetLearnableParameterRuntimeValue,
  type AlgorithmAssetLearnableParameterCanaryRuntimeBoundary,
  type AlgorithmAssetLearnableParameterRuntimeConsumptionMode,
  type AlgorithmAssetLearnableParameterRuntimeConsumptionQueryExec,
} from './algorithmAssetLearnableParameterRuntimeConsumptionService.js'
import type { DurationContextPolicyActionKey, DurationContextPolicyModelFamily } from './durationContextPolicyLearningService.js'

export interface PreviewDurationContextPolicySelectionInput {
  projectId?: string | null
  stateBucket?: string | null
  asOfDate?: string | null
}

export interface ResolveDurationContextPolicyRuntimeSelectionInput {
  parameterKey: string
  deterministicValue: number
  companyId?: string | null
  projectId?: string | null
  allowSystemScope?: boolean
  consumptionMode?: AlgorithmAssetLearnableParameterRuntimeConsumptionMode
  canaryRuntimeBoundary?: AlgorithmAssetLearnableParameterCanaryRuntimeBoundary | null
  queryExec?: AlgorithmAssetLearnableParameterRuntimeConsumptionQueryExec
}

export interface DurationContextPolicyReadonlySelectionVersion {
  id: string
  modelFamily: DurationContextPolicyModelFamily
  modelVersion: string
  sourceCandidateId: string
  status: string
  activationMode: string
  runtimeMutationPolicy: 'none_version_registry_only'
  runtimeAutoPublishEligible: false
  stateBucket: string
  actionKey: DurationContextPolicyActionKey
  replayCaseCount: number
  averageProjectedRewardDelta: number
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function readNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter(Boolean)
    : []
}

function readIsoDate(value: unknown) {
  const text = normalizeText(value)
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null
}

function compareIsoDate(left: string | null, right: string | null) {
  if (!left || !right) return 0
  return left.localeCompare(right)
}

function hasExplicitCanaryBoundary(boundary: AlgorithmAssetLearnableParameterCanaryRuntimeBoundary | null | undefined) {
  return Boolean(
    normalizeText(boundary?.consumerKey)
    && normalizeText(boundary?.scopeBoundary)
    && Array.isArray(boundary?.stopConditionKeys)
    && boundary.stopConditionKeys.some((key) => normalizeText(key)),
  )
}

export async function resolveDurationContextPolicyRuntimeSelection(
  input: ResolveDurationContextPolicyRuntimeSelectionInput,
) {
  const parameterKey = normalizeText(input.parameterKey)
  const deterministicValue = Number(input.deterministicValue)
  const consumptionMode = input.consumptionMode === 'canary' ? 'canary' : 'stable'
  if (!parameterKey || !Number.isFinite(deterministicValue)) {
    return {
      selectorCode: 'duration_context_policy_runtime_selector' as const,
      parameterKey,
      consumptionMode,
      deterministicValue,
      selectedValue: deterministicValue,
      effectiveSource: 'deterministic_current_factor' as const,
      runtimeApplied: false,
      publicationKey: null,
      publicationStatus: null,
      scopeLevel: null,
      rollbackTarget: null,
      reasonCodes: [
        ...(!parameterKey ? ['parameter_key_required'] : []),
        ...(!Number.isFinite(deterministicValue) ? ['finite_deterministic_value_required'] : []),
      ],
    }
  }
  if (consumptionMode === 'canary' && !hasExplicitCanaryBoundary(input.canaryRuntimeBoundary)) {
    return {
      selectorCode: 'duration_context_policy_runtime_selector' as const,
      parameterKey,
      consumptionMode,
      deterministicValue,
      selectedValue: deterministicValue,
      effectiveSource: 'deterministic_current_factor' as const,
      runtimeApplied: false,
      publicationKey: null,
      publicationStatus: null,
      scopeLevel: null,
      rollbackTarget: null,
      reasonCodes: ['explicit_canary_runtime_boundary_required'],
    }
  }

  const runtime = await loadAlgorithmAssetLearnableParameterRuntimeValue({
    parameterKey,
    companyId: normalizeId(input.companyId),
    projectId: normalizeId(input.projectId),
    allowSystemScope: input.allowSystemScope === true,
    consumptionMode,
    canaryRuntimeBoundary: consumptionMode === 'canary' ? input.canaryRuntimeBoundary : null,
    queryExec: input.queryExec,
  })
  const expectedPublicationStatus = consumptionMode === 'canary' ? 'canary' : 'published'
  const runtimeApplied = runtime.runtimeConsumable
    && runtime.consumptionMode === consumptionMode
    && runtime.publicationStatus === expectedPublicationStatus
    && typeof runtime.runtimeValue === 'number'
  return {
    selectorCode: 'duration_context_policy_runtime_selector' as const,
    parameterKey,
    consumptionMode,
    deterministicValue,
    selectedValue: runtimeApplied ? runtime.runtimeValue! : deterministicValue,
    effectiveSource: runtimeApplied
      ? consumptionMode === 'canary'
        ? 'canary_runtime_publication' as const
        : 'stable_runtime_publication' as const
      : 'deterministic_current_factor' as const,
    runtimeApplied,
    publicationKey: runtime.publicationKey,
    publicationStatus: runtime.publicationStatus,
    scopeLevel: runtime.scopeLevel,
    rollbackTarget: runtime.rollbackTarget,
    reasonCodes: runtimeApplied
      ? []
      : Array.from(new Set([
          ...runtime.reasons,
          ...(runtime.runtimeConsumable && runtime.consumptionMode !== consumptionMode
            ? ['runtime_consumption_mode_mismatch']
            : []),
          ...(runtime.runtimeConsumable && runtime.publicationStatus !== expectedPublicationStatus
            ? ['runtime_publication_status_mismatch']
            : []),
        ])),
  }
}

function mapVersion(row: Record<string, unknown>): DurationContextPolicyReadonlySelectionVersion {
  return {
    id: normalizeText(row.id),
    modelFamily: normalizeText(row.model_family) as DurationContextPolicyModelFamily || 'contextual_bandit_v1',
    modelVersion: normalizeText(row.model_version) || 'contextual_bandit_v1',
    sourceCandidateId: normalizeText(row.source_candidate_id),
    status: normalizeText(row.version_status),
    activationMode: normalizeText(row.activation_mode),
    runtimeMutationPolicy: 'none_version_registry_only',
    runtimeAutoPublishEligible: false,
    stateBucket: normalizeText(row.state_bucket),
    actionKey: normalizeText(row.action_key) as DurationContextPolicyActionKey,
    replayCaseCount: Math.max(0, Math.trunc(readNumber(row.replay_case_count, 0))),
    averageProjectedRewardDelta: readNumber(row.average_projected_reward_delta, 0),
  }
}

function evaluateBlockReasons(input: {
  row: Record<string, unknown>
  projectId: string | null
  stateBucket: string
  asOfDate: string | null
}) {
  const reasons: string[] = []
  const scope = readRecord(input.row.canary_scope)
  const scopedProjectIds = readStringList(scope.projectIds)
  const rowProjectId = normalizeId(input.row.project_id)
  const scopeStartDate = readIsoDate(scope.startDate)
  const scopeEndDate = readIsoDate(scope.endDate)
  const expiresAt = readIsoDate(input.row.expires_at)

  if (normalizeText(input.row.version_status) !== 'canary') reasons.push('version_status_not_canary')
  if (normalizeText(input.row.runtime_mutation_policy) !== 'none_version_registry_only') reasons.push('runtime_boundary_not_registry_only')
  if (input.stateBucket && normalizeText(input.row.state_bucket) !== input.stateBucket) reasons.push('state_bucket_mismatch')
  if (input.projectId) {
    const scopedMatch = scopedProjectIds.length === 0 || scopedProjectIds.includes(input.projectId)
    const projectMatch = !rowProjectId || rowProjectId === input.projectId
    if (!scopedMatch || !projectMatch) reasons.push('project_scope_mismatch')
  }
  if (input.asOfDate) {
    if (scopeStartDate && compareIsoDate(input.asOfDate, scopeStartDate) < 0) reasons.push('version_expired_or_outside_scope_date')
    if (scopeEndDate && compareIsoDate(input.asOfDate, scopeEndDate) > 0) reasons.push('version_expired_or_outside_scope_date')
    if (expiresAt && compareIsoDate(input.asOfDate, expiresAt) > 0) reasons.push('version_expired_or_outside_scope_date')
  }

  return Array.from(new Set(reasons))
}

export async function previewDurationContextPolicySelection(
  input: PreviewDurationContextPolicySelectionInput,
) {
  const projectId = normalizeId(input.projectId)
  const stateBucket = normalizeText(input.stateBucket)
  const asOfDate = readIsoDate(input.asOfDate) ?? new Date().toISOString().slice(0, 10)
  const { data, error } = await (supabase as any)
    .from('duration_context_policy_versions')
    .select('*')
    .eq('model_family', 'contextual_bandit_v1')
    .order('approved_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(`Failed to load duration context policy versions: ${error.message}`)

  const rows = Array.isArray(data) ? data as Record<string, unknown>[] : []
  const evaluated = rows.map((row) => ({
    row,
    blockedReasons: evaluateBlockReasons({ row, projectId, stateBucket, asOfDate }),
  }))
  const selected = evaluated.find((item) => item.blockedReasons.length === 0) ?? null
  const blockedReasons = Array.from(new Set(evaluated.flatMap((item) => item.blockedReasons)))
  const wouldApplyPolicyVersion = selected ? mapVersion(selected.row) : null

  return {
    selectorCode: 'duration_context_policy_readonly_selector' as const,
    frontendExposurePolicy: 'backend_admin_api_only' as const,
    runtimeMutationPolicy: 'none_selector_explain_only' as const,
    projectId,
    stateBucket,
    asOfDate,
    evaluatedVersionCount: rows.length,
    blockedCount: evaluated.filter((item) => item.blockedReasons.length > 0).length,
    blockedReasons,
    wouldApply: Boolean(wouldApplyPolicyVersion),
    wouldApplyPolicyVersion,
    explain: {
      selectionMode: 'preview_only' as const,
      runtimePChanged: false,
      durationContextFactorsChanged: false,
      productionBoundary: 'deterministic_duration_context_rules_remain_authoritative' as const,
    },
  }
}
