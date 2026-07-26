import {
  T2_DIVISION_RHYTHM_TEMPLATE_SEED,
  type T2DivisionFamily,
  type T2DivisionRhythmTemplate,
  type T2RhythmWorkfaceUnit,
} from '../seeds/t2DivisionRhythmTemplateSeed.js'
import { buildT2RhythmScheduleCandidateNetwork } from './t2RhythmScheduleCandidateNetworkService.js'
import { evaluateT2RhythmScheduleCandidateNetwork } from './t2RhythmScheduleCandidateNetworkEvaluationService.js'
import { buildT2RhythmProductionCapacityEvidence } from './t2RhythmProductionCapacityEvidenceService.js'
import { T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS } from './t2RhythmTemplateReplayAcceptanceService.js'
import {
  buildT2RhythmTemplateReplayEvidence,
  type T2RhythmTemplateReplayEvidenceSample,
} from './t2RhythmTemplateReplayEvidenceService.js'
import {
  selectT2RhythmSchedulePhase1Network,
} from './t2RhythmSchedulePhase1SelectionService.js'
import {
  orderedInclusiveDurationDays,
  signedDurationDayDelta,
} from '../utils/durationDays.js'
import {
  FORMAL_BUSINESS_TYPE_CODES,
  getT2RhythmBusinessTypeCodesForFormalBusinessType,
} from './businessTypeRegistryService.js'
import { BUSINESS_TYPE_RECOMMENDATIONS } from './projectTypeRecommendations.js'
import {
  evaluateT2RhythmStandardLibraryTrustGate,
  type T2RhythmStandardLibraryTrustGate,
} from './t2RhythmStandardLibraryTrustGateService.js'
import type {
  T2RhythmStandardLibraryL5ReleaseGate,
} from './t2RhythmStandardLibraryL5ReleaseGateService.js'

export { T2_DIVISION_RHYTHM_TEMPLATE_SEED }

export type T2RhythmTemplateSelectionInput = {
  businessTypeCode?: string | null
  phaseWindow?: string | null
  divisionFamily?: T2DivisionFamily | string | null
  subdivisionFamily?: string | null
  methodVariantCodes?: string[]
  structureTypeCodes?: string[]
  scopeDimensions?: string[]
}

export type T2RhythmTemplateRegistryAudit = {
  templateCount: number
  businessTypeCount: number
  divisionFamilyCount: number
  subdivisionFamilyCount: number
  businessTypeCodes: string[]
  divisionFamilies: string[]
  standardLibraryThicknessCoverage: {
    status: 'ready' | 'needs_expansion'
    currentTemplateCount: number
    targetTemplateCount: number
    coverageRate: number
    weakestBusinessTypeCodes: string[]
    byBusinessType: Array<{
      businessTypeCode: string
      status: 'ready' | 'thin'
      currentTemplateCount: number
      targetTemplateCount: number
      coverageRate: number
      missingTemplateCount: number
    }>
  }
  systemBusinessTypeCoverage: {
    status: 'ready' | 'blocked'
    formalBusinessTypeCount: number
    coveredBusinessTypeCount: number
    directCoveredBusinessTypeCount: number
    coverageRate: number
    directCoverageRate: number
    missingBusinessTypeCodes: string[]
    missingDirectBusinessTypeCodes: string[]
    t2RhythmBusinessTypeCodes: string[]
    mappings: Array<{
      businessTypeCode: string
      status: 'ready' | 'blocked'
      directlyCovered: boolean
      mappedRhythmBusinessTypeCodes: string[]
      matchedRhythmBusinessTypeCodes: string[]
      missingMappedRhythmBusinessTypeCodes: string[]
    }>
  }
  businessTypeProfiles: Array<{
    businessTypeCode: string
    status: 'ready' | 'needs_expansion'
    templateCount: number
    coveredDivisionFamilies: string[]
    requiredDivisionFamilies: string[]
    missingRequiredDivisionFamilies: string[]
  }>
  representativeScheduleScenarioCoverage: {
    status: 'ready' | 'blocked'
    readyScenarioCount: number
    minimumScenarioCount: number
    scenarios: Array<{
      scenarioId: string
      businessTypeCode: string
      phaseWindow: string
      divisionFamily: string
      subdivisionFamily: string
      status: 'schedulable_candidate' | 'candidate_conflict' | 'no_template_match'
      canEnterC1913Phase1Selection: boolean
      requiresTemplateExpansion: boolean
      selectedTemplateIds: string[]
      durationBearingWindowCount: number
      dependencyCandidateCount: number
      hardGateCount: number
      conflictCodes: string[]
    }>
  }
  representativePhase1EvaluationCoverage: {
    status: 'ready' | 'blocked'
    readyEvaluationCount: number
    minimumEvaluationCount: number
    evaluations: Array<{
      scenarioId: string
      candidateId: string
      status: 'phase1_readonly_evaluation_ready' | 'candidate_conflict'
      canEnterC1913Phase1Selection: boolean
      topologyEvaluated: boolean
      floatCalculated: boolean
      networkSpanDays: number
      minimumTemplateAnchorSpanDays: number
      nodeEvaluationCount: number
      criticalWindowCodes: string[]
      conflictCodes: string[]
      mutationBoundary: {
        writesTaskDependencies: false
        writesPlanDates: false
        writesCriticalPathFacts: false
        writesSeed: false
        writesBaseline: false
      }
    }>
  }
  representativePhase1MultiNetworkSelectionCoverage: {
    status: 'ready' | 'blocked'
    readySelectionCount: number
    minimumSelectionCount: number
    selections: Array<{
      scenarioId: string
      selectionId: string
      businessTypeCode: string
      divisionFamily: string
      status: 'phase1_selection_ready' | 'manual_review_required'
      selectedCandidateId: string | null
      candidateCount: number
      candidateIds: string[]
      eligibleCandidateCount: number
      eligibleCandidateIds: string[]
      rejectedCandidateCount: number
      rejectedReasonCodes: string[]
      rejectedConflictCandidateCount: number
      rejectedMissingReceiptCandidateCount: number
      rejectedMissingSelectorReceiptCandidateCount: number
      rejectedLiveReplayTrustGateCandidateCount: number
      trustGateEvidenceMode: 'representative_shadow_probe_not_release_evidence'
      combinationConsistencyGateStatus: 'pass' | 'pass_with_manual_review_rejections' | 'blocked'
      linearPriorityCanOverrideAssemblyConflict: false
      selectionRankSignals: string[]
      mutationBoundary: {
        writesTaskDependencies: false
        writesPlanDates: false
        writesCriticalPathFacts: false
        writesSeed: false
        writesBaseline: false
        writesRuntimePublications: false
      }
    }>
  }
  representativeReplayFixtureCoverage: {
    status: 'ready' | 'blocked'
    readyFixtureCount: number
    minimumFixtureCount: number
    fixtures: Array<{
      scenarioId: string
      templateId: string | null
      selectedTemplateIds: string[]
      status: 'shadow_candidate' | 'data_collection_open'
      readyForShadow: boolean
      readyForPublish: false
      sampleCount: number
      comparableWorkfaceWindowCount: number
      p80CaptureRate: number
      medianAbsoluteErrorDays: number
      gateSlipMedianDays: number
      dependencyViolationRate: number
      evidenceRefCount: number
      sampleQualityIssueCount: number
      distinctWorkfaceCount: number
      nonZeroAbsoluteErrorSampleCount: number
      earlyFinishSampleCount: number
      delayedFinishSampleCount: number
      maximumAbsoluteErrorDays: number
      criticalWindowCodes: string[]
      gateWindowCodes: string[]
      replayCoveredWindowCodes: string[]
      missingCriticalWindowCodes: string[]
      missingGateWindowCodes: string[]
      criticalWindowReplayDepth: Array<{
        windowCode: string
        status: 'ready' | 'blocked'
        sampleCount: number
        distinctWorkfaceCount: number
        nonZeroAbsoluteErrorSampleCount: number
        earlyFinishSampleCount: number
        delayedFinishSampleCount: number
        maximumAbsoluteErrorDays: number
        missingEvidenceCodes: string[]
      }>
      gateWindowReplayDepth: Array<{
        windowCode: string
        status: 'ready' | 'blocked'
        sampleCount: number
        distinctWorkfaceCount: number
        nonZeroAbsoluteErrorSampleCount: number
        earlyFinishSampleCount: number
        delayedFinishSampleCount: number
        maximumAbsoluteErrorDays: number
        missingEvidenceCodes: string[]
      }>
      underSampledCriticalWindowCodes: string[]
      lowDiversityCriticalWindowCodes: string[]
      flatVarianceCriticalWindowCodes: string[]
      singleSidedGateSlipCriticalWindowCodes: string[]
      outOfControlCriticalWindowCodes: string[]
      underSampledGateWindowCodes: string[]
      lowDiversityGateWindowCodes: string[]
      flatVarianceGateWindowCodes: string[]
      singleSidedGateSlipGateWindowCodes: string[]
      outOfControlGateWindowCodes: string[]
      blockingReasons: string[]
      governance: {
        directSeedMutationAllowed: false
        writesPlanDates: false
        writesTaskDependencies: false
        requiresL5Publication: true
      }
    }>
  }
  businessTypeRepresentativeEvidenceMatrix: Array<{
    businessTypeCode: string
    status: 'ready' | 'blocked'
    representativeScenarioId: string | null
    selectedTemplateIds: string[]
    businessTypeProfileStatus: 'ready' | 'needs_expansion' | 'missing'
    representativeScheduleScenarioStatus: 'schedulable_candidate' | 'candidate_conflict' | 'no_template_match' | 'missing'
    phase1EvaluationStatus: 'phase1_readonly_evaluation_ready' | 'candidate_conflict' | 'missing'
    replayFixtureStatus: 'shadow_candidate' | 'data_collection_open' | 'missing'
    canEnterC1913Phase1Selection: boolean
    readyForShadow: boolean
    missingEvidenceCodes: string[]
    mutationBoundary: {
      writesTaskDependencies: false
      writesPlanDates: false
      writesCriticalPathFacts: false
      writesSeed: false
      writesBaseline: false
      requiresL5Publication: true
    }
  }>
  divisionFamilyRepresentativeEvidenceMatrix: Array<{
    divisionFamily: string
    status: 'ready' | 'blocked'
    representativeScenarioId: string | null
    selectedTemplateIds: string[]
    representativeScheduleScenarioStatus: 'schedulable_candidate' | 'candidate_conflict' | 'no_template_match' | 'missing'
    phase1EvaluationStatus: 'phase1_readonly_evaluation_ready' | 'candidate_conflict' | 'missing'
    replayFixtureStatus: 'shadow_candidate' | 'data_collection_open' | 'missing'
    canEnterC1913Phase1Selection: boolean
    readyForShadow: boolean
    missingEvidenceCodes: string[]
    mutationBoundary: {
      writesTaskDependencies: false
      writesPlanDates: false
      writesCriticalPathFacts: false
      writesSeed: false
      writesBaseline: false
      requiresL5Publication: true
    }
  }>
  templateRepresentativeEvidenceMatrix: Array<{
    templateId: string
    status: 'ready' | 'blocked'
    representativeScenarioIds: string[]
    selectedTemplateIds: string[]
    representativeScheduleScenarioStatus: 'schedulable_candidate' | 'candidate_conflict' | 'no_template_match'
    phase1EvaluationStatus: 'phase1_readonly_evaluation_ready' | 'candidate_conflict'
    replayFixtureStatus: 'shadow_candidate' | 'data_collection_open'
    canEnterC1913Phase1Selection: boolean
    readyForShadow: boolean
    missingEvidenceCodes: string[]
    mutationBoundary: {
      writesTaskDependencies: false
      writesPlanDates: false
      writesCriticalPathFacts: false
      writesSeed: false
      writesBaseline: false
      requiresL5Publication: true
    }
  }>
  phaseWindowRepresentativeEvidenceMatrix: Array<{
    phaseWindow: string
    status: 'ready' | 'blocked'
    representativeScenarioIds: string[]
    selectedTemplateIds: string[]
    representativeScheduleScenarioStatus: 'schedulable_candidate' | 'candidate_conflict' | 'no_template_match' | 'missing'
    phase1EvaluationStatus: 'phase1_readonly_evaluation_ready' | 'candidate_conflict' | 'missing'
    replayFixtureStatus: 'shadow_candidate' | 'data_collection_open' | 'missing'
    canEnterC1913Phase1Selection: boolean
    readyForShadow: boolean
    missingEvidenceCodes: string[]
    mutationBoundary: {
      writesTaskDependencies: false
      writesPlanDates: false
      writesCriticalPathFacts: false
      writesSeed: false
      writesBaseline: false
      requiresL5Publication: true
    }
  }>
  replayAcceptancePolicy: {
    status: 'actual_replay_required_before_publish'
    minimumSampleCount: number
    minimumComparableWorkfaceWindowCount: number
    minimumP80CaptureRate: number
    maximumMedianAbsoluteErrorDays: number
    maximumGateSlipMedianDays: number
    maximumDependencyViolationRate: number
    directSeedMutationAllowed: false
    autoPublishAllowed: false
    writesPlanDates: false
    writesTaskDependencies: false
    releasePath: 'replay_candidate_shadow_gate_publish_rollback'
  }
  scheduleTrustReady: boolean
  blockingDefects: string[]
  scheduleReadinessGate: {
    status: 'shadow_candidate_ready_not_publishable' | 'not_ready'
    canEnterC1913Phase1Selection: boolean
    canAutoMaterializeTaskDependencies: false
    canAutoPublishRuntimeExperience: false
    trustBoundary: 'candidate_network_and_replay_shadow_only' | 'blocked_registry_defects'
    liveReplayTrustGate?: T2RhythmStandardLibraryTrustGate | null
    phase1MultiNetworkSelectionTrustGate?: T2RhythmPhase1MultiNetworkSelectionTrustGate | null
    l5ReleaseGate?: T2RhythmStandardLibraryL5ReleaseGate | null
    dimensions: {
      precision: {
        status: 'ready' | 'blocked'
        checksPassed: string[]
        blockingDefects: string[]
      }
      breadth: {
        status: 'ready' | 'blocked'
        checksPassed: string[]
        minimumTemplateCount: number
        minimumBusinessTypeCount: number
        minimumDivisionFamilyCount: number
        minimumSubdivisionFamilyCount: number
        representativeScheduleScenarioCount: number
        representativePhase1EvaluationCount: number
        readyBusinessTypeProfileCount: number
        readyBusinessTypeRepresentativeEvidenceCount: number
        readyDivisionFamilyRepresentativeEvidenceCount: number
        readyTemplateRepresentativeEvidenceCount: number
        readyPhaseWindowRepresentativeEvidenceCount: number
        blockingDefects: string[]
      }
      depth: {
        status: 'ready' | 'blocked'
        checksPassed: string[]
        representativeReplayFixtureCount: number
        blockingDefects: string[]
      }
    }
    releaseBlockers: string[]
  }
}

export type T2RhythmPhase1MultiNetworkSelectionTrustGate = {
  source: 't2_rhythm_phase1_multinetwork_selection_trust_gate'
  status: 'phase1_multinetwork_selection_ready_not_publishable' | 'not_trustworthy_for_real_schedule_selection'
  evidenceMode: 'archived_phase1_selector_replay' | 'representative_shadow_probe_not_release_evidence'
  trustBoundary: 'archived_phase1_selector_replay_only' | 'representative_shadow_probe_only'
  canTrustForRealScheduleSelection: boolean
  readySelectionCount: number
  minimumSelectionCount: number
  scenarioCoverageCount: number
  minimumScenarioCoverageCount: number
  eligibleCandidateCount: number
  rejectedConflictCandidateCount: number
  selectedTemplateIds?: string[]
  selectionEvidenceRefs: string[]
  releaseBlockers: string[]
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
    writesSeed: false
    writesBaseline: false
    writesRuntimePublications: false
  }
}

export type T2RhythmReleaseEvidenceClosure = {
  source: 't2_rhythm_release_evidence_closure'
  status: 'ready_not_publishable' | 'blocked'
  selectedTemplateIds: string[]
  requiredGateCodes: Array<'archived_live_replay' | 'c19_13_phase1_multinetwork_selection' | 'l5_canary_handoff'>
  readyGateCodes: Array<'archived_live_replay' | 'c19_13_phase1_multinetwork_selection' | 'l5_canary_handoff'>
  blockingGateCodes: Array<'archived_live_replay' | 'c19_13_phase1_multinetwork_selection' | 'l5_canary_handoff'>
  templateScopeMismatchCodes: string[]
  trustBoundary: 'manual_promotion_required_before_runtime_publication' | 'blocked_release_evidence'
  releaseEvidenceRefs: string[]
  canUseForRealScheduleCalibration: boolean
  canUseForRealScheduleSelection: boolean
  canEnterL5Canary: boolean
  canAutoMaterializeTaskDependencies: false
  canAutoPublishRuntimeExperience: false
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
    writesSeed: false
    writesBaseline: false
    writesRuntimePublications: false
  }
}

export type T2RhythmTemplateRegistryAuditInput = {
  liveReplayTrustGate?: T2RhythmStandardLibraryTrustGate | null
  phase1MultiNetworkSelectionTrustGate?: T2RhythmPhase1MultiNetworkSelectionTrustGate | null
  l5ReleaseGate?: T2RhythmStandardLibraryL5ReleaseGate | null
}

export type T2RhythmTemplateAssemblyCompatibilityInput = {
  templateIds: string[]
  organizationAssumptions?: string[]
  selectedWorkfaceUnits?: string[]
  facts?: Record<string, unknown>
  priorityAdjudication?: {
    selectedTemplateId?: string | null
    selectedBy?: string | null
    priorityRank?: string[]
  }
}

export type T2RhythmTemplateAssemblyConflict = {
  conflictCode:
    | 'unknown_template'
    | 'incompatible_organization_assumption'
    | 'missing_required_fact'
    | 'unsupported_workface_unit'
    | 'duplicate_template'
    | 'priority_override_blocked_by_assembly_conflict'
  templateId: string
  detail: string
  factKey?: string
}

export type T2RhythmTemplateAssemblyCompatibilityResult = {
  compatible: boolean
  status: 'compatible_candidate' | 'candidate_conflict'
  conflicts: T2RhythmTemplateAssemblyConflict[]
  templateIds: string[]
  priorityAdjudication?: {
    selectedTemplateId: string | null
    selectedBy: string | null
    priorityRank: string[]
    assemblyFeasibilityRequired: true
    priorityOverrideBlocked: boolean
  }
}

export type T2RhythmScheduleCandidatePackageInput = {
  liveReplayTrustGate?: T2RhythmStandardLibraryTrustGate | null
  phase1MultiNetworkSelectionTrustGate?: T2RhythmPhase1MultiNetworkSelectionTrustGate | null
  l5ReleaseGate?: T2RhythmStandardLibraryL5ReleaseGate | null
  selection: T2RhythmTemplateSelectionInput
  organizationAssumptions?: string[]
  selectedWorkfaceUnits?: string[]
  facts?: Record<string, unknown>
  priorityAdjudication?: T2RhythmTemplateAssemblyCompatibilityInput['priorityAdjudication']
  limit?: number
}

