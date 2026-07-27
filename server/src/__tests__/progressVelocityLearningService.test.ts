import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildDurationContextPolicyStateBucket } from '../services/durationContextPolicyStateBucketService.js'
import type { ProgressVelocityLearningInput } from '../services/progressVelocityLearningService.js'

const state = vi.hoisted(() => ({
  tasks: [] as Array<Record<string, unknown>>,
  durationExperienceSamples: [] as Array<Record<string, unknown>>,
  snapshots: [] as Array<Record<string, unknown>>,
  sampleReadModelCalls: [] as Array<{ scope: 'project' | 'company'; input: Record<string, unknown> }>,
}))

const dbFrom = vi.hoisted(() => vi.fn((table: string) => createBuilder(table)))

function createBuilder(table: string) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    in: vi.fn(async () => ({ data: table === 'task_progress_snapshots' ? state.snapshots : [], error: null })),
    limit: vi.fn(async () => ({
      data: table === 'tasks'
        ? state.tasks
        : table === 'duration_experience_samples'
          ? state.durationExperienceSamples
          : [],
      error: null,
    })),
  }
  return builder
}

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: dbFrom,
  },
}))

vi.mock('../services/durationContextSampleReadModelService.js', () => ({
  loadProgressVelocityProjectDurationExperienceSamples: vi.fn(async (input: Record<string, unknown>) => {
    state.sampleReadModelCalls.push({ scope: 'project', input })
    return state.durationExperienceSamples.filter((row) => (
      row.project_id === input.projectId
      && (row.company_id ?? (row.metadata as Record<string, unknown> | undefined)?.company_id) === input.companyId
    ))
  }),
  loadProgressVelocityCompanyDurationExperienceSamples: vi.fn(async (input: Record<string, unknown>) => {
    state.sampleReadModelCalls.push({ scope: 'company', input })
    return state.durationExperienceSamples.filter((row) => (
      (row.company_id ?? (row.metadata as Record<string, unknown> | undefined)?.company_id) === input.companyId
      && row.project_id !== input.excludeProjectId
    ))
  }),
}))

const { buildProjectProgressVelocityLearning: buildProjectProgressVelocityLearningRuntime } = await import('../services/progressVelocityLearningService.js')

function buildProjectProgressVelocityLearning(input: ProgressVelocityLearningInput) {
  return buildProjectProgressVelocityLearningRuntime({
    ...input,
    constructionCalendarResolver: input.constructionCalendarResolver
      ?? (async () => ({
        basis: 'official_construction_calendar_seed',
        windows: [],
        calendarRef: 'work_calendar',
        calendarVersion: 'calendar-v1',
        timezone: 'Asia/Shanghai',
        availability: 'available',
        unavailableReason: null,
      })),
  })
}

function completedTask(index: number, actualEndDate: string) {
  return {
    id: `task-${index}`,
    project_id: 'project-1',
    title: `sample-${index}`,
    status: 'completed',
    progress: 100,
    template_node_id: 'template-1',
    standard_work_code: 'work-1',
    engineering_category_id: 'cat-1',
    participant_unit_id: 'unit-1',
    standard_task_metadata: {
      structureTypeCode: 'frame',
    },
    planned_start_date: '2026-04-01',
    planned_end_date: '2026-04-05',
    actual_start_date: '2026-04-01',
    actual_end_date: actualEndDate,
    updated_at: `${actualEndDate}T17:00:00.000Z`,
  }
}

function progressVelocityT1Bucket() {
  return buildDurationContextPolicyStateBucket({
    maturityTier: 'mature_90d',
    scheduleState: 'stable',
    highRiskFactorCount: 0,
    mediumRiskFactorCount: 0,
    lowRiskFactorCount: 1,
    hardConstraintActive: false,
    experienceTier: 'T1',
  })
}

