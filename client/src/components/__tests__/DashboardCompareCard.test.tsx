import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DashboardCompareCard from '../DashboardCompareCard'

function flush() {
  return Promise.resolve()
}

async function waitForText(container: HTMLElement, expected: string[]) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await act(async () => {
      await flush()
    })

    const text = container.textContent || ''
    if (expected.every((item) => text.includes(item))) {
      return
    }
  }

  throw new Error(`Timed out waiting for: ${expected.join(', ')}`)
}

function buildCompareResults(periods: Array<{ period_label: string; from: string; to: string }>) {
  return periods.map((period, index) => ({
    period_label: period.period_label,
    from: period.from,
    to: period.to,
    summary: {
      total_progress_change: index === 0 ? 1.5 : 2.5,
      tasks_updated: index === 0 ? 1 : 2,
      tasks_progressed: index === 0 ? 1 : 2,
      tasks_completed: index === 0 ? 0 : 1,
      total: 0,
      on_time: 0,
      delayed: 0,
      on_time_rate: 0,
    },
    task_ids: [],
    task_details: [],
  }))
}

describe('DashboardCompareCard', () => {
  let container: HTMLDivElement
  let root: Root | null = null
  const fetchMock = vi.fn()

  beforeEach(() => {
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
              snapshot_summary: {
                conditions_added: 1,
                conditions_closed: 1,
                obstacles_added: 0,
                obstacles_closed: 0,
                delayed_tasks: 1,
              },
              details: [],
            },
          }),
        } as never
      }

      if (url.includes('/task-summary/compare')) {
        const query = new URL(url, 'http://localhost')
        const granularity = query.searchParams.get('granularity')
        const periods = granularity === 'month'
          ? [
              { period_label: '上月', from: '2026-03-01', to: '2026-03-01' },
              { period_label: '本月', from: '2026-04-01', to: '2026-04-19' },
            ]
          : granularity === 'week'
            ? [
                { period_label: '上周', from: '2026-04-06', to: '2026-04-12' },
                { period_label: '本周', from: '2026-04-13', to: '2026-04-19' },
              ]
            : [
                { period_label: '昨天', from: '2026-04-18', to: '2026-04-18' },
                { period_label: '今天', from: '2026-04-19', to: '2026-04-19' },
              ]

        return {
          ok: true,
          json: async () => ({
            success: true,
            data: buildCompareResults(periods),
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
  })

  it('renders fixed day, week, and month compare blocks with report link', async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={['/projects/project-1/dashboard']}>
          <DashboardCompareCard projectId="project-1" />
        </MemoryRouter>,
      )
      await flush()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/task-summaries/projects/project-1/daily-progress'),
      expect.anything(),
    )

    await waitForText(container, ['现场快照与对比', '日对比', '周对比', '月对比', '状态变化指标摘要'])

    const compareCalls = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes('/task-summary/compare?'))

    expect(compareCalls).toHaveLength(3)
    expect(new Set(compareCalls.map((url) => new URL(url, 'http://localhost').searchParams.get('granularity')))).toEqual(
      new Set(['day', 'week', 'month']),
    )

    expect(container.textContent).toContain('现场快照与对比')
    expect(container.textContent).toContain('日 / 周 / 月固定对比')
    expect(container.textContent).toContain('日对比')
    expect(container.textContent).toContain('周对比')
    expect(container.textContent).toContain('月对比')
    expect(container.textContent).toContain('状态变化指标摘要')
    expect(container.textContent).toContain('条件新增')
    expect(container.textContent).toContain('查看详情')

    const detailsLink = Array.from(container.querySelectorAll('a')).find((link) =>
      link.getAttribute('href')?.includes('/projects/project-1/reports?view=progress&tab=project_review'),
    )
    expect(detailsLink).toBeTruthy()
  })
})