export type T2RhythmScheduleCandidatePackage = {
  source: 't2_division_rhythm_schedule_candidate_package'
  tier: 'T2'
  status: 'schedulable_candidate' | 'candidate_conflict' | 'no_template_match'
  selectedTemplateIds: string[]
  templateCount: number
  durationBearingWindowCount: number
  candidateDependencyEdgeCount: number
  hardGateCount: number
  packageWindows: Array<{
    templateId: string
    windowCode: string
    startDay: number
    endDay: number
    durationDays: number
    role: string
    source: 't2_division_rhythm_template_seed'
    confidence: T2DivisionRhythmTemplate['confidence']
    durationBearing: boolean
  }>
  durationContextCandidates: Array<{
    sourceTemplateId: string
    windowCode: string
    recommendedDurationDays: number
    planReferenceDays: number
    planDurationTruthSource: 'parent_package_rhythm_window'
    tier: 'T2'
    governanceStatus: T2DivisionRhythmTemplate['governance']['governanceStatus']
    sourceType: T2DivisionRhythmTemplate['sourceType']
    autoApply: false
  }>
  dependencyCandidates: Array<T2DivisionRhythmTemplate['dependencyEdges'][number] & {
    sourceTemplateId: string
    tier: 'T2'
    autoApply: false
  }>
  hardGates: Array<T2DivisionRhythmTemplate['hardGates'][number] & {
    sourceTemplateId: string
    tier: 'T2'
    autoApply: false
  }>
  scheduleTrustSummaries: Array<{
    sourceTemplateId: string
    criticalPathRoles: string[]
    durationDrivers: string[]
    workfaceReadinessSignals: string[]
    assemblyRiskTags: string[]
    replayAdmission: T2DivisionRhythmTemplate['scheduleTrust']['evidenceAnchors']['replayAdmission']
  }>
  productionFeasibilitySummaries: Array<{
    sourceTemplateId: string
    calendarBasis: T2DivisionRhythmTemplate['productionFeasibility']['calendarBasis']
    workfaceUnit: T2RhythmWorkfaceUnit
    minimumParallelWorkfaces: number
    recommendedCrewStreams: number
    resourceReadinessSignals: string[]
    calendarConstraintSignals: string[]
    capacityRiskTags: string[]
  }>
  standardLibraryReadiness: {
    status: T2RhythmTemplateRegistryAudit['scheduleReadinessGate']['status']
    precisionStatus: T2RhythmTemplateRegistryAudit['scheduleReadinessGate']['dimensions']['precision']['status']
    breadthStatus: T2RhythmTemplateRegistryAudit['scheduleReadinessGate']['dimensions']['breadth']['status']
    depthStatus: T2RhythmTemplateRegistryAudit['scheduleReadinessGate']['dimensions']['depth']['status']
    evidenceSummary: {
      source: 't2_standard_library_readiness_evidence_summary'
      precisionChecksPassed: string[]
      breadthChecksPassed: string[]
      depthChecksPassed: string[]
      representativeScheduleScenarioCount: number
      representativePhase1EvaluationCount: number
      representativeReplayFixtureCount: number
      readyBusinessTypeProfileCount: number
      readyBusinessTypeRepresentativeEvidenceCount: number
      readyDivisionFamilyRepresentativeEvidenceCount: number
      readyTemplateRepresentativeEvidenceCount: number
      readyPhaseWindowRepresentativeEvidenceCount: number
      trustBoundary: T2RhythmTemplateRegistryAudit['scheduleReadinessGate']['trustBoundary']
    }
    canEnterC1913Phase1Selection: boolean
    canAutoMaterializeTaskDependencies: false
    canAutoPublishRuntimeExperience: false
    liveReplayTrustGate?: T2RhythmStandardLibraryTrustGate | null
    phase1MultiNetworkSelectionTrustGate?: T2RhythmPhase1MultiNetworkSelectionTrustGate | null
    l5ReleaseGate?: T2RhythmStandardLibraryL5ReleaseGate | null
    releaseEvidenceClosure?: T2RhythmReleaseEvidenceClosure
    releaseBlockers: string[]
  }
  selectionCoverage: {
    status: 'covered' | 'no_template_match'
    canEnterC1913Phase1Selection: boolean
    requiresTemplateExpansion: boolean
    requested: {
      businessTypeCode: string | null
      phaseWindow: string | null
      divisionFamily: string | null
      subdivisionFamily: string | null
      methodVariantCodes: string[]
      structureTypeCodes: string[]
      scopeDimensions: string[]
    }
    missingSelectorDimensions: string[]
    gapReasons: string[]
    nearestCompatibleTemplateIds: string[]
  }
  selectionReceipts: Array<{
    templateId: string
    selectionStatus: 'selected_explicit_match'
    rank: number
    selectorScore: number
    selectionBasis: 'explicit_selector_match_and_score_rank'
    requestedDimensions: ReturnType<typeof buildRequestedSelectionSnapshot>
    matchedDimensions: ReturnType<typeof buildRequestedSelectionSnapshot>
    unmatchedExplicitDimensions: string[]
    selectorPurity: {
      allExplicitDimensionsMatched: boolean
      noT1T3Leakage: boolean
      exactPhaseWindowMatch: boolean
      exactDivisionFamilyMatch: boolean
      exactSubdivisionFamilyMatch: boolean
    }
    mutationBoundary: {
      writesTaskDependencies: false
      writesPlanDates: false
      writesCriticalPathFacts: false
      writesSeed: false
      writesBaseline: false
      writesRuntimePublications: false
    }
  }>
  compatibility: T2RhythmTemplateAssemblyCompatibilityResult
  scheduleTrustPolicy: {
    autoApply: false
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    requiresAssemblyCompatibility: true
    requiresL5Publication: true
    downstreamConsumer: 'DurationInputAssembler_or_C19_13_phase1_candidate_network'
  }
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean))).sort((left, right) => left.localeCompare(right))
}

function normalizeCode(value: unknown) {
  return normalizeLower(value).replace(/[\s-]+/g, '_')
}

function intersects(left: string[] | undefined, right: string[] | undefined) {
  const rightSet = new Set((right ?? []).map(normalizeCode).filter(Boolean))
  return (left ?? []).some((value) => rightSet.has(normalizeCode(value)))
}

function includesNormalized(values: string[] | undefined, target: unknown) {
  const normalizedTarget = normalizeCode(target)
  if (!normalizedTarget) return false
  return (values ?? []).some((value) => normalizeCode(value) === normalizedTarget)
}

function hasExplicitSelectionValues(values: string[] | undefined) {
  return (values ?? []).some((value) => Boolean(normalizeCode(value)))
}

function scoreTemplate(template: T2DivisionRhythmTemplate, input: T2RhythmTemplateSelectionInput) {
  let score = 0
  if (includesNormalized(template.applicability.businessTypeCodes, input.businessTypeCode)) score += 45
  if (includesNormalized(template.applicability.phaseWindows, input.phaseWindow)) score += 20
  if (includesNormalized(template.applicability.divisionFamilies, input.divisionFamily)) score += 28
  if (includesNormalized(template.applicability.subdivisionFamilies, input.subdivisionFamily)) score += 16
  if (intersects(template.applicability.methodVariantCodes, input.methodVariantCodes)) score += 8
  if (intersects(template.applicability.structureTypeCodes, input.structureTypeCodes)) score += 6
  if (intersects(template.applicability.requiredScopeDimensions, input.scopeDimensions)) score += 8
  if (template.confidence === 'high') score += 5
  if (template.confidence === 'medium') score += 2
  return score
}

function matchesExplicitSelector(template: T2DivisionRhythmTemplate, input: T2RhythmTemplateSelectionInput) {
  if (normalizeCode(input.businessTypeCode) && !includesNormalized(template.applicability.businessTypeCodes, input.businessTypeCode)) {
    return false
  }
  if (normalizeCode(input.phaseWindow) && !includesNormalized(template.applicability.phaseWindows, input.phaseWindow)) {
    return false
  }
  if (normalizeCode(input.divisionFamily) && !includesNormalized(template.applicability.divisionFamilies, input.divisionFamily)) {
    return false
  }
  if (normalizeCode(input.subdivisionFamily) && !includesNormalized(template.applicability.subdivisionFamilies, input.subdivisionFamily)) {
    return false
  }
  if (hasExplicitSelectionValues(input.methodVariantCodes) && !intersects(template.applicability.methodVariantCodes, input.methodVariantCodes)) {
    return false
  }
  if (hasExplicitSelectionValues(input.structureTypeCodes) && !intersects(template.applicability.structureTypeCodes, input.structureTypeCodes)) {
    return false
  }
  if (hasExplicitSelectionValues(input.scopeDimensions) && !intersects(template.applicability.requiredScopeDimensions, input.scopeDimensions)) {
    return false
  }
  return true
}

function normalizedSelectionArray(values: string[] | undefined) {
  return unique(values ?? [])
}

function buildRequestedSelectionSnapshot(input: T2RhythmTemplateSelectionInput) {
  return {
    businessTypeCode: normalizeText(input.businessTypeCode) || null,
    phaseWindow: normalizeText(input.phaseWindow) || null,
    divisionFamily: normalizeText(input.divisionFamily) || null,
    subdivisionFamily: normalizeText(input.subdivisionFamily) || null,
    methodVariantCodes: normalizedSelectionArray(input.methodVariantCodes),
    structureTypeCodes: normalizedSelectionArray(input.structureTypeCodes),
    scopeDimensions: normalizedSelectionArray(input.scopeDimensions),
  }
}

function matchedScalarDimension(
  templateValues: string[],
  requestedValue: string | null,
) {
  if (!requestedValue) return null
  return includesNormalized(templateValues, requestedValue) ? requestedValue : null
}

function matchedArrayDimension(
  templateValues: string[],
  requestedValues: string[],
) {
  return requestedValues
    .filter((value) => includesNormalized(templateValues, value))
    .sort((left, right) => left.localeCompare(right))
}

function buildSelectionReceipts(
  templates: T2DivisionRhythmTemplate[],
  input: T2RhythmTemplateSelectionInput,
): T2RhythmScheduleCandidatePackage['selectionReceipts'] {
  const requestedDimensions = buildRequestedSelectionSnapshot(input)

  return templates.map((template, index) => {
    const matchedDimensions = {
      businessTypeCode: matchedScalarDimension(template.applicability.businessTypeCodes, requestedDimensions.businessTypeCode),
      phaseWindow: matchedScalarDimension(template.applicability.phaseWindows, requestedDimensions.phaseWindow),
      divisionFamily: matchedScalarDimension(template.applicability.divisionFamilies, requestedDimensions.divisionFamily),
      subdivisionFamily: matchedScalarDimension(template.applicability.subdivisionFamilies, requestedDimensions.subdivisionFamily),
      methodVariantCodes: matchedArrayDimension(template.applicability.methodVariantCodes, requestedDimensions.methodVariantCodes),
      structureTypeCodes: matchedArrayDimension(template.applicability.structureTypeCodes, requestedDimensions.structureTypeCodes),
      scopeDimensions: matchedArrayDimension(template.applicability.requiredScopeDimensions, requestedDimensions.scopeDimensions),
    }
    const unmatchedExplicitDimensions = [
      requestedDimensions.businessTypeCode && !matchedDimensions.businessTypeCode ? 'businessTypeCode' : null,
      requestedDimensions.phaseWindow && !matchedDimensions.phaseWindow ? 'phaseWindow' : null,
      requestedDimensions.divisionFamily && !matchedDimensions.divisionFamily ? 'divisionFamily' : null,
      requestedDimensions.subdivisionFamily && !matchedDimensions.subdivisionFamily ? 'subdivisionFamily' : null,
      requestedDimensions.methodVariantCodes.length > matchedDimensions.methodVariantCodes.length ? 'methodVariantCodes' : null,
      requestedDimensions.structureTypeCodes.length > matchedDimensions.structureTypeCodes.length ? 'structureTypeCodes' : null,
      requestedDimensions.scopeDimensions.length > matchedDimensions.scopeDimensions.length ? 'scopeDimensions' : null,
    ].filter((dimension): dimension is string => Boolean(dimension))

    return {
      templateId: template.templateId,
      selectionStatus: 'selected_explicit_match',
      rank: index + 1,
      selectorScore: scoreTemplate(template, input),
      selectionBasis: 'explicit_selector_match_and_score_rank',
      requestedDimensions,
      matchedDimensions,
      unmatchedExplicitDimensions,
      selectorPurity: {
        allExplicitDimensionsMatched: unmatchedExplicitDimensions.length === 0,
        noT1T3Leakage: template.tier === 'T2',
        exactPhaseWindowMatch: !requestedDimensions.phaseWindow || matchedDimensions.phaseWindow === requestedDimensions.phaseWindow,
        exactDivisionFamilyMatch: !requestedDimensions.divisionFamily || matchedDimensions.divisionFamily === requestedDimensions.divisionFamily,
        exactSubdivisionFamilyMatch: !requestedDimensions.subdivisionFamily || matchedDimensions.subdivisionFamily === requestedDimensions.subdivisionFamily,
      },
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      },
    }
  })
}

function buildT2SelectionCoverage(
  input: T2RhythmTemplateSelectionInput,
  selectedTemplateIds: string[],
): T2RhythmScheduleCandidatePackage['selectionCoverage'] {
  const requested = buildRequestedSelectionSnapshot(input)
  if (selectedTemplateIds.length > 0) {
    return {
      status: 'covered',
      canEnterC1913Phase1Selection: true,
      requiresTemplateExpansion: false,
      requested,
      missingSelectorDimensions: [],
      gapReasons: [],
      nearestCompatibleTemplateIds: selectedTemplateIds,
    }
  }

  const dimensionChecks: Array<{
    field: keyof Pick<typeof requested, 'businessTypeCode' | 'phaseWindow' | 'divisionFamily' | 'subdivisionFamily' | 'methodVariantCodes' | 'structureTypeCodes' | 'scopeDimensions'>
    templateValues: (template: T2DivisionRhythmTemplate) => string[]
    gapReason: string
  }> = [
    {
      field: 'businessTypeCode',
      templateValues: (template) => template.applicability.businessTypeCodes,
      gapReason: 'missing_business_type_coverage',
    },
    {
      field: 'phaseWindow',
      templateValues: (template) => template.applicability.phaseWindows,
      gapReason: 'missing_phase_window_coverage',
    },
    {
      field: 'divisionFamily',
      templateValues: (template) => template.applicability.divisionFamilies,
      gapReason: 'missing_division_family_coverage',
    },
    {
      field: 'subdivisionFamily',
      templateValues: (template) => template.applicability.subdivisionFamilies,
      gapReason: 'missing_subdivision_family_coverage',
    },
    {
      field: 'methodVariantCodes',
      templateValues: (template) => template.applicability.methodVariantCodes,
      gapReason: 'missing_method_variant_coverage',
    },
    {
      field: 'structureTypeCodes',
      templateValues: (template) => template.applicability.structureTypeCodes,
      gapReason: 'missing_structure_type_coverage',
    },
    {
      field: 'scopeDimensions',
      templateValues: (template) => template.applicability.requiredScopeDimensions,
      gapReason: 'missing_scope_dimension_coverage',
    },
  ]

  let candidates = T2_DIVISION_RHYTHM_TEMPLATE_SEED
  let nearestCandidates = candidates
  const missingSelectorDimensions: string[] = []
  const gapReasons = ['no_t2_template_matches_requested_selection']

  for (const dimension of dimensionChecks) {
    const requestedValue = requested[dimension.field]
    const requestedValues = Array.isArray(requestedValue) ? requestedValue : requestedValue ? [requestedValue] : []
    if (requestedValues.length === 0) continue
    const matches = candidates.filter((template) => intersects(dimension.templateValues(template), requestedValues))
    if (matches.length === 0) {
      missingSelectorDimensions.push(dimension.field)
      gapReasons.push(dimension.gapReason)
      break
    }
    candidates = matches
    nearestCandidates = matches
  }

  const nearestCompatibleTemplateIds = nearestCandidates
    .map((template) => ({ template, score: scoreTemplate(template, input) }))
    .sort((left, right) => (
      right.score - left.score
      || right.template.rhythm.parentWindowDays.p50 - left.template.rhythm.parentWindowDays.p50
      || left.template.templateId.localeCompare(right.template.templateId)
    ))
    .slice(0, 5)
    .map((item) => item.template.templateId)

  return {
    status: 'no_template_match',
    canEnterC1913Phase1Selection: false,
    requiresTemplateExpansion: true,
    requested,
    missingSelectorDimensions,
    gapReasons: Array.from(new Set(gapReasons)),
    nearestCompatibleTemplateIds,
  }
}

export function getT2DivisionRhythmTemplate(templateId: string) {
  return T2_DIVISION_RHYTHM_TEMPLATE_SEED.find((template) => template.templateId === templateId) ?? null
}

