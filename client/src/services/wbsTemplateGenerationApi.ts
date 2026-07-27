import { apiGet, apiPost } from '@/lib/apiClient'
import { normalizeDurationMetricDto, type DurationMetricDto, type DurationRiskDistributionDto } from '@/lib/durationMetric'
import type { PlanningSurface } from '@/components/planning/PlanningCommitModel'
import type { LinkedProjectionSource, PlanItemKind, ProgressMode, RelationRole, ScheduleParticipation, ScopeExpansionMode } from '@/lib/planItemSemantics'

const LEGACY_SCOPE_OBJECT_FIELDS = new Set([
  'zone_object_id',
  'professional_object_id',
  'scope_dimensions',
  'project_scope_dimensions',
  'legacy_object_type',
])

function stripLegacyScopeObjectFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripLegacyScopeObjectFields)
  }

  if (!value || typeof value !== 'object') return value

  const cleaned: Record<string, unknown> = {}
  for (const [key, childValue] of Object.entries(value as Record<string, unknown>)) {
    if (LEGACY_SCOPE_OBJECT_FIELDS.has(key)) continue
    cleaned[key] = stripLegacyScopeObjectFields(childValue)
  }
  return cleaned
}

function sanitizeLegacyScopeObjectFields<T>(payload: T): T {
  return stripLegacyScopeObjectFields(payload) as T
}

export type WbsTemplateCategoryType =
  | 'division'
  | 'sub_division'
  | 'item_work'
  | 'process'
  | 'activity_step'
  | 'custom'

export type WbsTemplatePackType =
  | 'core_quality'
  | 'site_management'
  | 'danger_control'
  | 'quality_responsibility'
  | 'project_milestone'
  | 'document_commercial_support'
  | 'specialty'

export type WbsTemplateCatalogGroup = WbsTemplatePackType

export type WbsTemplateGenerationPolicy = 'default_selected' | 'triggered' | 'explicit'

export type ExecutionNature =
  | 'physical_work'
  | 'technical_preparation'
  | 'inspection_test'
  | 'monitoring_wait'
  | 'document_record'
  | 'management_action'
  | 'handover_milestone'

export type QualityControlRole =
  | 'none'
  | 'precondition_control'
  | 'process_control'
  | 'hidden_control'
  | 'test_control'
  | 'acceptance_gate'
  | 'defect_rework'

export type SafetyControlRole =
  | 'none'
  | 'hazardous_work'
  | 'special_plan_control'
  | 'safety_acceptance'
  | 'protective_measure'
  | 'temporary_facility_safety'
  | 'operation_permit'
  | 'monitoring_control'
  | 'daily_safety_check'

export type InspectionAcceptanceRole =
  | 'none'
  | 'self_check'
  | 'mutual_check'
  | 'hidden_acceptance'
  | 'material_retest'
  | 'third_party_test'
  | 'special_acceptance'
  | 'completion_acceptance'

export type DocumentEvidenceRole =
  | 'none'
  | 'technical_record'
  | 'inspection_record'
  | 'test_report'
  | 'approval_document'
  | 'handover_document'
  | 'commercial_document'

export type CommercialControlRole =
  | 'none'
  | 'quantity_measurement'
  | 'variation_claim'
  | 'price_approval'
  | 'progress_payment'
  | 'settlement'
  | 'cost_evidence'

export type ManagementControlRole =
  | 'none'
  | 'planning_control'
  | 'organization_control'
  | 'technical_control'
  | 'resource_control'
  | 'site_readiness_control'
  | 'interface_coordination'
  | 'issue_rectification'
  | 'progress_control'
  | 'handover_control'

export type WbsTemplateCatalogGroupSelection =
  | 'all'
  | 'default_selected'
  | 'triggered'
  | 'explicit'
  | 'auto_by_trigger'
  | 'by_project_type'
  | 'none'

export type WbsTemplateTriggerCondition = {
  sourceField: string
  operator: '>=' | '>' | '<=' | '<' | '=' | 'includes' | 'exists'
  value?: string | number | boolean
  unit?: string
  conditionRole?: 'screening' | 'expert_review' | 'direct_trigger'
}

export type WbsTemplateGroup =
  | 'building_main'
  | 'site_management'
  | 'danger_control'
  | 'quality_responsibility'
  | 'project_milestone'
  | 'document_commercial_support'
  | 'outdoor'
  | 'municipal'
  | 'decoration'
  | 'mep'
  | 'facade'
  | 'elevator'
  | 'intelligent'
  | 'hvac'
  | 'plumbing'
  | 'electrical'
  | 'foundation'
  | 'steel_structure'
  | 'prefab'
  | 'waterproof'
  | 'civil_defense'
  | 'cleanroom'

