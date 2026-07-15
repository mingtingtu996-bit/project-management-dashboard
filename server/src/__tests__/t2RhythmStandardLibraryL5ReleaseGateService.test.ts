import { describe, expect, it } from 'vitest'

import {
  evaluateT2RhythmStandardLibraryL5ReleaseGate,
} from '../services/t2RhythmStandardLibraryL5ReleaseGateService.js'
import {
  evaluateT2RhythmStandardLibraryTrustGate,
} from '../services/t2RhythmStandardLibraryTrustGateService.js'

const readyTrustGate = evaluateT2RhythmStandardLibraryTrustGate({
  status: 'pass',
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

describe('t2RhythmStandardLibraryL5ReleaseGateService', () => {
  it('blocks T2 standard-library runtime release until every L5 release surface is proven', () => {
    const gate = evaluateT2RhythmStandardLibraryL5ReleaseGate({
      trustGate: readyTrustGate,
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      l5Evidence: {
        releaseExitApproved: true,
        releaseExitEvidenceRefs: ['release-exit:t2-standard-library:shadow-replay-approved'],
        canaryPlanApproved: false,
        canaryEvidenceRefs: [],
        runtimeConsumerVerified: false,
        runtimeConsumerEvidenceRefs: [],
        impactMonitoringReady: false,
        impactMonitoringEvidenceRefs: [],
        rollbackTargetReady: false,
        rollbackEvidenceRefs: [],
      },
    })

    expect(gate).toEqual(expect.objectContaining({
      source: 't2_rhythm_standard_library_l5_release_gate',
      status: 'l5_release_blocked',
      canEnterCanary: false,
      canPublishRuntimeExperience: false,
      canMaterializeTaskDependencies: false,
      canWritePlanDates: false,
      canAutoPublishRuntimeExperience: false,
      releaseBlockers: expect.arrayContaining([
        'l5_canary_plan_required',
        'runtime_consumer_verification_required',
        'impact_monitoring_required',
        'rollback_target_required',
      ]),
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      },
    }))
    expect(gate.releasePackage).toBeNull()
  })

  it('builds only a canary handoff package when shadow replay and all L5 surfaces are present', () => {
    const gate = evaluateT2RhythmStandardLibraryL5ReleaseGate({
      trustGate: readyTrustGate,
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
          { metricCode: 'median_absolute_error_days', comparator: 'lte', threshold: 3, windowDays: 7 },
          { metricCode: 'p80_capture_rate', comparator: 'gte', threshold: 0.8, windowDays: 7 },
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

    expect(gate).toEqual(expect.objectContaining({
      status: 'l5_canary_handoff_ready',
      canEnterCanary: true,
      canPublishRuntimeExperience: false,
      canMaterializeTaskDependencies: false,
      canWritePlanDates: false,
      canAutoPublishRuntimeExperience: false,
      releaseBlockers: expect.arrayContaining([
        'manual_promotion_after_canary_required',
        'domain_writer_runtime_publication_required',
      ]),
      releasePackage: expect.objectContaining({
        packageType: 't2_standard_library_canary_handoff',
        releaseMode: 'canary_only',
        selectedTemplateIds: [
          't2-residential-standard-floor-structure-rhythm-v1',
          't2-residential-basement-structure-handover-rhythm-v1',
        ],
        scopeType: 'project',
        companyId: '10000000-0000-4000-8000-000000000001',
        projectId: '00000000-0000-4000-8000-000000000001',
        canaryPlan: expect.objectContaining({
          minimumSampleCount: 24,
          durationDays: 7,
          blastRadius: expect.objectContaining({
            maxProjectCount: 1,
            maxCompanyCount: 1,
            maxTemplateCount: 2,
            scopeLocked: true,
          }),
          successCriteria: expect.objectContaining({
            minimumP80CaptureRate: 0.8,
            maximumMedianAbsoluteErrorDays: 3,
            maximumGateSlipMedianDays: 2,
            maximumDependencyViolationRate: 0.02,
          }),
        }),
        impactMonitoringPlan: expect.objectContaining({
          metrics: expect.arrayContaining([
            expect.objectContaining({ metricCode: 'median_absolute_error_days', comparator: 'lte', threshold: 3, windowDays: 7 }),
            expect.objectContaining({ metricCode: 'p80_capture_rate', comparator: 'gte', threshold: 0.8, windowDays: 7 }),
          ]),
        }),
        rollbackPlan: expect.objectContaining({
          drillExecuted: true,
          recoveryTimeMinutes: 30,
          rollbackTargetVersion: 't2-standard-library-shadow-v0',
          drillEvidenceRefs: ['rollback-drill:t2-standard-library:verified'],
        }),
      }),
    }))
    expect(gate.releasePackage?.evidenceRefs).toEqual(expect.arrayContaining([
      'release-exit:t2-standard-library:approved',
      'canary:t2-standard-library:7d-project-scope',
      'consumer:durationInputAssembler:t2-standard-library',
      'monitor:t2-standard-library:mape-drift',
      'rollback:t2-standard-library:previous-shadow-version',
      'rollback-drill:t2-standard-library:verified',
    ]))
    expect(gate.mutationBoundary.writesRuntimePublications).toBe(false)
  })

  it('requires structured canary success criteria, blast-radius limits, monitoring metrics, and rollback drill evidence', () => {
    const gate = evaluateT2RhythmStandardLibraryL5ReleaseGate({
      trustGate: readyTrustGate,
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      releaseScope: {
        companyId: '10000000-0000-4000-8000-000000000001',
        projectId: '00000000-0000-4000-8000-000000000001',
        scopeType: 'project',
      },
      l5Evidence: {
        releaseExitApproved: true,
        releaseExitEvidenceRefs: ['release-exit:t2-standard-library:approved'],
        canaryPlanApproved: true,
        canaryEvidenceRefs: ['canary:t2-standard-library:plan-only'],
        runtimeConsumerVerified: true,
        runtimeConsumerEvidenceRefs: ['consumer:durationInputAssembler:t2-standard-library'],
        impactMonitoringReady: true,
        impactMonitoringEvidenceRefs: ['monitor:t2-standard-library:configured'],
        rollbackTargetReady: true,
        rollbackEvidenceRefs: ['rollback:t2-standard-library:target-only'],
      },
    })

    expect(gate).toEqual(expect.objectContaining({
      status: 'l5_release_blocked',
      canEnterCanary: false,
      releaseBlockers: expect.arrayContaining([
        'canary_success_criteria_required',
        'canary_blast_radius_limit_required',
        'canary_minimum_sample_size_required',
        'impact_monitoring_metric_thresholds_required',
        'rollback_drill_required',
      ]),
    }))
    expect(gate.releasePackage).toBeNull()
  })
})
