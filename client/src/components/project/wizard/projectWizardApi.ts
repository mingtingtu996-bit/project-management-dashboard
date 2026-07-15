import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/apiClient'
import type {
  WbsConstructionOrganizationScenarioSummary,
  WbsTemplateGeneratePreview,
  WbsTargetFeasibility,
} from '@/services/wbsTemplateGenerationApi'
import type { DetailLevel, WizardDraftPayload, WizardStep } from './types'

export interface CompanyProjectTemplateItem {
  id: string
  name: string
  description?: string | null
  source_project_id?: string | null
  business_type?: string | null
  business_subtype?: string | null
  default_detail_level?: DetailLevel | null
  usage_count?: number | null
  is_default?: boolean | null
  snapshot?: Partial<WizardDraftPayload> | null
}

export interface WizardDraftItem {
  id: string
  name: string
  status: string
  wizard_draft_payload?: WizardDraftPayload | null
  draft_step?: string | number | null
  draft_updated_at?: string | null
  updated_at?: string | null
}

export interface ProjectListItem {
  id: string
  name: string
  status?: string | null
  metadata?: Record<string, unknown> | null
}

export interface WizardCreateResult {
  id: string
  projectId: string
  status: string
  generation?: {
    state?: 'queued' | 'running' | 'completed' | 'failed'
    attemptId?: string
    queuedAt?: string | null
    generationBatchId: string
    generatedRowCount?: number | null
    createdTaskCount?: number | null
    passedMilestoneCount?: number
    targetFeasibility?: WbsTargetFeasibility | null
    durationAssetUtilizationSummary?: DurationAssetUtilizationSummary | null
    candidateDurationAssetPreview?: CandidateDurationAssetPreview | null
    candidateNetworkEvaluation?: WbsTemplateGeneratePreview['candidateNetworkEvaluation']
    candidateAcceptancePlanPreview?: CandidateAcceptancePlanPreview | null
    planQualityDiagnostics?: WizardPlanQualityDiagnostics | null
    criticalPathRefresh?: WizardCriticalPathRefresh | null
    postCommitDerivations?: WizardPostCommitDerivationState | null
    createdTasks?: Array<{
      id: string
      title?: string | null
    }>
  } | null
}

export interface WizardGenerationStatus {
  projectId: string
  attemptId: string
  state: 'queued' | 'running' | 'completed' | 'failed'
  generationBatchId?: string | null
  queuedAt?: string | null
  startedAt?: string | null
  completedAt?: string | null
  failedAt?: string | null
  error?: string | null
  generatedRowCount?: number | null
  createdTaskCount?: number | null
  targetFeasibility?: WbsTargetFeasibility | null
  durationAssetUtilizationSummary?: DurationAssetUtilizationSummary | null
  candidateDurationAssetPreview?: CandidateDurationAssetPreview | null
  candidateNetworkEvaluation?: WbsTemplateGeneratePreview['candidateNetworkEvaluation']
  candidateAcceptancePlanPreview?: CandidateAcceptancePlanPreview | null
  planQualityDiagnostics?: WizardPlanQualityDiagnostics | null
  criticalPathRefresh?: WizardCriticalPathRefresh | null
  postCommitDerivations?: WizardPostCommitDerivationState | null
}

export interface WizardPostCommitDerivationStageState {
  status: 'pending' | 'succeeded' | 'failed'
  attemptCount: number
  lastAttemptAt?: string | null
  succeededAt?: string | null
  failedAt?: string | null
  lastError?: string | null
  output?: unknown
}

export interface WizardPostCommitDerivationState {
  source: 'wizard_post_commit_derivation_recovery'
  operationId: string
  projectId: string
  generationBatchId: string
  status: 'pending' | 'succeeded' | 'failed'
  createdAt: string
  updatedAt: string
  maxAttempts: number
  stages: {
    critical_path: WizardPostCommitDerivationStageState
    duration_evidence: WizardPostCommitDerivationStageState
  }
}

export interface WizardCriticalPathRefresh {
  source: 'project_wizard_post_commit_critical_path_refresh'
  status: 'refreshed' | 'failed'
  projectId?: string | null
  generationBatchId?: string | null
  refreshedAt?: string | null
  taskCount?: number | null
  eligibleTaskCount?: number | null
  criticalTaskCount?: number | null
  criticalTaskIds?: unknown
  projectDurationDays?: number | null
  calculationStatus?: string | null
  criticalPathInputHash?: string | null
  writesTaskDependencies?: boolean
  writesPlanDates?: boolean
  writesSeed?: boolean
  writesRuntimeCriticalPathProjection?: boolean
  writesCriticalPathFacts?: boolean
  mutationBoundary?: Record<string, unknown> | null
  error?: string | null
}

