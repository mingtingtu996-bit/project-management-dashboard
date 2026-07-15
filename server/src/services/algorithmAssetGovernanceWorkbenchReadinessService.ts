import type { AlgorithmAssetIsolationMatrix } from './algorithmAssetIsolationMatrixService.js'
import type {
  ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim,
} from './constructionOrganizationPlanNetworkDraftService.js'
import type {
  ConstructionOrganizationProductOutcomeCloseoutMatrix,
} from './constructionOrganizationProductOutcomeCloseoutMatrixService.js'
import {
  buildConstructionOrganizationProductOutcomeCloseoutProgress,
} from './constructionOrganizationProductOutcomeCloseoutMatrixService.js'
import {
  buildConstructionOrganizationCloseoutWorkbenchOperationSuggestions,
} from './constructionOrganizationCloseoutWorkbenchOperationSuggestionService.js'
import type { CrossScopeReplayEvidenceMatrix } from './crossScopeReplayEvidenceMatrixService.js'
import type { ConstructionOrganizationPrecisionReplayMatrix } from './constructionOrganizationPrecisionReplayMatrixService.js'
import type { DomainReleaseRuntimeClosureMatrix } from './domainReleaseRuntimeClosureMatrixService.js'
import type { FutureAssetRediscoveryGateRerunMatrix } from './futureAssetRediscoveryGateRerunMatrixService.js'
import type { MetricConsumerPathCoverageMatrix } from './metricConsumerPathCoverageMatrixService.js'
import type { MetricProductionSnapshotPublicationRollbackMatrix } from './metricProductionSnapshotPublicationRollbackMatrixService.js'
import type { OrdinaryBusinessDtoExposureMatrix } from './ordinaryBusinessDtoExposureMatrixService.js'
import type { OperableGovernanceFrontendMatrix } from './operableGovernanceFrontendMatrixService.js'
import type { TemplateWriteSurfaceLegacyScopeSanitizerMatrix } from './templateWriteSurfaceLegacyScopeSanitizerMatrixService.js'

type CountSummary = Record<string, unknown>

type GovernanceEvidenceSummary = {
  candidateEvents: CountSummary
  replayRuns: CountSummary
  sampleHealth: CountSummary
}

type CoverageInput = {
  verifiedConsumers?: string[]
  pendingConsumerGroups?: string[]
}

type MetricCoverageInput = {
  registeredMetricSources?: string[]
  pendingMetricSourceGroups?: string[]
  requiredMetricSources?: string[]
}

export type AlgorithmAssetGovernanceWorkbenchDefaultReviewItem = {
  assetKey: string
  sourcePath: string
  durationRelated: boolean
  learningTarget: string
  learningMaturity: string
  publishAnchor: string
  automationMaturity: string
  reason: string
}

export type AlgorithmAssetGovernanceWorkbenchReadinessGate = {
  key: string
  status: 'ready' | 'needs_work'
  evidenceRefs: string[]
  missingReasons: string[]
  details?: Record<string, unknown>
}

export type AlgorithmAssetGovernanceWorkbenchClosureGap = {
  key: string
  status: 'not_proven_by_workbench_readiness'
  evidenceRequired: string[]
  reason: string
}

export type AlgorithmAssetGovernanceWorkbenchReadinessInput = {
  companyId?: string | null
  inventorySummary?: CountSummary
  admissionStatus?: string
  admissionSummary?: CountSummary
  reviewItems?: unknown[]
  blockers?: unknown[]
  governanceDefaultReviewItems?: AlgorithmAssetGovernanceWorkbenchDefaultReviewItem[]
  governanceEvidence?: GovernanceEvidenceSummary
  backendWorkbenchEvidenceRefs?: string[]
  frontendAdminPageEvidenceRefs?: string[]
  runtimeIsolationMatrix?: AlgorithmAssetIsolationMatrix
  parameterConsumerCoverage?: CoverageInput
  metricSourceCoverage?: MetricCoverageInput
  ordinaryBusinessDtoExposureMatrix?: OrdinaryBusinessDtoExposureMatrix
  templateWriteSurfaceLegacyScopeSanitizerMatrix?: TemplateWriteSurfaceLegacyScopeSanitizerMatrix
  metricProductionSnapshotPublicationRollbackMatrix?: MetricProductionSnapshotPublicationRollbackMatrix
  metricConsumerPathCoverageMatrix?: MetricConsumerPathCoverageMatrix
  futureAssetRediscoveryGateRerunMatrix?: FutureAssetRediscoveryGateRerunMatrix
  operableGovernanceFrontendMatrix?: OperableGovernanceFrontendMatrix
  domainReleaseRuntimeClosureMatrix?: DomainReleaseRuntimeClosureMatrix
  crossScopeReplayEvidenceMatrix?: CrossScopeReplayEvidenceMatrix
  constructionOrganizationPrecisionReplayMatrix?: ConstructionOrganizationPrecisionReplayMatrix
  constructionOrganizationRuntimeCloseoutClaim?: ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim
  constructionOrganizationProductOutcomeCloseoutMatrix?: ConstructionOrganizationProductOutcomeCloseoutMatrix
}

