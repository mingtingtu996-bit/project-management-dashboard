import {
  buildProjectGenerationFactsSnapshot,
} from './projectGenerationFactsSnapshotService.js'
import {
  resolveProjectConstructionOrganizationPolicy,
  type ProjectConstructionOrganizationPolicySelectionContext,
} from '../seeds/projectConstructionOrganizationPolicySeed.js'

export type ConstructionOrganizationScenarioId =
  | 'pile_before_excavation'
  | 'excavation_before_pile'
  | 'tower_lane_early_release_after_core_basement'
  | 'shared_basement_first_then_tower'
  | 'outdoor_site_early_release_after_basement_backfill'
  | 'outdoor_site_after_primary_structure'

export type ConstructionOrganizationScenarioFeasibility = 'recommended' | 'candidate' | 'rejected'

export type ConstructionOrganizationScenarioCandidateEvaluation = {
  evaluationRole: 'candidate_network_score_for_e1_e3_e5'
  compositeScore: number
  e1DurationBasis: 'virtual_work_package_duration_proxy_pending_generated_row_projection'
  e3NetworkBasis: 'virtual_dependency_network_not_persisted'
  e5AccelerationBasis: 'scenario_recovery_factor_hint'
  recoveryFactorHint: number
  scheduleRiskLevel: 'low' | 'medium' | 'high'
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
}

export type ConstructionOrganizationVirtualNetworkNode = {
  id: string
  label: string
  phase: 'foundation' | 'earthwork' | 'basement' | 'tower' | 'outdoor' | 'handoff'
  durationDays: number
}

export type ConstructionOrganizationVirtualNetworkDependency = {
  fromNodeId: string
  toNodeId: string
  dependencyType: 'FS' | 'SS'
  lagDays: number
  intent: string
}

export type ConstructionOrganizationVirtualNetwork = {
  source: 'construction_organization_virtual_network'
  nodes: ConstructionOrganizationVirtualNetworkNode[]
  dependencies: ConstructionOrganizationVirtualNetworkDependency[]
  totalSpanDays: number
  criticalNodeIds: string[]
  writesTaskDependencies: false
  writesPlanDates: false
}

export type ConstructionOrganizationVirtualNetworkScheduleNode = {
  nodeId: string
  startDay: number
  finishDay: number
  durationDays: number
  totalFloatDays: number
  isCritical: boolean
}

export type ConstructionOrganizationPlanOptionNetworkEvaluation = {
  evaluationRole: 'virtual_plan_option_network_cpm_for_e3_e5'
  e3NetworkBasis: 'combined_virtual_dependency_network_cpm_evaluated_not_persisted'
  projectDurationDays: number
  networkSchedule: ConstructionOrganizationVirtualNetworkScheduleNode[]
  criticalNodeIds: string[]
  edgeCount: number
  e5RecoverableSpanDays: number
  writesTaskDependencies: false
  writesPlanDates: false
  writesCriticalPathFacts: false
}

export type ConstructionOrganizationPlanOptionEngineEvaluationSummary = {
  source: 'construction_organization_plan_option_engine_evaluation_summary'
  evaluationRole: 'candidate_option_e1_e3_e5_summary_not_runtime_execution'
  e1: {
    input: 'selected_virtual_work_packages'
    output: 'virtual_work_package_duration_proxy_pending_generated_row_projection'
    selectedWorkPackageCount: number
    selectedScenarioIds: ConstructionOrganizationScenarioId[]
    writesReferenceDuration: false
  }
  e3: {
    input: 'combined_virtual_dependency_network'
    output: 'virtual_cpm_duration_and_critical_nodes'
    projectDurationDays: number
    criticalNodeCount: number
    edgeCount: number
    writesCriticalPathSnapshot: false
  }
  e5: {
    input: 'use_case_acceleration_recovery_evaluation'
    output: 'bounded_recovery_factor_hint'
    recoveryFactorHint: number
    recoverableSpanDays: number
    writesAccelerationDraft: false
  }
  projectOrganization: ConstructionOrganizationPlanOptionProjectOrganizationScheme
  boundary: {
    candidateOnly: true
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesCriticalPathFacts: false
  }
}

export type ConstructionOrganizationFactCoverage = {
  source: 'wizard_project_generation_fact_coverage'
  usesExistingWizardFactsOnly: true
  decisionFactKeys?: string[]
  contextFactKeys?: string[]
  consumedFactKeys: string[]
  sidecarFactKeys: string[]
  missingFactKeys: string[]
  completenessScore: number
  resourcePolicy: typeof CONSTRUCTION_ORGANIZATION_RESOURCE_POLICY
}

export type ConstructionOrganizationGeneratedRowProjection = {
  source: 'construction_organization_plan_option_generated_row_projection'
  optionId: string
  projectionBasis: 'generated_wbs_rows_mapped_to_virtual_plan_option_nodes'
  generatedScheduleSpanDays: number
  virtualProjectDurationDays: number
  spanDeltaDays: number
  dependencyAlignmentScore: number
  projectionConfidence: 'high' | 'medium' | 'low'
  mappedNodeCount: number
  generatedRowMatchCount: number
  unmappedNodeIds: string[]
  phaseCoverage: Array<{
    phase: ConstructionOrganizationVirtualNetworkNode['phase']
    virtualNodeIds: string[]
    generatedRowIds: string[]
    generatedRowCount: number
  }>
  candidateDependencyPreview?: {
    source: 'construction_organization_candidate_dependency_preview'
    previewBasis: 'virtual_dependency_edges_mapped_to_generated_wbs_row_carriers'
    materializationReadiness: {
      source: 'construction_organization_candidate_materialization_readiness'
      readiness: 'ready_for_manual_materialization_preview' | 'needs_generated_row_carrier' | 'evidence_only'
      reasons: string[]
      previewEdgeCount: number
      unresolvedEdgeCount: number
      writesTaskDependencies: false
      writesPlanDates: false
      writesCriticalPathFacts: false
    }
    previewEdges: Array<{
      fromVirtualNodeId: string
      toVirtualNodeId: string
      fromGeneratedRowIds: string[]
      toGeneratedRowIds: string[]
      dependencyType: ConstructionOrganizationVirtualNetworkDependency['dependencyType']
      lagDays: number
      intent: string
      materializationStatus: 'preview_only'
      writesTaskDependencies: false
    }>
    unresolvedEdges: Array<{
      fromVirtualNodeId: string
      toVirtualNodeId: string
      dependencyType: ConstructionOrganizationVirtualNetworkDependency['dependencyType']
      lagDays: number
      intent: string
      reason: 'missing_from_generated_row_carrier' | 'missing_to_generated_row_carrier'
    }>
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
  }
  candidateMaterializationEvaluation?: {
    source: 'construction_organization_candidate_materialization_evaluation'
    materializationBasis: 'preview_edges_checked_against_generated_wbs_row_dates'
    previewEdgeCount: number
    satisfiedEdgeCount: number
    violatedEdgeCount: number
    unresolvedEdgeCount: number
    materializedNetworkSpanDays: number
    materializationScore: number
    violationDetails: Array<{
      edgeId: string
      fromGeneratedRowId: string
      toGeneratedRowId: string
      fromVirtualNodeId: string
      toVirtualNodeId: string
      dependencyType: ConstructionOrganizationVirtualNetworkDependency['dependencyType']
      lagDays: number
      intent: string
      reason: 'fs_predecessor_finishes_after_successor_start' | 'ss_predecessor_starts_after_successor_start'
      fromWindow: {
        startDay: number | null
        finishDay: number | null
        plannedStartDate: string | null
        plannedEndDate: string | null
      }
      toWindow: {
        startDay: number | null
        finishDay: number | null
        plannedStartDate: string | null
        plannedEndDate: string | null
      }
      writesTaskDependencies: false
      writesPlanDates: false
    }>
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
  }
  materializationDecision?: {
    source: 'construction_organization_candidate_materialization_decision'
    decision: 'ready_for_manual_materialization' | 'needs_generated_row_carrier' | 'evidence_only' | 'blocked_by_violations'
    allowManualMaterialization: boolean
    reasons: string[]
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
  }
  materializationReviewPackage?: {
    source: 'construction_organization_candidate_materialization_review_package'
    packageBasis: 'manual_review_package_from_generated_row_preview_edges'
    optionId: string
    status: 'ready_for_manual_review' | 'needs_generated_row_carrier' | 'evidence_only' | 'blocked_by_violations'
    allowManualReview: boolean
    proposedDependencyEdgeCount: number
    blockedReasons: string[]
    proposedDependencyEdges: Array<{
      fromGeneratedRowId: string
      toGeneratedRowId: string
      dependencyType: ConstructionOrganizationVirtualNetworkDependency['dependencyType']
      lagDays: number
      intent: string
      fromVirtualNodeId: string
      toVirtualNodeId: string
      operation: 'propose_create_dependency'
      writesTaskDependencies: false
    }>
    conflictEvidence?: NonNullable<ConstructionOrganizationGeneratedRowProjection['candidateMaterializationEvaluation']>['violationDetails']
    reviewRequired: true
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
  }
  generatedRowReferenceDurationEvidence?: {
    source: 'generated_wbs_row_reference_duration_projection'
    durationBasis: 'generated_row_plan_dates_and_plan_reference_days'
    matchedReferenceRowCount: number
    totalPlanReferenceDays: number | null
    totalContextualReferenceDays: number | null
    totalRecommendedDurationDays: number | null
    phaseDurations: Array<{
      phase: ConstructionOrganizationVirtualNetworkNode['phase']
      generatedRowIds: string[]
      planReferenceDays: number | null
      contextualReferenceDays: number | null
      recommendedDurationDays: number | null
      plannedSpanDays: number | null
      durationEvidenceSource: 'generated_row_reference_duration_metadata' | 'generated_row_planned_window_fallback'
    }>
    writesReferenceDuration: false
    writesPlanDates: false
    writesSeed: false
  }
  generatedRowNetworkEvaluation?: {
    source: 'generated_wbs_row_candidate_network_cpm'
    networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges'
    projectedNetworkSpanDays: number
    previewEdgeCount: number
    processConstraintRoutingCandidateEdgeCount?: number
    processConstraintRoutingRuleCodes?: string[]
    unresolvedEdgeCount: number
    criticalGeneratedRowIds: string[]
    criticalRowSummaries?: Array<{
      generatedRowId: string
      title: string
      plannedStartDate: string
      plannedEndDate: string
      startDay: number
      finishDay: number
      durationDays: number
      totalFloatDays: number
    }>
    materializationStatus: 'fully_mapped_read_only' | 'partial_mapping_read_only' | 'no_mapped_edges'
    rowSchedule: Array<{
      generatedRowId: string
      startDay: number
      finishDay: number
      durationDays: number
      totalFloatDays: number
      isCritical: boolean
    }>
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
  }
  gapReasons: string[]
  writesTaskDependencies: false
  writesPlanDates: false
  writesCriticalPathFacts: false
}

export type ConstructionOrganizationProjectPolicyBasis = {
  source: 'project_construction_organization_policy_seed'
  policyId: string
  sourceVersion: string
  strategy: string
  variantCode: string
  selectionSignals: string[]
  schemeFamily: string
  primaryInterfaceSequence: string[]
  interfaceGateTags: string[]
  laneRole: string
  lanePrefix: string
  networkPolicy: {
    sharedWorksRelease: string
    primaryLaneScheduling: string
    interfaceGatePolicy: 'business_type_governed_gate_network'
  }
  confidence: 'high' | 'medium' | 'low'
  organizationNetwork: {
    stages: Array<{
      code: string
      label: string
      phase: ConstructionOrganizationVirtualNetworkNode['phase']
      durationDays: number
    }>
    dependencies: Array<{
      fromStageCode: string
      toStageCode: string
      dependencyType: ConstructionOrganizationVirtualNetworkDependency['dependencyType']
      lagDays: number
      intent: string
    }>
  }
  rationale: string
  resourcePolicy: typeof CONSTRUCTION_ORGANIZATION_RESOURCE_POLICY
}

export type ConstructionOrganizationPlanOptionProjectOrganizationScheme = {
  source: 'project_organization_policy_scheme_candidate'
  evaluationRole: 'business_type_scheme_family_for_e1_e3_e5_candidate_evaluation'
  policyId: string
  sourceVersion: string
  strategy: string
  variantCode: string
  selectionSignals: string[]
  schemeFamily: string
  primaryInterfaceSequence: string[]
  interfaceGateTags: string[]
  laneRole: string
  lanePrefix: string
  networkPolicy: ConstructionOrganizationProjectPolicyBasis['networkPolicy']
  confidence: ConstructionOrganizationProjectPolicyBasis['confidence']
  organizationNetwork: ConstructionOrganizationProjectPolicyBasis['organizationNetwork']
  rationale: string
  resourcePolicy: typeof CONSTRUCTION_ORGANIZATION_RESOURCE_POLICY
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
}

export type ConstructionOrganizationPlanOptionUseCaseEvaluation = {
  useCase: ConstructionOrganizationUseCase
  optionId: string
  optionScore: number
  rankBasis: string[]
  actionability: ConstructionOrganizationUseCaseRecommendation['actionability']
  currentSubstage?: string | null
  recoveryFactorHint: number
  e5RecoverableSpanDays: number
  factCoverage: ConstructionOrganizationFactCoverage
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
}

export type ConstructionOrganizationScenarioCandidate = {
  scenarioId: ConstructionOrganizationScenarioId
  category: 'foundation_sequence' | 'basement_tower_release' | 'outdoor_site_release'
  label: string
  feasibility: ConstructionOrganizationScenarioFeasibility
  score: number
  selectionReasons: string[]
  rejectionReasons: string[]
  virtualNetworkHints: {
    dependencyIntents: string[]
    releasePolicy: string
    evaluationRole: 'candidate_virtual_network_only'
  }
  evaluation: ConstructionOrganizationScenarioCandidateEvaluation
  virtualNetwork: ConstructionOrganizationVirtualNetwork
}

export type ConstructionOrganizationPlanOption = {
  optionId: string
  source: 'construction_organization_plan_option'
  selectedScenarioIds: ConstructionOrganizationScenarioId[]
  projectOrganizationScheme: ConstructionOrganizationPlanOptionProjectOrganizationScheme
  combinedScore: number
  confidence: 'high' | 'medium' | 'low'
  selectionReasons: string[]
  excludedScenarioIds: ConstructionOrganizationScenarioId[]
  excludedReasons: Array<{
    scenarioId: ConstructionOrganizationScenarioId
    reasons: string[]
  }>
  combinedVirtualNetwork: ConstructionOrganizationVirtualNetwork
  evaluation: {
    evaluationRole: 'combined_plan_option_score_for_e1_e3_e5'
    e1DurationBasis: 'virtual_work_package_duration_proxy_pending_generated_row_projection'
    e3NetworkBasis: 'combined_virtual_dependency_network_not_persisted'
    e5AccelerationBasis: 'plan_option_recovery_factor_hint'
    networkEvaluation: ConstructionOrganizationPlanOptionNetworkEvaluation
    engineEvaluationSummary: ConstructionOrganizationPlanOptionEngineEvaluationSummary
    generatedRowProjection?: ConstructionOrganizationGeneratedRowProjection | null
    useCaseEvaluations?: {
      newProjectPlanning: ConstructionOrganizationPlanOptionUseCaseEvaluation
      startingLineOnboarding: ConstructionOrganizationPlanOptionUseCaseEvaluation
      accelerationRecovery: ConstructionOrganizationPlanOptionUseCaseEvaluation
    }
    recoveryFactorHint: number
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
  }
}

export type ConstructionOrganizationUseCase =
  | 'new_project_planning'
  | 'starting_line_onboarding'
  | 'acceleration_recovery'

export type ConstructionOrganizationUseCaseRecommendation = {
  useCase: ConstructionOrganizationUseCase
  optionId: string
  selectedScenarioIds: ConstructionOrganizationScenarioId[]
  recommendationBasis: string[]
  confidence: 'high' | 'medium' | 'low'
  actionability: 'actionable_candidate' | 'evidence_only' | 'not_actionable_after_current_phase'
  currentSubstage?: string | null
  recoveryFactorHint: number
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
}