describe('progressVelocityLearningService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.sampleReadModelCalls = []
    state.tasks = [
      completedTask(1, '2026-04-06'),
      completedTask(2, '2026-04-06'),
      completedTask(3, '2026-04-06'),
      completedTask(4, '2026-04-06'),
      completedTask(5, '2026-04-06'),
      completedTask(6, '2026-04-12'),
    ]
    state.durationExperienceSamples = []
    state.snapshots = [
      { task_id: 'task-6', progress: 10, snapshot_date: '2026-04-28', created_at: '2026-04-28T08:00:00.000Z' },
      { task_id: 'task-6', progress: 80, snapshot_date: '2026-04-30', created_at: '2026-04-30T08:00:00.000Z' },
    ]
  })

  it('reads governed project/company raw samples only through the tenant-scoped sample read model', async () => {
    state.tasks = []
    state.durationExperienceSamples = Array.from({ length: 3 }, (_, index) => ({
      id: `experience-${index + 1}`,
      company_id: 'company-1',
      project_id: index === 0 ? 'project-1' : `project-${index + 1}`,
      task_id: `experience-task-${index + 1}`,
      template_node_id: 'template-1',
      standard_work_code: 'work-1',
      engineering_category_id: 'cat-1',
      planned_duration: 5,
      actual_duration: 6,
      completed_at: '2026-04-06',
      sample_status: 'active',
      included_in_benchmark: true,
      experience_tier: 'T1',
      metadata: { experienceTier: 'T1' },
    }))

    await buildProjectProgressVelocityLearning({
      projectId: 'project-1',
      companyId: 'company-1',
      templateNodeId: 'template-1',
      standardWorkCode: 'work-1',
      engineeringCategoryId: 'cat-1',
      now: new Date('2026-04-10T00:00:00.000Z'),
    })

    expect(state.sampleReadModelCalls).toEqual([
      {
        scope: 'project',
        input: expect.objectContaining({ projectId: 'project-1', companyId: 'company-1', limit: 200 }),
      },
      {
        scope: 'company',
        input: expect.objectContaining({ companyId: 'company-1', excludeProjectId: 'project-1', limit: 200 }),
      },
    ])
    expect(dbFrom).not.toHaveBeenCalledWith('duration_experience_samples')
  })

  it('learns project velocity from recent completed tasks and excludes anomalous samples', async () => {
    const result = await buildProjectProgressVelocityLearning({
      projectId: 'project-1',
      taskId: 'current-task',
      templateNodeId: 'template-1',
      standardWorkCode: 'work-1',
      engineeringCategoryId: 'cat-1',
      responsibleUnitId: 'unit-1',
      structureTypeCode: 'frame',
      now: new Date('2026-05-16T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      sampleCount: 5,
      excludedAnomalyTaskCount: 1,
      confidenceLevel: 'high',
      confidenceScore: expect.any(Number),
      confidenceDelta: expect.any(Number),
      actionPolicy: 'auto_apply',
      groupKey: 'template:template-1:structure:frame',
    })
    expect(result?.confidenceScore).toBeGreaterThan(75)
    expect(result?.confidenceScore).toBeLessThan(95)
    expect(result?.durationRatio).toBeCloseTo(1.2, 2)
    expect(result?.metadata).toEqual(expect.objectContaining({
      confidencePolicy: expect.objectContaining({
        minUsefulSamples: 3,
        highConfidenceSamples: 50,
      }),
    }))
    expect(result?.metadata.sampleTaskIds).not.toContain('task-6')
  })

  it('excludes completed task samples missing a real actual_end_date instead of using updated_at as actual', async () => {
    state.tasks = [
      {
        ...completedTask(1, '2026-04-06'),
        actual_end_date: null,
        updated_at: '2026-04-06T17:00:00.000Z',
      },
    ]
    state.snapshots = []

    const result = await buildProjectProgressVelocityLearning({
      projectId: 'project-1',
      taskId: 'current-task',
      templateNodeId: 'template-1',
      standardWorkCode: 'work-1',
      engineeringCategoryId: 'cat-1',
      responsibleUnitId: 'unit-1',
      structureTypeCode: 'frame',
      now: new Date('2026-05-16T00:00:00.000Z'),
    })

    expect(result).toBeNull()
  })

  it('uses a smooth confidence score between small and large sample sets', async () => {
    state.tasks = Array.from({ length: 20 }, (_, index) => completedTask(index + 1, '2026-04-06'))
    state.snapshots = []

    const result = await buildProjectProgressVelocityLearning({
      projectId: 'project-1',
      taskId: 'current-task',
      templateNodeId: 'template-1',
      standardWorkCode: 'work-1',
      engineeringCategoryId: 'cat-1',
      responsibleUnitId: 'unit-1',
      structureTypeCode: 'frame',
      now: new Date('2026-05-16T00:00:00.000Z'),
    })

    expect(result).toEqual(expect.objectContaining({
      sampleCount: 20,
      confidenceLevel: 'high',
      actionPolicy: 'auto_apply',
    }))
    expect(result?.confidenceScore).toBeGreaterThanOrEqual(82)
    expect(result?.confidenceScore).toBeLessThan(95)
    expect(result?.confidenceDelta).toBeGreaterThanOrEqual(0)
  })

  it('downweights warning anomaly samples instead of excluding them from velocity learning', async () => {
    state.tasks = [
      completedTask(1, '2026-04-06'),
      completedTask(2, '2026-04-06'),
      completedTask(3, '2026-04-06'),
    ]
    state.snapshots = [
      { task_id: 'task-2', progress: 10, snapshot_date: '2026-04-26', created_at: '2026-04-26T08:00:00.000Z' },
      { task_id: 'task-2', progress: 50, snapshot_date: '2026-04-28', created_at: '2026-04-28T08:00:00.000Z' },
    ]

    const result = await buildProjectProgressVelocityLearning({
      projectId: 'project-1',
      taskId: 'current-task',
      templateNodeId: 'template-1',
      standardWorkCode: 'work-1',
      engineeringCategoryId: 'cat-1',
      responsibleUnitId: 'unit-1',
      structureTypeCode: 'frame',
      now: new Date('2026-05-16T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      sampleCount: 3,
      excludedAnomalyTaskCount: 0,
    })
    expect(result?.metadata).toEqual(expect.objectContaining({
      downgradedAnomalyTaskCount: 1,
      sampleTaskIds: ['task-1', 'task-2', 'task-3'],
      sampleQualityWeightMultipliers: [1, 0.45, 1],
      effectiveSampleWeight: 2.45,
    }))
  })

  it('uses an adaptive learning window based on the standard duration', async () => {
    state.tasks = [
      completedTask(1, '2026-01-10'),
      completedTask(2, '2026-04-06'),
    ]
    state.snapshots = []

    const result = await buildProjectProgressVelocityLearning({
      projectId: 'project-1',
      taskId: 'current-task',
      templateNodeId: 'template-1',
      standardWorkCode: 'work-1',
      engineeringCategoryId: 'cat-1',
      responsibleUnitId: 'unit-1',
      structureTypeCode: 'frame',
      baseDurationDays: 7,
      now: new Date('2026-05-16T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      sampleCount: 1,
      groupKey: 'template:template-1:structure:frame',
    })
    expect(result?.metadata).toEqual(expect.objectContaining({
      learningWindowDays: 90,
      sampleTaskIds: ['task-2'],
    }))
  })

  it('falls back to company-level experience samples when project samples are thin', async () => {
    state.tasks = [completedTask(1, '2026-04-06')]
    state.snapshots = []
    state.durationExperienceSamples = Array.from({ length: 4 }, (_, index) => ({
      id: `sample-${index + 1}`,
      project_id: `history-project-${index + 1}`,
      task_id: `history-task-${index + 1}`,
      template_node_id: 'template-1',
      standard_work_code: 'work-1',
      engineering_category_id: 'cat-1',
      planned_duration: 10,
      actual_duration: 13,
      completed_at: `2026-04-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      sample_status: 'active',
      included_in_benchmark: true,
      sample_strength: 'strong',
      confidence_level: 'high',
      metadata: {
        company_id: 'company-1',
        participant_unit_id: 'unit-1',
        structure_type_code: 'frame',
        state_bucket: progressVelocityT1Bucket(),
      },
    }))

    const result = await buildProjectProgressVelocityLearning({
      projectId: 'project-1',
      companyId: 'company-1',
      taskId: 'current-task',
      templateNodeId: 'template-1',
      standardWorkCode: 'work-1',
      engineeringCategoryId: 'cat-1',
      responsibleUnitId: 'unit-1',
      structureTypeCode: 'frame',
      baseDurationDays: 10,
      now: new Date('2026-05-16T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      sampleCount: 5,
      groupKey: 'template:template-1:structure:frame',
    })
    expect(result?.multiplier).toBeGreaterThan(1.2)
    expect(result?.metadata).toEqual(expect.objectContaining({
      learningScope: 'project_plus_company',
      companyFallbackSampleCount: 4,
      crossProjectSampleWeight: 0.5,
    }))
  })

  it('keeps progress velocity learning on the T1 bucket and rejects T2 or legacy bucketless experience samples', async () => {
    state.tasks = []
    state.snapshots = []
    const t1Bucket = buildDurationContextPolicyStateBucket({
      maturityTier: 'mature_90d',
      scheduleState: 'stable',
      highRiskFactorCount: 0,
      mediumRiskFactorCount: 0,
      lowRiskFactorCount: 1,
      hardConstraintActive: false,
      experienceTier: 'T1',
    })
    const t2Bucket = buildDurationContextPolicyStateBucket({
      maturityTier: 'mature_90d',
      scheduleState: 'stable',
      highRiskFactorCount: 0,
      mediumRiskFactorCount: 0,
      lowRiskFactorCount: 1,
      hardConstraintActive: false,
      experienceTier: 'T2',
    })
    state.durationExperienceSamples = [
      ...Array.from({ length: 3 }, (_, index) => ({
        id: `t1-sample-${index + 1}`,
        project_id: 'project-1',
        task_id: `t1-task-${index + 1}`,
        template_node_id: 'template-1',
        standard_work_code: 'work-1',
        engineering_category_id: 'cat-1',
        planned_duration: 10,
        actual_duration: 12,
        completed_at: `2026-04-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
        sample_status: 'active',
        included_in_benchmark: true,
        metadata: {
          company_id: 'company-1',
          participant_unit_id: 'unit-1',
          structure_type_code: 'frame',
          state_bucket: t1Bucket,
        },
      })),
      {
        id: 't2-sample-1',
        project_id: 'project-1',
        task_id: 't2-task-1',
        template_node_id: 'template-1',
        standard_work_code: 'work-1',
        engineering_category_id: 'cat-1',
        planned_duration: 10,
        actual_duration: 20,
        completed_at: '2026-04-04T00:00:00.000Z',
        sample_status: 'active',
        included_in_benchmark: true,
        metadata: {
          company_id: 'company-1',
          participant_unit_id: 'unit-1',
          structure_type_code: 'frame',
          stateBucket: t2Bucket,
        },
      },
      {
        id: 'legacy-bucketless-sample-1',
        project_id: 'project-1',
        task_id: 'legacy-bucketless-task-1',
        template_node_id: 'template-1',
        standard_work_code: 'work-1',
        engineering_category_id: 'cat-1',
        planned_duration: 10,
        actual_duration: 30,
        completed_at: '2026-04-05T00:00:00.000Z',
        sample_status: 'active',
        included_in_benchmark: true,
        metadata: {
          company_id: 'company-1',
          participant_unit_id: 'unit-1',
          structure_type_code: 'frame',
        },
      },
    ]

    const result = await buildProjectProgressVelocityLearning({
      projectId: 'project-1',
      companyId: 'company-1',
      taskId: 'current-task',
      templateNodeId: 'template-1',
      standardWorkCode: 'work-1',
      engineeringCategoryId: 'cat-1',
      responsibleUnitId: 'unit-1',
      structureTypeCode: 'frame',
      baseDurationDays: 10,
      now: new Date('2026-05-16T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      sampleCount: 3,
      durationRatio: 1.2,
      multiplier: 1.2,
      groupKey: 'template:template-1:structure:frame',
    })
    expect(result?.metadata).toEqual(expect.objectContaining({
      experienceTier: 'T1',
      learningBucketValidation: 'duration_context_policy_state_bucket_T1_only',
      rejectedExperienceTierSampleCount: 2,
      rejectedExperienceTierReasonCounts: expect.objectContaining({
        experience_tier_mismatch: 1,
        experience_tier_missing_or_invalid: 1,
      }),
      sampleTaskIds: ['t1-task-1', 't1-task-2', 't1-task-3'],
    }))
  })

  it('falls back to standard work code grouping when template rows are absent', async () => {
    state.tasks = [
      {
        ...completedTask(1, '2026-04-06'),
        template_node_id: null,
        engineering_category_id: 'cat-1',
      },
      {
        ...completedTask(2, '2026-04-06'),
        template_node_id: null,
        engineering_category_id: 'cat-1',
      },
      {
        ...completedTask(3, '2026-04-06'),
        template_node_id: null,
        engineering_category_id: 'cat-1',
      },
    ]
    state.snapshots = []

    const result = await buildProjectProgressVelocityLearning({
      projectId: 'project-1',
      taskId: 'current-task',
      standardWorkCode: 'work-1',
      engineeringCategoryId: 'cat-1',
      responsibleUnitId: 'unit-1',
      structureTypeCode: 'frame',
      now: new Date('2026-05-16T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      sampleCount: 3,
      groupKey: 'standard_work:work-1',
    })
    expect(result?.metadata.learningScope).toBe('project')
  })

  it('uses coarse-enough standard work samples instead of a thin exact template match', async () => {
    state.tasks = [
      completedTask(1, '2026-04-20'),
      {
        ...completedTask(2, '2026-04-06'),
        template_node_id: 'other-template-1',
      },
      {
        ...completedTask(3, '2026-04-06'),
        template_node_id: 'other-template-2',
      },
      {
        ...completedTask(4, '2026-04-06'),
        template_node_id: 'other-template-3',
      },
    ]
    state.snapshots = []

    const result = await buildProjectProgressVelocityLearning({
      projectId: 'project-1',
      taskId: 'current-task',
      templateNodeId: 'template-1',
      standardWorkCode: 'work-1',
      engineeringCategoryId: 'cat-1',
      responsibleUnitId: 'unit-1',
      structureTypeCode: 'frame',
      now: new Date('2026-05-16T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      sampleCount: 4,
      groupKey: 'standard_work:work-1',
    })
    expect(result?.metadata.sampleTaskIds).toEqual(['task-1', 'task-2', 'task-3', 'task-4'])
  })

  it('prefers sufficiently supported standard work samples over a barely supported exact template group', async () => {
    state.tasks = [
      completedTask(1, '2026-04-12'),
      completedTask(2, '2026-04-12'),
      completedTask(3, '2026-04-12'),
      {
        ...completedTask(4, '2026-04-06'),
        template_node_id: 'other-template-1',
      },
      {
        ...completedTask(5, '2026-04-06'),
        template_node_id: 'other-template-2',
      },
      {
        ...completedTask(6, '2026-04-06'),
        template_node_id: 'other-template-3',
      },
    ]
    state.snapshots = []

    const result = await buildProjectProgressVelocityLearning({
      projectId: 'project-1',
      taskId: 'current-task',
      templateNodeId: 'template-1',
      standardWorkCode: 'work-1',
      engineeringCategoryId: 'cat-1',
      responsibleUnitId: 'unit-1',
      structureTypeCode: 'frame',
      now: new Date('2026-05-16T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      sampleCount: 6,
      groupKey: 'standard_work:work-1',
    })
    expect(result?.metadata.sampleTaskIds).toEqual(['task-1', 'task-2', 'task-3', 'task-4', 'task-5', 'task-6'])
  })

  it('learns velocity from actual-to-forecast ratio instead of actual-to-planned when forecast sidecar exists', async () => {
    state.tasks = []
    state.snapshots = []
    state.durationExperienceSamples = Array.from({ length: 5 }, (_, index) => ({
      id: `forecast-sample-${index + 1}`,
      project_id: 'project-1',
      task_id: `forecast-task-${index + 1}`,
      template_node_id: 'template-1',
      standard_work_code: 'work-1',
      engineering_category_id: 'cat-1',
      planned_duration: 10,
      actual_duration: 15,
      completed_at: `2026-04-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      sample_status: 'active',
      included_in_benchmark: true,
      sample_strength: 'strong',
      confidence_level: 'high',
      metadata: {
        company_id: 'company-1',
        participant_unit_id: 'unit-1',
        structure_type_code: 'frame',
        state_bucket: progressVelocityT1Bucket(),
        forecast_learning_observation: {
          learning_target: 'forecast_ratio_velocity_multiplier',
          production_consumption_policy: 'active_velocity_multiplier_input',
          actual_start_source: 'actual_start_date',
          actual_end_source: 'actual_end_date',
          actual_duration_source: 'actual_start_date_to_actual_end_date',
          forecast_ratio: 1,
          plan_ratio: 1.5,
          forecast_duration_days: 15,
          actual_duration_days: 15,
          planned_duration_days: 10,
        },
      },
    }))

    const result = await buildProjectProgressVelocityLearning({
      projectId: 'project-1',
      companyId: 'company-1',
      taskId: 'current-task',
      templateNodeId: 'template-1',
      standardWorkCode: 'work-1',
      engineeringCategoryId: 'cat-1',
      responsibleUnitId: 'unit-1',
      structureTypeCode: 'frame',
      baseDurationDays: 10,
      now: new Date('2026-05-16T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      sampleCount: 5,
      durationRatio: 1,
      multiplier: 1,
      groupKey: 'template:template-1:structure:frame',
    })
    expect(result?.metadata).toEqual(expect.objectContaining({
      learningTarget: 'actual_to_forecast',
      sampleRatios: [1, 1, 1, 1, 1],
      samplePlanRatios: [1.5, 1.5, 1.5, 1.5, 1.5],
    }))
  })

  it('recomputes the actual-to-forecast ratio from actual and forecast duration fields instead of trusting the stored ratio', async () => {
    state.tasks = []
    state.snapshots = []
    state.durationExperienceSamples = Array.from({ length: 5 }, (_, index) => ({
      id: `polluted-forecast-sample-${index + 1}`,
      project_id: 'project-1',
      task_id: `polluted-forecast-task-${index + 1}`,
      template_node_id: 'template-1',
      standard_work_code: 'work-1',
      engineering_category_id: 'cat-1',
      planned_duration: 10,
      actual_duration: 15,
      completed_at: `2026-04-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      sample_status: 'active',
      included_in_benchmark: true,
      sample_strength: 'strong',
      confidence_level: 'high',
      metadata: {
        company_id: 'company-1',
        participant_unit_id: 'unit-1',
        structure_type_code: 'frame',
        state_bucket: progressVelocityT1Bucket(),
        forecast_learning_observation: {
          learning_target: 'forecast_ratio_velocity_multiplier',
          production_consumption_policy: 'active_velocity_multiplier_input',
          actual_start_source: 'actual_start_date',
          actual_end_source: 'actual_end_date',
          actual_duration_source: 'actual_start_date_to_actual_end_date',
          forecast_duration_source: 'remaining_duration_days',
          forecast_duration_days: 15,
          actual_duration_days: 15,
          planned_duration_days: 10,
          forecast_ratio: 1.25,
          plan_ratio: 1.5,
        },
      },
    }))

    const result = await buildProjectProgressVelocityLearning({
      projectId: 'project-1',
      companyId: 'company-1',
      taskId: 'current-task',
      templateNodeId: 'template-1',
      standardWorkCode: 'work-1',
      engineeringCategoryId: 'cat-1',
      responsibleUnitId: 'unit-1',
      structureTypeCode: 'frame',
      baseDurationDays: 10,
      now: new Date('2026-05-16T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      sampleCount: 5,
      durationRatio: 1,
      multiplier: 1,
      groupKey: 'template:template-1:structure:frame',
    })
    expect(result?.metadata).toEqual(expect.objectContaining({
      learningTarget: 'actual_to_forecast',
      sampleRatios: [1, 1, 1, 1, 1],
      samplePlanRatios: [1.5, 1.5, 1.5, 1.5, 1.5],
    }))
  })

  it('ignores forecast sidecars without explicit actual duration date-source proof', async () => {
    state.tasks = []
    state.snapshots = []
    state.durationExperienceSamples = Array.from({ length: 5 }, (_, index) => ({
      id: `unproven-forecast-sample-${index + 1}`,
      project_id: 'project-1',
      task_id: `unproven-forecast-task-${index + 1}`,
      template_node_id: 'template-1',
      standard_work_code: 'work-1',
      engineering_category_id: 'cat-1',
      planned_duration: 10,
      actual_duration: 15,
      completed_at: `2026-04-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      sample_status: 'active',
      included_in_benchmark: true,
      sample_strength: 'strong',
      confidence_level: 'high',
      metadata: {
        company_id: 'company-1',
        participant_unit_id: 'unit-1',
        structure_type_code: 'frame',
        state_bucket: progressVelocityT1Bucket(),
        forecast_learning_observation: {
          learning_target: 'forecast_ratio_velocity_multiplier',
          production_consumption_policy: 'active_velocity_multiplier_input',
          actual_start_source: 'actual_start_date',
          actual_end_source: 'actual_end_date',
          forecast_duration_source: 'remaining_duration_days',
          forecast_duration_days: 15,
          planned_duration_days: 10,
          forecast_ratio: 1,
          plan_ratio: 1.5,
        },
      },
    }))

    const result = await buildProjectProgressVelocityLearning({
      projectId: 'project-1',
      companyId: 'company-1',
      taskId: 'current-task',
      templateNodeId: 'template-1',
      standardWorkCode: 'work-1',
      engineeringCategoryId: 'cat-1',
      responsibleUnitId: 'unit-1',
      structureTypeCode: 'frame',
      baseDurationDays: 10,
      now: new Date('2026-05-16T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      sampleCount: 5,
      durationRatio: 1.5,
      multiplier: 1.35,
      groupKey: 'template:template-1:structure:frame',
    })
    expect(result?.metadata).toEqual(expect.objectContaining({
      learningTarget: 'actual_to_planned',
      sampleRatios: [1.5, 1.5, 1.5, 1.5, 1.5],
      sampleRatioBases: [
        'actual_to_planned',
        'actual_to_planned',
        'actual_to_planned',
        'actual_to_planned',
        'actual_to_planned',
      ],
    }))
  })

  it('ignores forecast sidecars whose actual numerator was not sourced from real actual dates', async () => {
    state.tasks = []
    state.snapshots = []
    state.durationExperienceSamples = Array.from({ length: 5 }, (_, index) => ({
      id: `weak-forecast-sample-${index + 1}`,
      project_id: 'project-1',
      task_id: `weak-forecast-task-${index + 1}`,
      template_node_id: 'template-1',
      standard_work_code: 'work-1',
      engineering_category_id: 'cat-1',
      planned_duration: 10,
      actual_duration: 15,
      completed_at: `2026-04-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      sample_status: 'active',
      included_in_benchmark: true,
      sample_strength: 'weak',
      confidence_level: 'low',
      metadata: {
        company_id: 'company-1',
        participant_unit_id: 'unit-1',
        structure_type_code: 'frame',
        state_bucket: progressVelocityT1Bucket(),
        actual_start_source: 'actual_start_date',
        actual_end_source: 'updated_at_completion_event',
        forecast_learning_observation: {
          learning_target: 'forecast_ratio_velocity_multiplier',
          production_consumption_policy: 'active_velocity_multiplier_input',
          actual_start_source: 'actual_start_date',
          actual_end_source: 'updated_at_completion_event',
          forecast_ratio: 1,
          plan_ratio: 1.5,
          forecast_duration_days: 15,
          actual_duration_days: 15,
          planned_duration_days: 10,
        },
      },
    }))

    const result = await buildProjectProgressVelocityLearning({
      projectId: 'project-1',
      companyId: 'company-1',
      taskId: 'current-task',
      templateNodeId: 'template-1',
      standardWorkCode: 'work-1',
      engineeringCategoryId: 'cat-1',
      responsibleUnitId: 'unit-1',
      structureTypeCode: 'frame',
      baseDurationDays: 10,
      now: new Date('2026-05-16T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      sampleCount: 5,
      durationRatio: 1.5,
      multiplier: 1.35,
      groupKey: 'template:template-1:structure:frame',
    })
    expect(result?.metadata).toEqual(expect.objectContaining({
      learningTarget: 'actual_to_planned',
      sampleRatios: [1.5, 1.5, 1.5, 1.5, 1.5],
      sampleRatioBases: [
        'actual_to_planned',
        'actual_to_planned',
        'actual_to_planned',
        'actual_to_planned',
        'actual_to_planned',
      ],
    }))
  })
})
