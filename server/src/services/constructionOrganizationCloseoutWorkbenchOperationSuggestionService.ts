import type {
  AlgorithmAssetGovernanceWorkbenchOperationAction,
  AlgorithmAssetGovernanceWorkbenchOperationInput,
} from './algorithmAssetGovernanceWorkbenchOperationService.js'
import type {
  ConstructionOrganizationPlanNetworkDraft,
} from './constructionOrganizationPlanNetworkDraftService.js'
import type {
  ConstructionOrganizationProductOutcomeEvidenceWorkPackage,
} from './constructionOrganizationProductOutcomeCloseoutMatrixService.js'
import type {
  ConstructionOrganizationPlanNetworkRuntimeEngineCode,
} from './constructionOrganizationPlanNetworkRuntimeEvidenceService.js'

type RuntimeAnchorCandidate = {
  source?: string
  businessType?: string | null
  projectId?: string | null
  draftNetworkKey?: string | null
  optionId?: string | null
  publicationKey?: string | null
  readiness?: string | null
  evaluationStatus?: string | null
  hasReleaseExitHandoff?: boolean
  hasRuntimePublication?: boolean
  hasRuntimeEngineEvidence?: boolean
  hasRecommendationDecision?: boolean
  constructionOrganizationPlanNetworkDraft?: ConstructionOrganizationPlanNetworkDraft | null
  missingAnchorReasons?: string[]
  nextAnchorAction?: string | null
}

type RuntimeAnchorCandidateSummary = {
  source?: string
  businessType?: string | null
  status?: string | null
  candidateCount?: number | null
  candidateProjectIds?: string[]
  candidateDraftNetworkKeys?: string[]
  candidateOptionIds?: string[]
  candidatePublicationKeys?: string[]
  nextAnchorActions?: string[]
  candidates?: RuntimeAnchorCandidate[]
  boundaryPolicy?: string[]
}

export type BuildConstructionOrganizationCloseoutWorkbenchOperationSuggestionsInput = {
  companyId?: string | null
  requestedByUserId?: string | null
  executedAt?: string | null
  workPackages: ConstructionOrganizationProductOutcomeEvidenceWorkPackage[]
  runtimeAnchorCandidateSummaries?: RuntimeAnchorCandidateSummary[]
  runtimeAnchorCandidates?: RuntimeAnchorCandidate[]
}

const BRIDGE_MUTATION_BOUNDARY = {
  writesTaskDependencies: false,
  writesPlanDates: false,
  writesSeed: false,
  writesBaseline: false,
  writesCriticalPathFacts: false,
  writesAccelerationDraft: false,
} as const

export type ConstructionOrganizationCloseoutWorkbenchOperationSuggestion = {
  source: 'construction_organization_closeout_workbench_operation_suggestion'
  action: AlgorithmAssetGovernanceWorkbenchOperationAction
  businessType: string
  workPackageKey: string
  useCase: string | null
  evidenceAction: string
  engineCode: ConstructionOrganizationPlanNetworkRuntimeEngineCode | null
  canSubmitControlledOperation: boolean
  missingRequiredFields: string[]
  operationPayload: AlgorithmAssetGovernanceWorkbenchOperationInput
  bridgeMutationBoundary: typeof BRIDGE_MUTATION_BOUNDARY
  boundaryPolicy: string[]
}

export type ConstructionOrganizationCloseoutWorkbenchOperationSuggestionReport = {
  source: 'construction_organization_closeout_workbench_operation_suggestion_report'
  status:
    | 'controlled_operation_suggestions_available'
    | 'blocked_until_runtime_publication_anchor'
    | 'no_operation_suggestions'
  suggestionCount: number
  submittableSuggestionCount: number
  blockedSuggestionCount: number
  suggestions: ConstructionOrganizationCloseoutWorkbenchOperationSuggestion[]
  bridgeMutationBoundary: typeof BRIDGE_MUTATION_BOUNDARY
  boundaryPolicy: string[]
}

