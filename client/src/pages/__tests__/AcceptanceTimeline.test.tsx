import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import AcceptanceTimeline from '../AcceptanceTimeline'
import { acceptanceApi } from '@/services/acceptanceApi'
import { useStore } from '@/hooks/useStore'

vi.mock('@/services/acceptanceApi', () => ({
  acceptanceApi: {
    getPlans: vi.fn(async () => []),
    getFlowSnapshot: vi.fn(async () => ({
      catalogs: [],
      plans: [
        {
          id: 'plan-1',
          project_id: 'project-1',
          milestone_id: 'milestone-1',
          type_id: 'pre_acceptance',
          type_name: 'Pre Acceptance',
          type_color: 'bg-purple-500',
          name: 'Plan A',
          description: 'Acceptance item A',
          planned_date: '2026-04-01',
          actual_date: null,
          status: 'draft',
          phase_code: 'phase1',
          phase_order: 1,
          predecessor_plan_ids: [],
          successor_plan_ids: [],
          display_badges: ['自定义', '临期'],
          overlay_tags: ['自定义', '临期'],
          is_system: false,
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        },
      ],
      dependencies: [],
      requirements: [],
      records: [],
    })),
    getProjectSummary: vi.fn(async () => ({
      totalCount: 1,
      passedCount: 0,
      inProgressCount: 0,
      notStartedCount: 1,
      blockedCount: 0,
      dueSoon30dCount: 1,
      keyMilestoneCount: 1,
      completionRate: 0,
    })),
    getCustomTypes: vi.fn(async () => []),
    getPlanRequirements: vi.fn(async () => []),
    getPlanDependencies: vi.fn(async () => []),
    getPlanRecords: vi.fn(async () => []),
    getProjectWarnings: vi.fn(async () => []),
    getProjectIssues: vi.fn(async () => []),
    getProjectRisks: vi.fn(async () => []),
    getPlanRelationBundle: vi.fn(async () => ({
      requirements: [
        {
          id: 'req-1',
          plan_id: 'plan-1',
          requirement_type: 'external',
          source_entity_type: 'warning',
          source_entity_id: 'warning-1',
          description: 'Collect docs',
          status: 'open',
          is_required: true,
          is_satisfied: false,
        },
      ],
      dependencies: [
        {
          id: 'dep-1',
          project_id: 'project-1',
          source_plan_id: 'plan-source',
          target_plan_id: 'plan-1',
          dependency_kind: 'hard',
          status: 'active',
        },
      ],
      records: [
        {
          id: 'rec-1',
          plan_id: 'plan-1',
          record_type: 'note',
          content: 'Received file',
          operator: 'Alice',
          record_date: '2026-04-10',
          attachments: [],
        },
      ],
      linkedWarnings: [
        {
          id: 'warning-1',
          task_id: 'milestone-1',
          warning_type: 'condition_due',
          warning_level: 'critical',
          title: 'Warning A',
          description: 'Warning detail',
          is_acknowledged: false,
        },
      ],
      linkedIssues: [
        {
          id: 'issue-1',
          task_id: null,
          title: 'Issue A',
          description: 'Issue detail',
          severity: 'high',
          status: 'open',
          source_type: 'manual',
          source_id: 'plan-1',
          source_entity_type: 'acceptance_plan',
          source_entity_id: 'plan-1',
          chain_id: null,
          pending_manual_close: false,
        },
      ],
      linkedRisks: [
        {
          id: 'risk-1',
          task_id: null,
          title: 'Risk A',
          description: 'Risk detail',
          level: 'high',
          status: 'identified',
          source_type: 'manual',
          source_id: 'plan-1',
          source_entity_type: 'acceptance_plan',
          source_entity_id: 'plan-1',
          chain_id: null,
          linked_issue_id: null,
          pending_manual_close: false,
          closed_reason: null,
          closed_at: null,
        },
      ],
    })),
    updatePosition: vi.fn(async () => undefined),
    addDependency: vi.fn(async () => undefined),
    removeDependency: vi.fn(async () => undefined),
    createPlanRequirement: vi.fn(async () => undefined),
    createPlanRecord: vi.fn(async () => undefined),
    updateStatus: vi.fn(async () => undefined),
    createCustomType: vi.fn(async (type: Record<string, unknown>) => ({ id: 'type-1', ...type })),
    deleteCustomType: vi.fn(async () => undefined),
    createPlan: vi.fn(async (plan: Record<string, unknown>) => ({ id: 'plan-1', ...plan })),
  },
}))

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    canEdit: true,
    canManageTeam: true,
    loading: false,
    permissionLevel: 'editor',
    globalRole: 'admin',
  }),
}))

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitFor(predicate: () => boolean, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await act(async () => {
      await flush()
    })
    if (predicate()) return
  }
  throw new Error('Timed out waiting for condition')
}