export type ConstructionOrganizationPlanNetworkDraftRecommendationSummary = {
  source: 'construction_organization_plan_network_draft_recommendation'
  useCase: ConstructionOrganizationUseCase
  optionId: string
  selectedScenarioIds: ConstructionOrganizationScenarioId[]
  readiness: string
  evaluationStatus: 'evaluation_ready' | 'partial_evidence' | 'missing_evaluation_evidence'
  materializationDecision: string | null
  proposedDependencyEdgeCount: number
  recommendationBasis: string[]
  factCoverage: ConstructionOrganizationFactCoverage | null
  e1: {
    matchedReferenceRowCount: number
    totalPlanReferenceDays: number | null
    totalContextualReferenceDays: number | null
    totalRecommendedDurationDays: number | null
    writesReferenceDuration: false
    writesPlanDates: false
    writesSeed: false
  } | null
  e3: {
    projectedNetworkSpanDays: number | null
    previewEdgeCount: number
    unresolvedEdgeCount: number
    criticalGeneratedRowIds: string[]
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
  } | null
  e5: {
    optionScore: number
    recoveryFactorHint: number
    e5RecoverableSpanDays: number
    actionability: ConstructionOrganizationUseCaseRecommendation['actionability']
    writesAccelerationDraft: false
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
  } | null
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
  }
}

export type ConstructionOrganizationPlanOptionComparisonUseCaseKey =
  | 'newProjectPlanning'
  | 'startingLineOnboarding'
  | 'accelerationRecovery'

export type ConstructionOrganizationPlanOptionNextGovernanceAction =
  | 'generated_row_projection_required'
  | 'manual_review_handoff'
  | 'blocked'

export type ConstructionOrganizationPlanOptionSystemRecommendationBasis = {
  source: 'construction_organization_plan_option_system_recommendation_basis'
  recommendationRole: 'read_only_candidate_ranking_from_e1_e3_e5_and_generated_row_projection'
  recommendedForUseCases: ConstructionOrganizationPlanOptionComparisonUseCaseKey[]
  rankingSignals: string[]
  e1: {
    selectedWorkPackageCount: number
    hasGeneratedRowReferenceEvidence: boolean
    matchedReferenceRowCount: number
    totalRecommendedDurationDays: number | null
    writesReferenceDuration: false
  }
  e3: {
    projectDurationDays: number
    previewEdgeCount: number
    unresolvedEdgeCount: number
    criticalNodeCount: number
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
  }
  e5: {
    recoveryFactorHint: number
    e5RecoverableSpanDays: number
    writesAccelerationDraft: false
  }
  materialization: {
    decision: string
    allowManualMaterialization: boolean
    reasons: string[]
  }
  boundaryPolicy: {
    candidateOnly: true
    readOnlyRecommendation: true
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
  }
}

export type ConstructionOrganizationPlanOptionComparisonItem = {
  source: 'construction_organization_plan_option_comparison_item'
  optionId: string
  selectedScenarioIds: ConstructionOrganizationScenarioId[]
  combinedScore: number
  confidence: ConstructionOrganizationPlanOption['confidence']
  isRecommendedFor: ConstructionOrganizationPlanOptionComparisonUseCaseKey[]
  nextGovernanceAction: ConstructionOrganizationPlanOptionNextGovernanceAction
  nextGovernanceReasons: string[]
  systemRecommendationBasis: ConstructionOrganizationPlanOptionSystemRecommendationBasis
  useCaseScores: Record<ConstructionOrganizationPlanOptionComparisonUseCaseKey, {
    optionScore: number
    actionability: ConstructionOrganizationUseCaseRecommendation['actionability']
    e5RecoverableSpanDays: number
    recoveryFactorHint: number
    rankBasis: string[]
  } | null>
  e1: {
    selectedWorkPackageCount: number
    selectedScenarioIds: ConstructionOrganizationScenarioId[]
    writesReferenceDuration: false
  }
  e3: {
    projectDurationDays: number
    criticalNodeCount: number
    edgeCount: number
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
  }
  e5: {
    recoveryFactorHint: number
    e5RecoverableSpanDays: number
    writesAccelerationDraft: false
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
  }
  boundaryPolicy: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
  }
}

export type ConstructionOrganizationPlanOptionComparisonPackage = {
  source: 'construction_organization_plan_option_comparison_package'
  totalOptionCount: number
  recommendedOptionIdsByUseCase: Record<ConstructionOrganizationPlanOptionComparisonUseCaseKey, string | null>
  canAutoMaterializeSelectedOption: false
  comparisonBasis: string[]
  options: ConstructionOrganizationPlanOptionComparisonItem[]
  boundaryPolicy: string[]
}

export type ConstructionOrganizationUseCaseDecisionReport = {
  source: 'construction_organization_use_case_decision_report'
  useCase: ConstructionOrganizationUseCase
  optionId: string
  selectedScenarioIds: ConstructionOrganizationScenarioId[]
  actionability: ConstructionOrganizationUseCaseRecommendation['actionability']
  confidence: ConstructionOrganizationUseCaseRecommendation['confidence']
  decisionBasis: string[]
  optionScore: number | null
  virtualProjectDurationDays: number
  e5RecoverableSpanDays: number
  recoveryFactorHint: number
  nextGovernanceAction: ConstructionOrganizationPlanOptionNextGovernanceAction
  nextGovernanceReasons: string[]
  excludedAlternatives: Array<{
    scenarioId: ConstructionOrganizationScenarioId
    reasons: string[]
  }>
  factCoverage: ConstructionOrganizationFactCoverage | null
  boundaryPolicy: {
    recommendedBySystem: true
    candidateOnly: true
    resourcesAreSidecarSignals: true
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
  }
}

export type ConstructionOrganizationProductCloseoutReadinessFromDecisionReport = {
  source: 'construction_organization_product_closeout_readiness_from_decision_report'
  status: 'candidate_recommendation_only_runtime_closeout_required'
  canDeclareConstructionOrganizationProductOutcomeCloseout: false
  requiredCloseoutEvidence: string[]
  missingBeforeProductCloseout: string[]
  nextEvidenceActions: string[]
  boundaryPolicy: {
    readOnlyCandidateReport: true
    productCloseoutRequiresRuntimeMatrix: true
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
  }
}

export type ConstructionOrganizationDecisionReport = {
  source: 'construction_organization_decision_report'
  reportRole: 'product_best_scheme_read_model'
  selectedByUseCase: Record<ConstructionOrganizationPlanOptionComparisonUseCaseKey, ConstructionOrganizationUseCaseDecisionReport>
  optionCount: number
  candidateCount: number
  recommendedPlanOptionId: string
  recommendedScenarioIds: ConstructionOrganizationScenarioId[]
  projectOrganizationScheme: ConstructionOrganizationPlanOptionProjectOrganizationScheme
  decisionSignals: {
    usesExistingWizardFactsOnly: true
    decisionFactKeys: string[]
    contextFactKeys: string[]
    sidecarFactKeys: string[]
    resourcePolicy: typeof CONSTRUCTION_ORGANIZATION_RESOURCE_POLICY
  }
  engineEvidence: {
    e1: 'virtual_work_package_duration_proxy_pending_generated_row_projection'
    e3: 'combined_virtual_dependency_network_cpm_evaluated_not_persisted'
    e5: 'bounded_recovery_factor_hint'
  }
  productCloseoutReadiness: ConstructionOrganizationProductCloseoutReadinessFromDecisionReport
  boundaryPolicy: {
    candidateOnly: true
    readOnlyBestScheme: true
    runtimeMaterializationRequiresGovernance: true
    resourcesAreSidecarSignals: true
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
  }
}

export type ConstructionOrganizationScenarioSelection = {
  source: 'construction_organization_scenario_selector'
  sourceVersion: typeof CONSTRUCTION_ORGANIZATION_SCENARIO_SELECTOR_VERSION
  recommendedScenarioIds: ConstructionOrganizationScenarioId[]
  recommendedPlanOption: ConstructionOrganizationPlanOption
  planOptions: ConstructionOrganizationPlanOption[]
  planOptionComparisonPackage: ConstructionOrganizationPlanOptionComparisonPackage
  organizationDecisionReport?: ConstructionOrganizationDecisionReport
  scenarioRecommendations: {
    newProjectPlanning: ConstructionOrganizationUseCaseRecommendation
    startingLineOnboarding: ConstructionOrganizationUseCaseRecommendation
    accelerationRecovery: ConstructionOrganizationUseCaseRecommendation
  }
  planNetworkDraftRecommendations?: {
    newProjectPlanning: ConstructionOrganizationPlanNetworkDraftRecommendationSummary | null
    startingLineOnboarding: ConstructionOrganizationPlanNetworkDraftRecommendationSummary | null
    accelerationRecovery: ConstructionOrganizationPlanNetworkDraftRecommendationSummary | null
  }
  confidence: 'high' | 'medium' | 'low'
  frontendInputRequired: false
  boundaryPolicy: {
    directSeedMutation: false
    resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver'
    virtualNetworkPolicy: 'scenario_candidates_are_evaluated_as_virtual_networks_before_any_write'
  }
  candidates: ConstructionOrganizationScenarioCandidate[]
  factBasis: Record<string, unknown>
}

export type ConstructionOrganizationScenarioSelectorInput = {
  businessType?: string | null
  businessSubtype?: string | null
  projectTypeCode?: string | null
  structureTypeCode?: string | null
  methodVariantCodes?: unknown
  prefabSystemCodes?: unknown
  elementVariantCodes?: unknown
  externalInterfaceCodes?: unknown
  hardConstraintCodes?: unknown
  projectFeatures?: unknown
  detailLevel?: string | null
  buildingPatternCodes?: unknown
  functionalUsageCodes?: unknown
  floorUsageCodes?: unknown
  functionalCategoryCodes?: unknown
  specialRoomTypeCodes?: unknown
  physicalZoneTypeCodes?: unknown
  planScopeCaliber?: string | null
  deliveryStandard?: string | null
  terminalEvent?: string | null
  buildingCount?: number | null
  totalAreaM2?: number | null
  aboveGroundAreaM2?: number | null
  basementLevelCount?: number | null
  basementAreaM2?: number | null
  siteAreaM2?: number | null
  foundationDepthM?: number | null
  standardFloorCount?: number | null
  highestBuildingFloorCount?: number | null
  prefabRate?: number | null
  maxSpanM?: number | null
  supportHeightM?: number | null
  hasCivilDefense?: boolean | null
  climateSignals?: unknown
  weatherImpactBands?: unknown
  locationFacts?: unknown
  scopeOrganizationFacts?: unknown
  towerCraneCount?: number | null
  constructionHoistCount?: number | null
  onboardingMode?: string | null
  onboardingSubstage?: string | null
  onboardingPassedMilestones?: unknown
  onboardingPhaseProgress?: unknown
}

export type ConstructionOrganizationSelectorProjectFactOverrides = Partial<ConstructionOrganizationScenarioSelectorInput>

export const CONSTRUCTION_ORGANIZATION_SCENARIO_SELECTOR_VERSION = 'v1.4.22-construction-organization-scenario-20260620'
export const CONSTRUCTION_ORGANIZATION_RESOURCE_POLICY = 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver' as const

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function readOptionalNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readCodeArray(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : [value]
  return [...new Set(rawValues
    .flatMap((item) => typeof item === 'string' ? item.split(/[,\s]+/) : [item])
    .map((item) => normalizeId(item))
    .filter(Boolean))]
}