export interface MilestonePresetItem {
  code: string
  label: string
  required: boolean
}

export interface WizardProfileIssue {
  code: string
  severity: 'info' | 'warning' | 'blocking'
  title?: string | null
  message: string
  action?: string | null
  impact?: string | null
  scopeName?: string | null
  source?: string | null
  details?: Record<string, unknown> | null
}

export interface ScopeCoverageDiagnostic {
  code: 'SCOPE_AREA_UNDER_COVERED' | 'SCOPE_AREA_OVER_COVERED' | 'SCOPE_SIBLING_DUPLICATE' | 'SCOPE_DECOMPOSITION_AXIS_MIXED'
  severity: 'info' | 'warning' | 'blocking'
  message: string
  expectedAreaM2?: number | null
  accountedAreaM2?: number | null
  deltaAreaM2?: number | null
  coverageRatio?: number | null
  nodeNames?: string[]
}

export interface ScopeTemplateCoverageItem {
  scopeObjectId?: string | null
  scopeName: string
  objectType: string
  status: 'auto_schedulable' | 'manual_task_required' | 'missing_required_scope'
  title: string
  detail: string
  action: string
  matchedRulePatterns: string[]
  requiredByTemplates: string[]
}

export interface ScopeTemplateCoverageResult {
  summary: {
    autoSchedulableCount: number
    manualTaskRequiredCount: number
    missingRequiredScopeCount: number
  }
  items: ScopeTemplateCoverageItem[]
}

export interface CommercialFactReadinessItem {
  code: 'scale' | 'method' | 'scope' | 'special_feature' | 'resource_assumption'
  label: string
  status: 'ready' | 'warning' | 'blocking' | 'disabled'
  title: string
  detail: string
  action?: string | null
  evidence: string[]
}

export interface CommercialFactReadinessResult {
  summary: {
    readyCount: number
    warningCount: number
    blockingCount: number
    disabledCount: number
  }
  items: CommercialFactReadinessItem[]
}

export interface DurationAssetUtilizationSummary {
  source?: string
  evidenceLevel?: string
  mutationBoundary?: string
  scheduleRowCount?: number
  standardWorkDurationSeedRowCount?: number
  activeStandardWorkDurationSeedRowCount?: number
  fallbackStandardWorkDurationSeedRowCount?: number
  t2RhythmTemplateRowCount?: number
  activeT2RhythmTemplateRowCount?: number
  fallbackT2RhythmTemplateRowCount?: number
  dependencyAssetConsumedRowCount?: number
  processSeasonalDurationAssetRowCount?: number
  constructionCalendarRowCount?: number
  runtimeReferenceDaysRowCount?: number
  runtimeReferenceDaysConsumedRowCount?: number
  businessTypeProfileScheduleRowCount?: number
  businessTypeSpecialtyDurationAssetRowCount?: number
  businessTypeSpecificT2RhythmTemplateRowCount?: number
  durationRiskRangeRowCount?: number
  durationRiskP20MinDays?: number
  durationRiskP50MedianDays?: number
  durationRiskP80MaxDays?: number
  businessTypeRowsMissingSpecialtyDurationAssetCount?: number
  businessTypeRowsMissingSpecificT2RhythmTemplateCount?: number
  rowsMissingDurationAssetCount?: number
  rowsMissingT2RhythmTemplateCount?: number
  rowsMissingRuntimeReferenceDaysCount?: number
  businessTypeProfileBusinessTypeCodes?: string[]
  businessTypeSpecialtyDurationAssetBusinessTypeCodes?: string[]
  businessTypeSpecificT2RhythmBusinessTypeCodes?: string[]
  productionWritePolicy?: string
}

export interface CandidateAcceptancePlanPreviewItem {
  clientRowId: string
  title: string
  acceptanceType?: string | null
  plannedDate?: string | null
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  createdTaskId?: string | null
  createdAcceptancePlanId?: string | null
  materializationStatus?: string | null
  materializationEvidenceLevel?: string | null
  materializationMutationBoundary?: string | null
  featureTriggeredAcceptanceScheduleRow?: boolean | null
  acceptanceScheduleEvidence?: string | null
  executionPhase?: string | null
  executionLane?: string | null
  sourceRowSortOrder?: number | null
  sourceBasis?: string | null
}

