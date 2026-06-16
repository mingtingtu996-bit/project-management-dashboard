import { describe, expect, it } from 'vitest'
import { V1475_EXPLICIT_BUSINESS_GATE_SOURCE_ID } from '../seeds/v1475DependencyIntentTemplates.js'
import {
  buildConstructionDependencyRulePublicationReadinessFromProductionRows,
  buildConstructionDependencyRulePublicationReadiness,
  collectAndPersistConstructionDependencyReplayCalibrationCandidates,
  collectConstructionDependencyReplayCalibrationReport,
  evaluateConstructionDependencyRuleCandidateLiveLearningEvidence,
} from '../services/constructionDependencyReplayCalibrationService.js'

describe('construction dependency replay calibration service', () => {
  it('back-validates L3/L4 dependencies with actual project dates without mutating seeds or task dependencies', async () => {
    const rows = [
      {
        id: 'dep-l3-zero-lag',
        project_id: 'project-1',
        dependency_type: 'FS',
        lag_days: 0,
        source_type: 'cross_item_workflow',
        metadata: { seedRuleId: 'prefab_factory_to_site_hoist_handoff' },
        predecessor_task_id: 'task-prefab-factory-release',
        predecessor_task_code: 'PFB-00-01-02-P01',
        predecessor_title: 'prefab factory release',
        predecessor_actual_end_date: '2026-06-01',
        successor_task_id: 'task-prefab-site-hoist',
        successor_task_code: 'PFB-01-01-03-P01',
        successor_title: 'prefab site hoist start',
        successor_actual_start_date: '2026-06-04',
      },
      {
        id: 'dep-l3-zero-lag-second-project',
        project_id: 'project-2',
        dependency_type: 'FS',
        lag_days: 0,
        source_type: 'cross_item_workflow',
        metadata: { seedRuleId: 'prefab_factory_to_site_hoist_handoff' },
        predecessor_task_id: 'task-prefab-factory-release-p2',
        predecessor_task_code: 'PFB-00-01-02-P02',
        predecessor_title: 'prefab factory release',
        predecessor_actual_end_date: '2026-07-01',
        successor_task_id: 'task-prefab-site-hoist-p2',
        successor_task_code: 'PFB-01-01-03-P02',
        successor_title: 'prefab site hoist start',
        successor_actual_start_date: '2026-07-05',
      },
      {
        id: 'dep-l4-validated',
        project_id: 'project-1',
        dependency_type: 'FS',
        lag_days: 1,
        source_type: 'dependency_intent_template',
        metadata: {
          sourceSeedRuleIds: [V1475_EXPLICIT_BUSINESS_GATE_SOURCE_ID],
          explicitBusinessGateTemplate: true,
        },
        predecessor_task_id: 'task-pit-approval',
        predecessor_task_code: 'DANGER-DEEP-PIT-APPROVAL',
        predecessor_title: 'deep pit plan approval',
        predecessor_actual_end_date: '2026-06-01',
        successor_task_id: 'task-excavation',
        successor_task_code: '01-05-01-P01',
        successor_title: 'earthwork excavation',
        successor_actual_start_date: '2026-06-02',
      },
      {
        id: 'dep-l4-conflict',
        project_id: 'project-1',
        dependency_type: 'FS',
        lag_days: 1,
        source_type: 'dependency_intent_template',
        metadata: {
          sourceSeedRuleIds: [V1475_EXPLICIT_BUSINESS_GATE_SOURCE_ID],
          explicitBusinessGateTemplate: true,
        },
        predecessor_task_id: 'task-fire-acceptance',
        predecessor_task_code: 'MS-FIRE-ACCEPTANCE',
        predecessor_title: 'fire acceptance',
        predecessor_actual_end_date: '2026-06-10',
        successor_task_id: 'task-occupancy-release',
        successor_task_code: 'MS-OCCUPANCY-USE',
        successor_title: 'occupancy use release',
        successor_actual_start_date: '2026-06-08',
      },
    ]

    const report = await collectConstructionDependencyReplayCalibrationReport({
      projectIds: ['project-1'],
      queryRows: async <T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> => {
        expect(sql).toContain('task_dependencies')
        expect(sql).toContain('dependency_task')
        expect(sql).toContain('successor_task')
        expect(params).toEqual([['project-1'], 200])
        return rows as T[]
      },
    })

    expect(report).toMatchObject({
      reportCode: 'construction_dependency_replay_calibration',
      governancePolicy: {
        replayMode: 'report_only',
        seedWritePolicy: 'never_write_seed_from_replay',
        taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay',
        promotionPolicy: 'manual_seed_review_required',
      },
      summary: {
        inputDependencyCount: 4,
        comparableActualDateCount: 4,
        l3MatchedDependencyCount: 2,
        l4MatchedDependencyCount: 2,
        validatedDependencyCount: 1,
        reviewRequiredDependencyCount: 2,
        conflictDependencyCount: 1,
      },
    })

    expect(report.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dependencyId: 'dep-l3-zero-lag',
        matchedLayer: 'cross_item_workflow',
        matchedSeedCode: 'prefab_factory_to_site_hoist_handoff',
        dependencyLagDays: 0,
        seedLagDays: 2,
        observedWaitDays: 3,
        replayStatus: 'needs_lag_calibration',
        recommendation: 'review_nonzero_lag_or_condition_profile',
      }),
      expect.objectContaining({
        dependencyId: 'dep-l4-validated',
        matchedLayer: 'cross_business_domain_dependency_intent',
        matchedSeedCode: 'deep_pit_danger_control_approval_to_excavation_release',
        seedLagDays: 1,
        observedWaitDays: 1,
        replayStatus: 'validated',
        recommendation: 'keep_seed_rule',
      }),
      expect.objectContaining({
        dependencyId: 'dep-l4-conflict',
        matchedLayer: 'cross_business_domain_dependency_intent',
        matchedSeedCode: 'fire_acceptance_to_occupancy_use_release',
        observedWaitDays: -2,
        replayStatus: 'actual_order_conflict',
        recommendation: 'quarantine_or_manual_review',
      }),
    ]))

    expect(report.calibrationQueues).toEqual(expect.objectContaining({
      l3LagCalibrationCandidates: [
        expect.objectContaining({
          matchedSeedCode: 'prefab_factory_to_site_hoist_handoff',
          matchedLayer: 'cross_item_workflow',
          sampleCount: 2,
          projectCount: 2,
          seedLagDays: 2,
          medianObservedWaitDays: 4,
          suggestedLagDays: 4,
          queueStatus: 'manual_review_required',
          promotionPolicy: expect.stringMatching(/manual|seed|review/i),
          sampleDependencyIds: expect.arrayContaining(['dep-l3-zero-lag', 'dep-l3-zero-lag-second-project']),
        }),
      ],
      l4ConflictQuarantineCandidates: [
        expect.objectContaining({
          matchedSeedCode: 'fire_acceptance_to_occupancy_use_release',
          matchedLayer: 'cross_business_domain_dependency_intent',
          sampleCount: 1,
          conflictCount: 1,
          queueStatus: 'quarantine_review_required',
          sampleDependencyIds: ['dep-l4-conflict'],
        }),
      ],
    }))
  })

  it('records dependency-rule replay candidates as plan-network outcomes without mutating task dependencies', async () => {
    const rows = [
      {
        id: 'dep-l3-zero-lag',
        project_id: 'project-1',
        dependency_type: 'FS',
        lag_days: 0,
        source_type: 'cross_item_workflow',
        metadata: { seedRuleId: 'prefab_factory_to_site_hoist_handoff' },
        predecessor_task_id: 'task-prefab-factory-release',
        predecessor_task_code: 'PFB-00-01-02-P01',
        predecessor_title: 'prefab factory release',
        predecessor_actual_end_date: '2026-06-01',
        successor_task_id: 'task-prefab-site-hoist',
        successor_task_code: 'PFB-01-01-03-P01',
        successor_title: 'prefab site hoist start',
        successor_actual_start_date: '2026-06-04',
      },
      {
        id: 'dep-l3-zero-lag-second-project',
        project_id: 'project-2',
        dependency_type: 'FS',
        lag_days: 0,
        source_type: 'cross_item_workflow',
        metadata: { seedRuleId: 'prefab_factory_to_site_hoist_handoff' },
        predecessor_task_id: 'task-prefab-factory-release-p2',
        predecessor_task_code: 'PFB-00-01-02-P02',
        predecessor_title: 'prefab factory release',
        predecessor_actual_end_date: '2026-07-01',
        successor_task_id: 'task-prefab-site-hoist-p2',
        successor_task_code: 'PFB-01-01-03-P02',
        successor_title: 'prefab site hoist start',
        successor_actual_start_date: '2026-07-05',
      },
    ]
    const queryExecCalls: Array<{ sql: string; params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      queryExecCalls.push({ sql, params })
      return [] as T[]
    }

    const result = await collectAndPersistConstructionDependencyReplayCalibrationCandidates({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectIds: ['project-1', 'project-2'],
      queryRows: async <T = Record<string, unknown>>(): Promise<T[]> => rows as T[],
      queryExec,
    })

    expect(result.report.summary.comparableActualDateCount).toBe(2)
    const outcomeInsert = queryExecCalls.find((call) =>
      call.sql.toLowerCase().includes('insert into public.duration_plan_network_outcomes'),
    )

    expect(outcomeInsert).toBeTruthy()
    expect(outcomeInsert?.sql.toLowerCase()).toContain('on conflict (id) do update')
    expect(outcomeInsert?.sql.toLowerCase()).not.toContain('insert into public.task_dependencies')
    expect(outcomeInsert?.sql.toLowerCase()).not.toContain('update public.task_dependencies')
    expect(outcomeInsert?.params).toEqual([
      'dependency-rule-candidate:cross_item_workflow:prefab_factory_to_site_hoist_handoff:10000000-0000-4000-8000-000000000001:multi-project',
      'dependency_rule_candidate',
      'weak',
      'construction_dependency_replay_calibration:cross_item_workflow:prefab_factory_to_site_hoist_handoff',
      'project',
      '10000000-0000-4000-8000-000000000001',
      null,
      null,
      expect.objectContaining({
        source: 'construction_dependency_replay_calibration',
        matched_layer: 'cross_item_workflow',
        matched_seed_code: 'prefab_factory_to_site_hoist_handoff',
        sample_count: 2,
        project_count: 2,
        conflict_count: 0,
        writes_runtime_directly: false,
        writes_fact_directly: false,
      }),
      false,
      false,
    ])
  })

  it('requires replay outcome, candidate approval, dedicated writer, lineage, and release gates before dependency rules are live-learning ready', () => {
    const report = {
      reportCode: 'construction_dependency_replay_calibration' as const,
      generatedAt: '2026-06-14T00:00:00.000Z',
      governancePolicy: {
        replayMode: 'report_only' as const,
        seedWritePolicy: 'never_write_seed_from_replay' as const,
        taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay' as const,
        promotionPolicy: 'manual_seed_review_required' as const,
      },
      summary: {
        inputDependencyCount: 4,
        matchedDependencyCount: 4,
        comparableActualDateCount: 4,
        l3MatchedDependencyCount: 2,
        l4MatchedDependencyCount: 2,
        validatedDependencyCount: 2,
        reviewRequiredDependencyCount: 1,
        conflictDependencyCount: 0,
        insufficientActualDateCount: 0,
        unmatchedSeedCount: 0,
      },
      calibrationQueues: {
        l3LagCalibrationCandidates: [{
          matchedLayer: 'cross_item_workflow' as const,
          matchedSeedCode: 'prefab_factory_to_site_hoist_handoff',
          sampleCount: 3,
          projectCount: 2,
          conflictCount: 0,
          seedLagDays: 2,
          medianObservedWaitDays: 4,
          suggestedLagDays: 4,
          queueStatus: 'manual_review_required' as const,
          recommendation: 'review_nonzero_lag_or_condition_profile' as const,
          promotionPolicy: 'Manual seed review required before changing L3 lagDays.',
          sampleDependencyIds: ['dep-1', 'dep-2', 'dep-3'],
          projectIds: ['project-1', 'project-2'],
        }],
        l4ConflictQuarantineCandidates: [],
        evidenceCollectionCandidates: [],
      },
      items: [],
    }

    const decision = evaluateConstructionDependencyRuleCandidateLiveLearningEvidence({
      replayReport: report,
      dependencyOutcomeEventRecorded: true,
      approvedDependencyRuleCandidateRecorded: true,
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      runtimeConsumerUsesPublishedArtifact: true,
      dependencyRulePublicationWriterReady: true,
      dependencyRuleLineageRecorded: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    })

    expect(decision).toEqual({
      status: 'dependency_rule_candidate_live_learning_ready',
      liveLearningEvidence: {
        assetClassificationRegistered: true,
        predictionEventRecorded: true,
        actualOutcomeEventRecorded: true,
        tieredLearningPolicyRegistered: true,
        enabledLearningScopes: ['global', 'industry', 'company', 'project'],
        runtimeConsumerUsesPublishedArtifact: true,
        replayReportOnly: true,
        dependencyWritePolicyPreserved: true,
        dependencyRuleCandidatePresent: true,
        approvedDependencyRuleCandidateRecorded: true,
        dependencyRulePublicationWriterReady: true,
        dependencyRuleLineageRecorded: true,
        releaseExitApproved: true,
        impactMonitoringReady: true,
        rollbackTargetReady: true,
        accuracyMetricsAvailable: true,
        comparableActualDateCount: 4,
      },
      missingReasons: [],
    })
  })

  it('builds a dependency rule publication readiness package from approved replay candidates', () => {
    const report = {
      reportCode: 'construction_dependency_replay_calibration' as const,
      generatedAt: '2026-06-14T00:00:00.000Z',
      governancePolicy: {
        replayMode: 'report_only' as const,
        seedWritePolicy: 'never_write_seed_from_replay' as const,
        taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay' as const,
        promotionPolicy: 'manual_seed_review_required' as const,
      },
      summary: {
        inputDependencyCount: 4,
        matchedDependencyCount: 4,
        comparableActualDateCount: 4,
        l3MatchedDependencyCount: 2,
        l4MatchedDependencyCount: 2,
        validatedDependencyCount: 2,
        reviewRequiredDependencyCount: 1,
        conflictDependencyCount: 0,
        insufficientActualDateCount: 0,
        unmatchedSeedCount: 0,
      },
      calibrationQueues: {
        l3LagCalibrationCandidates: [{
          matchedLayer: 'cross_item_workflow' as const,
          matchedSeedCode: 'prefab_factory_to_site_hoist_handoff',
          sampleCount: 3,
          projectCount: 2,
          conflictCount: 0,
          seedLagDays: 2,
          medianObservedWaitDays: 4,
          suggestedLagDays: 4,
          queueStatus: 'manual_review_required' as const,
          recommendation: 'review_nonzero_lag_or_condition_profile' as const,
          promotionPolicy: 'Manual seed review required before changing L3 lagDays.',
          sampleDependencyIds: ['dep-1', 'dep-2', 'dep-3'],
          projectIds: ['project-1', 'project-2'],
        }],
        l4ConflictQuarantineCandidates: [],
        evidenceCollectionCandidates: [],
      },
      items: [],
    }

    const readiness = buildConstructionDependencyRulePublicationReadiness({
      replayReport: report,
      dependencyOutcomeEventRecorded: true,
      approvedCandidateEventIds: ['dependency-candidate-1', 'dependency-candidate-1'],
      dependencyRuleVersionId: 'dependency-rule-version-v2',
      runtimePublicationKey: 'dependency_rule_runtime:dependency-rule-version-v2',
      runtimeConsumerObservationRef: 'runtime_consumer:consumer-dependency-rule-1',
      runtimeConsumerPublicationKey: 'dependency_rule_runtime:dependency-rule-version-v2',
      rollbackTarget: 'dependency_rule_runtime:dependency-rule-version-v1',
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })

    expect(readiness.status).toBe('dependency_rule_publication_ready')
    expect(readiness.liveLearningEvidence).toEqual(expect.objectContaining({
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      dependencyRuleCandidatePresent: true,
      approvedDependencyRuleCandidateRecorded: true,
      dependencyRulePublicationWriterReady: true,
      dependencyRuleLineageRecorded: true,
      runtimeConsumerUsesPublishedArtifact: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
      comparableActualDateCount: 4,
    }))
    expect(readiness.dependencyRuleLineage).toEqual({
      assetType: 'dependency_rule_candidate',
      dependencyRuleVersionId: 'dependency-rule-version-v2',
      runtimePublicationKey: 'dependency_rule_runtime:dependency-rule-version-v2',
      rollbackTarget: 'dependency_rule_runtime:dependency-rule-version-v1',
      approvedCandidateEventIds: ['dependency-candidate-1'],
      sourceDependencyIds: ['dep-1', 'dep-2', 'dep-3'],
      matchedSeedCodes: ['prefab_factory_to_site_hoist_handoff'],
      replayReportCode: 'construction_dependency_replay_calibration',
      comparableActualDateCount: 4,
    })
    expect(readiness.missingReasons).toEqual([])
  })

  it('builds dependency rule publication readiness from production source rows without writing task dependencies', () => {
    const report = {
      reportCode: 'construction_dependency_replay_calibration' as const,
      generatedAt: '2026-06-14T00:00:00.000Z',
      governancePolicy: {
        replayMode: 'report_only' as const,
        seedWritePolicy: 'never_write_seed_from_replay' as const,
        taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay' as const,
        promotionPolicy: 'manual_seed_review_required' as const,
      },
      summary: {
        inputDependencyCount: 4,
        matchedDependencyCount: 4,
        comparableActualDateCount: 4,
        l3MatchedDependencyCount: 2,
        l4MatchedDependencyCount: 2,
        validatedDependencyCount: 2,
        reviewRequiredDependencyCount: 1,
        conflictDependencyCount: 0,
        insufficientActualDateCount: 0,
        unmatchedSeedCount: 0,
      },
      calibrationQueues: {
        l3LagCalibrationCandidates: [{
          matchedLayer: 'cross_item_workflow' as const,
          matchedSeedCode: 'prefab_factory_to_site_hoist_handoff',
          sampleCount: 3,
          projectCount: 2,
          conflictCount: 0,
          seedLagDays: 2,
          medianObservedWaitDays: 4,
          suggestedLagDays: 4,
          queueStatus: 'manual_review_required' as const,
          recommendation: 'review_nonzero_lag_or_condition_profile' as const,
          promotionPolicy: 'Manual seed review required before changing L3 lagDays.',
          sampleDependencyIds: ['dep-1', 'dep-2', 'dep-3'],
          projectIds: ['project-1', 'project-2'],
        }],
        l4ConflictQuarantineCandidates: [],
        evidenceCollectionCandidates: [],
      },
      items: [],
    }

    const readiness = buildConstructionDependencyRulePublicationReadinessFromProductionRows({
      replayReport: report,
      approvedCandidateEventIds: ['dependency-candidate-1'],
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      records: [{
        assetKey: 'dependency_rule_candidate',
        evidenceKind: 'production_sample',
        evidenceRef: 'network_outcomes:dependency-rule-outcome-1',
        evidenceStatus: 'accepted',
      }],
      sourceRows: [
        {
          sourceTable: 'construction_dependency_rule_runtime_publications',
          row: {
            publication_key: 'dependency_rule_runtime:dependency-rule-version-v2',
            dependency_rule_version_id: 'dependency-rule-version-v2',
            runtime_publication_status: 'runtime_published',
            dependency_rule_lineage: { assetType: 'dependency_rule_candidate' },
            impact_monitoring: {
              status: 'monitoring_armed',
              eventRef: 'impact_monitoring:dependency_rule_runtime:dependency-rule-version-v2:armed',
            },
            rollback_execution: {
              status: 'rollback_verified',
              eventRef: 'rollback:dependency_rule_runtime:dependency-rule-version-v2:verified',
            },
          },
        },
        {
          sourceTable: 'runtime_consumer_observations',
          row: {
            id: 'consumer-dependency-rule-1',
            asset_key: 'dependency_rule_candidate',
            consumer_key: 'scheduleAccelerationService',
            publication_key: 'dependency_rule_runtime:dependency-rule-version-v2',
            observation_status: 'observed',
            writes_runtime_directly: false,
            writes_fact_directly: false,
          },
        },
        {
          sourceTable: 'duration_algorithm_accuracy_events',
          row: {
            id: 'accuracy-dependency-rule-1',
            absolute_error_days: 1,
            prediction_context: {
              assetKey: 'dependency_rule_candidate',
            },
            actual_context: {
              accuracyGateStatus: 'accuracy_passed',
            },
          },
        },
      ],
    })

    expect(readiness.status).toBe('dependency_rule_publication_ready')
    expect(readiness.liveLearningEvidence).toEqual(expect.objectContaining({
      actualOutcomeEventRecorded: true,
      dependencyRulePublicationWriterReady: true,
      dependencyRuleLineageRecorded: true,
      runtimeConsumerUsesPublishedArtifact: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    }))
    expect(readiness.dependencyRuleLineage).toEqual(expect.objectContaining({
      dependencyRuleVersionId: 'dependency-rule-version-v2',
      runtimePublicationKey: 'dependency_rule_runtime:dependency-rule-version-v2',
      rollbackTarget: 'rollback:dependency_rule_runtime:dependency-rule-version-v2:verified',
      approvedCandidateEventIds: ['dependency-candidate-1'],
      sourceDependencyIds: ['dep-1', 'dep-2', 'dep-3'],
    }))
    expect(readiness.productionLineage.evidenceRefs).toEqual(expect.objectContaining({
      productionSampleEvidenceRef: 'network_outcomes:dependency-rule-outcome-1',
      publicationExecutionRef: 'dependency_rule_runtime:dependency-rule-version-v2',
      runtimeConsumerObservationRef: 'runtime_consumer:consumer-dependency-rule-1',
      impactMonitoringEvidenceRef: 'impact_monitoring:dependency_rule_runtime:dependency-rule-version-v2:armed',
      rollbackDrillEvidenceRef: 'rollback:dependency_rule_runtime:dependency-rule-version-v2:verified',
      accuracyEvidenceRef: 'duration_algorithm_accuracy_events:accuracy-dependency-rule-1',
    }))
    expect(readiness.productionLineage.rejectedRows).toEqual([])
    expect(readiness.productionLineage.rejectedRecords).toEqual([])
  })

  it('keeps dependency rule publication readiness blocked when consumer observes a different runtime publication', () => {
    const report = {
      reportCode: 'construction_dependency_replay_calibration' as const,
      generatedAt: '2026-06-14T00:00:00.000Z',
      governancePolicy: {
        replayMode: 'report_only' as const,
        seedWritePolicy: 'never_write_seed_from_replay' as const,
        taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay' as const,
        promotionPolicy: 'manual_seed_review_required' as const,
      },
      summary: {
        inputDependencyCount: 4,
        matchedDependencyCount: 4,
        comparableActualDateCount: 4,
        l3MatchedDependencyCount: 2,
        l4MatchedDependencyCount: 2,
        validatedDependencyCount: 2,
        reviewRequiredDependencyCount: 1,
        conflictDependencyCount: 0,
        insufficientActualDateCount: 0,
        unmatchedSeedCount: 0,
      },
      calibrationQueues: {
        l3LagCalibrationCandidates: [{
          matchedLayer: 'cross_item_workflow' as const,
          matchedSeedCode: 'prefab_factory_to_site_hoist_handoff',
          sampleCount: 3,
          projectCount: 2,
          conflictCount: 0,
          seedLagDays: 2,
          medianObservedWaitDays: 4,
          suggestedLagDays: 4,
          queueStatus: 'manual_review_required' as const,
          recommendation: 'review_nonzero_lag_or_condition_profile' as const,
          promotionPolicy: 'Manual seed review required before changing L3 lagDays.',
          sampleDependencyIds: ['dep-1', 'dep-2', 'dep-3'],
          projectIds: ['project-1', 'project-2'],
        }],
        l4ConflictQuarantineCandidates: [],
        evidenceCollectionCandidates: [],
      },
      items: [],
    }

    const readiness = buildConstructionDependencyRulePublicationReadinessFromProductionRows({
      replayReport: report,
      approvedCandidateEventIds: ['dependency-candidate-1'],
      enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
      records: [{
        assetKey: 'dependency_rule_candidate',
        evidenceKind: 'production_sample',
        evidenceRef: 'network_outcomes:dependency-rule-outcome-1',
        evidenceStatus: 'accepted',
      }],
      sourceRows: [
        {
          sourceTable: 'construction_dependency_rule_runtime_publications',
          row: {
            publication_key: 'dependency_rule_runtime:dependency-rule-version-v2',
            dependency_rule_version_id: 'dependency-rule-version-v2',
            runtime_publication_status: 'runtime_published',
            dependency_rule_lineage: { assetType: 'dependency_rule_candidate' },
            impact_monitoring: {
              status: 'monitoring_armed',
              eventRef: 'impact_monitoring:dependency_rule_runtime:dependency-rule-version-v2:armed',
            },
            rollback_execution: {
              status: 'rollback_verified',
              eventRef: 'rollback:dependency_rule_runtime:dependency-rule-version-v2:verified',
            },
          },
        },
        {
          sourceTable: 'runtime_consumer_observations',
          row: {
            id: 'consumer-dependency-rule-1',
            asset_key: 'dependency_rule_candidate',
            consumer_key: 'scheduleAccelerationService',
            publication_key: 'dependency_rule_runtime:dependency-rule-version-v1',
            observation_status: 'observed',
            writes_runtime_directly: false,
            writes_fact_directly: false,
          },
        },
        {
          sourceTable: 'duration_algorithm_accuracy_events',
          row: {
            id: 'accuracy-dependency-rule-1',
            absolute_error_days: 1,
            prediction_context: {
              assetKey: 'dependency_rule_candidate',
            },
            actual_context: {
              accuracyGateStatus: 'accuracy_passed',
            },
          },
        },
      ],
    })

    expect(readiness.status).toBe('dependency_rule_publication_not_ready')
    expect(readiness.liveLearningEvidence.runtimeConsumerUsesPublishedArtifact).toBe(false)
    expect(readiness.missingReasons).toEqual(expect.arrayContaining([
      'runtime_consumer_publication_mismatch',
    ]))
  })

  it('keeps dependency rule publication readiness closed without approved lineage, publication, and release evidence', () => {
    const report = {
      reportCode: 'construction_dependency_replay_calibration' as const,
      generatedAt: '2026-06-14T00:00:00.000Z',
      governancePolicy: {
        replayMode: 'report_only' as const,
        seedWritePolicy: 'never_write_seed_from_replay' as const,
        taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay' as const,
        promotionPolicy: 'manual_seed_review_required' as const,
      },
      summary: {
        inputDependencyCount: 0,
        matchedDependencyCount: 0,
        comparableActualDateCount: 0,
        l3MatchedDependencyCount: 0,
        l4MatchedDependencyCount: 0,
        validatedDependencyCount: 0,
        reviewRequiredDependencyCount: 0,
        conflictDependencyCount: 0,
        insufficientActualDateCount: 0,
        unmatchedSeedCount: 0,
      },
      calibrationQueues: {
        l3LagCalibrationCandidates: [],
        l4ConflictQuarantineCandidates: [],
        evidenceCollectionCandidates: [],
      },
      items: [],
    }

    const readiness = buildConstructionDependencyRulePublicationReadiness({
      replayReport: report,
      dependencyOutcomeEventRecorded: false,
      approvedCandidateEventIds: [],
      dependencyRuleVersionId: '',
      runtimePublicationKey: '',
      rollbackTarget: '',
      enabledLearningScopes: ['system'],
      releaseExitApproved: false,
      impactMonitoringReady: false,
      accuracyMetricsAvailable: false,
    })

    expect(readiness.status).toBe('dependency_rule_publication_not_ready')
    expect(readiness.dependencyRuleLineage).toEqual(expect.objectContaining({
      assetType: 'dependency_rule_candidate',
      dependencyRuleVersionId: null,
      runtimePublicationKey: null,
      rollbackTarget: null,
      approvedCandidateEventIds: [],
      sourceDependencyIds: [],
      matchedSeedCodes: [],
    }))
    expect(readiness.missingReasons).toEqual(expect.arrayContaining([
      'dependency_replay_report_required',
      'dependency_actual_outcome_required',
      'dependency_replay_candidate_required',
      'approved_dependency_rule_candidate_required',
      'dependency_rule_publication_writer_required',
      'dependency_rule_lineage_required',
      'runtime_consumer_publication_required',
      'global_industry_company_project_learning_scopes_required',
      'release_exit_required',
      'impact_monitoring_required',
      'rollback_target_required',
      'accuracy_metrics_required',
    ]))
  })

  it('keeps dependency rule candidate live learning not ready without replay outcome or publication evidence', () => {
    const report = {
      reportCode: 'construction_dependency_replay_calibration' as const,
      generatedAt: '2026-06-14T00:00:00.000Z',
      governancePolicy: {
        replayMode: 'report_only' as const,
        seedWritePolicy: 'never_write_seed_from_replay' as const,
        taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay' as const,
        promotionPolicy: 'manual_seed_review_required' as const,
      },
      summary: {
        inputDependencyCount: 0,
        matchedDependencyCount: 0,
        comparableActualDateCount: 0,
        l3MatchedDependencyCount: 0,
        l4MatchedDependencyCount: 0,
        validatedDependencyCount: 0,
        reviewRequiredDependencyCount: 0,
        conflictDependencyCount: 0,
        insufficientActualDateCount: 0,
        unmatchedSeedCount: 0,
      },
      calibrationQueues: {
        l3LagCalibrationCandidates: [],
        l4ConflictQuarantineCandidates: [],
        evidenceCollectionCandidates: [],
      },
      items: [],
    }

    const decision = evaluateConstructionDependencyRuleCandidateLiveLearningEvidence({
      replayReport: report,
      dependencyOutcomeEventRecorded: false,
      approvedDependencyRuleCandidateRecorded: false,
      enabledLearningScopes: ['system'],
      runtimeConsumerUsesPublishedArtifact: false,
      dependencyRulePublicationWriterReady: false,
      dependencyRuleLineageRecorded: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    })

    expect(decision.status).toBe('dependency_rule_candidate_live_learning_not_ready')
    expect(decision.liveLearningEvidence).toEqual(expect.objectContaining({
      predictionEventRecorded: false,
      actualOutcomeEventRecorded: false,
      tieredLearningPolicyRegistered: false,
      runtimeConsumerUsesPublishedArtifact: false,
      dependencyRuleCandidatePresent: false,
      approvedDependencyRuleCandidateRecorded: false,
      dependencyRulePublicationWriterReady: false,
      dependencyRuleLineageRecorded: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    }))
    expect(decision.missingReasons).toEqual(expect.arrayContaining([
      'dependency_replay_report_required',
      'dependency_actual_outcome_required',
      'dependency_replay_candidate_required',
      'approved_dependency_rule_candidate_required',
      'dependency_rule_publication_writer_required',
      'dependency_rule_lineage_required',
      'runtime_consumer_publication_required',
      'global_industry_company_project_learning_scopes_required',
      'release_exit_required',
      'impact_monitoring_required',
      'rollback_target_required',
      'accuracy_metrics_required',
    ]))
  })
})
