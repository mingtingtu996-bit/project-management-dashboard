import { describe, expect, it } from 'vitest'
import { WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX } from '../seeds/wbsTemplateRealProjectCoverageMatrix.js'
import {
  WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS,
  assertWbsTemplateGoldenBenchmarkGate,
  buildWbsReferenceDaysPublicationReadinessFromProductionRows,
  buildWbsReferenceDaysPublicationReadiness,
  evaluateWbsReferenceDaysLiveLearningEvidence,
  evaluateWbsTemplateGoldenBenchmarkRunGate,
  evaluateWbsTemplateGoldenBenchmarkStaticGate,
  type WbsTemplateGoldenBenchmarkRunResult,
} from '../services/wbsTemplateGoldenBenchmarkGateService.js'

function buildPassingRuntimeResults(): WbsTemplateGoldenBenchmarkRunResult[] {
  return WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.map((entry) => ({
    projectCode: entry.projectCode,
    recommendationKey: entry.recommendationKey,
    durationOutputCode: 'plan_reference',
    durationOutputSummary: {
      planReferenceRowCount: 1,
      templateFastEstimateRowCount: 0,
      contextualReferenceRowCount: 1,
      writablePlanTaskDurationRowCount: 1,
    },
    generatedRowCount: (entry.expectedRuntimeReplayRowCountRange ?? entry.expectedRowCountRange)[0],
    coverageRate: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumCoverageRate,
    deepCoverageRate: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumDeepCoverageRate,
    expectedDurationDaysRange: entry.expectedDurationDaysRange,
    expectedRuntimeReplayRowCountRange: entry.expectedRuntimeReplayRowCountRange ?? entry.expectedRowCountRange,
    actualScheduleStartDate: '2026-06-01',
    actualScheduleEndDate: '2028-12-31',
    actualScheduleDurationDays: Math.round((entry.expectedDurationDaysRange[0] + entry.expectedDurationDaysRange[1]) / 2),
    durationDeviationRatio: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.maximumDurationDeviationRatio,
    dependencyPassRate: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumDependencyPassRate,
    missingRequiredTemplateIds: [],
    missingStableCodePrefixes: [],
  }))
}

