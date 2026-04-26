import type { ReactNode } from 'react'

import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useStore } from '@/hooks/useStore'
import { usePlanningStore, type PlanningValidationIssue } from '@/hooks/usePlanningStore'
import PlanningWorkspace from '../planning/PlanningWorkspace'

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function clickAndFlush(element: { click: () => void } | null | undefined) {
  element?.click()
  await flush()
  await flush()
}

async function waitForText(container: HTMLElement, expected: string[]) {
  const deadline = Date.now() + 2500

  while (Date.now() < deadline) {
    await flush()

    const text = container.textContent || ''
    if (expected.every((item) => text.includes(item))) {
      return
    }
  }

  throw new Error(`Timed out waiting for: ${expected.join(', ')}`)
}

async function waitForSelector(container: HTMLElement, selector: string) {
  const deadline = Date.now() + 2500

  while (Date.now() < deadline) {
    await flush()

    if (container.querySelector(selector)) {
      return
    }
  }

  throw new Error(`Timed out waiting for selector: ${selector}`)
}

function findCloseoutSelectionCheckbox(container: HTMLElement, itemId: string) {
  const trigger = container.querySelector(`[data-testid="closeout-item-open-${itemId}"]`) as HTMLElement | null
  return trigger?.parentElement?.querySelector('input[data-testid="planning-selection-checkbox"]') as HTMLInputElement | null
}

function mount(node: ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  root.render(node)

  return {
    container,
    cleanup() {
      root.unmount()
      container.remove()
    },
  }
}

function RouteSearchProbe({ testId }: { testId: string }) {
  const location = useLocation()
  return <div data-testid={testId}>{`${location.pathname}${location.search}`}</div>
}

const governanceSnapshot = {
  project_id: 'project-1',
  health: {
    project_id: 'project-1',
    score: 76,
    status: 'warning',
    label: '亚健康',
    breakdown: {
      data_integrity_score: 88,
      mapping_integrity_score: 74,
      system_consistency_score: 69,
      m1_m9_score: 91,
      passive_reorder_penalty: 12,
      total_score: 76,
    },
  },
  integrity: {
    project_id: 'project-1',
    data_integrity: {
      total_tasks: 4,
      missing_participant_unit_count: 1,
      missing_scope_dimension_count: 0,
      missing_progress_snapshot_count: 1,
    },
    mapping_integrity: {
      baseline_pending_count: 2,
      baseline_merged_count: 1,
      monthly_carryover_count: 0,
    },
    system_consistency: {
      inconsistent_milestones: 1,
      stale_snapshot_count: 0,
    },
    milestone_integrity: {
      summary: {
        total: 9,
        aligned: 8,
        needs_attention: 1,
        missing_data: 0,
        blocked: 0,
      },
    },
  },
  anomaly: {
    project_id: 'project-1',
    detected_at: '2026-04-14T08:00:00.000Z',
    total_events: 10,
    windows: [
      {
        window_days: 3,
        event_count: 10,
        affected_task_count: 4,
        cumulative_event_count: 10,
        triggered: true,
        average_offset_days: 8,
        key_task_count: 3,
      },
      {
        window_days: 5,
        event_count: 10,
        affected_task_count: 4,
        cumulative_event_count: 10,
        triggered: true,
        average_offset_days: 8,
        key_task_count: 3,
      },
      {
        window_days: 7,
        event_count: 10,
        affected_task_count: 4,
        cumulative_event_count: 10,
        triggered: true,
        average_offset_days: 8,
        key_task_count: 3,
      },
    ],
  },
  alerts: [
    {
      kind: 'anomaly',
      severity: 'warning',
      title: 'Passive reorder detected',
      detail: '3d window: 10 events, 3 key tasks, average offset 8 days',
      source_id: 'project-1:anomaly',
    },
  ],
}

const validationIssues: PlanningValidationIssue[] = [
  {
    id: 'monthly-error-1',
    level: 'error',
    title: '阻断项示例',
    detail: '用于展示阻断摘要位。',
  },
  {
    id: 'monthly-warning-1',
    level: 'warning',
    title: '延期摘要示例',
    detail: '用于展示延期摘要位。',
  },
  {
    id: 'monthly-info-1',
    level: 'info',
    title: '当前条件示例',
    detail: '用于展示当前条件摘要位。',
  },
]

