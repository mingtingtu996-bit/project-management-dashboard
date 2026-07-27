import {
type DurationSuggestion
} from './durationSuggestionService.js'
import type { DurationRiskDistributionDto } from './durationMetricService.js'
import { isValidUUID } from '../utils/id.js'
import {
evaluateDurationOutputPromotion,
evaluateDurationOutputWrite,
getDurationOutputContract,
type DurationOutputCode,
type DurationOutputPromotionPolicyEvaluation,
type DurationOutputWriteEvaluation,
type DurationOutputWriteTarget,
} from './durationOutputGovernanceService.js'
import type { PlanningTableOperation } from '../types/planningTable.js'
import {
CHINA_GB55032_TEMPLATE_CATALOG,type ChinaTemplateCatalog,
type ChinaTemplateCatalogNode,
type ChinaTemplateCategoryType
} from '../seeds/chinaGb50300TemplateCatalog.js'
import {
DOMAIN_WBS_TEMPLATE_CATALOGS,defaultWbsTemplateGenerationPolicy,
getDefaultWbsTemplateTriggerKeywords,
type DomainWbsTemplateCatalog,
type WbsTemplateCatalogGroup,
type WbsTemplateGenerationPolicy,
type WbsTemplateDomainGroup,
type WbsTemplatePackType
} from '../seeds/domainWbsTemplateCatalogs.js'
import {
type V1474ProcessConstraintRule
} from '../seeds/v1474ProcessConstraintSeed.js'
import {
type V1475DependencyIntentTemplate
} from '../seeds/v1475DependencyIntentTemplates.js'
import {
type V1475CrossItemWorkflowRule
} from '../seeds/v1475CrossItemWorkflowSeed.js'
import {
inferTitleWeakElementVariantSuggestion,
resolveTitleWeakElementVariant,
supportsTitleWeakElementVariantExpansion,
} from '../seeds/v1472TitleWeakRecognitionSeed.js'
import {
type DurationContributionMode
} from '../seeds/durationContributionMode.js'
import {
type WbsGenerationDepthPolicy
} from '../seeds/wbsGenerationDepthPolicySeed.js'
import {
resolveProjectConstructionOrganizationPolicy,
type ProjectConstructionOrganizationPolicy,
} from '../seeds/projectConstructionOrganizationPolicySeed.js'
import { resolveProjectTypeCompatibilityCodes } from './projectTypeRecommendations.js'
import {
type ConstructionOrganizationGeneratedRowProjection
} from './constructionOrganizationScenarioSelector.js'
import {
CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_CODE,
CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_VERSION,
type ConstructionDependencyRuleLayerKey,
} from './constructionDependencyRuleSystemService.js'
import { buildScopeOrganizationFactsFromObjects } from './scopeOrganizationFactsService.js'
import {
addPlanDays as addDays
} from './wbsPlanRollupService.js'
import {
addConstructionProductionDays,
calendarDateText,
countsAsConstructionShutdown,isAuthoritativeConstructionCalendar,
isConstructionProductionDay,
normalizeConstructionCalendarForConsumption,
parseConstructionCalendarDate,resolveConstructionCalendarContext,
type ConstructionCalendarContext
} from './constructionCalendar.js'
import {
type AlgorithmSeedResolveContext
} from './algorithmSeedResolver.js'
import {
type ScheduleTargetFeasibility
} from './scheduleAccelerationService.js'
import {
recordWbsTemplateGenerationConsumedArtifacts,
type DurationRuntimeConsumerFacadeArtifactsResult,
} from './durationRuntimeConsumerObservationAdapterService.js'
import type {
DurationRuntimeConsumerObservationQueryExec,
DurationRuntimeConsumerObservedArtifact,
} from './durationRuntimeConsumerObservationService.js'
import type {
DurationAssetConsumptionSummary
} from './durationAssetConsumptionReceiptService.js'



export const CHINA_GB55032_TEMPLATE_ID = CHINA_GB55032_TEMPLATE_CATALOG.templateId


export const CHINA_GB55032_TEMPLATE_CODE = CHINA_GB55032_TEMPLATE_CATALOG.templateCode


export const CHINA_GB55032_TEMPLATE_NAME = CHINA_GB55032_TEMPLATE_CATALOG.templateName


export const CHINA_GB55032_TEMPLATE_SOURCE_STANDARD = CHINA_GB55032_TEMPLATE_CATALOG.sourceStandard


export const CHINA_GB55032_TEMPLATE_SOURCE_VERSION = CHINA_GB55032_TEMPLATE_CATALOG.sourceVersion


export type WbsTemplateGenerationDepth = 'division' | 'sub_division' | 'item_work' | 'process' | 'activity_step'


export type WbsTemplateDurationSuggestionMode = 'fast_template' | 'full' | 'benchmark_plan_reference'


export type WbsTemplateDetailLevel = 'overview' | 'standard' | 'detailed' | 'planning_skeleton'


export const DURATION_SUGGESTION_CONCURRENCY_LIMIT = Math.max(
  1,
  Number.isFinite(Number(process.env.WBS_DURATION_SUGGESTION_CONCURRENCY))
    ? Math.floor(Number(process.env.WBS_DURATION_SUGGESTION_CONCURRENCY))
    : 8,
)


export type WbsTemplatePhaseReleaseMode =
  | 'strict_finish_start'
  | 'overlap_after_days'
  | 'overlap_before_finish_days'
  | 'overlap_after_percent'
  | 'parallel_group'



export type WbsTemplatePhaseReleasePolicy = {
  mode: WbsTemplatePhaseReleaseMode
  afterDays?: number
  beforeFinishDays?: number
  percent?: number
  groupKey?: string | null
  dependencyType?: GeneratedTemplateDependency['dependencyType']
  lagDays?: number
}



export type GeneratedMasterPlanProfile = {
  layer: 'master_plan'
  detailLevel: 'planning_skeleton'
  generationDepth: 'managed_frontier'
  rowCountRange: [number, number]
  rowProjectionMode: 'schedule_row'
  supportLayerPolicy: {
    gateMarkers: 'supporting_evidence_not_default_gantt_rows'
    inlineControls: 'embedded_under_schedule_rows'
    linkedProjections: 'review_reference_not_default_gantt_rows'
  }
  mutationBoundary: {
    writesProductionDependencies: false
    writesProductionDates: false
    writesCriticalPathFacts: false
  }
}



export type GeneratedDurationAssetUtilizationSummary = {
  source: 'default_master_plan_duration_asset_utilization_summary'
  evidenceLevel: 'system_standard_executable_plan_l1'
  mutationBoundary: 'summary_only_no_db_mutation_no_business_fact_write'
  scheduleRowCount: number
  durationBearingScheduleRowCount: number
  standardWorkDurationSeedRowCount: number
  systemStandardWorkDurationSeedRowCount: number
  activeStandardWorkDurationSeedRowCount: number
  fallbackStandardWorkDurationSeedRowCount: number
  t2ApplicableDurationBearingScheduleRowCount: number
  t2NotApplicableDurationBearingScheduleRowCount: number
  t2RhythmTemplateRowCount: number
  systemStandardT2RhythmTemplateRowCount: number
  activeT2RhythmTemplateRowCount: number
  fallbackT2RhythmTemplateRowCount: number
  projectScaleQuantityProxyRowCount: number
  dependencyAssetConsumedRowCount: number
  dependencyTimingAssetConsumedRowCount: number
  processSeasonalDurationAssetRowCount: number
  runtimeReferenceDaysRowCount: number
  constructionCalendarRowCount: number
  durationRiskRangeRowCount: number
  durationRiskP20MinDays: number
  durationRiskP50MedianDays: number
  durationRiskP80MaxDays: number
  businessTypeProfileScheduleRowCount: number
  businessTypeProfileMappedDurationAssetRowCount: number
  businessTypeSpecialtyDurationAssetRowCount: number
  businessTypeSpecificT2RhythmTemplateRowCount: number
  businessTypeRowsMissingProfileDurationAssetCount: number
  businessTypeRowsMissingSpecialtyDurationAssetCount: number
  businessTypeRowsMissingSpecificT2RhythmTemplateCount: number
  rowsMissingDurationAssetCount: number
  rowsMissingT2RhythmTemplateCount: number
  uniqueStandardWorkDurationSeedStableCodes: string[]
  activeStandardWorkDurationSeedStableCodes: string[]
  activeStandardWorkDurationSeedVersionIds: string[]
  uniqueT2RhythmTemplateIds: string[]
  activeT2RhythmTemplateIds: string[]
  activeT2RhythmTemplateVersionIds: string[]
  uniqueDependencyAssetStableCodes: string[]
  businessTypeAssetCoverage: GeneratedBusinessTypeDurationAssetCoverage[]
  businessTypeProfileBusinessTypeCodes: string[]
  businessTypeProfileMappedDurationAssetBusinessTypeCodes: string[]
  businessTypeSpecialtyDurationAssetBusinessTypeCodes: string[]
  businessTypeSpecificT2RhythmBusinessTypeCodes: string[]
  assetConsumptionSummary: DurationAssetConsumptionSummary
  effectiveAppliedAssetReceiptCount: number
  advisoryUsedAssetReceiptCount: number
  evidenceOnlyAssetReceiptCount: number
  notApplicableAssetReceiptCount: number
  blockedByConflictAssetReceiptCount: number
  durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+system_schedule_rules'
  calibrationPolicy: 'optional_runtime_overlay'
  productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies'
}



export type GeneratedCandidateNetworkEvaluation = NonNullable<ConstructionOrganizationGeneratedRowProjection['generatedRowNetworkEvaluation']>



export type GeneratedBusinessTypeDurationAssetCoverage = {
  businessType: string
  profileScheduleRowCount: number
  t2ApplicableProfileScheduleRowCount: number
  t2NotApplicableProfileScheduleRowCount: number
  profileMappedDurationAssetRowCount: number
  specialtyDurationAssetRowCount: number
  specificT2RhythmTemplateRowCount: number
  rowsMissingProfileDurationAssetCount: number
  rowsMissingSpecialtyDurationAssetCount: number
  rowsMissingSpecificT2RhythmTemplateCount: number
  activeStandardWorkDurationSeedRowCount: number
  fallbackStandardWorkDurationSeedRowCount: number
  activeT2RhythmTemplateRowCount: number
  fallbackT2RhythmTemplateRowCount: number
  uniqueStandardWorkDurationSeedStableCodes: string[]
  activeStandardWorkDurationSeedStableCodes: string[]
  activeStandardWorkDurationSeedVersionIds: string[]
  uniqueT2RhythmTemplateIds: string[]
  activeT2RhythmTemplateIds: string[]
  activeT2RhythmTemplateVersionIds: string[]
  productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies'
}



export type BusinessTypeDurationAssetCoverageAccumulator = {
  businessType: string
  profileScheduleRowCount: number
  t2ApplicableProfileScheduleRowCount: number
  t2NotApplicableProfileScheduleRowCount: number
  profileMappedDurationAssetRowCount: number
  specialtyDurationAssetRowCount: number
  specificT2RhythmTemplateRowCount: number
  rowsMissingProfileDurationAssetCount: number
  rowsMissingSpecialtyDurationAssetCount: number
  rowsMissingSpecificT2RhythmTemplateCount: number
  activeStandardWorkDurationSeedRowCount: number
  fallbackStandardWorkDurationSeedRowCount: number
  activeT2RhythmTemplateRowCount: number
  fallbackT2RhythmTemplateRowCount: number
  standardSeedCodes: Set<string>
  activeStandardSeedCodes: Set<string>
  activeStandardSeedVersionIds: Set<string>
  t2TemplateIds: Set<string>
  activeT2TemplateIds: Set<string>
  activeT2TemplateVersionIds: Set<string>
}



export type ResolvedPhaseReleasePolicy = {
  policy: WbsTemplatePhaseReleasePolicy
  source: 'explicit_map' | 'operation' | 'inferred'
}



export type BuiltInWbsTemplateCatalog = ChinaTemplateCatalog | DomainWbsTemplateCatalog



export const BUILT_IN_WBS_TEMPLATE_CATALOGS: BuiltInWbsTemplateCatalog[] = [
  CHINA_GB55032_TEMPLATE_CATALOG,
  ...DOMAIN_WBS_TEMPLATE_CATALOGS,
]



export const BUILT_IN_WBS_TEMPLATE_BY_ID = new Map(
  BUILT_IN_WBS_TEMPLATE_CATALOGS.map((catalog) => [catalog.templateId, catalog]),
)



export const BUILT_IN_TEMPLATE_NODE_ROOTS_BY_ID = new Map<string, TemplateNode[]>()


export const BUILT_IN_TEMPLATE_SERIALIZED_NODES_BY_ID = new Map<string, WbsTemplateCatalogNode[]>()


export const BUILT_IN_TEMPLATE_FLAT_NODES_BY_ID = new Map<string, ChinaTemplateCatalogNode[]>()


export const BUILT_IN_TEMPLATE_EVIDENCE_SUMMARY_BY_ID = new Map<string, WbsTemplateEvidenceSummary>()



export const WBS_TEMPLATE_CATALOG_GROUPS: WbsTemplateCatalogGroup[] = [
  'core_quality',
  'site_management',
  'danger_control',
  'quality_responsibility',
  'project_milestone',
  'document_commercial_support',
  'specialty',
]



export const GENERATION_DEPTH_RANK: Record<WbsTemplateGenerationDepth, number> = {
  division: 1,
  sub_division: 2,
  item_work: 3,
  process: 4,
  activity_step: 5,
}



export const WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET = 500


export const WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT = Math.max(
  WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
  Number.isFinite(Number(process.env.WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT))
    ? Math.floor(Number(process.env.WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT))
    : WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
)


export const WBS_TEMPLATE_GENERATION_SPLIT_BY_PHASE_ENABLED = true



export const OVERVIEW_PROCESS_DETAIL_ITEM_PACK_CODES = new Set([
  'BDT-01-01-04',
  'BDT-01-01-05',
  'BDT-01-01-06',
  'MEP-01-01-01',
  'FIR-05-01-01',
  'FAC-01-01-01',
  'ELV-02-01-02',
])



export const TEMPLATE_NODE_RANK: Record<TemplateNode['categoryType'], number> = {
  division: 1,
  sub_division: 2,
  item_work: 3,
  process: 4,
  activity_step: 5,
  custom: 4,
}



export const TEMPLATE_GENERATION_FORBIDDEN_TASK_CODE_FIELDS = [
  'task_code',
  'task_code_version',
  'task_code_rule_id',
  'task_code_generated_at',
] as const



