import type {
  ConstructionOrganizationPlanOptionComparisonPackage,
  ConstructionOrganizationPlanOptionComparisonUseCaseKey,
  ConstructionOrganizationScenarioSelectorInput,
} from '../types/constructionOrganizationScenario.js'
import {
  buildConstructionOrganizationSelectorInputFromProjectFacts,
  selectConstructionOrganizationScenario,
} from './constructionOrganizationScenarioSelectorEngine.js'
import type {
  ConstructionOrganizationGeneratedRowProjectionInputRow,
} from './constructionOrganizationPlanOptionProjectionService.js'
import {
  projectConstructionOrganizationSelectionToGeneratedRows,
} from './constructionOrganizationPlanOptionProjectionService.js'
import {
  resolveProjectConstructionOrganizationPolicy,
} from '../seeds/projectConstructionOrganizationPolicySeed.js'

export const CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_MATRIX_VERSION = 'v1.4.22-construction-organization-precision-replay-20260623'

export const CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES = [
  'general_civil',
  'hotel',
  'hospital',
  'school',
  'industrial',
  'data_center',
  'transportation_hub',
  'sports_culture',
  'tod_upper_cover',
  'renovation',
  'modular_building',
] as const

export type ConstructionOrganizationPrecisionReplayBusinessType =
  typeof CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES[number]

const AUTOMATIC_OPTION_SELECTION_USE_CASES = [
  'newProjectPlanning',
  'startingLineOnboarding',
  'accelerationRecovery',
] as const satisfies ConstructionOrganizationPlanOptionComparisonUseCaseKey[]

export type ConstructionOrganizationAutomaticOptionSelectionUseCaseProof = {
  source: 'construction_organization_automatic_option_selection_proof'
  useCase: ConstructionOrganizationPlanOptionComparisonUseCaseKey
  status: 'verified' | 'mismatch'
  selectedOptionId: string | null
  bestOptionId: string | null
  candidateCount: number
  selectedScore: number | null
  bestScore: number | null
  selectedActionability: string | null
  bestActionability: string | null
  rankBasis: string[]
  tiePolicy: 'first_highest_score_after_projection'
  mismatchReasons: string[]
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
  }
}

export type ConstructionOrganizationAutomaticOptionSelectionProof = {
  source: 'construction_organization_automatic_option_selection_summary'
  status: 'automatic_option_selection_verified' | 'automatic_option_selection_mismatch'
  useCases: Record<
    ConstructionOrganizationPlanOptionComparisonUseCaseKey,
    ConstructionOrganizationAutomaticOptionSelectionUseCaseProof
  >
  mismatchReasons: string[]
}

export type ConstructionOrganizationPrecisionReplayRow = {
  source: 'construction_organization_precision_replay_row'
  businessType: ConstructionOrganizationPrecisionReplayBusinessType
  status: 'precision_replay_ready' | 'precision_replay_incomplete'
  policy: {
    policyId: string
    schemeFamily: string
    strategy: string
    interfaceGateTags: string[]
    resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver'
  }
  optionCount: number
  generatedRowProjection: {
    projectedOptionCount: number
    matchedOptionCount: number
    previewEdgeCount: number
    unresolvedEdgeCount: number
    materializationDecisionCounts: Record<string, number>
  }
  recommendations: {
    newProjectPlanning: { optionId: string; selectedScenarioIds: string[] }
    startingLineOnboarding: { optionId: string; selectedScenarioIds: string[] }
    accelerationRecovery: { optionId: string; selectedScenarioIds: string[] }
  }
  engineEvidence: {
    e1: {
      matchedReferenceRowCount: number
      totalRecommendedDurationDays: number | null
      writesReferenceDuration: false
    }
    e3: {
      previewEdgeCount: number
      unresolvedEdgeCount: number
      criticalNodeCount: number
      writesTaskDependencies: false
      writesPlanDates: false
      writesCriticalPathFacts: false
    }
    e5: {
      e5RecoverableSpanDays: number
      recoveryFactorHint: number
      writesAccelerationDraft: false
    }
  }
  comparisonPackage: ConstructionOrganizationPlanOptionComparisonPackage
  automaticOptionSelectionProof: ConstructionOrganizationAutomaticOptionSelectionProof
  mutationBoundary: ConstructionOrganizationPrecisionReplayMatrix['mutationBoundary']
  missingReasons: string[]
}

