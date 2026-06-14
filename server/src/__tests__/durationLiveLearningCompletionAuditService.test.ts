import { describe, expect, it } from 'vitest'
import {
  evaluateAlgorithmAssetColdStartLiveLearningEvidence,
  decideAlgorithmAssetColdStartRuntime,
} from '../services/algorithmAssetColdStartBaselineService.js'
import {
  buildBaseDurationBenchmarkLiveLearningEvidence,
} from '../services/baseDurationBenchmarkLiveLearningEvidenceService.js'
import {
  buildConstructionDependencyRulePublicationReadiness,
} from '../services/constructionDependencyReplayCalibrationService.js'
import {
  buildCriticalPathRulePublicationReadiness,
} from '../services/criticalPathRulePublicationReadinessService.js'
import {
  buildDurationLiveLearningCompletionAudit,
} from '../services/durationLiveLearningCompletionAuditService.js'
import type { DurationLiveLearningEvidence } from '../services/durationLiveLearningClosureService.js'
import {
  buildForecastScopedRuntimeLiveLearningEvidence,
} from '../services/forecastScopedRuntimeLiveLearningEvidenceService.js'
import {
  buildStandardWorkDurationSeedPublicationReadiness,
} from '../services/standardWorkDurationSeedReplayCandidateBridgeService.js'
import {
  buildSpecialWorkDurationSeedPublicationReadiness,
} from '../services/wbsTemplateCandidateEventService.js'
import {
  WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS,
  WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_VERSION,
  buildWbsReferenceDaysPublicationReadiness,
} from '../services/wbsTemplateGoldenBenchmarkGateService.js'

const fullScopeEvidence: DurationLiveLearningEvidence = {
  assetClassificationRegistered: true,
  predictionEventRecorded: true,
  actualOutcomeEventRecorded: true,
  tieredLearningPolicyRegistered: true,
  enabledLearningScopes: ['global', 'industry', 'company', 'project'],
  runtimeConsumerUsesPublishedArtifact: true,
  releaseExitApproved: true,
  impactMonitoringReady: true,
  rollbackTargetReady: true,
  accuracyMetricsAvailable: true,
}

const companyProjectScopedEvidence: DurationLiveLearningEvidence = {
  assetClassificationRegistered: true,
  predictionEventRecorded: true,
  actualOutcomeEventRecorded: true,
  tieredLearningPolicyRegistered: true,
  enabledLearningScopes: ['company', 'project'],
  scopeExceptionApproved: true,
  runtimeConsumerUsesPublishedArtifact: true,
  releaseExitApproved: true,
  impactMonitoringReady: true,
  rollbackTargetReady: true,
  accuracyMetricsAvailable: true,
}

function buildCompleteOverrides() {
  return [
    { assetKey: 'base_duration_benchmark' as const, evidence: fullScopeEvidence },
    { assetKey: 'duration_cold_start_baseline' as const, evidence: fullScopeEvidence },
    { assetKey: 'forecast_residual_overlay' as const, evidence: companyProjectScopedEvidence },
    { assetKey: 'forecast_confidence_weight' as const, evidence: companyProjectScopedEvidence },
    { assetKey: 'standard_work_duration_seed' as const, evidence: fullScopeEvidence },
    { assetKey: 'special_work_duration_seed' as const, evidence: fullScopeEvidence },
    { assetKey: 'wbs_reference_days' as const, evidence: fullScopeEvidence },
    { assetKey: 'dependency_rule_candidate' as const, evidence: fullScopeEvidence },
    { assetKey: 'critical_path_rule_candidate' as const, evidence: fullScopeEvidence },
  ]
}

