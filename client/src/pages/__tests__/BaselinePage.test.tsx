import type { ReactNode } from 'react'

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'

import { usePlanningStore, type PlanningValidationIssue } from '@/hooks/usePlanningStore'
import { useStore } from '@/hooks/useStore'
import { ApiClientError, apiGet, apiPost, getApiErrorMessage } from '@/lib/apiClient'
import type { BaselineItem, BaselineVersion, PlanningDraftLockRecord } from '@/types/planning'
import { buildPlanningDraftResumeKey } from '../planning/draftPersistence'

import BaselinePage from '../planning/BaselinePage'

vi.mock('@/lib/apiClient', () => ({
  ApiClientError: class extends Error {
    status: number | null
    url: string
    code: 'backend_unavailable' | 'network_error' | 'http_error'
    rawText: string

    constructor(
      message: string,
      options: {
        status?: number | null
        url: string
        code: 'backend_unavailable' | 'network_error' | 'http_error'
        rawText?: string
      },
    ) {
      super(message)
      this.name = 'ApiClientError'
      this.status = options.status ?? null
      this.url = options.url
      this.code = options.code
      this.rawText = options.rawText ?? ''
    }
  },
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  getApiErrorMessage: vi.fn(),
}))

const mockedApiGet = vi.mocked(apiGet)
const mockedApiPost = vi.mocked(apiPost)
const mockedGetApiErrorMessage = vi.mocked(getApiErrorMessage)

type BaselineDetail = BaselineVersion & { items: BaselineItem[] }

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

async function waitForText(container: HTMLElement, expected: string[]) {
  await waitForCondition(() => {
    const text = container.textContent || ''
    return expected.every((item) => text.includes(item))
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

async function clickButtonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button'))
    .filter((item) => item.textContent?.includes(text))
    .at(-1) as HTMLButtonElement | undefined

  expect(button).toBeTruthy()

  await act(async () => {
    button?.click()
    await flush()
  })
}

async function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

  await act(async () => {
    input.focus()
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
  })
}

async function setFileInput(input: HTMLInputElement, file: File) {
  await act(async () => {
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
  })
}

async function setSelectValue(select: HTMLSelectElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set

  await act(async () => {
    valueSetter?.call(select, value)
    select.dispatchEvent(new Event('input', { bubbles: true }))
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
  })
}

async function blurInput(input: HTMLInputElement) {
  await act(async () => {
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await flush()
  })
}

async function pressKey(input: HTMLInputElement, key: string) {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    await flush()
  })
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const validationIssues: PlanningValidationIssue[] = [
  {
    id: 'baseline-v7-l2',
    level: 'error',
    title: 'L2 节点存在阻断项',
    detail: '主体工程节点缺少必要校核信息，需要先修正再冻结。',
  },
  {
    id: 'baseline-v7-l3',
    level: 'warning',
    title: 'L3 节点建议补充说明',
    detail: '结构施工节点可补充处理摘要，方便后续确认。',
  },
]

let currentVersions: BaselineVersion[]
let currentDetails: Record<string, BaselineDetail>
let currentLocks: Record<string, PlanningDraftLockRecord>
let localStorageState: Map<string, string>