export function selectT2DivisionRhythmTemplates(input: T2RhythmTemplateSelectionInput, limit = 6) {
  return T2_DIVISION_RHYTHM_TEMPLATE_SEED
    .filter((template) => matchesExplicitSelector(template, input))
    .map((template) => ({ template, score: scoreTemplate(template, input) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => (
      right.score - left.score
      || right.template.rhythm.parentWindowDays.p50 - left.template.rhythm.parentWindowDays.p50
      || left.template.templateId.localeCompare(right.template.templateId)
    ))
    .slice(0, limit)
    .map((item) => item.template)
}

function auditTemplate(template: T2DivisionRhythmTemplate) {
  const defects: string[] = []
  const durationBearingWindows = template.rhythm.childWindows.filter((window) => window.durationBearing)
  const durationBearingTotal = durationBearingWindows.reduce((sum, window) => sum + window.durationDays, 0)
  const durationBearingCalendarSpan = durationBearingWindows.length > 0
    ? Math.max(...durationBearingWindows.map((window) => window.endDay)) - Math.min(...durationBearingWindows.map((window) => window.startDay)) + 1
    : 0
  const { p20, p50, p80 } = template.rhythm.parentWindowDays
  const minimumUncertaintyBandDays = Math.max(2, Math.ceil(p50 * 0.15))
  if (template.tier !== 'T2') defects.push(`${template.templateId}:missing_t2_tier`)
  if (template.sourceType !== 'system_standard_library') defects.push(`${template.templateId}:missing_standard_library_source`)
  if (template.governance.directRuntimeWrite !== false) defects.push(`${template.templateId}:direct_runtime_write_not_blocked`)
  if (template.governance.autoPublish !== false) defects.push(`${template.templateId}:auto_publish_not_blocked`)
  if (p20 <= 0 || p50 < p20 || p80 < p50) defects.push(`${template.templateId}:invalid_parent_quantile_envelope`)
  if (p80 - p20 < minimumUncertaintyBandDays) defects.push(`${template.templateId}:weak_parent_quantile_uncertainty_band`)
  if (template.applicability.businessTypeCodes.length === 0) defects.push(`${template.templateId}:missing_business_type`)
  if (template.applicability.divisionFamilies.length === 0) defects.push(`${template.templateId}:missing_division_family`)
  if (template.applicability.subdivisionFamilies.length < 2) defects.push(`${template.templateId}:weak_subdivision_coverage`)
  if (template.rhythm.childWindows.length < 6) defects.push(`${template.templateId}:weak_child_window_depth`)
  if (template.rhythm.childWindows.filter((window) => window.durationBearing).length < 4) defects.push(`${template.templateId}:weak_duration_window_depth`)
  if (durationBearingTotal < Math.ceil(template.rhythm.parentWindowDays.p50 * 0.7)) defects.push(`${template.templateId}:duration_bearing_total_below_parent_scale`)
  if (durationBearingCalendarSpan < Math.ceil(template.rhythm.parentWindowDays.p50 * 0.6)) defects.push(`${template.templateId}:duration_bearing_span_below_parent_scale`)
  if (template.hardGates.length < 2) defects.push(`${template.templateId}:weak_gate_depth`)
  if (template.dependencyEdges.length < template.rhythm.childWindows.length - 1) defects.push(`${template.templateId}:weak_dependency_depth`)
  if (template.compatibility.requiredFacts.length < 2) defects.push(`${template.templateId}:missing_required_fact_contract`)
  if (template.compatibility.incompatibleAssumptions.length < 1) defects.push(`${template.templateId}:missing_conflict_contract`)
  if (template.calibration.requiredActualSignals.length < 4) defects.push(`${template.templateId}:weak_calibration_signal_contract`)
  if (template.scheduleTrust.scheduleSemantics.criticalPathRoles.length < 2) defects.push(`${template.templateId}:weak_critical_path_semantics`)
  if (template.scheduleTrust.scheduleSemantics.durationDrivers.length < 3) defects.push(`${template.templateId}:weak_duration_driver_semantics`)
  if (template.scheduleTrust.scheduleSemantics.workfaceReadinessSignals.length < 2) defects.push(`${template.templateId}:weak_workface_readiness_semantics`)
  if (template.scheduleTrust.scheduleSemantics.assemblyRiskTags.length < 2) defects.push(`${template.templateId}:weak_assembly_risk_semantics`)
  if (!template.productionFeasibility) defects.push(`${template.templateId}:missing_production_feasibility`)
  if (template.productionFeasibility?.calendarBasis !== 'working_day') defects.push(`${template.templateId}:missing_working_day_calendar_basis`)
  if (template.productionFeasibility?.workfaceUnit !== template.rhythm.workfaceUnit) defects.push(`${template.templateId}:production_feasibility_workface_mismatch`)
  if ((template.productionFeasibility?.minimumParallelWorkfaces ?? 0) < 1) defects.push(`${template.templateId}:weak_workface_capacity_contract`)
  if ((template.productionFeasibility?.recommendedCrewStreams ?? 0) < (template.rhythm.overlapPolicy === 'sequential_with_controlled_overlap' ? 1 : 2)) defects.push(`${template.templateId}:weak_crew_stream_capacity_contract`)
  if ((template.productionFeasibility?.resourceReadinessSignals.length ?? 0) < 3) defects.push(`${template.templateId}:weak_resource_capacity_contract`)
  if ((template.productionFeasibility?.calendarConstraintSignals.length ?? 0) < 2) defects.push(`${template.templateId}:weak_calendar_constraint_contract`)
  if ((template.productionFeasibility?.capacityRiskTags.length ?? 0) < 2) defects.push(`${template.templateId}:weak_capacity_risk_contract`)
  if (template.scheduleTrust.evidenceAnchors.standardLibraryAnchors.length < 3) defects.push(`${template.templateId}:weak_standard_library_anchors`)
  if (template.scheduleTrust.evidenceAnchors.calibrationAnchors.length < 3) defects.push(`${template.templateId}:weak_calibration_anchors`)
  if (template.scheduleTrust.evidenceAnchors.replayAdmission.minimumComparableWorkfaceWindows < 12) defects.push(`${template.templateId}:weak_replay_sample_gate`)
  if (template.scheduleTrust.evidenceAnchors.replayAdmission.p80CaptureThreshold < 0.72) defects.push(`${template.templateId}:weak_p80_capture_gate`)
  if (template.scheduleTrust.evidenceAnchors.replayAdmission.maxMedianAbsoluteErrorDays > 5) defects.push(`${template.templateId}:weak_median_absolute_error_gate`)

  for (const window of template.rhythm.childWindows) {
    if (window.startDay < 1 || window.endDay < window.startDay || window.endDay > template.rhythm.parentWindowDays.p80) {
      defects.push(`${template.templateId}:${window.windowCode}:window_out_of_parent_bounds`)
    }
  }
  defects.push(...auditTemplateDependencyGraph(template))
  defects.push(...auditTemplateDependencySemantics(template))
  defects.push(...auditTemplateHardGateAnchors(template))
  return defects
}

function auditTemplateDependencyGraph(template: T2DivisionRhythmTemplate) {
  const defects: string[] = []
  const windowCodes = new Set(template.rhythm.childWindows.map((window) => window.windowCode))
  const edgeKeys = new Set<string>()
  const adjacency = new Map<string, string[]>()

  for (const edge of template.dependencyEdges) {
    if (!windowCodes.has(edge.predecessorWindowCode) || !windowCodes.has(edge.successorWindowCode)) {
      defects.push(`${template.templateId}:${edge.edgeCode}:dependency_edge_unknown_endpoint`)
      continue
    }
    if (edge.predecessorWindowCode === edge.successorWindowCode) {
      defects.push(`${template.templateId}:${edge.edgeCode}:dependency_edge_self_loop`)
      continue
    }

    const edgeKey = `${edge.predecessorWindowCode}->${edge.successorWindowCode}:${edge.relation}:${edge.lagDays}`
    if (edgeKeys.has(edgeKey)) defects.push(`${template.templateId}:${edge.edgeCode}:duplicate_dependency_edge`)
    edgeKeys.add(edgeKey)
    adjacency.set(edge.predecessorWindowCode, [
      ...(adjacency.get(edge.predecessorWindowCode) ?? []),
      edge.successorWindowCode,
    ])
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const hasCycle = (windowCode: string): boolean => {
    if (visiting.has(windowCode)) return true
    if (visited.has(windowCode)) return false
    visiting.add(windowCode)
    for (const successorWindowCode of adjacency.get(windowCode) ?? []) {
      if (hasCycle(successorWindowCode)) return true
    }
    visiting.delete(windowCode)
    visited.add(windowCode)
    return false
  }

  if ([...windowCodes].some((windowCode) => hasCycle(windowCode))) {
    defects.push(`${template.templateId}:dependency_graph_cycle`)
  }

  return defects
}

function auditTemplateDependencySemantics(template: T2DivisionRhythmTemplate) {
  const defects: string[] = []
  const mandatoryWaitEdges = template.dependencyEdges.filter((edge) => (
    edge.mandatory
    && ['handover_gate', 'readiness_gate', 'quality_gate'].includes(edge.edgeType)
  ))
  const controlledOverlapEdges = template.dependencyEdges.filter((edge) => edge.relation === 'SS')

  if (mandatoryWaitEdges.length < 1) defects.push(`${template.templateId}:missing_mandatory_wait_edge`)
  if (controlledOverlapEdges.length < 1) defects.push(`${template.templateId}:missing_controlled_overlap_edge`)

  for (const edge of template.dependencyEdges) {
    if (edge.lagDays < 0) defects.push(`${template.templateId}:${edge.edgeCode}:invalid_dependency_lag`)

    if (edge.edgeType === 'rhythm_sequence') {
      if (!['FS', 'SS'].includes(edge.relation)) {
        defects.push(`${template.templateId}:${edge.edgeCode}:invalid_rhythm_sequence_relation`)
      }
      if (edge.relation === 'SS' && (edge.lagDays <= 0 || edge.mandatory)) {
        defects.push(`${template.templateId}:${edge.edgeCode}:invalid_controlled_overlap_lag`)
      }
    } else if (!edge.mandatory || edge.relation !== 'FS' || edge.lagDays !== 0) {
      defects.push(`${template.templateId}:${edge.edgeCode}:invalid_mandatory_wait_edge`)
    }
  }

  return defects
}

function normalizeGateAnchorLabel(value: string) {
  return value.toLowerCase().replace(/[_\s-]+/g, '')
}

function auditTemplateHardGateAnchors(template: T2DivisionRhythmTemplate) {
  const defects: string[] = []
  const childWindowsByLabel = new Map(
    template.rhythm.childWindows.map((window) => [normalizeGateAnchorLabel(window.label), window]),
  )
  const mandatoryGateAnchoredWindowCodes = new Set(
    template.dependencyEdges
      .filter((edge) => edge.mandatory && ['handover_gate', 'readiness_gate', 'quality_gate'].includes(edge.edgeType))
      .flatMap((edge) => [edge.predecessorWindowCode, edge.successorWindowCode]),
  )

  for (const gate of template.hardGates) {
    if (gate.blocksAutomaticMaterialization !== true) {
      defects.push(`${template.templateId}:${gate.gateCode}:hard_gate_materialization_not_blocked`)
    }

    const matchedWindow = childWindowsByLabel.get(normalizeGateAnchorLabel(gate.label))
    if (!matchedWindow) {
      defects.push(`${template.templateId}:${gate.gateCode}:hard_gate_window_anchor_missing`)
      continue
    }

    if (!mandatoryGateAnchoredWindowCodes.has(matchedWindow.windowCode)) {
      defects.push(`${template.templateId}:${gate.gateCode}:hard_gate_dependency_anchor_missing`)
    }
  }

  return defects
}

const REQUIRED_BUSINESS_TYPE_DIVISION_PROFILES: Array<{
  businessTypeCode: string
  minTemplateCount: number
  requiredDivisionFamilies: T2DivisionFamily[]
}> = [
  {
    businessTypeCode: 'general_civil',
    minTemplateCount: 8,
    requiredDivisionFamilies: [
      'foundation_and_basement',
      'superstructure',
      'envelope_facade_roof',
      'mep_systems',
      'decoration_fitout',
      'outdoor_municipal_landscape',
      'commissioning_handover',
    ],
  },
  {
    businessTypeCode: 'residential',
    minTemplateCount: 8,
    requiredDivisionFamilies: [
      'foundation_and_basement',
      'superstructure',
      'envelope_facade_roof',
      'mep_systems',
      'decoration_fitout',
      'outdoor_municipal_landscape',
      'commissioning_handover',
    ],
  },
  {
    businessTypeCode: 'commercial',
    minTemplateCount: 8,
    requiredDivisionFamilies: [
      'foundation_and_basement',
      'superstructure',
      'envelope_facade_roof',
      'mep_systems',
      'decoration_fitout',
      'outdoor_municipal_landscape',
      'commissioning_handover',
    ],
  },
  {
    businessTypeCode: 'hotel',
    minTemplateCount: 6,
    requiredDivisionFamilies: [
      'superstructure',
      'envelope_facade_roof',
      'mep_systems',
      'decoration_fitout',
      'commissioning_handover',
    ],
  },
  {
    businessTypeCode: 'hospital',
    minTemplateCount: 8,
    requiredDivisionFamilies: [
      'superstructure',
      'envelope_facade_roof',
      'mep_systems',
      'decoration_fitout',
      'outdoor_municipal_landscape',
      'commissioning_handover',
      'specialty_business_systems',
    ],
  },
  {
    businessTypeCode: 'school',
    minTemplateCount: 6,
    requiredDivisionFamilies: [
      'superstructure',
      'mep_systems',
      'decoration_fitout',
      'outdoor_municipal_landscape',
      'commissioning_handover',
    ],
  },
  {
    businessTypeCode: 'industrial',
    minTemplateCount: 4,
    requiredDivisionFamilies: [
      'superstructure',
      'mep_systems',
      'outdoor_municipal_landscape',
      'commissioning_handover',
      'specialty_business_systems',
    ],
  },
  {
    businessTypeCode: 'data_center',
    minTemplateCount: 4,
    requiredDivisionFamilies: [
      'mep_systems',
      'decoration_fitout',
      'commissioning_handover',
      'specialty_business_systems',
    ],
  },
  {
    businessTypeCode: 'transportation_hub',
    minTemplateCount: 4,
    requiredDivisionFamilies: [
      'superstructure',
      'envelope_facade_roof',
      'mep_systems',
      'commissioning_handover',
      'specialty_business_systems',
    ],
  },
  {
    businessTypeCode: 'sports_culture',
    minTemplateCount: 4,
    requiredDivisionFamilies: [
      'superstructure',
      'envelope_facade_roof',
      'mep_systems',
      'decoration_fitout',
      'commissioning_handover',
    ],
  },
  {
    businessTypeCode: 'tod_upper_cover',
    minTemplateCount: 3,
    requiredDivisionFamilies: [
      'foundation_and_basement',
      'superstructure',
      'mep_systems',
      'commissioning_handover',
    ],
  },
  {
    businessTypeCode: 'renovation',
    minTemplateCount: 3,
    requiredDivisionFamilies: [
      'decoration_fitout',
      'mep_systems',
      'commissioning_handover',
      'specialty_business_systems',
    ],
  },
  {
    businessTypeCode: 'modular_building',
    minTemplateCount: 1,
    requiredDivisionFamilies: [
      'superstructure',
      'mep_systems',
      'commissioning_handover',
      'specialty_business_systems',
    ],
  },
]

const REQUIRED_DIVISION_FAMILY_REPRESENTATIVE_PROFILES: T2DivisionFamily[] = [
  'foundation_and_basement',
  'superstructure',
  'envelope_facade_roof',
  'mep_systems',
  'decoration_fitout',
  'outdoor_municipal_landscape',
  'commissioning_handover',
  'specialty_business_systems',
]

const REPRESENTATIVE_SCHEDULE_SCENARIOS: Array<{
  scenarioId: string
  selection: T2RhythmTemplateSelectionInput
  facts: Record<string, unknown>
  organizationAssumptions: string[]
  selectedWorkfaceUnits: string[]
}> = [
  {
    scenarioId: 'general_civil_standard_floor_structure',
    selection: {
      businessTypeCode: 'general_civil',
      phaseWindow: 'superstructure',
      divisionFamily: 'superstructure',
      subdivisionFamily: 'standard_floor_handover',
      methodVariantCodes: ['aluminum_formwork'],
      scopeDimensions: ['building', 'floor'],
    },
    facts: {
      hasOrderedFloors: true,
      hasBasementHandover: true,
    },
    organizationAssumptions: ['basement_first_then_tower'],
    selectedWorkfaceUnits: ['floor'],
  },
  {
    scenarioId: 'residential_basement_structure_handover',
    selection: {
      businessTypeCode: 'residential',
      phaseWindow: 'basement',
      divisionFamily: 'foundation_and_basement',
      subdivisionFamily: 'basement_structure',
      methodVariantCodes: ['basement_cast_in_place'],
      scopeDimensions: ['zone', 'section'],
    },
    facts: {
      hasBasementScope: true,
      hasSupportScheme: true,
    },
    organizationAssumptions: ['basement_first_then_tower'],
    selectedWorkfaceUnits: ['zone'],
  },
  {
    scenarioId: 'residential_standard_floor_structure',
    selection: {
      businessTypeCode: 'residential',
      phaseWindow: 'superstructure',
      divisionFamily: 'superstructure',
      subdivisionFamily: 'standard_floor_handover',
      methodVariantCodes: ['aluminum_formwork'],
      scopeDimensions: ['building', 'floor'],
    },
    facts: {
      hasOrderedFloors: true,
      hasBasementHandover: true,
    },
    organizationAssumptions: ['basement_first_then_tower'],
    selectedWorkfaceUnits: ['floor'],
  },
  {
    scenarioId: 'commercial_podium_fitout_opening',
    selection: {
      businessTypeCode: 'commercial',
      phaseWindow: 'opening',
      divisionFamily: 'decoration_fitout',
      subdivisionFamily: 'podium_public_fitout',
      methodVariantCodes: ['public_area_fitout'],
      scopeDimensions: ['zone', 'room'],
    },
    facts: {
      hasPublicAreaZone: true,
      hasOpeningReadinessGate: true,
    },
    organizationAssumptions: ['podium_public_and_tower_room_parallel_with_gates'],
    selectedWorkfaceUnits: ['zone'],
  },
  {
    scenarioId: 'hotel_guestroom_fitout_opening',
    selection: {
      businessTypeCode: 'hotel',
      phaseWindow: 'opening',
      divisionFamily: 'decoration_fitout',
      subdivisionFamily: 'tower_room_fitout',
      methodVariantCodes: ['guestroom_fitout'],
      structureTypeCodes: ['hotel_tower'],
      scopeDimensions: ['zone', 'room'],
    },
    facts: {
      hasPublicAreaZone: true,
      hasOpeningReadinessGate: true,
    },
    organizationAssumptions: ['podium_public_and_tower_room_parallel_with_gates'],
    selectedWorkfaceUnits: ['zone'],
  },
  {
    scenarioId: 'hospital_clinical_department_fitout',
    selection: {
      businessTypeCode: 'hospital',
      phaseWindow: 'decoration',
      divisionFamily: 'decoration_fitout',
      subdivisionFamily: 'clinical_department_fitout',
      methodVariantCodes: ['clinical_room_fitout'],
      scopeDimensions: ['zone', 'room', 'system'],
    },
    facts: {
      hasClinicalDepartmentScope: true,
      hasMepTerminalReadiness: true,
    },
    organizationAssumptions: ['department_zone_fitout_after_watertight_release'],
    selectedWorkfaceUnits: ['zone'],
  },
  {
    scenarioId: 'school_classroom_lab_fitout',
    selection: {
      businessTypeCode: 'school',
      phaseWindow: 'decoration',
      divisionFamily: 'decoration_fitout',
      subdivisionFamily: 'classroom_fitout',
      methodVariantCodes: ['classroom_finish'],
      scopeDimensions: ['floor', 'room', 'zone'],
    },
    facts: {
      hasTeachingRoomScope: true,
      hasOpeningDateGate: true,
    },
    organizationAssumptions: ['classroom_lab_batch_handover'],
    selectedWorkfaceUnits: ['room'],
  },
  {
    scenarioId: 'industrial_main_plant_equipment',
    selection: {
      businessTypeCode: 'industrial',
      phaseWindow: 'commissioning',
      divisionFamily: 'specialty_business_systems',
      subdivisionFamily: 'process_equipment_readiness',
      methodVariantCodes: ['process_equipment_installation'],
      scopeDimensions: ['bay', 'system'],
    },
    facts: {
      hasIndustrialBayScope: true,
      hasProcessEquipmentInterface: true,
    },
    organizationAssumptions: ['main_plant_utility_parallel_with_interface_gates'],
    selectedWorkfaceUnits: ['bay'],
  },
  {
    scenarioId: 'data_center_white_space_fitout',
    selection: {
      businessTypeCode: 'data_center',
      phaseWindow: 'decoration',
      divisionFamily: 'decoration_fitout',
      subdivisionFamily: 'white_space_fitout',
      methodVariantCodes: ['raised_floor_or_overhead_busway'],
      scopeDimensions: ['room', 'zone', 'system'],
    },
    facts: {
      hasWhiteSpaceRoomScope: true,
      hasPowerCoolingInterface: true,
    },
    organizationAssumptions: ['white_space_after_watertight_and_power_room_ready'],
    selectedWorkfaceUnits: ['room'],
  },
  {
    scenarioId: 'transport_hub_public_systems',
    selection: {
      businessTypeCode: 'transportation_hub',
      phaseWindow: 'commissioning',
      divisionFamily: 'mep_systems',
      subdivisionFamily: 'public_area_mep_roughin',
      methodVariantCodes: ['public_safety_linkage'],
      scopeDimensions: ['system', 'zone'],
    },
    facts: {
      hasPassengerFlowZone: true,
      hasLifeSafetySystemScope: true,
    },
    organizationAssumptions: ['public_system_before_trial_operation'],
    selectedWorkfaceUnits: ['system'],
  },
  {
    scenarioId: 'sports_culture_longspan_envelope',
    selection: {
      businessTypeCode: 'sports_culture',
      phaseWindow: 'envelope',
      divisionFamily: 'envelope_facade_roof',
      subdivisionFamily: 'roof_envelope',
      methodVariantCodes: ['large_span_steel'],
      scopeDimensions: ['bay', 'zone'],
    },
    facts: {
      hasLongSpanStructure: true,
      hasEventHandoverGate: true,
    },
    organizationAssumptions: ['longspan_then_envelope_then_event_system'],
    selectedWorkfaceUnits: ['bay'],
  },
  {
    scenarioId: 'residential_outdoor_municipal_landscape',
    selection: {
      businessTypeCode: 'residential',
      phaseWindow: 'outdoor',
      divisionFamily: 'outdoor_municipal_landscape',
      subdivisionFamily: 'outdoor_pipe_network',
      methodVariantCodes: ['outdoor_utilities'],
      scopeDimensions: ['zone', 'section'],
    },
    facts: {
      hasOutdoorSectionScope: true,
      hasMunicipalTieInInterface: true,
    },
    organizationAssumptions: ['outdoor_after_heavy_transport_release'],
    selectedWorkfaceUnits: ['section'],
  },
  {
    scenarioId: 'tod_rail_interface_commissioning',
    selection: {
      businessTypeCode: 'tod_upper_cover',
      phaseWindow: 'commissioning',
      divisionFamily: 'commissioning_handover',
      subdivisionFamily: 'rail_interface_safety_acceptance',
      methodVariantCodes: ['rail_interface_protection'],
      scopeDimensions: ['zone', 'system'],
    },
    facts: {
      hasRailInterfaceProtection: true,
      hasOperationHandoverGate: true,
    },
    organizationAssumptions: ['rail_interface_acceptance_before_operation_handover'],
    selectedWorkfaceUnits: ['zone'],
  },
  {
    scenarioId: 'renovation_occupied_zone_fitout',
    selection: {
      businessTypeCode: 'renovation',
      phaseWindow: 'renovation',
      divisionFamily: 'decoration_fitout',
      subdivisionFamily: 'occupied_zone_decanting',
      methodVariantCodes: ['renovation_occupied_finish'],
      scopeDimensions: ['zone', 'room'],
    },
    facts: {
      hasOccupiedZoneConstraint: true,
      hasTemporaryCutoverPlan: true,
    },
    organizationAssumptions: ['phased_decanting_then_cutover'],
    selectedWorkfaceUnits: ['zone'],
  },
  {
    scenarioId: 'modular_building_factory_lot_site_assembly',
    selection: {
      businessTypeCode: 'modular_building',
      phaseWindow: 'superstructure',
      divisionFamily: 'superstructure',
      subdivisionFamily: 'site_module_assembly',
      methodVariantCodes: ['modular_mic'],
      structureTypeCodes: ['modular_building'],
      scopeDimensions: ['factory_lot', 'building', 'zone', 'system'],
    },
    facts: {
      hasFactoryLotScope: true,
      hasModuleTransportPlan: true,
    },
    organizationAssumptions: ['factory_lot_parallel_with_site_preparation'],
    selectedWorkfaceUnits: ['factory_lot'],
  },
]

const T2_STANDARD_LIBRARY_MINIMUMS = {
  templateCount: 16,
  businessTypeCount: 13,
  divisionFamilyCount: 8,
  subdivisionFamilyCount: 36,
}

const PRECISION_DEFECT_MARKERS = [
  'missing_t2_tier',
  'missing_standard_library_source',
  'direct_runtime_write_not_blocked',
  'auto_publish_not_blocked',
  'invalid_parent_quantile_envelope',
  'weak_parent_quantile_uncertainty_band',
  'weak_child_window_depth',
  'weak_duration_window_depth',
  'duration_bearing_total_below_parent_scale',
  'duration_bearing_span_below_parent_scale',
  'weak_gate_depth',
  'weak_dependency_depth',
  'dependency_edge_unknown_endpoint',
  'dependency_edge_self_loop',
  'duplicate_dependency_edge',
  'dependency_graph_cycle',
  'missing_mandatory_wait_edge',
  'missing_controlled_overlap_edge',
  'invalid_dependency_lag',
  'invalid_rhythm_sequence_relation',
  'invalid_controlled_overlap_lag',
  'invalid_mandatory_wait_edge',
  'hard_gate_window_anchor_missing',
  'hard_gate_dependency_anchor_missing',
  'hard_gate_materialization_not_blocked',
  'missing_required_fact_contract',
  'missing_conflict_contract',
  'weak_critical_path_semantics',
  'weak_duration_driver_semantics',
  'weak_workface_readiness_semantics',
  'weak_assembly_risk_semantics',
  'missing_production_feasibility',
  'missing_working_day_calendar_basis',
  'production_feasibility_workface_mismatch',
  'weak_workface_capacity_contract',
  'weak_crew_stream_capacity_contract',
  'weak_resource_capacity_contract',
  'weak_calendar_constraint_contract',
  'weak_capacity_risk_contract',
  'window_out_of_parent_bounds',
]

const BREADTH_DEFECT_MARKERS = [
  'missing_business_type',
  'missing_division_family',
  'weak_subdivision_coverage',
  'template_count_below_standard_library_floor',
  'business_type_coverage_below_standard_library_floor',
  'system_business_type_coverage_missing',
  'system_business_type_direct_coverage_missing',
  'division_family_coverage_below_standard_library_floor',
  'subdivision_family_coverage_below_standard_library_floor',
  'business_type_profile_not_ready',
  'representative_schedule_scenario_not_schedulable',
  'representative_phase1_evaluation_not_ready',
  'representative_phase1_multinetwork_selection_not_ready',
  'business_type_representative_evidence_not_ready',
  'division_family_representative_evidence_not_ready',
  'template_representative_evidence_not_ready',
  'phase_window_representative_evidence_not_ready',
]

const DEPTH_DEFECT_MARKERS = [
  'weak_calibration_signal_contract',
  'weak_standard_library_anchors',
  'weak_calibration_anchors',
  'weak_replay_sample_gate',
  'weak_p80_capture_gate',
  'weak_median_absolute_error_gate',
  'representative_replay_fixture_not_ready',
  'representative_replay_fixture_missing_critical_window',
  'representative_replay_fixture_missing_workface_diversity',
  'representative_replay_fixture_missing_actual_variance',
  'representative_replay_fixture_variance_out_of_control',
  'representative_replay_fixture_critical_window_depth_missing',
  'representative_replay_fixture_critical_window_workface_diversity_missing',
  'representative_replay_fixture_critical_window_actual_variance_missing',
  'representative_replay_fixture_critical_window_bidirectional_gate_slip_missing',
  'representative_replay_fixture_critical_window_variance_out_of_control',
  'representative_replay_fixture_missing_gate_window',
  'representative_replay_fixture_gate_window_depth_missing',
  'representative_replay_fixture_gate_window_workface_diversity_missing',
  'representative_replay_fixture_gate_window_actual_variance_missing',
  'representative_replay_fixture_gate_window_bidirectional_gate_slip_missing',
  'representative_replay_fixture_gate_window_variance_out_of_control',
  'phase1_replay_fixture_missing',
  'phase1_critical_window_mismatch',
  'phase1_critical_window_replay_missing',
]

function defectsMatching(defects: string[], markers: string[]) {
  return defects.filter((defect) => markers.some((marker) => defect.includes(marker)))
}

function buildBusinessTypeProfiles() {
  return REQUIRED_BUSINESS_TYPE_DIVISION_PROFILES.map((profile) => {
    const templates = T2_DIVISION_RHYTHM_TEMPLATE_SEED.filter((template) => (
      includesNormalized(template.applicability.businessTypeCodes, profile.businessTypeCode)
    ))
    const coveredDivisionFamilies = unique(templates.flatMap((template) => template.applicability.divisionFamilies))
    const coveredSet = new Set(coveredDivisionFamilies.map(normalizeCode))
    const missingRequiredDivisionFamilies = profile.requiredDivisionFamilies
      .filter((family) => !coveredSet.has(normalizeCode(family)))

    return {
      businessTypeCode: profile.businessTypeCode,
      status: templates.length >= profile.minTemplateCount && missingRequiredDivisionFamilies.length === 0
        ? 'ready' as const
        : 'needs_expansion' as const,
      templateCount: templates.length,
      coveredDivisionFamilies,
      requiredDivisionFamilies: profile.requiredDivisionFamilies,
      missingRequiredDivisionFamilies,
    }
  })
}

function buildSystemBusinessTypeCoverage(
  t2RhythmBusinessTypeCodes: string[],
): T2RhythmTemplateRegistryAudit['systemBusinessTypeCoverage'] {
  const rhythmBusinessTypeSet = new Set(t2RhythmBusinessTypeCodes.map(normalizeCode))
  const formalBusinessTypeCodes = [...FORMAL_BUSINESS_TYPE_CODES]
  const mappings = formalBusinessTypeCodes.map((businessTypeCode) => {
    const mappedRhythmBusinessTypeCodes = unique([
      businessTypeCode,
      ...getT2RhythmBusinessTypeCodesForFormalBusinessType(businessTypeCode),
    ])
    const matchedRhythmBusinessTypeCodes = mappedRhythmBusinessTypeCodes
      .filter((rhythmBusinessTypeCode) => rhythmBusinessTypeSet.has(normalizeCode(rhythmBusinessTypeCode)))
    const missingMappedRhythmBusinessTypeCodes = mappedRhythmBusinessTypeCodes
      .filter((rhythmBusinessTypeCode) => !rhythmBusinessTypeSet.has(normalizeCode(rhythmBusinessTypeCode)))
    const directlyCovered = rhythmBusinessTypeSet.has(normalizeCode(businessTypeCode))

    return {
      businessTypeCode,
      status: matchedRhythmBusinessTypeCodes.length > 0 && directlyCovered ? 'ready' as const : 'blocked' as const,
      directlyCovered,
      mappedRhythmBusinessTypeCodes,
      matchedRhythmBusinessTypeCodes,
      missingMappedRhythmBusinessTypeCodes,
    }
  })
  const coveredBusinessTypeCount = mappings.filter((mapping) => mapping.matchedRhythmBusinessTypeCodes.length > 0).length
  const directCoveredBusinessTypeCount = mappings.filter((mapping) => mapping.directlyCovered).length
  const missingBusinessTypeCodes = mappings
    .filter((mapping) => mapping.matchedRhythmBusinessTypeCodes.length === 0)
    .map((mapping) => mapping.businessTypeCode)
  const missingDirectBusinessTypeCodes = mappings
    .filter((mapping) => !mapping.directlyCovered)
    .map((mapping) => mapping.businessTypeCode)
  const formalBusinessTypeCount = formalBusinessTypeCodes.length

  return {
    status: missingBusinessTypeCodes.length === 0 && missingDirectBusinessTypeCodes.length === 0
      ? 'ready' as const
      : 'blocked' as const,
    formalBusinessTypeCount,
    coveredBusinessTypeCount,
    directCoveredBusinessTypeCount,
    coverageRate: formalBusinessTypeCount > 0 ? coveredBusinessTypeCount / formalBusinessTypeCount : 1,
    directCoverageRate: formalBusinessTypeCount > 0 ? directCoveredBusinessTypeCount / formalBusinessTypeCount : 1,
    missingBusinessTypeCodes,
    missingDirectBusinessTypeCodes,
    t2RhythmBusinessTypeCodes,
    mappings,
  }
}

function buildStandardLibraryThicknessCoverage(): T2RhythmTemplateRegistryAudit['standardLibraryThicknessCoverage'] {
  const byBusinessType = Object.values(BUSINESS_TYPE_RECOMMENDATIONS)
    .map((recommendation) => {
      const currentTemplateCount = T2_DIVISION_RHYTHM_TEMPLATE_SEED
        .filter((template) => includesNormalized(template.applicability.businessTypeCodes, recommendation.businessType))
        .length
      const targetTemplateCount = recommendation.templateCountHint
      const coverageRate = targetTemplateCount > 0 ? currentTemplateCount / targetTemplateCount : 1

      return {
        businessTypeCode: recommendation.businessType,
        status: coverageRate >= 1 ? 'ready' as const : 'thin' as const,
        currentTemplateCount,
        targetTemplateCount,
        coverageRate,
        missingTemplateCount: Math.max(0, targetTemplateCount - currentTemplateCount),
      }
    })
    .sort((left, right) => (
      left.coverageRate - right.coverageRate
      || right.missingTemplateCount - left.missingTemplateCount
      || left.businessTypeCode.localeCompare(right.businessTypeCode)
    ))
  const currentTemplateCount = T2_DIVISION_RHYTHM_TEMPLATE_SEED.length
  const targetTemplateCount = byBusinessType
    .reduce((sum, row) => sum + row.targetTemplateCount, 0)
  const coverageRate = targetTemplateCount > 0 ? currentTemplateCount / targetTemplateCount : 1

  return {
    status: byBusinessType.every((row) => row.status === 'ready') ? 'ready' as const : 'needs_expansion' as const,
    currentTemplateCount,
    targetTemplateCount,
    coverageRate,
    weakestBusinessTypeCodes: byBusinessType
      .filter((row) => row.status === 'thin')
      .map((row) => row.businessTypeCode),
    byBusinessType,
  }
}

function buildRepresentativeScheduleScenarioCoverage(): T2RhythmTemplateRegistryAudit['representativeScheduleScenarioCoverage'] {
  const scenarios = REPRESENTATIVE_SCHEDULE_SCENARIOS.map((scenario) => {
    const templates = selectT2DivisionRhythmTemplates(scenario.selection, 6)
    const selectedTemplateIds = templates.map((template) => template.templateId)
    const compatibility = checkT2RhythmTemplateAssemblyCompatibility({
      templateIds: selectedTemplateIds,
      organizationAssumptions: scenario.organizationAssumptions,
      selectedWorkfaceUnits: scenario.selectedWorkfaceUnits,
      facts: scenario.facts,
    })
    const durationBearingWindowCount = templates
      .flatMap((template) => template.rhythm.childWindows)
      .filter((window) => window.durationBearing).length
    const dependencyCandidateCount = templates
      .flatMap((template) => template.dependencyEdges).length
    const hardGateCount = templates
      .flatMap((template) => template.hardGates).length
    const status = selectedTemplateIds.length === 0
      ? 'no_template_match' as const
      : compatibility.compatible ? 'schedulable_candidate' as const : 'candidate_conflict' as const

    return {
      scenarioId: scenario.scenarioId,
      businessTypeCode: normalizeText(scenario.selection.businessTypeCode),
      phaseWindow: normalizeText(scenario.selection.phaseWindow),
      divisionFamily: normalizeText(scenario.selection.divisionFamily),
      subdivisionFamily: normalizeText(scenario.selection.subdivisionFamily),
      status,
      canEnterC1913Phase1Selection: status === 'schedulable_candidate',
      requiresTemplateExpansion: status === 'no_template_match',
      selectedTemplateIds,
      durationBearingWindowCount,
      dependencyCandidateCount,
      hardGateCount,
      conflictCodes: unique(compatibility.conflicts.map((conflict) => conflict.conflictCode)),
    }
  })
  const readyScenarioCount = scenarios
    .filter((scenario) => scenario.canEnterC1913Phase1Selection).length

  return {
    status: readyScenarioCount === REPRESENTATIVE_SCHEDULE_SCENARIOS.length ? 'ready' : 'blocked',
    readyScenarioCount,
    minimumScenarioCount: REPRESENTATIVE_SCHEDULE_SCENARIOS.length,
    scenarios,
  }
}

function buildRepresentativeProductionCapacityEvidence(
  candidatePackage: T2RhythmScheduleCandidatePackage,
) {
  const requiredParallelWorkfaces = Math.max(1, ...candidatePackage.productionFeasibilitySummaries
    .map((summary) => summary.minimumParallelWorkfaces))
  const requiredCrewStreams = Math.max(1, ...candidatePackage.productionFeasibilitySummaries
    .map((summary) => summary.recommendedCrewStreams))
  return buildT2RhythmProductionCapacityEvidence({
    resourceSidecar: {
      availableParallelWorkfaces: requiredParallelWorkfaces,
      availableCrewStreams: requiredCrewStreams,
      evidenceRefs: [`representative_capacity:${candidatePackage.selectedTemplateIds.join('+') || 'no_template'}:resource_streams`],
    },
    constructionRhythmExpansion: {
      workfaceCandidateCount: requiredParallelWorkfaces,
      dominantRhythmUnits: unique(candidatePackage.productionFeasibilitySummaries.map((summary) => summary.workfaceUnit)),
      candidates: [{
        backendConsumable: true,
        workfaceCount: requiredParallelWorkfaces,
        workfaceKeys: Array.from({ length: requiredParallelWorkfaces }, (_, index) => `representative-workface-${index + 1}`),
      }],
    },
    constructionCalendar: {
      basis: 'official_construction_calendar_seed',
      windows: [],
      calendarRef: 'representative_work_calendar',
      calendarVersion: 't2-rhythm-capacity-probe-v1',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
    },
  })
}

function buildRepresentativeShadowProbeTrustGate() {
  return evaluateT2RhythmStandardLibraryTrustGate({
    status: 'pass',
    missingArchivedJson: false,
    evidenceMetadata: {
      missingEvidenceMetadata: false,
    },
    sampleAvailability: {
      totalUsableSampleCount: T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS.minimumSampleCount,
      totalLiveRowsWithoutT2WindowMetadata: 0,
      reasonCodes: [],
    },
    replayCoverage: {
      status: 'pass',
      reasonCodes: [],
    },
    annotationGapClosure: {
      manualAnnotationCandidateCount: 0,
      annotationGapCount: 0,
      reasonCodes: [],
    },
    checks: {
      readiness: {
        status: 'pass',
        reasonCodes: [],
      },
      taskActualReplay: {
        readyForShadow: true,
        reasonCodes: [],
      },
      durationExperienceReplay: {
        readyForShadow: true,
        reasonCodes: [],
      },
    },
  })
}

function buildRepresentativePhase1EvaluationCoverage(
  standardLibraryReadiness: T2RhythmScheduleCandidatePackage['standardLibraryReadiness'],
): T2RhythmTemplateRegistryAudit['representativePhase1EvaluationCoverage'] {
  const evaluations = REPRESENTATIVE_SCHEDULE_SCENARIOS.map((scenario) => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackageInternal({
      selection: scenario.selection,
      organizationAssumptions: scenario.organizationAssumptions,
      selectedWorkfaceUnits: scenario.selectedWorkfaceUnits,
      facts: scenario.facts,
      limit: 6,
    }, standardLibraryReadiness)
    const network = buildT2RhythmScheduleCandidateNetwork({
      candidateId: `representative:${scenario.scenarioId}`,
      candidatePackage,
      productionCapacityEvidence: buildRepresentativeProductionCapacityEvidence(candidatePackage),
    })
    const evaluation = evaluateT2RhythmScheduleCandidateNetwork(network)
    const minimumTemplateAnchorSpanDays = candidatePackage.packageWindows.length > 0
      ? Math.max(...candidatePackage.packageWindows.map((window) => window.endDay))
      : 0

    return {
      scenarioId: scenario.scenarioId,
      candidateId: evaluation.candidateId,
      status: evaluation.status,
      canEnterC1913Phase1Selection: evaluation.canEnterC1913Phase1Selection,
      topologyEvaluated: evaluation.scheduleTrustEvidence.topologyEvaluated,
      floatCalculated: evaluation.scheduleTrustEvidence.floatCalculated,
      networkSpanDays: evaluation.networkSpanDays,
      minimumTemplateAnchorSpanDays,
      nodeEvaluationCount: evaluation.nodeEvaluations.length,
      criticalWindowCodes: evaluation.criticalWindowCodes,
      conflictCodes: evaluation.conflictSummary.conflictCodes,
      mutationBoundary: {
        writesTaskDependencies: evaluation.mutationBoundary.writesTaskDependencies,
        writesPlanDates: evaluation.mutationBoundary.writesPlanDates,
        writesCriticalPathFacts: evaluation.mutationBoundary.writesCriticalPathFacts,
        writesSeed: evaluation.mutationBoundary.writesSeed,
        writesBaseline: evaluation.mutationBoundary.writesBaseline,
      },
    }
  })
  const readyEvaluationCount = evaluations
    .filter((evaluation) => (
      evaluation.status === 'phase1_readonly_evaluation_ready'
      && evaluation.canEnterC1913Phase1Selection
      && evaluation.topologyEvaluated
      && evaluation.floatCalculated
    )).length

  return {
    status: readyEvaluationCount === REPRESENTATIVE_SCHEDULE_SCENARIOS.length ? 'ready' : 'blocked',
    readyEvaluationCount,
    minimumEvaluationCount: REPRESENTATIVE_SCHEDULE_SCENARIOS.length,
    evaluations,
  }
}

function buildRepresentativeMultiNetworkEvaluation(input: {
  candidateId: string
  standardLibraryReadiness: T2RhythmScheduleCandidatePackage['standardLibraryReadiness']
  selection: T2RhythmTemplateSelectionInput
  facts: Record<string, unknown>
  organizationAssumptions: string[]
  selectedWorkfaceUnits: string[]
  priorityTemplateId?: string
}) {
  const candidatePackage = buildT2RhythmScheduleCandidatePackageInternal({
    selection: input.selection,
    facts: input.facts,
    organizationAssumptions: input.organizationAssumptions,
    selectedWorkfaceUnits: input.selectedWorkfaceUnits,
    priorityAdjudication: input.priorityTemplateId
      ? {
          selectedTemplateId: input.priorityTemplateId,
          selectedBy: 'project_experience_over_system_standard_library',
          priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
        }
      : undefined,
    limit: 1,
  }, input.standardLibraryReadiness)
  const network = buildT2RhythmScheduleCandidateNetwork({
    candidateId: input.candidateId,
    candidatePackage,
    constructionOrganization: {
      scenarioId: input.candidateId,
      assumptions: input.organizationAssumptions,
    },
    priorityAdjudication: input.priorityTemplateId
      ? {
          selectedTemplateId: input.priorityTemplateId,
          selectedBy: 'project_experience_over_system_standard_library',
          priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
        }
      : undefined,
    productionCapacityEvidence: buildRepresentativeProductionCapacityEvidence(candidatePackage),
  })

  return evaluateT2RhythmScheduleCandidateNetwork(network)
}

type RepresentativeScheduleScenario = (typeof REPRESENTATIVE_SCHEDULE_SCENARIOS)[number]

function buildRepresentativePhase1SelectionAuditRow(input: {
  scenario: RepresentativeScheduleScenario
  selectionId: string
  evaluations: ReturnType<typeof buildRepresentativeMultiNetworkEvaluation>[]
}): T2RhythmTemplateRegistryAudit['representativePhase1MultiNetworkSelectionCoverage']['selections'][number] {
  const selection = selectT2RhythmSchedulePhase1Network({
    selectionId: input.selectionId,
    evaluations: input.evaluations,
  })

  return {
    scenarioId: input.scenario.scenarioId,
    selectionId: selection.selectionId,
    businessTypeCode: normalizeText(input.scenario.selection.businessTypeCode),
    divisionFamily: normalizeText(input.scenario.selection.divisionFamily),
    status: selection.status,
    selectedCandidateId: selection.selectedCandidateId,
    candidateCount: input.evaluations.length,
    candidateIds: input.evaluations.map((evaluation) => evaluation.candidateId),
    eligibleCandidateCount: selection.eligibleCandidateIds.length,
    eligibleCandidateIds: selection.eligibleCandidateIds,
    rejectedCandidateCount: selection.rejectedCandidates.length,
    rejectedReasonCodes: unique(selection.rejectedCandidates.flatMap((candidate) => candidate.reasonCodes)),
    rejectedConflictCandidateCount: selection.combinationConsistencyGate.rejectedConflictCandidateCount,
    rejectedMissingReceiptCandidateCount: selection.combinationConsistencyGate.rejectedMissingReceiptCandidateCount,
    rejectedMissingSelectorReceiptCandidateCount: selection.combinationConsistencyGate.rejectedMissingSelectorReceiptCandidateCount,
    rejectedLiveReplayTrustGateCandidateCount: selection.combinationConsistencyGate.rejectedLiveReplayTrustGateCandidateCount,
    trustGateEvidenceMode: 'representative_shadow_probe_not_release_evidence',
    combinationConsistencyGateStatus: selection.combinationConsistencyGate.status,
    linearPriorityCanOverrideAssemblyConflict: selection.selectionBasis.linearPriorityCanOverrideAssemblyConflict,
    selectionRankSignals: selection.selectionBasis.rankSignals,
    mutationBoundary: selection.mutationBoundary,
  }
}

function buildRepresentativeScenarioPhase1SelectionAuditRow(input: {
  scenario: RepresentativeScheduleScenario
  standardLibraryReadiness: T2RhythmScheduleCandidatePackage['standardLibraryReadiness']
}): T2RhythmTemplateRegistryAudit['representativePhase1MultiNetworkSelectionCoverage']['selections'][number] {
  const primaryTemplate = selectT2DivisionRhythmTemplates(input.scenario.selection, 1)[0]
  const incompatibleAssumption = primaryTemplate?.compatibility.incompatibleAssumptions[0]
  const conflictedOrganizationAssumptions = unique([
    ...input.scenario.organizationAssumptions,
    incompatibleAssumption,
  ])
  const evaluations = [
    buildRepresentativeMultiNetworkEvaluation({
      candidateId: `representative:${input.scenario.scenarioId}:conflicted_priority_override`,
      standardLibraryReadiness: input.standardLibraryReadiness,
      selection: input.scenario.selection,
      facts: input.scenario.facts,
      organizationAssumptions: conflictedOrganizationAssumptions,
      selectedWorkfaceUnits: input.scenario.selectedWorkfaceUnits,
      priorityTemplateId: primaryTemplate?.templateId,
    }),
    buildRepresentativeMultiNetworkEvaluation({
      candidateId: `representative:${input.scenario.scenarioId}:compatible`,
      standardLibraryReadiness: input.standardLibraryReadiness,
      selection: input.scenario.selection,
      facts: input.scenario.facts,
      organizationAssumptions: input.scenario.organizationAssumptions,
      selectedWorkfaceUnits: input.scenario.selectedWorkfaceUnits,
    }),
  ]

  return buildRepresentativePhase1SelectionAuditRow({
    scenario: input.scenario,
    selectionId: `representative:${input.scenario.scenarioId}:multi_network`,
    evaluations,
  })
}

function buildResidentialStandardFloorPhase1SelectionAuditRow(input: {
  scenario: RepresentativeScheduleScenario
  standardLibraryReadiness: T2RhythmScheduleCandidatePackage['standardLibraryReadiness']
}): T2RhythmTemplateRegistryAudit['representativePhase1MultiNetworkSelectionCoverage']['selections'][number] {
  const residentialSelectionId = 'representative:residential_standard_floor_structure:multi_network'
  const residentialStandardFloorTemplateId = 't2-residential-standard-floor-structure-rhythm-v1'
  const evaluations = [
    buildRepresentativeMultiNetworkEvaluation({
      candidateId: 'representative:residential_standard_floor_structure:conflicted_tower_first',
      standardLibraryReadiness: input.standardLibraryReadiness,
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['aluminum_formwork'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: false,
      },
      organizationAssumptions: ['tower_first_without_basement_handover'],
      selectedWorkfaceUnits: ['floor'],
      priorityTemplateId: residentialStandardFloorTemplateId,
    }),
    buildRepresentativeMultiNetworkEvaluation({
      candidateId: 'representative:residential_standard_floor_structure:compatible_basement',
      standardLibraryReadiness: input.standardLibraryReadiness,
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'basement',
        divisionFamily: 'foundation_and_basement',
        subdivisionFamily: 'basement_structure',
        methodVariantCodes: ['basement_cast_in_place'],
        scopeDimensions: ['zone', 'section'],
      },
      facts: {
        hasBasementScope: true,
        hasSupportScheme: true,
      },
      organizationAssumptions: ['basement_first_then_tower'],
      selectedWorkfaceUnits: ['zone'],
    }),
    buildRepresentativeMultiNetworkEvaluation({
      candidateId: 'representative:residential_standard_floor_structure:compatible_standard_floor',
      standardLibraryReadiness: input.standardLibraryReadiness,
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['aluminum_formwork'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: true,
      },
      organizationAssumptions: ['basement_first_then_tower'],
      selectedWorkfaceUnits: ['floor'],
      priorityTemplateId: residentialStandardFloorTemplateId,
    }),
  ]

  return buildRepresentativePhase1SelectionAuditRow({
    scenario: input.scenario,
    selectionId: residentialSelectionId,
    evaluations,
  })
}

function buildRepresentativePhase1MultiNetworkSelectionCoverage(
  standardLibraryReadiness: T2RhythmScheduleCandidatePackage['standardLibraryReadiness'],
): T2RhythmTemplateRegistryAudit['representativePhase1MultiNetworkSelectionCoverage'] {
  const probeTrustGate = buildRepresentativeShadowProbeTrustGate()
  const probeStandardLibraryReadiness = {
    ...standardLibraryReadiness,
    liveReplayTrustGate: probeTrustGate,
  }
  const selections = REPRESENTATIVE_SCHEDULE_SCENARIOS.map((scenario) => (
    scenario.scenarioId === 'residential_standard_floor_structure'
      ? buildResidentialStandardFloorPhase1SelectionAuditRow({
          scenario,
          standardLibraryReadiness: probeStandardLibraryReadiness,
        })
      : buildRepresentativeScenarioPhase1SelectionAuditRow({
          scenario,
          standardLibraryReadiness: probeStandardLibraryReadiness,
        })
  ))
  const readySelectionCount = selections.filter((row) => (
    row.status === 'phase1_selection_ready'
    && row.selectedCandidateId !== null
    && row.eligibleCandidateCount > 0
    && row.rejectedConflictCandidateCount > 0
    && row.linearPriorityCanOverrideAssemblyConflict === false
    && row.mutationBoundary.writesTaskDependencies === false
    && row.mutationBoundary.writesPlanDates === false
    && row.mutationBoundary.writesRuntimePublications === false
  )).length

  return {
    status: readySelectionCount === selections.length ? 'ready' : 'blocked',
    readySelectionCount,
    minimumSelectionCount: selections.length,
    selections,
  }
}

function fixtureDateFromOffset(dayOffset: number) {
  return new Date(Date.UTC(2026, 0, 5 + dayOffset)).toISOString().slice(0, 10)
}

function summarizeReplayFixtureVariance(samples: T2RhythmTemplateReplayEvidenceSample[]) {
  let nonZeroAbsoluteErrorSampleCount = 0
  let earlyFinishSampleCount = 0
  let delayedFinishSampleCount = 0
  let maximumAbsoluteErrorDays = 0

  for (const sample of samples) {
    const actualDuration = orderedInclusiveDurationDays(sample.actualStartDate, sample.actualEndDate)
    const plannedDuration = Number(sample.plannedWindowDurationDays)
    if (actualDuration !== null && Number.isFinite(plannedDuration) && plannedDuration > 0) {
      const absoluteErrorDays = Math.abs(actualDuration - plannedDuration)
      if (absoluteErrorDays > 0) nonZeroAbsoluteErrorSampleCount += 1
      maximumAbsoluteErrorDays = Math.max(maximumAbsoluteErrorDays, absoluteErrorDays)
    }

    const finishDeltaDays = signedDurationDayDelta(sample.plannedGateDate, sample.actualGateDate)
    if (finishDeltaDays !== null && finishDeltaDays < 0) earlyFinishSampleCount += 1
    if (finishDeltaDays !== null && finishDeltaDays > 0) delayedFinishSampleCount += 1
  }

  return {
    distinctWorkfaceCount: new Set(samples.map((sample) => sample.workfaceKey).filter(Boolean)).size,
    nonZeroAbsoluteErrorSampleCount,
    earlyFinishSampleCount,
    delayedFinishSampleCount,
    maximumAbsoluteErrorDays,
  }
}

function buildReplayFixtureSample(
  scenarioId: string,
  window: T2RhythmScheduleCandidatePackage['packageWindows'][number],
  index: number,
  varianceMode: 'early_finish' | 'delayed_finish' | 'duration_overrun' | 'on_plan',
): T2RhythmTemplateReplayEvidenceSample {
  const durationDays = Math.max(1, Math.round(window.durationDays))
  const varianceDays = varianceMode === 'early_finish' && durationDays > 1
    ? -1
    : varianceMode === 'delayed_finish' || varianceMode === 'duration_overrun' ? 1 : 0
  const actualDurationDays = Math.max(1, durationDays + varianceDays)
  const startOffset = index * 3 + Math.floor(index / 12) * 45
  const actualStartOffset = varianceMode === 'early_finish' && durationDays <= 1
    ? startOffset - 1
    : varianceMode === 'delayed_finish' && durationDays <= 1 ? startOffset + 1 : startOffset
  const startDate = fixtureDateFromOffset(actualStartOffset)
  const plannedEndDate = fixtureDateFromOffset(startOffset + durationDays - 1)
  const actualEndDate = fixtureDateFromOffset(actualStartOffset + actualDurationDays - 1)

  return {
    sampleId: `fixture:${scenarioId}:${String(index + 1).padStart(3, '0')}`,
    projectId: `fixture-project:${scenarioId}`,
    workfaceKey: `fixture-workface:${scenarioId}:${(index % 3) + 1}:${window.windowCode}`,
    windowCode: window.windowCode,
    plannedWindowDurationDays: durationDays,
    templateP80WindowDurationDays: Math.max(durationDays + 1, Math.round(window.durationDays)),
    plannedGateDate: plannedEndDate,
    actualGateDate: actualEndDate,
    actualStartDate: startDate,
    actualEndDate,
    dependencySatisfied: true,
    evidenceRef: `fixture:t2_representative_replay:${scenarioId}:${window.windowCode}:${index + 1}`,
  }
}

function deriveGateWindowCodes(candidatePackage: T2RhythmScheduleCandidatePackage) {
  const windowCodes = new Set(candidatePackage.packageWindows.map((window) => window.windowCode))
  const windowsByGateLabel = new Map(
    candidatePackage.packageWindows.map((window) => [
      `${window.templateId}:${normalizeGateAnchorLabel(window.role)}`,
      window.windowCode,
    ]),
  )
  const gateWindowCodes = new Set<string>()

  for (const gate of candidatePackage.hardGates) {
    const windowCode = windowsByGateLabel.get(`${gate.sourceTemplateId}:${normalizeGateAnchorLabel(gate.label)}`)
    if (windowCode) gateWindowCodes.add(windowCode)
  }

  for (const edge of candidatePackage.dependencyCandidates) {
    if (!edge.mandatory || !['handover_gate', 'readiness_gate', 'quality_gate'].includes(edge.edgeType)) continue
    if (windowCodes.has(edge.predecessorWindowCode)) gateWindowCodes.add(edge.predecessorWindowCode)
    if (windowCodes.has(edge.successorWindowCode)) gateWindowCodes.add(edge.successorWindowCode)
  }

  return Array.from(gateWindowCodes)
}

function buildRepresentativeReplayFixtureSamples(
  scenarioId: string,
  candidatePackage: T2RhythmScheduleCandidatePackage,
  criticalWindowCodes: string[] = [],
  gateWindowCodes: string[] = [],
): T2RhythmTemplateReplayEvidenceSample[] {
  const comparableWindows = candidatePackage.packageWindows
    .filter((window) => window.durationBearing && Number.isFinite(window.durationDays) && window.durationDays > 0)
  if (candidatePackage.status !== 'schedulable_candidate' || comparableWindows.length === 0) return []
  const validationWindowCodes = unique([...criticalWindowCodes, ...gateWindowCodes])
  const validationWindows = validationWindowCodes
    .map((windowCode) => candidatePackage.packageWindows.find((window) => window.windowCode === windowCode))
    .filter((window): window is T2RhythmScheduleCandidatePackage['packageWindows'][number] => Boolean(window))
  const fixtureWindows = [
    ...validationWindows,
    ...comparableWindows.filter((window) => !validationWindowCodes.includes(window.windowCode)),
  ]
  const windows = fixtureWindows.length > 0 ? fixtureWindows : comparableWindows

  const samples: T2RhythmTemplateReplayEvidenceSample[] = []
  let sampleIndex = 0

  for (const window of validationWindows) {
    samples.push(buildReplayFixtureSample(scenarioId, window, sampleIndex, 'early_finish'))
    sampleIndex += 1
    samples.push(buildReplayFixtureSample(scenarioId, window, sampleIndex, 'delayed_finish'))
    sampleIndex += 1
  }

  while (samples.length < T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS.minimumSampleCount) {
    const window = windows[sampleIndex % windows.length]
    const varianceMode = (() => {
      if (sampleIndex % 6 === 0) return 'duration_overrun' as const
      return 'on_plan' as const
    })()
    samples.push(buildReplayFixtureSample(scenarioId, window, sampleIndex, varianceMode))
    sampleIndex += 1
  }

  return samples
}

function buildWindowReplayDepth(
  samples: T2RhythmTemplateReplayEvidenceSample[],
  windowCodes: string[],
  evidencePrefix: 'critical_window' | 'gate_window',
) {
  return windowCodes.map((windowCode) => {
    const windowSamples = samples.filter((sample) => sample.windowCode === windowCode)
    const variance = summarizeReplayFixtureVariance(windowSamples)
    const missingEvidenceCodes = [
      ...(windowSamples.length >= 2 ? [] : [`${evidencePrefix}_sample_depth_missing`]),
      ...(variance.distinctWorkfaceCount >= 2 ? [] : [`${evidencePrefix}_workface_diversity_missing`]),
      ...(variance.nonZeroAbsoluteErrorSampleCount >= 1 ? [] : [`${evidencePrefix}_actual_variance_missing`]),
      ...(variance.earlyFinishSampleCount >= 1 && variance.delayedFinishSampleCount >= 1
        ? []
        : [`${evidencePrefix}_bidirectional_gate_slip_missing`]),
      ...(variance.maximumAbsoluteErrorDays <= T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS.maximumMedianAbsoluteErrorDays
        ? []
        : [`${evidencePrefix}_variance_out_of_control`]),
    ]

    return {
      windowCode,
      status: missingEvidenceCodes.length === 0 ? 'ready' as const : 'blocked' as const,
      sampleCount: windowSamples.length,
      distinctWorkfaceCount: variance.distinctWorkfaceCount,
      nonZeroAbsoluteErrorSampleCount: variance.nonZeroAbsoluteErrorSampleCount,
      earlyFinishSampleCount: variance.earlyFinishSampleCount,
      delayedFinishSampleCount: variance.delayedFinishSampleCount,
      maximumAbsoluteErrorDays: variance.maximumAbsoluteErrorDays,
      missingEvidenceCodes,
    }
  })
}

function buildRepresentativeReplayFixtureCoverage(
  standardLibraryReadiness: T2RhythmScheduleCandidatePackage['standardLibraryReadiness'],
): T2RhythmTemplateRegistryAudit['representativeReplayFixtureCoverage'] {
  const fixtures = REPRESENTATIVE_SCHEDULE_SCENARIOS.map((scenario) => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackageInternal({
      selection: scenario.selection,
      organizationAssumptions: scenario.organizationAssumptions,
      selectedWorkfaceUnits: scenario.selectedWorkfaceUnits,
      facts: scenario.facts,
      limit: 6,
    }, standardLibraryReadiness)
    const network = buildT2RhythmScheduleCandidateNetwork({
      candidateId: `representative:${scenario.scenarioId}:replay_fixture`,
      candidatePackage,
      productionCapacityEvidence: buildRepresentativeProductionCapacityEvidence(candidatePackage),
    })
    const evaluation = evaluateT2RhythmScheduleCandidateNetwork(network)
    const criticalWindowCodes = Array.from(new Set(evaluation.criticalWindowCodes))
    const gateWindowCodes = deriveGateWindowCodes(candidatePackage)
    const samples = buildRepresentativeReplayFixtureSamples(
      scenario.scenarioId,
      candidatePackage,
      criticalWindowCodes,
      gateWindowCodes,
    )
    const varianceSummary = summarizeReplayFixtureVariance(samples)
    const replayCoveredWindowCodes = Array.from(new Set(samples.map((sample) => sample.windowCode)))
    const missingCriticalWindowCodes = criticalWindowCodes
      .filter((windowCode) => !replayCoveredWindowCodes.includes(windowCode))
    const missingGateWindowCodes = gateWindowCodes
      .filter((windowCode) => !replayCoveredWindowCodes.includes(windowCode))
    const criticalWindowReplayDepth = buildWindowReplayDepth(samples, criticalWindowCodes, 'critical_window')
    const gateWindowReplayDepth = buildWindowReplayDepth(samples, gateWindowCodes, 'gate_window')
    const underSampledCriticalWindowCodes = criticalWindowReplayDepth
      .filter((row) => row.missingEvidenceCodes.includes('critical_window_sample_depth_missing'))
      .map((row) => row.windowCode)
    const lowDiversityCriticalWindowCodes = criticalWindowReplayDepth
      .filter((row) => row.missingEvidenceCodes.includes('critical_window_workface_diversity_missing'))
      .map((row) => row.windowCode)
    const flatVarianceCriticalWindowCodes = criticalWindowReplayDepth
      .filter((row) => row.missingEvidenceCodes.includes('critical_window_actual_variance_missing'))
      .map((row) => row.windowCode)
    const singleSidedGateSlipCriticalWindowCodes = criticalWindowReplayDepth
      .filter((row) => row.missingEvidenceCodes.includes('critical_window_bidirectional_gate_slip_missing'))
      .map((row) => row.windowCode)
    const outOfControlCriticalWindowCodes = criticalWindowReplayDepth
      .filter((row) => row.missingEvidenceCodes.includes('critical_window_variance_out_of_control'))
      .map((row) => row.windowCode)
    const underSampledGateWindowCodes = gateWindowReplayDepth
      .filter((row) => row.missingEvidenceCodes.includes('gate_window_sample_depth_missing'))
      .map((row) => row.windowCode)
    const lowDiversityGateWindowCodes = gateWindowReplayDepth
      .filter((row) => row.missingEvidenceCodes.includes('gate_window_workface_diversity_missing'))
      .map((row) => row.windowCode)
    const flatVarianceGateWindowCodes = gateWindowReplayDepth
      .filter((row) => row.missingEvidenceCodes.includes('gate_window_actual_variance_missing'))
      .map((row) => row.windowCode)
    const singleSidedGateSlipGateWindowCodes = gateWindowReplayDepth
      .filter((row) => row.missingEvidenceCodes.includes('gate_window_bidirectional_gate_slip_missing'))
      .map((row) => row.windowCode)
    const outOfControlGateWindowCodes = gateWindowReplayDepth
      .filter((row) => row.missingEvidenceCodes.includes('gate_window_variance_out_of_control'))
      .map((row) => row.windowCode)
    const templateId = candidatePackage.selectedTemplateIds[0] ?? null
    const replayEvidence = buildT2RhythmTemplateReplayEvidence({
      templateId: templateId ?? `representative:${scenario.scenarioId}:no_template`,
      samples,
    })
    const readyForShadow = candidatePackage.status === 'schedulable_candidate'
      && replayEvidence.acceptance.readyForShadow
      && replayEvidence.sampleQualityIssues.length === 0
      && missingCriticalWindowCodes.length === 0
      && missingGateWindowCodes.length === 0
      && underSampledCriticalWindowCodes.length === 0
      && lowDiversityCriticalWindowCodes.length === 0
      && flatVarianceCriticalWindowCodes.length === 0
      && singleSidedGateSlipCriticalWindowCodes.length === 0
      && outOfControlCriticalWindowCodes.length === 0
      && underSampledGateWindowCodes.length === 0
      && lowDiversityGateWindowCodes.length === 0
      && flatVarianceGateWindowCodes.length === 0
      && singleSidedGateSlipGateWindowCodes.length === 0
      && outOfControlGateWindowCodes.length === 0
    const status = readyForShadow ? 'shadow_candidate' as const : 'data_collection_open' as const

    return {
      scenarioId: scenario.scenarioId,
      templateId,
      selectedTemplateIds: candidatePackage.selectedTemplateIds,
      status,
      readyForShadow,
      readyForPublish: replayEvidence.acceptance.readyForPublish,
      sampleCount: replayEvidence.metrics.sampleCount,
      comparableWorkfaceWindowCount: replayEvidence.metrics.comparableWorkfaceWindowCount,
      p80CaptureRate: replayEvidence.metrics.p80CaptureRate,
      medianAbsoluteErrorDays: replayEvidence.metrics.medianAbsoluteErrorDays,
      gateSlipMedianDays: replayEvidence.metrics.gateSlipMedianDays,
      dependencyViolationRate: replayEvidence.metrics.dependencyViolationRate,
      evidenceRefCount: replayEvidence.evidenceRefs.length,
      sampleQualityIssueCount: replayEvidence.sampleQualityIssues.length,
      ...varianceSummary,
      criticalWindowCodes,
      gateWindowCodes,
      replayCoveredWindowCodes,
      missingCriticalWindowCodes,
      missingGateWindowCodes,
      criticalWindowReplayDepth,
      gateWindowReplayDepth,
      underSampledCriticalWindowCodes,
      lowDiversityCriticalWindowCodes,
      flatVarianceCriticalWindowCodes,
      singleSidedGateSlipCriticalWindowCodes,
      outOfControlCriticalWindowCodes,
      underSampledGateWindowCodes,
      lowDiversityGateWindowCodes,
      flatVarianceGateWindowCodes,
      singleSidedGateSlipGateWindowCodes,
      outOfControlGateWindowCodes,
      blockingReasons: readyForShadow
        ? []
        : Array.from(new Set([
            ...replayEvidence.acceptance.blockingReasons,
            ...(candidatePackage.status === 'schedulable_candidate' ? [] : [`candidate_package_${candidatePackage.status}`]),
            ...(replayEvidence.sampleQualityIssues.length === 0 ? [] : ['fixture_sample_quality_issue']),
            ...(missingCriticalWindowCodes.length === 0 ? [] : ['critical_window_replay_coverage_missing']),
            ...(missingGateWindowCodes.length === 0 ? [] : ['gate_window_replay_coverage_missing']),
            ...(underSampledCriticalWindowCodes.length === 0 ? [] : ['critical_window_replay_depth_missing']),
            ...(lowDiversityCriticalWindowCodes.length === 0 ? [] : ['critical_window_workface_diversity_missing']),
            ...(flatVarianceCriticalWindowCodes.length === 0 ? [] : ['critical_window_actual_variance_missing']),
            ...(singleSidedGateSlipCriticalWindowCodes.length === 0 ? [] : ['critical_window_bidirectional_gate_slip_missing']),
            ...(outOfControlCriticalWindowCodes.length === 0 ? [] : ['critical_window_variance_out_of_control']),
            ...(underSampledGateWindowCodes.length === 0 ? [] : ['gate_window_replay_depth_missing']),
            ...(lowDiversityGateWindowCodes.length === 0 ? [] : ['gate_window_workface_diversity_missing']),
            ...(flatVarianceGateWindowCodes.length === 0 ? [] : ['gate_window_actual_variance_missing']),
            ...(singleSidedGateSlipGateWindowCodes.length === 0 ? [] : ['gate_window_bidirectional_gate_slip_missing']),
            ...(outOfControlGateWindowCodes.length === 0 ? [] : ['gate_window_variance_out_of_control']),
          ])),
      governance: {
        directSeedMutationAllowed: replayEvidence.governance.directSeedMutationAllowed,
        writesPlanDates: replayEvidence.governance.writesPlanDates,
        writesTaskDependencies: replayEvidence.governance.writesTaskDependencies,
        requiresL5Publication: replayEvidence.governance.requiresL5Publication,
      },
    }
  })
  const readyFixtureCount = fixtures
    .filter((fixture) => fixture.readyForShadow && fixture.status === 'shadow_candidate').length

  return {
    status: readyFixtureCount === REPRESENTATIVE_SCHEDULE_SCENARIOS.length ? 'ready' : 'blocked',
    readyFixtureCount,
    minimumFixtureCount: REPRESENTATIVE_SCHEDULE_SCENARIOS.length,
    fixtures,
  }
}

