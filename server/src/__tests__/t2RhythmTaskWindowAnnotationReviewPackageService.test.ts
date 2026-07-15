import { describe, expect, it } from 'vitest'

import { listT2RhythmTaskWindowAnnotationReviewPackages } from '../services/t2RhythmTaskWindowAnnotationReviewPackageService.js'

function createQueryRecorder(rows: Array<Record<string, unknown>>) {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    if (sql.includes('FROM public.algorithm_asset_candidate_events')) return rows as T[]
    return [] as T[]
  }
  return { calls, queryExec }
}

function buildCandidatePayload() {
  return {
    source: 't2_task_window_annotation_candidate_event',
    tier: 'T2',
    templateId: 't2-residential-standard-floor-structure-rhythm-v1',
    selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
    annotationCandidateCount: 2,
    annotationGapCount: 1,
    canFeedReplayEvidence: false,
    evidenceRef: 'artifacts/test-runs/c19-t2-live-replay-current-20260622123200/t2-rhythm-live-replay-current.json',
    annotationCandidates: [
      {
        taskId: 'task-rebar',
        proposedWindowCode: 't2-residential-standard-floor-structure-rhythm-v1:W02',
        proposedWindowRole: 'vertical_rebar_embed',
        confidence: 'medium',
        score: 70,
        matchSignals: ['title_keyword:vertical_rebar_embed'],
        reviewReasonCodes: ['duration_outside_t2_window_band'],
        requiresManualApproval: true,
        autoWriteAllowed: false,
      },
      {
        taskId: 'task-concrete',
        proposedWindowCode: 't2-residential-standard-floor-structure-rhythm-v1:W06',
        proposedWindowRole: 'concrete_pour',
        confidence: 'medium',
        score: 70,
        matchSignals: ['title_keyword:concrete_pour'],
        reviewReasonCodes: ['duration_outside_t2_window_band'],
        requiresManualApproval: true,
        autoWriteAllowed: false,
      },
    ],
    annotationGaps: [
      {
        taskId: 'task-design-review',
        reasonCodes: ['no_t2_window_keyword_match', 'duration_outside_t2_window_band'],
        requiresManualReview: true,
      },
    ],
    governance: {
      readerOnly: true,
      writesStandardTaskMetadata: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      candidateOnly: true,
      requiresManualApproval: true,
      manualApprovalRequiredBeforeMetadataWrite: true,
      runtimeEffectPolicy: 'candidate_only',
    },
  }
}

describe('t2RhythmTaskWindowAnnotationReviewPackageService', () => {
  it('reads T2 task-window annotation candidates as manual review packages without runtime writes', async () => {
    const { calls, queryExec } = createQueryRecorder([
      {
        id: 'event-t2-annotation',
        asset_key: 't2.rhythm.task_window_annotation:project-a1:t2-residential-standard-floor-structure-rhythm-v1',
        source_module: 't2RhythmTaskWindowAnnotationCandidateEventService',
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: '00000000-0000-4000-8000-000000000001',
        event_status: 'review_required',
        runtime_effect: 'candidate_only',
        candidate_payload: buildCandidatePayload(),
        created_at: '2026-06-22T04:32:00.000Z',
        updated_at: '2026-06-22T04:32:00.000Z',
      },
      {
        id: 'event-missing-payload',
        asset_key: 't2.rhythm.task_window_annotation:project-a1:empty',
        source_module: 't2RhythmTaskWindowAnnotationCandidateEventService',
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: '00000000-0000-4000-8000-000000000001',
        event_status: 'review_required',
        runtime_effect: 'candidate_only',
        candidate_payload: {},
      },
    ])

    const report = await listT2RhythmTaskWindowAnnotationReviewPackages({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      limit: 25,
      queryExec,
    })

    expect(report).toEqual(expect.objectContaining({
      source: 't2_rhythm_task_window_annotation_review_package_read_model',
      totalCandidateEventRows: 2,
      totalReviewPackageItems: 1,
      readyForManualReviewCount: 1,
      annotationCandidateCount: 2,
      annotationGapCount: 1,
      skippedMissingCandidatePayloadCount: 1,
    }))
    expect(report.items[0]).toEqual(expect.objectContaining({
      candidateEventId: 'event-t2-annotation',
      assetKey: 't2.rhythm.task_window_annotation:project-a1:t2-residential-standard-floor-structure-rhythm-v1',
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      reviewPackage: expect.objectContaining({
        source: 't2_task_window_annotation_review_package',
        status: 'ready_for_manual_review',
        allowManualReview: true,
        annotationCandidateCount: 2,
        annotationGapCount: 1,
        canFeedReplayEvidence: false,
        writesStandardTaskMetadata: false,
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
    }))
    expect(report.items[0].annotationCandidates[0]).toEqual(expect.objectContaining({
      taskId: 'task-rebar',
      proposedWindowRole: 'vertical_rebar_embed',
      reviewReasonCodes: ['duration_outside_t2_window_band'],
      requiresManualApproval: true,
      autoWriteAllowed: false,
    }))
    expect(report.boundaryPolicy).toEqual(expect.arrayContaining([
      'read_only_projection_from_algorithm_asset_candidate_events',
      'manual_review_package_is_not_metadata_write',
      'no_standard_task_metadata_write',
      'no_task_dependencies_write',
      'no_plan_dates_write',
      'approved_annotations_must_enter_separate_domain_writer_release_exit',
    ]))

    expect(calls[0].sql).toContain('FROM public.algorithm_asset_candidate_events')
    expect(calls[0].params).toEqual([
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      't2.rhythm.task_window_annotation:%',
      't2RhythmTaskWindowAnnotationCandidateEventService',
      25,
    ])
    const writeSql = calls
      .map((call) => call.sql.toLowerCase())
      .filter((sql) => /\b(insert\s+into|update\s+|delete\s+from)\b/.test(sql))
      .join('\n')
    expect(writeSql).toBe('')
    expect(calls.map((call) => call.sql.toLowerCase()).join('\n')).not.toContain('update public.tasks')
    expect(calls.map((call) => call.sql.toLowerCase()).join('\n')).not.toContain('task_dependencies')
  })

  it('requires company scope before exposing T2 annotation review packages', async () => {
    await expect(listT2RhythmTaskWindowAnnotationReviewPackages({
      queryExec: async () => [],
    })).rejects.toThrow('t2_rhythm_task_window_annotation_review_requires_company_id')
  })
})
