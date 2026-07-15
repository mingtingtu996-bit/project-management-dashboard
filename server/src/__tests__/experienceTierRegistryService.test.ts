import { describe, expect, it } from 'vitest'

import {
  assessExperienceTierCandidatePayload,
  getExperienceTierRegistryEntry,
  listExperienceTierRegistry,
} from '../services/experienceTierRegistryService.js'
import {
  buildT2RhythmScheduleCandidatePackage,
  type T2RhythmPhase1MultiNetworkSelectionTrustGate,
  type T2RhythmScheduleCandidatePackageInput,
} from '../services/t2DivisionRhythmTemplateRegistryService.js'
import { buildT2RhythmReplayLearningCandidate } from '../services/t2RhythmReplayLearningCandidateService.js'
import {
  evaluateT2RhythmStandardLibraryL5ReleaseGate,
} from '../services/t2RhythmStandardLibraryL5ReleaseGateService.js'
import {
  evaluateT2RhythmStandardLibraryTrustGate,
} from '../services/t2RhythmStandardLibraryTrustGateService.js'
import { buildT2RhythmTemplateReplayEvidence } from '../services/t2RhythmTemplateReplayEvidenceService.js'

const compatibleCandidatePackageInput: T2RhythmScheduleCandidatePackageInput = {
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
}

