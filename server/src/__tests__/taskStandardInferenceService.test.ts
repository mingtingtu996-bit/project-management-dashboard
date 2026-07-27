import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state = {
    tableName: '',
    categories: [] as any[],
    objects: [] as any[],
    parentTask: null as any,
  }
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      query.filters.push({ column, value })
      return query
    }),
    maybeSingle: vi.fn(async () => ({ data: state.parentTask, error: null })),
    filters: [] as Array<{ column: string; value: unknown }>,
    then: vi.fn((resolve: (value: unknown) => unknown) => {
      const filters = query.filters as Array<{ column: string; value: unknown }>
      const rows = state.tableName === 'engineering_categories'
        ? state.categories
        : state.tableName === 'engineering_objects'
          ? state.objects
          : []
      const filtered = rows.filter((row) => filters.every((filter) => row[filter.column] === filter.value))
      return Promise.resolve({ data: filtered, error: null }).then(resolve)
    }),
  }
  return {
    state,
    query,
    from: vi.fn((tableName: string) => {
      state.tableName = tableName
      query.filters = []
      return query
    }),
    expandTitleWeakStandardWorkSearchTextFromResolver: vi.fn(async (text: string) => text),
    inferTitleWeakStandardWorkCodesFromResolver: vi.fn(async () => []),
    inferTitleWeakStandardWorkMatchesFromResolver: vi.fn(async () => []),
    resolveStandardWorkDurationSeed: vi.fn(),
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../services/algorithmSeedResolver.js', () => ({
  expandTitleWeakStandardWorkSearchTextFromResolver: mocks.expandTitleWeakStandardWorkSearchTextFromResolver,
  inferTitleWeakStandardWorkCodesFromResolver: mocks.inferTitleWeakStandardWorkCodesFromResolver,
  inferTitleWeakStandardWorkMatchesFromResolver: mocks.inferTitleWeakStandardWorkMatchesFromResolver,
  resolveStandardWorkDurationSeed: mocks.resolveStandardWorkDurationSeed,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: vi.fn(),
  },
}))

const { applyTaskStandardInferenceForWrite } = await import('../services/taskStandardInferenceService.js')
const {
  attachTitleWeakFalsePositiveFeedback,
  buildTitleWeakFalsePositiveFeedback,
} = await import('../services/taskStandardInferenceService.js')

