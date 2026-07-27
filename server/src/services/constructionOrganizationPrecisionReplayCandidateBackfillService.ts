import { query as rawQuery } from '../database.js'
import type { AlgorithmAssetGovernanceQueryExec } from './algorithmAssetGovernancePersistenceService.js'
import {
  persistConstructionOrganizationScenarioCandidateEvents,
} from './constructionOrganizationScenarioGovernanceService.js'
import {
  buildConstructionOrganizationSelectorInputFromProjectFacts,
  selectConstructionOrganizationScenario,
} from './constructionOrganizationScenarioSelectorEngine.js'
import type {
  ConstructionOrganizationPlanOption,
  ConstructionOrganizationPlanOptionComparisonPackage,
  ConstructionOrganizationScenarioSelection,
  ConstructionOrganizationUseCaseRecommendation,
} from '../types/constructionOrganizationScenario.js'
import {
  projectConstructionOrganizationSelectionToGeneratedRows,
} from './constructionOrganizationPlanOptionProjectionService.js'
import {
  CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES,
  type ConstructionOrganizationPrecisionReplayBusinessType,
} from './constructionOrganizationPrecisionReplayMatrixService.js'

export type BackfillConstructionOrganizationPrecisionReplayCandidatesInput = {
  companyId: string
  businessTypes?: ConstructionOrganizationPrecisionReplayBusinessType[] | null
  dryRun?: boolean
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

export type BackfillConstructionOrganizationPrecisionReplayCandidateBusinessTypeResult = {
  businessType: ConstructionOrganizationPrecisionReplayBusinessType
  status:
    | 'precision_replay_candidate_backfilled'
    | 'precision_replay_candidate_backfill_ready'
    | 'already_has_precision_replay_candidate_anchor'
  reason: string | null
  candidateEventCount: number
  assetKeys: string[]
  runtimeEffectPolicy: 'candidate_only'
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesBaseline: false
    writesSeed: false
    writesTaskFacts: false
    writesAccelerationDraft: false
    writesCriticalPathFacts: false
  }
}

