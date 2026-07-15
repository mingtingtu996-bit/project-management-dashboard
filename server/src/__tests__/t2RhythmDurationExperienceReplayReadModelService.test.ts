import { describe, expect, it } from 'vitest'

import { buildT2RhythmScheduleCandidatePackage } from '../services/t2DivisionRhythmTemplateRegistryService.js'
import {
  buildT2RhythmDurationExperienceReplayEvidence,
  createT2RhythmDurationExperienceSupabaseReader,
} from '../services/t2RhythmDurationExperienceReplayReadModelService.js'

function buildCandidatePackage() {
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

describe('t2RhythmDurationExperienceReplayReadModelService', () => {
  it('turns governed duration_experience_samples into T2 replay evidence without publishing or writing schedule data', async () => {
    const candidatePackage = buildCandidatePackage()
    const window = candidatePackage.packageWindows.find((item) => item.durationBearing)
    expect(window).toBeTruthy()
    const durationDays = Math.max(1, window?.durationDays ?? 1)
    const rows = Array.from({ length: 12 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0')
      const endDay = String(index + durationDays).padStart(2, '0')
      return {
        id: `duration-sample-${index + 1}`,
        project_id: 'project-1',
        planned_duration: durationDays,
        actual_duration: durationDays,
        started_at: `2026-05-${day}`,
        completed_at: `2026-05-${endDay}`,
        sample_status: 'active',
        included_in_benchmark: true,
        sample_strength: 'strong',
        metadata: {
          t2RhythmWindowCode: window?.windowCode,
          workfaceKey: `tower-a-floor-${index + 1}`,
          plannedGateDate: `2026-05-${endDay}`,
          dependencySatisfied: true,
        },
      }
    })
    const calls: unknown[] = []

    const result = await buildT2RhythmDurationExperienceReplayEvidence({
      projectId: 'project-1',
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      candidatePackage,
      reader: async (query) => {
        calls.push(query)
        return rows
      },
    })

    expect(calls).toEqual([expect.objectContaining({
      projectId: 'project-1',
      candidatePackageId: 't2_division_rhythm_schedule_candidate_package',
      selectedTemplateIds: candidatePackage.selectedTemplateIds,
      windowCodes: expect.arrayContaining([window?.windowCode]),
    })])
    expect(result.source).toBe('t2_duration_experience_replay_read_model')
    expect(result.durationExperienceRowsRead).toBe(12)
    expect(result.adapter.samples).toHaveLength(12)
    expect(result.evidence.acceptance.status).toBe('shadow_candidate')
    expect(result.evidence.acceptance.readyForPublish).toBe(false)
    expect(result.governance).toEqual(expect.objectContaining({
      readerOnly: true,
      directSeedMutationAllowed: false,
      writesPlanDates: false,
      writesTaskDependencies: false,
      requiresL5Publication: true,
    }))
  })

  it('keeps weak, unknown-window, or missing-date duration experience rows out of replay metrics', async () => {
    const candidatePackage = buildCandidatePackage()
    const window = candidatePackage.packageWindows.find((item) => item.durationBearing)

    const result = await buildT2RhythmDurationExperienceReplayEvidence({
      projectId: 'project-1',
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      candidatePackage,
      reader: async () => [
        {
          id: 'unknown-window',
          project_id: 'project-1',
          planned_duration: 3,
          actual_duration: 3,
          started_at: '2026-05-01',
          completed_at: '2026-05-03',
          sample_strength: 'strong',
          metadata: { t2RhythmWindowCode: 'not-in-package' },
        },
        {
          id: 'weak-row',
          project_id: 'project-1',
          planned_duration: 3,
          actual_duration: 3,
          started_at: '2026-05-01',
          completed_at: '2026-05-03',
          sample_strength: 'unusable',
          metadata: { t2RhythmWindowCode: window?.windowCode },
        },
        {
          id: 'missing-date',
          project_id: 'project-1',
          planned_duration: 3,
          actual_duration: 3,
          sample_strength: 'strong',
          metadata: { t2RhythmWindowCode: window?.windowCode },
        },
      ],
    })

    expect(result.adapter.samples).toHaveLength(0)
    expect(result.adapter.rejectedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowId: 'unknown-window', reasonCode: 'unknown_t2_window_code' }),
      expect.objectContaining({ rowId: 'weak-row', reasonCode: 'unusable_sample_strength' }),
      expect.objectContaining({ rowId: 'missing-date', reasonCode: 'missing_actual_window_dates' }),
    ]))
    expect(result.evidence.acceptance.status).toBe('data_collection_open')
  })

  it('normalizes shorthand T2 window codes from duration experience metadata to package window codes', async () => {
    const candidatePackage = buildCandidatePackage()
    const fullWindow = candidatePackage.packageWindows.find((item) => item.windowCode.endsWith(':W01'))
    expect(fullWindow).toBeTruthy()

    const result = await buildT2RhythmDurationExperienceReplayEvidence({
      projectId: 'project-1',
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      candidatePackage,
      reader: async () => [
        {
          id: 'duration-short-window',
          project_id: 'project-1',
          planned_duration: fullWindow?.durationDays,
          actual_duration: fullWindow?.durationDays,
          started_at: '2026-05-01',
          completed_at: '2026-05-04',
          sample_status: 'active',
          included_in_benchmark: true,
          sample_strength: 'strong',
          metadata: {
            t2RhythmWindowCode: 'W01',
            workfaceKey: 'tower-a-floor-01',
            dependencySatisfied: true,
          },
        },
      ],
    })

    expect(result.adapter.rejectedRows).toEqual([])
    expect(result.adapter.samples).toEqual([
      expect.objectContaining({
        sampleId: 'duration_experience_samples:duration-short-window',
        windowCode: fullWindow?.windowCode,
        templateP80WindowDurationDays: fullWindow?.durationDays,
      }),
    ])
  })

  it('provides a default Supabase duration_experience_samples reader with fixed fields and guarded filters', async () => {
    const calls: Array<{ method: string; args: unknown[] }> = []
    const rows = [
      {
        id: 'sample-match',
        project_id: 'project-1',
        planned_duration: 3,
        actual_duration: 3,
        started_at: '2026-05-01',
        completed_at: '2026-05-03',
        metadata: { t2RhythmWindowCode: 'window-a' },
      },
      {
        id: 'sample-other-window',
        project_id: 'project-1',
        planned_duration: 3,
        actual_duration: 3,
        started_at: '2026-05-01',
        completed_at: '2026-05-03',
        metadata: { t2RhythmWindowCode: 'window-b' },
      },
    ]
    const query = {
      select: (...args: unknown[]) => {
        calls.push({ method: 'select', args })
        return query
      },
      eq: (...args: unknown[]) => {
        calls.push({ method: 'eq', args })
        return query
      },
      not: (...args: unknown[]) => {
        calls.push({ method: 'not', args })
        return query
      },
      limit: (...args: unknown[]) => {
        calls.push({ method: 'limit', args })
        return Promise.resolve({ data: rows, error: null })
      },
    }
    const supabaseLike = {
      from: (...args: unknown[]) => {
        calls.push({ method: 'from', args })
        return query
      },
    }

    const reader = createT2RhythmDurationExperienceSupabaseReader(supabaseLike, { limit: 80 })
    const result = await reader({
      projectId: 'project-1',
      candidatePackageId: 't2_division_rhythm_schedule_candidate_package',
      selectedTemplateIds: ['template-a'],
      windowCodes: ['window-a'],
    })

    expect(result).toEqual([expect.objectContaining({ id: 'sample-match' })])
    expect(calls).toEqual(expect.arrayContaining([
      { method: 'from', args: ['duration_experience_samples'] },
      expect.objectContaining({ method: 'eq', args: ['project_id', 'project-1'] }),
      expect.objectContaining({ method: 'eq', args: ['sample_status', 'active'] }),
      expect.objectContaining({ method: 'eq', args: ['included_in_benchmark', true] }),
      expect.objectContaining({ method: 'not', args: ['started_at', 'is', null] }),
      expect.objectContaining({ method: 'not', args: ['completed_at', 'is', null] }),
      expect.objectContaining({ method: 'limit', args: [80] }),
    ]))
    const selectCall = calls.find((call) => call.method === 'select')
    expect(String(selectCall?.args[0])).toContain('duration_calibration_source')
    expect(String(selectCall?.args[0])).toContain('learning_scope')
    expect(String(selectCall?.args[0])).toContain('metadata')
  })

  it('can preserve non-matching duration experience rows for live replay diagnostics', async () => {
    const rows = [
      {
        id: 'sample-match',
        project_id: 'project-1',
        planned_duration: 3,
        actual_duration: 3,
        started_at: '2026-05-01',
        completed_at: '2026-05-03',
        metadata: { t2RhythmWindowCode: 'window-a' },
      },
      {
        id: 'sample-other-window',
        project_id: 'project-1',
        planned_duration: 3,
        actual_duration: 3,
        started_at: '2026-05-01',
        completed_at: '2026-05-03',
        metadata: { t2RhythmWindowCode: 'window-b' },
      },
      {
        id: 'sample-missing-window',
        project_id: 'project-1',
        planned_duration: 3,
        actual_duration: 3,
        started_at: '2026-05-01',
        completed_at: '2026-05-03',
        metadata: {},
      },
    ]
    const query = {
      select: () => query,
      eq: () => query,
      not: () => query,
      limit: () => Promise.resolve({ data: rows, error: null }),
    }
    const supabaseLike = { from: () => query }

    const reader = createT2RhythmDurationExperienceSupabaseReader(supabaseLike, {
      preserveRowsForDiagnostics: true,
    })
    const result = await reader({
      projectId: 'project-1',
      candidatePackageId: 't2_division_rhythm_schedule_candidate_package',
      selectedTemplateIds: ['template-a'],
      windowCodes: ['window-a'],
    })

    expect(result.map((row) => row.id)).toEqual([
      'sample-match',
      'sample-other-window',
      'sample-missing-window',
    ])
  })

  it('keeps unique T2 window aliases in the Supabase reader before adapter normalization', async () => {
    const rows = [
      {
        id: 'sample-full-code',
        project_id: 'project-1',
        planned_duration: 3,
        actual_duration: 3,
        started_at: '2026-05-01',
        completed_at: '2026-05-03',
        metadata: { t2RhythmWindowCode: 'template-a:W01' },
      },
      {
        id: 'sample-short-code',
        project_id: 'project-1',
        planned_duration: 3,
        actual_duration: 3,
        started_at: '2026-05-01',
        completed_at: '2026-05-03',
        metadata: { t2RhythmWindowCode: 'W02' },
      },
      {
        id: 'sample-template-short-code',
        project_id: 'project-1',
        planned_duration: 3,
        actual_duration: 3,
        started_at: '2026-05-01',
        completed_at: '2026-05-03',
        metadata: { t2RhythmWindowCode: 'template-a:W03' },
      },
      {
        id: 'sample-ambiguous-short-code',
        project_id: 'project-1',
        planned_duration: 3,
        actual_duration: 3,
        started_at: '2026-05-01',
        completed_at: '2026-05-03',
        metadata: { t2RhythmWindowCode: 'W04' },
      },
      {
        id: 'sample-unknown-code',
        project_id: 'project-1',
        planned_duration: 3,
        actual_duration: 3,
        started_at: '2026-05-01',
        completed_at: '2026-05-03',
        metadata: { t2RhythmWindowCode: 'legacy-window' },
      },
    ]
    const query = {
      select: () => query,
      eq: () => query,
      not: () => query,
      limit: () => Promise.resolve({ data: rows, error: null }),
    }
    const supabaseLike = { from: () => query }

    const reader = createT2RhythmDurationExperienceSupabaseReader(supabaseLike)
    const result = await reader({
      projectId: 'project-1',
      candidatePackageId: 't2_division_rhythm_schedule_candidate_package',
      selectedTemplateIds: ['template-a', 'template-b'],
      windowCodes: [
        'template-a:W01',
        'template-a:W02',
        'template-a:W03',
        'template-a:W04',
        'template-b:W04',
      ],
    })

    expect(result.map((row) => row.id)).toEqual([
      'sample-full-code',
      'sample-short-code',
      'sample-template-short-code',
    ])
  })
})