const DOMAIN_WRITERS = {
  manualReviewHandoff: 'constructionOrganizationPlanNetworkDraftService.manualReviewHandoff',
  manualConflictReview: 'constructionOrganizationPlanNetworkDraftService.manualConflictReview',
  manualReviewApproval: 'constructionOrganizationPlanNetworkDraftService.manualReviewApproval',
  releaseExitHandoff: 'constructionOrganizationPlanNetworkDraftService.releaseExitHandoff',
  runtimeApply: 'constructionOrganizationPlanNetworkDomainWriter.applyApprovedDraft',
  runtimeEvent: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEvent',
  runtimeConsumerObservation: 'durationRuntimeConsumerObservationAdapterService.recordScheduleAccelerationRuntimeConsumedArtifacts',
  runtimeEngineEvidence: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRuntimeEngineEvidence',
  savedOutcome: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordSavedOutcome',
  recommendationDecision: 'constructionOrganizationPlanNetworkRuntimeEvidenceService.recordRecommendationDecision',
} as const

const ENGINE_CODES: ConstructionOrganizationPlanNetworkRuntimeEngineCode[] = [
  'standard_duration_reference',
  'critical_path_cpm',
  'schedule_acceleration_target',
]

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeOptionalText(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function firstText(values: Array<unknown> | undefined) {
  return (values ?? [])
    .map((value) => normalizeOptionalText(value))
    .find((value): value is string => Boolean(value)) ?? null
}

function uniqueTexts(values: Array<unknown>) {
  return Array.from(new Set(values
    .map((value) => normalizeOptionalText(value))
    .filter((value): value is string => Boolean(value))))
}

function textSet(values: Array<unknown> | undefined) {
  return new Set(uniqueTexts(values ?? []))
}

function actionPriority(action: unknown) {
  switch (normalizeText(action)) {
    case 'collect_runtime_closeout_evidence_for_publication':
      return 100
    case 'complete_manual_conflict_review_before_manual_review_approval':
      return 90
    case 'submit_manual_review_handoff_for_candidate':
      return 80
    case 'resolve_candidate_network_unresolved_edges_before_manual_review_handoff':
      return 70
    case 'submit_manual_review_approval_for_candidate':
      return 60
    case 'promote_candidate_to_release_exit_path':
      return 50
    case 'run_domain_writer_runtime_publication_for_candidate':
      return 40
    case 'attach_project_anchor_to_plan_network_candidate':
      return 10
    default:
      return 0
  }
}

function suggestionBoundaryPolicy() {
  return [
    'operation_suggestion_is_prefill_only',
    'operation_suggestion_does_not_execute_workbench_operations',
    'controlled_operation_submission_still_requires_user_action',
    'operation_suggestion_does_not_write_runtime_or_plan_data',
  ]
}

function buildEvidenceToken(input: {
  action: AlgorithmAssetGovernanceWorkbenchOperationAction
  businessType: string
  publicationKey?: string | null
  draftNetworkKey?: string | null
  engineCode?: string | null
}) {
  return uniqueTexts([
    'construction-organization-closeout',
    input.businessType,
    input.action,
    input.engineCode,
    input.publicationKey,
    input.draftNetworkKey,
  ]).join(':')
}

function findAnchorForBusinessType(
  summaries: RuntimeAnchorCandidateSummary[],
  runtimeAnchorCandidates: RuntimeAnchorCandidate[],
  workPackage: ConstructionOrganizationProductOutcomeEvidenceWorkPackage,
  businessType: string,
) {
  const summary = summaries.find((item) => normalizeText(item.businessType) === businessType)
  const fullCandidates = runtimeAnchorCandidates
    .filter((candidate) => normalizeText(candidate.businessType) === businessType)
  const candidates = fullCandidates.length > 0
    ? fullCandidates
    : summary?.candidates ?? []
  const projectIds = textSet(workPackage.runtimeEvidenceProjectIds)
  const draftNetworkKeys = textSet(workPackage.runtimeEvidenceDraftNetworkKeys)
  const optionIds = textSet(workPackage.runtimeEvidenceOptionIds)
  const publicationKeys = textSet(workPackage.runtimeEvidencePublicationKeys)
  const candidate = [...candidates]
    .sort((left, right) => {
      const leftScore = [
        normalizeOptionalText(left.publicationKey) ? 1 : 0,
        actionPriority(left.nextAnchorAction),
        normalizeOptionalText(left.projectId) ? 1 : 0,
        normalizeOptionalText(left.draftNetworkKey) ? 1 : 0,
        projectIds.has(normalizeText(left.projectId)) ? 1 : 0,
        draftNetworkKeys.has(normalizeText(left.draftNetworkKey)) ? 1 : 0,
        optionIds.has(normalizeText(left.optionId)) ? 1 : 0,
        publicationKeys.has(normalizeText(left.publicationKey)) ? 1 : 0,
        left.constructionOrganizationPlanNetworkDraft ? 1 : 0,
      ]
      const rightScore = [
        normalizeOptionalText(right.publicationKey) ? 1 : 0,
        actionPriority(right.nextAnchorAction),
        normalizeOptionalText(right.projectId) ? 1 : 0,
        normalizeOptionalText(right.draftNetworkKey) ? 1 : 0,
        projectIds.has(normalizeText(right.projectId)) ? 1 : 0,
        draftNetworkKeys.has(normalizeText(right.draftNetworkKey)) ? 1 : 0,
        optionIds.has(normalizeText(right.optionId)) ? 1 : 0,
        publicationKeys.has(normalizeText(right.publicationKey)) ? 1 : 0,
        right.constructionOrganizationPlanNetworkDraft ? 1 : 0,
      ]
      for (let index = 0; index < leftScore.length; index += 1) {
        const delta = rightScore[index] - leftScore[index]
        if (delta !== 0) return delta
      }
      return normalizeText(left.draftNetworkKey).localeCompare(normalizeText(right.draftNetworkKey))
    })[0] ?? null
  return {
    summary: summary ?? null,
    candidate,
  }
}

function buildAnchorContext(
  workPackage: ConstructionOrganizationProductOutcomeEvidenceWorkPackage,
  summaries: RuntimeAnchorCandidateSummary[],
  runtimeAnchorCandidates: RuntimeAnchorCandidate[],
) {
  const { summary, candidate } = findAnchorForBusinessType(
    summaries,
    runtimeAnchorCandidates,
    workPackage,
    workPackage.businessType,
  )
  const hasCandidate = Boolean(candidate)
  return {
    projectId: normalizeOptionalText(candidate?.projectId)
      ?? (hasCandidate ? null : firstText(workPackage.runtimeEvidenceProjectIds) ?? firstText(summary?.candidateProjectIds)),
    draftNetworkKey: normalizeOptionalText(candidate?.draftNetworkKey)
      ?? (hasCandidate ? null : firstText(workPackage.runtimeEvidenceDraftNetworkKeys) ?? firstText(summary?.candidateDraftNetworkKeys)),
    optionId: normalizeOptionalText(candidate?.optionId)
      ?? (hasCandidate ? null : firstText(workPackage.runtimeEvidenceOptionIds) ?? firstText(summary?.candidateOptionIds)),
    publicationKey: normalizeOptionalText(candidate?.publicationKey)
      ?? (hasCandidate ? null : firstText(workPackage.runtimeEvidencePublicationKeys) ?? firstText(summary?.candidatePublicationKeys)),
    nextAnchorActions: candidate?.nextAnchorAction
      ? [candidate.nextAnchorAction]
      : uniqueTexts(summary?.nextAnchorActions ?? []),
    hasReleaseExitHandoff: candidate?.hasReleaseExitHandoff === true,
    constructionOrganizationPlanNetworkDraft: candidate?.constructionOrganizationPlanNetworkDraft ?? null,
  }
}

function missingFields(payload: AlgorithmAssetGovernanceWorkbenchOperationInput, extra: string[] = []) {
  const missing = [
    normalizeOptionalText(payload.evidenceToken) ? null : 'evidenceToken',
    normalizeOptionalText(payload.businessType) ? null : 'businessType',
    normalizeOptionalText(payload.companyId) ? null : 'companyId',
    ...extra,
  ].filter((value): value is string => Boolean(value))
  return Array.from(new Set(missing))
}

function buildSuggestion(input: {
  action: AlgorithmAssetGovernanceWorkbenchOperationAction
  businessType: string
  workPackageKey: string
  useCase?: string | null
  evidenceAction: string
  engineCode?: ConstructionOrganizationPlanNetworkRuntimeEngineCode | null
  payload: AlgorithmAssetGovernanceWorkbenchOperationInput
  missingRequiredFields?: string[]
}): ConstructionOrganizationCloseoutWorkbenchOperationSuggestion {
  const missingRequiredFields = Array.from(new Set(input.missingRequiredFields ?? []))
  return {
    source: 'construction_organization_closeout_workbench_operation_suggestion',
    action: input.action,
    businessType: input.businessType,
    workPackageKey: input.workPackageKey,
    useCase: input.useCase ?? null,
    evidenceAction: input.evidenceAction,
    engineCode: input.engineCode ?? null,
    canSubmitControlledOperation: missingRequiredFields.length === 0,
    missingRequiredFields,
    operationPayload: input.payload,
    bridgeMutationBoundary: BRIDGE_MUTATION_BOUNDARY,
    boundaryPolicy: suggestionBoundaryPolicy(),
  }
}

function basePayload(input: {
  action: AlgorithmAssetGovernanceWorkbenchOperationAction
  companyId: string | null
  requestedByUserId: string | null
  executedAt: string | null
  workPackage: ConstructionOrganizationProductOutcomeEvidenceWorkPackage
  evidenceAction: string
  projectId: string | null
  draftNetworkKey: string | null
  optionId: string | null
  publicationKey: string | null
  domainWriterKey: string
  engineCode?: ConstructionOrganizationPlanNetworkRuntimeEngineCode | null
  constructionOrganizationPlanNetworkDraft?: ConstructionOrganizationPlanNetworkDraft | null
}): AlgorithmAssetGovernanceWorkbenchOperationInput {
  return {
    action: input.action,
    assetType: 'construction_organization_plan_network',
    evidenceToken: buildEvidenceToken({
      action: input.action,
      businessType: input.workPackage.businessType,
      publicationKey: input.publicationKey,
      draftNetworkKey: input.draftNetworkKey,
      engineCode: input.engineCode,
    }),
    workPackageKey: input.workPackage.workPackageKey,
    useCase: null,
    evidenceAction: input.evidenceAction,
    businessType: input.workPackage.businessType,
    companyId: input.companyId,
    projectId: input.projectId,
    requestedByUserId: input.requestedByUserId,
    domainWriterKey: input.domainWriterKey,
    sourcePublicationKey: input.publicationKey,
    optionId: input.optionId,
    draftNetworkKey: input.draftNetworkKey,
    rollbackTarget: input.draftNetworkKey,
    releaseRecordTarget: input.optionId ?? input.draftNetworkKey,
    constructionOrganizationPlanNetworkDraft: input.constructionOrganizationPlanNetworkDraft ?? null,
    executedAt: input.executedAt ?? undefined,
    consumerVerificationRefs: [
      'constructionOrganizationProductOutcomeCloseoutMatrixService.nextEvidenceWorkPackages',
      `constructionOrganizationProductOutcome:${input.workPackage.businessType}`,
    ],
    impactMonitoringRefs: [
      'constructionOrganizationPlanNetworkRuntimeEvidenceJob.impactMonitoring',
    ],
    rollbackWriterRefs: [
      'constructionOrganizationPlanNetworkDomainWriter.rollbackApprovedDraft',
    ],
  }
}

function runtimePublicationMissingSuggestions(input: {
  companyId: string | null
  requestedByUserId: string | null
  executedAt: string | null
  workPackage: ConstructionOrganizationProductOutcomeEvidenceWorkPackage
  projectId: string | null
  draftNetworkKey: string | null
  optionId: string | null
  nextAnchorActions: string[]
  constructionOrganizationPlanNetworkDraft?: ConstructionOrganizationPlanNetworkDraft | null
}) {
  const action = input.nextAnchorActions.includes('submit_manual_review_handoff_for_candidate')
    ? 'manual_review_handoff'
    : input.nextAnchorActions.includes('resolve_candidate_network_unresolved_edges_before_manual_review_handoff')
      ? 'manual_review_handoff'
      : input.nextAnchorActions.includes('complete_manual_conflict_review_before_manual_review_approval')
      ? 'manual_conflict_review'
      : input.nextAnchorActions.includes('submit_manual_review_approval_for_candidate')
      ? 'manual_review_approval'
    : input.nextAnchorActions.includes('promote_candidate_to_release_exit_path')
      ? 'release_exit_handoff'
      : 'runtime_apply'
  if (action === 'runtime_apply' && input.nextAnchorActions.includes('attach_project_anchor_to_plan_network_candidate')) {
    return []
  }
  const domainWriterKey = action === 'manual_review_handoff'
    ? DOMAIN_WRITERS.manualReviewHandoff
    : action === 'manual_conflict_review'
      ? DOMAIN_WRITERS.manualConflictReview
    : action === 'manual_review_approval'
      ? DOMAIN_WRITERS.manualReviewApproval
    : action === 'release_exit_handoff'
      ? DOMAIN_WRITERS.releaseExitHandoff
      : DOMAIN_WRITERS.runtimeApply
  const evidenceAction = action === 'manual_review_handoff'
      ? input.nextAnchorActions.includes('resolve_candidate_network_unresolved_edges_before_manual_review_handoff')
        ? 'resolve_candidate_network_unresolved_edges_before_manual_review_handoff'
        : 'submit_manual_review_handoff_for_candidate'
    : action === 'manual_conflict_review'
      ? 'complete_manual_conflict_review_before_manual_review_approval'
    : action === 'manual_review_approval'
      ? 'submit_manual_review_approval_for_candidate'
    : action === 'release_exit_handoff'
      ? 'promote_candidate_to_release_exit_path'
      : 'run_domain_writer_runtime_publication_for_candidate'
  const hasUnresolvedCandidateNetwork = input.nextAnchorActions.includes('resolve_candidate_network_unresolved_edges_before_manual_review_handoff')
  const hasPendingManualConflictReview = input.nextAnchorActions.includes('complete_manual_conflict_review_before_manual_review_approval')
  const canPrefillDraftForAction = action === 'manual_review_handoff'
    && !hasUnresolvedCandidateNetwork
    || action === 'manual_conflict_review'
    || action === 'manual_review_approval'
  const payload = basePayload({
    action,
    companyId: input.companyId,
    requestedByUserId: input.requestedByUserId,
    executedAt: input.executedAt,
    workPackage: input.workPackage,
    evidenceAction,
    projectId: input.projectId,
    draftNetworkKey: input.draftNetworkKey,
    optionId: input.optionId,
    publicationKey: null,
    domainWriterKey,
    constructionOrganizationPlanNetworkDraft: canPrefillDraftForAction
      ? input.constructionOrganizationPlanNetworkDraft ?? null
      : null,
  })
  const draftMissingRequiredField = canPrefillDraftForAction && input.constructionOrganizationPlanNetworkDraft
    ? []
    : ['constructionOrganizationPlanNetworkDraft']
  const unresolvedCandidateNetworkFields = hasUnresolvedCandidateNetwork
    ? ['candidateNetworkUnresolvedEdges']
    : []
  const pendingManualConflictReviewFields = hasPendingManualConflictReview
    ? ['manualConflictReviewDecision']
    : []
  return [
    buildSuggestion({
      action,
      businessType: input.workPackage.businessType,
      workPackageKey: input.workPackage.workPackageKey,
      evidenceAction,
      payload,
      missingRequiredFields: missingFields(payload, [
        input.projectId ? '' : 'projectId',
        input.draftNetworkKey ? '' : 'draftNetworkKey',
        ...draftMissingRequiredField,
        ...unresolvedCandidateNetworkFields,
        ...pendingManualConflictReviewFields,
      ].filter(Boolean)),
    }),
  ]
}

function runtimeEvidenceSuggestions(input: {
  companyId: string | null
  requestedByUserId: string | null
  executedAt: string | null
  workPackage: ConstructionOrganizationProductOutcomeEvidenceWorkPackage
  projectId: string | null
  draftNetworkKey: string | null
  optionId: string | null
  publicationKey: string
}) {
  const suggestions: ConstructionOrganizationCloseoutWorkbenchOperationSuggestion[] = []

  const consumerPayload = basePayload({
    action: 'runtime_consumer_observation',
    companyId: input.companyId,
    requestedByUserId: input.requestedByUserId,
    executedAt: input.executedAt,
    workPackage: input.workPackage,
    evidenceAction: 'record_runtime_consumer_observation_for_business_type',
    projectId: input.projectId,
    draftNetworkKey: input.draftNetworkKey,
    optionId: input.optionId,
    publicationKey: input.publicationKey,
    domainWriterKey: DOMAIN_WRITERS.runtimeConsumerObservation,
  })
  suggestions.push(buildSuggestion({
    action: 'runtime_consumer_observation',
    businessType: input.workPackage.businessType,
    workPackageKey: input.workPackage.workPackageKey,
    evidenceAction: 'record_runtime_consumer_observation_for_business_type',
    payload: consumerPayload,
    missingRequiredFields: missingFields(consumerPayload, [
      input.projectId ? '' : 'projectId',
      input.publicationKey ? '' : 'sourcePublicationKey',
    ].filter(Boolean)),
  }))

  const impactPayload = basePayload({
    action: 'runtime_impact_monitoring',
    companyId: input.companyId,
    requestedByUserId: input.requestedByUserId,
    executedAt: input.executedAt,
    workPackage: input.workPackage,
    evidenceAction: 'record_impact_monitoring_for_business_type',
    projectId: input.projectId,
    draftNetworkKey: input.draftNetworkKey,
    optionId: input.optionId,
    publicationKey: input.publicationKey,
    domainWriterKey: DOMAIN_WRITERS.runtimeEvent,
  })
  suggestions.push(buildSuggestion({
    action: 'runtime_impact_monitoring',
    businessType: input.workPackage.businessType,
    workPackageKey: input.workPackage.workPackageKey,
    evidenceAction: 'record_impact_monitoring_for_business_type',
    payload: impactPayload,
    missingRequiredFields: missingFields(impactPayload),
  }))

  const rollbackPayload = basePayload({
    action: 'runtime_rollback_execution',
    companyId: input.companyId,
    requestedByUserId: input.requestedByUserId,
    executedAt: input.executedAt,
    workPackage: input.workPackage,
    evidenceAction: 'record_rollback_execution_for_business_type',
    projectId: input.projectId,
    draftNetworkKey: input.draftNetworkKey,
    optionId: input.optionId,
    publicationKey: input.publicationKey,
    domainWriterKey: DOMAIN_WRITERS.runtimeEvent,
  })
  rollbackPayload.rollbackReason = 'construction_organization_closeout_rollback_verification'
  suggestions.push(buildSuggestion({
    action: 'runtime_rollback_execution',
    businessType: input.workPackage.businessType,
    workPackageKey: input.workPackage.workPackageKey,
    evidenceAction: 'record_rollback_execution_for_business_type',
    payload: rollbackPayload,
    missingRequiredFields: missingFields(rollbackPayload, [
      input.draftNetworkKey ? '' : 'rollbackTarget',
    ].filter(Boolean)),
  }))

  const savedOutcomePayload = basePayload({
    action: 'runtime_saved_outcome',
    companyId: input.companyId,
    requestedByUserId: input.requestedByUserId,
    executedAt: input.executedAt,
    workPackage: input.workPackage,
    evidenceAction: 'record_saved_network_outcome_for_business_type',
    projectId: input.projectId,
    draftNetworkKey: input.draftNetworkKey,
    optionId: input.optionId,
    publicationKey: input.publicationKey,
    domainWriterKey: DOMAIN_WRITERS.savedOutcome,
  })
  savedOutcomePayload.releaseRecordTarget = input.draftNetworkKey ?? input.optionId
  suggestions.push(buildSuggestion({
    action: 'runtime_saved_outcome',
    businessType: input.workPackage.businessType,
    workPackageKey: input.workPackage.workPackageKey,
    evidenceAction: 'record_saved_network_outcome_for_business_type',
    payload: savedOutcomePayload,
    missingRequiredFields: missingFields(savedOutcomePayload, [
      savedOutcomePayload.releaseRecordTarget ? '' : 'releaseRecordTarget',
    ].filter(Boolean)),
  }))

  for (const engineCode of ENGINE_CODES) {
    const payload = basePayload({
      action: 'runtime_engine_evidence',
      companyId: input.companyId,
      requestedByUserId: input.requestedByUserId,
      executedAt: input.executedAt,
      workPackage: input.workPackage,
      evidenceAction: 'record_true_per_option_runtime_engine_evidence_for_business_type',
      projectId: input.projectId,
      draftNetworkKey: input.draftNetworkKey,
      optionId: input.optionId,
      publicationKey: input.publicationKey,
      domainWriterKey: DOMAIN_WRITERS.runtimeEngineEvidence,
      engineCode,
    })
    payload.engineCode = engineCode
    suggestions.push(buildSuggestion({
      action: 'runtime_engine_evidence',
      businessType: input.workPackage.businessType,
      workPackageKey: input.workPackage.workPackageKey,
      evidenceAction: 'record_true_per_option_runtime_engine_evidence_for_business_type',
      engineCode,
      payload,
      missingRequiredFields: missingFields(payload, [
        'predictedDurationDays',
        'actualDurationDays',
      ]),
    }))
  }

  const recommendationPayload = basePayload({
    action: 'runtime_recommendation_adopt',
    companyId: input.companyId,
    requestedByUserId: input.requestedByUserId,
    executedAt: input.executedAt,
    workPackage: input.workPackage,
    evidenceAction: 'record_site_adoption_for_business_type',
    projectId: input.projectId,
    draftNetworkKey: input.draftNetworkKey,
    optionId: input.optionId,
    publicationKey: input.publicationKey,
    domainWriterKey: DOMAIN_WRITERS.recommendationDecision,
  })
  recommendationPayload.releaseRecordTarget = input.optionId ?? input.draftNetworkKey
  recommendationPayload.rollbackTarget = input.draftNetworkKey
  suggestions.push(buildSuggestion({
    action: 'runtime_recommendation_adopt',
    businessType: input.workPackage.businessType,
    workPackageKey: input.workPackage.workPackageKey,
    evidenceAction: 'record_site_adoption_for_business_type',
    payload: recommendationPayload,
    missingRequiredFields: missingFields(recommendationPayload, [
      input.projectId ? '' : 'projectId',
      (recommendationPayload.releaseRecordTarget || recommendationPayload.rollbackTarget) ? '' : 'recommendationOptionIdentity',
    ].filter(Boolean)),
  }))

  return suggestions
}

export function buildConstructionOrganizationCloseoutWorkbenchOperationSuggestions(
  input: BuildConstructionOrganizationCloseoutWorkbenchOperationSuggestionsInput,
): ConstructionOrganizationCloseoutWorkbenchOperationSuggestionReport {
  const companyId = normalizeOptionalText(input.companyId)
  const requestedByUserId = normalizeOptionalText(input.requestedByUserId)
  const executedAt = normalizeOptionalText(input.executedAt)
  const runtimeAnchorCandidateSummaries = input.runtimeAnchorCandidateSummaries ?? []
  const runtimeAnchorCandidates = input.runtimeAnchorCandidates ?? []
  const suggestions = input.workPackages.flatMap((workPackage) => {
    const anchor = buildAnchorContext(workPackage, runtimeAnchorCandidateSummaries, runtimeAnchorCandidates)
    if (!anchor.publicationKey) {
      return runtimePublicationMissingSuggestions({
        companyId,
        requestedByUserId,
        executedAt,
        workPackage,
        projectId: anchor.projectId,
        draftNetworkKey: anchor.draftNetworkKey,
      optionId: anchor.optionId,
      nextAnchorActions: anchor.nextAnchorActions,
      constructionOrganizationPlanNetworkDraft: anchor.constructionOrganizationPlanNetworkDraft,
    })
  }
    return runtimeEvidenceSuggestions({
      companyId,
      requestedByUserId,
      executedAt,
      workPackage,
      projectId: anchor.projectId,
      draftNetworkKey: anchor.draftNetworkKey,
      optionId: anchor.optionId,
      publicationKey: anchor.publicationKey,
    })
  })
  const submittableSuggestionCount = suggestions.filter((suggestion) => suggestion.canSubmitControlledOperation).length
  const blockedSuggestionCount = suggestions.length - submittableSuggestionCount
  const hasRuntimeEvidenceSuggestion = suggestions.some((suggestion) =>
    suggestion.action === 'runtime_consumer_observation'
    || suggestion.action === 'runtime_engine_evidence'
    || suggestion.action === 'runtime_saved_outcome'
    || suggestion.action === 'runtime_recommendation_adopt')
  const status: ConstructionOrganizationCloseoutWorkbenchOperationSuggestionReport['status'] =
    suggestions.length === 0
      ? 'no_operation_suggestions'
      : hasRuntimeEvidenceSuggestion
        ? 'controlled_operation_suggestions_available'
        : 'blocked_until_runtime_publication_anchor'

  return {
    source: 'construction_organization_closeout_workbench_operation_suggestion_report',
    status,
    suggestionCount: suggestions.length,
    submittableSuggestionCount,
    blockedSuggestionCount,
    suggestions,
    bridgeMutationBoundary: BRIDGE_MUTATION_BOUNDARY,
    boundaryPolicy: [
      'operation_suggestions_do_not_execute_workbench_operations',
      'operation_suggestions_do_not_write_runtime_or_plan_data',
      'publication_anchor_required_before_runtime_evidence_payloads',
      'controlled_operation_submission_still_requires_user_action',
    ],
  }
}