export type WbsTemplateScope = {
  engineering_object_id?: string | null
  phase_object_id?: string | null
  section_object_id?: string | null
  building_object_id?: string | null
  buildings?: string[]
  buildingIds?: string[]
  building_sequence_source?: 'explicit_building_array' | 'inferred_building_count' | 'direct_building' | null
  building_sequence_index?: number | null
  building_sequence_number?: number | null
  building_sequence_total?: number | null
  floor_object_id?: string | null
  floors?: string[]
  floorIds?: string[]
  basement_object_id?: string | null
  basements?: string[]
  basementIds?: string[]
  physical_zone_object_id?: string | null
  physical_zones?: string[]
  physicalZoneIds?: string[]
  physical_zone_ids?: string[]
  functional_area_object_id?: string | null
  functional_areas?: string[]
  functionalAreaIds?: string[]
  scope_combos?: unknown[]
  scopeCombos?: unknown[]
  scope_objects?: unknown[]
  scopeObjects?: unknown[]
  scope_organization_facts?: Record<string, unknown> | null
  scopeOrganizationFacts?: Record<string, unknown> | null
  phases?: string[]
  phaseIds?: string[]
  sections?: string[]
  sectionIds?: string[]
  business_type?: string | null
  business_subtype?: string | null
  plan_scope_caliber?: string | null
  delivery_standard?: string | null
  terminal_event?: string | null
  recommendation_packs?: string[]
  project_type_code?: string | null
  structure_type_code?: string | null
  method_variant_codes?: string[]
  prefab_system_codes?: string[]
  element_variant_codes?: string[]
  external_interface_codes?: string[]
  hard_constraint_codes?: string[]
  project_features?: Record<string, unknown> | null
  detail_level?: string | null
  detailLevel?: string | null
  building_pattern_code?: string | null
  building_pattern_codes?: string[]
  functional_usage_codes?: string[]
  floor_usage_codes?: string[]
  functional_category_codes?: string[]
  special_room_type_codes?: string[]
  physical_zone_type_codes?: string[]
  climate_signal?: string | null
  monthly_climate_signal?: string | null
  climate_signals?: string[]
  weather_impact_bands?: string[]
  location_facts?: Record<string, unknown> | null
  selected_template_ids?: string[]
  selected_node_stable_codes?: string[]
  selectedNodeStableCodes?: string[]
  total_area_m2?: number | null
  above_ground_area_m2?: number | null
  building_count?: number | null
  standard_floor_count?: number | null
  highest_building_floor_count?: number | null
  basement_level_count?: number | null
  basement_area_m2?: number | null
  site_area_m2?: number | null
  foundation_depth_m?: number | null
  prefab_rate?: number | null
  max_span_m?: number | null
  support_height_m?: number | null
  hasCivilDefense?: boolean | null
  tower_crane_count?: number | null
  construction_hoist_count?: number | null
  onboarding_mode?: string | null
  onboardingMode?: string | null
  onboarding_substage?: string | null
  onboardingSubstage?: string | null
  onboarding_passed_milestones?: string[]
  onboardingPassedMilestones?: string[]
  onboarding_phase_progress?: Record<string, unknown> | null
  onboardingPhaseProgress?: Record<string, unknown> | null
  project_organization_policy_id?: string | null
  project_organization_strategy?: string | null
  organization_lane?: string | null
  organization_lane_role?: string | null
  organization_lane_index?: number | null
  organization_lane_total?: number | null
  organization_scope_group?: string | null
  organization_shared_work?: boolean | null
  organization_confidence?: 'high' | 'medium' | 'low' | null
  benchmark_replay_scope_mode?: 'single_project_scope' | null
  benchmarkReplayScopeMode?: 'single_project_scope' | null
  floor_sequence?: WbsTemplateFloorSequenceInput[]
  floorSequence?: WbsTemplateFloorSequenceInput[]
  floor_series?: WbsTemplateFloorSequenceInput[]
  floor_series_count?: number | null
  floor_series_label?: string | null
  floor_series_source?: 'explicit_floor_array' | 'inferred_floor_count' | 'direct_floor' | null
  floor_sequence_label?: string | null
  floor_sequence_level_number?: number | null
  floor_sequence_is_basement?: boolean | null
  floor_sequence_index?: number | null
  floor_sequence_number?: number | null
  floor_sequence_total?: number | null
  floor_sequence_position?: 'single' | 'first' | 'middle' | 'last' | null
  floor_sequence_source?: 'explicit_floor_array' | 'inferred_floor_count' | 'direct_floor' | null
  scope_expansion_mode?: string | null
  algorithm_seed_source_policy?: AlgorithmSeedResolveContext['sourcePolicy']
}



export type WbsTemplateFloorSequenceInput = {
  floorObjectId?: string | null
  floor_object_id?: string | null
  id?: string | null
  label?: string | null
  floorLabel?: string | null
  floor_label?: string | null
  name?: string | null
  object_name?: string | null
  levelNumber?: number | null
  level_number?: number | null
  isBasement?: boolean | null
  is_basement?: boolean | null
}



export type WbsTemplateCatalogGroupSelection =
  | 'all'
  | 'default_selected'
  | 'triggered'
  | 'explicit'
  | 'auto_by_trigger'
  | 'by_project_type'
  | 'by_branch'
  | 'none'



export type GeneratedTemplateRow = {
  clientRowId: string
  parentClientRowId: string | null
  parentRowId: string | null
  sortOrder: number
  values: Record<string, unknown>
  predecessorClientRowIds: string[]
  predecessorDependencies: GeneratedTemplateDependency[]
  rowProjectionMode?: GeneratedRowProjectionMode | null
  executionPhase?: string | null
  executionLane?: string | null
  executionSortKey?: number | null
  workfaceId?: string | null
  planItemKind?: string | null
  planItemTags?: string[]
  progressMode?: string | null
  scheduleParticipation?: string | null
  scopeExpansionMode?: string | null
  linkedProjectionSource?: Record<string, unknown> | null
  executionNature?: string | null
  qualityControlRole?: string | null
  safetyControlRole?: string | null
  inspectionAcceptanceRole?: string | null
  documentEvidenceRole?: string | null
  commercialControlRole?: string | null
  managementControlRole?: string | null
  durationSuggestion?: GeneratedTemplateDurationSuggestion | null
}



export interface WbsTemplateGenerationRuntimeArtifactPublication {
  assetKey: DurationRuntimeConsumerObservedArtifact['assetKey']
  publicationKey: string
  publicationStatus?: string | null
  sourceEvidenceRefs?: string[] | null
  observationContext?: Record<string, unknown> | null
}



export interface WbsTemplateGenerationRuntimeEvidenceSummary {
  generationBatchId?: string | null
  templateId?: string | null
  templateIds?: string[] | null
  generationDepth?: WbsTemplateGenerationDepth | null
  rows?: GeneratedTemplateRow[] | null
}



export interface RecordWbsTemplateGenerationRuntimeConsumptionInput {
  queryExec: DurationRuntimeConsumerObservationQueryExec
  generation: WbsTemplateGenerationRuntimeEvidenceSummary
  runtimeArtifactPublications: readonly WbsTemplateGenerationRuntimeArtifactPublication[]
  projectId?: string | null
  inputTaskIds?: readonly string[] | null
  inputSubjectIdByClientRowId?: ReadonlyMap<string, string>
  subjectType?: 'task' | 'baseline_item'
  observedAt?: string
}



export const WBS_TEMPLATE_GENERATION_CONSUMER_ASSET_KEYS = new Set([
  'special_work_duration_seed',
  'wbs_reference_days',
  'dependency_rule_candidate',
])



export type GeneratedRowProjectionMode =
  | 'schedule_row'
  | 'gate_marker'
  | 'inline_control'
  | 'linked_projection'



export type GeneratedTemplateBatch = {
  batchId: string
  phaseObjectId: string | null
  scopeIndexes: number[]
  rowCount: number
  totalRowCount?: number
  rowProjectionCounts?: Partial<Record<GeneratedRowProjectionMode, number>>
  templateIds: string[]
  rowLimit: number
  rowLimitExceeded: boolean
}



export type WbsTemplateGenerationRowLimitPolicy = 'single_batch' | 'split_by_phase'



export type GeneratedTargetFeasibility = ScheduleTargetFeasibility


export type GeneratedAccelerationProposal = NonNullable<ScheduleTargetFeasibility['accelerationProposal']>


export type GeneratedAccelerationProposalAction = GeneratedAccelerationProposal['actions'][number]



export type GeneratedPhaseWindow = {
  phaseId: string
  plannedStartDate: string | null
  plannedEndDate: string | null
  phaseWindowDays: number | null
  rowCount: number
  durationBearingRowCount: number
  durationOutputCode: 'phase_window'
  durationOutputSemanticFieldName: string | null
  durationOutputContract: Record<string, unknown> | null
}



export type GeneratedTemplateProcessConstraintRoutingCandidate = {
  source: 'v1.4.7.4_process_constraint'
  ruleCode: string
  applicationMode: V1474ProcessConstraintRule['applicationMode']
  runtimeActionPolicy: V1474ProcessConstraintRule['runtimeActionPolicy']
  mutationBoundary: 'candidate_only_existing_dependency_no_auto_mutation'
  dependencyCreationPolicy: 'never_create_dependency'
  proposedDependencyType: 'FS' | 'SS' | 'FF' | 'SF'
  proposedLagDays: number
  proposedStartAfterPercent: number
  proposedPartialOverlapRatio: number
  releaseQuantityPolicy: V1474ProcessConstraintRule['releaseQuantityPolicy']
  minReleaseQuantityPercent: number
  quantityEvidenceRequirement: V1474ProcessConstraintRule['quantityEvidenceRequirement']
  quantityProxyRiskLevel: V1474ProcessConstraintRule['quantityProxyRiskLevel']
  durationLookupKeys: string[]
  carrierProcessHints: string[]
  sourceStandard: string
  sourceVersion: string
  sourceClauseRef: string
  confidence: V1474ProcessConstraintRule['confidence']
  predecessorClientRowId: string
  predecessorStableCode: string | null
  predecessorDurationDays: number
  successorClientRowId: string
  successorStableCode: string | null
  successorDurationDays: number
  candidateBasis: 'existing_dependency_edge'
}



export type GeneratedTemplateDependency = {
  clientRowId: string
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays: number
  baseLagDays?: number | null
  effectiveLagDays?: number | null
  conditionalLagProfileCode?: string | null
  appliedConditionalLagProfileCode?: string | null
  appliedConditionalLagProfileConditionCode?: string | null
  conditionalLagTriggerSignals?: string[] | null
  conditionalLagCalibrationPolicy?: string | null
  predecessorStableCode?: string | null
  predecessorStableCodes?: string[] | null
  intentCode?: string | null
  relationRole?: V1475DependencyIntentTemplate['relationRole'] | null
  strength?: V1475DependencyIntentTemplate['strength']
  source?: 'sibling_sequence'
    | 'dependency_intent_template'
    | 'cross_item_workflow'
    | 'internal_flow'
    | 'phase_chain'
    | 'execution_phase_order_fallback'
    | 'heuristic_stagger'
    | 'duration_learning_runtime_publication'
  sequencingBasis?: 'execution_phase_order_fallback' | 'heuristic_stagger' | null
  governanceGapCode?: string | null
  publicationKey?: string | null
  artifactKey?: string | null
  publicationStage?: string | null
  selectionBasis?: string | null
  confidenceScore?: number | null
  confidenceLevel?: V1475DependencyIntentTemplate['confidenceLevel'] | null
  matchedReferenceField?: string | null
  auditReasonCode?: V1475DependencyIntentTemplate['auditReasonCode'] | null
  auditTrace?: string[] | null
  additionalIntentCodes?: string[]
  crossItemWorkflowRuleCodes?: string[]
  managedFrontierProjectionPolicy?: V1475CrossItemWorkflowRule['managedFrontierProjectionPolicy'] | null
  dependencyRuleEvidence?: DefaultMasterPlanDependencyRuleEvidence | null
  processConstraintRoutingCandidates?: GeneratedTemplateProcessConstraintRoutingCandidate[]
}



export type DefaultMasterPlanDependencyRuleEvidence = {
  source: typeof CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_CODE
  version: typeof CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_VERSION
  evidenceLevel: 'system_standard_dependency_l1'
  relationLayerKey: ConstructionDependencyRuleLayerKey
  layerStack: ConstructionDependencyRuleLayerKey[]
  layerSummaries: Array<{
    order: number
    key: ConstructionDependencyRuleLayerKey
    name: string
    technicalSources: string[]
    primaryRuntimeOutputs: string[]
  }>
  dependencyType: GeneratedTemplateDependency['dependencyType']
  lagDays: number
  intentCode: string
  createsProductionTaskDependency: true
  productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies'
  mutationBoundary: 'preview_no_write_wizard_commit_transactional'
  dependencyAssetConsumed?: true
  dependencyAssetType?: 'cross_item_workflow'
  dependencyAssetStableCode?: string
  dependencyAssetAutoApplyPolicy?: V1475CrossItemWorkflowRule['autoApplyPolicy']
  dependencyAssetStrength?: V1475CrossItemWorkflowRule['strength']
  dependencyAssetHandoffCategory?: V1475CrossItemWorkflowRule['handoffCategory'] | null
  dependencyAssetScopeRule?: V1475CrossItemWorkflowRule['scopeRule']
  dependencyAssetDependencyType?: V1475CrossItemWorkflowRule['dependencyType']
  dependencyAssetLagDays?: number
  dependencyAssetSourceStandard?: V1475CrossItemWorkflowRule['sourceStandard']
  dependencyAssetSourceVersion?: string
  dependencyAssetSourceClauseRef?: string
  dependencyAssetEvidenceSourceKeys?: string[]
  dependencyAssetBoundaryPolicy?: string
  dependencyAssetConfidence?: V1475CrossItemWorkflowRule['confidence']
  dependencyTimingAssetConsumed?: true
  dependencyTimingSource?: 'default_master_plan_activity_offset' | 'cross_item_workflow_asset'
  dependencyTimingPredecessorT2RhythmTemplateId?: string | null
  dependencyTimingSuccessorT2RhythmTemplateId?: string | null
  dependencyTimingSelectedLagDays?: number
  dependencyTimingPredecessorStartOffsetDays?: number | null
  dependencyTimingSuccessorStartOffsetDays?: number | null
  dependencyTimingMutationBoundary?: 'preview_no_write_wizard_commit_transactional'
}



export type GeneratedTemplateProcessConstraintEffect = {
  source: 'v1.4.7.4_process_constraint'
  sourceType: 'process_constraint'
  ruleCode: string
  constraintType: V1474ProcessConstraintRule['constraintType']
  applicationMode: V1474ProcessConstraintRule['applicationMode']
  impactMode: V1474ProcessConstraintRule['impactMode']
  runtimeActionPolicy: V1474ProcessConstraintRule['runtimeActionPolicy']
  timeSourcePolicy: V1474ProcessConstraintRule['timeSourcePolicy']
  relationInputPolicy: 'requires_existing_relation'
  dependencyCreationPolicy: 'never_create_dependency'
  durationDoubleCountPolicy: V1474ProcessConstraintRule['durationDoubleCountPolicy']
  durationAuthorityPolicy: V1474ProcessConstraintRule['durationAuthorityPolicy']
  partialOverlapRatio: number
  startAfterPercent: number
  scopeGranularity: V1474ProcessConstraintRule['scopeGranularity']
  releaseQuantityPolicy: V1474ProcessConstraintRule['releaseQuantityPolicy']
  minReleaseQuantityPercent: number
  quantityEvidenceRequirement: V1474ProcessConstraintRule['quantityEvidenceRequirement']
  quantityProxyRiskLevel: V1474ProcessConstraintRule['quantityProxyRiskLevel']
  durationLookupKeys: string[]
  carrierProcessHints: string[]
  sourceStandard: string
  sourceVersion: string
  sourceClauseRef: string
  confidence: V1474ProcessConstraintRule['confidence']
  businessReason: string
}



