import { describe, expect, it } from 'vitest'

import {
  T2_DIVISION_RHYTHM_TEMPLATE_SEED,
  auditT2DivisionRhythmTemplateRegistry,
  buildT2RhythmScheduleCandidatePackage,
  checkT2RhythmTemplateAssemblyCompatibility,
  selectT2DivisionRhythmTemplates,
  type T2RhythmPhase1MultiNetworkSelectionTrustGate,
} from '../services/t2DivisionRhythmTemplateRegistryService.js'
import {
  checkTemplateAssemblyCompatibility,
} from '../services/templateAssemblyCompatibilityCheckService.js'
import { BUSINESS_TYPE_RECOMMENDATIONS } from '../services/projectTypeRecommendations.js'
import {
  evaluateT2RhythmStandardLibraryTrustGate,
} from '../services/t2RhythmStandardLibraryTrustGateService.js'
import {
  evaluateT2RhythmStandardLibraryL5ReleaseGate,
} from '../services/t2RhythmStandardLibraryL5ReleaseGateService.js'
import {
  buildT2RhythmProductionCapacityEvidence,
} from '../services/t2RhythmProductionCapacityEvidenceService.js'

const SYSTEM_TO_T2_RHYTHM_BUSINESS_MAPPINGS: Record<string, string[]> = {
  general_civil: ['residential', 'commercial'],
  hotel: ['hotel'],
  hospital: ['hospital'],
  school: ['school'],
  industrial: ['industrial'],
  data_center: ['data_center'],
  transportation_hub: ['transportation_hub'],
  sports_culture: ['sports_culture'],
  tod_upper_cover: ['tod_upper_cover'],
  renovation: ['renovation'],
  modular_building: ['modular_building'],
}

