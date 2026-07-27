import { describe, expect, it } from 'vitest'

import { buildT2RhythmScheduleCandidatePackage } from '../services/t2DivisionRhythmTemplateRegistryService.js'
import {
  buildT2RhythmTaskActualReplayEvidence,
  createT2RhythmTaskActualSupabaseReader,
} from '../services/t2RhythmTaskActualReplayReadModelService.js'

describe('t2RhythmTaskActualReplayReadModelService', () => {
  it('reads task actual rows through an injected read model and builds governed replay evidence', async () => {
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
    const taskRows = Array.from({ length: 12 }, (_, index) => {
      const day = String(index + 1).padStart(2, '0')
      const durationDays = Math.max(1, window?.durationDays ?? 1)
      const endDay = String(index + durationDays).padStart(2, '0')
      return {
        id: `task-${index + 1}`,
        project_id: 'project-1',
        planned_start_date: `2026-05-${day}`,
        planned_end_date: `2026-05-${endDay}`,
        actual_start_date: `2026-05-${day}`,
        actual_end_date: `2026-05-${endDay}`,
        standard_task_metadata: {
          t2RhythmWindowCode: window?.windowCode,
          workfaceKey: `tower-a-floor-${index + 1}`,
          dependencySatisfied: true,
        },
      }
    })
    const calls: unknown[] = []

    const result = await buildT2RhythmTaskActualReplayEvidence({
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      candidatePackage,
      projectId: 'project-1',
      reader: async (query) => {
        calls.push(query)
        return taskRows
      },
    })

    expect(calls).toEqual([expect.objectContaining({
      projectId: 'project-1',
      candidatePackageId: 't2_division_rhythm_schedule_candidate_package',
      windowCodes: expect.arrayContaining([window?.windowCode]),
    })])
    expect(result.source).toBe('t2_task_actual_replay_read_model')
    expect(result.taskRowsRead).toBe(12)
    expect(result.adapter.samples).toHaveLength(12)
    expect(result.evidence.acceptance.status).toBe('shadow_candidate')
    expect(result.evidence.acceptance.readyForPublish).toBe(false)
    expect(result.governance).toEqual(expect.objectContaining({
      directSeedMutationAllowed: false,
      writesPlanDates: false,
      writesTaskDependencies: false,
      requiresL5Publication: true,
    }))
  })

  it('keeps rejected task rows visible and does not promote thin evidence', async () => {
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

    const result = await buildT2RhythmTaskActualReplayEvidence({
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      candidatePackage,
      projectId: 'project-1',
      reader: async () => [
        {
          id: 'task-missing-window',
          project_id: 'project-1',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-04',
          actual_start_date: '2026-05-01',
          actual_end_date: '2026-05-04',
          standard_task_metadata: {},
        },
      ],
    })

    expect(result.adapter.samples).toHaveLength(0)
    expect(result.adapter.rejectedRows).toEqual([
      expect.objectContaining({
        rowId: 'task-missing-window',
        reasonCode: 'missing_t2_window_code',
      }),
    ])
    expect(result.evidence.acceptance.status).toBe('data_collection_open')
    expect(result.evidence.acceptance.readyForShadow).toBe(false)
  })

  it('provides a default Supabase tasks reader with fixed fields and in-memory T2 window filtering', async () => {
    const calls: Array<{ method: string; args: unknown[] }> = []
    const rows = [
      {
        id: 'task-match',
        project_id: 'project-1',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-03',
        actual_start_date: '2026-05-01',
        actual_end_date: '2026-05-03',
        standard_task_metadata: {
          t2RhythmWindowCode: 'window-a',
        },
      },
      {
        id: 'task-other-window',
        project_id: 'project-1',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-03',
        actual_start_date: '2026-05-01',
        actual_end_date: '2026-05-03',
        standard_task_metadata: {
          t2RhythmWindowCode: 'window-b',
        },
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

    const reader = createT2RhythmTaskActualSupabaseReader(supabaseLike, { limit: 50 })
    const result = await reader({
      projectId: 'project-1',
      candidatePackageId: 't2_division_rhythm_schedule_candidate_package',
      selectedTemplateIds: ['template-a'],
      windowCodes: ['window-a'],
    })

    expect(result).toEqual([expect.objectContaining({ id: 'task-match' })])
    expect(calls).toEqual(expect.arrayContaining([
      { method: 'from', args: ['tasks'] },
      expect.objectContaining({ method: 'eq', args: ['project_id', 'project-1'] }),
      expect.objectContaining({ method: 'not', args: ['actual_start_date', 'is', null] }),
      expect.objectContaining({ method: 'not', args: ['actual_end_date', 'is', null] }),
      expect.objectContaining({ method: 'limit', args: [50] }),
    ]))
    const selectCall = calls.find((call) => call.method === 'select')
    expect(String(selectCall?.args[0])).toContain('title')
    expect(String(selectCall?.args[0])).toContain('standard_work_code')
    expect(String(selectCall?.args[0])).toContain('standard_work_name')
    expect(String(selectCall?.args[0])).toContain('specialty_type')
    expect(String(selectCall?.args[0])).toContain('standard_task_metadata')
    expect(String(selectCall?.args[0])).toContain('actual_start_date')
    expect(String(selectCall?.args[0])).toContain('planned_end_date')
  })

  it('can preserve non-matching task actual rows for live replay diagnostics', async () => {
    const rows = [
      {
        id: 'task-match',
        project_id: 'project-1',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-03',
        actual_start_date: '2026-05-01',
        actual_end_date: '2026-05-03',
        standard_task_metadata: {
          t2RhythmWindowCode: 'window-a',
        },
      },
      {
        id: 'task-other-window',
        project_id: 'project-1',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-03',
        actual_start_date: '2026-05-01',
        actual_end_date: '2026-05-03',
        standard_task_metadata: {
          t2RhythmWindowCode: 'window-b',
        },
      },
      {
        id: 'task-missing-window',
        project_id: 'project-1',
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-03',
        actual_start_date: '2026-05-01',
        actual_end_date: '2026-05-03',
        standard_task_metadata: {},
      },
    ]
    const query = {
      select: () => query,
      eq: () => query,
      not: () => query,
      limit: () => Promise.resolve({ data: rows, error: null }),
    }
    const supabaseLike = { from: () => query }

    const reader = createT2RhythmTaskActualSupabaseReader(supabaseLike, {
      preserveRowsForDiagnostics: true,
    })
    const result = await reader({
      projectId: 'project-1',
      candidatePackageId: 't2_division_rhythm_schedule_candidate_package',
      selectedTemplateIds: ['template-a'],
      windowCodes: ['window-a'],
    })

    expect(result.map((row) => row.id)).toEqual([
      'task-match',
      'task-other-window',
      'task-missing-window',
    ])
  })

  it('keeps unique T2 window aliases in the Supabase reader before adapter normalization', async () => {
    const rows = [
      {
        id: 'task-full-code',
        project_id: 'project-1',
        actual_start_date: '2026-05-01',
        actual_end_date: '2026-05-03',
        standard_task_metadata: {
          t2RhythmWindowCode: 'template-a:W01',
        },
      },
      {
        id: 'task-short-code',
        project_id: 'project-1',
        actual_start_date: '2026-05-01',
        actual_end_date: '2026-05-03',
        standard_task_metadata: {
          t2RhythmWindowCode: 'W02',
        },
      },
      {
        id: 'task-template-short-code',
        project_id: 'project-1',
        actual_start_date: '2026-05-01',
        actual_end_date: '2026-05-03',
        standard_task_metadata: {
          t2RhythmWindowCode: 'template-a:W03',
        },
      },
      {
        id: 'task-ambiguous-short-code',
        project_id: 'project-1',
        actual_start_date: '2026-05-01',
        actual_end_date: '2026-05-03',
        standard_task_metadata: {
          t2RhythmWindowCode: 'W04',
        },
      },
      {
        id: 'task-unknown-code',
        project_id: 'project-1',
        actual_start_date: '2026-05-01',
        actual_end_date: '2026-05-03',
        standard_task_metadata: {
          t2RhythmWindowCode: 'legacy-window',
        },
      },
    ]
    const query = {
      select: () => query,
      eq: () => query,
      not: () => query,
      limit: () => Promise.resolve({ data: rows, error: null }),
    }
    const supabaseLike = { from: () => query }

    const reader = createT2RhythmTaskActualSupabaseReader(supabaseLike)
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
      'task-full-code',
      'task-short-code',
      'task-template-short-code',
    ])
  })
})
