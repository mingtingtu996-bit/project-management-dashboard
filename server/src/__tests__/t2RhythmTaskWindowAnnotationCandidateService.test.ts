import { describe, expect, it } from 'vitest'

import { buildT2RhythmScheduleCandidatePackage } from '../services/t2DivisionRhythmTemplateRegistryService.js'
import {
  buildT2RhythmTaskWindowAnnotationCandidateReport,
} from '../services/t2RhythmTaskWindowAnnotationCandidateService.js'

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

describe('t2RhythmTaskWindowAnnotationCandidateService', () => {
  it('proposes high-confidence read-only T2 window annotations from task title and duration signals', () => {
    const candidatePackage = buildResidentialStandardFloorPackage()
    const windowCode = candidatePackage.packageWindows.find((window) => window.role === 'concrete_pour')?.windowCode
    expect(windowCode).toBeTruthy()

    const report = buildT2RhythmTaskWindowAnnotationCandidateReport({
      projectId: 'project-1',
      candidatePackage,
      taskRows: [
        {
          id: 'task-concrete-pour',
          project_id: 'project-1',
          title: '7#楼标准层混凝土浇筑',
          specialty_type: '土建',
          planned_start_date: '2026-05-06',
          planned_end_date: '2026-05-06',
          actual_start_date: '2026-05-06',
          actual_end_date: '2026-05-06',
          standard_task_metadata: {},
        },
      ],
    })

    expect(report.status).toBe('candidate_ready_for_manual_review')
    expect(report.annotationCandidates).toEqual([
      expect.objectContaining({
        taskId: 'task-concrete-pour',
        proposedWindowCode: windowCode,
        proposedWindowRole: 'concrete_pour',
        confidence: 'high',
        matchSignals: expect.arrayContaining(['title_keyword:concrete_pour', 'duration_match']),
        requiresManualApproval: true,
        autoWriteAllowed: false,
      }),
    ])
    expect(report.annotationGaps).toEqual([])
    expect(report.governance).toEqual(expect.objectContaining({
      readerOnly: true,
      writesStandardTaskMetadata: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      candidateOnly: true,
      requiresManualApproval: true,
    }))
  })

  it('keeps weak or off-scope task actual rows as annotation gaps instead of creating replay evidence', () => {
    const candidatePackage = buildResidentialStandardFloorPackage()

    const report = buildT2RhythmTaskWindowAnnotationCandidateReport({
      projectId: 'project-1',
      candidatePackage,
      taskRows: [
        {
          id: 'task-design-review',
          project_id: 'project-1',
          title: '施工图会审完成',
          specialty_type: '设计',
          planned_start_date: '2026-02-22',
          planned_end_date: '2026-03-14',
          actual_start_date: '2026-02-24',
          actual_end_date: '2026-05-05',
          standard_task_metadata: {},
        },
      ],
    })

    expect(report.status).toBe('insufficient_annotation_signal')
    expect(report.annotationCandidates).toEqual([])
    expect(report.annotationGaps).toEqual([
      expect.objectContaining({
        taskId: 'task-design-review',
        reasonCodes: expect.arrayContaining([
          'no_t2_window_keyword_match',
          'duration_outside_t2_window_band',
        ]),
        requiresManualReview: true,
      }),
    ])
    expect(report.canFeedReplayEvidence).toBe(false)
    expect(report.governance.writesStandardTaskMetadata).toBe(false)
  })

  it('uses explicit metadata window-role hints as manual annotation candidates without writing replay metadata', () => {
    const candidatePackage = buildResidentialStandardFloorPackage()
    const windowCode = candidatePackage.packageWindows.find((window) => window.role === 'horizontal_rebar_embed')?.windowCode
    expect(windowCode).toBeTruthy()

    const report = buildT2RhythmTaskWindowAnnotationCandidateReport({
      projectId: 'project-1',
      candidatePackage,
      taskRows: [
        {
          id: 'task-metadata-role',
          project_id: 'project-1',
          title: '8#楼标准层流水段作业',
          planned_start_date: '2026-05-04',
          planned_end_date: '2026-05-04',
          actual_start_date: '2026-05-04',
          actual_end_date: '2026-05-04',
          standard_task_metadata: {
            t2RhythmWindowRole: 'horizontal_rebar_embed',
            source: 'manual_standard_mapping_candidate',
          },
        },
      ],
    })

    expect(report.status).toBe('candidate_ready_for_manual_review')
    expect(report.annotationCandidates).toEqual([
      expect.objectContaining({
        taskId: 'task-metadata-role',
        proposedWindowCode: windowCode,
        proposedWindowRole: 'horizontal_rebar_embed',
        confidence: 'high',
        matchSignals: expect.arrayContaining([
          'metadata_window_role:horizontal_rebar_embed',
          'duration_match',
        ]),
        requiresManualApproval: true,
        autoWriteAllowed: false,
      }),
    ])
    expect(report.canFeedReplayEvidence).toBe(false)
    expect(report.governance.writesStandardTaskMetadata).toBe(false)
  })

  it('surfaces role-matched but duration-outlier task rows as medium-confidence manual review candidates', () => {
    const candidatePackage = buildResidentialStandardFloorPackage()
    const windowCode = candidatePackage.packageWindows.find((window) => window.role === 'concrete_pour')?.windowCode
    expect(windowCode).toBeTruthy()

    const report = buildT2RhythmTaskWindowAnnotationCandidateReport({
      projectId: 'project-1',
      candidatePackage,
      taskRows: [
        {
          id: 'task-concrete-pour-outlier',
          project_id: 'project-1',
          title: '9#楼标准层混凝土浇筑',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-18',
          actual_start_date: '2026-05-01',
          actual_end_date: '2026-05-18',
          standard_task_metadata: {},
        },
      ],
    })

    expect(report.status).toBe('candidate_ready_for_manual_review')
    expect(report.annotationCandidates).toEqual([
      expect.objectContaining({
        taskId: 'task-concrete-pour-outlier',
        proposedWindowCode: windowCode,
        proposedWindowRole: 'concrete_pour',
        confidence: 'medium',
        score: 70,
        matchSignals: expect.arrayContaining(['title_keyword:concrete_pour']),
        reviewReasonCodes: expect.arrayContaining(['duration_outside_t2_window_band']),
        requiresManualApproval: true,
        autoWriteAllowed: false,
      }),
    ])
    expect(report.annotationGaps).toEqual([])
    expect(report.canFeedReplayEvidence).toBe(false)
  })
})
