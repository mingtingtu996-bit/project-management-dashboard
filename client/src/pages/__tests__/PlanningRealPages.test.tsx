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
import CloseoutPage from '../planning/CloseoutPage'
import MonthlyPlanPage from '../planning/MonthlyPlanPage'

vi.mock('@/lib/apiClient', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  getApiErrorMessage: vi.fn(),
}))

const mockedApiGet = vi.mocked(apiGet)
const mockedApiPost = vi.mocked(apiPost)
const mockedGetApiErrorMessage = vi.mocked(getApiErrorMessage)

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitForCondition(check: () => boolean) {
  const deadline = Date.now() + 2500
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
  await act(async () => {
    button?.click()
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

const lockRecord: PlanningDraftLockRecord = {
  id: 'lock-1',
  project_id: 'project-1',
  draft_type: 'monthly_plan',
  resource_id: 'monthly-v3',
  locked_by: 'user-1',
  locked_at: '2026-04-15T08:00:00.000Z',
  lock_expires_at: '2026-04-15T08:30:00.000Z',
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
  { id: 'obstacle-1', task_id: 'task-leaf', title: '场地协调', is_resolved: false, status: '处理中', created_at: '2026-04-15T08:00:00.000Z' },
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

const dataQualitySummary = {
  projectId: 'project-1',
  month: '2026-03',
  confidence: {
    score: 86,
    flag: 'medium' as const,
    note: '关账前建议继续核对少量跨链异常。',
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
    summary: '仍有少量异常建议复核。',
    items: [],
  },
  ownerDigest: {
    shouldNotify: true,
    severity: 'warning' as const,
    scopeLabel: '月末关账',
    findingCount: 3,
    summary: '关账前建议复核 3 条异常。',
  },
  findings: [],
}

describe('Planning real pages', () => {
  const cleanups: Array<() => void> = []

  beforeEach(() => {
    mockedApiGet.mockReset()
    mockedApiPost.mockReset()
    mockedGetApiErrorMessage.mockImplementation((error, fallback) => (error instanceof Error ? error.message : fallback || 'error'))
    window.localStorage.clear()

    useStore.setState({
      currentProject: { id: 'project-1', name: '城市更新项目', status: 'active' } as never,
    } as never)
    usePlanningStore.setState({
      activeWorkspace: 'monthly',
      selectedItemIds: [],
      draftStatus: 'idle',
      validationIssues: [],
      confirmDialog: { open: false, target: null, title: '', description: '' },
    })
  })

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.()
  })

  it('loads the real monthly plan page and confirms through /api/monthly-plans/:id/confirm', async () => {
    const versions: MonthlyPlanVersion[] = [{ ...monthlyDraft, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url === '/api/monthly-plans/monthly-v3') return monthlyDraft as never
      if (url.startsWith('/api/task-baselines?project_id=')) return baselineVersions as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return conditions as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return obstacles as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/monthly-plans/monthly-v3/lock') return { lock: lockRecord } as never
      if (url === '/api/monthly-plans/monthly-v3/confirm') return { ...monthlyDraft, status: 'confirmed' } as never
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

    await waitForSelector(view.container, '[data-testid="planning-layered-workspace"]')
    await waitForSelector(view.container, '[data-testid="monthly-plan-bottom-bar"]')
    await waitForSelector(view.container, '[data-testid="monthly-plan-source-block"]')
    await waitForSelector(view.container, '[data-testid="monthly-plan-batch-strip"]')
    await waitForSelector(view.container, '[data-testid="monthly-plan-tree-block"]')
    await waitForSelector(view.container, '[data-testid="monthly-plan-review-block"]')
    await waitForSelector(view.container, '[data-testid="monthly-plan-confirm-summary"]')
    await waitForSelector(view.container, '[data-testid="monthly-plan-exception-summary"]')

    const quickConfirmButton = view.container.querySelector(
      '[data-testid="monthly-plan-quick-confirm-entry"]',
    ) as HTMLButtonElement | null
    const confirmSummaryItems = view.container.querySelectorAll('[data-testid="monthly-plan-confirm-summary-item"]')

    expect(view.container.textContent).toContain('条件 / 阻碍 / 延期摘要')
    expect(view.container.textContent).toContain('回到任务管理补条件')
    expect(view.container.textContent).toContain('前往风险与问题工作台')
    expect(confirmSummaryItems).toHaveLength(7)
    expect(quickConfirmButton?.disabled).toBe(true)

    await clickButtonByText(view.container, '标准确认入口')
    await waitForSelector(document.body, '[data-testid="monthly-plan-confirm-dialog"]')
    await clickButtonByText(document.body, '确认月度计划')

    expect(
      mockedApiPost.mock.calls.some(([url]) => url === '/api/monthly-plans/monthly-v3/confirm'),
    ).toBe(true)
  })

  it('shows the monthly day-3 reminder banner in the info area', async () => {
    const versions: MonthlyPlanVersion[] = [{ ...monthlyDraft, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url === '/api/monthly-plans/monthly-v3') return monthlyDraft as never
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

  it('keeps the change-log deep link on the real monthly plan page', async () => {
    const versions: MonthlyPlanVersion[] = [{ ...monthlyDraft, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url === '/api/monthly-plans/monthly-v3') return monthlyDraft as never
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

    await waitForSelector(view.container, '[data-testid="monthly-plan-open-change-log"]')

    await act(async () => {
      ;(view.container.querySelector('[data-testid="monthly-plan-open-change-log"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForSelector(view.container, '[data-testid="monthly-reports-route"]')
    expect(view.container.querySelector('[data-testid="monthly-reports-route"]')?.textContent).toContain(
      '/projects/project-1/reports?view=change_log',
    )
  })

  it('guards leaving the monthly page when the draft has unsaved edits', async () => {
    const versions: MonthlyPlanVersion[] = [{ ...monthlyDraft, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url === '/api/monthly-plans/monthly-v3') return monthlyDraft as never
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
      ;(view.container.querySelector('[data-testid="monthly-plan-open-change-log"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForCondition(() => Boolean(document.body.querySelector('[data-testid="monthly-plan-unsaved-changes-dialog"]')))
    expect(document.body.textContent).toContain('月度计划草稿还有未保存调整')

    await clickButtonByText(document.body, '继续编辑')
    await waitForCondition(() => !document.body.querySelector('[data-testid="monthly-plan-unsaved-changes-dialog"]'))
    expect(view.container.querySelector('[data-testid="monthly-guard-route"]')).toBeNull()

    await act(async () => {
      ;(view.container.querySelector('[data-testid="monthly-plan-open-change-log"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForCondition(() => Boolean(document.body.querySelector('[data-testid="monthly-plan-unsaved-changes-dialog"]')))
    await clickButtonByText(document.body, '确认离开')
    await waitForSelector(view.container, '[data-testid="monthly-guard-route"]')
    expect(view.container.querySelector('[data-testid="monthly-guard-route"]')?.textContent).toContain(
      '/projects/project-1/reports?view=change_log',
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
    expect(view.container.textContent).toContain('改为按当前任务列表预编制')
  })

  it('opens the skeleton diff dialog in confirmed view', async () => {
    const confirmedVersions: MonthlyPlanVersion[] = [{ ...monthlyDraft, status: 'confirmed', items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return confirmedVersions as never
      if (url === '/api/monthly-plans/monthly-v3') return { ...monthlyDraft, status: 'confirmed' } as never
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

    await waitForCondition(() => view.container.textContent?.includes('已确认查看态') ?? false)
    await clickButtonByText(view.container, '查看与主骨架差异')
    await waitForSelector(document.body, '[data-testid="monthly-plan-skeleton-diff-dialog"]')
    expect(document.body.textContent).toContain('查看与主骨架差异')
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
      if (url === '/api/monthly-plans/monthly-v9') return futureConfirmed as never
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
    expect(view.container.textContent).toContain('声明开始重排')
    expect(view.container.textContent).toContain('2099年9月')
  })

  it('supports queueing and resolving monthly realignment from the real page', async () => {
    let versions: MonthlyPlanVersion[] = [{ ...monthlyDraft, status: 'confirmed', items: undefined } as never]
    let detail: Omit<typeof monthlyDraft, 'status'> & { status: 'confirmed' | 'pending_realign' } = {
      ...monthlyDraft,
      status: 'confirmed',
    }

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url === '/api/monthly-plans/monthly-v3') return detail as never
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

    await waitForCondition(() => view.container.textContent?.includes('已确认查看态') ?? false)
    await clickButtonByText(view.container, '声明开始重排')

    await waitForCondition(() =>
      mockedApiPost.mock.calls.some(([url]) => url === '/api/monthly-plans/monthly-v3/queue-realignment'),
    )
    await waitForCondition(() => view.container.textContent?.includes('待重排查看态') ?? false)

    await clickButtonByText(view.container, '结束重排')

    await waitForCondition(() =>
      mockedApiPost.mock.calls.some(([url]) => url === '/api/monthly-plans/monthly-v3/resolve-realignment'),
    )
    await waitForCondition(() => view.container.textContent?.includes('已确认查看态') ?? false)
  })

  it('supports undo and redo in the monthly tree editor', async () => {
    const versions: MonthlyPlanVersion[] = [{ ...monthlyDraft, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url === '/api/monthly-plans/monthly-v3') return monthlyDraft as never
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

  it('warns before regenerating a monthly draft with edited entries', async () => {
    let versions: MonthlyPlanVersion[] = [{ ...monthlyDraft, items: undefined } as never]
    const draftDetails: Record<string, typeof monthlyDraft> = {
      'monthly-v3': monthlyDraft,
    }

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url.startsWith('/api/monthly-plans/')) {
        const detail = draftDetails[url.split('/').at(-1) ?? '']
        if (detail) return detail as never
      }
      if (url.startsWith('/api/task-baselines?project_id=')) return baselineVersions as never
      if (url.startsWith('/api/tasks?projectId=')) return tasks as never
      if (url.startsWith('/api/task-conditions?projectId=')) return conditions as never
      if (url.startsWith('/api/task-obstacles?projectId=')) return obstacles as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string, body?: unknown) => {
      if (url === '/api/monthly-plans/monthly-v3/lock') return { lock: lockRecord } as never
      if (url === '/api/monthly-plans') {
        const payloadItems = ((body as { items?: typeof monthlyDraft.items })?.items ?? monthlyDraft.items).map((item, index) => {
          const { id: _id, project_id: _projectId, monthly_plan_version_id: _versionId, ...rest } = item
          return {
            ...rest,
            id: `monthly-v4-item-${index + 1}`,
            project_id: 'project-1',
            monthly_plan_version_id: 'monthly-v4',
            baseline_item_id: null,
            carryover_from_item_id: null,
          }
        })
        const created = {
          ...monthlyDraft,
          id: 'monthly-v4',
          version: 4,
          source_version_id: 'schedule',
          items: payloadItems,
          updated_at: '2026-04-15T09:15:00.000Z',
        }
        draftDetails['monthly-v4'] = created
        versions = [{ ...created, items: undefined } as never, ...versions]
        return created as never
      }
      if (url === '/api/monthly-plans/monthly-v4/lock') {
        return { lock: { ...lockRecord, resource_id: 'monthly-v4' } } as never
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

    await waitForSelector(view.container, '[data-testid="monthly-plan-tree-editor"]')
    await waitForCondition(() => usePlanningStore.getState().selectedItemIds.length === 2)

    await clickButtonByText(view.container, '基于当前任务列表生成')

    const checkboxes = Array.from(
      view.container.querySelectorAll('[data-testid="planning-selection-checkbox"]'),
    ) as HTMLButtonElement[]

    await act(async () => {
      checkboxes[1]?.click()
      await flush()
    })
    await waitForCondition(() => usePlanningStore.getState().selectedItemIds.length === 1)

    await act(async () => {
      ;(view.container.querySelector('[data-testid="monthly-plan-regenerate-draft"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForSelector(document.body, '[data-testid="monthly-plan-regenerate-dialog"]')
    expect(document.body.textContent).toContain('1 项已调整条目会被覆盖')
    expect(document.body.textContent).toContain('当前来源：当前任务列表')

    await clickButtonByText(document.body, '确认重新生成')

    await waitForCondition(() =>
      mockedApiPost.mock.calls.some(([url]) => url === '/api/monthly-plans'),
    )
    await waitForCondition(() => view.container.textContent?.includes('v4') ?? false)
  })

  it('tracks monthly field edits in undo and redo history', async () => {
    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return [{ ...monthlyDraft, items: undefined } as never]
      if (url === '/api/monthly-plans/monthly-v3') return monthlyDraft as never
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
    const versions: MonthlyPlanVersion[] = [{ ...closeoutPlan, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url === '/api/monthly-plans/monthly-v2') return closeoutPlan as never
      if (url.startsWith('/api/data-quality/project-summary?')) return dataQualitySummary as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/monthly-plans/monthly-v2/close') return { ...closeoutPlan, status: 'closed' } as never
      throw new Error(`unexpected apiPost: ${url}`)
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/closeout']}>
        <Routes>
          <Route path="/projects/:id/planning/closeout" element={<CloseoutPage />} />
          <Route path="/projects/:id/planning/monthly" element={<div data-testid="monthly-route-after-closeout" />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="planning-layered-workspace"]')
    await clickButtonByText(view.container, '强制发起关账')
    await waitForSelector(document.body, '[data-testid="closeout-confirm-dialog"]')
    await clickButtonByText(document.body, '确认关账')

    expect(
      mockedApiPost.mock.calls.some(([url]) => url === '/api/monthly-plans/monthly-v2/close'),
    ).toBe(true)
  })

  it('filters the real closeout list by status', async () => {
    const overdueCloseoutPlan = { ...closeoutPlan, month: '2020-03' }
    const versions: MonthlyPlanVersion[] = [{ ...overdueCloseoutPlan, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url === '/api/monthly-plans/monthly-v2') return overdueCloseoutPlan as never
      if (url.startsWith('/api/data-quality/project-summary?')) return { ...dataQualitySummary, month: '2020-03' } as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async () => {
      throw new Error('unexpected apiPost')
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/closeout']}>
        <Routes>
          <Route path="/projects/:id/planning/closeout" element={<CloseoutPage />} />
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
    const overdueCloseoutPlan = { ...closeoutPlan, month: '2026-03' }
    const versions: MonthlyPlanVersion[] = [{ ...overdueCloseoutPlan, items: undefined } as never]

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/monthly-plans?project_id=')) return versions as never
      if (url === '/api/monthly-plans/monthly-v2') return overdueCloseoutPlan as never
      if (url.startsWith('/api/data-quality/project-summary?')) return dataQualitySummary as never
      throw new Error(`unexpected apiGet: ${url}`)
    })

    mockedApiPost.mockImplementation(async () => {
      throw new Error('unexpected apiPost')
    })

    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/closeout']}>
        <Routes>
          <Route path="/projects/:id/planning/closeout" element={<CloseoutPage />} />
        </Routes>
      </MemoryRouter>,
    )
    cleanups.push(view.cleanup)

    await waitForSelector(view.container, '[data-testid="closeout-escalation-ladder"]')
    expect(view.container.textContent).toContain('+7 天强制关账窗口')

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
