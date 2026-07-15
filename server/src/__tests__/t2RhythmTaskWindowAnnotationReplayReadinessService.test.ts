import { describe, expect, it } from 'vitest'

import { buildT2RhythmScheduleCandidatePackage } from '../services/t2DivisionRhythmTemplateRegistryService.js'
import {
  buildT2RhythmTaskWindowAnnotationReplayReadiness,
} from '../services/t2RhythmTaskWindowAnnotationReplayReadinessService.js'

describe('t2RhythmTaskWindowAnnotationReplayReadinessService', () => {
  it('projects approved task-window metadata patches into next-diagnostic replay readiness without runtime writes', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
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
    const durationBearingWindows = candidatePackage.packageWindows.filter((item) => item.durationBearing)
    expect(durationBearingWindows.length).toBeGreaterThan(1)

    const taskRows = durationBearingWindows.flatMap((window, windowIndex) =>
      Array.from({ length: 3 }, (_, workfaceIndex) => {
        const offset = windowIndex * 3 + workfaceIndex + 1
        const day = String(offset).padStart(2, '0')
        const durationDays = Math.max(1, window.durationDays)
        const endDay = String(offset + durationDays - 1).padStart(2, '0')
        return {
          id: `task-approved-${windowIndex + 1}-${workfaceIndex + 1}`,
          project_id: 'project-1',
          planned_start_date: `2026-05-${day}`,
          planned_end_date: `2026-05-${endDay}`,
          actual_start_date: `2026-05-${day}`,
          actual_end_date: `2026-05-${endDay}`,
          standard_task_metadata: {
            t2RhythmWindowCode: window.windowCode,
            t2RhythmWindowRole: window.role,
            t2RhythmAnnotationApproved: true,
            t2RhythmCanFeedReplayAfterNextDiagnostic: true,
            workfaceKey: `tower-a-floor-${workfaceIndex + 1}`,
            dependencySatisfied: true,
          },
        }
      })
    )
    const expectedReplaySampleCount = durationBearingWindows.length * 3

    expect(taskRows.length).toBeGreaterThanOrEqual(12)
    const result = buildT2RhythmTaskWindowAnnotationReplayReadiness({
      projectId: 'project-1',
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      candidatePackage,
      taskRows,
      releaseRecordTarget: 't2-task-window-annotation-release:project-1:20260622',
      rollbackTarget: 't2-task-window-annotation-rollback:project-1:previous',
    })

    expect(result).toEqual(expect.objectContaining({
      source: 't2_task_window_annotation_replay_readiness',
      status: 'ready_for_shadow_replay',
      taskRowsRead: expectedReplaySampleCount,
      approvedMetadataRowCount: expectedReplaySampleCount,
      replaySampleCount: expectedReplaySampleCount,
      rejectedRowCount: 0,
      canFeedReplayEvidenceAfterNextDiagnostic: true,
      releaseRecordTarget: 't2-task-window-annotation-release:project-1:20260622',
      rollbackTarget: 't2-task-window-annotation-rollback:project-1:previous',
      writesStandardTaskMetadata: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
    }))
    expect(result.postAnnotationReplayCoverage).toEqual(expect.objectContaining({
      status: 'pass',
      requiredDurationBearingWindowCount: durationBearingWindows.length,
      coveredDurationBearingWindowCount: durationBearingWindows.length,
      missingWindowCodes: [],
      underSampledWindowCodes: [],
      underDiverseWorkfaceWindowCodes: [],
    }))
    expect(result.evidence.acceptance.status).toBe('shadow_candidate')
    expect(result.evidence.acceptance.readyForShadow).toBe(true)
    expect(result.replaySamples[0]).toEqual(expect.objectContaining({
      sampleId: 'task:task-approved-1-1',
      windowCode: durationBearingWindows[0]?.windowCode,
      evidenceRef: 'tasks:task-approved-1-1',
    }))
  })

  it('does not mark post-annotation replay ready when approved metadata only covers one duration-bearing window', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
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
    const durationBearingWindows = candidatePackage.packageWindows.filter((item) => item.durationBearing)
    const coveredWindow = durationBearingWindows[0]
    expect(durationBearingWindows.length).toBeGreaterThan(1)

    const taskRows = Array.from({ length: 12 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0')
      const durationDays = Math.max(1, coveredWindow.durationDays)
      const endDay = String(index + durationDays).padStart(2, '0')
      return {
        id: `task-approved-single-window-${index + 1}`,
        project_id: 'project-1',
        planned_start_date: `2026-05-${day}`,
        planned_end_date: `2026-05-${endDay}`,
        actual_start_date: `2026-05-${day}`,
        actual_end_date: `2026-05-${endDay}`,
        standard_task_metadata: {
          t2RhythmWindowCode: coveredWindow.windowCode,
          t2RhythmWindowRole: coveredWindow.role,
          t2RhythmAnnotationApproved: true,
          t2RhythmCanFeedReplayAfterNextDiagnostic: true,
          workfaceKey: `tower-a-floor-${index + 1}`,
          dependencySatisfied: true,
        },
      }
    })

    const result = buildT2RhythmTaskWindowAnnotationReplayReadiness({
      projectId: 'project-1',
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      candidatePackage,
      taskRows,
    })

    expect(result.evidence.acceptance.readyForShadow).toBe(true)
    expect(result.status).toBe('data_collection_open')
    expect(result.canFeedReplayEvidenceAfterNextDiagnostic).toBe(false)
    expect(result.postAnnotationReplayCoverage).toEqual(expect.objectContaining({
      source: 't2_post_annotation_duration_bearing_window_coverage',
      status: 'fail',
      requiredDurationBearingWindowCount: durationBearingWindows.length,
      coveredDurationBearingWindowCount: 1,
      coveredWindowCodes: [coveredWindow.windowCode],
      missingWindowCodes: durationBearingWindows.slice(1).map((item) => item.windowCode),
      minimumSamplesPerDurationBearingWindow: 2,
      minimumDistinctWorkfacesPerDurationBearingWindow: 3,
    }))
    expect(result.blockingReasons).toEqual(expect.arrayContaining([
      'duration_bearing_window_replay_coverage_missing',
      'post_annotation_replay_coverage_not_ready',
    ]))
  })

  it('keeps approved metadata patches in data collection until sample gates are met', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
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
    const window = candidatePackage.packageWindows.find((item) => item.durationBearing)

    const result = buildT2RhythmTaskWindowAnnotationReplayReadiness({
      projectId: 'project-1',
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      candidatePackage,
      taskRows: [
        {
          id: 'task-approved-thin',
          project_id: 'project-1',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-04',
          actual_start_date: '2026-05-01',
          actual_end_date: '2026-05-04',
          standard_task_metadata: {
            t2RhythmWindowCode: window?.windowCode,
            t2RhythmAnnotationApproved: true,
            t2RhythmCanFeedReplayAfterNextDiagnostic: true,
          },
        },
      ],
    })

    expect(result.status).toBe('data_collection_open')
    expect(result.approvedMetadataRowCount).toBe(1)
    expect(result.replaySampleCount).toBe(1)
    expect(result.canFeedReplayEvidenceAfterNextDiagnostic).toBe(false)
    expect(result.evidence.acceptance.status).toBe('data_collection_open')
    expect(result.blockingReasons).toEqual(expect.arrayContaining([
      'sample_gate_not_met',
      'shadow_replay_not_ready',
    ]))
    expect(result.writesTaskDependencies).toBe(false)
    expect(result.writesPlanDates).toBe(false)
  })
})
