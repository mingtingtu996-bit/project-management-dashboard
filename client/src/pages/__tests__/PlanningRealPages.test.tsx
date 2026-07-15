import type { ReactNode } from 'react'

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePlanningStore } from '@/hooks/usePlanningStore'
import { useStore } from '@/hooks/useStore'
import { apiGet, apiPost, getApiErrorMessage } from '@/lib/apiClient'
import type { BaselineVersion, MonthlyPlanVersion, PlanningDraftLockRecord } from '@/types/planning'
import type { Task, TaskCondition, TaskObstacle } from '@/pages/GanttViewTypes'

vi.mock('@/lib/apiClient', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  getAuthToken: vi.fn(() => null),
  getApiErrorMessage: vi.fn(),
}))

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    canEdit: true,
    canManageTeam: true,
    globalRole: 'company_admin',
    isOwner: true,
    loading: false,
    permissionLevel: 'owner',
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
    dismiss: vi.fn(),
    toasts: [],
  }),
}))

const mockedApiGet = vi.mocked(apiGet)
const mockedApiPost = vi.mocked(apiPost)
const mockedGetApiErrorMessage = vi.mocked(getApiErrorMessage)
let MonthlyPlanPage: typeof import('../planning/MonthlyPlanPage').default

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function monthLabel(month: string) {
  const [year, rawMonth] = month.split('-')
  return `${year}年${Number(rawMonth)}月`
}

async function waitForCondition(check: () => boolean) {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    await act(async () => {
      await flush()
    })
    if (check()) return
  }
  throw new Error('Timed out waiting for condition')
}

async function waitForSelector(container: HTMLElement, selector: string) {
  await waitForCondition(() => Boolean(container.querySelector(selector)))
}

async function clickButtonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(text)) as HTMLButtonElement | undefined
  expect(button).toBeTruthy()
  await clickElement(button)
}

async function clickMenuItemByText(container: HTMLElement, text: string) {
  const item = Array.from(container.querySelectorAll('[role="menuitem"]')).find((candidate) => candidate.textContent?.includes(text)) as HTMLElement | undefined
  expect(item).toBeTruthy()
  await clickElement(item)
}

async function clickElement(element: HTMLElement | null | undefined) {
  expect(element).toBeTruthy()
  await act(async () => {
    if (typeof PointerEvent === 'function') {
      element?.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerType: 'mouse',
        }),
      )
    } else {
      element?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    }
    element?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }))
    element?.click()
    await flush()
  })
}

async function commitInputValue(container: HTMLElement, selector: string, nextValue: string) {
  const input = container.querySelector(selector) as HTMLInputElement | null
  expect(input).toBeTruthy()

  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')
    descriptor?.set?.call(input, nextValue)
    input?.dispatchEvent(new Event('input', { bubbles: true }))
    input?.dispatchEvent(new Event('change', { bubbles: true }))
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flush()
  })
}

async function blurInputValue(container: HTMLElement, selector: string, nextValue: string) {
  const input = container.querySelector(selector) as HTMLInputElement | null
  expect(input).toBeTruthy()

  await act(async () => {
    input?.focus()
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')
    descriptor?.set?.call(input, nextValue)
    input?.dispatchEvent(new Event('input', { bubbles: true }))
    input?.dispatchEvent(new Event('change', { bubbles: true }))
    input?.blur()
    await flush()
  })
}

