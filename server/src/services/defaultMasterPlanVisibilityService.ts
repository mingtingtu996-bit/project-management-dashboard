import { signedDurationDayDelta } from '../utils/durationDays.js'
import { evaluateNonResidentialMasterControlPromotion } from './nonResidentialMasterControlProjectionService.js'

export type DefaultMasterPlanVisibilityClass =
  | 'commitment_milestone'
  | 'primary_control'
  | 'interface_gate'
  | 'internal_network_constraint'
  | 'detail_plan_only'
  | 'evidence_only'

export type DefaultMasterPlanVisibilityPolicyRecord = {
  stableCode: string
  businessTypes?: string[]
  targetStableCodePatterns?: string[]
  targetTitlePatterns?: string[]
  targetSourcePatterns?: string[]
  targetProjectionModes?: string[]
  visibilityClass: DefaultMasterPlanVisibilityClass
  visibleOnMasterPlan: boolean
  allowPromotionFromLinkedProjection?: boolean
  priority: number
  source: 'system_visibility_seed' | 'pm_feedback_governed_override' | string
  isActive?: boolean
  evidenceSourceKeys?: string[]
  sourceStandard?: string
  sourceVersion?: string
  sourceClauseRef?: string
  webVerified?: boolean
  reviewNeeded?: boolean
  protectedFromAutoHide?: boolean
  __resolverSource?: string
  __resolverVersionId?: string | null
  __seedVersionId?: string | null
}

export type DefaultMasterPlanVisibilityRow = {
  clientRowId: string
  parentClientRowId: string | null
  sortOrder: number
  values: Record<string, unknown>
  predecessorClientRowIds: string[]
  predecessorDependencies: Array<{
    clientRowId: string
    dependencyType?: string
    lagDays?: number
    source?: string
    [key: string]: unknown
  }>
  rowProjectionMode?: string | null
  executionPhase?: string | null
  executionLane?: string | null
  planItemKind?: string | null
  scheduleParticipation?: string | null
  linkedProjectionSource?: Record<string, unknown> | null
}

export type DefaultMasterPlanVisibilityDecision = {
  policyVersion: 'v1.4.23.1-master-plan-visibility-v1'
  businessType?: string
  businessSubtype?: string
  visibilityClass: DefaultMasterPlanVisibilityClass
  visibleOnMasterPlan: boolean
  protectedFromAutoHide: boolean
  policyStableCode: string
  policySource: string
  policyResolverSource: string | null
  policySeedVersionId: string | null
  reasons: string[]
  mutationBoundary: 'classification_only_no_db_write'
}

export type DefaultMasterPlanVisibilitySummary = {
  source: 'default_master_plan_visibility_policy'
  version: 'v1.4.23.1-master-plan-visibility-v1'
  businessType: string
  businessSubtype: string
  evaluatedRowCount: number
  visibleScheduleRowCount: number
  hiddenRowCount: number
  hiddenInternalConstraintRowCount: number
  hiddenDetailPlanRowCount: number
  hiddenEvidenceRowCount: number
  protectedVisibleRowCount: number
  phaseCoverageRate: number
  policyCoverageRate: number
  dependencyBridgeCount: number
  danglingVisibleDependencyCount: number
  runtimePolicyDecisionCount: number
  masterControlPromotionEligibleRowCount: number
  masterControlPromotionRejectedReasonCounts: Record<string, number>
  masterControlPromotionExecutionNatureCounts: Record<string, number>
  visibleStableCodes: string[]
  hiddenStableCodes: string[]
  mutationBoundary: 'classification_only_no_db_write'
}

type ApplyDefaultMasterPlanVisibilityPolicyInput = {
  rows: DefaultMasterPlanVisibilityRow[]
  businessType: string
  businessSubtype?: string | null
  policyRecords: readonly DefaultMasterPlanVisibilityPolicyRecord[]
}

const POLICY_VERSION = 'v1.4.23.1-master-plan-visibility-v1' as const
const PROTECTED_TITLE_PATTERN = /竣工|交付|移交|联合验收|专项验收|结构验收|正负零|handover|acceptance|delivery/i
const INTERFACE_TITLE_PATTERN = /验收|移交|封闭|送电|联调|调试|作业面|出正负零|handover|commission|energization|interface/i