function buildReleaseReadyT2CandidatePackage() {
  const baseCandidatePackage = buildT2RhythmScheduleCandidatePackage(compatibleCandidatePackageInput)
  const selectedTemplateIds = baseCandidatePackage.selectedTemplateIds
  const liveReplayTrustGate = evaluateT2RhythmStandardLibraryTrustGate({
    status: 'pass',
    selectedTemplateIds,
    missingArchivedJson: false,
    evidenceMetadata: { missingEvidenceMetadata: false },
    sampleAvailability: {
      totalUsableSampleCount: 36,
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
  const phase1MultiNetworkSelectionTrustGate: T2RhythmPhase1MultiNetworkSelectionTrustGate = {
    source: 't2_rhythm_phase1_multinetwork_selection_trust_gate',
    status: 'phase1_multinetwork_selection_ready_not_publishable',
    evidenceMode: 'archived_phase1_selector_replay',
    trustBoundary: 'archived_phase1_selector_replay_only',
    canTrustForRealScheduleSelection: true,
    readySelectionCount: 15,
    minimumSelectionCount: 15,
    scenarioCoverageCount: 15,
    minimumScenarioCoverageCount: 15,
    eligibleCandidateCount: 15,
    rejectedConflictCandidateCount: 15,
    selectedTemplateIds,
    selectionEvidenceRefs: ['artifact:c19-13-phase1-selector-replay.json'],
    releaseBlockers: [],
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    },
  }
  const l5ReleaseGate = evaluateT2RhythmStandardLibraryL5ReleaseGate({
    trustGate: liveReplayTrustGate,
    selectedTemplateIds,
    releaseScope: {
      scopeType: 'project',
      projectId: 'project-t2-standard-library-canary',
    },
    l5Evidence: {
      releaseExitApproved: true,
      releaseExitEvidenceRefs: ['artifact:t2-release-exit.md'],
      canaryPlanApproved: true,
      canaryEvidenceRefs: ['artifact:t2-canary-plan.md'],
      canaryMinimumSampleCount: 30,
      canaryDurationDays: 14,
      canaryBlastRadius: {
        maxProjectCount: 1,
        maxCompanyCount: 1,
        maxTemplateCount: 3,
        scopeLocked: true,
      },
      canarySuccessCriteria: {
        minimumP80CaptureRate: 0.85,
        maximumMedianAbsoluteErrorDays: 2,
        maximumGateSlipMedianDays: 2,
        maximumDependencyViolationRate: 0.05,
      },
      runtimeConsumerVerified: true,
      runtimeConsumerEvidenceRefs: ['artifact:t2-consumer-verification.md'],
      impactMonitoringReady: true,
      impactMonitoringEvidenceRefs: ['artifact:t2-impact-monitoring.md'],
      impactMonitoringMetrics: [{
        metricCode: 't2_p80_capture_rate',
        comparator: 'gte',
        threshold: 0.85,
        windowDays: 14,
      }],
      rollbackTargetReady: true,
      rollbackEvidenceRefs: ['artifact:t2-rollback-target.md'],
      rollbackDrill: {
        executed: true,
        recoveryTimeMinutes: 20,
        rollbackTargetVersion: 'v1.4.23.1-t2-division-rhythm-cold-start-20260622',
        evidenceRefs: ['artifact:t2-rollback-drill.md'],
      },
    },
  })

  return buildT2RhythmScheduleCandidatePackage({
    ...compatibleCandidatePackageInput,
    liveReplayTrustGate,
    phase1MultiNetworkSelectionTrustGate,
    l5ReleaseGate,
  })
}

function buildAcceptedT2CandidatePayload() {
  const candidatePackage = buildReleaseReadyT2CandidatePackage()
  const window = candidatePackage.durationContextCandidates[0]
  const samples = Array.from({ length: 12 }, (_, index) => ({
    sampleId: `sample-${index + 1}`,
    projectId: 'project-a1',
    workfaceKey: `tower-a-floor-${index + 1}`,
    windowCode: window.windowCode,
    plannedWindowDurationDays: window.recommendedDurationDays,
    templateP80WindowDurationDays: window.recommendedDurationDays,
    plannedGateDate: `2026-05-${String(index + window.recommendedDurationDays).padStart(2, '0')}`,
    actualGateDate: `2026-05-${String(index + window.recommendedDurationDays).padStart(2, '0')}`,
    actualStartDate: `2026-05-${String(index + 1).padStart(2, '0')}`,
    actualEndDate: `2026-05-${String(index + window.recommendedDurationDays).padStart(2, '0')}`,
    dependencySatisfied: true,
    evidenceRef: `duration_experience_samples:sample-${index + 1}`,
  }))
  const replayEvidence = buildT2RhythmTemplateReplayEvidence({
    templateId: 't2-residential-standard-floor-structure-rhythm-v1',
    samples,
  })

  const candidate = buildT2RhythmReplayLearningCandidate({
    companyId: 'company-a',
    projectId: 'project-a1',
    candidatePackage,
    replayEvidence,
  })

  return candidate.event?.candidatePayload
}

describe('experienceTierRegistryService', () => {
  it('registers T1/T2/T3 as separate experience granularities with T2 bound to division and subdivision rhythm assets', () => {
    const entries = listExperienceTierRegistry()
    const t2 = getExperienceTierRegistryEntry('T2')

    expect(entries.map((entry) => entry.tier)).toEqual(['T1', 'T2', 'T3'])
    expect(t2).toEqual(expect.objectContaining({
      tier: 'T2',
      label: 'division_subdivision_rhythm',
      reusableAtNodeTypes: ['division', 'subdivision'],
      allowedAssetTypes: expect.arrayContaining(['t2_division_rhythm_template']),
      groupKeyStrategy: 'business_type_phase_division_subdivision_workface',
      prohibitsCrossTierBucketMixing: true,
      assetDefinitions: expect.arrayContaining([
        expect.objectContaining({
          assetType: 't2_division_rhythm_template',
          allowedReuseScopes: expect.arrayContaining(['project', 'company', 'industry']),
          allowedFactSources: expect.arrayContaining(['actual_outcome', 'replay', 'hybrid']),
          defaultReuseScope: 'company',
          defaultFactSource: 'hybrid',
        }),
      ]),
    }))
    expect(t2?.forbiddenNodeTypes).toEqual(expect.arrayContaining(['process', 'project']))
  })

  it('accepts T2 replay candidate payloads only when tier, node type, and groupKey shape stay T2 scoped', () => {
    const payload = buildAcceptedT2CandidatePayload()

    const result = assessExperienceTierCandidatePayload(payload)

    expect(result.status).toBe('tier_candidate_valid')
    expect(result.tier).toBe('T2')
    expect(result).toEqual(expect.objectContaining({
      assetType: 't2_division_rhythm_template',
      reuseScope: 'project',
      factSource: 'hybrid',
      identityResolution: 'explicit',
    }))
    expect(payload).toEqual(expect.objectContaining({
      experienceAssetType: 't2_division_rhythm_template',
    }))
    expect(result.acceptedGroupKeys).toEqual(expect.arrayContaining([
      'T2:division:superstructure',
      'T2:subdivision:standard_floor_handover',
    ]))
    expect(result.rejectedReasons).toEqual([])
  })

  it('accepts an explicit four-part asset identity and preserves its scope and fact source', () => {
    const payload = {
      ...(buildAcceptedT2CandidatePayload() as Record<string, unknown>),
      reuseScope: 'project',
      factSource: 'actual_outcome',
      projectId: 'project-a1',
      companyId: 'company-a',
    }

    const result = assessExperienceTierCandidatePayload(payload)

    expect(result).toEqual(expect.objectContaining({
      status: 'tier_candidate_valid',
      tier: 'T2',
      assetType: 't2_division_rhythm_template',
      reuseScope: 'project',
      factSource: 'actual_outcome',
      identityResolution: 'explicit',
      rejectedReasons: [],
    }))
  })

  it('rejects unsupported reuse scopes, fact sources, and project scope without project ownership', () => {
    const unsupportedScope = assessExperienceTierCandidatePayload({
      experienceTier: 'T3',
      experienceAssetType: 's_curve_state_model',
      reuseScope: 'global',
      factSource: 'actual_outcome',
      wbsNodeTypes: ['project'],
      experienceGroupKeys: ['T3:project:s-curve'],
    })
    const unknownFactSource = assessExperienceTierCandidatePayload({
      ...(buildAcceptedT2CandidatePayload() as Record<string, unknown>),
      reuseScope: 'company',
      factSource: 'external_reference',
      companyId: 'company-a',
    })
    const projectWithoutOwner = assessExperienceTierCandidatePayload({
      ...(buildAcceptedT2CandidatePayload() as Record<string, unknown>),
      reuseScope: 'project',
      factSource: 'hybrid',
      projectId: null,
      projectIds: [],
    })

    expect(unsupportedScope.rejectedReasons).toContain('unsupported_reuse_scope:global')
    expect(unknownFactSource.rejectedReasons).toContain('unsupported_fact_source:external_reference')
    expect(projectWithoutOwner.rejectedReasons).toContain('project_id_required_for_project_reuse_scope')
  })

  it('rejects candidate payloads whose asset type is not allowed for the declared experience tier', () => {
    const payload = {
      ...(buildAcceptedT2CandidatePayload() as Record<string, unknown>),
      experienceTier: 'T2',
      experienceAssetType: 'process_duration',
    }

    const result = assessExperienceTierCandidatePayload(payload)

    expect(result.status).toBe('tier_candidate_rejected')
    expect(result.rejectedReasons).toEqual(expect.arrayContaining([
      'unsupported_experience_asset_type:process_duration',
    ]))
  })

  it('rejects candidate payloads that omit the explicit experience asset type', () => {
    const payload: Record<string, unknown> = {
      ...(buildAcceptedT2CandidatePayload() as Record<string, unknown>),
      experienceTier: 'T2',
    }
    delete payload.experienceAssetType

    const result = assessExperienceTierCandidatePayload(payload)

    expect(result.status).toBe('tier_candidate_rejected')
    expect(result.rejectedReasons).toEqual(expect.arrayContaining([
      'missing_experience_asset_type',
    ]))
  })

  it('rejects T2 candidate payloads that try to enter T1/T3 buckets or unsupported node types', () => {
    const payload = {
      ...(buildAcceptedT2CandidatePayload() as Record<string, unknown>),
      experienceTier: 'T2',
      wbsNodeTypes: ['process', 'project'],
      experienceGroupKeys: [
        'T1:process:rebar_installation',
        'T2:division:superstructure',
        'T3:project:residential_efficiency',
      ],
    }

    const result = assessExperienceTierCandidatePayload(payload)

    expect(result.status).toBe('tier_candidate_rejected')
    expect(result.rejectedReasons).toEqual(expect.arrayContaining([
      'unsupported_node_type:process',
      'unsupported_node_type:project',
      'cross_tier_group_key:T1:process:rebar_installation',
      'cross_tier_group_key:T3:project:residential_efficiency',
    ]))
    expect(result.acceptedGroupKeys).toEqual(['T2:division:superstructure'])
  })
})
