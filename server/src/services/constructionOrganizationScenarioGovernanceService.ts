import {
  createAndPersistAlgorithmAssetCandidateEvent,
  type AlgorithmAssetCandidateEvent,
} from './algorithmAssetCandidateEventAdapterService.js'
import type {
  AlgorithmAssetGovernanceQueryExec,
  PersistAlgorithmAssetCandidateEventResult,
} from './algorithmAssetGovernancePersistenceService.js'
import type {
  ConstructionOrganizationPlanOption,
  ConstructionOrganizationScenarioSelection,
} from '../types/constructionOrganizationScenario.js'

export type PersistConstructionOrganizationScenarioCandidateEventsInput = {
  companyId?: string | null
  projectId?: string | null
  selection: ConstructionOrganizationScenarioSelection
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export type PersistConstructionOrganizationScenarioCandidateEventsResult = {
  persistedEventCount: number
  events: AlgorithmAssetCandidateEvent[]
  persistence: PersistAlgorithmAssetCandidateEventResult[]
}

export type ConstructionOrganizationExperienceAssetDispositionRow = {
  objectKey: string
  objectName: string
  ownerService: 'constructionOrganizationScenarioGovernanceService'
  sourceSurface: string
  experienceTier: 'T3'
  experienceAssetType: 'construction_organization_profile'
  lifecycleDisposition: 'governed_candidate_event'
  registryDisposition: 'experience_tier_registry_candidate_registered'
  seedDisposition: 'not_algorithm_seed_do_not_write_algorithm_seed_records'
  runtimeDisposition: 'not_runtime_reader_or_writer_until_release_exit'
  deletionDisposition: 'retain_governance_payload_until_candidate_audit_or_explicit_deprecation'
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesRuntimePublication: false
    readsRuntimeReader: false
  }
  evidenceRefs: string[]
}

export type ConstructionOrganizationExperienceAssetDispositionMatrix = {
  matrixCode: 'c1912_construction_organization_experience_asset_disposition'
  status: 'non_live_object_disposition_closed'
  canDeclareNonLiveObjectDispositionClosed: true
  rows: ConstructionOrganizationExperienceAssetDispositionRow[]
  liveOnlyTail: string[]
}

const CONSTRUCTION_ORGANIZATION_EXPERIENCE_ASSET_ROWS: ConstructionOrganizationExperienceAssetDispositionRow[] = [
  {
    objectKey: 'construction_organization_profile_seed_candidate',
    objectName: '施工组织画像 seed 候选',
    ownerService: 'constructionOrganizationScenarioGovernanceService',
    sourceSurface: 'candidatePayload.experienceTierRegistryCandidate',
    experienceTier: 'T3',
    experienceAssetType: 'construction_organization_profile',
    lifecycleDisposition: 'governed_candidate_event',
    registryDisposition: 'experience_tier_registry_candidate_registered',
    seedDisposition: 'not_algorithm_seed_do_not_write_algorithm_seed_records',
    runtimeDisposition: 'not_runtime_reader_or_writer_until_release_exit',
    deletionDisposition: 'retain_governance_payload_until_candidate_audit_or_explicit_deprecation',
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesRuntimePublication: false,
      readsRuntimeReader: false,
    },
    evidenceRefs: [
      'experienceTierRegistryService:T3:construction_organization_profile',
      'constructionOrganizationScenarioGovernanceService:buildExperienceTierScope',
      'constructionOrganizationScenarioGovernanceService.test:assessExperienceTierCandidatePayload',
    ],
  },
  {
    objectKey: 'construction_organization_plan_option_experience_asset',
    objectName: '施工组织方案选择经验资产',
    ownerService: 'constructionOrganizationScenarioGovernanceService',
    sourceSurface: 'algorithm_asset_candidate_events.candidate_payload.option',
    experienceTier: 'T3',
    experienceAssetType: 'construction_organization_profile',
    lifecycleDisposition: 'governed_candidate_event',
    registryDisposition: 'experience_tier_registry_candidate_registered',
    seedDisposition: 'not_algorithm_seed_do_not_write_algorithm_seed_records',
    runtimeDisposition: 'not_runtime_reader_or_writer_until_release_exit',
    deletionDisposition: 'retain_governance_payload_until_candidate_audit_or_explicit_deprecation',
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesRuntimePublication: false,
      readsRuntimeReader: false,
    },
    evidenceRefs: [
      'algorithm_asset_candidate_events:candidate_weight',
      'constructionOrganizationScenarioGovernanceService:buildCandidatePayload',
      'constructionOrganizationScenarioGovernanceService.test:governed_candidate_event',
    ],
  },
]

