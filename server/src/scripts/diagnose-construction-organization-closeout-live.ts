import { writeJsonFile } from './jsonEvidenceUtils.js'

import { closeDatabasePool } from '../database.js'
import {
  canSubmitConstructionOrganizationPlanNetworkManualReviewHandoff,
  listConstructionOrganizationPlanNetworkDrafts,
  type ConstructionOrganizationPlanNetworkDraft,
  type ConstructionOrganizationPlanNetworkDraftReport,
} from '../services/constructionOrganizationPlanNetworkDraftService.js'
import {
  buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport,
  buildConstructionOrganizationProductOutcomeCloseoutProgress,
  type ConstructionOrganizationProductOutcomeCloseoutMatrix,
  type ConstructionOrganizationProductOutcomeEvidenceWorkPackage,
  type ConstructionOrganizationProductOutcomeCloseoutProgress,
} from '../services/constructionOrganizationProductOutcomeCloseoutMatrixService.js'
import {
  buildConstructionOrganizationCloseoutWorkbenchOperationSuggestions,
  type ConstructionOrganizationCloseoutWorkbenchOperationSuggestion,
  type ConstructionOrganizationCloseoutWorkbenchOperationSuggestionReport,
} from '../services/constructionOrganizationCloseoutWorkbenchOperationSuggestionService.js'

type DiagnosticStatus = 'blocked' | 'pass' | 'fail'
type DataSourceFailureCategory =
  | 'runtime_database_role_missing'
  | 'database_temporarily_unavailable'
  | 'network_or_dns_failure'
  | 'unknown_query_failure'

type ListDrafts = typeof listConstructionOrganizationPlanNetworkDrafts

export type ConstructionOrganizationCloseoutArtifacts = {
  matrix: ConstructionOrganizationProductOutcomeCloseoutMatrix
  progress: ConstructionOrganizationProductOutcomeCloseoutProgress
}

export type ConstructionOrganizationCloseoutEvidenceWorkPackageSummary = {
  workPackageKey: string
  businessType: string
  status: string
  executionReadinessStatus: string
  totalDeficit: number
  useCases: string[]
  nextEvidenceActions: string[]
  missingReasons: string[]
  runtimeClaimMissingReasons: string[]
  prefillableExecutionStepCount: number
  blockedExecutionStepCount: number
  missingRuntimeAnchorReasons: string[]
  runtimeEvidenceProjectIds: string[]
  runtimeEvidenceDraftNetworkKeys: string[]
  runtimeEvidencePublicationKeys: string[]
}

export type ConstructionOrganizationCloseoutRuntimeAnchorCandidate = {
  source: 'construction_organization_closeout_runtime_anchor_candidate'
  businessType: string
  projectId: string | null
  draftNetworkKey: string | null
  optionId: string | null
  publicationKey: string | null
  readiness: string | null
  evaluationStatus: string | null
  hasReleaseExitHandoff: boolean
  hasRuntimePublication: boolean
  hasRuntimeEngineEvidence: boolean
  hasRecommendationDecision: boolean
  constructionOrganizationPlanNetworkDraft: ConstructionOrganizationPlanNetworkDraft
  missingAnchorReasons: string[]
  nextAnchorAction: string
}

export type ConstructionOrganizationCloseoutRuntimeAnchorCandidateSummary = {
  source: 'construction_organization_closeout_runtime_anchor_candidate_summary'
  businessType: string
  status:
    | 'runtime_publication_anchor_available'
    | 'project_draft_anchor_available'
    | 'candidate_anchor_incomplete'
    | 'no_candidate_anchor'
  candidateCount: number
  candidateProjectIds: string[]
  candidateDraftNetworkKeys: string[]
  candidateOptionIds: string[]
  candidatePublicationKeys: string[]
  nextAnchorActions: string[]
  candidates: ConstructionOrganizationCloseoutRuntimeAnchorCandidate[]
  boundaryPolicy: string[]
}

export type ConstructionOrganizationManualConflictReviewWorkItem = {
  source: 'construction_organization_manual_conflict_review_work_item'
  businessType: string
  projectId: string | null
  draftNetworkKey: string | null
  optionId: string | null
  status: 'manual_conflict_review_required'
  readiness: string | null
  evaluationStatus: string | null
  reviewPrompt: string | null
  reviewChecklist: string[]
  conflictReasonCodes: string[]
  proposedDependencyEdgeCount: number
  sampleProposedDependencyEdges: ConstructionOrganizationPlanNetworkDraft['manualConflictReviewPackage']['sampleProposedDependencyEdges']
  conflictEvidenceCount: number
  sampleConflictEvidence: ConstructionOrganizationPlanNetworkDraft['manualConflictReviewPackage']['sampleConflictEvidence']
  allowedDecisions: ConstructionOrganizationPlanNetworkDraft['manualConflictReviewPackage']['allowedDecisions']
  recommendedNextAction: 'complete_manual_conflict_review_before_manual_review_approval'
  canSubmitControlledOperation: boolean
  missingRequiredFields: string[]
  operationPayload: ConstructionOrganizationCloseoutWorkbenchOperationSuggestion['operationPayload']
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
  }
  boundaryPolicy: string[]
}