function buildBusinessTypeRepresentativeEvidenceMatrix(input: {
  businessTypeProfiles: ReturnType<typeof buildBusinessTypeProfiles>
  representativeScheduleScenarioCoverage: T2RhythmTemplateRegistryAudit['representativeScheduleScenarioCoverage']
  representativePhase1EvaluationCoverage: T2RhythmTemplateRegistryAudit['representativePhase1EvaluationCoverage']
  representativeReplayFixtureCoverage: T2RhythmTemplateRegistryAudit['representativeReplayFixtureCoverage']
}): T2RhythmTemplateRegistryAudit['businessTypeRepresentativeEvidenceMatrix'] {
  const profilesByBusinessType = new Map(input.businessTypeProfiles.map((profile) => [
    profile.businessTypeCode,
    profile,
  ]))
  const phase1EvaluationsByScenario = new Map(input.representativePhase1EvaluationCoverage.evaluations.map((evaluation) => [
    evaluation.scenarioId,
    evaluation,
  ]))
  const replayFixturesByScenario = new Map(input.representativeReplayFixtureCoverage.fixtures.map((fixture) => [
    fixture.scenarioId,
    fixture,
  ]))

  return REQUIRED_BUSINESS_TYPE_DIVISION_PROFILES.map((requiredProfile) => {
    const businessTypeCode = requiredProfile.businessTypeCode
    const profile = profilesByBusinessType.get(businessTypeCode)
    const scenario = findRepresentativeScenario(
      input.representativeScheduleScenarioCoverage.scenarios,
      (item) => item.businessTypeCode === businessTypeCode,
    )
    const phase1Evaluation = scenario
      ? phase1EvaluationsByScenario.get(scenario.scenarioId)
      : undefined
    const replayFixture = scenario
      ? replayFixturesByScenario.get(scenario.scenarioId)
      : undefined
    const missingEvidenceCodes: string[] = []

    if (!profile) missingEvidenceCodes.push('business_type_profile_missing')
    if (profile && profile.status !== 'ready') missingEvidenceCodes.push('business_type_profile_not_ready')
    if (!scenario) missingEvidenceCodes.push('representative_schedule_scenario_missing')
    if (scenario && (scenario.status !== 'schedulable_candidate' || !scenario.canEnterC1913Phase1Selection)) {
      missingEvidenceCodes.push('representative_schedule_scenario_not_schedulable')
    }
    if (!phase1Evaluation) missingEvidenceCodes.push('representative_phase1_evaluation_missing')
    if (
      phase1Evaluation
      && (
        phase1Evaluation.status !== 'phase1_readonly_evaluation_ready'
        || !phase1Evaluation.canEnterC1913Phase1Selection
        || !phase1Evaluation.topologyEvaluated
        || !phase1Evaluation.floatCalculated
      )
    ) {
      missingEvidenceCodes.push('representative_phase1_evaluation_not_ready')
    }
    if (!replayFixture) missingEvidenceCodes.push('representative_replay_fixture_missing')
    if (replayFixture && (replayFixture.status !== 'shadow_candidate' || !replayFixture.readyForShadow)) {
      missingEvidenceCodes.push('representative_replay_fixture_not_ready')
    }
    if (replayFixture && replayFixture.missingCriticalWindowCodes.length > 0) {
      missingEvidenceCodes.push('representative_replay_fixture_missing_critical_window')
    }

    const selectedTemplateIds = unique([
      ...(scenario?.selectedTemplateIds ?? []),
      ...(replayFixture?.selectedTemplateIds ?? []),
    ])

    return {
      businessTypeCode,
      status: missingEvidenceCodes.length === 0 ? 'ready' as const : 'blocked' as const,
      representativeScenarioId: scenario?.scenarioId ?? null,
      selectedTemplateIds,
      businessTypeProfileStatus: profile?.status ?? 'missing' as const,
      representativeScheduleScenarioStatus: scenario?.status ?? 'missing' as const,
      phase1EvaluationStatus: phase1Evaluation?.status ?? 'missing' as const,
      replayFixtureStatus: replayFixture?.status ?? 'missing' as const,
      canEnterC1913Phase1Selection: Boolean(
        scenario?.canEnterC1913Phase1Selection
        && phase1Evaluation?.canEnterC1913Phase1Selection,
      ),
      readyForShadow: Boolean(replayFixture?.readyForShadow && replayFixture.status === 'shadow_candidate'),
      missingEvidenceCodes: unique(missingEvidenceCodes),
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        requiresL5Publication: true,
      },
    }
  })
}