function buildPassingLiveReplayTrustGate() {
  return evaluateT2RhythmStandardLibraryTrustGate({
    status: 'pass',
    selectedTemplateIds: [
      't2-residential-standard-floor-structure-rhythm-v1',
      't2-residential-basement-structure-handover-rhythm-v1',
    ],
    missingArchivedJson: false,
    evidenceMetadata: {
      missingEvidenceMetadata: false,
    },
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
}

function buildPassingPhase1MultiNetworkSelectionTrustGate(): T2RhythmPhase1MultiNetworkSelectionTrustGate {
  return {
    source: 't2_rhythm_phase1_multinetwork_selection_trust_gate' as const,
    status: 'phase1_multinetwork_selection_ready_not_publishable' as const,
    evidenceMode: 'archived_phase1_selector_replay' as const,
    trustBoundary: 'archived_phase1_selector_replay_only' as const,
    canTrustForRealScheduleSelection: true,
    readySelectionCount: 15,
    minimumSelectionCount: 15,
    scenarioCoverageCount: 15,
    minimumScenarioCoverageCount: 15,
    eligibleCandidateCount: 15,
    rejectedConflictCandidateCount: 15,
    selectedTemplateIds: [
      't2-residential-standard-floor-structure-rhythm-v1',
      't2-residential-basement-structure-handover-rhythm-v1',
    ],
    selectionEvidenceRefs: ['archived-selector-replay:t2-phase1:2026-06-23'],
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
}

function buildPassingL5CanaryHandoffGate() {
  return evaluateT2RhythmStandardLibraryL5ReleaseGate({
    trustGate: buildPassingLiveReplayTrustGate(),
    selectedTemplateIds: [
      't2-residential-standard-floor-structure-rhythm-v1',
      't2-residential-basement-structure-handover-rhythm-v1',
    ],
    releaseScope: {
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      scopeType: 'project',
    },
    l5Evidence: {
      releaseExitApproved: true,
      releaseExitEvidenceRefs: ['release-exit:t2-standard-library:approved'],
      canaryPlanApproved: true,
      canaryEvidenceRefs: ['canary:t2-standard-library:7d-project-scope'],
      canaryMinimumSampleCount: 24,
      canaryDurationDays: 7,
      canaryBlastRadius: {
        maxProjectCount: 1,
        maxCompanyCount: 1,
        maxTemplateCount: 2,
        scopeLocked: true,
      },
      canarySuccessCriteria: {
        minimumP80CaptureRate: 0.8,
        maximumMedianAbsoluteErrorDays: 3,
        maximumGateSlipMedianDays: 2,
        maximumDependencyViolationRate: 0.02,
      },
      runtimeConsumerVerified: true,
      runtimeConsumerEvidenceRefs: ['consumer:durationInputAssembler:t2-standard-library'],
      impactMonitoringReady: true,
      impactMonitoringEvidenceRefs: ['monitor:t2-standard-library:mape-drift'],
      impactMonitoringMetrics: [
        { metricCode: 'median_absolute_error_days', comparator: 'lte' as const, threshold: 3, windowDays: 7 },
        { metricCode: 'p80_capture_rate', comparator: 'gte' as const, threshold: 0.8, windowDays: 7 },
      ],
      rollbackTargetReady: true,
      rollbackEvidenceRefs: ['rollback:t2-standard-library:previous-shadow-version'],
      rollbackDrill: {
        executed: true,
        recoveryTimeMinutes: 30,
        rollbackTargetVersion: 't2-standard-library-shadow-v0',
        evidenceRefs: ['rollback-drill:t2-standard-library:verified'],
      },
    },
  })
}

describe('T2 division/subdivision rhythm template registry', () => {
  it('exposes standard-library-grade breadth for cold-start schedule planning', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    expect(audit.templateCount).toBeGreaterThanOrEqual(16)
    expect(audit.businessTypeCount).toBeGreaterThanOrEqual(13)
    expect(audit.divisionFamilyCount).toBeGreaterThanOrEqual(8)
    expect(audit.subdivisionFamilyCount).toBeGreaterThanOrEqual(36)
    expect(audit.scheduleTrustReady).toBe(true)
    expect(audit.blockingDefects).toEqual([])

    expect(audit.businessTypeCodes).toEqual(expect.arrayContaining([
      'general_civil',
      'residential',
      'commercial',
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
    ]))

    expect(audit.divisionFamilies).toEqual(expect.arrayContaining([
      'foundation_and_basement',
      'superstructure',
      'envelope_facade_roof',
      'mep_systems',
      'decoration_fitout',
      'outdoor_municipal_landscape',
      'commissioning_handover',
      'specialty_business_systems',
    ]))
  })

  it('covers formal system business types directly instead of relying only on semantic aliases', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()
    const formalSystemBusinessTypes = Object.keys(SYSTEM_TO_T2_RHYTHM_BUSINESS_MAPPINGS)

    expect(audit.businessTypeCodes).toEqual(expect.arrayContaining(formalSystemBusinessTypes))
    expect(audit.businessTypeProfiles.map((profile) => profile.businessTypeCode)).toEqual(
      expect.arrayContaining(['general_civil']),
    )

    const generalCivilTemplates = selectT2DivisionRhythmTemplates({
      businessTypeCode: 'general_civil',
      phaseWindow: 'superstructure',
      divisionFamily: 'superstructure',
      subdivisionFamily: 'standard_floor_handover',
      methodVariantCodes: ['aluminum_formwork'],
      scopeDimensions: ['building', 'floor'],
    })

    expect(generalCivilTemplates.map((template) => template.templateId)).toContain(
      't2-residential-standard-floor-structure-rhythm-v1',
    )
  })

  it('audits business-type rhythm coverage by schedulable division profiles, not only global counts', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    const requiredProfiles = [
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

    for (const expectation of requiredProfiles) {
      const profile = audit.businessTypeProfiles.find((item) => item.businessTypeCode === expectation.businessTypeCode)
      expect(profile, `${expectation.businessTypeCode} profile`).toBeDefined()
      expect(profile?.status, `${expectation.businessTypeCode} status`).toBe('ready')
      expect(profile?.templateCount, `${expectation.businessTypeCode} template count`).toBeGreaterThanOrEqual(expectation.minTemplateCount)
      expect(profile?.missingRequiredDivisionFamilies, `${expectation.businessTypeCode} missing divisions`).toEqual([])
      expect(profile?.coveredDivisionFamilies, `${expectation.businessTypeCode} covered divisions`).toEqual(expect.arrayContaining(expectation.requiredDivisionFamilies))
    }

    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('business_type_profile_not_ready'),
    ]))
  })

  it('covers every formal system business type through explicit T2 rhythm business mappings', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()
    const t2BusinessTypeCodes = new Set(audit.businessTypeCodes)

    const missingBusinessTypes = Object.keys(BUSINESS_TYPE_RECOMMENDATIONS)
      .filter((businessTypeCode) => !(SYSTEM_TO_T2_RHYTHM_BUSINESS_MAPPINGS[businessTypeCode] ?? [businessTypeCode])
        .some((rhythmBusinessTypeCode) => t2BusinessTypeCodes.has(rhythmBusinessTypeCode)))

    expect(missingBusinessTypes).toEqual([])
  })

  it('exposes formal system business type coverage as an auditable registry field', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    expect(audit.systemBusinessTypeCoverage).toEqual(expect.objectContaining({
      status: 'ready',
      formalBusinessTypeCount: Object.keys(BUSINESS_TYPE_RECOMMENDATIONS).length,
      coveredBusinessTypeCount: Object.keys(BUSINESS_TYPE_RECOMMENDATIONS).length,
      directCoveredBusinessTypeCount: Object.keys(BUSINESS_TYPE_RECOMMENDATIONS).length,
      coverageRate: 1,
      directCoverageRate: 1,
      missingBusinessTypeCodes: [],
      missingDirectBusinessTypeCodes: [],
    }))
    expect(audit.systemBusinessTypeCoverage.t2RhythmBusinessTypeCodes).toEqual(audit.businessTypeCodes)
    expect(audit.scheduleReadinessGate.dimensions.breadth.checksPassed).toEqual(expect.arrayContaining([
      'system_formal_business_type_coverage',
      'system_formal_business_type_direct_coverage',
    ]))

    const generalCivilRow = audit.systemBusinessTypeCoverage.mappings.find(
      (row) => row.businessTypeCode === 'general_civil',
    )
    expect(generalCivilRow).toEqual(expect.objectContaining({
      status: 'ready',
      directlyCovered: true,
      mappedRhythmBusinessTypeCodes: expect.arrayContaining(['general_civil', 'residential', 'commercial']),
      matchedRhythmBusinessTypeCodes: expect.arrayContaining(['general_civil']),
    }))
  })

  it('separates formal business-type reach from standard-library thickness coverage', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()
    const totalTemplateCountHint = Object.values(BUSINESS_TYPE_RECOMMENDATIONS)
      .reduce((sum, recommendation) => sum + recommendation.templateCountHint, 0)

    expect(audit.systemBusinessTypeCoverage).toEqual(expect.objectContaining({
      status: 'ready',
      formalBusinessTypeCount: Object.keys(BUSINESS_TYPE_RECOMMENDATIONS).length,
      coveredBusinessTypeCount: Object.keys(BUSINESS_TYPE_RECOMMENDATIONS).length,
      directCoveredBusinessTypeCount: Object.keys(BUSINESS_TYPE_RECOMMENDATIONS).length,
      coverageRate: 1,
      directCoverageRate: 1,
      missingBusinessTypeCodes: [],
      missingDirectBusinessTypeCodes: [],
    }))
    expect(audit.systemBusinessTypeCoverage.t2RhythmBusinessTypeCodes).toEqual(audit.businessTypeCodes)
    expect(audit.standardLibraryThicknessCoverage).toEqual(expect.objectContaining({
      status: 'ready',
      currentTemplateCount: audit.templateCount,
      targetTemplateCount: totalTemplateCountHint,
      coverageRate: 1,
      weakestBusinessTypeCodes: [],
    }))
    expect(audit.standardLibraryThicknessCoverage.byBusinessType).toEqual(expect.arrayContaining([
      expect.objectContaining({
        businessTypeCode: 'hospital',
        currentTemplateCount: 30,
        targetTemplateCount: BUSINESS_TYPE_RECOMMENDATIONS.hospital.templateCountHint,
        status: 'ready',
      }),
      expect.objectContaining({
        businessTypeCode: 'general_civil',
        currentTemplateCount: 25,
        targetTemplateCount: BUSINESS_TYPE_RECOMMENDATIONS.general_civil.templateCountHint,
        status: 'ready',
      }),
      expect.objectContaining({
        businessTypeCode: 'tod_upper_cover',
        currentTemplateCount: 24,
        targetTemplateCount: BUSINESS_TYPE_RECOMMENDATIONS.tod_upper_cover.templateCountHint,
        status: 'ready',
      }),
      expect.objectContaining({
        businessTypeCode: 'industrial',
        currentTemplateCount: 22,
        targetTemplateCount: BUSINESS_TYPE_RECOMMENDATIONS.industrial.templateCountHint,
        status: 'ready',
      }),
      expect.objectContaining({
        businessTypeCode: 'hotel',
        currentTemplateCount: 20,
        targetTemplateCount: BUSINESS_TYPE_RECOMMENDATIONS.hotel.templateCountHint,
        status: 'ready',
      }),
      expect.objectContaining({
        businessTypeCode: 'transportation_hub',
        currentTemplateCount: 20,
        targetTemplateCount: BUSINESS_TYPE_RECOMMENDATIONS.transportation_hub.templateCountHint,
        status: 'ready',
      }),
      expect.objectContaining({
        businessTypeCode: 'data_center',
        currentTemplateCount: 18,
        targetTemplateCount: BUSINESS_TYPE_RECOMMENDATIONS.data_center.templateCountHint,
        status: 'ready',
      }),
      expect.objectContaining({
        businessTypeCode: 'school',
        currentTemplateCount: 18,
        targetTemplateCount: BUSINESS_TYPE_RECOMMENDATIONS.school.templateCountHint,
        status: 'ready',
      }),
      expect.objectContaining({
        businessTypeCode: 'sports_culture',
        currentTemplateCount: 16,
        targetTemplateCount: BUSINESS_TYPE_RECOMMENDATIONS.sports_culture.templateCountHint,
        status: 'ready',
      }),
      expect.objectContaining({
        businessTypeCode: 'renovation',
        currentTemplateCount: 14,
        targetTemplateCount: BUSINESS_TYPE_RECOMMENDATIONS.renovation.templateCountHint,
        status: 'ready',
      }),
      expect.objectContaining({
        businessTypeCode: 'modular_building',
        currentTemplateCount: 12,
        targetTemplateCount: BUSINESS_TYPE_RECOMMENDATIONS.modular_building.templateCountHint,
        status: 'ready',
      }),
    ]))
  })

  it('expands the thinnest formal business types with schedule-trust-ready template depth', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()
    const expansionBatch = [
      { templateId: 't2-modular-building-site-foundation-anchor-readiness-rhythm-v1', businessTypeCode: 'modular_building' },
      { templateId: 't2-modular-building-stacked-module-envelope-closeout-rhythm-v1', businessTypeCode: 'modular_building' },
      { templateId: 't2-tod-rail-protection-transfer-deck-readiness-rhythm-v1', businessTypeCode: 'tod_upper_cover' },
      { templateId: 't2-tod-upper-cover-tower-standard-floor-rhythm-v1', businessTypeCode: 'tod_upper_cover' },
      { templateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1', businessTypeCode: 'renovation' },
      { templateId: 't2-renovation-energy-envelope-mep-verification-rhythm-v1', businessTypeCode: 'renovation' },
      { templateId: 't2-renovation-heritage-craft-minimal-intervention-rhythm-v1', businessTypeCode: 'renovation' },
      { templateId: 't2-industrial-steel-structure-envelope-rhythm-v1', businessTypeCode: 'industrial' },
      { templateId: 't2-data-center-power-room-equipment-installation-rhythm-v1', businessTypeCode: 'data_center' },
      { templateId: 't2-transport-hub-station-hall-fitout-handover-rhythm-v1', businessTypeCode: 'transportation_hub' },
    ]

    expect(audit.templateCount).toBeGreaterThanOrEqual(196)
    expect(audit.standardLibraryThicknessCoverage.currentTemplateCount).toBeGreaterThanOrEqual(196)
    expect(audit.standardLibraryThicknessCoverage.coverageRate).toBeGreaterThanOrEqual(1)
    expect(audit.standardLibraryThicknessCoverage.byBusinessType).toEqual(expect.arrayContaining([
      expect.objectContaining({ businessTypeCode: 'modular_building', currentTemplateCount: 12 }),
      expect.objectContaining({ businessTypeCode: 'tod_upper_cover', currentTemplateCount: 24 }),
      expect.objectContaining({ businessTypeCode: 'industrial', currentTemplateCount: 22 }),
      expect.objectContaining({ businessTypeCode: 'data_center', currentTemplateCount: 18 }),
      expect.objectContaining({ businessTypeCode: 'transportation_hub', currentTemplateCount: 20 }),
      expect.objectContaining({ businessTypeCode: 'renovation', currentTemplateCount: 14 }),
    ]))

    for (const expectation of expansionBatch) {
      const template = T2_DIVISION_RHYTHM_TEMPLATE_SEED.find((item) => item.templateId === expectation.templateId)
      expect(template, expectation.templateId).toBeDefined()
      expect(template?.applicability.businessTypeCodes, expectation.templateId).toContain(expectation.businessTypeCode)
      expect(template?.rhythm.childWindows.length, expectation.templateId).toBeGreaterThanOrEqual(7)
      expect(template?.dependencyEdges.length, expectation.templateId).toBeGreaterThanOrEqual(
        (template?.rhythm.childWindows.length ?? 1) - 1,
      )
      expect(template?.hardGates.length, expectation.templateId).toBeGreaterThanOrEqual(2)
      expect(template?.applicability.subdivisionFamilies.length, expectation.templateId).toBeGreaterThanOrEqual(3)
      expect(template?.compatibility.requiredFacts.length, expectation.templateId).toBeGreaterThanOrEqual(2)
      expect(template?.compatibility.incompatibleAssumptions.length, expectation.templateId).toBeGreaterThanOrEqual(1)
      expect(template?.calibration.requiredActualSignals.length, expectation.templateId).toBeGreaterThanOrEqual(6)
      expect(template?.scheduleTrust.evidenceAnchors.replayAdmission.minimumComparableWorkfaceWindows, expectation.templateId).toBeGreaterThanOrEqual(12)
      expect(template?.governance.directRuntimeWrite, expectation.templateId).toBe(false)
      expect(template?.governance.autoPublish, expectation.templateId).toBe(false)
      expect(template?.governance.governanceStatus, expectation.templateId).toBe('candidate_seeded')
    }

    expect(audit.blockingDefects).toEqual([])
    expect(audit.scheduleReadinessGate.canAutoMaterializeTaskDependencies).toBe(false)
    expect(audit.scheduleReadinessGate.canAutoPublishRuntimeExperience).toBe(false)
  })

  it('continues thickening cross-typology T2 rhythm coverage beyond the first expansion batch', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()
    const expansionBatch = [
      { templateId: 't2-tod-upper-cover-podium-public-fitout-rhythm-v1', businessTypeCode: 'tod_upper_cover' },
      { templateId: 't2-tod-rail-interface-night-window-utility-tiein-rhythm-v1', businessTypeCode: 'tod_upper_cover' },
      { templateId: 't2-industrial-process-piping-equipment-commissioning-rhythm-v1', businessTypeCode: 'industrial' },
      { templateId: 't2-industrial-logistics-warehouse-mezzanine-fitout-rhythm-v1', businessTypeCode: 'industrial' },
      { templateId: 't2-transport-hub-platform-canopy-trackside-interface-rhythm-v1', businessTypeCode: 'transportation_hub' },
      { templateId: 't2-hospital-operating-room-cleanroom-fitout-rhythm-v1', businessTypeCode: 'hospital' },
      { templateId: 't2-hospital-medical-equipment-installation-acceptance-rhythm-v1', businessTypeCode: 'hospital' },
      { templateId: 't2-sports-culture-bowl-public-area-fitout-rhythm-v1', businessTypeCode: 'sports_culture' },
      { templateId: 't2-sports-culture-event-systems-commissioning-rhythm-v1', businessTypeCode: 'sports_culture' },
      { templateId: 't2-general-civil-basement-podium-commercial-fitout-rhythm-v1', businessTypeCode: 'general_civil' },
      { templateId: 't2-school-dormitory-canteen-handover-rhythm-v1', businessTypeCode: 'school' },
      { templateId: 't2-hotel-guestroom-mockup-batch-fitout-rhythm-v1', businessTypeCode: 'hotel' },
    ]

    expect(audit.templateCount).toBeGreaterThanOrEqual(196)
    expect(audit.standardLibraryThicknessCoverage.currentTemplateCount).toBeGreaterThanOrEqual(196)
    expect(audit.standardLibraryThicknessCoverage.coverageRate).toBeGreaterThanOrEqual(1)
    expect(audit.standardLibraryThicknessCoverage.byBusinessType).toEqual(expect.arrayContaining([
      expect.objectContaining({ businessTypeCode: 'tod_upper_cover', currentTemplateCount: 24 }),
      expect.objectContaining({ businessTypeCode: 'industrial', currentTemplateCount: 22 }),
      expect.objectContaining({ businessTypeCode: 'transportation_hub', currentTemplateCount: 20 }),
      expect.objectContaining({ businessTypeCode: 'hospital', currentTemplateCount: 30 }),
      expect.objectContaining({ businessTypeCode: 'sports_culture', currentTemplateCount: 16 }),
      expect.objectContaining({ businessTypeCode: 'general_civil', currentTemplateCount: 25 }),
      expect.objectContaining({ businessTypeCode: 'school', currentTemplateCount: 18 }),
      expect.objectContaining({ businessTypeCode: 'hotel', currentTemplateCount: 20 }),
    ]))

    for (const expectation of expansionBatch) {
      const template = T2_DIVISION_RHYTHM_TEMPLATE_SEED.find((item) => item.templateId === expectation.templateId)
      expect(template, expectation.templateId).toBeDefined()
      expect(template?.applicability.businessTypeCodes, expectation.templateId).toContain(expectation.businessTypeCode)
      expect(template?.rhythm.childWindows.length, expectation.templateId).toBeGreaterThanOrEqual(7)
      expect(template?.dependencyEdges.length, expectation.templateId).toBeGreaterThanOrEqual(
        (template?.rhythm.childWindows.length ?? 1) - 1,
      )
      expect(template?.hardGates.length, expectation.templateId).toBeGreaterThanOrEqual(2)
      expect(template?.applicability.divisionFamilies.length, expectation.templateId).toBeGreaterThanOrEqual(2)
      expect(template?.applicability.subdivisionFamilies.length, expectation.templateId).toBeGreaterThanOrEqual(3)
      expect(template?.compatibility.requiredFacts.length, expectation.templateId).toBeGreaterThanOrEqual(2)
      expect(template?.compatibility.incompatibleAssumptions.length, expectation.templateId).toBeGreaterThanOrEqual(1)
      expect(template?.scheduleTrust.scheduleSemantics.criticalPathRoles.length, expectation.templateId).toBeGreaterThanOrEqual(2)
      expect(template?.scheduleTrust.evidenceAnchors.replayAdmission.minimumComparableWorkfaceWindows, expectation.templateId).toBeGreaterThanOrEqual(12)
      expect(template?.governance.directRuntimeWrite, expectation.templateId).toBe(false)
      expect(template?.governance.autoPublish, expectation.templateId).toBe(false)
      expect(template?.governance.governanceStatus, expectation.templateId).toBe('candidate_seeded')
    }

    expect(audit.systemBusinessTypeCoverage.coverageRate).toBe(1)
    expect(audit.blockingDefects).toEqual([])
    expect(audit.scheduleReadinessGate.status).toBe('shadow_candidate_ready_not_publishable')
    expect(audit.scheduleReadinessGate.canAutoMaterializeTaskDependencies).toBe(false)
    expect(audit.scheduleReadinessGate.canAutoPublishRuntimeExperience).toBe(false)
  })

  it('meets the formal business-type template-count hints as a complete T2 standard-library thickness target', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()
    const totalTemplateCountHint = Object.values(BUSINESS_TYPE_RECOMMENDATIONS)
      .reduce((sum, recommendation) => sum + recommendation.templateCountHint, 0)
    const templateIds = T2_DIVISION_RHYTHM_TEMPLATE_SEED.map((template) => template.templateId)

    expect(new Set(templateIds).size).toBe(templateIds.length)
    expect(audit.templateCount).toBeGreaterThanOrEqual(totalTemplateCountHint)
    expect(audit.standardLibraryThicknessCoverage).toEqual(expect.objectContaining({
      status: 'ready',
      currentTemplateCount: audit.templateCount,
      targetTemplateCount: totalTemplateCountHint,
    }))
    expect(audit.standardLibraryThicknessCoverage.coverageRate).toBeGreaterThanOrEqual(1)
    expect(audit.standardLibraryThicknessCoverage.weakestBusinessTypeCodes).toEqual([])

    for (const recommendation of Object.values(BUSINESS_TYPE_RECOMMENDATIONS)) {
      const row = audit.standardLibraryThicknessCoverage.byBusinessType.find(
        (item) => item.businessTypeCode === recommendation.businessType,
      )
      expect(row, recommendation.businessType).toEqual(expect.objectContaining({
        businessTypeCode: recommendation.businessType,
        status: 'ready',
        targetTemplateCount: recommendation.templateCountHint,
        missingTemplateCount: 0,
      }))
      expect(row?.currentTemplateCount, recommendation.businessType).toBeGreaterThanOrEqual(recommendation.templateCountHint)
      expect(row?.coverageRate, recommendation.businessType).toBeGreaterThanOrEqual(1)
    }

    for (const template of T2_DIVISION_RHYTHM_TEMPLATE_SEED) {
      expect(template.rhythm.childWindows.length, template.templateId).toBeGreaterThanOrEqual(7)
      expect(template.dependencyEdges.length, template.templateId).toBeGreaterThanOrEqual(template.rhythm.childWindows.length - 1)
      expect(template.hardGates.length, template.templateId).toBeGreaterThanOrEqual(2)
      expect(template.compatibility.requiredFacts.length, template.templateId).toBeGreaterThanOrEqual(2)
      expect(template.compatibility.incompatibleAssumptions.length, template.templateId).toBeGreaterThanOrEqual(1)
      expect(template.governance.directRuntimeWrite, template.templateId).toBe(false)
      expect(template.governance.autoPublish, template.templateId).toBe(false)
      expect(template.governance.governanceStatus, template.templateId).toBe('candidate_seeded')
    }

    expect(audit.blockingDefects).toEqual([])
    expect(audit.scheduleReadinessGate.status).toBe('shadow_candidate_ready_not_publishable')
    expect(audit.scheduleReadinessGate.canAutoMaterializeTaskDependencies).toBe(false)
    expect(audit.scheduleReadinessGate.canAutoPublishRuntimeExperience).toBe(false)
  })

  it('audits representative schedule scenarios, not only business-type profile counts', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    const requiredScenarioIds = [
      'general_civil_standard_floor_structure',
      'residential_basement_structure_handover',
      'residential_standard_floor_structure',
      'commercial_podium_fitout_opening',
      'hotel_guestroom_fitout_opening',
      'hospital_clinical_department_fitout',
      'school_classroom_lab_fitout',
      'industrial_main_plant_equipment',
      'data_center_white_space_fitout',
      'transport_hub_public_systems',
      'sports_culture_longspan_envelope',
      'residential_outdoor_municipal_landscape',
      'tod_rail_interface_commissioning',
      'renovation_occupied_zone_fitout',
      'modular_building_factory_lot_site_assembly',
    ]

    expect(audit.representativeScheduleScenarioCoverage.status).toBe('ready')
    expect(audit.representativeScheduleScenarioCoverage.readyScenarioCount).toBe(requiredScenarioIds.length)
    expect(audit.representativeScheduleScenarioCoverage.scenarios.map((scenario) => scenario.scenarioId)).toEqual(requiredScenarioIds)

    for (const scenario of audit.representativeScheduleScenarioCoverage.scenarios) {
      expect(scenario.status, scenario.scenarioId).toBe('schedulable_candidate')
      expect(scenario.canEnterC1913Phase1Selection, scenario.scenarioId).toBe(true)
      expect(scenario.requiresTemplateExpansion, scenario.scenarioId).toBe(false)
      expect(scenario.selectedTemplateIds.length, scenario.scenarioId).toBeGreaterThanOrEqual(1)
      expect(scenario.durationBearingWindowCount, scenario.scenarioId).toBeGreaterThanOrEqual(4)
      expect(scenario.dependencyCandidateCount, scenario.scenarioId).toBeGreaterThanOrEqual(6)
      expect(scenario.hardGateCount, scenario.scenarioId).toBeGreaterThanOrEqual(2)
      expect(scenario.conflictCodes, scenario.scenarioId).toEqual([])
    }

    expect(audit.scheduleReadinessGate.dimensions.breadth.checksPassed).toEqual(expect.arrayContaining([
      'representative_schedule_scenarios',
    ]))
    expect(audit.scheduleReadinessGate.dimensions.breadth.representativeScheduleScenarioCount).toBe(requiredScenarioIds.length)
    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('representative_schedule_scenario_not_schedulable'),
    ]))
  })

  it('keeps representative scenarios ready for phase-1 candidate-network selection without runtime mutation', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    expect(audit.scheduleReadinessGate.canEnterC1913Phase1Selection).toBe(true)
    expect(audit.scheduleReadinessGate.canAutoMaterializeTaskDependencies).toBe(false)
    expect(audit.scheduleReadinessGate.canAutoPublishRuntimeExperience).toBe(false)
    expect(audit.scheduleReadinessGate.trustBoundary).toBe('candidate_network_and_replay_shadow_only')

    for (const scenario of audit.representativeScheduleScenarioCoverage.scenarios) {
      expect(scenario.status, scenario.scenarioId).toBe('schedulable_candidate')
      expect(scenario.canEnterC1913Phase1Selection, scenario.scenarioId).toBe(true)
      expect(scenario.durationBearingWindowCount, scenario.scenarioId).toBeGreaterThanOrEqual(4)
      expect(scenario.dependencyCandidateCount, scenario.scenarioId).toBeGreaterThanOrEqual(6)
      expect(scenario.hardGateCount, scenario.scenarioId).toBeGreaterThanOrEqual(2)
      expect(scenario.conflictCodes, scenario.scenarioId).toEqual([])
    }

    expect(audit.scheduleReadinessGate.dimensions.breadth.checksPassed).toEqual(expect.arrayContaining([
      'representative_schedule_scenarios',
    ]))
    expect(audit.scheduleReadinessGate.dimensions.breadth.representativeScheduleScenarioCount).toBe(
      audit.representativeScheduleScenarioCoverage.minimumScenarioCount,
    )
    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('representative_schedule_scenario_not_schedulable'),
    ]))
  })

  it('audits representative scenario phase-1 network evaluations before trusting T2 breadth for real scheduling', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    expect(audit.representativePhase1EvaluationCoverage.status).toBe('ready')
    expect(audit.representativePhase1EvaluationCoverage.readyEvaluationCount).toBe(
      audit.representativeScheduleScenarioCoverage.minimumScenarioCount,
    )
    expect(audit.representativePhase1EvaluationCoverage.evaluations.map((evaluation) => evaluation.scenarioId)).toEqual(
      audit.representativeScheduleScenarioCoverage.scenarios.map((scenario) => scenario.scenarioId),
    )

    for (const evaluation of audit.representativePhase1EvaluationCoverage.evaluations) {
      expect(evaluation.status, evaluation.scenarioId).toBe('phase1_readonly_evaluation_ready')
      expect(evaluation.canEnterC1913Phase1Selection, evaluation.scenarioId).toBe(true)
      expect(evaluation.topologyEvaluated, evaluation.scenarioId).toBe(true)
      expect(evaluation.floatCalculated, evaluation.scenarioId).toBe(true)
      expect(evaluation.networkSpanDays, evaluation.scenarioId).toBeGreaterThanOrEqual(evaluation.minimumTemplateAnchorSpanDays)
      expect(evaluation.nodeEvaluationCount, evaluation.scenarioId).toBeGreaterThanOrEqual(6)
      expect(evaluation.criticalWindowCodes.length, evaluation.scenarioId).toBeGreaterThanOrEqual(1)
      expect(evaluation.mutationBoundary, evaluation.scenarioId).toEqual(expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
      }))
      expect(evaluation.conflictCodes, evaluation.scenarioId).toEqual([])
    }

    expect(audit.scheduleReadinessGate.dimensions.breadth.checksPassed).toEqual(expect.arrayContaining([
      'representative_phase1_network_evaluations',
    ]))
    expect(audit.scheduleReadinessGate.dimensions.breadth.representativePhase1EvaluationCount).toBe(
      audit.representativeScheduleScenarioCoverage.minimumScenarioCount,
    )
    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('representative_phase1_evaluation_not_ready'),
    ]))
  })

  it('audits representative phase-1 multi-network selection coverage before trusting C-19.13 assembly decisions', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    expect(audit.representativePhase1MultiNetworkSelectionCoverage.status).toBe('ready')
    expect(audit.representativePhase1MultiNetworkSelectionCoverage.readySelectionCount).toBeGreaterThanOrEqual(1)
    expect(audit.representativePhase1MultiNetworkSelectionCoverage.minimumSelectionCount).toBeGreaterThanOrEqual(1)

    const residentialSelection = audit.representativePhase1MultiNetworkSelectionCoverage.selections.find((selection) => (
      selection.selectionId === 'representative:residential_standard_floor_structure:multi_network'
    ))

    expect(residentialSelection).toEqual(expect.objectContaining({
      status: 'phase1_selection_ready',
      selectedCandidateId: 'representative:residential_standard_floor_structure:compatible_standard_floor',
      candidateCount: 3,
      eligibleCandidateCount: 2,
      rejectedCandidateCount: 1,
      rejectedConflictCandidateCount: 1,
      rejectedLiveReplayTrustGateCandidateCount: 0,
      trustGateEvidenceMode: 'representative_shadow_probe_not_release_evidence',
      combinationConsistencyGateStatus: 'pass_with_manual_review_rejections',
      linearPriorityCanOverrideAssemblyConflict: false,
    }))
    expect(residentialSelection?.candidateIds).toEqual(expect.arrayContaining([
      'representative:residential_standard_floor_structure:conflicted_tower_first',
      'representative:residential_standard_floor_structure:compatible_basement',
      'representative:residential_standard_floor_structure:compatible_standard_floor',
    ]))
    expect(residentialSelection?.eligibleCandidateIds).toEqual([
      'representative:residential_standard_floor_structure:compatible_standard_floor',
      'representative:residential_standard_floor_structure:compatible_basement',
    ])
    expect(residentialSelection?.rejectedReasonCodes).toEqual(expect.arrayContaining([
      'template_assembly_conflict',
      'priority_override_blocked',
    ]))
    expect(residentialSelection?.selectionRankSignals).toEqual(expect.arrayContaining([
      'template_assembly_compatibility_receipt',
      'selector_receipt_audit_trail',
      'standard_library_live_replay_trust_gate',
      'network_span_days',
    ]))
    expect(residentialSelection?.mutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    })

    expect(audit.scheduleReadinessGate.dimensions.breadth.checksPassed).toEqual(expect.arrayContaining([
      'representative_phase1_multinetwork_selection_coverage',
    ]))
    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('representative_phase1_multinetwork_selection_not_ready'),
    ]))
  })

  it('covers every representative scenario with a multi-network selector probe across business types and division families', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()
    const coverage = audit.representativePhase1MultiNetworkSelectionCoverage

    expect(coverage.readySelectionCount).toBe(audit.representativeScheduleScenarioCoverage.readyScenarioCount)
    expect(coverage.minimumSelectionCount).toBe(audit.representativeScheduleScenarioCoverage.minimumScenarioCount)
    expect(coverage.selections.map((selection) => selection.scenarioId).sort()).toEqual(
      audit.representativeScheduleScenarioCoverage.scenarios.map((scenario) => scenario.scenarioId).sort(),
    )

    const coveredBusinessTypes = new Set(coverage.selections.map((selection) => selection.businessTypeCode))
    const coveredDivisionFamilies = new Set(coverage.selections.map((selection) => selection.divisionFamily))

    expect(coveredBusinessTypes.size).toBeGreaterThanOrEqual(11)
    expect(Array.from(coveredBusinessTypes)).toEqual(expect.arrayContaining([
      'hospital',
      'data_center',
      'transportation_hub',
      'tod_upper_cover',
      'modular_building',
    ]))
    expect(coveredDivisionFamilies.size).toBeGreaterThanOrEqual(7)

    for (const selection of coverage.selections) {
      expect(selection.status, selection.selectionId).toBe('phase1_selection_ready')
      expect(selection.selectedCandidateId, selection.selectionId).toEqual(expect.any(String))
      expect(selection.candidateCount, selection.selectionId).toBeGreaterThanOrEqual(2)
      expect(selection.eligibleCandidateCount, selection.selectionId).toBeGreaterThanOrEqual(1)
      expect(selection.rejectedConflictCandidateCount, selection.selectionId).toBeGreaterThanOrEqual(1)
      expect(selection.rejectedReasonCodes, selection.selectionId).toEqual(expect.arrayContaining([
        'template_assembly_conflict',
      ]))
      expect(selection.trustGateEvidenceMode, selection.selectionId).toBe('representative_shadow_probe_not_release_evidence')
      expect(selection.linearPriorityCanOverrideAssemblyConflict, selection.selectionId).toBe(false)
      expect(selection.mutationBoundary, selection.selectionId).toEqual({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      })
    }
  })

  it('keeps every T2 template precise enough to drive a schedulable rhythm subgraph', () => {
    for (const template of T2_DIVISION_RHYTHM_TEMPLATE_SEED) {
      expect(template.tier, `${template.templateId} tier`).toBe('T2')
      expect(template.sourceType, `${template.templateId} source type`).toBe('system_standard_library')
      expect(template.governance.directRuntimeWrite, `${template.templateId} direct write`).toBe(false)
      expect(template.governance.autoPublish, `${template.templateId} auto publish`).toBe(false)
      expect(template.governance.governanceStatus, `${template.templateId} governance`).toBe('candidate_seeded')
      expect(template.applicability.businessTypeCodes.length, `${template.templateId} business type`).toBeGreaterThan(0)
      expect(template.applicability.divisionFamilies.length, `${template.templateId} division family`).toBeGreaterThan(0)
      expect(template.applicability.subdivisionFamilies.length, `${template.templateId} subdivision family`).toBeGreaterThanOrEqual(2)
      expect(template.rhythm.parentWindowDays.p50, `${template.templateId} p50`).toBeGreaterThan(0)
      expect(template.rhythm.parentWindowDays.p80, `${template.templateId} p80`).toBeGreaterThanOrEqual(template.rhythm.parentWindowDays.p50)
      expect(template.rhythm.workfaceUnit, `${template.templateId} workface unit`).toMatch(/building|floor|zone|section|system|workface|factory_lot|room|bay/)
      expect(template.rhythm.childWindows.length, `${template.templateId} child windows`).toBeGreaterThanOrEqual(6)
      expect(template.rhythm.childWindows.filter((window) => window.durationBearing).length, `${template.templateId} duration windows`).toBeGreaterThanOrEqual(4)
      expect(template.rhythm.childWindows.every((window) => (
        window.startDay >= 1
        && window.endDay >= window.startDay
        && window.endDay <= template.rhythm.parentWindowDays.p80
        && window.role
        && window.source === 't2_division_rhythm_template_seed'
      )), `${template.templateId} bounded child windows`).toBe(true)
      expect(template.hardGates.length, `${template.templateId} hard gates`).toBeGreaterThanOrEqual(2)
      expect(template.dependencyEdges.length, `${template.templateId} dependency edges`).toBeGreaterThanOrEqual(template.rhythm.childWindows.length - 1)
      expect(template.compatibility.requiredFacts.length, `${template.templateId} required facts`).toBeGreaterThanOrEqual(2)
      expect(template.compatibility.incompatibleAssumptions.length, `${template.templateId} incompatible assumptions`).toBeGreaterThanOrEqual(1)
      expect(template.calibration.requiredActualSignals.length, `${template.templateId} calibration signals`).toBeGreaterThanOrEqual(4)
    }
  })

  it('requires every T2 template to carry schedule-trust semantics and replay admission gates', () => {
    for (const template of T2_DIVISION_RHYTHM_TEMPLATE_SEED) {
      expect(template.scheduleTrust?.scheduleSemantics.criticalPathRoles.length, `${template.templateId} critical path roles`).toBeGreaterThanOrEqual(2)
      expect(template.scheduleTrust?.scheduleSemantics.durationDrivers.length, `${template.templateId} duration drivers`).toBeGreaterThanOrEqual(3)
      expect(template.scheduleTrust?.scheduleSemantics.workfaceReadinessSignals.length, `${template.templateId} readiness signals`).toBeGreaterThanOrEqual(2)
      expect(template.scheduleTrust?.scheduleSemantics.assemblyRiskTags.length, `${template.templateId} assembly risks`).toBeGreaterThanOrEqual(2)
      expect(template.scheduleTrust?.evidenceAnchors.standardLibraryAnchors.length, `${template.templateId} source anchors`).toBeGreaterThanOrEqual(3)
      expect(template.scheduleTrust?.evidenceAnchors.calibrationAnchors.length, `${template.templateId} calibration anchors`).toBeGreaterThanOrEqual(3)
      expect(template.scheduleTrust?.evidenceAnchors.replayAdmission.minimumComparableWorkfaceWindows, `${template.templateId} sample gate`).toBeGreaterThanOrEqual(12)
      expect(template.scheduleTrust?.evidenceAnchors.replayAdmission.p80CaptureThreshold, `${template.templateId} p80 gate`).toBeGreaterThanOrEqual(0.72)
      expect(template.scheduleTrust?.evidenceAnchors.replayAdmission.maxMedianAbsoluteErrorDays, `${template.templateId} mae gate`).toBeLessThanOrEqual(5)
    }
  })

  it('requires production feasibility assumptions before T2 rhythms can be trusted by real scheduling capacity checks', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    for (const template of T2_DIVISION_RHYTHM_TEMPLATE_SEED) {
      expect(template.productionFeasibility?.calendarBasis, `${template.templateId} calendar basis`).toBe('working_day')
      expect(template.productionFeasibility?.workfaceUnit, `${template.templateId} workface unit`).toBe(template.rhythm.workfaceUnit)
      expect(template.productionFeasibility?.minimumParallelWorkfaces, `${template.templateId} minimum workfaces`).toBeGreaterThanOrEqual(1)
      expect(template.productionFeasibility?.recommendedCrewStreams, `${template.templateId} crew streams`).toBeGreaterThanOrEqual(
        template.rhythm.overlapPolicy === 'sequential_with_controlled_overlap' ? 1 : 2,
      )
      expect(template.productionFeasibility?.resourceReadinessSignals.length, `${template.templateId} resource readiness`).toBeGreaterThanOrEqual(3)
      expect(template.productionFeasibility?.calendarConstraintSignals.length, `${template.templateId} calendar constraints`).toBeGreaterThanOrEqual(2)
      expect(template.productionFeasibility?.capacityRiskTags.length, `${template.templateId} capacity risk tags`).toBeGreaterThanOrEqual(2)
    }

    expect(audit.scheduleReadinessGate.dimensions.precision.checksPassed).toEqual(expect.arrayContaining([
      'production_feasibility_assumptions',
    ]))
    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('missing_production_feasibility'),
      expect.stringContaining('weak_resource_capacity_contract'),
      expect.stringContaining('weak_calendar_constraint_contract'),
    ]))

    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
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
    })

    expect(candidatePackage.productionFeasibilitySummaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
        calendarBasis: 'working_day',
        workfaceUnit: 'floor',
        resourceReadinessSignals: expect.arrayContaining([
          'workface_unit:floor',
        ]),
      }),
    ]))
  })

  it('keeps duration-bearing child windows scaled to the parent rhythm instead of collapsing long T2 templates into tiny task fragments', () => {
    for (const template of T2_DIVISION_RHYTHM_TEMPLATE_SEED) {
      const durationBearingWindows = template.rhythm.childWindows.filter((window) => window.durationBearing)
      const durationBearingTotal = durationBearingWindows.reduce((sum, window) => sum + window.durationDays, 0)
      const firstDurationBearingStart = Math.min(...durationBearingWindows.map((window) => window.startDay))
      const lastDurationBearingFinish = Math.max(...durationBearingWindows.map((window) => window.endDay))
      const durationBearingCalendarSpan = lastDurationBearingFinish - firstDurationBearingStart + 1

      expect(durationBearingTotal, `${template.templateId} duration-bearing total`).toBeGreaterThanOrEqual(
        Math.ceil(template.rhythm.parentWindowDays.p50 * 0.7),
      )
      expect(durationBearingCalendarSpan, `${template.templateId} duration-bearing calendar span`).toBeGreaterThanOrEqual(
        Math.ceil(template.rhythm.parentWindowDays.p50 * 0.6),
      )
      expect(durationBearingWindows.every((window) => window.durationDays >= 1), `${template.templateId} positive child durations`).toBe(true)
    }
  })

  it('requires parent P20/P50/P80 quantile envelopes before T2 rhythms can be trusted as standard-library schedule priors', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    for (const template of T2_DIVISION_RHYTHM_TEMPLATE_SEED) {
      const { p20, p50, p80 } = template.rhythm.parentWindowDays
      const uncertaintyBandDays = p80 - p20
      const minimumUncertaintyBandDays = Math.max(2, Math.ceil(p50 * 0.15))

      expect(p20, `${template.templateId} p20`).toBeGreaterThan(0)
      expect(p50, `${template.templateId} p50`).toBeGreaterThanOrEqual(p20)
      expect(p80, `${template.templateId} p80`).toBeGreaterThanOrEqual(p50)
      expect(uncertaintyBandDays, `${template.templateId} p80-p20 band`).toBeGreaterThanOrEqual(minimumUncertaintyBandDays)
    }

    expect(audit.scheduleReadinessGate.dimensions.precision.checksPassed).toEqual(expect.arrayContaining([
      'parent_quantile_envelope',
    ]))
    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('invalid_parent_quantile_envelope'),
      expect.stringContaining('weak_parent_quantile_uncertainty_band'),
    ]))
  })

  it('requires dependency edges to form a clean acyclic template graph before schedule-network assembly', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    for (const template of T2_DIVISION_RHYTHM_TEMPLATE_SEED) {
      const windowCodes = new Set(template.rhythm.childWindows.map((window) => window.windowCode))
      const edgeKeys = new Set<string>()
      const adjacency = new Map<string, string[]>()

      for (const edge of template.dependencyEdges) {
        const edgeKey = `${edge.predecessorWindowCode}->${edge.successorWindowCode}:${edge.relation}:${edge.lagDays}`

        expect(windowCodes.has(edge.predecessorWindowCode), `${template.templateId} predecessor endpoint`).toBe(true)
        expect(windowCodes.has(edge.successorWindowCode), `${template.templateId} successor endpoint`).toBe(true)
        expect(edge.successorWindowCode, `${template.templateId} no self-loop`).not.toBe(edge.predecessorWindowCode)
        expect(edgeKeys.has(edgeKey), `${template.templateId} duplicate dependency edge`).toBe(false)

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

      expect([...windowCodes].some((windowCode) => hasCycle(windowCode)), `${template.templateId} dependency cycle`).toBe(false)
    }

    expect(audit.scheduleReadinessGate.dimensions.precision.checksPassed).toEqual(expect.arrayContaining([
      'dependency_graph_integrity',
    ]))
    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('dependency_edge_unknown_endpoint'),
      expect.stringContaining('dependency_edge_self_loop'),
      expect.stringContaining('duplicate_dependency_edge'),
      expect.stringContaining('dependency_graph_cycle'),
    ]))
  })

  it('requires lag and mandatory-wait edge semantics before T2 dependency candidates can drive CPM assembly', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    for (const template of T2_DIVISION_RHYTHM_TEMPLATE_SEED) {
      const mandatoryWaitEdges = template.dependencyEdges.filter((edge) => (
        edge.mandatory
        && ['handover_gate', 'readiness_gate', 'quality_gate'].includes(edge.edgeType)
      ))
      const controlledOverlapEdges = template.dependencyEdges.filter((edge) => edge.relation === 'SS')

      expect(mandatoryWaitEdges.length, `${template.templateId} mandatory wait edges`).toBeGreaterThanOrEqual(1)
      expect(controlledOverlapEdges.length, `${template.templateId} controlled overlap edges`).toBeGreaterThanOrEqual(1)

      for (const edge of template.dependencyEdges) {
        expect(edge.lagDays, `${template.templateId} ${edge.edgeCode} non-negative lag`).toBeGreaterThanOrEqual(0)

        if (edge.edgeType === 'rhythm_sequence') {
          expect(['FS', 'SS']).toContain(edge.relation)
          if (edge.relation === 'SS') {
            expect(edge.lagDays, `${template.templateId} ${edge.edgeCode} SS controlled lag`).toBeGreaterThan(0)
            expect(edge.mandatory, `${template.templateId} ${edge.edgeCode} SS not mandatory wait`).toBe(false)
          }
        } else {
          expect(edge.mandatory, `${template.templateId} ${edge.edgeCode} gate edge mandatory`).toBe(true)
          expect(edge.relation, `${template.templateId} ${edge.edgeCode} gate edge FS`).toBe('FS')
          expect(edge.lagDays, `${template.templateId} ${edge.edgeCode} gate edge zero lag`).toBe(0)
        }
      }
    }

    expect(audit.scheduleReadinessGate.dimensions.precision.checksPassed).toEqual(expect.arrayContaining([
      'lag_and_mandatory_wait_semantics',
    ]))
    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('missing_mandatory_wait_edge'),
      expect.stringContaining('missing_controlled_overlap_edge'),
      expect.stringContaining('invalid_dependency_lag'),
      expect.stringContaining('invalid_rhythm_sequence_relation'),
      expect.stringContaining('invalid_controlled_overlap_lag'),
      expect.stringContaining('invalid_mandatory_wait_edge'),
    ]))
  })

  it('requires every hard gate to be anchored to a dependency-constrained child window', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()
    const normalizeLabel = (value: string) => value.toLowerCase().replace(/[_\s-]+/g, '')

    for (const template of T2_DIVISION_RHYTHM_TEMPLATE_SEED) {
      const childWindowsByLabel = new Map(
        template.rhythm.childWindows.map((window) => [normalizeLabel(window.label), window]),
      )
      const mandatoryGateAnchoredWindowCodes = new Set(
        template.dependencyEdges
          .filter((edge) => edge.mandatory && ['handover_gate', 'readiness_gate', 'quality_gate'].includes(edge.edgeType))
          .flatMap((edge) => [edge.predecessorWindowCode, edge.successorWindowCode]),
      )

      for (const gate of template.hardGates) {
        expect(gate.blocksAutomaticMaterialization, `${template.templateId} ${gate.gateCode} blocks materialization`).toBe(true)

        const matchedWindow = childWindowsByLabel.get(normalizeLabel(gate.label))
        expect(matchedWindow, `${template.templateId} ${gate.gateCode} child-window anchor`).toBeDefined()
        expect(
          mandatoryGateAnchoredWindowCodes.has(matchedWindow?.windowCode ?? ''),
          `${template.templateId} ${gate.gateCode} dependency-constrained anchor`,
        ).toBe(true)
      }
    }

    expect(audit.scheduleReadinessGate.dimensions.precision.checksPassed).toEqual(expect.arrayContaining([
      'hard_gate_dependency_anchors',
    ]))
    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('hard_gate_window_anchor_missing'),
      expect.stringContaining('hard_gate_dependency_anchor_missing'),
      expect.stringContaining('hard_gate_materialization_not_blocked'),
    ]))
  })

  it('exposes replay acceptance policy as the standard-library trust boundary', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    expect(audit.replayAcceptancePolicy).toEqual(expect.objectContaining({
      status: 'actual_replay_required_before_publish',
      minimumSampleCount: 12,
      minimumComparableWorkfaceWindowCount: 12,
      minimumP80CaptureRate: 0.72,
      maximumDependencyViolationRate: 0.05,
      directSeedMutationAllowed: false,
      autoPublishAllowed: false,
      writesPlanDates: false,
      writesTaskDependencies: false,
    }))
  })

  it('audits representative replay fixtures before trusting T2 depth for shadow scheduling', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    expect(audit.representativeReplayFixtureCoverage.status).toBe('ready')
    expect(audit.representativeReplayFixtureCoverage.readyFixtureCount).toBe(
      audit.representativeScheduleScenarioCoverage.minimumScenarioCount,
    )
    expect(audit.representativeReplayFixtureCoverage.fixtures.map((fixture) => fixture.scenarioId)).toEqual(
      audit.representativeScheduleScenarioCoverage.scenarios.map((scenario) => scenario.scenarioId),
    )

    for (const fixture of audit.representativeReplayFixtureCoverage.fixtures) {
      expect(fixture.status, fixture.scenarioId).toBe('shadow_candidate')
      expect(fixture.readyForShadow, fixture.scenarioId).toBe(true)
      expect(fixture.readyForPublish, fixture.scenarioId).toBe(false)
      expect(fixture.sampleCount, fixture.scenarioId).toBeGreaterThanOrEqual(audit.replayAcceptancePolicy.minimumSampleCount)
      expect(fixture.comparableWorkfaceWindowCount, fixture.scenarioId).toBeGreaterThanOrEqual(
        audit.replayAcceptancePolicy.minimumComparableWorkfaceWindowCount,
      )
      expect(fixture.p80CaptureRate, fixture.scenarioId).toBeGreaterThanOrEqual(audit.replayAcceptancePolicy.minimumP80CaptureRate)
      expect(fixture.medianAbsoluteErrorDays, fixture.scenarioId).toBeLessThanOrEqual(
        audit.replayAcceptancePolicy.maximumMedianAbsoluteErrorDays,
      )
      expect(fixture.gateSlipMedianDays, fixture.scenarioId).toBeLessThanOrEqual(
        audit.replayAcceptancePolicy.maximumGateSlipMedianDays,
      )
      expect(fixture.dependencyViolationRate, fixture.scenarioId).toBeLessThanOrEqual(
        audit.replayAcceptancePolicy.maximumDependencyViolationRate,
      )
      expect(fixture.evidenceRefCount, fixture.scenarioId).toBeGreaterThanOrEqual(audit.replayAcceptancePolicy.minimumSampleCount)
      expect(fixture.sampleQualityIssueCount, fixture.scenarioId).toBe(0)
      expect(fixture.criticalWindowCodes.length, fixture.scenarioId).toBeGreaterThanOrEqual(1)
      expect(fixture.replayCoveredWindowCodes, fixture.scenarioId).toEqual(expect.arrayContaining(fixture.criticalWindowCodes))
      expect(fixture.missingCriticalWindowCodes, fixture.scenarioId).toEqual([])
      expect(fixture.governance, fixture.scenarioId).toEqual(expect.objectContaining({
        directSeedMutationAllowed: false,
        writesPlanDates: false,
        writesTaskDependencies: false,
        requiresL5Publication: true,
      }))
    }

    expect(audit.scheduleReadinessGate.dimensions.depth.checksPassed).toEqual(expect.arrayContaining([
      'representative_replay_fixtures',
      'critical_window_replay_coverage',
    ]))
    expect(audit.scheduleReadinessGate.dimensions.depth.representativeReplayFixtureCount).toBe(
      audit.representativeScheduleScenarioCoverage.minimumScenarioCount,
    )
    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('representative_replay_fixture_not_ready'),
    ]))
  })

  it('cross-checks phase-1 critical windows against replay coverage before trusting T2 depth', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()
    const phase1CriticalByScenarioId = new Map(
      audit.representativePhase1EvaluationCoverage.evaluations.map((evaluation) => [
        evaluation.scenarioId,
        evaluation.criticalWindowCodes,
      ]),
    )

    for (const fixture of audit.representativeReplayFixtureCoverage.fixtures) {
      const phase1CriticalWindowCodes = phase1CriticalByScenarioId.get(fixture.scenarioId)

      expect(phase1CriticalWindowCodes, `${fixture.scenarioId} phase-1 critical windows`).toBeDefined()
      expect(fixture.criticalWindowCodes, `${fixture.scenarioId} fixture critical windows`).toEqual(phase1CriticalWindowCodes)
      expect(fixture.replayCoveredWindowCodes, `${fixture.scenarioId} replay covers phase-1 critical windows`).toEqual(
        expect.arrayContaining(phase1CriticalWindowCodes ?? []),
      )
      expect(fixture.missingCriticalWindowCodes, `${fixture.scenarioId} missing phase-1 critical windows`).toEqual([])
    }

    expect(audit.scheduleReadinessGate.dimensions.depth.checksPassed).toEqual(expect.arrayContaining([
      'phase1_critical_window_replay_crosscheck',
    ]))
    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('phase1_replay_fixture_missing'),
      expect.stringContaining('phase1_critical_window_mismatch'),
      expect.stringContaining('phase1_critical_window_replay_missing'),
    ]))
  })

  it('requires representative replay fixtures to include controlled actual variance before trusting T2 depth', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    for (const fixture of audit.representativeReplayFixtureCoverage.fixtures) {
      expect(fixture.distinctWorkfaceCount, `${fixture.scenarioId} workface diversity`).toBeGreaterThanOrEqual(3)
      expect(fixture.nonZeroAbsoluteErrorSampleCount, `${fixture.scenarioId} actual variance`).toBeGreaterThanOrEqual(3)
      expect(fixture.earlyFinishSampleCount, `${fixture.scenarioId} early finishes`).toBeGreaterThanOrEqual(1)
      expect(fixture.delayedFinishSampleCount, `${fixture.scenarioId} delayed finishes`).toBeGreaterThanOrEqual(1)
      expect(fixture.maximumAbsoluteErrorDays, `${fixture.scenarioId} controlled variance`).toBeLessThanOrEqual(
        audit.replayAcceptancePolicy.maximumMedianAbsoluteErrorDays,
      )
      expect(fixture.status, `${fixture.scenarioId} still shadow-ready`).toBe('shadow_candidate')
    }

    expect(audit.scheduleReadinessGate.dimensions.depth.checksPassed).toEqual(expect.arrayContaining([
      'controlled_actual_variance_replay_fixtures',
    ]))
    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('representative_replay_fixture_missing_workface_diversity'),
      expect.stringContaining('representative_replay_fixture_missing_actual_variance'),
      expect.stringContaining('representative_replay_fixture_variance_out_of_control'),
    ]))
  })

  it('requires every phase-1 critical window to have replay depth before trusting T2 depth', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    for (const fixture of audit.representativeReplayFixtureCoverage.fixtures) {
      expect(
        fixture.criticalWindowReplayDepth.map((row) => row.windowCode),
        `${fixture.scenarioId} critical window replay rows`,
      ).toEqual(fixture.criticalWindowCodes)
      expect(fixture.underSampledCriticalWindowCodes, `${fixture.scenarioId} critical sample depth`).toEqual([])
      expect(fixture.lowDiversityCriticalWindowCodes, `${fixture.scenarioId} critical workface diversity`).toEqual([])
      expect(fixture.flatVarianceCriticalWindowCodes, `${fixture.scenarioId} critical variance`).toEqual([])
      expect(fixture.singleSidedGateSlipCriticalWindowCodes, `${fixture.scenarioId} critical bidirectional gate slip`).toEqual([])
      expect(fixture.outOfControlCriticalWindowCodes, `${fixture.scenarioId} critical variance control`).toEqual([])

      for (const row of fixture.criticalWindowReplayDepth) {
        expect(row.status, `${fixture.scenarioId}:${row.windowCode}`).toBe('ready')
        expect(row.sampleCount, `${fixture.scenarioId}:${row.windowCode} sample depth`).toBeGreaterThanOrEqual(2)
        expect(row.distinctWorkfaceCount, `${fixture.scenarioId}:${row.windowCode} workfaces`).toBeGreaterThanOrEqual(2)
        expect(row.nonZeroAbsoluteErrorSampleCount, `${fixture.scenarioId}:${row.windowCode} variance`).toBeGreaterThanOrEqual(1)
        expect(row.earlyFinishSampleCount, `${fixture.scenarioId}:${row.windowCode} early gate slips`).toBeGreaterThanOrEqual(1)
        expect(row.delayedFinishSampleCount, `${fixture.scenarioId}:${row.windowCode} delayed gate slips`).toBeGreaterThanOrEqual(1)
        expect(row.maximumAbsoluteErrorDays, `${fixture.scenarioId}:${row.windowCode} variance control`).toBeLessThanOrEqual(
          audit.replayAcceptancePolicy.maximumMedianAbsoluteErrorDays,
        )
      }
    }

    expect(audit.scheduleReadinessGate.dimensions.depth.checksPassed).toEqual(expect.arrayContaining([
      'critical_window_replay_depth',
    ]))
    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('representative_replay_fixture_critical_window_depth_missing'),
      expect.stringContaining('representative_replay_fixture_critical_window_workface_diversity_missing'),
      expect.stringContaining('representative_replay_fixture_critical_window_actual_variance_missing'),
      expect.stringContaining('representative_replay_fixture_critical_window_bidirectional_gate_slip_missing'),
      expect.stringContaining('representative_replay_fixture_critical_window_variance_out_of_control'),
    ]))
  })

  it('requires every hard gate and mandatory-wait window to have replay depth before trusting T2 depth', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    for (const fixture of audit.representativeReplayFixtureCoverage.fixtures) {
      const gateFixture = fixture as typeof fixture & {
        gateWindowCodes?: string[]
        gateWindowReplayDepth?: typeof fixture.criticalWindowReplayDepth
        missingGateWindowCodes?: string[]
        underSampledGateWindowCodes?: string[]
        lowDiversityGateWindowCodes?: string[]
        flatVarianceGateWindowCodes?: string[]
        singleSidedGateSlipGateWindowCodes?: string[]
        outOfControlGateWindowCodes?: string[]
      }

      expect(gateFixture.gateWindowCodes, `${fixture.scenarioId} gate window codes`).toBeDefined()
      expect(gateFixture.gateWindowCodes?.length, `${fixture.scenarioId} gate window count`).toBeGreaterThanOrEqual(1)
      expect(
        gateFixture.gateWindowReplayDepth?.map((row) => row.windowCode),
        `${fixture.scenarioId} gate window replay rows`,
      ).toEqual(gateFixture.gateWindowCodes)
      expect(gateFixture.missingGateWindowCodes, `${fixture.scenarioId} missing gate windows`).toEqual([])
      expect(gateFixture.underSampledGateWindowCodes, `${fixture.scenarioId} gate sample depth`).toEqual([])
      expect(gateFixture.lowDiversityGateWindowCodes, `${fixture.scenarioId} gate workface diversity`).toEqual([])
      expect(gateFixture.flatVarianceGateWindowCodes, `${fixture.scenarioId} gate variance`).toEqual([])
      expect(gateFixture.singleSidedGateSlipGateWindowCodes, `${fixture.scenarioId} gate bidirectional slip`).toEqual([])
      expect(gateFixture.outOfControlGateWindowCodes, `${fixture.scenarioId} gate variance control`).toEqual([])

      for (const row of gateFixture.gateWindowReplayDepth ?? []) {
        expect(row.status, `${fixture.scenarioId}:${row.windowCode}`).toBe('ready')
        expect(row.sampleCount, `${fixture.scenarioId}:${row.windowCode} sample depth`).toBeGreaterThanOrEqual(2)
        expect(row.distinctWorkfaceCount, `${fixture.scenarioId}:${row.windowCode} workfaces`).toBeGreaterThanOrEqual(2)
        expect(row.nonZeroAbsoluteErrorSampleCount, `${fixture.scenarioId}:${row.windowCode} variance`).toBeGreaterThanOrEqual(1)
        expect(row.earlyFinishSampleCount, `${fixture.scenarioId}:${row.windowCode} early gate slips`).toBeGreaterThanOrEqual(1)
        expect(row.delayedFinishSampleCount, `${fixture.scenarioId}:${row.windowCode} delayed gate slips`).toBeGreaterThanOrEqual(1)
        expect(row.maximumAbsoluteErrorDays, `${fixture.scenarioId}:${row.windowCode} variance control`).toBeLessThanOrEqual(
          audit.replayAcceptancePolicy.maximumMedianAbsoluteErrorDays,
        )
      }
    }

    expect(audit.scheduleReadinessGate.dimensions.depth.checksPassed).toEqual(expect.arrayContaining([
      'gate_window_replay_depth',
    ]))
    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('representative_replay_fixture_gate_window_depth_missing'),
      expect.stringContaining('representative_replay_fixture_gate_window_workface_diversity_missing'),
      expect.stringContaining('representative_replay_fixture_gate_window_actual_variance_missing'),
      expect.stringContaining('representative_replay_fixture_gate_window_bidirectional_gate_slip_missing'),
      expect.stringContaining('representative_replay_fixture_gate_window_variance_out_of_control'),
    ]))
  })

  it('exposes a per-business-type representative evidence matrix before standard-library breadth can be trusted', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()
    const requiredBusinessTypes = [
      'general_civil',
      'residential',
      'commercial',
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
    ]

    expect(audit.businessTypeRepresentativeEvidenceMatrix.map((row) => row.businessTypeCode)).toEqual(requiredBusinessTypes)
    expect(audit.scheduleReadinessGate.dimensions.breadth.readyBusinessTypeRepresentativeEvidenceCount).toBe(requiredBusinessTypes.length)
    expect(audit.scheduleReadinessGate.dimensions.breadth.checksPassed).toEqual(expect.arrayContaining([
      'business_type_representative_evidence_matrix',
    ]))

    for (const row of audit.businessTypeRepresentativeEvidenceMatrix) {
      expect(row.status, row.businessTypeCode).toBe('ready')
      expect(row.businessTypeProfileStatus, row.businessTypeCode).toBe('ready')
      expect(row.representativeScheduleScenarioStatus, row.businessTypeCode).toBe('schedulable_candidate')
      expect(row.phase1EvaluationStatus, row.businessTypeCode).toBe('phase1_readonly_evaluation_ready')
      expect(row.replayFixtureStatus, row.businessTypeCode).toBe('shadow_candidate')
      expect(row.representativeScenarioId, row.businessTypeCode).toMatch(new RegExp(row.businessTypeCode.replace(/_/g, '|')))
      expect(row.selectedTemplateIds.length, row.businessTypeCode).toBeGreaterThanOrEqual(1)
      expect(row.canEnterC1913Phase1Selection, row.businessTypeCode).toBe(true)
      expect(row.readyForShadow, row.businessTypeCode).toBe(true)
      expect(row.missingEvidenceCodes, row.businessTypeCode).toEqual([])
      expect(row.mutationBoundary, row.businessTypeCode).toEqual({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        requiresL5Publication: true,
      })
    }

    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('business_type_representative_evidence_not_ready'),
    ]))
  })

  it('exposes a per-division-family representative evidence matrix before standard-library breadth can be trusted', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()
    const requiredDivisionFamilies = [
      'foundation_and_basement',
      'superstructure',
      'envelope_facade_roof',
      'mep_systems',
      'decoration_fitout',
      'outdoor_municipal_landscape',
      'commissioning_handover',
      'specialty_business_systems',
    ]

    expect(audit.divisionFamilyRepresentativeEvidenceMatrix.map((row) => row.divisionFamily)).toEqual(requiredDivisionFamilies)
    expect(audit.scheduleReadinessGate.dimensions.breadth.readyDivisionFamilyRepresentativeEvidenceCount).toBe(requiredDivisionFamilies.length)
    expect(audit.scheduleReadinessGate.dimensions.breadth.checksPassed).toEqual(expect.arrayContaining([
      'division_family_representative_evidence_matrix',
    ]))

    for (const row of audit.divisionFamilyRepresentativeEvidenceMatrix) {
      expect(row.status, row.divisionFamily).toBe('ready')
      expect(row.representativeScheduleScenarioStatus, row.divisionFamily).toBe('schedulable_candidate')
      expect(row.phase1EvaluationStatus, row.divisionFamily).toBe('phase1_readonly_evaluation_ready')
      expect(row.replayFixtureStatus, row.divisionFamily).toBe('shadow_candidate')
      expect(row.representativeScenarioId, row.divisionFamily).toEqual(expect.any(String))
      expect(row.selectedTemplateIds.length, row.divisionFamily).toBeGreaterThanOrEqual(1)
      expect(row.canEnterC1913Phase1Selection, row.divisionFamily).toBe(true)
      expect(row.readyForShadow, row.divisionFamily).toBe(true)
      expect(row.missingEvidenceCodes, row.divisionFamily).toEqual([])
      expect(row.mutationBoundary, row.divisionFamily).toEqual({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        requiresL5Publication: true,
      })
    }

    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('division_family_representative_evidence_not_ready'),
    ]))
  })

  it('exposes a per-template representative evidence matrix before every T2 seed can be trusted by real scheduling', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()
    const templateIds = T2_DIVISION_RHYTHM_TEMPLATE_SEED.map((template) => template.templateId)

    expect(audit.templateRepresentativeEvidenceMatrix.map((row) => row.templateId)).toEqual(templateIds)
    expect(audit.scheduleReadinessGate.dimensions.breadth.readyTemplateRepresentativeEvidenceCount).toBe(templateIds.length)
    expect(audit.scheduleReadinessGate.dimensions.breadth.checksPassed).toEqual(expect.arrayContaining([
      'template_representative_evidence_matrix',
    ]))

    for (const row of audit.templateRepresentativeEvidenceMatrix) {
      expect(row.status, row.templateId).toBe('ready')
      expect(row.representativeScheduleScenarioStatus, row.templateId).toBe('schedulable_candidate')
      expect(row.phase1EvaluationStatus, row.templateId).toBe('phase1_readonly_evaluation_ready')
      expect(row.replayFixtureStatus, row.templateId).toBe('shadow_candidate')
      expect(row.representativeScenarioIds.length, row.templateId).toBeGreaterThanOrEqual(1)
      expect(row.canEnterC1913Phase1Selection, row.templateId).toBe(true)
      expect(row.readyForShadow, row.templateId).toBe(true)
      expect(row.missingEvidenceCodes, row.templateId).toEqual([])
      expect(row.mutationBoundary, row.templateId).toEqual({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        requiresL5Publication: true,
      })
    }

    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('template_representative_evidence_not_ready'),
    ]))
  })

  it('exposes a per-phase-window representative evidence matrix before phase-window matching can be trusted by real scheduling', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()
    const phaseWindows = Array.from(new Set(
      T2_DIVISION_RHYTHM_TEMPLATE_SEED.flatMap((template) => template.applicability.phaseWindows),
    )).sort((left, right) => left.localeCompare(right))

    expect(audit.phaseWindowRepresentativeEvidenceMatrix.map((row) => row.phaseWindow)).toEqual(phaseWindows)
    expect(audit.scheduleReadinessGate.dimensions.breadth.readyPhaseWindowRepresentativeEvidenceCount).toBe(phaseWindows.length)
    expect(audit.scheduleReadinessGate.dimensions.breadth.checksPassed).toEqual(expect.arrayContaining([
      'phase_window_representative_evidence_matrix',
    ]))

    for (const row of audit.phaseWindowRepresentativeEvidenceMatrix) {
      expect(row.status, row.phaseWindow).toBe('ready')
      expect(row.representativeScheduleScenarioStatus, row.phaseWindow).toBe('schedulable_candidate')
      expect(row.phase1EvaluationStatus, row.phaseWindow).toBe('phase1_readonly_evaluation_ready')
      expect(row.replayFixtureStatus, row.phaseWindow).toBe('shadow_candidate')
      expect(row.representativeScenarioIds.length, row.phaseWindow).toBeGreaterThanOrEqual(1)
      expect(row.selectedTemplateIds.length, row.phaseWindow).toBeGreaterThanOrEqual(1)
      expect(row.canEnterC1913Phase1Selection, row.phaseWindow).toBe(true)
      expect(row.readyForShadow, row.phaseWindow).toBe(true)
      expect(row.missingEvidenceCodes, row.phaseWindow).toEqual([])
      expect(row.mutationBoundary, row.phaseWindow).toEqual({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        requiresL5Publication: true,
      })
    }

    expect(audit.blockingDefects).not.toEqual(expect.arrayContaining([
      expect.stringContaining('phase_window_representative_evidence_not_ready'),
    ]))
  })

  it('summarizes precision breadth and depth gates before T2 can be trusted by real scheduling', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    expect(audit.scheduleReadinessGate).toEqual(expect.objectContaining({
      status: 'shadow_candidate_ready_not_publishable',
      canEnterC1913Phase1Selection: true,
      canAutoMaterializeTaskDependencies: false,
      canAutoPublishRuntimeExperience: false,
      trustBoundary: 'candidate_network_and_replay_shadow_only',
    }))
    expect(audit.scheduleReadinessGate.dimensions).toEqual(expect.objectContaining({
      precision: expect.objectContaining({
        status: 'ready',
        checksPassed: expect.arrayContaining([
          'child_window_bounds',
          'duration_bearing_windows',
          'duration_window_scale',
          'dependency_edges',
          'hard_gates',
          'required_facts',
          'schedule_semantics',
        ]),
        blockingDefects: [],
      }),
      breadth: expect.objectContaining({
        status: 'ready',
        minimumTemplateCount: 16,
        minimumBusinessTypeCount: 13,
        minimumDivisionFamilyCount: 8,
        minimumSubdivisionFamilyCount: 36,
        readyBusinessTypeProfileCount: audit.businessTypeProfiles.length,
        readyBusinessTypeRepresentativeEvidenceCount: audit.businessTypeRepresentativeEvidenceMatrix.length,
        readyDivisionFamilyRepresentativeEvidenceCount: 8,
        blockingDefects: [],
      }),
      depth: expect.objectContaining({
        status: 'ready',
        checksPassed: expect.arrayContaining([
          'actual_signal_contract',
          'replay_metric_contract',
          'standard_library_anchors',
          'calibration_anchors',
          'replay_admission_thresholds',
          'no_runtime_write_governance',
        ]),
        blockingDefects: [],
      }),
    }))
    expect(audit.scheduleReadinessGate.releaseBlockers).toEqual(expect.arrayContaining([
      'archived_live_replay_required',
      'l5_canary_publish_rollback_required',
      'c19_13_phase1_multinetwork_selection_required',
    ]))
  })

  it('removes only the archived/live replay blocker when a passing live replay trust gate is attached', () => {
    const liveReplayTrustGate = buildPassingLiveReplayTrustGate()

    const audit = auditT2DivisionRhythmTemplateRegistry({
      liveReplayTrustGate,
    })

    expect(audit.scheduleReadinessGate.liveReplayTrustGate).toEqual(expect.objectContaining({
      status: 'shadow_replay_ready_not_publishable',
      canTrustForRealScheduleCalibration: true,
      trustBoundary: 'archived_live_shadow_replay_only',
    }))
    expect(audit.scheduleReadinessGate.releaseBlockers).not.toContain('archived_live_replay_required')
    expect(audit.scheduleReadinessGate.releaseBlockers).toEqual(expect.arrayContaining([
      'l5_canary_publish_rollback_required',
      'c19_13_phase1_multinetwork_selection_required',
      'manual_publication_approval_required',
    ]))
    expect(audit.scheduleReadinessGate.canAutoMaterializeTaskDependencies).toBe(false)
    expect(audit.scheduleReadinessGate.canAutoPublishRuntimeExperience).toBe(false)
  })

  it('keeps representative multi-network selector probes separate from the C-19.13 release trust gate', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()

    expect(audit.representativePhase1MultiNetworkSelectionCoverage).toEqual(expect.objectContaining({
      status: 'ready',
      readySelectionCount: 15,
      minimumSelectionCount: 15,
    }))
    expect(audit.scheduleReadinessGate.phase1MultiNetworkSelectionTrustGate).toBeNull()
    expect(audit.scheduleReadinessGate.releaseBlockers).toContain('c19_13_phase1_multinetwork_selection_required')
    expect(audit.scheduleReadinessGate.canAutoMaterializeTaskDependencies).toBe(false)
    expect(audit.scheduleReadinessGate.canAutoPublishRuntimeExperience).toBe(false)
  })

  it('removes only the C-19.13 multi-network selector blocker when archived phase-1 selector replay evidence is attached', () => {
    const phase1MultiNetworkSelectionTrustGate = buildPassingPhase1MultiNetworkSelectionTrustGate()

    const audit = auditT2DivisionRhythmTemplateRegistry({
      phase1MultiNetworkSelectionTrustGate,
    })

    expect(audit.scheduleReadinessGate.phase1MultiNetworkSelectionTrustGate).toEqual(expect.objectContaining({
      status: 'phase1_multinetwork_selection_ready_not_publishable',
      canTrustForRealScheduleSelection: true,
      trustBoundary: 'archived_phase1_selector_replay_only',
      readySelectionCount: 15,
      minimumSelectionCount: 15,
    }))
    expect(audit.scheduleReadinessGate.releaseBlockers).not.toContain('c19_13_phase1_multinetwork_selection_required')
    expect(audit.scheduleReadinessGate.releaseBlockers).toEqual(expect.arrayContaining([
      'archived_live_replay_required',
      'l5_canary_publish_rollback_required',
    ]))
    expect(audit.scheduleReadinessGate.canAutoMaterializeTaskDependencies).toBe(false)
    expect(audit.scheduleReadinessGate.canAutoPublishRuntimeExperience).toBe(false)
  })

  it('removes only the L5 canary blocker when structured L5 handoff evidence is attached', () => {
    const l5ReleaseGate = buildPassingL5CanaryHandoffGate()

    const audit = auditT2DivisionRhythmTemplateRegistry({
      l5ReleaseGate,
    })

    expect(audit.scheduleReadinessGate.l5ReleaseGate).toEqual(expect.objectContaining({
      status: 'l5_canary_handoff_ready',
      canEnterCanary: true,
      canPublishRuntimeExperience: false,
      canMaterializeTaskDependencies: false,
      canWritePlanDates: false,
      canAutoPublishRuntimeExperience: false,
    }))
    expect(audit.scheduleReadinessGate.l5ReleaseGate?.releasePackage).toEqual(expect.objectContaining({
      packageType: 't2_standard_library_canary_handoff',
      releaseMode: 'canary_only',
    }))
    expect(audit.scheduleReadinessGate.releaseBlockers).not.toContain('l5_canary_publish_rollback_required')
    expect(audit.scheduleReadinessGate.releaseBlockers).toEqual(expect.arrayContaining([
      'archived_live_replay_required',
      'c19_13_phase1_multinetwork_selection_required',
      'manual_promotion_after_canary_required',
      'domain_writer_runtime_publication_required',
    ]))
    expect(audit.scheduleReadinessGate.canAutoMaterializeTaskDependencies).toBe(false)
    expect(audit.scheduleReadinessGate.canAutoPublishRuntimeExperience).toBe(false)
  })

  it('carries attached live replay trust evidence into schedule candidate package readiness', () => {
    const liveReplayTrustGate = buildPassingLiveReplayTrustGate()
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      liveReplayTrustGate,
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
    })

    expect(candidatePackage.standardLibraryReadiness.liveReplayTrustGate).toEqual(expect.objectContaining({
      status: 'shadow_replay_ready_not_publishable',
      canTrustForRealScheduleCalibration: true,
      trustBoundary: 'archived_live_shadow_replay_only',
    }))
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).not.toContain('archived_live_replay_required')
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).toEqual(expect.arrayContaining([
      'l5_canary_publish_rollback_required',
      'c19_13_phase1_multinetwork_selection_required',
      'manual_publication_approval_required',
    ]))
    expect(candidatePackage.standardLibraryReadiness.canAutoMaterializeTaskDependencies).toBe(false)
    expect(candidatePackage.standardLibraryReadiness.canAutoPublishRuntimeExperience).toBe(false)
  })

  it('does not reuse live replay trust evidence for a different selected T2 template set', () => {
    const liveReplayTrustGate = {
      ...buildPassingLiveReplayTrustGate(),
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
    }
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      liveReplayTrustGate,
      selection: {
        businessTypeCode: 'hospital',
        phaseWindow: 'commissioning',
        divisionFamily: 'specialty_business_systems',
        subdivisionFamily: 'clinical_system_validation',
        methodVariantCodes: ['iso_cleanroom'],
        scopeDimensions: ['zone', 'system'],
      },
      facts: {
        hasCleanroomScope: true,
        hasMedicalGasInterface: true,
      },
      organizationAssumptions: ['cleanroom_after_envelope_and_core_mep_ready'],
      selectedWorkfaceUnits: ['zone'],
    })

    expect(candidatePackage.selectedTemplateIds).toContain('t2-hospital-cleanroom-medical-system-commissioning-v1')
    expect(candidatePackage.standardLibraryReadiness.liveReplayTrustGate).toEqual(expect.objectContaining({
      status: 'shadow_replay_ready_not_publishable',
      canTrustForRealScheduleCalibration: true,
    }))
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).toContain('archived_live_replay_required')
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).toContain('archived_live_replay_template_scope_mismatch')
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).toEqual(expect.arrayContaining([
      'l5_canary_publish_rollback_required',
      'c19_13_phase1_multinetwork_selection_required',
      'manual_publication_approval_required',
    ]))
    expect(candidatePackage.standardLibraryReadiness.canAutoMaterializeTaskDependencies).toBe(false)
    expect(candidatePackage.standardLibraryReadiness.canAutoPublishRuntimeExperience).toBe(false)
  })

  it('carries attached C-19.13 multi-network selector trust evidence into schedule candidate package readiness', () => {
    const phase1MultiNetworkSelectionTrustGate = buildPassingPhase1MultiNetworkSelectionTrustGate()
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      phase1MultiNetworkSelectionTrustGate,
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
    })

    expect(candidatePackage.standardLibraryReadiness.phase1MultiNetworkSelectionTrustGate).toEqual(expect.objectContaining({
      status: 'phase1_multinetwork_selection_ready_not_publishable',
      canTrustForRealScheduleSelection: true,
      trustBoundary: 'archived_phase1_selector_replay_only',
    }))
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).not.toContain('c19_13_phase1_multinetwork_selection_required')
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).toEqual(expect.arrayContaining([
      'archived_live_replay_required',
      'l5_canary_publish_rollback_required',
    ]))
    expect(candidatePackage.standardLibraryReadiness.canAutoMaterializeTaskDependencies).toBe(false)
    expect(candidatePackage.standardLibraryReadiness.canAutoPublishRuntimeExperience).toBe(false)
  })

  it('does not reuse a C-19.13 selector replay gate for a different selected T2 template set', () => {
    const phase1MultiNetworkSelectionTrustGate = {
      ...buildPassingPhase1MultiNetworkSelectionTrustGate(),
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
    }
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      phase1MultiNetworkSelectionTrustGate,
      selection: {
        businessTypeCode: 'hospital',
        phaseWindow: 'commissioning',
        divisionFamily: 'specialty_business_systems',
        subdivisionFamily: 'clinical_system_validation',
        methodVariantCodes: ['iso_cleanroom'],
        scopeDimensions: ['zone', 'system'],
      },
      facts: {
        hasCleanroomScope: true,
        hasMedicalGasInterface: true,
      },
      organizationAssumptions: ['cleanroom_after_envelope_and_core_mep_ready'],
      selectedWorkfaceUnits: ['zone'],
    })

    expect(candidatePackage.selectedTemplateIds).toContain('t2-hospital-cleanroom-medical-system-commissioning-v1')
    expect(candidatePackage.standardLibraryReadiness.phase1MultiNetworkSelectionTrustGate).toEqual(expect.objectContaining({
      status: 'phase1_multinetwork_selection_ready_not_publishable',
      canTrustForRealScheduleSelection: true,
    }))
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).toContain('c19_13_phase1_multinetwork_selection_required')
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).toContain('c19_13_phase1_selector_template_scope_mismatch')
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).toEqual(expect.arrayContaining([
      'archived_live_replay_required',
      'l5_canary_publish_rollback_required',
    ]))
    expect(candidatePackage.standardLibraryReadiness.canAutoMaterializeTaskDependencies).toBe(false)
    expect(candidatePackage.standardLibraryReadiness.canAutoPublishRuntimeExperience).toBe(false)
  })

  it('carries attached L5 canary handoff evidence into schedule candidate package readiness', () => {
    const l5ReleaseGate = buildPassingL5CanaryHandoffGate()
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      l5ReleaseGate,
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
    })

    expect(candidatePackage.standardLibraryReadiness.l5ReleaseGate).toEqual(expect.objectContaining({
      status: 'l5_canary_handoff_ready',
      canEnterCanary: true,
      canAutoPublishRuntimeExperience: false,
    }))
    expect(candidatePackage.standardLibraryReadiness.l5ReleaseGate?.releasePackage).toEqual(expect.objectContaining({
      packageType: 't2_standard_library_canary_handoff',
      releaseMode: 'canary_only',
    }))
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).not.toContain('l5_canary_publish_rollback_required')
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).toEqual(expect.arrayContaining([
      'archived_live_replay_required',
      'c19_13_phase1_multinetwork_selection_required',
      'manual_promotion_after_canary_required',
      'domain_writer_runtime_publication_required',
    ]))
    expect(candidatePackage.standardLibraryReadiness.canAutoMaterializeTaskDependencies).toBe(false)
    expect(candidatePackage.standardLibraryReadiness.canAutoPublishRuntimeExperience).toBe(false)
  })

  it('does not reuse an L5 canary handoff for a different selected T2 template set', () => {
    const l5ReleaseGate = buildPassingL5CanaryHandoffGate()
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      l5ReleaseGate,
      selection: {
        businessTypeCode: 'hospital',
        phaseWindow: 'commissioning',
        divisionFamily: 'specialty_business_systems',
        subdivisionFamily: 'clinical_system_validation',
        methodVariantCodes: ['iso_cleanroom'],
        scopeDimensions: ['zone', 'system'],
      },
      facts: {
        hasCleanroomScope: true,
        hasMedicalGasInterface: true,
      },
      organizationAssumptions: ['cleanroom_after_envelope_and_core_mep_ready'],
      selectedWorkfaceUnits: ['zone'],
    })

    expect(candidatePackage.selectedTemplateIds).toContain('t2-hospital-cleanroom-medical-system-commissioning-v1')
    expect(candidatePackage.standardLibraryReadiness.l5ReleaseGate).toEqual(expect.objectContaining({
      status: 'l5_canary_handoff_ready',
      canEnterCanary: true,
    }))
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).toContain('l5_canary_publish_rollback_required')
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).toContain('l5_canary_template_scope_mismatch')
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).toEqual(expect.arrayContaining([
      'archived_live_replay_required',
      'c19_13_phase1_multinetwork_selection_required',
      'manual_promotion_after_canary_required',
      'domain_writer_runtime_publication_required',
    ]))
    expect(candidatePackage.standardLibraryReadiness.canAutoMaterializeTaskDependencies).toBe(false)
    expect(candidatePackage.standardLibraryReadiness.canAutoPublishRuntimeExperience).toBe(false)
  })

  it('requires live replay, C-19.13 selector replay, and L5 handoff evidence to close the same selected T2 template scope', () => {
    const liveReplayTrustGate = buildPassingLiveReplayTrustGate()
    const phase1MultiNetworkSelectionTrustGate = buildPassingPhase1MultiNetworkSelectionTrustGate()
    const l5ReleaseGate = buildPassingL5CanaryHandoffGate()
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      liveReplayTrustGate,
      phase1MultiNetworkSelectionTrustGate,
      l5ReleaseGate,
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
    })

    expect(candidatePackage.selectedTemplateIds).toEqual([
      't2-residential-standard-floor-structure-rhythm-v1',
    ])
    expect(candidatePackage.standardLibraryReadiness.releaseEvidenceClosure).toEqual(expect.objectContaining({
      status: 'ready_not_publishable',
      selectedTemplateIds: candidatePackage.selectedTemplateIds,
      requiredGateCodes: [
        'archived_live_replay',
        'c19_13_phase1_multinetwork_selection',
        'l5_canary_handoff',
      ],
      readyGateCodes: [
        'archived_live_replay',
        'c19_13_phase1_multinetwork_selection',
        'l5_canary_handoff',
      ],
      blockingGateCodes: [],
      templateScopeMismatchCodes: [],
      trustBoundary: 'manual_promotion_required_before_runtime_publication',
    }))
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).not.toContain('archived_live_replay_required')
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).not.toContain('c19_13_phase1_multinetwork_selection_required')
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).not.toContain('l5_canary_publish_rollback_required')
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).toEqual(expect.arrayContaining([
      'manual_publication_approval_required',
      'manual_promotion_after_canary_required',
      'domain_writer_runtime_publication_required',
    ]))
    expect(candidatePackage.standardLibraryReadiness.canAutoMaterializeTaskDependencies).toBe(false)
    expect(candidatePackage.standardLibraryReadiness.canAutoPublishRuntimeExperience).toBe(false)
  })

  it('blocks release evidence closure when one ready gate covers a different selected T2 template scope', () => {
    const phase1MultiNetworkSelectionTrustGate = buildPassingPhase1MultiNetworkSelectionTrustGate()
    const mismatchedL5ReleaseGate = buildPassingL5CanaryHandoffGate()
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      liveReplayTrustGate: buildPassingLiveReplayTrustGate(),
      phase1MultiNetworkSelectionTrustGate,
      l5ReleaseGate: mismatchedL5ReleaseGate,
      selection: {
        businessTypeCode: 'hospital',
        phaseWindow: 'commissioning',
        divisionFamily: 'specialty_business_systems',
        subdivisionFamily: 'clinical_system_validation',
        methodVariantCodes: ['iso_cleanroom'],
        scopeDimensions: ['zone', 'system'],
      },
      facts: {
        hasCleanroomScope: true,
        hasMedicalGasInterface: true,
      },
      organizationAssumptions: ['cleanroom_after_envelope_and_core_mep_ready'],
      selectedWorkfaceUnits: ['zone'],
    })

    expect(candidatePackage.selectedTemplateIds).toContain('t2-hospital-cleanroom-medical-system-commissioning-v1')
    expect(candidatePackage.standardLibraryReadiness.releaseEvidenceClosure).toEqual(expect.objectContaining({
      status: 'blocked',
      selectedTemplateIds: candidatePackage.selectedTemplateIds,
      readyGateCodes: [],
      blockingGateCodes: expect.arrayContaining([
        'archived_live_replay',
        'c19_13_phase1_multinetwork_selection',
        'l5_canary_handoff',
      ]),
      templateScopeMismatchCodes: expect.arrayContaining([
        'archived_live_replay_template_scope_mismatch',
        'c19_13_phase1_selector_template_scope_mismatch',
        'l5_canary_template_scope_mismatch',
      ]),
      trustBoundary: 'blocked_release_evidence',
    }))
    expect(candidatePackage.standardLibraryReadiness.releaseBlockers).toEqual(expect.arrayContaining([
      'archived_live_replay_required',
      'c19_13_phase1_multinetwork_selection_required',
      'l5_canary_publish_rollback_required',
    ]))
    expect(candidatePackage.standardLibraryReadiness.canAutoMaterializeTaskDependencies).toBe(false)
    expect(candidatePackage.standardLibraryReadiness.canAutoPublishRuntimeExperience).toBe(false)
  })

  it('selects T2 templates by project facts without leaking T1/T3 assets into the result', () => {
    const residential = selectT2DivisionRhythmTemplates({
      businessTypeCode: 'residential',
      phaseWindow: 'superstructure',
      divisionFamily: 'superstructure',
      methodVariantCodes: ['aluminum_formwork'],
      scopeDimensions: ['building', 'floor'],
    })

    expect(residential.map((template) => template.templateId)).toContain('t2-residential-standard-floor-structure-rhythm-v1')
    expect(residential.every((template) => template.tier === 'T2')).toBe(true)
    expect(residential.every((template) => template.applicability.divisionFamilies.includes('superstructure'))).toBe(true)

    const hospital = selectT2DivisionRhythmTemplates({
      businessTypeCode: 'hospital',
      phaseWindow: 'commissioning',
      divisionFamily: 'specialty_business_systems',
      scopeDimensions: ['zone', 'system'],
    })

    expect(hospital.map((template) => template.templateId)).toContain('t2-hospital-cleanroom-medical-system-commissioning-v1')
    expect(hospital.every((template) => template.tier === 'T2')).toBe(true)
  })

  it('blocks incompatible template assemblies before they can become automatic schedule choices', () => {
    const result = checkT2RhythmTemplateAssemblyCompatibility({
      templateIds: [
        't2-residential-basement-structure-handover-rhythm-v1',
        't2-residential-standard-floor-structure-rhythm-v1',
      ],
      organizationAssumptions: ['tower_first_without_basement_handover'],
      selectedWorkfaceUnits: ['building', 'floor'],
      facts: {
        hasBasementHandover: false,
        hasOrderedFloors: true,
      },
    })

    expect(result.compatible).toBe(false)
    expect(result.status).toBe('candidate_conflict')
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conflictCode: 'incompatible_organization_assumption',
        templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      }),
      expect.objectContaining({
        conflictCode: 'missing_required_fact',
        templateId: 't2-residential-standard-floor-structure-rhythm-v1',
        factKey: 'hasBasementHandover',
      }),
    ]))
  })

  it('does not let linear template priority override assembly feasibility conflicts', () => {
    const result = checkT2RhythmTemplateAssemblyCompatibility({
      templateIds: [
        't2-residential-basement-structure-handover-rhythm-v1',
        't2-residential-standard-floor-structure-rhythm-v1',
      ],
      organizationAssumptions: ['tower_first_without_basement_handover'],
      selectedWorkfaceUnits: ['building', 'floor'],
      facts: {
        hasBasementScope: true,
        hasSupportScheme: true,
        hasOrderedFloors: true,
        hasBasementHandover: false,
      },
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    })

    expect(result.status).toBe('candidate_conflict')
    expect(result.priorityAdjudication).toEqual(expect.objectContaining({
      assemblyFeasibilityRequired: true,
      priorityOverrideBlocked: true,
      selectedTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
    }))
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conflictCode: 'priority_override_blocked_by_assembly_conflict',
        templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      }),
    ]))
  })

  it('projects selected T2 templates into a read-only schedule candidate package for downstream assembly', () => {
    const audit = auditT2DivisionRhythmTemplateRegistry()
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
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
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
        selectedBy: 'system_standard_library_cold_start',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    })

    expect(candidatePackage.source).toBe('t2_division_rhythm_schedule_candidate_package')
    expect(candidatePackage.status).toBe('schedulable_candidate')
    expect(candidatePackage.tier).toBe('T2')
    expect(candidatePackage.scheduleTrustPolicy).toEqual(expect.objectContaining({
      autoApply: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      requiresAssemblyCompatibility: true,
    }))
    expect(candidatePackage.standardLibraryReadiness).toEqual(expect.objectContaining({
      status: 'shadow_candidate_ready_not_publishable',
      precisionStatus: 'ready',
      breadthStatus: 'ready',
      depthStatus: 'ready',
      canEnterC1913Phase1Selection: true,
      canAutoMaterializeTaskDependencies: false,
      canAutoPublishRuntimeExperience: false,
      releaseBlockers: expect.arrayContaining([
        'archived_live_replay_required',
        'l5_canary_publish_rollback_required',
        'c19_13_phase1_multinetwork_selection_required',
      ]),
    }))
    expect(candidatePackage.standardLibraryReadiness.evidenceSummary).toEqual(expect.objectContaining({
      source: 't2_standard_library_readiness_evidence_summary',
      precisionChecksPassed: expect.arrayContaining([
        'child_window_bounds',
        'duration_bearing_windows',
        'dependency_edges',
        'production_feasibility_assumptions',
      ]),
      breadthChecksPassed: expect.arrayContaining([
        'template_count',
        'business_type_count',
        'representative_schedule_scenarios',
        'representative_phase1_network_evaluations',
      ]),
      depthChecksPassed: expect.arrayContaining([
        'representative_replay_fixtures',
        'critical_window_replay_coverage',
        'phase1_critical_window_replay_crosscheck',
      ]),
      representativeScheduleScenarioCount: audit.representativeScheduleScenarioCoverage.readyScenarioCount,
      representativePhase1EvaluationCount: audit.representativePhase1EvaluationCoverage.readyEvaluationCount,
      representativeReplayFixtureCount: audit.representativeReplayFixtureCoverage.readyFixtureCount,
      readyBusinessTypeProfileCount: audit.businessTypeProfiles.length,
      readyBusinessTypeRepresentativeEvidenceCount: audit.businessTypeRepresentativeEvidenceMatrix.length,
      readyDivisionFamilyRepresentativeEvidenceCount: 8,
      readyTemplateRepresentativeEvidenceCount: T2_DIVISION_RHYTHM_TEMPLATE_SEED.length,
      readyPhaseWindowRepresentativeEvidenceCount: Array.from(new Set(
        T2_DIVISION_RHYTHM_TEMPLATE_SEED.flatMap((template) => template.applicability.phaseWindows),
      )).length,
      trustBoundary: 'candidate_network_and_replay_shadow_only',
    }))
    expect(candidatePackage.selectedTemplateIds).toContain('t2-residential-standard-floor-structure-rhythm-v1')
    expect(candidatePackage.durationBearingWindowCount).toBeGreaterThanOrEqual(4)
    expect(candidatePackage.candidateDependencyEdgeCount).toBeGreaterThanOrEqual(6)
    expect(candidatePackage.hardGateCount).toBeGreaterThanOrEqual(2)
    expect(candidatePackage.packageWindows[0]).toEqual(expect.objectContaining({
      source: 't2_division_rhythm_template_seed',
      confidence: 'high',
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
    }))
    expect(candidatePackage.durationContextCandidates[0]).toEqual(expect.objectContaining({
      planDurationTruthSource: 'parent_package_rhythm_window',
      sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
      tier: 'T2',
    }))
    expect(candidatePackage.scheduleTrustSummaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
        criticalPathRoles: expect.arrayContaining(['floor_control_line', 'vertical_rebar_embed']),
        replayAdmission: expect.objectContaining({
          minimumComparableWorkfaceWindows: 12,
          p80CaptureThreshold: 0.72,
        }),
      }),
    ]))
    expect(candidatePackage.dependencyCandidates[0]).toEqual(expect.objectContaining({
      sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
      autoApply: false,
    }))
    expect(candidatePackage.compatibility.status).toBe('compatible_candidate')
  })

  it('attaches selector receipts so every selected T2 template can be audited before real scheduling', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['aluminum_formwork'],
        structureTypeCodes: ['shear_wall'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: true,
      },
      organizationAssumptions: ['basement_first_then_tower'],
      selectedWorkfaceUnits: ['floor'],
    })

    expect(candidatePackage.selectionReceipts).toEqual([
      expect.objectContaining({
        templateId: 't2-residential-standard-floor-structure-rhythm-v1',
        selectionStatus: 'selected_explicit_match',
        rank: 1,
        selectorScore: expect.any(Number),
        selectionBasis: 'explicit_selector_match_and_score_rank',
        requestedDimensions: {
          businessTypeCode: 'residential',
          phaseWindow: 'superstructure',
          divisionFamily: 'superstructure',
          subdivisionFamily: 'standard_floor_handover',
          methodVariantCodes: ['aluminum_formwork'],
          structureTypeCodes: ['shear_wall'],
          scopeDimensions: ['building', 'floor'],
        },
        matchedDimensions: {
          businessTypeCode: 'residential',
          phaseWindow: 'superstructure',
          divisionFamily: 'superstructure',
          subdivisionFamily: 'standard_floor_handover',
          methodVariantCodes: ['aluminum_formwork'],
          structureTypeCodes: ['shear_wall'],
          scopeDimensions: ['building', 'floor'],
        },
        unmatchedExplicitDimensions: [],
        selectorPurity: {
          allExplicitDimensionsMatched: true,
          noT1T3Leakage: true,
          exactPhaseWindowMatch: true,
          exactDivisionFamilyMatch: true,
          exactSubdivisionFamilyMatch: true,
        },
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
          writesSeed: false,
          writesBaseline: false,
          writesRuntimePublications: false,
        },
      }),
    ])
    expect(candidatePackage.standardLibraryReadiness.evidenceSummary.breadthChecksPassed).toEqual(expect.arrayContaining([
      'selector_receipt_audit_trail',
    ]))
  })

  it('marks no-template-match packages as project selection coverage gaps before phase-1 scheduling', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'nonexistent_subdivision_for_cold_start_gap',
        methodVariantCodes: ['aluminum_formwork'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: true,
      },
      organizationAssumptions: ['basement_first_then_tower'],
      selectedWorkfaceUnits: ['floor'],
    })

    expect(candidatePackage.status).toBe('no_template_match')
    expect(candidatePackage.selectedTemplateIds).toEqual([])
    expect(candidatePackage.standardLibraryReadiness).toEqual(expect.objectContaining({
      status: 'shadow_candidate_ready_not_publishable',
      canEnterC1913Phase1Selection: false,
      releaseBlockers: expect.arrayContaining([
        'project_selection_no_template_match',
        'c19_13_phase1_multinetwork_selection_required',
      ]),
    }))
    expect(candidatePackage.selectionCoverage).toEqual(expect.objectContaining({
      status: 'no_template_match',
      canEnterC1913Phase1Selection: false,
      requiresTemplateExpansion: true,
      requested: expect.objectContaining({
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'nonexistent_subdivision_for_cold_start_gap',
      }),
      missingSelectorDimensions: ['subdivisionFamily'],
      gapReasons: expect.arrayContaining([
        'no_t2_template_matches_requested_selection',
        'missing_subdivision_family_coverage',
      ]),
      nearestCompatibleTemplateIds: expect.arrayContaining([
        't2-residential-standard-floor-structure-rhythm-v1',
      ]),
    }))
  })

  it('treats explicit method, structure, and scope mismatches as selection gaps before phase-1 scheduling', () => {
    const commonInput = {
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: true,
      },
      organizationAssumptions: ['basement_first_then_tower'],
      selectedWorkfaceUnits: ['floor'],
    }

    const methodMismatch = buildT2RhythmScheduleCandidatePackage({
      ...commonInput,
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['slip_form_core_cycle'],
        structureTypeCodes: ['shear_wall'],
        scopeDimensions: ['building', 'floor'],
      },
    })

    expect(methodMismatch.status).toBe('no_template_match')
    expect(methodMismatch.selectedTemplateIds).toEqual([])
    expect(methodMismatch.selectionCoverage).toEqual(expect.objectContaining({
      status: 'no_template_match',
      canEnterC1913Phase1Selection: false,
      requiresTemplateExpansion: true,
      missingSelectorDimensions: ['methodVariantCodes'],
      gapReasons: expect.arrayContaining([
        'missing_method_variant_coverage',
      ]),
      nearestCompatibleTemplateIds: expect.arrayContaining([
        't2-residential-standard-floor-structure-rhythm-v1',
      ]),
    }))
    expect(methodMismatch.standardLibraryReadiness).toEqual(expect.objectContaining({
      canEnterC1913Phase1Selection: false,
      releaseBlockers: expect.arrayContaining([
        'project_selection_no_template_match',
      ]),
    }))

    const structureMismatch = buildT2RhythmScheduleCandidatePackage({
      ...commonInput,
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['aluminum_formwork'],
        structureTypeCodes: ['large_span_steel'],
        scopeDimensions: ['building', 'floor'],
      },
    })

    expect(structureMismatch.status).toBe('no_template_match')
    expect(structureMismatch.selectionCoverage.missingSelectorDimensions).toEqual(['structureTypeCodes'])
    expect(structureMismatch.selectionCoverage.gapReasons).toEqual(expect.arrayContaining([
      'missing_structure_type_coverage',
    ]))

    const scopeMismatch = buildT2RhythmScheduleCandidatePackage({
      ...commonInput,
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['aluminum_formwork'],
        structureTypeCodes: ['shear_wall'],
        scopeDimensions: ['bay'],
      },
    })

    expect(scopeMismatch.status).toBe('no_template_match')
    expect(scopeMismatch.selectionCoverage.missingSelectorDimensions).toEqual(['scopeDimensions'])
    expect(scopeMismatch.selectionCoverage.gapReasons).toEqual(expect.arrayContaining([
      'missing_scope_dimension_coverage',
    ]))
  })

  it('feeds T2 candidate packages into the global assembly gate before C-19.13 phase-1 selection', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
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
    })
    const firstWindow = candidatePackage.packageWindows[0]
    const secondWindow = candidatePackage.packageWindows[1]
    const productionCapacityEvidence = buildT2RhythmProductionCapacityEvidence({
      resourceSidecar: {
        availableParallelWorkfaces: 4,
        availableCrewStreams: 4,
        evidenceRefs: ['resource_sidecar:t2-standard-floor-capacity'],
      },
      constructionRhythmExpansion: {
        workfaceCandidateCount: 4,
        dominantRhythmUnits: ['floor'],
        candidates: [{
          backendConsumable: true,
          workfaceCount: 4,
          workfaceKeys: ['tower-a-floor-1', 'tower-a-floor-2', 'tower-b-floor-1', 'tower-b-floor-2'],
        }],
      },
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
      },
    })

    const assembly = checkTemplateAssemblyCompatibility({
      candidateId: 't2-standard-floor-phase1-option',
      t2RhythmScheduleCandidatePackage: candidatePackage,
      constructionOrganization: {
        scenarioId: 'basement-first-standard-floor',
        assumptions: ['basement_first_then_tower'],
      },
      cpmNetwork: {
        edges: [{
          edgeId: 'first-to-second',
          predecessorWindowCode: firstWindow.windowCode,
          successorWindowCode: secondWindow.windowCode,
          relation: 'FS',
          lagDays: 0,
          mandatory: true,
        }],
      },
      productionCapacityEvidence,
    })

    expect(assembly.status).toBe('compatible_candidate')
    expect(assembly.canEnterAutomaticSelection).toBe(true)
    expect(assembly.canWriteTaskDependencies).toBe(false)
    expect(assembly.canWritePlanDates).toBe(false)
    expect(assembly.conflicts).toEqual([])
    expect(assembly.explanation).toEqual(expect.objectContaining({
      t2TemplateIds: expect.arrayContaining(['t2-residential-standard-floor-structure-rhythm-v1']),
      cpmEdgeCount: 1,
    }))
  })
})
