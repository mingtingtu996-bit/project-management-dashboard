import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PlanningWorkspace from '../planning/PlanningWorkspace'
import { usePlanningStore } from '@/hooks/usePlanningStore'
import { useStore } from '@/hooks/useStore'

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function clickElement(element: Element) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  await flush()
  await flush()
}

async function waitForSelector(selector: string) {
  const deadline = Date.now() + 2000

  while (Date.now() < deadline) {
    await flush()

    if (document.body.querySelector(selector)) {
      return
    }
  }

  throw new Error(`Timed out waiting for selector: ${selector}`)
}

describe('planning shared ui contract', () => {
  const projectId = 'project-1'
  const projectName = 'Project Alpha'
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    vi.stubGlobal(
      'fetch',
      async () =>
        ({
          ok: false,
          status: 404,
          json: async () => ({ success: false }),
          text: async () => '',
        }) as Response,
    )

    useStore.setState({
      currentProject: {
        id: projectId,
        name: projectName,
        description: 'project description',
        status: 'active',
        planned_start_date: '2026-04-01',
        planned_end_date: '2026-12-31',
      } as never,
      projects: [] as never,
      tasks: [] as never,
      risks: [] as never,
      milestones: [] as never,
      conditions: [] as never,
      obstacles: [] as never,
      participantUnits: [] as never,
      scopeDimensions: [] as never,
    })

    usePlanningStore.setState({
      activeWorkspace: 'baseline',
      selectedItemIds: ['baseline-root'],
      draftStatus: 'dirty',
      validationIssues: [],
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
    } as never)

    root?.unmount()
    root = null
    container.remove()
  })

  it('keeps the shared shell, batch bar, unsaved badge, selection checkbox, and keyboard shortcuts on baseline', async () => {
    root?.render(
      <MemoryRouter initialEntries={[`/projects/${projectId}/planning/baseline`]}>
        <Routes>
          <Route path="/projects/:id/:surface/:tab" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector('[data-testid="planning-shared-shell"]')
    expect(container.querySelector('[data-testid="planning-shared-shell"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="planning-shared-batch-bar"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="planning-shared-unsaved-badge"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="planning-selection-checkbox"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="planning-keyboard-shortcuts"]')).toBeTruthy()
  })

  it('keeps the shared batch protocol on monthly and closeout surfaces', async () => {
    root?.render(
      <MemoryRouter initialEntries={[`/projects/${projectId}/planning/monthly`]}>
        <Routes>
          <Route path="/projects/:id/:surface/:tab" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector('[data-testid="planning-shared-shell"]')
    expect(container.querySelector('[data-testid="planning-shared-shell"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="planning-shared-batch-bar"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="planning-keyboard-shortcuts"]')).toBeTruthy()

    usePlanningStore.setState({
      activeWorkspace: 'monthly',
      selectedItemIds: ['closeout-1'],
      draftStatus: 'dirty',
    } as never)
    root?.unmount()
    root = createRoot(container)
    root.render(
      <MemoryRouter initialEntries={[`/projects/${projectId}/tasks/closeout`]}>
        <Routes>
          <Route path="/projects/:id/:surface/:tab" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector('[data-testid="closeout-grouped-list"]')
    expect(container.querySelector('[data-testid="planning-shared-shell"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="planning-shared-batch-bar"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="planning-selection-checkbox"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="planning-keyboard-shortcuts"]')).toBeTruthy()
  })

  it('surfaces quick and standard monthly confirm paths with a visible downgrade banner', async () => {
    root?.render(
      <MemoryRouter initialEntries={[`/projects/${projectId}/planning/monthly`]}>
        <Routes>
          <Route path="/projects/:id/:surface/:tab" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector('[data-testid="monthly-plan-exception-summary"]')
    expect(container.textContent).toContain('快速确认可用')

    const quickEntry = container.querySelector('[data-testid="monthly-plan-quick-confirm-entry"]')
    expect(quickEntry).toBeTruthy()
    await clickElement(quickEntry!)

    await waitForSelector('[data-testid="monthly-plan-confirm-dialog"]')
    expect(document.body.querySelector('[data-testid="monthly-plan-confirm-dialog"]')?.textContent ?? '').toContain(
      '快速确认路径',
    )

    root?.unmount()
    root = createRoot(container)
    root.render(
      <MemoryRouter initialEntries={[`/projects/${projectId}/planning/monthly`]}>
        <Routes>
          <Route path="/projects/:id/:surface/:tab" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector('[data-testid="monthly-plan-bottom-bar"]')
    const standardEntry = container.querySelector('[data-testid="monthly-plan-standard-confirm-entry"]')
    expect(standardEntry).toBeTruthy()
    await clickElement(standardEntry!)

    await waitForSelector('[data-testid="monthly-plan-confirm-dialog"]')
    expect(document.body.querySelector('[data-testid="monthly-plan-confirm-dialog"]')?.textContent ?? '').toContain(
      '标准确认路径',
    )
  })

  it('surfaces closeout concurrency and stale banners while keeping the drawer batch-disabled in batch mode', async () => {
    root?.render(
      <MemoryRouter initialEntries={[`/projects/${projectId}/tasks/closeout?closeout_day=7`]}>
        <Routes>
          <Route path="/projects/:id/:surface/:tab" element={<PlanningWorkspace />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForSelector('[data-testid="closeout-grouped-list"]')

    await clickElement(container.querySelector('[data-testid="closeout-item-open-closeout-4"]')!)
    await waitForSelector('[data-testid="closeout-concurrency-banner"]')
    expect(container.querySelector('[data-testid="closeout-concurrency-banner"]')).toBeTruthy()

    await clickElement(container.querySelector('[data-testid="closeout-item-open-closeout-5"]')!)
    await waitForSelector('[data-testid="closeout-stale-banner"]')
    expect(container.querySelector('[data-testid="closeout-stale-banner"]')).toBeTruthy()

    await clickElement(container.querySelector('[data-testid="closeout-item-open-closeout-6"]')!)
    await waitForSelector('[data-testid="closeout-overdue-banner"]')
    expect(container.querySelector('[data-testid="closeout-overdue-banner"]')).toBeTruthy()

    await clickElement(container.querySelector('[data-testid="closeout-batch-layer-toggle"]')!)
    await waitForSelector('[data-testid="closeout-batch-close-layer"]')
    expect(container.querySelector('[data-testid="closeout-batch-close-layer"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="closeout-detail-drawer"][aria-disabled="true"]')).toBeTruthy()
  })
})
