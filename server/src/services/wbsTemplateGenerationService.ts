import { randomUUID } from 'crypto'
import { supabase } from './dbService.js'
import { logger } from '../middleware/logger.js'
import {
  getTaskDurationSuggestion,
  type DurationSuggestion,
} from './durationSuggestionService.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'
import {
  evaluateDurationOutputPromotion,
  evaluateDurationOutputWrite,
  getDurationOutputContract,
  type DurationOutputCode,
  type DurationOutputPromotionPolicyEvaluation,
  type DurationOutputWriteEvaluation,
  type DurationOutputWriteTarget,
} from './durationOutputGovernanceService.js'
import {
  type StandardWorkDurationSeedRule,
} from '../seeds/standardWorkDurationSeed.js'
import type { PlanningSurface, PlanningTableOperation } from '../types/planningTable.js'
import {
  CHINA_GB55032_TEMPLATE_CATALOG,
  flattenChinaTemplateCatalog,
  resolveStandardInternalFlowRule,
  type ChinaTemplateCatalog,
  type ChinaTemplateCatalogNode,
  type ChinaTemplateCategoryType,
  type StandardInternalFlowRule,
} from '../seeds/chinaGb50300TemplateCatalog.js'
import {
  DOMAIN_WBS_TEMPLATE_CATALOGS,
  WBS_TEMPLATE_PROJECT_TYPE_CODES,
  defaultWbsTemplateGenerationPolicy,
  getDefaultWbsTemplateTriggerKeywords,
  type DomainWbsTemplateCatalog,
  type WbsTemplateCatalogGroup,
  type WbsTemplateGenerationPolicy,
  type WbsTemplateDomainGroup,
  type WbsTemplatePackType,
  type WbsTemplateTriggerCondition,
} from '../seeds/domainWbsTemplateCatalogs.js'
import {
  findV1474ProcessConstraint,
  type V1474ProcessConstraintRule,
} from '../seeds/v1474ProcessConstraintSeed.js'
import {
  DEPENDENCY_INTENT_REFERENCE_FIELDS,
  inferV1475ReferenceCatalogGroupFromCode,
  isV1475ConstructionMainlineReference,
  inspectV1475DependencyIntentTemplates,
  resolveV1475ReferenceCatalogGroup,
  type V1475DependencyRelationRole,
  type V1475DependencyIntentTemplate,
} from '../seeds/v1475DependencyIntentTemplates.js'
import {
  V1475_CROSS_ITEM_WORKFLOW_SEED,
  type V1475CrossItemWorkflowRule,
} from '../seeds/v1475CrossItemWorkflowSeed.js'
import {
  inferTitleWeakElementVariantSuggestion,
  resolveTitleWeakElementVariant,
  supportsTitleWeakElementVariantExpansion,
} from '../seeds/v1472TitleWeakRecognitionSeed.js'
import {
  describeDurationContributionMode,
  inferDurationContributionMode,
  isDurationBearingContributionMode,
  normalizeDurationContributionMode,
  type DurationContributionMode,
} from '../seeds/durationContributionMode.js'
import {
  inferControlRoles,
  readDeclaredControlRoles,
} from '../seeds/controlRoles.js'
import {
  inferExecutionNature,
  normalizeExecutionNature,
} from '../seeds/executionNature.js'
import {
  addPlanDays as addDays,
  applyWbsPlanRollupToRows,
  distributePlanDurationAcrossActivitySteps,
  inclusivePlanDuration as daysInclusive,
  type WbsPlanRollupResult,
} from './wbsPlanRollupService.js'
import { resolveStandardWorkDurationSeed } from './algorithmSeedResolver.js'
import { buildWbsTaskStructureGovernanceMetadata } from './wbsTaskStructureGovernancePipelineService.js'
import {
  evaluateBaselineTargetAlignment,
  type ScheduleAccelerationMode,
  type ScheduleTargetFeasibility,
} from './scheduleAccelerationService.js'
import {
  inferExecutionProfileFromProjectFacts,
  isLowRiseMultiBuildingParallelScenario,
  normalizeProjectScenarioMethodCode,
  resolveScenarioScheduleProfile,
  type BuildingPatternExecutionArchetype,
  type BuildingPatternExecutionArchetypeProfile,
  type ProjectScenarioScheduleProfile,
  type WbsTemplateProjectRecommendationKey,
} from './projectScenarioTaxonomyService.js'
import { buildProjectGenerationFactsSnapshot } from './projectGenerationFactsSnapshotService.js'
import { persistProjectGenerationFactsSnapshot } from './projectGenerationFactsStoreService.js'
import { resolvePackageChildRhythmWindow } from './packageChildRhythmWindowService.js'
import { resolveProjectFactDurationScaling as resolveSharedProjectFactDurationScaling } from './durationProjectFactScaleService.js'
import {
  recordWbsTemplateGenerationConsumedArtifacts,
  type DurationRuntimeConsumerFacadeArtifactsResult,
} from './durationRuntimeConsumerObservationAdapterService.js'
import type {
  DurationRuntimeConsumerObservationQueryExec,
  DurationRuntimeConsumerObservedArtifact,
} from './durationRuntimeConsumerObservationService.js'

export const CHINA_GB55032_TEMPLATE_ID = CHINA_GB55032_TEMPLATE_CATALOG.templateId
export const CHINA_GB55032_TEMPLATE_CODE = CHINA_GB55032_TEMPLATE_CATALOG.templateCode
export const CHINA_GB55032_TEMPLATE_NAME = CHINA_GB55032_TEMPLATE_CATALOG.templateName
export const CHINA_GB55032_TEMPLATE_SOURCE_STANDARD = CHINA_GB55032_TEMPLATE_CATALOG.sourceStandard
export const CHINA_GB55032_TEMPLATE_SOURCE_VERSION = CHINA_GB55032_TEMPLATE_CATALOG.sourceVersion
export type WbsTemplateGenerationDepth = 'item_work' | 'process' | 'activity_step'
type WbsTemplateDurationSuggestionMode = 'fast_template' | 'full' | 'benchmark_plan_reference'
type WbsTemplatePhaseReleaseMode =
  | 'strict_finish_start'
  | 'overlap_after_days'
  | 'overlap_before_finish_days'
  | 'overlap_after_percent'
  | 'parallel_group'

type WbsTemplatePhaseReleasePolicy = {
  mode: WbsTemplatePhaseReleaseMode
  afterDays?: number
  beforeFinishDays?: number
  percent?: number
  groupKey?: string | null
  dependencyType?: GeneratedTemplateDependency['dependencyType']
  lagDays?: number
}

type ResolvedPhaseReleasePolicy = {
  policy: WbsTemplatePhaseReleasePolicy
  source: 'explicit_map' | 'operation' | 'inferred'
}

type BuiltInWbsTemplateCatalog = ChinaTemplateCatalog | DomainWbsTemplateCatalog

const BUILT_IN_WBS_TEMPLATE_CATALOGS: BuiltInWbsTemplateCatalog[] = [
  CHINA_GB55032_TEMPLATE_CATALOG,
  ...DOMAIN_WBS_TEMPLATE_CATALOGS,
]

const BUILT_IN_WBS_TEMPLATE_BY_ID = new Map(
  BUILT_IN_WBS_TEMPLATE_CATALOGS.map((catalog) => [catalog.templateId, catalog]),
)

const BUILT_IN_TEMPLATE_NODE_ROOTS_BY_ID = new Map<string, TemplateNode[]>()
const BUILT_IN_TEMPLATE_SERIALIZED_NODES_BY_ID = new Map<string, WbsTemplateCatalogNode[]>()
const BUILT_IN_TEMPLATE_FLAT_NODES_BY_ID = new Map<string, ChinaTemplateCatalogNode[]>()
const BUILT_IN_TEMPLATE_EVIDENCE_SUMMARY_BY_ID = new Map<string, WbsTemplateEvidenceSummary>()

const WBS_TEMPLATE_CATALOG_GROUPS: WbsTemplateCatalogGroup[] = [
  'core_quality',
  'site_management',
  'danger_control',
  'quality_responsibility',
  'project_milestone',
  'document_commercial_support',
  'specialty',
]

const GENERATION_DEPTH_RANK: Record<WbsTemplateGenerationDepth, number> = {
  item_work: 3,
  process: 4,
  activity_step: 5,
}

export const WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET = 500
export const WBS_TEMPLATE_GENERATION_SPLIT_BY_PHASE_ENABLED = true

const OVERVIEW_PROCESS_DETAIL_ITEM_PACK_CODES = new Set([
  'BDT-01-01-04',
  'BDT-01-01-05',
  'BDT-01-01-06',
  'MEP-01-01-01',
  'FIR-05-01-01',
  'FAC-01-01-01',
  'ELV-02-01-02',
])

const TEMPLATE_NODE_RANK: Record<TemplateNode['categoryType'], number> = {
  division: 1,
  sub_division: 2,
  item_work: 3,
  process: 4,
  activity_step: 5,
  custom: 4,
}

const TEMPLATE_GENERATION_FORBIDDEN_TASK_CODE_FIELDS = [
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
  phases?: string[]
  phaseIds?: string[]
  sections?: string[]
  sectionIds?: string[]
  business_type?: string | null
  business_subtype?: string | null
  recommendation_packs?: string[]
  project_type_code?: string | null
  structure_type_code?: string | null
  method_variant_codes?: string[]
  element_variant_codes?: string[]
  building_pattern_code?: string | null
  building_pattern_codes?: string[]
  functional_usage_codes?: string[]
  floor_usage_codes?: string[]
  functional_category_codes?: string[]
  special_room_type_codes?: string[]
  physical_zone_type_codes?: string[]
  climate_signal?: string | null
  monthly_climate_signal?: string | null
  weather_impact_bands?: string[]
  selected_template_ids?: string[]
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
}

type WbsTemplateFloorSequenceInput = {
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
  observedAt?: string
}

const WBS_TEMPLATE_GENERATION_CONSUMER_ASSET_KEYS = new Set([
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

export type GeneratedTemplateDependency = {
  clientRowId: string
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays: number
  intentCode?: string | null
  relationRole?: V1475DependencyIntentTemplate['relationRole'] | null
  strength?: V1475DependencyIntentTemplate['strength']
  source?: 'sibling_sequence' | 'dependency_intent_template' | 'cross_item_workflow' | 'internal_flow' | 'phase_chain'
  confidenceScore?: number | null
  confidenceLevel?: V1475DependencyIntentTemplate['confidenceLevel'] | null
  matchedReferenceField?: string | null
  auditReasonCode?: V1475DependencyIntentTemplate['auditReasonCode'] | null
  auditTrace?: string[] | null
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
  severity: 'warning' | 'error'
  nodeCode: string
  message: string
  details?: Record<string, unknown>
}

type InternalFlowRelationKind =
  | 'hard_sequence'
  | 'soft_sequence'
  | 'parallel_allowed'
  | 'acceptance_gate'

type InternalFlowCondition = {
  field: string
  operator: string
  values: string[]
}

type InternalFlowEvidenceRef = {
  code: string
  level: string
  ref: string | null
  rationale: string | null
}

type InternalFlowConditionalEffect = {
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

type InternalFlowRelation = {
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

type PreviousInternalFlowSibling = {
  clientRowId: string
  node: TemplateNode
  startDate: string
  endDate: string
  durationContributionMode: DurationContributionMode
}

export type GeneratedTemplateDurationSuggestion = {
  recommendedDurationDays: number | null
  conservativeDurationDays: number | null
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
  durationProvenance: DurationSuggestion['durationProvenance']
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

function buildDurationOutputContractSummary(code: DurationOutputCode) {
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

function withTemplateFastEstimateDurationOutput(
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

function withPlanReferenceDurationOutput(
  suggestion: GeneratedTemplateDurationSuggestion | null,
): GeneratedTemplateDurationSuggestion | null {
  if (!suggestion || suggestion.recommendedDurationDays == null) return suggestion
  const contract = buildDurationOutputContractSummary('plan_reference')
  if (!contract) return suggestion
  const originalOutputCode = suggestion.durationOutputCode ?? null
  const alreadyPlanReference = originalOutputCode === 'plan_reference'
  const cameFromFastTemplate = !alreadyPlanReference && (
    originalOutputCode === 'template_fast_estimate'
    || String(suggestion.forecastSource ?? '').includes('sync_fast_template')
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

function readWritablePlanTaskDurationDays(
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

function readGeneratedDurationSuggestion(value: unknown): GeneratedTemplateDurationSuggestion | null {
  const record = readRecord(value)
  return Object.keys(record).length > 0
    ? record as unknown as GeneratedTemplateDurationSuggestion
    : null
}

function syncPlanReferenceDurationSuggestionDays(
  suggestion: GeneratedTemplateDurationSuggestion | null | undefined,
  referenceDays: unknown,
): GeneratedTemplateDurationSuggestion | null {
  const days = readPositiveNumber(referenceDays)
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

function appendDurationBusinessReason(reason: string | null | undefined, addition: string) {
  const existing = normalizeText(reason)
  const next = normalizeText(addition)
  if (!next) return existing || null
  if (!existing) return next
  return existing.includes(next) ? existing : `${existing}；${next}`
}

function withChildPlanRollupDurationTruth(
  suggestion: GeneratedTemplateDurationSuggestion,
  row: GeneratedTemplateRow,
): GeneratedTemplateDurationSuggestion {
  const metadata = readRecord(row.values.standard_task_metadata)
  const planRollup = readRecord(metadata.planRollup)
  if (normalizeText(planRollup.source) !== 'child_plan_window') return suggestion
  if (planRollup.appliedToPlanWindow !== true) return suggestion

  const plannedDurationDays = readPositiveNumber(planRollup.plannedDurationDays)
  const referenceDurationDays = readPositiveNumber(planRollup.referenceDurationDays)
  const childReferenceDurationTotal = readPositiveNumber(planRollup.childReferenceDurationTotal)
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

function syncGeneratedRowDurationOutput(row: GeneratedTemplateRow) {
  let syncedSuggestion = syncPlanReferenceDurationSuggestionDays(
    row.durationSuggestion ?? readGeneratedDurationSuggestion(row.values.duration_suggestion),
    row.values.smart_reference_days,
  )
  if (!syncedSuggestion) return
  syncedSuggestion = withChildPlanRollupDurationTruth(syncedSuggestion, row)
  const durationContributionMode = normalizeDurationContributionMode(row.values.duration_contribution_mode)
  const writablePlanTaskDurationDays = isDurationBearingContributionMode(durationContributionMode)
    ? readWritablePlanTaskDurationDays(syncedSuggestion)
    : null
  const suggestionValue = buildGeneratedDurationSuggestionValue(
    syncedSuggestion,
    durationContributionMode,
  )
  const metadata = readRecord(row.values.standard_task_metadata)
  row.durationSuggestion = syncedSuggestion
  row.values = {
    ...row.values,
    smart_reference_days: writablePlanTaskDurationDays,
    duration_suggestion: suggestionValue,
    standard_task_metadata: {
      ...metadata,
      durationSuggestion: suggestionValue,
    },
  }
}

type TemplateNode = {
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

type GeneratedTemplateProcessConstraintRule = Pick<
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

type EngineeringFeatureProfile = {
  businessType: string | null
  businessSubtype: string | null
  recommendationPacks: string[]
  projectTypeCode: string | null
  structureTypeCode: string | null
  methodVariantCodes: string[]
  elementVariantCodes: string[]
  buildingPatternCodes: string[]
  functionalUsageCodes: string[]
  floorUsageCodes: string[]
  functionalCategoryCodes: string[]
  specialRoomTypeCodes: string[]
  physicalZoneTypeCodes: string[]
  climateSignals: string[]
  weatherImpactBands: string[]
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
}

type GeneratedElementVariant = {
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

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

export function buildWbsTemplateGenerationConsumedArtifacts(input: {
  generation: WbsTemplateGenerationRuntimeEvidenceSummary
  runtimeArtifactPublications: readonly WbsTemplateGenerationRuntimeArtifactPublication[]
  projectId?: string | null
}): DurationRuntimeConsumerObservedArtifact[] {
  const projectId = normalizeText(input.projectId)
  const templateIds = uniqueStringArray([
    normalizeText(input.generation.templateId),
    ...((input.generation.templateIds ?? []).map(normalizeText)),
  ].filter(Boolean))
  const generationBatchId = normalizeText(input.generation.generationBatchId)
  const rowCount = Array.isArray(input.generation.rows) ? input.generation.rows.length : 0
  return input.runtimeArtifactPublications
    .filter((publication) => WBS_TEMPLATE_GENERATION_CONSUMER_ASSET_KEYS.has(publication.assetKey))
    .filter((publication) => normalizeText(publication.publicationKey))
    .map((publication) => ({
      assetKey: publication.assetKey,
      publicationKey: normalizeText(publication.publicationKey),
      publicationStatus: publication.publicationStatus,
      sourceEvidenceRefs: publication.sourceEvidenceRefs,
      observationContext: {
        ...(publication.observationContext ?? {}),
        projectId: projectId || null,
        generationBatchId: generationBatchId || null,
        templateId: templateIds[0] ?? null,
        templateIds,
        generationDepth: input.generation.generationDepth ?? null,
        rowCount,
      },
    }))
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
    }),
  })
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function normalizeDependencyType(value: unknown): GeneratedTemplateDependency['dependencyType'] {
  const dependencyType = normalizeText(value).toUpperCase()
  if (dependencyType === 'SS' || dependencyType === 'FF' || dependencyType === 'SF') return dependencyType
  return 'FS'
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text.slice(0, 10)
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isTruthy(value: unknown) {
  return value === true || value === 1 || value === '1' || normalizeText(value).toLowerCase() === 'true'
}

function readStringArray(value: unknown): string[] {
  return readArray(parseMaybeJson(value))
    .map((item) => normalizeText(item))
    .filter(Boolean)
}

function readMergedStringArray(...values: unknown[]): string[] {
  return uniqueStringArray(values.flatMap((value) => readStringArray(value)))
}

function readOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readCodeArray(value: unknown): string[] {
  return uniqueStringArray(readArray(parseMaybeJson(value))
    .flatMap((item) => typeof item === 'string' ? item.split(/[,\s]+/) : [item])
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean))
}

function uniqueStringArray(values: string[]) {
  return [...new Set(values.map((item) => normalizeText(item)).filter(Boolean))]
}

function buildEngineeringFeatureProfile(scope: WbsTemplateScope): EngineeringFeatureProfile {
  return {
    businessType: normalizeId(scope.business_type),
    businessSubtype: normalizeId(scope.business_subtype),
    recommendationPacks: uniqueStringArray(scope.recommendation_packs ?? []),
    projectTypeCode: normalizeId(scope.project_type_code),
    structureTypeCode: normalizeId(scope.structure_type_code),
    methodVariantCodes: uniqueStringArray(scope.method_variant_codes ?? []),
    elementVariantCodes: uniqueStringArray(scope.element_variant_codes ?? []),
    buildingPatternCodes: uniqueStringArray(scope.building_pattern_codes ?? []),
    functionalUsageCodes: uniqueStringArray(scope.functional_usage_codes ?? []),
    floorUsageCodes: uniqueStringArray(scope.floor_usage_codes ?? []),
    functionalCategoryCodes: uniqueStringArray(scope.functional_category_codes ?? []),
    specialRoomTypeCodes: uniqueStringArray(scope.special_room_type_codes ?? []),
    physicalZoneTypeCodes: uniqueStringArray(scope.physical_zone_type_codes ?? []),
    climateSignals: uniqueStringArray([
      normalizeId(scope.climate_signal),
      normalizeId(scope.monthly_climate_signal),
    ].filter(Boolean) as string[]),
    weatherImpactBands: uniqueStringArray(scope.weather_impact_bands ?? []),
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
  }
}

function buildFloorSequenceScope(index: number | null, total: number, source: WbsTemplateScope['floor_sequence_source']) {
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

function readFloorSequenceItems(scope: Record<string, unknown>) {
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

function readOperationProjectFacts(operation: PlanningTableOperation): Record<string, unknown> {
  return readRecord(operation.projectFacts)
}

function readNumberFromSources(sources: Record<string, unknown>[], keys: string[]) {
  for (const source of sources) {
    for (const key of keys) {
      const value = readOptionalNumber(source[key])
      if (value !== null) return value
    }
  }
  return null
}

function readBooleanFromSources(sources: Record<string, unknown>[], keys: string[]) {
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

function readCodeArrayFromSources(sources: Record<string, unknown>[], keys: string[]) {
  for (const source of sources) {
    for (const key of keys) {
      const values = readCodeArray(source[key])
      if (values.length > 0) return values
    }
  }
  return []
}

function mergeMethodVariantCodesFromFacts(scope: Record<string, unknown>, facts: Record<string, unknown>) {
  const explicit = readCodeArray(scope.method_variant_codes ?? scope.methodVariantCodes)
  const fromFacts = readCodeArrayFromSources([facts], ['methodVariantCodes'])
  const prefabRate = readNumberFromSources([scope], ['prefabRate', 'prefab_rate'])
    ?? readNumberFromSources([facts], ['prefabRate'])
  const methodCodes = uniqueStringArray([...explicit, ...fromFacts])
  if (prefabRate !== null && prefabRate > 0 && !methodCodes.includes('prefab')) {
    methodCodes.push('prefab')
  }
  return methodCodes
}

function mergeElementVariantCodesFromFacts(scope: Record<string, unknown>, facts: Record<string, unknown>) {
  return uniqueStringArray([
    ...readCodeArray(scope.element_variant_codes ?? scope.elementVariantCodes),
    ...readCodeArrayFromSources([facts], ['elementVariantCodes']),
  ])
}

function mergeBuildingPatternCodesFromFacts(scope: Record<string, unknown>, facts: Record<string, unknown>) {
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

function mergeRecommendationPacksFromFacts(scope: Record<string, unknown>, facts: Record<string, unknown>) {
  return uniqueStringArray([
    ...readCodeArray(scope.recommendation_packs ?? scope.recommendationPacks),
    ...readCodeArrayFromSources([facts], ['recommendationPacks']),
  ])
}

function mergeScopeCodeArrayFromFacts(
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

function buildInferredFloorSequence(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    floorObjectId: '',
    label: `L${index + 1}`,
    levelNumber: index + 1,
    isBasement: false,
  }))
}

function buildInferredBuildingIds(count: number) {
  return Array.from({ length: count }, (_, index) => `B${index + 1}`)
}

function explicitScopeCombosLength(scope: Record<string, unknown>) {
  return readArray(scope.scope_combos ?? scope.scopeCombos)
    .filter((comboInput) => {
      const combo = readRecord(comboInput)
      return Boolean(normalizeId(combo.floor_object_id ?? combo.floorObjectId))
    })
    .length
}

function countExplicitScopeComboBuildings(scope: Record<string, unknown>) {
  return uniqueStringArray(readArray(scope.scope_combos ?? scope.scopeCombos)
    .map((comboInput) => {
      const combo = readRecord(comboInput)
      return normalizeId(combo.building_object_id ?? combo.buildingObjectId)
    })
    .filter(Boolean)).length
}

function pickPersistableScopeValues(scope: WbsTemplateScope): Record<string, unknown> {
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
  }
}

function buildFloorSequenceMetadata(scope: WbsTemplateScope) {
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

function readMetadataCodeArray(metadata: Record<string, unknown>, ...keys: string[]) {
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

function hasCodeOverlap(actual: string[], expected: string[]) {
  if (expected.length === 0) return true
  const actualSet = new Set(actual.map((item) => normalizeText(item).toLowerCase()).filter(Boolean))
  return expected.some((item) => actualSet.has(normalizeText(item).toLowerCase()))
}

function collectSelectedTemplateIdsFromScope(scope: WbsTemplateScope) {
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

function inferSpecialtyTemplateIdsFromReferencedCodes(codes: string[]) {
  const codePrefixes = new Set(codes
    .map((code) => normalizeText(code).split('-')[0]?.toLowerCase())
    .filter(Boolean))
  if (codePrefixes.size === 0) return []

  return BUILT_IN_WBS_TEMPLATE_CATALOGS
    .filter((catalog) => getCatalogPackType(catalog) === 'specialty')
    .filter((catalog) => codePrefixes.has(getCatalogStableCodePrefix(catalog).toLowerCase()))
    .map((catalog) => catalog.templateId.toLowerCase())
}

function readReferencedSpecialtyCodesFromMetadata(metadata: Record<string, unknown>) {
  return readMetadataCodeArray(
    metadata,
    'referencedSpecialtyCodes',
    'referenced_specialty_codes',
    'semanticReferencedSpecialtyCodes',
    'semantic_referenced_specialty_codes',
  )
}

function nodeMatchesSelectedSpecialtyBranch(node: TemplateNode, scope: WbsTemplateScope) {
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

function nodeMatchesBranchFilters(node: TemplateNode, scope: WbsTemplateScope) {
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
    const applicableProjectTypes = readMetadataCodeArray(metadata, 'applicableProjectTypes', 'applicable_project_types')
    if (projectType && applicableProjectTypes.length > 0 && applicableProjectTypes.includes(projectType)) return true
    return nodeMatchesSelectedSpecialtyBranch(node, scope)
  }
  if (selectionMode === 'auto_by_trigger') {
    return true
  }
  return true
}

function nodeMatchesEngineeringFeatureFilters(node: TemplateNode, scope: WbsTemplateScope) {
  const metadata = readRecord(node.metadata)
  const featureProfile = buildEngineeringFeatureProfile(scope)
  const projectType = normalizeText(featureProfile.projectTypeCode).toLowerCase()
  const structureType = normalizeText(featureProfile.structureTypeCode).toLowerCase()
  const methodVariants = featureProfile.methodVariantCodes.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
  const elementVariants = featureProfile.elementVariantCodes.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)

  const excludedProjectTypes = readMetadataCodeArray(metadata, 'excludedProjectTypes', 'excluded_project_types')
  if (projectType && excludedProjectTypes.includes(projectType)) return false

  const applicableProjectTypes = readMetadataCodeArray(metadata, 'applicableProjectTypes', 'applicable_project_types')
  if (projectType && applicableProjectTypes.length > 0 && !applicableProjectTypes.includes(projectType)) {
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

function compactNodeSearchText(node: TemplateNode) {
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

function supportsElementVariantExpansion(node: TemplateNode) {
  if (node.categoryType !== 'process') return false
  const text = compactNodeSearchText(node)
  return supportsTitleWeakElementVariantExpansion(text)
}

function elementVariantFromCode(
  code: string,
  source: GeneratedElementVariant['source'] = 'explicit_engineering_feature',
  confidence: GeneratedElementVariant['confidence'] = 'high',
): GeneratedElementVariant | null {
  const normalized = normalizeText(code).toLowerCase()
  return resolveTitleWeakElementVariant(normalized, source, confidence)
}

function deriveElementVariantsForGeneration(node: TemplateNode, scope: WbsTemplateScope): GeneratedElementVariant[] {
  if (!supportsElementVariantExpansion(node)) return []
  return uniqueStringArray(scope.element_variant_codes ?? [])
    .map((code) => elementVariantFromCode(code))
    .filter((item): item is GeneratedElementVariant => Boolean(item))
}

function inferElementVariantSuggestion(node: TemplateNode): GeneratedElementVariant | null {
  const text = compactNodeSearchText(node)
  return inferTitleWeakElementVariantSuggestion(text)
}

function decorateTitleWithElementVariant(title: string, elementVariant: GeneratedElementVariant | null) {
  if (!elementVariant) return title
  const normalizedTitle = normalizeText(title)
  return normalizedTitle.includes(elementVariant.label)
    ? normalizedTitle
    : `${elementVariant.label}${normalizedTitle}`
}

function compactTemplateNodeConstraintText(node: TemplateNode, metadata: Record<string, unknown>) {
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

function serializeProcessConstraintRule(rule: V1474ProcessConstraintRule): GeneratedTemplateProcessConstraintRule {
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

function collectDescendantProcessConstraintRules(node: TemplateNode): GeneratedTemplateProcessConstraintRule[] {
  const rules: GeneratedTemplateProcessConstraintRule[] = []
  for (const child of node.children) {
    const childMetadata = readRecord(child.metadata)
    if (child.categoryType === 'process' || child.categoryType === 'activity_step') {
      const seedRule = findV1474ProcessConstraint(compactTemplateNodeConstraintText(child, childMetadata))
      if (seedRule) rules.push(serializeProcessConstraintRule(seedRule))
      rules.push(...readArray(childMetadata.processConstraintRules)
        .map((item) => readRecord(item))
        .map((item) => ({
          stableCode: normalizeText(item.stableCode),
          constraintType: normalizeText(item.constraintType),
          applicationMode: normalizeText(item.applicationMode) as V1474ProcessConstraintRule['applicationMode'],
          impactMode: normalizeText(item.impactMode) as V1474ProcessConstraintRule['impactMode'],
          runtimeActionPolicy: normalizeText(item.runtimeActionPolicy) as V1474ProcessConstraintRule['runtimeActionPolicy'],
          timeSourcePolicy: normalizeText(item.timeSourcePolicy) as V1474ProcessConstraintRule['timeSourcePolicy'],
          durationLookupPolicy: normalizeText(item.durationLookupPolicy) as V1474ProcessConstraintRule['durationLookupPolicy'],
          durationLookupKeys: readStringArray(item.durationLookupKeys),
          carrierProcessHints: readStringArray(item.carrierProcessHints),
          durationAuthorityPolicy: normalizeText(item.durationAuthorityPolicy) as V1474ProcessConstraintRule['durationAuthorityPolicy'],
          durationDoubleCountPolicy: normalizeText(item.durationDoubleCountPolicy) as V1474ProcessConstraintRule['durationDoubleCountPolicy'],
          scopeGranularity: normalizeText(item.scopeGranularity) as V1474ProcessConstraintRule['scopeGranularity'],
          releaseQuantityPolicy: normalizeText(item.releaseQuantityPolicy) as V1474ProcessConstraintRule['releaseQuantityPolicy'],
          minReleaseQuantityPercent: Number(item.minReleaseQuantityPercent ?? 0) || 0,
          quantityEvidenceRequirement: normalizeText(item.quantityEvidenceRequirement) as V1474ProcessConstraintRule['quantityEvidenceRequirement'],
          quantityProxyRiskLevel: normalizeText(item.quantityProxyRiskLevel) as V1474ProcessConstraintRule['quantityProxyRiskLevel'],
          quantitySourcePriority: readStringArray(item.quantitySourcePriority) as V1474ProcessConstraintRule['quantitySourcePriority'],
          insufficientQuantityPolicy: normalizeText(item.insufficientQuantityPolicy) as V1474ProcessConstraintRule['insufficientQuantityPolicy'],
          quantityDoubleCountPolicy: normalizeText(item.quantityDoubleCountPolicy) as V1474ProcessConstraintRule['quantityDoubleCountPolicy'],
          sourceStandard: normalizeText(item.sourceStandard),
          sourceVersion: normalizeText(item.sourceVersion),
          sourceClauseRef: normalizeText(item.sourceClauseRef),
          confidence: normalizeText(item.confidence) as V1474ProcessConstraintRule['confidence'],
        }))
        .filter((item) => item.stableCode) as GeneratedTemplateProcessConstraintRule[])
    }
    rules.push(...collectDescendantProcessConstraintRules(child))
  }
  return rules
}

function buildProcessConstraintRules(
  node: TemplateNode,
  metadata: Record<string, unknown>,
): GeneratedTemplateProcessConstraintRule[] {
  const existingRules = readArray(metadata.processConstraintRules)
    .map((item) => readRecord(item))
    .map((item) => ({
      stableCode: normalizeText(item.stableCode),
      constraintType: normalizeText(item.constraintType),
      applicationMode: normalizeText(item.applicationMode) as V1474ProcessConstraintRule['applicationMode'],
      impactMode: normalizeText(item.impactMode) as V1474ProcessConstraintRule['impactMode'],
      runtimeActionPolicy: normalizeText(item.runtimeActionPolicy) as V1474ProcessConstraintRule['runtimeActionPolicy'],
      timeSourcePolicy: normalizeText(item.timeSourcePolicy) as V1474ProcessConstraintRule['timeSourcePolicy'],
      durationLookupPolicy: normalizeText(item.durationLookupPolicy) as V1474ProcessConstraintRule['durationLookupPolicy'],
      durationLookupKeys: readStringArray(item.durationLookupKeys),
      carrierProcessHints: readStringArray(item.carrierProcessHints),
      durationAuthorityPolicy: normalizeText(item.durationAuthorityPolicy) as V1474ProcessConstraintRule['durationAuthorityPolicy'],
      durationDoubleCountPolicy: normalizeText(item.durationDoubleCountPolicy) as V1474ProcessConstraintRule['durationDoubleCountPolicy'],
      scopeGranularity: normalizeText(item.scopeGranularity) as V1474ProcessConstraintRule['scopeGranularity'],
      releaseQuantityPolicy: normalizeText(item.releaseQuantityPolicy) as V1474ProcessConstraintRule['releaseQuantityPolicy'],
      minReleaseQuantityPercent: Number(item.minReleaseQuantityPercent ?? 0) || 0,
      quantityEvidenceRequirement: normalizeText(item.quantityEvidenceRequirement) as V1474ProcessConstraintRule['quantityEvidenceRequirement'],
      quantityProxyRiskLevel: normalizeText(item.quantityProxyRiskLevel) as V1474ProcessConstraintRule['quantityProxyRiskLevel'],
      quantitySourcePriority: readStringArray(item.quantitySourcePriority) as V1474ProcessConstraintRule['quantitySourcePriority'],
      insufficientQuantityPolicy: normalizeText(item.insufficientQuantityPolicy) as V1474ProcessConstraintRule['insufficientQuantityPolicy'],
      quantityDoubleCountPolicy: normalizeText(item.quantityDoubleCountPolicy) as V1474ProcessConstraintRule['quantityDoubleCountPolicy'],
      sourceStandard: normalizeText(item.sourceStandard),
      sourceVersion: normalizeText(item.sourceVersion),
      sourceClauseRef: normalizeText(item.sourceClauseRef),
      confidence: normalizeText(item.confidence) as V1474ProcessConstraintRule['confidence'],
    }))
    .filter((item) => item.stableCode)

  const seedRule = ['process', 'activity_step'].includes(node.categoryType)
    ? findV1474ProcessConstraint(compactTemplateNodeConstraintText(node, metadata))
    : null

  const descendantRules = node.categoryType === 'item_work'
    ? collectDescendantProcessConstraintRules(node)
    : []
  const rules = seedRule
    ? [...existingRules, serializeProcessConstraintRule(seedRule), ...descendantRules]
    : [...existingRules, ...descendantRules]
  const seen = new Set<string>()
  return rules.filter((rule) => {
    const key = `${rule.stableCode}:${rule.constraintType}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }) as GeneratedTemplateProcessConstraintRule[]
}

function getCatalogTemplateGroup(catalog: BuiltInWbsTemplateCatalog): WbsTemplateDomainGroup {
  return 'templateGroup' in catalog ? catalog.templateGroup : 'building_main'
}

function getCatalogPackType(catalog: BuiltInWbsTemplateCatalog): WbsTemplatePackType {
  if ('packType' in catalog && catalog.packType) return catalog.packType
  return 'templateGroup' in catalog ? 'specialty' : 'core_quality'
}

function getCatalogGenerationPolicy(catalog: BuiltInWbsTemplateCatalog): WbsTemplateGenerationPolicy {
  if ('generationPolicy' in catalog && catalog.generationPolicy) return catalog.generationPolicy
  if ('templateGroup' in catalog) return defaultWbsTemplateGenerationPolicy(catalog.templateGroup)
  return getCatalogPackType(catalog) === 'core_quality' ? 'default_selected' : 'explicit'
}

function getCatalogTriggerKeywords(catalog: BuiltInWbsTemplateCatalog) {
  if ('triggerKeywords' in catalog && Array.isArray(catalog.triggerKeywords) && catalog.triggerKeywords.length > 0) return catalog.triggerKeywords
  if ('templateGroup' in catalog) return getDefaultWbsTemplateTriggerKeywords(catalog.templateGroup)
  return []
}

function getCatalogDomainScope(catalog: BuiltInWbsTemplateCatalog) {
  return 'domainScope' in catalog ? catalog.domainScope : '房屋建筑工程标准主干'
}

function getCatalogApplicableScope(catalog: BuiltInWbsTemplateCatalog) {
  return 'applicableScope' in catalog ? catalog.applicableScope : ['房屋建筑工程']
}

function getCatalogSourceStandards(catalog: BuiltInWbsTemplateCatalog) {
  return 'sourceStandards' in catalog ? catalog.sourceStandards : [catalog.sourceStandard]
}

function getBuiltInTemplateCatalog(templateId: string): BuiltInWbsTemplateCatalog | null {
  return BUILT_IN_WBS_TEMPLATE_BY_ID.get(templateId) ?? null
}

function flattenCatalogNodes(nodes: ChinaTemplateCatalogNode[]): ChinaTemplateCatalogNode[] {
  const result: ChinaTemplateCatalogNode[] = []
  const visit = (node: ChinaTemplateCatalogNode) => {
    result.push(node)
    ;(node.children ?? []).forEach(visit)
  }
  nodes.forEach(visit)
  return result
}

function getFlattenedCatalogNodes(catalog: BuiltInWbsTemplateCatalog) {
  const cached = BUILT_IN_TEMPLATE_FLAT_NODES_BY_ID.get(catalog.templateId)
  if (cached) return cached
  const nodes = flattenCatalogNodes(catalog.divisions)
  BUILT_IN_TEMPLATE_FLAT_NODES_BY_ID.set(catalog.templateId, nodes)
  return nodes
}

function getCatalogStableCodePrefix(catalog: BuiltInWbsTemplateCatalog) {
  const firstNode = getFlattenedCatalogNodes(catalog)[0]
  return normalizeText(firstNode?.stableCode).split('-')[0]
}

function mapSeedNode(
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

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function readPositiveNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : null
}

function readDependencyMode(value: unknown): 'FS' | 'SS' | 'FF' | 'SF' {
  const text = normalizeText(value).toUpperCase()
  return text === 'SS' || text === 'FF' || text === 'SF' ? text : 'FS'
}

function isBuiltInChinaTemplateId(templateId: string) {
  return BUILT_IN_WBS_TEMPLATE_BY_ID.has(templateId)
}

function buildTemplateCatalogNotFoundError(templateId: string) {
  return Object.assign(new Error(`WBS template catalog '${templateId}' is not available. Use a governed built-in catalog id.`), {
    statusCode: 404,
    code: 'WBS_TEMPLATE_CATALOG_NOT_FOUND',
  })
}

function flattenNodes(nodes: TemplateNode[]): TemplateNode[] {
  const result: TemplateNode[] = []
  const visit = (node: TemplateNode) => {
    result.push(node)
    node.children.forEach(visit)
  }
  nodes.forEach(visit)
  return result
}

function serializeCatalogNode(node: TemplateNode): WbsTemplateCatalogNode {
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

function getBuiltInTemplateNodeRoots(catalog: BuiltInWbsTemplateCatalog) {
  const cached = BUILT_IN_TEMPLATE_NODE_ROOTS_BY_ID.get(catalog.templateId)
  if (cached) return cached
  const nodes = catalog.divisions.map((node) => mapSeedNode(node, null, catalog))
  BUILT_IN_TEMPLATE_NODE_ROOTS_BY_ID.set(catalog.templateId, nodes)
  return nodes
}

function getSerializedBuiltInTemplateNodes(catalog: BuiltInWbsTemplateCatalog) {
  const cached = BUILT_IN_TEMPLATE_SERIALIZED_NODES_BY_ID.get(catalog.templateId)
  if (cached) return cached
  const nodes = getBuiltInTemplateNodeRoots(catalog).map(serializeCatalogNode)
  BUILT_IN_TEMPLATE_SERIALIZED_NODES_BY_ID.set(catalog.templateId, nodes)
  return nodes
}

function buildBuiltInTemplateCatalogItem(
  catalog: BuiltInWbsTemplateCatalog,
  options: { includeNodes?: boolean } = {},
): WbsTemplateCatalogItem {
  return {
    id: catalog.templateId,
    name: catalog.templateName,
    source: 'builtin_seed',
    nodeCount: getFlattenedCatalogNodes(catalog).length,
    packType: getCatalogPackType(catalog),
    templateGroup: getCatalogTemplateGroup(catalog),
    generationPolicy: getCatalogGenerationPolicy(catalog),
    triggerKeywords: getCatalogTriggerKeywords(catalog),
    domainScope: getCatalogDomainScope(catalog),
    applicableScope: getCatalogApplicableScope(catalog),
    sourceStandards: getCatalogSourceStandards(catalog),
    sourceStandard: catalog.sourceStandard,
    sourceVersion: catalog.sourceVersion,
    evidenceSummary: buildEvidenceSummaryFromCatalog(catalog),
    nodes: options.includeNodes ? getSerializedBuiltInTemplateNodes(catalog) : undefined,
  }
}

function buildEvidenceSummaryFromCatalog(catalog: BuiltInWbsTemplateCatalog): WbsTemplateEvidenceSummary {
  const cached = BUILT_IN_TEMPLATE_EVIDENCE_SUMMARY_BY_ID.get(catalog.templateId)
  if (cached) return cached

  if (catalog.templateId === CHINA_GB55032_TEMPLATE_ID) {
    const validation = validateChinaGb50300Seed({ strict: true })
    const summary: WbsTemplateEvidenceSummary = {
      domainScope: '房屋建筑工程标准主干',
      evidenceStatus: validation.ok ? 'verified' : 'needs_review',
      reviewNeededCount: validation.reviewNeededCount,
      webVerifiedFalseCount: validation.webVerifiedFalseCount,
      divisionCount: validation.divisionCount,
      subDivisionCount: validation.subDivisionCount,
      itemWorkCount: validation.itemWorkCount,
      processCount: validation.processCount,
      activityStepCount: validation.activityStepCount,
      disciplineProcessCount: validation.disciplineProcessCount,
      genericFallbackProcessCount: validation.genericFallbackProcessCount,
      disciplineActivityStepCount: validation.disciplineActivityStepCount,
      genericActivityStepCount: validation.genericActivityStepCount,
      uniqueProcessNameCount: validation.uniqueProcessNameCount,
      uniqueActivityStepNameCount: validation.uniqueActivityStepNameCount,
    }
    BUILT_IN_TEMPLATE_EVIDENCE_SUMMARY_BY_ID.set(catalog.templateId, summary)
    return summary
  }

  const nodes = getFlattenedCatalogNodes(catalog)
  const reviewNeededCount = nodes.filter((node) => node.reviewNeeded).length
  const webVerifiedFalseCount = nodes.filter((node) => node.webVerified === false).length
  const processNodes = nodes.filter((node) => node.categoryType === 'process')
  const activityStepNodes = nodes.filter((node) => node.categoryType === 'activity_step')
  const uniqueProcessNames = new Set(processNodes.map((node) => node.name))
  const uniqueActivityStepNames = new Set(activityStepNodes.map((node) => node.name))

  const summary: WbsTemplateEvidenceSummary = {
    domainScope: getCatalogDomainScope(catalog),
    evidenceStatus: reviewNeededCount === 0 && webVerifiedFalseCount === 0 ? 'verified' : 'needs_review',
    reviewNeededCount,
    webVerifiedFalseCount,
    divisionCount: nodes.filter((node) => node.categoryType === 'division').length,
    subDivisionCount: nodes.filter((node) => node.categoryType === 'sub_division').length,
    itemWorkCount: nodes.filter((node) => node.categoryType === 'item_work').length,
    processCount: processNodes.length,
    activityStepCount: activityStepNodes.length,
    disciplineProcessCount: processNodes.filter((node) => readRecord(node.metadata).processPackLevel !== 'generic_fallback').length,
    genericFallbackProcessCount: processNodes.filter((node) => readRecord(node.metadata).processPackLevel === 'generic_fallback').length,
    disciplineActivityStepCount: activityStepNodes.filter((node) => readRecord(node.metadata).activityStepSource !== 'generic_checklist').length,
    genericActivityStepCount: activityStepNodes.filter((node) => readRecord(node.metadata).activityStepSource === 'generic_checklist').length,
    uniqueProcessNameCount: uniqueProcessNames.size,
    uniqueActivityStepNameCount: uniqueActivityStepNames.size,
  }
  BUILT_IN_TEMPLATE_EVIDENCE_SUMMARY_BY_ID.set(catalog.templateId, summary)
  return summary
}

export async function loadWbsTemplateNodes(templateId: string): Promise<TemplateNode[]> {
  if (isBuiltInChinaTemplateId(templateId)) {
    const catalog = getBuiltInTemplateCatalog(templateId)
    if (catalog) return getBuiltInTemplateNodeRoots(catalog)
  }

  throw buildTemplateCatalogNotFoundError(templateId)
}

function selectTemplateNodes(roots: TemplateNode[], selectedNodeIds: string[]) {
  const all = flattenNodes(roots)
  const selected = new Set(selectedNodeIds.map(normalizeText).filter(Boolean))
  if (selected.size === 0) return roots
  return all.filter((node) => (
    selected.has(node.id)
    || selected.has(node.stableCode)
    || selected.has(node.standardWorkCode ?? '')
  ))
}

function readCatalogGroupSelections(operation: PlanningTableOperation) {
  return readRecord(operation.groupSelections ?? operation.group_selections)
}

function readCatalogGroupSelectionMode(value: unknown): WbsTemplateCatalogGroupSelection | null {
  if (value === true) return 'all'
  if (value === false || value == null) return null
  const record = readRecord(value)
  const raw = record.mode ?? record.selection ?? value
  const mode = normalizeText(raw).toLowerCase()
  if ([
    'all',
    'default_selected',
    'triggered',
    'explicit',
    'auto_by_trigger',
    'by_project_type',
    'by_branch',
    'none',
  ].includes(mode)) {
    return mode as WbsTemplateCatalogGroupSelection
  }
  return null
}

function readSpecialtyCatalogIds(operation: PlanningTableOperation) {
  return readArray(operation.specialtyCatalogIds ?? operation.specialty_catalog_ids)
    .map(normalizeText)
    .filter(Boolean)
}

function toSnakeCaseKey(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

function readNestedValue(source: Record<string, unknown>, path: string) {
  const parts = path.split('.').map((part) => part.trim()).filter(Boolean)
  let current: unknown = source
  for (const part of parts) {
    const record = readRecord(current)
    if (part in record) {
      current = record[part]
      continue
    }
    const snake = toSnakeCaseKey(part)
    if (snake in record) {
      current = record[snake]
      continue
    }
    return undefined
  }
  return current
}

function readTriggerConditionValue(scope: Record<string, unknown>, sourceField: string) {
  const direct = scope[sourceField]
  if (direct !== undefined) return direct

  const paths = [
    sourceField,
    sourceField.replace(/^engineeringObject\.metadata\./, 'metadata.'),
    sourceField.replace(/^engineeringObject\.metadata\./, ''),
    sourceField.replace(/^engineeringObject\./, ''),
    sourceField.replace(/^scope\./, ''),
    sourceField.replace(/^metadata\./, ''),
  ]
  for (const path of paths) {
    const value = readNestedValue(scope, path)
    if (value !== undefined) return value
  }
  const lastKey = sourceField.split('.').filter(Boolean).pop() ?? ''
  return scope[lastKey] ?? scope[toSnakeCaseKey(lastKey)] ?? readRecord(scope.metadata)[lastKey] ?? readRecord(scope.metadata)[toSnakeCaseKey(lastKey)]
}

function compareTriggerValue(actual: unknown, condition: WbsTemplateTriggerCondition) {
  const operator = condition.operator
  if (operator === 'exists') return actual !== undefined && actual !== null && normalizeText(actual) !== ''
  if (operator === 'includes') {
    const expected = normalizeText(condition.value).toLowerCase()
    if (!expected) return false
    if (Array.isArray(actual)) return actual.map((item) => normalizeText(item).toLowerCase()).includes(expected)
    return normalizeText(actual).toLowerCase().split(/[,\s]+/).includes(expected)
  }
  if (operator === '=') {
    if (typeof condition.value === 'boolean') return isTruthy(actual) === condition.value
    return normalizeText(actual).toLowerCase() === normalizeText(condition.value).toLowerCase()
  }
  const actualNumber = Number(actual)
  const expectedNumber = Number(condition.value)
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false
  if (operator === '>=') return actualNumber >= expectedNumber
  if (operator === '>') return actualNumber > expectedNumber
  if (operator === '<=') return actualNumber <= expectedNumber
  if (operator === '<') return actualNumber < expectedNumber
  return false
}

function catalogMatchesTriggerConditions(catalog: BuiltInWbsTemplateCatalog, operation: PlanningTableOperation) {
  const scope = {
    ...readRecord(operation.scope),
    ...readOperationProjectFacts(operation),
  }
  const nodes = flattenCatalogNodes(catalog.divisions)
  return nodes.some((node) => {
    const conditions = readArray(readRecord(node.metadata).triggerConditions) as WbsTemplateTriggerCondition[]
    return conditions.some((condition) => (
      condition
      && typeof condition === 'object'
      && normalizeText(condition.sourceField)
      && compareTriggerValue(readTriggerConditionValue(scope, condition.sourceField), condition)
    ))
  })
}

function catalogMatchesProjectType(catalog: BuiltInWbsTemplateCatalog, operation: PlanningTableOperation) {
  const scope = readRecord(operation.scope)
  const projectFacts = readOperationProjectFacts(operation)
  const projectTypeCode = normalizeText(scope.project_type_code ?? scope.projectTypeCode ?? projectFacts.projectTypeCode).toLowerCase()
  if (!projectTypeCode) return true
  const nodes = flattenCatalogNodes(catalog.divisions)
  return nodes.some((node) => {
    const applicable = readCodeArray(readRecord(node.metadata).applicableProjectTypes)
    return applicable.length === 0 || applicable.includes(projectTypeCode)
  })
}

function resolveCatalogGroupTemplateIds(operation: PlanningTableOperation) {
  const selections = readCatalogGroupSelections(operation)
  const selectedIds: string[] = []
  for (const group of WBS_TEMPLATE_CATALOG_GROUPS) {
    const mode = readCatalogGroupSelectionMode(selections[group])
    if (!mode || mode === 'none') continue
    for (const catalog of BUILT_IN_WBS_TEMPLATE_CATALOGS) {
      if (getCatalogPackType(catalog) !== group) continue
      const policy = getCatalogGenerationPolicy(catalog)
      if (mode === 'default_selected' && policy !== 'default_selected') continue
      if (mode === 'triggered' && policy !== 'triggered') continue
      if (mode === 'explicit' && policy !== 'explicit') continue
      if (mode === 'auto_by_trigger' && !catalogMatchesTriggerConditions(catalog, operation)) continue
      if (mode === 'by_project_type' && !catalogMatchesProjectType(catalog, operation)) continue
      selectedIds.push(catalog.templateId)
    }
  }
  return selectedIds
}

function getCatalogGroupSelectionMode(operation: PlanningTableOperation, group: WbsTemplateCatalogGroup) {
  return readCatalogGroupSelectionMode(readCatalogGroupSelections(operation)[group])
}

function readTemplateIds(operation: PlanningTableOperation): string[] {
  const primaryId = normalizeText(operation.primaryCatalogId ?? operation.primary_catalog_id ?? operation.templateId ?? operation.template_id)
  const explicitIds = readArray(operation.templateIds ?? operation.template_ids)
    .map(normalizeText)
    .filter(Boolean)
  const groupIds = resolveCatalogGroupTemplateIds(operation)
  const specialtyIds = readSpecialtyCatalogIds(operation)
  const selectedNodesByTemplate = readRecord(operation.selectedNodesByTemplate ?? operation.selected_nodes_by_template)
  const templateIdsWithSelectedNodes = Object.entries(selectedNodesByTemplate)
    .filter(([, selectedNodeIds]) => readArray(selectedNodeIds).some((id) => Boolean(normalizeText(id))))
    .map(([templateId]) => normalizeText(templateId))
    .filter(Boolean)
  const fallbackSelectedNodeIds = readArray(operation.selectedNodeIds ?? operation.selected_node_ids)
    .map(normalizeText)
    .filter(Boolean)
  const hasPrimarySelectedNodes = primaryId && templateIdsWithSelectedNodes.includes(primaryId)
  const selectedPrimaryTemplate = hasPrimarySelectedNodes || (primaryId && fallbackSelectedNodeIds.length > 0)
    ? [primaryId]
    : []
  const selectedNonPrimaryTemplates = templateIdsWithSelectedNodes.filter((templateId) => templateId !== primaryId)
  const selectedIds = uniqueStringArray([
    ...explicitIds,
    ...selectedPrimaryTemplate,
    ...groupIds,
    ...specialtyIds,
    ...selectedNonPrimaryTemplates,
  ])
  if (selectedIds.length > 0) return selectedIds
  return uniqueStringArray([primaryId])
}

function readSelectedNodeIdsForTemplate(operation: PlanningTableOperation, templateId: string) {
  const selectedNodesByTemplate = readRecord(operation.selectedNodesByTemplate ?? operation.selected_nodes_by_template)
  const selectedForTemplate = selectedNodesByTemplate[templateId]
  if (Array.isArray(selectedForTemplate)) {
    return readArray(selectedForTemplate)
      .map(normalizeText)
      .filter(Boolean)
  }
  const primaryTemplateId = normalizeText(operation.primaryCatalogId ?? operation.primary_catalog_id ?? operation.templateId ?? operation.template_id)
  const fallbackSelectedNodeIds = templateId === primaryTemplateId
    ? (operation.selectedNodeIds ?? operation.selected_node_ids)
    : []
  return readArray(fallbackSelectedNodeIds)
    .map(normalizeText)
    .filter(Boolean)
}

function nodeMatchesTriggerConditions(node: TemplateNode, operation: PlanningTableOperation) {
  const scope = {
    ...readRecord(operation.scope),
    ...readOperationProjectFacts(operation),
  }
  const conditions = readArray(readRecord(node.metadata).triggerConditions) as WbsTemplateTriggerCondition[]
  return conditions.some((condition) => (
    condition
    && typeof condition === 'object'
    && normalizeText(condition.sourceField)
    && compareTriggerValue(readTriggerConditionValue(scope, condition.sourceField), condition)
  ))
}

function nodeOrDescendantMatchesTrigger(node: TemplateNode, operation: PlanningTableOperation): boolean {
  return nodeMatchesTriggerConditions(node, operation)
    || node.children.some((child) => nodeOrDescendantMatchesTrigger(child, operation))
}

function selectAutoTriggeredDangerNodes(roots: TemplateNode[], operation: PlanningTableOperation) {
  const all = flattenNodes(roots)
  const itemWorks = all.filter((node) => node.categoryType === 'item_work' && nodeOrDescendantMatchesTrigger(node, operation))
  if (itemWorks.length > 0) return itemWorks

  const processes = all.filter((node) => node.categoryType === 'process' && nodeMatchesTriggerConditions(node, operation))
  return processes.length > 0 ? processes : roots
}

type ScopeComboRuntimeObject = {
  id: string
  type: string
  name: string
  parentId: string | null
  metadata: Record<string, unknown>
}

function readScopeObjectsForComboExpansion(scope: Record<string, unknown>): ScopeComboRuntimeObject[] {
  return readArray(scope.scope_objects ?? scope.scopeObjects)
    .map((item) => {
      const record = readRecord(item)
      const id = normalizeText(record.id ?? record.objectId ?? record.object_id)
      const type = normalizeId(record.type ?? record.objectType ?? record.object_type)
      const name = normalizeText(record.name ?? record.objectName ?? record.object_name)
      if (!id || !type) return null
      return {
        id,
        type,
        name,
        parentId: normalizeText(record.parentId ?? record.parent_id) || null,
        metadata: readRecord(record.metadata),
      }
    })
    .filter((item): item is ScopeComboRuntimeObject => Boolean(item))
}

function readScopeObjectPhysicalSpaceKind(object: ScopeComboRuntimeObject) {
  return normalizeId(object.metadata.physicalSpaceKind ?? object.metadata.physical_space_kind)
}

function readScopeObjectStructuralRole(object: ScopeComboRuntimeObject) {
  return normalizeId(object.metadata.structuralRole ?? object.metadata.structural_role)
}

function isSharedPodiumScopeObject(object: ScopeComboRuntimeObject) {
  if (object.type !== 'physical_zone') return false
  return readScopeObjectPhysicalSpaceKind(object) === 'shared_podium'
    || readScopeObjectStructuralRole(object) === 'podium'
    || object.metadata.sharedScopeCandidate === true
    || object.metadata.shared_scope_candidate === true
}

function isInternalTowerScopeObject(object: ScopeComboRuntimeObject) {
  return object.type === 'physical_zone'
    && readScopeObjectStructuralRole(object) === 'tower'
    && !isSharedPodiumScopeObject(object)
}

function isSuppressedPhysicalScopeObject(object: ScopeComboRuntimeObject) {
  return object.type === 'physical_zone'
    && (
      readScopeObjectPhysicalSpaceKind(object) === 'horizontal_work_zone'
      || isInternalTowerScopeObject(object)
    )
}

function isStandardScopeComboAnchor(object: ScopeComboRuntimeObject) {
  return object.type === 'building'
    || object.type === 'basement'
    || object.type === 'floor'
    || isSharedPodiumScopeObject(object)
}

function findStandardScopeComboAnchor(
  leaf: ScopeComboRuntimeObject,
  byId: Map<string, ScopeComboRuntimeObject>,
) {
  if (isSuppressedPhysicalScopeObject(leaf)) return null

  let current: ScopeComboRuntimeObject | undefined = leaf
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (isStandardScopeComboAnchor(current)) return current
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return null
}

function buildScopeObjectLineageValues(
  anchor: ScopeComboRuntimeObject,
  byId: Map<string, ScopeComboRuntimeObject>,
) {
  const values: Partial<WbsTemplateScope> = {}
  let current: ScopeComboRuntimeObject | undefined = anchor
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (!isSuppressedPhysicalScopeObject(current)) {
      const field = SCOPE_OBJECT_FIELD_BY_TYPE[current.type]
      if (field && !values[field as keyof WbsTemplateScope]) {
        values[field as keyof WbsTemplateScope] = current.id as never
      }
    }
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return values
}

function buildScopeObjectComboKey(values: Partial<WbsTemplateScope>) {
  return JSON.stringify({
    engineering_object_id: values.engineering_object_id ?? null,
    phase_object_id: values.phase_object_id ?? null,
    section_object_id: values.section_object_id ?? null,
    building_object_id: values.building_object_id ?? null,
    floor_object_id: values.floor_object_id ?? null,
    basement_object_id: values.basement_object_id ?? null,
    physical_zone_object_id: values.physical_zone_object_id ?? null,
    functional_area_object_id: values.functional_area_object_id ?? null,
  })
}

function countUniqueComboBuildings(combos: Array<Partial<WbsTemplateScope>>) {
  return uniqueStringArray(combos.map((combo) => normalizeText(combo.building_object_id)).filter(Boolean)).length
}

function buildScopeCombosFromScopeObjects(scope: Record<string, unknown>, direct: WbsTemplateScope): WbsTemplateScope[] {
  const objects = readScopeObjectsForComboExpansion(scope)
  if (objects.length === 0) return []

  const byId = new Map(objects.map((object) => [object.id, object]))
  const childCounts = new Map<string, number>()
  for (const object of objects) {
    if (!object.parentId) continue
    childCounts.set(object.parentId, (childCounts.get(object.parentId) ?? 0) + 1)
  }

  const rawCombos: Array<Partial<WbsTemplateScope>> = []
  const seen = new Set<string>()
  for (const leaf of objects.filter((object) => (childCounts.get(object.id) ?? 0) === 0)) {
    const anchor = findStandardScopeComboAnchor(leaf, byId)
    if (!anchor) continue
    const values = buildScopeObjectLineageValues(anchor, byId)
    const key = buildScopeObjectComboKey(values)
    if (seen.has(key)) continue
    seen.add(key)
    rawCombos.push(values)
  }

  if (rawCombos.length === 0) return []

  const buildingIds = uniqueStringArray(rawCombos.map((combo) => normalizeText(combo.building_object_id)).filter(Boolean))
  const buildingIndexById = new Map(buildingIds.map((id, index) => [id, index]))
  const uniqueBuildingCount = countUniqueComboBuildings(rawCombos)

  return rawCombos.map((combo, index) => {
    const buildingId = normalizeText(combo.building_object_id)
    const buildingIndex = buildingId ? buildingIndexById.get(buildingId) ?? 0 : null
    const hasBuilding = Boolean(buildingId)
    const next: WbsTemplateScope = {
      ...direct,
      engineering_object_id: null,
      phase_object_id: null,
      section_object_id: null,
      building_object_id: null,
      floor_object_id: null,
      basement_object_id: null,
      physical_zone_object_id: null,
      functional_area_object_id: null,
      ...combo,
      building_sequence_source: hasBuilding ? 'explicit_building_array' : null,
      building_sequence_index: hasBuilding && uniqueBuildingCount > 1 ? buildingIndex : null,
      building_sequence_number: hasBuilding && uniqueBuildingCount > 1 && buildingIndex != null ? buildingIndex + 1 : null,
      building_sequence_total: hasBuilding && uniqueBuildingCount > 1 ? uniqueBuildingCount : null,
    }
    Object.assign(
      next,
      buildFloorSequenceScope(next.floor_object_id ? index : null, next.floor_object_id ? rawCombos.length : 0, next.floor_object_id ? 'explicit_floor_array' : null),
    )
    return next
  })
}

function readScopeCombos(scopeInput: unknown, projectFactsInput: unknown = {}): WbsTemplateScope[] {
  const scope = readRecord(scopeInput)
  const projectFacts = readRecord(projectFactsInput)
  const readScopeOrFactNumber = (scopeKeys: string[], factKeys: string[]) => (
    readNumberFromSources([scope], scopeKeys) ?? readNumberFromSources([projectFacts], factKeys)
  )
  const buildingCountFact = readScopeOrFactNumber(['buildingCount', 'building_count'], ['buildingCount'])
  const standardFloorCountFact = readScopeOrFactNumber(['standardFloorCount', 'standard_floor_count'], ['standardFloorCount'])
  const highestFloorCountFact = readScopeOrFactNumber(['highestBuildingFloorCount', 'highest_building_floor_count', 'floorCount', 'floor_count'], ['highestBuildingFloorCount', 'floorCount'])
  const basementLevelCountFact = readScopeOrFactNumber(['basementLevelCount', 'basement_level_count'], ['basementLevelCount'])
  const totalAreaFact = readScopeOrFactNumber(['totalAreaM2', 'total_area_m2', 'totalArea', 'total_area'], ['totalAreaM2', 'totalArea'])
  const basementAreaFact = readScopeOrFactNumber(['basementAreaM2', 'basement_area_m2'], ['basementAreaM2'])
  const foundationDepthFact = readScopeOrFactNumber(
    ['foundationDepthM', 'foundation_depth_m', 'deepFoundationPitDepthM', 'deep_foundation_pit_depth_m', 'pitDepthM', 'pit_depth_m'],
    ['foundationDepthM', 'deepFoundationPitDepthM', 'pitDepthM'],
  )
  const prefabRateFact = readScopeOrFactNumber(['prefabRate', 'prefab_rate'], ['prefabRate'])
  const maxSpanFact = readScopeOrFactNumber(['maxSpanM', 'max_span_m'], ['maxSpanM'])
  const supportHeightFact = readScopeOrFactNumber(['supportHeightM', 'support_height_m'], ['supportHeightM'])
  const hasCivilDefenseFact = readBooleanFromSources([scope], ['hasCivilDefense'])
    ?? readBooleanFromSources([projectFacts], ['hasCivilDefense'])
  const towerCraneCountFact = readScopeOrFactNumber(['towerCraneCount', 'tower_crane_count'], ['towerCraneCount'])
  const constructionHoistCountFact = readScopeOrFactNumber(['constructionHoistCount', 'construction_hoist_count'], ['constructionHoistCount'])
  const direct: WbsTemplateScope = {
    engineering_object_id: normalizeId(scope.engineering_object_id ?? scope.engineeringObjectId),
    phase_object_id: normalizeId(scope.phase_object_id ?? scope.phaseObjectId),
    section_object_id: normalizeId(scope.section_object_id ?? scope.sectionObjectId),
    building_object_id: normalizeId(scope.building_object_id ?? scope.buildingObjectId),
    building_sequence_source: normalizeId(scope.building_object_id ?? scope.buildingObjectId) ? 'direct_building' : null,
    building_sequence_index: null,
    building_sequence_number: null,
    building_sequence_total: null,
    floor_object_id: normalizeId(scope.floor_object_id ?? scope.floorObjectId),
    basement_object_id: normalizeId(scope.basement_object_id ?? scope.basementObjectId),
    physical_zone_object_id: normalizeId(scope.physical_zone_object_id ?? scope.physicalZoneObjectId),
    functional_area_object_id: normalizeId(scope.functional_area_object_id ?? scope.functionalAreaObjectId),
    business_type: normalizeId(scope.business_type ?? scope.businessType ?? projectFacts.businessType),
    business_subtype: normalizeId(scope.business_subtype ?? scope.businessSubtype ?? projectFacts.businessSubtype),
    recommendation_packs: mergeRecommendationPacksFromFacts(scope, projectFacts),
    project_type_code: normalizeId(scope.project_type_code ?? scope.projectTypeCode ?? projectFacts.projectTypeCode),
    structure_type_code: normalizeId(scope.structure_type_code ?? scope.structureTypeCode ?? projectFacts.structureTypeCode),
    method_variant_codes: mergeMethodVariantCodesFromFacts(scope, projectFacts),
    element_variant_codes: mergeElementVariantCodesFromFacts(scope, projectFacts),
    building_pattern_codes: mergeBuildingPatternCodesFromFacts(scope, projectFacts),
    functional_usage_codes: mergeScopeCodeArrayFromFacts(scope, projectFacts, ['functional_usage_codes', 'functionalUsageCodes'], ['functionalUsageCodes']),
    floor_usage_codes: mergeScopeCodeArrayFromFacts(scope, projectFacts, ['floor_usage_codes', 'floorUsageCodes'], ['floorUsageCodes']),
    functional_category_codes: mergeScopeCodeArrayFromFacts(scope, projectFacts, ['functional_category_codes', 'functionalCategoryCodes'], ['functionalCategoryCodes']),
    special_room_type_codes: mergeScopeCodeArrayFromFacts(scope, projectFacts, ['special_room_type_codes', 'specialRoomTypeCodes'], ['specialRoomTypeCodes']),
    physical_zone_type_codes: mergeScopeCodeArrayFromFacts(scope, projectFacts, ['physical_zone_type_codes', 'physicalZoneTypeCodes'], ['physicalZoneTypeCodes']),
    climate_signal: normalizeId(scope.climate_signal ?? scope.climateSignal),
    monthly_climate_signal: normalizeId(scope.monthly_climate_signal ?? scope.monthlyClimateSignal),
    weather_impact_bands: readCodeArray(scope.weather_impact_bands ?? scope.weatherImpactBands),
    selected_template_ids: readCodeArray(scope.selected_template_ids ?? scope.selectedTemplateIds ?? scope.template_ids ?? scope.templateIds),
    scope_expansion_mode: normalizeId(scope.scopeExpansionMode ?? scope.scope_expansion_mode),
    total_area_m2: totalAreaFact,
    above_ground_area_m2: readScopeOrFactNumber(['aboveGroundAreaM2', 'above_ground_area_m2'], ['aboveGroundAreaM2']),
    building_count: buildingCountFact,
    standard_floor_count: standardFloorCountFact,
    highest_building_floor_count: highestFloorCountFact,
    basement_level_count: basementLevelCountFact,
    basement_area_m2: basementAreaFact,
    site_area_m2: readScopeOrFactNumber(['siteAreaM2', 'site_area_m2'], ['siteAreaM2']),
    foundation_depth_m: foundationDepthFact,
    prefab_rate: prefabRateFact,
    max_span_m: maxSpanFact,
    support_height_m: supportHeightFact,
    hasCivilDefense: hasCivilDefenseFact,
    tower_crane_count: towerCraneCountFact,
    construction_hoist_count: constructionHoistCountFact,
  }
  Object.assign(
    direct,
    buildFloorSequenceScope(direct.floor_object_id ? 0 : null, direct.floor_object_id ? 1 : 0, direct.floor_object_id ? 'direct_floor' : null),
  )

  const explicitScopeCombos = readArray(scope.scope_combos ?? scope.scopeCombos)
    .map((comboInput, index) => {
      const combo = readRecord(comboInput)
      const next: WbsTemplateScope = {
        ...direct,
        engineering_object_id: normalizeId(combo.engineering_object_id ?? combo.engineeringObjectId) || direct.engineering_object_id,
        phase_object_id: normalizeId(combo.phase_object_id ?? combo.phaseObjectId) || direct.phase_object_id,
        section_object_id: normalizeId(combo.section_object_id ?? combo.sectionObjectId) || direct.section_object_id,
        building_object_id: normalizeId(combo.building_object_id ?? combo.buildingObjectId) || direct.building_object_id,
        floor_object_id: normalizeId(combo.floor_object_id ?? combo.floorObjectId) || direct.floor_object_id,
        basement_object_id: normalizeId(combo.basement_object_id ?? combo.basementObjectId) || direct.basement_object_id,
        physical_zone_object_id: normalizeId(combo.physical_zone_object_id ?? combo.physicalZoneObjectId) || direct.physical_zone_object_id,
        functional_area_object_id: normalizeId(combo.functional_area_object_id ?? combo.functionalAreaObjectId) || direct.functional_area_object_id,
      }
      const hasBuilding = Boolean(next.building_object_id)
      next.building_sequence_source = hasBuilding ? 'explicit_building_array' : null
      next.building_sequence_index = hasBuilding ? index : null
      next.building_sequence_number = hasBuilding ? index + 1 : null
      next.building_sequence_total = hasBuilding ? countExplicitScopeComboBuildings(scope) || null : null
      Object.assign(
        next,
        buildFloorSequenceScope(next.floor_object_id ? index : null, next.floor_object_id ? explicitScopeCombosLength(scope) : 0, next.floor_object_id ? 'explicit_floor_array' : null),
      )
      return next
    })
    .filter(hasAnyScope)
  if (explicitScopeCombos.length > 0) return explicitScopeCombos

  const scopeObjectCombos = buildScopeCombosFromScopeObjects(scope, direct)
  if (scopeObjectCombos.length > 0) return scopeObjectCombos

  const explicitBuildings = readArray(scope.buildings ?? scope.buildingIds).map(normalizeText).filter(Boolean)
  const buildings = explicitBuildings.length > 0
    ? explicitBuildings
    : buildingCountFact && buildingCountFact > 1
      ? buildInferredBuildingIds(Math.min(Math.floor(buildingCountFact), 200))
      : []
  const floors = readArray(scope.floors ?? scope.floorIds).map(normalizeText).filter(Boolean)
  const explicitFloorSequence = readFloorSequenceItems(scope)
  const inferredFloorCount = Math.floor(standardFloorCountFact ?? highestFloorCountFact ?? 0)
  const inferredFloorSequence = explicitFloorSequence.length > 0
    ? explicitFloorSequence
    : inferredFloorCount > 1
      ? buildInferredFloorSequence(Math.min(inferredFloorCount, 200))
      : []
  const physicalZones = readArray(scope.physical_zones ?? scope.physicalZoneIds ?? scope.physical_zone_ids).map(normalizeText).filter(Boolean)
  const phases = readArray(scope.phases ?? scope.phaseIds).map(normalizeText).filter(Boolean)

  const hasPluralScope = buildings.length > 0 || floors.length > 0 || inferredFloorSequence.length > 0 || physicalZones.length > 0 || phases.length > 0
  if (!hasPluralScope) return [direct]

  const buildingList = buildings.length > 0 ? buildings : [direct.building_object_id ?? null]
  const buildingSource: WbsTemplateScope['building_sequence_source'] = explicitBuildings.length > 0
    ? 'explicit_building_array'
    : buildingCountFact && buildingCountFact > 1
      ? 'inferred_building_count'
      : direct.building_object_id
        ? 'direct_building'
        : null
  const floorList = floors.length > 0
    ? floors.map((floorId) => ({ floorObjectId: floorId, label: '', levelNumber: null as number | null, isBasement: false, source: 'explicit_floor_array' as const }))
    : inferredFloorSequence.length > 0
      ? inferredFloorSequence.map((item) => ({ ...item, source: item.floorObjectId ? 'explicit_floor_array' as const : 'inferred_floor_count' as const }))
      : [{ floorObjectId: direct.floor_object_id ?? null, label: '', levelNumber: null as number | null, isBasement: false, source: direct.floor_object_id ? 'direct_floor' as const : null }]
  const physicalZoneList = physicalZones.length > 0 ? physicalZones : [direct.physical_zone_object_id ?? null]
  const phaseList = phases.length > 0 ? phases : [direct.phase_object_id ?? null]

  const combos: WbsTemplateScope[] = []
  for (const [buildingIndex, buildingId] of buildingList.entries()) {
    for (const [floorIndex, floorItem] of floorList.entries()) {
      for (const physicalZoneId of physicalZoneList) {
        for (const phaseId of phaseList) {
          combos.push({
            ...direct,
            building_object_id: buildingId,
            building_sequence_source: buildingId ? buildingSource : null,
            building_sequence_index: buildingId && buildingList.length > 1 ? buildingIndex : null,
            building_sequence_number: buildingId && buildingList.length > 1 ? buildingIndex + 1 : null,
            building_sequence_total: buildingId && buildingList.length > 1 ? buildingList.length : null,
            floor_object_id: floorItem.floorObjectId,
            physical_zone_object_id: physicalZoneId,
            phase_object_id: phaseId,
            ...buildFloorSequenceScope(
              floorItem.floorObjectId || floorItem.source === 'inferred_floor_count' ? floorIndex : null,
              floorList.length > 0 && (floorItem.floorObjectId || floorItem.source === 'inferred_floor_count') ? floorList.length : 0,
              floorItem.source,
            ),
            floor_sequence_label: floorItem.label || null,
            floor_sequence_level_number: floorItem.levelNumber,
            floor_sequence_is_basement: floorItem.isBasement,
          })
        }
      }
    }
  }
  return combos
}

function isFloorSeriesScope(scope: WbsTemplateScope) {
  return normalizeId(scope.scope_expansion_mode) === 'building_rhythm_series'
    && Array.isArray(scope.floor_series)
    && scope.floor_series.length > 1
}

function isRhythmExpansionEligibleNode(node: TemplateNode) {
  const metadata = readRecord(node.metadata)
  const explicitScopeMode = normalizeId(metadata.scopeExpansionMode ?? metadata.scope_expansion_mode)
  if (explicitScopeMode === 'explicit_instances' || explicitScopeMode === 'floor_full_expand') return false
  return node.categoryType === 'item_work' && metadata.rhythmExpansionEligible === true
}

function isExplicitFloorInstanceScope(scope: WbsTemplateScope) {
  const mode = normalizeId(scope.scope_expansion_mode)
  return mode === 'explicit_instances' || mode === 'floor_full_expand'
}

function buildFloorSeriesItemFromScope(scope: WbsTemplateScope): WbsTemplateFloorSequenceInput {
  return {
    floorObjectId: scope.floor_object_id ?? null,
    label: scope.floor_sequence_label
      ?? scope.floor_object_id
      ?? (scope.floor_sequence_number ? `F${scope.floor_sequence_number}` : null),
    levelNumber: scope.floor_sequence_level_number ?? null,
    isBasement: scope.floor_sequence_is_basement ?? false,
  }
}

function buildNonFloorScopeKey(scope: WbsTemplateScope) {
  return JSON.stringify({
    engineering_object_id: scope.engineering_object_id ?? null,
    phase_object_id: scope.phase_object_id ?? null,
    section_object_id: scope.section_object_id ?? null,
    building_object_id: scope.building_object_id ?? null,
    basement_object_id: scope.basement_object_id ?? null,
    physical_zone_object_id: scope.physical_zone_object_id ?? null,
    functional_area_object_id: scope.functional_area_object_id ?? null,
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
    building_count: scope.building_count ?? null,
    standard_floor_count: scope.standard_floor_count ?? null,
    highest_building_floor_count: scope.highest_building_floor_count ?? null,
    basement_level_count: scope.basement_level_count ?? null,
    basement_area_m2: scope.basement_area_m2 ?? null,
    foundation_depth_m: scope.foundation_depth_m ?? null,
    prefab_rate: scope.prefab_rate ?? null,
    max_span_m: scope.max_span_m ?? null,
    support_height_m: scope.support_height_m ?? null,
    hasCivilDefense: scope.hasCivilDefense ?? null,
    tower_crane_count: scope.tower_crane_count ?? null,
    construction_hoist_count: scope.construction_hoist_count ?? null,
    selected_template_ids: scope.selected_template_ids ?? [],
  })
}

function compactScopeCombosForRhythmNode(node: TemplateNode, scopeCombos: WbsTemplateScope[]) {
  if (!isRhythmExpansionEligibleNode(node)) return scopeCombos

  const compacted: WbsTemplateScope[] = []
  const groups = new Map<string, WbsTemplateScope[]>()
  const passthrough: WbsTemplateScope[] = []

  for (const scope of scopeCombos) {
    const canCompact = !isExplicitFloorInstanceScope(scope)
      && (scope.floor_sequence_source === 'explicit_floor_array' || scope.floor_sequence_source === 'inferred_floor_count')
      && (scope.floor_sequence_total ?? 0) > 1
      && scope.floor_sequence_index != null
    if (!canCompact) {
      passthrough.push(scope)
      continue
    }
    const key = buildNonFloorScopeKey(scope)
    const group = groups.get(key) ?? []
    group.push(scope)
    groups.set(key, group)
  }

  for (const group of groups.values()) {
    if (group.length <= 1) {
      compacted.push(...group)
      continue
    }
    const ordered = [...group].sort((left, right) => (left.floor_sequence_index ?? 0) - (right.floor_sequence_index ?? 0))
    const representative = ordered[0]
    const floorSeries = ordered.map(buildFloorSeriesItemFromScope)
    compacted.push({
      ...representative,
      floor_object_id: null,
      ...buildFloorSequenceScope(null, 0, null),
      floor_series: floorSeries,
      floor_series_count: floorSeries.length,
      floor_series_label: buildFloorSeriesLabel(floorSeries),
      floor_series_source: representative.floor_sequence_source,
      scope_expansion_mode: 'building_rhythm_series',
    })
  }

  return [...compacted, ...passthrough]
}

function buildScopeCombosForNode(node: TemplateNode, scopeCombos: WbsTemplateScope[]) {
  const metadata = readRecord(node.metadata)
  const explicitScopeMode = normalizeId(metadata.scopeExpansionMode ?? metadata.scope_expansion_mode)
  if (
    !isRhythmExpansionEligibleNode(node)
    && explicitScopeMode !== 'explicit_instances'
    && explicitScopeMode !== 'floor_full_expand'
  ) {
    const normalizedScopes = scopeCombos.map((scope) => ({
      ...scope,
      ...(scope.floor_sequence_source === 'inferred_floor_count'
        ? {
            floor_object_id: null,
            ...buildFloorSequenceScope(null, 0, null),
            floor_series: undefined,
            floor_series_count: null,
            floor_series_label: null,
            floor_series_source: null,
          }
        : {}),
      ...(scope.building_sequence_source === 'inferred_building_count'
        ? {
            building_object_id: null,
            building_sequence_source: null,
            building_sequence_index: null,
            building_sequence_number: null,
            building_sequence_total: null,
          }
        : {}),
    }))
    const seen = new Set<string>()
    return normalizedScopes.filter((scope) => {
      const key = buildScopeContextKey(scope)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  const normalizedScopes = compactScopeCombosForRhythmNode(node, scopeCombos).map((scope) => (
    shouldCompactInferredBuildingsToWorkfacePool(scope)
      ? {
          ...scope,
          building_object_id: null,
          building_sequence_source: null,
          building_sequence_index: null,
          building_sequence_number: null,
          building_sequence_total: null,
        }
      : scope
  ))
  const seen = new Set<string>()
  return normalizedScopes.filter((scope) => {
    const key = buildScopeContextKey(scope)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildScopeContextKey(scope: WbsTemplateScope) {
  return JSON.stringify({
    ...pickPersistableScopeValues(scope),
    floor_series: Array.isArray(scope.floor_series)
      ? scope.floor_series.map((floor) => ({
        floorObjectId: normalizeId(floor.floorObjectId ?? floor.floor_object_id ?? floor.id) || null,
        label: normalizeText(floor.label ?? floor.floorLabel ?? floor.floor_label ?? floor.name ?? floor.object_name),
        levelNumber: floor.levelNumber ?? floor.level_number ?? null,
        isBasement: floor.isBasement === true || floor.is_basement === true,
      }))
      : [],
  })
}

function buildGenerationScopeContexts(
  templateSelections: Array<{ templateId: string; selectedNodes: TemplateNode[]; templateIndex: number }>,
  baseScopeCombos: WbsTemplateScope[],
) {
  const contexts: Array<{
    scope: WbsTemplateScope
    templateSelections: Array<{ templateId: string; selectedNodes: TemplateNode[]; templateIndex: number }>
  }> = []

  for (const selection of templateSelections) {
    const groups = new Map<string, { scopes: WbsTemplateScope[]; selectedNodes: TemplateNode[] }>()
    for (const node of selection.selectedNodes) {
      const nodeScopes = buildScopeCombosForNode(node, baseScopeCombos)
      const signature = nodeScopes.map(buildScopeContextKey).join('|')
      const group = groups.get(signature) ?? { scopes: nodeScopes, selectedNodes: [] }
      group.selectedNodes.push(node)
      groups.set(signature, group)
    }

    for (const group of groups.values()) {
      for (const scope of group.scopes) {
        contexts.push({
          scope,
          templateSelections: [{
            templateId: selection.templateId,
            selectedNodes: group.selectedNodes,
            templateIndex: selection.templateIndex,
          }],
        })
      }
    }
  }

  return contexts
}

function hasAnyScope(scope: WbsTemplateScope) {
  return Object.values(scope).some((value) => typeof value === 'string' && value.trim().length > 0)
}

function isProjectScopeMode(scopeInput: unknown) {
  const scope = readRecord(scopeInput)
  const mode = normalizeText(scope.scopeExpansionMode ?? scope.scope_expansion_mode).toLowerCase()
  return mode === 'project' || mode === 'entire_project'
}

function readGenerationStartDate(operation: PlanningTableOperation, fallback?: string | null) {
  return normalizeDate(
    operation.plannedStartDate
    ?? operation.startDate
    ?? operation.anchorDate
    ?? readRecord(operation.clientContext).plannedStartDate
    ?? fallback,
  ) ?? new Date().toISOString().slice(0, 10)
}

function readGenerationDepth(operation: PlanningTableOperation): WbsTemplateGenerationDepth {
  const clientContext = readRecord(operation.clientContext)
  const rawDepth = normalizeText(
    operation.generationDepth
    ?? operation.generation_depth
    ?? clientContext.generationDepth
    ?? clientContext.generation_depth,
  ).toLowerCase()
  const rawDetailLevel = normalizeText(
    operation.detailLevel
    ?? operation.detail_level
    ?? clientContext.detailLevel
    ?? clientContext.detail_level,
  ).toLowerCase()
  if (rawDepth === 'activity_step' || rawDepth === 'activity_steps') return 'activity_step'
  if (rawDepth === 'detailed') return 'activity_step'
  if (rawDepth === 'process') return 'process'
  if (rawDepth === 'standard') return 'process'
  if (rawDepth === 'item_work' || rawDepth === 'item_work_only' || rawDepth === 'itempack' || rawDepth === 'item_pack' || rawDepth === 'overview') return 'item_work'

  if (rawDetailLevel === 'detailed') return 'activity_step'
  if (rawDetailLevel === 'standard') return 'process'
  if (rawDetailLevel === 'overview') return 'item_work'

  const rawIncludeActivitySteps = operation.includeActivitySteps
    ?? operation.include_activity_steps
    ?? clientContext.includeActivitySteps
    ?? clientContext.include_activity_steps
  return rawIncludeActivitySteps === true || rawIncludeActivitySteps === 'true'
    ? 'activity_step'
    : 'item_work'
}

function isWithinGenerationDepth(node: TemplateNode, generationDepth: WbsTemplateGenerationDepth) {
  return (TEMPLATE_NODE_RANK[node.categoryType] ?? TEMPLATE_NODE_RANK.custom) <= GENERATION_DEPTH_RANK[generationDepth]
}

function isGenerationDepthFrontierNode(node: TemplateNode, generationDepth: WbsTemplateGenerationDepth) {
  return (TEMPLATE_NODE_RANK[node.categoryType] ?? TEMPLATE_NODE_RANK.custom) === GENERATION_DEPTH_RANK[generationDepth]
}

function shouldAutoExpandOverviewItemPackToProcess(node: TemplateNode, generationDepth: WbsTemplateGenerationDepth, scope: WbsTemplateScope) {
  if (generationDepth !== 'item_work' || node.categoryType !== 'item_work') return false
  if (isFloorSeriesScope(scope) && isRhythmExpansionEligibleNode(node)) return false

  const metadata = readRecord(node.metadata)
  const explicit = normalizeText(metadata.overviewExpansionDepth ?? metadata.overview_expansion_depth).toLowerCase()
  if (explicit === 'process' || explicit === 'dynamic_process') return true
  if (explicit === 'item_work' || explicit === 'none') return false

  return OVERVIEW_PROCESS_DETAIL_ITEM_PACK_CODES.has(node.stableCode)
}

function getChildGenerationDepth(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope,
): WbsTemplateGenerationDepth {
  return shouldAutoExpandOverviewItemPackToProcess(node, generationDepth, scope)
    ? 'process'
    : generationDepth
}

function isDurationSuggestionNode(node: TemplateNode) {
  return node.categoryType === 'item_work' || node.categoryType === 'process' || node.categoryType === 'activity_step'
}

function normalizeDurationMethodCode(value: unknown) {
  const normalized = normalizeProjectScenarioMethodCode(normalizeFloorMethodCode(value))
  if (normalized === 'aluminum_formwork') return 'aluminum_form_early_strip'
  if (normalized === 'large_formwork') return 'large_form'
  if (normalized === 'wood_formwork' || normalized === 'timber_formwork') return 'wood_form'
  if (normalized === 'prefab_concrete') return 'prefab'
  if (normalized === 'mic_modular') return 'mic'
  return normalized
}

function pickTemplateSeedDurationDays(
  seedRule: StandardWorkDurationSeedRule | null,
  featureProfile: EngineeringFeatureProfile,
) {
  if (!seedRule) return null
  const byMethod = readRecord(seedRule.defaultDaysByMethod)
  for (const methodCode of featureProfile.methodVariantCodes.map(normalizeDurationMethodCode)) {
    const methodDays = readPositiveNumber(byMethod[methodCode])
    if (methodDays) return methodDays
  }

  let baseDays = readPositiveNumber(seedRule.defaultDaysP50)
  if (!baseDays) return null
  const projectType = normalizeText(featureProfile.projectTypeCode).toLowerCase()
  const projectFactor = readPositiveFactor(readRecord(seedRule.projectTypeDurationFactors)[projectType])
  if (projectFactor) baseDays = Math.max(1, Math.ceil(baseDays * projectFactor))
  const structureType = normalizeText(featureProfile.structureTypeCode).toLowerCase()
  const structureFactor = readPositiveFactor(readRecord(seedRule.structureTypeDurationFactors)[structureType])
  if (structureFactor) baseDays = Math.max(1, Math.ceil(baseDays * structureFactor))
  const elementFactors = readRecord(seedRule.elementVariantDurationFactors)
  for (const elementCode of featureProfile.elementVariantCodes.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)) {
    const elementFactor = readPositiveFactor(elementFactors[elementCode])
    if (elementFactor) {
      baseDays = Math.max(1, Math.ceil(baseDays * elementFactor))
      break
    }
  }
  return baseDays
}

function readPositiveFactor(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeRate01(value: unknown): number | null {
  const parsed = readOptionalNumber(value)
  if (parsed === null || parsed <= 0) return null
  return clampNumber(parsed > 1 ? parsed / 100 : parsed, 0, 1)
}

type ProjectFactDurationScalingResult = {
  days: number
  applied: boolean
  factor: number
  quantity: number | null
  defaultQuantity: number | null
  basis: StandardWorkDurationSeedRule['scaleBasis'] | string | null
  source: string | null
  projectScaleRatio: number | null
  baseline: Record<string, unknown> | null
}

type PrefabRateDurationFactor = {
  factor: number
  profile: string
}

type ConstructionSchedulePhaseKind =
  | 'foundation'
  | 'basement'
  | 'superstructure'
  | 'mep'
  | 'finishing'
  | 'facade'
  | 'commissioning'
  | 'outdoor'
  | 'control'
  | 'prefab'
  | 'general'

function isLowRiseMultiBuildingParallelProject(featureProfile: EngineeringFeatureProfile) {
  return isLowRiseMultiBuildingParallelScenario(featureProfile)
}

function readExecutionProfileFromProjectFacts(featureProfile: EngineeringFeatureProfile): BuildingPatternExecutionArchetypeProfile {
  return inferExecutionProfileFromProjectFacts(featureProfile)
}

function executionProfileHasArchetype(
  profile: BuildingPatternExecutionArchetypeProfile,
  archetype: BuildingPatternExecutionArchetype,
) {
  return profile.primaryArchetype === archetype
    || profile.crossCuttingArchetypes.includes(archetype)
    || profile.allArchetypes.includes(archetype)
}

function inferSchedulePhaseKindFromText(value: unknown): ConstructionSchedulePhaseKind {
  const text = normalizeText(value).toLowerCase()
  if (!text) return 'general'
  if (text.includes('site') || text.includes('danger') || text.includes('quality') || text.includes('doc') || text.includes('milestone')) return 'control'
  if (text.includes('prefab') || text.includes('factory') || text.includes('module') || text.includes('mic') || text.includes('hoist')) return 'prefab'
  if (text.includes('foundation') || text.includes('pit') || text.includes('pile')) return 'foundation'
  if (text.includes('basement') || text.includes('waterproof')) return 'basement'
  if (text.includes('superstructure') || text.includes('structure-core') || text.includes('structure')) return 'superstructure'
  if (text.includes('mep') || text.includes('electrical') || text.includes('hvac') || text.includes('mechanical') || text.includes('plumbing')) return 'mep'
  if (text.includes('facade') || text.includes('curtain')) return 'facade'
  if (text.includes('finishing') || text.includes('fitout') || text.includes('decoration') || text.includes('guestroom')) return 'finishing'
  if (text.includes('commission') || text.includes('validation') || text.includes('handover') || text.includes('elevator')) return 'commissioning'
  if (text.includes('outdoor')) return 'outdoor'
  return 'general'
}

function readScenarioScheduleProfile(featureProfile: EngineeringFeatureProfile): ProjectScenarioScheduleProfile {
  return resolveScenarioScheduleProfile({
    recommendationPacks: featureProfile.recommendationPacks as WbsTemplateProjectRecommendationKey[],
    facts: {
      businessType: featureProfile.businessType,
      businessSubtype: featureProfile.businessSubtype,
      methodVariantCodes: featureProfile.methodVariantCodes,
      projectTypeCode: featureProfile.projectTypeCode,
      structureTypeCode: featureProfile.structureTypeCode,
      buildingPatternCodes: featureProfile.buildingPatternCodes,
      totalAreaM2: featureProfile.totalAreaM2,
      buildingCount: featureProfile.buildingCount,
      standardFloorCount: featureProfile.standardFloorCount,
      highestBuildingFloorCount: featureProfile.highestBuildingFloorCount,
      basementLevelCount: featureProfile.basementLevelCount,
      basementAreaM2: featureProfile.basementAreaM2,
      foundationDepthM: featureProfile.foundationDepthM,
      prefabRate: featureProfile.prefabRate,
    },
  })
}

function shouldCompactInferredBuildingsToWorkfacePool(scope: WbsTemplateScope) {
  if (scope.building_sequence_source !== 'inferred_building_count') return false
  if ((scope.building_sequence_total ?? 0) <= 3) return false
  return isLowRiseMultiBuildingParallelProject(buildEngineeringFeatureProfile(scope))
}

function readConstructionArchetypeDurationFactor(
  stableCodeValue: unknown,
  featureProfile: EngineeringFeatureProfile,
  scaleBasis: StandardWorkDurationSeedRule['scaleBasis'] | string | null,
) {
  const executionProfile = readExecutionProfileFromProjectFacts(featureProfile)
  const stableCode = normalizeText(stableCodeValue).toLowerCase()
  const phaseKind = inferSchedulePhaseKindFromText(stableCode)
  const floorCount = Math.max(
    readOptionalNumber(featureProfile.standardFloorCount) ?? 0,
    readOptionalNumber(featureProfile.highestBuildingFloorCount) ?? 0,
  )
  const compactLowRiseParallel = floorCount > 0 && floorCount <= 13
  const isMainDurationScope = stableCode.startsWith('01-')
    || stableCode.startsWith('02-')
    || stableCode.startsWith('03-')
    || stableCode.startsWith('04-')
    || stableCode.startsWith('05-')
    || stableCode.startsWith('06-')
    || stableCode.startsWith('07-')
    || stableCode.startsWith('08-')
    || stableCode.startsWith('10-')
    || stableCode.startsWith('fac-')
    || stableCode.startsWith('dec-')
    || stableCode.startsWith('plu-')
    || stableCode.startsWith('ele-')
    || stableCode.startsWith('hva-')
    || stableCode.startsWith('fir-')
    || stableCode.startsWith('int-')
    || stableCode.includes('bdt-')
    || scaleBasis === 'area'
    || scaleBasis === 'floor'
    || scaleBasis === 'workface'
    || scaleBasis === 'building'
    || scaleBasis === 'system'

  if (!isMainDurationScope) return null

  if (executionProfileHasArchetype(executionProfile, 'mic_modular_fast_track')) {
    return {
      factor: phaseKind === 'commissioning' ? 0.42 : phaseKind === 'mep' ? 0.36 : phaseKind === 'finishing' || phaseKind === 'facade' ? 0.34 : 0.32,
      profile: 'mic_modular_wet_work_replacement',
    }
  }
  if (executionProfileHasArchetype(executionProfile, 'steel_assembly_fast_track')) {
    return {
      factor: phaseKind === 'commissioning' ? 0.65 : phaseKind === 'mep' ? 0.55 : phaseKind === 'finishing' || phaseKind === 'facade' ? 0.52 : 0.58,
      profile: 'steel_assembly_wet_work_replacement',
    }
  }
  if (
    executionProfileHasArchetype(executionProfile, 'lowrise_multi_building_parallel')
    || isLowRiseMultiBuildingParallelProject(featureProfile)
  ) {
    if (!compactLowRiseParallel) {
      return {
        factor: phaseKind === 'commissioning' ? 0.9 : phaseKind === 'mep' ? 0.95 : phaseKind === 'finishing' || phaseKind === 'facade' ? 0.88 : stableCode.startsWith('01-') ? 0.94 : 0.88,
        profile: 'midrise_multi_building_parallel_workfaces',
      }
    }
    return {
      factor: phaseKind === 'commissioning' ? 0.68 : phaseKind === 'mep' ? 0.78 : phaseKind === 'finishing' || phaseKind === 'facade' ? 0.7 : stableCode.startsWith('01-') ? 0.82 : 0.72,
      profile: 'lowrise_multi_building_parallel_workfaces',
    }
  }

  return null
}

function readPrefabRateFactorForStableCode(
  stableCodeValue: unknown,
  featureProfile: EngineeringFeatureProfile,
  scaleBasis: StandardWorkDurationSeedRule['scaleBasis'] | string | null,
): PrefabRateDurationFactor | null {
  const prefabRate = normalizeRate01(featureProfile.prefabRate)
  if (prefabRate === null) return null

  const stableCode = normalizeText(stableCodeValue).toLowerCase()
  const methodCodes = featureProfile.methodVariantCodes.map(normalizeDurationMethodCode)
  const isPrefabMethod = methodCodes.some((code) => code === 'prefab')
    || normalizeText(featureProfile.structureTypeCode).toLowerCase().includes('prefab')
    || normalizeText(featureProfile.structureTypeCode).toLowerCase().includes('prefabricated')

  if (stableCode.startsWith('pfb-00')) {
    return {
      factor: clampNumber(0.94 + prefabRate * 0.45, 0.95, 1.34),
      profile: 'prefab_factory_supply_chain',
    }
  }
  if (stableCode.startsWith('pfb-02')) {
    return {
      factor: clampNumber(0.98 + prefabRate * 0.34, 0.98, 1.28),
      profile: 'prefab_grouting_connection_control',
    }
  }
  if (stableCode.startsWith('pfb-01')) {
    return {
      factor: clampNumber(0.98 + prefabRate * 0.24, 0.98, 1.2),
      profile: 'prefab_site_hoisting_control',
    }
  }
  if (stableCode.startsWith('pfb-03')) {
    return {
      factor: clampNumber(0.98 + prefabRate * 0.18, 0.98, 1.16),
      profile: 'prefab_acceptance_traceability_control',
    }
  }
  if (stableCode.startsWith('pfb-')) {
    return {
      factor: clampNumber(0.98 + prefabRate * 0.26, 0.98, 1.22),
      profile: 'prefab_specialty_general_control',
    }
  }

  const isCastInPlaceStructureScope = stableCode.startsWith('02-01')
    || stableCode.startsWith('02-03')
    || stableCode.startsWith('02-04')
    || stableCode.startsWith('02-05')
    || stableCode.includes('bdt-04')
    || scaleBasis === 'floor'
  if (isPrefabMethod && isCastInPlaceStructureScope) {
    return {
      factor: clampNumber(1 - prefabRate * 0.14, 0.86, 1),
      profile: 'prefab_reduces_cast_in_place_structure_scope',
    }
  }

  return null
}

function applyProjectFactDurationScaling(
  baseDays: number,
  seedRule: StandardWorkDurationSeedRule | null,
  featureProfile: EngineeringFeatureProfile,
): ProjectFactDurationScalingResult {
  return resolveSharedProjectFactDurationScaling(baseDays, seedRule, featureProfile)
}

function buildFastTemplateDurationSeedMatchText(
  node: TemplateNode,
  featureProfile: EngineeringFeatureProfile,
) {
  return [
    node.name,
    node.standardWorkName,
    node.standardWorkCode,
    node.stableCode,
    node.engineeringCategoryId,
    node.categoryType,
    featureProfile.projectTypeCode,
    featureProfile.structureTypeCode,
    ...featureProfile.methodVariantCodes,
    ...featureProfile.elementVariantCodes,
  ].map(normalizeId).filter(Boolean).join(' ').toLowerCase()
}

async function resolveFastTemplateDurationSeed(
  node: TemplateNode,
  featureProfile: EngineeringFeatureProfile,
): Promise<StandardWorkDurationSeedRule | null> {
  const standardWorkCodes = uniqueStringArray([
    normalizeId(node.standardWorkCode),
    normalizeId(node.stableCode),
  ])
  const seed = await resolveStandardWorkDurationSeed(
    buildFastTemplateDurationSeedMatchText(node, featureProfile),
    {
      standardWorkCode: normalizeId(node.standardWorkCode) || normalizeId(node.stableCode) || null,
      standardWorkCodes,
      templateNodeId: isBuiltInChinaTemplateId(node.templateId) ? null : node.id,
      methodVariantCodes: featureProfile.methodVariantCodes,
      elementVariantCodes: featureProfile.elementVariantCodes,
      projectTypeCode: featureProfile.projectTypeCode,
      structureTypeCode: featureProfile.structureTypeCode,
      applicableGranularity: node.categoryType === 'item_work' ? 'summary' : 'task',
      featureProfile: buildProjectGenerationFactsSnapshot(featureProfile),
    },
  )
  return seed as unknown as StandardWorkDurationSeedRule | null
}

function pickResolvedDurationSeedDays(seedRule: StandardWorkDurationSeedRule | null) {
  if (!seedRule) return null
  return readPositiveNumber(
    seedRule.defaultDaysP50
      ?? (seedRule as Record<string, unknown>).default_days_p50
      ?? (seedRule as Record<string, unknown>).defaultDays,
  )
}

type FastTemplateDescendantDurationScaling = {
  stableCode: string
  scaleBasis: string | null
  quantity: number | null
  defaultQuantity: number | null
  source: string | null
  projectScaleRatio: number | null
  baseline: Record<string, unknown> | null
  factor: number
  baseRecommendedDurationDays: number
  adjustedRecommendedDurationDays: number
}

type FastTemplateDescendantDurationEstimate = {
  days: number
  usesDurationSeed: boolean
  projectFactScalingApplied: boolean
  projectFactScalingSamples: FastTemplateDescendantDurationScaling[]
}

async function estimateFastTemplateDescendantDuration(
  node: TemplateNode,
  featureProfile: EngineeringFeatureProfile,
): Promise<FastTemplateDescendantDurationEstimate | null> {
  if (node.children.length === 0) return null
  let total = 0
  let usesDurationSeed = false
  let projectFactScalingApplied = false
  const projectFactScalingSamples: FastTemplateDescendantDurationScaling[] = []
  for (const child of node.children) {
    if (child.categoryType === 'process' || child.categoryType === 'activity_step') {
      const mode = readNodeDurationContributionMode(child)
      if (!isDurationBearingContributionMode(mode)) continue
      const childSeed = await resolveFastTemplateDurationSeed(child, featureProfile)
      usesDurationSeed = usesDurationSeed || Boolean(childSeed)
      const baseDays = pickResolvedDurationSeedDays(childSeed)
        ?? readPositiveNumber(child.defaultDurationDays)
        ?? 1
      const scaled = applyProjectFactDurationScaling(baseDays, childSeed, featureProfile)
      total += scaled.days
      if (scaled.applied) {
        projectFactScalingApplied = true
        if (projectFactScalingSamples.length < 5) {
          projectFactScalingSamples.push({
            stableCode: childSeed?.stableCode ?? child.stableCode,
            scaleBasis: scaled.basis,
            quantity: scaled.quantity,
            defaultQuantity: scaled.defaultQuantity ?? childSeed?.defaultQuantity ?? null,
            source: scaled.source,
            projectScaleRatio: scaled.projectScaleRatio,
            baseline: scaled.baseline,
            factor: Number(scaled.factor.toFixed(3)),
            baseRecommendedDurationDays: baseDays,
            adjustedRecommendedDurationDays: scaled.days,
          })
        }
      }
      continue
    }
    const nested = await estimateFastTemplateDescendantDuration(child, featureProfile)
    if (nested) {
      total += nested.days
      usesDurationSeed = usesDurationSeed || nested.usesDurationSeed
      projectFactScalingApplied = projectFactScalingApplied || nested.projectFactScalingApplied
      for (const sample of nested.projectFactScalingSamples) {
        if (projectFactScalingSamples.length >= 5) break
        projectFactScalingSamples.push(sample)
      }
    }
  }
  return total > 0
    ? {
      days: total,
      usesDurationSeed,
      projectFactScalingApplied,
      projectFactScalingSamples,
    }
    : null
}

async function buildFastTemplateDurationSuggestion(
  node: TemplateNode,
  featureProfile: EngineeringFeatureProfile,
  durationContributionMode: DurationContributionMode,
): Promise<GeneratedTemplateDurationSuggestion> {
  const seedRule = await resolveFastTemplateDurationSeed(node, featureProfile)
  const seedMode = normalizeDurationContributionMode(seedRule?.durationContributionMode)
  const effectiveMode = durationContributionMode ?? seedMode
  if (!isDurationBearingContributionMode(effectiveMode)) {
    return buildNonDurationTemplateSuggestion(effectiveMode)
  }

  const directSeedDurationDays = pickResolvedDurationSeedDays(seedRule)
  const descendantDurationEstimate = directSeedDurationDays == null
    ? await estimateFastTemplateDescendantDuration(node, featureProfile)
    : null
  const baseRecommendedDurationDays = directSeedDurationDays
    ?? descendantDurationEstimate?.days
    ?? readPositiveNumber(node.defaultDurationDays)
    ?? 1
  const descendantPrefabRateFactor = directSeedDurationDays == null && descendantDurationEstimate
    ? readPrefabRateFactorForStableCode(node.stableCode, featureProfile, null)
    : null
  const descendantArchetypeDurationFactor = directSeedDurationDays == null && descendantDurationEstimate
    ? readConstructionArchetypeDurationFactor(node.stableCode, featureProfile, null)
    : null
  const descendantAdjustmentFactor = (descendantPrefabRateFactor?.factor ?? 1) * (descendantArchetypeDurationFactor?.factor ?? 1)
  const descendantAdjustedDurationDays = descendantAdjustmentFactor !== 1
    ? Math.max(1, Math.ceil(baseRecommendedDurationDays * descendantAdjustmentFactor))
    : baseRecommendedDurationDays
  const directProjectFactScaling = directSeedDurationDays != null || !descendantDurationEstimate
    ? applyProjectFactDurationScaling(baseRecommendedDurationDays, seedRule, featureProfile)
    : null
  const projectFactScaling = directSeedDurationDays != null || !descendantDurationEstimate
    ? directProjectFactScaling!
    : {
      days: descendantAdjustedDurationDays,
      applied: descendantDurationEstimate.projectFactScalingApplied || descendantAdjustedDurationDays !== baseRecommendedDurationDays,
      factor: descendantAdjustmentFactor,
      quantity: null as number | null,
      defaultQuantity: null as number | null,
      basis: null as string | null,
      source: descendantPrefabRateFactor || descendantArchetypeDurationFactor
        ? `descendant_duration_seed_rollup:${[
            descendantArchetypeDurationFactor?.profile,
            descendantPrefabRateFactor?.profile,
          ].filter(Boolean).join('+')}`
        : 'descendant_duration_seed_rollup',
      projectScaleRatio: null as number | null,
      baseline: null as Record<string, unknown> | null,
    } satisfies ProjectFactDurationScalingResult
  const recommendedDurationDays = projectFactScaling.days
  const conservativeDurationDays = Math.max(
    recommendedDurationDays,
    projectFactScaling.applied && seedRule?.defaultDaysP50
      ? Math.ceil((readPositiveNumber(seedRule?.defaultDaysP80) ?? Math.ceil(baseRecommendedDurationDays * 1.35)) * (recommendedDurationDays / Math.max(baseRecommendedDurationDays, 1)))
      : readPositiveNumber(seedRule?.defaultDaysP80) ?? Math.ceil(recommendedDurationDays * 1.35),
  )
  const usesDurationSeed = Boolean(seedRule) || Boolean(descendantDurationEstimate?.usesDurationSeed)
  const seedSource = usesDurationSeed ? 'standard_work_duration_seed' : 'template_placeholder'
  return withTemplateFastEstimateDurationOutput({
    recommendedDurationDays,
    conservativeDurationDays,
    confidenceLevel: seedRule?.confidence ?? (descendantDurationEstimate?.usesDurationSeed ? 'medium' : 'low'),
    confidenceScore: seedRule?.confidence === 'high' ? 74 : seedRule?.confidence === 'medium' || descendantDurationEstimate?.usesDurationSeed ? 60 : 38,
    forecastSource: `${seedSource}:sync_fast_template`,
    durationCalibrationSource: usesDurationSeed ? 'standard_work_duration_seed' : 'unavailable',
    durationProvenance: usesDurationSeed ? 'standard_work_duration_seed' : 'unavailable',
    businessReason: seedRule?.benchmarkBasis
      ?? '?????????? seed ????????????',
    businessReasonCode: usesDurationSeed ? 'STANDARD_SEED_REFERENCE' : 'TEMPLATE_FAST_PLACEHOLDER',
    businessReasonCodes: uniqueStringArray([
      usesDurationSeed ? 'STANDARD_SEED_REFERENCE' : 'TEMPLATE_FAST_PLACEHOLDER',
      projectFactScaling.applied ? 'PROJECT_FACT_QUANTITY_SCALING' : null,
    ]),
    businessReasonParams: {
      durationSuggestionMode: 'fast_template',
      seedStableCode: seedRule?.stableCode ?? null,
      dbQuerySkipped: true,
      seedResolver: 'resolveStandardWorkDurationSeed',
      projectFactScaling: projectFactScaling.applied ? {
        scaleBasis: projectFactScaling.basis,
        quantity: projectFactScaling.quantity,
        defaultQuantity: projectFactScaling.defaultQuantity ?? seedRule?.defaultQuantity ?? null,
        scalingSource: projectFactScaling.source,
        projectScaleRatio: projectFactScaling.projectScaleRatio,
        baseline: projectFactScaling.baseline,
        factor: Number(projectFactScaling.factor.toFixed(3)),
        baseRecommendedDurationDays,
        adjustedRecommendedDurationDays: recommendedDurationDays,
        rollupSource: descendantDurationEstimate?.projectFactScalingApplied && directSeedDurationDays == null
          ? 'descendant_duration_seed_rollup'
          : 'direct_duration_seed',
        descendantSamples: descendantDurationEstimate?.projectFactScalingSamples ?? [],
      } : null,
    },
    displaySummary: `?? ${recommendedDurationDays} ????????????????????????`,
    dataMaturity: usesDurationSeed ? 'L1' : 'L0',
    dataMaturityReasons: usesDurationSeed
      ? ['standard_work_duration seed matched through governed resolver']
      : ['template placeholder used because governed duration seed was not matched'],
    dataUpgradePath: ['background_duration_suggestion'],
    dataUpgradeBlockedBy: [],
    factorAvailability: {
      standard_work_duration_seed: usesDurationSeed,
      sync_fast_template: true,
      db_query_skipped: true,
      project_fact_quantity_scaling: projectFactScaling.applied,
    },
    durationContributionMode: effectiveMode,
  })
}

function buildBenchmarkPlanReferenceDurationSuggestion(
  node: TemplateNode,
  durationContributionMode: DurationContributionMode,
): GeneratedTemplateDurationSuggestion {
  const effectiveMode = durationContributionMode ?? readNodeDurationContributionMode(node)
  if (!isDurationBearingContributionMode(effectiveMode)) {
    return buildNonDurationTemplateSuggestion(effectiveMode)
  }

  const recommendedDurationDays = readPositiveNumber(node.defaultDurationDays) ?? 1
  const conservativeDurationDays = Math.max(recommendedDurationDays, Math.ceil(recommendedDurationDays * 1.35))

  return withPlanReferenceDurationOutput({
    recommendedDurationDays,
    conservativeDurationDays,
    durationOutputCode: 'contextual_reference',
    contextualReferenceDays: recommendedDurationDays,
    confidenceLevel: 'low',
    confidenceScore: 38,
    forecastSource: 'wbs_template_golden_benchmark:benchmark_plan_reference',
    durationCalibrationSource: 'unavailable',
    durationProvenance: 'unavailable',
    businessReason: 'Golden benchmark replay uses DB-free template duration evidence to validate generated schedule structure.',
    businessReasonCode: 'BENCHMARK_PLAN_REFERENCE_PLACEHOLDER',
    businessReasonCodes: ['BENCHMARK_PLAN_REFERENCE_PLACEHOLDER', 'GOLDEN_BENCHMARK_PLAN_REFERENCE'],
    businessReasonParams: {
      durationSuggestionMode: 'benchmark_plan_reference',
      dbQuerySkipped: true,
      runtimeExecutionFactsSkipped: true,
      seedResolverSkipped: true,
    },
    displaySummary: `Benchmark plan reference ${recommendedDurationDays} days`,
    dataMaturity: 'L0',
    dataMaturityReasons: ['benchmark placeholder used for runtime gate replay without DB-backed duration context'],
    dataUpgradePath: ['golden_benchmark_replay'],
    dataUpgradeBlockedBy: [],
    factorAvailability: {
      benchmark_plan_reference: true,
      db_query_skipped: true,
    },
    durationContributionMode: effectiveMode,
  })!
}

function buildFloorSeriesLabel(floors: WbsTemplateFloorSequenceInput[]) {
  if (floors.length === 0) return null
  const first = normalizeText(floors[0]?.label ?? floors[0]?.floorLabel ?? floors[0]?.floor_label ?? floors[0]?.name ?? floors[0]?.object_name ?? floors[0]?.floorObjectId ?? floors[0]?.floor_object_id ?? floors[0]?.id)
  const lastFloor = floors[floors.length - 1]
  const last = normalizeText(lastFloor?.label ?? lastFloor?.floorLabel ?? lastFloor?.floor_label ?? lastFloor?.name ?? lastFloor?.object_name ?? lastFloor?.floorObjectId ?? lastFloor?.floor_object_id ?? lastFloor?.id)
  if (floors.length === 1) return first || last || '1 floor'
  return [first || 'first', last || 'last'].join('-')
}

function buildFloorSeriesMetadata(scope: WbsTemplateScope) {
  const floors = Array.isArray(scope.floor_series) ? scope.floor_series : []
  if (!scope.floor_series_source || floors.length <= 1) return null
  return {
    source: scope.floor_series_source,
    count: scope.floor_series_count ?? floors.length,
    label: scope.floor_series_label ?? buildFloorSeriesLabel(floors),
    objectBinding: floors.some((floor) => normalizeId(floor.floorObjectId ?? floor.floor_object_id ?? floor.id))
      ? 'engineering_object_series'
      : 'inferred_sequence_series',
    floors: floors.map((floor, index) => ({
      index,
      number: index + 1,
      label: normalizeText(floor.label ?? floor.floorLabel ?? floor.floor_label ?? floor.name ?? floor.object_name)
        || normalizeText(floor.floorObjectId ?? floor.floor_object_id ?? floor.id)
        || `F${index + 1}`,
      floorObjectId: normalizeId(floor.floorObjectId ?? floor.floor_object_id ?? floor.id) || null,
      levelNumber: typeof floor.levelNumber === 'number'
        ? floor.levelNumber
        : typeof floor.level_number === 'number'
          ? floor.level_number
          : null,
      isBasement: floor.isBasement === true || floor.is_basement === true,
    })),
  }
}

function readNodeDurationContributionMode(
  node: TemplateNode,
  context: { planItemKind?: unknown; relationRole?: unknown } = {},
) {
  const metadata = readRecord(node.metadata)
  return normalizeDurationContributionMode(metadata.durationContributionMode ?? metadata.duration_contribution_mode)
    ?? inferDurationContributionMode({
      name: node.standardWorkName ?? node.name,
      metadata,
      planItemKind: context.planItemKind,
      relationRole: context.relationRole,
    })
}

function isDurationBearingNode(node: TemplateNode) {
  return isDurationBearingContributionMode(readNodeDurationContributionMode(node))
}

function isInternalFlowAnchorMode(mode: DurationContributionMode | null) {
  return mode === 'duration_bearing' || mode === 'quality_gate' || mode === 'handover_marker'
}

function getDurationSuggestionKey(scopeIndex: number, node: TemplateNode, elementVariant?: GeneratedElementVariant | null) {
  return `${scopeIndex}:${node.id}:${node.stableCode}:${elementVariant?.code ?? 'base'}`
}

function collectTemplateNodesById(nodes: TemplateNode[], result = new Map<string, TemplateNode>()) {
  for (const node of nodes) {
    result.set(node.id, node)
    collectTemplateNodesById(node.children, result)
  }
  return result
}

function withRecommendedDuration(
  suggestion: GeneratedTemplateDurationSuggestion,
  recommendedDurationDays: number,
  reason: string,
): GeneratedTemplateDurationSuggestion {
  const conservativeDurationDays = Math.max(
    recommendedDurationDays,
    readPositiveNumber(suggestion.conservativeDurationDays) ?? Math.ceil(recommendedDurationDays * 1.25),
  )
  return {
    ...suggestion,
    recommendedDurationDays,
    conservativeDurationDays,
    businessReason: suggestion.businessReason
      ? `${suggestion.businessReason}?${reason}`
      : reason,
    displaySummary: suggestion.displaySummary
      ? `${suggestion.displaySummary} ${reason}`
      : `?? ${recommendedDurationDays} ??${reason}?`,
    businessReasonCodes: uniqueStringArray([
      ...(suggestion.businessReasonCodes ?? []),
      'ACTIVITY_STEP_ROLLUP_ALIGNED',
    ]),
    businessReasonParams: {
      ...(suggestion.businessReasonParams ?? {}),
      activityStepRollupAligned: true,
      activityStepRollupDays: recommendedDurationDays,
    },
  }
}

function buildActivityStepDurationSuggestion(
  parentSuggestion: GeneratedTemplateDurationSuggestion,
  stepDurationDays: number,
  stepIndex: number,
  stepCount: number,
  parentTotalDays: number,
): GeneratedTemplateDurationSuggestion {
  return {
    ...parentSuggestion,
    recommendedDurationDays: stepDurationDays,
    conservativeDurationDays: stepDurationDays,
    forecastSource: `${parentSuggestion.forecastSource}+activity_step_rollup`,
    durationCalibrationSource: parentSuggestion.durationCalibrationSource,
    durationProvenance: parentSuggestion.durationProvenance,
    businessReason: `??? process ???? ${parentTotalDays} ?? ${stepCount} ? activity_step ???? ${stepIndex + 1} ????? ${stepDurationDays} ?`,
    businessReasonCode: 'ACTIVITY_STEP_ROLLUP_ALIGNED',
    businessReasonCodes: uniqueStringArray([
      ...(parentSuggestion.businessReasonCodes ?? []),
      'ACTIVITY_STEP_ROLLUP_ALIGNED',
    ]),
    businessReasonParams: {
      ...(parentSuggestion.businessReasonParams ?? {}),
      parentProcessRecommendedDurationDays: parentTotalDays,
      activityStepIndex: stepIndex,
      activityStepCount: stepCount,
      activityStepDurationDays: stepDurationDays,
    },
    displaySummary: `?? ${stepDurationDays} ????? process ?? ${parentTotalDays} ????activity_step ??? process ?????`,
  }
}

function buildNonDurationActivityStepSuggestion(
  parentSuggestion: GeneratedTemplateDurationSuggestion,
  mode: ReturnType<typeof readNodeDurationContributionMode>,
): GeneratedTemplateDurationSuggestion {
  const label = describeDurationContributionMode(mode)
  return {
    ...parentSuggestion,
    recommendedDurationDays: null,
    conservativeDurationDays: null,
    forecastSource: `${parentSuggestion.forecastSource}+duration_contribution_mode`,
    durationProvenance: 'unavailable',
    businessReason: `${label}????? process ??????`,
    businessReasonCode: 'NON_DURATION_BEARING_STANDARD_WORK',
    businessReasonCodes: uniqueStringArray([
      ...(parentSuggestion.businessReasonCodes ?? []),
      'NON_DURATION_BEARING_STANDARD_WORK',
    ]),
    businessReasonParams: {
      ...(parentSuggestion.businessReasonParams ?? {}),
      durationContributionMode: mode,
      durationContributionModeLabel: label,
      activityStepRollupExcluded: true,
    },
    displaySummary: `???????${label}????? process ???????`,
    durationContributionMode: mode,
  }
}

function buildNonDurationTemplateSuggestion(mode: DurationContributionMode): GeneratedTemplateDurationSuggestion {
  const label = describeDurationContributionMode(mode)
  return {
    recommendedDurationDays: null,
    conservativeDurationDays: null,
    confidenceLevel: 'medium',
    confidenceScore: 56,
    forecastSource: 'template_seed:duration_contribution_mode',
    durationCalibrationSource: 'standard_work_duration_seed',
    durationProvenance: 'unavailable',
    businessReason: `${label}，不生成独立参考工期`,
    businessReasonCode: 'NON_DURATION_BEARING_STANDARD_WORK',
    businessReasonCodes: ['NON_DURATION_BEARING_STANDARD_WORK'],
    businessReasonParams: {
      durationContributionMode: mode,
      durationContributionModeLabel: label,
    },
    displaySummary: `暂无参考工期；${label}，不参与普通施工工期计算。`,
    dataMaturity: 'L1',
    dataMaturityReasons: ['governed seed declares a non-duration-bearing contribution mode'],
    dataUpgradePath: [],
    dataUpgradeBlockedBy: [],
    factorAvailability: {
      standard_classification: true,
      standard_work_duration_seed: true,
      duration_contribution_mode: true,
    },
    durationContributionMode: mode,
  }
}

function codeMatchesReplacementCode(stableCode: string, replacementCode: string) {
  const code = normalizeText(stableCode)
  const replacement = normalizeText(replacementCode)
  return Boolean(code && replacement && (code === replacement || code.startsWith(`${replacement}-`)))
}

function collectCoreReplacementCodes(nodes: TemplateNode[], scopes: WbsTemplateScope[] = [{}]) {
  const codes: string[] = []
  for (const node of nodes) {
    const matchingScopes = scopes.filter((scope) => nodeMatchesEngineeringFeatureFilters(node, scope))
    if (matchingScopes.length === 0) continue
    const metadata = readRecord(node.metadata)
    if (readRowLikePackType(metadata) !== 'core_quality') {
      codes.push(...readStringArray(metadata.replacesCoreQualityCodes))
    }
    codes.push(...collectCoreReplacementCodes(node.children, matchingScopes))
  }
  return new Set(uniqueStringArray(codes))
}

function readRowLikePackType(source: Record<string, unknown>): WbsTemplatePackType {
  return (normalizeId(source.packType ?? source.pack_type) || 'core_quality') as WbsTemplatePackType
}

function isCoreNodeSuppressedByReplacement(node: TemplateNode, replacementCodes?: ReadonlySet<string>) {
  if (!replacementCodes?.size) return false
  const metadata = readRecord(node.metadata)
  if (readRowLikePackType(metadata) !== 'core_quality') return false
  if (!['process', 'activity_step'].includes(node.categoryType)) return false
  return [...replacementCodes].some((code) => codeMatchesReplacementCode(node.stableCode, code))
}

function getGeneratableChildren(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope,
  replacementCodes?: ReadonlySet<string>,
) {
  if (isFloorSeriesScope(scope) && isRhythmExpansionEligibleNode(node)) return []
  const childGenerationDepth = getChildGenerationDepth(node, generationDepth, scope)
  return node.children.filter((child) => (
    isWithinGenerationDepth(child, childGenerationDepth)
    && hasGeneratableRowsForNode(child, childGenerationDepth, scope, replacementCodes)
  ))
}

function hasGeneratableRowsForNode(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope,
  replacementCodes?: ReadonlySet<string>,
): boolean {
  if (!isWithinGenerationDepth(node, generationDepth)) return false
  if (isCoreNodeSuppressedByReplacement(node, replacementCodes)) return false
  if (!nodeMatchesEngineeringFeatureFilters(node, scope)) return false
  if (isFloorSeriesScope(scope) && isRhythmExpansionEligibleNode(node)) return true
  if (isGenerationDepthFrontierNode(node, generationDepth)) return true
  if (node.categoryType === 'process' || node.categoryType === 'activity_step' || node.categoryType === 'custom') return true
  if (node.children.length === 0) return true
  return getGeneratableChildren(node, generationDepth, scope, replacementCodes).length > 0
}

function countGeneratedRowsForNode(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope = {},
  replacementCodes?: ReadonlySet<string>,
): number {
  if (!hasGeneratableRowsForNode(node, generationDepth, scope, replacementCodes)) return 0
  const variants = deriveElementVariantsForGeneration(node, scope)
  const multiplier = variants.length > 0 ? variants.length : 1
  const childGenerationDepth = getChildGenerationDepth(node, generationDepth, scope)
  const childrenCount = getGeneratableChildren(node, generationDepth, scope, replacementCodes)
    .reduce((count, child) => count + countGeneratedRowsForNode(child, childGenerationDepth, scope, replacementCodes), 0)
  return multiplier * (1 + childrenCount)
}

function inferPreflightRowProjectionMode(node: TemplateNode): GeneratedRowProjectionMode {
  const metadata = readRecord(node.metadata)
  const templateGroup = (normalizeId(metadata.templateGroup) || 'building_main') as WbsTemplateDomainGroup
  const packType = (normalizeId(metadata.packType) || (templateGroup === 'building_main' ? 'core_quality' : 'specialty')) as WbsTemplatePackType
  const relationRole = normalizeId(metadata.relationRole)
  const planItemKind = inferPlanItemKind({ metadata, packType, relationRole, categoryType: node.categoryType })
  const scheduleParticipation = inferScheduleParticipation(planItemKind, metadata)
  const durationContributionMode = readNodeDurationContributionMode(node, { planItemKind, relationRole })
  return inferRowProjectionMode({
    metadata,
    categoryType: node.categoryType,
    planItemKind,
    scheduleParticipation,
    durationContributionMode,
  })
}

function countGeneratedMainPlanRowsForNode(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope = {},
  replacementCodes?: ReadonlySet<string>,
): number {
  if (!hasGeneratableRowsForNode(node, generationDepth, scope, replacementCodes)) return 0
  const variants = deriveElementVariantsForGeneration(node, scope)
  const multiplier = variants.length > 0 ? variants.length : 1
  const selfCount = inferPreflightRowProjectionMode(node) === 'schedule_row' ? 1 : 0
  const childGenerationDepth = getChildGenerationDepth(node, generationDepth, scope)
  const childrenCount = getGeneratableChildren(node, generationDepth, scope, replacementCodes)
    .reduce((count, child) => count + countGeneratedMainPlanRowsForNode(child, childGenerationDepth, scope, replacementCodes), 0)
  return multiplier * (selfCount + childrenCount)
}

function scopePhaseBatchKey(scope: WbsTemplateScope, scopeIndex: number) {
  return normalizeText(scope.phase_object_id) || `scope-${scopeIndex + 1}`
}

function scopeHasPhaseBatch(scope: WbsTemplateScope) {
  return Boolean(normalizeText(scope.phase_object_id))
}

function buildGenerationBatches(params: {
  generationBatchId: string
  templateIds: string[]
  scopeCombos: WbsTemplateScope[]
  rowCountsByScope: number[]
  totalRowCountsByScope?: number[]
  rows: GeneratedTemplateRow[]
}): { rowLimitPolicy: WbsTemplateGenerationRowLimitPolicy; splitByPhaseApplied: boolean; generationBatches: GeneratedTemplateBatch[] } {
  const rowProjectionCounts = countRowProjectionModes(params.rows)
  const totalRowCount = params.rows.length > 0
    ? params.rows.length
    : (params.totalRowCountsByScope ?? params.rowCountsByScope).reduce((sum, count) => sum + count, 0)
  const mainPlanRowCount = params.rows.length > 0
    ? rowProjectionCounts.schedule_row
    : params.rowCountsByScope.reduce((sum, count) => sum + count, 0)
  const hasPhasePartition = params.scopeCombos.length > 1 && params.scopeCombos.every(scopeHasPhaseBatch)
  if (!hasPhasePartition) {
    return {
      rowLimitPolicy: 'single_batch',
      splitByPhaseApplied: false,
      generationBatches: [{
        batchId: params.generationBatchId,
        phaseObjectId: params.scopeCombos[0]?.phase_object_id ?? null,
        scopeIndexes: params.scopeCombos.map((_, index) => index),
        rowCount: mainPlanRowCount,
        totalRowCount,
        rowProjectionCounts: params.rows.length > 0 ? rowProjectionCounts : undefined,
        templateIds: params.templateIds,
        rowLimit: WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
        rowLimitExceeded: mainPlanRowCount > WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
      }],
    }
  }

  const scopeIndexesByPhase = new Map<string, number[]>()
  params.scopeCombos.forEach((scope, scopeIndex) => {
    const key = scopePhaseBatchKey(scope, scopeIndex)
    scopeIndexesByPhase.set(key, [...(scopeIndexesByPhase.get(key) ?? []), scopeIndex])
  })

  const generationBatches = Array.from(scopeIndexesByPhase.entries()).map(([phaseKey, scopeIndexes], index): GeneratedTemplateBatch => {
    const rowCount = scopeIndexes.reduce((sum, scopeIndex) => sum + (params.rowCountsByScope[scopeIndex] ?? 0), 0)
    const totalRowCount = scopeIndexes.reduce((sum, scopeIndex) => sum + ((params.totalRowCountsByScope ?? params.rowCountsByScope)[scopeIndex] ?? 0), 0)
    const rows = params.rows.filter((row) => {
      const scopeIndex = Number(row.values.scope_index)
      return Number.isFinite(scopeIndex) && scopeIndexes.includes(scopeIndex)
    })
    const rowProjectionCounts = countRowProjectionModes(rows)
    const phaseObjectId = normalizeText(params.scopeCombos[scopeIndexes[0] ?? 0]?.phase_object_id) || null
    return {
      batchId: `${params.generationBatchId}:phase-${index + 1}`,
      phaseObjectId: phaseObjectId ?? phaseKey,
      scopeIndexes,
      rowCount,
      totalRowCount,
      rowProjectionCounts: rows.length > 0 ? rowProjectionCounts : undefined,
      templateIds: params.templateIds,
      rowLimit: WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
      rowLimitExceeded: rowCount > WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
    }
  })

  return {
    rowLimitPolicy: 'split_by_phase',
    splitByPhaseApplied: true,
    generationBatches,
  }
}

function countRowProjectionModes(rows: GeneratedTemplateRow[]): Record<GeneratedRowProjectionMode, number> {
  return rows.reduce<Record<GeneratedRowProjectionMode, number>>((counts, row) => {
    const mode = normalizeRowProjectionMode(row.rowProjectionMode ?? row.values.row_projection_mode ?? readRecord(row.values.standard_task_metadata).rowProjectionMode)
      || 'schedule_row'
    counts[mode] += 1
    return counts
  }, {
    schedule_row: 0,
    gate_marker: 0,
    inline_control: 0,
    linked_projection: 0,
  })
}

type DurationSuggestionTarget = {
  node: TemplateNode,
  elementVariant: GeneratedElementVariant | null,
  parentDurationBoundary: ParentDurationBoundaryContext | null,
}

type ParentDurationBoundaryContext = {
  parentStandardWorkCode: string | null
  parentTaskTitle: string | null
  parentDurationBoundaryPolicy: string
  parentDurationPolicySource: string | null
  parentReferenceDurationDays: number | null
}

function collectDurationSuggestionTargets(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope,
  result: DurationSuggestionTarget[] = [],
  inheritedElementVariant: GeneratedElementVariant | null = null,
  parentDurationBoundary: ParentDurationBoundaryContext | null = null,
) {
  if (!hasGeneratableRowsForNode(node, generationDepth, scope)) return result
  const variants = !inheritedElementVariant ? deriveElementVariantsForGeneration(node, scope) : []
  if (variants.length > 0) {
    variants.forEach((variant) => collectDurationSuggestionTargets(node, generationDepth, scope, result, variant, parentDurationBoundary))
    return result
  }

  if (isDurationSuggestionNode(node)) {
    result.push({ node, elementVariant: inheritedElementVariant, parentDurationBoundary })
  }
  const childGenerationDepth = getChildGenerationDepth(node, generationDepth, scope)
  const childParentBoundary = resolveChildParentDurationBoundary(node, scope, parentDurationBoundary)
  for (const child of getGeneratableChildren(node, generationDepth, scope)) {
    collectDurationSuggestionTargets(child, childGenerationDepth, scope, result, inheritedElementVariant, childParentBoundary)
  }
  return result
}

function normalizeParentDurationBoundaryPolicy(value: unknown): string | null {
  const normalized = normalizeText(value).toLowerCase()
  if (
    normalized === 'aggregate_package_window'
    || normalized === 'rhythm_package_window'
    || normalized === 'system_package_window'
    || normalized === 'specialty_package_window'
    || normalized === 'itempack_window'
    || normalized === 'parent_package_window'
  ) {
    return normalized
  }
  return null
}

function isHardParentDurationBoundaryPolicy(policy: string | null | undefined) {
  return policy === 'rhythm_package_window'
    || policy === 'system_package_window'
    || policy === 'specialty_package_window'
    || policy === 'itempack_window'
    || policy === 'parent_package_window'
}

function parentWindowBusinessReasonCode(policy: string | null | undefined) {
  return policy === 'rhythm_package_window'
    ? 'STANDARD_FLOOR_RHYTHM_WINDOW'
    : 'PARENT_PACKAGE_DURATION_WINDOW'
}

function parentWindowPolicySource(_policy: string | null | undefined) {
  return 'template_duration_truth_asset'
}

function normalizeDurationBoundaryPolicySource(value: unknown) {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return null
  return normalized
}

function packageChildWindowBusinessReasonCodes(policy: string | null | undefined) {
  return uniqueStringArray([
    'PACKAGE_CHILD_DURATION_WINDOW',
    policy === 'rhythm_package_window' ? 'STANDARD_FLOOR_RHYTHM_CURVE' : null,
  ])
}

function inferParentDurationBoundaryPolicy(node: TemplateNode): string | null {
  const metadata = readRecord(node.metadata)
  const explicit = normalizeParentDurationBoundaryPolicy(metadata.durationBoundaryPolicy ?? metadata.duration_boundary_policy)
  return explicit
}

function resolveParentReferenceDurationDays(node: TemplateNode, scope: WbsTemplateScope) {
  const metadata = readRecord(node.metadata)
  const policy = inferParentDurationBoundaryPolicy(node)
  const series = buildFloorRhythmSeriesAdjustment(node, scope)
  const curveDays = readFloorCurveDays(readFloorDurationCurve(metadata, scope), scope.floor_sequence_position)
  if (policy === 'rhythm_package_window') {
    if (series?.totalDays) return series.totalDays
    if (curveDays) return curveDays
  }
  const explicit = readPositiveNumber(
    metadata.referenceDurationDays
    ?? metadata.reference_duration_days
    ?? metadata.smartReferenceDays
    ?? metadata.smart_reference_days,
  )
  if (explicit) return explicit
  if (series?.totalDays) return series.totalDays
  return curveDays ?? readPositiveNumber(node.defaultDurationDays)
}

function resolveChildParentDurationBoundary(
  node: TemplateNode,
  scope: WbsTemplateScope,
  inherited: ParentDurationBoundaryContext | null,
): ParentDurationBoundaryContext | null {
  const policy = inferParentDurationBoundaryPolicy(node)
  if (!policy) return inherited
  if (!isHardParentDurationBoundaryPolicy(policy)) return inherited
  const metadata = readRecord(node.metadata)
  return {
    parentStandardWorkCode: node.standardWorkCode ?? node.stableCode ?? null,
    parentTaskTitle: node.standardWorkName ?? node.name ?? null,
    parentDurationBoundaryPolicy: policy,
    parentDurationPolicySource: normalizeDurationBoundaryPolicySource(metadata.durationBoundaryPolicySource ?? metadata.duration_boundary_policy_source)
      || parentWindowPolicySource(policy),
    parentReferenceDurationDays: resolveParentReferenceDurationDays(node, scope),
  }
}

function serializeDurationSuggestion(suggestion: DurationSuggestion): GeneratedTemplateDurationSuggestion {
  return {
    recommendedDurationDays: suggestion.recommendedDurationDays,
    conservativeDurationDays: suggestion.conservativeDurationDays,
    durationOutputCode: suggestion.durationOutputCode ?? null,
    durationOutputSemanticFieldName: suggestion.durationOutputSemanticFieldName ?? null,
    durationOutputContract: readRecord(suggestion.durationOutputContract ?? suggestion.calculationContext?.durationOutputContract),
    templateFastEstimateDays: null,
    planReferenceDays: suggestion.planReferenceDays ?? null,
    contextualReferenceDays: suggestion.contextualReferenceDays ?? null,
    remainingForecastDays: suggestion.remainingForecastDays ?? null,
    phaseWindowDays: suggestion.phaseWindowDays ?? null,
    accelerationTargetDays: suggestion.accelerationTargetDays ?? null,
    confidenceLevel: suggestion.confidenceLevel,
    confidenceScore: suggestion.confidenceScore,
    forecastSource: suggestion.forecastSource,
    durationCalibrationSource: suggestion.durationCalibrationSource,
    durationProvenance: suggestion.durationProvenance,
    businessReason: suggestion.businessReason,
    businessReasonCode: suggestion.businessReasonCode ?? null,
    businessReasonCodes: suggestion.businessReasonCodes ?? [],
    businessReasonParams: suggestion.businessReasonParams ?? null,
    displaySummary: suggestion.displaySummary ?? null,
    dataMaturity: suggestion.dataMaturity,
    dataMaturityReasons: suggestion.dataMaturityReasons ?? [],
    dataUpgradePath: suggestion.dataUpgradePath ?? [],
    dataUpgradeBlockedBy: suggestion.dataUpgradeBlockedBy ?? [],
    factorAvailability: suggestion.factorAvailability ?? {},
    durationContributionMode: suggestion.durationContributionMode ?? null,
    durationBoundaryRole: suggestion.durationBoundaryRole ?? null,
    parentDurationBoundaryPolicy: suggestion.parentDurationBoundaryPolicy ?? null,
    nonAdditiveWithParentDuration: suggestion.nonAdditiveWithParentDuration ?? false,
    parentReferenceDurationDays: suggestion.parentReferenceDurationDays ?? null,
    parentTaskTitle: suggestion.parentTaskTitle ?? null,
    independentReferenceDurationDays: suggestion.independentReferenceDurationDays ?? null,
    packageChildPlanDurationDays: suggestion.packageChildPlanDurationDays ?? null,
    planDurationTruthSource: suggestion.planDurationTruthSource ?? null,
    packageChildRhythmWindowStartDay: suggestion.packageChildRhythmWindowStartDay ?? null,
    packageChildRhythmWindowEndDay: suggestion.packageChildRhythmWindowEndDay ?? null,
    packageChildRhythmWindowRole: suggestion.packageChildRhythmWindowRole ?? null,
  }
}

function shouldUseDescendantRollupForDurationSuggestion(
  node: TemplateNode,
  suggestion: GeneratedTemplateDurationSuggestion,
) {
  if (node.categoryType !== 'item_work') return false
  if (node.children.length === 0) return false
  if (!isDurationBearingContributionMode(readNodeDurationContributionMode(node))) return false
  const reasonParams = readRecord(suggestion.businessReasonParams)
  const factorAvailability = suggestion.factorAvailability ?? {}
  const seedSource = normalizeText(reasonParams.seedSource).toLowerCase()
  return reasonParams.seedVariantFallback === true
    || suggestion.businessReasonCode === 'STANDARD_SEED_VARIANT_FALLBACK'
    || (
      factorAvailability.standard_work_duration_seed === true
      && factorAvailability.seed_variant_specific_match === false
      && seedSource.includes('fallback')
    )
}

async function estimateContextualDescendantRollupDuration(params: {
  projectId: string
  node: TemplateNode
  featureProfile: EngineeringFeatureProfile
  scope: WbsTemplateScope
  plannedStartDate?: string | null
  elementVariant: GeneratedElementVariant | null
}): Promise<{
  recommendedDurationDays: number
  conservativeDurationDays: number
  samples: Array<Record<string, unknown>>
  rollupAdjustment: Record<string, unknown> | null
} | null> {
  let recommendedTotal = 0
  let conservativeTotal = 0
  const samples: Array<Record<string, unknown>> = []

  for (const child of params.node.children) {
    if (child.categoryType === 'process' || child.categoryType === 'activity_step') {
      const childMode = readNodeDurationContributionMode(child)
      if (!isDurationBearingContributionMode(childMode)) continue
      const childSuggestion = serializeDurationSuggestion(await getTaskDurationSuggestion({
        projectId: params.projectId,
        templateNodeId: isBuiltInChinaTemplateId(child.templateId) ? null : child.id,
        templateStableCode: child.stableCode,
        wbsNodeType: child.categoryType,
        engineeringCategoryId: child.engineeringCategoryId,
        standardWorkCode: child.standardWorkCode,
        standardWorkName: child.standardWorkName,
        taskTitle: decorateTitleWithElementVariant(child.name, params.elementVariant),
        plannedStartDate: params.plannedStartDate,
        engineeringObjectId: params.scope.engineering_object_id,
        buildingObjectId: params.scope.building_object_id,
        floorObjectId: params.scope.floor_object_id,
        zoneObjectId: params.scope.physical_zone_object_id,
        projectTypeCode: params.featureProfile.projectTypeCode,
        structureTypeCode: params.featureProfile.structureTypeCode,
        methodVariantCodes: params.featureProfile.methodVariantCodes,
        projectGenerationFacts: buildProjectGenerationFactsSnapshot(params.featureProfile),
        elementVariantCodes: params.elementVariant ? [params.elementVariant.code] : params.featureProfile.elementVariantCodes,
      }))
      const promotedChildSuggestion = withPlanReferenceDurationOutput(childSuggestion)
      const childRecommended = readWritablePlanTaskDurationDays(promotedChildSuggestion)
        ?? readPositiveNumber(childSuggestion.recommendedDurationDays)
      if (!childRecommended) continue
      const childConservative = readPositiveNumber(childSuggestion.conservativeDurationDays)
        ?? Math.ceil(childRecommended * 1.15)
      recommendedTotal += childRecommended
      conservativeTotal += Math.max(childRecommended, childConservative)
      if (samples.length < 6) {
        samples.push({
          stableCode: child.stableCode,
          recommendedDurationDays: childRecommended,
          conservativeDurationDays: childConservative,
          forecastSource: childSuggestion.forecastSource,
          businessReasonCode: childSuggestion.businessReasonCode ?? null,
          scaleFactor: readRecord(childSuggestion.businessReasonParams).scaleFactor ?? null,
        })
      }
      continue
    }

    const nested = await estimateContextualDescendantRollupDuration({
      ...params,
      node: child,
    })
    if (!nested) continue
    recommendedTotal += nested.recommendedDurationDays
    conservativeTotal += nested.conservativeDurationDays
    for (const sample of nested.samples) {
      if (samples.length >= 6) break
      samples.push(sample)
    }
  }

  if (recommendedTotal <= 0) return null

  const rollupCompression = readContextualDescendantRollupCompression(params.featureProfile)
  const recommendedDurationDays = rollupCompression
    ? Math.max(1, Math.ceil(recommendedTotal * rollupCompression.factor))
    : recommendedTotal
  const rawConservativeDurationDays = Math.max(recommendedTotal, conservativeTotal || Math.ceil(recommendedTotal * 1.15))
  const conservativeDurationDays = rollupCompression
    ? Math.max(recommendedDurationDays, Math.ceil(rawConservativeDurationDays * rollupCompression.factor))
    : rawConservativeDurationDays

  return {
    recommendedDurationDays,
    conservativeDurationDays,
    samples,
    rollupAdjustment: rollupCompression
    ? {
        ...rollupCompression,
        rawRecommendedDurationDays: recommendedTotal,
        rawConservativeDurationDays,
        adjustedRecommendedDurationDays: recommendedDurationDays,
        adjustedConservativeDurationDays: conservativeDurationDays,
      }
    : null,
  }
}

function readContextualDescendantRollupCompression(featureProfile: EngineeringFeatureProfile) {
  const executionProfile = readExecutionProfileFromProjectFacts(featureProfile)
  if (executionProfileHasArchetype(executionProfile, 'mic_modular_fast_track')) {
    return {
      factor: 0.8,
      profile: 'mic_modular_factory_pipeline_rollup',
      reason: 'MiC/module factory-site pipeline compresses process-child rollup windows instead of treating all child processes as a fully serial onsite chain.',
    }
  }
  return null
}

async function preferContextualDescendantRollupDurationSuggestion(params: {
  projectId: string
  node: TemplateNode
  featureProfile: EngineeringFeatureProfile
  scope: WbsTemplateScope
  plannedStartDate?: string | null
  elementVariant: GeneratedElementVariant | null
  suggestion: GeneratedTemplateDurationSuggestion
}): Promise<GeneratedTemplateDurationSuggestion> {
  if (!shouldUseDescendantRollupForDurationSuggestion(params.node, params.suggestion)) {
    return params.suggestion
  }
  const rollup = await estimateContextualDescendantRollupDuration(params)
  if (!rollup) return params.suggestion
  const reason = '父级工序包命中泛化 seed，已改用子工序计划参考工期汇总，避免 overview 行被标题关键词误配到其他专业 family'
  return {
    ...params.suggestion,
    recommendedDurationDays: rollup.recommendedDurationDays,
    conservativeDurationDays: rollup.conservativeDurationDays,
    durationOutputCode: 'contextual_reference',
    contextualReferenceDays: rollup.recommendedDurationDays,
    planReferenceDays: null,
    forecastSource: `${params.suggestion.forecastSource}+item_pack_descendant_rollup`,
    businessReason: [params.suggestion.businessReason, reason].map((item) => normalizeText(item)).filter(Boolean).join('；'),
    businessReasonCode: 'ITEM_PACK_DESCENDANT_ROLLUP',
    businessReasonCodes: uniqueStringArray([
      ...(params.suggestion.businessReasonCodes ?? []),
      'ITEM_PACK_DESCENDANT_ROLLUP',
    ]),
    businessReasonParams: {
      ...readRecord(params.suggestion.businessReasonParams),
      descendantRollup: {
        source: 'contextual_child_process_duration_suggestions',
        childCount: rollup.samples.length,
        samples: rollup.samples,
        rollupAdjustment: rollup.rollupAdjustment,
      },
    },
    dataMaturityReasons: uniqueStringArray([
      ...(params.suggestion.dataMaturityReasons ?? []),
      'item-pack duration uses contextual child process rollup because direct seed was generic fallback',
    ]),
    factorAvailability: {
      ...(params.suggestion.factorAvailability ?? {}),
      item_pack_descendant_rollup: true,
    },
  }
}

function findAncestorNode(
  node: TemplateNode,
  nodeById: Map<string, TemplateNode>,
  predicate: (candidate: TemplateNode) => boolean,
) {
  let current: TemplateNode | null = node
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    if (predicate(current)) return current
    visited.add(current.id)
    current = current.parentId ? nodeById.get(current.parentId) ?? null : null
  }
  return null
}

function normalizeFloorMethodCode(value: unknown) {
  const code = normalizeText(value).toLowerCase()
  if (code === 'aluminum_formwork') return 'aluminum_form_early_strip'
  if (code === 'large_formwork') return 'large_form'
  if (code === 'wood_formwork') return 'wood_form'
  if (code === 'climbing_formwork') return 'climbing_form'
  return code
}

function readFloorDurationCurve(metadata: Record<string, unknown>, scope: WbsTemplateScope): Record<string, unknown> | null {
  const byMethod = readRecord(metadata.floorDurationCurveByMethod ?? metadata.floor_duration_curve_by_method)
  const methodCodes = uniqueStringArray([
    ...(scope.method_variant_codes ?? []),
    'default',
  ].map((item) => normalizeFloorMethodCode(item)))
  for (const methodCode of methodCodes) {
    const curve = readRecord(byMethod[methodCode] ?? byMethod[normalizeFloorMethodCode(methodCode)])
    if (Object.keys(curve).length > 0) return curve
  }

  const fallback = readRecord(metadata.floorDurationCurve ?? metadata.floor_duration_curve)
  return Object.keys(fallback).length > 0 ? fallback : null
}

function readFloorCurveDays(curve: Record<string, unknown> | null, position: WbsTemplateScope['floor_sequence_position']) {
  if (!curve || !position) return null
  const candidates = position === 'first'
    ? [curve.firstFloor, curve.first_floor, curve.first]
    : position === 'last'
      ? [curve.lastFloors, curve.last_floor, curve.last, curve.topFloor, curve.top_floor, curve.top]
      : position === 'single'
        ? [curve.singleFloor, curve.single_floor, curve.midFloors, curve.mid_floors, curve.middle, curve.standard]
        : [curve.midFloors, curve.mid_floors, curve.middleFloors, curve.middle_floors, curve.middle, curve.standard]
  for (const value of candidates) {
    const days = readPositiveNumber(value)
    if (days) return days
  }
  return null
}

function readFloorCurveDaysForIndex(curve: Record<string, unknown> | null, index: number, total: number) {
  return readFloorCurveDays(curve, buildFloorSequenceScope(index, total, 'explicit_floor_array').floor_sequence_position)
}

function buildFloorRhythmSeriesAdjustment(
  node: TemplateNode,
  scope: WbsTemplateScope,
): { adjustment: Record<string, unknown>; totalDays: number } | null {
  const floors = Array.isArray(scope.floor_series) ? scope.floor_series : []
  if (!isFloorSeriesScope(scope) || floors.length <= 1) return null
  const metadata = readRecord(node.metadata)
  const curve = readFloorDurationCurve(metadata, scope)
  if (!curve) return null
  const floorDurationDays = floors.map((_, index) => readFloorCurveDaysForIndex(curve, index, floors.length) ?? 1)
  const totalDays = floorDurationDays.reduce((sum, days) => sum + Math.max(1, days), 0)
  return {
    totalDays,
    adjustment: {
      source: 'template_duration_truth_asset',
      adjustmentKind: 'floor_duration_curve_series',
      durationSeedStableCode: null,
      durationSeedScope: 'itempack_floor_rhythm_series',
      rhythmPatternCode: normalizeText(metadata.rhythmPatternCode ?? metadata.rhythm_pattern_code) || null,
      rhythmNodeStableCode: node.stableCode,
      stableCode: node.stableCode,
      scopeExpansionMode: 'building_rhythm_series',
      workfaceInstanceMode: 'floor_cycle_matrix',
      floorCount: floors.length,
      floorSeriesLabel: scope.floor_series_label ?? buildFloorSeriesLabel(floors),
      totalRhythmDurationDays: totalDays,
      floorDurationCurve: curve,
      floorDurationDays,
      floors: floors.map((floor, index) => ({
        index,
        number: index + 1,
        label: normalizeText(floor.label ?? floor.floorLabel ?? floor.floor_label ?? floor.name ?? floor.object_name)
          || normalizeText(floor.floorObjectId ?? floor.floor_object_id ?? floor.id)
          || `F${index + 1}`,
        floorObjectId: normalizeId(floor.floorObjectId ?? floor.floor_object_id ?? floor.id) || null,
        durationDays: floorDurationDays[index],
        position: buildFloorSequenceScope(index, floors.length, 'explicit_floor_array').floor_sequence_position,
      })),
    },
  }
}

async function applyFloorRhythmSeriesSuggestions(params: {
  suggestions: Map<string, GeneratedTemplateDurationSuggestion>
  targetsByScope: Array<{ scope: WbsTemplateScope; scopeIndex: number; targets: DurationSuggestionTarget[] }>
}) {
  for (const { scope, scopeIndex, targets } of params.targetsByScope) {
    if (!isFloorSeriesScope(scope)) continue
    const featureProfile = buildEngineeringFeatureProfile(scope)
    for (const target of targets) {
      if (!isRhythmExpansionEligibleNode(target.node)) continue
      const series = buildFloorRhythmSeriesAdjustment(target.node, scope)
      if (!series) continue
      const suggestionKey = getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant)
      const existing = params.suggestions.get(suggestionKey)
      const durationSeed = await resolveFastTemplateDurationSeed(target.node, featureProfile)
      const durationSeedStableCode = normalizeText(durationSeed?.stableCode ?? series.adjustment.durationSeedStableCode)
      const usesDurationSeed = Boolean(durationSeedStableCode)
      const baseMode = normalizeDurationContributionMode(existing?.durationContributionMode)
        ?? readNodeDurationContributionMode(target.node)
      const baseSuggestion = existing ?? await buildFastTemplateDurationSuggestion(target.node, featureProfile, baseMode)
      params.suggestions.set(suggestionKey, {
        ...baseSuggestion,
        recommendedDurationDays: series.totalDays,
        conservativeDurationDays: Math.max(series.totalDays, Math.ceil(series.totalDays * 1.15)),
        businessReasonCode: 'STANDARD_FLOOR_RHYTHM_SERIES',
        businessReasonCodes: uniqueStringArray([
          ...(existing?.businessReasonCodes ?? []),
          'STANDARD_FLOOR_RHYTHM_SERIES',
        ]),
        businessReasonParams: {
          ...(existing?.businessReasonParams ?? {}),
          seedStableCode: durationSeedStableCode || (existing?.businessReasonParams?.seedStableCode as string | undefined) || null,
          floorRhythmSeries: true,
          totalRhythmDurationDays: series.totalDays,
          floorCount: scope.floor_series_count ?? scope.floor_series?.length ?? null,
        },
        displaySummary: [
          existing?.displaySummary,
          `?????? ${scope.floor_series_count ?? scope.floor_series?.length ?? 0} ??? ${series.totalDays} ??`,
        ].map(normalizeText).filter(Boolean).join(' '),
        factorAvailability: {
          ...(existing?.factorAvailability ?? {}),
          standard_work_duration_seed: existing?.factorAvailability?.standard_work_duration_seed || usesDurationSeed,
          standard_floor_rhythm_series: true,
        },
        durationCalibrationSource: usesDurationSeed ? 'standard_work_duration_seed' : (existing?.durationCalibrationSource ?? 'unavailable'),
        durationProvenance: usesDurationSeed ? 'standard_work_duration_seed' : (existing?.durationProvenance ?? 'unavailable'),
        forecastSource: usesDurationSeed
          ? 'standard_work_duration_seed:sync_fast_template:floor_rhythm_series'
          : (existing?.forecastSource ?? 'template_placeholder:sync_fast_template'),
        confidenceLevel: usesDurationSeed ? (existing?.confidenceLevel ?? 'medium') : (existing?.confidenceLevel ?? 'low'),
        confidenceScore: usesDurationSeed ? Math.max(existing?.confidenceScore ?? 0, 60) : existing?.confidenceScore ?? 38,
        dataMaturity: usesDurationSeed ? 'L1' : (existing?.dataMaturity ?? 'L0'),
        dataMaturityReasons: uniqueStringArray([
          ...(existing?.dataMaturityReasons ?? []),
          usesDurationSeed
            ? 'itemPack-level standard_work_duration seed matched for floor rhythm aggregate'
            : 'template floor rhythm curve used without itemPack duration seed match',
        ]),
        durationContributionMode: baseMode,
        floorRhythmAdjustment: {
          ...series.adjustment,
          durationSeedStableCode: durationSeedStableCode || null,
        },
      })
    }
  }
}

async function applyParentPackageWindowSuggestions(params: {
  suggestions: Map<string, GeneratedTemplateDurationSuggestion>
  targetsByScope: Array<{ scope: WbsTemplateScope; scopeIndex: number; targets: DurationSuggestionTarget[] }>
}) {
  for (const { scope, scopeIndex, targets } of params.targetsByScope) {
    if (isFloorSeriesScope(scope)) continue
    const featureProfile = buildEngineeringFeatureProfile(scope)
    for (const target of targets) {
      if (target.node.categoryType !== 'item_work') continue
      const policy = inferParentDurationBoundaryPolicy(target.node)
      if (!isHardParentDurationBoundaryPolicy(policy)) continue
      const parentWindowDays = resolveParentReferenceDurationDays(target.node, scope)
      if (!parentWindowDays) continue
      const suggestionKey = getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant)
      const existing = params.suggestions.get(suggestionKey)
      const baseMode = normalizeDurationContributionMode(existing?.durationContributionMode)
        ?? readNodeDurationContributionMode(target.node)
      const metadata = readRecord(target.node.metadata)
      const businessReasonCode = parentWindowBusinessReasonCode(policy)
      const baseSuggestion = existing ?? await buildFastTemplateDurationSuggestion(target.node, featureProfile, baseMode)
      params.suggestions.set(suggestionKey, {
        ...baseSuggestion,
        recommendedDurationDays: parentWindowDays,
        conservativeDurationDays: Math.max(parentWindowDays, readPositiveNumber(existing?.conservativeDurationDays) ?? Math.ceil(parentWindowDays * 1.15)),
        businessReasonCode,
        businessReasonCodes: uniqueStringArray([
          ...(existing?.businessReasonCodes ?? []),
          businessReasonCode,
        ]),
        businessReasonParams: {
          ...(existing?.businessReasonParams ?? {}),
          parentPackageDurationTruth: true,
          parentReferenceDurationDays: parentWindowDays,
          rhythmPatternCode: normalizeText(metadata.rhythmPatternCode ?? metadata.rhythm_pattern_code) || null,
          floorSequencePosition: scope.floor_sequence_position ?? null,
          floorSequenceNumber: scope.floor_sequence_number ?? null,
          floorSequenceTotal: scope.floor_sequence_total ?? null,
          planDurationTruthSource: 'parent_package_rhythm_window',
        },
        displaySummary: `标准层节拍包计划工期 ${parentWindowDays} 天；父级节点是本层结构流水总窗口，包内子工序只展示各自占用窗口。`,
        factorAvailability: {
          ...(existing?.factorAvailability ?? {}),
          parent_package_window_plan_truth: true,
          standard_floor_rhythm_curve: policy === 'rhythm_package_window',
          package_child_duration_window: true,
        },
        forecastSource: `${existing?.forecastSource ?? 'template_seed'}${existing?.forecastSource?.includes('parent_package_window') ? '' : '+parent_package_window'}`,
        floorRhythmAdjustment: {
          ...(existing?.floorRhythmAdjustment ?? {}),
          source: 'template_duration_truth_asset',
          adjustmentKind: policy === 'rhythm_package_window' ? 'floor_duration_curve' : 'parent_package_window',
          allocationPolicy: 'parent_package_rhythm_window',
          rhythmPatternCode: normalizeText(metadata.rhythmPatternCode ?? metadata.rhythm_pattern_code) || null,
          rhythmNodeStableCode: target.node.stableCode,
          floorSequenceNumber: scope.floor_sequence_number,
          floorSequenceTotal: scope.floor_sequence_total,
          floorSequencePosition: scope.floor_sequence_position,
          floorCurveDays: parentWindowDays,
          adjustedDurationDays: parentWindowDays,
        },
        parentDurationBoundaryPolicy: policy,
        nonAdditiveWithParentDuration: false,
        parentReferenceDurationDays: parentWindowDays,
        planDurationTruthSource: 'parent_package_rhythm_window',
      })
    }
  }
}

function findFloorRhythmNode(node: TemplateNode, nodeById: Map<string, TemplateNode>, scope: WbsTemplateScope) {
  if (!scope.floor_sequence_position || !scope.floor_sequence_total) return null
  return findAncestorNode(node, nodeById, (candidate) => {
    const metadata = readRecord(candidate.metadata)
    const curve = readFloorDurationCurve(metadata, scope)
    return Boolean(curve && readFloorCurveDays(curve, scope.floor_sequence_position))
  })
}

function allocateIntegerDurations(originalDurations: number[], targetTotal: number) {
  if (originalDurations.length === 0) return []
  const normalizedTarget = Math.max(originalDurations.length, Math.round(targetTotal))
  const originalTotal = originalDurations.reduce((sum, value) => sum + Math.max(1, value), 0)
  if (originalTotal <= 0) return originalDurations.map(() => 1)

  const raw = originalDurations.map((value) => Math.max(1, value) / originalTotal * normalizedTarget)
  const allocation = raw.map((value) => Math.max(1, Math.floor(value)))
  let sum = allocation.reduce((total, value) => total + value, 0)

  while (sum > normalizedTarget) {
    const index = allocation
      .map((value, itemIndex) => ({ value, itemIndex, fraction: raw[itemIndex] - Math.floor(raw[itemIndex]) }))
      .filter((item) => item.value > 1)
      .sort((left, right) => left.fraction - right.fraction || right.value - left.value)[0]?.itemIndex
    if (index === undefined) break
    allocation[index] -= 1
    sum -= 1
  }

  while (sum < normalizedTarget) {
    const index = raw
      .map((value, itemIndex) => ({ itemIndex, fraction: value - Math.floor(value) }))
      .sort((left, right) => right.fraction - left.fraction)[0]?.itemIndex ?? 0
    allocation[index] += 1
    sum += 1
  }

  return allocation
}

function withPackageChildRhythmWindowSuggestion(
  suggestion: GeneratedTemplateDurationSuggestion,
  target: DurationSuggestionTarget,
  parentWindowDays: number,
  window: NonNullable<ReturnType<typeof resolvePackageChildRhythmWindow>>,
  rhythmMetadata: Record<string, unknown>,
  originalDurationDays: number,
): GeneratedTemplateDurationSuggestion {
  const params = {
    ...(suggestion.businessReasonParams ?? {}),
    parentStandardWorkCode: target.parentDurationBoundary?.parentStandardWorkCode ?? null,
    parentTaskTitle: target.parentDurationBoundary?.parentTaskTitle ?? null,
    parentDurationBoundaryPolicy: target.parentDurationBoundary?.parentDurationBoundaryPolicy ?? null,
    parentDurationPolicySource: target.parentDurationBoundary?.parentDurationPolicySource ?? null,
    parentReferenceDurationDays: parentWindowDays,
    independentReferenceDurationDays: suggestion.independentReferenceDurationDays ?? originalDurationDays,
    independentConservativeDurationDays: suggestion.conservativeDurationDays ?? null,
    packageChildPlanDurationDays: window.durationDays,
    packageChildConservativeDurationDays: window.durationDays,
    packageChildRhythmWindowApplied: true,
    rhythmWindowStartDay: window.startDay,
    rhythmWindowEndDay: window.endDay,
    rhythmWindowRole: window.role,
    rhythmWindowSource: window.source,
    rhythmWindowConfidence: window.confidence,
    planDurationTruthSource: 'parent_package_rhythm_window',
    nonAdditiveWithParentDuration: true,
  }
  const displaySummary = `参考工期 ${window.durationDays} 天（第 ${window.startDay}-${window.endDay} 天），已纳入父级节拍 ${parentWindowDays} 天计划窗口；计划表以父级包窗口为约束。`
  return {
    ...suggestion,
    recommendedDurationDays: window.durationDays,
    conservativeDurationDays: window.durationDays,
    businessReason: [
      suggestion.businessReason,
      '该工序位于父级包内，参考工期来自包内排布；独立工序标准工期仅保留为审计依据',
    ].map(normalizeText).filter(Boolean).join('；'),
    businessReasonCode: 'PACKAGE_CHILD_DURATION_WINDOW',
    businessReasonCodes: uniqueStringArray([
      ...(suggestion.businessReasonCodes ?? []),
      ...packageChildWindowBusinessReasonCodes(target.parentDurationBoundary?.parentDurationBoundaryPolicy),
    ]),
    businessReasonParams: params,
    displaySummary: [
      suggestion.displaySummary,
      displaySummary,
    ].map(normalizeText).filter(Boolean).join(' | '),
    factorAvailability: {
      ...(suggestion.factorAvailability ?? {}),
      parent_duration_boundary: true,
      package_child_duration_window: true,
      parent_package_window_plan_truth: true,
      package_child_rhythm_window: true,
      standard_floor_rhythm_curve: target.parentDurationBoundary?.parentDurationBoundaryPolicy === 'rhythm_package_window',
    },
    forecastSource: `${suggestion.forecastSource}${suggestion.forecastSource.includes('package_child_rhythm_window') ? '' : '+package_child_rhythm_window'}`,
    floorRhythmAdjustment: {
      source: 'template_duration_truth_asset',
      adjustmentKind: 'floor_duration_curve',
      allocationPolicy: 'overlapped_package_child_rhythm_window',
      rhythmPatternCode: normalizeText(rhythmMetadata.rhythmPatternCode ?? rhythmMetadata.rhythm_pattern_code) || null,
      rhythmNodeStableCode: normalizeText(rhythmMetadata.stableCode) || target.parentDurationBoundary?.parentStandardWorkCode || null,
      floorCurveDays: parentWindowDays,
      originalDurationDays,
      adjustedDurationDays: window.durationDays,
      rhythmWindowStartDay: window.startDay,
      rhythmWindowEndDay: window.endDay,
      rhythmWindowRole: window.role,
      rhythmWindowSource: window.source,
      rhythmWindowConfidence: window.confidence,
      independentReferenceDurationDays: suggestion.independentReferenceDurationDays ?? originalDurationDays,
    },
    durationBoundaryRole: 'package_child_window',
    parentDurationBoundaryPolicy: target.parentDurationBoundary?.parentDurationBoundaryPolicy ?? suggestion.parentDurationBoundaryPolicy ?? null,
    nonAdditiveWithParentDuration: true,
    parentReferenceDurationDays: parentWindowDays,
    parentTaskTitle: target.parentDurationBoundary?.parentTaskTitle ?? suggestion.parentTaskTitle ?? null,
    independentReferenceDurationDays: suggestion.independentReferenceDurationDays ?? originalDurationDays,
    packageChildPlanDurationDays: window.durationDays,
    planDurationTruthSource: 'parent_package_rhythm_window',
    packageChildRhythmWindowStartDay: window.startDay,
    packageChildRhythmWindowEndDay: window.endDay,
    packageChildRhythmWindowRole: window.role,
  }
}

function applyFloorRhythmCurvesToSuggestionMap(params: {
  suggestions: Map<string, GeneratedTemplateDurationSuggestion>
  targetsByScope: Array<{ scope: WbsTemplateScope; scopeIndex: number; targets: DurationSuggestionTarget[] }>
  nodeById: Map<string, TemplateNode>
}) {
  for (const { scope, scopeIndex, targets } of params.targetsByScope) {
    if (scope.floor_sequence_source !== 'explicit_floor_array' && scope.floor_sequence_source !== 'inferred_floor_count') continue

    const groups = new Map<string, { rhythmNode: TemplateNode; curveDays: number; targets: DurationSuggestionTarget[] }>()
    for (const target of targets) {
      if (target.node.categoryType !== 'process') continue
      const rhythmNode = findFloorRhythmNode(target.node, params.nodeById, scope)
      if (!rhythmNode) continue
      const curve = readFloorDurationCurve(readRecord(rhythmNode.metadata), scope)
      const curveDays = readFloorCurveDays(curve, scope.floor_sequence_position)
      if (!curveDays) continue
      const key = `${scopeIndex}:${rhythmNode.id}:${target.elementVariant?.code ?? 'base'}`
      const group = groups.get(key) ?? { rhythmNode, curveDays, targets: [] }
      group.targets.push(target)
      groups.set(key, group)
    }

    for (const group of groups.values()) {
      const parentBoundaryPolicy = inferParentDurationBoundaryPolicy(group.rhythmNode)
      const hasParentPackageWindowTruth = isHardParentDurationBoundaryPolicy(parentBoundaryPolicy)
      const durationTargets = group.targets.filter((target) => {
        const suggestion = params.suggestions.get(getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant))
        const mode = normalizeDurationContributionMode(suggestion?.durationContributionMode)
        return Boolean(suggestion?.recommendedDurationDays && (!mode || isDurationBearingContributionMode(mode)))
      })
      if (durationTargets.length === 0) continue

      const originalDurations = durationTargets.map((target) => (
        Math.max(1, Math.round(
          params.suggestions.get(getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant))?.recommendedDurationDays ?? 1,
        ))
      ))
      const originalTotal = originalDurations.reduce((sum, value) => sum + value, 0)
      const allocatedDurations = allocateIntegerDurations(originalDurations, group.curveDays)

      durationTargets.forEach((target, targetIndex) => {
        const suggestionKey = getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant)
        const suggestion = params.suggestions.get(suggestionKey)
        if (!suggestion) return

        const rhythmMetadata: Record<string, unknown> = {
          ...readRecord(group.rhythmNode.metadata),
          stableCode: group.rhythmNode.stableCode,
        }
        const originalDurationDays = originalDurations[targetIndex]
        const rhythmWindow = hasParentPackageWindowTruth
          ? resolvePackageChildRhythmWindow({
              taskTitle: target.node.standardWorkName ?? target.node.name,
              standardWorkCode: target.node.standardWorkCode ?? target.node.stableCode,
              parentStandardWorkCode: group.rhythmNode.standardWorkCode ?? group.rhythmNode.stableCode,
              parentDurationBoundaryPolicy: parentBoundaryPolicy,
              parentReferenceDurationDays: group.curveDays,
              metadata: readRecord(target.node.metadata),
            })
          : null
        if (rhythmWindow) {
          params.suggestions.set(
            suggestionKey,
            withPackageChildRhythmWindowSuggestion(
              suggestion,
              {
                ...target,
                parentDurationBoundary: target.parentDurationBoundary ?? {
                  parentStandardWorkCode: group.rhythmNode.standardWorkCode ?? group.rhythmNode.stableCode,
                  parentTaskTitle: group.rhythmNode.standardWorkName ?? group.rhythmNode.name,
                  parentDurationBoundaryPolicy: parentBoundaryPolicy!,
                  parentDurationPolicySource: parentWindowPolicySource(parentBoundaryPolicy),
                  parentReferenceDurationDays: group.curveDays,
                },
              },
              group.curveDays,
              rhythmWindow,
              rhythmMetadata,
              originalDurationDays,
            ),
          )
          return
        }

        const recommendedDurationDays = allocatedDurations[targetIndex]
        const conservativeScale = originalDurations[targetIndex] > 0 ? recommendedDurationDays / originalDurations[targetIndex] : 1
        const conservativeDurationDays = Math.max(
          recommendedDurationDays,
          Math.round((suggestion.conservativeDurationDays ?? suggestion.recommendedDurationDays ?? recommendedDurationDays) * conservativeScale),
        )
        const floorRhythmAdjustment = {
          source: 'template_duration_truth_asset',
          adjustmentKind: 'floor_duration_curve',
          rhythmPatternCode: normalizeText(rhythmMetadata.rhythmPatternCode ?? rhythmMetadata.rhythm_pattern_code) || null,
          rhythmNodeStableCode: group.rhythmNode.stableCode,
          floorSequenceNumber: scope.floor_sequence_number,
          floorSequenceTotal: scope.floor_sequence_total,
          floorSequencePosition: scope.floor_sequence_position,
          floorCurveDays: group.curveDays,
          originalGroupDurationDays: originalTotal,
          adjustedGroupDurationDays: allocatedDurations.reduce((sum, value) => sum + value, 0),
          originalDurationDays: originalDurations[targetIndex],
          adjustedDurationDays: recommendedDurationDays,
        }

        params.suggestions.set(suggestionKey, {
          ...suggestion,
          recommendedDurationDays,
          conservativeDurationDays,
          businessReasonCode: suggestion.businessReasonCode ?? 'STANDARD_FLOOR_RHYTHM_CURVE',
          businessReasonCodes: uniqueStringArray([
            ...(suggestion.businessReasonCodes ?? []),
            'STANDARD_FLOOR_RHYTHM_CURVE',
          ]),
          displaySummary: [
            suggestion.displaySummary,
            `Standard floor ${scope.floor_sequence_number}/${scope.floor_sequence_total}: ${group.curveDays} day rhythm allocation`,
          ].map(normalizeText).filter(Boolean).join(' | '),
          factorAvailability: {
            ...(suggestion.factorAvailability ?? {}),
            standard_floor_rhythm_curve: true,
          },
          floorRhythmAdjustment,
        })
      })
    }
  }
}

function applyExplicitParentPackageWindowsToSuggestionMap(params: {
  suggestions: Map<string, GeneratedTemplateDurationSuggestion>
  targetsByScope: Array<{ scope: WbsTemplateScope; scopeIndex: number; targets: DurationSuggestionTarget[] }>
}) {
  for (const { scopeIndex, targets } of params.targetsByScope) {
    for (const target of targets) {
      if (target.node.categoryType !== 'process') continue
      const boundary = target.parentDurationBoundary
      if (!boundary || !isHardParentDurationBoundaryPolicy(boundary.parentDurationBoundaryPolicy)) continue
      if (boundary.parentDurationBoundaryPolicy === 'rhythm_package_window') continue
      const parentWindowDays = readPositiveNumber(boundary.parentReferenceDurationDays)
      if (!parentWindowDays) continue
      const suggestionKey = getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant)
      const suggestion = params.suggestions.get(suggestionKey)
      if (!suggestion) continue

      const rhythmWindow = resolvePackageChildRhythmWindow({
        taskTitle: target.node.standardWorkName ?? target.node.name,
        standardWorkCode: target.node.standardWorkCode ?? target.node.stableCode,
        parentStandardWorkCode: boundary.parentStandardWorkCode,
        parentDurationBoundaryPolicy: boundary.parentDurationBoundaryPolicy,
        parentReferenceDurationDays: parentWindowDays,
        metadata: readRecord(target.node.metadata),
      })
      if (!rhythmWindow) continue
      const originalDurationDays = Math.max(1, Math.round(suggestion.recommendedDurationDays ?? rhythmWindow.durationDays))

      params.suggestions.set(
        suggestionKey,
        withPackageChildRhythmWindowSuggestion(
          suggestion,
          target,
          parentWindowDays,
          rhythmWindow,
          {
            source: parentWindowPolicySource(boundary.parentDurationBoundaryPolicy),
            stableCode: boundary.parentStandardWorkCode,
          },
          originalDurationDays,
        ),
      )
    }
  }
}

function findFirstFloorRhythmNode(nodes: TemplateNode[], scope: WbsTemplateScope): TemplateNode | null {
  for (const node of nodes) {
    const metadata = readRecord(node.metadata)
    const curve = readFloorDurationCurve(metadata, scope)
    if (curve && readFloorCurveDays(curve, scope.floor_sequence_position)) return node
    const child = findFirstFloorRhythmNode(node.children ?? [], scope)
    if (child) return child
  }
  return null
}

function buildScopeStartDateByIndex(params: {
  selectedNodes: TemplateNode[]
  scopeCombos: WbsTemplateScope[]
  startDate: string
}) {
  const result = new Map<number, string>()
  params.scopeCombos.forEach((scope, scopeIndex) => {
    let offsetDays = 0
    if (
      scope.building_sequence_source === 'inferred_building_count'
      && scope.building_sequence_index != null
      && scope.building_sequence_index > 0
    ) {
      const profile = buildEngineeringFeatureProfile(scope)
      const floorCount = readOptionalNumber(profile.standardFloorCount)
        ?? readOptionalNumber(profile.highestBuildingFloorCount)
        ?? scope.floor_series_count
        ?? 0
      const buildingStaggerDays = floorCount >= 30 ? 30 : floorCount >= 18 ? 21 : 14
      offsetDays += scope.building_sequence_index * buildingStaggerDays
    }
    if ((scope.floor_sequence_source !== 'explicit_floor_array' && scope.floor_sequence_source !== 'inferred_floor_count') || scope.floor_sequence_index === null || scope.floor_sequence_index === undefined) {
      result.set(scopeIndex, offsetDays > 0 ? addDays(params.startDate, offsetDays) : params.startDate)
      return
    }
    const rhythmNode = findFirstFloorRhythmNode(params.selectedNodes, scope)
    if (!rhythmNode) {
      result.set(scopeIndex, offsetDays > 0 ? addDays(params.startDate, offsetDays) : params.startDate)
      return
    }
    for (let index = 0; index < scope.floor_sequence_index; index += 1) {
      const previousScope = {
        ...scope,
        ...buildFloorSequenceScope(index, scope.floor_sequence_total ?? 0, scope.floor_sequence_source),
      }
      const curve = readFloorDurationCurve(readRecord(rhythmNode.metadata), previousScope)
      offsetDays += readFloorCurveDays(curve, previousScope.floor_sequence_position) ?? 0
    }
    result.set(scopeIndex, offsetDays > 0 ? addDays(params.startDate, offsetDays) : params.startDate)
  })
  return result
}

async function buildDurationSuggestionMap(params: {
  projectId: string
  selectedNodes: TemplateNode[]
  scopeCombos: WbsTemplateScope[]
  generationDepth: WbsTemplateGenerationDepth
  durationSuggestionMode: WbsTemplateDurationSuggestionMode
  plannedStartDate?: string | null
  scopeStartDateByIndex?: Map<number, string>
}) {
  const suggestions = new Map<string, GeneratedTemplateDurationSuggestion>()
  const nodeById = collectTemplateNodesById(params.selectedNodes)
  const targetsByScope = params.scopeCombos.map((scope, scopeIndex) => ({
    scope,
    scopeIndex,
    targets: params.selectedNodes.flatMap((node) => collectDurationSuggestionTargets(node, params.generationDepth, scope)),
  }))

  await Promise.all(targetsByScope.flatMap(({ scope, scopeIndex, targets }) => (
    targets
      .filter((target) => target.node.categoryType !== 'activity_step')
      .map(async (target) => {
        const durationContributionMode = readNodeDurationContributionMode(target.node)
        if (!isDurationBearingContributionMode(durationContributionMode)) {
          suggestions.set(
            getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
            buildNonDurationTemplateSuggestion(durationContributionMode),
          )
          return
        }
        const featureProfile = buildEngineeringFeatureProfile(scope)
        if (params.durationSuggestionMode === 'fast_template') {
          suggestions.set(
            getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
            await buildFastTemplateDurationSuggestion(target.node, featureProfile, durationContributionMode),
          )
          return
        }
        if (params.durationSuggestionMode === 'benchmark_plan_reference') {
          suggestions.set(
            getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
            buildBenchmarkPlanReferenceDurationSuggestion(target.node, durationContributionMode),
          )
          return
        }
        const suggestion = await getTaskDurationSuggestion({
          projectId: params.projectId,
          templateNodeId: isBuiltInChinaTemplateId(target.node.templateId) ? null : target.node.id,
          templateStableCode: target.node.stableCode,
          wbsNodeType: target.node.categoryType,
          engineeringCategoryId: target.node.engineeringCategoryId,
          standardWorkCode: target.node.standardWorkCode,
          standardWorkName: target.node.standardWorkName,
          taskTitle: decorateTitleWithElementVariant(target.node.name, target.elementVariant),
          plannedStartDate: params.scopeStartDateByIndex?.get(scopeIndex) ?? params.plannedStartDate,
          engineeringObjectId: scope.engineering_object_id,
          buildingObjectId: scope.building_object_id,
          floorObjectId: scope.floor_object_id,
          zoneObjectId: scope.physical_zone_object_id,
          projectTypeCode: featureProfile.projectTypeCode,
          structureTypeCode: featureProfile.structureTypeCode,
          methodVariantCodes: featureProfile.methodVariantCodes,
          projectGenerationFacts: buildProjectGenerationFactsSnapshot(featureProfile),
          elementVariantCodes: target.elementVariant ? [target.elementVariant.code] : featureProfile.elementVariantCodes,
          parentStandardWorkCode: target.parentDurationBoundary?.parentStandardWorkCode ?? null,
          parentTaskTitle: target.parentDurationBoundary?.parentTaskTitle ?? null,
          parentDurationBoundaryPolicy: target.parentDurationBoundary?.parentDurationBoundaryPolicy ?? null,
          parentDurationPolicySource: target.parentDurationBoundary?.parentDurationPolicySource ?? null,
          parentReferenceDurationDays: target.parentDurationBoundary?.parentReferenceDurationDays ?? null,
          packageChildRhythmWindowStartDay: readPositiveNumber(readRecord(target.node.metadata).rhythmWindowStartDay ?? readRecord(target.node.metadata).rhythm_window_start_day),
          packageChildRhythmWindowEndDay: readPositiveNumber(readRecord(target.node.metadata).rhythmWindowEndDay ?? readRecord(target.node.metadata).rhythm_window_end_day),
          packageChildRhythmWindowDurationDays: readPositiveNumber(readRecord(target.node.metadata).rhythmWindowDurationDays ?? readRecord(target.node.metadata).rhythm_window_duration_days),
          packageChildRhythmWindowRole: normalizeText(readRecord(target.node.metadata).rhythmWindowRole ?? readRecord(target.node.metadata).rhythm_window_role) || null,
        })
        const serializedSuggestion = await preferContextualDescendantRollupDurationSuggestion({
          projectId: params.projectId,
          node: target.node,
          featureProfile,
          scope,
          plannedStartDate: params.scopeStartDateByIndex?.get(scopeIndex) ?? params.plannedStartDate,
          elementVariant: target.elementVariant,
          suggestion: serializeDurationSuggestion(suggestion),
        })
        suggestions.set(
          getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
          serializedSuggestion,
        )
      })
  )))

  applyFloorRhythmCurvesToSuggestionMap({ suggestions, targetsByScope, nodeById })
  applyExplicitParentPackageWindowsToSuggestionMap({ suggestions, targetsByScope })
  await applyParentPackageWindowSuggestions({ suggestions, targetsByScope })
  await applyFloorRhythmSeriesSuggestions({ suggestions, targetsByScope })

  if (params.generationDepth === 'activity_step') {
    for (const { scope, scopeIndex, targets } of targetsByScope) {
      const activityTargets = targets.filter((target) => target.node.categoryType === 'activity_step')
      const activityTargetsByParent = new Map<string, { parent: TemplateNode, targets: DurationSuggestionTarget[] }>()
      for (const target of activityTargets) {
        const parent = target.node.parentId ? nodeById.get(target.node.parentId) ?? null : null
        if (!parent || parent.categoryType !== 'process') continue
        const parentKey = `${parent.id}:${target.elementVariant?.code ?? 'base'}`
        const group = activityTargetsByParent.get(parentKey) ?? { parent, targets: [] }
        group.targets.push(target)
        activityTargetsByParent.set(parentKey, group)
      }

      for (const { parent, targets: siblingTargets } of activityTargetsByParent.values()) {
        const sortedSiblingTargets = [...siblingTargets].sort((left, right) => (
          parent.children.findIndex((child) => child.id === left.node.id)
          - parent.children.findIndex((child) => child.id === right.node.id)
        ))
        const durationBearingTargets = sortedSiblingTargets.filter((target) => isDurationBearingNode(target.node))
        const nonDurationTargets = sortedSiblingTargets.filter((target) => !isDurationBearingNode(target.node))
        const elementVariant = sortedSiblingTargets[0]?.elementVariant ?? null
        const parentKey = getDurationSuggestionKey(scopeIndex, parent, elementVariant)
        const parentSuggestion = suggestions.get(parentKey)
        if (!parentSuggestion) continue
        const parentBaseDays = readPositiveNumber(parentSuggestion.recommendedDurationDays)
          ?? readPositiveNumber(parent.defaultDurationDays)
          ?? Math.max(durationBearingTargets.length, 1)
        const parentTotalDays = Math.max(parentBaseDays, durationBearingTargets.length || 1)
        if (parentTotalDays !== parentBaseDays) {
          suggestions.set(parentKey, withRecommendedDuration(
            parentSuggestion,
            parentTotalDays,
            `?????? activity_step ??????????? 1 ???? process ??????? ${parentTotalDays} ?`,
          ))
        }
        const alignedParentSuggestion = suggestions.get(parentKey) ?? parentSuggestion
        const stepDurations = distributePlanDurationAcrossActivitySteps(parentTotalDays, durationBearingTargets.length || 1)
        durationBearingTargets.forEach((target, index) => {
          suggestions.set(
            getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
            buildActivityStepDurationSuggestion(alignedParentSuggestion, stepDurations[index] ?? 1, index, durationBearingTargets.length, parentTotalDays),
          )
        })
        nonDurationTargets.forEach((target) => {
          const mode = readNodeDurationContributionMode(target.node)
          suggestions.set(
            getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
            buildNonDurationActivityStepSuggestion(alignedParentSuggestion, mode),
          )
        })
      }

      const unresolvedActivityTargets = activityTargets.filter((target) => !suggestions.has(getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant)) && isDurationBearingNode(target.node))
      await Promise.all(unresolvedActivityTargets.map(async (target) => {
        const featureProfile = buildEngineeringFeatureProfile(scope)
        if (params.durationSuggestionMode === 'fast_template') {
          const durationContributionMode = readNodeDurationContributionMode(target.node)
          suggestions.set(
            getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
            await buildFastTemplateDurationSuggestion(target.node, featureProfile, durationContributionMode),
          )
          return
        }
        if (params.durationSuggestionMode === 'benchmark_plan_reference') {
          const durationContributionMode = readNodeDurationContributionMode(target.node)
          suggestions.set(
            getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
            buildBenchmarkPlanReferenceDurationSuggestion(target.node, durationContributionMode),
          )
          return
        }
        const suggestion = await getTaskDurationSuggestion({
          projectId: params.projectId,
          templateNodeId: isBuiltInChinaTemplateId(target.node.templateId) ? null : target.node.id,
          templateStableCode: target.node.stableCode,
          wbsNodeType: target.node.categoryType,
          engineeringCategoryId: target.node.engineeringCategoryId,
          standardWorkCode: target.node.standardWorkCode,
          standardWorkName: target.node.standardWorkName,
          taskTitle: decorateTitleWithElementVariant(target.node.name, target.elementVariant),
          plannedStartDate: params.plannedStartDate,
          engineeringObjectId: scope.engineering_object_id,
          buildingObjectId: scope.building_object_id,
          floorObjectId: scope.floor_object_id,
          zoneObjectId: scope.physical_zone_object_id,
          projectTypeCode: featureProfile.projectTypeCode,
          structureTypeCode: featureProfile.structureTypeCode,
          methodVariantCodes: featureProfile.methodVariantCodes,
          projectGenerationFacts: buildProjectGenerationFactsSnapshot(featureProfile),
          elementVariantCodes: target.elementVariant ? [target.elementVariant.code] : featureProfile.elementVariantCodes,
          parentStandardWorkCode: target.parentDurationBoundary?.parentStandardWorkCode ?? null,
          parentTaskTitle: target.parentDurationBoundary?.parentTaskTitle ?? null,
          parentDurationBoundaryPolicy: target.parentDurationBoundary?.parentDurationBoundaryPolicy ?? null,
          parentDurationPolicySource: target.parentDurationBoundary?.parentDurationPolicySource ?? null,
          parentReferenceDurationDays: target.parentDurationBoundary?.parentReferenceDurationDays ?? null,
          packageChildRhythmWindowStartDay: readPositiveNumber(readRecord(target.node.metadata).rhythmWindowStartDay ?? readRecord(target.node.metadata).rhythm_window_start_day),
          packageChildRhythmWindowEndDay: readPositiveNumber(readRecord(target.node.metadata).rhythmWindowEndDay ?? readRecord(target.node.metadata).rhythm_window_end_day),
          packageChildRhythmWindowDurationDays: readPositiveNumber(readRecord(target.node.metadata).rhythmWindowDurationDays ?? readRecord(target.node.metadata).rhythm_window_duration_days),
          packageChildRhythmWindowRole: normalizeText(readRecord(target.node.metadata).rhythmWindowRole ?? readRecord(target.node.metadata).rhythm_window_role) || null,
        })
        const serializedSuggestion = await preferContextualDescendantRollupDurationSuggestion({
          projectId: params.projectId,
          node: target.node,
          featureProfile,
          scope,
          plannedStartDate: params.plannedStartDate,
          elementVariant: target.elementVariant,
          suggestion: serializeDurationSuggestion(suggestion),
        })
        suggestions.set(
          getDurationSuggestionKey(scopeIndex, target.node, target.elementVariant),
          serializedSuggestion,
        )
      }))
    }
  }
  return suggestions
}

function readDurationDaysForNode(
  node: TemplateNode,
  scopeIndex: number,
  suggestionByNodeKey: Map<string, GeneratedTemplateDurationSuggestion>,
  elementVariant?: GeneratedElementVariant | null,
  scope?: WbsTemplateScope,
) {
  const suggestion = suggestionByNodeKey.get(getDurationSuggestionKey(scopeIndex, node, elementVariant))
  const suggestionMode = normalizeDurationContributionMode(suggestion?.durationContributionMode)
  if (suggestionMode && !isDurationBearingContributionMode(suggestionMode)) return 0
  if (!isDurationBearingNode(node)) return 0
  if (node.categoryType === 'item_work' && scope) {
    const parentWindowDays = resolveParentReferenceDurationDays(node, scope)
    if (parentWindowDays && isHardParentDurationBoundaryPolicy(inferParentDurationBoundaryPolicy(node))) {
      return parentWindowDays
    }
  }
  return Math.max(1, suggestion?.recommendedDurationDays ?? 1)
}

function readPackageChildRhythmWindowFromSuggestion(
  suggestion: GeneratedTemplateDurationSuggestion | null | undefined,
) {
  if (suggestion?.planDurationTruthSource !== 'parent_package_rhythm_window') return null
  const params = readRecord(suggestion.businessReasonParams)
  const startDay = readPositiveNumber(suggestion.packageChildRhythmWindowStartDay ?? params.rhythmWindowStartDay)
  const endDay = readPositiveNumber(suggestion.packageChildRhythmWindowEndDay ?? params.rhythmWindowEndDay)
  if (!startDay || !endDay) return null
  return {
    startDay,
    endDay: Math.max(startDay, endDay),
  }
}

function getPackageChildRhythmWindow(
  scopeIndex: number,
  node: TemplateNode,
  suggestionByNodeKey: Map<string, GeneratedTemplateDurationSuggestion>,
  elementVariant?: GeneratedElementVariant | null,
) {
  return readPackageChildRhythmWindowFromSuggestion(
    suggestionByNodeKey.get(getDurationSuggestionKey(scopeIndex, node, elementVariant)),
  )
}

type GeneratedPlanItemKind =
  | 'work_task'
  | 'management_task'
  | 'inspection_task'
  | 'document_task'
  | 'commercial_task'
  | 'safety_control'
  | 'milestone'
  | 'linked_projection'

const PLAN_ITEM_KIND_SET = new Set<string>([
  'work_task',
  'management_task',
  'inspection_task',
  'document_task',
  'commercial_task',
  'safety_control',
  'milestone',
  'linked_projection',
])

function normalizePlanItemKind(value: unknown): GeneratedPlanItemKind | '' {
  const normalized = normalizeId(value)
  return PLAN_ITEM_KIND_SET.has(normalized) ? normalized as GeneratedPlanItemKind : ''
}

function inferPlanItemKindFromRelationRole(relationRole: string): GeneratedPlanItemKind | '' {
  if (relationRole === 'workflow') return 'work_task'
  if (relationRole === 'evidence') return 'document_task'
  if (relationRole === 'inspection') return 'inspection_task'
  if (relationRole === 'commercial') return 'commercial_task'
  if (relationRole === 'approval') return 'safety_control'
  if (relationRole === 'handover') return 'milestone'
  if (relationRole === 'prerequisite' || relationRole === 'management') return 'management_task'
  if (relationRole === 'projected_link') return 'linked_projection'
  return ''
}

function inferPlanItemKind(params: {
  metadata: Record<string, unknown>
  packType: WbsTemplatePackType
  relationRole: string
  categoryType: TemplateNode['categoryType']
}) {
  const explicit = normalizePlanItemKind(params.metadata.planItemKind ?? params.metadata.plan_item_kind)
  if (explicit) return explicit
  const fromRelation = inferPlanItemKindFromRelationRole(params.relationRole)
  if (fromRelation) return fromRelation
  if (params.metadata.isAcceptanceMilestone || params.metadata.acceptanceLinkRule) return 'linked_projection'
  if (params.packType === 'project_milestone') return 'milestone'
  if (params.packType === 'danger_control') return 'safety_control'
  if (params.packType === 'quality_responsibility') return 'inspection_task'
  if (params.packType === 'document_commercial_support') return 'document_task'
  return 'work_task'
}

function inferProgressMode(planItemKind: GeneratedPlanItemKind, metadata: Record<string, unknown>) {
  const explicit = normalizeId(metadata.progressMode ?? metadata.progress_mode)
  if (['manual', 'event_triggered', 'upload_triggered', 'binary', 'inherited'].includes(explicit)) return explicit
  if (planItemKind === 'inspection_task') return 'event_triggered'
  if (planItemKind === 'document_task') return 'upload_triggered'
  if (planItemKind === 'milestone') return 'binary'
  if (planItemKind === 'linked_projection') return 'inherited'
  return 'manual'
}

function inferScheduleParticipation(planItemKind: GeneratedPlanItemKind, metadata: Record<string, unknown>) {
  const explicit = normalizeId(metadata.scheduleParticipation ?? metadata.schedule_participation)
  if (['normal', 'reference_only', 'read_only_projection', 'excluded'].includes(explicit)) return explicit
  if (planItemKind === 'linked_projection') return 'read_only_projection'
  if (planItemKind === 'document_task') return 'reference_only'
  return 'normal'
}

function inferCriticalPathEligible(planItemKind: GeneratedPlanItemKind, metadata: Record<string, unknown>) {
  if (metadata.criticalPathEligible !== undefined) return Boolean(metadata.criticalPathEligible)
  if (metadata.critical_path_eligible !== undefined) return Boolean(metadata.critical_path_eligible)
  return planItemKind === 'work_task'
    || planItemKind === 'management_task'
    || planItemKind === 'inspection_task'
    || planItemKind === 'safety_control'
    || planItemKind === 'milestone'
}

function inferScopeExpansionMode(planItemKind: GeneratedPlanItemKind, packType: WbsTemplatePackType, metadata: Record<string, unknown>) {
  const explicit = normalizeId(metadata.scopeExpansionMode ?? metadata.scope_expansion_mode)
  if (explicit) return explicit
  if (packType === 'danger_control') return 'triggered_object'
  if (packType === 'core_quality') return 'building'
  if (packType === 'specialty') return 'building'
  if (planItemKind === 'inspection_task') return 'referenced_work_or_project'
  return 'project'
}

function normalizeRowProjectionMode(value: unknown): GeneratedRowProjectionMode | '' {
  const mode = normalizeId(value)
  return mode === 'schedule_row'
    || mode === 'gate_marker'
    || mode === 'inline_control'
    || mode === 'linked_projection'
    ? mode
    : ''
}

function inferRowProjectionMode(params: {
  metadata: Record<string, unknown>
  categoryType: string
  planItemKind: GeneratedPlanItemKind
  scheduleParticipation: string
  durationContributionMode: DurationContributionMode | null
}): GeneratedRowProjectionMode {
  const explicit = normalizeRowProjectionMode(params.metadata.rowProjectionMode ?? params.metadata.row_projection_mode)
  if (explicit) return explicit
  if (params.planItemKind === 'linked_projection' || params.scheduleParticipation === 'read_only_projection') return 'linked_projection'
  if (params.categoryType === 'activity_step') return 'inline_control'
  if (params.durationContributionMode === 'duration_bearing') return 'schedule_row'
  if (params.planItemKind === 'milestone') return 'gate_marker'
  if (params.durationContributionMode === 'quality_gate' || params.durationContributionMode === 'handover_marker' || params.durationContributionMode === 'external_wait') return 'gate_marker'
  if (params.planItemKind === 'inspection_task' || params.planItemKind === 'safety_control') return 'gate_marker'
  if (params.durationContributionMode === 'embedded_check' || params.durationContributionMode === 'record_only') return 'inline_control'
  if (params.categoryType === 'division' || params.categoryType === 'sub_division' || params.categoryType === 'item_work') return 'schedule_row'
  return 'inline_control'
}

const EXECUTION_PHASE_ORDER: Record<string, number> = {
  startup_site_setup: 10,
  foundation_pit_pile: 20,
  basement_structure: 30,
  basement_waterproof_handover: 40,
  superstructure_rhythm: 50,
  secondary_structure_fitout_roughin: 60,
  mep_roughin: 70,
  envelope_roof_facade: 80,
  elevator_installation: 90,
  interior_fitout_terminal: 100,
  outdoor_municipal_landscape: 110,
  commissioning: 120,
  acceptance_handover: 130,
  management_support: 900,
}

function inferExecutionPhase(params: {
  stableCode: string
  title: string
  packType: WbsTemplatePackType
  templateGroup: string
  planItemKind: GeneratedPlanItemKind
  rowProjectionMode: GeneratedRowProjectionMode
}) {
  const text = `${params.stableCode} ${params.title} ${params.templateGroup}`.toLowerCase()
  const code = params.stableCode
  if (params.packType === 'project_milestone' || params.planItemKind === 'milestone' || params.rowProjectionMode === 'linked_projection') return 'acceptance_handover'
  if (params.packType === 'document_commercial_support' || params.packType === 'quality_responsibility') return 'management_support'
  if (params.packType === 'site_management' || params.packType === 'danger_control') return 'startup_site_setup'
  if (text.includes('??') || text.includes('trial') || text.includes('??') || text.includes('commission')) return 'commissioning'
  if (params.templateGroup === 'elevator' || code.startsWith('10-') || text.includes('电梯') || text.includes('井道')) return 'elevator_installation'
  if (params.templateGroup === 'outdoor' || params.templateGroup === 'municipal' || text.includes('室外') || text.includes('市政') || text.includes('景观')) return 'outdoor_municipal_landscape'
  if (params.templateGroup === 'facade' || params.templateGroup === 'waterproof' || code.startsWith('04-') || text.includes('??') || text.includes('??') || text.includes('facade') || text.includes('??')) return 'envelope_roof_facade'
  if (params.templateGroup === 'decoration' || code.startsWith('03-') || text.includes('精装') || text.includes('装修') || text.includes('抹灰') || text.includes('涂饰') || text.includes('吊顶')) return 'interior_fitout_terminal'
  if (['mep', 'hvac', 'plumbing', 'electrical', 'intelligent', 'cleanroom'].includes(params.templateGroup) || /^0[5-9]-/.test(code)) return 'mep_roughin'
  if (params.templateGroup === 'foundation' || code.startsWith('01-')) {
    if (text.includes('basement') || text.includes('??') || text.includes('??') || text.includes('??')) return 'basement_waterproof_handover'
    return 'foundation_pit_pile'
  }
  if (params.templateGroup === 'steel_structure' || params.templateGroup === 'prefab' || code.startsWith('02-')) {
    if (text.includes('砌筑') || text.includes('二次结构') || text.includes('粗装')) return 'secondary_structure_fitout_roughin'
    return 'superstructure_rhythm'
  }
  return 'management_support'
}

function inferExecutionLane(params: {
  executionPhase: string
  templateGroup: string
  packType: WbsTemplatePackType
}) {
  if (params.executionPhase === 'management_support') return params.packType
  if (params.executionPhase === 'mep_roughin') return params.templateGroup || 'mep'
  if (params.executionPhase === 'superstructure_rhythm') return 'structure'
  if (params.executionPhase === 'foundation_pit_pile') return 'foundation'
  if (params.executionPhase === 'basement_waterproof_handover') return 'basement'
  if (params.executionPhase === 'envelope_roof_facade') return params.templateGroup === 'facade' ? 'facade' : 'envelope'
  if (params.executionPhase === 'interior_fitout_terminal') return 'interior'
  return params.executionPhase
}

function buildWorkfaceId(scope: WbsTemplateScope) {
  return normalizeText(scope.physical_zone_object_id)
    || normalizeText(scope.functional_area_object_id)
    || normalizeText(scope.floor_object_id)
    || normalizeText(scope.building_object_id)
    || normalizeText(scope.section_object_id)
    || normalizeText(scope.phase_object_id)
    || normalizeText(scope.engineering_object_id)
    || 'project'
}

function buildLinkedProjectionSource(metadata: Record<string, unknown>) {
  const direct = readRecord(metadata.linkedProjectionSource ?? metadata.linked_projection_source)
  if (Object.keys(direct).length > 0) return direct
  const acceptanceLinkRule = readRecord(metadata.acceptanceLinkRule ?? metadata.acceptance_link_rule)
  if (Object.keys(acceptanceLinkRule).length === 0) return {}
  return {
    sourceType: 'acceptance_plan',
    sourceId: normalizeId(acceptanceLinkRule.referencedTypeFilter ?? acceptanceLinkRule.referenced_type_filter) || 'acceptance_plan',
    sourceLabel: 'Acceptance timeline',
    sourceRoute: '/acceptance-timeline',
  }
}

function buildGeneratedDurationSuggestionValue(
  durationSuggestion: GeneratedTemplateDurationSuggestion | null,
  durationContributionMode: string | null,
) {
  if (!durationSuggestion) return null
  const templateFastEstimateDays = durationSuggestion.durationOutputCode === 'template_fast_estimate'
    ? durationSuggestion.recommendedDurationDays ?? durationSuggestion.templateFastEstimateDays ?? null
    : durationSuggestion.templateFastEstimateDays ?? null
  return {
    conservativeDurationDays: durationSuggestion.conservativeDurationDays,
    durationOutputCode: durationSuggestion.durationOutputCode ?? null,
    durationOutputSemanticFieldName: durationSuggestion.durationOutputSemanticFieldName ?? null,
    durationOutputContract: durationSuggestion.durationOutputContract ?? null,
    durationOutputWriteEvaluation: durationSuggestion.durationOutputWriteEvaluation ?? null,
    durationOutputPromotion: durationSuggestion.durationOutputPromotion ?? null,
    templateFastEstimateDays,
    planReferenceDays: durationSuggestion.planReferenceDays ?? null,
    contextualReferenceDays: durationSuggestion.contextualReferenceDays ?? null,
    remainingForecastDays: durationSuggestion.remainingForecastDays ?? null,
    phaseWindowDays: durationSuggestion.phaseWindowDays ?? null,
    accelerationTargetDays: durationSuggestion.accelerationTargetDays ?? null,
    confidenceLevel: durationSuggestion.confidenceLevel,
    confidenceScore: durationSuggestion.confidenceScore,
    forecastSource: durationSuggestion.forecastSource,
    durationCalibrationSource: durationSuggestion.durationCalibrationSource,
    durationProvenance: durationSuggestion.durationProvenance,
    businessReason: durationSuggestion.businessReason,
    businessReasonCode: durationSuggestion.businessReasonCode ?? null,
    businessReasonCodes: durationSuggestion.businessReasonCodes ?? [],
    businessReasonParams: durationSuggestion.businessReasonParams ?? null,
    displaySummary: durationSuggestion.displaySummary ?? null,
    dataMaturity: durationSuggestion.dataMaturity ?? null,
    dataMaturityReasons: durationSuggestion.dataMaturityReasons ?? [],
    dataUpgradePath: durationSuggestion.dataUpgradePath ?? [],
    dataUpgradeBlockedBy: durationSuggestion.dataUpgradeBlockedBy ?? [],
    factorAvailability: durationSuggestion.factorAvailability ?? {},
    durationContributionMode: durationContributionMode ?? durationSuggestion.durationContributionMode ?? null,
    floorRhythmAdjustment: durationSuggestion.floorRhythmAdjustment ?? null,
    durationBoundaryRole: durationSuggestion.durationBoundaryRole ?? null,
    parentDurationBoundaryPolicy: durationSuggestion.parentDurationBoundaryPolicy ?? null,
    nonAdditiveWithParentDuration: durationSuggestion.nonAdditiveWithParentDuration ?? false,
    parentReferenceDurationDays: durationSuggestion.parentReferenceDurationDays ?? null,
    parentTaskTitle: durationSuggestion.parentTaskTitle ?? null,
    independentReferenceDurationDays: durationSuggestion.independentReferenceDurationDays ?? null,
    packageChildPlanDurationDays: durationSuggestion.packageChildPlanDurationDays ?? null,
    planDurationTruthSource: durationSuggestion.planDurationTruthSource ?? null,
    packageChildRhythmWindowStartDay: durationSuggestion.packageChildRhythmWindowStartDay ?? null,
    packageChildRhythmWindowEndDay: durationSuggestion.packageChildRhythmWindowEndDay ?? null,
    packageChildRhythmWindowRole: durationSuggestion.packageChildRhythmWindowRole ?? null,
  }
}

function buildGeneratedStandardTaskMetadata(
  node: TemplateNode,
  durationSuggestion: GeneratedTemplateDurationSuggestion | null,
  featureProfile: EngineeringFeatureProfile,
  elementVariant: GeneratedElementVariant | null,
  scope?: WbsTemplateScope,
) {
  const metadata = readRecord(node.metadata)
  const templateGroup = (normalizeId(metadata.templateGroup) || 'building_main') as WbsTemplateDomainGroup
  const packType = (normalizeId(metadata.packType) || (templateGroup === 'building_main' ? 'core_quality' : 'specialty')) as WbsTemplatePackType
  const generationPolicy = (normalizeId(metadata.generationPolicy) || 'explicit') as WbsTemplateGenerationPolicy
  const preconditionTemplates = readStringArray(metadata.preconditionTemplates)
  const acceptanceCheckpoints = readStringArray(metadata.acceptanceCheckpoints)
  const processConstraintRules = buildProcessConstraintRules(node, metadata)
  const elementVariantSuggestion = elementVariant ? null : inferElementVariantSuggestion(node)
  const relationRole = normalizeId(metadata.relationRole)
  const planItemKind = inferPlanItemKind({ metadata, packType, relationRole, categoryType: node.categoryType })
  const progressMode = inferProgressMode(planItemKind, metadata)
  const scheduleParticipation = inferScheduleParticipation(planItemKind, metadata)
  const criticalPathEligible = inferCriticalPathEligible(planItemKind, metadata)
  const scopeExpansionMode = normalizeId(scope?.scope_expansion_mode)
    || inferScopeExpansionMode(planItemKind, packType, metadata)
  const nodeDurationContributionMode = readNodeDurationContributionMode(node, { planItemKind, relationRole })
  const durationContributionMode = nodeDurationContributionMode
    ?? normalizeDurationContributionMode(durationSuggestion?.durationContributionMode)
  const durationBoundaryPolicy = normalizeParentDurationBoundaryPolicy(
    durationSuggestion?.parentDurationBoundaryPolicy
      ?? metadata.durationBoundaryPolicy
      ?? metadata.duration_boundary_policy,
  )
  const durationBoundaryPolicySource = normalizeDurationBoundaryPolicySource(
    metadata.durationBoundaryPolicySource
      ?? metadata.duration_boundary_policy_source
      ?? (durationBoundaryPolicy ? parentWindowPolicySource(durationBoundaryPolicy) : null),
  )
  const planDurationTruthSource = normalizeText(
    durationSuggestion?.planDurationTruthSource
      ?? metadata.planDurationTruthSource
      ?? metadata.plan_duration_truth_source,
  ) || null
  const rowProjectionMode = inferRowProjectionMode({
    metadata,
    categoryType: node.categoryType,
    planItemKind,
    scheduleParticipation,
    durationContributionMode,
  })
  const executionPhase = normalizeId(metadata.executionPhase ?? metadata.execution_phase)
    || inferExecutionPhase({
      stableCode: node.stableCode,
      title: node.standardWorkName ?? node.name,
      packType,
      templateGroup,
      planItemKind,
      rowProjectionMode,
    })
  const executionLane = normalizeId(metadata.executionLane ?? metadata.execution_lane)
    || inferExecutionLane({
      executionPhase,
      templateGroup,
      packType,
    })
  const executionNature = normalizeExecutionNature(metadata.executionNature ?? metadata.execution_nature)
    ?? inferExecutionNature({
      name: node.standardWorkName ?? node.name,
      metadata,
      planItemKind,
      relationRole,
      durationContributionMode,
    })
  const controlRoles = inferControlRoles({
    name: node.standardWorkName ?? node.name,
    metadata,
    packType,
    planItemKind,
    relationRole,
    durationContributionMode,
    executionNature,
  })
  const planItemTags = readStringArray(metadata.planItemTags ?? metadata.plan_item_tags)
  const linkedProjectionSource = buildLinkedProjectionSource(metadata)
  const milestoneSemanticRole = normalizeId(metadata.milestoneSemanticRole ?? metadata.milestone_semantic_role)
  const referencedCoreQualityCodes = readMergedStringArray(metadata.referencedCoreQualityCodes, metadata.semanticReferencedCoreQualityCodes)
  const extendsCoreQualityCodes = readStringArray(metadata.extendsCoreQualityCodes)
  const replacesCoreQualityCodes = readStringArray(metadata.replacesCoreQualityCodes)
  const referencedMilestoneCodes = readMergedStringArray(metadata.referencedMilestoneCodes, metadata.semanticReferencedMilestoneCodes)
  const referencedSiteManagementCodes = readMergedStringArray(metadata.referencedSiteManagementCodes, metadata.semanticReferencedSiteManagementCodes)
  const referencedDangerControlCodes = readMergedStringArray(metadata.referencedDangerControlCodes, metadata.semanticReferencedDangerControlCodes)
  const referencedQualityResponsibilityCodes = readMergedStringArray(metadata.referencedQualityResponsibilityCodes, metadata.semanticReferencedQualityResponsibilityCodes)
  const referencedDocumentCommercialCodes = readMergedStringArray(metadata.referencedDocumentCommercialCodes, metadata.semanticReferencedDocumentCommercialCodes)
  const referencedSpecialtyCodes = readMergedStringArray(metadata.referencedSpecialtyCodes, metadata.semanticReferencedSpecialtyCodes)
  const branchFamily = normalizeId(metadata.branchFamily ?? metadata.branch_family)
  const branchKey = normalizeId(metadata.branchKey ?? metadata.branch_key)
  const branchSelectionMode = normalizeId(metadata.branchSelectionMode ?? metadata.branch_selection_mode)
  const applicableProjectTypes = readMetadataCodeArray(metadata, 'applicableProjectTypes', 'applicable_project_types')
  const applicableStructureTypes = readMetadataCodeArray(metadata, 'applicableStructureTypes', 'applicable_structure_types', 'applicableStructures', 'applicable_structures')
  const applicableMethodVariantCodes = readMetadataCodeArray(metadata, 'applicableMethodVariantCodes', 'applicable_method_variant_codes', 'methodVariantCodes', 'method_variant_codes', 'methodVariants', 'method_variants')
  const methodVariantExpansionPolicy = normalizeId(metadata.methodVariantExpansionPolicy ?? metadata.method_variant_expansion_policy)
  const applicableFloorSequencePositions = readMetadataCodeArray(
    metadata,
    'applicableFloorSequencePositions',
    'applicable_floor_sequence_positions',
    'floorSequencePositions',
    'floor_sequence_positions',
  )
  const historyFeedbackPolicy = readRecord(metadata.historyFeedbackPolicy ?? metadata.history_feedback_policy)
  const dependencyIntentResolution = inspectV1475DependencyIntentTemplates({
    fromCatalogGroup: packType,
    fromReferencedCode: node.stableCode,
    metadata: {
      ...metadata,
      relationRole,
      referencedCoreQualityCodes,
      referencedMilestoneCodes,
      referencedSiteManagementCodes,
      referencedDangerControlCodes,
      referencedQualityResponsibilityCodes,
      referencedDocumentCommercialCodes,
      referencedSpecialtyCodes,
    },
  })
  return {
    templateId: node.templateId,
    templateNodeId: node.id,
    packType,
    templateGroup,
    generationPolicy,
    stableCode: node.stableCode,
    standardWorkCode: node.standardWorkCode,
    standardWorkName: node.standardWorkName,
    projectGenerationFacts: buildProjectGenerationFactsSnapshot(featureProfile),
    methodVariantCodes: featureProfile.methodVariantCodes,
    elementVariant,
    elementVariantSuggestion,
    processGranularity: normalizeId(metadata.processGranularity),
    generationMode: normalizeId(metadata.generationMode),
    planItemKind,
    progressMode,
    scheduleParticipation,
    criticalPathEligible,
    scopeExpansionMode,
    durationContributionMode,
    durationBoundaryPolicy,
    durationBoundaryPolicySource,
    planDurationTruthSource,
    parentDurationTruthRole: normalizeId(metadata.parentDurationTruthRole ?? metadata.parent_duration_truth_role),
    parentDurationTruthBoundary: normalizeId(metadata.parentDurationTruthBoundary ?? metadata.parent_duration_truth_boundary),
    rowProjectionMode,
    executionPhase,
    executionLane,
    executionNature,
    ...controlRoles,
    planItemTags,
    linkedProjectionSource,
    milestoneSemanticRole,
    relationRole,
    branchFamily,
    branchKey,
    branchSelectionMode,
    applicableProjectTypes,
    applicableStructureTypes,
    applicableMethodVariantCodes,
    applicableFloorSequencePositions,
    methodVariantExpansionPolicy,
    referencedCoreQualityCodes,
    extendsCoreQualityCodes,
    replacesCoreQualityCodes,
    referencedMilestoneCodes,
    referencedSiteManagementCodes,
    referencedDangerControlCodes,
    referencedQualityResponsibilityCodes,
    referencedDocumentCommercialCodes,
    referencedSpecialtyCodes,
    dependencyIntentTemplates: dependencyIntentResolution.intents,
    dependencyIntentAudit: dependencyIntentResolution.audit,
    dependencyIntentAuditSummary: dependencyIntentResolution.summary,
    acceptanceLinkRule: readRecord(metadata.acceptanceLinkRule),
    isAcceptanceMilestone: Boolean(metadata.isAcceptanceMilestone),
    preconditionTemplates,
    acceptanceCheckpoints,
    processConstraintRules,
    historyFeedbackPolicy: Object.keys(historyFeedbackPolicy).length > 0
      ? historyFeedbackPolicy
      : {
        mode: 'candidate_only',
        target: 'duration_dependency_and_process_pack_candidates',
        directSeedMutation: false,
      },
    resourceProfile: readRecord(metadata.resourceProfile),
    floorRhythm: durationSuggestion?.floorRhythmAdjustment ?? null,
    durationSuggestion: buildGeneratedDurationSuggestionValue(durationSuggestion, durationContributionMode),
  }
}

function shouldMarkGeneratedRowAsMilestone(
  node: TemplateNode,
  standardTaskMetadata: ReturnType<typeof buildGeneratedStandardTaskMetadata>,
) {
  if (node.defaultMilestone) return true
  return standardTaskMetadata.planItemKind === 'milestone'
    || standardTaskMetadata.planItemKind === 'linked_projection'
    || standardTaskMetadata.generationMode === 'read_only_milestone_projection'
    || standardTaskMetadata.milestoneSemanticRole !== ''
}

function normalizeInternalFlowRelationKind(value: unknown): InternalFlowRelationKind {
  const kind = normalizeText(value)
  if (kind === 'hard_sequence' || kind === 'acceptance_gate' || kind === 'parallel_allowed') return kind
  return 'soft_sequence'
}

function normalizeInternalFlowRelationRole(value: unknown, kind: InternalFlowRelationKind): V1475DependencyIntentTemplate['relationRole'] {
  const role = normalizeText(value) as V1475DependencyIntentTemplate['relationRole']
  if (role === 'workflow' || role === 'inspection') return role
  return kind === 'acceptance_gate' ? 'inspection' : 'workflow'
}

function normalizeInternalFlowStrength(value: unknown, createsDependency: boolean): V1475DependencyIntentTemplate['strength'] {
  const strength = normalizeText(value) as V1475DependencyIntentTemplate['strength']
  if (strength === 'hard' || strength === 'recommended' || strength === 'candidate') return strength
  return createsDependency ? 'recommended' : 'candidate'
}

function buildInternalFlowRuntimePolicy(relation: InternalFlowRelation) {
  if (relation.createsDependency) {
    return {
      runtimeDependency: relation.kind === 'acceptance_gate' ? 'gate_dependency' : 'strong_dependency',
      initialScheduling: 'dependency_edge',
      readinessBlocking: true,
      criticalPathEligible: true,
      manualPromotionRequired: false,
      projectLearning: 'record_execution_evidence',
    }
  }

  if (relation.kind === 'soft_sequence') {
    return {
      runtimeDependency: 'none',
      initialScheduling: 'recommended_order',
      readinessBlocking: false,
      criticalPathEligible: false,
      manualPromotionRequired: true,
      projectLearning: 'increase_recommendation_weight_only',
    }
  }

  return {
    runtimeDependency: 'none',
    initialScheduling: relation.scheduleMode === 'parallel_with_previous' ? 'parallel_hint' : 'reference_only',
    readinessBlocking: false,
    criticalPathEligible: false,
    manualPromotionRequired: true,
    projectLearning: 'record_execution_evidence',
  }
}

function readInternalFlowConditions(value: unknown): InternalFlowCondition[] {
  return readArray(parseMaybeJson(value))
    .map((item) => {
      const record = readRecord(item)
      const values = readStringArray(record.values)
      return values.length > 0
        ? {
            field: normalizeId(record.field),
            operator: normalizeId(record.operator) || 'includes_any',
            values,
          }
        : null
    })
    .filter((item): item is InternalFlowCondition => Boolean(item))
}

function readInternalFlowEvidenceRefs(value: unknown): InternalFlowEvidenceRef[] {
  return readArray(parseMaybeJson(value))
    .map((item) => {
      const record = readRecord(item)
      const code = normalizeId(record.code)
      if (!code) return null
      return {
        code,
        level: normalizeId(record.level) || 'standard',
        ref: normalizeText(record.ref) || null,
        rationale: normalizeText(record.rationale) || null,
      }
    })
    .filter((item): item is InternalFlowEvidenceRef => Boolean(item))
}

function readInternalFlowConditionalEffects(value: unknown): InternalFlowConditionalEffect[] {
  return readArray(parseMaybeJson(value))
    .map((item) => {
      const record = readRecord(item)
      const when = readInternalFlowConditions(record.when)
      if (when.length === 0) return null
      const effect: InternalFlowConditionalEffect = {
        id: normalizeId(record.id),
        when,
        relationKind: normalizeInternalFlowRelationKind(record.relationKind ?? record.relation_kind),
        dependencyType: normalizeDependencyType(record.dependencyType ?? record.dependency_type),
        lagDays: Number(record.lagDays ?? record.lag_days ?? 0) || 0,
        relationRole: normalizeInternalFlowRelationRole(
          record.relationRole ?? record.relation_role,
          normalizeInternalFlowRelationKind(record.relationKind ?? record.relation_kind),
        ),
        strength: normalizeInternalFlowStrength(
          record.strength,
          normalizeInternalFlowRelationKind(record.relationKind ?? record.relation_kind) === 'hard_sequence'
            || normalizeInternalFlowRelationKind(record.relationKind ?? record.relation_kind) === 'acceptance_gate',
        ),
        reasonCode: normalizeText(record.reasonCode ?? record.reason_code) || null,
        curationBasis: normalizeText(record.curationBasis ?? record.curation_basis) || null,
        scheduleMode: normalizeId(record.scheduleMode ?? record.schedule_mode) === 'parallel_with_previous'
          ? 'parallel_with_previous'
          : 'sequential',
        requiresAllPreviousSiblings: record.requiresAllPreviousSiblings === true || record.requires_all_previous_siblings === true,
        evidenceCodes: readCodeArray(record.evidenceCodes ?? record.evidence_codes),
        evidenceRefs: readInternalFlowEvidenceRefs(record.evidenceRefs ?? record.evidence_refs),
      }
      return effect
    })
    .filter(Boolean) as InternalFlowConditionalEffect[]
}

function internalFlowConditionValues(condition: InternalFlowCondition, context: {
  featureProfile: EngineeringFeatureProfile
  predecessorName: string
  successorName: string
  elementVariant?: GeneratedElementVariant | null
}) {
  const field = normalizeId(condition.field)
  if (field === 'project_type_code') return [context.featureProfile.projectTypeCode].filter(Boolean) as string[]
  if (field === 'structure_type_code') return [context.featureProfile.structureTypeCode].filter(Boolean) as string[]
  if (field === 'method_variant_code') return context.featureProfile.methodVariantCodes
  if (field === 'element_variant_code') {
    return uniqueStringArray([
      ...context.featureProfile.elementVariantCodes,
      context.elementVariant?.code ?? '',
    ])
  }
  if (field === 'climate_signal' || field === 'monthly_climate_signal') return context.featureProfile.climateSignals
  if (field === 'weather_impact_band') return context.featureProfile.weatherImpactBands
  if (field === 'predecessor_name') return [context.predecessorName]
  if (field === 'successor_name') return [context.successorName]
  return []
}

function internalFlowConditionMatches(condition: InternalFlowCondition, context: {
  featureProfile: EngineeringFeatureProfile
  predecessorName: string
  successorName: string
  elementVariant?: GeneratedElementVariant | null
}) {
  const actualValues = internalFlowConditionValues(condition, context)
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean)
  const expectedValues = uniqueStringArray(condition.values ?? [])
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean)
  if (expectedValues.length === 0) return false
  const hasMatch = expectedValues.some((expected) => actualValues.includes(expected))
  return normalizeId(condition.operator) === 'excludes_any' ? !hasMatch : hasMatch
}

function applyInternalFlowConditionalEffects(
  relation: InternalFlowRelation,
  context: {
    featureProfile: EngineeringFeatureProfile
    predecessorName: string
    successorName: string
    elementVariant?: GeneratedElementVariant | null
  },
): InternalFlowRelation {
  const applied: string[] = []
  let current = { ...relation }
  for (const effect of relation.conditionalEffects ?? []) {
    const conditions = effect.when ?? []
    if (conditions.length === 0 || !conditions.every((condition) => internalFlowConditionMatches(condition, context))) continue
    const kind = normalizeInternalFlowRelationKind(effect.relationKind)
    const createsDependency = kind === 'hard_sequence' || kind === 'acceptance_gate'
    applied.push(normalizeId(effect.id) || `effect-${applied.length + 1}`)
    current = {
      ...current,
      kind,
      createsDependency,
      dependencyType: normalizeDependencyType(effect.dependencyType ?? current.dependencyType),
      lagDays: Number(effect.lagDays ?? current.lagDays ?? 0) || 0,
      relationRole: normalizeInternalFlowRelationRole(effect.relationRole ?? current.relationRole, kind),
      strength: normalizeInternalFlowStrength(effect.strength ?? current.strength, createsDependency),
      reasonCode: normalizeText(effect.reasonCode) || current.reasonCode,
      curationBasis: normalizeText(effect.curationBasis) || current.curationBasis,
      scheduleMode: normalizeId(effect.scheduleMode) === 'parallel_with_previous' ? 'parallel_with_previous' : 'sequential',
      requiresAllPreviousSiblings: effect.requiresAllPreviousSiblings ?? current.requiresAllPreviousSiblings,
      evidenceCodes: (effect.evidenceCodes?.length ? effect.evidenceCodes : current.evidenceCodes) ?? [],
      evidenceRefs: (effect.evidenceRefs?.length ? effect.evidenceRefs : current.evidenceRefs) ?? [],
    }
  }
  return applied.length > 0 ? { ...current, appliedConditionalEffectIds: applied } : current
}

function buildReferenceOnlyInternalFlowRelation(mode: DurationContributionMode): InternalFlowRelation {
  const label = describeDurationContributionMode(mode)
  return {
    kind: 'parallel_allowed',
    createsDependency: false,
    dependencyType: 'SS',
    lagDays: 0,
    relationRole: mode === 'record_only' ? 'evidence' : 'workflow',
    strength: 'candidate',
    reasonCode: 'DURATION_CONTRIBUTION_MODE_REFERENCE_ONLY',
    source: 'duration_contribution_mode',
    sourceVersion: 'v1.4.7.2',
    seedRuleId: null,
    ruleVersion: null,
    curationStatus: 'system_resolved',
    curationMethod: 'duration_contribution_mode_guard',
    curationBasis: `${label}，不作为同父级普通施工依赖链条的前置或后置。`,
    reviewNeeded: false,
    scheduleMode: 'parallel_with_previous',
    requiresAllPreviousSiblings: false,
    evidenceCodes: [],
    evidenceRefs: [],
    governancePriority: 'P2',
    applicableWhen: [],
    conditionalEffects: [],
    appliedConditionalEffectIds: [],
    generalizationHint: null,
    additionalPredecessorStableCodes: [],
  }
}

function buildOverviewItemWorkInternalFlowRelation(
  predecessorNode: TemplateNode,
  currentNode: TemplateNode,
): InternalFlowRelation {
  const predecessorCode = normalizeText(predecessorNode.stableCode).toUpperCase()
  const currentCode = normalizeText(currentNode.stableCode).toUpperCase()
  if (predecessorCode.startsWith('PFB-00') && currentCode.startsWith('PFB-00')) {
    return {
      kind: 'parallel_allowed',
      createsDependency: true,
      dependencyType: 'SS',
      lagDays: currentCode.startsWith('PFB-00-01-03') ? 7 : 0,
      relationRole: 'workflow',
      strength: 'recommended',
      reasonCode: 'PREFAB_FACTORY_ROLLING_SUPPLY_LANE',
      source: 'wbs_template_generation_service',
      sourceVersion: 'v1.4.22.1',
      seedRuleId: `overview-prefab-factory-rolling:${predecessorNode.stableCode}:${currentNode.stableCode}`,
      ruleVersion: 1,
      curationStatus: 'system_resolved',
      curationMethod: 'prefab_supply_chain_lane',
      curationBasis: 'PC factory detailing, production and delivery are rolling supply-chain lanes; overview generation must not queue the whole batch as FS or it will overextend site hoisting.',
      reviewNeeded: false,
      scheduleMode: 'parallel_with_previous',
      requiresAllPreviousSiblings: false,
      evidenceCodes: ['JGJ1', 'GB/T51231'],
      evidenceRefs: [],
      governancePriority: 'P1',
      applicableWhen: [],
      conditionalEffects: [],
      appliedConditionalEffectIds: [],
      generalizationHint: {
        status: 'semantic_rule',
        targetPattern: 'prefab_factory_supply_chain_rolling_release',
        promotionPriority: 'P1',
        reason: 'Factory full-batch completion is a supply-chain control lane, not the onsite critical path release gate.',
      },
      additionalPredecessorStableCodes: [],
    }
  }

  return {
    kind: 'hard_sequence',
    createsDependency: true,
    dependencyType: 'FS',
    lagDays: 0,
    relationRole: 'workflow',
    strength: 'recommended',
    reasonCode: 'OVERVIEW_ITEM_WORK_FRONTIER_SEQUENCE',
    source: 'wbs_template_generation_service',
    sourceVersion: 'v1.4.22.1',
    seedRuleId: `overview-item-work:${predecessorNode.stableCode}:${currentNode.stableCode}`,
    ruleVersion: 1,
    curationStatus: 'system_resolved',
    curationMethod: 'overview_item_work_frontier',
    curationBasis: 'At overview/itemPack depth, item_work rows carry the master plan. Adjacent duration-bearing item packs default to same-parent FS+0 execution sequence; non-duration control items stay out of the dependency chain.',
    reviewNeeded: false,
    scheduleMode: 'sequential',
    requiresAllPreviousSiblings: false,
    evidenceCodes: ['GB50300'],
    evidenceRefs: [],
    governancePriority: 'P2',
    applicableWhen: [],
    conditionalEffects: [],
    appliedConditionalEffectIds: [],
    generalizationHint: {
      status: 'semantic_rule',
      targetPattern: 'overview_item_work_duration_bearing_sequence',
      promotionPriority: 'P2',
      reason: 'Keep overview generation schedulable after process rows are collapsed under itemPack rows.',
    },
    additionalPredecessorStableCodes: [],
  }
}

function readInternalFlowRelationFromSeed(
  predecessorNode: TemplateNode,
  currentNode: TemplateNode,
  context?: {
    featureProfile: EngineeringFeatureProfile
    predecessorName: string
    successorName: string
    elementVariant?: GeneratedElementVariant | null
  },
): InternalFlowRelation {
  const legacyRule = readRecord(currentNode.metadata.internalFlowFromPrevious ?? currentNode.metadata.internal_flow_from_previous)
  const resolvedRule: StandardInternalFlowRule | Record<string, unknown> = (
    isBuiltInChinaTemplateId(currentNode.templateId) || Object.keys(legacyRule).length === 0
  )
    ? resolveStandardInternalFlowRule({
      catalogSource: currentNode.templateId === CHINA_GB55032_TEMPLATE_ID
        ? 'china_gb50300_template_catalog'
        : 'domain_wbs_template_catalog',
      predecessorStableCode: predecessorNode.stableCode,
      predecessorName: predecessorNode.name,
      successorStableCode: currentNode.stableCode,
      successorName: currentNode.name,
      successorCategoryType: currentNode.categoryType as ChinaTemplateCategoryType,
    })
    : legacyRule
  const rule = readRecord(resolvedRule)
  if (!Object.keys(rule).length) {
    return {
      kind: 'soft_sequence',
      createsDependency: false,
      dependencyType: 'SS',
      lagDays: 0,
      relationRole: 'workflow',
      strength: 'candidate',
      reasonCode: 'MISSING_INTERNAL_FLOW_RULE_SOFT_FALLBACK',
      source: null,
      sourceVersion: null,
      seedRuleId: null,
      ruleVersion: null,
      curationStatus: 'review_required',
      curationMethod: 'soft_fallback',
      curationBasis: 'The same-parent internal flow rule is not explicitly provided by the standard-work seed; no hard dependency is generated by default.',
      reviewNeeded: true,
      scheduleMode: 'sequential',
      requiresAllPreviousSiblings: false,
      evidenceCodes: [],
      evidenceRefs: [],
      governancePriority: 'P2',
      applicableWhen: [],
      conditionalEffects: [],
      appliedConditionalEffectIds: [],
      generalizationHint: null,
      additionalPredecessorStableCodes: [],
    }
  }
  const kind = normalizeInternalFlowRelationKind(rule.relationKind ?? rule.relation_kind)
  const createsDependency = typeof rule.createsDependency === 'boolean'
    ? rule.createsDependency
    : kind === 'hard_sequence' || kind === 'acceptance_gate'
  const relation: InternalFlowRelation = {
    kind,
    createsDependency,
    dependencyType: normalizeDependencyType(rule.dependencyType ?? rule.dependency_type),
    lagDays: Number(rule.lagDays ?? rule.lag_days ?? 0) || 0,
    relationRole: normalizeInternalFlowRelationRole(rule.relationRole ?? rule.relation_role, kind),
    strength: normalizeInternalFlowStrength(rule.strength, createsDependency),
    reasonCode: normalizeText(rule.reasonCode ?? rule.reason_code) || 'STANDARD_INTERNAL_FLOW_RULE',
    source: normalizeId(rule.source),
    sourceVersion: normalizeId(rule.sourceVersion ?? rule.source_version),
    seedRuleId: normalizeId(rule.seedRuleId ?? rule.seed_rule_id),
    ruleVersion: Number(rule.ruleVersion ?? rule.rule_version ?? 0) || null,
    curationStatus: normalizeId(rule.curationStatus ?? rule.curation_status),
    curationMethod: normalizeId(rule.curationMethod ?? rule.curation_method),
    curationBasis: normalizeText(rule.curationBasis ?? rule.curation_basis) || null,
    reviewNeeded: rule.reviewNeeded === true || rule.review_needed === true,
    scheduleMode: normalizeId(rule.scheduleMode ?? rule.schedule_mode) === 'parallel_with_previous'
      ? 'parallel_with_previous'
      : 'sequential',
    requiresAllPreviousSiblings: rule.requiresAllPreviousSiblings === true || rule.requires_all_previous_siblings === true,
    evidenceCodes: Array.isArray(rule.evidenceCodes)
      ? rule.evidenceCodes.map((code) => normalizeId(code)).filter(Boolean)
      : Array.isArray(rule.evidence_codes)
        ? rule.evidence_codes.map((code) => normalizeId(code)).filter(Boolean)
        : [],
    evidenceRefs: readInternalFlowEvidenceRefs(rule.evidenceRefs ?? rule.evidence_refs),
    governancePriority: normalizeId(rule.governancePriority ?? rule.governance_priority) === 'P0'
      ? 'P0'
      : normalizeId(rule.governancePriority ?? rule.governance_priority) === 'P1'
        ? 'P1'
        : 'P2',
    applicableWhen: readInternalFlowConditions(rule.applicableWhen ?? rule.applicable_when),
    conditionalEffects: readInternalFlowConditionalEffects(rule.conditionalEffects ?? rule.conditional_effects),
    appliedConditionalEffectIds: [],
    generalizationHint: Object.keys(readRecord(rule.generalizationHint ?? rule.generalization_hint)).length > 0
      ? readRecord(rule.generalizationHint ?? rule.generalization_hint)
      : null,
    additionalPredecessorStableCodes: readCodeArray(
      rule.additionalPredecessorStableCodes
        ?? rule.additional_predecessor_stable_codes,
    ),
  }
  if (!context) return relation
  if ((relation.applicableWhen ?? []).length > 0 && !relation.applicableWhen?.every((condition) => internalFlowConditionMatches(condition, context))) {
    return {
      ...relation,
      kind: 'soft_sequence',
      createsDependency: false,
      dependencyType: 'SS',
      relationRole: 'workflow',
      strength: 'candidate',
      reasonCode: 'STANDARD_INTERNAL_FLOW_CONDITION_NOT_MATCHED',
      scheduleMode: 'parallel_with_previous',
      requiresAllPreviousSiblings: false,
      additionalPredecessorStableCodes: [],
    }
  }
  return applyInternalFlowConditionalEffects(relation, context)
}

function scheduleNode(
  node: TemplateNode,
  cursorDate: string,
  generationDepth: WbsTemplateGenerationDepth,
  scopeIndex: number,
  suggestionByNodeKey: Map<string, GeneratedTemplateDurationSuggestion>,
  scope: WbsTemplateScope,
  elementVariant: GeneratedElementVariant | null = null,
): {
  start: string
  end: string
  next: string
  children: Map<string, { start: string; end: string }>
} {
  const children = new Map<string, { start: string; end: string }>()
  const includedChildren = getGeneratableChildren(node, generationDepth, scope)
  const childGenerationDepth = getChildGenerationDepth(node, generationDepth, scope)
  const ownDuration = readDurationDaysForNode(node, scopeIndex, suggestionByNodeKey, elementVariant, scope)
  if (includedChildren.length === 0) {
    const duration = ownDuration
    if (duration <= 0) return { start: cursorDate, end: cursorDate, next: cursorDate, children }
    const end = addDays(cursorDate, duration - 1)
    return { start: cursorDate, end, next: addDays(end, 1), children }
  }

  let next = cursorDate
  let start = cursorDate
  let end = cursorDate
  includedChildren.forEach((child, index) => {
    const variants = deriveElementVariantsForGeneration(child, scope)
    const variantList = variants.length > 0 ? variants : [elementVariant]
    variantList.forEach((childElementVariant, variantIndex) => {
      const rhythmWindow = getPackageChildRhythmWindow(scopeIndex, child, suggestionByNodeKey, childElementVariant)
      const childCursorDate = rhythmWindow ? addDays(cursorDate, rhythmWindow.startDay - 1) : next
      const childSchedule = scheduleNode(child, childCursorDate, childGenerationDepth, scopeIndex, suggestionByNodeKey, scope, childElementVariant)
      const childEnd = rhythmWindow ? addDays(cursorDate, rhythmWindow.endDay - 1) : childSchedule.end
      if (index === 0 && variantIndex === 0) start = childSchedule.start
      end = comparePlanDates(childEnd, end) > 0 ? childEnd : end
      next = rhythmWindow
        ? (comparePlanDates(next, addDays(end, 1)) > 0 ? next : addDays(end, 1))
        : childSchedule.next
      children.set(getScheduleChildKey(child, childElementVariant), { start: childSchedule.start, end: childEnd })
    })
  })
  if (ownDuration > 0 && isHardParentDurationBoundaryPolicy(inferParentDurationBoundaryPolicy(node))) {
    const ownEnd = addDays(cursorDate, ownDuration - 1)
    return {
      start: cursorDate,
      end: ownEnd,
      next: addDays(ownEnd, 1),
      children,
    }
  }
  return { start, end, next, children }
}

function getScheduleChildKey(node: TemplateNode, elementVariant?: GeneratedElementVariant | null) {
  return `${node.id}:${elementVariant?.code ?? 'base'}`
}

function buildGeneratedRowsForNode(params: {
  node: TemplateNode
  scope: WbsTemplateScope
  elementVariant?: GeneratedElementVariant | null
  parentClientRowId: string | null
  parentRowId: string | null
  attachUnderRowId: string | null
  batchId: string
  sortCursor: { value: number }
  startDate: string
  generationDepth: WbsTemplateGenerationDepth
  scopeIndex: number
  suggestionByNodeKey: Map<string, GeneratedTemplateDurationSuggestion>
  predecessorByParent: Map<string, PreviousInternalFlowSibling[]>
  rows: GeneratedTemplateRow[]
}) {
  if (!hasGeneratableRowsForNode(params.node, params.generationDepth, params.scope)) return
  const variants = !params.elementVariant ? deriveElementVariantsForGeneration(params.node, params.scope) : []
  if (variants.length > 0) {
    let nextStartDate = params.startDate
    variants.forEach((elementVariant) => {
      const variantSchedule = scheduleNode(
        params.node,
        nextStartDate,
        params.generationDepth,
        params.scopeIndex,
        params.suggestionByNodeKey,
        params.scope,
        elementVariant,
      )
      buildGeneratedRowsForNode({ ...params, elementVariant, startDate: variantSchedule.start })
      nextStartDate = variantSchedule.next
    })
    return
  }

  const elementVariant = params.elementVariant ?? null
  const featureProfile = buildEngineeringFeatureProfile(params.scope)
  const schedule = scheduleNode(
    params.node,
    params.startDate,
    params.generationDepth,
    params.scopeIndex,
    params.suggestionByNodeKey,
    params.scope,
    elementVariant,
  )
  const clientRowId = `${params.batchId}:${params.node.stableCode}${elementVariant ? `:el-${elementVariant.code}` : ''}:${params.sortCursor.value}`
  const sortOrder = params.sortCursor.value++
  const parentKey = params.parentClientRowId ?? params.parentRowId ?? 'root'
  const predecessorClientRowIds: string[] = []
  const predecessorDependencies: GeneratedTemplateDependency[] = []
  const durationSuggestion = withPlanReferenceDurationOutput(
    params.suggestionByNodeKey.get(getDurationSuggestionKey(params.scopeIndex, params.node, elementVariant)) ?? null,
  )
  const standardTaskMetadata = buildGeneratedStandardTaskMetadata(params.node, durationSuggestion, featureProfile, elementVariant, params.scope)
  const floorSequenceMetadata = buildFloorSequenceMetadata(params.scope)
  const floorSeriesMetadata = buildFloorSeriesMetadata(params.scope)
  const executionPhase = standardTaskMetadata.executionPhase
  const executionLane = standardTaskMetadata.executionLane
  const executionSortKey = ((EXECUTION_PHASE_ORDER[executionPhase] ?? 999) * 1_000_000) + sortOrder
  const workfaceId = buildWorkfaceId(params.scope)
  ;(standardTaskMetadata as Record<string, unknown>).executionSortKey = executionSortKey
  ;(standardTaskMetadata as Record<string, unknown>).workfaceId = workfaceId
  if (floorSequenceMetadata) {
    ;(standardTaskMetadata as Record<string, unknown>).floorSequence = floorSequenceMetadata
  }
  if (floorSeriesMetadata) {
    ;(standardTaskMetadata as Record<string, unknown>).floorSeries = floorSeriesMetadata
  }
  const preconditionTemplates = standardTaskMetadata.preconditionTemplates
  const acceptanceCheckpoints = standardTaskMetadata.acceptanceCheckpoints
  let rowStartDate = schedule.start
  let rowEndDate = schedule.end
  const packageChildRhythmWindow = readPackageChildRhythmWindowFromSuggestion(durationSuggestion)
  const hasPackageChildRhythmWindow = Boolean(packageChildRhythmWindow)
  if (hasPackageChildRhythmWindow) {
    ;(standardTaskMetadata as Record<string, unknown>).scheduleAuthorityPolicy = 'package_child_rhythm_window'
  }
  const baseTitle = params.node.categoryType === 'process'
    ? decorateTitleWithElementVariant(params.node.name, elementVariant)
    : params.node.name
  const title = floorSequenceMetadata?.objectBinding === 'inferred_sequence_only' && floorSequenceMetadata.label
    ? `${floorSequenceMetadata.label} ${baseTitle}`
    : baseTitle
  const standardWorkName = params.node.categoryType === 'process'
    ? decorateTitleWithElementVariant(params.node.standardWorkName ?? params.node.name, elementVariant)
    : params.node.standardWorkName
  const appliesSiblingInternalFlow = params.node.categoryType === 'process'
    || params.node.categoryType === 'activity_step'
    || (params.node.categoryType === 'item_work' && params.generationDepth === 'item_work')
  if (appliesSiblingInternalFlow) {
    const previousSiblings = params.predecessorByParent.get(parentKey) ?? []
    const previousAnySibling = previousSiblings[previousSiblings.length - 1]
    const durationContributionMode = standardTaskMetadata.durationContributionMode as DurationContributionMode
    const isDurationBearing = isDurationBearingContributionMode(durationContributionMode)
    const currentIsInternalFlowAnchor = isInternalFlowAnchorMode(durationContributionMode)
    if (!isDurationBearing && !hasPackageChildRhythmWindow) {
      rowStartDate = previousAnySibling?.endDate ?? schedule.start
      rowEndDate = rowStartDate
    }
    const previousAnchorSiblings = previousSiblings.filter((sibling) => isInternalFlowAnchorMode(sibling.durationContributionMode))
    let previousSibling = previousAnchorSiblings[previousAnchorSiblings.length - 1]
    const skippedSiblingClientRowIds = previousSiblings
      .filter((sibling) => !isInternalFlowAnchorMode(sibling.durationContributionMode))
      .map((sibling) => sibling.clientRowId)
    if (!currentIsInternalFlowAnchor) {
      const internalFlowRelation = buildReferenceOnlyInternalFlowRelation(durationContributionMode)
      ;(standardTaskMetadata as any).internalFlow = {
        source: 'v1.4.7.2_internal_flow',
        sourceType: 'sibling_sequence',
        scope: 'same_parent',
        ruleSource: internalFlowRelation.source,
        ruleSourceVersion: internalFlowRelation.sourceVersion,
        seedRuleId: internalFlowRelation.seedRuleId,
        ruleVersion: internalFlowRelation.ruleVersion,
        curationStatus: internalFlowRelation.curationStatus,
        curationMethod: internalFlowRelation.curationMethod,
        curationBasis: internalFlowRelation.curationBasis,
        reviewNeeded: internalFlowRelation.reviewNeeded,
        scheduleMode: internalFlowRelation.scheduleMode,
        requiresAllPreviousSiblings: internalFlowRelation.requiresAllPreviousSiblings,
        evidenceCodes: internalFlowRelation.evidenceCodes,
        evidenceRefs: internalFlowRelation.evidenceRefs,
        governancePriority: internalFlowRelation.governancePriority,
        applicableWhen: internalFlowRelation.applicableWhen,
        conditionalEffects: internalFlowRelation.conditionalEffects,
        appliedConditionalEffectIds: internalFlowRelation.appliedConditionalEffectIds,
        generalizationHint: internalFlowRelation.generalizationHint,
        relationKind: internalFlowRelation.kind,
        createsDependency: false,
        runtimePolicy: buildInternalFlowRuntimePolicy(internalFlowRelation),
        predecessorClientRowId: previousAnySibling?.clientRowId ?? null,
        predecessorClientRowIds: [],
        predecessorStableCode: previousAnySibling?.node.stableCode ?? null,
        predecessorStableCodes: [],
        predecessorName: previousAnySibling?.node.name ?? null,
        predecessorNames: [],
        successorStableCode: params.node.stableCode,
        successorName: params.node.name,
        dependencyType: internalFlowRelation.dependencyType,
        lagDays: internalFlowRelation.lagDays,
        relationRole: internalFlowRelation.relationRole,
        strength: internalFlowRelation.strength,
        reasonCode: internalFlowRelation.reasonCode,
        durationContributionMode,
        durationContributionModePolicy: 'reference_only_not_sibling_dependency',
      }
    } else if (previousSibling) {
      let internalFlowRelation = readInternalFlowRelationFromSeed(previousSibling.node, params.node, {
        featureProfile,
        predecessorName: previousSibling.node.name,
        successorName: params.node.name,
        elementVariant,
      })
      if (params.node.categoryType === 'item_work' && internalFlowRelation.reviewNeeded) {
        internalFlowRelation = buildOverviewItemWorkInternalFlowRelation(previousSibling.node, params.node)
      }
      if (internalFlowRelation.reviewNeeded) {
        for (const candidateSibling of [...previousSiblings].reverse()) {
          if (candidateSibling.clientRowId === previousSibling.clientRowId) continue
          const candidateRelation = readInternalFlowRelationFromSeed(candidateSibling.node, params.node, {
            featureProfile,
            predecessorName: candidateSibling.node.name,
            successorName: params.node.name,
            elementVariant,
          })
          const resolvedCandidateRelation = params.node.categoryType === 'item_work' && candidateRelation.reviewNeeded
            ? buildOverviewItemWorkInternalFlowRelation(candidateSibling.node, params.node)
            : candidateRelation
          if (!resolvedCandidateRelation.reviewNeeded && resolvedCandidateRelation.createsDependency) {
            previousSibling = candidateSibling
            internalFlowRelation = resolvedCandidateRelation
            break
          }
        }
      }
      const additionalPredecessorStableCodes = new Set(
        uniqueStringArray(internalFlowRelation.additionalPredecessorStableCodes ?? [])
          .map((code) => normalizeText(code).toLowerCase()),
      )
      const explicitDependencySiblings = previousSiblings.filter((sibling) => (
        additionalPredecessorStableCodes.has(normalizeText(sibling.node.stableCode).toLowerCase())
      ))
      const baseDependencySiblings = internalFlowRelation.requiresAllPreviousSiblings ? previousAnchorSiblings : [previousSibling]
      const hasExplicitDependencySiblings = explicitDependencySiblings.length > 0
      const dependencySiblings = [...baseDependencySiblings, ...explicitDependencySiblings]
        .filter((sibling, index, siblings) => (
          siblings.findIndex((candidate) => candidate.clientRowId === sibling.clientRowId) === index
        ))
      if (internalFlowRelation.scheduleMode === 'parallel_with_previous' && !hasPackageChildRhythmWindow) {
        const durationDays = daysInclusive(schedule.start, schedule.end)
        rowStartDate = previousSibling.startDate
        rowEndDate = addDays(rowStartDate, durationDays - 1)
      }
      ;(standardTaskMetadata as any).internalFlow = {
        source: 'v1.4.7.2_internal_flow',
        sourceType: 'sibling_sequence',
        scope: 'same_parent',
        ruleSource: internalFlowRelation.source,
        ruleSourceVersion: internalFlowRelation.sourceVersion,
        seedRuleId: internalFlowRelation.seedRuleId,
        ruleVersion: internalFlowRelation.ruleVersion,
        curationStatus: internalFlowRelation.curationStatus,
        curationMethod: internalFlowRelation.curationMethod,
        curationBasis: internalFlowRelation.curationBasis,
        reviewNeeded: internalFlowRelation.reviewNeeded,
        scheduleMode: internalFlowRelation.scheduleMode,
        requiresAllPreviousSiblings: internalFlowRelation.requiresAllPreviousSiblings,
        usesExplicitNonAnchorPredecessorStableCodes: hasExplicitDependencySiblings,
        additionalPredecessorStableCodes: [...additionalPredecessorStableCodes],
        additionalPredecessorClientRowIds: explicitDependencySiblings.map((sibling) => sibling.clientRowId),
        evidenceCodes: internalFlowRelation.evidenceCodes,
        evidenceRefs: internalFlowRelation.evidenceRefs,
        governancePriority: internalFlowRelation.governancePriority,
        applicableWhen: internalFlowRelation.applicableWhen,
        conditionalEffects: internalFlowRelation.conditionalEffects,
        appliedConditionalEffectIds: internalFlowRelation.appliedConditionalEffectIds,
        generalizationHint: internalFlowRelation.generalizationHint,
        relationKind: internalFlowRelation.kind,
        createsDependency: internalFlowRelation.createsDependency,
        runtimePolicy: buildInternalFlowRuntimePolicy(internalFlowRelation),
        predecessorClientRowId: previousSibling.clientRowId,
        predecessorClientRowIds: dependencySiblings.map((sibling) => sibling.clientRowId),
        predecessorStableCode: previousSibling.node.stableCode,
        predecessorStableCodes: dependencySiblings.map((sibling) => sibling.node.stableCode),
        predecessorName: previousSibling.node.name,
        predecessorNames: dependencySiblings.map((sibling) => sibling.node.name),
        skippedSiblingClientRowIds,
        successorStableCode: params.node.stableCode,
        successorName: params.node.name,
        dependencyType: internalFlowRelation.dependencyType,
        lagDays: internalFlowRelation.lagDays,
        relationRole: internalFlowRelation.relationRole,
        strength: internalFlowRelation.strength,
        reasonCode: internalFlowRelation.reasonCode,
        predecessorDurationContributionMode: previousSibling.durationContributionMode,
        successorDurationContributionMode: durationContributionMode,
        durationContributionModePolicy: params.node.categoryType === 'item_work'
          ? 'overview_item_work_dependencies_use_duration_bearing_gate_or_handover_anchors'
          : hasPackageChildRhythmWindow
            ? 'package_child_rhythm_window_dates_are_authoritative_dependencies_are_metadata_only'
            : hasExplicitDependencySiblings
              ? 'curated_explicit_stable_code_predecessors_may_reference_non_duration_evidence'
              : 'dependencies_use_duration_bearing_gate_or_handover_anchors',
        scheduleAuthorityPolicy: hasPackageChildRhythmWindow ? 'package_child_rhythm_window' : 'internal_flow_relation',
      }
      if (internalFlowRelation.createsDependency) {
        dependencySiblings.forEach((sibling) => {
          if (!predecessorClientRowIds.includes(sibling.clientRowId)) predecessorClientRowIds.push(sibling.clientRowId)
          predecessorDependencies.push({
            clientRowId: sibling.clientRowId,
            dependencyType: internalFlowRelation.dependencyType,
            lagDays: internalFlowRelation.lagDays,
            intentCode: null,
            relationRole: internalFlowRelation.relationRole,
            strength: internalFlowRelation.strength,
            source: 'sibling_sequence',
          })
        })
      }
    }
    params.predecessorByParent.set(parentKey, [
      ...previousSiblings,
      { clientRowId, node: params.node, startDate: rowStartDate, endDate: rowEndDate, durationContributionMode },
    ])
  }
  const isMilestone = shouldMarkGeneratedRowAsMilestone(params.node, standardTaskMetadata)

  params.rows.push({
    clientRowId,
    parentClientRowId: params.parentClientRowId,
    parentRowId: params.parentClientRowId ? null : params.parentRowId,
    sortOrder,
    predecessorClientRowIds,
    predecessorDependencies,
    rowProjectionMode: standardTaskMetadata.rowProjectionMode,
    executionPhase,
    executionLane,
    executionSortKey,
    workfaceId,
    planItemKind: standardTaskMetadata.planItemKind,
    planItemTags: standardTaskMetadata.planItemTags,
    progressMode: standardTaskMetadata.progressMode,
    scheduleParticipation: standardTaskMetadata.scheduleParticipation,
    scopeExpansionMode: standardTaskMetadata.scopeExpansionMode,
    executionNature: standardTaskMetadata.executionNature,
    qualityControlRole: standardTaskMetadata.qualityControlRole,
    safetyControlRole: standardTaskMetadata.safetyControlRole,
    inspectionAcceptanceRole: standardTaskMetadata.inspectionAcceptanceRole,
    documentEvidenceRole: standardTaskMetadata.documentEvidenceRole,
    commercialControlRole: standardTaskMetadata.commercialControlRole,
    managementControlRole: standardTaskMetadata.managementControlRole,
    linkedProjectionSource: Object.keys(standardTaskMetadata.linkedProjectionSource).length > 0
      ? standardTaskMetadata.linkedProjectionSource
      : null,
    durationSuggestion,
    values: {
      title,
      planned_start_date: rowStartDate,
      planned_end_date: rowEndDate,
      start_date: rowStartDate,
      end_date: rowEndDate,
      progress: 0,
      status: 'todo',
      priority: 'medium',
      is_milestone: isMilestone,
      milestone_level: isMilestone ? 3 : null,
      is_wbs_summary: !['process', 'activity_step'].includes(params.node.categoryType),
      is_executable: ['process', 'activity_step'].includes(params.node.categoryType),
      wbs_node_type: params.node.categoryType,
      category_type: params.node.categoryType,
      template_id: params.node.templateId,
      template_node_id: params.node.id,
      source_template_id: params.node.templateId,
      source_template_node_id: params.node.id,
      template_group: standardTaskMetadata.templateGroup,
      pack_type: standardTaskMetadata.packType,
      generation_policy: standardTaskMetadata.generationPolicy,
      generation_batch_id: (params as any).generationBatchId ?? null,
      scope_index: params.scopeIndex,
      standard_work_code: params.node.standardWorkCode,
      standard_work_name: standardWorkName,
      engineering_category_id: params.node.engineeringCategoryId,
      project_type_code: featureProfile.projectTypeCode,
      structure_type_code: featureProfile.structureTypeCode,
      method_variant_codes: featureProfile.methodVariantCodes,
      element_variant_code: elementVariant?.code ?? null,
      element_variant_name: elementVariant?.label ?? null,
      element_variant_source: elementVariant?.source ?? null,
      element_variant_confidence: elementVariant?.confidence ?? null,
      smart_reference_days: isDurationBearingContributionMode(standardTaskMetadata.durationContributionMode)
        ? readWritablePlanTaskDurationDays(durationSuggestion)
        : null,
      duration_calibration_source: durationSuggestion?.durationCalibrationSource ?? 'unavailable',
      duration_provenance: durationSuggestion?.durationProvenance ?? 'unavailable',
      duration_contribution_mode: standardTaskMetadata.durationContributionMode,
      row_projection_mode: standardTaskMetadata.rowProjectionMode,
      execution_phase: executionPhase,
      execution_lane: executionLane,
      execution_sort_key: executionSortKey,
      workface_id: workfaceId,
      duration_suggestion: standardTaskMetadata.durationSuggestion,
      package_child_rhythm_window_start_day: durationSuggestion?.packageChildRhythmWindowStartDay ?? null,
      package_child_rhythm_window_end_day: durationSuggestion?.packageChildRhythmWindowEndDay ?? null,
      package_child_rhythm_window_role: durationSuggestion?.packageChildRhythmWindowRole ?? null,
      execution_nature: standardTaskMetadata.executionNature,
      quality_control_role: standardTaskMetadata.qualityControlRole,
      safety_control_role: standardTaskMetadata.safetyControlRole,
      inspection_acceptance_role: standardTaskMetadata.inspectionAcceptanceRole,
      document_evidence_role: standardTaskMetadata.documentEvidenceRole,
      commercial_control_role: standardTaskMetadata.commercialControlRole,
      management_control_role: standardTaskMetadata.managementControlRole,
      precondition_templates: preconditionTemplates,
      acceptance_checkpoints: acceptanceCheckpoints,
      standard_task_metadata: standardTaskMetadata,
      material_required: preconditionTemplates.includes('material_accepted'),
      acceptance_required: acceptanceCheckpoints.length > 2,
      source_type: 'template',
      ...pickPersistableScopeValues(params.scope),
    },
  })

  const childGenerationDepth = getChildGenerationDepth(params.node, params.generationDepth, params.scope)
  for (const child of getGeneratableChildren(params.node, params.generationDepth, params.scope)) {
    const childVariants = deriveElementVariantsForGeneration(child, params.scope)
    if (childVariants.length > 0) {
      childVariants.forEach((childElementVariant) => {
        buildGeneratedRowsForNode({
          ...params,
          node: child,
          generationDepth: childGenerationDepth,
          parentClientRowId: clientRowId,
          parentRowId: null,
          elementVariant: childElementVariant,
          startDate: schedule.children.get(getScheduleChildKey(child, childElementVariant))?.start ?? schedule.start,
        })
      })
      continue
    }
    const inheritedElementVariant = params.node.categoryType === 'process' ? elementVariant : undefined
    buildGeneratedRowsForNode({
      ...params,
      node: child,
      generationDepth: childGenerationDepth,
      parentClientRowId: clientRowId,
      parentRowId: null,
      elementVariant: inheritedElementVariant,
      startDate: schedule.children.get(getScheduleChildKey(child, inheritedElementVariant ?? null))?.start
        ?? schedule.children.get(getScheduleChildKey(child, null))?.start
        ?? schedule.start,
    })
  }
}

const DEPENDENCY_SCOPE_FIELDS = [
  'phase_object_id',
  'section_object_id',
  'building_object_id',
  'floor_object_id',
  'physical_zone_object_id',
]

type DependencyScopeRule = V1475CrossItemWorkflowRule['scopeRule'] | V1475DependencyIntentTemplate['scopeRule']

function readRowMetadata(row: GeneratedTemplateRow) {
  return readRecord(row.values.standard_task_metadata)
}

function readRowPackType(row: GeneratedTemplateRow): WbsTemplatePackType {
  return (normalizeId(row.values.pack_type) || normalizeId(readRowMetadata(row).packType) || 'core_quality') as WbsTemplatePackType
}

function readRowStableCode(row: GeneratedTemplateRow) {
  const metadata = readRowMetadata(row)
  return normalizeText(metadata.stableCode ?? metadata.standardWorkCode ?? row.values.standard_work_code ?? row.values.template_node_id)
}

function readRowCategoryType(row: GeneratedTemplateRow) {
  return normalizeText(row.values.category_type ?? row.values.wbs_node_type)
}

type RuntimeScopeAssignmentRule = {
  itemPackPattern: string
  effect: string
  functionalAreaCategory?: string
  matchFunctionalUsage?: string
  targetObjectType?: string
  target_object_type?: string
  matchMetadata?: Record<string, unknown>
  match_metadata?: Record<string, unknown>
  matchObjectName?: string
  match_object_name?: string
  priority: number
}

type RuntimeScopeAssignmentRulesInput = RuntimeScopeAssignmentRule[] | null | undefined

type RuntimeScopeObject = {
  id: string
  type: string
  name: string
  parentId: string | null
  metadata: Record<string, unknown>
}

function readRuntimeScopeObjects(operation: PlanningTableOperation): RuntimeScopeObject[] {
  const scope = readRecord(operation.scope)
  return readArray(scope.scope_objects ?? scope.scopeObjects)
    .map((item) => {
      const record = readRecord(item)
      const id = normalizeText(record.id ?? record.objectId ?? record.object_id)
      const type = normalizeId(record.type ?? record.objectType ?? record.object_type)
      const name = normalizeText(record.name ?? record.objectName ?? record.object_name)
      if (!id || !type) return null
      return {
        id,
        type,
        name,
        parentId: normalizeText(record.parentId ?? record.parent_id) || null,
        metadata: readRecord(record.metadata),
      }
    })
    .filter((item): item is RuntimeScopeObject => Boolean(item))
}

function textMatchesRulePattern(value: unknown, pattern: string) {
  const normalizedValue = normalizeText(value)
  const normalizedPattern = normalizeText(pattern)
  if (!normalizedValue || !normalizedPattern) return false
  if (normalizedPattern === '.*' || normalizedPattern === '*') return true
  if (
    normalizedValue === normalizedPattern
    || normalizedValue.startsWith(normalizedPattern)
    || normalizedValue.includes(normalizedPattern)
  ) {
    return true
  }
  try {
    return new RegExp(normalizedPattern, 'i').test(normalizedValue)
  } catch {
    return false
  }
}

function rowMatchesScopeAssignmentRule(row: GeneratedTemplateRow, rule: RuntimeScopeAssignmentRule) {
  const metadata = readRowMetadata(row)
  const candidates = [
    readRowStableCode(row),
    row.values.standard_work_code,
    row.values.template_node_id,
    row.values.item_pack_code,
    row.values.itemPackCode,
    metadata.stableCode,
    metadata.standardWorkCode,
    metadata.itemPackCode,
    row.values.title,
    row.values.name,
  ]
  return candidates.some((candidate) => textMatchesRulePattern(candidate, rule.itemPackPattern))
}

function metadataValueMatches(value: unknown, expected: unknown) {
  const normalizedValue = normalizeText(value)
  const normalizedExpected = normalizeText(expected)
  if (!normalizedValue || !normalizedExpected) return false
  return normalizedValue === normalizedExpected
    || normalizeId(normalizedValue) === normalizeId(normalizedExpected)
    || normalizedValue.includes(normalizedExpected)
    || normalizedExpected.includes(normalizedValue)
}

function findScopeObjectByMetadata(
  objects: RuntimeScopeObject[],
  type: string,
  metadataKeys: string[],
  expected: unknown,
) {
  return objects.find((object) => (
    object.type === type
    && metadataKeys.some((key) => metadataValueMatches(object.metadata[key], expected))
  )) ?? null
}

function scopeObjectMatchesMetadata(object: RuntimeScopeObject, matchMetadata: Record<string, unknown>) {
  const entries = Object.entries(matchMetadata).filter(([, expected]) => normalizeText(expected))
  if (entries.length === 0) return true
  return entries.every(([key, expected]) => metadataValueMatches(object.metadata[key], expected))
}

function findScopeObjectsByRule(objects: RuntimeScopeObject[], rule: RuntimeScopeAssignmentRule) {
  const targetType = normalizeId(rule.targetObjectType ?? rule.target_object_type)
  if (!targetType) return []

  const matchMetadata = readRecord(rule.matchMetadata ?? rule.match_metadata)
  const matchObjectName = normalizeText(rule.matchObjectName ?? rule.match_object_name)
  const candidates = objects.filter((object) => object.type === targetType)
  return candidates.filter((object) => (
    (!matchObjectName || metadataValueMatches(object.name, matchObjectName))
    && scopeObjectMatchesMetadata(object, matchMetadata)
  ))
}

function clearScopeObjectFields(row: GeneratedTemplateRow) {
  for (const field of Object.values(SCOPE_OBJECT_FIELD_BY_TYPE)) {
    row.values[field] = null
  }
}

function applyRuntimeScopeObjectLineageToRow(
  row: GeneratedTemplateRow,
  object: RuntimeScopeObject,
  scopeObjects: RuntimeScopeObject[],
) {
  const byId = new Map(scopeObjects.map((scopeObject) => [scopeObject.id, scopeObject]))
  let current: RuntimeScopeObject | undefined = object
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    const field = SCOPE_OBJECT_FIELD_BY_TYPE[current.type]
    if (field) row.values[field] = current.id
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
}

function assignScopeObjectToRow(
  row: GeneratedTemplateRow,
  object: RuntimeScopeObject,
  rule: RuntimeScopeAssignmentRule,
  scopeObjects: RuntimeScopeObject[],
) {
  const targetField = SCOPE_OBJECT_FIELD_BY_TYPE[object.type]
  if (!targetField) return
  clearScopeObjectFields(row)
  applyRuntimeScopeObjectLineageToRow(row, object, scopeObjects)
  row.values.scope_assignment_rule = rule.itemPackPattern
}

function buildRuntimeScopeAssignmentRuleKey(rule: RuntimeScopeAssignmentRule) {
  return [
    rule.itemPackPattern,
    rule.effect,
    rule.targetObjectType ?? rule.target_object_type ?? '',
    JSON.stringify(rule.matchMetadata ?? rule.match_metadata ?? {}),
    rule.matchObjectName ?? rule.match_object_name ?? '',
  ].join('|')
}

function buildScopeCloneClientRowId(clientRowId: string, object: RuntimeScopeObject, targetIndex: number) {
  const suffix = normalizeId(object.id).replace(/[^a-z0-9_-]/gi, '_') || `target_${targetIndex + 1}`
  return `${clientRowId}:scope-${suffix}`
}

function expandRowsAcrossScopeObjects(
  rows: GeneratedTemplateRow[],
  rule: RuntimeScopeAssignmentRule,
  objects: RuntimeScopeObject[],
  allScopeObjects: RuntimeScopeObject[],
) {
  if (objects.length <= 1) return rows

  const matchedRows = rows.filter((row) => rowMatchesScopeAssignmentRule(row, rule))
  if (matchedRows.length === 0) return rows

  const matchedIds = new Set(matchedRows.map((row) => row.clientRowId))
  for (const row of matchedRows) assignScopeObjectToRow(row, objects[0], rule, allScopeObjects)

  const clones: GeneratedTemplateRow[] = []
  for (const [targetIndex, object] of objects.slice(1).entries()) {
    const idMap = new Map<string, string>()
    for (const row of matchedRows) {
      idMap.set(row.clientRowId, buildScopeCloneClientRowId(row.clientRowId, object, targetIndex + 1))
    }

    for (const row of matchedRows) {
      const clone: GeneratedTemplateRow = {
        ...row,
        clientRowId: idMap.get(row.clientRowId) ?? row.clientRowId,
        parentClientRowId: row.parentClientRowId && matchedIds.has(row.parentClientRowId)
          ? idMap.get(row.parentClientRowId) ?? row.parentClientRowId
          : row.parentClientRowId,
        values: { ...row.values },
        predecessorClientRowIds: row.predecessorClientRowIds.map((id) => idMap.get(id) ?? id),
        predecessorDependencies: row.predecessorDependencies.map((dependency) => ({
          ...dependency,
          clientRowId: idMap.get(dependency.clientRowId) ?? dependency.clientRowId,
        })),
        planItemTags: row.planItemTags ? [...row.planItemTags] : row.planItemTags,
        linkedProjectionSource: row.linkedProjectionSource ? { ...row.linkedProjectionSource } : row.linkedProjectionSource,
        durationSuggestion: row.durationSuggestion ? { ...row.durationSuggestion } : row.durationSuggestion,
      }
      assignScopeObjectToRow(clone, object, rule, allScopeObjects)
      clones.push(clone)
    }
  }

  return [...rows, ...clones]
}

type ScopeAssignmentTarget = {
  rule: RuntimeScopeAssignmentRule
  object: RuntimeScopeObject
}

function buildScopeAssignmentExpansionGroupKey(rule: RuntimeScopeAssignmentRule) {
  return [
    normalizeText(rule.itemPackPattern),
    normalizeId(rule.targetObjectType ?? rule.target_object_type),
  ].join('|')
}

function collectScopeAssignmentExpansionGroups(
  rules: RuntimeScopeAssignmentRule[],
  scopeObjects: RuntimeScopeObject[],
) {
  const groups = new Map<string, ScopeAssignmentTarget[]>()

  for (const rule of rules) {
    if (rule.effect !== 'assign_to_scope_object') continue
    const matchedObjects = findScopeObjectsByRule(scopeObjects, rule)
    if (matchedObjects.length === 0) continue

    const key = buildScopeAssignmentExpansionGroupKey(rule)
    const group = groups.get(key) ?? []
    for (const object of matchedObjects) {
      if (group.some((target) => target.object.id === object.id)) continue
      group.push({ rule, object })
    }
    groups.set(key, group)
  }

  return [...groups.values()].filter((group) => group.length > 1)
}

function expandRowsAcrossScopeAssignmentTargets(
  rows: GeneratedTemplateRow[],
  targets: ScopeAssignmentTarget[],
  allScopeObjects: RuntimeScopeObject[],
) {
  if (targets.length <= 1) return rows

  const matchedRows = rows.filter((row) => targets.some((target) => rowMatchesScopeAssignmentRule(row, target.rule)))
  if (matchedRows.length === 0) return rows

  const matchedIds = new Set(matchedRows.map((row) => row.clientRowId))
  const [firstTarget, ...cloneTargets] = targets
  for (const row of matchedRows) assignScopeObjectToRow(row, firstTarget.object, firstTarget.rule, allScopeObjects)

  const clones: GeneratedTemplateRow[] = []
  for (const [targetIndex, target] of cloneTargets.entries()) {
    const idMap = new Map<string, string>()
    for (const row of matchedRows) {
      idMap.set(row.clientRowId, buildScopeCloneClientRowId(row.clientRowId, target.object, targetIndex + 1))
    }

    for (const row of matchedRows) {
      const clone: GeneratedTemplateRow = {
        ...row,
        clientRowId: idMap.get(row.clientRowId) ?? row.clientRowId,
        parentClientRowId: row.parentClientRowId && matchedIds.has(row.parentClientRowId)
          ? idMap.get(row.parentClientRowId) ?? row.parentClientRowId
          : row.parentClientRowId,
        values: { ...row.values },
        predecessorClientRowIds: row.predecessorClientRowIds.map((id) => idMap.get(id) ?? id),
        predecessorDependencies: row.predecessorDependencies.map((dependency) => ({
          ...dependency,
          clientRowId: idMap.get(dependency.clientRowId) ?? dependency.clientRowId,
        })),
        planItemTags: row.planItemTags ? [...row.planItemTags] : row.planItemTags,
        linkedProjectionSource: row.linkedProjectionSource ? { ...row.linkedProjectionSource } : row.linkedProjectionSource,
        durationSuggestion: row.durationSuggestion ? { ...row.durationSuggestion } : row.durationSuggestion,
      }
      assignScopeObjectToRow(clone, target.object, target.rule, allScopeObjects)
      clones.push(clone)
    }
  }

  return [...rows, ...clones]
}

function applyScopeAssignmentRules(
  rows: GeneratedTemplateRow[],
  rulesInput: RuntimeScopeAssignmentRule[] | null | undefined,
  operation: PlanningTableOperation,
): GeneratedTemplateRow[] {
  const rules = readArray(rulesInput)
    .map((rule) => readRecord(rule) as RuntimeScopeAssignmentRule)
    .filter((rule) => normalizeText(rule.itemPackPattern) && normalizeText(rule.effect))
    .sort((left, right) => (Number(left.priority ?? 0) || 0) - (Number(right.priority ?? 0) || 0))
  if (rules.length === 0) return rows

  const scopeObjects = readRuntimeScopeObjects(operation)
  if (scopeObjects.length === 0) return rows

  let assignedRows = rows
  const expandedRuleKeys = new Set<string>()
  for (const targets of collectScopeAssignmentExpansionGroups(rules, scopeObjects)) {
    const beforeCount = assignedRows.length
    assignedRows = expandRowsAcrossScopeAssignmentTargets(assignedRows, targets, scopeObjects)
    if (assignedRows.length === beforeCount && !targets.some((target) => assignedRows.some((row) => rowMatchesScopeAssignmentRule(row, target.rule)))) {
      continue
    }
    for (const target of targets) expandedRuleKeys.add(buildRuntimeScopeAssignmentRuleKey(target.rule))
  }

  const firstBuilding = scopeObjects.find((object) => object.type === 'building') ?? null
  for (const row of assignedRows) {
    for (const rule of rules) {
      if (!rowMatchesScopeAssignmentRule(row, rule)) continue

      if (rule.effect === 'assign_to_matching_buildings' && rule.matchFunctionalUsage) {
        const matchedBuilding = findScopeObjectByMetadata(
          scopeObjects,
          'building',
          ['functionalUsage', 'functional_usage', 'usageCode', 'usage_code'],
          rule.matchFunctionalUsage,
        )
        if (matchedBuilding) {
          row.values.building_object_id = matchedBuilding.id
          row.values.scope_assignment_rule = rule.itemPackPattern
        }
      }

      if (rule.effect === 'assign_to_all_buildings' && firstBuilding && !row.values.building_object_id) {
        row.values.building_object_id = firstBuilding.id
        row.values.scope_assignment_rule = rule.itemPackPattern
      }

      if (rule.effect === 'assign_to_functional_area' && rule.functionalAreaCategory) {
        const matchedArea = findScopeObjectByMetadata(
          scopeObjects,
          'functional_area',
          ['functionalCategory', 'functional_category', 'category', 'specialRoomType', 'special_room_type'],
          rule.functionalAreaCategory,
        )
        if (matchedArea) {
          row.values.functional_area_object_id = matchedArea.id
          row.values.scope_assignment_rule = rule.itemPackPattern
        }
      }

      if (rule.effect === 'assign_to_scope_object') {
        if (expandedRuleKeys.has(buildRuntimeScopeAssignmentRuleKey(rule))) continue
        const matchedObject = findScopeObjectsByRule(scopeObjects, rule)[0] ?? null
        if (matchedObject) assignScopeObjectToRow(row, matchedObject, rule, scopeObjects)
      }
    }
  }

  return assignedRows
}

function normalizeRuntimeScopeAssignmentRules(rulesInput: RuntimeScopeAssignmentRule[] | null | undefined) {
  return readArray(rulesInput)
    .map((rule) => readRecord(rule) as RuntimeScopeAssignmentRule)
    .filter((rule) => normalizeText(rule.itemPackPattern) && normalizeText(rule.effect))
    .sort((left, right) => (Number(left.priority ?? 0) || 0) - (Number(right.priority ?? 0) || 0))
}

function readScopeAssignmentRulesFromOperation(operation: PlanningTableOperation): RuntimeScopeAssignmentRulesInput {
  const direct = readArray(operation.scopeAssignmentRules ?? operation.scope_assignment_rules)
  if (direct.length > 0) return direct as RuntimeScopeAssignmentRule[]

  const clientContext = readRecord(operation.clientContext ?? operation.client_context)
  const contextRules = readArray(clientContext.scopeAssignmentRules ?? clientContext.scope_assignment_rules)
  return contextRules.length > 0 ? contextRules as RuntimeScopeAssignmentRule[] : null
}

function getScopeAssignmentMissingObjectLabel(rule: RuntimeScopeAssignmentRule) {
  const effect = normalizeText(rule.effect)
  if (effect === 'assign_to_functional_area') return '功能区域'
  if (effect === 'assign_to_matching_buildings' || effect === 'assign_to_all_buildings') return '楼栋'

  const targetType = normalizeId(rule.targetObjectType ?? rule.target_object_type)
  const matchMetadata = readRecord(rule.matchMetadata ?? rule.match_metadata)
  const physicalSpaceKind = normalizeId(matchMetadata.physicalSpaceKind ?? matchMetadata.physical_space_kind)
  const physicalCategory = normalizeId(matchMetadata.physicalCategory ?? matchMetadata.physical_category)
  const floorUsage = normalizeId(matchMetadata.floorUsage ?? matchMetadata.floor_usage)

  if (targetType === 'basement') return '地下室'
  if (targetType === 'floor') {
    if (floorUsage === 'refuge') return '避难层'
    if (floorUsage === 'ground_pilotis') return '架空层'
    if (floorUsage === 'mechanical') return '设备层'
    if (floorUsage === 'transfer') return '转换层'
    return '特殊楼层'
  }
  if (targetType === 'physical_zone') {
    if (physicalSpaceKind === 'outdoor_site') return '室外总平'
    if (physicalSpaceKind === 'independent_engineering_zone') {
      const categoryLabel = normalizeText(matchMetadata.physicalCategoryLabel ?? matchMetadata.physical_category_label)
      if (categoryLabel) return categoryLabel
      const knownLabels: Record<string, string> = {
        switching_station: '开闭所',
        fire_pump_room: '消防泵房',
        heat_exchange_station: '换热站',
        waste_room: '垃圾房',
        liquid_oxygen_station: '液氧站',
        sewage_treatment_station: '污水处理站',
        medical_waste_holding: '医疗废物暂存间',
        hyperbaric_oxygen_chamber: '高压氧舱',
        substation: '变配电所',
        generator_yard: '柴油发电机区',
        cooling_plant: '冷站',
        transfer_passage: '换乘通道',
        traffic_connection_zone: '交通接驳区',
      }
      return knownLabels[physicalCategory] ?? '独立工程区'
    }
    return '工程区域'
  }
  if (targetType === 'functional_area') return '功能区域'
  return '对应空间'
}

function findRowsMatchingScopeAssignmentRule(rows: GeneratedTemplateRow[], rule: RuntimeScopeAssignmentRule) {
  return rows.filter((row) => rowMatchesScopeAssignmentRule(row, rule))
}

function collectScopeAssignmentMissingTargetWarnings(
  rows: GeneratedTemplateRow[],
  rulesInput: RuntimeScopeAssignmentRule[] | null | undefined,
  operation: PlanningTableOperation,
): GeneratedTemplateGovernanceWarning[] {
  const rules = normalizeRuntimeScopeAssignmentRules(rulesInput)
  if (rules.length === 0) return []

  const scopeObjects = readRuntimeScopeObjects(operation)
  const warnings: GeneratedTemplateGovernanceWarning[] = []
  const emitted = new Set<string>()

  for (const rule of rules) {
    const matchedRows = findRowsMatchingScopeAssignmentRule(rows, rule)
    if (matchedRows.length === 0) continue

    let targetObjects: RuntimeScopeObject[] = []
    const effect = normalizeText(rule.effect)
    if (effect === 'assign_to_scope_object') {
      targetObjects = findScopeObjectsByRule(scopeObjects, rule)
    } else if (effect === 'assign_to_functional_area' && rule.functionalAreaCategory) {
      const matchedArea = findScopeObjectByMetadata(
        scopeObjects,
        'functional_area',
        ['functionalCategory', 'functional_category', 'category', 'specialRoomType', 'special_room_type'],
        rule.functionalAreaCategory,
      )
      targetObjects = matchedArea ? [matchedArea] : []
    } else if (effect === 'assign_to_matching_buildings' && rule.matchFunctionalUsage) {
      const matchedBuilding = findScopeObjectByMetadata(
        scopeObjects,
        'building',
        ['functionalUsage', 'functional_usage', 'usageCode', 'usage_code'],
        rule.matchFunctionalUsage,
      )
      targetObjects = matchedBuilding ? [matchedBuilding] : []
    } else if (effect === 'assign_to_all_buildings') {
      targetObjects = scopeObjects.filter((object) => object.type === 'building')
    } else {
      continue
    }

    if (targetObjects.length > 0) continue

    const stableCodes = uniqueStringArray(matchedRows.map(readRowStableCode).filter(Boolean))
    const nodeCode = stableCodes[0] ?? normalizeText(rule.itemPackPattern)
    const targetObjectType = normalizeId(rule.targetObjectType ?? rule.target_object_type)
    const missingObjectLabel = getScopeAssignmentMissingObjectLabel(rule)
    const warningKey = [
      normalizeText(rule.itemPackPattern),
      effect,
      targetObjectType,
      JSON.stringify(rule.matchMetadata ?? rule.match_metadata ?? {}),
      normalizeText(rule.matchObjectName ?? rule.match_object_name),
      nodeCode,
    ].join('|')
    if (emitted.has(warningKey)) continue
    emitted.add(warningKey)

    warnings.push({
      code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
      severity: 'warning',
      nodeCode,
      message: `Template rows match ${rule.itemPackPattern}, but the project scope does not contain the required ${missingObjectLabel} object.`,
      details: {
        itemPackPattern: rule.itemPackPattern,
        effect,
        targetObjectType: targetObjectType || null,
        matchMetadata: readRecord(rule.matchMetadata ?? rule.match_metadata),
        matchObjectName: normalizeText(rule.matchObjectName ?? rule.match_object_name) || null,
        missingObjectLabel,
        matchedRowCount: matchedRows.length,
        matchedStableCodes: stableCodes,
      },
    })
  }

  return warnings
}

const SCOPE_OBJECT_FIELD_BY_TYPE: Record<string, string> = {
  phase: 'phase_object_id',
  section: 'section_object_id',
  building: 'building_object_id',
  basement: 'basement_object_id',
  floor: 'floor_object_id',
  physical_zone: 'physical_zone_object_id',
  functional_area: 'functional_area_object_id',
}

function applyScopeObjectLineage(rows: GeneratedTemplateRow[], operation: PlanningTableOperation) {
  const scopeObjects = readRuntimeScopeObjects(operation)
  if (scopeObjects.length === 0) return

  const byId = new Map(scopeObjects.map((object) => [object.id, object]))
  const anchorFields = [
    'functional_area_object_id',
    'physical_zone_object_id',
    'floor_object_id',
    'building_object_id',
    'basement_object_id',
    'section_object_id',
    'phase_object_id',
  ]

  for (const row of rows) {
    const anchorId = anchorFields.map((field) => normalizeText(row.values[field])).find(Boolean)
    if (!anchorId) continue

    let current = byId.get(anchorId)
    const visited = new Set<string>()
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      const field = SCOPE_OBJECT_FIELD_BY_TYPE[current.type]
      if (field && !row.values[field]) row.values[field] = current.id
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
  }
}

function rowIsSuppressedByCoreReplacement(row: GeneratedTemplateRow, replacementCodes: ReadonlySet<string>) {
  if (!replacementCodes.size || readRowPackType(row) !== 'core_quality') return false
  if (!['process', 'activity_step'].includes(readRowCategoryType(row))) return false
  const stableCode = readRowStableCode(row)
  return [...replacementCodes].some((code) => codeMatchesReplacementCode(stableCode, code))
}

function suppressCoreRowsReplacedBySpecialty(rows: GeneratedTemplateRow[], replacementCodes: ReadonlySet<string>) {
  if (!replacementCodes.size) return rows
  const removedClientRowIds = new Set(
    rows
      .filter((row) => rowIsSuppressedByCoreReplacement(row, replacementCodes))
      .map((row) => row.clientRowId),
  )
  if (removedClientRowIds.size === 0) return rows

  return rows
    .filter((row) => !removedClientRowIds.has(row.clientRowId))
    .map((row) => ({
      ...row,
      predecessorClientRowIds: row.predecessorClientRowIds.filter((id) => !removedClientRowIds.has(id)),
      predecessorDependencies: row.predecessorDependencies.filter((dependency) => !removedClientRowIds.has(dependency.clientRowId)),
    }))
}

function rowMatchesReferencedCode(row: GeneratedTemplateRow, code: string) {
  const normalizedCode = normalizeText(code)
  if (!normalizedCode) return false
  const metadata = readRowMetadata(row)
  const floorRhythm = readRecord(metadata.floorRhythm)
  return [
    row.values.template_node_id,
    row.values.source_template_node_id,
    row.values.standard_work_code,
    metadata.stableCode,
    metadata.standardWorkCode,
    metadata.templateNodeId,
    floorRhythm.stableCode,
    floorRhythm.rhythmNodeStableCode,
  ].some((value) => {
    const candidate = normalizeText(value)
    return candidate === normalizedCode || Boolean(candidate && normalizedCode.startsWith(`${candidate}-`))
  })
}

function rowScopeValue(row: GeneratedTemplateRow, field: string) {
  return normalizeText(row.values[field])
}

function rowFloorSeriesCoversObject(row: GeneratedTemplateRow, floorObjectId: string) {
  const metadata = readRowMetadata(row)
  const floorRhythm = readRecord(metadata.floorRhythm)
  const floorSeries = readRecord(metadata.floorSeries)
  const rhythmFloors = readArray(floorRhythm.floors)
  const seriesFloors = readArray(floorSeries.floors)
  return [...rhythmFloors, ...seriesFloors].some((item) => {
    const record = readRecord(item)
    return normalizeText(record.floorObjectId ?? record.floor_object_id) === floorObjectId
  })
}

function rowsDoNotConflictOnScopeFields(left: GeneratedTemplateRow, right: GeneratedTemplateRow, fields: string[]) {
  return fields.every((field) => {
    const leftValue = rowScopeValue(left, field)
    const rightValue = rowScopeValue(right, field)
    return !leftValue || !rightValue || leftValue === rightValue
  })
}

function rowsMatchRequiredScopeFields(left: GeneratedTemplateRow, right: GeneratedTemplateRow, fields: string[]) {
  return fields.every((field) => {
    const leftValue = rowScopeValue(left, field)
    const rightValue = rowScopeValue(right, field)
    if (field === 'floor_object_id') {
      if (leftValue && !rightValue && rowFloorSeriesCoversObject(right, leftValue)) return true
      if (rightValue && !leftValue && rowFloorSeriesCoversObject(left, rightValue)) return true
    }
    return !leftValue || !rightValue || leftValue === rightValue
  })
}

function rowsHaveCompatibleDependencyScope(
  left: GeneratedTemplateRow,
  right: GeneratedTemplateRow,
  scopeRule: DependencyScopeRule = 'same_project',
) {
  if (scopeRule === 'same_project') return true

  if (scopeRule === 'same_phase') {
    return rowsMatchRequiredScopeFields(left, right, ['phase_object_id'])
  }

  if (scopeRule === 'same_building') {
    return rowsDoNotConflictOnScopeFields(left, right, ['phase_object_id', 'section_object_id', 'floor_object_id'])
      && rowsMatchRequiredScopeFields(left, right, ['building_object_id'])
  }

  if (scopeRule === 'next_floor') {
    const leftIndex = Number(left.values.floor_sequence_index)
    const rightIndex = Number(right.values.floor_sequence_index)
    return rowsDoNotConflictOnScopeFields(left, right, ['phase_object_id', 'section_object_id', 'building_object_id'])
      && rowsMatchRequiredScopeFields(left, right, ['building_object_id'])
      && Number.isFinite(leftIndex)
      && Number.isFinite(rightIndex)
      && leftIndex === rightIndex + 1
  }

  if (scopeRule === 'same_floor') {
    return rowsDoNotConflictOnScopeFields(left, right, ['phase_object_id', 'section_object_id', 'building_object_id'])
      && rowsMatchRequiredScopeFields(left, right, ['floor_object_id'])
  }

  if (scopeRule === 'same_zone' || scopeRule === 'same_unit') {
    return rowsDoNotConflictOnScopeFields(left, right, ['phase_object_id', 'section_object_id', 'building_object_id', 'floor_object_id'])
      && rowsMatchRequiredScopeFields(left, right, ['physical_zone_object_id'])
  }

  if (scopeRule === 'same_system') {
    return rowsDoNotConflictOnScopeFields(left, right, DEPENDENCY_SCOPE_FIELDS)
  }

  return rowsDoNotConflictOnScopeFields(left, right, DEPENDENCY_SCOPE_FIELDS)
}

function addGeneratedDependency(row: GeneratedTemplateRow, dependency: GeneratedTemplateDependency) {
  const exists = row.predecessorDependencies.some((item) => (
    item.clientRowId === dependency.clientRowId
    && item.dependencyType === dependency.dependencyType
    && item.lagDays === dependency.lagDays
  ))
  if (exists) return false
  row.predecessorDependencies.push(dependency)
  if (!row.predecessorClientRowIds.includes(dependency.clientRowId)) {
    row.predecessorClientRowIds.push(dependency.clientRowId)
  }
  return true
}

function rowMatchesCodePrefix(row: GeneratedTemplateRow, prefix: string) {
  const stableCode = readRowStableCode(row)
  const normalizedPrefix = normalizeText(prefix)
  if (!stableCode || !normalizedPrefix) return false
  return stableCode === normalizedPrefix
    || stableCode.startsWith(`${normalizedPrefix}-`)
    || stableCode.startsWith(`${normalizedPrefix}:`)
}

function rowMatchesAnyCodePrefix(row: GeneratedTemplateRow, prefixes: string[]) {
  return prefixes.some((prefix) => rowMatchesCodePrefix(row, prefix))
}

function rowMatchesAnyExcludedCodePrefix(row: GeneratedTemplateRow, prefixes?: string[]) {
  return Array.isArray(prefixes)
    && prefixes.length > 0
    && rowMatchesAnyCodePrefix(row, prefixes)
}

function rowMatchesCategoryTypes(row: GeneratedTemplateRow, categoryTypes: string[] | undefined) {
  if (!categoryTypes || categoryTypes.length === 0) return true
  const categoryType = readRowCategoryType(row)
  return categoryTypes.map(normalizeText).includes(categoryType)
}

function pickCrossItemWorkflowCandidates(
  candidates: GeneratedTemplateRow[],
  prefixes: string[],
) {
  const exact = candidates.filter((row) => prefixes.some((prefix) => readRowStableCode(row) === normalizeText(prefix)))
  if (exact.length > 0) return exact

  const categoryPriority = ['sub_division', 'item_work', 'division']
  for (const category of categoryPriority) {
    const scoped = candidates.filter((row) => readRowCategoryType(row) === category)
    if (scoped.length > 0) return scoped
  }
  return candidates
}

function isBuildingRhythmAggregateRow(row: GeneratedTemplateRow) {
  const metadata = readRowMetadata(row)
  const floorRhythm = readRecord(metadata.floorRhythm)
  return normalizeId(row.scopeExpansionMode ?? row.values.scope_expansion_mode ?? metadata.scopeExpansionMode) === 'building_rhythm_series'
    || normalizeId(floorRhythm.scopeExpansionMode) === 'building_rhythm_series'
}

function filterRhythmAggregatedWorkflowCandidates(
  candidates: GeneratedTemplateRow[],
  rule: V1475CrossItemWorkflowRule,
) {
  if (rule.rhythmAggregationPolicy !== 'building_level_anchor_no_floor_cartesian_edges') return candidates
  return candidates.filter((row) => (
    isBuildingRhythmAggregateRow(row)
    || !rowScopeValue(row, 'floor_object_id')
  ))
}

function appendCrossItemWorkflowMetadata(
  row: GeneratedTemplateRow,
  rule: V1475CrossItemWorkflowRule,
  predecessor: GeneratedTemplateRow,
) {
  const metadata = readRowMetadata(row)
  const existing = Array.isArray(metadata.crossItemWorkflow) ? metadata.crossItemWorkflow : []
  row.values = {
    ...row.values,
    standard_task_metadata: {
      ...metadata,
      crossItemWorkflow: [
        ...existing,
        {
          source: 'v1.4.7.5_cross_item_workflow',
          sourceType: 'cross_item_workflow',
          ruleCode: rule.stableCode,
          predecessorStableCode: readRowStableCode(predecessor),
          successorStableCode: readRowStableCode(row),
          scopeRule: rule.scopeRule,
          dependencyType: rule.dependencyType,
          lagDays: rule.lagDays,
          strength: rule.strength,
          autoApplyPolicy: rule.autoApplyPolicy,
          boundaryPolicy: rule.boundaryPolicy,
          rhythmAggregationPolicy: rule.rhythmAggregationPolicy ?? null,
        },
      ],
    },
  }
}

function applyCrossItemWorkflowRules(rows: GeneratedTemplateRow[]) {
  const activeRules = V1475_CROSS_ITEM_WORKFLOW_SEED.filter((rule) => (
    rule.isActive !== false
    && rule.autoApplyPolicy === 'confirmed_template_only'
  ))

  for (const rule of activeRules) {
    const predecessorCandidates = pickCrossItemWorkflowCandidates(
      filterRhythmAggregatedWorkflowCandidates(rows.filter((row) => (
        rowMatchesAnyCodePrefix(row, rule.predecessorCodePrefixes)
        && !rowMatchesAnyExcludedCodePrefix(row, rule.excludedPredecessorCodePrefixes)
        && rowMatchesCategoryTypes(row, rule.predecessorCategoryTypes)
        && rowCanAnchorCrossItemWorkflow(row, rule.predecessorAnchorDurationContributionModes)
      )), rule),
      rule.predecessorCodePrefixes,
    )
    const successorCandidates = pickCrossItemWorkflowCandidates(
      filterRhythmAggregatedWorkflowCandidates(rows.filter((row) => (
        rowMatchesAnyCodePrefix(row, rule.successorCodePrefixes)
        && !rowMatchesAnyExcludedCodePrefix(row, rule.excludedSuccessorCodePrefixes)
        && rowMatchesCategoryTypes(row, rule.successorCategoryTypes)
        && rowCanAnchorCrossItemWorkflow(row, rule.successorAnchorDurationContributionModes)
      )), rule),
      rule.successorCodePrefixes,
    )

    for (const successor of successorCandidates) {
      for (const predecessor of predecessorCandidates) {
        if (successor.clientRowId === predecessor.clientRowId) continue
        if (!rowsHaveCompatibleDependencyScope(successor, predecessor, rule.scopeRule)) continue
        const added = addGeneratedDependency(successor, {
          clientRowId: predecessor.clientRowId,
          dependencyType: rule.dependencyType,
          lagDays: Number(rule.lagDays ?? 0) || 0,
          intentCode: `cross-item:${rule.stableCode}`,
          relationRole: 'workflow',
          strength: rule.strength,
          source: 'cross_item_workflow',
        })
        if (added) appendCrossItemWorkflowMetadata(successor, rule, predecessor)
      }
    }
  }
}

function rowCanAnchorDependencyIntent(row: GeneratedTemplateRow) {
  const metadata = readRowMetadata(row)
  const mode = normalizeDurationContributionMode(row.values.duration_contribution_mode ?? metadata.durationContributionMode)
    ?? 'duration_bearing'
  return isInternalFlowAnchorMode(mode)
}

function rowCanAnchorCrossItemWorkflow(
  row: GeneratedTemplateRow,
  allowedModes: DurationContributionMode[] | undefined,
) {
  const metadata = readRowMetadata(row)
  const mode = normalizeDurationContributionMode(row.values.duration_contribution_mode ?? metadata.durationContributionMode)
    ?? 'duration_bearing'
  return isInternalFlowAnchorMode(mode) || Boolean(allowedModes?.includes(mode))
}

function rowMatchesDependencyIntentTarget(row: GeneratedTemplateRow, code: string, intent: Partial<V1475DependencyIntentTemplate>) {
  if (intent.materializeDirection === 'target_depends_on_source') {
    return rowMatchesCodePrefix(row, code) || rowMatchesReferencedCode(row, code)
  }
  return rowMatchesReferencedCode(row, code)
}

function pickDependencyIntentTargets(
  candidates: GeneratedTemplateRow[],
  code: string,
  intent: Partial<V1475DependencyIntentTemplate>,
) {
  if (intent.materializeDirection !== 'target_depends_on_source') return candidates
  const processAnchors = candidates.filter((candidate) => (
    ['process', 'activity_step'].includes(readRowCategoryType(candidate))
    && rowMatchesCodePrefix(candidate, code)
  ))
  return processAnchors.length > 0 ? processAnchors : candidates
}

function collectGeneratedTemplateGovernanceWarnings(rows: GeneratedTemplateRow[]): GeneratedTemplateGovernanceWarning[] {
  const warnings: GeneratedTemplateGovernanceWarning[] = []
  for (const row of rows) {
    const metadata = readRowMetadata(row)
    const stableCode = readRowStableCode(row)
    const intents = readArray(metadata.dependencyIntentTemplates)
      .map((item) => readRecord(item)) as Array<Partial<V1475DependencyIntentTemplate>>
    for (const intent of intents) {
      if (intent.autoApplyPolicy !== 'confirmed_template_only') continue
      if (intent.relationshipDomain && intent.relationshipDomain !== 'business_constraint') continue
      const targetGroup = normalizeText(intent.toCatalogGroup) as WbsTemplatePackType
      const targetCode = normalizeText(intent.toReferencedCode)
      if (!targetGroup || !targetCode) continue

      if (intent.auditReasonCode === 'accepted_business_constraint_reference_field_normalized') {
        warnings.push({
          code: 'DEPENDENCY_INTENT_REFERENCE_FIELD_NORMALIZED',
          severity: 'warning',
          nodeCode: stableCode,
          message: 'Template reference field prefix does not match stableCode prefix. The generator normalized by code prefix; fix the field in seed governance.',
          details: {
            matchedReferenceField: intent.matchedReferenceField ?? null,
            targetGroup,
            targetCode,
            auditTrace: intent.auditTrace ?? [],
          },
        })
      }

      const candidates = rows.filter((candidate) => (
        candidate.clientRowId !== row.clientRowId
        && readRowPackType(candidate) === targetGroup
        && rowMatchesReferencedCode(candidate, targetCode)
        && rowsHaveCompatibleDependencyScope(row, candidate, intent.scopeRule ?? 'same_project')
      ))
      if (candidates.length === 0) {
        warnings.push({
          code: 'DEPENDENCY_INTENT_TARGET_NOT_GENERATED',
          severity: 'warning',
          nodeCode: stableCode,
          message: 'Confirmation or handover dependency target was not generated. Select the corresponding physical-work template or complete the specialty acceptance reference code.',
          details: {
            targetGroup,
            targetCode,
            relationRole: intent.relationRole ?? null,
            scopeRule: intent.scopeRule ?? 'same_project',
            matchedReferenceField: intent.matchedReferenceField ?? null,
          },
        })
        continue
      }
      if (!candidates.some((candidate) => rowCanAnchorDependencyIntent(candidate))) {
        warnings.push({
          code: 'DEPENDENCY_INTENT_TARGET_NOT_ANCHORABLE',
          severity: 'warning',
          nodeCode: stableCode,
          message: 'Confirmation or handover dependency target exists, but it is not an anchorable dependency target. Check the target durationContributionMode.',
          details: {
            targetGroup,
            targetCode,
            targetModes: candidates.map((candidate) => {
              const candidateMetadata = readRowMetadata(candidate)
              return {
                stableCode: readRowStableCode(candidate),
                durationContributionMode: candidate.values.duration_contribution_mode ?? candidateMetadata.durationContributionMode ?? null,
              }
            }),
          },
        })
      }
    }
  }
  return warnings
}

function applyDependencyIntentTemplates(rows: GeneratedTemplateRow[]) {
  for (const row of rows) {
    const metadata = readRowMetadata(row)
    const intents = readArray(metadata.dependencyIntentTemplates)
      .map((item) => readRecord(item)) as Array<Partial<V1475DependencyIntentTemplate>>
    for (const intent of intents) {
      if (intent.autoApplyPolicy !== 'confirmed_template_only') continue
      if (intent.relationshipDomain && intent.relationshipDomain !== 'business_constraint') continue
      const toCatalogGroup = normalizeText(intent.toCatalogGroup) as WbsTemplatePackType
      const toReferencedCode = normalizeText(intent.toReferencedCode)
      if (!toCatalogGroup || !toReferencedCode) continue
      const candidates = rows.filter((candidate) => (
        candidate.clientRowId !== row.clientRowId
        && readRowPackType(candidate) === toCatalogGroup
        && rowMatchesDependencyIntentTarget(candidate, toReferencedCode, intent)
        && rowsHaveCompatibleDependencyScope(row, candidate, intent.scopeRule ?? 'same_project')
        && rowCanAnchorDependencyIntent(candidate)
      ))
      const targets = pickDependencyIntentTargets(candidates, toReferencedCode, intent)
      for (const target of targets) {
        const materializeTarget = intent.materializeDirection === 'target_depends_on_source' ? target : row
        const predecessor = intent.materializeDirection === 'target_depends_on_source' ? row : target
        addGeneratedDependency(materializeTarget, {
          clientRowId: predecessor.clientRowId,
          dependencyType: intent.dependencyType ?? 'FS',
          lagDays: Number(intent.lagDays ?? 0) || 0,
          intentCode: normalizeId(intent.intentCode),
          relationRole: intent.relationRole ?? null,
          strength: intent.strength,
          source: 'dependency_intent_template',
          confidenceScore: typeof intent.confidenceScore === 'number' ? intent.confidenceScore : null,
          confidenceLevel: intent.confidenceLevel ?? null,
          matchedReferenceField: normalizeText(intent.matchedReferenceField) || null,
          auditReasonCode: intent.auditReasonCode ?? null,
          auditTrace: Array.isArray(intent.auditTrace) ? [...intent.auditTrace] : null,
        })
      }
    }
  }
}

function generatedDependencyPriority(dependency: GeneratedTemplateDependency) {
  if (dependency.source === 'dependency_intent_template') return 4
  if (dependency.source === 'cross_item_workflow') return 3
  if (dependency.source === 'internal_flow') return 2
  if (dependency.source === 'sibling_sequence') return 1
  if (dependency.source === 'phase_chain') return 0
  return 0
}

function pruneGeneratedDependencyConflicts(rows: GeneratedTemplateRow[]) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  let prunedCount = 0
  for (const row of rows) {
    const previousDependencyCount = row.predecessorDependencies.length
    const keptDependencies = row.predecessorDependencies.filter((dependency) => {
      const predecessor = rowById.get(dependency.clientRowId)
      if (!predecessor) return true
      const reverseDependencies = predecessor.predecessorDependencies.filter((reverse) => reverse.clientRowId === row.clientRowId)
      if (reverseDependencies.length === 0) return true
      const ownPriority = generatedDependencyPriority(dependency)
      const strongestReversePriority = Math.max(...reverseDependencies.map(generatedDependencyPriority))
      const keep = ownPriority >= strongestReversePriority
      if (!keep) prunedCount += 1
      return keep
    })
    if (keptDependencies.length === row.predecessorDependencies.length) continue
    row.predecessorDependencies = keptDependencies
    row.predecessorClientRowIds = row.predecessorClientRowIds.filter((id) => keptDependencies.some((dependency) => dependency.clientRowId === id))
    const metadata = readRowMetadata(row)
    row.values = {
      ...row.values,
      standard_task_metadata: {
        ...metadata,
        dependencyConflictResolution: {
          source: 'generated_dependency_network',
          policy: 'prefer_business_dependency_over_catalog_sibling_sequence',
          prunedCount: previousDependencyCount - keptDependencies.length,
        },
      },
    }
  }
  return prunedCount
}

type GeneratedDependencyEdge = {
  from: string
  to: string
  row: GeneratedTemplateRow
  dependency: GeneratedTemplateDependency
}

function generatedDependencyEquals(left: GeneratedTemplateDependency, right: GeneratedTemplateDependency) {
  return left.clientRowId === right.clientRowId
    && left.dependencyType === right.dependencyType
    && left.lagDays === right.lagDays
    && left.source === right.source
    && left.intentCode === right.intentCode
}

function buildGeneratedDependencyEdges(rows: GeneratedTemplateRow[]) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  const outgoing = new Map<string, GeneratedDependencyEdge[]>()
  for (const row of rows) {
    for (const dependency of row.predecessorDependencies) {
      if (!rowById.has(dependency.clientRowId)) continue
      const edge = {
        from: dependency.clientRowId,
        to: row.clientRowId,
        row,
        dependency,
      }
      outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
    }
  }
  return { rowById, outgoing }
}

function findGeneratedDependencyCycle(rows: GeneratedTemplateRow[]): GeneratedDependencyEdge[] | null {
  const { rowById, outgoing } = buildGeneratedDependencyEdges(rows)
  const state = new Map<string, 'visiting' | 'visited'>()
  const edgeStack: GeneratedDependencyEdge[] = []

  function visit(rowId: string): GeneratedDependencyEdge[] | null {
    state.set(rowId, 'visiting')
    for (const edge of outgoing.get(rowId) ?? []) {
      if (!rowById.has(edge.to)) continue
      const targetState = state.get(edge.to)
      if (targetState === 'visiting') {
        const cycleStartIndex = edgeStack.findIndex((item) => item.from === edge.to)
        return [
          ...(cycleStartIndex >= 0 ? edgeStack.slice(cycleStartIndex) : edgeStack),
          edge,
        ]
      }
      if (targetState === 'visited') continue
      edgeStack.push(edge)
      const cycle = visit(edge.to)
      if (cycle) return cycle
      edgeStack.pop()
    }
    state.set(rowId, 'visited')
    return null
  }

  for (const row of rows) {
    if (state.has(row.clientRowId)) continue
    const cycle = visit(row.clientRowId)
    if (cycle) return cycle
  }
  return null
}

function removeGeneratedDependencyEdge(edge: GeneratedDependencyEdge) {
  const previousDependencyCount = edge.row.predecessorDependencies.length
  edge.row.predecessorDependencies = edge.row.predecessorDependencies.filter((dependency) => !generatedDependencyEquals(dependency, edge.dependency))
  if (edge.row.predecessorDependencies.length === previousDependencyCount) return false
  edge.row.predecessorClientRowIds = edge.row.predecessorClientRowIds.filter((id) => (
    edge.row.predecessorDependencies.some((dependency) => dependency.clientRowId === id)
  ))
  const metadata = readRowMetadata(edge.row)
  const existing = readArray(metadata.dependencyCycleResolution)
  edge.row.values = {
    ...edge.row.values,
    standard_task_metadata: {
      ...metadata,
      dependencyCycleResolution: [
        ...existing,
        {
          source: 'generated_dependency_network',
          policy: 'remove_lowest_priority_edge_in_cycle',
          removedDependencySource: edge.dependency.source ?? null,
          removedDependencyType: edge.dependency.dependencyType,
          removedDependencyIntentCode: edge.dependency.intentCode ?? null,
          removedPredecessorClientRowId: edge.dependency.clientRowId,
        },
      ],
    },
  }
  return true
}

function generatedRowHasAncestor(
  rowById: Map<string, GeneratedTemplateRow>,
  descendantRowId: string,
  ancestorRowId: string,
) {
  const seen = new Set<string>()
  let current = rowById.get(descendantRowId)
  while (current?.parentClientRowId && !seen.has(current.clientRowId)) {
    if (current.parentClientRowId === ancestorRowId) return true
    seen.add(current.clientRowId)
    current = rowById.get(current.parentClientRowId)
  }
  return false
}

function pruneGeneratedHierarchySelfDependencies(rows: GeneratedTemplateRow[]) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  let prunedCount = 0

  for (const row of rows) {
    const hierarchySelfDependencies = row.predecessorDependencies.filter((dependency) => (
      generatedRowHasAncestor(rowById, dependency.clientRowId, row.clientRowId)
    ))
    if (hierarchySelfDependencies.length === 0) continue

    row.predecessorDependencies = row.predecessorDependencies.filter((dependency) => (
      !hierarchySelfDependencies.some((candidate) => generatedDependencyEquals(candidate, dependency))
    ))
    row.predecessorClientRowIds = row.predecessorClientRowIds.filter((id) => (
      row.predecessorDependencies.some((dependency) => dependency.clientRowId === id)
    ))
    prunedCount += hierarchySelfDependencies.length

    const metadata = readRowMetadata(row)
    const existing = readArray(metadata.dependencyHierarchyResolution)
    row.values = {
      ...row.values,
      standard_task_metadata: {
        ...metadata,
        dependencyHierarchyResolution: [
          ...existing,
          ...hierarchySelfDependencies.map((dependency) => ({
            source: 'generated_dependency_network',
            policy: 'remove_ancestor_depends_on_descendant_edge',
            removedDependencySource: dependency.source ?? null,
            removedDependencyType: dependency.dependencyType,
            removedDependencyIntentCode: dependency.intentCode ?? null,
            removedPredecessorClientRowId: dependency.clientRowId,
          })),
        ],
      },
    }
  }

  return prunedCount
}

function generatedDependencyEdgeCanBeCyclePruned(edge: GeneratedDependencyEdge) {
  return edge.dependency.source !== 'cross_item_workflow'
    && edge.dependency.source !== 'dependency_intent_template'
}

function pruneGeneratedDependencyCycles(rows: GeneratedTemplateRow[]) {
  let prunedCount = 0
  const maxIterations = Math.max(
    1,
    rows.reduce((count, row) => count + row.predecessorDependencies.length, 0),
  )
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const cycle = findGeneratedDependencyCycle(rows)
    if (!cycle) break
    const prunableCycleEdges = cycle.filter(generatedDependencyEdgeCanBeCyclePruned)
    const edgeToRemove = [...(prunableCycleEdges.length > 0 ? prunableCycleEdges : cycle)].sort((left, right) => {
      const priorityDelta = generatedDependencyPriority(left.dependency) - generatedDependencyPriority(right.dependency)
      if (priorityDelta !== 0) return priorityDelta
      if (left.dependency.source === 'sibling_sequence' && right.dependency.source !== 'sibling_sequence') return -1
      if (right.dependency.source === 'sibling_sequence' && left.dependency.source !== 'sibling_sequence') return 1
      return 0
    })[0]
    if (!edgeToRemove || !removeGeneratedDependencyEdge(edgeToRemove)) break
    prunedCount += 1
  }
  return prunedCount
}

function parsePlanDateTime(date: string | null) {
  if (!date) return null
  const time = Date.parse(`${date}T00:00:00.000Z`)
  return Number.isFinite(time) ? time : null
}

function comparePlanDates(left: string | null, right: string | null) {
  const leftTime = parsePlanDateTime(left)
  const rightTime = parsePlanDateTime(right)
  if (leftTime === null && rightTime === null) return 0
  if (leftTime === null) return -1
  if (rightTime === null) return 1
  return leftTime - rightTime
}

function readGeneratedRowPlanStart(row: GeneratedTemplateRow) {
  return normalizeDate(row.values.planned_start_date ?? row.values.start_date)
}

function readGeneratedRowPlanEnd(row: GeneratedTemplateRow) {
  return normalizeDate(row.values.planned_end_date ?? row.values.end_date)
}

function readGeneratedRowPlanDurationDays(row: GeneratedTemplateRow) {
  const start = readGeneratedRowPlanStart(row)
  const end = readGeneratedRowPlanEnd(row)
  if (start && end) return daysInclusive(start, end)
  const referenceDuration = Number(row.values.smart_reference_days)
  if (Number.isFinite(referenceDuration) && referenceDuration > 0) return Math.max(1, Math.round(referenceDuration))
  return 1
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function readRecordField(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return record[key]
  }
  return undefined
}

function normalizePhaseReleaseMode(value: unknown): WbsTemplatePhaseReleaseMode | null {
  const mode = normalizeText(value)
  if (
    mode === 'strict_finish_start'
    || mode === 'overlap_after_days'
    || mode === 'overlap_before_finish_days'
    || mode === 'overlap_after_percent'
    || mode === 'parallel_group'
  ) return mode
  return null
}

function readOperationPhaseId(operation: PlanningTableOperation) {
  const scope = readRecord(operation.scope)
  return normalizeText(
    scope.phase_object_id
      ?? scope.phaseObjectId
      ?? operation.phase_object_id
      ?? operation.phaseObjectId,
  )
}

function operationLooksPrefabScope(operation: PlanningTableOperation) {
  const templateIds = uniqueStringArray([
    normalizeText(operation.templateId),
    ...readArray(operation.templateIds).map(normalizeText),
    ...Object.keys(readRecord(operation.selectedNodesByTemplate ?? operation.selected_nodes_by_template)).map(normalizeText),
  ].filter(Boolean))
  if (templateIds.some((id) => id.includes('prefab') || id.includes('prefabricated'))) return true

  const selectedCodes = uniqueStringArray([
    ...readArray(operation.selectedNodeIds ?? operation.selected_node_ids).map(normalizeText),
    ...Object.values(readRecord(operation.selectedNodesByTemplate ?? operation.selected_nodes_by_template))
      .flatMap((value) => readArray(value).map(normalizeText)),
  ].filter(Boolean))
  return selectedCodes.some((code) => code.toUpperCase().startsWith('PFB-'))
}

function operationLooksPrefabFactorySupplyScope(operation: PlanningTableOperation) {
  const phaseId = readOperationPhaseId(operation).toLowerCase()
  if (!operationLooksPrefabScope(operation)) return false
  if (phaseId.includes('factory') || phaseId.includes('supply')) return true

  const selectedCodes = uniqueStringArray([
    ...readArray(operation.selectedNodeIds ?? operation.selected_node_ids).map(normalizeText),
    ...Object.values(readRecord(operation.selectedNodesByTemplate ?? operation.selected_nodes_by_template))
      .flatMap((value) => readArray(value).map(normalizeText)),
  ].filter(Boolean))
  return selectedCodes.length > 0 && selectedCodes.every((code) => code.toUpperCase().startsWith('PFB-00'))
}

function readOperationPhaseReleasePolicy(operation: PlanningTableOperation): WbsTemplatePhaseReleasePolicy | null {
  return normalizePhaseReleasePolicyRecord(
    operation.phaseReleasePolicy
      ?? operation.phase_release_policy
      ?? readRecord(operation.scope).phaseReleasePolicy
      ?? readRecord(operation.scope).phase_release_policy,
  )
}

function normalizePhaseReleasePolicyRecord(value: unknown): WbsTemplatePhaseReleasePolicy | null {
  const raw = readRecord(value)
  const mode = normalizePhaseReleaseMode(readRecordField(raw, 'mode', 'releaseMode', 'release_mode'))
  if (!mode) return null
  return {
    mode,
    afterDays: clampInteger(readRecordField(raw, 'afterDays', 'after_days'), 0, 3650, 0),
    beforeFinishDays: clampInteger(readRecordField(raw, 'beforeFinishDays', 'before_finish_days'), 0, 3650, 0),
    percent: clampInteger(readRecordField(raw, 'percent', 'afterPercent', 'after_percent'), 0, 100, 0),
    groupKey: normalizeId(readRecordField(raw, 'groupKey', 'group_key')),
    dependencyType: normalizeDependencyType(readRecordField(raw, 'dependencyType', 'dependency_type')),
    lagDays: clampInteger(readRecordField(raw, 'lagDays', 'lag_days'), -3650, 3650, 0),
  }
}

function buildExplicitPhaseReleasePolicyMap(value: unknown) {
  const result = new Map<string, WbsTemplatePhaseReleasePolicy>()
  if (Array.isArray(value)) {
    for (const item of value) {
      const record = readRecord(item)
      const phaseId = normalizeText(readRecordField(record, 'phaseId', 'phase_id', 'id'))
      const policy = normalizePhaseReleasePolicyRecord(record)
      if (phaseId && policy) result.set(phaseId, policy)
    }
    return result
  }

  const record = readRecord(value)
  for (const [phaseId, rawPolicy] of Object.entries(record)) {
    const policy = normalizePhaseReleasePolicyRecord(rawPolicy)
    if (normalizeText(phaseId) && policy) result.set(normalizeText(phaseId), policy)
  }
  return result
}

function inferDefaultPhaseReleasePolicy(operation: PlanningTableOperation, index: number): WbsTemplatePhaseReleasePolicy {
  if (index === 0) return { mode: 'strict_finish_start', dependencyType: 'FS', lagDays: 0 }
  const phaseId = readOperationPhaseId(operation).toLowerCase()
  if (operationLooksPrefabFactorySupplyScope(operation)) return { mode: 'parallel_group', dependencyType: 'SS', lagDays: 0 }
  if (
    phaseId.includes('site')
    || phaseId.includes('danger')
    || phaseId.includes('quality')
    || phaseId.includes('doc')
    || phaseId.includes('milestone')
  ) return { mode: 'parallel_group', dependencyType: 'SS', lagDays: 0 }
  if (phaseId.includes('foundation-pit') || phaseId.includes('pit-pile')) return { mode: 'parallel_group', dependencyType: 'SS', lagDays: 0 }
  if (phaseId.includes('basement')) return { mode: 'overlap_before_finish_days', beforeFinishDays: 30, dependencyType: 'SS', lagDays: 60 }
  if (phaseId.includes('waterproof')) return { mode: 'overlap_before_finish_days', beforeFinishDays: 14, dependencyType: 'SS', lagDays: 90 }
  if (phaseId.includes('superstructure') || phaseId.includes('structure-core')) return { mode: 'strict_finish_start', dependencyType: 'FS', lagDays: 0 }
  if (phaseId.includes('mep')) return { mode: 'overlap_after_days', afterDays: 60, dependencyType: 'SS', lagDays: 60 }
  if (phaseId.includes('finishing') || phaseId.includes('fitout')) return { mode: 'overlap_before_finish_days', beforeFinishDays: 30, dependencyType: 'SS', lagDays: 120 }
  if (phaseId.includes('commission') || phaseId.includes('outdoor')) return { mode: 'overlap_before_finish_days', beforeFinishDays: 30, dependencyType: 'SS', lagDays: 90 }
  return { mode: 'overlap_after_percent', percent: 70, dependencyType: 'SS', lagDays: 0 }
}

function resolvePhaseReleasePolicy(operation: PlanningTableOperation, index: number, explicitPolicies: Map<string, WbsTemplatePhaseReleasePolicy>) {
  const phaseId = readOperationPhaseId(operation)
  const explicitMapPolicy = phaseId ? explicitPolicies.get(phaseId) : null
  if (explicitMapPolicy) {
    return {
      policy: explicitMapPolicy,
      source: 'explicit_map',
    } satisfies ResolvedPhaseReleasePolicy
  }
  const operationPolicy = readOperationPhaseReleasePolicy(operation)
  if (operationPolicy) {
    return {
      policy: operationPolicy,
      source: 'operation',
    } satisfies ResolvedPhaseReleasePolicy
  }
  return {
    policy: inferDefaultPhaseReleasePolicy(operation, index),
    source: 'inferred',
  } satisfies ResolvedPhaseReleasePolicy
}

function computePhaseReleaseStartDate(params: {
  projectStartDate: string
  previousStartDate: string | null
  previousEndDate: string | null
  previousDurationDays: number
  policy: WbsTemplatePhaseReleasePolicy
}) {
  const { projectStartDate, previousStartDate, previousEndDate, previousDurationDays, policy } = params
  if (!previousStartDate || !previousEndDate) return projectStartDate
  let computedStart: string
  switch (policy.mode) {
    case 'parallel_group':
      computedStart = projectStartDate
      break
    case 'overlap_after_days':
      computedStart = addDays(previousStartDate, clampInteger(policy.afterDays, 0, 3650, 0))
      break
    case 'overlap_before_finish_days':
      computedStart = addDays(previousEndDate, -clampInteger(policy.beforeFinishDays, 0, 3650, 0))
      break
    case 'overlap_after_percent': {
      const percent = clampInteger(policy.percent, 0, 100, 70)
      computedStart = addDays(previousStartDate, Math.max(0, Math.floor(previousDurationDays * percent / 100)))
      break
    }
    case 'strict_finish_start':
    default:
      computedStart = addDays(previousEndDate, 1 + clampInteger(policy.lagDays, -3650, 3650, 0))
  }
  return comparePlanDates(computedStart, projectStartDate) < 0 ? projectStartDate : computedStart
}

function phaseReleasePolicyToDependency(policy: WbsTemplatePhaseReleasePolicy): Pick<GeneratedTemplateDependency, 'dependencyType' | 'lagDays'> {
  if (policy.mode === 'strict_finish_start') {
    return { dependencyType: 'FS', lagDays: clampInteger(policy.lagDays, -3650, 3650, 0) }
  }
  if (policy.mode === 'overlap_after_days') {
    return { dependencyType: 'SS', lagDays: clampInteger(policy.afterDays ?? policy.lagDays, -3650, 3650, 0) }
  }
  if (policy.mode === 'overlap_after_percent') {
    return { dependencyType: 'SS', lagDays: clampInteger(policy.lagDays, -3650, 3650, 0) }
  }
  if (policy.mode === 'overlap_before_finish_days') {
    return { dependencyType: 'FF', lagDays: -clampInteger(policy.beforeFinishDays ?? policy.lagDays, 0, 3650, 0) }
  }
  return { dependencyType: 'SS', lagDays: clampInteger(policy.lagDays, -3650, 3650, 0) }
}

function shiftGeneratedRowPlanDates(row: GeneratedTemplateRow, shiftDays: number) {
  if (shiftDays === 0) return
  const start = readGeneratedRowPlanStart(row)
  const end = readGeneratedRowPlanEnd(row)
  if (!start || !end) return
  const nextStart = addDays(start, shiftDays)
  const nextEnd = addDays(end, shiftDays)
  row.values = {
    ...row.values,
    planned_start_date: nextStart,
    planned_end_date: nextEnd,
    start_date: nextStart,
    end_date: nextEnd,
  }
}

function computeDependencyRequiredStart(
  dependency: GeneratedTemplateDependency,
  predecessor: GeneratedTemplateRow,
  successorDurationDays: number,
) {
  const predecessorStart = readGeneratedRowPlanStart(predecessor)
  const predecessorEnd = readGeneratedRowPlanEnd(predecessor)
  const lagDays = Number.isFinite(Number(dependency.lagDays)) ? Math.round(Number(dependency.lagDays)) : 0
  switch (dependency.dependencyType) {
    case 'SS':
      return predecessorStart ? addDays(predecessorStart, lagDays) : null
    case 'FF': {
      const requiredFinish = predecessorEnd ? addDays(predecessorEnd, lagDays) : null
      return requiredFinish ? addDays(requiredFinish, -(Math.max(1, successorDurationDays) - 1)) : null
    }
    case 'SF': {
      const requiredFinish = predecessorStart ? addDays(predecessorStart, lagDays) : null
      return requiredFinish ? addDays(requiredFinish, -(Math.max(1, successorDurationDays) - 1)) : null
    }
    case 'FS':
    default:
      return predecessorEnd ? addDays(predecessorEnd, lagDays + 1) : null
  }
}

function shiftGeneratedRowAndDescendants(
  row: GeneratedTemplateRow,
  shiftDays: number,
  childRowsByParentId: Map<string, GeneratedTemplateRow[]>,
) {
  if (shiftDays === 0) return
  shiftGeneratedRowPlanDates(row, shiftDays)
  for (const child of childRowsByParentId.get(row.clientRowId) ?? []) {
    shiftGeneratedRowAndDescendants(child, shiftDays, childRowsByParentId)
  }
}

function buildGeneratedRowsByParentId(rows: GeneratedTemplateRow[]) {
  const childRowsByParentId = new Map<string, GeneratedTemplateRow[]>()
  for (const row of rows) {
    if (!row.parentClientRowId) continue
    const siblings = childRowsByParentId.get(row.parentClientRowId) ?? []
    siblings.push(row)
    childRowsByParentId.set(row.parentClientRowId, siblings)
  }
  return childRowsByParentId
}

function applyGeneratedDependencySchedule(rows: GeneratedTemplateRow[]) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  const childRowsByParentId = buildGeneratedRowsByParentId(rows)
  const projectStartDate = getGeneratedRowsEarliestStart(rows)
  const scheduleCapDate = projectStartDate ? addDays(projectStartDate, 3650) : null
  let nonConvergent = false
  let cappedShiftCount = 0
  let maxRequiredStartBeyondCap: string | null = null

  const dependencyStats = new Map<string, {
    predecessorCount: number
    appliedDependencyTypes: Set<GeneratedTemplateDependency['dependencyType']>
    appliedSources: Set<NonNullable<GeneratedTemplateDependency['source']>>
    invalidPredecessorCount: number
    adjusted: boolean
    maxShiftDays: number
  }>()

  for (const row of rows) {
    if (row.predecessorDependencies.length === 0) continue
    const stat = {
      predecessorCount: 0,
      appliedDependencyTypes: new Set<GeneratedTemplateDependency['dependencyType']>(),
      appliedSources: new Set<NonNullable<GeneratedTemplateDependency['source']>>(),
      invalidPredecessorCount: 0,
      adjusted: false,
      maxShiftDays: 0,
    }
    for (const dependency of row.predecessorDependencies) {
      const predecessor = rowById.get(dependency.clientRowId)
      if (!predecessor || !readGeneratedRowPlanStart(predecessor) || !readGeneratedRowPlanEnd(predecessor)) {
        stat.invalidPredecessorCount += 1
        continue
      }
      stat.predecessorCount += 1
      stat.appliedDependencyTypes.add(dependency.dependencyType)
      if (dependency.source) stat.appliedSources.add(dependency.source)
    }
    if (stat.predecessorCount > 0 || stat.invalidPredecessorCount > 0) {
      dependencyStats.set(row.clientRowId, stat)
    }
  }

  const maxPasses = Math.max(rows.length, 1)
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false
    for (const row of rows) {
      if (row.predecessorDependencies.length === 0) continue
      if (readRowMetadata(row).scheduleAuthorityPolicy === 'package_child_rhythm_window') continue
      const currentStart = readGeneratedRowPlanStart(row)
      if (!currentStart) continue
      const durationDays = readGeneratedRowPlanDurationDays(row)
      let requiredStart = currentStart
      for (const dependency of row.predecessorDependencies) {
        const predecessor = rowById.get(dependency.clientRowId)
        if (!predecessor) continue
        const dependencyRequiredStart = computeDependencyRequiredStart(dependency, predecessor, durationDays)
        if (comparePlanDates(dependencyRequiredStart, requiredStart) > 0) {
          requiredStart = dependencyRequiredStart
        }
      }
      if (scheduleCapDate && comparePlanDates(requiredStart, scheduleCapDate) > 0) {
        nonConvergent = true
        cappedShiftCount += 1
        maxRequiredStartBeyondCap = !maxRequiredStartBeyondCap || comparePlanDates(requiredStart, maxRequiredStartBeyondCap) > 0
          ? requiredStart
          : maxRequiredStartBeyondCap
        requiredStart = scheduleCapDate
      }
      const shiftDays = signedDurationDayDelta(currentStart, requiredStart) ?? 0
      if (shiftDays <= 0) continue
      shiftGeneratedRowAndDescendants(row, shiftDays, childRowsByParentId)
      const stat = dependencyStats.get(row.clientRowId)
      if (stat) {
        stat.adjusted = true
        stat.maxShiftDays = Math.max(stat.maxShiftDays, shiftDays)
      }
      changed = true
    }
    if (!changed) break
    if (pass === maxPasses - 1) nonConvergent = true
  }

  for (const [clientRowId, stat] of dependencyStats.entries()) {
    const row = rowById.get(clientRowId)
    if (!row) continue
    const metadata = readRowMetadata(row)
    row.values = {
      ...row.values,
      standard_task_metadata: {
        ...metadata,
        dependencySchedule: {
          source: 'generated_dependency_network',
          adjusted: stat.adjusted,
          predecessorCount: stat.predecessorCount,
          invalidPredecessorCount: stat.invalidPredecessorCount,
          appliedDependencyTypes: [...stat.appliedDependencyTypes],
          appliedSources: [...stat.appliedSources],
          maxShiftDays: stat.maxShiftDays,
          convergence: nonConvergent
            ? {
                status: 'capped_or_unresolved',
                scheduleCapDate,
                cappedShiftCount,
                maxRequiredStartBeyondCap,
              }
            : { status: 'converged' },
        },
      },
    }
  }

  return nonConvergent
    ? {
        code: 'DEPENDENCY_SCHEDULE_NON_CONVERGENT' as const,
        severity: 'warning' as const,
        nodeCode: 'GENERATED_DEPENDENCY_NETWORK',
        message: 'Generated dependency schedule reached the project schedule cap before convergence; review cross-item workflow or dependency-intent rules.',
        details: {
          scheduleCapDate,
          cappedShiftCount,
          maxRequiredStartBeyondCap,
        },
      } satisfies GeneratedTemplateGovernanceWarning
    : null
}

function applyGeneratedPhaseChainSchedule(rows: GeneratedTemplateRow[], scopeCombos: WbsTemplateScope[]) {
  const phaseOrder: string[] = []
  const phaseByScopeIndex = new Map<number, string>()
  scopeCombos.forEach((scope, scopeIndex) => {
    const phaseId = normalizeText(scope.phase_object_id)
    if (!phaseId) return
    phaseByScopeIndex.set(scopeIndex, phaseId)
    if (!phaseOrder.includes(phaseId)) phaseOrder.push(phaseId)
  })
  if (phaseOrder.length <= 1) return

  const rowsByPhaseId = new Map<string, GeneratedTemplateRow[]>()
  for (const row of rows) {
    const scopeIndex = Number(row.values.scope_index)
    const phaseId = Number.isFinite(scopeIndex)
      ? phaseByScopeIndex.get(scopeIndex)
      : normalizeText(row.values.phase_object_id)
    if (!phaseId) continue
    rowsByPhaseId.set(phaseId, [...(rowsByPhaseId.get(phaseId) ?? []), row])
  }

  const childRowsByParentId = buildGeneratedRowsByParentId(rows)
  let previousPhaseEnd: string | null = null
  for (const phaseId of phaseOrder) {
    const phaseRows = rowsByPhaseId.get(phaseId) ?? []
    const rootRows = phaseRows.filter((row) => !row.parentClientRowId || !phaseRows.some((candidate) => candidate.clientRowId === row.parentClientRowId))
    const earliestStart = phaseRows
      .map(readGeneratedRowPlanStart)
      .filter((date): date is string => Boolean(date))
      .sort(comparePlanDates)[0] ?? null
    if (previousPhaseEnd && earliestStart) {
      const requiredStart = addDays(previousPhaseEnd, 1)
      const shiftDays = signedDurationDayDelta(earliestStart, requiredStart) ?? 0
      if (shiftDays > 0) {
        for (const row of rootRows) {
          shiftGeneratedRowAndDescendants(row, shiftDays, childRowsByParentId)
        }
        for (const row of phaseRows) {
          const metadata = readRowMetadata(row)
          row.values = {
            ...row.values,
            standard_task_metadata: {
              ...metadata,
              phaseChainSchedule: {
                source: 'generated_phase_chain',
                phaseId,
                adjusted: true,
                shiftDays,
                previousPhaseEnd,
                requiredStart,
              },
            },
          }
        }
      }
    }
    previousPhaseEnd = phaseRows
      .map(readGeneratedRowPlanEnd)
      .filter((date): date is string => Boolean(date))
      .sort(comparePlanDates)
      .at(-1) ?? previousPhaseEnd
  }
}

function getGeneratedRowPhaseId(row: GeneratedTemplateRow) {
  const metadata = readRowMetadata(row)
  return normalizeText(
    row.values.phase_object_id
      ?? metadata.phaseObjectId
      ?? metadata.phase_object_id,
  )
}

function getGeneratedRowsLatestEnd(rows: GeneratedTemplateRow[]) {
  return rows
    .map(readGeneratedRowPlanEnd)
    .filter((date): date is string => Boolean(date))
    .sort(comparePlanDates)
    .at(-1) ?? null
}

function getGeneratedRowsEarliestStart(rows: GeneratedTemplateRow[]) {
  return rows
    .map(readGeneratedRowPlanStart)
    .filter((date): date is string => Boolean(date))
    .sort(comparePlanDates)[0] ?? null
}

function buildGeneratedPhaseWindows(
  rows: GeneratedTemplateRow[],
  orderedPhaseIds: string[] = [],
): GeneratedPhaseWindow[] {
  const contract = buildDurationOutputContractSummary('phase_window')
  const rowsByPhaseId = new Map<string, GeneratedTemplateRow[]>()
  for (const row of rows) {
    const phaseId = getGeneratedRowPhaseId(row)
    if (!phaseId) continue
    rowsByPhaseId.set(phaseId, [...(rowsByPhaseId.get(phaseId) ?? []), row])
  }

  const phaseIds = uniqueStringArray([
    ...orderedPhaseIds,
    ...[...rowsByPhaseId.keys()],
  ])

  const phaseWindows: GeneratedPhaseWindow[] = []
  for (const phaseId of phaseIds) {
    const phaseRows = rowsByPhaseId.get(phaseId) ?? []
    if (phaseRows.length === 0) continue
    const plannedStartDate = getGeneratedRowsEarliestStart(phaseRows)
    const plannedEndDate = getGeneratedRowsLatestEnd(phaseRows)
    const durationBearingRowCount = phaseRows.filter((row) => {
      const metadata = readRowMetadata(row)
      const mode = normalizeDurationContributionMode(
        row.values.duration_contribution_mode ?? metadata.durationContributionMode ?? metadata.duration_contribution_mode,
      )
      return isDurationBearingContributionMode(mode)
    }).length

    phaseWindows.push({
      phaseId,
      plannedStartDate,
      plannedEndDate,
      phaseWindowDays: plannedStartDate && plannedEndDate
        ? daysInclusive(plannedStartDate, plannedEndDate)
        : null,
      rowCount: phaseRows.length,
      durationBearingRowCount,
      durationOutputCode: 'phase_window',
      durationOutputSemanticFieldName: contract?.semanticFieldName ?? 'phaseWindowDays',
      durationOutputContract: contract,
    })
  }
  return phaseWindows
}

function selectPhaseChainPredecessor(
  previousRows: GeneratedTemplateRow[],
  dependencyType: GeneratedTemplateDependency['dependencyType'],
) {
  const candidates = previousRows.filter(rowCanAnchorDependencyIntent)
  const fallbackCandidates = candidates.length > 0 ? candidates : previousRows
  if (fallbackCandidates.length === 0) return null

  if (dependencyType === 'SS' || dependencyType === 'SF') {
    return [...fallbackCandidates]
      .sort((left, right) => {
        const byStart = comparePlanDates(readGeneratedRowPlanStart(left), readGeneratedRowPlanStart(right))
        if (byStart) return byStart
        return generatedDependencyPriorityForRow(right) - generatedDependencyPriorityForRow(left)
      })[0]
  }

  return [...fallbackCandidates]
    .sort((left, right) => {
      const byEnd = comparePlanDates(readGeneratedRowPlanEnd(right), readGeneratedRowPlanEnd(left))
      if (byEnd) return byEnd
      return generatedDependencyPriorityForRow(right) - generatedDependencyPriorityForRow(left)
    })[0]
}

function readTargetConstraintContext(operation: PlanningTableOperation) {
  const clientContext = readRecord(operation.clientContext ?? operation.client_context)
  const targetEndDate = normalizeDate(
    clientContext.projectPlannedEndDate
      ?? clientContext.project_planned_end_date
      ?? clientContext.targetEndDate
      ?? clientContext.target_end_date
      ?? operation.projectPlannedEndDate
      ?? operation.project_planned_end_date
      ?? operation.targetEndDate
      ?? operation.target_end_date,
  )
  const rawMode = normalizeId(
    clientContext.targetConstraintMode
      ?? clientContext.target_constraint_mode
      ?? operation.targetConstraintMode
      ?? operation.target_constraint_mode,
  )
  const mode: GeneratedTargetFeasibility['mode'] = rawMode === 'compression_preview' || rawMode === 'reverse_cpm'
    ? rawMode
    : 'compare_only'
  return { targetEndDate, mode }
}

function evaluateTargetEndFeasibility(
  rows: GeneratedTemplateRow[],
  operation: PlanningTableOperation,
): GeneratedTargetFeasibility | undefined {
  const context = readTargetConstraintContext(operation)
  return evaluateBaselineTargetAlignment({
    rows,
    targetEndDate: context.targetEndDate,
    mode: context.mode as ScheduleAccelerationMode,
  })
}

function buildTargetEndGovernanceWarning(feasibility: GeneratedTargetFeasibility | undefined) {
  if (!feasibility || feasibility.overshootDays <= 0) return null
  return {
    code: 'TARGET_END_OVERSHOOT' as const,
    severity: 'warning' as const,
    nodeCode: 'PROJECT_TARGET_END',
    message: `?????? ${feasibility.naturalEndDate} ????????? ${feasibility.targetEndDate} ${feasibility.overshootDays} ?????????????????????????`,
    details: {
      mode: feasibility.mode,
      targetEndDate: feasibility.targetEndDate,
      naturalEndDate: feasibility.naturalEndDate,
      overshootDays: feasibility.overshootDays,
      recoverableDays: feasibility.recoverableDays,
      unrecoverableDays: feasibility.unrecoverableDays,
      verdict: feasibility.verdict,
    },
  } satisfies GeneratedTemplateGovernanceWarning
}

function getOperationFactProfile(operation: PlanningTableOperation) {
  return buildEngineeringFeatureProfile(readScopeCombos(
    readRecord(operation.scope),
    readOperationProjectFacts(operation),
  )[0] ?? {})
}

function readProjectPhaseScaleRatio(facts: EngineeringFeatureProfile) {
  const projectType = normalizeText(facts.projectTypeCode).toLowerCase()
  const scenarioProfile = readScenarioScheduleProfile(facts)
  const executionProfile = readExecutionProfileFromProjectFacts(facts)
  const hasLowRiseParallel = executionProfileHasArchetype(executionProfile, 'lowrise_multi_building_parallel')
    || isLowRiseMultiBuildingParallelProject(facts)
  const hasSteelAssembly = executionProfileHasArchetype(executionProfile, 'steel_assembly_fast_track')
  const hasMicModular = executionProfileHasArchetype(executionProfile, 'mic_modular_fast_track')
  const baselineArea = scenarioProfile.phaseScaleAreaBaselineM2
    || (projectType.includes('commercial') || projectType.includes('hospital') || projectType.includes('public')
      ? 90_000
      : projectType.includes('industrial')
        ? 80_000
        : 120_000)
  const baselineBuildings = 3
  const baselineFloors = projectType.includes('industrial') ? 6 : 26
  const totalArea = readOptionalNumber(facts.totalAreaM2)
  const buildingCount = readOptionalNumber(facts.buildingCount)
  const floorCount = readOptionalNumber(facts.standardFloorCount) ?? readOptionalNumber(facts.highestBuildingFloorCount)

  const areaRatio = totalArea && totalArea > 0 ? totalArea / baselineArea : 1
  const buildingRatio = buildingCount && buildingCount > 0 ? buildingCount / baselineBuildings : 1
  const floorRatio = floorCount && floorCount > 0 ? floorCount / baselineFloors : 1
  const buildingExponent = hasLowRiseParallel || hasSteelAssembly || hasMicModular
    ? Math.min(0.06, scenarioProfile.phaseScaleBuildingExponent)
    : scenarioProfile.phaseScaleBuildingExponent
  const floorExponent = hasLowRiseParallel
    ? Math.min(0.18, scenarioProfile.phaseScaleFloorExponent)
    : scenarioProfile.phaseScaleFloorExponent
  const weighted = Math.pow(areaRatio, 0.48) * Math.pow(buildingRatio, buildingExponent) * Math.pow(floorRatio, floorExponent)
  return clampNumber(weighted, 0.32, 2.6)
}

function scalePolicyForConstructionArchetype(
  policy: WbsTemplatePhaseReleasePolicy,
  operation: PlanningTableOperation,
  facts: EngineeringFeatureProfile,
  allowModeOverride: boolean,
) {
  const scenarioProfile = readScenarioScheduleProfile(facts)
  const executionProfile = readExecutionProfileFromProjectFacts(facts)
  const hasLowRiseParallel = executionProfileHasArchetype(executionProfile, 'lowrise_multi_building_parallel')
    || isLowRiseMultiBuildingParallelProject(facts)
  const hasPrefabSupplyChain = executionProfileHasArchetype(executionProfile, 'prefab_concrete_supply_chain')
  const hasSteelAssembly = executionProfileHasArchetype(executionProfile, 'steel_assembly_fast_track')
  const hasMicModular = executionProfileHasArchetype(executionProfile, 'mic_modular_fast_track')
  const hasDeepFoundationCompanion = scenarioProfile.recommendationPacks.includes('deep_foundation')
  const phaseId = readOperationPhaseId(operation).toLowerCase()
  const phaseKind = inferSchedulePhaseKindFromText(phaseId)
  const scaled: WbsTemplatePhaseReleasePolicy = { ...policy }
  const floorCount = Math.max(
    readOptionalNumber(facts.standardFloorCount) ?? 0,
    readOptionalNumber(facts.highestBuildingFloorCount) ?? 0,
  )
  const compactLowRiseParallel = hasLowRiseParallel && floorCount > 0 && floorCount <= 13

  if (
    allowModeOverride
    && hasDeepFoundationCompanion
    && (phaseId.includes('foundation') || phaseId.includes('basement') || phaseId.includes('pit'))
  ) {
    return { mode: 'overlap_after_days', afterDays: scenarioProfile.foundationReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.foundationReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
  }

  if (allowModeOverride && operationLooksPrefabFactorySupplyScope(operation)) {
    return { mode: 'parallel_group', dependencyType: 'SS', lagDays: 0 } satisfies WbsTemplatePhaseReleasePolicy
  }

  if (allowModeOverride && (
    scenarioProfile.dominantSchedulePattern === 'factory_parallel_site_assembly'
    || scenarioProfile.fastTrackIntensity === 'high'
  )) {
    if (phaseId.includes('factory') || phaseId.includes('module') || phaseId.includes('mic') || phaseId.includes('steel')) {
      return { mode: 'parallel_group', dependencyType: 'SS', lagDays: 0 } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (scaled.mode === 'strict_finish_start') {
      return { mode: 'overlap_after_days', afterDays: scenarioProfile.commissioningReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.commissioningReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
    }
  }

  if (allowModeOverride && (hasSteelAssembly || hasMicModular)) {
    if (phaseId.includes('factory') || phaseId.includes('module') || phaseId.includes('mic') || phaseId.includes('steel')) {
      return { mode: 'parallel_group', dependencyType: 'SS', lagDays: 0 } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseKind === 'mep') {
      return { mode: 'overlap_after_days', afterDays: 21, dependencyType: 'SS', lagDays: 21 } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseKind === 'finishing' || phaseKind === 'facade' || phaseKind === 'commissioning' || phaseKind === 'outdoor') {
      return { mode: 'overlap_after_days', afterDays: 14, dependencyType: 'SS', lagDays: 14 } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (scaled.mode === 'strict_finish_start') {
      return { mode: 'overlap_after_days', afterDays: 21, dependencyType: 'SS', lagDays: 21 } satisfies WbsTemplatePhaseReleasePolicy
    }
  }

  if (allowModeOverride && hasLowRiseParallel) {
    if (phaseKind === 'superstructure' || phaseKind === 'finishing' || phaseKind === 'facade') {
      const days = compactLowRiseParallel ? 24 : 30
      return { mode: 'overlap_after_days', afterDays: days, dependencyType: 'SS', lagDays: days } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseKind === 'mep') {
      const days = compactLowRiseParallel ? 28 : 35
      return { mode: 'overlap_after_days', afterDays: days, dependencyType: 'SS', lagDays: days } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseKind === 'commissioning' || phaseKind === 'outdoor') {
      const days = compactLowRiseParallel ? 28 : 35
      return { mode: 'overlap_after_days', afterDays: days, dependencyType: 'SS', lagDays: days } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (scaled.mode === 'strict_finish_start') {
      return { mode: 'overlap_after_percent', percent: 35, dependencyType: 'SS', lagDays: 0 } satisfies WbsTemplatePhaseReleasePolicy
    }
  }

  if (allowModeOverride && hasPrefabSupplyChain && operationLooksPrefabScope(operation)) {
    if (phaseId.includes('factory') || phaseId.includes('deepening') || phaseId.includes('production')) {
      return { mode: 'parallel_group', dependencyType: 'SS', lagDays: 0 } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseId.includes('site') || phaseId.includes('hoist') || phaseId.includes('prefab')) {
      return { mode: 'overlap_after_days', afterDays: 7, dependencyType: 'SS', lagDays: 7 } satisfies WbsTemplatePhaseReleasePolicy
    }
  }

  if (allowModeOverride && hasPrefabSupplyChain) {
    const prefabRate = normalizeRate01(facts.prefabRate) ?? 0
    const highRisePrefab = executionProfileHasArchetype(executionProfile, 'highrise_cast_in_place_tower') && !hasLowRiseParallel
    const releaseDays = prefabRate >= 0.6 ? 7 : 14
    if (highRisePrefab && prefabRate < 0.5) {
      if (phaseKind === 'mep') {
        return { mode: 'overlap_after_days', afterDays: scenarioProfile.mepReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.mepReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
      }
      if (phaseKind === 'finishing' || phaseKind === 'facade') {
        return { mode: 'overlap_after_days', afterDays: scenarioProfile.fitoutReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.fitoutReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
      }
      if (phaseKind === 'commissioning' || phaseKind === 'outdoor') {
        return { mode: 'overlap_after_days', afterDays: scenarioProfile.commissioningReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.commissioningReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
      }
    }
    if (phaseKind === 'mep') {
      return { mode: 'overlap_after_days', afterDays: releaseDays, dependencyType: 'SS', lagDays: releaseDays } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseKind === 'finishing' || phaseKind === 'facade' || phaseKind === 'commissioning' || phaseKind === 'outdoor') {
      return { mode: 'overlap_after_days', afterDays: Math.max(5, Math.round(releaseDays * 0.7)), dependencyType: 'SS', lagDays: Math.max(5, Math.round(releaseDays * 0.7)) } satisfies WbsTemplatePhaseReleasePolicy
    }
  }

  if (allowModeOverride) {
    if (phaseId.includes('mep') || phaseId.includes('electrical') || phaseId.includes('hvac') || phaseId.includes('mechanical')) {
      return { mode: 'overlap_after_days', afterDays: scenarioProfile.mepReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.mepReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseId.includes('finishing') || phaseId.includes('fitout') || phaseId.includes('decoration') || phaseId.includes('guestroom')) {
      if (scaled.mode === 'overlap_before_finish_days') return scaled
      return { mode: 'overlap_after_days', afterDays: scenarioProfile.fitoutReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.fitoutReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseId.includes('commission') || phaseId.includes('validation') || phaseId.includes('handover')) {
      if (scaled.mode === 'overlap_before_finish_days') return scaled
      return { mode: 'overlap_after_days', afterDays: scenarioProfile.commissioningReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.commissioningReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (phaseId.includes('outdoor')) {
      if (scaled.mode === 'overlap_before_finish_days') return scaled
      return { mode: 'overlap_after_days', afterDays: scenarioProfile.outdoorReleaseDays, dependencyType: 'SS', lagDays: scenarioProfile.outdoorReleaseDays } satisfies WbsTemplatePhaseReleasePolicy
    }
    if (scaled.mode === 'strict_finish_start' && scenarioProfile.strictInterfaceLagDays > 0) {
      return { mode: 'overlap_after_days', afterDays: scenarioProfile.strictInterfaceLagDays, dependencyType: 'SS', lagDays: scenarioProfile.strictInterfaceLagDays } satisfies WbsTemplatePhaseReleasePolicy
    }
  }

  return scaled
}

function scalePhaseReleasePolicyByProjectFacts(
  resolvedPolicy: ResolvedPhaseReleasePolicy,
  operation: PlanningTableOperation,
) {
  const policy = resolvedPolicy.policy
  if (resolvedPolicy.source !== 'inferred') {
    return { ...policy }
  }
  const facts = getOperationFactProfile(operation)
  const buildingCount = facts.buildingCount ?? null
  const prefabRate = facts.prefabRate ?? null
  const foundationDepth = facts.foundationDepthM ?? null
  const executionProfile = readExecutionProfileFromProjectFacts(facts)
  const hasLowRiseParallel = executionProfileHasArchetype(executionProfile, 'lowrise_multi_building_parallel')
    || isLowRiseMultiBuildingParallelProject(facts)
  const hasSteelAssembly = executionProfileHasArchetype(executionProfile, 'steel_assembly_fast_track')
  const hasMicModular = executionProfileHasArchetype(executionProfile, 'mic_modular_fast_track')
  const phaseScaleRatio = readProjectPhaseScaleRatio(facts)
  const scaled: WbsTemplatePhaseReleasePolicy = scalePolicyForConstructionArchetype(
    policy,
    operation,
    facts,
    true,
  )

  if (scaled.mode === 'parallel_group') {
    return scaled
  }

  if (scaled.mode === 'overlap_after_days' || scaled.mode === 'overlap_before_finish_days') {
    if (scaled.mode === 'overlap_after_days') {
      const releaseDelayFactor = clampNumber(Math.pow(phaseScaleRatio, 0.36), 0.55, 1.28)
      const minAfterDays = hasSteelAssembly || hasMicModular
        ? 3
        : hasLowRiseParallel
          ? 7
          : 14
      scaled.afterDays = Math.max(minAfterDays, Math.round(clampInteger(scaled.afterDays ?? policy.afterDays ?? scaled.lagDays ?? policy.lagDays, 0, 3650, 0) * releaseDelayFactor))
      scaled.lagDays = scaled.afterDays
    } else {
      const smallProjectCompression = phaseScaleRatio < 1
        ? 1 + ((1 - phaseScaleRatio) * 0.62)
        : 1
      const largeProjectWorkfaceOverlap = phaseScaleRatio > 1
        ? Math.pow(phaseScaleRatio, 0.16)
        : 1
      const overlapFactor = clampNumber(smallProjectCompression * largeProjectWorkfaceOverlap, 1, 1.35)
      scaled.beforeFinishDays = Math.max(7, Math.round(clampInteger(scaled.beforeFinishDays ?? policy.beforeFinishDays ?? scaled.lagDays ?? policy.lagDays, 0, 3650, 0) * overlapFactor))
      scaled.lagDays = scaled.beforeFinishDays
    }
  }

  if (
    scaled.mode === 'strict_finish_start'
    && buildingCount
    && buildingCount > 3
    && !hasLowRiseParallel
    && !hasSteelAssembly
    && !hasMicModular
  ) {
    scaled.lagDays = Math.max(clampInteger(policy.lagDays, -3650, 3650, 0), Math.min(45, (buildingCount - 3) * 7))
  }

  if (foundationDepth && foundationDepth > 8 && scaled.mode === 'overlap_before_finish_days') {
    scaled.beforeFinishDays = Math.max(7, Math.round(clampInteger(scaled.beforeFinishDays ?? policy.beforeFinishDays, 0, 3650, 0) * 0.85))
  }

  const normalizedPrefabRate = normalizeRate01(prefabRate)
  if (normalizedPrefabRate !== null && scaled.mode === 'overlap_after_days') {
    const prefabPhaseFactor = operationLooksPrefabScope(operation)
      ? clampNumber(1 + normalizedPrefabRate * 0.08, 1, 1.08)
      : clampNumber(1 - normalizedPrefabRate * 0.06, 0.88, 1)
    scaled.afterDays = Math.max(7, Math.round(clampInteger(scaled.afterDays ?? policy.afterDays, 0, 3650, 0) * prefabPhaseFactor))
    scaled.lagDays = scaled.afterDays
  }

  return scaled
}

function applyGeneratedPhaseChainDependencies(
  rows: GeneratedTemplateRow[],
  orderedPhaseIds: string[],
  releasePolicyByPhaseId: Map<string, WbsTemplatePhaseReleasePolicy> = new Map(),
) {
  const normalizedPhaseIds = uniqueStringArray(orderedPhaseIds.map(normalizeText).filter(Boolean))
  if (normalizedPhaseIds.length <= 1) return

  const rowsByPhaseId = new Map<string, GeneratedTemplateRow[]>()
  for (const row of rows) {
    const phaseId = getGeneratedRowPhaseId(row)
    if (!phaseId) continue
    rowsByPhaseId.set(phaseId, [...(rowsByPhaseId.get(phaseId) ?? []), row])
  }

  for (let index = 1; index < normalizedPhaseIds.length; index += 1) {
    const previousPhaseId = normalizedPhaseIds[index - 1]
    const currentPhaseId = normalizedPhaseIds[index]
    const previousRows = rowsByPhaseId.get(previousPhaseId) ?? []
    const currentRows = rowsByPhaseId.get(currentPhaseId) ?? []
    if (previousRows.length === 0 || currentRows.length === 0) continue

    const previousPhaseEnd = getGeneratedRowsLatestEnd(previousRows)
    const currentPhaseStart = getGeneratedRowsEarliestStart(currentRows)
    const releasePolicy = releasePolicyByPhaseId.get(currentPhaseId) ?? { mode: 'strict_finish_start', dependencyType: 'FS', lagDays: 0 }
    const phaseDependency = phaseReleasePolicyToDependency(releasePolicy)
    const predecessor = selectPhaseChainPredecessor(previousRows, phaseDependency.dependencyType)
    if (!predecessor) continue
    const successors = currentRows.filter((row) => (
      (!row.parentClientRowId || !currentRows.some((candidate) => candidate.clientRowId === row.parentClientRowId))
      && rowCanAnchorDependencyIntent(row)
    ))
    const dependencyTargets = successors.length > 0
      ? successors
      : [currentRows.find(rowCanAnchorDependencyIntent) ?? currentRows[0]].filter(Boolean) as GeneratedTemplateRow[]
    for (const successor of dependencyTargets) {
      addGeneratedDependency(successor, {
        clientRowId: predecessor.clientRowId,
        dependencyType: phaseDependency.dependencyType,
        lagDays: phaseDependency.lagDays,
        intentCode: `phase-chain:${previousPhaseId}->${currentPhaseId}`,
        relationRole: 'workflow',
        strength: releasePolicy.mode === 'strict_finish_start' ? 'recommended' : 'candidate',
        source: 'phase_chain',
      })
      const metadata = readRowMetadata(successor)
      successor.values = {
        ...successor.values,
        standard_task_metadata: {
          ...metadata,
          phaseChainDependency: {
            source: 'generated_phase_chain',
            previousPhaseId,
            currentPhaseId,
            predecessorClientRowId: predecessor.clientRowId,
            predecessorStableCode: readRowStableCode(predecessor),
            previousPhaseEnd,
            currentPhaseStart,
            releasePolicy,
            dependencyType: phaseDependency.dependencyType,
            lagDays: phaseDependency.lagDays,
          },
        },
      }
    }
  }
}

function generatedDependencyPriorityForRow(row: GeneratedTemplateRow) {
  const categoryType = readRowCategoryType(row)
  if (categoryType === 'item_work') return 4
  if (categoryType === 'process') return 3
  if (categoryType === 'sub_division') return 2
  if (categoryType === 'division') return 1
  return 0
}

function rebuildGeneratedDependencyNetwork(rows: GeneratedTemplateRow[]) {
  applyCrossItemWorkflowRules(rows)
  applyDependencyIntentTemplates(rows)
  pruneGeneratedHierarchySelfDependencies(rows)
  pruneGeneratedDependencyConflicts(rows)
  pruneGeneratedDependencyCycles(rows)
  applyGeneratedDependencySchedule(rows)
}

function buildProcessConstraintEffect(
  row: GeneratedTemplateRow,
  rule: GeneratedTemplateProcessConstraintRule,
): GeneratedTemplateProcessConstraintEffect {
  return {
    source: 'v1.4.7.4_process_constraint',
    sourceType: 'process_constraint',
    ruleCode: rule.stableCode,
    constraintType: rule.constraintType,
    applicationMode: rule.applicationMode,
    impactMode: rule.impactMode,
    runtimeActionPolicy: rule.runtimeActionPolicy,
    timeSourcePolicy: rule.timeSourcePolicy,
    relationInputPolicy: 'requires_existing_relation',
    dependencyCreationPolicy: 'never_create_dependency',
    durationDoubleCountPolicy: rule.durationDoubleCountPolicy,
    durationAuthorityPolicy: rule.durationAuthorityPolicy,
    scopeGranularity: rule.scopeGranularity || 'task',
    releaseQuantityPolicy: rule.releaseQuantityPolicy,
    minReleaseQuantityPercent: Number(rule.minReleaseQuantityPercent ?? 0) || 0,
    quantityEvidenceRequirement: rule.quantityEvidenceRequirement || 'not_applicable',
    quantityProxyRiskLevel: rule.quantityProxyRiskLevel || 'not_applicable',
    durationLookupKeys: [...(rule.durationLookupKeys ?? [])],
    carrierProcessHints: [...(rule.carrierProcessHints ?? [])],
    sourceStandard: rule.sourceStandard,
    sourceVersion: rule.sourceVersion,
    sourceClauseRef: rule.sourceClauseRef,
    confidence: rule.confidence,
    businessReason: `${row.values.title ?? readRowStableCode(row)} ?????? ${rule.sourceClauseRef || rule.stableCode}`,
  }
}

export function applyProcessConstraintEffects(rows: GeneratedTemplateRow[]) {
  for (const row of rows) {
    const metadata = readRowMetadata(row)
    const rules = readArray(metadata.processConstraintRules)
      .map((item) => readRecord(item) as GeneratedTemplateProcessConstraintRule)
      .filter((rule) => normalizeText(rule.stableCode))
    if (rules.length === 0) continue

    const effects = rules.map((rule) => buildProcessConstraintEffect(row, rule))
    const primary = effects[0]
    row.values = {
      ...row.values,
      standard_task_metadata: {
        ...metadata,
        processConstraintEffect: primary,
        processConstraintEffects: effects,
        durationContext: {
          ...(readRecord(metadata.durationContext)),
          source: 'v1.4.7.4_process_constraint',
          processConstraintRuleCount: effects.length,
          processConstraintRules: effects.map((effect) => ({
            ruleCode: effect.ruleCode,
            constraintType: effect.constraintType,
            applicationMode: effect.applicationMode,
            impactMode: effect.impactMode,
            scopeGranularity: effect.scopeGranularity,
            runtimeActionPolicy: effect.runtimeActionPolicy,
            durationDoubleCountPolicy: effect.durationDoubleCountPolicy,
          })),
          processConstraintPolicy: {
            createsDependency: false,
            requiresExistingRelation: true,
            userFacingFieldsAdded: false,
            durationDayAuthority: 'standard_work_duration_seed_or_project_fact',
          },
        },
      },
    }
  }
  return rows
}

function applyGeneratedRowPlanRollups(rows: GeneratedTemplateRow[]) {
  applyWbsPlanRollupToRows(rows, {
    getId: (row) => row.clientRowId,
    getParentId: (row) => row.parentClientRowId,
    getNodeType: (row) => normalizeText(row.values.wbs_node_type ?? row.values.category_type),
    getPlannedStartDate: (row) => row.values.planned_start_date ?? row.values.start_date,
    getPlannedEndDate: (row) => row.values.planned_end_date ?? row.values.end_date,
    getReferenceDuration: (row) => row.values.smart_reference_days,
    getDurationContributionMode: (row) => row.values.duration_contribution_mode ?? readRecord(row.values.standard_task_metadata).durationContributionMode,
    applyRollup: (row, rollup: WbsPlanRollupResult) => {
      const metadata = readRecord(row.values.standard_task_metadata)
      const protectedDurationBoundaryPolicy = normalizeParentDurationBoundaryPolicy(
        metadata.durationBoundaryPolicy
          ?? metadata.duration_boundary_policy
          ?? readRecord(row.values.duration_suggestion).parentDurationBoundaryPolicy,
      )
      const protectsParentWindow = isHardParentDurationBoundaryPolicy(protectedDurationBoundaryPolicy)
      row.values = {
        ...row.values,
        planned_start_date: protectsParentWindow ? row.values.planned_start_date : rollup.plannedStartDate,
        planned_end_date: protectsParentWindow ? row.values.planned_end_date : rollup.plannedEndDate,
        start_date: protectsParentWindow ? row.values.start_date : rollup.plannedStartDate,
        end_date: protectsParentWindow ? row.values.end_date : rollup.plannedEndDate,
        smart_reference_days: protectsParentWindow
          ? row.values.smart_reference_days
          : rollup.referenceDurationDays,
        standard_task_metadata: {
          ...metadata,
          planRollup: {
            source: rollup.rollupSource,
            appliedToPlanWindow: !protectsParentWindow,
            protectedByDurationBoundaryPolicy: protectsParentWindow ? protectedDurationBoundaryPolicy : null,
            plannedDurationDays: rollup.plannedDurationDays,
            referenceDurationDays: rollup.referenceDurationDays,
            referenceDurationPolicy: rollup.referenceDurationPolicy,
            childReferenceDurationTotal: rollup.childReferenceDurationTotal,
            childCount: rollup.childCount,
            diagnostics: rollup.diagnostics,
          },
        },
      }
      syncGeneratedRowDurationOutput(row)
    },
  })
}

function restorePackageRhythmWindowRows(rows: GeneratedTemplateRow[]) {
  const rowById = new Map(rows.map((row) => [row.clientRowId, row]))
  for (const row of rows) {
    const metadata = readRowMetadata(row)
    if (metadata.scheduleAuthorityPolicy !== 'package_child_rhythm_window') continue
    const parent = row.parentClientRowId ? rowById.get(row.parentClientRowId) ?? null : null
    const parentStart = parent ? readGeneratedRowPlanStart(parent) : null
    const suggestion = readRecord(row.values.duration_suggestion)
    const startDay = readPositiveNumber(row.values.package_child_rhythm_window_start_day ?? suggestion.packageChildRhythmWindowStartDay)
    const endDay = readPositiveNumber(row.values.package_child_rhythm_window_end_day ?? suggestion.packageChildRhythmWindowEndDay)
    if (!parentStart || !startDay || !endDay) continue
    const start = addDays(parentStart, startDay - 1)
    const end = addDays(parentStart, Math.max(startDay, endDay) - 1)
    row.values = {
      ...row.values,
      planned_start_date: start,
      planned_end_date: end,
      start_date: start,
      end_date: end,
    }
  }
}

function applyGeneratedRowTaskStructureGovernance(rows: GeneratedTemplateRow[]) {
  for (const row of rows) {
    const metadata = readRecord(row.values.standard_task_metadata)
    row.values = {
      ...row.values,
      standard_task_metadata: {
        ...metadata,
        taskStructureGovernance: buildWbsTaskStructureGovernanceMetadata({
          source: 'template_generate',
          rollupApplied: true,
          taskCodeFinalized: false,
          lineageExpected: true,
        }),
      },
    }
  }
}

function sanitizeGeneratedRowValuesForCreate(values: Record<string, unknown>) {
  const sanitized = { ...values }
  for (const field of TEMPLATE_GENERATION_FORBIDDEN_TASK_CODE_FIELDS) {
    delete sanitized[field]
  }
  const durationSuggestion = readGeneratedDurationSuggestion(sanitized.duration_suggestion)
  const durationContributionMode = normalizeDurationContributionMode(
    sanitized.duration_contribution_mode ?? readRecord(sanitized.standard_task_metadata).durationContributionMode,
  )
  if (isDurationBearingContributionMode(durationContributionMode) && !durationSuggestion) {
    const metadata = readRecord(sanitized.standard_task_metadata)
    sanitized.smart_reference_days = null
    sanitized.duration_suggestion = null
    sanitized.standard_task_metadata = {
      ...metadata,
      durationSuggestion: null,
    }
  }
  if (durationSuggestion && isDurationBearingContributionMode(durationContributionMode)) {
    const writablePlanTaskDurationDays = readWritablePlanTaskDurationDays(durationSuggestion)
    if (writablePlanTaskDurationDays == null) {
      const guardedSuggestion = withPlanReferenceDurationOutput(durationSuggestion) ?? durationSuggestion
      sanitized.smart_reference_days = null
      sanitized.duration_suggestion = buildGeneratedDurationSuggestionValue(
        guardedSuggestion,
        durationContributionMode,
      )
      const metadata = readRecord(sanitized.standard_task_metadata)
      sanitized.standard_task_metadata = {
        ...metadata,
        durationSuggestion: sanitized.duration_suggestion,
      }
    } else {
      sanitized.smart_reference_days = writablePlanTaskDurationDays
      sanitized.duration_suggestion = buildGeneratedDurationSuggestionValue(
        durationSuggestion,
        durationContributionMode,
      )
      const metadata = readRecord(sanitized.standard_task_metadata)
      sanitized.standard_task_metadata = {
        ...metadata,
        durationSuggestion: sanitized.duration_suggestion,
      }
    }
  }
  return sanitized
}

function sanitizeGeneratedTemplateRowForPublicOutput(row: GeneratedTemplateRow): GeneratedTemplateRow {
  const durationContributionMode = normalizeDurationContributionMode(
    row.values.duration_contribution_mode
      ?? readRecord(row.values.standard_task_metadata).durationContributionMode,
  )
  const sourceSuggestion = row.durationSuggestion
    ?? readGeneratedDurationSuggestion(row.values.duration_suggestion)
  const publicSuggestion = buildGeneratedDurationSuggestionValue(sourceSuggestion, durationContributionMode)
  const metadata = readRecord(row.values.standard_task_metadata)
  const values = {
    ...row.values,
    duration_suggestion: publicSuggestion,
    standard_task_metadata: {
      ...metadata,
      durationSuggestion: publicSuggestion,
    },
  }
  return {
    ...row,
    values,
    durationSuggestion: publicSuggestion as unknown as GeneratedTemplateDurationSuggestion | null,
  }
}

function sanitizeGeneratedTemplateRowsForPublicOutput(rows: GeneratedTemplateRow[]) {
  return rows.map(sanitizeGeneratedTemplateRowForPublicOutput)
}

async function generateWbsTemplateRowsInternal(params: {
  projectId: string
  operation: PlanningTableOperation
  surface: PlanningSurface
  // v1.4.22.1: wizard integration extensions
  detailLevel?: 'overview' | 'standard' | 'detailed'
  onboardingSubstage?: string | null
  onboardingBatchId?: string | null
  scopeAssignmentRules?: Array<{
    itemPackPattern: string
    effect: string
    functionalAreaCategory?: string
    matchFunctionalUsage?: string
    targetObjectType?: string
    target_object_type?: string
    matchMetadata?: Record<string, unknown>
    match_metadata?: Record<string, unknown>
    matchObjectName?: string
    match_object_name?: string
    priority: number
  }> | null
  duplicatePolicy?: 'preserve_historical_skip_future'
  diagnosticDurationSuggestionMode?: WbsTemplateDurationSuggestionMode
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
  runtimeArtifactPublications?: readonly WbsTemplateGenerationRuntimeArtifactPublication[] | null
  runtimeConsumerObservedAt?: string | null
  runtimeConsumerErrorHandler?: (error: unknown) => void
}): Promise<{
  generationBatchId: string
  templateId: string
  templateIds: string[]
  generationDepth: WbsTemplateGenerationDepth
  rows: GeneratedTemplateRow[]
  scopeCombos: WbsTemplateScope[]
  rowLimit: number
  rowLimitPolicy: WbsTemplateGenerationRowLimitPolicy
  splitByPhaseApplied: boolean
  generationBatches: GeneratedTemplateBatch[]
  suppressedCoreQualityCodes: string[]
  governanceWarnings: GeneratedTemplateGovernanceWarning[]
  targetFeasibility?: GeneratedTargetFeasibility
  phaseWindows: GeneratedPhaseWindow[]
  // v1.4.22.1: onboarding classification summary
  onboardingSummary?: { history: number; in_progress: number; future: number }
}> {
  if (params.surface === 'monthly_plan') {
    throw Object.assign(new Error('月度计划不能直接从分部分项模板生成，只能从任务列表或基线继承'), {
      statusCode: 400,
      code: 'TEMPLATE_GENERATE_NOT_ALLOWED_ON_MONTHLY_PLAN',
    })
  }

  const operation = params.operation
  const diagnosticStageTimings = operation.diagnosticStageTimings === true || operation.diagnostic_stage_timings === true
  const diagnosticTimingStart = Date.now()
  let diagnosticTimingLast = diagnosticTimingStart
  const logDiagnosticStageTiming = (stage: string, details: Record<string, unknown> = {}) => {
    if (!diagnosticStageTimings) return
    const now = Date.now()
    console.error(JSON.stringify({
      source: 'wbs_template_generation_stage_timing',
      generationBatchId: normalizeText(operation.generationBatchId ?? operation.generation_batch_id) || null,
      stage,
      elapsedMs: now - diagnosticTimingStart,
      deltaMs: now - diagnosticTimingLast,
      ...details,
    }))
    diagnosticTimingLast = now
  }
  const templateIds = readTemplateIds(operation)
  if (templateIds.length === 0) {
    throw Object.assign(new Error('template_generate 必须携带 templateId'), {
      statusCode: 400,
      code: 'TEMPLATE_ID_REQUIRED',
    })
  }

  const templateSelections: Array<{ templateId: string; selectedNodes: TemplateNode[] }> = []
  for (const templateId of templateIds) {
    const roots = await loadWbsTemplateNodes(templateId)
    const selectedNodeIds = readSelectedNodeIdsForTemplate(operation, templateId)
    const catalog = getBuiltInTemplateCatalog(templateId)
    const selectedNodes = selectedNodeIds.length === 0
      && catalog
      && getCatalogPackType(catalog) === 'danger_control'
      && getCatalogGroupSelectionMode(operation, 'danger_control') === 'auto_by_trigger'
      ? selectAutoTriggeredDangerNodes(roots, operation)
      : selectTemplateNodes(roots, selectedNodeIds)
    if (selectedNodes.length === 0) {
      throw Object.assign(new Error('所选模板节点不存在或已停用'), {
        statusCode: 404,
        code: 'TEMPLATE_NODE_NOT_FOUND',
      })
    }
    templateSelections.push({ templateId, selectedNodes })
  }
  logDiagnosticStageTiming('template_selections_loaded', {
    templateCount: templateSelections.length,
    selectedRootCount: templateSelections.reduce((sum, selection) => sum + selection.selectedNodes.length, 0),
  })

  const projectFacts = readOperationProjectFacts(operation)
  const projectGenerationFactsSnapshot = buildProjectGenerationFactsSnapshot(projectFacts)
  await persistProjectGenerationFactsSnapshot({
    projectId: params.projectId,
    facts: projectGenerationFactsSnapshot,
    source: 'wbs_template_generation',
  }).catch((error) => {
    logger.warn('[wbsTemplateGenerationService] failed to persist project generation facts snapshot', {
      projectId: params.projectId,
      error,
    })
  })
  const scopeCombos = readScopeCombos(operation.scope, projectFacts)
  const templateSelectionsWithIndex = templateSelections.map((selection, templateIndex) => ({ ...selection, templateIndex }))
  const selectedTemplateIdsForBranch = uniqueStringArray(templateIds.map((templateId) => normalizeText(templateId).toLowerCase()).filter(Boolean))
  for (const scope of scopeCombos) {
    scope.selected_template_ids = uniqueStringArray([
      ...(scope.selected_template_ids ?? []),
      ...selectedTemplateIdsForBranch,
    ])
  }
  const generationScopeContexts = buildGenerationScopeContexts(templateSelectionsWithIndex, scopeCombos)
  const generationScopeCombos = generationScopeContexts.map((context) => context.scope)
  logDiagnosticStageTiming('scope_contexts_built', {
    scopeComboCount: scopeCombos.length,
    generationScopeContextCount: generationScopeContexts.length,
  })
  if (params.surface === 'task_list' && !scopeCombos.some(hasAnyScope) && !isProjectScopeMode(operation.scope)) {
    throw Object.assign(new Error('Task-list template generation requires at least one engineering object scope.'), {
      statusCode: 400,
      code: 'SCOPE_OBJECT_REQUIRED',
    })
  }

  const generationBatchId = normalizeText(operation.generationBatchId) || randomUUID()
  const attachUnderRowId = normalizeId(operation.attachUnderRowId)
  const startDate = readGenerationStartDate(operation)
  const generationDepth = readGenerationDepth({
    ...operation,
    detailLevel: operation.detailLevel ?? operation.detail_level ?? params.detailLevel,
  })
  const durationSuggestionMode: WbsTemplateDurationSuggestionMode = params.diagnosticDurationSuggestionMode ?? 'full'
  const replacementCodes = collectCoreReplacementCodes(templateSelections.flatMap((selection) => selection.selectedNodes), scopeCombos)
  const scopeStartDateByIndex = buildScopeStartDateByIndex({
    selectedNodes: templateSelections.flatMap((selection) => selection.selectedNodes),
    scopeCombos: generationScopeCombos,
    startDate,
  })
  const totalRowCountsByScope = generationScopeContexts.map((context) => context.templateSelections.reduce((templateCount, selection) => (
    templateCount + selection.selectedNodes.reduce((sum, node) => (
      sum + countGeneratedRowsForNode(node, generationDepth, context.scope, replacementCodes)
    ), 0)
  ), 0))
  const mainPlanRowCountsByScope = generationScopeContexts.map((context) => context.templateSelections.reduce((templateCount, selection) => (
    templateCount + selection.selectedNodes.reduce((sum, node) => (
      sum + countGeneratedMainPlanRowsForNode(node, generationDepth, context.scope, replacementCodes)
    ), 0)
  ), 0))
  const generatedRowCount = totalRowCountsByScope.reduce((sum, count) => sum + count, 0)
  const generatedMainPlanRowCount = mainPlanRowCountsByScope.reduce((sum, count) => sum + count, 0)
  logDiagnosticStageTiming('row_counts_estimated', {
    generatedRowCount,
    generatedMainPlanRowCount,
  })
  const preflightBatchPlan = buildGenerationBatches({
    generationBatchId,
    templateIds,
    scopeCombos: generationScopeCombos,
    rowCountsByScope: mainPlanRowCountsByScope,
    totalRowCountsByScope,
    rows: [],
  })
  const suggestionByNodeKey = await buildDurationSuggestionMap({
    projectId: params.projectId,
    selectedNodes: templateSelections.flatMap((selection) => selection.selectedNodes),
    scopeCombos: generationScopeCombos,
    generationDepth,
    durationSuggestionMode,
    plannedStartDate: startDate,
    scopeStartDateByIndex,
  })
  logDiagnosticStageTiming('duration_suggestions_built', {
    durationSuggestionMode,
    suggestionCount: suggestionByNodeKey.size,
  })
  let rows: GeneratedTemplateRow[] = []
  const sortCursor = { value: Number(operation.sortOrder ?? 0) || 0 }

  generationScopeContexts.forEach(({ scope, templateSelections: contextSelections }, scopeIndex) => {
    const predecessorByParent = new Map<string, PreviousInternalFlowSibling[]>()
    contextSelections.forEach((selection) => {
      selection.selectedNodes.forEach((node) => {
        const scopedBatchId = [
          generationBatchId,
          templateSelections.length > 1 ? `template-${selection.templateIndex + 1}` : null,
          generationScopeCombos.length > 1 ? `scope-${scopeIndex + 1}` : null,
        ].filter(Boolean).join(':')
        buildGeneratedRowsForNode({
          node,
          scope,
          parentClientRowId: null,
          parentRowId: attachUnderRowId,
          attachUnderRowId,
          batchId: scopedBatchId,
          sortCursor,
          startDate: scopeStartDateByIndex.get(scopeIndex) ?? startDate,
          generationDepth,
          scopeIndex,
          suggestionByNodeKey,
          predecessorByParent,
          rows,
        })
      })
    })
  })
  logDiagnosticStageTiming('rows_built', {
    rowCount: rows.length,
  })

  const suppressedCoreQualityCodes = uniqueStringArray(
    rows
      .filter((row) => rowIsSuppressedByCoreReplacement(row, replacementCodes))
      .map((row) => readRowStableCode(row)),
  )
  rows = suppressCoreRowsReplacedBySpecialty(rows, replacementCodes)
  rows = applyScopeAssignmentRules(rows, params.scopeAssignmentRules, operation)
  applyScopeObjectLineage(rows, operation)
  logDiagnosticStageTiming('rows_post_processed', {
    rowCount: rows.length,
  })

  const batchPlan = buildGenerationBatches({
    generationBatchId,
    templateIds,
    scopeCombos: generationScopeCombos,
    rowCountsByScope: mainPlanRowCountsByScope,
    totalRowCountsByScope,
    rows,
  })
  const rowProjectionCounts = countRowProjectionModes(rows)
  const mainPlanRowCount = rowProjectionCounts.schedule_row
  logDiagnosticStageTiming('batch_plan_built', {
    mainPlanRowCount,
    rowLimitPolicy: batchPlan.rowLimitPolicy,
  })

  applyCrossItemWorkflowRules(rows)
  logDiagnosticStageTiming('cross_item_workflow_applied')
  applyDependencyIntentTemplates(rows)
  logDiagnosticStageTiming('dependency_intents_applied')
  pruneGeneratedHierarchySelfDependencies(rows)
  logDiagnosticStageTiming('dependency_hierarchy_self_dependencies_pruned_first')
  pruneGeneratedDependencyConflicts(rows)
  logDiagnosticStageTiming('dependency_conflicts_pruned_first')
  pruneGeneratedDependencyCycles(rows)
  logDiagnosticStageTiming('dependency_cycles_pruned_first')
  applyGeneratedPhaseChainDependencies(
    rows,
    generationScopeCombos.map((scope) => normalizeText(scope.phase_object_id)).filter(Boolean),
  )
  logDiagnosticStageTiming('phase_chain_dependencies_applied')
  pruneGeneratedHierarchySelfDependencies(rows)
  logDiagnosticStageTiming('dependency_hierarchy_self_dependencies_pruned_second')
  pruneGeneratedDependencyConflicts(rows)
  logDiagnosticStageTiming('dependency_conflicts_pruned_second')
  pruneGeneratedDependencyCycles(rows)
  logDiagnosticStageTiming('dependency_cycles_pruned_second')
  applyGeneratedPhaseChainSchedule(rows, generationScopeCombos)
  logDiagnosticStageTiming('phase_chain_schedule_applied')
  const dependencyScheduleWarning = applyGeneratedDependencySchedule(rows)
  logDiagnosticStageTiming('dependency_schedule_applied')
  applyProcessConstraintEffects(rows)
  logDiagnosticStageTiming('process_constraints_applied')
  const targetFeasibility = evaluateTargetEndFeasibility(rows, operation)
  const targetEndWarning = buildTargetEndGovernanceWarning(targetFeasibility)
  const governanceWarnings = [
    ...collectGeneratedTemplateGovernanceWarnings(rows),
    ...collectScopeAssignmentMissingTargetWarnings(rows, params.scopeAssignmentRules, operation),
    ...(dependencyScheduleWarning ? [dependencyScheduleWarning] : []),
    ...(targetEndWarning ? [targetEndWarning] : []),
  ]
  applyGeneratedRowPlanRollups(rows)
  logDiagnosticStageTiming('plan_rollups_applied_first')
  restorePackageRhythmWindowRows(rows)
  logDiagnosticStageTiming('package_rhythm_windows_restored')
  applyGeneratedRowPlanRollups(rows)
  logDiagnosticStageTiming('plan_rollups_applied_second')
  applyGeneratedRowTaskStructureGovernance(rows)
  logDiagnosticStageTiming('task_structure_governance_applied')
  const phaseWindows = buildGeneratedPhaseWindows(
    rows,
    generationScopeCombos.map((scope) => normalizeText(scope.phase_object_id)).filter(Boolean),
  )
  logDiagnosticStageTiming('phase_windows_built')

  // v1.4.7.3 §13.1: write lineage for each generated row
  for (const row of rows) {
    row.values = {
      ...(row.values as Record<string, unknown>),
      source_template_id: row.values.source_template_id ?? row.values.template_id ?? templateIds[0],
      generation_batch_id: generationBatchId,
    }
  }

  // v1.4.22.1: onboarding classification summary from row values
  const onboardingSummary = params.onboardingSubstage
    ? { history: rows.filter(r => (r.values.onboarding_stage_classification as string) === 'history').length,
        in_progress: rows.filter(r => (r.values.onboarding_stage_classification as string) === 'in_progress').length,
        future: rows.filter(r => !r.values.onboarding_stage_classification || (r.values.onboarding_stage_classification as string) === 'future').length }
    : undefined

  return {
    generationBatchId,
    templateId: templateIds[0],
    templateIds,
    generationDepth,
    rows,
    scopeCombos: generationScopeCombos,
    rowLimit: WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
    rowLimitPolicy: batchPlan.rowLimitPolicy,
    splitByPhaseApplied: batchPlan.splitByPhaseApplied,
    generationBatches: batchPlan.generationBatches,
    suppressedCoreQualityCodes,
    governanceWarnings,
    targetFeasibility,
    phaseWindows,
    onboardingSummary,
  }
}

export async function generateWbsTemplateRows(
  params: Parameters<typeof generateWbsTemplateRowsInternal>[0],
): Promise<Awaited<ReturnType<typeof generateWbsTemplateRowsInternal>>> {
  const generated = await generateWbsTemplateRowsInternal(params)
  const publicGenerated = {
    ...generated,
    rows: sanitizeGeneratedTemplateRowsForPublicOutput(generated.rows),
  }

  const runtimeArtifactPublications = params.runtimeArtifactPublications ?? []
  if (params.runtimeConsumerObservationQueryExec && runtimeArtifactPublications.length > 0) {
    const templateIds = uniqueStringArray([
      normalizeText(generated.templateId),
      ...generated.templateIds.map(normalizeText),
    ].filter(Boolean))
    try {
      await recordWbsTemplateGenerationConsumedArtifacts({
        queryExec: params.runtimeConsumerObservationQueryExec,
        observedAt: normalizeText(params.runtimeConsumerObservedAt) || undefined,
        callContext: {
          projectId: normalizeText(params.projectId) || null,
          generationBatchId: normalizeText(generated.generationBatchId) || null,
          templateId: templateIds[0] ?? null,
          templateIds,
          generationDepth: generated.generationDepth,
          rowCount: generated.rows.length,
        },
        sourceEvidenceRefs: [
          [
            'wbs_template_generation',
            normalizeText(params.projectId) || 'no_project',
            normalizeText(generated.generationBatchId) || 'no_batch',
            templateIds.join('+') || 'no_template',
          ].join(':'),
        ],
        artifacts: buildWbsTemplateGenerationConsumedArtifacts({
          generation: generated,
          runtimeArtifactPublications,
          projectId: params.projectId,
        }),
      })
    } catch (error) {
      if (params.runtimeConsumerErrorHandler) {
        params.runtimeConsumerErrorHandler(error)
      } else {
        logger.warn('[wbsTemplateGenerationService] failed to record WBS template runtime consumer evidence', {
          projectId: params.projectId,
          generationBatchId: generated.generationBatchId,
          templateIds,
          error,
        })
      }
    }
  }

  return publicGenerated
}

export async function generateWbsTemplatePhaseChainRows(params: {
  projectId: string
  surface: PlanningSurface
  operations: PlanningTableOperation[]
  chainMode?: 'sequential' | 'none'
  detailLevel?: 'overview' | 'standard' | 'detailed'
  diagnosticDurationSuggestionMode?: WbsTemplateDurationSuggestionMode
  phaseReleasePolicies?: Record<string, unknown> | Array<Record<string, unknown>> | null
}): Promise<{
  generationBatchId: string
  templateId: string
  templateIds: string[]
  generationDepth: WbsTemplateGenerationDepth
  rows: GeneratedTemplateRow[]
  scopeCombos: WbsTemplateScope[]
  rowLimit: number
  rowLimitPolicy: WbsTemplateGenerationRowLimitPolicy
  splitByPhaseApplied: boolean
  generationBatches: GeneratedTemplateBatch[]
  suppressedCoreQualityCodes: string[]
  governanceWarnings: GeneratedTemplateGovernanceWarning[]
  targetFeasibility?: GeneratedTargetFeasibility
  phaseWindows: GeneratedPhaseWindow[]
}> {
  const operations = params.operations.filter((operation) => normalizeText(operation.type ?? operation.op) === 'template_generate')
  if (operations.length === 0) {
    throw Object.assign(new Error('phase chain generation requires at least one template_generate operation'), {
      statusCode: 400,
      code: 'TEMPLATE_PHASE_CHAIN_OPERATION_REQUIRED',
    })
  }

  const chainMode = params.chainMode ?? 'sequential'
  const phaseResults: Awaited<ReturnType<typeof generateWbsTemplateRowsInternal>>[] = []
  const releasePolicyByPhaseId = new Map<string, WbsTemplatePhaseReleasePolicy>()
  const criticalChainPhaseIds: string[] = []
  const explicitReleasePolicies = buildExplicitPhaseReleasePolicyMap(params.phaseReleasePolicies)
  let projectStartDate: string | null = null
  let previousPhaseStart: string | null = null
  let previousPhaseEnd: string | null = null
  let previousPhaseDurationDays = 0
  for (const [index, operation] of operations.entries()) {
    const requestedStartDate = readGenerationStartDate(operation)
    projectStartDate = projectStartDate ?? requestedStartDate
    const releasePolicy = scalePhaseReleasePolicyByProjectFacts(
      resolvePhaseReleasePolicy(operation, index, explicitReleasePolicies),
      operation,
    )
    const operationStartDate = chainMode === 'sequential' && index > 0
      ? computePhaseReleaseStartDate({
        projectStartDate,
        previousStartDate: previousPhaseStart,
        previousEndDate: previousPhaseEnd,
        previousDurationDays: previousPhaseDurationDays,
        policy: releasePolicy,
      })
      : requestedStartDate
    const generated = await generateWbsTemplateRowsInternal({
      projectId: params.projectId,
      surface: params.surface,
      operation: {
        ...operation,
        generationBatchId: normalizeText(operation.generationBatchId) || `phase-chain:${index + 1}`,
        plannedStartDate: operationStartDate,
        startDate: operationStartDate,
      },
      detailLevel: params.detailLevel,
      diagnosticDurationSuggestionMode: params.diagnosticDurationSuggestionMode,
      scopeAssignmentRules: readScopeAssignmentRulesFromOperation(operation),
    })
    phaseResults.push(generated)
    const phaseIds = uniqueStringArray(generated.scopeCombos.map((scope) => normalizeText(scope.phase_object_id)).filter(Boolean))
    for (const phaseId of phaseIds) releasePolicyByPhaseId.set(phaseId, releasePolicy)
    if (chainMode === 'sequential' && releasePolicy.mode !== 'parallel_group') {
      const latestEnd = generated.rows
        .map(readGeneratedRowPlanEnd)
        .filter((date): date is string => Boolean(date))
        .sort(comparePlanDates)
        .at(-1)
      previousPhaseStart = operationStartDate
      previousPhaseEnd = latestEnd ?? operationStartDate
      previousPhaseDurationDays = daysInclusive(previousPhaseStart, previousPhaseEnd)
      criticalChainPhaseIds.push(...phaseIds)
    }
  }

  const rows = phaseResults.flatMap((result) => result.rows)
  applyGeneratedPhaseChainDependencies(
    rows,
    chainMode === 'sequential'
      ? criticalChainPhaseIds
      : [],
    releasePolicyByPhaseId,
  )
  rebuildGeneratedDependencyNetwork(rows)
  applyProcessConstraintEffects(rows)
  const targetOperation = operations.find((operation) => readTargetConstraintContext(operation).targetEndDate) ?? operations[0]
  const targetFeasibility = targetOperation
    ? evaluateTargetEndFeasibility(rows, targetOperation)
    : undefined
  const targetEndWarning = buildTargetEndGovernanceWarning(targetFeasibility)
  const governanceWarnings = [
    ...phaseResults.flatMap((result) => result.governanceWarnings.filter((warning) => warning.code !== 'TARGET_END_OVERSHOOT')),
    ...collectGeneratedTemplateGovernanceWarnings(rows),
    ...operations.flatMap((phaseOperation) => (
      collectScopeAssignmentMissingTargetWarnings(rows, readScopeAssignmentRulesFromOperation(phaseOperation), phaseOperation)
    )),
    ...(targetEndWarning ? [targetEndWarning] : []),
  ]
  applyGeneratedRowPlanRollups(rows)
  applyGeneratedRowTaskStructureGovernance(rows)
  const phaseWindows = buildGeneratedPhaseWindows(
    rows,
    chainMode === 'sequential'
      ? criticalChainPhaseIds
      : phaseResults.flatMap((result) => result.scopeCombos).map((scope) => normalizeText(scope.phase_object_id)).filter(Boolean),
  )

  const generationBatchId = normalizeText(operations[0]?.generationBatchId) || phaseResults[0]?.generationBatchId || randomUUID()
  const templateIds = uniqueStringArray(phaseResults.flatMap((result) => result.templateIds))
  const scopeCombos = phaseResults.flatMap((result) => result.scopeCombos)
  const generationBatches = phaseResults.flatMap((result, phaseIndex) => result.generationBatches.map((batch) => ({
    ...batch,
    batchId: `${generationBatchId}:phase-chain-${phaseIndex + 1}:${batch.batchId}`,
  })))
  return {
    generationBatchId,
    templateId: templateIds[0] ?? phaseResults[0]?.templateId ?? '',
    templateIds,
    generationDepth: phaseResults[0]?.generationDepth ?? 'item_work',
    rows: sanitizeGeneratedTemplateRowsForPublicOutput(rows),
    scopeCombos,
    rowLimit: WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
    rowLimitPolicy: generationBatches.length > 1 ? 'split_by_phase' : 'single_batch',
    splitByPhaseApplied: generationBatches.length > 1 || phaseResults.some((result) => result.splitByPhaseApplied),
    generationBatches,
    suppressedCoreQualityCodes: uniqueStringArray(phaseResults.flatMap((result) => result.suppressedCoreQualityCodes)),
    governanceWarnings,
    targetFeasibility,
    phaseWindows,
  }
}

export async function listWbsTemplateCatalog(options: { includeNodes?: boolean; projectIds?: string[] | null; companyId?: string | null } = {}): Promise<WbsTemplateCatalogResponse> {
  const includeNodes = Boolean(options.includeNodes)
  void options.projectIds
  void options.companyId

  const mainBuiltInNodes = includeNodes
    ? getSerializedBuiltInTemplateNodes(CHINA_GB55032_TEMPLATE_CATALOG)
    : undefined
  const mainBuiltInEvidenceSummary = buildEvidenceSummaryFromCatalog(CHINA_GB55032_TEMPLATE_CATALOG)
  const builtInTemplates = BUILT_IN_WBS_TEMPLATE_CATALOGS.map((catalog) => (
    buildBuiltInTemplateCatalogItem(catalog, {
      includeNodes: includeNodes && catalog.templateId !== CHINA_GB55032_TEMPLATE_ID,
    })
  ))

  return {
    builtIn: {
      templateId: CHINA_GB55032_TEMPLATE_CATALOG.templateId,
      templateCode: CHINA_GB55032_TEMPLATE_CATALOG.templateCode,
      templateName: CHINA_GB55032_TEMPLATE_CATALOG.templateName,
      sourceStandard: CHINA_GB55032_TEMPLATE_CATALOG.sourceStandard,
      sourceVersion: CHINA_GB55032_TEMPLATE_CATALOG.sourceVersion,
      divisionCount: CHINA_GB55032_TEMPLATE_CATALOG.divisions.length,
      nodeCount: flattenChinaTemplateCatalog().length,
      packType: getCatalogPackType(CHINA_GB55032_TEMPLATE_CATALOG),
      templateGroup: getCatalogTemplateGroup(CHINA_GB55032_TEMPLATE_CATALOG),
      generationPolicy: getCatalogGenerationPolicy(CHINA_GB55032_TEMPLATE_CATALOG),
      evidenceSummary: mainBuiltInEvidenceSummary,
      nodes: mainBuiltInNodes,
    },
    templates: builtInTemplates,
  }
}

export async function getWbsTemplateCatalogItem(templateId: string): Promise<WbsTemplateCatalogItem> {
  const catalog = getBuiltInTemplateCatalog(templateId)
  if (catalog) return buildBuiltInTemplateCatalogItem(catalog, { includeNodes: true })

  throw buildTemplateCatalogNotFoundError(templateId)
}

export function validateChinaGb50300Seed(options: { strict?: boolean } = {}): WbsTemplateSeedValidationResult {
  const nodes = flattenChinaTemplateCatalog()
  const issues: WbsTemplateSeedValidationResult['issues'] = []
  const catalogGroupCounts = Object.fromEntries(
    WBS_TEMPLATE_CATALOG_GROUPS.map((group) => [
      group,
      BUILT_IN_WBS_TEMPLATE_CATALOGS.filter((catalog) => getCatalogPackType(catalog) === group).length,
    ]),
  ) as Record<WbsTemplateCatalogGroup, number>

  const divisionCount = nodes.filter((node) => node.categoryType === 'division').length
  const subDivisionCount = nodes.filter((node) => node.categoryType === 'sub_division').length
  const itemWorkCount = nodes.filter((node) => node.categoryType === 'item_work').length
  const processCount = nodes.filter((node) => node.categoryType === 'process').length
  const activityStepCount = nodes.filter((node) => node.categoryType === 'activity_step').length
  const reviewNeededCount = nodes.filter((node) => node.reviewNeeded).length
  const webVerifiedFalseCount = nodes.filter((node) => node.webVerified === false).length
  const processNodes = nodes.filter((node) => node.categoryType === 'process')
  const activityStepNodes = nodes.filter((node) => node.categoryType === 'activity_step')
  const disciplineProcessCount = processNodes.filter((node) => readRecord(node.metadata).processPackLevel === 'discipline_package').length
  const genericFallbackProcessCount = processNodes.filter((node) => readRecord(node.metadata).processPackLevel === 'generic_fallback').length
  const disciplineActivityStepCount = activityStepNodes.filter((node) => readRecord(node.metadata).activityStepSource === 'discipline_activity_step_pack').length
  const genericActivityStepCount = activityStepNodes.filter((node) => readRecord(node.metadata).activityStepSource === 'generic_checklist').length
  const uniqueProcessNameCount = new Set(processNodes.map((node) => node.name)).size
  const uniqueActivityStepNameCount = new Set(activityStepNodes.map((node) => node.name)).size

  if (divisionCount !== 10) {
    issues.push({ code: 'DIVISION_COUNT_INVALID', severity: 'error', message: 'The national standard catalog must contain exactly 10 divisions.' })
  }

  if (genericFallbackProcessCount > 0 || genericActivityStepCount > 0) {
    issues.push({
      code: 'GENERIC_FALLBACK_REMAINS',
      severity: 'error',
      message: 'The formal built-in seed must not retain generic fallback processes or generic checklist activity steps.',
    })
  }

  const allCatalogNodes = BUILT_IN_WBS_TEMPLATE_CATALOGS.flatMap((catalog) => flattenCatalogNodes(catalog.divisions).map((node) => ({
    catalog,
    node,
  })))
  const stableCodeCounts = new Map<string, number>()
  allCatalogNodes.forEach(({ node }) => {
    const code = normalizeText(node.stableCode)
    if (code) stableCodeCounts.set(code, (stableCodeCounts.get(code) ?? 0) + 1)
  })
  for (const [stableCode, count] of stableCodeCounts) {
    if (count > 1) {
      issues.push({
        code: 'CATALOG_STABLE_CODE_DUPLICATED',
        severity: 'error',
        nodeCode: stableCode,
        message: '7 ? Catalog Group ? stableCode ??????',
      })
    }
  }

  for (const catalog of BUILT_IN_WBS_TEMPLATE_CATALOGS) {
    const group = getCatalogPackType(catalog)
    if (!WBS_TEMPLATE_CATALOG_GROUPS.includes(group)) {
      issues.push({
        code: 'CATALOG_GROUP_INVALID',
        severity: 'error',
        nodeCode: catalog.templateId,
        message: 'packType ???? 7 ??? Catalog Group',
      })
    }
    if (group !== 'core_quality' && getCatalogStableCodePrefix(catalog) === 'CQ') {
      issues.push({
        code: 'CATALOG_PREFIX_CONFLICT',
        severity: 'error',
        nodeCode: catalog.templateId,
        message: '? core_quality ?????? core_quality stableCode ??',
      })
    }
  }

  const dangerProcesses = allCatalogNodes
    .filter(({ catalog, node }) => getCatalogPackType(catalog) === 'danger_control' && node.categoryType === 'process')
  for (const { node } of dangerProcesses) {
    const conditions = readArray(readRecord(node.metadata).triggerConditions)
    if (conditions.length === 0 || conditions.some((condition) => {
      const record = readRecord(condition)
      return !normalizeText(record.sourceField) || !normalizeText(record.operator)
    })) {
      issues.push({
        code: 'DANGER_TRIGGER_CONDITION_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: '危大工程工序必须声明可由工程对象 metadata 或工程特征派生的 triggerConditions',
      })
    }
  }

  const milestoneProcesses = allCatalogNodes
    .filter(({ catalog, node }) => getCatalogPackType(catalog) === 'project_milestone' && node.categoryType === 'process')
  for (const projectType of WBS_TEMPLATE_PROJECT_TYPE_CODES) {
    const covered = milestoneProcesses.some(({ node }) => readCodeArray(readRecord(node.metadata).applicableProjectTypes).includes(projectType))
    if (!covered) {
      issues.push({
        code: 'PROJECT_TYPE_MILESTONE_COVERAGE_MISSING',
        severity: 'error',
        nodeCode: projectType,
        message: '???????????????? project_milestone ????',
      })
    }
  }

  for (const group of WBS_TEMPLATE_CATALOG_GROUPS) {
    if ((catalogGroupCounts[group] ?? 0) <= 0) {
      issues.push({
        code: 'CATALOG_GROUP_MISSING',
        severity: 'error',
        nodeCode: group,
        message: 'Top-level Catalog Group must have at least one registered catalog',
      })
    }
  }

  const stableCodesByGroup = new Map<WbsTemplateCatalogGroup, Set<string>>()
  for (const group of WBS_TEMPLATE_CATALOG_GROUPS) stableCodesByGroup.set(group, new Set())
  for (const { catalog, node } of allCatalogNodes) {
    stableCodesByGroup.get(getCatalogPackType(catalog))?.add(normalizeText(node.stableCode))
  }

  const referenceFields = DEPENDENCY_INTENT_REFERENCE_FIELDS

  for (const { catalog, node } of allCatalogNodes) {
    const metadata = readRecord(node.metadata)
    const referencedCodes = referenceFields.flatMap(({ field, group }) => (
      readStringArray(metadata[field]).map((code) => ({ field, group, code }))
    ))
    if (
      getCatalogPackType(catalog) === 'project_milestone'
      && node.categoryType === 'process'
      && (
        metadata.isAcceptanceMilestone === true
        || normalizeText(metadata.relationRole) === 'inspection'
        || /验收|acceptance/i.test(node.name)
      )
      && !referencedCodes.some((reference) => reference.group === 'core_quality' || reference.group === 'specialty')
    ) {
      issues.push({
        code: 'SPECIAL_ACCEPTANCE_EXECUTION_REFERENCE_MISSING',
        severity: 'warn',
        nodeCode: node.stableCode,
        message: 'Specialty or acceptance project_milestone has no physical-work stableCode reference. Add the reference for physical acceptance, or keep it as governance-only for external approval/filing.',
        details: {
          relationRole: metadata.relationRole ?? null,
          isAcceptanceMilestone: metadata.isAcceptanceMilestone ?? false,
        },
      })
    }
    if (referencedCodes.length === 0) continue

    const fromCatalogGroup = getCatalogPackType(catalog)
    const rawRelationRole = normalizeText(metadata.relationRole)
    const relationRole = ([
      'workflow',
      'evidence',
      'inspection',
      'approval',
      'handover',
      'commercial',
      'prerequisite',
      'management',
      'projected_link',
    ].includes(rawRelationRole) ? rawRelationRole : 'workflow') as V1475DependencyRelationRole
    const dependencyIntentResolution = inspectV1475DependencyIntentTemplates({
      fromCatalogGroup,
      fromReferencedCode: node.stableCode,
      metadata,
    })
    const hasBusinessConstraintReferences = referencedCodes.some((reference) => (
      !isV1475ConstructionMainlineReference(relationRole, fromCatalogGroup, reference.group, node.stableCode, reference.code)
    ))
    if (node.categoryType === 'process' && hasBusinessConstraintReferences && dependencyIntentResolution.intents.length === 0) {
      issues.push({
        code: 'DEPENDENCY_INTENT_TEMPLATE_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Referenced process nodes must emit dependencyIntentTemplates only for cross-business-domain constraints',
        details: {
          relationRole,
          auditSummary: dependencyIntentResolution.summary,
          rejectedAuditTraces: dependencyIntentResolution.audit
            .filter((item) => item.decision === 'rejected')
            .slice(0, 5)
            .map((item) => ({
              matchedReferenceField: item.matchedReferenceField,
              reasonCode: item.reasonCode,
              confidenceLevel: item.confidenceLevel,
              confidenceScore: item.confidenceScore,
              auditTrace: item.auditTrace,
            })),
        },
      })
    }
    for (const reference of referencedCodes) {
      const resolvedReferenceGroup = resolveV1475ReferenceCatalogGroup({
        declaredGroup: reference.group,
        field: reference.field,
        code: reference.code,
      })
      const inferredGroup = inferV1475ReferenceCatalogGroupFromCode(reference.code)
      if (resolvedReferenceGroup.normalized) {
        issues.push({
          code: 'CATALOG_REFERENCE_FIELD_GROUP_MISMATCH',
          severity: 'error',
          nodeCode: node.stableCode,
          message: `${reference.field} references ${reference.code}, but stableCode prefix belongs to ${resolvedReferenceGroup.group}`,
          details: {
            referenceField: reference.field,
            declaredGroup: reference.group,
            inferredGroup,
            effectiveGroup: resolvedReferenceGroup.group,
            referenceCode: reference.code,
          },
        })
      }
      if (!stableCodesByGroup.get(resolvedReferenceGroup.group)?.has(reference.code)) {
        issues.push({
          code: 'CATALOG_REFERENCE_NOT_FOUND',
          severity: 'error',
          nodeCode: node.stableCode,
          message: `${reference.field} references missing ${resolvedReferenceGroup.group} code ${reference.code}`,
          details: {
            declaredGroup: reference.group,
            effectiveGroup: resolvedReferenceGroup.group,
          },
        })
      }
    }
  }

  for (const { catalog, node } of allCatalogNodes) {
    const group = getCatalogPackType(catalog)
    if (!['site_management', 'danger_control', 'quality_responsibility', 'project_milestone', 'document_commercial_support'].includes(group)) continue
    const evidenceSources = readArray(readRecord(node.metadata).evidenceSources)
    const catalogSourceStandards = getCatalogSourceStandards(catalog)
    if (evidenceSources.length === 0 && catalogSourceStandards.length === 0 && !node.sourceStandard) {
      issues.push({
        code: 'CATALOG_GROUP_EVIDENCE_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Supplemental Catalog Group nodes must keep evidence sources for auditability',
      })
    }
  }

  for (const { node } of allCatalogNodes) {
    if (!['process', 'activity_step'].includes(node.categoryType)) continue
    const metadata = readRecord(node.metadata)
    if (!normalizeExecutionNature(metadata.executionNature ?? metadata.execution_nature)) {
      issues.push({
        code: 'EXECUTION_NATURE_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: '工序和作业步骤必须声明 executionNature，用于区分真实物理施工、技术准备、检测验收、监测等待、资料记录、管理动作和移交节点',
      })
    }
    if (!readDeclaredControlRoles(metadata)) {
      issues.push({
        code: 'CONTROL_ROLES_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Process and activity-step nodes must declare the six cross-cutting control roles: quality, safety, acceptance, document, commercial and management.',
      })
    }
  }

  for (const node of nodes) {
    if (!node.stableCode || !node.name || !node.sourceStandard || !node.sourceVersion || !node.sourceClauseRef) {
      issues.push({
        code: 'NODE_REQUIRED_METADATA_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Template node is missing stable code, name, or source metadata.',
      })
    }
    if (node.expectedChildCount !== undefined && (node.children ?? []).length !== node.expectedChildCount) {
      issues.push({
        code: 'EXPECTED_CHILD_COUNT_MISMATCH',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Template node declared child count does not match actual child count.',
      })
    }
    if (node.categoryType === 'item_work' && !(node.children ?? []).some((child) => child.categoryType === 'process')) {
      issues.push({
        code: 'ITEM_WORK_PROCESS_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Every item_work node must contain at least one process.',
      })
    }
    if (node.categoryType === 'item_work' && (node.children ?? []).filter((child) => child.categoryType === 'process').length < 3) {
      issues.push({
        code: 'ITEM_WORK_PROCESS_COUNT_TOO_LOW',
        severity: 'error',
        nodeCode: node.stableCode,
        message: '????????????? 3 ??????',
      })
    }
    const metadata = readRecord(node.metadata)
    const evidenceSources = readArray(metadata.evidenceSources)
    if (!metadata.verificationStatus || !metadata.evidenceLevel || evidenceSources.length === 0) {
      issues.push({
        code: 'NODE_EVIDENCE_METADATA_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: '??????????? verificationStatus?evidenceLevel ? evidenceSources',
      })
    }
    if ((node.categoryType === 'process' || node.categoryType === 'activity_step') && ['GB55032-2022', 'GB50300-2013'].includes(node.sourceStandard)) {
      issues.push({
        code: 'EXECUTION_NODE_SOURCE_STANDARD_INVALID',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Process and activity-step nodes must not claim GB source text directly; they must land as enterprise-method evidence.',
      })
    }
    if (node.categoryType === 'item_work' && readArray(metadata.qualityStandardCodes).length === 0) {
      issues.push({
        code: 'ITEM_WORK_QUALITY_STANDARD_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: '每个分项工程必须绑定质量验收标准代码',
      })
    }
    if (node.categoryType === 'process' && (readArray(metadata.preconditionTemplates).length === 0 || readArray(metadata.acceptanceCheckpoints).length === 0 || !metadata.resourceProfile)) {
      issues.push({
        code: 'PROCESS_COMMERCIAL_METADATA_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: '每个工序必须具备开工条件、验收检查点和资源画像元数据',
      })
    }
    if (node.categoryType === 'process' && (metadata.processSource !== 'enterprise_method' || !['discipline_package', 'generic_fallback'].includes(String(metadata.processPackLevel ?? '')) || !metadata.confidence)) {
      issues.push({
        code: 'PROCESS_PACK_GOVERNANCE_METADATA_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Every process must declare processSource, processPackLevel and confidence to distinguish specialty process packs from fallback processes.',
      })
    }
    if (node.categoryType === 'activity_step' && !['discipline_activity_step_pack', 'generic_checklist'].includes(String(metadata.activityStepSource ?? ''))) {
      issues.push({
        code: 'ACTIVITY_STEP_SOURCE_METADATA_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Every activity step must declare activityStepSource to identify specialty steps versus generic checklist steps.',
      })
    }
    if ((node.categoryType === 'process' || node.categoryType === 'activity_step') && !normalizeDurationContributionMode(metadata.durationContributionMode ?? metadata.duration_contribution_mode)) {
      issues.push({
        code: 'DURATION_CONTRIBUTION_MODE_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: '工序和作业步骤必须声明 durationContributionMode，用于区分施工承载、检查、等待、资料和移交动作',
      })
    }
    const activityStepChildren = (node.children ?? []).filter((child) => child.categoryType === 'activity_step')
    const durationContributionMode = normalizeDurationContributionMode(metadata.durationContributionMode ?? metadata.duration_contribution_mode)
    const minimumActivityStepCount = isDurationBearingContributionMode(durationContributionMode) ? 2 : 1
    if (node.categoryType === 'process' && activityStepChildren.length < minimumActivityStepCount) {
      issues.push({
        code: 'PROCESS_ACTIVITY_STEP_COUNT_TOO_LOW',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Process activity_step split must match durationContributionMode: duration-bearing construction processes need at least 2 steps; inspection, waiting, document and handover actions need at least 1 step.',
      })
    }
    if (options.strict && (node.reviewNeeded || node.webVerified === false)) {
      issues.push({
        code: 'NODE_REVIEW_PENDING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: '正式验收模式下 seed 节点不能有 reviewNeeded 与 webVerified=false',
      })
    } else if (node.reviewNeeded || node.webVerified === false) {
      issues.push({
        code: 'NODE_REVIEW_PENDING',
        severity: 'warn',
        nodeCode: node.stableCode,
        message: '该节点需要后续标准原文校对，开发阶段允许作为 warn',
      })
    }
  }

  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    divisionCount,
    subDivisionCount,
    itemWorkCount,
    processCount,
    activityStepCount,
    reviewNeededCount,
    webVerifiedFalseCount,
    disciplineProcessCount,
    genericFallbackProcessCount,
    disciplineActivityStepCount,
    genericActivityStepCount,
    uniqueProcessNameCount,
    uniqueActivityStepNameCount,
    catalogGroupCounts,
    issues,
  }
}

export function buildTemplateGenerateCreateOperations(rows: GeneratedTemplateRow[]) {
  const operations: PlanningTableOperation[] = []
  for (const row of rows) {
    operations.push({
      type: 'create_row',
      clientRowId: row.clientRowId,
      tempId: row.clientRowId,
      parentId: row.parentClientRowId ?? row.parentRowId,
      sortOrder: row.sortOrder,
      values: sanitizeGeneratedRowValuesForCreate(row.values),
    })
  }
  for (const row of rows) {
    if (row.predecessorDependencies.length === 0) continue
    operations.push({
      type: 'set_predecessors',
      rowId: row.clientRowId,
      predecessorTaskIds: row.predecessorClientRowIds,
      predecessorDependencies: row.predecessorDependencies,
    })
  }
  return operations
}