function seedBaselineFixtures() {
  const timestamps = {
    created_at: '2026-04-15T08:00:00.000Z',
    updated_at: '2026-04-15T08:30:00.000Z',
  }

  const confirmedItems: BaselineItem[] = [
    {
      id: 'baseline-v6-root',
      project_id: 'project-1',
      baseline_version_id: 'baseline-v6',
      title: '项目基线 L1',
      source_task_id: 'task-root',
      sort_order: 0,
      mapping_status: 'mapped',
    },
    {
      id: 'baseline-v6-l2',
      project_id: 'project-1',
      baseline_version_id: 'baseline-v6',
      parent_item_id: 'baseline-v6-root',
      title: '主体工程 L2',
      source_task_id: 'task-l2',
      sort_order: 1,
      mapping_status: 'mapped',
    },
    {
      id: 'baseline-v6-l3',
      project_id: 'project-1',
      baseline_version_id: 'baseline-v6',
      parent_item_id: 'baseline-v6-l2',
      title: '结构施工 L3',
      source_task_id: 'task-l3',
      target_progress: 55,
      sort_order: 2,
      mapping_status: 'mapped',
      is_critical: true,
    },
    {
      id: 'baseline-v6-l5',
      project_id: 'project-1',
      baseline_version_id: 'baseline-v6',
      parent_item_id: 'baseline-v6-l3',
      title: '交付收尾 L5',
      source_milestone_id: 'milestone-l5',
      planned_end_date: '2026-09-20',
      sort_order: 3,
      mapping_status: 'mapped',
      is_milestone: true,
    },
  ]

  const draftItems: BaselineItem[] = [
    {
      id: 'baseline-v7-root',
      project_id: 'project-1',
      baseline_version_id: 'baseline-v7',
      title: '项目基线 L1',
      source_task_id: 'task-root',
      sort_order: 0,
      mapping_status: 'mapped',
    },
    {
      id: 'baseline-v7-l2',
      project_id: 'project-1',
      baseline_version_id: 'baseline-v7',
      parent_item_id: 'baseline-v7-root',
      title: '主体工程 L2',
      source_task_id: 'task-l2',
      sort_order: 1,
      mapping_status: 'mapped',
    },
    {
      id: 'baseline-v7-l3',
      project_id: 'project-1',
      baseline_version_id: 'baseline-v7',
      parent_item_id: 'baseline-v7-l2',
      title: '结构施工 L3',
      source_task_id: 'task-l3',
      target_progress: 60,
      sort_order: 2,
      mapping_status: 'mapped',
      is_critical: true,
    },
    {
      id: 'baseline-v7-l4',
      project_id: 'project-1',
      baseline_version_id: 'baseline-v7',
      parent_item_id: 'baseline-v7-l3',
      title: '月度收口 L4',
      source_task_id: 'task-l4',
      sort_order: 3,
      mapping_status: 'pending',
    },
    {
      id: 'baseline-v7-l5',
      project_id: 'project-1',
      baseline_version_id: 'baseline-v7',
      parent_item_id: 'baseline-v7-l4',
      title: '交付收尾 L5',
      source_milestone_id: 'milestone-l5',
      planned_end_date: '2026-09-28',
      sort_order: 4,
      mapping_status: 'mapped',
      is_milestone: true,
    },
  ]

  currentVersions = [
    {
      id: 'baseline-v7',
      project_id: 'project-1',
      version: 7,
      status: 'draft',
      title: '城市中心广场项目（二期） 基线',
      description: '基于 v6 生成的草稿快照',
      source_type: 'manual',
      source_version_id: 'baseline-v6',
      source_version_label: 'v6',
      ...timestamps,
    },
    {
      id: 'baseline-v6',
      project_id: 'project-1',
      version: 6,
      status: 'confirmed',
      title: '城市中心广场项目（二期） 基线',
      description: '已确认版本',
      source_type: 'manual',
      confirmed_at: timestamps.updated_at,
      confirmed_by: 'user-1',
      ...timestamps,
    },
  ]

  currentDetails = {
    'baseline-v6': {
      ...currentVersions[1],
      items: confirmedItems,
    },
    'baseline-v7': {
      ...currentVersions[0],
      items: draftItems,
    },
  }

  currentLocks = {
    'baseline-v7': {
      id: 'lock-v7',
      project_id: 'project-1',
      draft_type: 'baseline',
      resource_id: 'baseline-v7',
      locked_by: 'user-1',
      locked_at: '2026-04-15T08:30:00.000Z',
      lock_expires_at: '2099-04-15T09:00:00.000Z',
      is_locked: true,
      version: 1,
      created_at: '2026-04-15T08:30:00.000Z',
      updated_at: '2026-04-15T08:30:00.000Z',
    },
  }
}