export function buildConstructionOrganizationExperienceAssetDispositionMatrix(): ConstructionOrganizationExperienceAssetDispositionMatrix {
  return {
    matrixCode: 'c1912_construction_organization_experience_asset_disposition',
    status: 'non_live_object_disposition_closed',
    canDeclareNonLiveObjectDispositionClosed: true,
    rows: CONSTRUCTION_ORGANIZATION_EXPERIENCE_ASSET_ROWS.map((row) => ({
      ...row,
      mutationBoundary: { ...row.mutationBoundary },
      evidenceRefs: [...row.evidenceRefs],
    })),
    liveOnlyTail: [
      'runtime_reader_live_replay',
      'manual_conflict_review_decision',
      'release_exit_approval',
      'runtime_publication_apply',
      'impact_monitoring',
      'rollback',
    ],
  }
}

function safeAssetKeySegment(value: string) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:+-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function safeGroupKeySegment(value: unknown, fallback: string) {
  return safeAssetKeySegment(String(value ?? '')) || fallback
}

function buildExperienceTierScope(selection: ConstructionOrganizationScenarioSelection, option: ConstructionOrganizationPlanOption) {
  const factBasis = readRecord(selection.factBasis)
  const scheme = readRecord(option.projectOrganizationScheme)
  const businessType = safeGroupKeySegment(
    factBasis.businessType ?? factBasis.business_type ?? factBasis.projectTypeCode ?? factBasis.project_type_code,
    'unknown_business_type',
  )
  const scale = safeGroupKeySegment(
    factBasis.scaleBand ?? factBasis.scale_band ?? factBasis.buildingCount ?? factBasis.building_count,
    'unknown_scale',
  )
  const region = safeGroupKeySegment(
    factBasis.regionCode ?? factBasis.region_code ?? factBasis.climateRegion ?? factBasis.climate_region,
    'unknown_region',
  )
  const deliveryModel = safeGroupKeySegment(
    scheme.schemeFamily ?? scheme.deliveryModel ?? scheme.delivery_model ?? option.optionId,
    'unknown_delivery_model',
  )

  return {
    experienceTier: 'T3' as const,
    experienceAssetType: 'construction_organization_profile' as const,
    reuseScope: 'project' as const,
    learningScope: 'project' as const,
    wbsNodeTypes: ['project'] as const,
    businessTypeCodes: [businessType],
    scaleBands: [scale],
    regionCodes: [region],
    deliveryModels: [deliveryModel],
    experienceGroupKeys: Array.from(new Set([
      `T3:construction_organization:${businessType}:${scale}:${region}:${deliveryModel}`,
      `T3:project:${businessType}:${deliveryModel}`,
    ])).sort((left, right) => left.localeCompare(right)),
    experienceTierRegistryCandidate: {
      tier: 'T3' as const,
      reusableAtNodeTypes: ['project', 'building', 'zone'] as const,
      groupKeyStrategy: 'business_type_scale_region_delivery_model' as const,
      prohibitsT1T2BucketMixing: true as const,
      requiredRegistry: 'experienceTierRegistry' as const,
      registryStatus: 'candidate_payload_ready_pending_registry_materialization' as const,
    },
  }
}