function expandFoundationFormMethodCodes(projectFeatures: Record<string, unknown>) {
  const foundationForms = readCodeArray(projectFeatures.foundationFormCodes ?? projectFeatures.foundation_form_codes)
  const expanded = new Set<string>()
  for (const code of foundationForms) {
    expanded.add(code)
    if (['bored_pile', 'precast_pile', 'cfg_pile'].includes(code)) expanded.add('pile_foundation')
    if (['diaphragm_wall', 'smw_pile', 'trd_wall', 'soil_nailing', 'anchor_support'].includes(code)) expanded.add('vertical_retaining_support')
    if (['anchor_support'].includes(code)) expanded.add('anchor')
    if (['dewatering_well'].includes(code)) expanded.add('foundation_dewatering')
  }
  return [...expanded]
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = normalizeId(value)
  if (!text) return null
  if (['true', '1', 'yes', 'y'].includes(text)) return true
  if (['false', '0', 'no', 'n'].includes(text)) return false
  return null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function mergeDefinedSelectorOverrides(
  base: ConstructionOrganizationScenarioSelectorInput,
  overrides: ConstructionOrganizationSelectorProjectFactOverrides = {},
) {
  const merged: ConstructionOrganizationScenarioSelectorInput = { ...base }
  for (const [key, value] of Object.entries(overrides) as Array<[keyof ConstructionOrganizationScenarioSelectorInput, unknown]>) {
    if (value === undefined) continue
    ;(merged as Record<string, unknown>)[key] = value
  }
  return merged
}

function readRawProjectGenerationFactsInput(sourceInput: unknown) {
  const source = readRecord(sourceInput)
  const nested = readRecord(source.projectGenerationFacts ?? source.project_generation_facts)
  return Object.keys(nested).length > 0
    ? { ...nested, ...source }
    : source
}

function readProjectTypeCodeFromRawFacts(rawFacts: Record<string, unknown>, normalizedFacts: Record<string, unknown>) {
  const projectFeatures = readRecord(normalizedFacts.projectFeatures)
  return normalizeText(
    rawFacts.projectTypeCode
      ?? rawFacts.project_type_code
      ?? projectFeatures.projectTypeCode
      ?? projectFeatures.project_type_code
      ?? normalizedFacts.businessType,
  ) || null
}

export function buildConstructionOrganizationSelectorInputFromProjectFacts(
  factsInput: unknown,
  overrides: ConstructionOrganizationSelectorProjectFactOverrides = {},
): ConstructionOrganizationScenarioSelectorInput {
  const rawFacts = readRawProjectGenerationFactsInput(factsInput)
  const snapshot = buildProjectGenerationFactsSnapshot(rawFacts) as Record<string, unknown>
  const projectFeatureFallback = buildProjectGenerationFactsSnapshot(readRecord(snapshot.projectFeatures)) as Record<string, unknown>
  const facts = {
    ...projectFeatureFallback,
    ...snapshot,
  }
  const base: ConstructionOrganizationScenarioSelectorInput = {
    businessType: normalizeText(facts.businessType) || null,
    businessSubtype: normalizeText(facts.businessSubtype) || null,
    projectTypeCode: readProjectTypeCodeFromRawFacts(rawFacts, facts),
    structureTypeCode: normalizeText(facts.structureTypeCode) || null,
    planScopeCaliber: normalizeText(facts.planScopeCaliber) || null,
    deliveryStandard: normalizeText(facts.deliveryStandard) || null,
    terminalEvent: normalizeText(facts.terminalEvent) || null,
    methodVariantCodes: facts.methodVariantCodes,
    prefabSystemCodes: facts.prefabSystemCodes,
    elementVariantCodes: facts.elementVariantCodes,
    externalInterfaceCodes: facts.externalInterfaceCodes,
    hardConstraintCodes: facts.hardConstraintCodes,
    projectFeatures: facts.projectFeatures,
    detailLevel: normalizeText(facts.detailLevel) || null,
    buildingPatternCodes: facts.buildingPatternCodes,
    functionalUsageCodes: facts.functionalUsageCodes,
    floorUsageCodes: facts.floorUsageCodes,
    functionalCategoryCodes: facts.functionalCategoryCodes,
    specialRoomTypeCodes: facts.specialRoomTypeCodes,
    physicalZoneTypeCodes: facts.physicalZoneTypeCodes,
    buildingCount: readOptionalNumber(facts.buildingCount),
    totalAreaM2: readOptionalNumber(facts.totalAreaM2),
    aboveGroundAreaM2: readOptionalNumber(facts.aboveGroundAreaM2),
    basementLevelCount: readOptionalNumber(facts.basementLevelCount),
    basementAreaM2: readOptionalNumber(facts.basementAreaM2),
    siteAreaM2: readOptionalNumber(facts.siteAreaM2),
    foundationDepthM: readOptionalNumber(facts.foundationDepthM),
    standardFloorCount: readOptionalNumber(facts.standardFloorCount),
    highestBuildingFloorCount: readOptionalNumber(facts.highestBuildingFloorCount),
    prefabRate: readOptionalNumber(facts.prefabRate),
    maxSpanM: readOptionalNumber(facts.maxSpanM),
    supportHeightM: readOptionalNumber(facts.supportHeightM),
    hasCivilDefense: readBoolean(facts.hasCivilDefense),
    climateSignals: facts.climateSignals,
    weatherImpactBands: facts.weatherImpactBands,
    locationFacts: facts.locationFacts,
    scopeOrganizationFacts: facts.scopeOrganizationFacts,
    towerCraneCount: readOptionalNumber(facts.towerCraneCount),
    constructionHoistCount: readOptionalNumber(facts.constructionHoistCount),
    onboardingMode: normalizeText(facts.onboardingMode) || null,
    onboardingSubstage: normalizeText(facts.onboardingSubstage) || null,
    onboardingPassedMilestones: facts.onboardingPassedMilestones,
    onboardingPhaseProgress: facts.onboardingPhaseProgress,
  }
  return mergeDefinedSelectorOverrides(base, overrides)
}

function readCount(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function hasAny(codes: string[], patterns: string[]) {
  return codes.some((code) => patterns.some((pattern) => code.includes(pattern)))
}

function hasStartingLinePassedFoundationOrBasementMilestone(passedMilestones: string[]) {
  return passedMilestones.some((milestone) => (
    milestone.includes('foundation_acceptance')
    || milestone.includes('pile_foundation_acceptance')
    || milestone.includes('basement_structure_acceptance')
    || milestone.includes('basement_acceptance')
    || milestone.includes('underground_structure_acceptance')
  ))
}

function hasStartingLineFoundationOrBasementProgressLock(phaseProgress: Record<string, unknown>) {
  const entries = Object.entries(phaseProgress)
  return entries.some(([key, value]) => {
    const normalizedKey = normalizeId(key)
    if (!normalizedKey.includes('foundation') && !normalizedKey.includes('basement') && !normalizedKey.includes('underground')) {
      return false
    }
    if (typeof value === 'number') return value >= 100
    const record = readRecord(value)
    const progress = Number(record.progress ?? record.progressPercent ?? record.percent ?? record.completionPercent)
    const status = normalizeId(record.status ?? record.phaseStatus ?? record.state)
    return (Number.isFinite(progress) && progress >= 100)
      || ['accepted', 'completed', 'complete', 'done', 'finished'].some((token) => status.includes(token))
  })
}

function riskLevelFromScore(score: number, rejected: boolean): ConstructionOrganizationScenarioCandidateEvaluation['scheduleRiskLevel'] {
  if (rejected || score < 50) return 'high'
  if (score < 75) return 'medium'
  return 'low'
}

function recoveryFactorHintForScenario(
  scenarioId: ConstructionOrganizationScenarioId,
  feasibility: ConstructionOrganizationScenarioFeasibility,
  score: number,
) {
  if (feasibility === 'rejected') return 1
  if (scenarioId === 'tower_lane_early_release_after_core_basement') {
    return score >= 75 ? 1.08 : 1.06
  }
  if (scenarioId === 'outdoor_site_early_release_after_basement_backfill') {
    return score >= 75 ? 1.05 : 1.03
  }
  if (scenarioId === 'shared_basement_first_then_tower') return 1
  if (scenarioId === 'excavation_before_pile') return score >= 70 ? 1.02 : 1
  return 1
}

function readVirtualNetworkSpanAdvantage(candidateSpan: number, alternativeSpan: number) {
  if (!Number.isFinite(candidateSpan) || !Number.isFinite(alternativeSpan) || candidateSpan <= 0 || alternativeSpan <= 0) return 0
  return clamp(((alternativeSpan - candidateSpan) / alternativeSpan) * 70, -28, 28)
}

function buildProjectPolicyBasis(input: {
  businessType?: string | null
  projectTypeCode?: string | null
  selectionContext?: ProjectConstructionOrganizationPolicySelectionContext
}): ConstructionOrganizationProjectPolicyBasis {
  const policy = resolveProjectConstructionOrganizationPolicy(
    input.businessType,
    input.projectTypeCode,
    input.selectionContext,
  )
  return {
    source: policy.source,
    policyId: policy.policyId,
    sourceVersion: policy.sourceVersion,
    strategy: policy.strategy,
    variantCode: policy.variantCode,
    selectionSignals: policy.selectionSignals,
    schemeFamily: policy.schemeFamily,
    primaryInterfaceSequence: policy.primaryInterfaceSequence,
    interfaceGateTags: policy.interfaceGateTags,
    laneRole: policy.laneRole,
    lanePrefix: policy.lanePrefix,
    networkPolicy: policy.networkPolicy,
    confidence: policy.confidence,
    organizationNetwork: policy.organizationNetwork,
    rationale: policy.rationale,
    resourcePolicy: policy.governance.resourcePolicy,
  }
}

function buildPolicyRecommendationBasis(policy: ConstructionOrganizationProjectPolicyBasis) {
  return [
    'business_type_project_organization_policy',
    policy.schemeFamily ? 'policy_scheme_family_selected' : null,
    policy.primaryInterfaceSequence.length > 0 ? 'primary_interface_sequence_applied' : null,
    policy.interfaceGateTags.length > 0 ? 'business_type_interface_gate_tags_applied' : null,
  ].filter((item): item is string => Boolean(item))
}

function buildProjectOrganizationScheme(
  policy: ConstructionOrganizationProjectPolicyBasis,
): ConstructionOrganizationPlanOptionProjectOrganizationScheme {
  return {
    source: 'project_organization_policy_scheme_candidate',
    evaluationRole: 'business_type_scheme_family_for_e1_e3_e5_candidate_evaluation',
    policyId: policy.policyId,
    sourceVersion: policy.sourceVersion,
    strategy: policy.strategy,
    variantCode: policy.variantCode,
    selectionSignals: policy.selectionSignals,
    schemeFamily: policy.schemeFamily,
    primaryInterfaceSequence: policy.primaryInterfaceSequence,
    interfaceGateTags: policy.interfaceGateTags,
    laneRole: policy.laneRole,
    lanePrefix: policy.lanePrefix,
    networkPolicy: policy.networkPolicy,
    confidence: policy.confidence,
    organizationNetwork: policy.organizationNetwork,
    rationale: policy.rationale,
    resourcePolicy: policy.resourcePolicy,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
  }
}

function buildPlanOptionNetwork(
  candidates: ConstructionOrganizationScenarioCandidate[],
  projectOrganizationScheme: ConstructionOrganizationPlanOptionProjectOrganizationScheme,
): ConstructionOrganizationVirtualNetwork {
  const nodes: ConstructionOrganizationVirtualNetworkNode[] = []
  const dependencies: ConstructionOrganizationVirtualNetworkDependency[] = []
  const phaseFinishNodes: Array<{ category: ConstructionOrganizationScenarioCandidate['category'], nodeId: string }> = []
  const phaseNodes: Array<{
    category: ConstructionOrganizationScenarioCandidate['category']
    phase: ConstructionOrganizationVirtualNetworkNode['phase']
    nodeId: string
  }> = []
  let runningOffset = 0

  for (const candidate of candidates) {
    const prefix = candidate.category === 'foundation_sequence'
      ? 'foundation'
      : candidate.category === 'basement_tower_release'
        ? 'release'
        : 'outdoor'
    const nodeIdMap = new Map(candidate.virtualNetwork.nodes.map((node) => [node.id, `${prefix}_${node.id}`]))
    for (const node of candidate.virtualNetwork.nodes) {
      const mappedNodeId = nodeIdMap.get(node.id) ?? `${prefix}_${node.id}`
      nodes.push({
        ...node,
        id: mappedNodeId,
        durationDays: Math.max(1, Math.round(node.durationDays)),
      })
      phaseNodes.push({
        category: candidate.category,
        phase: node.phase,
        nodeId: mappedNodeId,
      })
    }
    for (const dependency of candidate.virtualNetwork.dependencies) {
      dependencies.push({
        ...dependency,
        fromNodeId: nodeIdMap.get(dependency.fromNodeId) ?? `${prefix}_${dependency.fromNodeId}`,
        toNodeId: nodeIdMap.get(dependency.toNodeId) ?? `${prefix}_${dependency.toNodeId}`,
      })
    }
    const semanticTail = candidate.category === 'foundation_sequence'
      ? candidate.virtualNetwork.nodes.find((node) => node.phase === 'earthwork')?.id
      : candidate.virtualNetwork.criticalNodeIds.at(-1)
    if (semanticTail) {
      phaseFinishNodes.push({
        category: candidate.category,
        nodeId: nodeIdMap.get(semanticTail) ?? `${prefix}_${semanticTail}`,
      })
    }
    runningOffset += candidate.virtualNetwork.totalSpanDays
  }

  const foundationTail = phaseFinishNodes.find((item) => item.category === 'foundation_sequence')?.nodeId
  const releaseHead = nodes.find((node) => node.id.startsWith('release_'))?.id
  const releaseTail = phaseFinishNodes.find((item) => item.category === 'basement_tower_release')?.nodeId
  const releaseBasementNode = [...phaseNodes].reverse()
    .find((item) => item.category === 'basement_tower_release' && item.phase === 'basement')?.nodeId
  const outdoorStartNode = phaseNodes
    .find((item) => item.category === 'outdoor_site_release' && item.phase === 'outdoor')?.nodeId
    ?? nodes.find((node) => node.id.startsWith('outdoor_'))?.id
  if (foundationTail && releaseHead) {
    dependencies.push({
      fromNodeId: foundationTail,
      toNodeId: releaseHead,
      dependencyType: 'FS',
      lagDays: 0,
      intent: 'selected_foundation_sequence_before_selected_basement_tower_release',
    })
  }
  if ((releaseBasementNode || releaseTail) && outdoorStartNode) {
    dependencies.push({
      fromNodeId: releaseBasementNode ?? releaseTail,
      toNodeId: outdoorStartNode,
      dependencyType: 'SS',
      lagDays: 0,
      intent: 'selected_basement_tower_release_before_selected_outdoor_site_release',
    })
  }

  const variantSegment = normalizeId(projectOrganizationScheme.variantCode).replace(/[^a-z0-9_]+/g, '_')
  const policyNodeIdByStageCode = new Map<string, string>()
  for (const stage of projectOrganizationScheme.organizationNetwork.stages) {
    const stageSegment = normalizeId(stage.code).replace(/[^a-z0-9_]+/g, '_')
    const nodeId = `policy_${variantSegment}_${stageSegment}`
    policyNodeIdByStageCode.set(stage.code, nodeId)
    nodes.push({
      id: nodeId,
      label: stage.label,
      phase: stage.phase,
      durationDays: Math.max(1, Math.round(stage.durationDays)),
    })
  }
  for (const dependency of projectOrganizationScheme.organizationNetwork.dependencies) {
    const fromNodeId = policyNodeIdByStageCode.get(dependency.fromStageCode)
    const toNodeId = policyNodeIdByStageCode.get(dependency.toStageCode)
    if (!fromNodeId || !toNodeId) continue
    dependencies.push({
      fromNodeId,
      toNodeId,
      dependencyType: dependency.dependencyType,
      lagDays: dependency.lagDays,
      intent: dependency.intent.startsWith('policy_interface:')
        ? dependency.intent
        : `policy_interface:${dependency.intent}`,
    })
  }

  const firstPolicyStage = projectOrganizationScheme.organizationNetwork.stages[0]
  const lastPolicyStage = projectOrganizationScheme.organizationNetwork.stages.at(-1)
  const firstPolicyNodeId = firstPolicyStage ? policyNodeIdByStageCode.get(firstPolicyStage.code) : null
  const lastPolicyNodeId = lastPolicyStage ? policyNodeIdByStageCode.get(lastPolicyStage.code) : null
  if (foundationTail && firstPolicyNodeId) {
    dependencies.push({
      fromNodeId: foundationTail,
      toNodeId: firstPolicyNodeId,
      dependencyType: firstPolicyStage?.phase === 'foundation' ? 'SS' : 'FS',
      lagDays: 0,
      intent: `policy_interface:foundation_to_${projectOrganizationScheme.variantCode}`,
    })
  }
  if (releaseHead && firstPolicyNodeId) {
    dependencies.push({
      fromNodeId: releaseHead,
      toNodeId: firstPolicyNodeId,
      dependencyType: 'SS',
      lagDays: 0,
      intent: `policy_interface:primary_release_to_${projectOrganizationScheme.variantCode}`,
    })
  }
  const outdoorTail = phaseFinishNodes.find((item) => item.category === 'outdoor_site_release')?.nodeId
  if (outdoorTail && lastPolicyNodeId && lastPolicyStage?.phase === 'handoff') {
    dependencies.push({
      fromNodeId: outdoorTail,
      toNodeId: lastPolicyNodeId,
      dependencyType: 'FS',
      lagDays: 0,
      intent: `policy_interface:outdoor_release_to_${projectOrganizationScheme.variantCode}_handoff`,
    })
  }

  const policyDurationDays = projectOrganizationScheme.organizationNetwork.stages
    .reduce((sum, stage) => sum + Math.max(1, Math.round(stage.durationDays)), 0)

  return {
    source: 'construction_organization_virtual_network',
    nodes,
    dependencies,
    totalSpanDays: Math.max(1, runningOffset + policyDurationDays),
    criticalNodeIds: [
      ...phaseFinishNodes.map((item) => item.nodeId),
      ...(lastPolicyNodeId ? [lastPolicyNodeId] : []),
    ],
    writesTaskDependencies: false,
    writesPlanDates: false,
  }
}

function evaluateVirtualNetworkForPlanOption(
  network: ConstructionOrganizationVirtualNetwork,
  recoverableSpanReferenceDays: number | null = null,
): ConstructionOrganizationPlanOptionNetworkEvaluation {
  const nodes = network.nodes.map((node) => ({
    ...node,
    durationDays: Math.max(1, Math.round(node.durationDays)),
  }))
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const earliestStart = new Map(nodes.map((node) => [node.id, 0]))

  for (let pass = 0; pass < Math.max(1, nodes.length); pass += 1) {
    let changed = false
    for (const dependency of network.dependencies) {
      const from = nodeById.get(dependency.fromNodeId)
      const to = nodeById.get(dependency.toNodeId)
      if (!from || !to) continue
      const fromStart = earliestStart.get(from.id) ?? 0
      const requiredStart = dependency.dependencyType === 'SS'
        ? fromStart + dependency.lagDays
        : fromStart + from.durationDays + dependency.lagDays
      if (requiredStart > (earliestStart.get(to.id) ?? 0)) {
        earliestStart.set(to.id, requiredStart)
        changed = true
      }
    }
    if (!changed) break
  }

  const projectDurationDays = Math.max(
    1,
    ...nodes.map((node) => (earliestStart.get(node.id) ?? 0) + node.durationDays),
  )
  const latestStart = new Map(nodes.map((node) => [node.id, projectDurationDays - node.durationDays]))

  for (let pass = 0; pass < Math.max(1, nodes.length); pass += 1) {
    let changed = false
    for (const dependency of [...network.dependencies].reverse()) {
      const from = nodeById.get(dependency.fromNodeId)
      const to = nodeById.get(dependency.toNodeId)
      if (!from || !to) continue
      const toLatestStart = latestStart.get(to.id) ?? 0
      const requiredLatestStart = dependency.dependencyType === 'SS'
        ? toLatestStart - dependency.lagDays
        : toLatestStart - from.durationDays - dependency.lagDays
      if (requiredLatestStart < (latestStart.get(from.id) ?? projectDurationDays)) {
        latestStart.set(from.id, requiredLatestStart)
        changed = true
      }
    }
    if (!changed) break
  }

  const networkSchedule = nodes.map((node) => {
    const startDay = Math.max(0, Math.round(earliestStart.get(node.id) ?? 0))
    const finishDay = startDay + node.durationDays
    const totalFloatDays = Math.max(0, Math.round((latestStart.get(node.id) ?? startDay) - startDay))
    return {
      nodeId: node.id,
      startDay,
      finishDay,
      durationDays: node.durationDays,
      totalFloatDays,
      isCritical: totalFloatDays <= 0,
    }
  }).sort((a, b) => a.startDay - b.startDay || a.finishDay - b.finishDay || a.nodeId.localeCompare(b.nodeId))
  const criticalNodeIds = networkSchedule
    .filter((node) => node.isCritical)
    .map((node) => node.nodeId)
  const referenceDays = recoverableSpanReferenceDays ?? projectDurationDays

  return {
    evaluationRole: 'virtual_plan_option_network_cpm_for_e3_e5',
    e3NetworkBasis: 'combined_virtual_dependency_network_cpm_evaluated_not_persisted',
    projectDurationDays,
    networkSchedule,
    criticalNodeIds,
    edgeCount: network.dependencies.length,
    e5RecoverableSpanDays: Math.max(0, Math.round(referenceDays - projectDurationDays)),
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
  }
}

function buildPlanOption(params: {
  selectedCandidates: ConstructionOrganizationScenarioCandidate[]
  allCandidates: ConstructionOrganizationScenarioCandidate[]
  confidence: ConstructionOrganizationPlanOption['confidence']
  projectOrganizationScheme: ConstructionOrganizationPlanOptionProjectOrganizationScheme
}): ConstructionOrganizationPlanOption {
  const selectedScenarioIds = params.selectedCandidates.map((candidate) => candidate.scenarioId)
  const combinedVirtualNetwork = buildPlanOptionNetwork(
    params.selectedCandidates,
    params.projectOrganizationScheme,
  )
  const excludedCandidates = params.allCandidates.filter((candidate) => !selectedScenarioIds.includes(candidate.scenarioId))
  const scores = params.selectedCandidates.map((candidate) => candidate.score)
  const recoveryFactors = params.selectedCandidates
    .map((candidate) => candidate.evaluation.recoveryFactorHint)
    .filter((factor) => Number.isFinite(factor) && factor > 0)
  const networkEvaluation = evaluateVirtualNetworkForPlanOption(combinedVirtualNetwork)
  return {
    optionId: `construction_org_option:${selectedScenarioIds.join('+') || 'none'}`,
    source: 'construction_organization_plan_option',
    selectedScenarioIds,
    projectOrganizationScheme: params.projectOrganizationScheme,
    combinedScore: Math.round((scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length)) * 100) / 100,
    confidence: params.confidence,
    selectionReasons: params.selectedCandidates.flatMap((candidate) => candidate.selectionReasons),
    excludedScenarioIds: excludedCandidates.map((candidate) => candidate.scenarioId),
    excludedReasons: excludedCandidates.map((candidate) => ({
      scenarioId: candidate.scenarioId,
      reasons: candidate.rejectionReasons.length > 0
        ? candidate.rejectionReasons
        : [`not_selected_for_${candidate.category}`],
    })),
    combinedVirtualNetwork,
    evaluation: {
      evaluationRole: 'combined_plan_option_score_for_e1_e3_e5',
      e1DurationBasis: 'virtual_work_package_duration_proxy_pending_generated_row_projection',
      e3NetworkBasis: 'combined_virtual_dependency_network_not_persisted',
      e5AccelerationBasis: 'plan_option_recovery_factor_hint',
      networkEvaluation,
      engineEvaluationSummary: buildPlanOptionEngineEvaluationSummary({
        selectedScenarioIds,
        networkEvaluation,
        recoveryFactorHint: Math.max(1, Math.min(1.1, recoveryFactors.length > 0 ? Math.max(...recoveryFactors) : 1)),
        projectOrganizationScheme: params.projectOrganizationScheme,
      }),
      recoveryFactorHint: Math.max(1, Math.min(1.1, recoveryFactors.length > 0 ? Math.max(...recoveryFactors) : 1)),
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
    },
  }
}

function buildPlanOptionEngineEvaluationSummary(params: {
  selectedScenarioIds: ConstructionOrganizationScenarioId[]
  networkEvaluation: ConstructionOrganizationPlanOptionNetworkEvaluation
  recoveryFactorHint: number
  projectOrganizationScheme: ConstructionOrganizationPlanOptionProjectOrganizationScheme
}): ConstructionOrganizationPlanOptionEngineEvaluationSummary {
  return {
    source: 'construction_organization_plan_option_engine_evaluation_summary',
    evaluationRole: 'candidate_option_e1_e3_e5_summary_not_runtime_execution',
    e1: {
      input: 'selected_virtual_work_packages',
      output: 'virtual_work_package_duration_proxy_pending_generated_row_projection',
      selectedWorkPackageCount: params.selectedScenarioIds.length,
      selectedScenarioIds: params.selectedScenarioIds,
      writesReferenceDuration: false,
    },
    e3: {
      input: 'combined_virtual_dependency_network',
      output: 'virtual_cpm_duration_and_critical_nodes',
      projectDurationDays: params.networkEvaluation.projectDurationDays,
      criticalNodeCount: params.networkEvaluation.criticalNodeIds.length,
      edgeCount: params.networkEvaluation.edgeCount,
      writesCriticalPathSnapshot: false,
    },
    e5: {
      input: 'use_case_acceleration_recovery_evaluation',
      output: 'bounded_recovery_factor_hint',
      recoveryFactorHint: params.recoveryFactorHint,
      recoverableSpanDays: params.networkEvaluation.e5RecoverableSpanDays,
      writesAccelerationDraft: false,
    },
    projectOrganization: params.projectOrganizationScheme,
    boundary: {
      candidateOnly: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesCriticalPathFacts: false,
    },
  }
}

function scorePlanOption(option: ConstructionOrganizationPlanOption) {
  const spanPenalty = Math.min(35, option.evaluation.networkEvaluation.projectDurationDays / 20)
  return option.combinedScore - spanPenalty
}

function attachPlanOptionNetworkComparison(options: ConstructionOrganizationPlanOption[]) {
  const referenceDays = Math.max(
    1,
    ...options.map((option) => option.evaluation.networkEvaluation.projectDurationDays),
  )
  return options.map((option) => {
    const networkEvaluation = evaluateVirtualNetworkForPlanOption(option.combinedVirtualNetwork, referenceDays)
    const spanRecoveryFactor = 1 + Math.min(0.08, networkEvaluation.e5RecoverableSpanDays / Math.max(1, referenceDays) * 0.35)
    const recoveryFactorHint = Math.max(option.evaluation.recoveryFactorHint, Math.round(spanRecoveryFactor * 1000) / 1000)
    return {
      ...option,
      evaluation: {
        ...option.evaluation,
        networkEvaluation,
        engineEvaluationSummary: buildPlanOptionEngineEvaluationSummary({
          selectedScenarioIds: option.selectedScenarioIds,
          networkEvaluation,
          recoveryFactorHint,
          projectOrganizationScheme: option.projectOrganizationScheme,
        }),
        recoveryFactorHint,
      },
    }
  })
}

const CONSTRUCTION_ORGANIZATION_DECISION_FACT_KEYS = [
  'businessType',
  'projectOrganizationPolicy',
  'businessSubtype',
  'projectTypeCode',
  'structureTypeCode',
  'planScopeCaliber',
  'deliveryStandard',
  'terminalEvent',
  'methodVariantCodes',
  'prefabSystemCodes',
  'elementVariantCodes',
  'externalInterfaceCodes',
  'hardConstraintCodes',
  'projectFeatures',
  'detailLevel',
  'buildingPatternCodes',
  'functionalUsageCodes',
  'floorUsageCodes',
  'functionalCategoryCodes',
  'specialRoomTypeCodes',
  'physicalZoneTypeCodes',
  'buildingCount',
  'totalAreaM2',
  'aboveGroundAreaM2',
  'basementLevelCount',
  'basementAreaM2',
  'siteAreaM2',
  'foundationDepthM',
  'standardFloorCount',
  'highestBuildingFloorCount',
  'prefabRate',
  'maxSpanM',
  'supportHeightM',
  'hasCivilDefense',
  'climateSignals',
  'weatherImpactBands',
  'locationFacts',
  'scopeOrganizationFacts',
] as const

const CONSTRUCTION_ORGANIZATION_SCORING_FACT_KEYS = [
  'projectOrganizationPolicy',
  'businessSubtype',
  'structureTypeCode',
  'methodVariantCodes',
  'prefabSystemCodes',
  'elementVariantCodes',
  'externalInterfaceCodes',
  'hardConstraintCodes',
  'buildingPatternCodes',
  'functionalUsageCodes',
  'floorUsageCodes',
  'functionalCategoryCodes',
  'specialRoomTypeCodes',
  'physicalZoneTypeCodes',
  'buildingCount',
  'totalAreaM2',
  'aboveGroundAreaM2',
  'basementLevelCount',
  'basementAreaM2',
  'siteAreaM2',
  'foundationDepthM',
  'standardFloorCount',
  'highestBuildingFloorCount',
  'prefabRate',
  'maxSpanM',
  'supportHeightM',
  'hasCivilDefense',
  'climateSignals',
  'weatherImpactBands',
  'scopeOrganizationFacts',
] as const

const CONSTRUCTION_ORGANIZATION_STARTING_LINE_FACT_KEYS = [
  'onboardingMode',
  'onboardingSubstage',
  'onboardingPassedMilestones',
  'onboardingPhaseProgress',
] as const

const CONSTRUCTION_ORGANIZATION_SIDECAR_FACT_KEYS = [
  'towerCraneCount',
  'constructionHoistCount',
] as const

function factIsPresent(value: unknown) {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function buildFactCoverage(
  facts: Record<string, unknown>,
  options: { includeStartingLineFacts?: boolean } = {},
): ConstructionOrganizationFactCoverage {
  const coverageFactKeys = [
    ...CONSTRUCTION_ORGANIZATION_DECISION_FACT_KEYS,
    ...(options.includeStartingLineFacts ? CONSTRUCTION_ORGANIZATION_STARTING_LINE_FACT_KEYS : []),
  ]
  const consumedFactKeys = coverageFactKeys
    .filter((key) => factIsPresent(facts[key]))
  const decisionFactKeySet = new Set<string>([
    ...CONSTRUCTION_ORGANIZATION_SCORING_FACT_KEYS,
    ...(options.includeStartingLineFacts ? CONSTRUCTION_ORGANIZATION_STARTING_LINE_FACT_KEYS : []),
  ])
  const decisionFactKeys = consumedFactKeys.filter((key) => decisionFactKeySet.has(key))
  const contextFactKeys = consumedFactKeys.filter((key) => !decisionFactKeySet.has(key))
  const sidecarFactKeys = CONSTRUCTION_ORGANIZATION_SIDECAR_FACT_KEYS
    .filter((key) => factIsPresent(facts[key]))
  const missingFactKeys = coverageFactKeys
    .filter((key) => !factIsPresent(facts[key]))
  const completenessScore = Math.round((consumedFactKeys.length / coverageFactKeys.length) * 1000) / 1000

  return {
    source: 'wizard_project_generation_fact_coverage',
    usesExistingWizardFactsOnly: true,
    decisionFactKeys,
    contextFactKeys,
    consumedFactKeys,
    sidecarFactKeys,
    missingFactKeys,
    completenessScore,
    resourcePolicy: CONSTRUCTION_ORGANIZATION_RESOURCE_POLICY,
  }
}

function scoreUseCaseOption(params: {
  option: ConstructionOrganizationPlanOption
  useCase: ConstructionOrganizationUseCase
  recommendedPlanOption: ConstructionOrganizationPlanOption
  startingLineOption: ConstructionOrganizationPlanOption
  accelerationOption: ConstructionOrganizationPlanOption
}) {
  if (params.useCase === 'acceleration_recovery') {
    const recoverableScore = params.option.evaluation.networkEvaluation.e5RecoverableSpanDays * 0.9
    const factorScore = (params.option.evaluation.recoveryFactorHint - 1) * 500
    return Math.round((scorePlanOption(params.option) + recoverableScore + factorScore) * 100) / 100
  }
  const defaultScore = scorePlanOption(params.option)
  const selectedOption = params.useCase === 'starting_line_onboarding'
    ? params.startingLineOption
    : params.recommendedPlanOption
  const selectedBonus = params.option.optionId === selectedOption.optionId ? 10 : 0
  return Math.round((defaultScore + selectedBonus) * 100) / 100
}

function hasStartingLineTowerLaneProgress(phaseProgress: Record<string, unknown>) {
  return Object.entries(phaseProgress).some(([key, value]) => {
    const record = readRecord(value)
    const floorSignal = normalizeText(
      record.currentFloor
        ?? record.current_floor
        ?? record.floor
        ?? record.currentLevel
        ?? record.current_level,
    )
    if (floorSignal) return true
    const progress = Number(record.progress ?? record.progressPercent ?? record.percent ?? record.completionPercent)
    const hasProgress = Number.isFinite(progress) && progress > 0
    const status = normalizeId(record.status ?? record.phaseStatus ?? record.state)
    const hasActiveStatus = ['in_progress', 'started', 'active', '施工', '进行'].some((token) => status.includes(token))
    const text = [
      key,
      record.phase,
      record.phaseCode,
      record.phase_code,
      record.stage,
      record.substage,
      record.currentPhase,
      record.current_phase,
      record.currentSubstage,
      record.current_substage,
      record.scope,
      record.scopeType,
      record.scope_type,
    ].map(normalizeId).filter(Boolean).join(' ')
    const towerSignal = [
      'tower',
      'superstructure',
      'main_structure',
      'above_ground',
      'standard_floor',
      '主体',
      '标准层',
      '塔楼',
    ].some((token) => text.includes(token))
    return towerSignal && (hasProgress || hasActiveStatus || Object.keys(record).length > 0)
  })
}

function selectStartingLineOnboardingOption(params: {
  planOptions: ConstructionOrganizationPlanOption[]
  recommendedPlanOption: ConstructionOrganizationPlanOption
  onboardingPhaseProgress: Record<string, unknown>
}) {
  if (hasStartingLineTowerLaneProgress(params.onboardingPhaseProgress)) {
    const towerLaneOption = params.planOptions.find((option) => (
      option.selectedScenarioIds.includes('tower_lane_early_release_after_core_basement')
    ))
    if (towerLaneOption) {
      return {
        option: towerLaneOption,
        recommendationBasis: [
          'starting_line_tower_lane_progress_observed',
          'selected_by_starting_line_observed_progress',
        ],
      }
    }
  }
  return {
    option: params.recommendedPlanOption,
    recommendationBasis: [],
  }
}

function buildStartingLineContext(params: {
  onboardingMode: string
  onboardingSubstage: string
  startingLineDecisionLocked: boolean
  startingLineEvidenceBasis?: string[]
}) {
  const pastFoundationOrBasement = isStartingLinePastFoundationOrBasement(params.onboardingSubstage)
    || params.startingLineDecisionLocked
  const hasStartingLineMode = params.onboardingMode === 'starting_line'
  const hasCurrentStageEvidence = Boolean(params.onboardingSubstage || params.startingLineDecisionLocked)
  const hasStartingLineContext = Boolean(hasStartingLineMode || params.onboardingSubstage || params.startingLineDecisionLocked)
  const rankBasis = !hasStartingLineContext
    ? ['no_starting_line_context']
    : !hasCurrentStageEvidence
      ? [
          hasStartingLineMode ? 'onboarding_mode_starting_line' : 'starting_line_context_present',
          'starting_line_current_stage_missing',
          ...(params.startingLineEvidenceBasis ?? []),
        ]
      : [
          hasStartingLineMode ? 'onboarding_mode_starting_line' : 'starting_line_context_present',
          pastFoundationOrBasement
            ? 'starting_line_current_phase_past_foundation_or_basement'
            : 'starting_line_current_phase_allows_organization_candidate',
          ...(params.startingLineEvidenceBasis ?? []),
        ]
  const actionability: ConstructionOrganizationUseCaseRecommendation['actionability'] = !hasStartingLineContext
    ? 'evidence_only'
    : !hasCurrentStageEvidence
      ? 'evidence_only'
      : pastFoundationOrBasement
        ? 'not_actionable_after_current_phase'
        : 'actionable_candidate'

  return {
    actionability,
    rankBasis,
  }
}

function buildPlanOptionUseCaseEvaluation(params: {
  option: ConstructionOrganizationPlanOption
  useCase: ConstructionOrganizationUseCase
  recommendedPlanOption: ConstructionOrganizationPlanOption
  startingLineOption: ConstructionOrganizationPlanOption
  startingLineOptionBasis: string[]
  accelerationOption: ConstructionOrganizationPlanOption
  factCoverage: ConstructionOrganizationFactCoverage
  startingLineFactCoverage: ConstructionOrganizationFactCoverage
  onboardingMode: string
  onboardingSubstage: string
  startingLineDecisionLocked: boolean
  startingLineEvidenceBasis?: string[]
}): ConstructionOrganizationPlanOptionUseCaseEvaluation {
  const startingLineContext = buildStartingLineContext({
    onboardingMode: params.onboardingMode,
    onboardingSubstage: params.onboardingSubstage,
    startingLineDecisionLocked: params.startingLineDecisionLocked,
    startingLineEvidenceBasis: params.startingLineEvidenceBasis,
  })
  const useCaseBasis: Record<ConstructionOrganizationUseCase, string[]> = {
    new_project_planning: [
      'default_new_project_planning_option',
      'uses_existing_wizard_project_facts',
      params.option.optionId === params.recommendedPlanOption.optionId ? 'selected_by_default_plan_score' : 'kept_as_comparable_option',
    ],
    starting_line_onboarding: [
      ...startingLineContext.rankBasis,
      ...params.startingLineOptionBasis,
      ...(params.startingLineOptionBasis.length > 0
        ? [
            params.option.optionId === params.startingLineOption.optionId
              ? 'selected_by_starting_line_observed_progress'
              : 'kept_as_starting_line_comparable_option',
          ]
        : []),
    ],
    acceleration_recovery: [
      'e5_recoverable_span_priority',
      'bounded_recovery_factor_only',
      params.option.optionId === params.accelerationOption.optionId ? 'selected_by_acceleration_recovery_score' : 'kept_as_acceleration_comparable_option',
    ],
  }
  const actionability: Record<ConstructionOrganizationUseCase, ConstructionOrganizationUseCaseRecommendation['actionability']> = {
    new_project_planning: 'actionable_candidate',
    starting_line_onboarding: startingLineContext.actionability,
    acceleration_recovery: 'actionable_candidate',
  }

  return {
    useCase: params.useCase,
    optionId: params.option.optionId,
    optionScore: scoreUseCaseOption(params),
    rankBasis: Array.from(new Set(useCaseBasis[params.useCase].filter(Boolean))),
    actionability: actionability[params.useCase],
    ...(params.useCase === 'starting_line_onboarding' && params.onboardingSubstage
      ? { currentSubstage: params.onboardingSubstage }
      : {}),
    recoveryFactorHint: params.option.evaluation.recoveryFactorHint,
    e5RecoverableSpanDays: params.option.evaluation.networkEvaluation.e5RecoverableSpanDays,
    factCoverage: params.useCase === 'starting_line_onboarding'
      ? params.startingLineFactCoverage
      : params.factCoverage,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
  }
}

function attachPlanOptionUseCaseEvaluations(params: {
  planOptions: ConstructionOrganizationPlanOption[]
  recommendedPlanOption: ConstructionOrganizationPlanOption
  startingLineOption: ConstructionOrganizationPlanOption
  startingLineOptionBasis: string[]
  factCoverage: ConstructionOrganizationFactCoverage
  startingLineFactCoverage: ConstructionOrganizationFactCoverage
  onboardingMode: string
  onboardingSubstage: string
  startingLineDecisionLocked: boolean
  startingLineEvidenceBasis?: string[]
}) {
  const accelerationOption = selectAccelerationRecoveryOption(params.planOptions) ?? params.recommendedPlanOption
  const withEvaluations = params.planOptions.map((option) => {
    const evaluationParams = {
      option,
      recommendedPlanOption: params.recommendedPlanOption,
      startingLineOption: params.startingLineOption,
      startingLineOptionBasis: params.startingLineOptionBasis,
      accelerationOption,
      factCoverage: params.factCoverage,
      startingLineFactCoverage: params.startingLineFactCoverage,
      onboardingMode: params.onboardingMode,
      onboardingSubstage: params.onboardingSubstage,
      startingLineDecisionLocked: params.startingLineDecisionLocked,
      startingLineEvidenceBasis: params.startingLineEvidenceBasis,
    }
    return {
      ...option,
      evaluation: {
        ...option.evaluation,
        useCaseEvaluations: {
          newProjectPlanning: buildPlanOptionUseCaseEvaluation({
            ...evaluationParams,
            useCase: 'new_project_planning',
          }),
          startingLineOnboarding: buildPlanOptionUseCaseEvaluation({
            ...evaluationParams,
            useCase: 'starting_line_onboarding',
          }),
          accelerationRecovery: buildPlanOptionUseCaseEvaluation({
            ...evaluationParams,
            useCase: 'acceleration_recovery',
          }),
        },
      },
    }
  })
  const recommendedPlanOption = withEvaluations.find((option) => option.optionId === params.recommendedPlanOption.optionId)
    ?? params.recommendedPlanOption
  return {
    planOptions: withEvaluations,
    recommendedPlanOption,
  }
}

function buildUseCaseRecommendation(params: {
  useCase: ConstructionOrganizationUseCase
  option: ConstructionOrganizationPlanOption
  confidence: ConstructionOrganizationUseCaseRecommendation['confidence']
  recommendationBasis: string[]
  policyRecommendationBasis?: string[]
  actionability?: ConstructionOrganizationUseCaseRecommendation['actionability']
  currentSubstage?: string | null
}): ConstructionOrganizationUseCaseRecommendation {
  return {
    useCase: params.useCase,
    optionId: params.option.optionId,
    selectedScenarioIds: params.option.selectedScenarioIds,
    recommendationBasis: Array.from(new Set([
      ...(params.policyRecommendationBasis ?? []),
      ...params.recommendationBasis,
    ].filter(Boolean))),
    confidence: params.confidence,
    actionability: params.actionability ?? 'actionable_candidate',
    ...(params.currentSubstage ? { currentSubstage: params.currentSubstage } : {}),
    recoveryFactorHint: params.option.evaluation.recoveryFactorHint,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
  }
}

function isStartingLinePastFoundationOrBasement(onboardingSubstage: string) {
  if (!onboardingSubstage) return false
  return [
    'main_structure',
    'superstructure',
    'structure',
    'mep',
    'finishing',
    'fitout',
    'facade',
    'outdoor',
    'handover',
    'completion',
  ].some((keyword) => onboardingSubstage.includes(keyword))
}

function selectAccelerationRecoveryOption(options: ConstructionOrganizationPlanOption[]) {
  return [...options].sort((left, right) => {
    const leftRecoverable = left.evaluation.networkEvaluation.e5RecoverableSpanDays
    const rightRecoverable = right.evaluation.networkEvaluation.e5RecoverableSpanDays
    if (rightRecoverable !== leftRecoverable) return rightRecoverable - leftRecoverable
    const rightFactor = right.evaluation.recoveryFactorHint
    const leftFactor = left.evaluation.recoveryFactorHint
    if (rightFactor !== leftFactor) return rightFactor - leftFactor
    return scorePlanOption(right) - scorePlanOption(left)
  })[0] ?? options[0]
}

function buildScenarioRecommendations(params: {
  planOptions: ConstructionOrganizationPlanOption[]
  recommendedPlanOption: ConstructionOrganizationPlanOption
  confidence: ConstructionOrganizationUseCaseRecommendation['confidence']
  policyRecommendationBasis: string[]
  onboardingMode: string
  onboardingSubstage: string
  onboardingPhaseProgress: Record<string, unknown>
  startingLineDecisionLocked: boolean
  startingLineEvidenceBasis?: string[]
}) {
  const accelerationOption = selectAccelerationRecoveryOption(params.planOptions) ?? params.recommendedPlanOption
  const startingLineSelection = selectStartingLineOnboardingOption({
    planOptions: params.planOptions,
    recommendedPlanOption: params.recommendedPlanOption,
    onboardingPhaseProgress: readRecord(params.onboardingPhaseProgress),
  })
  const startingLineContext = buildStartingLineContext({
    onboardingMode: params.onboardingMode,
    onboardingSubstage: params.onboardingSubstage,
    startingLineDecisionLocked: params.startingLineDecisionLocked,
    startingLineEvidenceBasis: params.startingLineEvidenceBasis,
  })

  return {
    newProjectPlanning: buildUseCaseRecommendation({
      useCase: 'new_project_planning',
      option: params.recommendedPlanOption,
      confidence: params.confidence,
      policyRecommendationBasis: params.policyRecommendationBasis,
      recommendationBasis: ['default_new_project_planning_option', 'uses_existing_wizard_project_facts'],
    }),
    startingLineOnboarding: buildUseCaseRecommendation({
      useCase: 'starting_line_onboarding',
      option: startingLineSelection.option,
      confidence: params.confidence,
      policyRecommendationBasis: params.policyRecommendationBasis,
      recommendationBasis: [
        ...startingLineContext.rankBasis,
        ...startingLineSelection.recommendationBasis,
      ],
      actionability: startingLineContext.actionability,
      currentSubstage: params.onboardingSubstage || null,
    }),
    accelerationRecovery: buildUseCaseRecommendation({
      useCase: 'acceleration_recovery',
      option: accelerationOption,
      confidence: params.confidence,
      policyRecommendationBasis: params.policyRecommendationBasis,
      recommendationBasis: ['e5_recoverable_span_priority', 'bounded_recovery_factor_only'],
    }),
  }
}

function buildPlanOptionComparisonItem(params: {
  option: ConstructionOrganizationPlanOption
  scenarioRecommendations: ConstructionOrganizationScenarioSelection['scenarioRecommendations']
}): ConstructionOrganizationPlanOptionComparisonItem {
  const recommendedUseCases = ([
    'newProjectPlanning',
    'startingLineOnboarding',
    'accelerationRecovery',
  ] as ConstructionOrganizationPlanOptionComparisonUseCaseKey[])
    .filter((useCase) => params.scenarioRecommendations[useCase].optionId === params.option.optionId)
  const useCaseScoreFor = (useCase: ConstructionOrganizationPlanOptionComparisonUseCaseKey) => {
    const evaluation = params.option.evaluation.useCaseEvaluations?.[useCase]
    if (!evaluation) return null
    return {
      optionScore: evaluation.optionScore,
      actionability: evaluation.actionability,
      e5RecoverableSpanDays: evaluation.e5RecoverableSpanDays,
      recoveryFactorHint: evaluation.recoveryFactorHint,
      rankBasis: evaluation.rankBasis,
    }
  }
  const nextGovernance = buildPlanOptionNextGovernance(params.option)
  const projection = params.option.evaluation.generatedRowProjection
  const referenceEvidence = projection?.generatedRowReferenceDurationEvidence ?? null
  const networkEvaluation = projection?.generatedRowNetworkEvaluation ?? null
  const materializationDecision = projection?.materializationDecision ?? null
  const rankingSignals = [
    'candidate_option_e1_e3_e5_summary',
    projection ? 'generated_row_projection_alignment' : null,
    networkEvaluation ? 'generated_row_candidate_network_cpm' : null,
    referenceEvidence ? 'generated_row_reference_duration_projection' : null,
    materializationDecision ? 'candidate_materialization_decision' : null,
  ].filter((item): item is string => Boolean(item))

  return {
    source: 'construction_organization_plan_option_comparison_item',
    optionId: params.option.optionId,
    selectedScenarioIds: params.option.selectedScenarioIds,
    combinedScore: params.option.combinedScore,
    confidence: params.option.confidence,
    isRecommendedFor: recommendedUseCases,
    nextGovernanceAction: nextGovernance.nextGovernanceAction,
    nextGovernanceReasons: nextGovernance.nextGovernanceReasons,
    systemRecommendationBasis: {
      source: 'construction_organization_plan_option_system_recommendation_basis',
      recommendationRole: 'read_only_candidate_ranking_from_e1_e3_e5_and_generated_row_projection',
      recommendedForUseCases: recommendedUseCases,
      rankingSignals,
      e1: {
        selectedWorkPackageCount: params.option.evaluation.engineEvaluationSummary.e1.selectedWorkPackageCount,
        hasGeneratedRowReferenceEvidence: Boolean(referenceEvidence),
        matchedReferenceRowCount: referenceEvidence?.matchedReferenceRowCount ?? 0,
        totalRecommendedDurationDays: referenceEvidence?.totalRecommendedDurationDays ?? null,
        writesReferenceDuration: false,
      },
      e3: {
        projectDurationDays: params.option.evaluation.networkEvaluation.projectDurationDays,
        previewEdgeCount: networkEvaluation?.previewEdgeCount ?? 0,
        unresolvedEdgeCount: networkEvaluation?.unresolvedEdgeCount ?? 0,
        criticalNodeCount: params.option.evaluation.networkEvaluation.criticalNodeIds.length,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      },
      e5: {
        recoveryFactorHint: params.option.evaluation.recoveryFactorHint,
        e5RecoverableSpanDays: params.option.evaluation.networkEvaluation.e5RecoverableSpanDays,
        writesAccelerationDraft: false,
      },
      materialization: {
        decision: materializationDecision?.decision ?? 'generated_row_projection_required',
        allowManualMaterialization: Boolean(materializationDecision?.allowManualMaterialization),
        reasons: materializationDecision?.reasons ?? ['generated_row_projection_required_before_manual_review_handoff'],
      },
      boundaryPolicy: {
        candidateOnly: true,
        readOnlyRecommendation: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      },
    },
    useCaseScores: {
      newProjectPlanning: useCaseScoreFor('newProjectPlanning'),
      startingLineOnboarding: useCaseScoreFor('startingLineOnboarding'),
      accelerationRecovery: useCaseScoreFor('accelerationRecovery'),
    },
    e1: {
      selectedWorkPackageCount: params.option.evaluation.engineEvaluationSummary.e1.selectedWorkPackageCount,
      selectedScenarioIds: params.option.evaluation.engineEvaluationSummary.e1.selectedScenarioIds,
      writesReferenceDuration: false,
    },
    e3: {
      projectDurationDays: params.option.evaluation.networkEvaluation.projectDurationDays,
      criticalNodeCount: params.option.evaluation.networkEvaluation.criticalNodeIds.length,
      edgeCount: params.option.evaluation.networkEvaluation.edgeCount,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    },
    e5: {
      recoveryFactorHint: params.option.evaluation.recoveryFactorHint,
      e5RecoverableSpanDays: params.option.evaluation.networkEvaluation.e5RecoverableSpanDays,
      writesAccelerationDraft: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
    },
    boundaryPolicy: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
  }
}

function uniqueGovernanceReasons(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
}

function buildPlanOptionNextGovernance(
  option: ConstructionOrganizationPlanOption,
): {
  nextGovernanceAction: ConstructionOrganizationPlanOptionNextGovernanceAction
  nextGovernanceReasons: string[]
} {
  const decision = option.evaluation.generatedRowProjection?.materializationDecision
  if (!decision) {
    return {
      nextGovernanceAction: 'generated_row_projection_required',
      nextGovernanceReasons: ['generated_row_projection_required_before_manual_review_handoff'],
    }
  }

  if (decision.allowManualMaterialization) {
    return {
      nextGovernanceAction: 'manual_review_handoff',
      nextGovernanceReasons: uniqueGovernanceReasons([
        'ready_for_manual_review_handoff',
        ...decision.reasons,
      ]),
    }
  }

  return {
    nextGovernanceAction: 'blocked',
    nextGovernanceReasons: uniqueGovernanceReasons([
      ...decision.reasons,
      decision.decision,
      'manual_review_handoff_blocked_by_materialization_decision',
    ]),
  }
}

export function buildPlanOptionComparisonPackage(params: {
  planOptions: ConstructionOrganizationPlanOption[]
  recommendedPlanOption: ConstructionOrganizationPlanOption
  scenarioRecommendations: ConstructionOrganizationScenarioSelection['scenarioRecommendations']
}): ConstructionOrganizationPlanOptionComparisonPackage {
  const options = params.planOptions.length > 0 ? params.planOptions : [params.recommendedPlanOption]
  return {
    source: 'construction_organization_plan_option_comparison_package',
    totalOptionCount: options.length,
    recommendedOptionIdsByUseCase: {
      newProjectPlanning: params.scenarioRecommendations.newProjectPlanning.optionId,
      startingLineOnboarding: params.scenarioRecommendations.startingLineOnboarding.optionId,
      accelerationRecovery: params.scenarioRecommendations.accelerationRecovery.optionId,
    },
    canAutoMaterializeSelectedOption: false,
    comparisonBasis: [
      'candidate_option_e1_e3_e5_summary',
      'use_case_specific_recommendation_scores',
      CONSTRUCTION_ORGANIZATION_RESOURCE_POLICY,
    ],
    options: options.map((option) => buildPlanOptionComparisonItem({
      option,
      scenarioRecommendations: params.scenarioRecommendations,
    })),
    boundaryPolicy: [
      'candidate_only',
      'writes_task_dependencies_false',
      'writes_plan_dates_false',
      'requires_domain_writer_release_exit_before_materialization',
    ],
  }
}

function compactUniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
}

function buildUseCaseDecisionReport(params: {
  useCase: ConstructionOrganizationUseCase
  useCaseKey: ConstructionOrganizationPlanOptionComparisonUseCaseKey
  recommendation: ConstructionOrganizationUseCaseRecommendation
  option: ConstructionOrganizationPlanOption
}): ConstructionOrganizationUseCaseDecisionReport {
  const evaluation = params.option.evaluation.useCaseEvaluations?.[params.useCaseKey]
  const nextGovernance = buildPlanOptionNextGovernance(params.option)
  return {
    source: 'construction_organization_use_case_decision_report',
    useCase: params.useCase,
    optionId: params.option.optionId,
    selectedScenarioIds: params.option.selectedScenarioIds,
    actionability: params.recommendation.actionability,
    confidence: params.recommendation.confidence,
    decisionBasis: compactUniqueStrings([
      ...params.recommendation.recommendationBasis,
      ...(evaluation?.rankBasis ?? []),
      ...params.option.selectionReasons,
    ]).slice(0, 20),
    optionScore: evaluation?.optionScore ?? null,
    virtualProjectDurationDays: params.option.evaluation.networkEvaluation.projectDurationDays,
    e5RecoverableSpanDays: params.option.evaluation.networkEvaluation.e5RecoverableSpanDays,
    recoveryFactorHint: params.option.evaluation.recoveryFactorHint,
    nextGovernanceAction: nextGovernance.nextGovernanceAction,
    nextGovernanceReasons: nextGovernance.nextGovernanceReasons,
    excludedAlternatives: params.option.excludedReasons,
    factCoverage: evaluation?.factCoverage ?? null,
    boundaryPolicy: {
      recommendedBySystem: true,
      candidateOnly: true,
      resourcesAreSidecarSignals: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
  }
}

export function buildConstructionOrganizationProductCloseoutReadinessFromDecisionReport(): ConstructionOrganizationProductCloseoutReadinessFromDecisionReport {
  return {
    source: 'construction_organization_product_closeout_readiness_from_decision_report',
    status: 'candidate_recommendation_only_runtime_closeout_required',
    canDeclareConstructionOrganizationProductOutcomeCloseout: false,
    requiredCloseoutEvidence: [
      'constructionOrganizationProductOutcomeCloseoutMatrixService',
      'constructionOrganizationPlanNetworkDraftService.runtimeCloseoutClaim',
      'constructionOrganizationPlanNetworkDraftService.runtimeRecommendedOption',
      'constructionOrganizationPlanNetworkRuntimeEvidenceService',
    ],
    missingBeforeProductCloseout: [
      'real_runtime_evidence_source_required',
      'runtime_use_case_coverage_required',
      'runtime_option_network_coverage_required',
      'runtime_ready_option_closeout_claim_coverage_required',
      'site_adoption_of_runtime_recommended_option_required',
    ],
    nextEvidenceActions: [
      'collect_real_runtime_evidence_for_business_type',
      'collect_runtime_use_case_evidence_for_business_type',
      'collect_runtime_option_network_evidence_for_business_type',
      'record_site_adoption_for_business_type',
    ],
    boundaryPolicy: {
      readOnlyCandidateReport: true,
      productCloseoutRequiresRuntimeMatrix: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
  }
}

export function ensureConstructionOrganizationDecisionReportProductCloseoutReadiness<T extends Record<string, unknown>>(
  report: T | null | undefined,
): T | null {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return null
  if (Object.keys(report).length === 0) return null
  const existingReadiness = report.productCloseoutReadiness
  if (existingReadiness && typeof existingReadiness === 'object' && !Array.isArray(existingReadiness)) {
    return report
  }
  return {
    ...report,
    productCloseoutReadiness: buildConstructionOrganizationProductCloseoutReadinessFromDecisionReport(),
  }
}

function buildConstructionOrganizationDecisionReport(params: {
  planOptions: ConstructionOrganizationPlanOption[]
  recommendedPlanOption: ConstructionOrganizationPlanOption
  scenarioRecommendations: ConstructionOrganizationScenarioSelection['scenarioRecommendations']
  factCoverage: ConstructionOrganizationFactCoverage
  startingLineFactCoverage: ConstructionOrganizationFactCoverage
  candidateCount: number
}): ConstructionOrganizationDecisionReport {
  const optionById = new Map(params.planOptions.map((option) => [option.optionId, option]))
  const selectOption = (recommendation: ConstructionOrganizationUseCaseRecommendation) => (
    optionById.get(recommendation.optionId) ?? params.recommendedPlanOption
  )
  const newProjectPlanning = buildUseCaseDecisionReport({
    useCase: 'new_project_planning',
    useCaseKey: 'newProjectPlanning',
    recommendation: params.scenarioRecommendations.newProjectPlanning,
    option: selectOption(params.scenarioRecommendations.newProjectPlanning),
  })
  const startingLineOnboarding = buildUseCaseDecisionReport({
    useCase: 'starting_line_onboarding',
    useCaseKey: 'startingLineOnboarding',
    recommendation: params.scenarioRecommendations.startingLineOnboarding,
    option: selectOption(params.scenarioRecommendations.startingLineOnboarding),
  })
  const accelerationRecovery = buildUseCaseDecisionReport({
    useCase: 'acceleration_recovery',
    useCaseKey: 'accelerationRecovery',
    recommendation: params.scenarioRecommendations.accelerationRecovery,
    option: selectOption(params.scenarioRecommendations.accelerationRecovery),
  })
  return {
    source: 'construction_organization_decision_report',
    reportRole: 'product_best_scheme_read_model',
    selectedByUseCase: {
      newProjectPlanning,
      startingLineOnboarding,
      accelerationRecovery,
    },
    optionCount: params.planOptions.length,
    candidateCount: params.candidateCount,
    recommendedPlanOptionId: params.recommendedPlanOption.optionId,
    recommendedScenarioIds: params.recommendedPlanOption.selectedScenarioIds,
    projectOrganizationScheme: params.recommendedPlanOption.projectOrganizationScheme,
    decisionSignals: {
      usesExistingWizardFactsOnly: true,
      decisionFactKeys: compactUniqueStrings([
        ...params.factCoverage.decisionFactKeys,
        ...params.startingLineFactCoverage.decisionFactKeys,
      ]),
      contextFactKeys: compactUniqueStrings([
        ...params.factCoverage.contextFactKeys,
        ...params.startingLineFactCoverage.contextFactKeys,
      ]),
      sidecarFactKeys: compactUniqueStrings([
        ...params.factCoverage.sidecarFactKeys,
        ...params.startingLineFactCoverage.sidecarFactKeys,
      ]),
      resourcePolicy: CONSTRUCTION_ORGANIZATION_RESOURCE_POLICY,
    },
    engineEvidence: {
      e1: 'virtual_work_package_duration_proxy_pending_generated_row_projection',
      e3: 'combined_virtual_dependency_network_cpm_evaluated_not_persisted',
      e5: 'bounded_recovery_factor_hint',
    },
    productCloseoutReadiness: buildConstructionOrganizationProductCloseoutReadinessFromDecisionReport(),
    boundaryPolicy: {
      candidateOnly: true,
      readOnlyBestScheme: true,
      runtimeMaterializationRequiresGovernance: true,
      resourcesAreSidecarSignals: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
  }
}

function buildPlanOptions(params: {
  candidates: ConstructionOrganizationScenarioCandidate[]
  confidence: ConstructionOrganizationPlanOption['confidence']
  projectOrganizationScheme: ConstructionOrganizationPlanOptionProjectOrganizationScheme
}) {
  const byCategory = new Map<ConstructionOrganizationScenarioCandidate['category'], ConstructionOrganizationScenarioCandidate[]>()
  for (const candidate of params.candidates) {
    if (candidate.feasibility === 'rejected') continue
    const bucket = byCategory.get(candidate.category) ?? []
    bucket.push(candidate)
    byCategory.set(candidate.category, bucket)
  }
  const foundationCandidates = byCategory.get('foundation_sequence') ?? []
  const releaseCandidates = byCategory.get('basement_tower_release') ?? []
  const outdoorCandidates = byCategory.get('outdoor_site_release') ?? []
  const planOptions = foundationCandidates.flatMap((foundationCandidate) => (
    releaseCandidates.flatMap((releaseCandidate) => {
      const baseCandidates = [foundationCandidate, releaseCandidate]
      const outdoorChoices = outdoorCandidates.length > 0 ? outdoorCandidates : [null]
      return outdoorChoices.map((outdoorCandidate) => buildPlanOption({
        selectedCandidates: outdoorCandidate ? [...baseCandidates, outdoorCandidate] : baseCandidates,
        allCandidates: params.candidates,
        confidence: params.confidence,
        projectOrganizationScheme: params.projectOrganizationScheme,
      }))
    })
  ))
  if (planOptions.length === 0) {
    const fallbackCandidates = params.candidates.filter((candidate) => candidate.feasibility !== 'rejected')
    if (fallbackCandidates.length > 0) {
      planOptions.push(buildPlanOption({
        selectedCandidates: fallbackCandidates,
        allCandidates: params.candidates,
        confidence: params.confidence,
        projectOrganizationScheme: params.projectOrganizationScheme,
      }))
    }
  }
  return attachPlanOptionNetworkComparison(planOptions).sort((a, b) => scorePlanOption(b) - scorePlanOption(a))
}

function buildVirtualNetwork(
  scenarioId: ConstructionOrganizationScenarioId,
  deepPit: boolean,
  sharedBasement: boolean,
  multiBuilding: boolean,
): ConstructionOrganizationVirtualNetwork {
  const basementDuration = sharedBasement ? (deepPit ? 90 : 60) : 30
  const towerLaneDuration = multiBuilding ? 180 : 120
  const nodesByScenario: Record<ConstructionOrganizationScenarioId, ConstructionOrganizationVirtualNetworkNode[]> = {
    pile_before_excavation: [
      { id: 'pile', label: 'pile foundation works', phase: 'foundation', durationDays: deepPit ? 45 : 30 },
      { id: 'earthwork', label: 'bulk excavation', phase: 'earthwork', durationDays: deepPit ? 35 : 20 },
      { id: 'basement', label: 'basement structural release', phase: 'basement', durationDays: basementDuration },
      { id: 'handoff', label: 'foundation to superstructure handoff', phase: 'handoff', durationDays: 5 },
    ],
    excavation_before_pile: [
      { id: 'earthwork', label: 'bulk excavation and working platform', phase: 'earthwork', durationDays: deepPit ? 40 : 22 },
      { id: 'pile', label: 'pile foundation works after excavation', phase: 'foundation', durationDays: deepPit ? 48 : 32 },
      { id: 'basement', label: 'basement structural release', phase: 'basement', durationDays: basementDuration },
      { id: 'handoff', label: 'foundation to superstructure handoff', phase: 'handoff', durationDays: 5 },
    ],
    tower_lane_early_release_after_core_basement: [
      { id: 'core_basement', label: 'core basement release', phase: 'basement', durationDays: Math.max(35, Math.round(basementDuration * 0.6)) },
      { id: 'tower_lane', label: 'tower lane early superstructure', phase: 'tower', durationDays: towerLaneDuration },
      { id: 'shared_basement_tail', label: 'shared basement tail works', phase: 'basement', durationDays: Math.max(20, Math.round(basementDuration * 0.45)) },
      { id: 'handoff', label: 'tower and shared basement interface handoff', phase: 'handoff', durationDays: 7 },
    ],
    shared_basement_first_then_tower: [
      { id: 'shared_basement', label: 'whole shared basement structure', phase: 'basement', durationDays: basementDuration },
      { id: 'tower_lane', label: 'tower lane superstructure after basement', phase: 'tower', durationDays: towerLaneDuration },
      { id: 'handoff', label: 'basement to tower full-release handoff', phase: 'handoff', durationDays: 7 },
    ],
    outdoor_site_early_release_after_basement_backfill: [
      { id: 'basement_backfill_release', label: 'basement backfill and site release', phase: 'basement', durationDays: sharedBasement ? 28 : 18 },
      { id: 'outdoor_site', label: 'outdoor municipal and landscape works', phase: 'outdoor', durationDays: multiBuilding ? 90 : 60 },
      { id: 'outdoor_handoff', label: 'outdoor site handoff before completion', phase: 'handoff', durationDays: 5 },
    ],
    outdoor_site_after_primary_structure: [
      { id: 'primary_structure_release', label: 'primary structure release before outdoor works', phase: 'tower', durationDays: multiBuilding ? 150 : 100 },
      { id: 'outdoor_site', label: 'outdoor municipal and landscape works after structure', phase: 'outdoor', durationDays: multiBuilding ? 90 : 60 },
      { id: 'outdoor_handoff', label: 'outdoor site handoff before completion', phase: 'handoff', durationDays: 5 },
    ],
  }
  const dependenciesByScenario: Record<ConstructionOrganizationScenarioId, ConstructionOrganizationVirtualNetworkDependency[]> = {
    pile_before_excavation: [
      { fromNodeId: 'pile', toNodeId: 'earthwork', dependencyType: 'FS', lagDays: 0, intent: 'pile_before_earthwork_bulk_excavation' },
      { fromNodeId: 'earthwork', toNodeId: 'basement', dependencyType: 'FS', lagDays: 0, intent: 'pit_bottom_release_before_basement' },
      { fromNodeId: 'basement', toNodeId: 'handoff', dependencyType: 'FS', lagDays: 0, intent: 'basement_acceptance_before_handoff' },
    ],
    excavation_before_pile: [
      { fromNodeId: 'earthwork', toNodeId: 'pile', dependencyType: 'FS', lagDays: 0, intent: 'bulk_excavation_before_pile_platform' },
      { fromNodeId: 'pile', toNodeId: 'basement', dependencyType: 'FS', lagDays: 0, intent: 'pile_acceptance_before_basement' },
      { fromNodeId: 'basement', toNodeId: 'handoff', dependencyType: 'FS', lagDays: 0, intent: 'basement_acceptance_before_handoff' },
    ],
    tower_lane_early_release_after_core_basement: [
      { fromNodeId: 'core_basement', toNodeId: 'tower_lane', dependencyType: 'SS', lagDays: 20, intent: 'core_basement_release_before_tower_lane_start' },
      { fromNodeId: 'core_basement', toNodeId: 'shared_basement_tail', dependencyType: 'SS', lagDays: 0, intent: 'shared_basement_tail_parallel_with_tower_release' },
      { fromNodeId: 'tower_lane', toNodeId: 'handoff', dependencyType: 'FS', lagDays: 0, intent: 'tower_lane_completion_before_handoff' },
      { fromNodeId: 'shared_basement_tail', toNodeId: 'handoff', dependencyType: 'FS', lagDays: 0, intent: 'basement_tail_completion_before_handoff' },
    ],
    shared_basement_first_then_tower: [
      { fromNodeId: 'shared_basement', toNodeId: 'tower_lane', dependencyType: 'FS', lagDays: 0, intent: 'shared_basement_structure_before_tower_full_release' },
      { fromNodeId: 'tower_lane', toNodeId: 'handoff', dependencyType: 'FS', lagDays: 0, intent: 'tower_lane_completion_before_handoff' },
    ],
    outdoor_site_early_release_after_basement_backfill: [
      { fromNodeId: 'basement_backfill_release', toNodeId: 'outdoor_site', dependencyType: 'SS', lagDays: 10, intent: 'basement_backfill_release_before_outdoor_site_start' },
      { fromNodeId: 'outdoor_site', toNodeId: 'outdoor_handoff', dependencyType: 'FS', lagDays: 0, intent: 'outdoor_site_completion_before_handoff' },
    ],
    outdoor_site_after_primary_structure: [
      { fromNodeId: 'primary_structure_release', toNodeId: 'outdoor_site', dependencyType: 'FS', lagDays: 0, intent: 'primary_structure_release_before_outdoor_site_start' },
      { fromNodeId: 'outdoor_site', toNodeId: 'outdoor_handoff', dependencyType: 'FS', lagDays: 0, intent: 'outdoor_site_completion_before_handoff' },
    ],
  }
  const nodes = nodesByScenario[scenarioId]
  const dependencies = dependenciesByScenario[scenarioId]
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const starts = new Map(nodes.map((node) => [node.id, 0]))
  for (let index = 0; index < nodes.length; index += 1) {
    for (const dependency of dependencies) {
      const from = nodeById.get(dependency.fromNodeId)
      if (!from) continue
      const fromStart = starts.get(dependency.fromNodeId) ?? 0
      const requiredStart = dependency.dependencyType === 'SS'
        ? fromStart + dependency.lagDays
        : fromStart + from.durationDays + dependency.lagDays
      starts.set(dependency.toNodeId, Math.max(starts.get(dependency.toNodeId) ?? 0, requiredStart))
    }
  }
  const finishes = nodes.map((node) => ({
    nodeId: node.id,
    finish: (starts.get(node.id) ?? 0) + node.durationDays,
  }))
  const totalSpanDays = Math.max(...finishes.map((item) => item.finish), 0)
  const criticalNodeIds = finishes
    .filter((item) => item.finish >= totalSpanDays - 1)
    .map((item) => item.nodeId)
  return {
    source: 'construction_organization_virtual_network',
    nodes,
    dependencies,
    totalSpanDays,
    criticalNodeIds,
    writesTaskDependencies: false,
    writesPlanDates: false,
  }
}

function buildCandidate(params: {
  scenarioId: ConstructionOrganizationScenarioId
  category: ConstructionOrganizationScenarioCandidate['category']
  label: string
  score: number
  recommended: boolean
  rejectionReasons?: string[]
  selectionReasons: string[]
  dependencyIntents: string[]
  releasePolicy: string
  virtualNetwork: ConstructionOrganizationVirtualNetwork
}): ConstructionOrganizationScenarioCandidate {
  const rejectionReasons = params.rejectionReasons ?? []
  const feasibility = rejectionReasons.length > 0
    ? 'rejected'
    : params.recommended
      ? 'recommended'
      : 'candidate'
  const score = Math.round(params.score * 100) / 100
  return {
    scenarioId: params.scenarioId,
    category: params.category,
    label: params.label,
    feasibility,
    score,
    selectionReasons: params.selectionReasons,
    rejectionReasons,
    virtualNetworkHints: {
      dependencyIntents: params.dependencyIntents,
      releasePolicy: params.releasePolicy,
      evaluationRole: 'candidate_virtual_network_only',
    },
    evaluation: {
      evaluationRole: 'candidate_network_score_for_e1_e3_e5',
      compositeScore: score,
      e1DurationBasis: 'virtual_work_package_duration_proxy_pending_generated_row_projection',
      e3NetworkBasis: 'virtual_dependency_network_not_persisted',
      e5AccelerationBasis: 'scenario_recovery_factor_hint',
      recoveryFactorHint: recoveryFactorHintForScenario(params.scenarioId, feasibility, score),
      scheduleRiskLevel: riskLevelFromScore(score, feasibility === 'rejected'),
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
    },
    virtualNetwork: params.virtualNetwork,
  }
}

export function selectConstructionOrganizationScenario(
  input: ConstructionOrganizationScenarioSelectorInput,
): ConstructionOrganizationScenarioSelection {
  const methodVariantCodes = readCodeArray(input.methodVariantCodes)
  const prefabSystemCodes = readCodeArray(input.prefabSystemCodes)
  const elementVariantCodes = readCodeArray(input.elementVariantCodes)
  const externalInterfaceCodes = readCodeArray(input.externalInterfaceCodes)
  const hardConstraintCodes = readCodeArray(input.hardConstraintCodes)
  const projectFeatures = readRecord(input.projectFeatures)
  const expandedFoundationMethodCodes = expandFoundationFormMethodCodes(projectFeatures)
  const detailLevel = normalizeId(input.detailLevel)
  const buildingPatternCodes = readCodeArray(input.buildingPatternCodes)
  const functionalUsageCodes = readCodeArray(input.functionalUsageCodes)
  const floorUsageCodes = readCodeArray(input.floorUsageCodes)
  const functionalCategoryCodes = readCodeArray(input.functionalCategoryCodes)
  const specialRoomTypeCodes = readCodeArray(input.specialRoomTypeCodes)
  const physicalZoneTypeCodes = readCodeArray(input.physicalZoneTypeCodes)
  const climateSignals = readCodeArray(input.climateSignals)
  const weatherImpactBands = readCodeArray(input.weatherImpactBands)
  const locationFacts = readRecord(input.locationFacts)
  const scopeOrganizationFacts = readRecord(input.scopeOrganizationFacts)
  const scopeOrganizationSignals = readCodeArray(scopeOrganizationFacts.organizationSignals ?? scopeOrganizationFacts.organization_signals)
  const scopeBuildingObjectCount = readCount(scopeOrganizationFacts.buildingObjectCount ?? scopeOrganizationFacts.building_object_count)
  const scopeSharedBasementObjectCount = readCount(scopeOrganizationFacts.sharedBasementObjectCount ?? scopeOrganizationFacts.shared_basement_object_count)
  const scopeSharedPodiumObjectCount = readCount(scopeOrganizationFacts.sharedPodiumObjectCount ?? scopeOrganizationFacts.shared_podium_object_count)
  const scopeOutdoorSiteObjectCount = readCount(scopeOrganizationFacts.outdoorSiteObjectCount ?? scopeOrganizationFacts.outdoor_site_object_count)
  const scopeSharedBasementServiceTargetCount = readCount(scopeOrganizationFacts.sharedBasementServiceTargetCount ?? scopeOrganizationFacts.shared_basement_service_target_count)
  const scopeSharedScopeServiceTargetCount = readCount(scopeOrganizationFacts.sharedScopeServiceTargetCount ?? scopeOrganizationFacts.shared_scope_service_target_count)
  const scopeSharedBasementServiceTargetKindCounts = readRecord(
    scopeOrganizationFacts.sharedBasementServiceTargetKindCounts ?? scopeOrganizationFacts.shared_basement_service_target_kind_counts,
  )
  const scopeSharedScopeServiceTargetKindCounts = readRecord(
    scopeOrganizationFacts.sharedScopeServiceTargetKindCounts ?? scopeOrganizationFacts.shared_scope_service_target_kind_counts,
  )
  const scopeSharedBasementBuildingServiceTargetCount = readCount(scopeSharedBasementServiceTargetKindCounts.building)
  const scopeSharedScopeIndependentZoneServiceTargetCount = readCount(
    scopeSharedScopeServiceTargetKindCounts.independent_engineering_zone
      ?? scopeSharedScopeServiceTargetKindCounts.independent_zone,
  )
  const foundationDepthM = readOptionalNumber(input.foundationDepthM)
  const basementLevelCount = readOptionalNumber(input.basementLevelCount)
  const basementAreaM2 = readOptionalNumber(input.basementAreaM2)
  const buildingCount = readOptionalNumber(input.buildingCount)
  const totalAreaM2 = readOptionalNumber(input.totalAreaM2)
  const aboveGroundAreaM2 = readOptionalNumber(input.aboveGroundAreaM2)
  const siteAreaM2 = readOptionalNumber(input.siteAreaM2)
  const standardFloorCount = readOptionalNumber(input.standardFloorCount)
  const highestBuildingFloorCount = readOptionalNumber(input.highestBuildingFloorCount)
  const prefabRate = readOptionalNumber(input.prefabRate)
  const maxSpanM = readOptionalNumber(input.maxSpanM)
  const supportHeightM = readOptionalNumber(input.supportHeightM)
  const hasCivilDefense = readBoolean(input.hasCivilDefense)
  const towerCraneCount = readOptionalNumber(input.towerCraneCount)
  const constructionHoistCount = readOptionalNumber(input.constructionHoistCount)
  const onboardingMode = normalizeId(input.onboardingMode)
  const onboardingSubstage = normalizeId(input.onboardingSubstage)
  const onboardingPassedMilestones = readCodeArray(input.onboardingPassedMilestones)
  const onboardingPhaseProgress = readRecord(input.onboardingPhaseProgress)
  const startingLineDecisionLocked = hasStartingLinePassedFoundationOrBasementMilestone(onboardingPassedMilestones)
    || hasStartingLineFoundationOrBasementProgressLock(onboardingPhaseProgress)
  const startingLineEvidenceBasis = [
    onboardingPassedMilestones.length > 0 ? 'starting_line_passed_milestones_present' : null,
    Object.keys(onboardingPhaseProgress).length > 0 ? 'starting_line_phase_progress_present' : null,
    startingLineDecisionLocked ? 'starting_line_passed_foundation_or_basement_milestone' : null,
  ].filter((item): item is string => Boolean(item))

  const effectiveMethodVariantCodes = [...new Set([...methodVariantCodes, ...expandedFoundationMethodCodes])]
  const combinedMethodCodes = [...effectiveMethodVariantCodes, ...prefabSystemCodes, ...elementVariantCodes]
  const combinedUsageCodes = [
    ...functionalUsageCodes,
    ...floorUsageCodes,
    ...functionalCategoryCodes,
    ...specialRoomTypeCodes,
    ...physicalZoneTypeCodes,
  ]
  const hasPileFoundation = hasAny(combinedMethodCodes, ['pile'])
  const hasVerticalSupport = hasAny(effectiveMethodVariantCodes, ['vertical_retaining', 'retaining_support', 'diaphragm_wall', 'soldier_pile'])
  const hasHorizontalSupport = hasAny(effectiveMethodVariantCodes, ['horizontal_strut', 'internal_strut', 'bracing', 'anchor'])
    && !hasAny(effectiveMethodVariantCodes, ['no_horizontal_strut', 'without_horizontal'])
  const explicitlyNoHorizontalSupport = hasAny(effectiveMethodVariantCodes, ['no_horizontal_strut', 'without_horizontal', 'vertical_only'])
  const deepPit = (foundationDepthM ?? 0) >= 5 || (basementLevelCount ?? 0) >= 2
  const rainyEarthwork = hasAny([...climateSignals, ...weatherImpactBands], ['rain', 'plum_rain', 'monsoon', 'earthwork_rain'])
  const structureTypeCode = normalizeId(input.structureTypeCode)
  const normalizedBusinessType = normalizeId(input.businessType)
  const normalizedProjectTypeCode = normalizeId(input.projectTypeCode)
  const projectOrganizationPolicy = buildProjectPolicyBasis({
    businessType: normalizedBusinessType,
    projectTypeCode: normalizedProjectTypeCode,
    selectionContext: input,
  })
  const projectOrganizationScheme = buildProjectOrganizationScheme(projectOrganizationPolicy)
  const policyRecommendationBasis = buildPolicyRecommendationBasis(projectOrganizationPolicy)
  const businessSubtype = normalizeId(input.businessSubtype)
  const planScopeCaliber = normalizeId(input.planScopeCaliber)
  const deliveryStandard = normalizeId(input.deliveryStandard)
  const terminalEvent = normalizeId(input.terminalEvent)
  const highRise = (highestBuildingFloorCount ?? standardFloorCount ?? 0) >= 18
  const ultraTall = (highestBuildingFloorCount ?? standardFloorCount ?? 0) >= 45
  const largeBasement = (basementAreaM2 ?? 0) >= 20000
  const broadSite = (siteAreaM2 ?? 0) >= 50000
  const largeProjectScale = (totalAreaM2 ?? 0) >= 120000 || (aboveGroundAreaM2 ?? 0) >= 90000
  const prefabOrSteel = (prefabRate ?? 0) >= 0.3
    || hasAny(combinedMethodCodes, ['prefab', 'pc', 'mic', 'modular', 'steel'])
    || ['steel', 'steel_structure', 'modular'].includes(structureTypeCode)
  const complexPublicUse = hasAny(combinedUsageCodes, [
    'hospital',
    'hotel',
    'cleanroom',
    'data_center',
    'transport',
    'tod',
    'mall',
    'commercial',
    'production',
  ]) || hasAny([businessSubtype], ['hospital', 'hotel', 'cleanroom', 'data_center', 'transport'])
  const externalInterfaceConstraint = hasAny(externalInterfaceCodes, [
    'metro_operation_interface',
    'operating_rail_interface',
    'heritage_protection_interface',
    'high_voltage_corridor',
  ])
  const nonStopOrOccupiedConstraint = hasAny(hardConstraintCodes, [
    'non_stop_operation',
    'occupied_renovation',
    'operating_facility',
  ])
  const scopeOutdoorSite = scopeOutdoorSiteObjectCount > 0 || hasAny(scopeOrganizationSignals, ['outdoor_site_scope_present'])
  const scopeSharedBasement = scopeSharedBasementObjectCount > 0
    || scopeSharedBasementServiceTargetCount >= 2
    || scopeSharedBasementBuildingServiceTargetCount >= 2
    || hasAny(scopeOrganizationSignals, ['shared_basement_service_range'])
  const scopeSharedPodium = scopeSharedPodiumObjectCount > 0
    || scopeSharedScopeServiceTargetCount >= 2
    || hasAny(scopeOrganizationSignals, ['shared_podium_service_range'])
  const scopeSharedBasementAcrossBuildings = scopeSharedBasementBuildingServiceTargetCount >= 2
    || hasAny(scopeOrganizationSignals, ['shared_basement_serves_multiple_buildings'])
  const scopeSharedScopeServesIndependentEngineeringZone = scopeSharedScopeIndependentZoneServiceTargetCount > 0
    || hasAny(scopeOrganizationSignals, ['shared_scope_serves_independent_engineering_zone'])
  const scopeMultiBuilding = scopeBuildingObjectCount >= 2
    || scopeSharedBasementAcrossBuildings
    || hasAny(scopeOrganizationSignals, ['multi_building_scope_objects'])
  const outdoorOrSiteInterface = hasAny(physicalZoneTypeCodes, ['outdoor', 'site', 'municipal', 'road', 'landscape'])
    || scopeOutdoorSite
    || broadSite
  const highRiskTemporaryWorks = (supportHeightM ?? 0) >= 8 || (maxSpanM ?? 0) >= 18
  const sharedBasement = (basementLevelCount ?? 0) > 0
    || (basementAreaM2 ?? 0) > 0
    || hasCivilDefense === true
    || scopeSharedBasement
    || scopeSharedPodium
    || hasAny(buildingPatternCodes, ['shared', 'podium', 'basement', 'multi_tower'])
  const multiBuilding = (buildingCount ?? 0) >= 2 || scopeMultiBuilding || hasAny(buildingPatternCodes, ['multi_tower', 'cluster'])
  const noHorizontalDeepRain = hasPileFoundation && deepPit && rainyEarthwork && (explicitlyNoHorizontalSupport || (hasVerticalSupport && !hasHorizontalSupport))

  const pileBeforeReasons = [
    ...policyRecommendationBasis,
    hasPileFoundation ? 'pile_foundation_fact_present' : 'pile_foundation_not_declared',
    deepPit ? 'deep_pit_or_multi_basement' : 'shallow_foundation_context',
    rainyEarthwork ? 'rainy_or_earthwork_sensitive_weather' : 'weather_not_earthwork_sensitive',
  ]
  const excavationBeforeReasons = [
    ...policyRecommendationBasis,
    'alternative_foundation_sequence_candidate',
    hasHorizontalSupport ? 'horizontal_support_may_allow_excavation_first' : 'horizontal_support_not_confirmed',
  ]
  const basementFirstReasons = [
    ...policyRecommendationBasis,
    sharedBasement ? 'shared_basement_or_podium_fact_present' : 'shared_basement_not_declared',
    multiBuilding ? 'multi_building_lane_network_required' : 'single_building_context',
    scopeSharedBasement ? 'wizard_scope_shared_basement_service_range' : 'wizard_scope_shared_basement_not_declared',
    scopeSharedBasementAcrossBuildings ? 'wizard_shared_basement_serves_multiple_buildings' : 'wizard_shared_basement_target_kind_not_declared',
    scopeSharedPodium ? 'wizard_scope_shared_podium_service_range' : 'wizard_scope_shared_podium_not_declared',
    hasCivilDefense ? 'civil_defense_basement_gate_present' : 'civil_defense_gate_not_declared',
    largeBasement ? 'large_basement_area_requires_integrated_release' : 'basement_area_not_large',
  ]
  const towerEarlyReasons = [
    ...policyRecommendationBasis,
    'alternative_basement_tower_release_candidate',
    sharedBasement ? 'shared_basement_interface_gate_required' : 'no_shared_basement_gate',
    scopeSharedBasement || scopeSharedPodium ? 'wizard_scope_shared_work_gate_requires_evidence' : 'wizard_scope_shared_work_gate_not_declared',
    scopeSharedScopeServesIndependentEngineeringZone ? 'wizard_shared_scope_serves_independent_engineering_zone' : 'wizard_shared_scope_independent_zone_not_declared',
    highRise ? 'high_rise_vertical_lane_value_present' : 'high_rise_lane_value_not_declared',
    prefabOrSteel ? 'prefab_or_steel_method_supports_lane_release' : 'cast_in_place_default_lane_release',
    externalInterfaceConstraint ? 'external_interface_requires_lane_release_review' : 'external_interface_not_declared',
    nonStopOrOccupiedConstraint ? 'non_stop_or_occupied_workface_isolation_required' : 'hard_operation_constraint_not_declared',
  ]
  const outdoorEarlyReasons = [
    ...policyRecommendationBasis,
    'alternative_outdoor_site_release_candidate',
    outdoorOrSiteInterface ? 'outdoor_or_site_scope_fact_present' : 'outdoor_or_site_scope_not_declared',
    scopeOutdoorSite ? 'wizard_scope_outdoor_site_present' : 'wizard_scope_outdoor_site_not_declared',
    broadSite ? 'broad_site_requires_outdoor_interface_planning' : 'site_area_not_large',
    sharedBasement ? 'basement_backfill_interface_before_outdoor_site' : 'no_basement_backfill_gate',
    multiBuilding ? 'multi_building_outdoor_logistics_interface' : 'single_building_outdoor_interface',
  ]
  const outdoorLateReasons = [
    ...policyRecommendationBasis,
    'alternative_outdoor_site_after_primary_structure_candidate',
    outdoorOrSiteInterface ? 'outdoor_or_site_scope_fact_present' : 'outdoor_or_site_scope_not_declared',
    'keeps_outdoor_site_after_primary_structure_release',
    nonStopOrOccupiedConstraint ? 'operation_constraint_may_delay_outdoor_site_release' : 'hard_operation_constraint_not_declared',
  ]

  const pileBeforeScore = 50
    + (hasPileFoundation ? 20 : -20)
    + (deepPit ? 10 : 0)
    + (rainyEarthwork ? 10 : 0)
    + (!hasHorizontalSupport ? 5 : 0)
    + (hasCivilDefense ? 4 : 0)
    + (largeBasement ? 4 : 0)
  const excavationBeforeScore = 50
    + (hasPileFoundation ? 5 : 0)
    + (hasHorizontalSupport ? 15 : -5)
    - (noHorizontalDeepRain ? 35 : 0)
    - (hasCivilDefense ? 6 : 0)
    - (largeBasement && rainyEarthwork ? 8 : 0)
  const basementFirstScore = 50
    + (sharedBasement ? 20 : -10)
    + (multiBuilding ? 8 : 0)
    + (deepPit ? 5 : 0)
    + (hasCivilDefense ? 8 : 0)
    + (largeBasement ? 8 : 0)
    + (outdoorOrSiteInterface ? 4 : 0)
    + (complexPublicUse ? 4 : 0)
  const towerEarlyScore = 50
    + (multiBuilding ? 10 : 0)
    + (sharedBasement ? 5 : 0)
    + (highRise ? 10 : 0)
    + (ultraTall ? 5 : 0)
    + (prefabOrSteel ? 7 : 0)
    + (largeProjectScale ? 4 : 0)
    + (externalInterfaceConstraint ? 3 : 0)
    + (nonStopOrOccupiedConstraint ? 4 : 0)
    - (deepPit && rainyEarthwork ? 8 : 0)
    - (hasCivilDefense ? 4 : 0)
    - (highRiskTemporaryWorks ? 4 : 0)
  const outdoorEarlyScore = 48
    + (outdoorOrSiteInterface ? 20 : -20)
    + (scopeOutdoorSite ? 16 : 0)
    + (broadSite ? 8 : 0)
    + (multiBuilding ? 6 : 0)
    + (sharedBasement ? 6 : 0)
    - (deepPit && rainyEarthwork ? 6 : 0)
    - (nonStopOrOccupiedConstraint ? 4 : 0)
  const outdoorLateScore = 50
    + (outdoorOrSiteInterface ? 10 : -20)
    + (nonStopOrOccupiedConstraint ? 8 : 0)
    + (deepPit && rainyEarthwork ? 6 : 0)
    + (highRiskTemporaryWorks ? 4 : 0)

  const foundationRecommendation: ConstructionOrganizationScenarioId = excavationBeforeScore > pileBeforeScore
    ? 'excavation_before_pile'
    : 'pile_before_excavation'
  const towerEarlyNetwork = buildVirtualNetwork('tower_lane_early_release_after_core_basement', deepPit, sharedBasement, multiBuilding)
  const basementFirstNetwork = buildVirtualNetwork('shared_basement_first_then_tower', deepPit, sharedBasement, multiBuilding)
  const scopeSharedWorkGate = scopeSharedBasement || scopeSharedPodium || scopeSharedBasementServiceTargetCount >= 2
  const towerEarlyCompositeScore = towerEarlyScore
    + readVirtualNetworkSpanAdvantage(towerEarlyNetwork.totalSpanDays, basementFirstNetwork.totalSpanDays)
    - (deepPit && rainyEarthwork ? 24 : 0)
    - (scopeSharedWorkGate && !highRise && !prefabOrSteel ? 10 : 0)
  const basementFirstCompositeScore = basementFirstScore
    + readVirtualNetworkSpanAdvantage(basementFirstNetwork.totalSpanDays, towerEarlyNetwork.totalSpanDays)
    + (deepPit && rainyEarthwork ? 12 : 0)
    + (scopeSharedWorkGate ? 36 : 0)
  const releaseRecommendation: ConstructionOrganizationScenarioId = towerEarlyCompositeScore > basementFirstCompositeScore
    ? 'tower_lane_early_release_after_core_basement'
    : 'shared_basement_first_then_tower'
  const hasOutdoorSiteReleaseChoice = outdoorOrSiteInterface || scopeOutdoorSite || broadSite
  const outdoorEarlyNetwork = buildVirtualNetwork('outdoor_site_early_release_after_basement_backfill', deepPit, sharedBasement, multiBuilding)
  const outdoorLateNetwork = buildVirtualNetwork('outdoor_site_after_primary_structure', deepPit, sharedBasement, multiBuilding)
  const outdoorEarlyCompositeScore = outdoorEarlyScore
    + readVirtualNetworkSpanAdvantage(outdoorEarlyNetwork.totalSpanDays, outdoorLateNetwork.totalSpanDays)
  const outdoorLateCompositeScore = outdoorLateScore
    + readVirtualNetworkSpanAdvantage(outdoorLateNetwork.totalSpanDays, outdoorEarlyNetwork.totalSpanDays)
  const outdoorRecommendation: ConstructionOrganizationScenarioId = outdoorEarlyCompositeScore >= outdoorLateCompositeScore
    ? 'outdoor_site_early_release_after_basement_backfill'
    : 'outdoor_site_after_primary_structure'

  const candidates = [
    buildCandidate({
      scenarioId: 'pile_before_excavation',
      category: 'foundation_sequence',
      label: 'pile before excavation',
      score: clamp(pileBeforeScore, 0, 100),
      recommended: foundationRecommendation === 'pile_before_excavation',
      selectionReasons: pileBeforeReasons,
      dependencyIntents: ['pile_before_earthwork_bulk_excavation', 'pile_acceptance_before_pit_bottom_release'],
      releasePolicy: 'foundation_sequence_virtual_network',
      virtualNetwork: buildVirtualNetwork('pile_before_excavation', deepPit, sharedBasement, multiBuilding),
    }),
    buildCandidate({
      scenarioId: 'excavation_before_pile',
      category: 'foundation_sequence',
      label: 'excavation before pile',
      score: clamp(excavationBeforeScore, 0, 100),
      recommended: foundationRecommendation === 'excavation_before_pile',
      rejectionReasons: noHorizontalDeepRain ? ['rainy_deep_pit_without_horizontal_support'] : [],
      selectionReasons: excavationBeforeReasons,
      dependencyIntents: ['bulk_excavation_before_pile_platform', 'pit_support_acceptance_before_pile_work'],
      releasePolicy: 'foundation_sequence_virtual_network',
      virtualNetwork: buildVirtualNetwork('excavation_before_pile', deepPit, sharedBasement, multiBuilding),
    }),
    buildCandidate({
      scenarioId: 'tower_lane_early_release_after_core_basement',
      category: 'basement_tower_release',
      label: 'tower lane early release after core basement',
      score: clamp(towerEarlyCompositeScore, 0, 100),
      recommended: releaseRecommendation === 'tower_lane_early_release_after_core_basement',
      selectionReasons: towerEarlyReasons,
      dependencyIntents: ['core_basement_release_before_tower_lane_start', 'tower_lane_staggered_release'],
      releasePolicy: 'staggered_tower_lane_release_virtual_network',
      virtualNetwork: towerEarlyNetwork,
    }),
    buildCandidate({
      scenarioId: 'shared_basement_first_then_tower',
      category: 'basement_tower_release',
      label: 'whole shared basement first then tower',
      score: clamp(basementFirstCompositeScore, 0, 100),
      recommended: releaseRecommendation === 'shared_basement_first_then_tower',
      selectionReasons: basementFirstReasons,
      dependencyIntents: ['shared_basement_structure_before_tower_full_release', 'basement_interface_gate_before_tower_lane'],
      releasePolicy: 'shared_basement_first_virtual_network',
      virtualNetwork: basementFirstNetwork,
    }),
    ...(hasOutdoorSiteReleaseChoice ? [
      buildCandidate({
        scenarioId: 'outdoor_site_early_release_after_basement_backfill',
        category: 'outdoor_site_release',
        label: 'outdoor site early release after basement backfill',
        score: clamp(outdoorEarlyCompositeScore, 0, 100),
        recommended: outdoorRecommendation === 'outdoor_site_early_release_after_basement_backfill',
        selectionReasons: outdoorEarlyReasons,
        dependencyIntents: ['basement_backfill_release_before_outdoor_site_start', 'outdoor_site_completion_before_handoff'],
        releasePolicy: 'outdoor_site_early_release_virtual_network',
        virtualNetwork: outdoorEarlyNetwork,
      }),
      buildCandidate({
        scenarioId: 'outdoor_site_after_primary_structure',
        category: 'outdoor_site_release',
        label: 'outdoor site after primary structure',
        score: clamp(outdoorLateCompositeScore, 0, 100),
        recommended: outdoorRecommendation === 'outdoor_site_after_primary_structure',
        selectionReasons: outdoorLateReasons,
        dependencyIntents: ['primary_structure_release_before_outdoor_site_start', 'outdoor_site_completion_before_handoff'],
        releasePolicy: 'outdoor_site_after_primary_structure_virtual_network',
        virtualNetwork: outdoorLateNetwork,
      }),
    ] : []),
  ]

  const factSignalCount = [
    hasPileFoundation,
    deepPit,
    rainyEarthwork,
    sharedBasement,
    multiBuilding,
    highRise,
    largeProjectScale,
    hasCivilDefense,
    prefabOrSteel,
    complexPublicUse,
    externalInterfaceConstraint,
    nonStopOrOccupiedConstraint,
    scopeSharedBasement,
    scopeSharedBasementAcrossBuildings,
    scopeSharedPodium,
    scopeSharedScopeServesIndependentEngineeringZone,
    scopeOutdoorSite,
    scopeMultiBuilding,
    foundationDepthM !== null,
    basementLevelCount !== null,
  ].filter(Boolean).length
  const confidence = factSignalCount >= 5 ? 'high' : factSignalCount >= 3 ? 'medium' : 'low'
  const factBasis = {
    usesExistingWizardFactsOnly: true,
    businessSubtype: businessSubtype || null,
    businessType: normalizedBusinessType || null,
    projectTypeCode: normalizedProjectTypeCode || null,
    projectOrganizationPolicy,
    structureTypeCode: structureTypeCode || null,
    planScopeCaliber: planScopeCaliber || null,
    deliveryStandard: deliveryStandard || null,
    terminalEvent: terminalEvent || null,
    methodVariantCodes: effectiveMethodVariantCodes,
    prefabSystemCodes,
    elementVariantCodes,
    externalInterfaceCodes,
    hardConstraintCodes,
    projectFeatures,
    detailLevel: detailLevel || null,
    buildingPatternCodes,
    functionalUsageCodes,
    floorUsageCodes,
    functionalCategoryCodes,
    specialRoomTypeCodes,
    physicalZoneTypeCodes,
    buildingCount,
    totalAreaM2,
    aboveGroundAreaM2,
    basementLevelCount,
    basementAreaM2,
    siteAreaM2,
    foundationDepthM,
    standardFloorCount,
    highestBuildingFloorCount,
    prefabRate,
    maxSpanM,
    supportHeightM,
    hasCivilDefense,
    climateSignals,
    weatherImpactBands,
    locationFacts,
    scopeOrganizationFacts,
    towerCraneCount,
    constructionHoistCount,
    onboardingMode: onboardingMode || null,
    onboardingSubstage: onboardingSubstage || null,
    onboardingPassedMilestones,
    onboardingPhaseProgress,
    derivedOrganizationSignals: {
      highRise,
      ultraTall,
      largeBasement,
      largeProjectScale,
      prefabOrSteel,
      complexPublicUse,
      externalInterfaceConstraint,
      nonStopOrOccupiedConstraint,
      outdoorOrSiteInterface,
      highRiskTemporaryWorks,
      scopeSharedBasement,
      scopeSharedBasementAcrossBuildings,
      scopeSharedPodium,
      scopeSharedScopeServesIndependentEngineeringZone,
      scopeOutdoorSite,
      scopeMultiBuilding,
    },
    resourceRole: 'sidecar_feasibility_signal',
  }
  const rawPlanOptions = buildPlanOptions({
    candidates,
    confidence,
    projectOrganizationScheme,
  })
  const rawRecommendedPlanOption = rawPlanOptions[0] ?? buildPlanOption({
    selectedCandidates: candidates.filter((candidate) => candidate.feasibility === 'recommended'),
    allCandidates: candidates,
    confidence,
    projectOrganizationScheme,
  })
  const selectableRawPlanOptions = rawPlanOptions.length > 0 ? rawPlanOptions : [rawRecommendedPlanOption]
  const rawStartingLineSelection = selectStartingLineOnboardingOption({
    planOptions: selectableRawPlanOptions,
    recommendedPlanOption: rawRecommendedPlanOption,
    onboardingPhaseProgress,
  })
  const factCoverage = buildFactCoverage(factBasis)
  const startingLineFactCoverage = buildFactCoverage(factBasis, { includeStartingLineFacts: true })
  const evaluatedOptions = attachPlanOptionUseCaseEvaluations({
    planOptions: selectableRawPlanOptions,
    recommendedPlanOption: rawRecommendedPlanOption,
    startingLineOption: rawStartingLineSelection.option,
    startingLineOptionBasis: rawStartingLineSelection.recommendationBasis,
    factCoverage,
    startingLineFactCoverage,
    onboardingMode,
    onboardingSubstage,
    startingLineEvidenceBasis,
    startingLineDecisionLocked,
  })
  const planOptions = rawPlanOptions.length > 0 ? evaluatedOptions.planOptions : []
  const recommendedPlanOption = evaluatedOptions.recommendedPlanOption
  const recommendedScenarioIds = recommendedPlanOption.selectedScenarioIds
  const scenarioRecommendations = buildScenarioRecommendations({
    planOptions: planOptions.length > 0 ? planOptions : [recommendedPlanOption],
    recommendedPlanOption,
    confidence,
    policyRecommendationBasis,
    onboardingMode,
    onboardingSubstage,
    onboardingPhaseProgress,
    startingLineEvidenceBasis,
    startingLineDecisionLocked,
  })
  const planOptionComparisonPackage = buildPlanOptionComparisonPackage({
    planOptions,
    recommendedPlanOption,
    scenarioRecommendations,
  })
  const organizationDecisionReport = buildConstructionOrganizationDecisionReport({
    planOptions: planOptions.length > 0 ? planOptions : [recommendedPlanOption],
    recommendedPlanOption,
    scenarioRecommendations,
    factCoverage,
    startingLineFactCoverage,
    candidateCount: candidates.length,
  })

  return {
    source: 'construction_organization_scenario_selector',
    sourceVersion: CONSTRUCTION_ORGANIZATION_SCENARIO_SELECTOR_VERSION,
    recommendedScenarioIds,
    recommendedPlanOption,
    planOptions,
    planOptionComparisonPackage,
    organizationDecisionReport,
    scenarioRecommendations,
    confidence,
    frontendInputRequired: false,
    boundaryPolicy: {
      directSeedMutation: false,
      resourcePolicy: CONSTRUCTION_ORGANIZATION_RESOURCE_POLICY,
      virtualNetworkPolicy: 'scenario_candidates_are_evaluated_as_virtual_networks_before_any_write',
    },
    candidates,
    factBasis,
  }
}