export type GeneratedTemplateGovernanceWarning = {
  code:
    | 'DEPENDENCY_INTENT_TARGET_NOT_GENERATED'
    | 'DEPENDENCY_INTENT_TARGET_NOT_ANCHORABLE'
    | 'DEPENDENCY_INTENT_REFERENCE_FIELD_NORMALIZED'
    | 'DEPENDENCY_SCHEDULE_NON_CONVERGENT'
    | 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND'
    | 'TARGET_END_OVERSHOOT'
    | 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED'
    | 'MASTER_PLAN_ROW_COUNT_LIMIT_APPLIED'
    | 'MASTER_PLAN_INFERRED_BUILDING_LANE_COMPACTED'
  severity: 'warning' | 'error'
  nodeCode: string
  message: string
  details?: Record<string, unknown>
}



export type GeneratedScheduleTrustGate = {
  source: 'generation_depth_policy'
  generationDepth: WbsTemplateGenerationDepth
  status: 'trusted' | 'review_required' | 'blocked'
  trustedForScheduling: boolean
  totalScheduleRows: number
  durationBearingScheduleRows: number
  fallbackPolicyRowCount: number
  descendantRollupRequiredRowCount: number
  descendantRollupAppliedRowCount: number
  missingDescendantRollupRowCount: number
  rowsMissingReferenceDuration: number
  candidateReviewGateRowCount: number
  policyConfidenceCounts: Record<WbsGenerationDepthPolicy['confidence'], number>
  reviewReasons: string[]
  reviewRows: Array<{
    stableCode: string
    title: string
    reasons: string[]
    policyId: string | null
    confidence: WbsGenerationDepthPolicy['confidence'] | null
  }>
}



export type InternalFlowRelationKind =
  | 'hard_sequence'
  | 'soft_sequence'
  | 'parallel_allowed'
  | 'acceptance_gate'



export type InternalFlowCondition = {
  field: string
  operator: string
  values: string[]
}



export type InternalFlowEvidenceRef = {
  code: string
  level: string
  ref: string | null
  rationale: string | null
}



export type InternalFlowConditionalEffect = {
  id: string
  when: InternalFlowCondition[]
  relationKind: InternalFlowRelationKind | string
  dependencyType: GeneratedTemplateDependency['dependencyType'] | string
  lagDays: number
  relationRole: V1475DependencyIntentTemplate['relationRole'] | string
  strength: V1475DependencyIntentTemplate['strength'] | string
  reasonCode?: string | null
  curationBasis?: string | null
  scheduleMode?: 'sequential' | 'parallel_with_previous' | string | null
  requiresAllPreviousSiblings?: boolean | null
  evidenceCodes?: string[] | null
  evidenceRefs?: InternalFlowEvidenceRef[] | null
}



export type InternalFlowRelation = {
  kind: InternalFlowRelationKind
  createsDependency: boolean
  dependencyType: GeneratedTemplateDependency['dependencyType']
  lagDays: number
  relationRole: V1475DependencyIntentTemplate['relationRole']
  strength: V1475DependencyIntentTemplate['strength']
  reasonCode: string
  source?: string | null
  sourceVersion?: string | null
  seedRuleId?: string | null
  ruleVersion?: number | null
  curationStatus?: string | null
  curationMethod?: string | null
  curationBasis?: string | null
  reviewNeeded?: boolean
  scheduleMode?: 'sequential' | 'parallel_with_previous'
  requiresAllPreviousSiblings?: boolean
  evidenceCodes?: string[]
  evidenceRefs?: InternalFlowEvidenceRef[]
  governancePriority?: 'P0' | 'P1' | 'P2'
  applicableWhen?: InternalFlowCondition[]
  conditionalEffects?: InternalFlowConditionalEffect[]
  appliedConditionalEffectIds?: string[]
  generalizationHint?: Record<string, unknown> | null
  additionalPredecessorStableCodes?: string[]
}



export type PreviousInternalFlowSibling = {
  clientRowId: string
  node: TemplateNode
  startDate: string
  endDate: string
  durationContributionMode: DurationContributionMode
}



export type GeneratedTemplateDurationSuggestion = {
  recommendedDurationDays: number | null
  conservativeDurationDays: number | null
  riskP20DurationDays?: number | null
  riskP50DurationDays?: number | null
  riskP80DurationDays?: number | null
  durationRiskRange?: {
    source: string
    evidenceLevel: string
    p20Days: number
    p50Days: number
    p80Days: number
    uncertaintyBandDays: number
    mutationBoundary: 'candidate_only_no_business_fact_write' | 'calculation_only_no_business_fact_write'
    durationRiskDistribution: DurationRiskDistributionDto
  } | null
  durationRiskDistribution?: DurationRiskDistributionDto | null
  durationOutputCode?: DurationOutputCode | null
  durationOutputSemanticFieldName?: string | null
  durationOutputContract?: Record<string, unknown> | null
  durationOutputWriteEvaluation?: DurationOutputWriteEvaluation | null
  durationOutputPromotion?: DurationOutputPromotionPolicyEvaluation | null
  templateFastEstimateDays?: number | null
  planReferenceDays?: number | null
  contextualReferenceDays?: number | null
  remainingForecastDays?: number | null
  phaseWindowDays?: number | null
  accelerationTargetDays?: number | null
  confidenceLevel: DurationSuggestion['confidenceLevel']
  confidenceScore: number
  forecastSource: string
  durationCalibrationSource: DurationSuggestion['durationCalibrationSource']
    | 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence'
    | 'standard_work_duration_seed+t2_rhythm_template+system_schedule_rules'
  durationProvenance: DurationSuggestion['durationProvenance'] | 'candidate_asset_backed' | 'system_standard_asset_backed'
  businessReason: string | null
  businessReasonCode?: string | null
  businessReasonCodes?: string[]
  businessReasonParams?: Record<string, unknown> | null
  displaySummary?: string | null
  dataMaturity?: DurationSuggestion['dataMaturity']
  dataMaturityReasons?: string[]
  dataUpgradePath?: string[]
  dataUpgradeBlockedBy?: string[]
  factorAvailability?: Record<string, boolean>
  durationContributionMode?: string | null
  floorRhythmAdjustment?: Record<string, unknown> | null
  durationBoundaryRole?: DurationSuggestion['durationBoundaryRole']
  parentDurationBoundaryPolicy?: string | null
  nonAdditiveWithParentDuration?: boolean
  parentReferenceDurationDays?: number | null
  parentTaskTitle?: string | null
  independentReferenceDurationDays?: number | null
  packageChildPlanDurationDays?: number | null
  planDurationTruthSource?: string | null
  packageChildRhythmWindowStartDay?: number | null
  packageChildRhythmWindowEndDay?: number | null
  packageChildRhythmWindowRole?: string | null
}



export function buildDurationOutputContractSummary(code: DurationOutputCode) {
  const contract = getDurationOutputContract(code)
  if (!contract) return null
  return {
    code: contract.code,
    semanticFieldName: contract.semanticFieldName,
    ownerService: contract.ownerService,
    algorithmFactContextPhase: contract.algorithmFactContextPhase,
    allowedWriteTargets: contract.allowedWriteTargets,
    boundaryPolicy: contract.boundaryPolicy,
  }
}



export function withTemplateFastEstimateDurationOutput(
  suggestion: GeneratedTemplateDurationSuggestion,
): GeneratedTemplateDurationSuggestion {
  const contract = buildDurationOutputContractSummary('template_fast_estimate')
  if (!contract) return suggestion
  return {
    ...suggestion,
    durationOutputCode: 'template_fast_estimate',
    durationOutputSemanticFieldName: contract.semanticFieldName,
    durationOutputContract: contract,
    templateFastEstimateDays: suggestion.recommendedDurationDays,
  }
}



export function withPlanReferenceDurationOutput(
  suggestion: GeneratedTemplateDurationSuggestion | null,
): GeneratedTemplateDurationSuggestion | null {
  if (!suggestion || suggestion.recommendedDurationDays == null) return suggestion
  const contract = buildDurationOutputContractSummary('plan_reference')
  if (!contract) return suggestion
  const originalOutputCode = suggestion.durationOutputCode ?? null
  const alreadyPlanReference = originalOutputCode === 'plan_reference'
  const cameFromFastTemplate = !alreadyPlanReference && (
    originalOutputCode === 'template_fast_estimate'
    || (originalOutputCode !== 'contextual_reference' && String(suggestion.forecastSource ?? '').includes('sync_fast_template'))
  )
  const target: DurationOutputWriteTarget = 'plan_task_duration'
  if (cameFromFastTemplate) {
    const fastContract = buildDurationOutputContractSummary('template_fast_estimate')
    const fastWriteEvaluation = evaluateDurationOutputWrite({
      outputCode: 'template_fast_estimate',
      target,
    })
    const deniedPromotion = evaluateDurationOutputPromotion({
      fromOutputCode: 'template_fast_estimate',
      toOutputCode: 'plan_reference',
      policyCode: 'fast_template_promotion_denied_to_plan_reference',
      writeTarget: target,
      promotedByService: 'wbsTemplateGenerationService',
      sourceFieldName: 'templateFastEstimateDays',
      targetFieldName: contract.semanticFieldName,
      excludedContextFactors: [
        'runtime_execution_facts',
        'db_backed_duration_context',
        'historical_benchmark_lookup',
      ],
      quality: 'cold_start_reference',
    })
    return {
      ...suggestion,
      durationOutputCode: 'template_fast_estimate',
      durationOutputSemanticFieldName: fastContract?.semanticFieldName ?? 'templateFastEstimateDays',
      durationOutputContract: fastContract ?? suggestion.durationOutputContract ?? null,
      durationOutputWriteEvaluation: fastWriteEvaluation,
      durationOutputPromotion: deniedPromotion,
      templateFastEstimateDays: suggestion.templateFastEstimateDays ?? suggestion.recommendedDurationDays,
      planReferenceDays: null,
    }
  }
  if (!alreadyPlanReference && originalOutputCode !== 'contextual_reference') {
    const originalContract = originalOutputCode
      ? buildDurationOutputContractSummary(originalOutputCode as DurationOutputCode)
      : null
    const writeEvaluation = evaluateDurationOutputWrite({
      outputCode: originalOutputCode ?? '',
      target,
    })
    const deniedPromotion = evaluateDurationOutputPromotion({
      fromOutputCode: originalOutputCode ?? 'unknown',
      toOutputCode: 'plan_reference',
      policyCode: 'duration_output_to_plan_reference',
      writeTarget: target,
      promotedByService: 'wbsTemplateGenerationService',
      sourceFieldName: originalContract?.semanticFieldName ?? null,
      targetFieldName: contract.semanticFieldName,
      excludedContextFactors: [],
      quality: 'unapproved_plan_reference_source',
    })
    return {
      ...suggestion,
      durationOutputWriteEvaluation: writeEvaluation,
      durationOutputPromotion: deniedPromotion,
      planReferenceDays: null,
    }
  }
  const promotedWriteEvaluation = evaluateDurationOutputWrite({
    outputCode: 'plan_reference',
    target,
  })
  const shouldRecordPromotion = !alreadyPlanReference
  const durationOutputPromotion = shouldRecordPromotion
    ? evaluateDurationOutputPromotion({
      fromOutputCode: originalOutputCode ?? (cameFromFastTemplate ? 'template_fast_estimate' : 'unknown'),
      toOutputCode: 'plan_reference',
      policyCode: cameFromFastTemplate
        ? 'fast_template_promotion_denied_to_plan_reference'
        : originalOutputCode === 'contextual_reference'
          ? 'contextual_reference_to_plan_reference_on_explicit_plan_generation'
          : 'duration_output_to_plan_reference',
      writeTarget: target,
      promotedByService: 'wbsTemplateGenerationService',
      sourceFieldName: cameFromFastTemplate
        ? 'templateFastEstimateDays'
        : originalOutputCode === 'contextual_reference'
          ? 'contextualReferenceDays'
          : null,
      targetFieldName: contract.semanticFieldName,
      excludedContextFactors: cameFromFastTemplate
        ? [
          'runtime_execution_facts',
          'db_backed_duration_context',
          'historical_benchmark_lookup',
        ]
        : [],
      quality: cameFromFastTemplate ? 'cold_start_reference' : 'plan_creation_reference',
    })
    : suggestion.durationOutputPromotion ?? null
  const semanticPlanReferenceDays = alreadyPlanReference
    ? readPositiveNumber(suggestion.planReferenceDays)
    : originalOutputCode === 'contextual_reference'
      ? readPositiveNumber(suggestion.contextualReferenceDays)
      : null
  return {
    ...suggestion,
    durationOutputCode: 'plan_reference',
    durationOutputSemanticFieldName: contract.semanticFieldName,
    durationOutputContract: contract,
    durationOutputWriteEvaluation: promotedWriteEvaluation,
    durationOutputPromotion,
    planReferenceDays: semanticPlanReferenceDays,
    contextualReferenceDays: originalOutputCode === 'contextual_reference'
      ? suggestion.contextualReferenceDays ?? null
      : suggestion.contextualReferenceDays ?? null,
    templateFastEstimateDays: suggestion.templateFastEstimateDays
      ?? null,
  }
}



export function readWritablePlanTaskDurationDays(
  suggestion: GeneratedTemplateDurationSuggestion | null | undefined,
) {
  if (!suggestion) return null
  const evaluation = suggestion.durationOutputWriteEvaluation
    ?? evaluateDurationOutputWrite({
      outputCode: suggestion.durationOutputCode ?? '',
      target: 'plan_task_duration',
    })
  if (!evaluation.allowed) return null
  if (suggestion.durationOutputPromotion && suggestion.durationOutputPromotion.promotionAllowed !== true) return null
  if (suggestion.durationOutputCode !== 'plan_reference') return null
  return readPositiveNumber(suggestion.planReferenceDays)
}



export function readGeneratedDurationSuggestion(value: unknown): GeneratedTemplateDurationSuggestion | null {
  const record = readRecord(value)
  return Object.keys(record).length > 0
    ? record as unknown as GeneratedTemplateDurationSuggestion
    : null
}



