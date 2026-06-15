import { describe, expect, it } from 'vitest'
import {
  buildCriticalPathRulePublicationReadinessFromProductionRows,
  buildCriticalPathRulePublicationReadiness,
} from '../services/criticalPathRulePublicationReadinessService.js'
import type { CriticalPathSnapshot } from '../services/projectCriticalPathService.js'

function buildCriticalPathSnapshot(): CriticalPathSnapshot {
  return {
    projectId: 'project-1',
    autoTaskIds: ['task-b'],
    manualAttentionTaskIds: [],
    manualInsertedTaskIds: [],
    primaryChain: {
      id: 'project-1-auto-critical-chain',
      source: 'auto' as const,
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
    calculationStatus: 'fresh' as const,
    networkLineage: {
      criticalPathAlgorithmVersion: 'critical_path_cpm_v1' as const,
      taskNetworkInputHash: 'sha256:task-network',
      dependencyInputHash: 'sha256:dependency-network',
      criticalPathInputHash: 'sha256:critical-path-input',
      criticalSetHash: 'sha256:critical-set',
      dependencyRuleVersion: 'task_dependencies:sha256:rules',
      baselineVersionIds: [],
      baselineItemIds: [],
      baselineVersionSource: 'not_linked' as const,
    },
  }
}

describe('criticalPathRulePublicationReadinessService', () => {
  it('builds a critical path rule publication readiness package from approved CPM candidates', () => {
    const readiness = buildCriticalPathRulePublicationReadiness({
      criticalPathSnapshot: buildCriticalPathSnapshot(),
      criticalPathOutcomeEventRecorded: true,
      approvedCandidateEventIds: ['critical-path-candidate-1', 'critical-path-candidate-1'],
      criticalPathRuleVersionId: 'critical-path-rule-version-v2',
      runtimePublicationKey: 'critical_path_rule_runtime:critical-path-rule-version-v2',
      rollbackTarget: 'critical_path_rule_runtime:critical-path-rule-version-v1',
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })

    expect(readiness.status).toBe('critical_path_rule_publication_ready')
    expect(readiness.liveLearningEvidence).toEqual(expect.objectContaining({
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      criticalPathProjectionEvidencePresent: true,
      approvedCriticalPathRuleCandidateRecorded: true,
      criticalPathRulePublicationWriterReady: true,
      criticalPathRuleLineageRecorded: true,
      runtimeConsumerUsesPublishedArtifact: true,
      criticalPathFactsRemainLocked: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
      criticalTaskCount: 1,
      projectedFloatTaskCount: 1,
    }))
    expect(readiness.criticalPathRuleLineage).toEqual({
      assetType: 'critical_path_rule_candidate',
      criticalPathRuleVersionId: 'critical-path-rule-version-v2',
      runtimePublicationKey: 'critical_path_rule_runtime:critical-path-rule-version-v2',
      rollbackTarget: 'critical_path_rule_runtime:critical-path-rule-version-v1',
      approvedCandidateEventIds: ['critical-path-candidate-1'],
      criticalPathInputHash: 'sha256:critical-path-input',
      criticalSetHash: 'sha256:critical-set',
      criticalPathAlgorithmVersion: 'critical_path_cpm_v1',
      criticalTaskIds: ['task-b'],
      projectDurationDays: 8,
    })
    expect(readiness.missingReasons).toEqual([])
  })

  it('builds critical path rule publication readiness from production source rows without mutating critical path facts', () => {
    const readiness = buildCriticalPathRulePublicationReadinessFromProductionRows({
      criticalPathSnapshot: buildCriticalPathSnapshot(),
      approvedCandidateEventIds: ['critical-path-candidate-1'],
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      records: [{
        assetKey: 'critical_path_rule_candidate',
        evidenceKind: 'production_sample',
        evidenceRef: 'network_outcomes:critical-path-outcome-1',
        evidenceStatus: 'accepted',
      }],
      sourceRows: [
        {
          sourceTable: 'construction_dependency_rule_runtime_publications',
          row: {
            publication_key: 'critical_path_rule_runtime:critical-path-rule-version-v2',
            critical_path_rule_version_id: 'critical-path-rule-version-v2',
            runtime_publication_status: 'runtime_published',
            dependency_rule_lineage: { assetType: 'critical_path_rule_candidate' },
            impact_monitoring: {
              status: 'monitoring_armed',
              eventRef: 'impact_monitoring:critical_path_rule_runtime:critical-path-rule-version-v2:armed',
            },
            rollback_execution: {
              status: 'rollback_verified',
              eventRef: 'rollback:critical_path_rule_runtime:critical-path-rule-version-v2:verified',
            },
          },
        },
        {
          sourceTable: 'runtime_consumer_observations',
          row: {
            id: 'consumer-critical-path-rule-1',
            asset_key: 'critical_path_rule_candidate',
            consumer_key: 'projectRemainingDurationForecastService',
            publication_key: 'critical_path_rule_runtime:critical-path-rule-version-v2',
            observation_status: 'observed',
            writes_runtime_directly: false,
            writes_fact_directly: false,
          },
        },
        {
          sourceTable: 'duration_algorithm_accuracy_events',
          row: {
            id: 'accuracy-critical-path-rule-1',
            absolute_error_days: 1,
            prediction_context: {
              assetKey: 'critical_path_rule_candidate',
            },
            actual_context: {
              accuracyGateStatus: 'accuracy_passed',
            },
          },
        },
      ],
    })

    expect(readiness.status).toBe('critical_path_rule_publication_ready')
    expect(readiness.liveLearningEvidence).toEqual(expect.objectContaining({
      actualOutcomeEventRecorded: true,
      criticalPathProjectionEvidencePresent: true,
      criticalPathRulePublicationWriterReady: true,
      criticalPathRuleLineageRecorded: true,
      criticalPathFactsRemainLocked: true,
      runtimeConsumerUsesPublishedArtifact: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    }))
    expect(readiness.criticalPathRuleLineage).toEqual(expect.objectContaining({
      criticalPathRuleVersionId: 'critical-path-rule-version-v2',
      runtimePublicationKey: 'critical_path_rule_runtime:critical-path-rule-version-v2',
      rollbackTarget: 'rollback:critical_path_rule_runtime:critical-path-rule-version-v2:verified',
      approvedCandidateEventIds: ['critical-path-candidate-1'],
      criticalPathInputHash: 'sha256:critical-path-input',
      criticalSetHash: 'sha256:critical-set',
    }))
    expect(readiness.productionLineage.evidenceRefs).toEqual(expect.objectContaining({
      productionSampleEvidenceRef: 'network_outcomes:critical-path-outcome-1',
      publicationExecutionRef: 'critical_path_rule_runtime:critical-path-rule-version-v2',
      runtimeConsumerObservationRef: 'runtime_consumer:consumer-critical-path-rule-1',
      impactMonitoringEvidenceRef: 'impact_monitoring:critical_path_rule_runtime:critical-path-rule-version-v2:armed',
      rollbackDrillEvidenceRef: 'rollback:critical_path_rule_runtime:critical-path-rule-version-v2:verified',
      accuracyEvidenceRef: 'duration_algorithm_accuracy_events:accuracy-critical-path-rule-1',
    }))
    expect(readiness.productionLineage.rejectedRows).toEqual([])
    expect(readiness.productionLineage.rejectedRecords).toEqual([])
  })

  it('keeps critical path rule publication readiness closed without prediction, approvals, lineage, and release evidence', () => {
    const readiness = buildCriticalPathRulePublicationReadiness({
      criticalPathSnapshot: {
        projectId: 'project-empty',
        autoTaskIds: [],
        manualAttentionTaskIds: [],
        manualInsertedTaskIds: [],
        primaryChain: null,
        alternateChains: [],
        displayTaskIds: [],
        watchedTaskIds: [],
        edges: [],
        tasks: [],
        projectDurationDays: 0,
        calculationStatus: 'empty_after_failure',
      },
      criticalPathOutcomeEventRecorded: false,
      approvedCandidateEventIds: [],
      criticalPathRuleVersionId: '',
      runtimePublicationKey: '',
      rollbackTarget: '',
      enabledLearningScopes: ['company'],
      releaseExitApproved: false,
      impactMonitoringReady: false,
      accuracyMetricsAvailable: false,
    })

    expect(readiness.status).toBe('critical_path_rule_publication_not_ready')
    expect(readiness.criticalPathRuleLineage).toEqual(expect.objectContaining({
      assetType: 'critical_path_rule_candidate',
      criticalPathRuleVersionId: null,
      runtimePublicationKey: null,
      rollbackTarget: null,
      approvedCandidateEventIds: [],
      criticalTaskIds: [],
      projectDurationDays: 0,
    }))
    expect(readiness.missingReasons).toEqual([
      'critical_path_prediction_snapshot_required',
      'critical_path_actual_outcome_required',
      'approved_critical_path_rule_candidate_required',
      'critical_path_rule_publication_writer_required',
      'critical_path_rule_lineage_required',
      'runtime_consumer_publication_required',
      'global_industry_company_project_learning_scopes_required',
      'release_exit_required',
      'impact_monitoring_required',
      'rollback_target_required',
      'accuracy_metrics_required',
    ])
  })
})