function text(value: unknown) {
  return String(value ?? '').trim()
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function metadataOf(row: DefaultMasterPlanVisibilityRow) {
  return record(row.values.standard_task_metadata ?? row.values.standardTaskMetadata)
}

function projectionModeOf(row: DefaultMasterPlanVisibilityRow) {
  return text(row.rowProjectionMode ?? row.values.row_projection_mode ?? metadataOf(row).rowProjectionMode)
}

function stableCodeOf(row: DefaultMasterPlanVisibilityRow) {
  const metadata = metadataOf(row)
  return text(row.values.standard_work_code ?? metadata.stableCode ?? row.values.template_node_id ?? row.clientRowId)
}

function titleOf(row: DefaultMasterPlanVisibilityRow) {
  return text(row.values.title ?? row.values.name ?? row.values.standard_work_name)
}

function phaseOf(row: DefaultMasterPlanVisibilityRow) {
  return text(row.executionPhase ?? row.values.execution_phase ?? metadataOf(row).executionPhase)
}

function kindOf(row: DefaultMasterPlanVisibilityRow) {
  return text(row.planItemKind ?? row.values.plan_item_kind ?? metadataOf(row).planItemKind)
}

function sourcesOf(row: DefaultMasterPlanVisibilityRow) {
  const metadata = metadataOf(row)
  const masterPlanGeneration = record(metadata.masterPlanGeneration)
  const businessTypeMasterPlan = record(metadata.businessTypeMasterPlan)
  return unique([
    text(metadata.source),
    text(masterPlanGeneration.source),
    text(businessTypeMasterPlan.source),
    text(row.values.source_type),
    text(row.values.master_plan_generation_source),
  ])
}

function patternMatches(value: string, patterns: string[] | undefined) {
  if (!patterns || patterns.length === 0) return true
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern, 'i').test(value)
    } catch {
      return false
    }
  })
}

function policyMatches(
  policy: DefaultMasterPlanVisibilityPolicyRecord,
  row: DefaultMasterPlanVisibilityRow,
  businessType: string,
) {
  if (policy.isActive === false) return false
  if (policy.visibleOnMasterPlan
    && projectionModeOf(row) !== 'schedule_row'
    && policy.allowPromotionFromLinkedProjection !== true) return false
  if (policy.businessTypes && policy.businessTypes.length > 0 && !policy.businessTypes.includes(businessType)) return false
  if (!patternMatches(stableCodeOf(row), policy.targetStableCodePatterns)) return false
  if (!patternMatches(titleOf(row), policy.targetTitlePatterns)) return false
  if (!patternMatches(projectionModeOf(row), policy.targetProjectionModes)) return false
  if (policy.targetSourcePatterns && policy.targetSourcePatterns.length > 0) {
    const sources = sourcesOf(row)
    if (!sources.some((source) => patternMatches(source, policy.targetSourcePatterns))) return false
  }
  return true
}

function isProtectedRow(row: DefaultMasterPlanVisibilityRow) {
  if (kindOf(row) === 'milestone') return true
  const phase = phaseOf(row)
  return (phase === 'acceptance_handover' || phase === 'acceptance') && PROTECTED_TITLE_PATTERN.test(titleOf(row))
}

