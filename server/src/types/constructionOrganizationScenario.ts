export type ConstructionOrganizationPlanOptionComparisonUseCaseKey =
  | 'newProjectPlanning'
  | 'startingLineOnboarding'
  | 'accelerationRecovery'

export type ConstructionOrganizationScenarioSelectorInput = {
  businessType?: string | null
  businessSubtype?: string | null
  projectTypeCode?: string | null
  structureTypeCode?: string | null
  methodVariantCodes?: string[]
  buildingPatternCodes?: string[]
  functionalUsageCodes?: string[]
  functionalCategoryCodes?: string[]
  specialRoomTypeCodes?: string[]
  physicalZoneTypeCodes?: string[]
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
  climateSignals?: string[]
  weatherImpactBands?: string[]
  locationFacts?: Record<string, unknown>
  scopeOrganizationFacts?: Record<string, unknown>
  externalInterfaceCodes?: string[]
  hardConstraintCodes?: string[]
  [key: string]: unknown
}

export type ConstructionOrganizationUseCase =
  | 'new_project_planning'
  | 'starting_line_onboarding'
  | 'acceleration_recovery'

export type ConstructionOrganizationUseCaseRecommendation = {
  useCase: ConstructionOrganizationUseCase
  optionId: string
  selectedScenarioIds: string[]
  recommendationBasis: string[]
  confidence: 'high' | 'medium' | 'low'
  actionability: 'actionable_candidate' | 'evidence_only' | 'not_actionable_after_current_phase'
  currentSubstage?: string | null
  recoveryFactorHint: number
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
}