export type ConstructionOrganizationPrecisionReplayMatrix = {
  source: 'construction_organization_precision_replay_matrix'
  sourceVersion: typeof CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_MATRIX_VERSION
  status: 'precision_replay_matrix_ready' | 'precision_replay_matrix_incomplete'
  supportedBusinessTypeCount: number
  replayedBusinessTypeCount: number
  businessTypes: ConstructionOrganizationPrecisionReplayRow[]
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesBaseline: false
    writesSeed: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
  }
  remainingBoundary: 'golden_precision_replay_is_candidate_projection_not_runtime_saved_outcome_or_auto_materialization'
}

const MUTATION_BOUNDARY: ConstructionOrganizationPrecisionReplayMatrix['mutationBoundary'] = {
  writesTaskDependencies: false,
  writesPlanDates: false,
  writesBaseline: false,
  writesSeed: false,
  writesCriticalPathFacts: false,
  writesAccelerationDraft: false,
}

function buildSelectorInputForBusinessType(
  businessType: ConstructionOrganizationPrecisionReplayBusinessType,
): ConstructionOrganizationScenarioSelectorInput {
  const renovation = businessType === 'renovation'
  const modular = businessType === 'modular_building'
  const transitLike = businessType === 'transportation_hub' || businessType === 'tod_upper_cover'
  return {
    businessType,
    businessSubtype: businessType,
    projectTypeCode: businessType,
    structureTypeCode: modular
      ? 'modular'
      : businessType === 'sports_culture'
        ? 'large_span_steel'
        : businessType === 'industrial'
          ? 'steel_frame'
          : 'frame_core',
    methodVariantCodes: [
      modular ? 'modular_prefab' : 'pile_foundation',
      businessType === 'industrial' || businessType === 'sports_culture' ? 'steel_frame' : 'vertical_retaining_support',
      'no_horizontal_strut',
      businessType === 'sports_culture' ? 'large_span_roof' : '',
    ].filter(Boolean),
    buildingPatternCodes: renovation ? ['cluster'] : ['multi_tower_shared_podium'],
    functionalUsageCodes: [businessType],
    functionalCategoryCodes: [
      businessType,
      businessType === 'hospital' ? 'cleanroom' : '',
      businessType === 'sports_culture' ? 'large_span_public' : '',
    ].filter(Boolean),
    specialRoomTypeCodes: businessType === 'data_center'
      ? ['computer_room', 'battery_room']
      : businessType === 'hospital'
        ? ['cleanroom', 'operating_room']
        : businessType === 'hotel'
          ? ['guestroom', 'lobby', 'kitchen']
          : [],
    physicalZoneTypeCodes: transitLike
      ? ['tower', 'basement', 'metro_interface', 'outdoor_site']
      : renovation
        ? ['renovation_zone', 'outdoor_site']
        : ['tower', 'basement', 'outdoor_site'],
    planScopeCaliber: 'full_project',
    deliveryStandard: 'completion_acceptance',
    terminalEvent: 'joint_acceptance',
    buildingCount: renovation ? 1 : 3,
    totalAreaM2: renovation ? 18000 : 120000,
    aboveGroundAreaM2: renovation ? 15000 : 90000,
    basementLevelCount: renovation ? 0 : 2,
    basementAreaM2: renovation ? 0 : 26000,
    siteAreaM2: 52000,
    foundationDepthM: renovation ? 0 : 5,
    standardFloorCount: renovation ? 5 : 24,
    highestBuildingFloorCount: renovation ? 5 : 32,
    prefabRate: modular ? 0.55 : 0.12,
    maxSpanM: businessType === 'sports_culture' ? 28 : 12,
    supportHeightM: businessType === 'hotel' ? 9 : 4,
    hasCivilDefense: !renovation,
    climateSignals: ['rainy_season'],
    weatherImpactBands: ['earthwork_rain_sensitive'],
    locationFacts: { province: 'guangdong', city: 'shenzhen' },
    scopeOrganizationFacts: {
      buildingObjectCount: renovation ? 1 : 3,
      sharedBasementObjectCount: renovation ? 0 : 1,
      sharedBasementServiceTargetCount: renovation ? 0 : 3,
      outdoorSiteObjectCount: 1,
      organizationSignals: renovation
        ? ['outdoor_site_scope_present']
        : ['multi_building_scope_objects', 'shared_basement_service_range', 'outdoor_site_scope_present'],
    },
    externalInterfaceCodes: transitLike ? ['metro_operation_interface'] : [],
    hardConstraintCodes: renovation ? ['occupied_renovation'] : transitLike ? ['non_stop_operation'] : [],
  }
}

