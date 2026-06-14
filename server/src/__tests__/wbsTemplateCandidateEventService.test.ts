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