export type ConstructionOrganizationPlanOptionComparisonItem = {
  optionId: string
  useCaseScores: Record<
    ConstructionOrganizationPlanOptionComparisonUseCaseKey,
    {
      optionScore?: number | null
      rankBasis?: string[]
      actionability?: ConstructionOrganizationUseCaseRecommendation['actionability'] | string | null
      [key: string]: unknown
    } | undefined
  >
  systemRecommendationBasis?: {
    e1: {
      matchedReferenceRowCount: number
      totalRecommendedDurationDays: number | null
      [key: string]: unknown
    }
    e3: {
      previewEdgeCount: number
      unresolvedEdgeCount: number
      criticalNodeCount: number
      [key: string]: unknown
    }
    e5: {
      e5RecoverableSpanDays: number
      recoveryFactorHint: number
      [key: string]: unknown
    }
    boundaryPolicy: {
      candidateOnly: true
      readOnlyRecommendation: true
      writesTaskDependencies: false
      writesPlanDates: false
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type ConstructionOrganizationPlanOptionComparisonPackage = {
  source?: string
  totalOptionCount: number
  recommendedOptionIdsByUseCase: Record<
    ConstructionOrganizationPlanOptionComparisonUseCaseKey,
    string | null | undefined
  >
  options: ConstructionOrganizationPlanOptionComparisonItem[]
  [key: string]: unknown
}

export type ConstructionOrganizationPlanOption = {
  optionId: string
  source?: 'construction_organization_plan_option'
  selectedScenarioIds: string[]
  projectOrganizationScheme?: unknown
  combinedScore: number
  confidence: 'high' | 'medium' | 'low'
  selectionReasons?: string[]
  excludedScenarioIds: string[]
  excludedReasons: Array<{
    scenarioId: string
    reasons: string[]
  }>
  combinedVirtualNetwork: {
    totalSpanDays: number
    criticalNodeIds: string[]
    nodes?: unknown[]
    dependencies?: unknown[]
    [key: string]: unknown
  }
  evaluation: {
    networkEvaluation: {
      evaluationRole: string
      e3NetworkBasis: string
      projectDurationDays: number
      criticalNodeIds: string[]
      edgeCount: number
      e5RecoverableSpanDays: number
      writesTaskDependencies: false
      writesPlanDates: false
      writesCriticalPathFacts: false
      [key: string]: unknown
    }
    engineEvaluationSummary: {
      source: string
      evaluationRole: string
      e1: unknown
      e3: unknown
      e5: unknown
      projectOrganization: unknown
      boundary: unknown
      [key: string]: unknown
    }
    generatedRowProjection?: {
      source?: string
      projectionBasis?: string
      generatedScheduleSpanDays?: number
      virtualProjectDurationDays?: number
      spanDeltaDays?: number
      dependencyAlignmentScore?: number
      projectionConfidence?: 'high' | 'medium' | 'low'
      mappedNodeCount?: number
      generatedRowMatchCount?: number
      unmappedNodeIds?: string[]
      candidateDependencyPreview?: {
        source?: string
        previewBasis?: string
        materializationReadiness?: unknown
        previewEdges: unknown[]
        unresolvedEdges: unknown[]
        writesTaskDependencies: false
        writesPlanDates: false
        writesCriticalPathFacts: false
        [key: string]: unknown
      } | null
      candidateMaterializationEvaluation?: {
        source?: string
        materializationBasis?: string
        previewEdgeCount?: number
        satisfiedEdgeCount?: number
        violatedEdgeCount?: number
        unresolvedEdgeCount?: number
        materializedNetworkSpanDays?: number
        materializationScore?: number
        violationDetails?: unknown[]
        writesTaskDependencies: false
        writesPlanDates: false
        writesCriticalPathFacts: false
        [key: string]: unknown
      } | null
      materializationDecision?: {
        source?: string
        decision?: string
        allowManualMaterialization?: boolean
        reasons?: string[]
        writesTaskDependencies: false
        writesPlanDates: false
        writesCriticalPathFacts: false
        [key: string]: unknown
      } | null
      materializationReviewPackage?: {
        source?: string
        packageBasis?: string
        optionId?: string
        status?: string
        allowManualReview?: boolean
        proposedDependencyEdgeCount?: number
        blockedReasons?: string[]
        proposedDependencyEdges?: unknown[]
        conflictEvidence?: unknown[]
        reviewRequired?: true
        writesTaskDependencies: false
        writesPlanDates: false
        writesCriticalPathFacts: false
        [key: string]: unknown
      } | null
      generatedRowReferenceDurationEvidence?: {
        source?: string
        durationBasis?: string
        matchedReferenceRowCount: number
        totalPlanReferenceDays: number | null
        totalContextualReferenceDays: number | null
        totalRecommendedDurationDays: number | null
        phaseDurations?: unknown[]
        writesReferenceDuration: false
        writesPlanDates: false
        writesSeed: false
        [key: string]: unknown
      } | null
      generatedRowNetworkEvaluation?: {
        source?: string
        networkBasis?: string
        projectedNetworkSpanDays: number
        previewEdgeCount: number
        unresolvedEdgeCount: number
        criticalGeneratedRowIds: string[]
        materializationStatus?: string
        rowSchedule?: unknown[]
        writesTaskDependencies: false
        writesPlanDates: false
        writesCriticalPathFacts: false
        [key: string]: unknown
      } | null
      phaseCoverage?: unknown[]
      gapReasons?: string[]
      writesTaskDependencies: false
      writesPlanDates: false
      writesCriticalPathFacts: false
      [key: string]: unknown
    } | null
    useCaseEvaluations?: Record<
      ConstructionOrganizationPlanOptionComparisonUseCaseKey,
      {
        optionScore: number
        rankBasis: string[]
        actionability: ConstructionOrganizationUseCaseRecommendation['actionability']
        currentSubstage?: string | null
        recoveryFactorHint: number
        e5RecoverableSpanDays: number
        factCoverage: unknown
        writesTaskDependencies: false
        writesPlanDates: false
        writesSeed: false
        [key: string]: unknown
      }
    >
    recoveryFactorHint: number
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type ConstructionOrganizationScenarioSelection = {
  source: 'construction_organization_scenario_selector'
  sourceVersion: string
  recommendedScenarioIds: string[]
  recommendedPlanOption: ConstructionOrganizationPlanOption
  planOptions: ConstructionOrganizationPlanOption[]
  planOptionComparisonPackage: ConstructionOrganizationPlanOptionComparisonPackage
  organizationDecisionReport?: unknown
  scenarioRecommendations: Record<
    ConstructionOrganizationPlanOptionComparisonUseCaseKey,
    ConstructionOrganizationUseCaseRecommendation
  >
  planNetworkDraftRecommendations?: Record<
    ConstructionOrganizationPlanOptionComparisonUseCaseKey,
    unknown
  >
  confidence: 'high' | 'medium' | 'low'
  frontendInputRequired: false
  boundaryPolicy: {
    directSeedMutation: false
    resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver'
    virtualNetworkPolicy: 'scenario_candidates_are_evaluated_as_virtual_networks_before_any_write'
    [key: string]: unknown
  }
  candidates?: unknown[]
  factBasis: Record<string, unknown>
  [key: string]: unknown
}
