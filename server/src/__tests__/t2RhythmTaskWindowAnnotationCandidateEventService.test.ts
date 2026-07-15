import { describe, expect, it } from 'vitest'

import { buildT2RhythmScheduleCandidatePackage } from '../services/t2DivisionRhythmTemplateRegistryService.js'
import { buildT2RhythmTaskWindowAnnotationCandidateReport } from '../services/t2RhythmTaskWindowAnnotationCandidateService.js'
import {
  buildAndPersistT2RhythmTaskWindowAnnotationCandidateEvent,
  buildT2RhythmTaskWindowAnnotationCandidateEvent,
} from '../services/t2RhythmTaskWindowAnnotationCandidateEventService.js'
import { assessExperienceTierCandidatePayload } from '../services/experienceTierRegistryService.js'

function buildResidentialStandardFloorPackage() {
  return buildT2RhythmScheduleCandidatePackage({
    selection: {
      businessTypeCode: 'residential',
      phaseWindow: 'superstructure',
      divisionFamily: 'superstructure',
      subdivisionFamily: 'standard_floor_handover',
      methodVariantCodes: ['aluminum_formwork'],
      scopeDimensions: ['building', 'floor'],
    },
    facts: {
      hasOrderedFloors: true,
      hasBasementHandover: true,
    },
    organizationAssumptions: ['basement_first_then_tower'],
    selectedWorkfaceUnits: ['floor'],
  })
}

function buildAnnotationReportWithCandidateAndGap() {
  const candidatePackage = buildResidentialStandardFloorPackage()
  return {
    candidatePackage,
    annotationReport: buildT2RhythmTaskWindowAnnotationCandidateReport({
      projectId: 'project-a1',
      candidatePackage,
      taskRows: [
        {
          id: 'task-concrete-pour',
          project_id: 'project-a1',
          title: '7#楼标准层混凝土浇筑',
          specialty_type: '土建',
          planned_start_date: '2026-05-06',
          planned_end_date: '2026-05-06',
          actual_start_date: '2026-05-06',
          actual_end_date: '2026-05-06',
          standard_task_metadata: {},
        },
        {
          id: 'task-design-review',
          project_id: 'project-a1',
          title: '施工图会审完成',
          specialty_type: '设计',
          planned_start_date: '2026-02-22',
          planned_end_date: '2026-03-14',
          actual_start_date: '2026-02-24',
          actual_end_date: '2026-05-05',
          standard_task_metadata: {},
        },
      ],
    }),
  }
}

describe('t2RhythmTaskWindowAnnotationCandidateEventService', () => {
  it('turns read-only annotation proposals into a manual-governed candidate event without replay or runtime writes', () => {
    const { candidatePackage, annotationReport } = buildAnnotationReportWithCandidateAndGap()

    const result = buildT2RhythmTaskWindowAnnotationCandidateEvent({
      companyId: 'company-a',
      projectId: 'project-a1',
      candidatePackage,
      annotationReport,
      evidenceRef: 'artifacts/test-runs/t2-rhythm-live-replay-current.json',
    })

    expect(result.status).toBe('annotation_candidate_event_created')
    expect(result.blockingReasons).toEqual([])
    expect(result.event).toEqual(expect.objectContaining({
      assetKey: 't2.rhythm.task_window_annotation:project-a1:t2-residential-standard-floor-structure-rhythm-v1',
      sourceSystem: 't2RhythmTaskWindowAnnotationCandidateEventService',
      assetType: 'template',
      scopeType: 'project',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'manual_required',
      learningMaturity: 'governed_candidate',
      learningTarget: 'template_structure',
      runtimeEffectPolicy: 'candidate_only',
      lifecycleStatus: 'review_required',
    }))
    expect(result.event?.governanceDecision).toEqual(expect.objectContaining({
      canWriteRuntime: false,
      runtimeAction: 'candidate_only',
    }))
    expect(result.event?.candidatePayload).toEqual(expect.objectContaining({
      source: 't2_task_window_annotation_candidate_event',
      tier: 'T2',
      experienceTier: 'T2',
      experienceAssetType: 't2_division_rhythm_template',
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      annotationCandidateCount: 1,
      annotationGapCount: 1,
      canFeedReplayEvidence: false,
      evidenceRef: 'artifacts/test-runs/t2-rhythm-live-replay-current.json',
      governance: expect.objectContaining({
        readerOnly: true,
        writesStandardTaskMetadata: false,
        writesTaskDependencies: false,
        writesPlanDates: false,
        candidateOnly: true,
        requiresManualApproval: true,
        manualApprovalRequiredBeforeMetadataWrite: true,
      }),
    }))
    expect(assessExperienceTierCandidatePayload(result.event?.candidatePayload)).toEqual(expect.objectContaining({
      status: 'tier_candidate_valid',
      tier: 'T2',
      rejectedReasons: [],
    }))
    expect((result.event?.candidatePayload as any).annotationCandidates[0]).toEqual(expect.objectContaining({
      taskId: 'task-concrete-pour',
      proposedWindowRole: 'concrete_pour',
      reviewReasonCodes: [],
      requiresManualApproval: true,
      autoWriteAllowed: false,
    }))
  })

  it('keeps all-gap annotation reports open for manual data collection instead of creating an event', () => {
    const candidatePackage = buildResidentialStandardFloorPackage()
    const annotationReport = buildT2RhythmTaskWindowAnnotationCandidateReport({
      projectId: 'project-a1',
      candidatePackage,
      taskRows: [{
        id: 'task-design-review',
        project_id: 'project-a1',
        title: '施工图会审完成',
        specialty_type: '设计',
        planned_start_date: '2026-02-22',
        planned_end_date: '2026-03-14',
        actual_start_date: '2026-02-24',
        actual_end_date: '2026-05-05',
        standard_task_metadata: {},
      }],
    })

    const result = buildT2RhythmTaskWindowAnnotationCandidateEvent({
      companyId: 'company-a',
      projectId: 'project-a1',
      candidatePackage,
      annotationReport,
    })

    expect(result.status).toBe('annotation_data_collection_open')
    expect(result.event).toBeUndefined()
    expect(result.blockingReasons).toEqual(expect.arrayContaining([
      'no_manual_annotation_candidates',
    ]))
  })

  it('persists annotation candidate events only to the unified candidate event table', async () => {
    const { candidatePackage, annotationReport } = buildAnnotationReportWithCandidateAndGap()
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('INSERT INTO public.algorithm_asset_candidate_events')) {
        return [{ id: 't2-annotation-event-row-id' }] as T[]
      }
      return [] as T[]
    }

    const result = await buildAndPersistT2RhythmTaskWindowAnnotationCandidateEvent({
      companyId: 'company-a',
      projectId: 'project-a1',
      candidatePackage,
      annotationReport,
      queryExec,
    })

    expect(result.status).toBe('annotation_candidate_event_created')
    expect(result.persistence).toEqual({
      persisted: true,
      candidateEventId: 't2-annotation-event-row-id',
    })
    const sql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(sql).toContain('insert into public.algorithm_asset_candidate_events')
    expect(sql).not.toContain('update public.tasks')
    expect(sql).not.toContain('standard_task_metadata')
    expect(sql).not.toContain('task_dependencies')
    expect(sql).not.toContain('runtime_publications')
  })
})
