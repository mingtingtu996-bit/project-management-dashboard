import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TaskSummary from '../TaskSummary'
import { useStore } from '@/hooks/useStore'

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitForText(container: HTMLElement, expected: string[]) {
  const deadline = Date.now() + 2000

  while (Date.now() < deadline) {
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

function jsonResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data,
  } as never
}

describe('TaskSummary page', () => {
  const projectId = 'project-1'
  const projectName = '综合项目'
  let container: HTMLDivElement
  let root: Root | null = null
  const fetchMock = vi.fn()

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    useStore.setState({
      currentProject: {
        id: projectId,
        name: projectName,
        description: '项目',
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
    })

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/task-summary/assignees')) {
        return jsonResponse({
          success: true,
          data: [
            { assignee: '张三', total: 1, on_time: 1, delayed: 0, on_time_rate: 100 },
          ],
        })
      }

      if (url.includes('/task-summary?')) {
        return jsonResponse({
          success: true,
          data: {
            stats: {
              total_completed: 1,
              on_time_count: 1,
              delayed_count: 0,
              completed_milestone_count: 1,
              avg_delay_days: 0,
            },
            groups: [
              {
                id: 'g1',
                name: '主体结构',
                status: 'completed',
                tasks: [
                  {
                    id: 'task-1',
                    title: '主体结构施工',
                    assignee: '张三',
                    building: '1#楼',
                    section: '土建',
                    completed_at: '2026-04-02 18:00',
                    planned_end_date: '2026-04-01',
                    actual_duration: 2,
                    planned_duration: 1,
                    subtask_total: 2,
                    subtask_on_time: 1,
                    subtask_delayed: 1,
                    delay_total_days: 1,
                    delay_records: [],
                    status_label: 'on_time',
                    confirmed: true,
                  },
                ],
              },
            ],
            timeline_ready: true,
            timeline_events: [],
          },
        })
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    fetchMock.mockReset()
    useStore.setState({ currentProject: null } as never)
    useStore.setState({
      projects: [] as never,
      tasks: [] as never,
      risks: [] as never,
      milestones: [] as never,
      conditions: [] as never,
      obstacles: [] as never,
    })

    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
    vi.unstubAllGlobals()
  })

  it('renders task summary as a task management subpage', async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/task-summary`]}>
          <Routes>
            <Route path="/projects/:id/task-summary" element={<TaskSummary />} />
          </Routes>
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, [
      '任务管理 / 任务总结',
      '只承接已完成任务复盘',
      '返回任务列表',
      '项目 Dashboard',
      '总结列表',
      '完成趋势',
      '责任人',
    ])

    expect(container.textContent).not.toContain('AI 报告')
    expect(container.textContent).not.toContain('导出报告')
    expect(container.textContent).not.toContain('多选')
  })
})