export type ConstructionOrganizationCloseoutLiveDiagnosticReport = {
  reportCode: 'construction_organization_closeout_live_diagnostic'
  evidenceKind: 'live_read_only_product_closeout_matrix'
  generatedAt: string
  outputFile: string | null
  status: DiagnosticStatus
  liveEvidenceRequired: true
  liveEvidenceRequiredReason: string
  companyId: string | null
  projectId: string | null
  runtimeEvidenceGap: {
    missingCompanyId: boolean
    missingRuntimeCloseoutEvidence: boolean | null
    missingArchivedJson: boolean
    dataSourceStatus?: 'not_queried' | 'query_succeeded' | 'query_failed'
    dataSourceErrorCode?: string | null
  }
  checks: {
    productOutcomeCloseout: {
      status: DiagnosticStatus
      canDeclareConstructionOrganizationProductOutcomeCloseout: boolean
      supportedBusinessTypeCount: number
      precisionReplayReadyBusinessTypeCount: number
      runtimeOutcomeReadyBusinessTypeCount: number
      readyBusinessTypes: string[]
      missingBusinessTypes: string[]
      topMissingReasons: string[]
      nextEvidenceActions: string[]
      nextEvidenceWorkItemCount: number
      nextEvidenceWorkPackageCount: number
      prefillableWorkPackageCount: number
      blockedWorkPackageCount: number
    }
  }
  nextEvidenceWorkPackages: ConstructionOrganizationCloseoutEvidenceWorkPackageSummary[]
  runtimeAnchorCandidateSummaries: ConstructionOrganizationCloseoutRuntimeAnchorCandidateSummary[]
  manualConflictReviewWorkItems: ConstructionOrganizationManualConflictReviewWorkItem[]
  workbenchOperationSuggestionReport: ConstructionOrganizationCloseoutWorkbenchOperationSuggestionReport | null
  matrix: ConstructionOrganizationProductOutcomeCloseoutMatrix | null
  progress: ConstructionOrganizationProductOutcomeCloseoutProgress | null
  dataSourceDiagnostic: {
    source: 'construction_organization_closeout_data_source_diagnostic'
    status: 'not_queried' | 'query_succeeded' | 'query_failed'
    failureCategory: DataSourceFailureCategory | null
    canUseAsProductCloseoutEvidence: false
    operatorActions: string[]
    boundaryPolicy: string[]
  }
  errorMessage: string | null
  boundaryPolicy: string[]
}

export type ConstructionOrganizationCloseoutLiveDiagnosticOptions = {
  now?: Date
  companyId?: string | null
  projectId?: string | null
  limit?: number | null
  maxLimit?: number | null
  outputFile?: string | null
  listDrafts?: ListDrafts
  buildCloseoutArtifacts?: (report: ConstructionOrganizationPlanNetworkDraftReport) => ConstructionOrganizationCloseoutArtifacts
}

