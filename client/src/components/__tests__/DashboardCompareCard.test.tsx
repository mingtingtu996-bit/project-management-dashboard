import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DashboardCompareCard from '../DashboardCompareCard'

function flush() {
  return Promise.resolve()
}

function jsonResponse(payload: unknown) {
  const body = JSON.stringify(payload)
  return {
    ok: true,
    status: 200,
    text: async () => body,
    json: async () => payload,
  } as Response
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
        return jsonResponse({
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
          })
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

        return jsonResponse({
            success: true,
            data: buildCompareResults(periods),
          })
      }

      return jsonResponse({ success: true })
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

  it('renders the segmented compare metrics and loads each granularity on demand', async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={['/projects/project-1/dashboard']}>
          <DashboardCompareCard projectId="project-1" />
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, ['现场快照与对比', '日', '周', '月', '更新任务', '完成任务'])

    let compareCalls = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes('/task-summary/compare?'))

    expect(compareCalls).toHaveLength(1)
    expect(new URL(compareCalls[0], 'http://localhost').searchParams.get('granularity')).toBe('day')
    expect(new URL(compareCalls[0], 'http://localhost').searchParams.get('summaryOnly')).toBe('true')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/daily-progress'))).toBe(false)

    expect(container.textContent).toContain('现场快照与对比')
    expect(container.textContent).toContain('总进度变化')
    expect(container.textContent).toContain('延期任务数')
    expect(container.textContent).toContain('较昨日')
    expect(container.textContent).not.toContain('昨天')
    expect(container.textContent).not.toContain('今天')
    expect(container.textContent).toContain('查看详情')

    const clickSegment = async (label: string) => {
      const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((item) => item.textContent === label)
      expect(button).toBeTruthy()
      await act(async () => {
        button!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await flush()
      })
    }

    await clickSegment('周')
    await waitForText(container, ['较上周'])
    await clickSegment('月')
    await waitForText(container, ['较上月'])

    compareCalls = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes('/task-summary/compare?'))
    expect(new Set(compareCalls.map((url) => new URL(url, 'http://localhost').searchParams.get('granularity')))).toEqual(
      new Set(['day', 'week', 'month']),
    )

    const detailsLink = Array.from(container.querySelectorAll('a')).find((link) =>
      link.getAttribute('href')?.includes('/projects/project-1/reports?view=progress_deviation'),
    )
    expect(detailsLink).toBeTruthy()
  })

  it('renders one empty state instead of metric cards when compare data is unavailable', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/task-summary/compare')) {
        return jsonResponse({ success: true, data: [] })
      }

      return jsonResponse({ success: true })
    })

    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={['/projects/project-1/dashboard']}>
          <DashboardCompareCard projectId="project-1" />
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, ['暂无对比数据', '查看报表'])

    expect(container.textContent).not.toContain('总进度变化')
    expect(container.textContent).not.toContain('延期任务数')
    expect(container.textContent).not.toContain('--')
  })
})