function findRepresentativeScenario(
  scenarios: T2RhythmTemplateRegistryAudit['representativeScheduleScenarioCoverage']['scenarios'],
  predicate: (scenario: T2RhythmTemplateRegistryAudit['representativeScheduleScenarioCoverage']['scenarios'][number]) => boolean,
) {
  return scenarios.find((scenario) => (
    predicate(scenario)
    && scenario.status === 'schedulable_candidate'
    && scenario.canEnterC1913Phase1Selection
  )) ?? scenarios.find(predicate)
}

function buildDivisionFamilyRepresentativeEvidenceMatrix(input: {
  representativeScheduleScenarioCoverage: T2RhythmTemplateRegistryAudit['representativeScheduleScenarioCoverage']
  representativePhase1EvaluationCoverage: T2RhythmTemplateRegistryAudit['representativePhase1EvaluationCoverage']
  representativeReplayFixtureCoverage: T2RhythmTemplateRegistryAudit['representativeReplayFixtureCoverage']
}): T2RhythmTemplateRegistryAudit['divisionFamilyRepresentativeEvidenceMatrix'] {
  const phase1EvaluationsByScenario = new Map(input.representativePhase1EvaluationCoverage.evaluations.map((evaluation) => [
    evaluation.scenarioId,
    evaluation,
  ]))
  const replayFixturesByScenario = new Map(input.representativeReplayFixtureCoverage.fixtures.map((fixture) => [
    fixture.scenarioId,
    fixture,
  ]))

  return REQUIRED_DIVISION_FAMILY_REPRESENTATIVE_PROFILES.map((divisionFamily) => {
    const scenario = findRepresentativeScenario(
      input.representativeScheduleScenarioCoverage.scenarios,
      (item) => item.divisionFamily === divisionFamily,
    )
    const phase1Evaluation = scenario
      ? phase1EvaluationsByScenario.get(scenario.scenarioId)
      : undefined
    const replayFixture = scenario
      ? replayFixturesByScenario.get(scenario.scenarioId)
      : undefined
    const missingEvidenceCodes: string[] = []

    if (!scenario) missingEvidenceCodes.push('representative_schedule_scenario_missing')
    if (scenario && (scenario.status !== 'schedulable_candidate' || !scenario.canEnterC1913Phase1Selection)) {
      missingEvidenceCodes.push('representative_schedule_scenario_not_schedulable')
    }
    if (!phase1Evaluation) missingEvidenceCodes.push('representative_phase1_evaluation_missing')
    if (
      phase1Evaluation
      && (
        phase1Evaluation.status !== 'phase1_readonly_evaluation_ready'
        || !phase1Evaluation.canEnterC1913Phase1Selection
        || !phase1Evaluation.topologyEvaluated
        || !phase1Evaluation.floatCalculated
      )
    ) {
      missingEvidenceCodes.push('representative_phase1_evaluation_not_ready')
    }
    if (!replayFixture) missingEvidenceCodes.push('representative_replay_fixture_missing')
    if (replayFixture && (replayFixture.status !== 'shadow_candidate' || !replayFixture.readyForShadow)) {
      missingEvidenceCodes.push('representative_replay_fixture_not_ready')
    }
    if (replayFixture && replayFixture.missingCriticalWindowCodes.length > 0) {
      missingEvidenceCodes.push('representative_replay_fixture_missing_critical_window')
    }

    const selectedTemplateIds = unique([
      ...(scenario?.selectedTemplateIds ?? []),
      ...(replayFixture?.selectedTemplateIds ?? []),
    ])

    return {
      divisionFamily,
      status: missingEvidenceCodes.length === 0 ? 'ready' as const : 'blocked' as const,
      representativeScenarioId: scenario?.scenarioId ?? null,
      selectedTemplateIds,
      representativeScheduleScenarioStatus: scenario?.status ?? 'missing' as const,
      phase1EvaluationStatus: phase1Evaluation?.status ?? 'missing' as const,
      replayFixtureStatus: replayFixture?.status ?? 'missing' as const,
      canEnterC1913Phase1Selection: Boolean(
        scenario?.canEnterC1913Phase1Selection
        && phase1Evaluation?.canEnterC1913Phase1Selection,
      ),
      readyForShadow: Boolean(replayFixture?.readyForShadow && replayFixture.status === 'shadow_candidate'),
      missingEvidenceCodes: unique(missingEvidenceCodes),
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        requiresL5Publication: true,
      },
    }
  })
}