export interface CandidateAcceptancePlanPreview {
  source?: string
  evidenceLevel?: string
  mutationBoundary?: string
  totalCount?: number
  datedCount?: number
  featureTriggeredAcceptanceScheduleRowCount?: number
  materializedCount?: number
  materializationRequiredForPlanConsistency?: boolean
  materializationStatus?: string | null
  materializationEvidenceLevel?: string | null
  materializationMutationBoundary?: string | null
  writesAcceptancePlans?: boolean
  fallbackFromProjectTarget?: boolean
  items?: CandidateAcceptancePlanPreviewItem[]
}

export interface CandidateDurationAssetPreviewItem {
  clientRowId: string
  createdTaskId?: string | null
  title: string
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  riskP20DurationDays?: number | null
  riskP50DurationDays?: number | null
  riskP80DurationDays?: number | null
  calendarBasis?: string | null
  constructionCalendarWindowCount?: number | null
  processSeasonalDurationAssetConsumed?: boolean
  processSeasonalClimateSignal?: string | null
  processSeasonalImpactBand?: string | null
  processSeasonalMultiplier?: number | null
  selectedDurationDays?: number | null
  baseSelectedDurationDays?: number | null
  standardWorkDurationSeedStableCode?: string | null
  standardWorkDurationSeedResolverSource?: string | null
  standardWorkDurationSeedResolverVersionId?: string | null
  t2RhythmTemplateId?: string | null
  t2RhythmTemplateResolverSource?: string | null
  t2RhythmTemplateResolverVersionId?: string | null
  runtimeReferenceDaysConsumed?: boolean
  runtimeReferenceDaysEvidenceLevel?: string | null
  runtimeReferenceDaysStableCode?: string | null
  runtimeReferenceDaysP50Days?: number | null
  runtimeReferenceDaysP80Days?: number | null
  runtimeReferenceDaysSampleCount?: number | null
  runtimeReferenceDaysMutationBoundary?: string | null
  dependencyAssetConsumed?: boolean
  dependencyAssetType?: string | null
  dependencyAssetStableCode?: string | null
  dependencyAssetAutoApplyPolicy?: string | null
  dependencyAssetStrength?: string | null
  dependencyAssetHandoffCategory?: string | null
  dependencyAssetDependencyType?: string | null
  dependencyAssetLagDays?: number | null
  dependencyAssetEvidenceSourceKeys?: string[]
  dependencyTimingAssetConsumed?: boolean
  dependencyTimingSelectedLagDays?: number | null
  dependencyRuleSource?: string | null
  dependencyLayerStack?: string | null
  dependencyProductionWritePolicy?: string | null
  phaseAnchorDependencyCount?: number | null
  dependencyStartAnchor?: boolean
  dependencyAnchorType?: string | null
  criticalPathCandidate?: boolean | null
  totalFloatDays?: number | null
  earlyStartOffsetDays?: number | null
  earlyFinishOffsetDays?: number | null
  lateStartOffsetDays?: number | null
  lateFinishOffsetDays?: number | null
  durationSelectionRule?: string | null
  durationCalibrationSource?: string | null
  durationMaturity?: string | null
  durationReviewGate?: string | null
  durationTruthSource?: string | null
  standardWorkDurationSeedP50Days?: number | null
  t2RhythmTemplateP50Days?: number | null
  realPlanSkeletonDurationDays?: number | null
  realPlanSkeletonFloorApplied?: boolean | null
  maxNonSkeletonAssetDays?: number | null
  projectScaleQuantityProxyApplied?: boolean
  projectScaleQuantityProxySource?: string | null
  projectScaleQuantityProxyValue?: number | null
  projectScaleQuantityProxyUnit?: string | null
  projectScaleQuantityProxyBasis?: string | null
  productivityDerivedDurationDays?: number | null
  durationAssetPlanDateApplied?: boolean
  durationAssetPreviousPlannedStartDate?: string | null
  durationAssetPreviousPlannedEndDate?: string | null
  durationAssetPlannedStartDate?: string | null
  durationAssetPlannedEndDate?: string | null
  durationAssetSelectedDurationDays?: number | null
  durationAssetPlanDateEvidenceLevel?: string | null
  durationAssetPlanDateMutationBoundary?: string | null
  candidateNetworkPlanDateApplied?: boolean
  candidateNetworkPreviousPlannedStartDate?: string | null
  candidateNetworkPreviousPlannedEndDate?: string | null
  candidateNetworkPlannedStartDate?: string | null
  candidateNetworkPlannedEndDate?: string | null
  candidateNetworkStartDay?: number | null
  candidateNetworkFinishDay?: number | null
  candidateNetworkDurationDays?: number | null
  candidateNetworkBasis?: string | null
  candidateNetworkPlanDateEvidenceLevel?: string | null
  candidateNetworkPlanDateMutationBoundary?: string | null
  businessType?: string | null
  businessTypeProfileSourceType?: string | null
  businessTypeProfileTemplateId?: string | null
  businessTypeProfileTemplateGroup?: string | null
  businessTypeProfilePackType?: string | null
  businessTypeProfileMutationBoundary?: string | null
  businessTypeSpecialtyDurationAssetApplied?: boolean
  businessTypeSpecificT2RhythmTemplateApplied?: boolean
  sourceRowSortOrder?: number
}