describe('BaselinePage planning workflow', () => {
  beforeEach(() => {
    seedBaselineFixtures()
    localStorageState = new Map()

    useStore.setState({
      currentProject: {
        id: 'project-1',
        name: '城市中心广场项目（二期）',
        status: 'active',
      } as never,
    } as never)

    usePlanningStore.setState({
      activeWorkspace: 'baseline',
      selectedItemIds: [],
      draftStatus: 'idle',
      validationIssues,
      confirmDialog: { open: false, target: null, title: '', description: '' },
    } as never)

    mockedGetApiErrorMessage.mockImplementation((error, fallback = '请稍后重试。') => {
      if (error instanceof Error && error.message) return error.message
      return fallback
    })
    vi.mocked(window.localStorage.getItem).mockImplementation((key: string) =>
      localStorageState.has(key) ? localStorageState.get(key) ?? null : null,
    )
    vi.mocked(window.localStorage.setItem).mockImplementation((key: string, value: string) => {
      localStorageState.set(key, String(value))
    })
    vi.mocked(window.localStorage.removeItem).mockImplementation((key: string) => {
      localStorageState.delete(key)
    })
    vi.mocked(window.localStorage.clear).mockImplementation(() => {
      localStorageState.clear()
    })

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/task-baselines?project_id=')) {
        return deepClone(currentVersions)
      }

      const baselineId = url.split('/').at(-1) ?? ''
      const detail = currentDetails[baselineId]
      if (detail) return deepClone(detail)

      throw new Error(`Unexpected GET ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string, body?: unknown) => {
      if (url === '/api/task-baselines/baseline-v7/lock') {
        return { lock: deepClone(currentLocks['baseline-v7']) }
      }

      if (url === '/api/task-baselines/baseline-v7/force-unlock') {
        currentLocks['baseline-v7'] = {
          ...currentLocks['baseline-v7'],
          is_locked: false,
          released_at: '2026-04-15T08:35:00.000Z',
          released_by: 'user-1',
          release_reason: 'force_unlock',
        }
        return { lock: deepClone(currentLocks['baseline-v7']) }
      }

      if (url === '/api/task-baselines') {
        const payload = body as { items?: Array<Record<string, unknown>> }
        const nextVersion = 8
        const nextId = `baseline-v${nextVersion}`
        const nextItems = (payload.items ?? []).map((item, index) => ({
          id: `${nextId}-item-${index + 1}`,
          project_id: 'project-1',
          baseline_version_id: nextId,
          parent_item_id: (item.parent_item_id as string | null | undefined) ?? null,
          source_task_id: (item.source_task_id as string | null | undefined) ?? null,
          source_milestone_id: (item.source_milestone_id as string | null | undefined) ?? null,
          title: String(item.title ?? `条目 ${index + 1}`),
          planned_start_date: (item.planned_start_date as string | null | undefined) ?? null,
          planned_end_date: (item.planned_end_date as string | null | undefined) ?? null,
          target_progress: (item.target_progress as number | null | undefined) ?? null,
          sort_order: index,
          is_milestone: Boolean(item.is_milestone),
          is_critical: Boolean(item.is_critical),
          mapping_status: (item.mapping_status as BaselineItem['mapping_status']) ?? 'mapped',
          notes: (item.notes as string | null | undefined) ?? null,
        }))

        const created: BaselineDetail = {
          id: nextId,
          project_id: 'project-1',
          version: nextVersion,
          status: 'draft',
          title: '城市中心广场项目（二期） 基线',
          description: '基于 v7 生成的草稿快照',
          source_type: 'manual',
          source_version_id: 'baseline-v7',
          source_version_label: 'v7',
          created_at: '2026-04-15T08:45:00.000Z',
          updated_at: '2026-04-15T08:45:00.000Z',
          items: nextItems,
        }

        currentVersions = [created, ...currentVersions]
        currentDetails[nextId] = created
        currentLocks[nextId] = {
          id: `lock-${nextId}`,
          project_id: 'project-1',
          draft_type: 'baseline',
          resource_id: nextId,
          locked_by: 'user-1',
          locked_at: '2026-04-15T08:45:00.000Z',
          lock_expires_at: '2099-04-15T09:15:00.000Z',
          is_locked: true,
          version: 1,
          created_at: '2026-04-15T08:45:00.000Z',
          updated_at: '2026-04-15T08:45:00.000Z',
        }

        return deepClone(created)
      }

      if (url === '/api/task-baselines/baseline-v8/lock') {
        return { lock: deepClone(currentLocks['baseline-v8']) }
      }

      if (url === '/api/task-baselines/baseline-v7/confirm') {
        const confirmed: BaselineDetail = {
          ...currentDetails['baseline-v7'],
          status: 'confirmed',
          confirmed_at: '2026-04-15T08:50:00.000Z',
          confirmed_by: 'user-1',
          updated_at: '2026-04-15T08:50:00.000Z',
        }

        currentDetails['baseline-v7'] = confirmed
        currentVersions = currentVersions.map((version) =>
          version.id === 'baseline-v7'
            ? { ...version, status: 'confirmed', confirmed_at: '2026-04-15T08:50:00.000Z', confirmed_by: 'user-1' }
            : version,
        )
        delete currentLocks['baseline-v7']

        return deepClone(confirmed)
      }

      throw new Error(`Unexpected POST ${url}`)
    })
  })

  afterEach(() => {
    useStore.setState({ currentProject: null } as never)
    usePlanningStore.setState({
      activeWorkspace: 'baseline',
      selectedItemIds: [],
      draftStatus: 'idle',
      validationIssues: [],
    } as never)

    mockedApiGet.mockReset()
    mockedApiPost.mockReset()
    mockedGetApiErrorMessage.mockReset()
    vi.mocked(window.localStorage.getItem).mockReset()
    vi.mocked(window.localStorage.setItem).mockReset()
    vi.mocked(window.localStorage.removeItem).mockReset()
    vi.mocked(window.localStorage.clear).mockReset()
    window.localStorage.clear()
  })

  it('loads the latest draft, acquires the edit lock, and renders the real version summary', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForText(container, [
      '基线编辑',
      '可编辑态',
      '当前草稿基于 v6 继续整理',
      'v6 → v7',
      'v7 · 草稿 · 5 项',
    ])

    expect(mockedApiPost).toHaveBeenCalledWith(
      '/api/task-baselines/baseline-v7/lock',
      undefined,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    cleanup()
  })

  it('switches to another baseline version from the history selector', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForCondition(() => Boolean(container.querySelector('[data-testid="baseline-version-chip-baseline-v6"]')))

    await act(async () => {
      ;(container.querySelector('[data-testid="baseline-version-chip-baseline-v6"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForText(container, ['v6 · 已确认', '只读查看态'])
    cleanup()
  })

  it('renders a diff preview in the history sidebar', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForCondition(() => Boolean(container.querySelector('[data-testid="baseline-diff-preview"]')))
    await waitForText(container, ['版本差异总览', '3 项变更', '月度收口 L4', '交付收尾 L5'])

    cleanup()
  })

  it('allows choosing a specific compare version from the history sidebar', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForCondition(() => Boolean(container.querySelector('[data-testid="baseline-version-chip-baseline-v6"]')))

    await act(async () => {
      ;(container.querySelector('[data-testid="baseline-version-chip-baseline-v6"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForCondition(() => Boolean(container.querySelector('[data-testid="baseline-compare-version-select"]')))

    await setSelectValue(
      container.querySelector('[data-testid="baseline-compare-version-select"]') as HTMLSelectElement,
      'baseline-v7',
    )

    await waitForText(container, ['v7 → v6', '3 项变更', '月度收口 L4'])

    cleanup()
  })

  it('falls back to read-only when the draft lock cannot be acquired', async () => {
    mockedApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/task-baselines/baseline-v7/lock') {
        throw new Error('当前草稿暂时无法获取编辑锁，已切换为只读查看。')
      }
      throw new Error(`Unexpected POST ${url}`)
    })

    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForText(container, [
      '只读查看态',
      '当前草稿暂时无法获取编辑锁，已切换为只读查看。',
      '未持有编辑锁',
    ])

    cleanup()
  })

  it('shows the no-baseline entry selector when the project has no baseline yet', async () => {
    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/task-baselines?project_id=')) return [] as never
      throw new Error(`Unexpected GET ${url}`)
    })

    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForText(container, [
      '首版基线创建入口',
      '新建空白基线',
      '从当前排期生成',
      '导入计划文件',
    ])

    await clickButtonByText(container, '从当前排期生成')
    await waitForText(container, ['已选择“从当前排期生成”'])

    cleanup()
  })

  it('parses an imported spreadsheet and creates an imported baseline draft', async () => {
    let importedCreated = false
    const importLockRecord = {
      id: 'lock-baseline-import',
      project_id: 'project-1',
      draft_type: 'baseline',
      resource_id: 'baseline-import-v1',
      locked_by: 'user-1',
      locked_at: '2026-04-15T08:00:00.000Z',
      lock_expires_at: '2099-04-15T10:00:00.000Z',
      is_locked: true,
      version: 1,
      created_at: '2026-04-15T08:00:00.000Z',
      updated_at: '2026-04-15T08:00:00.000Z',
    } satisfies PlanningDraftLockRecord
    const importedDetail: BaselineDetail = {
      id: 'baseline-import-v1',
      project_id: 'project-1',
      version: 1,
      status: 'draft',
      title: '示例项目导入基线',
      description: '来源文件 baseline-import.xlsx / 工作表 导入基线',
      source_type: 'imported_file',
      source_version_id: null,
      source_version_label: 'baseline-import.xlsx',
      created_at: '2026-04-15T08:00:00.000Z',
      updated_at: '2026-04-15T08:00:00.000Z',
      items: [
        {
          id: 'import-item-1',
          project_id: 'project-1',
          baseline_version_id: 'baseline-import-v1',
          title: '导入结构 L1',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-12',
          target_progress: 60,
          sort_order: 0,
          is_milestone: false,
          is_critical: false,
          mapping_status: 'pending',
          notes: '来自文件导入',
        },
      ],
    }

    mockedApiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/task-baselines?project_id=')) {
        return importedCreated ? [{ ...importedDetail, items: undefined } as never] : [] as never
      }
      if (url === '/api/task-baselines/baseline-import-v1') return importedDetail as never
      throw new Error(`Unexpected GET ${url}`)
    })

    mockedApiPost.mockImplementation(async (url: string, body?: unknown) => {
      if (url === '/api/task-baselines') {
        importedCreated = true
        return importedDetail as never
      }
      if (url === '/api/task-baselines/baseline-import-v1/lock') {
        return { lock: importLockRecord } as never
      }
      throw new Error(`Unexpected POST ${url}`)
    })

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet([
      {
        任务名称: '导入结构 L1',
        开始日期: '2026-05-01',
        结束日期: '2026-05-12',
        目标进度: 60,
        备注: '来自文件导入',
      },
    ])
    XLSX.utils.book_append_sheet(workbook, worksheet, '导入基线')
    const file = new File(
      [XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })],
      'baseline-import.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    )

    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForText(container, ['导入计划文件'])
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null
    expect(fileInput).toBeTruthy()

    await setFileInput(fileInput as HTMLInputElement, file)
    await waitForText(container, ['导入预览', 'baseline-import.xlsx', '导入结构 L1'])

    await clickButtonByText(container, '生成导入基线草稿')
    await waitForCondition(() => mockedApiPost.mock.calls.some(([url]) => url === '/api/task-baselines'))

    const createCall = mockedApiPost.mock.calls.find(([url]) => url === '/api/task-baselines')
    expect(createCall?.[1]).toMatchObject({
      source_type: 'imported_file',
      source_version_label: 'baseline-import.xlsx',
    })
    expect((createCall?.[1] as { items?: Array<Record<string, unknown>> } | undefined)?.items?.[0]).toMatchObject({
      title: '导入结构 L1',
      planned_start_date: '2026-05-01',
      planned_end_date: '2026-05-12',
      target_progress: 60,
      mapping_status: 'pending',
    })

    cleanup()
  })

  it('prompts to continue or discard the local draft workspace snapshot', async () => {
    window.localStorage.setItem(
      buildPlanningDraftResumeKey('baseline', 'project-1'),
      JSON.stringify({
        resourceId: 'baseline-v7',
        versionLabel: 'v7',
        updatedAt: '2026-04-15T08:30:00.000Z',
        workspaceLabel: '项目基线',
      }),
    )

    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForCondition(() => Boolean(document.body.querySelector('[data-testid="planning-draft-resume-dialog"]')))
    const resumeDialog = document.body.querySelector('[data-testid="planning-draft-resume-dialog"]') as HTMLElement | null
    expect(resumeDialog?.textContent).toContain('v7')

    const dialogButtons = resumeDialog?.querySelectorAll('button') ?? []
    expect(dialogButtons.length).toBeGreaterThanOrEqual(2)

    await act(async () => {
      ;(dialogButtons[0] as HTMLButtonElement | undefined)?.click()
      await flush()
    })

    await waitForText(container, ['已放弃本地草稿工作区状态'])
    expect(window.localStorage.getItem(buildPlanningDraftResumeKey('baseline', 'project-1'))).toBeNull()

    cleanup()
  })

  it('opens the confirm dialog with real diff data', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForText(container, ['进入确认发布'])
    await clickButtonByText(container, '进入确认发布')

    await waitForText(document.body, [
      '基线确认弹窗',
      '当前版本',
      '目标版本',
      '新增',
      '修改',
      '里程碑变动',
      '当前存在阻断项，修正后才能确认发布。',
    ])

    await clickButtonByText(document.body, '查看完整差异')
    await waitForText(document.body, ['完整差异视图', 'v6 vs v7', '月度收口 L4', '交付收尾 L5'])

    cleanup()
  })

  it('opens revision pool and change log deep links from the baseline sidebar', async () => {
    const mountBaseline = () =>
      mount(
        <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
          <Routes>
            <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
            <Route path="/projects/:id/planning/revision-pool" element={<RouteSearchProbe testId="baseline-route-probe" />} />
            <Route path="/projects/:id/reports" element={<RouteSearchProbe testId="baseline-route-probe" />} />
          </Routes>
        </MemoryRouter>,
      )

    let view = mountBaseline()
    await waitForCondition(() => Boolean(view.container.querySelector('[data-testid="baseline-open-revision-pool"]')))

    await act(async () => {
      ;(view.container.querySelector('[data-testid="baseline-open-revision-pool"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForCondition(() => Boolean(view.container.querySelector('[data-testid="baseline-route-probe"]')))
    expect(view.container.querySelector('[data-testid="baseline-route-probe"]')?.textContent).toContain('/projects/project-1/planning/revision-pool')
    view.cleanup()

    view = mountBaseline()
    await waitForCondition(() => Boolean(view.container.querySelector('[data-testid="baseline-open-change-log"]')))

    await act(async () => {
      ;(view.container.querySelector('[data-testid="baseline-open-change-log"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForCondition(() => Boolean(view.container.querySelector('[data-testid="baseline-route-probe"]')))
    expect(view.container.querySelector('[data-testid="baseline-route-probe"]')?.textContent).toContain('/projects/project-1/reports?view=change_log')
    view.cleanup()
  })

  it('guards leaving the baseline page when there are unsaved edits', async () => {
    const view = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
          <Route path="/projects/:id/reports" element={<RouteSearchProbe testId="baseline-guard-route" />} />
        </Routes>
      </MemoryRouter>,
    )

    const titleSelector = '[data-baseline-editor-cell="baseline-v7-l3:title"]'
    await waitForCondition(() => Boolean(view.container.querySelector(titleSelector)))

    await setInputValue(view.container.querySelector(titleSelector) as HTMLInputElement, '结构施工 L3 守卫验证')
    await pressKey(view.container.querySelector(titleSelector) as HTMLInputElement, 'Enter')
    expect((view.container.querySelector(titleSelector) as HTMLInputElement | null)?.value).toBe('结构施工 L3 守卫验证')

    await act(async () => {
      ;(view.container.querySelector('[data-testid="baseline-open-change-log"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForCondition(() => Boolean(document.body.querySelector('[data-testid="baseline-unsaved-changes-dialog"]')))
    expect(document.body.textContent).toContain('基线草稿还有未保存调整')

    await clickButtonByText(document.body, '继续编辑')
    await waitForCondition(() => !document.body.querySelector('[data-testid="baseline-unsaved-changes-dialog"]'))
    expect(view.container.querySelector('[data-testid="baseline-guard-route"]')).toBeNull()

    await act(async () => {
      ;(view.container.querySelector('[data-testid="baseline-open-change-log"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForCondition(() => Boolean(document.body.querySelector('[data-testid="baseline-unsaved-changes-dialog"]')))
    await clickButtonByText(document.body, '确认离开')
    await waitForCondition(() => Boolean(view.container.querySelector('[data-testid="baseline-guard-route"]')))
    expect(view.container.querySelector('[data-testid="baseline-guard-route"]')?.textContent).toContain(
      '/projects/project-1/reports?view=change_log',
    )

    view.cleanup()
  })

  it('opens the revision pool dialog from the baseline info bar', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForCondition(() => Boolean(container.querySelector('[data-testid="baseline-info-open-revision-pool"]')))

    await act(async () => {
      ;(container.querySelector('[data-testid="baseline-info-open-revision-pool"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForCondition(() => Boolean(document.body.querySelector('[data-testid="baseline-revision-pool-dialog"]')))
    expect(document.body.querySelector('[data-testid="baseline-revision-candidate-list"]')).toBeTruthy()
    expect(document.body.querySelector('[data-testid="baseline-revision-action-bar"]')).toBeTruthy()

    cleanup()
  })

  it('filters to mapping-attention rows and toggles the validation panel', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForCondition(() => Boolean(container.querySelector('[data-testid="baseline-info-bar"]')))

    await act(async () => {
      ;(container.querySelector('[data-testid="baseline-filter-mapping-attention"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    await waitForText(container, ['当前视图 1 项', '月度收口 L4'])

    await act(async () => {
      ;(container.querySelector('[data-testid="baseline-validation-toggle"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    expect(container.textContent).toContain('展开校核面板')
    expect(container.textContent).not.toContain('L2 节点存在阻断项')

    cleanup()
  })

  it('saves a new draft snapshot through the task-baselines API', async () => {
    usePlanningStore.setState({ validationIssues: [] } as never)

    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForText(container, ['保存草稿', 'v6 → v7'])
    await clickButtonByText(container, '保存草稿')

    await waitForCondition(() => mockedApiPost.mock.calls.some(([url]) => url === '/api/task-baselines'))

    const createCall = mockedApiPost.mock.calls.find(([url]) => url === '/api/task-baselines')
    expect(createCall?.[1]).toMatchObject({
      project_id: 'project-1',
      source_version_id: 'baseline-v7',
      source_version_label: 'v7',
    })

    await waitForText(container, ['v6 → v8', 'v8 · 草稿'])
    cleanup()
  })

  it('supports inline editing for title, dates, and target progress before save', async () => {
    usePlanningStore.setState({ validationIssues: [] } as never)

    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForCondition(() =>
      Boolean(container.querySelector('[data-baseline-editor-cell="baseline-v7-l3:title"]')),
    )

    const titleInput = container.querySelector(
      '[data-baseline-editor-cell="baseline-v7-l3:title"]',
    ) as HTMLInputElement | null
    const startInput = container.querySelector(
      '[data-baseline-editor-cell="baseline-v7-l3:start"]',
    ) as HTMLInputElement | null
    const endInput = container.querySelector(
      '[data-baseline-editor-cell="baseline-v7-l3:end"]',
    ) as HTMLInputElement | null
    const progressInput = container.querySelector(
      '[data-baseline-editor-cell="baseline-v7-l3:progress"]',
    ) as HTMLInputElement | null

    expect(titleInput).toBeTruthy()
    expect(startInput).toBeTruthy()
    expect(endInput).toBeTruthy()
    expect(progressInput).toBeTruthy()

    await setInputValue(titleInput as HTMLInputElement, '结构施工 L3 调整')
    await pressKey(titleInput as HTMLInputElement, 'Enter')
    await setInputValue(startInput as HTMLInputElement, '2026-07-01')
    await blurInput(startInput as HTMLInputElement)
    await setInputValue(endInput as HTMLInputElement, '2026-07-20')
    await blurInput(endInput as HTMLInputElement)
    await setInputValue(progressInput as HTMLInputElement, '88')
    await blurInput(progressInput as HTMLInputElement)

    await clickButtonByText(container, '保存草稿')

    const createCall = mockedApiPost.mock.calls.find(([url]) => url === '/api/task-baselines')
    const payload = createCall?.[1] as { items?: Array<Record<string, unknown>> } | undefined
    const editedItem = payload?.items?.find((item) => item.title === '结构施工 L3 调整')

    expect(editedItem).toMatchObject({
      title: '结构施工 L3 调整',
      planned_start_date: '2026-07-01',
      planned_end_date: '2026-07-20',
      target_progress: 88,
    })

    cleanup()
  })

  it('supports undo and redo for committed field edits', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    const titleSelector = '[data-baseline-editor-cell="baseline-v7-l3:title"]'
    await waitForCondition(() => Boolean(container.querySelector(titleSelector)))

    expect((container.querySelector(titleSelector) as HTMLInputElement | null)?.value).toBe('结构施工 L3')

    await setInputValue(container.querySelector(titleSelector) as HTMLInputElement, '结构施工 L3 调整')
    await pressKey(container.querySelector(titleSelector) as HTMLInputElement, 'Enter')
    expect((container.querySelector(titleSelector) as HTMLInputElement | null)?.value).toBe('结构施工 L3 调整')

    await clickButtonByText(container, '撤销')
    expect((container.querySelector(titleSelector) as HTMLInputElement | null)?.value).toBe('结构施工 L3')

    await clickButtonByText(container, '重做')
    expect((container.querySelector(titleSelector) as HTMLInputElement | null)?.value).toBe('结构施工 L3 调整')

    cleanup()
  })

  it('supports batch shift and batch progress updates before save', async () => {
    usePlanningStore.setState({ validationIssues: [] } as never)

    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForCondition(() => Boolean(container.querySelector('[data-testid="baseline-batch-bar"]')))

    await clickButtonByText(container, '取消全选')

    await act(async () => {
      ;(container.querySelector('[aria-label="toggle-baseline-v7-l5"]') as HTMLButtonElement | null)?.click()
      await flush()
    })

    const batchBar = container.querySelector('[data-testid="baseline-batch-bar"]') as HTMLElement | null
    expect(batchBar).toBeTruthy()

    const batchInputs = batchBar?.querySelectorAll('input') ?? []
    expect(batchInputs.length).toBe(2)

    await setInputValue(batchInputs[0] as HTMLInputElement, '2')
    await blurInput(batchInputs[0] as HTMLInputElement)
    await clickButtonByText(container, '平移日期')
    await setInputValue(batchInputs[1] as HTMLInputElement, '88')
    await blurInput(batchInputs[1] as HTMLInputElement)
    await clickButtonByText(container, '设目标进度')
    await clickButtonByText(container, '保存草稿')

    const createCall = mockedApiPost.mock.calls.find(([url]) => url === '/api/task-baselines')
    const payload = createCall?.[1] as { items?: Array<Record<string, unknown>> } | undefined

    expect(payload?.items).toHaveLength(1)
    expect(payload?.items?.[0]).toMatchObject({
      title: '交付收尾 L5',
      planned_end_date: '2026-09-30',
      target_progress: 88,
    })

    cleanup()
  })

  it('confirms the active draft through the task-baselines API', async () => {
    usePlanningStore.setState({ validationIssues: [] } as never)

    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForText(container, ['进入确认发布'])
    await clickButtonByText(container, '进入确认发布')
    await clickButtonByText(document.body, '确认发布')

    await waitForCondition(() => mockedApiPost.mock.calls.some(([url]) => url === '/api/task-baselines/baseline-v7/confirm'))
    const confirmCall = mockedApiPost.mock.calls.find(([url]) => url === '/api/task-baselines/baseline-v7/confirm')
    expect(confirmCall?.[1]).toEqual({ version: 7 })

    await waitForText(container, ['当前展示的是已确认版本', 'v7 · 已确认'])
    cleanup()
  })

  it('keeps the confirm dialog open and surfaces realignment guidance on REQUIRES_REALIGNMENT', async () => {
    usePlanningStore.setState({ validationIssues: [] } as never)
    mockedGetApiErrorMessage.mockImplementation((error, fallback = '请稍后重试。') => {
      if (error instanceof ApiClientError && error.rawText) {
        try {
          const parsed = JSON.parse(error.rawText)
          return parsed?.error?.message ?? fallback
        } catch {
          return error.message || fallback
        }
      }

      if (error instanceof Error && error.message) return error.message
      return fallback
    })

    mockedApiPost.mockImplementation(async (url: string, body?: unknown) => {
      if (url === '/api/task-baselines/baseline-v7/confirm') {
        expect(body).toEqual({ version: 7 })
        throw new ApiClientError('当前基线有效性已触发待重整阈值', {
          status: 422,
          url,
          code: 'http_error',
          rawText: JSON.stringify({
            success: false,
            error: {
              code: 'REQUIRES_REALIGNMENT',
              message:
                '当前基线有效性已触发待重整阈值：任务偏差率 100%，里程碑偏移 0 个、平均 0 天，总工期偏差 360%。触发规则：任务偏差率超过 40%、总工期偏差超过 10%。请先发起重排或修订后再确认。',
            },
          }),
        })
      }

      throw new Error(`Unexpected POST ${url}`)
    })

    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForText(container, ['进入确认发布'])
    await clickButtonByText(container, '进入确认发布')
    await clickButtonByText(document.body, '确认发布')

    await waitForText(document.body, [
      '发布失败态',
      '待重整阈值',
      '打开计划修订候选',
      '回到草稿继续处理',
      '触发摘要',
      '任务偏差率',
      '100%',
      '总工期偏差',
      '360%',
      '任务偏差率超过 40%',
    ])

    const confirmButton = Array.from(document.body.querySelectorAll('button'))
      .filter((button) => button.textContent?.includes('确认发布'))
      .at(-1) as HTMLButtonElement | undefined
    expect(confirmButton?.disabled).toBe(true)

    await clickButtonByText(document.body, '打开计划修订候选')
    await waitForCondition(() => Boolean(document.body.querySelector('[data-testid="baseline-revision-pool-dialog"]')))
    expect(document.body.textContent || '').toContain('已打开计划修订候选，可先整理待重整项后再回到确认流程。')

    cleanup()
  })

  it('queues the confirmed baseline into pending realignment', async () => {
    currentVersions = currentVersions.map((version) =>
      version.id === 'baseline-v7'
        ? { ...version, status: 'confirmed', confirmed_at: '2026-04-15T09:00:00.000Z' }
        : version.id === 'baseline-v6'
          ? { ...version, status: 'archived' }
          : version,
    )
    currentDetails['baseline-v7'] = {
      ...currentDetails['baseline-v7'],
      status: 'confirmed',
      confirmed_at: '2026-04-15T09:00:00.000Z',
    }
    currentDetails['baseline-v6'] = {
      ...currentDetails['baseline-v6'],
      status: 'archived',
    }

    mockedApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/task-baselines/baseline-v7/queue-realignment') {
        currentVersions = currentVersions.map((version) =>
          version.id === 'baseline-v7' ? { ...version, status: 'pending_realign' } : version,
        )
        currentDetails['baseline-v7'] = {
          ...currentDetails['baseline-v7'],
          status: 'pending_realign',
        }
        return deepClone(currentDetails['baseline-v7'])
      }

      throw new Error(`Unexpected POST ${url}`)
    })

    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForText(container, ['声明开始重排', '已确认'])
    await clickButtonByText(container, '声明开始重排')

    await waitForCondition(() =>
      mockedApiPost.mock.calls.some(([url]) => url === '/api/task-baselines/baseline-v7/queue-realignment'),
    )
    await waitForText(container, ['待重排', '当前版本已进入待重排态'])
    expect(container.querySelector('[data-testid="baseline-resolve-realignment"]')).toBeTruthy()

    cleanup()
  })

  it('shows the version-expired concurrent state', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline?confirm_state=stale']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForText(container, ['进入确认发布'])
    await clickButtonByText(container, '进入确认发布')
    await waitForText(document.body, ['版本过期并发态', '当前版本已过期'])

    const confirmButton = Array.from(document.body.querySelectorAll('button'))
      .filter((button) => button.textContent?.includes('确认发布'))
      .at(-1) as HTMLButtonElement | undefined
    expect(confirmButton?.disabled).toBe(true)

    cleanup()
  })

  it('shows the publish-failed state with retry entry', async () => {
    const { container, cleanup } = mount(
      <MemoryRouter initialEntries={['/projects/project-1/planning/baseline?confirm_state=failed']}>
        <Routes>
          <Route path="/projects/:id/planning/baseline" element={<BaselinePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitForText(container, ['进入确认发布'])
    await clickButtonByText(container, '进入确认发布')
    await waitForText(document.body, ['发布失败态', '上次发布失败', '重新尝试'])

    cleanup()
  })
})
