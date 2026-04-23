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
})