export interface CandidateDurationAssetSummaryRollupRow {
  clientRowId?: string | null
  title?: string | null
  previousPlannedStartDate?: string | null
  previousPlannedEndDate?: string | null
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  childRowCount?: number | null
  source?: string | null
  evidenceLevel?: string | null
  applicationStatus?: string | null
  mutationBoundary?: string | null
  sourceRowSortOrder?: number | null
}

export interface CandidateDurationAssetReviewAssetSummary {
  code: string
  label?: string | null
  reference?: string | null
  evidenceLevel?: string | null
  usageStatus?: string | null
  consumptionPolicy?: string | null
}

export interface CandidateDurationAssetReviewRow {
  clientRowId: string
  title?: string | null
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  sourceRowSortOrder?: number | null
  requiredAssetCodes?: string[]
  candidateRequiredAssetCodes?: string[]
  missingCandidateRequiredAssetCodes?: string[]
  candidateAssetCoverageStatus?: string | null
  nonApplicableCandidateAssetCodes?: string[]
  t2RhythmApplicability?: string | null
  presentAssetCodes?: string[]
  presentAssetSummaries?: CandidateDurationAssetReviewAssetSummary[]
  missingAssetCodes?: string[]
  missingAssetSummaries?: CandidateDurationAssetReviewAssetSummary[]
  assetCoverageStatus?: string | null
  qualityReviewAction?: string | null
  mutationBoundary?: string | null
}

export interface CandidateDurationAssetUncoveredScheduleRow {
  clientRowId: string
  title?: string | null
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  sourceRowSortOrder?: number | null
  missingInputCode?: string | null
  qualityReviewAction?: string | null
}

export interface CandidateDurationAssetPreview {
  source?: string
  evidenceLevel?: string
  mutationBoundary?: string
  totalCount?: number
  riskRangeCount?: number
  dependencyAssetCount?: number
  dependencySequenceEvidenceCount?: number
  criticalPathCandidateCount?: number
  floatCalculatedCount?: number
  durationSelectionBasisCount?: number
  projectScaleQuantityProxyCount?: number
  businessTypeSpecialtyDurationAssetCount?: number
  businessTypeSpecificT2RhythmTemplateCount?: number
  candidateNetworkPlanDateApplicationCount?: number
  durationAssetPlanDateApplicationCount?: number
  summaryRollupRowCount?: number
  summaryRollupRows?: CandidateDurationAssetSummaryRollupRow[]
  processSeasonalAdjustmentCount?: number
  constructionCalendarCount?: number
  planQualityReviewMode?: 'offline_development_calibration' | string | null
  runtimeApprovalRequired?: boolean
  blocksWizardCommit?: boolean
  blocksBaselinePublication?: boolean
  sourceScheduleRowCount?: number
  requiredDurationAssetRowCount?: number
  excludedScheduleRowCount?: number
  excludedSummaryScheduleRowCount?: number
  excludedRecordOnlyScheduleRowCount?: number
  excludedNonExecutableScheduleRowCount?: number
  uncoveredScheduleRowCount?: number
  uncoveredScheduleRows?: CandidateDurationAssetUncoveredScheduleRow[]
  durationAssetReviewRowCount?: number
  durationAssetReviewRows?: CandidateDurationAssetReviewRow[]
  writesDurationRuntime?: boolean
  writesTasks?: boolean
  items?: CandidateDurationAssetPreviewItem[]
}