function buildPrecisionReplayGeneratedRows(
  businessType: ConstructionOrganizationPrecisionReplayBusinessType,
): ConstructionOrganizationGeneratedRowProjectionInputRow[] {
  const label = businessType.replace(/_/g, ' ')
  return [
    {
      id: `${businessType}-pile`,
      title: `${label} pile foundation works`,
      stableCode: '01-02',
      executionPhase: 'foundation_pit_pile',
      rowProjectionMode: 'schedule_row',
      durationContributionMode: 'duration_bearing',
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-30',
      smartReferenceDays: 30,
    },
    {
      id: `${businessType}-earthwork`,
      title: `${label} bulk earthwork excavation`,
      stableCode: '01-03',
      executionPhase: 'earthwork',
      rowProjectionMode: 'schedule_row',
      durationContributionMode: 'duration_bearing',
      plannedStartDate: '2026-07-01',
      plannedEndDate: '2026-07-20',
      smartReferenceDays: 20,
    },
    {
      id: `${businessType}-basement`,
      title: `${label} shared basement structure`,
      stableCode: '01-05',
      executionPhase: 'basement_structure',
      rowProjectionMode: 'schedule_row',
      durationContributionMode: 'duration_bearing',
      plannedStartDate: '2026-07-21',
      plannedEndDate: '2026-09-20',
      smartReferenceDays: 62,
    },
    {
      id: `${businessType}-tower`,
      title: `${label} tower superstructure`,
      stableCode: '02-01',
      executionPhase: 'superstructure_rhythm',
      rowProjectionMode: 'schedule_row',
      durationContributionMode: 'duration_bearing',
      plannedStartDate: '2026-09-21',
      plannedEndDate: '2026-12-31',
      smartReferenceDays: 102,
    },
    {
      id: `${businessType}-outdoor`,
      title: `${label} outdoor site municipal road landscape works`,
      stableCode: 'OUT-01',
      executionPhase: 'outdoor_site',
      rowProjectionMode: 'schedule_row',
      durationContributionMode: 'duration_bearing',
      plannedStartDate: '2027-01-01',
      plannedEndDate: '2027-01-20',
      smartReferenceDays: 20,
    },
    {
      id: `${businessType}-handoff`,
      title: `${label} completion acceptance handoff`,
      stableCode: 'ACCEPT-01',
      executionPhase: 'acceptance_handover',
      rowProjectionMode: 'schedule_row',
      durationContributionMode: 'duration_bearing',
      plannedStartDate: '2027-01-21',
      plannedEndDate: '2027-01-28',
      smartReferenceDays: 8,
    },
  ]
}

function incrementCount(target: Record<string, number>, key: string | null | undefined) {
  const safeKey = String(key || 'unknown')
  target[safeKey] = (target[safeKey] ?? 0) + 1
}