export type ConstructionOrganizationCloseoutLiveDiagnosticCliDependencies = {
  buildReport?: typeof buildConstructionOrganizationCloseoutLiveDiagnosticReport
  closeDatabasePool?: typeof closeDatabasePool
  writeOutput?: (text: string) => void
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeOptionalText(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function uniqueTextArray(values: unknown[]) {
  return [...new Set(values
    .map((value) => normalizeOptionalText(value))
    .filter((value): value is string => Boolean(value)))]
}

function normalizePositiveInteger(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  const integer = Math.floor(number)
  return integer > 0 ? integer : null
}

function collectErrorSearchText(error: unknown, seen = new Set<unknown>()): string[] {
  if (error === null || error === undefined) return []
  if (seen.has(error)) return []
  seen.add(error)

  if (typeof error !== 'object') return [String(error)]

  const record = error as Record<string, unknown>
  const parts = [
    error instanceof Error ? error.name : null,
    error instanceof Error ? error.message : null,
    record.code,
    record.errno,
    record.syscall,
    record.hostname,
    record.host,
  ]
    .map((value) => normalizeOptionalText(value))
    .filter((value): value is string => Boolean(value))

  if ('cause' in record) {
    parts.push(...collectErrorSearchText(record.cause, seen))
  }
  if (Array.isArray(record.errors)) {
    for (const child of record.errors) {
      parts.push(...collectErrorSearchText(child, seen))
    }
  }
  return parts
}

function classifyDataSourceFailure(error: unknown): DataSourceFailureCategory {
  const normalized = collectErrorSearchText(error).join(' ').toLowerCase()
  if (normalized.includes('tenant/user') || normalized.includes('workbuddy_runtime_login')) {
    return 'runtime_database_role_missing'
  }
  if (normalized.includes('enotfound') || normalized.includes('eai_again') || normalized.includes('dns')) {
    return 'network_or_dns_failure'
  }
  if (
    normalized.includes('57p03')
    || normalized.includes('not accepting connections')
    || normalized.includes('read timeout')
    || normalized.includes('query read timeout')
    || normalized.includes('connection timeout')
    || normalized.includes('timeout')
    || normalized.includes('timed out')
  ) {
    return 'database_temporarily_unavailable'
  }
  return 'unknown_query_failure'
}

function dataSourceDiagnostic(input: {
  status: 'not_queried' | 'query_succeeded' | 'query_failed'
  failureCategory?: DataSourceFailureCategory | null
}) {
  const operatorActionsByCategory: Record<DataSourceFailureCategory, string[]> = {
    runtime_database_role_missing: [
      'run_repair_runtime_db_login_role_with_privileged_migration_credentials',
      'verify_pooler_or_direct_postgres_migration_connection_is_reachable',
      'fix_runtime_database_role_or_db_connection_string',
      'rerun_live_construction_organization_closeout_diagnostic',
    ],
    database_temporarily_unavailable: [
      'verify_supabase_database_availability',
      'rerun_live_construction_organization_closeout_diagnostic',
    ],
    network_or_dns_failure: [
      'verify_network_dns_and_pooler_endpoint',
      'rerun_live_construction_organization_closeout_diagnostic',
    ],
    unknown_query_failure: [
      'inspect_live_diagnostic_error_message',
      'rerun_live_construction_organization_closeout_diagnostic',
    ],
  }
  const failureCategory = input.failureCategory ?? null
  return {
    source: 'construction_organization_closeout_data_source_diagnostic' as const,
    status: input.status,
    failureCategory,
    canUseAsProductCloseoutEvidence: false as const,
    operatorActions: failureCategory ? operatorActionsByCategory[failureCategory] : [],
    boundaryPolicy: [
      'data_source_diagnostic_is_not_runtime_closeout_evidence',
      'data_source_diagnostic_does_not_write_runtime_or_plan_data',
    ],
  }
}

function blockedReport(input: {
  now: Date
  outputFile: string | null
  companyId: string | null
  projectId: string | null
  reason: string
  dataSourceStatus?: 'not_queried' | 'query_failed'
  dataSourceErrorCode?: string | null
}): ConstructionOrganizationCloseoutLiveDiagnosticReport {
  return {
    reportCode: 'construction_organization_closeout_live_diagnostic',
    evidenceKind: 'live_read_only_product_closeout_matrix',
    generatedAt: input.now.toISOString(),
    outputFile: input.outputFile,
    status: 'blocked',
    liveEvidenceRequired: true,
    liveEvidenceRequiredReason: 'Construction-organization product closeout requires current runtime evidence by business type, product entry, saved outcome, consumer observation, impact monitoring, rollback, and E1/E3/E5 runtime evidence.',
    companyId: input.companyId,
    projectId: input.projectId,
    runtimeEvidenceGap: {
      missingCompanyId: !input.companyId,
      missingRuntimeCloseoutEvidence: input.dataSourceStatus === 'query_failed' ? null : true,
      missingArchivedJson: !input.outputFile,
      dataSourceStatus: input.dataSourceStatus ?? 'not_queried',
      dataSourceErrorCode: input.dataSourceErrorCode ?? null,
    },
    checks: {
      productOutcomeCloseout: {
        status: 'blocked',
        canDeclareConstructionOrganizationProductOutcomeCloseout: false,
        supportedBusinessTypeCount: 0,
        precisionReplayReadyBusinessTypeCount: 0,
        runtimeOutcomeReadyBusinessTypeCount: 0,
        readyBusinessTypes: [],
        missingBusinessTypes: [],
        topMissingReasons: [input.reason],
        nextEvidenceActions: [],
        nextEvidenceWorkItemCount: 0,
        nextEvidenceWorkPackageCount: 0,
        prefillableWorkPackageCount: 0,
        blockedWorkPackageCount: 0,
      },
    },
    nextEvidenceWorkPackages: [],
    runtimeAnchorCandidateSummaries: [],
    manualConflictReviewWorkItems: [],
    workbenchOperationSuggestionReport: null,
    matrix: null,
    progress: null,
    dataSourceDiagnostic: dataSourceDiagnostic({
      status: input.dataSourceStatus ?? 'not_queried',
      failureCategory: null,
    }),
    errorMessage: null,
    boundaryPolicy: [
      'diagnostic_is_read_only',
      'diagnostic_does_not_grant_auto_materialization',
      'diagnostic_does_not_write_runtime_apply',
      'diagnostic_does_not_write_task_dependencies_or_plan_dates',
      'diagnostic_does_not_write_baseline_seed_task_facts_acceleration_drafts_or_critical_path_facts',
    ],
  }
}

function readItemEvaluationStatus(item: ConstructionOrganizationPlanNetworkDraftReport['items'][number]) {
  return normalizeOptionalText(item.evaluationEvidence?.evaluationStatus)
}

function readItemPublicationKey(
  item: ConstructionOrganizationPlanNetworkDraftReport['items'][number],
  optionByDraftKey: Map<string, ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage']['options'][number]>,
) {
  const runtimeEnginePublicationKey = normalizeOptionalText(item.runtimeEngineEvidence?.publicationKey)
  if (runtimeEnginePublicationKey) return runtimeEnginePublicationKey
  const optionPublicationKey = normalizeOptionalText(
    optionByDraftKey.get(normalizeText(item.draftNetworkKey))?.runtimeMaterializationEvidence?.publicationKey,
  )
  return optionPublicationKey
}

function buildAnchorCandidateNextAction(candidate: Omit<
  ConstructionOrganizationCloseoutRuntimeAnchorCandidate,
  'source' | 'missingAnchorReasons' | 'nextAnchorAction'
>) {
  if (!candidate.projectId) return 'attach_project_anchor_to_plan_network_candidate'
  if (!candidate.draftNetworkKey) return 'attach_draft_network_key_to_plan_network_candidate'
  if (!candidate.publicationKey) {
    const draft = candidate.constructionOrganizationPlanNetworkDraft
    if (draft?.manualReviewHandoff?.candidateEventId && !draft.manualReviewApproval?.candidateEventId) {
      return candidate.readiness === 'ready_for_replay' && candidate.evaluationStatus === 'evaluation_ready'
        ? 'submit_manual_review_approval_for_candidate'
        : 'complete_manual_conflict_review_before_manual_review_approval'
    }
    if (draft?.manualReviewApproval?.candidateEventId && !candidate.hasReleaseExitHandoff) {
      return 'promote_candidate_to_release_exit_path'
    }
    if (candidate.hasReleaseExitHandoff) return 'run_domain_writer_runtime_publication_for_candidate'
    if (
      canSubmitConstructionOrganizationPlanNetworkManualReviewHandoff(candidate.constructionOrganizationPlanNetworkDraft)
      && candidate.evaluationStatus === 'evaluation_ready'
    ) {
      return 'submit_manual_review_handoff_for_candidate'
    }
    if (
      candidate.readiness === 'conflict_review_required'
      && candidate.evaluationStatus === 'evaluation_ready'
    ) {
      return 'resolve_candidate_network_unresolved_edges_before_manual_review_handoff'
    }
    return 'promote_candidate_to_release_exit_path'
  }
  if (!candidate.hasRuntimeEngineEvidence) return 'collect_e1_e3_e5_runtime_engine_evidence_for_publication'
  return 'collect_runtime_closeout_evidence_for_publication'
}

function buildRuntimeAnchorCandidate(
  item: ConstructionOrganizationPlanNetworkDraftReport['items'][number],
  optionByDraftKey: Map<string, ConstructionOrganizationPlanNetworkDraftReport['optionComparisonPackage']['options'][number]>,
): ConstructionOrganizationCloseoutRuntimeAnchorCandidate | null {
  const businessType = normalizeOptionalText(item.businessType)
  if (!businessType) return null
  const draftNetworkKey = normalizeOptionalText(item.draftNetworkKey)
  const publicationKey = readItemPublicationKey(item, optionByDraftKey)
  const candidateBase = {
    businessType,
    projectId: normalizeOptionalText(item.projectId),
    draftNetworkKey,
    optionId: normalizeOptionalText(item.optionId),
    publicationKey,
    readiness: normalizeOptionalText(item.readiness),
    evaluationStatus: readItemEvaluationStatus(item),
    hasReleaseExitHandoff: Boolean(item.releaseExitHandoff?.candidateEventId),
    hasRuntimePublication: Boolean(publicationKey),
    hasRuntimeEngineEvidence: item.runtimeEngineEvidence?.canClaimTruePerOptionRuntimeEvaluation === true,
    hasRecommendationDecision: Boolean(item.recommendationDecision),
    constructionOrganizationPlanNetworkDraft: item,
  }
  const missingAnchorReasons = [
    candidateBase.projectId ? null : 'projectId_anchor_required',
    candidateBase.draftNetworkKey ? null : 'draftNetworkKey_anchor_required',
    candidateBase.publicationKey ? null : 'publicationKey_anchor_required',
  ].filter((value): value is string => Boolean(value))
  return {
    source: 'construction_organization_closeout_runtime_anchor_candidate',
    ...candidateBase,
    missingAnchorReasons,
    nextAnchorAction: buildAnchorCandidateNextAction(candidateBase),
  }
}

function scoreRuntimeAnchorCandidate(candidate: ConstructionOrganizationCloseoutRuntimeAnchorCandidate) {
  return [
    candidate.hasRuntimePublication ? 1 : 0,
    candidate.hasRuntimeEngineEvidence ? 1 : 0,
    candidate.hasReleaseExitHandoff ? 1 : 0,
    candidate.hasRecommendationDecision ? 1 : 0,
    candidate.readiness === 'ready_for_replay' ? 1 : 0,
    candidate.evaluationStatus === 'evaluation_ready' ? 1 : 0,
    candidate.projectId ? 1 : 0,
    candidate.draftNetworkKey ? 1 : 0,
  ]
}

function compareRuntimeAnchorCandidate(
  left: ConstructionOrganizationCloseoutRuntimeAnchorCandidate,
  right: ConstructionOrganizationCloseoutRuntimeAnchorCandidate,
) {
  const leftScore = scoreRuntimeAnchorCandidate(left)
  const rightScore = scoreRuntimeAnchorCandidate(right)
  for (let index = 0; index < leftScore.length; index += 1) {
    const delta = rightScore[index] - leftScore[index]
    if (delta !== 0) return delta
  }
  return normalizeText(left.draftNetworkKey).localeCompare(normalizeText(right.draftNetworkKey))
}

function buildRuntimeAnchorCandidates(
  planNetworkReport: ConstructionOrganizationPlanNetworkDraftReport,
): ConstructionOrganizationCloseoutRuntimeAnchorCandidate[] {
  const optionByDraftKey = new Map(
    (planNetworkReport.optionComparisonPackage?.options ?? [])
      .map((option) => [normalizeText(option.draftNetworkKey), option] as const)
      .filter(([draftNetworkKey]) => Boolean(draftNetworkKey)),
  )
  return (planNetworkReport.items ?? [])
    .map((item) => buildRuntimeAnchorCandidate(item, optionByDraftKey))
    .filter((candidate): candidate is ConstructionOrganizationCloseoutRuntimeAnchorCandidate => Boolean(candidate))
}

function buildRuntimeAnchorCandidateSummaryStatus(
  candidates: ConstructionOrganizationCloseoutRuntimeAnchorCandidate[],
): ConstructionOrganizationCloseoutRuntimeAnchorCandidateSummary['status'] {
  if (candidates.length === 0) return 'no_candidate_anchor'
  if (candidates.some((candidate) => candidate.projectId && candidate.draftNetworkKey && candidate.publicationKey)) {
    return 'runtime_publication_anchor_available'
  }
  if (candidates.some((candidate) => candidate.projectId && candidate.draftNetworkKey)) {
    return 'project_draft_anchor_available'
  }
  return 'candidate_anchor_incomplete'
}

function buildRuntimeAnchorCandidateSummaries(
  runtimeAnchorCandidates: ConstructionOrganizationCloseoutRuntimeAnchorCandidate[],
  progress: ConstructionOrganizationProductOutcomeCloseoutProgress,
): ConstructionOrganizationCloseoutRuntimeAnchorCandidateSummary[] {
  const candidatesByBusinessType = new Map<string, ConstructionOrganizationCloseoutRuntimeAnchorCandidate[]>()
  for (const candidate of runtimeAnchorCandidates) {
    candidatesByBusinessType.set(candidate.businessType, [
      ...(candidatesByBusinessType.get(candidate.businessType) ?? []),
      candidate,
    ])
  }

  return progress.missingBusinessTypes.map((businessType) => {
    const candidates = [...(candidatesByBusinessType.get(businessType) ?? [])]
      .sort(compareRuntimeAnchorCandidate)
    const displayedCandidates = candidates.slice(0, 3)
    return {
      source: 'construction_organization_closeout_runtime_anchor_candidate_summary',
      businessType,
      status: buildRuntimeAnchorCandidateSummaryStatus(candidates),
      candidateCount: candidates.length,
      candidateProjectIds: uniqueTextArray(candidates.map((candidate) => candidate.projectId)),
      candidateDraftNetworkKeys: uniqueTextArray(candidates.map((candidate) => candidate.draftNetworkKey)),
      candidateOptionIds: uniqueTextArray(candidates.map((candidate) => candidate.optionId)),
      candidatePublicationKeys: uniqueTextArray(candidates.map((candidate) => candidate.publicationKey)),
      nextAnchorActions: candidates.length > 0
        ? uniqueTextArray(candidates.map((candidate) => candidate.nextAnchorAction))
        : ['create_or_publish_plan_network_candidate_for_business_type'],
      candidates: displayedCandidates,
      boundaryPolicy: [
        'runtime_anchor_candidates_are_diagnostic_guidance_only',
        'candidate_anchor_presence_does_not_claim_runtime_closeout',
        'diagnostic_does_not_write_runtime_or_plan_data',
      ],
    }
  })
}

function summarizeWorkPackage(
  workPackage: ConstructionOrganizationProductOutcomeEvidenceWorkPackage,
): ConstructionOrganizationCloseoutEvidenceWorkPackageSummary {
  return {
    workPackageKey: workPackage.workPackageKey,
    businessType: workPackage.businessType,
    status: workPackage.status,
    executionReadinessStatus: workPackage.executionReadinessStatus,
    totalDeficit: workPackage.totalDeficit,
    useCases: workPackage.useCases,
    nextEvidenceActions: workPackage.nextEvidenceActions,
    missingReasons: workPackage.missingReasons,
    runtimeClaimMissingReasons: 'runtimeClaimMissingReasons' in workPackage
      ? (workPackage.runtimeClaimMissingReasons as string[])
      : [],
    prefillableExecutionStepCount: workPackage.prefillableExecutionStepCount,
    blockedExecutionStepCount: workPackage.blockedExecutionStepCount,
    missingRuntimeAnchorReasons: workPackage.missingRuntimeAnchorReasons,
    runtimeEvidenceProjectIds: workPackage.runtimeEvidenceProjectIds,
    runtimeEvidenceDraftNetworkKeys: workPackage.runtimeEvidenceDraftNetworkKeys,
    runtimeEvidencePublicationKeys: workPackage.runtimeEvidencePublicationKeys,
  }
}

const READ_ONLY_MUTATION_BOUNDARY = {
  writesTaskDependencies: false,
  writesPlanDates: false,
  writesSeed: false,
  writesBaseline: false,
  writesCriticalPathFacts: false,
  writesAccelerationDraft: false,
} as const

function buildManualConflictReviewWorkItems(input: {
  runtimeAnchorCandidates: ConstructionOrganizationCloseoutRuntimeAnchorCandidate[]
  workbenchOperationSuggestionReport: ConstructionOrganizationCloseoutWorkbenchOperationSuggestionReport | null
}): ConstructionOrganizationManualConflictReviewWorkItem[] {
  const manualConflictSuggestionsByDraftKey = new Map(
    (input.workbenchOperationSuggestionReport?.suggestions ?? [])
      .filter((suggestion) => suggestion.action === 'manual_conflict_review')
      .map((suggestion) => [normalizeText(suggestion.operationPayload.draftNetworkKey), suggestion] as const)
      .filter(([draftNetworkKey]) => Boolean(draftNetworkKey)),
  )

  return input.runtimeAnchorCandidates
    .map((candidate) => {
      const draft = candidate.constructionOrganizationPlanNetworkDraft
      const manualConflictReviewPackage = draft.manualConflictReviewPackage
      if (!manualConflictReviewPackage) return null
      if (manualConflictReviewPackage.status !== 'manual_conflict_review_required') return null
      const draftNetworkKey = normalizeOptionalText(candidate.draftNetworkKey)
      const projectId = normalizeOptionalText(candidate.projectId)
      if (!projectId || !draftNetworkKey) return null
      const suggestion = manualConflictSuggestionsByDraftKey.get(normalizeText(draftNetworkKey))
      return {
        source: 'construction_organization_manual_conflict_review_work_item' as const,
        businessType: candidate.businessType,
        projectId,
        draftNetworkKey,
        optionId: normalizeOptionalText(candidate.optionId),
        status: 'manual_conflict_review_required' as const,
        readiness: normalizeOptionalText(candidate.readiness),
        evaluationStatus: normalizeOptionalText(candidate.evaluationStatus),
        reviewPrompt: manualConflictReviewPackage.reviewPrompt,
        reviewChecklist: manualConflictReviewPackage.reviewChecklist,
        conflictReasonCodes: manualConflictReviewPackage.conflictReasonCodes,
        proposedDependencyEdgeCount: manualConflictReviewPackage.proposedDependencyEdgeCount,
        sampleProposedDependencyEdges: manualConflictReviewPackage.sampleProposedDependencyEdges,
        conflictEvidenceCount: manualConflictReviewPackage.conflictEvidenceCount,
        sampleConflictEvidence: manualConflictReviewPackage.sampleConflictEvidence,
        allowedDecisions: manualConflictReviewPackage.allowedDecisions,
        recommendedNextAction: 'complete_manual_conflict_review_before_manual_review_approval' as const,
        canSubmitControlledOperation: suggestion?.canSubmitControlledOperation ?? false,
        missingRequiredFields: suggestion?.missingRequiredFields ?? ['manualConflictReviewDecision'],
        operationPayload: suggestion?.operationPayload ?? {
          action: 'manual_conflict_review',
          assetType: 'construction_organization_plan_network',
          evidenceToken: uniqueTextArray([
            'construction-organization-closeout',
            candidate.businessType,
            'manual_conflict_review',
            draftNetworkKey,
          ]).join(':'),
          workPackageKey: null,
          useCase: null,
          evidenceAction: 'complete_manual_conflict_review_before_manual_review_approval',
          businessType: candidate.businessType,
          companyId: null,
          projectId,
          requestedByUserId: null,
          domainWriterKey: 'constructionOrganizationPlanNetworkDraftService.manualConflictReview',
          sourcePublicationKey: null,
          optionId: normalizeOptionalText(candidate.optionId),
          draftNetworkKey,
          rollbackTarget: draftNetworkKey,
          releaseRecordTarget: normalizeOptionalText(candidate.optionId) ?? draftNetworkKey,
          constructionOrganizationPlanNetworkDraft: draft,
          consumerVerificationRefs: [],
          impactMonitoringRefs: [],
          rollbackWriterRefs: [],
        },
        mutationBoundary: READ_ONLY_MUTATION_BOUNDARY,
        boundaryPolicy: [
          'manual_conflict_review_work_item_is_read_only',
          'manual_conflict_review_work_item_does_not_auto_approve_candidate',
          'manual_conflict_review_work_item_does_not_write_task_dependencies',
          'manual_conflict_review_work_item_does_not_write_plan_dates',
          'controlled_operation_submission_still_requires_user_decision',
        ],
      }
    })
    .filter((item): item is ConstructionOrganizationManualConflictReviewWorkItem => Boolean(item))
}

function defaultBuildCloseoutArtifacts(
  planNetworkReport: ConstructionOrganizationPlanNetworkDraftReport,
): ConstructionOrganizationCloseoutArtifacts {
  const matrix = buildConstructionOrganizationProductOutcomeCloseoutMatrixFromPlanNetworkReport({
    planNetworkReport,
  })
  return {
    matrix,
    progress: buildConstructionOrganizationProductOutcomeCloseoutProgress(matrix),
  }
}

function buildProductOutcomeCheck(
  progress: ConstructionOrganizationProductOutcomeCloseoutProgress,
) {
  const status: DiagnosticStatus = progress.canDeclareConstructionOrganizationProductOutcomeCloseout
    ? 'pass'
    : 'blocked'
  return {
    status,
    canDeclareConstructionOrganizationProductOutcomeCloseout:
      progress.canDeclareConstructionOrganizationProductOutcomeCloseout,
    supportedBusinessTypeCount: progress.supportedBusinessTypeCount,
    precisionReplayReadyBusinessTypeCount: progress.precisionReplayReadyBusinessTypeCount,
    runtimeOutcomeReadyBusinessTypeCount: progress.runtimeOutcomeReadyBusinessTypeCount,
    readyBusinessTypes: progress.readyBusinessTypes,
    missingBusinessTypes: progress.missingBusinessTypes,
    topMissingReasons: progress.topMissingReasons,
    nextEvidenceActions: progress.nextEvidenceActions,
    nextEvidenceWorkItemCount: progress.nextEvidenceWorkItemCount,
    nextEvidenceWorkPackageCount: progress.nextEvidenceWorkPackageCount,
    prefillableWorkPackageCount: progress.prefillableWorkPackageCount,
    blockedWorkPackageCount: progress.blockedWorkPackageCount,
  }
}

function writeJsonIfRequested(outputFile: string | null, report: ConstructionOrganizationCloseoutLiveDiagnosticReport) {
  if (!outputFile) return
  writeJsonFile(outputFile, report)
}

export async function buildConstructionOrganizationCloseoutLiveDiagnosticReport(
  options: ConstructionOrganizationCloseoutLiveDiagnosticOptions = {},
): Promise<ConstructionOrganizationCloseoutLiveDiagnosticReport> {
  const now = options.now ?? new Date()
  const outputFile = normalizeOptionalText(options.outputFile)
  const companyId = normalizeOptionalText(options.companyId)
  const projectId = normalizeOptionalText(options.projectId)
  if (!companyId) {
    const report = blockedReport({
      now,
      outputFile,
      companyId,
      projectId,
      reason: 'company_id_required_for_live_construction_organization_closeout_diagnostic',
    })
    writeJsonIfRequested(outputFile, report)
    return report
  }

  try {
    const planNetworkReport = await (options.listDrafts ?? listConstructionOrganizationPlanNetworkDrafts)({
      companyId,
      projectId,
      limit: normalizePositiveInteger(options.limit) ?? undefined,
      maxLimit: normalizePositiveInteger(options.maxLimit) ?? undefined,
    } as Parameters<ListDrafts>[0])
    const { matrix, progress } = (options.buildCloseoutArtifacts ?? defaultBuildCloseoutArtifacts)(planNetworkReport)
    const productOutcomeCloseout = buildProductOutcomeCheck(progress)
    const status = productOutcomeCloseout.status
    const runtimeAnchorCandidates = buildRuntimeAnchorCandidates(planNetworkReport)
    const runtimeAnchorCandidateSummaries = buildRuntimeAnchorCandidateSummaries(runtimeAnchorCandidates, progress)
    const workbenchOperationSuggestionReport = buildConstructionOrganizationCloseoutWorkbenchOperationSuggestions({
      companyId,
      workPackages: matrix.nextEvidenceWorkPackages,
      runtimeAnchorCandidateSummaries,
      runtimeAnchorCandidates,
    })
    const manualConflictReviewWorkItems = buildManualConflictReviewWorkItems({
      runtimeAnchorCandidates,
      workbenchOperationSuggestionReport,
    })
    const report: ConstructionOrganizationCloseoutLiveDiagnosticReport = {
      reportCode: 'construction_organization_closeout_live_diagnostic',
      evidenceKind: 'live_read_only_product_closeout_matrix',
      generatedAt: now.toISOString(),
      outputFile,
      status,
      liveEvidenceRequired: true,
      liveEvidenceRequiredReason: 'Construction-organization product closeout requires current runtime evidence by business type, product entry, saved outcome, consumer observation, impact monitoring, rollback, and E1/E3/E5 runtime evidence.',
      companyId,
      projectId,
      runtimeEvidenceGap: {
        missingCompanyId: false,
        missingRuntimeCloseoutEvidence: status !== 'pass',
        missingArchivedJson: !outputFile,
        dataSourceStatus: 'query_succeeded',
        dataSourceErrorCode: null,
      },
      dataSourceDiagnostic: dataSourceDiagnostic({
        status: 'query_succeeded',
        failureCategory: null,
      }),
      checks: {
        productOutcomeCloseout,
      },
      nextEvidenceWorkPackages: matrix.nextEvidenceWorkPackages.map(summarizeWorkPackage),
      runtimeAnchorCandidateSummaries,
      manualConflictReviewWorkItems,
      workbenchOperationSuggestionReport,
      matrix,
      progress,
      errorMessage: null,
      boundaryPolicy: [
        'diagnostic_is_read_only',
        'diagnostic_does_not_grant_auto_materialization',
        'diagnostic_does_not_write_runtime_apply',
        'diagnostic_does_not_write_task_dependencies_or_plan_dates',
        'diagnostic_does_not_write_baseline_seed_task_facts_acceleration_drafts_or_critical_path_facts',
      ],
    }
    writeJsonIfRequested(outputFile, report)
    return report
  } catch (error) {
    const failureCategory = classifyDataSourceFailure(error)
    const report = blockedReport({
      now,
      outputFile,
      companyId,
      projectId,
      reason: 'live_construction_organization_closeout_diagnostic_query_failed',
      dataSourceStatus: 'query_failed',
      dataSourceErrorCode: typeof error === 'object' && error && 'code' in error
        ? normalizeOptionalText((error as { code?: unknown }).code)
        : null,
    })
    report.status = 'fail'
    report.checks.productOutcomeCloseout.status = 'fail'
    report.dataSourceDiagnostic = dataSourceDiagnostic({
      status: 'query_failed',
      failureCategory,
    })
    report.errorMessage = error instanceof Error ? error.message : String(error)
    writeJsonIfRequested(outputFile, report)
    return report
  }
}

function parseArgs(argv: string[]) {
  const values: Record<string, string | true> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) continue
    const body = arg.slice(2)
    const equalsIndex = body.indexOf('=')
    if (equalsIndex >= 0) {
      values[body.slice(0, equalsIndex)] = body.slice(equalsIndex + 1)
      continue
    }
    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      values[body] = next
      index += 1
    } else {
      values[body] = true
    }
  }
  return values
}

