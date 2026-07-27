import type { ProjectGenerationFacts } from './projectFactsToTemplateService.js'

export type ProjectGenerationFactConsumer =
  | 'projectWizard'
  | 'projectFactsToTemplateService'
  | 'wbsTemplateGenerationService'
  | 'durationSuggestionService'
  | 'durationContextService'
  | 'constructionDependencyRuleSystemService'
  | 'baselineGenerationService'
  | 'monthlyPlanGenerationService'
  | 'taskDurationForecastService'
  | 'scheduleAccelerationService'
  | 'projectScenarioTaxonomyService'
  | 'constructionOrganizationScenarioSelector'

export type ProjectGenerationFactConsumerGroup =
  | 'template'
  | 'duration'
  | 'dependency'
  | 'context'
  | 'forecast'
  | 'baseline'
  | 'monthlyPlan'
  | 'targetCalibration'

export type ProjectGenerationFactConsumerEntry = {
  field: GovernedProjectGenerationFactKey
  label: string
  purpose: string
  consumers: Record<ProjectGenerationFactConsumerGroup, ProjectGenerationFactConsumer[]>
  boundaryPolicy: string[]
}

export type ProjectGenerationFactGovernanceDiagnostics = {
  factCount: number
  uncoveredFactKeys: GovernedProjectGenerationFactKey[]
  fieldsWithoutGenerationConsumer: GovernedProjectGenerationFactKey[]
}

type GovernedProjectGenerationFactKey = keyof ProjectGenerationFacts

const EMPTY_CONSUMERS: Record<ProjectGenerationFactConsumerGroup, ProjectGenerationFactConsumer[]> = {
  template: [],
  duration: [],
  dependency: [],
  context: [],
  forecast: [],
  baseline: [],
  monthlyPlan: [],
  targetCalibration: [],
}

function consumers(
  groups: Partial<Record<ProjectGenerationFactConsumerGroup, ProjectGenerationFactConsumer[]>>,
): Record<ProjectGenerationFactConsumerGroup, ProjectGenerationFactConsumer[]> {
  return {
    template: groups.template ?? [],
    duration: groups.duration ?? [],
    dependency: groups.dependency ?? [],
    context: groups.context ?? [],
    forecast: groups.forecast ?? [],
    baseline: groups.baseline ?? [],
    monthlyPlan: groups.monthlyPlan ?? [],
    targetCalibration: groups.targetCalibration ?? [],
  }
}

const TEMPLATE_CONSUMERS: ProjectGenerationFactConsumer[] = [
  'projectFactsToTemplateService',
  'projectScenarioTaxonomyService',
]

const GENERATION_CONSUMERS: ProjectGenerationFactConsumer[] = [
  'wbsTemplateGenerationService',
]

const DURATION_CONSUMERS: ProjectGenerationFactConsumer[] = [
  'wbsTemplateGenerationService',
  'durationSuggestionService',
]

const CONTEXT_CONSUMERS: ProjectGenerationFactConsumer[] = [
  'durationContextService',
]

const DEPENDENCY_CONSUMERS: ProjectGenerationFactConsumer[] = [
  'wbsTemplateGenerationService',
  'constructionDependencyRuleSystemService',
]

const BASELINE_CONSUMERS: ProjectGenerationFactConsumer[] = [
  'baselineGenerationService',
]

const MONTHLY_PLAN_CONSUMERS: ProjectGenerationFactConsumer[] = [
  'monthlyPlanGenerationService',
]

const FORECAST_CONSUMERS: ProjectGenerationFactConsumer[] = [
  'taskDurationForecastService',
]

const TARGET_CALIBRATION_CONSUMERS: ProjectGenerationFactConsumer[] = [
  'wbsTemplateGenerationService',
  'scheduleAccelerationService',
]

const CONSTRUCTION_ORGANIZATION_CONSUMERS: ProjectGenerationFactConsumer[] = [
  'constructionOrganizationScenarioSelector',
]

