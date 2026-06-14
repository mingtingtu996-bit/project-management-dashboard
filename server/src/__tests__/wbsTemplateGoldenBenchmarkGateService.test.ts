import { describe, expect, it } from 'vitest'
import { WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX } from '../seeds/wbsTemplateRealProjectCoverageMatrix.js'
import {
  WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS,
  assertWbsTemplateGoldenBenchmarkGate,
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
