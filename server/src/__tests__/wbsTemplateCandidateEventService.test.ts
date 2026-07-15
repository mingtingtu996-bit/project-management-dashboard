import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const aggregationQuery: {
    eq: ReturnType<typeof vi.fn>
    maybeSingle: ReturnType<typeof vi.fn>
  } = {
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  }
  aggregationQuery.eq.mockReturnValue(aggregationQuery)

  return {
    eventInsert: vi.fn(),
    aggregationSelect: vi.fn(),
    aggregationUpsert: vi.fn(),
    planNetworkOutcomeUpsert: vi.fn(),
    aggregationQuery,
    rawQuery: vi.fn(),
    from: vi.fn(),
    logger: {
      warn: vi.fn(),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

const {
  buildSpecialWorkDurationSeedPublicationReadinessFromProductionRows,
  buildSpecialWorkDurationSeedPublicationReadiness,
  evaluateSpecialWorkDurationSeedLiveLearningEvidence,
  recordWbsTemplateCandidateEvent,
} = await import('../services/wbsTemplateCandidateEventService.js')

describe('wbsTemplateCandidateEventService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.eventInsert.mockResolvedValue({ error: null })
    mocks.aggregationSelect.mockReturnValue(mocks.aggregationQuery)
    mocks.aggregationQuery.maybeSingle.mockResolvedValue({
      data: {
        total_candidates: 2,
        accepted_candidates: 1,
        rejected_candidates: 1,
        pending_candidates: 0,
        metadata: { previous: true },
      },
      error: null,
    })
    mocks.aggregationUpsert.mockResolvedValue({ error: null })
    mocks.planNetworkOutcomeUpsert.mockResolvedValue({ error: null })
    mocks.rawQuery.mockResolvedValue({ rows: [{ id: 'algorithm-candidate-event-id' }] })
    mocks.from.mockImplementation((tableName: string) => {
      if (tableName === 'wbs_template_candidate_events') {
        return { insert: mocks.eventInsert }
      }
      if (tableName === 'wbs_template_candidate_aggregations') {
        return {
          select: mocks.aggregationSelect,
          upsert: mocks.aggregationUpsert,
        }
      }
      if (tableName === 'duration_plan_network_outcomes') {
        return { upsert: mocks.planNetworkOutcomeUpsert }
      }
      return {}
    })
  })

  it('bridges WBS template commit candidates into unified algorithm asset governance events', async () => {
    await recordWbsTemplateCandidateEvent({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      generationBatchId: 'batch-1',
      templateId: 'china-gb55032-2022',
      selectedNodeIds: ['02-01-01'],
      scope: { building_object_id: 'building-1' },
      generatedEntityIds: ['task-1', 'task-2', 'task-3'],
      generatedRowCount: 4,
      retainedRowCount: 3,
      rejectedRowCount: 1,
      actorId: '00000000-0000-4000-8000-000000000002',
      metadata: { source: 'task_list_commit' },
    })

    const sql = mocks.rawQuery.mock.calls.map((call) => String(call[0])).join('\n').toLowerCase()
    expect(sql).toContain('insert into public.algorithm_asset_candidate_events')
    expect(sql).not.toContain('task_dependencies')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('algorithm_seed_versions')

    const candidateInsert = mocks.rawQuery.mock.calls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.algorithm_asset_candidate_events'),
    )
    expect(candidateInsert).toBeTruthy()
    expect(candidateInsert?.[1]).toEqual(expect.arrayContaining([
      'wbs.template.china-gb55032-2022.task_list',
      'wbsTemplateCandidateEventService',
      'project',
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      'template_structure',
      'governed_candidate',
      'candidate_only',
      'manual_required',
      'review_required',
    ]))
    expect(candidateInsert?.[1]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        templateId: 'china-gb55032-2022',
        surface: 'task_list',
        generatedRowCount: 4,
        retainedRowCount: 3,
        rejectedRowCount: 1,
        generatedEntityIds: ['task-1', 'task-2', 'task-3'],
      }),
    ]))
  })

  it('bridges untrusted generation depth schedule trust gates into governed rule candidates without writing runtime facts', async () => {
    await recordWbsTemplateCandidateEvent({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      generationBatchId: 'batch-generation-depth-review',
      templateId: 'china-mep-coordination',
      selectedNodeIds: ['MEP-01-01'],
      scope: { building_object_id: 'building-1', project_type_code: 'commercial' },
      generatedEntityIds: ['task-1', 'task-2'],
      generatedRowCount: 2,
      retainedRowCount: 2,
      actorId: '00000000-0000-4000-8000-000000000002',
      metadata: {
        source: 'task_list_commit',
        templateGroup: 'mep',
        packType: 'specialty',
      },
      scheduleTrustGate: {
        source: 'generation_depth_policy',
        generationDepth: 'sub_division',
        status: 'review_required',
        trustedForScheduling: false,
        totalScheduleRows: 2,
        durationBearingScheduleRows: 2,
        fallbackPolicyRowCount: 1,
        descendantRollupRequiredRowCount: 1,
        descendantRollupAppliedRowCount: 0,
        missingDescendantRollupRowCount: 1,
        rowsMissingReferenceDuration: 0,
        policyConfidenceCounts: { high: 1, medium: 0, low: 1 },
        reviewReasons: [
          'generation_depth_policy_fallback',
          'missing_descendant_duration_rollup',
        ],
        reviewRows: [{
          stableCode: 'MEP-01-01',
          title: '机电综合天花预留预埋',
          reasons: [
            'generation_depth_policy_fallback',
            'missing_descendant_duration_rollup',
          ],
          policyId: 'fallback-subdivision-managed-frontier',
          confidence: 'low',
        }],
      },
    } as any)

    const sql = mocks.rawQuery.mock.calls.map((call) => String(call[0])).join('\n').toLowerCase()
    expect(sql).toContain('insert into public.algorithm_asset_candidate_events')
    expect(sql).not.toContain('task_dependencies')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('algorithm_seed_versions')
    expect(sql).not.toContain('task_baselines')

    const generationDepthInsert = mocks.rawQuery.mock.calls.find((call) => {
      const params = call[1] as unknown[]
      return params?.includes('generation_depth_policy.china-mep-coordination.task_list')
    })

    expect(generationDepthInsert).toBeTruthy()
    expect(generationDepthInsert?.[1]).toEqual(expect.arrayContaining([
      'generation_depth_policy.china-mep-coordination.task_list',
      'wbsTemplateCandidateEventService',
      'project',
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      'template_structure',
      'governed_candidate',
      'manual_governance_required',
      'manual_required',
      'review_required',
      'candidate_only',
    ]))
    expect(generationDepthInsert?.[1]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetType: 'generation_depth_policy',
        source: 'schedule_trust_gate',
        templateId: 'china-mep-coordination',
        templateGroup: 'mep',
        packType: 'specialty',
        generationBatchId: 'batch-generation-depth-review',
        status: 'review_required',
        trustedForScheduling: false,
        reviewReasons: [
          'generation_depth_policy_fallback',
          'missing_descendant_duration_rollup',
        ],
        reviewRows: [expect.objectContaining({
          stableCode: 'MEP-01-01',
          policyId: 'fallback-subdivision-managed-frontier',
          confidence: 'low',
        })],
        candidatePolicy: 'candidate_only_no_runtime_mutation',
        releasePolicy: 'high_impact_structural_rule_manual_or_batch_review_required',
        replayRequirements: expect.arrayContaining([
          'row_count_within_generation_budget',
          'schedule_trust_gate_improves_or_stays_trusted',
          'dependency_anchors_stable',
          'no_parent_child_duration_conflict',
        ]),
      }),
    ]))
  })

  it('records template generate events and updates the monthly aggregation', async () => {
    await recordWbsTemplateCandidateEvent({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      generationBatchId: 'batch-1',
      templateId: 'china-gb55032-2022',
      selectedNodeIds: ['02-01-01'],
      scope: { building_object_id: 'building-1' },
      generatedEntityIds: ['task-1', 'task-2', 'task-3'],
      generatedRowCount: 4,
      retainedRowCount: 3,
      actorId: '00000000-0000-4000-8000-000000000002',
      metadata: { source: 'task_list_commit' },
    })

    expect(mocks.eventInsert).toHaveBeenCalledWith(expect.objectContaining({
      project_id: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      event_type: 'template_generate_commit',
      generation_batch_id: 'batch-1',
      template_id: 'china-gb55032-2022',
      generated_row_count: 4,
      retained_row_count: 3,
      rejected_row_count: 1,
      pending_row_count: 0,
      generated_entity_ids: ['task-1', 'task-2', 'task-3'],
      metadata: expect.objectContaining({
        retained_row_count: 3,
        rejected_row_count: 1,
        acceptance_rate_basis: 'retained_rows_divided_by_generated_rows',
      }),
    }))
    expect(mocks.aggregationQuery.eq).toHaveBeenCalledWith('project_id', '00000000-0000-4000-8000-000000000001')
    expect(mocks.aggregationQuery.eq).toHaveBeenCalledWith('template_id', 'china-gb55032-2022')
    expect(mocks.aggregationUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: '00000000-0000-4000-8000-000000000001',
        template_id: 'china-gb55032-2022',
        total_candidates: 6,
        accepted_candidates: 4,
        rejected_candidates: 2,
        pending_candidates: 0,
        acceptance_rate: 4 / 6,
        metadata: expect.objectContaining({
          previous: true,
          last_generation_batch_id: 'batch-1',
          last_generated_row_count: 4,
          last_retained_row_count: 3,
          last_rejected_row_count: 1,
          last_surface: 'task_list',
          acceptance_rate_basis: 'retained_rows_divided_by_generated_rows',
        }),
      }),
      { onConflict: 'project_id,template_id,period_month', ignoreDuplicates: false },
    )
  })

  it('records accepted special work duration network outcomes without writing runtime or facts', async () => {
    await recordWbsTemplateCandidateEvent({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      generationBatchId: 'batch-1',
      templateId: 'china-gb55032-2022',
      selectedNodeIds: ['02-01-01'],
      scope: { building_object_id: 'building-1' },
      generatedEntityIds: ['task-1', 'task-2', 'task-3'],
      generatedRowCount: 4,
      retainedRowCount: 3,
      rejectedRowCount: 1,
      pendingRowCount: 0,
      actorId: '00000000-0000-4000-8000-000000000002',
      metadata: { source: 'task_list_commit' },
    })

    expect(mocks.planNetworkOutcomeUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'wbs-template-candidate:00000000-0000-4000-8000-000000000001:task_list:batch-1',
        asset_key: 'special_work_duration_seed',
        outcome_status: 'accepted',
        outcome_ref: 'wbs_template_candidate_event:batch-1',
        learning_scope: 'project',
        learning_scope_source: 'project_business_outcome_writer',
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: '00000000-0000-4000-8000-000000000001',
        publication_key: null,
        writes_runtime_directly: false,
        writes_fact_directly: false,
        metadata: expect.objectContaining({
          source: 'wbs_template_candidate_event',
          surface: 'task_list',
          template_id: 'china-gb55032-2022',
          generation_batch_id: 'batch-1',
          generated_row_count: 4,
          retained_row_count: 3,
          rejected_row_count: 1,
          pending_row_count: 0,
          selected_node_ids: ['02-01-01'],
          generated_entity_ids: ['task-1', 'task-2', 'task-3'],
        }),
      }),
      { onConflict: 'id', ignoreDuplicates: false },
    )
  })

  it('does not let aggregation failures block the commit path', async () => {
    mocks.aggregationUpsert.mockResolvedValue({ error: { message: 'upsert failed' } })

    await expect(recordWbsTemplateCandidateEvent({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      templateId: 'china-gb55032-2022',
      generatedRowCount: 1,
    })).resolves.toBeUndefined()

    expect(mocks.logger.warn).toHaveBeenCalledWith(
      '[wbs-template-candidate] failed to update template candidate aggregation',
      expect.objectContaining({ error: 'upsert failed' }),
    )
  })

  it('requires resolved user outcome, dedicated writer, lineage, and release gates before special seed live learning is ready', () => {
    const decision = evaluateSpecialWorkDurationSeedLiveLearningEvidence({
      candidateOutcome: {
        generatedRowCount: 10,
        retainedRowCount: 7,
        rejectedRowCount: 3,
        pendingRowCount: 0,
      },
      networkPredictionEventRecorded: true,
      templateFeedbackOutcomeRecorded: true,
      approvedSpecialSeedCandidateRecorded: true,
      enabledLearningScopes: ['system', 'segment_baseline', 'company', 'project'],
      runtimeConsumerUsesPublishedArtifact: true,
      specialSeedPublicationWriterReady: true,
      seedVersionLineageRecorded: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    })

    expect(decision).toEqual({
      status: 'special_work_seed_live_learning_ready',
      liveLearningEvidence: {
        assetClassificationRegistered: true,
        predictionEventRecorded: true,
        actualOutcomeEventRecorded: true,
        tieredLearningPolicyRegistered: true,
        enabledLearningScopes: ['global', 'industry', 'company', 'project'],
        runtimeConsumerUsesPublishedArtifact: true,
        governedCandidateOnlyBoundaryPreserved: true,
        approvedSpecialSeedCandidateRecorded: true,
        specialSeedPublicationWriterReady: true,
        seedVersionLineageRecorded: true,
        releaseExitApproved: true,
        impactMonitoringReady: true,
        rollbackTargetReady: true,
        accuracyMetricsAvailable: true,
        generatedRowCount: 10,
        retainedRowCount: 7,
        rejectedRowCount: 3,
        pendingRowCount: 0,
        resolvedOutcomeRatio: 1,
      },
      missingReasons: [],
    })
  })

  it('builds a special seed publication readiness package from approved template candidates', () => {
    const readiness = buildSpecialWorkDurationSeedPublicationReadiness({
      candidateOutcome: {
        generatedRowCount: 10,
        retainedRowCount: 7,
        rejectedRowCount: 3,
        pendingRowCount: 0,
      },
      approvedCandidateEventIds: ['algorithm-candidate-event-id', 'algorithm-candidate-event-id'],
      seedVersionId: 'special-seed-version-v2',
      runtimePublicationKey: 'wbs_template_runtime:special-seed-version-v2',
      runtimeConsumerObservationRef: 'runtime_consumer:consumer-special-seed-1',
      runtimeConsumerPublicationKey: 'wbs_template_runtime:special-seed-version-v2',
      rollbackTarget: 'wbs_template_runtime:special-seed-version-v1',
      generatedEntityIds: ['task-1', 'task-2'],
      enabledLearningScopes: ['system', 'segment_baseline', 'company', 'project'],
      releaseExitApproved: true,
      impactMonitoringReady: true,
      accuracyMetricsAvailable: true,
    })

    expect(readiness.status).toBe('special_work_seed_publication_ready')
    expect(readiness.liveLearningEvidence).toEqual(expect.objectContaining({
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      tieredLearningPolicyRegistered: true,
      enabledLearningScopes: ['global', 'industry', 'company', 'project'],
      approvedSpecialSeedCandidateRecorded: true,
      specialSeedPublicationWriterReady: true,
      seedVersionLineageRecorded: true,
      runtimeConsumerUsesPublishedArtifact: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
      generatedRowCount: 10,
      retainedRowCount: 7,
      rejectedRowCount: 3,
      pendingRowCount: 0,
    }))
    expect(readiness.seedVersionLineage).toEqual({
      seedType: 'special_work_duration',
      seedVersionId: 'special-seed-version-v2',
      runtimePublicationKey: 'wbs_template_runtime:special-seed-version-v2',
      rollbackTarget: 'wbs_template_runtime:special-seed-version-v1',
      approvedCandidateEventIds: ['algorithm-candidate-event-id'],
      generatedEntityIds: ['task-1', 'task-2'],
      generatedRowCount: 10,
      retainedRowCount: 7,
      rejectedRowCount: 3,
      pendingRowCount: 0,
    })
    expect(readiness.missingReasons).toEqual([])
  })

  it('keeps special seed publication readiness closed without approvals, lineage, publication, and release evidence', () => {
    const readiness = buildSpecialWorkDurationSeedPublicationReadiness({
      candidateOutcome: {
        generatedRowCount: 4,
        retainedRowCount: 1,
        rejectedRowCount: 0,
        pendingRowCount: 3,
      },
      approvedCandidateEventIds: [],
      seedVersionId: '',
      runtimePublicationKey: '',
      rollbackTarget: '',
      generatedEntityIds: [],
      enabledLearningScopes: ['system'],
      releaseExitApproved: false,
      impactMonitoringReady: false,
      accuracyMetricsAvailable: false,
    })

    expect(readiness.status).toBe('special_work_seed_publication_not_ready')
    expect(readiness.seedVersionLineage).toEqual(expect.objectContaining({
      seedType: 'special_work_duration',
      seedVersionId: null,
      runtimePublicationKey: null,
      rollbackTarget: null,
      approvedCandidateEventIds: [],
      generatedEntityIds: [],
    }))
    expect(readiness.missingReasons).toEqual(expect.arrayContaining([
      'all_candidate_rows_must_have_user_outcome',
      'approved_special_seed_candidate_required',
      'special_seed_publication_writer_required',
      'seed_version_lineage_required',
      'runtime_consumer_publication_required',
      'global_industry_company_project_learning_scopes_required',
      'release_exit_required',
      'impact_monitoring_required',
      'rollback_target_required',
      'accuracy_metrics_required',
    ]))
  })

  it('builds special seed publication readiness from production source rows without writing templates or tasks', () => {
    const readiness = buildSpecialWorkDurationSeedPublicationReadinessFromProductionRows({
      candidateOutcome: {
        generatedRowCount: 10,
        retainedRowCount: 7,
        rejectedRowCount: 3,
        pendingRowCount: 0,
      },
      approvedCandidateEventIds: ['algorithm-candidate-event-id'],
      generatedEntityIds: ['task-1', 'task-2'],
      enabledLearningScopes: ['system', 'segment_baseline', 'company', 'project'],
      records: [{
        assetKey: 'special_work_duration_seed',
        evidenceKind: 'production_sample',
        evidenceRef: 'network_outcomes:wbs-template-candidate-event-1',
        evidenceStatus: 'accepted',
      }],
      sourceRows: [
        {
          sourceTable: 'wbs_template_runtime_publications',
          row: {
            publication_key: 'wbs_template_runtime:special-seed-version-v2',
            asset_kind: 'special_work_duration_seed',
            asset_version_id: 'special-seed-version-v2',
            runtime_publication_status: 'runtime_published',
            impact_monitoring: {
              status: 'monitoring_armed',
              eventRef: 'impact_monitoring:wbs_template_runtime:special-seed-version-v2:armed',
            },
            rollback_execution: {
              status: 'rollback_verified',
              eventRef: 'rollback:wbs_template_runtime:special-seed-version-v2:verified',
            },
          },
        },
        {
          sourceTable: 'runtime_consumer_observations',
          row: {
            id: 'consumer-special-seed-1',
            asset_key: 'special_work_duration_seed',
            consumer_key: 'wbsTemplateGenerationService',
            publication_key: 'wbs_template_runtime:special-seed-version-v2',
            observation_status: 'observed',
            writes_runtime_directly: false,
            writes_fact_directly: false,
          },
        },
        {
          sourceTable: 'duration_algorithm_accuracy_events',
          row: {
            id: 'accuracy-special-seed-1',
            absolute_error_days: 1,
            prediction_context: {
              assetKey: 'special_work_duration_seed',
              publicationKey: 'wbs_template_runtime:special-seed-version-v2',
            },
            actual_context: {
              assetKey: 'special_work_duration_seed',
              accuracyGateStatus: 'accuracy_passed',
            },
          },
        },
      ],
    })

    expect(readiness.status).toBe('special_work_seed_publication_ready')
    expect(readiness.liveLearningEvidence).toEqual(expect.objectContaining({
      predictionEventRecorded: true,
      actualOutcomeEventRecorded: true,
      approvedSpecialSeedCandidateRecorded: true,
      specialSeedPublicationWriterReady: true,
      seedVersionLineageRecorded: true,
      runtimeConsumerUsesPublishedArtifact: true,
      releaseExitApproved: true,
      impactMonitoringReady: true,
      rollbackTargetReady: true,
      accuracyMetricsAvailable: true,
    }))
    expect(readiness.seedVersionLineage).toEqual(expect.objectContaining({
      seedVersionId: 'special-seed-version-v2',
      runtimePublicationKey: 'wbs_template_runtime:special-seed-version-v2',
      rollbackTarget: 'rollback:wbs_template_runtime:special-seed-version-v2:verified',
      approvedCandidateEventIds: ['algorithm-candidate-event-id'],
      generatedEntityIds: ['task-1', 'task-2'],
    }))
    expect(readiness.productionLineage.evidenceRefs).toEqual(expect.objectContaining({
      productionSampleEvidenceRef: 'network_outcomes:wbs-template-candidate-event-1',
      publicationExecutionRef: 'wbs_template_runtime:special-seed-version-v2',
      runtimeConsumerObservationRef: 'runtime_consumer:consumer-special-seed-1',
      impactMonitoringEvidenceRef: 'impact_monitoring:wbs_template_runtime:special-seed-version-v2:armed',
      rollbackDrillEvidenceRef: 'rollback:wbs_template_runtime:special-seed-version-v2:verified',
      accuracyEvidenceRef: 'duration_algorithm_accuracy_events:accuracy-special-seed-1',
    }))
    expect(readiness.productionLineage.rejectedRows).toEqual([])
    expect(readiness.productionLineage.rejectedRecords).toEqual([])
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.rawQuery).not.toHaveBeenCalled()
  })

  it('keeps special seed publication readiness blocked when consumer observes a different runtime publication', () => {
    const readiness = buildSpecialWorkDurationSeedPublicationReadinessFromProductionRows({
      candidateOutcome: {
        generatedRowCount: 10,
        retainedRowCount: 7,
        rejectedRowCount: 3,
        pendingRowCount: 0,
      },
      approvedCandidateEventIds: ['algorithm-candidate-event-id'],
      generatedEntityIds: ['task-1', 'task-2'],
      enabledLearningScopes: ['system', 'segment_baseline', 'company', 'project'],
      records: [{
        assetKey: 'special_work_duration_seed',
        evidenceKind: 'production_sample',
        evidenceRef: 'network_outcomes:wbs-template-candidate-event-1',
        evidenceStatus: 'accepted',
      }],
      sourceRows: [
        {
          sourceTable: 'wbs_template_runtime_publications',
          row: {
            publication_key: 'wbs_template_runtime:special-seed-version-v2',
            asset_kind: 'special_work_duration_seed',
            asset_version_id: 'special-seed-version-v2',
            runtime_publication_status: 'runtime_published',
            impact_monitoring: {
              status: 'monitoring_armed',
              eventRef: 'impact_monitoring:wbs_template_runtime:special-seed-version-v2:armed',
            },
            rollback_execution: {
              status: 'rollback_verified',
              eventRef: 'rollback:wbs_template_runtime:special-seed-version-v2:verified',
            },
          },
        },
        {
          sourceTable: 'runtime_consumer_observations',
          row: {
            id: 'consumer-special-seed-1',
            asset_key: 'special_work_duration_seed',
            consumer_key: 'wbsTemplateGenerationService',
            publication_key: 'wbs_template_runtime:special-seed-version-v1',
            observation_status: 'observed',
            writes_runtime_directly: false,
            writes_fact_directly: false,
          },
        },
        {
          sourceTable: 'duration_algorithm_accuracy_events',
          row: {
            id: 'accuracy-special-seed-1',
            absolute_error_days: 1,
            prediction_context: {
              assetKey: 'special_work_duration_seed',
            },
            actual_context: {
              accuracyGateStatus: 'accuracy_passed',
            },
          },
        },
      ],
    })

    expect(readiness.status).toBe('special_work_seed_publication_not_ready')
    expect(readiness.liveLearningEvidence.runtimeConsumerUsesPublishedArtifact).toBe(false)
    expect(readiness.missingReasons).toEqual(expect.arrayContaining([
      'runtime_consumer_publication_mismatch',
    ]))
  })

  it('keeps special seed live learning not ready when candidate outcomes are pending or publication evidence is missing', () => {
    const decision = evaluateSpecialWorkDurationSeedLiveLearningEvidence({
      candidateOutcome: {
        generatedRowCount: 4,
        retainedRowCount: 1,
        rejectedRowCount: 0,
        pendingRowCount: 3,
      },
      networkPredictionEventRecorded: false,
      templateFeedbackOutcomeRecorded: false,
      approvedSpecialSeedCandidateRecorded: false,
      enabledLearningScopes: ['system'],
      runtimeConsumerUsesPublishedArtifact: false,
      specialSeedPublicationWriterReady: false,
      seedVersionLineageRecorded: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
    })

    expect(decision.status).toBe('special_work_seed_live_learning_not_ready')
    expect(decision.liveLearningEvidence).toEqual(expect.objectContaining({
      predictionEventRecorded: false,
      actualOutcomeEventRecorded: false,
      tieredLearningPolicyRegistered: false,
      runtimeConsumerUsesPublishedArtifact: false,
      approvedSpecialSeedCandidateRecorded: false,
      specialSeedPublicationWriterReady: false,
      seedVersionLineageRecorded: false,
      releaseExitApproved: false,
      impactMonitoringReady: false,
      rollbackTargetReady: false,
      accuracyMetricsAvailable: false,
      generatedRowCount: 4,
      retainedRowCount: 1,
      rejectedRowCount: 0,
      pendingRowCount: 3,
    }))
    expect(decision.missingReasons).toEqual(expect.arrayContaining([
      'network_prediction_event_required',
      'network_outcome_event_required',
      'all_candidate_rows_must_have_user_outcome',
      'approved_special_seed_candidate_required',
      'special_seed_publication_writer_required',
      'seed_version_lineage_required',
      'runtime_consumer_publication_required',
      'global_industry_company_project_learning_scopes_required',
      'release_exit_required',
      'impact_monitoring_required',
      'rollback_target_required',
      'accuracy_metrics_required',
    ]))
  })
})
