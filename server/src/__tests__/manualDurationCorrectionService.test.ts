import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQLOne: vi.fn(),
  executeSQL: vi.fn(),
  from: vi.fn(),
  overrideQuery: {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  getTaskDurationSuggestion: vi.fn(async (): Promise<Record<string, unknown>> => ({
    recommendedDurationDays: 11,
    conservativeDurationDays: 14,
    durationOutputCode: 'contextual_reference',
    durationOutputSemanticFieldName: 'contextualReferenceDays',
    contextualReferenceDays: 11,
    confidenceLevel: 'medium',
    confidenceScore: 62,
    forecastSource: 'benchmark+v1474_context',
    businessReason: 'Based on unified duration governance.',
    benchmarkKey: 'task-1:process:all',
    sampleSize: 6,
    factorSummary: { adjustedBy: ['seasonal_capacity'] },
    calculationContext: { duration_source: 'benchmark' },
  })),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQLOne: mocks.executeSQLOne,
  executeSQL: mocks.executeSQL,
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../services/durationSuggestionService.js', () => ({
  getTaskDurationSuggestion: mocks.getTaskDurationSuggestion,
}))

const { ManualDurationCorrectionService } = await import('../services/manualDurationCorrectionService.js')

describe('ManualDurationCorrectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.overrideQuery.select.mockReturnValue(mocks.overrideQuery)
    mocks.overrideQuery.eq.mockReturnValue(mocks.overrideQuery)
    mocks.overrideQuery.update.mockReturnValue(mocks.overrideQuery)
    mocks.overrideQuery.maybeSingle.mockResolvedValue({ data: null, error: null })
    mocks.overrideQuery.insert.mockResolvedValue({ error: null })
    mocks.from.mockReturnValue(mocks.overrideQuery)
  })

  it('keeps large manual duration corrections as review candidates', async () => {
    mocks.executeSQLOne
      .mockResolvedValueOnce({
        id: 'task-1',
        project_id: 'project-1',
        template_node_id: '11111111-1111-4111-8111-111111111111',
        wbs_node_type: 'process',
        engineering_category_id: null,
        standard_work_code: 'BDT-04-01-01-P07',
        standard_work_name: 'Concrete pour',
        title: 'Concrete pour',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-11',
        progress: 0,
      })
      .mockResolvedValueOnce({
        id: 'project-1',
      })
      .mockResolvedValueOnce({
        id: 'task-1',
        project_id: 'project-1',
        template_node_id: '11111111-1111-4111-8111-111111111111',
        wbs_node_type: 'process',
      })

    const service = new ManualDurationCorrectionService()
    const estimate = await service.correctDuration({
      task_id: 'task-1',
      corrected_duration: 15,
      correction_reason: 'Actual site rhythm is slower than the current suggestion.',
      approved_by: '22222222-2222-4222-8222-222222222222',
    })

    expect(estimate.correctedDurationDays).toBe(15)
    expect(estimate.baselineDurationDays).toBe(11)
    expect(estimate).not.toHaveProperty('estimated_duration')
    expect(estimate).not.toHaveProperty('adjusted_duration')
    expect(estimate).not.toHaveProperty('base_duration')
    expect(estimate.factors).toMatchObject({
      durationOutputCode: 'contextual_reference',
      durationOutputSemanticFieldName: 'contextualReferenceDays',
      contextualReferenceDays: 11,
    })
    expect(estimate.factors).not.toHaveProperty('duration_output_code')
    expect(estimate.factors).not.toHaveProperty('duration_output_semantic_field_name')
    expect(estimate.factors).not.toHaveProperty('contextual_reference_days')
    expect(estimate.model_version).toBe('v1.4.18-v1.4.7.4:manual_correction')
    expect(mocks.executeSQL).not.toHaveBeenCalled()
    expect(mocks.from).toHaveBeenCalledWith('duration_suggestion_overrides')
    expect(mocks.overrideQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      override_key: 'manual-duration-correction:11111111-1111-4111-8111-111111111111:process',
      project_id: 'project-1',
      recommended_duration_days: 15,
      reason: 'Actual site rhythm is slower than the current suggestion.',
      override_status: 'candidate',
      created_by: '22222222-2222-4222-8222-222222222222',
    }))
  })

  it('uses the unified duration suggestion baseline when correcting duration without legacy estimate history', async () => {
    mocks.executeSQLOne
      .mockResolvedValueOnce({
        id: 'task-1',
        project_id: 'project-1',
        template_node_id: '11111111-1111-4111-8111-111111111111',
        wbs_node_type: 'process',
        engineering_category_id: null,
        standard_work_code: 'BDT-04-01-01-P07',
        standard_work_name: 'Concrete pour',
        title: 'Concrete pour',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-11',
        progress: 0,
      })
      .mockResolvedValueOnce({
        id: 'project-1',
      })
      .mockResolvedValueOnce({
        id: 'task-1',
        project_id: 'project-1',
        template_node_id: '11111111-1111-4111-8111-111111111111',
        wbs_node_type: 'process',
      })
    mocks.executeSQL.mockResolvedValue([])

    const service = new ManualDurationCorrectionService()
    const estimate = await service.correctDuration({
      task_id: 'task-1',
      corrected_duration: 18,
      correction_reason: 'The site team accepted a longer rhythm.',
      approved_by: '22222222-2222-4222-8222-222222222222',
    })

    expect(estimate).toMatchObject({
      task_id: 'task-1',
      project_id: 'project-1',
      baselineDurationDays: 11,
      correctedDurationDays: 18,
      reasoning: 'The site team accepted a longer rhythm.',
      model_version: 'v1.4.18-v1.4.7.4:manual_correction',
    })
    expect(estimate).not.toHaveProperty('estimated_duration')
    expect(estimate).not.toHaveProperty('adjusted_duration')
    expect(estimate).not.toHaveProperty('base_duration')
    expect(mocks.getTaskDurationSuggestion).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1',
      projectId: 'project-1',
      standardWorkCode: 'BDT-04-01-01-P07',
    }))
    expect(mocks.from).toHaveBeenCalledWith('duration_suggestion_overrides')
    expect(mocks.overrideQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      override_key: 'manual-duration-correction:11111111-1111-4111-8111-111111111111:process',
      project_id: 'project-1',
      recommended_duration_days: 18,
      reason: 'The site team accepted a longer rhythm.',
      override_status: 'candidate',
    }))
    expect(mocks.executeSQL).not.toHaveBeenCalled()
  })

  it('does not synthesize a one-day baseline when unified duration suggestion is unavailable', async () => {
    mocks.executeSQLOne
      .mockResolvedValueOnce({
        id: 'task-1',
        project_id: 'project-1',
        template_node_id: '11111111-1111-4111-8111-111111111111',
        wbs_node_type: 'process',
        engineering_category_id: null,
        standard_work_code: 'UNKNOWN',
        standard_work_name: 'Unknown task',
        title: 'Unknown task',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-11',
        progress: 0,
      })
      .mockResolvedValueOnce({
        id: 'project-1',
      })
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      recommendedDurationDays: null,
      conservativeDurationDays: null,
      contextualReferenceDays: null,
      confidenceLevel: 'data_pending',
      confidenceScore: 0,
      forecastSource: 'standard_work_duration_seed:data_pending',
      businessReason: 'No governed duration seed is available.',
      businessReasonCode: 'CATEGORY_HAS_NO_SEED',
      input: {},
    })

    const service = new ManualDurationCorrectionService()

    await expect(service.correctDuration({
      task_id: 'task-1',
      corrected_duration: 2,
      correction_reason: 'Manual correction should not be based on a synthetic one-day baseline.',
      approved_by: '22222222-2222-4222-8222-222222222222',
    })).rejects.toThrow(/duration suggestion/i)

    expect(mocks.from).not.toHaveBeenCalledWith('duration_suggestion_overrides')
    expect(mocks.overrideQuery.insert).not.toHaveBeenCalled()
  })

  it('does not use naked recommended duration as a manual correction baseline', async () => {
    mocks.executeSQLOne
      .mockResolvedValueOnce({
        id: 'task-1',
        project_id: 'project-1',
        template_node_id: '11111111-1111-4111-8111-111111111111',
        wbs_node_type: 'process',
        engineering_category_id: null,
        standard_work_code: 'BDT-04-01-01-P07',
        standard_work_name: 'Concrete pour',
        title: 'Concrete pour',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-11',
        progress: 0,
      })
      .mockResolvedValueOnce({
        id: 'project-1',
      })
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      recommendedDurationDays: 11,
      conservativeDurationDays: 14,
      durationOutputCode: 'contextual_reference',
      durationOutputSemanticFieldName: 'contextualReferenceDays',
      contextualReferenceDays: null,
      confidenceLevel: 'medium',
      confidenceScore: 62,
      forecastSource: 'benchmark+v1474_context',
      businessReason: 'Governed semantic field is missing.',
      input: {},
    })

    const service = new ManualDurationCorrectionService()

    await expect(service.correctDuration({
      task_id: 'task-1',
      corrected_duration: 15,
      correction_reason: 'Manual correction should not use naked recommended duration.',
      approved_by: '22222222-2222-4222-8222-222222222222',
    })).rejects.toThrow(/duration suggestion/i)

    expect(mocks.from).not.toHaveBeenCalledWith('duration_suggestion_overrides')
    expect(mocks.overrideQuery.insert).not.toHaveBeenCalled()
  })
})