describe('taskStandardInferenceService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.categories = []
    mocks.state.objects = []
    mocks.state.parentTask = null
    mocks.expandTitleWeakStandardWorkSearchTextFromResolver.mockImplementation(async (text: string) => text)
    mocks.inferTitleWeakStandardWorkCodesFromResolver.mockResolvedValue([])
    mocks.inferTitleWeakStandardWorkMatchesFromResolver.mockResolvedValue([])
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue(null)
  })

  it('maps a manual task to the governed standard work rule without frontend selection', async () => {
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue({
      __stableCode: 'plastering_wall_ceiling',
      stableCode: 'plastering_wall_ceiling',
      standardWorkCodes: ['plastering_wall_ceiling'],
      confidence: 'medium',
    })
    mocks.state.categories = [{
      id: 'cat-1',
      project_id: 'project-1',
      category_name: '外墙抹灰',
      category_type: 'process',
      standard_work_code: 'plastering_wall_ceiling',
      standard_work_name: '墙面抹灰',
      enabled: true,
    }]

    const payload: Record<string, unknown> = {
      project_id: 'project-1',
      title: '1#楼外墙抹灰',
      wbs_node_type: 'process',
    }

    const result = await applyTaskStandardInferenceForWrite({ projectId: 'project-1', payload })

    expect(result.standardMapped).toBe(true)
    expect(payload.engineering_category_id).toBe('cat-1')
    expect(payload.standard_work_code).toBe('plastering_wall_ceiling')
    expect(payload.standard_work_name).toBe('墙面抹灰')
    expect(payload.standard_task_metadata).toEqual(expect.objectContaining({
      backendStandardMapping: expect.objectContaining({
        source: 'algorithm_seed_rule',
        standardWorkCode: 'plastering_wall_ceiling',
      }),
    }))
  })

  it('passes parent WBS and profession context into title weak standard matching', async () => {
    mocks.state.parentTask = {
      id: 'parent-1',
      title: '室外工程',
      standard_work_code: 'outdoor_utilities',
      standard_work_name: '室外雨污水管网',
      engineering_category_name: '室外配套工程',
      engineering_category_type: 'sub_project',
    }

    const payload: Record<string, unknown> = {
      project_id: 'project-1',
      parent_id: 'parent-1',
      title: '管道安装',
      professional_object_name: '市政',
      wbs_node_type: 'process',
    }

    await applyTaskStandardInferenceForWrite({ projectId: 'project-1', payload })

    expect(mocks.inferTitleWeakStandardWorkCodesFromResolver).toHaveBeenCalledWith(
      expect.stringContaining('管道安装'),
      expect.objectContaining({
        projectId: 'project-1',
        contextKeywords: expect.arrayContaining([
          '市政',
          '室外工程',
          '室外雨污水管网',
          '室外配套工程',
        ]),
      }),
    )
  })

  it('records unmatched backend title inference as reusable metadata without blocking save', async () => {
    mocks.inferTitleWeakStandardWorkCodesFromResolver.mockResolvedValue(['outdoor_utilities'])
    mocks.inferTitleWeakStandardWorkMatchesFromResolver.mockResolvedValue([{
      standardWorkCode: 'outdoor_utilities',
      score: 0.68,
      quality: 'keyword_phrase',
      ruleId: 'alias_outdoor_utilities',
      matchedTerms: ['外线碰口'],
    }])
    mocks.resolveStandardWorkDurationSeed.mockResolvedValue(null)

    const payload: Record<string, unknown> = {
      project_id: 'project-1',
      title: '小区外线碰口',
      wbs_node_type: 'process',
    }

    const result = await applyTaskStandardInferenceForWrite({ projectId: 'project-1', payload })

    expect(result.standardMapped).toBe(false)
    expect(payload.standard_task_metadata).toEqual(expect.objectContaining({
      backendStandardMapping: expect.objectContaining({
        source: 'algorithm_seed_unmatched',
        status: 'unmatched',
        reason: 'no_standard_work_duration_seed_match',
        rawTitle: '小区外线碰口',
        weakStandardWorkCodes: ['outdoor_utilities'],
        matchScore: 0.68,
        matchQuality: 'keyword_phrase',
        matchRuleId: 'alias_outdoor_utilities',
      }),
    }))
  })

  it('marks unrecognizable titles as data quality only and skips seed matching', async () => {
    const payload: Record<string, unknown> = {
      project_id: 'project-1',
      title: 'T-001',
      wbs_node_type: 'process',
    }

    const result = await applyTaskStandardInferenceForWrite({ projectId: 'project-1', payload })

    expect(result.standardMapped).toBe(false)
    expect(mocks.expandTitleWeakStandardWorkSearchTextFromResolver).not.toHaveBeenCalled()
    expect(payload.standard_task_metadata).toEqual(expect.objectContaining({
      backendStandardMapping: expect.objectContaining({
        source: 'title_quality_gate',
        status: 'unrecognizable',
        reason: 'placeholder_or_code_only_title',
        dataQualityIssue: 'title_unrecognizable',
      }),
    }))
  })

  it('builds false-positive feedback when a weak title mapping is corrected to another standard work', () => {
    const previousTask = {
      title: '钢筋混凝土楼板',
      standard_work_code: 'cast_in_place_concrete',
      standard_task_metadata: {
        backendStandardMapping: {
          source: 'algorithm_seed_rule',
          standardWorkCode: 'cast_in_place_concrete',
          matchRuleId: 'alias_concrete_cast',
        },
      },
    } as any
    const nextRecord = {
      standard_work_code: 'cast_in_place_rebar',
      standard_task_metadata: previousTask.standard_task_metadata,
    }

    const feedback = buildTitleWeakFalsePositiveFeedback({ previousTask, nextRecord })
    expect(feedback).toEqual({
      detected: true,
      previousStandardWorkCode: 'cast_in_place_concrete',
      correctedStandardWorkCode: 'cast_in_place_rebar',
      previousRuleId: 'alias_concrete_cast',
    })

    const payload: Record<string, unknown> = {}
    attachTitleWeakFalsePositiveFeedback({
      payload,
      merged: nextRecord,
      feedback: feedback!,
    })

    expect(payload.standard_task_metadata).toEqual(expect.objectContaining({
      backendStandardMapping: expect.objectContaining({
        source: 'user_corrected_standard_work',
        status: 'corrected',
        feedbackType: 'false_positive',
        predictedStandardWorkCode: 'cast_in_place_concrete',
        correctedStandardWorkCode: 'cast_in_place_rebar',
        previousMatchRuleId: 'alias_concrete_cast',
      }),
    }))
  })

  it('infers overall building coverage into metadata without adding a frontend field', async () => {
    mocks.state.objects = [
      { id: 'b1', project_id: 'project-1', object_type: 'building', object_code: '1#', object_name: '1#楼', status: 'active' },
      { id: 'b2', project_id: 'project-1', object_type: 'building', object_code: '2#', object_name: '2#楼', status: 'active' },
      { id: 'b3', project_id: 'project-1', object_type: 'building', object_code: '3#', object_name: '3#楼', status: 'active' },
    ]

    const payload: Record<string, unknown> = {
      project_id: 'project-1',
      title: '1#楼-3#楼外墙抹灰',
      wbs_node_type: 'process',
      standard_task_metadata: {},
    }

    const result = await applyTaskStandardInferenceForWrite({ projectId: 'project-1', payload })

    expect(result.scopeCoverageMapped).toBe(true)
    expect(payload.standard_task_metadata).toEqual(expect.objectContaining({
      scopeCoverageMode: 'package',
      coveredBuildingIds: ['b1', 'b2', 'b3'],
      backendScopeInference: expect.objectContaining({
        source: 'engineering_object_title_rule',
      }),
    }))
  })
})