function buildTemplateRepresentativeSelection(template: T2DivisionRhythmTemplate): T2RhythmTemplateSelectionInput {
  return {
    businessTypeCode: template.applicability.businessTypeCodes[0] ?? null,
    phaseWindow: template.applicability.phaseWindows[0] ?? null,
    divisionFamily: template.applicability.divisionFamilies[0] ?? null,
    subdivisionFamily: template.applicability.subdivisionFamilies[0] ?? null,
    methodVariantCodes: template.applicability.methodVariantCodes.slice(0, 1),
    structureTypeCodes: template.applicability.structureTypeCodes.slice(0, 1),
    scopeDimensions: template.applicability.requiredScopeDimensions,
  }
}

function buildTemplateRepresentativeFacts(template: T2DivisionRhythmTemplate) {
  return Object.fromEntries(template.compatibility.requiredFacts.map((factKey) => [factKey, true]))
}

function buildTemplateRepresentativeEvidenceMatrix(
  standardLibraryReadiness: T2RhythmScheduleCandidatePackage['standardLibraryReadiness'],
): T2RhythmTemplateRegistryAudit['templateRepresentativeEvidenceMatrix'] {
  return T2_DIVISION_RHYTHM_TEMPLATE_SEED.map((template) => {
    const scenarioId = `template_probe:${template.templateId}`
    const candidatePackage = buildT2RhythmScheduleCandidatePackageInternal({
      selection: buildTemplateRepresentativeSelection(template),
      organizationAssumptions: template.compatibility.compatibleOrganizationAssumptions.slice(0, 1),
      selectedWorkfaceUnits: [template.rhythm.workfaceUnit],
      facts: buildTemplateRepresentativeFacts(template),
      limit: 1,
    }, standardLibraryReadiness)
    const network = buildT2RhythmScheduleCandidateNetwork({
      candidateId: scenarioId,
      candidatePackage,
      productionCapacityEvidence: buildRepresentativeProductionCapacityEvidence(candidatePackage),
    })
    const evaluation = evaluateT2RhythmScheduleCandidateNetwork(network)
    const criticalWindowCodes = Array.from(new Set(evaluation.criticalWindowCodes))
    const samples = buildRepresentativeReplayFixtureSamples(
      scenarioId,
      candidatePackage,
      criticalWindowCodes,
    )
    const replayCoveredWindowCodes = Array.from(new Set(samples.map((sample) => sample.windowCode)))
    const missingCriticalWindowCodes = criticalWindowCodes
      .filter((windowCode) => !replayCoveredWindowCodes.includes(windowCode))
    const replayEvidence = buildT2RhythmTemplateReplayEvidence({
      templateId: template.templateId,
      samples,
    })
    const representativeScheduleScenarioStatus = candidatePackage.status
    const phase1EvaluationStatus = evaluation.status
    const readyForShadow = candidatePackage.status === 'schedulable_candidate'
      && replayEvidence.acceptance.readyForShadow
      && replayEvidence.sampleQualityIssues.length === 0
      && missingCriticalWindowCodes.length === 0
    const replayFixtureStatus = readyForShadow ? 'shadow_candidate' as const : 'data_collection_open' as const
    const missingEvidenceCodes: string[] = []

    if (!candidatePackage.selectedTemplateIds.includes(template.templateId)) {
      missingEvidenceCodes.push('template_probe_selection_missing_target_template')
    }
    if (representativeScheduleScenarioStatus !== 'schedulable_candidate') {
      missingEvidenceCodes.push('representative_schedule_scenario_not_schedulable')
    }
    if (
      phase1EvaluationStatus !== 'phase1_readonly_evaluation_ready'
      || !evaluation.canEnterC1913Phase1Selection
      || !evaluation.scheduleTrustEvidence.topologyEvaluated
      || !evaluation.scheduleTrustEvidence.floatCalculated
    ) {
      missingEvidenceCodes.push('representative_phase1_evaluation_not_ready')
    }
    if (replayFixtureStatus !== 'shadow_candidate' || !readyForShadow) {
      missingEvidenceCodes.push('representative_replay_fixture_not_ready')
    }
    if (missingCriticalWindowCodes.length > 0) {
      missingEvidenceCodes.push('representative_replay_fixture_missing_critical_window')
    }

    return {
      templateId: template.templateId,
      status: missingEvidenceCodes.length === 0 ? 'ready' as const : 'blocked' as const,
      representativeScenarioIds: [scenarioId],
      selectedTemplateIds: candidatePackage.selectedTemplateIds,
      representativeScheduleScenarioStatus,
      phase1EvaluationStatus,
      replayFixtureStatus,
      canEnterC1913Phase1Selection: Boolean(
        candidatePackage.standardLibraryReadiness.canEnterC1913Phase1Selection
        && evaluation.canEnterC1913Phase1Selection
        && evaluation.status === 'phase1_readonly_evaluation_ready',
      ),
      readyForShadow,
      missingEvidenceCodes: unique(missingEvidenceCodes),
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        requiresL5Publication: true,
      },
    }
  })
}

function buildPhaseWindowRepresentativeEvidenceMatrix(
  templateRepresentativeEvidenceMatrix: T2RhythmTemplateRegistryAudit['templateRepresentativeEvidenceMatrix'],
): T2RhythmTemplateRegistryAudit['phaseWindowRepresentativeEvidenceMatrix'] {
  const templateRowsById = new Map(templateRepresentativeEvidenceMatrix.map((row) => [row.templateId, row]))
  const phaseWindows = unique(T2_DIVISION_RHYTHM_TEMPLATE_SEED.flatMap((template) => template.applicability.phaseWindows))

  return phaseWindows.map((phaseWindow) => {
    const templates = T2_DIVISION_RHYTHM_TEMPLATE_SEED
      .filter((template) => includesNormalized(template.applicability.phaseWindows, phaseWindow))
    const rows = templates
      .map((template) => templateRowsById.get(template.templateId))
      .filter((row): row is T2RhythmTemplateRegistryAudit['templateRepresentativeEvidenceMatrix'][number] => Boolean(row))
    const missingEvidenceCodes: string[] = []

    if (templates.length === 0) missingEvidenceCodes.push('phase_window_template_missing')
    if (rows.length !== templates.length) missingEvidenceCodes.push('phase_window_template_probe_missing')
    if (rows.some((row) => row.representativeScheduleScenarioStatus !== 'schedulable_candidate')) {
      missingEvidenceCodes.push('representative_schedule_scenario_not_schedulable')
    }
    if (rows.some((row) => row.phase1EvaluationStatus !== 'phase1_readonly_evaluation_ready' || !row.canEnterC1913Phase1Selection)) {
      missingEvidenceCodes.push('representative_phase1_evaluation_not_ready')
    }
    if (rows.some((row) => row.replayFixtureStatus !== 'shadow_candidate' || !row.readyForShadow)) {
      missingEvidenceCodes.push('representative_replay_fixture_not_ready')
    }
    missingEvidenceCodes.push(...rows.flatMap((row) => row.missingEvidenceCodes))

    const representativeScheduleScenarioStatus = rows.length > 0 && rows.every((row) => row.representativeScheduleScenarioStatus === 'schedulable_candidate')
      ? 'schedulable_candidate' as const
      : rows.some((row) => row.representativeScheduleScenarioStatus === 'candidate_conflict')
        ? 'candidate_conflict' as const
        : rows.some((row) => row.representativeScheduleScenarioStatus === 'no_template_match')
          ? 'no_template_match' as const
          : 'missing' as const
    const phase1EvaluationStatus = rows.length > 0 && rows.every((row) => row.phase1EvaluationStatus === 'phase1_readonly_evaluation_ready')
      ? 'phase1_readonly_evaluation_ready' as const
      : rows.some((row) => row.phase1EvaluationStatus === 'candidate_conflict')
        ? 'candidate_conflict' as const
        : 'missing' as const
    const replayFixtureStatus = rows.length > 0 && rows.every((row) => row.replayFixtureStatus === 'shadow_candidate')
      ? 'shadow_candidate' as const
      : rows.some((row) => row.replayFixtureStatus === 'data_collection_open')
        ? 'data_collection_open' as const
        : 'missing' as const

    return {
      phaseWindow,
      status: missingEvidenceCodes.length === 0 ? 'ready' as const : 'blocked' as const,
      representativeScenarioIds: unique(rows.flatMap((row) => row.representativeScenarioIds)),
      selectedTemplateIds: unique(rows.flatMap((row) => row.selectedTemplateIds)),
      representativeScheduleScenarioStatus,
      phase1EvaluationStatus,
      replayFixtureStatus,
      canEnterC1913Phase1Selection: rows.length > 0
        && rows.length === templates.length
        && rows.every((row) => row.canEnterC1913Phase1Selection),
      readyForShadow: rows.length > 0
        && rows.length === templates.length
        && rows.every((row) => row.readyForShadow),
      missingEvidenceCodes: unique(missingEvidenceCodes),
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        requiresL5Publication: true,
      },
    }
  })
}

function buildScheduleReadinessGate(input: {
  blockingDefects: string[]
  businessTypeProfiles: ReturnType<typeof buildBusinessTypeProfiles>
  representativeScheduleScenarioCoverage: T2RhythmTemplateRegistryAudit['representativeScheduleScenarioCoverage']
  representativePhase1EvaluationCoverage: T2RhythmTemplateRegistryAudit['representativePhase1EvaluationCoverage']
  representativePhase1MultiNetworkSelectionCoverage?: T2RhythmTemplateRegistryAudit['representativePhase1MultiNetworkSelectionCoverage']
  representativeReplayFixtureCoverage?: T2RhythmTemplateRegistryAudit['representativeReplayFixtureCoverage']
  businessTypeRepresentativeEvidenceMatrix?: T2RhythmTemplateRegistryAudit['businessTypeRepresentativeEvidenceMatrix']
  divisionFamilyRepresentativeEvidenceMatrix?: T2RhythmTemplateRegistryAudit['divisionFamilyRepresentativeEvidenceMatrix']
  templateRepresentativeEvidenceMatrix?: T2RhythmTemplateRegistryAudit['templateRepresentativeEvidenceMatrix']
  phaseWindowRepresentativeEvidenceMatrix?: T2RhythmTemplateRegistryAudit['phaseWindowRepresentativeEvidenceMatrix']
  liveReplayTrustGate?: T2RhythmStandardLibraryTrustGate | null
  phase1MultiNetworkSelectionTrustGate?: T2RhythmPhase1MultiNetworkSelectionTrustGate | null
  l5ReleaseGate?: T2RhythmStandardLibraryL5ReleaseGate | null
}) {
  const precisionDefects = defectsMatching(input.blockingDefects, PRECISION_DEFECT_MARKERS)
  const breadthDefects = defectsMatching(input.blockingDefects, BREADTH_DEFECT_MARKERS)
  const depthDefects = defectsMatching(input.blockingDefects, DEPTH_DEFECT_MARKERS)
  const readyBusinessTypeProfileCount = input.businessTypeProfiles
    .filter((profile) => profile.status === 'ready').length
  const readyBusinessTypeRepresentativeEvidenceCount = (input.businessTypeRepresentativeEvidenceMatrix ?? [])
    .filter((row) => row.status === 'ready').length
  const businessTypeRepresentativeEvidenceMatrixReady = Boolean(input.businessTypeRepresentativeEvidenceMatrix)
    && readyBusinessTypeRepresentativeEvidenceCount === REQUIRED_BUSINESS_TYPE_DIVISION_PROFILES.length
  const readyDivisionFamilyRepresentativeEvidenceCount = (input.divisionFamilyRepresentativeEvidenceMatrix ?? [])
    .filter((row) => row.status === 'ready').length
  const divisionFamilyRepresentativeEvidenceMatrixReady = Boolean(input.divisionFamilyRepresentativeEvidenceMatrix)
    && readyDivisionFamilyRepresentativeEvidenceCount === REQUIRED_DIVISION_FAMILY_REPRESENTATIVE_PROFILES.length
  const readyTemplateRepresentativeEvidenceCount = (input.templateRepresentativeEvidenceMatrix ?? [])
    .filter((row) => row.status === 'ready').length
  const templateRepresentativeEvidenceMatrixReady = Boolean(input.templateRepresentativeEvidenceMatrix)
    && readyTemplateRepresentativeEvidenceCount === T2_DIVISION_RHYTHM_TEMPLATE_SEED.length
  const readyPhaseWindowRepresentativeEvidenceCount = (input.phaseWindowRepresentativeEvidenceMatrix ?? [])
    .filter((row) => row.status === 'ready').length
  const phaseWindowRepresentativeEvidenceMatrixReady = Boolean(input.phaseWindowRepresentativeEvidenceMatrix)
    && readyPhaseWindowRepresentativeEvidenceCount === unique(T2_DIVISION_RHYTHM_TEMPLATE_SEED.flatMap((template) => template.applicability.phaseWindows)).length
  const representativePhase1MultiNetworkSelectionReady = Boolean(input.representativePhase1MultiNetworkSelectionCoverage)
    && input.representativePhase1MultiNetworkSelectionCoverage.readySelectionCount >= input.representativePhase1MultiNetworkSelectionCoverage.minimumSelectionCount
  const isReadyForShadowCandidate = precisionDefects.length === 0
    && breadthDefects.length === 0
    && depthDefects.length === 0

  return {
    status: isReadyForShadowCandidate
      ? 'shadow_candidate_ready_not_publishable' as const
      : 'not_ready' as const,
    canEnterC1913Phase1Selection: isReadyForShadowCandidate,
    canAutoMaterializeTaskDependencies: false as const,
    canAutoPublishRuntimeExperience: false as const,
    trustBoundary: isReadyForShadowCandidate
      ? 'candidate_network_and_replay_shadow_only' as const
      : 'blocked_registry_defects' as const,
    liveReplayTrustGate: input.liveReplayTrustGate ?? null,
    phase1MultiNetworkSelectionTrustGate: input.phase1MultiNetworkSelectionTrustGate ?? null,
    l5ReleaseGate: input.l5ReleaseGate ?? null,
    dimensions: {
      precision: {
        status: precisionDefects.length === 0 ? 'ready' as const : 'blocked' as const,
        checksPassed: precisionDefects.length === 0
          ? [
              'child_window_bounds',
              'parent_quantile_envelope',
              'duration_bearing_windows',
              'duration_window_scale',
              'dependency_edges',
              'dependency_graph_integrity',
              'lag_and_mandatory_wait_semantics',
              'hard_gates',
              'hard_gate_dependency_anchors',
              'required_facts',
              'schedule_semantics',
              'production_feasibility_assumptions',
            ]
          : [],
        blockingDefects: precisionDefects,
      },
      breadth: {
        status: breadthDefects.length === 0 ? 'ready' as const : 'blocked' as const,
        checksPassed: breadthDefects.length === 0
          ? [
              'template_count',
              'business_type_count',
              'system_formal_business_type_coverage',
              'system_formal_business_type_direct_coverage',
              'division_family_count',
              'subdivision_family_count',
              'business_type_division_profiles',
              'representative_schedule_scenarios',
              'representative_phase1_network_evaluations',
              ...(representativePhase1MultiNetworkSelectionReady
                ? ['representative_phase1_multinetwork_selection_coverage']
                : []),
              ...(businessTypeRepresentativeEvidenceMatrixReady
                ? ['business_type_representative_evidence_matrix']
                : []),
              ...(divisionFamilyRepresentativeEvidenceMatrixReady
                ? ['division_family_representative_evidence_matrix']
                : []),
              ...(templateRepresentativeEvidenceMatrixReady
                ? ['template_representative_evidence_matrix']
                : []),
              ...(phaseWindowRepresentativeEvidenceMatrixReady
                ? ['phase_window_representative_evidence_matrix']
                : []),
              'selector_receipt_audit_trail',
            ]
          : [],
        minimumTemplateCount: T2_STANDARD_LIBRARY_MINIMUMS.templateCount,
        minimumBusinessTypeCount: T2_STANDARD_LIBRARY_MINIMUMS.businessTypeCount,
        minimumDivisionFamilyCount: T2_STANDARD_LIBRARY_MINIMUMS.divisionFamilyCount,
        minimumSubdivisionFamilyCount: T2_STANDARD_LIBRARY_MINIMUMS.subdivisionFamilyCount,
        representativeScheduleScenarioCount: input.representativeScheduleScenarioCoverage.readyScenarioCount,
        representativePhase1EvaluationCount: input.representativePhase1EvaluationCoverage.readyEvaluationCount,
        readyBusinessTypeProfileCount,
        readyBusinessTypeRepresentativeEvidenceCount,
        readyDivisionFamilyRepresentativeEvidenceCount,
        readyTemplateRepresentativeEvidenceCount,
        readyPhaseWindowRepresentativeEvidenceCount,
        blockingDefects: breadthDefects,
      },
      depth: {
        status: depthDefects.length === 0 ? 'ready' as const : 'blocked' as const,
        checksPassed: depthDefects.length === 0
          ? [
              'actual_signal_contract',
              'replay_metric_contract',
              'standard_library_anchors',
              'calibration_anchors',
              'replay_admission_thresholds',
              'representative_replay_fixtures',
              'critical_window_replay_coverage',
              'phase1_critical_window_replay_crosscheck',
              'critical_window_replay_depth',
              'gate_window_replay_depth',
              'controlled_actual_variance_replay_fixtures',
              'no_runtime_write_governance',
            ]
          : [],
        representativeReplayFixtureCount: input.representativeReplayFixtureCoverage?.readyFixtureCount ?? 0,
        blockingDefects: depthDefects,
      },
    },
    releaseBlockers: buildScheduleReleaseBlockers(
      input.liveReplayTrustGate,
      input.phase1MultiNetworkSelectionTrustGate,
      input.l5ReleaseGate,
    ),
  }
}