function summarizePlanOption(option: ConstructionOrganizationPlanOption) {
  const summarizeUseCaseEvaluations = option.evaluation.useCaseEvaluations
    ? {
        newProjectPlanning: option.evaluation.useCaseEvaluations.newProjectPlanning,
        startingLineOnboarding: option.evaluation.useCaseEvaluations.startingLineOnboarding,
        accelerationRecovery: option.evaluation.useCaseEvaluations.accelerationRecovery,
      }
    : null

  return {
    optionId: option.optionId,
    selectedScenarioIds: option.selectedScenarioIds,
    projectOrganizationScheme: option.projectOrganizationScheme,
    combinedScore: option.combinedScore,
    confidence: option.confidence,
    recoveryFactorHint: option.evaluation.recoveryFactorHint,
    networkEvaluation: {
      evaluationRole: option.evaluation.networkEvaluation.evaluationRole,
      e3NetworkBasis: option.evaluation.networkEvaluation.e3NetworkBasis,
      projectDurationDays: option.evaluation.networkEvaluation.projectDurationDays,
      criticalNodeIds: option.evaluation.networkEvaluation.criticalNodeIds,
      edgeCount: option.evaluation.networkEvaluation.edgeCount,
      e5RecoverableSpanDays: option.evaluation.networkEvaluation.e5RecoverableSpanDays,
      writesTaskDependencies: option.evaluation.networkEvaluation.writesTaskDependencies,
      writesPlanDates: option.evaluation.networkEvaluation.writesPlanDates,
      writesCriticalPathFacts: option.evaluation.networkEvaluation.writesCriticalPathFacts,
    },
    engineEvaluationSummary: {
      source: option.evaluation.engineEvaluationSummary.source,
      evaluationRole: option.evaluation.engineEvaluationSummary.evaluationRole,
      e1: option.evaluation.engineEvaluationSummary.e1,
      e3: option.evaluation.engineEvaluationSummary.e3,
      e5: option.evaluation.engineEvaluationSummary.e5,
      projectOrganization: option.evaluation.engineEvaluationSummary.projectOrganization,
      boundary: option.evaluation.engineEvaluationSummary.boundary,
    },
    generatedRowProjection: option.evaluation.generatedRowProjection
      ? {
          source: option.evaluation.generatedRowProjection.source,
          projectionBasis: option.evaluation.generatedRowProjection.projectionBasis,
          generatedScheduleSpanDays: option.evaluation.generatedRowProjection.generatedScheduleSpanDays,
          virtualProjectDurationDays: option.evaluation.generatedRowProjection.virtualProjectDurationDays,
          spanDeltaDays: option.evaluation.generatedRowProjection.spanDeltaDays,
          dependencyAlignmentScore: option.evaluation.generatedRowProjection.dependencyAlignmentScore,
          projectionConfidence: option.evaluation.generatedRowProjection.projectionConfidence,
          mappedNodeCount: option.evaluation.generatedRowProjection.mappedNodeCount,
          generatedRowMatchCount: option.evaluation.generatedRowProjection.generatedRowMatchCount,
          unmappedNodeIds: option.evaluation.generatedRowProjection.unmappedNodeIds,
          candidateDependencyPreview: option.evaluation.generatedRowProjection.candidateDependencyPreview
            ? {
                source: option.evaluation.generatedRowProjection.candidateDependencyPreview.source,
                previewBasis: option.evaluation.generatedRowProjection.candidateDependencyPreview.previewBasis,
                materializationReadiness: option.evaluation.generatedRowProjection.candidateDependencyPreview.materializationReadiness,
                previewEdgeCount: option.evaluation.generatedRowProjection.candidateDependencyPreview.previewEdges.length,
                unresolvedEdgeCount: option.evaluation.generatedRowProjection.candidateDependencyPreview.unresolvedEdges.length,
                previewEdges: option.evaluation.generatedRowProjection.candidateDependencyPreview.previewEdges,
                unresolvedEdges: option.evaluation.generatedRowProjection.candidateDependencyPreview.unresolvedEdges,
                writesTaskDependencies: option.evaluation.generatedRowProjection.candidateDependencyPreview.writesTaskDependencies,
                writesPlanDates: option.evaluation.generatedRowProjection.candidateDependencyPreview.writesPlanDates,
                writesCriticalPathFacts: option.evaluation.generatedRowProjection.candidateDependencyPreview.writesCriticalPathFacts,
              }
            : null,
          candidateMaterializationEvaluation: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation
            ? {
                source: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.source,
                materializationBasis: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.materializationBasis,
                previewEdgeCount: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.previewEdgeCount,
                satisfiedEdgeCount: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.satisfiedEdgeCount,
                violatedEdgeCount: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.violatedEdgeCount,
                unresolvedEdgeCount: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.unresolvedEdgeCount,
                materializedNetworkSpanDays: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.materializedNetworkSpanDays,
                materializationScore: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.materializationScore,
                violationDetails: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.violationDetails,
                writesTaskDependencies: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.writesTaskDependencies,
                writesPlanDates: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.writesPlanDates,
                writesCriticalPathFacts: option.evaluation.generatedRowProjection.candidateMaterializationEvaluation.writesCriticalPathFacts,
              }
            : null,
          materializationDecision: option.evaluation.generatedRowProjection.materializationDecision
            ? {
                source: option.evaluation.generatedRowProjection.materializationDecision.source,
                decision: option.evaluation.generatedRowProjection.materializationDecision.decision,
                allowManualMaterialization: option.evaluation.generatedRowProjection.materializationDecision.allowManualMaterialization,
                reasons: option.evaluation.generatedRowProjection.materializationDecision.reasons,
                writesTaskDependencies: option.evaluation.generatedRowProjection.materializationDecision.writesTaskDependencies,
                writesPlanDates: option.evaluation.generatedRowProjection.materializationDecision.writesPlanDates,
                writesCriticalPathFacts: option.evaluation.generatedRowProjection.materializationDecision.writesCriticalPathFacts,
              }
            : null,
          materializationReviewPackage: option.evaluation.generatedRowProjection.materializationReviewPackage
            ? {
                source: option.evaluation.generatedRowProjection.materializationReviewPackage.source,
                packageBasis: option.evaluation.generatedRowProjection.materializationReviewPackage.packageBasis,
                optionId: option.evaluation.generatedRowProjection.materializationReviewPackage.optionId,
                status: option.evaluation.generatedRowProjection.materializationReviewPackage.status,
                allowManualReview: option.evaluation.generatedRowProjection.materializationReviewPackage.allowManualReview,
                proposedDependencyEdgeCount: option.evaluation.generatedRowProjection.materializationReviewPackage.proposedDependencyEdgeCount,
                blockedReasons: option.evaluation.generatedRowProjection.materializationReviewPackage.blockedReasons,
                proposedDependencyEdges: option.evaluation.generatedRowProjection.materializationReviewPackage.proposedDependencyEdges,
                conflictEvidence: option.evaluation.generatedRowProjection.materializationReviewPackage.conflictEvidence,
                reviewRequired: option.evaluation.generatedRowProjection.materializationReviewPackage.reviewRequired,
                writesTaskDependencies: option.evaluation.generatedRowProjection.materializationReviewPackage.writesTaskDependencies,
                writesPlanDates: option.evaluation.generatedRowProjection.materializationReviewPackage.writesPlanDates,
                writesCriticalPathFacts: option.evaluation.generatedRowProjection.materializationReviewPackage.writesCriticalPathFacts,
              }
            : null,
          generatedRowReferenceDurationEvidence: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence
            ? {
                source: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.source,
                durationBasis: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.durationBasis,
                matchedReferenceRowCount: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.matchedReferenceRowCount,
                totalPlanReferenceDays: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.totalPlanReferenceDays,
                totalContextualReferenceDays: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.totalContextualReferenceDays,
                totalRecommendedDurationDays: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.totalRecommendedDurationDays,
                phaseDurations: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.phaseDurations,
                writesReferenceDuration: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.writesReferenceDuration,
                writesPlanDates: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.writesPlanDates,
                writesSeed: option.evaluation.generatedRowProjection.generatedRowReferenceDurationEvidence.writesSeed,
              }
            : null,
          generatedRowNetworkEvaluation: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation
            ? {
                source: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.source,
                networkBasis: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.networkBasis,
                projectedNetworkSpanDays: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.projectedNetworkSpanDays,
                previewEdgeCount: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.previewEdgeCount,
                unresolvedEdgeCount: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.unresolvedEdgeCount,
                criticalGeneratedRowIds: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.criticalGeneratedRowIds,
                materializationStatus: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.materializationStatus,
                rowSchedule: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.rowSchedule,
                writesTaskDependencies: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.writesTaskDependencies,
                writesPlanDates: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.writesPlanDates,
                writesCriticalPathFacts: option.evaluation.generatedRowProjection.generatedRowNetworkEvaluation.writesCriticalPathFacts,
              }
            : null,
          writesTaskDependencies: option.evaluation.generatedRowProjection.writesTaskDependencies,
          writesPlanDates: option.evaluation.generatedRowProjection.writesPlanDates,
          writesCriticalPathFacts: option.evaluation.generatedRowProjection.writesCriticalPathFacts,
        }
      : null,
    useCaseEvaluations: summarizeUseCaseEvaluations,
    virtualNetworkTotalSpanDays: option.combinedVirtualNetwork.totalSpanDays,
    virtualNetworkCriticalNodeIds: option.combinedVirtualNetwork.criticalNodeIds,
    excludedScenarioIds: option.excludedScenarioIds,
    excludedReasons: option.excludedReasons,
  }
}