describe('AcceptanceTimeline linked data', () => {
  const projectId = 'project-1'
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useStore.setState({
      currentProject: {
        id: projectId,
        name: 'Demo Project',
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
    window.sessionStorage.setItem(`acceptanceView:${projectId}`, 'list')
  })

  afterEach(() => {
    root?.unmount()
    container.remove()
    root = null
    window.sessionStorage.clear()
    useStore.setState({ currentProject: null } as never)
  })

  it('shows linked warnings, issues, risks and prerequisites in the detail drawer', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/acceptance`]}>
          <Routes>
            <Route path="/projects/:id/acceptance" element={<AcceptanceTimeline />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitFor(() => Boolean(document.querySelector('[data-testid="acceptance-list-row-plan-1"]')))

    act(() => {
      const row = document.querySelector('[data-testid="acceptance-list-row-plan-1"]') as HTMLButtonElement | null
      row?.click()
    })

    await waitFor(() => Boolean(document.querySelector('[data-testid="acceptance-detail-drawer"]')))
    expect(document.querySelector('[data-testid="acceptance-external-prerequisites"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="acceptance-records"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="linked-warnings"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="linked-issues"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="linked-risks"]')).toBeTruthy()

    const text = document.body.textContent || ''
    expect(text).toContain('Collect docs')
    expect(text).toContain('Received file')
    expect(text).toContain('Warning A')
    expect(text).toContain('Issue A')
    expect(text).toContain('Risk A')
  })

  it('disables submit when required acceptance conditions are not yet satisfied', async () => {
    vi.mocked(acceptanceApi.getFlowSnapshot).mockResolvedValueOnce({
      catalogs: [],
      plans: [
        {
          id: 'plan-submit',
          project_id: 'project-1',
          milestone_id: 'milestone-1',
          type_id: 'completion_record',
          type_name: 'Completion Record',
          type_color: 'bg-blue-500',
          name: 'Ready To Submit Plan',
          description: 'submit guard',
          planned_date: '2026-04-01',
          actual_date: null,
          status: 'ready_to_submit',
          phase_code: 'phase1',
          phase_order: 1,
          predecessor_plan_ids: [],
          successor_plan_ids: [],
          display_badges: [],
          overlay_tags: [],
          is_system: false,
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        },
      ],
      dependencies: [],
      requirements: [],
      records: [],
    })
    vi.mocked(acceptanceApi.getPlanRelationBundle).mockResolvedValueOnce({
      requirements: [
        {
          id: 'req-submit-1',
          plan_id: 'plan-submit',
          requirement_type: 'required-doc',
          source_entity_type: 'task_condition',
          source_entity_id: 'condition-1',
          description: 'required-unsatisfied',
          status: 'open',
          is_required: true,
          is_satisfied: false,
        },
      ],
      dependencies: [],
      records: [],
      linkedWarnings: [],
      linkedIssues: [],
      linkedRisks: [],
    })

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/acceptance`]}>
          <Routes>
            <Route path="/projects/:id/acceptance" element={<AcceptanceTimeline />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitFor(() => Boolean(document.querySelector('[data-testid="acceptance-list-row-plan-submit"]')))

    act(() => {
      const row = document.querySelector('[data-testid="acceptance-list-row-plan-submit"]') as HTMLButtonElement | null
      row?.click()
    })

    await waitFor(() => Boolean(document.querySelector('[data-testid="acceptance-detail-drawer"]')))
    await waitFor(() => (document.body.textContent || '').includes('必填验收条件未满足'))

    const submitButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('提交申报')) as HTMLButtonElement | undefined
    expect(submitButton).toBeTruthy()
    expect(submitButton?.disabled).toBe(true)
    expect(document.body.textContent || '').toContain('required-unsatisfied')
    expect(acceptanceApi.updateStatus).not.toHaveBeenCalled()
  })

  it('uses flow board as graph container and keeps unknown status safe in drawer', async () => {
    window.sessionStorage.setItem(`acceptanceView:${projectId}`, 'graph')

    vi.mocked(acceptanceApi.getFlowSnapshot).mockResolvedValueOnce({
      catalogs: [],
      plans: [
        {
          id: 'plan-compat',
          project_id: 'project-1',
          milestone_id: 'milestone-1',
          type_id: 'pre_acceptance',
          type_name: 'Compatibility',
          type_color: 'bg-purple-500',
          name: 'Compatibility Plan',
          description: 'status compatibility guard',
          planned_date: '2026-04-01',
          actual_date: null,
          status: 'legacy_unknown' as any,
          phase_code: 'phase1',
          phase_order: 1,
          predecessor_plan_ids: [],
          successor_plan_ids: [],
          display_badges: ['自定义', '前置未满足'],
          overlay_tags: ['自定义', '前置未满足'],
          is_system: false,
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        },
      ],
      dependencies: [],
      requirements: [],
      records: [],
    })

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

    act(() => {
      const flowCard = document.querySelector('[data-testid="acceptance-flow-card-plan-compat"]') as
        | HTMLButtonElement
        | null
      flowCard?.click()
    })

    await waitFor(() => Boolean(document.querySelector('[data-testid="acceptance-detail-drawer"]')))
    await waitFor(() => Boolean(document.querySelector('[data-testid="acceptance-detail-status"]')))
    expect(document.querySelector('[data-testid="acceptance-flow-card-plan-compat"]')?.getAttribute('data-selected')).toBe('true')
    expect(document.querySelector('[data-testid="acceptance-flow-card-plan-compat"]')?.getAttribute('data-related')).toBe('true')
    expect(document.body.textContent).toContain('前置未满足')

    const statusBadge = document.querySelector('[data-testid="acceptance-detail-status"]')
    expect(statusBadge).toBeTruthy()
    expect((statusBadge?.textContent || '').trim().length).toBeGreaterThan(0)
  })
})
