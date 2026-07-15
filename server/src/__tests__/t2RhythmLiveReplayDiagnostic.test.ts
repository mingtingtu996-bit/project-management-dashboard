import { describe, expect, it, vi } from 'vitest'

import {
  buildT2RhythmLiveReplayDiagnosticReport,
  evaluateT2RhythmStandardLibraryTrustGate,
  parseT2RhythmLiveReplayDiagnosticOptionsFromArgs,
  shouldFailT2RhythmLiveReplayDiagnosticReport,
} from '../scripts/diagnose-t2-rhythm-live-replay.js'
import type { T2RhythmLiveReplayDiagnosticReaderFactory } from '../scripts/diagnose-t2-rhythm-live-replay.js'
import { buildT2RhythmScheduleCandidatePackage } from '../services/t2DivisionRhythmTemplateRegistryService.js'

function fixtureDateFromOffset(offsetDays: number) {
  const date = new Date(Date.UTC(2026, 4, 1 + offsetDays))
  return date.toISOString().slice(0, 10)
}

describe('t2 rhythm live replay diagnostic', () => {
  it('blocks by default so live T2 replay cannot read the database accidentally', async () => {
    const readerFactory: T2RhythmLiveReplayDiagnosticReaderFactory = vi.fn()

    const report = await buildT2RhythmLiveReplayDiagnosticReport({
      now: new Date('2026-06-22T05:42:00.000+08:00'),
      projectId: 'project-1',
      readerFactory,
    })

    expect(report.reportCode).toBe('c19_t2_rhythm_live_replay_diagnostic')
    expect(report.liveEvidenceRequired).toBe(true)
    expect(report.status).toBe('blocked')
    expect(report.allowLive).toBe(false)
    expect(report.projectId).toBe('project-1')
    expect(report.checks.readiness.status).toBe('blocked')
    expect(readerFactory).not.toHaveBeenCalled()
    expect(shouldFailT2RhythmLiveReplayDiagnosticReport(report)).toBe(true)
  })

  it('passes when archived live readers produce governed T2 shadow replay evidence', async () => {
    const expectedCandidatePackage = buildT2RhythmScheduleCandidatePackage({
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
    const durationBearingWindows = expectedCandidatePackage.packageWindows
      .filter((window) => window.durationBearing)
    const requiredWindowCodes = durationBearingWindows.map((window) => window.windowCode)
    expect(durationBearingWindows.length).toBeGreaterThan(1)
    const workfaceKeys = ['tower-a-floor-1', 'tower-a-floor-2', 'tower-a-floor-3']
    const diverseSamples = durationBearingWindows.flatMap((window, windowIndex) =>
      workfaceKeys.map((workfaceKey, workfaceIndex) => {
        const durationDays = Math.max(1, window.durationDays)
        const offsetDays = windowIndex * 21 + workfaceIndex * 2
        const completedOffsetDays = offsetDays + durationDays - 1
        return {
          taskActual: {
            id: `task-${windowIndex + 1}-${workfaceIndex + 1}`,
            project_id: 'project-1',
            // Each duration-bearing window gets three distinct workfaces so the
            // positive replay fixture genuinely exercises the diversity gate.
            planned_start_date: fixtureDateFromOffset(offsetDays),
            planned_end_date: fixtureDateFromOffset(completedOffsetDays),
            actual_start_date: fixtureDateFromOffset(offsetDays),
            actual_end_date: fixtureDateFromOffset(completedOffsetDays),
            standard_task_metadata: {
              t2RhythmWindowCode: window.windowCode,
              workfaceKey,
              dependencySatisfied: true,
            },
          },
          durationExperience: {
            id: `sample-${windowIndex + 1}-${workfaceIndex + 1}`,
            project_id: 'project-1',
            planned_duration: durationDays,
            actual_duration: durationDays,
            started_at: fixtureDateFromOffset(offsetDays),
            completed_at: fixtureDateFromOffset(completedOffsetDays),
            sample_status: 'active',
            included_in_benchmark: true,
            sample_strength: 'strong',
            metadata: {
              t2RhythmWindowCode: window.windowCode,
              workfaceKey,
              plannedGateDate: fixtureDateFromOffset(completedOffsetDays),
              dependencySatisfied: true,
            },
          },
        }
      }),
    )
    const readerFactory: T2RhythmLiveReplayDiagnosticReaderFactory = vi.fn(async () => ({
      taskActualRows: diverseSamples.map((sample) => sample.taskActual),
      durationExperienceRows: diverseSamples.map((sample) => sample.durationExperience),
    }))

    const report = await buildT2RhythmLiveReplayDiagnosticReport({
      now: new Date('2026-06-22T05:43:00.000+08:00'),
      allowLive: true,
      projectId: 'project-1',
      environment: 'staging',
      evidenceRef: 'supabase:staging:t2-live-replay:001',
      outputFile: 'artifacts/test-runs/20260622-c19/t2-rhythm-live-replay.json',
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
      readerFactory,
    })

    expect(report.status).toBe('pass')
    expect(report.missingArchivedJson).toBe(false)
    expect(report.evidenceMetadata).toEqual({
      environment: 'staging',
      evidenceRef: 'supabase:staging:t2-live-replay:001',
      missingEvidenceMetadata: false,
    })
    expect(report.checks.readiness.status).toBe('pass')
    expect(report.checks.taskActualReplay.status).toBe('pass')
    expect(report.checks.durationExperienceReplay.status).toBe('pass')
    expect(report.checks.taskActualReplay.acceptanceStatus).toBe('shadow_candidate')
    expect(report.checks.durationExperienceReplay.acceptanceStatus).toBe('shadow_candidate')
    expect(report.replayCoverage).toEqual(expect.objectContaining({
      source: 't2_live_replay_duration_bearing_window_coverage',
      status: 'pass',
      requiredDurationBearingWindowCount: durationBearingWindows.length,
      coveredDurationBearingWindowCount: durationBearingWindows.length,
      requiredWindowCodes,
      coveredWindowCodes: requiredWindowCodes,
      missingWindowCodes: [],
      sampleCountByWindowCode: Object.fromEntries(requiredWindowCodes.map((windowCode) => [windowCode, workfaceKeys.length * 2])),
      distinctWorkfaceCountByWindowCode: Object.fromEntries(requiredWindowCodes.map((windowCode) => [windowCode, workfaceKeys.length])),
      minimumSamplesPerDurationBearingWindow: 2,
      minimumDistinctWorkfacesPerDurationBearingWindow: 3,
      underSampledWindowCodes: [],
      underDiverseWorkfaceWindowCodes: [],
      reasonCodes: [],
    }))
    expect(report.standardLibraryTrustGate).toEqual(expect.objectContaining({
      source: 't2_rhythm_standard_library_live_replay_trust_gate',
      status: 'shadow_replay_ready_not_publishable',
      canTrustForRealScheduleCalibration: true,
      canEnterC1913Phase1Selection: true,
      canAutoMaterializeTaskDependencies: false,
      canAutoPublishRuntimeExperience: false,
      trustBoundary: 'archived_live_shadow_replay_only',
      passedGateCodes: expect.arrayContaining([
        'archived_json_present',
        'live_evidence_metadata_present',
        'readiness_pass',
        't2_replay_sample_available',
        'duration_bearing_window_replay_coverage_passed',
        'shadow_replay_acceptance_passed',
      ]),
      releaseBlockers: expect.arrayContaining([
        'l5_canary_publish_rollback_required',
        'c19_13_phase1_multinetwork_selection_required',
        'manual_publication_approval_required',
      ]),
    }))
    expect(report.releaseEvidenceInput).toEqual(expect.objectContaining({
      source: 't2_live_replay_release_evidence_input',
      evidenceMode: 'archived_live_replay',
      selectedTemplateIds: expectedCandidatePackage.selectedTemplateIds,
      evidenceRefs: expect.arrayContaining([
        'supabase:staging:t2-live-replay:001',
        'artifacts/test-runs/20260622-c19/t2-rhythm-live-replay.json',
      ]),
      canFeedReleaseEvidenceClosure: true,
      blockingReasons: [],
      liveReplayTrustGate: report.standardLibraryTrustGate,
    }))
    const replayBackedCandidatePackage = buildT2RhythmScheduleCandidatePackage({
      liveReplayTrustGate: report.releaseEvidenceInput.liveReplayTrustGate,
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
    expect(replayBackedCandidatePackage.standardLibraryReadiness.releaseEvidenceClosure).toEqual(expect.objectContaining({
      selectedTemplateIds: expectedCandidatePackage.selectedTemplateIds,
      readyGateCodes: ['archived_live_replay'],
      blockingGateCodes: expect.arrayContaining([
        'c19_13_phase1_multinetwork_selection',
        'l5_canary_handoff',
      ]),
      templateScopeMismatchCodes: [],
    }))
    expect(report.governance).toEqual(expect.objectContaining({
      readerOnly: true,
      writesPlanDates: false,
      writesTaskDependencies: false,
      requiresL5Publication: true,
    }))
    expect(readerFactory).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      selectedTemplateIds: expect.any(Array),
      windowCodes: expect.arrayContaining(requiredWindowCodes),
    }))
    expect(shouldFailT2RhythmLiveReplayDiagnosticReport(report)).toBe(false)
  })

  it('does not trust live replay for real scheduling when duration-bearing window coverage is partial', async () => {
    const expectedCandidatePackage = buildT2RhythmScheduleCandidatePackage({
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
    const durationBearingWindows = expectedCandidatePackage.packageWindows
      .filter((window) => window.durationBearing)
    expect(durationBearingWindows.length).toBeGreaterThan(1)
    const coveredWindow = durationBearingWindows[0]
    const missingWindowCodes = durationBearingWindows
      .slice(1)
      .map((window) => window.windowCode)
    const windowDurationDays = Math.max(1, coveredWindow.durationDays)
    const readerFactory: T2RhythmLiveReplayDiagnosticReaderFactory = vi.fn(async () => ({
      taskActualRows: Array.from({ length: 12 }, (_, index) => ({
        id: `partial-task-${index + 1}`,
        project_id: 'project-1',
        planned_start_date: `2026-05-${String(index + 1).padStart(2, '0')}`,
        planned_end_date: `2026-05-${String(index + windowDurationDays).padStart(2, '0')}`,
        actual_start_date: `2026-05-${String(index + 1).padStart(2, '0')}`,
        actual_end_date: `2026-05-${String(index + windowDurationDays).padStart(2, '0')}`,
        standard_task_metadata: {
          t2RhythmWindowCode: coveredWindow.windowCode,
          workfaceKey: `tower-a-floor-${index + 1}`,
          dependencySatisfied: true,
        },
      })),
      durationExperienceRows: Array.from({ length: 12 }, (_, index) => ({
        id: `partial-sample-${index + 1}`,
        project_id: 'project-1',
        planned_duration: windowDurationDays,
        actual_duration: windowDurationDays,
        started_at: `2026-05-${String(index + 1).padStart(2, '0')}`,
        completed_at: `2026-05-${String(index + windowDurationDays).padStart(2, '0')}`,
        sample_status: 'active',
        included_in_benchmark: true,
        sample_strength: 'strong',
        metadata: {
          t2RhythmWindowCode: coveredWindow.windowCode,
          workfaceKey: `tower-a-floor-${index + 1}`,
          plannedGateDate: `2026-05-${String(index + windowDurationDays).padStart(2, '0')}`,
          dependencySatisfied: true,
        },
      })),
    }))

    const report = await buildT2RhythmLiveReplayDiagnosticReport({
      now: new Date('2026-06-22T05:43:30.000+08:00'),
      allowLive: true,
      projectId: 'project-1',
      environment: 'staging',
      evidenceRef: 'supabase:staging:t2-live-replay:partial-window-coverage',
      outputFile: 'artifacts/test-runs/20260622-c19/t2-rhythm-live-replay-partial-window-coverage.json',
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
      readerFactory,
    })

    expect(report.status).toBe('fail')
    expect((report as any).replayCoverage).toEqual(expect.objectContaining({
      source: 't2_live_replay_duration_bearing_window_coverage',
      status: 'fail',
      requiredDurationBearingWindowCount: durationBearingWindows.length,
      coveredDurationBearingWindowCount: 1,
      coveredWindowCodes: [coveredWindow.windowCode],
      missingWindowCodes,
      reasonCodes: expect.arrayContaining(['duration_bearing_window_replay_coverage_missing']),
    }))
    expect(report.standardLibraryTrustGate).toEqual(expect.objectContaining({
      status: 'not_trustworthy_for_real_schedule',
      canTrustForRealScheduleCalibration: false,
      canEnterC1913Phase1Selection: false,
      trustBoundary: 'blocked_live_replay_evidence',
      blockingReasons: expect.arrayContaining(['duration_bearing_window_replay_coverage_missing']),
      releaseBlockers: expect.arrayContaining(['duration_bearing_window_replay_coverage_required']),
    }))
    expect(shouldFailT2RhythmLiveReplayDiagnosticReport(report)).toBe(true)
  })

  it('does not trust live replay when duration-bearing windows are covered but under-sampled', async () => {
    const expectedCandidatePackage = buildT2RhythmScheduleCandidatePackage({
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
    const durationBearingWindows = expectedCandidatePackage.packageWindows
      .filter((window) => window.durationBearing)
    const requiredWindowCodes = durationBearingWindows.map((window) => window.windowCode)
    expect(durationBearingWindows.length).toBeGreaterThan(1)
    const sampleWindowForIndex = (index: number) => durationBearingWindows[index < durationBearingWindows.length ? index : 0]
    const underSampledWindowCodes = durationBearingWindows.slice(1).map((window) => window.windowCode)
    const readerFactory: T2RhythmLiveReplayDiagnosticReaderFactory = vi.fn(async () => ({
      taskActualRows: Array.from({ length: 12 }, (_, index) => {
        const window = sampleWindowForIndex(index)
        const durationDays = Math.max(1, window.durationDays)
        return {
          id: `thin-depth-task-${index + 1}`,
          project_id: 'project-1',
          planned_start_date: fixtureDateFromOffset(index * 7),
          planned_end_date: fixtureDateFromOffset(index * 7 + durationDays - 1),
          actual_start_date: fixtureDateFromOffset(index * 7),
          actual_end_date: fixtureDateFromOffset(index * 7 + durationDays - 1),
          standard_task_metadata: {
            t2RhythmWindowCode: window.windowCode,
            workfaceKey: `tower-a-floor-${index + 1}`,
            dependencySatisfied: true,
          },
        }
      }),
      durationExperienceRows: [],
    }))

    const report = await buildT2RhythmLiveReplayDiagnosticReport({
      now: new Date('2026-06-22T05:43:45.000+08:00'),
      allowLive: true,
      projectId: 'project-1',
      environment: 'staging',
      evidenceRef: 'supabase:staging:t2-live-replay:thin-window-depth',
      outputFile: 'artifacts/test-runs/20260622-c19/t2-rhythm-live-replay-thin-window-depth.json',
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
      readerFactory,
    })

    expect(report.checks.taskActualReplay.status).toBe('pass')
    expect(report.checks.taskActualReplay.acceptanceStatus).toBe('shadow_candidate')
    expect(report.replayCoverage).toEqual(expect.objectContaining({
      source: 't2_live_replay_duration_bearing_window_coverage',
      status: 'fail',
      requiredDurationBearingWindowCount: durationBearingWindows.length,
      coveredDurationBearingWindowCount: durationBearingWindows.length,
      requiredWindowCodes,
      coveredWindowCodes: requiredWindowCodes,
      missingWindowCodes: [],
      minimumSamplesPerDurationBearingWindow: 2,
      underSampledWindowCodes,
      reasonCodes: expect.arrayContaining(['duration_bearing_window_replay_sample_depth_missing']),
    }))
    expect(report.standardLibraryTrustGate).toEqual(expect.objectContaining({
      status: 'not_trustworthy_for_real_schedule',
      canTrustForRealScheduleCalibration: false,
      canEnterC1913Phase1Selection: false,
      trustBoundary: 'blocked_live_replay_evidence',
      blockingReasons: expect.arrayContaining(['duration_bearing_window_replay_sample_depth_missing']),
      releaseBlockers: expect.arrayContaining(['duration_bearing_window_replay_sample_depth_required']),
    }))
    expect(shouldFailT2RhythmLiveReplayDiagnosticReport(report)).toBe(true)
  })

  it('does not trust live replay when per-window samples lack workface diversity', async () => {
    const expectedCandidatePackage = buildT2RhythmScheduleCandidatePackage({
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
    const durationBearingWindows = expectedCandidatePackage.packageWindows
      .filter((window) => window.durationBearing)
    const requiredWindowCodes = durationBearingWindows.map((window) => window.windowCode)
    expect(durationBearingWindows.length).toBeGreaterThan(1)
    const readerFactory: T2RhythmLiveReplayDiagnosticReaderFactory = vi.fn(async () => ({
      taskActualRows: Array.from({ length: 12 }, (_, index) => {
        const window = durationBearingWindows[index % durationBearingWindows.length]
        const durationDays = Math.max(1, window.durationDays)
        return {
          id: `single-workface-task-${index + 1}`,
          project_id: 'project-1',
          planned_start_date: fixtureDateFromOffset(index * 7),
          planned_end_date: fixtureDateFromOffset(index * 7 + durationDays - 1),
          actual_start_date: fixtureDateFromOffset(index * 7),
          actual_end_date: fixtureDateFromOffset(index * 7 + durationDays - 1),
          standard_task_metadata: {
            t2RhythmWindowCode: window.windowCode,
            workfaceKey: `${window.windowCode}:single-workface`,
            dependencySatisfied: true,
          },
        }
      }),
      durationExperienceRows: [],
    }))

    const report = await buildT2RhythmLiveReplayDiagnosticReport({
      now: new Date('2026-06-22T05:43:50.000+08:00'),
      allowLive: true,
      projectId: 'project-1',
      environment: 'staging',
      evidenceRef: 'supabase:staging:t2-live-replay:single-workface-depth',
      outputFile: 'artifacts/test-runs/20260622-c19/t2-rhythm-live-replay-single-workface-depth.json',
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
      readerFactory,
    })

    expect(report.checks.taskActualReplay.status).toBe('pass')
    expect(report.checks.taskActualReplay.acceptanceStatus).toBe('shadow_candidate')
    expect(report.replayCoverage).toEqual(expect.objectContaining({
      status: 'fail',
      requiredWindowCodes,
      coveredWindowCodes: requiredWindowCodes,
      missingWindowCodes: [],
      underSampledWindowCodes: [],
      minimumDistinctWorkfacesPerDurationBearingWindow: 3,
      underDiverseWorkfaceWindowCodes: requiredWindowCodes,
      reasonCodes: expect.arrayContaining(['duration_bearing_window_replay_workface_diversity_missing']),
    }))
    expect(report.standardLibraryTrustGate).toEqual(expect.objectContaining({
      status: 'not_trustworthy_for_real_schedule',
      canTrustForRealScheduleCalibration: false,
      canEnterC1913Phase1Selection: false,
      trustBoundary: 'blocked_live_replay_evidence',
      blockingReasons: expect.arrayContaining(['duration_bearing_window_replay_workface_diversity_missing']),
      releaseBlockers: expect.arrayContaining(['duration_bearing_window_replay_workface_diversity_required']),
    }))
    expect(shouldFailT2RhythmLiveReplayDiagnosticReport(report)).toBe(true)
  })

  it('trusts live replay when each duration-bearing window is covered by at least three distinct workfaces', async () => {
    const expectedCandidatePackage = buildT2RhythmScheduleCandidatePackage({
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
    const durationBearingWindows = expectedCandidatePackage.packageWindows
      .filter((window) => window.durationBearing)
    const requiredWindowCodes = durationBearingWindows.map((window) => window.windowCode)
    const workfaceKeys = ['tower-a-floor-1', 'tower-a-floor-2', 'tower-a-floor-3']
    const taskActualRows = durationBearingWindows.flatMap((window, windowIndex) => {
      const durationDays = Math.max(1, window.durationDays)
      return workfaceKeys.map((workfaceKey, workfaceIndex) => {
        const offsetDays = windowIndex * 21 + workfaceIndex * 2
        const completedOffsetDays = offsetDays + durationDays - 1
        return {
          id: `diverse-task-${windowIndex + 1}-${workfaceIndex + 1}`,
          project_id: 'project-1',
          planned_start_date: fixtureDateFromOffset(offsetDays),
          planned_end_date: fixtureDateFromOffset(completedOffsetDays),
          actual_start_date: fixtureDateFromOffset(offsetDays),
          actual_end_date: fixtureDateFromOffset(completedOffsetDays),
          standard_task_metadata: {
            t2RhythmWindowCode: window.windowCode,
            workfaceKey,
            dependencySatisfied: true,
          },
        }
      })
    })
    const durationExperienceRows = durationBearingWindows.flatMap((window, windowIndex) => {
      const durationDays = Math.max(1, window.durationDays)
      return workfaceKeys.map((workfaceKey, workfaceIndex) => {
        const offsetDays = windowIndex * 21 + workfaceIndex * 2
        const completedOffsetDays = offsetDays + durationDays - 1
        return {
          id: `diverse-sample-${windowIndex + 1}-${workfaceIndex + 1}`,
          project_id: 'project-1',
          planned_duration: durationDays,
          actual_duration: durationDays,
          started_at: fixtureDateFromOffset(offsetDays),
          completed_at: fixtureDateFromOffset(completedOffsetDays),
          sample_status: 'active',
          included_in_benchmark: true,
          sample_strength: 'strong',
          metadata: {
            t2RhythmWindowCode: window.windowCode,
            workfaceKey,
            plannedGateDate: fixtureDateFromOffset(completedOffsetDays),
            dependencySatisfied: true,
          },
        }
      })
    })
    const readerFactory: T2RhythmLiveReplayDiagnosticReaderFactory = vi.fn(async () => ({
      taskActualRows,
      durationExperienceRows,
    }))

    const report = await buildT2RhythmLiveReplayDiagnosticReport({
      now: new Date('2026-06-22T05:43:40.000+08:00'),
      allowLive: true,
      projectId: 'project-1',
      environment: 'staging',
      evidenceRef: 'supabase:staging:t2-live-replay:diverse-depth',
      outputFile: 'artifacts/test-runs/20260622-c19/t2-rhythm-live-replay-diverse-depth.json',
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
      readerFactory,
    })

    expect(report.replayCoverage).toEqual(expect.objectContaining({
      status: 'pass',
      requiredWindowCodes,
      coveredWindowCodes: requiredWindowCodes,
      missingWindowCodes: [],
      minimumDistinctWorkfacesPerDurationBearingWindow: 3,
      minimumSamplesPerDurationBearingWindow: 2,
      sampleCountByWindowCode: Object.fromEntries(requiredWindowCodes.map((windowCode) => [windowCode, workfaceKeys.length * 2])),
      distinctWorkfaceCountByWindowCode: Object.fromEntries(requiredWindowCodes.map((windowCode) => [windowCode, workfaceKeys.length])),
      underDiverseWorkfaceWindowCodes: [],
      underSampledWindowCodes: [],
      reasonCodes: [],
    }))
    expect(report.standardLibraryTrustGate).toEqual(expect.objectContaining({
      status: 'shadow_replay_ready_not_publishable',
      canTrustForRealScheduleCalibration: true,
      canEnterC1913Phase1Selection: true,
      trustBoundary: 'archived_live_shadow_replay_only',
      blockingReasons: [],
      releaseBlockers: expect.arrayContaining([
        'l5_canary_publish_rollback_required',
        'c19_13_phase1_multinetwork_selection_required',
        'manual_publication_approval_required',
      ]),
    }))
    expect(shouldFailT2RhythmLiveReplayDiagnosticReport(report)).toBe(false)
  })

  it('fails closeout when live evidence metadata or archived JSON is missing even if replay metrics pass', async () => {
    const readerFactory: T2RhythmLiveReplayDiagnosticReaderFactory = vi.fn(async () => ({
      taskActualRows: [],
      durationExperienceRows: [],
    }))

    const report = await buildT2RhythmLiveReplayDiagnosticReport({
      now: new Date('2026-06-22T05:44:00.000+08:00'),
      allowLive: true,
      projectId: 'project-1',
      readerFactory,
    })

    expect(report.status).toBe('fail')
    expect(report.missingArchivedJson).toBe(true)
    expect(report.evidenceMetadata.missingEvidenceMetadata).toBe(true)
    expect(report.checks.readiness.reasonCodes).toEqual(expect.arrayContaining([
      'missing_archived_json',
      'missing_evidence_metadata',
    ]))
    expect(shouldFailT2RhythmLiveReplayDiagnosticReport(report)).toBe(true)
  })

  it('reports sample availability gaps when live rows do not contain T2 window metadata', async () => {
    const readerFactory: T2RhythmLiveReplayDiagnosticReaderFactory = vi.fn(async () => ({
      taskActualRows: Array.from({ length: 11 }, (_, index) => ({
        id: `task-with-actual-no-t2-${index + 1}`,
        project_id: 'project-1',
        planned_start_date: `2026-05-${String(index + 1).padStart(2, '0')}`,
        planned_end_date: `2026-05-${String(index + 2).padStart(2, '0')}`,
        actual_start_date: `2026-05-${String(index + 1).padStart(2, '0')}`,
        actual_end_date: `2026-05-${String(index + 2).padStart(2, '0')}`,
        standard_task_metadata: {},
      })),
      durationExperienceRows: [],
    }))

    const report = await buildT2RhythmLiveReplayDiagnosticReport({
      now: new Date('2026-06-22T05:45:00.000+08:00'),
      allowLive: true,
      projectId: 'project-1',
      environment: 'current-live',
      evidenceRef: 'supabase:current-live:t2-live-replay:no-window-metadata',
      outputFile: 'artifacts/test-runs/20260622-c19/t2-rhythm-live-replay-no-window-metadata.json',
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
      readerFactory,
    })

    expect(report.status).toBe('fail')
    expect(report.missingArchivedJson).toBe(false)
    expect(report.checks.readiness.status).toBe('pass')
    expect(report.checks.taskActualReplay).toEqual(expect.objectContaining({
      status: 'fail',
      rowCount: 11,
      sampleCount: 0,
      rejectedRowCount: 11,
      sourceRowCount: 11,
      usableSampleCount: 0,
      liveRowsWithoutT2WindowMetadata: 11,
      rejectionReasonCodes: ['missing_t2_window_code'],
    }))
    expect(report.checks.taskActualReplay.reasonCodes).toEqual(expect.arrayContaining([
      'live_rows_without_t2_window_metadata',
      'no_t2_replay_samples',
    ]))
    expect(report.checks.durationExperienceReplay).toEqual(expect.objectContaining({
      status: 'fail',
      rowCount: 0,
      sourceRowCount: 0,
      usableSampleCount: 0,
      liveRowsWithoutT2WindowMetadata: 0,
      rejectionReasonCodes: [],
    }))
    expect(report.checks.durationExperienceReplay.reasonCodes).toEqual(expect.arrayContaining([
      'duration_experience_samples_empty',
      'no_t2_replay_samples',
    ]))
    expect(report.sampleAvailability).toEqual(expect.objectContaining({
      status: 'fail',
      totalSourceRowCount: 11,
      totalUsableSampleCount: 0,
      totalLiveRowsWithoutT2WindowMetadata: 11,
      reasonCodes: expect.arrayContaining([
        'live_rows_without_t2_window_metadata',
        'no_t2_replay_samples',
        'duration_experience_samples_empty',
      ]),
    }))
    expect(report.standardLibraryTrustGate).toEqual(expect.objectContaining({
      source: 't2_rhythm_standard_library_live_replay_trust_gate',
      status: 'not_trustworthy_for_real_schedule',
      canTrustForRealScheduleCalibration: false,
      canEnterC1913Phase1Selection: false,
      canAutoMaterializeTaskDependencies: false,
      canAutoPublishRuntimeExperience: false,
      trustBoundary: 'blocked_live_replay_evidence',
      releaseBlockers: expect.arrayContaining([
        'archived_live_replay_required',
        'usable_live_replay_samples_required',
        'manual_annotation_gap_closure_required',
      ]),
      blockingReasons: expect.arrayContaining([
        'live_rows_without_t2_window_metadata',
        'no_t2_replay_samples',
      ]),
    }))
    expect(report.annotationCandidateReport).toEqual(expect.objectContaining({
      source: 't2_task_window_annotation_candidate_report',
      taskRowsRead: 11,
      annotationCandidateCount: 0,
      annotationGapCount: 11,
      canFeedReplayEvidence: false,
      governance: expect.objectContaining({
        readerOnly: true,
        writesStandardTaskMetadata: false,
        requiresManualApproval: true,
      }),
    }))
    expect(report.annotationCandidateEventSummary).toEqual(expect.objectContaining({
      status: 'annotation_data_collection_open',
      eventKey: null,
      assetKey: null,
      lifecycleStatus: null,
      runtimeEffectPolicy: null,
      blockingReasons: expect.arrayContaining(['no_manual_annotation_candidates']),
      canWriteRuntime: false,
      canFeedReplayEvidence: false,
      governance: expect.objectContaining({
        readerOnly: true,
        writesStandardTaskMetadata: false,
        requiresManualApproval: true,
      }),
    }))
    expect(shouldFailT2RhythmLiveReplayDiagnosticReport(report)).toBe(true)
  })

  it('surfaces manual annotation candidate events when task title and duration can propose T2 window metadata', async () => {
    const readerFactory: T2RhythmLiveReplayDiagnosticReaderFactory = vi.fn(async () => ({
      taskActualRows: [
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
      durationExperienceRows: [],
    }))

    const report = await buildT2RhythmLiveReplayDiagnosticReport({
      now: new Date('2026-06-22T05:46:00.000+08:00'),
      allowLive: true,
      projectId: 'project-1',
      environment: 'current-live',
      evidenceRef: 'supabase:current-live:t2-live-replay:annotation-candidate',
      outputFile: 'artifacts/test-runs/20260622-c19/t2-rhythm-live-replay-annotation-candidate.json',
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
      readerFactory,
    })

    expect(report.status).toBe('fail')
    expect(report.annotationCandidateReport).toEqual(expect.objectContaining({
      annotationCandidateCount: 1,
      annotationGapCount: 0,
      canFeedReplayEvidence: false,
    }))
    expect(report.annotationCandidateEventSummary).toEqual(expect.objectContaining({
      status: 'annotation_candidate_event_created',
      eventKey: expect.stringContaining('t2RhythmTaskWindowAnnotationCandidateEventService'),
      assetKey: 't2.rhythm.task_window_annotation:project-1:t2-residential-standard-floor-structure-rhythm-v1',
      lifecycleStatus: 'review_required',
      runtimeEffectPolicy: 'candidate_only',
      blockingReasons: [],
      canWriteRuntime: false,
      canFeedReplayEvidence: false,
    }))
    expect(report.annotationReviewPackage).toEqual(expect.objectContaining({
      source: 't2_live_replay_annotation_review_package',
      status: 'ready_for_manual_review',
      assetKey: 't2.rhythm.task_window_annotation:project-1:t2-residential-standard-floor-structure-rhythm-v1',
      projectId: 'project-1',
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      evidenceRef: 'supabase:current-live:t2-live-replay:annotation-candidate',
      annotationCandidateCount: 1,
      annotationGapCount: 0,
      canFeedReplayEvidence: false,
      writesStandardTaskMetadata: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      requiresManualApproval: true,
      requiresReleaseExitBeforeMetadataWrite: true,
    }))
    expect(report.annotationReviewPackage?.annotationCandidates).toEqual([
      expect.objectContaining({
        taskId: 'task-concrete-pour',
        proposedWindowRole: 'concrete_pour',
        requiresManualApproval: true,
        autoWriteAllowed: false,
      }),
    ])
    expect(report.annotationReviewPackage?.mutationBoundary).toEqual({
      writesStandardTaskMetadata: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    })
    expect(evaluateT2RhythmStandardLibraryTrustGate(report)).toEqual(report.standardLibraryTrustGate)
  })

  it('summarizes annotation gap closure potential for live rows that lack T2 window metadata', async () => {
    const readerFactory: T2RhythmLiveReplayDiagnosticReaderFactory = vi.fn(async () => ({
      taskActualRows: [
        {
          id: 'task-concrete-pour-gap-closure',
          project_id: 'project-1',
          title: '7#楼标准层混凝土浇筑',
          specialty_type: '土建',
          planned_start_date: '2026-05-06',
          planned_end_date: '2026-05-06',
          actual_start_date: '2026-05-06',
          actual_end_date: '2026-05-06',
          standard_task_metadata: {},
        },
        {
          id: 'task-off-scope-gap',
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
      durationExperienceRows: [],
    }))

    const report = await buildT2RhythmLiveReplayDiagnosticReport({
      now: new Date('2026-06-22T05:46:30.000+08:00'),
      allowLive: true,
      projectId: 'project-1',
      environment: 'current-live',
      evidenceRef: 'supabase:current-live:t2-live-replay:annotation-gap-closure',
      outputFile: 'artifacts/test-runs/20260622-c19/t2-rhythm-live-replay-annotation-gap-closure.json',
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
      readerFactory,
    })

    expect(report.status).toBe('fail')
    expect(report.annotationGapClosure).toEqual(expect.objectContaining({
      source: 't2_live_replay_annotation_gap_closure',
      status: 'manual_annotation_candidates_open',
      taskRowsRead: 2,
      liveRowsWithoutT2WindowMetadata: 2,
      manualAnnotationCandidateCount: 1,
      highConfidenceCandidateCount: 1,
      mediumConfidenceCandidateCount: 0,
      annotationGapCount: 1,
      projectedReplaySampleCountAfterManualApproval: 1,
      projectedUnclosedGapCount: 1,
      reasonCodes: expect.arrayContaining([
        'manual_annotation_required_before_replay',
        'remaining_annotation_gaps',
      ]),
      governance: expect.objectContaining({
        readerOnly: true,
        candidateOnly: true,
        writesStandardTaskMetadata: false,
        writesTaskDependencies: false,
        writesPlanDates: false,
        requiresManualApproval: true,
        requiresReleaseExitBeforeMetadataWrite: true,
      }),
    }))
  })

  it('surfaces post-annotation replay readiness from approved T2 metadata without bypassing live replay gates', async () => {
    const expectedCandidatePackage = buildT2RhythmScheduleCandidatePackage({
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
    const window = expectedCandidatePackage.packageWindows.find((item) => item.durationBearing)
    expect(window).toBeTruthy()
    const readerFactory: T2RhythmLiveReplayDiagnosticReaderFactory = vi.fn(async () => ({
      taskActualRows: [
        {
          id: 'task-approved-thin',
          project_id: 'project-1',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-04',
          actual_start_date: '2026-05-01',
          actual_end_date: '2026-05-04',
          standard_task_metadata: {
            t2RhythmWindowCode: window?.windowCode,
            t2RhythmWindowRole: window?.role,
            t2RhythmAnnotationApproved: true,
            t2RhythmCanFeedReplayAfterNextDiagnostic: true,
            t2RhythmAnnotationReleaseRecordTarget: 't2-task-window-annotation-release:project-1:20260622',
            t2RhythmAnnotationRollbackTarget: 't2-task-window-annotation-rollback:project-1:previous',
          },
        },
      ],
      durationExperienceRows: [],
    }))

    const report = await buildT2RhythmLiveReplayDiagnosticReport({
      now: new Date('2026-06-22T05:47:00.000+08:00'),
      allowLive: true,
      projectId: 'project-1',
      environment: 'current-live',
      evidenceRef: 'supabase:current-live:t2-live-replay:post-annotation',
      outputFile: 'artifacts/test-runs/20260622-c19/t2-rhythm-live-replay-post-annotation.json',
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
      readerFactory,
    })

    expect(report.status).toBe('fail')
    expect(report.postAnnotationReplayReadiness).toEqual(expect.objectContaining({
      source: 't2_task_window_annotation_replay_readiness',
      status: 'data_collection_open',
      taskRowsRead: 1,
      approvedMetadataRowCount: 1,
      replaySampleCount: 1,
      canFeedReplayEvidenceAfterNextDiagnostic: false,
      writesStandardTaskMetadata: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
    }))
    expect(report.postAnnotationReplayReadiness?.blockingReasons).toEqual(expect.arrayContaining([
      'sample_gate_not_met',
      'shadow_replay_not_ready',
    ]))
    expect(report.checks.taskActualReplay.acceptanceStatus).toBe('data_collection_open')
    expect(shouldFailT2RhythmLiveReplayDiagnosticReport(report)).toBe(true)
  })

  it('surfaces capped unknown T2 window code samples for live replay data remediation', async () => {
    const unknownTaskWindowCodes = [
      'legacy-task-window-01',
      'legacy-task-window-02',
      'legacy-task-window-03',
      'legacy-task-window-04',
      'legacy-task-window-05',
      'legacy-task-window-06',
      'legacy-task-window-07',
      'legacy-task-window-08',
      'legacy-task-window-09',
      'legacy-task-window-10',
      'legacy-task-window-11',
      'legacy-task-window-01',
    ]
    const readerFactory: T2RhythmLiveReplayDiagnosticReaderFactory = vi.fn(async () => ({
      taskActualRows: unknownTaskWindowCodes.map((windowCode, index) => ({
        id: `task-unknown-window-${index + 1}`,
        project_id: 'project-1',
        planned_start_date: fixtureDateFromOffset(index),
        planned_end_date: fixtureDateFromOffset(index + 2),
        actual_start_date: fixtureDateFromOffset(index),
        actual_end_date: fixtureDateFromOffset(index + 2),
        standard_task_metadata: {
          t2RhythmWindowCode: windowCode,
          workfaceKey: `tower-a-floor-${index + 1}`,
        },
      })),
      durationExperienceRows: [
        {
          id: 'duration-unknown-window-1',
          project_id: 'project-1',
          planned_duration: 3,
          actual_duration: 3,
          started_at: fixtureDateFromOffset(1),
          completed_at: fixtureDateFromOffset(3),
          sample_status: 'active',
          included_in_benchmark: true,
          sample_strength: 'strong',
          metadata: {
            t2RhythmWindowCode: 'legacy-duration-window-01',
            workfaceKey: 'tower-a-floor-1',
          },
        },
      ],
    }))

    const report = await buildT2RhythmLiveReplayDiagnosticReport({
      now: new Date('2026-06-22T05:47:30.000+08:00'),
      allowLive: true,
      projectId: 'project-1',
      environment: 'staging',
      evidenceRef: 'supabase:staging:t2-live-replay:unknown-window-codes',
      outputFile: 'artifacts/test-runs/20260622-c19/t2-rhythm-live-replay-unknown-window-codes.json',
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
      readerFactory,
    })

    expect(report.status).toBe('fail')
    expect(report.checks.taskActualReplay.rejectionReasonCodes).toEqual(['unknown_t2_window_code'])
    expect(report.checks.taskActualReplay.unknownWindowCodeSamples).toEqual([
      'legacy-task-window-01',
      'legacy-task-window-02',
      'legacy-task-window-03',
      'legacy-task-window-04',
      'legacy-task-window-05',
      'legacy-task-window-06',
      'legacy-task-window-07',
      'legacy-task-window-08',
      'legacy-task-window-09',
      'legacy-task-window-10',
    ])
    expect(report.checks.durationExperienceReplay.rejectionReasonCodes).toEqual(['unknown_t2_window_code'])
    expect(report.checks.durationExperienceReplay.unknownWindowCodeSamples).toEqual([
      'legacy-duration-window-01',
    ])
    expect(shouldFailT2RhythmLiveReplayDiagnosticReport(report)).toBe(true)
  })

  it('parses live replay CLI flags', () => {
    expect(parseT2RhythmLiveReplayDiagnosticOptionsFromArgs([
      '--allow-live',
      '--project-id=project-1',
      '--business-type=residential',
      '--phase-window=superstructure',
      '--division-family=superstructure',
      '--subdivision-family=standard_floor_handover',
      '--method-variant=aluminum_formwork',
      '--scope-dimension=building',
      '--fact=hasOrderedFloors=true',
      '--fact=hasBasementHandover=true',
      '--organization-assumption=basement_first_then_tower',
      '--workface-unit=floor',
      '--environment=staging',
      '--evidence-ref=supabase:staging:t2-live-replay:001',
      '--output-file=artifacts/test-runs/c19-t2.json',
    ])).toEqual(expect.objectContaining({
      allowLive: true,
      projectId: 'project-1',
      environment: 'staging',
      evidenceRef: 'supabase:staging:t2-live-replay:001',
      outputFile: 'artifacts/test-runs/c19-t2.json',
      selection: expect.objectContaining({
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['aluminum_formwork'],
        scopeDimensions: ['building'],
      }),
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: true,
      },
      organizationAssumptions: ['basement_first_then_tower'],
      selectedWorkfaceUnits: ['floor'],
    }))
  })
})