describe('PlanningWorkspace monthly skeleton', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)

        if (url.includes('/api/planning-governance')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: governanceSnapshot, timestamp: new Date().toISOString() }),
            text: async () => JSON.stringify({ success: true, data: governanceSnapshot }),
          } as Response
        }

        return {
          ok: false,
          status: 404,
          json: async () => ({ success: false }),
          text: async () => '',
        } as Response
      }) as typeof fetch,
    )

    useStore.setState({
      currentProject: {
        id: 'project-1',
        name: '城市中心广场项目（二期）',
        status: 'active',
      } as never,
    } as never)

    usePlanningStore.setState({
      activeWorkspace: 'monthly',
      selectedItemIds: ['baseline-root'],
      draftStatus: 'editing',
      validationIssues,
      confirmDialog: {
        open: false,
        target: null,
        title: '',
        description: '',
      },
    } as never)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useStore.setState({ currentProject: null } as never)
    usePlanningStore.setState({
      activeWorkspace: 'baseline',
      selectedItemIds: [],
      draftStatus: 'idle',
      validationIssues: [],
      confirmDialog: {
        open: false,
        target: null,
        title: '',
        description: '',
      },
    } as never)
  })

  it('shows the monthly plan shell and skeleton sections', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly']}>
        <Routes>
          <Route path="/projects/:id/:surface/*" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector(container, '[data-testid="monthly-plan-header"]')

    expect(container.querySelector('[data-testid="monthly-plan-header"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="monthly-plan-draft-panel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="monthly-plan-status-strip"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="monthly-plan-exception-summary"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="monthly-plan-exception-conditions"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="monthly-plan-exception-obstacles"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="monthly-plan-exception-delays"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="monthly-plan-bottom-bar"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="monthly-plan-quick-confirm-entry"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="monthly-plan-standard-confirm-entry"]')).toBeTruthy()

    cleanup()
  })

  it('shows the governance banner and backend-driven panels', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly']}>
        <Routes>
          <Route path="/projects/:id/:surface/*" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector(container, '[data-testid="planning-governance-banner"]')
    await waitForText(container, ['76', '3 日被动重排窗口'])

    expect(container.querySelector('[data-testid="planning-governance-banner"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="planning-health-panel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="planning-integrity-panel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="planning-anomaly-panel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="planning-governance-recheck"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="planning-governance-snooze"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="planning-governance-open-detail"]')).toBeTruthy()
    expect(container.querySelectorAll('[data-testid="planning-governance-open-detail"]').length).toBeGreaterThanOrEqual(3)
    expect(container.querySelector('[data-testid="planning-health-panel"]')?.textContent).toContain('76')
    expect(container.querySelector('[data-testid="planning-integrity-panel"]')?.textContent).toContain('Data integrity')
    expect(container.querySelector('[data-testid="planning-anomaly-panel"]')?.textContent).toContain('10 次变更')

    cleanup()
  })

  it('opens the quick monthly confirm path when quick confirmation is available', async () => {
    usePlanningStore.setState({
      selectedItemIds: ['baseline-root'],
      validationIssues: validationIssues.filter((issue) => issue.level !== 'error'),
    } as never)

    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly']}>
        <Routes>
          <Route path="/projects/:id/:surface/*" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector(container, '[data-testid="monthly-plan-quick-confirm-entry"]')

    const quickButton = container.querySelector('[data-testid="monthly-plan-quick-confirm-entry"]') as HTMLButtonElement | null
    expect(quickButton?.disabled).toBe(false)

    await clickAndFlush(quickButton)

    await waitForSelector(document.body, '[data-testid="monthly-plan-confirm-dialog"]')
    expect(document.body.querySelector('[data-testid="monthly-plan-confirm-dialog"]')).toBeTruthy()
    expect(document.body.textContent).toContain('快速确认路径')

    cleanup()
  })

  it('keeps the standard monthly confirm path when quick confirmation is not available', async () => {
    usePlanningStore.setState({
      selectedItemIds: [],
      validationIssues,
    } as never)

    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly?monthly_confirm_state=failed']}>
        <Routes>
          <Route path="/projects/:id/:surface/*" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector(container, '[data-testid="monthly-plan-standard-confirm-entry"]')

    const quickButton = container.querySelector('[data-testid="monthly-plan-quick-confirm-entry"]') as HTMLButtonElement | null
    const standardButton = container.querySelector('[data-testid="monthly-plan-standard-confirm-entry"]') as HTMLButtonElement | null

    expect(quickButton?.disabled).toBe(true)
    expect(standardButton?.disabled).toBe(false)

    await clickAndFlush(standardButton)

    await waitForSelector(document.body, '[data-testid="monthly-plan-confirm-dialog"]')
    expect(document.body.querySelector('[data-testid="monthly-plan-confirm-dialog"]')).toBeTruthy()
    expect(document.body.textContent).toContain('确认失败')

    const confirmButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('确认月度计划')
    ) as HTMLButtonElement | undefined
    expect(confirmButton?.disabled).toBe(true)

    cleanup()
  })

  it('opens the revision pool dialog and closes the revision action loop with deep-link context', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/revision-pool']}>
        <Routes>
          <Route path="/projects/:id/:surface/*" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector(container, '[data-testid="baseline-revision-source-entry"]')

    const sourceEntry = container.querySelector('[data-testid="baseline-revision-source-entry"]') as HTMLButtonElement | null
    expect(sourceEntry).toBeTruthy()

    await clickAndFlush(sourceEntry)

    await waitForSelector(document.body, '[data-testid="baseline-revision-pool-dialog"]')
    expect(document.body.querySelector('[data-testid="baseline-revision-pool-dialog"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="baseline-revision-candidate-list"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="baseline-revision-candidate-item"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="baseline-revision-basket"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="baseline-revision-action-bar"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="baseline-revision-add-to-basket"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="baseline-revision-mark-deferred"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="baseline-revision-enter-draft"]')).toBeTruthy()

    const addButton = document.body.querySelector('[data-testid="baseline-revision-add-to-basket"]') as HTMLButtonElement | null
    await clickAndFlush(addButton)

    expect(document.body.querySelector('[data-testid="baseline-revision-basket"]')?.textContent).toContain(
      governanceSnapshot.alerts[0].title
    )

    const deferredButton = document.body.querySelector('[data-testid="baseline-revision-mark-deferred"]') as HTMLButtonElement | null
    await clickAndFlush(deferredButton)

    expect(document.body.querySelector('[data-testid="baseline-revision-deferred-reason"]')).toBeTruthy()
    expect((document.body.querySelector('[data-testid="baseline-revision-deferred-reason"]') as HTMLTextAreaElement | null)?.value).toContain('等待上游确认')

    const enterDraftButton = document.body.querySelector('[data-testid="baseline-revision-enter-draft"]') as HTMLButtonElement | null
    await clickAndFlush(enterDraftButton)

    await waitForSelector(container, '[data-testid="baseline-revision-deeplink-context"]')
    expect(container.querySelector('[data-testid="baseline-revision-deeplink-context"]')).toBeTruthy()
    expect(container.textContent).toContain(governanceSnapshot.alerts[0].title)
    expect(container.textContent).toContain('等待上游确认')

    cleanup()
  })

  it('opens the shared planning quick links for task chain and change logs', async () => {
    const mountWorkspace = () =>
      mount(
        <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
          <Routes>
            <Route path="/projects/:id/:surface/*" element={<PlanningWorkspace />} />
            <Route path="/projects/:id/gantt" element={<RouteSearchProbe testId="planning-route-probe" />} />
            <Route path="/projects/:id/reports" element={<RouteSearchProbe testId="planning-route-probe" />} />
          </Routes>
        </MemoryRouter>,
      )

    let view = mountWorkspace()

    await waitForSelector(view.container, '[data-testid="planning-governance-quick-links"]')
    expect(view.container.querySelector('[data-testid="planning-quick-link-risks"]')).toBeTruthy()
    expect(view.container.querySelector('[data-testid="planning-quick-link-closeout"]')).toBeTruthy()

    await clickAndFlush(view.container.querySelector('[data-testid="planning-quick-link-gantt"]') as HTMLButtonElement | null)
    await waitForSelector(view.container, '[data-testid="planning-route-probe"]')
    expect(view.container.querySelector('[data-testid="planning-route-probe"]')?.textContent).toContain('/projects/project-1/gantt')
    view.cleanup()

    view = mountWorkspace()

    await waitForSelector(view.container, '[data-testid="planning-quick-link-change-log"]')
    await clickAndFlush(view.container.querySelector('[data-testid="planning-quick-link-change-log"]') as HTMLButtonElement | null)
    await waitForSelector(view.container, '[data-testid="planning-route-probe"]')
    expect(view.container.querySelector('[data-testid="planning-route-probe"]')?.textContent).toContain(
      '/projects/project-1/reports?view=change_log',
    )
    view.cleanup()
  })

  it('renders the closeout shell and keeps the force-close path available while surfacing remaining items', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/tasks/closeout']}>
        <Routes>
          <Route path="/projects/:id/:surface/*" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector(container, '[data-testid="closeout-header"]')

    expect(container.querySelector('[data-testid="closeout-header"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="closeout-progress"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="closeout-grouped-list"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="closeout-group-header"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="planning-shared-batch-bar"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="closeout-detail-drawer"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="closeout-force-close-entry"]')).toBeTruthy()

    const forceButton = container.querySelector('[data-testid="closeout-force-close-entry"]') as HTMLButtonElement | null
    await clickAndFlush(forceButton)

    await waitForSelector(document.body, '[data-testid="closeout-confirm-dialog"]')
    expect(document.body.querySelector('[data-testid="closeout-confirm-dialog"]')).toBeTruthy()
    expect((document.body.querySelector('[data-testid="closeout-confirm-confirm"]') as HTMLButtonElement | null)?.disabled).toBe(false)
    expect(document.body.textContent).toContain('4 项未处理')

    cleanup()
  })

  it('processes a single closeout item without jumping to the next month draft', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/tasks/closeout']}>
        <Routes>
          <Route path="/projects/:id/:surface/*" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector(container, '[data-testid="closeout-header"]')

    const item = container.querySelector('[data-testid="closeout-item-open-closeout-3"]') as HTMLButtonElement | null
    await clickAndFlush(item)

    const singleProcess = container.querySelector('[data-testid="closeout-single-process-entry"]') as HTMLButtonElement | null
    await clickAndFlush(singleProcess)

    await waitForText(container, ['已处理'])
    expect(container.querySelector('[data-testid="closeout-item-open-closeout-3"]')?.textContent).toContain('已处理')
    expect(document.body.querySelector('[data-testid="closeout-confirm-dialog"]')).toBeFalsy()

    cleanup()
  })

  it('switches the closeout reason branch and reveals the batch layer', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/tasks/closeout']}>
        <Routes>
          <Route path="/projects/:id/:surface/*" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector(container, '[data-testid="closeout-reason-cascader"]')

    const manualBranch = container.querySelector('[data-testid="closeout-reason-branch-manual"]') as HTMLButtonElement | null
    await clickAndFlush(manualBranch)

    const checkbox = findCloseoutSelectionCheckbox(container, 'closeout-4')
    await clickAndFlush(checkbox)

    expect(usePlanningStore.getState().selectedItemIds).toContain('closeout-4')

    const batchButton = container.querySelector('[data-testid="closeout-batch-close-entry"]') as HTMLButtonElement | null
    await clickAndFlush(batchButton)

    await waitForSelector(document.body, '[data-testid="closeout-batch-close-layer"]')
    expect(document.body.querySelector('[data-testid="closeout-batch-close-layer"]')).toBeTruthy()

    const batchProcess = document.body.querySelector('[data-testid="closeout-batch-process-entry"]') as HTMLButtonElement | null
    await clickAndFlush(batchProcess)

    expect(usePlanningStore.getState().selectedItemIds).toHaveLength(0)
    expect(container.querySelector('[data-testid="closeout-item-open-closeout-4"]')?.textContent).toContain('已处理')

    cleanup()
  })

  it('shows generation failure state without clearing the closeout draft', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/tasks/closeout?closeout_confirm_state=failed']}>
        <Routes>
          <Route path="/projects/:id/:surface/*" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector(container, '[data-testid="closeout-header"]')

    const staleItem = container.querySelector('[data-testid="closeout-item-open-closeout-5"]') as HTMLButtonElement | null
    await clickAndFlush(staleItem)

    const forceButton = container.querySelector('[data-testid="closeout-force-close-entry"]') as HTMLButtonElement | null
    await clickAndFlush(forceButton)

    await waitForSelector(document.body, '[data-testid="closeout-confirm-dialog"]')
    expect(document.body.querySelector('[data-testid="closeout-confirm-retry"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="closeout-confirm-confirm"]')).toBeTruthy()
    expect((document.body.querySelector('[data-testid="closeout-confirm-confirm"]') as HTMLButtonElement | null)?.disabled).toBe(true)
    expect(container.querySelector('[data-testid="closeout-detail-drawer"]')).toBeTruthy()

    cleanup()
  })

  it('processes all remaining closeout items and jumps to the next month draft after confirm', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/tasks/closeout']}>
        <Routes>
          <Route path="/projects/:id/:surface/*" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector(container, '[data-testid="closeout-header"]')

    for (const itemId of ['closeout-3', 'closeout-4', 'closeout-5', 'closeout-6']) {
      const checkbox = findCloseoutSelectionCheckbox(container, itemId)
      await clickAndFlush(checkbox)
    }

    const batchEntry = container.querySelector('[data-testid="closeout-batch-close-entry"]') as HTMLButtonElement | null
    await clickAndFlush(batchEntry)

    await waitForSelector(document.body, '[data-testid="closeout-batch-close-layer"]')
    const batchProcess = document.body.querySelector('[data-testid="closeout-batch-process-entry"]') as HTMLButtonElement | null
    await clickAndFlush(batchProcess)

    expect(container.querySelector('[data-testid="closeout-progress"]')?.textContent).toContain('6/6')

    const forceButton = container.querySelector('[data-testid="closeout-force-close-entry"]') as HTMLButtonElement | null
    await clickAndFlush(forceButton)

    await waitForSelector(document.body, '[data-testid="closeout-confirm-dialog"]')
    const confirmButton = document.body.querySelector('[data-testid="closeout-confirm-confirm"]') as HTMLButtonElement | null
    expect(confirmButton?.disabled).toBe(false)

    await clickAndFlush(confirmButton)

    await waitForSelector(container, '[data-testid="closeout-complete-banner"]')
    expect(container.querySelector('[data-testid="closeout-complete-banner"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="monthly-plan-header"]')).toBeTruthy()

    cleanup()
  })

  it('surfaces concurrency, stale, and overdue banners in the detail drawer', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/tasks/closeout']}>
        <Routes>
          <Route path="/projects/:id/:surface/*" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector(container, '[data-testid="closeout-detail-drawer"]')

    const concurrencyItem = container.querySelector('[data-testid="closeout-item-open-closeout-4"]') as HTMLButtonElement | null
    await clickAndFlush(concurrencyItem)
    expect(container.querySelector('[data-testid="closeout-concurrency-banner"]')).toBeTruthy()

    const staleItem = container.querySelector('[data-testid="closeout-item-open-closeout-5"]') as HTMLButtonElement | null
    await clickAndFlush(staleItem)
    expect(container.querySelector('[data-testid="closeout-stale-banner"]')).toBeTruthy()

    const overdueItem = container.querySelector('[data-testid="closeout-item-open-closeout-6"]') as HTMLButtonElement | null
    await clickAndFlush(overdueItem)
    expect(container.querySelector('[data-testid="closeout-overdue-banner"]')).toBeTruthy()

    cleanup()
  })
})