export async function runConstructionOrganizationCloseoutLiveDiagnosticCli(
  argv: string[],
  dependencies: ConstructionOrganizationCloseoutLiveDiagnosticCliDependencies = {},
) {
  const args = parseArgs(argv)
  const buildReport = dependencies.buildReport ?? buildConstructionOrganizationCloseoutLiveDiagnosticReport
  const closePool = dependencies.closeDatabasePool ?? closeDatabasePool
  const writeOutput = dependencies.writeOutput ?? console.log
  try {
    const report = await buildReport({
      companyId: normalizeOptionalText(args['company-id']),
      projectId: normalizeOptionalText(args['project-id']),
      limit: normalizePositiveInteger(args.limit),
      maxLimit: normalizePositiveInteger(args['max-limit']),
      outputFile: normalizeOptionalText(args['output-file']),
    })
    writeOutput(JSON.stringify(summarizeCliReport(report), null, 2))
    if (report.status === 'fail') process.exitCode = 1
    return report
  } finally {
    await closePool()
  }
}

function summarizeCliReport(report: ConstructionOrganizationCloseoutLiveDiagnosticReport) {
  return {
    reportCode: report.reportCode,
    status: report.status,
    companyId: report.companyId,
    projectId: report.projectId,
    supportedBusinessTypeCount: report.checks.productOutcomeCloseout.supportedBusinessTypeCount,
    runtimeOutcomeReadyBusinessTypeCount: report.checks.productOutcomeCloseout.runtimeOutcomeReadyBusinessTypeCount,
    missingBusinessTypeCount: report.checks.productOutcomeCloseout.missingBusinessTypes.length,
    missingBusinessTypes: report.checks.productOutcomeCloseout.missingBusinessTypes,
    topMissingReasons: report.checks.productOutcomeCloseout.topMissingReasons,
    nextEvidenceActions: report.checks.productOutcomeCloseout.nextEvidenceActions,
    nextEvidenceWorkPackageCount: report.nextEvidenceWorkPackages.length,
    runtimeAnchorCandidateSummaryCount: report.runtimeAnchorCandidateSummaries.length,
    runtimeAnchorCandidateSummaries: report.runtimeAnchorCandidateSummaries.map((summary) => ({
      businessType: summary.businessType,
      status: summary.status,
      candidateCount: summary.candidateCount,
      candidateDraftNetworkKeys: summary.candidateDraftNetworkKeys.slice(0, 5),
      candidatePublicationKeys: summary.candidatePublicationKeys.slice(0, 5),
      nextAnchorActions: summary.nextAnchorActions,
    })),
    manualConflictReviewWorkItemCount: report.manualConflictReviewWorkItems.length,
    manualConflictReviewWorkItems: report.manualConflictReviewWorkItems.map((item) => ({
      businessType: item.businessType,
      projectId: item.projectId,
      draftNetworkKey: item.draftNetworkKey,
      optionId: item.optionId,
      status: item.status,
      readiness: item.readiness,
      proposedDependencyEdgeCount: item.proposedDependencyEdgeCount,
      conflictEvidenceCount: item.conflictEvidenceCount,
      allowedDecisions: item.allowedDecisions,
      missingRequiredFields: item.missingRequiredFields,
      canSubmitControlledOperation: item.canSubmitControlledOperation,
      recommendedNextAction: item.recommendedNextAction,
    })),
    workbenchOperationSuggestionSummary: report.workbenchOperationSuggestionReport
      ? {
          status: report.workbenchOperationSuggestionReport.status,
          suggestionCount: report.workbenchOperationSuggestionReport.suggestionCount,
          submittableSuggestionCount: report.workbenchOperationSuggestionReport.submittableSuggestionCount,
          blockedSuggestionCount: report.workbenchOperationSuggestionReport.blockedSuggestionCount,
          actions: uniqueTextArray(report.workbenchOperationSuggestionReport.suggestions.map((item) => item.action)),
        }
      : null,
    dataSourceDiagnostic: report.dataSourceDiagnostic,
    outputFile: report.outputFile,
  }
}

if (process.argv[1]?.includes('diagnose-construction-organization-closeout-live')) {
  void runConstructionOrganizationCloseoutLiveDiagnosticCli(process.argv.slice(2))
}
