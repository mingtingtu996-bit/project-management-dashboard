import { fireEvent } from '@testing-library/react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AcceptanceTimeline from '../AcceptanceTimeline'
import { useStore } from '@/hooks/useStore'

const state = vi.hoisted(() => {
  type PlanRow = {
    id: string
    project_id: string
    milestone_id: string
    type_id: string
    type_name: string
    type_color: string
    name: string
    description: string
    planned_date: string | null
    actual_date: string | null
    status: 'draft' | 'preparing' | 'ready_to_submit' | 'submitted' | 'inspecting' | 'rectifying' | 'passed' | 'archived'
    predecessor_plan_ids: string[]
    successor_plan_ids: string[]
    phase_code: string
    phase_order: number
    display_badges: string[]
    is_system: boolean
    created_at: string
    updated_at: string
  }

  type DependencyRow = {
    id: string
    project_id: string
    source_plan_id: string
    target_plan_id: string
    dependency_kind: 'hard' | 'soft'
    status: string
    created_at: string
    updated_at: string
  }

  type RequirementRow = {
    id: string
    plan_id: string
    requirement_type: string
    source_entity_type: string
    source_entity_id: string
    description: string | null
    status: string
    is_required: boolean
    is_satisfied: boolean
  }

  const plans: PlanRow[] = []
  const dependencies: DependencyRow[] = []
  const requirements: RequirementRow[] = []

  const clonePlans = () =>
    plans.map((plan) => ({
      ...plan,
      predecessor_plan_ids: [...plan.predecessor_plan_ids],
      successor_plan_ids: [...plan.successor_plan_ids],
      display_badges: [...plan.display_badges],
    }))

  const reset = () => {
    plans.splice(
      0,
      plans.length,
      {
        id: 'plan-source',
        project_id: 'project-1',
        milestone_id: 'milestone-source',
        type_id: 'pre_acceptance',
        type_name: 'Pre Acceptance',
        type_color: 'bg-slate-500',
        name: 'Plan Alpha',
        description: 'Source plan',
        planned_date: '2026-04-01',
        actual_date: null,
        status: 'draft',
        predecessor_plan_ids: [],
        successor_plan_ids: [],
        phase_code: 'phase1',
        phase_order: 1,
        display_badges: [],
        is_system: false,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'plan-target',
        project_id: 'project-1',
        milestone_id: 'milestone-target',
        type_id: 'four_party',
        type_name: 'Four Party',
        type_color: 'bg-blue-500',
        name: 'Plan Beta',
        description: 'Target plan',
        planned_date: '2026-04-02',
        actual_date: null,
        status: 'draft',
        predecessor_plan_ids: [],
        successor_plan_ids: [],
        phase_code: 'phase1',
        phase_order: 2,
        display_badges: [],
        is_system: false,
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      },
      {
        id: 'plan-blocked',
        project_id: 'project-1',
        milestone_id: 'milestone-blocked',
        type_id: 'fire',
        type_name: 'Fire',
        type_color: 'bg-rose-500',
        name: 'Plan Gamma',
        description: 'Blocked plan',
        planned_date: null,
        actual_date: null,
        status: 'draft',
        predecessor_plan_ids: ['plan-source'],
        successor_plan_ids: [],
        phase_code: 'phase1',
        phase_order: 3,
        display_badges: ['受阻', '前置未满足'],
        is_system: false,
        created_at: '2026-04-03T00:00:00.000Z',
        updated_at: '2026-04-03T00:00:00.000Z',
      },
    )
    dependencies.splice(0, dependencies.length)
    requirements.splice(0, requirements.length)
  }

  const getBundle = (planId: string) => ({
    requirements: requirements
      .filter((item) => item.plan_id === planId)
      .map((item) => ({ ...item })),
    dependencies: dependencies.filter((item) => item.target_plan_id === planId),
    records: [],
    linkedWarnings: [],
    linkedIssues: [],
    linkedRisks: [],
  })

  return {
    plans,
    dependencies,
    requirements,
    clonePlans,
    reset,
    getBundle,
  }
})