function summarizeUseCaseRecommendations(selection: ConstructionOrganizationScenarioSelection) {
  const summarize = (
    recommendation: ConstructionOrganizationScenarioSelection['scenarioRecommendations'][keyof ConstructionOrganizationScenarioSelection['scenarioRecommendations']] | undefined,
  ) => recommendation
    ? {
        useCase: recommendation.useCase,
        optionId: recommendation.optionId,
        selectedScenarioIds: recommendation.selectedScenarioIds,
        recommendationBasis: recommendation.recommendationBasis,
        confidence: recommendation.confidence,
        actionability: recommendation.actionability,
        currentSubstage: recommendation.currentSubstage ?? null,
        recoveryFactorHint: recommendation.recoveryFactorHint,
        writesTaskDependencies: recommendation.writesTaskDependencies,
        writesPlanDates: recommendation.writesPlanDates,
        writesSeed: recommendation.writesSeed,
      }
    : null

  return selection.scenarioRecommendations
    ? {
        newProjectPlanning: summarize(selection.scenarioRecommendations.newProjectPlanning),
        startingLineOnboarding: summarize(selection.scenarioRecommendations.startingLineOnboarding),
        accelerationRecovery: summarize(selection.scenarioRecommendations.accelerationRecovery),
      }
    : null
}