function isPhase1MultiNetworkSelectionTrustGateReady(
  gate: T2RhythmPhase1MultiNetworkSelectionTrustGate | null | undefined,
) {
  return Boolean(
    gate
      && gate.status === 'phase1_multinetwork_selection_ready_not_publishable'
      && gate.evidenceMode === 'archived_phase1_selector_replay'
      && gate.trustBoundary === 'archived_phase1_selector_replay_only'
      && gate.canTrustForRealScheduleSelection
      && gate.readySelectionCount >= gate.minimumSelectionCount
      && gate.scenarioCoverageCount >= gate.minimumScenarioCoverageCount
      && gate.eligibleCandidateCount > 0
      && gate.rejectedConflictCandidateCount > 0
      && gate.selectionEvidenceRefs.length > 0
      && gate.mutationBoundary.writesTaskDependencies === false
      && gate.mutationBoundary.writesPlanDates === false
      && gate.mutationBoundary.writesCriticalPathFacts === false
      && gate.mutationBoundary.writesSeed === false
      && gate.mutationBoundary.writesBaseline === false
      && gate.mutationBoundary.writesRuntimePublications === false,
  )
}

function isL5ReleaseGateCanaryReady(
  gate: T2RhythmStandardLibraryL5ReleaseGate | null | undefined,
) {
  return Boolean(
    gate
      && gate.status === 'l5_canary_handoff_ready'
      && gate.canEnterCanary === true
      && gate.canPublishRuntimeExperience === false
      && gate.canMaterializeTaskDependencies === false
      && gate.canWritePlanDates === false
      && gate.canAutoPublishRuntimeExperience === false
      && gate.releasePackage?.packageType === 't2_standard_library_canary_handoff'
      && gate.releasePackage.releaseMode === 'canary_only'
      && gate.mutationBoundary.writesTaskDependencies === false
      && gate.mutationBoundary.writesPlanDates === false
      && gate.mutationBoundary.writesCriticalPathFacts === false
      && gate.mutationBoundary.writesSeed === false
      && gate.mutationBoundary.writesBaseline === false
      && gate.mutationBoundary.writesRuntimePublications === false,
  )
}

function isL5ReleaseGateTemplateScopeCompatible(
  gate: T2RhythmStandardLibraryL5ReleaseGate | null | undefined,
  selectedTemplateIds: string[],
) {
  if (!isL5ReleaseGateCanaryReady(gate)) return false
  const handoffTemplateIds = new Set((gate?.releasePackage?.selectedTemplateIds ?? []).map(normalizeCode))
  return selectedTemplateIds.every((templateId) => handoffTemplateIds.has(normalizeCode(templateId)))
}

function isLiveReplayTrustGateTemplateScopeCompatible(
  gate: T2RhythmStandardLibraryTrustGate | null | undefined,
  selectedTemplateIds: string[],
) {
  if (!gate || gate.status !== 'shadow_replay_ready_not_publishable') return false
  const replayTemplateIds = new Set((gate.selectedTemplateIds ?? []).map(normalizeCode))
  return replayTemplateIds.size > 0
    && selectedTemplateIds.every((templateId) => replayTemplateIds.has(normalizeCode(templateId)))
}

function isPhase1MultiNetworkSelectionGateTemplateScopeCompatible(
  gate: T2RhythmPhase1MultiNetworkSelectionTrustGate | null | undefined,
  selectedTemplateIds: string[],
) {
  if (!isPhase1MultiNetworkSelectionTrustGateReady(gate)) return false
  const replayTemplateIds = new Set((gate?.selectedTemplateIds ?? []).map(normalizeCode))
  return replayTemplateIds.size > 0
    && selectedTemplateIds.every((templateId) => replayTemplateIds.has(normalizeCode(templateId)))
}

function buildScheduleReleaseBlockers(
  liveReplayTrustGate: T2RhythmStandardLibraryTrustGate | null | undefined,
  phase1MultiNetworkSelectionTrustGate: T2RhythmPhase1MultiNetworkSelectionTrustGate | null | undefined,
  l5ReleaseGate: T2RhythmStandardLibraryL5ReleaseGate | null | undefined,
) {
  const l5CanaryReady = isL5ReleaseGateCanaryReady(l5ReleaseGate)
  const phase1MultiNetworkSelectionReady = isPhase1MultiNetworkSelectionTrustGateReady(phase1MultiNetworkSelectionTrustGate)
  const blockers = [
    ...(liveReplayTrustGate ? liveReplayTrustGate.releaseBlockers : [
      'archived_live_replay_required',
      'l5_canary_publish_rollback_required',
    ]),
    ...(phase1MultiNetworkSelectionReady
      ? []
      : ['c19_13_phase1_multinetwork_selection_required']),
    ...(phase1MultiNetworkSelectionTrustGate?.releaseBlockers ?? []),
    ...(l5CanaryReady
      ? []
      : ['l5_canary_publish_rollback_required']),
    ...(l5ReleaseGate?.releaseBlockers ?? []),
  ]
    .filter((blocker) => !l5CanaryReady || blocker !== 'l5_canary_publish_rollback_required')
    .filter((blocker) => !phase1MultiNetworkSelectionReady || blocker !== 'c19_13_phase1_multinetwork_selection_required')

  return unique(blockers)
}

function buildCandidatePackageReleaseBlockers(input: {
  releaseBlockers: string[]
  liveReplayTrustGate: T2RhythmStandardLibraryTrustGate | null | undefined
  phase1MultiNetworkSelectionTrustGate: T2RhythmPhase1MultiNetworkSelectionTrustGate | null | undefined
  l5ReleaseGate: T2RhythmStandardLibraryL5ReleaseGate | null | undefined
  selectedTemplateIds: string[]
  selectionCoverageStatus: T2RhythmScheduleCandidatePackage['selectionCoverage']['status']
}) {
  const liveReplayScopeCompatible = isLiveReplayTrustGateTemplateScopeCompatible(
    input.liveReplayTrustGate,
    input.selectedTemplateIds,
  )
  const phase1ScopeCompatible = isPhase1MultiNetworkSelectionGateTemplateScopeCompatible(
    input.phase1MultiNetworkSelectionTrustGate,
    input.selectedTemplateIds,
  )
  const l5ScopeCompatible = isL5ReleaseGateTemplateScopeCompatible(input.l5ReleaseGate, input.selectedTemplateIds)
  const releaseBlockers = [
    ...(input.selectionCoverageStatus === 'no_template_match'
      ? ['project_selection_no_template_match']
      : []),
    ...input.releaseBlockers,
    ...(input.liveReplayTrustGate && !liveReplayScopeCompatible
      ? [
          'archived_live_replay_required',
          ...(input.liveReplayTrustGate.status === 'shadow_replay_ready_not_publishable'
            ? ['archived_live_replay_template_scope_mismatch']
            : []),
        ]
      : []),
    ...(input.phase1MultiNetworkSelectionTrustGate && !phase1ScopeCompatible
      ? [
          'c19_13_phase1_multinetwork_selection_required',
          ...(isPhase1MultiNetworkSelectionTrustGateReady(input.phase1MultiNetworkSelectionTrustGate)
            ? ['c19_13_phase1_selector_template_scope_mismatch']
            : []),
        ]
      : []),
    ...(input.l5ReleaseGate && !l5ScopeCompatible
      ? [
          'l5_canary_publish_rollback_required',
          ...(isL5ReleaseGateCanaryReady(input.l5ReleaseGate)
            ? ['l5_canary_template_scope_mismatch']
            : []),
        ]
      : []),
  ]

  return unique(releaseBlockers)
}

function releaseClosureMutationBoundary(): T2RhythmReleaseEvidenceClosure['mutationBoundary'] {
  return {
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
    writesSeed: false,
    writesBaseline: false,
    writesRuntimePublications: false,
  }
}

function buildReleaseEvidenceClosure(input: {
  liveReplayTrustGate: T2RhythmStandardLibraryTrustGate | null | undefined
  phase1MultiNetworkSelectionTrustGate: T2RhythmPhase1MultiNetworkSelectionTrustGate | null | undefined
  l5ReleaseGate: T2RhythmStandardLibraryL5ReleaseGate | null | undefined
  selectedTemplateIds: string[]
  selectionCoverageStatus: T2RhythmScheduleCandidatePackage['selectionCoverage']['status']
}): T2RhythmReleaseEvidenceClosure {
  const requiredGateCodes: T2RhythmReleaseEvidenceClosure['requiredGateCodes'] = [
    'archived_live_replay',
    'c19_13_phase1_multinetwork_selection',
    'l5_canary_handoff',
  ]
  const liveReplayScopeCompatible = isLiveReplayTrustGateTemplateScopeCompatible(
    input.liveReplayTrustGate,
    input.selectedTemplateIds,
  )
  const phase1ScopeCompatible = isPhase1MultiNetworkSelectionGateTemplateScopeCompatible(
    input.phase1MultiNetworkSelectionTrustGate,
    input.selectedTemplateIds,
  )
  const l5ScopeCompatible = isL5ReleaseGateTemplateScopeCompatible(input.l5ReleaseGate, input.selectedTemplateIds)
  const readyGateCodes = unique([
    liveReplayScopeCompatible ? 'archived_live_replay' : '',
    phase1ScopeCompatible ? 'c19_13_phase1_multinetwork_selection' : '',
    l5ScopeCompatible ? 'l5_canary_handoff' : '',
  ]) as T2RhythmReleaseEvidenceClosure['readyGateCodes']
  const blockingGateCodes = requiredGateCodes.filter((gateCode) => !readyGateCodes.includes(gateCode))
  const templateScopeMismatchCodes = unique([
    input.liveReplayTrustGate && !liveReplayScopeCompatible && input.liveReplayTrustGate.status === 'shadow_replay_ready_not_publishable'
      ? 'archived_live_replay_template_scope_mismatch'
      : '',
    input.phase1MultiNetworkSelectionTrustGate
      && !phase1ScopeCompatible
      && isPhase1MultiNetworkSelectionTrustGateReady(input.phase1MultiNetworkSelectionTrustGate)
      ? 'c19_13_phase1_selector_template_scope_mismatch'
      : '',
    input.l5ReleaseGate && !l5ScopeCompatible && isL5ReleaseGateCanaryReady(input.l5ReleaseGate)
      ? 'l5_canary_template_scope_mismatch'
      : '',
  ])
  const releaseEvidenceRefs = unique([
    ...(input.liveReplayTrustGate?.passedGateCodes ?? []).map((code) => `live-replay:${code}`),
    ...(input.phase1MultiNetworkSelectionTrustGate?.selectionEvidenceRefs ?? []),
    ...(input.l5ReleaseGate?.releasePackage?.evidenceRefs ?? []),
    ...(input.l5ReleaseGate?.releasePackage?.rollbackTargetEvidenceRefs ?? []),
    ...(input.l5ReleaseGate?.releasePackage?.consumerVerificationEvidenceRefs ?? []),
    ...(input.l5ReleaseGate?.releasePackage?.impactMonitoringEvidenceRefs ?? []),
  ])
  const readyNotPublishable = input.selectionCoverageStatus === 'covered'
    && input.selectedTemplateIds.length > 0
    && blockingGateCodes.length === 0

  return {
    source: 't2_rhythm_release_evidence_closure',
    status: readyNotPublishable ? 'ready_not_publishable' : 'blocked',
    selectedTemplateIds: input.selectedTemplateIds,
    requiredGateCodes,
    readyGateCodes,
    blockingGateCodes,
    templateScopeMismatchCodes,
    trustBoundary: readyNotPublishable
      ? 'manual_promotion_required_before_runtime_publication'
      : 'blocked_release_evidence',
    releaseEvidenceRefs,
    canUseForRealScheduleCalibration: liveReplayScopeCompatible,
    canUseForRealScheduleSelection: phase1ScopeCompatible,
    canEnterL5Canary: l5ScopeCompatible,
    canAutoMaterializeTaskDependencies: false,
    canAutoPublishRuntimeExperience: false,
    mutationBoundary: releaseClosureMutationBoundary(),
  }
}