export function syncPlanReferenceDurationSuggestionDays(
  suggestion: GeneratedTemplateDurationSuggestion | null | undefined,
  referenceDays: unknown,
): GeneratedTemplateDurationSuggestion | null {
  const days = readPlanReferenceDurationNumber(referenceDays)
  if (!suggestion || !days) return suggestion ?? null
  return withPlanReferenceDurationOutput({
    ...suggestion,
    recommendedDurationDays: days,
    conservativeDurationDays: Math.max(
      days,
      readPositiveNumber(suggestion.conservativeDurationDays) ?? days,
    ),
    planReferenceDays: days,
  })
}



export function appendDurationBusinessReason(reason: string | null | undefined, addition: string) {
  const existing = normalizeText(reason)
  const next = normalizeText(addition)
  if (!next) return existing || null
  if (!existing) return next
  return existing.includes(next) ? existing : `${existing}；${next}`
}



export function withChildPlanRollupDurationTruth(
  suggestion: GeneratedTemplateDurationSuggestion,
  row: GeneratedTemplateRow,
): GeneratedTemplateDurationSuggestion {
  const metadata = readRecord(row.values.standard_task_metadata)
  const planRollup = readRecord(metadata.planRollup)
  if (normalizeText(planRollup.source) !== 'child_plan_window') return suggestion
  if (planRollup.appliedToPlanWindow !== true) return suggestion

  const plannedDurationDays = readPlanReferenceDurationNumber(planRollup.plannedDurationDays)
  const referenceDurationDays = readPlanReferenceDurationNumber(planRollup.referenceDurationDays)
  const childReferenceDurationTotal = readPlanReferenceDurationNumber(planRollup.childReferenceDurationTotal)
  const childCount = readPositiveNumber(planRollup.childCount)
  const referenceDurationPolicy = normalizeText(planRollup.referenceDurationPolicy) || null
  const displayDays = plannedDurationDays ?? referenceDurationDays

  return {
    ...suggestion,
    durationBoundaryRole: 'aggregate_parent_duration',
    planDurationTruthSource: 'child_plan_window_rollup',
    businessReason: appendDurationBusinessReason(
      suggestion.businessReason,
      '父级任务工期来自子任务计划窗口汇总，父级 seed 仅保留为解释或生成参考。',
    ),
    businessReasonCodes: uniqueStringArray([
      ...(suggestion.businessReasonCodes ?? []),
      'CHILD_PLAN_WINDOW_ROLLUP',
    ]),
    businessReasonParams: {
      ...readRecord(suggestion.businessReasonParams),
      planDurationTruthSource: 'child_plan_window_rollup',
      childPlanWindowRollup: {
        source: 'child_plan_window',
        plannedDurationDays: plannedDurationDays ?? null,
        referenceDurationDays: referenceDurationDays ?? null,
        referenceDurationPolicy,
        childReferenceDurationTotal: childReferenceDurationTotal ?? null,
        childCount: childCount ?? null,
      },
    },
    displaySummary: displayDays
      ? `计划窗口 ${displayDays} 天，来自子任务计划窗口汇总；父级参考不再单独作为最终工期。`
      : suggestion.displaySummary,
    factorAvailability: {
      ...(suggestion.factorAvailability ?? {}),
      child_plan_window_rollup: true,
    },
  }
}



export type TemplateNode = {
  id: string
  stableCode: string
  templateId: string
  parentId: string | null
  name: string
  categoryType: ChinaTemplateCategoryType | 'custom'
  sourceStandard: string | null
  sourceVersion: string | null
  sourceClauseRef: string | null
  defaultDurationDays: number | null
  defaultResponsibleUnitRole: string | null
  defaultDependencyMode: 'FS' | 'SS' | 'FF' | 'SF'
  defaultMilestone: boolean
  engineeringCategoryId: string | null
  standardWorkCode: string | null
  standardWorkName: string | null
  reviewNeeded: boolean
  webVerified: boolean
  metadata: Record<string, unknown>
  children: TemplateNode[]
}



export type GeneratedTemplateProcessConstraintRule = Pick<
  V1474ProcessConstraintRule,
  | 'stableCode'
  | 'constraintType'
  | 'applicationMode'
  | 'impactMode'
  | 'runtimeActionPolicy'
  | 'timeSourcePolicy'
  | 'durationLookupPolicy'
  | 'durationLookupKeys'
  | 'carrierProcessHints'
  | 'durationAuthorityPolicy'
  | 'durationDoubleCountPolicy'
  | 'partialOverlapRatio'
  | 'startAfterPercent'
  | 'scopeGranularity'
  | 'releaseQuantityPolicy'
  | 'minReleaseQuantityPercent'
  | 'quantityEvidenceRequirement'
  | 'quantityProxyRiskLevel'
  | 'quantitySourcePriority'
  | 'insufficientQuantityPolicy'
  | 'quantityDoubleCountPolicy'
  | 'sourceStandard'
  | 'sourceVersion'
  | 'sourceClauseRef'
  | 'confidence'
>



export type EngineeringFeatureProfile = {
  businessType: string | null
  businessSubtype: string | null
  planScopeCaliber: string | null
  deliveryStandard: string | null
  terminalEvent: string | null
  recommendationPacks: string[]
  projectTypeCode: string | null
  structureTypeCode: string | null
  methodVariantCodes: string[]
  prefabSystemCodes: string[]
  elementVariantCodes: string[]
  externalInterfaceCodes: string[]
  hardConstraintCodes: string[]
  projectFeatures: Record<string, unknown>
  detailLevel: string | null
  buildingPatternCodes: string[]
  functionalUsageCodes: string[]
  floorUsageCodes: string[]
  functionalCategoryCodes: string[]
  specialRoomTypeCodes: string[]
  physicalZoneTypeCodes: string[]
  climateSignals: string[]
  weatherImpactBands: string[]
  locationFacts: Record<string, unknown>
  scopeOrganizationFacts: Record<string, unknown>
  totalAreaM2: number | null
  aboveGroundAreaM2: number | null
  buildingCount: number | null
  standardFloorCount: number | null
  highestBuildingFloorCount: number | null
  basementLevelCount: number | null
  basementAreaM2: number | null
  siteAreaM2: number | null
  foundationDepthM: number | null
  prefabRate: number | null
  maxSpanM: number | null
  supportHeightM: number | null
  hasCivilDefense: boolean | null
  towerCraneCount: number | null
  constructionHoistCount: number | null
  algorithmSeedSourcePolicy?: AlgorithmSeedResolveContext['sourcePolicy']
}



export type GeneratedElementVariant = {
  code: string
  label: string
  source: 'explicit_engineering_feature' | 'row_name_suggestion'
  confidence: 'high' | 'medium' | 'low'
}



export type WbsTemplateCatalogItem = {
  id: string
  name: string
  source: 'builtin_seed' | 'database'
  nodeCount: number
  packType?: WbsTemplatePackType
  templateGroup?: WbsTemplateDomainGroup
  generationPolicy?: WbsTemplateGenerationPolicy
  triggerKeywords?: string[]
  domainScope?: string | null
  applicableScope?: string[]
  sourceStandards?: string[]
  sourceStandard?: string | null
  sourceVersion?: string | null
  evidenceSummary?: WbsTemplateEvidenceSummary | null
  nodes?: WbsTemplateCatalogNode[]
}



export type WbsTemplateCatalogResponse = {
  builtIn: {
    templateId: string
    templateCode: string
    templateName: string
    sourceStandard: string
    sourceVersion: string
    divisionCount: number
    nodeCount: number
    packType: WbsTemplatePackType
    templateGroup: WbsTemplateDomainGroup
    generationPolicy: WbsTemplateGenerationPolicy
    evidenceSummary: WbsTemplateEvidenceSummary
    nodes?: WbsTemplateCatalogNode[]
  }
  templates: WbsTemplateCatalogItem[]
}



export type WbsTemplateEvidenceSummary = {
  domainScope: string
  evidenceStatus: 'verified' | 'needs_review'
  reviewNeededCount: number
  webVerifiedFalseCount: number
  divisionCount: number
  subDivisionCount: number
  itemWorkCount: number
  processCount: number
  activityStepCount: number
  disciplineProcessCount: number
  genericFallbackProcessCount: number
  disciplineActivityStepCount: number
  genericActivityStepCount: number
  uniqueProcessNameCount: number
  uniqueActivityStepNameCount: number
}



export type WbsTemplateCatalogNode = {
  id: string
  stableCode: string
  name: string
  categoryType: TemplateNode['categoryType']
  engineeringCategoryId: string | null
  standardWorkCode: string | null
  standardWorkName: string | null
  packType: WbsTemplatePackType
  templateGroup: WbsTemplateDomainGroup
  generationPolicy: WbsTemplateGenerationPolicy
  defaultDurationDays: number | null
  sourceStandard: string | null
  sourceVersion: string | null
  sourceClauseRef: string | null
  reviewNeeded: boolean
  webVerified: boolean
  evidenceLevel: string | null
  verificationStatus: string | null
  applicableScope: string | null
  applicableProjectTypes: string[]
  applicableStructureTypes: string[]
  applicableMethodVariantCodes: string[]
  historyFeedbackPolicy: Record<string, unknown>
  children: WbsTemplateCatalogNode[]
}



export type WbsTemplateSeedValidationResult = {
  ok: boolean
  divisionCount: number
  subDivisionCount: number
  itemWorkCount: number
  processCount: number
  activityStepCount: number
  reviewNeededCount: number
  webVerifiedFalseCount: number
  disciplineProcessCount: number
  genericFallbackProcessCount: number
  disciplineActivityStepCount: number
  genericActivityStepCount: number
  uniqueProcessNameCount: number
  uniqueActivityStepNameCount: number
  catalogGroupCounts: Record<WbsTemplateCatalogGroup, number>
  issues: Array<{
    code: string
    severity: 'warn' | 'error'
    nodeCode?: string
    message: string
    details?: Record<string, unknown>
  }>
}



export function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}



export function buildWbsTemplateGenerationConsumedArtifacts(input: {
  generation: WbsTemplateGenerationRuntimeEvidenceSummary
  runtimeArtifactPublications: readonly WbsTemplateGenerationRuntimeArtifactPublication[]
  projectId?: string | null
  inputTaskIds?: readonly string[] | null
  inputSubjectIdByClientRowId?: ReadonlyMap<string, string>
  subjectType?: 'task' | 'baseline_item'
}): DurationRuntimeConsumerObservedArtifact[] {
  const projectId = normalizeText(input.projectId)
  const templateIds = uniqueStringArray([
    normalizeText(input.generation.templateId),
    ...((input.generation.templateIds ?? []).map(normalizeText)),
  ].filter(Boolean))
  const generationBatchId = normalizeText(input.generation.generationBatchId)
  const rowCount = Array.isArray(input.generation.rows) ? input.generation.rows.length : 0
  const inputTaskIds = uniqueStringArray((input.inputTaskIds ?? []).map(normalizeText).filter(Boolean))
  const subjectType = input.subjectType ?? 'task'
  const subjectIdByClientRowId = input.inputSubjectIdByClientRowId
  const publicationSubjectIds = (publication: WbsTemplateGenerationRuntimeArtifactPublication) => {
    if (!subjectIdByClientRowId) return []
    const publicationKey = normalizeText(publication.publicationKey)
    const publicationArtifactKey = normalizeText(
      readRecord(publication.observationContext).artifactKey
        ?? readRecord(publication.observationContext).artifact_key
        ?? readRecord(publication.observationContext).templateId
        ?? readRecord(publication.observationContext).template_id,
    )
    return uniqueStringArray((input.generation.rows ?? []).flatMap((row) => {
      const values = readRecord(row.values)
      const metadata = readRecord(values.standard_task_metadata)
      const durationMatches = readArray(metadata.durationLearningConsumptions)
        .map(readRecord)
        .some((consumption) => (
          normalizeText(consumption.assetKey) === normalizeText(publication.assetKey)
          && normalizeText(consumption.publicationKey) === publicationKey
          && normalizeText(consumption.artifactKey) === publicationArtifactKey
        ))
      const dependencyMatches = normalizeText(publication.assetKey) === 'dependency_rule_candidate'
        && row.predecessorDependencies.some((dependency) => (
          dependency.source === 'duration_learning_runtime_publication'
          && normalizeText(dependency.publicationKey) === publicationKey
          && normalizeText(dependency.artifactKey) === publicationArtifactKey
        ))
      if (!durationMatches && !dependencyMatches) return []
      const subjectId = normalizeText(subjectIdByClientRowId.get(row.clientRowId))
      return subjectId ? [subjectId] : []
    }))
  }
  return input.runtimeArtifactPublications
    .filter((publication) => WBS_TEMPLATE_GENERATION_CONSUMER_ASSET_KEYS.has(publication.assetKey))
    .filter((publication) => normalizeText(publication.publicationKey))
    .map((publication) => {
      const publicationKey = normalizeText(publication.publicationKey)
      const physicalSubjectIds = publicationSubjectIds(publication)
      const sourceEvidenceRefs = uniqueStringArray([
        ...(publication.sourceEvidenceRefs ?? []).map(normalizeText),
        [
          'runtime_publication',
          publication.assetKey,
          publicationKey,
        ].join(':'),
      ].filter(Boolean))
      return {
        assetKey: publication.assetKey,
        publicationKey,
        publicationStatus: publication.publicationStatus,
        sourceEvidenceRefs,
        observationContext: {
          ...(publication.observationContext ?? {}),
          projectId: projectId || null,
          generationBatchId: generationBatchId || null,
          templateId: templateIds[0] ?? null,
          templateIds,
          generationDepth: input.generation.generationDepth ?? null,
          rowCount,
          inputTaskIds: subjectType === 'task' ? physicalSubjectIds : [],
          inputSubjectIds: physicalSubjectIds,
          inputBaselineItemIds: subjectType === 'baseline_item' ? physicalSubjectIds : [],
          subjectType,
          lineageResolution: physicalSubjectIds.length > 0
            ? 'physical_generated_subject_subset'
            : 'no_physical_subject_lineage',
        },
      }
    })
}



export function recordWbsTemplateGenerationRuntimeConsumption(
  input: RecordWbsTemplateGenerationRuntimeConsumptionInput,
): Promise<DurationRuntimeConsumerFacadeArtifactsResult> {
  const projectId = normalizeText(input.projectId)
  const generationBatchId = normalizeText(input.generation.generationBatchId)
  const templateIds = uniqueStringArray([
    normalizeText(input.generation.templateId),
    ...((input.generation.templateIds ?? []).map(normalizeText)),
  ].filter(Boolean))
  const rowCount = Array.isArray(input.generation.rows) ? input.generation.rows.length : 0
  const inputTaskIds = uniqueStringArray((input.inputTaskIds ?? []).map(normalizeText).filter(Boolean))
  return recordWbsTemplateGenerationConsumedArtifacts({
    queryExec: input.queryExec,
    observedAt: input.observedAt,
    callContext: {
      projectId: projectId || null,
      generationBatchId: generationBatchId || null,
      templateId: templateIds[0] ?? null,
      templateIds,
      generationDepth: input.generation.generationDepth ?? null,
      rowCount,
      inputTaskIds,
    },
    sourceEvidenceRefs: [
      [
        'wbs_template_generation',
        projectId || 'no_project',
        generationBatchId || 'no_batch',
        templateIds.join('+') || 'no_template',
      ].join(':'),
    ],
    artifacts: buildWbsTemplateGenerationConsumedArtifacts({
      generation: input.generation,
      runtimeArtifactPublications: input.runtimeArtifactPublications,
      projectId,
      inputTaskIds,
      inputSubjectIdByClientRowId: input.inputSubjectIdByClientRowId,
      subjectType: input.subjectType,
    }),
  })
}