function buildAutomaticOptionSelectionUseCaseProof(
  comparisonPackage: ConstructionOrganizationPlanOptionComparisonPackage,
  useCase: ConstructionOrganizationPlanOptionComparisonUseCaseKey,
): ConstructionOrganizationAutomaticOptionSelectionUseCaseProof {
  const selectedOptionId = comparisonPackage.recommendedOptionIdsByUseCase[useCase] ?? null
  const candidates = comparisonPackage.options.flatMap((option) => {
    const useCaseScore = option.useCaseScores[useCase]
    const score = useCaseScore?.optionScore
    if (typeof score !== 'number' || !Number.isFinite(score)) return []
    return [{
      optionId: option.optionId,
      score,
      actionability: useCaseScore?.actionability ?? null,
      rankBasis: useCaseScore?.rankBasis ?? [],
    }]
  })
  const best = candidates.reduce<typeof candidates[number] | null>((currentBest, candidate) => {
    if (!currentBest) return candidate
    return candidate.score > currentBest.score ? candidate : currentBest
  }, null)
  const selected = candidates.find((candidate) => candidate.optionId === selectedOptionId) ?? null
  const mismatchReasons = [
    candidates.length <= 0 ? `automatic_option_selection_candidates_missing:${useCase}` : null,
    !selectedOptionId ? `automatic_option_selection_selected_option_missing:${useCase}` : null,
    selectedOptionId && !selected ? `automatic_option_selection_selected_score_missing:${useCase}` : null,
    best && selectedOptionId && best.optionId !== selectedOptionId
      ? `automatic_option_selection_score_mismatch:${useCase}:${selectedOptionId}_vs_${best.optionId}`
      : null,
  ].filter((item): item is string => Boolean(item))
  const rankBasis = Array.from(new Set([
    ...(selected?.rankBasis ?? []),
    ...(best?.rankBasis ?? []),
  ]))

  return {
    source: 'construction_organization_automatic_option_selection_proof',
    useCase,
    status: mismatchReasons.length === 0 ? 'verified' : 'mismatch',
    selectedOptionId,
    bestOptionId: best?.optionId ?? null,
    candidateCount: candidates.length,
    selectedScore: selected?.score ?? null,
    bestScore: best?.score ?? null,
    selectedActionability: selected?.actionability ?? null,
    bestActionability: best?.actionability ?? null,
    rankBasis,
    tiePolicy: 'first_highest_score_after_projection',
    mismatchReasons,
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
  }
}

function buildAutomaticOptionSelectionProof(
  comparisonPackage: ConstructionOrganizationPlanOptionComparisonPackage,
): ConstructionOrganizationAutomaticOptionSelectionProof {
  const useCases = Object.fromEntries(AUTOMATIC_OPTION_SELECTION_USE_CASES.map((useCase) => [
    useCase,
    buildAutomaticOptionSelectionUseCaseProof(comparisonPackage, useCase),
  ])) as ConstructionOrganizationAutomaticOptionSelectionProof['useCases']
  const mismatchReasons = AUTOMATIC_OPTION_SELECTION_USE_CASES.flatMap((useCase) => (
    useCases[useCase].mismatchReasons
  ))

  return {
    source: 'construction_organization_automatic_option_selection_summary',
    status: mismatchReasons.length === 0
      ? 'automatic_option_selection_verified'
      : 'automatic_option_selection_mismatch',
    useCases,
    mismatchReasons,
  }
}

