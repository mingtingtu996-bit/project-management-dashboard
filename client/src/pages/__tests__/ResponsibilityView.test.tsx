import { act } from 'react'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ResponsibilityView from '../ResponsibilityView'

function readResponsibilityViewSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/ResponsibilityView.tsx'),
    join(process.cwd(), 'client/src/pages/ResponsibilityView.tsx'),
  ]

  const filePath = candidates.find((candidate) => existsSync(candidate))
  if (!filePath) throw new Error(`Unable to locate ResponsibilityView.tsx in: ${candidates.join(', ')}`)
  return readFileSync(filePath, 'utf8')
}

const { apiGet, apiPost, toast } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet,
  apiPost,
  getApiErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  isAbortError: () => false,
}))

vi.mock('@/hooks/useStore', () => ({
  useCurrentProject: () => ({ id: 'project-1', name: '责任主体示例项目' }),
}))

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    permissionLevel: 'owner',
    globalRole: 'project_admin',
    canManageTeam: true,
    canEdit: true,
    loading: false,
    can: () => true,
    canAny: () => true,
    canAll: () => true,
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}))

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitForSelector(container: HTMLElement, selector: string) {
  const deadline = Date.now() + 2500

  while (Date.now() < deadline) {
    await act(async () => {
      await flush()
    })

    if (container.querySelector(selector)) {
      return
    }
  }

  throw new Error(`Timed out waiting for selector: ${selector}`)
}

function buildResponse(overrides?: Partial<{
  person_rows: Array<Record<string, unknown>>
  unit_rows: Array<Record<string, unknown>>
}>) {
  return {
    project_id: 'project-1',
    generated_at: '2026-04-17T09:00:00.000Z',
    analysis_scope: {
      model: 'execution_performance_insight',
      taskOwnershipBasis: 'tasks.execution_owner_fields',
      causalAttributionPolicy: 'excluded_use_progress_deviation_service',
      causalAttributionSource: 'progressDeviationService.responsibility_contribution',
    },
    watchlist: [],
    person_rows: [],
    unit_rows: [
      {
        key: 'unit:unit-1',
        label: '总包单位',
        dimension: 'unit',
        subject_user_id: null,
        subject_unit_id: 'unit-1',
        primary_unit_key: null,
        primary_unit_label: null,
        total_tasks: 5,
        completed_count: 2,
        on_time_count: 1,
        delayed_count: 2,
        active_delayed_count: 2,
        current_in_hand_count: 3,
        open_risk_count: 1,
        open_obstacle_count: 1,
        risk_pressure: 2,
        key_commitment_gap_count: 1,
        on_time_rate: 50,
        current_week_completed_count: 1,
        current_week_on_time_rate: 50,
        previous_week_completed_count: 1,
        previous_week_on_time_rate: 100,
        trend_delta: -50,
        trend_direction: 'down',
        alert_reasons: ['活跃延期任务 2 项'],
        state_level: 'abnormal',
        watch_status: null,
        watch_id: null,
        alert_state_id: 'alert-2',
        last_message_id: null,
        suggest_recovery_confirmation: false,
        tasks: [
          {
            id: 'task-2',
            title: '主体结构封顶',
            assignee: '张工',
            assignee_user_id: 'user-1',
            unit: '总包单位',
            participant_unit_id: 'unit-1',
            completed: false,
            status_label: '进行中（逾期）',
            planned_end_date: '2026-04-15',
            actual_end_date: null,
            is_delayed: true,
            is_critical_path: true,
            is_milestone: true,
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('ResponsibilityView', () => {
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    apiGet.mockReset()
    apiPost.mockReset()
    toast.mockReset()
    apiGet.mockResolvedValue(buildResponse())
    apiPost.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
  })

  it('posts watchlist add actions for normal rows', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={['/projects/project-1/responsibility?dimension=unit']}>
          <Routes>
            <Route path="/projects/:id/responsibility" element={<ResponsibilityView />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="responsibility-page"]')
    await waitForSelector(container, '[data-testid="responsibility-row"]')

    expect(container.textContent).toContain('责任主体监控(1 个主体)')
    expect(container.textContent).toContain('履约洞察')
    expect(container.textContent).toContain('进度偏差归因')
    expect(container.textContent).toContain('趋势分析(')
    expect(container.textContent).toContain('当前延期中')
    expect(container.textContent).toContain('风险关联度')
    expect(container.textContent).toContain('计划完成')

    const responsibilityRow = container.querySelector('[data-testid="responsibility-row"]') as HTMLElement | null
    expect(responsibilityRow?.className).toContain('ring-red-200')

    const unitDimensionButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('责任单位维度'),
    ) as HTMLButtonElement | undefined
    expect(unitDimensionButton?.className).toContain('bg-blue-600')

    const watchButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '加入关注',
    ) as HTMLButtonElement | undefined

    expect(watchButton).toBeTruthy()

    await act(async () => {
      watchButton?.click()
      await flush()
    })

    expect(apiPost).toHaveBeenCalledWith('/api/projects/project-1/responsibility/watchlist', {
      dimension: 'unit',
      subject_key: 'unit:unit-1',
      subject_label: '总包单位',
      subject_user_id: null,
      subject_unit_id: 'unit-1',
    })
  })

  it('uses the dedicated confirm-recovery endpoint for recovery confirmation rows', async () => {
    apiGet.mockResolvedValue(
      buildResponse({
        unit_rows: [
          {
            ...buildResponse().unit_rows[0],
            watch_status: 'suggested_to_clear',
            suggest_recovery_confirmation: true,
          },
        ],
      }),
    )

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={['/projects/project-1/responsibility?dimension=unit']}>
          <Routes>
            <Route path="/projects/:id/responsibility" element={<ResponsibilityView />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="responsibility-page"]')
    await waitForSelector(container, '[data-testid="responsibility-row"]')

    expect(container.textContent).toContain('待确认恢复正常')

    const confirmButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '确认恢复',
    ) as HTMLButtonElement | undefined

    expect(confirmButton).toBeTruthy()

    await act(async () => {
      confirmButton?.click()
      await flush()
    })

    expect(apiPost).toHaveBeenCalledWith(
      '/api/projects/project-1/responsibility/watchlist/confirm-recovery',
      {
        dimension: 'unit',
        subject_key: 'unit:unit-1',
      },
    )
  })

  it('keeps related task buttons height-adaptive on mobile viewports', () => {
    const source = readResponsibilityViewSource()

    expect(source).toContain('flex h-auto min-h-[3.25rem] w-full items-center justify-between gap-4 whitespace-normal px-4 py-3')
    expect(source).toContain('<div className="min-w-0 flex-1 space-y-1">')
    expect(source).toContain('<span className="max-w-full truncate">{task.assignee}</span>')
    expect(source).toContain('<span className="max-w-full truncate">{task.unit}</span>')
  })
})
