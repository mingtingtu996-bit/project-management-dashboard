import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(),
}))

const learningAssetMocks = vi.hoisted(() => ({
  loadGovernanceSamples: vi.fn(),
  stageBenchmark: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({
  supabase: mockSupabase,
}))

vi.mock('../services/durationContextSampleReadModelService.js', () => ({
  loadTemplateDurationGovernanceSamples: learningAssetMocks.loadGovernanceSamples,
}))

vi.mock('../services/durationLearningAssetAtomicStoreService.js', () => ({
  stageDurationBenchmarkCandidateAtomically: learningAssetMocks.stageBenchmark,
}))

import {
  buildDurationBenchmarkCandidates,
  runTemplateDurationGovernance,
  type DurationExperienceSampleRow,
} from '../services/templateDurationGovernanceService.js'

function asProductionSample(sample: DurationExperienceSampleRow): DurationExperienceSampleRow {
  return {
    ...sample,
    duration_day_basis: 'construction_production_day',
    actual_duration_production_days: sample.actual_duration ?? null,
    planned_duration_production_days: sample.planned_duration ?? null,
  }
}

describe('templateDurationGovernanceService', () => {
  beforeEach(() => {
    mockSupabase.from.mockReset()
    learningAssetMocks.loadGovernanceSamples.mockReset()
    learningAssetMocks.loadGovernanceSamples.mockResolvedValue([])
    learningAssetMocks.stageBenchmark.mockReset()
    learningAssetMocks.stageBenchmark.mockResolvedValue({ id: 'benchmark-new' })
  })

  it('builds company-scoped process benchmarks from active duration samples', () => {
    const samples: DurationExperienceSampleRow[] = [
      { id: 's1', template_node_id: 'node-1', wbs_node_type: 'process', actual_duration: 4, metadata: { company_id: 'company-1' } },
      { id: 's2', template_node_id: 'node-1', wbs_node_type: 'process', actual_duration: 6, metadata: { company_id: 'company-1' } },
      { id: 's3', template_node_id: 'node-1', wbs_node_type: 'process', actual_duration: 8, metadata: { company_id: 'company-1' } },
      { id: 's4', template_node_id: 'node-1', wbs_node_type: 'activity_step', actual_duration: 2, metadata: { company_id: 'company-1' } },
    ].map(asProductionSample)

    const candidates = buildDurationBenchmarkCandidates(samples)

    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      companyId: 'company-1',
      benchmarkKey: 'node-1:process:all',
      sampleCount: 3,
      p50Days: 6,
      p75Days: 8,
      p80Days: 8,
      variance: 0.272,
      coefficientOfVariation: 0.272,
      confidenceLevel: 'medium',
      confidenceScore: 55,
    })
  })

  it('falls back to standard work code when template node identity is missing', () => {
    const samples: DurationExperienceSampleRow[] = [
      { id: 's1', standard_work_code: '01-02-03', wbs_node_type: 'process', actual_duration: 3 },
      { id: 's2', standard_work_code: '01-02-03', wbs_node_type: 'process', actual_duration: 5 },
      { id: 's3', standard_work_code: '01-02-03', wbs_node_type: 'process', actual_duration: 7 },
    ].map(asProductionSample)

    const [candidate] = buildDurationBenchmarkCandidates(samples)

    expect(candidate).toMatchObject({
      companyId: null,
      benchmarkKey: '01-02-03:process:all',
      standardWorkCode: '01-02-03',
      sampleCount: 3,
      p50Days: 5,
    })
  })

  it('does not treat planned-only durations as real benchmark samples', () => {
    const samples: DurationExperienceSampleRow[] = [
      { id: 'planned-only', standard_work_code: '01-02-03', wbs_node_type: 'process', planned_duration: 3, actual_duration: null },
      { id: 'actual-1', standard_work_code: '01-02-03', wbs_node_type: 'process', actual_duration: 5 },
      { id: 'actual-2', standard_work_code: '01-02-03', wbs_node_type: 'process', actual_duration: 7 },
    ].map(asProductionSample)

    const candidates = buildDurationBenchmarkCandidates(samples)

    expect(candidates).toHaveLength(0)
  })

  it('separates benchmarks by engineering feature context when samples carry v1.4 feature facts', () => {
    const featureMetadata = {
      company_id: 'company-1',
      project_type_code: 'residential',
      structure_type_code: 'shear_wall',
      method_variant_codes: ['aluminum_formwork'],
      element_variant_codes: ['beam'],
    }
    const samples: DurationExperienceSampleRow[] = [
      { id: 's1', template_node_id: 'node-1', wbs_node_type: 'process', actual_duration: 4, metadata: featureMetadata },
      { id: 's2', template_node_id: 'node-1', wbs_node_type: 'process', actual_duration: 5, metadata: featureMetadata },
      { id: 's3', template_node_id: 'node-1', wbs_node_type: 'process', actual_duration: 6, metadata: featureMetadata },
    ].map(asProductionSample)

    const [candidate] = buildDurationBenchmarkCandidates(samples)

    expect(candidate).toMatchObject({
      companyId: 'company-1',
      benchmarkContextKey: 'project=residential|structure=shear_wall|method=aluminum_formwork|element=beam',
      benchmarkKey: 'node-1:process:project=residential|structure=shear_wall|method=aluminum_formwork|element=beam',
      sampleCount: 3,
      p50Days: 5,
    })
  })

  it('writes benchmark variance as dedicated columns with metadata compatibility mirror', async () => {
    const insertedBenchmarks: Array<Record<string, unknown>> = []
    const governanceSamples: DurationExperienceSampleRow[] = [
      { id: 's1', template_node_id: 'node-variance', wbs_node_type: 'process', actual_duration: 4, metadata: { company_id: 'company-1' } },
      { id: 's2', template_node_id: 'node-variance', wbs_node_type: 'process', actual_duration: 6, metadata: { company_id: 'company-1' } },
      { id: 's3', template_node_id: 'node-variance', wbs_node_type: 'process', actual_duration: 8, metadata: { company_id: 'company-1' } },
    ].map(asProductionSample)

    const chain = (result: unknown) => {
      const query: Record<string, unknown> = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        update: vi.fn(() => query),
        maybeSingle: vi.fn(() => Promise.resolve(result)),
        then: vi.fn((resolve, reject) => Promise.resolve(result).then(resolve, reject)),
      }
      return query
    }

    learningAssetMocks.loadGovernanceSamples.mockResolvedValue(governanceSamples)
    learningAssetMocks.stageBenchmark.mockImplementation(async (payload: Record<string, unknown>) => {
      insertedBenchmarks.push(payload)
      return { id: 'benchmark-new' }
    })

    const result = await runTemplateDurationGovernance()

    expect(result.benchmarksWritten).toBe(1)
    expect(insertedBenchmarks).toHaveLength(1)
    expect(insertedBenchmarks[0]).toMatchObject({
      p50_days: 6,
      p75_days: 8,
      p80_days: 8,
      mean_days: 6,
      variance: 0.272,
      coefficient_of_variation: 0.272,
      is_current: false,
      metadata: expect.objectContaining({
        runtime_publication_status: 'candidate',
        candidate_operation_id: expect.any(String),
        variance: 0.272,
        coefficientOfVariation: 0.272,
      }),
    })
    expect(learningAssetMocks.loadGovernanceSamples).toHaveBeenCalledWith({ limit: 1000 })
    expect(learningAssetMocks.stageBenchmark).toHaveBeenCalledOnce()
  })

  it('returns a C-19.10 non-live governance contract for sample-to-benchmark promotion without runtime mutation', async () => {
    const templateNodeId = '11111111-1111-4111-8111-111111111111'
    const governanceSamples: DurationExperienceSampleRow[] = [
      { id: 's1', template_node_id: templateNodeId, wbs_node_type: 'process', actual_duration: 4 },
      { id: 's2', template_node_id: templateNodeId, wbs_node_type: 'process', actual_duration: 6 },
      { id: 's3', template_node_id: templateNodeId, wbs_node_type: 'process', actual_duration: 8 },
    ].map(asProductionSample)
    const touchedTables: string[] = []

    const chain = (result: unknown) => {
      const query: Record<string, unknown> = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        update: vi.fn(() => query),
        maybeSingle: vi.fn(() => Promise.resolve(result)),
        then: vi.fn((resolve, reject) => Promise.resolve(result).then(resolve, reject)),
      }
      return query
    }

    learningAssetMocks.loadGovernanceSamples.mockResolvedValue(governanceSamples)
    learningAssetMocks.stageBenchmark.mockResolvedValue({ id: 'benchmark-new' })
    mockSupabase.from.mockImplementation((table: string) => {
      touchedTables.push(table)
      if (table === 'wbs_template_nodes') {
        return {
          select: vi.fn(() => chain({
            data: {
              default_duration_days: 3,
              standard_duration: null,
              reference_days: null,
            },
            error: null,
          })),
        }
      }
      if (table === 'duration_suggestion_overrides') {
        return {
          select: vi.fn(() => chain({ data: null, error: null })),
          insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const result = await runTemplateDurationGovernance({
      minOverrideSampleCount: 3,
      minOverrideDeviationRatio: 0,
    })

    expect(result.benchmarksWritten).toBe(1)
    expect(learningAssetMocks.loadGovernanceSamples).toHaveBeenCalledWith({ limit: 1000 })
    expect(learningAssetMocks.stageBenchmark).toHaveBeenCalledOnce()
    expect(touchedTables).toEqual(expect.arrayContaining(['duration_suggestion_overrides']))
    expect(touchedTables).not.toEqual(expect.arrayContaining([
      'duration_experience_samples',
      'duration_benchmarks',
    ]))
    expect(touchedTables).not.toEqual(expect.arrayContaining([
      'tasks',
      'task_dependencies',
      'runtime_publications',
      'algorithm_seed_records',
      'algorithm_seed_versions',
    ]))
    expect(result.c1910GovernanceContract).toEqual({
      sourceTable: 'duration_experience_samples',
      benchmarkTable: 'duration_benchmarks',
      candidateOverrideTable: 'duration_suggestion_overrides',
      runtimeConsumer: 'durationSuggestionService',
      runtimeConsumerBoundary: 'duration_benchmarks + algorithm_learnable_parameter_runtime_publications',
      mutationBoundary: {
        writesTaskFacts: false,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesRuntimePublications: false,
        writesAlgorithmSeeds: false,
        writesTemplateNodeDefaults: false,
        writesHistoricalPlanSnapshots: false,
      },
    })
  })
})
