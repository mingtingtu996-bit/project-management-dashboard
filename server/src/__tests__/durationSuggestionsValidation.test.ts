import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  correctDuration: vi.fn(async (input: Record<string, unknown>) => ({
    task_id: input.task_id,
    correctedDurationDays: input.corrected_duration,
    baselineDurationDays: 7,
  })),
  getTaskDurationSuggestion: vi.fn(async (input: Record<string, unknown>) => ({
    recommendedDurationDays: 7,
    conservativeDurationDays: 10,
    durationOutputCode: 'contextual_reference',
    durationOutputSemanticFieldName: 'contextualReferenceDays',
    templateFastEstimateDays: null,
    contextualReferenceDays: 7,
    confidenceLevel: 'medium',
    confidenceScore: 70,
    forecastSource: 'standard_seed',
    businessReason: 'standard reference',
    input,
  })),
  forecastTaskDuration: vi.fn(async (taskId: string) => ({
    taskId,
    recommendedDurationDays: 9,
    remainingDurationDays: 8,
    durationOutputCode: 'remaining_forecast',
    durationOutputSemanticFieldName: 'remainingForecastDays',
    remainingForecastDays: 8,
    remainingDuration: {
      value: 8,
      unit: 'construction_production_day',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v1',
      timezone: 'Asia/Shanghai',
      asOf: '2026-07-01',
      availability: 'available',
      unavailableReason: null,
    },
    confidenceLevel: 'medium',
    confidenceScore: 72,
    factorSummary: { source: 'runtime' },
  })),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectMember: vi.fn((_getProjectId: unknown) => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectEditor: vi.fn((_getProjectId: unknown) => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../auth/access.js', () => ({
  getProjectPermissionLevel: vi.fn(async () => 'owner'),
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => null),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQLOne: vi.fn(async () => ({ project_id: 'project-1' })),
}))

vi.mock('../services/manualDurationCorrectionService.js', () => ({
  ManualDurationCorrectionService: vi.fn().mockImplementation(() => ({
    correctDuration: mocks.correctDuration,
  })),
}))

vi.mock('../services/durationSuggestionService.js', () => ({
  getTaskDurationSuggestion: mocks.getTaskDurationSuggestion,
}))

vi.mock('../services/taskDurationForecastService.js', () => ({
  forecastTaskDuration: mocks.forecastTaskDuration,
}))

const { default: durationSuggestionsRouter } = await import('../routes/duration-suggestions.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/duration-suggestions', durationSuggestionsRouter)
  return app
}