function buildDecision(
  row: DefaultMasterPlanVisibilityRow,
  businessType: string,
  policies: readonly DefaultMasterPlanVisibilityPolicyRecord[],
): DefaultMasterPlanVisibilityDecision {
  if (projectionModeOf(row) === 'schedule_row' && isProtectedRow(row)) {
    return {
      policyVersion: POLICY_VERSION,
      visibilityClass: 'commitment_milestone',
      visibleOnMasterPlan: true,
      protectedFromAutoHide: true,
      policyStableCode: 'protected-contractual-or-control-milestone',
      policySource: 'system_fail_safe_guard',
      policyResolverSource: null,
      policySeedVersionId: null,
      reasons: ['contractual_or_control_milestone_is_fail_safe_visible'],
      mutationBoundary: 'classification_only_no_db_write',
    }
  }

  const matched = [...policies]
    .filter((policy) => policyMatches(policy, row, businessType))
    .sort((left, right) => right.priority - left.priority || left.stableCode.localeCompare(right.stableCode))[0]
  if (matched) {
    return {
      policyVersion: POLICY_VERSION,
      visibilityClass: matched.visibilityClass,
      visibleOnMasterPlan: matched.visibleOnMasterPlan,
      protectedFromAutoHide: matched.protectedFromAutoHide === true,
      policyStableCode: matched.stableCode,
      policySource: matched.source,
      policyResolverSource: matched.__resolverSource ?? null,
      policySeedVersionId: matched.__resolverVersionId ?? matched.__seedVersionId ?? null,
      reasons: [
        matched.visibleOnMasterPlan ? 'matched_visible_significance_policy' : 'matched_hidden_significance_policy',
        ...(matched.evidenceSourceKeys ?? []),
      ],
      mutationBoundary: 'classification_only_no_db_write',
    }
  }

  const projectionMode = projectionModeOf(row)
  if (projectionMode !== 'schedule_row') {
    return {
      policyVersion: POLICY_VERSION,
      visibilityClass: projectionMode === 'gate_marker' || projectionMode === 'inline_control'
        ? 'evidence_only'
        : 'detail_plan_only',
      visibleOnMasterPlan: false,
      protectedFromAutoHide: false,
      policyStableCode: 'default-hidden-support-projection',
      policySource: 'system_default_policy',
      policyResolverSource: null,
      policySeedVersionId: null,
      reasons: ['non_schedule_projection_remains_outside_simple_master_plan'],
      mutationBoundary: 'classification_only_no_db_write',
    }
  }

  const interfaceGate = INTERFACE_TITLE_PATTERN.test(titleOf(row))
  return {
    policyVersion: POLICY_VERSION,
    visibilityClass: interfaceGate ? 'interface_gate' : 'primary_control',
    visibleOnMasterPlan: true,
    protectedFromAutoHide: false,
    policyStableCode: interfaceGate ? 'default-visible-interface-gate' : 'default-visible-schedule-control',
    policySource: 'system_default_policy',
    policyResolverSource: null,
    policySeedVersionId: null,
    reasons: [interfaceGate ? 'control_interface_is_visible' : 'existing_schedule_control_is_visible'],
    mutationBoundary: 'classification_only_no_db_write',
  }
}

function applyDecisionToRow(
  row: DefaultMasterPlanVisibilityRow,
  decision: DefaultMasterPlanVisibilityDecision,
) {
  const previousMode = projectionModeOf(row)
  const nextMode = decision.visibleOnMasterPlan ? 'schedule_row' : 'linked_projection'
  const metadata = metadataOf(row)
  const masterControlPromotionEligibility = evaluateNonResidentialMasterControlPromotion({
    businessType: decision.businessType ?? '',
    businessSubtype: decision.businessSubtype ?? '',
    row,
  })
  const linkedProjectionSource = record(row.linkedProjectionSource ?? row.values.linked_projection_source)
  const nextLinkedProjectionSource = decision.visibleOnMasterPlan
    ? linkedProjectionSource
    : {
        ...linkedProjectionSource,
        originalRowProjectionMode: text(linkedProjectionSource.originalRowProjectionMode) || previousMode,
        visibilityPolicyDemotion: true,
        retainedForInternalNetworkCalculation: true,
      }

  row.rowProjectionMode = nextMode
  row.scheduleParticipation = decision.visibleOnMasterPlan
    ? 'primary_schedule'
    : previousMode === 'schedule_row'
      ? decision.visibilityClass
      : text(row.scheduleParticipation ?? row.values.schedule_participation ?? metadata.scheduleParticipation)
        || decision.visibilityClass
  row.linkedProjectionSource = nextLinkedProjectionSource
  row.values = {
    ...row.values,
    row_projection_mode: nextMode,
    schedule_participation: row.scheduleParticipation,
    linked_projection_source: nextLinkedProjectionSource,
    standard_task_metadata: {
      ...metadata,
      rowProjectionMode: nextMode,
      scheduleParticipation: row.scheduleParticipation,
      masterPlanVisibilityDecision: decision,
      masterControlPromotionEligibility,
    },
  }
}