describe('durationLiveLearningCompletionAuditService', () => {
  it('declares completion only when all learnable assets are ready and fact assets stay locked', () => {
    const audit = buildDurationLiveLearningCompletionAudit({
      evidenceOverrides: buildCompleteOverrides(),
    })

    expect(audit.status).toBe('duration_live_learning_completion_ready')
    expect(audit.allowedClaim).toBe(
      'all_learnable_duration_prediction_and_network_assets_are_live_self_learning;facts_and_commitments_remain_locked',
    )
    expect(audit.prohibitedClaim).toBe('all_duration_assets_are_live_self_learning')
    expect(audit.manifestEvaluations.map((manifest) => manifest.status)).toEqual([
      'manifest_live_self_learning_ready',
      'manifest_live_self_learning_ready',
    ])
    expect(audit.executionPlan.status).toBe('execution_plan_ready')
    expect(audit.portfolio.status).toBe('portfolio_live_self_learning_ready')
    expect(audit.learnableAssetKeys).toEqual([
      'base_duration_benchmark',
      'duration_cold_start_baseline',
      'forecast_residual_overlay',
      'forecast_confidence_weight',
      'standard_work_duration_seed',
      'special_work_duration_seed',
      'wbs_reference_days',
      'dependency_rule_candidate',
      'critical_path_rule_candidate',
    ])
    expect(audit.factLockedAssetKeys).toEqual([
      'baseline_commitment',
      'monthly_plan_commitment',
      'actual_duration_outcome',
      'progress_snapshot',
    ])
    expect(audit.blockedAssetKeys).toEqual([])
    expect(audit.factRewriteBlockedAssetKeys).toEqual([])
  })

  it('keeps completion closed when any learnable evidence is missing or a fact rewrite is requested', () => {
    const overrides = buildCompleteOverrides()
      .filter((override) => override.assetKey !== 'critical_path_rule_candidate')

    const audit = buildDurationLiveLearningCompletionAudit({
      evidenceOverrides: overrides,
      requestedFactRewriteAssetKeys: ['baseline_commitment'],
    })

    expect(audit.status).toBe('duration_live_learning_completion_not_ready')
    expect(audit.allowedClaim).toBe('not_ready_for_live_self_learning_claim')
    expect(audit.prohibitedClaim).toBe('all_duration_assets_are_live_self_learning')
    expect(audit.blockedAssetKeys).toContain('critical_path_rule_candidate')
    expect(audit.factRewriteBlockedAssetKeys).toEqual(['baseline_commitment'])
    expect(audit.executionPlan.status).toBe('execution_plan_not_ready')
    expect(audit.portfolio.status).toBe('portfolio_not_ready')
  })

  it('accepts liveLearningEvidence emitted by every v1.4.22.5 bridge as completion audit overrides', () => {
    const base = buildBaseDurationBenchmarkLiveLearningEvidence({
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      acceptedSampleCounts: { global: 80, industry: 40, company: 12, project: 6 },
      runtimePublicationKey: 'duration_benchmark_runtime:benchmark-blend-v2',
      rollbackTarget: 'duration_benchmark_runtime:benchmark-blend-v1',
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })
    const coldStartDecision = decideAlgorithmAssetColdStartRuntime({
      companyId: 'company-a',
      projectId: 'project-a1',
      workCode: 'WBS-001',
      scenarioKeys: ['residential'],
      systemSeedValue: 12,
      companyAcceptedSampleCount: 6,
      minCompanySamplesForOverride: 5,
      baselines: [{
        baselineId: 'industry-baseline-1',
        baselineScope: 'segment_baseline',
        applicableScenarioKeys: ['residential'],
        value: 10,
        anonymizationPolicy: 'k_anonymous_multi_company',
        contributingCompanyCount: 5,
        minCompanyCount: 3,
        contributingProjectCount: 18,
        minProjectCount: 10,
        singleCompanyShare: 0.28,
        maxSingleCompanyShare: 0.4,
        sourceAggregation: 'aggregate_summary_only',
        rollbackTarget: 'cold-start-baseline:v1',
        runtimePublicationStatus: 'published',
      }],
    })
    const cold = evaluateAlgorithmAssetColdStartLiveLearningEvidence({
      runtimeDecision: coldStartDecision,
      actualOutcomeRecorded: true,
      actualSampleHealth: 'accepted',
      companyAcceptedSampleCount: 6,
      minCompanySamplesForOverride: 5,
      projectAcceptedSampleCount: 3,
      minProjectSamplesForOverlay: 3,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    })
    const residual = buildForecastScopedRuntimeLiveLearningEvidence({
      assetKey: 'forecast_residual_overlay',
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      enabledLearningScopes: ['company', 'project'],
      scopeExceptionApprovalId: 'scope-exception-residual',
      runtimePublicationKey: 'forecast_residual_overlay_runtime:overlay-v2',
      rollbackTarget: 'forecast_residual_overlay_runtime:overlay-v1',
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })
    const confidence = buildForecastScopedRuntimeLiveLearningEvidence({
      assetKey: 'forecast_confidence_weight',
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      enabledLearningScopes: ['company', 'project'],
      scopeExceptionApprovalId: 'scope-exception-confidence',
      runtimePublicationKey: 'forecast_confidence_weight_runtime:weight-v2',
      rollbackTarget: 'forecast_confidence_weight_runtime:weight-v1',
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })
    const standard = buildStandardWorkDurationSeedPublicationReadiness({
      report: {
        reportCode: 'standard_work_duration_seed_replay_governance',
        generatedAt: '2026-06-14T00:00:00.000Z',
        companyId: 'company-1',
        projectId: 'project-1',
        source: {
          table: 'duration_experience_samples',
          filters: {
            sampleStatus: 'active',
            includedInBenchmark: true,
            wbsNodeType: 'process',
            companyId: 'company-1',
            projectId: 'project-1',
            maxSamples: 1000,
          },
        },
        replay: {
          reportCode: 'standard_work_duration_seed_p50_replay',
          generatedAt: '2026-06-14T00:00:00.000Z',
          governancePolicy: {
            replayMode: 'report_only',
            seedWritePolicy: 'never_write_seed_from_replay',
            candidatePolicy: 'review_required_before_seed_promotion',
          },
          summary: {
            inputSampleCount: 1,
            eligibleSampleCount: 1,
            matchedSampleCount: 1,
            evaluatedCodeCount: 1,
            trustedCodeCount: 0,
            reviewRequiredCodeCount: 1,
            unresolvedCodeCount: 0,
            insufficientSampleGroupCount: 0,
            overallWithinThirtyPercentRatio: 0.5,
          },
          calibrationQueues: {
            p50ReviewCandidates: [{
              standardWorkCode: '02-01-03-P07',
              replayContextKey: 'standard',
              queueStatus: 'manual_seed_review_required',
              recommendation: 'review_p50_or_split_condition_band',
              sampleCount: 1,
              seedStableCode: 'process_duration:cast_in_place_concrete',
              seedP50Days: 6,
              medianActualDays: 9,
              medianAbsolutePercentageError: 0.5,
              withinThirtyPercentRatio: 0.5,
              biasDirection: 'seed_underestimates_actual',
              selectedConditionCode: 'standard',
              seedConfidence: 'high',
              sampleIds: ['sample-1'],
              promotionPolicy: 'review_required_before_seed_promotion',
              seedWritePolicy: 'never_write_seed_from_replay',
            }],
            missingSeedCandidates: [],
            evidenceCollectionCandidates: [],
          },
          byStandardWorkCode: [],
        },
        governanceBoundary: {
          reportOnly: true,
          seedWritePolicy: 'never_write_seed_from_replay',
          promotionPolicy: 'review_required_before_seed_promotion',
          allowedUse: 'backend_governance_report',
        },
      },
      bridgeResult: {
        attemptedCandidateCount: 1,
        candidateOnlyUpsertedCount: 1,
        p50ReviewCandidateOnlyCount: 1,
        missingSeedCandidateOnlyCount: 0,
        evidenceCollectionSkippedCount: 0,
        failedCandidateCount: 0,
        seedWritesBlocked: 1,
        failed: [],
      },
      approvedCandidateIds: ['candidate-standard-1'],
      seedVersionId: 'seed-version-standard-work-duration-v2',
      runtimePublicationKey: 'algorithm_seed_versions:standard-v2',
      rollbackTarget: 'algorithm_seed_versions:standard-v1',
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })
    const special = buildSpecialWorkDurationSeedPublicationReadiness({
      candidateOutcome: { generatedRowCount: 10, retainedRowCount: 7, rejectedRowCount: 3, pendingRowCount: 0 },
      approvedCandidateEventIds: ['candidate-special-1'],
      seedVersionId: 'special-seed-version-v2',
      runtimePublicationKey: 'wbs_template_runtime:special-seed-version-v2',
      rollbackTarget: 'wbs_template_runtime:special-seed-version-v1',
      generatedEntityIds: ['task-1'],
      enabledLearningScopes: ['system', 'segment_baseline', 'company', 'project'],
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })
    const wbs = buildWbsReferenceDaysPublicationReadiness({
      runtimeGate: {
        version: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_VERSION,
        status: 'pass',
        expectedScenarioCount: 13,
        resultCount: 13,
        thresholds: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS,
        findings: [],
        summary: { failedScenarioCount: 0 },
      },
      templateReferenceDaysOutcomeRecorded: true,
      approvedCandidateEventIds: ['candidate-wbs-reference-1'],
      referenceDaysVersionId: 'wbs-reference-days-v2',
      runtimePublicationKey: 'wbs_reference_days_runtime:wbs-reference-days-v2',
      rollbackTarget: 'wbs_reference_days_runtime:wbs-reference-days-v1',
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })
    const dependency = buildConstructionDependencyRulePublicationReadiness({
      replayReport: {
        reportCode: 'construction_dependency_replay_calibration',
        generatedAt: '2026-06-14T00:00:00.000Z',
        governancePolicy: {
          replayMode: 'report_only',
          seedWritePolicy: 'never_write_seed_from_replay',
          taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay',
          promotionPolicy: 'manual_seed_review_required',
        },
        summary: {
          inputDependencyCount: 1,
          matchedDependencyCount: 1,
          comparableActualDateCount: 1,
          l3MatchedDependencyCount: 1,
          l4MatchedDependencyCount: 0,
          validatedDependencyCount: 0,
          reviewRequiredDependencyCount: 1,
          conflictDependencyCount: 0,
          insufficientActualDateCount: 0,
          unmatchedSeedCount: 0,
        },
        calibrationQueues: {
          l3LagCalibrationCandidates: [{
            matchedLayer: 'cross_item_workflow',
            matchedSeedCode: 'prefab_factory_to_site_hoist_handoff',
            sampleCount: 1,
            projectCount: 1,
            conflictCount: 0,
            seedLagDays: 2,
            medianObservedWaitDays: 4,
            suggestedLagDays: 4,
            queueStatus: 'manual_review_required',
            recommendation: 'review_nonzero_lag_or_condition_profile',
            promotionPolicy: 'Manual seed review required before changing L3 lagDays.',
            sampleDependencyIds: ['dep-1'],
            projectIds: ['project-1'],
          }],
          l4ConflictQuarantineCandidates: [],
          evidenceCollectionCandidates: [],
        },
        items: [],
      },
      dependencyOutcomeEventRecorded: true,
      approvedCandidateEventIds: ['candidate-dependency-1'],
      dependencyRuleVersionId: 'dependency-rule-version-v2',
      runtimePublicationKey: 'dependency_rule_runtime:dependency-rule-version-v2',
      rollbackTarget: 'dependency_rule_runtime:dependency-rule-version-v1',
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })
    const critical = buildCriticalPathRulePublicationReadiness({
      criticalPathSnapshot: {
        projectId: 'project-1',
        autoTaskIds: ['task-b'],
        manualAttentionTaskIds: [],
        manualInsertedTaskIds: [],
        primaryChain: {
          id: 'project-1-auto-critical-chain',
          source: 'auto',
          taskIds: ['task-b'],
          totalDurationDays: 8,
          displayLabel: 'A',
        },
        alternateChains: [],
        displayTaskIds: ['task-b'],
        watchedTaskIds: [],
        edges: [],
        tasks: [{
          taskId: 'task-b',
          title: 'B',
          floatDays: 0,
          durationDays: 8,
          isAutoCritical: true,
          isManualAttention: false,
          isManualInserted: false,
        }],
        projectDurationDays: 8,
        calculatedAt: '2026-06-14T00:00:00.000Z',
        calculationStatus: 'fresh',
        networkLineage: {
          criticalPathAlgorithmVersion: 'critical_path_cpm_v1',
          taskNetworkInputHash: 'sha256:task-network',
          dependencyInputHash: 'sha256:dependency-network',
          criticalPathInputHash: 'sha256:critical-path-input',
          criticalSetHash: 'sha256:critical-set',
          dependencyRuleVersion: 'task_dependencies:sha256:rules',
          baselineVersionIds: [],
          baselineItemIds: [],
          baselineVersionSource: 'not_linked',
        },
      },
      criticalPathOutcomeEventRecorded: true,
      approvedCandidateEventIds: ['candidate-critical-1'],
      criticalPathRuleVersionId: 'critical-path-rule-version-v2',
      runtimePublicationKey: 'critical_path_rule_runtime:critical-path-rule-version-v2',
      rollbackTarget: 'critical_path_rule_runtime:critical-path-rule-version-v1',
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })

    const audit = buildDurationLiveLearningCompletionAudit({
      evidenceOverrides: [
        { assetKey: 'base_duration_benchmark', evidence: base.liveLearningEvidence },
        { assetKey: 'duration_cold_start_baseline', evidence: cold.liveLearningEvidence },
        { assetKey: 'forecast_residual_overlay', evidence: residual.liveLearningEvidence },
        { assetKey: 'forecast_confidence_weight', evidence: confidence.liveLearningEvidence },
        { assetKey: 'standard_work_duration_seed', evidence: standard.liveLearningEvidence },
        { assetKey: 'special_work_duration_seed', evidence: special.liveLearningEvidence },
        { assetKey: 'wbs_reference_days', evidence: wbs.liveLearningEvidence },
        { assetKey: 'dependency_rule_candidate', evidence: dependency.liveLearningEvidence },
        { assetKey: 'critical_path_rule_candidate', evidence: critical.liveLearningEvidence },
      ],
    })

    expect([
      base.status,
      cold.status,
      residual.status,
      confidence.status,
      standard.status,
      special.status,
      wbs.status,
      dependency.status,
      critical.status,
    ]).toEqual([
      'base_duration_benchmark_live_learning_ready',
      'cold_start_live_learning_ready',
      'forecast_scoped_runtime_live_learning_ready',
      'forecast_scoped_runtime_live_learning_ready',
      'standard_work_seed_publication_ready',
      'special_work_seed_publication_ready',
      'wbs_reference_days_publication_ready',
      'dependency_rule_publication_ready',
      'critical_path_rule_publication_ready',
    ])
    expect(audit.status).toBe('duration_live_learning_completion_ready')
    expect(audit.blockedAssetKeys).toEqual([])
    expect(audit.factRewriteBlockedAssetKeys).toEqual([])
  })
})