function mount(node: ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(node)
  })

  return {
    container,
    cleanup() {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

function RouteSearchProbe({ testId }: { testId: string }) {
  const location = useLocation()
  return <div data-testid={testId}>{`${location.pathname}${location.search}`}</div>
}

async function loadCloseoutPage() {
  return (await import('../planning/CloseoutPage')).default
}

async function loadMonthlyPlanPage() {
  return (await import('../planning/MonthlyPlanPage')).default
}

const lockRecord: PlanningDraftLockRecord = {
  id: 'lock-1',
  project_id: 'project-1',
  draft_type: 'monthly_plan',
  resource_id: 'monthly-v3',
  locked_by: 'user-1',
  locked_at: '2026-04-15T08:00:00.000Z',
  lock_expires_at: '2026-12-31T08:30:00.000Z',
  is_locked: true,
}

const baselineVersions: BaselineVersion[] = [
  {
    id: 'baseline-v2',
    project_id: 'project-1',
    version: 2,
    status: 'confirmed',
    title: '项目基线',
    source_type: 'manual',
  },
]

const tasks: Task[] = [
  {
    id: 'task-root',
    project_id: 'project-1',
    title: '主体结构',
    wbs_level: 1,
    sort_order: 0,
    progress: 45,
    planned_start_date: '2026-04-01',
    planned_end_date: '2026-04-30',
    created_at: '2026-04-15T08:00:00.000Z',
    updated_at: '2026-04-15T08:00:00.000Z',
  },
  {
    id: 'task-leaf',
    project_id: 'project-1',
    title: '机电安装',
    parent_id: 'task-root',
    wbs_level: 2,
    sort_order: 1,
    progress: 20,
    planned_start_date: '2026-04-05',
    planned_end_date: '2026-04-25',
    created_at: '2026-04-15T08:00:00.000Z',
    updated_at: '2026-04-15T08:00:00.000Z',
  },
]

const conditions: TaskCondition[] = [
  { id: 'condition-1', task_id: 'task-root', name: '材料到场', is_satisfied: false, created_at: '2026-04-15T08:00:00.000Z' },
]

const obstacles: TaskObstacle[] = [
  { id: 'obstacle-1', task_id: 'task-leaf', title: 'site coordination', is_resolved: false, status: 'processing', created_at: '2026-04-15T08:00:00.000Z' },
]

const monthlyDraft = {
  id: 'monthly-v3',
  project_id: 'project-1',
  version: 3,
  status: 'draft',
  month: '2026-04',
  title: '2026-04 月度计划',
  baseline_version_id: 'baseline-v2',
  source_version_id: 'baseline-v2',
  carryover_item_count: 1,
  created_at: '2026-04-15T08:00:00.000Z',
  updated_at: '2026-04-15T08:00:00.000Z',
  items: [
    {
      id: 'monthly-item-1',
      project_id: 'project-1',
      monthly_plan_version_id: 'monthly-v3',
      source_task_id: 'task-root',
      title: '主体结构',
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-30',
      target_progress: 60,
      current_progress: 45,
      sort_order: 0,
      commitment_status: 'planned',
    },
    {
      id: 'monthly-item-2',
      project_id: 'project-1',
      monthly_plan_version_id: 'monthly-v3',
      source_task_id: 'task-leaf',
      title: '机电安装',
      planned_start_date: '2026-04-05',
      planned_end_date: '2026-04-25',
      target_progress: 35,
      current_progress: 20,
      sort_order: 1,
      commitment_status: 'planned',
    },
  ],
}

const closeoutPlan = {
  ...monthlyDraft,
  id: 'monthly-v2',
  version: 2,
  status: 'confirmed',
  month: '2026-03',
  items: [
    {
      ...monthlyDraft.items[0],
      id: 'closeout-item-1',
      monthly_plan_version_id: 'monthly-v2',
      current_progress: 100,
      target_progress: 100,
      commitment_status: 'completed',
    },
    {
      ...monthlyDraft.items[1],
      id: 'closeout-item-2',
      monthly_plan_version_id: 'monthly-v2',
      current_progress: 20,
      target_progress: 40,
      commitment_status: 'planned',
    },
  ],
}

type CloseoutPlanItem = {
  title: string
  notes?: string | null
  current_progress?: number | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  sort_order: number
  is_milestone?: boolean | null
  is_critical?: boolean | null
}

const closeoutTasks: Task[] = (closeoutPlan.items as CloseoutPlanItem[]).map((item, index) => ({
  id: `closeout-task-${index + 1}`,
  project_id: 'project-1',
  title: item.title,
  name: item.title,
  description: item.notes ?? '',
  progress: item.current_progress ?? 0,
  planned_start_date: item.planned_start_date ?? null,
  planned_end_date: item.planned_end_date ?? null,
  sort_order: item.sort_order,
  is_milestone: Boolean(item.is_milestone),
  is_critical: Boolean(item.is_critical),
  created_at: '2026-03-01T00:00:00.000Z',
  updated_at: '2026-03-01T00:00:00.000Z',
}))

const dataQualitySummary = {
  projectId: 'project-1',
  month: '2026-03',
  confidence: {
    score: 86,
    flag: 'medium' as const,
    note: '关账前建议继续核对少量跨链异常',
    timelinessScore: 88,
    anomalyScore: 84,
    consistencyScore: 86,
    coverageScore: 90,
    jumpinessScore: 82,
    activeFindingCount: 3,
    trendWarningCount: 1,
    anomalyFindingCount: 1,
    crossCheckFindingCount: 1,
  },
  prompt: {
    count: 1,
    summary: '仍有少量异常建议复核',
    items: [],
  },
  ownerDigest: {
    shouldNotify: true,
    severity: 'warning' as const,
    scopeLabel: '月末关账',
    findingCount: 3,
    summary: '关账前建议复3 条异常',
  },
  findings: [],
}

describe('Planning real pages', () => {
  const cleanups: Array<() => void> = []

  beforeEach(async () => {
    mockedApiGet.mockReset()
    mockedApiPost.mockReset()
    mockedGetApiErrorMessage.mockImplementation((error, fallback) => (error instanceof Error ? error.message : fallback || 'error'))
    window.localStorage.clear()

    useStore.setState({
      currentProject: { id: 'project-1', name: '城市更新项目', status: 'active' } as never,
    } as never)
    usePlanningStore.setState({
      selectedItemIds: [],
      draftStatus: 'idle',
      validationIssues: [],
    })
    MonthlyPlanPage = (await import('../planning/MonthlyPlanPage')).default
  })

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.()
  })

  it('loads the real monthly plan page and confirms through /api/monthly-plans/:id/confirm', async () => {
    const versions: MonthlyPlanVersion[] = [{ ...monthlyDraft, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url.startsWith('/api/monthly-plans/monthly-v3?project_id=')) return monthlyDraft as never
      if (url.startsWith('/api/task-baselines?project_id=')) return baselineVersions as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return conditions as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return obstacles as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/monthly-plans/monthly-v3/lock') return { lock: lockRecord } as never
      if (url === `/api/monthly-plans/${monthlyDraft.id}/confirm`) return { ...monthlyDraft, status: 'confirmed' } as never
      throw new Error(`unexpected apiPost: ${url}`)
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<MonthlyPlanPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="monthly-plan-tree-editor"]')
    await waitForSelector(view.container, '[data-testid="monthly-plan-edit-actions"]')
    await waitForSelector(view.container, '[data-testid="monthly-plan-batch-strip"]')
    await waitForSelector(view.container, '[data-testid="monthly-plan-tree-block"]')
    await waitForSelector(view.container, '[data-testid="monthly-plan-review-block"]')
    await waitForSelector(view.container, '[data-testid="monthly-plan-confirm-summary"]')
    await waitForSelector(view.container, '[data-testid="monthly-plan-exception-summary"]')

    const confirmSummaryItems = view.container.querySelectorAll('[data-testid="monthly-plan-confirm-summary-item"]')

    expect(view.container.textContent).toContain('条件 / 阻碍 / 延期摘要')
    expect(view.container.textContent).toContain('回到任务管理补条件')
    expect(view.container.textContent).toContain('前往风险与问题工作台')
    expect(view.container.textContent).toContain('字段配置')
    expect(view.container.textContent).not.toContain('计划变更对比')
    expect(view.container.textContent).not.toContain('纳入本月计划')
    expect(view.container.textContent).not.toContain('移出本月计划')
    expect(confirmSummaryItems).toHaveLength(7)

    const selectedMonthButton = Array.from(view.container.querySelectorAll('button')).find(
      (button) =>
        button.className.includes('ring-blue-500') &&
        button.textContent?.includes(monthLabel(monthlyDraft.month)),
    ) as HTMLButtonElement | undefined
    expect(selectedMonthButton?.className).toContain('ring-blue-500')

    await clickButtonByText(view.container, `确认 ${monthLabel(monthlyDraft.month)} 计划`)
    await waitForSelector(document.body, '[data-testid="monthly-plan-confirm-dialog"]')
    const confirmButton = Array.from(
      document.body.querySelectorAll('[data-testid="monthly-plan-confirm-dialog"] button'),
    ).find((button) => (
      button.textContent?.includes(`确认 ${monthLabel(monthlyDraft.month)} 计划`) || button.textContent?.includes(`快速确认 ${monthLabel(monthlyDraft.month)} 计划`)
    )) as HTMLButtonElement | undefined
    expect(confirmButton).toBeTruthy()
    await clickElement(confirmButton)

    expect(
      mockedApiPost.mock.calls.some(([url]) => url === `/api/monthly-plans/${monthlyDraft.id}/confirm`),
    ).toBe(true)
  })

  it('shows the monthly day-3 reminder banner in the info area', async () => {
    const versions: MonthlyPlanVersion[] = [{ ...monthlyDraft, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url.startsWith('/api/monthly-plans/monthly-v3?project_id=')) return monthlyDraft as never
      if (url.startsWith('/api/task-baselines?project_id=')) return baselineVersions as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return conditions as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return obstacles as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/monthly-plans/monthly-v3/lock') return { lock: lockRecord } as never
      throw new Error(`unexpected apiPost: ${url}`)
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<MonthlyPlanPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="monthly-plan-reminder-banner"]')
    expect(view.container.textContent).toContain('第 3 日催办')
  })

  it('keeps the progress-deviation deep link on the real monthly plan page', async () => {
    const versions: MonthlyPlanVersion[] = [{ ...monthlyDraft, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url.startsWith('/api/monthly-plans/monthly-v3?project_id=')) return monthlyDraft as never
      if (url.startsWith('/api/task-baselines?project_id=')) return baselineVersions as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return conditions as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return obstacles as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/monthly-plans/monthly-v3/lock') return { lock: lockRecord } as never
      throw new Error(`unexpected apiPost: ${url}`)
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<MonthlyPlanPage />} />
          <Route path="/projects/:id/reports" element={<RouteSearchProbe testId="monthly-reports-route" />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="monthly-plan-open-progress-deviation"]')

    await act(async () => {
      ;(view.container.querySelector('[data-testid="monthly-plan-open-progress-deviation"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForSelector(view.container, '[data-testid="monthly-reports-route"]')
    expect(view.container.querySelector('[data-testid="monthly-reports-route"]')?.textContent).toContain(
      '/projects/project-1/reports?view=progress_deviation',
    )
  })

  it('guards leaving the monthly page when the draft has unsaved edits', async () => {
    const versions: MonthlyPlanVersion[] = [{ ...monthlyDraft, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url.startsWith('/api/monthly-plans/monthly-v3?project_id=')) return monthlyDraft as never
      if (url.startsWith('/api/task-baselines?project_id=')) return baselineVersions as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return conditions as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return obstacles as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/monthly-plans/monthly-v3/lock') return { lock: lockRecord } as never
      throw new Error(`unexpected apiPost: ${url}`)
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<MonthlyPlanPage />} />
          <Route path="/projects/:id/reports" element={<RouteSearchProbe testId="monthly-guard-route" />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="monthly-plan-tree-editor"]')

    const checkboxes = Array.from(
      view.container.querySelectorAll('[data-testid="planning-selection-checkbox"]'),
    ) as HTMLButtonElement[]
    expect(checkboxes).toHaveLength(2)

    await act(async () => {
      checkboxes[1]?.click()
      await flush()
    })

    await waitForCondition(() => usePlanningStore.getState().selectedItemIds.length === 1)
    await act(async () => {
      ;(view.container.querySelector('[data-testid="monthly-plan-open-progress-deviation"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForCondition(() => Boolean(document.body.querySelector('[data-testid="monthly-plan-unsaved-changes-dialog"]')))
    expect(document.body.textContent).toContain('月度计划还有未保存调整')

    await clickButtonByText(document.body, '继续编辑')
    await waitForCondition(() => !document.body.querySelector('[data-testid="monthly-plan-unsaved-changes-dialog"]'))
    expect(view.container.querySelector('[data-testid="monthly-guard-route"]')).toBeNull()

    await act(async () => {
      ;(view.container.querySelector('[data-testid="monthly-plan-open-progress-deviation"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForCondition(() => Boolean(document.body.querySelector('[data-testid="monthly-plan-unsaved-changes-dialog"]')))
    await clickButtonByText(document.body, '确认离开')
    await waitForSelector(view.container, '[data-testid="monthly-guard-route"]')
    expect(view.container.querySelector('[data-testid="monthly-guard-route"]')?.textContent).toContain(
      '/projects/project-1/reports?view=progress_deviation',
    )
  })

  it('shows the no-baseline intercept when the project has no confirmed baseline', async () => {
    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return [] as never
      if (url.startsWith('/api/task-baselines?project_id=')) return [] as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return [] as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return [] as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async () => {
      throw new Error('unexpected apiPost')
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<MonthlyPlanPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForCondition(() => view.container.textContent?.includes('当前项目还没有正式基线') ?? false)
    expect(view.container.textContent).toContain('去建立项目基线')
  })

  it('does not expose closeout when no monthly plan exists yet', async () => {
    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return [] as never
      if (url.startsWith('/api/task-baselines?project_id=')) return baselineVersions as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return conditions as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return obstacles as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async () => {
      throw new Error('unexpected apiPost')
    })

    const view = mount(
      <MemoryRouter initialEntries={[`/projects/project-1/planning/monthly?month=${monthlyDraft.month}`]}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<MonthlyPlanPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="monthly-plan-generate-empty"]')
    expect(view.container.querySelector('[data-testid="monthly-plan-open-closeout"]')).toBeNull()
  })

  it('allows generating a concrete month plan from the empty monthly workspace', async () => {
    let versions: MonthlyPlanVersion[] = []

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url.startsWith('/api/monthly-plans/monthly-v3?project_id=')) return monthlyDraft as never
      if (url.startsWith('/api/task-baselines?project_id=')) return baselineVersions as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return conditions as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return obstacles as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string, payload?: unknown) => {
      if (url === '/api/monthly-plans/generate') {
        expect((payload as { month?: string })?.month).toBe(monthlyDraft.month)
        versions = [{ ...monthlyDraft, items: undefined } as never]
        return monthlyDraft as never
      }
      throw new Error(`unexpected apiPost: ${url}`)
    })

    const view = mount(
      <MemoryRouter initialEntries={[`/projects/project-1/planning/monthly?month=${monthlyDraft.month}`]}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<MonthlyPlanPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="monthly-plan-generate-empty"]')
    const generateButton = view.container.querySelector('[data-testid="monthly-plan-generate-empty"]') as HTMLButtonElement | null
    expect(generateButton?.disabled).toBe(false)
    expect(generateButton?.textContent).toContain(monthLabel(monthlyDraft.month))
    expect(view.container.querySelector('[data-testid="monthly-plan-open-closeout"]')).toBeNull()

    await clickElement(generateButton)
    await waitForCondition(() => mockedApiPost.mock.calls.some(([url]) => url === '/api/monthly-plans/generate'))
  })

  it('shows confirmed monthly plan without source diff actions', async () => {
    const confirmedVersions: MonthlyPlanVersion[] = [{ ...monthlyDraft, status: 'confirmed', items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return confirmedVersions as never
      if (url.startsWith('/api/monthly-plans/monthly-v3?project_id=')) return { ...monthlyDraft, status: 'confirmed' } as never
      if (url.startsWith('/api/task-baselines?project_id=')) return baselineVersions as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return conditions as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return obstacles as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async () => {
      throw new Error('unexpected apiPost')
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<MonthlyPlanPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="monthly-plan-info-bar"]')
    await waitForCondition(() => view.container.textContent?.includes('已确认') ?? false)
    expect(view.container.textContent).not.toContain('查看计划变更对比')
    expect(view.container.textContent).not.toContain('主骨架')
  })

  it('falls back to the latest available month when the current month has no version', async () => {
    const futureConfirmed = {
      ...monthlyDraft,
      id: 'monthly-v9',
      version: 9,
      status: 'confirmed' as const,
      month: '2099-09',
      title: '2099-09 月度计划',
      items: [],
    }
    const versions: MonthlyPlanVersion[] = [{ ...futureConfirmed, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url.startsWith('/api/monthly-plans/monthly-v9?project_id=')) return futureConfirmed as never
      if (url.startsWith('/api/task-baselines?project_id=')) return baselineVersions as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return conditions as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return obstacles as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async () => {
      throw new Error('unexpected apiPost')
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<MonthlyPlanPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForCondition(() => view.container.textContent?.includes('2099年9月') ?? false)
    expect(view.container.textContent).not.toContain('管理动作')
    expect(view.container.textContent).toContain('2099年9月')
  })

  it('does not expose monthly realignment as a front-end action', async () => {
    let versions: MonthlyPlanVersion[] = [{ ...monthlyDraft, status: 'confirmed', items: undefined } as never]
    let detail: Omit<typeof monthlyDraft, 'status'> & { status: 'confirmed' | 'pending_realign' } = {
      ...monthlyDraft,
      status: 'confirmed',
    }

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url.startsWith('/api/monthly-plans/monthly-v3?project_id=')) return detail as never
      if (url.startsWith('/api/task-baselines?project_id=')) return baselineVersions as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return conditions as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return obstacles as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/monthly-plans/monthly-v3/queue-realignment') {
        detail = { ...detail, status: 'pending_realign' }
        versions = [{ ...detail, items: undefined } as never]
        return detail as never
      }
      if (url === '/api/monthly-plans/monthly-v3/resolve-realignment') {
        detail = { ...detail, status: 'confirmed' }
        versions = [{ ...detail, items: undefined } as never]
        return detail as never
      }
      throw new Error(`unexpected apiPost: ${url}`)
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<MonthlyPlanPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="monthly-plan-info-bar"]')
    await waitForCondition(() => view.container.textContent?.includes('已确认') ?? false)
    expect(view.container.textContent).not.toContain('发起重新校准')
    expect(view.container.textContent).not.toContain('完成重新校准')
    expect(mockedApiPost.mock.calls.some(([url]) => url === '/api/monthly-plans/monthly-v3/queue-realignment')).toBe(false)
  })

  it('supports undo and redo in the monthly tree editor', async () => {
    const versions: MonthlyPlanVersion[] = [{ ...monthlyDraft, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url.startsWith('/api/monthly-plans/monthly-v3?project_id=')) return monthlyDraft as never
      if (url.startsWith('/api/task-baselines?project_id=')) return baselineVersions as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return conditions as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return obstacles as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/monthly-plans/monthly-v3/lock') return { lock: lockRecord } as never
      throw new Error(`unexpected apiPost: ${url}`)
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<MonthlyPlanPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="monthly-plan-tree-editor"]')
    await waitForCondition(() => usePlanningStore.getState().selectedItemIds.length === 2)

    const checkboxes = Array.from(
      view.container.querySelectorAll('[data-testid="planning-selection-checkbox"]'),
    ) as HTMLButtonElement[]
    expect(checkboxes).toHaveLength(2)

    await act(async () => {
      checkboxes[1]?.click()
      await flush()
    })
    await waitForCondition(() => usePlanningStore.getState().selectedItemIds.length === 1)

    await clickButtonByText(view.container, '撤销')
    await waitForCondition(() => usePlanningStore.getState().selectedItemIds.length === 2)

    await clickButtonByText(view.container, '重做')
    await waitForCondition(() => usePlanningStore.getState().selectedItemIds.length === 1)
  })

  it('does not expose manual regeneration on an existing monthly plan', async () => {
    const versions: MonthlyPlanVersion[] = [{ ...monthlyDraft, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url.startsWith('/api/monthly-plans/monthly-v3?project_id=')) return monthlyDraft as never
      if (url.startsWith('/api/task-baselines?project_id=')) return baselineVersions as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return conditions as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return obstacles as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/monthly-plans/monthly-v3/lock') return { lock: lockRecord } as never
      throw new Error(`unexpected apiPost: ${url}`)
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<MonthlyPlanPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="monthly-plan-tree-editor"]')
    await waitForCondition(() => usePlanningStore.getState().selectedItemIds.length === 2)

    const checkboxes = Array.from(
      view.container.querySelectorAll('[data-testid="planning-selection-checkbox"]'),
    ) as HTMLButtonElement[]

    await act(async () => {
      checkboxes[1]?.click()
      await flush()
    })
    await waitForCondition(() => usePlanningStore.getState().selectedItemIds.length === 1)

    expect(view.container.querySelector('[data-testid="monthly-plan-regenerate"]')).toBeNull()
    expect(view.container.textContent).not.toContain('重新生成')
    expect(mockedApiPost.mock.calls.some(([url]) => url === '/api/monthly-plans')).toBe(false)
  })

  it('blocks monthly draft save when table validation finds invalid dates', async () => {
    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return [{ ...monthlyDraft, items: undefined } as never]
      if (url.startsWith('/api/monthly-plans/monthly-v3?project_id=')) return monthlyDraft as never
      if (url.startsWith('/api/task-baselines?project_id=')) return baselineVersions as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return conditions as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return obstacles as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/monthly-plans/monthly-v3/lock') return { lock: lockRecord } as never
      throw new Error(`unexpected apiPost: ${url}`)
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<MonthlyPlanPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="monthly-plan-tree-editor"]')
    await commitInputValue(
      view.container,
      '[data-monthly-editor-cell="monthly-item-1:start"]',
      '2026-05-30',
    )
    await waitForCondition(() => view.container.textContent?.includes('开始日期不能晚于完成日期') ?? false)

    await clickElement(view.container.querySelector('[data-testid="monthly-plan-save-draft-header"]') as HTMLButtonElement)
    await waitForCondition(() => view.container.textContent?.includes('表格校核') ?? false)

    expect(mockedApiPost.mock.calls.some(([url]) => url === '/api/monthly-plans/monthly-v3/commit')).toBe(false)
  })

  it('keeps monthly blur edits local until the user explicitly saves', async () => {
    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return [{ ...monthlyDraft, items: undefined } as never]
      if (url.startsWith('/api/monthly-plans/monthly-v3?project_id=')) return monthlyDraft as never
      if (url.startsWith('/api/task-baselines?project_id=')) return baselineVersions as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return conditions as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return obstacles as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/monthly-plans/monthly-v3/lock') return { lock: lockRecord } as never
      throw new Error(`unexpected apiPost: ${url}`)
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<MonthlyPlanPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="monthly-plan-tree-editor"]')
    await blurInputValue(
      view.container,
      '[data-monthly-editor-cell="monthly-item-1:progress"]',
      '66',
    )

    await waitForCondition(() => {
      const input = view.container.querySelector('[data-monthly-editor-cell="monthly-item-1:progress"]') as HTMLInputElement | null
      return input?.value === '66'
    })

    expect(mockedApiPost.mock.calls.some(([url]) => url === '/api/monthly-plans/monthly-v3/commit')).toBe(false)
  })

  it('tracks monthly field edits in undo and redo history', async () => {
    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return [{ ...monthlyDraft, items: undefined } as never]
      if (url.startsWith('/api/monthly-plans/monthly-v3?project_id=')) return monthlyDraft as never
      if (url.startsWith('/api/task-baselines?project_id=')) return baselineVersions as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return conditions as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return obstacles as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/monthly-plans/monthly-v3/lock') return { lock: lockRecord } as never
      throw new Error(`unexpected apiPost: ${url}`)
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<MonthlyPlanPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="monthly-plan-tree-editor"]')
    await waitForSelector(view.container, '[data-monthly-editor-cell="monthly-item-1:title"]')

    await commitInputValue(
      view.container,
      '[data-monthly-editor-cell="monthly-item-1:title"]',
      '主体结构-调整',
    )

    await waitForCondition(() => {
      const input = view.container.querySelector('[data-monthly-editor-cell="monthly-item-1:title"]') as HTMLInputElement | null
      return input?.value === '主体结构-调整'
    })

    await clickButtonByText(view.container, '撤销')
    await waitForCondition(() => {
      const input = view.container.querySelector('[data-monthly-editor-cell="monthly-item-1:title"]') as HTMLInputElement | null
      return input?.value === '主体结构'
    })

    await clickButtonByText(view.container, '重做')
    await waitForCondition(() => {
      const input = view.container.querySelector('[data-monthly-editor-cell="monthly-item-1:title"]') as HTMLInputElement | null
      return input?.value === '主体结构-调整'
    })
  })

  it('loads the real closeout page and closes through /api/monthly-plans/:id/close', async () => {
    const CloseoutPage = await loadCloseoutPage()
    const versions: MonthlyPlanVersion[] = [{ ...closeoutPlan, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url.startsWith('/api/monthly-plans/monthly-v2?project_id=')) return closeoutPlan as never
      if (url.startsWith('/api/monthly-plans/monthly-v2/closeout-summary?')) {
        return {
          totalCount: 2,
          processedCount: 1,
          remainingCount: 1,
          autoAdoptableCount: 1,
          completedCount: 1,
          carryoverCount: 0,
          cancelledCount: 0,
          attentionCount: 1,
        } as never
      }
      if (url.startsWith('/api/monthly-plans/monthly-v2/closeout-confirm-summary?')) {
        return {
          rolledInCount: 0,
          closedCount: 1,
          manualOverrideCount: 1,
          archiveConfirmationCount: 0,
          attentionCount: 1,
        } as never
      }
      if (url.startsWith('/api/tasks?projectId=')) return closeoutTasks as never
      if (url.startsWith('/api/data-quality/project-summary?')) return dataQualitySummary as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/monthly-plans/monthly-v2/close') return { ...closeoutPlan, status: 'closed' } as never
      throw new Error(`unexpected apiPost: ${url}`)
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly?view=closeout']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<CloseoutPage />} />
          <Route path="/projects/:id/planning/monthly" element={<div data-testid="monthly-route-after-closeout" />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="closeout-escalation-ladder"]')
    await waitForCondition(() => {
      const classificationSummary = view.container.querySelector('[data-testid="closeout-classification-summary"]')
      const values = Array.from(classificationSummary?.querySelectorAll('.tabular-nums') ?? []).map(
        (item) => item.textContent,
      )
      return values.join(',') === '1,0,0,1'
    })
    await waitForSelector(view.container, '[data-testid="closeout-detail-drawer"]')
    expect(view.container.textContent).toContain('逾期 3 日历天系统提醒')
    expect(view.container.textContent).toContain('5 日历天通知上级')
    expect(view.container.textContent).toContain('7 日历天确认归档窗口')
    expect(view.container.textContent).toContain('按工程对象')
    expect(view.container.textContent).not.toContain('按范围维度')
    expect(view.container.querySelector('[data-testid="closeout-reason-breadcrumb"]')?.textContent).toContain(
      '根',
    )
    expect(view.container.querySelector('[data-testid="closeout-reason-branch-system"]')?.textContent).toContain(
      '适用于当月已完成',
    )
    expect(view.container.querySelector('[data-testid="closeout-reason-branch-system"]')?.textContent).toContain(
      '2',
    )
    expect(view.container.querySelector('[data-testid="closeout-reason-branch-system"]')?.className).toContain(
      'bg-blue-50',
    )
    expect(view.container.querySelector('[data-testid="closeout-detail-drawer-header"]')).toBeTruthy()
    expect(view.container.querySelector('[data-testid="closeout-detail-drawer-body"]')).toBeTruthy()
    expect(view.container.querySelector('[data-testid="closeout-detail-drawer-footer"]')).toBeTruthy()

    const checkboxes = Array.from(
      view.container.querySelectorAll('[data-testid="planning-selection-checkbox"]'),
    ) as HTMLInputElement[]
    await act(async () => {
      checkboxes.forEach((checkbox) => checkbox.click())
      await flush()
    })
    await waitForSelector(view.container, '[data-testid="closeout-batch-bar"]')
    expect(view.container.querySelector('[data-testid="closeout-batch-bar"]')?.className).toContain('max-w')

    await clickElement(view.container.querySelector('[data-testid="closeout-batch-layer-toggle"]') as HTMLElement | null)
    await waitForSelector(view.container, '[data-testid="closeout-batch-process-entry"]')
    await clickElement(view.container.querySelector('[data-testid="closeout-batch-process-entry"]') as HTMLElement | null)
    await waitForSelector(document.body, '[data-testid="closeout-confirm-dialog"]')
    await clickButtonByText(document.body, '确认关账')

    expect(
      mockedApiPost.mock.calls.some(([url]) => url === '/api/monthly-plans/monthly-v2/close'),
    ).toBe(true)
  })

  it('shows a governed closeout empty state when no confirmed monthly plan is available', async () => {
    const CloseoutPage = await loadCloseoutPage()
    const versions: MonthlyPlanVersion[] = [{ ...monthlyDraft, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url.startsWith('/api/tasks?projectId=')) return closeoutTasks as never
      if (url.startsWith('/api/data-quality/project-summary?')) return dataQualitySummary as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async () => {
      throw new Error('unexpected apiPost')
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly?view=closeout&month=2026-04']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<CloseoutPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="closeout-empty-state"]')
    expect(view.container.querySelector('[data-testid="closeout-empty-state"]')?.textContent).toContain(
      '当前没有可关账的已确认月份',
    )
    expect(view.container.querySelector('[data-testid="closeout-force-close-entry"]')).toBeFalsy()
  })

  it('hosts closeout inside the monthly plan route and returns to the next month after close', async () => {
    const versions: MonthlyPlanVersion[] = [
      { ...closeoutPlan, items: undefined } as never,
      { ...monthlyDraft, items: undefined } as never,
    ]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url.startsWith('/api/monthly-plans/monthly-v2?project_id=')) return closeoutPlan as never
      if (url.startsWith('/api/monthly-plans/monthly-v3?project_id=')) return monthlyDraft as never
      if (url.startsWith('/api/tasks?projectId=')) return closeoutTasks as never
      if (url.startsWith('/api/data-quality/project-summary?')) return dataQualitySummary as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/monthly-plans/monthly-v2/close') return { ...closeoutPlan, status: 'closed' } as never
      throw new Error(`unexpected apiPost: ${url}`)
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly?view=closeout&month=2026-03']}>
        <Routes>
          <Route
            path="/projects/:id/planning/monthly"
            element={
              <>
                <RouteSearchProbe testId="monthly-route-location" />
                <MonthlyPlanPage />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="closeout-escalation-ladder"]')
    expect(view.container.querySelector('[data-testid="monthly-route-location"]')?.textContent).toContain('/planning/monthly?view=closeout')

    const checkboxes = Array.from(
      view.container.querySelectorAll('[data-testid="planning-selection-checkbox"]'),
    ) as HTMLInputElement[]
    await act(async () => {
      checkboxes.forEach((checkbox) => checkbox.click())
      await flush()
    })
    await waitForSelector(view.container, '[data-testid="closeout-batch-bar"]')
    await clickElement(view.container.querySelector('[data-testid="closeout-batch-layer-toggle"]') as HTMLElement | null)
    await waitForSelector(view.container, '[data-testid="closeout-batch-process-entry"]')
    await clickElement(view.container.querySelector('[data-testid="closeout-batch-process-entry"]') as HTMLElement | null)
    await waitForSelector(document.body, '[data-testid="closeout-confirm-dialog"]')
    await clickButtonByText(document.body, '确认关账')

    await waitForCondition(() => {
      const text = view.container.querySelector('[data-testid="monthly-route-location"]')?.textContent ?? ''
      return text.includes('/planning/monthly?closeout_complete=1') && text.includes('month=2026-04')
    })
    expect(
      mockedApiPost.mock.calls.some(([url]) => url === '/api/monthly-plans/monthly-v2/close'),
    ).toBe(true)
  })

  it('filters the real closeout list by status', async () => {
    const CloseoutPage = await loadCloseoutPage()
    const overdueCloseoutPlan = { ...closeoutPlan, month: '2020-03' }
    const versions: MonthlyPlanVersion[] = [{ ...overdueCloseoutPlan, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url.startsWith('/api/monthly-plans/monthly-v2?project_id=')) return overdueCloseoutPlan as never
      if (url.startsWith('/api/tasks?projectId=')) return closeoutTasks as never
      if (url.startsWith('/api/data-quality/project-summary?')) return { ...dataQualitySummary, month: '2020-03' } as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async () => {
      throw new Error('unexpected apiPost')
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly?view=closeout']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<CloseoutPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="closeout-filter-bar"]')

    await act(async () => {
      ;(view.container.querySelector('[data-testid="closeout-filter-overdue"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForCondition(
      () =>
        Boolean(view.container.querySelector('[data-testid="closeout-item-open-closeout-item-2"]')) &&
        !view.container.querySelector('[data-testid="closeout-item-open-closeout-item-1"]'),
    )
  })

  it('switches closeout grouping dimensions and shows the escalation ladder', async () => {
    const CloseoutPage = await loadCloseoutPage()
    const overdueCloseoutPlan = { ...closeoutPlan, month: '2026-03' }
    const versions: MonthlyPlanVersion[] = [{ ...overdueCloseoutPlan, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url.startsWith('/api/monthly-plans/monthly-v2?project_id=')) return overdueCloseoutPlan as never
      if (url.startsWith('/api/tasks?projectId=')) return closeoutTasks as never
      if (url.startsWith('/api/data-quality/project-summary?')) return dataQualitySummary as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async () => {
      throw new Error('unexpected apiPost')
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/monthly?view=closeout']}>
        <Routes>
          <Route path="/projects/:id/planning/monthly" element={<CloseoutPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="closeout-escalation-ladder"]')
    expect(view.container.textContent).toContain('+7')
    expect(view.container.textContent).toContain('逾期 3 日历天系统提醒')

    await act(async () => {
      ;(view.container.querySelector('[data-testid="closeout-grouping-processing"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForCondition(
      () =>
        view.container.textContent?.includes('升级关注') &&
        view.container.textContent?.includes('待处理'),
    )

    await act(async () => {
      ;(view.container.querySelector('[data-testid="closeout-grouping-commitment"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForCondition(
      () =>
        view.container.textContent?.includes('已完成承诺') &&
        view.container.textContent?.includes('本月承诺'),
    )
  })
})