export function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}



export function normalizeDurationLearningProjectId(value: unknown) {
  const projectId = normalizeText(value)
  return isValidUUID(projectId) ? projectId : null
}



export function normalizeDependencyType(value: unknown): GeneratedTemplateDependency['dependencyType'] {
  const dependencyType = normalizeText(value).toUpperCase()
  if (dependencyType === 'SS' || dependencyType === 'FF' || dependencyType === 'SF') return dependencyType
  return 'FS'
}



export function normalizeDate(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text.slice(0, 10)
}



export function readConstructionCalendarContext(value: unknown): ConstructionCalendarContext | null {
  const record = readRecord(value)
  if (!Object.prototype.hasOwnProperty.call(record, 'basis')
    && !Object.prototype.hasOwnProperty.call(record, 'windows')) return null
  const windows = readArray(record.windows)
  const basis = normalizeText(record.basis) === 'official_construction_calendar_seed'
    ? 'official_construction_calendar_seed'
    : 'calendar_day'
  const availability = normalizeText(record.availability) === 'available'
    ? 'available'
    : 'unavailable'
  return normalizeConstructionCalendarForConsumption({
    basis,
    windows: windows.map((window) => readRecord(window)),
    calendarRef: normalizeText(record.calendarRef ?? record.calendar_ref) || null,
    calendarVersion: normalizeText(record.calendarVersion ?? record.calendar_version) || null,
    timezone: normalizeText(record.timezone) || null,
    availability,
    unavailableReason: normalizeText(record.unavailableReason ?? record.unavailable_reason) || null,
  })
}



export function readOperationConstructionCalendar(operation: PlanningTableOperation): ConstructionCalendarContext | null {
  return readConstructionCalendarContext(
    operation.constructionCalendar
      ?? operation.construction_calendar
      ?? readRecord(operation.clientContext ?? operation.client_context).constructionCalendar
      ?? readRecord(operation.clientContext ?? operation.client_context).construction_calendar,
  )
}



export function sanitizeGeneratedConstructionCalendarContext(constructionCalendar?: ConstructionCalendarContext | null) {
  if (!constructionCalendar) return null
  const normalizedCalendar = normalizeConstructionCalendarForConsumption(constructionCalendar)
  return {
    basis: normalizedCalendar.basis,
    calendarRef: normalizedCalendar.calendarRef ?? null,
    calendarVersion: normalizedCalendar.calendarVersion ?? null,
    timezone: normalizedCalendar.timezone ?? null,
    availability: normalizedCalendar.availability ?? 'unavailable',
    unavailableReason: normalizedCalendar.unavailableReason ?? null,
    windows: normalizedCalendar.windows.map((window) => ({
      stableCode: normalizeText(window.stableCode ?? window.holidayCode ?? window.holiday_code),
      holidayName: normalizeText(window.holidayName ?? window.holiday_name),
      startDate: normalizeDate(window.startDate ?? window.start_date),
      endDate: normalizeDate(window.endDate ?? window.end_date),
      countsAsConstructionShutdown: countsAsConstructionShutdown(window),
    })).filter((window) => window.startDate || window.endDate || window.stableCode || window.holidayName),
  }
}



export async function resolveGenerationConstructionCalendar(params: {
  operation: PlanningTableOperation
  projectId: string
  masterPlanProfile: GeneratedMasterPlanProfile | null
}): Promise<ConstructionCalendarContext | null> {
  const explicitCalendar = readOperationConstructionCalendar(params.operation)
  if (explicitCalendar) return explicitCalendar
  if (!params.masterPlanProfile) return null
  return resolveConstructionCalendarContext({ projectId: params.projectId })
}



export function addTemplateProductionDays(
  dateText: string,
  days: number,
  constructionCalendar?: ConstructionCalendarContext | null,
) {
  if (!isAuthoritativeConstructionCalendar(constructionCalendar)) return addDays(dateText, days)
  const parsed = parseConstructionCalendarDate(dateText)
  if (!parsed) return addDays(dateText, days)
  if (days >= 0) return addConstructionProductionDays(parsed, days + 1, constructionCalendar)
  return addDays(dateText, days)
}



export function subtractTemplateProductionDays(
  dateText: string,
  days: number,
  constructionCalendar?: ConstructionCalendarContext | null,
) {
  if (!isAuthoritativeConstructionCalendar(constructionCalendar)) return addDays(dateText, -days)
  const parsed = parseConstructionCalendarDate(dateText)
  if (!parsed) return addDays(dateText, -days)

  const cursor = parsed
  while (!isConstructionProductionDay(cursor, constructionCalendar)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  let remaining = Math.max(0, days)
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1)
    if (isConstructionProductionDay(cursor, constructionCalendar)) remaining -= 1
  }
  return calendarDateText(cursor)
}



export function addTemplateProductionDayOffset(
  dateText: string,
  days: number,
  constructionCalendar?: ConstructionCalendarContext | null,
) {
  if (days >= 0) return addTemplateProductionDays(dateText, days, constructionCalendar)
  return subtractTemplateProductionDays(dateText, Math.abs(days), constructionCalendar)
}



export function nextTemplateProductionDay(dateText: string, constructionCalendar?: ConstructionCalendarContext | null) {
  return addTemplateProductionDays(dateText, 1, constructionCalendar)
}



export function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}



export function readMasterPlanRowCountRange(value: unknown): [number, number] {
  const range = readArray(value)
  const lower = Math.max(1, Math.floor(readOptionalNumber(range[0]) ?? 80))
  const upper = Math.max(lower, Math.floor(readOptionalNumber(range[1]) ?? 180))
  return [lower, upper]
}



export function normalizeGeneratedMasterPlanProfile(value: unknown): GeneratedMasterPlanProfile | null {
  const profile = readRecord(value)
  const layer = normalizeText(profile.layer)
  if (layer !== 'master_plan') return null
  return {
    layer: 'master_plan',
    detailLevel: 'planning_skeleton',
    generationDepth: 'managed_frontier',
    rowCountRange: readMasterPlanRowCountRange(profile.rowCountRange ?? profile.row_count_range),
    rowProjectionMode: 'schedule_row',
    supportLayerPolicy: {
      gateMarkers: 'supporting_evidence_not_default_gantt_rows',
      inlineControls: 'embedded_under_schedule_rows',
      linkedProjections: 'review_reference_not_default_gantt_rows',
    },
    mutationBoundary: {
      writesProductionDependencies: false,
      writesProductionDates: false,
      writesCriticalPathFacts: false,
    },
  }
}



export function buildFallbackGeneratedMasterPlanProfile(): GeneratedMasterPlanProfile {
  return {
    layer: 'master_plan',
    detailLevel: 'planning_skeleton',
    generationDepth: 'managed_frontier',
    rowCountRange: [80, 180],
    rowProjectionMode: 'schedule_row',
    supportLayerPolicy: {
      gateMarkers: 'supporting_evidence_not_default_gantt_rows',
      inlineControls: 'embedded_under_schedule_rows',
      linkedProjections: 'review_reference_not_default_gantt_rows',
    },
    mutationBoundary: {
      writesProductionDependencies: false,
      writesProductionDates: false,
      writesCriticalPathFacts: false,
    },
  }
}



export function readOperationGeneratedMasterPlanProfile(
  operation: PlanningTableOperation,
  projectFacts = readOperationProjectFacts(operation),
): GeneratedMasterPlanProfile | null {
  const clientContext = readRecord(operation.clientContext ?? operation.client_context)
  return normalizeGeneratedMasterPlanProfile(clientContext.masterPlanProfile ?? clientContext.master_plan_profile)
    ?? normalizeGeneratedMasterPlanProfile(projectFacts.masterPlanProfile ?? projectFacts.master_plan_profile)
    ?? (
      normalizeText(clientContext.defaultPlanOutput ?? clientContext.default_plan_output ?? projectFacts.defaultPlanOutput ?? projectFacts.default_plan_output) === 'master_plan'
      || normalizeText(clientContext.planOutputLayer ?? clientContext.plan_output_layer ?? projectFacts.planOutputLayer ?? projectFacts.plan_output_layer) === 'master_plan'
        ? buildFallbackGeneratedMasterPlanProfile()
        : null
    )
}



export function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}



export function isTruthy(value: unknown) {
  return value === true || value === 1 || value === '1' || normalizeText(value).toLowerCase() === 'true'
}



export function readStringArray(value: unknown): string[] {
  return readArray(parseMaybeJson(value))
    .map((item) => normalizeText(item))
    .filter(Boolean)
}



export function readMergedStringArray(...values: unknown[]): string[] {
  return uniqueStringArray(values.flatMap((value) => readStringArray(value)))
}



export function readOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}



export function readCodeArray(value: unknown): string[] {
  return uniqueStringArray(readArray(parseMaybeJson(value))
    .flatMap((item) => typeof item === 'string' ? item.split(/[,\s]+/) : [item])
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean))
}



export function uniqueStringArray(values: string[]) {
  return [...new Set(values.map((item) => normalizeText(item)).filter(Boolean))]
}



export function buildScopeOrganizationFacts(scope: WbsTemplateScope): Record<string, unknown> {
  return buildScopeOrganizationFactsFromObjects(scope.scope_objects ?? scope.scopeObjects, {
    explicitFacts: scope.scope_organization_facts ?? scope.scopeOrganizationFacts,
    source: 'wizard_scope_objects',
  })
}



export function hasSharedBasementOrganizationFacts(featureProfile: EngineeringFeatureProfile) {
  const facts = readRecord(featureProfile.scopeOrganizationFacts)
  const signals = new Set(readCodeArray(facts.organizationSignals ?? facts.organization_signals))
  if (signals.has('shared_basement_service_range') || signals.has('shared_basement_serves_multiple_buildings')) return true

  const sharedBasementKindCounts = readRecord(
    facts.sharedBasementServiceTargetKindCounts
      ?? facts.shared_basement_service_target_kind_counts,
  )
  const sharedBuildingTargets = readOptionalNumber(sharedBasementKindCounts.building) ?? 0
  if (sharedBuildingTargets >= 2) return true

  const sharedBasementCount = readOptionalNumber(facts.sharedBasementObjectCount ?? facts.shared_basement_object_count) ?? 0
  const sharedTargetCount = readOptionalNumber(facts.sharedBasementServiceTargetCount ?? facts.shared_basement_service_target_count) ?? 0
  return sharedBasementCount > 0 && sharedTargetCount >= 2
}



export function buildEngineeringFeatureProfile(scope: WbsTemplateScope): EngineeringFeatureProfile {
  return {
    businessType: normalizeId(scope.business_type),
    businessSubtype: normalizeId(scope.business_subtype),
    planScopeCaliber: normalizeId(scope.plan_scope_caliber),
    deliveryStandard: normalizeId(scope.delivery_standard),
    terminalEvent: normalizeId(scope.terminal_event),
    recommendationPacks: uniqueStringArray(scope.recommendation_packs ?? []),
    projectTypeCode: normalizeId(scope.project_type_code),
    structureTypeCode: normalizeId(scope.structure_type_code),
    methodVariantCodes: uniqueStringArray(scope.method_variant_codes ?? []),
    prefabSystemCodes: uniqueStringArray(scope.prefab_system_codes ?? []),
    elementVariantCodes: uniqueStringArray(scope.element_variant_codes ?? []),
    externalInterfaceCodes: uniqueStringArray(scope.external_interface_codes ?? []),
    hardConstraintCodes: uniqueStringArray(scope.hard_constraint_codes ?? []),
    projectFeatures: readRecord(scope.project_features),
    detailLevel: normalizeId(scope.detail_level ?? scope.detailLevel),
    buildingPatternCodes: uniqueStringArray(scope.building_pattern_codes ?? []),
    functionalUsageCodes: uniqueStringArray(scope.functional_usage_codes ?? []),
    floorUsageCodes: uniqueStringArray(scope.floor_usage_codes ?? []),
    functionalCategoryCodes: uniqueStringArray(scope.functional_category_codes ?? []),
    specialRoomTypeCodes: uniqueStringArray(scope.special_room_type_codes ?? []),
    physicalZoneTypeCodes: uniqueStringArray(scope.physical_zone_type_codes ?? []),
    climateSignals: uniqueStringArray([
      ...(scope.climate_signals ?? []),
      normalizeId(scope.climate_signal),
      normalizeId(scope.monthly_climate_signal),
    ].filter(Boolean) as string[]),
    weatherImpactBands: uniqueStringArray(scope.weather_impact_bands ?? []),
    locationFacts: readRecord(scope.location_facts),
    scopeOrganizationFacts: buildScopeOrganizationFacts(scope),
    totalAreaM2: readOptionalNumber(scope.total_area_m2),
    aboveGroundAreaM2: readOptionalNumber(scope.above_ground_area_m2),
    buildingCount: readOptionalNumber(scope.building_count),
    standardFloorCount: readOptionalNumber(scope.standard_floor_count),
    highestBuildingFloorCount: readOptionalNumber(scope.highest_building_floor_count),
    basementLevelCount: readOptionalNumber(scope.basement_level_count),
    basementAreaM2: readOptionalNumber(scope.basement_area_m2),
    siteAreaM2: readOptionalNumber(scope.site_area_m2),
    foundationDepthM: readOptionalNumber(scope.foundation_depth_m),
    prefabRate: readOptionalNumber(scope.prefab_rate),
    maxSpanM: readOptionalNumber(scope.max_span_m),
    supportHeightM: readOptionalNumber(scope.support_height_m),
    hasCivilDefense: scope.hasCivilDefense ?? null,
    towerCraneCount: readOptionalNumber(scope.tower_crane_count),
    constructionHoistCount: readOptionalNumber(scope.construction_hoist_count),
    algorithmSeedSourcePolicy: scope.algorithm_seed_source_policy,
  }
}



