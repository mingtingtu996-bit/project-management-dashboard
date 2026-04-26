import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TaskSummary from '../TaskSummary'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
  }
})

vi.mock('@/hooks/useStore', () => ({
  useCurrentProject: () => ({
    id: 'project-1',
    name: '示例项目',
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

const mockedUseNavigate = vi.mocked(useNavigate)

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

function jsonResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data,
  } as never
}

describe('TaskSummary page contract', () => {
  const projectId = 'project-1'
  let container: HTMLDivElement
  let root: Root | null = null
  const fetchMock = vi.fn()

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    mockedUseNavigate.mockReturnValue(vi.fn())

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url === `/api/task-summaries/projects/${projectId}/task-summary`) {
        return jsonResponse({
          success: true,
          data: {
            stats: {
              total_completed: 6,
              on_time_count: 5,
              delayed_count: 1,
              completed_milestone_count: 2,
              avg_delay_days: 1.2,
            },
            groups: [
              {
                id: 'group-1',
                name: '里程碑 A',
                status: 'completed',
                completed_at: '2026-04-08',
                planned_end_date: '2026-04-08',
                tasks: [
                  {
                    id: 'task-1',
                    title: '关联任务 1',
                    assignee: '张三',
                    planned_end_date: '2026-04-08',
                    status_label: 'on_time',
                    delay_total_days: 0,
                  },
                ],
              },
            ],
            monthlyFulfillment: [
              {
                month: '2026-03',
                committedCount: 4,
                fulfilledCount: 3,
                rate: 75,
              },
            ],
          },
        })
      }

      if (url.includes(`/api/task-summaries/projects/${projectId}/daily-progress?date=`)) {
        return jsonResponse({
          success: true,
          data: null,
        })
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    fetchMock.mockReset()

    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
    vi.unstubAllGlobals()
  })

  it('renders results summary, summary list, and monthly fulfillment in-page', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/task-summary`]}>
          <Routes>
            <Route path="/projects/:id/task-summary" element={<TaskSummary />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="task-summary-page"]')
    await waitForSelector(container, '[data-testid="task-summary-header-actions"]')
    await waitForSelector(container, '[data-testid="task-summary-results-section"]')
    await waitForSelector(container, '[data-testid="task-summary-summary-list-section"]')
    await waitForSelector(container, '[data-testid="task-summary-monthly-fulfillment-section"]')
    await waitForSelector(container, '[data-testid="task-summary-export"]')

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/task-summaries/projects/${projectId}/task-summary`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
    expect(container.textContent).toContain('结果摘要')
    expect(container.textContent).toContain('总结列表')
    expect(container.textContent).toContain('月度兑现')
  })
})
