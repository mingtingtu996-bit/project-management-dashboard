import { describe, expect, it } from 'vitest'

import {
  applyT2RhythmTaskWindowAnnotationApprovedPackage,
  type T2RhythmTaskWindowAnnotationApprovedPackage,
} from '../services/t2RhythmTaskWindowAnnotationDomainWriter.js'

function approvedPackage(): T2RhythmTaskWindowAnnotationApprovedPackage {
  return {
    candidateEventId: 'event-t2-annotation',
    assetKey: 't2.rhythm.task_window_annotation:project-a1:t2-residential-standard-floor-structure-rhythm-v1',
    sourceModule: 't2RhythmTaskWindowAnnotationCandidateEventService',
    companyId: '10000000-0000-4000-8000-000000000001',
    projectId: '00000000-0000-4000-8000-000000000001',
    templateId: 't2-residential-standard-floor-structure-rhythm-v1',
    selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
    manualReviewApproval: {
      candidateEventId: 'approval-event-t2-annotation',
      approvedByUserId: 'user-reviewer',
      approvedAt: '2026-06-22T04:45:00.000Z',
    },
    releaseExitHandoff: {
      candidateEventId: 'release-exit-event-t2-annotation',
      releaseRecordTarget: 't2-task-window-annotation-release:project-a1:20260622',
      rollbackTarget: 't2-task-window-annotation-rollback:project-a1:previous',
      consumerVerificationRefs: ['diagnose:t2-rhythm-live-replay:post-annotation'],
      impactMonitoringRefs: ['t2-annotation-window-metadata-impact-monitor'],
      rollbackWriterRefs: ['t2RhythmTaskWindowAnnotationDomainWriter.rollback'],
    },
    reviewPackage: {
      status: 'approved_for_metadata_patch',
      annotationCandidateCount: 2,
      canFeedReplayEvidence: false,
      writesStandardTaskMetadata: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
    },
    annotationCandidates: [
      {
        taskId: '11111111-1111-4111-8111-111111111111',
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
        taskId: '22222222-2222-4222-8222-222222222222',
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
    annotationGaps: [],
  }
}

describe('t2RhythmTaskWindowAnnotationDomainWriter', () => {
  it('applies approved T2 annotation packages only as scoped standard_task_metadata patches', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('UPDATE public.tasks')) {
        return [{ id: params[1], standard_task_metadata: params[2] }] as T[]
      }
      if (sql.includes('INSERT INTO public.t2_rhythm_task_window_annotation_runtime_publications')) {
        return [{ id: 'publication-row-id' }] as T[]
      }
      return [] as T[]
    }

    const result = await applyT2RhythmTaskWindowAnnotationApprovedPackage({
      package: approvedPackage(),
      projectId: '00000000-0000-4000-8000-000000000001',
      companyId: '10000000-0000-4000-8000-000000000001',
      executedByUserId: 'user-applier',
      executedAt: '2026-06-22T04:46:00.000Z',
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      source: 't2_rhythm_task_window_annotation_domain_writer',
      status: 'runtime_apply_ready',
      canPatchTaskWindowMetadata: true,
      patchedTaskCount: 2,
      releaseRecordPersisted: true,
      writesStandardTaskMetadata: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      canFeedReplayEvidenceAfterNextDiagnostic: true,
      releaseRecordTarget: 't2-task-window-annotation-release:project-a1:20260622',
      rollbackTarget: 't2-task-window-annotation-rollback:project-a1:previous',
    }))
    expect(result.metadataPatches[0]).toEqual(expect.objectContaining({
      taskId: '11111111-1111-4111-8111-111111111111',
      t2RhythmWindowCode: 't2-residential-standard-floor-structure-rhythm-v1:W02',
      t2RhythmWindowRole: 'vertical_rebar_embed',
      sourceCandidateEventId: 'event-t2-annotation',
      releaseExitHandoffCandidateEventId: 'release-exit-event-t2-annotation',
    }))
    const sql = calls.map((call) => call.sql).join('\n')
    expect(sql).toContain('UPDATE public.tasks')
    expect(sql).toContain('standard_task_metadata')
    expect(sql).not.toContain('task_dependencies')
    expect(sql).not.toContain('planned_start_date')
    expect(sql).not.toContain('planned_end_date')
    expect(calls.filter((call) => call.sql.includes('UPDATE public.tasks'))).toHaveLength(2)
    expect(calls[0].params[0]).toBe('00000000-0000-4000-8000-000000000001')
    expect(calls[0].params[1]).toBe('11111111-1111-4111-8111-111111111111')
    expect(calls[0].params[2]).toEqual(expect.objectContaining({
      t2RhythmWindowCode: 't2-residential-standard-floor-structure-rhythm-v1:W02',
      t2_rhythm_window_code: 't2-residential-standard-floor-structure-rhythm-v1:W02',
      t2RhythmWindowRole: 'vertical_rebar_embed',
      t2_rhythm_window_role: 'vertical_rebar_embed',
      t2RhythmAnnotationApproved: true,
      t2RhythmCanFeedReplayAfterNextDiagnostic: true,
    }))
  })

  it('blocks metadata writes until manual approval and release-exit evidence are present', async () => {
    const draft = approvedPackage()
    draft.manualReviewApproval = null
    draft.releaseExitHandoff = null
    const calls: Array<{ sql: string, params: unknown[] }> = []

    const result = await applyT2RhythmTaskWindowAnnotationApprovedPackage({
      package: draft,
      projectId: '00000000-0000-4000-8000-000000000001',
      queryExec: async (sql, params = []) => {
        calls.push({ sql, params })
        return []
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_apply_blocked',
      canPatchTaskWindowMetadata: false,
      patchedTaskCount: 0,
      writesStandardTaskMetadata: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      releaseRecordPersisted: false,
      reasons: expect.arrayContaining([
        'manual_review_approval_required',
        'release_exit_handoff_required',
      ]),
    }))
    expect(calls).toEqual([])
  })
})