vi.mock('@/services/acceptanceApi', () => ({
  acceptanceApi: {
    getPlans: vi.fn(async () => state.clonePlans()),
    getFlowSnapshot: vi.fn(async () => ({
      catalogs: [],
      plans: state.clonePlans(),
      dependencies: [...state.dependencies],
      requirements: state.requirements.map((item) => ({ ...item })),
      records: [],
    })),
    getProjectSummary: vi.fn(async () => ({
      totalCount: state.plans.length,
      passedCount: state.plans.filter((plan) => plan.status === 'passed' || plan.status === 'archived').length,
      inProgressCount: state.plans.filter((plan) => ['preparing', 'ready_to_submit', 'submitted', 'inspecting'].includes(plan.status)).length,
      notStartedCount: state.plans.filter((plan) => plan.status === 'draft').length,
      blockedCount: state.plans.filter((plan) => plan.display_badges.includes('受阻')).length,
      dueSoon30dCount: 0,
      keyMilestoneCount: state.plans.filter((plan) => Boolean(plan.milestone_id)).length,
      completionRate: 0,
    })),
    getCustomTypes: vi.fn(async () => []),
    getPlanRelationBundle: vi.fn(async (_projectId: string, planId: string) => state.getBundle(planId)),
    getPlanRequirements: vi.fn(async () => []),
    getPlanDependencies: vi.fn(async (planId: string) =>
      state.dependencies.filter((item) => item.target_plan_id === planId),
    ),
    getPlanRecords: vi.fn(async () => []),
    getProjectWarnings: vi.fn(async () => []),
    getProjectIssues: vi.fn(async () => []),
    getProjectRisks: vi.fn(async () => []),
    addDependency: vi.fn(async (_projectId: string, planId: string, dependsOnId: string) => {
      const exists = state.dependencies.some(
        (item) => item.source_plan_id === dependsOnId && item.target_plan_id === planId,
      )
      if (!exists) {
        state.dependencies.push({
          id: `${dependsOnId}-${planId}`,
          project_id: 'project-1',
          source_plan_id: dependsOnId,
          target_plan_id: planId,
          dependency_kind: 'hard',
          status: 'active',
          created_at: '2026-04-15T00:00:00.000Z',
          updated_at: '2026-04-15T00:00:00.000Z',
        })
      }

      const target = state.plans.find((plan) => plan.id === planId)
      if (target && !target.predecessor_plan_ids.includes(dependsOnId)) {
        target.predecessor_plan_ids = [...target.predecessor_plan_ids, dependsOnId]
      }
    }),
    removeDependency: vi.fn(async (planId: string, dependsOnId: string) => {
      const index = state.dependencies.findIndex(
        (item) => item.source_plan_id === dependsOnId && item.target_plan_id === planId,
      )
      if (index !== -1) {
        state.dependencies.splice(index, 1)
      }

      const target = state.plans.find((plan) => plan.id === planId)
      if (target) {
        target.predecessor_plan_ids = target.predecessor_plan_ids.filter((id) => id !== dependsOnId)
      }
    }),
    createPlanRequirement: vi.fn(async (_projectId: string, planId: string, input: any) => {
      const created = {
        id: `requirement-${state.requirements.length + 1}`,
        plan_id: planId,
        requirement_type: String(input.requirement_type ?? ''),
        source_entity_type: String(input.source_entity_type ?? ''),
        source_entity_id: String(input.source_entity_id ?? ''),
        description: input.description == null ? null : String(input.description),
        status: String(input.status ?? 'open'),
        is_required: true,
        is_satisfied: false,
      }
      state.requirements.push(created)
      return created
    }),
    createPlanRecord: vi.fn(async () => undefined),
    updateStatus: vi.fn(async () => undefined),
    createCustomType: vi.fn(async () => ({ id: 'type-1' })),
    deleteCustomType: vi.fn(async () => undefined),
    createPlan: vi.fn(async () => ({ id: 'plan-new' })),
  },
}))

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await act(async () => {
      await flush()
    })
    if (predicate()) return
  }
  throw new Error('Timed out waiting for condition')
}

