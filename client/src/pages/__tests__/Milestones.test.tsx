import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Milestones from '../Milestones'
import { DashboardApiService } from '@/services/dashboardApi'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
  }
})

vi.mock('@/services/dashboardApi', () => ({
  DashboardApiService: {
    getProjectSummary: vi.fn(),
  },
}))

const mockedUseNavigate = vi.mocked(useNavigate)
const mockedGetProjectSummary = vi.mocked(DashboardApiService.getProjectSummary)

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

describe('Milestones', () => {
  let container: HTMLDivElement
  let root: Root | null = null
  const navigateMock = vi.fn()

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockedUseNavigate.mockReturnValue(navigateMock)
    mockedGetProjectSummary.mockResolvedValue({
      id: 'project-1',
      name: '城市中心广场项目（二期）',
      milestoneOverview: {
        stats: {
          total: 2,
          pending: 1,
          completed: 1,
          overdue: 0,
          upcomingSoon: 1,
          completionRate: 50,
        },
        items: [
          {
            id: 'm1',
            name: '主体封顶',
            description: '结构施工关键节点',
            targetDate: '2026-04-01',
            progress: 100,
            status: 'completed',
            statusLabel: '已完成',
            updatedAt: '2026-04-01T00:00:00.000Z',
          },
          {
            id: 'm2',
            name: '地下室施工',
            description: '正在推进',
            targetDate: '2026-04-06',
            progress: 60,
            status: 'soon',
            statusLabel: '即将到期',
            updatedAt: '2026-04-02T00:00:00.000Z',
          },
        ],
      },
    } as never)
  })

  afterEach(() => {
    mockedUseNavigate.mockReset()
    mockedGetProjectSummary.mockReset()
    navigateMock.mockReset()
    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
  })

  it('renders the milestone page from shared summary and routes edits back to the task list', async () => {
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={['/projects/project-1/milestones']}>
          <Routes>
            <Route path="/projects/:id/milestones" element={<Milestones />} />
          </Routes>
        </MemoryRouter>,
      )
      await flush()
    })

    await waitForText(container, ['城市中心广场项目（二期）', '待完成', '已完成', '即将到期', '去任务列表', '在任务列表打开'])

    expect(container.textContent).toContain('城市中心广场项目（二期）')
    expect(container.textContent).toContain('待完成')
    expect(container.textContent).toContain('已完成')
    expect(container.textContent).toContain('即将到期')
    expect(container.textContent).not.toContain('添加里程碑')
    expect(container.textContent).not.toContain('单独完成')
    expect(container.textContent).not.toContain('保存')

    const editButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('去任务列表'),
    ) as HTMLButtonElement | undefined
    expect(editButton).toBeTruthy()

    await act(async () => {
      editButton?.click()
      await flush()
    })

    expect(navigateMock).toHaveBeenCalledWith('/projects/project-1/gantt')
  })
})
