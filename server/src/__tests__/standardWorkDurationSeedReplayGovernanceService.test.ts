import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  durationExperienceSamples: [
    {
      id: 'sample-1',
      company_id: 'company-1',
      project_id: 'project-1',
      task_id: 'task-1',
      standard_work_code: '02-01-03-P07',
      standard_work_name: 'Concrete placing',
      wbs_node_type: 'process',
      duration_day_basis: 'construction_production_day',
      actual_duration: 5,
      actual_duration_production_days: 5,
      planned_duration: 5,
      planned_duration_production_days: 5,
      completed_at: '2026-05-01T00:00:00Z',
      confidence_score: 90,
      sample_status: 'active',
      included_in_benchmark: true,
      metadata: {
        concrete_placement_band: 'bucket',
        workface_band: 'constrained',
      },
    },
    {
      id: 'sample-2',
      company_id: 'company-1',
      project_id: 'project-1',
      task_id: 'task-2',
      standard_work_code: '02-01-03-P07',
      standard_work_name: 'Concrete placing',
      wbs_node_type: 'process',
      duration_day_basis: 'construction_production_day',
      actual_duration: 5,
      actual_duration_production_days: 5,
      completed_at: '2026-05-02T00:00:00Z',
      confidence_score: 90,
      sample_status: 'active',
      included_in_benchmark: true,
      metadata: {
        concrete_placement_band: 'bucket',
        workface_band: 'constrained',
      },
    },
    {
      id: 'sample-3',
      company_id: 'company-1',
      project_id: 'project-1',
      task_id: 'task-3',
      standard_work_code: '02-01-03-P07',
      standard_work_name: 'Concrete placing',
      wbs_node_type: 'process',
      duration_day_basis: 'construction_production_day',
      actual_duration: 6,
      actual_duration_production_days: 6,
      completed_at: '2026-05-03T00:00:00Z',
      confidence_score: 90,
      sample_status: 'active',
      included_in_benchmark: true,
      metadata: {
        concrete_placement_band: 'bucket',
        workface_band: 'constrained',
      },
    },
  ],
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table !== 'duration_experience_samples') throw new Error(`unexpected table ${table}`)
      const query = {
        rows: [...state.durationExperienceSamples],
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          query.rows = query.rows.filter((row: any) => row[column] === value)
          return query
        }),
        not: vi.fn((column: string) => {
          query.rows = query.rows.filter((row: any) => row[column] != null)
          return query
        }),
        order: vi.fn(() => query),
        limit: vi.fn(async (count: number) => ({
          data: query.rows.slice(0, count),
          error: null,
        })),
      }
      return query
    }),
  },
}))

vi.mock('../services/algorithmSeedResolver.js', () => ({
  resolveStandardWorkDurationSeed: vi.fn(async (_text: string, context: any) => ({
    stableCode: 'process_duration:cast_in_place_concrete',
    standardWorkCodes: ['02-01-03-P07'],
    defaultDaysP50: context.scopeDimensions?.includes('bucket_concrete') ? 5 : 2,
    selectedConditionCode: context.scopeDimensions?.includes('bucket_concrete')
      ? 'bucket_constrained_concrete'
      : 'pumped_standard_floor_concrete',
    confidence: 'high',
  })),
}))

const { buildStandardWorkDurationSeedReplayGovernanceReport } = await import('../services/standardWorkDurationSeedReplayGovernanceService.js')

describe('standardWorkDurationSeedReplayGovernanceService', () => {
  it('builds backend-only replay governance report from active benchmark duration samples', async () => {
    const report = await buildStandardWorkDurationSeedReplayGovernanceReport({
      companyId: 'company-1',
      projectId: 'project-1',
      minSamplesPerCode: 3,
      maxSamples: 10,
    })

    expect(report).toEqual(expect.objectContaining({
      reportCode: 'standard_work_duration_seed_replay_governance',
      companyId: 'company-1',
      projectId: 'project-1',
      source: expect.objectContaining({
        table: 'duration_experience_samples',
        filters: expect.objectContaining({
          sampleStatus: 'active',
          includedInBenchmark: true,
          durationDayBasis: 'construction_production_day',
          wbsNodeType: 'process',
          maxSamples: 10,
        }),
      }),
      governanceBoundary: {
        reportOnly: true,
        seedWritePolicy: 'never_write_seed_from_replay',
        promotionPolicy: 'review_required_before_seed_promotion',
        allowedUse: 'backend_governance_report',
      },
    }))
    expect(report.replay.summary).toEqual(expect.objectContaining({
      inputSampleCount: 3,
      eligibleSampleCount: 3,
      evaluatedCodeCount: 1,
      trustedCodeCount: 1,
      reviewRequiredCodeCount: 0,
    }))
    expect(report.replay.byStandardWorkCode[0]).toEqual(expect.objectContaining({
      standardWorkCode: '02-01-03-P07',
      seedP50Days: 5,
      selectedConditionCode: 'bucket_constrained_concrete',
      medianActualDays: 5,
      replayStatus: 'trusted',
    }))
  })
})
