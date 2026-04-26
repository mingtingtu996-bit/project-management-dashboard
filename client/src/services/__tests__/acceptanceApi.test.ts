import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authFetch: vi.fn(),
}))

vi.mock('../../lib/apiClient', () => ({
  authFetch: mocks.authFetch,
}))

import { acceptanceApi } from '../acceptanceApi'

describe('acceptanceApi canonical contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps canonical backend fields into the normalized AcceptancePlan shape', async () => {
    mocks.authFetch.mockResolvedValueOnce([
      {
        id: 'plan-1',
        project_id: 'project-1',
        task_id: 'milestone-1',
        catalog_id: 'catalog-1',
        plan_name: '消防专项验收',
        acceptance_type: '消防验收',
        status: 'not_started',
        parallel_group_id: 'parallel-a',
        planned_date: '2026-04-20',
        predecessor_plan_ids: '["plan-0"]',
        successor_plan_ids: [],
        position: '{"x":12,"y":34}',
        documents: '[]',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      },
    ])

    const plans = await acceptanceApi.getPlans('project-1')

    expect(mocks.authFetch).toHaveBeenCalledWith('/api/acceptance-plans?projectId=project-1', {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    })
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({
      id: 'plan-1',
      project_id: 'project-1',
      milestone_id: 'milestone-1',
      catalog_id: 'catalog-1',
      name: '消防专项验收',
      acceptance_type: '消防验收',
      status: 'draft',
      parallel_group_id: 'parallel-a',
      predecessor_plan_ids: ['plan-0'],
      successor_plan_ids: [],
      display_badges: expect.arrayContaining(['受阻', '前置未满足']),
    })
  })

  it('uses the dedicated PATCH status endpoint for state migration', async () => {
    mocks.authFetch.mockResolvedValueOnce({
      id: 'plan-1',
      project_id: 'project-1',
      status: 'passed',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-02T00:00:00.000Z',
    })

    await acceptanceApi.updateStatus('plan-1', 'passed')

    expect(mocks.authFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mocks.authFetch.mock.calls[0]
    expect(url).toBe('/api/acceptance-plans/plan-1/status')
    expect(options.method).toBe('PATCH')
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(String(options.body))).toMatchObject({
      status: 'passed',
    })
    expect(JSON.parse(String(options.body)).actual_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('loads the formal flow snapshot route with server-side filters', async () => {
    mocks.authFetch.mockResolvedValueOnce({
      catalogs: [],
      plans: [
        {
          id: 'plan-2',
          project_id: 'project-1',
          plan_name: '主体结构验收',
          status: 'rectification',
          overlay_tags: ['资料缺失', '前置未满足'],
          parallel_group_id: 'parallel-b',
          planned_date: '2026-04-25',
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      ],
      dependencies: [
        {
          id: 'dep-1',
          project_id: 'project-1',
          source_plan_id: 'plan-0',
          target_plan_id: 'plan-2',
          dependency_kind: 'hard',
          status: 'active',
        },
      ],
      requirements: [],
      records: [],
    })

    const snapshot = await acceptanceApi.getFlowSnapshot('project-1', {
      overlayTag: '资料缺失',
      status: ['rectifying'],
      blockedOnly: true,
    })

    expect(mocks.authFetch).toHaveBeenCalledWith(
      '/api/acceptance-plans/flow-snapshot?projectId=project-1&overlayTag=%E8%B5%84%E6%96%99%E7%BC%BA%E5%A4%B1&blockedOnly=true&status=rectifying',
      {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      },
    )
    expect(snapshot.plans[0]).toMatchObject({
      id: 'plan-2',
      status: 'rectifying',
      parallel_group_id: 'parallel-b',
    })
    expect(snapshot.dependencies[0]).toMatchObject({
      dependency_kind: 'hard',
    })
  })

  it('loads the backend acceptance summary contract without client-side aggregation', async () => {
    mocks.authFetch.mockResolvedValueOnce({
      totalCount: 7,
      passedCount: 2,
      inProgressCount: 3,
      notStartedCount: 1,
      blockedCount: 1,
      dueSoon30dCount: 2,
      keyMilestoneCount: 4,
      completionRate: 29,
    })

    const summary = await acceptanceApi.getProjectSummary('project-1')

    expect(mocks.authFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/acceptance-summary',
      {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      },
    )
    expect(summary).toMatchObject({
      totalCount: 7,
      blockedCount: 1,
      dueSoon30dCount: 2,
      keyMilestoneCount: 4,
    })
  })

  it('bypasses cache for requirement reads so the detail drawer sees the latest truth', async () => {
    mocks.authFetch.mockResolvedValueOnce([
      {
        id: 'req-1',
        plan_id: 'plan-1',
        requirement_type: 'required-doc',
        source_entity_type: 'task_condition',
        source_entity_id: 'condition-1',
        description: 'required-unsatisfied',
        status: 'met',
        is_required: true,
        is_satisfied: true,
      },
    ])

    await acceptanceApi.getPlanRequirements('plan-1')

    expect(mocks.authFetch).toHaveBeenCalledWith(
      '/api/acceptance-requirements?planId=plan-1',
      {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      },
    )
  })

  it('connects custom type management to acceptance catalog endpoints', async () => {
    mocks.authFetch
      .mockResolvedValueOnce([
        {
          id: 'catalog-1',
          project_id: 'project-1',
          catalog_code: '专项验收',
          catalog_name: '专项验收',
          phase_code: 'special_acceptance',
          scope_level: 'specialty',
          category: '专项',
          planned_finish_date: '2026-05-30',
          description: '扩展类型',
          is_system: false,
        },
      ])
      .mockResolvedValueOnce({
        id: 'catalog-2',
        project_id: 'project-1',
        catalog_code: '竣备',
        catalog_name: '竣工备案补充',
        phase_code: 'filing_archive',
        scope_level: 'project',
        category: '备案',
        planned_finish_date: '2026-06-15',
        description: '补充类型',
        is_system: false,
      })
      .mockResolvedValueOnce(undefined)

    const list = await acceptanceApi.getCustomTypes('project-1')
    const created = await acceptanceApi.createCustomType(
        {
          name: '竣工备案补充',
          shortName: '竣备',
          color: '#123456',
          icon: '验',
          phaseCode: 'filing_archive',
          scopeLevel: 'project',
          plannedFinishDate: '2026-06-15',
          category: '备案',
          defaultDependsOn: ['four_party'],
          sortOrder: 7,
        },
      'project-1',
    )
    await acceptanceApi.deleteCustomType('catalog-2')

    expect(mocks.authFetch).toHaveBeenNthCalledWith(
      1,
      '/api/acceptance-catalog?projectId=project-1',
      {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      },
    )
    expect(mocks.authFetch).toHaveBeenNthCalledWith(
      2,
      '/api/acceptance-catalog',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(JSON.parse(String(mocks.authFetch.mock.calls[1][1]?.body))).toMatchObject({
      project_id: 'project-1',
      catalog_code: '竣备',
      catalog_name: '竣工备案补充',
      phase_code: 'filing_archive',
      scope_level: 'project',
      category: '备案',
      planned_finish_date: '2026-06-15',
      description: null,
      is_system: false,
    })
    expect(mocks.authFetch).toHaveBeenNthCalledWith(
      3,
      '/api/acceptance-catalog/catalog-2',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      },
    )

    expect(list[0]).toMatchObject({
      id: 'catalog-1',
      name: '专项验收',
      shortName: '专项验收',
      isSystem: false,
      description: '扩展类型',
      phaseCode: 'special_acceptance',
      scopeLevel: 'specialty',
      plannedFinishDate: '2026-05-30',
      category: '专项',
    })
    expect(created).toMatchObject({
      id: 'catalog-2',
      name: '竣工备案补充',
      shortName: '竣备',
      color: '#123456',
      icon: '验',
      phaseCode: 'filing_archive',
      scopeLevel: 'project',
      plannedFinishDate: '2026-06-15',
      category: '备案',
      defaultDependsOn: ['four_party'],
      sortOrder: 7,
    })
  })
})