function buildReplayRow(
  businessType: ConstructionOrganizationPrecisionReplayBusinessType,
): ConstructionOrganizationPrecisionReplayRow {
  const policy = resolveProjectConstructionOrganizationPolicy(businessType, businessType)
  const selectorInput = buildConstructionOrganizationSelectorInputFromProjectFacts(
    buildSelectorInputForBusinessType(businessType),
  )
  const selected = selectConstructionOrganizationScenario(selectorInput)
  const projected = projectConstructionOrganizationSelectionToGeneratedRows(
    selected,
    buildPrecisionReplayGeneratedRows(businessType),
  )
  const optionCount = projected.planOptions.length
  const materializationDecisionCounts: Record<string, number> = {}
  let matchedOptionCount = 0
  let previewEdgeCount = 0
  let unresolvedEdgeCount = 0
  for (const option of projected.planOptions) {
    const projection = option.evaluation.generatedRowProjection
    if ((projection?.generatedRowMatchCount ?? 0) > 0 && (projection?.unmappedNodeIds.length ?? 1) === 0) {
      matchedOptionCount += 1
    }
    previewEdgeCount += projection?.candidateDependencyPreview?.previewEdges.length ?? 0
    unresolvedEdgeCount += projection?.candidateDependencyPreview?.unresolvedEdges.length ?? 0
    incrementCount(materializationDecisionCounts, projection?.materializationDecision?.decision)
  }
  const recommendedBasis = projected.planOptionComparisonPackage.options
    .find((option) => option.optionId === projected.recommendedPlanOption.optionId)
    ?.systemRecommendationBasis
    ?? projected.planOptionComparisonPackage.options[0]?.systemRecommendationBasis
  const automaticOptionSelectionProof = buildAutomaticOptionSelectionProof(projected.planOptionComparisonPackage)
  const missingReasons = [
    optionCount <= 0 ? 'plan_options_missing' : null,
    matchedOptionCount !== optionCount ? 'not_every_option_maps_to_generated_rows' : null,
    previewEdgeCount <= 0 ? 'candidate_dependency_preview_edges_missing' : null,
    unresolvedEdgeCount > 0 ? 'candidate_dependency_preview_has_unresolved_edges' : null,
    !recommendedBasis ? 'system_recommendation_basis_missing' : null,
    (recommendedBasis?.e1.matchedReferenceRowCount ?? 0) <= 0 ? 'e1_generated_row_reference_evidence_missing' : null,
    (recommendedBasis?.e3.previewEdgeCount ?? 0) <= 0 ? 'e3_generated_row_candidate_network_missing' : null,
    ...automaticOptionSelectionProof.mismatchReasons,
  ].filter((item): item is string => Boolean(item))

  return {
    source: 'construction_organization_precision_replay_row',
    businessType,
    status: missingReasons.length === 0 ? 'precision_replay_ready' : 'precision_replay_incomplete',
    policy: {
      policyId: policy.policyId,
      schemeFamily: policy.schemeFamily,
      strategy: policy.strategy,
      interfaceGateTags: policy.interfaceGateTags,
      resourcePolicy: policy.governance.resourcePolicy,
    },
    optionCount,
    generatedRowProjection: {
      projectedOptionCount: projected.planOptions.length,
      matchedOptionCount,
      previewEdgeCount,
      unresolvedEdgeCount,
      materializationDecisionCounts,
    },
    recommendations: {
      newProjectPlanning: {
        optionId: projected.scenarioRecommendations.newProjectPlanning.optionId,
        selectedScenarioIds: projected.scenarioRecommendations.newProjectPlanning.selectedScenarioIds,
      },
      startingLineOnboarding: {
        optionId: projected.scenarioRecommendations.startingLineOnboarding.optionId,
        selectedScenarioIds: projected.scenarioRecommendations.startingLineOnboarding.selectedScenarioIds,
      },
      accelerationRecovery: {
        optionId: projected.scenarioRecommendations.accelerationRecovery.optionId,
        selectedScenarioIds: projected.scenarioRecommendations.accelerationRecovery.selectedScenarioIds,
      },
    },
    engineEvidence: {
      e1: {
        matchedReferenceRowCount: recommendedBasis?.e1.matchedReferenceRowCount ?? 0,
        totalRecommendedDurationDays: recommendedBasis?.e1.totalRecommendedDurationDays ?? null,
        writesReferenceDuration: false,
      },
      e3: {
        previewEdgeCount: recommendedBasis?.e3.previewEdgeCount ?? 0,
        unresolvedEdgeCount: recommendedBasis?.e3.unresolvedEdgeCount ?? unresolvedEdgeCount,
        criticalNodeCount: recommendedBasis?.e3.criticalNodeCount ?? 0,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      },
      e5: {
        e5RecoverableSpanDays: recommendedBasis?.e5.e5RecoverableSpanDays ?? 0,
        recoveryFactorHint: recommendedBasis?.e5.recoveryFactorHint ?? 1,
        writesAccelerationDraft: false,
      },
    },
    comparisonPackage: projected.planOptionComparisonPackage,
    automaticOptionSelectionProof,
    mutationBoundary: MUTATION_BOUNDARY,
    missingReasons,
  }
}

export function buildConstructionOrganizationPrecisionReplayMatrix(): ConstructionOrganizationPrecisionReplayMatrix {
  const businessTypes = CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.map(buildReplayRow)
  const ready = businessTypes.every((row) => row.status === 'precision_replay_ready')
  return {
    source: 'construction_organization_precision_replay_matrix',
    sourceVersion: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_MATRIX_VERSION,
    status: ready ? 'precision_replay_matrix_ready' : 'precision_replay_matrix_incomplete',
    supportedBusinessTypeCount: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length,
    replayedBusinessTypeCount: businessTypes.length,
    businessTypes,
    mutationBoundary: MUTATION_BOUNDARY,
    remainingBoundary: 'golden_precision_replay_is_candidate_projection_not_runtime_saved_outcome_or_auto_materialization',
  }
}