export function auditT2DivisionRhythmTemplateRegistry(
  input: T2RhythmTemplateRegistryAuditInput = {},
): T2RhythmTemplateRegistryAudit {
  const businessTypeCodes = unique(T2_DIVISION_RHYTHM_TEMPLATE_SEED.flatMap((template) => template.applicability.businessTypeCodes))
  const divisionFamilies = unique(T2_DIVISION_RHYTHM_TEMPLATE_SEED.flatMap((template) => template.applicability.divisionFamilies))
  const subdivisionFamilies = unique(T2_DIVISION_RHYTHM_TEMPLATE_SEED.flatMap((template) => template.applicability.subdivisionFamilies))
  const systemBusinessTypeCoverage = buildSystemBusinessTypeCoverage(businessTypeCodes)
  const businessTypeProfiles = buildBusinessTypeProfiles()
  const representativeScheduleScenarioCoverage = buildRepresentativeScheduleScenarioCoverage()
  const blockingDefects = T2_DIVISION_RHYTHM_TEMPLATE_SEED.flatMap(auditTemplate)
  if (T2_DIVISION_RHYTHM_TEMPLATE_SEED.length < T2_STANDARD_LIBRARY_MINIMUMS.templateCount) blockingDefects.push('registry:template_count_below_standard_library_floor')
  if (businessTypeCodes.length < T2_STANDARD_LIBRARY_MINIMUMS.businessTypeCount) blockingDefects.push('registry:business_type_coverage_below_standard_library_floor')
  if (systemBusinessTypeCoverage.missingBusinessTypeCodes.length > 0) {
    blockingDefects.push('registry:system_business_type_coverage_missing')
  }
  if (systemBusinessTypeCoverage.missingDirectBusinessTypeCodes.length > 0) {
    blockingDefects.push('registry:system_business_type_direct_coverage_missing')
  }
  if (divisionFamilies.length < T2_STANDARD_LIBRARY_MINIMUMS.divisionFamilyCount) blockingDefects.push('registry:division_family_coverage_below_standard_library_floor')
  if (subdivisionFamilies.length < T2_STANDARD_LIBRARY_MINIMUMS.subdivisionFamilyCount) blockingDefects.push('registry:subdivision_family_coverage_below_standard_library_floor')
  for (const profile of businessTypeProfiles) {
    if (profile.status !== 'ready') {
      blockingDefects.push(`registry:${profile.businessTypeCode}:business_type_profile_not_ready`)
    }
  }
  for (const scenario of representativeScheduleScenarioCoverage.scenarios) {
    if (!scenario.canEnterC1913Phase1Selection) {
      blockingDefects.push(`registry:${scenario.scenarioId}:representative_schedule_scenario_not_schedulable`)
    }
  }
  const prePhaseReadinessGate = buildScheduleReadinessGate({
    blockingDefects,
    businessTypeProfiles,
    representativeScheduleScenarioCoverage,
    representativePhase1EvaluationCoverage: {
      status: 'ready',
      readyEvaluationCount: representativeScheduleScenarioCoverage.readyScenarioCount,
      minimumEvaluationCount: representativeScheduleScenarioCoverage.minimumScenarioCount,
      evaluations: [],
    },
    liveReplayTrustGate: input.liveReplayTrustGate,
    phase1MultiNetworkSelectionTrustGate: input.phase1MultiNetworkSelectionTrustGate,
    l5ReleaseGate: input.l5ReleaseGate,
  })
  const prePhaseStandardLibraryReadiness = buildStandardLibraryReadinessSummary(prePhaseReadinessGate)
  const representativePhase1EvaluationCoverage = buildRepresentativePhase1EvaluationCoverage(prePhaseStandardLibraryReadiness)
  const representativePhase1MultiNetworkSelectionCoverage = buildRepresentativePhase1MultiNetworkSelectionCoverage(prePhaseStandardLibraryReadiness)
  const representativeReplayFixtureCoverage = buildRepresentativeReplayFixtureCoverage(prePhaseStandardLibraryReadiness)
  const finalBlockingDefects = [...blockingDefects]
  for (const evaluation of representativePhase1EvaluationCoverage.evaluations) {
    if (!evaluation.canEnterC1913Phase1Selection || evaluation.status !== 'phase1_readonly_evaluation_ready') {
      finalBlockingDefects.push(`registry:${evaluation.scenarioId}:representative_phase1_evaluation_not_ready`)
    }
  }
  for (const selection of representativePhase1MultiNetworkSelectionCoverage.selections) {
    if (selection.status !== 'phase1_selection_ready' || selection.selectedCandidateId == null) {
      finalBlockingDefects.push(`registry:${selection.selectionId}:representative_phase1_multinetwork_selection_not_ready`)
    }
  }
  for (const fixture of representativeReplayFixtureCoverage.fixtures) {
    if (!fixture.readyForShadow || fixture.status !== 'shadow_candidate') {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:representative_replay_fixture_not_ready`)
    }
    if (fixture.missingCriticalWindowCodes.length > 0) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:representative_replay_fixture_missing_critical_window`)
    }
    if (fixture.distinctWorkfaceCount < 3) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:representative_replay_fixture_missing_workface_diversity`)
    }
    if (
      fixture.nonZeroAbsoluteErrorSampleCount < 3
      || fixture.earlyFinishSampleCount < 1
      || fixture.delayedFinishSampleCount < 1
    ) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:representative_replay_fixture_missing_actual_variance`)
    }
    if (fixture.maximumAbsoluteErrorDays > T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS.maximumMedianAbsoluteErrorDays) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:representative_replay_fixture_variance_out_of_control`)
    }
    if (fixture.underSampledCriticalWindowCodes.length > 0) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:representative_replay_fixture_critical_window_depth_missing`)
    }
    if (fixture.lowDiversityCriticalWindowCodes.length > 0) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:representative_replay_fixture_critical_window_workface_diversity_missing`)
    }
    if (fixture.flatVarianceCriticalWindowCodes.length > 0) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:representative_replay_fixture_critical_window_actual_variance_missing`)
    }
    if (fixture.singleSidedGateSlipCriticalWindowCodes.length > 0) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:representative_replay_fixture_critical_window_bidirectional_gate_slip_missing`)
    }
    if (fixture.outOfControlCriticalWindowCodes.length > 0) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:representative_replay_fixture_critical_window_variance_out_of_control`)
    }
    if (fixture.missingGateWindowCodes.length > 0) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:representative_replay_fixture_missing_gate_window`)
    }
    if (fixture.underSampledGateWindowCodes.length > 0) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:representative_replay_fixture_gate_window_depth_missing`)
    }
    if (fixture.lowDiversityGateWindowCodes.length > 0) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:representative_replay_fixture_gate_window_workface_diversity_missing`)
    }
    if (fixture.flatVarianceGateWindowCodes.length > 0) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:representative_replay_fixture_gate_window_actual_variance_missing`)
    }
    if (fixture.singleSidedGateSlipGateWindowCodes.length > 0) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:representative_replay_fixture_gate_window_bidirectional_gate_slip_missing`)
    }
    if (fixture.outOfControlGateWindowCodes.length > 0) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:representative_replay_fixture_gate_window_variance_out_of_control`)
    }
  }
  const phase1CriticalWindowsByScenario = new Map(
    representativePhase1EvaluationCoverage.evaluations.map((evaluation) => [
      evaluation.scenarioId,
      evaluation.criticalWindowCodes,
    ]),
  )
  for (const fixture of representativeReplayFixtureCoverage.fixtures) {
    const phase1CriticalWindowCodes = phase1CriticalWindowsByScenario.get(fixture.scenarioId)
    if (!phase1CriticalWindowCodes) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:phase1_replay_fixture_missing`)
      continue
    }
    if (
      fixture.criticalWindowCodes.length !== phase1CriticalWindowCodes.length
      || fixture.criticalWindowCodes.some((windowCode, index) => windowCode !== phase1CriticalWindowCodes[index])
    ) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:phase1_critical_window_mismatch`)
    }
    const replayCoveredWindowCodes = new Set(fixture.replayCoveredWindowCodes)
    const missingPhase1CriticalWindowCodes = phase1CriticalWindowCodes
      .filter((windowCode) => !replayCoveredWindowCodes.has(windowCode))
    if (missingPhase1CriticalWindowCodes.length > 0) {
      finalBlockingDefects.push(`registry:${fixture.scenarioId}:phase1_critical_window_replay_missing`)
    }
  }
  const businessTypeRepresentativeEvidenceMatrix = buildBusinessTypeRepresentativeEvidenceMatrix({
    businessTypeProfiles,
    representativeScheduleScenarioCoverage,
    representativePhase1EvaluationCoverage,
    representativeReplayFixtureCoverage,
  })
  for (const row of businessTypeRepresentativeEvidenceMatrix) {
    if (row.status !== 'ready') {
      finalBlockingDefects.push(`registry:${row.businessTypeCode}:business_type_representative_evidence_not_ready`)
    }
  }
  const divisionFamilyRepresentativeEvidenceMatrix = buildDivisionFamilyRepresentativeEvidenceMatrix({
    representativeScheduleScenarioCoverage,
    representativePhase1EvaluationCoverage,
    representativeReplayFixtureCoverage,
  })
  for (const row of divisionFamilyRepresentativeEvidenceMatrix) {
    if (row.status !== 'ready') {
      finalBlockingDefects.push(`registry:${row.divisionFamily}:division_family_representative_evidence_not_ready`)
    }
  }
  const templateRepresentativeEvidenceMatrix = buildTemplateRepresentativeEvidenceMatrix(prePhaseStandardLibraryReadiness)
  for (const row of templateRepresentativeEvidenceMatrix) {
    if (row.status !== 'ready') {
      finalBlockingDefects.push(`registry:${row.templateId}:template_representative_evidence_not_ready`)
    }
  }
  const phaseWindowRepresentativeEvidenceMatrix = buildPhaseWindowRepresentativeEvidenceMatrix(templateRepresentativeEvidenceMatrix)
  for (const row of phaseWindowRepresentativeEvidenceMatrix) {
    if (row.status !== 'ready') {
      finalBlockingDefects.push(`registry:${row.phaseWindow}:phase_window_representative_evidence_not_ready`)
    }
  }
  const scheduleReadinessGate = buildScheduleReadinessGate({
    blockingDefects: finalBlockingDefects,
    businessTypeProfiles,
    representativeScheduleScenarioCoverage,
    representativePhase1EvaluationCoverage,
    representativePhase1MultiNetworkSelectionCoverage,
    representativeReplayFixtureCoverage,
    businessTypeRepresentativeEvidenceMatrix,
    divisionFamilyRepresentativeEvidenceMatrix,
    templateRepresentativeEvidenceMatrix,
    phaseWindowRepresentativeEvidenceMatrix,
    liveReplayTrustGate: input.liveReplayTrustGate,
    phase1MultiNetworkSelectionTrustGate: input.phase1MultiNetworkSelectionTrustGate,
    l5ReleaseGate: input.l5ReleaseGate,
  })

  return {
    templateCount: T2_DIVISION_RHYTHM_TEMPLATE_SEED.length,
    businessTypeCount: businessTypeCodes.length,
    divisionFamilyCount: divisionFamilies.length,
    subdivisionFamilyCount: subdivisionFamilies.length,
    businessTypeCodes,
    divisionFamilies,
    standardLibraryThicknessCoverage: buildStandardLibraryThicknessCoverage(),
    systemBusinessTypeCoverage,
    businessTypeProfiles,
    representativeScheduleScenarioCoverage,
    representativePhase1EvaluationCoverage,
    representativePhase1MultiNetworkSelectionCoverage,
    representativeReplayFixtureCoverage,
    businessTypeRepresentativeEvidenceMatrix,
    divisionFamilyRepresentativeEvidenceMatrix,
    templateRepresentativeEvidenceMatrix,
    phaseWindowRepresentativeEvidenceMatrix,
    replayAcceptancePolicy: {
      status: 'actual_replay_required_before_publish',
      minimumSampleCount: T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS.minimumSampleCount,
      minimumComparableWorkfaceWindowCount: T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS.minimumComparableWorkfaceWindowCount,
      minimumP80CaptureRate: T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS.minimumP80CaptureRate,
      maximumMedianAbsoluteErrorDays: T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS.maximumMedianAbsoluteErrorDays,
      maximumGateSlipMedianDays: T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS.maximumGateSlipMedianDays,
      maximumDependencyViolationRate: T2_RHYTHM_REPLAY_ACCEPTANCE_THRESHOLDS.maximumDependencyViolationRate,
      directSeedMutationAllowed: false,
      autoPublishAllowed: false,
      writesPlanDates: false,
      writesTaskDependencies: false,
      releasePath: 'replay_candidate_shadow_gate_publish_rollback',
    },
    scheduleTrustReady: finalBlockingDefects.length === 0,
    blockingDefects: finalBlockingDefects,
    scheduleReadinessGate,
  }
}

function factPresent(facts: Record<string, unknown> | undefined, factKey: string) {
  if (!facts) return false
  const value = facts[factKey]
  if (value === false || value == null) return false
  if (typeof value === 'string') return value.trim().length > 0 && value.trim().toLowerCase() !== 'false'
  if (Array.isArray(value)) return value.length > 0
  return Boolean(value)
}

export function checkT2RhythmTemplateAssemblyCompatibility(
  input: T2RhythmTemplateAssemblyCompatibilityInput,
): T2RhythmTemplateAssemblyCompatibilityResult {
  const conflicts: T2RhythmTemplateAssemblyConflict[] = []
  const seen = new Set<string>()
  const organizationAssumptions = new Set((input.organizationAssumptions ?? []).map(normalizeCode))
  const selectedWorkfaceUnits = new Set((input.selectedWorkfaceUnits ?? []).map(normalizeCode))

  for (const templateId of input.templateIds) {
    const template = getT2DivisionRhythmTemplate(templateId)
    if (!template) {
      conflicts.push({
        conflictCode: 'unknown_template',
        templateId,
        detail: 'Template is not registered in the T2 division rhythm standard library.',
      })
      continue
    }
    if (seen.has(templateId)) {
      conflicts.push({
        conflictCode: 'duplicate_template',
        templateId,
        detail: 'Template appears more than once in the same assembly candidate.',
      })
    }
    seen.add(templateId)

    for (const assumption of template.compatibility.incompatibleAssumptions) {
      if (organizationAssumptions.has(normalizeCode(assumption))) {
        conflicts.push({
          conflictCode: 'incompatible_organization_assumption',
          templateId,
          detail: `Organization assumption ${assumption} conflicts with ${template.templateName}.`,
        })
      }
    }

    for (const factKey of template.compatibility.requiredFacts) {
      if (!factPresent(input.facts, factKey)) {
        conflicts.push({
          conflictCode: 'missing_required_fact',
          templateId,
          factKey,
          detail: `Required fact ${factKey} is missing or false for ${template.templateName}.`,
        })
      }
    }

    for (const unit of selectedWorkfaceUnits) {
      if (!template.compatibility.allowedWorkfaceUnits.some((allowedUnit) => normalizeCode(allowedUnit) === unit)) {
        conflicts.push({
          conflictCode: 'unsupported_workface_unit',
          templateId,
          detail: `Selected workface unit ${unit} is outside allowed units for ${template.templateName}.`,
        })
      }
    }
  }

  const priorityAdjudication = input.priorityAdjudication
    ? {
        selectedTemplateId: input.priorityAdjudication.selectedTemplateId ?? null,
        selectedBy: input.priorityAdjudication.selectedBy ?? null,
        priorityRank: input.priorityAdjudication.priorityRank ?? [],
        assemblyFeasibilityRequired: true as const,
        priorityOverrideBlocked: conflicts.length > 0,
      }
    : undefined

  if (priorityAdjudication?.priorityOverrideBlocked && priorityAdjudication.selectedTemplateId) {
    conflicts.push({
      conflictCode: 'priority_override_blocked_by_assembly_conflict',
      templateId: priorityAdjudication.selectedTemplateId,
      detail: 'Linear template priority cannot override multi-template assembly feasibility conflicts.',
    })
  }

  return {
    compatible: conflicts.length === 0,
    status: conflicts.length === 0 ? 'compatible_candidate' : 'candidate_conflict',
    conflicts,
    templateIds: input.templateIds,
    priorityAdjudication,
  }
}

export function projectT2RhythmTemplateAsPackageWindows(template: T2DivisionRhythmTemplate) {
  return {
    templateId: template.templateId,
    tier: template.tier,
    sourceType: template.sourceType,
    governanceStatus: template.governance.governanceStatus,
    directRuntimeWrite: template.governance.directRuntimeWrite,
    parentWindowDays: template.rhythm.parentWindowDays,
    workfaceUnit: template.rhythm.workfaceUnit,
    packageChildRhythmWindows: template.rhythm.childWindows.map((window) => ({
      startDay: window.startDay,
      endDay: window.endDay,
      durationDays: window.durationDays,
      role: window.role,
      source: window.source,
      confidence: template.confidence,
    })),
    dependencyCandidates: template.dependencyEdges,
    hardGates: template.hardGates,
  }
}

function buildStandardLibraryReadinessSummary(
  scheduleReadinessGate: T2RhythmTemplateRegistryAudit['scheduleReadinessGate'],
): T2RhythmScheduleCandidatePackage['standardLibraryReadiness'] {
  return {
    status: scheduleReadinessGate.status,
    precisionStatus: scheduleReadinessGate.dimensions.precision.status,
    breadthStatus: scheduleReadinessGate.dimensions.breadth.status,
    depthStatus: scheduleReadinessGate.dimensions.depth.status,
    evidenceSummary: {
      source: 't2_standard_library_readiness_evidence_summary',
      precisionChecksPassed: scheduleReadinessGate.dimensions.precision.checksPassed,
      breadthChecksPassed: scheduleReadinessGate.dimensions.breadth.checksPassed,
      depthChecksPassed: scheduleReadinessGate.dimensions.depth.checksPassed,
      representativeScheduleScenarioCount: scheduleReadinessGate.dimensions.breadth.representativeScheduleScenarioCount,
      representativePhase1EvaluationCount: scheduleReadinessGate.dimensions.breadth.representativePhase1EvaluationCount,
      representativeReplayFixtureCount: scheduleReadinessGate.dimensions.depth.representativeReplayFixtureCount,
      readyBusinessTypeProfileCount: scheduleReadinessGate.dimensions.breadth.readyBusinessTypeProfileCount,
      readyBusinessTypeRepresentativeEvidenceCount: scheduleReadinessGate.dimensions.breadth.readyBusinessTypeRepresentativeEvidenceCount,
      readyDivisionFamilyRepresentativeEvidenceCount: scheduleReadinessGate.dimensions.breadth.readyDivisionFamilyRepresentativeEvidenceCount,
      readyTemplateRepresentativeEvidenceCount: scheduleReadinessGate.dimensions.breadth.readyTemplateRepresentativeEvidenceCount,
      readyPhaseWindowRepresentativeEvidenceCount: scheduleReadinessGate.dimensions.breadth.readyPhaseWindowRepresentativeEvidenceCount,
      trustBoundary: scheduleReadinessGate.trustBoundary,
    },
    canEnterC1913Phase1Selection: scheduleReadinessGate.canEnterC1913Phase1Selection,
    canAutoMaterializeTaskDependencies: scheduleReadinessGate.canAutoMaterializeTaskDependencies,
    canAutoPublishRuntimeExperience: scheduleReadinessGate.canAutoPublishRuntimeExperience,
    liveReplayTrustGate: scheduleReadinessGate.liveReplayTrustGate ?? null,
    phase1MultiNetworkSelectionTrustGate: scheduleReadinessGate.phase1MultiNetworkSelectionTrustGate ?? null,
    l5ReleaseGate: scheduleReadinessGate.l5ReleaseGate ?? null,
    releaseBlockers: scheduleReadinessGate.releaseBlockers,
  }
}

function buildT2RhythmScheduleCandidatePackageInternal(
  input: T2RhythmScheduleCandidatePackageInput,
  standardLibraryReadiness: T2RhythmScheduleCandidatePackage['standardLibraryReadiness'],
): T2RhythmScheduleCandidatePackage {
  const templates = selectT2DivisionRhythmTemplates(input.selection, input.limit ?? 6)
  const selectedTemplateIds = templates.map((template) => template.templateId)
  const selectionCoverage = buildT2SelectionCoverage(input.selection, selectedTemplateIds)
  const selectionReceipts = buildSelectionReceipts(templates, input.selection)
  const compatibility = checkT2RhythmTemplateAssemblyCompatibility({
    templateIds: selectedTemplateIds,
    organizationAssumptions: input.organizationAssumptions,
    selectedWorkfaceUnits: input.selectedWorkfaceUnits,
    facts: input.facts,
    priorityAdjudication: input.priorityAdjudication,
  })

  const packageWindows = templates.flatMap((template) => template.rhythm.childWindows.map((window) => ({
    templateId: template.templateId,
    windowCode: window.windowCode,
    startDay: window.startDay,
    endDay: window.endDay,
    durationDays: window.durationDays,
    role: window.role,
    source: window.source,
    confidence: template.confidence,
    durationBearing: window.durationBearing,
  })))

  const durationContextCandidates = templates.flatMap((template) => template.rhythm.childWindows
    .filter((window) => window.durationBearing)
    .map((window) => ({
      sourceTemplateId: template.templateId,
      windowCode: window.windowCode,
      recommendedDurationDays: window.durationDays,
      planReferenceDays: window.durationDays,
      planDurationTruthSource: 'parent_package_rhythm_window' as const,
      tier: 'T2' as const,
      governanceStatus: template.governance.governanceStatus,
      sourceType: template.sourceType,
      autoApply: false as const,
    })))

  const dependencyCandidates = templates.flatMap((template) => template.dependencyEdges.map((edge) => ({
    ...edge,
    sourceTemplateId: template.templateId,
    tier: 'T2' as const,
    autoApply: false as const,
  })))

  const hardGates = templates.flatMap((template) => template.hardGates.map((gate) => ({
    ...gate,
    sourceTemplateId: template.templateId,
    tier: 'T2' as const,
    autoApply: false as const,
  })))

  const scheduleTrustSummaries = templates.map((template) => ({
    sourceTemplateId: template.templateId,
    criticalPathRoles: template.scheduleTrust.scheduleSemantics.criticalPathRoles,
    durationDrivers: template.scheduleTrust.scheduleSemantics.durationDrivers,
    workfaceReadinessSignals: template.scheduleTrust.scheduleSemantics.workfaceReadinessSignals,
    assemblyRiskTags: template.scheduleTrust.scheduleSemantics.assemblyRiskTags,
    replayAdmission: template.scheduleTrust.evidenceAnchors.replayAdmission,
  }))
  const productionFeasibilitySummaries = templates.map((template) => ({
    sourceTemplateId: template.templateId,
    calendarBasis: template.productionFeasibility.calendarBasis,
    workfaceUnit: template.productionFeasibility.workfaceUnit,
    minimumParallelWorkfaces: template.productionFeasibility.minimumParallelWorkfaces,
    recommendedCrewStreams: template.productionFeasibility.recommendedCrewStreams,
    resourceReadinessSignals: template.productionFeasibility.resourceReadinessSignals,
    calendarConstraintSignals: template.productionFeasibility.calendarConstraintSignals,
    capacityRiskTags: template.productionFeasibility.capacityRiskTags,
  }))
  const packageReleaseBlockers = buildCandidatePackageReleaseBlockers({
    releaseBlockers: standardLibraryReadiness.releaseBlockers,
    liveReplayTrustGate: standardLibraryReadiness.liveReplayTrustGate,
    phase1MultiNetworkSelectionTrustGate: standardLibraryReadiness.phase1MultiNetworkSelectionTrustGate,
    l5ReleaseGate: standardLibraryReadiness.l5ReleaseGate,
    selectedTemplateIds,
    selectionCoverageStatus: selectionCoverage.status,
  })
  const releaseEvidenceClosure = buildReleaseEvidenceClosure({
    liveReplayTrustGate: standardLibraryReadiness.liveReplayTrustGate,
    phase1MultiNetworkSelectionTrustGate: standardLibraryReadiness.phase1MultiNetworkSelectionTrustGate,
    l5ReleaseGate: standardLibraryReadiness.l5ReleaseGate,
    selectedTemplateIds,
    selectionCoverageStatus: selectionCoverage.status,
  })

  return {
    source: 't2_division_rhythm_schedule_candidate_package',
    tier: 'T2',
    status: selectedTemplateIds.length === 0
      ? 'no_template_match'
      : compatibility.compatible ? 'schedulable_candidate' : 'candidate_conflict',
    selectedTemplateIds,
    templateCount: templates.length,
    durationBearingWindowCount: durationContextCandidates.length,
    candidateDependencyEdgeCount: dependencyCandidates.length,
    hardGateCount: hardGates.length,
    packageWindows,
    durationContextCandidates,
    dependencyCandidates,
    hardGates,
    scheduleTrustSummaries,
    productionFeasibilitySummaries,
    standardLibraryReadiness: {
      status: standardLibraryReadiness.status,
      precisionStatus: standardLibraryReadiness.precisionStatus,
      breadthStatus: standardLibraryReadiness.breadthStatus,
      depthStatus: standardLibraryReadiness.depthStatus,
      evidenceSummary: standardLibraryReadiness.evidenceSummary,
      canEnterC1913Phase1Selection: standardLibraryReadiness.canEnterC1913Phase1Selection
        && selectionCoverage.canEnterC1913Phase1Selection,
      canAutoMaterializeTaskDependencies: standardLibraryReadiness.canAutoMaterializeTaskDependencies,
      canAutoPublishRuntimeExperience: standardLibraryReadiness.canAutoPublishRuntimeExperience,
      liveReplayTrustGate: standardLibraryReadiness.liveReplayTrustGate ?? null,
      phase1MultiNetworkSelectionTrustGate: standardLibraryReadiness.phase1MultiNetworkSelectionTrustGate ?? null,
      l5ReleaseGate: standardLibraryReadiness.l5ReleaseGate ?? null,
      releaseEvidenceClosure,
      releaseBlockers: packageReleaseBlockers,
    },
    selectionCoverage,
    selectionReceipts,
    compatibility,
    scheduleTrustPolicy: {
      autoApply: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      requiresAssemblyCompatibility: true,
      requiresL5Publication: true,
      downstreamConsumer: 'DurationInputAssembler_or_C19_13_phase1_candidate_network',
    },
  }
}

export function buildT2RhythmScheduleCandidatePackage(
  input: T2RhythmScheduleCandidatePackageInput,
): T2RhythmScheduleCandidatePackage {
  const registryAudit = auditT2DivisionRhythmTemplateRegistry({
    liveReplayTrustGate: input.liveReplayTrustGate,
    phase1MultiNetworkSelectionTrustGate: input.phase1MultiNetworkSelectionTrustGate,
    l5ReleaseGate: input.l5ReleaseGate,
  })
  return buildT2RhythmScheduleCandidatePackageInternal(
    input,
    buildStandardLibraryReadinessSummary(registryAudit.scheduleReadinessGate),
  )
}
