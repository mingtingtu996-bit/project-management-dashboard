import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DashboardCompareCard from '../DashboardCompareCard'

function flush() {
  return Promise.resolve()
}

function findButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(text),
  ) as HTMLButtonElement | undefined
}

describe('DashboardCompareCard', () => {
  let container: HTMLDivElement
  let root: Root | null = null
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-19T08:00:00.000Z'))

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/daily-progress')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              date: '2026-04-19',
              progress_change: 0,
              tasks_updated: 0,
              tasks_completed: 0,
              details: [],
            },
          }),
        } as never
      }

      if (url.includes('/task-summary/compare')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [
              {
                period_label: '本月',
                from: '2026-04-01',
                to: '2026-04-30',
                summary: {
                  total_progress_change: 12,
                  tasks_updated: 3,
                  tasks_progressed: 2,
                  tasks_completed: 1,
                  total: 0,
                  on_time: 0,
                  delayed: 0,
                  on_time_rate: 0,
                },
                task_ids: [],
                task_details: [],
              },
            ],
          }),
        } as never
      }

      return {
        ok: true,
        json: async () => ({ success: true }),
      } as never
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
    vi.useRealTimers()
  })

  it('submits month granularity compare requests from the month dimension mode', async () => {
    await act(async () => {
      root?.render(<DashboardCompareCard projectId="project-1" />)
      await flush()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/task-summaries/projects/project-1/daily-progress'),
      expect.anything(),
    )

    fetchMock.mockClear()

    const compareTab = findButton(container, '时段对比')

    expect(compareTab).toBeTruthy()

    await act(async () => {
      compareTab?.click()
      await flush()
    })

    const monthToggle = findButton(container, '按月')
    const runButton = findButton(container, '开始对比')

    expect(monthToggle).toBeTruthy()
    expect(runButton).toBeTruthy()

    await act(async () => {
      monthToggle?.click()
      await flush()
    })

    const monthInputs = Array.from(container.querySelectorAll('input[type="month"]')) as HTMLInputElement[]
    expect(monthInputs.length).toBeGreaterThanOrEqual(2)

    await act(async () => {
      runButton?.click()
      await flush()
    })

    const compareRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/task-summary/compare?'),
    )?.[0]

    expect(compareRequest).toBeTruthy()

    const requestUrl = new URL(String(compareRequest), 'http://localhost')
    expect(requestUrl.searchParams.get('granularity')).toBe('month')

    const periods = JSON.parse(requestUrl.searchParams.get('periods') || '[]')
    expect(periods).toEqual([
      {
        label: '上月',
        from: '2026-03-01',
        to: '2026-03-31',
      },
      {
        label: '本月',
        from: '2026-04-01',
        to: '2026-04-19',
      },
    ])

    await act(async () => {
      await flush()
    })

    expect(container.textContent).toContain('2026-04')
  })
})