export function buildFloorSequenceScope(index: number | null, total: number, source: WbsTemplateScope['floor_sequence_source']) {
  if (index === null || total <= 0) {
    return {
      floor_sequence_label: null,
      floor_sequence_level_number: null,
      floor_sequence_is_basement: null,
      floor_sequence_index: null,
      floor_sequence_number: null,
      floor_sequence_total: null,
      floor_sequence_position: null,
      floor_sequence_source: null,
    }
  }
  const position = total === 1 ? 'single' : index === 0 ? 'first' : index === total - 1 ? 'last' : 'middle'
  return {
    floor_sequence_label: null,
    floor_sequence_level_number: null,
    floor_sequence_is_basement: null,
    floor_sequence_index: index,
    floor_sequence_number: index + 1,
    floor_sequence_total: total,
    floor_sequence_position: position,
    floor_sequence_source: source,
  } satisfies Pick<
    WbsTemplateScope,
    | 'floor_sequence_index'
    | 'floor_sequence_number'
    | 'floor_sequence_total'
    | 'floor_sequence_position'
    | 'floor_sequence_source'
    | 'floor_sequence_label'
    | 'floor_sequence_level_number'
    | 'floor_sequence_is_basement'
  >
}



export function readFloorSequenceItems(scope: Record<string, unknown>) {
  const raw = readArray(parseMaybeJson(scope.floor_sequence ?? scope.floorSequence))
  return raw
    .map((item, index) => {
      const record = readRecord(item)
      const floorObjectId = normalizeId(record.floorObjectId ?? record.floor_object_id ?? record.id)
      const label = normalizeText(record.label ?? record.floorLabel ?? record.floor_label ?? record.name ?? record.object_name)
      const levelNumberValue = Number(record.levelNumber ?? record.level_number)
      const isBasement = record.isBasement === true || record.is_basement === true || (Number.isFinite(levelNumberValue) && levelNumberValue < 0)
      return {
        floorObjectId,
        label: label || (floorObjectId ? '' : `F${index + 1}`),
        levelNumber: Number.isFinite(levelNumberValue) ? levelNumberValue : null,
        isBasement,
      }
    })
    .filter((item) => item.floorObjectId || item.label)
}



export function readOperationProjectFacts(operation: PlanningTableOperation): Record<string, unknown> {
  return readRecord(operation.projectFacts)
}



export function readNumberFromSources(sources: Record<string, unknown>[], keys: string[]) {
  for (const source of sources) {
    for (const key of keys) {
      const value = readOptionalNumber(source[key])
      if (value !== null) return value
    }
  }
  return null
}



export function readBooleanFromSources(sources: Record<string, unknown>[], keys: string[]) {
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key]
      if (typeof value === 'boolean') return value
      if (value === 1) return true
      if (value === 0) return false
    }
  }
  return null
}



export function readCodeArrayFromSources(sources: Record<string, unknown>[], keys: string[]) {
  for (const source of sources) {
    for (const key of keys) {
      const values = readCodeArray(source[key])
      if (values.length > 0) return values
    }
  }
  return []
}



export const FOUNDATION_METHOD_VARIANT_CODE_ALIASES: Record<string, string[]> = {
  bored_pile: ['bored_pile'],
  precast_pile: ['precast_pile'],
  cfg_pile: ['cfg_pile'],
  diaphragm_wall: ['diaphragm_wall'],
  smw_pile: ['smw'],
  trd_wall: ['trd_wall'],
  soil_nailing: ['soil_nail'],
  anchor_support: ['shotcrete_anchor'],
  dewatering_well: ['dewatering_well'],
}



export const FOUNDATION_METHOD_VARIANT_CODE_SET = new Set([
  'pile_foundation',
  'bored_pile',
  'precast_pile',
  'cfg_pile',
  'diaphragm_wall',
  'vertical_retaining_support',
  'vertical_retaining',
  'smw',
  'smw_pile',
  'trd_wall',
  'soil_nail',
  'soil_nailing',
  'shotcrete_anchor',
  'anchor_support',
  'dewatering_well',
])



export const SHALLOW_NO_BASEMENT_INAPPLICABLE_METHOD_VARIANT_CODES = new Set([
  'diaphragm_wall',
  'vertical_retaining_support',
  'vertical_retaining',
  'smw',
  'smw_pile',
  'trd_wall',
  'soil_nail',
  'soil_nailing',
  'shotcrete_anchor',
  'anchor_support',
  'dewatering_well',
])



export function readSelectedFoundationMethodCandidateCodes(input: unknown) {
  return uniqueStringArray(
    readArray(input)
      .map((item) => readRecord(item))
      .filter((item) => item.selected === true)
      .map((item) => normalizeId(item.code ?? item.methodCode ?? item.method_code))
      .filter(Boolean),
  )
}



export function readSelectedFoundationMethodCandidateVariantCodes(
  scope: Record<string, unknown>,
  facts: Record<string, unknown>,
) {
  const scopeFeatures = readRecord(scope.project_features ?? scope.projectFeatures)
  const factFeatures = readRecord(facts.projectFeatures ?? facts.project_features)
  const selectedCandidateCodes = uniqueStringArray([
    ...readSelectedFoundationMethodCandidateCodes(scope.foundationMethodCandidates ?? scope.foundation_method_candidates),
    ...readSelectedFoundationMethodCandidateCodes(scopeFeatures.foundationMethodCandidates ?? scopeFeatures.foundation_method_candidates),
    ...readSelectedFoundationMethodCandidateCodes(facts.foundationMethodCandidates ?? facts.foundation_method_candidates),
    ...readSelectedFoundationMethodCandidateCodes(factFeatures.foundationMethodCandidates ?? factFeatures.foundation_method_candidates),
  ])
  return uniqueStringArray(selectedCandidateCodes.flatMap((code) => FOUNDATION_METHOD_VARIANT_CODE_ALIASES[code] ?? [code]))
}



export function isFoundationMethodVariantCode(code: string) {
  return FOUNDATION_METHOD_VARIANT_CODE_SET.has(normalizeId(code))
}



export function mergeMethodVariantCodesFromFacts(scope: Record<string, unknown>, facts: Record<string, unknown>) {
  const basementLevelCount = readNumberFromSources([scope, facts], ['basement_level_count', 'basementLevelCount'])
  const foundationDepthM = readNumberFromSources([scope, facts], ['foundation_depth_m', 'foundationDepthM'])
  const shallowNoBasement = basementLevelCount === 0 && foundationDepthM != null && foundationDepthM < 3
  const filterInapplicableShallowMethod = (codes: string[]) => shallowNoBasement
    ? codes.filter((code) => !SHALLOW_NO_BASEMENT_INAPPLICABLE_METHOD_VARIANT_CODES.has(normalizeId(code)))
    : codes
  const explicit = filterInapplicableShallowMethod(readCodeArray(scope.method_variant_codes ?? scope.methodVariantCodes))
  const fromFacts = filterInapplicableShallowMethod(readCodeArrayFromSources([facts], ['methodVariantCodes']))
  const selectedFoundationMethodCodes = filterInapplicableShallowMethod(
    readSelectedFoundationMethodCandidateVariantCodes(scope, facts),
  )
  const prefabRate = readNumberFromSources([scope], ['prefabRate', 'prefab_rate'])
    ?? readNumberFromSources([facts], ['prefabRate'])
  const methodCodes = selectedFoundationMethodCodes.length > 0
    ? uniqueStringArray([
      ...explicit.filter((code) => !isFoundationMethodVariantCode(code)),
      ...fromFacts.filter((code) => !isFoundationMethodVariantCode(code)),
      ...selectedFoundationMethodCodes,
    ])
    : uniqueStringArray([...explicit, ...fromFacts])
  if (prefabRate !== null && prefabRate > 0 && !methodCodes.includes('prefab')) {
    methodCodes.push('prefab')
  }
  return methodCodes
}



export function mergeElementVariantCodesFromFacts(scope: Record<string, unknown>, facts: Record<string, unknown>) {
  return uniqueStringArray([
    ...readCodeArray(scope.element_variant_codes ?? scope.elementVariantCodes),
    ...readCodeArrayFromSources([facts], ['elementVariantCodes']),
  ])
}



export function mergeBuildingPatternCodesFromFacts(scope: Record<string, unknown>, facts: Record<string, unknown>) {
  const scopeObservation = readRecord(scope.buildingPatternObservation ?? scope.building_pattern_observation)
  const factObservation = readRecord(facts.buildingPatternObservation)
  return uniqueStringArray([
    ...readCodeArray(scope.building_pattern_codes ?? scope.buildingPatternCodes),
    ...readCodeArray(scope.building_pattern_code ?? scope.buildingPatternCode),
    ...readCodeArray(scopeObservation.patternCodes ?? scopeObservation.pattern_codes),
    ...readCodeArray(scopeObservation.patternCode ?? scopeObservation.pattern_code),
    ...readCodeArrayFromSources([facts], ['buildingPatternCodes']),
    ...readCodeArrayFromSources([facts], ['buildingPatternCode']),
    ...readCodeArray(factObservation.patternCodes),
    ...readCodeArray(factObservation.patternCode),
  ])
}



export function mergeRecommendationPacksFromFacts(scope: Record<string, unknown>, facts: Record<string, unknown>) {
  return uniqueStringArray([
    ...readCodeArray(scope.recommendation_packs ?? scope.recommendationPacks),
    ...readCodeArrayFromSources([facts], ['recommendationPacks']),
  ])
}



export function mergeScopeCodeArrayFromFacts(
  scope: Record<string, unknown>,
  facts: Record<string, unknown>,
  scopeKeys: string[],
  factKeys: string[],
) {
  return uniqueStringArray([
    ...readCodeArrayFromSources([scope], scopeKeys),
    ...readCodeArrayFromSources([facts], factKeys),
  ])
}



export function buildInferredFloorSequence(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    floorObjectId: '',
    label: `L${index + 1}`,
    levelNumber: index + 1,
    isBasement: false,
  }))
}



export function buildInferredBuildingIds(count: number) {
  return Array.from({ length: count }, (_, index) => `B${index + 1}`)
}



export function shouldDeriveProjectOrganizationPolicy(scope: WbsTemplateScope) {
  const benchmarkReplayScopeMode = normalizeId(scope.benchmarkReplayScopeMode ?? scope.benchmark_replay_scope_mode)
  if (benchmarkReplayScopeMode === 'single_project_scope') return false

  const mode = normalizeId(scope.scope_expansion_mode)
  const buildingCount = Math.floor(readOptionalNumber(scope.building_count) ?? 0)
  const featureProfile = buildEngineeringFeatureProfile(scope)
  const businessType = normalizeId(featureProfile.businessType ?? featureProfile.projectTypeCode)
  const projectType = normalizeId(featureProfile.projectTypeCode)
  const policy = resolveProjectConstructionOrganizationPolicy(businessType, projectType, featureProfile)
  const laneDrivenOrganizationPolicy = policy.governance.curationStatus === 'seeded'
    && !policy.policyId.startsWith('fallback-')
    && policy.laneRole !== 'primary_building_lane'
  return (mode === 'project' || mode === 'entire_project')
    && (buildingCount > 1 || laneDrivenOrganizationPolicy)
}



export type ProjectOrganizationStrategy = {
  policyId: string
  strategy: string
  laneTotal: number
  lanePrefix: string
  laneRole: string
  confidence: 'high' | 'medium' | 'low'
  policy: ProjectConstructionOrganizationPolicy
  networkPolicy: ProjectConstructionOrganizationPolicy['networkPolicy']
}



export const PROJECT_SCOPE_ACTUALIZATION_RESOURCE_POLICY = 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver'



export type ProjectScopeCatalogActualizationDecision = {
  applies: boolean
  selected: boolean
  familyCode: string
  selectedCodes: string[]
  reasonCode: string
  confidence: 'high' | 'medium' | 'low'
}



export function isWholeProjectScope(scope: WbsTemplateScope) {
  const mode = normalizeId(scope.scope_expansion_mode)
  return mode === 'project' || mode === 'entire_project'
}



export function shouldPromoteManagedFrontierMaterializeDepth(node: TemplateNode, scope: WbsTemplateScope) {
  if (isExplicitSelectedNodeInScope(node, scope)) return true
  return isWholeProjectScope(scope) && Boolean(scope.project_organization_policy_id)
}



export function readActualizationCodeFamily(code: string) {
  return code.split('-').slice(0, 2).join('-')
}



export function selectedGroundwaterControlActualCarrierCodes(featureProfile: EngineeringFeatureProfile) {
  return (featureProfile.basementLevelCount ?? 0) > 0 || (featureProfile.foundationDepthM ?? 0) >= 3
    ? ['01-04-01']
    : []
}



export function selectedWaterproofActualCarrierCodes(featureProfile: EngineeringFeatureProfile) {
  return (featureProfile.basementLevelCount ?? 0) > 0 || (featureProfile.basementAreaM2 ?? 0) > 0
    ? ['01-07-01', '01-07-02']
    : []
}



export function selectedEarthworkActualCarrierCodes() {
  return ['01-05-01', '01-05-02']
}



export function isExplicitSelectedNodeInScope(node: TemplateNode, scope: WbsTemplateScope) {
  const selectedNodeStableCodes = new Set([
    ...(scope.selected_node_stable_codes ?? []),
    ...(scope.selectedNodeStableCodes ?? []),
  ].map(normalizeText).filter(Boolean))
  return selectedNodeStableCodes.has(node.stableCode)
    || selectedNodeStableCodes.has(node.id)
    || selectedNodeStableCodes.has(normalizeText(node.standardWorkCode))
}



export function deriveProjectOrganizationLaneTotal(params: {
  scope: WbsTemplateScope
  policy: ProjectConstructionOrganizationPolicy
  buildingCount: number
  lowRiseParallel: boolean
}) {
  const maximumLaneTotal = Math.max(1, Math.floor(params.lowRiseParallel ? 12 : params.policy.maxLaneTotal))
  if (params.lowRiseParallel || params.policy.laneRole === 'primary_building_lane') {
    return Math.min(params.buildingCount, maximumLaneTotal)
  }

  const sizing = params.policy.laneSizingPolicy
  if (sizing?.basis !== 'renovation_workface_proxy') {
    return Math.min(params.buildingCount, maximumLaneTotal)
  }

  const totalAreaM2 = Math.max(0, readOptionalNumber(params.scope.total_area_m2) ?? 0)
  const floorCount = Math.max(
    0,
    readOptionalNumber(params.scope.highest_building_floor_count)
      ?? readOptionalNumber(params.scope.standard_floor_count)
      ?? 0,
  )
  const areaLaneTotal = sizing.areaPerLaneM2 && totalAreaM2 > 0
    ? Math.ceil(totalAreaM2 / sizing.areaPerLaneM2)
    : 1
  const floorLaneTotal = sizing.floorsPerLane && floorCount > 0
    ? Math.ceil(floorCount / sizing.floorsPerLane)
    : 1

  return Math.min(maximumLaneTotal, Math.max(
    params.buildingCount,
    Math.max(1, Math.floor(sizing.minimumLaneTotal)),
    areaLaneTotal,
    floorLaneTotal,
  ))
}