export interface WbsTemplateCatalogNode {
  id: string
  stableCode: string
  name: string
  categoryType: WbsTemplateCategoryType
  engineeringCategoryId?: string | null
  standardWorkCode?: string | null
  standardWorkName?: string | null
  packType?: WbsTemplatePackType
  templateGroup?: WbsTemplateGroup
  generationPolicy?: WbsTemplateGenerationPolicy
  defaultDurationDays: number | null
  sourceStandard: string | null
  sourceVersion: string | null
  sourceClauseRef: string | null
  reviewNeeded: boolean
  webVerified: boolean
  evidenceLevel: string | null
  verificationStatus: string | null
  applicableScope: string | null
  applicableProjectTypes?: string[]
  applicableStructureTypes?: string[]
  applicableMethodVariantCodes?: string[]
  historyFeedbackPolicy?: Record<string, unknown>
  children: WbsTemplateCatalogNode[]
}

export interface WbsTemplateEvidenceSummary {
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

export interface WbsTemplateCatalogItem {
  id: string
  name: string
  source: 'builtin_seed' | 'database'
  nodeCount: number
  packType?: WbsTemplatePackType
  templateGroup?: WbsTemplateGroup
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

export interface WbsTemplateCatalogResponse {
  builtIn: {
    templateId: string
    templateCode: string
    templateName: string
    sourceStandard: string
    sourceVersion: string
    divisionCount: number
    nodeCount: number
    packType?: WbsTemplatePackType
    templateGroup?: WbsTemplateGroup
    generationPolicy?: WbsTemplateGenerationPolicy
    evidenceSummary: WbsTemplateEvidenceSummary
    nodes?: WbsTemplateCatalogNode[]
  }
  templates: WbsTemplateCatalogItem[]
}

export interface WbsTemplateGenerationScope {
  engineering_object_id?: string | null
  phase_object_id?: string | null
  section_object_id?: string | null
  building_object_id?: string | null
  floor_object_id?: string | null
  physical_zone_object_id?: string | null
  functional_area_object_id?: string | null
  project_type_code?: string | null
  structure_type_code?: string | null
  method_variant_codes?: string[]
  element_variant_codes?: string[]
  buildings?: string[]
  floors?: string[]
  floor_series?: Array<{
    floorObjectId?: string | null
    floor_object_id?: string | null
    id?: string | null
    label?: string | null
    levelNumber?: number | null
    level_number?: number | null
    isBasement?: boolean
    is_basement?: boolean
  }>
  floor_series_count?: number | null
  floor_series_label?: string | null
  floor_series_source?: 'explicit_floor_array' | 'inferred_floor_count' | 'direct_floor' | string | null
  floor_sequence?: Array<{
    sequenceIndex?: number
    sequenceNumber?: number
    floorObjectId?: string | null
    label?: string | null
    levelNumber?: number | null
    isBasement?: boolean
  }>
  zones?: string[]
  phases?: string[]
  scopeExpansionMode?: 'project' | 'building' | 'floor' | 'building_rhythm_series' | 'floor_anchor' | 'explicit_instances' | 'custom' | string
  scope_expansion_mode?: 'project' | 'building' | 'floor' | 'building_rhythm_series' | 'floor_anchor' | 'explicit_instances' | 'custom' | string
  [key: string]: unknown
}

export interface WbsGeneratedTemplateRow {
  clientRowId: string
  parentClientRowId: string | null
  parentRowId: string | null
  sortOrder: number
  values: Record<string, unknown> & {
    smart_reference_days?: number | null
    duration_suggestion?: WbsGeneratedDurationSuggestion | null
  }
  predecessorClientRowIds: string[]
  predecessorDependencies: WbsGeneratedTemplateDependency[]
  rowProjectionMode?: RowProjectionMode | string | null
  executionPhase?: string | null
  executionLane?: string | null
  executionSortKey?: number | null
  workfaceId?: string | null
  planItemKind?: PlanItemKind | string | null
  planItemTags?: string[]
  progressMode?: ProgressMode | string | null
  scheduleParticipation?: ScheduleParticipation | string | null
  scopeExpansionMode?: ScopeExpansionMode | string | null
  linkedProjectionSource?: LinkedProjectionSource | null
  executionNature?: ExecutionNature | string | null
  qualityControlRole?: QualityControlRole | string | null
  safetyControlRole?: SafetyControlRole | string | null
  inspectionAcceptanceRole?: InspectionAcceptanceRole | string | null
  documentEvidenceRole?: DocumentEvidenceRole | string | null
  commercialControlRole?: CommercialControlRole | string | null
  managementControlRole?: ManagementControlRole | string | null
  durationSuggestion?: WbsGeneratedDurationSuggestion | null
}

export type RowProjectionMode =
  | 'schedule_row'
  | 'gate_marker'
  | 'inline_control'
  | 'linked_projection'

export type WbsGenerationDepth =
  | 'division'
  | 'sub_division'
  | 'item_work'
  | 'process'
  | 'activity_step'

export interface WbsGeneratedMasterPlanProfile {
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

export interface WbsGeneratedDurationSuggestion {
  riskP20DurationDays?: number | null
  riskP50DurationDays?: number | null
  riskP80DurationDays?: number | null
  durationRiskRange?: {
    source?: string | null
    evidenceLevel?: string | null
    p20Days?: number | null
    p50Days?: number | null
    p80Days?: number | null
    uncertaintyBandDays?: number | null
    mutationBoundary?: string | null
    [key: string]: unknown
  } | null
  durationRiskDistribution?: DurationRiskDistributionDto | null
  durationOutputCode?: string | null
  durationOutputSemanticFieldName?: string | null
  planReferenceDays?: number | null
  contextualReferenceDays?: number | null
  remainingForecastDays?: number | null
  conservativeDurationDays: number | null
  confidenceLevel: 'high' | 'medium' | 'low' | string | null
  confidenceScore: number | null
  forecastSource: string | null
  durationCalibrationSource?: string | null
  durationProvenance?: string | null
  businessReason: string | null
  businessReasonCode?: string | null
  businessReasonCodes?: string[]
  businessReasonParams?: Record<string, unknown> | null
  displaySummary?: string | null
  durationContributionMode?: string | null
  floorRhythmAdjustment?: Record<string, unknown> | null
}

export interface WbsGeneratedTemplateDependency {
  clientRowId: string
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF' | string
  lagDays: number
  intentCode?: string | null
  relationRole?: RelationRole | string | null
  strength?: 'hard' | 'recommended' | 'candidate' | string | null
  source?: 'sibling_sequence' | 'cross_item_workflow' | 'dependency_intent_template' | string | null
}

export interface WbsTemplateInferredFeatures {
  projectTypeCode: string | null
  structureTypeCode: string | null
  methodVariantCodes: string[]
  elementVariantCodes: string[]
  plannedStartDate?: string | null
  dangerProfile?: Record<string, unknown>
  dangerTriggerFacts: Array<{
    key: string
    label: string
    value: string | number | boolean | null
    threshold?: string | number | boolean | null
    unit?: string | null
    triggered: boolean
    source: string
  }>
  scopeCandidates: {
    buildingIds: string[]
    floorIds: string[]
    zoneIds: string[]
    phaseIds: string[]
    floorSequence?: {
      source: 'engineering_objects.floor' | 'projects.floor_count' | 'none' | string
      aboveGroundFloors: number | null
      undergroundFloors: number | null
      totalFloors: number
      floors: Array<{
        sequenceIndex: number
        sequenceNumber: number
        floorObjectId: string | null
        label: string
        levelNumber: number | null
        isBasement: boolean
      }>
    }
  }
  explanationSources: string[]
}

export interface WbsTemplateGeneratePreview {
  generationBatchId: string
  templateId: string
  templateIds?: string[]
  generationDepth: WbsGenerationDepth
  defaultPlanOutput?: 'master_plan'
  masterPlanProfile?: WbsGeneratedMasterPlanProfile | null
  candidateNetworkEvaluation?: {
    source?: string
    networkBasis?: string
    projectedNetworkSpanDays?: number
    previewEdgeCount?: number
    processConstraintRoutingCandidateEdgeCount?: number
    processConstraintRoutingRuleCodes?: string[]
    unresolvedEdgeCount?: number
    criticalGeneratedRowIds?: string[]
    criticalTaskIds?: string[]
    taskIdMappingStatus?: string
    taskIdMappingEvidenceLevel?: string
    taskIdMappingMutationBoundary?: string
    durationAssetPlanDateNetworkRecalculation?: {
      source?: string
      adjustedRowCount?: number
      previousProjectedNetworkSpanDays?: number | null
      recalculatedProjectedNetworkSpanDays?: number | null
      evidenceLevel?: string
      mutationBoundary?: string
    }
    materializationStatus?: string
    rowSchedule?: Array<Record<string, unknown>>
    writesTaskDependencies?: false
    writesPlanDates?: false
    writesCriticalPathFacts?: false
    [key: string]: unknown
  } | null
  rows: WbsGeneratedTemplateRow[]
  previewRows: WbsGeneratedTemplateRow[]
  scopeCombos: WbsTemplateGenerationScope[]
  rowLimit?: number
  rowLimitPolicy?: 'single_batch' | 'split_by_phase'
  splitByPhaseApplied?: boolean
  generationBatches?: Array<{
    batchId: string
    phaseObjectId: string | null
    scopeIndexes: number[]
    rowCount: number
    totalRowCount?: number
    rowProjectionCounts?: Partial<Record<RowProjectionMode, number>>
    templateIds: string[]
    rowLimit: number
    rowLimitExceeded: boolean
  }>
  batchOperations?: Array<{
    batchId: string
    phaseObjectId: string | null
    scopeIndexes: number[]
    rowCount: number
    totalRowCount?: number
    rowProjectionCounts?: Partial<Record<RowProjectionMode, number>>
    templateIds: string[]
    rowLimit: number
    rowLimitExceeded: boolean
    operations: unknown[]
  }>
  suppressedCoreQualityCodes?: string[]
  operations: unknown[]
  writeMode: 'preview_only'
  targetFeasibility?: WbsTargetFeasibility | null
}

export interface WbsTargetFeasibility {
  mode: 'compare_only' | 'compression_preview' | 'reverse_cpm'
  scenario?: 'baseline_target_alignment' | 'runtime_delay_recovery'
  targetEndDate: string
  naturalEndDate: string
  /** @deprecated Use overshoot. */
  overshootDays: number
  overshoot?: DurationMetricDto | null
  /** @deprecated Use recoverable. */
  recoverableDays: number | null
  recoverable?: DurationMetricDto | null
  /** @deprecated Use unrecoverable. */
  unrecoverableDays: number | null
  unrecoverable?: DurationMetricDto | null
  verdict: 'fit' | 'tight' | 'compressible' | 'requires_scope_change' | 'infeasible' | 'unavailable'
  strategies: Array<{
    type: 'fast_track' | 'crashing' | 'scope_reduction'
    affectedRowIds: string[]
    /** @deprecated Use recoverDuration. */
    recoverDays: number
    recoverDuration?: DurationMetricDto | null
    riskLevel: 'low' | 'medium' | 'high'
    explanation: string
  }>
  accelerationProposal?: WbsAccelerationProposal | null
  accelerationRecommendation?: WbsAccelerationRecommendationIdentity | null
}

export interface WbsAccelerationRecommendationIdentity {
  id: string
  recommendationHash: string
  operationsHash: string
  issuedAt: string
  expiresAt: string
}

export interface WbsConstructionOrganizationProjectOrganizationScheme {
  source?: 'project_organization_policy_scheme_candidate' | string
  evaluationRole?: 'business_type_scheme_family_for_e1_e3_e5_candidate_evaluation' | string
  policyId?: string
  sourceVersion?: string
  strategy?: string
  schemeFamily?: string
  primaryInterfaceSequence?: string[]
  interfaceGateTags?: string[]
  laneRole?: string
  lanePrefix?: string
  networkPolicy?: {
    sharedWorksRelease?: string
    primaryLaneScheduling?: string
    interfaceGatePolicy?: string
    [key: string]: unknown
  }
  confidence?: string
  rationale?: string
  resourcePolicy?: string
  writesTaskDependencies?: false
  writesPlanDates?: false
  writesSeed?: false
  [key: string]: unknown
}

export interface WbsConstructionOrganizationPlanOptionEngineEvaluationSummary {
  source?: 'construction_organization_plan_option_engine_evaluation_summary' | string
  evaluationRole?: 'candidate_option_e1_e3_e5_summary_not_runtime_execution' | string
  e1?: Record<string, unknown>
  e3?: Record<string, unknown>
  e5?: Record<string, unknown>
  projectOrganization?: WbsConstructionOrganizationProjectOrganizationScheme | null
  boundary?: {
    candidateOnly?: true
    writesTaskDependencies?: false
    writesPlanDates?: false
    writesSeed?: false
    writesCriticalPathFacts?: false
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface WbsConstructionOrganizationPlanOptionSummary {
  optionId?: string
  selectedScenarioIds?: string[]
  combinedScore?: number
  confidence?: string
  recoveryFactorHint?: number
  projectOrganizationScheme?: WbsConstructionOrganizationProjectOrganizationScheme | null
  engineEvaluationSummary?: WbsConstructionOrganizationPlanOptionEngineEvaluationSummary | null
  generatedRowProjection?: {
    candidateMaterializationEvaluation?: {
      previewEdgeCount?: number
      satisfiedEdgeCount?: number
      violatedEdgeCount?: number
      unresolvedEdgeCount?: number
      materializationScore?: number
      violationDetails?: Array<Record<string, unknown>>
      writesTaskDependencies?: false
      writesPlanDates?: false
      writesCriticalPathFacts?: false
      [key: string]: unknown
    } | null
    materializationDecision?: {
      source?: string
      decision?: 'ready_for_manual_materialization' | 'needs_generated_row_carrier' | 'evidence_only' | 'blocked_by_violations' | string
      allowManualMaterialization?: boolean
      reasons?: string[]
      writesTaskDependencies?: false
      writesPlanDates?: false
      writesCriticalPathFacts?: false
      [key: string]: unknown
    } | null
    materializationReviewPackage?: {
      source?: string
      packageBasis?: string
      optionId?: string
      status?: 'ready_for_manual_review' | 'needs_generated_row_carrier' | 'evidence_only' | 'blocked_by_violations' | string
      allowManualReview?: boolean
      proposedDependencyEdgeCount?: number
      blockedReasons?: string[]
      proposedDependencyEdges?: Array<Record<string, unknown>>
      reviewRequired?: true
      writesTaskDependencies?: false
      writesPlanDates?: false
      writesCriticalPathFacts?: false
      [key: string]: unknown
    } | null
    generatedRowNetworkEvaluation?: {
      source?: string
      networkBasis?: string
      projectedNetworkSpanDays?: number
      previewEdgeCount?: number
      unresolvedEdgeCount?: number
      criticalGeneratedRowIds?: string[]
      criticalTaskIds?: string[]
      taskIdMappingStatus?: string
      taskIdMappingEvidenceLevel?: string
      taskIdMappingMutationBoundary?: string
      materializationStatus?: string
      rowSchedule?: Array<Record<string, unknown>>
      writesTaskDependencies?: false
      writesPlanDates?: false
      writesCriticalPathFacts?: false
      [key: string]: unknown
    } | null
    [key: string]: unknown
  } | null
  useCaseEvaluations?: Record<string, unknown>
  boundaryPolicy?: Record<string, unknown>
  [key: string]: unknown
}

export interface WbsConstructionOrganizationProductOutcomeCloseoutProgress {
  source?: 'construction_organization_product_outcome_closeout_progress' | string
  status?: 'product_outcome_closeout_ready' | 'product_outcome_closeout_incomplete' | string
  canDeclareConstructionOrganizationProductOutcomeCloseout?: boolean
  supportedBusinessTypeCount?: number
  precisionReplayReadyBusinessTypeCount?: number
  runtimeOutcomeReadyBusinessTypeCount?: number
  readyBusinessTypes?: string[]
  missingBusinessTypes?: string[]
  topMissingReasons?: string[]
  nextEvidenceActions?: string[]
  nextEvidenceWorkItemCount?: number
  nextEvidenceWorkPackageCount?: number
  prefillableWorkPackageCount?: number
  blockedWorkPackageCount?: number
  useCaseCoverage?: Record<string, {
    readyBusinessTypeCount?: number
    missingBusinessTypes?: string[]
    [key: string]: unknown
  }>
  mutationBoundary?: {
    writesTaskDependencies?: false
    writesPlanDates?: false
    writesSeed?: false
    writesBaseline?: false
    writesCriticalPathFacts?: false
    writesAccelerationDraft?: false
    [key: string]: unknown
  }
  boundaryPolicy?: string[]
  [key: string]: unknown
}

export interface WbsConstructionOrganizationScenarioSummary {
  source?: string
  sourceVersion?: string
  recommendedScenarioIds?: string[]
  confidence?: string
  resourcePolicy?: string
  boundaryPolicy?: Record<string, unknown>
  projectOrganizationPolicy?: WbsConstructionOrganizationProjectOrganizationScheme | Record<string, unknown> | null
  recommendedPlanOption?: WbsConstructionOrganizationPlanOptionSummary | null
  planOptions?: WbsConstructionOrganizationPlanOptionSummary[]
  planOptionComparisonPackage?: Record<string, unknown> | null
  organizationDecisionReport?: Record<string, unknown> | null
  scenarioRecommendations?: Record<string, unknown> | null
  planNetworkDraftRecommendations?: Record<string, unknown> | null
  productOutcomeCloseoutProgress?: WbsConstructionOrganizationProductOutcomeCloseoutProgress | null
  [key: string]: unknown
}

export interface WbsAccelerationProposal {
  mode: 'preview_only'
  source: 'target_end_compression'
  targetEndDate: string
  naturalEndDate: string
  /** @deprecated Use overshoot. */
  overshootDays: number
  overshoot?: DurationMetricDto | null
  /** @deprecated Use totalRecover. */
  totalRecoverDays: number
  totalRecover?: DurationMetricDto | null
  /** @deprecated Use remainingGap. */
  remainingGapDays: number
  remainingGap?: DurationMetricDto | null
  verdict: 'draft_recoverable' | 'needs_scope_decision' | 'infeasible'
  commitmentDisclaimer?: string
  actions: WbsAccelerationProposalAction[]
  rescheduleDraft?: WbsAccelerationRescheduleDraft | null
  protectedConstraints: Array<{
    clientRowId: string
    title: string
    reasonCode: string
    /** @deprecated Use duration. */
    durationDays: number
    duration?: DurationMetricDto | null
  }>
  calculationBasis?: {
    scenario?: 'baseline_target_alignment' | 'runtime_delay_recovery'
    naturalDurationDays: number
    naturalDuration?: DurationMetricDto | null
    totalRecoverCapRatio: number
    seasonalFactor: number
    projectTypeProfile: string
    criticalCandidateDays: number
    resourceGroupedCandidateDays: number
    hardConstraintDays: number
    hardConstraintDuration?: DurationMetricDto | null
    constructionOrganizationScenario?: WbsConstructionOrganizationScenarioSummary | null
    constructionOrganizationRecoveryFactor?: number
    fastTrackBudgetDays?: number
    fastTrackBudgetRatio?: number
    policySource?: string
    runtimeContext?: {
      progressCompletionRatio?: number | null
      resourcePressureScore?: number | null
      parallelDensityRatio?: number | null
      milestonePressureScore?: number | null
      forecastDelayDays?: number | null
      baselineDeviationDays?: number | null
      blockedTaskCount?: number | null
      hardBlockerCount?: number | null
      criticalOrNearCriticalTaskCount?: number | null
      floatingTaskCount?: number | null
      scheduleState?: string | null
      localAccelerationFactor?: number | null
      evidenceCodes?: string[]
      recoveryBudgetFactor?: number
    }
  }
}

export interface WbsAccelerationRescheduleDraft {
  mode: 'proposal_review'
  source: 'target_end_compression'
  writePolicy: 'requires_user_acceptance'
  taskDateAdjustments: Array<{
    clientRowId: string
    title: string
    currentStartDate: string | null
    currentEndDate: string | null
    proposedStartDate: string | null
    proposedEndDate: string | null
    currentDurationDays: number
    currentDuration?: DurationMetricDto | null
    proposedDurationDays: number
    proposedDuration?: DurationMetricDto | null
    recoverDays: number
    recoverDuration?: DurationMetricDto | null
    changedFields: string[]
    visualDiff: {
      durationDeltaDays: number
      durationDelta?: DurationMetricDto | null
      startDeltaDays: number
      startDelta?: DurationMetricDto | null
      endDeltaDays: number
      endDelta?: DurationMetricDto | null
      barDeltaKind: 'compressed' | 'shifted' | 'unchanged'
    }
  }>
  dependencyAdjustments: Array<{
    predecessorClientRowId: string
    successorClientRowId: string
    fromDependencyType: string
    toDependencyType: 'SS'
    lagDaysBefore: number
    lagDaysAfter: number
  }>
  resourceAdjustments: Array<{
    clientRowId: string
    currentDurationDays: number
    currentDuration?: DurationMetricDto | null
    proposedDurationDays: number
    proposedDuration?: DurationMetricDto | null
    minDurationDays: number
    minDuration?: DurationMetricDto | null
    recoverDays: number
    recoverDuration?: DurationMetricDto | null
    basis: 'p50_to_p20' | 'resource_crash_preview'
  }>
  operations: Array<
    | {
        type: 'update_row'
        rowId: string
        values: Record<string, unknown>
      }
    | {
        type: 'set_predecessors'
        rowId: string
        predecessorTaskIds: string[]
        predecessorDependencies: Array<{
          dependencyTaskId: string
          dependencyType: string
          lagDays: number
          sourceType: string
        }>
      }
  >
}

export type WbsAccelerationProposalAction =
  | {
    type: 'fast_track'
    affectedRowIds: string[]
    recoverDays: number
    recoverDuration?: DurationMetricDto | null
    riskLevel: 'low' | 'medium' | 'high'
    explanation: string
    dependencyAdjustments: Array<{
      predecessorClientRowId: string
      successorClientRowId: string
      fromDependencyType: string
      toDependencyType: 'SS'
      lagDaysBefore: number
      lagDaysAfter: number
    }>
  }
  | {
    type: 'crashing'
    affectedRowIds: string[]
    recoverDays: number
    recoverDuration?: DurationMetricDto | null
    riskLevel: 'low' | 'medium' | 'high'
    explanation: string
    durationAdjustments: Array<{
      clientRowId: string
      currentDurationDays: number
      currentDuration?: DurationMetricDto | null
      proposedDurationDays: number
      proposedDuration?: DurationMetricDto | null
      minDurationDays: number
      minDuration?: DurationMetricDto | null
      recoverDays: number
      recoverDuration?: DurationMetricDto | null
      basis: 'p50_to_p20' | 'resource_crash_preview'
    }>
  }
  | {
    type: 'scope_reduction'
    affectedRowIds: string[]
    recoverDays: number
    recoverDuration?: DurationMetricDto | null
    riskLevel: 'high'
    explanation: string
    decisionOptions: string[]
  }

export interface WbsTemplateGeneratePreviewPayload {
  projectId: string
  surface: Extract<PlanningSurface, 'baseline' | 'task_list'>
  templateId: string
  primaryCatalogId?: string
  groupSelections?: Partial<Record<WbsTemplateCatalogGroup, WbsTemplateCatalogGroupSelection | { mode: WbsTemplateCatalogGroupSelection } | boolean>>
  specialtyCatalogIds?: string[]
  templateIds?: string[]
  selectedNodeIds?: string[]
  selectedNodesByTemplate?: Record<string, string[]>
  scope?: WbsTemplateGenerationScope
  projectFacts?: {
    projectTypeCode?: string | null
    structureTypeCode?: string | null
    methodVariantCodes?: string[]
    elementVariantCodes?: string[]
    totalAreaM2?: number | null
    buildingCount?: number | null
    standardFloorCount?: number | null
    highestBuildingFloorCount?: number | null
    basementLevelCount?: number | null
    basementAreaM2?: number | null
    foundationDepthM?: number | null
    deepFoundationPitDepthM?: number | null
    prefabRate?: number | null
    towerCraneCount?: number | null
    constructionHoistCount?: number | null
    maxSpanM?: number | null
    supportHeightM?: number | null
    hasCivilDefense?: boolean | null
    buildingPatternCodes?: string[] | null
    functionalUsageCodes?: string[] | null
    functionalCategoryCodes?: string[] | null
    specialRoomTypeCodes?: string[] | null
    physicalZoneTypeCodes?: string[] | null
  }
  attachUnderRowId?: string | null
  plannedStartDate?: string | null
  projectPlannedEndDate?: string | null
  targetConstraintMode?: 'compare_only' | 'compression_preview' | 'reverse_cpm'
  generationDepth?: WbsGenerationDepth
  includeActivitySteps?: boolean
  detailLevel?: 'overview' | 'standard' | 'detailed'
  phaseChainMode?: 'sequential' | 'none'
  phaseReleasePolicies?: Record<string, unknown> | Array<Record<string, unknown>> | null
  operations?: Array<Record<string, unknown>>
  phaseOperations?: Array<Record<string, unknown>>
  sortOrder?: number
  duplicatePolicy?: 'skip' | 'overwrite' | 'duplicate'
  generationBatchId?: string
}

function normalizeAccelerationDurationAdjustment<T extends Record<string, unknown>>(adjustment: T) {
  const visualDiff = adjustment.visualDiff && typeof adjustment.visualDiff === 'object' && !Array.isArray(adjustment.visualDiff)
    ? adjustment.visualDiff as Record<string, unknown>
    : null
  return {
    ...adjustment,
    currentDuration: normalizeDurationMetricDto(adjustment.currentDuration),
    proposedDuration: normalizeDurationMetricDto(adjustment.proposedDuration),
    minDuration: normalizeDurationMetricDto(adjustment.minDuration),
    recoverDuration: normalizeDurationMetricDto(adjustment.recoverDuration),
    ...(visualDiff
      ? {
          visualDiff: {
            ...visualDiff,
            durationDelta: normalizeDurationMetricDto(visualDiff.durationDelta),
            startDelta: normalizeDurationMetricDto(visualDiff.startDelta),
            endDelta: normalizeDurationMetricDto(visualDiff.endDelta),
          },
        }
      : {}),
  }
}

export function normalizeWbsTargetFeasibility(value: unknown): WbsTargetFeasibility | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, any>
  const proposal = raw.accelerationProposal && typeof raw.accelerationProposal === 'object'
    ? raw.accelerationProposal as Record<string, any>
    : null
  const normalizedProposal = proposal
    ? {
        ...proposal,
        overshoot: normalizeDurationMetricDto(proposal.overshoot),
        totalRecover: normalizeDurationMetricDto(proposal.totalRecover),
        remainingGap: normalizeDurationMetricDto(proposal.remainingGap),
        actions: Array.isArray(proposal.actions)
          ? proposal.actions.map((action: Record<string, any>) => ({
              ...action,
              recoverDuration: normalizeDurationMetricDto(action.recoverDuration),
              ...(action.type === 'crashing' && Array.isArray(action.durationAdjustments)
                ? { durationAdjustments: action.durationAdjustments.map(normalizeAccelerationDurationAdjustment) }
                : {}),
            }))
          : [],
        rescheduleDraft: proposal.rescheduleDraft && typeof proposal.rescheduleDraft === 'object'
          ? {
              ...proposal.rescheduleDraft,
              taskDateAdjustments: Array.isArray(proposal.rescheduleDraft.taskDateAdjustments)
                ? proposal.rescheduleDraft.taskDateAdjustments.map(normalizeAccelerationDurationAdjustment)
                : [],
              resourceAdjustments: Array.isArray(proposal.rescheduleDraft.resourceAdjustments)
                ? proposal.rescheduleDraft.resourceAdjustments.map(normalizeAccelerationDurationAdjustment)
                : [],
            }
          : null,
        protectedConstraints: Array.isArray(proposal.protectedConstraints)
          ? proposal.protectedConstraints.map((constraint: Record<string, any>) => ({
              ...constraint,
              duration: normalizeDurationMetricDto(constraint.duration),
            }))
          : [],
        calculationBasis: proposal.calculationBasis && typeof proposal.calculationBasis === 'object'
          ? {
              ...proposal.calculationBasis,
              naturalDuration: normalizeDurationMetricDto(proposal.calculationBasis.naturalDuration),
              hardConstraintDuration: normalizeDurationMetricDto(proposal.calculationBasis.hardConstraintDuration),
            }
          : undefined,
      }
    : null

  return {
    ...raw,
    overshoot: normalizeDurationMetricDto(raw.overshoot),
    recoverable: normalizeDurationMetricDto(raw.recoverable),
    unrecoverable: normalizeDurationMetricDto(raw.unrecoverable),
    strategies: Array.isArray(raw.strategies)
      ? raw.strategies.map((strategy: Record<string, any>) => ({
          ...strategy,
          recoverDuration: normalizeDurationMetricDto(strategy.recoverDuration),
        }))
      : [],
    accelerationProposal: normalizedProposal,
  } as WbsTargetFeasibility
}

export async function listWbsTemplateCatalog(options: { includeNodes?: boolean } = {}) {
  const params = new URLSearchParams()
  if (options.includeNodes) params.set('includeNodes', 'true')
  const query = params.toString()
  return apiGet<WbsTemplateCatalogResponse>(`/api/planning/wbs-templates/catalog${query ? `?${query}` : ''}`)
}

export async function getWbsTemplateCatalogItem(templateId: string) {
  return apiGet<WbsTemplateCatalogItem>(`/api/planning/wbs-templates/catalog/${encodeURIComponent(templateId)}`)
}

export async function generateWbsTemplatePreview(
  payload: WbsTemplateGeneratePreviewPayload,
): Promise<WbsTemplateGeneratePreview> {
  const requestPayload = sanitizeLegacyScopeObjectFields({
    ...payload,
    duplicatePolicy: payload.duplicatePolicy ?? 'skip',
  })
  const preview = await apiPost<WbsTemplateGeneratePreview>('/api/planning/wbs-templates/generate-preview', requestPayload)
  return {
    ...preview,
    targetFeasibility: normalizeWbsTargetFeasibility(preview.targetFeasibility),
  }
}

export async function getWbsTemplateInferredFeatures(projectId: string) {
  return apiGet<WbsTemplateInferredFeatures>(`/api/projects/${encodeURIComponent(projectId)}/inferred-features`)
}