describe('AcceptanceTimeline dependency sync', () => {
  const projectId = 'project-1'
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    state.reset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useStore.setState({
      currentProject: {
        id: projectId,
        name: 'Project One',
      } as never,
      projects: [],
      warnings: [],
      issueRows: [],
      problemRows: [],
      sharedSliceStatus: {
        notifications: { loading: false, error: null },
        warnings: { loading: false, error: null },
        issueRows: { loading: false, error: null },
        problemRows: { loading: false, error: null },
      },
    } as never)
    window.sessionStorage.setItem(`acceptanceView:${projectId}`, 'graph')
  })

  afterEach(() => {
    root?.unmount()
    container.remove()
    root = null
    window.sessionStorage.clear()
    useStore.setState({ currentProject: null } as never)
  })

  it('keeps flow-board, ledger, and detail bundle aligned when dependencies are created and removed', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/acceptance`]}>
          <Routes>
            <Route path="/projects/:id/acceptance" element={<AcceptanceTimeline />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitFor(() => Boolean(document.querySelector('[data-testid="acceptance-flow-board"]')))
    expect(document.querySelector('[data-testid="graph-state"]')).toBeNull()
    expect(document.querySelector('[data-testid="acceptance-flow-connectors"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="acceptance-flow-card-plan-blocked"]')?.textContent || '').toContain('待排期')
    expect(document.querySelector('[data-testid="acceptance-flow-card-plan-blocked"]')?.textContent || '').toContain('阻塞')
    expect(document.querySelector('[data-testid="acceptance-flow-card-plan-blocked"]')?.textContent || '').toContain('上游依赖')

    act(() => {
      const targetCard = document.querySelector('[data-testid="acceptance-flow-card-plan-target"]') as
        | HTMLButtonElement
        | null
      targetCard?.click()
    })

    await waitFor(() => Boolean(document.querySelector('[data-testid="acceptance-detail-drawer"]')))
    expect(document.querySelector('[data-testid="acceptance-flow-card-plan-target"]')?.getAttribute('data-selected')).toBe('true')
    expect(document.querySelector('[data-testid="acceptance-flow-card-plan-source"]')?.getAttribute('data-upstream')).toBe('false')
    expect(document.querySelector('[data-testid="acceptance-flow-card-plan-blocked"]')?.getAttribute('data-dimmed')).toBe('true')
    expect(state.dependencies.length).toBe(0)
    expect(document.querySelector('[data-testid^="acceptance-remove-dependency-"]')).toBeNull()

    act(() => {
      const listToggle = document.querySelector('[data-testid="acceptance-view-list"]') as HTMLButtonElement | null
      listToggle?.click()
    })

    await waitFor(() => Boolean(document.querySelector('[data-testid="acceptance-list-row-plan-target"]')))
    expect(document.querySelector('[data-testid="acceptance-detail-drawer"]')).toBeTruthy()
    expect(document.body.textContent || '').toContain('Plan Beta')

    act(() => {
      const addButton = document.querySelector('[data-testid="acceptance-add-dependency"]') as HTMLButtonElement | null
      addButton?.click()
    })

    await waitFor(() => state.dependencies.length === 1)
    await waitFor(() => Boolean(document.querySelector('[data-testid^="acceptance-remove-dependency-"]')))
    expect(state.plans.find((plan) => plan.id === 'plan-target')?.predecessor_plan_ids).toEqual(['plan-source'])

    act(() => {
      const graphToggle = document.querySelector('[data-testid="acceptance-view-graph"]') as HTMLButtonElement | null
      graphToggle?.click()
    })

    await waitFor(() => Boolean(document.querySelector('[data-testid="acceptance-flow-edge-plan-source->plan-target"]')))
    expect(document.querySelector('[data-testid="acceptance-flow-card-plan-target"]')?.getAttribute('data-selected')).toBe('true')
    expect(document.querySelector('[data-testid="acceptance-flow-card-plan-source"]')?.getAttribute('data-upstream')).toBe('true')

    act(() => {
      const targetRow = document.querySelector('[data-testid="acceptance-list-row-plan-target"]') as
        | HTMLButtonElement
        | null
      targetRow?.click()
    })

    await waitFor(() => Boolean(document.querySelector('[data-testid="acceptance-detail-drawer"]')))
    await waitFor(() => Boolean(document.querySelector('[data-testid^="acceptance-remove-dependency-"]')))

    act(() => {
      const removeButton = document.querySelector('[data-testid="acceptance-remove-dependency-plan-source-plan-target"]') as
        | HTMLButtonElement
        | null
      removeButton?.click()
    })

    await waitFor(() => state.dependencies.length === 0)
    await waitFor(() => !document.querySelector('[data-testid^="acceptance-remove-dependency-"]'))
    expect(state.plans.find((plan) => plan.id === 'plan-target')?.predecessor_plan_ids).toEqual([])

    act(() => {
      const graphToggle = document.querySelector('[data-testid="acceptance-view-graph"]') as HTMLButtonElement | null
      graphToggle?.click()
    })

    await waitFor(() => Boolean(document.querySelector('[data-testid="acceptance-flow-board"]')))
    expect(document.querySelector('[data-testid="acceptance-flow-edge-plan-source->plan-target"]')).toBeNull()
  })

  it('refreshes the detail bundle after creating a requirement from the ledger drawer', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/acceptance`]}>
          <Routes>
            <Route path="/projects/:id/acceptance" element={<AcceptanceTimeline />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitFor(() => Boolean(document.querySelector('[data-testid="acceptance-view-list"]')))

    act(() => {
      const listToggle = document.querySelector('[data-testid="acceptance-view-list"]') as HTMLButtonElement | null
      listToggle?.click()
    })

    await waitFor(() => Boolean(document.querySelector('[data-testid="acceptance-list-row-plan-target"]')))

    act(() => {
      const targetRow = document.querySelector('[data-testid="acceptance-list-row-plan-target"]') as HTMLButtonElement | null
      targetRow?.click()
    })

    await waitFor(() => Boolean(document.querySelector('[data-testid="acceptance-detail-drawer"]')))

    const requirementTypeInput = document.querySelector('input[placeholder="external / drawing / task_condition"]') as HTMLInputElement | null
    const sourceTypeInput = document.querySelector('input[placeholder="task_condition"]') as HTMLInputElement | null
    const sourceIdInput = document.querySelector('input[placeholder="condition-1"]') as HTMLInputElement | null
    const descriptionInput = document.querySelector('textarea[placeholder="补充内容"]') as HTMLTextAreaElement | null
    const sourceId = 'sync-created-requirement'

    expect(requirementTypeInput).toBeTruthy()
    expect(sourceTypeInput).toBeTruthy()
    expect(sourceIdInput).toBeTruthy()
    expect(descriptionInput).toBeTruthy()

    act(() => {
      fireEvent.change(requirementTypeInput!, { target: { value: 'external' } })
      fireEvent.change(sourceTypeInput!, { target: { value: 'task_condition' } })
      fireEvent.change(sourceIdInput!, { target: { value: sourceId } })
      fireEvent.change(descriptionInput!, { target: { value: 'created from drawer' } })
    })

    act(() => {
      const addButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('新增条件')) as HTMLButtonElement | undefined
      addButton?.click()
    })

    await waitFor(() => (document.body.textContent || '').includes(sourceId))
    expect(state.requirements).toHaveLength(1)
    expect(state.requirements[0]).toMatchObject({
      plan_id: 'plan-target',
      source_entity_id: sourceId,
      description: 'created from drawer',
    })
  })
})