export function withProjectOrganizationScope(scope: WbsTemplateScope, laneIndex: number | null, strategy: ProjectOrganizationStrategy): WbsTemplateScope {
  const laneNumber = laneIndex == null ? null : laneIndex + 1
  const lane = laneNumber == null ? 'shared_works' : `${strategy.lanePrefix}_${laneNumber}`
  const laneScopeGroup = laneNumber == null
    ? 'shared_project_scope'
    : strategy.laneRole === 'primary_building_lane'
      ? `building_group_${laneNumber}`
      : `${strategy.laneRole}_${laneNumber}`
  return {
    ...scope,
    project_organization_policy_id: strategy.policyId,
    project_organization_strategy: strategy.strategy,
    organization_lane: lane,
    organization_lane_role: laneNumber == null ? 'shared_works' : strategy.laneRole,
    organization_lane_index: laneIndex,
    organization_lane_total: strategy.laneTotal,
    organization_scope_group: laneScopeGroup,
    organization_shared_work: laneNumber == null,
    organization_confidence: strategy.confidence,
  }
}



export function explicitScopeCombosLength(scope: Record<string, unknown>) {
  return readArray(scope.scope_combos ?? scope.scopeCombos)
    .filter((comboInput) => {
      const combo = readRecord(comboInput)
      return Boolean(normalizeId(combo.floor_object_id ?? combo.floorObjectId))
    })
    .length
}



export function countExplicitScopeComboBuildings(scope: Record<string, unknown>) {
  return uniqueStringArray(readArray(scope.scope_combos ?? scope.scopeCombos)
    .map((comboInput) => {
      const combo = readRecord(comboInput)
      return normalizeId(combo.building_object_id ?? combo.buildingObjectId)
    })
    .filter(Boolean)).length
}



export function pickPersistableScopeValues(scope: WbsTemplateScope): Record<string, unknown> {
  return {
    engineering_object_id: scope.engineering_object_id ?? null,
    phase_object_id: scope.phase_object_id ?? null,
    section_object_id: scope.section_object_id ?? null,
    building_object_id: scope.building_object_id ?? null,
    building_sequence_source: scope.building_sequence_source ?? null,
    building_sequence_index: scope.building_sequence_index ?? null,
    building_sequence_number: scope.building_sequence_number ?? null,
    building_sequence_total: scope.building_sequence_total ?? null,
    floor_object_id: scope.floor_object_id ?? null,
    basement_object_id: scope.basement_object_id ?? null,
    physical_zone_object_id: scope.physical_zone_object_id ?? null,
    functional_area_object_id: scope.functional_area_object_id ?? null,
    scope_expansion_mode: scope.scope_expansion_mode ?? null,
    floor_series_count: scope.floor_series_count ?? null,
    floor_series_label: scope.floor_series_label ?? null,
    floor_series_source: scope.floor_series_source ?? null,
    floor_sequence_label: scope.floor_sequence_label ?? null,
    floor_sequence_level_number: scope.floor_sequence_level_number ?? null,
    floor_sequence_is_basement: scope.floor_sequence_is_basement ?? null,
    floor_sequence_index: scope.floor_sequence_index ?? null,
    floor_sequence_number: scope.floor_sequence_number ?? null,
    floor_sequence_total: scope.floor_sequence_total ?? null,
    floor_sequence_position: scope.floor_sequence_position ?? null,
    floor_sequence_source: scope.floor_sequence_source ?? null,
    business_type: scope.business_type ?? null,
    business_subtype: scope.business_subtype ?? null,
    recommendation_packs: scope.recommendation_packs ?? [],
    project_type_code: scope.project_type_code ?? null,
    structure_type_code: scope.structure_type_code ?? null,
    method_variant_codes: scope.method_variant_codes ?? [],
    element_variant_codes: scope.element_variant_codes ?? [],
    building_pattern_codes: scope.building_pattern_codes ?? [],
    functional_usage_codes: scope.functional_usage_codes ?? [],
    floor_usage_codes: scope.floor_usage_codes ?? [],
    functional_category_codes: scope.functional_category_codes ?? [],
    special_room_type_codes: scope.special_room_type_codes ?? [],
    physical_zone_type_codes: scope.physical_zone_type_codes ?? [],
    climate_signal: scope.climate_signal ?? null,
    monthly_climate_signal: scope.monthly_climate_signal ?? null,
    weather_impact_bands: scope.weather_impact_bands ?? [],
    total_area_m2: scope.total_area_m2 ?? null,
    above_ground_area_m2: scope.above_ground_area_m2 ?? null,
    building_count: scope.building_count ?? null,
    standard_floor_count: scope.standard_floor_count ?? null,
    highest_building_floor_count: scope.highest_building_floor_count ?? null,
    basement_level_count: scope.basement_level_count ?? null,
    basement_area_m2: scope.basement_area_m2 ?? null,
    site_area_m2: scope.site_area_m2 ?? null,
    foundation_depth_m: scope.foundation_depth_m ?? null,
    prefab_rate: scope.prefab_rate ?? null,
    max_span_m: scope.max_span_m ?? null,
    support_height_m: scope.support_height_m ?? null,
    hasCivilDefense: scope.hasCivilDefense ?? null,
    tower_crane_count: scope.tower_crane_count ?? null,
    construction_hoist_count: scope.construction_hoist_count ?? null,
    project_organization_policy_id: scope.project_organization_policy_id ?? null,
    project_organization_strategy: scope.project_organization_strategy ?? null,
    organization_lane: scope.organization_lane ?? null,
    organization_lane_role: scope.organization_lane_role ?? null,
    organization_lane_index: scope.organization_lane_index ?? null,
    organization_lane_total: scope.organization_lane_total ?? null,
    organization_scope_group: scope.organization_scope_group ?? null,
    organization_shared_work: scope.organization_shared_work ?? null,
    organization_confidence: scope.organization_confidence ?? null,
    benchmark_replay_scope_mode: scope.benchmark_replay_scope_mode ?? scope.benchmarkReplayScopeMode ?? null,
  }
}



export function pickDurationRelevantScopeValues(scope: WbsTemplateScope): Record<string, unknown> {
  const values = pickPersistableScopeValues(scope)
  return {
    ...values,
    building_object_id: scope.building_sequence_source === 'inferred_building_count'
      ? null
      : values.building_object_id,
    building_sequence_source: scope.building_sequence_source === 'inferred_building_count'
      ? null
      : values.building_sequence_source,
    building_sequence_index: null,
    building_sequence_number: null,
    project_organization_policy_id: null,
    project_organization_strategy: null,
    organization_lane: null,
    organization_lane_role: null,
    organization_lane_index: null,
    organization_scope_group: null,
    organization_shared_work: null,
  }
}



export function buildFloorSequenceMetadata(scope: WbsTemplateScope) {
  if (!scope.floor_sequence_source || scope.floor_sequence_index == null) return null
  return {
    source: scope.floor_sequence_source,
    index: scope.floor_sequence_index,
    number: scope.floor_sequence_number,
    total: scope.floor_sequence_total,
    position: scope.floor_sequence_position,
    label: scope.floor_sequence_label ?? null,
    levelNumber: scope.floor_sequence_level_number ?? null,
    isBasement: scope.floor_sequence_is_basement ?? false,
    floorObjectId: scope.floor_object_id ?? null,
    objectBinding: scope.floor_object_id ? 'engineering_object' : 'inferred_sequence_only',
  }
}



export function readMetadataCodeArray(metadata: Record<string, unknown>, ...keys: string[]) {
  return uniqueStringArray(keys.flatMap((key) => {
    const value = parseMaybeJson(metadata[key])
    return readArray(value).flatMap((item) => {
      if (typeof item === 'string') return item.split(/[,\s]+/)
      const record = readRecord(item)
      return [
        record.code,
        record.methodCode,
        record.method_code,
        record.projectTypeCode,
        record.project_type_code,
        record.structureTypeCode,
        record.structure_type_code,
      ].map(normalizeText).filter(Boolean)
    }).map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
  }))
}



export function hasCodeOverlap(actual: string[], expected: string[]) {
  if (expected.length === 0) return true
  const actualSet = new Set(actual.map((item) => normalizeText(item).toLowerCase()).filter(Boolean))
  return expected.some((item) => actualSet.has(normalizeText(item).toLowerCase()))
}



export function collectSelectedTemplateIdsFromScope(scope: WbsTemplateScope) {
  const metadata = readRecord((scope as Record<string, unknown>).metadata)
  return uniqueStringArray([
    ...readStringArray((scope as Record<string, unknown>).selected_template_ids),
    ...readStringArray((scope as Record<string, unknown>).selectedTemplateIds),
    ...readStringArray((scope as Record<string, unknown>).template_ids),
    ...readStringArray((scope as Record<string, unknown>).templateIds),
    ...readStringArray(metadata.selectedTemplateIds),
    ...readStringArray(metadata.selected_template_ids),
  ].map((item) => normalizeText(item).toLowerCase()).filter(Boolean))
}



export function inferSpecialtyTemplateIdsFromReferencedCodes(codes: string[]) {
  const codePrefixes = new Set(codes
    .map((code) => normalizeText(code).split('-')[0]?.toLowerCase())
    .filter(Boolean))
  if (codePrefixes.size === 0) return []

  return BUILT_IN_WBS_TEMPLATE_CATALOGS
    .filter((catalog) => getCatalogPackType(catalog) === 'specialty')
    .filter((catalog) => codePrefixes.has(getCatalogStableCodePrefix(catalog).toLowerCase()))
    .map((catalog) => catalog.templateId.toLowerCase())
}



export function readReferencedSpecialtyCodesFromMetadata(metadata: Record<string, unknown>) {
  return readMetadataCodeArray(
    metadata,
    'referencedSpecialtyCodes',
    'referenced_specialty_codes',
    'semanticReferencedSpecialtyCodes',
    'semantic_referenced_specialty_codes',
  )
}



export function nodeMatchesSelectedSpecialtyBranch(node: TemplateNode, scope: WbsTemplateScope) {
  const metadata = readRecord(node.metadata)
  const selectedTemplateIds = collectSelectedTemplateIdsFromScope(scope)
  const requiredTemplateIds = uniqueStringArray([
    ...readMetadataCodeArray(
      metadata,
      'applicableSpecialtyTemplateIds',
      'applicable_specialty_template_ids',
      'requiredSpecialtyTemplateIds',
      'required_specialty_template_ids',
      'branchTemplateIds',
      'branch_template_ids',
    ),
    ...inferSpecialtyTemplateIdsFromReferencedCodes(readReferencedSpecialtyCodesFromMetadata(metadata)),
  ])
  if (requiredTemplateIds.length > 0 && !hasCodeOverlap(selectedTemplateIds, requiredTemplateIds)) return false

  const excludedTemplateIds = readMetadataCodeArray(metadata, 'excludedSpecialtyTemplateIds', 'excluded_specialty_template_ids')
  if (excludedTemplateIds.length > 0 && hasCodeOverlap(selectedTemplateIds, excludedTemplateIds)) return false

  return true
}



export function resolveEngineeringFeatureProjectTypeCompatibilityCodes(featureProfile: EngineeringFeatureProfile) {
  return resolveProjectTypeCompatibilityCodes({
    businessType: featureProfile.businessType,
    businessSubtype: featureProfile.businessSubtype,
    projectTypeCode: featureProfile.projectTypeCode,
  })
}



export function nodeMatchesBranchFilters(node: TemplateNode, scope: WbsTemplateScope) {
  const metadata = readRecord(node.metadata)
  const selectionMode = normalizeText(metadata.branchSelectionMode ?? metadata.branch_selection_mode).toLowerCase()
  if (!selectionMode || selectionMode === 'always') return true
  if (selectionMode === 'by_project_type') {
    return true
  }
  if (selectionMode === 'by_specialty_selection') {
    return nodeMatchesSelectedSpecialtyBranch(node, scope)
  }
  if (selectionMode === 'by_project_type_or_specialty_selection') {
    const featureProfile = buildEngineeringFeatureProfile(scope)
    const projectType = normalizeText(featureProfile.projectTypeCode).toLowerCase()
    const compatibleProjectTypes = resolveEngineeringFeatureProjectTypeCompatibilityCodes(featureProfile)
    const applicableProjectTypes = readMetadataCodeArray(metadata, 'applicableProjectTypes', 'applicable_project_types')
    if (projectType && applicableProjectTypes.length > 0 && hasCodeOverlap(compatibleProjectTypes, applicableProjectTypes)) return true
    return nodeMatchesSelectedSpecialtyBranch(node, scope)
  }
  if (selectionMode === 'auto_by_trigger') {
    return true
  }
  return true
}



export function nodeMatchesEngineeringFeatureFilters(node: TemplateNode, scope: WbsTemplateScope) {
  const metadata = readRecord(node.metadata)
  const featureProfile = buildEngineeringFeatureProfile(scope)
  const projectType = normalizeText(featureProfile.projectTypeCode).toLowerCase()
  const compatibleProjectTypes = resolveEngineeringFeatureProjectTypeCompatibilityCodes(featureProfile)
  const structureType = normalizeText(featureProfile.structureTypeCode).toLowerCase()
  const methodVariants = featureProfile.methodVariantCodes.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
  const elementVariants = featureProfile.elementVariantCodes.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)

  const excludedProjectTypes = readMetadataCodeArray(metadata, 'excludedProjectTypes', 'excluded_project_types')
  if (projectType && excludedProjectTypes.length > 0 && hasCodeOverlap(compatibleProjectTypes, excludedProjectTypes)) return false

  const applicableProjectTypes = readMetadataCodeArray(metadata, 'applicableProjectTypes', 'applicable_project_types')
  if (projectType && applicableProjectTypes.length > 0 && !hasCodeOverlap(compatibleProjectTypes, applicableProjectTypes)) {
    const branchSelectionMode = normalizeText(metadata.branchSelectionMode ?? metadata.branch_selection_mode).toLowerCase()
    if (branchSelectionMode !== 'by_project_type_or_specialty_selection' || !nodeMatchesSelectedSpecialtyBranch(node, scope)) return false
  }

  const excludedStructureTypes = readMetadataCodeArray(metadata, 'excludedStructureTypes', 'excluded_structure_types')
  if (structureType && excludedStructureTypes.includes(structureType)) return false

  const applicableStructureTypes = readMetadataCodeArray(metadata, 'applicableStructureTypes', 'applicable_structure_types', 'applicableStructures', 'applicable_structures')
  if (structureType && applicableStructureTypes.length > 0 && !applicableStructureTypes.includes(structureType)) return false

  const excludedMethodVariants = readMetadataCodeArray(metadata, 'excludedMethodVariantCodes', 'excluded_method_variant_codes')
  if (excludedMethodVariants.length > 0 && hasCodeOverlap(methodVariants, excludedMethodVariants)) return false

  const applicableMethodVariants = readMetadataCodeArray(
    metadata,
    'applicableMethodVariantCodes',
    'applicable_method_variant_codes',
    'requiredMethodVariantCodes',
    'required_method_variant_codes',
    'methodVariantCodes',
    'method_variant_codes',
    'methodVariants',
    'method_variants',
  )
  if (applicableMethodVariants.length > 0 && !hasCodeOverlap(methodVariants, applicableMethodVariants)) return false

  const applicableFloorSequencePositions = readMetadataCodeArray(
    metadata,
    'applicableFloorSequencePositions',
    'applicable_floor_sequence_positions',
    'floorSequencePositions',
    'floor_sequence_positions',
  )
  const floorSequencePosition = normalizeText(scope.floor_sequence_position).toLowerCase()
  if (
    applicableFloorSequencePositions.length > 0
    && floorSequencePosition
    && !applicableFloorSequencePositions.map((item) => normalizeText(item).toLowerCase()).includes(floorSequencePosition)
  ) {
    return false
  }

  const excludedElementVariants = readMetadataCodeArray(metadata, 'excludedElementVariantCodes', 'excluded_element_variant_codes')
  if (excludedElementVariants.length > 0 && hasCodeOverlap(elementVariants, excludedElementVariants)) return false

  const applicableElementVariants = readMetadataCodeArray(metadata, 'applicableElementVariantCodes', 'applicable_element_variant_codes')
  if (applicableElementVariants.length > 0 && elementVariants.length > 0 && !hasCodeOverlap(elementVariants, applicableElementVariants)) return false

  if (!nodeMatchesBranchFilters(node, scope)) return false

  return true
}