describe('duration suggestions route validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects correction requests with non-positive duration', async () => {
    const response = await request(buildApp())
      .post('/api/duration-suggestions/correct-duration')
      .send({
        task_id: 'task-1',
        corrected_duration: 0,
      })

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error?.code).toBe('VALIDATION_ERROR')
    expect(mocks.correctDuration).not.toHaveBeenCalled()
  })

  it('returns governed manual correction fields without legacy estimate aliases', async () => {
    const response = await request(buildApp())
      .post('/api/duration-suggestions/correct-duration')
      .send({
        task_id: 'task-1',
        corrected_duration: 9,
        correction_reason: 'Accepted site correction.',
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      task_id: 'task-1',
      correctedDurationDays: 9,
      baselineDurationDays: 7,
    })
    expect(response.body.data).not.toHaveProperty('estimated_duration')
    expect(response.body.data).not.toHaveProperty('adjusted_duration')
    expect(response.body.data).not.toHaveProperty('base_duration')
  })

  it.each([
    '/api/duration-suggestions/task',
  ])('does not pass externally supplied parent-child duration truth fields to duration suggestions from %s', async (path) => {
    const response = await request(buildApp())
      .post(path)
      .send({
        task_id: 'task-1',
        project_id: 'project-1',
        standard_work_code: 'BDT-04-01-01-P07',
        parent_duration_boundary_policy: 'rhythm_package_window',
        parent_duration_policy_source: 'template_duration_truth_asset',
        parent_reference_duration_days: 6,
        package_child_rhythm_window_start_day: 1,
        package_child_rhythm_window_end_day: 2,
        package_child_rhythm_window_duration_days: 2,
        package_child_rhythm_window_role: 'concrete_pour',
      })

    expect(response.status).toBe(200)
    expect(mocks.getTaskDurationSuggestion).toHaveBeenCalledTimes(1)
    expect(mocks.getTaskDurationSuggestion.mock.calls[0][0]).toEqual(expect.objectContaining({
      standardWorkCode: 'BDT-04-01-01-P07',
      parentDurationBoundaryPolicy: null,
      parentDurationPolicySource: null,
      parentReferenceDurationDays: null,
      packageChildRhythmWindowStartDay: null,
      packageChildRhythmWindowEndDay: null,
      packageChildRhythmWindowDurationDays: null,
      packageChildRhythmWindowRole: null,
    }))
  })

  it('returns governed contextual reference fields from task duration suggestion endpoints', async () => {
    const response = await request(buildApp())
      .post('/api/duration-suggestions/task')
      .send({
        task_id: 'task-1',
        project_id: 'project-1',
        standard_work_code: 'BDT-04-01-01-P07',
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      durationOutputCode: 'contextual_reference',
      durationOutputSemanticFieldName: 'contextualReferenceDays',
      contextualReferenceDays: 7,
    })
    expect(response.body.data).not.toHaveProperty('duration_output_code')
    expect(response.body.data).not.toHaveProperty('duration_output_semantic_field_name')
    expect(response.body.data).not.toHaveProperty('contextual_reference_days')
    expect(response.body.data).not.toHaveProperty('recommendedDurationDays')
    expect(response.body.data).not.toHaveProperty('recommended_duration_days')
    expect(response.body.data).not.toHaveProperty('suggested_days')
    expect(response.body.data).not.toHaveProperty('estimated_duration')
    expect(response.body.data).not.toHaveProperty('conservative_duration')
    expect(response.body.data).not.toHaveProperty('remaining_duration_days')
    expect(response.body.data).not.toHaveProperty('optimistic_remaining_days')
    expect(response.body.data).not.toHaveProperty('conservative_remaining_days')
  })

  it('does not expose user-facing reference days when an upstream result is template_fast_estimate', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      recommendedDurationDays: 99,
      conservativeDurationDays: 120,
      durationOutputCode: 'template_fast_estimate',
      durationOutputSemanticFieldName: 'templateFastEstimateDays',
      templateFastEstimateDays: 99,
      contextualReferenceDays: null,
      confidenceLevel: 'low',
      confidenceScore: 40,
      forecastSource: 'standard_seed:sync_fast_template',
      businessReason: 'diagnostic fast estimate',
      input: {},
    })

    const response = await request(buildApp())
      .post('/api/duration-suggestions/task')
      .send({
        task_id: 'task-1',
        project_id: 'project-1',
        standard_work_code: 'BDT-04-01-01-P07',
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      durationOutputCode: 'template_fast_estimate',
      durationOutputSemanticFieldName: 'templateFastEstimateDays',
      conservativeDurationDays: null,
    })
    expect(response.body.data).not.toHaveProperty('duration_output_code')
    expect(response.body.data).not.toHaveProperty('duration_output_semantic_field_name')
    expect(response.body.data).not.toHaveProperty('recommendedDurationDays')
    expect(response.body.data).not.toHaveProperty('recommended_duration_days')
    expect(response.body.data).not.toHaveProperty('templateFastEstimateDays')
    expect(response.body.data).not.toHaveProperty('template_fast_estimate_days')
  })

  it('does not expose naked recommended duration when governed reference days are missing', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      recommendedDurationDays: 97,
      conservativeDurationDays: 120,
      durationOutputCode: 'contextual_reference',
      durationOutputSemanticFieldName: 'contextualReferenceDays',
      contextualReferenceDays: null,
      confidenceLevel: 'medium',
      confidenceScore: 70,
      forecastSource: 'standard_seed',
      businessReason: 'semantic field missing',
      input: {},
    } as any)

    const response = await request(buildApp())
      .post('/api/duration-suggestions/task')
      .send({
        task_id: 'task-1',
        project_id: 'project-1',
        standard_work_code: 'BDT-04-01-01-P07',
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      durationOutputCode: 'contextual_reference',
      durationOutputSemanticFieldName: 'contextualReferenceDays',
      contextualReferenceDays: null,
    })
    expect(response.body.data).not.toHaveProperty('duration_output_code')
    expect(response.body.data).not.toHaveProperty('duration_output_semantic_field_name')
    expect(response.body.data).not.toHaveProperty('contextual_reference_days')
    expect(response.body.data).not.toHaveProperty('recommendedDurationDays')
    expect(response.body.data).not.toHaveProperty('recommended_duration_days')
  })

  it('drops legacy duration source metadata aliases from public DTOs', async () => {
    mocks.getTaskDurationSuggestion.mockResolvedValueOnce({
      durationOutputCode: 'contextual_reference',
      durationOutputSemanticFieldName: 'contextualReferenceDays',
      contextualReferenceDays: 11,
      conservativeDurationDays: 13,
      confidenceLevel: 'medium',
      confidenceScore: 74,
      forecastSource: 'standard_seed',
      durationCalibrationSource: 'standard_work_duration_seed',
      durationProvenance: 'standard_work_duration_seed',
      sourceBreakdown: {
        source: 'legacy_source_alias',
        benchmark_key: 'legacy-benchmark',
        confidence_level: 'low',
        duration_calibration_source: 'legacy_calibration',
        duration_provenance: 'legacy_provenance',
        factor_summary: { legacy: true },
      },
      input: {},
    } as any)

    const response = await request(buildApp())
      .post('/api/duration-suggestions/task')
      .send({
        task_id: 'task-1',
        project_id: 'project-1',
        standard_work_code: 'BDT-04-01-01-P07',
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.sourceBreakdown).toEqual({
      forecastSource: 'standard_seed',
      benchmarkKey: null,
      confidenceLevel: 'medium',
      durationCalibrationSource: 'standard_work_duration_seed',
      durationProvenance: 'standard_work_duration_seed',
      factorSummary: null,
    })
    expect(response.body.data.sourceBreakdown).not.toHaveProperty('source')
    expect(response.body.data.sourceBreakdown).not.toHaveProperty('benchmark_key')
    expect(response.body.data.sourceBreakdown).not.toHaveProperty('confidence_level')
    expect(response.body.data.sourceBreakdown).not.toHaveProperty('duration_calibration_source')
    expect(response.body.data.sourceBreakdown).not.toHaveProperty('duration_provenance')
    expect(response.body.data.sourceBreakdown).not.toHaveProperty('factor_summary')
  })

  it('returns governed remaining forecast fields from task forecast endpoint', async () => {
    const response = await request(buildApp())
      .get('/api/duration-suggestions/tasks/task-1/duration-forecast')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      taskId: 'task-1',
      confidenceLevel: 'medium',
      confidenceScore: 72,
      durationOutputCode: 'remaining_forecast',
      durationOutputSemanticFieldName: 'remainingForecastDays',
      remainingForecastDays: 8,
    })
    expect(response.body.data).not.toHaveProperty('duration_output_code')
    expect(response.body.data).not.toHaveProperty('duration_output_semantic_field_name')
    expect(response.body.data).not.toHaveProperty('remaining_forecast_days')
    expect(response.body.data).not.toHaveProperty('recommendedDurationDays')
    expect(response.body.data).not.toHaveProperty('recommended_duration_days')
    expect(response.body.data).not.toHaveProperty('remainingDurationDays')
    expect(response.body.data).not.toHaveProperty('remaining_duration_days')
    expect(response.body.data).not.toHaveProperty('optimisticRemainingDays')
    expect(response.body.data).not.toHaveProperty('optimistic_remaining_days')
    expect(response.body.data).not.toHaveProperty('conservativeRemainingDays')
    expect(response.body.data).not.toHaveProperty('conservative_remaining_days')
  })

  it('does not expose naked recommended duration from remaining forecast responses', async () => {
    mocks.forecastTaskDuration.mockResolvedValueOnce({
      taskId: 'task-1',
      recommendedDurationDays: 97,
      durationOutputCode: 'remaining_forecast',
      durationOutputSemanticFieldName: 'remainingForecastDays',
      remainingForecastDays: null,
      confidenceLevel: 'medium',
      confidenceScore: 72,
      businessReason: 'semantic field missing',
    } as any)

    const response = await request(buildApp())
      .get('/api/duration-suggestions/tasks/task-1/duration-forecast')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      taskId: 'task-1',
      durationOutputCode: 'remaining_forecast',
      durationOutputSemanticFieldName: 'remainingForecastDays',
      remainingForecastDays: null,
    })
    expect(response.body.data).not.toHaveProperty('duration_output_code')
    expect(response.body.data).not.toHaveProperty('duration_output_semantic_field_name')
    expect(response.body.data).not.toHaveProperty('remaining_forecast_days')
    expect(response.body.data).not.toHaveProperty('recommendedDurationDays')
    expect(response.body.data).not.toHaveProperty('recommended_duration_days')
  })
})