function buildCandidatePayload(
  selection: ConstructionOrganizationScenarioSelection,
  option: ConstructionOrganizationPlanOption,
  identity: Pick<PersistConstructionOrganizationScenarioCandidateEventsInput, 'companyId' | 'projectId'>,
) {
  const dispositionMatrix = buildConstructionOrganizationExperienceAssetDispositionMatrix()
  return {
    source: selection.source,
    sourceVersion: selection.sourceVersion,
    companyId: identity.companyId ?? null,
    projectId: identity.projectId ?? null,
    ...buildExperienceTierScope(selection, option),
    experienceAssetDisposition: {
      matrixCode: dispositionMatrix.matrixCode,
      status: dispositionMatrix.status,
      objectKeys: dispositionMatrix.rows.map((row) => row.objectKey),
      liveOnlyTail: dispositionMatrix.liveOnlyTail,
    },
    recommendedPlanOptionId: selection.recommendedPlanOption.optionId,
    recommendedScenarioIds: selection.recommendedScenarioIds,
    scenarioRecommendations: summarizeUseCaseRecommendations(selection),
    confidence: selection.confidence,
    option: summarizePlanOption(option),
    planOptionCount: selection.planOptions.length,
    factBasis: selection.factBasis,
    boundaryPolicy: selection.boundaryPolicy,
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
    },
    replayRequirements: [
      'compare_option_against_generated_schedule_outcome',
      'validate_e3_virtual_network_against_real_critical_path_snapshot',
      'validate_e5_recovery_factor_against_adopted_acceleration_outcome',
    ],
  }
}

export async function persistConstructionOrganizationScenarioCandidateEvents(
  input: PersistConstructionOrganizationScenarioCandidateEventsInput,
): Promise<PersistConstructionOrganizationScenarioCandidateEventsResult> {
  const events: AlgorithmAssetCandidateEvent[] = []
  const persistence: PersistAlgorithmAssetCandidateEventResult[] = []

  for (const option of input.selection.planOptions) {
    const result = await createAndPersistAlgorithmAssetCandidateEvent({
      assetKey: `construction_organization.plan_option.${safeAssetKeySegment(option.optionId)}`,
      sourceSystem: 'constructionOrganizationScenarioGovernanceService',
      assetType: 'rule',
      companyId: input.companyId,
      projectId: input.projectId,
      candidatePayload: buildCandidatePayload(input.selection, option, input),
      learningTarget: 'candidate_weight',
      learningMaturity: 'governed_candidate',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_review_package',
      requestedRuntimeEffect: 'candidate_only',
      generatedBy: 'service',
      queryExec: input.queryExec,
    })
    events.push(result.event)
    persistence.push(result.persistence)
  }

  return {
    persistedEventCount: events.length,
    events,
    persistence,
  }
}