export type BackfillConstructionOrganizationPrecisionReplayCandidatesResult = {
  source: 'construction_organization_precision_replay_candidate_backfill_service'
  mode: 'dry_run' | 'apply'
  companyId: string
  supportedBusinessTypeCount: number
  scannedBusinessTypeCount: number
  backfillableBusinessTypeCount: number
  backfilledBusinessTypeCount: number
  candidateEventCount: number
  businessTypes: BackfillConstructionOrganizationPrecisionReplayCandidateBusinessTypeResult[]
  boundaryPolicy: string[]
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function defaultMutationBoundary(): BackfillConstructionOrganizationPrecisionReplayCandidateBusinessTypeResult['mutationBoundary'] {
  return {
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesBaseline: false,
    writesSeed: false,
    writesTaskFacts: false,
    writesAccelerationDraft: false,
    writesCriticalPathFacts: false,
  }
}

function uniqueBusinessTypes(
  values: ConstructionOrganizationPrecisionReplayBusinessType[] | null | undefined,
) {
  const supported = new Set<string>(CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES)
  const requested = (values ?? CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES)
    .filter((value): value is ConstructionOrganizationPrecisionReplayBusinessType =>
      supported.has(value),
    )
  return [...new Set(requested)]
}

function buildSelectorInputForBusinessType(
  businessType: ConstructionOrganizationPrecisionReplayBusinessType,
) {
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
) {
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

function buildProjectedScenarioForBusinessType(
  businessType: ConstructionOrganizationPrecisionReplayBusinessType,
): ConstructionOrganizationScenarioSelection {
  const selected = selectConstructionOrganizationScenario(
    buildConstructionOrganizationSelectorInputFromProjectFacts(
      buildSelectorInputForBusinessType(businessType),
    ),
  )
  return projectConstructionOrganizationSelectionToGeneratedRows(
    selected,
    buildPrecisionReplayGeneratedRows(businessType),
  )
}

function scopedOptionId(
  businessType: ConstructionOrganizationPrecisionReplayBusinessType,
  optionId: string,
) {
  return `${businessType}:${optionId}`
}

function scopeGeneratedRowProjectionOptionId(
  value: ConstructionOrganizationPlanOption['evaluation']['generatedRowProjection'],
  optionId: string,
): ConstructionOrganizationPlanOption['evaluation']['generatedRowProjection'] {
  if (!value) return value
  return {
    ...value,
    optionId,
    materializationReviewPackage: value.materializationReviewPackage
      ? {
          ...value.materializationReviewPackage,
          optionId,
        }
      : value.materializationReviewPackage,
  }
}

function scopePlanOptionForBusinessType(
  businessType: ConstructionOrganizationPrecisionReplayBusinessType,
  option: ConstructionOrganizationPlanOption,
): ConstructionOrganizationPlanOption {
  const optionId = scopedOptionId(businessType, option.optionId)
  return {
    ...option,
    optionId,
    evaluation: {
      ...option.evaluation,
      generatedRowProjection: scopeGeneratedRowProjectionOptionId(
        option.evaluation.generatedRowProjection,
        optionId,
      ),
    },
  }
}

function scopeUseCaseRecommendation(
  businessType: ConstructionOrganizationPrecisionReplayBusinessType,
  recommendation: ConstructionOrganizationUseCaseRecommendation,
): ConstructionOrganizationUseCaseRecommendation {
  return {
    ...recommendation,
    optionId: scopedOptionId(businessType, recommendation.optionId),
  }
}

function scopeComparisonPackage(
  businessType: ConstructionOrganizationPrecisionReplayBusinessType,
  comparisonPackage: ConstructionOrganizationPlanOptionComparisonPackage,
): ConstructionOrganizationPlanOptionComparisonPackage {
  return {
    ...comparisonPackage,
    recommendedOptionIdsByUseCase: Object.fromEntries(
      Object.entries(comparisonPackage.recommendedOptionIdsByUseCase).map(([key, value]) => [
        key,
        value ? scopedOptionId(businessType, value) : value,
      ]),
    ) as ConstructionOrganizationPlanOptionComparisonPackage['recommendedOptionIdsByUseCase'],
    options: comparisonPackage.options.map((option) => ({
      ...option,
      optionId: scopedOptionId(businessType, option.optionId),
    })),
  }
}

function scopeScenarioOptionIdsForBusinessType(
  businessType: ConstructionOrganizationPrecisionReplayBusinessType,
  scenario: ConstructionOrganizationScenarioSelection,
): ConstructionOrganizationScenarioSelection {
  const planOptions = scenario.planOptions.map((option) =>
    scopePlanOptionForBusinessType(businessType, option),
  )
  const recommendedPlanOption =
    planOptions.find((option) => option.selectedScenarioIds.join('|') === scenario.recommendedPlanOption.selectedScenarioIds.join('|'))
    ?? planOptions[0]
    ?? scopePlanOptionForBusinessType(businessType, scenario.recommendedPlanOption)
  return {
    ...scenario,
    recommendedPlanOption,
    planOptions,
    planOptionComparisonPackage: scopeComparisonPackage(businessType, scenario.planOptionComparisonPackage),
    scenarioRecommendations: {
      newProjectPlanning: scopeUseCaseRecommendation(businessType, scenario.scenarioRecommendations.newProjectPlanning),
      startingLineOnboarding: scopeUseCaseRecommendation(businessType, scenario.scenarioRecommendations.startingLineOnboarding),
      accelerationRecovery: scopeUseCaseRecommendation(businessType, scenario.scenarioRecommendations.accelerationRecovery),
    },
    factBasis: {
      ...scenario.factBasis,
      businessType,
      precisionReplayBusinessType: businessType,
      optionIdScope: 'business_type_scoped_company_candidate',
    },
  }
}

async function defaultQueryExec<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  // database-query-dynamic-approved: local adapter for this service's fixed, parameterized SQL templates only.
  const result = await rawQuery(sql, params as any[])
  return (result.rows ?? []) as T[]
}

async function existingCandidateAnchorAssetKeys(input: {
  companyId: string
  assetKeys: string[]
  queryExec: AlgorithmAssetGovernanceQueryExec
}) {
  const assetKeys = [...new Set(input.assetKeys.map((key) => normalizeText(key)).filter((key): key is string => Boolean(key)))]
  if (assetKeys.length === 0) return new Set<string>()
  const rows = await input.queryExec<{ asset_key?: string | null }>(`
    SELECT asset_key
    FROM public.algorithm_asset_candidate_events
    WHERE company_id = $1::uuid
      AND project_id IS NULL
      AND source_module = $2
      AND asset_key = ANY($3::text[])
      AND event_status IN ('candidate', 'review_required', 'replay_ready', 'runtime_published')
  `, [
    input.companyId,
    'constructionOrganizationScenarioGovernanceService',
    assetKeys,
  ])
  return new Set(rows.map((row) => normalizeText(row.asset_key)).filter((key): key is string => Boolean(key)))
}

export async function backfillConstructionOrganizationPrecisionReplayCandidates(
  input: BackfillConstructionOrganizationPrecisionReplayCandidatesInput,
): Promise<BackfillConstructionOrganizationPrecisionReplayCandidatesResult> {
  const companyId = normalizeText(input.companyId)
  if (!companyId) {
    throw new Error('company_id_required_for_construction_organization_precision_replay_candidate_backfill')
  }
  const dryRun = input.dryRun !== false
  const businessTypes = uniqueBusinessTypes(input.businessTypes)
  const queryExec = input.queryExec ?? defaultQueryExec
  const results: BackfillConstructionOrganizationPrecisionReplayCandidateBusinessTypeResult[] = []

  for (const businessType of businessTypes) {
    const scenario = scopeScenarioOptionIdsForBusinessType(
      businessType,
      buildProjectedScenarioForBusinessType(businessType),
    )
    const assetKeys = scenario.planOptions.map((option) =>
      `construction_organization.plan_option.${option.optionId}`,
    )
    const existingAssetKeys = await existingCandidateAnchorAssetKeys({
      companyId,
      assetKeys,
      queryExec,
    })
    const missingAssetKeys = assetKeys.filter((assetKey) => !existingAssetKeys.has(assetKey))
    if (missingAssetKeys.length === 0) {
      results.push({
        businessType,
        status: 'already_has_precision_replay_candidate_anchor',
        reason: null,
        candidateEventCount: 0,
        assetKeys,
        runtimeEffectPolicy: 'candidate_only',
        mutationBoundary: defaultMutationBoundary(),
      })
      continue
    }
    if (dryRun) {
      results.push({
        businessType,
        status: 'precision_replay_candidate_backfill_ready',
        reason: null,
        candidateEventCount: scenario.planOptions.length,
        assetKeys: missingAssetKeys,
        runtimeEffectPolicy: 'candidate_only',
        mutationBoundary: defaultMutationBoundary(),
      })
      continue
    }
    const missingSet = new Set(missingAssetKeys)
    const persisted = await persistConstructionOrganizationScenarioCandidateEvents({
      companyId,
      projectId: null,
      selection: {
        ...scenario,
        planOptions: scenario.planOptions.filter((option) =>
          missingSet.has(`construction_organization.plan_option.${option.optionId}`),
        ),
      },
      queryExec,
    })
    results.push({
      businessType,
      status: 'precision_replay_candidate_backfilled',
      reason: null,
      candidateEventCount: persisted.persistedEventCount,
      assetKeys: persisted.events.map((event) => event.assetKey),
      runtimeEffectPolicy: 'candidate_only',
      mutationBoundary: defaultMutationBoundary(),
    })
  }

  const backfilledBusinessTypeCount = results.filter((row) => row.status === 'precision_replay_candidate_backfilled').length
  const backfillableBusinessTypeCount = results.filter((row) =>
    row.status === 'precision_replay_candidate_backfilled'
    || row.status === 'precision_replay_candidate_backfill_ready',
  ).length
  return {
    source: 'construction_organization_precision_replay_candidate_backfill_service',
    mode: dryRun ? 'dry_run' : 'apply',
    companyId,
    supportedBusinessTypeCount: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length,
    scannedBusinessTypeCount: results.length,
    backfillableBusinessTypeCount,
    backfilledBusinessTypeCount,
    candidateEventCount: results.reduce((sum, row) => sum + row.candidateEventCount, 0),
    businessTypes: results,
    boundaryPolicy: [
      'precision_replay_candidate_backfill_is_governance_candidate_only',
      'precision_replay_candidates_are_company_scoped_reference_anchors_not_project_runtime_outcomes',
      'candidate_anchor_presence_does_not_claim_runtime_closeout',
      'runtime_publication_site_adoption_saved_outcome_consumer_observation_impact_monitoring_rollback_and_e1_e3_e5_runtime_evidence_still_required',
      'does_not_write_task_dependencies_or_plan_dates',
      'does_not_write_seed_baseline_task_facts_acceleration_drafts_or_critical_path_facts',
    ],
  }
}