const COMMON_BOUNDARY_POLICY = [
  'wizard_inputs_normalized_once',
  'removed_legacy_aliases_not_accepted',
  'every_canonical_fact_requires_declared_consumer',
]

const PROJECT_GENERATION_FACT_CONSUMER_MATRIX = {
  businessType: {
    field: 'businessType',
    label: 'Business type',
    purpose: 'Selects the business scenario, recommendation packs, project-type duration context and phase profile.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      forecast: FORECAST_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  businessSubtype: {
    field: 'businessSubtype',
    label: 'Business subtype',
    purpose: 'Refines the scenario profile and specialty recommendation packs.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      context: CONTEXT_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  methodVariantCodes: {
    field: 'methodVariantCodes',
    label: 'Construction method variants',
    purpose: 'Selects prefab, steel, MiC and cast-in-situ method templates and schedule release rules.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      forecast: FORECAST_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  planScopeCaliber: {
    field: 'planScopeCaliber',
    label: 'Plan scope caliber',
    purpose: 'Defines whether generation is full-project master, general-contract, civil/structure, specialty package or continuation planning scope.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  deliveryStandard: {
    field: 'deliveryStandard',
    label: 'Delivery standard',
    purpose: 'Controls rough, MEP-ready, public-area fit-out, full-fitout, hotel-opening and production-validation template branches and terminal scope.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      forecast: FORECAST_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  terminalEvent: {
    field: 'terminalEvent',
    label: 'Terminal event',
    purpose: 'Defines the planning end gate such as contract completion, completion acceptance, owner handover, trial opening or production validation.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  prefabSystemCodes: {
    field: 'prefabSystemCodes',
    label: 'Prefab system codes',
    purpose: 'Captures PCF facade, ALC partition, integrated bathroom and integrated kitchen choices with business labels while keeping seed codes backend-only.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      forecast: FORECAST_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  elementVariantCodes: {
    field: 'elementVariantCodes',
    label: 'Element variant codes',
    purpose: 'Feeds duration seed and building-pattern matching for component/system variants such as PCF, ALC, integrated bathroom and integrated kitchen.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      forecast: FORECAST_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  externalInterfaceCodes: {
    field: 'externalInterfaceCodes',
    label: 'External interface codes',
    purpose: 'Normalizes metro, heritage and high-voltage adjacency into interface constraints consumed by template, dependency and duration context logic.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  hardConstraintCodes: {
    field: 'hardConstraintCodes',
    label: 'Hard constraint codes',
    purpose: 'Normalizes non-stop operation, occupied renovation and hard terminal gates for schedule release, acceleration and baseline policy.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      forecast: FORECAST_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  projectFeatures: {
    field: 'projectFeatures',
    label: 'Registered feature facts',
    purpose: 'Carries only registered feature flags and numeric specialty parameters after wizard sanitization.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
    }),
    boundaryPolicy: [
      ...COMMON_BOUNDARY_POLICY,
      'registered_feature_codes_only',
    ],
  },
  detailLevel: {
    field: 'detailLevel',
    label: 'Generation detail level',
    purpose: 'Controls item-pack, process and activity-step expansion depth and keeps construction-organization projection evidence tied to the requested/frontier generation depth.',
    consumers: consumers({
      template: ['projectWizard', ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: GENERATION_CONSUMERS,
      dependency: GENERATION_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  plannedEndDate: {
    field: 'plannedEndDate',
    label: 'Project planned end date',
    purpose: 'Carries the wizard target completion constraint into WBS generation, compression preview and acceleration feasibility without rewriting generated task dates directly.',
    consumers: consumers({
      template: GENERATION_CONSUMERS,
      duration: DURATION_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: [
      ...COMMON_BOUNDARY_POLICY,
      'target_date_is_constraint_fact_not_actual_completion',
      'compression_preview_may_suggest_but_must_not_force_generated_plan_dates',
    ],
  },
  buildingCount: {
    field: 'buildingCount',
    label: 'Building count',
    purpose: 'Scales row density, multi-building compression and workface overlap policies.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  totalAreaM2: {
    field: 'totalAreaM2',
    label: 'Total floor area',
    purpose: 'Provides the primary scale baseline for template row volume and duration scaling.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
      forecast: FORECAST_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  aboveGroundAreaM2: {
    field: 'aboveGroundAreaM2',
    label: 'Above-ground floor area',
    purpose: 'Separates superstructure scale from basement and outdoor scope.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  basementAreaM2: {
    field: 'basementAreaM2',
    label: 'Basement area',
    purpose: 'Scales underground works, basement specialty templates and foundation-to-basement release.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  siteAreaM2: {
    field: 'siteAreaM2',
    label: 'Site area',
    purpose: 'Scales outdoor, temporary works and physical-zone planning scope.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  structureTypeCode: {
    field: 'structureTypeCode',
    label: 'Structure type',
    purpose: 'Splits cast-in-situ, steel, frame and modular structural method assumptions.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      forecast: FORECAST_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  standardFloorCount: {
    field: 'standardFloorCount',
    label: 'Standard floor count',
    purpose: 'Drives floor rhythm scaling and high-rise versus low-rise building-pattern execution.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  highestBuildingFloorCount: {
    field: 'highestBuildingFloorCount',
    label: 'Highest building floor count',
    purpose: 'Identifies high-rise, low-rise multi-building and vertical transport schedule behavior.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  basementLevelCount: {
    field: 'basementLevelCount',
    label: 'Basement level count',
    purpose: 'Triggers underground complexity, deep foundation and basement phase duration rules.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  foundationDepthM: {
    field: 'foundationDepthM',
    label: 'Foundation depth',
    purpose: 'Triggers deep foundation, danger context and underground duration scaling.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  prefabRate: {
    field: 'prefabRate',
    label: 'Prefab rate',
    purpose: 'Controls prefab recommendation packs, factory release policies and prefab duration scaling.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  maxSpanM: {
    field: 'maxSpanM',
    label: 'Maximum span',
    purpose: 'Triggers long-span specialty and danger context in templates and duration governance.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  supportHeightM: {
    field: 'supportHeightM',
    label: 'Support height',
    purpose: 'Triggers high-formwork danger context and sequencing protection.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  hasCivilDefense: {
    field: 'hasCivilDefense',
    label: 'Civil-defense scope',
    purpose: 'Triggers civil-defense specialty templates, acceptance dependencies and basement context.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  towerCraneCount: {
    field: 'towerCraneCount',
    label: 'Tower crane count',
    purpose: 'Provides vertical transport capacity for productivity, overlap policies, and CPM resource constraints.',
    consumers: consumers({
      template: CONSTRUCTION_ORGANIZATION_CONSUMERS,
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  constructionHoistCount: {
    field: 'constructionHoistCount',
    label: 'Construction hoist count',
    purpose: 'Provides vertical transport resource context for fit-out and MEP productivity.',
    consumers: consumers({
      template: CONSTRUCTION_ORGANIZATION_CONSUMERS,
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  buildingPatternCodes: {
    field: 'buildingPatternCodes',
    label: 'Building pattern codes',
    purpose: 'Carries building-pattern execution evidence shared by template generation, baseline and monthly planning.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
      forecast: FORECAST_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  scopeOrganizationFacts: {
    field: 'scopeOrganizationFacts',
    label: 'Scope organization facts',
    purpose: 'Carries normalized scope-object service relationships, shared basement/podium coverage and outdoor-site organization signals for construction organization selection and bounded acceleration context.',
    consumers: consumers({
      template: ['projectWizard', 'wbsTemplateGenerationService', ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: [
      ...COMMON_BOUNDARY_POLICY,
      'scope_organization_facts_are_candidate_evidence_not_task_dependency_writes',
      'resources_remain_sidecar_feasibility_signals_not_primary_schedule_drivers',
    ],
  },
  locationFacts: {
    field: 'locationFacts',
    label: 'Project location facts',
    purpose: 'Normalizes wizard location text into region, climate and weather-window facts consumed by schedule, duration and target-calibration policies.',
    consumers: consumers({
      template: ['projectWizard', 'wbsTemplateGenerationService', ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      forecast: FORECAST_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: [
      ...COMMON_BOUNDARY_POLICY,
      'location_text_must_be_normalized_before_algorithm_consumption',
      'weather_forecast_facts_override_static_location_climate_facts',
    ],
  },
  climateSignals: {
    field: 'climateSignals',
    label: 'Climate signals',
    purpose: 'Carries normalized climate signals from wizard location facts into construction organization, duration context, forecast and acceleration logic.',
    consumers: consumers({
      template: ['projectWizard', 'wbsTemplateGenerationService', ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      forecast: FORECAST_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: [
      ...COMMON_BOUNDARY_POLICY,
      'derived_from_location_facts_or_explicit_weather_context',
      'weather_forecast_facts_override_static_location_climate_facts',
    ],
  },
  weatherImpactBands: {
    field: 'weatherImpactBands',
    label: 'Weather impact bands',
    purpose: 'Carries normalized weather impact bands for rain, heat, winter and shutdown sensitivity into construction organization and duration runtime context.',
    consumers: consumers({
      template: ['projectWizard', 'wbsTemplateGenerationService', ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      forecast: FORECAST_CONSUMERS,
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: [
      ...COMMON_BOUNDARY_POLICY,
      'derived_from_location_facts_or_explicit_weather_context',
      'weather_forecast_facts_override_static_location_climate_facts',
    ],
  },
  onboardingMode: {
    field: 'onboardingMode',
    label: 'Starting-line onboarding mode',
    purpose: 'Marks whether wizard facts come from starting-line onboarding so construction organization can explain candidate actionability without rewriting historical plan facts.',
    consumers: consumers({
      template: ['projectWizard', 'wbsTemplateGenerationService', ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: [
      ...COMMON_BOUNDARY_POLICY,
      'starting_line_facts_are_evidence_not_direct_schedule_writes',
    ],
  },
  onboardingSubstage: {
    field: 'onboardingSubstage',
    label: 'Starting-line current substage',
    purpose: 'Carries the current execution stage selected in wizard Step 5 for row classification and construction organization actionability.',
    consumers: consumers({
      template: ['projectWizard', 'wbsTemplateGenerationService', ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: [
      ...COMMON_BOUNDARY_POLICY,
      'starting_line_stage_classifies_existing_context_only',
    ],
  },
  onboardingPassedMilestones: {
    field: 'onboardingPassedMilestones',
    label: 'Starting-line passed milestones',
    purpose: 'Carries wizard Step 5 milestone evidence into construction organization recommendations and downstream acceleration context without creating risks, issues, dependencies or plan dates.',
    consumers: consumers({
      template: ['projectWizard', 'wbsTemplateGenerationService', ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: [
      ...COMMON_BOUNDARY_POLICY,
      'passed_milestones_are_evidence_not_acceptance_writes',
      'starting_line_facts_are_evidence_not_direct_schedule_writes',
    ],
  },
  onboardingPhaseProgress: {
    field: 'onboardingPhaseProgress',
    label: 'Starting-line phase progress',
    purpose: 'Carries wizard Step 5 phase progress evidence into generated-row metadata and construction organization recommendation basis.',
    consumers: consumers({
      template: ['projectWizard', 'wbsTemplateGenerationService', ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      targetCalibration: TARGET_CALIBRATION_CONSUMERS,
    }),
    boundaryPolicy: [
      ...COMMON_BOUNDARY_POLICY,
      'phase_progress_is_evidence_not_progress_writeback',
      'starting_line_facts_are_evidence_not_direct_schedule_writes',
    ],
  },
  functionalUsageCodes: {
    field: 'functionalUsageCodes',
    label: 'Functional usage codes',
    purpose: 'Allocates templates to building uses and provides scope assignment context.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  floorUsageCodes: {
    field: 'floorUsageCodes',
    label: 'Special floor usage codes',
    purpose: 'Triggers floor-specific construction, safety-control and specialty handoff packs such as transfer, refuge, mechanical, roof and ground pilotis floors.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  functionalCategoryCodes: {
    field: 'functionalCategoryCodes',
    label: 'Functional category codes',
    purpose: 'Triggers hospital, hotel, IDC, cleanroom and other specialty branches.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  specialRoomTypeCodes: {
    field: 'specialRoomTypeCodes',
    label: 'Special room type codes',
    purpose: 'Triggers room-level specialty templates, acceptance handoff and duration context.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  physicalZoneTypeCodes: {
    field: 'physicalZoneTypeCodes',
    label: 'Physical zone type codes',
    purpose: 'Separates physical construction areas from functional areas for scope, duration and handover sequencing.',
    consumers: consumers({
      template: [...TEMPLATE_CONSUMERS, ...CONSTRUCTION_ORGANIZATION_CONSUMERS],
      duration: DURATION_CONSUMERS,
      dependency: DEPENDENCY_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      monthlyPlan: MONTHLY_PLAN_CONSUMERS,
    }),
    boundaryPolicy: COMMON_BOUNDARY_POLICY,
  },
  scopeTree: {
    field: 'scopeTree',
    label: 'Scope tree snapshot',
    purpose: 'Preserves the normalized wizard object hierarchy used to derive phase, section, building, basement, floor, physical-zone and functional-area scope facts.',
    consumers: consumers({
      template: ['projectWizard', 'projectFactsToTemplateService'],
      dependency: GENERATION_CONSUMERS,
      context: CONTEXT_CONSUMERS,
      baseline: BASELINE_CONSUMERS,
    }),
    boundaryPolicy: [
      ...COMMON_BOUNDARY_POLICY,
      'scope_tree_is_snapshot_not_parallel_fact_source',
    ],
  },
} satisfies Record<GovernedProjectGenerationFactKey, ProjectGenerationFactConsumerEntry>

function entryHasAnyConsumer(entry: ProjectGenerationFactConsumerEntry) {
  return Object.values(entry.consumers).some((group) => group.length > 0)
}

function entryHasGenerationConsumer(entry: ProjectGenerationFactConsumerEntry) {
  return (
    entry.consumers.template.length > 0
    || entry.consumers.duration.includes('wbsTemplateGenerationService')
    || entry.consumers.dependency.includes('wbsTemplateGenerationService')
  )
}

export function listProjectGenerationFactKeys(): GovernedProjectGenerationFactKey[] {
  return Object.keys(PROJECT_GENERATION_FACT_CONSUMER_MATRIX).sort() as GovernedProjectGenerationFactKey[]
}

export function getProjectGenerationFactConsumerMatrix(): Record<GovernedProjectGenerationFactKey, ProjectGenerationFactConsumerEntry> {
  return PROJECT_GENERATION_FACT_CONSUMER_MATRIX
}

export function getProjectGenerationFactGovernanceDiagnostics(): ProjectGenerationFactGovernanceDiagnostics {
  const entries = Object.values(PROJECT_GENERATION_FACT_CONSUMER_MATRIX)
  return {
    factCount: entries.length,
    uncoveredFactKeys: entries
      .filter((entry) => !entryHasAnyConsumer(entry))
      .map((entry) => entry.field)
      .sort(),
    fieldsWithoutGenerationConsumer: entries
      .filter((entry) => !entryHasGenerationConsumer(entry))
      .map((entry) => entry.field)
      .sort(),
  }
}

export function listProjectGenerationFactConsumers(): ProjectGenerationFactConsumer[] {
  return Array.from(new Set(
    Object.values(PROJECT_GENERATION_FACT_CONSUMER_MATRIX)
      .flatMap((entry) => Object.values(entry.consumers).flat()),
  )).sort()
}