function dateDay(value: unknown) {
  const normalized = text(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null
  return signedDurationDayDelta('1970-01-01', normalized)
}

function startDayOf(row: DefaultMasterPlanVisibilityRow) {
  return dateDay(row.values.planned_start_date ?? row.values.start_date)
}

function rewireVisibleDependencies(rows: DefaultMasterPlanVisibilityRow[]) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  const visibleIds = new Set(rows.filter((row) => projectionModeOf(row) === 'schedule_row').map((row) => row.clientRowId))
  let dependencyBridgeCount = 0

  const visibleAncestors = (clientRowId: string, visited = new Set<string>(), path: string[] = []): Array<{
    row: DefaultMasterPlanVisibilityRow
    path: string[]
  }> => {
    if (!clientRowId || visited.has(clientRowId)) return []
    const candidate = rowById.get(clientRowId)
    if (!candidate) return []
    if (visibleIds.has(clientRowId)) return [{ row: candidate, path: [...path, clientRowId] }]
    const nextVisited = new Set(visited).add(clientRowId)
    return (candidate.predecessorDependencies ?? []).flatMap((dependency) => (
      visibleAncestors(text(dependency.clientRowId), nextVisited, [...path, clientRowId])
    ))
  }

  for (const row of rows) {
    if (!visibleIds.has(row.clientRowId)) continue
    const dependencyByPredecessor = new Map<string, DefaultMasterPlanVisibilityRow['predecessorDependencies'][number]>()
    for (const dependency of row.predecessorDependencies ?? []) {
      const predecessorId = text(dependency.clientRowId)
      if (!predecessorId || predecessorId === row.clientRowId) continue
      if (visibleIds.has(predecessorId) || !rowById.has(predecessorId)) {
        dependencyByPredecessor.set(predecessorId, dependency)
        continue
      }
      for (const ancestor of visibleAncestors(predecessorId)) {
        if (ancestor.row.clientRowId === row.clientRowId || dependencyByPredecessor.has(ancestor.row.clientRowId)) continue
        const successorStart = startDayOf(row)
        const predecessorStart = startDayOf(ancestor.row)
        dependencyByPredecessor.set(ancestor.row.clientRowId, {
          clientRowId: ancestor.row.clientRowId,
          dependencyType: 'SS',
          lagDays: successorStart !== null && predecessorStart !== null
            ? Math.max(0, successorStart - predecessorStart)
            : 0,
          source: 'dependency_intent_template',
          intentCode: 'master_plan_visibility_hidden_constraint_bridge',
          hiddenConstraintPath: ancestor.path,
          dependencyRuleEvidence: {
            source: 'default_master_plan_visibility_policy',
            evidenceLevel: 'system_visibility_bridge_l1',
            mutationBoundary: 'preview_no_write_wizard_commit_transactional',
            hiddenConstraintPath: ancestor.path,
          },
        })
        dependencyBridgeCount += 1
      }
    }
    row.predecessorDependencies = [...dependencyByPredecessor.values()]
    row.predecessorClientRowIds = unique(row.predecessorDependencies.map((dependency) => text(dependency.clientRowId)))
  }

  const danglingVisibleDependencyCount = rows
    .filter((row) => visibleIds.has(row.clientRowId))
    .flatMap((row) => row.predecessorDependencies ?? [])
    .filter((dependency) => rowById.has(text(dependency.clientRowId)) && !visibleIds.has(text(dependency.clientRowId)))
    .length
  return { dependencyBridgeCount, danglingVisibleDependencyCount }
}

function ensurePhaseCoverage(
  rows: DefaultMasterPlanVisibilityRow[],
  originalScheduleIds: Set<string>,
  decisions: Map<string, DefaultMasterPlanVisibilityDecision>,
) {
  const requiredPhases = unique(rows.filter((row) => originalScheduleIds.has(row.clientRowId)).map(phaseOf))
  for (const phase of requiredPhases) {
    if (rows.some((row) => phaseOf(row) === phase && projectionModeOf(row) === 'schedule_row')) continue
    const fallback = rows
      .filter((row) => originalScheduleIds.has(row.clientRowId) && phaseOf(row) === phase)
      .sort((left, right) => left.sortOrder - right.sortOrder || stableCodeOf(left).localeCompare(stableCodeOf(right)))[0]
    if (!fallback) continue
    const previous = decisions.get(fallback.clientRowId)
    const decision: DefaultMasterPlanVisibilityDecision = {
      policyVersion: POLICY_VERSION,
      visibilityClass: 'primary_control',
      visibleOnMasterPlan: true,
      protectedFromAutoHide: false,
      policyStableCode: 'phase-coverage-fail-safe',
      policySource: 'system_fail_safe_guard',
      policyResolverSource: previous?.policyResolverSource ?? null,
      policySeedVersionId: previous?.policySeedVersionId ?? null,
      reasons: ['at_least_one_control_row_required_for_each_generated_schedule_phase'],
      mutationBoundary: 'classification_only_no_db_write',
    }
    decisions.set(fallback.clientRowId, decision)
    applyDecisionToRow(fallback, decision)
  }
  return requiredPhases
}

export function readDefaultMasterPlanVisibilityDecision(
  row: Pick<DefaultMasterPlanVisibilityRow, 'values'>,
): DefaultMasterPlanVisibilityDecision | null {
  const decision = record(metadataOf(row as DefaultMasterPlanVisibilityRow).masterPlanVisibilityDecision)
  return decision.policyVersion === POLICY_VERSION
    ? decision as DefaultMasterPlanVisibilityDecision
    : null
}

