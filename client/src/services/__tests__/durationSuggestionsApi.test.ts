import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
}))

const {
  getDurationSuggestion,
  getTaskDurationForecast,
} = await import('../durationSuggestionsApi')

function completeAvailableBenchmarkResponse() {
  return {
    durationOutputCode: 'contextual_reference',
    durationOutputSemanticFieldName: 'contextualReferenceDays',
    contextualReferenceDays: 7,
    conservativeDurationDays: 9,
    confidenceLevel: 'medium',
    confidenceScore: 70,
    benchmarkGeneratedAt: '2026-07-01T08:00:00.000Z',
    benchmarkAsOf: '2026-06-30T23:59:59.000Z',
    benchmarkWindowStart: '2026-04-01T00:00:00.000Z',
    benchmarkVersion: 'v7',
    benchmarkSampleCount: 24,
    benchmarkDayBasis: 'construction_production_day',
    benchmarkScope: 'company',
    benchmarkProvenanceAvailability: 'available',
    benchmarkProvenanceReasonCodes: [],
    benchmarkProvenanceUnavailableReason: null,
    benchmarkProvenance: {
      mode: 'single',
      entries: [{
        source: 'persisted_benchmark',
        benchmarkId: 'benchmark-1',
        publicationKey: null,
        benchmarkVersion: 'v7',
        scope: 'company',
        generatedAt: '2026-07-01T08:00:00.000Z',
        sourceAsOf: '2026-06-30T23:59:59.000Z',
        sourceWindowStart: '2026-04-01T00:00:00.000Z',
        sampleCount: 24,
        dayBasis: 'construction_production_day',
        calendarRef: 'calendar-1',
        calendarVersion: 'calendar-v3',
        aggregateCalendarIdentities: [],
        causeSegment: null,
        blendWeight: null,
        availability: 'available',
        reasonCodes: [],
      }],
    },
  }
}