export type AlgorithmAssetGovernanceWorkbenchReadiness = {
  reportCode: 'v14223_rule_asset_governance_workbench_readiness'
  companyId: string | null
  status: 'workbench_ready' | 'workbench_incomplete'
  canDeclareGovernanceWorkbenchComplete: boolean
  completionScope: 'workbench_readiness_evidence_only'
  canDeclareV14223GovernanceComplete: false
  remainingClosureGaps: AlgorithmAssetGovernanceWorkbenchClosureGap[]
  frontendExposurePolicy: 'backend_admin_governance_only'
  runtimeMutationPolicy: 'none_read_only_evidence_and_gap_report'
  summary: {
    totalAssetCount: number
    algorithmSeedCount: number
    totalDiscoveredCount: number
    registeredCount: number
    reviewItemCount: number
    blockerCount: number
    durationRelatedAssetCount: number
    durationRelatedCoverageRatio: number
    explicitGovernanceFieldCount: number
    conservativeGovernanceDefaultCount: number
    governanceDefaultReviewItemCount: number
    candidateReviewRequiredCount: number
    replayBlockedOrFailedCount: number
    sampleHealthWeakOrRejectedCount: number
    readyGateCount: number
    needsWorkGateCount: number
    totalGateCount: number
  }
  governanceDefaultReviewItems: AlgorithmAssetGovernanceWorkbenchDefaultReviewItem[]
  gates: AlgorithmAssetGovernanceWorkbenchReadinessGate[]
  boundaryPolicy: string[]
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeRefs(values: string[] | undefined) {
  return (values ?? []).map((value) => String(value ?? '').trim()).filter(Boolean)
}

export const V14223_REQUIRED_METRIC_SOURCE_GROUPS = [
  'metricRegistryService',
  'metricRegistry',
  'progressCalculation',
  'statistics',
] as const

const V14223_WORKBENCH_READINESS_REMAINING_CLOSURE_GAPS: AlgorithmAssetGovernanceWorkbenchClosureGap[] = [
  {
    key: 'complete_operable_governance_frontend',
    status: 'not_proven_by_workbench_readiness',
    evidenceRequired: [
      'company_admin_operation_ui',
      'frontend_operation_api_contract',
      'operation_permission_boundary',
      'forbidden_action_states',
      'domain_handoff_result_display',
    ],
    reason: 'A ready workbench report only proves the high-permission evidence page and controlled operation contract; without the operable frontend matrix it does not prove the company-admin operation UI, frontend operation API contract, permission boundary, forbidden-state display, and domain handoff result display.',
  },
  {
    key: 'all_domain_release_adapters_runtime_writers_consumers_monitoring_rollback',
    status: 'not_proven_by_workbench_readiness',
    evidenceRequired: [
      'asset_type_domain_writer',
      'runtime_consumer_verification',
      'impact_monitoring',
      'release_record',
      'rollback_writer_and_target',
    ],
    reason: 'Readiness gates do not prove every asset type has a physical writer, runtime consumer, monitoring path, release record, and rollback writer.',
  },
  {
    key: 'cross_company_cross_project_replay_evidence',
    status: 'not_proven_by_workbench_readiness',
    evidenceRequired: [
      'anchor_upgrade_strategy_cross_scope_gate',
      'cross_project_replay_threshold_evidence',
      'cross_company_replay_threshold_evidence',
      'scenario_diversity_replay_threshold_evidence',
      'manual_anchor_single_replay_blocker',
      'replay_evidence_only_no_publish_rights',
    ],
    reason: 'Readiness gates do not prove cross-project and cross-company replay evidence for anchor upgrades, scenario diversity, and manual-anchor single-replay blockers without a dedicated cross-scope replay evidence matrix.',
  },
  {
    key: 'metric_production_snapshot_publish_rollback_closure',
    status: 'not_proven_by_workbench_readiness',
    evidenceRequired: [
      'metric_producer_contract',
      'snapshot_persistence',
      'dashboard_consumer_contract',
      'metric_publication_record',
      'metric_rollback_path',
    ],
    reason: 'metric_source_coverage only proves required metric source references are covered by readiness evidence, not production metric consumption or rollback closure.',
  },
  {
    key: 'metric_consumer_path_coverage',
    status: 'not_proven_by_workbench_readiness',
    evidenceRequired: [
      'dashboard_summary_cards',
      'reports_trend_routes',
      'company_cockpit_summary_routes',
      'project_execution_summary_service',
      'project_daily_snapshot_history',
      'metric_runtime_consumer_gate',
    ],
    reason: 'Metric source registration and a dashboard consumer contract do not prove every current metric consumer path is listed with direct evidence or that future consumer paths are covered.',
  },
  {
    key: 'ordinary_business_page_dto_technical_field_exposure_matrix',
    status: 'not_proven_by_workbench_readiness',
    evidenceRequired: [
      'business_route_contracts',
      'api_dto_sanitizers',
      'ordinary_page_component_checks',
      'admin_only_governance_field_boundary',
    ],
    reason: 'The admin workbench route does not prove ordinary business pages and DTOs are free of governance or legacy technical fields.',
  },
  {
    key: 'all_template_write_surfaces_legacy_scope_sanitizer',
    status: 'not_proven_by_workbench_readiness',
    evidenceRequired: [
      'template_create_update_sanitizers',
      'template_clone_sanitizers',
      'template_import_sanitizers',
      'frontend_template_dto_contracts',
    ],
    reason: 'Workbench readiness does not prove every template write surface and frontend DTO strips deleted scope-object fields.',
  },
  {
    key: 'future_assets_rediscovery_and_gate_rerun',
    status: 'not_proven_by_workbench_readiness',
    evidenceRequired: [
      'fresh_asset_discovery',
      'four_field_governance_registration',
      'candidate_event_adapter',
      'conflict_replay_release_rollback_gates',
    ],
    reason: 'A ready report is a current snapshot only; future assets, old-object rescans, and LLM-generated candidates must rerun discovery and gates.',
  },
  {
    key: 'construction_organization_precision_replay_matrix',
    status: 'not_proven_by_workbench_readiness',
    evidenceRequired: [
      'eleven_business_type_precision_replay',
      'generated_row_projection_coverage',
      'e1_e3_e5_candidate_evidence',
      'candidate_only_no_write_boundary',
    ],
    reason: 'Workbench readiness must include the construction-organization precision replay matrix; candidate plan-option evidence alone does not prove all supported business types are covered or that the evidence remains candidate-only rather than runtime saved outcome.',
  },
  {
    key: 'construction_organization_runtime_closeout_claim',
    status: 'not_proven_by_workbench_readiness',
    evidenceRequired: [
      'runtime_materialization_evidence_ready',
      'site_adoption_of_current_runtime_recommended_option',
      'runtime_closeout_claim_ready',
      'no_auto_materialization_boundary',
    ],
    reason: 'Precision replay and runtime closure matrix evidence do not prove the construction-organization product closeout claim unless the current runtime recommended option has been adopted by the project and the read-only runtimeCloseoutClaim is ready.',
  },
  {
    key: 'construction_organization_product_outcome_closeout_matrix',
    status: 'not_proven_by_workbench_readiness',
    evidenceRequired: [
      'eleven_business_type_product_outcome_matrix',
      'runtime_closeout_claim_ready_per_supported_business_type',
      'site_adoption_and_saved_outcome_per_business_type',
      'no_auto_materialization_boundary',
    ],
    reason: 'A single project runtime closeout claim does not prove construction-organization product outcome closeout across every supported business type.',
  },
]

function canonicalRef(value: string) {
  return value.replaceAll('\\', '/').toLowerCase()
}

function metricSourceCovered(requiredSource: string, registeredSources: string[]) {
  const required = canonicalRef(requiredSource)
  return registeredSources.some((source) => {
    const candidate = canonicalRef(source)
    return candidate === required
      || candidate.endsWith(`/${required}.ts`)
      || candidate.endsWith(`/${required}service.ts`)
  })
}

function numberValue(summary: CountSummary | undefined, key: string) {
  const number = Number(summary?.[key] ?? 0)
  return Number.isFinite(number) ? number : 0
}

function gate(
  key: string,
  ready: boolean,
  evidenceRefs: string[],
  missingReasons: string[],
  details?: Record<string, unknown>,
): AlgorithmAssetGovernanceWorkbenchReadinessGate {
  return {
    key,
    status: ready ? 'ready' : 'needs_work',
    evidenceRefs,
    missingReasons: ready ? [] : missingReasons,
    ...(details ? { details } : {}),
  }
}

const CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_USE_CASES = [
  'newProjectPlanning',
  'startingLineOnboarding',
  'accelerationRecovery',
] as const

function buildConstructionOrganizationPrecisionReplayGateDetail(
  matrix: ConstructionOrganizationPrecisionReplayMatrix | undefined,
): Record<string, unknown> | undefined {
  if (!matrix) return undefined
  const proofs = matrix.businessTypes.flatMap((row) => (
    CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_USE_CASES
      .map((useCase) => row.automaticOptionSelectionProof?.useCases?.[useCase])
      .filter((proof): proof is NonNullable<typeof proof> => Boolean(proof))
  ))
  const verifiedUseCaseProofCount = proofs.filter((proof) => proof.status === 'verified').length
  const mismatchReasons = [
    ...matrix.businessTypes.flatMap((row) => row.automaticOptionSelectionProof?.mismatchReasons ?? []),
    ...matrix.businessTypes.flatMap((row) => row.missingReasons),
  ]
  const verifiedBusinessTypes = matrix.businessTypes
    .filter((row) => row.automaticOptionSelectionProof?.status === 'automatic_option_selection_verified')
    .map((row) => row.businessType)

  return {
    source: 'construction_organization_precision_replay_gate_detail',
    matrixStatus: matrix.status,
    automaticOptionSelectionStatus: mismatchReasons.length === 0
      ? 'automatic_option_selection_verified'
      : 'automatic_option_selection_mismatch',
    supportedBusinessTypeCount: matrix.supportedBusinessTypeCount,
    replayedBusinessTypeCount: matrix.replayedBusinessTypeCount,
    totalUseCaseProofCount: proofs.length,
    verifiedUseCaseProofCount,
    useCases: [...CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_USE_CASES],
    verifiedBusinessTypes,
    mismatchReasons,
    boundaryPolicy: [
      'candidate_projection_not_runtime_saved_outcome',
      'automatic_option_selection_proof_does_not_grant_auto_materialization',
    ],
  }
}

function buildConstructionOrganizationProductOutcomeCloseoutGateDetail(
  matrix: ConstructionOrganizationProductOutcomeCloseoutMatrix | undefined,
  companyId?: string | null,
): Record<string, unknown> | undefined {
  if (!matrix) return undefined
  const progress = buildConstructionOrganizationProductOutcomeCloseoutProgress(matrix)
  return {
    source: 'construction_organization_product_outcome_closeout_gate_detail',
    status: matrix.status,
    productOutcomeCloseoutProgress: progress,
    supportedBusinessTypeCount: matrix.supportedBusinessTypeCount,
    precisionReplayReadyBusinessTypeCount: matrix.precisionReplayReadyBusinessTypeCount,
    runtimeOutcomeReadyBusinessTypeCount: matrix.runtimeOutcomeReadyBusinessTypeCount,
    nextEvidenceActions: matrix.nextEvidenceActions,
    nextEvidenceOperations: matrix.nextEvidenceOperations,
    nextEvidenceWorkItems: matrix.nextEvidenceWorkItems,
    nextEvidenceExecutionPlan: matrix.nextEvidenceExecutionPlan,
    nextEvidenceWorkPackages: matrix.nextEvidenceWorkPackages,
    workbenchOperationSuggestionReport: buildConstructionOrganizationCloseoutWorkbenchOperationSuggestions({
      companyId,
      workPackages: matrix.nextEvidenceWorkPackages,
    }),
    businessTypeRows: matrix.rows.map((row) => ({
      businessType: row.businessType,
      status: row.status,
      hasPrecisionReplayEvidence: row.hasPrecisionReplayEvidence,
      hasRuntimeCloseoutClaimEvidence: row.hasRuntimeCloseoutClaimEvidence,
      hasRuntimeCloseoutClaim: row.hasRuntimeCloseoutClaim,
      runtimeClaimStatus: row.runtimeClaimStatus,
      runtimeEvidenceProjectIds: row.runtimeEvidenceProjectIds,
      runtimeEvidenceDraftNetworkKeys: row.runtimeEvidenceDraftNetworkKeys,
      runtimeEvidenceOptionIds: row.runtimeEvidenceOptionIds,
      runtimeEvidencePublicationKeys: row.runtimeEvidencePublicationKeys,
      runtimeEvidenceSources: row.runtimeEvidenceSources,
      runtimeEvidenceUseCases: row.runtimeEvidenceUseCases,
      runtimeEvidenceOptionCount: row.runtimeEvidenceOptionCount,
      runtimeEvidenceOptionDeficit: row.runtimeEvidenceOptionDeficit,
      runtimeEvidenceRuntimeReadyOptionCount: row.runtimeEvidenceRuntimeReadyOptionCount,
      runtimeEvidenceRuntimeReadyOptionDeficit: row.runtimeEvidenceRuntimeReadyOptionDeficit,
      runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount: row.runtimeEvidenceRuntimeReadyOptionCloseoutClaimCount,
      runtimeEvidenceRuntimeReadyOptionCloseoutClaimDeficit: row.runtimeEvidenceRuntimeReadyOptionCloseoutClaimDeficit,
      runtimeReadyUseCaseOptionCounts: row.runtimeReadyUseCaseOptionCounts,
      runtimeReadyUseCaseOptionDeficits: row.runtimeReadyUseCaseOptionDeficits,
      runtimeReadyUseCaseOptionCloseoutClaimCounts: row.runtimeReadyUseCaseOptionCloseoutClaimCounts,
      runtimeReadyUseCaseOptionCloseoutClaimDeficits: row.runtimeReadyUseCaseOptionCloseoutClaimDeficits,
      hasRealRuntimeEvidenceSource: row.hasRealRuntimeEvidenceSource,
      hasRequiredRuntimeUseCaseCoverage: row.hasRequiredRuntimeUseCaseCoverage,
      hasRequiredRuntimeOptionNetworkCoverage: row.hasRequiredRuntimeOptionNetworkCoverage,
      hasRequiredRuntimeReadyOptionNetworkCoverage: row.hasRequiredRuntimeReadyOptionNetworkCoverage,
      hasRequiredRuntimeReadyOptionCloseoutClaimCoverage: row.hasRequiredRuntimeReadyOptionCloseoutClaimCoverage,
      hasRequiredRuntimeReadyUseCaseOptionCoverage: row.hasRequiredRuntimeReadyUseCaseOptionCoverage,
      hasRequiredRuntimeReadyUseCaseOptionCloseoutClaimCoverage: row.hasRequiredRuntimeReadyUseCaseOptionCloseoutClaimCoverage,
      missingReasons: row.missingReasons,
      nextEvidenceActions: row.nextEvidenceActions,
      nextEvidenceOperations: row.nextEvidenceOperations,
    })),
    missingReasons: matrix.missingReasons,
    boundaryPolicy: matrix.boundaryPolicy,
  }
}

function buildRuntimeIsolationMissingReasons(matrix: AlgorithmAssetIsolationMatrix | undefined) {
  if (!matrix) return ['runtime_asset_isolation_matrix_required']
  return matrix.rows.flatMap((row) =>
    row.missingReasons.map((reason) => `${row.assetKey}:${reason}`),
  )
}

function buildOrdinaryBusinessDtoExposureMissingReasons(matrix: OrdinaryBusinessDtoExposureMatrix | undefined) {
  if (!matrix) return ['ordinary_business_dto_exposure_matrix_required']
  return matrix.rows.flatMap((row) =>
    row.missingReasons.map((reason) => `${row.surface}:${reason}`),
  )
}

function buildTemplateWriteSurfaceLegacyScopeSanitizerMissingReasons(
  matrix: TemplateWriteSurfaceLegacyScopeSanitizerMatrix | undefined,
) {
  if (!matrix) return ['template_write_surface_legacy_scope_sanitizer_matrix_required']
  return matrix.rows.flatMap((row) =>
    row.missingReasons.map((reason) => `${row.surface}:${reason}`),
  )
}

function buildMetricProductionSnapshotPublicationRollbackMissingReasons(
  matrix: MetricProductionSnapshotPublicationRollbackMatrix | undefined,
) {
  if (!matrix) return ['metric_production_snapshot_publication_rollback_matrix_required']
  return matrix.rows.flatMap((row) =>
    row.missingReasons.map((reason) => `${row.surface}:${reason}`),
  )
}

function buildMetricConsumerPathCoverageMissingReasons(
  matrix: MetricConsumerPathCoverageMatrix | undefined,
) {
  if (!matrix) return ['metric_consumer_path_coverage_matrix_required']
  return matrix.rows.flatMap((row) =>
    row.missingReasons.map((reason) => `${row.consumerPath}:${reason}`),
  )
}

function buildFutureAssetRediscoveryGateRerunMissingReasons(
  matrix: FutureAssetRediscoveryGateRerunMatrix | undefined,
) {
  if (!matrix) return ['future_asset_rediscovery_gate_rerun_matrix_required']
  return matrix.rows.flatMap((row) =>
    row.missingReasons.map((reason) => `${row.surface}:${reason}`),
  )
}

function buildOperableGovernanceFrontendMissingReasons(
  matrix: OperableGovernanceFrontendMatrix | undefined,
) {
  if (!matrix) return ['operable_governance_frontend_matrix_required']
  return matrix.rows.flatMap((row) =>
    row.missingReasons.map((reason) => `${row.surface}:${reason}`),
  )
}

function buildDomainReleaseRuntimeClosureMissingReasons(
  matrix: DomainReleaseRuntimeClosureMatrix | undefined,
) {
  if (!matrix) return ['domain_release_runtime_closure_matrix_required']
  return matrix.rows.flatMap((row) =>
    row.missingReasons.map((reason) => `${row.assetType}:${row.surface}:${reason}`),
  )
}

function buildCrossScopeReplayEvidenceMissingReasons(
  matrix: CrossScopeReplayEvidenceMatrix | undefined,
) {
  if (!matrix) return ['cross_scope_replay_evidence_matrix_required']
  return matrix.rows.flatMap((row) =>
    row.missingReasons.map((reason) => `${row.surface}:${reason}`),
  )
}

function buildConstructionOrganizationPrecisionReplayMissingReasons(
  matrix: ConstructionOrganizationPrecisionReplayMatrix | undefined,
) {
  if (!matrix) return ['construction_organization_precision_replay_matrix_required']
  return matrix.businessTypes.flatMap((row) =>
    row.missingReasons.map((reason) => `${row.businessType}:${reason}`),
  )
}

function buildConstructionOrganizationRuntimeCloseoutClaimMissingReasons(
  claim: ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim | undefined,
) {
  if (!claim) return ['construction_organization_runtime_closeout_claim_required']
  return claim.missingBeforeClaim.length > 0
    ? claim.missingBeforeClaim
    : ['construction_organization_runtime_closeout_claim_ready_required']
}

function buildConstructionOrganizationProductOutcomeCloseoutMissingReasons(
  matrix: ConstructionOrganizationProductOutcomeCloseoutMatrix | undefined,
) {
  if (!matrix) return ['construction_organization_product_outcome_closeout_matrix_required']
  return matrix.canDeclareConstructionOrganizationProductOutcomeCloseout
    ? []
    : matrix.missingReasons
}

export function buildAlgorithmAssetGovernanceWorkbenchReadiness(
  input: AlgorithmAssetGovernanceWorkbenchReadinessInput,
): AlgorithmAssetGovernanceWorkbenchReadiness {
  const totalAssetCount = numberValue(input.inventorySummary, 'totalAssetCount')
  const algorithmSeedCount = numberValue(input.inventorySummary, 'algorithmSeedCount')
  const totalDiscoveredCount = numberValue(input.admissionSummary, 'totalDiscoveredCount')
  const registeredCount = numberValue(input.admissionSummary, 'registeredCount')
  const reviewItemCount = input.reviewItems?.length ?? 0
  const blockerCount = input.blockers?.length ?? 0
  const durationRelatedAssetCount = numberValue(input.admissionSummary, 'durationRelatedAssetCount')
  const durationRelatedCoverageRatio = numberValue(input.admissionSummary, 'durationRelatedCoverageRatio')
  const explicitGovernanceFieldCount = numberValue(input.admissionSummary, 'explicitGovernanceFieldCount')
  const conservativeGovernanceDefaultCount = numberValue(input.admissionSummary, 'conservativeGovernanceDefaultCount')
  const governanceDefaultReviewItems = input.governanceDefaultReviewItems ?? []
  const candidateReviewRequiredCount = numberValue(input.governanceEvidence?.candidateEvents, 'reviewRequiredCount')
  const replayBlockedOrFailedCount = numberValue(input.governanceEvidence?.replayRuns, 'blockedCount')
    + numberValue(input.governanceEvidence?.replayRuns, 'failedCount')
  const sampleHealthWeakOrRejectedCount = numberValue(input.governanceEvidence?.sampleHealth, 'weakCount')
    + numberValue(input.governanceEvidence?.sampleHealth, 'rejectedCount')

  const backendWorkbenchEvidenceRefs = normalizeRefs(input.backendWorkbenchEvidenceRefs)
  const frontendAdminPageEvidenceRefs = normalizeRefs(input.frontendAdminPageEvidenceRefs)
  const parameterPendingGroups = normalizeRefs(input.parameterConsumerCoverage?.pendingConsumerGroups)
  const verifiedParameterConsumers = normalizeRefs(input.parameterConsumerCoverage?.verifiedConsumers)
  const pendingMetricSourceGroups = normalizeRefs(input.metricSourceCoverage?.pendingMetricSourceGroups)
  const registeredMetricSources = normalizeRefs(input.metricSourceCoverage?.registeredMetricSources)
  const requiredMetricSources = normalizeRefs(input.metricSourceCoverage?.requiredMetricSources)
  const metricSourcesToCover = requiredMetricSources.length > 0
    ? requiredMetricSources
    : [...V14223_REQUIRED_METRIC_SOURCE_GROUPS]
  const missingMetricSources = metricSourcesToCover
    .filter((source) => !metricSourceCovered(source, registeredMetricSources))
    .map((source) => `metric_source_not_covered:${source}`)
  const runtimeIsolationMissingReasons = buildRuntimeIsolationMissingReasons(input.runtimeIsolationMatrix)
  const ordinaryBusinessDtoExposureMissingReasons = buildOrdinaryBusinessDtoExposureMissingReasons(
    input.ordinaryBusinessDtoExposureMatrix,
  )
  const templateWriteSurfaceLegacyScopeSanitizerMissingReasons = buildTemplateWriteSurfaceLegacyScopeSanitizerMissingReasons(
    input.templateWriteSurfaceLegacyScopeSanitizerMatrix,
  )
  const metricProductionSnapshotPublicationRollbackMissingReasons = buildMetricProductionSnapshotPublicationRollbackMissingReasons(
    input.metricProductionSnapshotPublicationRollbackMatrix,
  )
  const metricConsumerPathCoverageMissingReasons = buildMetricConsumerPathCoverageMissingReasons(
    input.metricConsumerPathCoverageMatrix,
  )
  const futureAssetRediscoveryGateRerunMissingReasons = buildFutureAssetRediscoveryGateRerunMissingReasons(
    input.futureAssetRediscoveryGateRerunMatrix,
  )
  const operableGovernanceFrontendMissingReasons = buildOperableGovernanceFrontendMissingReasons(
    input.operableGovernanceFrontendMatrix,
  )
  const domainReleaseRuntimeClosureMissingReasons = buildDomainReleaseRuntimeClosureMissingReasons(
    input.domainReleaseRuntimeClosureMatrix,
  )
  const crossScopeReplayEvidenceMissingReasons = buildCrossScopeReplayEvidenceMissingReasons(
    input.crossScopeReplayEvidenceMatrix,
  )
  const constructionOrganizationPrecisionReplayMissingReasons =
    buildConstructionOrganizationPrecisionReplayMissingReasons(
      input.constructionOrganizationPrecisionReplayMatrix,
    )
  const constructionOrganizationRuntimeCloseoutClaimMissingReasons =
    buildConstructionOrganizationRuntimeCloseoutClaimMissingReasons(
      input.constructionOrganizationRuntimeCloseoutClaim,
    )
  const constructionOrganizationProductOutcomeCloseoutMissingReasons =
    buildConstructionOrganizationProductOutcomeCloseoutMissingReasons(
      input.constructionOrganizationProductOutcomeCloseoutMatrix,
    )

  const gates = [
    gate(
      'asset_inventory_diagnostics',
      totalAssetCount > 0 && algorithmSeedCount > 0,
      ['algorithmRuleAssetInventoryService'],
      ['inventory_summary_required'],
    ),
    gate(
      'admission_automation',
      input.admissionStatus === 'pass' && reviewItemCount === 0 && blockerCount === 0,
      ['v14AssetAdmissionAutomationService'],
      [
        ...(input.admissionStatus === 'pass' ? [] : ['admission_status_pass_required']),
        ...(reviewItemCount === 0 ? [] : ['admission_review_items_must_be_cleared']),
        ...(blockerCount === 0 ? [] : ['admission_blockers_must_be_cleared']),
      ],
    ),
    gate(
      'admission_governance_defaults',
      conservativeGovernanceDefaultCount === 0 && governanceDefaultReviewItems.length === 0,
      ['v14AssetAdmissionAutomationService'],
      governanceDefaultReviewItems.length > 0
        ? governanceDefaultReviewItems.map((item) => `${item.assetKey}:${item.reason}`)
        : ['conservative_governance_defaults_must_be_explicitly_registered'],
    ),
    gate(
      'backend_operations_workbench',
      backendWorkbenchEvidenceRefs.length > 0,
      backendWorkbenchEvidenceRefs,
      ['backend_operations_workbench_evidence_required'],
    ),
    gate(
      'company_governance_evidence',
      Boolean(input.governanceEvidence),
      ['algorithmAssetGovernanceDashboardEvidenceService'],
      ['company_governance_evidence_required'],
    ),
    gate(
      'frontend_admin_operations_page',
      frontendAdminPageEvidenceRefs.length > 0,
      frontendAdminPageEvidenceRefs,
      ['frontend_admin_operations_page_evidence_required'],
    ),
    gate(
      'ordinary_business_dto_exposure_matrix',
      Boolean(input.ordinaryBusinessDtoExposureMatrix?.canDeclareOrdinaryBusinessDtoExposureComplete),
      input.ordinaryBusinessDtoExposureMatrix ? ['ordinaryBusinessDtoExposureMatrixService'] : [],
      ordinaryBusinessDtoExposureMissingReasons,
    ),
    gate(
      'template_write_surface_legacy_scope_sanitizer_matrix',
      Boolean(input.templateWriteSurfaceLegacyScopeSanitizerMatrix?.canDeclareTemplateWriteSurfaceLegacyScopeSanitizerComplete),
      input.templateWriteSurfaceLegacyScopeSanitizerMatrix ? ['templateWriteSurfaceLegacyScopeSanitizerMatrixService'] : [],
      templateWriteSurfaceLegacyScopeSanitizerMissingReasons,
    ),
    gate(
      'runtime_asset_isolation_matrix',
      Boolean(input.runtimeIsolationMatrix?.canDeclareAssetIsolationComplete),
      input.runtimeIsolationMatrix ? ['algorithmAssetIsolationMatrixService'] : [],
      runtimeIsolationMissingReasons,
    ),
    gate(
      'parameter_runtime_consumers',
      verifiedParameterConsumers.length > 0 && parameterPendingGroups.length === 0,
      verifiedParameterConsumers,
      parameterPendingGroups.length > 0 ? parameterPendingGroups : ['parameter_consumer_evidence_required'],
    ),
    gate(
      'metric_source_coverage',
      registeredMetricSources.length > 0 && pendingMetricSourceGroups.length === 0 && missingMetricSources.length === 0,
      registeredMetricSources,
      [
        ...pendingMetricSourceGroups,
        ...missingMetricSources,
        ...(pendingMetricSourceGroups.length === 0 && missingMetricSources.length === 0 ? ['metric_source_evidence_required'] : []),
      ],
    ),
    gate(
      'metric_production_snapshot_publication_rollback_matrix',
      Boolean(input.metricProductionSnapshotPublicationRollbackMatrix?.canDeclareMetricProductionSnapshotPublicationRollbackComplete),
      input.metricProductionSnapshotPublicationRollbackMatrix ? ['metricProductionSnapshotPublicationRollbackMatrixService'] : [],
      metricProductionSnapshotPublicationRollbackMissingReasons,
    ),
    gate(
      'metric_consumer_path_coverage_matrix',
      Boolean(input.metricConsumerPathCoverageMatrix?.canDeclareMetricConsumerPathCoverageComplete),
      input.metricConsumerPathCoverageMatrix ? ['metricConsumerPathCoverageMatrixService'] : [],
      metricConsumerPathCoverageMissingReasons,
    ),
    gate(
      'future_asset_rediscovery_gate_rerun_matrix',
      Boolean(input.futureAssetRediscoveryGateRerunMatrix?.canDeclareFutureAssetRediscoveryGateRerunComplete),
      input.futureAssetRediscoveryGateRerunMatrix ? ['futureAssetRediscoveryGateRerunMatrixService'] : [],
      futureAssetRediscoveryGateRerunMissingReasons,
    ),
    gate(
      'operable_governance_frontend_matrix',
      Boolean(input.operableGovernanceFrontendMatrix?.canDeclareOperableGovernanceFrontendComplete),
      input.operableGovernanceFrontendMatrix ? ['operableGovernanceFrontendMatrixService'] : [],
      operableGovernanceFrontendMissingReasons,
    ),
    gate(
      'domain_release_runtime_closure_matrix',
      Boolean(input.domainReleaseRuntimeClosureMatrix?.canDeclareDomainReleaseRuntimeClosureComplete),
      input.domainReleaseRuntimeClosureMatrix ? ['domainReleaseRuntimeClosureMatrixService'] : [],
      domainReleaseRuntimeClosureMissingReasons,
    ),
    gate(
      'cross_scope_replay_evidence_matrix',
      Boolean(input.crossScopeReplayEvidenceMatrix?.canDeclareCrossScopeReplayEvidenceComplete),
      input.crossScopeReplayEvidenceMatrix ? ['crossScopeReplayEvidenceMatrixService'] : [],
      crossScopeReplayEvidenceMissingReasons,
    ),
    gate(
      'construction_organization_precision_replay_matrix',
      input.constructionOrganizationPrecisionReplayMatrix?.status === 'precision_replay_matrix_ready',
      input.constructionOrganizationPrecisionReplayMatrix
        ? ['constructionOrganizationPrecisionReplayMatrixService']
        : [],
      constructionOrganizationPrecisionReplayMissingReasons,
      buildConstructionOrganizationPrecisionReplayGateDetail(input.constructionOrganizationPrecisionReplayMatrix),
    ),
    gate(
      'construction_organization_runtime_closeout_claim',
      input.constructionOrganizationRuntimeCloseoutClaim?.canClaimRuntimeCloseout === true,
      input.constructionOrganizationRuntimeCloseoutClaim
        ? ['constructionOrganizationPlanNetworkDraftService.runtimeCloseoutClaim']
        : [],
      constructionOrganizationRuntimeCloseoutClaimMissingReasons,
    ),
    gate(
      'construction_organization_product_outcome_closeout_matrix',
      input.constructionOrganizationProductOutcomeCloseoutMatrix?.canDeclareConstructionOrganizationProductOutcomeCloseout === true,
      input.constructionOrganizationProductOutcomeCloseoutMatrix
        ? ['constructionOrganizationProductOutcomeCloseoutMatrixService']
        : [],
      constructionOrganizationProductOutcomeCloseoutMissingReasons,
      buildConstructionOrganizationProductOutcomeCloseoutGateDetail(
        input.constructionOrganizationProductOutcomeCloseoutMatrix,
        input.companyId,
      ),
    ),
  ]

  const canDeclareGovernanceWorkbenchComplete = gates.every((item) => item.status === 'ready')
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const readyGateCount = gates.filter((item) => item.status === 'ready').length
  const needsWorkGateCount = gates.length - readyGateCount
  const remainingClosureGaps = V14223_WORKBENCH_READINESS_REMAINING_CLOSURE_GAPS.filter((gap) => {
    if (gap.key === 'ordinary_business_page_dto_technical_field_exposure_matrix') {
      return !input.ordinaryBusinessDtoExposureMatrix?.canDeclareOrdinaryBusinessDtoExposureComplete
    }
    if (gap.key === 'all_template_write_surfaces_legacy_scope_sanitizer') {
      return !input.templateWriteSurfaceLegacyScopeSanitizerMatrix?.canDeclareTemplateWriteSurfaceLegacyScopeSanitizerComplete
    }
    if (gap.key === 'metric_production_snapshot_publish_rollback_closure') {
      return !input.metricProductionSnapshotPublicationRollbackMatrix?.canDeclareMetricProductionSnapshotPublicationRollbackComplete
    }
    if (gap.key === 'metric_consumer_path_coverage') {
      return !input.metricConsumerPathCoverageMatrix?.canDeclareMetricConsumerPathCoverageComplete
    }
    if (gap.key === 'future_assets_rediscovery_and_gate_rerun') {
      return !input.futureAssetRediscoveryGateRerunMatrix?.canDeclareFutureAssetRediscoveryGateRerunComplete
    }
    if (gap.key === 'complete_operable_governance_frontend') {
      return !input.operableGovernanceFrontendMatrix?.canDeclareOperableGovernanceFrontendComplete
    }
    if (gap.key === 'all_domain_release_adapters_runtime_writers_consumers_monitoring_rollback') {
      return !input.domainReleaseRuntimeClosureMatrix?.canDeclareDomainReleaseRuntimeClosureComplete
    }
    if (gap.key === 'cross_company_cross_project_replay_evidence') {
      return !input.crossScopeReplayEvidenceMatrix?.canDeclareCrossScopeReplayEvidenceComplete
    }
    if (gap.key === 'construction_organization_precision_replay_matrix') {
      return input.constructionOrganizationPrecisionReplayMatrix?.status !== 'precision_replay_matrix_ready'
    }
    if (gap.key === 'construction_organization_runtime_closeout_claim') {
      return input.constructionOrganizationRuntimeCloseoutClaim?.canClaimRuntimeCloseout !== true
    }
    if (gap.key === 'construction_organization_product_outcome_closeout_matrix') {
      return input.constructionOrganizationProductOutcomeCloseoutMatrix?.canDeclareConstructionOrganizationProductOutcomeCloseout !== true
    }
    return true
  })

  return {
    reportCode: 'v14223_rule_asset_governance_workbench_readiness',
    companyId: normalizeText(input.companyId),
    status: canDeclareGovernanceWorkbenchComplete ? 'workbench_ready' : 'workbench_incomplete',
    canDeclareGovernanceWorkbenchComplete,
    completionScope: 'workbench_readiness_evidence_only',
    canDeclareV14223GovernanceComplete: false,
    remainingClosureGaps,
    frontendExposurePolicy: 'backend_admin_governance_only',
    runtimeMutationPolicy: 'none_read_only_evidence_and_gap_report',
    summary: {
      totalAssetCount,
      algorithmSeedCount,
      totalDiscoveredCount,
      registeredCount,
      reviewItemCount,
      blockerCount,
      durationRelatedAssetCount,
      durationRelatedCoverageRatio,
      explicitGovernanceFieldCount,
      conservativeGovernanceDefaultCount,
      governanceDefaultReviewItemCount: governanceDefaultReviewItems.length,
      candidateReviewRequiredCount,
      replayBlockedOrFailedCount,
      sampleHealthWeakOrRejectedCount,
      readyGateCount,
      needsWorkGateCount,
      totalGateCount: gates.length,
    },
    governanceDefaultReviewItems,
    gates,
    boundaryPolicy: [
      'workbench_readiness_does_not_grant_publish_rights',
      'dashboard_or_workbench_summary_is_not_runtime_writer_evidence',
      'controlled_operation_handoff_must_use_registered_domain_writer_and_does_not_bypass_publish_anchors',
      'admission_governance_defaults_are_review_items_not_publish_rights',
      'metric_source_registration_is_not_runtime_consumer_or_publish_evidence',
      'future_asset_rerun_matrix_is_current_snapshot_only',
      'ready_matrix_is_not_future_asset_whitelist',
      ...(input.operableGovernanceFrontendMatrix?.boundaryPolicy ?? []),
      ...(input.domainReleaseRuntimeClosureMatrix?.boundaryPolicy ?? []),
      ...(input.crossScopeReplayEvidenceMatrix?.boundaryPolicy ?? []),
      ...(input.metricConsumerPathCoverageMatrix?.boundaryPolicy ?? []),
      ...(input.constructionOrganizationPrecisionReplayMatrix ? [
        'construction_organization_precision_replay_is_candidate_projection_not_runtime_saved_outcome',
        'construction_organization_precision_replay_does_not_grant_auto_materialization',
      ] : []),
      ...(input.constructionOrganizationRuntimeCloseoutClaim?.boundaryPolicy ?? []),
      ...(input.constructionOrganizationRuntimeCloseoutClaim ? [
        'construction_organization_runtime_closeout_claim_does_not_grant_auto_materialization',
      ] : []),
      ...(input.constructionOrganizationProductOutcomeCloseoutMatrix?.boundaryPolicy ?? []),
      ...(input.constructionOrganizationProductOutcomeCloseoutMatrix ? [
        'construction_organization_product_outcome_closeout_does_not_grant_auto_materialization',
      ] : []),
      'incomplete_gates_remain_review_required',
    ],
  }
}