export function applyDefaultMasterPlanVisibilityPolicy(
  input: ApplyDefaultMasterPlanVisibilityPolicyInput,
): DefaultMasterPlanVisibilitySummary {
  const businessType = text(input.businessType)
  const businessSubtype = text(input.businessSubtype)
  const originalScheduleIds = new Set(input.rows
    .filter((row) => projectionModeOf(row) === 'schedule_row')
    .map((row) => row.clientRowId))
  const decisions = new Map<string, DefaultMasterPlanVisibilityDecision>()
  for (const row of input.rows) {
    const decision = buildDecision(row, businessType, input.policyRecords)
    decision.businessType = businessType
    decision.businessSubtype = businessSubtype
    decisions.set(row.clientRowId, decision)
    applyDecisionToRow(row, decision)
  }

  const requiredPhases = ensurePhaseCoverage(input.rows, originalScheduleIds, decisions)
  const dependencySummary = rewireVisibleDependencies(input.rows)
  const visibleRows = input.rows.filter((row) => projectionModeOf(row) === 'schedule_row')
  const hiddenRows = input.rows.filter((row) => projectionModeOf(row) !== 'schedule_row')
  const visiblePhases = new Set(visibleRows.map(phaseOf).filter(Boolean))
  const decisionValues = [...decisions.values()]
  const promotionEligibilities = input.rows.map((row) => (
    record(metadataOf(row).masterControlPromotionEligibility)
  ))
  const masterControlPromotionRejectedReasonCounts: Record<string, number> = {}
  const masterControlPromotionExecutionNatureCounts: Record<string, number> = {}
  for (const row of input.rows) {
    const metadata = metadataOf(row)
    const executionNature = text(row.values.execution_nature ?? metadata.executionNature) || 'unspecified'
    masterControlPromotionExecutionNatureCounts[executionNature] = (
      masterControlPromotionExecutionNatureCounts[executionNature] ?? 0
    ) + 1
  }
  for (const eligibility of promotionEligibilities) {
    if (eligibility.eligible === true) continue
    for (const reasonCode of Array.isArray(eligibility.reasonCodes) ? eligibility.reasonCodes : []) {
      const normalized = text(reasonCode)
      if (!normalized) continue
      masterControlPromotionRejectedReasonCounts[normalized] = (
        masterControlPromotionRejectedReasonCounts[normalized] ?? 0
      ) + 1
    }
  }

  return {
    source: 'default_master_plan_visibility_policy',
    version: POLICY_VERSION,
    businessType,
    businessSubtype,
    evaluatedRowCount: input.rows.length,
    visibleScheduleRowCount: visibleRows.length,
    hiddenRowCount: hiddenRows.length,
    hiddenInternalConstraintRowCount: decisionValues.filter((decision) => decision.visibilityClass === 'internal_network_constraint' && !decision.visibleOnMasterPlan).length,
    hiddenDetailPlanRowCount: decisionValues.filter((decision) => decision.visibilityClass === 'detail_plan_only' && !decision.visibleOnMasterPlan).length,
    hiddenEvidenceRowCount: decisionValues.filter((decision) => decision.visibilityClass === 'evidence_only' && !decision.visibleOnMasterPlan).length,
    protectedVisibleRowCount: decisionValues.filter((decision) => decision.protectedFromAutoHide && decision.visibleOnMasterPlan).length,
    phaseCoverageRate: requiredPhases.length === 0
      ? 1
      : requiredPhases.filter((phase) => visiblePhases.has(phase)).length / requiredPhases.length,
    policyCoverageRate: input.rows.length === 0 ? 1 : decisions.size / input.rows.length,
    dependencyBridgeCount: dependencySummary.dependencyBridgeCount,
    danglingVisibleDependencyCount: dependencySummary.danglingVisibleDependencyCount,
    runtimePolicyDecisionCount: decisionValues.filter((decision) => decision.policyResolverSource === 'active_seed'
      || decision.policyResolverSource === 'company_override'
      || decision.policyResolverSource === 'project_override').length,
    masterControlPromotionEligibleRowCount: promotionEligibilities.filter((eligibility) => eligibility.eligible === true).length,
    masterControlPromotionRejectedReasonCounts,
    masterControlPromotionExecutionNatureCounts,
    visibleStableCodes: visibleRows.map(stableCodeOf),
    hiddenStableCodes: hiddenRows.map(stableCodeOf),
    mutationBoundary: 'classification_only_no_db_write',
  }
}