export interface WizardPlanQualityDiagnostics {
  source?: 'wizard_generation_plan_quality_diagnostics' | string
  status?: 'ready_for_plan_preview' | 'offline_quality_review_recommended' | string
  intendedUse?: 'offline_development_quality_review_and_template_calibration' | string
  runtimeApprovalRequired?: false
  blocksWizardCommit?: false
  blocksBaselinePublication?: false
  candidateGapCodes?: string[]
  scheduleRowCount?: number
  durationAssetCoveredRowCount?: number
  durationAssetReviewRowCount?: number
  uncoveredDurationAssetRowCount?: number
  rowsMissingRuntimeReferenceDaysCount?: number
  projectedNetworkSpanDays?: number
  previewDependencyCount?: number
  unresolvedDependencyCount?: number
  acceptanceMilestoneCount?: number
  datedAcceptanceMilestoneCount?: number
  materializedAcceptanceMilestoneCount?: number
  commercialFactReadinessStatus?: string | null
  targetAlignmentSnapshot?: {
    status?: string
    targetEndDate?: string | null
    naturalEndDate?: string | null
    overshootDays?: number
    recoverableDays?: number
    unrecoverableDays?: number
    verdict?: string | null
    runtimeDecisionRequired?: false
    blocksWizardCommit?: false
    durationAssetPlanDateTargetRecalculation?: Record<string, unknown>
  }
  mutationBoundary?: string
}

export interface WizardProfilePreview {
  recommendation: {
    matchedTemplates: string[]
    triggeredItemPacks: string[]
    triggeredMilestones: string[]
    triggeredDangerItems?: string[]
    expectedRowCount: Record<DetailLevel, number>
    defaultPlanOutput?: 'master_plan'
    masterPlanProfile?: MasterPlanProfile
    foundationMethodCandidates?: FoundationMethodCandidate[]
    recommendationRationale?: string[]
  }
  estimatedRowCount: number
  targetFeasibility?: WbsTargetFeasibility | null
  constructionOrganizationScenario?: WbsConstructionOrganizationScenarioSummary | null
  previewSummary: {
    businessType: string
    detailLevel: DetailLevel
    buildingCount: number
    templateCount: number
    milestoneCount: number
  }
  profile: {
    identity: {
      projectName?: string | null
      businessType: string
      businessSubtype?: string | null
      planScopeCaliber?: string | null
      deliveryStandard?: string | null
      terminalEvent?: string | null
      mode: string
    }
    locationFacts?: {
      rawLocation?: string | null
      province?: string | null
      city?: string | null
      regionCode?: string | null
      climateZone?: string | null
      climateSignals?: string[]
      weatherImpactBands?: string[]
      inferenceStatus?: string
      source?: string
    } | null
    scale: {
      totalAreaM2?: number | null
      aboveGroundAreaM2?: number | null
      basementAreaM2?: number | null
      siteAreaM2?: number | null
      buildingCount: number
      highestBuildingFloorCount?: number | null
      standardFloorCount?: number | null
      basementLevelCount?: number | null
      foundationDepthM?: number | null
    }
    methods: {
      methodVariantCodes: string[]
      prefabSystemCodes: string[]
      elementVariantCodes: string[]
      buildingPatternCodes: string[]
      foundationMethodCandidates?: FoundationMethodCandidate[]
    }
    features: {
      userSelected: Record<string, number | boolean | string[]>
      inferred: Record<string, string[]>
    }
    commercialFactReadiness?: CommercialFactReadinessResult
    generation: {
      detailLevel: DetailLevel
      estimatedRowCount: number
      defaultPlanOutput?: 'master_plan'
      masterPlanProfile?: MasterPlanProfile
      durationAssetUtilizationSummary?: DurationAssetUtilizationSummary | null
      candidateDurationAssetPreview?: CandidateDurationAssetPreview | null
      candidateNetworkEvaluation?: WbsTemplateGeneratePreview['candidateNetworkEvaluation']
      candidateAcceptancePlanPreview?: CandidateAcceptancePlanPreview | null
      planQualityDiagnostics?: WizardPlanQualityDiagnostics | null
      templateCount: number
      milestoneCount: number
    }
    scopeCoverageDiagnostics?: ScopeCoverageDiagnostic[]
    scopeTemplateCoverage?: ScopeTemplateCoverageResult
    issues: WizardProfileIssue[]
  }
}

