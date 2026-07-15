import { describe, expect, it } from 'vitest'

import {
  buildT2RhythmTemplateReplayEvidence,
  buildT2RhythmReplaySamplesFromTaskActuals,
} from '../services/t2RhythmTemplateReplayEvidenceService.js'
import { buildT2RhythmScheduleCandidatePackage } from '../services/t2DivisionRhythmTemplateRegistryService.js'

describe('t2RhythmTemplateReplayEvidenceService', () => {
  it('builds replay metrics from comparable T2 window actual samples and only admits governed shadow candidates', () => {
    const samples = Array.from({ length: 12 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0')
      const start = `2026-05-${day}`
      const actualEndDay = String(index + 4).padStart(2, '0')
      const plannedEndDay = String(index + 5).padStart(2, '0')
      return {
        sampleId: `sample-${index + 1}`,
        projectId: `project-${index + 1}`,
        workfaceKey: `tower-a-floor-${index + 1}`,
        windowCode: 'standard_floor_structure',
        plannedWindowDurationDays: 4,
        templateP80WindowDurationDays: 5,
        plannedGateDate: `2026-05-${plannedEndDay}`,
        actualGateDate: `2026-05-${actualEndDay}`,
        actualStartDate: start,
        actualEndDate: `2026-05-${actualEndDay}`,
        predecessorActualEndDate: start,
        dependencySatisfied: true,
        evidenceRef: `duration_experience_samples:sample-${index + 1}`,
      }
    })

    const result = buildT2RhythmTemplateReplayEvidence({
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      samples,
    })

    expect(result.metrics).toEqual({
      sampleCount: 12,
      comparableWorkfaceWindowCount: 12,
      p80CaptureRate: 1,
      medianAbsoluteErrorDays: 0,
      gateSlipMedianDays: 0,
      dependencyViolationRate: 0,
    })
    expect(result.acceptance.status).toBe('shadow_candidate')
    expect(result.acceptance.readyForShadow).toBe(true)
    expect(result.acceptance.readyForPublish).toBe(false)
    expect(result.acceptance.directSeedMutationAllowed).toBe(false)
    expect(result.acceptance.writesPlanDates).toBe(false)
    expect(result.acceptance.writesTaskDependencies).toBe(false)
    expect(result.evidenceRefs).toContain('duration_experience_samples:sample-1')
  })

  it('keeps invalid or thin replay samples in data collection with quality reasons', () => {
    const result = buildT2RhythmTemplateReplayEvidence({
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      samples: [
        {
          sampleId: 'missing-end',
          windowCode: 'standard_floor_structure',
          plannedWindowDurationDays: 4,
          templateP80WindowDurationDays: 5,
          actualStartDate: '2026-05-01',
          actualEndDate: null,
          evidenceRef: 'duration_experience_samples:missing-end',
        },
        {
          sampleId: 'bad-order',
          windowCode: 'standard_floor_structure',
          plannedWindowDurationDays: 4,
          templateP80WindowDurationDays: 5,
          actualStartDate: '2026-05-10',
          actualEndDate: '2026-05-08',
          evidenceRef: 'duration_experience_samples:bad-order',
        },
        {
          sampleId: 'dependency-broken',
          windowCode: 'standard_floor_structure',
          plannedWindowDurationDays: 4,
          templateP80WindowDurationDays: 5,
          actualStartDate: '2026-05-01',
          actualEndDate: '2026-05-08',
          predecessorActualEndDate: '2026-05-04',
          dependencySatisfied: false,
          evidenceRef: 'duration_experience_samples:dependency-broken',
        },
      ],
    })

    expect(result.metrics.sampleCount).toBe(3)
    expect(result.metrics.comparableWorkfaceWindowCount).toBe(1)
    expect(result.metrics.dependencyViolationRate).toBe(1)
    expect(result.acceptance.status).toBe('data_collection_open')
    expect(result.acceptance.readyForShadow).toBe(false)
    expect(result.sampleQualityIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ sampleId: 'missing-end', issueCode: 'missing_actual_window_dates' }),
      expect.objectContaining({ sampleId: 'bad-order', issueCode: 'invalid_actual_window_order' }),
      expect.objectContaining({ sampleId: 'dependency-broken', issueCode: 'dependency_violation' }),
    ]))
    expect(result.acceptance.blockingReasons).toContain('sample_gate_not_met')
    expect(result.acceptance.blockingReasons).toContain('p80_capture_below_threshold')
  })

  it('adapts task actual rows into T2 replay samples only when they match candidate package windows', () => {
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
    expect(window).toBeTruthy()

    const result = buildT2RhythmReplaySamplesFromTaskActuals({
      candidatePackage,
      tasks: [
        {
          id: 'task-good',
          project_id: 'project-1',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-04',
          actual_start_date: '2026-05-01',
          actual_end_date: '2026-05-04',
          standard_task_metadata: {
            t2RhythmWindowCode: window?.windowCode,
            workfaceKey: 'tower-a-floor-01',
            dependencySatisfied: true,
          },
        },
        {
          id: 'task-unknown-window',
          project_id: 'project-1',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-04',
          actual_start_date: '2026-05-01',
          actual_end_date: '2026-05-04',
          standard_task_metadata: {
            t2RhythmWindowCode: 'unknown_window',
            workfaceKey: 'tower-a-floor-02',
          },
        },
        {
          id: 'task-missing-actual',
          project_id: 'project-1',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-04',
          actual_start_date: null,
          actual_end_date: null,
          standard_task_metadata: {
            t2RhythmWindowCode: window?.windowCode,
            workfaceKey: 'tower-a-floor-03',
          },
        },
      ],
    })

    expect(result.samples).toEqual([
      expect.objectContaining({
        sampleId: 'task:task-good',
        projectId: 'project-1',
        workfaceKey: 'tower-a-floor-01',
        windowCode: window?.windowCode,
        plannedWindowDurationDays: 4,
        templateP80WindowDurationDays: window?.durationDays,
        plannedGateDate: '2026-05-04',
        actualGateDate: '2026-05-04',
        actualStartDate: '2026-05-01',
        actualEndDate: '2026-05-04',
        dependencySatisfied: true,
        evidenceRef: 'tasks:task-good',
      }),
    ])
    expect(result.rejectedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rowId: 'task-unknown-window',
        reasonCode: 'unknown_t2_window_code',
      }),
      expect.objectContaining({
        rowId: 'task-missing-actual',
        reasonCode: 'missing_actual_window_dates',
      }),
    ]))
    expect(result.governance).toEqual(expect.objectContaining({
      source: 'task_actual_rows_to_t2_window_replay_samples',
      writesPlanDates: false,
      writesTaskDependencies: false,
      directSeedMutationAllowed: false,
    }))
  })

  it('normalizes shorthand T2 window codes from task actual metadata to package window codes', () => {
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
    const fullWindow = candidatePackage.packageWindows.find((item) => item.windowCode.endsWith(':W01'))
    expect(fullWindow).toBeTruthy()

    const result = buildT2RhythmReplaySamplesFromTaskActuals({
      candidatePackage,
      tasks: [
        {
          id: 'task-short-window',
          project_id: 'project-1',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-04',
          actual_start_date: '2026-05-01',
          actual_end_date: '2026-05-04',
          standard_task_metadata: {
            t2RhythmWindowCode: 'W01',
            workfaceKey: 'tower-a-floor-01',
            dependencySatisfied: true,
          },
        },
      ],
    })

    expect(result.rejectedRows).toEqual([])
    expect(result.samples).toEqual([
      expect.objectContaining({
        sampleId: 'task:task-short-window',
        windowCode: fullWindow?.windowCode,
        templateP80WindowDurationDays: fullWindow?.durationDays,
      }),
    ])
  })
})