export function compactNodeSearchText(node: TemplateNode) {
  const metadata = readRecord(node.metadata)
  return uniqueStringArray([
    node.name,
    node.standardWorkName ?? '',
    node.standardWorkCode ?? '',
    node.stableCode,
    ...readStringArray(metadata.searchKeywords),
    ...readStringArray(metadata.processKeywords),
  ]).join(' ').toLowerCase()
}



export function supportsElementVariantExpansion(node: TemplateNode) {
  if (node.categoryType !== 'process') return false
  const text = compactNodeSearchText(node)
  return supportsTitleWeakElementVariantExpansion(text)
}



export function elementVariantFromCode(
  code: string,
  source: GeneratedElementVariant['source'] = 'explicit_engineering_feature',
  confidence: GeneratedElementVariant['confidence'] = 'high',
): GeneratedElementVariant | null {
  const normalized = normalizeText(code).toLowerCase()
  return resolveTitleWeakElementVariant(normalized, source, confidence)
}



export function deriveElementVariantsForGeneration(node: TemplateNode, scope: WbsTemplateScope): GeneratedElementVariant[] {
  if (!supportsElementVariantExpansion(node)) return []
  return uniqueStringArray(scope.element_variant_codes ?? [])
    .map((code) => elementVariantFromCode(code))
    .filter((item): item is GeneratedElementVariant => Boolean(item))
}



export function inferElementVariantSuggestion(node: TemplateNode): GeneratedElementVariant | null {
  const text = compactNodeSearchText(node)
  return inferTitleWeakElementVariantSuggestion(text)
}



export function decorateTitleWithElementVariant(title: string, elementVariant: GeneratedElementVariant | null) {
  if (!elementVariant) return title
  const normalizedTitle = normalizeText(title)
  return normalizedTitle.includes(elementVariant.label)
    ? normalizedTitle
    : `${elementVariant.label}${normalizedTitle}`
}



export function compactTemplateNodeConstraintText(node: TemplateNode, metadata: Record<string, unknown>) {
  return uniqueStringArray([
    node.name,
    node.standardWorkName ?? '',
    node.standardWorkCode ?? '',
    node.stableCode,
    node.sourceClauseRef ?? '',
    ...readStringArray(metadata.searchKeywords),
    ...readStringArray(metadata.processKeywords),
    ...readStringArray(metadata.qualityStandardCodes),
    ...readStringArray(metadata.acceptanceCheckpoints),
  ]).join(' ')
}



export function serializeProcessConstraintRule(rule: V1474ProcessConstraintRule): GeneratedTemplateProcessConstraintRule {
  return {
    stableCode: rule.stableCode,
    constraintType: rule.constraintType,
    applicationMode: rule.applicationMode,
    impactMode: rule.impactMode,
    runtimeActionPolicy: rule.runtimeActionPolicy,
    timeSourcePolicy: rule.timeSourcePolicy,
    durationLookupPolicy: rule.durationLookupPolicy,
    durationLookupKeys: rule.durationLookupKeys,
    carrierProcessHints: rule.carrierProcessHints,
    durationAuthorityPolicy: rule.durationAuthorityPolicy,
    durationDoubleCountPolicy: rule.durationDoubleCountPolicy,
    partialOverlapRatio: rule.partialOverlapRatio,
    startAfterPercent: rule.startAfterPercent,
    scopeGranularity: rule.scopeGranularity,
    releaseQuantityPolicy: rule.releaseQuantityPolicy,
    minReleaseQuantityPercent: rule.minReleaseQuantityPercent,
    quantityEvidenceRequirement: rule.quantityEvidenceRequirement,
    quantityProxyRiskLevel: rule.quantityProxyRiskLevel,
    quantitySourcePriority: rule.quantitySourcePriority,
    insufficientQuantityPolicy: rule.insufficientQuantityPolicy,
    quantityDoubleCountPolicy: rule.quantityDoubleCountPolicy,
    sourceStandard: rule.sourceStandard,
    sourceVersion: rule.sourceVersion,
    sourceClauseRef: rule.sourceClauseRef,
    confidence: rule.confidence,
  }
}



export function getCatalogTemplateGroup(catalog: BuiltInWbsTemplateCatalog): WbsTemplateDomainGroup {
  return 'templateGroup' in catalog ? catalog.templateGroup : 'building_main'
}



export function getCatalogPackType(catalog: BuiltInWbsTemplateCatalog): WbsTemplatePackType {
  if ('packType' in catalog && catalog.packType) return catalog.packType
  return 'templateGroup' in catalog ? 'specialty' : 'core_quality'
}



export function getCatalogGenerationPolicy(catalog: BuiltInWbsTemplateCatalog): WbsTemplateGenerationPolicy {
  if ('generationPolicy' in catalog && catalog.generationPolicy) return catalog.generationPolicy
  if ('templateGroup' in catalog) return defaultWbsTemplateGenerationPolicy(catalog.templateGroup)
  return getCatalogPackType(catalog) === 'core_quality' ? 'default_selected' : 'explicit'
}



export function getCatalogTriggerKeywords(catalog: BuiltInWbsTemplateCatalog) {
  if ('triggerKeywords' in catalog && Array.isArray(catalog.triggerKeywords) && catalog.triggerKeywords.length > 0) return catalog.triggerKeywords
  if ('templateGroup' in catalog) return getDefaultWbsTemplateTriggerKeywords(catalog.templateGroup)
  return []
}



export function getCatalogDomainScope(catalog: BuiltInWbsTemplateCatalog) {
  return 'domainScope' in catalog ? catalog.domainScope : '房屋建筑工程标准主干'
}



export function getCatalogApplicableScope(catalog: BuiltInWbsTemplateCatalog) {
  return 'applicableScope' in catalog ? catalog.applicableScope : ['房屋建筑工程']
}



export function getCatalogSourceStandards(catalog: BuiltInWbsTemplateCatalog) {
  return 'sourceStandards' in catalog ? catalog.sourceStandards : [catalog.sourceStandard]
}



export function getBuiltInTemplateCatalog(templateId: string): BuiltInWbsTemplateCatalog | null {
  return BUILT_IN_WBS_TEMPLATE_BY_ID.get(templateId) ?? null
}



export function flattenCatalogNodes(nodes: ChinaTemplateCatalogNode[]): ChinaTemplateCatalogNode[] {
  const result: ChinaTemplateCatalogNode[] = []
  const visit = (node: ChinaTemplateCatalogNode) => {
    result.push(node)
    ;(node.children ?? []).forEach(visit)
  }
  nodes.forEach(visit)
  return result
}



export function getFlattenedCatalogNodes(catalog: BuiltInWbsTemplateCatalog) {
  const cached = BUILT_IN_TEMPLATE_FLAT_NODES_BY_ID.get(catalog.templateId)
  if (cached) return cached
  const nodes = flattenCatalogNodes(catalog.divisions)
  BUILT_IN_TEMPLATE_FLAT_NODES_BY_ID.set(catalog.templateId, nodes)
  return nodes
}



export function getCatalogStableCodePrefix(catalog: BuiltInWbsTemplateCatalog) {
  const firstNode = getFlattenedCatalogNodes(catalog)[0]
  return normalizeText(firstNode?.stableCode).split('-')[0]
}



export function mapSeedNode(
  node: ChinaTemplateCatalogNode,
  parentId: string | null = null,
  catalog: BuiltInWbsTemplateCatalog = CHINA_GB55032_TEMPLATE_CATALOG,
): TemplateNode {
  const id = node.stableCode
  const metadata = readRecord(node.metadata)
  const explicitStandardWorkCode = normalizeText(
    metadata.standardWorkCode
      ?? metadata.standard_work_code
      ?? metadata.standardTaskCode
      ?? metadata.standard_task_code,
  ) || null
  const explicitStandardWorkName = normalizeText(
    metadata.standardWorkName
      ?? metadata.standard_work_name
      ?? metadata.standardTaskName
      ?? metadata.standard_task_name,
  ) || null
  return {
    id,
    stableCode: node.stableCode,
    templateId: catalog.templateId,
    parentId,
    name: node.name,
    categoryType: node.categoryType,
    sourceStandard: node.sourceStandard,
    sourceVersion: node.sourceVersion,
    sourceClauseRef: node.sourceClauseRef,
    defaultDurationDays: null,
    defaultResponsibleUnitRole: node.defaultResponsibleUnitRole ?? null,
    defaultDependencyMode: 'FS',
    defaultMilestone: false,
    engineeringCategoryId: null,
    standardWorkCode: explicitStandardWorkCode,
    standardWorkName: explicitStandardWorkName,
    reviewNeeded: Boolean(node.reviewNeeded),
    webVerified: Boolean(node.webVerified),
    metadata: {
      ...metadata,
      packType: getCatalogPackType(catalog),
      templateGroup: getCatalogTemplateGroup(catalog),
      generationPolicy: getCatalogGenerationPolicy(catalog),
      domainScope: getCatalogDomainScope(catalog),
      applicableScope: getCatalogApplicableScope(catalog).join(' / '),
    },
    children: (node.children ?? []).map((child) => mapSeedNode(child, id, catalog)),
  }
}



export function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}



export function readPositiveNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}



export function readPlanReferenceDurationNumber(value: unknown): number | null {
  const direct = readPositiveNumber(value)
  if (direct != null) return direct
  const record = readRecord(value)
  return readPositiveNumber(
    record.referenceDurationDays
      ?? record.plannedDurationDays
      ?? record.planReferenceDays
      ?? record.contextualReferenceDays
      ?? record.recommendedDurationDays,
  )
}



export async function mapWithConcurrencyLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  const queue = items.map((item, index) => ({ item, index }))
  const concurrency = Math.max(1, Math.min(limit, queue.length || 1))
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const next = queue.shift()
      if (!next) return
      await worker(next.item, next.index)
    }
  })
  await Promise.all(workers)
}



export function readDependencyMode(value: unknown): 'FS' | 'SS' | 'FF' | 'SF' {
  const text = normalizeText(value).toUpperCase()
  return text === 'SS' || text === 'FF' || text === 'SF' ? text : 'FS'
}



export function isBuiltInChinaTemplateId(templateId: string) {
  return BUILT_IN_WBS_TEMPLATE_BY_ID.has(templateId)
}



export function buildTemplateCatalogNotFoundError(templateId: string) {
  return Object.assign(new Error(`WBS template catalog '${templateId}' is not available. Use a governed built-in catalog id.`), {
    statusCode: 404,
    code: 'WBS_TEMPLATE_CATALOG_NOT_FOUND',
  })
}



export function flattenNodes(nodes: TemplateNode[]): TemplateNode[] {
  const result: TemplateNode[] = []
  const visit = (node: TemplateNode) => {
    result.push(node)
    node.children.forEach(visit)
  }
  nodes.forEach(visit)
  return result
}



export function serializeCatalogNode(node: TemplateNode): WbsTemplateCatalogNode {
  const metadata = readRecord(node.metadata)
  const templateGroup = (normalizeId(metadata.templateGroup) || 'building_main') as WbsTemplateDomainGroup
  const packType = (normalizeId(metadata.packType) || (templateGroup === 'building_main' ? 'core_quality' : 'specialty')) as WbsTemplatePackType
  const generationPolicy = (normalizeId(metadata.generationPolicy) || 'explicit') as WbsTemplateGenerationPolicy
  return {
    id: node.id,
    stableCode: node.stableCode,
    name: node.name,
    categoryType: node.categoryType,
    engineeringCategoryId: node.engineeringCategoryId,
    standardWorkCode: node.standardWorkCode,
    standardWorkName: node.standardWorkName,
    packType,
    templateGroup,
    generationPolicy,
    defaultDurationDays: node.defaultDurationDays,
    sourceStandard: node.sourceStandard,
    sourceVersion: node.sourceVersion,
    sourceClauseRef: node.sourceClauseRef,
    reviewNeeded: node.reviewNeeded,
    webVerified: node.webVerified,
    evidenceLevel: normalizeId(metadata.evidenceLevel),
    verificationStatus: normalizeId(metadata.verificationStatus),
    applicableScope: normalizeId(metadata.applicableScope),
    applicableProjectTypes: readMetadataCodeArray(metadata, 'applicableProjectTypes', 'applicable_project_types'),
    applicableStructureTypes: readMetadataCodeArray(metadata, 'applicableStructureTypes', 'applicable_structure_types', 'applicableStructures', 'applicable_structures'),
    applicableMethodVariantCodes: readMetadataCodeArray(metadata, 'applicableMethodVariantCodes', 'applicable_method_variant_codes', 'methodVariantCodes', 'method_variant_codes', 'methodVariants', 'method_variants'),
    historyFeedbackPolicy: readRecord(metadata.historyFeedbackPolicy ?? metadata.history_feedback_policy),
    children: node.children.map(serializeCatalogNode),
  }
}



export function getBuiltInTemplateNodeRoots(catalog: BuiltInWbsTemplateCatalog) {
  const cached = BUILT_IN_TEMPLATE_NODE_ROOTS_BY_ID.get(catalog.templateId)
  if (cached) return cached
  const nodes = catalog.divisions.map((node) => mapSeedNode(node, null, catalog))
  BUILT_IN_TEMPLATE_NODE_ROOTS_BY_ID.set(catalog.templateId, nodes)
  return nodes
}



export function getSerializedBuiltInTemplateNodes(catalog: BuiltInWbsTemplateCatalog) {
  const cached = BUILT_IN_TEMPLATE_SERIALIZED_NODES_BY_ID.get(catalog.templateId)
  if (cached) return cached
  const nodes = getBuiltInTemplateNodeRoots(catalog).map(serializeCatalogNode)
  BUILT_IN_TEMPLATE_SERIALIZED_NODES_BY_ID.set(catalog.templateId, nodes)
  return nodes
}