describe('durationSuggestionsApi governed duration outputs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads contextual reference days only from the public semantic camelCase field', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      durationOutputCode: 'contextual_reference',
      durationOutputSemanticFieldName: 'contextualReferenceDays',
      contextualReferenceDays: 7,
      conservativeDurationDays: 9,
      confidenceLevel: 'medium',
      confidenceScore: 70,
    })

    const suggestion = await getDurationSuggestion({ projectId: 'project-1' })

    expect(suggestion).toMatchObject({
      durationOutputCode: 'contextual_reference',
      durationOutputSemanticFieldName: 'contextualReferenceDays',
      contextualReferenceDays: 7,
      conservativeDurationDays: 9,
      confidenceLevel: 'medium',
      confidenceScore: 70,
    })
    expect(suggestion).not.toHaveProperty('recommendedDurationDays')
    expect(suggestion).not.toHaveProperty('recommended_duration_days')
    expect(suggestion).not.toHaveProperty('contextual_reference_days')
  })

  it('does not derive governed reference days from legacy aliases or naked recommended duration fields', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      duration_output_code: 'contextual_reference',
      duration_output_semantic_field_name: 'contextualReferenceDays',
      contextual_reference_days: 7,
      recommended_duration_days: 97,
      confidence_level: 'medium',
      confidence_score: 70,
    })

    const suggestion = await getDurationSuggestion({ projectId: 'project-1' })

    expect(suggestion).toMatchObject({
      durationOutputCode: null,
      durationOutputSemanticFieldName: null,
      contextualReferenceDays: null,
      confidenceLevel: null,
      confidenceScore: null,
    })
    expect(suggestion).not.toHaveProperty('recommendedDurationDays')
  })

  it('preserves candidate duration risk range fields for schedule evidence displays', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      durationOutputCode: 'contextual_reference',
      durationOutputSemanticFieldName: 'contextualReferenceDays',
      contextualReferenceDays: 18,
      conservativeDurationDays: 24,
      risk_p20_duration_days: 15,
      risk_p50_duration_days: 18,
      risk_p80_duration_days: 24,
      duration_risk_range: {
        p20_days: 15,
        p50_days: 18,
        p80_days: 24,
        mutation_boundary: 'candidate_only_no_runtime_write',
      },
      confidenceLevel: 'medium',
      confidenceScore: 64,
    })

    const suggestion = await getDurationSuggestion({ projectId: 'project-1' })

    expect(suggestion).toMatchObject({
      riskP20DurationDays: 15,
      riskP50DurationDays: 18,
      riskP80DurationDays: 24,
      durationRiskRange: expect.objectContaining({
        p20_days: 15,
        p50_days: 18,
        p80_days: 24,
        mutation_boundary: 'candidate_only_no_runtime_write',
      }),
    })
  })

  it('normalizes complete camelCase benchmark provenance without reviving retired aliases', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      durationOutputCode: 'contextual_reference',
      durationOutputSemanticFieldName: 'contextualReferenceDays',
      contextualReferenceDays: 7,
      conservativeDurationDays: 9,
      confidenceLevel: 'medium',
      confidenceScore: 70,
      benchmarkGeneratedAt: '2026-07-01T08:00:00.000Z',
      benchmarkAsOf: '2026-06-30T23:59:59.000Z',
      benchmarkWindowStart: '2026-04-01T00:00:00.000Z',
      benchmarkVersion: 'v7',
      benchmarkSampleCount: 24,
      benchmarkDayBasis: 'construction_production_day',
      benchmarkScope: 'company',
      benchmarkProvenanceAvailability: 'available',
      benchmarkProvenanceReasonCodes: [],
      benchmarkProvenanceUnavailableReason: null,
      benchmarkProvenance: {
        mode: 'single',
        entries: [{
          source: 'persisted_benchmark',
          benchmarkId: 'benchmark-1',
          publicationKey: null,
          benchmarkVersion: 'v7',
          scope: 'company',
          generatedAt: '2026-07-01T08:00:00.000Z',
          sourceAsOf: '2026-06-30T23:59:59.000Z',
          sourceWindowStart: '2026-04-01T00:00:00.000Z',
          sampleCount: 24,
          dayBasis: 'construction_production_day',
          calendarRef: 'calendar-1',
          calendarVersion: 'calendar-v3',
          aggregateCalendarIdentities: [],
          causeSegment: null,
          blendWeight: null,
          availability: 'available',
          reasonCodes: [],
        }],
      },
      generatedAt: '2035-01-02T03:04:05.000Z',
      benchmark_generated_at: '2035-01-02T03:04:05.000Z',
      referenceFrozenAt: '2035-01-02T03:04:05.000Z',
      isReferenceFrozen: true,
    })

    const suggestion = await getDurationSuggestion({ projectId: 'project-1' })

    expect(suggestion).toMatchObject({
      benchmarkGeneratedAt: '2026-07-01T08:00:00.000Z',
      benchmarkAsOf: '2026-06-30T23:59:59.000Z',
      benchmarkWindowStart: '2026-04-01T00:00:00.000Z',
      benchmarkVersion: 'v7',
      benchmarkSampleCount: 24,
      benchmarkDayBasis: 'construction_production_day',
      benchmarkScope: 'company',
      benchmarkProvenanceAvailability: 'available',
      benchmarkProvenanceReasonCodes: [],
      benchmarkProvenance: {
        mode: 'single',
        entries: [expect.objectContaining({
          source: 'persisted_benchmark',
          benchmarkVersion: 'v7',
          scope: 'company',
          aggregateCalendarIdentities: [],
          availability: 'available',
          reasonCodes: [],
        })],
      },
    })
    expect(suggestion).not.toHaveProperty('generatedAt')
    expect(suggestion).not.toHaveProperty('benchmark_generated_at')
    expect(suggestion).not.toHaveProperty('referenceFrozenAt')
    expect(suggestion).not.toHaveProperty('isReferenceFrozen')
  })

  it('fails closed instead of passing malformed benchmark provenance JSON through', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      durationOutputCode: 'contextual_reference',
      contextualReferenceDays: 7,
      conservativeDurationDays: 9,
      confidenceLevel: 'medium',
      confidenceScore: 70,
      benchmarkScope: 'system',
      benchmarkDayBasis: 'calendar_day',
      benchmarkProvenanceAvailability: 'sometimes',
      benchmarkProvenanceReasonCodes: ['benchmark_version_missing', 'unknown_reason'],
      benchmarkProvenanceUnavailableReason: 'unknown_reason',
      benchmarkProvenance: {
        mode: 'combined',
        entries: [{ scope: 'system', aggregateCalendarIdentities: {} }],
      },
    })

    const suggestion = await getDurationSuggestion({ projectId: 'project-1' })

    expect(suggestion).toMatchObject({
      benchmarkDayBasis: null,
      benchmarkScope: null,
      benchmarkProvenanceAvailability: null,
      benchmarkProvenanceReasonCodes: [],
      benchmarkProvenanceUnavailableReason: null,
      benchmarkProvenance: null,
    })
  })

  it.each([
    {
      name: 'an empty available set',
      mutate: (payload: any) => { payload.benchmarkProvenance.entries = [] },
    },
    {
      name: 'a missing persisted source identity',
      mutate: (payload: any) => { payload.benchmarkProvenance.entries[0].benchmarkId = null },
    },
    {
      name: 'a missing benchmark version',
      mutate: (payload: any) => { payload.benchmarkProvenance.entries[0].benchmarkVersion = null },
    },
    {
      name: 'a missing generated timestamp',
      mutate: (payload: any) => { payload.benchmarkProvenance.entries[0].generatedAt = null },
    },
    {
      name: 'a missing source-as-of timestamp',
      mutate: (payload: any) => { payload.benchmarkProvenance.entries[0].sourceAsOf = null },
    },
    {
      name: 'a missing source-window timestamp',
      mutate: (payload: any) => { payload.benchmarkProvenance.entries[0].sourceWindowStart = null },
    },
    {
      name: 'an invalid sample count',
      mutate: (payload: any) => { payload.benchmarkProvenance.entries[0].sampleCount = null },
    },
    {
      name: 'a missing production-day basis',
      mutate: (payload: any) => { payload.benchmarkProvenance.entries[0].dayBasis = null },
    },
    {
      name: 'a missing scope',
      mutate: (payload: any) => { payload.benchmarkProvenance.entries[0].scope = null },
    },
    {
      name: 'a missing calendar identity',
      mutate: (payload: any) => {
        payload.benchmarkProvenance.entries[0].calendarRef = null
        payload.benchmarkProvenance.entries[0].calendarVersion = null
      },
    },
    {
      name: 'a missing runtime publication key',
      mutate: (payload: any) => {
        payload.benchmarkProvenance.entries[0].source = 'runtime_publication'
        payload.benchmarkProvenance.entries[0].benchmarkId = null
      },
    },
    {
      name: 'a missing cause identity',
      mutate: (payload: any) => { payload.benchmarkProvenance.entries[0].source = 'cause_segment' },
    },
    {
      name: 'entry reason codes that contradict availability',
      mutate: (payload: any) => {
        payload.benchmarkProvenance.entries[0].reasonCodes = ['benchmark_version_missing']
      },
    },
    {
      name: 'set reason codes that contradict availability',
      mutate: (payload: any) => {
        payload.benchmarkProvenanceReasonCodes = ['benchmark_version_missing']
        payload.benchmarkProvenanceUnavailableReason = 'benchmark_version_missing'
      },
    },
    {
      name: 'a scalar sample count inconsistent with its set',
      mutate: (payload: any) => { payload.benchmarkSampleCount = 25 },
    },
  ])('fails closed for available benchmark provenance with $name', async ({ mutate }) => {
    const payload: any = completeAvailableBenchmarkResponse()
    mutate(payload)
    mocks.apiGet.mockResolvedValueOnce(payload)

    const suggestion = await getDurationSuggestion({ projectId: 'project-1' })

    expect(suggestion).toMatchObject({
      benchmarkGeneratedAt: null,
      benchmarkAsOf: null,
      benchmarkWindowStart: null,
      benchmarkVersion: null,
      benchmarkSampleCount: null,
      benchmarkDayBasis: null,
      benchmarkScope: null,
      benchmarkProvenanceAvailability: null,
      benchmarkProvenanceReasonCodes: [],
      benchmarkProvenanceUnavailableReason: null,
      benchmarkProvenance: null,
    })
  })

  it('accepts a runtime aggregate whose publication key is the public source identity', async () => {
    const payload: any = completeAvailableBenchmarkResponse()
    Object.assign(payload, {
      benchmarkVersion: 'aggregate:industry:0123456789abcdef',
      benchmarkScope: 'industry',
      benchmarkSampleCount: 100,
    })
    Object.assign(payload.benchmarkProvenance.entries[0], {
      source: 'runtime_publication',
      benchmarkId: null,
      publicationKey: 'runtime-industry-1',
      benchmarkVersion: 'aggregate:industry:0123456789abcdef',
      scope: 'industry',
      sampleCount: 100,
      calendarRef: null,
      calendarVersion: null,
      aggregateCalendarIdentities: [{ calendarRef: 'calendar-1', calendarVersion: 'calendar-v3' }],
    })
    mocks.apiGet.mockResolvedValueOnce(payload)

    const suggestion = await getDurationSuggestion({ projectId: 'project-1' })

    expect(suggestion).toMatchObject({
      benchmarkProvenanceAvailability: 'available',
      benchmarkScope: 'industry',
      benchmarkProvenance: {
        entries: [expect.objectContaining({
          source: 'runtime_publication',
          benchmarkId: null,
          publicationKey: 'runtime-industry-1',
        })],
      },
    })
  })

  it.each(['company', 'industry', 'global'] as const)(
    'fails closed when malformed runtime %s aggregate JSON includes a benchmark id',
    async (scope) => {
      const payload: any = completeAvailableBenchmarkResponse()
      Object.assign(payload, {
        benchmarkVersion: `aggregate:${scope}:0123456789abcdef`,
        benchmarkScope: scope,
        benchmarkSampleCount: 100,
      })
      Object.assign(payload.benchmarkProvenance.entries[0], {
        source: 'runtime_publication',
        benchmarkId: 'forbidden-aggregate-id',
        publicationKey: `runtime-${scope}-1`,
        benchmarkVersion: `aggregate:${scope}:0123456789abcdef`,
        scope,
        sampleCount: 100,
        calendarRef: null,
        calendarVersion: null,
        aggregateCalendarIdentities: [{ calendarRef: 'calendar-1', calendarVersion: 'calendar-v3' }],
      })
      mocks.apiGet.mockResolvedValueOnce(payload)

      const suggestion = await getDurationSuggestion({ projectId: 'project-1' })

      expect(suggestion).toMatchObject({
        benchmarkGeneratedAt: null,
        benchmarkAsOf: null,
        benchmarkWindowStart: null,
        benchmarkVersion: null,
        benchmarkSampleCount: null,
        benchmarkDayBasis: null,
        benchmarkScope: null,
        benchmarkProvenanceAvailability: null,
        benchmarkProvenanceReasonCodes: [],
        benchmarkProvenanceUnavailableReason: null,
        benchmarkProvenance: null,
      })
    },
  )

  it('does not expose or derive user-facing reference days from template fast estimates', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      durationOutputCode: 'template_fast_estimate',
      durationOutputSemanticFieldName: 'templateFastEstimateDays',
      conservativeDurationDays: 99,
      confidenceLevel: 'low',
      confidenceScore: 42,
    })

    const suggestion = await getDurationSuggestion({ projectId: 'project-1' })

    expect(suggestion).toMatchObject({
      durationOutputCode: 'template_fast_estimate',
      durationOutputSemanticFieldName: 'templateFastEstimateDays',
    })
    expect(suggestion.contextualReferenceDays).toBeNull()
    expect(suggestion.planReferenceDays).toBeNull()
    expect(suggestion.remainingForecastDays).toBeNull()
    expect(suggestion).not.toHaveProperty('recommendedDurationDays')
    expect(suggestion).not.toHaveProperty('templateFastEstimateDays')
  })

  it('reads remaining forecast days only from the public semantic camelCase field', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      taskId: 'task-1',
      durationOutputCode: 'remaining_forecast',
      durationOutputSemanticFieldName: 'remainingForecastDays',
      remainingForecastDays: 6,
      remainingDurationDays: 99,
      forecastFinishDate: '2026-06-20',
      forecastDelayDays: 2,
      confidenceLevel: 'medium',
      confidenceScore: 66,
    })

    const forecast = await getTaskDurationForecast('task-1')

    expect(forecast).toMatchObject({
      taskId: 'task-1',
      durationOutputCode: 'remaining_forecast',
      durationOutputSemanticFieldName: 'remainingForecastDays',
      remainingForecastDays: 6,
      forecastFinishDate: '2026-06-20',
    })
    expect(forecast).not.toHaveProperty('recommendedDurationDays')
    expect(forecast).not.toHaveProperty('remainingDurationDays')
  })

  it('does not derive remaining forecast days from legacy remaining aliases', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      task_id: 'task-1',
      duration_output_code: 'remaining_forecast',
      duration_output_semantic_field_name: 'remainingForecastDays',
      remaining_duration_days: 99,
      optimistic_remaining_days: 88,
      conservative_remaining_days: 111,
      forecast_finish_date: '2026-06-20',
      forecast_delay_days: 2,
      confidence_level: 'medium',
      confidence_score: 66,
    })

    const forecast = await getTaskDurationForecast('task-1')

    expect(forecast).toMatchObject({
      taskId: null,
      durationOutputCode: null,
      durationOutputSemanticFieldName: null,
      remainingForecastDays: null,
      forecastFinishDate: null,
    })
    expect(forecast).not.toHaveProperty('recommendedDurationDays')
    expect(forecast).not.toHaveProperty('remainingDurationDays')
    expect(forecast).not.toHaveProperty('optimisticRemainingDays')
    expect(forecast).not.toHaveProperty('conservativeRemainingDays')
  })

  it('does not expose naked recommended duration from remaining forecast responses', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      task_id: 'task-1',
      duration_output_code: 'remaining_forecast',
      duration_output_semantic_field_name: 'remainingForecastDays',
      recommended_duration_days: 97,
      forecast_finish_date: '2026-06-20',
      forecast_delay_days: 2,
      confidence_level: 'medium',
      confidence_score: 66,
    })

    const forecast = await getTaskDurationForecast('task-1')

    expect(forecast).toMatchObject({
      taskId: null,
      durationOutputCode: null,
      durationOutputSemanticFieldName: null,
      remainingForecastDays: null,
      forecastFinishDate: null,
    })
    expect(forecast).not.toHaveProperty('recommendedDurationDays')
  })
})