describe('wbsTemplateGoldenBenchmarkGateService', () => {
  it('passes the static gate only when the 13 real-project matrix is closed against taxonomy and recommendations', () => {
    const gate = evaluateWbsTemplateGoldenBenchmarkStaticGate()

    expect(gate.status).toBe('pass')
    expect(gate.scenarioCount).toBe(13)
    expect(gate.expectedScenarioCount).toBe(13)
    expect(gate.findings).toEqual([])
    expect(gate.matrixProjectCodes.sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G1', 'G2', 'H', 'I', 'J', 'K', 'L'].sort())
    expect(gate.recommendationPackKeys).toHaveLength(13)
  })

  it('passes runtime gate for a complete benchmark result set at commercial thresholds', () => {
    const gate = evaluateWbsTemplateGoldenBenchmarkRunGate(buildPassingRuntimeResults())

    expect(gate.status).toBe('pass')
    expect(gate.resultCount).toBe(13)
    expect(gate.findings).toEqual([])
    expect(gate.summary.failedScenarioCount).toBe(0)
  })

  it('requires runtime benchmark results to declare the governed duration output under test', () => {
    const results = buildPassingRuntimeResults().map((result) => {
      const { durationOutputCode: _durationOutputCode, ...withoutDurationOutput } = result
      return withoutDurationOutput as WbsTemplateGoldenBenchmarkRunResult
    })

    const gate = evaluateWbsTemplateGoldenBenchmarkRunGate(results)

    expect(gate.status).toBe('fail')
    expect(gate.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'duration_output_contract_missing',
    ]))
  })

  it('blocks plan-reference benchmark results that still contain fast-template duration evidence', () => {
    const results = buildPassingRuntimeResults()
    results[0] = {
      ...results[0],
      durationOutputSummary: {
        planReferenceRowCount: 12,
        templateFastEstimateRowCount: 3,
        contextualReferenceRowCount: 12,
        writablePlanTaskDurationRowCount: 12,
      },
    }

    const gate = evaluateWbsTemplateGoldenBenchmarkRunGate(results)

    expect(gate.status).toBe('fail')
    expect(gate.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'template_fast_estimate_in_plan_reference_replay',
    ]))
  })

  it('requires plan-reference benchmark results to include row-level duration output evidence', () => {
    const results = buildPassingRuntimeResults()
    delete (results[0] as Partial<WbsTemplateGoldenBenchmarkRunResult>).durationOutputSummary

    const gate = evaluateWbsTemplateGoldenBenchmarkRunGate(results)

    expect(gate.status).toBe('fail')
    expect(gate.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'duration_output_evidence_missing',
    ]))
  })

  it('blocks runtime gate when coverage, deep coverage, duration, dependency or row-count thresholds regress', () => {
    const results = buildPassingRuntimeResults()
    results[0] = {
      ...results[0],
      generatedRowCount: WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX[0].expectedRowCountRange[1] + 1,
      coverageRate: 0.99,
      deepCoverageRate: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumDeepCoverageRate - 0.01,
      expectedDurationDaysRange: [1, 2],
      actualScheduleDurationDays: null,
      durationDeviationRatio: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.maximumDurationDeviationRatio + 0.01,
      dependencyPassRate: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumDependencyPassRate - 0.01,
      missingRequiredTemplateIds: ['china-gb55032-2022'],
      missingStableCodePrefixes: ['BDT'],
    }

    const gate = evaluateWbsTemplateGoldenBenchmarkRunGate(results)

    expect(gate.status).toBe('fail')
    expect(gate.summary.failedScenarioCount).toBe(1)
    expect(gate.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'row_count_out_of_range',
      'duration_anchor_range_mismatch',
      'schedule_duration_evidence_missing',
      'coverage_rate_below_threshold',
      'deep_coverage_rate_below_threshold',
      'duration_deviation_above_threshold',
      'dependency_pass_rate_below_threshold',
      'missing_required_templates',
      'missing_stable_code_prefixes',
    ]))
  })

  it('throws when the benchmark gate is used as a blocking verification gate and a scenario fails', () => {
    const results = buildPassingRuntimeResults()
    results[0] = {
      ...results[0],
      durationDeviationRatio: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.maximumDurationDeviationRatio + 0.01,
    }

    expect(() => assertWbsTemplateGoldenBenchmarkGate(results)).toThrow(/duration_deviation_above_threshold/)
  })

  it('requires benchmark replay, feedback outcome, dedicated writer, lineage, and release gates before WBS reference days live learning is ready', () => {
    const runtimeGate = evaluateWbsTemplateGoldenBenchmarkRunGate(buildPassingRuntimeResults())

    const decision = evaluateWbsReferenceDaysLiveLearningEvidence({
      runtimeGate,
      templateReferenceDaysOutcomeRecorded: true,
      approvedReferenceDaysCandidateRecorded: true,
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      runtimeConsumerUsesPublishedArtifact: true,
      referenceDaysPublicationWriterReady: true,
      referenceDaysLineageRecorded: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    })

    expect(decision).toEqual({
      status: 'wbs_reference_days_live_learning_ready',
      liveLearningEvidence: {
        assetClassificationRegistered: true,
        predictionEventRecorded: true,
        actualOutcomeEventRecorded: true,
        tieredLearningPolicyRegistered: true,
        enabledLearningScopes: ['global', 'industry', 'company', 'project'],
        runtimeConsumerUsesPublishedArtifact: true,
        benchmarkReplayGatePassed: true,
        approvedReferenceDaysCandidateRecorded: true,
        referenceDaysPublicationWriterReady: true,
        referenceDaysLineageRecorded: true,
        referenceDaysWriterDoesNotMutateConfirmedPlans: true,
        releaseExitApproved: true,
        impactMonitoringReady: true,
        rollbackTargetReady: true,
        accuracyMetricsAvailable: true,
        benchmarkScenarioCount: 13,
      },
      missingReasons: [],
    })
  })

  it('builds a WBS reference-days publication readiness package from a passing benchmark and approved candidates', () => {
    const runtimeGate = evaluateWbsTemplateGoldenBenchmarkRunGate(buildPassingRuntimeResults())

    const readiness = buildWbsReferenceDaysPublicationReadiness({
      runtimeGate,
      templateReferenceDaysOutcomeRecorded: true,
      approvedCandidateEventIds: ['reference-candidate-1', 'reference-candidate-1'],
      referenceDaysVersionId: 'wbs-reference-days-v2',
      runtimePublicationKey: 'wbs_reference_days_runtime:wbs-reference-days-v2',
      rollbackTarget: 'wbs_reference_days_runtime:wbs-reference-days-v1',
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })

    expect(readiness.status).toBe('wbs_reference_days_publication_ready')
    expect(readiness.liveLearningEvidence).toEqual(expect.objectContaining({
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      benchmarkReplayGatePassed: true,
      approvedReferenceDaysCandidateRecorded: true,
      referenceDaysPublicationWriterReady: true,
      referenceDaysLineageRecorded: true,
      runtimeConsumerUsesPublishedArtifact: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
      benchmarkScenarioCount: 13,
    }))
    expect(readiness.referenceDaysLineage).toEqual({
      assetType: 'wbs_reference_days',
      referenceDaysVersionId: 'wbs-reference-days-v2',
      runtimePublicationKey: 'wbs_reference_days_runtime:wbs-reference-days-v2',
      rollbackTarget: 'wbs_reference_days_runtime:wbs-reference-days-v1',
      approvedCandidateEventIds: ['reference-candidate-1'],
      benchmarkGateVersion: runtimeGate.version,
      benchmarkScenarioCount: 13,
    })
    expect(readiness.missingReasons).toEqual([])
  })

  it('builds WBS reference-days publication readiness from production source rows', () => {
    const runtimeGate = evaluateWbsTemplateGoldenBenchmarkRunGate(buildPassingRuntimeResults())

    const readiness = buildWbsReferenceDaysPublicationReadinessFromProductionRows({
      runtimeGate,
      approvedCandidateEventIds: ['reference-candidate-1'],
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      records: [{
        assetKey: 'wbs_reference_days',
        evidenceKind: 'production_sample',
        evidenceRef: 'network_outcomes:wbs-reference-days-candidate-1',
        evidenceStatus: 'accepted',
      }],
      sourceRows: [
        {
          sourceTable: 'wbs_template_runtime_publications',
          row: {
            publication_key: 'wbs_reference_days_runtime:wbs-reference-days-v2',
            asset_kind: 'wbs_reference_days',
            asset_version_id: 'wbs-reference-days-v2',
            runtime_publication_status: 'runtime_published',
            impact_monitoring: {
              status: 'monitoring_armed',
              eventRef: 'impact_monitoring:wbs_reference_days_runtime:wbs-reference-days-v2:armed',
            },
            rollback_execution: {
              status: 'rollback_verified',
              eventRef: 'rollback:wbs_reference_days_runtime:wbs-reference-days-v2:verified',
            },
          },
        },
        {
          sourceTable: 'runtime_consumer_observations',
          row: {
            id: 'consumer-reference-days-1',
            asset_key: 'wbs_reference_days',
            consumer_key: 'wbsTemplateGenerationService',
            publication_key: 'wbs_reference_days_runtime:wbs-reference-days-v2',
            observation_status: 'observed',
            writes_runtime_directly: false,
            writes_fact_directly: false,
          },
        },
        {
          sourceTable: 'duration_algorithm_accuracy_events',
          row: {
            id: 'accuracy-reference-days-1',
            absolute_error_days: 1,
            prediction_context: {
              assetKey: 'wbs_reference_days',
            },
            actual_context: {
              accuracyGateStatus: 'accuracy_passed',
            },
          },
        },
      ],
    })

    expect(readiness.status).toBe('wbs_reference_days_publication_ready')
    expect(readiness.liveLearningEvidence).toEqual(expect.objectContaining({
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      benchmarkReplayGatePassed: true,
      approvedReferenceDaysCandidateRecorded: true,
      referenceDaysPublicationWriterReady: true,
      referenceDaysLineageRecorded: true,
      runtimeConsumerUsesPublishedArtifact: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    }))
    expect(readiness.referenceDaysLineage).toEqual(expect.objectContaining({
      referenceDaysVersionId: 'wbs-reference-days-v2',
      runtimePublicationKey: 'wbs_reference_days_runtime:wbs-reference-days-v2',
      rollbackTarget: 'rollback:wbs_reference_days_runtime:wbs-reference-days-v2:verified',
      approvedCandidateEventIds: ['reference-candidate-1'],
      benchmarkScenarioCount: 13,
    }))
    expect(readiness.productionLineage.evidenceRefs).toEqual(expect.objectContaining({
      productionSampleEvidenceRef: 'network_outcomes:wbs-reference-days-candidate-1',
      publicationExecutionRef: 'wbs_reference_days_runtime:wbs-reference-days-v2',
      runtimeConsumerObservationRef: 'runtime_consumer:consumer-reference-days-1',
      impactMonitoringEvidenceRef: 'impact_monitoring:wbs_reference_days_runtime:wbs-reference-days-v2:armed',
      rollbackDrillEvidenceRef: 'rollback:wbs_reference_days_runtime:wbs-reference-days-v2:verified',
      accuracyEvidenceRef: 'duration_algorithm_accuracy_events:accuracy-reference-days-1',
    }))
    expect(readiness.productionLineage.rejectedRows).toEqual([])
    expect(readiness.productionLineage.rejectedRecords).toEqual([])
  })

  it('keeps WBS reference-days publication readiness blocked when consumer observes a different runtime publication', () => {
    const runtimeGate = evaluateWbsTemplateGoldenBenchmarkRunGate(buildPassingRuntimeResults())

    const readiness = buildWbsReferenceDaysPublicationReadinessFromProductionRows({
      runtimeGate,
      approvedCandidateEventIds: ['reference-candidate-1'],
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      records: [{
        assetKey: 'wbs_reference_days',
        evidenceKind: 'production_sample',
        evidenceRef: 'network_outcomes:wbs-reference-days-candidate-1',
        evidenceStatus: 'accepted',
      }],
      sourceRows: [
        {
          sourceTable: 'wbs_template_runtime_publications',
          row: {
            publication_key: 'wbs_reference_days_runtime:wbs-reference-days-v2',
            asset_kind: 'wbs_reference_days',
            asset_version_id: 'wbs-reference-days-v2',
            runtime_publication_status: 'runtime_published',
            impact_monitoring: {
              status: 'monitoring_armed',
              eventRef: 'impact_monitoring:wbs_reference_days_runtime:wbs-reference-days-v2:armed',
            },
            rollback_execution: {
              status: 'rollback_verified',
              eventRef: 'rollback:wbs_reference_days_runtime:wbs-reference-days-v2:verified',
            },
          },
        },
        {
          sourceTable: 'runtime_consumer_observations',
          row: {
            id: 'consumer-reference-days-1',
            asset_key: 'wbs_reference_days',
            consumer_key: 'wbsTemplateGenerationService',
            publication_key: 'wbs_reference_days_runtime:wbs-reference-days-v1',
            observation_status: 'observed',
            writes_runtime_directly: false,
            writes_fact_directly: false,
          },
        },
        {
          sourceTable: 'duration_algorithm_accuracy_events',
          row: {
            id: 'accuracy-reference-days-1',
            absolute_error_days: 1,
            prediction_context: {
              assetKey: 'wbs_reference_days',
            },
            actual_context: {
              accuracyGateStatus: 'accuracy_passed',
            },
          },
        },
      ],
    })

    expect(readiness.status).toBe('wbs_reference_days_publication_not_ready')
    expect(readiness.liveLearningEvidence.runtimeConsumerUsesPublishedArtifact).toBe(false)
    expect(readiness.missingReasons).toEqual(expect.arrayContaining([
      'runtime_consumer_publication_mismatch',
    ]))
  })

  it('keeps WBS reference-days publication readiness closed without benchmark, approvals, lineage, and release evidence', () => {
    const runtimeGate = evaluateWbsTemplateGoldenBenchmarkRunGate([])

    const readiness = buildWbsReferenceDaysPublicationReadiness({
      runtimeGate,
      templateReferenceDaysOutcomeRecorded: false,
      approvedCandidateEventIds: [],
      referenceDaysVersionId: '',
      runtimePublicationKey: '',
      rollbackTarget: '',
      enabledLearningScopes: ['system'],
      releaseExitApproved: false,
      impactMonitoringReady: false,
      accuracyMetricsAvailable: false,
    })

    expect(readiness.status).toBe('wbs_reference_days_publication_not_ready')
    expect(readiness.referenceDaysLineage).toEqual(expect.objectContaining({
      assetType: 'wbs_reference_days',
      referenceDaysVersionId: null,
      runtimePublicationKey: null,
      rollbackTarget: null,
      approvedCandidateEventIds: [],
      benchmarkScenarioCount: 0,
    }))
    expect(readiness.missingReasons).toEqual(expect.arrayContaining([
      'wbs_reference_days_benchmark_gate_required',
      'template_reference_days_outcome_required',
      'approved_reference_days_candidate_required',
      'wbs_reference_days_publication_writer_required',
      'wbs_reference_days_lineage_required',
      'runtime_consumer_publication_required',
      'global_industry_company_project_learning_scopes_required',
      'release_exit_required',
      'impact_monitoring_required',
      'rollback_target_required',
      'accuracy_metrics_required',
    ]))
  })

  it('keeps WBS reference days not ready when benchmark replay or publication evidence is missing', () => {
    const runtimeGate = evaluateWbsTemplateGoldenBenchmarkRunGate([])

    const decision = evaluateWbsReferenceDaysLiveLearningEvidence({
      runtimeGate,
      templateReferenceDaysOutcomeRecorded: false,
      approvedReferenceDaysCandidateRecorded: false,
      enabledLearningScopes: ['system'],
      runtimeConsumerUsesPublishedArtifact: false,
      referenceDaysPublicationWriterReady: false,
      referenceDaysLineageRecorded: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    })

    expect(decision.status).toBe('wbs_reference_days_live_learning_not_ready')
    expect(decision.liveLearningEvidence).toEqual(expect.objectContaining({
      predictionEventRecorded: false,
      actualOutcomeEventRecorded: false,
      tieredLearningPolicyRegistered: false,
      runtimeConsumerUsesPublishedArtifact: false,
      benchmarkReplayGatePassed: false,
      approvedReferenceDaysCandidateRecorded: false,
      referenceDaysPublicationWriterReady: false,
      referenceDaysLineageRecorded: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
      benchmarkScenarioCount: 0,
    }))
    expect(decision.missingReasons).toEqual(expect.arrayContaining([
      'wbs_reference_days_benchmark_gate_required',
      'template_reference_days_outcome_required',
      'approved_reference_days_candidate_required',
      'wbs_reference_days_publication_writer_required',
      'wbs_reference_days_lineage_required',
      'runtime_consumer_publication_required',
      'global_industry_company_project_learning_scopes_required',
      'release_exit_required',
      'impact_monitoring_required',
      'rollback_target_required',
      'accuracy_metrics_required',
    ]))
  })
})