export interface FoundationMethodCandidate {
  code: string
  label: string
  category: 'shallow_foundation' | 'pile_foundation' | 'pit_support' | 'dewatering_monitoring'
  selected: boolean
}

export interface MasterPlanProfile {
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

export function listCompanyProjectTemplates(companyId: string) {
  return apiGet<CompanyProjectTemplateItem[]>(`/api/companies/${encodeURIComponent(companyId)}/project-templates`, {
    runtimeCache: 'off',
  })
}

export function listCompanyProjectDrafts(companyId: string) {
  return apiGet<WizardDraftItem[]>(`/api/companies/${encodeURIComponent(companyId)}/project-drafts`, {
    runtimeCache: 'off',
  })
}

export function listVisibleProjects() {
  return apiGet<ProjectListItem[]>('/api/projects', { runtimeCache: 'off' })
}

export function createWizardProjectDraft(payload: WizardDraftPayload, companyId?: string | null) {
  return apiPost<WizardCreateResult>('/api/projects/wizard', {
    companyId: companyId ?? undefined,
    name: payload.projectName || undefined,
    location: payload.location || undefined,
    total_area: payload.totalAreaM2,
    planned_start_date: payload.plannedStartDate,
    planned_end_date: payload.plannedEndDate,
    actual_start_date: payload.actualStartDate,
    wizardPayload: payload,
    commit: false,
  })
}

export function saveWizardProjectDraft(projectId: string, payload: WizardDraftPayload, step: WizardStep) {
  return apiPatch<{ id: string; lastSaved: string; step: WizardStep }>(
    `/api/projects/${encodeURIComponent(projectId)}/wizard/draft`,
    {
      step,
      wizard_draft_payload: {
        ...payload,
        step,
      },
    },
  )
}

export function deleteWizardProjectDraft(projectId: string) {
  return apiDelete<void>(`/api/projects/${encodeURIComponent(projectId)}/wizard/draft`)
}

export function commitWizardProject(payload: WizardDraftPayload, options?: {
  projectId?: string | null
  companyId?: string | null
  asyncGeneration?: boolean
}) {
  return apiPost<WizardCreateResult>('/api/projects/wizard', {
    projectId: options?.projectId ?? undefined,
    companyId: options?.companyId ?? undefined,
    name: payload.projectName || undefined,
    location: payload.location || undefined,
    total_area: payload.totalAreaM2,
    planned_start_date: payload.plannedStartDate,
    planned_end_date: payload.plannedEndDate,
    actual_start_date: payload.actualStartDate,
    wizardPayload: payload,
    saveAsCompanyTemplate: payload.saveAsCompanyTemplate,
    companyTemplateName: payload.companyTemplateName,
    commit: true,
    asyncGeneration: options?.asyncGeneration ?? true,
  })
}

export function getWizardGenerationStatus(projectId: string, attemptId: string) {
  return apiGet<WizardGenerationStatus>(
    `/api/projects/${encodeURIComponent(projectId)}/wizard/generation/${encodeURIComponent(attemptId)}`,
  )
}

export function previewWizardProfile(payload: WizardDraftPayload, projectId?: string | null) {
  const { projectId: _discardedProjectId, ...previewPayload } = payload as WizardDraftPayload & {
    projectId?: unknown
  }
  const normalizedProjectId = String(projectId ?? '').trim()
  const endpoint = normalizedProjectId
    ? `/api/projects/${encodeURIComponent(normalizedProjectId)}/wizard/preview`
    : '/api/projects/wizard/preview'
  return apiPost<WizardProfilePreview>(endpoint, previewPayload)
}

export function listMilestonePresets(params: { businessType?: string | null; mainStage?: string | null }) {
  const search = new URLSearchParams()
  if (params.businessType) search.set('businessType', params.businessType)
  if (params.mainStage) search.set('mainStage', params.mainStage)
  const query = search.toString()
  return apiGet<MilestonePresetItem[]>(`/api/milestone-presets${query ? `?${query}` : ''}`, {
    runtimeCache: 'off',
  })
}
